import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { WebSocket } from 'ws';
import { HideSeekGame } from '../hide-seek.mjs';
import { Room } from '../server.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Nhịp ngắn cho test; còn lại như luật thật.
const RULES = { ...THIEN_RULES.hideSeek, lobbyMs: 30, hideMs: 60, seekMs: 400, resultMs: 40 };

function setup(names, rules = RULES) {
  const room = new Room('thien-1', { botCount: 0 });
  room.hideSeek = new HideSeekGame({ room, rules, random: (() => { let n = 0; return () => (n += 0.1) % 1; })() });
  const inbox = {};
  for (const id of names) {
    inbox[id] = [];
    const socket = { readyState: WebSocket.OPEN, send: (raw) => inbox[id].push(JSON.parse(raw)), close() {} };
    room.join(socket, { participantId: id, displayName: id.toUpperCase(), role: 'guest' });
    room.move(id, { x: 10 + names.indexOf(id), z: 50, ry: 0, moving: false });
  }
  // Vị trí phát gom 200 ms: test đọc thẳng danh sách thấy và room.state gửi xuống.
  const seen = (viewer) => {
    const states = inbox[viewer].filter((message) => message.type === 'room.state');
    return new Set(states.at(-1)?.participants.map((item) => item.id) || []);
  };
  const state = () => room.hideSeek.stateMessage();
  const role = (id) => room.hideSeek.players.get(id)?.role;
  const unlock = (id) => { room.participants.get(id).teleportedAt = 0; room.participants.get(id).movedAt = 0; room.rates.clear(); };
  return { room, inbox, seen, state, role, unlock, close: () => { room.hideSeek.stop(); room.close(); } };
}

async function until(check, ms = 2_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('quá giờ chờ');
    await wait(5);
  }
}

test('trốn tìm: chờ đủ người mới đếm ngược, rời bớt thì thôi đếm; trạng thái hợp lệ theo protocol', async () => {
  const { room, inbox, state, close } = setup(['an', 'binh', 'chi']);
  try {
    assert.equal(state().phase, 'idle');
    room.hideSeek.join('an');
    assert.deepEqual([state().phase, state().endsAt], ['lobby', undefined], 'một người: chờ thêm người');
    // Phòng chờ chung: người vừa tham gia ra vòng tập trung quanh điểm xuất phát (3–4,5 m).
    const gathered = Math.hypot(room.participants.get('an').pos.x - RULES.base.x, room.participants.get('an').pos.z - RULES.base.z);
    assert.ok(gathered >= 3 && gathered <= 4.5, `ra điểm tập trung (${gathered.toFixed(2)} m)`);
    assert.ok(Math.hypot(room.participants.get('chi').pos.x - RULES.base.x, room.participants.get('chi').pos.z - RULES.base.z) > 10, 'người không chơi ở nguyên chỗ');
    room.hideSeek.join('binh');
    assert.ok(state().endsAt, 'đủ hai người: đếm ngược');
    room.hideSeek.leave('binh');
    assert.equal(state().endsAt, undefined, 'rời bớt: thôi đếm');
    room.hideSeek.leave('an');
    assert.equal(state().phase, 'idle');
    const sent = inbox.chi.filter((message) => message.type === 'hideseek.state');
    assert.ok(sent.length >= 3, 'cả phòng nhận trạng thái');
    for (const message of sent) assert.equal(parseServerMessage(message).ok, true, JSON.stringify(message));
  } finally {
    close();
  }
});

