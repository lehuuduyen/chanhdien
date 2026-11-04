// Phần thuần của rạp phim 3D (cinema3d.mjs): vị trí ghế theo mét, khung nhìn camera, toạ độ màn chiếu trên màn hình.
// Chạy được trên Node để test. Toạ độ: màn chiếu nằm trên mặt phẳng z = 0, tâm x = 0; khán phòng kéo về phía +z,
// sàn bậc thang cao dần về cuối rạp; người ngồi quay mặt về màn chiếu (hướng −z).
//
// Camera "cửa sổ" (overview, screen, seat) luôn nhìn thẳng vuông góc với màn chiếu, chỉ dịch khung (off-axis): màn
// chiếu hiện ra là một hình chữ nhật đúng nghĩa để trang đặt iframe YouTube phẳng lên trên, không vẽ gì đè lên.

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isRange = (value) => Array.isArray(value) && value.length === 2 && value.every(isNumber) && value[0] < value[1];
const isVector = (value) => Array.isArray(value) && value.length === 3 && value.every(isNumber);

// Ghế theo seatLayout của cảnh 2D (cùng id S-1…: hàng 0 là hàng cuối rạp, trái sang phải nhìn từ ghế về màn chiếu).
export function theaterSeats(scene) {
  const { rows, columns, idPrefix = 'S-' } = scene.seatLayout;
  const { firstRowZ, rowSpacing, rowRise, seatSpacing, aisle = 0, curve = 0, focusZ = -10, couples } = scene.theater3d.seating;
  const middle = (columns - 1) / 2;
  const coupleRows = new Set(couples?.rows || []);
  const seats = [];
  // Đặt ghế tại x trên hàng fromFront: z theo độ cong của hàng, ghế quay về một điểm sau màn chiếu.
  const place = (seat, x, fromFront) => {
    const z = firstRowZ + fromFront * rowSpacing + x * x * curve;
    return Object.assign(seat, { x: round(x), y: round(fromFront * rowRise), z: round(z), ry: round(Math.atan2(x, z - focusZ)) });
  };
  for (let row = 0; row < rows; row += 1) {
    const fromFront = rows - 1 - row;
    const rowSeats = [];
    for (let column = 0; column < columns; column += 1) {
      const offset = column - middle;
      const x = offset * seatSpacing + (offset === 0 ? 0 : Math.sign(offset) * aisle / 2);
      rowSeats.push(place({ id: `${idPrefix}${row * columns + column + 1}`, row }, x, fromFront));
    }
    // Hàng ghế đôi: mỗi bên lối giữa, ghép từng cặp ghế tính từ lối giữa ra (ghế lẻ sát tường vẫn là ghế đơn); hai ghế
    // của một cặp xích lại thành một sofa, giữ nguyên id ghế.
    if (coupleRows.has(row)) {
      for (const side of [-1, 1]) {
        const sideSeats = rowSeats.filter((seat) => Math.sign(seat.x) === side).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
        for (let index = 0; index + 1 < sideSeats.length; index += 2) {
          const [inner, outer] = [sideSeats[index], sideSeats[index + 1]];
          const center = (inner.x + outer.x) / 2;
          const half = couples.spacing / 2;
          place(inner, center - side * half, fromFront);
          place(outer, center + side * half, fromFront);
          const couple = place({}, center, fromFront);
          inner.couple = { id: `${inner.id}+${outer.id}`, partner: outer.id, ...couple };
          outer.couple = { id: `${inner.id}+${outer.id}`, partner: inner.id, ...couple };
        }
      }
    }
    seats.push(...rowSeats);
  }
  return seats;
}

// Các sofa ghế đôi (mỗi sofa một lần): { id, seats: [id, id], x, y, z, ry }.
export function theaterCouples(seats) {
  const couples = new Map();
  for (const seat of seats) {
    if (!seat.couple || couples.has(seat.couple.id)) continue;
    const { id, x, y, z, ry } = seat.couple;
    couples.set(id, { id, seats: [seat.id, seat.couple.partner], x, y, z, ry });
  }
  return [...couples.values()];
}

const round = (value) => Math.round(value * 1000) / 1000;

export function screenBox(theater) {
  const { width, height, bottom } = theater.screen;
  return { x: [-width / 2, width / 2], y: [bottom, bottom + height] };
}

