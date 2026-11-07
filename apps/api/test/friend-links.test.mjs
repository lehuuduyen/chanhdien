import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken, internalKey, verifyRoomInvite } from '@chanh-dien/session-token';
import { createFriendLinks, createPresence } from '../friend-links.mjs';
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
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const accounts = createAccountStore();
  const make = (username, displayName) => accounts.register({ username, password: 'matkhau123', displayName }).account;
  const an = make('an.an', 'An');
  const binh = make('binh.binh', 'Bình');
  const chi = make('chi.chi', 'Chi');
  accounts.addFriend(an.id, binh.id);
  accounts.addFriend(an.id, chi.id);
  const notified = [];
  const friendLinks = createFriendLinks({
    db: accounts.database, accounts, secret: SECRET, now, presence: createPresence({ now }), notify: (id, kind) => notified.push([id, kind]),
  });
  const moderation = { check: (text) => ({ action: /tục/.test(text) ? 'block' : 'ok' }), restriction: () => null };
  const options = { secret: SECRET, accounts, friendLinks, moderation };
  const as = (account) => ({ cookie: `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}` });
  const call = (account, method, url, body) => request(options, method, url, { body, headers: as(account) });
  const presence = (nodeId, entries) => request(options, 'POST', '/internal/presence', { body: { nodeId, entries }, headers: { 'x-internal-key': internalKey(SECRET) } });
  return { an, binh, chi, call, presence, notified, tick: (ms) => { clock += ms; }, options };
}

test('bạn bè: máy realtime giữ vị trí nội bộ nhưng danh sách chỉ trả online; ẩn mình thì bạn thấy offline', async () => {
  const { an, binh, chi, call, presence, tick } = setup();
  assert.equal((await request({ secret: SECRET, friendLinks: setup().options.friendLinks }, 'POST', '/internal/presence', { body: { nodeId: 'rt-1', entries: [] } })).status, 403);
  assert.equal((await presence('rt-1', [{ accountId: binh.id, roomId: 'thien-az-vi-1', participantId: 'p-binh' }])).json.count, 1);
  await presence('rt-2', [{ accountId: chi.id, roomId: 'loto-1', participantId: 'p-chi' }, { accountId: 'xấu', roomId: 'x', participantId: 'y' }]);
  const listed = (await call(an, 'GET', '/api/v1/me/friends')).json;
  const byName = Object.fromEntries(listed.friends.map((friend) => [friend.displayName, friend]));
  assert.equal(listed.hidden, false);
  assert.equal(byName['Bình'].online, true);
  assert.equal(byName.Chi.online, true);
  assert.equal('room' in byName['Bình'], false, 'không trả tên phòng, mã mời hay participantId');
  assert.equal('room' in byName.Chi, false, 'phòng game cũng không lộ trang / phòng hiện tại');

  assert.deepEqual((await call(binh, 'POST', '/api/v1/me/presence', { hidden: true })).json, { ok: true, hidden: true });
  assert.equal((await call(an, 'GET', '/api/v1/me/friends')).json.friends.find((friend) => friend.displayName === 'Bình').online, false, 'ẩn mình');
  // Máy realtime không báo lại quá 45 giây: coi như offline.
  tick(46_000);
  assert.equal((await call(an, 'GET', '/api/v1/me/friends')).json.friends.find((friend) => friend.displayName === 'Chi').online, false);
});

