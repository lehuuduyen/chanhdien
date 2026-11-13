// Phong cảnh theo vùng (KE_HOACH_VUNG.md): bảng tiểu bang → vùng, dữ liệu từng vùng, bộ đồ dựng hình của từng vùng.
// Chạy trên Node bằng Three.js thật (không vẽ): kiểm tra kiểu nhắc tới có thật, hình dựng ra hợp lệ, chùa không chắn
// lối qua cửa điện / cổng tam quan, phần sát đất của cây không lấn ra ngoài vật cản đi lại của gốc cây.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { THIEN_THEMES, thienThemeOf, US_STATES } from '@chanh-dien/room-rules';
import { resolveScene } from '../src/index.mjs';
import { validateTheme } from '../src/world.mjs';
import { bandPoint } from '../src/landscape3d.mjs';
import { hallLayout } from '../src/temple3d-models.mjs';
import { kit as common } from '../src/landscape/common.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const THEME_DIR = path.join(ROOT, 'scenes/thien-default/themes');
const KIT_DIR = path.join(ROOT, 'packages/scene-engine/src/landscape');
const scene = resolveScene(JSON.parse(readFileSync(path.join(ROOT, 'scenes/thien-default/scene.json'), 'utf8')));
const courtyard = scene.world.courtyard;
const themeFiles = readdirSync(THEME_DIR).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
const kitNames = readdirSync(KIT_DIR).filter((name) => name.endsWith('.mjs') && name !== 'common.mjs').map((name) => name.slice(0, -4));
const readTheme = (name) => JSON.parse(readFileSync(path.join(THEME_DIR, `${name}.json`), 'utf8'));
const loadKit = async (name) => (existsSync(path.join(KIT_DIR, `${name}.mjs`)) ? (await import(`../src/landscape/${name}.mjs`)).kit : {});

// Batch giả: ghi lại từng khối kèm hộp bao trong toạ độ thế giới.
function recorder() {
  const items = [];
  return {
    items,
    add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
      geometry.computeBoundingBox();
      items.push({ geometry, material, matrix, box: geometry.boundingBox.clone().applyMatrix4(matrix) });
    },
  };
}
const envFor = (theme = {}) => ({
  m: new Proxy({}, { get: (cache, key) => (cache[key] ||= new THREE.MeshStandardMaterial()) }),
  material: () => new THREE.MeshStandardMaterial(),
  ground: courtyard.ground,
  midZ: (courtyard.ground.z[0] + courtyard.ground.z[1]) / 2,
  colors: theme.mountains?.colors || ['#777777', '#888888', '#999999'],
  theme,
});
const finiteBox = (box) => [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);

test('bảng tiểu bang → vùng: đủ 51 mã của Mỹ, mỗi mã đúng một vùng, Việt Nam có vùng riêng', () => {
  const seen = new Map();
  for (const [theme, states] of Object.entries(THIEN_THEMES)) {
    assert.match(theme, /^[a-z0-9-]{1,32}$/);
    for (const state of states) {
      assert.ok(!seen.has(state), `${state} thuộc hai vùng ${seen.get(state)} và ${theme}`);
      seen.set(state, theme);
      assert.equal(thienThemeOf(state), theme);
    }
  }
  const codes = US_STATES.map((state) => state.code);
  assert.deepEqual(codes.filter((code) => !seen.has(code)), [], 'mã chưa thuộc vùng nào');
  assert.deepEqual([...seen.keys()].filter((code) => !codes.includes(code)), [], 'mã lạ');
  assert.equal(codes.filter((code) => code !== 'vn').length, 51);
  assert.equal(thienThemeOf('vn'), 'vietnam');
  assert.equal(thienThemeOf('xx'), 'default');
  assert.equal(scene.world.courtyard.themes, undefined, 'dữ liệu vùng nằm ở themes/<vùng>.json, không trong scene.json');
});

