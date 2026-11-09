// Chánh điện 3D (Three.js): dựng bằng hình khối, không cần model. Cùng giao diện với renderer.mjs (2D) để trang
// chuyển qua lại được: setParticipants, say, offer, setInsets, setCamera, stats, destroy.
// Toạ độ: mét; bàn thờ ở z ≈ 0, khán đường kéo về phía +z; người ngồi quay mặt về bàn thờ (hướng −z).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildAltar, buildBuddha, buildBurner, buildHall, buildLanterns, buildSeat, createPersonFactory, createTempleMaterials,
  PILLAR_CLEARANCE, StaticBatch, hallLayout,
} from './temple3d-models.mjs';
import { clampToBounds, defaultCameraFor } from './world.mjs';
import { buildCourtyard } from './courtyard3d.mjs';
import { loadStatues } from './statues3d.mjs';
import { disposeSprite, textSprite } from './sprites3d.mjs';

const MAX_PETALS = 140;
const MAX_FX = 12;
const BUBBLE_MS = 6_000;
const MAX_BUBBLES = 18;
// Lư hương trước bàn thờ: mỗi lần dâng hương cắm thêm một nén, cháy ngắn dần rồi tắt.
const MAX_STICKS = 60;
const STICK_LIFE_S = 300;
const FLIGHT_S = 1.2;
const BOW_S = 1.4;

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function glowTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// plugin (tùy chọn): hàm nhận các phần bên trong (scene, camera, controls…) và trả { update(dt, time), dispose(),
// ownsCamera, handlesTaps, api }; dùng cho chế độ nhập vai (explore3d.mjs) mà không phải sửa bộ vẽ này.
// personFactory (tùy chọn): bộ dựng người ngồi/hành lễ thay cho người hình khối mặc định (vd: chú tiểu chibi).
export async function createTempleRenderer3D({ canvas, scene: sceneData, onSeatClick, plugin: pluginFactory, personFactory }) {
  const world = sceneData.world;
  const seatsWorld = new Map(world.seats.map((seat) => [seat.id, seat]));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
  // Màn cảm ứng (điện thoại) tối đa 1,5×: số điểm ảnh phải tô là chi phí lớn nhất (threejs-performance).
  const touch = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color('#140906');
  scene3d.fog = new THREE.Fog('#140906', 14, 28);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  const loader = new THREE.TextureLoader();
  const loadTexture = (src) => new Promise((resolve) => {
    loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
  const effectBase = sceneData.effects?.base || '/thien/assets/';
  const effectNames = Object.entries(sceneData.effects?.sprites || {});
  const effectFiles = new Map(effectNames);
  const effectTextures = new Map();
  const effectLoads = new Map();
  // Hiệu ứng chỉ tải ở lần dùng đầu tiên; không chặn màn hình vào phòng vì các nút dâng lễ có quầng sáng dựng bằng
  // Canvas làm dự phòng trong lúc ảnh WebP đang giải mã.
  const effectTexture = (name) => {
    if (effectTextures.has(name)) return effectTextures.get(name);
    const file = effectFiles.get(name);
    if (file && !effectLoads.has(name)) {
      effectLoads.set(name, loadTexture(`${effectBase}${file}.webp`).then((texture) => {
        effectTextures.set(name, texture);
        return texture;
      }));
    }
    return null;
  };
  const textures = { glow: glowTexture('rgba(255, 220, 150, 1)', 'rgba(255, 160, 60, 0)') };

  const materials = createTempleMaterials();
  materials.bronze = materials.bronze || new THREE.MeshStandardMaterial({ color: '#7a5a2a', metalness: 0.85, roughness: 0.38 });
  const buildPerson = personFactory ? personFactory() : createPersonFactory(materials);

  const root = new THREE.Group();
  scene3d.add(root);
  // Ánh sáng môi trường (RoomEnvironment qua PMREM) cho kim loại vàng phản chiếu thật (threejs-lighting).
  // Three.js 0.160 chưa có scene.environmentIntensity: độ mạnh chỉnh bằng envMapIntensity từng vật liệu.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene3d.environment = environment;
  pmrem.dispose();
  scene3d.add(new THREE.HemisphereLight('#ffd9a8', '#2a1208', 0.55));
  const key = new THREE.DirectionalLight('#ffe2b8', 0.9);
  key.position.set(2, 6, 9);
  scene3d.add(key);
  const buddhaSpot = new THREE.SpotLight('#ffd08a', 70, 14, 0.42, 0.65, 2);
  buddhaSpot.position.set(0, 6.5, 3.5);
  buddhaSpot.target.position.set(0, 2.2, -2);
  scene3d.add(buddhaSpot, buddhaSpot.target);
  // Một đèn ấm chung cho bàn thờ và nến (nến chỉ còn ngọn lửa sprite): ít nguồn sáng thì mỗi điểm ảnh tính ít hơn.
  const altarLight = new THREE.PointLight('#ffb860', 8, 9, 2);
  altarLight.position.set(0, 2.0, 0.8);
  scene3d.add(altarLight);

  const hall = hallLayout(world);
  buildHall(root, materials, { openFront: Boolean(world.courtyard), hall });
  // Sân ngoài chùa (khi scene có world.courtyard): mặt tiền, sân đá, lư hương lớn, cây, trời, nắng có bóng đổ.
  const courtyard = world.courtyard ? buildCourtyard({ root, scene3d, renderer, camera, world }) : null;
  if (courtyard) {
    scene3d.background = null;
    scene3d.fog = new THREE.Fog('#d9c3a0', 30, 150);
  }
  const altarParts = buildAltar(root, materials, hall);
  const buddha = buildBuddha(root, materials);
  // Tượng quét 3D thật (world.statues) tải sau khi cảnh đã hiện, xong thì thay tượng khối; lỗi thì giữ tượng khối.
  const statueProgress = { done: 0, total: 0 };
  const statuesReady = loadStatues({
    root, world, buddha, courtyard, shadows: renderer.shadowMap.enabled, renderer, camera, scene3d,
    defer: true,
    onProgress: (done, total) => Object.assign(statueProgress, { done, total }),
  });
  const altar = { candles: [] };
  for (const candle of altarParts.candles) {
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: '#ffb347', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(0.3, 0.45, 1);
    flame.position.set(candle.x, candle.y, candle.z);
    root.add(flame);
    altar.candles.push({ flame, seed: candle.x });
  }
  const burner = buildBurner(root, materials);
  const stickGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 6);
  stickGeometry.translate(0, 0.5, 0);
  const stickMaterial = new THREE.MeshStandardMaterial({ color: '#9c3a1c', roughness: 0.8 });
  const emberMaterial = new THREE.SpriteMaterial({ map: textures.glow, color: '#ff6a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const smokeTexture = glowTexture('rgba(235, 225, 210, 0.55)', 'rgba(235, 225, 210, 0)');
  buildLanterns(root, materials, hall);

  // Bồ đoàn: luôn hiện (kể cả trống), là mục tiêu chạm chính; tọa cụ và bóng mờ gộp chung một lượt vẽ.
  const pickables = [];
  const cushions = new Map();
  const seatBatch = new StaticBatch();
  for (const seat of world.seats) {
    const cushion = buildSeat(root, materials, seat, seatBatch);
    pickables.push(cushion);
    cushions.set(seat.id, cushion);
  }
  seatBatch.build(root);
  const myRing = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 8, 40), new THREE.MeshBasicMaterial({ color: '#f3c969', transparent: true, opacity: 0.85 }));
  myRing.rotation.x = Math.PI / 2;
  myRing.visible = false;
  root.add(myRing);

  let ceremonyActive = true;
  let ceremonySettings = {
    labels: { teacher: 'Giảng sư', bell: 'Thỉnh chuông', woodenFish: 'Gõ mõ' },
    serverNow: () => Date.now(),
    moPeriodMs: 1_150,
    bellPeriodMs: 45_000,
  };
  const ceremonyStaff = [];
  for (const item of sceneData.ceremony?.officiants || []) {
    const group = new THREE.Group();
    group.position.set(item.world.x, 0, item.world.z);
    const built = buildPerson('monk');
    built.group.position.y = item.world.y;
    group.add(built.group);

    if (item.role === 'teacher') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.88), materials.lacquer);
      base.position.set(0, 0.11, 0);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 0.95), materials.gold);
      trim.position.set(0, 0.23, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.76, 0.11), materials.lacquer);
      back.position.set(0, 0.62, 0.27);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.07, 0.15), materials.gold);
      crest.position.set(0, 1.02, 0.27);
      group.add(base, trim, back, crest);
    }

    let mallet = null;
    if (item.role === 'bell' || item.role === 'woodenFish') {
      const side = item.role === 'bell' ? 1 : -1;
      const instrumentX = side * 0.5;
      if (item.role === 'bell') {
        const bell = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 24, 1, true), materials.bronze);
        bell.position.set(instrumentX, 0.27, -0.06);
        group.add(bell);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), materials.gold);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(instrumentX, 0.1, -0.06);
        group.add(rim);
      } else {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 14), materials.darkWood);
        fish.scale.set(1.35, 0.72, 0.9);
        fish.position.set(instrumentX, 0.23, -0.06);
        group.add(fish);
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.035), materials.gold);
        slit.position.set(instrumentX, 0.33, -0.28);
        slit.rotation.z = -0.2;
        group.add(slit);
      }
      mallet = new THREE.Group();
      mallet.position.set(side * 0.16, 0.63, -0.08);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), materials.darkWood);
      handle.position.y = -0.25;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), materials.darkWood);
      head.position.y = -0.54;
      mallet.add(handle, head);
      mallet.rotation.z = -side * 0.72;
      group.add(mallet);
    }

    const label = textSprite(ceremonySettings.labels[item.role], {
      background: 'rgba(74, 24, 14, 0.92)', color: '#fff1c8', height: 0.16, bold: true,
    });
    label.position.y = item.role === 'teacher' ? 1.5 : 1.18;
    group.add(label);
    root.add(group);
    ceremonyStaff.push({ item, group, upper: built.upper, label, mallet });
  }

  function setCeremony(next = {}) {
    ceremonySettings = { ...ceremonySettings, ...next, labels: { ...ceremonySettings.labels, ...next.labels } };
    for (const staff of ceremonyStaff) {
      staff.group.remove(staff.label);
      disposeSprite(staff.label);
      staff.label = textSprite(ceremonySettings.labels[staff.item.role], {
        background: 'rgba(74, 24, 14, 0.92)', color: '#fff1c8', height: 0.16, bold: true,
      });
      staff.label.position.y = staff.item.role === 'teacher' ? 1.5 : 1.18;
      staff.group.add(staff.label);
    }
  }

  // Thầy đọc sớ: cầm tờ sớ vàng trước ngực, cúi đầu đọc theo nhịp, nhãn "Đang đọc sớ…" trên đầu; ai trong phòng
  // cũng thấy (lời đọc có tên người trong sớ chỉ phát trên máy người dâng sớ).
  const teacher = ceremonyStaff.find((staff) => staff.item.role === 'teacher');
  const reading = { until: 0, scroll: null, label: null };
  if (teacher) {
    reading.scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshStandardMaterial({ color: '#f1d27a', roughness: 0.7, side: THREE.DoubleSide, emissive: '#3a2a08' }));
    reading.scroll.position.set(0, 0.62, -0.26);
    reading.scroll.rotation.x = -0.9;
    reading.scroll.visible = false;
    teacher.group.add(reading.scroll);
  }
  function teacherRead(durationMs, text) {
    if (!teacher) return false;
    reading.until = performance.now() + durationMs;
    if (reading.label) {
      teacher.group.remove(reading.label);
      disposeSprite(reading.label);
    }
    reading.label = textSprite(text, { background: 'rgba(243, 201, 105, 0.95)', color: '#2a1606', height: 0.15, bold: true });
    reading.label.position.y = 1.78;
    teacher.group.add(reading.label);
    return true;
  }

  function updateCeremony(time) {
    let now = Date.now();
    try { now = ceremonySettings.serverNow?.() ?? now; } catch {}
    const pulse = (period, duration) => {
      if (!ceremonyActive || reduceMotion || !period) return 0;
      const elapsed = ((now % period) + period) % period;
      return elapsed < duration ? Math.sin((elapsed / duration) * Math.PI) : 0;
    };
    for (const staff of ceremonyStaff) {
      const strike = staff.item.role === 'bell'
        ? pulse(ceremonySettings.bellPeriodMs, 520)
        : staff.item.role === 'woodenFish' ? pulse(ceremonySettings.moPeriodMs, 260) : 0;
      if (staff.mallet) {
        const side = staff.item.role === 'bell' ? 1 : -1;
        staff.mallet.rotation.z = -side * (0.72 - strike * 0.62);
      }
      if (!reduceMotion) staff.upper.scale.y = 1 + Math.sin(time / 950 + staff.item.world.x) * 0.01;
    }
    if (teacher) {
      const active = performance.now() < reading.until;
      reading.scroll.visible = active;
      teacher.upper.rotation.x = active ? -(0.14 + (reduceMotion ? 0 : Math.sin(time / 420) * 0.04)) : 0;
      if (!active && reading.label) {
        teacher.group.remove(reading.label);
        disposeSprite(reading.label);
        reading.label = null;
      }
    }
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = world.camera.minDistance;
  controls.maxDistance = world.camera.maxDistance;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.screenSpacePanning = false;
  // Góc nhập vai của scene có thể khóa khoảng cách/pan để bố cục HUD và nhân vật không bị thu nhỏ ngoài ý muốn.
  controls.enableZoom = !world.camera.follow?.lockZoom;
  controls.enablePan = !world.camera.follow?.lockPan;

  // Về góc mặc định theo tỷ lệ khung hiện tại (thấy trọn khu bồ đoàn).
  function resetView() {
    const view = defaultCameraFor(world.camera, size.width / size.height || 0.5);
    camera.fov = view.fov;
    camera.position.set(view.position.x, view.position.y, view.position.z);
    controls.target.set(view.target.x, view.target.y, view.target.z);
    controls.update();
    applyView();
  }

  const people = new Map();
  const effects = { fx: [], petals: [], glows: [], haloPulse: 0, flights: [], sticks: [], smoke: [], smokeTimer: 0 };

  // Cắm một nén hương vào lư: vị trí ngẫu nhiên trong lòng lư, hơi nghiêng như thật.
  function plantStick() {
    if (effects.sticks.length >= MAX_STICKS) {
      const old = effects.sticks.shift();
      root.remove(old.group);
    }
    const group = new THREE.Group();
    const radius = Math.sqrt(Math.random()) * 0.36;
    const angle = Math.random() * Math.PI * 2;
    group.position.set(burner.position.x + Math.cos(angle) * radius, burner.ashY, burner.position.z + Math.sin(angle) * radius);
    group.rotation.set((Math.random() - 0.5) * 0.18, 0, (Math.random() - 0.5) * 0.18);
    const stick = new THREE.Mesh(stickGeometry, stickMaterial);
    stick.scale.y = 0.55;
    group.add(stick);
    const ember = new THREE.Sprite(emberMaterial);
    ember.scale.set(0.07, 0.07, 1);
    ember.position.y = 0.55;
    group.add(ember);
    root.add(group);
    effects.sticks.push({ group, stick, ember, t: 0 });
  }
  let participants = [];
  let insets = { top: 0, bottom: 0 };
  let size = { width: 0, height: 0 };
  let destroyed = false;
  let frames = 0;
  let fps = 0;
  let fpsStart = performance.now();
  let last = performance.now();
  // Tự hạ chất lượng nếu máy không kịp: sau mỗi 2 giây đo FPS, dưới 28 thì về độ phân giải 1×,
  // vẫn dưới 22 thì tắt ánh sáng môi trường. Không bao giờ nâng lại để tránh chập chờn.
  const quality = { level: 0, windowStart: 0, frames: 0, shadowTrial: touch && courtyard ? 'waiting' : 'done' };
  function adaptQuality(time) {
    if (document.hidden) return;
    if (!quality.windowStart) quality.windowStart = time;
    quality.frames += 1;
    const elapsed = time - quality.windowStart;
    if (elapsed < (quality.shadowTrial === 'waiting' ? 3_000 : 2_000)) return;
    const measured = (quality.frames * 1_000) / elapsed;
    quality.windowStart = time;
    quality.frames = 0;
    if (quality.shadowTrial === 'waiting') {
      quality.shadowTrial = 'done';
      if (measured >= 45) {
        courtyard.setShadows(true, 512);
        quality.shadowTrial = 'testing';
        return;
      }
    } else if (quality.shadowTrial === 'testing') {
      quality.shadowTrial = 'done';
      if (measured < 28) courtyard.setShadows(false);
    }
    if (quality.level === 0 && measured < 28) courtyard?.setShadows(false);
    if (quality.level === 0 && measured < 28 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      renderer.setSize(size.width, size.height, false);
      quality.level = 1;
    } else if (quality.level <= 1 && measured < 22) {
      // Kim loại chỉ phản chiếu môi trường: tắt môi trường thì giảm độ kim loại, tăng ánh tự phát để vàng vẫn sáng.
      scene3d.environment = null;
      for (const material of [materials.gold, materials.buddhaGold, materials.buddhaRobe, materials.bronze, materials.lotusPink]) {
        material.metalness = Math.min(material.metalness, 0.35);
        material.emissive.set(material === materials.bronze ? '#2a1a08' : '#5a3a0c');
        material.emissiveIntensity = 0.6;
      }
      // Vườn Hoa: bỏ lớp tulip trồng xen.
      courtyard?.setLowDetail?.(true);
      quality.level = 2;
    }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    if (width === size.width && height === size.height) return;
    const first = size.width === 0;
    const portraitChanged = !first && (width < height) !== (size.width < size.height);
    size = { width, height };
    renderer.setSize(width, height, false);
    // Lần đầu hoặc xoay ngang/dọc: đặt lại góc mặc định cho vừa khung; còn lại giữ góc người dùng đang xem.
    if (first || portraitChanged) resetView();
    else applyView();
  }

  // Khoảng chừa cho thanh điều khiển: dời tâm phối cảnh vào giữa phần còn lại (không thu nhỏ khung WebGL).
  function applyView() {
    camera.aspect = size.width / size.height;
    camera.setViewOffset(size.width, size.height, 0, (insets.bottom - insets.top) / 2, size.width, size.height);
    camera.updateProjectionMatrix();
  }

  function removePerson(id) {
    const person = people.get(id);
    if (!person) return;
    root.remove(person.group);
    disposeSprite(person.label);
    if (person.bubble) disposeSprite(person.bubble.sprite);
    people.delete(id);
  }

  function setParticipants(list) {
    participants = list;
    const seen = new Set();
    for (const item of list) {
      const seat = seatsWorld.get(item.seatId);
      if (!seat) continue;
      seen.add(item.id);
      const skin = String(item.skin || 'c_man').replace(/^c_/, '');
      let person = people.get(item.id);
      if (person && (person.skin !== skin || person.name !== item.name || person.me !== Boolean(item.me))) {
        removePerson(item.id);
        person = null;
      }
      if (!person) {
        const group = new THREE.Group();
        const built = buildPerson(skin);
        const body = built.group;
        body.position.y = 0.14;
        group.add(body);
        const label = textSprite(item.name.length > 18 ? `${item.name.slice(0, 17)}…` : item.name, {
          background: item.me ? 'rgba(138, 42, 30, 0.9)' : 'rgba(12, 10, 8, 0.66)', color: '#f6ead2', height: 0.15, bold: item.me,
        });
        label.position.y = 1.16;
        group.add(label);
        root.add(group);
        person = { group, body, upper: built.upper, label, skin, name: item.name, me: Boolean(item.me), seed: hash(item.id) % 628 / 100, bubble: null, bowT: null };
        people.set(item.id, person);
      }
      person.group.position.set(seat.x, 0, seat.z);
      person.body.traverse((mesh) => { if (mesh.isMesh) mesh.userData.seatId = item.seatId; });
    }
    for (const id of [...people.keys()]) if (!seen.has(id)) removePerson(id);
    // Dựng lại danh sách chạm được: bồ đoàn + người đang ngồi (người đã rời không còn bị chạm trúng).
    pickables.length = 0;
    pickables.push(...cushions.values());
    for (const person of people.values()) person.body.traverse((mesh) => { if (mesh.isMesh) pickables.push(mesh); });
    const mine = list.find((item) => item.me && seatsWorld.has(item.seatId));
    myRing.visible = Boolean(mine);
    if (mine) {
      const seat = seatsWorld.get(mine.seatId);
      myRing.position.set(seat.x, 0.02, seat.z);
    }
  }

  function say(participantId, text) {
    const person = people.get(participantId);
    if (!person) return false;
    if (person.bubble) {
      person.group.remove(person.bubble.sprite);
      disposeSprite(person.bubble.sprite);
    }
    const chars = [...String(text).replace(/\s+/g, ' ').trim()];
    const short = chars.length > 40 ? `${chars.slice(0, 39).join('')}…` : chars.join('');
    const sprite = textSprite(short, { background: person.me ? '#f3c969' : 'rgba(250, 250, 248, 0.95)', color: '#16130f', height: 0.17, tail: true });
    sprite.position.y = 1.38;
    person.group.add(sprite);
    person.bubble = { sprite, at: performance.now() };
    // Giữ tối đa MAX_BUBBLES bong bóng: bỏ cái cũ nhất.
    const active = [...people.values()].filter((item) => item.bubble).sort((a, b) => a.bubble.at - b.bubble.at);
    while (active.length > MAX_BUBBLES) {
      const oldest = active.shift();
      oldest.group.remove(oldest.bubble.sprite);
      disposeSprite(oldest.bubble.sprite);
      oldest.bubble = null;
    }
    return true;
  }

  function addPetal(position, velocity, life) {
    const petal = effectTexture('petal');
    if (effects.petals.length >= MAX_PETALS || !petal) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: petal, transparent: true, depthWrite: false }));
    const scale = 0.12 + Math.random() * 0.08;
    sprite.scale.set(scale, scale, 1);
    sprite.position.copy(position);
    root.add(sprite);
    effects.petals.push({ sprite, velocity, life, t: 0, seed: Math.random() * 6 });
  }

  function offer(participantId, kind, { big = false } = {}) {
    if (big) {
      effects.haloPulse = 1;
      for (let index = 0; index < 24; index += 1) {
        addPetal(new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 1.2, -1.6 + Math.random() * 2), new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.3, 0), 4);
      }
    }
    const person = people.get(participantId);
    // Dâng hương: nén hương bay từ chỗ người dâng (hoặc từ cửa nếu ở khán đài) vào lư rồi cắm xuống.
    if (kind === 'incense') {
      const start = person ? new THREE.Vector3(person.group.position.x, 1.0, person.group.position.z) : new THREE.Vector3(0, 1.2, 9);
      const texture = effectTexture('incense');
      if (texture) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        sprite.scale.set(0.32, 0.32 * (texture.image.height / texture.image.width), 1);
        sprite.position.copy(start);
        root.add(sprite);
        effects.flights.push({ sprite, start, end: new THREE.Vector3(burner.position.x, burner.ashY + 0.25, burner.position.z), t: 0 });
      } else plantStick();
    }
    if (!person) return false;
    if (!reduceMotion) person.bowT = 0;
    const origin = person.group.position;
    const texture = kind === 'incense' ? null : effectTexture(kind);
    if (texture) {
      if (effects.fx.length >= MAX_FX) {
        const old = effects.fx.shift();
        root.remove(old.sprite);
        old.sprite.material.dispose();
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      const scale = big ? 0.7 : 0.45;
      sprite.scale.set(scale, scale * (texture.image.height / texture.image.width), 1);
      sprite.position.set(origin.x, 1.25, origin.z);
      root.add(sprite);
      effects.fx.push({ sprite, t: 0, life: big ? 3.2 : 2.2, baseY: 1.25 });
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.4, 1.4, 1);
    glow.position.set(origin.x, 0.6, origin.z);
    root.add(glow);
    effects.glows.push({ sprite: glow, t: 0, life: 2 });
    const count = big ? 18 : kind === 'lotus' ? 8 : 3;
    for (let index = 0; index < count; index += 1) {
      addPetal(new THREE.Vector3(origin.x + (Math.random() - 0.5) * 0.5, 0.9, origin.z + (Math.random() - 0.5) * 0.3), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.35, 0), 2.5 + Math.random());
    }
    return true;
  }

  function updateIncense(dt) {
    effects.flights = effects.flights.filter((item) => {
      item.t += dt;
      const k = Math.min(1, item.t / FLIGHT_S);
      const ease = 1 - (1 - k) ** 3;
      item.sprite.position.lerpVectors(item.start, item.end, ease);
      item.sprite.position.y += Math.sin(k * Math.PI) * 0.8;
      if (k < 1) return true;
      root.remove(item.sprite);
      item.sprite.material.dispose();
      plantStick();
      return false;
    });
    effects.sticks = effects.sticks.filter((item) => {
      item.t += dt;
      if (item.t >= STICK_LIFE_S) {
        root.remove(item.group);
        return false;
      }
      // Hương cháy ngắn dần từ 55 cm xuống 15 cm.
      const length = 0.55 - 0.4 * (item.t / STICK_LIFE_S);
      item.stick.scale.y = length;
      item.ember.position.y = length;
      item.ember.material.opacity = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(item.t * 6 + item.group.position.x * 40);
      return true;
    });
    // Khói bốc lên từ vài nén ngẫu nhiên; số làn khói giới hạn để nhẹ máy.
    effects.smokeTimer -= dt;
    if (!reduceMotion && effects.sticks.length && effects.smokeTimer <= 0 && effects.smoke.length < 40) {
      effects.smokeTimer = 0.25;
      const source = effects.sticks[Math.floor(Math.random() * effects.sticks.length)];
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, depthWrite: false }));
      const tip = new THREE.Vector3(0, source.ember.position.y, 0);
      source.group.localToWorld(tip);
      sprite.position.copy(tip);
      sprite.scale.set(0.08, 0.08, 1);
      root.add(sprite);
      effects.smoke.push({ sprite, t: 0, life: 3.5, drift: (Math.random() - 0.5) * 0.12 });
    }
    effects.smoke = effects.smoke.filter((item) => {
      item.t += dt;
      if (item.t >= item.life) {
        root.remove(item.sprite);
        item.sprite.material.dispose();
        return false;
      }
      const k = item.t / item.life;
      item.sprite.position.y += dt * 0.35;
      item.sprite.position.x += Math.sin(item.t * 1.7) * item.drift * dt;
      const size = 0.08 + k * 0.45;
      item.sprite.scale.set(size, size, 1);
      item.sprite.material.opacity = (1 - k) * 0.6;
      return true;
    });
  }

  function updateEffects(dt, time) {
    updateIncense(dt);
    effects.haloPulse = Math.max(0, effects.haloPulse - dt * 0.45);
    const breathe = reduceMotion ? 0 : Math.sin(time / 830) * 0.08;
    buddha.aureole.material.opacity = Math.min(1, 0.8 + breathe + effects.haloPulse * 0.4);
    buddha.haloRing.material.emissiveIntensity = 1.1 + effects.haloPulse * 2.5;
    buddha.haloDisc.scale.setScalar(1 + effects.haloPulse * 0.12 + breathe * 0.2);
    buddhaSpot.intensity = 70 * (1 + effects.haloPulse * 0.6);
    altarLight.intensity = 8 * (reduceMotion ? 1 : 0.92 + 0.08 * Math.sin(time / 90) * Math.sin(time / 63));
    for (const candle of altar.candles) {
      const flicker = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(time / 90 + candle.seed * 5) * Math.sin(time / 63);
      candle.flame.scale.set(0.3, 0.45 * flicker, 1);
    }
    effects.fx = effects.fx.filter((item) => {
      item.t += dt;
      const k = item.t / item.life;
      if (k >= 1) {
        root.remove(item.sprite);
        item.sprite.material.dispose();
        return false;
      }
      item.sprite.position.y = item.baseY + k * 0.8;
      item.sprite.material.opacity = k < 0.75 ? 1 : (1 - k) / 0.25;
      return true;
    });
    effects.glows = effects.glows.filter((item) => {
      item.t += dt;
      if (item.t >= item.life) {
        root.remove(item.sprite);
        item.sprite.material.dispose();
        return false;
      }
      item.sprite.material.opacity = 0.8 * (1 - item.t / item.life);
      return true;
    });
    effects.petals = effects.petals.filter((item) => {
      item.t += dt;
      if (item.t >= item.life) {
        root.remove(item.sprite);
        item.sprite.material.dispose();
        return false;
      }
      item.sprite.position.addScaledVector(item.velocity, dt);
      item.sprite.position.x += Math.sin(item.t * 3 + item.seed) * 0.15 * dt;
      item.sprite.material.rotation = Math.sin(item.t * 2 + item.seed) * 0.6;
      item.sprite.material.opacity = Math.min(1, item.life - item.t);
      return true;
    });
    const now = performance.now();
    for (const person of people.values()) {
      if (!reduceMotion) person.upper.scale.y = 1 + Math.sin(time / 900 + person.seed) * 0.012;
      // Cúi lạy khi dâng lễ: thân trên nghiêng về phía bàn thờ (−z) rồi ngồi thẳng lại.
      if (person.bowT !== null) {
        person.bowT += dt;
        const k = person.bowT / BOW_S;
        person.upper.rotation.x = k >= 1 ? 0 : -0.5 * Math.sin(Math.PI * k);
        if (k >= 1) person.bowT = null;
      }
      if (person.bubble) {
        const age = now - person.bubble.at;
        if (age > BUBBLE_MS) {
          person.group.remove(person.bubble.sprite);
          disposeSprite(person.bubble.sprite);
          person.bubble = null;
        } else person.bubble.sprite.material.opacity = Math.min(1, age / 180, (BUBBLE_MS - age) / 500);
      }
    }
    myRing.material.opacity = reduceMotion ? 0.8 : 0.55 + 0.3 * Math.sin(time / 300);
  }

  // Tiết kiệm (điện thoại đang đọc giọng): vẽ tối đa ~30 hình/giây để giọng đọc không bị giật.
  let lowPower = false;
  let paused = false;
  let lastDrawn = 0;
  function render(time) {
    if (destroyed) return;
    requestAnimationFrame(render);
    // Màn phủ kín như oẳn tù xì không cần cảnh 3D tiếp tục nộp hàng trăm draw call phía sau. Vẫn giữ vòng RAF
    // nhẹ để lúc mở lại không phải tạo renderer/shader mới; cập nhật mốc thời gian để tránh một frame dt lớn.
    if (paused) {
      last = time;
      lastDrawn = time;
      return;
    }
    if (lowPower && time - lastDrawn < 32) return;
    lastDrawn = time;
    resize();
    const dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    controls.update();
    // Không cho camera xuyên tường hay chui xuống sàn.
    const clamped = clampToBounds(camera.position, world.camera.bounds);
    camera.position.set(clamped.x, clamped.y, clamped.z);
    // Không chui vào cột: quá gần trục cột thì đẩy ra theo phương ngang.
    for (const [x, z] of hall.pillars) {
      const dx = camera.position.x - x;
      const dz = camera.position.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance < PILLAR_CLEARANCE) {
        const scale = PILLAR_CLEARANCE / (distance || 1e-3);
        camera.position.x = x + (distance ? dx : PILLAR_CLEARANCE) * (distance ? scale : 1);
        camera.position.z = z + dz * (distance ? scale : 0);
      }
    }
    if (!plugin?.ownsCamera) {
      const target = clampToBounds(controls.target, { ...world.camera.bounds, y: [0.3, 3.5], z: [-1.5, 9] });
      controls.target.set(target.x, target.y, target.z);
    }
    plugin?.update(dt, time);
    courtyard?.update(dt, time);
    updateEffects(dt, time);
    updateCeremony(time);
    renderer.render(scene3d, camera);
    adaptQuality(time);
    frames += 1;
    if (time - fpsStart >= 1_000) {
      fps = Math.round((frames * 1_000) / (time - fpsStart));
      frames = 0;
      fpsStart = time;
    }
  }

  // Chạm (không kéo) vào bồ đoàn hoặc người để chọn chỗ.
  const raycaster = new THREE.Raycaster();
  let pointerStart = null;
  function onPointerDown(event) {
    pointerStart = { x: event.clientX, y: event.clientY };
  }
  function pickSeatAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false).find((item) => item.object.userData.seatId);
    return (hit && sceneData.seats.find((item) => item.id === hit.object.userData.seatId)) || null;
  }
  function onPointerUp(event) {
    if (!pointerStart || !onSeatClick || plugin?.handlesTaps) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 8) return;
    const seat = pickSeatAt(event.clientX, event.clientY);
    if (seat) onSeatClick(seat);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  const plugin = pluginFactory?.({
    THREE, canvas, scene3d, root, camera, controls, materials, buildPerson, world, sceneData, seatsWorld, courtyard,
    pickSeatAt, onSeatClick, reduceMotion,
    // tone 'seeker': người đi tìm trong trò trốn tìm (đỏ tươi, chữ đậm) để ai cũng nhận ra.
    makeLabel: (text, me, tone = null) => textSprite(text.length > 18 ? `${text.slice(0, 17)}…` : text, tone === 'seeker'
      ? { background: 'rgba(214, 38, 38, 0.96)', color: '#ffffff', height: 0.17, bold: true }
      : { background: me ? 'rgba(138, 42, 30, 0.9)' : 'rgba(12, 10, 8, 0.66)', color: '#f6ead2', height: 0.15, bold: me }),
    makeBubble: (text, me) => textSprite(text, { background: me ? '#f3c969' : 'rgba(250, 250, 248, 0.95)', color: '#1b140c', height: 0.14, tail: true }),
    disposeSprite,
  }) || null;

  resize();
  // Biên dịch sẵn shader của mọi vật (kể cả ngoài khung nhìn) lúc nạp: không thì lần đầu quay ra sân hay đi tới một
  // góc mới, trình duyệt dừng biên dịch giữa chừng làm nhân vật giật.
  // Nhân vật, nhãn tên, vòng sáng, người ngồi bồ đoàn, cuộn sớ chỉ xuất hiện khi vào phòng: dựng tạm / bật tạm mỗi
  // loại một cái để biên dịch luôn (renderer.compile bỏ qua vật đang ẩn).
  const warm = plugin?.warmup?.();
  if (warm) root.add(warm.group);
  const seated = buildPerson('man').group;
  const seatedLabels = [true, false].map((me) => textSprite('·', { background: me ? 'rgba(138, 42, 30, 0.9)' : 'rgba(12, 10, 8, 0.66)', color: '#f6ead2', height: 0.15, bold: me }));
  root.add(seated, ...seatedLabels);
  const hiddenNow = [myRing, reading.scroll].filter(Boolean);
  for (const object of hiddenNow) object.visible = true;
  try {
    renderer.compile(scene3d, camera);
  } catch {}
  for (const object of hiddenNow) object.visible = false;
  root.remove(seated, ...seatedLabels);
  for (const label of seatedLabels) label.material.map?.dispose();
  warm?.done();
  // compile không lường hết biến thể (sương mù, bóng nắng, vật ngoài sân): dựng thử 4 khung thật từ chỗ xuất hiện,
  // nhìn bốn hướng, lúc cổng vào còn che màn hình. Không thì lần đầu ra sân (ngay khi vào phòng) đứng hình vài giây.
  const spawn = world.walk?.spawn;
  if (spawn && courtyard) {
    const probe = camera.clone();
    probe.fov = 100;
    probe.updateProjectionMatrix();
    const shadowLights = [];
    scene3d.traverse((object) => { if (object.isLight && object.castShadow) shadowLights.push(object); });
    try {
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        probe.position.set(spawn.x, 2, spawn.z);
        probe.lookAt(spawn.x - Math.sin(heading) * 10, 1.5, spawn.z - Math.cos(heading) * 10);
        for (const light of shadowLights) light.shadow.needsUpdate = true;
        renderer.render(scene3d, probe);
      }
    } catch {}
  }
  requestAnimationFrame(render);

  return {
    scene: sceneData,
    mode: '3d',
    plugin: plugin?.api || null,
    // Danh sách tượng quét đã thay (để kiểm tra): Promise<['buddha', 'guanyin', 'arhats']>.
    statuesReady,
    activateAssets() {
      statuesReady.start?.();
      courtyard?.activateAssets?.();
    },
    // Tiến độ tải tượng { done, total } (trang hiện "Đang tải cảnh…" ở cổng vào).
    loadProgress() {
      return { ...statueProgress };
    },
    setParticipants,
    setCeremony,
    setCommunityProject(project) {
      courtyard?.setCommunityProject(project);
    },
    setCeremonyActive(active) {
      ceremonyActive = Boolean(active);
    },
    teacherRead,
    setLowPower(on) {
      lowPower = Boolean(on);
    },
    setPaused(on) {
      paused = Boolean(on);
    },
    say,
    offer,
    setInsets(next) {
      insets = { top: Math.max(0, next.top || 0), bottom: Math.max(0, next.bottom || 0) };
      applyView();
    },
    // Về góc mặc định (sau lưng khán đường nhìn lên bàn thờ).
    setCamera() {
      resetView();
    },
    screenRect() {
      return null;
    },
    stats() {
      return {
        fps,
        participants: participants.length,
        seats: world.seats.length,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        shadows: courtyard?.shadowsEnabled() || false,
        paused,
        quality: ['cao', 'độ phân giải 1×', 'tắt ánh sáng môi trường'][quality.level === 2 && scene3d.environment ? 0 : quality.level],
      };
    },
    // Chỉ để đo hiệu năng khi phát triển: bật/tắt ánh sáng môi trường và đèn chiếu tượng.
    debugToggle(name, on) {
      if (name === 'environment') scene3d.environment = on ? environment : null;
      if (name === 'spot') buddhaSpot.visible = on;
      if (name === 'pixelRatio') renderer.setPixelRatio(on);
      if (name === 'shadows') courtyard?.setShadows(on, touch ? 512 : 1024);
    },
    // Chỉ để chụp kiểm tra khi phát triển: đặt camera nhìn từ position vào target.
    // Vị trí chó mèo trong vườn (để kiểm tra / chụp ảnh).
    // Chương trình shader đã biên dịch (để tìm vật làm giật khi lần đầu xuất hiện).
    debugPrograms(withUsers = false) {
      const users = new Map();
      if (withUsers) {
        scene3d.traverse((object) => {
          for (const material of [object.material].flat().filter(Boolean)) {
            const key = renderer.properties.get(material)?.currentProgram?.cacheKey;
            if (!key) continue;
            if (!users.has(key)) users.set(key, []);
            const list = users.get(key);
            if (list.length < 3) list.push(`${object.type}:${object.name || ''}<${object.parent?.type}:${object.parent?.name || ''}<${object.parent?.parent?.name || ''} ${material.type}${material.map ? '+map' : ''} y=${object.position.y.toFixed(2)}`);
          }
        });
      }
      return (renderer.info.programs || []).map((program) => `${program.name}|${program.cacheKey}${withUsers ? `|${JSON.stringify(users.get(program.cacheKey) || [])}` : ''}`);
    },
    debugAnimals() {
      return courtyard?.animals?.positions() || [];
    },
    // Chỉ để kiểm tra khi phát triển: vật nằm dưới điểm (x, y) theo tỉ lệ 0–1 của khung vẽ.
    debugPick(x, y) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
      return ray.intersectObjects(scene3d.children, true).slice(0, 4).map((hit) => {
        const names = [];
        for (let node = hit.object; node; node = node.parent) if (node.name) names.push(node.name);
        return { distance: Math.round(hit.distance * 100) / 100, type: hit.object.type, names, material: hit.object.material?.type, color: hit.object.material?.color?.getHexString?.(), map: Boolean(hit.object.material?.map), point: hit.point.toArray().map((value) => Math.round(value * 100) / 100) };
      });
    },
    debugView(position, target) {
      controls.enableDamping = false;
      camera.position.set(...position);
      controls.target.set(...target);
      controls.update();
    },
    destroy() {
      destroyed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      plugin?.dispose();
      controls.dispose();
      for (const id of [...people.keys()]) removePerson(id);
      for (const staff of ceremonyStaff) disposeSprite(staff.label);
      renderer.dispose();
    },
  };
}
