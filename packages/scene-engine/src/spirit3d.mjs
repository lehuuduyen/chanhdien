// Linh thú đi theo chủ ngoài sân (participant.pet = { species, level }). Hình là mô hình Meshy tĩnh
// (/models/spirits/<loài>.glb, file gốc ở nhanvat/spirits/), chuyển động làm bằng code: Cá Chép bơi lơ lửng, Hạc Tiên
// lượn, Rùa Thần và Sư Tử đi dưới đất. Lúc chưa tải xong (hoặc tải lỗi) thì hiện bản dựng bằng khối bên dưới.
// Cấp càng cao càng đẹp (chỉ là hình, không ảnh hưởng lối chơi): cấp 4 có vòng sáng dưới chân, cấp 7 có đốm sáng bay
// quanh, cấp 10 có vầng hào quang vàng và thân ánh vàng.
// Chạy riêng trên từng máy theo vị trí chủ (không gửi vị trí linh thú qua server).
// Hướng: giống nhân vật, mặt nhìn theo −z cục bộ; ry = atan2(−dx, −dz) khi đi theo (dx, dz).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const SPIRIT_SPECIES = Object.freeze(['carp', 'turtle', 'crane', 'lion']);

// Kích thước lớn nhất của mô hình sau khi chuẩn hóa (m): dài thân cá / rùa / sư tử, sải cánh hạc.
const MODEL_SIZE = { carp: 0.78, turtle: 0.6, crane: 0.8, lion: 0.72 };
let loader = null;
const models = new Map();
// Tải mô hình một lần cho mỗi loài; trả Group đã chuẩn hóa (mặt nhìn −z, đi dưới đất thì đáy ở y = 0, bay thì tâm ở 0).
export function loadSpiritModel(species, base = '') {
  if (!models.has(species)) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    models.set(species, loader.loadAsync(`${base}/models/spirits/${species}.glb`).then((gltf) => {
      const inner = gltf.scene;
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const scale = MODEL_SIZE[species] / Math.max(size.x, size.y, size.z);
      const center = box.getCenter(new THREE.Vector3());
      const flying = species === 'carp' || species === 'crane';
      inner.position.set(-center.x, flying ? -center.y : -box.min.y, -center.z);
      inner.traverse((node) => { if (node.isMesh) node.castShadow = true; });
      const pivot = new THREE.Group();
      pivot.add(inner);
      pivot.scale.setScalar(scale);
      // Mô hình Meshy nhìn về +z; linh thú trong engine nhìn về −z như nhân vật.
      pivot.rotation.y = Math.PI;
      return pivot;
    }).catch((error) => {
      console.warn(`Không tải được linh thú ${species}: ${error.message}`);
      return null;
    }));
  }
  return models.get(species);
}

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...options });
const glow = (color, opacity = 0.5) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

// Vật liệu và hình dùng chung cho mọi con (nhiều người cùng nuôi một loài không tạo thêm).
let shared = null;
function sharedParts() {
  if (shared) return shared;
  shared = {
    materials: {
      koi: mat('#f2f0ea'), koiRed: mat('#e2462a'), koiGold: mat('#f2b632', { metalness: 0.45, roughness: 0.35 }),
      fin: mat('#ffd9c8', { transparent: true, opacity: 0.85 }),
      eye: mat('#101010'), shell: mat('#3f7d4a'), shellRim: mat('#c9a95a'), skin: mat('#8fae6a'),
      crane: mat('#fbfbf7'), craneBlack: mat('#1d1d1f'), craneRed: mat('#d3242c'), beak: mat('#c9b48a'),
      lion: mat('#d9a441'), mane: mat('#b8481f'), lionGold: mat('#f0c95a', { metalness: 0.5, roughness: 0.35 }),
      // Vòng sáng và hào quang dùng màu vàng thường (cộng sáng trên nền sân sáng bị bạc thành trắng xám); đốm sáng vẫn cộng sáng.
      ring: new THREE.MeshBasicMaterial({ color: '#f4b73a', transparent: true, opacity: 0.5, depthWrite: false }),
      mote: glow('#fff2c4', 0.9),
      halo: new THREE.MeshBasicMaterial({ color: '#ffc531', transparent: true, opacity: 0.95 }),
    },
    geometry: {
      sphere: new THREE.SphereGeometry(1, 16, 12),
      lowSphere: new THREE.SphereGeometry(1, 10, 8),
      cone: new THREE.ConeGeometry(1, 1, 10),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      ring: new THREE.RingGeometry(0.32, 0.46, 32),
      halo: new THREE.TorusGeometry(0.2, 0.018, 8, 32),
    },
  };
  return shared;
}

