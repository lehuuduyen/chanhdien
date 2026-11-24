// Đua xe (phòng duaxe, trang /dua-xe.html): Bảng vàng. Không có xu. Máy realtime làm trọng tài (đếm vòng, chặn gói tin vô
// lý) rồi báo từng vòng hợp lệ và kết quả mỗi cuộc đua của thành viên qua API nội bộ; khách và bot không được ghi.
//   GET  /api/v1/race → { day, today, week, all: [{ name, ms }], wins: [{ name, wins, races }], me: { … } | null }
//   POST /internal/race/lap { key, accountId, displayName, lapMs, mode }                         → { ok, saved }
//   POST /internal/race/result { raceId, cars, results: [{ accountId, displayName, pos, laps, dnf, totalMs?, bestMs? }] }
//                                                                                                → { ok, saved }
// Vòng cũ hơn KEEP_DAYS ngày bị xóa, trừ vòng nhanh nhất mọi lúc của từng người; kết quả giữ RESULT_DAYS ngày.
import { timingSafeEqual } from 'node:crypto';
import { gardenDay } from '@chanh-dien/garden';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { body, currentAccount } from './auth.mjs';
import { json } from './http.mjs';

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^[A-Za-z0-9_.:-]{6,120}$/;
const RACE_ID = /^rc-[a-z0-9-]{4,76}$/;
const DAY_MS = 86_400_000;
const KEEP_DAYS = 8;
const RESULT_DAYS = 30;
const BOARD = 10;
// Vòng ngắn hơn / dài hơn mức này chắc chắn sai (đường đua hiện tại ~1,7 km, vòng lý tưởng ~34 giây).
const LAP_MIN_MS = 15_000;
const LAP_MAX_MS = 600_000;
const PRUNE_EVERY_MS = 3_600_000;

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Ẩn danh';

