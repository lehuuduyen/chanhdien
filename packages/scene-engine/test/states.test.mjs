// Điểm đặc trưng từng tiểu bang (KE_HOACH_BANG.md): dữ liệu bang, bộ đồ bang, điểm nhìn xa đặt ngoài sân / không lấn vào
// điện, đủ lớn để đứng xa thấy, trong ngân sách tam giác. Chạy trên Node bằng Three.js thật (không vẽ).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { US_STATES, thienThemeOf } from '@chanh-dien/room-rules';
import { resolveScene } from '../src/index.mjs';
import { STATE_SIDES, validateState } from '../src/world.mjs';
import { landmarkPoint } from '../src/landscape3d.mjs';
import { hallLayout } from '../src/temple3d-models.mjs';
import { kit as landmarkCommon } from '../src/landmarks/common.mjs';
import { kit as landscapeCommon } from '../src/landscape/common.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const STATE_DIR = path.join(ROOT, 'scenes/thien-default/states');
const KIT_DIR = path.join(ROOT, 'packages/scene-engine/src/landmarks');
const scene = resolveScene(JSON.parse(readFileSync(path.join(ROOT, 'scenes/thien-default/scene.json'), 'utf8')));
const ground = scene.world.courtyard.ground;
const hallBack = hallLayout(scene.world).back;
const stateFiles = existsSync(STATE_DIR) ? readdirSync(STATE_DIR).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)) : [];
const kitNames = readdirSync(KIT_DIR).filter((name) => name.endsWith('.mjs') && name !== 'common.mjs').map((name) => name.slice(0, -4));
const readState = (code) => JSON.parse(readFileSync(path.join(STATE_DIR, `${code}.json`), 'utf8'));
const loadKit = async (code) => (existsSync(path.join(KIT_DIR, `${code}.mjs`)) ? (await import(`../src/landmarks/${code}.mjs`)).kit : {});
const loadRegion = async (name) => (existsSync(path.join(ROOT, `packages/scene-engine/src/landscape/${name}.mjs`)) ? (await import(`../src/landscape/${name}.mjs`)).kit : {});

