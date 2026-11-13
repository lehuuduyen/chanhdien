// Connecticut (vùng autumn): cảng Mystic Seaport ngoài cổng — tàu săn cá voi cổ ba cột buồm (thân đen viền trắng có ô
// cửa pháo, buồm cuộn trên các trục ngang, dây chằng) neo bên cầu tàu gỗ; dãy nhà gỗ ván chồng nhiều màu của làng cảng;
// sau lưng là đồi rừng lá đỏ (đồi chung `hills`). Ban đêm đèn cầu tàu, đèn lồng trên tàu. Đồi của vùng ẩn đi
// (states/ct.json). Gần tường: tường đá khô xếp tay.
import * as THREE from 'three';
import { beam, frame } from './common.mjs';

const landmarks = {
  // Tàu buồm cổ nhìn ngang mạn (thân dọc tường). params: { length (m) }.
  'tall-ship'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const s = ((params.length || 34) / 34) * scale;
    const at = frame(x, z, face);
    const black = env.far('#1e1f22', { haze, flatShading: true, roughness: 0.8 });
    const white = env.far('#efece4', { haze, flatShading: true, roughness: 0.8 });
    const wood = env.far('#6b4a30', { haze, flatShading: true, roughness: 0.9 });
    const sail = env.far('#e6dcc4', { haze, flatShading: true, roughness: 1 });
    const rope = env.far('#3c342c', { haze, flatShading: true, roughness: 1 });
    const hull = (geometry, material, dx, dy) => batch.add(geometry, material, { position: at(dx * s, dy * s, 0), rotation: [0, face, 0] });
    hull(new THREE.BoxGeometry(28 * s, 4.2 * s, 8 * s), black, 0, 2.1);
    hull(new THREE.BoxGeometry(28.2 * s, 0.8 * s, 8.15 * s), white, 0, 3.2);
    // Mũi nhọn: lăng trụ tam giác nằm.
    const bow = new THREE.CylinderGeometry(4.6 * s, 4.6 * s, 4.2 * s, 3);
    bow.rotateY(Math.PI / 2);
    batch.add(bow, black, { position: at(14 * s, 2.1 * s, 0), rotation: [0, face, 0], scale: [1.2, 1, 0.87] });
    // Ô cửa pháo sơn trên dải trắng.
    for (let dx = -12; dx <= 12; dx += 2.4) hull(new THREE.BoxGeometry(0.8 * s, 0.5 * s, 8.25 * s), black, dx, 3.2);
    hull(new THREE.BoxGeometry(6 * s, 1.6 * s, 4 * s), wood, -9, 5);
    // Ba cột buồm, mỗi cột ba trục ngang có buồm cuộn; dây chằng từ đỉnh cột về mũi / lái / hai mạn.
    const masts = [[9, 26], [0, 29], [-9, 23]];
    for (const [dx, height] of masts) {
      const foot = at(dx * s, 4.2 * s, 0);
      const head = at(dx * s, height * s, 0);
      beam(batch, foot, head, 0.55 * s, wood);
      for (const [k, half] of [[0.45, 7], [0.68, 5.6], [0.88, 4]]) {
        const y = 4.2 + (height - 4.2) * k;
        beam(batch, at(dx * s, y * s, -half * s), at(dx * s, y * s, half * s), 0.3 * s, wood);
        beam(batch, at(dx * s, (y - 0.45) * s, -half * 0.95 * s), at(dx * s, (y - 0.45) * s, half * 0.95 * s), 0.75 * s, sail);
      }
      for (const side of [-1, 1]) beam(batch, head, at((dx - 1.5) * s, 4.4 * s, side * 4 * s), 0.12 * s, rope);
    }
    beam(batch, at(15.5 * s, 4.6 * s, 0), at(24 * s, 8 * s, 0), 0.4 * s, wood);
    beam(batch, at(9 * s, 26 * s, 0), at(24 * s, 8 * s, 0), 0.12 * s, rope);
    beam(batch, at(9 * s, 26 * s, 0), at(0, 29 * s, 0), 0.12 * s, rope);
    beam(batch, at(0, 29 * s, 0), at(-9 * s, 23 * s, 0), 0.12 * s, rope);
    beam(batch, at(-9 * s, 23 * s, 0), at(-14 * s, 4.4 * s, 0), 0.12 * s, rope);
    env.nightPoints([at(-13 * s, 6 * s, 0), at(13 * s, 6 * s, 0), at(0, 5.5 * s, 4.2 * s)], { color: '#ffcf7a', size: 1.2 * scale });
  },

  // Làng cảng: dãy nhà gỗ ván chồng nhiều màu mái dốc dọc bờ (phía sân), cầu tàu gỗ phía nước, cột đèn. params: { count }.
  'seaport-village'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const colors = ['#9b3328', '#efebe1', '#d9b44a', '#7d8a8f', '#3f5c78', '#efebe1'];
    const roof = env.far('#3f3d3b', { haze, flatShading: true, roughness: 0.9 });
    const wharf = env.far('#7b6650', { haze, flatShading: true, roughness: 1 });
    const count = params.count || 6;
    let dx = -count * 5.5 * scale;
    const lights = [];
    for (let index = 0; index < count; index += 1) {
      const w = (7 + rand() * 4) * scale;
      const h = (5 + rand() * 4) * scale;
      const d = 8 * scale;
      const wall = env.far(colors[index % colors.length], { haze, flatShading: true, roughness: 0.9 });
      batch.add(new THREE.BoxGeometry(w, h, d), wall, { position: at(dx + w / 2, h / 2, 6 * scale), rotation: [0, face, 0] });
      for (const side of [-1, 1]) {
        const slope = new THREE.BoxGeometry(w + 0.5 * scale, 0.25 * scale, d * 0.62);
        slope.rotateX(side * 0.65);
        batch.add(slope, roof, { position: at(dx + w / 2, h + 1.3 * scale, 6 * scale + side * d * 0.24), rotation: [0, face, 0] });
      }
      lights.push(at(dx + w / 2, h * 0.5, 6 * scale + d / 2 + 0.2));
      dx += w + 1.5 * scale;
    }
    batch.add(new THREE.BoxGeometry(-dx * 2 + 10 * scale, 0.5 * scale, 6 * scale), wharf, { position: at(0, 1.1 * scale, -3 * scale), rotation: [0, face, 0] });
    for (let px = dx; px < -dx; px += 6 * scale) {
      batch.add(new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 1.6 * scale, 5), wharf, { position: at(px, 0.6 * scale, -5.8 * scale) });
      if (Math.round(px / scale) % 12 === 0) lights.push(at(px, 3.2 * scale, -5.5 * scale));
    }
    env.nightPoints(lights, { color: '#ffd28a', size: 1.1 * scale });
  },
};

const scatter = {
  // Tường đá khô: đá xám xếp hai lớp thành một đoạn thẳng.
  'stone-wall'(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI;
    const length = (6 + rand() * 6) * size;
    const stones = ['#8b8a84', '#9a978e', '#7a7a74'].map((color) => env.material(color, { flatShading: true }));
    for (let t = -length / 2; t < length / 2; t += 0.55 * size) {
      for (const level of [0, 1]) {
        const r = (0.32 + rand() * 0.14) * size;
        batch.add(new THREE.DodecahedronGeometry(r, 0), stones[Math.floor(rand() * stones.length)], {
          position: [x + Math.cos(yaw) * t, r * 0.7 + level * 0.5 * size, z - Math.sin(yaw) * t], rotation: [rand() * 3, rand() * 3, 0], scale: [1.2, 0.8, 1],
        });
      }
    }
  },
};

export const kit = { landmarks, scatter };
