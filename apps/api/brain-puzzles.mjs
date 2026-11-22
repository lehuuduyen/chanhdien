// Khu Trí tuệ (app 🧠 trong điện thoại chánh điện): sinh đề cho 5 trò của "Đề hôm nay" và 20 câu "Test IQ vui", chấm
// điểm, đổi điểm test ra chỉ số tham khảo. Đề do code tự sinh từ một hạt giống (seed) nên không cạn, không chép đề có bản
// quyền, và server dựng lại được đúng đề lúc chấm (không phải lưu đáp án). Trình duyệt chỉ nhận đề, không nhận đáp án
// (trừ những gì phải hiện ra màn hình để chơi: thứ tự chuông, màu mực, phép tính).
//
// Độ khó mỗi câu 1–5; từ 3 trở lên là "câu khó". Mọi bài nhiều câu có 80 % câu khó (HARD_SHARE): Test IQ 16 / 20 câu,
// Đố hình và Đố số của Đề hôm nay 8 / 10 câu, Tính nhẩm và Màu mực 4 / 5 câu.
//
// Loại câu (kind):
//   matrix   — Ma trận: bảng 3 × 3, hình / màu / số lượng / cỡ đổi theo luật hàng, cột, chéo (mỗi hàng / cột đủ 3 giá
//              trị) hoặc cộng (cột 3 = cột 1 + cột 2); chọn ô còn thiếu. Câu khó có 3–4 thuộc tính cùng đổi.
//   rotation — Xoay hình: hình ghép từ 4–6 ô vuông; chọn hình là chính nó đã xoay (các phương án còn lại là hình lật).
//   series   — Dãy số: 20 kiểu (cộng, nhân, bình phương, lập phương, Fibonacci, số nguyên tố, hiệu tăng gấp đôi, xen kẽ
//              hai dãy, xen kẽ hai phép, giai thừa…); tìm số kế tiếp.
//   numgrid  — Bảng số: mỗi hàng 3 số theo cùng một phép (a + b, a × b, (a + b) × 2, a² + b, tổng hàng không đổi…);
//              tìm số còn thiếu. Hai hàng đầu chỉ khớp đúng một phép.
// Trò (mỗi trò tối đa 100 điểm, Đề hôm nay tối đa 500):
//   bells  — Nhớ tiếng chuông: chuông / mõ / khánh / trống vang theo thứ tự, gõ lại; mỗi lượt dài thêm một tiếng. Từ
//            chuỗi 5 tiếng, lượt lẻ (5, 7, 9…) phải gõ NGƯỢC lại.
//   matrix — Đố hình: 10 câu ma trận + xoay hình.
//   series — Đố số: 10 câu dãy số + bảng số.
//   math   — Tính nhẩm 60 giây: câu khó là phép hai bước (nhân chia trước), bình phương, phần trăm, nhân / chia số lớn.
//   stroop — Màu mực 40 giây: chữ tên màu tô bằng màu khác; câu khó đổi luật bất ngờ (🖌 chọn màu mực / 🔤 chọn theo chữ).

export const BRAIN_GAMES = Object.freeze(['bells', 'matrix', 'series', 'math', 'stroop']);
// Thời gian tối đa mỗi lượt (ms). Server cho thêm BRAIN_SLACK_MS cho trễ mạng / máy chậm.
export const BRAIN_LIMITS = Object.freeze({ bells: 180_000, matrix: 150_000, series: 150_000, math: 60_000, stroop: 40_000, iq: 900_000, duel: 180_000 });
export const BRAIN_SLACK_MS = 15_000;
export const HARD_SHARE = 0.8;
export const HARD_LEVEL = 3;
export const BELL_SEQUENCE = 14;
export const BELL_START = 3;
export const QUIZ_ITEMS = 10;
export const SPEED_ITEMS = 60;
export const IQ_ITEMS = 20;
export const IQ_KINDS = Object.freeze(['matrix', 'rotation', 'series', 'numgrid']);
// Đấu trí 1–1 (khiêu chiến trong phòng): hai bên cùng một đề DUEL_ITEMS câu, ai đúng nhiều hơn thắng, bằng thì ai nhanh hơn.
export const DUEL_ITEMS = 10;
// Đố vui nhiều người (phòng chánh điện): QUIZ_ROOM_ITEMS câu, 2 dễ rồi 10 khó (83 %), đủ 4 loại; máy realtime giữ đáp án.
export const QUIZ_ROOM_ITEMS = 12;
// Chỉ số tham khảo khi chưa đủ người làm bài: giả định số câu đúng phân bố chuẩn quanh 9 / 20 (bài có 16 câu khó), độ
// lệch 3,5.
export const IQ_PRIOR = Object.freeze({ mean: 9, sd: 3.5 });
// Đủ IQ_SAMPLE_MIN bài đã làm thì tính theo người chơi thật; hiện "cao hơn X % người làm bài" từ IQ_PERCENT_MIN bài.
export const IQ_SAMPLE_MIN = 100;
export const IQ_PERCENT_MIN = 30;

