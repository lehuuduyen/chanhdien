import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMemoryDirectory } from '@chanh-dien/room-directory';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { parseServerMessage } from '@chanh-dien/protocol';
import { createJoinTicket, internalKey } from '@chanh-dien/session-token';
import { WebSocket } from 'ws';
import { createRealtimeServer, handleRealtimeRequest, Room, RoomRegistry } from '../server.mjs';

// Rạp phim có hình nhân vật Nam/Nữ (gán theo mã người khi chưa chọn): bỏ ra khi so sánh phần còn lại.
const withoutSkin = ({ skin, ...rest }) => (assert.ok(skin === undefined || ['man', 'woman'].includes(skin)), rest);

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const LAST_THIEN_SEAT = `S-${THIEN_RULES.seats}`;

function response() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status; return this; },
    end(body = '') { this.body += body; },
  };
}

function waitForMessage(socket, predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Hết thời gian chờ WebSocket message'));
    }, timeoutMs);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString('utf8'));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

async function waitForCondition(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Hết thời gian chờ điều kiện');
}

async function connectClient(port, participantId, displayName, options = {}) {
  const ticket = options.ticket || createJoinTicket({ participantId, roomId: 'cinema-1', displayName }, SECRET);
  const query = new URLSearchParams({ ticket });
  if (options.resumeToken) query.set('resumeToken', options.resumeToken);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`);
  await once(socket, 'open');
  const welcome = waitForMessage(socket, (message) => message.type === 'welcome');
  const state = waitForMessage(socket, (message) => message.type === 'room.state' && message.participants.some((item) => item.id === participantId));
  socket.send(JSON.stringify({
    v: 1,
    type: 'hello',
    roomId: 'cinema-1',
    displayName,
    ...(options.resumeToken ? { resumeToken: options.resumeToken } : {}),
  }));
  const playback = options.waitPlayback ? waitForMessage(socket, (message) => message.type === 'playback.state') : null;
  const [welcomeMessage, stateMessage, playbackMessage] = await Promise.all([welcome, state, playback]);
  return { socket, ticket, welcome: welcomeMessage, state: stateMessage, playback: playbackMessage };
}

test('realtime health công bố protocol, máy và số phòng', () => {
  const res = response();
  handleRealtimeRequest({ method: 'GET', url: '/health' }, res, new RoomRegistry({ nodeId: 'rt-test' }));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), {
    status: 'ok', service: 'realtime', protocolVersion: 1, nodeId: 'rt-test', rooms: 0, connections: 0,
  });
});

test('room từ chối hai người chọn cùng một ghế', () => {
  const room = new Room('cinema-1');
  const socket = { readyState: WebSocket.CLOSED };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.join(socket, { participantId: 'u-2', displayName: 'Bình' });
  assert.deepEqual(room.selectSeat('u-1', 'S-1'), { ok: true });
  assert.deepEqual(room.selectSeat('u-2', 'S-1'), { ok: false, error: 'SEAT_TAKEN' });
});

test('room giữ ghế khi rớt mạng và xóa sau thời hạn resume', async () => {
  const room = new Room('cinema-1', { resumeTtlMs: 20 });
  const socket = { readyState: WebSocket.CLOSED };
  const joined = room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.selectSeat('u-1', 'S-1');
  assert.equal(room.disconnect('u-1', socket), true);
  assert.deepEqual(withoutSkin(room.snapshot().participants[0]), {
    id: 'u-1', displayName: 'An', seatId: 'S-1', connected: false,
  });

  const nextSocket = { readyState: WebSocket.CLOSED };
  const resumed = room.join(nextSocket, { participantId: 'u-1', displayName: 'An' }, joined.participant.resumeToken);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.participant.seatId, 'S-1');
  room.disconnect('u-1', nextSocket);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(room.participants.size, 0);
});

test('hai client vào cùng phòng, chọn ghế và nhận chat realtime', async (t) => {
  const server = createRealtimeServer({ secret: SECRET });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const anClient = await connectClient(port, 'u-an', 'An');
  const an = anClient.socket;
  sockets.push(an);
  const binhClient = await connectClient(port, 'u-binh', 'Bình');
  const binh = binhClient.socket;
  sockets.push(binh);

  const selected = waitForMessage(an, (message) => message.type === 'room.state'
    && message.participants.some((item) => item.id === 'u-an' && item.seatId === 'S-1'));
  an.send(JSON.stringify({ v: 1, type: 'seat.select', requestId: 'seat-1', seatId: 'S-1' }));
  await selected;

  const conflict = waitForMessage(binh, (message) => message.type === 'protocol.error' && message.code === 'SEAT_TAKEN');
  binh.send(JSON.stringify({ v: 1, type: 'seat.select', requestId: 'seat-2', seatId: 'S-1' }));
  assert.equal((await conflict).requestId, 'seat-2');

  const chat = waitForMessage(an, (message) => message.type === 'chat.message' && message.participantId === 'u-binh');
  binh.send(JSON.stringify({ v: 1, type: 'chat.send', requestId: 'chat-1', text: 'Chào An' }));
  assert.equal((await chat).text, 'Chào An');
});

test('client nối lại bằng resume token và giữ nguyên ghế', async (t) => {
  const server = createRealtimeServer({ secret: SECRET });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const first = await connectClient(port, 'u-an', 'An');
  sockets.push(first.socket);
  const selected = waitForMessage(first.socket, (message) => message.type === 'room.state'
    && message.participants.some((item) => item.id === 'u-an' && item.seatId === 'S-7'));
  first.socket.send(JSON.stringify({ v: 1, type: 'seat.select', requestId: 'seat-7', seatId: 'S-7' }));
  await selected;
  const closed = once(first.socket, 'close');
  first.socket.close();
  await closed;

  await waitForCondition(() => server.roomRegistry.rooms.get('cinema-1')?.snapshot().participants[0]?.connected === false);
  const retained = server.roomRegistry.rooms.get('cinema-1').snapshot().participants[0];
  assert.equal(retained.connected, false);
  assert.equal(retained.seatId, 'S-7');

  const resumed = await connectClient(port, 'u-an', 'An', {
    ticket: 'expired-ticket',
    resumeToken: first.welcome.resumeToken,
  });
  sockets.push(resumed.socket);
  assert.equal(resumed.welcome.resumeToken, first.welcome.resumeToken);
  assert.deepEqual(withoutSkin(resumed.state.participants[0]), {
    id: 'u-an', displayName: 'An', seatId: 'S-7', connected: true,
  });
});

async function startNode(directory, nodeId, options = {}) {
  const server = createRealtimeServer({
    secret: SECRET, directory, nodeId, leaseTtlMs: 150, nodeTtlMs: 150, tickMs: 25, ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  server.roomRegistry.publicUrl = `ws://127.0.0.1:${server.address().port}/ws`;
  return server;
}

// Giả lập kill -9: máy ngừng gia hạn lease và mất mọi kết nối, không kịp trả lease hay lưu thêm.
async function crash(server) {
  server.roomRegistry.stop();
  for (const room of server.roomRegistry.rooms.values()) room.close(1001, 'crash');
  server.roomRegistry.rooms.clear();
  for (const client of server.webSocketServer.clients) client.terminate();
  await new Promise((resolve) => server.close(resolve));
}

test('máy giữ phòng chết thì máy khác dựng lại phòng, người dùng về đúng ghế', async (t) => {
  const directory = createMemoryDirectory();
  const nodeA = await startNode(directory, 'rt-a');
  const nodeB = await startNode(directory, 'rt-b');
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    if (nodeB.listening) await new Promise((resolve) => nodeB.close(resolve));
  });

  const an = await connectClient(nodeA.address().port, 'u-an', 'An');
  sockets.push(an.socket);
  assert.equal(an.welcome.epoch, 1);
  const selected = waitForMessage(an.socket, (message) => message.type === 'room.state'
    && message.participants.some((item) => item.id === 'u-an' && item.seatId === 'S-12'));
  an.socket.send(JSON.stringify({ v: 1, type: 'seat.select', requestId: 'seat-12', seatId: 'S-12' }));
  await selected;
  await waitForCondition(async () => (await directory.loadSnapshot('cinema-1'))?.participants.some((item) => item.seatId === 'S-12'));

  // Phòng đang ở máy A thì máy B từ chối nhận kết nối cho phòng đó.
  await assert.rejects(connectClient(nodeB.address().port, 'u-binh', 'Bình'));

  await crash(nodeA);
  await waitForCondition(async () => (await directory.getRoomOwner('cinema-1')) === null, 1_000);

  const resumed = await connectClient(nodeB.address().port, 'u-an', 'An', {
    ticket: 'expired-ticket',
    resumeToken: an.welcome.resumeToken,
  });
  sockets.push(resumed.socket);
  assert.equal(resumed.welcome.epoch, 2);
  assert.equal(resumed.welcome.resumeToken, an.welcome.resumeToken);
  assert.deepEqual(resumed.state.participants.map(withoutSkin), [{ id: 'u-an', displayName: 'An', seatId: 'S-12', connected: true }]);
  assert.deepEqual(await directory.getRoomOwner('cinema-1'), { epoch: 2, nodeId: 'rt-b' });
});