function piece(geometry, material, { at = [0, 0, 0], scale = [1, 1, 1], rotate = [0, 0, 0] } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...at);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotate);
  mesh.castShadow = true;
  return mesh;
}

// Mỗi loài: { body: Group (gốc ở mặt đất / tâm bơi), fly: độ cao bay (0 = đi dưới đất), parts để chuyển động }.
const BUILD = {
  carp(level) {
    const { geometry: g, materials: m } = sharedParts();
    const body = new THREE.Group();
    const gold = level >= 10;
    body.add(piece(g.sphere, gold ? m.koiGold : m.koi, { scale: [0.11, 0.12, 0.28] }));
    // Mảng đỏ trên lưng (cá Koi Kohaku).
    body.add(piece(g.sphere, gold ? m.koiGold : m.koiRed, { at: [0, 0.045, -0.06], scale: [0.09, 0.08, 0.15] }));
    body.add(piece(g.sphere, gold ? m.koiGold : m.koiRed, { at: [0, 0.04, 0.12], scale: [0.07, 0.07, 0.08] }));
    for (const side of [-1, 1]) body.add(piece(g.lowSphere, m.eye, { at: [side * 0.07, 0.03, -0.2], scale: [0.018, 0.018, 0.018] }));
    // Râu cá chép.
    for (const side of [-1, 1]) body.add(piece(g.cylinder, m.koiGold, { at: [side * 0.05, -0.04, -0.27], scale: [0.006, 0.08, 0.006], rotate: [0.9, 0, side * 0.5] }));
    // Vây dẹt (khối cầu ép mỏng) thay vì mặt phẳng: nhìn từ mọi phía đều ra hình vây.
    body.add(piece(g.sphere, m.fin, { at: [0, 0.12, 0.02], scale: [0.012, 0.06, 0.13], rotate: [-0.2, 0, 0] }));
    const tail = new THREE.Group();
    tail.position.z = 0.25;
    for (const side of [-1, 1]) tail.add(piece(g.sphere, m.fin, { at: [0, side * 0.07, 0.1], scale: [0.012, 0.09, 0.12], rotate: [side * 0.6, 0, 0] }));
    body.add(tail);
    const fins = [-1, 1].map((side) => {
      const fin = piece(g.sphere, m.fin, { at: [side * 0.11, -0.06, -0.08], scale: [0.08, 0.01, 0.06], rotate: [0, 0, side * 0.4] });
      body.add(fin);
      return fin;
    });
    return { body, fly: 0.95, tail, fins, speed: 1 };
  },
  turtle(level) {
    const { geometry: g, materials: m } = sharedParts();
    const body = new THREE.Group();
    body.add(piece(g.sphere, m.shell, { at: [0, 0.12, 0], scale: [0.26, 0.15, 0.32] }));
    body.add(piece(g.cylinder, level >= 10 ? m.lionGold : m.shellRim, { at: [0, 0.1, 0], scale: [0.27, 0.03, 0.33] }));
    // Vân mai rùa.
    for (const [x, z] of [[0, -0.12], [0, 0.1], [-0.12, 0], [0.12, 0], [0, 0]]) body.add(piece(g.lowSphere, m.shellRim, { at: [x, 0.25, z], scale: [0.05, 0.015, 0.05] }));
    const head = piece(g.sphere, m.skin, { at: [0, 0.13, -0.36], scale: [0.08, 0.075, 0.1] });
    body.add(head);
    for (const side of [-1, 1]) body.add(piece(g.lowSphere, m.eye, { at: [side * 0.045, 0.16, -0.43], scale: [0.014, 0.014, 0.014] }));
    const legs = [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]].map(([x, z]) => {
      const leg = piece(g.sphere, m.skin, { at: [x, 0.05, z], scale: [0.06, 0.05, 0.08] });
      body.add(leg);
      return leg;
    });
    return { body, fly: 0, legs, head, speed: 1 };
  },
  crane(level) {
    const { geometry: g, materials: m } = sharedParts();
    const body = new THREE.Group();
    body.add(piece(g.sphere, m.crane, { scale: [0.11, 0.11, 0.22] }));
    body.add(piece(g.cone, m.craneBlack, { at: [0, 0.01, 0.24], scale: [0.07, 0.16, 0.07], rotate: [Math.PI / 2, 0, 0] }));
    const neck = piece(g.cylinder, m.crane, { at: [0, 0.14, -0.2], scale: [0.025, 0.3, 0.025], rotate: [-0.6, 0, 0] });
    body.add(neck);
    body.add(piece(g.sphere, m.crane, { at: [0, 0.27, -0.29], scale: [0.045, 0.045, 0.055] }));
    body.add(piece(g.sphere, level >= 10 ? m.lionGold : m.craneRed, { at: [0, 0.31, -0.29], scale: [0.025, 0.015, 0.025] }));
    body.add(piece(g.cone, m.beak, { at: [0, 0.26, -0.38], scale: [0.012, 0.1, 0.012], rotate: [-Math.PI / 2, 0, 0] }));
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.08, 0.05, -0.02);
      const wing = piece(g.sphere, m.crane, { at: [side * 0.22, 0, 0.03], scale: [0.24, 0.015, 0.11] });
      const tip = piece(g.sphere, m.craneBlack, { at: [side * 0.42, 0, 0.06], scale: [0.08, 0.012, 0.07] });
      pivot.add(wing, tip);
      body.add(pivot);
      return pivot;
    });
    for (const side of [-1, 1]) body.add(piece(g.cylinder, m.craneBlack, { at: [side * 0.03, -0.12, 0.12], scale: [0.008, 0.2, 0.008], rotate: [1.2, 0, 0] }));
    // Sải cánh ~0,65 m: nhỏ hơn nhân vật để không che chủ.
    body.scale.setScalar(0.7);
    return { body, fly: 1.35, wings, speed: 1 };
  },
  lion(level) {
    const { geometry: g, materials: m } = sharedParts();
    const body = new THREE.Group();
    const coat = level >= 10 ? m.lionGold : m.lion;
    body.add(piece(g.sphere, coat, { at: [0, 0.3, 0.04], scale: [0.15, 0.15, 0.26] }));
    // Bờm xoăn đỏ quanh đầu (sư tử đá trước cổng chùa).
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      body.add(piece(g.lowSphere, m.mane, { at: [Math.cos(angle) * 0.13, 0.46 + Math.sin(angle) * 0.13, -0.2], scale: [0.065, 0.065, 0.06] }));
    }
    const head = piece(g.sphere, coat, { at: [0, 0.46, -0.24], scale: [0.13, 0.13, 0.12] });
    body.add(head);
    body.add(piece(g.sphere, m.mane, { at: [0, 0.42, -0.35], scale: [0.06, 0.045, 0.04] }));
    for (const side of [-1, 1]) body.add(piece(g.lowSphere, m.eye, { at: [side * 0.055, 0.5, -0.34], scale: [0.02, 0.022, 0.015] }));
    const tail = piece(g.lowSphere, m.mane, { at: [0, 0.42, 0.33], scale: [0.06, 0.07, 0.06] });
    body.add(tail);
    const legs = [[-0.09, -0.12], [0.09, -0.12], [-0.09, 0.18], [0.09, 0.18]].map(([x, z]) => {
      const leg = new THREE.Group();
      leg.position.set(x, 0.22, z);
      leg.add(piece(g.cylinder, coat, { at: [0, -0.1, 0], scale: [0.045, 0.22, 0.045] }));
      leg.add(piece(g.sphere, coat, { at: [0, -0.2, -0.02], scale: [0.055, 0.035, 0.065] }));
      body.add(leg);
      return leg;
    });
    return { body, fly: 0, legs, tail, speed: 1 };
  },
};

