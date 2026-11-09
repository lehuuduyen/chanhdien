// Đi lại trong thế giới 3D (chế độ nhập vai): vùng đi được, va chạm, tìm đường khi chạm xuống sàn.
// Dữ liệu lấy từ scene JSON (world.walk), engine không chứa toạ độ của phòng nào. Chạy được trên Node để test.
//
// world.walk = {
//   bounds: { x: [min, max], z: [min, max] },   // hình chữ nhật đi được (mét)
//   obstacles: [{ x, z, r } | { x, z, rx, rz }],  // vật cản tròn (cột, lư hương…) hoặc elip (hồ nước lớn)
//   spawn: { x, z, ry },                          // chỗ xuất hiện khi vào phòng
//   areas: [{ x: [min, max], z: [min, max] }],    // (tùy chọn) vùng đi được là hợp các hình chữ nhật này
//                                                 // (vd: trong chánh điện + cửa + sân); bounds bao tất cả
//   speed: 2.2,                                   // m/giây khi đi
//   runSpeed: 5,                                  // (tùy chọn) m/giây khi chạy (giữ Shift)
//   radius: 0.25,                                 // bán kính thân người
// }

const CELL = 0.25;
// Chia vật cản thành các ô lớn để A* không phải quét toàn bộ hàng trăm bụi cây / đèn / tượng cho mỗi điểm lưới.
// Chỉ mục chỉ sống trong một lần findPath nên không bị cũ nếu dữ liệu cảnh được thay thế.
const PATH_BUCKET = 2;
// Không để một khung hình đi xa hơn vật cản nhỏ nhất. Nếu chỉ kiểm tra điểm cuối, lúc chạy hoặc máy chậm
// nhân vật có thể nhảy từ phía này sang phía kia của vật mà không chạm vào nó (tunnelling).
const MAX_SWEEP_STEP = 0.2;

export function validateWalk(walk) {
  const errors = [];
  if (!walk) return errors;
  const range = (pair) => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite) && pair[0] < pair[1];
  if (!range(walk.bounds?.x) || !range(walk.bounds?.z)) errors.push('world.walk.bounds không hợp lệ');
  for (const item of walk.obstacles || []) {
    const ellipse = item.rx !== undefined || item.rz !== undefined;
    const sizes = ellipse ? [item.rx, item.rz] : [item.r];
    if (![item.x, item.z, ...sizes].every(Number.isFinite) || sizes.some((value) => value <= 0)) errors.push('vật cản cần x, z và r > 0 (hoặc rx, rz > 0)');
  }
  for (const area of walk.areas || []) {
    if (!range(area.x) || !range(area.z)) errors.push('world.walk.areas có vùng không hợp lệ');
  }
  if (!walk.spawn || !Number.isFinite(walk.spawn.x) || !Number.isFinite(walk.spawn.z)) errors.push('world.walk.spawn thiếu toạ độ');
  else if (errors.length === 0 && !isWalkable(walk, walk.spawn.x, walk.spawn.z)) errors.push('chỗ xuất hiện nằm trong vật cản hoặc ngoài vùng đi');
  return errors;
}

const inRect = (rect, x, z) => x >= rect.x[0] && x <= rect.x[1] && z >= rect.z[0] && z <= rect.z[1];
const inAreas = (walk, x, z) => inRect(walk.bounds, x, z) && (!walk.areas?.length || walk.areas.some((area) => inRect(area, x, z)));