// Lượt Nhớ tiếng chuông phải gõ ngược: chuỗi từ 5 tiếng, độ dài lẻ.
export const bellReverse = (length) => length >= 5 && length % 2 === 1;

// ---- Số ngẫu nhiên có hạt giống (mulberry32): cùng seed ra cùng đề ----
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
function shuffle(random, list) {
  const out = [...list];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ---- Ma trận ----
// Một ô: s hình (0 tròn, 1 vuông, 2 tam giác, 3 cánh sen), c màu (0 vàng, 1 đỏ, 2 ngọc, 3 lam), n số lượng (1–3),
// z cỡ (0 nhỏ, 1 vừa, 2 to), f kiểu tô (0 đặc, 1 viền; cả bảng một kiểu). Luật mỗi thuộc tính trên bảng 3 × 3 (r hàng,
// k cột, p = 3 giá trị khác nhau): row cả hàng giống nhau · col cả cột giống nhau · latinA / latinB mỗi hàng, cột đủ
// 3 giá trị (chéo hai chiều) · sum (chỉ số lượng) cột 3 = cột 1 + cột 2 · const cả bảng một giá trị. Ô thiếu là ô cuối.
const ATTRS = ['s', 'c', 'n', 'z'];
const VALUES = { s: [0, 1, 2, 3], c: [0, 1, 2, 3], n: [1, 2, 3], z: [0, 1, 2] };
const DEFAULTS = { s: null, c: null, n: null, z: 1 };
const RULE_AT = {
  row: (r) => r,
  col: (r, k) => k,
  latinA: (r, k) => (r + k) % 3,
  latinB: (r, k) => (r + 2 * k) % 3,
};
const SUM_ROWS = [[1, 1, 2], [1, 2, 3], [2, 1, 3]];
// Độ khó 1–5: các luật được dùng (mỗi luật một thuộc tính; còn lại giữ nguyên cả bảng).
const MATRIX_PLANS = {
  1: [['row'], ['col']],
  2: [['row', 'col'], ['col', 'row'], ['latinA']],
  3: [['latinA', 'col', 'row'], ['row', 'latinA', 'col'], ['latinB', 'latinA'], ['sum', 'row']],
  4: [['latinA', 'latinB', 'col'], ['sum', 'latinA', 'row'], ['latinA', 'row', 'col', 'latinB'], ['sum', 'latinB', 'latinA']],
  5: [['latinA', 'latinB', 'latinA', 'latinB'], ['sum', 'latinA', 'latinB', 'col'], ['latinB', 'latinA', 'row', 'latinA'], ['sum', 'latinB', 'latinA', 'latinB']],
};

// Ô cuối `option` có làm cả bảng theo luật không (thuộc tính nào cũng phải theo một luật, cùng kiểu tô). Dùng để loại
// phương án sai vô tình cũng hợp luật (đề chỉ có một đáp án).
export function matrixConsistent(cells, option) {
  const grid = [...cells, option];
  if (!grid.every((cell) => cell.f === grid[0].f)) return false;
  return ATTRS.every((attr) => {
    const at = (r, k) => grid[r * 3 + k][attr];
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((k) => at(r, k)));
    const cols = [0, 1, 2].map((k) => [0, 1, 2].map((r) => at(r, k)));
    const same = (list) => list.every((value) => value === list[0]);
    const distinct = (list) => new Set(list).size === 3;
    if (same(grid.map((cell) => cell[attr]))) return true;
    if (rows.every(same) && distinct(rows.map((row) => row[0]))) return true;
    if (cols.every(same) && distinct(cols.map((col) => col[0]))) return true;
    if (rows.every(distinct) && cols.every(distinct) && new Set(grid.map((cell) => cell[attr])).size === 3) return true;
    if (attr === 'n' && rows.every((row) => row[2] === row[0] + row[1])) return true;
    return false;
  });
}

export function matrixItem(random, level) {
  for (;;) {
    const item = matrixTry(random, clamp(level, 1, 5));
    if (item) return item;
  }
}

