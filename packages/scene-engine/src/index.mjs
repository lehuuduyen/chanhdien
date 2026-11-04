// Phần thuần của scene engine: chạy được cả trên Node (test, công cụ) lẫn trình duyệt (renderer.mjs).
// Mọi tọa độ tính trong không gian sân khấu của cảnh (mặc định 1080 × 1920), không theo pixel màn hình.

export const SCENE_VERSION = 1;
export const CAMERA_IDS = Object.freeze(['overview', 'seat', 'screen', 'audience']);
export const BUBBLE_LIMITS = Object.freeze({ maxVisible: 18, maxChars: 40, ttlMs: 6_000 });

const SCENE_ID = /^[a-z][a-z0-9-]{1,47}$/;
const SEAT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
const SAFE_SRC = /^(\/[a-zA-Z0-9_./-]+|[a-zA-Z0-9_][a-zA-Z0-9_./-]*)$/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isRect = (value) => isRecord(value) && isNumber(value.x) && isNumber(value.y)
  && isNumber(value.width) && value.width > 0 && isNumber(value.height) && value.height > 0;

export function sortByDepth(items) {
  return [...items].sort((a, b) => (a.y - b.y) || String(a.id).localeCompare(String(b.id)));
}

// Sinh ghế theo hàng trên sàn phối cảnh hình thang: hàng xa (back) nhỏ và hẹp, hàng gần (front) to và rộng.
// Đánh số từ hàng xa nhất, trái sang phải: S-1, S-2, …
export function generateSeats(layout) {
  const {
    rows, columns, yBack, yFront, halfWidthBack, halfWidthFront,
    scaleBack, scaleFront, aisleGap = 0, idPrefix = 'S-', groupSize = 1,
  } = layout;
  const seats = [];
  for (let row = 0; row < rows; row += 1) {
    const t = rows === 1 ? 1 : row / (rows - 1);
    const y = yBack + (yFront - yBack) * t;
    const half = halfWidthBack + (halfWidthFront - halfWidthBack) * t;
    const scale = scaleBack + (scaleFront - scaleBack) * t;
    for (let column = 0; column < columns; column += 1) {
      let u = columns === 1 ? 0 : (column - (columns - 1) / 2) / ((columns - 1) / 2);
      if (u !== 0) u = Math.sign(u) * (aisleGap + Math.abs(u) * (1 - aisleGap));
      const seat = {
        id: `${idPrefix}${row * columns + column + 1}`,
        x: Math.round((layout.centerX ?? 540) + u * half),
        y: Math.round(y),
        scale: Math.round(scale * 1000) / 1000,
        row,
      };
      if (groupSize > 1) seat.group = `${row}-${Math.floor(column / groupSize)}`;
      seats.push(seat);
    }
  }
  return seats;
}

// Thứ tự lấp ghế cho người mới/bot: hàng gần camera trước, gần lối giữa trước (khán phòng trông đông ở chỗ dễ thấy).
export function seatFillOrder(seats, centerX = 540) {
  return [...seats].sort((a, b) => (b.y - a.y) || (Math.abs(a.x - centerX) - Math.abs(b.x - centerX)) || a.id.localeCompare(b.id));
}

// Chuẩn hóa scene: mở seatLayout thành danh sách ghế, sắp ghế theo chiều sâu. Không sửa object đầu vào.
export function resolveScene(scene) {
  const seats = Array.isArray(scene.seats) ? scene.seats : generateSeats(scene.seatLayout);
  return { ...scene, seats: sortByDepth(seats) };
}

