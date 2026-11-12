// Vùng Đồng bằng (IL, IN, IA, KS, MO, NE, ND, OH, OK, SD): đồng lúa mì theo luống, cây chắn gió, đồi rất thấp,
// silo, kho thóc đỏ và cối xay gió ở xa. Chùa dùng bộ dựng chung với mái nâu thấp một tầng; dữ liệu vùng nằm ở
// scenes/thien-default/themes/plains.json.
import * as THREE from 'three';
import { canvasTexture, mountainArc, seeded, speckle } from './common.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

function beamBetween(batch, from, to, radius, material, sides = 5) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  batch.add(geometry, material, { position: start.add(end).multiplyScalar(0.5).toArray() });
}

function paddleBetween(batch, from, to, width, depth, material) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new THREE.BoxGeometry(width, direction.length(), depth);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  batch.add(geometry, material, { position: start.add(end).multiplyScalar(0.5).toArray() });
}

const trees = {
  // Bạch dương đồng bằng / cottonwood: thân thẳng, tán cao để người và camera đi dưới không bị che.
  cottonwood(batch, x, z, size, rand, env) {
    const height = (4.4 + rand() * 1.2) * size;
    const bark = env.material('#78654f', { roughness: 0.95 });
    batch.add(new THREE.CylinderGeometry(0.22 * size, 0.34 * size, height, 8), bark, { position: [x, height / 2, z] });
    const blobs = env.detail === 0 ? 5 : 8;
    for (let index = 0; index < blobs; index += 1) {
      const angle = (index / blobs) * Math.PI * 2 + rand() * 0.35;
      const reach = (0.25 + rand() * 1.05) * size;
      const radius = (0.75 + rand() * 0.38) * size;
      batch.add(new THREE.IcosahedronGeometry(radius, env.detail ?? 1), env.material(pick(rand, ['#718545', '#82964d', '#65793d']), { flatShading: true }), {
        position: [x + Math.cos(angle) * reach, height + (rand() - 0.25) * 0.8 * size, z + Math.sin(angle) * reach],
        scale: [0.9, 1.25, 0.9],
      });
    }
  },
  // Tuyết tùng đỏ làm hàng chắn gió: thân gọn, tán đầu tiên cao trên 1 m nên không vượt vật cản ở gốc.
  redcedar(batch, x, z, size, rand, env) {
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.2 * size, 2.2 * size, 7), env.material('#65523e'), { position: [x, 1.1 * size, z] });
    for (let tier = 0; tier < 4; tier += 1) {
      const radius = (1.0 - tier * 0.16) * size;
      const height = 1.65 * size;
      batch.add(new THREE.ConeGeometry(radius, height, env.detail === 0 ? 6 : 8), env.material(tier % 2 ? '#526b3d' : '#607847', { flatShading: true }), {
        position: [x, (2.25 + tier * 0.78) * size, z],
      });
    }
  },
};

const scatter = {
  // Kho thóc đỏ nhỏ, luôn dựng ở dải xa do plains.json khai báo band.
  'red-barn'(batch, x, z, size, rand, env) {
    const width = 4.6 * size;
    const depth = 5.8 * size;
    const wallHeight = 3.0 * size;
    const roofRise = 1.35 * size;
    const roofSlope = Math.hypot(width / 2, roofRise);
    const roofAngle = Math.atan2(roofRise, width / 2);
    const red = env.material(pick(rand, ['#a53f32', '#b54a36', '#94372f']), { roughness: 0.95 });
    const roof = env.material('#5f493d', { roughness: 0.98 });
    const trim = env.material('#ead8b3', { roughness: 0.9 });
    const door = env.material('#5b3428', { roughness: 0.95 });
    batch.add(new THREE.BoxGeometry(width, wallHeight, depth), red, { position: [x, wallHeight / 2, z] });
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(roofSlope + 0.35 * size, 0.16 * size, depth + 0.45 * size), roof, {
        position: [x + side * width / 4, wallHeight + roofRise / 2, z], rotation: [0, 0, -side * roofAngle],
      });
    }
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(1.65 * size, 2.35 * size, 0.08 * size), door, {
        position: [x, 1.18 * size, z + side * (depth / 2 + 0.045 * size)],
      });
      batch.add(new THREE.BoxGeometry(width + 0.08 * size, 0.12 * size, 0.1 * size), trim, {
        position: [x, wallHeight * 0.72, z + side * (depth / 2 + 0.06 * size)],
      });
    }
  },
  // Cối xay gió nông trại: tháp giàn gọn và tám cánh tĩnh quay về phía trung tâm sân.
  'farm-windmill'(batch, x, z, size, rand, env) {
    const metal = env.material('#595f5c', { roughness: 0.72, metalness: 0.18 });
    const blade = env.material('#747b76', { roughness: 0.65, metalness: 0.22 });
    const hubY = (6.4 + rand() * 1.1) * size;
    const normal = new THREE.Vector3(-x, 0, -z).normalize();
    const right = new THREE.Vector3(normal.z, 0, -normal.x);
    const base = 1.45 * size;
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        beamBetween(batch, [x + sideX * base, 0, z + sideZ * base], [x + sideX * 0.18 * size, hubY - 0.35 * size, z + sideZ * 0.18 * size], 0.065 * size, metal, 5);
      }
    }
    for (let level = 1; level <= 3; level += 1) {
      const y = (hubY * level) / 4;
      const reach = base * (1 - level * 0.21);
      beamBetween(batch, [x - reach, y, z - reach], [x + reach, y, z + reach], 0.035 * size, metal, 4);
      beamBetween(batch, [x - reach, y, z + reach], [x + reach, y, z - reach], 0.035 * size, metal, 4);
    }
    const hub = new THREE.Vector3(x, hubY, z).addScaledVector(normal, 0.22 * size);
    batch.add(new THREE.SphereGeometry(0.28 * size, 8, 6), metal, { position: hub.toArray() });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const direction = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(UP, Math.sin(angle));
      const inner = hub.clone().addScaledVector(direction, 0.42 * size);
      const outer = hub.clone().addScaledVector(direction, 2.35 * size);
      paddleBetween(batch, inner.toArray(), outer.toArray(), 0.22 * size, 0.08 * size, blade);
    }
  },
};

