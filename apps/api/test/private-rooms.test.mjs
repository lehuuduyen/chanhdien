import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken, internalKey, verifyJoinTicket } from '@chanh-dien/session-token';
import { createFriendLinks } from '../friend-links.mjs';
import { openGardenStore } from '../garden.mjs';
import { createPrivateRooms } from '../private-rooms.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

function setup() {
  const accounts = createAccountStore();
  const make = (username, displayName) => accounts.register({ username, password: 'matkhau123', displayName }).account;
  const chu = make('chu.phong', 'Chủ');
  const ban = make('ban.than', 'Bạn');
  const la = make('nguoi.la', 'Lạ');
  accounts.addFriend(chu.id, ban.id);
  const garden = openGardenStore(accounts, 'America/Los_Angeles');
  const notified = [];
  const realtime = [];
  const friendLinks = createFriendLinks({ db: accounts.database, accounts, secret: SECRET, notify: (id, kind) => notified.push([id, kind]) });
  friendLinks.addBotFriend(chu.id, 'Lô Tô Vui');
  const privateRooms = createPrivateRooms({ db: accounts.database, accounts, garden, friendLinks, notifyRealtime: (body) => realtime.push(body) });
  const options = { secret: SECRET, accounts, garden, friendLinks, privateRooms, realtimeInternalUrl: null };
  const as = (account) => ({ cookie: `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}` });
  const call = (account, method, url, body) => request(options, method, url, { body, headers: as(account) });
  const coins = (account) => garden.me(account.id).coins;
  return { accounts, chu, ban, la, call, coins, notified, realtime, options, privateRooms };
}

