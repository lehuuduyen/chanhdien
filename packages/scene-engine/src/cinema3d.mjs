// Rạp phim 3D (Three.js): khán phòng bậc thang, ghế nhung, màn chiếu có rèm, người ngồi kiểu chú tiểu (chibi).
// Dựng hoàn toàn bằng hình khối, không cần model hay ảnh. Cùng giao diện với renderer.mjs (2D) để trang Cinema
// chuyển qua lại: setParticipants, say, setCamera, screenRect, stats, destroy. Thêm phần đi lại (góc nhìn nhân
// vật: chạm sàn/ghế hoặc phím mũi tên, camera bám sau lưng nhưng vẫn nhìn thẳng màn chiếu), thả cảm xúc và
// setInsets để thanh giao diện không bao giờ che khung player.
// Màn chiếu chỉ tô tối: trang đặt iframe YouTube lên đúng screenRect(), không vẽ gì đè lên khung player. Bố cục
// (mét) lấy từ scene.theater3d; phần tính toán thuần nằm ở theater.mjs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  buildChibiWalker, CASUAL_ACCENTS, CASUAL_BOTTOMS, CASUAL_SKIRTS, CASUAL_TOPS, createChibiPersonFactory, isFemale, loadChibiModels,
} from './chibi3d.mjs';
import { BUBBLE_LIMITS, truncateBubble } from './index.mjs';
import { disposeSprite, textSprite } from './sprites3d.mjs';
import {
  cameraPose, findPath, floorHeight, isWalkable, nearestSeat, offAxisFrustum, pathToSeat, screenBox, slideMove, theaterCouples, theaterSeats,
  windowToPixels,
} from './theater.mjs';

const SKINS = ['man', 'woman', 'child', 'granny', 'nun', 'monk', 'chibigirl'];

// Ở rạp ai cũng mặc đồ thường ngày nhiều màu; màu cố định theo từng người (không đổi mỗi lần vào), đầu/mặt giữ
// nguyên như ở chùa.
function lookOf(id, skin) {
  const value = hash(`look:${id}`);
  const pick = (list, shift) => list[(value >>> shift) % list.length];
  return {
    outfit: 'casual',
    top: pick(CASUAL_TOPS, 0),
    bottom: isFemale(skin) ? pick(CASUAL_SKIRTS, 7) : pick(CASUAL_BOTTOMS, 7),
    accent: pick(CASUAL_ACCENTS, 13),
  };
}
const SEAT_TOP = 0.47; // mặt đệm ghế, tính từ bậc sàn
const PERSON_SCALE = 1.1;
const HEAD_TOP = SEAT_TOP + 0.82 * PERSON_SCALE;
const MAX_WALKERS = 40;
const MAX_REACTIONS = 30;
const WALK_SPEED = 2.4; // m/s
const NEAR = 0.1;
const FAR = 80;
const VELVET = new THREE.Color('#8a1524');
const VELVET_MINE = new THREE.Color('#d9a441');
const LOVE = new THREE.Color('#b0245e');
const HEART_DIM = new THREE.Color('#7a2a4a');
const HEART_ON = new THREE.Color('#ff4f8b');
const WHITE = new THREE.Color('#ffffff');
const COLOR = new THREE.Color();

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = () => canvasTexture(64, 64, (ctx) => {
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 214, 150, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 170, 90, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 150, 80, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
});

// Gộp các khối (geometry + ma trận) thành một geometry để vẽ một lần.
function merged(parts) {
  return mergeGeometries(parts.map(([geometry, matrix]) => {
    const copy = geometry.index ? geometry.clone() : geometry.toNonIndexed();
    copy.applyMatrix4(matrix);
    for (const name of Object.keys(copy.attributes)) if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
    return copy;
  }));
}

const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
  new THREE.Vector3(1, 1, 1),
);