function matrixTry(random, level) {
  const plan = pick(random, MATRIX_PLANS[level]);
  const rules = {};
  const free = shuffle(random, ATTRS.filter((attr) => attr !== 'n' || !plan.includes('sum')));
  for (const rule of plan) {
    const attr = rule === 'sum' ? 'n' : free.shift();
    rules[attr] = { rule, values: rule === 'sum' ? shuffle(random, SUM_ROWS) : shuffle(random, VALUES[attr]).slice(0, 3) };
    // Số lượng theo cột ở mức dễ: tăng dần 1, 2, 3 cho dễ nhìn.
    if (attr === 'n' && rule === 'col' && level <= 2) rules[attr].values = [1, 2, 3];
  }
  for (const attr of ATTRS) {
    if (!rules[attr]) rules[attr] = { rule: 'const', values: [DEFAULTS[attr] ?? pick(random, VALUES[attr])] };
  }
  const fill = level >= 4 ? int(random, 0, 1) : 0;
  const cellAt = (r, k) => {
    const cell = { f: fill };
    for (const attr of ATTRS) {
      const { rule, values } = rules[attr];
      cell[attr] = rule === 'const' ? values[0] : rule === 'sum' ? values[r][k] : values[RULE_AT[rule](r, k)];
    }
    return cell;
  };
  const cells = [];
  for (let r = 0; r < 3; r += 1) for (let k = 0; k < 3; k += 1) cells.push(cellAt(r, k));
  const answer = cells.pop();
  // Phương án sai: đổi một thuộc tính, đổi hai thuộc tính, mức 4–5 có một cái chỉ khác kiểu tô. Thuộc tính theo luật
  // chéo chỉ đổi sang giá trị trong bộ 3 đang dùng (giá trị lạ vẫn làm mỗi hàng / cột đủ 3 giá trị khác nhau); cuối cùng
  // bỏ mọi phương án vô tình cũng hợp luật.
  const key = (cell) => ATTRS.map((attr) => cell[attr]).join('') + cell.f;
  const pool = (attr) => (rules[attr].rule.startsWith('latin') ? rules[attr].values : VALUES[attr]).filter((value) => value !== answer[attr]);
  const seen = new Set([key(answer)]);
  const one = [];
  const two = [];
  const add = (list, cell) => {
    if (seen.has(key(cell)) || matrixConsistent(cells, cell)) return;
    seen.add(key(cell));
    list.push(cell);
  };
  for (const attr of shuffle(random, ATTRS)) for (const value of shuffle(random, pool(attr))) add(one, { ...answer, [attr]: value });
  const varying = ATTRS.filter((attr) => rules[attr].rule !== 'const');
  for (let tries = 0; tries < 12 && two.length < 2; tries += 1) {
    const [a, b] = shuffle(random, varying.length >= 2 ? varying : ATTRS);
    add(two, { ...answer, [a]: pick(random, pool(a)), [b]: pick(random, pool(b)) });
  }
  const options = [...shuffle(random, one).slice(0, level >= 4 ? 3 : 4), ...two.slice(0, 1)];
  if (level >= 4) {
    const flipped = { ...answer, f: 1 - answer.f };
    if (!seen.has(key(flipped))) options.push(flipped);
  }
  for (const cell of shuffle(random, [...one, ...two])) if (options.length < 5 && !options.includes(cell)) options.push(cell);
  if (options.length < 5) return null;
  const order = shuffle(random, [answer, ...options.slice(0, 5)]);
  return { problem: { kind: 'matrix', level, cells, options: order }, answer: order.indexOf(answer) };
}

