// Nhân vật chibi: đầu to tròn, mắt nhắm cười, má hồng, tay chắp trước ngực. Dựng hoàn toàn bằng hình khối + một
// texture mặt vẽ bằng canvas (không dùng ảnh ngoài). Cùng một cái đầu (mặt, tóc) dùng ở mọi nơi; chỉ bộ đồ đổi theo
// chỗ: ở chùa mặc áo tràng (outfit "robe"), ở rạp phim mặc đồ thường ngày nhiều màu (outfit "casual").
//
// buildChibiWalker(skin, look) → người đứng/đi { figure, upper, skirt, feet, shins, hips, labelY } (bộ nhập vai dùng).
// createChibiPersonFactory()(skin, look) → người ngồi { group, upper } (bồ đoàn, ghế rạp), cùng giao diện với
// createPersonFactory.
// look (tùy chọn): { outfit: 'robe' | 'casual', top, bottom, accent, tint, popcorn }. tint = true: áo/quần dùng vật
// liệu trắng có userData.tint ('top' | 'bottom' | 'accent') để bộ vẽ tô màu từng người bằng instanceColor.
//
// Hình mua trong shop có mô hình .glb riêng (MODEL_FILES, hiện là chibigirl), dựng sau khi gọi loadChibiModels():
// giữ nguyên bộ đồ của mô hình ở mọi nơi; chưa tải được thì dùng hình khối thay thế (MODEL_FALLBACK). Mô hình không có khung xương mà tách sẵn thân trên / đùi / cẳng chân
// (assets-src/characters/build-chibi.py); người đứng/đi có thêm rig.pose({ hip, stride, kneel, sit }) để gập chân.
import * as THREE from 'three';
import { buildRiggedPerson, buildRiggedWalker, loadRiggedModel } from './rigged3d.mjs';

// Áo tràng theo hình nhân vật: lam (nam/nữ/tiểu), nâu (bà cụ), xám (sư cô), vàng nghệ (sư thầy).
const ROBES = { man: '#4f78bd', woman: '#5a82c4', child: '#4f78bd', granny: '#8a5a3b', nun: '#8d96a3', monk: '#c8741f', pilgrim: '#3d7d68', lotusgirl: '#b5486f' };
const COLLARS = { man: '#eef1f6', woman: '#eef1f6', child: '#eef1f6', granny: '#e9dcc8', nun: '#e6e9ee', monk: '#f1d9a8', pilgrim: '#e8e0c5', lotusgirl: '#ffe3ec' };
// Sư thầy, sư cô, chú tiểu cạo đầu; nam tóc ngắn có mái, nữ tóc dài ngang vai có mái, bà cụ tóc bạc búi.
const HAIR = { man: '#1d1714', woman: '#2a1a12', granny: '#d8d4cc' };
const FEMALE = new Set(['woman', 'nun', 'granny', 'lotusgirl', 'chibigirl']);
const HEAD_STYLE = { pilgrim: 'man', lotusgirl: 'woman' };

const SKIN = '#f3cfa8';
const HEAD_R = 0.2;

// Bảng màu đồ thường ngày (rạp phim): áo tươi, quần/váy đậm hơn, điểm nhấn sọc ngực.
export const CASUAL_TOPS = ['#ff5d73', '#ffb703', '#3ddc97', '#4cc9f0', '#9b5de5', '#f15bb5', '#00bbf9', '#fb8500', '#06d6a0', '#ef476f'];
export const CASUAL_BOTTOMS = ['#2b4c7e', '#1f2937', '#5b3a29', '#3a506b', '#6d597a', '#264653'];
export const CASUAL_SKIRTS = ['#ff8fab', '#ffd166', '#8ecae6', '#cdb4db', '#ff6b6b', '#90be6d'];
export const CASUAL_ACCENTS = ['#ffffff', '#fff3b0', '#1b1b1b', '#ffe066', '#caf0f8'];

export const isFemale = (skin) => FEMALE.has(skin) || riggedBase.get(skin) === 'woman';

function faceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Mắt nhắm cười: hai cung cong xuống kèm hàng mi ngắn.
  ctx.strokeStyle = '#3a2618';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const x of [84, 172]) {
    ctx.beginPath();
    ctx.arc(x, 118, 22, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (const dx of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * 1.15, 104);
      ctx.lineTo(x + dx * 1.55, 98);
      ctx.stroke();
    }
    ctx.lineWidth = 9;
  }
  // Má hồng.
  ctx.fillStyle = 'rgba(240, 120, 120, 0.42)';
  for (const x of [70, 186]) {
    ctx.beginPath();
    ctx.ellipse(x, 150, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Miệng cười nhỏ.
  ctx.strokeStyle = '#b4544a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 160, 12, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function lathe(points, segments = 24) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

// Tự phát sáng nhẹ theo màu: chánh điện/rạp tối, không có thì mặt và áo nhìn sẫm.
const material = (color, roughness = 0.75, glow = 0.22) => new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.4, emissive: color, emissiveIntensity: glow });

function createParts() {
  const skin = material(SKIN, 0.6, 0.35);
  const shoe = material('#3b2414', 0.85);
  const sneaker = material('#f4f1ea', 0.6, 0.3);
  const white = material('#f6f7fb', 0.7, 0.3);
  const robes = Object.fromEntries(Object.entries(ROBES).map(([key, color]) => [key, material(color, 0.8)]));
  const collars = Object.fromEntries(Object.entries(COLLARS).map(([key, color]) => [key, material(color, 0.7)]));
  const hairs = Object.fromEntries(Object.entries(HAIR).map(([key, color]) => [key, material(color, 0.55, 0.12)]));
  const face = new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  // Áo/quần tô màu từng người (InstancedMesh): vật liệu trắng, màu nằm ở instanceColor.
  // Không tự phát sáng: phần phát sáng không nhân với instanceColor nên sẽ phủ trắng làm màu áo bệt đi.
  const tinted = Object.fromEntries(['top', 'bottom', 'accent'].map((key) => {
    const item = material('#ffffff', 0.7, 0);
    item.userData.tint = key;
    return [key, item];
  }));
  const bow = material('#ff6fa3', 0.5, 0.3);
  const popcorn = { box: material('#e63946', 0.6, 0.3), stripe: material('#ffffff', 0.6, 0.3), corn: material('#ffe8a3', 0.9, 0.35) };
  const geometry = {
    head: new THREE.SphereGeometry(HEAD_R, 32, 24),
    // Mảng mặt phía trước (−z), hơi lớn hơn đầu để vẽ mắt/miệng lên trên.
    face: new THREE.SphereGeometry(HEAD_R * 1.004, 32, 16, Math.PI * 1.5 - Math.PI / 3, (Math.PI * 2) / 3, Math.PI * 0.3, Math.PI * 0.45),
    ear: new THREE.SphereGeometry(0.035, 10, 8),
    torso: lathe([[0, 0], [0.15, 0], [0.155, 0.08], [0.14, 0.18], [0.11, 0.24], [0.05, 0.27], [0, 0.27]]),
    collar: new THREE.TorusGeometry(0.075, 0.022, 8, 20),
    crew: new THREE.TorusGeometry(0.07, 0.016, 8, 20),
    band: new THREE.TorusGeometry(0.152, 0.018, 8, 28),
    lapel: new THREE.BoxGeometry(0.028, 0.12, 0.01),
    sleeve: new THREE.CapsuleGeometry(0.05, 0.11, 4, 10),
    hand: new THREE.SphereGeometry(0.038, 12, 10),
    skirt: lathe([[0, 0], [0.19, 0], [0.185, 0.04], [0.165, 0.2], [0.15, 0.32], [0, 0.32]]),
    pants: lathe([[0, 0.02], [0.155, 0.02], [0.15, 0.06], [0.145, 0.2], [0.152, 0.32], [0, 0.32]]),
    dress: lathe([[0, 0.09], [0.2, 0.09], [0.19, 0.13], [0.16, 0.24], [0.15, 0.32], [0, 0.32]]),
    shin: new THREE.CylinderGeometry(0.028, 0.03, 0.1, 10),
    foot: new THREE.SphereGeometry(0.05, 12, 8),
    legs: new THREE.SphereGeometry(0.2, 20, 12),
    hairCap: new THREE.SphereGeometry(HEAD_R * 1.04, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
    // Tóc dài phía sau (nữa sau của mặt cầu, kéo xuống ngang vai).
    hairBack: new THREE.SphereGeometry(HEAD_R * 1.07, 24, 16, 0, Math.PI, Math.PI * 0.12, Math.PI * 0.8),
    bowLoop: new THREE.SphereGeometry(0.04, 10, 8),
    fringe: new THREE.SphereGeometry(0.07, 12, 8),
    lock: new THREE.CapsuleGeometry(0.032, 0.13, 4, 8),
    bun: new THREE.SphereGeometry(0.07, 12, 10),
    bucket: new THREE.CylinderGeometry(0.075, 0.055, 0.12, 14),
    bucketStripe: new THREE.CylinderGeometry(0.076, 0.07, 0.03, 14),
    corn: new THREE.SphereGeometry(0.072, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  return { skin, shoe, sneaker, white, robes, collars, hairs, face, tinted, popcorn, bow, geometry };
}

let shared = null;
const parts = () => (shared ||= createParts());

// Vật liệu màu cho người đi lại ở rạp (mỗi màu một vật liệu, dùng chung giữa các nhân vật).
const colored = new Map();
function colorMaterial(color, key) {
  if (!color) return parts().tinted[key];
  if (!colored.has(color)) colored.set(color, material(color, 0.7, 0.22));
  return colored.get(color);
}

function casualOf(skin, look) {
  const casual = look?.outfit === 'casual';
  if (!casual) return null;
  const tint = Boolean(look.tint);
  return {
    female: isFemale(skin),
    top: tint ? parts().tinted.top : colorMaterial(look.top || CASUAL_TOPS[0], 'top'),
    bottom: tint ? parts().tinted.bottom : colorMaterial(look.bottom || CASUAL_BOTTOMS[0], 'bottom'),
    accent: tint ? parts().tinted.accent : colorMaterial(look.accent || CASUAL_ACCENTS[0], 'accent'),
    popcorn: Boolean(look.popcorn),
  };
}

// Đầu: giống hệt nhau ở mọi bộ đồ (mặt, tai, tóc theo hình nhân vật).
function buildHead(skinKey) {
  const p = parts();
  const headStyle = HEAD_STYLE[skinKey] || skinKey;
  const head = new THREE.Group();
  head.position.y = 0.27 + HEAD_R * 0.86;
  head.add(new THREE.Mesh(p.geometry.head, p.skin), new THREE.Mesh(p.geometry.face, p.face));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(p.geometry.ear, p.skin);
    ear.position.set(side * HEAD_R * 0.97, -0.01, 0.01);
    ear.scale.set(0.6, 1, 0.9);
    head.add(ear);
  }
  const hair = p.hairs[headStyle];
  if (!hair) return head;
  const cap = new THREE.Mesh(p.geometry.hairCap, hair);
  cap.rotation.x = 0.3;
  cap.position.z = 0.012;
  head.add(cap);
  if (headStyle === 'man') {
    // Mái ngắn lệch: ba lọn tròn dẹt trên trán, hai bên tóc mai.
    for (const [x, y, z, s] of [[-0.08, 0.13, -0.135, 1], [0.01, 0.15, -0.14, 1.1], [0.09, 0.12, -0.13, 0.9]]) {
      const tuft = new THREE.Mesh(p.geometry.fringe, hair);
      tuft.position.set(x, y, z);
      tuft.scale.set(0.95 * s, 0.5, 0.55);
      tuft.rotation.z = -x * 2;
      head.add(tuft);
    }
    for (const side of [-1, 1]) {
      const burn = new THREE.Mesh(p.geometry.lock, hair);
      burn.position.set(side * 0.178, 0.02, -0.03);
      burn.scale.set(0.7, 0.45, 0.8);
      head.add(burn);
    }
  } else if (headStyle === 'woman') {
    // Tóc dài ngang vai phía sau, mái bằng trên trán, hai lọn hai bên má.
    const back = new THREE.Mesh(p.geometry.hairBack, hair);
    back.scale.set(1.02, 1.32, 1);
    back.position.set(0, -0.06, 0.014);
    head.add(back);
    const bangs = new THREE.Mesh(p.geometry.fringe, hair);
    bangs.position.set(0, 0.135, -0.135);
    bangs.scale.set(2.1, 0.55, 0.6);
    head.add(bangs);
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(p.geometry.lock, hair);
      lock.position.set(side * 0.185, -0.09, -0.035);
      lock.scale.y = 1.25;
      head.add(lock);
    }
    // Nơ hồng cài bên trái đầu.
    const bow = new THREE.Group();
    bow.position.set(-0.13, 0.15, -0.06);
    bow.rotation.z = 0.5;
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(p.geometry.bowLoop, p.bow);
      loop.position.x = side * 0.035;
      loop.scale.set(1, 0.7, 0.5);
      bow.add(loop);
    }
    head.add(bow);
  } else if (headStyle === 'granny') {
    const bun = new THREE.Mesh(p.geometry.bun, hair);
    bun.position.set(0, 0.1, 0.17);
    head.add(bun);
  }
  return head;
}

