// Maryland (vùng blossom): cầu Chesapeake Bay — cầu treo đôi tháp thép xám, cầu dẫn dài thấp trên trụ chạy chéo qua vịnh
// (cầu treo chung, tham số trong states/md.json) — và hải đăng Thomas Point Shoal: nhà gỗ sáu cạnh trắng mái đỏ trên
// chân cọc sắt giữa nước; thuyền buồm trôi trên vịnh. Ban đêm đèn cầu, đèn hải đăng. Các lớp núi của vùng ẩn đi.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  // Hải đăng chân cọc: sàn trên các cọc sắt, nhà sáu cạnh hai tầng, mái sáu cạnh đỏ, phòng đèn đen trên đỉnh, hành lang
  // bao quanh. params: { height (m, tới đỉnh) }.
  'screwpile-light'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const s = ((params.height || 14) / 14) * scale;
    const at = frame(x, z, face);
    const white = env.far('#f4f2ec', { haze, flatShading: true, roughness: 0.9 });
    const red = env.far('#b8322a', { haze, flatShading: true, roughness: 0.9 });
    const iron = env.far('#3b3d40', { haze, flatShading: true, roughness: 0.8 });
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 5 * s, 5), iron, { position: [x + Math.cos(angle) * 4.2 * s, 2.5 * s, z + Math.sin(angle) * 4.2 * s] });
    }
    batch.add(new THREE.CylinderGeometry(5.6 * s, 5.6 * s, 0.5 * s, 6), iron, { position: at(0, 5 * s, 0) });
    batch.add(new THREE.CylinderGeometry(5.4 * s, 5.4 * s, 0.25 * s, 6), white, { position: at(0, 5.6 * s, 0) });
    batch.add(new THREE.CylinderGeometry(3.8 * s, 3.8 * s, 3.4 * s, 6), white, { position: at(0, 7.1 * s, 0) });
    batch.add(new THREE.ConeGeometry(4.6 * s, 2.4 * s, 6), red, { position: at(0, 10 * s, 0) });
    batch.add(new THREE.CylinderGeometry(1.5 * s, 1.5 * s, 1.6 * s, 6), white, { position: at(0, 11.2 * s, 0) });
    batch.add(new THREE.CylinderGeometry(1.1 * s, 1.1 * s, 1.3 * s, 8), iron, { position: at(0, 12.6 * s, 0) });
    batch.add(new THREE.ConeGeometry(1.3 * s, 1 * s, 8), red, { position: at(0, 13.7 * s, 0) });
    env.nightGlow(...at(0, 12.6 * s, 0), 6 * s, '#fff1c4');
  },
};

export const kit = { landmarks, scatter: {} };
