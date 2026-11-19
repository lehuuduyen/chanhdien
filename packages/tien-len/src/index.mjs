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
// - Thối (hết ván còn trên tay): heo đen 1, heo đỏ 2, 3 đôi thông 3 (4 đôi thông 4), tứ quý 4, lá 3♠ 1 phần; trả người nhất.
// - Kiểu A "xếp hạng" (rank): chơi tới khi còn một người. Bét trả nhất 2 phần; bàn 4 người thì ba trả nhì 1 phần. Cóng
//   (người khác đã về nhất mà mình chưa đánh lá nào) bị loại ngay, trả nhất 4 phần (gấp đôi). Thối tính cho người bét
//   (có cóng thì cho người cóng).
// - Kiểu B "đếm lá" (count): có người hết bài là xong ván; mỗi người trả nhất 1 phần / lá còn lại, cóng gấp đôi (26).
//   Thối tính cho mọi người còn bài.
// - Tới trắng: kiểu A mỗi người trả 2 phần, kiểu B mỗi người 13 phần; không tính thối.
// - Tới 3 bích: người về nhất mà nước cuối là lá 3♠ đánh lẻ thì tiền về nhân TIENLEN_SPADE_MULTIPLIER — kiểu A: bét trả
//   nhất, cóng; kiểu B: tiền lá còn lại, cóng. Chặt, thối và ba trả nhì giữ nguyên. Ván đầu lá 3♠ phải đánh ở nước đầu
//   nên không tới 3 bích được.
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
export const TIENLEN_UNITS = Object.freeze({ last: 2, third: 1, cong: 4, whiteRank: 2, whiteCount: 13, blackTwo: 1, redTwo: 2, quad: 4, threeSpades: 1 });
// Tới 3 bích: tiền về của người nhất nhân hệ số này.
export const TIENLEN_SPADE_MULTIPLIER = 2;
export const THREE_SPADES = 0;
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

