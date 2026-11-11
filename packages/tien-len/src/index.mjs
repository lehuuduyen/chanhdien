// Tiến lên miền Nam: luật thuần (không mạng, không ví). Máy realtime dùng để làm trọng tài, trình duyệt dùng để sáng
// nút Đánh / gợi ý bài, bot dùng để chọn nước. Không import gì: trình duyệt tải thẳng file này ở /shared/tien-len.mjs.
//
// Lá bài là số 0–51: hạng = lá >> 2 (0 = 3, 1 = 4 … 11 = A, 12 = 2), chất = lá & 3 (0 ♠, 1 ♣, 2 ♦, 3 ♥). So hai lá
// là so hai số (hạng trước, chất sau).
//
// Luật đã chốt:
// - Bộ đánh được: rác (1 lá), đôi, sám, tứ quý, sảnh (≥ 3 lá liền nhau, không có 2), đôi thông (≥ 3 đôi liền nhau, không
//   có 2). Đè bằng bộ cùng loại, cùng số lá, lá cao nhất lớn hơn.
// - Chặt: 3 đôi thông chặt 1 heo và 3 đôi thông nhỏ hơn; tứ quý chặt 1 heo, đôi heo, 3 đôi thông, tứ quý nhỏ hơn;
//   4 đôi thông chặt heo, đôi heo, 3 đôi thông, tứ quý, 4 đôi thông nhỏ hơn. Sám heo không ai chặt được.
// - 3 đôi thông / tứ quý chỉ chặt khi đang trong vòng (chưa bỏ lượt). 4 đôi thông chặt được bất cứ lúc nào, kể cả khi đã
//   bỏ lượt hay chưa tới lượt.
// - Chặt chồng: người bị chặt trả cả chuỗi (giá trị heo / hàng bị chặt trước đó cộng giá trị hàng của mình).
// - Ván đầu: người cầm lá nhỏ nhất được chia (3♠ khi đủ 4 người) đi trước và phải đánh kèm lá đó. Ván sau: người nhất
//   ván trước đi trước, đánh gì cũng được.
// - Tới trắng lúc chia bài: tứ quý 2, sảnh rồng (3 → A), 6 đôi, 5 đôi thông. Nhiều người cùng tới trắng: người đi trước
//   (tính theo lượt từ người đi đầu) được.
// - Thối (hết ván còn trên tay): heo đen 1, heo đỏ 2, 3 đôi thông 3 (4 đôi thông 4), tứ quý 4 phần; trả người nhất.
// - Kiểu A "xếp hạng" (rank): chơi tới khi còn một người. Bét trả nhất 2 phần; bàn 4 người thì ba trả nhì 1 phần. Cóng
//   (người khác đã về nhất mà mình chưa đánh lá nào) bị loại ngay, trả nhất 4 phần (gấp đôi). Thối tính cho người bét
//   (có cóng thì cho người cóng).
// - Kiểu B "đếm lá" (count): có người hết bài là xong ván; mỗi người trả nhất 1 phần / lá còn lại, cóng gấp đôi (26).
//   Thối tính cho mọi người còn bài.
// - Tới trắng: kiểu A mỗi người trả 2 phần, kiểu B mỗi người 13 phần; không tính thối.
// - Một phần = mức cược của bàn. Không giữ cọc: muốn ngồi bàn phải có ít nhất TIENLEN_MIN_COINS_UNITS phần trong ví (kiểm
//   tra lúc vào bàn và đầu mỗi ván); hết ván mới cộng / trừ xu. Ai phải trả nhiều hơn số xu đang có thì chỉ trả hết số đang
//   có, các khoản của người đó bị chia nhỏ theo tỷ lệ (người nhận nhận ít đi tương ứng).

export const RANKS = Object.freeze(['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']);
export const SUITS = Object.freeze(['♠', '♣', '♦', '♥']);
export const TWO = 12;
export const DECK_SIZE = 52;
export const HAND_SIZE = 13;
export const TIENLEN_MAX_PLAYERS = 4;
export const TIENLEN_MODES = Object.freeze(['rank', 'count']);
export const TIENLEN_STAKES = Object.freeze([20, 50, 100, 200, 500, 1_000, 2_000]);
// Muốn ngồi bàn phải có ít nhất mức cược × hệ số này trong ví.
export const TIENLEN_MIN_COINS_UNITS = 10;
export const TIENLEN_HOUSE_CUT_PERCENT = 5;
// Số phần của từng khoản (nhân với mức cược).
export const TIENLEN_UNITS = Object.freeze({ last: 2, third: 1, cong: 4, whiteRank: 2, whiteCount: 13, blackTwo: 1, redTwo: 2, quad: 4 });
export const INSTANT_WINS = Object.freeze(['four-twos', 'dragon', 'six-pairs', 'five-pairs']);

