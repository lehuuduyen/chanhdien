// Virginia (vùng blossom): dãy Blue Ridge — sống núi dài đều, xanh lam xếp lớp ngoài cổng; đường Skyline Drive men theo
// sườn núi trước (vệt đường xám, ban đêm vài đèn xe), tường đá điểm ngắm bên đường; dưới chân là trang trại (farmstead
// chung: chuồng đỏ, silo, kiện cỏ khô), thêm một trang trại phía đông. Các lớp núi của vùng ẩn đi (states/va.json).
// Gần tường: hàng rào gỗ zíc zắc (vật rải chung).
import * as THREE from 'three';
import { outward, ridge } from './common.mjs';

const landmarks = {
  // Sống núi dài đều có đường men sườn. params: { span, height, road (vị trí đường 0–1 từ chân lên đỉnh) }.
  'blue-ridge'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 480;
    const height = (params.height || 34) * scale;
    const depth = 60 * scale;
    const phase = rand() * 6;
    const crest = (t) => height * (0.88 + 0.12 * Math.sin(t * 0.012 + phase)) + Math.sin(t * 0.05 + phase) * 1.5;
    const rise = (v) => Math.sin((v * Math.PI) / 2) ** 1.25;
    const road = params.road ?? 0.56;
    const far = (color) => env.far(color, { haze, flatShading: true, roughness: 1 });
    ridge(batch, x, z, {
      side, span, depth, crest, rise, ribs: 1.5, jag: 1.2, columns: 90, rows: 14, phase,
      bands: [[0, 0.3, far('#3f6650')], [0.3, road, far('#3d6157')], [road, road + 0.035, far('#6c6d6c')], [road + 0.035, 0.8, far('#40625d')], [0.8, 1, far('#4a6a72')]],
    });
    // Tường đá điểm ngắm bên đường và đèn xe ban đêm dọc đường.
    const stone = far('#8e877a');
    const point = (t, v) => [x + ax * t + ox * v * depth, crest(t) * rise(v) - 0.5, z + az * t + oz * v * depth];
    for (let t = -span * 0.1; t < span * 0.02; t += 3 * scale) {
      const [px, py, pz] = point(t, road - 0.01);
      batch.add(new THREE.BoxGeometry(ax ? 3 * scale : 0.6 * scale, 0.8 * scale, ax ? 0.6 * scale : 3 * scale), stone, { position: [px, py + 0.4 * scale, pz] });
    }
    const cars = [];
    for (let index = 0; index < 14; index += 1) cars.push(point((rand() - 0.5) * span * 0.9, road + 0.017).map((value, k) => (k === 1 ? value + 0.8 * scale : value)));
    env.nightPoints(cars, { color: '#fff1c0', size: 1.1 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
