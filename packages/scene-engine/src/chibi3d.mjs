// Nhân vật chibi: đầu to tròn, mắt nhắm cười, má hồng, tay chắp trước ngực. Dựng hoàn toàn bằng hình khối + một
// texture mặt vẽ bằng canvas (không dùng ảnh ngoài). Cùng một cái đầu (mặt, tóc) dùng ở mọi nơi; chỉ bộ đồ đổi theo
// chỗ: ở chùa mặc áo tràng (outfit "robe"), ở rạp phim mặc đồ thường ngày nhiều màu (outfit "casual").
//
// buildChibiWalker(skin, look) → người đứng/đi { figure, upper, skirt, feet, shins, hips, labelY } (bộ nhập vai dùng).
// createChibiPersonFactory()(skin, look) → người ngồi { group, upper } (bồ đoàn, ghế rạp), cùng giao diện với
// createPersonFactory.
// look (tùy chọn): { outfit: 'robe' | 'casual', top, bottom, accent, tint, popcorn }. tint = true: áo/quần dùng vật
// liệu trắng có userData.tint ('top' | 'bottom' | 'accent') để bộ vẽ tô màu từng người bằng instanceColor.
import * as THREE from 'three';

// Áo tràng theo hình nhân vật: lam (nam/nữ/tiểu), nâu (bà cụ), xám (sư cô), vàng nghệ (sư thầy).
const ROBES = { man: '#4f78bd', woman: '#5a82c4', child: '#4f78bd', granny: '#8a5a3b', nun: '#8d96a3', monk: '#c8741f' };
const COLLARS = { man: '#eef1f6', woman: '#eef1f6', child: '#eef1f6', granny: '#e9dcc8', nun: '#e6e9ee', monk: '#f1d9a8' };
// Sư thầy, sư cô, chú tiểu cạo đầu; nam tóc ngắn có mái, nữ tóc dài ngang vai có mái, bà cụ tóc bạc búi.
const HAIR = { man: '#1d1714', woman: '#2a1a12', granny: '#d8d4cc' };
const FEMALE = new Set(['woman', 'nun', 'granny']);

const SKIN = '#f3cfa8';
const HEAD_R = 0.2;

// Bảng màu đồ thường ngày (rạp phim): áo tươi, quần/váy đậm hơn, điểm nhấn sọc ngực.
export const CASUAL_TOPS = ['#ff5d73', '#ffb703', '#3ddc97', '#4cc9f0', '#9b5de5', '#f15bb5', '#00bbf9', '#fb8500', '#06d6a0', '#ef476f'];
export const CASUAL_BOTTOMS = ['#2b4c7e', '#1f2937', '#5b3a29', '#3a506b', '#6d597a', '#264653'];
export const CASUAL_SKIRTS = ['#ff8fab', '#ffd166', '#8ecae6', '#cdb4db', '#ff6b6b', '#90be6d'];
export const CASUAL_ACCENTS = ['#ffffff', '#fff3b0', '#1b1b1b', '#ffe066', '#caf0f8'];

export const isFemale = (skin) => FEMALE.has(skin);

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
  const head = new THREE.Group();
  head.position.y = 0.27 + HEAD_R * 0.86;
  head.add(new THREE.Mesh(p.geometry.head, p.skin), new THREE.Mesh(p.geometry.face, p.face));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(p.geometry.ear, p.skin);
    ear.position.set(side * HEAD_R * 0.97, -0.01, 0.01);
    ear.scale.set(0.6, 1, 0.9);
    head.add(ear);
  }
  const hair = p.hairs[skinKey];
  if (!hair) return head;
  const cap = new THREE.Mesh(p.geometry.hairCap, hair);
  cap.rotation.x = 0.3;
  cap.position.z = 0.012;
  head.add(cap);
  if (skinKey === 'man') {
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
  } else if (skinKey === 'woman') {
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
  } else if (skinKey === 'granny') {
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
  // Tay áo từ vai vòng ra trước, hai bàn tay gặp nhau giữa ngực.
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(p.geometry.sleeve, shirt);
    sleeve.position.set(side * 0.1, 0.15, -0.09);
    sleeve.rotation.set(1.05, 0, side * 0.55);
    upper.add(sleeve);
  }
  const hands = new THREE.Mesh(p.geometry.hand, p.skin);
  hands.scale.set(1.1, 1.35, 0.8);
  hands.position.set(0, 0.17, -0.18);
  upper.add(hands);
  if (casual?.popcorn) {
    // Hộp bắp rang sọc đỏ trắng trong tay.
    const bucket = new THREE.Group();
    bucket.position.set(0, 0.1, -0.21);
    const box = new THREE.Mesh(p.geometry.bucket, p.popcorn.box);
    const stripe = new THREE.Mesh(p.geometry.bucketStripe, p.popcorn.stripe);
    stripe.position.y = 0.02;
    const corn = new THREE.Mesh(p.geometry.corn, p.popcorn.corn);
    corn.position.y = 0.055;
    corn.scale.y = 0.7;
    bucket.add(box, stripe, corn);
    upper.add(bucket);
  }
  upper.add(buildHead(skinKey));
  return upper;
}

// Người đứng/đi: { figure, upper, skirt, feet, shins, hips } (cùng cấu trúc bộ nhập vai đang dùng).
export function buildChibiWalker(skinKey, look = null) {
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
  return { figure, upper, skirt, feet, shins, hips: { stand: 0.32, kneel: 0.2 }, labelY: 1.18 };
}

// Người ngồi (xếp bằng trên bồ đoàn, hoặc ngồi ghế rạp): thay cho createPersonFactory.
export function createChibiPersonFactory() {
  return function buildPerson(skinKey, look = null) {
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
