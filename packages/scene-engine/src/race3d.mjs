// Trường đua 3D (trang /dua-xe.html). Mọi hình dựng từ dữ liệu đường đua (scenes/<track>/track.json qua buildTrack của
// @chanh-dien/race): mặt nhựa, vạch trắng, kerb đỏ trắng, bẫy sỏi ngoài cua, rào lốp, khán đài có khán giả, dãy pit,
// giàn đèn xuất phát, cây, đồi xa. Xe là mô hình Meshy (/models/race/car.glb), mỗi xe một màu bằng cách đổi sắc phần
// thân đỏ trong shader; chưa tải xong thì hiện xe dựng bằng khối. Camera bám sau xe đang theo dõi (của mình hoặc xe
// người khác khi xem), không theo ai thì bay vòng trên cao.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const KERB = 1.2;
const CAR_LENGTH = 5.4;
const TAU = Math.PI * 2;
const wrap = (angle) => {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value <= -Math.PI) value += TAU;
  return value;
};

// Ảnh vẽ bằng canvas (lặp lại): nhựa, cỏ, sỏi, kerb, rào, khán giả, cửa pit, vạch đích.
function canvasTexture(width, height, draw, { repeat = true, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
function noise(ctx, width, height, base, spread, count, size = 1) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < count; index += 1) {
    const shade = (Math.random() - 0.5) * spread;
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, size, size);
  }
}

