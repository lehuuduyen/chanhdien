// South Dakota: đài tưởng niệm Rushmore được giản lược nghiêm trang thành bốn phù điêu cùng màu granite trên vách
// Black Hills; không gắn vật trang trí lên mặt. Badlands ở phía đông, thông và bò rừng nằm trong dải gần tường.
import * as THREE from 'three';
import { frame, ridge } from './common.mjs';

const landmarks = {
  rushmore(batch, x, z, scale, rand, env, { face, side, haze }) {
    const granite = env.far('#8c8d89', { haze, roughness: 1, flatShading: true });
    ridge(batch, x, z, {
      side, span: 118 * scale, depth: 24 * scale, columns: 52, rows: 10, ribs: 1.8 * scale, jag: 1.1 * scale, phase: 4.2,
      crest: (t) => (36 + Math.cos(t * 0.07) * 4 + Math.sin(t * 0.19) * 2) * scale,
      rise: (v) => Math.pow(v, 0.82), bands: [[0, 1, granite]],
    });
    const at = frame(x, z, face);
    // Phù điêu không vẽ mắt / miệng: từng khuôn mặt chỉ gồm trán, gờ mày, sống mũi, má và cằm nhô khỏi vách.
    // Hai đầu giữa lùi sâu hơn để đọc ra thứ tự tạc vào núi thay vì bốn tượng trứng đặt rời.
    const recess = [0, -2.1, -3.2, -0.9];
    for (let index = 0; index < 4; index += 1) {
      const px = (-24 + index * 16) * scale;
      const py = (27 + (index % 2) * 1.2) * scale;
      const depth = recess[index] * scale;
      batch.add(new THREE.BoxGeometry(7.5 * scale, 4.8 * scale, 2.4 * scale), granite, {
        position: at(px, py + 3.4 * scale, (-10 + recess[index]) * scale), rotation: [0, face, (index - 1.5) * 0.025],
      });
      batch.add(new THREE.BoxGeometry(7.9 * scale, 1.25 * scale, 3.1 * scale), granite, {
        position: at(px, py + 0.9 * scale, (-8.9 * scale) + depth), rotation: [0, face, 0],
      });
      batch.add(new THREE.BoxGeometry(1.55 * scale, 4.6 * scale, 3.7 * scale), granite, {
        position: at(px + 0.35 * scale, py - 0.8 * scale, (-7.7 * scale) + depth), rotation: [0, face, -0.08],
      });
      batch.add(new THREE.BoxGeometry(6.2 * scale, 4.1 * scale, 2 * scale), granite, {
        position: at(px, py - 2.2 * scale, (-9.8 * scale) + depth), rotation: [0, face, 0],
      });
      batch.add(new THREE.BoxGeometry(4.4 * scale, 1.9 * scale, 3 * scale), granite, {
        position: at(px + 0.3 * scale, py - 4.7 * scale, (-8.6 * scale) + depth), rotation: [0, face, 0],
      });
    }
    const litCliff = new THREE.BoxGeometry(108 * scale, 36 * scale, 0.22 * scale);
    litCliff.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...at(0, 20 * scale, -12.4 * scale)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, face, 0)),
      new THREE.Vector3(1, 1, 1),
    ));
    env.nightMesh(litCliff, '#fff0cf', 0.12);
  },

  'sd-badlands'(batch, x, z, scale, rand, env, { side, haze }) {
    const cream = env.far('#c99c69', { haze, roughness: 1, flatShading: true });
    const rust = env.far('#8f5941', { haze, roughness: 1, flatShading: true });
    ridge(batch, x, z, {
      side, span: 95 * scale, depth: 20 * scale, columns: 42, rows: 8, ribs: 2.4 * scale, jag: 1.2 * scale, phase: 1.7,
      crest: (t) => (18 + Math.sin(t * 0.16) * 5 + Math.cos(t * 0.31) * 2) * scale,
      bands: [[0, 0.55, rust], [0.55, 1, cream]],
    });
  },
};

const scatter = {
  'blackhill-pine'(batch, x, z, size, rand, env) {
    const trunk = env.material('#5c4936', { roughness: 1 });
    const needle = env.material('#315d43', { roughness: 1, flatShading: true });
    const height = (4 + rand() * 3) * size;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.22 * size, height, 5), trunk, { position: [x, height / 2, z] });
    for (let tier = 0; tier < 3; tier += 1) batch.add(new THREE.ConeGeometry((1.6 - tier * 0.3) * size, 2.8 * size, 7), needle, { position: [x, height * 0.55 + tier * 1.05 * size, z] });
  },
};

export const kit = { landmarks, scatter };