test('trốn tìm: người đi kiếm không thấy người trốn lúc đi trốn, người ngoài không thấy người trốn, khóa đi lại theo pha', async () => {
  const { room, seen, state, role, unlock, close } = setup(['an', 'binh', 'chi', 'ngoai']);
  try {
    for (const id of ['an', 'binh', 'chi']) room.hideSeek.join(id);
    await until(() => state().phase === 'hiding');
    const seeker = ['an', 'binh', 'chi'].find((id) => role(id) === 'seeker');
    const hiders = ['an', 'binh', 'chi'].filter((id) => role(id) === 'hider');
    assert.equal(hiders.length, 2, '3 người: 1 đi kiếm, 2 đi trốn');
    // Mọi người về điểm xuất phát.
    for (const id of [seeker, ...hiders]) {
      const pos = room.participants.get(id).pos;
      assert.ok(Math.hypot(pos.x - RULES.base.x, pos.z - RULES.base.z) < 3, `${id} về điểm xuất phát`);
    }
    // Ai thấy ai (room.state gửi xuống từng máy).
    for (const hider of hiders) assert.equal(seen(seeker).has(hider), false, 'người đi kiếm không nhận người trốn khi đang đi trốn');
    for (const hider of hiders) assert.equal(seen('ngoai').has(hider), false, 'người ngoài không thấy người trốn');
    assert.equal(seen('ngoai').has(seeker), true, 'người ngoài thấy người đi kiếm');
    assert.equal(seen(hiders[0]).has('ngoai'), false, 'người chơi không thấy người ngoài');
    assert.equal(seen(hiders[0]).has(seeker), true);
    // Đi lại: người đi kiếm đứng yên, người trốn đi được; không đi nhanh / ngồi ghế được.
    for (const id of [seeker, ...hiders]) unlock(id);
    assert.equal(room.move(seeker, { x: 3, z: 33, ry: 0, moving: true }).error, 'MOVE_LOCKED');
    assert.equal(room.move(hiders[0], { x: 2, z: 35, ry: 0, moving: true }).ok, true);
    assert.equal(room.travel(hiders[0], 'garden').error, 'IN_GAME');
    assert.equal(room.travel('ngoai', 'garden').ok, true, 'người ngoài vẫn đi nhanh được');
    // Sang pha đi kiếm: người đi kiếm thấy người trốn, người trốn đứng yên.
    await until(() => state().phase === 'seeking');
    for (const hider of hiders) assert.equal(seen(seeker).has(hider), true, 'pha đi kiếm: thấy người trốn');
    for (const id of [seeker, ...hiders]) unlock(id);
    assert.equal(room.move(hiders[1], { x: 0, z: 36, ry: 0, moving: true }).error, 'MOVE_LOCKED');
    assert.equal(room.move(seeker, { x: 0.5, z: 33.5, ry: 0, moving: true }).ok, true);
  } finally {
    close();
  }
});

test('trốn tìm: bắt phải ở gần; bắt hết thì người đi kiếm thắng, người bị bắt biến khỏi tầm nhìn người đi kiếm', async () => {
  const { room, seen, state, role, unlock, close } = setup(['an', 'binh', 'chi']);
  try {
    for (const id of ['an', 'binh', 'chi']) room.hideSeek.join(id);
    await until(() => state().phase === 'hiding');
    const seeker = ['an', 'binh', 'chi'].find((id) => role(id) === 'seeker');
    const hiders = ['an', 'binh', 'chi'].filter((id) => role(id) === 'hider');
    unlock(hiders[0]);
    // Người trốn thứ nhất chạy ra xa (vài bước, tốc độ hợp lệ).
    let x = room.participants.get(hiders[0]).pos.x;
    for (let step = 0; step < 4; step += 1) {
      x += 3;
      room.participants.get(hiders[0]).movedAt = Date.now() - 1_000;
      room.rates.clear();
      room.move(hiders[0], { x, z: 33, ry: 0, moving: true });
    }
    assert.equal(room.hideSeek.catch(seeker, hiders[0]).error, 'NOT_SEEKING', 'chưa tới lúc đi kiếm');
    await until(() => state().phase === 'seeking');
    assert.equal(room.hideSeek.catch(hiders[1], hiders[0]).error, 'NOT_SEEKER');
    assert.equal(room.hideSeek.catch(seeker, hiders[0]).error, 'TOO_FAR');
    const near = room.participants.get(hiders[1]).pos;
    room.participants.get(seeker).pos = { x: near.x + 2.5, z: near.z, ry: 0 };
    assert.equal(room.hideSeek.catch(seeker, hiders[1]).ok, true, 'trong 3 m: bắt được');
    assert.equal(seen(seeker).has(hiders[1]), false, 'người bị bắt biến khỏi tầm nhìn người đi kiếm');
    assert.deepEqual(state().lastCatch && [state().lastCatch.seekerId, state().lastCatch.hiderId], [seeker, hiders[1]]);
    // Người đi kiếm lại gần người còn lại rồi bắt.
    const target = room.participants.get(hiders[0]).pos;
    room.participants.get(seeker).pos = { x: target.x - 1, z: target.z, ry: 0 };
    assert.equal(room.hideSeek.catch(seeker, hiders[0]).ok, true);
    assert.deepEqual([state().phase, state().winner], ['result', 'seekers']);
    for (const hider of hiders) assert.equal(seen(seeker).has(hider), true, 'hết ván: mọi người thấy nhau lại');
    // Hết màn kết quả: người vừa chơi tự vào hàng chờ ván sau.
    await until(() => state().phase === 'lobby' || state().phase === 'hiding');
    unlock(seeker);
  } finally {
    close();
  }
});