// Nới khung cho vừa tỷ lệ khung hình: màn rộng hơn khung thì nới đều hai bên; màn dọc (điện thoại) thì giữ mép trên
// và kéo dài xuống dưới để thấy thêm khán giả.
export function fitWindow(window, aspect) {
  const width = window.x[1] - window.x[0];
  const height = window.y[1] - window.y[0];
  if (width / height < aspect) {
    const half = (height * aspect) / 2;
    const center = (window.x[0] + window.x[1]) / 2;
    return { x: [center - half, center + half], y: [...window.y] };
  }
  return { x: [...window.x], y: [window.y[1] - width / aspect, window.y[1]] };
}

// Tư thế camera cho từng góc. Kiểu "window": vị trí + khung trên mặt phẳng màn chiếu; kiểu "look": camera thường.
// self { x, z }: vị trí nhân vật của mình (góc "follow" — nhìn theo nhân vật, vẫn hướng về màn chiếu).
export function cameraPose(scene, seats, cameraId, seatId, aspect, self = null) {
  const cameras = scene.theater3d.cameras;
  const screen = screenBox(scene.theater3d);
  if (cameraId === 'follow' && self && cameras.follow) {
    // Camera sau lưng, cao hơn đầu; khung luôn chứa trọn màn chiếu và nửa trên nhân vật (từ ngực, độ cao focus).
    // Được lùi xuyên tường cuối (mặt sau tường không vẽ) để đứng sát cửa vẫn thấy mình.
    const { height, distance, margin, focus = 0.9 } = cameras.follow;
    const floor = floorHeight(scene, self.z);
    const position = [Math.max(-4.5, Math.min(4.5, self.x)), floor + height, self.z + distance];
    const depth = position[2] - self.z;
    const chest = position[1] + (floor + focus - position[1]) * (position[2] / depth);
    const window = {
      x: [Math.min(screen.x[0] - 0.5, self.x - margin), Math.max(screen.x[1] + 0.5, self.x + margin)],
      y: [Math.min(screen.y[0] - 0.5, chest - margin), screen.y[1] + 0.5],
    };
    return { kind: 'window', position, window: fitWindow(window, aspect) };
  }
  if (cameraId === 'audience') {
    const { position, target, fov, fovPortrait = fov } = cameras.audience;
    return { kind: 'look', position: [...position], target: [...target], fov: aspect < 1 ? fovPortrait : fov };
  }
  if (cameraId === 'seat') {
    const seat = seats.find((item) => item.id === seatId);
    if (seat) {
      // Nhìn qua vai: cao hơn và lùi sau ghế mình một chút (thấy cả nhân vật của mình, không bị lưng ghế trước che).
      const { eye, back = 0, margin, below = margin } = cameras.seat;
      const position = [seat.x, seat.y + eye, seat.z + back];
      const window = { x: [screen.x[0] - margin, screen.x[1] + margin], y: [screen.y[0] - below, screen.y[1] + margin] };
      return { kind: 'window', position, window: fitWindow(window, aspect) };
    }
  }
  const camera = cameras[cameraId] && !['seat', 'follow'].includes(cameraId) ? cameras[cameraId] : cameras.overview;
  // Màn dọc (điện thoại) có thể dùng khung riêng: khung ngang rộng để thấy tường hội tụ thì trên điện thoại màn
  // chiếu sẽ quá nhỏ (YouTube cần khung player ≥ 200 px).
  const window = aspect < 1 && camera.windowPortrait ? camera.windowPortrait : camera.window;
  return { kind: 'window', position: [...camera.position], window: fitWindow({ x: window.x, y: window.y }, aspect) };
}

// ---- Đi lại trong rạp (góc nhìn nhân vật) ----

// Độ cao sàn tại z: phía trước hàng đầu là sàn phẳng, từ hàng đầu trở về sau mỗi hàng cao thêm rowRise.
export function floorHeight(scene, z) {
  const { firstRowZ, rowSpacing, rowRise } = scene.theater3d.seating;
  const start = firstRowZ - rowSpacing / 2 + 0.1;
  if (z < start) return 0;
  const step = Math.min(scene.seatLayout.rows - 1, Math.floor((z - start) / rowSpacing));
  return step * rowRise;
}

