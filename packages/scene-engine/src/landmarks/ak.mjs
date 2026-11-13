// Alaska (vùng snow): núi Denali tuyết phủ khổng lồ chiếm một khoảng trời ngoài cổng (hai đỉnh Nam / Bắc, sườn có gân đá
// sẫm), phía trước là dãy đồi lãnh nguyên rừng vân sam có sông băng trắng xanh chảy qua khe (sọc băng tích sẫm dọc dòng).
// Ban đêm: cực quang xanh lục gợn sóng trên trời phía cổng. Núi của vùng ẩn đi (states/ak.json). Gần tường: nai sừng tấm,
// nhà gỗ (thư viện chung).
import * as THREE from 'three';
import { frame, outward, ridge } from './common.mjs';

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));

const landmarks = {
  // Denali: khối núi rộng, gần như toàn tuyết, hai đỉnh. params: { span (m), height (m) }.
  denali(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 460;
    const height = (params.height || 82) * scale;
    const crest = (t) => height * (0.38 + 0.62 * Math.max(bump(t, 18, 70) * 1, bump(t, -48, 45) * 0.92, bump(t, 120, 60) * 0.62, bump(t, -150, 50) * 0.55))
      + Math.sin(t * 0.09) * 2.5;
    const phase = rand() * 6;
    ridge(batch, x, z, {
      side, span, depth: 110 * scale, crest, rise: (v) => v ** 1.15, ribs: 6, jag: 4, columns: 90, rows: 14, phase,
      bands: [
        [0, 0.16, env.far('#4c5562', { haze, flatShading: true, roughness: 1 })],
        [0.16, 0.5, env.far('#e3eaf3', { haze, flatShading: true, roughness: 0.9 })],
        [0.5, 0.6, env.far('#7d8796', { haze, flatShading: true, roughness: 1 })],
        [0.6, 1, env.far('#f3f6fb', { haze, flatShading: true, roughness: 0.9 })],
      ],
    });
  },

  // Dãy đồi lãnh nguyên phía trước, khe giữa có sông băng dốc lên về phía Denali. params: { span, height, glacier (bề
  // ngang sông băng, m) }.
  'tundra-glacier'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 460;
    const height = (params.height || 24) * scale;
    const half = ((params.glacier || 46) / 2) * scale;
    const phase = rand() * 6;
    const crest = (t) => (height + Math.sin(t * 0.04 + phase) * 5 + Math.sin(t * 0.13) * 2) * smooth(half * 0.4, half + 14 * scale, Math.abs(t));
    const depth = 60 * scale;
    ridge(batch, x, z, {
      side, span, depth, crest, rise: (v) => Math.min(1, v / 0.55) ** 0.9, ribs: 2, jag: 2, columns: 80, rows: 8, phase,
      bands: [
        [0, 0.25, env.far('#7d7b5c', { haze, flatShading: true, roughness: 1 })],
        [0.25, 0.75, env.far('#33463a', { haze, flatShading: true, roughness: 1 })],
        [0.75, 1, env.far('#5f6a58', { haze, flatShading: true, roughness: 1 })],
      ],
    });
    // Sông băng: mặt dốc lên ra xa, gợn nhẹ, các vòng sóng băng (ogive) xanh nhạt vắt ngang, một vệt băng tích sẫm giữa
    // dòng. Dài hơn dãy đồi một chút (đầu xa khuất sau đỉnh đồi khi nhìn từ sân).
    const ice = env.far('#dde8f2', { haze, flatShading: true, roughness: 0.6 });
    const blue = env.far('#b9cfe2', { haze, flatShading: true, roughness: 0.6 });
    const moraine = env.far('#5d5a55', { haze, flatShading: true, roughness: 1 });
    const flow = (v) => 0.8 + v * height * 0.45;
    const length = depth * 1.3;
    const bands = [];
    for (let v = 0; v < 1; v += 0.14) bands.push([v, Math.min(1, v + 0.1), ice], [Math.min(1, v + 0.1), Math.min(1, v + 0.14), blue]);
    ridge(batch, x, z, { side, span: half * 2.2, depth: length, crest: () => 1, rise: flow, ribs: 1.2, jag: 0.8, bands, columns: 12, rows: 21, phase });
    ridge(batch, x + ax * half * 0.15, z + az * half * 0.15, { side, span: 1.4 * scale, depth: length, crest: () => 1, rise: (v) => flow(v) + 0.35, bands: [[0, 1, moraine]], columns: 1, rows: 10 });
  },

  // Cực quang: hai dải màn sáng xanh lục (chân mờ, sáng dần lên, ngọn tím mờ tắt) gợn sóng chậm trên trời; chỉ hiện ban
  // đêm, cả hai dải một lệnh vẽ. params: { width (m), height (m, độ cao chân màn) }.
  aurora(batch, x, z, scale, rand, env, { side, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const width = (params.width || 420) * scale;
    const base = (params.height || 62) * scale;
    const columns = 64;
    const rows = 3;
    // Mỗi cột ba đỉnh: chân (mờ), dải sáng nhất, ngọn (gần như tắt).
    const curtains = [[0, 1, 0], [55 * scale, 0.7, 2.1]];
    const count = (columns + 1) * rows;
    const positions = new Float32Array(count * curtains.length * 3);
    const colors = new Float32Array(count * curtains.length * 3);
    const index = [];
    const glow = new THREE.Color();
    const top = new THREE.Color('#5a2a8a');
    curtains.forEach(([, strength, phase], curtain) => {
      const first = curtain * count;
      for (let i = 0; i <= columns; i += 1) {
        // Tia dọc: mỗi cột sáng một khác.
        glow.set(i % 3 === 0 ? '#7dffb0' : '#2fe07a').multiplyScalar(strength * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + phase))));
        const at = (first + i * rows) * 3;
        colors.set([glow.r * 0.35, glow.g * 0.35, glow.b * 0.35, glow.r, glow.g, glow.b, top.r * 0.25 * strength, top.g * 0.25 * strength, top.b * 0.25 * strength], at);
        if (i < columns) {
          for (let row = 0; row < rows - 1; row += 1) {
            const a = first + i * rows + row;
            index.push(a, a + 1, a + rows, a + 1, a + rows + 1, a + rows);
          }
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    const mesh = env.nightMesh(geometry, '#ffffff', 0.5, { vertexColors: true });
    mesh.frustumCulled = false;
    // Đặt các đỉnh theo giờ: màn uốn lượn ra / vào và lên / xuống chậm.
    const place = (seconds) => {
      curtains.forEach(([back, , phase], curtain) => {
        for (let i = 0; i <= columns; i += 1) {
          const t = (i / columns - 0.5) * width;
          const d = back + Math.sin(t * 0.012 + seconds * 0.23 + phase) * 22 * scale + Math.sin(t * 0.031 - seconds * 0.17) * 9 * scale;
          const y0 = base + Math.sin(t * 0.02 + seconds * 0.3 + phase) * 4 * scale;
          const tall = (24 + 10 * Math.sin(t * 0.045 + phase)) * scale;
          const px = x + ax * t + ox * d;
          const pz = z + az * t + oz * d;
          positions.set([px, y0, pz, px, y0 + tall * 0.22, pz, px, y0 + tall, pz], (curtain * count + i * rows) * 3);
        }
      });
      geometry.attributes.position.needsUpdate = true;
    };
    place(0);
    env.animate(place);
  },
};

const scatter = {
  // Nai sừng tấm: thân sẫm u vai, chân dài, đầu dài mõm trễ, sừng xòe hình bàn tay màu nhạt.
  moose(batch, x, z, size, rand, env) {
    const fur = env.material('#3f2c20', { flatShading: true });
    const leg = env.material('#5a4636', { flatShading: true });
    const antler = env.material('#c9b48c', { flatShading: true });
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const s = size * 1.15;
    batch.add(new THREE.SphereGeometry(0.7 * s, 8, 6), fur, { position: at(0, 1.55 * s, 0), rotation: [0, yaw, 0], scale: [0.85, 0.8, 1.6] });
    batch.add(new THREE.SphereGeometry(0.5 * s, 7, 5), fur, { position: at(0, 1.85 * s, 0.6 * s), rotation: [0, yaw, 0], scale: [0.9, 0.9, 1] });
    batch.add(new THREE.BoxGeometry(0.34 * s, 0.38 * s, 0.9 * s), fur, { position: at(0, 1.95 * s, 1.35 * s), rotation: [0.5, yaw, 0], order: 'YXZ' });
    for (const sx of [-1, 1]) {
      for (const sz of [-0.75, 0.6]) batch.add(new THREE.CylinderGeometry(0.08 * s, 0.07 * s, 1.3 * s, 5), leg, { position: at(sx * 0.3 * s, 0.65 * s, sz * s), rotation: [0, yaw, 0] });
      batch.add(new THREE.BoxGeometry(0.8 * s, 0.06 * s, 0.45 * s), antler, { position: at(sx * 0.55 * s, 2.35 * s, 1.05 * s), rotation: [0.15, yaw, sx * 0.35], order: 'YXZ' });
    }
  },
};

export const kit = { landmarks, scatter };
