// Sân ngoài chùa (chế độ 3D): nền đá lát ô lớn, mặt tiền chánh điện mở cửa (cột son, mái ngói, hoành phi), lư
// hương đồng lớn trên bệ đá với khói, đèn đá hai bên lối, cây đa, tùng, bụi cây, tường gạch thấp có đèn lồng, cổng
// tam quan, bảng vàng công đức, bầu trời và núi xa có sương. Nắng chỉ bật khi camera ở ngoài sân (trong điện giữ ánh
// sáng ấm trầm), có bóng đổ. Bố cục lấy từ scene JSON (world.courtyard), không chứa toạ độ riêng của phòng nào.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch } from './temple3d-models.mjs';
import { buildAnimals } from './animals3d.mjs';
import { addPlayground, loadParkModel, loadStaticModel, playgroundMaterials } from './park3d.mjs';
import { addFlowerGarden, spriteMaterial } from './flowers3d.mjs';
import { createWaterMaterial } from './water3d.mjs';
import { instanceProp, openRail, placeProp } from './props3d.mjs';
import { createLandscape } from './landscape3d.mjs';
import { seeded } from './landscape/common.mjs';
import { daylightGrade, GLOW_ORDER, SKY_LIGHTS_ORDER, VEIL_ORDER } from './daylight3d.mjs';

const SCENE_MODELS = '/models/scene';
const NIGHT_LIGHT_COUNT = 5;

// Chọn vài đèn cách xa nhau thay vì biến mọi sprite đèn thành PointLight. Năm nguồn sáng không đổ bóng đủ tạo những
// vùng vàng ấm ở các khu khác nhau mà không nhân shadow pass hay làm shader ngoài sân quá nặng trên điện thoại.
function spreadLightSites(points, count = NIGHT_LIGHT_COUNT) {
  const pool = points.filter((point, index) => points.findIndex((other) => other.distanceToSquared(point) < 0.01) === index);
  if (pool.length <= count) return pool;
  const center = pool.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / pool.length);
  const chosen = [pool.reduce((best, point) => (point.distanceToSquared(center) < best.distanceToSquared(center) ? point : best))];
  while (chosen.length < count) {
    let next = null;
    let bestDistance = -1;
    for (const point of pool) {
      if (chosen.includes(point)) continue;
      const distance = Math.min(...chosen.map((item) => item.distanceToSquared(point)));
      if (distance > bestDistance) {
        bestDistance = distance;
        next = point;
      }
    }
    if (!next) break;
    chosen.push(next);
  }
  return chosen;
}

const areaCenter = (area) => area ? [(area.x[0] + area.x[1]) / 2, (area.z[0] + area.z[1]) / 2] : null;
const pointsCenter = (points) => points?.length ? [
  points.reduce((sum, point) => sum + point.x, 0) / points.length,
  points.reduce((sum, point) => sum + point.z, 0) / points.length,
] : null;

// Mỗi khu chức năng có một cụm đèn lễ hội riêng. Đây là điểm treo đèn (không phải vật cản), lấy hoàn toàn từ scene
// JSON để bố cục khác vẫn tự tìm đúng trung tâm khu thay vì nhét tọa độ phòng vào engine.
function courtyardLightSites(data, fallback) {
  const sites = [];
  const fromObject = (point) => point ? [point.x, point.z] : null;
  const add = (point, y = 3.15) => {
    if (!point?.every(Number.isFinite)) return;
    const site = new THREE.Vector3(point[0], y, point[1]);
    if (!sites.some((other) => other.distanceToSquared(site) < 4)) sites.push(site);
  };
  add([0, 38]); // sân chánh điện / lối công việc chung
  add(data.flowerGarden?.center ? [data.flowerGarden.center.x, data.flowerGarden.center.z] : null);
  for (const entrance of data.flowerGarden?.entrances || []) add(fromObject(entrance));
  add(data.guanyin ? [data.guanyin.x, data.guanyin.z] : null);
  add(data.park ? areaCenter(data.park.area) : null);
  add(fromObject(data.park?.signPost));
  add(pointsCenter(data.garden?.plots));
  add(fromObject(data.garden?.entrance));
  add(data.petZone ? areaCenter(data.petZone.area) : null);
  add(fromObject(data.petZone?.entrance));
  add(data.farmZone ? areaCenter(data.farmZone.area) : null);
  add(fromObject(data.farmZone?.entrance));
  add(pointsCenter(data.memorial?.graves));
  add(fromObject(data.memorial?.entrance));
  add(data.pond ? [data.pond.x, data.pond.z] : null);
  add(data.bodhi ? [data.bodhi.x, data.bodhi.z] : null);
  add(data.overlook?.terrace ? areaCenter(data.overlook.terrace) : null);
  if (data.overlook?.path) add([(data.overlook.path.x[0] + data.overlook.path.x[1]) / 2, data.overlook.path.z[0] + 2]);
  add(data.grove?.pavilion ? [data.grove.pavilion.x, data.grove.pavilion.z] : null);
  add(fromObject(data.grove?.gate));
  return sites.length ? sites : spreadLightSites(fallback, NIGHT_LIGHT_COUNT);
}

// Cụm lau sậy quanh bờ hồ: thân xanh mảnh và bông nâu (bông lau), gộp vào batch. center: tâm hồ; rx, rz: bán kính
// elip mép nước; angles: góc các cụm; y: mặt nước.
function addReeds(batch, m, { x, z, rx, rz, angles, y = 0, scale = 1, count = 9 }) {
  angles.forEach((angle, cluster) => {
    for (let index = 0; index < count; index += 1) {
      const spread = ((index * 37 + cluster * 11) % 9) / 9 - 0.5;
      const inset = (0.25 + ((index * 53) % 5) * 0.08) * scale;
      const a = angle + spread * 0.12;
      const px = x + Math.cos(a) * (rx - inset);
      const pz = z + Math.sin(a) * (rz - inset);
      const height = (0.7 + ((index * 29 + cluster) % 7) * 0.1) * scale;
      const lean = spread * 0.25;
      batch.add(new THREE.CylinderGeometry(0.012, 0.018, height, 4), m.reed, { position: [px, y + height / 2, pz], rotation: [lean, 0, -lean] });
      if (index % 2 === 0) batch.add(new THREE.CapsuleGeometry(0.03, 0.14, 2, 6), m.cattail, { position: [px - lean * height * 0.5, y + height * 0.92, pz + lean * height * 0.5] });
    }
  });
}
import { hallLayout } from './temple3d-models.mjs';

const MAX_SMOKE = 12;
const GRASS_ASSETS = Object.freeze({
  all: {
    color: '/models/ground/grass-all.base.567ae6b1.webp',
    normal: '/models/ground/grass-all.normal.ddc960a5.webp',
    roughness: '/models/ground/grass-all.roughness.3c775481.webp',
    // Mẫu gốc rộng gần 1,9 m: UV của mặt đất dùng mét nên lặp khoảng nửa lần trên mỗi mét.
    repeat: [0.53, 0.53],
  },
  pets: {
    color: '/models/ground/grass-pets.base.9aa7b911.webp',
    normal: '/models/ground/grass-pets.normal.bde06beb.webp',
    roughness: '/models/ground/grass-pets.roughness.54db9e46.webp',
    // Mẫu khu thú cưng là hình chữ nhật 1,9 × 0,92 m.
    repeat: [0.53, 1.09],
  },
});

function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  texture.anisotropy = 4;
  return texture;
}

// Đá lát ô vuông 1,5 m: mỗi ô một sắc xám hơi khác, mạch vữa sẫm, vài vết loang.
function stoneTiles(repeat) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5d5f63';
    ctx.fillRect(0, 0, w, h);
    const cells = 4;
    const size = w / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const shade = 112 + ((row * 7 + column * 13) % 9) * 5;
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
        ctx.fillRect(column * size + 3, row * size + 3, size - 6, size - 6);
        for (let spot = 0; spot < 14; spot += 1) {
          ctx.fillStyle = `rgba(${spot % 2 ? 255 : 0}, ${spot % 2 ? 255 : 0}, ${spot % 2 ? 255 : 0}, 0.035)`;
          ctx.beginPath();
          ctx.arc(column * size + ((spot * 53) % size), row * size + ((spot * 97) % size), 6 + (spot % 5) * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, repeat);
}

// Hai GLB người dùng cung cấp có tới hơn hai triệu đỉnh chỉ cho một ô cỏ. Lấy bộ màu/pháp tuyến/độ nhám đã tối ưu
// từ chính GLB rồi lặp theo UV mét giúp giữ đúng vẻ cỏ mà không làm điện thoại phải tải và dựng hàng chục MB mesh.
function grassMaterial(kind, renderer) {
  const asset = GRASS_ASSETS[kind];
  const loader = new THREE.TextureLoader();
  const texture = (src, color = false) => {
    const map = loader.load(src);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...asset.repeat);
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return map;
  };
  return new THREE.MeshStandardMaterial({
    map: texture(asset.color, true),
    normalMap: texture(asset.normal),
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: texture(asset.roughness),
    roughness: 1,
    metalness: 0,
  });
}

// Mặt phẳng ngang (hình chữ nhật, có thể khoét lỗ elip cho hồ) với UV tính bằng mét.
function groundShape(rect, holes = [], y = 0) {
  const shape = new THREE.Shape();
  // Toạ độ hình: (x, -z) vì sau khi xoay -90° quanh x, trục y của hình thành -z của thế giới.
  shape.moveTo(rect.x[0], -rect.z[1]);
  shape.lineTo(rect.x[1], -rect.z[1]);
  shape.lineTo(rect.x[1], -rect.z[0]);
  shape.lineTo(rect.x[0], -rect.z[0]);
  shape.lineTo(rect.x[0], -rect.z[1]);
  for (const hole of holes) {
    const path = new THREE.Path();
    path.absellipse(hole.x, -hole.z, hole.rx, hole.rz, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const geometry = new THREE.ShapeGeometry(shape, 48);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

// Đài ngắm cảnh: mặt lối đá + mặt đài bát giác (gạch lát theo mét như lối trong sân), bó vỉa hai bên lối, lan can đá
// (trụ + tay vịn + chân) quanh đài, chừa chỗ lối vào.
function buildOverlook(batch, root, m, { path, terrace }) {
  const tiles = stoneTiles([1, 1]);
  tiles.repeat.set(1 / 6, 1 / 6);
  const material = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.92 });
  const slab = new THREE.Mesh(groundShape(path, [], 0.1), material);
  slab.receiveShadow = true;
  root.add(slab);
  const length = path.z[1] - path.z[0];
  for (const x of [path.x[0] - 0.18, path.x[1] + 0.18]) {
    batch.add(new THREE.BoxGeometry(0.36, 0.3, length), m.stone, { position: [x, 0.15, (path.z[0] + path.z[1]) / 2] });
  }
  const { x: [x0, x1], z: [z0, z1], cut } = terrace;
  const corners = [[x0 + cut, z0], [x1 - cut, z0], [x1, z0 + cut], [x1, z1 - cut], [x1 - cut, z1], [x0 + cut, z1], [x0, z1 - cut], [x0, z0 + cut]];
  const shape = new THREE.Shape();
  corners.forEach(([x, z], index) => (index ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.lineTo(corners[0][0], -corners[0][1]);
  const deck = new THREE.ShapeGeometry(shape);
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, 0.11, 0);
  const deckMesh = new THREE.Mesh(deck, material);
  deckMesh.receiveShadow = true;
  root.add(deckMesh);
  // Lan can: theo từng cạnh, trụ cách ~2,4 m, tay vịn + chân; cạnh gần chùa chừa lối vào bằng bề rộng lối đá.
  const rail = (ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const span = Math.hypot(dx, dz);
    if (span < 0.3) return;
    const angle = Math.atan2(-dz, dx);
    const mid = [(ax + bx) / 2, (az + bz) / 2];
    batch.add(new THREE.BoxGeometry(span, 0.3, 0.42), m.stone, { position: [mid[0], 0.15, mid[1]], rotation: [0, angle, 0] });
    batch.add(new THREE.BoxGeometry(span, 0.12, 0.3), m.stone, { position: [mid[0], 0.95, mid[1]], rotation: [0, angle, 0] });
    const posts = Math.max(1, Math.round(span / 2.4));
    for (let index = 0; index <= posts; index += 1) {
      const t = index / posts;
      batch.add(new THREE.BoxGeometry(0.32, 1.05, 0.32), m.stone, { position: [ax + dx * t, 0.52, az + dz * t] });
    }
  };
  corners.forEach(([ax, az], index) => {
    const [bx, bz] = corners[(index + 1) % corners.length];
    if (index === 0) {
      // Cạnh gần chùa (z0): hai đoạn hai bên lối vào.
      rail(ax, az, path.x[0] - 0.2, az);
      rail(path.x[1] + 0.2, az, bx, bz);
      return;
    }
    rail(ax, az, bx, bz);
  });
}

// Rừng thiền: cổng gỗ trên tường sân, lối đá vào, vòng lối đá quanh hồ (elip có lỗ), mặt hồ + bờ đá + sen, bến gỗ
// sát mặt nước ra thủy đình bát giác giữa hồ. Mặt lối / bến sát đất (nhân vật đứng cao độ 0).
function buildGrove(batch, root, m, { area, gate, entry, pond, loop, pier, pavilion }) {
  // Thảm nền: cùng vật liệu cỏ của sân trong tường (landscape đổi theo vùng: cỏ, thảm lá, tuyết, cát…) để rừng không nằm
  // trên ruộng lúa / luống lúa mì của đất ngoài tường. Hình vuông bo góc mép lượn, cạnh đông thẳng sát chân tường.
  const floor = new THREE.Shape();
  const cx = (area.x[0] + gate.x) / 2;
  const cz = (area.z[0] + area.z[1]) / 2;
  const hx = (gate.x - area.x[0]) / 2 + 0.6;
  const hz = (area.z[1] - area.z[0]) / 2;
  const curve = (value) => Math.sign(value) * Math.abs(value) ** 0.4;
  for (let index = 0; index <= 160; index += 1) {
    const angle = (index / 160) * Math.PI * 2;
    const wobble = 1 + (0.6 * Math.sin(angle * 7 + 1.3) + 0.35 * Math.sin(angle * 13 + 0.4)) / 24;
    const px = Math.min(gate.x, cx + hx * wobble * curve(Math.cos(angle)));
    const pz = cz + hz * wobble * curve(Math.sin(angle));
    if (index) floor.lineTo(px, -pz);
    else floor.moveTo(px, -pz);
  }
  const floorGeometry = new THREE.ShapeGeometry(floor);
  floorGeometry.rotateX(-Math.PI / 2);
  floorGeometry.translate(0, 0.008, 0);
  const floorMesh = new THREE.Mesh(floorGeometry, m.grass);
  floorMesh.receiveShadow = true;
  root.add(floorMesh);
  const tiles = stoneTiles([1, 1]);
  tiles.repeat.set(1 / 6, 1 / 6);
  const stone = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.92 });
  const entryMesh = new THREE.Mesh(groundShape(entry, [], 0.02), stone);
  entryMesh.receiveShadow = true;
  root.add(entryMesh);
  const ring = new THREE.Shape();
  ring.absellipse(loop.x, -loop.z, loop.rx + loop.width / 2, loop.rz + loop.width / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absellipse(loop.x, -loop.z, loop.rx - loop.width / 2, loop.rz - loop.width / 2, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const ringGeometry = new THREE.ShapeGeometry(ring, 64);
  ringGeometry.rotateX(-Math.PI / 2);
  ringGeometry.translate(0, 0.021, 0);
  const ringMesh = new THREE.Mesh(ringGeometry, stone);
  ringMesh.receiveShadow = true;
  root.add(ringMesh);
  // Mặt hồ dùng chung vật liệu nước của hồ lớn (water3d: giữa thẫm mép nhạt, gợn sáng, viền bọt). Đá bờ và sen là mô
  // hình Meshy có sẵn của Hồ Sen; chưa tải / tải lỗi thì hiện đá, lá sen dựng bằng khối (nhóm dự phòng riêng).
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), m.lakeWater);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(pond.rx + 0.15, pond.rz + 0.15, 1);
  water.position.set(pond.x, 0.04, pond.z);
  water.renderOrder = 2;
  root.add(water);
  const fallback = (source, name) => {
    const group = new THREE.Group();
    group.name = name;
    source.build(group, { castShadow: true, receiveShadow: true });
    root.add(group);
    return group;
  };
  const rimBatch = new StaticBatch();
  const lotusBatch = new StaticBatch();
  const pad = new THREE.MeshStandardMaterial({ color: '#4f8a3f', roughness: 0.8 });
  const bloom = new THREE.MeshStandardMaterial({ color: '#f2a0b8', roughness: 0.7 });
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rocks = [];
  const rimCount = Math.round((Math.PI * (pond.rx + pond.rz)) / 1.1);
  for (let index = 0; index < rimCount; index += 1) {
    const angle = (index / rimCount) * Math.PI * 2;
    const px = pond.x + Math.cos(angle) * (pond.rx + 0.3);
    const pz = pond.z + Math.sin(angle) * (pond.rz + 0.3);
    // Chừa chỗ bến gỗ đi qua bờ.
    if (Math.abs(px - pier.x) < pier.width / 2 + 0.3 && pz < pond.z) continue;
    const r = 0.45 + rand() * 0.35;
    rimBatch.add(new THREE.DodecahedronGeometry(r, 0), m.stone, { position: [px, r * 0.25, pz], rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.6, 1.1] });
    rocks.push({ x: px, y: -0.08, z: pz, ry: index * 2.3, s: 0.8 + rand() * 0.6 });
  }
  const lotusItems = [];
  for (let index = 0; index < 26; index += 1) {
    const angle = rand() * Math.PI * 2;
    const reach = 0.35 + rand() * 0.55;
    const px = pond.x + Math.cos(angle) * pond.rx * reach;
    const pz = pond.z + Math.sin(angle) * pond.rz * reach;
    if (Math.abs(px - pier.x) < pier.width / 2 + 0.6 && pz < pond.z) continue;
    if (Math.hypot(px - pavilion.x, pz - pavilion.z) < pavilion.radius + 1.4) continue;
    lotusBatch.add(new THREE.CylinderGeometry(0.42 + rand() * 0.2, 0.42, 0.02, 10), pad, { position: [px, 0.05, pz] });
    if (index % 4 === 0) lotusBatch.add(new THREE.ConeGeometry(0.16, 0.28, 6), bloom, { position: [px + 0.1, 0.2, pz] });
    lotusItems.push({ x: px, y: 0.02, z: pz, ry: index * 1.3, s: 0.8 + rand() * 0.4 });
  }
  const rimFallback = fallback(rimBatch, 'grove-rocks-fallback');
  const lotusFallback = fallback(lotusBatch, 'grove-lotus-fallback');
  instanceProp(root, `${SCENE_MODELS}/rock.glb`, rocks, { size: 0.85 }, { brighten: 0.35 }).then((group) => { if (group) rimFallback.visible = false; });
  instanceProp(root, `${SCENE_MODELS}/lotus.glb`, lotusItems, { width: 0.95 }).then((group) => { if (group) lotusFallback.visible = false; });
  // Bến gỗ: ván sát mặt nước, cọc hai bên.
  const deckLength = pier.z[1] - pier.z[0];
  batch.add(new THREE.BoxGeometry(pier.width, 0.06, deckLength), m.wood, { position: [pier.x, 0.04, (pier.z[0] + pier.z[1]) / 2] });
  for (let z = pier.z[0] + 0.6; z < pier.z[1]; z += 2) {
    for (const side of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), m.wood, { position: [pier.x + side * (pier.width / 2 + 0.05), 0.3, z] });
  }
  // Thủy đình: đình Meshy của Vườn Hoa cùng cỡ (bề ngang (radius + 1) × 2), xoay pavilion.ry cho cửa vào quay về bến,
  // hạ pavilion.y cho mặt bệ ngang mặt nước. Cột (pavilion.posts, đo từ mô hình) khớp vật cản trong scene. Chưa tải /
  // tải lỗi thì hiện đình dựng bằng khối có cột đúng các chỗ đó.
  const r = pavilion.radius;
  const pavilionBatch = new StaticBatch();
  pavilionBatch.add(new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.08, 9), m.wood, { position: [pavilion.x, 0.03, pavilion.z] });
  for (const [x, z] of pavilion.posts || []) pavilionBatch.add(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8), m.pillar, { position: [x, 1.3, z] });
  pavilionBatch.add(new THREE.CylinderGeometry(r + 0.45, r + 0.5, 0.2, 9), m.wood, { position: [pavilion.x, 2.65, pavilion.z] });
  pavilionBatch.add(new THREE.ConeGeometry((r + 0.5) * 1.35, 1.6, 9), m.roof, { position: [pavilion.x, 3.55, pavilion.z] });
  pavilionBatch.add(new THREE.SphereGeometry(0.16, 8, 6), m.gold, { position: [pavilion.x, 4.4, pavilion.z] });
  const pavilionFallback = fallback(pavilionBatch, 'grove-pavilion-fallback');
  placeProp(root, '/models/flowers/pavilion.glb', { x: pavilion.x, y: pavilion.y || 0, z: pavilion.z, ry: pavilion.ry || 0, width: (r + 1) * 2 }, { receiveShadow: false })
    .then((group) => {
      if (!group) return;
      if (pavilion.door && pavilion.rail) openRail(group, pavilion.door, pavilion.rail);
      pavilionFallback.visible = false;
    });
  // Cổng gỗ trên tường sân: hai cột, xà đôi, mái nhỏ hai mái.
  const gx = gate.x + 0.2;
  for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.42, 3.2, 0.42), m.pillar, { position: [gx, 1.6, gate.z + side * (gate.width / 2 + 0.15)] });
  batch.add(new THREE.BoxGeometry(0.36, 0.3, gate.width + 1.2), m.wood, { position: [gx, 3.0, gate.z] });
  batch.add(new THREE.BoxGeometry(0.3, 0.22, gate.width + 0.6), m.wood, { position: [gx, 2.55, gate.z] });
  for (const side of [-1, 1]) {
    const slope = new THREE.BoxGeometry(1.2, 0.12, gate.width + 1.8);
    slope.rotateZ(-side * 0.5);
    batch.add(slope, m.roof, { position: [gx + side * 0.5, 3.4, gate.z] });
  }
}

