// Montana (vùng snow): dãy núi răng cưa công viên Glacier ngoài cổng — đá trầm tích sọc xám, đỏ (argillite đỏ), xanh lục,
// chóp sừng nhọn ở giữa, tuyết đọng thành mảng trên cao; hồ băng xanh ngọc dưới chân, bên bờ là khách sạn kiểu nhà gỗ
// Thụy Sĩ nhiều đầu hồi (ban đêm sáng đèn cửa sổ). Núi của vùng ẩn đi (states/mt.json). Gần tường: bò rừng bison, hàng
// rào gỗ zíc zắc (vật rải chung).
import * as THREE from 'three';
import { frame, outward, ridge } from './common.mjs';

const spike = (t, at, width) => Math.max(0, 1 - Math.abs(t - at) / width) ** 1.5;

const landmarks = {
  // Dãy răng cưa: nhiều chóp nhọn cao thấp, chóp sừng giữa cao nhất; sọc đá theo dải. params: { span, height }.
  'glacier-range'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 480;
    const height = (params.height || 58) * scale;
    const phase = rand() * 6;
    const teeth = Array.from({ length: 13 }, (_, index) => [((index + 0.5) / 13 - 0.5) * span + (rand() - 0.5) * 16, 0.55 + rand() * 0.3, 14 + rand() * 10]);
    teeth.push([6, 1, 26]);
    const crest = (t) => height * (0.5 + 0.5 * Math.max(...teeth.map(([at, h, w]) => h * spike(t, at, w)))) + Math.sin(t * 0.3 + phase) * 1.2;
    const far = (color) => env.far(color, { haze, flatShading: true, roughness: 1 });
    ridge(batch, x, z, {
      side, span, depth: 60 * scale, crest, rise: (v) => Math.min(1, v / 0.85) ** 1.1, ribs: 3, jag: 4.5, columns: 110, rows: 16, phase,
      bands: [
        [0, 0.22, far('#2f4632')],
        [0.22, 0.4, far('#6f6a64')],
        [0.4, 0.5, far('#8e5246')],
        [0.5, 0.62, far('#7d7469')],
        [0.62, 0.7, far('#5f7458')],
        [0.7, 0.86, far('#857b70')],
        [0.86, 1, env.far('#f1f3f7', { haze, flatShading: true, roughness: 0.9 })],
      ],
    });
    // Hồ băng xanh ngọc dưới chân núi.
    const [ox, oz] = outward(side);
    const lake = ox ? [70 * scale, 300 * scale] : [300 * scale, 70 * scale];
    batch.add(new THREE.PlaneGeometry(1, 1), env.far('#3fb2ad', { haze, flatShading: true, roughness: 0.25 }), {
      position: [x - ox * 36 * scale, 0.06, z - oz * 36 * scale], rotation: [-Math.PI / 2, 0, 0], scale: [lake[0], lake[1], 1],
    });
  },

  // Khách sạn bên hồ kiểu nhà gỗ Thụy Sĩ: thân dài nhiều tầng, mái dốc nhiều đầu hồi, ban công trắng, cửa sổ sáng đèn
  // ban đêm. params: { width (m) }.
  lodge(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const width = (params.width || 44) * scale;
    const wall = env.far('#8a5a36', { haze, flatShading: true, roughness: 0.9 });
    const trim = env.far('#efe9dc', { haze, flatShading: true, roughness: 0.9 });
    const roof = env.far('#4c5a4c', { haze, flatShading: true, roughness: 0.9 });
    const depth = 12 * scale;
    const windows = [];
    const wings = [[-width * 0.3, width * 0.42, 13], [width * 0.18, width * 0.36, 15], [width * 0.42, width * 0.18, 11]];
    for (const [dx, w, tall] of wings) {
      const h = tall * scale;
      batch.add(new THREE.BoxGeometry(w, h, depth), wall, { position: at(dx, h / 2, 0), rotation: [0, face, 0] });
      for (const s of [-1, 1]) {
        const slope = new THREE.BoxGeometry(w + 1.2 * scale, 0.5 * scale, depth * 0.66);
        slope.rotateX(s * 0.75);
        batch.add(slope, roof, { position: at(dx, h + 2.6 * scale, s * depth * 0.24), rotation: [0, face, 0] });
      }
      // Ban công trắng từng tầng và cửa sổ trên mặt quay về sân.
      for (let floor = 3.2 * scale; floor < h - 1; floor += 3.2 * scale) {
        batch.add(new THREE.BoxGeometry(w * 0.96, 0.3 * scale, 1.2 * scale), trim, { position: at(dx, floor, depth / 2 + 0.6 * scale), rotation: [0, face, 0] });
        for (let col = -w / 2 + 2 * scale; col < w / 2 - 1.5 * scale; col += 3 * scale) {
          if (rand() < 0.62) windows.push(at(dx + col, floor + 1.4 * scale, depth / 2 + 0.2 * scale));
        }
      }
    }
    env.nightPoints(windows, { color: '#ffd28a', size: 1.1 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
