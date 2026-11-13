// Oklahoma: tượng thợ dầu cách điệu mạ vàng toàn thân, tay phải tì lên đỉnh tháp khoan nhỏ, tay trái buông (Claude sửa
// tư thế theo góp ý rà), tháp khoan và đất đỏ. Tượng là hình khối biểu trưng, không mô phỏng
// gương mặt người thật; tháp phía đông mở rộng đường chân trời và có đèn an toàn ban đêm.
import * as THREE from 'three';
import { beam, frame } from './common.mjs';

const landmarks = {
  'golden-driller'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const s = scale;
    const gold = env.far('#c99735', { haze, roughness: 0.68, metalness: 0.16 });
    const goldDark = env.far('#a87a2a', { haze, roughness: 0.75, metalness: 0.12 });
    const red = env.far('#a95536', { haze, roughness: 1 });
    const steel = env.far('#4c4f54', { haze, roughness: 0.8 });
    // Nền đất đỏ + bệ, tượng mạ vàng toàn thân: chân, ủng, thân áo, thắt lưng, đầu đội mũ bảo hộ.
    batch.add(new THREE.CylinderGeometry(15 * s, 17 * s, 1.2 * s, 10), red, { position: at(0, 0.6 * s, 0) });
    batch.add(new THREE.BoxGeometry(9 * s, 2 * s, 7 * s), goldDark, { position: at(0, 2.2 * s, 0), rotation: [0, face, 0] });
    for (const side of [-1, 1]) {
      beam(batch, at(side * 2.1 * s, 17.5 * s, 0), at(side * 2.9 * s, 4.6 * s, 0.3 * s), 3 * s, gold);
      batch.add(new THREE.BoxGeometry(3.2 * s, 1.6 * s, 4.6 * s), goldDark, { position: at(side * 2.9 * s, 4 * s, 0.9 * s), rotation: [0, face, 0] });
    }
    batch.add(new THREE.CylinderGeometry(4.4 * s, 4.9 * s, 12.5 * s, 10), gold, { position: at(0, 23.8 * s, 0), scale: [1, 1, 0.75] });
    batch.add(new THREE.CylinderGeometry(4.95 * s, 4.95 * s, 1 * s, 10), goldDark, { position: at(0, 18 * s, 0), scale: [1, 1, 0.76] });
    batch.add(new THREE.SphereGeometry(2.8 * s, 12, 8), gold, { position: at(0, 32.6 * s, 0) });
    batch.add(new THREE.CylinderGeometry(3.9 * s, 3.9 * s, 0.4 * s, 12), goldDark, { position: at(0, 34.1 * s, 0.3 * s) });
    batch.add(new THREE.SphereGeometry(2.9 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), goldDark, { position: at(0, 34.2 * s, 0), scale: [1, 0.85, 1.05] });
    // Tay trái buông dọc thân; tay phải tì lên đỉnh tháp khoan nhỏ đứng cạnh.
    beam(batch, at(5.2 * s, 28.8 * s, 0), at(6.3 * s, 22 * s, 0.4 * s), 2 * s, gold);
    beam(batch, at(6.3 * s, 22 * s, 0.4 * s), at(6.6 * s, 16.2 * s, 0.8 * s), 1.8 * s, gold);
    beam(batch, at(-5.2 * s, 28.8 * s, 0), at(-9.4 * s, 25.4 * s, 0.6 * s), 2 * s, gold);
    beam(batch, at(-9.4 * s, 25.4 * s, 0.6 * s), at(-13 * s, 26.4 * s, 0.4 * s), 1.8 * s, gold);
    const dx = -15 * s;
    const top = 26 * s;
    for (const ux of [-1, 1]) {
      for (const uz of [-1, 1]) beam(batch, at(dx + ux * 3.2 * s, 1.2 * s, uz * 3.2 * s), at(dx + ux * 0.9 * s, top, uz * 0.9 * s), 0.5 * s, steel);
    }
    for (let k = 0.15; k < 1; k += 0.2) {
      const half = (3.2 - 2.3 * k) * s;
      const y = 1.2 * s + (top - 1.2 * s) * k;
      for (const uz of [-1, 1]) beam(batch, at(dx - half, y, uz * half), at(dx + half, y, uz * half), 0.3 * s, steel);
      for (const ux of [-1, 1]) beam(batch, at(dx + ux * half, y, -half), at(dx + ux * half, y, half), 0.3 * s, steel);
    }
    batch.add(new THREE.BoxGeometry(2.6 * s, 0.6 * s, 2.6 * s), steel, { position: at(dx, top + 0.3 * s, 0), rotation: [0, face, 0] });
  },

  'oil-derrick'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const steel = env.far('#34393a', { haze, roughness: 0.72, metalness: 0.2 });
    const red = env.far('#a95536', { haze, roughness: 1 });
    const height = 38 * scale;
    batch.add(new THREE.CylinderGeometry(12 * scale, 14 * scale, 0.5 * scale, 10), red, { position: at(0, 0.25 * scale, 0) });
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(0.9 * scale, height, 0.9 * scale), steel, { position: at(side * 4.2 * scale, height / 2, 0), rotation: [0, 0, side * 0.12] });
      for (let level = 1; level < 6; level += 1) batch.add(new THREE.BoxGeometry(8.5 * scale, 0.45 * scale, 0.7 * scale), steel, { position: at(0, level * 6.2 * scale, 0), rotation: [0, face, level % 2 ? 0.18 : -0.18] });
    }
    batch.add(new THREE.ConeGeometry(5.1 * scale, 7 * scale, 4), steel, { position: at(0, height + 3.5 * scale, 0), rotation: [0, Math.PI / 4, 0] });
    env.nightPoints([at(0, 12 * scale, 0), at(0, 25 * scale, 0), at(0, height + 6 * scale, 0)], { color: '#ff6548', size: 0.95 * scale });
  },
};

const scatter = {
  prairie(batch, x, z, size, rand, env) {
    const grass = env.material(rand() < 0.5 ? '#768748' : '#9a8b4c', { roughness: 1 });
    batch.add(new THREE.ConeGeometry(0.15 * size, (1.1 + rand() * 0.8) * size, 4), grass, { position: [x, 0.6 * size, z], rotation: [0, rand() * Math.PI, (rand() - 0.5) * 0.2] });
  },
};

export const kit = { landmarks, scatter };
