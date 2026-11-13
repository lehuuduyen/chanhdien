// Louisiana: cầu Lake Pontchartrain Causeway chạy dài vào chân trời trên mặt hồ, với nhà sàn và đầm bách phía đông.
// Đèn cầu dùng một cụm điểm thay vì từng mesh.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  causeway(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const water = env.far('#557f7a', { haze: Math.max(0.4, haze), roughness: 0.42 });
    const concrete = env.far('#aaa99d', { haze, roughness: 0.9 });
    const road = env.far('#4b5352', { haze, roughness: 0.92 });
    batch.add(new THREE.BoxGeometry(150 * scale, 0.12 * scale, 310 * scale), water, {
      position: at(0, 0.02 * scale, -132 * scale), rotation: [0, face, 0],
    });
    const length = 278 * scale;
    const centerZ = -128 * scale;
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(4.6 * scale, 0.65 * scale, length), road, {
      position: at(side * 3.2 * scale, 3.4 * scale, centerZ), rotation: [0, face, 0],
    });
    const lights = [];
    for (let span = 0; span < 28; span += 1) {
      const dz = -span * 10 * scale;
      for (const side of [-1, 1]) {
        batch.add(new THREE.BoxGeometry(0.58 * scale, 3.1 * scale, 0.58 * scale), concrete, {
          position: at(side * 3.2 * scale, 1.55 * scale, dz),
        });
        if (span % 2 === 0) lights.push(at(side * 3.2 * scale, 4.35 * scale, dz));
      }
    }
    env.nightPoints(lights, { color: '#ffe5a8', size: 0.68 * scale });
  },

  'bayou-stilt-house'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const wood = env.far('#8a6749', { haze, roughness: 1 });
    const roof = env.far('#5b3f35', { haze, roughness: 0.94 });
    for (const side of [-1, 1]) for (const depth of [-1, 1]) batch.add(new THREE.BoxGeometry(0.8 * scale, 10 * scale, 0.8 * scale), wood, { position: at(side * 8 * scale, 5 * scale, depth * 4.5 * scale) });
    batch.add(new THREE.BoxGeometry(21 * scale, 12 * scale, 13 * scale), wood, { position: at(0, 15 * scale, 0), rotation: [0, face, 0] });
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(22 * scale, 0.8 * scale, 9 * scale), roof, {
      position: at(0, 23.5 * scale, side * 3.2 * scale), rotation: [side * 0.62, face, 0], order: 'YXZ',
    });
    env.nightPoints([at(-6 * scale, 17 * scale, 6.6 * scale), at(6 * scale, 17 * scale, 6.6 * scale)], { color: '#ffd58b', size: 1.1 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
