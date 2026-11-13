// Utah (vùng desert): vòm đá Delicate Arch đứng một mình trên gờ đá trơn ngoài cổng, sau lưng là dãy núi La Sal phủ
// tuyết (như tấm ảnh quen thuộc); bên trái cổng và phía đông là rừng cột đá hoodoo kiểu Bryce Canyon (cột cam trắng thắt
// eo, mũ đá sẫm) dựa lưng vào vách hồng. Núi bàn của vùng ẩn đi (states/ut.json). Gần tường: tảng đá đỏ tròn và cây bách
// xù (juniper).
import * as THREE from 'three';
import { along, frame, outward, ridge, sweep } from './common.mjs';

// Đường giữa thân vòm (mét, trước khi phóng): chân trái → đỉnh → chân phải, nhìn từ sân. Vòm cao hơn rộng, đỉnh hơi
// lệch, chân phải choãi.
const ARCH = [[-5.6, -1], [-5.9, 3], [-6.1, 7], [-5.7, 10.5], [-4.4, 13.4], [-2, 15], [1.2, 15.1], [3.7, 13.8], [5.2, 11], [5.9, 7], [6.2, 3], [6.5, -1]];
// Bề dày trong mặt vòm: chân trái thắt "mắt cá" sát chân, đỉnh là một khối dày, chân phải to nhất.
const ARCH_ACROSS = along([[0, 1.4], [0.05, 0.75], [0.14, 1.1], [0.3, 1.35], [0.42, 1.9], [0.52, 2.3], [0.62, 2], [0.75, 1.5], [0.9, 2], [1, 2.6]]);
const ARCH_DEEP = along([[0, 1.1], [0.05, 0.7], [0.3, 1], [0.5, 1.6], [0.7, 1.15], [1, 1.6]]);
// Đá lồi lõm: méo mặt cắt theo t và góc (hàm cố định nên các đoạn nối khít).
const ROUGH = (t, angle) => 1 + 0.13 * Math.sin(t * 41 + angle * 2) + 0.08 * Math.sin(t * 97 + angle * 5 + 1.3);

// Cột hoodoo: cột mảnh thắt eo nhiều chỗ, thân cam, khúc trên trắng hồng, đôi khi có mũ đá sẫm.
function hoodoo(batch, x, z, height, rand, mats) {
  const width = (0.085 + rand() * 0.05) * height;
  const phase = rand() * 6;
  const waves = 2.5 + rand() * 2;
  const profile = [];
  for (let index = 0; index <= 8; index += 1) {
    const y = index / 8;
    const r = width * (1.35 - 0.6 * y) * (1 + 0.22 * Math.sin(y * waves * Math.PI * 2 + phase)) * (0.9 + rand() * 0.2);
    profile.push([index === 8 ? r * 0.55 : r, y]);
  }
  const split = 0.5 + rand() * 0.2;
  const lower = profile.filter(([, y]) => y <= split + 0.07).map(([r, y]) => new THREE.Vector2(r, y * height));
  const upper = profile.filter(([, y]) => y >= lower[lower.length - 1].y / height - 1e-6).map(([r, y]) => new THREE.Vector2(r, y * height));
  batch.add(new THREE.LatheGeometry(lower, 6), mats.body[Math.floor(rand() * mats.body.length)], { position: [x, 0, z], rotation: [0, rand() * 3, 0] });
  batch.add(new THREE.LatheGeometry(upper, 6), rand() < 0.6 ? mats.top : mats.pink, { position: [x, 0, z], rotation: [0, rand() * 3, 0] });
  if (rand() < 0.45) batch.add(new THREE.DodecahedronGeometry(width * 0.9, 0), mats.cap, { position: [x, height * 1.01, z], rotation: [rand() * 3, rand() * 3, 0], scale: [1.3, 0.45, 1.1] });
}

