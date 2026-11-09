// Phòng riêng cho nhóm bạn: Lô Tô (loto-p-<8 ký tự>) hoặc Rạp phim xem chung (cinema-p-<8 ký tự>). Chủ phòng (thành viên
// đã đăng nhập) bỏ PRIVATE_GAMES[game].price xu để mở phòng, mỗi loại một phòng đang mở. Tối đa maxGuests khách: chủ phòng mời bạn đã lưu (người: accounts.areFriends, bạn bot:
// bảng bot_friends), hoặc gửi link phòng — thành viên đã đăng nhập mở link là tự thành khách (mã phòng ngẫu nhiên là
// "chìa khóa"). Chỉ chủ phòng và khách nhận được vé vào phòng; bot được mời do máy realtime đưa vào bàn.
// Chủ phòng đuổi được người / bot; người bị đuổi không vào lại bằng link được, trừ khi chủ phòng mời lại.
// Phòng sống tới khi chủ phòng rời phòng (máy realtime báo /internal/private-rooms/closed).
//
//   POST /api/v1/private-rooms                      { game: 'loto' | 'cinema' } → { room } (đang có phòng loại đó thì trả phòng đó, không trừ xu)
//   GET  /api/v1/private-rooms/mine?game=<loại>     → { room | null }
//   GET  /api/v1/private-rooms/<mã>                 → { room } (chủ phòng / khách; người mở link thành khách)
//   POST /api/v1/private-rooms/<mã>/invite          { accountId } | { botName }
//   POST /api/v1/private-rooms/<mã>/kick            { accountId } | { botName }
//   POST /internal/private-rooms/info               { roomId } → { ok, owner, bots }   (máy realtime, khóa nội bộ)
//   POST /internal/private-rooms/closed             { roomId }
import { randomInt, timingSafeEqual } from 'node:crypto';
import { isPrivateRoomId, PRIVATE_GAMES, privateRoomGame } from '@chanh-dien/room-rules';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { currentAccount, sameOrigin } from './auth.mjs';
import { json, readJson } from './http.mjs';

const ACCOUNT_ID = /^a-[A-Za-z0-9-]{8,64}$/;
const ERRORS = {
  not_found: 404, closed: 410, not_owner: 403, not_invited: 403, kicked: 403, not_friends: 403, full: 409, insufficient_coins: 409,
  already_member: 409, invalid: 400, garden_disabled: 503,
};

