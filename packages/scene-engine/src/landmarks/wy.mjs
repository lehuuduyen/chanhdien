// Wyoming (vùng snow): dãy Grand Teton dựng đứng ngoài cổng — chóp Grand Teton nhọn cao vút giữa nhóm chóp "nhà thờ"
// (Mount Owen, Teewinot, Middle Teton), mọc thẳng từ đồng bằng không qua đồi; phía trước bên trái là mạch nước phun Old
// Faithful trên gò khoáng trắng, phun theo nhịp (~75 giây một lần, phun ~20 giây, giữa hai lần chỉ bốc hơi) cạnh hai hồ
// nước nóng xanh lam viền vàng cam. Ban đêm hơi nước sáng bạc dưới trăng. Núi của vùng ẩn đi (states/wy.json). Gần
// tường: bò rừng bison (vật rải chung).
import * as THREE from 'three';
import { outward, paintMerge, ridge } from './common.mjs';

const spike = (t, at, width) => Math.max(0, 1 - Math.abs(t - at) / width) ** 1.6;
const PERIOD = 75;
const BURST = 20;

const landmarks = {
  // params: { span, height (chóp Grand Teton, m) }.
  'grand-teton'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 460;
    const height = (params.height || 78) * scale;
    const phase = rand() * 6;
    // Trục dọc tường phía cổng là +x (nhìn từ sân +x bên trái): Teewinot, Owen bên phải chóp chính, Middle / South bên trái.
    const peaks = [[0, 1, 34], [-26, 0.84, 22], [-50, 0.74, 20], [30, 0.8, 24], [56, 0.67, 22], [-95, 0.55, 30], [100, 0.52, 30], [-150, 0.46, 34], [150, 0.44, 34]];
    const crest = (t) => height * (0.36 + Math.max(...peaks.map(([at, h, w]) => h * spike(t, at, w))) * 0.64) + Math.sin(t * 0.37 + phase) * 1.5;
    const far = (color) => env.far(color, { haze, flatShading: true, roughness: 1 });
    ridge(batch, x, z, {
      side, span, depth: 70 * scale, crest, rise: (v) => Math.min(1, v / 0.9) ** 0.75, ribs: 3, jag: 4, columns: 110, rows: 14, phase,
      bands: [
        [0, 0.08, far('#2d4334')],
        [0.08, 0.42, far('#646b78')],
        [0.42, 0.5, env.far('#dfe5ee', { haze, flatShading: true, roughness: 0.9 })],
        [0.5, 0.78, far('#565d6b')],
        [0.78, 1, env.far('#f2f4f8', { haze, flatShading: true, roughness: 0.9 })],
      ],
    });
  },

  // Old Faithful: gò khoáng, miệng phun, cột nước + mây hơi (chuyển động), hai hồ nước nóng nhiều màu. params:
  // { height (m, cột nước cao nhất) }.
  'old-faithful'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const sinter = env.far('#d8d3c4', { haze, flatShading: true, roughness: 1 });
    batch.add(new THREE.SphereGeometry(12 * scale, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), sinter, { position: [x, 0, z], scale: [1, 0.2, 1] });
    batch.add(new THREE.CylinderGeometry(1.6 * scale, 2.6 * scale, 1.2 * scale, 8), env.far('#b8ad98', { haze, flatShading: true, roughness: 1 }), { position: [x, 2.6 * scale, z] });
    // Hồ nước nóng: vòng cam ngoài, vàng giữa, lòng xanh lam.
    for (const [dx, dz, r] of [[22, 6, 9], [-20, 10, 7]]) {
      const px = x + (oz ? dx : dz) * scale - ox * 4 * scale;
      const pz = z + (ox ? dx : dz) * scale - oz * 4 * scale;
      [['#c8642a', 1, 0.05], ['#e7b43c', 0.78, 0.08], ['#2f8fc4', 0.55, 0.11]].forEach(([color, k, y]) => {
        batch.add(new THREE.CircleGeometry(r * k * scale, 18), env.far(color, { haze, flatShading: true, roughness: 0.4 }), {
          position: [px, y, pz], rotation: [-Math.PI / 2, 0, 0],
        });
      });
    }
    // Cột nước + hơi: chồng các khối tròn trắng cao 1 (phóng theo nhịp phun), càng lên càng loe và lệch theo gió, ngọn
    // tan thành mấy cụm hơi so le (không thành một "mũ" tròn).
    const puffs = [];
    for (let index = 0; index < 14; index += 1) {
      const y = index / 14;
      const wind = y ** 2 * 3.2;
      const width = 0.9 + y ** 1.5 * 3.4;
      const lift = y > 0.6 ? 0.1 + rand() * 0.12 : 0.16;
      puffs.push([new THREE.IcosahedronGeometry(1, 1), '#ffffff', {
        position: [oz * wind + (rand() - 0.5) * 0.5 * y, y, ox * wind + (rand() - 0.5) * 0.5 * y], scale: [width * (0.8 + rand() * 0.4), lift, width * (0.8 + rand() * 0.4)],
      }]);
    }
    const steam = env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, roughness: 1 });
    const column = new THREE.Mesh(paintMerge(puffs), steam);
    column.position.set(x, 2.8 * scale, z);
    env.add(column);
    // Ban đêm hơi nước sáng bạc nhẹ.
    column.add(env.nightMesh(column.geometry.clone(), '#cfdcff', 0.14));
    const top = (params.height || 34) * scale;
    const set = (seconds) => {
      const phase = ((seconds % PERIOD) + PERIOD) % PERIOD;
      // Phun: vọt lên nhanh, giữ, hạ dần; ngoài lúc phun chỉ bốc hơi thấp.
      const burst = phase < BURST ? Math.min(1, phase / 2.5) * (1 - Math.max(0, (phase - BURST * 0.55) / (BURST * 0.45)) * 0.85) : 0;
      // Lúc nghỉ: làn hơi mảnh cao vài mét; lúc phun: cột cao, loe rộng.
      const h = Math.max(5 * scale, top * burst);
      const wide = scale * (0.4 + burst * 1.3 + Math.sin(seconds * 0.5) * 0.04);
      column.scale.set(wide, h, wide);
    };
    set(0);
    env.animate(set);
  },
};

export const kit = { landmarks, scatter: {} };