// Rèm nhung: mặt phẳng gợn sóng theo chiều ngang.
function curtainGeometry(width, height, folds) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 6, 1);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const u = (position.getX(index) / width + 0.5) * folds;
    position.setZ(index, Math.sin(u * Math.PI * 2) * 0.09);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildHall(root, theater, seats, layout) {
  const { hall, screen: screenData, seating } = theater;
  const screen = screenBox(theater);
  const [minX, maxX] = hall.x;
  const width = maxX - minX;
  const material = (color, roughness = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const m = {
    wall: material('#1d1626'),
    panel: material('#2b2038'),
    carpet: material('#3a1219'),
    step: material('#2a1a22'),
    ceiling: material('#0b0a10'),
    curtain: material('#7d0f1f', 0.75, { side: THREE.DoubleSide }),
    stage: material('#3a2516', 0.7),
    black: material('#050507', 0.6),
    gold: material('#caa04a', 0.4, { emissive: '#8a6420', emissiveIntensity: 0.5, metalness: 0.4 }),
    led: new THREE.MeshBasicMaterial({ color: '#ffb35c' }),
    sconce: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    strip: new THREE.MeshBasicMaterial({ color: '#d9a85a' }),
    speaker: material('#121216', 0.5, { metalness: 0.3 }),
    cone: material('#2a2a30', 0.35, { metalness: 0.5 }),
  };
  const add = (geometry, mat, matrix = null) => {
    const mesh = new THREE.Mesh(geometry, mat);
    if (matrix) mesh.applyMatrix4(matrix);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    return mesh;
  };

  // Sàn trước màn chiếu và các bậc ngồi: hàng sau cao hơn hàng trước rowRise; bậc cuối kéo tới tường sau.
  const frontEnd = seating.firstRowZ - seating.rowSpacing / 2 + 0.1;
  add(new THREE.PlaneGeometry(width, frontEnd + 1), m.carpet, at(0, 0, (frontEnd - 1) / 2, -Math.PI / 2));
  const steps = [];
  const edges = [];
  for (let fromFront = 0; fromFront < layout.rows; fromFront += 1) {
    const height = fromFront * seating.rowRise;
    const start = seating.firstRowZ + (fromFront - 0.5) * seating.rowSpacing + 0.1;
    const end = fromFront === layout.rows - 1 ? hall.backZ + 4 : start + seating.rowSpacing;
    if (height > 0) steps.push([new THREE.BoxGeometry(width, height, end - start), at(0, height / 2, (start + end) / 2)]);
    else steps.push([new THREE.PlaneGeometry(width, end - start), at(0, 0.001, (start + end) / 2, -Math.PI / 2)]);
    // Đèn LED vàng dọc mép bậc ở lối giữa và hai lối bên.
    for (const x of [0, minX + 0.5, maxX - 0.5]) edges.push([new THREE.BoxGeometry(0.7, 0.03, 0.03), at(x, height + 0.02, start + 0.02)]);
  }
  const floors = [add(merged(steps), m.step)];
  floors.push(root.children.find((mesh) => mesh.material === m.carpet));
  add(merged(edges), m.led);

  // Tường hai bên có tấm tiêu âm, dải đèn vàng và đèn tường; tường sau có ô cửa phòng máy chiếu.
  // Tường và trần kéo dài ra sau tường cuối: camera nhân vật được lùi ra đó (mặt sau tường cuối không vẽ).
  const length = hall.backZ + 5.2;
  for (const side of [-1, 1]) {
    const x = side < 0 ? minX : maxX;
    add(new THREE.PlaneGeometry(length, hall.height), m.wall, at(x, hall.height / 2, length / 2 - 1.2, 0, -side * Math.PI / 2));
    const panels = [];
    const lamps = [];
    for (let z = 1.2; z < hall.backZ - 0.6; z += 1.7) {
      panels.push([new THREE.BoxGeometry(0.08, 4.2, 1.45), at(x - side * 0.04, 3.4 + 0.15 * Math.sin(z), z)]);
      lamps.push([new THREE.BoxGeometry(0.06, 0.34, 0.16), at(x - side * 0.05, 6.1, z + 0.85)]);
    }
    add(merged(panels), m.panel);
    add(merged(lamps), m.sconce);
    // Dải đèn đứng giữa các tấm tiêu âm.
    const strips = [];
    for (let z = 1.2 + 0.85; z < hall.backZ - 0.6; z += 1.7) strips.push([new THREE.BoxGeometry(0.04, 3.6, 0.05), at(x - side * 0.09, 3.3, z)]);
    add(merged(strips), m.strip);
  }
  add(new THREE.PlaneGeometry(width, hall.height), m.wall, at(0, hall.height / 2, hall.backZ, 0, Math.PI));
  add(new THREE.PlaneGeometry(width, hall.height), m.wall, at(0, hall.height / 2, -0.3));
  add(new THREE.PlaneGeometry(width, length), m.ceiling, at(0, hall.height, length / 2 - 1.2, Math.PI / 2));
  const booth = new THREE.Vector3(0, Math.min(hall.height - 1.2, 7.4), hall.backZ - 0.02);
  add(new THREE.PlaneGeometry(1.1, 0.5), m.sconce, at(booth.x, booth.y, booth.z, 0, Math.PI));

  // Đèn tường: quầng sáng ấm (sprite cộng sáng).
  const glow = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf96', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  for (const side of [-1, 1]) {
    for (let z = 1.2; z < hall.backZ - 0.6; z += 1.7) {
      const sprite = new THREE.Sprite(glow);
      sprite.position.set((side < 0 ? minX : maxX) - side * 0.2, 6.1, z + 0.85);
      sprite.scale.set(1.3, 1.3, 1);
      root.add(sprite);
    }
  }
  // Biển "LỐI RA" xanh ở hai góc cuối rạp.
  const exitTexture = canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#0d7a3e';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#e9fff1';
    ctx.font = '700 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LỐI RA', 128, 50);
  });
  const exitMaterial = new THREE.MeshBasicMaterial({ map: exitTexture });
  for (const side of [-1, 1]) {
    add(new THREE.PlaneGeometry(0.9, 0.34), exitMaterial, at((side < 0 ? minX : maxX) - side * 0.02, 4.6, hall.backZ - 1.4, 0, -side * Math.PI / 2));
  }

  // Sân khấu, viền màn, rèm hai bên và diềm rèm phía trên.
  const stageDepth = 1.4;
  const stageHeight = Math.min(0.7, screenData.bottom - 0.4);
  add(new THREE.BoxGeometry(screen.x[1] - screen.x[0] + 2.4, stageHeight, stageDepth), m.stage, at(0, stageHeight / 2, stageDepth / 2 - 0.3));
  add(new THREE.BoxGeometry(screen.x[1] - screen.x[0] + 2.4, 0.05, 0.04), m.gold, at(0, stageHeight - 0.03, stageDepth - 0.28));
  add(new THREE.BoxGeometry(screen.x[1] - screen.x[0] + 0.36, screen.y[1] - screen.y[0] + 0.36, 0.08), m.black, at(0, (screen.y[0] + screen.y[1]) / 2, -0.06));
  const curtainTop = Math.min(hall.height - 0.2, screen.y[1] + 1.3);
  const curtainWidth = Math.max(0.8, Math.min(1.8, maxX - screen.x[1] - 0.1));
  for (const side of [-1, 1]) {
    add(curtainGeometry(curtainWidth, curtainTop, 5), m.curtain, at(side * (screen.x[1] + 0.15 + curtainWidth / 2), curtainTop / 2, 0.25));
  }
  add(curtainGeometry(width, curtainTop - screen.y[1] - 0.15, 22), m.curtain, at(0, (curtainTop + screen.y[1] + 0.15) / 2, 0.3));
  add(new THREE.BoxGeometry(width, 0.06, 0.06), m.gold, at(0, screen.y[1] + 0.15, 0.4));

  // Loa thùng đứng hai bên sân khấu, mặt loa hướng về khán giả.
  const speakerX = screen.x[1] + 0.55;
  const speakers = [];
  const cones = [];
  for (const side of [-1, 1]) {
    speakers.push([new THREE.BoxGeometry(0.85, 2.6, 0.6), at(side * speakerX, stageHeight + 1.3, 0.75)]);
    for (const [y, radius] of [[stageHeight + 2.2, 0.17], [stageHeight + 1.45, 0.3], [stageHeight + 0.62, 0.3]]) {
      cones.push([new THREE.CylinderGeometry(radius, radius * 0.8, 0.06, 24), at(side * speakerX, y, 1.06, Math.PI / 2)]);
    }
  }
  add(merged(speakers), m.speaker);
  add(merged(cones), m.cone);

  // Bảng tên rạp dưới màn chiếu (nằm ngoài khung player).
  const plate = canvasTexture(512, 64, (ctx) => {
    ctx.fillStyle = '#d9b26a';
    ctx.font = '600 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHÁNH ĐIỆN ONLINE · CINEMA', 256, 34);
  });
  add(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: plate, transparent: true }), at(0, screen.y[0] - 0.42, 0.02));

  // Mặt màn chiếu đúng mặt phẳng z = 0 (khung để trang đặt iframe). Chỉ tô tối, có ánh xanh nhạt khi chưa chiếu.
  const surface = add(new THREE.PlaneGeometry(screen.x[1] - screen.x[0], screen.y[1] - screen.y[0]), new THREE.MeshBasicMaterial({ color: '#141c2a' }), at(0, (screen.y[0] + screen.y[1]) / 2, 0));

  // Tia chiếu từ phòng máy tới màn: hình chóp mờ cộng sáng, chỉ hiện khi đang chiếu.
  const corners = [[screen.x[0], screen.y[0]], [screen.x[1], screen.y[0]], [screen.x[1], screen.y[1]], [screen.x[0], screen.y[1]]];
  const beamPositions = [];
  const beamColors = [];
  for (let index = 0; index < 4; index += 1) {
    const [a, b] = [corners[index], corners[(index + 1) % 4]];
    beamPositions.push(booth.x, booth.y, booth.z - 0.05, a[0], a[1], 0.02, b[0], b[1], 0.02);
    beamColors.push(1, 1, 1, 0, 0, 0, 0, 0, 0);
  }
  const beamGeometry = new THREE.BufferGeometry();
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beamPositions, 3));
  beamGeometry.setAttribute('color', new THREE.Float32BufferAttribute(beamColors, 3));
  const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
    color: '#a9c4ff', vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beam.renderOrder = 2;
  root.add(beam);

  return { surface, beam, floors };
}

