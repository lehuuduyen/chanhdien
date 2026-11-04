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