// ---- Xoay hình ----
// Hình ghép từ ô vuông (tọa độ [x, y]); chuẩn hóa = dời về góc (0, 0) rồi sắp xếp, so được bằng chuỗi.
const normalize = (shape) => {
  const minX = Math.min(...shape.map(([x]) => x));
  const minY = Math.min(...shape.map(([, y]) => y));
  return shape.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const shapeKey = (shape) => normalize(shape).map(([x, y]) => `${x},${y}`).join(';');
const rotate = (shape, turns) => {
  let out = shape;
  for (let index = 0; index < turns; index += 1) out = out.map(([x, y]) => [-y, x]);
  return normalize(out);
};
const mirror = (shape) => normalize(shape.map(([x, y]) => [-x, y]));
export const rotationsOf = (shape) => [0, 1, 2, 3].map((turns) => shapeKey(rotate(shape, turns)));

export function rotationItem(random, level) {
  const cellCount = level >= 5 ? 7 : level >= 4 ? 6 : 5;
  const span = level >= 4 ? 4 : 3;
  for (;;) {
    // Hình liền khối: bắt đầu một ô, thêm dần ô kề.
    const cells = [[int(random, 0, span - 1), int(random, 0, span - 1)]];
    for (let guard = 0; cells.length < cellCount && guard < 200; guard += 1) {
      const [x, y] = pick(random, cells);
      const [dx, dy] = pick(random, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const next = [x + dx, y + dy];
      if (next[0] < 0 || next[1] < 0 || next[0] >= span || next[1] >= span) continue;
      if (!cells.some(([cx, cy]) => cx === next[0] && cy === next[1])) cells.push(next);
    }
    if (cells.length < cellCount) continue;
    const shape = normalize(cells);
    const turns = rotationsOf(shape);
    const mirrored = mirror(shape);
    const flips = [0, 1, 2, 3].map((index) => rotate(mirrored, index));
    // Hình phải "có tay trái tay phải": hình lật không trùng bất kỳ hình xoay nào; đủ 3 hình lật khác nhau làm phương án sai.
    if (flips.some((flip) => turns.includes(shapeKey(flip)))) continue;
    const wrong = [];
    for (const flip of shuffle(random, flips)) if (!wrong.some((other) => shapeKey(other) === shapeKey(flip))) wrong.push(flip);
    const rotated = [1, 2, 3].map((index) => rotate(shape, index)).filter((form) => shapeKey(form) !== shapeKey(shape));
    if (wrong.length < 3 || !rotated.length) continue;
    const answer = pick(random, rotated);
    const order = shuffle(random, [answer, ...wrong.slice(0, 3)]);
    return { problem: { kind: 'rotation', level, shape, options: order }, answer: order.indexOf(answer) };
  }
}

// ---- Dãy số ----
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61];
const SERIES_KINDS = {
  1: ['add', 'sub'],
  2: ['mul', 'add', 'square', 'sub'],
  3: ['grow', 'square', 'mulAdd', 'interleave', 'alternate', 'triangle'],
  4: ['fib', 'alternateMul', 'squarePlus', 'primes', 'doubleDiff', 'growMul', 'interleaveMul'],
  5: ['factorial', 'cube', 'fibMul', 'powerPlus', 'mulSub', 'cubeMinus', 'primeGap', 'squareAlternate'],
};
function seriesTerms(random, level) {
  const kind = pick(random, SERIES_KINDS[clamp(level, 1, 5)]);
  const terms = [];
  const push = (count, next) => {
    for (let index = 0; index < count; index += 1) terms.push(next(index));
  };
  if (kind === 'add') {
    const start = int(random, 1, 30);
    const step = int(random, 2, 9 + level * 2);
    push(6, (index) => start + index * step);
  } else if (kind === 'sub') {
    const step = int(random, 3, 12 + level);
    const start = step * 6 + int(random, 5, 40);
    push(6, (index) => start - index * step);
  } else if (kind === 'mul') {
    const ratio = pick(random, [2, 3]);
    const start = int(random, 1, ratio === 2 ? 6 : 3);
    push(6, (index) => start * ratio ** index);
  } else if (kind === 'square') {
    const start = int(random, 1, 7);
    push(6, (index) => (start + index) ** 2);
  } else if (kind === 'grow') {
    // Khoảng cách tăng dần: +k, +k+d, +k+2d…
    const start = int(random, 1, 20);
    const step = int(random, 1, 5);
    const more = int(random, 1, 3);
    let value = start;
    push(6, (index) => (index ? (value += step + (index - 1) * more) : value));
  } else if (kind === 'mulAdd') {
    const add = int(random, 1, 3);
    let value = int(random, 1, 4);
    push(6, (index) => (index ? (value = value * 2 + add) : value));
  } else if (kind === 'interleave') {
    // Hai dãy cộng xen kẽ: vị trí chẵn một dãy, vị trí lẻ một dãy.
    const [a, b] = [int(random, 1, 20), int(random, 40, 70)];
    const [da, db] = [int(random, 2, 7), -int(random, 2, 7)];
    push(6, (index) => (index % 2 ? b + ((index - 1) / 2) * db : a + (index / 2) * da));
  } else if (kind === 'alternate') {
    // Xen kẽ hai phép: +a rồi ×2.
    const add = int(random, 1, 5);
    let value = int(random, 1, 6);
    push(6, (index) => (index ? (value = index % 2 ? value + add : value * 2) : value));
  } else if (kind === 'triangle') {
    const start = int(random, 1, 6);
    push(6, (index) => ((start + index) * (start + index + 1)) / 2);
  } else if (kind === 'fib') {
    let [a, b] = [int(random, 1, 6), int(random, 2, 9)];
    push(6, () => {
      const value = a;
      [a, b] = [b, a + b];
      return value;
    });
  } else if (kind === 'alternateMul') {
    // Xen kẽ ×3 rồi −k.
    const sub = int(random, 1, 4);
    let value = int(random, 2, 5);
    push(6, (index) => (index ? (value = index % 2 ? value * 3 : value - sub) : value));
  } else if (kind === 'squarePlus') {
    const start = int(random, 2, 6);
    const add = pick(random, [1, 2, 3, -1, -2]);
    push(6, (index) => (start + index) ** 2 + add);
  } else if (kind === 'primes') {
    const start = int(random, 0, 8);
    push(6, (index) => PRIMES[start + index]);
  } else if (kind === 'doubleDiff') {
    // Khoảng cách gấp đôi: +d, +2d, +4d…
    const start = int(random, 1, 10);
    const step = int(random, 1, 3);
    let value = start;
    push(6, (index) => (index ? (value += step * 2 ** (index - 1)) : value));
  } else if (kind === 'growMul') {
    // Nhân tăng dần: ×2, ×3, ×4…
    let value = int(random, 1, 3);
    push(6, (index) => (index ? (value *= index + 1) : value));
  } else if (kind === 'interleaveMul') {
    // Vị trí chẵn ×2, vị trí lẻ +k.
    const [a, b] = [int(random, 1, 4), int(random, 3, 15)];
    const add = int(random, 3, 9);
    push(6, (index) => (index % 2 ? b + ((index - 1) / 2) * add : a * 2 ** (index / 2)));
  } else if (kind === 'factorial') {
    let value = 1;
    const offset = int(random, 1, 2);
    push(6, (index) => (value *= index + offset));
  } else if (kind === 'cube') {
    const start = int(random, 1, 4);
    push(6, (index) => (start + index) ** 3);
  } else if (kind === 'fibMul') {
    // Mỗi số = số trước + 2 × số trước nữa.
    let [a, b] = [int(random, 1, 4), int(random, 1, 5)];
    push(6, () => {
      const value = a;
      [a, b] = [b, b + 2 * a];
      return value;
    });
  } else if (kind === 'powerPlus') {
    const base = pick(random, [2, 3]);
    const start = int(random, 1, base === 2 ? 3 : 1);
    push(6, (index) => base ** (start + index) + (start + index));
  } else if (kind === 'mulSub') {
    // ×3 − k.
    const sub = int(random, 1, 2);
    let value = int(random, 2, 4);
    push(6, (index) => (index ? (value = value * 3 - sub) : value));
  } else if (kind === 'cubeMinus') {
    const start = int(random, 1, 4);
    push(6, (index) => (start + index) ** 3 - (start + index));
  } else if (kind === 'primeGap') {
    // Cộng lần lượt các số nguyên tố: +2, +3, +5, +7…
    let value = int(random, 1, 20);
    push(6, (index) => (index ? (value += PRIMES[index - 1]) : value));
  } else {
    // Xen kẽ hai dãy bình phương: n² ở vị trí chẵn, n² + 1… (1, 2, 4, 5, 9, 10, 16, 17…)
    const start = int(random, 1, 4);
    const add = int(random, 1, 3);
    push(6, (index) => (start + Math.floor(index / 2)) ** 2 + (index % 2 ? add : 0));
  }
  return terms;
}

export function seriesItem(random, level) {
  for (;;) {
    const terms = seriesTerms(random, level);
    const answer = terms.pop();
    if (terms.some((value) => value < 0) || answer < 0 || answer > 99_999) continue;
    const last = terms.at(-1);
    const diff = last - terms.at(-2);
    const candidates = shuffle(random, [answer + 1, answer - 1, answer + 2, answer - 2, last + diff, answer + diff, answer - Math.max(1, Math.round(Math.abs(answer - last) / 2)), answer + 10, answer - 10, last * 2]);
    const options = [answer];
    for (const value of candidates) if (options.length < 4 && value >= 0 && !options.includes(value)) options.push(value);
    if (options.length < 4) continue;
    const order = shuffle(random, options);
    return { problem: { kind: 'series', level, terms, options: order }, answer: order.indexOf(answer) };
  }
}

// ---- Bảng số ----
// Mỗi hàng a, b, c với c = phép(a, b); "const" là tổng mỗi hàng bằng nhau. Mức nào dùng phép nào.
export const NUMGRID_RULES = Object.freeze({
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  double: (a, b) => (a + b) * 2,
  mulSub: (a, b) => a * b - a,
  mulAdd: (a, b) => a * b + b,
  squareAdd: (a, b) => a * a + b,
  addSquare: (a, b) => a + b * b,
  diffSquare: (a, b) => (a - b) ** 2,
  squareSub: (a, b) => a * a - b * b,
});
const NUMGRID_LEVELS = {
  1: ['add'],
  2: ['add', 'sub', 'const'],
  3: ['mul', 'double', 'const'],
  4: ['mulSub', 'mulAdd', 'squareAdd', 'diffSquare'],
  5: ['addSquare', 'squareSub', 'squareAdd', 'mulSub', 'diffSquare'],
};
// Hai hàng đầu thỏa phép nào (để bảo đảm chỉ một phép khớp).
export function numgridRulesOf(rows) {
  const out = Object.entries(NUMGRID_RULES).filter(([, rule]) => rows.every(([a, b, c]) => rule(a, b) === c)).map(([name]) => name);
  if (rows.every((row) => row[0] + row[1] + row[2] === rows[0][0] + rows[0][1] + rows[0][2])) out.push('const');
  return out;
}

export function numgridItem(random, level) {
  const names = NUMGRID_LEVELS[clamp(level, 1, 5)];
  for (;;) {
    const name = pick(random, names);
    const big = level >= 3 ? 12 : 9;
    const rows = [];
    const total = int(random, 15, 30 + level * 5);
    for (let r = 0; r < 3; r += 1) {
      let a = int(random, 2, big);
      let b = int(random, 1, big);
      if ((name === 'sub' || name === 'diffSquare' || name === 'squareSub') && b >= a) [a, b] = [b + 1, a];
      const c = name === 'const' ? total - a - b : NUMGRID_RULES[name](a, b);
      rows.push([a, b, c]);
    }
    if (rows.some((row) => row[2] < 0 || row[2] > 999)) continue;
    if (new Set(rows.map((row) => row.join())).size < 3) continue;
    // Chỉ một phép khớp hai hàng đầu; phép khác (nếu khớp) phải cho cùng đáp án hàng 3.
    const fits = numgridRulesOf(rows.slice(0, 2));
    const answer = rows[2][2];
    const [a3, b3] = rows[2];
    const others = fits.filter((other) => other !== name).map((other) => (other === 'const' ? rows[0][0] + rows[0][1] + rows[0][2] - a3 - b3 : NUMGRID_RULES[other](a3, b3)));
    if (others.some((value) => value !== answer)) continue;
    // Phương án sai: kết quả của các phép khác trên hàng 3 (bẫy hay gặp), rồi ±1, ±a, ±b.
    const traps = Object.values(NUMGRID_RULES).map((rule) => rule(a3, b3));
    const options = [answer];
    for (const value of [...shuffle(random, traps), ...shuffle(random, [answer + 1, answer - 1, answer + a3, answer - b3, answer + 2])]) {
      if (options.length < 4 && value >= 0 && !options.includes(value)) options.push(value);
    }
    if (options.length < 4) continue;
    const order = shuffle(random, options);
    const cells = rows.flat();
    cells.pop();
    return { problem: { kind: 'numgrid', level, cells, options: order }, answer: order.indexOf(answer) };
  }
}

// ---- Tính nhẩm ----
// Câu dễ: cộng / trừ / nhân bảng cửu chương. Câu khó: hai bước (nhân chia trước cộng trừ, có ngoặc), bình phương,
// phần trăm, nhân số hai chữ số với một chữ số, chia ra kết quả hai chữ số, trừ có nhớ.
const isHard = (index) => index % 5 !== 0;
function mathItem(random, index) {
  let text;
  let answer;
  const traps = [];
  if (!isHard(index)) {
    const op = pick(random, ['+', '−', '×']);
    const a = int(random, op === '×' ? 2 : 6, op === '×' ? 9 : 40);
    const b = int(random, 2, op === '−' ? a - 1 : op === '×' ? 9 : 30);
    answer = op === '+' ? a + b : op === '−' ? a - b : a * b;
    text = `${a} ${op} ${b}`;
  } else {
    const kind = pick(random, ['mulAdd', 'addMul', 'paren', 'square', 'percent', 'bigMul', 'bigDiv', 'borrow', 'mulSub']);
    if (kind === 'mulAdd') {
      const [a, b, c] = [int(random, 3, 12), int(random, 3, 9), int(random, 5, 40)];
      answer = a * b + c;
      text = `${a} × ${b} + ${c}`;
      traps.push(a * (b + c));
    } else if (kind === 'addMul') {
      // Bẫy thứ tự phép tính: a + b × c.
      const [a, b, c] = [int(random, 5, 30), int(random, 3, 9), int(random, 3, 9)];
      answer = a + b * c;
      text = `${a} + ${b} × ${c}`;
      traps.push((a + b) * c);
    } else if (kind === 'paren') {
      const [a, b, c] = [int(random, 3, 15), int(random, 3, 15), int(random, 3, 8)];
      answer = (a + b) * c;
      text = `(${a} + ${b}) × ${c}`;
      traps.push(a + b * c);
    } else if (kind === 'square') {
      const n = int(random, 11, 25);
      answer = n * n;
      text = `${n}²`;
      traps.push(n * 2, (n - 1) * (n + 1));
    } else if (kind === 'percent') {
      // Cơ số là bội của 20 nên mọi mức phần trăm đều ra số nguyên.
      const percent = pick(random, [5, 10, 15, 20, 25, 30, 40, 50, 75]);
      const base = int(random, 2, 24) * 20;
      answer = (percent * base) / 100;
      text = `${percent}% × ${base}`;
      traps.push(answer * 10, answer + percent);
    } else if (kind === 'bigMul') {
      const [a, b] = [int(random, 13, 89), int(random, 3, 9)];
      answer = a * b;
      text = `${a} × ${b}`;
      traps.push(answer + 10, answer - 10);
    } else if (kind === 'bigDiv') {
      const [b, quotient] = [int(random, 3, 12), int(random, 12, 30)];
      answer = quotient;
      text = `${b * quotient} ÷ ${b}`;
      traps.push(quotient + 2, quotient - 2);
    } else if (kind === 'borrow') {
      const a = int(random, 101, 199);
      const b = int(random, 23, 89);
      answer = a - b;
      text = `${a} − ${b}`;
      traps.push(answer + 10, answer - 10);
    } else {
      const [a, b, c] = [int(random, 6, 15), int(random, 4, 9), int(random, 5, 30)];
      answer = a * b - c;
      text = `${a} × ${b} − ${c}`;
      traps.push(a * (b - c));
    }
  }
  const options = [answer];
  for (const value of [...shuffle(random, traps), ...shuffle(random, [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10])]) {
    if (options.length < 4 && value >= 0 && Number.isInteger(value) && !options.includes(value)) options.push(value);
  }
  const order = shuffle(random, options);
  return { problem: { text, level: isHard(index) ? 4 : 1, options: order }, answer: order.indexOf(answer) };
}

// Tính giá trị biểu thức Tính nhẩm (số nguyên, + − × ÷, ngoặc, ², %): trang dùng để báo đúng / sai ngay, test dùng để
// kiểm tra đáp án. Đệ quy theo thứ tự phép tính thông thường.
export function evaluateMath(text) {
  const tokens = text.replace(/\s+/g, '').match(/\d+|[+−×÷()²%]/g) || [];
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  function factor() {
    let value;
    if (peek() === '(') {
      take();
      value = sum();
      take();
    } else value = Number(take());
    while (peek() === '²' || peek() === '%') value = take() === '²' ? value * value : value / 100;
    return value;
  }
  function product() {
    let value = factor();
    while (peek() === '×' || peek() === '÷') value = take() === '×' ? value * factor() : value / factor();
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === '+' || peek() === '−') value = take() === '+' ? value + product() : value - product();
    return value;
  }
  return sum();
}

