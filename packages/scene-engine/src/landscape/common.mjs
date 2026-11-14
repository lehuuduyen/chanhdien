// Bộ đồ dùng chung của phong cảnh theo vùng (landscape3d.mjs) và tiện ích cho bộ đồ từng vùng (landscape/<vùng>.mjs).
//
// Mỗi vùng là một file landscape/<vùng>.mjs export `kit`; engine nạp bằng import() theo tên vùng, tìm kiểu trong bộ đồ
// của vùng trước rồi tới bộ đồ chung ở đây. Hình dạng của một bộ đồ:
//   trees     { kiểu(batch, x, z, size, rand, env) }  cây: đứng chỗ cây đa / tùng của scene và dùng được để rải
//   scatter   { kiểu(batch, x, z, size, rand, env) }  vật rải ngoài tường không phải cây (đá, bụi…)
//   mountains { dáng(batch, env) }                    núi xa
//   grounds   { kiểu(env) → MeshStandardMaterial }    đất: ngoài tường (field) và nền sân (lawn.surface); UV tính bằng mét
//   temple    (ctx) → void                            chùa nhìn từ ngoài (mặt tiền, mái, hiên, cổng tam quan)
// env: { m (vật liệu chung của sân), material(màu, thêm) (vật liệu dùng chung theo màu), renderer, ground, midZ,
//        colors (màu núi của vùng), theme (dữ liệu vùng), detail (1 trong sân, 0 cho vật rải ngoài tường: dùng làm độ
//        chia mặt của khối tròn để vật ở xa ít tam giác) }.
// Cây / vật rải / núi được gộp theo màu đỉnh: dùng env.material(màu) thoải mái, nhiều màu không tốn thêm lệnh vẽ.
// batch là StaticBatch: khối gộp theo vật liệu, engine tự dựng thành mesh. Số ngẫu nhiên lấy từ rand (seeded) để mọi
// máy thấy giống nhau. Vật liệu riêng của bộ đồ tạo một lần (lazy) trong module, không tạo mới mỗi lần dựng.
import * as THREE from 'three';

// Số ngẫu nhiên lặp lại được (mulberry32) theo một chuỗi.
export function seeded(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Texture vẽ bằng canvas, lặp theo mét: một ô ảnh phủ tileMeters mét (UV của nền tính bằng mét).
export function canvasTexture(size, draw, renderer, tileMeters) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tileMeters, 1 / tileMeters);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

