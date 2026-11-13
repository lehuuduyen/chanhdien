// Michigan (vùng autumn): cầu treo Mackinac dài vắt qua eo hồ lớn ngoài cổng (cầu treo chung: tháp màu ngà, dàn cầu xanh
// lục, cầu dẫn dài dốc xuống hai đầu), mặt hồ nước ngọt xanh lam; phía đông là hải đăng đỏ cuối đê chắn sóng (hải đăng
// chung). Ban đêm đèn cáp cầu như chuỗi hạt, đèn hải đăng quay. Đồi của vùng ẩn đi (states/mi.json). Gần tường: vườn anh
// đào quả đỏ.
import * as THREE from 'three';
import { outward } from './common.mjs';

const landmarks = {
  // Đê chắn sóng: dải đá + bê tông chìa ra hồ từ (x, z), dài `length` m. params: { length }.
  breakwater(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const length = (params.length || 40) * scale;
    const concrete = env.far('#b9b5ac', { haze, flatShading: true, roughness: 1 });
    batch.add(new THREE.BoxGeometry(ox ? length : 5 * scale, 1.6 * scale, ox ? 5 * scale : length), concrete, { position: [x + ox * length / 2, 0.8 * scale, z + oz * length / 2] });
    for (let d = 0; d < length; d += 3 * scale) {
      for (const s of [-1, 1]) {
        const size = (1 + rand() * 0.8) * scale;
        batch.add(new THREE.DodecahedronGeometry(size, 0), env.far('#7d7a74', { haze, flatShading: true }), {
          position: [x + ox * d + (ox ? 0 : s * 3.2 * scale), size * 0.3, z + oz * d + (oz ? 0 : s * 3.2 * scale)], rotation: [rand() * 3, rand() * 3, 0],
        });
      }
    }
  },
};

const scatter = {
  // Cây anh đào quả: tán tròn xanh thẫm lấm tấm quả đỏ sẫm.
  'cherry-tree'(batch, x, z, size, rand, env) {
    const h = (1.5 + rand() * 0.5) * size;
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.2 * size, h, 6), env.material('#5a3e32', { flatShading: true }), { position: [x, h / 2, z] });
    batch.add(new THREE.IcosahedronGeometry(1.4 * size, 1), env.material('#3f6a34', { flatShading: true }), { position: [x, h + 0.9 * size, z], scale: [1.15, 0.85, 1.15] });
    const fruit = env.material('#8e1522', { flatShading: true });
    for (let index = 0; index < 12; index += 1) {
      const angle = rand() * Math.PI * 2;
      batch.add(new THREE.IcosahedronGeometry(0.1 * size, 0), fruit, {
        position: [x + Math.cos(angle) * 1.45 * size, h + 0.9 * size + (rand() - 0.4) * 1.1 * size, z + Math.sin(angle) * 1.45 * size],
      });
    }
  },
};

export const kit = { landmarks, scatter };