// ---- Màu mực ----
// Câu dễ: chọn màu mực. Câu khó: một nửa đổi luật thành "chọn theo chữ" (mode word), chữ luôn khác màu mực.
export const STROOP_COLORS = Object.freeze(['red', 'blue', 'green', 'yellow']);
function stroopItem(random, index) {
  const hard = isHard(index);
  const ink = int(random, 0, 3);
  const word = !hard && random() < 0.3 ? ink : pick(random, [0, 1, 2, 3].filter((value) => value !== ink));
  const mode = hard && random() < 0.5 ? 'word' : 'ink';
  return { problem: { word, ink, mode, level: hard ? 4 : 1 }, answer: mode === 'word' ? word : ink };
}

// ---- Thứ tự câu: 80 % câu khó ----
// Đố hình / Đố số 10 câu: 2 câu dễ mở đầu rồi 8 câu khó tăng dần.
const QUIZ_LEVELS = [1, 2, 3, 3, 4, 4, 4, 5, 5, 5];
// Test IQ 20 câu: 4 câu dễ (mỗi loại một câu, trừ xoay hình vốn đã khó) rồi 16 câu khó, mỗi loại 4 câu, khó dần.
const IQ_PLAN = [
  ['matrix', 1], ['series', 1], ['numgrid', 2], ['matrix', 2],
  ['series', 3], ['rotation', 3], ['numgrid', 3], ['matrix', 3],
  ['series', 4], ['matrix', 4], ['rotation', 4], ['numgrid', 4], ['series', 4], ['rotation', 4],
  ['matrix', 5], ['numgrid', 5], ['series', 5], ['rotation', 5], ['rotation', 5], ['numgrid', 5],
];
const MAKERS = { matrix: matrixItem, rotation: rotationItem, series: seriesItem, numgrid: numgridItem };
// Đấu trí: 2 câu dễ rồi 8 câu khó, đủ 4 loại.
const QUIZ_ROOM_PLAN = [
  ['series', 1], ['matrix', 2], ['numgrid', 3], ['rotation', 3], ['series', 3], ['matrix', 4],
  ['numgrid', 4], ['rotation', 4], ['series', 5], ['matrix', 5], ['numgrid', 5], ['rotation', 5],
];
const DUEL_PLAN = [
  ['matrix', 2], ['series', 2], ['rotation', 3], ['numgrid', 3], ['matrix', 4],
  ['series', 4], ['rotation', 4], ['numgrid', 4], ['matrix', 5], ['series', 5],
];