test('máy cũ sống lại sau khi mất lease thì tự đóng phòng và không ghi đè snapshot', async (t) => {
  const directory = createMemoryDirectory();
  const nodeA = await startNode(directory, 'rt-a');
  const nodeB = await startNode(directory, 'rt-b');
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    for (const node of [nodeA, nodeB]) if (node.listening) await new Promise((resolve) => node.close(resolve));
  });

  const an = await connectClient(nodeA.address().port, 'u-an', 'An');
  sockets.push(an.socket);
  await waitForCondition(async () => (await directory.loadSnapshot('cinema-1')) !== null);

  // Máy A bị treo: ngừng gia hạn nhưng kết nối vẫn còn.
  nodeA.roomRegistry.stop();
  await waitForCondition(async () => (await directory.getRoomOwner('cinema-1')) === null, 1_000);
  const binh = await connectClient(nodeB.address().port, 'u-binh', 'Bình');
  sockets.push(binh.socket);
  assert.equal(binh.welcome.epoch, 2);

  // Máy A chạy lại: gia hạn thất bại, đóng phòng với mã 4002 để client hỏi API phòng đang ở đâu.
  const closed = once(an.socket, 'close');
  await nodeA.roomRegistry.tick();
  const [code] = await closed;
  assert.equal(code, 4002);
  assert.equal(nodeA.roomRegistry.rooms.size, 0);
  assert.equal(await directory.saveSnapshot('cinema-1', 'rt-a', 1, { revision: 99, participants: [] }), false);
  assert.deepEqual(await directory.getRoomOwner('cinema-1'), { epoch: 2, nodeId: 'rt-b' });
});

test('rút máy trả lease và giữ snapshot để máy khác nhận ngay', async (t) => {
  const directory = createMemoryDirectory();
  const nodeA = await startNode(directory, 'rt-a', { leaseTtlMs: 10_000 });
  const nodeB = await startNode(directory, 'rt-b', { leaseTtlMs: 10_000 });
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    for (const node of [nodeA, nodeB]) if (node.listening) await new Promise((resolve) => node.close(resolve));
  });

  const an = await connectClient(nodeA.address().port, 'u-an', 'An');
  sockets.push(an.socket);
  const selected = waitForMessage(an.socket, (message) => message.type === 'room.state'
    && message.participants.some((item) => item.seatId === 'S-3'));
  an.socket.send(JSON.stringify({ v: 1, type: 'seat.select', requestId: 'seat-3', seatId: 'S-3' }));
  await selected;

  const closed = once(an.socket, 'close');
  await nodeA.roomRegistry.shutdown();
  assert.equal((await closed)[0], 4002);
  assert.equal(await directory.getRoomOwner('cinema-1'), null);
  assert.deepEqual((await directory.listNodes()).map((node) => node.nodeId), ['rt-b']);

  const resumed = await connectClient(nodeB.address().port, 'u-an', 'An', {
    ticket: 'expired-ticket',
    resumeToken: an.welcome.resumeToken,
  });
  sockets.push(resumed.socket);
  assert.equal(resumed.state.participants[0].seatId, 'S-3');
});

test('giới hạn chat theo người vẫn giữ khi nối lại; cả phòng có trần chung', () => {
  const room = new Room('cinema-1');
  for (let index = 0; index < 5; index += 1) assert.equal(room.allow('u-1:chat', 5, 10_000), true);
  assert.equal(room.allow('u-1:chat', 5, 10_000), false);
  assert.equal(room.allow('u-2:chat', 5, 10_000), true);

  const socket = { readyState: WebSocket.CLOSED };
  const joined = room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.disconnect('u-1', socket);
  room.join({ readyState: WebSocket.CLOSED }, { participantId: 'u-1', displayName: 'An' }, joined.participant.resumeToken);
  assert.equal(room.allow('u-1:chat', 5, 10_000), false);
});

test('dựng lại từ snapshot hỏng: bỏ mục hỏng, không để hai người cùng một ghế', () => {
  const room = new Room('cinema-1');
  room.restore({
    revision: 'x',
    participants: [
      { id: 'u-1', displayName: 'An', seatId: 'S-1', resumeToken: 'r-1' },
      { id: 'u-2', displayName: 'Bình', seatId: 'S-1', resumeToken: 'r-2' },
      { id: 'u-3', displayName: 'Chi', seatId: 'S-999', resumeToken: 'r-3' },
      { id: 'u-4', seatId: 'S-2' },
      null,
    ],
  });
  for (const participant of room.participants.values()) clearTimeout(participant.expireTimer);
  assert.deepEqual(room.snapshot().participants.map(withoutSkin), [
    { id: 'u-1', displayName: 'An', seatId: 'S-1', connected: false },
    { id: 'u-2', displayName: 'Bình', connected: false },
  ]);
  assert.equal(room.revision, 1);
});

test('snapshot không đọc được thì phòng mở trống thay vì kẹt', async () => {
  const directory = createMemoryDirectory();
  await directory.acquireRoom('cinema-1', 'rt-old');
  await directory.saveSnapshot('cinema-1', 'rt-old', 1, { revision: 1, participants: 'hỏng' });
  await directory.releaseRoom('cinema-1', 'rt-old', 1);
  const registry = new RoomRegistry({ nodeId: 'rt-new', directory });
  const opened = await registry.open('cinema-1');
  assert.equal(opened.ok, true);
  assert.equal(opened.room.epoch, 2);
  assert.equal(opened.room.participants.size, 0);
});

