// Illinois: đường chân trời Chicago giản lược bên hồ Michigan; không chữ, không Cloud Gate. Các khối nhà dùng hai
// vật liệu xa và một tập điểm đèn ban đêm để giữ dưới ngân sách mesh. Gần tường là những khóm ngô.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  'chicago-skyline'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const glass = env.far('#526779', { haze, roughness: 0.48, metalness: 0.12 });
    const stone = env.far('#a7a49b', { haze, roughness: 0.8 });
    const lights = [];
    const towers = [];
    for (let index = 0; index < 17; index += 1) {
      const px = (index - 8) * 9.2 * scale;
      const height = (18 + ((index * 13) % 19) + rand() * 7) * scale;
      const width = (5.2 + (index % 4) * 1.15) * scale;
      const depth = (5.5 + (index % 3) * 1.3) * scale;
      towers.push({ px, height, width, depth, material: index % 4 === 1 ? stone : glass });
    }
    // Một tháp trung tâm cao có hai ăng-ten, chỉ lấy dáng đường chân trời chứ không sao chép chi tiết tòa nhà thật.
    towers[8] = { px: 0, height: 55 * scale, width: 8.5 * scale, depth: 8 * scale, material: glass };
    for (const [index, tower] of towers.entries()) {
      batch.add(new THREE.BoxGeometry(tower.width, tower.height, tower.depth), tower.material, {
        position: at(tower.px, tower.height / 2, 0), rotation: [0, face, 0],
      });
      const rows = Math.max(3, Math.floor(tower.height / (5 * scale)));
      for (let row = 1; row < rows; row += 1) {
        for (const side of [-0.25, 0.25]) lights.push(at(tower.px + side * tower.width, row * 4.5 * scale, tower.depth / 2 + 0.08));
      }
      if (index === 8) {
        for (const side of [-1, 1]) {
          batch.add(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 15 * scale, 6), stone, {
            position: at(side * 1.65 * scale, 62.5 * scale, 0),
          });
          lights.push(at(side * 1.65 * scale, 70 * scale, 0));
        }
      }
    }
    env.nightPoints(lights, { color: '#ffd98a', size: 0.8 * scale });
  },
};

const scatter = {
  corn(batch, x, z, size, rand, env) {
    const stalk = env.material('#56723d', { roughness: 1 });
    const ear = env.material('#d9b84e', { roughness: 0.95 });
    for (let index = 0; index < 5; index += 1) {
      const px = x + (rand() - 0.5) * 1.2 * size;
      const pz = z + (rand() - 0.5) * 1.2 * size;
      const height = (1.5 + rand() * 0.55) * size;
      batch.add(new THREE.CylinderGeometry(0.025 * size, 0.045 * size, height, 4), stalk, { position: [px, height / 2, pz] });
      batch.add(new THREE.ConeGeometry(0.11 * size, 0.34 * size, 5), ear, {
        position: [px + 0.08 * size, height * 0.67, pz], rotation: [0, 0, -0.65],
      });
    }
  },
};

export const kit = { landmarks, scatter };