export const rankOf = (card) => card >> 2;
export const suitOf = (card) => card & 3;
export const isCard = (value) => Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
export const cardName = (card) => `${RANKS[rankOf(card)]}${SUITS[suitOf(card)]}`;
export const tienLenMinCoins = (stake) => stake * TIENLEN_MIN_COINS_UNITS;
// Phế trên phần thắng (làm tròn xuống).
export const tienLenCut = (net) => (net > 0 ? Math.floor((net * TIENLEN_HOUSE_CUT_PERCENT) / 100) : 0);

const byValue = (a, b) => a - b;
const twoValue = (card) => (suitOf(card) >= 2 ? TIENLEN_UNITS.redTwo : TIENLEN_UNITS.blackTwo);

function rankCounts(cards) {
  const counts = new Array(13).fill(0);
  for (const card of cards) counts[rankOf(card)] += 1;
  return counts;
}

// Nhận ra bộ bài: { type, size, top, length } hoặc null. size: số lá với rác/đôi/sám/tứ quý, số lá với sảnh, số đôi với
// đôi thông. top: lá lớn nhất (quyết định bộ nào lớn hơn).
export function classify(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > HAND_SIZE) return null;
  const sorted = [...cards].sort(byValue);
  for (let index = 0; index < sorted.length; index += 1) {
    if (!isCard(sorted[index]) || (index && sorted[index] === sorted[index - 1])) return null;
  }
  const length = sorted.length;
  const top = sorted[length - 1];
  const ranks = sorted.map(rankOf);
  if (length === 1) return { type: 'single', size: 1, top, length };
  if (ranks.every((rank) => rank === ranks[0])) {
    const type = { 2: 'pair', 3: 'triple', 4: 'quad' }[length];
    return type ? { type, size: length, top, length } : null;
  }
  if (ranks[length - 1] === TWO) return null;
  if (length >= 3 && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1)) {
    return { type: 'straight', size: length, top, length };
  }
  if (length >= 6 && length % 2 === 0) {
    for (let index = 0; index < length; index += 2) {
      if (ranks[index] !== ranks[index + 1]) return null;
      if (index && ranks[index] !== ranks[index - 2] + 1) return null;
    }
    return { type: 'pairs', size: length / 2, top, length };
  }
  return null;
}

// Heo (1 lá 2 / đôi 2 / sám 2).
export const isTwos = (combo) => Boolean(combo) && ['single', 'pair', 'triple'].includes(combo.type) && rankOf(combo.top) === TWO;
// Hàng: tứ quý, đôi thông.
export const isBomb = (combo) => Boolean(combo) && (combo.type === 'quad' || combo.type === 'pairs');

// next đè được prev không (prev null = đang mở vòng: bộ hợp lệ nào cũng được).
export function beats(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  if (next.type === prev.type && next.size === prev.size) return next.top > prev.top;
  if (isTwos(prev) && prev.type === 'single') return next.type === 'quad' || next.type === 'pairs';
  if (isTwos(prev) && prev.type === 'pair') return next.type === 'quad' || (next.type === 'pairs' && next.size >= 4);
  if (prev.type === 'pairs') {
    if (next.type === 'quad') return prev.size === 3;
    return next.type === 'pairs' && next.size > prev.size;
  }
  if (prev.type === 'quad') return next.type === 'pairs' && next.size >= 4;
  return false;
}

// Nước đè là "chặt" (tính tiền): hàng đè lên heo hoặc lên hàng.
export const isChop = (prev, next) => Boolean(prev) && isBomb(next) && (isTwos(prev) || isBomb(prev)) && beats(prev, next);
// 4 đôi thông chặt ngoài lượt (kể cả đã bỏ lượt).
export const isFreeChop = (prev, next) => isChop(prev, next) && next.type === 'pairs' && next.size >= 4;

// Giá trị (số phần) của heo / hàng khi bị chặt: heo đen 1, heo đỏ 2, tứ quý 4, n đôi thông = n.
export function bombValue(combo, cards = null) {
  if (!combo) return 0;
  if (isTwos(combo)) {
    if (!cards) return combo.size * TIENLEN_UNITS.redTwo;
    return cards.reduce((sum, card) => sum + twoValue(card), 0);
  }
  if (combo.type === 'quad') return TIENLEN_UNITS.quad;
  if (combo.type === 'pairs') return combo.size;
  return 0;
}

