// Nevada (vùng desert): hẻm Black Canyon ngoài cổng — khối núi đá núi lửa sẫm bị sông Colorado xẻ thành khe chữ V; trong
// khe là đập Hoover cong (mặt hạ lưu quay về sân, bốn tháp lấy nước nhô trên mặt đập, nhà máy điện dưới chân), phía
// trước vắt ngang khe là cầu vòm bê tông đôi (cầu Mike O'Callaghan–Pat Tillman). Ban đêm đập được rọi sáng, cầu có hàng
// đèn. Phía đông xa là đường chân trời thành phố kiểu Las Vegas (skyline chung, tòa nhà không có thật, đèn neon hồng ban
// đêm). Núi bàn của vùng ẩn đi (states/nv.json). Gần tường: cây Joshua.
import * as THREE from 'three';
import { outward, ridge, sweep } from './common.mjs';

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const landmarks = {
  // (x, z): miệng hẻm (giữa lòng sông, mép khối núi gần sân). params: { span, depth, height (đỉnh khối núi), dam (cao đập),
  // bridge (cao mặt cầu) }, đều tính bằng mét.
  'hoover-dam'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    // Tọa độ cục bộ: u dọc tường (ngang khe), d ra xa sân (dọc sông), y lên.
    const P = (u, y, d) => [x + ax * u + ox * d, y, z + az * u + oz * d];
    const flip = oz < 0 || ox > 0;
    const span = params.span || 460;
    const depth = (params.depth || 120) * scale;
    const top = (params.height || 46) * scale;
    const damH = (params.dam || 27) * scale;
    const bridgeH = (params.bridge || 36) * scale;
    const river = 7 * scale;
    const slope = 20 * scale;
    // Khối núi: dốc lên từ mép gần sân tới cao nguyên lởm chởm, khe sông chữ V ở giữa (đáy phẳng rộng 2 × river).
    const rise = (v) => Math.min(1, v / 0.2) ** 0.8;
    const notch = (u) => smooth(river, river + slope, Math.abs(u));
    const phase = rand() * 6;
    const crest = (t) => (top + Math.sin(t * 0.045 + phase) * 4 + Math.sin(t * 0.11) * 2) * notch(t);
    ridge(batch, x, z, {
      side, span, depth, crest, rise, ribs: 2.5, jag: 3.5, columns: 110, rows: 14, phase,
      bands: [
        [0, 0.2, env.far('#5e4535', { haze, flatShading: true, roughness: 1 })],
        [0.2, 1, env.far('#45352a', { haze, flatShading: true, roughness: 1 })],
      ],
    });
    // Mép khe về phía sign (−1 / 1) ở độ cao y (chỗ cao nguyên đã lên hết dốc), cộng phần chôn vào vách.
    const edge = (y, sign, bury = 3 * scale) => {
      let u = river;
      while (u < river + slope && crest(sign * u) < y) u += 0.5;
      return u + bury;
    };
    const concrete = env.far('#d6cebd', { haze, flatShading: true, roughness: 0.9 });
    const concreteDark = env.far('#b9b09d', { haze, flatShading: true, roughness: 0.9 });
    const water = env.far('#2f6b6a', { haze, flatShading: true, roughness: 0.3 });
    const damD = depth * 0.66;
    // Sông dưới đáy khe từ chân đập ra tới miệng hẻm.
    batch.add(new THREE.PlaneGeometry(1, 1), water, {
      position: P(0, 0.08, damD / 2), rotation: [-Math.PI / 2, 0, 0], scale: ax ? [river * 2.2, damD, 1] : [damD, river * 2.2, 1],
    });

    // Đập vòm trọng lực: cong lồi về hồ (tâm cong phía sân), mặt hạ lưu dốc (chân dày, đỉnh mỏng).
    const R = 40 * scale;
    const thick = (y) => 5 * scale + 22 * scale * (1 - y / damH) ** 1.6;
    const rows = 7;
    const columns = 18;
    const positions = [];
    const index = [];
    const vertex = (y, r, fraction) => {
      const left = Math.asin(Math.min(0.95, edge(y, -1) / R));
      const angle = -left + fraction * (left + Math.asin(Math.min(0.95, edge(y, 1) / R)));
      positions.push(...P(Math.sin(angle) * r, y, damD - R + Math.cos(angle) * r));
    };
    // Mặt hạ lưu theo hàng độ cao, thêm một hàng mặt đỉnh (lối đi trên đập).
    for (let row = 0; row <= rows; row += 1) {
      const y = (row / rows) * damH;
      for (let col = 0; col <= columns; col += 1) vertex(y, R - thick(y), col / columns);
    }
    for (let col = 0; col <= columns; col += 1) vertex(damH, R, col / columns);
    const stride = columns + 1;
    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const a = row * stride + col;
        if (flip) index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        else index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }
    const dam = new THREE.BufferGeometry();
    dam.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    dam.setIndex(index);
    dam.computeVertexNormals();
    // Ban đêm đập được rọi sáng: lớp sáng cùng hình.
    env.nightMesh(dam.clone(), '#ffdcaa', 0.3);
    batch.add(dam, concrete);
    // Tháp lấy nước: hai cặp sát hai bên vách, phía hồ, nhô khỏi mặt đập; đầu tháp thu nhỏ có mái tròn.
    const crestLeft = edge(damH, -1, 0);
    const crestRight = edge(damH, 1, 0);
    for (const u of [-crestLeft + 8 * scale, -crestLeft + 15 * scale, crestRight - 15 * scale, crestRight - 8 * scale]) {
      const height = damH + 8 * scale;
      const at = P(u, 0, damD + 7 * scale);
      batch.add(new THREE.CylinderGeometry(2.1 * scale, 2.4 * scale, height, 10), concrete, { position: [at[0], height / 2, at[2]] });
      batch.add(new THREE.CylinderGeometry(1.6 * scale, 1.9 * scale, 2.4 * scale, 10), concreteDark, { position: [at[0], height + 1.2 * scale, at[2]] });
      batch.add(new THREE.SphereGeometry(1.6 * scale, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), concreteDark, { position: [at[0], height + 2.4 * scale, at[2]] });
    }
    // Chòi trên mặt đập.
    for (const u of [-crestLeft * 0.55, -crestLeft * 0.2, crestRight * 0.2, crestRight * 0.55]) {
      const angle = Math.asin(u / R);
      const at = P(u, damH + 2 * scale, damD - R + Math.cos(angle) * (R - 4 * scale));
      batch.add(new THREE.BoxGeometry(2.6 * scale, 4 * scale, 2.6 * scale), concreteDark, { position: at });
    }
    // Nhà máy điện hai bên sông dưới chân đập.
    const toe = damD - thick(0);
    for (const s of [-1, 1]) {
      const at = P(s * (river - 1 * scale), 3.5 * scale, toe - 9 * scale);
      const size = ax ? [4 * scale, 7 * scale, 18 * scale] : [18 * scale, 7 * scale, 4 * scale];
      batch.add(new THREE.BoxGeometry(...size), concrete, { position: at });
    }

    // Cầu vòm đôi trước đập: hai sườn vòm bê tông tựa vào vách khe, mặt cầu trên cột đỡ.
    const bridgeD = depth * 0.4;
    const spring = bridgeH * 0.6;
    const springLeft = edge(spring, -1, 0);
    const springRight = edge(spring, 1, 0);
    const deckLeft = edge(bridgeH, -1, 8 * scale);
    const deckRight = edge(bridgeH, 1, 8 * scale);
    const crown = bridgeH - 2.6 * scale;
    // Vòm parabol giữa hai chân (hai chân có thể lệch nhau chút vì vách hai bên không đều).
    const archY = (u) => {
      const k = (2 * u + springLeft - springRight) / (springLeft + springRight);
      return spring + (crown - spring) * (1 - k * k);
    };
    const axis = [ox, 0, oz];
    for (const s of [-1, 1]) {
      const points = [];
      for (let step = 0; step <= 10; step += 1) {
        const u = -springLeft + (step / 10) * (springLeft + springRight);
        points.push(P(u, archY(u), bridgeD + s * 2.4 * scale));
      }
      batch.add(sweep(points, { axis, radius: () => [1.2 * scale, 0.9 * scale], steps: 20, radial: 6 }), concrete);
    }
    const deckLength = deckLeft + deckRight;
    const deck = ax ? [deckLength, 1.4 * scale, 7 * scale] : [7 * scale, 1.4 * scale, deckLength];
    batch.add(new THREE.BoxGeometry(...deck), concrete, { position: P((deckRight - deckLeft) / 2, bridgeH, bridgeD) });
    // Cột đỡ: trên vòm (giữa) hoặc trên vách (hai đầu, chôn sâu vì vách lởm chởm), cách đều.
    for (let u = -deckLeft + 5 * scale; u <= deckRight - 5 * scale; u += 8 * scale) {
      const onArch = u > -springLeft && u < springRight;
      const base = onArch ? Math.max(archY(u), crest(u) - 3 * scale) : crest(u) - 3 * scale;
      const height = bridgeH - base;
      if (height < 1.5) continue;
      for (const s of [-1, 1]) {
        const size = ax ? [1.2 * scale, height, 1.4 * scale] : [1.4 * scale, height, 1.2 * scale];
        batch.add(new THREE.BoxGeometry(...size), concreteDark, { position: P(u, base + height / 2, bridgeD + s * 2.4 * scale) });
      }
    }
    // Đèn đêm: hai hàng đèn trên mặt cầu, đèn đỉnh tháp lấy nước.
    const lights = [];
    for (let u = -deckLeft; u <= deckRight; u += 3 * scale) {
      for (const s of [-1, 1]) lights.push(P(u, bridgeH + 1.2 * scale, bridgeD + s * 3.4 * scale));
    }
    for (let u = -crestLeft; u <= crestRight; u += 4 * scale) {
      const angle = Math.asin(Math.max(-0.95, Math.min(0.95, u / R)));
      lights.push(P(u, damH + 1 * scale, damD - R + Math.cos(angle) * (R - 0.5 * scale)));
    }
    env.nightPoints(lights, { color: '#fff0c8', size: 0.9 * scale });
  },
};

