// Chế độ nhập vai cho bộ vẽ chánh điện 3D: nhân vật của mình đi lại (W-A-S-D / phím mũi tên, cần điều khiển ảo,
// chạm xuống sàn để tự tìm đường), camera bám sau lưng, người khác đi theo vị trí server gom mỗi 200 ms,
// động tác quỳ / lạy 3 lạy / lạy 108 lạy. Nhân vật tạm dựng bằng hình khối từ bộ người ngồi; khi có mô hình .glb
// có khung xương thì thay phần avatar ở đây, phần điều khiển và đồng bộ giữ nguyên.
//
// Dùng: createTempleRenderer3D({ …, plugin: createExplorePlugin({ onMove, onArrive }) }) → renderer.plugin là api.
import { findPath, resolveMove } from './walk.mjs';
import { createGardenView } from './garden3d.mjs';
import { createMemorialView } from './memorial3d.mjs';
import { playPose, updateSwings } from './park3d.mjs';
import { buildChibiWalker, DANCE_STYLES, danceStyleOf } from './chibi3d.mjs';

const SEND_INTERVAL_MS = 200;
const BOW_CYCLE_S = { bow3: 3.6, bow108: 3.0 };
const BOW_COUNT = { bow3: 3, bow108: 108 };
const KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
// Giữ Shift (hoặc đẩy cần điều khiển gần hết cỡ) để chạy. Cần điều khiển giữ trạng thái chạy tới lúc thả
// tay, tránh đang chạy thẳng lại đổi thành đi bộ chỉ vì bán kính ngón tay hụt một chút lúc quẹo.
const RUN_JOYSTICK = 0.85;

// Hướng mặt từ vận tốc: phía trước của nhân vật là −z cục bộ.
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

// Góc trong khoảng [−π, π] (protocol chỉ nhận |ry| ≤ 7; xoay nhiều vòng không được cộng dồn).
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

// Chọn động tác tương tác từ giờ server của lần bấm: trộn bit để bấm cách nhau đều đặn vẫn ra động tác khác nhau; mọi máy
// tính cùng một kết quả.
// Kiểu nhún nhảy bằng code trong ✨ Tương tác chạy chừng này giây rồi đứng lại (như động tác trong file chạy một lần).
const ACT_CODE_S = 4;

function actIndex(at = 0) {
  let hash = Math.imul(Math.floor(Number(at) || 0) % 2_147_483_647, 2_654_435_761);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2_246_822_519);
  return (hash ^ (hash >>> 13)) >>> 0;
}