test('trốn tìm: hết giờ còn người trốn thì người trốn thắng; người đi kiếm bỏ cuộc thì người trốn thắng ngay', async () => {
  const one = setup(['an', 'binh']);
  try {
    one.room.hideSeek.join('an');
    one.room.hideSeek.join('binh');
    await until(() => one.state().phase === 'result', 3_000);
    assert.equal(one.state().winner, 'hiders');
  } finally {
    one.close();
  }
  const two = setup(['an', 'binh', 'chi']);
  try {
    for (const id of ['an', 'binh', 'chi']) two.room.hideSeek.join(id);
    await until(() => two.state().phase === 'hiding');
    const seeker = ['an', 'binh', 'chi'].find((id) => two.role(id) === 'seeker');
    two.room.hideSeek.leave(seeker);
    assert.deepEqual([two.state().phase, two.state().winner], ['result', 'hiders']);
  } finally {
    two.close();
  }
});

test('trốn tìm: người đã tắt app (đang chờ nối lại) không được chọn vào ván, không tự xếp vào ván sau', async () => {
  const { room, state, close } = setup(['an', 'binh', 'chi']);
  try {
    for (const id of ['an', 'binh', 'chi']) room.hideSeek.join(id);
    room.participants.get('chi').connected = false;
    await until(() => state().phase === 'hiding');
    assert.deepEqual(state().players.map((player) => player.id).sort(), ['an', 'binh'], 'chi mất kết nối: không vào ván');
    await until(() => state().phase === 'result', 3_000);
    room.participants.get('binh').connected = false;
    await until(() => state().phase !== 'result');
    assert.deepEqual(state().lobby.map((person) => person.id), ['an'], 'chỉ người còn kết nối tự xếp vào ván sau');
  } finally {
    close();
  }
});

