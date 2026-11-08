// Chó mèo trong vườn chùa: dựng bằng khối, mỗi loài gộp thành ba InstancedMesh (thân + đầu, chân, đuôi) nên cả đàn chỉ
// tốn vài lệnh vẽ. Mỗi con đi lang thang trong vùng của mình (area), tránh vật cản theo world.walk, lúc đứng vẫy đuôi,
// lúc nằm nghỉ. Chạy riêng trên từng máy (không đồng bộ qua server); hạt ngẫu nhiên cố định nên ai cũng thấy gần giống.
//
// world.courtyard.animals: [{ id, name, type: 'dog' | 'cat', color, x, z, area: { x: [min, max], z: [min, max] } }]
// Thú có mô hình riêng thêm { model: '/models/pets/<tên>.glb', height, modelRy? }: file tĩnh (không khung xương) tải sau,
// đi lại bằng cùng bộ não với thú khối; dáng đi làm bằng code (nảy, lắc mình, cúi ăn, nằm nghỉ).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { isWalkable } from './walk.mjs';

// Gộp các khối thành một geometry có màu đỉnh (màu lông lấy từ instanceColor nhân vào; mắt, mũi giữ màu tối).
function merge(parts) {
  return BufferGeometryUtils.mergeGeometries(parts.map(({ geometry, shade = 1, tone = null, at = [0, 0, 0], scale = [1, 1, 1], rotate = [0, 0, 0] }) => {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(plain.attributes)) if (!['position', 'normal'].includes(name)) plain.deleteAttribute(name);
    plain.scale(...scale);
    plain.rotateX(rotate[0]);
    plain.rotateY(rotate[1]);
    plain.rotateZ(rotate[2]);
    plain.translate(...at);
    const color = tone ? new THREE.Color(tone) : new THREE.Color(shade, shade, shade);
    const colors = new Float32Array(plain.attributes.position.count * 3);
    for (let index = 0; index < colors.length; index += 3) colors.set([color.r, color.g, color.b], index);
    plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return plain;
  }));
}

// Kích thước theo mét; đầu hướng +z, gốc ở mặt đất giữa thân.
const SPECIES = {
  dog: {
    walkSpeed: 1.2, runSpeed: 2.6, legLength: 0.3, wag: 14, radius: 0.35, turnRate: 3, graze: 0.7, legTop: 0.38, neck: [0.5, 0.18],
    hips: [[-0.09, 0.32, 0.2], [0.09, 0.32, 0.2], [-0.09, 0.32, -0.2], [0.09, 0.32, -0.2]],
    tailBase: [0, 0.48, -0.3], tailTilt: 0.9,
    body: () => merge([
      { geometry: new THREE.CapsuleGeometry(0.15, 0.42, 4, 10), at: [0, 0.42, 0], rotate: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.SphereGeometry(0.13, 14, 10), at: [0, 0.6, 0.36] },
      { geometry: new THREE.SphereGeometry(1, 10, 8), scale: [0.07, 0.06, 0.1], at: [0, 0.56, 0.47] },
      { geometry: new THREE.SphereGeometry(0.026, 8, 6), tone: '#1a1412', at: [0, 0.575, 0.565] },
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(0.019, 8, 6), tone: '#120d0b', at: [side * 0.055, 0.64, 0.465] })),
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(1, 8, 6), shade: 0.72, scale: [0.035, 0.09, 0.06], at: [side * 0.115, 0.62, 0.32], rotate: [0, 0, side * 0.35] })),
    ]),
    leg: () => merge([{ geometry: new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), at: [0, -0.15, 0] }, { geometry: new THREE.SphereGeometry(0.05, 8, 6), shade: 0.9, scale: [1, 0.6, 1.3], at: [0, -0.29, 0.02] }]),
    tail: () => merge([{ geometry: new THREE.CylinderGeometry(0.018, 0.03, 0.3, 6), at: [0, 0.15, 0] }]),
  },
  cat: {
    walkSpeed: 0.7, runSpeed: 1.8, legLength: 0.2, wag: 2.5, radius: 0.25, turnRate: 3.2, graze: 0.45, legTop: 0.3, neck: [0.5, 0.2],
    hips: [[-0.05, 0.2, 0.13], [0.05, 0.2, 0.13], [-0.05, 0.2, -0.13], [0.05, 0.2, -0.13]],
    tailBase: [0, 0.27, -0.2], tailTilt: 0.35,
    body: () => merge([
      { geometry: new THREE.CapsuleGeometry(0.085, 0.28, 4, 10), at: [0, 0.26, 0], rotate: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.SphereGeometry(0.09, 14, 10), scale: [1.1, 1, 1], at: [0, 0.37, 0.23] },
      { geometry: new THREE.SphereGeometry(0.014, 6, 5), tone: '#d98a8a', at: [0, 0.36, 0.32] },
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(0.016, 8, 6), tone: '#5f7a2a', at: [side * 0.038, 0.39, 0.305] })),
      ...[-1, 1].map((side) => ({ geometry: new THREE.ConeGeometry(0.035, 0.08, 4), at: [side * 0.05, 0.46, 0.22], rotate: [0, 0, side * -0.25] })),
    ]),
    leg: () => merge([{ geometry: new THREE.CylinderGeometry(0.026, 0.024, 0.2, 7), at: [0, -0.1, 0] }]),
    tail: () => merge([{ geometry: new THREE.CylinderGeometry(0.012, 0.018, 0.36, 6), at: [0, 0.18, 0] }]),
  },
};