export function createRaceStore({ db, now = Date.now, timeZone = 'America/Los_Angeles' }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_laps (
      key TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      lap_ms INTEGER NOT NULL,
      mode TEXT NOT NULL,
      day TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS race_laps_day ON race_laps (day, lap_ms);
    CREATE INDEX IF NOT EXISTS race_laps_at ON race_laps (at, lap_ms);
    CREATE INDEX IF NOT EXISTS race_laps_account ON race_laps (account_id, lap_ms);
    CREATE TABLE IF NOT EXISTS race_results (
      race_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      pos INTEGER NOT NULL,
      cars INTEGER NOT NULL,
      laps INTEGER NOT NULL,
      dnf INTEGER NOT NULL,
      total_ms INTEGER,
      best_ms INTEGER,
      at INTEGER NOT NULL,
      PRIMARY KEY (race_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS race_results_at ON race_results (at);
  `);
  const query = {
    lap: db.prepare('INSERT OR IGNORE INTO race_laps (key, account_id, display_name, lap_ms, mode, day, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    result: db.prepare(`INSERT OR IGNORE INTO race_results (race_id, account_id, display_name, pos, cars, laps, dnf, total_ms, best_ms, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    // Mỗi người một dòng: vòng nhanh nhất (tên lấy theo đúng vòng đó).
    boardDay: db.prepare(`SELECT display_name AS name, MIN(lap_ms) AS ms FROM race_laps WHERE day = ? GROUP BY account_id
      ORDER BY ms ASC LIMIT ${BOARD}`),
    boardSince: db.prepare(`SELECT display_name AS name, MIN(lap_ms) AS ms FROM race_laps WHERE at >= ? GROUP BY account_id
      ORDER BY ms ASC LIMIT ${BOARD}`),
    wins: db.prepare(`SELECT MAX(display_name) AS name, SUM(pos = 1) AS wins, COUNT(*) AS races FROM race_results WHERE at >= ?
      GROUP BY account_id HAVING wins > 0 ORDER BY wins DESC, races ASC LIMIT ${BOARD}`),
    myBestDay: db.prepare('SELECT MIN(lap_ms) AS ms FROM race_laps WHERE account_id = ? AND day = ?'),
    myBestSince: db.prepare('SELECT MIN(lap_ms) AS ms FROM race_laps WHERE account_id = ? AND at >= ?'),
    myResults: db.prepare('SELECT SUM(pos = 1) AS wins, COUNT(*) AS races FROM race_results WHERE account_id = ? AND at >= ?'),
    pruneLaps: db.prepare(`DELETE FROM race_laps WHERE at < ? AND key NOT IN (
      SELECT key FROM (SELECT key, MIN(lap_ms) FROM race_laps GROUP BY account_id))`),
    pruneResults: db.prepare('DELETE FROM race_results WHERE at < ?'),
  };
  let prunedAt = 0;
  const prune = () => {
    const at = now();
    if (at - prunedAt < PRUNE_EVERY_MS) return;
    prunedAt = at;
    query.pruneLaps.run(at - KEEP_DAYS * DAY_MS);
    query.pruneResults.run(at - RESULT_DAYS * DAY_MS);
  };
  const rows = (list) => list.map((row) => ({ name: row.name, ms: row.ms }));
  return {
    lap({ key, accountId, displayName, lapMs, mode }) {
      if (!KEY.test(key || '') || !ACCOUNT_ID.test(accountId || '') || !Number.isSafeInteger(lapMs)
        || lapMs < LAP_MIN_MS || lapMs > LAP_MAX_MS || !['race', 'practice'].includes(mode)) return { ok: false, code: 'INVALID' };
      const at = now();
      const saved = query.lap.run(key, accountId, cleanName(displayName), lapMs, mode, gardenDay(at, timeZone), at).changes > 0;
      prune();
      return { ok: true, saved };
    },
    result({ raceId, cars, results }) {
      if (!RACE_ID.test(raceId || '') || !Number.isSafeInteger(cars) || cars < 1 || cars > 16
        || !Array.isArray(results) || results.length < 1 || results.length > 16) return { ok: false, code: 'INVALID' };
      const valid = (item) => item && ACCOUNT_ID.test(item.accountId || '') && Number.isSafeInteger(item.pos) && item.pos >= 1 && item.pos <= cars
        && Number.isSafeInteger(item.laps) && item.laps >= 0 && item.laps <= 99 && typeof item.dnf === 'boolean'
        && ['totalMs', 'bestMs'].every((field) => item[field] === undefined || (Number.isSafeInteger(item[field]) && item[field] > 0 && item[field] <= 3_600_000));
      if (!results.every(valid)) return { ok: false, code: 'INVALID' };
      const at = now();
      let saved = 0;
      for (const item of results) {
        saved += query.result.run(raceId, item.accountId, cleanName(item.displayName), item.pos, cars, item.laps, item.dnf ? 1 : 0,
          item.totalMs ?? null, item.bestMs ?? null, at).changes;
      }
      return { ok: true, saved };
    },
    view(accountId) {
      const at = now();
      const day = gardenDay(at, timeZone);
      const week = at - 7 * DAY_MS;
      const mine = accountId ? {
        today: query.myBestDay.get(accountId, day)?.ms ?? null,
        week: query.myBestSince.get(accountId, week)?.ms ?? null,
        best: query.myBestSince.get(accountId, 0)?.ms ?? null,
        ...(() => {
          const row = query.myResults.get(accountId, week);
          return { wins: row?.wins || 0, races: row?.races || 0 };
        })(),
      } : null;
      return {
        day,
        today: rows(query.boardDay.all(day)),
        week: rows(query.boardSince.all(week)),
        all: rows(query.boardSince.all(0)),
        wins: query.wins.all(week).map((row) => ({ name: row.name, wins: row.wins, races: row.races })),
        me: mine,
      };
    },
  };
}

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleRaceRequest(req, res, pathname, options) {
  if (pathname === '/api/v1/race') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    if (!options.race) return json(req, res, 503, { error: 'race_disabled' }), true;
    return json(req, res, 200, options.race.view(currentAccount(req, options)?.id || null)), true;
  }
  if (pathname !== '/internal/race/lap' && pathname !== '/internal/race/result') return false;
  if (req.method !== 'POST') return json(req, res, 404, { error: 'not_found' }), true;
  if (!internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
  if (!options.race) return json(req, res, 503, { error: 'race_disabled' }), true;
  const input = await body(req, res);
  if (!input) return true;
  const result = pathname.endsWith('/lap') ? options.race.lap(input) : options.race.result(input);
  json(req, res, result.ok ? 200 : 400, result);
  return true;
}
