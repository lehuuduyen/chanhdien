// Alabama: tên lửa Saturn V cách điệu dựng đứng trên bệ Huntsville, không logo / chữ thương hiệu. Phía đông là nhà
// ép bông cao và các kiện bông gần tường; ban đêm đèn rọi gom thành một cụm điểm.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  'saturn-rocket'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const white = env.far('#ecebdc', { haze, roughness: 0.72 });
    const dark = env.far('#20292d', { haze, roughness: 0.7, metalness: 0.12 });
    const red = env.far('#a83c31', { haze, roughness: 0.78 });
    batch.add(new THREE.CylinderGeometry(13 * scale, 14 * scale, 1.2 * scale, 14), dark, { position: at(0, 0.6 * scale, 0) });
    batch.add(new THREE.CylinderGeometry(4.2 * scale, 5.1 * scale, 38 * scale, 14), white, { position: at(0, 20 * scale, 0) });
    batch.add(new THREE.CylinderGeometry(3.2 * scale, 4.2 * scale, 11 * scale, 14), white, { position: at(0, 44.5 * scale, 0) });
    batch.add(new THREE.ConeGeometry(3.2 * scale, 9 * scale, 14), white, { position: at(0, 54.5 * scale, 0) });
    for (const y of [9, 31, 39]) batch.add(new THREE.CylinderGeometry(5.15 * scale, 5.15 * scale, 1.25 * scale, 14), dark, { position: at(0, y * scale, 0) });
    for (const side of [-1, 1]) {
      batch.add(new THREE.ConeGeometry(3.2 * scale, 9 * scale, 4), red, {
        position: at(side * 5.2 * scale, 5.1 * scale, 0), rotation: [0, Math.PI / 4, side * 0.22], scale: [0.38, 1, 1],
      });
    }
    env.nightPoints([at(-7 * scale, 2 * scale, 5 * scale), at(7 * scale, 2 * scale, 5 * scale), at(0, 56 * scale, 0)], { color: '#fff0bf', size: 2.2 * scale });
  },

  'cotton-gin'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const wall = env.far('#ddd4bd', { haze, roughness: 0.9 });
    const roof = env.far('#824b38', { haze, roughness: 0.95 });
    batch.add(new THREE.BoxGeometry(27 * scale, 16 * scale, 14 * scale), wall, { position: at(0, 8 * scale, 0), rotation: [0, face, 0] });
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(28 * scale, 0.8 * scale, 9.5 * scale), roof, {
      position: at(0, 19.3 * scale, side * 3.6 * scale), rotation: [side * 0.62, face, 0], order: 'YXZ',
    });
    batch.add(new THREE.CylinderGeometry(1.5 * scale, 1.8 * scale, 20 * scale, 9), roof, { position: at(9 * scale, 27 * scale, -3 * scale) });
    env.nightPoints([at(-8 * scale, 9 * scale, 7.2 * scale), at(0, 9 * scale, 7.2 * scale), at(8 * scale, 9 * scale, 7.2 * scale)], { color: '#ffd58c', size: 0.9 * scale });
  },
};

const scatter = {
  'cotton-bale'(batch, x, z, size, rand, env) {
    const wrap = env.material('#eee9d9', { roughness: 1 });
    const strap = env.material('#6f5840', { roughness: 0.95 });
    batch.add(new THREE.BoxGeometry(1.7 * size, 1.15 * size, 1.25 * size), wrap, { position: [x, 0.58 * size, z], rotation: [0, rand() * Math.PI, 0] });
    batch.add(new THREE.BoxGeometry(1.82 * size, 0.14 * size, 1.36 * size), strap, { position: [x, 0.58 * size, z], rotation: [0, rand() * Math.PI, 0] });
  },
};

export const kit = { landmarks, scatter };