// Hạt li ti vẽ lặp qua mép để ô ảnh nối liền khi lặp.
export function speckle(ctx, size, rand, count, colors, radius) {
  for (let index = 0; index < count; index += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = radius[0] + rand() * (radius[1] - radius[0]);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// Núi xếp theo cung phía trước cổng (như cảnh gốc): gọi fn(x, z, index) cho từng ngọn.
export function mountainArc(env, count, { spread = 1.2, radiusX = 95, radiusZ = 70 } = {}, fn) {
  for (let index = 0; index < count; index += 1) {
    const angle = -spread + (index / (count - 1)) * spread * 2;
    fn(Math.sin(angle) * radiusX, env.midZ + 40 + Math.cos(angle) * radiusZ, index);
  }
}

let shared = null;
const materials = () => (shared ||= {
  palmTrunk: new THREE.MeshStandardMaterial({ color: '#8b6b49', roughness: 0.95 }),
  palmLeaf: new THREE.MeshStandardMaterial({ color: '#4d8a3b', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
  palmLeafDark: new THREE.MeshStandardMaterial({ color: '#3b7232', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
  dates: new THREE.MeshStandardMaterial({ color: '#a35d24', roughness: 0.9 }),
});

// ---- Cây ----
const trees = {
  // Cây đa (cảnh gốc): thân, rễ nổi ôm gốc, rễ phụ buông từ tán, tán tròn nhiều khối.
  banyan(batch, x, z, size, rand, { m }) {
    batch.add(new THREE.CylinderGeometry(0.32 * size, 0.55 * size, 3.4 * size, 9), m.bark, { position: [x, 1.7 * size, z] });
    for (let rootIndex = 0; rootIndex < 7; rootIndex += 1) {
      const angle = (rootIndex / 7) * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.035 * size, 0.14 * size, 1.65 * size, 6), m.bark, {
        position: [x + Math.cos(angle) * 0.38 * size, 0.82 * size, z + Math.sin(angle) * 0.38 * size],
        rotation: [Math.sin(angle) * 0.18, 0, -Math.cos(angle) * 0.18],
      });
      if (rootIndex < 5) {
        batch.add(new THREE.CylinderGeometry(0.018 * size, 0.045 * size, 2.8 * size, 5), m.bark, {
          position: [x + Math.cos(angle + 0.35) * 1.05 * size, 1.55 * size, z + Math.sin(angle + 0.35) * 1.05 * size],
        });
      }
    }
    for (let blob = 0; blob < 7; blob += 1) {
      const angle = blob * 0.9;
      batch.add(new THREE.IcosahedronGeometry((1.3 + (blob % 3) * 0.35) * size, 1), blob % 2 ? m.leaf : m.leafDark, {
        position: [x + Math.cos(angle) * 1.4 * size, (3.6 + (blob % 3) * 0.6) * size, z + Math.sin(angle) * 1.4 * size],
        scale: [1, 0.75, 1],
      });
    }
  },
  // Tùng (cảnh gốc): bốn tầng nón.
  pine(batch, x, z, size, rand, { m }) {
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.18 * size, 1.4 * size, 7), m.bark, { position: [x, 0.7 * size, z] });
    for (let tier = 0; tier < 4; tier += 1) {
      batch.add(new THREE.ConeGeometry((1.1 - tier * 0.22) * size, 1.2 * size, 8), tier % 2 ? m.leaf : m.leafDark, { position: [x, (1.5 + tier * 0.75) * size, z] });
    }
  },
  // Chà là / cọ: thân nghiêng nhẹ, vòng tàu lá rủ hai khúc, chùm quả dưới ngọn.
  palm(batch, x, z, size, rand) {
    const t = materials();
    const height = (5.6 + rand() * 1.4) * size;
    const tiltX = (rand() - 0.5) * 0.22;
    const tiltZ = (rand() - 0.5) * 0.22;
    const up = (length) => [-Math.sin(tiltZ) * length, Math.cos(tiltZ) * Math.cos(tiltX) * length, Math.cos(tiltZ) * Math.sin(tiltX) * length];
    const [hx, hy, hz] = up(height / 2);
    batch.add(new THREE.CylinderGeometry(0.17 * size, 0.27 * size, height, 7), t.palmTrunk, { position: [x + hx, hy, z + hz], rotation: [tiltX, 0, tiltZ] });
    const [tx, ty, tz] = up(height);
    const top = [x + tx, ty, z + tz];
    batch.add(new THREE.SphereGeometry(0.34 * size, 8, 6), t.palmTrunk, { position: top });
    const fronds = 11;
    for (let index = 0; index < fronds; index += 1) {
      const angle = (index / fronds) * Math.PI * 2 + rand() * 0.3;
      const droop = 0.12 + (index % 3) * 0.16 + rand() * 0.1;
      let start = top;
      for (const [part, length, width] of [[0, 1.5, 0.62], [1, 1.45, 0.44]]) {
        const bend = droop + part * 0.62;
        const dir = [Math.cos(angle) * Math.cos(bend), -Math.sin(bend), -Math.sin(angle) * Math.cos(bend)];
        const len = length * size;
        batch.add(new THREE.BoxGeometry(len, 0.05 * size, width * size), index % 2 ? t.palmLeaf : t.palmLeafDark, {
          position: [start[0] + dir[0] * len / 2, start[1] + dir[1] * len / 2, start[2] + dir[2] * len / 2],
          rotation: [0, angle, -bend],
        });
        start = [start[0] + dir[0] * len * 0.96, start[1] + dir[1] * len * 0.96, start[2] + dir[2] * len * 0.96];
      }
    }
    for (let index = 0; index < 3; index += 1) {
      const angle = index * 2.1 + 0.4;
      batch.add(new THREE.SphereGeometry(0.2 * size, 7, 5), t.dates, {
        position: [top[0] + Math.cos(angle) * 0.3 * size, top[1] - 0.45 * size, top[2] + Math.sin(angle) * 0.3 * size], scale: [1, 1.4, 1],
      });
    }
  },
};

// ---- Núi xa (cảnh gốc): chín nón xanh ----
const mountains = {
  cone(batch, env) {
    mountainArc(env, 9, {}, (x, z, index) => {
      batch.add(new THREE.ConeGeometry(18 + (index % 3) * 8, 14 + (index % 4) * 6, 6), env.material(env.colors[index % env.colors.length], { flatShading: true, roughness: 1 }), { position: [x, 5, z] });
    });
  },
};

// ---- Chùa nhìn từ ngoài (cảnh gốc) ----
// ctx: { batch (StaticBatch, gộp vào nhóm chùa), add(mesh) (mesh riêng, vd. bảng chữ), own(vật liệu | texture) (tạo mới
// mỗi lần dựng: engine giải phóng khi dựng lại), glow(x, y, z) (quầng sáng đèn), m, hall (hallLayout), door, data
// (world.courtyard), textBoard(text, kiểu) (texture bảng chữ, engine giữ và dùng lại: không own), params (theme.temple), env }.
// Bất biến: tường mặt tiền có cửa giữa rộng door.width × door.height đúng chỗ (người chơi đi qua), tường hai bên và
// phía sau điện ôm khung hall; cổng tam quan giữ các lối đi (data.gate.openings).

// Mái ngói hai dốc, nóc mạ vàng, đầu đao vàng ở bốn góc (hook: độ to / cong của đầu đao, 1 = cảnh gốc).
// Trả lại số đo của mái (x0, x1, z0, z1, y, rise) để bộ đồ vùng tính mép mái (roofEaves), vd. treo nhũ băng.
export function addRoof(batch, m, { x0, x1, z0, z1, y, rise, roof = m.roof, trim = m.gold, hook = 1 }) {
  const width = x1 - x0;
  const depth = z1 - z0;
  const slope = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);
  for (const side of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(width + 1.2, 0.18, slope + 0.6), roof, {
      position: [(x0 + x1) / 2, y + rise / 2, (z0 + z1) / 2 + side * depth / 4],
      rotation: [side * angle, 0, 0],
    });
    // Gân ngói chạy theo dốc mái. Các thanh dùng chung vật liệu gỗ sẫm và được gộp vào StaticBatch, tạo nhịp mái
    // truyền thống khi nhìn từ sân mà không thêm draw call hay texture nặng.
    for (let x = x0 - 0.35; x <= x1 + 0.35; x += 0.72) batch.add(new THREE.BoxGeometry(0.055, 0.055, slope + 0.52), m.wood, {
      position: [x, y + rise / 2 + 0.11, (z0 + z1) / 2 + side * depth / 4],
      rotation: [side * angle, 0, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(width + 1.6, 0.22, 0.32), trim, { position: [(x0 + x1) / 2, y + rise + 0.08, (z0 + z1) / 2] });
  // Đường cong đầu đao Việt Nam: thanh vàng chạy từ mép mái rồi vút lên ở bốn góc. Tube ít cạnh và được gộp vào
  // StaticBatch cùng nẹp mái, nên tăng dáng kiến trúc mà không tăng draw call.
  const edge = roofEaves({ x0, x1, z0, z1, y, rise });
  for (const eave of [edge.front, edge.back]) batch.add(new THREE.BoxGeometry(width + 1.45, 0.13, 0.16), m.wood, {
    position: [(x0 + x1) / 2, eave.y + 0.035, eave.z],
  });
  for (const side of [-1, 1]) {
    const endX = side < 0 ? edge.x[0] : edge.x[1];
    for (const eave of [edge.front, edge.back]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(endX - side * 0.9, eave.y + 0.06, eave.z),
        new THREE.Vector3(endX + side * 0.18, eave.y + 0.1 * hook, eave.z),
        new THREE.Vector3(endX + side * (0.42 + 0.22 * hook), eave.y + 0.42 * hook, eave.z),
      );
      batch.add(new THREE.TubeGeometry(curve, 8, 0.045 + 0.012 * Math.min(2, hook), 4, false), trim);
    }
  }
  for (const x of [x0 - 0.6, x1 + 0.6]) {
    for (const z of [z0 - 0.3, z1 + 0.3]) {
      batch.add(new THREE.ConeGeometry(0.12 * hook, 0.7 * hook, 8), trim, { position: [x, y + 0.35 * hook, z], rotation: [0, 0, (x < 0 ? 0.6 : -0.6) * Math.min(1.6, hook)] });
    }
  }
  return { x0, x1, z0, z1, y, rise };
}

// Mép dưới hai dốc của một mái addRoof: { x: [trái, phải], front: { z, y }, back: { z, y } } (tấm mái thò ra 0,3 m).
export function roofEaves({ x0, x1, z0, z1, y, rise }) {
  const slope = Math.hypot((z1 - z0) / 2, rise);
  const out = 0.3 * ((z1 - z0) / 2) / slope;
  const drop = 0.3 * rise / slope;
  return { x: [x0 - 0.6, x1 + 0.6], front: { z: z1 + out, y: y - drop }, back: { z: z0 - out, y: y - drop } };
}

function bulbLine(points, from, to, spacing = 0.32) {
  const steps = Math.max(1, Math.ceil(from.distanceTo(to) / spacing));
  for (let index = 0; index <= steps; index += 1) points.push(from.clone().lerp(to, index / steps));
}

function bulbGarland(points, from, to, { spacing = 0.3, sag = 0.24 } = {}) {
  const steps = Math.max(1, Math.ceil(from.distanceTo(to) / spacing));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const point = from.clone().lerp(to, t);
    point.y -= Math.sin(Math.PI * t) * sag;
    points.push(point);
  }
}

// Gửi vị trí dây đèn theo đúng mái vừa dựng cho landscape3d gom instancing. Nhờ vậy vùng mái một tầng / hai tầng
// và chùa nhiệt đới đều có đèn bám kiến trúc, không có dải đèn lơ lửng khi đổi tiểu bang.
export function addTempleFestivalLights(ctx, roofs, gate) {
  if (!ctx.festival) return;
  const points = [];
  for (const roof of Object.values(roofs || {}).filter(Boolean)) {
    const eaves = roofEaves(roof);
    for (const edge of [eaves.front, eaves.back]) bulbLine(
      points,
      new THREE.Vector3(eaves.x[0], edge.y + 0.06, edge.z),
      new THREE.Vector3(eaves.x[1], edge.y + 0.06, edge.z),
    );
    bulbLine(
      points,
      new THREE.Vector3(roof.x0 - 0.75, roof.y + roof.rise + 0.18, (roof.z0 + roof.z1) / 2),
      new THREE.Vector3(roof.x1 + 0.75, roof.y + roof.rise + 0.18, (roof.z0 + roof.z1) / 2),
    );
  }
  for (const [x, z] of ctx.data.porchPillars || []) bulbLine(
    points, new THREE.Vector3(x, 0.55, z + 0.05), new THREE.Vector3(x, 5.22, z + 0.05), 0.38,
  );
  const porch = [...(ctx.data.porchPillars || [])].sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < porch.length; index += 1) bulbGarland(
    points,
    new THREE.Vector3(porch[index - 1][0], 4.72, porch[index - 1][1] + 0.1),
    new THREE.Vector3(porch[index][0], 4.72, porch[index][1] + 0.1),
    { spacing: 0.25, sag: 0.18 },
  );
  // Dây đèn lễ hội quanh lối chính: lấy đúng các đèn đá gần chánh điện trong scene JSON. Hai dải chạy dọc hai bên
  // tạo khung sáng dẫn tới cửa điện mà không bắc ngang, che nhân vật hay lư hương.
  const frontZ = ctx.data.ground.z[0];
  const approach = (ctx.data.lanterns || [])
    .map(([x, z]) => ({ x, z }))
    .filter(({ x, z }) => Math.abs(x) < 12 && z >= frontZ + 2 && z <= frontZ + 18);
  const rows = new Map();
  for (const lamp of approach) {
    const key = lamp.z.toFixed(3);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(lamp);
  }
  const paired = [...rows.values()]
    .map((row) => row.sort((a, b) => a.x - b.x))
    .filter((row) => row.length >= 2)
    .sort((a, b) => a[0].z - b[0].z);
  for (const side of [0, -1]) {
    const line = paired.map((row) => row.at(side));
    for (let index = 1; index < line.length; index += 1) bulbGarland(
      points,
      new THREE.Vector3(line[index - 1].x, 2.58, line[index - 1].z),
      new THREE.Vector3(line[index].x, 2.58, line[index].z),
      { spacing: 0.3, sag: 0.14 },
    );
  }
  for (const roof of gate?.roofs || []) {
    const eaves = roofEaves(roof);
    bulbLine(points, new THREE.Vector3(eaves.x[0], eaves.front.y + 0.06, eaves.front.z), new THREE.Vector3(eaves.x[1], eaves.front.y + 0.06, eaves.front.z));
    bulbLine(
      points,
      new THREE.Vector3(roof.x0 - 0.45, roof.y + roof.rise + 0.14, (roof.z0 + roof.z1) / 2),
      new THREE.Vector3(roof.x1 + 0.45, roof.y + roof.rise + 0.14, (roof.z0 + roof.z1) / 2),
    );
  }
  for (const x of gate?.pillars || []) bulbLine(
    points, new THREE.Vector3(x, 0.35, gate.z - 0.28), new THREE.Vector3(x, 3.62, gate.z - 0.28), 0.34,
  );
  ctx.festival(points);
}

