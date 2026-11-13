// New Mexico (vùng desert): lễ hội khinh khí cầu Albuquerque — vài chục khinh khí cầu sọc múi nhiều màu lơ lửng khắp
// trời ngoài cổng và hai bên, trôi nhẹ (hai đàn, mỗi đàn một nhịp); ban đêm khinh khí cầu sáng rực như đêm "balloon
// glow". Sau lưng là dãy núi Sandia dài, vách đá hồng dựng đứng, đỉnh phủ rừng, dưới chân là đèn thành phố ban đêm. Núi
// bàn của vùng ẩn đi (states/nm.json). Gần tường: nhà đất adobe mái bằng có đầu xà gỗ và lò bánh hình tổ ong.
import * as THREE from 'three';
import { outward, paintMerge, ridge } from './common.mjs';

// Bộ màu khinh khí cầu: múi dọc xen kẽ (stripes) hoặc dải ngang (bands).
const PALETTES = [
  ['#e63946', '#f4d03f'], ['#1f6fd1', '#f5f5f0'], ['#2a9d8f', '#e9c46a', '#e76f51'], ['#8e44ad', '#f39c12'],
  ['#e63946', '#f39c12', '#f4d03f', '#2ecc71', '#1f6fd1', '#8e44ad'], ['#d62d6f', '#ffffff', '#24a0d8'], ['#f39c12', '#c0392b'],
  ['#16a085', '#f1c40f'], ['#2c3e91', '#e74c3c', '#ecf0f1'],
];
// Vỏ khinh khí cầu (bán kính, độ cao) từ miệng lên đỉnh; cao 20 m như khinh khí cầu thật.
const ENVELOPE = [[1.3, 0], [2.6, 2], [5.2, 6], [7, 10.5], [7.4, 13.5], [6.6, 16.5], [4.6, 18.8], [0.01, 20]];

// Một khinh khí cầu (các phần đã đặt đúng chỗ) vào danh sách parts của paintMerge; glow: phần vỏ để làm lớp sáng đêm.
function balloon(parts, glow, x, y, z, size, rand) {
  const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
  const profile = ENVELOPE.map(([r, h]) => new THREE.Vector2(r * size, h * size));
  const spin = rand() * Math.PI * 2;
  const place = { position: [x, y, z], rotation: [0, spin, 0] };
  if (rand() < 0.65) {
    // Múi dọc: 12 múi, màu xoay vòng theo bộ màu.
    const gores = 12;
    for (let index = 0; index < gores; index += 1) {
      parts.push([new THREE.LatheGeometry(profile, 1, (index / gores) * Math.PI * 2, (Math.PI * 2) / gores), palette[index % palette.length], place]);
    }
  } else {
    // Dải ngang: mỗi đoạn profile một màu.
    for (let index = 0; index < profile.length - 1; index += 1) {
      parts.push([new THREE.LatheGeometry([profile[index], profile[index + 1]], 12), palette[index % palette.length], place]);
    }
  }
  // Lớp sáng đêm: vỏ phóng nhỉnh hơn một chút để không nhấp nháy chồng mặt, sáng theo màu chính của quả.
  glow.push([new THREE.LatheGeometry(profile.slice(0, 7), 10), palette[0], { ...place, scale: [1.03, 1.01, 1.03] }]);
  parts.push([new THREE.BoxGeometry(1.2 * size, 1.1 * size, 1.2 * size), '#6b4a2b', { position: [x, y - 3.2 * size, z] }]);
  parts.push([new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 3 * size, 3), '#3b3b3b', { position: [x, y - 1.6 * size, z] }]);
}

