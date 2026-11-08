import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { findPath, isWalkable, resolveMove, validateWalk } from '../src/walk.mjs';

const scene = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../scenes/thien-default/scene.json'), 'utf8'));
const walk = scene.world.walk;
// Một cột trong chánh điện (bên trái, hàng thứ ba) lấy từ world.hall.
const [pillarX, pillarZ] = scene.world.hall.pillars.find(([x, z]) => x < 0 && z > 5);

test('chánh điện có vùng đi lại hợp lệ; chỗ xuất hiện đứng được', () => {
  assert.deepEqual(validateWalk(walk), []);
  assert.equal(isWalkable(walk, walk.spawn.x, walk.spawn.z), true);
  assert.equal(isWalkable(walk, pillarX, pillarZ), false, 'không đứng trong cột');
  assert.equal(isWalkable(walk, 0, 1.0), false, 'không đứng trong lư hương');
  assert.equal(isWalkable(walk, walk.bounds.x[1] + 1, 40), false, 'không ra ngoài tường sân');
  assert.equal(isWalkable(walk, scene.world.courtyard.pond.x, scene.world.courtyard.pond.z), false, 'không lội xuống hồ');
  const [bushX, bushZ] = scene.world.courtyard.bushes[0];
  assert.equal(isWalkable(walk, bushX, bushZ), false, 'không đi xuyên bụi cây');
  const bench = scene.world.courtyard.benches[0];
  assert.equal(isWalkable(walk, bench.x, bench.z + 1.05), false, 'không lọt qua đầu ghế đá');
  assert.equal(isWalkable(walk, 4, 16), false, 'chỉ qua tường trước chánh điện ở cửa giữa');
  assert.equal(isWalkable(walk, 0, 16), true, 'đi qua cửa chánh điện ra sân');
  assert.equal(isWalkable(walk, 0, 22.5), false, 'không đứng trong lư hương giữa sân');
  for (const [name, destination] of Object.entries(THIEN_RULES.world.travel)) {
    assert.equal(isWalkable(walk, destination.x, destination.z), true, `điểm đi nhanh ${name} phải đứng được`);
  }
});

test('ghế đá ngoài sân có đúng mã realtime, nhỏ vừa nhân vật và mỗi ghế hai chỗ', () => {
  const benches = scene.world.courtyard.benches;
  assert.equal(benches.length, THIEN_RULES.benches.count);
  assert.deepEqual(benches.map((item) => item.id), Array.from({ length: benches.length }, (_, index) => `B-${index + 1}`));
  for (const bench of benches) {
    if (!bench.kind) assert.ok(bench.scale >= 0.65 && bench.scale <= 0.8, 'ghế đá không lớn hơn nhân vật chibi');
    assert.equal(bench.seats, THIEN_RULES.benches.seatsPerBench);
  }
  // Khu vui chơi: hai xích đu + hai cầu tuột, đứng được ở điểm chờ, chỗ ngồi nằm trong vật cản (không ai đi xuyên).
  const play = benches.filter((item) => item.kind);
  assert.deepEqual(play.map((item) => item.kind), ['swing', 'swing', 'slide']);
  for (const item of play) {
    const [lx, lz] = item.approach;
    const x = item.x + lx * Math.cos(item.ry) + lz * Math.sin(item.ry);
    const z = item.z - lx * Math.sin(item.ry) + lz * Math.cos(item.ry);
    assert.equal(isWalkable(walk, x, z), true, `điểm chờ ${item.id} phải đứng được`);
    assert.equal(isWalkable(walk, item.x, item.z), false, `${item.id} là vật cản`);
  }
});