// Chỉ mục ô lưới cho vật cản (dùng cho va chạm từng bước đi và isWalkable): sân có gần 2.000 vật cản, mỗi bước đi của
// mỗi nhân vật mà quét hết thì phòng đông (40 người trong tầm nhìn) làm điện thoại giật cả hình lẫn tiếng. Mỗi vật cản
// nằm trong các ô mà khung bao của nó phủ; một điểm chỉ cần xét vật cản trong các ô quanh nó (± bán kính thân người).
// Giữ đúng thứ tự vật cản như mảng gốc (va chạm xử lý tuần tự nên thứ tự đổi thì kết quả trượt có thể khác chút).
// Tạo lại khi mảng vật cản đổi (khác mảng hoặc khác độ dài).
const GRID_CELL = 2;
const gridCache = new WeakMap();
function obstacleGrid(obstacles) {
  const cached = gridCache.get(obstacles);
  if (cached && cached.count === obstacles.length) return cached;
  const cells = new Map();
  obstacles.forEach((item, index) => {
    const rx = item.rx ?? item.r;
    const rz = item.rz ?? item.r;
    const x0 = Math.floor((item.x - rx) / GRID_CELL);
    const x1 = Math.floor((item.x + rx) / GRID_CELL);
    const z0 = Math.floor((item.z - rz) / GRID_CELL);
    const z1 = Math.floor((item.z + rz) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const key = cx * 65_536 + cz;
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(index);
      }
    }
  });
  const grid = { count: obstacles.length, cells, scratch: [] };
  gridCache.set(obstacles, grid);
  return grid;
}
// Chỉ số các vật cản có thể chạm điểm (x, z) với bán kính pad, tăng dần. Mảng trả về dùng lại giữa các lần gọi.
function nearbyObstacles(obstacles, x, z, pad) {
  const grid = obstacleGrid(obstacles);
  const out = grid.scratch;
  out.length = 0;
  const x0 = Math.floor((x - pad) / GRID_CELL);
  const x1 = Math.floor((x + pad) / GRID_CELL);
  const z0 = Math.floor((z - pad) / GRID_CELL);
  const z1 = Math.floor((z + pad) / GRID_CELL);
  let cellsHit = 0;
  for (let cx = x0; cx <= x1; cx += 1) {
    for (let cz = z0; cz <= z1; cz += 1) {
      const list = grid.cells.get(cx * 65_536 + cz);
      if (!list) continue;
      cellsHit += 1;
      for (const index of list) out.push(index);
    }
  }
  if (cellsHit > 1) {
    out.sort((a, b) => a - b);
    let write = 0;
    for (let read = 0; read < out.length; read += 1) if (read === 0 || out[read] !== out[read - 1]) out[write++] = out[read];
    out.length = write;
  }
  return out;
}

// Vật cản elip nới thêm bán kính thân người; trả "độ sâu" k (< 1 là đang ở trong).
const ellipseDepth = (item, radius, x, z) => Math.hypot((x - item.x) / (item.rx + radius), (z - item.z) / (item.rz + radius));

export function isWalkable(walk, x, z) {
  const radius = walk.radius ?? 0.25;
  if (!inAreas(walk, x, z)) return false;
  const obstacles = walk.obstacles || [];
  for (const index of nearbyObstacles(obstacles, x, z, radius)) {
    const item = obstacles[index];
    if (item.rx ? ellipseDepth(item, radius, x, z) < 1 : Math.hypot(x - item.x, z - item.z) < item.r + radius) return false;
  }
  return true;
}

// Giải một bước ngắn: giữ trong vùng, trượt dọc theo vật cản thay vì đứng khựng.
function resolveStep(walk, from, to) {
  const radius = walk.radius ?? 0.25;
  let x = Math.min(Math.max(to.x, walk.bounds.x[0]), walk.bounds.x[1]);
  let z = Math.min(Math.max(to.z, walk.bounds.z[0]), walk.bounds.z[1]);
  const obstacles = walk.obstacles || [];
  // Bước ngắn (≤ MAX_SWEEP_STEP) từ chỗ an toàn: vật cản có thể chạm đều nằm trong các ô quanh điểm đích; nới thêm
  // 0,6 m cho phần bị đẩy / trượt dọc vật cản xét trước trong cùng bước. Chép mảng vì mảng chỉ mục được dùng lại.
  const candidates = nearbyObstacles(obstacles, x, z, radius + 0.6).slice();
  for (const index of candidates) {
    const item = obstacles[index];
    if (item.rx) {
      // Elip (bờ hồ): đẩy ra mép theo hướng từ tâm, nhờ vậy tự trượt dọc bờ.
      const depth = ellipseDepth(item, radius, x, z);
      if (depth < 1) {
        const scale = 1.001 / Math.max(depth, 1e-6);
        x = item.x + (x - item.x) * scale + (depth < 1e-6 ? item.rx + radius : 0);
        z = item.z + (z - item.z) * scale;
      }
      continue;
    }
    const dx = x - item.x;
    const dz = z - item.z;
    const distance = Math.hypot(dx, dz);
    const min = item.r + radius;
    if (distance < min) {
      // Lấy pháp tuyến từ tâm về vị trí an toàn trước bước đi. Nếu người đi thẳng đúng tâm, chỉ đẩy ngược ra
      // sẽ làm hai lực triệt nhau và nhân vật khựng. Chuyển một phần quãng bị chặn sang tiếp tuyến để lách ngay.
      const safeDx = from.x - item.x;
      const safeDz = from.z - item.z;
      const safeDistance = Math.hypot(safeDx, safeDz);
      const nx = safeDistance > 1e-6 ? safeDx / safeDistance : (distance > 1e-6 ? dx / distance : 1);
      const nz = safeDistance > 1e-6 ? safeDz / safeDistance : (distance > 1e-6 ? dz / distance : 0);
      const length = Math.hypot(nx, nz) || 1;
      const normalX = nx / length;
      const normalZ = nz / length;
      const moveX = to.x - from.x;
      const moveZ = to.z - from.z;
      const tangentX = -normalZ;
      const tangentZ = normalX;
      const tangentMove = moveX * tangentX + moveZ * tangentZ;
      const inwardMove = Math.max(0, -(moveX * normalX + moveZ * normalZ));
      const side = Math.sign(tangentMove) || (safeDx + safeDz >= 0 ? 1 : -1);
      const slide = tangentMove || side * Math.min(Math.hypot(moveX, moveZ) * 0.55, inwardMove * 0.55);
      x = item.x + normalX * min + tangentX * slide;
      z = item.z + normalZ * min + tangentZ * slide;
    }
  }
  x = Math.min(Math.max(x, walk.bounds.x[0]), walk.bounds.x[1]);
  z = Math.min(Math.max(z, walk.bounds.z[0]), walk.bounds.z[1]);
  // Nhiều vùng: ra khỏi mọi vùng thì trượt theo từng trục (đi dọc tường), không được thì đứng yên.
  if (walk.areas?.length && !inAreas(walk, x, z)) {
    if (inAreas(walk, x, from.z)) return { x, z: from.z };
    if (inAreas(walk, from.x, z)) return { x: from.x, z };
    return { x: from.x, z: from.z };
  }
  return { x, z };
}

