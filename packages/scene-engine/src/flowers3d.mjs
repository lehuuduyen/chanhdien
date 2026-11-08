// Vườn Hoa ngoài sân (world.courtyard.flowerGarden): khu ngắm cảnh, toàn bộ vị trí lấy từ scene.
//   hedge: đoạn hàng rào cây xén [x0, z0, x1, z1] (đường giữa lớp cây), hedgeHeight.
//   entrances: [{ x, z, ry, width, arch }] — cổng vòm hoa có biển tên.
//   beds: [{ theme: 'tulips' | 'lavender' | 'roses' | 'cosmos', x: [x0, x1], z: [z0, z1] }] — luống chữ nhật, góc gần
//         tâm (center) khoét tròn bán kính cut để chừa quảng trường.
//   plaza: { radius }, pavilion: { radius, height } — quảng trường đá và đình bát giác ở center.
//   trees: [{ x, z, size, color: 'pink' | 'white' }] — cây hoa anh đào; lamps: [{ x, z }] — đèn vườn.
//   butterflies: số bướm bay trên luống.
// Phần tĩnh (rào, đình, cổng, đèn, cây, nền luống) gộp vào batch chung của sân; hoa là vài InstancedMesh (mỗi loại hình
// một lượt vẽ, màu theo từng cây) để hàng nghìn bông vẫn nhẹ trên điện thoại. Bướm cập nhật mỗi khung trong update().
import * as THREE from 'three';

const BED_HEIGHT = 0.15;
const CURB = 0.14;

// Số ngẫu nhiên cố định theo hạt giống: mọi máy thấy cùng một vườn.
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Viền luống: chạy quanh chữ nhật mỗi 0,25 m, điểm nằm trong vòng tròn khoét (quanh tâm vườn) đẩy ra mép vòng tròn.
function bedOutline(x, z, center, cut) {
  const points = [];
  const corners = [[x[0], z[0]], [x[1], z[0]], [x[1], z[1]], [x[0], z[1]]];
  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    for (let step = 0; step < steps; step += 1) {
      let px = ax + ((bx - ax) * step) / steps;
      let pz = az + ((bz - az) * step) / steps;
      const dx = px - center.x;
      const dz = pz - center.z;
      const distance = Math.hypot(dx, dz);
      if (distance < cut) {
        px = center.x + (dx / (distance || 1)) * cut;
        pz = center.z + (dz / (distance || 1)) * cut;
      }
      points.push(new THREE.Vector2(px, -pz));
    }
  }
  return points;
}