// Hình cá chép (koi) nhỏ: thân thoi, đuôi xoè, hai vây; đầu hướng +z. Một geometry cho InstancedMesh.
function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(0.075, 0.055, 0.24);
  const tail = new THREE.ConeGeometry(0.09, 0.16, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.25, 1);
  tail.translate(0, 0, -0.3);
  const fins = [-1, 1].map((side) => {
    const fin = new THREE.ConeGeometry(0.04, 0.1, 3);
    fin.rotateZ(side * Math.PI / 2);
    fin.scale(1, 0.2, 1);
    fin.translate(side * 0.1, -0.01, 0.05);
    return fin;
  });
  const merged = BufferGeometryUtils.mergeGeometries([body, tail, ...fins].map((item) => {
    const plain = item.index ? item.toNonIndexed() : item;
    for (const name of Object.keys(plain.attributes)) if (!['position', 'normal'].includes(name)) plain.deleteAttribute(name);
    return plain;
  }));
  return merged;
}

function sunDirection(data) {
  const value = data.sun?.direction;
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? value : [10, 18, 16];
}

// Bóng tĩnh nướng vào một texture trong suốt: điện thoại vẫn thấy cột, đèn, cây, lư hương và cổng có bóng mà
// không cần vẽ lại toàn bộ cảnh vào shadow map. Tất cả vị trí lấy từ world.courtyard.
function bakedCourtyardShadows(data) {
  const { ground } = data;
  return canvasTexture(1024, 768, (ctx, width, height) => {
    const unitX = width / (ground.x[1] - ground.x[0]);
    const unitZ = height / (ground.z[1] - ground.z[0]);
    const unit = (unitX + unitZ) / 2;
    const [sunX, sunY, sunZ] = sunDirection(data);
    const point = (x, z) => ({ x: (x - ground.x[0]) * unitX, y: (ground.z[1] - z) * unitZ });
    const offset = (objectHeight) => ({ x: (-sunX / Math.max(1, sunY)) * objectHeight, z: (-sunZ / Math.max(1, sunY)) * objectHeight });
    const color = (opacity) => `rgba(17, 24, 20, ${opacity})`;

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.filter = 'blur(7px)';
    const pole = (x, z, objectHeight, radius, opacity = 0.36) => {
      const projected = offset(objectHeight);
      const from = point(x, z);
      const to = point(x + projected.x, z + projected.z);
      ctx.strokeStyle = color(opacity);
      ctx.lineWidth = Math.max(5, radius * 2 * unit);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };
    const segment = (x0, z0, x1, z1, objectHeight, thickness, opacity = 0.26) => {
      const projected = offset(objectHeight);
      const points = [point(x0, z0), point(x1, z1), point(x1 + projected.x, z1 + projected.z), point(x0 + projected.x, z0 + projected.z)];
      ctx.fillStyle = color(opacity);
      ctx.strokeStyle = color(opacity);
      ctx.lineWidth = Math.max(3, thickness * unit);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const item of points.slice(1)) ctx.lineTo(item.x, item.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    const frontZ = ground.z[0];
    const facade = data.facade || { width: 13.6, height: 10.9 };
    segment(-facade.width / 2, frontZ, facade.width / 2, frontZ, facade.height, 0.45, 0.24);
    for (const [x, z] of data.porchPillars || []) pole(x, z, 5.5, 0.3, 0.4);
    pole(data.burner.x, data.burner.z, 2.8, 0.75, 0.46);
    for (const [x, z] of data.lanterns || []) pole(x, z, 1.8, 0.28, 0.42);
    for (const tree of data.trees || []) pole(tree.x, tree.z, 5.5 * (tree.size || 1), 1.45 * (tree.size || 1), 0.42);
    for (const [x, z] of data.pines || []) pole(x, z, 4.2, 0.8, 0.36);
    for (const [x, z] of data.bushes || []) pole(x, z, 0.9, 0.65, 0.16);
    for (const item of data.instruments || []) pole(item.x, item.z, 2.5 * (item.scale || 1), 0.72 * (item.scale || 1), 0.4);
    for (const item of data.arhats || []) pole(item.x, item.z, 1.7 * (item.scale || 1), 0.55 * (item.scale || 1), 0.26);
    for (const item of data.planters || []) pole(item.x, item.z, 1.25, 0.42, 0.22);
    // Xích đu / cầu tuột nằm trong mô hình khu vui chơi (bóng thật của mesh), không nướng bóng ghế.
    for (const item of data.benches || []) if (!item.kind) pole(item.x, item.z, 1.25 * (item.scale || 1), 1.05 * (item.scale || 1), 0.2);
    // Cây công trình đổi kích thước theo tiến độ nên dùng bóng thật của mesh, không nướng bóng cây hoàn chỉnh từ đầu.
    if (data.bodhi && !data.bodhi.projectId) pole(data.bodhi.x, data.bodhi.z, 7.5 * (data.bodhi.size || 1), 2.2 * (data.bodhi.size || 1), 0.42);
    if (data.guanyin) pole(data.guanyin.x, data.guanyin.z, 4.1 * (data.guanyin.scale || 1), 1.2 * (data.guanyin.scale || 1), 0.38);
    if (data.fountain) pole(data.fountain.x, data.fountain.z, 2.2, data.fountain.radius || 2.6, 0.18);
    for (const tree of data.flowerGarden?.trees || []) pole(tree.x, tree.z, 3.2 * (tree.size || 1), 1.3 * (tree.size || 1), 0.3);
    if (data.flowerGarden?.pavilion) pole(data.flowerGarden.center.x, data.flowerGarden.center.z, 3.6, data.flowerGarden.pavilion.radius + 0.9, 0.22);
    const wallX = ground.x[1] - 0.2;
    for (const side of [-1, 1]) segment(side * wallX, frontZ, side * wallX, ground.z[1], 1.5, 0.4, 0.18);
    if (data.gate) {
      const boundaries = new Set();
      for (const opening of data.gate.openings || [{ x: -2.4, width: 1.6 }, { x: 0, width: 3.2 }, { x: 2.4, width: 1.6 }]) {
        boundaries.add(opening.x - opening.width / 2);
        boundaries.add(opening.x + opening.width / 2);
      }
      for (const x of boundaries) pole(x, data.gate.z, 4.9, 0.32, 0.3);
      segment(-3.8, data.gate.z, 3.8, data.gate.z, 5.1, 0.5, 0.2);
    }
    if (data.board) {
      pole(data.board.x - 0.85, data.board.z, 2.2, 0.09, 0.2);
      pole(data.board.x + 0.85, data.board.z, 2.2, 0.09, 0.2);
    }
    ctx.filter = 'none';
  });
}

function groundPlane(ground, y) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ground.x[0], y, ground.z[0], ground.x[1], y, ground.z[0],
    ground.x[1], y, ground.z[1], ground.x[0], y, ground.z[1],
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function bricks(repeat) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6f2a1c';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row += 1) {
      for (let column = -1; column < 5; column += 1) {
        const x = column * 64 + (row % 2) * 32;
        ctx.fillStyle = `rgb(${150 + ((row * 3 + column) % 4) * 8}, ${62 + (column % 3) * 4}, 44)`;
        ctx.fillRect(x + 2, row * 16 + 2, 60, 12);
      }
    }
  }, repeat);
}

function textBoard(text, { width = 1024, height = 256, background = '#7a1414', color = '#f3c969', border = '#d9a441' } = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(h * 0.42)}px "Noto Serif", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4, w - 60);
  });
}

function softDot(color) {
  return canvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function lathe(points, segments = 28) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

// Đại hồng chung và trống hai bên thềm. Vị trí nằm trong scene JSON; hình khối dùng chung batch để không tăng
// draw call theo từng bộ phận.
function addInstrument(batch, m, item) {
  const size = item.scale || 1;
  const { x, z } = item;
  const woodPost = (postZ) => {
    batch.add(new THREE.BoxGeometry(0.2 * size, 2.2 * size, 0.2 * size), m.wood, {
      position: [x, 1.1 * size, z + postZ * size],
    });
    batch.add(new THREE.BoxGeometry(0.38 * size, 0.12 * size, 0.38 * size), m.darkStone, {
      position: [x, 0.06 * size, z + postZ * size],
    });
  };
  woodPost(-0.68);
  woodPost(0.68);
  batch.add(new THREE.BoxGeometry(0.24 * size, 0.2 * size, 1.7 * size), m.wood, {
    position: [x, 2.18 * size, z],
  });
  for (const postZ of [-0.68, 0.68]) {
    batch.add(new THREE.ConeGeometry(0.2 * size, 0.34 * size, 4), m.gold, {
      position: [x, 2.44 * size, z + postZ * size], rotation: [0, Math.PI / 4, 0],
    });
  }
  if (item.type === 'bell') {
    batch.add(new THREE.CylinderGeometry(0.035 * size, 0.035 * size, 0.48 * size, 8), m.gold, {
      position: [x, 1.92 * size, z],
    });
    batch.add(new THREE.ConeGeometry(0.43 * size, 0.82 * size, 20, 1, true), m.bronze, {
      position: [x, 1.34 * size, z],
    });
    batch.add(new THREE.TorusGeometry(0.43 * size, 0.045 * size, 8, 24), m.gold, {
      position: [x, 0.93 * size, z], rotation: [Math.PI / 2, 0, 0],
    });
    batch.add(new THREE.SphereGeometry(0.1 * size, 10, 8), m.bronze, {
      position: [x, 0.8 * size, z],
    });
    return;
  }
  if (item.type === 'drum') {
    batch.add(new THREE.CylinderGeometry(0.56 * size, 0.56 * size, 0.86 * size, 24), m.pillar, {
      position: [x, 1.28 * size, z], rotation: [0, 0, Math.PI / 2],
    });
    for (const side of [-1, 1]) {
      batch.add(new THREE.TorusGeometry(0.56 * size, 0.045 * size, 8, 24), m.gold, {
        position: [x + side * 0.44 * size, 1.28 * size, z], rotation: [0, Math.PI / 2, 0],
      });
    }
    for (let stud = 0; stud < 12; stud += 1) {
      const angle = (stud / 12) * Math.PI * 2;
      batch.add(new THREE.SphereGeometry(0.035 * size, 6, 5), m.gold, {
        position: [x - 0.45 * size, (1.28 + Math.sin(angle) * 0.47) * size, z + Math.cos(angle) * 0.47 * size],
      });
    }
  }
}

function localTransform(item, local, size = item.scale || 1) {
  const ry = item.ry || 0;
  const [lx, ly, lz] = local;
  return [
    item.x + (lx * Math.cos(ry) + lz * Math.sin(ry)) * size,
    ly * size,
    item.z + (-lx * Math.sin(ry) + lz * Math.cos(ry)) * size,
  ];
}

// Mặt tượng La Hán: mắt khép, chân mày rậm, miệng mỉm (mỗi vị dùng chung, khác nhau ở tư thế và vật cầm).
function arhatFaceTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(60, 40, 22, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.moveTo(x - 26, 98);
      ctx.quadraticCurveTo(x, 84, x + 26, 98);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.arc(x, 112, 16, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(128, 160, 22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  });
}

// Tượng La Hán ngồi kiết già trên bệ đá: thân áo liền một khối, chân xếp bằng, đầu có tai dài và mặt; mỗi vị một
// tư thế / vật cầm (bình bát, tràng hạt, tích trượng, cuốn kinh, tay bắt ấn) theo thứ tự trong scene, xen màu đá và
// đồng. Mặt quay về +z cục bộ (hướng ry trong scene). Gộp tất cả vào batch theo vật liệu.
function addArhat(batch, m, item, index = 0) {
  const size = item.scale || 1;
  const body = index % 3 === 1 ? m.bronze : m.arhatStone;
  const place = (geometry, material, local, options = {}) => batch.add(geometry, material, {
    position: localTransform(item, local, size),
    rotation: [options.rx || 0, (item.ry || 0) + (options.ry || 0), options.rz || 0],
    scale: options.scale || [size, size, size],
  });
  // Bệ đá hai tầng.
  place(new THREE.BoxGeometry(1.2, 0.3, 1.0), m.darkStone, [0, 0.15, 0]);
  place(new THREE.BoxGeometry(1.05, 0.12, 0.88), m.stone, [0, 0.36, 0]);
  // Chân xếp bằng phủ vạt áo và thân áo liền khối.
  place(new THREE.CapsuleGeometry(0.17, 0.62, 6, 12), body, [0, 0.58, 0.12], { rz: Math.PI / 2, scale: [size, size, size * 0.95] });
  place(lathe([[0, 0], [0.44, 0], [0.42, 0.14], [0.33, 0.34], [0.3, 0.62], [0.33, 0.78], [0.24, 0.9], [0.1, 0.96], [0, 0.96]], 18), body, [0, 0.46, -0.02], { scale: [size, size, size * 0.82] });
  // Đầu tròn, tai dài, mặt.
  place(new THREE.SphereGeometry(0.21, 16, 12), body, [0, 1.62, 0]);
  place(new THREE.SphereGeometry(0.212, 18, 10, Math.PI * 1.5 - Math.PI / 3, (Math.PI * 2) / 3, Math.PI * 0.3, Math.PI * 0.42), m.arhatFace, [0, 1.62, 0], { ry: Math.PI });
  for (const side of [-1, 1]) place(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), body, [side * 0.21, 1.58, -0.01]);
  // Tay theo tư thế.
  const pose = index % 5;
  const arm = (side, local, rx, rz) => place(new THREE.CapsuleGeometry(0.07, 0.34, 4, 8), body, local.map((value, axis) => (axis === 0 ? value * side : value)), { rx, rz: rz * side });
  if (pose === 0) {
    // Thiền định: hai tay đặt trong lòng, bình bát.
    arm(-1, [0.2, 0.98, 0.18], 1.1, 0.4);
    arm(1, [0.2, 0.98, 0.18], 1.1, 0.4);
    place(lathe([[0, 0], [0.1, 0], [0.16, 0.08], [0.15, 0.12], [0, 0.1]], 14), m.darkStone, [0, 0.82, 0.32]);
  } else if (pose === 1) {
    // Lần tràng hạt trước ngực.
    arm(-1, [0.2, 1.1, 0.15], 1.35, 0.3);
    arm(1, [0.2, 1.1, 0.15], 1.35, 0.3);
    place(new THREE.TorusGeometry(0.13, 0.025, 6, 20), m.wood, [0, 1.12, 0.32], { rx: 0.3 });
  } else if (pose === 2) {
    // Cầm tích trượng tay phải.
    arm(-1, [0.2, 0.98, 0.18], 1.1, 0.4);
    arm(1, [0.26, 1.2, 0.1], 0.2, 0.2);
    place(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), m.gold, [0.34, 1.35, 0.18]);
    place(new THREE.TorusGeometry(0.1, 0.018, 6, 16), m.gold, [0.34, 2.35, 0.18]);
  } else if (pose === 3) {
    // Đọc cuốn kinh mở trên tay.
    arm(-1, [0.18, 1.02, 0.2], 1.3, 0.35);
    arm(1, [0.18, 1.02, 0.2], 1.3, 0.35);
    place(new THREE.BoxGeometry(0.34, 0.03, 0.24), m.paper, [0, 1.06, 0.36], { rx: -0.5 });
  } else {
    // Tay phải giơ bắt ấn thí vô úy, tay trái đặt gối.
    arm(-1, [0.24, 0.92, 0.2], 0.9, 0.5);
    arm(1, [0.3, 1.3, 0.1], -0.2, -0.25);
    place(new THREE.SphereGeometry(0.07, 10, 8), body, [0.33, 1.52, 0.14], { scale: [size * 0.8, size * 1.2, size * 0.5] });
  }
}

