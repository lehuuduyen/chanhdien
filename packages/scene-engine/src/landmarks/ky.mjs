// Kentucky (vùng blossom): trại ngựa vùng Bluegrass — đồi cỏ xanh ngả lam lượn tròn, những hàng rào gỗ trắng dài chạy
// theo sườn đồi, chuồng ngựa sơn đen viền trắng có tháp thông gió trên đỉnh đồi (không dựng tháp đôi Churchill Downs —
// KE_HOACH_BANG.md mục 2). Ban đêm cửa chuồng sáng đèn. Các lớp núi của vùng ẩn đi (states/ky.json). Gần tường: ngựa.
import * as THREE from 'three';
import { frame, outward, ridge } from './common.mjs';

const landmarks = {
  // Đồi + hàng rào trắng theo đường đồng mức + chuồng ngựa. params: { span, height, barns (số chuồng), fences ([v…]: vị
  // trí hàng rào từ chân 0 tới đỉnh 1) }.
  'horse-farm'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 460;
    const height = (params.height || 20) * scale;
    const depth = 70 * scale;
    const phase = rand() * 6;
    const crest = (t) => height * (0.65 + 0.35 * Math.sin(t * 0.022 + phase)) + Math.sin(t * 0.07 + phase) * 2;
    const rise = (v) => Math.sin((v * Math.PI) / 2) ** 1.3;
    ridge(batch, x, z, {
      side, span, depth, crest, rise, columns: 90, rows: 12, phase,
      bands: [
        [0, 0.4, env.far('#5f9168', { haze, flatShading: true, roughness: 1 })],
        [0.4, 0.75, env.far('#6a9c73', { haze, flatShading: true, roughness: 1 })],
        [0.75, 1, env.far('#77a87c', { haze, flatShading: true, roughness: 1 })],
      ],
    });
    // Điểm trên mặt đồi (ridge hạ toàn bộ 0,5 m).
    const ground = (t, v) => {
      const d = v * depth;
      return [x + ax * t + ox * d, crest(t) * rise(v) - 0.5, z + az * t + oz * d];
    };
    const white = env.far('#f3f1ea', { haze, flatShading: true, roughness: 0.9 });
    for (const v of params.fences || [0.22, 0.5]) {
      let previous = null;
      for (let t = -span / 2 + 6; t < span / 2 - 6; t += 4.5 * scale) {
        const point = ground(t, v);
        batch.add(new THREE.BoxGeometry(0.22 * scale, 1.5 * scale, 0.22 * scale), white, { position: [point[0], point[1] + 0.7 * scale, point[2]] });
        if (previous) {
          const dx = point[0] - previous[0];
          const dy = point[1] - previous[1];
          const dz = point[2] - previous[2];
          const flat = Math.hypot(dx, dz);
          for (const level of [0.55, 1.15]) {
            batch.add(new THREE.BoxGeometry(Math.hypot(flat, dy), 0.14 * scale, 0.08 * scale), white, {
              position: [(point[0] + previous[0]) / 2, (point[1] + previous[1]) / 2 + level * scale, (point[2] + previous[2]) / 2],
              rotation: [0, Math.atan2(-dz, dx), Math.atan2(dy, flat)],
            });
          }
        }
        previous = point;
      }
    }
    // Chuồng ngựa đen: thân dài, mái gãy hai tầng (kiểu gambrel), tháp thông gió, viền cửa trắng chữ X; cửa sáng ban đêm.
    const black = env.far('#232427', { haze, flatShading: true, roughness: 0.9 });
    const roof = env.far('#3a3b3f', { haze, flatShading: true, roughness: 0.9 });
    const lights = [];
    const barns = params.barns ?? 3;
    for (let index = 0; index < barns; index += 1) {
      const t = ((index + 0.5) / barns - 0.5) * span * 0.55 + (rand() - 0.5) * 30;
      const v = 0.32 + rand() * 0.18;
      const base = ground(t, v);
      const yaw = Math.atan2(-az, ax) + (rand() - 0.5) * 0.3;
      // Thân chuồng dọc theo tường (trục x cục bộ), hai đầu hồi ở ±x.
      const at = frame(base[0], base[2], yaw);
      const w = 22 * scale;
      const d = 11 * scale;
      const h = 6 * scale;
      const y0 = base[1] - 1;
      batch.add(new THREE.BoxGeometry(w, h + 1, d), black, { position: at(0, y0 + (h + 1) / 2, 0), rotation: [0, yaw, 0] });
      for (const s of [-1, 1]) {
        const lowerSlope = new THREE.BoxGeometry(w + 0.6 * scale, 0.35 * scale, d * 0.36);
        lowerSlope.rotateX(s * 1.05);
        batch.add(lowerSlope, roof, { position: at(0, y0 + h + 1 + 1.4 * scale, s * d * 0.4), rotation: [0, yaw, 0] });
        const upperSlope = new THREE.BoxGeometry(w + 0.6 * scale, 0.35 * scale, d * 0.34);
        upperSlope.rotateX(s * 0.42);
        batch.add(upperSlope, roof, { position: at(0, y0 + h + 1 + 3.3 * scale, s * d * 0.16), rotation: [0, yaw, 0] });
      }
      batch.add(new THREE.BoxGeometry(2 * scale, 2 * scale, 2 * scale), black, { position: at(0, y0 + h + 5.4 * scale, 0), rotation: [0, yaw, 0] });
      batch.add(new THREE.ConeGeometry(1.8 * scale, 1.6 * scale, 4), roof, { position: at(0, y0 + h + 7.2 * scale, 0), rotation: [0, yaw + Math.PI / 4, 0] });
      // Cửa lớn hai đầu hồi: khung trắng chữ X.
      for (const s of [-1, 1]) {
        const doorAt = at(s * (w / 2 + 0.05), y0 + 1 + 1.8 * scale, 0);
        for (const tilt of [-0.75, 0.75]) {
          batch.add(new THREE.BoxGeometry(0.1, 0.25 * scale, 4.4 * scale), white, { position: doorAt, rotation: [tilt, yaw, 0], order: 'YXZ' });
        }
        batch.add(new THREE.BoxGeometry(0.1, 3.8 * scale, 3.2 * scale), white, { position: doorAt, rotation: [0, yaw, 0] });
        lights.push(at(s * (w / 2 + 0.6), y0 + 1 + 2.2 * scale, 0));
      }
    }
    env.nightPoints(lights, { color: '#ffcf80', size: 1.6 * scale });
  },
};