// Khối nền phẳng theo viền (shape trong mặt x, −z), cao `height` tính từ mặt cỏ; hole: viền khoét bên trong.
function slab(outline, height, hole = null) {
  const shape = new THREE.Shape(outline);
  if (hole) shape.holes.push(new THREE.Path(hole));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

const at = (item, lx, y, lz) => {
  const ry = item.ry || 0;
  return [item.x + lx * Math.cos(ry) + lz * Math.sin(ry), y, item.z - lx * Math.sin(ry) + lz * Math.cos(ry)];
};

// Một InstancedMesh từ danh sách { p: [x, y, z], s: [sx, sy, sz] | số, r: [rx, ry, rz], c: màu }.
function instanced(root, geometry, material, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  items.forEach((item, index) => {
    dummy.position.set(...item.p);
    dummy.rotation.set(...(item.r || [0, 0, 0]));
    if (Array.isArray(item.s)) dummy.scale.set(...item.s);
    else dummy.scale.setScalar(item.s ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, color.set(item.c || '#ffffff'));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

const TULIP_COLORS = ['#e8323c', '#f57b2a', '#f7d035', '#f06aa0', '#9b59d0', '#fbf6f0'];
const ROSE_COLORS = ['#d61f3c', '#f27aa4', '#fff1f1', '#ff7f6e', '#ffd34d', '#c2185b'];
const COSMOS_COLORS = ['#f48fb1', '#e0457b', '#ffffff', '#f9a03f', '#ffd54f', '#ba68c8'];
const LAVENDER_COLORS = ['#8e6bd1', '#a07ee0', '#7b5bbf', '#9c7fd8'];
const BUTTERFLY_COLORS = ['#fff6e0', '#ffd34d', '#ff9a3c', '#7fc8ff', '#f7a8d8', '#ffffff'];

export function addFlowerGarden({ root, batch, m, data, lanternGlows }) {
  const center = data.center;
  const cut = data.cut || 4.8;
  const random = seeded(20261107);
  const signs = [];
  const mat = {
    hedge: new THREE.MeshStandardMaterial({ color: '#2f6b35', roughness: 0.95, flatShading: true }),
    hedgeTop: new THREE.MeshStandardMaterial({ color: '#3f8240', roughness: 0.95, flatShading: true }),
    soil: new THREE.MeshStandardMaterial({ color: '#4a2f1c', roughness: 1 }),
    meadow: new THREE.MeshStandardMaterial({ color: '#4f8a3a', roughness: 1 }),
    mulch: new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 1 }),
    curb: new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.8 }),
    plaza: new THREE.MeshStandardMaterial({ color: '#d9cfbd', roughness: 0.85 }),
    blossomPink: new THREE.MeshStandardMaterial({ color: '#f6b3c8', roughness: 0.85, flatShading: true }),
    blossomDeep: new THREE.MeshStandardMaterial({ color: '#ee92b0', roughness: 0.85, flatShading: true }),
    blossomWhite: new THREE.MeshStandardMaterial({ color: '#fbeef2', roughness: 0.85, flatShading: true }),
    roseRed: new THREE.MeshStandardMaterial({ color: '#d61f3c', roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.7 }),
  };

  // ---- Nền: sỏi kem trong hàng rào, quảng trường đá tròn có viền ----
  const area = data.area;
  const inner = { x: [area.x[0] + 0.6, area.x[1] - 0.6], z: [area.z[0] + 0.6, area.z[1] - 0.6] };
  const gravelMap = m.gravel.map.clone();
  gravelMap.repeat.set((inner.x[1] - inner.x[0]) / 2, (inner.z[1] - inner.z[0]) / 2);
  gravelMap.needsUpdate = true;
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(inner.x[1] - inner.x[0], inner.z[1] - inner.z[0]), new THREE.MeshStandardMaterial({ map: gravelMap, roughness: 1 }));
  gravel.rotation.x = -Math.PI / 2;
  gravel.position.set((inner.x[0] + inner.x[1]) / 2, 0.008, (inner.z[0] + inner.z[1]) / 2);
  gravel.receiveShadow = true;
  root.add(gravel);
  const plazaRadius = data.plaza?.radius || 4.4;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(plazaRadius, 48), mat.plaza);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(center.x, 0.013, center.z);
  plaza.receiveShadow = true;
  root.add(plaza);
  batch.add(new THREE.TorusGeometry(plazaRadius, 0.09, 4, 64), m.stone, { position: [center.x, 0.016, center.z], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });
  batch.add(new THREE.TorusGeometry(plazaRadius * 0.62, 0.05, 4, 48), m.stone, { position: [center.x, 0.016, center.z], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });

  // ---- Hàng rào cây xén: khối thấp hai tông, bo đầu ở hai bên cổng ----
  const hedgeHeight = data.hedgeHeight || 0.85;
  for (const [x0, z0, x1, z1] of data.hedge || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const position = [(x0 + x1) / 2, hedgeHeight / 2, (z0 + z1) / 2];
    batch.add(new THREE.BoxGeometry(0.6, hedgeHeight, length + 0.6), mat.hedge, { position, rotation: [0, ry, 0] });
    batch.add(new THREE.BoxGeometry(0.5, 0.12, length + 0.5), mat.hedgeTop, { position: [position[0], hedgeHeight + 0.04, position[2]], rotation: [0, ry, 0] });
  }

  // ---- Cổng vòm hoa hồng leo + biển tên ----
  for (const gate of data.entrances || []) {
    const half = (gate.width || 2.4) / 2;
    const ry = gate.ry || 0;
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(0.16, 2.3, 0.16), mat.white, { position: at(gate, side * half, 1.15, 0), rotation: [0, ry, 0] });
      batch.add(new THREE.BoxGeometry(0.34, 0.12, 0.34), m.stone, { position: at(gate, side * half, 0.06, 0), rotation: [0, ry, 0] });
    }
    if (gate.arch !== false) {
      batch.add(new THREE.TorusGeometry(half, 0.07, 6, 20, Math.PI), mat.white, { position: at(gate, 0, 2.3, 0), rotation: [0, ry, 0] });
      // Hoa hồng leo: lá và bông rải theo vòm và hai cột.
      const climb = [];
      for (let step = 0; step <= 14; step += 1) {
        const angle = (step / 14) * Math.PI;
        climb.push([Math.cos(angle) * half, 2.3 + Math.sin(angle) * half]);
      }
      for (const side of [-1, 1]) for (let y = 0.5; y < 2.3; y += 0.32) climb.push([side * half, y]);
      climb.forEach(([lx, y], index) => {
        const jitter = ((index * 37) % 7) / 7 - 0.5;
        batch.add(new THREE.IcosahedronGeometry(0.17, 0), m.leaf, { position: at(gate, lx + jitter * 0.08, y, jitter * 0.12), rotation: [index, index * 2, 0] });
        const bloom = index % 3 === 0 ? mat.roseRed : index % 3 === 1 ? m.flowerPink : mat.white;
        batch.add(new THREE.IcosahedronGeometry(0.075, 0), bloom, { position: at(gate, lx - jitter * 0.1, y + 0.07, 0.12 * (index % 2 ? 1 : -1)) });
      });
    }
    if (data.sign) signs.push({ text: data.sign, width: Math.max(2.2, half * 2 - 0.1), height: 0.5, position: at(gate, 0, 3.0 + (gate.arch === false ? -0.4 : half * 0.15), 0), ry });
  }

  // ---- Đình bát giác giữa quảng trường: 8 cột son, xà, mái ngói hai tầng, đỉnh vàng, đèn lồng treo ----
  if (data.pavilion) {
    const radius = data.pavilion.radius || 2.3;
    const height = data.pavilion.height || 2.7;
    batch.add(new THREE.CylinderGeometry(radius + 0.55, radius + 0.65, 0.05, 8), m.stone, { position: [center.x, 0.025, center.z], rotation: [0, Math.PI / 8, 0] });
    const pillars = Array.from({ length: 8 }, (_, index) => {
      const angle = ((index + 0.5) / 8) * Math.PI * 2;
      return [center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius];
    });
    pillars.forEach(([x, z], index) => {
      batch.add(new THREE.CylinderGeometry(0.11, 0.13, height, 8), m.pillar, { position: [x, height / 2, z] });
      batch.add(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 8), m.darkStone, { position: [x, 0.08, z] });
      const [nx, nz] = pillars[(index + 1) % 8];
      const length = Math.hypot(nx - x, nz - z);
      batch.add(new THREE.BoxGeometry(0.14, 0.2, length + 0.1), m.pillar, { position: [(x + nx) / 2, height - 0.05, (z + nz) / 2], rotation: [0, Math.atan2(nx - x, nz - z), 0] });
      batch.add(new THREE.BoxGeometry(0.06, 0.06, length), m.gold, { position: [(x + nx) / 2, height - 0.2, (z + nz) / 2], rotation: [0, Math.atan2(nx - x, nz - z), 0] });
    });
    // Mái: tầng dưới rộng (đỉnh tám góc trùng cột), tầng trên nhỏ; đầu đao vàng ở tám góc.
    batch.add(new THREE.ConeGeometry(radius + 1.05, 1.0, 8), m.roof, { position: [center.x, height + 0.5, center.z], rotation: [0, Math.PI / 8, 0] });
    batch.add(new THREE.ConeGeometry(radius * 0.55, 0.9, 8), m.roof, { position: [center.x, height + 1.25, center.z], rotation: [0, Math.PI / 8, 0] });
    batch.add(new THREE.CylinderGeometry(radius * 0.55, radius * 0.6, 0.12, 8), m.pillar, { position: [center.x, height + 0.82, center.z], rotation: [0, Math.PI / 8, 0] });
    for (let index = 0; index < 8; index += 1) {
      const angle = ((index + 0.5) / 8) * Math.PI * 2;
      const reach = radius + 1.0;
      batch.add(new THREE.ConeGeometry(0.07, 0.32, 5), m.gold, {
        position: [center.x + Math.cos(angle) * reach, height + 0.12, center.z + Math.sin(angle) * reach],
        rotation: [Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7],
      });
    }
    batch.add(new THREE.SphereGeometry(0.16, 10, 8), m.gold, { position: [center.x, height + 1.78, center.z] });
    batch.add(new THREE.ConeGeometry(0.07, 0.4, 8), m.gold, { position: [center.x, height + 2.05, center.z] });
    batch.add(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), m.darkStone, { position: [center.x, height - 0.25, center.z] });
    batch.add(new THREE.SphereGeometry(0.22, 12, 10), m.lantern, { position: [center.x, height - 0.65, center.z], scale: [1, 1.25, 1] });
    lanternGlows?.push(new THREE.Vector3(center.x, height - 0.65, center.z));
  }

  // ---- Đèn vườn (đứng trên mép luống, hoa chừa chỗ chân đèn) ----
  for (const lamp of data.lamps || []) {
    batch.add(new THREE.CylinderGeometry(0.05, 0.07, 1.35, 6), m.darkStone, { position: [lamp.x, 0.675, lamp.z] });
    batch.add(new THREE.BoxGeometry(0.2, 0.24, 0.2), m.paper, { position: [lamp.x, 1.47, lamp.z] });
    batch.add(new THREE.ConeGeometry(0.2, 0.16, 4), m.darkStone, { position: [lamp.x, 1.66, lamp.z], rotation: [0, Math.PI / 4, 0] });
    lanternGlows?.push(new THREE.Vector3(lamp.x, 1.47, lamp.z));
  }

  // ---- Cây hoa anh đào: thân cong nhẹ, tán nhiều cụm hoa hồng / trắng ----
  for (const tree of data.trees || []) {
    const size = tree.size || 1;
    const blossom = tree.color === 'white' ? mat.blossomWhite : mat.blossomPink;
    // Cây đứng trong luống thì gốc ở mặt đất luống.
    const base = (data.beds || []).some((bed) => tree.x > bed.x[0] && tree.x < bed.x[1] && tree.z > bed.z[0] && tree.z < bed.z[1]) ? BED_HEIGHT : 0;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, 1.9 * size, 7), m.bark, { position: [tree.x, base + 0.95 * size, tree.z], rotation: [0.06, 0, 0.05] });
    for (let branch = 0; branch < 3; branch += 1) {
      const angle = branch * 2.1 + tree.x;
      batch.add(new THREE.CylinderGeometry(0.04 * size, 0.08 * size, 1.1 * size, 5), m.bark, {
        position: [tree.x + Math.cos(angle) * 0.35 * size, base + 2.0 * size, tree.z + Math.sin(angle) * 0.35 * size],
        rotation: [Math.sin(angle) * 0.7, 0, -Math.cos(angle) * 0.7],
      });
    }
    for (let blob = 0; blob < 8; blob += 1) {
      const angle = blob * 0.8 + tree.z;
      const reach = blob === 7 ? 0 : (0.85 + (blob % 3) * 0.2) * size;
      batch.add(new THREE.IcosahedronGeometry((0.7 + (blob % 3) * 0.18) * size, 1), blob % 3 === 2 ? mat.blossomDeep : blossom, {
        position: [tree.x + Math.cos(angle) * reach, base + (2.45 + (blob % 2) * 0.45 + (blob === 7 ? 0.5 : 0)) * size, tree.z + Math.sin(angle) * reach],
        scale: [1, 0.78, 1],
      });
    }
  }

  // ---- Luống: viền đá trắng, nền đất / cỏ, rồi hoa theo chủ đề ----
  const stems = [];
  const leaves = [];
  const tulips = [];
  const blooms = [];
  const bushes = [];
  const spikes = [];
  const discs = [];
  const hearts = [];
  const trees = data.trees || [];
  const lamps = data.lamps || [];
  const nearTree = (x, z) => trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 0.75 * (tree.size || 1))
    || lamps.some((lamp) => Math.hypot(lamp.x - x, lamp.z - z) < 0.3);
  // Điểm trồng được: trong luống (chừa mép 0,15 m) và ngoài vòng khoét quanh quảng trường.
  const plantable = (bed, x, z) => x > bed.x[0] + 0.15 && x < bed.x[1] - 0.15 && z > bed.z[0] + 0.15 && z < bed.z[1] - 0.15
    && Math.hypot(x - center.x, z - center.z) > cut + 0.2 && !nearTree(x, z);
  const y0 = BED_HEIGHT;
  for (const bed of data.beds || []) {
    const outline = bedOutline(bed.x, bed.z, center, cut);
    const outer = bedOutline([bed.x[0] - CURB, bed.x[1] + CURB], [bed.z[0] - CURB, bed.z[1] + CURB], center, cut - CURB);
    batch.add(slab(outer, BED_HEIGHT + 0.06, outline), mat.curb, {});
    const ground = bed.theme === 'cosmos' ? mat.meadow : bed.theme === 'roses' ? mat.mulch : mat.soil;
    batch.add(slab(outline, BED_HEIGHT), ground, {});
    const width = bed.x[1] - bed.x[0];
    const depth = bed.z[1] - bed.z[0];
    if (bed.theme === 'tulips') {
      // Sọc cầu vồng: mỗi màu ba hàng, hàng chạy dọc trục dài của luống.
      const along = depth >= width ? 'z' : 'x';
      const rows = Math.floor((along === 'z' ? width : depth) / 0.3);
      const per = Math.floor((along === 'z' ? depth : width) / 0.3);
      for (let row = 0; row < rows; row += 1) {
        const color = TULIP_COLORS[Math.floor(row / 3) % TULIP_COLORS.length];
        for (let index = 0; index < per; index += 1) {
          const a = (row + 0.5) * 0.3 + (random() - 0.5) * 0.06;
          const b = (index + 0.5) * 0.3 + (random() - 0.5) * 0.06;
          const x = along === 'z' ? bed.x[0] + a : bed.x[0] + b;
          const z = along === 'z' ? bed.z[0] + b : bed.z[0] + a;
          if (!plantable(bed, x, z)) continue;
          const height = 0.32 + random() * 0.12;
          const lean = [(random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12];
          stems.push({ p: [x, y0, z], s: [1, height, 1], r: lean, c: '#4c8a3c' });
          tulips.push({ p: [x - lean[2] * height, y0 + height - 0.02, z + lean[0] * height], s: 1 + random() * 0.2, r: [0, random() * 6, 0], c: color });
          if (index % 2 === 0) leaves.push({ p: [x, y0, z], s: [1, 0.9 + random() * 0.4, 1], r: [(random() - 0.5) * 0.6, random() * 6, (random() - 0.5) * 0.6], c: '#3f7d36' });
        }
      }
    } else if (bed.theme === 'lavender') {
      // Hàng oải hương: bụi xám xanh, nhiều bông tím xòe ra.
      for (let lx = 0.4; lx < width - 0.2; lx += 0.72) {
        for (let lz = 0.35; lz < depth - 0.2; lz += 0.55) {
          const x = bed.x[0] + lx + (random() - 0.5) * 0.08;
          const z = bed.z[0] + lz + (random() - 0.5) * 0.08;
          if (!plantable(bed, x, z)) continue;
          bushes.push({ p: [x, y0 + 0.08, z], s: [0.27, 0.17, 0.27], r: [0, random() * 6, 0], c: '#6f8f6a' });
          for (let spike = 0; spike < 6; spike += 1) {
            const angle = (spike / 6) * Math.PI * 2 + random();
            const tilt = 0.18 + random() * 0.18;
            spikes.push({
              p: [x + Math.cos(angle) * 0.07, y0 + 0.12, z + Math.sin(angle) * 0.07],
              s: [1, 0.3 + random() * 0.14, 1],
              r: [Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt],
              c: LAVENDER_COLORS[Math.floor(random() * LAVENDER_COLORS.length)],
            });
          }
        }
      }
    } else if (bed.theme === 'roses') {
      // Hồng bụi: mỗi bụi một màu, bông nằm rải trên mặt bụi.
      for (let lx = 0.5; lx < width - 0.3; lx += 0.92) {
        for (let lz = 0.5; lz < depth - 0.3; lz += 0.92) {
          const x = bed.x[0] + lx + (random() - 0.5) * 0.18;
          const z = bed.z[0] + lz + (random() - 0.5) * 0.18;
          if (!plantable(bed, x, z)) continue;
          const size = 0.34 + random() * 0.1;
          bushes.push({ p: [x, y0 + size * 0.75, z], s: [size, size * 0.85, size], r: [0, random() * 6, 0], c: random() < 0.5 ? '#2f6a32' : '#3a7a3a' });
          const color = ROSE_COLORS[Math.floor(random() * ROSE_COLORS.length)];
          for (let bloom = 0; bloom < 7; bloom += 1) {
            const angle = bloom * 0.9 + random() * 0.5;
            const up = 0.35 + random() * 0.55;
            const reach = Math.sqrt(1 - up * up) * size;
            blooms.push({
              p: [x + Math.cos(angle) * reach, y0 + size * 0.75 + up * size * 0.85, z + Math.sin(angle) * reach],
              s: 0.075 + random() * 0.025, r: [random() * 3, random() * 3, 0], c: color,
            });
          }
        }
      }
    } else {
      // Cúc cánh bướm: bông đĩa nhiều màu cao thấp xen nhau trên nền cỏ.
      for (let lx = 0.2; lx < width - 0.1; lx += 0.3) {
        for (let lz = 0.2; lz < depth - 0.1; lz += 0.3) {
          const x = bed.x[0] + lx + (random() - 0.5) * 0.2;
          const z = bed.z[0] + lz + (random() - 0.5) * 0.2;
          if (!plantable(bed, x, z)) continue;
          const height = 0.28 + random() * 0.32;
          const lean = [(random() - 0.5) * 0.25, 0, (random() - 0.5) * 0.25];
          const top = [x - lean[2] * height, y0 + height, z + lean[0] * height];
          stems.push({ p: [x, y0, z], s: [1, height, 1], r: lean, c: '#5a9a44' });
          discs.push({ p: top, s: 0.9 + random() * 0.5, r: [-Math.PI / 2 + (random() - 0.5) * 0.7, 0, (random() - 0.5) * 0.7], c: COSMOS_COLORS[Math.floor(random() * COSMOS_COLORS.length)] });
          hearts.push({ p: [top[0], top[1] + 0.012, top[2]], s: 0.028, c: '#f2b51d' });
        }
      }
    }
  }
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  const petalMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide });
  const stemGeometry = new THREE.CylinderGeometry(0.011, 0.015, 1, 4, 1, true).translate(0, 0.5, 0);
  const tulipGeometry = new THREE.LatheGeometry([[0.001, 0], [0.05, 0.015], [0.068, 0.06], [0.062, 0.12], [0.045, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  const leafGeometry = new THREE.ConeGeometry(0.035, 0.26, 3).translate(0, 0.13, 0).scale(1, 1, 0.35);
  const spikeGeometry = new THREE.ConeGeometry(0.03, 1, 5).translate(0, 0.5, 0);
  const blobGeometry = new THREE.IcosahedronGeometry(1, 1);
  const bloomGeometry = new THREE.IcosahedronGeometry(1, 0);
  const discGeometry = new THREE.CircleGeometry(0.075, 7);
  const heartGeometry = new THREE.OctahedronGeometry(1, 0);
  const flowerGroup = new THREE.Group();
  flowerGroup.name = 'flower-garden';
  root.add(flowerGroup);
  instanced(flowerGroup, stemGeometry, flowerMaterial, stems);
  instanced(flowerGroup, leafGeometry, flowerMaterial, leaves);
  instanced(flowerGroup, tulipGeometry, petalMaterial, tulips);
  instanced(flowerGroup, blobGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), bushes);
  instanced(flowerGroup, bloomGeometry, flowerMaterial, blooms);
  instanced(flowerGroup, spikeGeometry, flowerMaterial, spikes);
  instanced(flowerGroup, discGeometry, petalMaterial, discs);
  instanced(flowerGroup, heartGeometry, flowerMaterial, hearts);

  // ---- Bướm: hai cánh trên một mặt phẳng, vỗ cánh bằng cách co giãn bề ngang; bay vòng lượn trên các luống ----
  const butterflyCount = Math.min(60, data.butterflies ?? 20);
  let butterflyMesh = null;
  const butterflies = [];
  if (butterflyCount > 0 && data.beds?.length) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.03, -0.11, 0, -0.07, -0.1, 0, 0.06, 0, 0, -0.03, -0.1, 0, 0.06, -0.02, 0, 0.05,
      0, 0, -0.03, 0.1, 0, 0.06, 0.11, 0, -0.07, 0, 0, -0.03, 0.02, 0, 0.05, 0.1, 0, 0.06,
    ], 3));
    wing.computeVertexNormals();
    butterflyMesh = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), butterflyCount);
    butterflyMesh.frustumCulled = false;
    const color = new THREE.Color();
    for (let index = 0; index < butterflyCount; index += 1) {
      const bed = data.beds[index % data.beds.length];
      butterflies.push({
        cx: bed.x[0] + random() * (bed.x[1] - bed.x[0]),
        cz: bed.z[0] + random() * (bed.z[1] - bed.z[0]),
        ax: 0.8 + random() * 1.8,
        az: 0.8 + random() * 1.8,
        y: 0.65 + random() * 0.7,
        speed: (0.25 + random() * 0.35) * (random() < 0.5 ? 1 : -1),
        phase: random() * 10,
        flap: 11 + random() * 6,
        size: 0.9 + random() * 0.5,
      });
      butterflyMesh.setColorAt(index, color.set(BUTTERFLY_COLORS[index % BUTTERFLY_COLORS.length]));
    }
    root.add(butterflyMesh);
  }
  const dummy = new THREE.Object3D();
  // Chỉ cập nhật bướm khi vườn có thể nằm trong tầm nhìn (camera trong khoảng 60 m quanh vườn).
  const reach = Math.hypot(area.x[1] - area.x[0], area.z[1] - area.z[0]) / 2 + 60;

  return {
    signs,
    update(dt, time, camera) {
      if (!butterflyMesh) return;
      const near = !camera || Math.hypot(camera.position.x - center.x, camera.position.z - center.z) < reach;
      butterflyMesh.visible = near;
      if (!near) return;
      const seconds = time / 1_000;
      for (let index = 0; index < butterflies.length; index += 1) {
        const fly = butterflies[index];
        const t = seconds * fly.speed + fly.phase;
        const x = fly.cx + Math.sin(t) * fly.ax;
        const z = fly.cz + Math.sin(t * 1.7 + 0.6) * fly.az;
        const vx = Math.cos(t) * fly.ax * fly.speed;
        const vz = Math.cos(t * 1.7 + 0.6) * 1.7 * fly.az * fly.speed;
        dummy.position.set(x, fly.y + Math.sin(seconds * 2.3 + fly.phase) * 0.18, z);
        dummy.rotation.set(0, Math.atan2(vx, vz), 0);
        const flap = Math.abs(Math.sin(seconds * fly.flap + fly.phase));
        dummy.scale.set(fly.size * (0.2 + flap * 0.8), fly.size, fly.size);
        dummy.updateMatrix();
        butterflyMesh.setMatrixAt(index, dummy.matrix);
      }
      butterflyMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
