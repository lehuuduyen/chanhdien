import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildTrack, CAR, collideCars, createCar, createDriver, createLapTracker, driveBot, gridSlot, placeCar, SPEED_LIMIT, STEP, stepCar, topSpeed,
} from '../src/index.mjs';

const DATA = JSON.parse(readFileSync(new URL('../../../scenes/race-circuit/track.json', import.meta.url), 'utf8'));
const track = buildTrack(DATA);
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('đường đua: chiều dài, rào hai bên không chạm đoạn đường khác, kerb chỉ ở cua', () => {
  assert.ok(track.length > 1_500 && track.length < 1_900, `dài ${track.length}`);
  // Rào của một đoạn không được nằm trên mặt đường của đoạn khác (cách ≥ 60 m theo đường).
  for (let index = 0; index < track.samples; index += 3) {
    for (const sign of [1, -1]) {
      const d = sign * (sign > 0 ? track.wallLeft[index] : track.wallRight[index]);
      const x = track.x[index] + track.tz[index] * d;
      const z = track.z[index] - track.tx[index] * d;
      const projected = track.project(x, z);
      const apart = Math.min(Math.abs(projected.index - index), track.samples - Math.abs(projected.index - index)) * track.step;
      if (apart > 60) assert.ok(Math.abs(projected.d) > track.half + 1, `rào mẫu ${index} lấn mặt đường ở mẫu ${projected.index}`);
    }
  }
  const straight = track.pointAt(80);
  assert.equal(track.kerbLeft[straight.index] || track.kerbRight[straight.index], 0, 'đường thẳng chính không có kerb');
});

test('xe: tốc độ tối đa dưới trần máy chủ, phanh dừng được, không xuyên rào kể cả lao thẳng', () => {
  assert.ok(topSpeed() > 60 && topSpeed() < SPEED_LIMIT);
  const car = placeCar(createCar(gridSlot(track, 0)), track);
  for (let index = 0; index < 60 * 5; index += 1) stepCar(car, { throttle: 1 }, STEP, track);
  assert.ok(car.v > 40, `tăng tốc ${car.v}`);
  for (let index = 0; index < 60 * 4; index += 1) stepCar(car, { brake: 1 }, STEP, track);
  assert.ok(car.v <= 0.5, `phanh ${car.v}`);
  // Đánh hết lái phải và giữ ga: xe phải dừng ở rào, không ra ngoài.
  for (let index = 0; index < 60 * 20; index += 1) {
    stepCar(car, { throttle: 1, steer: 1 }, STEP, track);
    const walls = track.wallsAt(car.index, 0);
    assert.ok(car.d < walls.left + 0.5 && car.d > -walls.right - 0.5, `ra ngoài rào d=${car.d}`);
  }
});

test('va xe: hai xe chồng lên nhau bị đẩy ra, xe đâm từ sau truyền tốc độ cho xe trước', () => {
  const a = placeCar(createCar(track.pointAt(100, 0)), track);
  const b = placeCar(createCar(track.pointAt(104, 0)), track);
  a.v = 40;
  b.v = 20;
  const hit = collideCars(a, b, { moveOther: true });
  assert.ok(hit > 0);
  assert.ok(a.v < 40 && b.v > 20, `a ${a.v} b ${b.v}`);
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(gap >= 2 * CAR.offset + 2 * CAR.radius - 3.2 - 1e-6, 'đã đẩy ra');
});

test('đếm vòng: đủ mốc theo thứ tự mới thành vòng; chạy lùi qua vạch không tính; vòng có đặt lại xe không tính kỷ lục', () => {
  const tracker = createLapTracker(track);
  let t = 0;
  const drive = (from, to, step = 5) => {
    const events = [];
    for (let s = from; s <= to; s += step) {
      const point = track.pointAt(s);
      events.push(...tracker.update(point.x, point.z, (t += 100)));
    }
    return events;
  };
  drive(track.length - 50, track.length + 10);
  assert.equal(tracker.state.started, true);
  const laps = drive(10, track.length + 10);
  assert.equal(laps.filter((event) => event.type === 'lap').length, 1);
  // Cắt đường: nhảy cóc nửa vòng (bỏ qua các mốc) thì vòng đó không tính.
  drive(10, 300);
  const cut = drive(900, track.length + 10);
  assert.deepEqual(cut.map((event) => event.type), ['missed']);
  // Lùi qua vạch: phải qua vạch theo chiều đua lần nữa mới bắt đầu tính lại.
  drive(10, 60);
  const back = track.pointAt(-20);
  tracker.update(back.x, back.z, (t += 100));
  assert.equal(tracker.state.started, false);
  drive(track.length - 10, track.length + 10);
  assert.equal(tracker.state.started, true);
  tracker.taint();
  const tainted = drive(10, track.length + 10).find((event) => event.type === 'lap');
  assert.equal(tainted.valid, false);
});

test('bot: 6 xe từ lưới chạy đủ 3 vòng không kẹt, không vượt rào, vòng sau trong khoảng hợp lý', () => {
  const random = seeded(5);
  const cars = Array.from({ length: 6 }, (_, index) => {
    const car = placeCar(createCar(gridSlot(track, index)), track);
    car.driver = createDriver({ skill: 0.78 + random() * 0.15, lane: (random() - 0.5) * 1.2, random });
    car.tracker = createLapTracker(track);
    car.tracker.startRace(0);
    car.tracker.update(car.x, car.z, 0);
    return car;
  });
  let t = 0;
  while (t < 200_000 && cars.some((car) => car.tracker.state.lap < 3)) {
    for (const car of cars) stepCar(car, driveBot(car.driver, car, track, cars), STEP, track);
    for (let a = 0; a < cars.length; a += 1) for (let b = a + 1; b < cars.length; b += 1) collideCars(cars[a], cars[b], { moveOther: true });
    t += STEP * 1_000;
    for (const car of cars) car.tracker.update(car.x, car.z, t);
  }
  for (const car of cars) {
    assert.ok(car.tracker.state.lap >= 3, `bot chưa xong 3 vòng (${car.tracker.state.lap})`);
    for (const lap of car.tracker.state.laps.slice(1)) assert.ok(lap.ms > track.minLapMs && lap.ms < 60_000, `vòng ${lap.ms}`);
  }
});