// Thân trên (gốc ở hông): thân áo, cổ áo, tay chắp trước ngực (đồ thường: ôm hộp bắp rang), đầu to.
function buildUpper(skinKey, look) {
  const p = parts();
  const casual = casualOf(skinKey, look);
  const robe = p.robes[skinKey] || p.robes.child;
  const shirt = casual ? casual.top : robe;
  const upper = new THREE.Group();
  const torso = new THREE.Mesh(p.geometry.torso, shirt);
  torso.scale.z = 0.85;
  upper.add(torso);
  if (casual) {
    // Áo thun cổ tròn trắng, một sọc ngang màu nhấn.
    const crew = new THREE.Mesh(p.geometry.crew, p.white);
    crew.rotation.x = Math.PI / 2;
    crew.position.y = 0.258;
    const band = new THREE.Mesh(p.geometry.band, casual.accent);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.85, 1);
    band.position.y = 0.11;
    upper.add(crew, band);
  } else {
    const collar = p.collars[skinKey] || p.collars.child;
    const ring = new THREE.Mesh(p.geometry.collar, collar);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.255;
    // Vạt áo chéo (cổ tràng) phía trước.
    const lapel = new THREE.Mesh(p.geometry.lapel, collar);
    lapel.position.set(0.045, 0.2, -0.118);
    lapel.rotation.set(0.25, 0, -0.55);
    upper.add(ring, lapel);
  }
  // Tay chắp mặc định; khi làm việc engine ẩn nhóm này và bật hai tay rời để thật sự cầm/chuyển động cùng đạo cụ.
  const prayerArms = new THREE.Group();
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(p.geometry.sleeve, shirt);
    sleeve.position.set(side * 0.1, 0.15, -0.09);
    sleeve.rotation.set(1.05, 0, side * 0.55);
    prayerArms.add(sleeve);
  }
  const hands = new THREE.Mesh(p.geometry.hand, p.skin);
  hands.scale.set(1.1, 1.35, 0.8);
  hands.position.set(0, 0.17, -0.18);
  prayerArms.add(hands);
  const workArms = new THREE.Group();
  workArms.visible = false;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.115, 0.22, -0.015);
    const sleeve = new THREE.Mesh(p.geometry.sleeve, shirt);
    sleeve.position.y = -0.075;
    const hand = new THREE.Mesh(p.geometry.hand, p.skin);
    hand.scale.set(0.92, 1, 0.92);
    hand.position.y = -0.19;
    pivot.add(sleeve, hand);
    workArms.add(pivot);
    return pivot;
  });
  upper.add(prayerArms, workArms);
  upper.userData.workRig = {
    prayerArms,
    workArms,
    arms,
    set(active, left = {}, right = {}) {
      prayerArms.visible = !active;
      workArms.visible = active;
      if (!active) return;
      for (const [pivot, pose] of [[arms[0], left], [arms[1], right]]) {
        pivot.rotation.set(pose.x || 0, pose.y || 0, pose.z || 0);
        pivot.position.z = -0.015 + (pose.forward || 0);
      }
    },
  };
  if (casual?.popcorn) {
    // Hộp bắp rang sọc đỏ trắng trong tay.
    const bucket = popcornBucket();
    bucket.position.set(0, 0.1, -0.21);
    upper.add(bucket);
  }
  upper.add(buildHead(skinKey));
  return upper;
}

