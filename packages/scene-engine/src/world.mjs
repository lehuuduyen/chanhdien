// Phần thuần của chế độ 3D: kiểm tra bố cục thế giới (mét) và giới hạn camera; chạy được trên Node để test.
import { validateWalk } from './walk.mjs';

// Loại thú ngoài sân: chó mèo (dựng bằng khối hoặc mô hình) và thú Nông trại nhỏ (mô hình Meshy).
const ANIMAL_TYPES = ['dog', 'cat', 'rabbit', 'duck', 'goat', 'pig', 'deer', 'pony'];

// Dữ liệu một vùng phong cảnh (scenes/<scene>/themes/<vùng>.json, dựng ở landscape3d.mjs). Chỉ kiểm tra dạng: tên
// kiểu (cây, vật rải, núi, đất) do bộ đồ landscape/<vùng>.mjs hoặc landscape/common.mjs định nghĩa, test
// themes.test.mjs kiểm tra kiểu có thật. Bố cục đi lại không nằm trong dữ liệu vùng nên vùng nào cũng không đổi được.
const THEME_KEYS = ['sky', 'fog', 'light', 'field', 'lawn', 'colors', 'mountains', 'trees', 'treeScale', 'pines', 'scatter', 'temple'];
const THEME_COLOR_KEYS = ['roof', 'wall', 'brick', 'pillar'];
const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const isKind = (value) => typeof value === 'string' && /^[a-z0-9-]{1,32}$/.test(value);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function validateTheme(name, theme) {
  const errors = [];
  const at = `vùng ${name}`;
  if (!isKind(name) || name === 'default') return [`${at}: tên vùng không hợp lệ`];
  if (!isObject(theme)) return [`${at}: dữ liệu phải là object`];
  for (const key of Object.keys(theme)) if (!THEME_KEYS.includes(key)) errors.push(`${at}: khóa ${key} không hỗ trợ`);
  for (const key of ['sky', 'light', 'lawn', 'colors', 'mountains', 'temple']) {
    if (theme[key] !== undefined && !isObject(theme[key])) errors.push(`${at}: ${key} phải là object`);
  }
  const colors = [
    ['sky.top', theme.sky?.top], ['sky.horizon', theme.sky?.horizon], ['fog', theme.fog],
    ['light.sun', theme.light?.sun], ['light.sky', theme.light?.sky], ['light.ground', theme.light?.ground],
    ['lawn.tint', theme.lawn?.tint],
    ...THEME_COLOR_KEYS.map((key) => [`colors.${key}`, theme.colors?.[key]]),
  ];
  for (const [key, value] of colors) if (value !== undefined && !isHex(value)) errors.push(`${at}: ${key} phải là màu #rrggbb`);
  if (isObject(theme.colors)) for (const key of Object.keys(theme.colors)) if (!THEME_COLOR_KEYS.includes(key)) errors.push(`${at}: colors.${key} không hỗ trợ`);
  for (const key of ['field', 'trees', 'pines']) if (theme[key] !== undefined && !isKind(theme[key])) errors.push(`${at}: ${key} không phải tên kiểu hợp lệ`);
  if (theme.lawn?.surface !== undefined && !isKind(theme.lawn.surface)) errors.push(`${at}: lawn.surface không phải tên kiểu hợp lệ`);
  if (theme.treeScale !== undefined && (!Number.isFinite(theme.treeScale) || theme.treeScale < 0.5 || theme.treeScale > 2.5)) {
    errors.push(`${at}: treeScale cần số từ 0,5 đến 2,5`);
  }
  const mountains = theme.mountains;
  if (isObject(mountains) && (!isKind(mountains.shape)
    || (mountains.colors !== undefined && (!Array.isArray(mountains.colors) || !mountains.colors.length || mountains.colors.length > 4 || !mountains.colors.every(isHex))))) {
    errors.push(`${at}: mountains cần shape hợp lệ và 1–4 màu`);
  }
  if (theme.scatter !== undefined && (!Array.isArray(theme.scatter) || theme.scatter.length > 8
    || theme.scatter.some((item) => !isKind(item?.kind) || !Number.isInteger(item.count) || item.count < 0 || item.count > 200))) {
    errors.push(`${at}: scatter cần tối đa 8 nhóm { kind, count 0–200 }`);
  }
  // band: chỉ rải cách tường sân từ band[0] tới band[1] mét.
  for (const item of Array.isArray(theme.scatter) ? theme.scatter : []) {
    const band = item?.band;
    if (band !== undefined && (!Array.isArray(band) || band.length !== 2 || !band.every(Number.isFinite) || band[0] < 0 || band[1] <= band[0] || band[1] > 120)) {
      errors.push(`${at}: scatter.band cần [gần, xa] mét, 0 ≤ gần < xa ≤ 120`);
    }
  }
  // Tham số chùa (do bộ đồ của vùng đọc): JSON nhỏ, chỉ số / chữ / bool / màu.
  if (isObject(theme.temple) && JSON.stringify(theme.temple).length > 2000) errors.push(`${at}: temple quá lớn (tối đa 2000 ký tự JSON)`);
  return errors;
}

