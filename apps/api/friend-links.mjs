// Bạn bè sâu hơn: bạn đang online ở phòng nào ("Tới chỗ bạn"), mời bạn vào phòng mình, và lời nhắn để lại khi bạn không
// online. Máy realtime báo định kỳ danh sách thành viên đang kết nối (POST /internal/presence); trạng thái online chỉ
// giữ trong bộ nhớ API (khởi động lại thì máy realtime báo lại sau ≤ 15 giây). Lời nhắn / lời mời lưu SQLite chung file
// tài khoản. Có lời nhắn mới thì API báo máy realtime để trang của người nhận tải hộp thư ngay (inbox.notify).
import { timingSafeEqual } from 'node:crypto';
import { createRoomInvite, DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { ROOM_TYPES, roomTypeOf, thienRoomName } from '@chanh-dien/room-rules';
import { allow, currentAccount, sameOrigin } from './auth.mjs';
import { json, readJson } from './http.mjs';

export const PRESENCE_TTL_MS = 45_000;
const NOTE_MAX = 200;
const NOTE_KEEP_MS = 30 * 24 * 60 * 60_000;
// Lời mời còn bấm "Tới ngay" được trong 15 phút.
export const INVITE_TTL_MS = 15 * 60_000;
const NOTE_LIMIT = [30, 24 * 60 * 60_000];
const NOTE_BURST = [5, 60_000];
const INVITE_LIMIT = [10, 10 * 60_000];
const ACCOUNT_ID = /^a-[a-zA-Z0-9-]{8,64}$/;
const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PARTICIPANT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
// Trang của từng loại phòng không phải chánh điện (chánh điện vào bằng mã mời phòng).
const ROOM_PAGES = { game: '/game.html', taixiu: '/tai-xiu.html', loto: '/loto.html' };

// Tên bot có thể kết bạn (mọi loại phòng, mọi ngôn ngữ). Bạn bot lưu theo tên: gặp lại bot cùng tên ở phòng nào cũng là bạn.
const BOT_NAMES = new Set(Object.values(ROOM_TYPES).flatMap((rules) => [
  ...(rules.bots?.names || []),
  ...Object.values(rules.bots?.byLang || {}).flatMap((words) => words.names || []),
]));
const BOT_FRIEND_MAX = 100;

const cleanText = (value) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '');

// Ai đang ở phòng nào, theo báo cáo gần nhất của từng máy realtime.
export function createPresence({ now = Date.now, ttlMs = PRESENCE_TTL_MS } = {}) {
  const nodes = new Map();
  return {
    report(nodeId, entries) {
      const people = new Map();
      for (const entry of entries) people.set(entry.accountId, { roomId: entry.roomId, participantId: entry.participantId });
      nodes.set(nodeId, { at: now(), people });
    },
    where(accountId) {
      for (const [nodeId, node] of nodes) {
        if (now() - node.at > ttlMs) {
          nodes.delete(nodeId);
          continue;
        }
        const found = node.people.get(accountId);
        if (found) return found;
      }
      return null;
    },
  };
}

// Thông tin phòng gửi cho bạn bè: chánh điện kèm mã mời (vào thẳng phòng đó), phòng khác kèm đường dẫn trang.
export function roomView(roomId, secret) {
  const type = roomTypeOf(roomId);
  if (type === 'thien') return { roomId, type, name: thienRoomName(roomId) || null, inviteCode: createRoomInvite(roomId, secret) };
  if (type === 'cinema') return { roomId, type, href: `/room.html?room=${encodeURIComponent(roomId)}` };
  return ROOM_PAGES[type] ? { roomId, type, href: ROOM_PAGES[type] } : null;
}