// Thú Nông trại nhỏ: chỉ có mô hình riêng (Meshy), nên chỉ cần thông số đi lại. gait: hop = nhảy cóc (thỏ),
// waddle = lạch bạch (vịt), còn lại đi bằng bốn chân.
// Thông số dáng cho mọi loài: turnRate = tốc độ quay tối đa (rad/s); graze = góc cúi đầu khi gặm cỏ / đánh hơi (0 = không);
// legTop = độ cao hông theo tỉ lệ chiều cao mô hình (phần dưới là chân, bước theo dáng đi); neck = [cao, trước] của cổ
// (tỉ lệ chiều cao / chiều dài, tính từ giữa thân): phần trước-trên cổ là đầu, cúi / ngoảnh quanh điểm đó.
Object.assign(SPECIES, {
  rabbit: { walkSpeed: 0.8, runSpeed: 2.3, legLength: 0.12, radius: 0.22, gait: 'hop', turnRate: 4, graze: 0.35, legTop: 0.22, neck: [0.5, 0.05] },
  duck: { walkSpeed: 0.45, runSpeed: 1.1, legLength: 0.1, radius: 0.22, gait: 'waddle', turnRate: 2.4, graze: 1.1, legTop: 0.13, neck: [0.45, 0.05] },
  goat: { walkSpeed: 0.9, runSpeed: 2.2, legLength: 0.32, radius: 0.35, turnRate: 2.6, graze: 1, legTop: 0.42, neck: [0.5, 0.18] },
  pig: { walkSpeed: 0.7, runSpeed: 1.8, legLength: 0.18, radius: 0.32, turnRate: 2.2, graze: 0.4, legTop: 0.3, neck: [0.45, 0.18] },
  deer: { walkSpeed: 1.0, runSpeed: 2.8, legLength: 0.45, radius: 0.42, turnRate: 2.2, graze: 1.1, legTop: 0.48, neck: [0.5, 0.12] },
  pony: { walkSpeed: 1.1, runSpeed: 3.0, legLength: 0.55, radius: 0.55, turnRate: 2, graze: 1.1, legTop: 0.42, neck: [0.5, 0.2] },
});

// Thức ăn hiện ra khi bấm Cho ăn: màu, hình (cone = cà rốt, grain = hạt, hay = nắm cỏ) và có bát hay không.
const FOOD = {
  dog: { color: '#7a4b2a', shape: 'grain', bowl: true },
  cat: { color: '#c7774a', shape: 'grain', bowl: true },
  rabbit: { color: '#f08a24', shape: 'cone' },
  duck: { color: '#e8c35a', shape: 'grain' },
  goat: { color: '#9cbc4a', shape: 'hay' },
  pig: { color: '#f2c230', shape: 'grain', bowl: true },
  deer: { color: '#c9a36a', shape: 'grain' },
  pony: { color: '#d9483b', shape: 'apple' },
};

// Làm trò (action 'trick', 2,6 giây): mỗi loài một kiểu. progress 0…1 → { y, rx, ry, rz } cộng thêm vào dáng.
export const TRICK_SECONDS = 2.6;
export function trickPose(type, progress) {
  const wave = Math.sin(progress * Math.PI);
  switch (type) {
    // Thỏ nhảy tưng (binky): ba cú nhảy cao, xoay người giữa không trung.
    case 'rabbit': return { y: Math.abs(Math.sin(progress * Math.PI * 3)) * 0.38, rx: 0, ry: Math.sin(progress * Math.PI * 3) * 0.5, rz: 0 };
    // Vịt vỗ cánh: lắc người nhanh, nhún nhẹ.
    case 'duck': return { y: Math.abs(Math.sin(progress * Math.PI * 6)) * 0.06, rx: 0, ry: 0, rz: Math.sin(progress * Math.PI * 12) * 0.25 };
    // Dê đứng hai chân sau rồi nhảy.
    case 'goat': return { y: wave * 0.15, rx: -wave * 0.55, ry: 0, rz: 0 };
    // Heo lăn một vòng.
    case 'pig': return { y: wave * 0.12, rx: 0, ry: 0, rz: progress * Math.PI * 2 };
    // Nai cúi chào hai lần (như nai ở chùa Nara).
    case 'deer': return { y: 0, rx: Math.max(0, Math.sin(progress * Math.PI * 2)) * 0.5, ry: 0, rz: 0 };
    // Ngựa chồm hai chân trước.
    case 'pony': return { y: wave * 0.2, rx: -wave * 0.6, ry: 0, rz: 0 };
    // Mèo lăn tròn, chó quay vòng đuổi đuôi.
    case 'cat': return { y: 0, rx: 0, ry: 0, rz: wave * Math.PI };
    default: return { y: Math.abs(Math.sin(progress * Math.PI * 2)) * 0.08, rx: 0, ry: progress * Math.PI * 4, rz: 0 };
  }
}