test('dữ liệu vùng: hợp lệ, tên có trong bảng vùng, mọi kiểu nhắc tới có trong bộ đồ của vùng hoặc bộ đồ chung', async () => {
  assert.ok(themeFiles.length >= 2);
  for (const name of themeFiles) {
    const theme = readTheme(name);
    assert.deepEqual(validateTheme(name, theme), [], `themes/${name}.json`);
    assert.ok(THIEN_THEMES[name], `vùng ${name} chưa có trong THIEN_THEMES`);
    assert.ok(kitNames.includes(name), `vùng ${name} thiếu bộ đồ landscape/${name}.mjs (ít nhất export const kit = {})`);
    const kit = await loadKit(name);
    const has = (sections, kind) => sections.some((section) => kit[section]?.[kind] || common[section]?.[kind]);
    for (const key of ['trees', 'pines']) if (theme[key]) assert.ok(has(['trees'], theme[key]), `${name}: không có cây ${theme[key]}`);
    for (const item of theme.scatter || []) assert.ok(has(['scatter', 'trees'], item.kind), `${name}: không có vật rải ${item.kind}`);
    if (theme.mountains) assert.ok(has(['mountains'], theme.mountains.shape), `${name}: không có núi ${theme.mountains.shape}`);
    for (const kind of [theme.field, theme.lawn?.surface]) {
      if (kind && kind !== 'grass') assert.ok(has(['grounds'], kind), `${name}: không có đất ${kind}`);
    }
  }
  // Bắt lỗi khai báo sai.
  const broken = {
    ...readTheme('desert'), field: 'Lava!', colors: { roof: 'red', door: '#ffffff' }, walk: {}, treeScale: 9,
    scatter: [{ kind: 'rock', count: 500 }, { kind: 'shrub', count: 5, band: [20, 10] }],
  };
  const errors = validateTheme('desert', broken);
  for (const text of ['field', 'colors.roof', 'colors.door', 'khóa walk', 'treeScale', 'scatter cần', 'scatter.band']) {
    assert.ok(errors.some((error) => error.includes(text)), `thiếu lỗi ${text}: ${errors.join(' | ')}`);
  }
  assert.ok(validateTheme('default', {}).length, '"default" là cảnh gốc, không được làm tên vùng');
});

test('bộ đồ mỗi vùng: export kit, có dữ liệu vùng đi kèm, cây / vật rải / núi dựng ra khối hợp lệ', async () => {
  for (const name of kitNames) {
    const kit = await loadKit(name);
    assert.ok(kit && typeof kit === 'object', `landscape/${name}.mjs phải export kit`);
    assert.ok(themeFiles.includes(name), `landscape/${name}.mjs chưa có themes/${name}.json`);
  }
  for (const [name, kit] of [['common', common], ...await Promise.all(kitNames.map(async (item) => [item, await loadKit(item)]))]) {
    for (const section of ['trees', 'scatter']) {
      for (const [kind, build] of Object.entries(kit[section] || {})) {
        const batch = recorder();
        let seed = 1;
        build(batch, 60, 120, 1, () => ((seed = (seed * 16807) % 2147483647) / 2147483647), envFor());
        assert.ok(batch.items.length, `${name}.${section}.${kind} không dựng gì`);
        for (const item of batch.items) {
          assert.ok(item.geometry.attributes.position.count > 0 && finiteBox(item.box), `${name}.${section}.${kind}: khối lỗi`);
          assert.ok(item.box.min.y > -3 && item.box.max.y < 40, `${name}.${section}.${kind}: cao bất thường`);
          assert.ok(Math.hypot(item.box.getCenter(new THREE.Vector3()).x - 60, item.box.getCenter(new THREE.Vector3()).z - 120) < 12, `${name}.${section}.${kind}: dựng xa gốc`);
        }
      }
    }
    for (const [shape, build] of Object.entries(kit.mountains || {})) {
      const batch = recorder();
      build(batch, envFor());
      assert.ok(batch.items.length && batch.items.every((item) => finiteBox(item.box)), `${name}.mountains.${shape}`);
      // Núi ở ngoài sân (sau cổng / hai bên / sau lưng chánh điện cách ít nhất 4 m), không mọc giữa sân hay lấn vào điện.
      const g = courtyard.ground;
      const hallBack = hallLayout(scene.world).back;
      const outside = (item) => item.box.min.z > g.z[1] || item.box.max.x < g.x[0] || item.box.min.x > g.x[1] || item.box.max.z < hallBack - 4;
      assert.ok(batch.items.every(outside), `${name}.mountains.${shape} lấn vào sân`);
      // Không lấn lên lối / Đài ngắm cảnh ngoài cổng hay Rừng thiền ngoài cổng tây (khối nhô trong tầm người đi
      // 0,25–4,5 m, lấy mẫu từng tam giác).
      const rects = [
        ...(courtyard.overlook ? [courtyard.overlook.path, courtyard.overlook.terrace] : []),
        ...(courtyard.grove ? [courtyard.grove.area] : []),
      ];
      const onDeck = (item) => {
        const positions = item.geometry.attributes.position;
        const point = new THREE.Vector3();
        for (let index = 0; index < positions.count; index += 1) {
          point.fromBufferAttribute(positions, index).applyMatrix4(item.matrix);
          if (point.y > 0.25 && point.y < 4.5 && rects.some((rect) => point.x > rect.x[0] - 1 && point.x < rect.x[1] + 1 && point.z > rect.z[0] - 1 && point.z < rect.z[1] + 1)) return true;
        }
        return false;
      };
      assert.ok(!batch.items.some(onDeck), `${name}.mountains.${shape} lấn lên Đài ngắm cảnh / Rừng thiền`);
    }
  }
});

