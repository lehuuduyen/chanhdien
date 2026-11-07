import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createMemoryDirectory } from '@chanh-dien/room-directory';
import { WebSocket } from 'ws';
import { Room, RoomRegistry } from '../server.mjs';

const botsOf = (room) => [...room.participants.values()].filter((person) => person.bot);

test('addbot chanhdien N: chánh điện theo tiểu bang (đang mở và mở sau) cũng nhận N bot, một nửa ra sân ngay', async () => {
  const registry = new RoomRegistry({ nodeId: 'rt-a', directory: createMemoryDirectory(), botCounts: { thien: 0 } });
  const before = await registry.open('thien-ca-vi-1');
  assert.equal(botsOf(before.room).length, 0);
  await registry.setBotAllocations({ 'thien-1': 20 }, { replace: false });
  assert.equal(botsOf(before.room).length, 20);
  assert.ok(botsOf(before.room).filter((bot) => bot.pos).length >= 5, 'có bot đi dạo ngoài sân ngay khi addbot');
  assert.equal(before.room.botWalkingTarget, 10, 'đông bot thì một nửa ra sân');
  assert.equal(before.room.keepBotsAlive, false, 'phòng tiểu bang không giữ lease chỉ vì bot');

  const later = await registry.open('thien-az-vi-2');
  assert.equal(botsOf(later.room).length, 20);
  for (const room of registry.rooms.values()) room.close();
});

function yardRoom() {
  const room = new Room('thien-ca-vi-1', { botCount: 0 });
  const inbox = {};
  const join = (id, name, pos) => {
    inbox[id] = [];
    room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox[id].push(JSON.parse(raw)), close() {} }, { participantId: id, displayName: name, role: 'guest' });
    room.participants.get(id).movedAt = 0;
    if (pos) room.move(id, { ...pos, ry: 0, moving: false });
  };
  const addBot = (id, name, pos) => room.participants.set(id, {
    id, displayName: name, bot: true, connected: true, socket: null, pos: { ...pos, ry: 0 }, walk: { waitUntil: 0 },
  });
  const said = (id) => inbox[id].filter((message) => message.type === 'chat.message').map((message) => [message.displayName, message.text]);
  return { room, join, addBot, said };
}

test('hai bot đứng gần nhau đối đáp theo kịch bản, gọi tên nhau, đứng lại trong lúc nói; bot ở xa không tham gia', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, join, addBot, said } = yardRoom();
  join('an', 'An', { x: 0, z: 40 });
  addBot('b-1', 'Minh Tâm', { x: 0, z: 41 });
  addBot('b-2', 'Diệu Hạnh', { x: 2, z: 43 });
  addBot('b-3', 'Trí Hải', { x: 0, z: 80 });
  const plan = room.botDialogue(room.participants.get('b-1'), [['{name} ơi, đi dạo không?', 'Đi chứ {name}', 'Vậy đi thôi']]);
  assert.equal(plan.partnerId, 'b-2');
  assert.ok(room.participants.get('b-2').talkUntil > Date.now(), 'bot kia cũng đứng lại');
  // Mỗi câu chỉ được hẹn giờ sau khi câu trước đã nói xong.
  for (let step = 0; step < 4; step += 1) {
    await flush();
    t.mock.timers.tick(10_000);
  }
  assert.equal(await plan.done, true);
  assert.deepEqual(said('an'), [['Minh Tâm', 'Diệu Hạnh ơi, đi dạo không?'], ['Diệu Hạnh', 'Đi chứ Minh Tâm'], ['Minh Tâm', 'Vậy đi thôi']]);
  assert.equal(room.botDialogue(room.participants.get('b-3'), [['a', 'b']]), null, 'không có bot nào gần');
  room.close();
});

test('người thật chào cả sân thì bot gần nhất chào lại theo ngôn ngữ người chào, không chào lại liên tục', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { room, join, addBot, said } = yardRoom();
  join('an', 'An', { x: 0, z: 40 });
  join('mia', 'Mia', { x: 1, z: 40 });
  addBot('b-1', 'Minh Tâm', { x: 2, z: 41 });
  assert.equal(room.botGreetBack(room.participants.get('an'), 'mình hiểu rồi'), null, 'không phải câu chào');
  const plan = room.botGreetBack(room.participants.get('an'), 'Chào mọi người');
  assert.match(plan.line, /An/);
  t.mock.timers.tick(5_000);
  await plan.done;
  assert.deepEqual(said('an').at(-1), ['Minh Tâm', plan.line]);
  assert.equal(room.botGreetBack(room.participants.get('mia'), 'hello everyone'), null, 'cả phòng 20 giây một lần');
  room.close();
});

