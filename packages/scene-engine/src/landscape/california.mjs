// Vùng California (CA): đồi cỏ vàng, sồi xanh tán rộng (live oak), cọ quạt thân cao mảnh, cây bụi chaparral, đá sa
// thạch, núi xanh xám xa. Dữ liệu vùng ở scenes/thien-default/themes/california.json (chùa tường trắng, mái ngói đỏ);
// hình dạng bộ đồ xem đầu landscape/common.mjs.
import * as THREE from 'three';
import { canvasTexture, mountainArc, seeded, speckle } from './common.mjs';

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

const trees = {
  // Sồi xanh: thân ngắn chẻ hai nghiêng, tán rộng dẹt xanh ô liu sẫm (thấp nhất trên 2,2 m).
  oak(batch, x, z, size, rand, env) {
    const bark = env.material('#55473a');
    batch.add(new THREE.CylinderGeometry(0.26 * size, 0.38 * size, 1.6 * size, 8), bark, { position: [x, 0.8 * size, z] });
    const turn = rand() * Math.PI;
    for (const side of [-1, 1]) {
      const angle = turn + (side > 0 ? 0 : Math.PI);
      batch.add(new THREE.CylinderGeometry(0.13 * size, 0.22 * size, 2.0 * size, 7), bark, {
        position: [x + Math.cos(angle) * 0.45 * size, 2.2 * size, z - Math.sin(angle) * 0.45 * size], rotation: [0, angle, 0.5],
      });
    }
    // Cây ở xa (env.detail 0): ít khối tán.
    for (let blob = 0, blobs = env.detail === 0 ? 6 : 10; blob < blobs; blob += 1) {
      const angle = blob * (blobs === 10 ? 0.7 : 1.15) + rand() * 0.4;
      const reach = (blob === 0 ? 0 : 1.2 + rand() * 1.1) * size;
      batch.add(new THREE.IcosahedronGeometry((1.0 + rand() * 0.5) * size, env.detail ?? 1), env.material(pick(rand, ['#4d5f2f', '#5a6b35', '#44562a', '#62723c']), { flatShading: true }), {
        position: [x + Math.cos(angle) * reach, (3.4 + rand() * 0.5) * size, z - Math.sin(angle) * reach], scale: [1.1, 0.6, 1.1],
      });
    }
  },
  // Cọ quạt: thân rất cao mảnh, "váy" lá khô dưới ngọn, chùm lá quạt nhỏ trên cùng.
  fanpalm(batch, x, z, size, rand, env) {
    const height = (8.5 + rand() * 3) * size;
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.2 * size, height, 7), env.material('#8d735a'), { position: [x, height / 2, z] });
    batch.add(new THREE.CylinderGeometry(0.3 * size, 0.42 * size, 1.4 * size, 8), env.material('#7a5d3f', { flatShading: true }), { position: [x, height - 0.9 * size, z] });
    const fronds = 12;
    for (let index = 0; index < fronds; index += 1) {
      const angle = (index / fronds) * Math.PI * 2 + rand() * 0.2;
      const tilt = -0.15 + (index % 3) * 0.25;
      const length = 1.1 * size;
      batch.add(new THREE.BoxGeometry(length, 0.04 * size, 0.6 * size), env.material(pick(rand, ['#5f8a3e', '#4f7a34', '#6b9646']), { flatShading: true, side: THREE.DoubleSide }), {
        position: [x + Math.cos(angle) * length * 0.5, height + Math.sin(tilt) * length * 0.5, z - Math.sin(angle) * length * 0.5],
        rotation: [0, angle, tilt],
      });
    }
  },
};

