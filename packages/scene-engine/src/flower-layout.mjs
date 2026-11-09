// Hình học Vườn Hoa dùng chung cho script bố cục (sinh vật cản, điểm ngắm) và engine (vẽ nền luống, trồng hoa): thuần
// số học, không phụ thuộc Three.js. Không chứa tọa độ của phòng nào — mọi vị trí lấy từ world.courtyard.flowerGarden:
//   outline: [[x, z], …]           — đa giác hàng rào (đường giữa lớp cây xén), vườn nằm bên trong.
//   paths: [{ points: [[x, z], …], width, closed? }] — lối sỏi, điểm điều khiển nối bằng đường cong Catmull-Rom.
//   beds: [{ x, z, rx, rz, ry?, seed, mix: { edge: [], mid: [], back: [] } }] — luống hình tự do (elip méo lượn sóng);
//         phần luống chồm lên lối đi, quảng trường, hồ, sát hàng rào tự bị khoét đi (không cần vẽ tay từng mép luống).
//   plaza: { radius } quanh center; pond?: { x, z, rx, rz }; trees, lamps: [{ x, z, … }].

// Đường cong Catmull-Rom qua các điểm điều khiển, lấy mẫu mỗi ~step mét.
export function smoothPath(points, closed = false, step = 0.5) {
  if (points.length < 2) return points.map(([x, z]) => [x, z]);
  const count = points.length;
  const at = (index) => {
    if (closed) return points[((index % count) + count) % count];
    return points[Math.max(0, Math.min(count - 1, index))];
  };
  const out = [];
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index += 1) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const length = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const point = [0, 1].map((axis) => 0.5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t
        + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3));
      out.push(point);
    }
  }
  if (closed) out.push([...out[0]]);
  else out.push([...points[count - 1]]);
  return out;
}

// Viền luống: elip xoay ry, bán kính lượn sóng theo hạt giống (mỗi luống một dáng riêng nhưng mọi máy giống nhau).
export function bedOutline(bed, segments = 56) {
  const seed = bed.seed || 1;
  const phases = [seed * 1.37, seed * 2.11, seed * 0.73];
  const cos = Math.cos(bed.ry || 0);
  const sin = Math.sin(bed.ry || 0);
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const wobble = 1 + 0.09 * Math.sin(angle * 2 + phases[0]) + 0.06 * Math.sin(angle * 3 + phases[1]) + 0.04 * Math.sin(angle * 5 + phases[2]);
    const lx = Math.cos(angle) * bed.rx * wobble;
    const lz = Math.sin(angle) * bed.rz * wobble;
    return [bed.x + lx * cos + lz * sin, bed.z - lx * sin + lz * cos];
  });
}

export function insidePolygon(x, z, polygon) {
  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[prev];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function polylineDistance(x, z, points, closed = false) {
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) best = Math.min(best, segmentDistance(x, z, points[index - 1], points[index]));
  if (closed && points.length > 2) best = Math.min(best, segmentDistance(x, z, points.at(-1), points[0]));
  return best;
}

// Bộ đo của một vườn: lấy mẫu lối đi / viền luống một lần, rồi trả các hàm hỏi điểm.
//   room(x, z)      — khoảng trống tới vật gần nhất không trồng được (lối, quảng trường, hồ, rào); âm là đang đè lên.
//   bedAt(x, z)     — chỉ số luống chứa điểm và trồng được (cách mép ≥ 0), hoặc -1.
//   depth(x, z, i)  — độ sâu vào trong luống i (m): khoảng cách tới mép luống hoặc tới vật không trồng được gần nhất.
//   roomFn(box)     — bản room() chỉ xét lối đi gần khung box (dùng khi hỏi dày trong một luống).
export function flowerLayout(garden) {
  const paths = (garden.paths || []).map((path) => ({ width: path.width || 1.6, points: smoothPath(path.points, path.closed, 0.4) }));
  const beds = (garden.beds || []).map((bed) => ({ ...bed, outline: bedOutline(bed) }));
  const outline = garden.outline || [];
  const center = garden.center;
  const plazaRadius = garden.plaza?.radius || 0;
  const pond = garden.pond || null;
  const trees = garden.trees || [];
  const lamps = garden.lamps || [];
  // Lề: chừa lối đi 0,3 m mỗi bên, rào 0,7 m, quảng trường 0,4 m, bờ hồ 0,7 m.
  // near: chỉ xét các đoạn lối trong khung { x: [a, b], z: [a, b] } (nới thêm 3 m) — nhanh hơn nhiều khi hỏi dày trong
  // một luống (engine gọi hàng chục nghìn lần lúc trồng hoa).
  function roomFn(near = null) {
    const inBox = ([x, z]) => !near || (x > near.x[0] - 3 && x < near.x[1] + 3 && z > near.z[0] - 3 && z < near.z[1] + 3);
    const pieces = [];
    for (const path of paths) {
      for (let index = 1; index < path.points.length; index += 1) {
        if (inBox(path.points[index - 1]) || inBox(path.points[index])) pieces.push([path.points[index - 1], path.points[index], path.width / 2 + 0.3]);
      }
    }
    return (x, z) => {
      let best = room0(x, z);
      if (best < 0) return best;
      for (const [a, b, half] of pieces) {
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = dx * dx + dz * dz;
        const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
        best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) - half);
      }
      return best;
    };
  }
  // Phần không phụ thuộc lối đi: rào, quảng trường, hồ, đèn, gốc cây.
  function room0(x, z) {
    let best = outline.length ? polylineDistance(x, z, outline, true) - 0.7 : Infinity;
    if (outline.length && !insidePolygon(x, z, outline)) return -1;
    if (center && plazaRadius) best = Math.min(best, Math.hypot(x - center.x, z - center.z) - plazaRadius - 0.4);
    if (pond) {
      const k = Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
      best = Math.min(best, (k - 1) * Math.min(pond.rx, pond.rz) - 0.7);
    }
    for (const lamp of lamps) best = Math.min(best, Math.hypot(x - lamp.x, z - lamp.z) - 0.3);
    for (const tree of trees) best = Math.min(best, Math.hypot(x - tree.x, z - tree.z) - 0.35 * (tree.size || 1));
    return best;
  }
  const room = roomFn();
  function bedAt(x, z) {
    for (let index = 0; index < beds.length; index += 1) {
      if (insidePolygon(x, z, beds[index].outline)) return room(x, z) >= 0 ? index : -1;
    }
    return -1;
  }
  function depth(x, z, index) {
    const bed = beds[index];
    if (!bed || !insidePolygon(x, z, bed.outline)) return -1;
    return Math.min(polylineDistance(x, z, bed.outline, true), room(x, z));
  }
  return { paths, beds, room, roomFn, bedAt, depth };
}