// Tạo một linh thú. Trả { group, update(dt, time, owner), dispose() }; owner = { x, z, ry, moving, seated }.
// loadModel: false để chỉ dùng bản dựng bằng khối (test chạy trong Node không tải file).
export function createSpirit(pet, { reduceMotion = false, loadModel = typeof window !== 'undefined', base = '' } = {}) {
  const species = SPIRIT_SPECIES.includes(pet?.species) ? pet.species : null;
  if (!species) return null;
  const level = Math.max(1, Math.min(10, Number(pet.level) || 1));
  const { geometry: g, materials: m } = sharedParts();
  const group = new THREE.Group();
  const built = BUILD[species](level);
  const holder = new THREE.Group();
  holder.add(built.body);
  group.add(holder);
  // Mô hình Meshy: tải xong thì thay bản dựng bằng khối (bóng, vòng sáng giữ nguyên).
  let model = null;
  let disposed = false;
  const tinted = [];
  if (loadModel) {
    loadSpiritModel(species, base).then((loaded) => {
      if (!loaded || disposed) return;
      model = loaded.clone(true);
      if (level >= 10) {
        // Cấp tối đa: thân ánh vàng (vật liệu riêng của con này, không đổi màu con khác cùng loài).
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.material = node.material.clone();
          node.material.emissive = new THREE.Color('#8a5a00');
          node.material.emissiveIntensity = 0.35;
          tinted.push(node.material);
        });
      }
      holder.remove(built.body);
      holder.add(model);
    });
  }
  // Bóng mềm dưới chân / dưới chỗ bay.
  const shadow = new THREE.Mesh(g.ring, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(built.fly ? 0.45 : 0.7);
  shadow.geometry = new THREE.CircleGeometry(0.4, 20);
  shadow.position.y = 0.02;
  group.add(shadow);
  // Trang trí theo cấp.
  let ring = null;
  let motes = [];
  let halo = null;
  if (level >= 4) {
    ring = new THREE.Mesh(g.ring, m.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
  }
  if (level >= 7) {
    motes = Array.from({ length: 3 }, () => {
      const mote = new THREE.Mesh(g.lowSphere, m.mote);
      mote.scale.setScalar(0.025);
      group.add(mote);
      return mote;
    });
  }
  if (level >= 10) {
    halo = new THREE.Mesh(g.halo, m.halo);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  }

  // Vùng chạm vô hình quanh thân (cá chép / hạc nhỏ, khó bấm trúng hình thật): người chơi chạm vào linh thú.
  // Con bay (cá chép, hạc) nhỏ và hay dịch theo chủ: vùng chạm rộng hơn.
  const pickable = new THREE.Mesh(new THREE.SphereGeometry(built.fly ? 0.65 : 0.5, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  pickable.position.y = built.fly || 0.32;
  pickable.userData.spirit = true;
  group.add(pickable);

  const state = { x: null, z: null, ry: 0, moving: false, phase: Math.random() * 6, react: null };

  function update(dt, time, owner) {
    // Đi dưới đất: sau lưng chủ, lệch phải. Bay: ngang vai phải, hơi lên trước — camera ở sau lưng nên con bay đứng
    // sau sẽ che nhân vật.
    const back = built.fly ? -0.1 : 0.8;
    const side = built.fly ? 0.7 : 0.55;
    const tx = owner.x + Math.sin(owner.ry) * back + Math.cos(owner.ry) * side;
    const tz = owner.z + Math.cos(owner.ry) * back - Math.sin(owner.ry) * side;
    if (state.x === null || Math.hypot(tx - state.x, tz - state.z) > 6) {
      state.x = tx;
      state.z = tz;
      state.ry = owner.ry;
    }
    const dx = tx - state.x;
    const dz = tz - state.z;
    const distance = Math.hypot(dx, dz);
    state.moving = distance > 0.12;
    if (distance > 0.02) {
      // Càng xa càng nhanh để không tụt lại khi chủ chạy.
      const step = Math.min(distance, Math.max(1.4, distance * 3) * dt);
      state.x += (dx / distance) * step;
      state.z += (dz / distance) * step;
    }
    // Đang đi thì quay theo hướng đi, đứng yên thì quay cùng hướng chủ.
    const wantRy = state.moving ? Math.atan2(-dx, -dz) : owner.ry;
    let turn = wantRy - state.ry;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    state.ry += turn * Math.min(1, dt * 6);
    group.position.set(state.x, 0, state.z);
    holder.rotation.y = state.ry;
    // Vừa được chạm: nhảy lên, xoay một vòng rồi đáp xuống (~1,1 giây).
    if (state.react !== null) {
      state.react += dt / 1.1;
      const p = Math.min(1, state.react);
      holder.position.y = Math.sin(p * Math.PI) * (built.fly ? 0.3 : 0.38);
      holder.rotation.y = state.ry + (reduceMotion ? 0 : p * Math.PI * 2);
      holder.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.15);
      if (p >= 1) {
        state.react = null;
        holder.position.y = 0;
        holder.scale.setScalar(1);
      }
    }

    const t = reduceMotion ? 0 : time + state.phase;
    if (model) animateModel(t);
    else if (species === 'carp') {
      built.body.position.y = built.fly + Math.sin(t * 1.6) * 0.08;
      built.tail.rotation.y = Math.sin(t * (state.moving ? 9 : 4)) * 0.45;
      built.fins.forEach((fin, index) => { fin.rotation.x = Math.sin(t * 5 + index * Math.PI) * 0.4; });
      built.body.rotation.z = Math.sin(t * 1.3) * 0.08;
    } else if (species === 'crane') {
      built.body.position.y = built.fly + Math.sin(t * 2) * 0.1;
      const flap = Math.sin(t * (state.moving ? 7 : 3.5)) * (state.moving ? 0.7 : 0.35);
      built.wings[0].rotation.z = -flap;
      built.wings[1].rotation.z = flap;
    } else {
      // Đi dưới đất: bước chân luân phiên, thân nảy nhẹ khi đi.
      const stride = state.moving ? Math.sin(t * (species === 'turtle' ? 8 : 10)) : 0;
      built.body.position.y = state.moving ? Math.abs(stride) * 0.02 : 0;
      built.legs.forEach((leg, index) => {
        const sign = index === 0 || index === 3 ? 1 : -1;
        if (species === 'lion') leg.rotation.x = stride * 0.45 * sign;
        else leg.position.y = 0.05 + Math.max(0, stride * sign) * 0.03;
      });
      if (built.tail) built.tail.position.x = Math.sin(t * 3) * 0.04;
      if (built.head && !state.moving) built.head.position.y = 0.13 + Math.sin(t * 1.2) * 0.01;
    }
    shadow.position.set(0, 0.02, 0);
    shadow.material.opacity = built.fly ? 0.1 : 0.18;
    if (ring) {
      ring.material.opacity = 0.4 + Math.sin(t * 2) * 0.12;
      ring.rotation.z = t * 0.4;
    }
    motes.forEach((mote, index) => {
      const angle = t * 1.4 + (index / motes.length) * Math.PI * 2;
      mote.position.set(Math.cos(angle) * 0.38, (built.fly || 0.35) + Math.sin(t * 2 + index) * 0.12, Math.sin(angle) * 0.38);
    });
    if (halo) {
      halo.position.set(0, (built.fly || 0.45) + 0.3, 0);
      halo.rotation.z = t;
    }
  }

  // Mô hình tĩnh: bơi / lượn / đi bằng cách nghiêng, nhún cả thân.
  function animateModel(t) {
    if (species === 'carp') {
      model.position.y = built.fly + Math.sin(t * 1.6) * 0.08;
      model.rotation.set(0, Math.PI + Math.sin(t * (state.moving ? 8 : 3.5)) * 0.18, Math.sin(t * 1.3) * 0.08);
    } else if (species === 'crane') {
      model.position.y = built.fly + Math.sin(t * 1.8) * 0.12;
      // Lượn: nghiêng cánh qua lại, chúc đầu nhẹ khi đang bay theo.
      model.rotation.set(state.moving ? 0.12 : 0, Math.PI, Math.sin(t * 1.2) * 0.22);
    } else {
      const step = state.moving ? Math.sin(t * (species === 'turtle' ? 7 : 10)) : 0;
      model.position.y = state.moving ? Math.abs(step) * (species === 'turtle' ? 0.015 : 0.03) : 0;
      model.rotation.set(state.moving ? Math.abs(step) * 0.04 : Math.sin(t * 1.2) * 0.015, Math.PI, step * (species === 'turtle' ? 0.06 : 0.05));
    }
  }

  function dispose() {
    // Hình / vật liệu dùng chung không giải phóng; chỉ bóng và vật liệu ánh vàng là riêng.
    disposed = true;
    shadow.geometry.dispose();
    shadow.material.dispose();
    pickable.geometry.dispose();
    pickable.material.dispose();
    for (const material of tinted) material.dispose();
  }

  // Được chạm vào: làm động tác vui (chỉ trên máy người chạm).
  function react() {
    state.react = 0;
  }

  return { group, species, level, pickable, update, react, dispose, get reacting() { return state.react !== null; } };
}
