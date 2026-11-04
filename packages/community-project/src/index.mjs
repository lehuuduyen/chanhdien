// Công trình chung toàn hệ thống. Tiểu bang, ngôn ngữ và shard phòng chỉ là nơi người chơi đang đứng;
// tất cả cùng đóng góp vào đúng một bản ghi SQLite. Điểm do server quyết định, mỗi việc chỉ được tính một
// lần mỗi ngày UTC và mọi POST thành công đều có khóa idempotency để không cộng hai lần khi mạng gửi lại.

export const COMMUNITY_PROJECT_ID = 'bodhi-global-1';
export const COMMUNITY_PROJECT_TARGET = 1_000;
export const COMMUNITY_PROJECT_ACTIONS = Object.freeze({
  dig: Object.freeze({ points: 3 }),
  water: Object.freeze({ points: 5 }),
  tend: Object.freeze({ points: 4 }),
});
export const COMMUNITY_PROJECT_STAGES = Object.freeze(['ground', 'sprout', 'young', 'mature', 'complete']);

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export class CommunityProjectError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function projectStage(progress, target = COMMUNITY_PROJECT_TARGET) {
  if (progress >= target) return 'complete';
  if (progress >= target * 0.75) return 'mature';
  if (progress >= target * 0.5) return 'young';
  if (progress > 0) return 'sprout';
  return 'ground';
}

const utcDay = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

export function createCommunityProjectStore({ db, now = Date.now, target = COMMUNITY_PROJECT_TARGET }) {
  if (!Number.isSafeInteger(target) || target < 1) throw new TypeError('invalid community project target');
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS community_projects (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
      target INTEGER NOT NULL CHECK (target > 0),
      completed_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_project_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES community_projects(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      action TEXT NOT NULL CHECK (action IN ('dig', 'water', 'tend')),
      points INTEGER NOT NULL CHECK (points > 0),
      day TEXT NOT NULL,
      at INTEGER NOT NULL,
      UNIQUE (project_id, account_id, action, day)
    );
    CREATE INDEX IF NOT EXISTS community_project_contributions_account
      ON community_project_contributions(account_id, id DESC);
    CREATE TABLE IF NOT EXISTS community_project_requests (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      idem_key TEXT NOT NULL,
      action TEXT NOT NULL,
      response TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (account_id, idem_key)
    );`);
  db.prepare(`INSERT OR IGNORE INTO community_projects
    (id, kind, progress, target, updated_at) VALUES (?, 'bodhi', 0, ?, ?)`).run(COMMUNITY_PROJECT_ID, target, now());

  const q = {
    project: db.prepare('SELECT * FROM community_projects WHERE id = ?'),
    counts: db.prepare(`SELECT COUNT(*) AS contributions, COUNT(DISTINCT account_id) AS contributors
      FROM community_project_contributions WHERE project_id = ?`),
    me: db.prepare(`SELECT COALESCE(SUM(points), 0) AS total, COUNT(*) AS contributions
      FROM community_project_contributions WHERE project_id = ? AND account_id = ?`),
    today: db.prepare(`SELECT action FROM community_project_contributions
      WHERE project_id = ? AND account_id = ? AND day = ? ORDER BY id`),
    request: db.prepare('SELECT action, response FROM community_project_requests WHERE account_id = ? AND idem_key = ?'),
    insertContribution: db.prepare(`INSERT INTO community_project_contributions
      (project_id, account_id, action, points, day, at) VALUES (?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE community_projects SET progress = MIN(target, progress + ?),
      completed_at = CASE WHEN progress + ? >= target THEN COALESCE(completed_at, ?) ELSE completed_at END,
      updated_at = ? WHERE id = ?`),
    saveRequest: db.prepare(`INSERT INTO community_project_requests
      (account_id, idem_key, action, response, at) VALUES (?, ?, ?, ?, ?)`),
  };

  function publicProject() {
    const row = q.project.get(COMMUNITY_PROJECT_ID);
    const counts = q.counts.get(COMMUNITY_PROJECT_ID);
    const stage = projectStage(row.progress, row.target);
    return {
      id: row.id,
      kind: row.kind,
      stage,
      stageIndex: COMMUNITY_PROJECT_STAGES.indexOf(stage),
      progress: row.progress,
      target: row.target,
      percent: Math.min(100, Math.floor((row.progress / row.target) * 100)),
      completed: Boolean(row.completed_at),
      contributors: counts.contributors,
      contributions: counts.contributions,
      updatedAt: row.updated_at,
    };
  }

  function mine(accountId) {
    if (!accountId) return null;
    const day = utcDay(now());
    const summary = q.me.get(COMMUNITY_PROJECT_ID, accountId);
    return {
      total: summary.total,
      contributions: summary.contributions,
      today: q.today.all(COMMUNITY_PROJECT_ID, accountId, day).map((row) => row.action),
      badge: summary.contributions ? 'bodhi-caretaker' : null,
    };
  }

  function snapshot(accountId = null) {
    return { project: publicProject(), me: mine(accountId), actions: COMMUNITY_PROJECT_ACTIONS };
  }

  function contribute(accountId, action, idemKey) {
    if (typeof accountId !== 'string' || !Object.hasOwn(COMMUNITY_PROJECT_ACTIONS, action)) {
      return { ok: false, code: 'INVALID' };
    }
    if (typeof idemKey !== 'string' || !IDEMPOTENCY_KEY.test(idemKey)) {
      return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
    }
    const previous = q.request.get(accountId, idemKey);
    if (previous) {
      if (previous.action !== action) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
      return { ...JSON.parse(previous.response), replayed: true };
    }
    const at = now();
    const day = utcDay(at);
    const points = COMMUNITY_PROJECT_ACTIONS[action].points;
    db.exec('BEGIN IMMEDIATE');
    try {
      const raced = q.request.get(accountId, idemKey);
      if (raced) {
        db.exec('COMMIT');
        if (raced.action !== action) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
        return { ...JSON.parse(raced.response), replayed: true };
      }
      const before = publicProject();
      if (before.completed) throw new CommunityProjectError('PROJECT_COMPLETE');
      try {
        q.insertContribution.run(COMMUNITY_PROJECT_ID, accountId, action, points, day, at);
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) throw new CommunityProjectError('ACTION_DONE_TODAY');
        throw error;
      }
      q.update.run(points, points, at, at, COMMUNITY_PROJECT_ID);
      const result = { ok: true, action, points, ...snapshot(accountId) };
      q.saveRequest.run(accountId, idemKey, action, JSON.stringify(result), at);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      if (error instanceof CommunityProjectError) return { ok: false, code: error.code };
      throw error;
    }
  }

  return { snapshot, contribute };
}
