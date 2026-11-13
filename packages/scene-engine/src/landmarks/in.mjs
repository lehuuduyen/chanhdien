// Indiana (vùng plains): cồn cát Indiana Dunes cao phủ cỏ biển bên hồ Michigan ngoài cổng (đụn cát + mặt hồ chung),
// bên kia hồ mờ mờ đường chân trời Chicago (skyline chung, sương dày); phía đông là cụm silo / tháp chứa ngũ cốc có đèn.
// Gần tường là các khóm ngô. (GPT/Codex dựng, Claude sửa phần cồn cát theo góp ý rà.)
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  // Cụm silo tiếp nối ở phía đông: giúp nhận ra cảnh từ góc sân bên hông mà không lặp lại toàn bộ cồn cát.
  'grain-elevator'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const grain = env.far('#b9b4a5', { haze, roughness: 0.72, metalness: 0.1 });
    const shadow = env.far('#756c59', { haze, roughness: 0.9 });
    const lights = [];
    for (let index = 0; index < 4; index += 1) {
      const px = (index - 1.5) * 7.2 * scale;
      const height = (21 + (index % 2) * 4) * scale;
      const radius = 2.5 * scale;
      batch.add(new THREE.CylinderGeometry(radius, radius, height, 12), grain, { position: at(px, height / 2, 0) });
      batch.add(new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), grain, { position: at(px, height, 0) });
      lights.push(at(px, height + 0.7 * scale, 0));
    }
    const height = 29 * scale;
    batch.add(new THREE.BoxGeometry(7 * scale, height, 8 * scale), shadow, {
      position: at(-18 * scale, height / 2, 0), rotation: [0, face, 0],
    });
    lights.push(at(-18 * scale, height + 0.7 * scale, 0));
    env.nightPoints(lights, { color: '#ffd27a', size: 0.8 * scale });
  },
};

const scatter = {
  corn(batch, x, z, size, rand, env) {
    const stalk = env.material('#57723d', { roughness: 1 });
    const ear = env.material('#d4af43', { roughness: 0.95 });
    for (let index = 0; index < 5; index += 1) {
      const px = x + (rand() - 0.5) * 1.25 * size;
      const pz = z + (rand() - 0.5) * 1.25 * size;
      const height = (1.45 + rand() * 0.6) * size;
      batch.add(new THREE.CylinderGeometry(0.025 * size, 0.045 * size, height, 4), stalk, { position: [px, height / 2, pz] });
      batch.add(new THREE.ConeGeometry(0.1 * size, 0.32 * size, 5), ear, { position: [px + 0.08 * size, height * 0.68, pz], rotation: [0, 0, -0.65] });
    }
  },
};

export const kit = { landmarks, scatter };