const landmarks = {
  // Delicate Arch trên bệ đá giữa lòng chảo đá trơn (mặt vòm quay về sân). Cao ~27 m khi scale 1 (thật 16 m, phóng để
  // đứng xa thấy).
  'delicate-arch'(batch, x, z, scale, rand, env, { face, haze }) {
    const s = 1.5 * scale;
    const at = frame(x, z, face);
    const rock = env.far('#bf5e2f', { haze, flatShading: true, roughness: 1 });
    const cap = env.far('#cf7a42', { haze, flatShading: true, roughness: 1 });
    const pale = env.far('#e2b98e', { haze, flatShading: true, roughness: 1 });
    const slick = env.far('#d9a875', { haze, flatShading: true, roughness: 1 });
    const slickDark = env.far('#c48b5c', { haze, flatShading: true, roughness: 1 });
    const base = 2.4 * scale;
    // Lòng chảo đá trơn: vòm thấp rộng, thêm vài gờ đá tròn.
    batch.add(new THREE.SphereGeometry(30 * scale, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), slick, { position: [x, 0, z], scale: [1, 0.08, 0.8] });
    for (let index = 0; index < 7; index += 1) {
      const angle = rand() * Math.PI * 2;
      const reach = (12 + rand() * 14) * scale;
      const size = (3 + rand() * 4) * scale;
      batch.add(new THREE.SphereGeometry(size, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), slickDark, {
        position: [x + Math.cos(angle) * reach, 0, z + Math.sin(angle) * reach], scale: [1.4, 0.45, 1],
      });
    }
    const points = ARCH.map(([dx, dy]) => at(dx * s, base + dy * s, 0));
    const axis = [Math.sin(face), 0, Math.cos(face)];
    const radius = (t) => [ARCH_ACROSS(t) * s, ARCH_DEEP(t) * s];
    const piece = (from, to, material, steps) => batch.add(sweep(points, { axis, radius, steps, from, to, radial: 8, wobble: ROUGH }), material);
    // Chân vòm nhạt màu (lớp đá dưới), thân cam đỏ, khối đỉnh sáng hơn.
    piece(0, 0.07, pale, 3);
    piece(0.07, 0.36, rock, 9);
    piece(0.36, 0.66, cap, 10);
    piece(0.66, 0.92, rock, 8);
    piece(0.92, 1, pale, 3);
    // Bệ đá nhạt dưới hai chân.
    for (const [dx, size] of [[-5.6, 2.4], [6.4, 3.2]]) {
      batch.add(new THREE.DodecahedronGeometry(size * s * 0.7, 0), pale, { position: at(dx * s, base - size * 0.35, 0), rotation: [0, rand() * 3, 0], scale: [1.4, 0.55, 1.1] });
    }
  },

  // Dãy La Sal: sống núi nhiều đỉnh, sườn rừng xanh thẫm, đá tím xám, đỉnh phủ tuyết. params: { span (m), height (m) }.
  'la-sal'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 360;
    const height = (params.height || 50) * scale;
    // Các đỉnh: đỉnh giữa (núi Peale) cao nhất.
    const peaks = Array.from({ length: 7 }, (_, index) => {
      const t = ((index + 0.5) / 7 - 0.5) * span * 0.9 + (rand() - 0.5) * 20;
      return [t, height * (0.62 + 0.38 * (1 - Math.abs(t) / (span * 0.55))) * (0.85 + rand() * 0.2), 18 + rand() * 16];
    });
    const crest = (t) => Math.max(height * 0.42, ...peaks.map(([at, h, w]) => h * Math.exp(-(((t - at) / w) ** 2))));
    const phase = rand() * 6;
    ridge(batch, x, z, {
      side, span, depth: 70 * scale, crest, rise: (v) => v ** 1.25, ribs: 3, jag: 2.5, columns: 72, rows: 10, phase,
      bands: [
        [0, 0.45, env.far('#5c6a56', { haze, flatShading: true, roughness: 1 })],
        [0.45, 0.74, env.far('#7c7488', { haze, flatShading: true, roughness: 1 })],
        [0.74, 1, env.far('#eef0f5', { haze, flatShading: true, roughness: 0.9 })],
      ],
    });
  },

  // Rừng cột hoodoo kiểu giảng đường Bryce: nhiều hàng cột mảnh (hàng sau cao hơn) dựa vào vách vành hai tầng (cam dưới,
  // trắng hồng trên). params: { width (m dọc tường), depth (m), count }.
  hoodoos(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const width = params.width || 70;
    const depth = params.depth || 26;
    const count = params.count || 80;
    const mats = {
      body: ['#cf6e36', '#d98149', '#c45f2f', '#de8f5c'].map((color) => env.far(color, { haze, flatShading: true, roughness: 1 })),
      top: env.far('#efd8bd', { haze, flatShading: true, roughness: 1 }),
      pink: env.far('#e3a98a', { haze, flatShading: true, roughness: 1 }),
      cap: env.far('#8a5a3c', { haze, flatShading: true, roughness: 1 }),
    };
    // Hàng cột: mỗi hàng một vệt dọc dãy, cột cách nhau 2–4 m, có khoảng hở như các vây đá vỡ.
    const rows = 5;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(rand() * rows);
      const t = (rand() - 0.5) * width * (1 - row * 0.06);
      const d = (row + rand() * 0.6) * (depth / rows);
      const height = (8 + row * 2.6 + rand() * 6) * scale;
      hoodoo(batch, x + ax * t + ox * d, z + az * t + oz * d, height, rand, mats);
    }
    // Vách vành sau lưng: lưới cao độ hai dải màu, mép đỉnh lởm chởm.
    const phase = rand() * 6;
    ridge(batch, x + ox * depth, z + oz * depth, {
      side, span: width + 30, depth: 14, crest: (t) => (24 + Math.sin(t * 0.21 + phase) * 3) * scale, rise: (v) => v ** 0.8, ribs: 2.2, jag: 1.6, columns: 40, rows: 6, phase,
      bands: [[0, 0.55, mats.body[0]], [0.55, 1, mats.top]],
    });
  },
};