function addBench(batch, m, item) {
  const size = item.scale || 1;
  const place = (geometry, local) => batch.add(geometry, m.stone, {
    position: localTransform(item, local, size), rotation: [0, item.ry || 0, 0], scale: [size, size, size],
  });
  place(new THREE.BoxGeometry(2.2, 0.18, 0.68), [0, 0.62, 0]);
  place(new THREE.BoxGeometry(2.2, 0.65, 0.14), [0, 0.9, -0.28]);
  place(new THREE.BoxGeometry(0.22, 0.55, 0.52), [-0.75, 0.3, 0]);
  place(new THREE.BoxGeometry(0.22, 0.55, 0.52), [0.75, 0.3, 0]);
}

// Đất luống có rãnh vun: nền nâu, các luống đất sáng tối xen nhau.
function soilTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5b3a22';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 6; row += 1) {
      const y = (row + 0.5) * (h / 6);
      ctx.fillStyle = 'rgba(122, 82, 50, 0.85)';
      ctx.fillRect(0, y - 6, w, 8);
      ctx.fillStyle = 'rgba(40, 24, 12, 0.6)';
      ctx.fillRect(0, y + 3, w, 3);
    }
    for (let dot = 0; dot < 160; dot += 1) {
      ctx.fillStyle = dot % 2 ? 'rgba(150, 110, 70, 0.4)' : 'rgba(30, 18, 8, 0.35)';
      ctx.fillRect((dot * 53) % w, (dot * 97) % h, 2, 2);
    }
  });
}

// Sỏi kem: nền sáng, nhiều viên sỏi nhỏ sắc độ khác nhau. Lặp 0,5 lần mỗi mét.
function gravelTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4d6b4';
    ctx.fillRect(0, 0, w, h);
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let stone = 0; stone < 900; stone += 1) {
      const tone = 170 + Math.floor(random() * 70);
      ctx.fillStyle = `rgb(${tone}, ${tone - 10}, ${tone - 34})`;
      ctx.beginPath();
      ctx.ellipse(random() * w, random() * h, 1.5 + random() * 3, 1.2 + random() * 2.4, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [9, 5]);
}

// Số luống 1–10 trên nền gỗ, xếp ngang trong một texture (mỗi ô một số).
// Số luống 1–50 trên một texture: lưới PLOT_NUMBER_COLUMNS × PLOT_NUMBER_ROWS ô, ô (id − 1) đọc từ trái sang phải,
// trên xuống dưới.
const PLOT_NUMBER_COLUMNS = 10;
const PLOT_NUMBER_ROWS = 5;
function plotNumberTexture() {
  return canvasTexture(640, 64 * PLOT_NUMBER_ROWS, (ctx, w, h) => {
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff3d6';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cellW = w / PLOT_NUMBER_COLUMNS;
    const cellH = h / PLOT_NUMBER_ROWS;
    for (let index = 0; index < PLOT_NUMBER_COLUMNS * PLOT_NUMBER_ROWS; index += 1) {
      ctx.fillText(String(index + 1), ((index % PLOT_NUMBER_COLUMNS) + 0.5) * cellW, (Math.floor(index / PLOT_NUMBER_COLUMNS) + 0.5) * cellH + 2);
    }
  });
}

// Vườn Công Đức (world.courtyard.garden): luống đất viền gỗ, cổng gỗ có biển tên, quầy hạt giống có mái. Cây trồng
// trên luống thay đổi theo dữ liệu thật nên dựng riêng ở garden3d.mjs; ở đây chỉ là phần tĩnh + mesh ẩn để chạm.
function addGarden(batch, m, garden, pickables, root, signs) {
  const bed = garden.bed || 2.6;
  const hasDetailedModel = Boolean(garden.model?.src);
  // Mái hai tấm dọc theo trục x cục bộ của công trình (xoay theo ry), nóc mạ vàng.
  const gableRoof = (item, length, depth, y) => {
    for (const side of [-1, 1]) {
      const board = new THREE.BoxGeometry(length, 0.12, depth / 2 + 0.15);
      board.rotateX(side * 0.5);
      board.translate(0, 0, side * depth / 4);
      batch.add(board, m.roof, { position: localTransform({ ...item, scale: 1 }, [0, y, 0]), rotation: [0, item.ry || 0, 0] });
    }
    batch.add(new THREE.BoxGeometry(length + 0.2, 0.12, 0.16), m.gold, { position: localTransform({ ...item, scale: 1 }, [0, y + depth * 0.14, 0]), rotation: [0, item.ry || 0, 0] });
  };
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  // Khung bao khu trồng (theo hàng rào; không có rào thì theo các luống).
  const points = (garden.fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
  if (!points.length) for (const plot of garden.plots || []) points.push([plot.x - bed, plot.z - bed], [plot.x + bed, plot.z + bed]);
  const box = points.length ? {
    x: [Math.min(...points.map((p) => p[0])), Math.max(...points.map((p) => p[0]))],
    z: [Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[1]))],
  } : null;
  const gate = garden.entrance;
  if (box) {
    // Nền sỏi kem trong rào.
    const gravel = new THREE.PlaneGeometry(box.x[1] - box.x[0], box.z[1] - box.z[0]);
    gravel.rotateX(-Math.PI / 2);
    batch.add(gravel, m.gravel, { position: [(box.x[0] + box.x[1]) / 2, 0.004, (box.z[0] + box.z[1]) / 2] });
    // Đá bước dọc lối giữa hai hàng luống, từ cổng vào.
    if (gate) {
      for (let x = box.x[0] + 0.5, index = 0; x < box.x[1] - 0.3; x += 0.75, index += 1) {
        batch.add(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 9), m.darkStone, {
          position: [x, 0.03, gate.z + (index % 2 ? 0.16 : -0.16)], rotation: [0, index * 0.7, 0], scale: [1 + (index % 3) * 0.12, 1, 0.85],
        });
      }
    }
    // Đèn đá bốn góc; hoa dọc chân rào (tránh khoảng cổng).
    for (const [x, z] of [[box.x[0] + 0.45, box.z[0] + 0.45], [box.x[1] - 0.45, box.z[0] + 0.45], [box.x[0] + 0.45, box.z[1] - 0.45], [box.x[1] - 0.45, box.z[1] - 0.45]]) {
      if (garden.barrel && Math.hypot(garden.barrel.x - x, garden.barrel.z - z) < 0.8) continue;
      batch.add(new THREE.BoxGeometry(0.34, 0.12, 0.34), m.darkStone, { position: [x, 0.06, z] });
      batch.add(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 8), m.stone, { position: [x, 0.4, z] });
      batch.add(new THREE.BoxGeometry(0.26, 0.22, 0.26), m.paper, { position: [x, 0.78, z] });
      batch.add(new THREE.ConeGeometry(0.28, 0.2, 4), m.darkStone, { position: [x, 0.98, z], rotation: [0, Math.PI / 4, 0] });
    }
    const blooms = [m.flowerPink, m.flowerYellow, m.flowerViolet];
    let bloom = 0;
    for (const [x0, z0, x1, z1] of garden.fence || []) {
      const length = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 0.9; t < length - 0.6; t += 1.3) {
        const k = t / length;
        // Lùi vào trong rào 0,35 m.
        const x = x0 + (x1 - x0) * k + Math.sign(((box.x[0] + box.x[1]) / 2) - x0) * (x1 === x0 ? 0.35 : 0);
        const z = z0 + (z1 - z0) * k + Math.sign(((box.z[0] + box.z[1]) / 2) - z0) * (z1 === z0 ? 0.35 : 0);
        batch.add(new THREE.IcosahedronGeometry(0.2, 0), m.leaf, { position: [x, 0.16, z], scale: [1.2, 0.8, 1.2] });
        for (const [dx, dz] of [[-0.08, 0.05], [0.09, -0.04], [0, 0.1]]) {
          batch.add(new THREE.SphereGeometry(0.06, 6, 5), blooms[bloom % blooms.length], { position: [x + dx, 0.32, z + dz] });
        }
        bloom += 1;
      }
    }
  }
  // Thùng nước gỗ có gáo.
  if (garden.barrel) {
    const { x, z } = garden.barrel;
    batch.add(new THREE.CylinderGeometry(0.3, 0.27, 0.62, 14), m.wood, { position: [x, 0.31, z] });
    for (const y of [0.12, 0.5]) batch.add(new THREE.TorusGeometry(0.29, 0.02, 5, 18), m.darkStone, { position: [x, y, z], rotation: [Math.PI / 2, 0, 0] });
    batch.add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 14), m.water, { position: [x, 0.58, z] });
    batch.add(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 5), m.wood, { position: [x + 0.12, 0.72, z], rotation: [0, 0, -0.6] });
    batch.add(new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.wood, { position: [x + 0.28, 0.95, z] });
  }
  // Biển số luống: một texture ghép (số 1–50) cho mọi biển, gộp chung một lượt vẽ. Texture lật dọc khi nạp nên
  // hàng ô đầu tiên (trên cùng canvas) ứng với v gần 1.
  const signPlane = (id) => {
    const plane = new THREE.PlaneGeometry(0.42, 0.26);
    const uv = plane.attributes.uv;
    const cell = (id - 1) % (PLOT_NUMBER_COLUMNS * PLOT_NUMBER_ROWS);
    const column = cell % PLOT_NUMBER_COLUMNS;
    const row = Math.floor(cell / PLOT_NUMBER_COLUMNS);
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, (column + uv.getX(index)) / PLOT_NUMBER_COLUMNS, (PLOT_NUMBER_ROWS - 1 - row + uv.getY(index)) / PLOT_NUMBER_ROWS);
    }
    return plane;
  };
  for (const plot of garden.plots || []) {
    // Đất có rãnh (texture), viền gỗ sáng, cột góc có mũ.
    batch.add(new THREE.BoxGeometry(bed, 0.22, bed), m.soil, { position: [plot.x, 0.11, plot.z] });
    for (const [dx, dz, w, d] of [[0, -bed / 2, bed + 0.2, 0.14], [0, bed / 2, bed + 0.2, 0.14], [-bed / 2, 0, 0.14, bed], [bed / 2, 0, 0.14, bed]]) {
      batch.add(new THREE.BoxGeometry(w, 0.3, d), m.fence, { position: [plot.x + dx, 0.15, plot.z + dz] });
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      batch.add(new THREE.BoxGeometry(0.2, 0.38, 0.2), m.wood, { position: [plot.x + sx * bed / 2, 0.19, plot.z + sz * bed / 2] });
    }
    // Biển số quay ra lối đi giữa hai hàng luống.
    const toward = gate ? Math.sign(gate.z - plot.z) || 1 : 1;
    const signZ = plot.z + toward * (bed / 2 + 0.22);
    batch.add(new THREE.BoxGeometry(0.05, 0.55, 0.05), m.wood, { position: [plot.x - bed / 2 + 0.35, 0.28, signZ] });
    batch.add(new THREE.BoxGeometry(0.48, 0.32, 0.04), m.wood, { position: [plot.x - bed / 2 + 0.35, 0.6, signZ] });
    batch.add(signPlane(plot.id), m.plotNumbers, {
      position: [plot.x - bed / 2 + 0.35, 0.6, signZ + toward * 0.025], rotation: [0, toward > 0 ? 0 : Math.PI, 0],
    });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(bed, 1.6, bed), proxyMaterial);
    proxy.position.set(plot.x, 0.8, plot.z);
    proxy.userData.gardenPlot = plot.id;
    root.add(proxy);
    pickables.push(proxy);
  }
  // Hàng rào gỗ quanh khu trồng: cọc đầu nhọn cách nhau ~0,5 m, hai thanh ngang (gộp vào batch, không thêm lệnh vẽ).
  for (const [x0, z0, x1, z1] of garden.fence || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const angle = Math.atan2(x1 - x0, z1 - z0);
    const count = Math.max(1, Math.round(length / 0.5));
    for (let index = 0; index <= count; index += 1) {
      const x = x0 + ((x1 - x0) * index) / count;
      const z = z0 + ((z1 - z0) * index) / count;
      batch.add(new THREE.BoxGeometry(0.09, 0.85, 0.05), m.fence, { position: [x, 0.43, z], rotation: [0, angle, 0] });
      batch.add(new THREE.ConeGeometry(0.065, 0.14, 4), m.fence, { position: [x, 0.92, z], rotation: [0, angle + Math.PI / 4, 0] });
    }
    for (const y of [0.32, 0.68]) {
      batch.add(new THREE.BoxGeometry(0.04, 0.07, length), m.wood, { position: [(x0 + x1) / 2, y, (z0 + z1) / 2], rotation: [0, angle, 0] });
    }
  }
  // Cổng gỗ: hai cột, xà ngang, mái nhỏ, biển tên (rộng theo entrance.width).
  if (gate && !hasDetailedModel) {
    const half = (gate.width || 3.8) / 2;
    const at = (local) => localTransform({ ...gate, scale: 1 }, local);
    for (const side of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.14, 0.18, 2.8, 10), m.pillar, { position: at([side * half, 1.4, 0]) });
      batch.add(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 8), m.stone, { position: at([side * half, 0.11, 0]) });
    }
    batch.add(new THREE.BoxGeometry(half * 2 + 0.7, 0.2, 0.28), m.wood, { position: at([0, 2.75, 0]), rotation: [0, gate.ry || 0, 0] });
    gableRoof(gate, half * 2 + 1, 1.1, 2.98);
    signs.push({ text: garden.sign || '', position: at([0, 2.35, -0.16]), ry: (gate.ry || 0) + Math.PI, width: Math.min(2.6, half * 2 - 0.2) });
  }
  // Quầy hạt giống: mặt quầy, mái che, kệ hạt nhiều màu, biển tên.
  const shop = garden.shop;
  if (shop) {
    const at = (local) => localTransform({ ...shop, scale: 1 }, local);
    const turn = [0, shop.ry || 0, 0];
    if (!hasDetailedModel) {
      batch.add(new THREE.BoxGeometry(2.2, 0.95, 0.8), m.wood, { position: at([0, 0.48, 0]), rotation: turn });
      batch.add(new THREE.BoxGeometry(2.4, 0.06, 0.95), m.stone, { position: at([0, 0.98, 0]), rotation: turn });
      for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.1, 2.3, 0.1), m.wood, { position: at([side * 1.1, 1.15, 0.45]), rotation: turn });
      gableRoof(shop, 2.8, 1.6, 2.4);
      [m.lantern, m.flowerYellow, m.flowerPink, m.leaf].forEach((material, index) => {
        batch.add(new THREE.BoxGeometry(0.34, 0.22, 0.3), material, { position: at([-0.75 + index * 0.5, 1.13, 0.1]), rotation: turn });
      });
    }
    signs.push({ text: garden.shopSign || '', position: at([0, 1.85, -0.5]), ry: (shop.ry || 0) + Math.PI, width: 1.8 });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1.2), proxyMaterial);
    proxy.position.set(...at([0, 1.2, 0]));
    proxy.rotation.y = shop.ry || 0;
    proxy.userData.gardenShop = true;
    root.add(proxy);
    pickables.push(proxy);
  }
}

// Khu tưởng niệm (world.courtyard.memorial): nền sỏi, hàng rào đá thấp có trụ, cổng đá có biển tên quay ra lối đi,
// lư hương đá ngoài cổng, mỗi ô mộ một bệ đá phẳng (ô trống). Nấm mộ + bia ghi tên thay đổi theo dữ liệu server nên
// dựng ở memorial3d.mjs; ở đây chỉ phần tĩnh + mesh ẩn để chạm vào từng ô.
function addMemorial(batch, m, memorial, pickables, root, signs) {
  const mound = memorial.mound || { length: 2, width: 1.1 };
  const points = (memorial.fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
  if (points.length) {
    const box = {
      x: [Math.min(...points.map((p) => p[0])), Math.max(...points.map((p) => p[0]))],
      z: [Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[1]))],
    };
    const gravel = new THREE.PlaneGeometry(box.x[1] - box.x[0], box.z[1] - box.z[0]);
    gravel.rotateX(-Math.PI / 2);
    batch.add(gravel, m.gravel, { position: [(box.x[0] + box.x[1]) / 2, 0.004, (box.z[0] + box.z[1]) / 2] });
  }
  // Hàng rào đá: tường thấp 0,55 m, trụ vuông có mũ cách nhau ~3 m.
  for (const [x0, z0, x1, z1] of memorial.fence || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const angle = Math.atan2(x1 - x0, z1 - z0);
    batch.add(new THREE.BoxGeometry(0.28, 0.55, length), m.stone, { position: [(x0 + x1) / 2, 0.28, (z0 + z1) / 2], rotation: [0, angle, 0] });
    batch.add(new THREE.BoxGeometry(0.36, 0.06, length + 0.08), m.darkStone, { position: [(x0 + x1) / 2, 0.58, (z0 + z1) / 2], rotation: [0, angle, 0] });
    const count = Math.max(1, Math.round(length / 3));
    for (let index = 0; index <= count; index += 1) {
      const x = x0 + ((x1 - x0) * index) / count;
      const z = z0 + ((z1 - z0) * index) / count;
      batch.add(new THREE.BoxGeometry(0.42, 0.85, 0.42), m.stone, { position: [x, 0.43, z] });
      batch.add(new THREE.ConeGeometry(0.34, 0.22, 4), m.darkStone, { position: [x, 0.96, z], rotation: [0, Math.PI / 4, 0] });
    }
  }
  // Cổng: hai trụ đá cao, xà ngang, biển tên quay ra ngoài (phía người đi tới).
  const gate = memorial.entrance;
  if (gate) {
    const half = (gate.width || 2.4) / 2;
    const at = (local) => localTransform({ ...gate, scale: 1 }, local);
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(0.5, 2.5, 0.5), m.stone, { position: at([side * (half + 0.25), 1.25, 0]), rotation: [0, gate.ry || 0, 0] });
      batch.add(new THREE.ConeGeometry(0.42, 0.3, 4), m.darkStone, { position: at([side * (half + 0.25), 2.65, 0]), rotation: [0, (gate.ry || 0) + Math.PI / 4, 0] });
    }
    batch.add(new THREE.BoxGeometry(half * 2 + 1.1, 0.24, 0.42), m.darkStone, { position: at([0, 2.38, 0]), rotation: [0, gate.ry || 0, 0] });
    signs.push({ text: memorial.sign || '', position: at([0, 1.98, 0.24]), ry: gate.ry || 0, width: Math.min(2.6, half * 2 + 0.4) });
  }
  // Lư hương đá ngoài cổng, ba nén hương.
  if (memorial.burner) {
    const { x, z } = memorial.burner;
    batch.add(new THREE.BoxGeometry(0.9, 0.5, 0.9), m.stone, { position: [x, 0.25, z] });
    batch.add(new THREE.CylinderGeometry(0.34, 0.26, 0.36, 14), m.bronze, { position: [x, 0.68, z] });
    for (const dx of [-0.08, 0, 0.08]) {
      batch.add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), m.wood, { position: [x + dx, 1.05, z] });
      batch.add(new THREE.SphereGeometry(0.02, 5, 4), m.lantern, { position: [x + dx, 1.27, z] });
    }
  }
  // Ô mộ: bệ đá phẳng (ô trống vẫn thấy chỗ), mesh ẩn để chạm.
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  for (const grave of memorial.graves || []) {
    batch.add(new THREE.BoxGeometry(mound.length + 0.5, 0.05, mound.width + 0.3), m.darkStone, { position: [grave.x - 0.1, 0.025, grave.z] });
    batch.add(new THREE.BoxGeometry(mound.length + 0.3, 0.07, mound.width + 0.1), m.stone, { position: [grave.x - 0.1, 0.05, grave.z] });
    // Thấp vừa tới đỉnh bia: cao hơn thì nhìn xiên chạm vào ô phía sau dễ trúng ô phía trước.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(mound.length + 0.6, 1.2, mound.width + 0.3), proxyMaterial);
    proxy.position.set(grave.x - 0.1, 0.6, grave.z);
    proxy.userData.memorialGrave = grave.id;
    root.add(proxy);
    pickables.push(proxy);
  }
}