const scatter = {
  // Cây Joshua: thân xù xì, cành chẻ đôi chĩa lên, đầu cành là chùm lá nhọn xanh xám, dưới chùm là "váy" lá khô.
  joshua(batch, x, z, size, rand, env) {
    const bark = env.material('#7a6a55', { flatShading: true });
    const skirt = env.material('#8c7a5a', { flatShading: true });
    const leaf = env.material(rand() < 0.5 ? '#6f7d3c' : '#7d8a48', { flatShading: true });
    const trunk = (1.4 + rand() * 1) * size;
    batch.add(new THREE.CylinderGeometry(0.17 * size, 0.26 * size, trunk, 6), bark, { position: [x, trunk / 2, z] });
    const branches = 2 + Math.floor(rand() * 3);
    for (let index = 0; index < branches; index += 1) {
      const angle = (index / branches) * Math.PI * 2 + rand();
      const lean = 0.5 + rand() * 0.5;
      const length = (0.9 + rand() * 0.9) * size;
      const dir = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
      const geometry = new THREE.CylinderGeometry(0.1 * size, 0.14 * size, length, 5);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      const start = [x, trunk * 0.92, z];
      batch.add(geometry, bark, { position: [start[0] + dir.x * length / 2, start[1] + dir.y * length / 2, start[2] + dir.z * length / 2] });
      const tip = [start[0] + dir.x * length, start[1] + dir.y * length, start[2] + dir.z * length];
      batch.add(new THREE.CylinderGeometry(0.2 * size, 0.14 * size, 0.35 * size, 6), skirt, { position: [tip[0], tip[1] - 0.05 * size, tip[2]] });
      batch.add(new THREE.IcosahedronGeometry(0.34 * size, 0), leaf, { position: [tip[0], tip[1] + 0.3 * size, tip[2]], rotation: [rand() * 3, rand() * 3, 0], scale: [1, 1.25, 1] });
    }
  },
};

export const kit = { landmarks, scatter };
