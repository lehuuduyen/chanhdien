import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { test } from 'node:test';
import { createMemoryDirectory } from '@chanh-dien/room-directory';
import { THIEN_GARDEN, THIEN_RULES } from '@chanh-dien/room-rules';
import { parseServerMessage, PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { createJoinTicket, internalKey } from '@chanh-dien/session-token';
import { WebSocket } from 'ws';
import { cinemaPlaylistProvider, createRealtimeServer, handleRealtimeRequest, Room, RoomRegistry, shopBotSkinProvider } from '../server.mjs';

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
    v: PROTOCOL_VERSION,
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
    status: 'ok', service: 'realtime', protocolVersion: PROTOCOL_VERSION, nodeId: 'rt-test', rooms: 0, connections: 0,
  });
});

test('addbot chia ngẫu nhiên tổng bot, giữ đủ người cho ba trò và bot Lô Tô mua vé mô phỏng', async () => {
  const registry = new RoomRegistry({ botCounts: { thien: 0, cinema: 0, game: 0, taixiu: 0, loto: 0 } });
  let serial = 0;
  const distributed = await registry.setBotTotal(100, () => ((serial += 37) % 101) / 101);
  assert.equal(distributed.assigned, 100);
  assert.equal(distributed.rooms.reduce((sum, room) => sum + room.bots, 0), 100);
  for (const roomId of ['game-1', 'taixiu-1', 'loto-1']) {
    const allocation = distributed.rooms.find((room) => room.roomId === roomId);
    const room = registry.rooms.get(roomId);
    assert.ok(allocation.bots >= 2, `${roomId} có ít nhất hai bot`);
    assert.equal([...room.participants.values()].filter((person) => person.bot).length, allocation.bots);
    assert.equal(room.table.running, true, 'bàn tiếp tục chạy khi chỉ có bot');
  }
  const lotto = registry.rooms.get('loto-1');
  // Hai bot chắc chắn mua 1 vé (thói quen riêng), tới lượt mua cuối pha mua vé.
  const buyEnd = lotto.table.round.endsAt - 1;
  const realNow = lotto.table.now;
  lotto.table.now = () => buyEnd;
  for (const bot of [...lotto.participants.values()].filter((person) => person.bot).slice(0, 2)) {
    Object.assign(bot, { ticketChance: 1, doubleChance: 0 });
    lotto.botAct(bot);
  }
  lotto.table.now = realNow;
  assert.deepEqual([lotto.table.stateMessage().players, lotto.table.stateMessage().tickets, lotto.table.stateMessage().pool], [2, 2, 20], 'vé bot góp quỹ');
  await lotto.table.startCalling();
  assert.equal(lotto.table.stateMessage().phase, 'calling');
  assert.equal(parseServerMessage(lotto.table.stateMessage()).ok, true);

  const stopped = await registry.setBotTotal(0);
  assert.equal(stopped.assigned, 0);
  assert.equal(registry.size, 0, 'phòng chỉ có bot được trả lease sau addbot 0');
});

test('/internal/bots cần khóa nội bộ và chỉ nhận tổng bot hợp lệ', async () => {
  const { Readable } = await import('node:stream');
  const registry = new RoomRegistry({ botCounts: { thien: 0, cinema: 0, game: 0, taixiu: 0, loto: 0 } });
  const call = (body, key) => new Promise((resolve) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method: 'POST', url: '/internal/bots', headers: key ? { 'x-internal-key': key } : {} });
    const res = response();
    res.end = function end(text = '') { this.body += text; resolve(this); };
    handleRealtimeRequest(req, res, registry, { secret: SECRET });
  });
  assert.equal((await call({ total: 12 })).status, 403);
  assert.equal((await call({ total: 1.5 }, internalKey(SECRET))).status, 400);
  const result = await call({ total: 12 }, internalKey(SECRET));
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).assigned, 12);
  assert.ok(JSON.parse(result.body).rooms.filter((room) => ['game', 'taixiu', 'loto'].includes(room.type)).every((room) => room.bots >= 2));
  const allocated = await call({ allocations: { 'game-1': 4, 'taixiu-1': 3, 'loto-1': 2 } }, internalKey(SECRET));
  assert.equal(allocated.status, 200);
  assert.equal(JSON.parse(allocated.body).assigned, 9);
  await registry.setBotTotal(0);
});

test('kế hoạch bot theo phòng đi đúng node giữ lease và còn hiệu lực khi phòng mở lại', async () => {
  const directory = createMemoryDirectory();
  const nodeA = new RoomRegistry({ nodeId: 'rt-a', directory, botCounts: { game: 8, taixiu: 8, loto: 0 } });
  const nodeB = new RoomRegistry({ nodeId: 'rt-b', directory, botCounts: { game: 8, taixiu: 8, loto: 0 } });
  await nodeB.open('game-1');
  await nodeA.open('loto-1');
  const plan = { 'game-1': 7, 'taixiu-1': 5, 'loto-1': 4 };
  const [onA, onB] = await Promise.all([nodeA.setBotAllocations(plan), nodeB.setBotAllocations(plan)]);
  assert.equal(onA.assigned + onB.assigned, 16);
  assert.equal([...nodeB.rooms.get('game-1').participants.values()].filter((person) => person.bot).length, 7);
  assert.equal([...nodeA.rooms.get('loto-1').participants.values()].filter((person) => person.bot).length, 4);

  await Promise.all([
    nodeA.setBotAllocations({ 'game-1': 3 }, { replace: false }),
    nodeB.setBotAllocations({ 'game-1': 3 }, { replace: false }),
  ]);
  assert.equal([...nodeB.rooms.get('game-1').participants.values()].filter((person) => person.bot).length, 3);
  assert.equal([...nodeA.rooms.get('loto-1').participants.values()].filter((person) => person.bot).length, 4,
    'đổi riêng Bầu Cua không làm mất bot Lô Tô');

  const owner = (await directory.getRoomOwner('taixiu-1')).nodeId === 'rt-a' ? nodeA : nodeB;
  owner.evict('taixiu-1');
  const reopened = await owner.open('taixiu-1');
  assert.equal([...reopened.room.participants.values()].filter((person) => person.bot).length, 5,
    'phòng mở lại dùng kế hoạch Telegram, không rơi về số mặc định');
  await Promise.all([nodeA.setBotAllocations({}), nodeB.setBotAllocations({})]);
});

test('room từ chối hai người chọn cùng một ghế', () => {
  const room = new Room('cinema-1', { botCount: 0 });
  const socket = { readyState: WebSocket.CLOSED };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  room.join(socket, { participantId: 'u-2', displayName: 'Bình' });
  assert.deepEqual(room.selectSeat('u-1', 'S-1'), { ok: true });
  assert.deepEqual(room.selectSeat('u-2', 'S-1'), { ok: false, error: 'SEAT_TAKEN' });
});

test('room giữ ghế khi rớt mạng và xóa sau thời hạn resume', async () => {
  const room = new Room('cinema-1', { botCount: 0, resumeTtlMs: 20 });
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
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET });
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
  an.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'seat.select', requestId: 'seat-1', seatId: 'S-1' }));
  await selected;

  const conflict = waitForMessage(binh, (message) => message.type === 'protocol.error' && message.code === 'SEAT_TAKEN');
  binh.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'seat.select', requestId: 'seat-2', seatId: 'S-1' }));
  assert.equal((await conflict).requestId, 'seat-2');

  const chat = waitForMessage(an, (message) => message.type === 'chat.message' && message.participantId === 'u-binh');
  binh.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'chat.send', requestId: 'chat-1', text: 'Chào An' }));
  assert.equal((await chat).text, 'Chào An');
});

test('client nối lại bằng resume token và giữ nguyên ghế', async (t) => {
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET });
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
  first.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'seat.select', requestId: 'seat-7', seatId: 'S-7' }));
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
    botCounts: { cinema: 0 }, secret: SECRET, directory, nodeId, leaseTtlMs: 150, nodeTtlMs: 150, tickMs: 25, ...options,
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
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'seat.select', requestId: 'seat-12', seatId: 'S-12' }));
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
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'seat.select', requestId: 'seat-3', seatId: 'S-3' }));
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
  const room = new Room('cinema-1', { botCount: 0 });
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
  const room = new Room('cinema-1', { botCount: 0 });
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
  const registry = new RoomRegistry({ nodeId: 'rt-new', directory, botCounts: { cinema: 0 } });
  const opened = await registry.open('cinema-1');
  assert.equal(opened.ok, true);
  assert.equal(opened.room.epoch, 2);
  assert.equal(opened.room.participants.size, 0);
});

test('resume token đã hết chỗ giữ thì server báo INVALID_RESUME_TOKEN rồi đóng', async (t) => {
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET, resumeTtlMs: 30 });
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
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET, helloTimeoutMs: 50 });
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
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET });
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
  const room = new Room('cinema-1', { botCount: 0 });
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

test('danh sách YouTube admin chỉ phát khi có người, lặp vòng và nhường ưu tiên cho hàng chờ', () => {
  const room = new Room('cinema-1', { botCount: 0 });
  room.setFallbackPlaylist([
    { videoId: 'aaaaaaaaaaa', title: 'Phim nhà chùa A' },
    { videoId: 'bbbbbbbbbbb', title: 'Phim nhà chùa B' },
  ]);
  assert.equal(room.playback.current, null, 'phòng trống không phát âm thầm');
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  assert.equal(room.ensureFallback({ broadcast: false }), true);
  assert.deepEqual([room.playback.current.videoId, room.playback.current.addedBy], ['aaaaaaaaaaa', 'Nhà chùa']);
  assert.equal(parseServerMessage(room.playbackState()).ok, true);

  room.addVideo('u-1', 'ccccccccccc', 'Video của An');
  room.advance();
  assert.deepEqual([room.playback.current.videoId, room.playback.current.addedBy], ['ccccccccccc', 'An'], 'hàng chờ người dùng được phát trước');
  room.advance();
  assert.equal(room.playback.current.videoId, 'bbbbbbbbbbb');
  room.advance();
  assert.equal(room.playback.current.videoId, 'aaaaaaaaaaa', 'hết danh sách thì lặp lại từ đầu');
  room.close();
});

test('máy realtime tải danh sách rạp bằng khóa nội bộ; lỗi API không xóa danh sách đang dùng', async () => {
  const calls = [];
  const provider = cinemaPlaylistProvider('http://api.test:4000', 'internal-key', async (url, options) => {
    calls.push([url.pathname, options.headers['x-internal-key']]);
    return { ok: true, json: async () => ({ videos: [{ videoId: 'dQw4w9WgXcQ' }] }) };
  });
  assert.deepEqual(await provider(), [{ videoId: 'dQw4w9WgXcQ' }]);
  assert.deepEqual(calls, [['/internal/cinema/playlist', 'internal-key']]);

  let fail = false;
  const registry = new RoomRegistry({
    getCinemaPlaylist: async () => (fail ? null : [{ videoId: 'dQw4w9WgXcQ' }]),
    botCounts: { cinema: 0 },
  });
  const opened = await registry.open('cinema-1');
  assert.deepEqual(opened.room.fallbackPlaylist, [{ videoId: 'dQw4w9WgXcQ' }]);
  fail = true;
  await registry.refreshCinemaPlaylist(true);
  assert.deepEqual(opened.room.fallbackPlaylist, [{ videoId: 'dQw4w9WgXcQ' }]);
  opened.room.close();
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
  const restored = new Room('cinema-1', { botCount: 0, epoch: 2 });
  restored.restore(record);
  const state = restored.playbackState();
  assert.equal(state.current.videoId, 'aaaaaaaaaaa');
  assert.equal(state.current.startedAt, record.playback.current.startedAt);
  assert.equal(state.current.duration, 300);
  assert.deepEqual(state.queue.map((item) => item.videoId), ['bbbbbbbbbbb']);
  restored.close();
});