// Bảng gỗ mô tả đặt trước mỗi khu. Tọa độ, góc xoay và nội dung đều lấy từ scene JSON; mesh ẩn chỉ dùng raycast
// để mở lại hướng dẫn, còn va chạm do world.walk.obstacles của cảnh quyết định.
function addGuideBoard(batch, m, item, pickables, root, signs) {
  const width = item.width || 2.2;
  const height = item.height || 1.15;
  const ry = item.ry || 0;
  const at = (local) => localTransform({ ...item, scale: 1 }, local);
  for (const side of [-1, 1]) {
    batch.add(new THREE.CylinderGeometry(0.08, 0.11, 1.75, 8), m.wood, {
      position: at([side * width * 0.42, 0.88, 0]), rotation: [0, ry, 0],
    });
    batch.add(new THREE.ConeGeometry(0.13, 0.16, 4), m.gold, {
      position: at([side * width * 0.42, 1.83, 0]), rotation: [0, ry + Math.PI / 4, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.13), m.wood, {
    position: at([0, 1.24, 0]), rotation: [0, ry, 0],
  });
  signs.push({
    text: item.sign || '', position: at([0, 1.24, -0.075]), ry: ry + Math.PI, width, height,
  });

  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 2.05, 0.42),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.position.set(...at([0, 1.03, 0]));
  proxy.rotation.y = ry;
  proxy.userData.zoneGuide = item.id;
  root.add(proxy);
  pickables.push(proxy);
}

// Mặt tượng Quan Âm: mắt khép nhìn xuống, chân mày cong dài, bạch hào, môi mỉm (vẽ canvas, nét xám nhạt trên đá trắng).
function guanyinFaceTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(120, 112, 100, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.arc(x, 112, 26, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 122, 18, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200, 150, 90, 0.9)';
    ctx.beginPath();
    ctx.arc(128, 96, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(124, 150);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170, 110, 100, 0.85)';
    ctx.beginPath();
    ctx.arc(128, 160, 13, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  });
}

// Tượng Quan Âm trắng đứng trên đài sen: áo liền một khối thon từ chân lên vai, khăn trùm, tay trái tịnh bình,
// tay phải cành dương liễu, hào quang sau đầu. Mặt tượng quay về +z cục bộ (hướng ry trong scene).
function addGuanyin(batch, m, item) {
  const size = item.scale || 1;
  const place = (geometry, material, local, options = {}) => batch.add(geometry, material, {
    position: localTransform(item, local, size),
    rotation: [options.rx || 0, (item.ry || 0) + (options.ry || 0), options.rz || 0],
    scale: options.scale || [size, size, size],
  });
  // Bệ đá và đài sen hai tầng cánh.
  place(new THREE.CylinderGeometry(1.12, 1.28, 0.42, 24), m.stone, [0, 0.21, 0]);
  place(new THREE.CylinderGeometry(0.88, 1.04, 0.34, 20), m.whiteStone, [0, 0.58, 0]);
  for (let tier = 0; tier < 2; tier += 1) {
    for (let petal = 0; petal < 12; petal += 1) {
      const angle = ((petal + tier * 0.5) / 12) * Math.PI * 2;
      const r = 0.74 - tier * 0.18;
      place(new THREE.SphereGeometry(0.24, 10, 7), m.whiteStone, [Math.cos(angle) * r, 0.78 + tier * 0.12, Math.sin(angle) * r], {
        scale: [size * 0.62, size * 0.32, size * 1.15], ry: -angle,
      });
    }
  }
  // Áo: một khối tiện liền từ chân (vạt xòe) lên eo, ngực, vai.
  place(lathe([[0, 0], [0.62, 0], [0.6, 0.12], [0.5, 0.6], [0.42, 1.2], [0.36, 1.6], [0.38, 1.85], [0.41, 2.05], [0.36, 2.22], [0.2, 2.32], [0.11, 2.36], [0, 2.36]], 26), m.whiteStone, [0, 0.9, 0], { scale: [size, size, size * 0.82] });
  // Đường xếp nếp áo dọc thân.
  for (const x of [-0.18, 0.02, 0.2]) {
    place(new THREE.CylinderGeometry(0.018, 0.03, 1.3, 6), m.whiteStone, [x, 1.65, 0.42 - Math.abs(x) * 0.4]);
  }
  // Cổ, đầu, mặt, búi tóc, khăn trùm buông vai.
  place(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 12), m.whiteStone, [0, 3.32, 0]);
  place(new THREE.SphereGeometry(0.27, 20, 16), m.whiteStone, [0, 3.58, 0], { scale: [size * 0.92, size * 1.08, size * 0.95] });
  place(new THREE.SphereGeometry(0.272, 24, 12, Math.PI * 1.5 - Math.PI / 3, (Math.PI * 2) / 3, Math.PI * 0.3, Math.PI * 0.42), m.guanyinFace, [0, 3.58, 0], {
    scale: [size * 0.92, size * 1.08, size * 0.95], ry: Math.PI,
  });
  place(new THREE.SphereGeometry(0.13, 14, 10), m.whiteStone, [0, 3.9, -0.04], { scale: [size * 0.85, size * 1.25, size * 0.85] });
  place(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m.whiteStone, [0, 3.63, -0.06], { scale: [size * 1.02, size * 1.12, size] });
  place(lathe([[0, 0], [0.44, 0], [0.34, 0.45], [0.27, 0.62], [0, 0.66]], 20), m.whiteStone, [0, 2.88, -0.1], { scale: [size * 1.05, size, size * 0.7] });
  // Tay: cánh tay áo rủ, tay trái nâng tịnh bình trước ngực, tay phải cầm cành dương liễu.
  place(new THREE.CapsuleGeometry(0.1, 0.62, 4, 10), m.whiteStone, [-0.4, 2.72, 0.06], { rz: -0.32 });
  place(new THREE.CapsuleGeometry(0.1, 0.62, 4, 10), m.whiteStone, [0.4, 2.72, 0.06], { rz: 0.32 });
  place(new THREE.CapsuleGeometry(0.085, 0.36, 4, 10), m.whiteStone, [-0.36, 2.38, 0.24], { rx: 1.2 });
  place(new THREE.CapsuleGeometry(0.085, 0.36, 4, 10), m.whiteStone, [0.36, 2.48, 0.22], { rx: 1.0 });
  place(lathe([[0, 0], [0.07, 0], [0.11, 0.08], [0.06, 0.2], [0.04, 0.27], [0.06, 0.3], [0, 0.3]], 12), m.whiteStone, [-0.32, 2.4, 0.42]);
  place(new THREE.CylinderGeometry(0.008, 0.012, 0.55, 5), m.leaf, [0.34, 2.75, 0.4], { rz: 0.25 });
  // Hào quang sau đầu.
  place(new THREE.TorusGeometry(0.5, 0.045, 8, 40), m.gold, [0, 3.62, -0.34]);
}

// Cây bồ đề: thân lớn nhiều múi, tán rộng xanh tươi, bệ đá tròn quanh gốc, vài dải vải đỏ buộc cầu nguyện.
function addBodhi(treeBatch, batch, m, item, { foundation = true, ribbons = true } = {}) {
  const size = item.size || 1;
  for (let lobe = 0; lobe < 5; lobe += 1) {
    const angle = (lobe / 5) * Math.PI * 2;
    treeBatch.add(new THREE.CylinderGeometry(0.22 * size, 0.42 * size, 3.6 * size, 8), m.bark, {
      position: [item.x + Math.cos(angle) * 0.22 * size, 1.8 * size, item.z + Math.sin(angle) * 0.22 * size],
      rotation: [Math.sin(angle) * 0.06, 0, -Math.cos(angle) * 0.06],
    });
  }
  for (let branch = 0; branch < 6; branch += 1) {
    const angle = branch * 1.05;
    treeBatch.add(new THREE.CylinderGeometry(0.08 * size, 0.16 * size, 2.4 * size, 6), m.bark, {
      position: [item.x + Math.cos(angle) * 0.8 * size, 3.9 * size, item.z + Math.sin(angle) * 0.8 * size],
      rotation: [Math.sin(angle) * 0.75, 0, -Math.cos(angle) * 0.75],
    });
  }
  for (let blob = 0; blob < 12; blob += 1) {
    const angle = blob * 0.52;
    const ring = blob % 3;
    treeBatch.add(new THREE.IcosahedronGeometry((1.35 + ring * 0.25) * size, 1), blob % 2 ? m.bodhiLeaf : m.leaf, {
      position: [item.x + Math.cos(angle) * (1.2 + ring * 0.9) * size, (4.6 + (blob % 4) * 0.45 - ring * 0.25) * size, item.z + Math.sin(angle) * (1.2 + ring * 0.9) * size],
      scale: [1.1, 0.7, 1.1],
    });
  }
  if (foundation) {
    // Bệ đá tròn quanh gốc chỉ mở khóa khi công trình hoàn thành.
    batch.add(new THREE.CylinderGeometry(1.55 * size, 1.65 * size, 0.42, 28, 1, true), m.stone, { position: [item.x, 0.21, item.z] });
    batch.add(new THREE.TorusGeometry(1.6 * size, 0.1, 6, 32), m.darkStone, { position: [item.x, 0.44, item.z], rotation: [Math.PI / 2, 0, 0] });
  }
  if (ribbons) {
    for (let ribbon = 0; ribbon < 6; ribbon += 1) {
      const angle = ribbon * 1.1 + 0.4;
      batch.add(new THREE.BoxGeometry(0.06, 0.7, 0.012), m.lantern, {
        position: [item.x + Math.cos(angle) * 1.5 * size, 3.2 * size, item.z + Math.sin(angle) * 1.5 * size], rotation: [0, -angle, 0.08],
      });
    }
  }
}

// Bệ đá tròn quanh gốc Bồ Đề (mở khi công trình hoàn thành): nền bậc thấp, vòng tường đá có gờ ngồi, cánh sen chạm nổi
// quanh mặt ngoài, đất trong lòng bệ.
function addBodhiPlatform(batch, m, item, radius) {
  const r = radius;
  batch.add(new THREE.CylinderGeometry(r + 0.42, r + 0.5, 0.08, 40), m.darkStone, { position: [item.x, 0.04, item.z] });
  batch.add(lathe([[r - 0.4, 0], [r, 0], [r + 0.05, 0.06], [r, 0.4], [r + 0.09, 0.45], [r + 0.07, 0.52], [r - 0.45, 0.52], [r - 0.48, 0.46], [r - 0.4, 0.42], [r - 0.4, 0]], 48), m.whiteStone, {
    position: [item.x, 0.06, item.z],
  });
  batch.add(new THREE.CylinderGeometry(r - 0.41, r - 0.41, 0.06, 40), m.earth || m.soil, { position: [item.x, 0.42, item.z] });
  const petals = Math.round(r * 9);
  for (let index = 0; index < petals; index += 1) {
    const angle = (index / petals) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(1, 10, 8), m.stone, {
      position: [item.x + Math.cos(angle) * (r + 0.02), 0.25, item.z + Math.sin(angle) * (r + 0.02)],
      rotation: [0, -angle + Math.PI / 2, 0],
      scale: [0.13, 0.17, 0.05],
    });
  }
}

// Bóng mềm dưới tán (cây công trình là ảnh billboard, không đổ bóng thật): đĩa mờ dần ra mép.
function softShadowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.32)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// Cây Bồ Đề công trình chung: năm giai đoạn bật / tắt tức thì theo snapshot công trình. Tọa độ và tỉ lệ từng giai đoạn
// lấy từ scene JSON; engine không chứa vị trí riêng của chánh điện.
//   0 Chuẩn bị đất: ụ đất + cọc biển gỗ.        1 Nảy mầm: cây non nhỏ (ảnh Meshy sapling) trong vòng đất.
//   2 Cây non: cây non cao hơn.                  3 Tỏa bóng: Bồ Đề cổ thụ (ảnh Meshy bodhi) cỡ 0,72.
//   4 Hoàn thành: cổ thụ đủ lớn + bệ đá chạm sen + dải vải cầu nguyện.
// Cây là billboard quay về camera, đung đưa theo gió (/models/scene/bodhi.webp, sapling.webp); chưa tải / tải lỗi thì
// hiện cây dựng bằng khối như trước. Đất, bệ đá, dải vải là khối tĩnh (bóng thật).
const BODHI_SPRITES = [null, { file: 'sapling', height: 1.1 }, { file: 'sapling', height: 3.0 }, { file: 'bodhi', height: 6.3 }, { file: 'bodhi', height: 6.3 }];
const BODHI_SHADOW = [0, 0.7, 1.5, 4.2, 5.6];
function buildCommunityBodhi({ root, casters, materials, item }) {
  const defaults = [0, 0.18, 0.42, 0.72, 1];
  const scales = Array.isArray(item.stageScales) && item.stageScales.length === 5 ? item.stageScales : defaults;
  const size = item.size || 1;
  // Đất quanh gốc cây non / trong lòng bệ: màu đất trơn (texture luống cày nhìn như mặt gỗ ở vòng tròn nhỏ).
  const earth = new THREE.MeshStandardMaterial({ color: '#4b3523', roughness: 1 });
  const stages = scales.map((scale, stageIndex) => {
    const decorGroup = new THREE.Group();
    decorGroup.name = `community-bodhi-stage-${stageIndex}`;
    const treeGroup = new THREE.Group();
    treeGroup.name = `community-bodhi-tree-${stageIndex}`;
    const decoration = new StaticBatch();
    const trees = new StaticBatch();
    if (stageIndex === 0) {
      decoration.add(new THREE.CylinderGeometry(1.25, 1.45, 0.18, 24), materials.soil, { position: [item.x, 0.09, item.z] });
      decoration.add(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 6), materials.bark, { position: [item.x + 0.65, 0.4, item.z + 0.25], rotation: [0, 0, -0.08] });
      decoration.add(new THREE.BoxGeometry(0.72, 0.42, 0.06), materials.wood, { position: [item.x + 0.68, 0.82, item.z + 0.25], rotation: [0, -0.3, 0] });
    } else {
      addBodhi(trees, decoration, materials, { ...item, size: size * scale }, { foundation: false, ribbons: stageIndex === 4 });
      if (stageIndex < 3) {
        // Cây non: vòng đất xới quanh gốc.
        decoration.add(new THREE.CylinderGeometry(0.75 + stageIndex * 0.3, 0.9 + stageIndex * 0.3, 0.12, 24), earth, { position: [item.x, 0.06, item.z] });
      }
      if (stageIndex === 4) addBodhiPlatform(decoration, { ...materials, earth }, item, 1.57 * size);
    }
    trees.build(treeGroup, { castShadow: true });
    decoration.build(decorGroup, { castShadow: true, receiveShadow: true });
    for (const group of [decorGroup, treeGroup]) {
      group.visible = stageIndex === 0;
      group.traverse((child) => { if (child.isMesh) casters.push(child); });
      root.add(group);
    }
    return { decorGroup, treeGroup };
  });
  // Ảnh cây: mỗi giai đoạn có cây một InstancedMesh (1 bản) dùng vật liệu billboard của Vườn Hoa.
  const wind = { uWindTime: { value: 0 } };
  const sprites = new Array(stages.length).fill(null);
  const shadowMap = softShadowTexture();
  const shadow = shadowMap ? new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false })) : null;
  if (shadow) {
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(item.x, 0.03, item.z);
    shadow.visible = false;
    root.add(shadow);
  }
  let active = 0;
  const apply = () => {
    stages.forEach((stage, index) => {
      const sprite = sprites[index];
      stage.decorGroup.visible = index === active;
      stage.treeGroup.visible = index === active && !sprite;
      if (sprite) sprite.visible = index === active;
    });
    if (shadow) {
      shadow.visible = Boolean(sprites[active]) && BODHI_SHADOW[active] > 0;
      shadow.scale.setScalar(BODHI_SHADOW[active] * size);
    }
  };
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    const textures = new Map();
    const load = (file) => {
      if (!textures.has(file)) {
        textures.set(file, new Promise((resolve) => loader.load(`${SCENE_MODELS}/${file}.webp`, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          resolve(texture);
        }, undefined, () => resolve(null))));
      }
      return textures.get(file);
    };
    BODHI_SPRITES.forEach((spec, index) => {
      if (!spec) return;
      load(spec.file).then((texture) => {
        if (!texture) return;
        const height = spec.height * size * (spec.file === 'bodhi' ? scales[index] : 1);
        const material = spriteMaterial(texture, wind, { saturation: 1 });
        // Ảnh Meshy hơi xanh nõn: dịu màu tán Bồ Đề cho hợp cây cổ thụ.
        if (spec.file === 'bodhi') material.color.set('#c4d4b4');
        const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), material, 1);
        const dummy = new THREE.Object3D();
        dummy.position.set(item.x, 0, item.z);
        dummy.scale.set(height * (texture.image.width / texture.image.height), height, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(0, dummy.matrix);
        mesh.setColorAt(0, new THREE.Color('#ffffff'));
        mesh.computeBoundingSphere();
        mesh.name = `community-bodhi-sprite-${index}`;
        root.add(mesh);
        sprites[index] = mesh;
        apply();
      });
    });
  }
  return {
    set(project) {
      const requested = Number.isSafeInteger(project?.stageIndex) ? project.stageIndex : 0;
      active = Math.max(0, Math.min(stages.length - 1, requested));
      apply();
    },
    tick(seconds) {
      wind.uWindTime.value = seconds;
    },
  };
}