export function createFriendLinks({ db, accounts, presence = createPresence(), secret = DEFAULT_LOCAL_SECRET, now = Date.now, notify = null }) {
  db.exec(`CREATE TABLE IF NOT EXISTS friend_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account TEXT NOT NULL,
      to_account TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT,
      room_id TEXT,
      at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS friend_notes_to ON friend_notes (to_account, at);
    CREATE INDEX IF NOT EXISTS friend_notes_from ON friend_notes (from_account, kind, at);
    CREATE TABLE IF NOT EXISTS bot_friends (
      account_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      since INTEGER NOT NULL,
      PRIMARY KEY (account_id, bot_name)
    );
    CREATE TABLE IF NOT EXISTS friend_presence_prefs (
      account_id TEXT PRIMARY KEY,
      hidden INTEGER NOT NULL
    );`);
  const q = {
    insert: db.prepare('INSERT INTO friend_notes (from_account, to_account, kind, text, room_id, at) VALUES (?, ?, ?, ?, ?, ?)'),
    sent: db.prepare('SELECT COUNT(*) AS n FROM friend_notes WHERE from_account = ? AND kind = ? AND at > ?'),
    lastInvite: db.prepare("SELECT at FROM friend_notes WHERE from_account = ? AND to_account = ? AND kind = 'invite' ORDER BY at DESC LIMIT 1"),
    inbox: db.prepare(`SELECT n.id, n.kind, n.text, n.room_id AS roomId, n.at, n.read_at AS readAt,
        a.id AS fromId, a.display_name AS fromName, a.avatar_url AS fromAvatar
      FROM friend_notes n JOIN accounts a ON a.id = n.from_account
      WHERE n.to_account = ? AND n.at > ? ORDER BY n.at DESC LIMIT 30`),
    unread: db.prepare('SELECT COUNT(*) AS n FROM friend_notes WHERE to_account = ? AND read_at IS NULL AND at > ?'),
    read: db.prepare('UPDATE friend_notes SET read_at = ? WHERE to_account = ? AND read_at IS NULL'),
    prune: db.prepare('DELETE FROM friend_notes WHERE at < ?'),
    hidden: db.prepare('SELECT hidden FROM friend_presence_prefs WHERE account_id = ?'),
    botFriends: db.prepare('SELECT bot_name AS name, since FROM bot_friends WHERE account_id = ? ORDER BY since DESC LIMIT 100'),
    botFriendCount: db.prepare('SELECT COUNT(*) AS n FROM bot_friends WHERE account_id = ?'),
    addBotFriend: db.prepare('INSERT OR IGNORE INTO bot_friends (account_id, bot_name, since) VALUES (?, ?, ?)'),
    setHidden: db.prepare('INSERT INTO friend_presence_prefs (account_id, hidden) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET hidden = excluded.hidden'),
  };
  const isHidden = (accountId) => Boolean(q.hidden.get(accountId)?.hidden);
  // Phòng của một người cho bạn bè xem (ẩn mình thì coi như không online).
  const placeOf = (accountId) => {
    if (isHidden(accountId)) return null;
    const found = presence.where(accountId);
    const room = found && roomView(found.roomId, secret);
    return room ? { ...room, participantId: found.participantId } : null;
  };

  return {
    presence,
    hidden: isHidden,
    setHidden(accountId, hidden) {
      q.setHidden.run(accountId, hidden ? 1 : 0);
      return { ok: true, hidden };
    },
    botFriends: (accountId) => q.botFriends.all(accountId),
    addBotFriend(accountId, name) {
      if (!BOT_NAMES.has(name)) return { ok: false, error: 'unknown_bot' };
      if (q.botFriendCount.get(accountId).n >= BOT_FRIEND_MAX) return { ok: false, error: 'rate_limited' };
      q.addBotFriend.run(accountId, name, now());
      return { ok: true };
    },
    // Danh sách bạn (accounts.friends) kèm online + phòng.
    decorate(accountId, friends) {
      return friends.map((friend) => {
        const room = placeOf(friend.accountId);
        return { ...friend, online: Boolean(room), ...(room ? { room } : {}) };
      });
    },
    note(fromId, toId, text) {
      const body = cleanText(text);
      if (!body) return { ok: false, error: 'empty_note' };
      if (!accounts.areFriends(fromId, toId)) return { ok: false, error: 'not_friends' };
      if (q.sent.get(fromId, 'note', now() - NOTE_LIMIT[1]).n >= NOTE_LIMIT[0]) return { ok: false, error: 'rate_limited' };
      q.prune.run(now() - NOTE_KEEP_MS);
      q.insert.run(fromId, toId, 'note', body, null, now());
      notify?.(toId, 'note');
      return { ok: true };
    },
    // Mời bạn vào phòng mình đang ở (theo báo cáo của máy realtime, không tin phòng do trình duyệt gửi lên).
    invite(fromId, toId) {
      if (!accounts.areFriends(fromId, toId)) return { ok: false, error: 'not_friends' };
      const here = presence.where(fromId);
      if (!here || !roomView(here.roomId, secret)) return { ok: false, error: 'not_in_room' };
      if (presence.where(toId)?.roomId === here.roomId) return { ok: false, error: 'same_room' };
      if (q.sent.get(fromId, 'invite', now() - INVITE_LIMIT[1]).n >= INVITE_LIMIT[0]) return { ok: false, error: 'rate_limited' };
      if (now() - (q.lastInvite.get(fromId, toId)?.at || 0) < 2 * 60_000) return { ok: false, error: 'already_invited' };
      q.insert.run(fromId, toId, 'invite', null, here.roomId, now());
      notify?.(toId, 'invite');
      return { ok: true };
    },
    inbox(accountId) {
      const at = now();
      const items = q.inbox.all(accountId, at - NOTE_KEEP_MS).map((row) => {
        const live = row.kind === 'invite' && at - row.at < INVITE_TTL_MS ? roomView(row.roomId, secret) : null;
        return {
          id: row.id,
          kind: row.kind,
          at: row.at,
          read: row.readAt !== null,
          from: { accountId: row.fromId, displayName: row.fromName, ...(row.fromAvatar ? { avatarUrl: row.fromAvatar } : {}) },
          ...(row.kind === 'note' ? { text: row.text } : {}),
          ...(row.kind === 'invite' ? { room: live || { roomId: row.roomId, type: roomTypeOf(row.roomId), name: thienRoomName(row.roomId) || null }, expired: !live } : {}),
        };
      });
      return { items, unread: q.unread.get(accountId, at - NOTE_KEEP_MS).n };
    },
    markRead(accountId) {
      q.read.run(now(), accountId);
      return { ok: true };
    },
  };
}

