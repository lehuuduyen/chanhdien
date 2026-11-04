// Chó mèo trong vườn chùa: dựng bằng khối, mỗi loài gộp thành ba InstancedMesh (thân + đầu, chân, đuôi) nên cả đàn chỉ
// tốn vài lệnh vẽ. Mỗi con đi lang thang trong vùng của mình (area), tránh vật cản theo world.walk, lúc đứng vẫy đuôi,
// lúc nằm nghỉ. Chạy riêng trên từng máy (không đồng bộ qua server); hạt ngẫu nhiên cố định nên ai cũng thấy gần giống.
//
// world.courtyard.animals: [{ type: 'dog' | 'cat', color, x, z, area: { x: [min, max], z: [min, max] } }]
import * as THREE from 'three';
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
    walkSpeed: 1.2, runSpeed: 2.6, legLength: 0.3, wag: 14, radius: 0.35,
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
    walkSpeed: 0.7, runSpeed: 1.8, legLength: 0.2, wag: 2.5, radius: 0.25,
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

export function buildAnimals({ root, animals, walk }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const herds = [];
  for (const [type, spec] of Object.entries(SPECIES)) {
    const members = animals.filter((item) => item.type === type);
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
    const herd = { spec, meshes, members: [] };
    members.forEach((item, index) => {
      const coat = new THREE.Color(item.color || '#a0784a');
      meshes.body.setColorAt(index, coat);
      meshes.tail.setColorAt(index, coat);
      for (let leg = 0; leg < 4; leg += 1) meshes.leg.setColorAt(index * 4 + leg, coat);
      let seed = Math.floor(Math.abs(item.x * 131 + item.z * 977)) + index * 7919 + 1;
      herd.members.push({
        x: item.x, z: item.z, heading: index * 1.3, area: item.area, mode: 'idle', timer: 1 + index, target: null,
        speed: spec.walkSpeed, gait: 0, lower: 0,
        random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
      });
    });
    herds.push(herd);
  }

  const free = (x, z, spec, area) => x >= area.x[0] && x <= area.x[1] && z >= area.z[0] && z <= area.z[1]
    && isWalkable({ ...walk, radius: spec.radius }, x, z);
  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const unit = new THREE.Vector3(1, 1, 1);

  function think(animal, spec, dt) {
    animal.timer -= dt;
    if (animal.mode === 'walk') {
      const dx = animal.target.x - animal.x;
      const dz = animal.target.z - animal.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.3) {
        animal.mode = animal.random() < 0.3 ? 'rest' : 'idle';
        animal.timer = animal.mode === 'rest' ? 8 + animal.random() * 10 : 2 + animal.random() * 5;
        return;
      }
      const wanted = Math.atan2(dx, dz);
      let turn = wanted - animal.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      animal.heading += turn * Math.min(1, dt * 4);
      const step = Math.min(distance, animal.speed * dt) * Math.max(0.2, Math.cos(turn));
      const nextX = animal.x + Math.sin(animal.heading) * step;
      const nextZ = animal.z + Math.cos(animal.heading) * step;
      if (free(nextX, nextZ, spec, animal.area)) {
        animal.x = nextX;
        animal.z = nextZ;
        animal.gait += step * (animal.speed > spec.walkSpeed ? 5 : 7) / spec.legLength * 0.3;
      } else animal.timer = 0;
      if (animal.timer <= 0) {
        animal.mode = 'idle';
        animal.timer = 0.5 + animal.random();
      }
      return;
    }
    if (animal.timer > 0) return;
    // Chọn chỗ mới trong vùng: thử vài điểm ngẫu nhiên đi được, cách 2–9 m.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = animal.random() * Math.PI * 2;
      const reach = 2 + animal.random() * 7;
      const x = animal.x + Math.sin(angle) * reach;
      const z = animal.z + Math.cos(angle) * reach;
      if (free(x, z, spec, animal.area)) {
        animal.target = { x, z };
        animal.mode = 'walk';
        animal.speed = animal.random() < 0.2 ? spec.runSpeed : spec.walkSpeed;
        animal.timer = 12;
        return;
      }
    }
    animal.timer = 1;
  }

  return {
    positions() {
      return herds.flatMap(({ members }, herd) => members.map((animal) => ({ herd, x: animal.x, z: animal.z, mode: animal.mode })));
    },
    update(dt, time) {
      const seconds = time / 1_000;
      for (const { spec, meshes, members } of herds) {
        members.forEach((animal, index) => {
          think(animal, spec, dt);
          const walking = animal.mode === 'walk';
          // Nằm nghỉ: hạ thân xuống, chân gập (thu ngắn) dưới bụng.
          const lowerTarget = animal.mode === 'rest' ? spec.legLength * 0.75 : 0;
          animal.lower += (lowerTarget - animal.lower) * Math.min(1, dt * 3);
          const bob = walking ? Math.abs(Math.sin(animal.gait)) * 0.02 : 0;
          position.set(animal.x, bob - animal.lower, animal.z);
          quaternion.setFromEuler(euler.set(0, animal.heading, 0));
          base.compose(position, quaternion, unit);
          meshes.body.setMatrixAt(index, base);
          const fold = 1 - (animal.lower / spec.legLength) * 0.85;
          spec.hips.forEach((hip, leg) => {
            const swing = walking ? Math.sin(animal.gait + (leg === 0 || leg === 3 ? 0 : Math.PI)) * 0.55 : 0;
            position.set(...hip);
            quaternion.setFromEuler(euler.set(swing, 0, 0));
            local.compose(position, quaternion, new THREE.Vector3(1, fold, 1));
            out.multiplyMatrices(base, local);
            meshes.leg.setMatrixAt(index * 4 + leg, out);
          });
          // Đuôi: chó vẫy nhanh khi đứng, mèo đung đưa chậm.
          const wag = Math.sin(seconds * spec.wag + index) * (walking ? 0.25 : 0.55);
          position.set(...spec.tailBase);
          quaternion.setFromEuler(euler.set(-spec.tailTilt, wag, 0, 'YXZ'));
          local.compose(position, quaternion, unit);
          out.multiplyMatrices(base, local);
          meshes.tail.setMatrixAt(index, out);
        });
        for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