export function createPrivateRooms({ db, accounts, garden, friendLinks = null, notifyRealtime = null, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS private_rooms (
      id TEXT PRIMARY KEY,
      owner_account TEXT NOT NULL REFERENCES accounts(id),
      game TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS private_rooms_owner ON private_rooms (owner_account, status);
    CREATE TABLE IF NOT EXISTS private_room_members (
      room_id TEXT NOT NULL REFERENCES private_rooms(id),
      kind TEXT NOT NULL CHECK (kind IN ('account', 'bot')),
      member TEXT NOT NULL,
      invited_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, kind, member)
    );
    CREATE TABLE IF NOT EXISTS private_room_kicked (
      room_id TEXT NOT NULL REFERENCES private_rooms(id),
      account_id TEXT NOT NULL,
      kicked_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, account_id)
    );`);
  const q = {
    room: db.prepare('SELECT id, owner_account AS owner, game, status, created_at AS createdAt FROM private_rooms WHERE id = ?'),
    openOf: db.prepare("SELECT id FROM private_rooms WHERE owner_account = ? AND game = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1"),
    add: db.prepare("INSERT INTO private_rooms (id, owner_account, game, status, created_at) VALUES (?, ?, ?, 'open', ?)"),
    close: db.prepare("UPDATE private_rooms SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'"),
    members: db.prepare('SELECT kind, member FROM private_room_members WHERE room_id = ? ORDER BY invited_at'),
    member: db.prepare('SELECT 1 FROM private_room_members WHERE room_id = ? AND kind = ? AND member = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM private_room_members WHERE room_id = ?'),
    invite: db.prepare('INSERT INTO private_room_members (room_id, kind, member, invited_at) VALUES (?, ?, ?, ?)'),
    kick: db.prepare('DELETE FROM private_room_members WHERE room_id = ? AND kind = ? AND member = ?'),
    ban: db.prepare('INSERT OR REPLACE INTO private_room_kicked (room_id, account_id, kicked_at) VALUES (?, ?, ?)'),
    unban: db.prepare('DELETE FROM private_room_kicked WHERE room_id = ? AND account_id = ?'),
    banned: db.prepare('SELECT 1 FROM private_room_kicked WHERE room_id = ? AND account_id = ?'),
    name: db.prepare('SELECT display_name AS name, avatar_url AS avatarUrl FROM accounts WHERE id = ?'),
  };
  const limits = (roomId) => PRIVATE_GAMES[privateRoomGame(roomId)] || PRIVATE_GAMES.loto;
  const newId = (game) => `${game}-p-${Array.from({ length: 8 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[randomInt(36)]).join('')}`;
  const person = (accountId) => {
    const row = q.name.get(accountId);
    return { kind: 'account', accountId, displayName: row?.name || 'Người chơi', ...(row?.avatarUrl ? { avatarUrl: row.avatarUrl } : {}) };
  };
  const view = (room, viewerId) => ({
    roomId: room.id, game: room.game, open: room.status === 'open', isOwner: room.owner === viewerId,
    owner: person(room.owner),
    members: q.members.all(room.id).map((row) => (row.kind === 'bot' ? { kind: 'bot', name: row.member } : person(row.member))),
    maxGuests: limits(room.id).maxGuests, price: limits(room.id).price,
  });
  // Chủ phòng / khách thì cho qua; thành viên khác mở link thì thành khách (chưa bị đuổi, phòng còn chỗ).
  const admit = (room, accountId) => {
    if (room.owner === accountId || q.member.get(room.id, 'account', accountId)) return { ok: true };
    if (room.status !== 'open') return { ok: false, error: 'closed' };
    if (q.banned.get(room.id, accountId)) return { ok: false, error: 'kicked' };
    if (q.count.get(room.id).n >= limits(room.id).maxGuests) return { ok: false, error: 'full' };
    q.invite.run(room.id, 'account', accountId, now());
    return { ok: true };
  };
  const ownedRoom = (roomId, ownerId) => {
    const room = isPrivateRoomId(roomId) ? q.room.get(roomId) : null;
    if (!room) return { error: 'not_found' };
    if (room.status !== 'open') return { error: 'closed' };
    if (room.owner !== ownerId) return { error: 'not_owner' };
    return { room };
  };
  // Người / bot được nhắc trong lệnh mời, đuổi: { kind, member } hoặc null.
  const target = (input) => {
    if (typeof input?.accountId === 'string' && ACCOUNT_ID.test(input.accountId)) return { kind: 'account', member: input.accountId };
    if (typeof input?.botName === 'string' && input.botName.trim() && input.botName.length <= 40) return { kind: 'bot', member: input.botName.trim() };
    return null;
  };

  return {
    create(ownerId, game = 'loto') {
      if (!Object.hasOwn(PRIVATE_GAMES, game)) return { ok: false, error: 'invalid' };
      if (!garden) return { ok: false, error: 'garden_disabled' };
      const existing = q.openOf.get(ownerId, game);
      if (existing) return { ok: true, existing: true, room: view(q.room.get(existing.id), ownerId) };
      const roomId = newId(game);
      // Trừ xu trước (ghi sổ, khóa theo mã phòng), tạo phòng sau.
      const paid = garden.payPrivateRoom({ accountId: ownerId, amount: PRIVATE_GAMES[game].price, key: `private-${roomId}` });
      if (!paid.ok) return { ok: false, error: paid.code === 'INSUFFICIENT_COINS' ? 'insufficient_coins' : 'invalid', coins: paid.coins };
      q.add.run(roomId, ownerId, game, now());
      return { ok: true, coins: paid.coins, room: view(q.room.get(roomId), ownerId) };
    },
    mine(ownerId, game = 'loto') {
      if (!Object.hasOwn(PRIVATE_GAMES, game)) return null;
      const existing = q.openOf.get(ownerId, game);
      return existing ? view(q.room.get(existing.id), ownerId) : null;
    },
    view(roomId, viewerId) {
      const room = isPrivateRoomId(roomId) ? q.room.get(roomId) : null;
      if (!room) return { ok: false, error: 'not_found' };
      const admitted = admit(room, viewerId);
      return admitted.ok ? { ok: true, room: view(room, viewerId) } : admitted;
    },
    canJoin(roomId, accountId) {
      const room = isPrivateRoomId(roomId) ? q.room.get(roomId) : null;
      if (!room) return { ok: false, error: 'not_found' };
      if (room.status !== 'open') return { ok: false, error: 'closed' };
      if (!accountId) return { ok: false, error: 'not_invited' };
      return admit(room, accountId);
    },
    invite(roomId, ownerId, input) {
      const { room, error } = ownedRoom(roomId, ownerId);
      if (error) return { ok: false, error };
      const who = target(input);
      if (!who || (who.kind === 'account' && who.member === ownerId)) return { ok: false, error: 'invalid' };
      if (q.member.get(room.id, who.kind, who.member)) return { ok: false, error: 'already_member' };
      // Chỉ mời bạn đã lưu: bạn người (kết bạn trong tài khoản) hoặc bạn bot.
      const friend = who.kind === 'account'
        ? accounts.areFriends(ownerId, who.member)
        : Boolean(friendLinks?.botFriends(ownerId).some((bot) => bot.name === who.member));
      if (!friend) return { ok: false, error: 'not_friends' };
      if (q.count.get(room.id).n >= limits(room.id).maxGuests) return { ok: false, error: 'full' };
      q.invite.run(room.id, who.kind, who.member, now());
      if (who.kind === 'account') q.unban.run(room.id, who.member);
      if (who.kind === 'account') friendLinks?.inviteToRoom?.(ownerId, who.member, room.id);
      else notifyRealtime?.({ roomId: room.id, action: 'bot-add', name: who.member });
      return { ok: true, room: view(room, ownerId) };
    },
    kick(roomId, ownerId, input) {
      const { room, error } = ownedRoom(roomId, ownerId);
      if (error) return { ok: false, error };
      const who = target(input);
      if (!who || !q.member.get(room.id, who.kind, who.member)) return { ok: false, error: 'invalid' };
      q.kick.run(room.id, who.kind, who.member);
      if (who.kind === 'account') q.ban.run(room.id, who.member, now());
      notifyRealtime?.({ roomId: room.id, action: who.kind === 'bot' ? 'bot-remove' : 'kick', ...(who.kind === 'bot' ? { name: who.member } : { accountId: who.member }) });
      return { ok: true, room: view(room, ownerId) };
    },
    // Máy realtime mở phòng: cần biết chủ phòng (để đóng phòng khi chủ rời) và các bot đã được mời.
    info(roomId) {
      const room = isPrivateRoomId(roomId) ? q.room.get(roomId) : null;
      if (!room || room.status !== 'open') return { ok: false, error: room ? 'closed' : 'not_found' };
      return { ok: true, owner: room.owner, bots: q.members.all(room.id).filter((row) => row.kind === 'bot').map((row) => row.member) };
    },
    closed(roomId) {
      if (!isPrivateRoomId(roomId)) return { ok: false, error: 'not_found' };
      q.close.run(now(), roomId);
      return { ok: true };
    },
  };
}

// Báo các máy realtime: thêm / bỏ bot được mời, đuổi người. Máy nào đang giữ phòng thì áp dụng.
export function realtimePrivateRoomNotifier(realtimeInternalUrls, secret, fetcher = fetch) {
  const urls = (Array.isArray(realtimeInternalUrls) ? realtimeInternalUrls : String(realtimeInternalUrls || '').split(','))
    .map((value) => String(value).trim()).filter(Boolean);
  if (!urls.length || !secret) return null;
  return (body) => {
    for (const baseUrl of urls) {
      fetcher(new URL('/internal/private-room', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(secret) },
        body: JSON.stringify(body),
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

const reply = (req, res, result) => json(req, res, result.ok ? 200 : ERRORS[result.error] || 400, result.ok ? result : { error: result.error, ...(result.coins !== undefined ? { coins: result.coins } : {}) });

export async function handlePrivateRoomRequest(req, res, pathname, options) {
  if (!pathname.startsWith('/api/v1/private-rooms') && !pathname.startsWith('/internal/private-rooms/')) return false;
  const rooms = options.privateRooms;
  if (!rooms) return json(req, res, 503, { error: 'accounts_disabled' }), true;

  if (pathname === '/internal/private-rooms/info' || pathname === '/internal/private-rooms/closed') {
    if (req.method !== 'POST' || !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    let input;
    try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
    const roomId = typeof input?.roomId === 'string' ? input.roomId : '';
    return json(req, res, 200, pathname.endsWith('/info') ? rooms.info(roomId) : rooms.closed(roomId)), true;
  }

  const account = currentAccount(req, options);
  if (!account) return json(req, res, 401, { error: 'not_signed_in' }), true;
  if (pathname === '/api/v1/private-rooms/mine' && req.method === 'GET') {
    const game = new URL(req.url, 'http://local').searchParams.get('game') || 'loto';
    return json(req, res, 200, { room: rooms.mine(account.id, game) }), true;
  }
  const match = /^\/api\/v1\/private-rooms(?:\/([a-z0-9-]{1,40}))?(?:\/(invite|kick))?$/.exec(pathname);
  if (!match) return json(req, res, 404, { error: 'not_found' }), true;
  const [, roomId, action] = match;
  if (roomId && !action && req.method === 'GET') return reply(req, res, rooms.view(roomId, account.id)), true;
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  let input;
  try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
  if (!roomId) return reply(req, res, rooms.create(account.id, input?.game ?? 'loto')), true;
  if (!action) return json(req, res, 404, { error: 'not_found' }), true;
  return reply(req, res, action === 'invite' ? rooms.invite(roomId, account.id, input) : rooms.kick(roomId, account.id, input)), true;
}