test('trốn tìm với bot: một người cũng chơi được (làm người đi kiếm), bot chỉ đi trốn, chạy tới chỗ trốn rồi đứng yên', async () => {
  const { isWalkable } = await import('@chanh-dien/scene-engine/walk');
  const { readFileSync } = await import('node:fs');
  const scene = JSON.parse(readFileSync(new URL('../../../scenes/thien-default/scene.json', import.meta.url), 'utf8'));
  const room = new Room('thien-1', { botCount: 6 });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  room.hideSeek = new HideSeekGame({ room, rules: { ...RULES, hideMs: 60_000, seekMs: 60_000 }, now: () => now });
  const socket = { readyState: WebSocket.OPEN, send() {}, close() {} };
  room.join(socket, { participantId: 'an', displayName: 'An', role: 'guest' });
  room.move('an', { x: 0, z: 30, ry: 0, moving: false });
  try {
    // Bot ra sân đi dạo trước đã.
    for (let tick = 0; tick < 40; tick += 1) {
      for (const bot of room.participants.values()) if (bot.bot) bot.movedAt = 0;
      room.rates.clear();
      now += 250;
      room.botWalkTick(now);
    }
    assert.ok(room.availableGameBots().length >= 1, 'có bot rảnh ngoài sân');
    room.hideSeek.join('an');
    await until(() => room.hideSeek.phase === 'hiding');
    const players = [...room.hideSeek.players];
    assert.equal(room.hideSeek.players.get('an').role, 'seeker', 'người duy nhất làm người đi kiếm');
    const bots = players.filter(([, player]) => player.bot);
    assert.ok(bots.length >= 1 && bots.length <= RULES.botFill - 1);
    assert.ok(bots.every(([, player]) => player.role === 'hider'), 'bot chỉ đi trốn');
    // Pha đi trốn: bot chạy tới chỗ trốn (xa điểm xuất phát), không đi xuyên vật cản.
    const start = new Map(bots.map(([id]) => [id, { ...room.participants.get(id).pos }]));
    for (let tick = 0; tick < 200; tick += 1) {
      for (const [id] of bots) room.participants.get(id).movedAt = 0;
      room.rates.clear();
      now += 250;
      room.botWalkTick(now);
      for (const [id] of bots) {
        const pos = room.participants.get(id).pos;
        assert.ok(isWalkable(scene.world.walk, pos.x, pos.z), `bot ${id} đứng chỗ đi được (${pos.x}, ${pos.z})`);
      }
    }
    for (const [id] of bots) {
      const pos = room.participants.get(id).pos;
      const spot = room.hideSeek.botSpots.get(id);
      assert.ok(spot, 'bot có chỗ trốn');
      assert.ok(Math.hypot(pos.x - spot.x, pos.z - spot.z) < 1.5, `bot tới chỗ trốn (${pos.x}, ${pos.z}) ~ (${spot.x}, ${spot.z})`);
      assert.ok(Math.hypot(pos.x - start.get(id).x, pos.z - start.get(id).z) > 8, 'đi xa điểm xuất phát');
    }
    // Pha đi kiếm: bot đứng yên.
    room.hideSeek.startSeeking();
    const frozen = new Map(bots.map(([id]) => [id, { ...room.participants.get(id).pos }]));
    for (let tick = 0; tick < 20; tick += 1) {
      now += 250;
      room.botWalkTick(now);
    }
    for (const [id] of bots) assert.deepEqual(room.participants.get(id).pos, frozen.get(id), 'bot đứng yên lúc đi kiếm');
    // Một mình chơi với bot: thắng cũng không có thưởng xu.
    let rewarded = null;
    room.rewardHideSeek = (ids) => { rewarded = ids; };
    room.hideSeek.finish('seekers');
    assert.equal(rewarded, null, 'chơi một mình với bot không được xu');
  } finally {
    Date.now = realNow;
    room.hideSeek.stop();
    room.close();
  }
});

test('trốn tìm: thưởng đúng người thắng (≥ 2 người thật), hàng chờ giữ qua snapshot', async () => {
  const { room, state, role, close } = setup(['an', 'binh', 'chi']);
  try {
    const rewards = [];
    room.rewardHideSeek = (ids, key) => rewards.push([ids.sort(), key]);
    for (const id of ['an', 'binh', 'chi']) room.hideSeek.join(id);
    await until(() => state().phase === 'hiding');
    const seeker = ['an', 'binh', 'chi'].find((id) => role(id) === 'seeker');
    const hiders = ['an', 'binh', 'chi'].filter((id) => role(id) === 'hider');
    room.hideSeek.startSeeking();
    room.participants.get(seeker).pos = { ...room.participants.get(hiders[0]).pos };
    room.hideSeek.catch(seeker, hiders[0]);
    room.hideSeek.finish('hiders');
    assert.deepEqual(rewards.map(([ids]) => ids), [[hiders[1]]], 'người trốn thắng: chỉ người chưa bị bắt được thưởng');
    assert.match(rewards[0][1], /^hs-thien-1-/);
    // Snapshot: người vừa chơi + hàng chờ được xếp lại vào ván sau trên máy mới.
    const record = room.toRecord();
    assert.deepEqual(record.hideSeek.lobby.sort(), ['an', 'binh', 'chi']);
    const next = new Room('thien-1', { botCount: 0 });
    next.hideSeek = new HideSeekGame({ room: next, rules: RULES });
    next.restore(record);
    assert.deepEqual([next.hideSeek.phase, [...next.hideSeek.lobby].sort()], ['lobby', ['an', 'binh', 'chi']]);
    next.hideSeek.stop();
    next.close();
  } finally {
    close();
  }
});