test('Vườn Hoa: vào được qua hai cổng, đi tới ghế và điểm ngắm, không giẫm lên luống', () => {
  const garden = scene.world.courtyard.flowerGarden;
  const benches = scene.world.courtyard.benches.filter((item) => /^B-1\d$/.test(item.id));
  assert.equal(benches.length, 4);
  const start = THIEN_RULES.world.travel.flowers;
  const reach = (point, label) => {
    const route = findPath(walk, start, point);
    assert.ok(route.length > 0, `đi tới ${label} được`);
    const last = route.at(-1);
    assert.ok(Math.hypot(last.x - point.x, last.z - point.z) < 0.6, `${label}: tới đúng chỗ`);
  };
  for (const bench of benches) {
    const front = { x: bench.x + Math.sin(bench.ry) * 0.95 * bench.scale, z: bench.z + Math.cos(bench.ry) * 0.95 * bench.scale };
    assert.equal(isWalkable(walk, front.x, front.z), true, `trước ghế ${bench.id} đứng được`);
    reach(front, `ghế ${bench.id}`);
  }
  for (const view of garden.views) assert.equal(isWalkable(walk, view.x, view.z), true, `điểm ngắm (${view.x}, ${view.z})`);
  reach(garden.center, 'giữa đình');
  // Lối ra bắc nối tới Khu tưởng niệm.
  reach({ x: garden.entrances[1].x, z: garden.entrances[1].z + 3 }, 'lối ra phía bắc');
  for (const bed of garden.beds) {
    const x = (bed.x[0] + bed.x[1]) / 2;
    const z = (bed.z[0] + bed.z[1]) / 2;
    assert.equal(isWalkable(walk, x, z), false, `luống ${bed.theme} là vật cản`);
    assert.equal(isWalkable(walk, bed.x[0] + 0.5, bed.z[0] + 0.5) && isWalkable(walk, bed.x[1] - 0.5, bed.z[1] - 0.5), false, `góc luống ${bed.theme}`);
  }
  // Hàng rào kín ngoài hai cổng.
  assert.equal(isWalkable(walk, garden.area.x[1] - 0.3, garden.center.z + 5), false, 'không chui qua rào');
});

