// Vùng Biển nhiệt đới (FL, HI): cát san hô trắng, dừa nghiêng, dâm bụt và biển xanh ngọc ngoài cổng. Dữ liệu vùng ở
// scenes/thien-default/themes/tropical.json; toàn bộ hình được dựng bằng khối và gộp theo vật liệu, không tải thêm ảnh.
import * as THREE from 'three';
import {
  addRoof, addTempleFestivalLights, buildGate, buildTempleFacade, canvasTexture, seeded, speckle, templeFrame,
} from './common.mjs';

let shared = null;
const materials = () => (shared ||= {
  trunk: new THREE.MeshStandardMaterial({ color: '#9a7048', roughness: 0.96, flatShading: true }),
  leaf: new THREE.MeshStandardMaterial({ color: '#2d9254', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
  leafLight: new THREE.MeshStandardMaterial({ color: '#49ac60', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
  coconut: new THREE.MeshStandardMaterial({ color: '#78a53c', roughness: 0.85, flatShading: true }),
  hibiscusLeaf: new THREE.MeshStandardMaterial({ color: '#267d48', roughness: 0.92, flatShading: true }),
  hibiscusRed: new THREE.MeshStandardMaterial({ color: '#ef4164', roughness: 0.82, side: THREE.DoubleSide }),
  hibiscusPink: new THREE.MeshStandardMaterial({ color: '#ff87a2', roughness: 0.82, side: THREE.DoubleSide }),
  stamen: new THREE.MeshStandardMaterial({ color: '#ffd45a', roughness: 0.7 }),
  coral: new THREE.MeshStandardMaterial({ color: '#d6b69b', roughness: 0.98, flatShading: true }),
});

const trees = {
  // Dừa thân nghiêng; tàu lá bắt đầu trên 4,5 m nên không che camera hay cắt qua người đi dưới tán.
  coconut(batch, x, z, size, rand) {
    const t = materials();
    const height = (5.8 + rand() * 1.2) * size;
    const tiltX = (rand() - 0.5) * 0.2;
    const tiltZ = (rand() - 0.5) * 0.26;
    const up = (length) => [
      -Math.sin(tiltZ) * length,
      Math.cos(tiltZ) * Math.cos(tiltX) * length,
      Math.cos(tiltZ) * Math.sin(tiltX) * length,
    ];
    const [cx, cy, cz] = up(height / 2);
    batch.add(new THREE.CylinderGeometry(0.16 * size, 0.25 * size, height, 7), t.trunk, {
      position: [x + cx, cy, z + cz], rotation: [tiltX, 0, tiltZ],
    });
    const [tx, ty, tz] = up(height);
    const top = [x + tx, ty, z + tz];
    batch.add(new THREE.SphereGeometry(0.32 * size, 7, 5), t.trunk, { position: top });
    const fronds = 11;
    for (let index = 0; index < fronds; index += 1) {
      const angle = (index / fronds) * Math.PI * 2 + rand() * 0.24;
      const length = (2.35 + rand() * 0.55) * size;
      const droop = 0.2 + (index % 3) * 0.12 + rand() * 0.08;
      batch.add(new THREE.BoxGeometry(length, 0.045 * size, (0.42 + rand() * 0.12) * size), index % 2 ? t.leaf : t.leafLight, {
        position: [
          top[0] + Math.cos(angle) * Math.cos(droop) * length / 2,
          top[1] - Math.sin(droop) * length / 2,
          top[2] - Math.sin(angle) * Math.cos(droop) * length / 2,
        ],
        rotation: [0, angle, -droop],
      });
    }
    for (let index = 0; index < 3; index += 1) {
      const angle = index * Math.PI * 2 / 3 + rand() * 0.3;
      batch.add(new THREE.SphereGeometry(0.19 * size, 7, 5), t.coconut, {
        position: [top[0] + Math.cos(angle) * 0.28 * size, top[1] - 0.38 * size, top[2] + Math.sin(angle) * 0.28 * size],
        scale: [1, 1.12, 1],
      });
    }
  },
};

const scatter = {
  // Bụi dâm bụt gọn: tán thấp và các đốm hoa năm cánh nhìn rõ từ xa.
  hibiscus(batch, x, z, size, rand) {
    const t = materials();
    const radius = (0.55 + rand() * 0.25) * size;
    batch.add(new THREE.IcosahedronGeometry(radius, 1), t.hibiscusLeaf, {
      position: [x, radius * 0.72, z], rotation: [0, rand() * Math.PI, 0], scale: [1.25, 0.85, 1],
    });
    const flowers = 4;
    for (let index = 0; index < flowers; index += 1) {
      const angle = (index / flowers) * Math.PI * 2 + rand() * 0.55;
      const y = radius * (0.75 + rand() * 0.65);
      const fx = x + Math.cos(angle) * radius * 0.78;
      const fz = z + Math.sin(angle) * radius * 0.78;
      batch.add(new THREE.CircleGeometry(0.16 * size, 5), index % 2 ? t.hibiscusPink : t.hibiscusRed, {
        position: [fx, y, fz], rotation: [0, angle + Math.PI / 2, 0],
      });
      batch.add(new THREE.CylinderGeometry(0.018 * size, 0.025 * size, 0.2 * size, 5), t.stamen, {
        position: [fx + Math.cos(angle) * 0.08 * size, y, fz + Math.sin(angle) * 0.08 * size],
        rotation: [Math.PI / 2, 0, -angle],
      });
    }
  },
  'coral-rock'(batch, x, z, size, rand) {
    const radius = (0.35 + rand() * 0.75) * size;
    batch.add(new THREE.DodecahedronGeometry(radius, 0), materials().coral, {
      position: [x, radius * 0.22, z], rotation: [rand() * 2, rand() * Math.PI, rand() * 0.4], scale: [1.35, 0.55, 1],
    });
  },
};

const mountains = {
  // Mặt biển chỉ nằm ngoài tường phía cổng (z > ground.z[1]); các dải sáng cố định gợi sóng mà không cần animation.
  'tropical-ocean'(batch, env) {
    const rand = seeded('tropical-ocean');
    const ocean = env.material(env.colors[0], { roughness: 0.28, metalness: 0.08, emissive: '#0c6f79', emissiveIntensity: 0.13 });
    const shallow = env.material(env.colors[1], { roughness: 0.35, metalness: 0.03, emissive: '#2c9c99', emissiveIntensity: 0.12 });
    const island = env.material(env.colors[2], { roughness: 0.95, flatShading: true });
    // Lùi mép nước 15 m khỏi tường: phía cổng bắt đầu ở z=116, chừa bãi cát cho vật rải đứng trên bờ.
    batch.add(new THREE.PlaneGeometry(300, 108), ocean, { position: [0, 0.035, 170], rotation: [-Math.PI / 2, 0, 0] });
    batch.add(new THREE.PlaneGeometry(300, 12), shallow, { position: [0, 0.045, 122], rotation: [-Math.PI / 2, 0, 0] });
    // Hai dải biển hai bên làm sân giống một khuôn viên ven đảo và thấy được từ góc tường đông / ảnh trên cao.
    for (const side of [-1, 1]) {
      batch.add(new THREE.PlaneGeometry(84, 160), ocean, { position: [side * 110, 0.035, 55], rotation: [-Math.PI / 2, 0, 0] });
      batch.add(new THREE.PlaneGeometry(10, 160), shallow, { position: [side * 73, 0.045, 55], rotation: [-Math.PI / 2, 0, 0] });
    }
    for (let index = 0; index < 26; index += 1) {
      const width = 5 + rand() * 20;
      const z = 119 + rand() * 75;
      const x = (rand() - 0.5) * 250;
      batch.add(new THREE.BoxGeometry(width, 0.018, 0.12 + rand() * 0.16), shallow, { position: [x, 0.062, z], rotation: [0, (rand() - 0.5) * 0.16, 0] });
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 10; index += 1) {
        const length = 5 + rand() * 18;
        batch.add(new THREE.BoxGeometry(0.12 + rand() * 0.16, 0.018, length), shallow, {
          position: [side * (70 + rand() * 76), 0.062, -12 + rand() * 134], rotation: [0, (rand() - 0.5) * 0.16, 0],
        });
      }
    }
    // Hai cụm đảo thấp ở rìa khung nhìn, giữ chân trời giữa cổng rộng và thoáng.
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const radius = 9 + rand() * 8;
        const height = 3.5 + rand() * 4;
        batch.add(new THREE.ConeGeometry(radius, height, 7), island, {
          position: [side * (68 + index * 18), height / 2 - 0.4, 148 + index * 13], scale: [1.6, 1, 0.7],
        });
      }
    }
  },
};

const grounds = {
  // Cát san hô trắng: hạt be rất nhạt, vệt gợn mỏng và vài vụn vỏ sò hồng.
  'coral-sand'({ renderer }) {
    const rand = seeded('coral-sand');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#f4e8cb';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 950, ['#ead9b8', '#fff8e8', '#dfc9a2', '#efc7b6'], [0.45, 1.15]);
      ctx.lineWidth = 1.2;
      for (let row = 0; row < 7; row += 1) {
        ctx.strokeStyle = row % 2 ? 'rgba(201, 177, 137, 0.16)' : 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        for (let px = 0; px <= size; px += 4) {
          const py = row * (size / 7) + Math.sin(px / 18 + row * 1.7) * 3;
          if (px === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }, renderer, 8);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  },
};

// Chùa nhiệt đới: mặt tiền / cửa giữ nguyên, hiên sâu và hai mái dốc thấp để thoáng gió; cột trắng do theme.colors.
function temple(ctx) {
  buildTempleFacade(ctx);
  const { batch, m } = ctx;
  const { frontZ, hw, wallHeight, back } = templeFrame(ctx);
  const porchDepth = ctx.params?.porchDepth || 3.8;
  const porchRise = ctx.params?.porchRise || 0.75;
  const roofRise = ctx.params?.roofRise || 1.9;
  const hook = ctx.params?.hook || 0.55;
  batch.add(new THREE.BoxGeometry(hw * 2 + 2.2, 0.2, porchDepth), m.wood, {
    position: [0, 5.55, frontZ + porchDepth / 2 - 0.25],
  });
  const porch = addRoof(batch, m, {
    x0: -(hw + 1), x1: hw + 1, z0: frontZ - 0.35, z1: frontZ + porchDepth,
    y: 5.62, rise: porchRise, roof: m.roof, trim: m.gold, hook,
  });
  const main = addRoof(batch, m, {
    x0: -(hw + 0.65), x1: hw + 0.65, z0: back - 0.45, z1: frontZ + 0.45,
    y: wallHeight + 0.1, rise: roofRise, roof: m.roof, trim: m.gold, hook,
  });
  const gate = buildGate(ctx);
  addTempleFestivalLights(ctx, { porch, main }, gate);
}

export const kit = { trees, scatter, mountains, grounds, temple };