// ---- Dựng đề theo seed ----
// game: một trong BRAIN_GAMES, 'iq' hoặc 'duel'. Trả { problem (gửi trình duyệt), answers (giữ ở server) }.
export function buildPuzzle(game, seed) {
  const random = rng(seed);
  if (game === 'bells') {
    const sequence = [];
    while (sequence.length < BELL_SEQUENCE) {
      const value = int(random, 0, 3);
      // Không quá hai tiếng giống nhau liền nhau.
      if (sequence.length >= 2 && sequence.at(-1) === value && sequence.at(-2) === value) continue;
      sequence.push(value);
    }
    const reverse = Array.from({ length: BELL_SEQUENCE + 1 }, (_, length) => length).filter(bellReverse);
    return { problem: { game, sequence, start: BELL_START, reverse }, answers: sequence };
  }
  if (game === 'matrix' || game === 'series') {
    // Đố hình: ma trận xen xoay hình; Đố số: dãy số xen bảng số (câu dễ đầu tiên luôn là ma trận / dãy số).
    const kinds = game === 'matrix' ? ['matrix', 'rotation'] : ['series', 'numgrid'];
    const items = QUIZ_LEVELS.map((level, index) => {
      const kind = index === 0 || (level < HARD_LEVEL && kinds[1] === 'rotation') ? kinds[0] : kinds[index % 2];
      return MAKERS[kind](random, level);
    });
    return { problem: { game, items: items.map((item) => item.problem) }, answers: items.map((item) => item.answer) };
  }
  if (game === 'math' || game === 'stroop') {
    const items = Array.from({ length: SPEED_ITEMS }, (_, index) => (game === 'math' ? mathItem(random, index) : stroopItem(random, index)));
    return { problem: { game, items: items.map((item) => item.problem), ...(game === 'stroop' ? { colors: STROOP_COLORS } : {}) }, answers: items.map((item) => item.answer) };
  }
  if (game === 'iq' || game === 'duel') {
    const items = (game === 'iq' ? IQ_PLAN : DUEL_PLAN).map(([kind, level]) => MAKERS[kind](random, level));
    return { problem: { game, items: items.map((item) => item.problem) }, answers: items.map((item) => item.answer) };
  }
  throw new Error(`unknown brain game ${game}`);
}

