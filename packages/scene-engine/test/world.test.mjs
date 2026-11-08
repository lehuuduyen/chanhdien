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

test('Vườn Công Đức dùng mô hình Meshy nội bộ nhưng giữ đủ 50 luống và vùng tương tác', () => {
  const garden = scene.world.courtyard.garden;
  const guide = scene.world.courtyard.guideBoards.find((board) => board.id === 'garden');
  assert.equal(garden.model.src, '/models/garden/garden-entrance.glb');
  assert.ok(existsSync(new URL(`../../../apps/web/public${garden.model.src}`, import.meta.url)));
  assert.equal(garden.plots.length, 50);
  assert.ok(garden.shop && garden.entrance && garden.barrel);
  assert.ok(Math.hypot(guide.x - garden.shop.x, guide.z - garden.shop.z) > 4, 'bảng hướng dẫn và Store nằm riêng hai bên cổng');
  const broken = structuredClone(scene);
  broken.world.courtyard.garden.model.src = 'https://example.com/garden.glb';
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('garden.model')));
});

test('khu thú cưng có hàng rào, đồ chơi và mã thú khớp room rules', () => {
  const { petZone, animals } = scene.world.courtyard;
  assert.deepEqual(petZone.area, THIEN_RULES.world.petArea);
  assert.ok(petZone.fence.length >= 6, 'có lối nối sang Nông trại');
  assert.deepEqual(petZone.props.map((item) => item.type), ['house', 'tunnel', 'seesaw', 'hoop', 'bowls', 'balls']);
  assert.deepEqual(animals.map((item) => item.id), THIEN_RULES.world.pets);
  const yard = animals.filter((item) => !item.id.startsWith('farm-'));
  assert.ok(yard.every((item) => item.name && ['dog', 'cat'].includes(item.type)));
  const broken = structuredClone(scene);
  broken.world.courtyard.animals[1].id = broken.world.courtyard.animals[0].id;
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('thú cưng')));
  // Milo, Fox, Meomeo dùng mô hình nén trong /models/pets/ (file phải có thật).
  const models = animals.filter((item) => item.model);
  assert.deepEqual(models.filter((item) => !item.id.startsWith('farm-')).map((item) => item.name), ['Milo', 'Fox', 'Meomeo']);
  for (const item of models) assert.ok(existsSync(new URL(`../../../apps/web/public${item.model}`, import.meta.url)), item.model);
  const badModel = structuredClone(scene);
  badModel.world.courtyard.animals.find((item) => item.model).model = 'https://example.com/x.glb';
  assert.ok(validateWorld(badModel).errors.some((error) => error.includes('mô hình')));
});

test('Nông trại nhỏ: vùng khớp room rules, có cổng nam và cổng nối khu thú cưng, đủ 6 loài mô hình Meshy, thú ở trong rào', () => {
  const { farmZone, animals, petZone } = scene.world.courtyard;
  assert.deepEqual(farmZone.area, THIEN_RULES.world.farmArea);
  assert.deepEqual(farmZone.props.map((item) => item.type), ['barn', 'trough', 'hay', 'hay', 'hay', 'duckpond', 'duckhouse']);
  const farm = animals.filter((item) => item.id.startsWith('farm-'));
  assert.deepEqual([...new Set(farm.map((item) => item.type))].sort(), ['deer', 'duck', 'goat', 'pig', 'pony', 'rabbit']);
  for (const item of farm) {
    assert.ok(item.model === `/models/pets/farm-${item.type}.glb`, item.id);
    assert.ok(existsSync(new URL(`../../../apps/web/public${item.model}`, import.meta.url)), item.model);
    assert.ok(item.x > farmZone.area.x[0] && item.x < farmZone.area.x[1] && item.z > farmZone.area.z[0] && item.z < farmZone.area.z[1], `${item.id} trong rào`);
    assert.ok(item.area.x[0] >= farmZone.area.x[0] && item.area.x[1] <= farmZone.area.x[1], `${item.id} chỉ đi trong nông trại`);
  }
  // Cổng nối: hàng rào đông của khu thú cưng và hàng rào tây của nông trại cùng chừa lối ở z = 88.
  const gapAt = (fence, x, z) => !fence.some(([x0, z0, x1, z1]) => x0 === x && x1 === x && z >= Math.min(z0, z1) && z <= Math.max(z0, z1));
  assert.ok(gapAt(petZone.fence, petZone.area.x[1], 88) && gapAt(farmZone.fence, farmZone.area.x[0], 88));
  const broken = structuredClone(scene);
  broken.world.courtyard.animals.find((item) => item.type === 'goat').model = undefined;
  assert.ok(validateWorld(broken).errors.some((error) => error.includes('loại không hợp lệ')), 'thú nông trại phải có mô hình');
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
