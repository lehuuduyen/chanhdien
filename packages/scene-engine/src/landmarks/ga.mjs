// Georgia: đại lộ sồi sống rủ rêu kiểu Savannah ngoài cổng và nhà vườn đào phía đông. Không dựng tượng khắc Stone
// Mountain. Các tán cây dùng chung vật liệu để hàng cây dài vẫn chỉ tốn ít mesh.
import * as THREE from 'three';
import { beam, frame } from './common.mjs';

// Sồi sống miền Nam: thân thấp to, cành vươn ngang (cành phía lối đi ngả vào giữa để hai hàng cây chụm thành vòm), tán
// rộng dẹt, rêu Tây Ban Nha xám rủ thành chùm dày dưới tán.
const addOak = (batch, at, dx, dz, scale, bark, leaf, moss, rand) => {
  const s = scale;
  batch.add(new THREE.CylinderGeometry(1 * s, 1.45 * s, 7 * s, 8), bark, { position: at(dx, 3.5 * s, dz) });
  const inward = dx > 0 ? -1 : 1;
  const limbs = [[inward * 9.5, 11.5, 1.5], [inward * 6, 12.5, -3], [-inward * 7, 10.5, 1], [-inward * 2, 11, 5]];
  const tips = [];
  for (const [ux, uy, uz] of limbs) {
    const tip = [dx + ux * s, uy * s, dz + uz * s];
    beam(batch, at(dx, 6.3 * s, dz), at(...tip), 0.85 * s, bark);
    tips.push(tip);
  }
  for (const [tx, ty, tz] of [...tips, [dx, 12.5 * s, dz]]) {
    batch.add(new THREE.IcosahedronGeometry(4.4 * s, 1), leaf, { position: at(tx, ty + 1.2 * s, tz), scale: [1.45, 0.55, 1.3] });
  }
  for (let strand = 0; strand < 16; strand += 1) {
    const [tx, ty, tz] = tips[strand % tips.length];
    const length = (3 + rand() * 2.6) * s;
    const strandGeometry = new THREE.ConeGeometry(0.42 * s, length, 5);
    strandGeometry.rotateX(Math.PI);
    batch.add(strandGeometry, moss, {
      position: at(tx + (rand() - 0.5) * 7 * s, ty - length / 2 + 0.6 * s, tz + (rand() - 0.5) * 5 * s),
    });
  }
};

const landmarks = {
  'savannah-oaks'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const bark = env.far('#5a4939', { haze, roughness: 1 });
    const leaf = env.far('#365f3d', { haze, roughness: 1, flatShading: true });
    const moss = env.far('#a1ab98', { haze, roughness: 1, flatShading: true });
    for (let row = 0; row < 7; row += 1) {
      const dz = -row * 14 * scale;
      addOak(batch, at, -14 * scale, dz, scale, bark, leaf, moss, rand);
      addOak(batch, at, 14 * scale, dz, scale, bark, leaf, moss, rand);
    }
    env.nightPoints([at(-7 * scale, 2.2 * scale, -8 * scale), at(7 * scale, 2.2 * scale, -8 * scale), at(0, 2.2 * scale, -40 * scale)], { color: '#ffd891', size: 1.1 * scale });
  },

  'peach-estate'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const wall = env.far('#e7d8bd', { haze, roughness: 0.88 });
    const roof = env.far('#8f4b38', { haze, roughness: 0.95 });
    const tree = env.far('#477044', { haze, roughness: 1, flatShading: true });
    const peach = env.far('#e78d72', { haze, roughness: 0.9, flatShading: true });
    batch.add(new THREE.BoxGeometry(25 * scale, 13 * scale, 12 * scale), wall, { position: at(0, 6.5 * scale, 0), rotation: [0, face, 0] });
    batch.add(new THREE.ConeGeometry(11 * scale, 9 * scale, 4), roof, { position: at(0, 19.5 * scale, 0), rotation: [0, Math.PI / 4 + face, 0], scale: [1.3, 1, 0.8] });
    for (let index = 0; index < 14; index += 1) {
      const px = (index % 7 - 3) * 6 * scale;
      const pz = (Math.floor(index / 7) * 7 - 14) * scale;
      batch.add(new THREE.CylinderGeometry(0.16 * scale, 0.27 * scale, 4.5 * scale, 6), roof, { position: at(px, 2.25 * scale, pz) });
      batch.add(new THREE.IcosahedronGeometry(1.8 * scale, 1), tree, { position: at(px, 5.2 * scale, pz), scale: [1.2, 0.85, 1] });
      for (let fruit = 0; fruit < 3; fruit += 1) batch.add(new THREE.SphereGeometry(0.27 * scale, 6, 4), peach, { position: at(px + (fruit - 1) * 0.8 * scale, (4.9 + fruit * 0.35) * scale, pz + 1.2 * scale) });
    }
    env.nightPoints([at(-7 * scale, 7 * scale, 6.2 * scale), at(7 * scale, 7 * scale, 6.2 * scale)], { color: '#ffd891', size: 1.05 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
