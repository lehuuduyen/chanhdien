// Wisconsin (vùng autumn): Điện Capitol Madison — mái vòm granite trắng (capitol chung) đứng trên eo đất giữa hai hồ
// Mendota / Monona ngoài cổng (hai mặt hồ hai bên), sau lưng là đồi rừng thu; phía đông là trại bò sữa (trang trại chung
// `farmstead`). Ban đêm mái vòm rọi sáng. Đồi của vùng ẩn đi (states/wi.json). Gần tường: đàn bò sữa (`cow` chung).
import * as THREE from 'three';
import { outward } from './common.mjs';

const landmarks = {
  // Hai mặt hồ hai bên eo đất (x, z), eo rộng `isthmus` m. params: { isthmus, width, depth }.
  'isthmus-lakes'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const isthmus = (params.isthmus || 40) * scale;
    const width = (params.width || 160) * scale;
    const depth = (params.depth || 120) * scale;
    const water = env.far('#4f7f99', { haze, flatShading: true, roughness: 0.25 });
    for (const s of [-1, 1]) {
      const u = s * (isthmus / 2 + width / 2);
      batch.add(new THREE.PlaneGeometry(1, 1), water, {
        position: [x + ax * u + ox * depth / 2, 0.06, z + az * u + oz * depth / 2], rotation: [-Math.PI / 2, 0, 0], scale: ax ? [width, depth, 1] : [depth, width, 1],
      });
    }
  },
};

export const kit = { landmarks, scatter: {} };
