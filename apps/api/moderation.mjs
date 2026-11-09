// Kiểm duyệt toàn hệ thống: sổ khóa (tắt chat / khóa nick / chặn IP), điểm vi phạm, danh sách từ cấm quản trị thêm
// qua Telegram (/blockchattu dm), báo Telegram mỗi lần khóa kèm lệnh mở khóa (/unban k-xxxx). Máy realtime phát hiện vi
// phạm trong chat rồi gửi về đây (chỉ API ghi database); cứ ~15 giây realtime hỏi lại sổ khóa + từ để đá người bị khóa
// và lọc theo từ mới. IP chỉ lưu bản băm (ipHash).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import {
  checkText,
  cleanWord,
  createWordList,
  DEFAULT_BLOCK_WORDS,
  DEFAULT_SUSPECT_WORDS,
  ipHash,
  maskText,
  requestIp,
} from '../../packages/moderation/src/index.mjs';
import { isAdmin } from './support.mjs';
import { json, readJson } from './http.mjs';

export const MUTE_MS = 10 * 60_000;
export const BAN_MS = 24 * 60 * 60_000;
export const CLONE_BAN_MS = 7 * 24 * 60 * 60_000;
export const IP_BAN_MS = 24 * 60 * 60_000;
const STRIKE_WINDOW_MS = 60 * 60_000;
const REOFFEND_MS = 24 * 60 * 60_000;
// Phòng 'strict' (chánh điện) tắt chat sau 3 lần chửi trong 1 giờ; phòng thường sau 4 lần.
const STRIKE_LIMIT = { strict: 3, standard: 4 };
const SUSPECT_REPEAT_MS = 6 * 60 * 60_000;
const SUSPECT_PER_HOUR = 30;
const ACCOUNT_ID = /^a-[a-zA-Z0-9-]{8,64}$/;
const IP_HASH = /^[A-Za-z0-9_-]{22}$/;
const BAN_ID = /^k-[a-z0-9]{6,12}$/;
const ROOM_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const optional = (pattern) => (value) => (typeof value === 'string' && pattern.test(value) ? value : null);
const accountIdOf = optional(ACCOUNT_ID);
const ipHashOf = optional(IP_HASH);
const roomOf = (value) => optional(ROOM_ID)(value) || 'không rõ phòng';
const newId = () => `k-${randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 8)}`;

// Thời lượng dễ đọc trong tin Telegram / thông báo cho người bị khóa.
export function duration(ms) {
  if (ms >= 24 * 60 * 60_000 && ms % (24 * 60 * 60_000) === 0) return `${ms / (24 * 60 * 60_000)} ngày`;
  if (ms >= 60 * 60_000) return `${Math.round(ms / (60 * 60_000))} giờ`;
  return `${Math.max(1, Math.round(ms / 60_000))} phút`;
}

