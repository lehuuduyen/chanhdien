// Minnesota (vùng autumn): hải đăng Split Rock — tháp gạch vàng thấp, phòng đèn đen, nhà người gác, đứng trên đỉnh mỏm đá
// dựng đứng (vách đá xám nâu lởm chởm, đỉnh phủ rừng) bên hồ Superior ngoài cổng (hải đăng chung, `elevation`); bờ hồ phía
// xa là rừng thông + bạch dương (đồi chung `hills` có cụm tán). Ban đêm đèn và hai luồng sáng quay. Đồi của vùng ẩn đi
// (states/mn.json). Gần tường: bến gỗ có xuồng.
import * as THREE from 'three';
import { kit as common, ridge } from './common.mjs';

const landmarks = {
  // Mỏm đá + hải đăng trên đỉnh. params: { height (m, đỉnh mỏm), span, depth, tower (m, cao tháp) }.
  'split-rock'(batch, x, z, scale, rand, env, { face, side, haze, params }) {
    const height = (params.height || 24) * scale;
    const span = (params.span || 110) * scale;
    const depth = (params.depth || 36) * scale;
    const crest = (t) => 6 * scale + (height - 6 * scale) * Math.exp(-((t / (span * 0.24)) ** 2));
    const rise = (v) => Math.min(1, v / 0.4) ** 0.6;
    ridge(batch, x, z, {
      side, span, depth, crest, rise, ribs: 2.5, jag: 2, columns: 44, rows: 10, phase: 2.3,
      bands: [
        [0, 0.22, env.far('#6a625a', { haze, flatShading: true, roughness: 1 })],
        [0.22, 0.42, env.far('#544d47', { haze, flatShading: true, roughness: 1 })],
        [0.42, 1, env.far('#3d5638', { haze, flatShading: true, roughness: 1 })],
      ],
    });
    // Hải đăng trên đỉnh mỏm (v = 0,6, đã lên hết vách), nền đá dưới chân tháp.
    const v = 0.6;
    const [ox, oz] = side === 'east' ? [1, 0] : side === 'west' ? [-1, 0] : side === 'back' ? [0, -1] : [0, 1];
    const lx = x + ox * v * depth;
    const lz = z + oz * v * depth;
    const top = crest(0) * rise(v) - 0.5;
    batch.add(new THREE.CylinderGeometry(7 * scale, 8 * scale, 1.2 * scale, 8), env.far('#6a625a', { haze, flatShading: true }), { position: [lx, top + 0.3 * scale, lz] });
    common.landmarks.lighthouse(batch, lx, lz, scale, rand, env, { face, side, haze, params: { ...(params.light || {}), elevation: (top + 0.9 * scale) / scale, rocks: false } });
  },
};

const scatter = {
  // Bến gỗ nhỏ có chiếc xuồng đỏ / xanh úp bên cạnh.
  'canoe-dock'(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI;
    const wood = env.material('#8a7258', { flatShading: true });
    batch.add(new THREE.BoxGeometry(5 * size, 0.2 * size, 1.6 * size), wood, { position: [x, 0.5 * size, z], rotation: [0, yaw, 0] });
    for (const t of [-2.2, 0, 2.2]) {
      for (const w of [-0.7, 0.7]) {
        batch.add(new THREE.CylinderGeometry(0.08 * size, 0.08 * size, 0.6 * size, 5), wood, {
          position: [x + Math.cos(yaw) * t * size + Math.sin(yaw) * w * size, 0.25 * size, z - Math.sin(yaw) * t * size + Math.cos(yaw) * w * size],
        });
      }
    }
    const canoe = new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 4.4 * size, 8, 1, false, 0, Math.PI);
    canoe.rotateZ(Math.PI / 2);
    batch.add(canoe, env.material(rand() < 0.5 ? '#b8322a' : '#2f6a8a', { flatShading: true, side: THREE.DoubleSide }), {
      position: [x + Math.sin(yaw) * 1.6 * size, 0.42 * size, z + Math.cos(yaw) * 1.6 * size], rotation: [0, yaw, 0], scale: [1, 0.6, 1],
    });
  },
};

export const kit = { landmarks, scatter };