// Kích thước dùng chung của mặt tiền.
export function templeFrame(ctx) {
  const frontZ = ctx.data.ground.z[0];
  const hw = ctx.hall.halfWidth;
  return { frontZ, hw, wallHeight: ctx.hall.height - 0.4, back: ctx.hall.back };
}

// Tường đỏ mở cửa giữa, khung và cánh cửa, tường hai bên / phía sau điện, thềm đá, hàng cột hiên, hoành phi, đèn lồng.
export function buildTempleFacade(ctx) {
  const { batch, m, door, data } = ctx;
  const { frontZ, hw, wallHeight } = templeFrame(ctx);
  const side = hw - door.width / 2;
  for (const s of [-1, 1]) batch.add(new THREE.BoxGeometry(side, wallHeight, 0.3), m.wall, {
    position: [s * (door.width / 2 + side / 2), wallHeight / 2, frontZ + 0.15],
  });
  batch.add(new THREE.BoxGeometry(door.width, wallHeight - door.height, 0.3), m.wall, { position: [0, door.height + (wallHeight - door.height) / 2, frontZ + 0.15] });
  // Khung cửa gỗ, cánh cửa mở vào trong.
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.18, door.height, 0.36), m.wood, { position: [s * (door.width / 2 + 0.05), door.height / 2, frontZ + 0.16] });
    batch.add(new THREE.BoxGeometry(door.width / 2, door.height - 0.1, 0.08), m.pillar, {
      position: [s * (door.width / 2 - 0.12), door.height / 2, frontZ - door.width / 4 + 0.1], rotation: [0, s * 1.35, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(door.width + 0.4, 0.22, 0.4), m.wood, { position: [0, door.height + 0.1, frontZ + 0.16] });
  // Tường ngoài hai bên và phía sau chánh điện (tường trong chỉ nhìn được từ bên trong).
  const back = ctx.hall.back - 0.3;
  for (const s2 of [-1, 1]) batch.add(new THREE.BoxGeometry(0.3, wallHeight, frontZ - back), m.wall, { position: [s2 * (hw + 0.16), wallHeight / 2, (frontZ + back) / 2] });
  batch.add(new THREE.BoxGeometry(hw * 2 + 0.6, wallHeight, 0.3), m.wall, { position: [0, wallHeight / 2, ctx.hall.back - 0.16] });
  // Bệ và ba dải tam cấp thấp (chỉ là hình, vùng đi lại vẫn phẳng) tạo dáng chánh điện truyền thống thay cho một
  // khối tường đứng sát sân. Bậc ở phía sân, không lấn vào cửa giữa.
  batch.add(new THREE.BoxGeometry(hw * 2 + 1, 0.18, 2.4), m.stone, { position: [0, 0.09, frontZ + 1.2] });
  for (let step = 0; step < 3; step += 1) batch.add(new THREE.BoxGeometry(hw * 2 + 2.2 + step * 0.55, 0.07, 0.58), step === 2 ? m.darkStone : m.stone, {
    position: [0, 0.035 + step * 0.018, frontZ + 2.42 + step * 0.42],
  });
  // Khung gỗ mặt tiền: xà ngang, chân tường và các đố đứng chia gian. Các thanh mảnh nằm trên mặt tường, không tạo
  // vật cản; gian cửa giữa vẫn rộng đúng door.width.
  for (const s of [-1, 1]) batch.add(new THREE.BoxGeometry(side + 0.25, 0.3, 0.42), m.wood, {
    position: [s * (door.width / 2 + (side + 0.25) / 2), 0.5, frontZ + 0.34],
  });
  batch.add(new THREE.BoxGeometry(hw * 2 + 0.7, 0.34, 0.46), m.wood, { position: [0, 5.18, frontZ + 0.35] });
  const bayWidth = Math.max(1.4, (hw - door.width / 2) / 3);
  const frames = new Set([-hw + 0.42, hw - 0.42, -door.width / 2 - 0.1, door.width / 2 + 0.1]);
  for (let x = door.width / 2 + bayWidth; x < hw - 0.4; x += bayWidth) {
    frames.add(x);
    frames.add(-x);
  }
  for (const x of frames) batch.add(new THREE.BoxGeometry(0.22, 4.7, 0.44), m.wood, { position: [x, 2.75, frontZ + 0.34] });
  // Song cửa hai bên: đủ chi tiết để nhìn giống hiên gỗ mở nhưng vẫn gộp chung vào vật liệu gỗ.
  for (const s of [-1, 1]) {
    const start = s * (door.width / 2 + 0.48);
    for (let index = 0; index < 7; index += 1) batch.add(new THREE.BoxGeometry(0.055, 2.35, 0.08), m.wood, {
      position: [start + s * index * Math.max(0.42, (hw - door.width / 2 - 1) / 7), 2.55, frontZ + 0.49],
    });
    for (const height of [1.45, 2.55, 3.65]) batch.add(new THREE.BoxGeometry(side - 0.55, 0.07, 0.08), m.gold, {
      position: [s * (door.width / 2 + side / 2), height, frontZ + 0.5],
    });
  }
  for (const [x, z] of data.porchPillars) {
    batch.add(new THREE.CylinderGeometry(0.44, 0.5, 0.34, 8), m.stone, { position: [x, 0.17, z] });
    batch.add(new THREE.CylinderGeometry(0.24, 0.29, 5.2, 10), m.wood, { position: [x, 2.9, z] });
    batch.add(new THREE.TorusGeometry(0.27, 0.035, 6, 16), m.gold, { position: [x, 0.52, z], rotation: [Math.PI / 2, 0, 0] });
    batch.add(new THREE.TorusGeometry(0.26, 0.03, 6, 16), m.gold, { position: [x, 5.3, z], rotation: [Math.PI / 2, 0, 0] });
  }
  // Hoành phi trên cửa.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), ctx.own(new THREE.MeshStandardMaterial({ map: ctx.textBoard(data.sign || ''), roughness: 0.6, emissive: '#2a0606', emissiveIntensity: 0.4 })));
  sign.position.set(0, Math.max(6.4, wallHeight - 1.2), frontZ + 0.33);
  ctx.add(sign);
  // Đèn lồng đỏ treo hiên.
  for (const [x] of data.porchPillars) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), m.lantern);
    lantern.scale.y = 1.25;
    lantern.position.set(x + (x < 0 ? 1.4 : -1.4), 4.7, frontZ + 1.6);
    ctx.add(lantern);
    ctx.glow(lantern.position.x, lantern.position.y, lantern.position.z);
  }
}