test('resume token đã hết chỗ giữ thì server báo INVALID_RESUME_TOKEN rồi đóng', async (t) => {
  const server = createRealtimeServer({ secret: SECRET, resumeTtlMs: 30 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;

  const first = await connectClient(port, 'u-an', 'An');
  sockets.push((await connectClient(port, 'u-binh', 'Bình')).socket);
  first.socket.close();
  await waitForCondition(() => !server.roomRegistry.rooms.get('cinema-1')?.participants.has('u-an'));

  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?resumeToken=${encodeURIComponent(first.welcome.resumeToken)}`);
  sockets.push(socket);
  const error = await waitForMessage(socket, (message) => message.type === 'protocol.error');
  assert.equal(error.code, 'INVALID_RESUME_TOKEN');
  assert.equal((await once(socket, 'close'))[0], 1008);
});

test('kết nối không gửi hello bị đóng sau thời gian chờ', async (t) => {
  const server = createRealtimeServer({ secret: SECRET, helloTimeoutMs: 50 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const ticket = createJoinTicket({ participantId: 'u-im', roomId: 'cinema-1', displayName: 'Im' }, SECRET);
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?ticket=${ticket}`);
  assert.equal((await once(socket, 'close'))[0], 1008);
});

test('máy realtime báo số người theo phòng trong nhịp đăng ký', async (t) => {
  const directory = createMemoryDirectory();
  const node = await startNode(directory, 'rt-a');
  const an = await connectClient(node.address().port, 'u-an', 'An');
  t.after(async () => {
    an.socket.terminate();
    await new Promise((resolve) => node.close(resolve));
  });
  await waitForCondition(async () => (await directory.listNodes())[0]?.roomCounts?.['cinema-1'] === 1);
});

test('vé sai hoặc ký bằng khóa cũ: server báo INVALID_TICKET để client xin vé mới', async (t) => {
  const server = createRealtimeServer({ secret: SECRET });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const oldTicket = createJoinTicket({ participantId: 'u-an', roomId: 'cinema-1', displayName: 'An' }, 'khoa-cu-truoc-khi-khoi-dong-lai-server-123');
  for (const [query, code] of [[`ticket=${oldTicket}`, 'INVALID_TICKET'], ['resumeToken=abc.def', 'INVALID_RESUME_TOKEN']]) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?${query}`);
    const error = await waitForMessage(socket, (message) => message.type === 'protocol.error');
    assert.equal(error.code, code);
    assert.equal((await once(socket, 'close'))[0], 1008);
  }
  assert.equal(server.roomRegistry.size, 0, 'vé sai không được mở phòng');
});

function seatedRoom(count) {
  const room = new Room('cinema-1');
  for (let index = 1; index <= count; index += 1) room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `u-${index}`, displayName: `Người ${index}` });
  return room;
}

test('hàng chờ: video đầu phát ngay, video sau xếp hàng, chặn trùng và quá 3 video mỗi người', () => {
  const room = seatedRoom(2);
  assert.deepEqual(room.addVideo('u-1', 'aaaaaaaaaaa', 'Bài A'), { ok: true });
  assert.equal(room.playback.current.videoId, 'aaaaaaaaaaa');
  assert.ok(room.playback.current.startedAt > Date.now(), 'bắt đầu sau một nhịp để client kịp nạp');
  assert.equal(room.addVideo('u-2', 'aaaaaaaaaaa', 'Bài A').error, 'ALREADY_QUEUED');
  for (const id of ['bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']) assert.equal(room.addVideo('u-1', id, '').ok, true);
  assert.equal(room.addVideo('u-1', 'eeeeeeeeeee', '').error, 'TOO_MANY_QUEUED');
  const state = room.playbackState();
  assert.equal(state.queue.length, 3);
  assert.ok(!('addedById' in state.queue[0]), 'không lộ id người thêm');
  room.close();
});

test('vote bỏ qua theo 35% người đang kết nối; lỗi phát cũng tính như vậy', () => {
  const room = seatedRoom(10);
  room.addVideo('u-1', 'aaaaaaaaaaa', 'A');
  room.addVideo('u-1', 'bbbbbbbbbbb', 'B');
  assert.equal(room.votesNeeded(), 4);
  const itemId = room.playback.current.itemId;
  for (const id of ['u-1', 'u-2', 'u-2', 'u-3']) room.voteSkip(id, itemId);
  assert.equal(room.playback.current.videoId, 'aaaaaaaaaaa', 'vote trùng không được tính hai lần');
  room.voteSkip('u-4', itemId);
  assert.equal(room.playback.current.videoId, 'bbbbbbbbbbb');
  assert.equal(room.voteSkip('u-5', itemId).error, 'STALE_ITEM');
  for (const id of ['u-1', 'u-2', 'u-3', 'u-4']) room.report(id, room.playback.current.itemId, 'error');
  assert.equal(room.playback.current, null, 'đủ người báo lỗi thì bỏ bài');
  room.close();
});

test('thời lượng lấy trung vị cao; báo hết bài sớm bị bỏ qua', () => {
  const room = seatedRoom(3);
  room.addVideo('u-1', 'aaaaaaaaaaa', 'A');
  const { itemId } = room.playback.current;
  room.report('u-1', itemId, 'duration', 2);
  room.report('u-2', itemId, 'duration', 200);
  assert.equal(room.playback.current.duration, 200, 'một client báo sai không cắt ngang bài');
  room.report('u-1', itemId, 'ended');
  assert.equal(room.playback.current?.itemId, itemId);
  assert.ok(room.playback.timer, 'đã hẹn giờ chuyển bài theo thời lượng');
  room.close();
});

test('failover giữ bài đang chiếu, giờ bắt đầu và hàng chờ', () => {
  const room = seatedRoom(1);
  room.addVideo('u-1', 'aaaaaaaaaaa', 'A');
  room.addVideo('u-1', 'bbbbbbbbbbb', 'B');
  room.report('u-1', room.playback.current.itemId, 'duration', 300);
  const record = JSON.parse(JSON.stringify(room.toRecord()));
  room.close();
  const restored = new Room('cinema-1', { epoch: 2 });
  restored.restore(record);
  const state = restored.playbackState();
  assert.equal(state.current.videoId, 'aaaaaaaaaaa');
  assert.equal(state.current.startedAt, record.playback.current.startedAt);
  assert.equal(state.current.duration, 300);
  assert.deepEqual(state.queue.map((item) => item.videoId), ['bbbbbbbbbbb']);
  restored.close();
});

test('client thêm video qua WebSocket: video cấm nhúng bị từ chối, video hợp lệ phát cho cả phòng', async (t) => {
  const fetchVideoInfo = async (videoId) => (videoId === 'blockedvid1'
    ? { ok: false, error: 'VIDEO_NOT_EMBEDDABLE' }
    : { ok: true, title: `Video ${videoId}` });
  const server = createRealtimeServer({ secret: SECRET, fetchVideoInfo });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const an = await connectClient(port, 'u-an', 'An');
  const binh = await connectClient(port, 'u-binh', 'Bình');
  sockets.push(an.socket, binh.socket);

  const blocked = waitForMessage(an.socket, (message) => message.type === 'protocol.error');
  an.socket.send(JSON.stringify({ v: 1, type: 'queue.add', requestId: 'q1', videoId: 'blockedvid1' }));
  assert.equal((await blocked).code, 'VIDEO_NOT_EMBEDDABLE');

  const playing = waitForMessage(binh.socket, (message) => message.type === 'playback.state' && message.current);
  an.socket.send(JSON.stringify({ v: 1, type: 'queue.add', requestId: 'q2', videoId: 'dQw4w9WgXcQ' }));
  const state = await playing;
  assert.equal(state.current.videoId, 'dQw4w9WgXcQ');
  assert.equal(state.current.title, 'Video dQw4w9WgXcQ');
  assert.equal(state.current.addedBy, 'An');
  assert.equal(state.votesNeeded, 1);

  const late = await connectClient(port, 'u-chi', 'Chi', { waitPlayback: true });
  sockets.push(late.socket);
  assert.equal(late.playback.current.videoId, 'dQw4w9WgXcQ', 'người vào sau nhận ngay bài đang chiếu');
});

test('bỏ qua thời lượng quá ngắn (livestream, trình phát chưa nạp) để không cắt bài', () => {
  const room = seatedRoom(1);
  room.addVideo('u-1', 'aaaaaaaaaaa', 'Live');
  room.report('u-1', room.playback.current.itemId, 'duration', 1);
  assert.equal(room.playback.current.duration, undefined);
  assert.equal(room.playback.timer, null);
  room.close();
});

test('chánh điện: số bồ đoàn theo cấu hình, có hình nhân vật mặc định, dâng lễ vật cộng công đức; lễ vật không phải chờ', () => {
  const room = new Room('thien-1');
  const sent = [];
  const socket = { readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'Diệu Hạnh' });
  assert.equal(room.type, 'thien');
  assert.equal(room.selectSeat('u-1', LAST_THIEN_SEAT).ok, true);
  assert.equal(room.selectSeat('u-1', `S-${THIEN_RULES.seats + 1}`).error, 'INVALID_SEAT');
  const me = room.snapshot().participants[0];
  assert.ok(['man', 'woman', 'granny', 'nun', 'monk', 'child'].includes(me.skin));
  assert.equal(me.merit, 0);

  assert.deepEqual(room.setSkin('u-1', 'nun'), { ok: true });
  assert.equal(room.setSkin('u-1', 'robot').error, 'INVALID_SKIN');
  assert.deepEqual(room.offer('u-1', 'incense', '  Cầu   bình an  '), { ok: true });
  const offering = sent.find((message) => message.type === 'offering');
  assert.equal(offering.kind, 'incense');
  assert.equal(offering.text, 'Cầu bình an');
  assert.deepEqual(room.offer('u-1', 'incense'), { ok: true }, 'dâng hương không có thời gian chờ');
  assert.deepEqual(room.offer('u-1', 'lotus'), { ok: true });
  room.offer('u-1', 'bell');
  assert.deepEqual(room.snapshot().participants[0], { id: 'u-1', displayName: 'Diệu Hạnh', seatId: LAST_THIEN_SEAT, connected: true, skin: 'nun', merit: 129 });
  assert.deepEqual(room.offer('u-1', 'bell'), { ok: true }, 'thỉnh chuông liên tiếp không phải chờ');
  assert.deepEqual(room.offer('u-1', 'petal'), { ok: true }, 'lễ thứ 6 trong 10 giây vẫn được');
  assert.equal(room.offer('u-1', 'petal').error, 'RATE_LIMITED', 'vẫn chặn spam: lễ thứ 7 trong 10 giây bị chặn');

  // Failover giữ hình và công đức.
  const restored = new Room('thien-1', { epoch: 2 });
  restored.restore(JSON.parse(JSON.stringify(room.toRecord())));
  const back = restored.snapshot().participants[0];
  assert.deepEqual([back.skin, back.merit, back.seatId], ['nun', 229, LAST_THIEN_SEAT]);
  room.close();
  restored.close();
});

test('công việc trong chùa: phải đứng gần, hai người làm nhanh hơn và snapshot giữ tiến độ', () => {
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  const makeRoom = (count) => {
    const room = new Room('thien-1', { botCount: 0 });
    for (let index = 1; index <= count; index += 1) {
      room.join(socket, { participantId: `u-${index}`, displayName: `Người ${index}` });
      room.move(`u-${index}`, { x: 0, z: 41, ry: 0, moving: false });
      assert.deepEqual(room.startChore(`u-${index}`, 'sweep-yard'), { ok: true });
    }
    clearInterval(room.choreTimer);
    room.choreTimer = null;
    room.choreTickAt = 1_000;
    for (let second = 2; second <= 11; second += 1) room.tickChores(second * 1_000);
    clearInterval(room.choreTimer);
    room.choreTimer = null;
    return room;
  };

  const far = new Room('thien-1', { botCount: 0 });
  far.join(socket, { participantId: 'u-far', displayName: 'Ở xa' });
  far.move('u-far', { x: 0, z: 20, ry: 0, moving: false });
  assert.equal(far.startChore('u-far', 'sweep-yard').error, 'TOO_FAR');

  const solo = makeRoom(1);
  const together = makeRoom(2);
  const soloProgress = solo.chores.get('sweep-yard').progress;
  const togetherProgress = together.chores.get('sweep-yard').progress;
  assert.ok(soloProgress > 250 && soloProgress < 300);
  assert.ok(togetherProgress > soloProgress * 2, 'hai người có thưởng phối hợp nên nhanh hơn hai lần');

  const restored = new Room('thien-1', { epoch: 2, botCount: 0 });
  restored.restore(JSON.parse(JSON.stringify(together.toRecord())));
  assert.equal(Math.round(restored.chores.get('sweep-yard').progress), Math.round(togetherProgress));
  assert.deepEqual(parseServerMessage(restored.choreMessage()).ok, true);

  far.close();
  solo.close();
  together.close();
  restored.close();
});

test('hoàn thành công việc chỉ yêu cầu trả xu cho thành viên đăng nhập', async () => {
  const recorded = [];
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  const room = new Room('thien-1', {
    botCount: 0,
    onChoreReward: async (event) => {
      recorded.push(event);
      return { ok: true, reward: 20, coins: 70, count: 1, limit: 3 };
    },
  });
  room.join(socket, { participantId: 'u-member', accountId: 'a-1', displayName: 'Thành viên' });
  room.join(socket, { participantId: 'u-guest', displayName: 'Khách' });
  for (const id of ['u-member', 'u-guest']) {
    room.move(id, { x: 0, z: 41, ry: 0, moving: false });
    assert.equal(room.startChore(id, 'sweep-yard').ok, true);
  }
  clearInterval(room.choreTimer);
  room.choreTimer = null;
  room.chores.get('sweep-yard').durationMs = 1_000;
  room.choreTickAt = 1_000;
  room.tickChores(2_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recorded.length, 1);
  assert.deepEqual({ accountId: recorded[0].accountId, chore: recorded[0].chore }, { accountId: 'a-1', chore: 'sweep' });
  assert.match(recorded[0].key, /^[A-Za-z0-9_-]{43}$/);
  room.close();
});

test('hình mua trong shop (chibigirl): chỉ người có trong vé mới mặc được, không chia cho người mới hay bot', () => {
  for (const roomId of ['cinema-1', 'thien-1']) {
    const room = new Room(roomId, { botCount: 0 });
    const socket = { readyState: WebSocket.CLOSED, close() {} };
    room.join(socket, { participantId: 'u-guest', displayName: 'Khách', role: 'guest' });
    room.join(socket, { participantId: 'u-member', displayName: 'An', role: 'member', accountId: 'a-12345678-aaaa' });
    room.join(socket, { participantId: 'u-owner', displayName: 'Bình', role: 'member', accountId: 'a-12345678-bbbb', skins: ['chibigirl'] });
    assert.equal(room.setSkin('u-guest', 'chibigirl').error, 'SKIN_LOCKED');
    assert.equal(room.setSkin('u-member', 'chibigirl').error, 'SKIN_LOCKED');
    assert.deepEqual(room.setSkin('u-owner', 'chibigirl'), { ok: true });
    const people = room.snapshot().participants;
    assert.equal(people.find((person) => person.id === 'u-owner').skin, 'chibigirl');
    assert.equal(JSON.stringify(people).includes('ownedSkins'), false, 'danh sách đồ đã mua không lộ ra phòng');
    room.close();
  }
  // Hình mặc định chia theo mã người: không bao giờ ra hình shop.
  const room = new Room('thien-1', { botCount: 0 });
  for (let index = 0; index < 200; index += 1) room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `u-${index}`, displayName: `N${index}`, role: 'guest' });
  assert.ok(room.snapshot().participants.every((person) => person.skin !== 'chibigirl'));
  room.close();
});

test('thành viên đăng nhập: lễ vật được gửi ghi sổ, khách thì không; accountId giữ qua failover, không lộ ra phòng', () => {
  const recorded = [];
  const room = new Room('thien-1', { botCount: 0, onOffering: (event) => recorded.push(event) });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'Diệu Hạnh', role: 'member', accountId: 'a-12345678-aaaa', level: 2, avatarUrl: 'https://lh3.googleusercontent.com/a/abc' });
  room.join(socket, { participantId: 'u-2', displayName: 'Khách', role: 'guest' });
  room.offer('u-1', 'incense', ' Cầu an ');
  room.offer('u-2', 'incense');
  assert.equal(recorded.length, 1);
  assert.deepEqual({ ...recorded[0], at: 0 }, { accountId: 'a-12345678-aaaa', kind: 'incense', text: 'Cầu an', roomId: 'thien-1', at: 0 });
  assert.equal(JSON.stringify(room.snapshot()).includes('a-12345678'), false, 'người khác không thấy mã tài khoản');
  assert.deepEqual(room.snapshot().participants.map((person) => person.level), [2, undefined], 'huy hiệu cấp chỉ có ở thành viên');
  assert.equal(room.setLevel('u-1', 3), true, 'sổ công đức báo lên cấp thì cả phòng thấy cấp mới');
  assert.equal(room.setLevel('u-2', 3), false, 'khách không có cấp');
  assert.equal(room.setLevel('u-1', 'x'), false);

  const restored = new Room('thien-1', { epoch: 2, botCount: 0, onOffering: (event) => recorded.push(event) });
  restored.restore(JSON.parse(JSON.stringify(room.toRecord())));
  assert.equal(restored.participants.get('u-1').accountId, 'a-12345678-aaaa');
  assert.equal(restored.participants.get('u-1').level, 3);
  assert.equal(restored.snapshot().participants.find((person) => person.id === 'u-1').avatarUrl, 'https://lh3.googleusercontent.com/a/abc', 'ảnh đại diện giữ qua failover');
  assert.equal(restored.participants.get('u-2').accountId, undefined);
  room.close();
  restored.close();
});

test('phòng theo ngôn ngữ: bot mang tên và câu tụng của ngôn ngữ phòng; API hỏi được số người từng phòng', () => {
  const room = new Room('thien-az-en-1', { botCount: 4 });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  const bots = [...room.participants.values()].filter((person) => person.bot);
  assert.ok(bots.length > 0);
  for (const bot of bots) assert.ok(['Grace', 'Daniel', 'Hannah', 'Michael', 'Sophia', 'James', 'Emily', 'David', 'Olivia', 'Ethan', 'Linda', 'Robert', 'Mia', 'Joseph', 'Chloe', 'Andrew'].includes(bot.displayName));
  assert.equal(room.type, 'thien');
  room.close();

  const registry = new RoomRegistry();
  registry.rooms.set('thien-az-vi-1', { connectedCount: 3, realCount: 4 });
  const reply = (headers) => {
    const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
    handleRealtimeRequest({ method: 'GET', url: '/internal/rooms', headers }, res, registry, { secret: SECRET });
    return res;
  };
  assert.equal(reply({}).status, 403);
  assert.deepEqual(JSON.parse(reply({ 'x-internal-key': internalKey(SECRET) }).body), { counts: { 'thien-az-vi-1': 4 } }, 'chỗ đang giữ khi rớt mạng vẫn được tính vào sức chứa');
});

test('phòng tiểu bang/ngôn ngữ từ chối người vượt sức chứa phòng', () => {
  const room = new Room('thien-az-vi-1', { botCount: 0 });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  for (let index = 1; index <= THIEN_RULES.maxParticipants; index += 1) {
    assert.equal(room.join(socket, { participantId: `u-${index}`, displayName: `Người ${index}` }).ok, true);
  }
  assert.equal(room.join(socket, { participantId: 'u-over', displayName: 'Người vượt chỗ' }), false);
  room.close();
});

test('Cinema chỉ có nhân vật Nam/Nữ, không lễ vật; chánh điện không nhận video', async (t) => {
  const cinema = new Room('cinema-1');
  cinema.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  assert.equal(cinema.offer('u-1', 'bell').error, 'OFFERING_NOT_ALLOWED');
  // Rạp chỉ có nhân vật Nam/Nữ (chọn ở cổng chùa), không có công đức.
  assert.equal(cinema.setSkin('u-1', 'monk').error, 'INVALID_SKIN');
  assert.ok(['man', 'woman'].includes(cinema.snapshot().participants[0].skin));
  assert.deepEqual(cinema.setSkin('u-1', 'woman'), { ok: true });
  assert.equal(cinema.snapshot().participants[0].skin, 'woman');
  assert.ok(!('merit' in cinema.snapshot().participants[0]));
  cinema.close();

  const server = createRealtimeServer({ secret: SECRET, fetchVideoInfo: async () => ({ ok: true, title: '' }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const ticket = createJoinTicket({ participantId: 'u-an', roomId: 'thien-1', displayName: 'An' }, SECRET);
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?ticket=${ticket}`);
  sockets.push(socket);
  await once(socket, 'open');
  const welcome = waitForMessage(socket, (message) => message.type === 'welcome');
  socket.send(JSON.stringify({ v: 1, type: 'hello', roomId: 'thien-1', displayName: 'An' }));
  await welcome;
  const refused = waitForMessage(socket, (message) => message.type === 'protocol.error');
  socket.send(JSON.stringify({ v: 1, type: 'queue.add', requestId: 'q1', videoId: 'dQw4w9WgXcQ' }));
  assert.equal((await refused).code, 'NOT_ALLOWED');
  const offered = waitForMessage(socket, (message) => message.type === 'offering');
  socket.send(JSON.stringify({ v: 1, type: 'offering.send', requestId: 'o1', kind: 'lotus', text: 'Nguyện cầu bình an' }));
  assert.equal((await offered).participantId, 'u-an');
});