const landmarks = {
  // Đàn khinh khí cầu: params.gate quả bay ngoài cổng, params.sides quả bay hai bên (đông + tây); mỗi đàn một mesh trôi
  // nhẹ (env.animate) kèm lớp sáng đêm đi theo.
  'balloon-fiesta'(batch, x, z, scale, rand, env, { haze, params }) {
    const { ground } = env;
    const material = env.far('#ffffff', { haze, vertexColors: true, roughness: 0.75 });
    const flock = (spots, sway) => {
      const parts = [];
      const glow = [];
      for (const [px, py, pz, size] of spots) balloon(parts, glow, px, py, pz, size * scale, rand);
      const mesh = new THREE.Mesh(paintMerge(parts), material);
      env.add(mesh);
      const light = env.nightMesh(paintMerge(glow), '#ffd9a8', 0.55, { vertexColors: true });
      mesh.add(light);
      env.animate((seconds) => {
        mesh.position.set(Math.sin(seconds * sway[0]) * 4, Math.sin(seconds * sway[1] + 1.3) * 2.5, Math.cos(seconds * sway[0] * 0.7) * 2);
      });
    };
    // Ngoài cổng: rải trên dải rộng, càng xa càng cao (xa thì nổi trên nền núi / trời).
    const front = [];
    for (let index = 0; index < (params.gate ?? 20); index += 1) {
      const away = 18 + rand() * 120;
      front.push([x + (rand() - 0.5) * (120 + away * 1.6), 14 + away * 0.28 + rand() * 22, ground.z[1] + away, 0.8 + rand() * 0.4]);
    }
    flock(front, [0.05, 0.11]);
    const sides = [];
    for (let index = 0; index < (params.sides ?? 12); index += 1) {
      const side = index % 2 ? 1 : -1;
      const away = 16 + rand() * 70;
      sides.push([side * (ground.x[1] + away), 16 + away * 0.3 + rand() * 20, ground.z[0] + rand() * (ground.z[1] - ground.z[0] + 40), 0.8 + rand() * 0.4]);
    }
    flock(sides, [0.04, 0.09]);
  },

  // Dãy Sandia: sống núi dài gần như bằng, vách tây dựng đứng nhiều gân đá màu hồng (Sandia = dưa hấu), đỉnh lốm đốm rừng
  // sẫm; đèn thành phố dưới chân ban đêm. params: { span (m), height (m), city (số đèn) }.
  sandia(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 420;
    const top = (params.height || 56) * scale;
    const depth = 50 * scale;
    // Độ cao sống núi theo vị trí dọc dãy: cao nhất lệch trái (đỉnh Sandia Crest), lượn sóng nhẹ.
    const phase = rand() * 6;
    const crest = (t) => top * (0.7 + 0.3 * Math.exp(-(((t + span * 0.12) / (span * 0.3)) ** 2))) + Math.sin(t * 0.05 + phase) * 3 + Math.sin(t * 0.13) * 1.5;
    // Mặt cắt ngang: chân thoải, vách đứng gần đỉnh.
    const rise = (v) => 0.16 * v + 0.84 * v ** 2.3;
    ridge(batch, x, z, {
      side, span, depth, crest, rise, ribs: 4, jag: 3, columns: 90, rows: 12, phase,
      bands: [
        [0, 0.42, env.far('#8f8068', { haze, flatShading: true, roughness: 1 })],
        [0.42, 0.93, env.far('#c08c86', { haze, flatShading: true, roughness: 1 })],
        [0.93, 1, env.far('#5e6450', { haze, flatShading: true, roughness: 1 })],
      ],
    });
    // Đồi chân núi lác đác cây bụi.
    const hill = env.far('#9b7f62', { haze, flatShading: true, roughness: 1 });
    for (let t = -span / 2; t < span / 2; t += 22 + rand() * 14) {
      const size = (8 + rand() * 8) * scale;
      batch.add(new THREE.SphereGeometry(size, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), hill, {
        position: [x + ax * t - ox * 6, 0, z + az * t - oz * 6], scale: [2, 0.35, 1.2],
      });
    }
    // Đèn thành phố dưới chân núi và leo lên sườn thấp.
    const lights = [];
    for (let index = 0; index < (params.city ?? 420); index += 1) {
      const t = (rand() - 0.5) * span;
      const d = -42 + rand() * 54;
      const v = Math.max(0, d / depth);
      lights.push([x + ax * t + ox * d, 0.8 + crest(t) * rise(v), z + az * t + oz * d]);
    }
    env.nightPoints(lights, { color: '#ffd9a0', size: 0.9 });
  },
};

const scatter = {
  // Nhà adobe: khối đất bo góc, tường chắn mái, đầu xà gỗ nhô, cửa gỗ xanh; có khi kèm lò bánh tổ ong (horno).
  adobe(batch, x, z, size, rand, env) {
    const wall = env.material(rand() < 0.5 ? '#c99a6b' : '#b98458', { flatShading: true });
    const w = (3 + rand() * 2) * size;
    const d = (2.6 + rand() * 1.6) * size;
    const h = (2.4 + rand() * 0.8) * size;
    const yaw = rand() * Math.PI;
    batch.add(new THREE.BoxGeometry(w, h, d), wall, { position: [x, h / 2, z], rotation: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(w * 0.55, h * 0.55, d * 0.7), wall, { position: [x + Math.cos(yaw) * w * 0.2, h + h * 0.27, z - Math.sin(yaw) * w * 0.2], rotation: [0, yaw, 0] });
    const viga = env.material('#6e4a2c', { flatShading: true });
    for (let index = 0; index < 4; index += 1) {
      const t = ((index + 0.5) / 4 - 0.5) * w * 0.9;
      batch.add(new THREE.CylinderGeometry(0.09 * size, 0.09 * size, d + 0.7 * size, 5), viga, {
        position: [x + Math.cos(yaw) * t, h * 0.86, z - Math.sin(yaw) * t], rotation: [Math.PI / 2, 0, yaw],
      });
    }
    batch.add(new THREE.BoxGeometry(0.9 * size, 1.7 * size, 0.1), env.material('#3f7f8c', { flatShading: true }), {
      position: [x + Math.sin(yaw) * (d / 2 + 0.03), 0.85 * size, z + Math.cos(yaw) * (d / 2 + 0.03)], rotation: [0, yaw, 0],
    });
    if (rand() < 0.5) {
      const r = 0.9 * size;
      batch.add(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), wall, { position: [x + Math.cos(yaw) * (w / 2 + 1.4 * size), 0, z - Math.sin(yaw) * (w / 2 + 1.4 * size)], scale: [1, 1.15, 1] });
    }
  },
};

export const kit = { landmarks, scatter };