const mountains = {
  // Chân trời phẳng: vòm dẹt, hàng cây chắn gió và silo tròn. Không dùng nón nhọn đơn lẻ.
  'prairie-horizon'(batch, env) {
    const rand = seeded('prairie-horizon');
    const dome = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    mountainArc(env, 10, { spread: 1.42, radiusX: 126, radiusZ: 88 }, (x, z, index) => {
      batch.add(dome.clone(), env.material(env.colors[index % 2], { roughness: 1, flatShading: true }), {
        position: [x, -1.2, z], scale: [22 + rand() * 15, 3.2 + rand() * 2.2, 14 + rand() * 7],
      });
    });
    dome.dispose();

    const horizonZ = env.midZ + 142;
    for (let index = 0; index < 29; index += 1) {
      const x = -126 + index * 9;
      const z = horizonZ + Math.sin(index * 1.7) * 3;
      const height = 2.2 + rand() * 1.8;
      batch.add(new THREE.CylinderGeometry(0.12, 0.17, height, 5), env.material('#65563f'), { position: [x, height / 2, z] });
      batch.add(new THREE.IcosahedronGeometry(1.15 + rand() * 0.6, 0), env.material(pick(rand, ['#586f43', '#65794a', '#4f653d']), { flatShading: true }), {
        position: [x, height + 0.45, z], scale: [1.15, 0.85, 1],
      });
    }

    for (const [index, x] of [-72, 58, 86].entries()) {
      const radius = 2.0 + index * 0.25;
      const height = 6.4 + index * 1.1;
      const z = horizonZ - 10 + index * 5;
      const silver = env.material(env.colors[2], { roughness: 0.62, metalness: 0.2 });
      batch.add(new THREE.CylinderGeometry(radius, radius, height, 12), silver, { position: [x, height / 2, z] });
      batch.add(new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), silver, { position: [x, height, z] });
      batch.add(new THREE.BoxGeometry(radius * 0.3, height * 0.55, radius * 2.02), env.material(env.colors[3], { roughness: 0.9 }), {
        position: [x, height * 0.45, z],
      });
    }
  },
};

const grounds = {
  // Luống lúa mì rộng 3–5 m khi lặp trên mặt đất: sọc tối là rãnh, sọc sáng là hàng lúa, vẫn rõ từ xa / trên cao.
  'wheat-rows'({ renderer }) {
    const rand = seeded('wheat-rows');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#c9a34d';
      ctx.fillRect(0, 0, size, size);
      const band = 32;
      for (let x = 0; x < size; x += band) {
        ctx.fillStyle = '#9e7932';
        ctx.fillRect(x, 0, 7, size);
        ctx.fillStyle = '#e2c36c';
        ctx.fillRect(x + 9, 0, 17, size);
        ctx.fillStyle = 'rgba(255, 238, 161, 0.42)';
        ctx.fillRect(x + 14, 0, 3, size);
        ctx.fillStyle = 'rgba(111, 78, 27, 0.24)';
        ctx.fillRect(x + 28, 0, 3, size);
      }
      speckle(ctx, size, rand, 560, ['#efd27b', '#b88d38', '#d8b45a', '#f0d88f'], [0.45, 1.1]);
      ctx.lineWidth = 0.8;
      for (let index = 0; index < 520; index += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const length = 2 + rand() * 4;
        ctx.strokeStyle = rand() > 0.45 ? 'rgba(255, 231, 145, 0.65)' : 'rgba(125, 91, 34, 0.48)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 1.2, y - length);
        ctx.stroke();
      }
    }, renderer, 32);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

export const kit = { trees, scatter, mountains, grounds };
