// Khu vui chơi ngoài sân. Hình là mô hình park.glb (scene: world.courtyard.park.model; 4 ghế xích đu đã cắt khỏi mô
// hình bằng scripts/park-model.mjs), ghế xích đu vẽ riêng ở đây để đu theo người ngồi. Xích đu / cầu tuột khai báo như
// ghế đá (world.courtyard.benches, kind 'swing' | 'slide', mỗi món hai chỗ) nên chọn chỗ đi qua bench.select. Dáng người
// tính theo giờ máy (Date.now) nên mọi máy thấy gần như cùng nhịp; hai chỗ của một món lệch pha:
//   swing: { pivotY, rope, seatX, seatWidth } — ghế ở x = ±seatX (local), treo dưới xà cao pivotY, dây dài rope.
//   slide: { track: { climb: [[x, z, y]…], deck: [x, z, y], chute: [[x, z, y]…], back: [[x, z]…] } } — leo, ngồi trên
//          sàn, trượt theo máng, ngồi ở cuối máng, đi vòng về. y là độ cao gốc nhân vật (mặt ngồi / bậc thang).
// Tọa độ "local" theo món, quay theo item.ry như localTransform của sân; +z là hướng mặt người ngồi xích đu.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const SWING_AMPLITUDE = 0.62;
const SWING_PERIOD = 2.9;
const SLIDE_CYCLE = 9;

const toWorld = (item, lx, lz) => {
  const ry = item.ry || 0;
  return { x: item.x + lx * Math.cos(ry) + lz * Math.sin(ry), z: item.z - lx * Math.sin(ry) + lz * Math.cos(ry) };
};
// Hướng mặt (ry của nhân vật, mặt nhìn theo −z của hình) khi đi theo hướng local (dx, dz).
const facing = (item, dx, dz) => {
  const ry = item.ry || 0;
  const wx = dx * Math.cos(ry) + dz * Math.sin(ry);
  const wz = -dx * Math.sin(ry) + dz * Math.cos(ry);
  return Math.atan2(-wx, -wz);
};

export function swingAngle(spot, seconds) {
  return SWING_AMPLITUDE * Math.sin((seconds / SWING_PERIOD) * Math.PI * 2 + (spot === 2 ? 1.9 : 0));
}

// Điểm trên đường gấp khúc [[x, z, y?]…] ở tỉ lệ k (0…1 theo chiều dài), kèm hướng đi (dx, dz) của đoạn đó.
function along(points, k) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1], (point[2] || 0) - (points[index][2] || 0)));
  let left = Math.min(1, Math.max(0, k)) * lengths.reduce((sum, length) => sum + length, 0);
  for (let index = 0; index < lengths.length; index += 1) {
    const [x0, z0, y0 = 0] = points[index];
    const [x1, z1, y1 = 0] = points[index + 1];
    if (left <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Math.min(1, left / lengths[index]) : 1;
      return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, y: y0 + (y1 - y0) * t, dx: x1 - x0, dz: z1 - z0 };
    }
    left -= lengths[index];
  }
  const [x, z, y = 0] = points.at(-1);
  return { x, z, y, dx: 0, dz: 1 };
}

// Dáng người đang chơi: { x, y, z, ry, sit, walking }. y là độ cao gốc nhân vật (mặt ghế khi ngồi).
export function playPose(item, spot, seconds) {
  if (item.kind === 'swing') {
    const angle = swingAngle(spot, seconds);
    const at = toWorld(item, (spot === 1 ? -1 : 1) * item.seatX, item.rope * Math.sin(angle));
    return { ...at, y: item.pivotY - item.rope * Math.cos(angle) + 0.03, ry: facing(item, 0, 1), sit: true, walking: false };
  }
  const track = item.track;
  if (!track) return null;
  const u = ((seconds / SLIDE_CYCLE) + (spot === 2 ? 0.5 : 0)) % 1;
  const pose = (point, sit, walking, dx = point.dx ?? 0, dz = point.dz ?? 1) => ({
    ...toWorld(item, point.x, point.z), y: point.y || 0, ry: facing(item, dx || 0, dz || (dx ? 0 : 1)), sit, walking,
  });
  const [deckX, deckZ, deckY] = track.deck;
  const chuteDir = { dx: track.chute.at(-1)[0] - track.chute[0][0], dz: track.chute.at(-1)[1] - track.chute[0][1] };
  if (u < 0.22) return pose(along(track.climb, u / 0.22), false, true);
  if (u < 0.3) return pose({ x: deckX, z: deckZ, y: deckY }, true, false, chuteDir.dx, chuteDir.dz);
  if (u < 0.43) {
    // Trượt: chậm lúc đầu rồi nhanh dần.
    const k = (u - 0.3) / 0.13;
    return pose(along(track.chute, k * k), true, false, chuteDir.dx, chuteDir.dz);
  }
  if (u < 0.5) return pose(along(track.chute, 1), true, false, chuteDir.dx, chuteDir.dz);
  return pose(along(track.back, (u - 0.5) / 0.5), false, true);
}

