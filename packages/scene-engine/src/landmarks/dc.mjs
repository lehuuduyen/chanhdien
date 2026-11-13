// Washington, D.C. (vùng blossom): đài tưởng niệm Washington (tháp obelisk trắng) ngoài cổng, xa phía sau là tòa Capitol
// mái vòm (capitol chung trong landmarks/common.mjs); bên phải là hồ Tidal Basin viền anh đào hồng với đài tưởng niệm
// Jefferson tròn mái vòm; phía đông là đài tưởng niệm Lincoln (đền hàng cột). Ban đêm tháp và mái vòm được rọi sáng, đèn
// đỏ đỉnh tháp. Các lớp núi của vùng ẩn đi (states/dc.json). Gần tường: ghế công viên.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  // Tháp obelisk: thân vuông thon, đoạn dưới đá màu nhạt hơn, chóp kim tự tháp; vòng cột cờ dưới chân. params: { height }.
  'washington-monument'(batch, x, z, scale, rand, env, { haze, params }) {
    const height = (params.height || 56) * scale;
    const base = height * 0.052;
    const lower = env.far('#efe9dc', { haze, flatShading: true, roughness: 0.9 });
    const upper = env.far('#e2d9c8', { haze, flatShading: true, roughness: 0.9 });
    const shaft = height * 0.9;
    const split = shaft * 0.3;
    const radius = (y) => (base + (base * 0.66 - base) * (y / shaft)) * Math.SQRT2;
    const piece = (y0, y1, material) => {
      const geometry = new THREE.CylinderGeometry(radius(y1), radius(y0), y1 - y0, 4);
      geometry.rotateY(Math.PI / 4);
      geometry.translate(x, y0 + (y1 - y0) / 2, z);
      return batch.add(geometry, material);
    };
    piece(0, split, lower);
    piece(split, shaft, upper);
    const tip = new THREE.ConeGeometry(radius(shaft), height - shaft, 4);
    tip.rotateY(Math.PI / 4);
    tip.translate(x, shaft + (height - shaft) / 2, z);
    batch.add(tip, upper);
    // Đêm: rọi sáng cả thân, đèn đỏ gần đỉnh.
    const glow = new THREE.CylinderGeometry(radius(shaft) * 1.01, radius(0) * 1.01, shaft, 4);
    glow.rotateY(Math.PI / 4);
    glow.translate(x, shaft / 2, z);
    env.nightMesh(glow, '#fff1d2', 0.28);
    env.nightPoints([[x + base, shaft * 0.98, z], [x - base, shaft * 0.98, z], [x, shaft * 0.98, z + base], [x, shaft * 0.98, z - base]], { color: '#ff3b30', size: 1.3 * scale });
    // Vòng cột cờ.
    const pole = env.far('#d9d6d0', { haze, flatShading: true });
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 6 * scale, 4), pole, { position: [x + Math.cos(angle) * 12 * scale, 3 * scale, z + Math.sin(angle) * 12 * scale] });
    }
  },

  // Hồ Tidal Basin: mặt nước tròn, viền anh đào hồng, bờ xa có đài Jefferson (tròn, hàng cột, mái vòm thấp). params:
  // { radius (m), trees }.
  'tidal-basin'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const r = (params.radius || 26) * scale;
    batch.add(new THREE.CircleGeometry(r, 28), env.far('#5f8fa6', { haze, flatShading: true, roughness: 0.3 }), { position: [x, 0.06, z], rotation: [-Math.PI / 2, 0, 0], scale: [1.3, 1, 1] });
    const bark = env.far('#4a3a32', { haze, flatShading: true });
    const pinks = ['#f4b8c8', '#f7cdd8', '#eda3b7'].map((color) => env.far(color, { haze, flatShading: true, roughness: 1 }));
    const trees = params.trees || 34;
    for (let index = 0; index < trees; index += 1) {
      const angle = (index / trees) * Math.PI * 2 + rand() * 0.1;
      const px = x + Math.cos(angle) * (r * 1.3 + 3 * scale);
      const pz = z + Math.sin(angle) * (r + 3 * scale);
      const h = (2.4 + rand() * 1) * scale;
      batch.add(new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, h, 5), bark, { position: [px, h / 2, pz] });
      for (let blob = 0; blob < 3; blob += 1) {
        batch.add(new THREE.IcosahedronGeometry((1.4 + rand() * 0.6) * scale, 0), pinks[Math.floor(rand() * pinks.length)], {
          position: [px + (rand() - 0.5) * 1.6 * scale, h + (0.4 + rand() * 0.8) * scale, pz + (rand() - 0.5) * 1.6 * scale], scale: [1.2, 0.8, 1.2],
        });
      }
    }
    // Đài Jefferson ở bờ xa (phía ngoài sân).
    const at = frame(x, z, face);
    const white = env.far('#f1eee6', { haze, flatShading: true, roughness: 0.9 });
    const [jx, , jz] = at(0, 0, -(r + 14 * scale));
    batch.add(new THREE.CylinderGeometry(11 * scale, 12 * scale, 3 * scale, 24), white, { position: [jx, 1.5 * scale, jz] });
    for (let index = 0; index < 20; index += 1) {
      const angle = (index / 20) * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.45 * scale, 0.5 * scale, 8 * scale, 6), white, { position: [jx + Math.cos(angle) * 9.5 * scale, 7 * scale, jz + Math.sin(angle) * 9.5 * scale] });
    }
    batch.add(new THREE.CylinderGeometry(10.2 * scale, 10.2 * scale, 1.6 * scale, 24), white, { position: [jx, 11.8 * scale, jz] });
    batch.add(new THREE.SphereGeometry(8.5 * scale, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, { position: [jx, 12.6 * scale, jz], scale: [1, 0.62, 1] });
  },

  // Đài Lincoln: đền hình hộp trên bệ bậc, hàng cột bao quanh, mái phẳng có tầng gác thấp. params: { width }.
  'lincoln-memorial'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const white = env.far('#f0ece2', { haze, flatShading: true, roughness: 0.9 });
    const shade = env.far('#d8d3c6', { haze, flatShading: true, roughness: 0.9 });
    const width = (params.width || 40) * scale;
    const depth = width * 0.64;
    batch.add(new THREE.BoxGeometry(width * 1.2, 4 * scale, depth * 1.3), shade, { position: at(0, 2 * scale, 0), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(width * 0.86, 13 * scale, depth * 0.8), shade, { position: at(0, 10.5 * scale, 0), rotation: [0, face, 0] });
    const cols = 12;
    for (let index = 0; index < cols; index += 1) {
      const dx = ((index + 0.5) / cols - 0.5) * width;
      for (const dz of [-depth / 2, depth / 2]) batch.add(new THREE.CylinderGeometry(0.75 * scale, 0.85 * scale, 13 * scale, 8), white, { position: at(dx, 10.5 * scale, dz) });
    }
    batch.add(new THREE.BoxGeometry(width * 1.04, 3 * scale, depth * 1.06), white, { position: at(0, 18.5 * scale, 0), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(width * 0.8, 3.4 * scale, depth * 0.74), white, { position: at(0, 21.7 * scale, 0), rotation: [0, face, 0] });
    env.nightGlow(...at(0, 10 * scale, depth / 2 + 1), 12 * scale, '#ffe3b0');
  },
};

const scatter = {
  // Ghế công viên: khung sắt đen, mặt ghế gỗ xanh lục.
  'park-bench'(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const wood = env.material('#3f6b4a', { flatShading: true });
    const iron = env.material('#26282a', { flatShading: true });
    batch.add(new THREE.BoxGeometry(1.8 * size, 0.08 * size, 0.45 * size), wood, { position: at(0, 0.45 * size, 0), rotation: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(1.8 * size, 0.4 * size, 0.06 * size), wood, { position: at(0, 0.75 * size, -0.22 * size), rotation: [0.2, yaw, 0], order: 'YXZ' });
    for (const dx of [-0.8, 0.8]) batch.add(new THREE.BoxGeometry(0.06 * size, 0.45 * size, 0.45 * size), iron, { position: at(dx * size, 0.22 * size, 0), rotation: [0, yaw, 0] });
  },
};

export const kit = { landmarks, scatter };
