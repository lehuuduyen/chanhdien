// Ohio: hải đăng Marblehead bên hồ Erie, máy bay cánh đôi gợi thời anh em Wright và nhà kho ô chăn phía đông.
// Máy bay được gộp màu thành một mesh chuyển động, không tạo đối tượng mới trong vòng lặp.
import * as THREE from 'three';
import { frame, paintMerge } from './common.mjs';

const landmarks = {
  'marblehead-lake'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const water = env.far('#4c8396', { haze: Math.max(0.42, haze), roughness: 0.34 });
    const stone = env.far('#e8e2d6', { haze, roughness: 0.84 });
    const dark = env.far('#9a3c31', { haze, roughness: 0.78 });
    batch.add(new THREE.BoxGeometry(120 * scale, 0.14 * scale, 48 * scale), water, { position: at(0, 0.03, -7 * scale), rotation: [0, face, 0] });
    const height = 27 * scale;
    batch.add(new THREE.CylinderGeometry(1.8 * scale, 3.2 * scale, height, 12), stone, { position: at(-12 * scale, height / 2, 0) });
    batch.add(new THREE.CylinderGeometry(2.3 * scale, 2.3 * scale, 2.5 * scale, 10), dark, { position: at(-12 * scale, height + 1.25 * scale, 0) });
    batch.add(new THREE.ConeGeometry(2.8 * scale, 2.5 * scale, 10), dark, { position: at(-12 * scale, height + 3.75 * scale, 0) });
    const lamp = at(-12 * scale, height + 1.4 * scale, 0);
    env.nightGlow(...lamp, 6 * scale, '#fff0b3');

    const planeGeometry = paintMerge([
      [new THREE.BoxGeometry(6.8 * scale, 0.7 * scale, 1.1 * scale), '#b99258'],
      [new THREE.BoxGeometry(9.8 * scale, 0.22 * scale, 2.7 * scale), '#e4d2a9', { position: [0, 1.1 * scale, 0] }],
      [new THREE.BoxGeometry(9.8 * scale, 0.22 * scale, 2.7 * scale), '#e4d2a9', { position: [0, -1.1 * scale, 0] }],
      [new THREE.CylinderGeometry(0.55 * scale, 0.55 * scale, 3.5 * scale, 7), '#6b4a32', { position: [3.7 * scale, 0, 0], rotation: [Math.PI / 2, 0, 0] }],
    ]);
    const plane = new THREE.Mesh(planeGeometry, env.far('#ffffff', { haze, vertexColors: true, roughness: 0.72 }));
    // Đặt vị trí hợp lệ ngay khi tạo; bộ kiểm tra hình học đọc world matrix trước khung hoạt ảnh đầu tiên.
    plane.position.set(x + 34 * scale, 33 * scale, z);
    env.add(plane);
    env.animate((seconds) => {
      const angle = seconds * 0.22;
      plane.position.set(x + Math.cos(angle) * 34 * scale, 33 * scale + Math.sin(angle * 2) * 2 * scale, z + Math.sin(angle) * 23 * scale);
      plane.rotation.y = -angle;
    });
  },

  'quilt-barn'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const red = env.far('#9f3f31', { haze, roughness: 0.92 });
    const cream = env.far('#eadbb8', { haze, roughness: 0.88 });
    batch.add(new THREE.BoxGeometry(22 * scale, 15 * scale, 13 * scale), red, { position: at(0, 7.5 * scale, 0), rotation: [0, face, 0] });
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(23 * scale, 0.7 * scale, 8.5 * scale), cream, {
      position: at(0, 18 * scale, side * 3.1 * scale), rotation: [side * 0.62, face, 0], order: 'YXZ',
    });
    batch.add(new THREE.BoxGeometry(7.5 * scale, 7.5 * scale, 0.35 * scale), cream, { position: at(0, 11 * scale, 6.7 * scale), rotation: [0, face, Math.PI / 4] });
  },
};

export const kit = { landmarks, scatter: {} };
