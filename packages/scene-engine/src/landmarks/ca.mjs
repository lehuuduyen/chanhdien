// California (vùng california): Cầu Cổng Vàng màu cam đỏ vắt qua eo biển ngoài cổng (cầu treo chung trong
// landmarks/common.mjs, tháp kiểu art deco nhiều xà ngang; dựng giản lược, không chữ — xem lưu ý thương hiệu ở
// KE_HOACH_BANG.md mục 2), sau lưng là đồi Marin cỏ vàng lốm đốm cây bụi xanh; phía đông là rừng gỗ đỏ (redwood) thân
// cột nâu đỏ cao vút. Đồi vàng của vùng ẩn đi (states/ca.json). Gần tường: vườn nho từng hàng, thảm hoa anh túc cam.
import * as THREE from 'three';
import { outward, ridge } from './common.mjs';

const landmarks = {
  // Đồi Marin: dãy đồi tròn cỏ vàng, sườn khuất màu xanh bụi rậm. params: { span, height }.
  headlands(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 460;
    const height = (params.height || 34) * scale;
    const phase = rand() * 6;
    const crest = (t) => height * (0.7 + 0.3 * Math.sin(t * 0.017 + phase)) + Math.sin(t * 0.06) * 4;
    ridge(batch, x, z, {
      side, span, depth: 70 * scale, crest, rise: (v) => Math.sin((v * Math.PI) / 2) ** 1.4, ribs: 2.5, jag: 1.2, columns: 80, rows: 10, phase,
      bands: [
        [0, 0.3, env.far('#7c8a4a', { haze, flatShading: true, roughness: 1 })],
        [0.3, 0.75, env.far('#c9a85a', { haze, flatShading: true, roughness: 1 })],
        [0.75, 1, env.far('#b8964e', { haze, flatShading: true, roughness: 1 })],
      ],
    });
  },

  // Rừng gỗ đỏ: thân cột nâu đỏ thẳng, cành chỉ ở phần trên, tán nón hẹp xanh thẫm; cây cao 30–46 m. params: { width,
  // depth, count }.
  redwoods(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const bark = env.far('#8a4630', { haze, flatShading: true, roughness: 1 });
    const crowns = ['#2f4a2c', '#3a5532', '#28402a'].map((color) => env.far(color, { haze, flatShading: true, roughness: 1 }));
    const width = params.width || 80;
    const depth = params.depth || 30;
    for (let index = 0; index < (params.count || 28); index += 1) {
      const t = (rand() - 0.5) * width;
      const d = rand() * depth;
      const px = x + ax * t + ox * d;
      const pz = z + az * t + oz * d;
      const height = (30 + rand() * 16) * scale;
      const r = (0.9 + rand() * 0.5) * scale;
      batch.add(new THREE.CylinderGeometry(r * 0.55, r * 1.25, height * 0.98, 7), bark, { position: [px, height * 0.49, pz] });
      const crown = height * (0.5 + rand() * 0.1);
      const tiers = 3;
      for (let tier = 0; tier < tiers; tier += 1) {
        const h = crown / tiers * 1.3;
        const y = height - crown + tier * (crown / tiers) + h / 2;
        batch.add(new THREE.ConeGeometry((4.4 - tier * 1.1) * scale, h, 7), crowns[Math.floor(rand() * crowns.length)], { position: [px, y, pz], rotation: [0, rand() * 3, 0] });
      }
    }
  },
};

const scatter = {
  // Vườn nho: các hàng giàn thấp (cọc + tán lá) song song.
  vineyard(batch, x, z, size, rand, env) {
    const leaf = env.material(rand() < 0.5 ? '#5f7a34' : '#6f8a3c', { flatShading: true });
    const post = env.material('#6e5a42', { flatShading: true });
    const yaw = rand() * Math.PI;
    const rows = 4 + Math.floor(rand() * 3);
    const length = (7 + rand() * 4) * size;
    for (let index = 0; index < rows; index += 1) {
      const offset = (index - rows / 2) * 1.8 * size;
      const cx = x + Math.sin(yaw) * offset;
      const cz = z + Math.cos(yaw) * offset;
      batch.add(new THREE.BoxGeometry(length, 0.8 * size, 0.6 * size), leaf, { position: [cx, 0.85 * size, cz], rotation: [0, yaw, 0] });
      for (const end of [-0.5, 0.5]) batch.add(new THREE.BoxGeometry(0.08 * size, 1.2 * size, 0.08 * size), post, { position: [cx + Math.cos(yaw) * end * length, 0.6 * size, cz - Math.sin(yaw) * end * length] });
    }
  },
  // Thảm hoa anh túc California: đám đốm cam trên nền lá xanh xám.
  poppies(batch, x, z, size, rand, env) {
    const orange = env.material('#f28a1e', { flatShading: true });
    const yellow = env.material('#f6b632', { flatShading: true });
    batch.add(new THREE.CircleGeometry(2.4 * size, 9), env.material('#7d8a52', { flatShading: true }), { position: [x, 0.04, z], rotation: [-Math.PI / 2, 0, 0], scale: [1, 0.7, 1] });
    for (let index = 0; index < 22; index += 1) {
      const angle = rand() * Math.PI * 2;
      const reach = Math.sqrt(rand()) * 2.2 * size;
      batch.add(new THREE.IcosahedronGeometry(0.16 * size, 0), rand() < 0.75 ? orange : yellow, {
        position: [x + Math.cos(angle) * reach, 0.25 * size, z + Math.sin(angle) * reach * 0.7], scale: [1, 0.5, 1],
      });
    }
  },
};

export const kit = { landmarks, scatter };
