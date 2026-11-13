// Kansas: biển hướng dương sát chân trời và một lốc xoáy lớn ở xa. Lốc là khối đục ít sương để vẫn nhận ra ban ngày;
// ban đêm thêm một tia chớp dạng ống mảnh, không dùng lớp trong suốt phủ màn hình.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  'sunflower-sea'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const stem = env.far('#4f733b', { haze, roughness: 1 });
    const petals = env.far('#edc52f', { haze, roughness: 0.9, flatShading: true });
    const centers = env.far('#70461f', { haze, roughness: 1 });
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 24; column += 1) {
        const px = (column - 11.5) * 5.4 * scale + (row % 2) * 2.7 * scale;
        const pz = (row - 3) * 3.8 * scale;
        const height = (2.3 + rand() * 1.1) * scale;
        batch.add(new THREE.CylinderGeometry(0.045 * scale, 0.075 * scale, height, 5), stem, { position: at(px, height / 2, pz) });
        batch.add(new THREE.IcosahedronGeometry(0.48 * scale, 0), petals, {
          position: at(px, height, pz), rotation: [0, face, 0], scale: [1.45, 1.45, 0.38],
        });
        batch.add(new THREE.SphereGeometry(0.22 * scale, 7, 5), centers, {
          position: at(px, height, pz + 0.38 * scale), scale: [1, 1, 0.35],
        });
      }
    }
  },

  'kansas-tornado'(batch, x, z, scale, rand, env, { haze }) {
    const cloud = env.far('#65717a', { haze, roughness: 1, flatShading: true });
    const shadow = env.far('#465159', { haze, roughness: 1, flatShading: true });
    const height = 43 * scale;
    batch.add(new THREE.ConeGeometry(12 * scale, height, 18, 1, true), cloud, {
      position: [x, height / 2 + 0.7 * scale, z], rotation: [Math.PI, 0, 0], scale: [1, 1, 0.78],
    });
    for (let ring = 0; ring < 9; ring += 1) {
      const ratio = ring / 8;
      const radius = (1.1 + ratio * 10.3) * scale;
      batch.add(new THREE.TorusGeometry(radius, (0.34 + ratio * 0.5) * scale, 5, 18), ring % 2 ? shadow : cloud, {
        position: [x + Math.sin(ring * 1.7) * 0.7 * scale, (3 + ratio * 37) * scale, z + Math.cos(ring * 1.4) * 0.45 * scale],
        rotation: [Math.PI / 2, 0, ring * 0.28], scale: [1, 0.76, 1],
      });
    }
    for (let blob = 0; blob < 8; blob += 1) {
      const angle = (blob / 8) * Math.PI * 2;
      batch.add(new THREE.IcosahedronGeometry((4.2 + rand() * 2.4) * scale, 0), shadow, {
        position: [x + Math.cos(angle) * 9 * scale, height + (rand() - 0.5) * 3 * scale, z + Math.sin(angle) * 5 * scale],
        scale: [1.35, 0.65, 1],
      });
    }

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + 8 * scale, height + 6 * scale, z),
      new THREE.Vector3(x + 4 * scale, 36 * scale, z + 1.5 * scale),
      new THREE.Vector3(x + 7 * scale, 29 * scale, z - 1 * scale),
      new THREE.Vector3(x + 2 * scale, 21 * scale, z + 0.8 * scale),
      new THREE.Vector3(x + 5 * scale, 12 * scale, z),
    ], false, 'centripetal');
    env.nightMesh(new THREE.TubeGeometry(curve, 16, 0.18 * scale, 4, false), '#d9e9ff', 0.82);
    env.nightGlow(x + 5 * scale, 27 * scale, z, 5 * scale, '#c9dcff');
  },
};

export const kit = { landmarks, scatter: {} };