// Batch giả: ghi lại từng khối kèm hộp bao; env giả có đủ tiện ích của lớp bang (đèn đêm, chuyển động chỉ ghi lại).
function recorder() {
  const items = [];
  return {
    items,
    add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}) {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, order)), new THREE.Vector3(...scale));
      geometry.computeBoundingBox();
      items.push({ geometry, material, matrix, box: geometry.boundingBox.clone().applyMatrix4(matrix) });
    },
  };
}
const envFor = (extras) => ({
  m: new Proxy({}, { get: (cache, key) => (cache[key] ||= new THREE.MeshStandardMaterial()) }),
  material: () => new THREE.MeshStandardMaterial(),
  far: () => new THREE.MeshStandardMaterial(),
  ground,
  midZ: (ground.z[0] + ground.z[1]) / 2,
  colors: ['#777777', '#888888', '#999999'],
  theme: {},
  add: (object) => extras.objects.push(object),
  animate: (fn) => extras.animations.push(fn),
  nightGlow: () => extras.lights.push('glow'),
  nightPoints: () => extras.lights.push('points'),
  nightMesh: (geometry) => {
    extras.lights.push('mesh');
    return new THREE.Mesh(geometry);
  },
});
// Vật thêm riêng (env.add) có thể gồm nhiều phần rải rộng (đàn khinh khí cầu hai bên sân): xét từng đỉnh, không xét hộp
// bao. Trả đỉnh đầu tiên nằm trong sân / điện, hoặc null.
const inCourt = (x, z) => x > ground.x[0] && x < ground.x[1] && z > hallBack - 4 && z < ground.z[1];
function intruder(object) {
  object.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let found = null;
  object.traverse((child) => {
    if (found || !child.isMesh) return;
    const positions = child.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      if (inCourt(point.x, point.z)) {
        found = point.clone();
        return;
      }
    }
  });
  return found;
}
// Hình chiếu của một khối xuống mặt đất (bao lồi các đỉnh, [x, z]) có chạm sân / điện không (định lý trục tách). Dùng
// khi hộp bao chạm sân: khối dài xoay chéo (mặt cầu) có hộp bao rất rộng dù không đi qua sân.
function footprintHitsCourt({ geometry, matrix }) {
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  const points = [];
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
    points.push([point.x, point.z]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(points), ...half([...points].reverse())];
  const court = [[ground.x[0], hallBack - 4], [ground.x[1], hallBack - 4], [ground.x[1], ground.z[1]], [ground.x[0], ground.z[1]]];
  for (const polygon of [hull, court]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const axis = [b[1] - a[1], a[0] - b[0]];
      const span = (list) => list.reduce(([lo, hi], p) => {
        const v = p[0] * axis[0] + p[1] * axis[1];
        return [Math.min(lo, v), Math.max(hi, v)];
      }, [Infinity, -Infinity]);
      const [h0, h1] = span(hull);
      const [c0, c1] = span(court);
      if (h1 <= c0 || c1 <= h0) return false;
    }
  }
  return true;
}
const triangles = (items) => items.reduce((sum, item) => sum + (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3, 0);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('dữ liệu bang: hợp lệ, mã có trong US_STATES (không phải vn), có bộ đồ đi kèm, mọi kiểu có thật', async () => {
  const codes = US_STATES.map((state) => state.code).filter((code) => code !== 'vn');
  for (const code of stateFiles) {
    assert.ok(codes.includes(code), `states/${code}.json: mã bang lạ`);
    const state = readState(code);
    assert.deepEqual(validateState(code, state), [], `states/${code}.json`);
    assert.ok(kitNames.includes(code), `bang ${code} thiếu bộ đồ landmarks/${code}.mjs (ít nhất export const kit = {})`);
    const kit = await loadKit(code);
    const region = await loadRegion(thienThemeOf(code));
    for (const item of state.landmarks || []) {
      assert.ok(kit.landmarks?.[item.kind] || region.landmarks?.[item.kind] || landmarkCommon.landmarks[item.kind], `${code}: không có điểm đặc trưng ${item.kind}`);
    }
    for (const item of state.scatter || []) {
      const found = [kit.scatter, kit.trees, landmarkCommon.scatter, region.scatter, region.trees, landscapeCommon.scatter, landscapeCommon.trees].some((list) => list?.[item.kind]);
      assert.ok(found, `${code}: không có vật rải ${item.kind}`);
    }
  }
  for (const code of kitNames) assert.ok(stateFiles.includes(code), `landmarks/${code}.mjs chưa có states/${code}.json`);
  // Bắt lỗi khai báo sai.
  const errors = validateState('az', {
    landmarks: [{ kind: 'Grand Canyon', side: 'north', distance: 500 }], hide: ['trees'], clear: [{ side: 'gate' }], walk: {},
  });
  for (const text of ['landmark cần', 'hide', 'clear', 'khóa walk']) assert.ok(errors.some((error) => error.includes(text)), `thiếu lỗi ${text}: ${errors.join(' | ')}`);
  assert.ok(validateState('vn1', {}).length);
});

test('điểm nhìn xa từng bang: ngoài sân, không lấn vào điện, đủ cao để đứng xa thấy, trong ngân sách', async () => {
  for (const code of stateFiles) {
    const state = readState(code);
    const kit = await loadKit(code);
    const region = await loadRegion(thienThemeOf(code));
    const batch = recorder();
    const extras = { objects: [], animations: [], lights: [] };
    const env = envFor(extras);
    let tallest = 0;
    for (const [index, item] of (state.landmarks || []).entries()) {
      assert.ok(STATE_SIDES.includes(item.side));
      const build = kit.landmarks?.[item.kind] || region.landmarks?.[item.kind] || landmarkCommon.landmarks[item.kind];
      const [x, z] = landmarkPoint(ground, item);
      const start = batch.items.length;
      const added = extras.objects.length;
      const lit = extras.lights.length;
      build(batch, x, z, item.scale ?? 1, rand, env, { face: Math.atan2(-x, env.midZ - z), side: item.side, haze: item.haze ?? 0.4, params: item.params || {} });
      const objects = extras.objects.slice(added);
      const own = batch.items.slice(start);
      // Có thể chỉ có đèn đêm (cực quang).
      assert.ok(own.length || objects.length || extras.lights.length > lit, `${code}.landmarks[${index}] không dựng gì`);
      for (const object of objects) {
        const point = intruder(object);
        assert.ok(!point, `${code}.${item.kind} lấn vào sân / điện ở (${point?.x.toFixed(1)}, ${point?.z.toFixed(1)})`);
        tallest = Math.max(tallest, new THREE.Box3().setFromObject(object).max.y);
      }
      for (const piece of own) {
        const { box } = piece;
        const inside = box.max.x > ground.x[0] && box.min.x < ground.x[1] && box.max.z > hallBack - 4 && box.min.z < ground.z[1] && footprintHitsCourt(piece);
        assert.ok(!inside, `${code}.${item.kind} lấn vào sân / điện (${box.min.x.toFixed(1)}…${box.max.x.toFixed(1)}, ${box.min.z.toFixed(1)}…${box.max.z.toFixed(1)})`);
        tallest = Math.max(tallest, box.max.y);
      }
    }
    // "Đứng xa cũng thấy": điểm nhìn xa cao ít nhất 20 m (mặt biển, cánh đồng là phần phụ, đi kèm một vật cao).
    if (state.landmarks?.length) assert.ok(tallest >= 20, `${code}: điểm nhìn xa cao nhất ${tallest.toFixed(1)} m < 20 m`);
    const meshes = [];
    for (const object of extras.objects) object.traverse((child) => { if (child.isMesh) meshes.push({ geometry: child.geometry }); });
    const total = triangles(batch.items) + triangles(meshes);
    assert.ok(total <= 40_000, `${code}: ${Math.round(total)} tam giác > 40.000`);
    assert.ok(extras.animations.length <= 3, `${code}: tối đa 3 chuyển động`);
    // Chuyển động không đưa vật vào sân (thử vài thời điểm).
    for (const seconds of [0, 12.5, 47, 133]) {
      for (const step of extras.animations) step(seconds);
      for (const object of extras.objects) assert.ok(!intruder(object), `${code}: vật chuyển động lấn vào sân lúc ${seconds} giây`);
    }
  }
});

test('vị trí điểm nhìn xa theo phía: cổng / sau điện / đông / tây, cách tường đúng khoảng', () => {
  const midZ = (ground.z[0] + ground.z[1]) / 2;
  assert.deepEqual(landmarkPoint(ground, { side: 'gate', distance: 50, offset: 10 }), [10, ground.z[1] + 50]);
  assert.deepEqual(landmarkPoint(ground, { side: 'back', distance: 30 }), [0, ground.z[0] - 30]);
  assert.deepEqual(landmarkPoint(ground, { side: 'east', distance: 40, offset: -5 }), [ground.x[1] + 40, midZ - 5]);
  assert.deepEqual(landmarkPoint(ground, { side: 'west', distance: 40 }), [ground.x[0] - 40, midZ]);
});