// Chỗ đứng hợp lệ: trong khán phòng, trước sân khấu trở về sau, không đè lên ghế (ghế coi như hình tròn).
export function isWalkable(scene, seats, x, z) {
  const { hall } = scene.theater3d;
  const walk = scene.theater3d.walk;
  const body = walk.bodyRadius;
  if (x < hall.x[0] + body + 0.15 || x > hall.x[1] - body - 0.15 || z < walk.minZ || z > hall.backZ - body - 0.15) return false;
  const reach = walk.seatRadius + body;
  for (const seat of seats) {
    if (Math.abs(seat.x - x) < reach && Math.abs(seat.z + 0.03 - z) < reach && Math.hypot(seat.x - x, seat.z + 0.03 - z) < reach) return false;
  }
  return true;
}

// Bước từ from tới to; chạm ghế/tường thì trượt theo một trục, hoặc lách nhẹ sang hai bên hướng đi (hàng ghế cong
// nên đi dọc khoảng để chân phải nhích dần theo độ cong). Lỡ đứng ở chỗ không hợp lệ (ghế bên cạnh vừa có người…)
// thì cho bước ra để không bao giờ kẹt cứng.
export function slideMove(scene, seats, from, to) {
  const ok = (x, z) => isWalkable(scene, seats, x, z);
  if (!ok(from.x, from.z)) return { x: to.x, z: to.z };
  if (ok(to.x, to.z)) return { x: to.x, z: to.z };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  for (const nudge of [0.04, 0.08, 0.12, 0.18]) {
    for (const sign of [1, -1]) {
      const x = to.x - (dz / length) * nudge * sign;
      const z = to.z + (dx / length) * nudge * sign;
      if (ok(x, z)) return { x, z };
    }
  }
  if (Math.abs(dx) >= Math.abs(dz)) {
    if (ok(to.x, from.z)) return { x: to.x, z: from.z };
    if (ok(from.x, to.z)) return { x: from.x, z: to.z };
  } else {
    if (ok(from.x, to.z)) return { x: from.x, z: to.z };
    if (ok(to.x, from.z)) return { x: to.x, z: from.z };
  }
  return { x: from.x, z: from.z };
}

// Lưới chỗ đứng (ô 10 cm) để tìm đường, tính một lần cho mỗi bộ ghế.
const GRID = 0.1;
const grids = new WeakMap();
function walkGrid(scene, seats) {
  if (grids.has(seats)) return grids.get(seats);
  const { hall } = scene.theater3d;
  const x0 = hall.x[0];
  const z0 = scene.theater3d.walk.minZ;
  const columns = Math.ceil((hall.x[1] - x0) / GRID) + 1;
  const rows = Math.ceil((hall.backZ - z0) / GRID) + 1;
  const open = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) open[row * columns + column] = isWalkable(scene, seats, x0 + column * GRID, z0 + row * GRID) ? 1 : 0;
  }
  const grid = { x0, z0, columns, rows, open };
  grids.set(seats, grid);
  return grid;
}

