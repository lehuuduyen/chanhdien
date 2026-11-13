// Vùng Miền Nam (AL, AR, GA, LA, MS, SC, TX): sồi sống rủ rêu Tây Ban Nha, bách đầm lầy, mộc lan và mặt nước
// bayou xen giữa đồng cỏ xanh đậm. Chùa dùng bộ dựng chung với tường trắng, cột và mái xanh rêu; dữ liệu vùng nằm ở
// scenes/thien-default/themes/south.json.
import * as THREE from 'three';
import { canvasTexture, seeded, speckle } from './common.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

function branchBetween(batch, from, to, radius, material, sides = 7) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius * 0.72, radius, direction.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  batch.add(geometry, material, { position: start.add(end).multiplyScalar(0.5).toArray() });
}

const trees = {
  // Sồi sống: thân chẻ cao, tán ngang nhưng đáy tán và rêu đều trên 2,2 m để không che người đi dưới cây.
  'live-oak'(batch, x, z, size, rand, env) {
    const bark = env.material('#594b3d', { roughness: 0.98 });
    const moss = env.material('#71806a', { roughness: 1, flatShading: true });
    batch.add(new THREE.CylinderGeometry(0.3 * size, 0.43 * size, 2.65 * size, 9), bark, { position: [x, 1.325 * size, z] });
    const turn = rand() * Math.PI * 2;
    for (const side of [-1, 1]) {
      const angle = turn + (side > 0 ? 0.35 : Math.PI - 0.35);
      branchBetween(batch, [x, 2.15 * size, z], [x + Math.cos(angle) * 1.35 * size, 3.55 * size, z + Math.sin(angle) * 1.35 * size], 0.2 * size, bark);
    }
    const blobs = env.detail === 0 ? 7 : 11;
    for (let index = 0; index < blobs; index += 1) {
      const angle = (index / blobs) * Math.PI * 2 + rand() * 0.35;
      const reach = (index === 0 ? 0 : 0.7 + rand() * 1.65) * size;
      const radius = (0.9 + rand() * 0.48) * size;
      batch.add(new THREE.IcosahedronGeometry(radius, env.detail ?? 1), env.material(pick(rand, ['#395f3b', '#466c42', '#527748', '#315535']), { roughness: 1, flatShading: true }), {
        position: [x + Math.cos(angle) * reach, (3.85 + rand() * 0.65) * size, z + Math.sin(angle) * reach],
        scale: [1.25, 0.6, 1.05],
      });
    }
    const strands = env.detail === 0 ? 5 : 10;
    for (let index = 0; index < strands; index += 1) {
      const angle = (index / strands) * Math.PI * 2 + rand() * 0.45;
      const reach = (1 + rand() * 1.25) * size;
      const length = (0.55 + rand() * 0.5) * size;
      const top = (3.65 + rand() * 0.4) * size;
      batch.add(new THREE.CylinderGeometry(0.018 * size, 0.035 * size, length, 5), moss, {
        position: [x + Math.cos(angle) * reach, top - length / 2, z + Math.sin(angle) * reach],
        rotation: [(rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12],
      });
    }
  },

  // Bách đầm lầy: gốc gọn, thân cao và tán hẹp nên thay cây tùng trong sân mà không lấn đường đi.
  cypress(batch, x, z, size, rand, env) {
    const height = (5.7 + rand() * 1.2) * size;
    const bark = env.material('#6a5843', { roughness: 0.98 });
    batch.add(new THREE.CylinderGeometry(0.19 * size, 0.35 * size, height, 8), bark, { position: [x, height / 2, z] });
    batch.add(new THREE.ConeGeometry(0.48 * size, 0.75 * size, 7), bark, { position: [x, 0.36 * size, z] });
    const tiers = env.detail === 0 ? 4 : 6;
    for (let tier = 0; tier < tiers; tier += 1) {
      const ratio = tier / Math.max(1, tiers - 1);
      const radius = (1.12 - ratio * 0.62) * size;
      const y = (2.75 + ratio * 3.4) * size;
      batch.add(new THREE.IcosahedronGeometry(radius, env.detail ?? 1), env.material(tier % 2 ? '#3f6748' : '#4b7350', { roughness: 1, flatShading: true }), {
        position: [x + (rand() - 0.5) * 0.22 * size, y, z + (rand() - 0.5) * 0.22 * size],
        scale: [0.85, 1.2, 0.85],
      });
    }
  },

  // Mộc lan: tán xanh bóng với hoa trắng lớn, dùng ở dải cây ngoài tường.
  magnolia(batch, x, z, size, rand, env) {
    const bark = env.material('#635344', { roughness: 0.96 });
    batch.add(new THREE.CylinderGeometry(0.17 * size, 0.3 * size, 2.7 * size, 8), bark, { position: [x, 1.35 * size, z] });
    const blobs = env.detail === 0 ? 6 : 9;
    const centers = [];
    for (let index = 0; index < blobs; index += 1) {
      const angle = (index / blobs) * Math.PI * 2 + rand() * 0.35;
      const reach = (index === 0 ? 0 : 0.45 + rand() * 0.9) * size;
      const center = [x + Math.cos(angle) * reach, (3.25 + rand() * 0.7) * size, z + Math.sin(angle) * reach];
      centers.push(center);
      batch.add(new THREE.IcosahedronGeometry((0.72 + rand() * 0.34) * size, env.detail ?? 1), env.material(pick(rand, ['#315b39', '#3c6741', '#496f48']), { roughness: 0.86, flatShading: true }), {
        position: center, scale: [1.05, 0.82, 1.05],
      });
    }
    for (let flower = 0; flower < (env.detail === 0 ? 4 : 7); flower += 1) {
      const center = centers[flower % centers.length];
      batch.add(new THREE.IcosahedronGeometry(0.13 * size, 0), env.material('#f4efe0', { roughness: 0.8 }), {
        position: [center[0] + (rand() - 0.5) * 0.9 * size, center[1] + 0.55 * size, center[2] + (rand() - 0.5) * 0.9 * size],
        scale: [1.35, 0.55, 1.35],
      });
    }
  },
};

const scatter = {
  // Vũng nước nông chỉ rải ngoài tường bằng band; bờ cỏ và mặt nước đều đục để tránh overdraw trong cảnh di động.
  'bayou-pool'(batch, x, z, size, rand, env) {
    const radius = (2.3 + rand() * 1.5) * size;
    const water = env.material(pick(rand, ['#4f7770', '#587f75', '#436b68']), { roughness: 0.5, metalness: 0.03 });
    batch.add(new THREE.CylinderGeometry(radius, radius * 1.08, 0.06, 16), water, {
      position: [x, 0.035, z], rotation: [0, rand() * Math.PI, 0], scale: [1.65, 1, 0.72],
    });
    batch.add(new THREE.TorusGeometry(radius * 0.93, 0.13 * size, 4, 18), env.material('#547043', { roughness: 1, flatShading: true }), {
      position: [x, 0.08, z], rotation: [Math.PI / 2, 0, rand() * Math.PI], scale: [1.65, 0.72, 1],
    });
  },
};

const mountains = {
  // Chân trời thấp của vùng đồng bằng ven vịnh: dải nước, bờ đầm và hàng bách mảnh trong sương, không có núi nhọn.
  'bayou-horizon'(batch, env) {
    const rand = seeded('south-bayou-horizon');
    const waterZ = env.ground.z[1] + 40;
    batch.add(new THREE.BoxGeometry(190, 0.08, 30), env.material('#668d84', { roughness: 0.55, metalness: 0.02 }), {
      position: [0, -0.05, waterZ],
    });
    const dome = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let index = 0; index < 12; index += 1) {
      const x = -102 + index * 18 + (rand() - 0.5) * 7;
      const z = waterZ + 9 + (rand() - 0.5) * 8;
      batch.add(dome.clone(), env.material(env.colors[index % env.colors.length], { roughness: 1, flatShading: true }), {
        position: [x, -0.7, z], scale: [13 + rand() * 9, 2.4 + rand() * 1.8, 6 + rand() * 4],
      });
    }
    dome.dispose();
    for (let index = 0; index < 19; index += 1) {
      const x = -108 + index * 12 + (rand() - 0.5) * 5;
      const z = waterZ + 16 + (rand() - 0.5) * 8;
      const height = 5 + rand() * 4;
      batch.add(new THREE.CylinderGeometry(0.11, 0.2, height, 5), env.material('#655845'), { position: [x, height / 2, z] });
      for (let tier = 0; tier < 3; tier += 1) {
        batch.add(new THREE.ConeGeometry(0.95 - tier * 0.2, 1.8, 6), env.material(tier % 2 ? '#456b4e' : '#3c6046', { roughness: 1, flatShading: true }), {
          position: [x, 3.5 + tier * 1.2 + rand() * 0.3, z],
        });
      }
    }
  },
};