// Tới trắng (13 lá lúc chia): lý do hoặc null.
export function instantWin(hand) {
  if (!Array.isArray(hand) || hand.length !== HAND_SIZE) return null;
  const counts = rankCounts(hand);
  if (counts[TWO] === 4) return 'four-twos';
  if (counts.slice(0, TWO).every((count) => count >= 1)) return 'dragon';
  let run = 0;
  let best = 0;
  for (let rank = 0; rank < TWO; rank += 1) {
    run = counts[rank] >= 2 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  if (best >= 5) return 'five-pairs';
  if (counts.reduce((sum, count) => sum + Math.floor(count / 2), 0) >= 6) return 'six-pairs';
  return null;
}

// Thối: heo / hàng còn trên tay khi hết ván. Trả { units, items: [{ kind, units, size? }] }.
export function leftoverPenalty(hand) {
  const items = [];
  for (const card of hand) {
    if (rankOf(card) === TWO) items.push({ kind: suitOf(card) >= 2 ? 'red-two' : 'black-two', units: twoValue(card) });
  }
  const counts = rankCounts(hand);
  for (let rank = 0; rank < TWO; rank += 1) if (counts[rank] === 4) items.push({ kind: 'quad', units: TIENLEN_UNITS.quad });
  // Đôi thông không tính hạng đã là tứ quý (khỏi phạt hai lần một bộ).
  let run = 0;
  for (let rank = 0; rank <= TWO; rank += 1) {
    if (rank < TWO && counts[rank] >= 2 && counts[rank] < 4) run += 1;
    else {
      if (run >= 3) items.push({ kind: 'pairs', size: run, units: run });
      run = 0;
    }
  }
  return { units: items.reduce((sum, item) => sum + item.units, 0), items };
}

// ---- Gợi ý bài (trình duyệt + bot) ----
function bucketsOf(hand) {
  const buckets = Array.from({ length: 13 }, () => []);
  for (const card of [...hand].sort(byValue)) buckets[rankOf(card)].push(card);
  return buckets;
}

function choose(list, size, start = 0, picked = [], out = []) {
  if (picked.length === size) {
    out.push([...picked]);
    return out;
  }
  for (let index = start; index <= list.length - (size - picked.length); index += 1) {
    picked.push(list[index]);
    choose(list, size, index + 1, picked, out);
    picked.pop();
  }
  return out;
}

// Các bộ đánh được từ hand. Có top thì chỉ trả bộ đè được top. Sảnh / đôi thông chỉ lấy lá nhỏ nhất ở các hạng dưới,
// hạng trên cùng thì thử từng lá (để có bộ vừa đủ lớn); rác / đôi / sám thì đủ mọi tổ hợp chất.
export function playOptions(hand, top = null) {
  const buckets = bucketsOf(hand);
  const out = [];
  const add = (cards) => {
    const combo = classify(cards);
    if (combo && beats(top, combo)) out.push(cards.sort(byValue));
  };
  for (const cards of buckets) {
    for (let size = 1; size <= Math.min(4, cards.length); size += 1) {
      if (size === 4 || cards.length <= 4) for (const set of choose(cards, size)) add(set);
    }
  }
  for (let start = 0; start < TWO; start += 1) {
    // Sảnh.
    for (let end = start + 2; end < TWO && buckets[end].length; end += 1) {
      let whole = true;
      for (let rank = start; rank < end; rank += 1) if (!buckets[rank].length) whole = false;
      if (!whole) break;
      const base = [];
      for (let rank = start; rank < end; rank += 1) base.push(buckets[rank][0]);
      for (const card of buckets[end]) add([...base, card]);
    }
    // Đôi thông.
    for (let end = start + 2; end < TWO && buckets[end].length >= 2; end += 1) {
      let whole = true;
      for (let rank = start; rank < end; rank += 1) if (buckets[rank].length < 2) whole = false;
      if (!whole) break;
      const base = [];
      for (let rank = start; rank < end; rank += 1) base.push(buckets[rank][0], buckets[rank][1]);
      for (const pair of choose(buckets[end], 2)) add([...base, ...pair]);
    }
  }
  return out;
}

// ---- Bot ----
// Chia bài trên tay thành các bộ như người chơi thật: hàng (tứ quý, đôi thông) để dành chặt heo, heo (2) để giành vòng,
// phần còn lại ghép sảnh (dài nhất trước), sám, đôi, rác. Trả [{ kind: 'bomb' | 'twos' | 'plain', cards }].
export function planHand(hand) {
  const buckets = bucketsOf(hand);
  const used = new Set();
  const free = (rank) => buckets[rank].filter((card) => !used.has(card));
  const take = (cards) => {
    for (const card of cards) used.add(card);
    return [...cards].sort(byValue);
  };
  const units = [];
  for (let rank = 0; rank < TWO; rank += 1) {
    if (buckets[rank].length === 4) units.push({ kind: 'bomb', cards: take(buckets[rank]) });
  }
  // Đôi thông: dãy hạng liền nhau còn ≥ 2 lá, dài nhất trước.
  for (;;) {
    let best = null;
    for (let low = 0; low < TWO; low += 1) {
      let high = low;
      while (high < TWO && free(high).length >= 2) high += 1;
      if (high - low >= 3 && (!best || high - low > best[1] - best[0])) best = [low, high];
    }
    if (!best) break;
    const cards = [];
    for (let rank = best[0]; rank < best[1]; rank += 1) cards.push(...free(rank).slice(0, 2));
    units.push({ kind: 'bomb', cards: take(cards) });
  }
  if (free(TWO).length) units.push({ kind: 'twos', cards: take(free(TWO)) });
  // Sảnh: dãy hạng liền nhau còn lá, dài nhất trước.
  for (;;) {
    let best = null;
    for (let low = 0; low < TWO; low += 1) {
      let high = low;
      while (high < TWO && free(high).length) high += 1;
      if (high - low >= 3 && (!best || high - low > best[1] - best[0])) best = [low, high];
    }
    if (!best) break;
    const cards = [];
    for (let rank = best[0]; rank < best[1]; rank += 1) cards.push(free(rank)[0]);
    units.push({ kind: 'plain', cards: take(cards) });
  }
  for (let rank = 0; rank < TWO; rank += 1) {
    const rest = free(rank);
    if (rest.length) units.push({ kind: 'plain', cards: take(rest) });
  }
  return units;
}

// Độ "mạnh" của một bộ để giữ vòng: hàng > heo > bộ thường (theo lá cao nhất).
const unitStrength = (unit) => (unit.kind === 'bomb' ? 200 : unit.kind === 'twos' ? 100 + unit.cards.length * 10 : 0) + classify(unit.cards).top;

// Bot chọn nước: trả mảng lá hoặc null (bỏ lượt). Chỉ dùng bài của chính nó + thông tin công khai (bộ trên bàn, số lá
// ít nhất của đối thủ). random() trả [0, 1).
// - Mở vòng: đánh bộ rác thấp nhất (sảnh dài, đôi, rác…), giữ hàng để chặt heo và giữ heo để giành vòng; nước đầu phải
//   kèm lá bắt buộc thì đánh bộ chứa lá đó (lá đó nằm trong tứ quý / heo thì chỉ đánh lẻ lá đó). Còn 2 bộ thì đánh bộ
//   mạnh trước để giành vòng rồi đánh bộ cuối. Đối thủ còn 1 lá thì không mở bằng rác nhỏ.
// - Chặn: heo / hàng trên bàn thì chặt bằng hàng nhỏ nhất; không thì chọn nước ít "tốn" nhất (không xé bộ khác, không phí
//   heo khi còn nhiều bài), tốn quá thì bỏ lượt. Gần hết bài / đối thủ sắp hết bài thì đánh mạnh tay.
export function botChoice({ hand, top = null, mustInclude = null, opponentMin = HAND_SIZE, random = Math.random }) {
  if (!hand.length) return null;
  const topCombo = top ? classify(top) : null;
  const options = playOptions(hand, topCombo);
  if (!options.length) return null;
  const units = planHand(hand);
  // Đánh hết được luôn thì đánh.
  const finishing = options.find((cards) => cards.length === hand.length);
  if (finishing && (!mustInclude || finishing.includes(mustInclude))) return finishing;
  const endgame = hand.length <= 4 || opponentMin <= 2 || units.length <= 2;

  if (!topCombo) {
    if (mustInclude !== null) {
      const unit = units.find((item) => item.cards.includes(mustInclude));
      if (unit && unit.kind === 'plain') return unit.cards;
      return [mustInclude];
    }
    if (units.length === 1) return units[0].cards;
    if (units.length === 2) return [...units].sort((a, b) => unitStrength(b) - unitStrength(a))[0].cards;
    let pool = units.filter((unit) => unit.kind === 'plain');
    if (!pool.length) {
      // Chỉ còn heo và hàng: ra heo trước, giữ hàng.
      pool = units.filter((unit) => unit.kind === 'twos');
      if (!pool.length) pool = units;
      return [...pool].sort((a, b) => unitStrength(a) - unitStrength(b))[0].cards;
    }
    if (opponentMin === 1) {
      // Đối thủ còn 1 lá: mở bằng bộ nhiều lá; chỉ còn rác thì ra rác cao nhất.
      const multi = pool.filter((unit) => unit.cards.length > 1);
      if (multi.length) pool = multi;
      else return [...pool].sort((a, b) => classify(b.cards).top - classify(a.cards).top)[0].cards;
    }
    // Rác thấp nhất trước; cùng hạng thì bộ nhiều lá trước (xả bài nhanh).
    return [...pool].sort((a, b) => rankOf(a.cards[0]) - rankOf(b.cards[0]) || b.cards.length - a.cards.length)[0].cards;
  }

  // Chặt heo / hàng bằng hàng nhỏ nhất (ăn tiền).
  if (isTwos(topCombo) || isBomb(topCombo)) {
    const chops = options.filter((cards) => isChop(topCombo, classify(cards)));
    if (chops.length && random() < 0.9) return chops.sort((a, b) => classify(a).top - classify(b).top)[0];
  }
  const unitOf = new Map();
  units.forEach((unit, index) => { for (const card of unit.cards) unitOf.set(card, index); });
  const highTop = rankOf(topCombo.top) >= 11;
  const cost = (cards) => {
    const combo = classify(cards);
    let value = rankOf(combo.top);
    const touched = new Set(cards.map((card) => unitOf.get(card)));
    for (const index of touched) {
      const unit = units[index];
      const whole = unit.cards.every((card) => cards.includes(card));
      if (whole) continue;
      // Xé bộ: xé hàng rất tốn, xé heo thì tính ở dưới; xé bộ thường mà phần còn lại vẫn thành bộ (rút đầu sảnh 6-7-8-9 còn
      // 7-8-9) thì rẻ, không thì vừa phải.
      const rest = unit.cards.filter((card) => !cards.includes(card));
      value += unit.kind === 'bomb' ? 60 : unit.kind === 'twos' ? 0 : classify(rest) ? 2 : 6;
    }
    if (isBomb(combo)) value += 60;
    if (cards.some((card) => rankOf(card) === TWO) && !endgame) value += highTop ? 6 : 25;
    return value;
  };
  const ranked = options.map((cards) => ({ cards, cost: cost(cards) })).sort((a, b) => a.cost - b.cost);
  const best = ranked[0];
  if (endgame) return best.cards;
  // Phải phí heo / xé hàng mới đè được: phần lớn thời gian giữ lại.
  if (best.cost >= 25 && random() < 0.75) return null;
  // Thỉnh thoảng nhường vòng dù đè được (cho giống người, đỡ đoán).
  if (best.cost >= 8 && random() < 0.15) return null;
  return best.cards;
}

// ---- Tự chọn bộ khi chạm bài (trình duyệt) ----
// Lấy một bộ mẫu rồi thay lá cùng hạng bằng các lá bắt buộc (lá người chơi đã chọn); không thay được thì null.
function adopt(cards, required) {
  const out = [...cards];
  for (const card of required) {
    if (out.includes(card)) continue;
    const index = out.findIndex((item) => rankOf(item) === rankOf(card) && !required.includes(item));
    if (index < 0) return null;
    out[index] = card;
  }
  return out.sort(byValue);
}

// Dãy hạng liền nhau dài nhất đi lên từ hạng from (không có 2), mỗi hạng có ít nhất need lá.
function runUp(buckets, from, need) {
  let end = from;
  while (end + 1 < TWO && buckets[end + 1].length >= need) end += 1;
  return end;
}

// Người chơi vừa chạm thêm lá `tapped`, `picked` là các lá đang chọn (đã gồm lá vừa chạm). Trả bộ nên chọn (mảng lá,
// gồm mọi lá đã chọn) hoặc null để giữ nguyên.
// - Có bộ trên bàn (top): bộ nhỏ nhất đè được top có chứa các lá đã chọn (đôi cùng hạng, sảnh / đôi thông cùng độ dài,
//   hàng để chặt heo); lá đã chọn tự đè được thì giữ nguyên.
// - Mở vòng: 2 lá cùng hạng mà tay có đủ 4 → tứ quý; có một đôi + hạng kế bên → đôi thông dài nhất đi lên; các lá khác
//   hạng liền nhau → sảnh dài nhất đi lên (từ hạng thấp nhất đã chọn). Không rõ ý thì giữ nguyên.
export function smartSelect({ hand, picked, top = null }) {
  if (!Array.isArray(hand) || !Array.isArray(picked) || !picked.length || !picked.every((card) => hand.includes(card))) return null;
  const topCombo = top ? classify(top) : null;
  const differs = (cards) => cards && (cards.length !== picked.length || cards.some((card) => !picked.includes(card)));
  if (topCombo) {
    const own = classify(picked);
    if (own && beats(topCombo, own)) return null;
    const options = [];
    const seen = new Set();
    for (const option of playOptions(hand, topCombo)) {
      const cards = adopt(option, picked);
      const combo = cards && classify(cards);
      if (!combo || !beats(topCombo, combo) || !picked.every((card) => cards.includes(card))) continue;
      const key = cards.join();
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ cards, combo });
      }
    }
    if (!options.length) return null;
    // Ít lá nhất, lá cao nhất nhỏ nhất (đè vừa đủ, không phí bài lớn).
    options.sort((a, b) => a.cards.length - b.cards.length || a.combo.top - b.combo.top);
    return differs(options[0].cards) ? options[0].cards : null;
  }
  const buckets = bucketsOf(hand);
  const counts = new Map();
  for (const card of picked) counts.set(rankOf(card), (counts.get(rankOf(card)) || 0) + 1);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  if (ranks.at(-1) === TWO && ranks.length > 1) return null;
  // Tứ quý: chọn 2 lá cùng hạng, tay có đủ 4.
  if (ranks.length === 1) {
    const [rank] = ranks;
    return picked.length === 2 && buckets[rank].length === 4 ? [...buckets[rank]] : null;
  }
  const consecutive = ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
  if (!consecutive || [...counts.values()].some((count) => count > 2)) return null;
  const low = ranks[0];
  const fill = (end, per) => {
    const cards = [];
    for (let rank = low; rank <= end; rank += 1) {
      const chosen = picked.filter((card) => rankOf(card) === rank);
      cards.push(...chosen, ...buckets[rank].filter((card) => !chosen.includes(card)).slice(0, per - chosen.length));
    }
    return cards.sort(byValue);
  };
  // Đôi thông: có hạng chọn 2 lá.
  if ([...counts.values()].some((count) => count === 2)) {
    if (!ranks.every((rank) => buckets[rank].length >= 2)) return null;
    const end = runUp(buckets, low, 2);
    if (end < ranks.at(-1) || end - low + 1 < 3) return null;
    const cards = fill(end, 2);
    return classify(cards)?.type === 'pairs' && differs(cards) ? cards : null;
  }
  // Sảnh: mỗi hạng một lá.
  const end = runUp(buckets, low, 1);
  if (end < ranks.at(-1) || end - low + 1 < 3) return null;
  const cards = fill(end, 1);
  return classify(cards)?.type === 'straight' && differs(cards) ? cards : null;
}

