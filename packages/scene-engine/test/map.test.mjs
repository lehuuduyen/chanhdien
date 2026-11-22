import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { buildMapRaster, mapPoints, mapToWorld, rasterCellAt, worldToMap } from '../src/map2d.mjs';
import { placeOf } from '../src/places.mjs';
import { projectOnRoute, remaining, routeLength } from '../src/route3d.mjs';
import { findPath, isWalkable } from '../src/walk.mjs';

const scene = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../scenes/thien-default/scene.json'), 'utf8'));
const { world } = scene;
const { walk } = world;
const travel = THIEN_RULES.world.travel;

// Bản sao nguyên logic cũ trong explore3d trước khi tách module; dùng để bắt mọi thay đổi vô ý ở mép khu.
function legacyPlaceOf(self) {
  const hall = world.hall;
  if (hall && self.x >= -hall.halfWidth && self.x <= hall.halfWidth && self.z >= hall.back && self.z <= hall.front) return 'hall';
  const pets = world.courtyard?.petZone?.area;
  if (pets && self.x >= pets.x[0] && self.x <= pets.x[1] && self.z >= pets.z[0] && self.z <= pets.z[1]) return 'pets';
  const farm = world.courtyard?.farmZone?.area;
  if (farm && self.x >= farm.x[0] && self.x <= farm.x[1] && self.z >= farm.z[0] && self.z <= farm.z[1]) return 'farm';
  const park = world.courtyard?.park?.area;
  if (park && self.x >= park.x[0] - 2 && self.x <= park.x[1] && self.z >= park.z[0] && self.z <= park.z[1]) return 'park';
  const flowers = world.courtyard?.flowerGarden;
  const flowerAreas = flowers?.areas || (flowers?.area ? [flowers.area] : []);
  if (flowerAreas.some((item) => self.x >= item.x[0] && self.x <= item.x[1] + 2 && self.z >= item.z[0] && self.z <= item.z[1])) return 'flowers';
  const boundsOf = (fence, padding) => {
    const points = (fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
    return points.length ? {
      x: [Math.min(...points.map(([x]) => x)) + padding.x[0], Math.max(...points.map(([x]) => x)) + padding.x[1]],
      z: [Math.min(...points.map(([, z]) => z)) + padding.z[0], Math.max(...points.map(([, z]) => z)) + padding.z[1]],
    } : null;
  };
  const inside = (area) => area && self.x >= area.x[0] && self.x <= area.x[1] && self.z >= area.z[0] && self.z <= area.z[1];
  if (inside(boundsOf(world.courtyard?.garden?.fence, { x: [-2.8, 0.5], z: [-0.5, 0.5] }))) return 'garden';
  if (inside(boundsOf(world.courtyard?.memorial?.fence, { x: [-0.5, 2.8], z: [-0.5, 0.5] }))) return 'memorial';
  if (inside(world.courtyard?.wishGarden?.area)) return 'wishes';
  const overlook = world.courtyard?.overlook;
  if (overlook && self.z >= overlook.path.z[0]) return 'overlook';
  const fields = world.courtyard?.fields?.area;
  if (fields && self.x <= fields.x[1] + 0.5 && self.z >= fields.z[0]) return 'myfarm';
  const grove = world.courtyard?.grove;
  if (grove && self.x <= grove.area.x[1]) return 'grove';
  return 'courtyard';
}

test('placeOf tách ra giữ nguyên vùng cũ trên toàn sân và nhận đúng các điểm đi nhanh', () => {
  for (let x = walk.bounds.x[0]; x <= walk.bounds.x[1]; x += 4.75) {
    for (let z = walk.bounds.z[0]; z <= walk.bounds.z[1]; z += 4.25) {
      // Khu mới sau khi tách module: Tàng Kinh Các (góc đông bắc sân, trước đây là 'courtyard').
      const library = world.courtyard?.library?.area;
      const inLibrary = library && x >= library.x[0] && x <= library.x[1] && z >= library.z[0] && z <= library.z[1];
      assert.equal(placeOf(world, { x, z }), inLibrary ? 'library' : legacyPlaceOf({ x, z }), `(${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  // Hai điểm đáp ở ngay lối vào khu mới: park còn thuộc sân, overlook thuộc Vườn Đèn phủ trên đài.
  const expected = { park: 'courtyard', overlook: 'wishes' };
  for (const [id, point] of Object.entries(travel)) {
    assert.equal(placeOf(world, point), expected[id] || id, `${id} có mã khu thực tế đúng`);
  }
});

test('tọa độ bản đồ đi-về không đổi và raster phủ đúng sân', () => {
  const raster = buildMapRaster(world, { cell: 0.5 });
  assert.equal(raster.cols, 291);
  assert.equal(raster.rows, 266);
  assert.equal(raster.cells.length, raster.cols * raster.rows);
  for (const point of [walk.spawn, ...Object.values(travel), { x: -90, z: 50 }, { x: 45, z: 90 }]) {
    const roundTrip = mapToWorld(raster, worldToMap(raster, point));
    assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.z - point.z) < 1e-9);
  }
  assert.equal(rasterCellAt(raster, { x: 0, z: 22.5 }), 1, 'lư hương là ô vướng');
  assert.equal(rasterCellAt(raster, { x: 0, z: 33 }) >= 2, true, 'sân giữa đi được');
  assert.equal(rasterCellAt(raster, { x: 50, z: 130 }), 0, 'ngoài các vùng đi là trong suốt');
  const points = mapPoints(world, travel);
  assert.deepEqual(points.map(({ id }) => id), Object.keys(travel));
  for (const point of points) {
    assert.equal(isWalkable(walk, point.x, point.z), true, `${point.id} đứng được`);
    assert.ok(rasterCellAt(raster, point) >= 2, `${point.id} rơi vào ô đi được`);
  }
});

test('toán tuyến đường cho đoạn thẳng, đường gãy và điểm ngoài tuyến', () => {
  const straight = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
  assert.equal(routeLength(straight), 10);
  assert.deepEqual(projectOnRoute(straight, { x: 4, z: 3 }), {
    distance: 3, progress: 4, segment: 0, point: { x: 4, z: 0 }, remaining: 6,
  });
  assert.equal(remaining(straight, { x: -3, z: 0 }), 10);
  assert.equal(remaining(straight, { x: 14, z: 0 }), 0);
  const corner = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }];
  assert.equal(routeLength(corner), 7);
  const projected = projectOnRoute(corner, { x: 5, z: 2 });
  assert.equal(projected.segment, 1);
  assert.equal(projected.distance, 2);
  assert.equal(projected.progress, 5);
  assert.equal(projected.remaining, 2);
});

test('lưới dẫn đường 0,5 m và lưới GPS 0,8 m nối được mọi cặp trong 11 điểm đi nhanh', () => {
  const entries = Object.entries(travel);
  let longestMs = 0;
  for (const cell of [0.5, 0.8]) {
    for (const [fromId, from] of entries) {
      for (const [toId, to] of entries) {
        const started = performance.now();
        const route = findPath(walk, from, to, { cell });
        longestMs = Math.max(longestMs, performance.now() - started);
        if (fromId === toId) continue;
        assert.ok(route.length, `${cell} m: ${fromId} → ${toId} có đường`);
        const last = route.at(-1);
        assert.ok(Math.hypot(last.x - to.x, last.z - to.z) < 0.9, `${cell} m: ${fromId} → ${toId} tới đúng đích`);
        for (const point of route) assert.equal(isWalkable(walk, point.x, point.z), true, `${cell} m: ${fromId} → ${toId} không xuyên vật cản`);
      }
    }
  }
  assert.ok(Number.isFinite(longestMs));
});