// Bước đi từ `from` theo hướng muốn tới `to`. Chia quãng đường thành các bước ngắn để không xuyên qua vật
// khi chạy nhanh, tab vừa tỉnh lại hoặc FPS thấp; mỗi bước vẫn giữ chuyển động trượt dọc mép vật cản.
export function resolveMove(walk, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_SWEEP_STEP));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let current = { x: from.x, z: from.z };
  for (let index = 0; index < steps; index += 1) {
    current = resolveStep(walk, current, { x: current.x + stepX, z: current.z + stepZ });
  }
  return current;
}

// Tạo hàm kiểm tra nhanh cho A*. `maxRadius` là bán kính lớn nhất sẽ hỏi (gồm lề khi rút gọn đường), nhờ vậy
// vật cản được đưa vào mọi bucket có thể chạm tới; lúc kiểm tra vẫn dùng đúng bán kính của từng trường hợp.
function pathWalkable(walk, maxRadius) {
  const { bounds } = walk;
  const columns = Math.ceil((bounds.x[1] - bounds.x[0]) / PATH_BUCKET) + 1;
  const rows = Math.ceil((bounds.z[1] - bounds.z[0]) / PATH_BUCKET) + 1;
  const buckets = new Map();
  const bucketKey = (column, row) => row * columns + column;
  for (const item of walk.obstacles || []) {
    const rx = (item.rx ?? item.r) + maxRadius;
    const rz = (item.rz ?? item.r) + maxRadius;
    const minColumn = Math.max(0, Math.floor((item.x - rx - bounds.x[0]) / PATH_BUCKET));
    const maxColumn = Math.min(columns - 1, Math.floor((item.x + rx - bounds.x[0]) / PATH_BUCKET));
    const minRow = Math.max(0, Math.floor((item.z - rz - bounds.z[0]) / PATH_BUCKET));
    const maxRow = Math.min(rows - 1, Math.floor((item.z + rz - bounds.z[0]) / PATH_BUCKET));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const key = bucketKey(column, row);
        const nearby = buckets.get(key);
        if (nearby) nearby.push(item);
        else buckets.set(key, [item]);
      }
    }
  }
  return (x, z, radius) => {
    if (!inAreas(walk, x, z)) return false;
    const column = Math.min(columns - 1, Math.max(0, Math.floor((x - bounds.x[0]) / PATH_BUCKET)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((z - bounds.z[0]) / PATH_BUCKET)));
    for (const item of buckets.get(bucketKey(column, row)) || []) {
      const dx = x - item.x;
      const dz = z - item.z;
      if (item.rx) {
        if ((dx / (item.rx + radius)) ** 2 + (dz / (item.rz + radius)) ** 2 < 1) return false;
      } else if (dx * dx + dz * dz < (item.r + radius) ** 2) return false;
    }
    return true;
  };
}

