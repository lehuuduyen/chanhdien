// Vùng Sa mạc (AZ, NV, NM, UT): cát gợn, xương rồng saguaro, đá đỏ, bụi khô, núi bàn đỏ. Chùa tường vàng đất mái ngói
// cam (màu trong dữ liệu vùng) thêm trang trí kiểu nhà đất miền Tây Nam: đầu xà gỗ (viga) nhô khỏi mặt tường dưới mái và
// chuỗi ớt đỏ phơi (ristra) treo ở xà hiên. Dữ liệu vùng ở scenes/thien-default/themes/desert.json; hình dạng bộ đồ xem
// đầu landscape/common.mjs.
import * as THREE from 'three';
import { buildTemple, canvasTexture, mountainArc, seeded, speckle, templeFrame } from './common.mjs';

let shared = null;
const materials = () => (shared ||= {
  cactus: new THREE.MeshStandardMaterial({ color: '#4f7f3d', roughness: 0.8 }),
  cactusDark: new THREE.MeshStandardMaterial({ color: '#3f6a32', roughness: 0.8 }),
  rock: new THREE.MeshStandardMaterial({ color: '#a9643d', roughness: 0.9, flatShading: true }),
  shrub: new THREE.MeshStandardMaterial({ color: '#8e9b5d', roughness: 0.9, flatShading: true }),
});

const trees = {
  // Xương rồng saguaro: thân cột, 1–3 cánh tay cong lên.
  saguaro(batch, x, z, size, rand) {
    const t = materials();
    const height = (3.4 + rand() * 1.8) * size;
    const radius = 0.3 * size;
    batch.add(new THREE.CylinderGeometry(radius * 0.92, radius, height, 9), t.cactus, { position: [x, height / 2, z] });
    batch.add(new THREE.SphereGeometry(radius * 0.92, 9, 6), t.cactus, { position: [x, height, z], scale: [1, 0.75, 1] });
    const arms = 1 + Math.floor(rand() * 2.6);
    for (let index = 0; index < arms; index += 1) {
      const angle = rand() * Math.PI * 2;
      const armY = height * (0.34 + rand() * 0.24);
      const out = (0.55 + rand() * 0.3) * size;
      const rise = (0.8 + rand() * 1.0) * size;
      const armRadius = radius * 0.62;
      const dx = Math.cos(angle);
      const dz = -Math.sin(angle);
      batch.add(new THREE.CylinderGeometry(armRadius, armRadius, out + radius, 7), t.cactusDark, {
        position: [x + dx * (out + radius) / 2, armY, z + dz * (out + radius) / 2], rotation: [0, angle, Math.PI / 2],
      });
      const elbow = [x + dx * (out + radius), armY, z + dz * (out + radius)];
      batch.add(new THREE.SphereGeometry(armRadius, 7, 5), t.cactusDark, { position: elbow });
      batch.add(new THREE.CylinderGeometry(armRadius * 0.92, armRadius, rise, 7), t.cactus, { position: [elbow[0], armY + rise / 2, elbow[2]] });
      batch.add(new THREE.SphereGeometry(armRadius * 0.92, 7, 5), t.cactus, { position: [elbow[0], armY + rise, elbow[2]], scale: [1, 0.75, 1] });
    }
  },
};

const scatter = {
  rock(batch, x, z, size, rand) {
    const r = (0.5 + rand() * 1.1) * size;
    batch.add(new THREE.DodecahedronGeometry(r, 0), materials().rock, { position: [x, r * 0.25, z], rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.7, 1] });
  },
  shrub(batch, x, z, size, rand) {
    const r = (0.35 + rand() * 0.3) * size;
    batch.add(new THREE.IcosahedronGeometry(r, 0), materials().shrub, { position: [x, r * 0.45, z], rotation: [0, rand() * 3, 0], scale: [1.3, 0.65, 1.1] });
  },
};