const clock = (at) => new Date(at).toLocaleString('vi-VN', { timeZone: process.env.GARDEN_TIMEZONE || 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

export function createModerationStore({ db, accounts = null, notify = null, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS moderation_words (
      word TEXT PRIMARY KEY,
      action TEXT NOT NULL CHECK (action IN ('block', 'allow')),
      added_by TEXT,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS moderation_strikes (
      subject TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moderation_strikes_subject ON moderation_strikes (subject, at);
    CREATE TABLE IF NOT EXISTS moderation_bans (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('mute', 'ban')),
      account_id TEXT,
      ip_hash TEXT,
      ip_until INTEGER,
      name TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT,
      room_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      created_by TEXT NOT NULL,
      lifted_at INTEGER,
      lifted_by TEXT
    );
    CREATE INDEX IF NOT EXISTS moderation_bans_account ON moderation_bans (account_id);
    CREATE INDEX IF NOT EXISTS moderation_bans_ip ON moderation_bans (ip_hash);
    CREATE TABLE IF NOT EXISTS moderation_suspects (
      word TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      first_at INTEGER NOT NULL,
      reported_at INTEGER
    );`);
  const q = {
    words: db.prepare('SELECT word, action, added_by AS addedBy, added_at AS addedAt FROM moderation_words ORDER BY added_at DESC'),
    word: db.prepare('SELECT word, action FROM moderation_words WHERE word = ?'),
    setWord: db.prepare(`INSERT INTO moderation_words (word, action, added_by, added_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(word) DO UPDATE SET action = excluded.action, added_by = excluded.added_by, added_at = excluded.added_at`),
    dropWord: db.prepare('DELETE FROM moderation_words WHERE word = ?'),
    strike: db.prepare('INSERT INTO moderation_strikes (subject, at) VALUES (?, ?)'),
    strikes: db.prepare('SELECT COUNT(*) AS count FROM moderation_strikes WHERE subject = ? AND at > ?'),
    clearStrikes: db.prepare('DELETE FROM moderation_strikes WHERE subject = ?'),
    pruneStrikes: db.prepare('DELETE FROM moderation_strikes WHERE at < ?'),
    insertBan: db.prepare(`INSERT INTO moderation_bans
      (id, kind, account_id, ip_hash, ip_until, name, reason, evidence, room_id, created_at, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    ban: db.prepare('SELECT * FROM moderation_bans WHERE id = ?'),
    active: db.prepare(`SELECT * FROM moderation_bans WHERE lifted_at IS NULL
      AND ((expires_at IS NULL OR expires_at > ?) OR (ip_until IS NOT NULL AND ip_until > ?)) ORDER BY created_at DESC`),
    recent: db.prepare('SELECT * FROM moderation_bans ORDER BY created_at DESC LIMIT ?'),
    accountActive: db.prepare(`SELECT * FROM moderation_bans WHERE account_id = ? AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?) ORDER BY kind = 'ban' DESC, expires_at IS NULL DESC, expires_at DESC`),
    ipActive: db.prepare(`SELECT * FROM moderation_bans WHERE ip_hash = ? AND lifted_at IS NULL AND ip_until > ?
      ORDER BY kind = 'ban' DESC, ip_until DESC`),
    recentPenalty: db.prepare(`SELECT COUNT(*) AS count FROM moderation_bans WHERE created_at > ?
      AND ((account_id IS NOT NULL AND account_id = ?) OR (account_id IS NULL AND ip_hash = ?))`),
    lift: db.prepare('UPDATE moderation_bans SET lifted_at = ?, lifted_by = ? WHERE id = ? AND lifted_at IS NULL'),
    suspect: db.prepare('SELECT word, count, reported_at AS reportedAt FROM moderation_suspects WHERE word = ?'),
    upsertSuspect: db.prepare(`INSERT INTO moderation_suspects (word, count, first_at, reported_at) VALUES (?, 1, ?, NULL)
      ON CONFLICT(word) DO UPDATE SET count = count + 1`),
    reportedSuspect: db.prepare('UPDATE moderation_suspects SET reported_at = ? WHERE word = ?'),
    suspectsSince: db.prepare('SELECT COUNT(*) AS count FROM moderation_suspects WHERE reported_at > ?'),
  };

  let list = null;
  let version = 0;
  function wordList() {
    if (!list) {
      const rows = q.words.all();
      list = createWordList({
        block: rows.filter((row) => row.action === 'block').map((row) => row.word),
        allow: rows.filter((row) => row.action === 'allow').map((row) => row.word),
      });
    }
    return list;
  }
  const changed = () => {
    list = null;
    version += 1;
  };

  const publicBan = (row) => row && {
    id: row.id,
    kind: row.kind,
    accountId: row.account_id,
    ipBlocked: Boolean(row.ip_hash && row.ip_until),
    name: row.name,
    reason: row.reason,
    evidence: row.evidence,
    roomId: row.room_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ipUntil: row.ip_until,
    createdBy: row.created_by,
    liftedAt: row.lifted_at,
    liftedBy: row.lifted_by,
    active: !row.lifted_at && (row.expires_at === null || row.expires_at > now() || (row.ip_until ?? 0) > now()),
  };

  function accountLabel(accountId, fallback) {
    const account = accountId ? accounts?.get(accountId) : null;
    if (!account) return fallback || 'Khách';
    return account.username ? `${account.displayName} (@${account.username})` : `${account.displayName} (${account.id.slice(0, 10)}…)`;
  }

  function createBan({ kind, accountId = null, ip = null, ipMs = null, name, reason, evidence = null, roomId = null, ms = null, by = 'tự động' }) {
    const at = now();
    const id = newId();
    const ipUntil = ip && ipMs ? at + ipMs : null;
    q.insertBan.run(id, kind, accountId, ipUntil ? ip : null, ipUntil, text(name, 60) || 'Khách', text(reason, 120), evidence ? text(evidence, 200) : null,
      roomId, at, ms === null ? null : at + ms, by);
    version += 1;
    return publicBan(q.ban.get(id));
  }

  // Lệnh mở khóa dùng chung cho Telegram và trang admin: theo mã khóa, tên đăng nhập hoặc mã tài khoản.
  function resolveTarget(target) {
    const value = String(target || '').trim();
    if (BAN_ID.test(value)) {
      const row = q.ban.get(value);
      return row ? { rows: [row], accountId: row.account_id, ipHash: row.ip_hash, label: row.name } : null;
    }
    const account = accounts?.findByUsername(value.replace(/^@/, '')) || (ACCOUNT_ID.test(value) ? accounts?.get(value) : null);
    if (!account) return null;
    return { rows: q.accountActive.all(account.id, now()), accountId: account.id, ipHash: null, label: accountLabel(account.id) };
  }

  function unban(target, by = 'quản trị') {
    const found = resolveTarget(target);
    if (!found) return { ok: false, error: 'NOT_FOUND' };
    const at = now();
    let lifted = 0;
    // Mở một vụ (mã khóa) thì mở luôn mọi lệnh khóa còn hiệu lực của cùng tài khoản để người đó vào lại được ngay.
    const rows = new Map(found.rows.map((row) => [row.id, row]));
    if (found.accountId) for (const row of q.accountActive.all(found.accountId, at)) rows.set(row.id, row);
    for (const row of rows.values()) lifted += q.lift.run(at, text(by, 60), row.id).changes;
    if (found.accountId) q.clearStrikes.run(found.accountId);
    if (found.ipHash) q.clearStrikes.run(`ip:${found.ipHash}`);
    version += 1;
    return { ok: true, lifted, label: found.label };
  }

  function notifyBan(ban, header, extra = []) {
    if (!notify) return;
    const lines = [
      `${header} · ${roomOf(ban.roomId)}`,
      `${ban.accountId ? 'Tài khoản' : 'Khách'}: ${accountLabel(ban.accountId, ban.name)}`,
      `Lý do: ${ban.reason}`,
      ...(ban.evidence ? [`Tin: "${ban.evidence}"`] : []),
      ...extra,
      `Mở khóa: /unban ${ban.id}`,
    ];
    notify(lines.join('\n'));
  }

  return {
    get version() {
      return version;
    },
    wordList,
    // Tên hiển thị / sớ / chữ khác có từ cấm không.
    check: (value) => checkText(String(value ?? ''), wordList()),

    // Lệnh khóa đang hiệu lực với người này (null nếu không). kind 'ban' chặn vào phòng; 'mute' chỉ chặn chat.
    restriction({ accountId = null, ipHash: ip = null } = {}) {
      const at = now();
      const byAccount = accountId ? q.accountActive.get(accountId, at) : null;
      if (byAccount?.kind === 'ban') return publicBan(byAccount);
      const byIp = ip ? q.ipActive.get(ip, at) : null;
      if (byIp?.kind === 'ban') return publicBan(byIp);
      return publicBan(byAccount || byIp || null);
    },

    // Cho máy realtime: từ quản trị thêm/bỏ và mọi lệnh khóa còn hiệu lực.
    state() {
      const at = now();
      q.pruneStrikes.run(at - REOFFEND_MS);
      const rows = q.words.all();
      return {
        version,
        words: { block: rows.filter((row) => row.action === 'block').map((row) => row.word), allow: rows.filter((row) => row.action === 'allow').map((row) => row.word) },
        restrictions: q.active.all(at, at).map((row) => ({
          id: row.id,
          kind: row.kind,
          ...(row.account_id && (row.expires_at === null || row.expires_at > at) ? { accountId: row.account_id } : {}),
          ...(row.ip_hash && row.ip_until > at ? { ipHash: row.ip_hash, ipUntil: row.ip_until } : {}),
          until: row.expires_at,
        })).filter((row) => row.accountId || row.ipHash),
      };
    },

    // Một tin bị chặn vì chửi thề: cộng một điểm; đủ ngưỡng thì tắt chat 10 phút, tái phạm trong 24 giờ thì khóa nick
    // 24 giờ (khách: chặn IP 24 giờ). Không có tài khoản lẫn IP công khai thì để máy realtime tự xử trong phòng.
    violation({ accountId = null, ipHash: ip = null, name, roomId = null, strict = false, evidence = null, words = [] }) {
      const subject = accountId || (ip ? `ip:${ip}` : null);
      if (!subject) return { action: 'local' };
      const at = now();
      q.strike.run(subject, at);
      const strikes = q.strikes.get(subject, at - STRIKE_WINDOW_MS).count;
      const limit = strict ? STRIKE_LIMIT.strict : STRIKE_LIMIT.standard;
      if (strikes < limit) return { action: 'warn', strikes, limit };
      const reoffend = q.recentPenalty.get(at - REOFFEND_MS, accountId, ip).count > 0;
      q.clearStrikes.run(subject);
      const reason = `chửi thề ${strikes} lần trong 1 giờ${words.length ? ` (${words.slice(0, 3).map((word) => maskText(word)).join(', ')})` : ''}`;
      const ban = createBan({
        kind: reoffend ? 'ban' : 'mute',
        accountId,
        ip: accountId ? null : ip,
        ipMs: accountId ? null : reoffend ? IP_BAN_MS : MUTE_MS,
        name, roomId,
        ms: reoffend ? BAN_MS : MUTE_MS,
        reason: reoffend ? `tái phạm: ${reason}` : reason,
        evidence,
      });
      notifyBan(ban, reoffend ? `⛔ KHÓA ${accountId ? 'NICK' : 'IP KHÁCH'} ${duration(BAN_MS).toUpperCase()}` : `🔇 TẮT CHAT ${duration(MUTE_MS).toUpperCase()}`);
      return { action: ban.kind, ban, strikes, limit };
    },

    // Nick clone nhắn trùng: khóa từng nick mới (7 ngày) + chặn IP 24 giờ, chừa người nhắn đầu tiên; một tin Telegram.
    clones({ roomId = null, evidence = null, first = null, offenders = [] }) {
      const bans = offenders.map((offender) => {
        const accountId = accountIdOf(offender.accountId);
        const ip = ipHashOf(offender.ipHash);
        if (!accountId && !ip) return null;
        const existing = accountId ? q.accountActive.get(accountId, now()) : null;
        if (existing?.kind === 'ban') return publicBan(existing);
        return createBan({
          kind: 'ban', accountId, ip, ipMs: ip ? IP_BAN_MS : null, name: offender.name, roomId,
          ms: accountId ? CLONE_BAN_MS : IP_BAN_MS, reason: 'nick clone nhắn trùng', evidence,
        });
      });
      const made = bans.filter(Boolean);
      if (notify && made.length) {
        notify([
          `⛔ TỰ KHÓA CLONE · ${roomOf(roomId)}`,
          `${made.length} nick mới nhắn trùng${evidence ? `: "${evidence}"` : ''}`,
          `Đã khóa nick ${duration(CLONE_BAN_MS)} + chặn IP ${duration(IP_BAN_MS)}: ${made.map((ban) => accountLabel(ban.accountId, ban.name)).join(', ')}`,
          ...(first?.name ? [`Chừa người nhắn đầu tiên: ${text(first.name, 60)}`] : []),
          `Khóa nhầm: ${made.map((ban) => `/unban ${ban.id}`).join(' · ')}`,
        ].join('\n'));
      }
      return bans;
    },

    // Chữ khả nghi (không chặn): mỗi chữ báo tối đa 6 giờ một lần, cả hệ thống tối đa 30 tin mỗi giờ.
    suspect({ name, accountId = null, roomId = null, evidence = null, words = [] }) {
      const at = now();
      const current = wordList().words.block;
      const fresh = [];
      for (const raw of words.slice(0, 5)) {
        const word = cleanWord(raw);
        if (!word || current.includes(word)) continue;
        q.upsertSuspect.run(word, at);
        const row = q.suspect.get(word);
        if (row.reportedAt && at - row.reportedAt < SUSPECT_REPEAT_MS) continue;
        if (q.suspectsSince.get(at - 60 * 60_000).count >= SUSPECT_PER_HOUR) break;
        q.reportedSuspect.run(at, word);
        fresh.push(word);
      }
      if (notify && fresh.length) {
        notify([
          `🔎 Từ khả nghi · ${roomOf(roomId)}`,
          `${accountLabel(accountId, name)}: "${evidence || ''}"`,
          `Chặn từ này: ${fresh.map((word) => `/blockchattu ${word}`).join(' · ')}`,
        ].join('\n'));
      }
      return { reported: fresh };
    },

    ban({ target, hours = 24, by = 'quản trị', reason = 'quản trị khóa' }) {
      const account = accounts?.findByUsername(String(target || '').replace(/^@/, '')) || (ACCOUNT_ID.test(target || '') ? accounts?.get(target) : null);
      if (!account) return { ok: false, error: 'NOT_FOUND' };
      const ms = Math.min(24 * 365, Math.max(1, hours)) * 60 * 60_000;
      const ban = createBan({ kind: 'ban', accountId: account.id, name: account.displayName, ms, reason, by });
      return { ok: true, ban, label: accountLabel(account.id) };
    },
    unban,

    setWord(raw, action, by = 'quản trị') {
      const word = cleanWord(raw);
      if (!word) return { ok: false, error: 'INVALID_WORD' };
      const isDefault = DEFAULT_BLOCK_WORDS.includes(word);
      if (action === 'block') {
        if (isDefault && !q.word.get(word)) return { ok: true, word, already: true };
        if (isDefault) q.dropWord.run(word);
        else q.setWord.run(word, 'block', text(by, 60), now());
      } else if (action === 'remove') {
        // Bỏ từ quản trị đã thêm; từ mặc định thì ghi 'allow' để tắt.
        if (isDefault) q.setWord.run(word, 'allow', text(by, 60), now());
        else if (!q.dropWord.run(word).changes) return { ok: false, error: 'NOT_FOUND', word };
      } else return { ok: false, error: 'INVALID_ACTION' };
      changed();
      return { ok: true, word };
    },

    listWords: () => q.words.all(),
    active: () => q.active.all(now(), now()).map(publicBan),
    recent: (limit = 100) => q.recent.all(Math.min(500, Math.max(1, limit))).map(publicBan),
  };
}

export function openModerationStore(accounts, notify = null) {
  return accounts ? createModerationStore({ db: accounts.database, accounts, notify }) : null;
}

// Gom tin Telegram: nhiều vụ trong vài giây thành một tin, không dội bom nhóm quản trị.
export function batchNotifier(send, { delayMs = 4_000, limit = 3_800 } = {}) {
  if (!send) return null;
  let queue = [];
  let timer = null;
  const flush = () => {
    timer = null;
    let chunk = '';
    for (const item of queue.splice(0)) {
      const next = chunk ? `${chunk}\n\n— — —\n\n${item}` : item;
      if (next.length > limit && chunk) {
        send(chunk);
        chunk = item.slice(0, limit);
      } else chunk = next.slice(0, limit);
    }
    if (chunk) send(chunk);
  };
  const push = (message) => {
    queue.push(message);
    if (!timer) {
      timer = setTimeout(flush, delayMs);
      timer.unref?.();
    }
  };
  push.flush = () => {
    clearTimeout(timer);
    flush();
  };
  return push;
}

const HELP = [
  'Lệnh kiểm duyệt:',
  '/blockchattu <từ> — chặn từ (có dấu: chỉ chặn đúng chữ có dấu; thêm * cuối để chặn cả tiền tố)',
  '/boblockchattu <từ> — bỏ chặn từ',
  '/dschattu — từ quản trị đã thêm/bỏ',
  '/unban <mã k-… | tên đăng nhập> — mở khóa',
  '/ban <tên đăng nhập> [giờ] — khóa nick (mặc định 24 giờ)',
  '/dsban — người đang bị khóa',
  '/xoamo <số ô> — gỡ mộ ở Khu tưởng niệm (không hoàn xu)',
  '/duyetvideo <mã | link> — cho phép video ở rạp (ghi đè AI)',
  '/chanvideo <mã | link> [lý do] — chặn video, gỡ khỏi mọi rạp',
  '/dsvideo — video vừa bị chặn / chờ duyệt',
].join('\n');

// Lệnh kiểm duyệt trong nhóm Telegram quản trị (webhook đã kiểm tra secret + chat ID). Trả câu trả lời hoặc null.
export function moderationTelegramCommand(input, store, by = 'Telegram') {
  if (!store || typeof input !== 'string') return null;
  const message = input.trim();
  const command = /^\/?([a-z]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+))?$/i.exec(message);
  if (!command) return null;
  const name = command[1].toLowerCase();
  const arg = (command[2] || '').trim();
  if (name === 'blockchattu' || name === 'chantu') {
    if (!arg) return 'Cú pháp: /blockchattu <từ>';
    const result = store.setWord(arg, 'block', by);
    if (!result.ok) return 'Từ không hợp lệ (1–40 ký tự chữ/số, dấu * chỉ ở cuối).';
    const plain = !/[^\x00-\x7f]/.test(result.word);
    return [
      result.already ? `Từ «${result.word}» đã có trong danh sách chặn mặc định.` : `✅ Đã chặn từ «${result.word}». Hiệu lực ở mọi phòng trong khoảng 15 giây.`,
      ...(plain && !result.already ? ['Lưu ý: từ không dấu chỉ chặn khi người dùng gõ không dấu (hoặc viết lách); muốn chặn chữ có dấu thì gõ đúng dấu.'] : []),
    ].join('\n');
  }
  if (name === 'boblockchattu' || name === 'unblockchattu' || name === 'bochantu') {
    if (!arg) return 'Cú pháp: /boblockchattu <từ>';
    const result = store.setWord(arg, 'remove', by);
    if (!result.ok) return result.error === 'NOT_FOUND' ? `Không có từ «${result.word}» trong danh sách quản trị đã thêm.` : 'Từ không hợp lệ.';
    return `✅ Đã bỏ chặn từ «${result.word}».`;
  }
  if (name === 'dschattu') {
    const rows = store.listWords();
    if (!rows.length) return `Chưa có từ quản trị thêm/bỏ. Danh sách mặc định có ${DEFAULT_BLOCK_WORDS.length} từ chặn, ${DEFAULT_SUSPECT_WORDS.length} từ khả nghi.`;
    const blocked = rows.filter((row) => row.action === 'block').map((row) => row.word);
    const allowed = rows.filter((row) => row.action === 'allow').map((row) => row.word);
    return [`Chặn thêm (${blocked.length}): ${blocked.join(', ') || '—'}`, `Bỏ chặn từ mặc định (${allowed.length}): ${allowed.join(', ') || '—'}`].join('\n').slice(0, 3_800);
  }
  if (name === 'unban' || name === 'mokhoa') {
    if (!arg) return 'Cú pháp: /unban <mã k-… hoặc tên đăng nhập>';
    const result = store.unban(arg.split(/\s+/)[0], by);
    if (!result.ok) return `Không tìm thấy lệnh khóa hoặc tài khoản: ${arg}`;
    return result.lifted ? `✅ Đã mở khóa ${result.label} (${result.lifted} lệnh) · ${by}. Người này vào lại được ngay.` : `${result.label} không còn bị khóa.`;
  }
  if (name === 'ban' || name === 'khoa') {
    const match = /^(\S+)(?:\s+(\d{1,4})\s*h?)?$/i.exec(arg);
    if (!match) return 'Cú pháp: /ban <tên đăng nhập> [số giờ]';
    const result = store.ban({ target: match[1], hours: match[2] ? Number(match[2]) : 24, by, reason: `quản trị khóa (${by})` });
    if (!result.ok) return `Không tìm thấy tài khoản: ${match[1]}`;
    return `⛔ Đã khóa ${result.label} ${duration(result.ban.expiresAt - result.ban.createdAt)}. Mở khóa: /unban ${result.ban.id}`;
  }
  if (name === 'dsban') {
    const rows = store.active().slice(0, 20);
    if (!rows.length) return 'Không ai đang bị khóa.';
    return rows.map((ban) => `${ban.kind === 'ban' ? '⛔' : '🔇'} ${ban.name} · ${ban.reason} · đến ${ban.expiresAt ? clock(ban.expiresAt) : 'khi mở'} · /unban ${ban.id}`).join('\n').slice(0, 3_800);
  }
  if (name === 'kiemduyet' || name === 'modhelp') return HELP;
  return null;
}

export { HELP as MODERATION_HELP };

const internalAllowed = (req, options) => {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// IP băm của request (null nếu IP nội bộ) — dùng khi xin vé vào phòng.
export const requestIpHash = (req, options) => ipHash(requestIp(req.headers || {}, req.socket?.remoteAddress), options.secret || DEFAULT_LOCAL_SECRET);

// Câu báo cho người bị khóa (trả kèm lỗi khi xin vé vào phòng).
// Ghi thời gian còn lại (không ghi giờ server, người dùng ở múi giờ khác dễ hiểu nhầm).
export function banMessage(ban, now = Date.now()) {
  const until = ban.expiresAt || ban.ipUntil;
  return `Tài khoản đang bị khóa${until ? ` (còn ${duration(Math.max(60_000, until - now))})` : ''} vì ${ban.reason}. Nếu khóa nhầm, hãy gửi Góp ý & Báo lỗi.`;
}

async function readBody(req, res) {
  try {
    const input = await readJson(req);
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch {}
  json(req, res, 400, { error: 'invalid_json' });
  return null;
}

export async function handleModerationRequest(req, res, pathname, options) {
  const internal = pathname.startsWith('/internal/moderation/');
  const admin = pathname === '/api/v1/admin/moderation' || pathname.startsWith('/api/v1/admin/moderation/');
  if (!internal && !admin) return false;
  const store = options.moderation;
  if (internal && !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
  if (admin && !isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
  if (!store) return json(req, res, 503, { error: 'moderation_disabled' }), true;

  if (req.method === 'GET' && pathname === '/internal/moderation/state') return json(req, res, 200, store.state()), true;
  if (req.method === 'POST' && pathname === '/internal/moderation/violation') {
    const input = await readBody(req, res);
    if (!input) return true;
    const result = store.violation({
      accountId: accountIdOf(input.accountId), ipHash: ipHashOf(input.ipHash), name: text(input.name, 40), roomId: optional(ROOM_ID)(input.roomId),
      strict: input.strict === true, evidence: text(input.evidence, 200) || null,
      words: Array.isArray(input.words) ? input.words.filter((word) => typeof word === 'string').slice(0, 5).map((word) => word.slice(0, 40)) : [],
    });
    return json(req, res, 200, result), true;
  }
  if (req.method === 'POST' && pathname === '/internal/moderation/clone') {
    const input = await readBody(req, res);
    if (!input) return true;
    const offenders = Array.isArray(input.offenders) ? input.offenders.slice(0, 20).filter((item) => item && typeof item === 'object')
      .map((item) => ({ accountId: item.accountId, ipHash: item.ipHash, name: text(item.name, 40) })) : [];
    const bans = store.clones({
      roomId: optional(ROOM_ID)(input.roomId), evidence: text(input.evidence, 200) || null,
      first: input.first && typeof input.first === 'object' ? { name: text(input.first.name, 40) } : null, offenders,
    });
    return json(req, res, 200, { bans }), true;
  }
  if (req.method === 'POST' && pathname === '/internal/moderation/suspect') {
    const input = await readBody(req, res);
    if (!input) return true;
    return json(req, res, 200, store.suspect({
      name: text(input.name, 40), accountId: accountIdOf(input.accountId), roomId: optional(ROOM_ID)(input.roomId),
      evidence: text(input.evidence, 200) || null, words: Array.isArray(input.words) ? input.words.filter((word) => typeof word === 'string') : [],
    })), true;
  }

  if (req.method === 'GET' && pathname === '/api/v1/admin/moderation') {
    return json(req, res, 200, {
      bans: store.recent(100), words: store.listWords(),
      defaults: { block: DEFAULT_BLOCK_WORDS, suspect: DEFAULT_SUSPECT_WORDS },
    }), true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/admin/moderation/unban') {
    const input = await readBody(req, res);
    if (!input) return true;
    const result = typeof input.target === 'string' ? store.unban(input.target.slice(0, 80), 'trang admin') : { ok: false, error: 'NOT_FOUND' };
    return json(req, res, result.ok ? 200 : 404, result), true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/admin/moderation/words') {
    const input = await readBody(req, res);
    if (!input) return true;
    const result = store.setWord(input.word, input.action === 'remove' ? 'remove' : input.action === 'block' ? 'block' : null, 'trang admin');
    return json(req, res, result.ok ? 200 : 400, result), true;
  }
  return json(req, res, 404, { error: 'not_found' }), true;
}
