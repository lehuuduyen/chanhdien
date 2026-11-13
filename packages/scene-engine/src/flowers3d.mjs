// Vườn Hoa ngoài sân (world.courtyard.flowerGarden): vườn kiểu tự nhiên, toàn bộ vị trí lấy từ scene.
//   outline / hedge / hedgeHeight: đa giác hàng rào và các đoạn cây xén [x0, z0, x1, z1] (đường giữa lớp cây).
//   entrances: [{ x, z, ry, width, arch }] — cổng vòm hoa có biển tên.
//   paths: lối sỏi cong; beds: luống hình tự do, mỗi luống một bộ cây theo tầng { edge, mid, back } (xem flower-layout.mjs).
//   plaza: { radius }, pavilion: { radius, height, ry?, y?, door?, rail?, posts? } — quảng trường đá và đình ở center (mô
//   hình Meshy xoay ry, hạ y; door / rail: nhịp lan can mở làm cửa, xem openRail trong props3d.mjs; posts: chỗ cột).
//   pond?: { x, z, rx, rz, lilies } — hồ súng; trees: [{ x, z, size, kind }] — cây hoa; lamps: [{ x, z }] — đèn vườn.
//   bedCenters, butterflies: bướm bay quanh tâm các luống.
// Nền (bãi cỏ cắt sọc, gốc luống phủ lá thấp, lối sỏi có viền) vẽ trên một texture canvas phủ cả vườn. Hoa / cây bụi / cây hoa
// là ảnh dựng từ mô hình Meshy (/models/flowers/<tên>.webp) đặt thành billboard quay về camera, đung đưa theo gió: mỗi loài
// một InstancedMesh, trồng theo mảng (mỗi mảng một loài, một màu) — thấp ở mép luống, cao vào trong. Đình là mô hình Meshy;
// cổng vòm là ảnh. Chưa tải xong / tải lỗi thì đình, cổng, cây hiện bản dựng bằng khối; luống chỉ hiện nền.
// Ảnh và việc tính chỗ trồng chỉ chạy khi camera tới gần (activate + lazyDistance).
import * as THREE from 'three';
import { StaticBatch } from './temple3d-models.mjs';
import { instanceProp, openRail, placeProp } from './props3d.mjs';
import { flowerLayout, insidePolygon, polylineDistance } from './flower-layout.mjs';

const MODELS = '/models/flowers';
const SCENE_MODELS = '/models/scene';
// Cổng vòm hoa hồng (ảnh /models/flowers/arch.webp): lối đi chiếm ARCH_OPENING bề ngang ảnh, ảnh rộng / cao = ARCH_ASPECT.
const ARCH_OPENING = 0.54;
const ARCH_ASPECT = 627 / 512;
const archSize = (gate) => {
  const width = (gate.width || 2.4) / ARCH_OPENING;
  return { width, height: width / ARCH_ASPECT };
};

// Bảng màu đậm, tươi (ít trắng / pastel để vườn không bị bạc màu dưới nắng).
const TULIP_COLORS = ['#e8102a', '#ff5a00', '#ffc400', '#ff2e7e', '#8a1fd6', '#ff7aa8', '#c4002f', '#ff9a1f'];
const COSMOS_COLORS = ['#ff3d8f', '#d6005f', '#ff86c0', '#ff7a12', '#ffc61a', '#a63fe0'];
const HYDRANGEA_COLORS = ['#3d6ff0', '#7a46e6', '#ff5fa8', '#2f8ff0', '#a45cf0'];
const MUM_COLORS = ['#ffc400', '#ff7a00', '#d40a48', '#ff4f96', '#ffe04a', '#b8126a'];
const LILY_COLORS = ['#ff4f8b', '#ff8c1a', '#ffd23a', '#e8102a', '#fff4f7'];
const BUTTERFLY_COLORS = ['#fff6e0', '#ffd34d', '#ff9a3c', '#7fc8ff', '#f7a8d8', '#ffffff'];