// Mái hiên trước thềm và mái chính. tiers: 2 = mái hai tầng (chồng diêm: mái dưới thấp, dải tường, mái trên hẹp hơn);
// hook: độ to đầu đao; roof / trim: vật liệu mái / nóc (mặc định m.roof / m.gold, đổi màu theo colors.roof của vùng).
// Trả { porch, main, upper } số đo các mái (upper chỉ có khi tiers = 2).
export function buildTempleRoof(ctx, { tiers = 2, hook = 1.35, roof = ctx.m.roof, trim = ctx.m.gold } = {}) {
  const { batch, m } = ctx;
  const { frontZ, hw, wallHeight, back } = templeFrame(ctx);
  const rise = 3.2 + (hw - 6) * 0.25;
  batch.add(new THREE.BoxGeometry(hw * 2 + 1.4, 0.22, 2.6), m.wood, { position: [0, 5.6, frontZ + 1.25] });
  const porch = addRoof(batch, m, { x0: -(hw + 0.6), x1: hw + 0.6, z0: frontZ - 0.2, z1: frontZ + 2.6, y: 5.7, rise: 1.0, roof, trim, hook });
  if (tiers < 2) {
    const main = addRoof(batch, m, { x0: -(hw + 0.4), x1: hw + 0.4, z0: back - 0.4, z1: frontZ + 0.4, y: wallHeight + 0.1, rise, roof, trim, hook });
    return { porch, main, upper: null };
  }
  const lower = rise * 0.55;
  const main = addRoof(batch, m, { x0: -(hw + 0.4), x1: hw + 0.4, z0: back - 0.4, z1: frontZ + 0.4, y: wallHeight + 0.1, rise: lower, roof, trim, hook });
  // Dải tường giữa hai tầng mái, rồi mái trên hẹp hơn mỗi bên 1,6 m.
  const bandBottom = wallHeight + 0.1 + lower * 0.55;
  const bandHeight = 1.5;
  const inset = 1.6;
  batch.add(new THREE.BoxGeometry((hw - inset) * 2, bandHeight, frontZ - back - inset * 2), m.wall, {
    position: [0, bandBottom + bandHeight / 2, (frontZ + back) / 2],
  });
  // Hàng cột nhỏ và lan can gỗ của tầng chồng diêm, nhìn rõ từ sân nhưng vẫn nằm trên cao nên không ảnh hưởng lối đi.
  const galleryZ = frontZ - inset + 0.44;
  batch.add(new THREE.BoxGeometry((hw - inset) * 2 - 0.8, 0.14, 0.22), m.wood, {
    position: [0, bandBottom + 0.34, galleryZ],
  });
  for (let x = -(hw - inset - 0.55); x <= hw - inset - 0.5; x += 1.25) batch.add(new THREE.BoxGeometry(0.11, bandHeight - 0.3, 0.18), m.wood, {
    position: [x, bandBottom + bandHeight / 2, galleryZ],
  });
  const upper = addRoof(batch, m, {
    x0: -(hw - inset + 0.3), x1: hw - inset + 0.3, z0: back + inset - 0.5, z1: frontZ - inset + 0.5,
    y: bandBottom + bandHeight, rise: rise * 0.6, roof, trim, hook,
  });
  return { porch, main, upper };
}

