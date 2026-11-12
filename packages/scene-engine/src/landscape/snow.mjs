// Vùng Núi tuyết (AK, CO, MT, WY, ID): tuyết, vân sam phủ tuyết, đá phủ tuyết, người tuyết, núi cao chóp trắng. Chùa
// mái phủ tuyết (màu roof trắng trong dữ liệu vùng), nhũ băng dưới mép mái hiên / mái chính / mái cổng, đèn lồng ấm
// treo cột cổng. Dữ liệu vùng ở scenes/thien-default/themes/snow.json; hình dạng bộ đồ xem đầu landscape/common.mjs.
import * as THREE from 'three';
import { buildTemple, canvasTexture, mountainArc, roofEaves, seeded, speckle } from './common.mjs';

let shared = null;
const materials = () => (shared ||= {
  spruce: new THREE.MeshStandardMaterial({ color: '#24432f', roughness: 0.9, flatShading: true }),
  spruceLight: new THREE.MeshStandardMaterial({ color: '#2f553a', roughness: 0.9, flatShading: true }),
  snow: new THREE.MeshStandardMaterial({ color: '#f4f8fc', roughness: 0.75, emissive: '#c9d6e4', emissiveIntensity: 0.22, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: '#6f7680', roughness: 0.9, flatShading: true }),
  ice: new THREE.MeshStandardMaterial({ color: '#d8eefa', roughness: 0.3, metalness: 0.05, emissive: '#9fc7de', emissiveIntensity: 0.25 }),
});

const trees = {
  // Vân sam phủ tuyết: năm tầng nón xanh thẫm, đỉnh mỗi tầng có lớp tuyết. Tầng thấp nhất cao hơn 1 m (người đi sát
  // gốc không xuyên qua nhánh).
  snowpine(batch, x, z, size, rand, { m }) {
    const t = materials();
    batch.add(new THREE.CylinderGeometry(0.13 * size, 0.2 * size, 1.7 * size, 7), m.bark, { position: [x, 0.85 * size, z] });
    for (let tier = 0; tier < 5; tier += 1) {
      const radius = (1.35 - tier * 0.23) * size;
      const height = 1.25 * size;
      const y = (1.7 + tier * 0.72) * size;
      batch.add(new THREE.ConeGeometry(radius, height, 8), tier % 2 ? t.spruceLight : t.spruce, { position: [x, y, z] });
      // Nón tuyết đồng dạng, cao bằng nửa tầng, đặt trùng đỉnh tầng (to hơn chút để không nhấp nháy mặt).
      batch.add(new THREE.ConeGeometry(radius * 0.53, height * 0.5, 8), t.snow, { position: [x, y + height * 0.25 + 0.015 * size, z] });
    }
  },
};

const scatter = {
  // Người tuyết: ba khối tròn, mũi cà rốt, hai cành tay, khăn đỏ, mũ đen.
  snowman(batch, x, z, size, rand, env) {
    const t = materials();
    const turn = rand() * Math.PI * 2;
    const face = [Math.cos(turn), -Math.sin(turn)];
    for (const [radius, y] of [[0.55, 0.45], [0.4, 1.15], [0.28, 1.65]]) {
      batch.add(new THREE.SphereGeometry(radius * size, 10, 8), t.snow, { position: [x, y * size, z] });
    }
    batch.add(new THREE.ConeGeometry(0.05 * size, 0.28 * size, 6), env.material('#e8742a'), {
      position: [x + face[0] * 0.38 * size, 1.66 * size, z + face[1] * 0.38 * size], rotation: [0, turn, -Math.PI / 2],
    });
    batch.add(new THREE.TorusGeometry(0.3 * size, 0.06 * size, 6, 14), env.material('#c0392b'), { position: [x, 1.42 * size, z], rotation: [Math.PI / 2, 0, 0] });
    batch.add(new THREE.CylinderGeometry(0.2 * size, 0.2 * size, 0.28 * size, 10), env.material('#1f2328'), { position: [x, 2.02 * size, z] });
    batch.add(new THREE.CylinderGeometry(0.3 * size, 0.3 * size, 0.04 * size, 12), env.material('#1f2328'), { position: [x, 1.88 * size, z] });
    for (const side of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.02 * size, 0.03 * size, 0.7 * size, 4), env.material('#5a4030'), {
        position: [x - face[1] * side * 0.6 * size, 1.25 * size, z + face[0] * side * 0.6 * size], rotation: [0, turn, side * 1.1],
      });
    }
  },
  snowrock(batch, x, z, size, rand) {
    const t = materials();
    const r = (0.5 + rand() * 0.9) * size;
    batch.add(new THREE.DodecahedronGeometry(r, 0), t.rock, { position: [x, r * 0.2, z], rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.7, 1] });
    batch.add(new THREE.SphereGeometry(r * 0.95, 8, 5), t.snow, { position: [x, r * 0.55, z], scale: [1.35, 0.32, 0.95] });
  },
};

