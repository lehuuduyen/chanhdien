// Massachusetts (vùng autumn): đường chân trời Boston bên cảng ngoài cổng (skyline chung: tháp kính xanh dạng tấm, tháp
// vuông nâu xám — dáng chung, không chữ), cầu dây văng Zakim trắng tháp chữ Y ngược đỉnh như obelisk, dây văng xòe hình
// quạt (ban đêm tháp và dây sáng xanh lam), thuyền buồm trên cảng; phía đông là đầm việt quất mùa thu hoạch — ô nước ngập
// phủ kín quả đỏ thẫm, bờ đất ngăn ô. Đồi của vùng ẩn đi (states/ma.json).
import * as THREE from 'three';
import { beam, frame, outward } from './common.mjs';

const landmarks = {
  // Cầu Zakim: mặt cầu, hai tháp chữ Y ngược (hai chân choãi ra, nhập thành một trụ, đỉnh nhọn), dây văng hai mặt phẳng
  // xòe quạt. Trục cầu dọc tường. params: { length (m), tower (m), deck (m) }.
  zakim(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const P = (s, y, w) => [x + ax * s + ox * w, y, z + az * s + oz * w];
    const length = (params.length || 150) * scale;
    const top = (params.tower || 42) * scale;
    const deckY = (params.deck || 12) * scale;
    const white = env.far('#e9ebee', { haze, flatShading: true, roughness: 0.6 });
    const grey = env.far('#9ea3a8', { haze, flatShading: true, roughness: 0.8 });
    batch.add(new THREE.BoxGeometry(ax ? length : 14 * scale, 1.6 * scale, ax ? 14 * scale : length), grey, { position: P(0, deckY, 0) });
    for (let s = -length / 2 + 10 * scale; s < length / 2; s += 22 * scale) {
      batch.add(new THREE.BoxGeometry(2 * scale, deckY, 2 * scale), grey, { position: P(s, deckY / 2, 0) });
    }
    const blue = [];
    const glow = [];
    const towers = [-length * 0.22, length * 0.22];
    for (const s0 of towers) {
      const join = P(s0, top * 0.62, 0);
      for (const w of [-9 * scale, 9 * scale]) beam(batch, P(s0, 0, w), join, 1.6 * scale, white);
      batch.add(new THREE.BoxGeometry(1.8 * scale, top * 0.3, 1.8 * scale), white, { position: P(s0, top * 0.77, 0) });
      const tip = new THREE.ConeGeometry(1.3 * scale, top * 0.08, 4);
      tip.rotateY(Math.PI / 4);
      batch.add(tip, white, { position: P(s0, top * 0.96, 0) });
      glow.push(new THREE.BoxGeometry(2 * scale, top * 0.38, 2 * scale).translate(...P(s0, top * 0.8, 0)));
      // Dây văng: từ thân tháp xuống mặt cầu hai bên, hai mặt phẳng (w = ±5).
      for (let cable = 0; cable < 8; cable += 1) {
        const y = top * (0.66 + cable * 0.035);
        for (const dir of [-1, 1]) {
          for (const w of [-5 * scale, 5 * scale]) {
            const end = P(s0 + dir * (8 + cable * 5.5) * scale, deckY + 0.8 * scale, w);
            beam(batch, P(s0, y, w * 0.15), end, 0.18 * scale, white);
            if (cable % 2 === 0) blue.push(end);
          }
        }
      }
    }
    env.nightMesh(mergeBoxes(glow), '#4f8cff', 0.45);
    env.nightPoints(blue, { color: '#7fb0ff', size: 1 * scale });
  },

  // Đầm việt quất: các ô nước ngập phủ quả đỏ (đỏ thẫm xen đỏ tươi), bờ đất cỏ ngăn ô, phao vàng gom quả. params:
  // { width, depth, plots }.
  'cranberry-bog'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const width = (params.width || 90) * scale;
    const depth = (params.depth || 50) * scale;
    const columns = params.plots || 3;
    const rows = 2;
    const reds = ['#9e1328', '#b81d32', '#8a1124'].map((color) => env.far(color, { haze, flatShading: true, roughness: 0.6 }));
    const dike = env.far('#6d7a45', { haze, flatShading: true, roughness: 1 });
    const boom = env.far('#f0c330', { haze, flatShading: true, roughness: 0.8 });
    const cellW = width / columns;
    const cellD = depth / rows;
    for (let col = 0; col < columns; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const t = -width / 2 + (col + 0.5) * cellW;
        const d = (row + 0.5) * cellD;
        const center = [x + ax * t + ox * d, z + az * t + oz * d];
        const size = ax ? [cellW - 2 * scale, cellD - 2 * scale] : [cellD - 2 * scale, cellW - 2 * scale];
        batch.add(new THREE.PlaneGeometry(1, 1), reds[(col + row) % reds.length], { position: [center[0], 0.12, center[1]], rotation: [-Math.PI / 2, 0, 0], scale: [size[0], size[1], 1] });
        // Phao vàng quây một góc ô.
        batch.add(new THREE.BoxGeometry(ax ? size[0] * 0.6 : 0.4 * scale, 0.35 * scale, ax ? 0.4 * scale : size[1] * 0.6), boom, { position: [center[0] - ox * size[0] * 0.2, 0.25, center[1] - oz * size[1] * 0.2] });
      }
    }
    for (let col = 0; col <= columns; col += 1) {
      const t = -width / 2 + col * cellW;
      batch.add(new THREE.BoxGeometry(ax ? 2 * scale : depth, 0.8 * scale, ax ? depth : 2 * scale), dike, { position: [x + ax * t + ox * depth / 2, 0.4 * scale, z + az * t + oz * depth / 2] });
    }
    for (let row = 0; row <= rows; row += 1) {
      const d = row * cellD;
      batch.add(new THREE.BoxGeometry(ax ? width : 2 * scale, 0.8 * scale, ax ? 2 * scale : width), dike, { position: [x + ox * d, 0.4 * scale, z + oz * d] });
    }
    // Nhà kho gỗ cạnh đầm.
    const at = frame(x - ax * (width / 2 + 10 * scale), z - az * (width / 2 + 10 * scale), 0);
    batch.add(new THREE.BoxGeometry(10 * scale, 6 * scale, 8 * scale), env.far('#8a8070', { haze, flatShading: true }), { position: at(0, 3 * scale, 0) });
    batch.add(new THREE.ConeGeometry(7.5 * scale, 3 * scale, 4), env.far('#5a4f46', { haze, flatShading: true }), { position: at(0, 7.5 * scale, 0), rotation: [0, Math.PI / 4, 0] });
  },
};

// Gộp vài hộp (đã đặt chỗ) thành một cho lớp sáng đêm.
function mergeBoxes(list) {
  const positions = [];
  for (const geometry of list) {
    const flat = geometry.toNonIndexed();
    positions.push(...flat.attributes.position.array);
    flat.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

export const kit = { landmarks, scatter: {} };