test('toàn bộ tuyến tuần tra của bot ngoài sân không xuyên vật thể', () => {
  const points = THIEN_RULES.bots.walk.waypoints;
  for (const point of points) {
    assert.equal(isWalkable(walk, point.x, point.z), true, `điểm (${point.x}, ${point.z}) phải đi được`);
  }
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    for (let travelled = 0; travelled <= distance; travelled += 0.1) {
      const ratio = distance ? travelled / distance : 0;
      const x = from.x + (to.x - from.x) * ratio;
      const z = from.z + (to.z - from.z) * ratio;
      assert.equal(isWalkable(walk, x, z), true, `đoạn ${index + 1} bị chặn tại (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('khu Quan Âm chặn hàng cây, bàn lễ và đèn nhưng vẫn chừa đúng lối vào', () => {
  const guanyin = scene.world.courtyard.guanyin;
  const garden = guanyin.garden;
  const point = (x, z) => ({
    x: guanyin.x + x * Math.cos(guanyin.ry) + z * Math.sin(guanyin.ry),
    z: guanyin.z - x * Math.sin(guanyin.ry) + z * Math.cos(guanyin.ry),
  });
  for (let index = 0; index < garden.hedgeCount; index += 1) {
    const angle = (index / garden.hedgeCount) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < garden.entryHalfAngle) continue;
    const hedge = point(Math.sin(angle) * garden.radius, Math.cos(angle) * garden.radius);
    assert.equal(isWalkable(walk, hedge.x, hedge.z), false, `không xuyên hàng cây Quan Âm số ${index + 1}`);
  }
  const entrance = point(0, garden.radius);
  assert.equal(isWalkable(walk, entrance.x, entrance.z), true, 'lối chính vào khu Quan Âm vẫn đi được');
  const altarFront = point(garden.altar.x, garden.altar.z + garden.altar.depth / 2);
  assert.equal(isWalkable(walk, altarFront.x, altarFront.z), false, 'không đi xuyên mặt trước bàn lễ');
  for (const item of garden.lanterns) {
    const lantern = point(item.x, item.z);
    assert.equal(isWalkable(walk, lantern.x, lantern.z), false, 'không đi xuyên đèn đá khu Quan Âm');
  }
});

test('va chạm: đi vào cột thì bị đẩy ra mép cột; đi ra ngoài thì giữ ở trong', () => {
  const pushed = resolveMove(walk, { x: pillarX + 0.8, z: pillarZ }, { x: pillarX + 0.1, z: pillarZ });
  assert.ok(Math.hypot(pushed.x - pillarX, pushed.z - pillarZ) >= 0.65 - 1e-9);
  const headOn = resolveMove(walk, { x: 0, z: 24 }, { x: 0, z: 23.1 });
  assert.ok(Math.abs(headOn.x) > 0.1, 'đi thẳng vào tâm lư hương thì trượt tiếp tuyến ngay');
  assert.equal(isWalkable(walk, headOn.x, headOn.z), true);
  const atGate = resolveMove(walk, { x: 0, z: 30 }, { x: 0, z: 200 });
  assert.equal(atGate.z, walk.bounds.z[1]);
  assert.equal(isWalkable(walk, atGate.x, atGate.z), true, 'đi xa vẫn né vật cản và dừng trong cổng');
  const atWall = resolveMove(walk, { x: 4, z: 15.5 }, { x: 4, z: 16.2 });
  assert.ok(atWall.z <= 15.7, 'không nhảy qua khoảng tường kín trước chánh điện');
});

test('khung hình chậm vẫn quét qua cả quãng đường, không nhảy xuyên vật nhỏ', () => {
  const smallWalk = {
    bounds: { x: [-2, 2], z: [-2, 2] }, spawn: { x: -1, z: 0 }, radius: 0.1,
    obstacles: [{ x: 0, z: 0, r: 0.1 }],
  };
  const next = resolveMove(smallWalk, { x: -1, z: 0 }, { x: 1, z: 0 });
  assert.equal(isWalkable(smallWalk, next.x, next.z), true);
  assert.ok(Math.abs(next.z) > 0.05, 'quãng đi phải lách quanh vật, không xuyên thẳng qua tâm');
});

test('chạm xuống sàn: tìm đường vòng qua lư hương, không đi xuyên vật cản', () => {
  const route = findPath(walk, { x: 0, z: 3.5 }, { x: 0, z: 1.3 });
  assert.ok(route.length >= 1);
  const last = route.at(-1);
  assert.equal(isWalkable(walk, last.x, last.z), true, 'đích sát lư hương được dời ra ô trống gần nhất');
  const far = findPath(walk, walk.spawn, { x: -3.6, z: 2.6 });
  assert.ok(far.length >= 1);
  let previous = walk.spawn;
  for (const point of far) {
    for (let t = 0; t <= 1; t += 0.05) {
      assert.equal(isWalkable(walk, previous.x + (point.x - previous.x) * t, previous.z + (point.z - previous.z) * t), true);
    }
    previous = point;
  }
});

test('từ sân ngoài chùa tìm đường vào tận bồ đoàn trong chánh điện, đi qua cửa', () => {
  const samples = [];
  let route;
  // Runner CI dùng chung có thể bị ngắt CPU giữa một phép đo. Lấy mẫu nhanh nhất vẫn bắt được hồi quy thuật toán
  // mà không làm cả pipeline đỏ vì một lần chậm vài mili giây.
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    route = findPath(walk, walk.spawn, { x: -2, z: 4.4 });
    samples.push(performance.now() - started);
  }
  assert.ok(Math.min(...samples) < 200, `tìm đường nhanh trên vùng rộng (${samples.map((ms) => `${ms.toFixed(1)}ms`).join(', ')})`);
  assert.ok(route.length >= 2);
  // Đoạn đường cắt mặt tiền (z = 16) phải nằm trong cửa giữa.
  const crossing = [walk.spawn, ...route].some((point, index, list) => {
    const next = list[index + 1];
    if (!next || (point.z - 16) * (next.z - 16) > 0) return false;
    const t = (16 - point.z) / (next.z - point.z || 1);
    return Math.abs(point.x + (next.x - point.x) * t) <= 1.3;
  });
  assert.ok(crossing, 'đi qua cửa giữa');
  let previous = walk.spawn;
  for (const point of route) {
    for (let t = 0; t <= 1; t += 0.05) assert.equal(isWalkable(walk, previous.x + (point.x - previous.x) * t, previous.z + (point.z - previous.z) * t), true);
    previous = point;
  }
});

test('hồ lớn là vật cản elip: đi vào hồ thì bị đẩy lên bờ và trượt dọc bờ', () => {
  const pond = walk.obstacles.find((item) => item.rx);
  assert.ok(pond, 'scene có hồ elip');
  const from = { x: pond.x + pond.rx + 0.4, z: pond.z };
  const next = resolveMove(walk, from, { x: from.x - 0.3, z: from.z + 0.1 });
  assert.equal(isWalkable(walk, next.x, next.z), true);
  assert.ok(next.z > from.z, 'giữ phần đi dọc bờ');
  const route = findPath(walk, { x: pond.x, z: pond.z - pond.rz - 1 }, { x: pond.x, z: pond.z + pond.rz + 1 });
  assert.ok(route.length >= 2, 'đi vòng quanh hồ');
});
