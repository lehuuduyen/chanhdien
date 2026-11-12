// Vùng Đồi hoa (DC, DE, KY, MD, NC, TN, VA, WV): anh đào hồng, sơn thù du trắng, tử kinh (redbud) tím hồng, cây xanh
// tươi, đồng cỏ lấm tấm hoa, các lớp núi xanh lam xa dần (kiểu dãy Blue Ridge). Dữ liệu vùng ở
// scenes/thien-default/themes/blossom.json (chùa ngói xanh ngọc, đầu đao cong); hình dạng bộ đồ xem đầu landscape/common.mjs.
import * as THREE from 'three';
import { canvasTexture, mountainArc, seeded, speckle } from './common.mjs';

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Cây tán tròn chung cho các loài hoa: thân sẫm, vài cành, tán nhiều khối theo bảng màu (thấp nhất trên ~2,2 m với size 1).
function flowerTree(batch, x, z, size, rand, env, { bark, colors, trunk = 2.4, crown = 3.4, blobs = 9, spread = 1.3, radius = [0.8, 1.2] }) {
  const wood = env.material(bark);
  batch.add(new THREE.CylinderGeometry(0.16 * size, 0.28 * size, trunk * size, 8), wood, { position: [x, (trunk / 2) * size, z] });
  // Cây ở xa (env.detail 0): không cành, ít khối tán.
  for (let index = 0; index < (env.detail === 0 ? 0 : 3); index += 1) {
    const angle = rand() * Math.PI * 2 + index * 2;
    batch.add(new THREE.CylinderGeometry(0.05 * size, 0.1 * size, 1.4 * size, 6), wood, {
      position: [x + Math.cos(angle) * 0.4 * size, (trunk + 0.35) * size, z - Math.sin(angle) * 0.4 * size], rotation: [0, angle, 0.7],
    });
  }
  const count = env.detail === 0 ? Math.ceil(blobs * 0.55) : blobs;
  for (let blob = 0; blob < count; blob += 1) {
    const angle = blob * (count === blobs ? 0.8 : 1.5) + rand() * 0.4;
    const reach = (blob === 0 ? 0 : spread * (0.6 + rand() * 0.5)) * size;
    batch.add(new THREE.IcosahedronGeometry((radius[0] + rand() * (radius[1] - radius[0])) * size, env.detail ?? 1), env.material(pick(rand, colors), { flatShading: true }), {
      position: [x + Math.cos(angle) * reach, (crown + rand() * 0.7) * size, z - Math.sin(angle) * reach], scale: [1, 0.8, 1],
    });
  }
}

const trees = {
  cherry(batch, x, z, size, rand, env) {
    flowerTree(batch, x, z, size, rand, env, { bark: '#4b3a35', colors: ['#f4b6c8', '#f7c9d6', '#ee9fb8', '#fbe1ea', '#f2a9c0'] });
  },
  dogwood(batch, x, z, size, rand, env) {
    flowerTree(batch, x, z, size, rand, env, {
      bark: '#5a4a3e', colors: ['#f8f5ee', '#fdfbf6', '#f1eee2', '#d9e6c0'], trunk: 2.1, crown: 2.9, blobs: 7, spread: 0.9, radius: [0.55, 0.85],
    });
  },
  redbud(batch, x, z, size, rand, env) {
    flowerTree(batch, x, z, size, rand, env, {
      bark: '#4a3a33', colors: ['#c45a9a', '#d77ab0', '#b84a8c', '#e39ac3'], trunk: 2.1, crown: 2.9, blobs: 7, spread: 1, radius: [0.6, 0.9],
    });
  },
  // Cây lá xanh tươi đầu xuân, đứng xen làm nền cho cây hoa.
  greentree(batch, x, z, size, rand, env) {
    flowerTree(batch, x, z, size, rand, env, { bark: '#4d3c2c', colors: ['#5f9a45', '#4f8a3a', '#6fae4f', '#3f7a33'], crown: 3.6, radius: [0.9, 1.3] });
  },
};

const mountains = {
  // Các lớp núi dài nằm ngang, gần xanh lục, xa xanh lam nhạt dần (màu theo theme.mountains.colors: gần → xa).
  ridges(batch, env) {
    const rand = seeded('blossom-ridges');
    const dome = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const layers = env.colors.length;
    for (let layer = layers - 1; layer >= 0; layer -= 1) {
      const color = env.material(env.colors[layer], { flatShading: true });
      mountainArc(env, 7 + layer, { spread: 1.5, radiusX: 96 + layer * 26, radiusZ: 70 + layer * 26 }, (x, z) => {
        const angle = Math.atan2(x, z - env.midZ - 40);
        batch.add(dome.clone(), color, {
          position: [x, -2, z], rotation: [0, angle, 0],
          scale: [(26 + rand() * 16) * (1 + layer * 0.35), (9 + rand() * 6) * (1 + layer * 0.5), 9 + rand() * 4],
        });
      });
    }
    dome.dispose();
  },
};

const grounds = {
  // Đồng cỏ xanh tươi lấm tấm hoa trắng / vàng và cánh hoa anh đào rơi.
  meadow({ renderer }) {
    const rand = seeded('meadow');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#6a9a43';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 50, ['rgba(88, 140, 52, 0.5)', 'rgba(126, 170, 76, 0.45)'], [8, 22]);
      speckle(ctx, size, rand, 1000, ['#5d8c3a', '#7fae52', '#4f7d31'], [0.6, 1.3]);
      speckle(ctx, size, rand, 140, ['#fffdf5', '#f9e27a', '#f6c3d3', '#f2a9c0'], [1, 1.9]);
    }, renderer, 7);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

export const kit = { trees, scatter: {}, mountains, grounds };