// Dải chạy dọc đường: hai mép lệch d0(i) / d1(i) khỏi đường tâm, chỉ những đoạn keep(i). v theo mét / vScale.
function ribbon(track, d0, d1, { y = 0, keep = () => true, vScale = 10, y1 = null } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = track.samples;
  let run = -1;
  for (let step = 0; step <= count; step += 1) {
    const index = step % count;
    const use = keep(index) || (step > 0 && keep((step - 1) % count));
    if (!use) {
      run = -1;
      continue;
    }
    const nx = track.tz[index];
    const nz = -track.tx[index];
    const a = d0(index);
    const b = d1(index);
    const v = (step * track.step) / vScale;
    const base = positions.length / 3;
    positions.push(track.x[index] + nx * a, y, track.z[index] + nz * a, track.x[index] + nx * b, y1 ?? y, track.z[index] + nz * b);
    uvs.push(0, v, 1, v);
    // Mặt quay lên (nhìn từ trên xuống ngược chiều kim đồng hồ).
    if (run >= 0) indices.push(run, base, run + 1, run + 1, base, base + 1);
    run = base;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Khối chạy dọc đường theo tiết diện (profile: [[lệch ngang, cao], …] tính từ mép gần đường ra xa) trong đoạn s0 → s1.
function extrude(track, { from, to, side, offset, profile, vScale = 8 }) {
  const length = track.length;
  const start = from * length;
  let span = to * length - start;
  if (span <= 0) span += length;
  const steps = Math.max(2, Math.round(span / 4));
  const positions = [];
  const uvs = [];
  const indices = [];
  const sign = side === 'left' ? 1 : -1;
  // u theo chiều dài tiết diện (để ảnh khán giả / cửa pit trải theo bậc).
  const lengths = [0];
  for (let index = 1; index < profile.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(profile[index][0] - profile[index - 1][0], profile[index][1] - profile[index - 1][1]));
  }
  for (let step = 0; step <= steps; step += 1) {
    const s = start + (span * step) / steps;
    const point = track.pointAt(s);
    const index = point.index;
    const wallBase = side === 'left' ? track.wallLeft[index] : track.wallRight[index];
    const nx = point.tz * sign;
    const nz = -point.tx * sign;
    for (let k = 0; k < profile.length; k += 1) {
      const d = wallBase + offset + profile[k][0];
      positions.push(point.x + nx * d, profile[k][1], point.z + nz * d);
      uvs.push(lengths[k] / lengths[lengths.length - 1], (span * step) / steps / vScale);
    }
    if (step > 0) {
      const a = (step - 1) * profile.length;
      const b = step * profile.length;
      for (let k = 0; k < profile.length - 1; k += 1) {
        if (sign > 0) indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
        else indices.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Đổi sắc phần thân đỏ của mô hình xe sang màu của người lái (phần đen / trắng / bạc giữ nguyên).
function tintMaterial(source, color) {
  const material = source.clone();
  const tint = new THREE.Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = { value: tint };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float hi = max(c.r, max(c.g, c.b));
          float lo = min(c.r, min(c.g, c.b));
          float sat = (hi - lo) / max(hi, 1e-4);
          float red = smoothstep(1.25, 2.2, c.r / max(max(c.g, c.b), 1e-4));
          float weight = smoothstep(0.35, 0.6, sat) * red;
          float tintHi = max(uTint.r, max(uTint.g, uTint.b));
          vec3 painted = uTint * (c.r / max(tintHi, 1e-3)) * 0.92;
          diffuseColor.rgb = mix(c, painted, weight);
        }`);
  };
  material.customProgramCacheKey = () => 'race-car-tint';
  return material;
}

function labelSprite(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '700 40px system-ui, sans-serif';
  ctx.font = font;
  const width = Math.min(560, Math.ceil(ctx.measureText(text).width) + 56);
  canvas.width = width;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
  ctx.beginPath();
  ctx.roundRect(0, 4, width, 56, 28);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(28, 32, 11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 46, 34, width - 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, sizeAttenuation: false, transparent: true }));
  sprite.scale.set(0.045 * (width / 64), 0.045, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

// Xe dựng bằng khối (lúc chưa tải mô hình / tải lỗi).
function blockCar(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 4.6), paint);
  body.position.set(0, 0.45, 0.1);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), dark);
  nose.position.set(0, 0.2, 2.5);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.4), dark);
  wing.position.set(0, 0.95, -2.3);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.4 }));
  helmet.position.set(0, 0.82, -0.2);
  group.add(body, nose, wing, helmet);
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.42, 14);
  wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.85, 1.6], [-0.85, 1.6], [0.85, -1.5], [-0.85, -1.5]]) {
    const mesh = new THREE.Mesh(wheel, dark);
    mesh.position.set(x, 0.36, z);
    group.add(mesh);
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  return group;
}

export function createRaceRenderer({ canvas, track, modelUrl = '/models/race/car.glb', colors = [], maxPixelRatio = 2, lowPower = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, lowPower ? 1.5 : maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const decor = track.data.decor || {};
  scene.background = new THREE.Color(decor.sky || '#a9cdec');
  scene.fog = new THREE.Fog(decor.fog || '#c7dcec', 260, 1500);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3_000);
  scene.add(new THREE.HemisphereLight('#e2f1ff', '#5b7a45', 1.15));
  const sun = new THREE.DirectionalLight('#fff3df', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(-70, 120, 50);

  // Khung bao đường đua (đặt mặt đất, cây, camera bay vòng).
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let index = 0; index < track.samples; index += 1) {
    minX = Math.min(minX, track.x[index]); maxX = Math.max(maxX, track.x[index]);
    minZ = Math.min(minZ, track.z[index]); maxZ = Math.max(maxZ, track.z[index]);
  }
  const center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const extent = Math.max(maxX - minX, maxZ - minZ);

  // ---- Mặt đất, đường đua ----
  const textures = [];
  const grass = canvasTexture(256, 256, (ctx, w, h) => noise(ctx, w, h, decor.grass || '#5d8f3e', 0.16, 9_000, 2));
  grass.repeat.set(600, 600);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4_000, 4_000), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.05, center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const asphalt = canvasTexture(256, 256, (ctx, w, h) => noise(ctx, w, h, '#3b3d41', 0.22, 14_000, 1.5));
  const halfLine = (d) => () => d;
  const surface = new THREE.Mesh(ribbon(track, halfLine(-track.half), halfLine(track.half), { vScale: 14 }), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 }));
  surface.receiveShadow = true;
  scene.add(surface);
  const lineMaterial = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const sign of [1, -1]) {
    const edge = new THREE.Mesh(ribbon(track, halfLine(sign * (track.half - 0.55)), halfLine(sign * (track.half - 0.25)), { y: 0.01 }), lineMaterial);
    edge.receiveShadow = true;
    scene.add(edge);
  }
  // Kerb đỏ trắng.
  const kerbTexture = canvasTexture(16, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d62b2b'; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, h / 2, w, h / 2);
  });
  const kerbMaterial = new THREE.MeshStandardMaterial({ map: kerbTexture, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
  scene.add(
    new THREE.Mesh(ribbon(track, halfLine(track.half - 0.15), halfLine(track.half + KERB), { y: 0.03, keep: (i) => track.kerbLeft[i], vScale: 3 }), kerbMaterial),
    new THREE.Mesh(ribbon(track, halfLine(-track.half - KERB), halfLine(-track.half + 0.15), { y: 0.03, keep: (i) => track.kerbRight[i], vScale: 3 }), kerbMaterial),
  );
  // Bẫy sỏi phía ngoài cua (độ cong ngược phía), dải cỏ cắt ngắn ở chỗ khác.
  const outsideLeft = new Uint8Array(track.samples);
  const outsideRight = new Uint8Array(track.samples);
  for (let index = 0; index < track.samples; index += 1) {
    for (let offset = -12; offset <= 12; offset += 1) {
      const k = track.curvature[(index + offset + track.samples) % track.samples];
      if (k < -1 / 110) outsideLeft[index] = 1;
      if (k > 1 / 110) outsideRight[index] = 1;
    }
  }
  const gravel = canvasTexture(128, 128, (ctx, w, h) => noise(ctx, w, h, '#c9b48a', 0.3, 5_000, 2));
  const gravelMaterial = new THREE.MeshLambertMaterial({ map: gravel, polygonOffset: true, polygonOffsetFactor: -1 });
  scene.add(
    new THREE.Mesh(ribbon(track, halfLine(track.half + KERB), (i) => track.wallLeft[i] - 0.6, { y: 0.015, keep: (i) => outsideLeft[i], vScale: 6 }), gravelMaterial),
    new THREE.Mesh(ribbon(track, (i) => -track.wallRight[i] + 0.6, halfLine(-track.half - KERB), { y: 0.015, keep: (i) => outsideRight[i], vScale: 6 }), gravelMaterial),
  );
  // Vạch xuất phát (ô cờ) và ô lưới.
  const checker = canvasTexture(64, 16, (ctx, w, h) => {
    for (let x = 0; x < 16; x += 1) for (let y = 0; y < 4; y += 1) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      ctx.fillRect(x * 4, y * 4, 4, 4);
    }
  }, { repeat: false });
  const start = track.pointAt(0);
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 1.6), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
  // Nằm phẳng rồi xoay theo hướng đường: bề rộng ảnh chạy ngang qua mặt đường.
  startLine.rotation.order = 'YXZ';
  startLine.rotation.y = start.h;
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(start.x, 0.02, start.z);
  scene.add(startLine);
  const slotGeometry = new THREE.PlaneGeometry(2.6, 0.3);
  for (let slot = 0; slot < 8; slot += 1) {
    const point = track.pointAt(track.length - 12 - slot * 8 + 2.8, slot % 2 === 0 ? 3 : -3);
    const mark = new THREE.Mesh(slotGeometry, lineMaterial);
    mark.rotation.order = 'YXZ';
    mark.rotation.y = point.h;
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(point.x, 0.02, point.z);
    scene.add(mark);
  }
  // Rào lốp (sọc đỏ trắng) hai bên, cao 1,1 m.
  const barrierTexture = canvasTexture(16, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, 4);
  });
  const barrierMaterial = new THREE.MeshStandardMaterial({ map: barrierTexture, roughness: 0.8, side: THREE.DoubleSide });
  for (const side of ['left', 'right']) {
    const walls = side === 'left' ? track.wallLeft : track.wallRight;
    const sign = side === 'left' ? 1 : -1;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let step = 0; step <= track.samples; step += 1) {
      const index = step % track.samples;
      const d = walls[index] * sign;
      const x = track.x[index] + track.tz[index] * d;
      const z = track.z[index] - track.tx[index] * d;
      const v = (step * track.step) / 3;
      positions.push(x, 0, z, x, 1.1, z);
      uvs.push(v, 0, v, 1);
      if (step) {
        const a = (step - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const wall = new THREE.Mesh(geometry, barrierMaterial);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }
  textures.push(grass, asphalt, kerbTexture, gravel, checker, barrierTexture);

  // ---- Khán đài, pit, giàn đèn ----
  // Ảnh trên mặt cắt (extrude): u = dọc tiết diện (0 chân → 1 đỉnh) = trục x của canvas, v = dọc đường = trục y.
  const concrete = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.9 });
  // Mặt dưới mái nhìn từ đường: ánh trời từ dưới (màu cỏ) làm mái xanh thẫm, thêm emissive cho ra màu thép sáng.
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#eef1f4', emissive: '#5d6168', roughness: 0.6, side: THREE.DoubleSide });
  const standMeshes = new Map();
  function crowdTexture(profile, vScale) {
    const lengths = [0];
    for (let index = 1; index < profile.length; index += 1) {
      lengths.push(lengths[index - 1] + Math.hypot(profile[index][0] - profile[index - 1][0], profile[index][1] - profile[index - 1][1]));
    }
    const total = lengths.at(-1);
    const shirts = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#f5f5f5', '#8e24aa', '#00acc1', '#263238', '#d81b60'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
    const height = 512;
    const perMeter = height / vScale;
    return canvasTexture(512, height, (ctx, w) => {
      ctx.fillStyle = '#6b717b';
      ctx.fillRect(0, 0, w, height);
      // Tường trước: bê tông + dải đỏ trắng.
      const wall = (lengths[1] / total) * w;
      ctx.fillStyle = '#d9dcdf';
      ctx.fillRect(0, 0, wall, height);
      for (let y = 0; y < height; y += perMeter * 2) {
        ctx.fillStyle = '#c62828';
        ctx.fillRect(wall * 0.55, y, wall * 0.3, perMeter);
      }
      // Mỗi bậc (mặt đứng + mặt ngồi) một hàng người: cùng người cùng màu áo trên cả hai mặt.
      for (let k = 2; k + 1 < profile.length; k += 2) {
        const a = (lengths[k === 2 ? 2 : k - 1] / total) * w;
        const b = (lengths[k + 1] / total) * w;
        for (let y = 0; y < height; y += perMeter * 0.55) {
          if (Math.random() < 0.12) {
            ctx.fillStyle = ['#c62828', '#1565c0', '#f9a825'][k % 3];
            ctx.fillRect(a, y + 1, b - a, perMeter * 0.45);
            continue;
          }
          const shirt = shirts[Math.floor(Math.random() * shirts.length)];
          ctx.fillStyle = shirt;
          ctx.fillRect(a, y + 1, (b - a) * 0.82, perMeter * 0.42);
          ctx.fillStyle = skins[Math.floor(Math.random() * skins.length)];
          ctx.fillRect(a + (b - a) * 0.8, y + perMeter * 0.08, (b - a) * 0.18, perMeter * 0.26);
        }
      }
    });
  }
  for (const stand of decor.grandstands || []) {
    const tiers = stand.tiers || 9;
    const profile = [[0, 0], [0, 1.4]];
    for (let tier = 0; tier < tiers; tier += 1) profile.push([1 + tier * 1.0, 1.4 + tier * 0.65], [1 + (tier + 1) * 1.0, 1.4 + tier * 0.65]);
    const depth = 1 + tiers;
    const top = 1.4 + tiers * 0.65;
    const crowd = crowdTexture(profile, 25);
    textures.push(crowd);
    const options = { ...stand, offset: stand.gap ?? 4 };
    const seats = new THREE.Mesh(extrude(track, { ...options, profile, vScale: 25 }), new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 }));
    // Tường sau cao tới mái (mái công-xon tựa lên tường sau).
    const back = new THREE.Mesh(extrude(track, { ...options, profile: [[depth, top + 3.3], [depth, 0]] }), concrete);
    const roof = new THREE.Mesh(extrude(track, { ...options, profile: [[-0.5, top + 3.6], [depth + 0.3, top + 3.2]] }), roofMaterial);
    const meshes = [seats, back, roof];
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    standMeshes.set(stand, meshes);
  }
  if (decor.pit) {
    // Mặt tiền pit hai tầng (9 m): tầng dưới các ô garage 8 m, sàn, tầng trên kính, mép mái trắng.
    const garage = canvasTexture(256, 512, (ctx, w, h) => {
      ctx.fillStyle = '#eef1f4';
      ctx.fillRect(0, 0, w, h);
      const bay = h / 8;
      for (let y = 0; y < h; y += bay) {
        ctx.fillStyle = '#1d2026';
        ctx.fillRect(0, y + bay * 0.08, w * 0.42, bay * 0.84);
        ctx.fillStyle = '#9aa3ad';
        for (let x = w * 0.3; x < w * 0.42; x += 6) ctx.fillRect(x, y + bay * 0.08, 3, bay * 0.84);
      }
      ctx.fillStyle = '#c9ced4';
      ctx.fillRect(w * 0.47, 0, w * 0.04, h);
      ctx.fillStyle = '#5c7f9e';
      ctx.fillRect(w * 0.55, 0, w * 0.36, h);
      ctx.fillStyle = '#8fb1cc';
      ctx.fillRect(w * 0.75, 0, w * 0.14, h);
      ctx.fillStyle = '#e4e8ec';
      for (let y = 0; y < h; y += bay / 3) ctx.fillRect(w * 0.55, y, w * 0.36, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w * 0.93, 0, w * 0.07, h);
    });
    textures.push(garage);
    const pit = decor.pit;
    const offset = pit.gap ?? 6;
    const front = new THREE.Mesh(extrude(track, { ...pit, offset, profile: [[0, 0], [0, 9]], vScale: 64 }), new THREE.MeshStandardMaterial({ map: garage, roughness: 0.7 }));
    const box = new THREE.Mesh(extrude(track, { ...pit, offset, profile: [[0, 9], [16, 9], [16, 0]] }), concrete);
    const lane = new THREE.Mesh(extrude(track, { ...pit, offset: 0.5, profile: [[0, 0.02], [offset - 0.5, 0.02]] }), new THREE.MeshStandardMaterial({ color: '#45474b', roughness: 0.9 }));
    for (const mesh of [front, box, lane]) {
      mesh.castShadow = mesh !== lane;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    standMeshes.set(pit, [front, box]);
  }
  // Giàn đèn trên vạch xuất phát: hai cột, xà ngang, 5 cụm đèn đỏ.
  const lights = [];
  {
    const gantry = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.5, metalness: 0.5 });
    const span = track.width + 4;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.7, 0.6), metal);
    beam.position.y = 7.2;
    gantry.add(beam);
    for (const x of [-span / 2, span / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.6, 0.5), metal);
      post.position.set(x, 3.8, 0);
      gantry.add(post);
    }
    const bulb = new THREE.CircleGeometry(0.28, 16);
    for (let index = 0; index < 5; index += 1) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.4), metal);
      housing.position.set((index - 2) * 1.2, 6.3, 0);
      gantry.add(housing);
      for (const y of [6.7, 6.0]) {
        for (const z of [0.21, -0.21]) {
          const lamp = new THREE.Mesh(bulb, new THREE.MeshBasicMaterial({ color: '#3a0b0b' }));
          lamp.position.set((index - 2) * 1.2, y, z);
          if (z < 0) lamp.rotation.y = Math.PI;
          gantry.add(lamp);
          lights[index] = lights[index] || [];
          lights[index].push(lamp);
        }
      }
    }
    gantry.position.set(start.x, 0, start.z);
    gantry.rotation.y = start.h;
    gantry.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    scene.add(gantry);
  }

  // ---- Cây và đồi xa ----
  {
    const random = (() => {
      let seed = decor.trees?.seed ?? 7;
      return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    })();
    const count = lowPower ? Math.round((decor.trees?.count ?? 700) * 0.5) : decor.trees?.count ?? 700;
    const crown = new THREE.ConeGeometry(2.4, 7, 7);
    crown.translate(0, 6.5, 0);
    const trunk = new THREE.CylinderGeometry(0.3, 0.4, 3.2, 5);
    trunk.translate(0, 1.6, 0);
    const crowns = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: '#ffffff' }), count);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#5a4030' }), count);
    const reserved = [...(decor.grandstands || []), ...(decor.pit ? [{ ...decor.pit, tiers: 14 }] : [])];
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let placed = 0;
    for (let tries = 0; tries < count * 8 && placed < count; tries += 1) {
      const x = minX - 160 + random() * (maxX - minX + 320);
      const z = minZ - 160 + random() * (maxZ - minZ + 320);
      const projected = track.project(x, z);
      const wall = projected.d > 0 ? track.wallLeft[projected.index] : track.wallRight[projected.index];
      if (Math.abs(projected.d) < wall + 7) continue;
      const fraction = projected.s / track.length;
      const blocked = reserved.some((item) => {
        const inside = item.from <= item.to ? fraction >= item.from - 0.01 && fraction <= item.to + 0.01 : fraction >= item.from - 0.01 || fraction <= item.to + 0.01;
        return inside && (item.side === 'left') === (projected.d > 0) && Math.abs(projected.d) < wall + (item.gap ?? 4) + (item.tiers || 9) + 12;
      });
      if (blocked) continue;
      const scale = 0.7 + random() * 0.8;
      matrix.makeRotationY(random() * TAU);
      matrix.scale(new THREE.Vector3(scale, scale * (0.85 + random() * 0.4), scale));
      matrix.setPosition(x, 0, z);
      crowns.setMatrixAt(placed, matrix);
      trunks.setMatrixAt(placed, matrix);
      crowns.setColorAt(placed, color.setHSL(0.27 + random() * 0.08, 0.45 + random() * 0.2, 0.22 + random() * 0.12));
      placed += 1;
    }
    crowns.count = placed;
    trunks.count = placed;
    crowns.castShadow = !lowPower;
    scene.add(crowns, trunks);
    const hill = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2);
    const hills = new THREE.InstancedMesh(hill, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 26);
    for (let index = 0; index < 26; index += 1) {
      const angle = (index / 26) * TAU + random() * 0.2;
      const radius = extent * 0.9 + 400 + random() * 300;
      const size = 160 + random() * 220;
      matrix.makeScale(size, size * (0.25 + random() * 0.25), size * (0.7 + random() * 0.5));
      matrix.setPosition(center.x + Math.cos(angle) * radius, -2, center.z + Math.sin(angle) * radius);
      hills.setMatrixAt(index, matrix);
      hills.setColorAt(index, color.setHSL(0.3 + random() * 0.05, 0.25, 0.32 + random() * 0.08));
    }
    scene.add(hills);
  }

  // ---- Công trình Meshy dọc đường (khu pit) ----
  // decor.pit.model = { url, length, yaw?, count? }: đặt count bản (InstancedMesh) nối nhau từ đầu dải pit, mỗi bản dài
  // `length` m dọc đường, mặt trước (+z của mô hình, xoay thêm yaw) quay vào đường. Tải xong thì cất pit dựng bằng code.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const modules = [];
  for (const entry of [decor.pit].filter((item) => item?.model?.url)) {
    const spec = entry.model;
    const pending = loader.loadAsync(spec.url).then((gltf) => {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = spec.length / size.x;
      const depth = size.z * scale;
      const startS = entry.from * track.length;
      let span = entry.to * track.length - startS;
      if (span <= 0) span += track.length;
      const count = Math.max(1, Math.min(spec.count ?? Infinity, Math.floor(span / spec.length)));
      const lead = (span - count * spec.length) / 2;
      const sign = entry.side === 'left' ? 1 : -1;
      const centerBox = box.getCenter(new THREE.Vector3());
      // Gốc mô hình: giữa đáy, x dọc đường, mặt trước +z.
      const base = new THREE.Matrix4().makeRotationY(spec.yaw || 0)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .multiply(new THREE.Matrix4().makeTranslation(-centerBox.x, -box.min.y, -centerBox.z));
      const placements = [];
      for (let index = 0; index < count; index += 1) {
        const point = track.pointAt(startS + lead + (index + 0.5) * spec.length);
        const wall = entry.side === 'left' ? track.wallLeft[point.index] : track.wallRight[point.index];
        const nx = point.tz * sign;
        const nz = -point.tx * sign;
        const d = wall + (entry.gap ?? 6) + depth / 2;
        const place = new THREE.Matrix4().makeRotationY(Math.atan2(-nx, -nz));
        place.setPosition(point.x + nx * d, 0, point.z + nz * d);
        placements.push(place.multiply(base));
      }
      const group = new THREE.Group();
      model.traverse((child) => {
        if (!child.isMesh) return;
        // Công trình: mặt nhám (ánh nắng không lóa trên ảnh màu nướng sẵn).
        // Ảnh màu Meshy nướng sẵn hơi xám dưới nắng: nâng nhẹ cho tường trắng ra trắng.
        if (child.material) {
          Object.assign(child.material, { roughness: 1, metalness: 0 });
          child.material.color?.setScalar(spec.bright ?? 1.25);
        }
        const mesh = new THREE.InstancedMesh(child.geometry, child.material, count);
        placements.forEach((place, index) => mesh.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(place, child.matrixWorld)));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      });
      scene.add(group);
      for (const mesh of standMeshes.get(entry) || []) mesh.visible = false;
      return group;
    }).catch((error) => {
      console.warn('Đua xe: không tải được công trình', spec.url, error?.message);
      return null;
    });
    modules.push(pending);
  }

  // ---- Xe ----
  const cars = new Map();
  let template = null;
  const ready = loader.loadAsync(modelUrl).then((gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // Mô hình gốc dài theo trục x, mũi xe ở phía −x: xoay để mũi nhìn về +z (h = 0).
    const alongX = size.x >= size.z;
    const holder = new THREE.Group();
    const scale = CAR_LENGTH / (alongX ? size.x : size.z);
    model.scale.setScalar(scale);
    const centerBox = box.getCenter(new THREE.Vector3());
    model.position.set(-centerBox.x * scale, -box.min.y * scale, -centerBox.z * scale);
    holder.add(model);
    holder.rotation.y = alongX ? (track.data.decor?.carYaw ?? Math.PI / 2) : 0;
    const outer = new THREE.Group();
    outer.add(holder);
    outer.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
    });
    template = outer;
    for (const car of cars.values()) dressCar(car);
    return true;
  }).catch((error) => {
    console.warn('Không tải được mô hình xe, dùng xe khối:', error?.message || error);
    return false;
  });

  function clearCarBody(car) {
    if (!car.body) return;
    car.root.remove(car.body);
    for (const resource of car.bodyResources) resource.dispose();
    car.bodyResources.clear();
  }

  function dressCar(car) {
    clearCarBody(car);
    const color = colors[car.color]?.hex || '#d8232a';
    if (template) {
      const body = template.clone(true);
      body.traverse((child) => {
        if (!child.isMesh || car.color === 0) return;
        child.material = tintMaterial(child.material, color);
        car.bodyResources.add(child.material);
      });
      car.body = body;
    } else {
      car.body = blockCar(color);
      car.body.traverse((child) => {
        if (!child.isMesh) return;
        car.bodyResources.add(child.geometry);
        car.bodyResources.add(child.material);
      });
    }
    car.root.add(car.body);
  }

  function ensureCar(id, info) {
    let car = cars.get(id);
    if (!car) {
      car = { id, color: info.color ?? 0, root: new THREE.Group(), body: null, bodyResources: new Set(), label: null, name: '', pitch: 0, roll: 0, lastSpeed: 0, lastH: 0 };
      scene.add(car.root);
      cars.set(id, car);
      dressCar(car);
    } else if (info.color !== undefined && info.color !== car.color) {
      car.color = info.color;
      dressCar(car);
    }
    const name = info.self ? '' : info.name || '';
    if (name !== car.name || (car.label && car.labelColor !== car.color)) {
      if (car.label) {
        car.root.remove(car.label);
        car.label.material.map.dispose();
        car.label.material.dispose();
        car.label = null;
      }
      car.name = name;
      car.labelColor = car.color;
      if (name) {
        car.label = labelSprite(name, colors[car.color]?.hex || '#fff');
        car.label.position.y = 1.7;
        car.root.add(car.label);
      }
    }
    return car;
  }

  // ---- Camera ----
  let focus = null;
  let mode = 'chase';
  const cameraPosition = new THREE.Vector3(center.x, 150, center.z + extent * 0.6);
  const cameraTarget = new THREE.Vector3(center.x, 0, center.z);
  const wanted = new THREE.Vector3();
  const look = new THREE.Vector3();
  const shadowInterval = lowPower ? 1 / 20 : 1 / 30;
  let shadowElapsed = shadowInterval;
  let shake = 0;
  let orbit = 0;
  let aspect = 1;
  // Góc máy đặt tay (chỉ cho máy quay clip giới thiệu): { pos, at, fov } thay camera bám xe / bay vòng.
  let override = null;
  let labels = true;
  const fogRange = [scene.fog.near, scene.fog.far];

  return {
    ready,
    scene,
    camera,
    renderer,
    // info: { x, z, h, speed, color, name, self, impact }
    setCar(id, info) {
      const car = ensureCar(id, info);
      const dt = 1 / 60;
      const accel = (info.speed - car.lastSpeed) / dt;
      const yawRate = wrap(info.h - car.lastH) / dt;
      car.lastSpeed = info.speed;
      car.lastH = info.h;
      // Chúi khi phanh, ngửa khi tăng tốc, nghiêng khi vào cua (rất nhẹ — xe đua thấp, cứng).
      car.pitch += (Math.max(-0.03, Math.min(0.03, -accel * 0.0012)) - car.pitch) * 0.15;
      car.roll += (Math.max(-0.035, Math.min(0.035, yawRate * info.speed * 0.00035)) - car.roll) * 0.15;
      car.root.position.set(info.x, 0, info.z);
      car.root.rotation.set(car.pitch, info.h, car.roll, 'YXZ');
      if (car.label) car.label.visible = labels;
      if (info.impact && focus === id) shake = Math.max(shake, info.impact);
      car.seen = true;
    },
    removeCar(id) {
      const car = cars.get(id);
      if (!car) return;
      scene.remove(car.root);
      clearCarBody(car);
      if (car.label) {
        car.label.material.map.dispose();
        car.label.material.dispose();
      }
      cars.delete(id);
    },
    carIds() { return [...cars.keys()]; },
    hasCar(id) { return cars.has(id); },
    lowerResolution() {
      const current = renderer.getPixelRatio();
      const next = Math.max(0.85, current - 0.25);
      if (next < current) renderer.setPixelRatio(next);
    },
    // Vị trí đang vẽ của một xe (máy quay đặt góc theo xe): { x, z, h, speed } hoặc null.
    carPose(id) {
      const car = cars.get(id);
      return car ? { x: car.root.position.x, z: car.root.position.z, h: car.root.rotation.y, speed: car.lastSpeed } : null;
    },
    setFocus(id) { focus = id; },
    setCameraMode(next) { mode = next; },
    get cameraMode() { return mode; },
    // Số đèn đỏ đang sáng (0–5).
    setLights(count) {
      lights.forEach((lamps, index) => {
        const on = index < count;
        for (const lamp of lamps) lamp.material.color.set(on ? '#ff2a1a' : '#3a0b0b');
      });
    },
    resize(width, height) {
      aspect = width / Math.max(1, height);
      renderer.setSize(width, height, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    // Chỉ cho máy quay: debugView([x, y, z], [x, y, z], fov) giữ camera ở góc đó; debugView(null) trả về camera bám xe.
    debugView(pos, at, fov) {
      override = pos ? { pos, at, fov } : null;
      if (override) {
        cameraPosition.set(...pos);
        cameraTarget.set(...at);
      }
      // Góc cao nhìn xa: đẩy sương ra để đường đua không bạc màu.
      const high = override && pos[1] > 30;
      scene.fog.near = high ? fogRange[0] * 3 : fogRange[0];
      scene.fog.far = high ? fogRange[1] * 2 : fogRange[1];
    },
    // Chỉ cho máy quay: ẩn / hiện bảng tên trên xe.
    debugLabels(on) {
      labels = Boolean(on);
      for (const car of cars.values()) if (car.label) car.label.visible = labels;
    },
    render(dt) {
      const car = focus ? cars.get(focus) : null;
      const portrait = aspect < 1;
      if (override) {
        camera.fov = override.fov || camera.fov;
      } else if (car) {
        const h = car.root.rotation.y;
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        const speed = Math.abs(car.lastSpeed);
        const far = mode === 'far';
        const back = (far ? 13 : portrait ? 8.2 : 7) + speed * 0.025;
        const up = (far ? 5.6 : portrait ? 3.1 : 2.6) + speed * 0.008;
        wanted.set(car.root.position.x - fx * back, up, car.root.position.z - fz * back);
        look.set(car.root.position.x + fx * (portrait ? 9 : 7), portrait ? 0.6 : 1.1, car.root.position.z + fz * (portrait ? 9 : 7));
        const follow = 1 - Math.exp(-dt * (far ? 5 : 9));
        cameraPosition.lerp(wanted, follow);
        cameraTarget.lerp(look, 1 - Math.exp(-dt * 14));
        camera.fov += ((portrait ? 72 : 58) + speed * (portrait ? 0.12 : 0.15) - camera.fov) * Math.min(1, dt * 3);
      } else {
        orbit += dt * 0.05;
        const radius = extent * 0.55;
        wanted.set(center.x + Math.cos(orbit) * radius, extent * 0.28, center.z + Math.sin(orbit) * radius);
        cameraPosition.lerp(wanted, 1 - Math.exp(-dt * 1.5));
        cameraTarget.lerp(center, 1 - Math.exp(-dt * 2));
        camera.fov += ((portrait ? 70 : 52) - camera.fov) * Math.min(1, dt * 2);
      }
      camera.updateProjectionMatrix();
      camera.position.copy(cameraPosition);
      if (shake > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.5;
        camera.position.y += (Math.random() - 0.5) * shake * 0.3;
        shake *= Math.exp(-dt * 6);
      }
      camera.lookAt(cameraTarget);
      // Bóng đổ bám theo chỗ camera đang nhìn.
      shadowElapsed += dt;
      if (shadowElapsed >= shadowInterval) {
        shadowElapsed %= shadowInterval;
        const anchor = car ? car.root.position : cameraTarget;
        sun.target.position.copy(anchor);
        sun.position.copy(anchor).add(sunOffset);
        renderer.shadowMap.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cars: cars.size, model: Boolean(template), pixelRatio: renderer.getPixelRatio() };
    },
    dispose() {
      for (const id of cars.keys()) this.removeCar(id);
      for (const texture of textures) texture.dispose();
      renderer.dispose();
    },
  };
}