const scatter = {
  // Cây bụi chaparral xanh xám.
  chaparral(batch, x, z, size, rand, env) {
    for (let index = 0; index < 3; index += 1) {
      const r = (0.4 + rand() * 0.35) * size;
      batch.add(new THREE.IcosahedronGeometry(r, 0), env.material(pick(rand, ['#7d8b5a', '#5c6b40', '#8f9a68']), { flatShading: true }), {
        position: [x + (rand() - 0.5) * size, r * 0.55, z + (rand() - 0.5) * size], scale: [1.2, 0.7, 1.1],
      });
    }
  },
  // Đá sa thạch.
  sandstone(batch, x, z, size, rand, env) {
    const r = (0.5 + rand() * 0.8) * size;
    batch.add(new THREE.DodecahedronGeometry(r, 0), env.material('#b89a78', { flatShading: true }), { position: [x, r * 0.3, z], rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.7, 1] });
  },
};

const mountains = {
  // Đồi cỏ vàng lượn sóng ở gần (rải sồi sẫm trên sườn), núi xanh xám cao ở xa. Màu: 3 tông vàng rồi màu núi xa.
  goldhills(batch, env) {
    const rand = seeded('california-hills');
    const dome = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const far = env.colors[env.colors.length - 1];
    const golds = env.colors.length > 1 ? env.colors.slice(0, -1) : env.colors;
    // Dãy núi xa xanh xám: các vòm dài thấp chồng nhau dọc theo cung (ở xa sương phủ gần kín, nón nhọn chỉ còn bóng
    // hình chóp như kim tự tháp nên dùng vòm).
    const ridge = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    mountainArc(env, 9, { spread: 1.4, radiusX: 128, radiusZ: 100 }, (x, z) => {
      const angle = Math.atan2(x, z - env.midZ - 40);
      for (let peak = 0; peak < 2; peak += 1) {
        const offset = (peak - 0.5) * 22 + (rand() - 0.5) * 8;
        batch.add(ridge.clone(), env.material(far, { flatShading: true }), {
          position: [x + Math.cos(angle) * offset, -3, z - Math.sin(angle) * offset], rotation: [0, angle + (rand() - 0.5) * 0.4, 0],
          scale: [26 + rand() * 14, 15 + rand() * 12, 12 + rand() * 5],
        });
      }
    });
    ridge.dispose();
    mountainArc(env, 12, { spread: 1.5, radiusX: 90, radiusZ: 66 }, (x, z) => {
      const width = 15 + rand() * 12;
      const height = 6 + rand() * 6;
      batch.add(dome.clone(), env.material(pick(rand, golds), { flatShading: true }), { position: [x, -1, z], scale: [width, height, width * 0.75] });
      for (let tree = 0; tree < 6; tree += 1) {
        const angle = rand() * Math.PI * 2;
        const along = Math.sqrt(rand()) * 0.85;
        const py = Math.sqrt(Math.max(0, 1 - along * along));
        batch.add(new THREE.IcosahedronGeometry(1.2 + rand() * 0.8, 0), env.material('#4d5f2f', { flatShading: true }), {
          position: [x + Math.cos(angle) * along * width, -1 + py * height + 0.4, z + Math.sin(angle) * along * width * 0.75], scale: [1.2, 0.7, 1.2],
        });
      }
    });
    dome.dispose();
  },
};

const grounds = {
  // Cỏ khô vàng óng: nền rơm, vệt cỏ sáng tối ngắn.
  goldgrass({ renderer }) {
    const rand = seeded('goldgrass');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#c9a85c';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 45, ['rgba(176, 140, 70, 0.4)', 'rgba(222, 194, 120, 0.4)'], [8, 24]);
      ctx.lineWidth = 1;
      for (let index = 0; index < 1600; index += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const length = 2 + rand() * 4;
        const lean = (rand() - 0.5) * 0.8;
        ctx.strokeStyle = pick(rand, ['#e2c47c', '#a88845', '#d6b46a', '#b9974f']);
        for (const dx of [-size, 0, size]) {
          for (const dy of [-size, 0, size]) {
            ctx.beginPath();
            ctx.moveTo(x + dx, y + dy);
            ctx.lineTo(x + dx + lean * length, y + dy - length);
            ctx.stroke();
          }
        }
      }
    }, renderer, 5);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

export const kit = { trees, scatter, mountains, grounds };