export function validateScene(scene) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!isRecord(scene)) return { ok: false, errors: ['scene phải là object'] };
  if (scene.version !== SCENE_VERSION) fail(`version phải là ${SCENE_VERSION}`);
  if (typeof scene.id !== 'string' || !SCENE_ID.test(scene.id)) fail('id không hợp lệ');
  if (typeof scene.name !== 'string' || !scene.name.trim()) fail('name bắt buộc');

  const stage = scene.stage;
  if (!isRecord(stage) || !isNumber(stage.width) || !isNumber(stage.height) || stage.width <= 0 || stage.height <= 0) {
    fail('stage cần width/height dương');
    return { ok: false, errors };
  }

  for (const layer of ['background', 'seatbacks']) {
    const value = scene[layer];
    if (value === null || (layer === 'seatbacks' && value === undefined)) continue;
    if (!isRecord(value) || !['image', 'procedural'].includes(value.type)) fail(`${layer}.type phải là image hoặc procedural`);
    else if (value.type === 'image' && (typeof value.src !== 'string' || !SAFE_SRC.test(value.src) || value.src.includes('..'))) {
      fail(`${layer}.src không hợp lệ`);
    }
  }

  if (scene.screen !== null && scene.screen !== undefined) {
    if (!isRect(scene.screen)) fail('screen phải là hình chữ nhật {x, y, width, height}');
    else if (scene.screen.x < 0 || scene.screen.y < 0
      || scene.screen.x + scene.screen.width > stage.width || scene.screen.y + scene.screen.height > stage.height) {
      fail('screen nằm ngoài stage');
    }
  }

  const characters = scene.characters;
  if (!isRecord(characters) || !['silhouette', 'sprite'].includes(characters.style)) fail('characters.style phải là silhouette hoặc sprite');
  else if (characters.style === 'sprite' && (!Array.isArray(characters.skins) || !characters.skins.length)) fail('characters.skins bắt buộc khi style là sprite');

  if (scene.ceremony !== undefined) {
    const officiants = scene.ceremony?.officiants;
    const expectedRoles = new Set(['teacher', 'bell', 'woodenFish']);
    if (!Array.isArray(officiants) || officiants.length !== expectedRoles.size) {
      fail('ceremony.officiants cần đủ 3 vị: teacher, bell, woodenFish');
    } else {
      const roles = new Set();
      for (const item of officiants) {
        if (!isRecord(item) || typeof item.id !== 'string' || !item.id) {
          fail('mỗi vị nghi lễ cần id');
          continue;
        }
        if (!expectedRoles.has(item.role) || roles.has(item.role)) fail(`vai nghi lễ không hợp lệ hoặc bị trùng: ${item.role}`);
        roles.add(item.role);
        if (!isNumber(item.x) || !isNumber(item.y) || item.x < 0 || item.x > stage.width || item.y < 0 || item.y > stage.height) {
          fail(`vị nghi lễ ${item.id} nằm ngoài stage`);
        }
        if (!isNumber(item.scale) || item.scale <= 0 || item.scale > 3) fail(`vị nghi lễ ${item.id} có scale không hợp lệ`);
        if (!isRecord(item.world) || !['x', 'y', 'z'].every((key) => isNumber(item.world[key]))) fail(`vị nghi lễ ${item.id} thiếu tọa độ world`);
      }
      for (const role of expectedRoles) if (!roles.has(role)) fail(`ceremony.officiants thiếu vai ${role}`);
    }
  }

  if (Array.isArray(scene.seats) === Boolean(scene.seatLayout)) {
    fail('cần đúng một trong hai: seats hoặc seatLayout');
    return { ok: !errors.length, errors };
  }
  if (scene.seatLayout) {
    const layout = scene.seatLayout;
    const numbers = ['rows', 'columns', 'yBack', 'yFront', 'halfWidthBack', 'halfWidthFront', 'scaleBack', 'scaleFront'];
    if (!isRecord(layout) || layout.type !== 'rows' || !numbers.every((key) => isNumber(layout[key]))) {
      fail('seatLayout cần type "rows" và đủ số liệu hàng/cột/phối cảnh');
      return { ok: false, errors };
    }
    if (!Number.isInteger(layout.rows) || !Number.isInteger(layout.columns) || layout.rows < 1 || layout.columns < 1) fail('rows/columns phải là số nguyên dương');
  }

  const seats = resolveScene(scene).seats;
  if (!seats.length || seats.length > 500) fail('số ghế phải từ 1 đến 500');
  const ids = new Set();
  for (const seat of seats) {
    if (!isRecord(seat) || typeof seat.id !== 'string' || !SEAT_ID.test(seat.id)) {
      fail('ghế có id không hợp lệ');
      continue;
    }
    if (ids.has(seat.id)) fail(`trùng id ghế ${seat.id}`);
    ids.add(seat.id);
    if (!isNumber(seat.x) || !isNumber(seat.y) || seat.x < 0 || seat.y < 0 || seat.x > stage.width || seat.y > stage.height) {
      fail(`ghế ${seat.id} nằm ngoài stage`);
    }
    if (!isNumber(seat.scale) || seat.scale <= 0 || seat.scale > 3) fail(`ghế ${seat.id} có scale không hợp lệ`);
    if (seat.cushion !== undefined && seat.cushion !== true) fail(`ghế ${seat.id}: cushion chỉ nhận true`);
    if (isRect(scene.screen) && pointInRect(seat, scene.screen)) fail(`ghế ${seat.id} nằm trong khung màn chiếu`);
  }
  // Ghế gần camera (y lớn) không được nhỏ hơn ghế xa: sai phối cảnh nhìn rất lộ.
  for (let index = 1; index < seats.length; index += 1) {
    if (seats[index].y > seats[index - 1].y && seats[index].scale + 1e-9 < seats[index - 1].scale) {
      fail(`ghế ${seats[index].id} gần hơn nhưng nhỏ hơn ghế ${seats[index - 1].id}`);
      break;
    }
  }

  const cameras = scene.cameras;
  if (!isRecord(cameras)) fail('cameras bắt buộc');
  else {
    for (const id of ['overview', 'screen', 'audience']) {
      if (cameras[id] !== undefined && !isRect(cameras[id])) fail(`camera ${id} phải là hình chữ nhật`);
    }
    if (!isRect(cameras.overview)) fail('camera overview bắt buộc');
    if (cameras.seat !== undefined && (!isRecord(cameras.seat) || !isNumber(cameras.seat.width) || !isNumber(cameras.seat.height))) {
      fail('camera seat cần width/height');
    }
  }
  return { ok: errors.length === 0, errors };
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// Vùng sân khấu mà camera nhìn vào. Camera "seat" lấy ghế của mình làm tâm; không có ghế thì về toàn cảnh.
export function cameraRegion(scene, cameraId, focusSeat) {
  const cameras = scene.cameras;
  if (cameraId === 'seat' && focusSeat && cameras.seat) {
    const { width, height } = cameras.seat;
    const x = Math.min(Math.max(focusSeat.x - width / 2, 0), scene.stage.width - width);
    const y = Math.min(Math.max(focusSeat.y - height * 0.72, 0), scene.stage.height - height);
    return { x, y, width, height };
  }
  return cameras[cameraId] && cameraId !== 'seat' ? cameras[cameraId] : cameras.overview;
}