test('bot chánh điện: giữ bồ đoàn như người thật, không tính vào sức chứa và rời khi phòng vắng', async () => {
  let emptied = false;
  const room = new Room('thien-1', { botCount: 3, resumeTtlMs: 20, onEmpty: () => { emptied = true; } });
  assert.equal(room.participants.size, 0, 'phòng chưa có ai thì không có bot');
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  const bots = room.snapshot().participants.filter((person) => person.bot);
  assert.equal(bots.length, Math.min(THIEN_RULES.bots.initial, THIEN_RULES.seats));
  assert.ok(bots.every((bot) => (bot.seatId || bot.pos) && bot.skin), 'bot ngồi trong điện hoặc đi ngoài sân và có hình');
  assert.equal(bots.filter((bot) => bot.pos).length, THIEN_RULES.bots.walk.initial, 'có bot đi dạo ngay khi phòng mở');
  assert.equal(room.connectedCount, 1, 'chỉ đếm người thật');
  assert.equal(room.votesNeeded(), 1);

  const seatedBot = bots.find((bot) => bot.seatId);
  const botSeat = seatedBot.seatId;
  assert.deepEqual(room.selectSeat('u-1', botSeat), { ok: false, error: 'SEAT_TAKEN' }, 'bấm vào bot không đá bot khỏi bồ đoàn');
  assert.equal(room.participants.get(seatedBot.id).seatId, botSeat, 'bot vẫn ngồi nguyên chỗ');
  const freeSeat = [...room.seatIds].find((seatId) => !bots.some((bot) => bot.seatId === seatId));
  assert.deepEqual(room.selectSeat('u-1', freeSeat), { ok: true });
  assert.equal(room.selectSeat(seatedBot.id, freeSeat).error, 'SEAT_TAKEN', 'bot cũng không chiếm chỗ người thật');

  const record = room.toRecord();
  assert.ok(record.participants.every((person) => !person.id.startsWith('bot-')), 'bot không vào snapshot failover');

  room.disconnect('u-1', socket);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(room.participants.size, 0, 'người thật cuối cùng rời thì bot rời theo');
  assert.equal(emptied, true);
  assert.equal(room.botTimer, null);
});

