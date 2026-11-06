import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createJoinTicket } from '@chanh-dien/session-token';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { WebSocket } from 'ws';
import { createModerationGuard } from '../moderation.mjs';
import { createRealtimeServer } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

function inbox(socket) {
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString('utf8'))));
  return messages;
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Hết thời gian chờ');
}

// API giả: ghi lại các lần gọi; violation trả theo `answers` (mặc định 'warn').
function fakeRemote(answers = []) {
  const calls = { violation: [], clones: [], suspect: [] };
  const remote = {
    calls,
    restrictions: [],
    state: async () => ({ words: { block: [], allow: [] }, restrictions: remote.restrictions }),
    violation: async (event) => {
      calls.violation.push(event);
      return answers.shift() || { action: 'warn' };
    },
    clones: async (event) => {
      calls.clones.push(event);
      return { bans: event.offenders.map(() => null) };
    },
    suspect: async (event) => {
      calls.suspect.push(event);
      return { reported: event.words };
    },
  };
  return remote;
}

async function startServer(t, remote, { now = Date.now } = {}) {
  const moderation = createModerationGuard({ secret: SECRET, remote, now });
  const server = createRealtimeServer({ secret: SECRET, moderation });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;
  async function join(participantId, displayName, claims = {}) {
    const ticket = createJoinTicket({ participantId, roomId: 'cinema-1', displayName, ...claims }, SECRET);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?ticket=${encodeURIComponent(ticket)}`);
    sockets.push(socket);
    const messages = inbox(socket);
    await once(socket, 'open');
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: 'cinema-1', displayName }));
    await waitFor(() => messages.find((message) => message.type === 'welcome' || message.type === 'protocol.error'));
    return { socket, messages };
  }
  const chat = (client, text, requestId = `r-${Math.random().toString(36).slice(2, 10)}`) => {
    client.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'chat.send', text, requestId }));
    return requestId;
  };
  return { server, moderation, join, chat };
}

test('tin có từ cấm bị chặn (không phát cho phòng), báo API; API trả tắt chat thì tin sau báo CHAT_MUTED', async (t) => {
  const remote = fakeRemote([{ action: 'warn' }, { action: 'mute', ban: { kind: 'mute', accountId: 'a-12345678ab', expiresAt: Date.now() + 600_000 } }]);
  const { join, chat } = await startServer(t, remote);
  const bad = await join('u-1', 'An', { accountId: 'a-12345678ab' });
  const other = await join('u-2', 'Bình');
  const first = chat(bad, 'đ.m thằng kia');
  const blocked = await waitFor(() => bad.messages.find((message) => message.requestId === first));
  assert.equal(blocked.code, 'CHAT_BLOCKED');
  await waitFor(() => remote.calls.violation.length === 1);
  assert.deepEqual(remote.calls.violation[0], {
    accountId: 'a-12345678ab', ipHash: null, name: 'An', roomId: 'cinema-1', strict: false, evidence: 'đ.* thằng kia', words: ['dm'],
  });
  chat(bad, 'vcl');
  await waitFor(() => bad.messages.find((message) => message.code === 'CHAT_MUTED' && !message.requestId));
  const third = chat(bad, 'xin chào cả nhà');
  const muted = await waitFor(() => bad.messages.find((message) => message.requestId === third));
  assert.equal(muted.code, 'CHAT_MUTED');
  assert.match(muted.message, /tạm khóa chat \(còn 10 phút\)/);
  // Người khác vẫn chat được, và không ai nhận tin bị chặn.
  chat(other, 'phim hay quá');
  await waitFor(() => bad.messages.find((message) => message.type === 'chat.message' && message.text === 'phim hay quá'));
  assert.equal(other.messages.some((message) => message.type === 'chat.message' && message.participantId === 'u-1'), false);
});

test('không có API: tự tắt chat trong phòng sau 4 lần chửi (phòng thường)', async (t) => {
  const { join, chat } = await startServer(t, null);
  const bad = await join('u-1', 'An');
  for (let index = 0; index < 4; index += 1) chat(bad, `dm ${index}`);
  await waitFor(() => bad.messages.find((message) => message.code === 'CHAT_MUTED'));
  const after = chat(bad, 'hello');
  assert.equal((await waitFor(() => bad.messages.find((message) => message.requestId === after))).code, 'CHAT_MUTED');
});

test('sổ khóa đồng bộ về: người đang trong phòng bị đá (BANNED, mã 4004); mở khóa xong vào lại được ngay', async (t) => {
  let skew = 0;
  const remote = fakeRemote();
  const { join, moderation } = await startServer(t, remote, { now: () => Date.now() + skew });
  const bad = await join('u-1', 'An', { accountId: 'a-12345678ab' });
  const good = await join('u-2', 'Bình');
  const closed = once(bad.socket, 'close');
  // API trả lệnh mới trước: khóa nick rồi tới lệnh tắt chat cũ hơn của cùng tài khoản — lệnh khóa phải thắng.
  remote.restrictions = [
    { id: 'k-abcdefgh', kind: 'ban', accountId: 'a-12345678ab', until: Date.now() + 3_600_000 },
    { id: 'k-mute0001', kind: 'mute', accountId: 'a-12345678ab', until: Date.now() + 600_000 },
  ];
  await moderation.sync();
  const [code] = await closed;
  assert.equal(code, 4004);
  const kicked = bad.messages.find((message) => message.code === 'BANNED');
  assert.match(kicked.message, /Tài khoản đang bị khóa \(còn 60 phút\)/);
  await waitFor(() => good.messages.some((message) => message.type === 'room.state' && !message.participants.some((person) => person.id === 'u-1')));
  const again = await join('u-3', 'An', { accountId: 'a-12345678ab' });
  assert.equal(again.messages.find((message) => message.type === 'protocol.error').code, 'BANNED');
  // Quản trị /unban: API đã mở, máy realtime chưa tới nhịp đồng bộ — lúc nối vào thì hỏi lại API.
  remote.restrictions = [];
  skew += 3_000;
  const back = await join('u-4', 'An', { accountId: 'a-12345678ab' });
  assert.ok(back.messages.some((message) => message.type === 'welcome'));
});

test('từ quản trị thêm (đồng bộ từ API) có hiệu lực ngay; từ khả nghi vẫn gửi nhưng báo API', async (t) => {
  const remote = fakeRemote();
  const { join, chat, moderation } = await startServer(t, remote);
  const client = await join('u-1', 'An');
  moderation.apply({ words: { block: ['ăn hại'], allow: [] }, restrictions: [] });
  const id = chat(client, 'đồ ăn hại');
  assert.equal((await waitFor(() => client.messages.find((message) => message.requestId === id))).code, 'CHAT_BLOCKED');
  chat(client, 'mày ngu quá');
  await waitFor(() => client.messages.find((message) => message.type === 'chat.message' && message.text === 'mày ngu quá'));
  await waitFor(() => remote.calls.suspect.length === 1);
  assert.deepEqual(remote.calls.suspect[0].words, ['ngu']);
  assert.equal(remote.calls.suspect[0].evidence, 'mày n** quá');
});

test('khách (nick mới) không gửi được link / số điện thoại; gửi lặp cùng nội dung bị chặn', async (t) => {
  const { join, chat } = await startServer(t, fakeRemote());
  const guest = await join('u-1', 'Khách');
  const link = chat(guest, 'vào web abc.xyz nhận quà');
  assert.equal((await waitFor(() => guest.messages.find((message) => message.requestId === link))).code, 'CHAT_PROMO');
  chat(guest, 'A Di Đà Phật');
  chat(guest, 'A Di Đà Phật');
  const third = chat(guest, 'a di đà phật!!');
  assert.equal((await waitFor(() => guest.messages.find((message) => message.requestId === third))).code, 'CHAT_REPEAT');
});

test('clone: nick mới nhắn trùng bị đá và báo API, chừa người nhắn đầu và nick cũ', async (t) => {
  const remote = fakeRemote();
  const { join, chat } = await startServer(t, remote);
  const text = 'Vào nhóm kiếm tiền online nhanh nhất nhé';
  const first = await join('u-1', 'Người đầu', { accountId: 'a-first-0001' });
  const old = await join('u-2', 'Nick cũ', { accountId: 'a-old-000001' });
  const clone1 = await join('u-3', 'Clone 1', { accountId: 'a-clone-0001', fresh: true });
  const clone2 = await join('u-4', 'Clone 2');
  for (const client of [first, old, clone1]) chat(client, text);
  await waitFor(() => first.messages.filter((message) => message.type === 'chat.message').length === 3);
  const closed = once(clone2.socket, 'close');
  const lastId = chat(clone2, text);
  await closed;
  assert.equal(clone2.messages.some((message) => message.type === 'chat.message' && message.participantId === 'u-4'), false, 'tin của clone thứ hai không được phát');
  assert.equal(clone2.messages.find((message) => message.code === 'BANNED').code, 'BANNED');
  assert.equal(clone2.messages.some((message) => message.requestId === lastId), false);
  await waitFor(() => clone1.messages.find((message) => message.code === 'BANNED'));
  await waitFor(() => remote.calls.clones.length === 1);
  assert.deepEqual(remote.calls.clones[0].offenders.map((offender) => offender.name), ['Clone 1', 'Clone 2']);
  assert.equal(remote.calls.clones[0].first.name, 'Người đầu');
  assert.equal(first.socket.readyState, WebSocket.OPEN);
  assert.equal(old.socket.readyState, WebSocket.OPEN);
});