// ---- Mô hình .glb ----
const MODEL_FILES = { chibigirl: '/models/characters/chibi-girl.glb' };
const MODEL_FALLBACK = { chibigirl: 'woman' };
const models = new Map();
let modelsLoading = null;
// Nhân vật admin tải lên (shop-…): mô hình có khung xương (rigged3d.mjs); base = hình khối Nam/Nữ thay thế khi chưa tải
// được (và cho ảnh 2D).
const rigged = new Map();
const riggedBase = new Map();
const riggedLoading = new Map();
// Link đã tải của từng hình (link có ?v=version: admin thay file thì link đổi, tải lại bản mới).
const riggedUrl = new Map();
let loaderPromise = null;
function gltfLoader() {
  loaderPromise ||= Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  });
  return loaderPromise;
}

// File nén lưu vị trí/pháp tuyến dạng số nguyên (KHR_mesh_quantization): đổi sang float rồi áp biến đổi của node.
function floatGeometry(source, matrix) {
  const geometry = source.clone();
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name);
    if (!attribute || attribute.array instanceof Float32Array) continue;
    const values = new Float32Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index += 1) {
      values[index * 3] = attribute.getX(index);
      values[index * 3 + 1] = attribute.getY(index);
      values[index * 3 + 2] = attribute.getZ(index);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
  }
  geometry.applyMatrix4(matrix);
  return geometry;
}