test('bot ngồi tự rời khi người thật tăng, bot ngoài sân vẫn đi dạo', () => {
  const room = new Room('thien-1', { botCount: THIEN_RULES.seats });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  for (let index = 1; index <= THIEN_RULES.seats; index += 1) {
    assert.equal(room.join(socket, { participantId: `u-${index}`, displayName: `Người ${index}` }).ok, true);
    const bots = [...room.participants.values()].filter((person) => person.bot);
    assert.ok(bots.filter((person) => person.seatId).length <= THIEN_RULES.seats - room.realCount);
  }
  const bots = [...room.participants.values()].filter((person) => person.bot);
  assert.equal(bots.some((person) => person.seatId), false, 'không giữ bồ đoàn khi phòng đủ người thật');
  assert.ok(bots.some((person) => person.pos), 'bot ngoài sân không chiếm bồ đoàn nên vẫn ở lại');
});

test('số bot cấu hình được (0 là tắt) và không vượt số bồ đoàn', () => {
  const none = new Room('thien-1', { botCount: 0 });
  none.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  assert.equal(none.participants.size, 1);
  none.close();
  assert.equal(new Room('thien-1', { botCount: 99 }).botCount, THIEN_RULES.seats);
  assert.equal(new Room('thien-1').botCount, Math.min(THIEN_RULES.bots.count, THIEN_RULES.seats), 'mặc định không vượt số bồ đoàn');
  assert.equal(new Room('cinema-1').botCount, 0, 'Cinema chưa bật bot');
});

test('bot có nhịp riêng, dâng hương nhiều nhất và không bao giờ thỉnh chuông', () => {
  const room = new Room('thien-1', { botCount: 6 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  const bots = () => [...room.participants.values()].filter((person) => person.bot);
  const seatedBots = () => bots().filter((person) => person.seatId);
  assert.equal(bots().length, Math.min(THIEN_RULES.bots.initial, THIEN_RULES.seats), 'bot ngồi sẵn không vượt số bồ đoàn');
  assert.equal(new Set(bots().map((bot) => bot.displayName)).size, bots().length, 'không trùng tên');
  const kinds = { incense: 0, petal: 0, lotus: 0, bell: 0, chat: 0 };
  const original = Math.random;
  try {
    for (let index = 0; index < 400; index += 1) {
      const bot = seatedBots()[index % seatedBots().length];
      room.rates.clear();
      sent.length = 0;
      room.botAct(bot);
      const event = sent.find((message) => message.type === 'offering' || message.type === 'chat.message');
      if (event?.type === 'offering') kinds[event.kind] += 1;
      else if (event) kinds.chat += 1;
    }
  } finally {
    Math.random = original;
  }
  assert.equal(kinds.bell, 0);
  assert.ok(kinds.incense > kinds.petal && kinds.incense > kinds.lotus, JSON.stringify(kinds));
  assert.ok(kinds.chat > 0);
  room.close();
});

test('bot ngoài sân đi qua các điểm đường và phát room.moves như người thật', () => {
  const sent = [];
  const room = new Room('thien-1', { botCount: 4 });
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  const walker = [...room.participants.values()].find((person) => person.bot && person.pos);
  assert.ok(walker, 'phải có bot đứng ngoài khuôn viên');
  const before = { ...walker.pos };
  walker.walk.waitUntil = 0;
  walker.walk.lastAt = Date.now() - 1_000;
  assert.equal(room.advanceBotWalk(walker, Date.now()), true);
  room.flushMoves();
  assert.ok(Math.hypot(walker.pos.x - before.x, walker.pos.z - before.z) > 0.5, 'bot đã bước sang điểm tiếp theo');
  const expectedHeading = Math.atan2(-(walker.pos.x - before.x), -(walker.pos.z - before.z));
  const headingError = Math.atan2(Math.sin(walker.pos.ry - expectedHeading), Math.cos(walker.pos.ry - expectedHeading));
  assert.ok(Math.abs(headingError) < 0.02, 'bot quay mặt đúng hướng đang đi, không trượt lùi');
  const batch = sent.find((message) => message.type === 'room.moves' && message.moves.some((move) => move.id === walker.id));
  assert.ok(batch, 'mọi client nhận được vị trí bot');
  assert.equal(batch.moves.find((move) => move.id === walker.id).m, true);
  room.close();
});

test('nhập vai: vị trí gom 200 ms, chặn dịch chuyển tức thời, giữ trong vùng; đứng dậy đi thì rời bồ đoàn; động tác', async () => {
  const room = new Room('thien-1', { botCount: 0 });
  const sent = [];
  const socket = { readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-2', displayName: 'Bình' });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-3', displayName: 'Chi' });
  room.selectSeat('u-1', 'S-1');
  assert.deepEqual(room.move('u-1', { x: 0, z: 12.5, ry: 0, moving: true }), { ok: true });
  assert.equal(room.participants.get('u-1').seatId, null, 'đứng dậy đi thì rời bồ đoàn');
  room.move('u-1', { x: 0.5, z: 12, ry: 0.4, moving: true });
  room.move('u-1', { x: 0, z: -50, ry: 0, moving: true });
  assert.ok(room.participants.get('u-1').pos.z > 9, 'không dịch chuyển tức thời (chỉ đi được tối đa vài mét)');
  room.move('u-2', { x: 99, z: 5, ry: 0, moving: false });
  assert.equal(room.participants.get('u-2').pos.x, room.rules.world.bounds.x[1], 'giữ trong vùng');
  room.move('u-3', { x: 2, z: 10, ry: 0, moving: false });
  assert.equal(sent.filter((message) => message.type === 'room.moves').length, 0, 'chưa phát ngay');
  await new Promise((resolve) => setTimeout(resolve, 260));
  const batches = sent.filter((message) => message.type === 'room.moves');
  assert.equal(batches.length, 1, 'gom thành một gói');
  assert.deepEqual(batches[0].moves.map((item) => item.id).sort(), ['u-1', 'u-3'], 'người ngoài sân (u-2) không gửi cho người trong chánh điện');
  assert.deepEqual(room.emote('u-1', 'bow3'), { ok: true });
  assert.equal(sent.at(-1).type, 'emote');
  assert.equal(room.snapshot().participants.find((person) => person.id === 'u-1').emote, 'bow3', 'người vào sau thấy đang lạy');
  assert.equal(new Room('cinema-1').move('x', { x: 0, z: 5, ry: 0, moving: true }).error, 'NOT_IN_ROOM');
  room.close();
});

test('đi nhanh: server chỉ nhận ba điểm cố định, rời chỗ ngồi và phát vị trí mới', async () => {
  const room = new Room('thien-1', { botCount: 0 });
  const sent = [];
  const socket = { readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.selectSeat('u-1', 'S-1');

  assert.deepEqual(room.travel('u-1', 'garden'), { ok: true });
  const person = room.participants.get('u-1');
  assert.deepEqual(person.pos, THIEN_RULES.world.travel.garden);
  assert.equal(person.seatId, null, 'đi nhanh thì đứng dậy khỏi bồ đoàn');
  assert.equal(room.travel('u-1', 'pond').error, 'NOT_ALLOWED');

  await new Promise((resolve) => setTimeout(resolve, 260));
  const moved = sent.find((message) => message.type === 'room.moves' && message.moves.some((item) => item.id === 'u-1'));
  assert.deepEqual(moved.moves.find((item) => item.id === 'u-1'), {
    id: 'u-1', ...THIEN_RULES.world.travel.garden, m: false,
  });
  room.close();
});

test('ghế đá: tối đa hai người, đứng/đi thì nhường chỗ và failover giữ đúng spot', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  for (const [id, displayName] of [['u-1', 'An'], ['u-2', 'Bình'], ['u-3', 'Chi']]) room.join(socket, { participantId: id, displayName });
  assert.deepEqual(room.selectBench('u-1', 'B-1'), { ok: true, spot: 1 });
  assert.deepEqual(room.selectBench('u-2', 'B-1'), { ok: true, spot: 2 });
  assert.equal(room.selectBench('u-3', 'B-1').error, 'BENCH_FULL');
  assert.equal(room.selectBench('u-3', 'B-99').error, 'INVALID_BENCH');
  assert.deepEqual(room.snapshot().participants.slice(0, 2).map(({ benchId, benchSpot }) => [benchId, benchSpot]), [['B-1', 1], ['B-1', 2]]);

  room.emote('u-1', 'stand');
  assert.deepEqual(room.selectBench('u-3', 'B-1'), { ok: true, spot: 1 }, 'bấm Đứng thì nhường chỗ');
  room.move('u-2', { x: 0, z: 50, ry: 0, moving: true });
  assert.equal(room.participants.get('u-2').benchId, null, 'đi bằng joystick thì rời ghế');
  room.selectBench('u-2', 'B-2');
  room.selectSeat('u-2', 'S-1');
  assert.equal(room.participants.get('u-2').benchId, null, 'ngồi bồ đoàn thì rời ghế đá');

  const record = JSON.parse(JSON.stringify(room.toRecord()));
  const restored = new Room('thien-1', { epoch: 2, botCount: 0 });
  restored.restore(record);
  const back = restored.snapshot().participants.find((person) => person.id === 'u-3');
  assert.deepEqual([back.benchId, back.benchSpot], ['B-1', 1]);
  room.close();
  restored.close();
});

test('nhận sớ: cả phòng thấy thầy nhận sớ của ai, không có tên người trong sớ; chống gửi dồn', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'Diệu Hạnh' });
  assert.deepEqual(room.announcePrayer('u-1', 'memorial'), { ok: true });
  const notice = sent.find((message) => message.type === 'prayer.received');
  assert.deepEqual(Object.keys(notice).sort(), ['at', 'displayName', 'epoch', 'kind', 'participantId', 'type', 'v']);
  assert.equal(notice.displayName, 'Diệu Hạnh', 'tên người gửi sớ (trong phòng), không phải tên trong sớ');
  assert.equal(notice.kind, 'memorial');
  room.announcePrayer('u-1', 'peace');
  room.announcePrayer('u-1', 'peace');
  assert.equal(room.announcePrayer('u-1', 'peace').error, 'RATE_LIMITED');
  assert.equal(new Room('cinema-1').announcePrayer('x', 'peace').error, 'NOT_IN_ROOM');
  room.close();
});

