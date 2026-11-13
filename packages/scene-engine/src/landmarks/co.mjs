// Colorado (vùng snow): hai chóp tháp Maroon Bells đỏ tía cuối thung lũng ngoài cổng — vân đá nằm ngang, tuyết đọng trên
// các gờ thành sọc trắng; hai sườn thung lũng rừng vân sam xanh thẫm, chân sườn rừng dương lá vàng mùa thu; hồ Maroon lặng
// trước núi. Ban đêm: đèn nhà gỗ (vật rải chung cabin). Núi của vùng ẩn đi (states/co.json). Gần tường: cây dương vàng.
import * as THREE from 'three';
import { outward, ridge } from './common.mjs';

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Chóp nhọn: tam giác sườn hơi lõm.
const spike = (t, at, width) => Math.max(0, 1 - Math.abs(t - at) / width) ** 1.35;

const landmarks = {
  // Maroon Bells: khối núi hai chóp (Maroon Peak bên trái nhìn từ sân, North Maroon bên phải), sọc gờ tuyết. params:
  // { span (m), height (m) }.
  'maroon-bells'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 260;
    const height = (params.height || 66) * scale;
    const phase = rand() * 6;
    // Trục dọc tường của phía cổng là +x, nhìn từ sân +x ở bên trái.
    const crest = (t) => height * (0.42 + Math.max(0.58 * spike(t, 26, 46), 0.53 * spike(t, -24, 40), 0.2 * spike(t, 0, 70)))
      + Math.sin(t * 0.21 + phase) * 1.5;
    const maroon = env.far('#7b3f46', { haze, flatShading: true, roughness: 1 });
    const dark = env.far('#5e3037', { haze, flatShading: true, roughness: 1 });
    const ledge = env.far('#eef0f4', { haze, flatShading: true, roughness: 0.9 });
    const bands = [[0, 0.14, env.far('#8b6c66', { haze, flatShading: true, roughness: 1 })]];
    // Vân đá: dải đỏ tía xen dải sẫm; tuyết chỉ đọng trên vài gờ ở nửa trên (mỏng, thưa dần xuống dưới).
    const ledges = new Set([3, 5, 7, 8]);
    for (let v = 0.14, index = 0; v < 0.95; v += 0.09, index += 1) {
      const next = Math.min(0.95, v + 0.09);
      const end = ledges.has(index) ? next - 0.022 : next;
      bands.push([v, end, index % 2 ? dark : maroon]);
      if (end < next) bands.push([end, next, ledge]);
    }
    bands.push([0.95, 1, ledge]);
    ridge(batch, x, z, { side, span, depth: 70 * scale, crest, rise: (v) => v ** 0.95, ribs: 2.5, jag: 2, columns: 70, rows: 24, phase, bands });
    // Hồ Maroon: mặt nước lặng trước chân núi.
    const [ox, oz] = outward(side);
    const water = env.far('#4f7f97', { haze, flatShading: true, roughness: 0.25 });
    const lake = ox ? [60 * scale, 1, 120 * scale] : [120 * scale, 1, 60 * scale];
    batch.add(new THREE.PlaneGeometry(1, 1), water, {
      position: [x - ox * 45 * scale, 0.06, z - oz * 45 * scale], rotation: [-Math.PI / 2, 0, 0], scale: [lake[0], lake[2], 1],
    });
  },

  // Hai sườn thung lũng: rừng vân sam sẫm, chân sườn dương vàng, đỉnh đá xám; khe giữa mở về phía Maroon Bells.
  // params: { span, height, open (nửa bề ngang khe, m) }.
  'aspen-valley'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 480;
    const height = (params.height || 40) * scale;
    const open = (params.open || 50) * scale;
    const phase = rand() * 6;
    const crest = (t) => (height + Math.sin(t * 0.035 + phase) * 6 + Math.sin(t * 0.11) * 2) * smooth(open, open + 70 * scale, Math.abs(t));
    ridge(batch, x, z, {
      side, span, depth: 70 * scale, crest, rise: (v) => Math.min(1, v / 0.6) ** 0.9, ribs: 2, jag: 2.2, columns: 80, rows: 12, phase,
      bands: [
        [0, 0.12, env.far('#d9a72a', { haze, flatShading: true, roughness: 1 })],
        [0.12, 0.2, env.far('#c98a22', { haze, flatShading: true, roughness: 1 })],
        [0.2, 0.3, env.far('#e2b83a', { haze, flatShading: true, roughness: 1 })],
        [0.3, 0.8, env.far('#2f4a35', { haze, flatShading: true, roughness: 1 })],
        [0.8, 1, env.far('#7a7570', { haze, flatShading: true, roughness: 1 })],
      ],
    });
  },
};

const scatter = {
  // Cây dương: thân trắng mảnh có đốm sẫm, tán tròn lá vàng (vài cây cam).
  aspen(batch, x, z, size, rand, env) {
    const height = (3.2 + rand() * 2) * size;
    batch.add(new THREE.CylinderGeometry(0.09 * size, 0.13 * size, height, 6), env.material('#e9e5da'), { position: [x, height / 2, z] });
    batch.add(new THREE.BoxGeometry(0.2 * size, 0.08 * size, 0.2 * size), env.material('#3a3632'), { position: [x, height * 0.35, z] });
    const crown = env.material(rand() < 0.2 ? '#e0822a' : rand() < 0.5 ? '#e3b52f' : '#f0c63e', { flatShading: true });
    for (let index = 0; index < 3; index += 1) {
      const r = (0.75 + rand() * 0.4) * size;
      batch.add(new THREE.IcosahedronGeometry(r, 0), crown, {
        position: [x + (rand() - 0.5) * 0.8 * size, height * (0.72 + index * 0.12), z + (rand() - 0.5) * 0.8 * size], scale: [0.9, 1.25, 0.9],
      });
    }
  },
};

export const kit = { landmarks, scatter };