// Mỗi phần (upper, thighL/R, shinL/R) dời về gốc tại khớp của nó: hông (đỉnh đùi), gối (đỉnh cẳng chân).
async function loadModel(src) {
  const gltf = await (await gltfLoader()).loadAsync(src);
  gltf.scene.updateMatrixWorld(true);
  const pieces = {};
  let map = null;
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    pieces[node.name] = floatGeometry(node.geometry, node.matrixWorld);
    map ||= node.material.map;
  });
  const box = (geometry) => {
    geometry.computeBoundingBox();
    return geometry.boundingBox;
  };
  const hip = (box(pieces.thighL).max.y + box(pieces.thighR).max.y) / 2;
  const legs = ['L', 'R'].map((side) => {
    const thigh = box(pieces[`thigh${side}`]);
    const shin = box(pieces[`shin${side}`]);
    const joint = new THREE.Vector3((thigh.min.x + thigh.max.x) / 2, hip, (thigh.min.z + thigh.max.z) / 2);
    const knee = shin.max.y;
    pieces[`thigh${side}`].translate(-joint.x, -hip, -joint.z);
    pieces[`shin${side}`].translate(-joint.x, -knee, -joint.z);
    return { x: joint.x, z: joint.z, thigh: pieces[`thigh${side}`], shin: pieces[`shin${side}`], knee: knee - hip };
  });
  pieces.upper.translate(0, -hip, 0);
  const height = box(pieces.upper).max.y + hip;
  // Tự phát sáng nhẹ theo chính texture (như hình khối) để không tối thui trong rạp.
  const material = new THREE.MeshStandardMaterial({
    map, roughness: 0.8, envMapIntensity: 0.4, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.22,
  });
  return { upper: pieces.upper, legs, hip, thighLength: -legs[0].knee, height, material };
}

// Tải các mô hình .glb (gọi trước khi dựng nhân vật). shopModels: [{ skin, url, base }] nhân vật admin tải lên (danh
// mục /api/v1/shop). Gọi nhiều lần được: mỗi mô hình chỉ tải một lần. Lỗi tải thì giữ hình khối, không ném lỗi.
export function loadChibiModels(shopModels = []) {
  modelsLoading ||= Promise.all(Object.entries(MODEL_FILES).map(async ([skin, src]) => {
    try {
      models.set(skin, await loadModel(src));
    } catch (error) {
      console.warn(`Không tải được mô hình nhân vật ${skin}`, error);
    }
  }));
  for (const { skin, url, base } of shopModels) {
    if (!skin || !url || riggedUrl.get(skin) === url) continue;
    riggedUrl.set(skin, url);
    riggedBase.set(skin, base === 'woman' ? 'woman' : 'man');
    riggedLoading.set(skin, gltfLoader().then((loader) => loadRiggedModel(url, loader))
      .then((template) => { rigged.set(skin, template); })
      .catch((error) => console.warn(`Không tải được nhân vật ${skin}`, error)));
  }
  return Promise.all([modelsLoading, ...shopModels.map(({ skin }) => riggedLoading.get(skin)).filter(Boolean)]);
}

