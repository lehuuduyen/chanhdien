// Đua xe (phòng duaxe, trang /dua-xe.html): phần dùng chung cho máy realtime (trọng tài, xe bot) và trình duyệt (lái xe
// của mình, vẽ đường đua, đoán xe người khác). Không phụ thuộc gì; trình duyệt tải ở /shared/race.mjs.
//
// Quy ước: mặt đất là mặt phẳng x–z (mét), y hướng lên. Hướng xe h (radian): mũi xe chỉ f = (sin h, cos h), giống
// rotation.y của three.js (h = 0 nhìn về +z). Bên trái người lái là n = (cos h, −sin h). Đánh lái phải (steer > 0) làm h
// giảm. Đường đua là một đường tâm khép kín lấy mẫu đều theo chiều dài: s = quãng đường từ vạch xuất phát, d = độ lệch
// sang trái đường tâm (âm = bên phải).

export const RACE_LAPS = 3;
// Thông số xe (một kiểu xe cho mọi người). vmax là trần tính gia tốc; tốc độ thật tối đa ~68 m/s (~245 km/h) vì lực cản.
export const CAR = Object.freeze({
  length: 5.4,
  width: 2.0,
  wheelBase: 3.6,
  // Thân xe va chạm = hai vòng tròn (mũi, đuôi) cách tâm `offset`.
  radius: 1.05,
  offset: 1.5,
  vmax: 78,
  accel: 13,
  brake: 30,
  coast: 1.2,
  drag: 0.0004,
  reverse: 9,
  // Gia tốc ngang tối đa (bám đường): vào cua nhanh hơn thì xe trượt thẳng (thiếu lái) và mất tốc độ.
  grip: 34,
  steer: 0.55,
  steerFade: 18,
  slipDecay: 5,
  // Ra khỏi mặt nhựa (cỏ, sỏi): bám kém đi, bị hãm thêm.
  offGrip: 0.6,
  offDrag: 8,
  restitution: 0.25,
});
// Bước mô phỏng cố định (trình duyệt và máy realtime cùng bước).
export const STEP = 1 / 60;
// Tốc độ tối đa máy chủ chấp nhận trong gói trạng thái xe (dư cho sai số gói tin).
export const SPEED_LIMIT = CAR.vmax + 4;
// Kerb (vạch đỏ trắng) rộng bao nhiêu mét ngoài mép nhựa; trong kerb vẫn bám như mặt nhựa.
export const KERB = 1.2;
// Số mốc kiểm tra trong một vòng: phải qua đủ theo thứ tự mới tính vòng (chặn cắt đường / chạy lùi qua vạch).
export const CHECKPOINTS = 12;
// Một lần cập nhật xe đi xa hơn mức này (mất gói lâu, bị đặt lại) thì các mốc ở giữa không tính là đã qua.
const MARK_JUMP = 80;

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const wrapAngle = (angle) => {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  else if (value <= -Math.PI) value += TAU;
  return value;
};

// ---- Đường đua ----

// Catmull-Rom hướng tâm (Barry–Goldman) qua p1 → p2.
function catmullRom(p0, p1, p2, p3, t) {
  const knot = (a, b) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  return mix(mix(a1, a2, 0, t2), mix(a2, a3, t1, t3), t1, t2);
}

// Làm mượt một mảng vòng (khép kín) bằng trung bình trượt ±radius.
function blurLoop(values, radius) {
  const count = values.length;
  const out = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) sum += values[(index + offset + count) % count];
    out[index] = sum / (2 * radius + 1);
  }
  return out;
}
function minLoop(values, radius) {
  const count = values.length;
  const out = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    let low = Infinity;
    for (let offset = -radius; offset <= radius; offset += 1) low = Math.min(low, values[(index + offset + count) % count]);
    out[index] = low;
  }
  return out;
}

function openLoop(values, radius) {
  const count = values.length;
  const opened = minLoop(values, radius);
  const out = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    let any = 0;
    for (let offset = -radius; offset <= radius; offset += 1) any = Math.max(any, opened[(index + offset + count) % count]);
    out[index] = any;
  }
  return out;
}

export function validateTrack(data) {
  if (!data || typeof data !== 'object') throw new TypeError('track phải là object');
  if (!Array.isArray(data.points) || data.points.length < 4 || data.points.length > 200
    || !data.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(value) && Math.abs(value) < 5_000))) {
    throw new TypeError('track.points cần 4–200 điểm [x, z]');
  }
  if (!(data.width >= 8 && data.width <= 30)) throw new RangeError('track.width 8–30 m');
  if (data.runoff !== undefined && !(data.runoff >= 2 && data.runoff <= 40)) throw new RangeError('track.runoff 2–40 m');
  return data;
}