// Cây trong luống: file ảnh, khoảng cách trồng (m), chiều cao (m), bảng màu nhuộm phần cánh trắng (không có = màu ảnh).
const PLANTS = {
  tulip: { file: 'tulip', spacing: 0.22, height: [0.48, 0.64], colors: TULIP_COLORS },
  lavender: { file: 'lavender', spacing: 0.5, height: [0.5, 0.68] },
  rose: { file: 'rosebush', spacing: 0.45, height: [0.7, 0.95] },
  cosmos: { file: 'cosmos', spacing: 0.3, height: [0.5, 0.78], colors: COSMOS_COLORS, mixed: true },
  sunflower: { file: 'sunflower', spacing: 0.62, height: [1.45, 1.9] },
  hydrangea: { file: 'hydrangea', spacing: 0.78, height: [0.85, 1.15], colors: HYDRANGEA_COLORS },
  marigold: { file: 'marigold', spacing: 0.32, height: [0.3, 0.42] },
  mum: { file: 'mum', spacing: 0.36, height: [0.34, 0.46], colors: MUM_COLORS },
  peony: { file: 'peony', spacing: 0.58, height: [0.7, 0.92] },
  hibiscus: { file: 'hibiscus', spacing: 0.75, height: [1.25, 1.65] },
  lily: { file: 'lily', spacing: 0.4, height: [0.8, 1.05], colors: LILY_COLORS },
  delphinium: { file: 'delphinium', spacing: 0.48, height: [1.1, 1.45] },
  foliage: { file: 'foliage', spacing: 0.5, height: [0.3, 0.44] },
  grass: { file: 'grass', spacing: 0.62, height: [0.8, 1.05] },
};
// Lớp lá phủ nền dưới hoa (để luống không lộ đất): khoảng cách và chiều cao.
const GROUND_COVER = { plant: 'foliage', spacing: 0.4, height: [0.24, 0.38] };
// Trồng dày hơn khoảng cách ghi trong bảng (hệ số mật độ) để luống kín, ít lộ đất.
const DENSITY = 1.9;
// Chỗ hở giữa các cây (nhất là dưới gốc cây cao, thưa như cẩm tú cầu, hướng dương) trồng xen tulip thấp nhiều màu theo
// mảng: khoảng cách trồng xen (m) và chiều cao. Phần còn hở nữa mới phủ lá.
const FILLER = { plant: 'tulip', spacing: 0.3, height: [0.36, 0.5] };
// Cây hoa: ảnh và chiều cao khi size = 1.
const TREES = {
  cherry: { file: 'cherry', height: 3.8 },
  frangipani: { file: 'frangipani', height: 3.3 },
  apricot: { file: 'apricot', height: 3.0 },
  crape: { file: 'crape', height: 4.1 },
};
// Tầng theo độ sâu vào trong luống (m): mép < EDGE_DEPTH, giữa < MID_DEPTH, còn lại là trong cùng.
const EDGE_DEPTH = 0.45;
const MID_DEPTH = 1.0;

