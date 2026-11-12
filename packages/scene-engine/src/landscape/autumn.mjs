// Vùng Rừng lá đỏ (CT, ME, MA, MI, MN, NH, NJ, NY, PA, RI, VT, WI): phong đỏ / cam / vàng, bạch dương thân trắng lá vàng,
// cỏ lá rụng, đồi rừng thu nhiều màu, đá xám phủ rêu. Dữ liệu vùng ở scenes/thien-default/themes/autumn.json (chùa gỗ
// nâu mái xám hai tầng); hình dạng bộ đồ xem đầu landscape/common.mjs.
import * as THREE from 'three';
import { canvasTexture, mountainArc, seeded, speckle } from './common.mjs';

// Tông lá thu: mỗi cây chọn một tông chính, vài khối lá lấy tông kề bên cho tán có chiều sâu.
const FOLIAGE = ['#b8241a', '#c9381d', '#d9531e', '#e57a1c', '#ee9b1f', '#f0b72e', '#9c2a1c'];
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

const trees = {
  // Phong: thân nâu xám, vài cành chĩa lên, tán tròn nhiều khối đỏ / cam / vàng (thấp nhất trên 2,3 m).
  maple(batch, x, z, size, rand, env) {
    const bark = env.material('#4a3628');
    batch.add(new THREE.CylinderGeometry(0.2 * size, 0.34 * size, 2.8 * size, 8), bark, { position: [x, 1.4 * size, z] });
    // Cây ở xa (env.detail 0): không cành, ít khối tán.
    for (let index = 0; index < (env.detail === 0 ? 0 : 3); index += 1) {
      const angle = rand() * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.06 * size, 0.11 * size, 1.5 * size, 6), bark, {
        position: [x + Math.cos(angle) * 0.35 * size, 2.9 * size, z - Math.sin(angle) * 0.35 * size], rotation: [0, angle, 0.55],
      });
    }
    const main = Math.floor(rand() * FOLIAGE.length);
    for (let blob = 0, blobs = env.detail === 0 ? 5 : 9; blob < blobs; blob += 1) {
      const angle = blob * (blobs === 9 ? 0.75 : 1.4) + rand() * 0.4;
      const reach = (blob === 0 ? 0 : 0.9 + rand() * 0.6) * size;
      const radius = (0.95 + rand() * 0.45) * size;
      const tone = FOLIAGE[(main + (rand() < 0.3 ? (rand() < 0.5 ? 1 : -1) : 0) + FOLIAGE.length) % FOLIAGE.length];
      batch.add(new THREE.IcosahedronGeometry(radius, env.detail ?? 1), env.material(tone, { flatShading: true }), {
        position: [x + Math.cos(angle) * reach, (3.7 + rand() * 0.9) * size, z - Math.sin(angle) * reach], scale: [1, 0.82, 1],
      });
    }
  },
  // Bạch dương: thân trắng mảnh có vết đen, tán thưa vàng.
  birch(batch, x, z, size, rand, env) {
    const height = (4 + rand() * 0.8) * size;
    batch.add(new THREE.CylinderGeometry(0.09 * size, 0.13 * size, height, 7), env.material('#e9e5dc'), { position: [x, height / 2, z] });
    for (let mark = 0; mark < (env.detail === 0 ? 2 : 5); mark += 1) {
      batch.add(new THREE.CylinderGeometry(0.135 * size, 0.135 * size, 0.08 * size, 7), env.material('#2d2a26'), {
        position: [x, (0.6 + mark * 0.62 + rand() * 0.2) * size, z], scale: [1, 1, 0.6 + rand() * 0.5],
      });
    }
    for (let blob = 0, blobs = env.detail === 0 ? 3 : 6; blob < blobs; blob += 1) {
      const angle = blob * (blobs === 6 ? 1.1 : 2.1) + rand();
      const reach = (0.35 + rand() * 0.45) * size;
      batch.add(new THREE.IcosahedronGeometry((0.55 + rand() * 0.3) * size, env.detail ?? 1), env.material(pick(rand, ['#f2c230', '#e9a91c', '#f5d45a']), { flatShading: true }), {
        position: [x + Math.cos(angle) * reach, height - (0.2 + rand() * 1.4) * size, z - Math.sin(angle) * reach], scale: [1, 1.2, 1],
      });
    }
  },
};