const mountains = {
  // Núi cao, chóp tuyết là nón đồng dạng trùng đỉnh.
  snowpeak(batch, env) {
    const snow = materials().snow;
    mountainArc(env, 9, { radiusX: 98, radiusZ: 74 }, (x, z, index) => {
      const radius = 20 + (index % 3) * 8;
      const height = 28 + (index % 4) * 9;
      const y = height / 2 - 6;
      batch.add(new THREE.ConeGeometry(radius, height, 6), env.material(env.colors[index % env.colors.length], { flatShading: true, roughness: 1 }), { position: [x, y, z] });
      const cap = 0.36;
      batch.add(new THREE.ConeGeometry(radius * cap * 1.04, height * cap, 6), snow, { position: [x, y + height / 2 - (height * cap) / 2 + 0.2, z] });
    });
  },
};

const grounds = {
  // Tuyết: trắng ngả xanh, vệt lõm bóng xanh nhạt và hạt lấp lánh.
  snow({ renderer }) {
    const rand = seeded('snow');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#eef3f8';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 36, ['rgba(196, 212, 230, 0.32)', 'rgba(255, 255, 255, 0.5)'], [12, 30]);
      speckle(ctx, size, rand, 900, ['#dde6f0', '#ffffff', '#d2deea'], [0.6, 1.6]);
    }, renderer, 11);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, emissive: '#c9d6e4', emissiveIntensity: 0.18 });
  },
};

// Nhũ băng dọc một mép mái: khối nhọn chúc xuống, dài ngắn xen nhau.
function icicles(batch, eaves, rand, step = 0.45) {
  const ice = materials().ice;
  for (const edge of [eaves.front]) {
    for (let x = eaves.x[0] + step / 2; x < eaves.x[1]; x += step) {
      const length = 0.22 + rand() * 0.5;
      batch.add(new THREE.ConeGeometry(0.05 + rand() * 0.03, length, 5), ice, { position: [x, edge.y - length / 2, edge.z], rotation: [Math.PI, 0, 0] });
    }
  }
}

// Chùa gốc (mái trắng = tuyết) + nhũ băng mái hiên, mái chính, mái các cửa cổng + đèn lồng ấm treo hai cột ngoài cổng.
function temple(ctx) {
  const parts = buildTemple(ctx);
  const { batch, m } = ctx;
  const rand = seeded('snow-icicles');
  icicles(batch, roofEaves(parts.roofs.porch), rand);
  icicles(batch, roofEaves(parts.roofs.main), rand);
  if (parts.gate) {
    for (const roof of parts.gate.roofs) {
      const eaves = roofEaves(roof);
      icicles(batch, eaves, rand, 0.4);
      // Mặt trong cổng (phía sân) cũng có nhũ băng.
      icicles(batch, { x: eaves.x, front: eaves.back }, rand, 0.4);
    }
    // Treo dưới đầu xà cổng, trước mặt cột ngoài cùng (phía sân), ngoài lối qua các cửa.
    const outer = Math.max(...parts.gate.pillars.map(Math.abs));
    for (const side of [-1, 1]) {
      const x = side * (outer + 0.25);
      const z = parts.gate.z - 0.45;
      batch.add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), m.darkStone, { position: [x, 3.35, z] });
      batch.add(new THREE.SphereGeometry(0.24, 12, 10), m.lantern, { position: [x, 3.0, z], scale: [1, 1.25, 1] });
      ctx.glow(x, 3.0, z);
    }
  }
  return parts;
}

export const kit = { trees, scatter, mountains, grounds, temple };
