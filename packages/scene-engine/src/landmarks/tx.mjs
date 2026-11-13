// Texas: cột tưởng niệm San Jacinto có ngôi sao ngoài cổng, tháp khoan phía đông, đồng bluebonnet và bò sừng dài.
// Các hình đều giản lược, không chữ / logo; vật rải giữ trong band gần tường để không lấn chân trời hoặc lối đi.
import * as THREE from 'three';
import { beam, frame } from './common.mjs';

function starGeometry(radius, depth) {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const r = index % 2 ? radius * 0.43 : radius;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (index) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
}

const landmarks = {
  'san-jacinto'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const stone = env.far('#d7cfb8', { haze, roughness: 0.88 });
    const gold = env.far('#d9ad42', { haze, roughness: 0.62, metalness: 0.18 });
    batch.add(new THREE.BoxGeometry(25 * scale, 2.2 * scale, 19 * scale), stone, {
      position: at(0, 1.1 * scale, 0), rotation: [0, face, 0],
    });
    batch.add(new THREE.BoxGeometry(14 * scale, 5 * scale, 12 * scale), stone, {
      position: at(0, 4.7 * scale, 0), rotation: [0, face, 0],
    });
    batch.add(new THREE.CylinderGeometry(2.8 * scale, 5.2 * scale, 47 * scale, 8), stone, {
      position: at(0, 30.7 * scale, 0), rotation: [0, Math.PI / 8, 0],
    });
    const starPosition = at(0, 57.2 * scale, -0.7 * scale);
    batch.add(starGeometry(6.5 * scale, 1.4 * scale), gold, {
      position: starPosition, rotation: [0, face, 0],
    });
    const glowStar = starGeometry(6.55 * scale, 1.45 * scale);
    glowStar.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...starPosition),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, face, 0)),
      new THREE.Vector3(1, 1, 1),
    ));
    env.nightMesh(glowStar, '#ffd75a', 0.7);
    env.nightPoints([
      at(0, 61.7 * scale, 0), at(-8 * scale, 2.5 * scale, 7 * scale), at(8 * scale, 2.5 * scale, 7 * scale),
    ], { color: '#ffe29a', size: 1.9 * scale });
  },

  'texas-derrick'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const steel = env.far('#4f4540', { haze, roughness: 0.78, metalness: 0.12 });
    const height = 42 * scale;
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(1 * scale, height, 1 * scale), steel, {
        position: at(side * 5 * scale, height / 2, 0), rotation: [0, 0, side * 0.13],
      });
      for (let level = 1; level < 7; level += 1) {
        batch.add(new THREE.BoxGeometry(10.5 * scale, 0.55 * scale, 0.75 * scale), steel, {
          position: at(0, level * 5.8 * scale, 0), rotation: [0, face, level % 2 ? 0.2 : -0.2],
        });
      }
    }
    batch.add(new THREE.ConeGeometry(5.8 * scale, 7 * scale, 4), steel, {
      position: at(0, height + 3.5 * scale, 0), rotation: [0, Math.PI / 4, 0],
    });
    env.nightPoints([at(0, 13 * scale, 0), at(0, 28 * scale, 0), at(0, height + 6 * scale, 0)], {
      color: '#ff6b4a', size: 0.9 * scale,
    });
  },
};

const scatter = {
  bluebonnet(batch, x, z, size, rand, env) {
    const green = env.material('#4d7043', { roughness: 1 });
    const blue = env.material(rand() < 0.18 ? '#eee8da' : '#506fb5', { roughness: 0.92, flatShading: true });
    const height = (0.65 + rand() * 0.45) * size;
    batch.add(new THREE.CylinderGeometry(0.025 * size, 0.04 * size, height, 4), green, {
      position: [x, height / 2, z], rotation: [0, rand() * Math.PI, (rand() - 0.5) * 0.18],
    });
    batch.add(new THREE.ConeGeometry(0.2 * size, 0.48 * size, 6), blue, {
      position: [x, height + 0.18 * size, z], rotation: [0, rand() * Math.PI, 0],
    });
  },

  longhorn(batch, x, z, size, rand, env) {
    const body = env.material(rand() < 0.5 ? '#8a5636' : '#6f4431', { roughness: 0.96, flatShading: true });
    const horn = env.material('#e5d6b7', { roughness: 0.88 });
    const yaw = rand() * Math.PI * 2;
    const local = frame(x, z, yaw);
    batch.add(new THREE.CapsuleGeometry(0.58 * size, 1.25 * size, 2, 6), body, {
      position: local(0, 1.35 * size, 0), rotation: [0, yaw, Math.PI / 2], scale: [1, 1.35, 0.85],
    });
    batch.add(new THREE.BoxGeometry(0.72 * size, 0.7 * size, 0.78 * size), body, {
      position: local(1.2 * size, 1.55 * size, 0), rotation: [0, yaw, 0],
    });
    for (const side of [-1, 1]) {
      beam(batch, local(1.22 * size, 1.82 * size, side * 0.22 * size), local(1.32 * size, 2.02 * size, side * 1.75 * size), 0.09 * size, horn);
      for (const leg of [-0.55, 0.55]) batch.add(new THREE.CylinderGeometry(0.09 * size, 0.12 * size, 1 * size, 5), body, {
        position: local(leg * size, 0.55 * size, side * 0.33 * size),
      });
    }
  },
};

export const kit = { landmarks, scatter };