const scatter = {
  // Đá xám ven rừng, mảng rêu xanh trên đỉnh.
  boulder(batch, x, z, size, rand, env) {
    const r = (0.5 + rand() * 0.9) * size;
    batch.add(new THREE.DodecahedronGeometry(r, 0), env.material('#86857f', { flatShading: true }), { position: [x, r * 0.3, z], rotation: [rand() * 3, rand() * 3, 0], scale: [1.3, 0.75, 1] });
    batch.add(new THREE.SphereGeometry(r * 0.75, 7, 4), env.material('#5c6e36', { flatShading: true }), { position: [x, r * 0.7, z], scale: [1.2, 0.25, 0.9] });
  },
  // Đống lá rụng.
  leafpile(batch, x, z, size, rand, env) {
    const r = (0.45 + rand() * 0.35) * size;
    batch.add(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), env.material(pick(rand, FOLIAGE), { flatShading: true }), {
      position: [x, 0, z], scale: [1.4, 0.35, 1.1], rotation: [0, rand() * 3, 0],
    });
  },
};

const mountains = {
  // Đồi rừng thu: vòm thấp nối nhau, mặt đồi lấm tấm tán cây nhiều màu; hàng sau cao hơn, màu nhạt (sương làm xa).
  hills(batch, env) {
    const rand = seeded('autumn-hills');
    const dome = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const [row, count, radiusX, radiusZ, scale] of [[1, 8, 120, 92, 1.4], [0, 11, 92, 66, 1]]) {
      mountainArc(env, count, { spread: 1.5, radiusX, radiusZ }, (x, z, index) => {
        const width = (16 + rand() * 12) * scale;
        const height = (7 + rand() * 7) * scale;
        const base = env.colors[(index + row) % env.colors.length];
        batch.add(dome.clone(), env.material(base, { flatShading: true }), { position: [x, -1, z], scale: [width, height, width * 0.8] });
        if (row) return;
        // Tán cây trên sườn đồi gần.
        for (let tree = 0; tree < 22; tree += 1) {
          const angle = rand() * Math.PI * 2;
          const along = Math.sqrt(rand()) * 0.92;
          const px = Math.cos(angle) * along;
          const pz = Math.sin(angle) * along;
          const py = Math.sqrt(Math.max(0, 1 - along * along));
          batch.add(new THREE.IcosahedronGeometry(1.3 + rand() * 1.1, 0), env.material(pick(rand, FOLIAGE), { flatShading: true }), {
            position: [x + px * width, -1 + py * height + 0.6, z + pz * width * 0.8],
          });
        }
      });
    }
    dome.dispose();
  },
};

const grounds = {
  // Cỏ ô liu lấm tấm lá rụng đỏ / cam / vàng / nâu.
  leafgrass({ renderer }) {
    const rand = seeded('leafgrass');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#6b8238';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 50, ['rgba(92, 118, 44, 0.45)', 'rgba(130, 146, 66, 0.4)'], [8, 22]);
      speckle(ctx, size, rand, 900, ['#5d7531', '#7f9645', '#56692c'], [0.6, 1.3]);
      // Lá rụng: elip nhỏ xoay ngẫu nhiên, vẽ lặp qua mép để ô ảnh nối liền.
      for (let index = 0; index < 260; index += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const color = pick(rand, ['#c33a1e', '#d9621f', '#e8962a', '#f0bf3a', '#8a4a22', '#b02a1a']);
        const rx = 2 + rand() * 2.2;
        const ry = rx * (0.45 + rand() * 0.3);
        const turn = rand() * Math.PI;
        ctx.fillStyle = color;
        for (const dx of [-size, 0, size]) {
          for (const dy of [-size, 0, size]) {
            ctx.beginPath();
            ctx.ellipse(x + dx, y + dy, rx, ry, turn, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }, renderer, 6);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

export const kit = { trees, scatter, mountains, grounds };
