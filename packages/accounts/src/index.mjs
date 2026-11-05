// Tài khoản và công đức lưu bền: đăng ký bằng tên/mật khẩu hoặc Google, ghi lễ vật, tổng điểm, chuỗi ngày, cấp độ,
// lịch sử, bảng xếp hạng. SQLite có sẵn trong Node (node:sqlite) cho giai đoạn một máy; chỉ API ghi vào đây.
import { MERIT_LEVELS } from '@chanh-dien/room-rules';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const USERNAME = /^[a-z0-9_.]{3,24}$/;
export const PASSWORD_MIN = 8;
export const DISPLAY_NAME_MAX = 40;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Công đức mỗi lễ vật và số lần mỗi ngày được tính vào điểm lưu trữ (trong phòng vẫn dâng thoải mái;
// giới hạn này để bảng xếp hạng cộng đồng không bị spam khi lễ vật không có thời gian chờ).
export const OFFERING_RULES = Object.freeze({
  petal: { merit: 1, dailyCap: 200 },
  incense: { merit: 5, dailyCap: 100 },
  lotus: { merit: 20, dailyCap: 30 },
  bell: { merit: 99, dailyCap: 10 },
});

// Cấp độ theo tổng công đức.
export const LEVELS = MERIT_LEVELS;

export function levelFor(merit) {
  let current = LEVELS[0];
  for (const level of LEVELS) if (merit >= level.min) current = level;
  const next = LEVELS.find((level) => level.min > merit) || null;
  const progress = next ? (merit - current.min) / (next.min - current.min) : 1;
  return { ...current, next, progress: Math.round(progress * 1000) / 1000 };
}

// Ngày theo giờ Việt Nam (YYYY-MM-DD) để tính chuỗi ngày và giới hạn trong ngày.
export function dayOf(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
}

function previousDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Chuỗi ngày liên tiếp có dâng lễ: hiện tại (tính tới hôm nay hoặc hôm qua) và dài nhất.
export function streaksFrom(daysDescending, today) {
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of daysDescending) {
    run = previous && previousDay(previous) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  let current = 0;
  if (daysDescending.length && (daysDescending[0] === today || daysDescending[0] === previousDay(today))) {
    current = 1;
    for (let index = 1; index < daysDescending.length && previousDay(daysDescending[index - 1]) === daysDescending[index]; index += 1) current += 1;
  }
  return { current, best };
}

// Mật khẩu: scrypt với salt ngẫu nhiên; so sánh thời gian hằng.
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, expected] = parts;
  const expectedBuffer = Buffer.from(expected, 'base64url');
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expectedBuffer.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expectedBuffer);
}

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX);