test('chat trong ngày: người vào sau nhận chat.history; tin hôm trước và tin quá 100 bị bỏ', async () => {
  const { parseServerMessage } = await import('@chanh-dien/protocol');
  const { dayStartOf } = await import('@chanh-dien/room-rules');
  const room = new Room('thien-ca-vi-1', { botCount: 0 });
  const today = dayStartOf(Date.now());
  room.broadcast({ type: 'chat.message', participantId: 'p-old', displayName: 'Cũ', text: 'hôm qua', sentAt: today - 60_000 });
  for (let index = 0; index < 105; index += 1) {
    room.broadcast({ type: 'chat.message', participantId: 'p-an', displayName: 'An', text: `tin ${index}`, sentAt: Math.max(today, Date.now() - 1_000) });
  }
  const history = room.chatHistoryMessage();
  assert.equal(history.messages.length, 100);
  assert.deepEqual([history.messages[0].text, history.messages.at(-1).text], ['tin 5', 'tin 104']);
  assert.ok(history.messages.every((item) => item.participantId === 'p-an'), 'tin hôm qua đã bị xóa');
  assert.equal(parseServerMessage(history).ok, true);
  room.close();
});

test('khu tưởng niệm: đủ 36 ô khớp room rules / garden / protocol; từ lối giữa đi tới trước mọi bia; phát memorial.grave cho phòng chánh điện', async () => {
  const { readFileSync } = await import('node:fs');
  const { THIEN_MEMORIAL } = await import('@chanh-dien/room-rules');
  const { GRAVE_COUNT, GRAVE_NAME_MAX } = await import('@chanh-dien/garden');
  const { MEMORIAL_GRAVE_MAX, MEMORIAL_NAME_MAX } = await import('@chanh-dien/protocol');
  const { createBotNav } = await import('../bot-nav.mjs');
  const scene = JSON.parse(readFileSync(new URL('../../../scenes/thien-default/scene.json', import.meta.url), 'utf8'));
  const memorial = scene.world.courtyard.memorial;
  assert.deepEqual([THIEN_MEMORIAL.graves.length, GRAVE_COUNT, MEMORIAL_GRAVE_MAX], [36, 36, 36]);
  assert.equal(GRAVE_NAME_MAX, MEMORIAL_NAME_MAX);
  assert.deepEqual(memorial.graves, THIEN_MEMORIAL.graves.map(({ id, x, z }) => ({ id, x, z })));
  const bounds = scene.world.walk.bounds;
  for (const grave of memorial.graves) assert.ok(grave.x - 1.5 > bounds.x[0] && grave.z > bounds.z[0] && grave.z < bounds.z[1], `ô ${grave.id} nằm trong sân`);
  // Người đọc bia đứng giữa lối đi phía đông nấm mộ (lối rộng ~2 m: bot cũng đi được, người chơi càng rộng).
  const nav = createBotNav(scene.world);
  for (const grave of memorial.graves) {
    const front = { x: grave.x + 2, z: grave.z };
    assert.ok(nav.walkable(front), `đứng được trước mộ ô ${grave.id}`);
    assert.ok(nav.route({ x: 0, z: THIEN_MEMORIAL.gate.z }, front)?.length, `đi tới được mộ ô ${grave.id}`);
  }

  const registry = new RoomRegistry({ nodeId: 'rt-m', directory: createMemoryDirectory(), botCounts: { thien: 0 } });
  const { room } = await registry.open('thien-ca-vi-1');
  const inbox = [];
  room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox.push(JSON.parse(raw)), close() {} }, { participantId: 'an', displayName: 'An', role: 'guest' });
  const grave = { name: 'Ông Ba', builderName: 'An', builtAt: 1, expiresAt: 2 };
  assert.equal(registry.broadcastMemorial({ graves: [{ slot: 4, grave }] }), 1);
  assert.deepEqual(inbox.filter((message) => message.type === 'memorial.grave').map((message) => message.graves), [[{ slot: 4, grave }]]);
  assert.equal(registry.broadcastMemorial({ graves: [{ slot: 99, grave: null }] }), null);
  for (const item of registry.rooms.values()) item.close();
});

test('khu vui chơi: bot đi tới được xích đu / cầu tuột, mỗi món hai chỗ như ghế đá, chơi xong thì đi tiếp', async () => {
  const { readFileSync } = await import('node:fs');
  const { createBotNav } = await import('../bot-nav.mjs');
  const scene = JSON.parse(readFileSync(new URL('../../../scenes/thien-default/scene.json', import.meta.url), 'utf8'));
  const nav = createBotNav(scene.world);
  const play = nav.spots.filter((spot) => spot.play);
  assert.deepEqual(play.map((spot) => [spot.bench, spot.play]), [['B-7', 'swing'], ['B-8', 'swing'], ['B-9', 'slide']]);
  for (const spot of play) assert.ok(nav.route({ x: 0, z: 33 }, spot)?.length, `đi tới được ${spot.bench}`);

  const { room, addBot } = yardRoom();
  const slide = play.find((spot) => spot.play === 'slide');
  for (const id of ['bot-a', 'bot-b', 'bot-c']) {
    addBot(id, id, { x: slide.x, z: slide.z });
    room.participants.get(id).walk.dest = slide;
    room.botArrive(room.participants.get(id), Date.now());
  }
  assert.deepEqual(['bot-a', 'bot-b', 'bot-c'].map((id) => room.participants.get(id).benchId || null), [slide.bench, slide.bench, null], 'món đã đủ hai người thì bot thứ ba không chen vào');
  const waited = room.participants.get('bot-a').walk.waitUntil - Date.now();
  assert.ok(waited >= 19_000 && waited <= 61_000, 'bot chơi 20–60 giây');
  room.close();
});