// Tìm đường A* trên lưới 25 cm: trả danh sách điểm (đã rút gọn đoạn thẳng), hoặc [] nếu không tới được.
export function findPath(walk, from, to) {
  const { bounds } = walk;
  const columns = Math.ceil((bounds.x[1] - bounds.x[0]) / CELL) + 1;
  const rows = Math.ceil((bounds.z[1] - bounds.z[0]) / CELL) + 1;
  const cellOf = (point) => [
    Math.min(columns - 1, Math.max(0, Math.round((point.x - bounds.x[0]) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.round((point.z - bounds.z[0]) / CELL))),
  ];
  const pointOf = (column, row) => ({ x: bounds.x[0] + column * CELL, z: bounds.z[0] + row * CELL });
  // A* hỏi lại cùng một ô nhiều lần (từ các ô kề và khi cấm cắt góc). Với cảnh rộng có nhiều
  // vật cản, quét toàn bộ danh sách vật cản cho mỗi lần hỏi chiếm phần lớn thời gian tìm đường.
  // Cache chỉ sống trong một lần tìm đường nên luôn khớp với dữ liệu walk hiện tại.
  const radius = walk.radius ?? 0.25;
  const marginRadius = radius + 0.02;
  const fastWalkable = pathWalkable(walk, marginRadius);
  const walkableCells = new Uint8Array(columns * rows); // 0: chưa biết, 1: bị chặn, 2: đi được
  const free = (column, row) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
    const index = row * columns + column;
    if (walkableCells[index]) return walkableCells[index] === 2;
    const point = pointOf(column, row);
    const walkable = fastWalkable(point.x, point.z, radius);
    walkableCells[index] = walkable ? 2 : 1;
    return walkable;
  };
  // Ở đây chỉ hiệu chỉnh điểm chạm về vị trí hợp lệ; A* bên dưới mới chịu trách nhiệm tìm cả tuyến đường.
  const goal = resolveStep(walk, from, to);
  const [startColumn, startRow] = cellOf(from);
  let [goalColumn, goalRow] = cellOf(goal);
  if (!free(goalColumn, goalRow)) {
    // Điểm đích sát vật cản: lấy ô trống gần nhất quanh đó.
    let best = null;
    for (let dr = -3; dr <= 3; dr += 1) for (let dc = -3; dc <= 3; dc += 1) {
      if (free(goalColumn + dc, goalRow + dr) && (!best || Math.hypot(dc, dr) < best.d)) best = { c: goalColumn + dc, r: goalRow + dr, d: Math.hypot(dc, dr) };
    }
    if (!best) return [];
    [goalColumn, goalRow] = [best.c, best.r];
  }
  const key = (column, row) => row * columns + column;
  // Hàng đợi ưu tiên (đống nhị phân) theo f: vùng đi rộng (sân + chánh điện) vẫn tìm đường nhanh.
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].f <= node.f) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = node;
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const child = left + 1 < heap.length && heap[left + 1].f < heap[left].f ? left + 1 : left;
        if (heap[child].f >= last.f) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return top;
  };
  const best = new Map([[key(startColumn, startRow), 0]]);
  push({ c: startColumn, r: startRow, g: 0, f: 0, parent: null });
  const closed = new Set();
  const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let found = null;
  while (heap.length) {
    const current = pop();
    const currentKey = key(current.c, current.r);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    if (current.c === goalColumn && current.r === goalRow) {
      found = current;
      break;
    }
    for (const [dc, dr, cost] of steps) {
      const c = current.c + dc;
      const r = current.r + dr;
      const k = key(c, r);
      if (closed.has(k) || !free(c, r)) continue;
      if (dc && dr && (!free(current.c + dc, current.r) || !free(current.c, current.r + dr))) continue;
      const g = current.g + cost;
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      push({ c, r, g, f: g + Math.hypot(goalColumn - c, goalRow - r), parent: current });
    }
  }
  if (!found) return [];
  const cells = [];
  for (let node = found; node; node = node.parent) cells.unshift(pointOf(node.c, node.r));
  cells[cells.length - 1] = goal;
  // Rút gọn: bỏ điểm giữa nếu đi thẳng từ điểm trước tới điểm sau không chạm vật cản.
  // Kiểm tra với thân người nới thêm 2 cm: đoạn thẳng lướt sát mép vật cản giữa hai điểm lấy mẫu vẫn bị loại.
  const clear = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= length; t += CELL / 2) {
      const k = length ? t / length : 0;
      if (!fastWalkable(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, marginRadius)) return false;
    }
    return true;
  };
  const path = [];
  let anchor = from;
  for (let index = 0; index < cells.length; index += 1) {
    const next = cells[index + 1];
    if (!next || !clear(anchor, next)) {
      path.push(cells[index]);
      anchor = cells[index];
    }
  }
  return path;
}