test('phòng Lô Tô riêng: tạo trừ 50 xu một lần, mời bạn (người + bot), người lạ không mời được nhưng có link thì vào được', async () => {
  const { chu, ban, la, call, coins, notified, realtime, privateRooms } = setup();
  const before = coins(chu);
  assert.equal(before, 50);
  const created = await call(chu, 'POST', '/api/v1/private-rooms', { game: 'loto' });
  assert.equal(created.status, 200);
  const { roomId } = created.json.room;
  assert.match(roomId, /^loto-p-[a-z0-9]{8}$/);
  assert.equal(coins(chu), 0, 'trừ 50 xu');
  const again = await call(chu, 'POST', '/api/v1/private-rooms', { game: 'loto' });
  assert.deepEqual([again.json.existing, again.json.room.roomId, coins(chu)], [true, roomId, 0], 'đang có phòng mở: trả phòng đó, không trừ lần hai');
  assert.equal((await call(ban, 'POST', '/api/v1/private-rooms', { game: 'loto' })).status, 200);
  assert.equal((await call(la, 'POST', '/api/v1/private-rooms', { game: 'bau-cua' })).status, 400, 'chỉ Lô Tô');

  assert.equal((await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { accountId: la.id })).status, 403, 'chỉ mời bạn bè');
  assert.equal((await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { botName: 'Bot Lạ' })).status, 403, 'chỉ mời bạn bot đã lưu');
  const invited = await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { accountId: ban.id });
  assert.deepEqual(invited.json.room.members.map((member) => member.displayName), ['Bạn']);
  assert.deepEqual(notified.at(-1), [ban.id, 'invite'], 'bạn nhận lời mời trong hộp thư');
  const inbox = await call(ban, 'GET', '/api/v1/me/inbox');
  assert.equal(inbox.json.items[0].room.href, `/loto.html?room=${roomId}`);
  assert.equal((await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { botName: 'Lô Tô Vui' })).status, 200);
  assert.deepEqual(realtime.at(-1), { roomId, action: 'bot-add', name: 'Lô Tô Vui' });
  assert.equal((await call(ban, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { botName: 'Lô Tô Vui' })).status, 403, 'chỉ chủ phòng mời');

  // Vé vào phòng: chủ phòng và người được mời; khách chưa đăng nhập bị từ chối.
  const join = (account) => (account ? call(account, 'POST', '/api/v1/rooms/join', { roomId }) : request({ ...setup().options, privateRooms }, 'POST', '/api/v1/rooms/join', { body: { roomId, displayName: 'Khách' } }));
  const joined = await join(ban);
  assert.equal(joined.status, 200);
  assert.equal(verifyJoinTicket(joined.json.ticket, SECRET).value.roomId, roomId);
  assert.equal((await join(null)).status, 403);
  // Thành viên không phải bạn mở link (xem phòng / xin vé) là tự thành khách.
  const viaLink = await call(la, 'GET', `/api/v1/private-rooms/${roomId}`);
  assert.equal(viaLink.status, 200, 'có link là vào được, không cần kết bạn');
  assert.deepEqual(viaLink.json.room.members.map((member) => member.name || member.displayName), ['Bạn', 'Lô Tô Vui', 'Lạ']);
  assert.equal((await join(la)).status, 200);
  assert.equal((await call(ban, 'GET', `/api/v1/private-rooms/${roomId}`)).json.room.isOwner, false);

  // Đuổi: bỏ khỏi danh sách, báo máy realtime, không xin được vé nữa.
  const kicked = await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/kick`, { accountId: ban.id });
  assert.deepEqual(kicked.json.room.members.map((member) => member.name || member.displayName), ['Lô Tô Vui', 'Lạ']);
  assert.deepEqual(realtime.at(-1), { roomId, action: 'kick', accountId: ban.id });
  assert.equal((await join(ban)).status, 403);
  assert.equal((await join(ban)).json.error, 'private_room_kicked', 'bị đuổi thì link không dùng được nữa');
  assert.equal((await call(ban, 'GET', `/api/v1/private-rooms/${roomId}`)).json.error, 'kicked');
  // Chủ phòng mời lại thì vào được.
  assert.equal((await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { accountId: ban.id })).status, 200);
  assert.equal((await join(ban)).status, 200);

  // Máy realtime báo chủ phòng đã rời: phòng đóng, không ai vào được nữa; chủ phòng tạo được phòng mới.
  const internal = { 'x-internal-key': internalKey(SECRET) };
  const options = setup().options;
  assert.deepEqual((await request({ ...options, privateRooms }, 'POST', '/internal/private-rooms/info', { body: { roomId }, headers: internal })).json, { ok: true, owner: chu.id, bots: ['Lô Tô Vui'] });
  assert.equal((await request({ ...options, privateRooms }, 'POST', '/internal/private-rooms/closed', { body: { roomId } })).status, 403, 'cần khóa nội bộ');
  await request({ ...options, privateRooms }, 'POST', '/internal/private-rooms/closed', { body: { roomId }, headers: internal });
  assert.equal((await call(chu, 'POST', '/api/v1/rooms/join', { roomId })).status, 410);
  assert.equal((await call(chu, 'GET', '/api/v1/private-rooms/mine')).json.room, null);
  assert.equal((await call(chu, 'POST', '/api/v1/private-rooms', { game: 'loto' })).json.error, 'insufficient_coins', 'hết xu thì không mở được phòng mới');
});

test('phòng Lô Tô riêng: tối đa 20 người / bot được mời', async () => {
  const { accounts, chu, call, privateRooms } = setup();
  const { roomId } = (await call(chu, 'POST', '/api/v1/private-rooms', { game: 'loto' })).json.room;
  for (let index = 0; index < 20; index += 1) {
    const friend = accounts.register({ username: `ban.so${index}`, password: 'matkhau123', displayName: `Bạn ${index}` }).account;
    accounts.addFriend(chu.id, friend.id);
    assert.equal(privateRooms.invite(roomId, chu.id, { accountId: friend.id }).ok, true);
  }
  const extra = accounts.register({ username: 'ban.thua', password: 'matkhau123', displayName: 'Thừa' }).account;
  accounts.addFriend(chu.id, extra.id);
  assert.equal((await call(chu, 'POST', `/api/v1/private-rooms/${roomId}/invite`, { accountId: extra.id })).json.error, 'full');
  const stranger = accounts.register({ username: 'nguoi.co.link', password: 'matkhau123', displayName: 'Có link' }).account;
  assert.equal(privateRooms.view(roomId, stranger.id).error, 'full', 'phòng đủ người thì link không vào thêm được');
});