// Đoạn thẳng a → b đi được (lấy mẫu 5 cm).
function clearLine(scene, seats, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    if (!isWalkable(scene, seats, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

// Tìm đường A* trên lưới chỗ đứng từ from tới to, rồi rút gọn thành ít điểm rẽ (bỏ điểm nào nhìn thẳng tới được).
export function findPath(scene, seats, from, to) {
  const grid = walkGrid(scene, seats);
  const { x0, z0, columns, rows, open } = grid;
  const cellOf = (point) => {
    const column = Math.min(columns - 1, Math.max(0, Math.round((point.x - x0) / GRID)));
    const row = Math.min(rows - 1, Math.max(0, Math.round((point.z - z0) / GRID)));
    // Điểm đứng trên ô không đi được (sát ghế): lấy ô trống gần nhất.
    if (open[row * columns + column]) return row * columns + column;
    for (let radius = 1; radius < 8; radius += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          const r = row + dr;
          const col = column + dc;
          if (r >= 0 && r < rows && col >= 0 && col < columns && open[r * columns + col]) return r * columns + col;
        }
      }
    }
    return -1;
  };
  const start = cellOf(from);
  const goal = cellOf(to);
  if (start < 0 || goal < 0) return [];
  const goalRow = Math.floor(goal / columns);
  const goalColumn = goal % columns;
  const heuristic = (cell) => Math.hypot(Math.floor(cell / columns) - goalRow, (cell % columns) - goalColumn);
  const cost = new Float64Array(columns * rows).fill(Infinity);
  const closed = new Uint8Array(columns * rows);
  const came = new Int32Array(columns * rows).fill(-1);
  const heap = [[heuristic(start), start]];
  cost[start] = 0;
  const push = (item) => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent][0] <= heap[index][0]) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
        index = smallest;
      }
    }
    return top;
  };
  const NEIGHBORS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let found = false;
  while (heap.length) {
    const [, cell] = pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    if (cell === goal) {
      found = true;
      break;
    }
    const row = Math.floor(cell / columns);
    const column = cell % columns;
    for (const [dc, dr, step] of NEIGHBORS) {
      const r = row + dr;
      const col = column + dc;
      if (r < 0 || r >= rows || col < 0 || col >= columns) continue;
      const next = r * columns + col;
      // Đi chéo không được lách qua góc ô bị chặn.
      if (closed[next] || !open[next] || (dc && dr && (!open[row * columns + col] || !open[r * columns + column]))) continue;
      const total = cost[cell] + step;
      if (total < cost[next]) {
        cost[next] = total;
        came[next] = cell;
        push([total + heuristic(next), next]);
      }
    }
  }
  if (!found) return [];
  const cells = [];
  for (let cell = goal; cell !== -1; cell = came[cell]) cells.push(cell);
  cells.reverse();
  const points = cells.map((cell) => ({ x: x0 + (cell % columns) * GRID, z: z0 + Math.floor(cell / columns) * GRID }));
  // Điểm đích đứng được thì tới đúng chỗ; không thì dừng ở ô trống gần nhất.
  if (isWalkable(scene, seats, to.x, to.z)) points[points.length - 1] = { x: to.x, z: to.z };
  // Rút gọn: từ điểm rẽ hiện tại đi thẳng tới đâu còn thông thì bỏ qua các ô ở giữa (quét tiến, dừng ở ô đầu
  // tiên bị che nên chỉ tốn tỉ lệ với độ dài đường).
  const path = [];
  let anchor = { x: from.x, z: from.z };
  let index = 0;
  while (index < points.length) {
    let far = index;
    while (far + 1 < points.length && clearLine(scene, seats, anchor, points[far + 1])) far += 1;
    path.push(points[far]);
    anchor = points[far];
    index = far + 1;
  }
  return path;
}

// Đường tới ghế: tìm đường tới khoảng để chân ngay trước ghế (lối đi, vòng qua hàng ghế cong, đang đứng trong hàng
// thì đi thẳng dọc hàng).
export function pathToSeat(scene, seats, from, seatId) {
  const seat = seats.find((item) => item.id === seatId);
  if (!seat) return [];
  return findPath(scene, seats, from, { x: seat.x, z: seat.z - scene.theater3d.walk.legroom });
}

