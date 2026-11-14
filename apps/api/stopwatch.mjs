// Game Bấm Giờ (nút ⏱ cạnh Trốn tìm ở chánh điện): mục tiêu ngẫu nhiên 00:01–10:00 (phần trăm giây), bấm Bắt đầu rồi
// Dừng; lệch trong ngưỡng của cấp là trúng. Năm cấp (STOPWATCH trong room rules), cấp sau mở khi đã trúng cấp trước.
// Không thưởng xu: thành viên được lưu lịch sử bấm trúng, số lượt / số lần trúng từng cấp và lên Bảng vàng; khách chơi
// thử cấp 1, không lưu gì.
//
// Đồng hồ chạy ở máy người chơi (chính xác tới 1/100 giây, mạng không làm lệch). Server ra đề (số ngẫu nhiên của server),
// ghi mốc lúc nhận Bắt đầu và lúc nhận Dừng theo đồng hồ server, chỉ nhận thời gian máy báo nếu khớp thời gian thật trong
// khoảng trễ mạng (EARLY_SLACK_MS / LATE_SLACK_MS): không thể chờ 1 giây mà báo đã bấm ở giây thứ 5. Game không có tiền
// nên không cố chặn người dùng script bấm hộ.
//   GET  /api/v1/stopwatch                              → { levels, me: { unlocked, stats, history } | null, recent }
//   POST /api/v1/stopwatch/round { level }              → { ok, roundId, level, target }
//   POST /api/v1/stopwatch/start { roundId }            → { ok }
//   POST /api/v1/stopwatch/stop  { roundId, elapsed }   → { ok, hit, diff, target, elapsed, level, unlocked, newLevel }
import { randomBytes, randomInt } from 'node:crypto';
import { STOPWATCH } from '@chanh-dien/room-rules';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';
import { requestIpHash } from './moderation.mjs';

// Thời gian máy báo được dài hơn thời gian server đo tối đa EARLY_SLACK_MS (yêu cầu Bắt đầu tới server muộn hơn lúc
// bấm), ngắn hơn tối đa LATE_SLACK_MS (yêu cầu Dừng tới muộn hơn lúc bấm, mạng điện thoại chậm).
export const EARLY_SLACK_MS = 400;
export const LATE_SLACK_MS = 2_500;
// Đề chưa bấm Bắt đầu trong ROUND_TTL_MS thì hết hạn; đề cũ hơn một ngày bị xóa.
const ROUND_TTL_MS = 10 * 60_000;
const PRUNE_MS = 24 * 3_600_000;
const HISTORY_LIMIT = 30;
const RECENT_LIMIT = 15;
const ROUND_LIMIT = [40, 60_000];
const STATUS = { INVALID: 400, NOT_SIGNED_IN: 401, LEVEL_LOCKED: 403, ROUND_NOT_FOUND: 404, ROUND_EXPIRED: 409, NOT_STARTED: 409, ALREADY_STARTED: 409, TIMING_MISMATCH: 409 };

const levelOf = (id) => STOPWATCH.levels.find((level) => level.id === id) || null;