test('client thêm video qua WebSocket: khách không mở phim được, video cấm nhúng bị từ chối, mở phim trừ 20 💎 rồi phát cho cả phòng', async (t) => {
  const fetchVideoInfo = async (videoId) => (videoId === 'blockedvid1'
    ? { ok: false, error: 'VIDEO_NOT_EMBEDDABLE' }
    : { ok: true, title: `Video ${videoId}` });
  const spends = [];
  let balance = 30;
  const wallet = {
    spend: async (input) => {
      spends.push(input);
      if (balance < input.amount) return { ok: false, error: 'INSUFFICIENT_DIAMONDS' };
      balance -= input.amount;
      return { ok: true, diamonds: balance };
    },
    refund: async () => ({ ok: true }),
  };
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET, fetchVideoInfo, wallet });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const an = await connectClient(port, 'u-an', 'An', {
    ticket: createJoinTicket({ participantId: 'u-an', roomId: 'cinema-1', displayName: 'An', accountId: 'a-an-00000001' }, SECRET),
  });
  const binh = await connectClient(port, 'u-binh', 'Bình');
  sockets.push(an.socket, binh.socket);

  const guest = waitForMessage(binh.socket, (message) => message.type === 'protocol.error');
  binh.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'q0', videoId: 'dQw4w9WgXcQ' }));
  assert.equal((await guest).code, 'SIGN_IN_REQUIRED', 'khách không có ví kim cương');

  const blocked = waitForMessage(an.socket, (message) => message.type === 'protocol.error');
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'q1', videoId: 'blockedvid1' }));
  assert.equal((await blocked).code, 'VIDEO_NOT_EMBEDDABLE');

  const playing = waitForMessage(binh.socket, (message) => message.type === 'playback.state' && message.current);
  const paid = waitForMessage(an.socket, (message) => message.type === 'wallet.update');
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'q2', videoId: 'dQw4w9WgXcQ' }));
  const state = await playing;
  const update = await paid;
  assert.deepEqual([update.diamonds, update.spent, parseServerMessage(update).ok], [10, 20, true]);
  assert.deepEqual(spends.map(({ accountId, amount, reason, ref }) => [accountId, amount, reason, ref]), [['a-an-00000001', 20, 'cinema_video', 'dQw4w9WgXcQ']],
    'video cấm nhúng không bị trừ tiền');
  const poor = waitForMessage(an.socket, (message) => message.type === 'protocol.error');
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'q3', videoId: 'aaaaaaaaaaa' }));
  assert.equal((await poor).code, 'INSUFFICIENT_DIAMONDS', 'còn 10 💎, không đủ 20');
  assert.equal(state.current.videoId, 'dQw4w9WgXcQ');
  assert.equal(state.current.title, 'Video dQw4w9WgXcQ');
  assert.equal(state.current.addedBy, 'An');
  assert.equal(state.votesNeeded, 1);

  const late = await connectClient(port, 'u-chi', 'Chi', { waitPlayback: true });
  sockets.push(late.socket);
  assert.equal(late.playback.current.videoId, 'dQw4w9WgXcQ', 'người vào sau nhận ngay bài đang chiếu');
});

test('mở phim: đã trừ kim cương mà video không vào được hàng chờ thì hoàn; cùng requestId dùng cùng khóa', async () => {
  const calls = [];
  const wallet = { spend: async (input) => { calls.push(['spend', input.key]); return { ok: true, diamonds: 80 }; }, refund: async (input) => { calls.push(['refund', input.key]); return { ok: true }; } };
  const room = new Room('cinema-1', { botCount: 0, wallet });
  room.join({ readyState: WebSocket.CLOSED, send() {}, close() {} }, { participantId: 'u-1', displayName: 'An', accountId: 'a-1-00000001' });
  // Có người khác vừa thêm đúng video này trong lúc đang trừ tiền.
  const original = room.addVideo.bind(room);
  room.addVideo = (...args) => { original('u-1', 'dQw4w9WgXcQ', 'X'); return original(...args); };
  assert.deepEqual(await room.addPaidVideo('u-1', 'dQw4w9WgXcQ', 'X', 'q-1'), { ok: false, error: 'ALREADY_QUEUED' });
  assert.deepEqual(calls.map(([kind]) => kind), ['spend', 'refund']);
  assert.equal(calls[0][1], calls[1][1], 'hoàn đúng lần trừ');
  room.close();
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
  assert.equal(room.setSkin('u-1', 'pilgrim').error, 'INVALID_SKIN', 'hình bot không thể chọn cho tài khoản thật');
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

test('bot đứng gần tự phụ người thật làm đủ sáu công việc, mỗi việc chỉ một bot và dừng khi người thật nghỉ', () => {
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  const room = new Room('thien-1', { botCount: 2 });
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  const bots = [...room.participants.values()].filter((participant) => participant.bot && participant.pos);
  assert.equal(bots.length, 2);
  let now = Date.now();

  for (const chore of room.chores.values()) {
    const [helper, other] = bots;
    room.participants.get('u-1').movedAt = 0;
    helper.movedAt = 0;
    other.movedAt = 0;
    helper.talkUntil = 0;
    other.talkUntil = 0;
    helper.benchId = null;
    other.benchId = null;
    helper.pos = { x: chore.x + 0.8, z: chore.z, ry: 0 };
    other.pos = { x: chore.x - 0.8, z: chore.z, ry: 0 };
    helper.walk.waitUntil = Number.POSITIVE_INFINITY;
    other.walk.waitUntil = Number.POSITIVE_INFINITY;
    assert.equal(room.move('u-1', { x: chore.x, z: chore.z, ry: 0, moving: false }).ok, true);
    assert.equal(room.startChore('u-1', chore.id).ok, true);

    now += 1_000;
    room.advanceBotWalk(helper, now);
    room.advanceBotWalk(other, now);
    clearInterval(room.choreTimer);
    room.choreTimer = null;
    const workers = [...chore.workers];
    assert.equal(workers.includes('u-1'), true, `${chore.kind}: người thật vẫn đang làm`);
    assert.equal(workers.filter((id) => room.participants.get(id)?.bot).length, 1, `${chore.kind}: đúng một bot phụ`);
    assert.equal(helper.moving, false, `${chore.kind}: bot dừng đi để cầm dụng cụ`);

    room.stopChore('u-1', chore.id);
    room.advanceBotWalk(helper, now + 1_000);
    assert.equal(chore.workers.size, 0, `${chore.kind}: bot nghỉ khi không còn người thật`);
  }

  room.close();
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

test('hình cao cấp (Bé Mũ Đỏ, Kiếm Sĩ): chỉ người có trong vé mới mặc được, không chia cho người thật mới', () => {
  for (const roomId of ['cinema-1', 'thien-1']) {
    const room = new Room(roomId, { botCount: 0 });
    const socket = { readyState: WebSocket.CLOSED, close() {} };
    room.join(socket, { participantId: 'u-guest', displayName: 'Khách', role: 'guest' });
    room.join(socket, { participantId: 'u-member', displayName: 'An', role: 'member', accountId: 'a-12345678-aaaa' });
    room.join(socket, { participantId: 'u-owner', displayName: 'Bình', role: 'member', accountId: 'a-12345678-bbbb', skins: ['chibigirl'] });
    room.join(socket, { participantId: 'u-sword', displayName: 'Minh', role: 'member', accountId: 'a-12345678-cccc', skins: ['swordsman'] });
    assert.equal(room.setSkin('u-guest', 'chibigirl').error, 'SKIN_LOCKED');
    assert.equal(room.setSkin('u-member', 'chibigirl').error, 'SKIN_LOCKED');
    assert.deepEqual(room.setSkin('u-owner', 'chibigirl'), { ok: true });
    assert.equal(room.setSkin('u-owner', 'swordsman').error, 'SKIN_LOCKED');
    assert.deepEqual(room.setSkin('u-sword', 'swordsman'), { ok: true });
    const people = room.snapshot().participants;
    assert.equal(people.find((person) => person.id === 'u-owner').skin, 'chibigirl');
    assert.equal(people.find((person) => person.id === 'u-sword').skin, 'swordsman');
    assert.equal(JSON.stringify(people).includes('ownedSkins'), false, 'danh sách đồ đã mua không lộ ra phòng');
    room.close();
  }
  // Hình mặc định chia theo mã người: không bao giờ ra hình shop.
  const room = new Room('thien-1', { botCount: 0 });
  for (let index = 0; index < 200; index += 1) room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `u-${index}`, displayName: `N${index}`, role: 'guest' });
  assert.ok(room.snapshot().participants.every((person) => !['chibigirl', 'swordsman'].includes(person.skin)));
  room.close();
});

test('bot xáo hình và dùng cả nhân vật shop đang bán', () => {
  const shopSkins = ['chibigirl', 'shop-kiem-si'];
  const room = new Room('thien-1', { botCount: 10, botSkins: shopSkins });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  while ([...room.participants.values()].filter((person) => person.bot).length < 10) room.addBot(true);
  const bots = [...room.participants.values()].filter((person) => person.bot);
  const skins = bots.map((bot) => bot.skin);
  assert.equal(new Set(skins).size, skins.length, 'chưa dùng hết túi thì mỗi bot mang một hình khác nhau');
  for (const skin of shopSkins) assert.ok(skins.includes(skin), `bot có thể dùng ${skin}`);
  room.close();
});

test('danh mục hình bot đọc món shop đang bật và cache kết quả', async () => {
  let calls = 0;
  const getBotSkins = shopBotSkinProvider('http://api.test:4000', async (url) => {
    calls += 1;
    assert.equal(url.href, 'http://api.test:4000/api/v1/shop');
    return {
      ok: true,
      json: async () => ({ items: [
        { kind: 'skin', skin: 'chibigirl' },
        { kind: 'skin', skin: 'shop-kiem-si' },
        { kind: 'other', skin: 'shop-bo-qua' },
        { kind: 'skin', skin: 'khong-hop-le' },
      ] }),
    };
  });
  assert.deepEqual(await getBotSkins(), ['chibigirl', 'shop-kiem-si']);
  assert.deepEqual(await getBotSkins(), ['chibigirl', 'shop-kiem-si']);
  assert.equal(calls, 1);
});

test('thành viên đăng nhập: lễ vật được gửi ghi sổ, khách thì không; accountId giữ qua failover, không lộ ra phòng', () => {
  const recorded = [];
  const room = new Room('thien-1', { botCount: 0, onOffering: (event) => recorded.push(event) });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  room.join(socket, {
    participantId: 'u-1', displayName: 'Diệu Hạnh', role: 'member', accountId: 'a-12345678-aaaa', level: 2,
    avatarUrl: 'https://lh3.googleusercontent.com/a/abc', title: 'steadfast-practitioner', frame: 'seven-day-lotus',
  });
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
  assert.deepEqual(
    (({ title, frame }) => [title, frame])(restored.snapshot().participants.find((person) => person.id === 'u-1')),
    ['steadfast-practitioner', 'seven-day-lotus'],
    'danh hiệu và khung giữ qua failover',
  );
  assert.equal(restored.participants.get('u-2').accountId, undefined);
  room.close();
  restored.close();
});

test('phòng theo ngôn ngữ: bot mang tên và câu tụng của ngôn ngữ phòng; API hỏi được số người từng phòng', () => {
  const room = new Room('thien-az-en-1', { botCount: 4 });
  room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  const bots = [...room.participants.values()].filter((person) => person.bot);
  assert.ok(bots.length > 0);
  for (const bot of bots) assert.ok(THIEN_RULES.bots.byLang.en.names.includes(bot.displayName));
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
  const cinema = new Room('cinema-1', { botCount: 0 });
  cinema.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  assert.equal(cinema.offer('u-1', 'bell').error, 'OFFERING_NOT_ALLOWED');
  // Rạp chỉ có nhân vật Nam/Nữ (chọn ở cổng chùa), không có công đức.
  assert.equal(cinema.setSkin('u-1', 'monk').error, 'INVALID_SKIN');
  assert.ok(['man', 'woman'].includes(cinema.snapshot().participants[0].skin));
  assert.deepEqual(cinema.setSkin('u-1', 'woman'), { ok: true });
  assert.equal(cinema.snapshot().participants[0].skin, 'woman');
  assert.ok(!('merit' in cinema.snapshot().participants[0]));
  cinema.close();

  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET, fetchVideoInfo: async () => ({ ok: true, title: '' }) });
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
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: 'thien-1', displayName: 'An' }));
  await welcome;
  const refused = waitForMessage(socket, (message) => message.type === 'protocol.error');
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'q1', videoId: 'dQw4w9WgXcQ' }));
  assert.equal((await refused).code, 'NOT_ALLOWED');
  const offered = waitForMessage(socket, (message) => message.type === 'offering');
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'offering.send', requestId: 'o1', kind: 'lotus', text: 'Nguyện cầu bình an' }));
  assert.equal((await offered).participantId, 'u-an');
});

