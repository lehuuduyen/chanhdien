import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { createCar, createDriver, driveBot, placeCar, roundCar, STEP, stepCar } from '@chanh-dien/race';
import { RACE_RULES } from '@chanh-dien/room-rules';
import { loadTrack, RaceGame } from '../race.mjs';

const RULES = { ...RACE_RULES.interaction, lobbyMs: 1_000, fullLobbyMs: 500, gridMs: 500, resultMs: 1_000 };

function setup({ rules = RULES, bots = 10, seed = 11 } = {}) {
  let clock = 1_700_000_000_000;
  let state = seed;
  const random = () => ((state = (state * 16807) % 2147483647) / 2147483647);
  const sent = new Map();
  const broadcasts = [];
  const room = {
    id: 'duaxe-1',
    epoch: 3,
    participants: new Map(),
    allow: () => true,
    sendTo(id, message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ: ${JSON.stringify(message)}`);
      if (!sent.has(id)) sent.set(id, []);
      sent.get(id).push(message);
    },
    broadcast(message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ: ${JSON.stringify(message).slice(0, 400)}`);
      broadcasts.push(message);
    },
  };
  for (let index = 0; index < bots; index += 1) {
    room.participants.set(`b${index}`, { id: `b${index}`, displayName: `Bot ${index}`, bot: true, connected: true, skin: 'man' });
  }
  const laps = [];
  const results = [];
  const game = new RaceGame({
    room, rules, now: () => clock, random, autoTick: false,
    onLap: (body) => { laps.push(body); }, onResult: (body) => { results.push(body); },
  });
  game.start();
  const join = (id, extra = {}) => {
    const participant = { id, displayName: id.toUpperCase(), connected: true, accountId: `acc-${id}`, ...extra };
    room.participants.set(id, participant);
    return participant;
  };
  const advance = (ms, each) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      clock += 50;
      each?.(clock);
      game.tick();
    }
  };
  return { game, room, sent, broadcasts, laps, results, join, advance, now: () => clock, last: (id, type) => sent.get(id)?.filter((message) => !type || message.type === type).at(-1) };
}

// "Trình duyệt" giả: lái xe của mình bằng chính vật lý dùng chung và gửi race.car 20 lần/giây.
function client(env, participant, { skill = 0.95 } = {}) {
  const track = env.game.track;
  const self = { car: null, driver: createDriver({ skill, random: () => 0.5 }), started: false };
  self.sync = () => {
    const me = env.last(participant.id, 'race.me');
    if (me?.spawn && me !== self.spawned) {
      self.spawned = me;
      self.car = placeCar(createCar(me.spawn), track);
    }
    if (me?.reset && me !== self.resetFrom) {
      self.resetFrom = me;
      Object.assign(self.car, { ...me.reset, v: 0, vl: 0 });
      placeCar(self.car, track);
    }
    if (me && me.mode === 'none') self.car = null;
  };
  self.step = (now) => {
    self.sync();
    if (!self.car) return;
    const state = env.broadcasts.findLast((message) => message.type === 'race.state');
    if (me(env, participant).mode === 'race' && state?.startAt && now < state.startAt) return;
    for (let index = 0; index < 3; index += 1) stepCar(self.car, driveBot(self.driver, self.car, track, []), STEP, track);
    const out = roundCar(self.car);
    env.game.carState(participant, { x: out.x, z: out.z, h: out.h, speed: out.speed });
  };
  return self;
}
const me = (env, participant) => env.last(participant.id, 'race.me') || { mode: 'none' };

test('đường đua dựng từ scene: vòng khép kín, rào không cắt nhau, mốc chặn vòng nhanh vô lý', () => {
  const track = loadTrack('race-circuit');
  assert.ok(track.length > 1_200 && track.length < 2_500, `chiều dài ${track.length}`);
  assert.ok(track.minLapMs > 20_000, `minLapMs ${track.minLapMs}`);
  for (let index = 0; index < track.samples; index += 1) {
    assert.ok(track.wallLeft[index] > track.half && track.wallRight[index] > track.half, 'rào luôn ngoài mép nhựa');
  }
});

