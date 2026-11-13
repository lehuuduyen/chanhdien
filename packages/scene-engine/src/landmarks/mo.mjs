// Missouri: Gateway Arch bên sông Mississippi và tàu guồng. Vòm dùng một sweep duy nhất để vẫn rõ dáng ở xa;
// tàu phía đông nối cảnh sang góc nhìn thứ tư mà không lặp lại biểu tượng chính.
import * as THREE from 'three';
import { beam, frame, sweep } from './common.mjs';

const landmarks = {
  'gateway-arch'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const steel = env.far('#c8d1d3', { haze, roughness: 0.28, metalness: 0.72 });
    const water = env.far('#477d8d', { haze: Math.max(0.42, haze), roughness: 0.34, metalness: 0.08 });
    batch.add(new THREE.BoxGeometry(116 * scale, 0.18 * scale, 42 * scale), water, {
      position: at(0, 0.04 * scale, -5 * scale), rotation: [0, face, 0],
    });
    const points = [
      at(-23 * scale, 0, 0), at(-21 * scale, 18 * scale, 0), at(-13 * scale, 42 * scale, 0),
      at(0, 57 * scale, 0), at(13 * scale, 42 * scale, 0), at(21 * scale, 18 * scale, 0), at(23 * scale, 0, 0),
    ];
    const axis = [Math.sin(face), 0, Math.cos(face)];
    batch.add(sweep(points, {
      axis, steps: 42, radial: 7,
      radius: (t) => {
        const foot = Math.abs(t - 0.5) * 2;
        return [(0.85 + foot * 1.15) * scale, (0.72 + foot * 0.9) * scale];
      },
    }), steel);
    const lights = [];
    for (let index = 0; index <= 20; index += 1) {
      const t = index / 20;
      const point = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal').getPointAt(t);
      lights.push([point.x, point.y, point.z]);
    }
    env.nightPoints(lights, { color: '#e9f7ff', size: 0.72 * scale });
  },

  // Tàu guồng sông Mississippi trên khúc sông (dải nước dọc tường): thân dài thấp, ba tầng boong trắng có hành lang cột,
  // cabin lái trên cùng, hai ống khói đen đỉnh xòe phía mũi, bánh guồng đỏ to ở đuôi. (Claude dựng lại theo góp ý rà.)
  'mississippi-riverboat'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const s = scale;
    const white = env.far('#efe9dc', { haze, roughness: 0.78 });
    const trim = env.far('#a43e2f', { haze, roughness: 0.82 });
    const dark = env.far('#26262a', { haze, roughness: 0.8 });
    const hull = env.far('#3f3a36', { haze, roughness: 0.9 });
    batch.add(new THREE.PlaneGeometry(1, 1), env.far('#4b6f6a', { haze, flatShading: true, roughness: 0.3 }), { position: at(0, 0.06, 0), rotation: [-Math.PI / 2, 0, face], scale: [120 * s, 34 * s, 1] });
    batch.add(new THREE.BoxGeometry(36 * s, 2.2 * s, 10 * s), hull, { position: at(0, 1.1 * s, 0), rotation: [0, face, 0] });
    const decks = [[30, 3.2, 9, 2.2], [26, 3, 8, 5.4], [14, 2.6, 6, 8.4]];
    const windows = [];
    for (const [w, h, d, y] of decks) {
      batch.add(new THREE.BoxGeometry(w * s, h * s, d * s), white, { position: at(-1 * s, (y + h / 2) * s, 0), rotation: [0, face, 0] });
      batch.add(new THREE.BoxGeometry((w + 1) * s, 0.35 * s, (d + 1.4) * s), trim, { position: at(-1 * s, (y + h) * s, 0), rotation: [0, face, 0] });
      for (let px = -w / 2 + 1; px < w / 2; px += 2.2) {
        batch.add(new THREE.BoxGeometry(0.18 * s, h * s, 0.18 * s), white, { position: at((px - 1) * s, (y + h / 2) * s, (d / 2 + 0.6) * s) });
        windows.push(at((px - 1) * s, (y + h * 0.55) * s, (d / 2 + 0.2) * s));
      }
    }
    batch.add(new THREE.BoxGeometry(4.5 * s, 2.8 * s, 4.5 * s), white, { position: at(2 * s, 12.4 * s, 0), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(4.6 * s, 1 * s, 4.6 * s), dark, { position: at(2 * s, 12.8 * s, 0), rotation: [0, face, 0] });
    for (const dz of [-2.4, 2.4]) {
      batch.add(new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 13 * s, 8), dark, { position: at(9 * s, 14 * s, dz * s) });
      batch.add(new THREE.CylinderGeometry(1.5 * s, 0.8 * s, 1.6 * s, 8), dark, { position: at(9 * s, 21 * s, dz * s) });
    }
    // Bánh guồng ở đuôi: hai vành, nan hoa, cánh guồng.
    const wheelX = -20.5 * s;
    const wheelY = 4.8 * s;
    const r = 4.6 * s;
    for (const dz of [-3.6, 3.6]) {
      const rim = new THREE.TorusGeometry(r, 0.3 * s, 5, 20);
      batch.add(rim, trim, { position: at(wheelX, wheelY, dz * s), rotation: [0, face, 0] });
    }
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const ex = wheelX + Math.cos(angle) * r;
      const ey = wheelY + Math.sin(angle) * r;
      for (const dz of [-3.6, 3.6]) beam(batch, at(wheelX, wheelY, dz * s), at(ex, ey, dz * s), 0.25 * s, trim);
      beam(batch, at(ex, ey, -3.8 * s), at(ex, ey, 3.8 * s), 0.6 * s, trim);
    }
    env.nightPoints(windows, { color: '#ffdba0', size: 0.8 * s });
  },
};

const scatter = {
  'river-tree'(batch, x, z, size, rand, env) {
    const trunk = env.material('#6b5037', { roughness: 1 });
    const leaves = env.material('#557b46', { roughness: 1, flatShading: true });
    const height = (3.8 + rand() * 2.4) * size;
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.22 * size, height, 6), trunk, { position: [x, height / 2, z] });
    batch.add(new THREE.IcosahedronGeometry(1.45 * size, 1), leaves, { position: [x, height + 0.7 * size, z], scale: [1.25, 1, 0.95] });
  },
};

export const kit = { landmarks, scatter };