// ---- Một ván ----
// hands: bài của từng người chơi (2–4 người, theo thứ tự lượt). leader: người đi trước. mustInclude: lá phải đánh kèm ở
// nước đầu (ván đầu bàn). mode: 'rank' | 'count'.
export class TienLenRound {
  constructor({ hands, mode, leader = 0, mustInclude = null }) {
    if (!Array.isArray(hands) || hands.length < 2 || hands.length > TIENLEN_MAX_PLAYERS) throw new RangeError('Cần 2–4 người chơi');
    if (!TIENLEN_MODES.includes(mode)) throw new TypeError('Kiểu tính tiền không hợp lệ');
    this.n = hands.length;
    this.mode = mode;
    this.hands = hands.map((hand) => [...hand].sort(byValue));
    this.played = new Array(this.n).fill(false);
    this.out = new Array(this.n).fill(false);
    this.order = [];
    this.turn = leader;
    this.top = null;
    this.passed = new Set();
    this.chain = 0;
    this.ledger = [];
    this.over = false;
    this.white = null;
    this.mustInclude = mustInclude;
    this.last = null;
    // Tới trắng: xét theo lượt bắt đầu từ người đi trước.
    for (let step = 0; step < this.n; step += 1) {
      const seat = (leader + step) % this.n;
      const reason = instantWin(this.hands[seat]);
      if (reason) {
        this.white = { seat, reason };
        this.order = [seat];
        this.over = true;
        this.turn = null;
        break;
      }
    }
  }