test('một người vào đua: bot lấp chỗ, xếp lưới, 5 đèn, đua đủ vòng, kết quả + Bảng vàng', () => {
  const env = setup();
  const person = env.join('p1');
  assert.equal(env.game.join(person, { color: 2 }).ok, true);
  assert.equal(env.game.phase, 'lobby');
  assert.equal(me(env, person).mode, 'queued');
  const driver = client(env, person);
  env.advance(1_100, (now) => driver.step(now));
  assert.equal(env.game.phase, 'grid');
  const grid = env.broadcasts.findLast((message) => message.type === 'race.state');
  assert.ok(grid.drivers.length >= 6 && grid.drivers.length <= 8, `số xe ${grid.drivers.length}`);
  assert.equal(grid.drivers.find((item) => item.id === 'p1').color, 2);
  assert.ok(grid.startAt - grid.lightsAt >= 5 * RULES.lightMs + RULES.lightsOutMs[0]);
  assert.equal(me(env, person).mode, 'race');
  assert.ok(me(env, person).spawn, 'người đua nhận ô lưới');
  // Đứng yên trên lưới tới lúc đèn tắt.
  env.advance(grid.startAt - env.now() - 100, (now) => driver.step(now));
  assert.equal(env.game.phase, 'grid');
  for (let second = 0; second < 300 && !env.results.length; second += 1) env.advance(1_000, (now) => driver.step(now));
  assert.equal(env.game.phase, 'result');
  assert.equal(env.results.length, 1);
  const [result] = env.results;
  const mine = result.results.find((item) => item.accountId === 'acc-p1');
  assert.ok(mine && mine.laps === RULES.laps && mine.totalMs > 0 && !mine.dnf, JSON.stringify(mine));
  assert.ok(env.laps.filter((lap) => lap.accountId === 'acc-p1' && lap.mode === 'race').length === RULES.laps);
  for (const lap of env.laps) assert.ok(lap.lapMs >= env.game.track.minLapMs);
  // Bảng kết quả có đủ người, xong thì người vừa đua tự xếp chờ cuộc sau.
  const resultState = env.broadcasts.findLast((message) => message.type === 'race.state' && message.result);
  assert.equal(resultState.result[0].pos, 1);
  assert.ok(env.game.queue.has('p1'));
});

test('gói trạng thái xe sai bị bác: nhảy cóc, quá tốc độ, ra ngoài rào; đặt lại phải về giữa đường gần chỗ cũ', () => {
  const env = setup({ bots: 0 });
  const person = env.join('p1');
  assert.equal(env.game.practice(person).ok, true);
  const spawn = me(env, person).spawn;
  assert.ok(spawn);
  env.advance(100);
  const track = env.game.track;
  spawn.s = track.project(spawn.x, spawn.z).s;
  const ahead = track.pointAt(200);
  assert.equal(env.game.carState(person, { x: ahead.x, z: ahead.z, h: ahead.h, speed: 40 }).ok, false, 'nhảy cóc 200 m');
  assert.ok(me(env, person).reset, 'nhận lệnh đặt xe về chỗ hợp lệ');
  assert.equal(env.game.carState(person, { x: spawn.x, z: spawn.z, h: spawn.h, speed: 300 }).ok, false, 'quá tốc độ');
  const outside = track.pointAt(40, track.wallLeft[20] + 6);
  assert.equal(env.game.carState(person, { x: outside.x, z: outside.z, h: spawn.h, speed: 10 }).ok, false, 'ngoài rào');
  const near = track.pointAt(spawn.s + 1, 0);
  assert.equal(env.game.carState(person, { x: near.x, z: near.z, h: near.h, speed: 5 }).ok, true);
  const far = track.pointAt(spawn.s + 400, 0);
  assert.equal(env.game.carState(person, { x: far.x, z: far.z, h: far.h, speed: 0, r: true }).ok, false, 'đặt lại xa chỗ cũ');
  const back = track.pointAt(spawn.s - 20, 0);
  env.advance(1_000);
  assert.equal(env.game.carState(person, { x: back.x, z: back.z, h: back.h, speed: 0, r: true }).ok, true);
  assert.equal(env.game.cars.get('p1').tracker.state.clean, false, 'vòng có đặt lại xe không tính kỷ lục');
});