export function createExplorePlugin({ onMove, onHandBreak, onTapEmpty, onWalkerTap, onBenchTap, onGardenTap, onMemorialTap, onGuideTap, onMeritBoardTap, onPetTap, onNearbyChange, onNearbyChoreChange, onNearbyPetChange, onPlaceChange, gardenLabel, hintText } = {}) {
  return (ctx) => {
    const { THREE, canvas, root, camera, controls, world, courtyard, makeLabel, makeBubble, disposeSprite, reduceMotion } = ctx;
    const walk = world.walk;
    if (!walk) return null;

    // ---- Nhân vật đứng: thân trên của người ngồi + vạt áo dài + hai bàn chân lộ dưới vạt ----
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });
    const shadowGeometry = new THREE.CircleGeometry(0.32, 24);
    shadowGeometry.rotateX(-Math.PI / 2);
    const sunDirection = world.courtyard?.sun?.direction || [10, 18, 16];
    const shadowHorizontal = Math.hypot(sunDirection[0], sunDirection[2]) || 1;
    const shadowVector = { x: -sunDirection[0] / shadowHorizontal, z: -sunDirection[2] / shadowHorizontal };
    // Mõ gỗ đặt trên sàn trước mặt khi tụng kinh / gõ mõ, dùi cầm tay phải.
    const woodMaterial = new THREE.MeshStandardMaterial({ color: '#b5652b', roughness: 0.45, emissive: '#2a1004' });
    const slitMaterial = new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.4 });
    const fishGeometry = new THREE.SphereGeometry(0.13, 18, 12);
    const slitGeometry = new THREE.BoxGeometry(0.2, 0.016, 0.024);
    const malletGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8);
    const malletHeadGeometry = new THREE.SphereGeometry(0.042, 12, 10);

    // Đạo cụ cầm tay dựng bằng hình khối nhẹ. Mỗi người đang làm chỉ có một bộ; khi dừng sẽ huỷ geometry/material.
    function choreTool(kind) {
      const group = new THREE.Group();
      const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...options });
      const wood = material('#744226');
      const metal = material('#6d8790', { metalness: 0.55, roughness: 0.35 });
      const gold = material('#d5a23b', { metalness: 0.35, emissive: '#4d2a00', emissiveIntensity: 0.25 });
      const green = material('#4f8b45');
      const cloth = material('#f0d25f');
      const add = (geometry, mat, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        mesh.scale.set(...scale);
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
      };
      if (kind === 'sweep') {
        add(new THREE.CylinderGeometry(0.018, 0.022, 0.92, 7), wood, [0, 0, 0]);
        add(new THREE.BoxGeometry(0.42, 0.09, 0.18), material('#c79a54'), [0, -0.5, 0]);
      } else if (kind === 'water') {
        add(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 12), metal, [0, -0.12, 0]);
        add(new THREE.TorusGeometry(0.17, 0.025, 6, 16, Math.PI), metal, [0, 0.08, 0], [0, 0, Math.PI]);
        add(new THREE.CylinderGeometry(0.035, 0.07, 0.38, 8), metal, [0.22, -0.08, -0.02], [0, 0, -1.05]);
        add(new THREE.CylinderGeometry(0.075, 0.045, 0.08, 10), metal, [0.39, 0.02, -0.02], [0, 0, -1.05]);
      } else if (kind === 'light') {
        add(new THREE.TorusGeometry(0.14, 0.018, 6, 14, Math.PI), metal, [0, 0.17, 0], [0, 0, Math.PI]);
        add(new THREE.BoxGeometry(0.25, 0.3, 0.25), material('#ffd18a', { emissive: '#ff9f32', emissiveIntensity: 1.4 }), [0, -0.03, 0]);
        add(new THREE.ConeGeometry(0.2, 0.14, 4), gold, [0, 0.19, 0], [0, Math.PI / 4, 0]);
      } else if (kind === 'feed') {
        add(new THREE.CylinderGeometry(0.22, 0.16, 0.13, 14), wood, [0, -0.08, 0]);
        for (let index = 0; index < 6; index += 1) add(new THREE.SphereGeometry(0.025, 6, 5), gold, [((index % 3) - 1) * 0.06, 0, Math.floor(index / 3) * 0.05 - 0.025]);
      } else if (kind === 'clean') {
        add(new THREE.BoxGeometry(0.32, 0.025, 0.25), cloth, [0, -0.04, 0], [0.15, 0, 0.18]);
        add(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8), material('#72a9c7'), [0.2, -0.12, 0]);
      } else if (kind === 'tea') {
        add(new THREE.SphereGeometry(0.17, 12, 9), green, [0, -0.08, 0], [0, 0, 0], [1, 0.8, 1]);
        add(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 10), green, [0, 0.08, 0]);
        add(new THREE.TorusGeometry(0.18, 0.024, 6, 16, Math.PI), gold, [0, 0.07, 0.02], [0, 0, Math.PI]);
        add(new THREE.CylinderGeometry(0.025, 0.06, 0.28, 8), green, [0.19, -0.05, 0], [0, 0, -1.08]);
      }
      // Bình tưới và đèn có thân rộng; thu vừa bàn tay chibi để đạo cụ không che khuất người đang làm.
      const heldScale = kind === 'water' ? 0.52 : kind === 'light' ? 0.82 : 1;
      group.scale.setScalar(heldScale);
      group.userData.dispose = () => group.traverse((item) => {
        if (!item.isMesh) return;
        item.geometry.dispose();
        item.material.dispose();
      });
      return group;
    }

    // Lá khô bay khi quét và lá non bật lên khi tưới; các việc khác có hạt cá/tia sáng/hơi trà tương ứng.
    function choreEffect(kind) {
      const group = new THREE.Group();
      const leafKinds = ['sweep', 'water'].includes(kind);
      const count = kind === 'water' ? 16 : leafKinds ? 12 : 7;
      for (let index = 0; index < count; index += 1) {
        const waterDrop = kind === 'water' && index < 7;
        const leaf = kind === 'sweep' || (kind === 'water' && !waterDrop);
        const color = kind === 'sweep' ? ['#b86e2b', '#d1a13c', '#718f3d'][index % 3]
          : waterDrop ? '#76d3ed' : kind === 'water' ? ['#65ad45', '#8fca57'][index % 2]
            : kind === 'feed' ? '#d7a340' : kind === 'clean' ? '#fff2a3' : kind === 'tea' ? '#e5e0d2' : '#ffd36b';
        const mesh = new THREE.Mesh(
          leaf ? new THREE.SphereGeometry(0.055, 6, 4) : new THREE.SphereGeometry(waterDrop ? 0.025 : 0.03, 6, 4),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
        );
        if (leaf) mesh.scale.set(1.7, 0.35, 0.8);
        else if (waterDrop) mesh.scale.set(0.7, 1.8, 0.7);
        mesh.userData.phase = (index / count) * Math.PI * 2;
        mesh.userData.waterDrop = waterDrop;
        group.add(mesh);
      }
      group.userData.kind = kind;
      group.userData.dispose = () => group.traverse((item) => {
        if (!item.isMesh) return;
        item.geometry.dispose();
        item.material.dispose();
      });
      return group;
    }

    // Nhân vật chú tiểu (chibi): đầu to, mắt nhắm cười, áo tràng, tay chắp (chibi3d.mjs).
    function buildWalker(skin) {
      const chibi = buildChibiWalker(skin);
      const built = { group: chibi.figure };
      const { upper, skirt, feet, shins } = chibi;
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial.clone());
      shadow.position.y = 0.014;
      shadow.renderOrder = 2;
      const woodfish = new THREE.Group();
      const fish = new THREE.Mesh(fishGeometry, woodMaterial);
      fish.scale.set(1.35, 0.75, 1.05);
      fish.position.y = 0.1;
      const slit = new THREE.Mesh(slitGeometry, slitMaterial);
      slit.position.set(0, 0.145, -0.12);
      woodfish.add(fish, slit);
      woodfish.position.set(0, 0, -0.36);
      const mallet = new THREE.Group();
      const stick = new THREE.Mesh(malletGeometry, woodMaterial);
      stick.position.y = -0.14;
      const head = new THREE.Mesh(malletHeadGeometry, slitMaterial);
      head.position.y = -0.28;
      mallet.add(stick, head);
      mallet.position.set(0.11, 0.3, -0.16);
      woodfish.visible = false;
      mallet.visible = false;
      built.group.add(woodfish, mallet);
      return { figure: built.group, upper, skirt, feet, shins, shadow, woodfish, mallet, hips: chibi.hips, labelY: chibi.labelY, rig: chibi.rig, workRig: chibi.workRig };
    }

    const walkers = new Map();
    let choreStates = [];
    let selfId = null;
    let selfSeated = false;
    let spectator = false;

    function addWalker(item) {
      const group = new THREE.Group();
      // Bấm vào nhân vật thì biết là ai (thẻ thông tin người chơi).
      group.userData.walkerId = item.id;
      const parts = buildWalker(String(item.skin || 'c_man').replace(/^c_/, ''));
      group.add(parts.figure, parts.shadow);
      // Đổ bóng dưới nắng ngoài sân (renderer chỉ tính khi có nguồn sáng đổ bóng).
      parts.figure.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = true; });
      const label = makeLabel(item.name, item.me);
      label.position.y = parts.labelY;
      group.add(label);
      let status = null;
      if (item.status) {
        status = makeBubble(item.status, false);
        status.position.y = parts.labelY + 0.26;
        group.add(status);
      }
      root.add(group);
      const pos = item.pos || walk.spawn;
      const walker = {
        id: item.id, group, label, parts, name: item.name, skin: item.skin, me: Boolean(item.me), status, statusText: item.status || null,
        x: pos.x, z: pos.z, ry: pos.ry ?? 0, target: { x: pos.x, z: pos.z, ry: pos.ry ?? 0 },
        moving: false, phase: Math.random() * 6, emote: item.emote || null, emoteT: 0, bubble: null,
        danceStyle: danceStyleOf(String(item.skin || 'c_man').replace(/^c_/, '')),
        benchId: item.benchId || null, benchSpot: item.benchSpot || null, benchY: item.benchY || 0,
        chore: null, choreTool: null, choreEffect: null, choreOffset: 0, choreRy: 0,
      };
      group.position.set(walker.x, 0, walker.z);
      walkers.set(item.id, walker);
      return walker;
    }

    function removeWalker(id) {
      const walker = walkers.get(id);
      if (!walker) return;
      root.remove(walker.group);
      disposeSprite(walker.label);
      if (walker.status) disposeSprite(walker.status);
      if (walker.bubble) disposeSprite(walker.bubble.sprite);
      if (walker.choreTool) walker.choreTool.userData.dispose?.();
      if (walker.choreEffect) walker.choreEffect.userData.dispose?.();
      walker.parts.shadow.material.dispose();
      walkers.delete(id);
    }

    // ---- Điều khiển nhân vật của mình ----
    const keys = new Set();
    let joystick = { x: 0, y: 0 };
    let joystickRunning = false;
    let path = [];
    let arrive = null;
    let lastSentAt = 0;
    // Nắm tay: người đi theo tự đứng cách người dẫn HAND_GAP m về một bên (handSide ±1 theo trục ngang của người dẫn).
    const HAND_GAP = 0.55;
    let handBreakSent = false;
    const sentHistory = [];
    let sentMoving = false;

    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    let shift = false;
    function onKeyDown(event) {
      if (event.key === 'Shift') shift = true;
      if (!KEYS[event.code] || typing()) return;
      keys.add(event.code);
      path = [];
      arrive = null;
      event.preventDefault();
    }
    function onKeyUp(event) {
      if (event.key === 'Shift') shift = false;
      keys.delete(event.code);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => keys.clear());

    // Chạm (không kéo): người khác → thẻ thông tin, bồ đoàn → đi tới rồi ngồi (trang xử lý), sàn → tìm đường đi tới.
    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    function pickBenchAt(clientX, clientY) {
      if (!onBenchTap || !courtyard?.benchPickables?.length) return null;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(courtyard.benchPickables, false).find((item) => item.object.userData.benchId);
      return hit && world.courtyard?.benches?.find((item) => item.id === hit.object.userData.benchId);
    }
    let pointerStart = null;
    function onPointerDown(event) {
      pointerStart = { x: event.clientX, y: event.clientY };
    }
    function onPointerUp(event) {
      if (!pointerStart) return;
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (moved > 8) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
      if (onWalkerTap) {
        const others = [...walkers.values()].filter((walker) => walker.id !== selfId && walker.group.visible).map((walker) => walker.parts.figure);
        const hit = raycaster.intersectObjects(others, true)[0];
        if (hit) {
          let node = hit.object;
          while (node && node.userData.walkerId === undefined) node = node.parent;
          if (node) {
            onWalkerTap(node.userData.walkerId);
            return;
          }
        }
      }
      // Chó mèo là InstancedMesh; thân mỗi con mang petId theo instanceId. Chạm từ xa thì đi lại gần, chạm khi
      // đã ở gần sẽ mở ngay ba hành động tương tác.
      const petHit = courtyard?.animals?.pickables?.length
        ? raycaster.intersectObjects(courtyard.animals.pickables, false)[0]
        : null;
      const pet = courtyard?.animals?.petAtHit?.(petHit);
      const self = walkers.get(selfId);
      if (pet) {
        if (self && Math.hypot(pet.x - self.x, pet.z - self.z) <= 2.8) onPetTap?.({ id: pet.id, name: pet.name, type: pet.type });
        else if (self) api.walkTo({ x: pet.x, z: pet.z });
        return;
      }
      const seat = ctx.pickSeatAt(event.clientX, event.clientY);
      if (seat && self && Math.hypot(seat.x - self.x, seat.z - self.z) < NEAR) {
        ctx.onSeatClick?.(seat);
        return;
      }
      // Bảng hướng dẫn đặt trước mỗi khu. Bắt trước nền để chạm vào bảng không làm nhân vật chạy tới đó.
      if (onGuideTap && courtyard?.guidePickables?.length) {
        const hit = raycaster.intersectObjects(courtyard.guidePickables, false)[0];
        if (hit) {
          onGuideTap(hit.object.userData.zoneGuide);
          return;
        }
      }
      // Bảng vàng công đức ngoài sân mở cùng sổ công đức với bảng nhỏ trong chánh điện. Bắt trước nền để
      // thao tác chạm không bị hiểu thành lệnh đi bộ tới phía sau bảng.
      if (onMeritBoardTap && courtyard?.meritBoardPickables?.length) {
        const hit = raycaster.intersectObjects(courtyard.meritBoardPickables, false)[0];
        if (hit?.object.userData.meritBoard) {
          onMeritBoardTap();
          return;
        }
      }
      // Ô mộ ở Khu tưởng niệm.
      if (onMemorialTap && courtyard?.memorialPickables?.length) {
        const hit = raycaster.intersectObjects(courtyard.memorialPickables, false)[0];
        if (hit) {
          onMemorialTap({ slot: hit.object.userData.memorialGrave });
          return;
        }
      }
      // Luống vườn / quầy hạt giống.
      if (onGardenTap && courtyard?.gardenPickables?.length) {
        const hit = raycaster.intersectObjects(courtyard.gardenPickables, false)[0];
        if (hit) {
          onGardenTap(hit.object.userData.gardenShop ? { shop: true } : { plotId: hit.object.userData.gardenPlot });
          return;
        }
      }
      const bench = pickBenchAt(event.clientX, event.clientY);
      // Xích đu / cầu tuột: chạm từ xa cũng đi tới điểm chờ rồi chơi (món to, dễ nhìn thấy cả khu).
      if (bench && self && Math.hypot(bench.x - self.x, bench.z - self.z) < (bench.kind ? 14 : NEAR)) {
        onBenchTap(bench);
        return;
      }
      const point = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
      if (point) api.walkTo({ x: point.x, z: point.z });
      else onTapEmpty?.();
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    // Hướng đi theo camera: "lên" là hướng camera đang nhìn (chiếu xuống mặt sàn).
    const forward = new THREE.Vector3();
    function inputVector() {
      let x = joystick.x;
      let y = joystick.y;
      for (const code of keys) {
        x += KEYS[code][0];
        y += KEYS[code][1];
      }
      const length = Math.hypot(x, y);
      if (length < 0.15) return null;
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = { x: -forward.z, z: forward.x };
      const scale = Math.min(1, length) / length;
      return { x: (forward.x * y + right.x * x) * scale, z: (forward.z * y + right.z * x) * scale };
    }

    function stepSelf(self, dt, now) {
      if (spectator) return;
      let direction = inputVector();
      // Đang ngồi bồ đoàn: bấm đi thì đứng dậy ngay tại bồ đoàn (server rời ghế khi nhận vị trí đầu tiên).
      if (selfSeated) {
        if (!direction) return;
        selfSeated = false;
        cameraReady = false;
      }
      // Đang nắm tay và là người đi theo: tự đi cạnh người dẫn; tự bấm đi (cần điều khiển / phím) là buông tay.
      const leader = self.handWith && !self.handLead ? walkers.get(self.handWith) : null;
      let following = false;
      if (leader && direction) {
        if (!handBreakSent) {
          handBreakSent = true;
          onHandBreak?.();
        }
      } else if (leader && !path.length && !self.benchId) {
        const side = self.handSide || 1;
        const goalX = leader.x + Math.cos(leader.ry) * HAND_GAP * side;
        const goalZ = leader.z - Math.sin(leader.ry) * HAND_GAP * side;
        const dx = goalX - self.x;
        const dz = goalZ - self.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.06) {
          direction = { x: dx / distance, z: dz / distance, limit: distance };
          following = leader.moving || distance > 0.9;
        } else if (!leader.moving) self.ry = wrapAngle(self.ry + shortestAngle(self.ry, leader.ry) * Math.min(1, dt * 6));
      }
      if (direction && !following) path = [];
      if (!direction && path.length) {
        const next = path[0];
        const dx = next.x - self.x;
        const dz = next.z - self.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.08) {
          path.shift();
          if (!path.length && arrive) {
            const done = arrive;
            arrive = null;
            done();
          }
        } else direction = { x: dx / distance, z: dz / distance, limit: distance };
      }
      const moving = Boolean(direction);
      if (moving && self.benchId) {
        self.benchId = null;
        self.benchSpot = null;
        self.benchY = 0;
        cameraReady = false;
      }
      // Đi theo người dẫn: chạy khi người dẫn chạy hoặc bị bỏ lại xa.
      const running = moving && (shift || joystickRunning || (following && (leader.running || Math.hypot(leader.x - self.x, leader.z - self.z) > 1.4)));
      self.running = running;
      if (moving) {
        if (self.emote) self.emote = null;
        const speed = running ? walk.runSpeed || walk.speed * 2 : walk.speed;
        const step = Math.min(speed * dt * Math.min(1, Math.hypot(direction.x, direction.z)), direction.limit ?? Infinity);
        const length = Math.hypot(direction.x, direction.z) || 1;
        const next = resolveMove(walk, self, { x: self.x + (direction.x / length) * step, z: self.z + (direction.z / length) * step });
        const dx = next.x - self.x;
        const dz = next.z - self.z;
        self.x = next.x;
        self.z = next.z;
        if (Math.hypot(dx, dz) > 1e-4) self.ry = wrapAngle(self.ry + shortestAngle(self.ry, headingOf(dx, dz)) * Math.min(1, dt * 12));
        self.target = { x: self.x, z: self.z, ry: self.ry };
        // Camera đi theo: dời cả camera và tâm xoay cùng một đoạn để giữ góc người dùng đang xoay.
        camera.position.x += dx;
        camera.position.z += dz;
      }
      self.moving = moving;
      if ((moving && now - lastSentAt >= SEND_INTERVAL_MS) || (!moving && sentMoving)) {
        lastSentAt = now;
        sentMoving = moving;
        const sent = { x: Math.round(self.x * 100) / 100, z: Math.round(self.z * 100) / 100, ry: Math.round(self.ry * 100) / 100, moving };
        // Nhớ vị trí đã gửi vài giây: server gửi lại (trễ theo mạng) đúng vị trí này thì chỉ là tin vọng lại.
        sentHistory.push({ x: sent.x, z: sent.z, at: now });
        while (sentHistory.length && now - sentHistory[0].at > 4_000) sentHistory.shift();
        onMove?.(sent);
      }
    }

    // ---- Dáng: đi (nhún, bước chân), quỳ, lạy ----
    // Quỳ đúng kiểu ở chùa: hai đầu gối chạm sàn, đùi thẳng đứng, cẳng chân nằm phía sau, lưng thẳng, tay chắp.
    // Lạy: từ tư thế quỳ cúi rạp người về phía trước (trán gần sàn), hông lùi ngồi lên gót, rồi lên lại.
    // Nhún nhảy bằng code (5 kiểu, xem DANCE_STYLES): đổi vị trí / nghiêng / xoay cả thân, gật phần trên.
    function danceMove(walker, figure, upper, style = walker.danceStyle) {
      const t = walker.emoteT;
      if (style === 'sway') {
        figure.rotation.z = Math.sin(t * 5) * 0.16;
        figure.position.y = Math.abs(Math.sin(t * 5)) * 0.03;
      } else if (style === 'spin') {
        figure.rotation.y += (t * 5) % (Math.PI * 2);
        figure.position.y = Math.abs(Math.sin(t * 10)) * 0.04;
      } else if (style === 'hop') {
        figure.position.y = Math.max(0, Math.sin(t * 9)) * 0.16;
      } else if (style === 'nod') {
        upper.rotation.x = -Math.max(0, Math.sin(t * 4)) * 0.18;
        figure.position.y = Math.abs(Math.sin(t * 2)) * 0.015;
      } else {
        figure.position.y = Math.abs(Math.sin(t * 6.5)) * 0.08;
      }
    }

    function pose(walker, dt) {
      const { figure, upper, skirt, feet, shins, woodfish, mallet, hips, rig, workRig } = walker.parts;
      const STAND_HIP = hips.stand;
      const KNEEL_HIP = hips.kneel;
      workRig?.set(false);
      if (walker.benchId && !walker.playStand) {
        walker.phase += dt * 1.2;
        figure.position.y = walker.benchY;
        figure.rotation.z = 0;
        skirt.scale.y = 0.76;
        skirt.rotation.z = 0;
        upper.position.set(0, STAND_HIP * 0.76, 0);
        upper.rotation.set(0, 0, 0);
        rig?.pose({ hip: STAND_HIP * 0.76, sit: 1, dt });
        woodfish.visible = false;
        mallet.visible = false;
        shins.forEach((shin, index) => {
          const side = index ? 1 : -1;
          shin.visible = true;
          shin.position.set(side * 0.075, -0.09, -0.11);
          shin.rotation.set(0, 0, 0);
        });
        feet.forEach((foot, index) => {
          const side = index ? 1 : -1;
          foot.position.set(side * 0.075, -0.22, -0.13);
          foot.rotation.set(0, 0, 0);
        });
        walker.label.position.y = walker.parts.labelY + walker.benchY - 0.08;
        if (walker.status) walker.status.position.y = walker.label.position.y + 0.26;
        if (walker.bubble) walker.bubble.sprite.position.y = walker.label.position.y + 0.26 + walker.bubble.lift;
        return;
      }
      walker.phase += dt * (walker.moving ? (walker.running ? 14 : 9.5) : 1.2);
      let kneel = 0;
      let bow = 0;
      if (walker.emote) walker.emoteT += dt;
      else walker.emoteT = 0;
      // Nhún nhảy và tương tác (✨) là emote đứng (không quỳ); các emote khác quỳ / lạy / tụng.
      // Tương tác: mỗi lần bấm chọn ngẫu nhiên một động tác trong kho = các động tác có trong file nhân vật + 5 kiểu nhún
      // nhảy bằng code (DANCE_STYLES). Chọn theo giờ server của lần bấm nên ai xem cũng thấy cùng động tác; không lặp lại
      // động tác vừa làm. Động tác trong file chạy một lần; kiểu bằng code chạy ACT_CODE_S giây rồi đứng.
      const acting = walker.emote === 'act' && !walker.moving;
      if (acting && walker.actFor !== walker.emoteKey) {
        const count = (rig?.actCount || 0) + DANCE_STYLES.length;
        let choice = actIndex(walker.emoteKey) % count;
        if (choice === walker.actChoice) choice = (choice + 1) % count;
        walker.actFor = walker.emoteKey;
        walker.actChoice = choice;
      }
      const clips = rig?.actCount || 0;
      const act = acting && walker.actChoice < clips ? { index: walker.actChoice, key: walker.emoteKey || 0 } : null;
      const actStyle = acting && !act && walker.emoteT < ACT_CODE_S ? DANCE_STYLES[walker.actChoice - clips] : null;
      const dancing = walker.emote === 'dance' && !walker.moving;
      if (walker.emote && walker.emote !== 'dance' && walker.emote !== 'act') {
        kneel = Math.min(1, walker.emoteT / 0.6);
        const cycle = BOW_CYCLE_S[walker.emote];
        if (cycle) {
          const started = Math.max(0, walker.emoteT - 0.6);
          // Lạy xong số lạy thì quỳ yên.
          if (Math.floor(started / cycle) < BOW_COUNT[walker.emote]) bow = Math.sin(((started % cycle) / cycle) * Math.PI) ** 2;
        }
      }
      const stride = walker.moving && !reduceMotion && !kneel ? Math.sin(walker.phase) : 0;
      figure.position.y = walker.moving && !kneel ? Math.abs(Math.cos(walker.phase)) * 0.035 : 0;
      const hip = STAND_HIP + (KNEEL_HIP - STAND_HIP) * kneel - bow * 0.14;
      skirt.scale.y = hip / STAND_HIP;
      skirt.rotation.z = stride * 0.04;
      upper.position.y = hip;
      upper.position.z = bow * 0.08;
      upper.rotation.x = -bow * 1.25;
      upper.rotation.z = -stride * 0.03;
      figure.rotation.z = 0;
      // Nhân vật có điệu nhảy trong file thì rig chạy động tác đó; không thì nhún cả thân theo kiểu riêng của nhân vật.
      if (dancing && !rig?.hasDance && !reduceMotion) danceMove(walker, figure, upper);
      if (actStyle && !reduceMotion) danceMove(walker, figure, upper, actStyle);
      // Nhân vật mô hình .glb: gập đùi/cẳng chân theo cùng độ cao hông.
      // Nhân vật có khung xương (shop-…) chạy động tác đi/chạy theo moving/running, quỳ/lạy theo kneel/bow.
      rig?.pose({ hip, stride, kneel, bow, moving: walker.moving && !kneel, running: walker.running, dance: dancing, act, dt });
      // Nhãn tên và bong bóng hạ theo khi quỳ/lạy.
      walker.label.position.y = walker.parts.labelY - kneel * 0.12 - bow * 0.3;
      if (walker.status) walker.status.position.y = walker.label.position.y + 0.26;
      if (walker.bubble) walker.bubble.sprite.position.y = walker.label.position.y + 0.26 + walker.bubble.lift;
      const knelt = kneel > 0.5;
      // Tụng kinh / gõ mõ: quỳ, dùi gõ xuống mõ theo nhịp 0,7 giây.
      const chanting = walker.emote === 'chant' || walker.emote === 'woodfish';
      woodfish.visible = chanting && knelt;
      mallet.visible = chanting && knelt;
      if (chanting) {
        const beat = reduceMotion ? 0 : ((performance.now() % 700) / 700);
        const strike = beat < 0.25 ? Math.sin((beat / 0.25) * Math.PI) : 0;
        mallet.position.y = hip + 0.06;
        // Nhấc dùi lên rồi gõ xuống mặt mõ (đầu dùi chạm khe mõ ở cuối nhịp gõ).
        mallet.rotation.x = -0.35 - strike * 0.7;
      }
      shins.forEach((shin, index) => {
        const side = index ? 1 : -1;
        shin.visible = knelt;
        shin.position.set(side * 0.075, 0.05, 0.13);
        shin.rotation.set(Math.PI / 2, 0, 0);
      });
      // Đứng/đi: bàn chân dưới vạt áo; quỳ: bàn chân ở sau cẳng chân, lòng bàn chân ngửa lên.
      feet.forEach((foot, index) => {
        const side = index ? 1 : -1;
        if (knelt) {
          foot.position.set(side * 0.075, 0.05, 0.25);
          foot.rotation.x = -1.2;
        } else {
          foot.position.set(side * 0.075, 0.025, -0.04 + (index ? 1 : -1) * stride * 0.1);
          foot.rotation.x = 0;
        }
      });
      // Nắm tay: tay phía người kia giơ ngang ra nắm, tay còn lại đánh nhẹ theo bước chân (nhân vật khối có tay rời).
      const partner = walker.handWith && walkers.get(walker.handWith);
      if (partner && workRig && !walker.chore && !knelt && !partner.benchId) {
        const dx = partner.x - walker.x;
        const dz = partner.z - walker.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1.4) {
          const side = dx * Math.cos(walker.ry) - dz * Math.sin(walker.ry) >= 0 ? 1 : -1;
          const reach = Math.min(1.25, 0.75 + Math.max(0, distance - HAND_GAP) * 1.2);
          const hold = { x: 0.1, z: side * reach };
          const free = { x: -stride * 0.35, z: -side * 0.1 };
          workRig.set(true, side < 0 ? hold : free, side < 0 ? free : hold);
        }
      }
      // Công việc dùng cùng nhịp thời gian cho mọi người trên máy này. Hai tay rời thật sự cầm đạo cụ; mỗi loại
      // có biên độ riêng để nhìn ra đang quét, tưới, thắp đèn, rải thức ăn, lau tượng hay rót trà.
      if (walker.chore) {
        const phase = reduceMotion ? 0 : performance.now() / 420;
        const wave = Math.sin(phase);
        const lift = (Math.sin(phase * 0.5) + 1) / 2;
        figure.position.y = Math.abs(Math.cos(phase)) * 0.018;
        upper.rotation.x = walker.chore === 'sweep' ? 0.18 + Math.abs(wave) * 0.18 : 0.08;
        upper.rotation.z = wave * (walker.chore === 'clean' ? 0.16 : 0.05);
        const armWave = wave * 0.28;
        if (walker.chore === 'sweep') workRig?.set(true, { x: 0.95, z: -0.25 + armWave }, { x: 1.15, z: 0.25 + armWave });
        else if (walker.chore === 'water') workRig?.set(true, { x: 1.05, z: -0.22 }, { x: 1.05, z: 0.22 });
        else if (walker.chore === 'light') workRig?.set(true, { x: 0.82, z: -0.2 }, { x: 0.82, z: 0.2 });
        else if (walker.chore === 'feed') workRig?.set(true, { x: 0.85, z: -0.15 }, { x: 0.55 + lift * 0.65, z: 0.24 });
        else if (walker.chore === 'clean') workRig?.set(true, { x: 1.0, z: -0.2 + armWave }, { x: 1.0, z: 0.2 + armWave });
        else workRig?.set(true, { x: 0.95, z: -0.18 }, { x: 0.95, z: 0.18 });
        if (walker.choreTool) {
          walker.choreTool.position.set(0, 0.04, -0.3);
          walker.choreTool.rotation.set(0, 0, 0);
          if (walker.chore === 'sweep') walker.choreTool.rotation.set(0.12, 0, -0.28 + wave * 0.5);
          else if (walker.chore === 'water') {
            walker.choreTool.position.set(0, 0.11, -0.32);
            walker.choreTool.rotation.set(0, -0.12, -0.38 - lift * 0.24);
          }
          else if (walker.chore === 'light') walker.choreTool.position.y += Math.abs(wave) * 0.04;
          else if (walker.chore === 'feed') walker.choreTool.rotation.x = -0.2 + lift * 0.32;
          else if (walker.chore === 'clean') walker.choreTool.position.x = wave * 0.18;
          else if (walker.chore === 'tea') walker.choreTool.rotation.z = -0.18 + lift * 0.22;
        }
        if (walker.choreEffect) {
          walker.choreEffect.rotation.y = walker.ry;
          walker.choreEffect.children.forEach((particle) => {
            const p = (phase + particle.userData.phase) % (Math.PI * 2);
            const unit = p / (Math.PI * 2);
            if (walker.chore === 'sweep') particle.position.set(Math.sin(p) * 0.58, 0.05 + Math.abs(Math.sin(p * 2)) * 0.12, -0.42 + Math.cos(p) * 0.34);
            else if (walker.chore === 'water' && particle.userData.waterDrop) {
              const fall = (unit * 1.8) % 1;
              particle.position.set(0.32 + fall * 0.38, 0.48 - fall * 0.43, -0.34 + Math.sin(p) * 0.05);
            } else if (walker.chore === 'water') {
              particle.position.set(0.48 + Math.sin(p * 1.7) * 0.24, 0.04 + unit * 0.58, -0.38 + Math.cos(p) * 0.16);
            }
            else if (walker.chore === 'feed') particle.position.set(Math.sin(p) * 0.38, 0.12 + Math.sin(unit * Math.PI) * 0.48, -0.25 - unit * 0.5);
            else if (walker.chore === 'clean') particle.position.set(Math.sin(p) * 0.34, 0.42 + Math.cos(p * 2) * 0.25, -0.45);
            else if (walker.chore === 'tea') particle.position.set(Math.sin(p * 1.4) * 0.08, 0.35 + unit * 0.55, -0.34);
            else particle.position.set(Math.sin(p) * 0.2, 0.5 + Math.cos(p) * 0.2, -0.38);
            particle.rotation.set(p, p * 0.7, p * 1.3);
            particle.material.opacity = 0.35 + (1 - unit) * 0.65;
          });
        }
      }
    }


    const followTarget = new THREE.Vector3();
    const followCamera = world.camera.follow || {};
    const followDistance = followCamera.distance ?? 5.4;
    const followHeight = followCamera.height ?? 3.4;
    const followTargetHeight = followCamera.targetHeight ?? 1.0;
    const followOrbitDistance = Math.hypot(followDistance, followHeight - followTargetHeight);
    let cameraReady = false;
    let lastUpdate = 0;
    // ---- Vòng sáng chỗ chạm được: lại gần bồ đoàn / ghế đá còn trống, luống, ô mộ, bảng, chó mèo thì sáng lên ----
    const NEAR = 2.6;
    const seatTargets = [
      ...(world.seats || []).map((seat) => ({ kind: 'seat', id: seat.id, x: seat.x, z: seat.z, sx: 0.55, sz: 0.55, ry: 0 })),
      ...(world.courtyard?.benches || []).map((bench) => ({
        kind: 'bench', id: bench.id, x: bench.x, z: bench.z, ry: bench.ry || 0, seats: bench.seats || 2,
        sx: 1.35 * (bench.scale || 1), sz: 0.62 * (bench.scale || 1),
        // Xích đu / cầu tuột: vòng to theo cỡ món, sáng từ xa hơn (điểm chờ cách tâm 2–3 m).
        ...(bench.kind === 'swing' ? { play: 'swing', sx: 2.3, sz: 1.5, near: 3.6 } : {}),
        ...(bench.kind === 'slide' ? { play: 'slide', sx: 1.0, sz: 3.0, near: 4 } : {}),
      })),
    ];
    const choreTargets = world.courtyard?.chores || [];
    let nearbyChore = null;
    let nearbyChoreKey = '';
    function updateNearbyChore(self) {
      const next = !self || selfSeated || self.benchId || spectator ? null : choreTargets
        .map((target) => ({ target, distance: Math.hypot(target.x - self.x, target.z - self.z) }))
        .filter((item) => item.distance <= (item.target.radius || 2.6))
        .sort((a, b) => a.distance - b.distance)[0]?.target || null;
      nearbyChore = next;
      const key = next?.id || '';
      if (key !== nearbyChoreKey) {
        nearbyChoreKey = key;
        onNearbyChoreChange?.(next ? { id: next.id, kind: next.kind } : null);
      }
    }
    let nearbyPet = null;
    let nearbyPetKey = '';
    function updateNearbyPet(self) {
      const next = !self || selfSeated || self.benchId || spectator ? null : courtyard?.animals?.nearest?.(self.x, self.z, 2.8) || null;
      nearbyPet = next;
      const key = next?.id || '';
      if (key !== nearbyPetKey) {
        nearbyPetKey = key;
        onNearbyPetChange?.(next ? { id: next.id, name: next.name, type: next.type } : null);
      }
    }
    const gardenData = world.courtyard?.garden;
    if (gardenData) {
      const ring = (gardenData.bed || 2.6) * 0.68;
      for (const plot of gardenData.plots || []) seatTargets.push({ kind: 'plot', id: plot.id, x: plot.x, z: plot.z, sx: ring, sz: ring, ry: 0 });
      if (gardenData.shop) seatTargets.push({ kind: 'shop', id: 'shop', x: gardenData.shop.x, z: gardenData.shop.z, sx: 1.7, sz: 1.0, ry: gardenData.shop.ry || 0 });
    }
    const gardenView = gardenData ? createGardenView({ THREE, root, garden: gardenData, makeBubble, disposeSprite, labelFor: gardenLabel, reduceMotion }) : null;
    const gardenPoints = (gardenData?.fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
    const gardenBounds = gardenPoints.length ? {
      x: [Math.min(...gardenPoints.map(([x]) => x)) - 2.8, Math.max(...gardenPoints.map(([x]) => x)) + 0.5],
      z: [Math.min(...gardenPoints.map(([, z]) => z)) - 0.5, Math.max(...gardenPoints.map(([, z]) => z)) + 0.5],
    } : null;
    // Xích đu / cầu tuột (ghế có kind): dáng người tính theo thời gian ở park3d; playOccupied = chỗ đang có người.
    const playItems = new Map((world.courtyard?.benches || []).filter((bench) => bench.kind).map((bench) => [bench.id, bench]));
    const playOccupied = new Set();
    let selfPlay = null;
    let lastPlayFollow = null;
    const memorialData = world.courtyard?.memorial;
    // Chỗ chạm được khác cũng sáng vòng khi lại gần: ô mộ, bảng hướng dẫn, bảng vàng công đức (xa hơn chỗ ngồi
    // một chút để thấy từ lối đi). Chó mèo đi lại nên tính vòng theo con gần nhất mỗi khung (updateRings).
    if (memorialData) {
      const mound = memorialData.mound || { length: 2, width: 1.1 };
      for (const grave of memorialData.graves || []) {
        // Vòng nằm ngoài bệ đá (bệ dài length + 0.5, rộng width + 0.3; vòng trong = 0,8 vòng ngoài) để nấm mộ không che.
        seatTargets.push({ kind: 'grave', id: grave.id, x: grave.x - 0.1, z: grave.z, sx: (mound.length + 0.7) / 1.6, sz: (mound.width + 0.4) / 1.6, ry: 0, near: 3.6, y: 0.1 });
      }
    }
    for (const board of world.courtyard?.guideBoards || []) {
      seatTargets.push({ kind: 'guide', id: board.id, x: board.x, z: board.z, sx: ((board.width || 2.2) + 0.5) / 2, sz: 0.55, ry: board.ry || 0, near: 4 });
    }
    if (world.courtyard?.board) {
      const board = world.courtyard.board;
      seatTargets.push({ kind: 'merit', id: 'merit', x: board.x, z: board.z, sx: 1.25, sz: 0.55, ry: 0, near: 4 });
    }
    const memorialView = memorialData ? createMemorialView({ THREE, root, memorial: memorialData }) : null;
    const memorialPoints = (memorialData?.fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
    const memorialBounds = memorialPoints.length ? {
      x: [Math.min(...memorialPoints.map(([x]) => x)) - 0.5, Math.max(...memorialPoints.map(([x]) => x)) + 2.8],
      z: [Math.min(...memorialPoints.map(([, z]) => z)) - 0.5, Math.max(...memorialPoints.map(([, z]) => z)) + 0.5],
    } : null;
    let currentPlace = null;
    function placeOf(self) {
      if (!self) return null;
      const hall = world.hall;
      if (hall && self.x >= -hall.halfWidth && self.x <= hall.halfWidth && self.z >= hall.back && self.z <= hall.front) return 'hall';
      const pets = world.courtyard?.petZone?.area;
      if (pets && self.x >= pets.x[0] && self.x <= pets.x[1] && self.z >= pets.z[0] && self.z <= pets.z[1]) return 'pets';
      const park = world.courtyard?.park?.area;
      if (park && self.x >= park.x[0] - 2 && self.x <= park.x[1] && self.z >= park.z[0] && self.z <= park.z[1]) return 'park';
      if (gardenBounds && self.x >= gardenBounds.x[0] && self.x <= gardenBounds.x[1]
        && self.z >= gardenBounds.z[0] && self.z <= gardenBounds.z[1]) return 'garden';
      if (memorialBounds && self.x >= memorialBounds.x[0] && self.x <= memorialBounds.x[1]
        && self.z >= memorialBounds.z[0] && self.z <= memorialBounds.z[1]) return 'memorial';
      return 'courtyard';
    }
    function reportPlace(self) {
      const next = placeOf(self);
      if (next === currentPlace) return;
      currentPlace = next;
      onPlaceChange?.(next);
    }
    let occupancy = { seats: new Set(), benches: new Map() };
    let nearbySit = null;
    let nearbySitKey = '';
    const ringGeometry = new THREE.RingGeometry(0.8, 1, 48);
    ringGeometry.rotateX(-Math.PI / 2);
    // Trộn màu thường (không cộng sáng): trên cỏ xanh, cộng sáng làm vàng ngả xanh khó thấy.
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffd25a', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    const rings = Array.from({ length: 4 }, () => {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.visible = false;
      ring.renderOrder = 3;
      root.add(ring);
      return ring;
    });
    let hint = null;
    let hintLabel = '';
    function updateRings(self, time) {
      const free = (target) => (target.kind === 'seat' ? !occupancy.seats.has(target.id)
        : target.kind === 'bench' ? (occupancy.benches.get(target.id) || 0) < target.seats : true);
      const pet = self && !selfSeated && !self.benchId && !spectator ? courtyard?.animals?.nearest?.(self.x, self.z, 2.8) : null;
      const targets = pet ? [...seatTargets, { kind: 'pet', id: pet.id, x: pet.x, z: pet.z, sx: 0.6, sz: 0.6, ry: 0, near: 2.8 }] : seatTargets;
      const near = !self || selfSeated || self.benchId || spectator ? [] : targets
        .map((target) => ({ target, distance: Math.hypot(target.x - self.x, target.z - self.z) }))
        .filter((item) => item.distance < (item.target.near || NEAR) && free(item.target))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, rings.length);
      const pulse = reduceMotion ? 1 : 1 + Math.sin(time / 260) * 0.07;
      ringMaterial.opacity = reduceMotion ? 0.8 : 0.65 + Math.sin(time / 260) * 0.25;
      rings.forEach((ring, index) => {
        const item = near[index];
        ring.visible = Boolean(item);
        if (!item) return;
        // Gần hơn thì sáng rõ hơn một chút (vòng xa nhỏ, mờ).
        const fade = 1 - (item.distance / (item.target.near || NEAR)) * 0.25;
        ring.position.set(item.target.x, item.target.y ?? 0.03, item.target.z);
        ring.rotation.y = item.target.ry;
        ring.scale.set(item.target.sx * pulse * fade, 1, item.target.sz * pulse * fade);
      });
      // Chữ "Chạm để ngồi" trên chỗ gần nhất.
      // Ô mộ đã có mộ: chỉ sáng vòng, không thêm chữ (chữ che mặt bia).
      const top = near[0]?.target;
      const text = top && !(top.kind === 'grave' && memorialView?.grave(top.id)) ? hintText?.(top.play || top.kind) || '' : '';
      if (text !== hintLabel) {
        if (hint) {
          root.remove(hint);
          disposeSprite(hint);
          hint = null;
        }
        hintLabel = text;
        if (text) {
          hint = makeBubble(text, false);
          root.add(hint);
        }
      }
      const hintY = { bench: 1.5, plot: 3.3, shop: 2.9, grave: 1.7, guide: 2.4, merit: 2.9, pet: 1.1, swing: 2.9, slide: 2.6 }[near[0]?.target.play || near[0]?.target.kind] || 1.0;
      if (hint && near[0]) hint.position.set(near[0].target.x, hintY, near[0].target.z);
      nearbySit = near.find((item) => ['seat', 'bench'].includes(item.target.kind))?.target || null;
      const nextKey = nearbySit ? `${nearbySit.kind}:${nearbySit.id}` : '';
      if (nextKey !== nearbySitKey) {
        nearbySitKey = nextKey;
        onNearbyChange?.(nearbySit ? { kind: nearbySit.kind, id: nearbySit.id, ...(nearbySit.play ? { play: nearbySit.play } : {}) } : null);
      }
    }

    function update(frameDt, time) {
      // Bộ vẽ giới hạn mỗi khung 50 ms; đi lại tính theo thời gian thật (tối đa 250 ms) để máy chậm vẫn đi đúng tốc độ.
      const dt = lastUpdate ? Math.min((time - lastUpdate) / 1_000, 0.25) : frameDt;
      lastUpdate = time;
      const self = walkers.get(selfId);
      if (self) stepSelf(self, dt, time);
      reportPlace(self);
      updateRings(self, time);
      updateNearbyChore(self);
      updateNearbyPet(self);
      gardenView?.update(dt);
      memorialView?.update();
      playOccupied.clear();
      selfPlay = null;
      for (const walker of walkers.values()) {
        if (walker.id !== selfId) {
          const beforeX = walker.x;
          const beforeZ = walker.z;
          const dx = walker.target.x - walker.x;
          const dz = walker.target.z - walker.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 4) {
            const next = resolveMove(walk, walker, walker.target);
            walker.x = next.x;
            walker.z = next.z;
          } else if (distance > 0.01) {
            // Theo kịp cả khi người kia chạy; ở xa hơn bước chạy thì chạy theo.
            walker.running = distance > ((walk.runSpeed || walk.speed * 2) * 0.4);
            const step = Math.min(distance, Math.max((walk.runSpeed || walk.speed) * 1.15, distance * 4) * dt);
            const next = resolveMove(walk, walker, { x: walker.x + (dx / distance) * step, z: walker.z + (dz / distance) * step });
            walker.x = next.x;
            walker.z = next.z;
          }
          const movedX = walker.x - beforeX;
          const movedZ = walker.z - beforeZ;
          // Góc server có thể tới trễ hơn vị trí ở đoạn quẹo. Khi đang đi, hướng mặt phải lấy từ chuyển động
          // thật vừa nội suy; nếu không bot có thể bước tới nhưng vẫn quay mặt về hướng cũ.
          if (Math.hypot(movedX, movedZ) > 1e-4) walker.ry = headingOf(movedX, movedZ);
          else walker.ry = wrapAngle(walker.ry + shortestAngle(walker.ry, walker.target.ry) * Math.min(1, dt * 10));
          walker.moving = walker.targetMoving || distance > 0.05;
        }
        walker.group.visible = !(walker.id === selfId && selfSeated);
        const choreX = walker.choreOffset * Math.cos(walker.choreRy || 0);
        const choreZ = -walker.choreOffset * Math.sin(walker.choreRy || 0);
        walker.group.position.set(walker.x + choreX, 0, walker.z + choreZ);
        walker.parts.figure.rotation.y = walker.ry;
        // Đang chơi xích đu / cầu tuột: vị trí, độ cao, hướng mặt theo thời gian (park3d); gốc (walker.x/z) giữ ở chỗ
        // server cấp nên camera và va chạm không đổi.
        const playItem = walker.benchId && walker.benchSpot ? playItems.get(walker.benchId) : null;
        const play = playItem ? playPose(playItem, walker.benchSpot, Date.now() / 1_000) : null;
        if (play) {
          walker.group.position.set(play.x, play.y, play.z);
          walker.parts.figure.rotation.y = play.ry;
          playOccupied.add(`${walker.benchId}:${walker.benchSpot}`);
        }
        // Camera chỉ đi theo khi chơi cầu tuột (xích đu đu qua lại, camera lắc theo thì chóng mặt).
        if (walker.id === selfId) selfPlay = playItem?.kind === 'slide' ? play : null;
        const outside = Boolean(world.courtyard && walker.z > world.courtyard.ground.z[0] - 0.5);
        if (outside) {
          walker.parts.shadow.position.set(shadowVector.x * 0.42, 0.014, shadowVector.z * 0.42);
          walker.parts.shadow.rotation.y = Math.atan2(shadowVector.x, shadowVector.z);
          walker.parts.shadow.scale.set(0.76, 1, 2.6);
          walker.parts.shadow.material.opacity = 0.28;
        } else {
          walker.parts.shadow.position.set(0, 0.006, 0);
          walker.parts.shadow.rotation.y = 0;
          walker.parts.shadow.scale.set(1, 1, 1);
          walker.parts.shadow.material.opacity = 0.16;
        }
        if (play) {
          // Leo thang / đi vòng về: dáng đi bình thường; ngồi (đu, trên sàn, trượt): dáng ngồi ghế. Bóng dưới chân nằm
          // trên mặt đất, không bay theo người.
          const moving = walker.moving;
          walker.moving = play.walking;
          walker.playStand = !play.sit;
          walker.benchY = 0;
          pose(walker, dt);
          walker.moving = moving;
          walker.playStand = false;
          walker.parts.shadow.position.y = 0.014 - play.y;
        } else pose(walker, dt);
        if (walker.bubble && performance.now() - walker.bubble.at > 6_000) {
          walker.group.remove(walker.bubble.sprite);
          disposeSprite(walker.bubble.sprite);
          walker.bubble = null;
        }
      }
      if (courtyard?.playRigs?.length) updateSwings(courtyard.playRigs, playOccupied, Date.now() / 1_000, dt);
      // Camera bám sau lưng nhân vật. Khoảng cách/cao độ là dữ liệu scene; thien-default khóa zoom để nhân vật
      // luôn có cùng kích thước trên màn hình, nhưng vẫn cho xoay góc nhìn quanh nhân vật.
      if (self && !selfSeated) {
        // Đang chơi xích đu / cầu tuột: camera dời theo người (như khi đi bộ) để không bị thang / khung che.
        const followX = selfPlay ? selfPlay.x : self.x;
        const followZ = selfPlay ? selfPlay.z : self.z;
        if (selfPlay && lastPlayFollow && cameraReady) {
          camera.position.x += followX - lastPlayFollow.x;
          camera.position.z += followZ - lastPlayFollow.z;
          controls.target.x += followX - lastPlayFollow.x;
          controls.target.z += followZ - lastPlayFollow.z;
        }
        lastPlayFollow = selfPlay ? { x: followX, z: followZ } : null;
        followTarget.set(followX, followTargetHeight + (selfPlay ? selfPlay.y * 0.5 : 0), followZ);
        if (!cameraReady) {
          controls.target.copy(followTarget);
          // Cầu tuột: nhìn chéo từ phía bên (phía không có lối đi vòng) để thấy cả leo thang lẫn trượt xuống.
          const angle = self.ry + (selfPlay ? 0.9 : 0);
          camera.position.set(followX + Math.sin(angle) * followDistance, followHeight, followZ + Math.cos(angle) * followDistance);
          cameraReady = true;
        } else controls.target.lerp(followTarget, Math.min(1, dt * 8));
      }
    }

    const savedLimits = { min: controls.minDistance, max: controls.maxDistance };

    const api = {
      // Chỗ đã có người: { seats: [seatId], benches: { benchId: số người } } — chỗ đầy thì không sáng vòng.
      // Vườn Công Đức: luống từ server ([{ id, crop }]), hiệu ứng gieo / tưới / hái, vẽ lại nhãn khi đổi ngôn ngữ.
      setGarden(list) {
        gardenView?.setPlots(list);
      },
      // Khu tưởng niệm: [{ slot, grave | null }]; full = snapshot đầy đủ (ô không có trong danh sách là trống).
      setMemorial(list, options) {
        memorialView?.setGraves(list, options);
      },
      debugMemorial() {
        return memorialView?.debug() || null;
      },
      // Chỉ để kiểm tra: tọa độ màn hình (px, theo viewport) của một điểm trong cảnh.
      debugScreen(x, y, z) {
        const rect = canvas.getBoundingClientRect();
        const point = new THREE.Vector3(x, y, z).project(camera);
        return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height, inView: Math.abs(point.z) <= 1 };
      },
      // Server phát một snapshot chung; worker id quyết định ai đang có hoạt ảnh và mọi người dùng cùng nhịp.
      setChores(list = []) {
        choreStates = list;
        const byWorker = new Map();
        for (const chore of list) {
          const workers = [...(chore.workers || [])].sort();
          const target = choreTargets.find((item) => item.id === chore.id);
          workers.forEach((id, index) => byWorker.set(id, {
            kind: chore.kind,
            offset: (index - (workers.length - 1) / 2) * 0.68,
            ry: target?.ry || 0,
          }));
        }
        for (const walker of walkers.values()) {
          const info = byWorker.get(walker.id) || null;
          const next = info?.kind || null;
          walker.choreOffset = info?.offset || 0;
          walker.choreRy = info?.ry || 0;
          if (next === walker.chore) continue;
          if (walker.choreTool) {
            walker.parts.upper.remove(walker.choreTool);
            walker.choreTool.userData.dispose?.();
            walker.choreTool = null;
          }
          if (walker.choreEffect) {
            walker.group.remove(walker.choreEffect);
            walker.choreEffect.userData.dispose?.();
            walker.choreEffect = null;
          }
          walker.chore = next;
          if (next) {
            walker.choreTool = choreTool(next);
            walker.choreEffect = choreEffect(next);
            walker.parts.upper.add(walker.choreTool);
            walker.group.add(walker.choreEffect);
          }
        }
      },
      gardenEffect(plotId, kind, plantType) {
        gardenView?.effect(plotId, kind, plantType);
      },
      petInteraction(petId, action) {
        return courtyard?.animals?.interact?.(petId, action) || false;
      },
      // Vị trí hiện tại của mình (đang đứng / đi; null nếu đang ngồi hoặc chưa có nhân vật).
      selfPose() {
        const self = walkers.get(selfId);
        if (!self || selfSeated || self.benchId) return null;
        return { x: Math.round(self.x * 100) / 100, z: Math.round(self.z * 100) / 100, ry: Math.round(wrapAngle(self.ry) * 100) / 100 };
      },
      debugGarden() {
        return gardenView?.debug() || null;
      },
      relabelGarden(list) {
        gardenView?.relabel(list);
      },
      setOccupancy({ seats = [], benches = {} } = {}) {
        occupancy = { seats: new Set(seats), benches: new Map(Object.entries(benches)) };
      },
      // Nút DOM "Ngồi xuống" gọi hàm này; chỉ hoạt động khi bồ đoàn/ghế đá còn trống ở trong 2,6 m.
      activateNearby() {
        if (!nearbySit) return false;
        if (nearbySit.kind === 'seat') {
          const seat = world.seats?.find((item) => item.id === nearbySit.id);
          if (!seat) return false;
          ctx.onSeatClick?.(seat);
          return true;
        }
        const bench = world.courtyard?.benches?.find((item) => item.id === nearbySit.id);
        if (!bench || !onBenchTap) return false;
        onBenchTap(bench);
        return true;
      },
      // Danh sách người đang đứng/đi (không ngồi bồ đoàn): { id, name, skin, me, pos, emote }.
      setWalkers(list, { seatedSelf = false } = {}) {
        selfSeated = seatedSelf;
        const seen = new Set();
        for (const item of list) {
          seen.add(item.id);
          let walker = walkers.get(item.id);
          const wasBench = walker?.benchId || null;
          if (walker && (walker.skin !== item.skin || walker.name !== item.name)) {
            const keep = { x: walker.x, z: walker.z, ry: walker.ry };
            removeWalker(item.id);
            walker = addWalker({ ...item, pos: keep });
          }
          if (!walker) walker = addWalker(item);
          walker.benchId = item.benchId || null;
          walker.benchSpot = item.benchSpot || null;
          if ((item.handWith || null) !== (walker.handWith || null)) {
            walker.handWith = item.handWith || null;
            // Người đi theo đứng về phía mình đang đứng so với người dẫn (không vòng qua người kia).
            const lead = walker.handWith && walkers.get(walker.handWith);
            walker.handSide = lead ? ((walker.x - lead.x) * Math.cos(lead.ry) - (walker.z - lead.z) * Math.sin(lead.ry) >= 0 ? 1 : -1) : 1;
            if (item.me) handBreakSent = false;
          }
          walker.handLead = Boolean(item.handLead);
          walker.benchY = item.benchY || 0;
          if (item.me) selfId = item.id;
          if (item.benchId && item.pos) {
            // Chỗ ngồi nằm bên trong vùng va chạm của ghế: đặt thẳng theo spot server cấp, không nội suy qua collider.
            walker.x = item.pos.x;
            walker.z = item.pos.z;
            walker.ry = item.pos.ry ?? walker.ry;
            walker.target = { ...item.pos };
            walker.targetMoving = false;
            walker.moving = false;
            walker.emote = null;
            cameraReady = item.me ? false : cameraReady;
          } else if (item.me && wasBench && item.pos) {
            // Bấm Đứng: trở về điểm tiếp cận an toàn đã gửi trước khi ngồi, thay vì đứng trong thân ghế.
            walker.x = item.pos.x;
            walker.z = item.pos.z;
            walker.ry = item.pos.ry ?? walker.ry;
            walker.target = { ...item.pos };
            cameraReady = false;
          } else if (!item.me && item.pos) walker.target = { ...item.pos };
          if ((item.status || null) !== walker.statusText) api.setStatus(item.id, item.status || null);
          if (walker.emote !== (item.emote || null)) {
            walker.emote = item.emote || null;
            walker.emoteT = 0;
          }
        }
        for (const id of [...walkers.keys()]) if (!seen.has(id)) removeWalker(id);
        if (selfSeated) {
          cameraReady = false;
          controls.minDistance = savedLimits.min;
          controls.maxDistance = savedLimits.max;
        } else if (walkers.has(selfId)) {
          controls.minDistance = followCamera.lockZoom ? followOrbitDistance : 2;
          controls.maxDistance = followCamera.lockZoom ? followOrbitDistance : 12;
        }
        api.setChores(choreStates);
      },
      // Gói vị trí từ server (mỗi 200 ms). Bỏ qua của mình trừ khi server kéo lại xa (chống đi xuyên/nhanh).
      applyMoves(moves) {
        for (const move of moves) {
          const walker = walkers.get(move.id);
          if (!walker) continue;
          if (move.id === selfId) {
            // Vị trí của chính mình: bỏ qua tin vọng lại (trùng vị trí mình đã gửi, chỉ cũ hơn do độ trễ mạng; khi
            // chạy nhanh có thể lệch vài mét). Chỉ kéo về khi server thật sự sửa vị trí (chặn đi xuyên / quá nhanh).
            const echoed = sentHistory.some((item) => Math.abs(item.x - move.x) < 0.02 && Math.abs(item.z - move.z) < 0.02);
            if (!echoed && Math.hypot(walker.x - move.x, walker.z - move.z) > 1.5) {
              walker.x = move.x;
              walker.z = move.z;
              walker.ry = move.ry;
              walker.target = { x: move.x, z: move.z, ry: move.ry };
              walker.moving = false;
              path = [];
              arrive = null;
              // Lệnh đi nhanh do server duyệt là một hiệu chỉnh lớn hợp lệ: dựng lại camera sau lưng điểm mới,
              // nếu chỉ đổi nhân vật thì camera còn ở khu cũ và người dùng tưởng nút không hoạt động.
              cameraReady = false;
            }
            continue;
          }
          walker.target = { x: move.x, z: move.z, ry: move.ry };
          walker.targetMoving = move.m;
          if (move.m) walker.emote = null;
        }
      },
      // Nhãn trạng thái trên tên (vd: "Đang tụng Kinh A Di Đà"); null để bỏ.
      setStatus(id, text) {
        const walker = walkers.get(id);
        if (!walker || walker.statusText === text) return;
        if (walker.status) {
          walker.group.remove(walker.status);
          disposeSprite(walker.status);
          walker.status = null;
        }
        walker.statusText = text;
        if (text) {
          walker.status = makeBubble(text, false);
          walker.status.position.y = walker.label.position.y + 0.28;
          walker.group.add(walker.status);
        }
      },
      // at: giờ server của lần bấm (message emote), dùng chọn động tác tương tác ngẫu nhiên giống nhau trên mọi máy.
      emote(id, kind, at = 0) {
        const walker = walkers.get(id);
        if (!walker) return false;
        walker.emote = kind === 'stand' ? null : kind;
        walker.emoteKey = Number.isFinite(at) ? at : 0;
        walker.emoteT = 0;
        if (id === selfId) path = [];
        return true;
      },
      say(id, text) {
        const walker = walkers.get(id);
        if (!walker) return false;
        if (walker.bubble) {
          walker.group.remove(walker.bubble.sprite);
          disposeSprite(walker.bubble.sprite);
        }
        const chars = [...String(text).replace(/\s+/g, ' ').trim()];
        const sprite = makeBubble(chars.length > 40 ? `${chars.slice(0, 39).join('')}…` : chars.join(''), walker.me);
        // Người đứng sát (nắm tay, đứng cạnh) đang có bong bóng: đẩy bong bóng mới lên một bậc để hai câu không đè nhau.
        const now = performance.now();
        let crowded = 0;
        for (const other of walkers.values()) {
          if (other !== walker && other.bubble && now - other.bubble.at < 6_000 && Math.hypot(other.x - walker.x, other.z - walker.z) < 1.6) crowded += 1;
        }
        const lift = Math.min(2, crowded) * 0.3;
        sprite.position.y = walker.label.position.y + 0.26 + lift;
        walker.group.add(sprite);
        walker.bubble = { sprite, at: now, lift };
        return true;
      },
      // Đi tới một điểm (tìm đường quanh vật cản); then() chạy khi tới nơi (vd: ngồi xuống bồ đoàn).
      walkTo(point, then) {
        const self = walkers.get(selfId);
        if (!self || spectator) return false;
        if (selfSeated) {
          selfSeated = false;
          cameraReady = false;
        }
        path = findPath(walk, self, point);
        arrive = path.length ? then || null : null;
        if (!path.length && then) then();
        return path.length > 0;
      },
      setJoystick(x, y) {
        joystick = { x, y };
        const magnitude = Math.hypot(x, y);
        if (magnitude < 0.15) joystickRunning = false;
        else if (magnitude >= RUN_JOYSTICK) joystickRunning = true;
        if (magnitude > 0.15) path = [];
      },
      setSpectator(on) {
        spectator = Boolean(on);
      },
      position() {
        const self = walkers.get(selfId);
        return self ? { x: self.x, z: self.z, ry: self.ry } : null;
      },
      // Vừa bấm vào phòng (chưa có nhân vật từ server): đặt camera sẵn ở góc sau lưng chỗ sẽ xuất hiện, để không
      // nhìn cảnh tổng trong chánh điện rồi mới giật ra sân khi server trả lời.
      previewSpawn(pose = walk.spawn) {
        if (walkers.has(selfId) || !pose) return;
        const ry = pose.ry ?? 0;
        controls.target.set(pose.x, followTargetHeight, pose.z);
        camera.position.set(pose.x + Math.sin(ry) * followDistance, followHeight, pose.z + Math.cos(ry) * followDistance);
        cameraReady = false;
      },
      get spawn() {
        return { ...walk.spawn };
      },
      // Chỉ để kiểm tra khi phát triển.
      // Toạ độ màn hình (px) giữa thân một nhân vật — để kiểm tra bấm vào người khác.
      debugScreenOf(id) {
        const walker = walkers.get(id);
        if (!walker) return null;
        const point = new THREE.Vector3(walker.x, 0.6, walker.z).project(camera);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
      },
      debugScreenOfBench(id) {
        const bench = world.courtyard?.benches?.find((item) => item.id === id);
        if (!bench) return null;
        const point = new THREE.Vector3(bench.x, 0.5 * (bench.scale || 1), bench.z).project(camera);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
      },
      debugPets() {
        return courtyard?.animals?.positions?.() || [];
      },
      debugState() {
        return {
          selfId, selfSeated, spectator,
          camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          walkers: [...walkers.values()].map((item) => ({
            id: item.id, name: item.name, x: item.x, z: item.z, ry: item.ry,
            moving: item.moving, running: Boolean(item.running), benchId: item.benchId, benchSpot: item.benchSpot,
            emote: item.emote, visible: item.group.visible,
            // Nhún nhảy: 'clip' (điệu trong file .glb) hoặc kiểu nhún bằng code; lift/tilt để kiểm tra chuyển động.
            dance: item.emote === 'dance' ? (item.parts.rig?.hasDance ? 'clip' : item.danceStyle) : null,
            act: item.emote === 'act' && item.actChoice !== undefined
              ? (item.actChoice < (item.parts.rig?.actCount || 0) ? `clip ${item.actChoice + 1}/${item.parts.rig.actCount}` : DANCE_STYLES[item.actChoice - (item.parts.rig?.actCount || 0)])
              : null,
            lift: Math.round(item.parts.figure.position.y * 1000) / 1000, tilt: Math.round(item.parts.figure.rotation.z * 1000) / 1000,
          })),
        };
      },
    };

    // Vật mẫu để biên dịch sẵn shader lúc nạp cảnh (renderer.compile chỉ biên dịch vật đang hiện): mỗi kiểu nhân
    // vật (cả mõ, dùi), nhãn tên, bong bóng, vòng sáng. Không có thì lần đầu vào phòng trình duyệt dừng vài giây.
    function warmup() {
      const group = new THREE.Group();
      const sprites = [];
      ['man', 'woman', 'child', 'granny', 'nun', 'monk'].forEach((skin, index) => {
        const parts = buildWalker(skin);
        parts.woodfish.visible = true;
        parts.mallet.visible = true;
        parts.figure.position.set(index, 0, 0);
        parts.figure.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = true; });
        group.add(parts.figure, parts.shadow);
      });
      sprites.push(makeLabel('·', true), makeLabel('·', false), makeBubble('·', true), makeBubble('·', false));
      group.add(...sprites, new THREE.Mesh(ringGeometry, ringMaterial), ...(gardenView?.warmupObjects() || []));
      return {
        group,
        // Chỉ bỏ ảnh chữ; giữ material để three không xóa chương trình shader vừa biên dịch (hết người dùng là xóa).
        done() {
          group.removeFromParent();
          for (const sprite of sprites) sprite.material.map?.dispose();
        },
      };
    }

    return {
      ownsCamera: true,
      handlesTaps: true,
      update,
      warmup,
      api,
      dispose() {
        onNearbyChange?.(null);
        onNearbyChoreChange?.(null);
        onNearbyPetChange?.(null);
        onPlaceChange?.(null);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        for (const id of [...walkers.keys()]) removeWalker(id);
        shadowGeometry.dispose();
        shadowMaterial.dispose();
      },
    };
  };
}
