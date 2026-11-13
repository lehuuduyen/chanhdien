// Washington: Mount Rainier khổng lồ ngoài cổng, mặt nước Puget Sound và phà phía đông; vườn táo nằm trong dải gần
// tường. Không dựng Space Needle, không chữ / logo.
import * as THREE from 'three';
import { frame, ridge } from './common.mjs';

const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));

const landmarks = {
  'mount-rainier'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = (params.span || 420) * scale;
    const height = (params.height || 82) * scale;
    const forest = env.far('#40594a', { haze, roughness: 1, flatShading: true });
    const snow = env.far('#edf2f4', { haze, roughness: 0.86, flatShading: true });
    const crest = (t) => height * Math.max(
      bump(t, 0, span * 0.2),
      bump(t, -span * 0.25, span * 0.28) * 0.55,
      bump(t, span * 0.29, span * 0.3) * 0.5,
    ) + Math.sin(t * 0.075) * 1.8 * scale;
    ridge(batch, x, z, {
      side, span, depth: 108 * scale, crest, rise: (v) => v ** 0.9, ribs: 5.5 * scale, jag: 2.2 * scale,
      columns: 86, rows: 13, phase: 5.1, bands: [[0, 0.34, forest], [0.34, 1, snow]],
    });
    const cap = new THREE.ConeGeometry(23 * scale, 28 * scale, 14);
    cap.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, height - 14 * scale, z + 82 * scale),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 14, 0)),
      new THREE.Vector3(1.2, 1, 1),
    ));
    env.nightMesh(cap, '#dbeaff', 0.16);
  },

  'puget-ferry'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const water = env.far('#456f7b', { haze: Math.max(0.45, haze), roughness: 0.32, metalness: 0.06 });
    const white = env.far('#edf2f4', { haze, roughness: 0.86, flatShading: true });
    const green = env.far('#315b4e', { haze, roughness: 0.9, flatShading: true });
    batch.add(new THREE.BoxGeometry(150 * scale, 0.12 * scale, 82 * scale), water, {
      position: at(0, 0.02, -10 * scale), rotation: [0, face, 0],
    });
    batch.add(new THREE.BoxGeometry(30 * scale, 1.8 * scale, 9 * scale), white, {
      position: at(0, 1.05 * scale, 0), rotation: [0, face, 0],
    });
    batch.add(new THREE.BoxGeometry(20 * scale, 3 * scale, 7.2 * scale), white, {
      position: at(-1 * scale, 3.5 * scale, 0), rotation: [0, face, 0],
    });
    batch.add(new THREE.BoxGeometry(22 * scale, 0.65 * scale, 8 * scale), green, {
      position: at(-1 * scale, 5.3 * scale, 0), rotation: [0, face, 0],
    });
    for (const side of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.65 * scale, 0.75 * scale, 2.6 * scale, 8), green, {
        position: at(side * 5 * scale, 6.8 * scale, 0),
      });
    }
    const windows = [];
    for (let index = -4; index <= 4; index += 1) windows.push(at(index * 2 * scale, 3.7 * scale, 3.7 * scale));
    env.nightPoints(windows, { color: '#ffe4a0', size: 0.8 * scale });
  },
};

const scatter = {
  'apple-tree'(batch, x, z, size, rand, env) {
    const woodAndFruit = env.material('#8d4331', { roughness: 0.98, flatShading: true });
    const leaf = env.material(rand() < 0.5 ? '#3f683d' : '#4c7544', { roughness: 1, flatShading: true });
    const height = (2.2 + rand() * 0.6) * size;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, height, 6), woodAndFruit, {
      position: [x, height / 2, z],
    });
    for (let blob = 0; blob < (env.detail === 0 ? 4 : 6); blob += 1) {
      const angle = (blob / 6) * Math.PI * 2 + rand() * 0.45;
      const reach = (blob ? 0.6 + rand() * 0.45 : 0) * size;
      const center = [x + Math.cos(angle) * reach, height + (0.45 + rand() * 0.5) * size, z + Math.sin(angle) * reach];
      batch.add(new THREE.IcosahedronGeometry((0.58 + rand() * 0.25) * size, env.detail ?? 0), leaf, {
        position: center, scale: [1.08, 0.85, 1.08],
      });
      if (blob < 4) batch.add(new THREE.IcosahedronGeometry(0.12 * size, 0), woodAndFruit, {
        position: [center[0] + (rand() - 0.5) * 0.6 * size, center[1] - 0.35 * size, center[2] + (rand() - 0.5) * 0.6 * size],
      });
    }
  },
};

export const kit = { landmarks, scatter };