test('lời nhắn (cả khi bạn không online) và lời mời vào phòng mình: chỉ giữa bạn bè, qua bộ lọc, có hạn mức; người nhận được báo + hộp thư', async () => {
  const { an, binh, chi, call, presence, notified, tick } = setup();
  assert.equal((await call(binh, 'POST', '/api/v1/me/friends/note', { accountId: chi.id, text: 'chào' })).status, 403, 'Bình và Chi chưa là bạn');
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/note', { accountId: binh.id, text: 'đồ tục' })).json.error, 'text_not_allowed');
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/note', { accountId: binh.id, text: '   ' })).json.error, 'empty_note');
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/note', { accountId: binh.id, text: 'Tối nay 8 giờ tụng kinh nhé 🙏' })).status, 200);
  // Mời: phải đang ở trong phòng (theo máy realtime), không mời người cùng phòng, không mời dồn.
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/invite', { accountId: binh.id })).json.error, 'not_in_room');
  await presence('rt-1', [{ accountId: an.id, roomId: 'thien-az-vi-1', participantId: 'p-an' }]);
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/invite', { accountId: binh.id })).status, 200);
  assert.equal((await call(an, 'POST', '/api/v1/me/friends/invite', { accountId: binh.id })).json.error, 'already_invited');
  assert.deepEqual(notified, [[binh.id, 'note'], [binh.id, 'invite']]);

  const box = (await call(binh, 'GET', '/api/v1/me/inbox')).json;
  assert.equal(box.unread, 2);
  const [invite, note] = box.items;
  assert.deepEqual([invite.kind, invite.from.displayName, invite.room.roomId, invite.expired], ['invite', 'An', 'thien-az-vi-1', false]);
  assert.equal(verifyRoomInvite(invite.room.inviteCode, SECRET).ok, true);
  assert.deepEqual([note.kind, note.text], ['note', 'Tối nay 8 giờ tụng kinh nhé 🙏']);
  await call(binh, 'POST', '/api/v1/me/inbox/read', {});
  tick(16 * 60_000);
  const later = (await call(binh, 'GET', '/api/v1/me/inbox')).json;
  assert.equal(later.unread, 0);
  assert.deepEqual([later.items[0].expired, later.items[0].room.inviteCode], [true, undefined], 'lời mời quá 15 phút');
  assert.equal((await call(binh, 'GET', '/api/v1/me/inbox')).status, 200);
  assert.equal((await request(setup().options, 'GET', '/api/v1/me/inbox')).status, 401, 'khách');
});

test('bạn bot lưu theo tên trong tài khoản (ra vào phòng không mất); chỉ nhận tên bot có thật', async () => {
  const { an, call } = setup();
  assert.equal((await call(an, 'POST', '/api/v1/me/bot-friends', { name: 'Như Ý' })).status, 200);
  assert.equal((await call(an, 'POST', '/api/v1/me/bot-friends', { name: 'Như Ý' })).status, 200, 'gọi lại không sao');
  assert.equal((await call(an, 'POST', '/api/v1/me/bot-friends', { name: 'Grace' })).status, 200);
  assert.equal((await call(an, 'POST', '/api/v1/me/bot-friends', { name: 'Người Lạ' })).json.error, 'unknown_bot');
  const names = (await call(an, 'GET', '/api/v1/me/friends')).json.botFriends.map((item) => item.name).sort();
  assert.deepEqual(names, ['Grace', 'Như Ý']);
});

test('tin nhắn riêng: cuộc trò chuyện hai chiều với một bạn (cũ trước), mở ra là đọc tin của bạn đó; không phải bạn thì không xem được', async () => {
  const { an, binh, chi, call, tick } = setup();
  await call(an, 'POST', '/api/v1/me/friends/note', { accountId: binh.id, text: 'Chào Bình' });
  tick(1_000);
  await call(binh, 'POST', '/api/v1/me/friends/note', { accountId: an.id, text: 'Chào An 🙏' });
  tick(1_000);
  await call(chi, 'POST', '/api/v1/me/friends/note', { accountId: an.id, text: 'Chi đây' });
  const thread = (await call(an, 'GET', `/api/v1/me/friends/thread?with=${binh.id}`)).json;
  assert.deepEqual(thread.items.map(({ mine, text }) => [mine, text]), [[true, 'Chào Bình'], [false, 'Chào An 🙏']]);
  const inbox = (await call(an, 'GET', '/api/v1/me/inbox')).json;
  assert.equal(inbox.unread, 1, 'chỉ tin của Bình được đánh dấu đã đọc, tin của Chi vẫn mới');
  assert.equal((await call(binh, 'GET', `/api/v1/me/friends/thread?with=${chi.id}`)).status, 403, 'Bình và Chi chưa là bạn');
  assert.equal((await call(an, 'GET', '/api/v1/me/friends/thread?with=xau')).status, 400);
});

test('tin nhắn bạn bè chỉ giữ trong ngày: qua nửa đêm (giờ California) thì hộp thư và cuộc trò chuyện trống', async () => {
  const { an, binh, call, tick } = setup();
  tick(23 * 60 * 60_000); // 23:00
  await call(an, 'POST', '/api/v1/me/friends/note', { accountId: binh.id, text: 'Ngủ ngon nha' });
  assert.equal((await call(binh, 'GET', '/api/v1/me/inbox')).json.items.length, 1);
  tick(2 * 60 * 60_000); // 01:00 hôm sau
  assert.deepEqual((await call(binh, 'GET', '/api/v1/me/inbox')).json, { items: [], unread: 0 });
  assert.deepEqual((await call(binh, 'GET', `/api/v1/me/friends/thread?with=${an.id}`)).json.items, []);
});