// Biến đổi sân khấu → khung nhìn.
// - Mặc định: thấy trọn vùng camera (contain), phần dư lấy thêm cảnh xung quanh.
// - Vùng có "focus" { y0, y1 } (phần bắt buộc thấy, ví dụ tượng Phật tới hàng bồ đoàn cuối): lấp kín bề ngang để
//   không hở viền hai bên, cắt bớt phần trên (trần nhà) nếu thiếu chiều cao; chỉ khi khung quá thấp không chứa nổi
//   focus mới co lại (hở hai bên ít nhất có thể).
//   viewport.insetTop/insetBottom (px) là phần bị thanh điều khiển che: ảnh vẫn tràn ra sau thanh (không hở nền),
//   nhưng focus phải nằm trọn trong khoảng giữa.
// Khung nhìn rộng hơn cả stage thì đặt stage vào giữa; còn lại kẹp để không lộ ngoài stage.
export function cameraTransform(scene, region, viewport) {
  const focus = region.focus;
  if (focus && focus.y1 > focus.y0) {
    const insetTop = viewport.insetTop || 0;
    const insetBottom = viewport.insetBottom || 0;
    const usable = Math.max(1, viewport.height - insetTop - insetBottom);
    const span = focus.y1 - focus.y0;
    // Phóng tới mức phủ kín khung (cover) nếu được, nhưng không cắt mất bề ngang focus (x0..x1) và focus dọc
    // phải vừa khoảng giữa hai thanh; thấp nhất là thấy trọn vùng camera.
    const focusX0 = focus.x0 ?? region.x;
    const focusX1 = focus.x1 ?? region.x + region.width;
    const cover = Math.max(viewport.width / region.width, viewport.height / region.height);
    const scale = Math.max(
      Math.min(cover, viewport.width / (focusX1 - focusX0), usable / span),
      Math.min(viewport.width / region.width, usable / region.height),
    );
    const visibleWidth = viewport.width / scale;
    const visibleHeight = viewport.height / scale;
    const left = visibleWidth >= scene.stage.width
      ? (scene.stage.width - visibleWidth) / 2
      : clamp((focusX0 + focusX1) / 2 - visibleWidth / 2, Math.max(0, focusX1 - visibleWidth), Math.min(scene.stage.width - visibleWidth, focusX0));
    // Vị trí dọc (top = toạ độ sân khấu ở mép trên khung): neo đáy vùng camera để giữ sàn và bồ đoàn, rồi chọn
    // khoảng hợp lệ đầu tiên theo thứ tự ưu tiên: không lộ gì ngoài ảnh → phần lộ nằm gọn sau hai thanh → chỉ giữ focus.
    const minTop = focus.y1 - (viewport.height - insetBottom) / scale;
    const maxTop = focus.y0 - insetTop / scale;
    const ranges = [
      [Math.max(minTop, 0), Math.min(maxTop, scene.stage.height - visibleHeight)],
      [Math.max(minTop, -insetTop / scale), Math.min(maxTop, scene.stage.height - (viewport.height - insetBottom) / scale)],
      [minTop, maxTop],
    ];
    const [low, high] = ranges.find(([from, to]) => from <= to) || [minTop, Math.max(minTop, maxTop)];
    const top = clamp(region.y + region.height - visibleHeight, low, high);
    return { scale, offsetX: -left * scale, offsetY: -top * scale };
  }
  const scale = Math.min(viewport.width / region.width, viewport.height / region.height);
  const visibleWidth = viewport.width / scale;
  const visibleHeight = viewport.height / scale;
  const place = (center, visible, size) => (visible >= size
    ? (size - visible) / 2
    : clamp(center - visible / 2, 0, size - visible));
  const left = place(region.x + region.width / 2, visibleWidth, scene.stage.width);
  const top = place(region.y + region.height / 2, visibleHeight, scene.stage.height);
  return { scale, offsetX: -left * scale, offsetY: -top * scale };
}

