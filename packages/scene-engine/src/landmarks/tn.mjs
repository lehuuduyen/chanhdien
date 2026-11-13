// Tennessee (vùng blossom): dãy Great Smoky — nhiều lớp núi rừng xếp sau nhau ngoài cổng, gần xanh thẫm, xa xanh lam nhạt
// (các lớp đồi chung `hills`, tham số trong states/tn.json), dải sương trắng nằm trong các thung lũng giữa các lớp núi,
// trôi chậm ("khói" của dãy Smoky); ban đêm sương sáng bạc dưới trăng. Các lớp núi của vùng ẩn đi. Gần tường: nhà gỗ (vật
// rải chung, cửa sổ sáng đèn ban đêm).
import * as THREE from 'three';
import { outward, paintMerge } from './common.mjs';

const landmarks = {
  // Dải sương thung lũng: các khối dẹt dài trắng mờ (tự sáng nhẹ để không thành khối có bóng) thành hàng dọc tường ngay
  // sau mỗi lớp núi, chỉ ló ra ở chỗ sống núi trũng ở các khoảng cách `rows` (m tính từ (x, z) ra
  // xa), độ cao `heights` (m). params: { rows, heights, span, count (khối mỗi hàng) }.
  'valley-mist'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const rows = params.rows || [40, 82];
    const heights = params.heights || [8, 14];
    const span = (params.span || 440) * scale;
    const parts = [];
    rows.forEach((distance, row) => {
      for (let index = 0; index < (params.count || 9); index += 1) {
        const t = ((index + rand()) / (params.count || 9) - 0.5) * span;
        const d = distance * scale + (rand() - 0.5) * 8 * scale;
        const length = (34 + rand() * 30) * scale;
        parts.push([new THREE.SphereGeometry(1, 12, 6), '#ffffff', {
          position: [x + ax * t + ox * d, (heights[row] ?? heights[0]) * scale + rand() * 3 * scale, z + az * t + oz * d],
          scale: ax ? [length, (2.5 + rand() * 1.5) * scale, (14 + rand() * 6) * scale] : [(14 + rand() * 6) * scale, (2.5 + rand() * 1.5) * scale, length],
        }]);
      }
    });
    const mist = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1, emissive: '#c9d3dc', emissiveIntensity: 0.55 }));
    env.add(mist);
    mist.add(env.nightMesh(mist.geometry.clone(), '#c9d8f0', 0.16));
    env.animate((seconds) => {
      const drift = Math.sin(seconds * 0.02) * 10 * scale;
      mist.position.set(ax * drift, Math.sin(seconds * 0.05) * 0.6 * scale, az * drift);
    });
  },
};

export const kit = { landmarks, scatter: {} };