  active(seat) {
    return this.hands[seat].length > 0 && !this.out[seat];
  }

  // Người kế tiếp còn trong vòng (còn bài, chưa bỏ lượt, không phải chủ bộ đang nằm trên bàn); null = hết vòng.
  nextFrom(seat) {
    for (let step = 1; step <= this.n; step += 1) {
      const next = (seat + step) % this.n;
      if (this.active(next) && !this.passed.has(next) && next !== this.top?.seat) return next;
    }
    return null;
  }

  // Kiểm tra một nước đánh (không đổi gì). Trả { ok, combo, chop, outOfTurn } hoặc { ok: false, code }.
  check(seat, cards) {
    if (this.over) return { ok: false, code: 'GAME_OVER' };
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.n || !this.active(seat)) return { ok: false, code: 'NOT_IN_GAME' };
    if (!Array.isArray(cards) || !cards.length || new Set(cards).size !== cards.length || !cards.every((card) => this.hands[seat].includes(card))) {
      return { ok: false, code: 'NOT_YOUR_CARDS' };
    }
    const combo = classify(cards);
    if (!combo) return { ok: false, code: 'INVALID_COMBO' };
    const top = this.top?.combo || null;
    const inTurn = seat === this.turn && !this.passed.has(seat);
    const outOfTurn = !inTurn && Boolean(top) && this.top.seat !== seat && isFreeChop(top, combo);
    if (!inTurn && !outOfTurn) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (this.mustInclude !== null && !cards.includes(this.mustInclude)) return { ok: false, code: 'MUST_INCLUDE' };
    if (top && !beats(top, combo)) return { ok: false, code: 'TOO_SMALL' };
    return { ok: true, combo, chop: isChop(top, combo), outOfTurn };
  }

  play(seat, cards) {
    const result = this.check(seat, cards);
    if (!result.ok) return result;
    const { combo, chop } = result;
    let units = 0;
    if (chop) {
      units = this.chain;
      this.ledger.push({ from: this.top.seat, to: seat, units, reason: 'chop' });
      this.chain += bombValue(combo, cards);
    } else this.chain = bombValue(combo, cards);
    const set = new Set(cards);
    this.hands[seat] = this.hands[seat].filter((card) => !set.has(card));
    this.played[seat] = true;
    this.mustInclude = null;
    this.passed.delete(seat);
    const sorted = [...cards].sort(byValue);
    this.top = { seat, cards: sorted, combo };
    this.last = { seat, action: chop ? 'chop' : 'play', cards: sorted, ...(chop ? { units, victim: this.ledger.at(-1).from } : {}) };
    if (!this.hands[seat].length) this.finish(seat);
    if (!this.over) this.advance(seat);
    return { ok: true, chop, units };
  }

  pass(seat) {
    if (this.over) return { ok: false, code: 'GAME_OVER' };
    if (seat !== this.turn) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (!this.top) return { ok: false, code: 'MUST_LEAD' };
    this.passed.add(seat);
    this.last = { seat, action: 'pass' };
    const next = this.nextFrom(seat);
    if (next === null) this.endTrick();
    else this.turn = next;
    return { ok: true };
  }

  // Hết giờ: đang mở vòng thì đánh lá nhỏ nhất (hoặc lá bắt buộc), không thì bỏ lượt.
  auto(seat) {
    if (this.over || seat !== this.turn) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (!this.top) return this.play(seat, [this.mustInclude ?? this.hands[seat][0]]);
    return this.pass(seat);
  }

  finish(seat) {
    this.order.push(seat);
    if (this.mode === 'count') {
      this.over = true;
      return;
    }
    if (this.order.length === 1) {
      // Cóng: người khác về nhất mà mình chưa đánh lá nào → loại khỏi ván.
      for (let other = 0; other < this.n; other += 1) if (other !== seat && !this.played[other]) this.out[other] = true;
    }
    if (this.seats().filter((other) => this.active(other)).length <= 1) this.over = true;
  }

  advance(from) {
    const next = this.nextFrom(from);
    if (next === null) this.endTrick();
    else this.turn = next;
  }

  // Hết vòng: chủ bộ cuối đi tiếp; người đó đã hết bài thì người kế tiếp còn bài đi.
  endTrick() {
    const owner = this.top.seat;
    let lead = this.active(owner) ? owner : null;
    for (let step = 1; lead === null && step <= this.n; step += 1) {
      const next = (owner + step) % this.n;
      if (this.active(next)) lead = next;
    }
    this.top = null;
    this.passed.clear();
    this.chain = 0;
    this.turn = lead;
  }

  seats() {
    return Array.from({ length: this.n }, (_, seat) => seat);
  }

  // Kết quả khi ván xong: { winner, ranking, ranks, transfers: [{ from, to, units, reason }] }. Chưa xong thì null.
  results() {
    if (!this.over) return null;
    const { n } = this;
    const winner = this.order[0];
    const transfers = [...this.ledger];
    const others = this.seats().filter((seat) => seat !== winner);
    if (this.white) {
      const units = this.mode === 'count' ? TIENLEN_UNITS.whiteCount : TIENLEN_UNITS.whiteRank;
      for (const seat of others) transfers.push({ from: seat, to: winner, units, reason: 'white' });
      const ranks = this.seats().map((seat) => (seat === winner ? 1 : 2));
      return { winner, white: this.white.reason, ranking: [winner, ...others], ranks, transfers };
    }
    const cong = this.mode === 'count'
      ? others.filter((seat) => !this.played[seat])
      : others.filter((seat) => this.out[seat]);
    const holding = others.filter((seat) => !this.order.includes(seat) && !cong.includes(seat))
      .sort((a, b) => this.hands[a].length - this.hands[b].length);
    const ranking = [...this.order, ...holding, ...cong];
    let bottom;
    if (this.mode === 'count') {
      for (const seat of others) {
        const left = this.hands[seat].length;
        transfers.push({ from: seat, to: winner, units: cong.includes(seat) ? left * 2 : left, reason: cong.includes(seat) ? 'cong' : 'cards' });
      }
      bottom = others;
    } else {
      for (const seat of cong) transfers.push({ from: seat, to: winner, units: TIENLEN_UNITS.cong, reason: 'cong' });
      if (!cong.length) transfers.push({ from: ranking[n - 1], to: winner, units: TIENLEN_UNITS.last, reason: 'last' });
      if (n === 4 && !cong.includes(ranking[2])) transfers.push({ from: ranking[2], to: ranking[1], units: TIENLEN_UNITS.third, reason: 'third' });
      bottom = cong.length ? cong : [ranking[n - 1]];
    }
    for (const seat of bottom) {
      const penalty = leftoverPenalty(this.hands[seat]);
      if (penalty.units) transfers.push({ from: seat, to: winner, units: penalty.units, reason: 'leftover' });
    }
    const ranks = new Array(n).fill(0);
    ranking.forEach((seat, index) => { ranks[seat] = cong.includes(seat) ? n : index + 1; });
    return { winner, white: null, ranking, ranks, transfers, cong };
  }
}