let loader = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

// Mô hình cảnh tĩnh: { src, x, z, ry, scale, y, lazyDistance? }. Khi có lazyDistance, chỉ bắt đầu tải lúc camera
// đến gần. Nhóm trả về có userData.lazyAsset.update(point) để cảnh gọi mỗi khung; lỗi tải thì cảnh thủ tục và chức
// năng vẫn còn.
export function loadStaticModel(root, model, label = 'cảnh') {
  if (!model?.src) return null;
  const group = new THREE.Group();
  group.position.set(model.x, model.y || 0, model.z);
  group.rotation.y = model.ry || 0;
  group.scale.setScalar(model.scale || 1);
  group.visible = false;
  root.add(group);
  let state = 'idle';
  const load = () => {
    if (state !== 'idle') return;
    state = 'loading';
    gltfLoader().loadAsync(model.src).then((gltf) => {
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      group.add(gltf.scene);
      group.visible = true;
      state = 'loaded';
    }).catch((error) => {
      state = 'failed';
      console.warn(`Không tải được mô hình ${label}: ${error.message}`);
    });
  };
  const lazyDistance = Math.max(0, Number(model.lazyDistance) || 0);
  group.userData.lazyAsset = {
    load,
    state: () => state,
    update(point) {
      if (state !== 'idle' || !point) return;
      if (Math.hypot(point.x - model.x, point.z - model.z) <= lazyDistance) load();
    },
  };
  if (!lazyDistance) load();
  return group;
}

// Mô hình khu vui chơi: y có thể âm để nền mô hình ngang mặt cỏ. Khi lỗi, ghế xích đu vẫn dùng được.
export function loadParkModel(root, model) {
  return loadStaticModel(root, model, 'khu vui chơi');
}

// Ghế xích đu (nhóm riêng để đu). Trả { id, kind, pivots } để engine đu ghế khi có người ngồi; cầu tuột không có
// phần động (hình nằm trong mô hình).
export function addPlayground({ root, item, materials }) {
  if (item.kind !== 'swing') return { id: item.id, kind: item.kind, pivots: [] };
  const width = item.seatWidth || 0.52;
  const pivots = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const at = toWorld(item, side * item.seatX, 0);
    pivot.position.set(at.x, item.pivotY, at.z);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = item.ry || 0;
    for (const x of [-width * 0.42, width * 0.42]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, item.rope, 5), materials.rope);
      rope.position.set(x, -item.rope / 2, 0);
      pivot.add(rope);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, width * 0.55), materials.seat);
    seat.position.y = -item.rope;
    seat.castShadow = true;
    pivot.add(seat);
    root.add(pivot);
    return pivot;
  });
  return { id: item.id, kind: 'swing', pivots };
}

export function playgroundMaterials() {
  return {
    rope: new THREE.MeshStandardMaterial({ color: '#d9a92e', roughness: 0.6, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 }),
  };
}

// Engine gọi mỗi khung: ghế có người thì đu theo nhịp người ngồi, ghế trống thì đung đưa chậm dần về yên.
export function updateSwings(rigs, occupied, seconds, dt) {
  for (const rig of rigs) {
    if (rig.kind !== 'swing') continue;
    rig.pivots.forEach((pivot, index) => {
      const key = `${rig.id}:${index + 1}`;
      // rotation.x = −góc: dây quay về +z khi góc dương (cùng chiều playPose).
      pivot.rotation.x = occupied.has(key) ? -swingAngle(index + 1, seconds) : pivot.rotation.x * Math.max(0, 1 - dt * 1.5);
    });
  }
}