const scatter = {
  // Ngựa: thân thon, chân dài mảnh, cổ cao, đầu dài; lông nâu hạt dẻ / đen / xám.
  horse(batch, x, z, size, rand, env) {
    const coats = ['#6b3a22', '#2a2422', '#8a5a36', '#b9b2a6'];
    const coat = env.material(coats[Math.floor(rand() * coats.length)], { flatShading: true });
    const dark = env.material('#1f1a18', { flatShading: true });
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const s = size;
    batch.add(new THREE.SphereGeometry(0.45 * s, 8, 6), coat, { position: at(0, 1.35 * s, 0), rotation: [0, yaw, 0], scale: [0.8, 0.85, 1.9] });
    batch.add(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 0.9 * s, 6), coat, { position: at(0, 1.8 * s, 0.75 * s), rotation: [0.7, yaw, 0], order: 'YXZ' });
    batch.add(new THREE.BoxGeometry(0.22 * s, 0.24 * s, 0.6 * s), coat, { position: at(0, 2.15 * s, 1.15 * s), rotation: [0.35, yaw, 0], order: 'YXZ' });
    batch.add(new THREE.BoxGeometry(0.06 * s, 0.4 * s, 0.4 * s), dark, { position: at(0, 1.95 * s, 0.85 * s), rotation: [0.7, yaw, 0], order: 'YXZ' });
    for (const sx of [-0.22, 0.22]) {
      for (const sz of [-0.62, 0.62]) batch.add(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 1.15 * s, 5), coat, { position: at(sx * s, 0.58 * s, sz * s), rotation: [0, yaw, 0] });
    }
    batch.add(new THREE.ConeGeometry(0.1 * s, 0.7 * s, 5), dark, { position: at(0, 1.2 * s, -0.95 * s), rotation: [-2.6, yaw, 0], order: 'YXZ' });
  },
};

export const kit = { landmarks, scatter };