export function openFriendLinks(accounts, options = {}) {
  return accounts ? createFriendLinks({ db: accounts.database, accounts, ...options }) : null;
}

// Báo các máy realtime: người này có thư mới (máy nào đang giữ kết nối của họ thì gửi inbox.notify).
export function realtimeInboxNotifier(realtimeInternalUrls, secret, fetcher = fetch) {
  const urls = (Array.isArray(realtimeInternalUrls) ? realtimeInternalUrls : String(realtimeInternalUrls || '').split(','))
    .map((value) => String(value).trim()).filter(Boolean);
  if (!urls.length || !secret) return null;
  return (accountId, kind) => {
    for (const baseUrl of urls) {
      fetcher(new URL('/internal/account-notify', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(secret) },
        body: JSON.stringify({ accountId, kind }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
    }
  };
}

const internalAllowed = (req, options) => {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const ERRORS = {
  not_friends: 403, not_in_room: 409, same_room: 409, already_invited: 429, rate_limited: 429, empty_note: 400,
};

export async function handleFriendLinksRequest(req, res, pathname, options) {
  const routes = ['/internal/presence', '/api/v1/me/inbox', '/api/v1/me/inbox/read', '/api/v1/me/friends/note', '/api/v1/me/friends/invite', '/api/v1/me/presence', '/api/v1/me/bot-friends'];
  if (!routes.includes(pathname)) return false;
  const links = options.friendLinks;
  if (!links) return json(req, res, 503, { error: 'accounts_disabled' }), true;

  if (pathname === '/internal/presence') {
    if (req.method !== 'POST' || !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    let input;
    try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
    if (!PARTICIPANT_ID.test(input?.nodeId || '') || !Array.isArray(input.entries) || input.entries.length > 20_000) return json(req, res, 400, { error: 'invalid_presence' }), true;
    const entries = input.entries.filter((entry) => ACCOUNT_ID.test(entry?.accountId || '') && ROOM_ID.test(entry?.roomId || '') && PARTICIPANT_ID.test(entry?.participantId || ''));
    links.presence.report(input.nodeId, entries);
    return json(req, res, 200, { ok: true, count: entries.length }), true;
  }

  const account = currentAccount(req, options);
  if (!account) return json(req, res, 401, { error: 'not_signed_in' }), true;
  if (pathname === '/api/v1/me/inbox' && req.method === 'GET') return json(req, res, 200, links.inbox(account.id)), true;
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  if (pathname === '/api/v1/me/inbox/read') return json(req, res, 200, links.markRead(account.id)), true;
  let input;
  try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
  // Kết bạn với bot (bot nhận lời trong phòng): lưu theo tên để ra vào phòng không mất.
  if (pathname === '/api/v1/me/bot-friends') {
    const result = typeof input?.name === 'string' ? links.addBotFriend(account.id, input.name) : { ok: false, error: 'unknown_bot' };
    return json(req, res, result.ok ? 200 : ERRORS[result.error] || 400, result.ok ? result : { error: result.error }), true;
  }
  if (pathname === '/api/v1/me/presence') {
    if (typeof input?.hidden !== 'boolean') return json(req, res, 400, { error: 'invalid_presence' }), true;
    return json(req, res, 200, links.setHidden(account.id, input.hidden)), true;
  }
  if (!ACCOUNT_ID.test(input?.accountId || '')) return json(req, res, 400, { error: 'invalid_friend' }), true;
  let result;
  if (pathname === '/api/v1/me/friends/note') {
    if (!allow(options, `friend-note:${account.id}`, NOTE_BURST)) return json(req, res, 429, { error: 'rate_limited' }), true;
    // Lời nhắn đi qua bộ lọc chữ và sổ khóa như chat.
    const restricted = options.moderation?.restriction({ accountId: account.id });
    if (restricted) return json(req, res, 403, { error: 'chat_restricted' }), true;
    if (options.moderation?.check(cleanText(input.text)).action === 'block') return json(req, res, 400, { error: 'text_not_allowed' }), true;
    result = links.note(account.id, input.accountId, input.text);
  } else result = links.invite(account.id, input.accountId);
  return json(req, res, result.ok ? 200 : ERRORS[result.error] || 400, result.ok ? result : { error: result.error }), true;
}