// Ghế trống gần nhất mà mình đang đứng ngay trước (trong khoảng để chân), để hiện nút "Ngồi".
export function nearestSeat(scene, seats, pos, taken = new Set(), maxDistance = 0.75) {
  const { legroom } = scene.theater3d.walk;
  let best = null;
  let bestDistance = maxDistance;
  for (const seat of seats) {
    if (taken.has(seat.id)) continue;
    const distance = Math.hypot(seat.x - pos.x, seat.z - legroom - pos.z);
    if (distance < bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}

// Hình chữ nhật (mét, trên mặt phẳng màn chiếu) → pixel CSS trong canvas rộng width × cao height.
export function windowToPixels(box, window, width, height) {
  const sx = width / (window.x[1] - window.x[0]);
  const sy = height / (window.y[1] - window.y[0]);
  return {
    x: (box.x[0] - window.x[0]) * sx,
    y: (window.y[1] - box.y[1]) * sy,
    width: (box.x[1] - box.x[0]) * sx,
    height: (box.y[1] - box.y[0]) * sy,
  };
}

// Khung frustum ở mặt phẳng near cho camera tại position nhìn thẳng −z qua khung window trên mặt phẳng z = 0.
export function offAxisFrustum(position, window, near) {
  const [cx, cy, distance] = position;
  const scale = near / distance;
  return {
    left: (window.x[0] - cx) * scale,
    right: (window.x[1] - cx) * scale,
    top: (window.y[1] - cy) * scale,
    bottom: (window.y[0] - cy) * scale,
  };
}

export function validateTheater(scene) {
  const errors = [];
  const theater = scene.theater3d;
  if (theater === undefined) return { ok: true, errors };
  if (!scene.seatLayout) return { ok: false, errors: ['theater3d cần seatLayout'] };
  const { screen, seating, hall, cameras } = theater;
  if (!screen || ![screen.width, screen.height, screen.bottom].every(isNumber) || screen.width <= 0 || screen.height <= 0) {
    errors.push('theater3d.screen cần width, height, bottom');
  }
  if (!seating || !['firstRowZ', 'rowSpacing', 'rowRise', 'seatSpacing'].every((key) => isNumber(seating[key]))) {
    errors.push('theater3d.seating thiếu số liệu');
  }
  if (!hall || !isRange(hall.x) || !isNumber(hall.height) || !isNumber(hall.backZ)) errors.push('theater3d.hall cần x, height, backZ');
  if (errors.length) return { ok: false, errors };
  if (seating.seatSpacing < 0.6) errors.push('ghế cách nhau tối thiểu 0,6 m');
  if (seating.rowSpacing < 0.9) errors.push('hàng ghế cách nhau tối thiểu 0,9 m');
  if (seating.firstRowZ < 3) errors.push('hàng đầu cách màn chiếu tối thiểu 3 m');

  const seats = theaterSeats(scene);
  for (const seat of seats) {
    if (seat.x - 0.4 < hall.x[0] || seat.x + 0.4 > hall.x[1] || seat.z + 0.6 > hall.backZ) errors.push(`ghế 3D ${seat.id} nằm ngoài khán phòng`);
  }
  if (screen.width / 2 > hall.x[1] || screen.bottom + screen.height > hall.height) errors.push('màn chiếu to hơn khán phòng');
  const walk = theater.walk;
  if (walk) {
    if (![walk.minZ, walk.seatRadius, walk.bodyRadius, walk.sideAisle, walk.legroom].every(isNumber) || !walk.spawn) errors.push('theater3d.walk thiếu số liệu');
    else {
      if (!isWalkable(scene, seats, walk.spawn.x, walk.spawn.z)) errors.push('chỗ xuất hiện (walk.spawn) không đứng được');
      // Mọi ghế phải có khoảng để chân đứng được (đường tới ghế không xuyên ghế khác).
      for (const seat of seats) if (!isWalkable(scene, seats, seat.x, seat.z - walk.legroom)) errors.push(`không đứng được trước ghế ${seat.id}`);
      for (const x of [walk.sideAisle, -walk.sideAisle]) if (!isWalkable(scene, seats, x, (walk.minZ + hall.backZ) / 2)) errors.push('lối đi bên bị chặn');
    }
  }

  if (!cameras) errors.push('theater3d.cameras bắt buộc');
  else {
    for (const id of ['overview', 'screen', ...(cameras.zoom ? ['zoom'] : [])]) {
      const camera = cameras[id];
      if (!camera || !isVector(camera.position) || !isRange(camera.window?.x) || !isRange(camera.window?.y)) errors.push(`camera ${id} cần position và window`);
      else if (camera.position[2] <= 0.5 || camera.position[2] > hall.backZ) errors.push(`camera ${id} phải ở giữa màn chiếu và tường cuối`);
    }
    if (!cameras.seat || !isNumber(cameras.seat.eye) || !isNumber(cameras.seat.margin)) errors.push('camera seat cần eye, margin');
    else if (seats.some((seat) => seat.z + (cameras.seat.back || 0) > hall.backZ - 0.2)) errors.push('camera seat lùi xuyên tường cuối');
    if (cameras.follow && ![cameras.follow.height, cameras.follow.distance, cameras.follow.margin].every(isNumber)) errors.push('camera follow cần height, distance, margin');
    const audience = cameras.audience;
    if (!audience || !isVector(audience.position) || !isVector(audience.target) || !isNumber(audience.fov)) errors.push('camera audience cần position, target, fov');
  }
  return { ok: errors.length === 0, errors };
}
