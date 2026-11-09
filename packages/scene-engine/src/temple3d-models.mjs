// Mô hình chánh điện 3D dựng bằng hình khối Three.js: kiến trúc, bàn thờ, tượng Phật, người ngồi.
// Khối tĩnh dùng chung vật liệu được gộp (mergeGeometries) để giảm lệnh vẽ trên điện thoại (threejs-performance).
// Toạ độ mét; bàn thờ ở z ≈ 0, khán đường về +z; tượng Phật nhìn ra khán đường (+z), người ngồi nhìn về −z.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Tiện ích ----------

// Gom hình khối tĩnh theo vật liệu rồi gộp thành một mesh mỗi vật liệu.
export class StaticBatch {
  constructor() {
    this.parts = new Map();
  }

  add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    const copy = (geometry.index ? geometry : geometry).clone().applyMatrix4(matrix);
    const prepared = copy.index ? copy : BufferGeometryUtils.mergeVertices(copy);
    for (const name of Object.keys(prepared.attributes)) if (!['position', 'normal', 'uv'].includes(name)) prepared.deleteAttribute(name);
    if (!prepared.attributes.uv) prepared.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(prepared.attributes.position.count * 2), 2));
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(prepared);
  }

  build(root, { castShadow = false, receiveShadow = false } = {}) {
    for (const [material, geometries] of this.parts) {
      const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      root.add(mesh);
    }
    this.parts.clear();
  }
}

function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

const lathe = (points, segments = 32) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);

// Một đoạn chi (tay, chân, ngón) nối hai khớp: capsule đặt giữa hai điểm, trục quay theo hướng nối.
function limb(batch, material, from, to, radius) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const euler = new THREE.Euler().setFromQuaternion(quaternion);
  const middle = a.add(b).multiplyScalar(0.5);
  batch.add(new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 8, 14), material, { position: middle.toArray(), rotation: [euler.x, euler.y, euler.z] });
}

// ---------- Vật liệu và texture ----------

