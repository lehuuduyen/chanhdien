// Rhode Island (vùng autumn): cầu treo Newport (cầu treo chung, tháp xám nhạt, cầu dẫn dốc) vắt qua vịnh Narragansett đầy
// thuyền buồm ngoài cổng; phía đông là biệt thự đá thời Gilded Age trên vách đá ven biển (kiểu dinh thự đường Cliff Walk —
// dáng chung, không mô phỏng dinh thự cụ thể). Ban đêm đèn cầu, cửa sổ biệt thự. Đồi của vùng ẩn đi (states/ri.json). Gần
// tường: cỏ biển (vật rải chung).
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  // Biệt thự đá: thân ba tầng hai cánh, hàng vòm tầng trệt, mái ngói đỏ dốc bốn phía, ống khói cao; đứng trên vách đá
  // xám. params: { width }.
  'cliff-mansion'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const width = (params.width || 44) * scale;
    const rock = env.far('#77736b', { haze, flatShading: true, roughness: 1 });
    const stone = env.far('#ddd5c4', { haze, flatShading: true, roughness: 0.9 });
    const trim = env.far('#c6bca8', { haze, flatShading: true, roughness: 0.9 });
    const roof = env.far('#a2483a', { haze, flatShading: true, roughness: 0.9 });
    const dark = env.far('#3a3a3c', { haze, flatShading: true, roughness: 0.9 });
    // Vách đá ven biển.
    for (let index = 0; index < 8; index += 1) {
      const size = (6 + rand() * 4) * scale;
      batch.add(new THREE.DodecahedronGeometry(size, 0), rock, { position: at((index - 3.5) * 8 * scale, size * 0.35, -10 * scale + rand() * 6 * scale), rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.8, 1.2] });
    }
    const base = 5 * scale;
    batch.add(new THREE.BoxGeometry(width + 8 * scale, base, 30 * scale), env.far('#6f8a52', { haze, flatShading: true }), { position: at(0, base / 2, 4 * scale), rotation: [0, face, 0] });
    const h = 15 * scale;
    const depth = 18 * scale;
    batch.add(new THREE.BoxGeometry(width, h, depth), stone, { position: at(0, base + h / 2, 0), rotation: [0, face, 0] });
    for (const sx of [-1, 1]) batch.add(new THREE.BoxGeometry(width * 0.22, h * 1.08, depth * 1.25), stone, { position: at(sx * width * 0.39, base + h * 0.54, 0), rotation: [0, face, 0] });
    for (const y of [0.34, 0.68, 1]) batch.add(new THREE.BoxGeometry(width * 1.01, 0.6 * scale, depth * 1.02), trim, { position: at(0, base + h * y, 0), rotation: [0, face, 0] });
    // Mái dốc bốn phía (chóp bốn cạnh dẹt) và ống khói.
    const hip = new THREE.ConeGeometry(1, 1, 4);
    hip.rotateY(Math.PI / 4);
    batch.add(hip, roof, { position: at(0, base + h + 3 * scale, 0), rotation: [0, face, 0], scale: [width * 0.72, 6 * scale, depth * 0.78] });
    for (const dx of [-0.3, -0.1, 0.12, 0.32]) batch.add(new THREE.BoxGeometry(1.4 * scale, 5 * scale, 1.4 * scale), trim, { position: at(dx * width, base + h + 4 * scale, 0), rotation: [0, face, 0] });
    // Hàng vòm tầng trệt và cửa sổ mặt trước (sáng ban đêm).
    const windows = [];
    for (let col = 0; col < 9; col += 1) {
      const dx = ((col + 0.5) / 9 - 0.5) * width * 0.56;
      batch.add(new THREE.BoxGeometry(2.2 * scale, 3.6 * scale, 0.2 * scale), dark, { position: at(dx, base + 2.6 * scale, depth / 2 + 0.05), rotation: [0, face, 0] });
      for (const y of [0.5, 0.82]) {
        batch.add(new THREE.BoxGeometry(1.6 * scale, 2.2 * scale, 0.2 * scale), dark, { position: at(dx, base + h * y, depth / 2 + 0.05), rotation: [0, face, 0] });
        if (rand() < 0.6) windows.push(at(dx, base + h * y, depth / 2 + 0.3));
      }
    }
    env.nightPoints(windows, { color: '#ffd59a', size: 1.2 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