// Ghế nhung: nệm + lưng (một lần vẽ, đổi màu từng ghế), chân + tay vịn (một lần vẽ). Ghế quay về màn chiếu.
// Ghế đôi (hai hàng cuối): mỗi ghế là một nửa sofa (nệm + lưng rộng hơn, không tay vịn giữa, nhung hồng); khung sofa
// (đế + tay vịn hai đầu) và trái tim trên lưng vẽ một lần cho mỗi cặp. Trái tim sáng lên khi đủ hai người ngồi.
function heartGeometry(size) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -size);
  shape.bezierCurveTo(-size * 1.6, -size * 0.1, -size * 0.9, size * 1.1, 0, size * 0.45);
  shape.bezierCurveTo(size * 0.9, size * 1.1, size * 1.6, -size * 0.1, 0, -size);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  geometry.center();
  return geometry;
}

function buildSeats(root, seats, couples) {
  const singles = seats.filter((seat) => !seat.couple);
  const halves = seats.filter((seat) => seat.couple);
  const velvetGeometry = merged([
    [new THREE.BoxGeometry(0.56, 0.13, 0.5), at(0, SEAT_TOP - 0.065, -0.02)],
    [new THREE.BoxGeometry(0.58, 0.62, 0.11), at(0, 0.8, 0.27, 0.12)],
  ]);
  const frameGeometry = merged([
    [new THREE.BoxGeometry(0.42, SEAT_TOP - 0.13, 0.32), at(0, (SEAT_TOP - 0.13) / 2, 0.02)],
    [new THREE.BoxGeometry(0.07, 0.07, 0.5), at(-0.33, 0.66, 0)],
    [new THREE.BoxGeometry(0.07, 0.07, 0.5), at(0.33, 0.66, 0)],
    [new THREE.BoxGeometry(0.05, 0.62, 0.08), at(-0.33, 0.32, 0.1)],
    [new THREE.BoxGeometry(0.05, 0.62, 0.08), at(0.33, 0.32, 0.1)],
  ]);
  const material = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#1a1416', roughness: 0.6, metalness: 0.2 });
  const velvet = new THREE.InstancedMesh(velvetGeometry, material(), singles.length);
  const frame = new THREE.InstancedMesh(frameGeometry, frameMaterial, singles.length);
  singles.forEach((seat, index) => {
    const matrix = at(seat.x, seat.y, seat.z, 0, seat.ry);
    velvet.setMatrixAt(index, matrix);
    frame.setMatrixAt(index, matrix);
    velvet.setColorAt(index, VELVET);
  });
  velvet.userData.seatIds = singles.map((seat) => seat.id);
  root.add(velvet, frame);
  const meshes = [velvet];
  let hearts = null;
  if (halves.length) {
    // Nửa sofa: nệm và lưng rộng bằng khoảng cách hai ghế để hai nửa liền nhau, lưng cao và dày hơn ghế thường.
    const width = Math.abs(halves[0].x - seats.find((seat) => seat.id === halves[0].couple.partner).x);
    const loveGeometry = merged([
      [new THREE.BoxGeometry(width, 0.15, 0.54), at(0, SEAT_TOP - 0.075, -0.02)],
      [new THREE.BoxGeometry(width, 0.7, 0.16), at(0, 0.84, 0.28, 0.12)],
    ]);
    const love = new THREE.InstancedMesh(loveGeometry, material(), halves.length);
    halves.forEach((seat, index) => {
      love.setMatrixAt(index, at(seat.x, seat.y, seat.z, 0, seat.couple.ry));
      love.setColorAt(index, LOVE);
    });
    love.userData.seatIds = halves.map((seat) => seat.id);
    const span = width * 2;
    const sofaGeometry = merged([
      [new THREE.BoxGeometry(span - 0.1, SEAT_TOP - 0.15, 0.4), at(0, (SEAT_TOP - 0.15) / 2, 0.02)],
      ...[-1, 1].flatMap((side) => [
        [new THREE.BoxGeometry(0.11, 0.3, 0.6), at(side * (span / 2 + 0.05), SEAT_TOP + 0.08, 0)],
        [new THREE.CylinderGeometry(0.065, 0.065, 0.6, 12), at(side * (span / 2 + 0.05), SEAT_TOP + 0.24, 0, Math.PI / 2)],
      ]),
    ]);
    const sofa = new THREE.InstancedMesh(sofaGeometry, new THREE.MeshStandardMaterial({ color: '#4a0f2a', roughness: 0.8 }), couples.length);
    hearts = new THREE.InstancedMesh(heartGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffffff' }), couples.length);
    couples.forEach((couple, index) => {
      sofa.setMatrixAt(index, at(couple.x, couple.y, couple.z, 0, couple.ry));
      hearts.setMatrixAt(index, at(couple.x, couple.y + 1.3, couple.z + 0.3, 0, couple.ry));
      hearts.setColorAt(index, HEART_DIM);
    });
    root.add(love, sofa, hearts);
    meshes.push(love);
  }
  // Tô màu một ghế (ghế của mình màu vàng).
  const slots = new Map();
  for (const mesh of meshes) mesh.userData.seatIds.forEach((id, index) => slots.set(id, [mesh, index]));
  return {
    meshes,
    hearts,
    paint(mineId) {
      for (const [id, [mesh, index]] of slots) mesh.setColorAt(index, id === mineId ? VELVET_MINE : mesh === velvet ? VELVET : LOVE);
      for (const mesh of meshes) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// Người ngồi: mỗi hình nhân vật gộp sẵn thành vài khối theo vật liệu, vẽ bằng InstancedMesh (≈ 5 lần vẽ cho mỗi
// hình dù rạp có 100 người).
function createCrowd(root, capacity) {
  const buildPerson = createChibiPersonFactory();
  const bySkin = new Map();
  function meshesFor(skin) {
    if (bySkin.has(skin)) return bySkin.get(skin);
    // Người ngồi ghế rạp: đồ thường ngày (áo/quần tô màu từng người bằng instanceColor), tay ôm hộp bắp rang.
    const { group } = buildPerson(skin, { outfit: 'casual', tint: true, popcorn: true });
    group.scale.setScalar(PERSON_SCALE);
    group.updateMatrixWorld(true);
    const buckets = new Map();
    group.traverse((object) => {
      if (!object.isMesh) return;
      if (!buckets.has(object.material)) buckets.set(object.material, []);
      buckets.get(object.material).push([object.geometry, object.matrixWorld]);
    });
    const meshes = [...buckets].map(([material, parts]) => {
      const mesh = new THREE.InstancedMesh(merged(parts), material, capacity);
      if (material.userData.tint) {
        for (let index = 0; index < capacity; index += 1) mesh.setColorAt(index, WHITE);
      }
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.seatIds = [];
      root.add(mesh);
      return mesh;
    });
    bySkin.set(skin, meshes);
    return meshes;
  }
  return {
    meshes: () => [...bySkin.values()].flat(),
    warmup: () => SKINS.forEach(meshesFor),
    place(people) {
      for (const meshes of bySkin.values()) for (const mesh of meshes) {
        mesh.count = 0;
        mesh.userData.seatIds = [];
      }
      for (const { seat, skin, look } of people) {
        const matrix = at(seat.x, seat.y + SEAT_TOP - 0.02, seat.z - 0.03, 0, seat.ry);
        for (const mesh of meshesFor(skin)) {
          mesh.setMatrixAt(mesh.count, matrix);
          const tint = mesh.material.userData.tint;
          if (tint) mesh.setColorAt(mesh.count, COLOR.set(look[tint]));
          mesh.userData.seatIds[mesh.count] = seat.id;
          mesh.count += 1;
        }
      }
      for (const meshes of bySkin.values()) for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.boundingSphere = null;
      }
    },
  };
}

// Người đứng/đi trong rạp: dựng từng nhân vật chibi (ít người đi cùng lúc: phần lớn đã ngồi). Vẽ tối đa
// MAX_WALKERS người gần mình nhất để điện thoại không phải vẽ cả rạp đang đi.
function createWalkers(root) {
  const walkers = new Map();
  return {
    walkers,
    get(id, skin, look) {
      let walker = walkers.get(id);
      if (walker && walker.skin !== skin) {
        root.remove(walker.figure);
        walker = null;
      }
      if (!walker) {
        const built = buildChibiWalker(skin, look);
        built.figure.scale.setScalar(PERSON_SCALE);
        walker = { ...built, skin, x: 0, z: 0, y: 0, ry: 0, target: null, moving: false, phase: Math.random() * 6 };
        walkers.set(id, walker);
        root.add(walker.figure);
      }
      return walker;
    },
    remove(id) {
      const walker = walkers.get(id);
      if (!walker) return;
      root.remove(walker.figure);
      walkers.delete(id);
    },
  };
}

const REACTION_EMOJI = { clap: '👏', laugh: '😂', heart: '❤️', wow: '😮', cry: '😢', fire: '🔥' };

function emojiSprite(emoji) {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.renderOrder = 5;
  return sprite;
}

// onSeatClick(seat): người chưa vào phòng chạm ghế (trang mở khung nhập tên) hoặc đã đi tới trước ghế (trang gửi
// seat.select). onMove({ x, z, ry, moving }): vị trí của mình để gửi server. onCameraChange(id): bộ vẽ tự đổi góc
// (bắt đầu đi → "follow", ngồi xuống → "seat") để trang cập nhật nút. onNearSeat(seatId | null): mình đang đứng
// ngay trước một ghế trống (trang hiện nút "Ngồi").
export async function createCinemaRenderer3D({ canvas, scene, onSeatClick, onMove, onCameraChange, onNearSeat, maxFps = 60 }) {
  const theater = scene.theater3d;
  if (!theater) throw new Error('Cảnh chưa có bố cục 3D (theater3d)');
  const seats = theaterSeats(scene);
  const seatsById = new Map(seats.map((seat) => [seat.id, seat]));
  const screen = screenBox(theater);
  const walk = theater.walk;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Hình mua trong shop (chibigirl) dùng mô hình .glb: tải trước khi dựng người ngồi/đi.
  await loadChibiModels();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color('#05060a');
  const camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
  const root = new THREE.Group();
  scene3d.add(root);

  // Đèn nhà (ấm, dịu đi khi đang chiếu) và ánh sáng hắt từ màn chiếu xuống khán giả (nhấp nháy nhẹ theo "phim").
  const house = new THREE.HemisphereLight('#c9b6ff', '#2a1210', 1.1);
  const fill = new THREE.AmbientLight('#ffffff', 0.25);
  const screenLight = new THREE.SpotLight('#cfe0ff', 0, 0, 1.05, 1, 0);
  screenLight.position.set(0, (screen.y[0] + screen.y[1]) / 2, 0.4);
  screenLight.target.position.set(0, 0.8, theater.hall.backZ * 0.6);
  scene3d.add(house, fill, screenLight, screenLight.target);

  const hall = buildHall(root, theater, seats, scene.seatLayout);
  const couples = theaterCouples(seats);
  const seatMeshes = buildSeats(root, seats, couples);
  let heartsOn = [];
  const crowd = createCrowd(root, seats.length);
  crowd.warmup();
  const walkers = createWalkers(root);

  // Vòng sáng trên ghế trống: chỉ hiện khi mình đang đứng (gợi ý chỗ ngồi được).
  const rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.17, 0.23, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#f3c969', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
    seats.length,
  );
  rings.count = 0;
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  root.add(rings);

  let width = 1;
  let height = 1;
  let aspect = 1;
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let cameraId = 'overview';
  let focusSeatId = null;
  let target = null;
  let current = null;
  let screenActive = false;
  let lightMix = 0;
  let destroyed = false;
  let dirty = true;
  let frames = 0;
  let fps = 0;
  let fpsAt = performance.now();
  let lastDraw = 0;
  let lastTime = performance.now();
  let raf = 0;
  const participants = new Map();
  const bubbles = new Map();
  const reactions = [];
  let myTag = null;
  let myTagKey = null;

  // Nhân vật của mình: vị trí đi lại ở máy mình (server chỉ kiểm tra thô), đường đi tới ghế, phím đang giữ.
  const self = { id: null, x: walk.spawn.x, z: walk.spawn.z, ry: walk.spawn.ry, path: [], seatGoal: null, moving: false, sentAt: 0, standing: false };
  const keys = new Set();
  // Cần điều khiển ảo (điện thoại): x sang phải, y về phía cuối rạp; độ dài 0…1 là tốc độ.
  const joystick = { x: 0, y: 0 };

  const me = () => (self.id ? participants.get(self.id) : null);
  const mySeat = () => (self.standing ? null : me()?.seatId || null);
  const selfPose = () => ({ x: self.x, z: self.z });

  function retarget(snap = false) {
    const inner = Math.max(0.2, (width - insets.left - insets.right) / Math.max(1, height - insets.top - insets.bottom));
    target = cameraPose(scene, seats, cameraId, focusSeatId, inner, selfPose());
    if (snap || !current || current.kind !== target.kind || target.kind === 'look') current = structuredClone(target);
    dirty = true;
  }

  // Khung thật của camera = khung vừa phần giữa (trừ thanh giao diện) nới thêm phần bị thanh che, để màn chiếu
  // nằm trọn trong phần giữa và không có nút nào đè lên khung player.
  function fullWindow(window) {
    const innerWidth = Math.max(1, width - insets.left - insets.right);
    const scale = (window.x[1] - window.x[0]) / innerWidth;
    return {
      x: [window.x[0] - insets.left * scale, window.x[1] + insets.right * scale],
      y: [window.y[0] - insets.bottom * scale, window.y[1] + insets.top * scale],
    };
  }

  function applyCamera() {
    if (current.kind === 'look') {
      camera.position.set(...current.position);
      camera.fov = current.fov;
      camera.aspect = aspect;
      camera.lookAt(...current.target);
      camera.updateProjectionMatrix();
      return;
    }
    // Nhìn thẳng −z qua khung trên mặt phẳng màn chiếu: màn chiếu luôn là hình chữ nhật trên màn hình.
    camera.position.set(...current.position);
    camera.rotation.set(0, 0, 0);
    const frustum = offAxisFrustum(current.position, fullWindow(current.window), NEAR);
    camera.projectionMatrix.makePerspective(frustum.left, frustum.right, frustum.top, frustum.bottom, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function stepCamera(dt) {
    if (cameraId === 'follow') retarget();
    if (current.kind !== 'window' || target.kind !== 'window') return false;
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * (cameraId === 'follow' ? 6 : 5));
    let moving = false;
    const ease = (from, to) => {
      const next = from + (to - from) * k;
      if (Math.abs(to - next) > 1e-3) moving = true;
      return Math.abs(to - next) > 1e-3 ? next : to;
    };
    current.position = current.position.map((value, index) => ease(value, target.position[index]));
    for (const axis of ['x', 'y']) current.window[axis] = current.window[axis].map((value, index) => ease(value, target.window[axis][index]));
    return moving;
  }

  function resize() {
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    if (cssWidth === width && cssHeight === height) return;
    width = cssWidth;
    height = cssHeight;
    aspect = width / height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    retarget(true);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function setCameraInternal(id, seatId = focusSeatId, notify = false) {
    const reseat = (cameraId === 'seat') !== (id === 'seat') || (id === 'seat' && seatId !== focusSeatId);
    cameraId = id;
    focusSeatId = seatId;
    retarget();
    if (reseat) rebuild();
    if (notify) onCameraChange?.(id);
  }

  // Vị trí đầu (để đặt bong bóng, cảm xúc, bảng tên) của một người: ngồi ghế hoặc đang đứng.
  function headOf(id) {
    const person = participants.get(id);
    if (!person) return null;
    const seat = !(id === self.id && self.standing) && seatsById.get(person.seatId);
    if (seat) return new THREE.Vector3(seat.x, seat.y + HEAD_TOP + 0.08, seat.z - 0.03);
    const walker = walkers.walkers.get(id);
    return walker ? new THREE.Vector3(walker.x, walker.y + 1.32, walker.z) : null;
  }

  function removeBubble(id) {
    const bubble = bubbles.get(id);
    if (!bubble) return;
    root.remove(bubble.sprite);
    disposeSprite(bubble.sprite);
    bubbles.delete(id);
  }

  // Góc "Ghế tôi" đặt camera sau lưng ghế mình: ẩn người ngồi ngay sau (chỉ trên máy mình) để không che tầm nhìn.
  function blocksSeatView(seat) {
    const focus = cameraId === 'seat' && seatsById.get(focusSeatId);
    const back = theater.cameras.seat.back || 0;
    return Boolean(focus) && seat.z > focus.z + 0.2 && seat.z < focus.z + back + 0.6 && Math.abs(seat.x - focus.x) < 0.9;
  }

  // Nhân vật chọn ở chùa (server gửi skin); chưa có thì nam/nữ theo mã người.
  const skinOf = (person) => (SKINS.includes(person.skin) || /^shop-/.test(person.skin || '') ? person.skin : ['man', 'woman'][hash(person.id) % 2]);

  function rebuild() {
    const people = [];
    const used = new Set();
    const standing = new Set();
    for (const person of participants.values()) {
      const seat = seatsById.get(person.seatId);
      const isSelf = person.id === self.id;
      if (seat && !(isSelf && self.standing) && !used.has(seat.id)) {
        used.add(seat.id);
        if (!blocksSeatView(seat)) people.push({ seat, skin: skinOf(person), look: lookOf(person.id, skinOf(person)) });
        continue;
      }
      if (isSelf || person.pos) standing.add(person.id);
    }
    crowd.place(people);
    // Ghế mình màu vàng; ghế trống có vòng sáng khi mình đang đứng.
    const mine = mySeat();
    seatMeshes.paint(mine);
    // Sofa đủ hai người: trái tim sáng hồng (và đập nhẹ trong vòng vẽ).
    if (seatMeshes.hearts) {
      heartsOn = [];
      couples.forEach((couple, index) => {
        const full = couple.seats.every((id) => used.has(id));
        // Góc "Ghế tôi" nhìn từ sau lưng sofa mình: trái tim của sofa đó nằm ngay trước camera nên ẩn (chỉ trên máy mình).
        const hidden = cameraId === 'seat' && couple.seats.includes(focusSeatId);
        if (full && !hidden) heartsOn.push(index);
        else seatMeshes.hearts.setMatrixAt(index, hidden ? new THREE.Matrix4().makeScale(0, 0, 0) : at(couple.x, couple.y + 1.3, couple.z + 0.3, 0, couple.ry));
        seatMeshes.hearts.setColorAt(index, full ? HEART_ON : HEART_DIM);
      });
      seatMeshes.hearts.instanceColor.needsUpdate = true;
      seatMeshes.hearts.instanceMatrix.needsUpdate = true;
    }
    rings.count = 0;
    if (self.id && !mine) {
      for (const seat of seats) {
        if (used.has(seat.id)) continue;
        rings.setMatrixAt(rings.count, at(seat.x, seat.y + SEAT_TOP + 0.02, seat.z - 0.02));
        rings.count += 1;
      }
    }
    rings.instanceMatrix.needsUpdate = true;
    // Người đang đứng: giữ tối đa MAX_WALKERS người gần mình nhất.
    const near = [...standing].map((id) => {
      const person = participants.get(id);
      const pos = id === self.id ? selfPose() : person.pos;
      return { id, distance: Math.hypot(pos.x - self.x, pos.z - self.z), person };
    }).sort((a, b) => (a.id === self.id ? -1 : b.id === self.id ? 1 : a.distance - b.distance)).slice(0, MAX_WALKERS);
    const keep = new Set(near.map((item) => item.id));
    for (const id of [...walkers.walkers.keys()]) if (!keep.has(id)) walkers.remove(id);
    for (const { id, person } of near) {
      const isNew = !walkers.walkers.has(id);
      const walker = walkers.get(id, skinOf(person), lookOf(id, skinOf(person)));
      if (id === self.id) continue;
      walker.target = { ...person.pos };
      if (isNew) Object.assign(walker, { x: person.pos.x, z: person.pos.z, ry: person.pos.ry, y: floorHeight(scene, person.pos.z) });
    }
    for (const id of bubbles.keys()) if (!headOf(id)) removeBubble(id);
    // Bảng tên: mặc định chỉ hiện tên mình (scene.characters.nameTags).
    const mineNow = me();
    const tagKey = mineNow ? `${mineNow.id}|${mineNow.name}` : null;
    if (tagKey !== myTagKey) {
      if (myTag) {
        root.remove(myTag);
        disposeSprite(myTag);
        myTag = null;
      }
      myTagKey = tagKey;
      if (mineNow) {
        const name = mineNow.name.length > 18 ? `${mineNow.name.slice(0, 17)}…` : mineNow.name;
        myTag = textSprite(name, { background: 'rgba(243, 201, 105, 0.95)', color: '#2a1606', height: 1, bold: true });
        myTag.userData.base = myTag.scale.clone();
        myTag.renderOrder = 3;
        root.add(myTag);
      }
    }
    dirty = true;
  }

  // ---- Mình đi lại ----
  function sendMove(moving, force = false) {
    const now = performance.now();
    if (!force && now - self.sentAt < 200) return;
    self.sentAt = now;
    onMove?.({ x: Math.round(self.x * 100) / 100, z: Math.round(self.z * 100) / 100, ry: Math.round(Math.atan2(Math.sin(self.ry), Math.cos(self.ry)) * 100) / 100, moving });
  }

  // Đứng dậy khỏi ghế (bắt đầu đi): đứng ở khoảng để chân trước ghế, camera chuyển sang bám nhân vật.
  function standUp() {
    const seat = seatsById.get(mySeat());
    if (seat) Object.assign(self, { x: seat.x, z: seat.z - walk.legroom, ry: 0 });
    self.standing = true;
    if (cameraId !== 'follow') setCameraInternal('follow', focusSeatId, true);
    rebuild();
  }

  const findRoute = (goal) => (self.seatGoal ? pathToSeat(scene, seats, selfPose(), self.seatGoal) : findPath(scene, seats, selfPose(), goal));

  // Đường tới một chỗ đứng được theo hướng (ux, uz) cách 1,2…4,5 m (dùng khi hướng kéo bị hàng ghế chặn).
  function assistPath(ux, uz) {
    for (const distance of [1.2, 2, 3, 4.5]) {
      const goal = { x: self.x + ux * distance, z: self.z + uz * distance };
      const path = findPath(scene, seats, selfPose(), goal);
      const end = path.at(-1);
      // Chỉ nhận đường thật sự đưa mình đi theo hướng đang kéo (ô trống gần đích, không phải quay lại chỗ cũ).
      if (end && (end.x - self.x) * ux + (end.z - self.z) * uz > distance * 0.5) return path;
    }
    return null;
  }

  // Ghế trống ngay trước mặt (đang đứng, không đi theo đường): báo trang hiện nút "Ngồi".
  let nearId = null;
  function checkNearSeat() {
    let seat = null;
    if (self.id && !mySeat() && !self.path.length) {
      const taken = new Set([...participants.values()].map((person) => person.seatId).filter(Boolean));
      seat = nearestSeat(scene, seats, selfPose(), taken);
    }
    const id = seat?.id || null;
    if (id !== nearId) {
      nearId = id;
      onNearSeat?.(id);
    }
  }

  function walkTo(points, seatGoal = null) {
    if (!self.id) return;
    if (mySeat()) standUp();
    self.path = points;
    self.seatGoal = seatGoal;
    if (cameraId !== 'follow') setCameraInternal('follow', focusSeatId, true);
  }

  function stepSelf(dt) {
    if (!self.id || mySeat()) return false;
    let dx = 0;
    let dz = 0;
    if (keys.size) {
      // Phím: lên = về phía màn chiếu (camera luôn nhìn về màn chiếu).
      if (keys.has('up')) dz -= 1;
      if (keys.has('down')) dz += 1;
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (dx || dz) {
        self.path = [];
        self.seatGoal = null;
      }
    }
    let pace = 1;
    let manual = Boolean(dx || dz);
    if (!dx && !dz && Math.hypot(joystick.x, joystick.y) > 0.15) {
      manual = true;
      dx = joystick.x;
      dz = joystick.y;
      pace = Math.min(1, Math.hypot(dx, dz));
      self.path = [];
      self.seatGoal = null;
    }
    if (!dx && !dz && self.path.length) {
      const next = self.path[0];
      dx = next.x - self.x;
      dz = next.z - self.z;
      if (Math.hypot(dx, dz) < 0.06) {
        self.path.shift();
        if (!self.path.length && self.seatGoal) {
          const seat = seatsById.get(self.seatGoal);
          self.seatGoal = null;
          self.moving = false;
          sendMove(false, true);
          if (seat) onSeatClick?.({ id: seat.id, row: seat.row });
          return true;
        }
        return true;
      }
    }
    const length = Math.hypot(dx, dz);
    if (!length) {
      if (self.moving) {
        self.moving = false;
        sendMove(false, true);
      }
      return false;
    }
    const speed = WALK_SPEED * pace * dt;
    const step = Math.min(speed, self.path.length && !keys.size ? length : speed);
    const ux = dx / length;
    const uz = dz / length;
    // Hỗ trợ lái: đang đứng trong hàng ghế mà kéo về phía bị chặn (hàng sau/trước) thì tự men theo hàng ra lối đi gần
    // nhất rồi đi tiếp theo hướng đang kéo. Đã bắt đầu thì đi hết đường đó khi còn kéo cùng hướng (không giằng co).
    const keepAssist = manual && self.assist?.length && ux * self.assistDir.x + uz * self.assistDir.z > 0.7;
    let next = keepAssist ? null : slideMove(scene, seats, self, { x: self.x + ux * step, z: self.z + uz * step });
    if (!keepAssist) self.assist = null;
    if (manual && (keepAssist || Math.hypot(next.x - self.x, next.z - self.z) < step * 0.3)) {
      const now = performance.now();
      if (!self.assist && now - (self.assistAt || 0) > 300) {
        self.assistAt = now;
        self.assist = assistPath(ux, uz);
        self.assistDir = { x: ux, z: uz };
      }
      while (self.assist?.length && Math.hypot(self.assist[0].x - self.x, self.assist[0].z - self.z) < 0.08) self.assist.shift();
      const point = self.assist?.[0];
      if (point) {
        dx = point.x - self.x;
        dz = point.z - self.z;
        const distance = Math.hypot(dx, dz);
        next = slideMove(scene, seats, self, { x: self.x + (dx / distance) * Math.min(step, distance), z: self.z + (dz / distance) * Math.min(step, distance) });
      } else next ||= { x: self.x, z: self.z };
    }
    // Bị kẹt hẳn (đường đi chạm ghế người khác vừa ngồi…): tìm lại đường một lần, không được thì đứng lại.
    if (!manual && next.x === self.x && next.z === self.z) {
      const goal = self.path.at(-1);
      self.path = goal && !self.retried ? findRoute(goal) : [];
      self.retried = true;
      if (!self.path.length) self.seatGoal = null;
    } else self.retried = false;
    self.x = next.x;
    self.z = next.z;
    self.ry = Math.atan2(-dx, -dz);
    self.moving = true;
    sendMove(true);
    return true;
  }

  function stepWalkers(dt) {
    let active = false;
    for (const [id, walker] of walkers.walkers) {
      if (id === self.id) {
        walker.moving = self.moving;
        walker.x = self.x;
        walker.z = self.z;
        walker.ry = self.ry;
      } else if (walker.target) {
        const dx = walker.target.x - walker.x;
        const dz = walker.target.z - walker.z;
        const distance = Math.hypot(dx, dz);
        const step = Math.max(WALK_SPEED, distance * 3) * dt;
        walker.moving = distance > 0.03;
        if (walker.moving) {
          const k = Math.min(1, step / distance);
          walker.x += dx * k;
          walker.z += dz * k;
          walker.ry = Math.atan2(-dx, -dz);
        } else walker.ry = walker.target.ry ?? walker.ry;
      }
      const floor = floorHeight(scene, walker.z);
      walker.y += (floor - walker.y) * Math.min(1, dt * 12);
      // Bước chân: hai bàn chân đưa ra trước/sau, người nhún nhẹ.
      walker.phase += dt * (walker.moving ? 11 : 0);
      const swing = walker.moving && !reduceMotion ? Math.sin(walker.phase) : 0;
      walker.feet.forEach((foot, index) => { foot.position.z = -0.04 + swing * 0.09 * (index ? -1 : 1); });
      walker.upper.position.y = walker.hips.stand + Math.abs(swing) * 0.025;
      walker.rig?.pose({ hip: walker.upper.position.y, stride: swing, moving: walker.moving, dt });
      walker.figure.position.set(walker.x, walker.y + Math.abs(swing) * 0.01, walker.z);
      walker.figure.rotation.y = walker.ry;
      if (walker.moving || Math.abs(floor - walker.y) > 1e-3) active = true;
    }
    return active;
  }

  const focusOwner = () => self.id;

  // Chữ (bong bóng, tên) to theo khoảng cách tới camera để đọc được cả từ cuối rạp.
  function sizeLabel(sprite, position, factor) {
    const distance = camera.position.distanceTo(position);
    const size = Math.min(0.45, Math.max(0.18, distance * factor));
    sprite.scale.set(sprite.userData.base.x * size, sprite.userData.base.y * size, 1);
  }

  function updateLabels(now) {
    let alive = false;
    const inSeatView = current.kind === 'window' && cameraId === 'seat';
    for (const [id, bubble] of bubbles) {
      const age = now - bubble.at;
      const position = headOf(id);
      if (age > BUBBLE_LIMITS.ttlMs || !position) {
        removeBubble(id);
        dirty = true;
        continue;
      }
      alive = true;
      position.y += id === self.id && myTag?.visible ? 0.32 : 0;
      bubble.sprite.position.copy(position);
      sizeLabel(bubble.sprite, position, 0.03);
      const pop = reduceMotion ? 1 : Math.min(1, age / 160);
      bubble.sprite.scale.multiplyScalar(0.6 + 0.4 * pop);
      bubble.sprite.material.opacity = Math.min(1, (BUBBLE_LIMITS.ttlMs - age) / 600);
      // Ở góc "Ghế tôi", bong bóng của chính mình nằm ngay camera: ẩn đi (vẫn có trong khung chat).
      bubble.sprite.visible = !(inSeatView && id === focusOwner());
    }
    if (myTag) {
      const position = headOf(self.id);
      myTag.visible = Boolean(position) && !inSeatView;
      if (position) {
        myTag.position.copy(position);
        sizeLabel(myTag, position, 0.024);
      }
    }
    // Cảm xúc bay lên rồi mờ dần trong 2,2 giây.
    for (let index = reactions.length - 1; index >= 0; index -= 1) {
      const item = reactions[index];
      const age = (now - item.at) / 2200;
      const position = headOf(item.id);
      if (age >= 1 || !position) {
        root.remove(item.sprite);
        disposeSprite(item.sprite);
        reactions.splice(index, 1);
        dirty = true;
        continue;
      }
      alive = true;
      position.x += Math.sin(age * 6 + item.drift) * 0.12;
      position.y += 0.25 + age * 1.2;
      item.sprite.position.copy(position);
      const size = Math.min(0.7, Math.max(0.28, camera.position.distanceTo(position) * 0.045)) * (age < 0.12 ? age / 0.12 : 1);
      item.sprite.scale.set(size, size, 1);
      item.sprite.material.opacity = Math.min(1, (1 - age) * 3);
    }
    return alive;
  }

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    resize();
    const walking = stepSelf(dt);
    checkNearSeat();
    const others = stepWalkers(dt);
    const moving = stepCamera(dt);
    // Đèn: chuyển dần giữa "đèn nhà" và "đang chiếu".
    const wantMix = screenActive ? 1 : 0;
    const lighting = Math.abs(wantMix - lightMix) > 0.002;
    lightMix += (wantMix - lightMix) * (reduceMotion ? 1 : Math.min(1, dt * 1.5));
    const flicker = screenActive && !reduceMotion ? 0.82 + 0.18 * Math.sin(now / 370) * Math.sin(now / 1130 + 1.3) : 1;
    house.intensity = 1.1 - 0.75 * lightMix;
    fill.intensity = 0.25 - 0.1 * lightMix;
    screenLight.intensity = (0.35 + 1.5 * lightMix) * flicker;
    hall.beam.material.opacity = 0.09 * lightMix * flicker;
    hall.surface.material.color.setRGB(0.08 + 0.05 * lightMix, 0.11 + 0.06 * lightMix, 0.16 + 0.08 * lightMix);
    rings.material.opacity = rings.count ? 0.45 + (reduceMotion ? 0 : 0.3 * Math.sin(now / 400)) : 0;
    // Trái tim của sofa đủ hai người đập nhẹ.
    if (heartsOn.length && !reduceMotion) {
      const beat = 1 + 0.18 * Math.max(0, Math.sin(now / 160)) * Math.max(0, Math.sin(now / 900));
      for (const index of heartsOn) {
        const couple = couples[index];
        seatMeshes.hearts.setMatrixAt(index, at(couple.x, couple.y + 1.3, couple.z + 0.3, 0, couple.ry).multiply(new THREE.Matrix4().makeScale(beat, beat, beat)));
      }
      seatMeshes.hearts.instanceMatrix.needsUpdate = true;
    }
    applyCamera();
    const labels = updateLabels(Date.now());
    // Khi không có gì chuyển động thì không vẽ lại; đang chiếu thì vẽ tối đa 30 khung/giây cho ánh màn.
    const animating = moving || lighting || labels || walking || others;
    const idleBudget = (screenActive || rings.count || heartsOn.length) && !reduceMotion ? 1000 / 30 : Infinity;
    const budget = animating ? 1000 / maxFps : idleBudget;
    if (!dirty && now - lastDraw < budget) return;
    dirty = false;
    lastDraw = now;
    renderer.render(scene3d, camera);
    frames += 1;
    if (now - fpsAt >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
  }

  // Chạm ghế (hoặc người đang ngồi): đi tới ghế rồi ngồi. Chạm sàn: đi tới đó.
  const raycaster = new THREE.Raycaster();
  let downAt = null;
  function onPointerDown(event) {
    downAt = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event) {
    if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 10) return;
    downAt = null;
    const box = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    applyCamera();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...seatMeshes.meshes, ...crowd.meshes(), ...hall.floors], false)[0];
    if (!hit) return;
    const seatId = hit.object.userData.seatIds?.[hit.instanceId];
    const seat = seatId && seatsById.get(seatId);
    if (seat) {
      // Chưa vào phòng, hoặc ghế đã có người: để trang xử lý (mở khung nhập tên / báo ghế đã có người).
      const taken = [...participants.values()].some((person) => person.seatId === seat.id && person.id !== self.id);
      if (!self.id || taken || !walk) onSeatClick?.({ id: seat.id, row: seat.row });
      else if (mySeat() !== seat.id) walkTo(pathToSeat(scene, seats, mySeat() ? { x: seatsById.get(mySeat()).x, z: seatsById.get(mySeat()).z - walk.legroom } : selfPose(), seat.id), seat.id);
      return;
    }
    // Chạm sàn: tìm đường vòng qua hàng ghế tới chỗ đó.
    if (self.id && walk && isWalkable(scene, seats, hit.point.x, hit.point.z)) {
      const path = findPath(scene, seats, selfPose(), { x: hit.point.x, z: hit.point.z });
      if (path.length) walkTo(path);
    }
  }
  // Phím mũi tên / WASD (không bắt khi đang gõ chữ).
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function onKey(event) {
    const key = KEYMAP[event.code];
    if (!key || event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.type === 'keydown') {
      if (!self.id) return;
      if (!keys.size && mySeat()) standUp();
      keys.add(key);
      if (cameraId !== 'follow') setCameraInternal('follow', focusSeatId, true);
      event.preventDefault();
    } else keys.delete(key);
  }
  const clearKeys = () => keys.clear();
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', clearKeys);

  // Dịch sẵn shader của mọi vật thể (kể cả người, bong bóng, cảm xúc) trước khung đầu để vào rạp không bị giật.
  resize();
  const probes = [textSprite('·', { background: '#fff', color: '#000', height: 0.2, tail: true }), emojiSprite('👏')];
  root.add(...probes);
  walkers.get('__probe', 'man', lookOf('probe', 'man'));
  walkers.get('__probe2', 'woman', lookOf('probe2', 'woman'));
  crowd.place(SKINS.map((skin, index) => ({ seat: seats[index], skin, look: lookOf(skin, skin) })));
  rings.count = 1;
  applyCamera();
  renderer.compile(scene3d, camera);
  for (const probe of probes) {
    root.remove(probe);
    disposeSprite(probe);
  }
  walkers.remove('__probe');
  walkers.remove('__probe2');
  rings.count = 0;
  crowd.place([]);
  raf = requestAnimationFrame(frame);

  return {
    scene,
    mode: '3d',
    // list: { id, name, seatId?, pos?, skin?, me? }. Người đứng (có pos, không ghế) là người đi lại.
    setParticipants(list) {
      participants.clear();
      for (const person of list) participants.set(person.id, person);
      const mine = list.find((person) => person.me);
      if (mine && mine.id !== self.id) {
        // Mới vào (hoặc nối lại): đứng ở chỗ server còn nhớ, không thì ở cửa sau rạp.
        self.id = mine.id;
        const start = mine.pos || walk.spawn;
        Object.assign(self, { x: start.x, z: start.z, ry: start.ry ?? 0, path: [], seatGoal: null });
        if (!mine.pos && !mine.seatId && walk) sendMove(false, true);
        setCameraInternal(mine.seatId ? 'seat' : 'follow', mine.seatId || null, true);
      } else if (!mine && self.id) self.id = null;
      // Server xác nhận đã ngồi: thôi đứng, chuyển sang góc ghế. Server xác nhận đã đứng: bỏ cờ tạm.
      if (mine?.seatId && self.standing && !self.moving && !self.path.length && !keys.size) self.standing = false;
      if (mine && !mine.seatId) self.standing = false;
      if (mine?.seatId && !self.standing && (cameraId === 'follow' || focusSeatId !== mine.seatId) && cameraId !== 'overview' && cameraId !== 'screen' && cameraId !== 'audience') {
        setCameraInternal('seat', mine.seatId, true);
      }
      rebuild();
    },
    // room.moves: vị trí người khác (của mình thì bỏ qua: máy mình là nguồn).
    applyMoves(moves) {
      let changed = false;
      for (const move of moves) {
        if (move.id === self.id) continue;
        const person = participants.get(move.id);
        if (!person) continue;
        person.pos = { x: move.x, z: move.z, ry: move.ry };
        if (person.seatId && move.m) person.seatId = null;
        const walker = walkers.walkers.get(move.id);
        if (walker) walker.target = { ...person.pos };
        else changed = true;
      }
      if (changed) rebuild();
      dirty = true;
    },
    say(participantId, text) {
      const person = participants.get(participantId);
      if (!person || !headOf(participantId)) return false;
      removeBubble(participantId);
      if (bubbles.size >= BUBBLE_LIMITS.maxVisible) removeBubble(bubbles.keys().next().value);
      const sprite = textSprite(truncateBubble(text), {
        background: person.me ? '#f3c969' : 'rgba(250, 250, 248, 0.95)', color: '#1b140c', height: 1, tail: true,
      });
      sprite.userData.base = sprite.scale.clone();
      sprite.renderOrder = 4;
      root.add(sprite);
      bubbles.set(participantId, { sprite, at: Date.now() });
      dirty = true;
      return true;
    },
    react(participantId, kind) {
      const emoji = REACTION_EMOJI[kind];
      if (!emoji || !headOf(participantId)) return false;
      if (reactions.length >= MAX_REACTIONS) {
        const old = reactions.shift();
        root.remove(old.sprite);
        disposeSprite(old.sprite);
      }
      const sprite = emojiSprite(emoji);
      root.add(sprite);
      reactions.push({ id: participantId, sprite, at: Date.now(), drift: Math.random() * 6 });
      dirty = true;
      return true;
    },
    setCamera(id, seatId = focusSeatId) {
      setCameraInternal(id, id === 'seat' ? seatId : focusSeatId);
    },
    setJoystick(x, y) {
      joystick.x = x;
      joystick.y = y;
      if (!self.id || Math.hypot(x, y) < 0.2) return;
      if (mySeat()) standUp();
      if (cameraId !== 'follow') setCameraInternal('follow', focusSeatId, true);
    },
    // Đi tới ghế rồi ngồi (sơ đồ ghế "Đổi ghế"). Trả false nếu chưa vào phòng hoặc ghế không có.
    goToSeat(seatId) {
      const seat = seatsById.get(seatId);
      if (!self.id || !seat || mySeat() === seatId) return false;
      const from = mySeat() ? { x: seatsById.get(mySeat()).x, z: seatsById.get(mySeat()).z - walk.legroom } : selfPose();
      walkTo(pathToSeat(scene, seats, from, seat.id), seat.id);
      return true;
    },
    // Ngồi vào ghế trống ngay trước mặt (nút "Ngồi").
    sitNearby() {
      return nearId ? this.goToSeat(nearId) : false;
    },
    // Đứng dậy khỏi ghế để đi.
    standUp() {
      if (!self.id || !mySeat()) return false;
      standUp();
      sendMove(true, true);
      return true;
    },
    // Phần bị thanh giao diện che (px): màn chiếu luôn nằm trong phần còn lại.
    setInsets(next) {
      const value = (key) => Math.max(0, Math.round(next[key] || 0));
      const updated = { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') };
      if (Object.keys(updated).every((key) => updated[key] === insets[key])) return;
      insets = updated;
      retarget(true);
    },
    // Đang chiếu: đèn nhà dịu xuống, ánh màn hắt lên khán giả, tia máy chiếu hiện.
    setScreenActive(active) {
      screenActive = Boolean(active);
      dirty = true;
    },
    // Khung màn chiếu theo pixel CSS trong canvas. Góc "Khán giả" quay lưng về màn: trả khung nhỏ ở góc
    // (pip) để player vẫn hiện rõ, không bị che.
    screenRect() {
      if (!current) return null;
      if (current.kind === 'look') {
        const pipWidth = Math.min(width - insets.left - insets.right - 24, Math.max(240, width * 0.42));
        return { x: insets.left + 12, y: insets.top + 8, width: pipWidth, height: (pipWidth * 9) / 16, pip: true };
      }
      return windowToPixels(screen, fullWindow(current.window), width, height);
    },
    // Toạ độ (pixel CSS trong canvas) của nệm ghế: dùng cho test tự động và gợi ý trên giao diện.
    seatPoint(seatId) {
      const seat = seatsById.get(seatId);
      if (!seat) return null;
      applyCamera();
      camera.updateMatrixWorld();
      const point = new THREE.Vector3(seat.x, seat.y + SEAT_TOP, seat.z).project(camera);
      return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
    },
    selfState() {
      return { id: self.id, x: self.x, z: self.z, seatId: mySeat(), moving: self.moving, path: self.path.length, assist: self.assist?.length ?? null, camera: cameraId };
    },
    stats() {
      return { fps, participants: participants.size, seats: seats.length, walkers: walkers.walkers.size, mode: '3d', calls: renderer.info.render.calls };
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', clearKeys);
      for (const id of [...bubbles.keys()]) removeBubble(id);
      renderer.dispose();
    },
  };
}