export function stageToView(point, transform) {
  return { x: point.x * transform.scale + transform.offsetX, y: point.y * transform.scale + transform.offsetY };
}

export function viewToStage(point, transform) {
  return { x: (point.x - transform.offsetX) / transform.scale, y: (point.y - transform.offsetY) / transform.scale };
}

export function lerpTransform(from, to, t) {
  const k = clamp(t, 0, 1);
  return {
    scale: from.scale + (to.scale - from.scale) * k,
    offsetX: from.offsetX + (to.offsetX - from.offsetX) * k,
    offsetY: from.offsetY + (to.offsetY - from.offsetY) * k,
  };
}

// Chiều cao nhân vật ngồi (đến đỉnh đầu) theo tỷ lệ ghế, dùng cho chọn ghế và neo bong bóng.
export function characterHeight(scene, seat) {
  return (scene.characters.height ?? 120) * seat.scale;
}

// Chọn ghế tại một điểm trên sân khấu, theo đúng thứ người dùng nhìn thấy:
// - ghế có người: chạm vào người (rộng ~0,4 chiều cao nhân vật mỗi bên); người ở hàng gần camera vẽ đè lên nên ưu tiên;
// - ghế trống: chỉ chạm vào chỗ ngồi trên sàn (dải thấp quanh chân), để không "cướp" chạm của bồ đoàn phía sau.
// minRadius (đơn vị sân khấu) giữ vùng chạm đủ to cho ngón tay; renderer quy đổi từ ~24 px màn hình.
export function hitTestSeat(scene, point, options = {}) {
  const minRadius = options.minRadius || 0;
  const occupied = options.occupied || new Set();
  let person = null;
  let floor = null;
  let floorDistance = Infinity;
  for (const seat of scene.seats) {
    const height = characterHeight(scene, seat);
    const radiusX = Math.max(height * 0.4, 46 * seat.scale, minRadius);
    // Chỗ ngồi trên sàn (dải thấp quanh chân): có cả khi ghế trống lẫn khi có người.
    const fx = (point.x - seat.x) / radiusX;
    const fy = (point.y - (seat.y - height * 0.12)) / Math.max(height * 0.16, minRadius * 0.7);
    const onFloor = fx * fx + fy * fy;
    if (occupied.has(seat.id)) {
      // Có người: thân người hoặc bồ đoàn dưới chân (hai góc bồ đoàn nằm ngoài hình bầu dục của thân).
      const dx = (point.x - seat.x) / radiusX;
      const dy = (point.y - (seat.y - height / 2)) / Math.max(height / 2 + 12 * seat.scale, minRadius);
      if ((dx * dx + dy * dy <= 1 || onFloor <= 1) && (!person || seat.y > person.y)) person = seat;
    } else if (onFloor <= 1 && onFloor < floorDistance) {
      floor = seat;
      floorDistance = onFloor;
    }
  }
  return person || floor;
}