const mountains = {
  // Núi bàn hai tầng màu và mỏm đá cột (butte), màu lấy từ theme.mountains.colors (3 màu: tầng dưới, tầng trên, mỏm).
  mesa(batch, env) {
    const rand = seeded('mesa');
    const color = (index) => env.material(env.colors[index % env.colors.length], { flatShading: true, roughness: 1 });
    mountainArc(env, 12, { spread: 1.45, radiusX: 100, radiusZ: 78 }, (x, z, index) => {
      const radius = 9 + rand() * 13;
      const height = 9 + rand() * 13;
      if (index % 3 === 1) {
        batch.add(new THREE.CylinderGeometry(radius * 0.32, radius * 0.42, height * 1.5, 7), color(2), { position: [x, height * 0.75 - 2, z] });
        return;
      }
      batch.add(new THREE.CylinderGeometry(radius * 0.9, radius, height * 0.62, 8), color(0), { position: [x, height * 0.31 - 2, z] });
      batch.add(new THREE.CylinderGeometry(radius * 0.74, radius * 0.88, height * 0.4, 8), color(1), { position: [x, height * 0.62 + height * 0.2 - 2, z] });
    });
  },
};

const grounds = {
  // Cát: nền vàng cam, hạt sáng tối xen nhau và gợn cát lượn sóng.
  sand({ renderer }) {
    const rand = seeded('sand');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#d6a66b';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 40, ['rgba(196, 140, 84, 0.35)', 'rgba(232, 192, 140, 0.35)'], [10, 26]);
      ctx.lineWidth = 2;
      for (let row = 0; row < 9; row += 1) {
        ctx.strokeStyle = row % 2 ? 'rgba(150, 98, 52, 0.16)' : 'rgba(250, 222, 176, 0.22)';
        ctx.beginPath();
        for (let x = 0; x <= size; x += 4) {
          const y = row * (size / 9) + Math.sin((x / size) * Math.PI * 4 + row) * 5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      speckle(ctx, size, rand, 1400, ['#c38f56', '#e5bf88', '#b47e48', '#efd3a4'], [0.6, 1.4]);
    }, renderer, 9);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  },
};

// Chùa gốc + đầu xà gỗ dưới mái chính (mặt trước và hai bên) + chuỗi ớt treo hiên cạnh các cột ngoài, xa lối vào cửa.
function temple(ctx) {
  const parts = buildTemple(ctx);
  const { batch, data, env } = ctx;
  const { frontZ, hw, wallHeight, back } = templeFrame(ctx);
  const beam = env.material('#6b4a2e');
  const end = env.material('#8a6a48');
  const viga = (position, rotation) => {
    batch.add(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 8), beam, { position, rotation });
  };
  const y = wallHeight - 0.55;
  for (let x = -hw + 0.6; x <= hw - 0.6 + 1e-6; x += 1.05) viga([x, y, frontZ + 0.3 + 0.35], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    for (let z = back + 0.8; z <= frontZ - 0.6; z += 1.4) viga([side * (hw + 0.3 + 0.35), y, z], [0, 0, Math.PI / 2]);
  }
  // Mặt gỗ sáng ở đầu xà phía trước cho thấy rõ từng thanh.
  for (let x = -hw + 0.6; x <= hw - 0.6 + 1e-6; x += 1.05) {
    batch.add(new THREE.CircleGeometry(0.12, 8), end, { position: [x, y, frontZ + 1.06] });
  }
  // Ristra: chuỗi ớt đỏ (khối thuôn) treo dưới xà hiên cạnh các cột ngoài (lệch về phía giữa, không trùng đèn lồng),
  // xa cửa giữa.
  const chili = env.material('#b3261e');
  const stem = env.material('#3f6b2a');
  for (const [pillar] of data.porchPillars || []) {
    if (Math.abs(pillar) < 3) continue;
    const x = pillar - Math.sign(pillar) * 0.45;
    batch.add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), stem, { position: [x, 5.42, frontZ + 1.3] });
    for (let piece = 0; piece < 12; piece += 1) {
      const turn = piece * 2.2;
      batch.add(new THREE.SphereGeometry(0.075, 6, 4), chili, {
        position: [x + Math.cos(turn) * 0.08, 5.2 - piece * 0.1, frontZ + 1.3 + Math.sin(turn) * 0.08], scale: [1, 2.1, 1], rotation: [0, 0, Math.cos(turn) * 0.4],
      });
    }
  }
  return parts;
}

export const kit = { trees, scatter, mountains, grounds, temple };
