// South Carolina: cầu dây văng Ravenel ngoài cổng và Rainbow Row phía đông. Dãy nhà được gộp nhiều màu thành một
// mesh màu đỉnh để giữ ngân sách; cọ palmetto chỉ rải trong dải gần tường.
import * as THREE from 'three';
import { beam, frame, paintMerge } from './common.mjs';

const landmarks = {
  'ravenel-bridge'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const water = env.far('#4f7d82', { haze: Math.max(0.42, haze), roughness: 0.4 });
    const concrete = env.far('#c4c1b4', { haze, roughness: 0.82 });
    const steel = env.far('#7d8580', { haze, roughness: 0.65, metalness: 0.16 });
    batch.add(new THREE.BoxGeometry(130 * scale, 0.14 * scale, 48 * scale), water, { position: at(0, 0.03 * scale, -4 * scale), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(118 * scale, 1 * scale, 8 * scale), steel, { position: at(0, 11 * scale, 0), rotation: [0, face, 0] });
    const lights = [];
    for (const tower of [-23, 23]) {
      // Hai chân chụm dưới mặt cầu, mở ra giữa thân rồi chụm lại ở đỉnh: dáng kim cương đặc trưng của Ravenel.
      for (const side of [-1, 1]) {
        beam(batch, at((tower + side * 4.6) * scale, 0, 0), at((tower + side * 1.2) * scale, 12 * scale, 0), 1.45 * scale, concrete);
        beam(batch, at((tower + side * 1.2) * scale, 12 * scale, 0), at((tower + side * 5.2) * scale, 29 * scale, 0), 1.45 * scale, concrete);
        beam(batch, at((tower + side * 5.2) * scale, 29 * scale, 0), at(tower * scale, 45 * scale, 0), 1.45 * scale, concrete);
      }
      // Dây xòe quạt riêng từ đỉnh mỗi tháp xuống mặt cầu hai bên, không nối chéo giữa hai tháp.
      for (const direction of [-1, 1]) {
        for (let cable = 0; cable < 5; cable += 1) {
          const reach = (7 + cable * 5) * scale;
          beam(batch, at(tower * scale, (42 - cable * 1.4) * scale, 0), at(tower * scale + direction * reach, 12 * scale, 0), 0.22 * scale, steel);
        }
      }
      lights.push(at(tower * scale, 43 * scale, 0));
    }
    env.nightPoints(lights, { color: '#e9f4ff', size: 1.2 * scale });
  },

  'rainbow-row'(batch, x, z, scale, rand, env, { face, haze }) {
    const colors = ['#d88876', '#e8b862', '#83b5a6', '#8ea7c8', '#d99bc0', '#eee0a5'];
    const parts = [];
    for (let index = 0; index < colors.length; index += 1) {
      const px = (index - 2.5) * 7.2 * scale;
      const height = (15 + (index % 3) * 2.2) * scale;
      parts.push([new THREE.BoxGeometry(6.8 * scale, height, 9 * scale), colors[index], { position: [px, height / 2, 0] }]);
      parts.push([new THREE.ConeGeometry(5.3 * scale, 5 * scale, 4), '#54453f', { position: [px, height + 2.5 * scale, 0], rotation: [0, Math.PI / 4, 0], scale: [1, 1, 0.8] }]);
      for (let floor = 0; floor < 3; floor += 1) parts.push([new THREE.BoxGeometry(1.2 * scale, 2.1 * scale, 0.35 * scale), '#e9ecdf', { position: [px, (4 + floor * 4) * scale, 4.7 * scale] }]);
    }
    const row = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, roughness: 0.86 }));
    row.position.set(x, 0, z);
    row.rotation.y = face;
    env.add(row);
    env.nightPoints([frame(x, z, face)(-14 * scale, 8 * scale, 5 * scale), frame(x, z, face)(0, 8 * scale, 5 * scale), frame(x, z, face)(14 * scale, 8 * scale, 5 * scale)], { color: '#ffd98f', size: 1 * scale });
  },
};

const scatter = {
  palmetto(batch, x, z, size, rand, env) {
    const trunk = env.material('#77624a', { roughness: 1 });
    const leaf = env.material('#3e7247', { roughness: 1, flatShading: true });
    const height = (4.8 + rand() * 2) * size;
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.28 * size, height, 7), trunk, { position: [x, height / 2, z] });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      batch.add(new THREE.ConeGeometry(0.7 * size, 3.6 * size, 5), leaf, { position: [x + Math.cos(angle) * 1.4 * size, height + 0.2 * size, z + Math.sin(angle) * 1.4 * size], rotation: [0, -angle, Math.PI / 2] });
    }
  },
};

export const kit = { landmarks, scatter };