// Dựng đường đua từ dữ liệu cảnh (scenes/race-*/track.json): lấy mẫu đường tâm mỗi ~step mét, hướng, độ cong, khoảng
// tới rào hai bên (rào phía trong cua tự lùi vào để không cắt nhau), đường chạy đẹp cho bot và bảng tốc độ.
export function buildTrack(data, { step = 2 } = {}) {
  validateTrack(data);
  const control = data.points;
  const width = data.width;
  const half = width / 2;
  const runoff = data.runoff ?? 10;
  // 1. Đường cong dày → lấy mẫu lại đều theo chiều dài.
  const dense = [];
  const count = control.length;
  for (let index = 0; index < count; index += 1) {
    const p0 = control[(index - 1 + count) % count];
    const p1 = control[index];
    const p2 = control[(index + 1) % count];
    const p3 = control[(index + 2) % count];
    const pieces = Math.max(8, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let piece = 0; piece < pieces; piece += 1) dense.push(catmullRom(p0, p1, p2, p3, piece / pieces));
  }
  const cumulative = [0];
  for (let index = 1; index <= dense.length; index += 1) {
    const a = dense[index - 1];
    const b = dense[index % dense.length];
    cumulative.push(cumulative[index - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cumulative[dense.length];
  const samples = Math.round(length / step);
  const ds = length / samples;
  const x = new Float64Array(samples);
  const z = new Float64Array(samples);
  let cursor = 0;
  for (let index = 0; index < samples; index += 1) {
    const target = index * ds;
    while (cumulative[cursor + 1] < target) cursor += 1;
    const a = dense[cursor];
    const b = dense[(cursor + 1) % dense.length];
    const w = (target - cumulative[cursor]) / Math.max(1e-9, cumulative[cursor + 1] - cumulative[cursor]);
    x[index] = a[0] + (b[0] - a[0]) * w;
    z[index] = a[1] + (b[1] - a[1]) * w;
  }
  // 2. Hướng, pháp tuyến trái, độ cong (dương = cua trái).
  const tx = new Float64Array(samples);
  const tz = new Float64Array(samples);
  const heading = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const next = (index + 1) % samples;
    const previous = (index - 1 + samples) % samples;
    const dx = x[next] - x[previous];
    const dz = z[next] - z[previous];
    const norm = Math.hypot(dx, dz) || 1;
    tx[index] = dx / norm;
    tz[index] = dz / norm;
    heading[index] = Math.atan2(tx[index], tz[index]);
  }
  let curvature = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const next = heading[(index + 2) % samples];
    const previous = heading[(index - 2 + samples) % samples];
    curvature[index] = wrapAngle(next - previous) / (4 * ds);
  }
  curvature = blurLoop(curvature, 2);
  // 3. Rào: mặc định nửa mặt đường + runoff; phía trong cua lùi về ≤ 0,85 bán kính; đoạn ghi đè trong data.walls
  //    ({ from, to } theo phần vòng 0–1, left / right = runoff riêng hai bên).
  let wallLeft = new Float64Array(samples);
  let wallRight = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) {
    let left = half + runoff;
    let right = half + runoff;
    const fraction = index / samples;
    for (const section of data.walls || []) {
      const inside = section.from <= section.to ? fraction >= section.from && fraction < section.to : fraction >= section.from || fraction < section.to;
      if (!inside) continue;
      if (Number.isFinite(section.left)) left = half + section.left;
      if (Number.isFinite(section.right)) right = half + section.right;
    }
    const k = curvature[index];
    if (k > 1e-4) left = Math.min(left, 0.85 / k);
    if (k < -1e-4) right = Math.min(right, 0.85 / -k);
    wallLeft[index] = Math.max(half + 1.5, left);
    wallRight[index] = Math.max(half + 1.5, right);
  }
  wallLeft = blurLoop(minLoop(wallLeft, 10), 5);
  wallRight = blurLoop(minLoop(wallRight, 10), 5);
  // Kerb: mép trong cua gắt và mép ngoài cua rất gắt (chỉ để vẽ).
  const kerbLeft = new Uint8Array(samples);
  const kerbRight = new Uint8Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const k = curvature[index];
    if (k > 1 / 140) kerbLeft[index] = 1;
    if (k < -1 / 140) kerbRight[index] = 1;
    if (k > 1 / 70) kerbRight[index] = 1;
    if (k < -1 / 70) kerbLeft[index] = 1;
  }
  const track = {
    id: data.id || 'track',
    name: data.name || '',
    data,
    width,
    half,
    length,
    step: ds,
    samples,
    x, z, tx, tz, heading, curvature,
    wallLeft: Float32Array.from(wallLeft),
    wallRight: Float32Array.from(wallRight),
    // Kerb liền mạch: bỏ đoạn lẻ ngắn (min rồi max ±2 mẫu).
    kerbLeft: openLoop(kerbLeft, 2),
    kerbRight: openLoop(kerbRight, 2),
  };
  track.project = (px, pz, hint = -1) => projectOnTrack(track, px, pz, hint);
  track.pointAt = (s, d = 0) => pointOnTrack(track, s, d);
  track.wallsAt = (index, t = 0) => wallsAt(track, index, t);
  track.checkpoints = Array.from({ length: CHECKPOINTS }, (_, index) => (index * length) / CHECKPOINTS);
  const line = racingLine(track);
  track.line = line.offset;
  track.lineSpeed = line.speed;
  track.minLapMs = Math.floor(idealLapMs(track, 1.15) * 0.85);
  return track;
}