test('tụng kinh và gõ mõ: cả phòng biết ai đang tụng bài nào; đứng dậy đi thì thôi tụng', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  room.move('u-1', { x: 0, z: 12, ry: 0, moving: false });
  assert.deepEqual(room.emote('u-1', 'chant', 'bat-nha'), { ok: true });
  assert.equal(sent.at(-1).sutra, 'bat-nha');
  assert.deepEqual(room.snapshot().participants[0].sutra, 'bat-nha');
  room.move('u-1', { x: 0, z: 11.5, ry: 0, moving: true });
  assert.equal(room.snapshot().participants[0].emote, undefined);
  assert.equal(room.snapshot().participants[0].sutra, undefined);
  assert.deepEqual(room.emote('u-1', 'woodfish'), { ok: true });
  room.close();
});

test('nhập vai: đang chạy mà tin vị trí tới dồn sát nhau thì không bị cắt quãng đường', () => {
  const room = new Room('thien-1', { botCount: 0 });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  room.move('u-1', { x: 0, z: 27.5, ry: 0, moving: true });
  // Hai tin chạy (mỗi tin 1,1 m) tới gần như cùng lúc.
  room.move('u-1', { x: 0, z: 26.4, ry: 0, moving: true });
  room.move('u-1', { x: 0, z: 25.3, ry: 0, moving: true });
  assert.equal(room.participants.get('u-1').pos.z, 25.3);
  room.move('u-1', { x: 0, z: 0, ry: 0, moving: true });
  assert.ok(room.participants.get('u-1').pos.z > 20, 'vẫn chặn dịch chuyển tức thời');
  room.close();
});

function socialRoom(options = {}) {
  const room = new Room('thien-1', { botCount: 0, ...options });
  const inbox = { 'u-1': [], 'u-2': [], 'u-3': [] };
  for (const [id, name, accountId] of [['u-1', 'An', 'a-11111111'], ['u-2', 'Bình', 'a-22222222'], ['u-3', 'Chi', null]]) {
    const socket = { readyState: WebSocket.OPEN, send: (raw) => inbox[id].push(JSON.parse(raw)), close() {} };
    room.join(socket, { participantId: id, displayName: name, ...(accountId ? { accountId } : {}) });
  }
  const last = (id, type) => inbox[id].filter((message) => message.type === type).at(-1);
  return { room, inbox, last };
}

test('kết bạn: lời mời chỉ tới hai người liên quan; chấp nhận thì lưu tài khoản khi cả hai đăng nhập', async () => {
  const saved = [];
  const { room, inbox, last } = socialRoom({ onFriend: async (event) => { saved.push(event); return { ok: true, created: true }; } });
  assert.deepEqual(room.friendRequest('u-1', 'u-2'), { ok: true });
  assert.equal(last('u-2', 'friend.state').status, 'pending');
  assert.equal(last('u-1', 'friend.state').status, 'pending');
  assert.equal(inbox['u-3'].some((message) => message.type === 'friend.state'), false, 'người ngoài không thấy');
  assert.equal(room.friendRespond('u-3', 'u-1', true).error, 'NO_REQUEST', 'không trả lời thay người khác');
  assert.deepEqual(room.friendRespond('u-2', 'u-1', true), { ok: true });
  await waitForCondition(() => last('u-1', 'friend.state').status === 'accepted');
  assert.equal(last('u-2', 'friend.state').saved, true);
  assert.deepEqual(saved, [{ action: 'add', first: 'a-11111111', second: 'a-22222222' }]);
  // Khách (chưa đăng nhập): là bạn trong phiên, không lưu.
  room.friendRequest('u-3', 'u-1');
  room.friendRespond('u-1', 'u-3', true);
  assert.equal(last('u-3', 'friend.state').saved, false);
  assert.equal(room.friendRequest('u-1', 'u-1').error, 'NOT_IN_ROOM');
  room.close();
});

test('khiêu chiến kéo búa bao: giữ kín lựa chọn tới khi cả hai ra tay, chạm 2 thắng', () => {
  const { room, inbox, last } = socialRoom();
  const sent = room.challengeSend('u-1', 'u-2', 'rps');
  assert.equal(sent.ok, true);
  assert.equal(room.challengeSend('u-3', 'u-2', 'rps').error, 'BUSY', 'mỗi người một trận một lúc');
  assert.equal(last('u-2', 'challenge.state').status, 'pending');
  assert.equal(room.challengeRespond('u-1', sent.challengeId, true).error, 'NO_CHALLENGE', 'người mời không tự nhận lời');
  room.challengeRespond('u-2', sent.challengeId, true);
  assert.equal(last('u-1', 'challenge.state').status, 'playing');
  assert.equal(last('u-1', 'challenge.state').round, 1);

  room.challengeMove('u-1', sent.challengeId, 'rock');
  const waiting = last('u-2', 'challenge.state');
  assert.deepEqual(waiting.moved, { from: true, to: false });
  assert.equal(JSON.stringify(inbox['u-2']).includes('rock'), false, 'đối thủ không thấy lựa chọn trước khi lượt xong');
  assert.equal(room.challengeMove('u-1', sent.challengeId, 'paper').error, 'ALREADY_MOVED');
  room.challengeMove('u-2', sent.challengeId, 'scissors');
  const round2 = last('u-2', 'challenge.state');
  assert.deepEqual(round2.last, { from: 'rock', to: 'scissors', winner: 'from' });
  assert.equal(round2.fromScore, 1);
  assert.equal(round2.round, 2);

  room.challengeMove('u-1', sent.challengeId, 'paper');
  room.challengeMove('u-2', sent.challengeId, 'paper');
  assert.equal(last('u-1', 'challenge.state').last.winner, 'draw');
  room.challengeMove('u-2', sent.challengeId, 'rock');
  room.challengeMove('u-1', sent.challengeId, 'paper');
  const done = last('u-2', 'challenge.state');
  assert.equal(done.status, 'finished');
  assert.equal(done.winner, 'from');
  assert.equal(done.fromScore, 2);
  assert.equal(inbox['u-3'].some((message) => message.type === 'challenge.state'), false);
  assert.equal(room.challengeSend('u-3', 'u-2', 'rps').ok, true, 'xong trận thì nhận trận mới');
  room.close();
});

test('khiêu chiến: từ chối, huỷ, và người rời phòng thì trận bị huỷ', () => {
  const { room, last } = socialRoom({ resumeTtlMs: 5 });
  const first = room.challengeSend('u-1', 'u-2', 'rps');
  room.challengeRespond('u-2', first.challengeId, false);
  assert.equal(last('u-1', 'challenge.state').status, 'declined');
  const second = room.challengeSend('u-1', 'u-2', 'rps');
  room.challengeRespond('u-2', second.challengeId, true);
  assert.equal(room.challengeCancel('u-3', second.challengeId).error, 'NO_CHALLENGE');
  room.challengeCancel('u-2', second.challengeId);
  assert.equal(last('u-1', 'challenge.state').status, 'cancelled');
  const third = room.challengeSend('u-1', 'u-3', 'rps');
  room.participants.get('u-3').connected = false;
  room.expire('u-3', room.participants.get('u-3').resumeToken);
  assert.equal(room.challenges.get(third.challengeId).status, 'cancelled');
  room.close();
});

test('chặn: người bị chặn không mời được, trận đang có bị huỷ; bỏ chặn thì mời lại được', () => {
  const { room, last } = socialRoom();
  const game = room.challengeSend('u-2', 'u-1', 'rps');
  room.challengeRespond('u-1', game.challengeId, true);
  assert.deepEqual(room.block('u-1', 'u-2', true), { ok: true });
  assert.equal(last('u-2', 'challenge.state').status, 'cancelled');
  assert.equal(room.challengeSend('u-2', 'u-1', 'rps').error, 'NOT_ALLOWED');
  assert.equal(room.friendRequest('u-2', 'u-1').error, 'NOT_ALLOWED');
  assert.equal(room.friendRequest('u-1', 'u-2').error, 'NOT_ALLOWED', 'người chặn cũng không mời được người bị chặn');
  room.block('u-1', 'u-2', false);
  assert.equal(room.friendRequest('u-2', 'u-1').ok, true);
  room.close();
});