// Chậu hoa kiểng: chậu sành, khóm lá, hoa điểm màu.
function addPlanter(batch, m, item) {
  const flower = item.flower === 'yellow' ? m.flowerYellow : m.flowerPink;
  batch.add(lathe([[0, 0], [0.32, 0], [0.42, 0.42], [0.46, 0.46], [0, 0.46]], 16), m.pot, { position: [item.x, 0, item.z] });
  batch.add(new THREE.IcosahedronGeometry(0.5, 1), m.leaf, { position: [item.x, 0.78, item.z], scale: [1, 0.8, 1] });
  for (let bloom = 0; bloom < 7; bloom += 1) {
    const angle = bloom * 0.9;
    batch.add(new THREE.SphereGeometry(0.09, 8, 6), flower, {
      position: [item.x + Math.cos(angle) * 0.36, 0.9 + (bloom % 3) * 0.1, item.z + Math.sin(angle) * 0.36],
    });
  }
}

// Bồn nước giữa vườn: bồn đá tròn, trụ hai tầng đài sen; mặt nước và tia nước làm riêng để chuyển động.
function addFountain(batch, m, item) {
  const radius = item.radius || 2.6;
  batch.add(new THREE.CylinderGeometry(radius + 0.25, radius + 0.35, 0.5, 40, 1, true), m.stone, { position: [item.x, 0.25, item.z] });
  batch.add(new THREE.TorusGeometry(radius + 0.28, 0.14, 8, 48), m.stone, { position: [item.x, 0.52, item.z], rotation: [Math.PI / 2, 0, 0] });
  batch.add(new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, 0.05, 40), m.darkStone, { position: [item.x, 0.03, item.z] });
  batch.add(new THREE.CylinderGeometry(0.28, 0.4, 1.3, 14), m.stone, { position: [item.x, 0.65, item.z] });
  batch.add(lathe([[0, 0], [0.9, 0.05], [1.0, 0.2], [0.95, 0.24], [0, 0.18]], 24), m.stone, { position: [item.x, 1.28, item.z] });
  batch.add(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 12), m.stone, { position: [item.x, 1.75, item.z] });
  batch.add(lathe([[0, 0], [0.5, 0.04], [0.56, 0.16], [0, 0.12]], 20), m.stone, { position: [item.x, 2.08, item.z] });
  for (let petal = 0; petal < 8; petal += 1) {
    const angle = (petal / 8) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(0.12, 8, 6), m.flowerPink, {
      position: [item.x + Math.cos(angle) * 0.14, 2.32, item.z + Math.sin(angle) * 0.14], scale: [0.6, 1.3, 0.6], rotation: [Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5],
    });
  }
}

// Khu Quan Âm riêng: nền đá tròn, hàng cây xén bao quanh chừa lối vào phía trước tượng, bàn thờ nhỏ, đèn đá, bình hoa.
function addGuanyinGarden(batch, m, item, lanternGlows) {
  const front = { ...item, scale: 1 };
  const garden = item.garden || {};
  const platformRadius = garden.platformRadius || 5.2;
  const hedgeRadius = garden.radius || 5.6;
  const hedgeCount = garden.hedgeCount || 22;
  const entryHalfAngle = garden.entryHalfAngle ?? 0.5;
  const altar = garden.altar || { x: 0, z: 3, width: 1.4, depth: 0.6 };
  const lanterns = garden.lanterns || [{ x: -2.4, z: 3.4 }, { x: 2.4, z: 3.4 }];
  batch.add(new THREE.CylinderGeometry(platformRadius, platformRadius, 0.06, 48), m.stone, { position: [item.x, 0.03, item.z] });
  batch.add(new THREE.TorusGeometry(platformRadius, 0.12, 6, 64), m.darkStone, { position: [item.x, 0.07, item.z], rotation: [Math.PI / 2, 0, 0] });
  for (let index = 0; index < hedgeCount; index += 1) {
    const local = (index / hedgeCount) * Math.PI * 2;
    // Chừa lối vào phía trước tượng (hướng +z cục bộ).
    if (Math.abs(Math.atan2(Math.sin(local), Math.cos(local))) < entryHalfAngle) continue;
    batch.add(new THREE.IcosahedronGeometry(0.62, 1), m.leafDark, { position: localTransform(front, [Math.sin(local) * hedgeRadius, 0.55, Math.cos(local) * hedgeRadius]), scale: [1.2, 0.85, 1] });
  }
  const at = (local) => localTransform(front, local);
  batch.add(new THREE.BoxGeometry(altar.width, 0.8, altar.depth), m.wood, { position: at([altar.x, 0.4, altar.z]), rotation: [0, item.ry || 0, 0] });
  batch.add(new THREE.BoxGeometry(altar.width + 0.1, 0.06, altar.depth + 0.1), m.lantern, { position: at([altar.x, 0.82, altar.z]), rotation: [0, item.ry || 0, 0] });
  batch.add(lathe([[0, 0], [0.14, 0], [0.18, 0.12], [0.16, 0.16], [0, 0.16]], 14), m.bronze, { position: at([altar.x, 0.85, altar.z]) });
  for (const side of [-1, 1]) {
    batch.add(lathe([[0, 0], [0.08, 0], [0.12, 0.18], [0.06, 0.32], [0.08, 0.36], [0, 0.36]], 12), m.whiteStone, { position: at([altar.x + side * 0.5, 0.85, altar.z]) });
    batch.add(new THREE.IcosahedronGeometry(0.14, 1), m.flowerPink, { position: at([altar.x + side * 0.5, 1.28, altar.z]) });
  }
  for (const itemLantern of lanterns) {
    const lantern = at([itemLantern.x, 0, itemLantern.z]);
    batch.add(new THREE.BoxGeometry(0.5, 0.18, 0.5), m.darkStone, { position: [lantern[0], 0.09, lantern[2]] });
    batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), m.stone, { position: [lantern[0], 0.63, lantern[2]] });
    batch.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), m.paper, { position: [lantern[0], 1.32, lantern[2]] });
    batch.add(new THREE.ConeGeometry(0.4, 0.32, 4), m.darkStone, { position: [lantern[0], 1.65, lantern[2]], rotation: [0, Math.PI / 4, 0] });
    lanternGlows.push(new THREE.Vector3(lantern[0], 1.32, lantern[2]));
  }
}

// Khu vui chơi thú cưng lấy toàn bộ vị trí từ scene: thảm cỏ riêng, hàng rào có cổng, nhà trú, ống chui,
// cầu thăng bằng, vòng nhảy, bát ăn và bóng. Các khối tĩnh được gộp cùng sân để không tăng nhiều draw call.
function addPetZone(root, batch, m, zone, signs) {
  const area = zone.area;
  if (!area?.x || !area?.z) return;
  const grass = new THREE.Mesh(groundShape(area, [], 0.014), m.petGrass);
  grass.receiveShadow = true;
  root.add(grass);

  for (const [x0, z0, x1, z1] of zone.fence || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    for (const y of [0.3, 0.68]) batch.add(new THREE.BoxGeometry(0.08, 0.08, length), m.fence, { position: [x, y, z], rotation: [0, ry, 0] });
    const posts = Math.max(1, Math.ceil(length / 1.8));
    for (let index = 0; index <= posts; index += 1) {
      const ratio = index / posts;
      batch.add(new THREE.BoxGeometry(0.12, 0.9, 0.12), m.wood, {
        position: [x0 + (x1 - x0) * ratio, 0.45, z0 + (z1 - z0) * ratio],
      });
    }
  }

  const entrance = zone.entrance;
  if (entrance) {
    const sideX = Math.cos(entrance.ry || 0);
    const sideZ = -Math.sin(entrance.ry || 0);
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.18, 1.9, 0.18), m.wood, {
      position: [entrance.x + sideX * entrance.width * 0.5 * side, 0.95, entrance.z + sideZ * entrance.width * 0.5 * side],
    });
    signs.push({ text: zone.sign, width: Math.max(2.8, entrance.width), height: 0.58, position: [entrance.x, 1.68, entrance.z], ry: entrance.ry || 0 });
  }

  const at = (item, point) => localTransform({ ...item, scale: 1 }, point);
  for (const item of zone.props || []) {
    if (item.type === 'house') {
      batch.add(new THREE.BoxGeometry(2.3, 1.25, 1.7), m.wall, { position: at(item, [0, 0.62, 0]), rotation: [0, item.ry || 0, 0] });
      batch.add(new THREE.ConeGeometry(1.7, 0.9, 4), m.roof, { position: at(item, [0, 1.68, 0]), rotation: [0, (item.ry || 0) + Math.PI / 4, 0], scale: [1, 1, 0.75] });
      batch.add(new THREE.BoxGeometry(0.75, 0.85, 0.12), m.wood, { position: at(item, [0, 0.43, 0.91]), rotation: [0, item.ry || 0, 0] });
    } else if (item.type === 'tunnel') {
      for (let step = -2; step <= 2; step += 1) batch.add(new THREE.TorusGeometry(0.62, 0.09, 8, 18), step % 2 ? m.gold : m.lantern, {
        position: at(item, [0, 0.62, step * 0.42]), rotation: [0, item.ry || 0, 0],
      });
    } else if (item.type === 'seesaw') {
      batch.add(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 10), m.darkStone, { position: at(item, [0, 0.25, 0]) });
      batch.add(new THREE.BoxGeometry(3, 0.13, 0.45), m.gold, { position: at(item, [0, 0.58, 0]), rotation: [0.12, item.ry || 0, 0.08] });
    } else if (item.type === 'hoop') {
      batch.add(new THREE.TorusGeometry(0.66, 0.07, 8, 22), m.lantern, { position: at(item, [0, 0.82, 0]), rotation: [0, item.ry || 0, 0] });
      for (const side of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.035, 0.045, 0.75, 7), m.gold, { position: at(item, [side * 0.66, 0.38, 0]) });
    } else if (item.type === 'bowls') {
      for (const side of [-1, 1]) {
        batch.add(new THREE.CylinderGeometry(0.32, 0.24, 0.14, 16), side < 0 ? m.lantern : m.water, { position: at(item, [side * 0.42, 0.08, 0]) });
        if (side < 0) for (let crumb = 0; crumb < 5; crumb += 1) batch.add(new THREE.SphereGeometry(0.035, 6, 4), m.wood, { position: at(item, [side * 0.42 + (crumb - 2) * 0.06, 0.17, 0]) });
      }
    } else if (item.type === 'balls') {
      ['#e95045', '#f0bd49', '#4b8dc8'].forEach((color, index) => batch.add(new THREE.SphereGeometry(0.18 + index * 0.03, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }), {
        position: at(item, [(index - 1) * 0.42, 0.2 + index * 0.02, (index % 2) * 0.22]),
      }));
    } else if (item.type === 'barn') {
      // Chuồng gỗ đỏ mái dốc, cửa trắng chéo kiểu nông trại.
      const ry = item.ry || 0;
      batch.add(new THREE.BoxGeometry(4.2, 2.1, 3.2), m.barn, { position: at(item, [0, 1.05, 0]), rotation: [0, ry, 0] });
      for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(2.45, 0.12, 3.5), m.roof, {
        position: at(item, [side * 1.08, 2.62, 0]), rotation: [0, ry, side * -0.62, 'YXZ'],
      });
      batch.add(new THREE.BoxGeometry(1.5, 1.55, 0.08), m.barnTrim, { position: at(item, [0, 0.78, 1.62]), rotation: [0, ry, 0] });
      for (const tilt of [-0.8, 0.8]) batch.add(new THREE.BoxGeometry(0.1, 2.05, 0.1), m.barnTrim, { position: at(item, [0, 0.78, 1.67]), rotation: [0, ry, tilt, 'YXZ'] });
    } else if (item.type === 'trough') {
      batch.add(new THREE.BoxGeometry(0.75, 0.42, 2.0), m.wood, { position: at(item, [0, 0.36, 0]), rotation: [0, item.ry || 0, 0] });
      batch.add(new THREE.BoxGeometry(0.6, 0.06, 1.85), m.hay, { position: at(item, [0, 0.58, 0]), rotation: [0, item.ry || 0, 0] });
      for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.1, 0.36, 0.1), m.wood, { position: at(item, [0, 0.12, side * 0.85]) });
    } else if (item.type === 'hay') {
      batch.add(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16), m.hay, { position: at(item, [0, 0.55, 0]), rotation: [Math.PI / 2, item.ry || 0, 0, 'YXZ'] });
    } else if (item.type === 'duckpond') {
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), m.lakeWater);
      water.rotation.x = -Math.PI / 2;
      water.scale.set(1.65, 1.3, 1);
      water.position.set(item.x, 0.05, item.z);
      root.add(water);
      // Bờ đá: mô hình đá Meshy; tải lỗi thì giữ đá khối (nhóm dự phòng riêng).
      const fallback = new StaticBatch();
      const rocks = [];
      for (let index = 0; index < 14; index += 1) {
        const angle = (index / 14) * Math.PI * 2;
        const position = [item.x + Math.cos(angle) * 1.78, 0.08, item.z + Math.sin(angle) * 1.42];
        fallback.add(new THREE.SphereGeometry(0.2 + (index % 3) * 0.04, 8, 6), m.stone, { position, scale: [1.2, 0.55, 1] });
        rocks.push({ x: position[0], y: -0.04, z: position[2], ry: index * 1.9, s: 0.75 + (index % 3) * 0.2 });
      }
      const fallbackGroup = new THREE.Group();
      fallback.build(fallbackGroup, { castShadow: true, receiveShadow: true });
      root.add(fallbackGroup);
      instanceProp(root, `${SCENE_MODELS}/rock.glb`, rocks, { size: 0.5 }, { brighten: 0.35 }).then((group) => { if (group) fallbackGroup.visible = false; });
      // Lá súng nổi và lau sậy ở mép phía bắc.
      for (let index = 0; index < 6; index += 1) {
        const angle = index * 2.4;
        batch.add(new THREE.CircleGeometry(0.16 + (index % 2) * 0.05, 10, 0.4, Math.PI * 2 - 0.4), m.lilyPad, {
          position: [item.x + Math.cos(angle) * 0.9, 0.065, item.z + Math.sin(angle) * 0.7], rotation: [-Math.PI / 2, 0, angle],
        });
      }
      addReeds(batch, m, { x: item.x, z: item.z, rx: 1.65, rz: 1.3, angles: [1.3, 4.6], y: 0.05, scale: 0.55, count: 6 });
    } else if (item.type === 'duckhouse') {
      placeProp(root, `${SCENE_MODELS}/duckhouse.glb`, { x: item.x, z: item.z, ry: item.ry || 0, height: 1.1 });
    }
  }
}

