// Arkansas: dãy Ozark xanh nhiều lớp và suối khoáng Hot Springs phía đông. Hơi nước dùng khối đục ít sương thay vì
// lớp trong suốt để tránh overdraw; ban đêm được hắt sáng bạc.
import * as THREE from 'three';
import { frame, ridge, sweep } from './common.mjs';

const landmarks = {
  'ozark-ridge'(batch, x, z, scale, rand, env, { side, haze }) {
    const forest = env.far('#3f6748', { haze, roughness: 1, flatShading: true });
    const blue = env.far('#55756c', { haze: Math.max(0.3, haze), roughness: 1, flatShading: true });
    ridge(batch, x, z, {
      side, span: 132 * scale, depth: 30 * scale, columns: 54, rows: 8, ribs: 2 * scale, jag: 0.8 * scale, phase: 3.4,
      crest: (t) => (21 + Math.sin(t * 0.07) * 5 + Math.cos(t * 0.17) * 3) * scale,
      rise: (v) => Math.pow(v, 0.78), bands: [[0, 0.58, forest], [0.58, 1, blue]],
    });
  },

  'hot-springs'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const rock = env.far('#766957', { haze, roughness: 1, flatShading: true });
    const water = env.far('#5f9792', { haze, roughness: 0.38, metalness: 0.04 });
    const steam = env.far('#eef3ec', {
      haze: Math.max(0.18, haze), roughness: 1, transparent: true, opacity: 0.27, depthWrite: false,
    });
    batch.add(new THREE.CylinderGeometry(13 * scale, 15 * scale, 1.4 * scale, 18), rock, { position: at(0, 0.7 * scale, 0), scale: [1.45, 1, 0.78] });
    batch.add(new THREE.CylinderGeometry(11 * scale, 11.5 * scale, 0.35 * scale, 18), water, { position: at(0, 1.5 * scale, 0), scale: [1.45, 1, 0.78] });
    const axis = [Math.sin(face), 0, Math.cos(face)];
    for (let plume = 0; plume < 5; plume += 1) {
      const baseX = (plume - 2) * 4.2 * scale;
      const points = [0, 1, 2, 3, 4].map((level) => at(
        baseX + Math.sin(level * 1.35 + plume) * (0.45 + level * 0.18) * scale,
        (2.2 + level * 3.5) * scale,
        Math.cos(level * 1.1 + plume) * 0.7 * scale,
      ));
      batch.add(sweep(points, {
        axis, steps: 18, radial: 8,
        radius: (t) => [(0.8 + t * 1.65) * scale, (0.7 + t * 1.35) * scale],
      }), steam);
    }
    env.nightGlow(...at(0, 10 * scale, 0), 12 * scale, '#d8eced');
  },
};

const scatter = {
  'fishing-boat'(batch, x, z, size, rand, env) {
    const wood = env.material('#71513b', { roughness: 1 });
    batch.add(new THREE.BoxGeometry(2.4 * size, 0.45 * size, 0.9 * size), wood, { position: [x, 0.3 * size, z], rotation: [0, rand() * Math.PI, 0] });
    batch.add(new THREE.ConeGeometry(0.7 * size, 2.4 * size, 4), wood, { position: [x, 0.45 * size, z], rotation: [0, 0, Math.PI / 2] });
  },
};

export const kit = { landmarks, scatter };