export function createTempleMaterials() {
  // Ván sàn dài chạy dọc chánh điện, màu gần nhau, mối nối so le (không thành ô bàn cờ khi lặp lại).
  const planks = canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#6e3f22';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0, column = 0; x < w; x += 64, column += 1) {
      const shade = 0.92 + ((column * 37) % 7) * 0.018;
      ctx.fillStyle = `rgb(${Math.round(112 * shade)}, ${Math.round(66 * shade)}, ${Math.round(37 * shade)})`;
      ctx.fillRect(x, 0, 64, h);
      for (let line = 0; line < 14; line += 1) {
        ctx.strokeStyle = `rgba(45, 20, 8, ${0.08 + (line % 3) * 0.04})`;
        ctx.beginPath();
        const offset = x + 4 + line * 4.3;
        ctx.moveTo(offset, 0);
        ctx.bezierCurveTo(offset + 4, h * 0.33, offset - 4, h * 0.66, offset + 2, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(25, 10, 4, 0.5)';
      ctx.fillRect(x, 0, 2, h);
      const joint = ((column * 389) % 1024);
      ctx.fillRect(x, joint, 64, 2);
    }
  }, [4, 4]);
  const carpet = canvasTexture(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8e1b14';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6a640';
    ctx.fillRect(6, 0, 6, h);
    ctx.fillRect(w - 12, 0, 6, h);
    ctx.fillStyle = 'rgba(214, 166, 64, 0.55)';
    for (let y = 32; y < h; y += 64) {
      ctx.beginPath();
      ctx.arc(w / 2, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8e1b14';
      ctx.beginPath();
      ctx.arc(w / 2, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(214, 166, 64, 0.55)';
    }
  }, [1, 6]);
  const aureole = canvasTexture(512, 512, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.08, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
    gradient.addColorStop(0.45, 'rgba(240, 180, 70, 0.75)');
    gradient.addColorStop(0.8, 'rgba(200, 90, 30, 0.55)');
    gradient.addColorStop(1, 'rgba(160, 40, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.8)';
    for (const radius of [0.24, 0.33, 0.42]) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    for (let ray = 0; ray < 48; ray += 1) {
      const angle = (ray / 48) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(angle) * w * 0.12, h / 2 + Math.sin(angle) * h * 0.12);
      ctx.lineTo(w / 2 + Math.cos(angle) * w * 0.47, h / 2 + Math.sin(angle) * h * 0.47);
      ctx.stroke();
    }
  });
  const contactShadow = canvasTexture(128, 128, (ctx, w) => {
    const gradient = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, w);
  });

  const standard = (options) => new THREE.MeshStandardMaterial(options);
  return {
    floor: standard({ map: planks, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.4 }),
    carpet: standard({ map: carpet, roughness: 0.95, envMapIntensity: 0.2 }),
    wall: standard({ color: '#5a1812', roughness: 0.85, envMapIntensity: 0.25 }),
    wainscot: standard({ color: '#3b1c0f', roughness: 0.6, envMapIntensity: 0.3 }),
    ceiling: standard({ color: '#2b120a', roughness: 1, envMapIntensity: 0.15 }),
    darkWood: standard({ color: '#3a1d10', roughness: 0.55, envMapIntensity: 0.35 }),
    lacquer: standard({ color: '#8a1d12', roughness: 0.3, metalness: 0.05, envMapIntensity: 0.6 }),
    pillar: standard({ color: '#9a1d13', roughness: 0.32, envMapIntensity: 0.6 }),
    stone: standard({ color: '#7d7468', roughness: 0.85, envMapIntensity: 0.3 }),
    gold: standard({ color: '#e0ad4c', metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }),
    buddhaGold: standard({ color: '#e7b450', metalness: 1, roughness: 0.26, envMapIntensity: 1.25, emissive: '#3d2306', emissiveIntensity: 0.35 }),
    buddhaRobe: standard({ color: '#c98e2c', metalness: 0.9, roughness: 0.42, envMapIntensity: 1.05, emissive: '#2e1904', emissiveIntensity: 0.3 }),
    lotusPink: standard({ color: '#eab3a0', metalness: 0.55, roughness: 0.38, envMapIntensity: 0.9 }),
    aureole: new THREE.MeshBasicMaterial({ map: aureole, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    haloRing: standard({ color: '#ffd27a', emissive: '#ffb84a', emissiveIntensity: 1.2, roughness: 0.4 }),
    eye: standard({ color: '#5a3a14', metalness: 0.4, roughness: 0.5 }),
    candle: standard({ color: '#f3e3c3', roughness: 0.6 }),
    lotusLamp: standard({ color: '#f6a5b5', emissive: '#e2667f', emissiveIntensity: 0.7 }),
    bronze: standard({ color: '#7a5a2a', metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 }),
    lantern: standard({ color: '#d1301f', emissive: '#ff4a26', emissiveIntensity: 1.1, roughness: 0.6 }),
    window: standard({ color: '#2a140a', emissive: '#ffb066', emissiveIntensity: 0.55 }),
    fruitOrange: standard({ color: '#f08a24', roughness: 0.55 }),
    fruitYellow: standard({ color: '#f2cf3a', roughness: 0.55 }),
    fruitGreen: standard({ color: '#7fae3a', roughness: 0.6 }),
    plaque: standard({ color: '#2a1209', roughness: 0.5 }),
    cushion: standard({ color: '#6b2a1c', roughness: 0.9, envMapIntensity: 0.2 }),
    mat: standard({ color: '#3d1a12', roughness: 0.95, envMapIntensity: 0.15 }),
    skinTone: standard({ color: '#e4b893', roughness: 0.65, envMapIntensity: 0.4 }),
    contactShadow: new THREE.MeshBasicMaterial({ map: contactShadow, transparent: true, depthWrite: false }),
  };
}

// Chữ thư pháp trên hoành phi, câu đối (vàng trên nền gỗ sẫm).
function calligraphy(lines, width, height, fontSize) {
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(width, height, (ctx, w, h) => {
      ctx.fillStyle = '#2a1209';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d6a640';
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = '#e8bd5a';
      ctx.font = `700 ${fontSize}px "Noto Serif", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, index) => ctx.fillText(line, w / 2, (h / (lines.length + 1)) * (index + 1)));
    }),
    roughness: 0.5,
    metalness: 0.1,
  });
}

// ---------- Kiến trúc ----------

// Vị trí cột (x, z): dùng chung cho dựng hình và để camera không chui vào cột.
export const PILLARS = [-1.6, 2.6, 6.8, 11, 15].flatMap((z) => [[-4.3, z], [4.3, z]]);
export const PILLAR_CLEARANCE = 0.75;

// Kích thước chánh điện lấy từ scene JSON (world.hall); thiếu trường nào thì dùng số của chánh điện nhỏ ban đầu.
//   halfWidth: nửa bề ngang, back/front: z tường sau/trước, height: trần, pillars: [[x, z]], altarWidth: bệ thờ,
//   backdropWidth: phông đỏ sau tượng, couplets: x câu đối, windows: các z cửa sổ, lanterns: { x, z: [] } đèn lồng treo.
export function hallLayout(world) {
  const hall = world?.hall || {};
  return {
    halfWidth: hall.halfWidth ?? 6,
    back: hall.back ?? -3,
    front: hall.front ?? 16,
    height: hall.height ?? 8,
    pillars: hall.pillars ?? PILLARS,
    altarWidth: hall.altarWidth ?? 5.4,
    backdropWidth: hall.backdropWidth ?? 4,
    couplets: hall.couplets ?? 2.55,
    windows: hall.windows ?? [4.6, 8.8, 13],
    lanterns: hall.lanterns ?? { x: 3.2, z: [1.2, 5.2, 9.2] },
  };
}

// options.openFront: có sân ngoài chùa thì bỏ tường trước (mặt tiền có cửa do courtyard3d dựng).
export function buildHall(root, m, options = {}) {
  const batch = new StaticBatch();
  const hall = options.hall || hallLayout(null);
  const width = hall.halfWidth * 2;
  const depth = hall.front - hall.back;
  const midZ = (hall.front + hall.back) / 2;
  const height = hall.height;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  root.add(floor);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 12.6), m.carpet);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.004, 8.0);
  root.add(carpet);

  // Tường: chân gỗ cao 1,2 m, phần trên sơn đỏ, nẹp vàng; cửa sổ song gỗ hắt sáng ấm ở hai bên.
  const plane = new THREE.PlaneGeometry(1, 1);
  const walls = [
    { size: [width, height], position: [0, height / 2, hall.back], rotation: [0, 0, 0] },
    { size: [depth, height], position: [-hall.halfWidth, height / 2, midZ], rotation: [0, Math.PI / 2, 0] },
    { size: [depth, height], position: [hall.halfWidth, height / 2, midZ], rotation: [0, -Math.PI / 2, 0] },
    ...(options.openFront ? [] : [{ size: [width, height], position: [0, height / 2, hall.front], rotation: [0, Math.PI, 0] }]),
  ];
  for (const wall of walls) {
    batch.add(plane, m.wall, { position: wall.position, rotation: wall.rotation, scale: [...wall.size, 1] });
    const inward = new THREE.Vector3(0, 0, 0.06).applyEuler(new THREE.Euler(...wall.rotation));
    batch.add(new THREE.BoxGeometry(wall.size[0], 1.2, 0.08), m.wainscot, {
      position: [wall.position[0] + inward.x, 0.6, wall.position[2] + inward.z], rotation: wall.rotation,
    });
    batch.add(new THREE.BoxGeometry(wall.size[0], 0.07, 0.1), m.gold, {
      position: [wall.position[0] + inward.x * 1.3, 1.22, wall.position[2] + inward.z * 1.3], rotation: wall.rotation,
    });
  }
  for (const side of [-1, 1]) {
    for (const z of hall.windows) {
      const x = side * (hall.halfWidth - 0.04);
      batch.add(plane, m.window, { position: [x, 2.9, z], rotation: [0, -side * Math.PI / 2, 0], scale: [1.6, 2.2, 1] });
      const frame = (w, h, dy, dz) => batch.add(new THREE.BoxGeometry(0.08, h, w), m.darkWood, { position: [x - side * 0.03, 2.9 + dy, z + dz] });
      frame(1.75, 0.1, 1.15, 0);
      frame(1.75, 0.1, -1.15, 0);
      frame(0.1, 2.4, 0, 0.85);
      frame(0.1, 2.4, 0, -0.85);
      for (let bar = -2; bar <= 2; bar += 1) frame(0.04, 2.2, 0, bar * 0.3);
      for (let bar = -3; bar <= 3; bar += 1) frame(1.6, 0.04, bar * 0.3, 0);
    }
  }

  // Trần ô cờ: dầm dọc ngang và ô sẫm.
  batch.add(plane, m.ceiling, { position: [0, height, midZ], rotation: [Math.PI / 2, 0, 0], scale: [width, depth, 1] });
  for (let z = hall.back; z <= hall.front; z += 2.4) batch.add(new THREE.BoxGeometry(width, 0.22, 0.22), m.darkWood, { position: [0, height - 0.15, z] });
  for (const k of [-0.72, -0.25, 0.25, 0.72]) batch.add(new THREE.BoxGeometry(0.22, 0.22, depth), m.darkWood, { position: [k * hall.halfWidth, height - 0.2, midZ] });

  // Cột bát giác: chân đá, thân sơn son, vòng vàng; hai cặp cột gần bàn thờ có rồng vàng quấn.
  const shaft = new THREE.CylinderGeometry(0.26, 0.29, height - 0.6, 8);
  const base = new THREE.CylinderGeometry(0.42, 0.46, 0.3, 8);
  const band = new THREE.TorusGeometry(0.29, 0.035, 6, 16);
  for (const [x, z] of hall.pillars) {
    {
      batch.add(base, m.stone, { position: [x, 0.15, z] });
      batch.add(shaft, m.pillar, { position: [x, 0.3 + (height - 0.6) / 2, z] });
      for (const y of [0.5, height - 1.1]) batch.add(band, m.gold, { position: [x, y, z], rotation: [Math.PI / 2, 0, 0] });
      if (z < 3) {
        const points = [];
        for (let step = 0; step <= 80; step += 1) {
          const t = step / 80;
          const angle = t * Math.PI * 6 * Math.sign(x);
          points.push(new THREE.Vector3(x + Math.cos(angle) * 0.32, 0.8 + t * 5.6, z + Math.sin(angle) * 0.32));
        }
        batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, 0.055 - 0.0001, 6), m.gold);
      }
    }
  }
  batch.build(root);
}

// Đèn lồng: thân tròn đỏ phát sáng, chóp và đáy vàng, tua; treo bằng dây.
export function buildLanterns(root, m, hall = hallLayout(null)) {
  const batch = new StaticBatch();
  const y = hall.height * 0.7;
  const body = lathe([[0.02, -0.34], [0.2, -0.3], [0.3, -0.12], [0.31, 0.05], [0.26, 0.24], [0.12, 0.33], [0.02, 0.34]], 20);
  const lanterns = [];
  for (const z of hall.lanterns.z) {
    for (const x of [-hall.lanterns.x, hall.lanterns.x]) {
      const lantern = new THREE.Mesh(body, m.lantern);
      lantern.position.set(x, y, z);
      root.add(lantern);
      lanterns.push(lantern);
      batch.add(new THREE.CylinderGeometry(0.14, 0.18, 0.08, 16), m.gold, { position: [x, y + 0.37, z] });
      batch.add(new THREE.CylinderGeometry(0.18, 0.14, 0.08, 16), m.gold, { position: [x, y - 0.37, z] });
      batch.add(new THREE.ConeGeometry(0.06, 0.32, 8), m.lantern, { position: [x, y - 0.58, z], rotation: [Math.PI, 0, 0] });
      const cord = hall.height - (y + 0.4);
      batch.add(new THREE.CylinderGeometry(0.008, 0.008, cord, 4), m.darkWood, { position: [x, y + 0.4 + cord / 2, z] });
    }
  }
  batch.build(root);
  return lanterns;
}

// ---------- Bệ thờ, bàn thờ, hoành phi ----------

export function buildAltar(root, m, hall = hallLayout(null)) {
  const batch = new StaticBatch();
  // Bệ ba cấp viền vàng (rộng theo hall.altarWidth: chánh điện lớn đặt được ba tượng).
  const tier = hall.altarWidth;
  [[tier, 2.8, 0.125], [tier - 0.9, 2.3, 0.375], [tier - 2.1, 1.9, 0.625]].forEach(([width, depth, y]) => {
    batch.add(new THREE.BoxGeometry(width, 0.25, depth), m.darkWood, { position: [0, y, -1.95] });
    batch.add(new THREE.BoxGeometry(width + 0.02, 0.04, 0.04), m.gold, { position: [0, y + 0.11, -1.95 + depth / 2] });
  });
  // Phông đỏ sau tượng, khung vàng, vòng tròn trang trí.
  const backdrop = hall.backdropWidth;
  batch.add(new THREE.BoxGeometry(backdrop, 4.8, 0.08), m.lacquer, { position: [0, 3.1, -2.92] });
  for (const [w, h, x, y] of [[backdrop + 0.1, 0.1, 0, 5.5], [backdrop + 0.1, 0.1, 0, 0.7], [0.1, 4.9, -backdrop / 2 - 0.05, 3.1], [0.1, 4.9, backdrop / 2 + 0.05, 3.1]]) {
    batch.add(new THREE.BoxGeometry(w, h, 0.12), m.gold, { position: [x, y, -2.88] });
  }
  // Bàn thờ sơn son, panô chạm viền vàng phía trước.
  batch.add(new THREE.BoxGeometry(3.4, 0.86, 0.95), m.lacquer, { position: [0, 0.43, -0.35] });
  batch.add(new THREE.BoxGeometry(3.5, 0.06, 1.0), m.gold, { position: [0, 0.89, -0.35] });
  for (const x of [-1.1, 0, 1.1]) {
    batch.add(new THREE.BoxGeometry(0.9, 0.5, 0.02), m.darkWood, { position: [x, 0.45, 0.13] });
    for (const [w, h, dx, dy] of [[0.94, 0.03, 0, 0.26], [0.94, 0.03, 0, -0.26], [0.03, 0.55, -0.46, 0], [0.03, 0.55, 0.46, 0]]) {
      batch.add(new THREE.BoxGeometry(w, h, 0.03), m.gold, { position: [x + dx, 0.45 + dy, 0.14] });
    }
  }
  // Mâm quả, bình sen, chuông và mõ trên bàn thờ.
  for (const x of [-0.95, 0.95]) {
    batch.add(lathe([[0, 0], [0.22, 0.01], [0.26, 0.05], [0, 0.05]], 20), m.gold, { position: [x, 0.92, -0.4] });
    [[0, 0.09, 0, 'fruitOrange'], [0.09, 0.08, 0.05, 'fruitYellow'], [-0.09, 0.08, 0.04, 'fruitGreen'], [0.02, 0.17, 0.02, 'fruitOrange']].forEach(([dx, dy, dz, kind]) => {
      batch.add(new THREE.SphereGeometry(0.075, 12, 10), m[kind], { position: [x + dx, 0.92 + dy, -0.4 + dz] });
    });
  }
  for (const x of [-1.55, 1.55]) {
    batch.add(lathe([[0, 0], [0.09, 0.02], [0.12, 0.15], [0.06, 0.3], [0.08, 0.38], [0, 0.38]], 16), m.bronze, { position: [x, 0.92, -0.55] });
    for (const [dx, dy] of [[0, 0.62], [-0.07, 0.55], [0.07, 0.57]]) {
      batch.add(new THREE.CylinderGeometry(0.006, 0.006, dy - 0.3, 4), m.fruitGreen, { position: [x + dx, 0.92 + 0.3 + (dy - 0.3) / 2, -0.55] });
      batch.add(new THREE.SphereGeometry(0.05, 10, 8), m.lotusPink, { position: [x + dx, 0.92 + dy, -0.55], scale: [1, 1.5, 1] });
    }
  }
  batch.add(lathe([[0, 0], [0.12, 0.01], [0.15, 0.12], [0.13, 0.15], [0, 0.15]], 20), m.bronze, { position: [-1.3, 0.92, -0.1], rotation: [Math.PI, 0, 0] });
  batch.add(new THREE.SphereGeometry(0.12, 16, 12), m.darkWood, { position: [1.3, 1.02, -0.1], scale: [1.2, 0.8, 1] });

  // Hoành phi và câu đối.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.06), [m.plaque, m.plaque, m.plaque, m.plaque, calligraphy(['CHÁNH ĐIỆN'], 1024, 236, 120), m.plaque]);
  plaque.position.set(0, 6.05, -2.86);
  root.add(plaque);
  for (const [x, words] of [[-hall.couplets, ['TỪ', 'BI']], [hall.couplets, ['HỶ', 'XẢ']]]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.6, 0.05), [m.plaque, m.plaque, m.plaque, m.plaque, calligraphy(words, 160, 1000, 120), m.plaque]);
    board.position.set(x, 3.2, -2.86);
    root.add(board);
  }

  // Nến hai bên, đèn sen, nhang trên bàn.
  const candles = [];
  for (const x of [-0.45, 0.45]) {
    batch.add(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 12), m.candle, { position: [x, 1.1, -0.2] });
    batch.add(lathe([[0, 0], [0.09, 0.01], [0.06, 0.05], [0, 0.05]], 16), m.gold, { position: [x, 0.92, -0.2] });
    candles.push({ x, y: 1.36, z: -0.2 });
  }
  for (const x of [-0.2, 0.2]) batch.add(new THREE.SphereGeometry(0.08, 14, 10), m.lotusLamp, { position: [x, 0.98, -0.6], scale: [1, 0.75, 1] });
  batch.build(root);
  return { candles };
}

// Lư hương đồng ba chân đặt trên sàn, giữa bàn thờ và hàng bồ đoàn đầu: chỗ mọi người cắm hương.
export function buildBurner(root, m) {
  const batch = new StaticBatch();
  batch.add(lathe([[0, 0], [0.32, 0.02], [0.46, 0.18], [0.5, 0.36], [0.54, 0.4], [0.5, 0.42], [0, 0.42]], 32), m.bronze, { position: [0, 0.32, 1.0] });
  batch.add(new THREE.CircleGeometry(0.47, 32), m.stone, { position: [0, 0.72, 1.0], rotation: [-Math.PI / 2, 0, 0] });
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    batch.add(new THREE.CylinderGeometry(0.04, 0.06, 0.36, 10), m.bronze, { position: [Math.cos(angle) * 0.3, 0.18, 1.0 + Math.sin(angle) * 0.3] });
  }
  for (const side of [-1, 1]) {
    batch.add(new THREE.TorusGeometry(0.1, 0.022, 8, 16, Math.PI), m.gold, { position: [side * 0.55, 0.78, 1.0], rotation: [0, Math.PI / 2, 0] });
  }
  batch.add(new THREE.PlaneGeometry(1.5, 1.5), m.contactShadow, { position: [0, 0.006, 1.0], rotation: [-Math.PI / 2, 0, 0] });
  batch.build(root);
  return { position: new THREE.Vector3(0, 0, 1.0), ashY: 0.72 };
}

// ---------- Khuôn mặt (texture vẽ, đặt lên mảnh cầu sát mặt trước của đầu) ----------

// Mảnh cầu phủ vùng mặt: phiCenter là hướng mặt quay (π/2 = +z, −π/2 = −z); texture: trên = trán, dưới = cằm.
function facePatch(radius, phiCenter, phiLength, thetaStart, thetaLength) {
  return new THREE.SphereGeometry(radius, 32, 24, phiCenter - phiLength / 2, phiLength, thetaStart, thetaLength);
}

// Mặt tượng Phật: mày cong nối sống mũi, mắt khép nhìn xuống, mí dày, môi mỉm, bạch hào; nét vàng sẫm trên nền trong suốt.
function buddhaFaceTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const line = (width, color) => { ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; };
    ctx.clearRect(0, 0, w, h);
    // Bóng hốc mắt và hai bên sống mũi.
    for (const side of [-1, 1]) {
      const gradient = ctx.createRadialGradient(w / 2 + side * 100, h * 0.47, 6, w / 2 + side * 100, h * 0.47, 70);
      gradient.addColorStop(0, 'rgba(90, 50, 10, 0.32)');
      gradient.addColorStop(1, 'rgba(90, 50, 10, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    // Mày cong, nối vào sống mũi.
    line(9, 'rgba(85, 45, 8, 0.85)');
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + side * 14, h * 0.4);
      ctx.quadraticCurveTo(w / 2 + side * 90, h * 0.27, w / 2 + side * 168, h * 0.38);
      ctx.stroke();
    }
    line(6, 'rgba(85, 45, 8, 0.4)');
    ctx.beginPath();
    ctx.moveTo(w / 2 - 12, h * 0.42);
    ctx.lineTo(w / 2 - 9, h * 0.6);
    ctx.stroke();
    // Mắt khép nhìn xuống: mí trên dày cong, khe mắt mảnh.
    for (const side of [-1, 1]) {
      const cx = w / 2 + side * 100;
      line(10, 'rgba(70, 36, 6, 0.9)');
      ctx.beginPath();
      ctx.moveTo(cx - 52, h * 0.46);
      ctx.quadraticCurveTo(cx, h * 0.52, cx + 52, h * 0.455);
      ctx.stroke();
      line(4, 'rgba(70, 36, 6, 0.5)');
      ctx.beginPath();
      ctx.moveTo(cx - 44, h * 0.43);
      ctx.quadraticCurveTo(cx, h * 0.455, cx + 46, h * 0.425);
      ctx.stroke();
    }
    // Cánh mũi.
    line(6, 'rgba(85, 45, 8, 0.55)');
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(w / 2 + side * 22, h * 0.635, 16, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.1, side < 0 ? Math.PI * 1.1 : Math.PI * 0.5);
      ctx.stroke();
    }
    // Môi mỉm: viền môi trên hình cung, môi dưới đầy, khóe hơi nhếch.
    ctx.fillStyle = 'rgba(150, 70, 30, 0.55)';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 58, h * 0.735);
    ctx.quadraticCurveTo(w / 2 - 22, h * 0.705, w / 2, h * 0.722);
    ctx.quadraticCurveTo(w / 2 + 22, h * 0.705, w / 2 + 58, h * 0.735);
    ctx.quadraticCurveTo(w / 2, h * 0.8, w / 2 - 58, h * 0.735);
    ctx.fill();
    line(5, 'rgba(80, 35, 8, 0.85)');
    ctx.beginPath();
    ctx.moveTo(w / 2 - 60, h * 0.73);
    ctx.quadraticCurveTo(w / 2, h * 0.75, w / 2 + 60, h * 0.73);
    ctx.stroke();
    // Bạch hào giữa hai mày.
    ctx.fillStyle = 'rgba(255, 236, 190, 0.95)';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.36, 11, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Mặt người dùng: lòng trắng, tròng đen và ánh sáng mắt, lông mày theo màu tóc, mũi, miệng cười, má hồng.
function personFaceTexture(browColor) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (const side of [-1, 1]) {
      const cheek = ctx.createRadialGradient(w / 2 + side * 62, h * 0.6, 2, w / 2 + side * 62, h * 0.6, 26);
      cheek.addColorStop(0, 'rgba(235, 120, 110, 0.45)');
      cheek.addColorStop(1, 'rgba(235, 120, 110, 0)');
      ctx.fillStyle = cheek;
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2 + side * 44;
      ctx.fillStyle = '#fbf7f0';
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.42, 17, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1a12';
      ctx.beginPath();
      ctx.arc(cx, h * 0.425, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(cx + 3, h * 0.405, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60, 35, 25, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, h * 0.42, 17, 11, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = browColor;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 20, h * 0.315);
      ctx.quadraticCurveTo(cx, h * 0.27, cx + 20, h * 0.315);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150, 90, 70, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, h * 0.56);
    ctx.quadraticCurveTo(w / 2, h * 0.6, w / 2 + 6, h * 0.56);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170, 60, 60, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, h * 0.68);
    ctx.quadraticCurveTo(w / 2, h * 0.75, w / 2 + 20, h * 0.68);
    ctx.stroke();
  });
}

// ---------- Tượng Phật ----------

// Tượng ngồi kiết già kiểu tượng Việt: cà sa vắt vai trái để lộ vai phải, bàn chân ngửa trên đùi, ấn thiền (hai ngón cái
// chạm nhau), cổ ba ngấn, tai dài, tóc xoắn ốc, nhục kế, mặt trái xoan mắt khép môi mỉm. Da vàng sáng, y vàng trầm.
export function buildBuddha(root, m) {
  const group = new THREE.Group();
  const batch = new StaticBatch();
  const skin = m.buddhaGold;
  const robe = m.buddhaRobe;

  // Đài sen: trống đế, hai tầng cánh (ngoài hồng ngả ra, trong vàng ôm lên).
  batch.add(lathe([[0, 0], [0.9, 0], [0.95, 0.12], [0.8, 0.2], [0.82, 0.3], [0.72, 0.36], [0, 0.36]], 32), m.gold);
  const petal = new THREE.SphereGeometry(1, 12, 10);
  for (const [count, radius, y, tilt, size, material] of [[16, 0.86, 0.42, 0.75, [0.2, 0.07, 0.3], m.lotusPink], [12, 0.7, 0.52, 0.45, [0.18, 0.06, 0.26], m.gold]]) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      batch.add(petal, material, { position: [Math.sin(angle) * radius, y, Math.cos(angle) * radius], rotation: [tilt, angle, 0], scale: size });
    }
  }
  batch.add(lathe([[0, 0.5], [0.7, 0.5], [0.72, 0.58], [0, 0.58]], 32), m.gold);

  // Lòng và chân xếp: vạt y phủ đùi (rộng, thấp), hai cẳng chân bắt chéo, bàn chân ngửa trên đùi.
  batch.add(lathe([[0, 0.58], [0.64, 0.6], [0.68, 0.66], [0.62, 0.76], [0.44, 0.83], [0.34, 0.85], [0, 0.85]], 40), robe, { scale: [1, 1, 0.74], position: [0, 0, 0.08] });
  for (const side of [-1, 1]) {
    batch.add(new THREE.CapsuleGeometry(0.12, 0.46, 8, 16), robe, { position: [side * 0.13, 0.74, 0.28], rotation: [0, side * 0.45, Math.PI / 2], scale: [1, 1, 0.8] });
    batch.add(new THREE.SphereGeometry(0.1, 16, 12), skin, { position: [side * 0.31, 0.855, 0.3 - side * 0.03], rotation: [0, side * 0.45, 0], scale: [1.45, 0.42, 0.72] });
    for (let toe = 0; toe < 4; toe += 1) {
      batch.add(new THREE.SphereGeometry(0.019, 8, 6), skin, { position: [side * (0.44 + toe * 0.008), 0.87, 0.335 - toe * 0.03 - side * 0.03] });
    }
  }

  // Thân: eo thon, ngực nở, vai tròn (cơ vai), cổ ba ngấn. Y phủ thân; vai và cánh tay phải để trần;
  // viền y vắt chéo từ vai trái xuống hông phải.
  const torso = [[0.34, 0.84], [0.36, 0.98], [0.39, 1.12], [0.43, 1.28], [0.44, 1.36], [0.4, 1.45], [0.28, 1.52], [0.14, 1.56], [0.112, 1.6], [0.108, 1.64], [0, 1.65]];
  batch.add(lathe([[0, 0.84], ...torso], 40), robe, { scale: [1, 1, 0.7] });
  batch.add(new THREE.SphereGeometry(0.13, 18, 14), skin, { position: [-0.38, 1.42, 0.0], scale: [1, 0.9, 0.85] });
  batch.add(new THREE.SphereGeometry(0.135, 18, 14), robe, { position: [0.38, 1.42, 0.0], scale: [1, 0.9, 0.85] });
  batch.add(new THREE.SphereGeometry(0.2, 18, 14), skin, { position: [-0.17, 1.37, 0.17], scale: [1, 0.75, 0.55] });
  const sashEdge = new THREE.CatmullRomCurve3([[0.08, 1.56, 0.06], [-0.06, 1.47, 0.28], [-0.24, 1.3, 0.3], [-0.38, 1.12, 0.22], [-0.42, 0.98, 0.12]].map((point) => new THREE.Vector3(...point)));
  batch.add(new THREE.TubeGeometry(sashEdge, 40, 0.028, 8), robe);
  for (const y of [1.585, 1.61, 1.635]) batch.add(new THREE.TorusGeometry(0.11, 0.006, 6, 24), skin, { position: [0, y, 0.005], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1] });

  // Tay theo khớp: vai → khuỷu (hơi ra ngoài, xuôi xuống) → cổ tay ở lòng. Tay phải trần, tay trái trong y.
  for (const side of [-1, 1]) {
    const material = side < 0 ? skin : robe;
    const shoulder = [side * 0.43, 1.4, 0.0];
    const elbow = [side * 0.5, 1.02, 0.1];
    const wrist = [side * 0.13, 0.93, 0.36];
    limb(batch, material, shoulder, elbow, side < 0 ? 0.075 : 0.088);
    limb(batch, material, elbow, wrist, side < 0 ? 0.062 : 0.074);
  }
  // Ấn thiền: lòng bàn tay phải đặt trên lòng bàn tay trái, hai ngón cái chạm đầu nhau thành vòng.
  batch.add(new THREE.SphereGeometry(0.1, 18, 12), skin, { position: [0, 0.905, 0.4], scale: [1.4, 0.34, 0.82] });
  batch.add(new THREE.SphereGeometry(0.1, 18, 12), skin, { position: [0, 0.932, 0.41], scale: [1.3, 0.32, 0.78] });
  limb(batch, skin, [-0.1, 0.94, 0.42], [-0.012, 0.99, 0.44], 0.016);
  limb(batch, skin, [0.1, 0.94, 0.42], [0.012, 0.99, 0.44], 0.016);

  // Đầu trái xoan; cằm, mũi, môi là khối thật để nhìn nghiêng có dáng; tai dài dái tai dày.
  const headY = 1.88;
  const head = { radius: 0.25, scale: [0.9, 1.14, 0.95] };
  batch.add(new THREE.SphereGeometry(head.radius, 32, 24), skin, { position: [0, headY, 0], scale: head.scale });
  batch.add(new THREE.SphereGeometry(0.07, 14, 10), skin, { position: [0, headY - 0.19, 0.11], scale: [1.15, 0.7, 0.8] });
  batch.add(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), skin, { position: [0, headY - 0.02, 0.232], rotation: [0.25, 0, 0] });
  batch.add(new THREE.SphereGeometry(0.03, 10, 8), skin, { position: [0, headY - 0.07, 0.24], scale: [1.3, 0.8, 0.9] });
  batch.add(new THREE.CapsuleGeometry(0.014, 0.07, 4, 8), skin, { position: [0, headY - 0.115, 0.226], rotation: [0, 0, Math.PI / 2] });
  for (const side of [-1, 1]) {
    batch.add(new THREE.CapsuleGeometry(0.03, 0.17, 4, 10), skin, { position: [side * 0.225, headY - 0.05, -0.01], rotation: [0, 0, side * 0.1], scale: [0.7, 1, 1] });
    batch.add(new THREE.SphereGeometry(0.035, 10, 8), skin, { position: [side * 0.228, headY - 0.16, 0], scale: [0.7, 1.1, 0.9] });
  }
  const face = new THREE.Mesh(
    facePatch(head.radius * 1.004, Math.PI / 2, 1.5, 0.95, 1.4),
    new THREE.MeshStandardMaterial({ map: buddhaFaceTexture(), transparent: true, metalness: 0.5, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
  );
  face.position.set(0, headY, 0);
  face.scale.set(...head.scale);
  group.add(face);

  // Tóc xoắn ốc (InstancedMesh: một lệnh vẽ) chừa trán và gáy; nhục kế trên đỉnh.
  const curlGeometry = new THREE.SphereGeometry(0.024, 6, 5);
  const curlPositions = [];
  const capCurls = (center, radius, scale, count, keep) => {
    for (let index = 0; index < count; index += 1) {
      const y = 1 - (index / (count - 1)) * 1.4;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * 2.399963;
      const point = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
      if (!keep(point)) continue;
      curlPositions.push(new THREE.Vector3(center.x + point.x * radius * scale[0], center.y + point.y * radius * scale[1], center.z + point.z * radius * scale[2]));
    }
  };
  // Đường chân tóc: phía trước cao (trán), hai bên và sau thấp dần.
  capCurls(new THREE.Vector3(0, headY, 0), head.radius * 1.03, head.scale, 420, (point) => point.y > (point.z > 0 ? 0.42 - point.z * 0.1 : 0.05));
  capCurls(new THREE.Vector3(0, headY + 0.29, -0.01), 0.11, [1, 1, 1], 70, (point) => point.y > -0.3);
  const curls = new THREE.InstancedMesh(curlGeometry, skin, curlPositions.length);
  const matrix = new THREE.Matrix4();
  curlPositions.forEach((position, index) => curls.setMatrixAt(index, matrix.makeTranslation(position.x, position.y, position.z)));
  group.add(curls);
  batch.add(new THREE.SphereGeometry(0.1, 16, 12), skin, { position: [0, headY + 0.29, -0.01] });
  batch.build(group);

  // Vầng lửa sau thân và hào quang sau đầu (texture phát sáng), vòng hào quang vàng.
  const flame = new THREE.Shape();
  flame.moveTo(0, -1.05);
  flame.bezierCurveTo(1.15, -1.05, 1.25, 0.55, 0, 1.55);
  flame.bezierCurveTo(-1.25, 0.55, -1.15, -1.05, 0, -1.05);
  const flameGeometry = new THREE.ShapeGeometry(flame, 24);
  const uv = flameGeometry.attributes.uv;
  const position = flameGeometry.attributes.position;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, position.getX(index) / 2.6 + 0.5, (position.getY(index) + 1.05) / 2.6);
  const aureole = new THREE.Mesh(flameGeometry, m.aureole);
  aureole.position.set(0, 1.25, -0.42);
  group.add(aureole);
  const haloDisc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), m.aureole);
  haloDisc.position.set(0, headY + 0.02, -0.3);
  group.add(haloDisc);
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 64), m.haloRing);
  haloRing.position.set(0, headY + 0.02, -0.28);
  group.add(haloRing);

  // Tượng chính phải luôn là Phật ngồi, kể cả trước và sau khi tượng GLB hai bên tải trễ.
  group.scale.setScalar(1.7);
  group.position.set(0, 0.75, -2.0);
  root.add(group);
  return { group, aureole, haloDisc, haloRing };
}

// ---------- Người ngồi ----------

const ROBES = { man: '#a5b1c3', woman: '#a9b4c6', nun: '#9ea7b4', granny: '#8a5a3b', monk: '#c06a1f', child: '#bcc6d3' };
const COLLARS = { man: '#d9dee6', woman: '#dfe3ea', nun: '#c5cbd4', granny: '#5e3a24', monk: '#9a4f14', child: '#e6eaf0' };
const HAIR = { man: '#1d1714', woman: '#15110f', nun: '#8c939c', granny: '#cfcbc4', child: '#2b1d14' };

// Người ngồi kiết già quay về bàn thờ. Phần trên (thân, tay, đầu) là một nhóm xoay quanh hông để cúi lạy.
// Hình khối mỗi kiểu được gộp sẵn theo vật liệu và dùng chung cho mọi người cùng kiểu.
export function createPersonFactory(m) {
  const cache = new Map();
  const robeMaterials = Object.fromEntries(Object.entries(ROBES).map(([skin, color]) => [skin, new THREE.MeshStandardMaterial({ color, roughness: 0.82, envMapIntensity: 0.4 })]));
  const collarMaterials = Object.fromEntries(Object.entries(COLLARS).map(([skin, color]) => [skin, new THREE.MeshStandardMaterial({ color, roughness: 0.75, envMapIntensity: 0.4 })]));
  const hairMaterials = Object.fromEntries(Object.entries(HAIR).map(([skin, color]) => [skin, new THREE.MeshStandardMaterial({ color, roughness: 0.55, envMapIntensity: 0.5 })]));
  // Mặt dùng chung texture, chỉ khác màu lông mày theo tóc (sư thầy: nâu nhạt).
  const faceMaterials = Object.fromEntries(['man', 'woman', 'granny', 'nun', 'monk', 'child'].map((skin) => [skin, new THREE.MeshStandardMaterial({
    map: personFaceTexture(HAIR[skin] === '#cfcbc4' ? '#8d8780' : HAIR[skin] || '#5a3a24'),
    transparent: true, roughness: 0.65, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  })]));

  function parts(skin) {
    if (cache.has(skin)) return cache.get(skin);
    const robe = robeMaterials[skin] || robeMaterials.man;
    const lower = new StaticBatch();
    const upper = new StaticBatch();
    // Chân xếp bằng và vạt áo phủ.
    lower.add(new THREE.CapsuleGeometry(0.11, 0.36, 6, 12), robe, { position: [0, 0.1, -0.06], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 0.85] });
    lower.add(lathe([[0, 0], [0.3, 0.01], [0.31, 0.08], [0.25, 0.2], [0.21, 0.26], [0, 0.26]], 20), robe);
    // Thân, vai, cổ áo; tay chắp trong lòng.
    upper.add(lathe([[0, 0], [0.21, 0], [0.2, 0.14], [0.19, 0.24], [0.21, 0.31], [0.17, 0.37], [0.07, 0.4], [0, 0.41]], 20), robe, { scale: [1, 1, 0.82] });
    upper.add(new THREE.TorusGeometry(0.075, 0.018, 6, 16), collarMaterials[skin] || collarMaterials.man, { position: [0, 0.39, 0], rotation: [Math.PI / 2, 0, 0] });
    for (const side of [-1, 1]) {
      upper.add(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), robe, { position: [side * 0.2, 0.22, -0.02], rotation: [0.2, 0, side * 0.15] });
      upper.add(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), robe, { position: [side * 0.12, 0.08, -0.13], rotation: [1.3, 0, side * -0.8] });
    }
    upper.add(new THREE.SphereGeometry(0.05, 10, 8), m.skinTone, { position: [0, 0.06, -0.2], scale: [1.4, 0.8, 1] });
    if (skin === 'monk') {
      const sash = new THREE.CatmullRomCurve3([[-0.17, 0.36, 0.02], [0, 0.25, 0.17], [0.19, 0.06, 0.12]].map((point) => new THREE.Vector3(...point)));
      upper.add(new THREE.TubeGeometry(sash, 16, 0.03, 6), collarMaterials.monk);
    }
    // Đầu, tai, mũi; mặt vẽ quay về bàn thờ (−z); tóc/khăn phủ đỉnh và gáy, chừa trán.
    const headY = 0.53;
    upper.add(new THREE.SphereGeometry(0.115, 20, 16), m.skinTone, { position: [0, headY, 0], scale: [0.95, 1.05, 1] });
    for (const side of [-1, 1]) upper.add(new THREE.SphereGeometry(0.025, 8, 6), m.skinTone, { position: [side * 0.11, headY, 0.005], scale: [0.6, 1, 1] });
    upper.add(new THREE.SphereGeometry(0.016, 8, 6), m.skinTone, { position: [0, headY - 0.02, -0.114], scale: [1, 1.1, 1] });
    upper.add(facePatch(0.1155, -Math.PI / 2, 1.6, 1.1, 1.25), faceMaterials[skin] || faceMaterials.man, { position: [0, headY, 0], scale: [0.95, 1.05, 1] });
    const hair = hairMaterials[skin];
    if (hair) {
      const cap = new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * (skin === 'nun' ? 0.5 : 0.46));
      upper.add(cap, hair, { position: [0, headY + 0.005, 0.01], rotation: [0.5, 0, 0] });
      if (skin === 'woman') upper.add(new THREE.CapsuleGeometry(0.09, 0.26, 6, 12), hair, { position: [0, headY - 0.18, 0.085], scale: [1.15, 1, 0.45] });
      if (skin === 'granny') upper.add(new THREE.SphereGeometry(0.055, 12, 10), hair, { position: [0, headY + 0.05, 0.12] });
    }
    const built = { lower: new THREE.Group(), upper: new THREE.Group() };
    lower.build(built.lower);
    upper.build(built.upper);
    cache.set(skin, built);
    return built;
  }

  return function buildPerson(skin) {
    const shared = parts(skin);
    const group = new THREE.Group();
    const lower = new THREE.Group();
    for (const mesh of shared.lower.children) lower.add(new THREE.Mesh(mesh.geometry, mesh.material));
    const upper = new THREE.Group();
    for (const mesh of shared.upper.children) upper.add(new THREE.Mesh(mesh.geometry, mesh.material));
    upper.position.y = 0.24;
    group.add(lower, upper);
    // Người ngồi quay mặt về bàn thờ: phía trước của người là −z.
    if (skin === 'child') group.scale.setScalar(0.82);
    return { group, upper };
  };
}

// Bồ đoàn tròn đặt trên tọa cụ vuông, bóng mờ dưới đất (bóng tiếp xúc giả, rẻ hơn shadow map).
export function buildSeat(root, m, seat, batch) {
  batch.add(new THREE.BoxGeometry(0.86, 0.035, 0.86), m.mat, { position: [seat.x, 0.018, seat.z] });
  batch.add(new THREE.PlaneGeometry(1.25, 1.25), m.contactShadow, { position: [seat.x, 0.006, seat.z], rotation: [-Math.PI / 2, 0, 0] });
  const cushion = new THREE.Mesh(lathe([[0, 0], [0.3, 0], [0.34, 0.03], [0.35, 0.07], [0.33, 0.11], [0.26, 0.13], [0, 0.135]], 28), m.cushion);
  cushion.position.set(seat.x, 0.035, seat.z);
  cushion.userData.seatId = seat.id;
  root.add(cushion);
  return cushion;
}