export function buildCourtyard({ root, scene3d, renderer, camera, world, themeBase = null, stateBase = null }) {
  const data = world.courtyard;
  // Mặt nước hồ sen lớn và ao vịt dùng chung một vật liệu (một lần biên dịch shader).
  const lakeWater = createWaterMaterial();
  const ground = data.ground;
  const m = {
    tiles: new THREE.MeshStandardMaterial({ map: stoneTiles([(ground.x[1] - ground.x[0]) / 6, (ground.z[1] - ground.z[0]) / 6]), roughness: 0.92 }),
    stone: new THREE.MeshStandardMaterial({ color: '#a7a39a', roughness: 0.85 }),
    darkStone: new THREE.MeshStandardMaterial({ color: '#6d6a64', roughness: 0.9 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6b4a24', metalness: 0.75, roughness: 0.38, envMapIntensity: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.6, roughness: 0.35, emissive: '#3a2604', emissiveIntensity: 0.4 }),
    pillar: new THREE.MeshStandardMaterial({ color: '#9b1d16', roughness: 0.55 }),
    wall: new THREE.MeshStandardMaterial({ color: '#a8402c', roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: bricks([6, 1]), roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: '#3a2b26', roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a2a17', roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35', roughness: 0.9, flatShading: true }),
    leafDark: new THREE.MeshStandardMaterial({ color: '#2f5a33', roughness: 0.9, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.95 }),
    grass: grassMaterial('all', renderer),
    petGrass: grassMaterial('pets', renderer),
    arhatStone: new THREE.MeshStandardMaterial({ color: '#b6925e', roughness: 0.92 }),
    whiteStone: new THREE.MeshStandardMaterial({ color: '#f1eee5', roughness: 0.72 }),
    pot: new THREE.MeshStandardMaterial({ color: '#8b3e28', roughness: 0.88 }),
    soil: new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 }),
    fence: new THREE.MeshStandardMaterial({ color: '#c9a36a', roughness: 0.85 }),
    barn: new THREE.MeshStandardMaterial({ color: '#a8342a', roughness: 0.82 }),
    barnTrim: new THREE.MeshStandardMaterial({ color: '#f2ead8', roughness: 0.8 }),
    hay: new THREE.MeshStandardMaterial({ color: '#d9b45a', roughness: 0.95 }),
    reed: new THREE.MeshStandardMaterial({ color: '#5f8a3a', roughness: 0.9 }),
    cattail: new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.95 }),
    lilyPad: new THREE.MeshStandardMaterial({ color: '#3f7a35', roughness: 0.8, side: THREE.DoubleSide }),
    gravel: new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1 }),
    flowerViolet: new THREE.MeshStandardMaterial({ color: '#a77be0', roughness: 0.8 }),
    plotNumbers: new THREE.MeshStandardMaterial({ map: plotNumberTexture(), roughness: 0.7 }),
    flowerPink: new THREE.MeshStandardMaterial({ color: '#e9789d', roughness: 0.8 }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: '#f0bd49', roughness: 0.8 }),
    bodhiLeaf: new THREE.MeshStandardMaterial({ color: '#5f8f3e', roughness: 0.85, flatShading: true }),
    arhatFace: new THREE.MeshStandardMaterial({ map: arhatFaceTexture(), transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
    guanyinFace: new THREE.MeshStandardMaterial({ map: guanyinFaceTexture(), transparent: true, roughness: 0.72, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
    paper: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 1.2, roughness: 0.6 }),
    lantern: new THREE.MeshStandardMaterial({ color: '#d23a2a', emissive: '#b8281a', emissiveIntensity: 0.9, roughness: 0.6 }),
    water: new THREE.MeshStandardMaterial({ color: '#3c7979', metalness: 0.25, roughness: 0.24, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    // Mặt hồ phải đọc được rõ trên cả màn hình sáng: vẫn trong để thấy cá nhưng đủ màu/độ phản sáng để không giống hồ cạn.
    pondWater: new THREE.MeshStandardMaterial({
      color: '#35a8bb', emissive: '#0a3942', emissiveIntensity: 0.2,
      metalness: 0.05, roughness: 0.2, transparent: true, opacity: 0.64,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    pondBed: new THREE.MeshStandardMaterial({ color: '#6b6a4e', roughness: 1, side: THREE.BackSide }),
    lakeWater: lakeWater.material,
    rock: new THREE.MeshStandardMaterial({ color: '#7d7a72', roughness: 0.95, flatShading: true }),
    koi: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
  };
  const glowTexture = softDot('rgba(255, 210, 140, 1)');
  const smokeTexture = softDot('rgba(238, 232, 222, 0.6)');
  const casters = [];
  const batch = new StaticBatch();
  const midX = (ground.x[0] + ground.x[1]) / 2;
  const midZ = (ground.z[0] + ground.z[1]) / 2;

  // ---- Nền: đá lát cả sân, hoặc (floor: 'grass') bãi cỏ có lối đá (paths) và khoét lỗ cho hồ lớn ----
  const pond = data.pond;
  const bigPond = Boolean(pond && pond.depth);
  if (data.floor === 'grass') {
    const grass = new THREE.Mesh(groundShape(ground, bigPond ? [{ x: pond.x, z: pond.z, rx: pond.radiusX + 0.35, rz: pond.radiusZ + 0.35 }] : [], 0.002),
      m.grass);
    grass.receiveShadow = true;
    root.add(grass);
    const tiles = stoneTiles([1, 1]);
    tiles.repeat.set(1 / 6, 1 / 6);
    const pathMaterial = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.92 });
    for (const rect of data.paths || []) {
      const path = new THREE.Mesh(groundShape(rect, [], 0.006), pathMaterial);
      path.receiveShadow = true;
      root.add(path);
    }
  } else {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ground.x[1] - ground.x[0], ground.z[1] - ground.z[0]), m.tiles);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, 0.002, midZ);
    floor.receiveShadow = true;
    root.add(floor);
  }
  const bakedShadow = new THREE.Mesh(
    groundPlane(ground, 0.012),
    new THREE.MeshBasicMaterial({
      map: bakedCourtyardShadows(data), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    }),
  );
  bakedShadow.renderOrder = 1;
  root.add(bakedShadow);
  for (const lawn of data.lawns || []) {
    const rect = {
      x: [lawn.x - lawn.width / 2, lawn.x + lawn.width / 2],
      z: [lawn.z - lawn.depth / 2, lawn.z + lawn.depth / 2],
    };
    const grass = new THREE.Mesh(groundShape(rect, [], 0.007), m.grass);
    grass.receiveShadow = true;
    root.add(grass);
  }
  // Đất ngoài sân (cỏ khô) tới chân núi.
  // Khoét cùng lỗ hồ lớn để thấy được lòng hồ bên dưới.
  const fieldHoles = bigPond ? [{ x: pond.x, z: pond.z, rx: pond.radiusX + 0.35, rz: pond.radiusZ + 0.35 }] : [];
  const field = new THREE.Mesh(groundShape({ x: [-120, 120], z: [midZ - 80, midZ + 160] }, fieldHoles, -0.02), m.grass);
  field.receiveShadow = true;
  root.add(field);

  // ---- Mặt tiền, mái, hiên chánh điện và cổng tam quan: dựng theo vùng phong cảnh (landscape/common.mjs: buildTemple) ----
  const frontZ = ground.z[0];
  // Kích thước chánh điện (world.hall): tường, mái và thềm ôm theo.
  const hall = hallLayout(world);
  const hw = hall.halfWidth;
  const lanternGlows = [];

  // ---- Lư hương đồng lớn trên bệ đá giữa sân ----
  const burner = new THREE.Group();
  burner.position.set(data.burner.x, 0, data.burner.z);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.7), m.stone);
  pedestal.position.y = 0.375;
  const pedestalTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), m.darkStone);
  pedestalTop.position.y = 0.8;
  const pot = new THREE.Mesh(lathe([[0, 0], [0.45, 0.05], [0.62, 0.3], [0.7, 0.62], [0.66, 0.86], [0.58, 0.92], [0.62, 0.98], [0, 0.98]]), m.bronze);
  pot.position.y = 1.18;
  const neck = new THREE.Mesh(lathe([[0, 0], [0.28, 0], [0.22, 0.2], [0.36, 0.26], [0, 0.26]]), m.bronze);
  neck.position.y = 0.9;
  burner.add(pedestal, pedestalTop, neck, pot);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 18), m.bronze);
    handle.position.set(s * 0.74, 1.95, 0);
    handle.rotation.y = Math.PI / 2;
    burner.add(handle);
  }
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), m.darkStone);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 2.12;
  burner.add(ash);
  // Bó nhang cắm giữa lư.
  for (let index = 0; index < 9; index += 1) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), m.lantern);
    stick.position.set(Math.cos(index * 0.7) * 0.12, 2.45, Math.sin(index * 0.7) * 0.12);
    stick.rotation.set(Math.sin(index) * 0.08, 0, Math.cos(index) * 0.08);
    burner.add(stick);
  }
  burner.traverse((item) => { if (item.isMesh) casters.push(item); });
  root.add(burner);

  // ---- Đài ngắm cảnh ngoài cổng (data.overlook): lối đá + đài bát giác lan can đá, mặt đá sát đất (0,1 m, nằm trên mặt
  // nước của các bang ven biển); bó vỉa / chân lan can che khe giữa mặt đá và nền. ----
  if (data.overlook) buildOverlook(batch, root, m, data.overlook);
  // ---- Rừng thiền ngoài cổng hông phía tây (data.grove): cổng gỗ, lối đá, vòng lối quanh hồ sen, bến gỗ, thủy đình. Cây
  // của rừng do lớp phong cảnh vẽ theo vùng (landscape3d: grove.trees). ----
  if (data.grove) buildGrove(batch, root, m, data.grove);

  // ---- Đèn đá hai bên lối đi ----
  for (const [x, z] of data.lanterns) {
    batch.add(new THREE.BoxGeometry(0.5, 0.18, 0.5), m.darkStone, { position: [x, 0.09, z] });
    batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), m.stone, { position: [x, 0.63, z] });
    batch.add(new THREE.BoxGeometry(0.46, 0.08, 0.46), m.stone, { position: [x, 1.1, z] });
    batch.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), m.paper, { position: [x, 1.32, z] });
    batch.add(new THREE.ConeGeometry(0.4, 0.32, 4), m.darkStone, { position: [x, 1.65, z], rotation: [0, Math.PI / 4, 0] });
    lanternGlows.push(new THREE.Vector3(x, 1.32, z));
  }

  // ---- Đại hồng chung và trống lớn hai bên thềm ----
  for (const item of data.instruments || []) addInstrument(batch, m, item);

  // ---- Cây đa lớn, tùng: dựng theo vùng phong cảnh (landscape3d.mjs, setTheme bên dưới); bồ đề, bụi cây ở đây ----
  const treeBatch = new StaticBatch();
  if (data.bodhi && !data.bodhi.projectId) addBodhi(treeBatch, batch, m, data.bodhi);
  const trees = new THREE.Group();
  treeBatch.build(trees, { castShadow: true });
  root.add(trees);
  trees.traverse((item) => { if (item.isMesh) casters.push(item); });
  const communityBodhi = data.bodhi?.projectId
    ? buildCommunityBodhi({ root, casters, materials: m, item: data.bodhi })
    : null;
  for (const [x, z] of data.bushes || []) {
    batch.add(new THREE.IcosahedronGeometry(0.75, 1), m.leaf, { position: [x, 0.5, z], scale: [1.3, 0.75, 1] });
  }

  // ---- Hồ cá lớn (pond.depth): lòng hồ khoét xuống dưới mặt cỏ, bờ đá, lá sen, cá koi bơi dưới mặt nước ----
  const koi = [];
  let koiMesh = null;
  let communityLotus = null;
  let lotusFloats = null;
  if (bigPond) {
    const stagedPond = Boolean(pond.projectId);
    const rockBatch = stagedPond ? new StaticBatch() : batch;
    const lotusBatch = stagedPond ? new StaticBatch() : batch;
    const depth = pond.depth;
    const bed = new THREE.Mesh(lathe([[0, -depth], [0.55, -depth * 0.96], [0.85, -depth * 0.7], [0.97, -depth * 0.3], [1, 0.01]], 48), m.pondBed);
    bed.scale.set(pond.radiusX + 0.35, 1, pond.radiusZ + 0.35);
    bed.position.set(pond.x, 0, pond.z);
    root.add(bed);
    // Mặt nước (water3d.mjs): giữa hồ thẫm, mép nhạt, gợn sóng ánh sáng và viền bọt sát bờ.
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 72), m.lakeWater);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(pond.radiusX + 0.3, pond.radiusZ + 0.3, 1);
    water.position.set(pond.x, -0.14, pond.z);
    water.renderOrder = 2;
    // Hồ cá là cảnh nền có sẵn: mặt nước không được biến mất trong lúc chờ tải tiến độ công trình hồ sen.
    if (stagedPond) water.visible = (pond.stageVisibility?.water ?? 1) === 0;
    root.add(water);
    // Bờ đá: đá to nhỏ xen nhau theo chu vi elip.
    const perimeter = Math.PI * 2 * Math.sqrt((pond.radiusX ** 2 + pond.radiusZ ** 2) / 2);
    const rocks = Math.round(perimeter / 0.75);
    for (let index = 0; index < rocks; index += 1) {
      const angle = (index / rocks) * Math.PI * 2;
      const size = 0.32 + ((index * 37) % 7) * 0.05;
      rockBatch.add(new THREE.DodecahedronGeometry(size, 0), m.rock, {
        position: [pond.x + Math.cos(angle) * (pond.radiusX + 0.42), size * 0.35, pond.z + Math.sin(angle) * (pond.radiusZ + 0.42)],
        rotation: [index * 0.7, index * 1.3, 0], scale: [1.3, 0.75, 1],
      });
    }
    // Lá sen và hoa sen nổi trên mặt nước (dồn về một phía để chừa chỗ ngắm cá).
    for (let index = 0; index < 22; index += 1) {
      const angle = index * 2.39996;
      const reach = 0.35 + 0.55 * Math.sqrt((index + 0.5) / 22);
      const x = pond.x - Math.abs(Math.cos(angle)) * reach * pond.radiusX * 0.9;
      const z = pond.z + Math.sin(angle) * reach * pond.radiusZ * 0.9;
      const radius = 0.32 + (index % 4) * 0.08;
      lotusBatch.add(new THREE.CircleGeometry(radius, 14, 0.4, Math.PI * 2 - 0.4), m.leaf, {
        position: [x, -0.12, z], rotation: [-Math.PI / 2, 0, index * 0.9],
      });
      if (index % 4 === 1) {
        lotusBatch.add(new THREE.SphereGeometry(0.13, 10, 7), m.flowerPink, { position: [x, -0.02, z], scale: [1, 0.85, 1] });
      }
    }
    // Cá koi: một InstancedMesh, mỗi con bơi vòng elip riêng ở độ sâu riêng, đuôi lắc theo nhịp bơi.
    const count = Math.min(60, pond.fish ?? 20);
    const colors = ['#f26b1d', '#ffffff', '#f5b323', '#e8432c', '#f4f0e6', '#ff8a3d'];
    koiMesh = new THREE.InstancedMesh(koiGeometry(), m.koi, count);
    koiMesh.frustumCulled = false;
    for (let index = 0; index < count; index += 1) {
      const a = 0.25 + ((index * 53) % 60) / 100;
      koi.push({
        cx: pond.x + (((index * 29) % 11) / 11 - 0.5) * pond.radiusX * 0.5,
        cz: pond.z + (((index * 17) % 7) / 7 - 0.5) * pond.radiusZ * 0.5,
        ax: a * pond.radiusX * 0.6,
        az: a * pond.radiusZ * 0.6,
        speed: (0.18 + ((index * 7) % 5) * 0.05) * (index % 2 ? 1 : -1),
        phase: index * 1.7,
        y: -0.3 - ((index * 13) % 5) * 0.08,
        size: 1.1 + ((index * 11) % 6) * 0.12,
      });
      koiMesh.setColorAt(index, new THREE.Color(colors[index % colors.length]));
    }
    if (stagedPond) koiMesh.visible = (pond.stageVisibility?.fish ?? 4) === 0;
    root.add(koiMesh);
    // Mô hình Meshy: đá bờ (thay đá khối khi tải xong) và sen nở trên lá; vị trí theo cùng vòng elip với bản khối.
    const rockCount = Math.round(perimeter / 1.1);
    const rockItems = Array.from({ length: rockCount }, (_, index) => {
      const angle = (index / rockCount) * Math.PI * 2 + ((index * 17) % 5) * 0.01;
      const out = 0.38 + ((index * 23) % 5) * 0.06;
      return { x: pond.x + Math.cos(angle) * (pond.radiusX + out), y: -0.12, z: pond.z + Math.sin(angle) * (pond.radiusZ + out), ry: index * 2.3, s: 0.8 + ((index * 31) % 6) * 0.12 };
    });
    const lotusItems = Array.from({ length: 12 }, (_, index) => {
      const angle = index * 2.39996 + 0.7;
      const reach = 0.3 + 0.55 * Math.sqrt((index + 0.5) / 12);
      return { x: pond.x - Math.abs(Math.cos(angle)) * reach * pond.radiusX * 0.88, y: -0.16, z: pond.z + Math.sin(angle) * reach * pond.radiusZ * 0.88, ry: index * 1.3, s: 0.8 + (index % 3) * 0.18 };
    });
    // Đèn đá bên bờ (luôn hiện, không theo giai đoạn công trình) và lau sậy ở mép phía tây.
    for (const lantern of pond.lanterns || []) {
      placeProp(root, `${SCENE_MODELS}/lantern.glb`, { x: lantern.x, z: lantern.z, ry: lantern.ry || 0, height: 1.35 });
      lanternGlows.push(new THREE.Vector3(lantern.x, 0.95, lantern.z));
    }
    // Lau sậy từng cụm quanh bờ: hồ công trình thì mọc từ giai đoạn "Dẫn nước", hồ thường thì luôn có.
    const reedBatch = stagedPond ? new StaticBatch() : batch;
    addReeds(reedBatch, m, { x: pond.x, z: pond.z, rx: pond.radiusX + 0.3, rz: pond.radiusZ + 0.3, angles: [0.5, 1.2, 2.6, 3.0, 3.5, 4.0, 5.1, 5.8], y: -0.14 });
    if (stagedPond) {
      const reedGroup = new THREE.Group();
      reedGroup.name = 'community-lotus-reeds';
      reedBatch.build(reedGroup, { castShadow: true, receiveShadow: true });
      reedGroup.visible = false;
      root.add(reedGroup);
      // Hoàn thành: đèn hoa đăng (đài sen giấy hồng, ngọn nến) trôi chậm trên mặt hồ, phía chừa trống của lá sen.
      const floatCount = 12;
      const cup = lathe([[0, 0], [0.1, 0.01], [0.16, 0.06], [0.2, 0.15], [0.14, 0.12], [0.1, 0.06], [0, 0.05]], 8);
      const paper = new THREE.InstancedMesh(cup, new THREE.MeshStandardMaterial({ color: '#ffb7cb', emissive: '#ff6f98', emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide }), floatCount);
      const flame = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd76a', toneMapped: false }), floatCount);
      for (const mesh of [paper, flame]) {
        mesh.frustumCulled = false;
        mesh.visible = false;
        root.add(mesh);
      }
      const floats = Array.from({ length: floatCount }, (_, index) => ({
        a: 0.25 + ((index * 37) % 10) / 20,
        speed: (0.03 + ((index * 13) % 5) * 0.008) * (index % 2 ? 1 : -1),
        phase: index * 2.1,
        size: 0.9 + ((index * 7) % 4) * 0.12,
      }));
      const floatDummy = new THREE.Object3D();
      lotusFloats = (seconds) => {
        if (!paper.visible) return;
        floats.forEach((item, index) => {
          const t = seconds * item.speed + item.phase;
          // Chỉ trôi ở nửa hồ phía đông (nửa tây là lá sen).
          const x = pond.x + Math.abs(Math.cos(t)) * item.a * pond.radiusX * 0.85;
          const z = pond.z + Math.sin(t) * item.a * pond.radiusZ * 0.85;
          floatDummy.position.set(x, -0.15 + Math.sin(seconds * 1.3 + item.phase) * 0.01, z);
          floatDummy.rotation.set(0, t, 0);
          floatDummy.scale.setScalar(item.size);
          floatDummy.updateMatrix();
          paper.setMatrixAt(index, floatDummy.matrix);
          floatDummy.position.y += 0.14 * item.size;
          floatDummy.scale.setScalar(item.size * (0.9 + Math.sin(seconds * 9 + index) * 0.12));
          floatDummy.updateMatrix();
          flame.setMatrixAt(index, floatDummy.matrix);
        });
        paper.instanceMatrix.needsUpdate = true;
        flame.instanceMatrix.needsUpdate = true;
      };
      const fullKoi = koiMesh.count;
      const rocksGroup = new THREE.Group();
      const lotusGroup = new THREE.Group();
      rocksGroup.name = 'community-lotus-rocks';
      lotusGroup.name = 'community-lotus-plants';
      rockBatch.build(rocksGroup, { castShadow: true, receiveShadow: true });
      lotusBatch.build(lotusGroup, { castShadow: true, receiveShadow: true });
      const rockFallback = [...rocksGroup.children];
      instanceProp(rocksGroup, `${SCENE_MODELS}/rock.glb`, rockItems, { size: 0.85 }, { brighten: 0.35 }).then((group) => {
        if (group) for (const child of rockFallback) child.visible = false;
      });
      instanceProp(lotusGroup, `${SCENE_MODELS}/lotus.glb`, lotusItems, { width: 0.95 });
      rocksGroup.visible = false;
      lotusGroup.visible = false;
      root.add(rocksGroup, lotusGroup);
      rocksGroup.traverse((child) => { if (child.isMesh) casters.push(child); });
      lotusGroup.traverse((child) => { if (child.isMesh) casters.push(child); });
      // Giai đoạn mở từng phần (scene có thể ghi đè): reeds lau sậy, rocks bờ đá, lotus sen, floats đèn hoa đăng +
      // đủ đàn cá (trước đó chỉ nửa đàn).
      const visibility = { water: 0, reeds: 1, rocks: 2, lotus: 3, fish: 0, floats: 4, ...pond.stageVisibility };
      communityLotus = {
        set(project) {
          const stageIndex = Number.isSafeInteger(project?.stageIndex) ? Math.max(0, Math.min(4, project.stageIndex)) : 0;
          water.visible = stageIndex >= visibility.water;
          reedGroup.visible = stageIndex >= visibility.reeds;
          rocksGroup.visible = stageIndex >= visibility.rocks;
          lotusGroup.visible = stageIndex >= visibility.lotus;
          koiMesh.visible = stageIndex >= visibility.fish;
          koiMesh.count = stageIndex >= visibility.floats ? fullKoi : Math.ceil(fullKoi / 2);
          paper.visible = flame.visible = stageIndex >= visibility.floats;
        },
      };
    }
  } else if (pond) {
    // ---- Hồ sen nhỏ: bờ đá và lá gộp vào batch, chỉ mặt nước là một mesh trong suốt riêng ----
    batch.add(new THREE.CylinderGeometry(1, 1, 0.16, 32), m.darkStone, {
      position: [pond.x, 0.08, pond.z], scale: [pond.radiusX + 0.22, 1, pond.radiusZ + 0.22],
    });
    batch.add(new THREE.CylinderGeometry(1, 1, 0.08, 32), m.stone, {
      position: [pond.x, 0.17, pond.z], scale: [pond.radiusX + 0.08, 1, pond.radiusZ + 0.08],
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), m.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, 0.225, pond.z);
    water.scale.set(pond.radiusX, pond.radiusZ, 1);
    water.receiveShadow = true;
    root.add(water);
    const lotusOffsets = [
      [-0.52, -0.28, 0.3], [0.42, -0.18, 0.26], [-0.12, 0.34, 0.34], [0.68, 0.35, 0.23], [-0.72, 0.38, 0.2],
    ];
    for (let index = 0; index < lotusOffsets.length; index += 1) {
      const [offsetX, offsetZ, radius] = lotusOffsets[index];
      const x = pond.x + offsetX * pond.radiusX;
      const z = pond.z + offsetZ * pond.radiusZ;
      batch.add(new THREE.CircleGeometry(radius, 16), m.leaf, {
        position: [x, 0.24, z], rotation: [-Math.PI / 2, 0, index * 0.7], scale: [1, 0.72, 1],
      });
      if (index === 1 || index === 3) {
        batch.add(new THREE.SphereGeometry(0.1, 10, 7), m.lantern, { position: [x, 0.36, z], scale: [1, 0.75, 1] });
      }
    }
  }

  // ---- Vườn chùa: 18 vị La Hán quanh sân, khu Quan Âm trắng riêng, bồn nước, chậu hoa kiểng, ghế đá ----
  // Tượng La Hán và Quan Âm dựng bằng khối nằm trong nhóm riêng: khi tải xong tượng quét thật (statues3d.mjs) thì ẩn.
  const arhatBatch = new StaticBatch();
  const guanyinBatch = new StaticBatch();
  const benchPickables = [];
  const meritBoardPickables = [];
  const lazyAssets = [];
  const benchProxyGeometry = new THREE.BoxGeometry(2.3, 1.05, 0.85);
  const benchProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  (data.arhats || []).forEach((item, index) => addArhat(arhatBatch, m, item, index));
  // Khu vui chơi: mô hình park.glb (khung xích đu, tháp + cầu tuột, đu quay…), biển tên, ghế xích đu đu được (park3d.mjs).
  const playRigs = [];
  const playMaterials = (data.benches || []).some((item) => item.kind) ? playgroundMaterials() : null;
  const parkSigns = [];
  if (data.park) {
    const parkModel = loadParkModel(root, data.park.model);
    if (parkModel?.userData.lazyAsset) lazyAssets.push(parkModel.userData.lazyAsset);
    const post = data.park.signPost;
    if (post) {
      const at = (local) => localTransform({ ...post, scale: 1 }, local);
      const postMaterial = new THREE.MeshStandardMaterial({ color: '#2f7fc1', roughness: 0.4, metalness: 0.3 });
      for (const side of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), postMaterial, { position: at([side * 0.95, 1.05, 0]) });
      parkSigns.push({ text: data.park.sign || '', position: at([0, 1.75, 0.08]), ry: post.ry || 0, width: 2.1 });
    }
  }
  for (const sign of parkSigns) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.width * 0.26), new THREE.MeshStandardMaterial({ map: textBoard(sign.text, { background: '#2f7fc1', color: '#fff6dc', border: '#f0bd49' }), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(...sign.position);
    board.rotation.y = sign.ry;
    root.add(board);
  }
  for (const item of data.benches || []) {
    if (item.kind && playMaterials) {
      playRigs.push(addPlayground({ root, item, materials: playMaterials }));
      // Vùng chạm: item.pick = [rộng, cao, sâu, tâm z local] (khung xích đu / tháp + máng trượt trong mô hình).
      const [width = 2, height = 2, depth = 2, centerZ = 0] = item.pick || [];
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), benchProxyMaterial);
      proxy.position.set(...localTransform({ ...item, scale: 1 }, [0, height / 2, centerZ]));
      proxy.rotation.y = item.ry || 0;
      proxy.userData.benchId = item.id;
      root.add(proxy);
      benchPickables.push(proxy);
      continue;
    }
    addBench(batch, m, item);
    // Mesh đơn giản chỉ dùng raycast: ghế thật đã gộp vào StaticBatch nên không còn nhận diện được từng ghế.
    const proxy = new THREE.Mesh(benchProxyGeometry, benchProxyMaterial);
    const size = item.scale || 1;
    proxy.position.set(...localTransform(item, [0, 0.55, 0], size));
    proxy.rotation.y = item.ry || 0;
    proxy.scale.setScalar(size);
    proxy.userData.benchId = item.id;
    root.add(proxy);
    benchPickables.push(proxy);
  }
  for (const item of data.planters || []) addPlanter(batch, m, item);
  // Mỗi khu có một bảng hướng dẫn vật lý; chạm bảng sẽ mở lại hộp hướng dẫn của khu đó.
  const guidePickables = [];
  const guideSigns = [];
  for (const item of data.guideBoards || []) addGuideBoard(batch, m, item, guidePickables, root, guideSigns);
  for (const sign of guideSigns) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(sign.width, sign.height),
      new THREE.MeshStandardMaterial({ map: textBoard(sign.text, { width: 1024, height: 512 }), roughness: 0.6, side: THREE.DoubleSide }),
    );
    board.position.set(...sign.position);
    board.rotation.y = sign.ry;
    root.add(board);
  }
  // Vườn Công Đức: phần tĩnh; biển tên là mesh riêng (texture chữ).
  const gardenPickables = [];
  if (data.garden) {
    const gardenSigns = [];
    const gardenModel = loadStaticModel(root, data.garden.model, 'cổng Vườn Công Đức');
    if (gardenModel?.userData.lazyAsset) lazyAssets.push(gardenModel.userData.lazyAsset);
    addGarden(batch, m, data.garden, gardenPickables, root, gardenSigns);
    for (const sign of gardenSigns) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.width * 0.24), new THREE.MeshStandardMaterial({ map: textBoard(sign.text), roughness: 0.6, side: THREE.DoubleSide }));
      board.position.set(...sign.position);
      board.rotation.y = sign.ry;
      root.add(board);
    }
  }
  // Khu tưởng niệm: phần tĩnh; biển tên là mesh riêng (texture chữ).
  const memorialPickables = [];
  if (data.memorial) {
    const memorialSigns = [];
    addMemorial(batch, m, data.memorial, memorialPickables, root, memorialSigns);
    for (const sign of memorialSigns) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.width * 0.24), new THREE.MeshStandardMaterial({ map: textBoard(sign.text, { background: '#3d3a36', color: '#f1eee5', border: '#a7a39a' }), roughness: 0.6, side: THREE.DoubleSide }));
      board.position.set(...sign.position);
      board.rotation.y = sign.ry;
      root.add(board);
    }
  }
  if (data.petZone) {
    const petSigns = [];
    addPetZone(root, batch, m, data.petZone, petSigns);
    // Nông trại nhỏ: cùng kiểu cỏ, hàng rào, cổng có bảng tên như khu thú cưng.
    if (data.farmZone) addPetZone(root, batch, m, data.farmZone, petSigns);
    for (const sign of petSigns) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.height), new THREE.MeshStandardMaterial({ map: textBoard(sign.text), roughness: 0.6, side: THREE.DoubleSide }));
      board.position.set(...sign.position);
      board.rotation.y = sign.ry;
      root.add(board);
    }
  }
  // Vườn Hoa: phần tĩnh vào batch chung; hoa và bướm là InstancedMesh riêng (flowers3d.mjs).
  const flowerGarden = data.flowerGarden ? addFlowerGarden({ root, batch, m, data: data.flowerGarden, lanternGlows }) : null;
  for (const sign of flowerGarden?.signs || []) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.height), new THREE.MeshStandardMaterial({ map: textBoard(sign.text, { background: '#b8456e', color: '#fff6dc', border: '#f0bd49' }), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(...sign.position);
    board.rotation.y = sign.ry;
    root.add(board);
  }
  if (data.guanyin) {
    addGuanyinGarden(batch, m, data.guanyin, lanternGlows);
    addGuanyin(guanyinBatch, m, data.guanyin);
  }
  const proceduralStatues = { arhats: new THREE.Group(), guanyin: new THREE.Group() };
  arhatBatch.build(proceduralStatues.arhats, { castShadow: true });
  guanyinBatch.build(proceduralStatues.guanyin, { castShadow: true });
  root.add(proceduralStatues.arhats, proceduralStatues.guanyin);
  let fountainWater = null;
  const sprays = [];
  if (data.fountain) {
    addFountain(batch, m, data.fountain);
    const radius = data.fountain.radius || 2.6;
    fountainWater = new THREE.Mesh(new THREE.CircleGeometry(radius + 0.18, 48), m.water);
    fountainWater.rotation.x = -Math.PI / 2;
    fountainWater.position.set(data.fountain.x, 0.42, data.fountain.z);
    fountainWater.receiveShadow = true;
    root.add(fountainWater);
  }

  // ---- Tường gạch thấp hai bên, cột đèn lồng (cổng tam quan và tường hai bên cổng dựng cùng chùa) ----
  // Tường phía tây chừa cổng hông ra Rừng thiền (data.grove.gate).
  const sideGate = data.grove?.gate;
  for (const s of [-1, 1]) {
    const spans = s < 0 && sideGate
      ? [[frontZ, sideGate.z - sideGate.width / 2], [sideGate.z + sideGate.width / 2, ground.z[1]]]
      : [[frontZ, ground.z[1]]];
    for (const [z0, z1] of spans) {
      batch.add(new THREE.BoxGeometry(0.4, 1.3, z1 - z0), m.brick, { position: [s * (ground.x[1] - 0.2), 0.65, (z0 + z1) / 2] });
      batch.add(new THREE.BoxGeometry(0.6, 0.12, z1 - z0), m.roof, { position: [s * (ground.x[1] - 0.2), 1.36, (z0 + z1) / 2] });
    }
    for (let z = frontZ + 2; z < ground.z[1]; z += 5) {
      if (s < 0 && sideGate && Math.abs(z - sideGate.z) < sideGate.width / 2 + 1) continue;
      batch.add(new THREE.BoxGeometry(0.3, 2.4, 0.3), m.pillar, { position: [s * (ground.x[1] - 0.6), 1.2, z] });
      batch.add(new THREE.SphereGeometry(0.22, 12, 10), m.lantern, { position: [s * (ground.x[1] - 0.6), 2.55, z], scale: [1, 1.25, 1] });
      lanternGlows.push(new THREE.Vector3(s * (ground.x[1] - 0.6), 2.55, z));
    }
  }
  // Bảng vàng công đức.
  if (data.board) {
    const { x, z } = data.board;
    batch.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), m.wood, { position: [x - 0.85, 1.1, z] });
    batch.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), m.wood, { position: [x + 0.85, 1.1, z] });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), new THREE.MeshStandardMaterial({ map: textBoard(data.board.title || '', { height: 768, background: '#1f1a14' }), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.set(x, 1.55, z + 0.07);
    root.add(board);
    // Mặt bảng mỏng và có thể được nhìn từ hai phía. Dùng hộp ẩn lớn hơn một chút làm vùng chạm để ngón tay
    // trên điện thoại vẫn chọn được bảng, đồng thời không phụ thuộc vào hướng mặt của PlaneGeometry.
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 2.35, 0.42),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.set(x, 1.18, z);
    proxy.userData.meritBoard = true;
    root.add(proxy);
    meritBoardPickables.push(proxy);
  }
  // Điểm công việc chung: đạo cụ nhỏ giúp người chơi nhận ra nơi làm việc; tương tác vẫn dựa vào khoảng cách và
  // id trong scene JSON, không raycast từ xa. Hình khối ít mặt và được gộp cùng batch để không tăng draw call.
  for (const chore of data.chores || []) {
    const { x, z, kind } = chore;
    if (kind === 'sweep') {
      // Chổi được người chơi cầm trong hoạt ảnh; tại điểm làm việc chỉ để một đống lá nhỏ nhằm tránh nhìn như có hai cây chổi.
      for (const [dx, dz, scale, material] of [
        [-0.24, -0.03, 1, m.flowerYellow],
        [-0.08, 0.08, 0.8, m.leaf],
        [0.12, -0.06, 0.9, m.flowerYellow],
        [0.25, 0.05, 0.7, m.leaf],
      ]) batch.add(new THREE.SphereGeometry(0.12, 5, 3), material, {
        position: [x + dx, 0.035, z + dz], scale: [scale * 1.5, 0.18, scale], rotation: [0, dx * 5, 0],
      });
    } else if (kind === 'water') {
      // Bình tưới được cầm trong tay khi làm; vệt nước nhỏ chỉ đánh dấu nơi tưới, không tạo thêm một bình khổng lồ cạnh người.
      batch.add(new THREE.CircleGeometry(0.3, 16), m.water, { position: [x + 0.42, 0.018, z], rotation: [-Math.PI / 2, 0, 0], scale: [1.35, 1, 1] });
    } else if (kind === 'light') {
      batch.add(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 8), m.darkStone, { position: [x, 0.31, z] });
      batch.add(new THREE.BoxGeometry(0.34, 0.36, 0.34), m.paper, { position: [x, 0.8, z] });
      batch.add(new THREE.ConeGeometry(0.42, 0.28, 4), m.darkStone, { position: [x, 1.12, z], rotation: [0, Math.PI / 4, 0] });
    } else if (kind === 'feed') {
      batch.add(new THREE.CylinderGeometry(0.32, 0.22, 0.18, 16), m.wood, { position: [x, 0.09, z] });
      batch.add(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), m.soil, { position: [x, 0.19, z] });
    } else if (kind === 'clean') {
      batch.add(new THREE.CylinderGeometry(0.26, 0.2, 0.38, 12), m.water, { position: [x, 0.19, z] });
      batch.add(new THREE.TorusGeometry(0.24, 0.025, 6, 14, Math.PI), m.darkStone, { position: [x, 0.42, z], rotation: [0, 0, Math.PI] });
      batch.add(new THREE.BoxGeometry(0.38, 0.035, 0.25), m.flowerYellow, { position: [x + 0.35, 0.06, z] });
    } else if (kind === 'tea') {
      // Bàn trà thấp kiểu ngồi bệt, vừa tầm nhân vật chibi; ấm và chén thu theo cùng tỉ lệ.
      batch.add(new THREE.BoxGeometry(0.72, 0.075, 0.42), m.wood, { position: [x, 0.34, z] });
      for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.06, 0.32, 0.06), m.wood, { position: [x + side * 0.26, 0.16, z] });
      batch.add(new THREE.SphereGeometry(0.11, 12, 8), m.bronze, { position: [x, 0.45, z], scale: [1, 0.75, 1] });
      for (const side of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 10), m.paper, { position: [x + side * 0.18, 0.42, z] });
    }
  }
  // Các khối tĩnh vẫn được gộp theo vật liệu; trên máy đủ mạnh, mỗi mesh gộp đổ bóng thật mà không tăng số mesh.
  batch.build(root, { castShadow: true });

  // ---- Bầu trời chuyển màu và núi xa ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(data.sky?.top || '#7aa6d8') }, horizon: { value: new THREE.Color(data.sky?.horizon || '#f6dcb0') } },
      vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main() { float h = clamp(normalize(vPos).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
    }),
  );
  sky.renderOrder = -1;
  scene3d.add(sky);

  // ---- Ánh nắng (chỉ khi camera ở ngoài sân) và bóng đổ ----
  const sun = new THREE.DirectionalLight('#fff1d6', 0);
  const direction = sunDirection(data);
  sun.target.position.set(midX, 0, midZ - 2);
  sun.position.set(midX + direction[0], direction[1], midZ - 2 + direction[2]);
  // Điện thoại bắt đầu bằng bóng nướng sẵn; renderer sẽ thử shadow map 512 nếu 3 giây đầu đạt 45 FPS.
  const touch = matchMedia('(pointer: coarse)').matches;
  sun.castShadow = !touch;
  sun.shadow.mapSize.set(1024, 1024);
  // Khung bóng phủ cả sân (sân lớn thì bóng mềm hơn).
  const halfWidth = (ground.x[1] - ground.x[0]) / 2 + 2;
  const halfDepth = (ground.z[1] - ground.z[0]) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -halfWidth, right: halfWidth, top: halfDepth, bottom: -halfDepth, near: 1, far: 60 + halfDepth * 2 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  const shadowRange = { near: sun.shadow.camera.near, far: sun.shadow.camera.far };
  let shadowsCleared = false;
  const skyFill = new THREE.HemisphereLight('#cfe2ff', '#6b5a3c', 0);
  scene3d.add(sun, sun.target, skyFill);
  for (const item of casters) item.castShadow = true;
  renderer.shadowMap.enabled = !touch;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Quầng sáng đèn (sprite cộng sáng, không thêm nguồn sáng); ban đêm sáng hơn và vẽ sau lớp phủ đêm.
  const GLOW_COLOR = new THREE.Color('#ffbf6a');
  const NIGHT_GLOW_COLOR = new THREE.Color('#ff781f');
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: GLOW_COLOR.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lanternGlowSprites = [];

  // ---- Trời theo giờ (daylight3d.mjs): sao, trăng, lớp phủ đêm ----
  // Lớp phủ: một tấm phủ kín màn hình nhân màu khung hình (ZERO, SRC_COLOR), làm tối mọi thứ vẽ trước nó kể cả phần
  // sáng do ánh sáng môi trường (three.js 0.160 chưa giảm được cường độ envmap cho cả cảnh). Trời và sương đã chia
  // sẵn cho màu phủ nên vẫn đúng màu đích. Ban ngày ẩn hẳn, không tốn gì.
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 tint; void main() { gl_FragColor = vec4(tint, 1.0); }',
    transparent: true, depthTest: false, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
  }));
  veil.frustumCulled = false;
  veil.renderOrder = VEIL_ORDER;
  veil.visible = false;
  scene3d.add(veil);
  const starRand = seeded('stars');
  const starPositions = [];
  for (let index = 0; index < 420; index += 1) {
    const angle = starRand() * Math.PI * 2;
    const height = Math.sin((6 + starRand() * 84) * Math.PI / 180);
    const across = Math.sqrt(1 - height * height);
    starPositions.push(midX + Math.cos(angle) * across * 165, height * 165, midZ + Math.sin(angle) * across * 165);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: '#eef3ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  stars.renderOrder = SKY_LIGHTS_ORDER;
  stars.visible = false;
  scene3d.add(stars);
  // Trăng treo trên mái chánh điện (người chơi thường nhìn về phía điện).
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const moonCtx = moonCanvas.getContext('2d');
  const halo = moonCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
  halo.addColorStop(0, 'rgba(220, 230, 255, 0.35)');
  halo.addColorStop(1, 'rgba(220, 230, 255, 0)');
  moonCtx.fillStyle = halo;
  moonCtx.fillRect(0, 0, 128, 128);
  moonCtx.fillStyle = '#f4f1e6';
  moonCtx.beginPath();
  moonCtx.arc(64, 64, 17, 0, Math.PI * 2);
  moonCtx.fill();
  moonCtx.fillStyle = 'rgba(190, 186, 170, 0.45)';
  for (const [x, y, r] of [[58, 58, 4], [69, 66, 3], [61, 71, 2.5]]) {
    moonCtx.beginPath();
    moonCtx.arc(x, y, r, 0, Math.PI * 2);
    moonCtx.fill();
  }
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  moon.position.set(midX - 38, 82, Math.min(frontZ, midZ) - 120);
  moon.scale.set(30, 30, 1);
  moon.renderOrder = SKY_LIGHTS_ORDER;
  moon.visible = false;
  scene3d.add(moon);

  // Màu ban ngày của vùng (landscape gửi qua paint) + độ cao mặt trời → màu đích; update() chia trời / sương cho màu
  // phủ đang dùng (lớp phủ mờ dần khi vào điện) rồi mới đặt.
  let palette = null;
  let elevation = null;
  let grade = null;
  let shownTint = null;
  const regrade = () => {
    grade = daylightGrade(palette, elevation);
    sun.color.copy(grade.sun);
    skyFill.color.copy(grade.sky);
    skyFill.groundColor.copy(grade.ground);
    glowMaterial.color.copy(GLOW_COLOR).lerp(NIGHT_GLOW_COLOR, grade.level.veil);
    glowMaterial.opacity = 0.68 + grade.level.veil * 0.28;
    for (const glow of lanternGlowSprites) {
      const size = 1.1 * grade.glow;
      glow.userData.baseScale = size;
      glow.scale.set(size, size, 1);
    }
    stars.visible = moon.visible = grade.stars > 0.01;
    stars.material.opacity = grade.stars;
    moon.material.opacity = grade.stars;
    shownTint = null;
  };
  const paintSky = (outside) => {
    const tint = grade.tint.map((value) => 1 + (value - 1) * outside);
    if (shownTint && tint.every((value, index) => Math.abs(value - shownTint[index]) < 0.002)) return;
    shownTint = tint;
    const divide = (target, from) => target.setRGB(
      Math.min(1, from.r / tint[0]), Math.min(1, from.g / tint[1]), Math.min(1, from.b / tint[2]), THREE.LinearSRGBColorSpace,
    );
    divide(sky.material.uniforms.top.value, grade.top);
    divide(sky.material.uniforms.horizon.value, grade.horizon);
    if (scene3d.fog) divide(scene3d.fog.color, grade.fog);
    veil.material.uniforms.tint.value.setRGB(tint[0], tint[1], tint[2], THREE.LinearSRGBColorSpace);
    veil.visible = tint.some((value) => value < 0.998);
  };

  // Phong cảnh theo vùng (landscape3d.mjs): cây đa / tùng, núi xa, đất, màu mái, chùa nhìn từ ngoài. Dựng cảnh gốc
  // ngay; renderer gọi setTheme để đổi vùng.
  const landscape = createLandscape({
    root, renderer, data, materials: m, field, lawns: [m.grass, m.petGrass], sun, themeBase, stateBase,
    paint: (next) => {
      palette = next;
      regrade();
    },
    temple: { hall, textBoard, glowMaterial },
  });
  for (const position of lanternGlows) {
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(position);
    const glowScale = 1.1 * (grade?.glow || 1);
    glow.scale.set(glowScale, glowScale, 1);
    glow.renderOrder = GLOW_ORDER;
    glow.userData.baseScale = glowScale;
    glow.userData.phase = lanternGlowSprites.length * 1.73;
    root.add(glow);
    lanternGlowSprites.push(glow);
  }
  // Hai hạt sáng nhỏ quanh mỗi đèn, gom trong một Points nên toàn bộ lớp "lung linh" chỉ thêm một draw call.
  const twinklePositions = [];
  lanternGlows.forEach((position, index) => {
    const angle = index * 2.17;
    for (const side of [-1, 1]) twinklePositions.push(
      position.x + Math.cos(angle) * 0.16 * side,
      position.y + 0.08 + side * 0.11,
      position.z + Math.sin(angle) * 0.16 * side,
    );
  });
  const twinkleGeometry = new THREE.BufferGeometry();
  twinkleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(twinklePositions, 3));
  const twinkleMaterial = new THREE.PointsMaterial({
    map: glowTexture, color: '#ffd36b', size: 6, sizeAttenuation: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const twinkles = new THREE.Points(twinkleGeometry, twinkleMaterial);
  twinkles.renderOrder = GLOW_ORDER + 1;
  twinkles.visible = false;
  scene3d.add(twinkles);
  const zoneLightSites = courtyardLightSites(data, lanternGlows);
  // Ba bóng vàng treo thành cụm ở mỗi khu, dùng InstancedMesh nên mọi khu cộng lại vẫn chỉ một draw call.
  const zoneBulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.1, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffd36b', toneMapped: false }),
    zoneLightSites.length * 3,
  );
  const bulbDummy = new THREE.Object3D();
  let bulbIndex = 0;
  for (const site of zoneLightSites) {
    for (const offset of [-0.48, 0, 0.48]) {
      bulbDummy.position.set(site.x + offset, site.y - Math.abs(offset) * 0.16, site.z);
      bulbDummy.updateMatrix();
      zoneBulbs.setMatrixAt(bulbIndex, bulbDummy.matrix);
      bulbIndex += 1;
    }
  }
  zoneBulbs.instanceMatrix.needsUpdate = true;
  zoneBulbs.visible = false;
  zoneBulbs.renderOrder = GLOW_ORDER + 1;
  scene3d.add(zoneBulbs);
  const zoneGlowGeometry = new THREE.BufferGeometry();
  zoneGlowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(zoneLightSites.flatMap((site) => site.toArray()), 3));
  const zoneGlowMaterial = new THREE.PointsMaterial({
    map: glowTexture, color: '#ff9a32', size: 42, sizeAttenuation: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const zoneGlows = new THREE.Points(zoneGlowGeometry, zoneGlowMaterial);
  zoneGlows.renderOrder = GLOW_ORDER;
  zoneGlows.visible = false;
  scene3d.add(zoneGlows);

  // Quầng sáng trải trên mặt đất để cả khu vực được soi ấm, thay vì chỉ thấy bóng đèn phát sáng. Toàn bộ các quầng
  // dùng chung một InstancedMesh (một draw call), không đổ bóng và vẫn depth-test nên không vẽ đè lên người / cảnh vật.
  const zoneLightPoolMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, color: '#ffb84d', side: THREE.DoubleSide,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const zoneLightPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), zoneLightPoolMaterial, zoneLightSites.length);
  const poolDummy = new THREE.Object3D();
  zoneLightSites.forEach((site, index) => {
    poolDummy.position.set(site.x, 0.055, site.z);
    poolDummy.rotation.set(-Math.PI / 2, 0, 0);
    poolDummy.scale.set(12, 9, 1);
    poolDummy.updateMatrix();
    zoneLightPools.setMatrixAt(index, poolDummy.matrix);
  });
  zoneLightPools.instanceMatrix.needsUpdate = true;
  zoneLightPools.renderOrder = GLOW_ORDER - 1;
  zoneLightPools.visible = false;
  scene3d.add(zoneLightPools);

  // Đom đóm / bụi sáng quanh từng khu giúp ánh đêm có chiều sâu. Vị trí có seed cố định để mọi máy thấy giống nhau;
  // tất cả hạt vẫn chỉ là một Points draw call.
  const zoneSparkleRand = seeded('courtyard-zone-sparkles');
  const zoneSparklePositions = [];
  for (const site of zoneLightSites) {
    for (let index = 0; index < 7; index += 1) {
      const angle = zoneSparkleRand() * Math.PI * 2;
      const radius = 1.4 + zoneSparkleRand() * 4.8;
      zoneSparklePositions.push(
        site.x + Math.cos(angle) * radius,
        0.65 + zoneSparkleRand() * 2.8,
        site.z + Math.sin(angle) * radius,
      );
    }
  }
  const zoneSparkleGeometry = new THREE.BufferGeometry();
  zoneSparkleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(zoneSparklePositions, 3));
  const zoneSparkleMaterial = new THREE.PointsMaterial({
    map: glowTexture, color: '#ffe4a0', size: 5, sizeAttenuation: false,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const zoneSparkles = new THREE.Points(zoneSparkleGeometry, zoneSparkleMaterial);
  zoneSparkles.renderOrder = GLOW_ORDER + 2;
  zoneSparkles.visible = false;
  scene3d.add(zoneSparkles);

  // Chỉ giữ năm PointLight không bóng và chuyển chúng tới năm khu gần camera nhất. Nhờ vậy khu người chơi đang ở có
  // ánh vàng thật trên cây / tường nhưng shader không phải gánh một PointLight cho tất cả mười hai khu cùng lúc.
  const rankedLightSites = zoneLightSites.map((site) => ({ site, distance: 0 }));
  const nightLights = spreadLightSites(zoneLightSites).map((position, index) => {
    const light = new THREE.PointLight('#ffc36a', 0, 30, 2);
    light.position.copy(position);
    light.position.y += 0.35;
    light.castShadow = false;
    light.userData.phase = index * 2.1;
    scene3d.add(light);
    return light;
  });
  const nightFill = new THREE.AmbientLight('#ffc878', 0);
  scene3d.add(nightFill);

  // ---- Khói hương từ lư lớn ----
  const smokeMaterial = new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, depthWrite: false, opacity: 0.35 });
  const smoke = [];
  let smokeTimer = 0;
  const smokeOrigin = new THREE.Vector3(data.burner.x, 2.75, data.burner.z);

  // Tia nước từ đài sen trên đỉnh bồn: vài giọt sprite rơi theo đường cong (dùng chung vật liệu).
  if (data.fountain) {
    const dropMaterial = new THREE.SpriteMaterial({ map: softDot('rgba(220, 240, 255, 0.9)'), transparent: true, depthWrite: false, opacity: 0.8 });
    for (let index = 0; index < 18; index += 1) {
      const drop = new THREE.Sprite(dropMaterial);
      drop.scale.set(0.12, 0.12, 1);
      root.add(drop);
      sprays.push({ drop, phase: index / 18, angle: (index / 18) * Math.PI * 2 * 3 });
    }
  }

  // Chó mèo đi lại trên bãi cỏ (world.courtyard.animals), tránh vật cản theo world.walk.
  const animals = data.animals?.length ? buildAnimals({ root, animals: data.animals, walk: world.walk }) : null;
  const koiDummy = new THREE.Object3D();
  let outside = 0;
  return {
    proceduralStatues,
    animals,
    benchPickables,
    // Xích đu / cầu tuột: [{ id, kind, pivots }] (ghế xích đu để engine đu theo người ngồi).
    playRigs,
    meritBoardPickables,
    gardenPickables,
    memorialPickables,
    guidePickables,
    activateAssets() {
      flowerGarden?.activate?.();
    },
    // Vùng phong cảnh (THIEN_THEMES, 'default' là cảnh gốc) + lớp tiểu bang (options.state).
    setTheme(name, options) {
      return landscape.setTheme(name, options);
    },
    setLandmarksVisible(on) {
      landscape.setLandmarksVisible(on);
    },
    landscapeStats() {
      return landscape.stats();
    },
    // Trời theo giờ: độ cao mặt trời (độ, âm là dưới chân trời) tại chùa; null = ban ngày cố định như cảnh gốc.
    setDaylight(degrees) {
      const next = Number.isFinite(degrees) ? Math.max(-90, Math.min(90, degrees)) : null;
      if (next === elevation) return;
      elevation = next;
      regrade();
    },
    daylight() {
      return { elevation, ...grade.level };
    },
    setCommunityProject(project) {
      if (project?.id === data.bodhi?.projectId) communityBodhi?.set(project);
      if (project?.id === data.pond?.projectId) communityLotus?.set(project);
    },
    // Bật bóng đổ (thử trên điện thoại), hoặc tắt khi máy yếu. Tắt không đổi số đèn đổ bóng (đổi là mọi vật liệu
    // biên dịch lại shader, đứng hình vài giây): thu khung chụp bóng về rỗng, vẽ một lần cho sạch bóng rồi thôi vẽ.
    // Máy yếu (renderer tự hạ chất lượng): bớt chi tiết không quan trọng.
    setLowDetail(on) {
      flowerGarden?.setLowDetail?.(on);
    },
    setShadows(on, mapSize = touch ? 512 : 1024) {
      const camera = sun.shadow.camera;
      if (on) {
        shadowsCleared = false;
        Object.assign(camera, shadowRange);
        camera.updateProjectionMatrix();
        sun.shadow.mapSize.set(mapSize, mapSize);
        sun.castShadow = true;
        renderer.shadowMap.enabled = true;
        sun.shadow.needsUpdate = true;
      } else if (sun.castShadow && renderer.shadowMap.enabled) {
        shadowsCleared = true;
        Object.assign(camera, { near: 0.001, far: 0.002 });
        camera.updateProjectionMatrix();
        sun.shadow.needsUpdate = true;
      }
    },
    shadowsEnabled() {
      return sun.castShadow && renderer.shadowMap.enabled && !shadowsCleared;
    },
    update(dt, time) {
      // Ra sân thì nắng dần lên, vào điện thì tắt (cửa giữa là ranh giới). "Trong điện" = sau mặt tiền VÀ trong bề ngang
      // của điện: camera sau lưng người đứng sát mặt tiền ở hai bên (Vườn Hoa, sân trước) lùi qua mốc z nhưng vẫn ở
      // ngoài trời, không được tắt nắng (trước đây cảnh tối sầm từng lúc).
      const inHall = camera.position.z < frontZ - 0.5 && Math.abs(camera.position.x) < hw + 0.5;
      const target = inHall ? 0 : 1;
      outside += (target - outside) * Math.min(1, dt * 3);
      sun.intensity = 2.1 * outside * grade.sunFactor;
      skyFill.intensity = 0.9 * outside * grade.fillFactor;
      for (const light of nightLights) {
        const flicker = 1 + Math.sin(time / 780 + light.userData.phase) * 0.035;
        light.intensity = 155 * outside * grade.lamp * flicker;
      }
      const shimmer = outside * grade.lamp;
      for (const entry of rankedLightSites) entry.distance = camera.position.distanceToSquared(entry.site);
      rankedLightSites.sort((a, b) => a.distance - b.distance);
      const move = Math.min(1, dt * 4);
      for (let index = 0; index < nightLights.length; index += 1) {
        const light = nightLights[index];
        const target = rankedLightSites[index]?.site;
        if (target) light.position.lerp(target, move);
      }
      nightFill.intensity = 0.9 * shimmer;
      for (const glow of lanternGlowSprites) {
        const pulse = 1 + shimmer * Math.sin(time / 520 + glow.userData.phase) * 0.09;
        const size = glow.userData.baseScale * pulse;
        glow.scale.set(size, size, 1);
      }
      twinkleMaterial.opacity = shimmer * (0.52 + Math.sin(time / 430) * 0.18);
      twinkles.visible = twinkleMaterial.opacity > 0.01;
      zoneGlowMaterial.opacity = shimmer * (0.68 + Math.sin(time / 560) * 0.12);
      zoneGlows.visible = zoneBulbs.visible = zoneGlowMaterial.opacity > 0.01;
      zoneLightPoolMaterial.opacity = shimmer * (0.28 + Math.sin(time / 920) * 0.035);
      zoneLightPools.visible = zoneLightPoolMaterial.opacity > 0.01;
      zoneSparkleMaterial.opacity = shimmer * (0.46 + Math.sin(time / 370) * 0.16);
      zoneSparkles.visible = zoneSparkleMaterial.opacity > 0.01;
      paintSky(outside);
      landscape.tick(time / 1000, grade.level.veil, outside);
      // Không bật/tắt đèn (đổi số nguồn sáng làm mọi vật liệu biên dịch lại shader, giật mỗi lần qua cửa):
      // trong điện chỉ để cường độ 0 và ngừng vẽ lại bóng.
      sun.shadow.autoUpdate = !shadowsCleared && outside > 0.02;
      for (let index = 0; index < koi.length; index += 1) {
        const fish = koi[index];
        const t = (time / 1_000) * fish.speed + fish.phase;
        const x = fish.cx + Math.cos(t) * fish.ax;
        const z = fish.cz + Math.sin(t * 1.3) * fish.az;
        const vx = -Math.sin(t) * fish.ax * fish.speed;
        const vz = Math.cos(t * 1.3) * 1.3 * fish.az * fish.speed;
        koiDummy.position.set(x, fish.y + Math.sin(t * 2) * 0.04, z);
        koiDummy.rotation.set(0, Math.atan2(vx, vz) + Math.sin(time / 180 + fish.phase) * 0.18, 0);
        koiDummy.scale.setScalar(fish.size);
        koiDummy.updateMatrix();
        koiMesh.setMatrixAt(index, koiDummy.matrix);
      }
      if (koiMesh) koiMesh.instanceMatrix.needsUpdate = true;
      for (const asset of lazyAssets) asset.update(camera.position);
      animals?.update(dt, time, camera);
      lakeWater.tick(time / 1000);
      communityBodhi?.tick(time / 1000);
      lotusFloats?.(time / 1000);
      flowerGarden?.update(dt, time, camera);
      for (const spray of sprays) {
        const k = ((time / 1_600) + spray.phase) % 1;
        const reach = 0.25 + k * 0.85;
        spray.drop.position.set(
          data.fountain.x + Math.cos(spray.angle) * reach,
          2.4 + k * 0.7 - k * k * 2.0,
          data.fountain.z + Math.sin(spray.angle) * reach,
        );
      }
      if (fountainWater) fountainWater.material.opacity = 0.78 + Math.sin(time / 700) * 0.04;
      smokeTimer += dt;
      if (smokeTimer > 0.45 && smoke.length < MAX_SMOKE) {
        smokeTimer = 0;
        const puff = new THREE.Sprite(smokeMaterial);
        puff.position.copy(smokeOrigin).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2));
        puff.scale.set(0.35, 0.35, 1);
        root.add(puff);
        smoke.push({ puff, life: 0, drift: (Math.random() - 0.5) * 0.25, seed: Math.random() * 6 });
      }
      for (let index = smoke.length - 1; index >= 0; index -= 1) {
        const item = smoke[index];
        item.life += dt;
        const k = item.life / 6;
        if (k >= 1) {
          root.remove(item.puff);
          smoke.splice(index, 1);
          continue;
        }
        item.puff.position.y += dt * 0.45;
        item.puff.position.x += Math.sin(time / 900 + item.seed) * dt * 0.08 + item.drift * dt;
        // Dùng chung một vật liệu khói: mờ dần bằng cách co lại ở cuối đời thay vì đổi độ trong từng làn.
        const size = (0.35 + k * 1.6) * Math.min(1, (1 - k) * 4);
        item.puff.scale.set(size, size, 1);
      }
    },
  };
}
