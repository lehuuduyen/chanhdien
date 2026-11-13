// Vùng Tây Bắc Thái Bình Dương (OR, WA): rừng Douglas cao, nền rêu ẩm, dương xỉ, đá và gỗ mục phủ rêu,
// sương lam cùng một núi lửa chóp tuyết trên đường chân trời. Dữ liệu vùng nằm ở
// scenes/thien-default/themes/pacific.json; chùa dùng bộ dựng chung với gỗ tối và mái xám đá.
import * as THREE from 'three';
import { canvasTexture, mountainArc, seeded, speckle } from './common.mjs';

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

const trees = {
  // Douglas fir: thân thẳng rất cao, tán hẹp nhiều tầng; đáy tán trên 2,2 m để người và camera đi dưới cây.
  'douglas-fir'(batch, x, z, size, rand, env) {
    const height = (7.2 + rand() * 1.5) * size;
    const bark = env.material('#544337', { roughness: 1 });
    const dark = env.material('#24483a', { roughness: 1, flatShading: true });
    const light = env.material('#315844', { roughness: 1, flatShading: true });
    batch.add(new THREE.CylinderGeometry(0.16 * size, 0.28 * size, height, 7), bark, {
      position: [x, height / 2, z],
    });
    const tiers = env.detail === 0 ? 5 : 8;
    for (let tier = 0; tier < tiers; tier += 1) {
      const ratio = tier / Math.max(1, tiers - 1);
      const radius = (1.5 - ratio * 1.05) * size;
      const crownY = (3.15 + ratio * 4.65) * size;
      batch.add(new THREE.ConeGeometry(radius, 1.45 * size, env.detail === 0 ? 6 : 8), tier % 2 ? light : dark, {
        position: [x + (rand() - 0.5) * 0.12 * size, crownY, z + (rand() - 0.5) * 0.12 * size],
        rotation: [0, rand() * Math.PI, 0],
      });
    }
  },
};

const scatter = {
  'moss-rock'(batch, x, z, size, rand, env) {
    const radius = (0.55 + rand() * 1.05) * size;
    batch.add(new THREE.DodecahedronGeometry(radius, 0), env.material('#68716d', { roughness: 1, flatShading: true }), {
      position: [x, radius * 0.28, z], rotation: [rand() * 0.4, rand() * Math.PI, rand() * 0.25], scale: [1.35, 0.72, 1],
    });
    batch.add(new THREE.SphereGeometry(radius * 0.82, 7, 4), env.material(pick(rand, ['#4f6d3f', '#597948', '#425f38']), { roughness: 1, flatShading: true }), {
      position: [x, radius * 0.7, z], scale: [1.22, 0.24, 0.92], rotation: [0, rand() * Math.PI, 0],
    });
  },

  'sword-fern'(batch, x, z, size, rand, env) {
    const green = env.material(pick(rand, ['#315f42', '#3b7049', '#497c4e']), { roughness: 1, flatShading: true });
    const leaves = env.detail === 0 ? 5 : 8;
    for (let leaf = 0; leaf < leaves; leaf += 1) {
      const yaw = (leaf / leaves) * Math.PI * 2 + rand() * 0.35;
      const length = (0.65 + rand() * 0.42) * size;
      batch.add(new THREE.ConeGeometry(0.12 * size, length, 5), green, {
        position: [x + Math.cos(yaw) * length * 0.35, 0.2 * size, z + Math.sin(yaw) * length * 0.35],
        rotation: [Math.PI / 2.8, yaw, 0], order: 'YXZ', scale: [1, 1, 0.36],
      });
    }
  },

  'fallen-log'(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI;
    const length = (2.8 + rand() * 2.6) * size;
    const radius = (0.28 + rand() * 0.16) * size;
    batch.add(new THREE.CylinderGeometry(radius, radius * 1.08, length, 8), env.material('#604b3a', { roughness: 1, flatShading: true }), {
      position: [x, radius * 0.78, z], rotation: [Math.PI / 2, yaw, 0], order: 'YXZ',
    });
    batch.add(new THREE.CylinderGeometry(radius * 1.01, radius * 1.02, length * 0.72, 8, 1, true), env.material('#557447', { roughness: 1, flatShading: true }), {
      position: [x, radius * 1.04, z], rotation: [Math.PI / 2, yaw, 0], order: 'YXZ', scale: [1, 1, 0.72],
    });
  },
};

const mountains = {
  // Một núi lửa Cascade đơn độc nhưng có chân đồi rừng thấp để không giống nón / kim tự tháp đứng rời.
  'cascade-volcano'(batch, env) {
    const rand = seeded('pacific-cascade-volcano');
    const dome = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    mountainArc(env, 9, { spread: 1.45, radiusX: 105, radiusZ: 78 }, (x, z, index) => {
      const width = 13 + rand() * 11;
      batch.add(dome.clone(), env.material(env.colors[index % env.colors.length], { roughness: 1, flatShading: true }), {
        position: [x, -1.2, z], scale: [width, 5 + rand() * 4, width * 0.7],
      });
    });
    const centerZ = env.midZ + 116;
    batch.add(dome.clone(), env.material('#3f594b', { roughness: 1, flatShading: true }), {
      position: [0, -3.5, centerZ], scale: [52, 18, 36],
    });
    dome.dispose();
    const radius = 31;
    const height = 42;
    batch.add(new THREE.ConeGeometry(radius, height, 10), env.material('#52645d', { roughness: 1, flatShading: true }), {
      position: [0, height / 2 - 1, centerZ], rotation: [0, Math.PI / 10, 0], scale: [1.15, 1, 1],
    });
    batch.add(new THREE.ConeGeometry(radius * 0.39, height * 0.39, 10), env.material('#e7edf0', { roughness: 0.88, flatShading: true }), {
      position: [0, height - 1 - (height * 0.39) / 2 + 0.15, centerZ], rotation: [0, Math.PI / 10, 0], scale: [1.17, 1, 1.01],
    });
  },
};

const grounds = {
  // Nền rừng mưa: rêu xanh, đất ẩm nâu và vệt lá kim; texture lặp theo mét, không cần ảnh tải ngoài.
  'rainforest-floor'({ renderer }) {
    const rand = seeded('pacific-rainforest-floor');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#405b39';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 58, ['rgba(47, 78, 45, 0.52)', 'rgba(96, 103, 64, 0.38)', 'rgba(75, 59, 43, 0.38)'], [9, 25]);
      speckle(ctx, size, rand, 980, ['#314c33', '#4e6b42', '#625740', '#71805a'], [0.5, 1.35]);
      ctx.lineWidth = 1;
      for (let needle = 0; needle < 420; needle += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const length = 2 + rand() * 4;
        const turn = rand() * Math.PI * 2;
        ctx.strokeStyle = rand() < 0.55 ? '#443d30' : '#6b6847';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(turn) * length, y + Math.sin(turn) * length);
        ctx.stroke();
      }
    }, renderer, 12);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

export const kit = { trees, scatter, mountains, grounds };