// Bộ đề Đố vui (gửi máy realtime qua API nội bộ, kèm đáp án): [{ problem, answer }] theo QUIZ_ROOM_PLAN.
export function buildQuizRoom(seed) {
  const random = rng(seed);
  return QUIZ_ROOM_PLAN.map(([kind, level]) => MAKERS[kind](random, level));
}

// Thời gian tối thiểu hợp lý (ms) để làm được ngần ấy câu: nhanh hơn thì coi là máy tự làm.
function minimumMs(game, count) {
  if (game === 'bells') {
    let total = 0;
    for (let length = BELL_START; length <= count; length += 1) total += length * 450;
    return total;
  }
  return count * (game === 'stroop' || game === 'math' ? 250 : 600);
}

// Chấm một lượt. input: bells → các tiếng đã gõ đúng ở lượt dài nhất (lượt gõ ngược thì theo thứ tự đã gõ); trò khác →
// mảng chỉ số phương án đã chọn theo thứ tự câu (null = bỏ qua). Trả { ok, points (0–100; iq: số câu đúng), correct,
// wrong, total, solution, byKind? } hoặc { ok: false, code }.
export function gradePuzzle(game, seed, input, elapsedMs) {
  const { problem, answers } = buildPuzzle(game, seed);
  if (!Array.isArray(input) || input.length > answers.length) return { ok: false, code: 'INVALID' };
  if (!input.every((value) => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 5))) return { ok: false, code: 'INVALID' };
  if (game === 'bells') {
    const expected = answers.slice(0, input.length);
    if (bellReverse(input.length)) expected.reverse();
    const reached = input.every((value, index) => value === expected[index]) ? input.length : 0;
    if (reached && elapsedMs < minimumMs(game, reached)) return { ok: false, code: 'TOO_FAST' };
    return { ok: true, points: clamp((reached - 2) * 10, 0, 100), correct: reached, wrong: 0, total: answers.length, solution: answers };
  }
  let correct = 0;
  let wrong = 0;
  input.forEach((value, index) => {
    if (value === null) return;
    if (value === answers[index]) correct += 1;
    else wrong += 1;
  });
  if (correct + wrong && elapsedMs < minimumMs(game, correct + wrong)) return { ok: false, code: 'TOO_FAST' };
  const points = game === 'iq' || game === 'duel' ? correct
    : game === 'math' ? clamp(correct * 6 - wrong * 3, 0, 100)
      : game === 'stroop' ? clamp(correct * 4 - wrong * 4, 0, 100)
        : correct * (100 / QUIZ_ITEMS);
  // Đáp án chỉ trả sau khi nộp (ma trận / dãy số / test: để xem lại câu sai).
  const solution = game === 'matrix' || game === 'series' || game === 'iq' || game === 'duel' ? answers : null;
  const extra = {};
  if (game === 'iq') {
    extra.byKind = Object.fromEntries(IQ_KINDS.map((kind) => [kind, problem.items.filter((item, index) => item.kind === kind && input[index] === answers[index]).length]));
  }
  return { ok: true, points, correct, wrong, total: game === 'math' || game === 'stroop' ? input.length : answers.length, solution, ...extra };
}