export const hasChibiModel = (skin) => models.has(skin) || rigged.has(skin);
// Hình khối thay thế (Nam/Nữ) của một hình có mô hình riêng; dùng cho ảnh 2D và khi mô hình chưa tải được.
export const chibiBaseOf = (skin) => MODEL_FALLBACK[skin] || riggedBase.get(skin) || (String(skin).startsWith('shop-') ? 'man' : skin);

// Khung chân: đùi xoay quanh hông, cẳng chân xoay quanh gối (rotation.x > 0 là đưa về phía trước, mặt nhìn −z).
function buildModelLegs(model) {
  return model.legs.map((leg) => {
    const thigh = new THREE.Group();
    // Gập ra trước rồi mới xoè sang bên (ngồi bệt duỗi chân).
    thigh.rotation.order = 'YXZ';
    thigh.position.set(leg.x, model.hip, leg.z);
    thigh.add(new THREE.Mesh(leg.thigh, model.material));
    const shin = new THREE.Group();
    shin.position.y = leg.knee;
    shin.add(new THREE.Mesh(leg.shin, model.material));
    thigh.add(shin);
    return { thigh, shin };
  });
}

// Đặt dáng chân theo độ cao hông: đi (stride −1..1), quỳ (kneel 0..1: đùi thẳng đứng, cẳng chân nằm phía sau),
// ngồi (sit 0..1: đùi ra trước, cẳng chân thõng xuống; legsOut thì duỗi thẳng như ngồi bệt).
function poseLegs(model, legs, { hip = model.hip, stride = 0, kneel = 0, sit = 0, legsOut = false }) {
  const KNEE_PAD = 0.03;
  legs.forEach(({ thigh, shin }) => {
    const side = Math.sign(thigh.position.x) || 1;
    const swing = side * stride * 0.45;
    let thighAngle = swing;
    let shinAbsolute = swing - Math.max(0, side * stride) * 0.6;
    if (kneel > 0) {
      // Gối chạm sàn: góc đùi suy ra từ độ cao hông (lạy thì hông lùi ngồi lên gót, đùi ngả ra sau).
      const reach = Math.max(-1, Math.min(1, (hip - KNEE_PAD) / model.thighLength));
      thighAngle += (-Math.acos(reach) - thighAngle) * kneel;
      shinAbsolute += (-Math.PI / 2 - shinAbsolute) * kneel;
    }
    if (sit > 0) {
      thighAngle += (Math.PI / 2 - thighAngle) * sit;
      shinAbsolute += ((legsOut ? Math.PI / 2 : 0) - shinAbsolute) * sit;
    }
    thigh.position.y = hip;
    thigh.rotation.x = thighAngle;
    thigh.rotation.y = legsOut ? side * -0.25 * sit : 0;
    shin.rotation.x = shinAbsolute - thighAngle;
  });
}

function popcornBucket() {
  const p = parts();
  const bucket = new THREE.Group();
  const box = new THREE.Mesh(p.geometry.bucket, p.popcorn.box);
  const stripe = new THREE.Mesh(p.geometry.bucketStripe, p.popcorn.stripe);
  stripe.position.y = 0.02;
  const corn = new THREE.Mesh(p.geometry.corn, p.popcorn.corn);
  corn.position.y = 0.055;
  corn.scale.y = 0.7;
  bucket.add(box, stripe, corn);
  return bucket;
}

function buildModelWalker(model) {
  const figure = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = model.hip;
  upper.add(new THREE.Mesh(model.upper, model.material));
  const legs = buildModelLegs(model);
  figure.add(upper, ...legs.map((leg) => leg.thigh));
  // skirt/feet/shins giữ chỗ cho bộ nhập vai (chúng chỉnh hình khối); với mô hình thì chân do rig.pose đặt.
  const placeholder = () => new THREE.Group();
  return {
    figure, upper, skirt: placeholder(), feet: [placeholder(), placeholder()], shins: [placeholder(), placeholder()],
    hips: { stand: model.hip, kneel: model.thighLength + 0.03 },
    labelY: model.height + 0.1,
    rig: { pose: (options) => poseLegs(model, legs, options) },
  };
}