test('bot chánh điện: giữ bồ đoàn như người thật, không tính vào sức chứa và rời khi phòng vắng', async () => {
  let emptied = false;
  const room = new Room('thien-1', { botCount: 3, resumeTtlMs: 20, onEmpty: () => { emptied = true; } });
  assert.equal(room.participants.size, 0, 'phòng chưa có ai thì không có bot');
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  room.join(socket, { participantId: 'u-1', displayName: 'An' });
  const bots = room.snapshot().participants.filter((person) => person.bot);
  assert.equal(bots.length, Math.min(THIEN_RULES.bots.initial, room.botCount, THIEN_RULES.seats));
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

test('số bot cấu hình được (0 là tắt), bằng đúng số addbot tới bots.max; bot ngồi không vượt số bồ đoàn', () => {
  const none = new Room('thien-1', { botCount: 0 });
  none.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
  assert.equal(none.participants.size, 1);
  none.close();
  assert.equal(new Room('thien-1', { botCount: 99 }).botCount, 99);
  assert.equal(new Room('thien-1', { botCount: 9_999 }).botCount, THIEN_RULES.bots.max);
  assert.equal(new Room('thien-1').botCount, THIEN_RULES.bots.count);
  const many = new Room('thien-1', { botCount: 60 });
  many.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-2', displayName: 'Bình' });
  assert.equal(many.botTargetCount, 60, 'tổng bot đúng số addbot');
  assert.equal(many.botSeatedTarget, THIEN_RULES.seats - 1, 'bồ đoàn còn trống đều có bot ngồi (tối đa 20)');
  assert.equal(many.botWalkingTarget, 60 - (THIEN_RULES.seats - 1), 'còn lại ra sân');
  for (let index = 0; index < 15; index += 1) many.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `p-${index}`, displayName: `Người ${index}` });
  assert.equal(many.botSeatedTarget, THIEN_RULES.seats - 16, 'người thật vào: bot ngồi nhường bồ đoàn');
  assert.equal(many.botTargetCount, 60, 'bot nhường ghế ra sân đi dạo, tổng không đổi');
  many.close();
  assert.equal(new Room('cinema-1', { botCount: 0 }).botCount, 0, 'botCount truyền thẳng vào Room vẫn tắt được bot rạp (dùng trong test)');
});

test('dựng lại rạp từ snapshot: bot tạo sẵn ngồi trùng ghế người cũ thì bot nhường ghế', () => {
  const room = new Room('cinema-1');
  const taken = [...room.participants.values()].find((person) => person.bot).seatId;
  room.restore({ revision: 3, participants: [{ id: 'u-1', displayName: 'An', seatId: taken, resumeToken: 'r'.repeat(32) }] });
  const onSeat = [...room.participants.values()].filter((person) => person.seatId === taken);
  assert.deepEqual(onSeat.map((person) => person.id), ['u-1']);
  room.close();
});

test('rạp luôn có 10–30 bot ngồi ghế ngẫu nhiên, dao động trong khoảng đó; addbot không đổi số bot rạp', async () => {
  const counts = new Set();
  for (let index = 0; index < 12; index += 1) {
    const room = new Room('cinema-1');
    const bots = [...room.participants.values()].filter((person) => person.bot);
    assert.ok(room.botCount >= 10 && room.botCount <= 30, `số bot ${room.botCount}`);
    assert.equal(bots.length, room.botCount, 'đủ bot ngay khi mở rạp, chưa cần người vào');
    assert.ok(bots.every((bot) => bot.seatId), 'bot nào cũng ngồi ghế');
    assert.equal(new Set(bots.map((bot) => bot.seatId)).size, bots.length, 'không hai bot một ghế');
    assert.equal(room.keepBotsAlive, true, 'phòng giữ bot khi chưa có người');
    counts.add(room.botCount);
    // Ghế ngẫu nhiên: không lấp liền từ S-1.
    const firstSeats = Array.from({ length: bots.length }, (_, k) => `S-${k + 1}`);
    assert.notDeepEqual(bots.map((bot) => bot.seatId).sort(), firstSeats.sort());
    // Dao động không ra ngoài [10, 30].
    let now = Date.now();
    for (let step = 0; step < 400; step += 1) {
      now += 60_000;
      room.driftBotCount(now, Math.random);
      assert.ok(room.botCount >= 10 && room.botCount <= 30, `dao động ra ngoài khoảng: ${room.botCount}`);
    }
    room.close();
  }
  assert.ok(counts.size > 1, 'mỗi lần mở rạp một số khác nhau');

  const registry = new RoomRegistry({ nodeId: 'rt-cinema-bots' });
  const opened = await registry.open('cinema-1');
  const before = opened.room.botCount;
  await registry.setBotTotal(0);
  assert.equal(opened.room.botCount, before, 'addbot 0 không tắt bot rạp');
  assert.equal(registry.managedBotCount('cinema-1'), undefined);
  await registry.shutdown?.();
  for (const room of registry.rooms.values()) room.close();
});