// Cổng tam quan và tường gạch thấp hai bên cổng. Trả { roofs, z, pillars } (số đo mái từng cửa, vị trí cổng, x các cột).
export function buildGate(ctx) {
  const { batch, m, data } = ctx;
  if (!data.gate) return;
  const ground = data.ground;
  const gz = data.gate.z;
  const openings = data.gate.openings || [
    { x: -2.4, width: 1.6, height: 3.05 },
    { x: 0, width: 3.2, height: 3.5 },
    { x: 2.4, width: 1.6, height: 3.05 },
  ];
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry((ground.x[1] - 3.4), 1.3, 0.4), m.brick, { position: [s * (3.4 + (ground.x[1] - 3.4) / 2), 0.65, gz] });
  }
  const pillarXs = new Set();
  const roofs = [];
  for (const opening of openings) {
    pillarXs.add(opening.x - opening.width / 2);
    pillarXs.add(opening.x + opening.width / 2);
    const radius = opening.width / 2 - 0.08;
    batch.add(new THREE.TorusGeometry(radius, 0.11, 6, 24, Math.PI), m.gold, {
      position: [opening.x, opening.height - radius, gz - 0.24],
    });
    roofs.push(addRoof(batch, m, {
      x0: opening.x - opening.width / 2 - 0.18,
      x1: opening.x + opening.width / 2 + 0.18,
      z0: gz - 0.65,
      z1: gz + 0.65,
      y: opening.x === 0 ? 4 : 3.65,
      rise: opening.x === 0 ? 0.9 : 0.62,
    }));
  }
  for (const x of pillarXs) batch.add(new THREE.BoxGeometry(0.5, 3.6, 0.5), m.pillar, { position: [x, 1.8, gz] });
  batch.add(new THREE.BoxGeometry(7.4, 0.5, 0.8), m.wood, { position: [0, 3.75, gz] });
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), ctx.own(new THREE.MeshStandardMaterial({ map: ctx.textBoard(data.gateSign || 'TAM QUAN'), roughness: 0.6 })));
  gateSign.position.set(0, 3.75, gz - 0.42);
  gateSign.rotation.y = Math.PI;
  ctx.add(gateSign);
  return { roofs, z: gz, pillars: [...pillarXs] };
}

// Chùa gốc; params (theme.temple): { tiers, hook } truyền cho mái. Trả { roofs, gate } để bộ đồ vùng thêm trang trí.
export function buildTemple(ctx) {
  buildTempleFacade(ctx);
  const roofs = buildTempleRoof(ctx, { tiers: ctx.params?.tiers, hook: ctx.params?.hook });
  const gate = buildGate(ctx);
  addTempleFestivalLights(ctx, roofs, gate);
  return { roofs, gate };
}

export const kit = { trees, scatter: {}, mountains, grounds: {}, temple: buildTemple };
