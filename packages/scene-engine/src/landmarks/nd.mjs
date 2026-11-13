// North Dakota: dải Badlands Theodore Roosevelt, giếng dầu và hướng dương. Giếng dầu phía đông giữ đường chân trời
// có điểm nhận dạng ở góc thứ tư; lửa khí chỉ hiện trong lớp ban đêm.
import * as THREE from 'three';
import { beam, frame, ridge } from './common.mjs';

// Dáng pumpjack nhìn ngang: khung chữ A, đòn cân, đầu ngựa cong, đối trọng và cần bơm thẳng xuống giếng.
const addPump = (batch, at, scale, metal, rust) => {
  const pivot = at(0, 16.5 * scale, 0);
  for (const depth of [-1.7, 1.7]) {
    beam(batch, at(-5.2 * scale, 0.7 * scale, depth * scale), at(0, 15.8 * scale, depth * 0.58 * scale), 1.05 * scale, metal);
    beam(batch, at(5.2 * scale, 0.7 * scale, depth * scale), at(0, 15.8 * scale, depth * 0.58 * scale), 1.05 * scale, metal);
  }
  beam(batch, at(0, 15.8 * scale, -1.05 * scale), at(0, 15.8 * scale, 1.05 * scale), 1.15 * scale, metal);
  beam(batch, at(-9.5 * scale, 17.5 * scale, 0), at(10.5 * scale, 15.7 * scale, 0), 1.35 * scale, rust);

  // Đầu ngựa uốn xuống ở đầu phải, nối với cần bơm thẳng đứng.
  beam(batch, at(10.5 * scale, 15.7 * scale, 0), at(12.1 * scale, 13.2 * scale, 0), 2.1 * scale, rust);
  beam(batch, at(12.1 * scale, 13.2 * scale, 0), at(11.3 * scale, 10.2 * scale, 0), 2.25 * scale, rust);
  beam(batch, at(11.3 * scale, 10.2 * scale, 0), at(11.3 * scale, 1.2 * scale, 0), 0.42 * scale, metal);

  // Đối trọng tròn nằm ở đầu còn lại của đòn cân.
  batch.add(new THREE.CylinderGeometry(2.6 * scale, 2.6 * scale, 2.8 * scale, 10), metal, {
    position: at(-8.2 * scale, 16.9 * scale, 0), rotation: [Math.PI / 2, 0, 0],
  });
  batch.add(new THREE.CylinderGeometry(1.7 * scale, 2.2 * scale, 1.5 * scale, 9), rust, {
    position: at(11.3 * scale, 0.75 * scale, 0),
  });
  batch.add(new THREE.CylinderGeometry(1.2 * scale, 1.2 * scale, 2.2 * scale, 9), metal, {
    position: pivot, rotation: [Math.PI / 2, 0, 0],
  });
};

const landmarks = {
  'nd-badlands'(batch, x, z, scale, rand, env, { side, haze }) {
    const tan = env.far('#a66a42', { haze, roughness: 1, flatShading: true });
    const dark = env.far('#6c4938', { haze, roughness: 1, flatShading: true });
    ridge(batch, x, z, {
      side, span: 124 * scale, depth: 24 * scale, columns: 48, rows: 9, ribs: 2.4 * scale, jag: 1.3 * scale, phase: 2.1,
      crest: (t) => (21 + Math.sin(t * 0.09) * 5 + Math.sin(t * 0.23) * 2.5) * scale,
      bands: [[0, 0.46, dark], [0.46, 1, tan]],
    });
  },

  'oil-pump'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const metal = env.far('#343b3d', { haze, roughness: 0.7, metalness: 0.18 });
    const rust = env.far('#8f4c2f', { haze, roughness: 0.92 });
    addPump(batch, at, scale, metal, rust);
    batch.add(new THREE.CylinderGeometry(0.5 * scale, 0.7 * scale, 14 * scale, 7), metal, {
      position: at(20 * scale, 7 * scale, 0),
    });
    env.nightGlow(...at(20 * scale, 15 * scale, 0), 3.6 * scale, '#ff8a32');
  },
};

const scatter = {
  sunflower(batch, x, z, size, rand, env) {
    const green = env.material('#50703c', { roughness: 1 });
    const gold = env.material('#dfb62b', { roughness: 0.95, flatShading: true });
    const height = (1.6 + rand() * 0.7) * size;
    batch.add(new THREE.CylinderGeometry(0.035 * size, 0.055 * size, height, 5), green, { position: [x, height / 2, z] });
    batch.add(new THREE.IcosahedronGeometry(0.32 * size, 0), gold, { position: [x, height, z], scale: [1.35, 1.35, 0.38] });
  },
};

export const kit = { landmarks, scatter };