function wallsAt(track, index, t = 0) {
  const next = (index + 1) % track.samples;
  return {
    left: track.wallLeft[index] + (track.wallLeft[next] - track.wallLeft[index]) * t,
    right: track.wallRight[index] + (track.wallRight[next] - track.wallRight[index]) * t,
  };
}

// Điểm trên đường tâm ở quãng s (mét, tự quấn vòng), lệch d sang trái.
export function pointOnTrack(track, s, d = 0) {
  const length = track.length;
  const wrapped = ((s % length) + length) % length;
  const position = wrapped / track.step;
  const index = Math.floor(position) % track.samples;
  const next = (index + 1) % track.samples;
  const t = position - Math.floor(position);
  const cx = track.x[index] + (track.x[next] - track.x[index]) * t;
  const cz = track.z[index] + (track.z[next] - track.z[index]) * t;
  let dx = track.tx[index] + (track.tx[next] - track.tx[index]) * t;
  let dz = track.tz[index] + (track.tz[next] - track.tz[index]) * t;
  const norm = Math.hypot(dx, dz) || 1;
  dx /= norm;
  dz /= norm;
  return { x: cx + dz * d, z: cz - dx * d, tx: dx, tz: dz, h: Math.atan2(dx, dz), index, t, s: wrapped };
}

// Chiếu điểm lên đường tâm. hint: chỉ số mẫu lần trước (tìm quanh đó, tránh nhảy sang đoạn đường song song);
// lạc quá 30 m thì tìm cả vòng.
export function projectOnTrack(track, px, pz, hint = -1) {
  const samples = track.samples;
  let best = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  const scan = (from, span) => {
    for (let step = 0; step < span; step += 1) {
      const index = (((from + step) % samples) + samples) % samples;
      const next = (index + 1) % samples;
      const ax = track.x[index];
      const az = track.z[index];
      const sx = track.x[next] - ax;
      const sz = track.z[next] - az;
      const t = clamp(((px - ax) * sx + (pz - az) * sz) / (sx * sx + sz * sz || 1), 0, 1);
      const dx = px - (ax + sx * t);
      const dz = pz - (az + sz * t);
      const distance = dx * dx + dz * dz;
      if (distance < best) {
        best = distance;
        bestIndex = index;
        bestT = t;
      }
    }
  };
  if (hint >= 0) scan(hint - 40, 81);
  if (hint < 0 || best > 900) {
    best = Infinity;
    scan(0, samples);
  }
  const next = (bestIndex + 1) % samples;
  const sx = track.x[next] - track.x[bestIndex];
  const sz = track.z[next] - track.z[bestIndex];
  const norm = Math.hypot(sx, sz) || 1;
  const ux = sx / norm;
  const uz = sz / norm;
  const cx = track.x[bestIndex] + sx * bestT;
  const cz = track.z[bestIndex] + sz * bestT;
  // Pháp tuyến trái của (ux, uz) là (uz, −ux).
  const d = (px - cx) * uz - (pz - cz) * ux;
  return { index: bestIndex, t: bestT, s: (bestIndex + bestT) * track.step, d, cx, cz, tx: ux, tz: uz, distance: Math.sqrt(best) };
}

// ---- Đường chạy đẹp cho bot ----

