// Mississippi: sông Mississippi rộng, cầu Vicksburg khung thép và đoàn sà lan phía đông. Mộc lan của vùng south đã
// có trong dải cây chung nên lớp bang chỉ thêm công trình để không vượt ngân sách mesh.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  'vicksburg-bridge'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const water = env.far('#4d7774', { haze: Math.max(0.42, haze), roughness: 0.42 });
    const steel = env.far('#6c5546', { haze, roughness: 0.8, metalness: 0.12 });
    const road = env.far('#3f4948', { haze, roughness: 0.92 });
    batch.add(new THREE.BoxGeometry(132 * scale, 0.14 * scale, 48 * scale), water, { position: at(0, 0.03 * scale, -4 * scale), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(118 * scale, 1.1 * scale, 8.5 * scale), road, { position: at(0, 10 * scale, 0), rotation: [0, face, 0] });
    const lights = [];
    for (let column = -5; column <= 5; column += 1) {
      const px = column * 10.5 * scale;
      const height = (column % 2 ? 22 : 28) * scale;
      batch.add(new THREE.BoxGeometry(0.8 * scale, height, 0.8 * scale), steel, { position: at(px, height / 2, 0) });
      if (column < 5) {
        batch.add(new THREE.BoxGeometry(15 * scale, 0.65 * scale, 0.7 * scale), steel, { position: at(px + 5.25 * scale, 20 * scale, 0), rotation: [0, face, column % 2 ? 0.55 : -0.55] });
      }
      lights.push(at(px, 11.5 * scale, 4.5 * scale));
    }
    env.nightPoints(lights, { color: '#ffd88f', size: 0.78 * scale });
  },

  'river-barges'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const hull = env.far('#4e4740', { haze, roughness: 0.95 });
    const cargo = env.far('#a36a3f', { haze, roughness: 0.9 });
    for (let index = 0; index < 4; index += 1) {
      const px = (index - 1.5) * 18 * scale;
      batch.add(new THREE.BoxGeometry(15 * scale, 3 * scale, 8 * scale), hull, { position: at(px, 1.8 * scale, 0), rotation: [0, face, 0] });
      batch.add(new THREE.BoxGeometry(11 * scale, 8 * scale, 6.5 * scale), cargo, { position: at(px, 7 * scale, 0), rotation: [0, face, 0] });
    }
    batch.add(new THREE.CylinderGeometry(1.2 * scale, 1.5 * scale, 15 * scale, 8), hull, { position: at(-27 * scale, 14 * scale, 0) });
    env.nightPoints([at(-27 * scale, 22 * scale, 0), at(-9 * scale, 11.5 * scale, 3.5 * scale), at(9 * scale, 11.5 * scale, 3.5 * scale)], { color: '#ffd58c', size: 1 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
