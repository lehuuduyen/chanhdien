// New Hampshire (vùng autumn): núi Washington — đỉnh cao nhất dãy Presidential, trọc đá xám nâu trên đường giới hạn cây,
// sườn dưới rừng thu đỏ cam vàng, rừng thông thẫm ở giữa; trên đỉnh là trạm khí tượng (khối nhà đá) và cột ăng-ten.
// Hồ lớn dưới chân. Ban đêm đèn trạm và đèn đỏ đỉnh ăng-ten. Đồi của vùng ẩn đi
// (states/nh.json); phía đông là đồi rừng thu (đồi chung `hills`).
import * as THREE from 'three';
import { outward, ridge } from './common.mjs';

const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));

const landmarks = {
  // params: { span, height }.
  'mount-washington'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 480;
    const height = (params.height || 60) * scale;
    const depth = 90 * scale;
    const phase = rand() * 6;
    // Đỉnh Washington lệch trái, các đỉnh Presidential thấp dần sang phải.
    const peaks = [[20, 1, 55], [-40, 0.86, 40], [-90, 0.8, 36], [-140, 0.72, 40], [90, 0.7, 45], [160, 0.6, 50]];
    const crest = (t) => height * (0.42 + 0.58 * Math.max(...peaks.map(([at, h, w]) => h * bump(t, at, w)))) + Math.sin(t * 0.09 + phase) * 1.5;
    const rise = (v) => v ** 1.1;
    const far = (color) => env.far(color, { haze, flatShading: true, roughness: 1 });
    ridge(batch, x, z, {
      side, span, depth, crest, rise, ribs: 3, jag: 2.5, columns: 100, rows: 14, phase,
      bands: [[0, 0.34, far('#8f5a34')], [0.34, 0.6, far('#33503a')], [0.6, 0.85, far('#857c72')], [0.85, 1, far('#9a9187')]],
    });
    const point = (t, v) => [x + ax * t + ox * v * depth, crest(t) * rise(v) - 0.5, z + az * t + oz * v * depth];
    // Rừng thu lốm đốm trên sườn dưới: cụm tán đỏ, cam, vàng xen thông thẫm.
    const tones = ['#b8452a', '#d0782c', '#c9a03a', '#a83a26', '#3a5a3c'].map(far);
    for (let index = 0; index < 220; index += 1) {
      const t = (rand() - 0.5) * span * 0.96;
      const v = 0.02 + rand() * 0.42;
      const r = (3 + rand() * 2.5) * scale;
      const [px, py, pz] = point(t, v);
      batch.add(new THREE.IcosahedronGeometry(r, 0), tones[Math.floor(rand() * tones.length)], { position: [px, py + r * 0.3, pz], scale: [1.2, 0.7, 1.2] });
    }
    // Trạm khí tượng + cột ăng-ten trên đỉnh.
    const [sx, sy, sz] = point(20, 0.97);
    const stone = far('#6f6a64');
    batch.add(new THREE.BoxGeometry(12 * scale, 5 * scale, 8 * scale), stone, { position: [sx, sy + 2 * scale, sz] });
    batch.add(new THREE.CylinderGeometry(2.4 * scale, 2.6 * scale, 8 * scale, 10), stone, { position: [sx + 7 * scale, sy + 4 * scale, sz] });
    const mast = 16 * scale;
    batch.add(new THREE.CylinderGeometry(0.35 * scale, 0.6 * scale, mast, 5), far('#c9c6c0'), { position: [sx - 5 * scale, sy + mast / 2, sz] });
    for (let k = 0.3; k < 1; k += 0.25) batch.add(new THREE.BoxGeometry(3 * scale, 0.25 * scale, 0.25 * scale), far('#c9c6c0'), { position: [sx - 5 * scale, sy + mast * k, sz] });
    env.nightPoints([[sx - 5 * scale, sy + mast + 0.5 * scale, sz], [sx - 5 * scale, sy + mast * 0.55, sz]], { color: '#ff3b30', size: 1.6 * scale });
    // Cửa sổ trạm (mặt quay về sân).
    const front = (dx, dy) => [sx + ax * dx - ox * 4.3 * scale, sy + dy, sz + az * dx - oz * 4.3 * scale];
    env.nightPoints([front(-2 * scale, 2.5 * scale), front(2 * scale, 2.5 * scale), front(7 * scale, 6 * scale)], { color: '#ffd28a', size: 1.2 * scale });
  },

  // Hồ: mặt nước dọc tường, vài đảo nhỏ có cây. params: { width, depth }.
  lake(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const width = (params.width || 300) * scale;
    const depth = (params.depth || 50) * scale;
    batch.add(new THREE.PlaneGeometry(1, 1), env.far('#4f7f96', { haze, flatShading: true, roughness: 0.25 }), {
      position: [x + ox * depth / 2, 0.06, z + oz * depth / 2], rotation: [-Math.PI / 2, 0, 0], scale: ax ? [width, depth, 1] : [depth, width, 1],
    });
    for (let index = 0; index < 3; index += 1) {
      const t = (rand() - 0.5) * width * 0.7;
      const d = depth * (0.3 + rand() * 0.4);
      const px = x + ax * t + ox * d;
      const pz = z + az * t + oz * d;
      batch.add(new THREE.SphereGeometry(5 * scale, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), env.far('#5e6a3c', { haze, flatShading: true }), { position: [px, 0, pz], scale: [1, 0.35, 0.8] });
      for (let tree = 0; tree < 4; tree += 1) {
        batch.add(new THREE.ConeGeometry(1.4 * scale, 5 * scale, 6), env.far(tree % 2 ? '#2f4a32' : '#c8562a', { haze, flatShading: true }), {
          position: [px + (rand() - 0.5) * 6 * scale, 3 * scale, pz + (rand() - 0.5) * 4 * scale],
        });
      }
    }
  },
};

export const kit = { landmarks, scatter: {} };