// "Dây chun": kéo từng điểm về trung điểm hai điểm hai bên (bước lớn rồi nhỏ) trong phạm vi mặt đường trừ lề —
// gần với đường ít cong nhất. Bảng tốc độ: vào cua theo bám đường, lùi lại theo quãng phanh.
export function racingLine(track, { margin = 2.4 } = {}) {
  const samples = track.samples;
  const limit = track.half - margin;
  const offset = new Float64Array(samples);
  const px = (index) => track.x[index] + track.tz[index] * offset[index];
  const pz = (index) => track.z[index] - track.tx[index] * offset[index];
  for (const stride of [24, 16, 10, 6, 3]) {
    for (let pass = 0; pass < 40; pass += 1) {
      for (let index = 0; index < samples; index += 1) {
        const a = (index - stride + samples) % samples;
        const b = (index + stride) % samples;
        const mx = (px(a) + px(b)) / 2;
        const mz = (pz(a) + pz(b)) / 2;
        const target = (mx - track.x[index]) * track.tz[index] - (mz - track.z[index]) * track.tx[index];
        offset[index] = clamp(offset[index] + (target - offset[index]) * 0.5, -limit, limit);
      }
    }
  }
  const smooth = blurLoop(offset, 2);
  for (let index = 0; index < samples; index += 1) offset[index] = clamp(smooth[index], -limit, limit);
  // Bán kính đường chạy qua ba điểm cách nhau 3 mẫu.
  const speed = new Float64Array(samples);
  const top = topSpeed();
  for (let index = 0; index < samples; index += 1) {
    const a = (index - 3 + samples) % samples;
    const b = (index + 3) % samples;
    const ax = px(a); const az = pz(a);
    const bx = px(index); const bz = pz(index);
    const cx = px(b); const cz = pz(b);
    const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    const sides = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
    const k = sides > 1e-9 ? (2 * area) / sides : 0;
    speed[index] = Math.min(top, k > 1e-5 ? Math.sqrt(CAR.grip / k) : top);
  }
  const ds = track.step;
  for (let round = 0; round < 2; round += 1) {
    for (let index = samples - 1; index >= 0; index -= 1) {
      const next = speed[(index + 1) % samples];
      speed[index] = Math.min(speed[index], Math.sqrt(next * next + 2 * CAR.brake * 0.8 * ds));
    }
  }
  return { offset: Float32Array.from(offset), speed: Float32Array.from(speed) };
}

// Tốc độ cao nhất xe đạt được (gia tốc máy = cản).
export function topSpeed() {
  let low = 0;
  let high = CAR.vmax;
  for (let index = 0; index < 40; index += 1) {
    const mid = (low + high) / 2;
    if (engineAccel(mid, 1) > 0) low = mid;
    else high = mid;
  }
  return low;
}

const TOP_SPEED = topSpeed();

function engineAccel(v, throttle) {
  const speed = Math.abs(v);
  return throttle * CAR.accel * Math.max(0, 1 - (speed / CAR.vmax) ** 2) - CAR.coast - CAR.drag * speed * speed;
}

// Thời gian một vòng lý tưởng theo đường chạy đẹp với bám đường × gripScale (mốc chặn vòng nhanh vô lý).
export function idealLapMs(track, gripScale = 1) {
  const samples = track.samples;
  const limit = new Float64Array(samples);
  for (let index = 0; index < samples; index += 1) limit[index] = track.lineSpeed[index] * Math.sqrt(gripScale);
  for (let round = 0; round < 2; round += 1) {
    for (let index = samples - 1; index >= 0; index -= 1) {
      const next = limit[(index + 1) % samples];
      limit[index] = Math.min(limit[index], Math.sqrt(next * next + 2 * CAR.brake * gripScale * track.step));
    }
  }
  let v = limit[0];
  let ms = 0;
  for (let round = 0; round < 2; round += 1) {
    ms = 0;
    for (let index = 0; index < samples; index += 1) {
      const accel = Math.max(0, engineAccel(v, 1));
      const next = Math.min(limit[(index + 1) % samples], Math.sqrt(v * v + 2 * accel * track.step));
      ms += (track.step / Math.max(1, (v + next) / 2)) * 1_000;
      v = next;
    }
  }
  return ms;
}

// ---- Xe ----

export function createCar({ x = 0, z = 0, h = 0, v = 0 } = {}) {
  return { x, z, h, v, vl: 0, index: -1, s: 0, d: 0, off: 0, steer: 0, impact: 0 };
}

const forwardOf = (h) => [Math.sin(h), Math.cos(h)];
const leftOf = (h) => [Math.cos(h), -Math.sin(h)];

// Đặt xe lên đường (chiếu lại chỉ số mẫu, độ lệch) — dùng sau khi đặt vị trí từ ngoài (lưới xuất phát, gói mạng).
export function placeCar(car, track) {
  const projected = track.project(car.x, car.z, car.index);
  car.index = projected.index;
  car.s = projected.s;
  car.d = projected.d;
  return car;
}