test('bot có nhịp riêng, dâng hương nhiều nhất và không bao giờ thỉnh chuông', () => {
  const room = new Room('thien-1', { botCount: 6 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  const bots = () => [...room.participants.values()].filter((person) => person.bot);
  const seatedBots = () => bots().filter((person) => person.seatId);
  assert.equal(bots().length, Math.min(THIEN_RULES.bots.initial, room.botCount, THIEN_RULES.seats), 'bot ban đầu không vượt cấu hình và số bồ đoàn');
  assert.equal(new Set(bots().map((bot) => bot.displayName)).size, bots().length, 'không trùng tên');
  assert.equal(new Set(bots().map((bot) => bot.skin)).size, bots().length, 'hình bot được rút ngẫu nhiên không lặp trong lượt đầu');
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

test('bot ngoài sân tự chọn chỗ tới, tìm đường rồi đi, phát room.moves như người thật', () => {
  const sent = [];
  const room = new Room('thien-1', { botCount: 4 });
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  const walker = [...room.participants.values()].find((person) => person.bot && person.pos);
  assert.ok(walker, 'phải có bot đứng ngoài khuôn viên');
  const before = { ...walker.pos };
  walker.walk.waitUntil = 0;
  // Nhịp đầu chọn chỗ muốn tới và tìm đường, nhịp sau mới bước.
  assert.equal(room.advanceBotWalk(walker, Date.now()), true);
  assert.ok(walker.walk.route.length > 0 || walker.errand, 'đã có tuyến đi');
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
  const move = batch.moves.find((item) => item.id === walker.id);
  // Tuyến ngẫu nhiên có thể ngắn: nếu bước này vừa tới đích thì bot đúng khi phát m=false (đứng lại), không phải
  // lúc nào cũng m=true. Gói gửi cho client phải phản ánh đúng toàn bộ vị trí / trạng thái hiện tại của bot.
  assert.deepEqual(move, { id: walker.id, x: walker.pos.x, z: walker.pos.z, ry: walker.pos.ry, m: walker.moving });
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
  assert.equal(new Room('cinema-1', { botCount: 0 }).move('x', { x: 0, z: 5, ry: 0, moving: true }).error, 'NOT_IN_ROOM');
  room.close();
});

test('khu thú cưng: chỉ tương tác khi đang ở trong khu và phát hiệu ứng hợp lệ cho cả phòng', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const an = [];
  const binh = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => an.push(JSON.parse(raw)), close() {} }, { participantId: 'u-1', displayName: 'An' });
  room.join({ readyState: WebSocket.OPEN, send: (raw) => binh.push(JSON.parse(raw)), close() {} }, { participantId: 'u-2', displayName: 'Bình' });
  room.participants.get('u-1').pos = { x: 12, z: 88, ry: 0 };
  room.participants.get('u-2').pos = { x: 0, z: 33, ry: 0 };
  an.length = 0;
  binh.length = 0;

  assert.deepEqual(room.petInteract('u-1', 'pet-cat-miu', 'pet'), { ok: true });
  const event = an.find((message) => message.type === 'pet.interaction');
  assert.deepEqual(parseServerMessage(event).ok, true);
  assert.deepEqual(
    (({ participantId, petId, action }) => ({ participantId, petId, action }))(event),
    { participantId: 'u-1', petId: 'pet-cat-miu', action: 'pet' },
  );
  assert.equal(binh.filter((message) => message.type === 'pet.interaction').length, 1, 'người khác cùng phòng cũng thấy hiệu ứng');
  assert.equal(room.petInteract('u-2', 'pet-cat-miu', 'feed').error, 'TOO_FAR');
  assert.equal(room.petInteract('u-1', 'pet-khong-co', 'play').error, 'INVALID_PET');
  assert.equal(room.petInteract('u-1', 'pet-cat-miu', 'ride').error, 'INVALID_PET');
  for (let index = 0; index < 5; index += 1) assert.equal(room.petInteract('u-1', 'pet-cat-miu', 'play').ok, true);
  assert.equal(room.petInteract('u-1', 'pet-cat-miu', 'feed').error, 'RATE_LIMITED');
  room.close();
});

test('đi nhanh: server chỉ nhận các điểm cố định, rời chỗ ngồi và phát vị trí mới', async () => {
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
  assert.deepEqual(room.travel('u-1', 'pets'), { ok: true });
  assert.deepEqual(room.participants.get('u-1').pos, THIEN_RULES.world.travel.pets);

  await new Promise((resolve) => setTimeout(resolve, 260));
  const moved = sent.find((message) => message.type === 'room.moves' && message.moves.some((item) => item.id === 'u-1'));
  assert.deepEqual(moved.moves.find((item) => item.id === 'u-1'), {
    id: 'u-1', ...THIEN_RULES.world.travel.pets, m: false,
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
  assert.equal(new Room('cinema-1', { botCount: 0 }).announcePrayer('x', 'peace').error, 'NOT_IN_ROOM');
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
  const ok = await call({ plots: [plot], effect: { plotId: 2, kind: 'water', by: 'An' }, at: 1_762_000_000_123 }, internalKey(SECRET));
  assert.equal(ok.status, 200);
  const sent = inbox.find((message) => message.type === 'garden.plot');
  assert.equal(sent.plots[0].crop.stage, 'sprout');
  assert.equal(sent.effect.kind, 'water');
  assert.equal(sent.at, 1_762_000_000_123, 'chuyển nguyên mốc thứ tự của API cho client');
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

test('bot phòng Bầu Cua và Tài Xỉu chơi mô phỏng bằng tên thường và không gọi ví thật', () => {
  for (const roomId of ['game-1', 'taixiu-1']) {
    let stakeCalls = 0;
    const room = new Room(roomId, {
      botCount: 4,
      bauCua: {
        rules: { game: roomId.startsWith('taixiu-') ? 'tai-xiu' : 'bau-cua', bettingMs: 60_000, rollingMs: 1_000, resultMs: 1_000, maxStakePerRound: 1_000 },
        stake: async () => { stakeCalls += 1; return { ok: false }; },
        settle: async () => ({ ok: true, results: [] }),
      },
    });
    room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: 'u-1', displayName: 'An' });
    const bots = [...room.participants.values()].filter((person) => person.bot);
    assert.equal(bots.length, 4);
    assert.ok(bots.every((bot) => !bot.displayName.includes('🤖') && bot.skin), 'bot dùng tên thường và có hình nhân vật');
    for (const bot of bots) room.botAct(bot);
    const state = room.table.stateMessage();
    assert.equal(state.bettors, 4);
    assert.ok(Object.values(state.totals).reduce((sum, value) => sum + value, 0) > 0);
    assert.equal(stakeCalls, 0, 'cược bot không gọi API ví');
    assert.equal(parseServerMessage(state).ok, true);
    room.close();
  }
});

test('bot game tự nhường chỗ khi phòng gần giới hạn protocol', () => {
  const room = new Room('game-1', { botCount: 4 });
  room.maxParticipants = 5;
  for (let index = 1; index <= 5; index += 1) {
    room.join({ readyState: WebSocket.CLOSED, close() {} }, { participantId: `u-${index}`, displayName: `Người ${index}` });
  }
  assert.equal(room.realCount, 5);
  assert.equal([...room.participants.values()].filter((person) => person.bot).length, 0);
  assert.equal(room.snapshot().participants.length, 5);
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
  const room = new Room('game-1', { bauCua: bank, botCount: 0 });
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
  const room = new Room('game-1', { bauCua: bank, botCount: 0 });
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
  const room = new Room('game-1', { bauCua: bank, botCount: 0 });
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

test('phòng Tài Xỉu: chung bàn với Bầu Cua — ô cược riêng (spot), xúc xắc 1–6, giữ 10 ván gần nhất', async () => {
  const stakes = [];
  const settled = [];
  let face = 0;
  const bank = {
    rules: { game: 'tai-xiu', bettingMs: 30, rollingMs: 10, resultMs: 10, maxStakePerRound: 1_000, historyRounds: 10 },
    random: () => (face++ % 6),
    stake: async ({ accountId, roundId, animal, amount }) => {
      stakes.push({ accountId, roundId, spot: animal, amount });
      return { ok: true, mine: { [animal]: amount }, coins: 100 - amount };
    },
    settle: async ({ roundId, dice }) => { settled.push({ roundId, dice }); return { ok: true, results: [] }; },
  };
  const room = new Room('taixiu-1', { bauCua: bank, botCount: 0 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', accountId: 'a-an-00000001' });
  const first = room.table.stateMessage();
  assert.equal(first.game, 'tai-xiu');
  assert.match(first.roundId, /^tx-/);
  assert.equal(Object.keys(first.totals).length, 22);
  assert.deepEqual(first.history, []);
  const an = room.participants.get('an');
  assert.equal((await room.table.placeBet(an, { requestId: 'x-1', roundId: first.roundId, animal: 'cua', amount: 5 })).code, 'INVALID_BET', 'linh vật Bầu Cua không có ở bàn Tài Xỉu');
  assert.deepEqual(await room.table.placeBet(an, { requestId: 'x-2', roundId: first.roundId, spot: 'tai', amount: 10 }), { ok: true });
  assert.equal(room.table.stateMessage().totals.tai, 10);
  assert.deepEqual(stakes[0], { accountId: 'a-an-00000001', roundId: first.roundId, spot: 'tai', amount: 10 });
  // Chạy qua 12 ván: lịch sử chỉ còn 10 ván mới nhất, mới nhất đứng đầu.
  await waitForCondition(() => room.table.serial >= 13, 5_000);
  const state = room.table.stateMessage();
  assert.equal(state.history.length, 10);
  assert.ok(state.history.every((dice) => dice.length === 3 && dice.every((value) => value >= 1 && value <= 6)));
  assert.deepEqual(settled[0].dice.every((value) => Number.isInteger(value)), true, 'ván có cược được chốt với 3 số');
  assert.ok(sent.filter((message) => message.type === 'game.state').every((message) => parseServerMessage(message).ok), 'mọi game.state đúng protocol');
  room.close();
});

test('phòng Lô Tô: mua vé qua ví, gọi số, người đợi, kinh sai bị khóa, kinh đúng ngừng gọi số rồi chốt ván', async () => {
  const row = [1, 2, 3, 4, 5, 0, 0, 0, 0];
  const ticket = [row, [11, 12, 13, 14, 15, 0, 0, 0, 0], [21, 22, 23, 24, 25, 0, 0, 0, 0]];
  const bought = [];
  const settled = [];
  const bank = {
    rules: { buyMs: 40, callMs: 80, claimWindowMs: 60, resultMs: 5_000, graceAfterLastMs: 20, falseClaimLockMs: 2_000, ticketPrice: 10 },
    random: () => 0, // luôn rút số nhỏ nhất còn lại: 1, 2, 3…
    buy: async ({ accountId, roundId, count, autoMark }) => {
      bought.push({ accountId, roundId, count, autoMark });
      return { ok: true, tickets: [{ no: 1, rows: ticket }], autoMark, coins: 90 };
    },
    settle: async (input) => {
      settled.push(input);
      return {
        ok: true, pool: 20, prize: 18, share: 18, winners: input.claims,
        results: [{ accountId: 'a-binh-0000001', staked: 10, payout: 18, net: 8, coins: 108 }, { accountId: 'a-an-00000001', staked: 10, payout: 0, net: -10, coins: 90 }],
      };
    },
  };
  const room = new Room('loto-1', { lotto: bank });
  const inbox = new Map();
  const socketFor = (id) => {
    inbox.set(id, []);
    return { readyState: WebSocket.OPEN, send: (raw) => inbox.get(id).push(JSON.parse(raw)), close() {} };
  };
  room.join(socketFor('an'), { participantId: 'an', displayName: 'An', accountId: 'a-an-00000001' });
  room.join(socketFor('binh'), { participantId: 'binh', displayName: 'Bình', accountId: 'a-binh-0000001' });
  const table = room.table;
  assert.equal(table.kind, 'loto');
  const roundId = table.stateMessage().roundId;
  assert.match(roundId, /^lt-/);
  // Không ai mua: hết giờ thì kéo dài pha mua, không gọi số.
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(table.stateMessage().phase, 'buying');
  assert.equal(table.stateMessage().roundId, roundId);
  const an = room.participants.get('an');
  const binh = room.participants.get('binh');
  assert.deepEqual(await table.buy(an, { requestId: 'buy-1', roundId, count: 1, autoMark: true }), { ok: true });
  // Mới một người có vé: hết giờ mua vẫn chờ thêm người, chưa gọi số.
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.deepEqual([table.stateMessage().phase, table.stateMessage().players, table.stateMessage().called.length], ['buying', 1, 0]);
  assert.deepEqual(await table.buy(binh, { requestId: 'buy-2', roundId, count: 1, autoMark: false }), { ok: true });
  const mine = inbox.get('an').find((message) => message.type === 'lotto.tickets');
  assert.deepEqual([mine.tickets.length, mine.autoMark, mine.coins], [1, true, 90]);
  assert.equal(parseServerMessage(mine).ok, true);
  assert.equal(inbox.get('binh').some((message) => message.type === 'lotto.tickets' && message.autoMark === true), false, 'vé gửi riêng từng người');

  await waitForCondition(() => table.stateMessage().called.length === 4, 3_000);
  const waiting = table.stateMessage().waiting;
  assert.deepEqual(waiting.map((item) => item.number), [5, 5], 'cả hai đang đợi số 5');
  assert.equal((await table.claim(an, { roundId, ticket: 1, row: 0 })).code, 'FALSE_CLAIM', 'mới 4 số: kinh sai');
  await waitForCondition(() => table.stateMessage().called.length === 5, 3_000);
  assert.equal((await table.claim(an, { roundId, ticket: 1, row: 0 })).code, 'CLAIM_LOCKED', 'đang bị khóa vì kinh sai');
  assert.deepEqual(await table.claim(binh, { roundId, ticket: 1, row: 0 }), { ok: true });
  assert.equal(table.stateMessage().phase, 'claiming');
  const calledAtClaim = table.stateMessage().called.length;
  assert.deepEqual(await table.claim(binh, { roundId, ticket: 1, row: 0 }), { ok: true }, 'kinh lại không tính trùng');
  await waitForCondition(() => table.stateMessage().phase === 'result', 3_000);
  assert.equal(table.stateMessage().called.length, calledAtClaim, 'ngừng gọi số khi có người kinh');
  assert.equal(settled.length, 1);
  assert.deepEqual(settled[0].claims, [{ accountId: 'a-binh-0000001', ticket: 1, row: 0 }]);
  assert.deepEqual(table.stateMessage().winners, [{ displayName: 'Bình', share: 18 }]);
  assert.equal(inbox.get('binh').find((message) => message.type === 'game.payout').net, 8);
  assert.equal(inbox.get('an').find((message) => message.type === 'game.payout').net, -10);
  for (const messages of inbox.values()) for (const message of messages.filter((item) => item.type === 'lotto.state')) assert.equal(parseServerMessage(message).ok, true);
  room.close();
});

test('vào phòng mặc ngay hình chọn lần cuối (vé ghi skin); hình shop chỉ khi vé ghi đã mua', () => {
  const room = new Room('cinema-1', { botCount: 0 });
  const socket = { readyState: WebSocket.CLOSED, close() {} };
  room.join(socket, { participantId: 'u-a', displayName: 'A', role: 'member', accountId: 'a-12345678-aaaa', skin: 'woman' });
  room.join(socket, { participantId: 'u-b', displayName: 'B', role: 'member', accountId: 'a-12345678-bbbb', skin: 'chibigirl', skins: ['chibigirl'] });
  room.join(socket, { participantId: 'u-c', displayName: 'C', role: 'member', accountId: 'a-12345678-cccc', skin: 'chibigirl' });
  room.join(socket, { participantId: 'u-d', displayName: 'D', role: 'member', accountId: 'a-12345678-dddd', skin: 'monk' });
  const skins = Object.fromEntries(room.snapshot().participants.map((person) => [person.id, person.skin]));
  assert.equal(skins['u-a'], 'woman');
  assert.equal(skins['u-b'], 'chibigirl');
  assert.notEqual(skins['u-c'], 'chibigirl', 'vé không ghi đã mua thì không mặc');
  assert.ok(['man', 'woman'].includes(skins['u-d']), 'rạp không có hình sư thầy');
  room.close();
});

test('một tài khoản chỉ là một người trong phòng: vào từ trình duyệt khác thì phiên cũ bị thay (SESSION_REPLACED), khách thì không', () => {
  const room = new Room('cinema-1', { botCount: 0 });
  const sockets = {};
  const socketFor = (name) => {
    sockets[name] = { sent: [], closed: null, readyState: WebSocket.OPEN, send(raw) { this.sent.push(JSON.parse(raw)); }, close(code) { this.closed = code; this.readyState = WebSocket.CLOSED; } };
    return sockets[name];
  };
  room.join(socketFor('chrome'), { participantId: 'u-chrome', displayName: 'An', role: 'member', accountId: 'a-12345678-aaaa' });
  assert.equal(room.selectSeat('u-chrome', 'S-1').ok, true);
  room.join(socketFor('safari'), { participantId: 'u-safari', displayName: 'An', role: 'member', accountId: 'a-12345678-aaaa' });
  const people = room.snapshot().participants;
  assert.deepEqual(people.map((person) => person.id), ['u-safari'], 'chỉ còn phiên mới');
  assert.equal(sockets.chrome.closed, 4003);
  assert.equal(sockets.chrome.sent.at(-1).code, 'SESSION_REPLACED');
  assert.equal(room.selectSeat('u-safari', 'S-1').ok, true, 'ghế của phiên cũ được trả');
  // Khách (không tài khoản) cùng tên vẫn là hai người khác nhau.
  room.join(socketFor('g1'), { participantId: 'u-g1', displayName: 'Khách', role: 'guest' });
  room.join(socketFor('g2'), { participantId: 'u-g2', displayName: 'Khách', role: 'guest' });
  assert.equal(room.snapshot().participants.length, 3);
  // Bản đang chờ nối lại (đã ngắt) của cùng tài khoản cũng bị thay khi vào bằng vé mới.
  room.disconnect('u-safari', sockets.safari);
  room.join(socketFor('phone'), { participantId: 'u-phone', displayName: 'An', role: 'member', accountId: 'a-12345678-aaaa' });
  assert.deepEqual(room.snapshot().participants.filter((person) => person.displayName === 'An').map((person) => person.id), ['u-phone']);
  room.close();
});

test('Lô Tô: một người đợi hai hàng (hai vé) thì danh sách đợi có cả hai số, không trùng số', async () => {
  const { LottoTable } = await import('../loto.mjs');
  const room = { id: 'loto-1', epoch: 1, participants: new Map([['an', { id: 'an', accountId: 'a-an-00000001', displayName: 'An' }]]), broadcast() {} };
  const table = new LottoTable({ room, rules: { buyMs: 60_000, callMs: 4_000, ticketPrice: 10 } });
  table.running = true;
  table.nextRound();
  table.stop();
  const round = table.round;
  round.tickets.set('a-an-00000001', [
    { no: 1, rows: [[1, 2, 3, 4, 5, 0, 0, 0, 0], [11, 12, 13, 14, 15, 0, 0, 0, 0], [21, 22, 23, 24, 0, 0, 0, 0, 0]] },
    { no: 2, rows: [[1, 2, 3, 4, 50, 0, 0, 0, 0], [31, 32, 33, 34, 0, 0, 0, 0, 0], [41, 42, 43, 44, 45, 0, 0, 0, 0]] },
  ]);
  for (const number of [1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23]) round.calledSet.add(number);
  assert.deepEqual(table.waitingList(), [
    { displayName: 'An', number: 5 }, { displayName: 'An', number: 15 }, { displayName: 'An', number: 24 }, { displayName: 'An', number: 50 },
  ], 'đợi 4 hàng: số 5 (hàng 1 vé 1), 15, 24 (vé 1) và 50 (vé 2)');
  const message = { ...table.stateMessage(), waiting: table.waitingList() };
  assert.equal(parseServerMessage(message).ok, true, 'vẫn đúng protocol (tối đa 8 mục)');
});

test('Lô Tô: bot tự kinh và hô trong chat; ván có vé thật thì bot dò chậm một nhịp và được chia quỹ như người thắng', async () => {
  const { LottoTable } = await import('../loto.mjs');
  const said = [];
  const bot = { id: 'bot-1', bot: true, displayName: 'Sen Nhỏ' };
  const room = {
    id: 'loto-1', epoch: 1, broadcast() {}, botSpeak: (who, text) => said.push([who.displayName, text]),
    participants: new Map([['bot-1', bot], ['an', { id: 'an', accountId: 'a-an-00000001', displayName: 'An' }]]),
  };
  const settles = [];
  const table = new LottoTable({
    room, rules: { buyMs: 60_000, callMs: 4_000, claimWindowMs: 3_000, resultMs: 5_000, ticketPrice: 10 },
    settle: async (input) => { settles.push(input); return { ok: true, winners: [], share: 9, botWinners: 1, results: [] }; },
  });
  const play = (withRealTicket) => {
    table.running = true;
    table.nextRound();
    const round = table.round;
    round.botTickets.set('bot-1', [{ no: 1, rows: [[1, 2, 3, 4, 5, 0, 0, 0, 0], [11, 12, 13, 14, 15, 0, 0, 0, 0], [21, 22, 23, 24, 25, 0, 0, 0, 0]] }]);
    if (withRealTicket) round.tickets.set('a-an-00000001', [{ no: 1, rows: [[31, 32, 33, 34, 35, 0, 0, 0, 0], [41, 42, 43, 44, 45, 0, 0, 0, 0], [51, 52, 53, 54, 55, 0, 0, 0, 0]] }]);
    round.phase = 'calling';
    // Luôn gọi số nhỏ nhất còn lại: 1, 2, 3… nên hàng đầu vé bot đủ ở nhịp thứ 5.
    table.random = () => 0;
    return round;
  };

  let round = play(false);
  for (let call = 0; call < 5; call += 1) table.callNext();
  assert.equal(round.phase, 'claiming', 'ván chỉ có bot: đủ hàng là kinh ngay');
  assert.deepEqual(said.map(([name]) => name), ['Sen Nhỏ']);
  assert.match(said[0][1], /Kinh/);
  table.stop();

  said.length = 0;
  round = play(true);
  for (let call = 0; call < 5; call += 1) table.callNext();
  assert.equal(round.phase, 'calling', 'có vé thật: nhịp vừa đủ hàng bot chưa kinh');
  table.callNext();
  assert.equal(round.phase, 'claiming', 'nhịp sau bot kinh');
  await table.finish();
  assert.deepEqual([settles.at(-1).claims, settles.at(-1).botWinners, settles.at(-1).botTickets], [[], 1, 1], 'API nhận số bot kinh và số vé bot để chia quỹ');
  assert.equal(table.stateMessage().pool, 20, 'quỹ trên bàn gồm cả vé bot: 2 vé × 10 xu');
  assert.equal(round.void, false);
  assert.deepEqual(round.winners, [{ displayName: 'Sen Nhỏ', share: 9 }]);
  assert.equal(parseServerMessage(table.stateMessage()).ok, true);
  table.stop();
});

test('nắm tay: mời khi đứng gần, đồng ý thì room.state ghi người dẫn / người theo; ngồi, đi quá xa, rời phòng thì buông', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const inbox = new Map();
  const socketFor = (id) => {
    inbox.set(id, []);
    return { readyState: WebSocket.OPEN, send: (raw) => inbox.get(id).push(JSON.parse(raw)), close() {} };
  };
  for (const [id, name] of [['an', 'An'], ['binh', 'Bình'], ['chi', 'Chi']]) room.join(socketFor(id), { participantId: id, displayName: name, role: 'guest' });
  const place = (id, x, z) => { room.participants.get(id).movedAt = 0; return room.move(id, { x, z, ry: 0, moving: false }); };
  place('an', 0, 40);
  place('binh', 1, 40);
  place('chi', 9, 40);
  const states = (id) => inbox.get(id).filter((message) => message.type === 'hand.state');

  assert.equal(room.handRequest('an', 'chi').error, 'TOO_FAR', 'cách 9 m');
  assert.equal(room.handRequest('an', 'an').error, 'NOT_IN_ROOM');
  assert.deepEqual(room.handRequest('an', 'binh'), { ok: true });
  assert.deepEqual(states('binh').at(-1), { v: PROTOCOL_VERSION, type: 'hand.state', epoch: room.epoch, fromId: 'an', toId: 'binh', status: 'pending' });
  assert.equal(parseServerMessage(states('binh').at(-1)).ok, true);
  assert.equal(room.handRespond('binh', 'chi', true).error, 'NO_REQUEST', 'không có lời mời từ Chi');
  assert.deepEqual(room.handRespond('binh', 'an', true), { ok: true });
  const entry = (id) => room.snapshot().participants.find((person) => person.id === id);
  assert.deepEqual([entry('an').handWith, entry('an').handLead, entry('binh').handWith, entry('binh').handLead], ['binh', true, 'an', undefined]);
  assert.equal(parseServerMessage(room.snapshot()).ok, true, 'room.state có handWith / handLead đúng protocol');
  assert.equal(states('an').at(-1).status, 'accepted');
  assert.equal(room.handRequest('chi', 'binh').error, 'HAND_BUSY');

  // Ngồi ghế đá: buông tay, báo cả hai ai buông.
  assert.deepEqual(room.releaseHand('binh'), { ok: true });
  assert.deepEqual(states('an').at(-1), { v: PROTOCOL_VERSION, type: 'hand.state', epoch: room.epoch, fromId: 'an', toId: 'binh', status: 'released', byId: 'binh' });
  assert.equal(entry('an').handWith, undefined);
  assert.equal(room.releaseHand('binh').error, 'NO_REQUEST');

  // Hai bên cùng mời nhau: coi như đồng ý; rồi người đi theo đi quá xa → tự buông.
  room.handRequest('binh', 'an');
  assert.deepEqual(room.handRequest('an', 'binh'), { ok: true });
  assert.equal(entry('binh').handLead, true, 'Bình mời trước nên dẫn đường');
  for (let x = 1; x <= 16; x += 3) place('an', x, 40);
  assert.equal(entry('binh').handWith, undefined, 'cách quá 12 m');
  assert.equal(states('binh').at(-1).byId, 'an');

  // Đang nắm tay mà một người rời phòng: người còn lại được báo buông.
  place('an', 1.5, 40);
  room.handRequest('an', 'binh');
  room.handRespond('binh', 'an', true);
  room.kick('an', 'BANNED', 'thử');
  assert.equal(entry('binh').handWith, undefined);
  assert.deepEqual([states('binh').at(-1).status, states('binh').at(-1).byId], ['released', 'an']);
  room.close();
});

test('bot như người thật: nhận kết bạn, nắm tay rồi đi theo người dẫn; tin "@Tên bot" chuyển quản trị; quản trị trả lời thì bot nói', async () => {
  const forwarded = [];
  const room = new Room('thien-1', { botCount: 0, onBotChat: (event) => forwarded.push(event) });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', role: 'guest' });
  room.participants.get('an').movedAt = 0;
  room.move('an', { x: 0, z: 40, ry: 0, moving: false });
  room.participants.set('b-1', { id: 'b-1', displayName: 'Sen Nhỏ', bot: true, connected: true, socket: null, pos: { x: 1, z: 40, ry: 0 } });
  const latest = (type) => sent.filter((message) => message.type === type).at(-1);

  assert.deepEqual(room.friendRequest('an', 'b-1'), { ok: true });
  assert.equal(latest('friend.state').status, 'pending');
  assert.deepEqual(room.handRequest('an', 'b-1'), { ok: true });
  await new Promise((resolve) => setTimeout(resolve, 3_200));
  assert.deepEqual([latest('friend.state').status, latest('friend.state').saved], ['accepted', false], 'bot nhận lời kết bạn trong phiên');
  assert.equal(latest('hand.state').status, 'accepted');
  const bot = room.participants.get('b-1');
  assert.deepEqual([bot.handWith, bot.handLead], ['an', false]);
  // Người dẫn đi tới 3 m: bot đứng cạnh, cách ~0,55 m về phía bot đang đứng.
  room.participants.get('an').movedAt = 0;
  room.move('an', { x: 0, z: 37, ry: 0, moving: true });
  assert.deepEqual([bot.pos.x, bot.pos.z], [0.55, 37]);
  assert.equal(room.advanceBotWalk(bot), false, 'bot đang nắm tay thì không đi dạo một mình');

  assert.equal(room.botMentioned('@Sen Nhỏ chào bạn')?.id, 'b-1');
  assert.equal(room.botMentioned('@sen nhỏ: chào')?.id, 'b-1', 'không phân biệt hoa thường');
  assert.equal(room.botMentioned('@Sen Nhỏxyz'), null);
  assert.equal(room.botMentioned('chào @Sen Nhỏ'), null);
  room.forwardBotChat(room.participants.get('an'), bot, '@Sen Nhỏ chào bạn');
  assert.deepEqual(forwarded, [{ roomId: 'thien-1', botId: 'b-1', botName: 'Sen Nhỏ', fromId: 'an', fromName: 'An', text: '@Sen Nhỏ chào bạn' }]);
  assert.ok(bot.talkUntil > Date.now() + 10 * 60_000, 'bot ở lại chờ quản trị trả lời');

  assert.deepEqual(room.botSay('b-1', '@An  Chào  An nhé 🙏'), { ok: true, botName: 'Sen Nhỏ' });
  const said = latest('chat.message');
  assert.deepEqual([said.participantId, said.displayName, said.text], ['b-1', 'Sen Nhỏ', '@An Chào An nhé 🙏']);
  assert.equal(parseServerMessage(said).ok, true);
  assert.equal(room.botSay('b-404', 'xin chào').error, 'BOT_GONE');
  assert.equal(room.botSay('b-1', 'xin chào', 'Chơn Như').error, 'BOT_GONE', 'mã b-1 nay là bot khác tên');
  room.close();
});

test('/internal/bot-say: chỉ máy giữ phòng có bot đó cho bot nói; cần khóa nội bộ', async () => {
  const registry = new RoomRegistry({ nodeId: 'rt-say' });
  const room = new Room('thien-1', { botCount: 0 });
  room.participants.set('b-1', { id: 'b-1', displayName: 'Sen Nhỏ', bot: true, connected: true, socket: null });
  registry.rooms.set('thien-1', room);
  const call = (body, key = internalKey(SECRET)) => new Promise((resolve) => {
    const res = { status: 0, body: '', writeHead(status) { this.status = status; return this; }, end(chunk = '') { this.body += chunk; resolve(this); } };
    const req = Object.assign(new EventEmitter(), { method: 'POST', url: '/internal/bot-say', headers: { 'x-internal-key': key } });
    handleRealtimeRequest(req, res, registry, { secret: SECRET });
    req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  assert.equal((await call({ roomId: 'thien-1', botId: 'b-1', text: 'chào' }, 'sai')).status, 403);
  assert.equal((await call({ roomId: 'thien-1', botId: 'b-1', text: 'chào' })).status, 200);
  assert.equal((await call({ roomId: 'cinema-1', botId: 'b-1', text: 'chào' })).status, 404, 'phòng ở máy khác');
  assert.equal((await call({ roomId: 'thien-1', botId: 'b-9', text: 'chào' })).status, 404, 'bot đã rời');
  room.close();
});

test('bạn bè: máy realtime liệt kê thành viên đang kết nối (báo API) và chuyển inbox.notify tới mọi kết nối của tài khoản', async () => {
  const registry = new RoomRegistry({ nodeId: 'rt-friends' });
  const room = new Room('thien-1', { botCount: 0 });
  registry.rooms.set('thien-1', room);
  const inbox = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'p-an', displayName: 'An', accountId: 'a-11111111', role: 'member' });
  room.join({ readyState: WebSocket.OPEN, send() {}, close() {} }, { participantId: 'p-khach', displayName: 'Khách', role: 'guest' });
  room.participants.set('b-1', { id: 'b-1', displayName: 'Sen', bot: true, connected: true, socket: null });
  assert.deepEqual(registry.presenceEntries(), [{ accountId: 'a-11111111', roomId: 'thien-1', participantId: 'p-an' }]);
  assert.equal(registry.notifyAccount('a-11111111', 'note'), 1);
  const notice = inbox.find((message) => message.type === 'inbox.notify');
  assert.deepEqual([notice.kind, parseServerMessage(notice).ok], ['note', true]);

  const forbidden = response();
  handleRealtimeRequest(Object.assign(new EventEmitter(), { method: 'POST', url: '/internal/account-notify', headers: {} }), forbidden, registry, { secret: SECRET });
  assert.equal(forbidden.status, 403);
  const res = response();
  const req = Object.assign(new EventEmitter(), { method: 'POST', url: '/internal/account-notify', headers: { 'x-internal-key': internalKey(SECRET) } });
  handleRealtimeRequest(req, res, registry, { secret: SECRET });
  req.emit('data', JSON.stringify({ accountId: 'a-11111111', kind: 'invite' }));
  req.emit('end');
  assert.deepEqual(JSON.parse(res.body), { ok: true, sent: 1 });
  room.close();
});

test('nhún nhảy: chỉ ngoài sân chùa (trong chánh điện / đang ngồi thì YARD_ONLY); ngoài sân phát emote cho cả phòng', () => {
  const room = new Room('thien-1', { botCount: 0 });
  const sent = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => sent.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', role: 'guest' });
  const hall = room.rules.world.zones.hall;
  const at = (x, z) => {
    room.participants.get('an').movedAt = 0;
    room.move('an', { x, z, ry: 0, moving: false });
  };
  at((hall.x[0] + hall.x[1]) / 2, (hall.z[0] + hall.z[1]) / 2);
  assert.equal(room.emote('an', 'dance').error, 'YARD_ONLY');
  assert.equal(room.emote('an', 'act').error, 'YARD_ONLY', '✨ tương tác cũng chỉ ngoài sân');
  at(0, hall.z[1] + 10);
  assert.equal(room.zoneOf(room.participants.get('an').pos), 'yard');
  assert.deepEqual(room.emote('an', 'dance'), { ok: true });
  const emote = sent.filter((message) => message.type === 'emote').at(-1);
  assert.deepEqual([emote.kind, parseServerMessage(emote).ok], ['dance', true]);
  assert.deepEqual(room.emote('an', 'act'), { ok: true });
  const act = sent.filter((message) => message.type === 'emote').at(-1);
  assert.ok(act.kind === 'act' && Number.isInteger(act.at), 'mọi máy chọn cùng động tác theo `at`');
  room.close();
});

test('chat trong ngày: người vào sau nhận chat.history có tin cả phòng vừa nói', async (t) => {
  const server = createRealtimeServer({ botCounts: { cinema: 0 }, secret: SECRET });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const an = await connectClient(port, 'u-an', 'An');
  sockets.push(an.socket);
  const echoed = waitForMessage(an.socket, (message) => message.type === 'chat.message');
  an.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'chat.send', requestId: 'chat-1', text: 'Chào cả phòng' }));
  await echoed;
  const ticket = createJoinTicket({ participantId: 'u-binh', roomId: 'cinema-1', displayName: 'Bình' }, SECRET);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?${new URLSearchParams({ ticket })}`);
  sockets.push(socket);
  await once(socket, 'open');
  const history = waitForMessage(socket, (message) => message.type === 'chat.history');
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: 'cinema-1', displayName: 'Bình' }));
  const message = await history;
  assert.equal(parseServerMessage(message).ok, true);
  assert.deepEqual(message.messages.map(({ participantId, displayName, text }) => [participantId, displayName, text]), [['u-an', 'An', 'Chào cả phòng']]);
});

test('phòng Lô Tô riêng: không có bot tự vào; bot được mời mua vé; chủ phòng đuổi người; chủ phòng rời thì đóng phòng và hủy ván dở', async () => {
  const settles = [];
  const closed = [];
  const room = new Room('loto-p-abcd1234', {
    privateOwner: 'a-chu-00000001',
    onPrivateClosed: (id) => closed.push(id),
    lotto: { buy: async () => ({ ok: true, tickets: [{ no: 1, rows: [[1, 2, 3, 4, 5, 0, 0, 0, 0], [11, 12, 13, 14, 15, 0, 0, 0, 0], [21, 22, 23, 24, 25, 0, 0, 0, 0]] }], coins: 40 }), settle: async (input) => { settles.push(input); return { ok: true, void: true, winners: [], share: 0, results: [] }; } },
  });
  const inbox = {};
  const sockets = {};
  const join = (id, accountId) => {
    inbox[id] = [];
    sockets[id] = { readyState: WebSocket.OPEN, send: (raw) => inbox[id].push(JSON.parse(raw)), close() { this.readyState = WebSocket.CLOSED; } };
    room.join(sockets[id], { participantId: id, displayName: id, role: 'member', accountId });
  };
  join('chu', 'a-chu-00000001');
  join('ban', 'a-ban-00000001');
  join('khach', 'a-khach-000001');
  assert.equal([...room.participants.values()].filter((person) => person.bot).length, 0, 'không có bot tự vào');
  const bot = room.addInvitedBot('Lô Tô Vui');
  assert.equal(room.addInvitedBot('Lô Tô Vui'), bot, 'mời lại không nhân đôi');
  assert.equal(room.table.placeBotTicket(bot), true, 'bot được mời mua vé như người chơi');
  assert.ok(parseServerMessage(room.snapshot()).ok);

  assert.equal(room.kickAccount('a-khach-000001'), 1);
  assert.equal(inbox.khach.at(-1).code, 'PRIVATE_KICKED');
  assert.equal(room.kickAccount('a-chu-00000001'), 0, 'không ai đuổi được chủ phòng');

  // Bạn mua vé (ván đang ở pha mua) rồi chủ phòng bấm rời: phòng đóng, ván hủy để API hoàn vé.
  await room.table.buy(room.participants.get('ban'), { requestId: 'buy-1', roundId: room.table.round.id, count: 1, autoMark: false });
  const roundId = room.table.round.id;
  room.disconnect('chu', sockets.chu, { left: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(closed, ['loto-p-abcd1234']);
  assert.equal(inbox.ban.at(-1).code, 'PRIVATE_ROOM_CLOSED');
  assert.deepEqual(settles.map((item) => [item.roundId, item.claims]), [[roundId, []]], 'ván dở bị hủy (không ai kinh → API hoàn vé)');
  assert.equal(room.participants.size, 0);
  room.close();
});

test('addbot: số bot dao động ±10 quanh con số đặt, mỗi bước một bot, addbot 0 thì không dao động', () => {
  const room = new Room('game-1', { botCount: 0 });
  try {
    assert.equal(room.setBotCount(20, { managed: true, drift: true }), 20, 'đặt xong có ngay đúng số bot');
    let now = 1_000_000;
    room.driftBotCount(now);
    const seen = new Set();
    let previous = room.botCount;
    for (let index = 0; index < 600; index += 1) {
      now += 60_000;
      room.driftBotCount(now, Math.random);
      assert.ok(Math.abs(room.botCount - previous) <= 1, 'mỗi bước chỉ thêm / bớt một bot');
      assert.ok(room.botCount >= 10 && room.botCount <= 30, `trong khoảng 10–30: ${room.botCount}`);
      previous = room.botCount;
      seen.add(room.botCount);
    }
    assert.ok(seen.size > 5, 'số bot thật sự thay đổi');
    // Gốc nhỏ: không xuống dưới 2 để bàn game vẫn đủ người.
    room.setBotCount(3, { managed: true, drift: true });
    for (let index = 0; index < 300; index += 1) {
      now += 60_000;
      room.driftBotCount(now);
      assert.ok(room.botCount >= 2 && room.botCount <= 13);
    }
    room.setBotCount(0, { managed: true, drift: true });
    for (let index = 0; index < 50; index += 1) room.driftBotCount(now += 60_000);
    assert.equal(room.botCount, 0, 'addbot 0 là tắt hẳn');
  } finally {
    room.close();
  }
});

test('Lô Tô công cộng: số bot mở phòng ngẫu nhiên quanh 30, tăng / giảm dần kiểu đám đông; Lô Tô riêng không tự thêm bot', () => {
  const room = new Room('loto-1');
  const privateRoom = new Room('loto-p-abcd1234', { privateOwner: 'a-chu-00000001' });
  const bots = () => [...room.participants.values()].filter((person) => person.bot);
  try {
    assert.ok(room.botCount >= 18 && room.botCount <= 42, `mở phòng trong 30 ± 12: ${room.botCount}`);
    assert.equal(bots().length, room.botCount, 'vào phòng thấy đủ bot ngay');
    assert.equal(room.botDrift.base, 30, 'vẫn dao động quanh con số gốc 30');
    assert.equal(room.keepBotsAlive, true, 'không có người thật bàn vẫn chạy');
    assert.equal(room.table.running, true);
    // 20h tối giờ Los Angeles (giờ đông người): đích thấp nhất 36 − 12, cao nhất chạm 42.
    let now = Date.UTC(2026, 10, 7, 4, 0);
    room.botTick(now, () => 0);
    const seen = [];
    let previous = room.botCount;
    // Mỗi nhịp 1 phút (đủ cho một bước vào / ra) để cả bài vẫn nằm trong giờ đông người.
    for (let index = 0; index < 110; index += 1) {
      now += 60_000;
      room.botTick(now, index < 45 ? () => 0 : () => 0.999999);
      assert.ok(Math.abs(room.botCount - previous) <= 1, 'mỗi bước chỉ một người vào / ra');
      previous = room.botCount;
      const actual = bots().length;
      // Bot đang có vé ở lại tới hết ván nên có thể trễ mục tiêu vài người.
      assert.ok(Math.abs(actual - room.botCount) <= 3, `bot thật theo sát mục tiêu: ${actual} / ${room.botCount}`);
      assert.ok(room.botCount >= 18 && room.botCount <= 42, `dao động trong 18–42: ${room.botCount}`);
      seen.push(room.botCount);
    }
    assert.ok(Math.min(...seen) <= 26 && Math.max(...seen) >= 38, `đã đi cả xuống và lên: ${Math.min(...seen)}–${Math.max(...seen)}`);
    assert.equal(privateRoom.botCount, 0);
    assert.equal([...privateRoom.participants.values()].some((person) => person.bot), false);
  } finally {
    room.close();
    privateRoom.close();
  }
});

test('Lô Tô: bot mua vé rải rác trong pha mua vé, có bot ngồi xem, có bot mua 2 vé', () => {
  const room = new Room('loto-1');
  const realNow = room.table.now;
  try {
    room.table.nextRound();
    const round = room.table.round;
    const buyMs = room.rules.interaction.buyMs;
    const everyone = () => {
      for (const bot of room.participants.values()) if (bot.bot) room.botAct(bot);
      return room.table.stateMessage();
    };
    room.table.now = () => round.endsAt - buyMs;
    assert.equal(everyone().players, 0, 'vừa mở bán chưa ai kịp mua');
    room.table.now = () => round.endsAt - buyMs / 2;
    const middle = everyone().players;
    room.table.now = () => round.endsAt - 1;
    const end = everyone();
    assert.ok(middle > 0 && middle < end.players, `số người chơi tăng dần: ${middle} → ${end.players}`);
    assert.ok(end.players < room.botCount, `có bot ngồi xem: ${end.players} / ${room.botCount}`);
    assert.ok(end.tickets > end.players, `có bot mua 2 vé: ${end.tickets} vé / ${end.players} người`);
    // Mỗi ván quyết lại: lần gọi sau trong cùng ván không đổi ý.
    assert.equal(everyone().players, end.players);
  } finally {
    room.table.now = realNow;
    room.close();
  }
});

test('Lô Tô ít bot (addbot loto 2): bot nào cũng mua vé để bàn đủ người mở ván', () => {
  const room = new Room('loto-1', { botCount: 2 });
  try {
    assert.equal(room.botCount, 2, 'số đặt riêng giữ đúng, không ngẫu nhiên');
    room.table.nextRound();
    const round = room.table.round;
    room.table.now = () => round.endsAt - 1;
    for (const bot of room.participants.values()) if (bot.bot) room.botAct(bot);
    assert.equal(room.table.stateMessage().players, 2);
  } finally {
    room.close();
  }
});

test('addbot 100 tạo tên riêng cho từng bot và không tự thêm số vào tên', () => {
  const room = new Room('game-1', { botCount: 0 });
  try {
    assert.equal(room.setBotCount(100, { managed: true }), 100);
    const names = [...room.participants.values()].filter((person) => person.bot).map((person) => person.displayName);
    assert.equal(new Set(names).size, 100, '100 bot có 100 tên khác nhau');
    assert.ok(names.every((name) => !/\s\d+$/.test(name)), 'không còn hậu tố số');
  } finally {
    room.close();
  }
});

test('deploy: ván Lô Tô lưu vào snapshot, máy mới dựng lại và gọi số tiếp đúng ván, vé người chơi còn nguyên', async () => {
  const { LottoTable, RESUME_GRACE_MS } = await import('../loto.mjs');
  let clock = 1_000_000;
  const room = { id: 'loto-1', epoch: 3, broadcast() {}, sendTo() {}, participants: new Map([['an', { id: 'an', accountId: 'a-an-00000001', displayName: 'An' }], ['bot-1', { id: 'bot-1', bot: true, displayName: 'Sen Nhỏ' }]]) };
  const rules = { buyMs: 60_000, callMs: 4_000, claimWindowMs: 3_000, resultMs: 5_000, ticketPrice: 10 };
  const ticket = { no: 1, rows: [[1, 2, 3, 4, 5, 0, 0, 0, 0], [11, 12, 13, 14, 15, 0, 0, 0, 0], [21, 22, 23, 24, 25, 0, 0, 0, 0]] };
  const old = new LottoTable({ room, rules, now: () => clock });
  old.running = true;
  old.nextRound();
  old.round.tickets.set('a-an-00000001', [ticket]);
  old.round.autoMark.add('a-an-00000001');
  old.placeBotTicket(room.participants.get('bot-1'));
  old.round.phase = 'calling';
  for (const number of [1, 2, 3, 4, 40]) { old.round.called.push(number); old.round.calledSet.add(number); }
  old.round.nextCallAt = clock + 1_000;
  const revision = old.revision;
  old.broadcastState();
  assert.ok(old.revision > revision, 'đổi trạng thái thì tăng revision để máy lưu snapshot');
  await old.quiesce();
  const record = JSON.parse(JSON.stringify(old.toRecord()));

  // Máy mới: bot cũ không còn, người chơi chưa nối lại.
  clock += 2_000;
  const fresh = { ...room, participants: new Map() };
  const settles = [];
  const table = new LottoTable({ room: fresh, rules, now: () => clock, settle: async (input) => { settles.push(input); return { ok: true, winners: [], share: 0, results: [] }; } });
  assert.equal(table.restoreRecord(record), true);
  table.start();
  try {
    const state = table.stateMessage();
    assert.equal(state.roundId, old.round.id, 'cùng ván');
    assert.equal(state.phase, 'calling');
    assert.deepEqual(state.called, [1, 2, 3, 4, 40]);
    assert.equal(state.tickets, 2, 'vé người + vé bot vẫn trong quỹ');
    assert.ok(state.nextCallAt >= clock + RESUME_GRACE_MS, 'chờ người chơi nối lại rồi mới gọi số tiếp');
    assert.ok(state.waiting.some((item) => item.number === 5), 'vẫn tính người đợi (hàng 1, 2, 3, 4 đã gọi, thiếu 5)');
    assert.deepEqual(table.mineMessage('a-an-00000001').tickets, [ticket], 'người chơi vào lại thấy đúng vé của mình');
    assert.equal(table.mineMessage('a-an-00000001').autoMark, true);
    assert.equal(table.nameOf('bot-1'), 'Sen Nhỏ', 'bot cũ vẫn có tên để hiện người thắng');
    // Kinh vẫn được tính theo vé gốc.
    for (const number of [5]) { table.round.called.push(number); table.round.calledSet.add(number); }
    assert.equal(table.claim({ accountId: 'a-an-00000001' }, { roundId: old.round.id, ticket: 1, row: 0 }).ok, true);
    await table.finish();
    assert.equal(settles[0].roundId, old.round.id, 'chốt đúng mã ván cũ (API chốt idempotent)');
    assert.deepEqual(settles[0].claims, [{ accountId: 'a-an-00000001', ticket: 1, row: 0 }]);
  } finally {
    table.stop();
  }
});

test('deploy: bàn Bầu Cua dựng lại đang cược thì cược tiếp; đang lắc dở thì mở đúng xúc xắc đã lắc', async () => {
  const { BauCuaTable } = await import('../bau-cua.mjs');
  const { RESUME_GRACE_MS } = await import('../loto.mjs');
  let clock = 5_000_000;
  const room = { id: 'game-1', epoch: 2, broadcast() {}, sendTo() {}, participants: new Map() };
  const rules = { game: 'bau-cua', bettingMs: 20_000, rollingMs: 10, resultMs: 6_000, maxStakePerRound: 1_000 };
  const old = new BauCuaTable({ room, rules, now: () => clock });
  old.running = true;
  old.nextRound();
  old.round.totals.cua = 15;
  old.round.bettors.add('a-an-00000001');
  old.round.mine.set('a-an-00000001', { cua: 15 });
  await old.quiesce();
  const betting = JSON.parse(JSON.stringify(old.toRecord()));
  const table = new BauCuaTable({ room, rules, now: () => clock });
  assert.equal(table.restoreRecord(betting), true);
  table.start();
  try {
    const state = table.stateMessage();
    assert.equal(state.roundId, old.round.id);
    assert.equal(state.phase, 'betting');
    assert.equal(state.totals.cua, 15, 'tổng cược còn nguyên');
    assert.ok(state.endsAt >= clock + RESUME_GRACE_MS);
    assert.deepEqual(table.mineMessage('a-an-00000001').mine, { cua: 15 });
  } finally {
    table.stop();
  }

  // Máy chết giữa lúc lắc (đã gửi API chốt với xúc xắc này): máy mới dùng lại đúng xúc xắc.
  const rolling = JSON.parse(JSON.stringify({ ...betting, round: { ...betting.round, phase: 'rolling', rolled: ['ga', 'ga', 'ca'] } }));
  const settles = [];
  const again = new BauCuaTable({ room, rules, now: () => clock, settle: async (input) => { settles.push(input); return { ok: true, results: [] }; } });
  again.restoreRecord(rolling);
  again.start();
  try {
    await again.roll();
    assert.deepEqual(settles.map((item) => item.dice), [['ga', 'ga', 'ca']]);
    assert.deepEqual(again.stateMessage().dice, ['ga', 'ga', 'ca']);
  } finally {
    again.stop();
  }
});

test('deploy: phòng game lưu ván vào snapshot; danh bạ một máy xuất/nạp lại được qua file; kế hoạch addbot giữ lại', async () => {
  const directory = createMemoryDirectory();
  const registry = new RoomRegistry({ nodeId: 'rt-a', directory, botCounts: { thien: 0, cinema: 0, game: 0, taixiu: 0, loto: 0 } });
  await registry.setBotAllocations({ 'loto-1': 4 });
  const room = registry.rooms.get('loto-1');
  const roundId = room.table.round.id;
  const plan = registry.botPlan();
  assert.deepEqual(plan, { allocations: { 'loto-1': 4 }, replacesDefaults: true });
  await registry.shutdown();
  const state = JSON.parse(JSON.stringify(directory.exportState()));
  assert.equal(JSON.parse(state.snapshots['loto-1'].value).table.round.id, roundId, 'ván nằm trong snapshot');

  const nextDirectory = createMemoryDirectory();
  nextDirectory.importState(state);
  const next = new RoomRegistry({ nodeId: 'rt-a', directory: nextDirectory, botCounts: { thien: 0, cinema: 0, game: 0, taixiu: 0, loto: 0 } });
  const result = await next.restoreBotPlan(plan);
  try {
    assert.equal(result.assigned, 4, 'addbot áp dụng lại sau khi khởi động');
    const reopened = next.rooms.get('loto-1');
    assert.equal(reopened.table.round.id, roundId, 'chơi tiếp đúng ván cũ');
    assert.ok(reopened.epoch > room.epoch, 'epoch tăng tiếp');
  } finally {
    await next.shutdown();
  }
});

test('bot làm vườn: tìm đường tới cổng vườn, đi lối trong vườn, không giẫm luống, làm liền các việc API giao rồi quay ra lối giữa', async () => {
  const calls = [];
  // Việc thứ nhất gieo luống 27, việc thứ hai tưới luống 42 (hàng khác: đi qua lối dọc), rồi hết việc.
  const tasks = [{ action: 'plant', plotId: 27, plantType: 'peach' }, { action: 'water', plotId: 42 }, null];
  const gardenBots = {
    task: async (name) => {
      calls.push({ op: 'task', name });
      return tasks.shift();
    },
    act: async (input) => {
      calls.push({ op: 'act', ...input });
      return { ok: true };
    },
  };
  const room = new Room('thien-1', { botCount: 4, gardenBots });
  room.join({ readyState: WebSocket.OPEN, send() {}, close() {} }, { participantId: 'u-1', displayName: 'An' });
  room.gardenWorkDelay = 0;
  const bot = [...room.participants.values()].find((person) => person.bot && person.pos);
  // Bot đang ở bờ hồ (xa vườn): tìm đường tới cổng vườn trước.
  bot.pos = { x: -10, z: 62, ry: 0 };
  bot.walk.waitUntil = 0;
  const original = Math.random;
  Math.random = () => 0;
  let now = Date.now();
  const started = now;
  try {
    room.maybeStartGardenErrand(bot, now);
  } finally {
    Math.random = original;
  }
  assert.equal(bot.errand?.phase, 'asking');
  assert.equal(await bot.errand.done, true);
  const plot = THIEN_GARDEN.plots.find((item) => item.id === 27);
  const half = THIEN_GARDEN.bed / 2;
  const onBed = () => THIEN_GARDEN.plots.some((item) => Math.abs(bot.pos.x - item.x) < half && Math.abs(bot.pos.z - item.z) < half);
  for (let step = 0; step < 200 && bot.errand?.phase === 'going'; step += 1) {
    now += 1_000;
    bot.walk.waitUntil = 0;
    // Thời gian giả: bỏ kiểm tra tốc độ / tần suất theo đồng hồ thật của server.
    bot.movedAt = 0;
    room.rates.clear();
    room.advanceBotWalk(bot, now);
    assert.equal(onBed(), false, `bot giẫm lên luống ở ${bot.pos.x}, ${bot.pos.z}`);
  }
  assert.equal(bot.errand.phase, 'working');
  assert.ok(Math.hypot(bot.pos.x - plot.x, bot.pos.z - plot.aisle) < 0.1, 'đứng ở lối đi cạnh luống');
  await bot.errand.done;
  assert.equal(bot.errand.phase, 'going', 'còn việc thì làm tiếp, chưa ra khỏi vườn');
  const second = THIEN_GARDEN.plots.find((item) => item.id === 42);
  for (let step = 0; step < 200 && bot.errand?.phase === 'going'; step += 1) {
    now += 1_000;
    bot.walk.waitUntil = 0;
    bot.movedAt = 0;
    room.rates.clear();
    room.advanceBotWalk(bot, now);
    assert.equal(onBed(), false, `bot giẫm lên luống ở ${bot.pos.x}, ${bot.pos.z}`);
  }
  assert.equal(bot.errand.phase, 'working');
  assert.ok(Math.hypot(bot.pos.x - second.x, bot.pos.z - second.aisle) < 0.1);
  await bot.errand.done;
  assert.deepEqual(calls, [
    { op: 'task', name: bot.displayName },
    { op: 'act', name: bot.displayName, action: 'plant', plotId: 27, plantType: 'peach' },
    { op: 'task', name: bot.displayName },
    { op: 'act', name: bot.displayName, action: 'water', plotId: 42 },
    { op: 'task', name: bot.displayName },
  ]);
  assert.equal(bot.errand.phase, 'returning');
  for (let step = 0; step < 200 && bot.errand; step += 1) {
    now += 1_000;
    bot.walk.waitUntil = 0;
    bot.movedAt = 0;
    room.rates.clear();
    room.advanceBotWalk(bot, now);
    assert.equal(onBed(), false);
  }
  assert.equal(bot.errand, null);
  assert.deepEqual({ x: bot.pos.x, z: bot.pos.z }, THIEN_GARDEN.approach[0], 'về lại lối giữa rồi đi dạo tiếp');
  // Mỗi phòng nghỉ một lúc (cooldownMs) mới cho bot khác vào vườn.
  Math.random = () => 0;
  try {
    assert.equal(room.maybeStartGardenErrand(bot, started + 30_000), null);
  } finally {
    Math.random = original;
  }
  room.close();
});

test('bot đi dạo không đứng chồng lên nhau (dừng lệch, tránh chỗ đã có người, vòng qua người phía trước)', () => {
  const room = new Room('thien-1', { botCount: 30 });
  room.join({ readyState: WebSocket.OPEN, send() {}, close() {} }, { participantId: 'u-1', displayName: 'An' });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  let overlapping = 0;
  const ticks = 900;
  try {
    for (let tick = 0; tick < ticks; tick += 1) {
      now += 1_000;
      // Thời gian giả: bỏ kiểm tra tốc độ / tần suất theo đồng hồ thật của server.
      for (const participant of room.participants.values()) if (participant.bot) participant.movedAt = 0;
      room.rates.clear();
      room.botTick();
      // Bot ngồi ghế đá được vẽ ở chỗ ngồi của ghế, không tính.
      const walkers = [...room.participants.values()].filter((participant) => participant.bot && participant.pos && !participant.benchId);
      const close = walkers.some((one, index) => walkers.slice(index + 1)
        .some((other) => Math.hypot(one.pos.x - other.pos.x, one.pos.z - other.pos.z) < 0.4));
      if (close) overlapping += 1;
    }
  } finally {
    Date.now = realNow;
    room.close();
  }
  // Trước khi sửa: ~80% số nhịp có hai bot đứng chồng lên nhau.
  assert.ok(overlapping / ticks < 0.02, `${overlapping}/${ticks} nhịp có bot chồng lên nhau`);
});

test('bot đi khắp sân theo bản đồ scene: không đi xuyên vật cản, ra xa lối giữa, có ngồi ghế đá', async () => {
  const { readFileSync } = await import('node:fs');
  const { isWalkable } = await import('@chanh-dien/scene-engine/walk');
  const scene = JSON.parse(readFileSync(new URL('../../../scenes/thien-default/scene.json', import.meta.url), 'utf8'));
  const room = new Room('thien-1', { botCount: 40 });
  assert.ok(room.nav, 'đọc được bản đồ scene');
  room.join({ readyState: WebSocket.OPEN, send() {}, close() {} }, { participantId: 'u-1', displayName: 'An' });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const bad = [];
  let farFromPath = 0;
  let benchSits = 0;
  try {
    for (let tick = 0; tick < 900; tick += 1) {
      now += 1_000;
      for (const participant of room.participants.values()) if (participant.bot) participant.movedAt = 0;
      room.rates.clear();
      room.botTick();
      for (const bot of room.participants.values()) {
        if (!bot.bot || !bot.pos || bot.benchId) continue;
        if (!isWalkable(scene.world.walk, bot.pos.x, bot.pos.z)) bad.push(`${bot.displayName} ${bot.pos.x.toFixed(2)},${bot.pos.z.toFixed(2)}`);
        if (Math.abs(bot.pos.x) > 8) farFromPath += 1;
      }
      benchSits = Math.max(benchSits, [...room.participants.values()].filter((bot) => bot.bot && bot.benchId).length);
    }
  } finally {
    Date.now = realNow;
    room.close();
  }
  assert.deepEqual(bad.slice(0, 5), [], 'vị trí bot luôn đứng được (không trong tượng, hồ, hàng rào)');
  assert.ok(farFromPath > 1_000, 'bot ra khắp sân, không chỉ đi trên lối giữa');
  assert.ok(benchSits > 0, 'có lúc bot ngồi ghế đá');
});