const scatter = {
  // Tảng đá đỏ tròn trơn nhẵn, có khi chồng hai tảng.
  redrock(batch, x, z, size, rand, env) {
    const r = (0.8 + rand() * 1.4) * size;
    const color = rand() < 0.5 ? '#c0663a' : '#d08a5a';
    batch.add(new THREE.SphereGeometry(r, 7, 5), env.material(color, { flatShading: true }), { position: [x, r * 0.35, z], scale: [1.3, 0.7, 1.1] });
    if (rand() < 0.35) batch.add(new THREE.SphereGeometry(r * 0.6, 7, 5), env.material('#b55a33', { flatShading: true }), { position: [x + r * 0.2, r * 0.95, z], scale: [1.2, 0.75, 1] });
  },
  // Bách xù: thân xoắn xám bạc, tán xanh xám thưa.
  juniper(batch, x, z, size, rand, env) {
    const height = (1.6 + rand() * 1.2) * size;
    const lean = (rand() - 0.5) * 0.4;
    batch.add(new THREE.CylinderGeometry(0.1 * size, 0.2 * size, height, 5), env.material('#8a7e6e', { flatShading: true }), {
      position: [x, height / 2, z], rotation: [lean, 0, lean * 0.6],
    });
    for (let index = 0; index < 3; index += 1) {
      const r = (0.6 + rand() * 0.5) * size;
      batch.add(new THREE.IcosahedronGeometry(r, 0), env.material(rand() < 0.5 ? '#5f6f4c' : '#6d7a57', { flatShading: true }), {
        position: [x + (rand() - 0.5) * size, height * (0.7 + rand() * 0.4), z + (rand() - 0.5) * size], scale: [1.2, 0.8, 1.1],
      });
    }
  },
};

export const kit = { landmarks, scatter };