test('chạy thử ngoài lúc đua; đang đua không chạy thử được; bỏ cuộc giữa chừng thì cuộc đua kết thúc khi hết người thật', () => {
  const env = setup();
  const watcher = env.join('p2');
  assert.equal(env.game.practice(watcher).ok, true);
  env.advance(5_000);
  assert.ok([...env.game.cars.values()].some((car) => car.bot && car.mode === 'practice'), 'có bot chạy thử cho đỡ vắng');
  const racer = env.join('p1');
  env.game.join(racer);
  const driver = client(env, racer);
  env.advance(1_100, (now) => driver.step(now));
  assert.equal(env.game.phase, 'grid');
  assert.equal(me(env, watcher).mode, 'none', 'người chạy thử không vào đua rời đường khi xếp lưới');
  assert.equal(env.game.practice(watcher).code, 'RACE_RUNNING');
  const state = env.broadcasts.findLast((message) => message.type === 'race.state');
  env.advance(state.startAt - env.now() + 3_000, (now) => driver.step(now));
  assert.equal(env.game.phase, 'racing');
  env.game.leave(racer);
  env.advance(100);
  assert.equal(env.game.phase, 'result');
  const result = env.broadcasts.findLast((message) => message.type === 'race.state' && message.result);
  assert.ok(result.result.find((item) => item.id === 'p1').dnf);
  assert.equal(env.game.queue.has('p1'), false, 'người bỏ cuộc không tự xếp chờ');
});

test('race.cars gom mọi xe với giờ nhận gói; không mang cờ bot', () => {
  const env = setup();
  const person = env.join('p1');
  env.game.practice(person);
  const driver = client(env, person);
  env.advance(6_000, (now) => driver.step(now));
  const cars = env.broadcasts.findLast((message) => message.type === 'race.cars');
  assert.ok(cars.cars.length >= 2);
  assert.ok(cars.cars.every((car) => car.t <= cars.t && !('bot' in car)));
  const state = env.broadcasts.findLast((message) => message.type === 'race.state');
  assert.ok(state.drivers.every((item) => !('bot' in item)));
});

test('xếp lưới theo vòng nhanh nhất gần đây: chạy thử nhanh được ô đầu, chậm thì về sau, chưa có vòng thì bốc thăm', () => {
  const env = setup();
  const fast = env.join('p1');
  const slow = env.join('p3');
  const fresh = env.join('p4');
  env.game.practice(fast);
  env.game.practice(slow);
  const drivers = [client(env, fast, { skill: 1 }), client(env, slow, { skill: 0.55 })];
  for (let second = 0; second < 140 && !(env.game.quali.has('p1') && env.game.quali.has('p3')); second += 1) {
    env.advance(1_000, (now) => drivers.forEach((driver) => driver.step(now)));
  }
  assert.ok(env.game.quali.get('p1')?.ms < 34_400, `vòng nhanh ${env.game.quali.get('p1')?.ms}`);
  assert.ok(env.game.quali.get('p3')?.ms > 38_500, `vòng chậm ${env.game.quali.get('p3')?.ms}`);
  for (const person of [fast, slow, fresh]) env.game.join(person);
  env.advance(1_100, (now) => drivers.forEach((driver) => driver.step(now)));
  assert.equal(env.game.phase, 'grid');
  const grid = env.broadcasts.findLast((message) => message.type === 'race.state').drivers;
  const slot = (id) => grid.find((item) => item.id === id).slot;
  assert.equal(slot('p1'), 0, 'vòng nhanh nhất giành ô đầu');
  assert.equal(grid.find((item) => item.id === 'p1').quali, env.game.quali.get('p1').ms);
  assert.equal(grid.find((item) => item.id === 'p4').quali, undefined, 'chưa có vòng thì không có giờ phân hạng');
  // Các xe có giờ (người + bot) đứng đúng thứ tự giờ, người chưa có vòng chen ở bất kỳ ô nào.
  const timed = [...grid].filter((item) => item.quali !== undefined).sort((a, b) => a.slot - b.slot);
  assert.equal(timed.length, grid.length - 1);
  for (let index = 1; index < timed.length; index += 1) assert.ok(timed[index].quali >= timed[index - 1].quali, 'đúng thứ tự giờ');
  assert.equal(timed.at(-1).id, 'p3', 'vòng chậm hơn mọi bot thì đứng cuối các xe có giờ');
  // Giờ phân hạng chỉ giữ qualifyMs: quá hạn thì cuộc sau bốc thăm.
  env.game.quali.get('p1').at -= RULES.qualifyMs + 1;
  assert.equal(env.game.gridOrder([fast], new Map(), env.now())[0].quali, null);
});