test('báo cáo: chuyển tới API kèm tên và tài khoản, giới hạn 3 lần / 10 phút, không báo cáo bot', async () => {
  const reports = [];
  const { room, inbox } = socialRoom({ onReport: async (event) => reports.push(event) });
  assert.deepEqual(room.reportPlayer('u-3', 'u-1', 'harassment', '  nói   lời khó nghe  '), { ok: true });
  await waitForCondition(() => reports.length === 1);
  assert.deepEqual(reports[0], {
    roomId: 'thien-1', reporterAccount: null, reporterName: 'Chi', targetAccount: 'a-11111111', targetName: 'An', reason: 'harassment', note: 'nói lời khó nghe',
  });
  assert.equal(inbox['u-1'].some((message) => JSON.stringify(message).includes('harassment')), false, 'người bị báo cáo không biết');
  room.reportPlayer('u-3', 'u-2', 'spam');
  room.reportPlayer('u-3', 'u-2', 'spam');
  assert.equal(room.reportPlayer('u-3', 'u-2', 'spam').error, 'RATE_LIMITED');
  room.participants.set('bot-9', { id: 'bot-9', displayName: 'Máy', bot: true });
  assert.equal(room.reportPlayer('u-1', 'bot-9', 'spam').error, 'NOT_ALLOWED');
  room.close();
});

test('vườn: /internal/garden cần khóa nội bộ, kiểm tra schema rồi phát garden.plot cho phòng chánh điện', async () => {
  const registry = new RoomRegistry();
  const inbox = [];
  const thien = new Room('thien-1', { botCount: 0 });
  thien.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  registry.rooms.set('thien-1', thien);
  const call = async (body, key) => {
    const { Readable } = await import('node:stream');
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: 'POST', url: '/internal/garden', headers: key ? { 'x-internal-key': key } : {} });
    const res = response();
    res.writeHead = function writeHead(status) { this.status = status; return this; };
    await new Promise((resolve) => {
      res.end = function end(text = '') { this.body += text; resolve(); };
      handleRealtimeRequest(req, res, registry, { secret: SECRET });
    });
    return res;
  };
  const plot = { id: 2, crop: { id: 7, plantType: 'apple', ownerName: 'An', stage: 'sprout', waterDays: 1, waterNeeded: 3, wateredToday: true, fruitsLeft: 0, fruitsTotal: 0, plantedAt: 1 } };
  assert.equal((await call({ plots: [plot] })).status, 403);
  assert.equal((await call({ plots: [{ id: 99, crop: null }] }, internalKey(SECRET))).status, 400);
  const ok = await call({ plots: [plot], effect: { plotId: 2, kind: 'water', by: 'An' } }, internalKey(SECRET));
  assert.equal(ok.status, 200);
  const sent = inbox.find((message) => message.type === 'garden.plot');
  assert.equal(sent.plots[0].crop.stage, 'sprout');
  assert.equal(sent.effect.kind, 'water');
  thien.close();
});

test('công trình chung: endpoint nội bộ kiểm tra schema rồi phát cho phòng chánh điện', async () => {
  const registry = new RoomRegistry();
  const inbox = [];
  const thien = new Room('thien-1', { botCount: 0 });
  thien.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  registry.rooms.set('thien-1', thien);
  const call = async (body, key) => {
    const { Readable } = await import('node:stream');
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: 'POST', url: '/internal/community-project', headers: key ? { 'x-internal-key': key } : {} });
    const res = response();
    res.writeHead = function writeHead(status) { this.status = status; return this; };
    await new Promise((resolve) => {
      res.end = function end(text = '') { this.body += text; resolve(); };
      handleRealtimeRequest(req, res, registry, { secret: SECRET });
    });
    return res;
  };
  const project = { id: 'bodhi-global-1', kind: 'bodhi', stage: 'sprout', stageIndex: 1, progress: 30, target: 1_000, percent: 3, completed: false, contributors: 4, contributions: 8, updatedAt: 100 };
  assert.equal((await call({ project })).status, 403);
  assert.equal((await call({ project: { ...project, progress: 2_000 } }, internalKey(SECRET))).status, 400);
  assert.equal((await call({ project }, internalKey(SECRET))).status, 200);
  assert.equal(inbox.find((message) => message.type === 'community.project').project.progress, 30);
  thien.close();
});

test('phòng đông: chánh điện và sân tách riêng, mỗi người chỉ nhận người gần mình; số người cả phòng có tính bot', () => {
  const room = new Room('thien-1', { botCount: 4 });
  const inbox = new Map();
  const viewer = (id) => {
    inbox.set(id, []);
    return { readyState: WebSocket.OPEN, send: (raw) => inbox.get(id).push(JSON.parse(raw)), close() {} };
  };
  const lastState = (id) => inbox.get(id).filter((message) => message.type === 'room.state').at(-1);
  room.join(viewer('hall-1'), { participantId: 'hall-1', displayName: 'Trong điện' });
  room.move('hall-1', { x: 0, z: 8, ry: 0, moving: false });
  room.join(viewer('yard-1'), { participantId: 'yard-1', displayName: 'Ngoài sân' });
  room.move('yard-1', { x: 0, z: 40, ry: 0, moving: false });
  // 70 người đứng rải dọc sân, càng xa yard-1 càng về sau.
  for (let index = 1; index <= 70; index += 1) {
    room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `y-${index}`, displayName: `Sân ${index}` });
    room.participants.get(`y-${index}`).connected = true;
    room.move(`y-${index}`, { x: 10, z: 40 + index * 0.5, ry: 0, moving: false });
  }
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'sit-1', displayName: 'Ngồi tụng' });
  room.selectSeat('sit-1', 'S-5');
  room.refreshViews();
  room.broadcastState();
  const yardView = lastState('yard-1').participants.map((person) => person.id);
  const limit = room.rules.world.view.yard;
  const walkersSeen = yardView.filter((id) => id.startsWith('y-'));
  const standing = yardView.filter((id) => !room.participants.get(id).seatId && !room.participants.get(id).benchId);
  assert.equal(standing.length, limit, 'ngoài sân chỉ nhận view.yard người đứng/đi gần nhất (gồm chính mình)');
  assert.ok(walkersSeen.includes('y-1') && !walkersSeen.includes('y-70'), 'giữ người gần, bỏ người xa');
  assert.ok(!yardView.includes('hall-1'), 'người trong chánh điện không gửi ra sân');
  const hallView = lastState('hall-1').participants.map((person) => person.id);
  assert.ok(!hallView.some((id) => id.startsWith('y-') || id === 'yard-1'), 'người ngoài sân không gửi vào chánh điện');
  assert.ok(hallView.includes('sit-1') && yardView.includes('sit-1'), 'người ngồi bồ đoàn ai cũng thấy (chỗ đã có người)');

  room.sendCounts();
  const count = inbox.get('yard-1').filter((message) => message.type === 'room.count').at(-1);
  const bots = [...room.participants.values()].filter((person) => person.bot).length;
  assert.ok(bots > 0);
  assert.equal(count.total, 73 + bots, 'số người cả phòng có tính bot');
  assert.equal(count.bots, bots, 'và ghi riêng số bot');
  assert.equal(parseServerMessage(count).ok, true);

  // Chỉ đi lại: không gửi lại cả danh sách, vị trí đi bằng room.moves.
  const statesBefore = inbox.get('yard-1').filter((message) => message.type === 'room.state').length;
  room.move('y-1', { x: 10.5, z: 40.5, ry: 0, moving: true });
  room.broadcastState();
  room.flushMoves();
  assert.equal(inbox.get('yard-1').filter((message) => message.type === 'room.state').length, statesBefore, 'đi lại không gửi lại room.state');
  assert.ok(inbox.get('yard-1').some((message) => message.type === 'room.moves' && message.moves.some((move) => move.id === 'y-1')));
  assert.ok(!inbox.get('hall-1').some((message) => message.type === 'room.moves' && message.moves.some((move) => move.id === 'y-1')));
  room.close();
});