let loader = null;
const modelCache = new Map();
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

function loadAnimalModel(src) {
  if (!modelCache.has(src)) modelCache.set(src, gltfLoader().loadAsync(src));
  return modelCache.get(src);
}

// Mô hình thú là file tĩnh (không khung xương). Để chân bước thật, hình được "nướng" về hệ tọa độ của con thú (đáy y = 0,
// giữa thân ở gốc, đầu hướng +z) và mỗi đỉnh mang hai trọng số:
//   aLeg  — phần chân: 0 ở hông, ±1 ở bàn chân; dấu = nhóm chân (bốn chân: chéo nhau như chó / ngựa đi nước kiệu,
//           thỏ: trước / sau, vịt: trái / phải). Shader đưa chân tới lui theo pha bước, nhấc bàn chân lúc đưa về trước.
//   aHead — phần đầu và cổ (trước-trên điểm cổ): cúi (gặm cỏ, đánh hơi) và ngoảnh (nhìn quanh) quanh điểm cổ.
// Cùng file + loài dùng chung hình đã nướng (hai chú thỏ, hai chú vịt).
const bakedCache = new Map();
const smooth = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function bakeAnimal(gltf, item, spec) {
  const key = `${item.model}|${item.modelRy || 0}|${item.type}`;
  if (bakedCache.has(key)) return bakedCache.get(key);
  const model = gltf.scene;
  model.rotation.y = item.modelRy || 0;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  const legTop = size.y * spec.legTop;
  const pivot = new THREE.Vector3(0, size.y * spec.neck[0], size.z * spec.neck[1]);
  const parts = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    // Tọa độ nén meshopt là số nguyên chuẩn hóa: đổi sang số thực rồi mới gộp biến đổi (xem props3d.mjs).
    for (const name of ['position', 'normal']) {
      const attribute = geometry.getAttribute(name);
      if (!attribute || (attribute.array instanceof Float32Array && !attribute.normalized)) continue;
      const values = new Float32Array(attribute.count * 3);
      for (let index = 0; index < attribute.count; index += 1) {
        values[index * 3] = attribute.getX(index);
        values[index * 3 + 1] = attribute.getY(index);
        values[index * 3 + 2] = attribute.getZ(index);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(offset, node.matrixWorld));
    const positions = geometry.getAttribute('position');
    const legs = new Float32Array(positions.count);
    const heads = new Float32Array(positions.count);
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      // Nhóm chân đổi dấu mượt qua giữa thân (không xé hình ở đường giữa).
      const side = Math.max(-1, Math.min(1, x / (size.x * 0.1)));
      const end = Math.max(-1, Math.min(1, z / (size.z * 0.1)));
      const group = spec.gait === 'waddle' ? side : spec.gait === 'hop' ? end : side * end;
      legs[index] = y < legTop ? ((legTop - y) / legTop) * group : 0;
      // Trọng số tăng dần dọc cổ nên cổ cong xuống chứ không gãy ở một chỗ. Phần cao hẳn trên lưng (sừng, tai ngả ra
      // sau) thuộc về đầu dù lùi sau điểm cổ, không thì bị kéo giãn khi cúi.
      const back = smooth(pivot.y + size.y * 0.2, pivot.y + size.y * 0.35, y) * size.z * 0.25;
      heads[index] = smooth(pivot.z - size.z * 0.05 - back, pivot.z + size.z * 0.16 - back, z) * smooth(pivot.y - size.y * 0.15, pivot.y + size.y * 0.08, y);
    }
    geometry.setAttribute('aLeg', new THREE.BufferAttribute(legs, 1));
    geometry.setAttribute('aHead', new THREE.BufferAttribute(heads, 1));
    // Chân / đầu xê dịch trong shader: nới khung bao để không bị cắt theo khung nhìn khi đang bước / cúi.
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius *= 1.4;
    parts.push({ geometry, material: node.material });
  });
  const baked = { parts, size, legTop, pivot };
  bakedCache.set(key, baked);
  return baked;
}

// Uniform dáng của một con (chung cho vật liệu màu và vật liệu bóng): gait = pha bước, stride / lift = biên độ đưa chân /
// nhấc chân, fold = gập chân khi nằm (0…0,8), pitch / yaw = cúi / ngoảnh đầu (rad). Đơn vị theo hình gốc (trước khi co giãn).
function poseUniforms(baked) {
  return {
    uGait: { value: 0 }, uStride: { value: 0 }, uLift: { value: 0 }, uFold: { value: 0 },
    uPitch: { value: 0 }, uYaw: { value: 0 },
    uLegTop: { value: baked.legTop }, uPivot: { value: baked.pivot },
  };
}

