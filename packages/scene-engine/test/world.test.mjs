import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { THIEN_RULES } from '@chanh-dien/room-rules';
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
  assert.deepEqual(clampToBounds({ x: 80, y: -3, z: 5 }, scene.world.camera.bounds), { x: scene.world.camera.bounds.x[1], y: 0.6, z: 5 });
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

test('cây Bồ Đề công trình có đủ năm tỉ lệ cảnh tăng dần', () => {
  const bodhi = scene.world.courtyard.bodhi;
  assert.equal(bodhi.projectId, 'bodhi-global-1');
  assert.deepEqual(bodhi.stageScales, [0, 0.18, 0.42, 0.72, 1]);
  const broken = structuredClone(scene);
  broken.world.courtyard.bodhi.stageScales = [0, 0.7, 0.3];
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('stageScales')));
});

test('hồ sen công trình khai báo đủ mốc mở khóa cảnh', () => {
  const pond = scene.world.courtyard.pond;
  assert.equal(pond.projectId, 'lotus-global-1');
  assert.deepEqual(pond.stageVisibility, { water: 0, rocks: 2, lotus: 3, fish: 0 }, 'hồ cá nền luôn còn; đá và sen mở dần');
  const broken = structuredClone(scene);
  delete broken.world.courtyard.pond.stageVisibility.fish;
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('stageVisibility')));
});

test('mỗi khu có một bảng hướng dẫn đặt bằng dữ liệu cảnh', () => {
  const boards = scene.world.courtyard.guideBoards;
  assert.deepEqual(boards.map((board) => board.id), ['hall', 'courtyard', 'garden', 'pets']);
  assert.ok(boards.every((board) => Number.isFinite(board.x) && Number.isFinite(board.z) && board.sign));
  const broken = structuredClone(scene);
  broken.world.courtyard.guideBoards[2].id = 'courtyard';
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('bảng hướng dẫn')));
});

test('khu thú cưng có hàng rào, đồ chơi và mã thú khớp room rules', () => {
  const { petZone, animals } = scene.world.courtyard;
  assert.deepEqual(petZone.area, THIEN_RULES.world.petArea);
  assert.ok(petZone.fence.length >= 5);
  assert.deepEqual(petZone.props.map((item) => item.type), ['house', 'tunnel', 'seesaw', 'hoop', 'bowls', 'balls']);
  assert.deepEqual(animals.map((item) => item.id), THIEN_RULES.world.pets);
  assert.ok(animals.every((item) => item.name && ['dog', 'cat'].includes(item.type)));
  const broken = structuredClone(scene);
  broken.world.courtyard.animals[1].id = broken.world.courtyard.animals[0].id;
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('thú cưng')));
  // Milo, Fox, Meomeo dùng mô hình nén trong /models/pets/ (file phải có thật).
  const models = animals.filter((item) => item.model);
  assert.deepEqual(models.map((item) => item.name), ['Milo', 'Fox', 'Meomeo']);
  for (const item of models) assert.ok(existsSync(new URL(`../../../apps/web/public${item.model}`, import.meta.url)), item.model);
  const badModel = structuredClone(scene);
  badModel.world.courtyard.animals.find((item) => item.model).model = 'https://example.com/x.glb';
  assert.ok(validateWorld(badModel).errors.some((error) => error.includes('mô hình')));
});

test('sáu công việc trong chùa khớp id, loại, vị trí kiểm tra của realtime', () => {
  const sceneChores = scene.world.courtyard.chores.map(({ id, kind, x, z, radius }) => ({ id, kind, x, z, radius }));
  const ruleChores = THIEN_RULES.world.chores.map(({ id, kind, x, z, radius }) => ({ id, kind, x, z, radius }));
  assert.deepEqual(sceneChores, ruleChores);
  assert.deepEqual(sceneChores.map((item) => item.kind), ['sweep', 'water', 'light', 'feed', 'clean', 'tea']);
  const broken = structuredClone(scene);
  broken.world.courtyard.chores[5].kind = 'sweep';
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('công việc')));
});