test('rạp phim: đi lại trong rạp, ngồi ghế; thả cảm xúc phát cả phòng, có giới hạn', async () => {
  const room = new Room('cinema-1', { botCount: 0 });
  const sent = [];
  const socket = { readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  assert.deepEqual(room.move('u-1', { x: 0, z: 17.5, ry: 0, moving: false }), { ok: true });
  room.move('u-1', { x: 0, z: 50, ry: 0, moving: true });
  assert.equal(room.participants.get('u-1').pos.z, room.rules.world.bounds.z[1], 'không ra khỏi rạp');
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.ok(sent.some((message) => message.type === 'room.moves' && parseServerMessage(message).ok));
  assert.deepEqual(room.selectSeat('u-1', 'S-45'), { ok: true });
  assert.deepEqual(room.reaction('u-1', 'heart'), { ok: true });
  const reaction = sent.at(-1);
  assert.equal(reaction.type, 'reaction');
  assert.equal(parseServerMessage(reaction).ok, true);
  for (let index = 0; index < 5; index += 1) room.reaction('u-1', 'clap');
  assert.equal(room.reaction('u-1', 'clap').error, 'RATE_LIMITED');
  assert.equal(room.reaction('ghost', 'clap').error, 'NOT_IN_ROOM');
  room.close();
});

test('phòng game: Bầu Cua chơi chung — cả bàn cùng một ván, cược qua ví (API), lắc xong trả thưởng từng người; khách không cược được', async () => {
  const wallet = new Map([['a-an-00000001', 50], ['a-binh-0000001', 50]]);
  const stakes = [];
  const bank = {
    rules: { bettingMs: 120, rollingMs: 40, resultMs: 60, maxStakePerRound: 1_000 },
    random: () => 4, // luôn ra Cua
    stake: async ({ accountId, roundId, animal, amount }) => {
      if (wallet.get(accountId) < amount) return { ok: false, code: 'INSUFFICIENT_COINS' };
      wallet.set(accountId, wallet.get(accountId) - amount);
      stakes.push({ accountId, roundId, animal, amount });
      const mine = {};
      for (const item of stakes) if (item.accountId === accountId && item.roundId === roundId) mine[item.animal] = (mine[item.animal] || 0) + item.amount;
      return { ok: true, mine, coins: wallet.get(accountId) };
    },
    settle: async ({ roundId, dice }) => {
      const results = [];
      for (const accountId of new Set(stakes.filter((item) => item.roundId === roundId).map((item) => item.accountId))) {
        let staked = 0;
        let payout = 0;
        for (const item of stakes.filter((entry) => entry.roundId === roundId && entry.accountId === accountId)) {
          const hits = dice.filter((face) => face === item.animal).length;
          staked += item.amount;
          if (hits) payout += item.amount * (1 + hits);
        }
        wallet.set(accountId, wallet.get(accountId) + payout);
        results.push({ accountId, staked, payout, net: payout - staked, coins: wallet.get(accountId) });
      }
      return { ok: true, results };
    },
  };
  const room = new Room('game-1', { bauCua: bank });
  const inbox = new Map();
  const socketFor = (id) => {
    inbox.set(id, []);
    return { readyState: WebSocket.OPEN, send: (raw) => inbox.get(id).push(JSON.parse(raw)), close() {} };
  };
  room.join(socketFor('an'), { participantId: 'an', displayName: 'An', accountId: 'a-an-00000001' });
  room.join(socketFor('binh'), { participantId: 'binh', displayName: 'Bình', accountId: 'a-binh-0000001' });
  room.join(socketFor('khach'), { participantId: 'khach', displayName: 'Khách' });
  const state = () => room.table.stateMessage();
  assert.equal(state().phase, 'betting');
  const roundId = state().roundId;
  const bet = (id, animal, amount, requestId) => room.table.placeBet(room.participants.get(id), { requestId, roundId, animal, amount });
  assert.deepEqual(await bet('an', 'cua', 10, 'b-1'), { ok: true });
  assert.deepEqual(await bet('an', 'tom', 5, 'b-2'), { ok: true });
  assert.deepEqual(await bet('binh', 'ga', 20, 'b-3'), { ok: true });
  assert.equal((await bet('binh', 'ga', 999, 'b-4')).code, 'STAKE_LIMIT');
  assert.equal((await bet('khach', 'cua', 5, 'b-5')).code, 'SIGN_IN_REQUIRED');
  assert.equal(wallet.get('a-an-00000001'), 35, 'trừ xu ngay khi đặt');
  const mine = inbox.get('an').filter((message) => message.type === 'game.mine').at(-1);
  assert.deepEqual(mine.mine, { cua: 10, tom: 5 });
  assert.equal(parseServerMessage(mine).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 360));
  // Mọi người (kể cả khách) nhận cùng một bàn: tổng cược, số người cược, xúc xắc, người thắng.
  const shared = inbox.get('khach').filter((message) => message.type === 'game.state' && message.roundId === roundId);
  for (const message of shared) assert.equal(parseServerMessage(message).ok, true, JSON.stringify(message));
  const result = shared.find((message) => message.phase === 'result');
  assert.deepEqual(result.dice, ['cua', 'cua', 'cua']);
  assert.deepEqual(result.totals, { nai: 0, bau: 0, ga: 20, ca: 0, cua: 10, tom: 5 });
  assert.equal(result.bettors, 2);
  assert.deepEqual(result.winners, [{ displayName: 'An', net: 25 }]);
  // An: Cua 10 ra 3 lần → nhận 40, Tôm mất 5 → lời 25. Bình: Gà mất 20.
  const payoutAn = inbox.get('an').find((message) => message.type === 'game.payout');
  assert.deepEqual([payoutAn.staked, payoutAn.payout, payoutAn.net, payoutAn.coins], [15, 40, 25, 75]);
  assert.equal(parseServerMessage(payoutAn).ok, true);
  assert.equal(inbox.get('binh').find((message) => message.type === 'game.payout').net, -20);
  assert.equal(inbox.get('khach').some((message) => message.type === 'game.payout'), false);
  // Ván mới tự bắt đầu; cược vào ván cũ bị từ chối.
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.notEqual(state().roundId, roundId);
  assert.equal(state().phase, 'betting');
  assert.equal((await bet('an', 'cua', 5, 'b-6')).code, 'BETTING_CLOSED');
  room.close();
});

test('phòng game: API không chốt được ván thì ván bị hủy (void), không trả thưởng sai', async () => {
  const bank = {
    rules: { bettingMs: 60, rollingMs: 20, resultMs: 1_000, maxStakePerRound: 1_000 },
    stake: async ({ amount }) => ({ ok: true, mine: { nai: amount }, coins: 10 }),
    settle: async () => null,
  };
  const room = new Room('game-1', { bauCua: bank });
  const inbox = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', accountId: 'a-an-00000001' });
  await room.table.placeBet(room.participants.get('an'), { requestId: 'b-1', roundId: room.table.stateMessage().roundId, animal: 'nai', amount: 5 });
  await new Promise((resolve) => setTimeout(resolve, 1_400));
  const result = inbox.filter((message) => message.type === 'game.state').find((message) => message.phase === 'result');
  assert.equal(result.void, true);
  assert.equal(result.winners, undefined);
  assert.equal(inbox.some((message) => message.type === 'game.payout'), false);
  room.close();
});

test('phòng game: hủy cược trong pha đặt — hoàn xu, trừ khỏi tổng cả bàn; hết giờ thì không hủy được', async () => {
  const wallet = new Map([['a-an-00000001', 50], ['a-binh-0000001', 50]]);
  const stakes = [];
  const bank = {
    rules: { bettingMs: 150, rollingMs: 20, resultMs: 1_000, maxStakePerRound: 1_000 },
    stake: async ({ accountId, roundId, animal, amount }) => {
      wallet.set(accountId, wallet.get(accountId) - amount);
      stakes.push({ accountId, roundId, animal, amount });
      const mine = {};
      for (const item of stakes) if (item.accountId === accountId && item.roundId === roundId) mine[item.animal] = (mine[item.animal] || 0) + item.amount;
      return { ok: true, mine, coins: wallet.get(accountId) };
    },
    unstake: async ({ accountId, roundId }) => {
      const removed = {};
      for (let index = stakes.length - 1; index >= 0; index -= 1) {
        const item = stakes[index];
        if (item.accountId !== accountId || item.roundId !== roundId) continue;
        removed[item.animal] = (removed[item.animal] || 0) + item.amount;
        stakes.splice(index, 1);
      }
      const refunded = Object.values(removed).reduce((sum, value) => sum + value, 0);
      wallet.set(accountId, wallet.get(accountId) + refunded);
      return { ok: true, removed, refunded, mine: {}, coins: wallet.get(accountId) };
    },
    settle: async () => ({ ok: true, results: [] }),
  };
  const room = new Room('game-1', { bauCua: bank });
  const inbox = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', accountId: 'a-an-00000001' });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'binh', displayName: 'Bình', accountId: 'a-binh-0000001' });
  const roundId = room.table.stateMessage().roundId;
  await room.table.placeBet(room.participants.get('an'), { requestId: 'b-1', roundId, animal: 'cua', amount: 10 });
  await room.table.placeBet(room.participants.get('an'), { requestId: 'b-2', roundId, animal: 'tom', amount: 5 });
  await room.table.placeBet(room.participants.get('binh'), { requestId: 'b-3', roundId, animal: 'cua', amount: 3 });
  assert.equal(wallet.get('a-an-00000001'), 35);
  assert.deepEqual(await room.table.cancelBets(room.participants.get('an'), { requestId: 'c-1', roundId }), { ok: true });
  assert.equal(wallet.get('a-an-00000001'), 50, 'hoàn đủ xu');
  const state = room.table.stateMessage();
  assert.deepEqual([state.totals.cua, state.totals.tom, state.bettors], [3, 0, 1], 'chỉ còn cược của Bình');
  const mine = inbox.filter((message) => message.type === 'game.mine').at(-1);
  assert.deepEqual([mine.mine, mine.coins], [{}, 50]);
  assert.equal(parseServerMessage(mine).ok, true);
  assert.equal((await room.table.cancelBets(room.participants.get('khach') || { displayName: 'Khách' }, { requestId: 'c-2', roundId })).code, 'SIGN_IN_REQUIRED');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await room.table.cancelBets(room.participants.get('binh'), { requestId: 'c-3', roundId })).code, 'BETTING_CLOSED');
  room.close();
});