// Thối: heo / hàng / lá 3♠ còn trên tay khi hết ván. Trả { units, items: [{ kind, units, size? }] }.
export function leftoverPenalty(hand) {
  const items = [];
  if (hand.includes(THREE_SPADES)) items.push({ kind: 'three-spades', units: TIENLEN_UNITS.threeSpades });
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
// Bot đánh theo cách người chơi giỏi vẫn làm, chỉ dùng thông tin công khai (bài của mình, các lá đã ra, số lá còn lại
// của từng người), không nhìn bài người khác:
// - Chia bài thành bộ sao cho ít bộ nhất và ít rác lẻ thấp nhất (thử vài cách: ưu tiên sảnh dài / giữ đôi / không sảnh).
// - Nhớ bài đã ra để biết bộ nào "chắc thắng" (không lá nào chưa ra đè được). Tính nước về: số bộ còn đè được ≤ 1 thì đánh
//   các bộ chắc thắng trước để giữ vòng rồi về bằng bộ cuối (lá cuối là 3♠ thì được tới 3 bích ×2).
// - Mở vòng bằng rác thấp nhất, giữ hàng (tứ quý, đôi thông) để chặt heo, giữ heo để giành vòng; xả 3♠ sớm (giữ tới cuối
//   bị thối) trừ khi đang trên đường về.
// - Có người sắp hết bài thì chặn bằng mọi giá (heo, bộ chắc thắng), không mở rác lẻ khi đối thủ còn 1 lá, không mở đôi
//   khi đối thủ còn 2 lá; kiểu đếm lá thì xả bộ nhiều lá để bị phạt ít lá.
// - Không cố ý đánh dở: chặt được heo / hàng thì luôn chặt (cả 4 đôi thông ngoài lượt), không nhường vòng khi đè rẻ được.
//   Mọi bot ở mọi bàn dùng cùng một cách đánh này.
const twoCount = (cards) => cards.filter((card) => rankOf(card) === TWO).length;
// Tham số chiến thuật (chỉnh bằng cách cho bot tự đấu hàng nghìn ván, xem bench trong test).
export const BOT_TUNING = Object.freeze({
  split: 'best', masterLine: true, avoidPair: true, countDump: true, winBonus: 3, lineWin: true,
  keepMasters: true,
  // Phải phí heo / xé hàng mới đè được (không phải lúc chặn đối thủ sắp về): khả năng giữ lại, bỏ lượt.
  holdChance: 0.75,
  // Nhìn trước ở tàn cuộc (botDecide): bật khi mình còn ≤ searchHand lá hoặc đối thủ còn ≤ searchOpponent lá.
  // budgetMs: quá thời gian này thì thôi thử thêm cách chia (ít nhất minSamples), khỏi chặn máy chủ lâu.
  search: true, searchHand: 7, searchOpponent: 4, samples: 12, minSamples: 4, candidates: 7, budgetMs: 25,
});

function unitsFrom(hand, { straights = 'long', keepPairs = false } = {}) {
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
  // Sảnh: dãy hạng liền nhau còn lá, dài nhất trước. keepPairs: không lấy lá ở hạng đang có đúng một đôi (khỏi xé đôi).
  const usable = (rank) => free(rank).length > 0 && !(keepPairs && free(rank).length === 2);
  while (straights !== 'none') {
    let best = null;
    for (let low = 0; low < TWO; low += 1) {
      let high = low;
      while (high < TWO && usable(high)) high += 1;
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

// Điểm một cách chia (thấp là tốt): mỗi bộ thường 1 điểm, rác lẻ thấp (dưới 10) thêm nửa điểm.
function splitScore(units) {
  let score = 0;
  for (const unit of units) {
    if (unit.kind !== 'plain') continue;
    score += 1;
    if (unit.cards.length === 1 && rankOf(unit.cards[0]) < 7) score += 0.5;
  }
  return score;
}

// Chia bài trên tay thành các bộ như người chơi thật: hàng (tứ quý, đôi thông) để dành chặt heo, heo (2) để giành vòng,
// phần còn lại ghép sảnh / sám / đôi / rác theo cách chia ít bộ nhất. Trả [{ kind: 'bomb' | 'twos' | 'plain', cards }].
export function planHand(hand, split = 'best') {
  if (split === 'greedy') return unitsFrom(hand);
  let best = null;
  let bestScore = Infinity;
  for (const options of [{ straights: 'long' }, { straights: 'long', keepPairs: true }, { straights: 'none' }]) {
    const units = unitsFrom(hand, options);
    const score = splitScore(units);
    if (score < bestScore) {
      best = units;
      bestScore = score;
    }
  }
  return best;
}

// Các lá chưa ra (không nằm trên tay mình, chưa đánh) theo hạng. Bàn 4 người thì đúng là bài của các đối thủ; bàn ít người
// thì gồm cả lá không chia (đánh giá thận trọng hơn).
function unknownBuckets(hand, seen) {
  const known = new Set([...hand, ...seen]);
  const buckets = Array.from({ length: 13 }, () => []);
  for (let card = 0; card < DECK_SIZE; card += 1) if (!known.has(card)) buckets[rankOf(card)].push(card);
  return buckets;
}

// Có dãy need lá mỗi hạng, dài len hạng, hạng cuối ≥ endMin (hạng cuối = endMin thì lá cao nhất phải lớn hơn topCard).
function hasRun(buckets, need, len, endMin, topCard = -1) {
  for (let end = Math.max(endMin, len - 1); end < TWO; end += 1) {
    let whole = true;
    for (let rank = end - len + 1; rank <= end && whole; rank += 1) if (buckets[rank].length < need) whole = false;
    if (whole && (end > endMin || buckets[end].at(-1) > topCard)) return true;
  }
  return false;
}

const hasQuad = (buckets, above = -1) => buckets.some((cards, rank) => rank > above && rank < TWO && cards.length === 4);

// Các lá chưa ra có tạo được bộ đè combo không (theo đúng luật beats).
function beatable(buckets, combo) {
  const rank = rankOf(combo.top);
  const sameKind = (size) => buckets.some((cards, other) => cards.length >= size && (other > rank || (other === rank && cards.at(-1) > combo.top)));
  switch (combo.type) {
    case 'single':
      return sameKind(1) || (rank === TWO && (hasQuad(buckets) || hasRun(buckets, 2, 3, 0)));
    case 'pair':
      return sameKind(2) || (rank === TWO && (hasQuad(buckets) || hasRun(buckets, 2, 4, 0)));
    case 'triple':
      return rank !== TWO && sameKind(3);
    case 'quad':
      return hasQuad(buckets, rank) || hasRun(buckets, 2, 4, 0);
    case 'straight':
      return hasRun(buckets, 1, combo.size, rank, combo.top);
    case 'pairs':
      return hasRun(buckets, 2, combo.size, rank, combo.top) || hasRun(buckets, 2, combo.size + 1, 0) || (combo.size === 3 && hasQuad(buckets));
    default:
      return true;
  }
}

// Gắn cờ "chắc thắng" cho từng bộ; trả số bộ còn đè được (bộ yếu).
function markMasters(units, buckets) {
  let weak = 0;
  for (const unit of units) {
    unit.combo = classify(unit.cards);
    unit.master = !beatable(buckets, unit.combo);
    if (!unit.master) weak += 1;
  }
  return weak;
}

// Lá cao nhất để đánh lẻ: ưu tiên lá không nằm trong hàng (tứ quý, đôi thông); chỉ còn hàng thì lấy lá cao nhất.
function highestSingle(hand, units) {
  const loose = units.filter((unit) => unit.kind !== 'bomb').flatMap((unit) => unit.cards);
  return Math.max(...(loose.length ? loose : hand));
}

// Độ "mạnh" của một bộ để giữ vòng: hàng > heo > bộ thường (theo lá cao nhất).
const unitStrength = (unit) => (unit.kind === 'bomb' ? 200 : unit.kind === 'twos' ? 100 + unit.cards.length * 10 : 0) + classify(unit.cards).top;

// Bot chọn nước: trả mảng lá hoặc null (bỏ lượt). Chỉ dùng thông tin công khai: bài của mình, bộ trên bàn, các lá đã ra
// trong ván (seen, gồm cả bộ trên bàn), số lá ít nhất của đối thủ còn trong ván, kiểu tính tiền. random() trả [0, 1).
export function botChoice({ hand, top = null, mustInclude = null, opponentMin = HAND_SIZE, random = Math.random, seen = [], mode = 'rank', tuning = null }) {
  if (!hand.length) return null;
  const T = tuning ? { ...BOT_TUNING, ...tuning } : BOT_TUNING;
  const topCombo = top ? classify(top) : null;
  const options = playOptions(hand, topCombo);
  if (!options.length) return null;
  // Đánh hết được luôn thì đánh.
  const finishing = options.find((cards) => cards.length === hand.length);
  if (finishing && (!mustInclude || finishing.includes(mustInclude))) return finishing;
  const buckets = unknownBuckets(hand, [...seen, ...(top || [])]);
  const units = planHand(hand, T.split);
  const weak = markMasters(units, buckets);
  const danger = opponentMin <= 2;
  const endgame = hand.length <= 4 || danger || units.length <= 2;

  if (!topCombo) {
    if (mustInclude !== null) {
      const unit = units.find((item) => item.cards.includes(mustInclude));
      if (unit && unit.kind === 'plain') return unit.cards;
      return [mustInclude];
    }
    if (units.length === 1) return units[0].cards;
    // Đường về: còn tối đa một bộ đè được → đánh các bộ chắc thắng trước (giữ vòng), bộ cuối để về.
    if (T.masterLine && weak <= 1) {
      const masters = units.filter((unit) => unit.master);
      return [...masters].sort((a, b) => b.cards.length - a.cards.length || a.combo.top - b.combo.top)[0].cards;
    }
    if (units.length === 2) return [...units].sort((a, b) => unitStrength(b) - unitStrength(a))[0].cards;
    let pool = units.filter((unit) => unit.kind === 'plain' && !(T.keepMasters && unit.master));
    if (!pool.length) pool = units.filter((unit) => unit.kind === 'plain');
    if (!pool.length) {
      // Chỉ còn heo và hàng: ra heo trước, giữ hàng.
      pool = units.filter((unit) => unit.kind === 'twos');
      if (!pool.length) pool = units;
      return [...pool].sort((a, b) => unitStrength(a) - unitStrength(b))[0].cards;
    }
    if (opponentMin === 1) {
      // Đối thủ còn 1 lá: mở bằng bộ nhiều lá (đối thủ không đè được); chỉ còn rác thì ra lá cao nhất trên tay, kể cả heo
      // (không xé hàng), để đối thủ khó đè mà về.
      const multi = pool.filter((unit) => unit.cards.length > 1);
      if (multi.length) pool = multi;
      else return [highestSingle(hand, units)];
    } else if (T.avoidPair && opponentMin === 2) {
      // Đối thủ còn 2 lá (có thể là một đôi): tránh mở đôi.
      const other = pool.filter((unit) => unit.combo.type !== 'pair');
      if (other.length) pool = other;
    }
    // Kiểu đếm lá, có người sắp hết bài: xả bộ nhiều lá nhất.
    if (T.countDump && mode === 'count' && opponentMin <= 3) return [...pool].sort((a, b) => b.cards.length - a.cards.length || a.combo.top - b.combo.top)[0].cards;
    // Rác thấp nhất trước; cùng hạng thì bộ nhiều lá trước (xả bài nhanh).
    return [...pool].sort((a, b) => rankOf(a.cards[0]) - rankOf(b.cards[0]) || b.cards.length - a.cards.length)[0].cards;
  }

  // Chặt heo / hàng bằng hàng nhỏ nhất (ăn tiền).
  if (isTwos(topCombo) || isBomb(topCombo)) {
    const chops = options.filter((cards) => isChop(topCombo, classify(cards)));
    if (chops.length) return chops.sort((a, b) => classify(a).top - classify(b).top)[0];
  }
  // Đối thủ còn 1 lá mà trên bàn là rác: đè bằng lá cao nhất có (kể cả heo), không bỏ lượt, để đối thủ không về được.
  if (opponentMin === 1 && topCombo.type === 'single') {
    const singles = options.filter((cards) => cards.length === 1);
    if (singles.length) return singles.sort((a, b) => b[0] - a[0])[0];
  }
  const unitOf = new Map();
  units.forEach((unit, index) => { for (const card of unit.cards) unitOf.set(card, index); });
  const highTop = rankOf(topCombo.top) >= 11;
  const cost = (cards, combo) => {
    let value = rankOf(combo.top);
    const touched = new Set(cards.map((card) => unitOf.get(card)));
    for (const index of touched) {
      const unit = units[index];
      if (unit.cards.every((card) => cards.includes(card))) continue;
      // Xé bộ: xé hàng rất tốn, xé heo thì tính ở dưới; xé bộ thường mà phần còn lại vẫn thành bộ (rút đầu sảnh 6-7-8-9 còn
      // 7-8-9) thì rẻ, không thì vừa phải.
      const rest = unit.cards.filter((card) => !cards.includes(card));
      value += unit.kind === 'bomb' ? 60 : unit.kind === 'twos' ? 0 : classify(rest) ? 2 : 6;
    }
    if (isBomb(combo)) value += 60;
    if (twoCount(cards) && !endgame) value += highTop ? 6 : 25;
    return value;
  };
  const ranked = options.map((cards) => {
    const combo = classify(cards);
    const wins = !beatable(buckets, combo);
    // Giành được vòng và phần còn lại về được (còn ≤ 1 bộ đè được): nước thắng.
    let line = false;
    if (wins && T.lineWin) {
      const rest = hand.filter((card) => !cards.includes(card));
      line = markMasters(planHand(rest, T.split), buckets) <= 1;
    }
    return { cards, combo, wins, line, cost: cost(cards, combo) - (wins ? T.winBonus : 0) };
  }).sort((a, b) => a.cost - b.cost);
  const winning = ranked.filter((item) => item.line);
  if (winning.length && (endgame || winning[0].cost < 25)) return winning[0].cards;
  // Có người sắp hết bài: phải chặn — ưu tiên nước giành chắc vòng, không có thì đè bằng bộ lớn nhất có thể.
  const best = ranked[0];
  if (endgame) return best.cards;
  // Phải phí heo / xé hàng mới đè được: phần lớn thời gian giữ lại.
  if (best.cost >= 25 && random() < T.holdChance) return null;
  return best.cards;
}

// ---- Nhìn trước (tàn cuộc) ----
// Chỉ đọc phần công khai của ván + bài của chính bot; không bao giờ đọc bài người khác.
function publicView(round, seat) {
  return {
    seat, n: round.n, mode: round.mode, hand: [...round.hands[seat]], counts: round.hands.map((hand) => hand.length),
    played: [...round.played], out: [...round.out], order: [...round.order], turn: round.turn,
    top: round.top ? { seat: round.top.seat, cards: [...round.top.cards], combo: round.top.combo } : null,
    passed: [...round.passed], chain: round.chain, mustInclude: round.mustInclude, discards: [...round.discards], spade: round.spade,
  };
}

// Dựng lại ván từ phần công khai với bài đoán cho đối thủ (hands đủ mọi ghế).
function replay(view, hands) {
  const round = Object.create(TienLenRound.prototype);
  Object.assign(round, {
    n: view.n, mode: view.mode, hands, played: [...view.played], out: [...view.out], order: [...view.order], turn: view.turn,
    top: view.top ? { ...view.top, cards: [...view.top.cards] } : null, passed: new Set(view.passed), chain: view.chain,
    ledger: [], over: false, white: null, mustInclude: view.mustInclude, last: null, discards: [...view.discards], spade: view.spade,
  });
  return round;
}

// Chia ngẫu nhiên các lá chưa ra cho đối thủ theo đúng số lá mỗi người (bàn ít người thì phần dư là lá không chia).
function sampleHands(view, random) {
  const known = new Set([...view.hand, ...view.discards]);
  const pool = [];
  for (let card = 0; card < DECK_SIZE; card += 1) if (!known.has(card)) pool.push(card);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  let next = 0;
  return view.counts.map((count, seat) => {
    if (seat === view.seat) return [...view.hand];
    const hand = pool.slice(next, next + count).sort(byValue);
    next += count;
    return hand;
  });
}

const opponentMinOf = (round, seat) => Math.min(...round.seats().filter((other) => other !== seat && round.active(other)).map((other) => round.hands[other].length));

// Cả bàn tự đánh tiếp tới hết ván (mọi người dùng botChoice, không nhìn trước); trả số phần ghế seat được / mất.
function rollout(round, seat, random) {
  for (let steps = 0; !round.over && steps < 300; steps += 1) {
    const turn = round.turn;
    const cards = botChoice({ hand: round.hands[turn], top: round.top?.cards || null, mustInclude: round.mustInclude,
      opponentMin: opponentMinOf(round, turn), random, seen: round.discards, mode: round.mode, tuning: { search: false } });
    const result = cards ? round.play(turn, cards) : round.pass(turn);
    if (!result.ok) round.auto(turn);
  }
  if (!round.over) return 0;
  let net = 0;
  for (const item of round.results().transfers) net += (item.to === seat ? item.units : 0) - (item.from === seat ? item.units : 0);
  return net;
}

// Bot đi một nước trong ván đang chơi (ghế seat đang tới lượt). Thường đánh theo botChoice; ở tàn cuộc thì nhìn trước:
// thử từng nước ứng viên trên cùng samples cách đoán bài đối thủ, chọn nước được nhiều phần nhất trung bình.
export function botDecide(round, seat, { random = Math.random, tuning = null } = {}) {
  const T = tuning ? { ...BOT_TUNING, ...tuning } : BOT_TUNING;
  const view = publicView(round, seat);
  const opponentMin = opponentMinOf(round, seat);
  const input = { hand: view.hand, top: view.top?.cards || null, mustInclude: view.mustInclude, opponentMin, random, seen: view.discards, mode: view.mode, tuning };
  const choice = botChoice(input);
  if (!T.search || view.mustInclude !== null || (view.hand.length > T.searchHand && opponentMin > T.searchOpponent)) return choice;
  const topCombo = view.top?.combo || null;
  // Đối thủ còn 1 lá: trên bàn là rác thì đánh lá cao nhất (botChoice đã chọn), không thử nước khác.
  if (opponentMin === 1 && topCombo?.type === 'single') return choice;
  const options = playOptions(view.hand, topCombo);
  if (options.some((cards) => cards.length === view.hand.length)) return choice;
  // Ứng viên: nước của botChoice, các bộ trên tay (mở vòng), các nước đè rẻ nhất + nước đè lớn nhất, bỏ lượt (đang chặn).
  const seenKeys = new Set();
  const candidates = [];
  const add = (cards) => {
    const key = cards ? cards.join() : 'pass';
    if (seenKeys.has(key) || candidates.length >= T.candidates) return;
    // Đối thủ còn 1 lá: không mở vòng bằng rác lẻ nào khác lá cao nhất mà botChoice đã chọn.
    if (opponentMin === 1 && cards?.length === 1 && !(choice?.length === 1 && cards[0] === choice[0])) return;
    seenKeys.add(key);
    candidates.push(cards);
  };
  add(choice);
  if (!topCombo) for (const unit of planHand(view.hand, T.split)) add(unit.cards);
  else add(null);
  const sorted = options.map((cards) => ({ cards, combo: classify(cards) })).sort((a, b) => a.combo.top - b.combo.top || a.cards.length - b.cards.length);
  if (sorted.length) add(sorted.at(-1).cards);
  for (const item of sorted) add(item.cards);
  if (candidates.length < 2) return choice;
  const scores = new Array(candidates.length).fill(0);
  const started = Date.now();
  for (let sample = 0; sample < T.samples; sample += 1) {
    if (sample >= T.minSamples && Date.now() - started > T.budgetMs) break;
    const hands = sampleHands(view, random);
    candidates.forEach((cards, index) => {
      const copy = replay(view, hands.map((hand) => [...hand]));
      const result = cards ? copy.play(seat, cards) : copy.pass(seat);
      scores[index] += result.ok ? rollout(copy, seat, random) : -1_000;
    });
  }
  let best = 0;
  for (let index = 1; index < candidates.length; index += 1) if (scores[index] > scores[best]) best = index;
  return candidates[best];
}

// 4 đôi thông chặt ngoài lượt (bot không tới lượt, kể cả đã bỏ lượt): trả bộ chặt nhỏ nhất hoặc null.
export function botFreeChop({ hand, top }) {
  const topCombo = top ? classify(top) : null;
  if (!topCombo || !(isTwos(topCombo) || isBomb(topCombo))) return null;
  const chops = playOptions(hand, topCombo).filter((cards) => isFreeChop(topCombo, classify(cards)));
  if (!chops.length) return null;
  return chops.sort((a, b) => classify(a).top - classify(b).top)[0];
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
    // Các lá đã đánh ra trong ván (công khai, bot dùng để nhớ bài).
    this.discards = [];
    // Người nhất về bằng lá 3♠ đánh lẻ (tới 3 bích).
    this.spade = false;
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
    this.discards.push(...cards);
    this.played[seat] = true;
    this.mustInclude = null;
    this.passed.delete(seat);
    const sorted = [...cards].sort(byValue);
    this.top = { seat, cards: sorted, combo };
    this.last = { seat, action: chop ? 'chop' : 'play', cards: sorted, ...(chop ? { units, victim: this.ledger.at(-1).from } : {}) };
    if (!this.hands[seat].length) {
      if (!this.order.length && cards.length === 1 && cards[0] === THREE_SPADES) this.spade = true;
      this.finish(seat);
    }
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

  // Kết quả khi ván xong: { winner, ranking, ranks, transfers: [{ from, to, units, reason }], spade }. Chưa xong thì null.
  // spade: người nhất tới 3 bích (tiền về đã nhân TIENLEN_SPADE_MULTIPLIER).
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
    const times = this.spade ? TIENLEN_SPADE_MULTIPLIER : 1;
    let bottom;
    if (this.mode === 'count') {
      for (const seat of others) {
        const left = this.hands[seat].length;
        transfers.push({ from: seat, to: winner, units: (cong.includes(seat) ? left * 2 : left) * times, reason: cong.includes(seat) ? 'cong' : 'cards' });
      }
      bottom = others;
    } else {
      for (const seat of cong) transfers.push({ from: seat, to: winner, units: TIENLEN_UNITS.cong * times, reason: 'cong' });
      if (!cong.length) transfers.push({ from: ranking[n - 1], to: winner, units: TIENLEN_UNITS.last * times, reason: 'last' });
      if (n === 4 && !cong.includes(ranking[2])) transfers.push({ from: ranking[2], to: ranking[1], units: TIENLEN_UNITS.third, reason: 'third' });
      bottom = cong.length ? cong : [ranking[n - 1]];
    }
    for (const seat of bottom) {
      const penalty = leftoverPenalty(this.hands[seat]);
      if (penalty.units) transfers.push({ from: seat, to: winner, units: penalty.units, reason: 'leftover' });
    }
    const ranks = new Array(n).fill(0);
    ranking.forEach((seat, index) => { ranks[seat] = cong.includes(seat) ? n : index + 1; });
    return { winner, white: null, ranking, ranks, transfers, cong, spade: this.spade };
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