export function truncateBubble(text, maxChars = BUBBLE_LIMITS.maxChars) {
  const chars = [...String(text).replace(/\s+/g, ' ').trim()];
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join('')}…` : chars.join('');
}

// Kích thước bong bóng ước lượng theo số ký tự, đủ dùng để né nhau (renderer vẽ chữ co lại nếu dài hơn).
export function bubbleSize(text, fontSize, stageWidth) {
  const width = Math.min([...text].length * fontSize * 0.56 + fontSize * 1.2, stageWidth - 20);
  return { width, height: fontSize * 1.75 };
}

// Chọn bong bóng còn hiển thị (mới nhất trước, tối đa maxVisible, mỗi người một bong bóng) và neo trên đầu.
// - Không đè lên khung màn chiếu: bị đẩy xuống dưới mép màn.
// - Không đè lên nhau: xếp tầng lên trên tối đa 2 bậc; vẫn chồng thì bỏ bong bóng cũ hơn.
// Trả về hộp {x, y, width, height} (góc trên trái) và đỉnh đuôi (tipX, tipY) trong tọa độ sân khấu.
export function layoutBubbles(scene, bubbles, now, options = {}) {
  const { maxVisible = BUBBLE_LIMITS.maxVisible, ttlMs = BUBBLE_LIMITS.ttlMs } = options;
  const seatsById = new Map(scene.seats.map((seat) => [seat.id, seat]));
  const seen = new Set();
  const placed = [];
  const recent = bubbles.filter((bubble) => now - bubble.at < ttlMs).sort((a, b) => b.at - a.at);
  const screen = scene.screen;
  const gap = 4;
  for (const bubble of recent) {
    if (placed.length >= maxVisible || seen.has(bubble.participantId)) continue;
    const seat = seatsById.get(bubble.seatId);
    if (!seat) continue;
    seen.add(bubble.participantId);
    const text = truncateBubble(bubble.text);
    const fontSize = Math.round(15 + 13 * seat.scale);
    const { width, height } = bubbleSize(text, fontSize, scene.stage.width);
    const tipY = seat.y - characterHeight(scene, seat) - 6 * seat.scale;
    let bottom = tipY - 8;
    if (screen && bottom - height < screen.y + screen.height && seat.x > screen.x && seat.x < screen.x + screen.width) {
      bottom = screen.y + screen.height + height + 6;
    }
    const x = clamp(seat.x - width / 2, 10, scene.stage.width - width - 10);
    let box = null;
    for (let level = 0; level < 3 && !box; level += 1) {
      const candidate = { x, y: bottom - height - level * (height + gap), width, height };
      if (!placed.some((other) => overlaps(candidate, other, gap))) box = candidate;
    }
    if (!box) continue;
    placed.push({
      ...bubble, ...box, text, fontSize, tipX: seat.x, tipY: Math.min(tipY, box.y + box.height + 8), age: now - bubble.at,
    });
  }
  return placed;
}

function overlaps(a, b, gap) {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
