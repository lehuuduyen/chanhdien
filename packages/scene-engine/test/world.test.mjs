import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { resolveScene } from '../src/index.mjs';
import { clampToBounds, defaultCameraFor, validateWorld } from '../src/world.mjs';

const scene = resolveScene(JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../scenes/thien-default/scene.json'), 'utf8')));

test('chánh điện 3D: đủ 20 bồ đoàn khớp cảnh 2D, không chồng nhau, nằm trong chánh điện', () => {
  assert.deepEqual(validateWorld(scene), { ok: true, errors: [] });
  assert.equal(scene.world.seats.length, 20);
  // Hàng sát bàn thờ (S-1…S-4) gần bàn thờ hơn hàng cuối (S-15, S-16).
  const z = (id) => scene.world.seats.find((seat) => seat.id === id).z;
  assert.ok(z('S-1') < z('S-16'));
});

test('bắt lỗi bố cục 3D sai và giữ camera trong tường', () => {
  const broken = { ...scene, world: { ...scene.world, seats: [...scene.world.seats.slice(0, 15), { id: 'S-16', x: -2.0, z: 2.5 }] } };
  const { ok, errors } = validateWorld(broken);
  assert.equal(ok, false);
  assert.ok(errors.some((error) => error.includes('quá gần')));
  assert.deepEqual(clampToBounds({ x: 40, y: -3, z: 5 }, scene.world.camera.bounds), { x: scene.world.camera.bounds.x[1], y: 0.6, z: 5 });
});

test('góc mặc định thấy trọn 4 cột bồ đoàn trên điện thoại dọc lẫn máy tính, camera nằm trong chánh điện', () => {
  const camera = scene.world.camera;
  for (const aspect of [440 / 779, 390 / 664, 16 / 9, 9 / 16]) {
    const view = defaultCameraFor(camera, aspect);
    const half = Math.atan(Math.tan((view.fov * Math.PI) / 360) * aspect);
    // Bồ đoàn ngoài cùng ở x = ±2,0 m (+0,36 m bề rộng), đo ở hàng gần camera nhất.
    const nearestZ = Math.max(...scene.world.seats.filter((seat) => Math.abs(seat.x) === 2).map((seat) => seat.z));
    const depth = Math.hypot(view.position.z - nearestZ, view.position.y - 0.3);
    assert.ok(Math.tan(half) * depth >= 2.36, `thấy cột ngoài cùng ở tỷ lệ ${aspect.toFixed(2)}`);
    const { x, y, z } = view.position;
    assert.deepEqual(clampToBounds({ x, y, z }, camera.bounds), { x, y, z });
  }
});

test('camera nhập vai khóa khoảng cách gần như bố cục mobile', () => {
  const follow = scene.world.camera.follow;
  assert.deepEqual(follow, { distance: 3.8, height: 2.7, targetHeight: 0.95, lockZoom: true, lockPan: true });
  assert.ok(Math.hypot(follow.distance, follow.height - follow.targetHeight) < 4.3, 'nhân vật đủ lớn trong khung dọc');
});
