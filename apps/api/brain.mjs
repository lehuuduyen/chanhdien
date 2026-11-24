// Khu Trí tuệ (app 🧠 trong điện thoại chánh điện): "Đề hôm nay" 5 trò (ai cũng cùng đề trong ngày theo GARDEN_TIMEZONE)
// và "Test IQ vui" 30 câu (24 câu khó) / 20 phút ra chỉ số tham khảo. Đề sinh ở brain-puzzles.mjs; server ra đề, giữ đáp án, chấm.
// Không thưởng xu (giống Bấm Giờ): thành viên được lưu điểm ngày, chuỗi ngày làm đủ 5 trò, chỉ số tốt nhất, lên Bảng
// vàng. Khách chơi được hết, không lưu điểm ngày; bài Test IQ của khách vẫn được tính vào mẫu so sánh (không lên Bảng
// vàng). Mỗi trò Đề hôm nay chỉ lần đầu trong ngày được tính điểm, các lần sau là chơi tập.
// Chống gian lận ở mức trò chơi không có tiền: đề mỗi ngày lấy từ HMAC(secret, ngày) nên không đoán trước được đáp án,
// đáp án không gửi trình duyệt trước khi nộp, mỗi đề nộp một lần, làm nhanh hơn sức người hoặc quá giờ thì không nhận.
//   GET  /api/v1/brain                         → { day, games, limits, me, board, players }
//   POST /api/v1/brain/round  { game }          → { ok, roundId, game, limitMs, problem, practice, previous }
//   POST /api/v1/brain/answer { roundId, answers } → daily: { ok, points, correct, wrong, total, solution, percent, saved,
//                                                  practice, today, streak } · iq: { ok, correct, total, index, percent,
//                                                  calibrated, strengths, solution, best } · duel: { ok, correct, total,
//                                                  ms, solution }
// Đấu trí 1–1 (khiêu chiến trong phòng, máy realtime làm trọng tài): máy realtime tạo trận qua API nội bộ — mỗi bên người
// một đề riêng (cùng seed), mã đề chỉ gửi riêng cho người đó; trang lấy đề rồi nộp như các bài khác; máy realtime hỏi
// kết quả để phân thắng thua. Đáp án không đi qua phòng.
//   POST /api/v1/brain/duel { roundId }         → { ok, problem, limitMs, elapsed }
//   POST /internal/brain/duel { challengeId, from, to } (from / to: { accountId } hoặc { bot: true }) → { ok, rounds, limitMs, total }
//   GET  /internal/brain/duel?challengeId=…     → { ok, from: { done, correct, ms } | null, to: … }
// Đố vui nhiều người: máy realtime xin một bộ đề kèm đáp án (giữ ở máy realtime, chỉ phát đề từng câu).
//   POST /internal/brain/quiz                   → { ok, items: [{ problem, answer }] }
//   POST /internal/brain/quiz/result { key, players: [{ accountId, displayName, won }] } → { ok, saved } (Bảng vàng Đố vui)
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { gardenDay } from '@chanh-dien/garden';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { BRAIN_GAMES, BRAIN_LIMITS, BRAIN_SLACK_MS, buildPuzzle, buildQuizRoom, DUEL_ITEMS, gradePuzzle, IQ_ITEMS, iqIndex, percentileOf } from './brain-puzzles.mjs';
import { json } from './http.mjs';
import { requestIpHash } from './moderation.mjs';

const ROUND_LIMIT = [40, 60_000];
const IQ_ROUND_LIMIT = [12, 3_600_000];
const PRUNE_MS = 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const BOARD_LIMIT = 10;
const HISTORY_LIMIT = 10;
const IQ_SAMPLE_DAYS = 90;
const IQ_BOARD_DAYS = 30;
// Bảng vàng Đố vui: số ván thắng trong 7 ngày gần nhất.
const QUIZ_BOARD_DAYS = 7;
const QUIZ_KEY = /^quiz-[A-Za-z0-9:_-]{1,120}$/;
// Hiện "cao hơn X % người chơi hôm nay" khi đã có ít nhất ngần ấy người khác làm trò đó.
const DAILY_PERCENT_MIN = 5;
const STATUS = { INVALID: 400, ROUND_NOT_FOUND: 404, ROUND_EXPIRED: 409, TOO_FAST: 409 };
const CHALLENGE_ID = /^g-[0-9a-f-]{36}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,80}$/;

const previousDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

export function createBrainStore({ db, secret, timeZone = 'America/Los_Angeles', now = Date.now, random = () => randomInt(0, 2 ** 32 - 1) }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brain_rounds (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      game TEXT NOT NULL,
      day TEXT NOT NULL,
      seed INTEGER NOT NULL,
      practice INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      finished INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS brain_rounds_created ON brain_rounds (created_at);
    CREATE TABLE IF NOT EXISTS brain_daily (
      account_id TEXT NOT NULL,
      day TEXT NOT NULL,
      game TEXT NOT NULL,
      points INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (account_id, day, game)
    );
    CREATE INDEX IF NOT EXISTS brain_daily_day ON brain_daily (day, game);
    CREATE TABLE IF NOT EXISTS brain_iq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      display_name TEXT NOT NULL,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 20,
      iq INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS brain_iq_at ON brain_iq (at);
    CREATE TABLE IF NOT EXISTS brain_duels (
      challenge_id TEXT PRIMARY KEY,
      seed INTEGER NOT NULL,
      from_round TEXT,
      to_round TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brain_duel_results (
      round_id TEXT PRIMARY KEY,
      correct INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brain_quiz_results (
      game_key TEXT NOT NULL,
      account_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      won INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (game_key, account_id)
    );
    CREATE INDEX IF NOT EXISTS brain_quiz_results_at ON brain_quiz_results (at);
    CREATE INDEX IF NOT EXISTS brain_iq_account ON brain_iq (account_id, at);
  `);
  // Bài cũ có 20 câu; giữ tổng số để quy đổi mẫu so sánh đúng sau khi bài tăng lên 30 câu.
  const iqColumns = new Set(db.prepare('PRAGMA table_info(brain_iq)').all().map((column) => column.name));
  if (!iqColumns.has('total')) db.exec('ALTER TABLE brain_iq ADD COLUMN total INTEGER NOT NULL DEFAULT 20');
  const query = {
    insertRound: db.prepare('INSERT INTO brain_rounds (id, account_id, game, day, seed, practice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    round: db.prepare('SELECT * FROM brain_rounds WHERE id = ?'),
    finish: db.prepare('UPDATE brain_rounds SET finished = 1 WHERE id = ? AND finished = 0'),
    prune: db.prepare('DELETE FROM brain_rounds WHERE created_at < ?'),
    daily: db.prepare('SELECT points FROM brain_daily WHERE account_id = ? AND day = ? AND game = ?'),
    dailyAll: db.prepare('SELECT game, points FROM brain_daily WHERE account_id = ? AND day = ?'),
    saveDaily: db.prepare('INSERT OR IGNORE INTO brain_daily (account_id, day, game, points, display_name, at) VALUES (?, ?, ?, ?, ?, ?)'),
    dayScores: db.prepare('SELECT points FROM brain_daily WHERE day = ? AND game = ? AND account_id != ?'),
    completeDays: db.prepare('SELECT day FROM brain_daily WHERE account_id = ? GROUP BY day HAVING COUNT(*) >= ? ORDER BY day DESC LIMIT 400'),
    boardToday: db.prepare(`SELECT MAX(display_name) AS name, SUM(points) AS total, COUNT(*) AS games, MAX(at) AS last
      FROM brain_daily WHERE day = ? GROUP BY account_id ORDER BY total DESC, last ASC LIMIT ?`),
    playersToday: db.prepare('SELECT COUNT(DISTINCT account_id) AS count FROM brain_daily WHERE day = ?'),
    iqSample: db.prepare('SELECT correct, total FROM brain_iq WHERE at > ?'),
    saveIq: db.prepare('INSERT INTO brain_iq (account_id, display_name, correct, total, iq, ms, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    iqHistory: db.prepare('SELECT iq, correct, total, ms, at FROM brain_iq WHERE account_id = ? ORDER BY at DESC, id DESC LIMIT ?'),
    iqBest: db.prepare('SELECT MAX(iq) AS best FROM brain_iq WHERE account_id = ?'),
    iqBoard: db.prepare(`SELECT MAX(display_name) AS name, MAX(iq) AS best, MIN(at) AS first FROM brain_iq
      WHERE account_id IS NOT NULL AND at > ? GROUP BY account_id ORDER BY best DESC, first ASC LIMIT ?`),
    insertDuel: db.prepare('INSERT OR IGNORE INTO brain_duels (challenge_id, seed, from_round, to_round, created_at) VALUES (?, ?, ?, ?, ?)'),
    duel: db.prepare('SELECT * FROM brain_duels WHERE challenge_id = ?'),
    duelResult: db.prepare('SELECT correct, ms FROM brain_duel_results WHERE round_id = ?'),
    saveDuelResult: db.prepare('INSERT OR IGNORE INTO brain_duel_results (round_id, correct, ms, at) VALUES (?, ?, ?, ?)'),
    pruneDuels: db.prepare('DELETE FROM brain_duels WHERE created_at < ?'),
    pruneDuelResults: db.prepare('DELETE FROM brain_duel_results WHERE at < ?'),
    saveQuiz: db.prepare('INSERT OR IGNORE INTO brain_quiz_results (game_key, account_id, display_name, won, at) VALUES (?, ?, ?, ?, ?)'),
    quizBoard: db.prepare(`SELECT MAX(display_name) AS name, SUM(won) AS wins, COUNT(*) AS plays, MIN(at) AS first FROM brain_quiz_results
      WHERE at > ? GROUP BY account_id HAVING wins > 0 ORDER BY wins DESC, plays ASC, first ASC LIMIT ?`),
    quizMine: db.prepare('SELECT COALESCE(SUM(won), 0) AS wins, COUNT(*) AS plays FROM brain_quiz_results WHERE account_id = ? AND at > ?'),
  };
  let prunedAt = 0;
  // Đề, trận đấu trí cũ hơn một ngày bị xóa (mỗi giờ dọn một lần).
  function prune(at) {
    if (at - prunedAt <= 3_600_000) return;
    prunedAt = at;
    query.prune.run(at - PRUNE_MS);
    query.pruneDuels.run(at - PRUNE_MS);
    query.pruneDuelResults.run(at - PRUNE_MS);
  }
  const today = () => gardenDay(now(), timeZone);
  // Đề hôm nay: mọi người cùng đề trong ngày, không đoán trước được (cần secret của server).
  const dailySeed = (day, game) => createHmac('sha256', secret).update(`brain:${day}:${game}`).digest().readUInt32BE(0);

  function owned(roundId, accountId) {
    if (typeof roundId !== 'string' || !/^[0-9a-f]{32}$/.test(roundId)) return null;
    const round = query.round.get(roundId);
    return round && (round.account_id || null) === (accountId || null) ? round : null;
  }

  // Chuỗi ngày liên tiếp làm đủ 5 trò, tính tới hôm nay (hôm nay chưa xong thì tính tới hôm qua).
  function streak(accountId) {
    const days = query.completeDays.all(accountId, BRAIN_GAMES.length).map((row) => row.day);
    let expected = today();
    if (days[0] !== expected) expected = previousDay(expected);
    let count = 0;
    for (const day of days) {
      if (day !== expected) break;
      count += 1;
      expected = previousDay(expected);
    }
    return count;
  }

  const todayOf = (accountId, day) => Object.fromEntries(query.dailyAll.all(accountId, day).map((row) => [row.game, row.points]));

  return {
    view(accountId) {
      const day = today();
      const board = {
        today: query.boardToday.all(day, BOARD_LIMIT).map((row) => ({ name: row.name, points: row.total, games: row.games })),
        iq: query.iqBoard.all(now() - IQ_BOARD_DAYS * DAY_MS, BOARD_LIMIT).map((row) => ({ name: row.name, index: row.best })),
        quiz: query.quizBoard.all(now() - QUIZ_BOARD_DAYS * DAY_MS, BOARD_LIMIT).map((row) => ({ name: row.name, wins: row.wins, plays: row.plays })),
      };
      const players = query.playersToday.get(day).count;
      if (!accountId) return { day, me: null, board, players };
      return {
        day,
        me: {
          today: todayOf(accountId, day),
          streak: streak(accountId),
          bestIq: query.iqBest.get(accountId).best ?? null,
          iq: query.iqHistory.all(accountId, HISTORY_LIMIT).map((row) => ({ index: row.iq, correct: row.correct, total: row.total, ms: row.ms, at: row.at })),
          quiz: { ...query.quizMine.get(accountId, now() - QUIZ_BOARD_DAYS * DAY_MS) },
        },
        board,
        players,
      };
    },

    round({ accountId, game }) {
      if (game !== 'iq' && !BRAIN_GAMES.includes(game)) return { ok: false, code: 'INVALID' };
      const at = now();
      prune(at);
      const day = today();
      const seed = game === 'iq' ? random() : dailySeed(day, game);
      const previous = game !== 'iq' && accountId ? query.daily.get(accountId, day, game)?.points ?? null : null;
      // Khách luôn là chơi tập (không lưu); thành viên đã có điểm hôm nay ở trò này cũng vậy.
      const practice = game !== 'iq' && (!accountId || previous !== null);
      const id = randomBytes(16).toString('hex');
      query.insertRound.run(id, accountId || null, game, day, seed, practice ? 1 : 0, at);
      return { ok: true, roundId: id, game, limitMs: BRAIN_LIMITS[game], problem: buildPuzzle(game, seed).problem, practice, previous };
    },

    // ---- Đố vui nhiều người ----
    // Máy realtime báo kết quả một ván (chỉ thành viên): won = trụ tới cuối. Gửi lại cùng key không tính hai lần.
    quizResult({ key, players }) {
      if (typeof key !== 'string' || !QUIZ_KEY.test(key) || !Array.isArray(players) || players.length > 40) return { ok: false, code: 'INVALID' };
      const valid = players.every((player) => player && typeof player === 'object' && typeof player.accountId === 'string'
        && ACCOUNT_ID.test(player.accountId) && typeof player.won === 'boolean');
      if (!valid) return { ok: false, code: 'INVALID' };
      const at = now();
      let saved = 0;
      for (const player of players) {
        saved += query.saveQuiz.run(key, player.accountId, String(player.displayName || '?').slice(0, 40), player.won ? 1 : 0, at).changes;
      }
      return { ok: true, saved };
    },

    // ---- Đấu trí 1–1 ----
    // Máy realtime tạo trận khi người được mời nhận lời. Bên bot không có đề (máy realtime tự định kết quả bot). Gọi lại
    // cùng challengeId trả lại đúng trận cũ (máy realtime gửi lại sau lỗi mạng).
    duelCreate({ challengeId, from, to }) {
      if (typeof challengeId !== 'string' || !CHALLENGE_ID.test(challengeId)) return { ok: false, code: 'INVALID' };
      const sides = { from, to };
      const validSide = (side) => side && typeof side === 'object'
        && (side.bot === true || side.accountId === null || (typeof side.accountId === 'string' && ACCOUNT_ID.test(side.accountId)));
      if (!validSide(from) || !validSide(to) || (from.bot && to.bot)) return { ok: false, code: 'INVALID' };
      const roundsOf = (row) => ({ ...(row.from_round ? { from: row.from_round } : {}), ...(row.to_round ? { to: row.to_round } : {}) });
      const existing = query.duel.get(challengeId);
      if (existing) return { ok: true, rounds: roundsOf(existing), limitMs: BRAIN_LIMITS.duel, total: DUEL_ITEMS };
      const at = now();
      prune(at);
      const seed = random();
      const day = today();
      const rounds = {};
      for (const name of ['from', 'to']) {
        if (sides[name].bot) continue;
        rounds[name] = randomBytes(16).toString('hex');
        query.insertRound.run(rounds[name], sides[name].accountId || null, 'duel', day, seed, 0, at);
      }
      query.insertDuel.run(challengeId, seed, rounds.from || null, rounds.to || null, at);
      return { ok: true, rounds, limitMs: BRAIN_LIMITS.duel, total: DUEL_ITEMS };
    },

    // Kết quả từng bên (null: bên bot). done = đã nộp bài.
    duelStatus(challengeId) {
      if (typeof challengeId !== 'string' || !CHALLENGE_ID.test(challengeId)) return { ok: false, code: 'INVALID' };
      const duel = query.duel.get(challengeId);
      if (!duel) return { ok: false, code: 'ROUND_NOT_FOUND' };
      const side = (roundId) => {
        if (!roundId) return null;
        const row = query.duelResult.get(roundId);
        return row ? { done: true, correct: row.correct, ms: row.ms } : { done: false };
      };
      return { ok: true, from: side(duel.from_round), to: side(duel.to_round) };
    },

    // Trang lấy đề của mình bằng mã đề máy realtime gửi riêng. elapsed: thời gian đã trôi từ lúc tạo trận.
    duelProblem({ accountId, roundId }) {
      const round = owned(roundId, accountId);
      if (!round || round.game !== 'duel' || round.finished) return { ok: false, code: 'ROUND_NOT_FOUND' };
      const elapsed = now() - round.created_at;
      if (elapsed > BRAIN_LIMITS.duel + BRAIN_SLACK_MS) return { ok: false, code: 'ROUND_EXPIRED' };
      return { ok: true, problem: buildPuzzle('duel', round.seed).problem, limitMs: BRAIN_LIMITS.duel, elapsed };
    },

    answer({ accountId, displayName, roundId, answers }) {
      const round = owned(roundId, accountId);
      if (!round || round.finished) return { ok: false, code: 'ROUND_NOT_FOUND' };
      if (!Array.isArray(answers)) return { ok: false, code: 'INVALID' };
      // Dùng một lần: gửi lại / gửi song song không tính hai lượt.
      if (!query.finish.run(roundId).changes) return { ok: false, code: 'ROUND_NOT_FOUND' };
      const at = now();
      const elapsed = at - round.created_at;
      if (elapsed > BRAIN_LIMITS[round.game] + BRAIN_SLACK_MS) return { ok: false, code: 'ROUND_EXPIRED' };
      const graded = gradePuzzle(round.game, round.seed, answers, elapsed);
      if (!graded.ok) return graded;
      const name = String(displayName || '').slice(0, 40);

      // Đấu trí: chỉ lưu kết quả cho máy realtime phân thắng thua; đáp án trả sau khi nộp để xem lại câu sai.
      if (round.game === 'duel') {
        const ms = Math.round(elapsed);
        query.saveDuelResult.run(roundId, graded.correct, ms, at);
        return { ok: true, game: 'duel', correct: graded.correct, total: DUEL_ITEMS, ms, solution: graded.solution };
      }

      if (round.game === 'iq') {
        const sample = query.iqSample.all(at - IQ_SAMPLE_DAYS * DAY_MS)
          .map((row) => (row.correct * IQ_ITEMS) / Math.max(1, row.total || 20));
        const result = iqIndex(graded.correct, sample);
        query.saveIq.run(accountId || null, name || '?', graded.correct, IQ_ITEMS, result.index, Math.round(elapsed), at);
        return {
          ok: true, game: 'iq', correct: graded.correct, total: IQ_ITEMS, index: result.index, percent: result.percent, calibrated: result.calibrated,
          // Số câu đúng theo 6 loại (mỗi loại 5 câu) và thời gian làm bài.
          strengths: { ...graded.byKind, seconds: Math.round(elapsed / 1000) },
          solution: graded.solution, best: accountId ? query.iqBest.get(accountId).best : null,
        };
      }

      const saved = Boolean(accountId) && !round.practice && round.day === today();
      if (saved) query.saveDaily.run(accountId, round.day, round.game, graded.points, name || '?', at);
      const others = query.dayScores.all(round.day, round.game, accountId || '').map((row) => row.points);
      const percent = others.length >= DAILY_PERCENT_MIN ? Math.round(percentileOf(graded.points, others) * 100) : null;
      return {
        ok: true, game: round.game, points: graded.points, correct: graded.correct, wrong: graded.wrong, total: graded.total,
        solution: graded.solution, percent, saved, practice: Boolean(round.practice),
        today: accountId ? todayOf(accountId, round.day) : null, streak: accountId ? streak(accountId) : 0,
      };
    },
  };
}

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleBrainRequest(req, res, pathname, options) {
  if (pathname === '/internal/brain/quiz') {
    if (!options.brain) return json(req, res, 503, { error: 'brain_disabled' }), true;
    if (!internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    return json(req, res, 200, { ok: true, items: buildQuizRoom(randomInt(0, 2 ** 32 - 1)) }), true;
  }
  if (pathname === '/internal/brain/quiz/result') {
    if (!options.brain) return json(req, res, 503, { error: 'brain_disabled' }), true;
    if (!internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const input = await body(req, res);
    if (!input) return true;
    const result = options.brain.quizResult({ key: input.key, players: input.players });
    return json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result), true;
  }
  if (pathname === '/internal/brain/duel') {
    const store = options.brain;
    if (!store) return json(req, res, 503, { error: 'brain_disabled' }), true;
    if (!internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (req.method === 'GET') {
      const result = store.duelStatus(new URL(req.url, 'http://local').searchParams.get('challengeId'));
      return json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result), true;
    }
    if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const input = await body(req, res);
    if (!input) return true;
    const result = store.duelCreate({ challengeId: input.challengeId, from: input.from, to: input.to });
    return json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result), true;
  }
  if (pathname !== '/api/v1/brain' && !pathname.startsWith('/api/v1/brain/')) return false;
  const store = options.brain;
  if (!store) return json(req, res, 503, { error: 'brain_disabled' }), true;
  const account = currentAccount(req, options);
  if (pathname === '/api/v1/brain') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    return json(req, res, 200, { games: BRAIN_GAMES, limits: BRAIN_LIMITS, ...store.view(account?.id) }), true;
  }
  const action = pathname.slice('/api/v1/brain/'.length);
  if (!['round', 'answer', 'duel'].includes(action)) return json(req, res, 404, { error: 'not_found' }), true;
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  const input = await body(req, res);
  if (!input) return true;
  const who = account ? `account:${account.id}` : `ip:${requestIpHash(req, options)}`;
  if (action === 'round') {
    if (!allow(options, `brain:${who}`, ROUND_LIMIT)) return json(req, res, 429, { ok: false, code: 'RATE_LIMITED' }), true;
    if (input.game === 'iq' && !allow(options, `brain-iq:${who}`, IQ_ROUND_LIMIT)) return json(req, res, 429, { ok: false, code: 'RATE_LIMITED' }), true;
  }
  const accountId = account?.id || null;
  const result = action === 'round' ? store.round({ accountId, game: input.game })
    : action === 'duel' ? store.duelProblem({ accountId, roundId: input.roundId })
      : store.answer({ accountId, displayName: account?.displayName, roundId: input.roundId, answers: input.answers });
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