const grounds = {
  // Cỏ đầm lầy xanh đậm, bùn nâu và các kênh nước rộng đủ để vẫn thấy rõ từ góc xa / trên cao.
  'bayou-marsh'({ renderer }) {
    const rand = seeded('south-bayou-marsh');
    const map = canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = '#456f3f';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, 70, ['rgba(39, 84, 46, 0.42)', 'rgba(105, 132, 68, 0.34)', 'rgba(92, 77, 48, 0.28)'], [8, 25]);
      ctx.lineCap = 'round';
      for (const offset of [-size, 0, size]) {
        ctx.strokeStyle = '#517a72';
        ctx.lineWidth = 25;
        ctx.beginPath();
        ctx.moveTo(offset - 18, 24);
        ctx.bezierCurveTo(offset + 58, 55, offset + 34, 162, offset + 118, 180);
        ctx.bezierCurveTo(offset + 177, 192, offset + 190, 116, offset + 274, 94);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(139, 171, 148, 0.38)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      for (let index = 0; index < 1300; index += 1) {
        const x = rand() * size;
        const y = rand() * size;
        const length = 2 + rand() * 5;
        ctx.strokeStyle = pick(rand, ['#315b35', '#5e8548', '#6d8f4c', '#776b40']);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 1.4, y - length);
        ctx.stroke();
      }
    }, renderer, 28);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  },
};

export const kit = { trees, scatter, mountains, grounds };