// Giới hạn số xu mỗi người phải trả: caps(from) = số xu tối đa người đó trả được (undefined = không giới hạn). Vượt thì
// mọi khoản người đó phải trả bị nhân cùng một tỷ lệ (làm tròn xuống, phần lẻ cộng cho các khoản lẻ nhiều nhất để trả
// đúng bằng mức giới hạn). items: [{ from, coins, … }]; trả mảng mới cùng thứ tự.
export function capTransfers(items, caps) {
  const owed = new Map();
  for (const item of items) owed.set(item.from, (owed.get(item.from) || 0) + item.coins);
  const out = items.map((item) => {
    const cap = caps(item.from);
    const total = owed.get(item.from);
    if (cap === undefined || total <= cap) return { ...item };
    const exact = total ? (item.coins * Math.max(0, cap)) / total : 0;
    return { ...item, coins: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  for (const [payer, total] of owed) {
    const cap = caps(payer);
    if (cap === undefined || total <= cap) continue;
    const own = out.filter((item) => item.from === payer);
    let rest = Math.max(0, cap) - own.reduce((sum, item) => sum + item.coins, 0);
    for (const item of [...own].sort((a, b) => b.fraction - a.fraction)) {
      if (rest <= 0) break;
      item.coins += 1;
      rest -= 1;
    }
  }
  for (const item of out) delete item.fraction;
  return out;
}

// Đổi các khoản (phần) ra xu. caps: số xu tối đa mỗi người trả được (mảng theo người chơi, thiếu = không giới hạn).
// Trả { nets, transfers: [{ from, to, units, coins, reason }] }. Tổng nets luôn bằng 0 (trước phế).
export function settleCoins(transfers, { players, stake, caps = [] }) {
  const paid = capTransfers(transfers.map((item) => ({ ...item, coins: item.units * stake })), (from) => caps[from]);
  const nets = new Array(players).fill(0);
  for (const item of paid) {
    nets[item.from] -= item.coins;
    nets[item.to] += item.coins;
  }
  return { nets, transfers: paid };
}

// Chia bài: xáo đủ 52 lá (Fisher–Yates, randomInt(n) trả số nguyên [0, n)), mỗi người 13 lá.
export function deal(players, randomInt) {
  const deck = Array.from({ length: DECK_SIZE }, (_, card) => card);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return Array.from({ length: players }, (_, seat) => deck.slice(seat * HAND_SIZE, (seat + 1) * HAND_SIZE).sort(byValue));
}