function withPose(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uGait, uStride, uLift, uFold, uPitch, uYaw, uLegTop;
uniform vec3 uPivot;
attribute float aLeg;
attribute float aHead;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.z -= uStride * aLeg * sin(uGait);
transformed.y += uLift * abs(aLeg) * max(0.0, -sign(aLeg) * cos(uGait));
if (aHead > 0.0) {
  vec3 d = transformed - uPivot;
  float cp = cos(uPitch), sp = sin(uPitch);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  transformed = mix(transformed, uPivot + d, aHead);
}
transformed.y = transformed.y < uLegTop ? transformed.y * (1.0 - uFold) : transformed.y - uFold * uLegTop;`);
  };
  material.customProgramCacheKey = () => 'animal-pose';
  return material;
}

export function buildAnimals({ root, animals, walk }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const herds = [];
  const solos = [];
  const pickables = [];
  const byId = new Map();
  const effects = [];
  const newAnimal = (item, index, type) => {
    let seed = Math.floor(Math.abs(item.x * 131 + item.z * 977)) + index * 7919 + 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return {
      id: item.id, name: item.name, type,
      x: item.x, z: item.z, heading: index * 1.3, area: item.area, mode: 'idle', timer: 1 + index, target: null,
      // velocity: tốc độ hiện tại (tăng / giảm dần, không giật); pace: mỗi con nhanh chậm một chút.
      speed: SPECIES[type].walkSpeed, velocity: 0, pace: 0.85 + random() * 0.3, gait: 0, lower: 0, reaction: null,
      // Đầu: góc cúi / ngoảnh hiện tại và đích (đổi dần), nhịp nhai / nhìn quanh.
      pitch: 0, yaw: 0, pitchTarget: 0, yawTarget: 0, glance: 0,
      random,
    };
  };
  for (const [type, spec] of Object.entries(SPECIES)) {
    const members = animals.filter((item) => item.type === type && !item.model);
    if (!members.length) continue;
    const meshes = {
      body: new THREE.InstancedMesh(spec.body(), material, members.length),
      leg: new THREE.InstancedMesh(spec.leg(), material, members.length * 4),
      tail: new THREE.InstancedMesh(spec.tail(), material, members.length),
    };
    for (const mesh of Object.values(meshes)) {
      // Các con đi khắp vườn: khung bao tính một lần sẽ sai, nên không cắt theo khung nhìn.
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      root.add(mesh);
    }
    // Raycaster của chế độ nhập vai chỉ cần thân; instanceId ánh xạ về đúng mã thú trong đàn này.
    meshes.body.userData.petIds = members.map((item) => item.id);
    const herd = { spec, meshes, members: [] };
    members.forEach((item, index) => {
      const coat = new THREE.Color(item.color || '#a0784a');
      meshes.body.setColorAt(index, coat);
      meshes.tail.setColorAt(index, coat);
      for (let leg = 0; leg < 4; leg += 1) meshes.leg.setColorAt(index * 4 + leg, coat);
      const animal = newAnimal(item, index, type);
      herd.members.push(animal);
      byId.set(item.id, animal);
    });
    for (const mesh of Object.values(meshes)) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    herds.push(herd);
    pickables.push(meshes.body);
  }
  // Thú có mô hình riêng: giữ nhóm rỗng và chỉ tải khi camera đến gần. Các con dùng chung một file (thỏ, vịt…)
  // dùng chung Promise/cache để không tải và giải mã GLB nhiều lần.
  animals.filter((item) => item.model && SPECIES[item.type]).forEach((item, index) => {
    const animal = newAnimal(item, index + 3, item.type);
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.visible = false;
    root.add(group);
    const solo = {
      spec: SPECIES[item.type], animal, group,
      loadDistance: Math.max(1, Number(item.lazyDistance) || 30),
      loadState: 'idle',
      load: null,
    };
    solos.push(solo);
    byId.set(item.id, animal);
    solo.load = () => {
      if (solo.loadState !== 'idle') return;
      solo.loadState = 'loading';
      loadAnimalModel(item.model).then((gltf) => {
        const baked = bakeAnimal(gltf, item, solo.spec);
        const scale = item.height / Math.max(1e-6, baked.size.y);
        const inner = new THREE.Group();
        inner.scale.setScalar(scale);
        // Mỗi con một bộ uniform (vật liệu nhân bản, chương trình shader dùng chung); bóng đổ dùng vật liệu độ sâu cùng dáng.
        solo.uniforms = poseUniforms(baked);
        solo.scale = scale;
        const depth = withPose(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), solo.uniforms);
        for (const { geometry, material } of baked.parts) {
          const mesh = new THREE.Mesh(geometry, withPose(material.clone(), solo.uniforms));
          mesh.customDepthMaterial = depth;
          mesh.castShadow = true;
          mesh.userData.petId = item.id;
          pickables.push(mesh);
          inner.add(mesh);
        }
        group.add(inner);
        group.visible = true;
        solo.loadState = 'loaded';
      }).catch((error) => {
        solo.loadState = 'failed';
        console.warn(`Không tải được mô hình thú ${item.id}: ${error.message}`);
      });
    };
  });

  const free = (x, z, spec, area) => x >= area.x[0] && x <= area.x[1] && z >= area.z[0] && z <= area.z[1]
    && isWalkable({ ...walk, radius: spec.radius }, x, z);
  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const unit = new THREE.Vector3(1, 1, 1);

  function startWalk(animal, spec, x, z, run, timer) {
    animal.target = { x, z };
    animal.mode = 'walk';
    animal.speed = (run ? spec.runSpeed : spec.walkSpeed) * animal.pace;
    animal.timer = timer;
  }

  function playTarget(animal, spec) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = animal.random() * Math.PI * 2;
      const reach = 1.4 + animal.random() * 2.6;
      const x = animal.x + Math.sin(angle) * reach;
      const z = animal.z + Math.cos(angle) * reach;
      if (!free(x, z, spec, animal.area)) continue;
      startWalk(animal, spec, x, z, true, 5);
      return true;
    }
    return false;
  }

  // Chỗ tới mới: thú thật hay đi tiếp theo hướng đang đi (lệch trái / phải ít nhiều), ít khi quay ngoắt lại;
  // không có chỗ phía trước thì thử mọi hướng.
  function wander(animal, spec) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = attempt < 6 ? animal.heading + (animal.random() - 0.5) * 2.2 : animal.random() * Math.PI * 2;
      const reach = 1.5 + animal.random() * 6;
      const x = animal.x + Math.sin(angle) * reach;
      const z = animal.z + Math.cos(angle) * reach;
      if (!free(x, z, spec, animal.area)) continue;
      startWalk(animal, spec, x, z, animal.random() < 0.12, 14);
      return true;
    }
    return false;
  }

  // Tới nơi thì dừng làm một việc: gặm cỏ / đánh hơi (cúi đầu), nhìn quanh, nằm nghỉ, hoặc đứng yên.
  function settle(animal, spec) {
    const roll = animal.random();
    if (roll < 0.15) {
      animal.mode = 'rest';
      animal.timer = 10 + animal.random() * 14;
    } else if (roll < 0.55 && spec.graze) {
      animal.mode = 'graze';
      animal.timer = 4 + animal.random() * 8;
    } else if (roll < 0.8) {
      animal.mode = 'look';
      animal.timer = 2.5 + animal.random() * 4;
    } else {
      animal.mode = 'idle';
      animal.timer = 1.5 + animal.random() * 3;
    }
    animal.glance = 0;
  }

  const ease = (value, target, rate, dt) => value + (target - value) * Math.min(1, dt * rate);

  function think(animal, spec, dt) {
    if (animal.reaction) {
      animal.reaction.left -= dt;
      if (animal.reaction.left <= 0) animal.reaction = null;
      else if (animal.reaction.action !== 'play') {
        animal.mode = 'idle';
        animal.timer = Math.max(animal.timer, 0.4);
        animal.velocity = ease(animal.velocity, 0, 6, dt);
        // Ăn: cúi xuống bát; được vuốt ve: ngẩng lên, nghiêng đầu; làm trò: đầu thẳng.
        const action = animal.reaction.action;
        animal.pitchTarget = action === 'feed' ? Math.max(0.35, spec.graze || 0.35) * (0.9 + Math.sin(animal.reaction.left * 9) * 0.1)
          : action === 'pet' ? -0.18 : 0;
        animal.yawTarget = action === 'pet' ? Math.sin(animal.reaction.left * 2.5) * 0.3 : 0;
        animal.pitch = ease(animal.pitch, animal.pitchTarget, 5, dt);
        animal.yaw = ease(animal.yaw, animal.yawTarget, 5, dt);
        return;
      } else if (animal.mode !== 'walk' && !playTarget(animal, spec)) return;
    }
    animal.timer -= dt;
    if (animal.mode === 'walk') {
      const dx = animal.target.x - animal.x;
      const dz = animal.target.z - animal.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.25 || animal.timer <= 0) {
        animal.velocity = 0;
        settle(animal, spec);
        return;
      }
      let turn = Math.atan2(dx, dz) - animal.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      // Quay có giới hạn tốc độ (rẽ thành đường cong, không xoay tại chỗ như kim la bàn).
      const running = animal.speed > spec.walkSpeed * 1.3;
      const maxTurn = spec.turnRate * (running ? 1.3 : 1) * dt;
      animal.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
      // Rẽ gắt thì đi chậm lại; gần tới thì giảm tốc rồi dừng hẳn; tăng / giảm tốc dần.
      const facing = Math.max(0.15, Math.min(1, (Math.cos(turn) + 0.3) / 1.3));
      const wanted = Math.min(animal.speed * facing, 0.15 + distance * 1.4);
      const accel = running ? 3 : 1.6;
      animal.velocity += Math.max(-3.5 * dt, Math.min(accel * dt, wanted - animal.velocity));
      const step = Math.min(distance, animal.velocity * dt);
      const nextX = animal.x + Math.sin(animal.heading) * step;
      const nextZ = animal.z + Math.cos(animal.heading) * step;
      if (free(nextX, nextZ, spec, animal.area)) {
        animal.x = nextX;
        animal.z = nextZ;
        // Pha bước theo quãng đường: mỗi vòng bước = 2π × bán kính sải (sải dài hơn khi chạy), nên chân không trượt.
        animal.gait += step / (spec.legLength * (running ? 0.75 : 0.5));
      } else {
        // Vướng: dừng, nhìn quanh một chút rồi chọn đường khác.
        animal.velocity = 0;
        animal.mode = 'look';
        animal.timer = 0.8 + animal.random() * 1.2;
        animal.glance = 0;
      }
      // Đi thì đầu hơi ngoảnh theo hướng rẽ; thỉnh thoảng cúi đánh hơi (chó) / mổ (vịt) khi đi chậm.
      animal.yawTarget = Math.max(-0.45, Math.min(0.45, turn * 0.6));
      animal.pitchTarget = !running && spec.graze && Math.sin(animal.gait * 0.13 + animal.pace * 20) > 0.92 ? spec.graze * 0.5 : 0;
    } else {
      animal.velocity = 0;
      animal.glance -= dt;
      if (animal.mode === 'graze') {
        // Cúi gặm, nhai nhịp nhàng; mỗi lúc ngẩng lên nhìn một chút rồi cúi tiếp, có khi nhích vài bước.
        if (animal.glance <= 0) {
          const lookUp = animal.random() < 0.3;
          animal.glance = lookUp ? 1 + animal.random() : 2 + animal.random() * 3;
          animal.pitchTarget = lookUp ? 0 : spec.graze;
          animal.yawTarget = (animal.random() - 0.5) * (lookUp ? 1.2 : 0.5);
        }
      } else if (animal.mode === 'look' || animal.mode === 'idle') {
        // Nhìn quanh: ngoảnh đầu sang chỗ này chỗ kia, đôi khi xoay cả người.
        if (animal.glance <= 0) {
          animal.glance = 0.8 + animal.random() * 1.8;
          animal.pitchTarget = (animal.random() - 0.6) * 0.25;
          animal.yawTarget = animal.mode === 'look' ? (animal.random() - 0.5) * 1.5 : (animal.random() - 0.5) * 0.4;
          if (animal.mode === 'look' && animal.random() < 0.3) animal.turnTo = animal.heading + (animal.random() - 0.5) * 2;
        }
        if (animal.turnTo !== undefined) {
          let turn = animal.turnTo - animal.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          const maxTurn = spec.turnRate * 0.5 * dt;
          animal.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
          // Xoay tại chỗ thì vẫn bước chân nhẹ.
          animal.gait += Math.abs(Math.max(-maxTurn, Math.min(maxTurn, turn))) * 1.2;
          if (Math.abs(turn) < 0.02) animal.turnTo = undefined;
        }
      } else {
        animal.pitchTarget = 0;
        animal.yawTarget = 0;
      }
      if (animal.timer <= 0) {
        animal.turnTo = undefined;
        if (!wander(animal, spec)) animal.timer = 1;
      }
    }
    // Đầu chuyển động mềm (cúi chậm, ngẩng nhanh hơn chút).
    animal.pitch = ease(animal.pitch, animal.pitchTarget, animal.pitchTarget > animal.pitch ? 2.2 : 3.5, dt);
    animal.yaw = ease(animal.yaw, animal.yawTarget, 2.8, dt);
  }

  function spawnEffect(animal, action) {
    const group = new THREE.Group();
    group.position.set(animal.x, 0, animal.z);
    if (action === 'pet') {
      for (let index = 0; index < 5; index += 1) {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + (index % 2) * 0.025, 8, 6),
          new THREE.MeshBasicMaterial({ color: index % 2 ? '#ff6f91' : '#ffb0c2', transparent: true, opacity: 0.95, depthWrite: false }),
        );
        bubble.userData.phase = index * 1.4;
        group.add(bubble);
      }
    } else if (action === 'feed') {
      const food = FOOD[animal.type] || FOOD.dog;
      const material = new THREE.MeshStandardMaterial({ color: food.color, roughness: 0.9 });
      const top = food.bowl ? 0.15 : 0.04;
      if (food.bowl) {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.12, 14), new THREE.MeshStandardMaterial({ color: '#d85a43', roughness: 0.72 }));
        bowl.position.y = 0.07;
        group.add(bowl);
      }
      if (food.shape === 'cone') {
        // Hai củ cà rốt nằm trên cỏ, có lá xanh.
        for (const side of [-1, 1]) {
          const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 8), material);
          carrot.rotation.set(0, side * 0.5, Math.PI / 2);
          carrot.position.set(side * 0.06, top, side * 0.05);
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshStandardMaterial({ color: '#4f9a3a', roughness: 1 }));
          leaf.position.set(side * 0.06 - 0.11, top, side * 0.05);
          group.add(carrot, leaf);
        }
      } else if (food.shape === 'hay' || food.shape === 'apple') {
        for (let index = 0; index < 3; index += 1) {
          const piece = new THREE.Mesh(food.shape === 'hay' ? new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6) : new THREE.SphereGeometry(0.06, 10, 8), material);
          if (food.shape === 'hay') piece.rotation.z = Math.PI / 2 + index * 0.6;
          piece.position.set((index - 1) * 0.1, top + 0.03, (index % 2) * 0.06);
          group.add(piece);
        }
      } else {
        for (let index = 0; index < 8; index += 1) {
          const grain = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), material);
          grain.position.set(((index % 4) - 1.5) * 0.07, top, (Math.floor(index / 4) - 0.5) * 0.08);
          group.add(grain);
        }
      }
    } else if (action === 'trick') {
      // Sao vàng tỏa ra quanh con thú.
      for (let index = 0; index < 8; index += 1) {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: index % 2 ? '#ffd54a' : '#fff1a6', transparent: true, depthWrite: false }));
        star.userData.angle = (index / 8) * Math.PI * 2;
        group.add(star);
      }
    } else {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), new THREE.MeshStandardMaterial({ color: '#f3a52b', roughness: 0.62 }));
      ball.userData.ball = true;
      group.add(ball);
    }
    root.add(group);
    effects.push({ group, animal, action, time: 0, duration: action === 'play' ? 5 : action === 'trick' ? TRICK_SECONDS : 3.5 });
  }

  function updateEffects(dt) {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.time += dt;
      effect.group.position.set(effect.animal.x, 0, effect.animal.z);
      if (effect.action === 'pet') {
        effect.group.children.forEach((bubble, bubbleIndex) => {
          const phase = bubble.userData.phase;
          bubble.position.set(Math.sin(phase) * 0.3, 0.75 + effect.time * 0.32 + bubbleIndex * 0.08, Math.cos(phase) * 0.18);
          bubble.scale.setScalar(Math.max(0.05, 1 - effect.time / effect.duration));
        });
      } else if (effect.action === 'feed') {
        effect.group.position.x += Math.sin(effect.animal.heading) * 0.46;
        effect.group.position.z += Math.cos(effect.animal.heading) * 0.46;
      } else if (effect.action === 'trick') {
        const spread = 0.35 + effect.time * 0.45;
        effect.group.children.forEach((star) => {
          const angle = star.userData.angle + effect.time * 1.5;
          star.position.set(Math.cos(angle) * spread, 0.5 + effect.time * 0.25, Math.sin(angle) * spread);
          star.rotation.y += dt * 4;
          star.material.opacity = Math.max(0, 1 - effect.time / effect.duration);
        });
      } else {
        const ball = effect.group.children[0];
        ball.position.set(Math.sin(effect.time * 3.2) * 0.8, 0.18 + Math.abs(Math.sin(effect.time * 5)) * 0.48, Math.cos(effect.time * 3.2) * 0.8);
        ball.rotation.x += dt * 5;
      }
      if (effect.time < effect.duration) continue;
      root.remove(effect.group);
      effect.group.traverse((item) => {
        item.geometry?.dispose?.();
        item.material?.dispose?.();
      });
      effects.splice(index, 1);
    }
  }

  return {
    pickables,
    petAtHit(hit) {
      const id = hit?.object?.userData?.petId || hit?.object?.userData?.petIds?.[hit.instanceId];
      return id ? byId.get(id) || null : null;
    },
    nearest(x, z, maxDistance = Infinity) {
      let best = null;
      let bestDistance = maxDistance;
      for (const animal of byId.values()) {
        const distance = Math.hypot(animal.x - x, animal.z - z);
        if (distance >= bestDistance) continue;
        best = animal;
        bestDistance = distance;
      }
      return best ? { id: best.id, name: best.name, type: best.type, x: best.x, z: best.z, distance: bestDistance } : null;
    },
    interact(id, action) {
      const animal = byId.get(id);
      if (!animal || !['pet', 'feed', 'play', 'trick'].includes(action)) return false;
      animal.reaction = { action, left: action === 'play' ? 5 : action === 'trick' ? TRICK_SECONDS : 3.5 };
      if (action === 'play') playTarget(animal, SPECIES[animal.type]);
      else {
        animal.mode = 'idle';
        animal.timer = animal.reaction.left;
      }
      spawnEffect(animal, action);
      return { id: animal.id, name: animal.name, type: animal.type, x: animal.x, z: animal.z };
    },
    positions() {
      return [
        ...herds.flatMap(({ members }, herd) => members.map((animal) => ({ id: animal.id, name: animal.name, type: animal.type, herd, x: animal.x, z: animal.z, mode: animal.mode }))),
        ...solos.map(({ animal, group }) => ({ id: animal.id, name: animal.name, type: animal.type, model: true, loaded: group.visible, heading: animal.heading, pitch: animal.pitch, x: animal.x, z: animal.z, mode: animal.mode })),
      ];
    },
    update(dt, time, camera = null) {
      const seconds = time / 1_000;
      for (const { spec, meshes, members } of herds) {
        members.forEach((animal, index) => {
          think(animal, spec, dt);
          // Biên độ bước theo tốc độ thật (tăng / giảm dần cùng lúc khởi hành / dừng).
          const stride = Math.min(1, animal.velocity / (spec.walkSpeed * 0.3));
          const walking = stride > 0.01;
          // Nằm nghỉ: hạ thân xuống, chân gập (thu ngắn) dưới bụng.
          const lowerTarget = animal.mode === 'rest' ? spec.legLength * 0.75 : animal.reaction?.action === 'feed' ? spec.legLength * 0.32 : 0;
          animal.lower += (lowerTarget - animal.lower) * Math.min(1, dt * 3);
          const bob = Math.abs(Math.sin(animal.gait)) * 0.02 * stride;
          const trick = animal.reaction?.action === 'trick' ? trickPose(animal.type, 1 - animal.reaction.left / TRICK_SECONDS) : null;
          position.set(animal.x, bob - animal.lower + (trick?.y || 0), animal.z);
          // Thú khối gộp đầu vào thân: cúi đầu (gặm, đánh hơi) thành chúi nhẹ cả người.
          quaternion.setFromEuler(euler.set(animal.pitch * 0.3 + (trick?.rx || 0), animal.heading + animal.yaw * 0.25 + (trick?.ry || 0), trick?.rz || 0, 'YXZ'));
          base.compose(position, quaternion, unit);
          meshes.body.setMatrixAt(index, base);
          const fold = 1 - (animal.lower / spec.legLength) * 0.85;
          spec.hips.forEach((hip, leg) => {
            const swing = Math.sin(animal.gait + (leg === 0 || leg === 3 ? 0 : Math.PI)) * 0.55 * stride;
            position.set(...hip);
            quaternion.setFromEuler(euler.set(swing, 0, 0));
            local.compose(position, quaternion, new THREE.Vector3(1, fold, 1));
            out.multiplyMatrices(base, local);
            meshes.leg.setMatrixAt(index * 4 + leg, out);
          });
          // Đuôi: chó vẫy nhanh khi đứng, mèo đung đưa chậm.
          const happy = animal.reaction?.action === 'pet' || animal.reaction?.action === 'feed';
          const wag = Math.sin(seconds * spec.wag * (happy ? 1.8 : 1) + index) * (happy ? 0.85 : walking ? 0.25 : 0.55);
          position.set(...spec.tailBase);
          quaternion.setFromEuler(euler.set(-spec.tailTilt, wag, 0, 'YXZ'));
          local.compose(position, quaternion, unit);
          out.multiplyMatrices(base, local);
          meshes.tail.setMatrixAt(index, out);
        });
        for (const mesh of Object.values(meshes)) {
          mesh.instanceMatrix.needsUpdate = true;
          // Ma trận thú thay đổi liên tục; cập nhật bounds để frustum culling và raycast không dùng vị trí cũ.
          mesh.computeBoundingSphere();
        }
      }
      solos.forEach((solo, index) => {
        const { spec, animal, group } = solo;
        if (solo.loadState === 'idle' && (!camera || Math.hypot(camera.position.x - animal.x, camera.position.z - animal.z) <= solo.loadDistance)) solo.load();
        think(animal, spec, dt);
        if (!group.visible) return;
        const running = animal.speed > spec.walkSpeed * 1.3;
        // Biên độ bước theo tốc độ thật; xoay tại chỗ thì bước nhẹ.
        const stride = Math.max(Math.min(1, animal.velocity / (spec.walkSpeed * 0.3)), animal.turnTo !== undefined ? 0.45 : 0);
        animal.lower = ease(animal.lower, animal.mode === 'rest' ? 1 : 0, 1.6, dt);
        const happy = animal.reaction?.action === 'pet' || animal.reaction?.action === 'feed';
        const trick = animal.reaction?.action === 'trick' ? trickPose(animal.type, 1 - animal.reaction.left / TRICK_SECONDS) : null;
        if (solo.uniforms) {
          // Chân: sải = bán kính bước (khớp với pha bước nên bàn chân không trượt trên cỏ), nhấc chân khi đưa về trước.
          const reach = spec.legLength * (running ? 0.75 : 0.5);
          const legScale = spec.gait === 'hop' ? 0.45 : 1;
          solo.uniforms.uGait.value = animal.gait;
          solo.uniforms.uStride.value = (reach * legScale * stride) / solo.scale;
          solo.uniforms.uLift.value = (spec.legLength * (running ? 0.45 : 0.3) * legScale * stride) / solo.scale;
          solo.uniforms.uFold.value = animal.lower * 0.75;
          solo.uniforms.uPitch.value = animal.pitch;
          solo.uniforms.uYaw.value = animal.yaw;
        }
        // Thân: thú bốn chân nhấp nhô hai lần mỗi vòng bước (mỗi cặp chân chạm đất), lắc nhẹ; thỏ nhảy cóc thành vòng
        // cung (ngóc lên khi bật, chúi xuống khi đáp); vịt lạch bạch nghiêng trái phải. Đứng yên thì thở.
        const step = Math.sin(animal.gait);
        const bounce = spec.gait === 'hop' ? Math.abs(step) * spec.legLength * 1.1 : Math.abs(step) * spec.legLength * (running ? 0.12 : 0.05);
        const breathe = 1 + Math.sin(seconds * (animal.mode === 'rest' ? 1.4 : 2.2) + index) * 0.012 * (1 - stride);
        group.position.set(animal.x, bounce * stride + (trick?.y || 0), animal.z);
        group.rotation.y = animal.heading + (happy ? Math.sin(seconds * 10 + index) * 0.12 : 0) + (trick?.ry || 0);
        group.rotation.x = (spec.gait === 'hop' ? -Math.cos(animal.gait) * Math.sign(step) * 0.18 : Math.cos(animal.gait * 2) * 0.015) * stride + (trick?.rx || 0);
        group.rotation.z = (spec.gait === 'waddle' ? step * 0.17 : step * 0.025) * stride + (happy ? Math.sin(seconds * 14 + index) * 0.06 : 0) + (trick?.rz || 0);
        group.scale.set(1, breathe, 1);
      });
      updateEffects(dt);
    },
  };
}