// Lớp điểm đặc trưng một tiểu bang đặt lên cảnh vùng (scenes/<scene>/states/<mã>.json, dựng ở landscape3d.mjs, kế hoạch
// KE_HOACH_BANG.md). Chỉ kiểm tra dạng; kiểu có thật do test states.test.mjs kiểm tra.
// - landmarks: tối đa 6 điểm nhìn xa { kind, side: gate | east | west | back, distance (m tính từ tường sân), offset (m,
//   lệch dọc tường), scale, haze (0–1: phần sương chịu), params (tham số riêng cho kiểu, JSON nhỏ) }.
// - scatter: tối đa 3 nhóm vật rải ngoài tường như dữ liệu vùng.
// - hide: ẩn phần của vùng mà cảnh bang thay thế ('mountains').
// - clear: không rải vật của vùng ở phía `side` cách tường từ `from` mét trở ra (vd. chỗ có biển của bang).
export const STATE_SIDES = ['gate', 'east', 'west', 'back'];
const STATE_KEYS = ['landmarks', 'scatter', 'hide', 'clear'];
export function validateState(code, state) {
  const errors = [];
  const at = `bang ${code}`;
  if (typeof code !== 'string' || !/^[a-z]{2}$/.test(code)) return [`${at}: mã bang không hợp lệ`];
  if (!isObject(state)) return [`${at}: dữ liệu phải là object`];
  for (const key of Object.keys(state)) if (!STATE_KEYS.includes(key)) errors.push(`${at}: khóa ${key} không hỗ trợ`);
  const between = (value, min, max) => value === undefined || (Number.isFinite(value) && value >= min && value <= max);
  if (state.landmarks !== undefined && (!Array.isArray(state.landmarks) || state.landmarks.length > 6)) errors.push(`${at}: landmarks tối đa 6 mục`);
  for (const item of Array.isArray(state.landmarks) ? state.landmarks : []) {
    if (!isObject(item) || !isKind(item.kind) || !STATE_SIDES.includes(item.side) || !between(item.distance, 10, 140) || item.distance === undefined
      || !between(item.offset, -160, 160) || !between(item.scale, 0.2, 5) || !between(item.haze, 0, 1)
      || (item.params !== undefined && (!isObject(item.params) || JSON.stringify(item.params).length > 1000))) {
      errors.push(`${at}: landmark cần { kind, side ${STATE_SIDES.join('/')}, distance 10–140, offset ±160, scale 0,2–5, haze 0–1, params ≤ 1000 ký tự }`);
    }
  }
  const scatter = state.scatter;
  if (scatter !== undefined && (!Array.isArray(scatter) || scatter.length > 3
    || scatter.some((item) => !isKind(item?.kind) || !Number.isInteger(item.count) || item.count < 0 || item.count > 200
      || (item.band !== undefined && (!Array.isArray(item.band) || item.band.length !== 2 || !item.band.every(Number.isFinite) || item.band[0] < 0 || item.band[1] <= item.band[0] || item.band[1] > 120))))) {
    errors.push(`${at}: scatter cần tối đa 3 nhóm { kind, count 0–200, band? [gần, xa] }`);
  }
  if (state.hide !== undefined && (!Array.isArray(state.hide) || !state.hide.every((item) => item === 'mountains'))) errors.push(`${at}: hide chỉ nhận 'mountains'`);
  if (state.clear !== undefined && (!Array.isArray(state.clear) || state.clear.length > 4
    || state.clear.some((item) => !isObject(item) || !STATE_SIDES.includes(item.side) || !between(item.from, 0, 140) || item.from === undefined))) {
    errors.push(`${at}: clear cần tối đa 4 mục { side, from 0–140 }`);
  }
  return errors;
}

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
    // Bắt buộc water/rocks/lotus/fish; reeds (lau sậy) và floats (đèn hoa đăng + đủ đàn cá) là tùy chọn.
    const keys = ['water', 'rocks', 'lotus', 'fish'];
    const optional = ['reeds', 'floats'];
    const valid = (key) => Number.isSafeInteger(visibility[key]) && visibility[key] >= 0 && visibility[key] <= 4;
    if (!visibility || !keys.every(valid) || !Object.keys(visibility).every((key) => keys.includes(key) || (optional.includes(key) && valid(key)))) {
      errors.push('world.courtyard.pond.stageVisibility cần đủ water/rocks/lotus/fish từ 0 đến 4 (reeds, floats tùy chọn)');
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
  const gardenModel = world.courtyard?.garden?.model;
  if (gardenModel !== undefined && (typeof gardenModel.src !== 'string'
    || !/^\/models\/garden\/[a-z0-9-]{1,64}\.glb$/.test(gardenModel.src)
    || ![gardenModel.x, gardenModel.y, gardenModel.z, gardenModel.ry, gardenModel.scale].every(Number.isFinite)
    || gardenModel.scale <= 0 || gardenModel.scale > 10)) {
    errors.push('world.courtyard.garden.model không hợp lệ');
  }
  const petZone = world.courtyard?.petZone;
  const farmZone = world.courtyard?.farmZone;
  if (farmZone !== undefined && (!Array.isArray(farmZone?.area?.x) || !Array.isArray(farmZone?.area?.z) || !Array.isArray(farmZone.fence)
    || farmZone.fence.length < 4 || typeof farmZone.sign !== 'string' || !farmZone.sign.trim() || farmZone.sign.length > 40)) {
    errors.push('world.courtyard.farmZone thiếu khu vực, hàng rào hoặc bảng tên hợp lệ');
  }
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
        // Chó mèo (khu thú cưng) và thú Nông trại nhỏ (chỉ có mô hình riêng).
        if (!ANIMAL_TYPES.includes(animal.type) || (!['dog', 'cat'].includes(animal.type) && animal.model === undefined)) {
          errors.push(`thú cưng ${animal.id || '?'} có loại không hợp lệ`);
        }
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
  if (world.courtyard?.themes !== undefined) errors.push('world.courtyard.themes đã chuyển sang scenes/<scene>/themes/<vùng>.json');
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