// Người ngồi bằng mô hình: ghế rạp thì cẳng chân thõng xuống, bồ đoàn ở chùa thì duỗi chân ra trước.
function buildModelPerson(model, look) {
  const group = new THREE.Group();
  const SEAT_HIP = 0.06;
  const upper = new THREE.Group();
  upper.position.y = SEAT_HIP;
  upper.add(new THREE.Mesh(model.upper, model.material));
  const legs = buildModelLegs(model);
  poseLegs(model, legs, { hip: SEAT_HIP, sit: 1, legsOut: look?.outfit !== 'casual' });
  if (look?.popcorn) {
    const bucket = popcornBucket();
    bucket.position.set(0, 0.12, -0.2);
    upper.add(bucket);
  }
  group.add(upper, ...legs.map((leg) => leg.thigh));
  return { group, upper };
}

// Người đứng/đi: { figure, upper, skirt, feet, shins, hips } (cùng cấu trúc bộ nhập vai đang dùng).
export function buildChibiWalker(skinKey, look = null) {
  if (models.has(skinKey)) return buildModelWalker(models.get(skinKey));
  if (rigged.has(skinKey)) return buildRiggedWalker(rigged.get(skinKey), look);
  skinKey = chibiBaseOf(skinKey);
  const p = parts();
  const casual = casualOf(skinKey, look);
  const robe = p.robes[skinKey] || p.robes.child;
  const figure = new THREE.Group();
  // Áo tràng dài; đồ thường: nam quần dài, nữ váy xòe (lộ cẳng chân).
  const lowerGeometry = casual ? (casual.female ? p.geometry.dress : p.geometry.pants) : p.geometry.skirt;
  const skirt = new THREE.Mesh(lowerGeometry, casual ? casual.bottom : robe);
  skirt.scale.z = 0.88;
  if (casual?.female) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(p.geometry.shin, p.skin);
      leg.position.set(side * 0.07, 0.07, -0.01);
      figure.add(leg);
    }
  }
  const feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(p.geometry.foot, casual ? p.sneaker : p.shoe);
    foot.scale.set(0.9, 0.55, 1.4);
    foot.position.set(side * 0.075, 0.025, -0.04);
    return foot;
  });
  const shins = [-1, 1].map((side) => {
    const shin = new THREE.Mesh(p.geometry.sleeve, casual ? casual.bottom : robe);
    shin.rotation.x = Math.PI / 2;
    shin.position.set(side * 0.075, 0.05, 0.13);
    shin.visible = false;
    return shin;
  });
  const upper = buildUpper(skinKey, look);
  upper.position.y = 0.32;
  figure.add(skirt, ...feet, ...shins, upper);
  return { figure, upper, skirt, feet, shins, hips: { stand: 0.32, kneel: 0.2 }, labelY: 1.18, workRig: upper.userData.workRig };
}

// Người ngồi (xếp bằng trên bồ đoàn, hoặc ngồi ghế rạp): thay cho createPersonFactory.
export function createChibiPersonFactory() {
  return function buildPerson(skinKey, look = null) {
    if (models.has(skinKey)) return buildModelPerson(models.get(skinKey), look);
    if (rigged.has(skinKey)) {
      // Ghế rạp: hộp bắp rang trên đùi như mọi khán giả.
      return buildRiggedPerson(rigged.get(skinKey), look, look?.popcorn ? (group) => {
        const bucket = popcornBucket();
        bucket.position.set(0, 0.2, -0.2);
        group.add(bucket);
      } : null);
    }
    skinKey = chibiBaseOf(skinKey);
    const p = parts();
    const casual = casualOf(skinKey, look);
    const robe = p.robes[skinKey] || p.robes.child;
    const group = new THREE.Group();
    const lower = new THREE.Group();
    const legs = new THREE.Mesh(p.geometry.legs, casual ? casual.bottom : robe);
    legs.scale.set(1.25, 0.42, 0.95);
    legs.position.y = 0.08;
    lower.add(legs);
    const upper = buildUpper(skinKey, look);
    upper.position.y = 0.1;
    group.add(lower, upper);
    return { group, upper };
  };
}