// Vật liệu billboard: quay quanh trục đứng về phía camera, ngọn đung đưa theo gió; màu instance chỉ nhuộm phần
// sáng và ít màu (cánh hoa trắng), thân lá giữ nguyên. Lật ngang bằng dấu của cột x trong ma trận instance.
// saturation: hệ số độ tươi màu (hoa 1,35; ảnh cây như Bồ Đề để 1 cho giữ màu lá tự nhiên).
export function spriteMaterial(map, uniforms, { saturation = 1.35 } = {}) {
  const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uSaturation = { value: saturation };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <project_vertex>', `
vec4 bbCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float bbW = length(instanceMatrix[0].xyz) * sign(instanceMatrix[0].x + 1e-5);
float bbH = length(instanceMatrix[1].xyz);
vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
float sway = sin(uWindTime * 1.7 + bbCenter.x * 0.8 + bbCenter.z * 1.1) * 0.05 * position.y * bbH;
vec3 bbWorld = bbCenter.xyz + camRight * (position.x * bbW + sway) + vec3(0.0, position.y * bbH, 0.0);
vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSaturation;').replace('#include <color_fragment>', `
#if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  float petalHigh = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
  float petalSat = petalHigh - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
  float petalMask = smoothstep(0.5, 0.78, petalHigh) * (1.0 - smoothstep(0.1, 0.28, petalSat));
  diffuseColor.rgb *= mix(vec3(1.0), vColor, petalMask);
#endif
  // Tăng độ tươi (bão hòa) của ảnh hoa: ảnh dựng từ mô hình hơi bạc màu sau tone mapping ngoài nắng.
  float petalLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = max(mix(vec3(petalLuma), diffuseColor.rgb, uSaturation), 0.0);`);
  };
  material.customProgramCacheKey = () => 'flower-sprite-v2';
  return material;
}

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

const at = (item, lx, y, lz) => {
  const ry = item.ry || 0;
  return [item.x + lx * Math.cos(ry) + lz * Math.sin(ry), y, item.z - lx * Math.sin(ry) + lz * Math.cos(ry)];
};

// Chỗ trồng: lưới 0,2 m có xê dịch; mỗi luống chia thành mảng (Voronoi quanh vài hạt giống / tầng), mỗi mảng một loài và
// một màu; điểm lưới được giữ theo mật độ của loài đó (khoảng cách trồng). Thêm lớp lá phủ nền thưa bên dưới.
export function planFlowers(data) {
  const layout = flowerLayout(data);
  const random = seeded(20261108);
  const plantings = Object.fromEntries(Object.keys(PLANTS).map((name) => [name, []]));
  // Tulip trồng xen để riêng: máy yếu (renderer tự hạ chất lượng) ẩn được lớp này mà vẫn giữ hoa chính.
  plantings.fill = [];
  const cover = [];
  const step = 0.2;
  layout.beds.forEach((bed, index) => {
    const mix = bed.mix || {};
    const tiers = { edge: mix.edge || [], mid: mix.mid || [], back: mix.back || [] };
    // Tầng trống thì mượn tầng kế bên.
    if (!tiers.mid.length) tiers.mid = tiers.back.length ? tiers.back : tiers.edge;
    if (!tiers.edge.length) tiers.edge = tiers.mid;
    if (!tiers.back.length) tiers.back = tiers.mid;
    const xs = bed.outline.map(([x]) => x);
    const zs = bed.outline.map(([, z]) => z);
    const box = { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] };
    const area = (box.x[1] - box.x[0]) * (box.z[1] - box.z[0]);
    const seeds = Object.fromEntries(Object.entries(tiers).map(([tier, names]) => [tier, Array.from({ length: Math.max(2, Math.round(area / 7)) }, () => {
      const name = names[Math.floor(random() * names.length)];
      const colors = PLANTS[name]?.colors;
      return {
        x: box.x[0] + random() * (box.x[1] - box.x[0]), z: box.z[0] + random() * (box.z[1] - box.z[0]), name,
        color: colors ? colors[Math.floor(random() * colors.length)] : '#ffffff',
        // Màu tulip trồng xen của mảng này.
        fill: TULIP_COLORS[Math.floor(random() * TULIP_COLORS.length)],
      };
    })]));
    // Luống trước chồng lên luống này thì phần chồng thuộc luống trước (chỉ xét luống có khung giao nhau).
    const earlier = layout.beds.slice(0, index).filter((other) => {
      const ox = other.outline.map(([px]) => px);
      const oz = other.outline.map(([, pz]) => pz);
      return Math.min(...ox) < box.x[1] && Math.max(...ox) > box.x[0] && Math.min(...oz) < box.z[1] && Math.max(...oz) > box.z[0];
    });
    const roomHere = layout.roomFn(box);
    for (let gx = box.x[0]; gx <= box.x[1]; gx += step) {
      for (let gz = box.z[0]; gz <= box.z[1]; gz += step) {
        const x = gx + (random() - 0.5) * step;
        const z = gz + (random() - 0.5) * step;
        const roll = random();
        if (!insidePolygon(x, z, bed.outline) || earlier.some((other) => insidePolygon(x, z, other.outline))) continue;
        const room = roomHere(x, z);
        if (room < 0) continue;
        const depth = Math.min(polylineDistance(x, z, bed.outline, true), room);
        const tier = depth < EDGE_DEPTH ? 'edge' : depth < MID_DEPTH ? 'mid' : 'back';
        let seed = null;
        let best = Infinity;
        for (const candidate of seeds[tier]) {
          const distance = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
          if (distance < best) {
            best = distance;
            seed = candidate;
          }
        }
        const plant = PLANTS[seed.name];
        if (!plant) continue;
        const chance = Math.min(0.95, DENSITY * (step / plant.spacing) ** 2);
        const extra = random();
        const fillChance = seed.name === FILLER.plant || seed.name === 'grass' ? 0 : Math.min(1, (step / FILLER.spacing) ** 2 / (1 - chance));
        if (roll < chance) {
          const color = plant.mixed ? plant.colors[Math.floor(random() * plant.colors.length)] : seed.color;
          plantings[seed.name].push({ x, z, height: plant.height[0] + random() * (plant.height[1] - plant.height[0]), flip: random() < 0.5, color });
        } else if (extra < fillChance) {
          plantings.fill.push({ x, z, height: FILLER.height[0] + random() * (FILLER.height[1] - FILLER.height[0]), flip: random() < 0.5, color: seed.fill });
        } else if (seed.name !== GROUND_COVER.plant && random() < (step / GROUND_COVER.spacing) ** 2 / (1 - chance)) {
          cover.push({ x, z, height: GROUND_COVER.height[0] + random() * (GROUND_COVER.height[1] - GROUND_COVER.height[0]), flip: random() < 0.5, color: '#ffffff' });
        }
      }
    }
  });
  plantings[GROUND_COVER.plant].push(...cover);
  return { layout, plantings };
}

// Nền vườn trên canvas: bãi cỏ cắt sọc trong hàng rào, gốc luống phủ lá (khoét theo lối / quảng trường / hồ),
// lối sỏi có viền đá. Trục: cột ↔ x, hàng ↔ z (hàng 0 = z nhỏ nhất, khớp với texture lật dọc mặc định).
function paintGround(data, layout, gravelImage) {
  const area = data.area;
  const ppm = 24;
  const width = Math.ceil((area.x[1] - area.x[0]) * ppm);
  const height = Math.ceil((area.z[1] - area.z[0]) * ppm);
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const u = (x) => (x - area.x[0]) * ppm;
  const v = (z) => (z - area.z[0]) * ppm;
  const random = seeded(7331);
  const trace = (ctx, points, closed = true) => {
    ctx.beginPath();
    points.forEach(([x, z], index) => (index ? ctx.lineTo(u(x), v(z)) : ctx.moveTo(u(x), v(z))));
    if (closed) ctx.closePath();
  };
  const canvas = make();
  const ctx = canvas.getContext('2d');
  // Bãi cỏ: nền xanh, sọc cắt cỏ chéo, lốm đốm.
  ctx.save();
  trace(ctx, data.outline || []);
  ctx.clip();
  ctx.fillStyle = '#5b9a45';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(0.5);
  for (let stripe = -40; stripe < 40; stripe += 2) {
    ctx.fillStyle = 'rgba(160, 210, 110, 0.13)';
    ctx.fillRect(stripe * 1.6 * ppm, -height * 2, 1.6 * ppm, height * 4);
  }
  ctx.restore();
  for (let spot = 0; spot < 6000; spot += 1) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(40, 90, 30, 0.18)' : 'rgba(150, 200, 100, 0.16)';
    ctx.fillRect(random() * width, random() * height, 2 + random() * 3, 2 + random() * 3);
  }
  ctx.restore();
  // Luống: tô trên canvas riêng rồi khoét lối / quảng trường / hồ / sát rào, ghép lên bãi cỏ.
  const beds = make();
  const bctx = beds.getContext('2d');
  // Gốc cây phủ lá thấp xanh sẫm, lấm tấm đất: nhìn từ xa luống kín như vườn thật, không thành mảng đất nâu.
  bctx.fillStyle = '#34482a';
  for (const bed of layout.beds) {
    trace(bctx, bed.outline);
    bctx.fill();
  }
  bctx.globalCompositeOperation = 'source-atop';
  for (let chip = 0; chip < 26000; chip += 1) {
    const kind = random();
    const tone = Math.floor(random() * 40);
    bctx.fillStyle = kind < 0.18 ? `rgb(${70 + tone}, ${48 + tone}, ${30 + tone / 2})` : kind < 0.6 ? `rgb(${40 + tone}, ${80 + tone}, ${36 + tone / 2})` : `rgb(${30 + tone / 2}, ${58 + tone}, ${28})`;
    bctx.beginPath();
    bctx.ellipse(random() * width, random() * height, 1.5 + random() * 3, 1 + random() * 2, random() * Math.PI, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.globalCompositeOperation = 'destination-out';
  bctx.lineCap = 'round';
  bctx.lineJoin = 'round';
  for (const path of layout.paths) {
    bctx.lineWidth = (path.width + 0.5) * ppm;
    trace(bctx, path.points, false);
    bctx.stroke();
  }
  if (data.plaza) {
    bctx.beginPath();
    bctx.arc(u(data.center.x), v(data.center.z), (data.plaza.radius + 0.35) * ppm, 0, Math.PI * 2);
    bctx.fill();
  }
  if (data.pond) {
    bctx.beginPath();
    bctx.ellipse(u(data.pond.x), v(data.pond.z), (data.pond.rx + 0.6) * ppm, (data.pond.rz + 0.6) * ppm, 0, 0, Math.PI * 2);
    bctx.fill();
  }
  bctx.lineWidth = 1.2 * ppm;
  trace(bctx, data.outline || []);
  bctx.stroke();
  ctx.drawImage(beds, 0, 0);
  // Lối sỏi: viền đá xám sẫm rồi sỏi kem (họa tiết sỏi của sân).
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of layout.paths) {
    ctx.strokeStyle = '#8f877a';
    ctx.lineWidth = (path.width + 0.22) * ppm;
    trace(ctx, path.points, false);
    ctx.stroke();
  }
  const gravel = gravelImage ? ctx.createPattern(gravelImage, 'repeat') : null;
  for (const path of layout.paths) {
    ctx.strokeStyle = gravel || '#ddd0b0';
    ctx.lineWidth = path.width * ppm;
    trace(ctx, path.points, false);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function addFlowerGarden({ root, batch, m, data, lanternGlows }) {
  const center = data.center;
  const random = seeded(20261107);
  const signs = [];
  const lazyLoads = [];
  let assetsActive = false;
  let assetsStarted = false;
  const queueLoad = (load) => lazyLoads.push(load);
  const startLoads = () => {
    if (assetsStarted) return;
    assetsStarted = true;
    Promise.allSettled(lazyLoads.map((load) => load()));
  };
  const mat = {
    hedge: new THREE.MeshStandardMaterial({ color: '#2f6b35', roughness: 0.95, flatShading: true }),
    hedgeTop: new THREE.MeshStandardMaterial({ color: '#3f8240', roughness: 0.95, flatShading: true }),
    plaza: new THREE.MeshStandardMaterial({ color: '#d9cfbd', roughness: 0.85 }),
    blossomPink: new THREE.MeshStandardMaterial({ color: '#f6b3c8', roughness: 0.85, flatShading: true }),
    blossomDeep: new THREE.MeshStandardMaterial({ color: '#ee92b0', roughness: 0.85, flatShading: true }),
    blossomWhite: new THREE.MeshStandardMaterial({ color: '#fbeef2', roughness: 0.85, flatShading: true }),
    roseRed: new THREE.MeshStandardMaterial({ color: '#d61f3c', roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.7 }),
  };
  const area = data.area;
  const layout = flowerLayout(data);

  // ---- Nền: bãi cỏ + luống + lối sỏi trên một texture (chỉ khi có trình duyệt) ----
  if (typeof document !== 'undefined' && data.outline?.length) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(area.x[1] - area.x[0], area.z[1] - area.z[0]),
      new THREE.MeshStandardMaterial({ map: paintGround(data, layout, m.gravel?.map?.image), alphaTest: 0.5, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((area.x[0] + area.x[1]) / 2, 0.01, (area.z[0] + area.z[1]) / 2);
    ground.receiveShadow = true;
    root.add(ground);
  }
  const plazaRadius = data.plaza?.radius || 4.4;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(plazaRadius, 48), mat.plaza);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(center.x, 0.016, center.z);
  plaza.receiveShadow = true;
  root.add(plaza);
  batch.add(new THREE.TorusGeometry(plazaRadius, 0.09, 4, 64), m.stone, { position: [center.x, 0.018, center.z], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });
  batch.add(new THREE.TorusGeometry(plazaRadius * 0.62, 0.05, 4, 48), m.stone, { position: [center.x, 0.018, center.z], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3] });

  // ---- Hàng rào cây xén: khối hai tông ----
  const hedgeHeight = data.hedgeHeight || 0.85;
  for (const [x0, z0, x1, z1] of data.hedge || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const position = [(x0 + x1) / 2, hedgeHeight / 2, (z0 + z1) / 2];
    batch.add(new THREE.BoxGeometry(0.6, hedgeHeight, length + 0.6), mat.hedge, { position, rotation: [0, ry, 0] });
    batch.add(new THREE.BoxGeometry(0.5, 0.12, length + 0.5), mat.hedgeTop, { position: [position[0], hedgeHeight + 0.04, position[2]], rotation: [0, ry, 0] });
  }

  // ---- Hồ súng: mặt nước chung vật liệu hồ sen, bờ đá Meshy, sen / lá súng ----
  if (data.pond && m.lakeWater) {
    const pond = data.pond;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), m.lakeWater);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(pond.rx, pond.rz, 1);
    water.position.set(pond.x, 0.04, pond.z);
    root.add(water);
    const rocks = [];
    const ring = Math.round((pond.rx + pond.rz) * 4);
    for (let index = 0; index < ring; index += 1) {
      const angle = (index / ring) * Math.PI * 2 + random() * 0.15;
      rocks.push({ x: pond.x + Math.cos(angle) * (pond.rx + 0.12), y: -0.04, z: pond.z + Math.sin(angle) * (pond.rz + 0.12), ry: index * 1.9, s: 0.7 + random() * 0.6 });
    }
    const pads = Array.from({ length: pond.lilies || 8 }, (_, index) => {
      const angle = index * 2.39 + 0.4;
      const reach = 0.35 + (index % 3) * 0.22;
      return { x: pond.x + Math.cos(angle) * pond.rx * reach, y: 0.03, z: pond.z + Math.sin(angle) * pond.rz * reach, ry: index * 1.3, s: 0.8 + random() * 0.4 };
    });
    for (const pad of pads) {
      batch.add(new THREE.CircleGeometry(0.22 * pad.s, 12, 0.4, Math.PI * 2 - 0.4), m.lilyPad, { position: [pad.x + 0.25, 0.05, pad.z - 0.15], rotation: [-Math.PI / 2, 0, pad.ry] });
    }
    queueLoad(() => Promise.all([
      instanceProp(root, `${SCENE_MODELS}/rock.glb`, rocks, { size: 0.5 }, { brighten: 0.35 }),
      instanceProp(root, `${SCENE_MODELS}/lotus.glb`, pads.filter((_, index) => index % 2 === 0), { size: 0.55 }),
    ]));
  }

  // Cổng vòm, đình, cây hoa: bản dựng bằng khối nằm trong nhóm riêng, tải ảnh / mô hình Meshy xong thì ẩn nhóm đó.
  const archBatch = new StaticBatch();
  const pavilionBatch = new StaticBatch();
  const treeBatch = new StaticBatch();
  // ---- Cổng vòm hoa hồng leo + biển tên ----
  for (const gate of data.entrances || []) {
    const half = (gate.width || 2.4) / 2;
    const ry = gate.ry || 0;
    for (const side of [-1, 1]) {
      archBatch.add(new THREE.BoxGeometry(0.16, 2.3, 0.16), mat.white, { position: at(gate, side * half, 1.15, 0), rotation: [0, ry, 0] });
      archBatch.add(new THREE.BoxGeometry(0.34, 0.12, 0.34), m.stone, { position: at(gate, side * half, 0.06, 0), rotation: [0, ry, 0] });
    }
    if (gate.arch !== false) {
      archBatch.add(new THREE.TorusGeometry(half, 0.07, 6, 20, Math.PI), mat.white, { position: at(gate, 0, 2.3, 0), rotation: [0, ry, 0] });
      const climb = [];
      for (let step = 0; step <= 14; step += 1) {
        const angle = (step / 14) * Math.PI;
        climb.push([Math.cos(angle) * half, 2.3 + Math.sin(angle) * half]);
      }
      for (const side of [-1, 1]) for (let y = 0.5; y < 2.3; y += 0.32) climb.push([side * half, y]);
      climb.forEach(([lx, y], index) => {
        const jitter = ((index * 37) % 7) / 7 - 0.5;
        archBatch.add(new THREE.IcosahedronGeometry(0.17, 0), m.leaf, { position: at(gate, lx + jitter * 0.08, y, jitter * 0.12), rotation: [index, index * 2, 0] });
        const bloom = index % 3 === 0 ? mat.roseRed : index % 3 === 1 ? m.flowerPink : mat.white;
        archBatch.add(new THREE.IcosahedronGeometry(0.075, 0), bloom, { position: at(gate, lx - jitter * 0.1, y + 0.07, 0.12 * (index % 2 ? 1 : -1)) });
      });
    }
    if (data.sign) signs.push({ text: data.sign, width: Math.max(2.2, half * 2 - 0.1), height: 0.5, position: at(gate, 0, gate.arch === false ? 2.6 : archSize(gate).height + 0.3, 0), ry });
  }

  // ---- Đình bát giác giữa quảng trường (dự phòng bằng khối; bản đẹp là mô hình Meshy) ----
  if (data.pavilion) {
    const radius = data.pavilion.radius || 2.3;
    const height = data.pavilion.height || 2.7;
    pavilionBatch.add(new THREE.CylinderGeometry(radius + 0.55, radius + 0.65, 0.05, 8), m.stone, { position: [center.x, 0.025, center.z], rotation: [0, Math.PI / 8, 0] });
    // Cột: đúng chỗ cột của mô hình (pavilion.posts, đo từ mô hình) nếu scene có, không thì tám cột đều.
    const pillars = data.pavilion.posts || Array.from({ length: 8 }, (_, index) => {
      const angle = ((index + 0.5) / 8) * Math.PI * 2;
      return [center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius];
    });
    pillars.forEach(([x, z], index) => {
      pavilionBatch.add(new THREE.CylinderGeometry(0.11, 0.13, height, 8), m.pillar, { position: [x, height / 2, z] });
      const [nx, nz] = pillars[(index + 1) % pillars.length];
      const length = Math.hypot(nx - x, nz - z);
      pavilionBatch.add(new THREE.BoxGeometry(0.14, 0.2, length + 0.1), m.pillar, { position: [(x + nx) / 2, height - 0.05, (z + nz) / 2], rotation: [0, Math.atan2(nx - x, nz - z), 0] });
    });
    pavilionBatch.add(new THREE.ConeGeometry(radius + 1.05, 1.0, 8), m.roof, { position: [center.x, height + 0.5, center.z], rotation: [0, Math.PI / 8, 0] });
    pavilionBatch.add(new THREE.ConeGeometry(radius * 0.55, 0.9, 8), m.roof, { position: [center.x, height + 1.25, center.z], rotation: [0, Math.PI / 8, 0] });
    pavilionBatch.add(new THREE.SphereGeometry(0.16, 10, 8), m.gold, { position: [center.x, height + 1.78, center.z] });
    pavilionBatch.add(new THREE.SphereGeometry(0.22, 12, 10), m.lantern, { position: [center.x, height - 0.65, center.z], scale: [1, 1.25, 1] });
    lanternGlows?.push(new THREE.Vector3(center.x, height - 0.65, center.z));
  }

  // ---- Đèn vườn dọc lối ----
  for (const lamp of data.lamps || []) {
    batch.add(new THREE.CylinderGeometry(0.05, 0.07, 1.35, 6), m.darkStone, { position: [lamp.x, 0.675, lamp.z] });
    batch.add(new THREE.BoxGeometry(0.2, 0.24, 0.2), m.paper, { position: [lamp.x, 1.47, lamp.z] });
    batch.add(new THREE.ConeGeometry(0.2, 0.16, 4), m.darkStone, { position: [lamp.x, 1.66, lamp.z], rotation: [0, Math.PI / 4, 0] });
    lanternGlows?.push(new THREE.Vector3(lamp.x, 1.47, lamp.z));
  }

  // ---- Cây hoa dự phòng: thân + tán khối màu theo loài ----
  const treeColor = { cherry: mat.blossomPink, frangipani: mat.blossomWhite, apricot: m.gold, crape: mat.blossomDeep };
  for (const tree of data.trees || []) {
    const size = tree.size || 1;
    treeBatch.add(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, 1.9 * size, 7), m.bark, { position: [tree.x, 0.95 * size, tree.z], rotation: [0.06, 0, 0.05] });
    for (let blob = 0; blob < 6; blob += 1) {
      const angle = blob * 1.1 + tree.z;
      const reach = blob === 5 ? 0 : 0.85 * size;
      treeBatch.add(new THREE.IcosahedronGeometry((0.75 + (blob % 3) * 0.15) * size, 1), treeColor[tree.kind] || mat.blossomPink, {
        position: [tree.x + Math.cos(angle) * reach, (2.5 + (blob % 2) * 0.4) * size, tree.z + Math.sin(angle) * reach],
        scale: [1, 0.78, 1],
      });
    }
  }

  const swap = (fallback, name, load) => {
    const group = new THREE.Group();
    group.name = `flower-${name}-fallback`;
    fallback.build(group, { castShadow: true, receiveShadow: true });
    root.add(group);
    queueLoad(() => Promise.all(load()).then((placed) => { if (placed.length && placed.every(Boolean)) group.visible = false; }));
  };
  let fillMesh = null;
  let lowDetail = false;
  const textures = new THREE.TextureLoader();
  const loadTexture = (file) => new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    textures.load(`${MODELS}/${file}.webp`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
  // Cổng vòm: hai tấm ảnh hoa hồng cố định (lệch nhau 0,2 m cho có bề dày), quay theo hướng cổng.
  const archFallback = new THREE.Group();
  archBatch.build(archFallback, { castShadow: true, receiveShadow: true });
  root.add(archFallback);
  const archGates = (data.entrances || []).filter((gate) => gate.arch !== false);
  if (archGates.length) {
    queueLoad(() => loadTexture('arch').then((texture) => {
      if (!texture) return;
      const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
      for (const gate of archGates) {
        const { width, height } = archSize(gate);
        for (const offset of [-0.1, 0.1]) {
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0), material);
          plane.position.set(...at(gate, 0, 0, offset));
          plane.rotation.y = gate.ry || 0;
          plane.castShadow = true;
          root.add(plane);
        }
      }
      archFallback.visible = false;
    }));
  }
  if (data.pavilion) {
    const radius = data.pavilion.radius || 2.3;
    // Mô hình có lan can kín vòng: scene cho hướng xoay (ry), độ hạ (y, mặt bệ sát đất) và nhịp mở làm cửa (door, rail).
    const { ry = Math.PI / 8, y = 0, door, rail } = data.pavilion;
    swap(pavilionBatch, 'pavilion', () => [placeProp(root, `${MODELS}/pavilion.glb`, { x: center.x, y, z: center.z, ry, width: (radius + 1.0) * 2 }, { receiveShadow: false })
      .then((group) => (group && door && rail ? openRail(group, door, rail) : group))]);
  }

  // ---- Billboard: hoa trong luống (tính chỗ trồng lúc tải) và cây hoa ----
  const wind = { uWindTime: { value: 0 } };
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const billboards = (name, texture, items) => {
    const aspect = texture.image.width / texture.image.height;
    const mesh = new THREE.InstancedMesh(quad, spriteMaterial(texture, wind), items.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((item, index) => {
      dummy.position.set(item.x, 0, item.z);
      dummy.rotation.set(0, item.flip ? Math.PI : 0, 0);
      dummy.scale.set(item.height * aspect, item.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(item.color || '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };
  if (data.beds?.length) {
    queueLoad(() => {
      const { plantings } = planFlowers(data);
      const names = Object.keys(plantings).filter((name) => plantings[name].length);
      return Promise.all(names.map((name) => loadTexture(PLANTS[name === 'fill' ? FILLER.plant : name].file).then((texture) => {
        if (!texture) return;
        const mesh = billboards(`flower-sprites-${name}`, texture, plantings[name]);
        if (name === 'fill') {
          fillMesh = mesh;
          mesh.visible = !lowDetail;
        }
      })));
    });
  }
  const treeFallback = new THREE.Group();
  treeBatch.build(treeFallback, { castShadow: true, receiveShadow: true });
  root.add(treeFallback);
  const treeKinds = [...new Set((data.trees || []).map((tree) => (TREES[tree.kind] ? tree.kind : 'cherry')))];
  if (treeKinds.length) {
    queueLoad(() => Promise.all(treeKinds.map((kind) => loadTexture(TREES[kind].file).then((texture) => {
      if (!texture) return false;
      const items = data.trees.filter((tree) => (TREES[tree.kind] ? tree.kind : 'cherry') === kind)
        .map((tree, index) => ({ x: tree.x, z: tree.z, height: TREES[kind].height * (tree.size || 1), flip: index % 2 === 1 }));
      billboards(`flower-trees-${kind}`, texture, items);
      return true;
    }))).then((loaded) => { if (loaded.every(Boolean)) treeFallback.visible = false; }));
  }

  // ---- Bướm: hai cánh trên một mặt phẳng, vỗ cánh bằng cách co giãn bề ngang; bay vòng lượn trên các luống ----
  const centers = (data.bedCenters || []).filter(Boolean);
  const butterflyCount = Math.min(60, data.butterflies ?? 20);
  let butterflyMesh = null;
  const butterflies = [];
  if (butterflyCount > 0 && centers.length) {
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
      const spot = centers[index % centers.length];
      butterflies.push({
        cx: spot.x + (random() - 0.5) * 2,
        cz: spot.z + (random() - 0.5) * 2,
        ax: 0.8 + random() * 1.8,
        az: 0.8 + random() * 1.8,
        y: 0.8 + random() * 0.9,
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
  const loadReach = Number(data.lazyDistance) || 36;
  const middle = { x: (area.x[0] + area.x[1]) / 2, z: (area.z[0] + area.z[1]) / 2 };

  return {
    signs,
    activate() {
      assetsActive = true;
    },
    // Máy yếu: bỏ lớp tulip trồng xen (giảm số ảnh hoa phải vẽ chồng lên nhau).
    setLowDetail(on) {
      lowDetail = Boolean(on);
      if (fillMesh) fillMesh.visible = !lowDetail;
    },
    update(dt, time, camera) {
      wind.uWindTime.value = time / 1_000;
      const distance = camera ? Math.hypot(camera.position.x - middle.x, camera.position.z - middle.z) : 0;
      if (assetsActive && distance < loadReach) startLoads();
      if (!butterflyMesh) return;
      const near = !camera || distance < reach;
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