export function createAccountStore({ file = ':memory:', now = Date.now } = {}) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      email TEXT,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offerings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      kind TEXT NOT NULL,
      merit INTEGER NOT NULL,
      counted INTEGER NOT NULL,
      text TEXT,
      room_id TEXT,
      day TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS offerings_account_at ON offerings(account_id, at DESC);
    CREATE INDEX IF NOT EXISTS offerings_day ON offerings(day);
    -- Bạn bè: mỗi cặp một dòng, account_a < account_b.
    CREATE TABLE IF NOT EXISTS friends (
      account_a TEXT NOT NULL REFERENCES accounts(id),
      account_b TEXT NOT NULL REFERENCES accounts(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (account_a, account_b)
    );
    CREATE INDEX IF NOT EXISTS friends_b ON friends(account_b);
    -- Báo cáo người chơi (từ trong phòng). Người báo cáo / bị báo cáo có thể là khách (không có tài khoản).
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      reporter_account TEXT,
      reporter_name TEXT NOT NULL,
      target_account TEXT,
      target_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reports_at ON reports(at DESC);
  `);

  const statements = {
    insertAccount: db.prepare(`INSERT INTO accounts (id, username, password_hash, google_sub, email, display_name, avatar_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    byUsername: db.prepare('SELECT * FROM accounts WHERE username = ?'),
    byGoogle: db.prepare('SELECT * FROM accounts WHERE google_sub = ?'),
    updateGoogleProfile: db.prepare('UPDATE accounts SET email = ?, avatar_url = ? WHERE id = ?'),
    bumpSession: db.prepare('UPDATE accounts SET session_version = session_version + 1 WHERE id = ?'),
    countToday: db.prepare('SELECT COUNT(*) AS n FROM offerings WHERE account_id = ? AND kind = ? AND day = ? AND counted = 1'),
    insertOffering: db.prepare('INSERT INTO offerings (account_id, kind, merit, counted, text, room_id, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    totals: db.prepare(`SELECT COALESCE(SUM(merit), 0) AS merit, COUNT(*) AS offerings,
      COALESCE(SUM(CASE WHEN kind = 'incense' THEN 1 ELSE 0 END), 0) AS incense,
      COALESCE(SUM(CASE WHEN kind = 'petal' THEN 1 ELSE 0 END), 0) AS petal,
      COALESCE(SUM(CASE WHEN kind = 'lotus' THEN 1 ELSE 0 END), 0) AS lotus,
      COALESCE(SUM(CASE WHEN kind = 'bell' THEN 1 ELSE 0 END), 0) AS bell
      FROM offerings WHERE account_id = ? AND counted = 1`),
    days: db.prepare('SELECT DISTINCT day FROM offerings WHERE account_id = ? AND counted = 1 ORDER BY day DESC LIMIT 400'),
    history: db.prepare('SELECT id, kind, merit, counted, text, room_id AS roomId, at FROM offerings WHERE account_id = ? AND id < ? ORDER BY id DESC LIMIT ?'),
    friendPair: db.prepare('SELECT created_at FROM friends WHERE account_a = ? AND account_b = ?'),
    insertFriend: db.prepare('INSERT OR IGNORE INTO friends (account_a, account_b, created_at) VALUES (?, ?, ?)'),
    friendsOf: db.prepare(`SELECT a.id AS accountId, a.display_name AS displayName, a.avatar_url AS avatarUrl, f.created_at AS since
      FROM friends f JOIN accounts a ON a.id = CASE WHEN f.account_a = ? THEN f.account_b ELSE f.account_a END
      WHERE f.account_a = ? OR f.account_b = ? ORDER BY f.created_at DESC LIMIT ?`),
  };
  const pairOf = (first, second) => (first < second ? [first, second] : [second, first]);
  const insertReport = db.prepare(`INSERT INTO reports (room_id, reporter_account, reporter_name, target_account, target_name, reason, note, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const recentReports = db.prepare(`SELECT id, room_id AS roomId, reporter_account AS reporterAccount, reporter_name AS reporterName,
    target_account AS targetAccount, target_name AS targetName, reason, note, at FROM reports ORDER BY id DESC LIMIT ?`);

  const publicAccount = (row) => row && {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    provider: row.google_sub ? 'google' : 'password',
    sessionVersion: row.session_version,
    createdAt: row.created_at,
  };

  function createAccount({ username = null, passwordHash = null, googleSub = null, email = null, displayName, avatarUrl = null }) {
    const id = `a-${randomUUID()}`;
    statements.insertAccount.run(id, username, passwordHash, googleSub, email, cleanName(displayName) || username || 'Phật tử', avatarUrl, now());
    return publicAccount(statements.byId.get(id));
  }

  function stats(accountId) {
    const totals = statements.totals.get(accountId);
    const days = statements.days.all(accountId).map((row) => row.day);
    const streak = streaksFrom(days, dayOf(now()));
    return {
      merit: totals.merit,
      offerings: totals.offerings,
      incense: totals.incense,
      byKind: { petal: totals.petal, incense: totals.incense, lotus: totals.lotus, bell: totals.bell },
      streak: streak.current,
      bestStreak: streak.best,
      activeDays: days.length,
      level: levelFor(totals.merit),
    };
  }

  return {
    register({ username, password, displayName }) {
      const name = String(username || '').trim().toLowerCase();
      if (!USERNAME.test(name)) return { ok: false, error: 'INVALID_USERNAME' };
      if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > 200) return { ok: false, error: 'WEAK_PASSWORD' };
      if (statements.byUsername.get(name)) return { ok: false, error: 'USERNAME_TAKEN' };
      return { ok: true, account: createAccount({ username: name, passwordHash: hashPassword(password), displayName: cleanName(displayName) || name }) };
    },

    login({ username, password }) {
      const row = statements.byUsername.get(String(username || '').trim().toLowerCase());
      // Vẫn băm khi không có tài khoản để thời gian trả lời không lộ tên nào tồn tại.
      const ok = verifyPassword(String(password || ''), row?.password_hash || hashPassword('khong-co-tai-khoan'));
      return row && ok ? { ok: true, account: publicAccount(row) } : { ok: false, error: 'INVALID_CREDENTIALS' };
    },

    // Đăng nhập Google: tạo tài khoản lần đầu theo "sub" của Google, các lần sau cập nhật ảnh và email.
    upsertGoogle({ sub, email, name, picture }) {
      const existing = statements.byGoogle.get(sub);
      if (existing) {
        statements.updateGoogleProfile.run(email || existing.email, picture || existing.avatar_url, existing.id);
        return publicAccount(statements.byId.get(existing.id));
      }
      return createAccount({ googleSub: sub, email, displayName: name || (email ? email.split('@')[0] : 'Phật tử'), avatarUrl: picture || null });
    },

    get(accountId) {
      return publicAccount(statements.byId.get(accountId));
    },

    // Dùng cho công cụ quản trị nội bộ (ví dụ bot Telegram); không đưa đường tra cứu này ra API công khai.
    findByUsername(username) {
      const name = String(username || '').trim().toLowerCase();
      return USERNAME.test(name) ? publicAccount(statements.byUsername.get(name)) : null;
    },

    // Đăng xuất mọi nơi: đổi phiên bản phiên để mọi cookie cũ hết hiệu lực.
    revokeSessions(accountId) {
      statements.bumpSession.run(accountId);
    },

    // Ghi một lễ vật. Vượt giới hạn trong ngày thì vẫn ghi lịch sử nhưng không cộng điểm (counted = 0).
    recordOffering({ accountId, kind, text = null, roomId = null, at = now() }) {
      const rule = OFFERING_RULES[kind];
      if (!rule || !statements.byId.get(accountId)) return { ok: false, error: 'INVALID_OFFERING' };
      const day = dayOf(at);
      const counted = statements.countToday.get(accountId, kind, day).n < rule.dailyCap;
      statements.insertOffering.run(accountId, kind, counted ? rule.merit : 0, counted ? 1 : 0, text ? String(text).slice(0, 120) : null, roomId, day, at);
      return { ok: true, counted, merit: counted ? rule.merit : 0, level: levelFor(statements.totals.get(accountId).merit).level };
    },

    profile(accountId) {
      const account = publicAccount(statements.byId.get(accountId));
      return account && { account, stats: stats(accountId) };
    },

    history(accountId, { before = Number.MAX_SAFE_INTEGER, limit = 30 } = {}) {
      return statements.history.all(accountId, before, Math.min(Math.max(1, limit), 100)).map((row) => ({ ...row, counted: Boolean(row.counted) }));
    },

    // Bảng xếp hạng cộng đồng (chỉ tài khoản thật). metric: merit | incense | streak; period: all | week (7 ngày gần nhất).
    leaderboard({ metric = 'merit', period = 'all', limit = 20 } = {}) {
      const size = Math.min(Math.max(1, limit), 100);
      if (metric === 'streak') {
        const rows = db.prepare('SELECT id, display_name, avatar_url FROM accounts').all();
        return rows.map((row) => {
          const summary = stats(row.id);
          return { accountId: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, value: summary.streak, level: summary.level.level };
        })
          .filter((row) => row.value > 0)
          .sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName))
          .slice(0, size)
          .map((row, index) => ({ rank: index + 1, ...row }));
      }
      const value = metric === 'incense' ? "SUM(CASE WHEN o.kind = 'incense' THEN 1 ELSE 0 END)" : 'SUM(o.merit)';
      const since = period === 'week' ? dayOf(now() - 6 * 86_400_000) : '0000-00-00';
      return db.prepare(`SELECT a.id AS accountId, a.display_name AS displayName, a.avatar_url AS avatarUrl, ${value} AS value,
          (SELECT COALESCE(SUM(t.merit), 0) FROM offerings t WHERE t.account_id = a.id) AS total
        FROM offerings o JOIN accounts a ON a.id = o.account_id
        WHERE o.counted = 1 AND o.day >= ?
        GROUP BY a.id HAVING value > 0 ORDER BY value DESC, a.display_name ASC LIMIT ?`).all(since, size)
        .map(({ total, ...row }, index) => ({ rank: index + 1, ...row, level: levelFor(total).level }));
    },

    // Kết nối SQLite dùng chung cho các bảng khác trong cùng file (vd: vườn công đức) để giao dịch và khóa ngoại tới
    // accounts nằm trong một cơ sở dữ liệu.
    database: db,

    areFriends(first, second) {
      if (first === second) return false;
      return Boolean(statements.friendPair.get(...pairOf(first, second)));
    },

    // Kết bạn (hai chiều). created = false nếu đã là bạn từ trước.
    addFriend(first, second) {
      if (first === second || !statements.byId.get(first) || !statements.byId.get(second)) return { ok: false, error: 'INVALID_FRIEND' };
      const result = statements.insertFriend.run(...pairOf(first, second), now());
      return { ok: true, created: result.changes > 0 };
    },

    // Sổ báo cáo người chơi (để người quản lý xem; chưa có giao diện).
    addReport({ roomId, reporterAccount = null, reporterName, targetAccount = null, targetName, reason, note = null, at = now() }) {
      const text = (value, max) => String(value || '').slice(0, max);
      const result = insertReport.run(text(roomId, 64), reporterAccount, text(reporterName, 40), targetAccount, text(targetName, 40), text(reason, 20), note ? text(note, 200) : null, at);
      return { ok: true, id: Number(result.lastInsertRowid) };
    },

    reports({ limit = 50 } = {}) {
      return recentReports.all(Math.min(Math.max(1, limit), 500));
    },

    friends(accountId, { limit = 200 } = {}) {
      return statements.friendsOf.all(accountId, accountId, accountId, Math.min(Math.max(1, limit), 500));
    },

    close() {
      db.close();
    },
  };
}