export function createStopwatchStore({ db, now = Date.now, random = (min, max) => randomInt(min, max + 1) }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stopwatch_rounds (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      level INTEGER NOT NULL,
      target INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS stopwatch_rounds_created ON stopwatch_rounds (created_at);
    CREATE TABLE IF NOT EXISTS stopwatch_stats (
      account_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      plays INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account_id, level)
    );
    CREATE TABLE IF NOT EXISTS stopwatch_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      level INTEGER NOT NULL,
      target INTEGER NOT NULL,
      elapsed INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS stopwatch_hits_account ON stopwatch_hits (account_id, at);
    CREATE INDEX IF NOT EXISTS stopwatch_hits_at ON stopwatch_hits (at);
  `);
  const query = {
    insertRound: db.prepare('INSERT INTO stopwatch_rounds (id, account_id, level, target, created_at) VALUES (?, ?, ?, ?, ?)'),
    round: db.prepare('SELECT * FROM stopwatch_rounds WHERE id = ?'),
    start: db.prepare('UPDATE stopwatch_rounds SET started_at = ? WHERE id = ? AND started_at IS NULL AND finished = 0'),
    finish: db.prepare('UPDATE stopwatch_rounds SET finished = 1 WHERE id = ? AND finished = 0'),
    prune: db.prepare('DELETE FROM stopwatch_rounds WHERE created_at < ?'),
    stats: db.prepare('SELECT level, plays, hits FROM stopwatch_stats WHERE account_id = ? ORDER BY level'),
    play: db.prepare(`INSERT INTO stopwatch_stats (account_id, level, plays, hits) VALUES (?, ?, 1, ?)
      ON CONFLICT (account_id, level) DO UPDATE SET plays = plays + 1, hits = hits + excluded.hits`),
    hit: db.prepare('INSERT INTO stopwatch_hits (account_id, display_name, level, target, elapsed, at) VALUES (?, ?, ?, ?, ?, ?)'),
    history: db.prepare('SELECT level, target, elapsed, at FROM stopwatch_hits WHERE account_id = ? ORDER BY at DESC, id DESC LIMIT ?'),
    recent: db.prepare('SELECT display_name, level, target, elapsed, at FROM stopwatch_hits ORDER BY at DESC, id DESC LIMIT ?'),
  };
  let prunedAt = 0;

  // Cấp cao nhất được chơi: 1 + cấp cao nhất đã trúng (tối đa số cấp). Khách: chỉ cấp 1.
  function unlocked(accountId) {
    if (!accountId) return 1;
    const best = query.stats.all(accountId).filter((row) => row.hits > 0).reduce((top, row) => Math.max(top, row.level), 0);
    return Math.min(STOPWATCH.levels.length, best + 1);
  }

  function owned(roundId, accountId) {
    if (typeof roundId !== 'string' || !/^[0-9a-f]{32}$/.test(roundId)) return null;
    const round = query.round.get(roundId);
    return round && (round.account_id || null) === (accountId || null) ? round : null;
  }

  return {
    unlocked,
    view(accountId) {
      const recent = query.recent.all(RECENT_LIMIT).map((row) => ({ name: row.display_name, level: row.level, target: row.target, elapsed: row.elapsed, at: row.at }));
      if (!accountId) return { me: null, recent };
      return {
        me: {
          unlocked: unlocked(accountId),
          stats: query.stats.all(accountId).map((row) => ({ level: row.level, plays: row.plays, hits: row.hits })),
          history: query.history.all(accountId, HISTORY_LIMIT).map((row) => ({ level: row.level, target: row.target, elapsed: row.elapsed, at: row.at })),
        },
        recent,
      };
    },
    // Ra đề: số ngẫu nhiên của server trong [min, max] phần trăm giây.
    round({ accountId, level }) {
      if (!Number.isSafeInteger(level) || !levelOf(level)) return { ok: false, code: 'INVALID' };
      if (level > unlocked(accountId)) return { ok: false, code: accountId ? 'LEVEL_LOCKED' : 'NOT_SIGNED_IN' };
      const at = now();
      if (at - prunedAt > 3_600_000) {
        prunedAt = at;
        query.prune.run(at - PRUNE_MS);
      }
      const id = randomBytes(16).toString('hex');
      const target = random(STOPWATCH.min, STOPWATCH.max);
      query.insertRound.run(id, accountId || null, level, target, at);
      return { ok: true, roundId: id, level, target };
    },
    start({ accountId, roundId }) {
      const round = owned(roundId, accountId);
      if (!round || round.finished) return { ok: false, code: 'ROUND_NOT_FOUND' };
      if (round.started_at !== null) return { ok: false, code: 'ALREADY_STARTED' };
      const at = now();
      if (at - round.created_at > ROUND_TTL_MS) return { ok: false, code: 'ROUND_EXPIRED' };
      query.start.run(at, roundId);
      return { ok: true };
    },
    // elapsed: phần trăm giây máy người chơi đo từ lúc bấm Bắt đầu tới lúc bấm Dừng.
    stop({ accountId, displayName, roundId, elapsed }) {
      const round = owned(roundId, accountId);
      if (!round || round.finished) return { ok: false, code: 'ROUND_NOT_FOUND' };
      if (round.started_at === null) return { ok: false, code: 'NOT_STARTED' };
      if (!Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed > STOPWATCH.timeout) return { ok: false, code: 'INVALID' };
      // Dùng một lần: gửi lại / gửi song song không tính hai lượt.
      if (!query.finish.run(roundId).changes) return { ok: false, code: 'ROUND_NOT_FOUND' };
      const real = now() - round.started_at;
      const claimed = elapsed * 10;
      if (claimed - real > EARLY_SLACK_MS || real - claimed > LATE_SLACK_MS) return { ok: false, code: 'TIMING_MISMATCH' };
      const level = levelOf(round.level);
      const diff = elapsed - round.target;
      const hit = Math.abs(diff) <= level.tolerance;
      const before = unlocked(accountId);
      if (accountId) {
        query.play.run(accountId, round.level, hit ? 1 : 0);
        if (hit) query.hit.run(accountId, String(displayName || '').slice(0, 40), round.level, round.target, elapsed, now());
      }
      const after = unlocked(accountId);
      return { ok: true, hit, diff, target: round.target, elapsed, level: round.level, unlocked: after, newLevel: after > before ? after : null };
    },
  };
}

export async function handleStopwatchRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/stopwatch' && !pathname.startsWith('/api/v1/stopwatch/')) return false;
  const store = options.stopwatch;
  if (!store) return json(req, res, 503, { error: 'stopwatch_disabled' }), true;
  const account = currentAccount(req, options);
  if (pathname === '/api/v1/stopwatch') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    return json(req, res, 200, { levels: STOPWATCH.levels, min: STOPWATCH.min, max: STOPWATCH.max, timeout: STOPWATCH.timeout, ...store.view(account?.id) }), true;
  }
  const action = pathname.slice('/api/v1/stopwatch/'.length);
  if (!['round', 'start', 'stop'].includes(action)) return json(req, res, 404, { error: 'not_found' }), true;
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  const who = account ? `account:${account.id}` : `ip:${requestIpHash(req, options)}`;
  if (action === 'round' && !allow(options, `stopwatch:${who}`, ROUND_LIMIT)) return json(req, res, 429, { ok: false, code: 'RATE_LIMITED' }), true;
  const input = await body(req, res);
  if (!input) return true;
  const accountId = account?.id || null;
  const result = action === 'round' ? store.round({ accountId, level: input.level })
    : action === 'start' ? store.start({ accountId, roundId: input.roundId })
      : store.stop({ accountId, displayName: account?.displayName, roundId: input.roundId, elapsed: input.elapsed });
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
