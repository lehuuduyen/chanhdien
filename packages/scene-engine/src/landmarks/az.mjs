// Arizona (vùng desert): hẻm vực Grand Canyon chạy ngang chân trời ngoài cổng — vách xa nhiều tầng đá (đỏ nâu, đỏ, vàng
// kem, đỏ đỉnh) lùi dần thành bậc, lòng vực tối, các "đền" đá đứng giữa vực; hai đầu vực ôm vòng về hai bên. Núi bàn của
// vùng ẩn đi (states/az.json: hide mountains), không rải vật vùng vào lòng vực (clear). Gần tường: xương rồng ocotillo.
import * as THREE from 'three';

// Tầng đá từ dưới lên: [màu, cao (m), lùi vào so với tầng dưới (m)].
const STRATA = [['#7e4030', 6, 0], ['#a9573a', 8, 4], ['#d29a62', 5, 6], ['#b5643f', 6, 4], ['#9c4c34', 4, 5]];

const landmarks = {
  // Vách xa của hẻm vực (cung cong ôm hai bên), lòng vực, đền đá. params: { span (m, bề ngang), depth (m, bề rộng lòng vực) }.
  'grand-canyon'(batch, x, z, scale, rand, env, { haze, params }) {
    const span = params.span || 440;
    const depth = (params.depth || 26) * scale;
    const rimZ = (px) => z + depth - 0.0011 * px * px;
    // Lòng vực: dải tối ngay trước vách (nhìn từ sân như một khe sâu dưới chân vách).
    const floor = env.far('#4a2a20', { haze, roughness: 1 });
    for (let px = -span / 2; px < span / 2; px += 20) {
      const z0 = rimZ(px) - depth;
      batch.add(new THREE.PlaneGeometry(21, depth + 6), floor, { position: [x + px + 10, 0.05, z0 + depth / 2 - 2], rotation: [-Math.PI / 2, 0, 0] });
    }
    // Vách xa: mỗi đoạn 10 m dựng các tầng đá chồng lên, tầng trên lùi ra sau; cao thấp lệch nhau cho mép đỉnh lởm chởm.
    for (let px = -span / 2; px < span / 2; px += 10) {
      const wobble = 0.8 + rand() * 0.45;
      let y = 0;
      let back = 0;
      for (const [color, height, step] of STRATA) {
        const h = height * scale * wobble;
        back += step * scale * (0.7 + rand() * 0.6);
        batch.add(new THREE.BoxGeometry(11, h, 14), env.far(color, { haze, flatShading: true, roughness: 1 }), {
          position: [x + px + 5, y + h / 2, rimZ(px + 5) + back + 7], rotation: [0, (rand() - 0.5) * 0.12, 0],
        });
        y += h;
      }
    }
    // Đền đá giữa vực: tháp bậc thang 2–4 tầng.
    for (let index = 0; index < 9; index += 1) {
      const px = (rand() - 0.5) * span * 0.7;
      const pz = rimZ(px) - depth * (0.25 + rand() * 0.55);
      let y = 0;
      let width = (9 + rand() * 9) * scale;
      const levels = 2 + Math.floor(rand() * 3);
      for (let level = 0; level < levels; level += 1) {
        const [color, height] = STRATA[Math.min(STRATA.length - 1, level + 1)];
        const h = height * scale * (0.9 + rand() * 0.5);
        batch.add(new THREE.CylinderGeometry(width * 0.42, width * 0.5, h, 7), env.far(color, { haze, flatShading: true, roughness: 1 }), {
          position: [x + px, y + h / 2, pz], rotation: [0, rand() * 3, 0],
        });
        y += h;
        width *= 0.72;
      }
    }
  },
};

const scatter = {
  // Ocotillo: chùm cành dài mảnh xòe từ gốc, ngọn đỏ.
  ocotillo(batch, x, z, size, rand, env) {
    const stem = env.material('#6b6a3e');
    const tip = env.material('#c8402a');
    for (let index = 0; index < 9; index += 1) {
      const angle = rand() * Math.PI * 2;
      const lean = 0.12 + rand() * 0.3;
      const length = (2.6 + rand() * 1.8) * size;
      const dir = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
      const geometry = new THREE.CylinderGeometry(0.03 * size, 0.06 * size, length, 4);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      batch.add(geometry, stem, { position: [x + dir.x * length / 2, dir.y * length / 2, z + dir.z * length / 2] });
      batch.add(new THREE.ConeGeometry(0.07 * size, 0.35 * size, 4), tip, { position: [x + dir.x * length, dir.y * length + 0.1, z + dir.z * length] });
    }
  },
};

export const kit = { landmarks, scatter };
