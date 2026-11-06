// Phần thuần của chế độ 3D: kiểm tra bố cục thế giới (mét) và giới hạn camera; chạy được trên Node để test.
import { validateWalk } from './walk.mjs';

export function validateWorld(scene) {
  const errors = [];
  const world = scene.world;
  if (!world) return { ok: true, errors };
  if (!Array.isArray(world.seats)) return { ok: false, errors: ['world.seats bắt buộc'] };
  const ids2d = new Set((scene.seats || []).map((seat) => seat.id));
  const ids = new Set();
  for (const seat of world.seats) {
    if (!Number.isFinite(seat.x) || !Number.isFinite(seat.z)) errors.push(`ghế 3D ${seat.id} thiếu toạ độ`);
    if (ids.has(seat.id)) errors.push(`trùng ghế 3D ${seat.id}`);
    ids.add(seat.id);
    if (ids2d.size && !ids2d.has(seat.id)) errors.push(`ghế 3D ${seat.id} không có trong cảnh 2D`);
  }
  for (const id of ids2d) if (!ids.has(id)) errors.push(`ghế ${id} chưa có vị trí 3D`);
  // Bồ đoàn rộng ~0,7 m: hai chỗ ngồi phải cách nhau tối thiểu 1 m.
  for (let i = 0; i < world.seats.length; i += 1) {
    for (let j = i + 1; j < world.seats.length; j += 1) {
      const [a, b] = [world.seats[i], world.seats[j]];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1) errors.push(`ghế 3D ${a.id} và ${b.id} quá gần`);
    }
  }
  const bounds = world.camera?.bounds;
  if (bounds) {
    for (const seat of world.seats) {
      if (seat.x < bounds.x[0] || seat.x > bounds.x[1] || seat.z < bounds.z[0] || seat.z > bounds.z[1]) {
        errors.push(`ghế 3D ${seat.id} nằm ngoài chánh điện`);
      }
    }
  }
  const follow = world.camera?.follow;
  if (follow) {
    if (![follow.distance, follow.height, follow.targetHeight].every(Number.isFinite)
      || follow.distance <= 0 || follow.height <= follow.targetHeight) {
      errors.push('world.camera.follow cần distance > 0 và height > targetHeight');
    }
    if (follow.lockZoom !== undefined && typeof follow.lockZoom !== 'boolean') errors.push('world.camera.follow.lockZoom phải là boolean');
    if (follow.lockPan !== undefined && typeof follow.lockPan !== 'boolean') errors.push('world.camera.follow.lockPan phải là boolean');
  }
  const bodhi = world.courtyard?.bodhi;
  if (bodhi?.projectId !== undefined) {
    if (typeof bodhi.projectId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(bodhi.projectId)) {
      errors.push('world.courtyard.bodhi.projectId không hợp lệ');
    }
    const scales = bodhi.stageScales;
    if (!Array.isArray(scales) || scales.length !== 5 || scales.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || scales.some((value, index) => index > 0 && value < scales[index - 1])) {
      errors.push('world.courtyard.bodhi.stageScales cần 5 số tăng dần từ 0 đến 1');
    }
  }
  const pond = world.courtyard?.pond;
  if (pond?.projectId !== undefined) {
    if (typeof pond.projectId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(pond.projectId)) {
      errors.push('world.courtyard.pond.projectId không hợp lệ');
    }
    const visibility = pond.stageVisibility;
    const keys = ['water', 'rocks', 'lotus', 'fish'];
    if (!visibility || Object.keys(visibility).length !== keys.length
      || !keys.every((key) => Number.isSafeInteger(visibility[key]) && visibility[key] >= 0 && visibility[key] <= 4)) {
      errors.push('world.courtyard.pond.stageVisibility cần đủ water/rocks/lotus/fish từ 0 đến 4');
    }
  }
  const guideBoards = world.courtyard?.guideBoards;
  if (guideBoards !== undefined) {
    const allowed = new Set(['hall', 'courtyard', 'garden', 'pets']);
    const guideIds = new Set();
    if (!Array.isArray(guideBoards) || guideBoards.length !== allowed.size) {
      errors.push('world.courtyard.guideBoards cần đủ 4 bảng hall/courtyard/garden/pets');
    } else {
      for (const board of guideBoards) {
        if (!allowed.has(board.id) || guideIds.has(board.id)) errors.push(`bảng hướng dẫn ${board.id || '?'} không hợp lệ hoặc bị trùng`);
        guideIds.add(board.id);
        if (![board.x, board.z, board.ry].every(Number.isFinite)) errors.push(`bảng hướng dẫn ${board.id || '?'} thiếu toạ độ`);
        if (typeof board.sign !== 'string' || !board.sign.trim() || board.sign.length > 40) errors.push(`bảng hướng dẫn ${board.id || '?'} thiếu nội dung ngắn`);
      }
      for (const id of allowed) if (!guideIds.has(id)) errors.push(`thiếu bảng hướng dẫn ${id}`);
    }
  }
  const petZone = world.courtyard?.petZone;
  const animals = world.courtyard?.animals;
  if (petZone !== undefined || animals !== undefined) {
    const validRange = (range) => Array.isArray(range) && range.length === 2
      && range.every(Number.isFinite) && range[0] < range[1];
    if (!petZone || !validRange(petZone.area?.x) || !validRange(petZone.area?.z)
      || !Array.isArray(petZone.fence) || petZone.fence.length < 4
      || typeof petZone.sign !== 'string' || !petZone.sign.trim() || petZone.sign.length > 40) {
      errors.push('world.courtyard.petZone thiếu khu vực, hàng rào hoặc bảng tên hợp lệ');
    }
    const ids = new Set();
    if (!Array.isArray(animals) || animals.length < 1 || animals.length > 20) {
      errors.push('world.courtyard.animals cần từ 1 đến 20 thú cưng');
    } else {
      for (const animal of animals) {
        if (typeof animal.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(animal.id) || ids.has(animal.id)) {
          errors.push(`thú cưng ${animal.id || '?'} có id không hợp lệ hoặc bị trùng`);
        }
        if (typeof animal.name !== 'string' || !animal.name.trim() || animal.name.length > 40) errors.push(`thú cưng ${animal.id || '?'} thiếu tên`);
        if (!['dog', 'cat'].includes(animal.type)) errors.push(`thú cưng ${animal.id || '?'} có loại không hợp lệ`);
        if (![animal.x, animal.z].every(Number.isFinite) || !validRange(animal.area?.x) || !validRange(animal.area?.z)) {
          errors.push(`thú cưng ${animal.id || '?'} thiếu toạ độ hoặc vùng đi lại`);
        }
        // Thú có mô hình riêng: file .glb trong /models/pets/, chiều cao đứng 0,15–1,5 m.
        if (animal.model !== undefined && (typeof animal.model !== 'string' || !/^\/models\/pets\/[a-z0-9-]{1,64}\.glb$/.test(animal.model)
          || !Number.isFinite(animal.height) || animal.height < 0.15 || animal.height > 1.5
          || (animal.modelRy !== undefined && !Number.isFinite(animal.modelRy)))) {
          errors.push(`thú cưng ${animal.id || '?'} có mô hình không hợp lệ`);
        }
        ids.add(animal.id);
      }
    }
  }
  const chores = world.courtyard?.chores;
  if (chores !== undefined) {
    const kinds = new Set(['sweep', 'water', 'light', 'feed', 'clean', 'tea']);
    const ids = new Set();
    const seenKinds = new Set();
    if (!Array.isArray(chores) || chores.length !== kinds.size) {
      errors.push('world.courtyard.chores cần đủ 6 công việc trong chùa');
    } else {
      for (const chore of chores) {
        if (typeof chore.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(chore.id) || ids.has(chore.id)) {
          errors.push(`công việc ${chore.id || '?'} có id không hợp lệ hoặc bị trùng`);
        }
        if (!kinds.has(chore.kind) || seenKinds.has(chore.kind)) errors.push(`công việc ${chore.id || '?'} có loại không hợp lệ hoặc bị trùng`);
        if (![chore.x, chore.z, chore.ry, chore.radius].every(Number.isFinite) || chore.radius < 1 || chore.radius > 5) {
          errors.push(`công việc ${chore.id || '?'} thiếu toạ độ hoặc bán kính hợp lệ`);
        }
        ids.add(chore.id);
        seenKinds.add(chore.kind);
      }
      for (const kind of kinds) if (!seenKinds.has(kind)) errors.push(`thiếu công việc ${kind}`);
    }
  }
  errors.push(...validateWalk(world.walk));
  return { ok: errors.length === 0, errors };
}

// Góc mặc định: camera lùi đủ xa để bề ngang khu bồ đoàn (frame.width, mét) lọt trong góc nhìn ngang, nhìn chếch
// xuống một góc frame.elevation (radian). Màn dọc (điện thoại) dùng góc nhìn rộng hơn để không phải lùi quá xa.
export function defaultCameraFor(camera, aspect) {
  const fov = aspect < 0.8 ? 62 : 48;
  const halfHorizontal = Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  const { center, width, elevation } = camera.frame;
  const distance = Math.min(camera.maxDistance, Math.max(camera.minDistance, width / 2 / Math.tan(halfHorizontal)));
  const position = {
    x: center[0],
    y: center[1] + distance * Math.sin(elevation),
    z: center[2] + distance * Math.cos(elevation),
  };
  return { fov, position: clampToBounds(position, camera.bounds), target: { x: center[0], y: center[1], z: center[2] } };
}

// Giữ camera trong chánh điện (không xuyên tường, không xuống dưới sàn).
export function clampToBounds(position, bounds) {
  const clamp = (value, [min, max]) => Math.min(Math.max(value, min), max);
  return { x: clamp(position.x, bounds.x), y: clamp(position.y, bounds.y), z: clamp(position.z, bounds.z) };
}