// ---- Chỉ số tham khảo của Test IQ vui ----
// Phân bố chuẩn: Φ(x) (xấp xỉ Abramowitz–Stegun) và Φ⁻¹(p) (Acklam).
export function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}
export function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628274631];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Vị trí của một điểm trong mẫu: phần người thấp hơn + nửa phần người bằng (0–1).
export function percentileOf(value, sample) {
  if (!sample.length) return null;
  let below = 0;
  let equal = 0;
  for (const other of sample) {
    if (other < value) below += 1;
    else if (other === value) equal += 1;
  }
  return (below + equal / 2) / sample.length;
}

// correct: số câu đúng / 20; sample: số câu đúng của các bài đã làm. Chỉ số = 100 + 15 × z theo vị trí trong người chơi
// thật (đủ mẫu) hoặc theo phân bố giả định (chưa đủ), kẹp 70–145. percent chỉ có khi đủ người làm bài thật.
export function iqIndex(correct, sample) {
  const real = sample.length >= IQ_SAMPLE_MIN;
  const p = real ? percentileOf(correct, sample) : normalCdf((correct - IQ_PRIOR.mean) / IQ_PRIOR.sd);
  const index = Math.round(clamp(100 + 15 * normalQuantile(clamp(p, 0.003, 0.997)), 70, 145));
  const percent = sample.length >= IQ_PERCENT_MIN ? Math.round(percentileOf(correct, sample) * 100) : null;
  return { index, percent, calibrated: real };
}