// Một bước vật lý. input: { throttle 0–1, brake 0–1, steer −1 (trái) … 1 (phải) }.
export function stepCar(car, input, dt, track) {
  const throttle = clamp(Number(input?.throttle) || 0, 0, 1);
  const brake = clamp(Number(input?.brake) || 0, 0, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  // Mặt đường dưới xe (lấy theo lần chiếu trước, đủ chính xác cho 1/60 giây).
  const off = clamp((Math.abs(car.d) - track.half - KERB) / 2, 0, 1);
  car.off = off;
  const grip = CAR.grip * (1 - (1 - CAR.offGrip) * off);
  let v = car.v;
  let accel = 0;
  if (v > 0.5 || (v >= -0.5 && brake === 0)) {
    accel = engineAccel(v, throttle) + (v > 0 ? 0 : CAR.coast);
    accel -= brake * CAR.brake * (v > 0 ? 1 : 0);
  } else {
    // Gần đứng yên / đang lùi: phanh = lùi xe.
    accel = -brake * 5 + (v < 0 ? CAR.coast : 0) + throttle * CAR.accel;
  }
  if (off > 0 && Math.abs(v) > 0.5) accel -= Math.sign(v) * CAR.offDrag * off;
  const before = v;
  v += accel * dt;
  // Không để lực cản / phanh đổi chiều xe (chỉ lùi khi giữ phanh lúc gần đứng yên).
  if (before > 0 && v < 0 && brake < 1) v = 0;
  if (before < 0 && v > 0 && throttle === 0) v = 0;
  v = clamp(v, -CAR.reverse, CAR.vmax);
  // Đánh lái: góc lái nhỏ dần theo tốc độ; vòng quay giới hạn theo bám đường (vào cua quá nhanh thì thiếu lái, mất tốc).
  car.steer += (steer - car.steer) * Math.min(1, dt * 10);
  const angle = (car.steer * CAR.steer) / (1 + Math.abs(v) / CAR.steerFade);
  let yaw = (v * Math.tan(angle)) / CAR.wheelBase;
  const yawLimit = grip / Math.max(Math.abs(v), 3);
  if (Math.abs(yaw) > yawLimit) {
    const excess = Math.abs(yaw) - yawLimit;
    yaw = Math.sign(yaw) * yawLimit;
    v -= Math.sign(v) * Math.min(Math.abs(v), excess * Math.abs(v) * 0.35 * dt);
  }
  car.h = wrapAngle(car.h - yaw * dt);
  car.v = v;
  car.vl *= Math.exp(-CAR.slipDecay * (grip / CAR.grip) * dt);
  if (Math.abs(car.vl) < 0.01) car.vl = 0;
  const [fx, fz] = forwardOf(car.h);
  const [lx, lz] = leftOf(car.h);
  car.x += (fx * car.v + lx * car.vl) * dt;
  car.z += (fz * car.v + lz * car.vl) * dt;
  placeCar(car, track);
  car.impact = Math.max(0, car.impact - dt * 2);
  collideWalls(car, track);
  return car;
}

function setVelocity(car, vx, vz) {
  const [fx, fz] = forwardOf(car.h);
  const [lx, lz] = leftOf(car.h);
  car.v = clamp(vx * fx + vz * fz, -CAR.reverse, CAR.vmax);
  car.vl = clamp(vx * lx + vz * lz, -30, 30);
}
function velocityOf(car) {
  const [fx, fz] = forwardOf(car.h);
  const [lx, lz] = leftOf(car.h);
  return [fx * car.v + lx * car.vl, fz * car.v + lz * car.vl];
}

// Va rào: đẩy xe vào trong, nảy theo pháp tuyến rào, xe xoay dần theo hướng rào (lướt dọc rào).
export function collideWalls(car, track) {
  let hit = 0;
  const [fx, fz] = forwardOf(car.h);
  for (const side of [1, -1]) {
    const cx = car.x + fx * CAR.offset * side;
    const cz = car.z + fz * CAR.offset * side;
    const projected = track.project(cx, cz, car.index);
    const walls = track.wallsAt(projected.index, projected.t);
    // Pháp tuyến trái của đường tâm tại điểm chiếu.
    const nx = projected.tz;
    const nz = -projected.tx;
    let push = 0;
    let sign = 0;
    if (projected.d + CAR.radius > walls.left) {
      push = projected.d + CAR.radius - walls.left;
      sign = -1;
    } else if (projected.d - CAR.radius < -walls.right) {
      push = -walls.right - (projected.d - CAR.radius);
      sign = 1;
    }
    if (!push) continue;
    // Hướng đẩy vào trong đường.
    const ix = nx * sign;
    const iz = nz * sign;
    car.x += ix * push;
    car.z += iz * push;
    const [vx, vz] = velocityOf(car);
    const into = vx * ix + vz * iz;
    if (into < 0) {
      const bounce = -(1 + CAR.restitution) * into;
      // Ma sát dọc rào: mất tốc độ theo độ mạnh cú va.
      const scrub = clamp(1 - Math.abs(into) * 0.035, 0.55, 1);
      const tx = vx - into * ix;
      const tz = vz - into * iz;
      setVelocity(car, tx * scrub + ix * (bounce + into), tz * scrub + iz * (bounce + into));
      // Xoay mũi xe theo hướng rào (phía gần hướng đang chạy).
      let along = Math.atan2(projected.tx, projected.tz);
      if (Math.abs(wrapAngle(along - car.h)) > Math.PI / 2) along = wrapAngle(along + Math.PI);
      car.h = wrapAngle(car.h + wrapAngle(along - car.h) * clamp(Math.abs(into) / 25, 0.05, 0.35));
      hit = Math.max(hit, Math.abs(into));
    }
  }
  if (hit) {
    car.impact = Math.max(car.impact, clamp(hit / 15, 0.2, 1));
    placeCar(car, track);
  }
  return hit;
}

// Va xe – xe (thân xe = hai vòng tròn). Máy trình duyệt chỉ đẩy xe của mình (moveOther = false, xe kia do máy người đó
// tự đẩy theo cùng cách nên hai bên khớp nhau); máy realtime đẩy cả hai bot (moveOther = true). Trả độ mạnh cú va.
export function collideCars(a, b, { moveOther = false } = {}) {
  const dx0 = a.x - b.x;
  const dz0 = a.z - b.z;
  const reach = CAR.offset * 2 + CAR.radius * 2;
  if (dx0 * dx0 + dz0 * dz0 > reach * reach) return 0;
  const [afx, afz] = forwardOf(a.h);
  const [bfx, bfz] = forwardOf(b.h);
  let deepest = null;
  for (const sa of [1, -1]) {
    for (const sb of [1, -1]) {
      const ax = a.x + afx * CAR.offset * sa;
      const az = a.z + afz * CAR.offset * sa;
      const bx = b.x + bfx * CAR.offset * sb;
      const bz = b.z + bfz * CAR.offset * sb;
      const distance = Math.hypot(ax - bx, az - bz);
      const overlap = CAR.radius * 2 - distance;
      if (overlap > 0 && (!deepest || overlap > deepest.overlap)) deepest = { overlap, sa, ax, az, bx, bz, distance };
    }
  }
  if (!deepest) return 0;
  let nx = deepest.ax - deepest.bx;
  let nz = deepest.az - deepest.bz;
  const norm = Math.hypot(nx, nz);
  if (norm < 1e-6) {
    // Trùng tâm (vừa đặt xe chồng lên nhau): đẩy theo bên trái xe a.
    [nx, nz] = leftOf(a.h);
  } else {
    nx /= norm;
    nz /= norm;
  }
  const share = moveOther ? 0.5 : 1;
  a.x += nx * deepest.overlap * share;
  a.z += nz * deepest.overlap * share;
  if (moveOther) {
    b.x -= nx * deepest.overlap * 0.5;
    b.z -= nz * deepest.overlap * 0.5;
  }
  const [avx, avz] = velocityOf(a);
  const [bvx, bvz] = velocityOf(b);
  const closing = (avx - bvx) * nx + (avz - bvz) * nz;
  if (closing >= 0) return deepest.overlap;
  const impulse = (-(1 + CAR.restitution) * closing) / 2;
  setVelocity(a, avx + nx * impulse, avz + nz * impulse);
  // Va lệch tâm làm xe xoay một chút (mô-men = cánh tay đòn × xung lực).
  const arm = CAR.offset * deepest.sa;
  a.h = wrapAngle(a.h + (afx * arm * nz - afz * arm * nx) * impulse * 0.012);
  a.impact = Math.max(a.impact, clamp(-closing / 15, 0.1, 1));
  if (moveOther) {
    setVelocity(b, bvx - nx * impulse, bvz - nz * impulse);
    b.impact = Math.max(b.impact, clamp(-closing / 15, 0.1, 1));
  }
  return -closing;
}

// ---- Lưới xuất phát và chỗ ra đường khi chạy thử ----

// Ô số index (0 = pole) sau vạch xuất phát: hai hàng so le, mỗi ô cách 8 m.
export function gridSlot(track, index) {
  const s = track.length - 12 - index * 8;
  const d = index % 2 === 0 ? 3 : -3;
  const point = track.pointAt(s, d);
  return { x: point.x, z: point.z, h: point.h, s: point.s, d };
}

// Chỗ ra đường khi chạy thử / bị kẹt: ngay sau vạch, so le theo số thứ tự.
export function spawnPoint(track, index = 0) {
  const s = 30 + (index % 6) * 14;
  const d = index % 2 === 0 ? 2.5 : -2.5;
  const point = track.pointAt(s, d);
  return { x: point.x, z: point.z, h: point.h, s: point.s, d };
}

// Đặt lại xe giữa đường ở quãng s (xe lật / kẹt rào): lùi về sau một chút, mũi theo đường.
export function rescuePoint(track, s) {
  const point = track.pointAt(s - 6, 0);
  return { x: point.x, z: point.z, h: point.h, s: point.s, d: 0 };
}

// ---- Tính vòng ----

// Đếm vòng theo đường tâm: phải qua đủ CHECKPOINTS mốc theo thứ tự rồi qua vạch mới thành một vòng; thời điểm qua vạch
// nội suy giữa hai lần cập nhật. Chạy lùi qua vạch thì phải chạy lại từ đầu (chưa bắt đầu vòng).
export function createLapTracker(track) {
  const marks = track.checkpoints;
  const state = {
    index: -1,
    s: null,
    t: null,
    started: false,
    // Đang ở lưới xuất phát (sau vạch): lần qua vạch đầu chỉ là bắt đầu vòng 1.
    grid: false,
    next: 1,
    lap: 0,
    lapStart: 0,
    clean: true,
    best: null,
    laps: [],
  };
  const tracker = {
    state,
    // Vào cuộc đua: vòng 1 tính từ lúc đèn tắt (startAt), xe đang ở sau vạch.
    startRace(startAt) {
      Object.assign(state, { started: true, grid: true, next: marks.length, lap: 0, lapStart: startAt, clean: true, laps: [], best: null });
    },
    reset() {
      Object.assign(state, { index: -1, s: null, t: null, started: false, grid: false, next: 1, lap: 0, clean: true, laps: [], best: null });
    },
    // Vòng đang chạy không được tính kỷ lục (bị máy chủ bác gói tin, đặt lại xe…).
    taint() { state.clean = false; },
    // Quãng đường đã chạy (xếp hạng): số vòng × chiều dài + vị trí trong vòng.
    progress() {
      if (state.s === null) return 0;
      if (!state.started || state.grid) return state.s - track.length;
      return state.lap * track.length + state.s;
    },
    update(x, z, t) {
      const projected = track.project(x, z, state.index);
      const s1 = projected.s;
      const events = [];
      if (state.s !== null) {
        const s0 = state.s;
        let delta = s1 - s0;
        if (delta < -track.length / 2) {
          // Qua vạch theo chiều đua.
          const crossAt = state.t + (t - state.t) * ((track.length - s0) / Math.max(1e-6, s1 + track.length - s0));
          if (s1 + track.length - s0 <= MARK_JUMP) passMarks(s0, track.length);
          if (!state.started) {
            state.started = true;
            state.lapStart = crossAt;
            state.clean = true;
          } else if (state.grid) {
            state.grid = false;
          } else if (state.next >= marks.length) {
            const ms = Math.round(crossAt - state.lapStart);
            state.lap += 1;
            const valid = state.clean && ms >= track.minLapMs;
            state.laps.push({ ms, valid });
            if (valid && (state.best === null || ms < state.best)) state.best = ms;
            events.push({ type: 'lap', lap: state.lap, ms, valid });
            state.lapStart = crossAt;
            state.clean = true;
          } else {
            // Thiếu mốc (cắt đường / quay đầu giữa chừng): vòng này không tính, bắt đầu vòng mới.
            events.push({ type: 'missed', lap: state.lap + 1 });
            state.lapStart = crossAt;
            state.clean = true;
          }
          state.next = 1;
          if (s1 + track.length - s0 <= MARK_JUMP) passMarks(0, s1);
        } else if (delta > track.length / 2) {
          // Lùi qua vạch: phải chạy lại.
          state.started = false;
          state.grid = false;
          state.next = 1;
        } else if (delta > 0 && delta <= MARK_JUMP) passMarks(s0, s1);
      }
      state.index = projected.index;
      state.s = s1;
      state.t = t;
      return events;
    },
  };
  function passMarks(from, to) {
    while (state.next < marks.length && marks[state.next] > from && marks[state.next] <= to) state.next += 1;
  }
  return tracker;
}

// ---- Tài xế máy ----

// skill 0,85–1: phần bám đường bot dám dùng (tốc độ vào cua ∝ √skill); lane: lệch đường chạy riêng mỗi bot (m).
export function createDriver({ skill = 0.93, lane = 0, random = Math.random } = {}) {
  return { skill, lane, random, avoid: 0, stuck: 0, lift: 0 };
}

// Bot đọc vị trí xe mình và các xe khác, trả lệnh lái. Theo đường chạy đẹp (pure pursuit), ga / phanh theo bảng tốc độ,
// né xe phía trước bằng cách lệch sang bên rộng hơn.
export function driveBot(driver, car, track, others = []) {
  const speed = Math.abs(car.v);
  // Né xe: xe đang chạy song song thì giữ khoảng cách ngang; xe phía trước trong 30 m cùng làn thì lệch sang bên rộng.
  let side = 0;
  let front = null;
  let yieldTo = false;
  let blocked = false;
  const fits = (lateral) => Math.abs(lateral) < track.half - 1.6;
  for (const other of others) {
    if (other === car) continue;
    let gap = other.s - car.s;
    if (gap < -track.length / 2) gap += track.length;
    if (gap > track.length / 2) gap -= track.length;
    const lateral = other.d - car.d;
    if (Math.abs(gap) < 6.5 && Math.abs(lateral) < 3.2) {
      const away = lateral > 0 ? -1 : 1;
      if (fits(car.d + away * 1.5)) side += away * (3.2 - Math.abs(lateral));
      // Bị ép sát mép đường: xe phía sau nhả ga nhường.
      else if (gap >= 0) yieldTo = true;
      continue;
    }
    if (gap > 0 && gap < 30 && Math.abs(lateral) < 2.6 && (!front || gap < front.gap)) front = { gap, other };
  }
  let pass = 0;
  if (front) {
    const { other, gap } = front;
    const left = other.d + 3.4;
    const right = other.d - 3.4;
    const target = other.d <= car.d ? (fits(left) ? left : right) : (fits(right) ? right : left);
    pass = target - car.d;
    if (gap < 9 && car.v > other.v) blocked = true;
  }
  driver.avoid += (clamp(side + pass, -4.5, 4.5) - driver.avoid) * 0.08;
  const lookahead = 7 + speed * 0.35;
  const targetS = car.s + lookahead;
  const lineIndex = Math.floor((((targetS % track.length) + track.length) % track.length) / track.step) % track.samples;
  const lateral = clamp(track.line[lineIndex] + driver.lane + driver.avoid, -(track.half - 1.3), track.half - 1.3);
  const target = track.pointAt(targetS, lateral);
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const [fx, fz] = forwardOf(car.h);
  const [lx, lz] = leftOf(car.h);
  const ahead = dx * fx + dz * fz;
  const left = dx * lx + dz * lz;
  const alpha = Math.atan2(left, Math.max(0.1, ahead));
  const curvature = (2 * Math.sin(alpha)) / Math.max(1, Math.hypot(dx, dz));
  const angle = Math.atan(curvature * CAR.wheelBase);
  const steerMax = CAR.steer / (1 + speed / CAR.steerFade);
  const steer = clamp(-angle / steerMax, -1, 1);
  // Tốc độ đích phía trước một quãng phản xạ.
  const ahead2 = car.s + speed * 0.3;
  const speedIndex = Math.floor((((ahead2 % track.length) + track.length) % track.length) / track.step) % track.samples;
  // Trình độ: vào cua theo √skill phần bám đường, đường thẳng không vượt skill × tốc độ tối đa.
  let wanted = Math.min(track.lineSpeed[speedIndex] * Math.sqrt(driver.skill), TOP_SPEED * driver.skill);
  if (driver.lift > 0) wanted *= 0.9;
  if (blocked) wanted = Math.min(wanted, speed - 1);
  if (yieldTo) wanted = Math.min(wanted, speed - 3);
  let throttle = 0;
  let brake = 0;
  if (car.v > wanted + 0.8) brake = clamp((car.v - wanted) / 5, 0.15, 1);
  else throttle = clamp((wanted - car.v) / 3 + 0.55, 0, 1);
  // Hiếm khi "nhấc chân" (thiếu tập trung) cho cuộc đua có thay đổi.
  if (driver.lift > 0) driver.lift -= 1;
  else if (driver.random() < 0.0015) driver.lift = 40;
  return { throttle, brake, steer };
}

// Làm tròn trạng thái xe để gửi qua mạng (1 cm, 0,001 rad, 0,01 m/s). Tốc độ tên `speed` (`v` là phiên bản protocol).
export const roundCar = (car) => ({
  x: Math.round(car.x * 100) / 100,
  z: Math.round(car.z * 100) / 100,
  h: Math.round(wrapAngle(car.h) * 1_000) / 1_000,
  speed: Math.round(car.v * 100) / 100,
});

// Màu xe (chỉ số 0–7 trong protocol): tên + mã màu để vẽ (đổi sắc độ phần thân đỏ của mô hình).
export const CAR_COLORS = Object.freeze([
  { id: 'red', hex: '#d8232a' },
  { id: 'blue', hex: '#1f5fd6' },
  { id: 'yellow', hex: '#f2c21b' },
  { id: 'green', hex: '#1f9d55' },
  { id: 'orange', hex: '#f07a1a' },
  { id: 'purple', hex: '#7b3fc9' },
  { id: 'teal', hex: '#13a5a5' },
  { id: 'pink', hex: '#e0467c' },
]);