test('vật rải có band chỉ nằm trong dải cách tường sân [gần, xa] mét, đủ bốn phía', () => {
  const ground = courtyard.ground;
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sides = new Set();
  for (let index = 0; index < 2000; index += 1) {
    const [x, z] = bandPoint(ground, [6, 15], rand);
    const dx = Math.max(ground.x[0] - x, 0, x - ground.x[1]);
    const dz = Math.max(ground.z[0] - z, 0, z - ground.z[1]);
    const distance = Math.hypot(dx, dz);
    assert.ok(distance >= 6 - 1e-9 && distance <= 15 + 1e-9, `(${x}, ${z}) cách tường ${distance}`);
    sides.add(x > ground.x[1] ? 'đông' : x < ground.x[0] ? 'tây' : z > ground.z[1] ? 'cổng' : 'sau');
  }
  assert.equal(sides.size, 4);
});

test('chùa nhìn từ ngoài của mọi vùng: không chắn lối qua cửa điện và các cửa cổng tam quan', async () => {
  const hall = hallLayout(scene.world);
  const door = courtyard.door;
  const frontZ = courtyard.ground.z[0];
  const corridors = [
    // Cửa giữa chánh điện và thềm trước cửa.
    { name: 'cửa điện', box: new THREE.Box3(new THREE.Vector3(-door.width / 2 + 0.4, 0.2, frontZ - 1), new THREE.Vector3(door.width / 2 - 0.4, door.height - 0.3, frontZ + 3)) },
    // Lối qua từng cửa cổng tam quan (thấp hơn chân vòm).
    ...(courtyard.gate?.openings || []).map((opening) => ({
      name: `cổng x=${opening.x}`,
      box: new THREE.Box3(new THREE.Vector3(opening.x - opening.width / 2 + 0.3, 0.2, courtyard.gate.z - 1), new THREE.Vector3(opening.x + opening.width / 2 - 0.3, 1.8, courtyard.gate.z + 1)),
    })),
  ];
  for (const name of ['common', ...kitNames]) {
    const kit = name === 'common' ? common : await loadKit(name);
    if (!kit.temple) continue;
    const theme = themeFiles.includes(name) ? readTheme(name) : {};
    const batch = recorder();
    const meshes = [];
    kit.temple({
      batch, m: envFor(theme).m, data: courtyard, env: envFor(theme), hall, door, params: theme.temple || {},
      textBoard: () => null, add: (mesh) => meshes.push(mesh), own: (material) => material, glow: () => {},
    });
    assert.ok(batch.items.length > 20, `${name}: chùa quá ít khối`);
    const boxes = [...batch.items.map((item) => item.box), ...meshes.map((mesh) => new THREE.Box3().setFromObject(mesh))];
    for (const { name: where, box } of corridors) {
      const blocking = boxes.filter((item) => item.intersectsBox(box));
      assert.equal(blocking.length, 0, `${name}: có khối chắn ${where}: ${blocking.map((item) => JSON.stringify(item)).slice(0, 2).join(' ')}`);
    }
  }
});

test('cây trong sân của mọi vùng: phần sát đất (dưới 1 m) không lấn quá vật cản đi lại của gốc cây 0,6 m', async () => {
  const obstacles = scene.world.walk.obstacles.filter((item) => Number.isFinite(item.r));
  const radiusAt = (x, z) => obstacles.find((item) => Math.hypot(item.x - x, item.z - z) < 0.05)?.r;
  for (const name of ['default', ...themeFiles]) {
    const theme = name === 'default' ? {} : readTheme(name);
    const kit = name === 'default' ? {} : await loadKit(name);
    const slots = [
      [kit.trees?.[theme.trees || 'banyan'] || common.trees[theme.trees || 'banyan'], (courtyard.trees || []).map((tree) => [tree.x, tree.z, (tree.size || 1) * (theme.treeScale || 1)])],
      [kit.trees?.[theme.pines || 'pine'] || common.trees[theme.pines || 'pine'], (courtyard.pines || []).map(([x, z]) => [x, z, 1])],
    ];
    for (const [build, positions] of slots) {
      for (const [x, z, size] of positions) {
        const limit = radiusAt(x, z);
        assert.ok(Number.isFinite(limit), `không thấy vật cản của cây ở (${x}, ${z})`);
        const batch = recorder();
        let seed = 7;
        build(batch, x, z, size, () => ((seed = (seed * 16807) % 2147483647) / 2147483647), envFor(theme));
        let farthest = 0;
        const point = new THREE.Vector3();
        for (const item of batch.items) {
          const positionsAttr = item.geometry.attributes.position;
          for (let index = 0; index < positionsAttr.count; index += 1) {
            point.fromBufferAttribute(positionsAttr, index).applyMatrix4(item.matrix);
            if (point.y < 1) farthest = Math.max(farthest, Math.hypot(point.x - x, point.z - z));
          }
        }
        assert.ok(farthest <= limit + 0.6, `${name}: cây ở (${x}, ${z}) sát đất rộng ${farthest.toFixed(2)} m, vật cản ${limit} m`);
      }
    }
  }
});
