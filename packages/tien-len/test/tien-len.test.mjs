import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beats, botChoice, capTransfers, classify, deal, instantWin, isChop, isFreeChop, leftoverPenalty, planHand, playOptions, RANKS, settleCoins,
  smartSelect, SUITS, TienLenRound, tienLenCut, tienLenMinCoins,
} from '../src/index.mjs';

// '3♠' → 0, '2♥' → 51.
const c = (name) => RANKS.indexOf(name.slice(0, -1)) * 4 + SUITS.indexOf(name.slice(-1));
const cs = (text) => text.split(' ').map(c);
const kind = (text) => {
  const combo = classify(cs(text));
  return combo && `${combo.type}${combo.size}`;
};
// Bài đệm cho đủ 13 lá mà không tạo thành bộ đặc biệt (không tới trắng).
function hand(text, filler) {
  const own = cs(text);
  const rest = filler.filter((card) => !own.includes(card));
  return [...own, ...rest.slice(0, 13 - own.length)];
}

test('nhận ra bộ bài', () => {
  assert.equal(kind('3♠'), 'single1');
  assert.equal(kind('7♣ 7♥'), 'pair2');
  assert.equal(kind('9♠ 9♦ 9♥'), 'triple3');
  assert.equal(kind('K♠ K♣ K♦ K♥'), 'quad4');
  assert.equal(kind('3♠ 4♥ 5♦'), 'straight3');
  assert.equal(kind('10♠ J♣ Q♦ K♥ A♠'), 'straight5');
  assert.equal(kind('3♠ 3♣ 4♦ 4♥ 5♠ 5♣'), 'pairs3');
  assert.equal(kind('8♠ 8♣ 9♦ 9♥ 10♠ 10♣ J♦ J♥'), 'pairs4');
  assert.equal(kind('2♠ 2♥'), 'pair2');
  assert.equal(classify(cs('Q♠ K♣ A♦ 2♥')), null, 'sảnh không có 2');
  assert.equal(classify(cs('K♠ K♣ A♦ A♥ 2♠ 2♣')), null, 'đôi thông không có 2');
  assert.equal(classify(cs('3♠ 5♣ 6♦')), null, 'sảnh đứt');
  assert.equal(classify(cs('3♠ 3♣ 4♦ 4♥')), null, '2 đôi liền chưa thành đôi thông');
  assert.equal(classify(cs('3♠ 3♣ 4♦')), null);
  assert.equal(classify([c('3♠'), c('3♠')]), null, 'trùng lá');
  assert.equal(classify([52]), null);
  assert.equal(classify([]), null);
  assert.equal(classify(cs('5♠ 3♣ 4♦')).type, 'straight', 'không cần xếp sẵn');
});

test('đè và chặt', () => {
  const k = (text) => classify(cs(text));
  assert.ok(beats(null, k('3♠')), 'mở vòng: bộ nào cũng được');
  assert.ok(beats(k('7♠'), k('7♣')), 'cùng hạng: chất lớn hơn');
  assert.ok(!beats(k('7♣'), k('7♠')));
  assert.ok(beats(k('3♠ 4♠ 5♠'), k('3♣ 4♣ 5♦')), 'sảnh: so lá cao nhất');
  assert.ok(!beats(k('3♠ 4♠ 5♠'), k('4♣ 5♣ 6♦ 7♠')), 'sảnh khác số lá');
  assert.ok(!beats(k('7♠ 7♣'), k('8♠')), 'khác loại');
  // Chặt heo.
  assert.ok(beats(k('2♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣')), '3 đôi thông chặt 1 heo');
  assert.ok(!beats(k('2♠ 2♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣')), '3 đôi thông không chặt đôi heo');
  assert.ok(beats(k('2♠ 2♥'), k('4♠ 4♣ 4♦ 4♥')), 'tứ quý chặt đôi heo');
  assert.ok(beats(k('2♠ 2♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♠ 6♣')), '4 đôi thông chặt đôi heo');
  assert.ok(beats(k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣'), k('9♠ 9♣ 9♦ 9♥')), 'tứ quý chặt 3 đôi thông');
  assert.ok(beats(k('9♠ 9♣ 9♦ 9♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♠ 6♣')), '4 đôi thông chặt tứ quý');
  assert.ok(!beats(k('9♠ 9♣ 9♦ 9♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣')), '3 đôi thông không chặt tứ quý');
  assert.ok(beats(k('4♠ 4♣ 5♦ 5♥ 6♠ 6♣'), k('7♠ 7♣ 8♦ 8♥ 9♠ 9♣')), '3 đôi thông lớn chặt 3 đôi thông nhỏ');
  assert.ok(!beats(k('2♠ 2♣ 2♥'), k('3♠ 3♣ 3♦ 3♥')), 'sám heo không ai chặt');
  assert.ok(!beats(k('A♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣')), 'đôi thông không đè rác thường');
  // Tính tiền / chặt ngoài lượt.
  assert.ok(isChop(k('2♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣')));
  assert.ok(!isChop(k('2♠'), k('2♥')), 'heo đè heo không phải chặt');
  assert.ok(isFreeChop(k('2♥'), k('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♠ 6♣')));
  assert.ok(!isFreeChop(k('2♥'), k('4♠ 4♣ 4♦ 4♥')), 'tứ quý phải đúng lượt');
});

test('tới trắng và thối', () => {
  // Đủ 12 hạng trừ A (không thành sảnh rồng), một đôi 3.
  const filler = cs('3♠ 5♣ 7♦ 9♥ J♠ K♣ 4♦ 6♥ 8♠ 10♣ Q♦ 3♥');
  assert.equal(instantWin(hand('2♠ 2♣ 2♦ 2♥', filler)), 'four-twos');
  assert.equal(instantWin(cs('3♠ 4♣ 5♦ 6♥ 7♠ 8♣ 9♦ 10♥ J♠ Q♣ K♦ A♥ 2♠')), 'dragon');
  assert.equal(instantWin(cs('3♠ 3♣ 5♦ 5♥ 7♠ 7♣ 9♦ 9♥ J♠ J♣ K♦ K♥ 2♠')), 'six-pairs');
  assert.equal(instantWin(cs('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♦ 6♥ 7♠ 7♣ 9♦ J♥ 2♠')), 'five-pairs');
  assert.equal(instantWin(cs('3♠ 3♣ 4♦ 4♥ 5♠ 5♣ 6♦ 6♥ 9♠ 9♣ J♦ K♥ 2♠')), null, '4 đôi thông + 1 đôi lẻ chưa đủ');
  assert.equal(instantWin(filler.concat(c('2♠'))), null);
  const penalty = leftoverPenalty(cs('2♠ 2♥ 9♠ 9♣ 9♦ 9♥ 4♠ 4♣ 5♦ 5♥ 6♠ 6♣ K♦'));
  assert.equal(penalty.units, 1 + 2 + 4 + 3, 'heo đen 1, heo đỏ 2, tứ quý 4, 3 đôi thông 3');
  assert.equal(leftoverPenalty(cs('3♠ 7♥')).units, 0);
});

test('vòng đánh: bỏ lượt, hết vòng, lá bắt buộc, đúng lượt', () => {
  const round = new TienLenRound({ mode: 'rank', leader: 0, mustInclude: c('3♠'), hands: [cs('3♠ 5♠ 9♥'), cs('4♣ 6♦ K♠'), cs('7♣ 8♥ Q♦')] });
  assert.equal(round.play(0, [c('5♠')]).code, 'MUST_INCLUDE');
  assert.equal(round.play(1, [c('4♣')]).code, 'NOT_YOUR_TURN');
  assert.equal(round.pass(0).code, 'MUST_LEAD', 'người mở vòng không được bỏ');
  assert.ok(round.play(0, [c('3♠')]).ok);
  assert.equal(round.turn, 1);
  assert.equal(round.play(1, [c('7♣')]).code, 'NOT_YOUR_CARDS');
  assert.ok(round.play(1, [c('4♣')]).ok);
  assert.ok(round.pass(2).ok);
  assert.ok(round.pass(0).ok);
  assert.equal(round.top, null, 'cả hai bỏ: hết vòng');
  assert.equal(round.turn, 1, 'người đánh cuối mở vòng mới');
  assert.ok(round.play(1, [c('6♦')]).ok, 'vòng mới: lá nào cũng được');
  assert.ok(round.play(2, [c('Q♦')]).ok);
  assert.equal(round.play(0, [c('5♠')]).code, 'TOO_SMALL');
});

test('kiểu A: bét trả nhất 2 phần, ba trả nhì 1 phần', () => {
  const round = new TienLenRound({ mode: 'rank', leader: 0, hands: [cs('3♠ 7♣'), cs('4♠ 5♠'), cs('6♠ 8♥ 9♥'), cs('9♠ 10♠ 2♥')] });
  for (const [seat, card] of [[0, '3♠'], [1, '4♠'], [2, '6♠'], [3, '9♠']]) assert.ok(round.play(seat, [c(card)]).ok);
  assert.ok(round.pass(0).ok && round.pass(1).ok);
  assert.ok(round.play(2, [c('9♥')]).ok && round.play(3, [c('10♠')]).ok);
  assert.ok(round.pass(2).ok, 'hết vòng: người 3 mở');
  assert.ok(round.play(3, [c('2♥')]).ok, 'người 3 về nhất');
  assert.deepEqual(round.out, [false, false, false, false], 'ai cũng đã đánh: không cóng');
  assert.ok(round.pass(0).ok && round.pass(1).ok && round.pass(2).ok);
  assert.equal(round.turn, 0, 'người về nhất hết bài: người kế tiếp mở vòng');
  assert.ok(round.play(0, [c('7♣')]).ok, 'người 0 về nhì');
  assert.ok(round.pass(1).ok);
  assert.ok(round.play(2, [c('8♥')]).ok, 'người 2 về ba, còn người 1 → hết ván');
  assert.ok(round.over);
  const result = round.results();
  assert.deepEqual(result.ranking, [3, 0, 2, 1]);
  assert.deepEqual(result.transfers, [
    { from: 1, to: 3, units: 2, reason: 'last' },
    { from: 2, to: 0, units: 1, reason: 'third' },
  ]);
});

test('kiểu A: cóng bị loại ngay, trả nhất 4 phần + thối', () => {
  const round = new TienLenRound({ mode: 'rank', leader: 0, hands: [cs('3♠ 4♠'), cs('6♣'), cs('9♦ 2♥')] });
  round.play(0, [c('3♠')]);
  round.play(1, [c('6♣')]);
  // Người 1 về nhất; người 2 chưa đánh lá nào → cóng, bị loại; chỉ còn người 0 → ván xong.
  assert.ok(round.out[2]);
  assert.equal(round.order[0], 1);
  assert.ok(round.over);
  const result = round.results();
  assert.deepEqual(result.ranking, [1, 0, 2]);
  assert.deepEqual(result.transfers, [
    { from: 2, to: 1, units: 4, reason: 'cong' },
    { from: 2, to: 1, units: 2, reason: 'leftover' },
  ]);
});

test('kiểu B: có người hết bài là xong; trả theo số lá, cóng gấp đôi, thối mọi người', () => {
  const round = new TienLenRound({ mode: 'count', leader: 0, hands: [cs('3♠ A♠'), cs('5♣ 6♣ 2♠'), cs('9♦ 10♦ J♦ K♦')] });
  round.play(0, [c('3♠')]);
  round.play(1, [c('5♣')]);
  round.pass(2);
  round.play(0, [c('A♠')]); // 0 hết bài
  assert.ok(round.over);
  const result = round.results();
  assert.deepEqual(result.transfers, [
    { from: 1, to: 0, units: 2, reason: 'cards' },
    { from: 2, to: 0, units: 8, reason: 'cong' },
    { from: 1, to: 0, units: 1, reason: 'leftover' },
  ]);
});

test('chặt heo, chặt chồng, 4 đôi thông chặt ngoài lượt kể cả khi đã bỏ lượt', () => {
  const pairs3 = '5♠ 5♣ 6♦ 6♥ 7♠ 7♣';
  const quad = '9♠ 9♣ 9♦ 9♥';
  const pairs4 = 'J♠ J♣ Q♦ Q♥ K♠ K♣ A♦ A♥';
  const round = new TienLenRound({ mode: 'rank', leader: 0, hands: [cs('2♥ 3♠'), cs(`${pairs3} 4♣`), cs(`${quad} 8♦`), cs(`${pairs4} 10♥`)] });
  assert.ok(round.play(0, [c('2♥')]).ok);
  assert.equal(round.pass(1).ok, true, 'người 1 bỏ lượt');
  // Người 2 chặt heo đỏ bằng tứ quý: người 0 trả 2 phần.
  const chop = round.play(2, cs(quad));
  assert.deepEqual([chop.chop, chop.units], [true, 2]);
  // Người 1 đã bỏ lượt: 3 đôi thông không chặt được nữa (và vốn không chặt được tứ quý).
  assert.equal(round.play(1, cs(pairs3)).code, 'NOT_YOUR_TURN');
  // Người 3 bỏ lượt rồi vẫn chặt được bằng 4 đôi thông, ngoài lượt.
  assert.ok(round.pass(3).ok);
  const free = round.play(3, cs(pairs4));
  assert.deepEqual([free.ok, free.chop, free.units], [true, true, 2 + 4], 'chặt chồng: trả cả chuỗi heo 2 + tứ quý 4');
  assert.deepEqual(round.ledger, [
    { from: 0, to: 2, units: 2, reason: 'chop' },
    { from: 2, to: 3, units: 6, reason: 'chop' },
  ]);
});

test('tới trắng: hai người cùng tới trắng thì người đi trước được; mỗi người thua trả theo kiểu', () => {
  const dragon = cs('3♠ 4♣ 5♦ 6♥ 7♠ 8♣ 9♦ 10♥ J♠ Q♣ K♦ A♥ 3♣');
  const plain = cs('3♦ 3♥ 4♥ 5♠ 7♦ 8♥ 9♠ J♦ Q♥ K♠ A♣ 10♣ K♥');
  const twos = cs('2♠ 2♣ 2♦ 2♥ 4♠ 5♣ 6♦ 7♥ 8♠ 9♣ 10♦ J♥ Q♠');
  assert.deepEqual([instantWin(dragon), instantWin(plain), instantWin(twos)], ['dragon', null, 'four-twos']);
  const round = new TienLenRound({ mode: 'count', leader: 2, hands: [dragon, plain, twos] });
  assert.equal(round.white.seat, 2, 'người 2 đi trước nên được tới trắng');
  const result = round.results();
  assert.deepEqual(result.transfers, [
    { from: 0, to: 2, units: 13, reason: 'white' },
    { from: 1, to: 2, units: 13, reason: 'white' },
  ]);
});

test('đổi ra xu: tổng bằng 0; ai không đủ xu thì chỉ trả hết số đang có; phế 5%; ngồi bàn cần 10 lần mức cược', () => {
  const transfers = [
    { from: 1, to: 0, units: 13, reason: 'cards' },
    { from: 1, to: 0, units: 20, reason: 'leftover' },
    { from: 2, to: 0, units: 2, reason: 'cards' },
  ];
  const full = settleCoins(transfers, { players: 3, stake: 100 });
  assert.deepEqual(full.nets, [3_500, -3_300, -200], 'không giới hạn: trả đủ');
  const { nets, transfers: paid } = settleCoins(transfers, { players: 3, stake: 100, caps: [undefined, 2_000] });
  assert.equal(nets.reduce((sum, value) => sum + value, 0), 0);
  assert.equal(nets[1], -2_000, 'người 1 nợ 3.300 xu, chỉ còn 2.000 xu');
  assert.equal(paid[2].coins, 200, 'người 2 đủ xu: trả đủ');
  assert.equal(paid[0].coins + paid[1].coins, 2_000);
  assert.deepEqual(capTransfers([{ from: 'a', coins: 50 }], () => 0).map((item) => item.coins), [0], 'hết xu thì không trả gì');
  assert.equal(tienLenCut(1_000), 50);
  assert.equal(tienLenCut(-500), 0);
  assert.equal(tienLenMinCoins(200), 2_000);
});

test('chia bài: 52 lá khác nhau, mỗi người 13 lá', () => {
  let seed = 7;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const hands = deal(4, random);
  assert.equal(new Set(hands.flat()).size, 52);
  assert.ok(hands.every((item) => item.length === 13));
});

test('gợi ý bài chỉ trả bộ đè được', () => {
  const top = classify(cs('7♠ 8♠ 9♠'));
  const options = playOptions(cs('3♠ 8♣ 9♦ 10♥ J♠ 2♠ 2♥ K♣ K♦'), top);
  assert.ok(options.length);
  for (const cards of options) assert.ok(beats(top, classify(cards)), cards.join(','));
});

test('tự chọn bộ khi mở vòng: 2 lá liền nhau → sảnh đi lên; đôi + hạng kế → đôi thông; 2 lá của tứ quý → tứ quý; không rõ ý thì giữ nguyên', () => {
  const pick = (handText, pickedText) => {
    const result = smartSelect({ hand: cs(handText), picked: cs(pickedText) });
    return result && result.map((card) => `${RANKS[card >> 2]}${SUITS[card & 3]}`).join(' ');
  };
  const hand = '3♠ 4♣ 5♦ 6♥ 7♠ 9♦ 9♥ J♠ J♣ Q♦ Q♥ K♠ K♣';
  assert.equal(pick(hand, '3♠ 4♣'), '3♠ 4♣ 5♦ 6♥ 7♠', 'chạm 3 và 4: cả sảnh 3 → 7');
  assert.equal(pick(hand, '5♦ 6♥'), '5♦ 6♥ 7♠', 'chỉ đi lên từ lá thấp nhất đã chọn');
  assert.equal(pick(hand, '3♠ 5♦'), null, 'không liền nhau: giữ nguyên');
  assert.equal(pick(hand, '6♥ 7♠'), null, 'chỉ 2 lá liền, không có 8: chưa thành sảnh');
  assert.equal(pick(hand, 'J♠ J♣ Q♦'), 'J♠ J♣ Q♦ Q♥ K♠ K♣', 'đôi J + Q: 3 đôi thông J-Q-K');
  assert.equal(pick(hand, '9♦ 9♥'), null, 'chọn một đôi thường: giữ là đôi');
  assert.equal(pick('9♠ 9♣ 9♦ 9♥ 3♠', '9♦ 9♥'), '9♠ 9♣ 9♦ 9♥', '2 lá của tứ quý: cả tứ quý');
  assert.equal(pick('9♠ 9♣ 9♦ 3♠', '9♠ 9♣'), null, 'sám thì vẫn là đôi');
  assert.equal(pick(hand, '3♠'), null, 'một lá: giữ nguyên');
  assert.equal(pick('K♠ A♣ 2♦ 2♥ 5♠', 'K♠ A♣'), null, 'sảnh không đi lên tới 2');
  assert.equal(pick(hand, '3♠ 4♣ 5♦ 6♥ 7♠'), null, 'đã đủ sảnh: giữ nguyên');
});

test('tự chọn bộ khi chặn: bộ nhỏ nhất đè được bàn có chứa lá đã chọn; chặt heo bằng hàng; lá tự đè được thì giữ nguyên', () => {
  const pick = (handText, pickedText, topText) => {
    const result = smartSelect({ hand: cs(handText), picked: cs(pickedText), top: cs(topText) });
    return result && result.map((card) => `${RANKS[card >> 2]}${SUITS[card & 3]}`).join(' ');
  };
  const hand = '3♠ 4♣ 5♦ 6♥ 7♠ 8♦ 8♥ J♠ J♣ Q♦ Q♥ K♠ K♣';
  assert.equal(pick(hand, '8♥', '5♠ 5♥'), '8♦ 8♥', 'bàn đôi 5: chạm 8♥ → đôi 8');
  assert.equal(pick(hand, '7♠', '4♠ 5♠ 6♠'), '5♦ 6♥ 7♠', 'bàn sảnh 3 lá: sảnh 3 lá nhỏ nhất có 7♠');
  assert.equal(pick(hand, '3♠', '4♠ 5♠ 6♠ 7♣'), null, 'không có sảnh 4 lá nào chứa 3♠ đè được 7♣: giữ nguyên');
  assert.equal(pick(hand, '8♦', '5♠'), null, 'lá chạm tự đè được rác trên bàn: giữ nguyên');
  assert.equal(pick(hand, 'Q♦', '2♥'), 'J♠ J♣ Q♦ Q♥ K♠ K♣', 'bàn có heo: chạm một lá trong 3 đôi thông → cả bộ để chặt');
  assert.equal(pick('9♠ 9♣ 9♦ 9♥ 3♠', '9♣', '2♠ 2♥'), '9♠ 9♣ 9♦ 9♥', 'bàn đôi heo: chạm một lá tứ quý → cả tứ quý');
});

test('tự chọn bộ thử ngẫu nhiên: luôn trả bộ hợp lệ, gồm mọi lá đã chọn, nằm trong tay, đè được bàn', () => {
  let seed = 2024;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  let changed = 0;
  for (let round = 0; round < 3_000; round += 1) {
    const [hand, other] = deal(2, random);
    const picked = [...new Set(Array.from({ length: 1 + random(3) }, () => hand[random(hand.length)]))];
    const tops = playOptions(other, null);
    const top = random(3) ? null : tops[random(tops.length)];
    const result = smartSelect({ hand, picked, top });
    if (!result) continue;
    changed += 1;
    const combo = classify(result);
    assert.ok(combo, `bộ hợp lệ: ${result}`);
    assert.ok(picked.every((card) => result.includes(card)), 'gồm mọi lá đã chọn');
    assert.ok(result.every((card) => hand.includes(card)), 'chỉ lá trên tay');
    if (top) assert.ok(beats(classify(top), combo), 'đè được bàn');
  }
  assert.ok(changed > 50, `có tự chọn đủ nhiều lần (${changed})`);
});

test('bot chơi có chiến thuật: giữ tứ quý / heo, mở bằng rác thấp nhất, chặt heo bằng hàng, tàn cuộc ra bộ mạnh trước', () => {
  const name = (cards) => cards && cards.map((card) => `${RANKS[card >> 2]}${SUITS[card & 3]}`).join(' ');
  // random 0,5: không rơi vào nhánh "thỉnh thoảng nhường vòng" (< 0,15), vẫn chặt heo (< 0,9).
  const move = (handText, topText = null, extra = {}) => name(botChoice({ hand: cs(handText), top: topText ? cs(topText) : null, random: () => 0.5, ...extra }));
  // Chia bài thành bộ: tứ quý, heo riêng; sảnh, đôi, rác.
  const units = planHand(cs('3♠ 3♣ 3♦ 3♥ 5♠ 6♣ 7♦ 9♠ 9♥ J♣ 2♠ 2♥ K♦'));
  assert.deepEqual(units.map((unit) => `${unit.kind}:${name(unit.cards)}`), [
    'bomb:3♠ 3♣ 3♦ 3♥', 'twos:2♠ 2♥', 'plain:5♠ 6♣ 7♦', 'plain:9♠ 9♥', 'plain:J♣', 'plain:K♦',
  ]);
  // Mở vòng: không ra tứ quý / heo khi còn rác, ra bộ rác thấp nhất.
  assert.equal(move('3♠ 3♣ 3♦ 3♥ 5♠ 6♣ 7♦ 9♠ 9♥ J♣ 2♠ 2♥ K♦'), '5♠ 6♣ 7♦');
  // Nước đầu phải kèm 3♠ mà 3♠ nằm trong tứ quý: chỉ đánh lẻ 3♠.
  assert.equal(move('3♠ 3♣ 3♦ 3♥ 5♠ 6♣ 8♦ 9♠ 9♥ J♣ 2♠ 2♥ K♦', null, { mustInclude: cs('3♠')[0] }), '3♠');
  // Chặn rác nhỏ: dùng lá thường, không phí heo khi còn nhiều bài; rút đầu sảnh 6-7-8-9 (còn 7-8-9) là rẻ nhất.
  assert.equal(move('4♠ 9♦ J♣ Q♥ K♠ 2♠ 2♥ 6♦ 7♠ 8♥', '5♠'), '6♦');
  assert.equal(move('4♠ 9♦ J♣ Q♥ K♠ 2♠ 2♥ 6♦ 7♠ 8♥', '5♠', { random: () => 0 }), '6♦', 'nước rẻ thì không nhường vòng');
  // Bàn là A: được dùng heo (2 đè A là bình thường).
  assert.equal(move('4♠ 6♦ 9♣ J♣ Q♥ 2♠ 7♦ 3♣ 5♥ 8♠', 'A♥'), '2♠');
  // Heo trên bàn: chặt bằng tứ quý.
  assert.equal(move('9♠ 9♣ 9♦ 9♥ 4♠ 6♦ J♣ Q♥ K♠ 3♦', '2♥'), '9♠ 9♣ 9♦ 9♥');
  // Không xé đôi thông để đè đôi khi còn đôi khác đè được.
  assert.equal(move('5♠ 5♣ 6♦ 6♥ 7♠ 7♣ Q♦ Q♥ 3♠ 9♦', '4♠ 4♥'), 'Q♦ Q♥');
  // Tàn cuộc còn 2 bộ (tứ quý + 1 lá): ra tứ quý trước để giành vòng, lá cuối đánh sau.
  assert.equal(move('9♠ 9♣ 9♦ 9♥ 5♠'), '9♠ 9♣ 9♦ 9♥');
  // Chỉ còn heo và hàng (nhiều hơn 2 bộ): ra heo trước, giữ hàng.
  assert.equal(move('9♠ 9♣ 9♦ 9♥ 2♠ 5♦ 5♥ 5♣ 5♠'.replace(' 5♦ 5♥ 5♣ 5♠', ''), null, { opponentMin: 13 }), '9♠ 9♣ 9♦ 9♥');
  assert.equal(move('9♠ 9♣ 9♦ 9♥ 2♠ 4♠ 4♣ 4♦ 4♥'), '2♠');
});

test('bot mạnh hơn hẳn cách đánh ngây thơ (luôn đánh bộ nhỏ nhất, không bao giờ bỏ lượt)', () => {
  let seed = 9973;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const naive = ({ hand, top, mustInclude }) => {
    const combo = top ? classify(top) : null;
    let options = playOptions(hand, combo);
    if (!combo) options = options.filter((cards) => cards.includes(mustInclude ?? Math.min(...hand)));
    options.sort((a, b) => classify(a).top - classify(b).top || a.length - b.length);
    return options[0] || null;
  };
  const games = 400;
  let first = 0;
  let net = 0;
  for (let game = 0; game < games; game += 1) {
    const hands = deal(4, (n) => Math.floor(random() * n));
    const smart = game % 4 < 2 ? [0, 2] : [1, 3];
    const low = Math.min(...hands.flat());
    const round = new TienLenRound({ hands, mode: game % 2 ? 'rank' : 'count', leader: hands.findIndex((hand) => hand.includes(low)), mustInclude: low });
    while (!round.over) {
      const seat = round.turn;
      const opponentMin = Math.min(...round.hands.filter((_, index) => index !== seat && round.active(index)).map((hand) => hand.length));
      const input = { hand: round.hands[seat], top: round.top?.cards || null, mustInclude: round.mustInclude, opponentMin, random };
      const cards = smart.includes(seat) ? botChoice(input) : naive(input);
      assert.ok((cards ? round.play(seat, cards) : round.pass(seat)).ok);
    }
    const outcome = round.results();
    if (smart.includes(outcome.winner)) first += 1;
    settleCoins(outcome.transfers, { players: 4, stake: 1 }).nets.forEach((value, seat) => { if (smart.includes(seat)) net += value; });
  }
  assert.ok(first / games > 0.6, `bot về nhất ${(first / games * 100).toFixed(1)}% số ván`);
  assert.ok(net > 0, `bot thắng tiền (${net} phần)`);
});

test('bot tự đánh hàng trăm ván ngẫu nhiên: mọi nước hợp lệ, ván luôn xong, tổng tiền bằng 0', () => {
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const randomInt = (n) => Math.floor(random() * n);
  for (let game = 0; game < 400; game += 1) {
    const players = 2 + (game % 3);
    const mode = game % 2 ? 'rank' : 'count';
    const hands = deal(players, randomInt);
    const low = Math.min(...hands.flat());
    const leader = hands.findIndex((item) => item.includes(low));
    const round = new TienLenRound({ hands, mode, leader, mustInclude: low });
    let steps = 0;
    while (!round.over) {
      steps += 1;
      assert.ok(steps < 400, 'ván không kết thúc');
      const seat = round.turn;
      const opponentMin = Math.min(...round.hands.filter((_, index) => index !== seat && round.active(index)).map((item) => item.length));
      const move = botChoice({ hand: round.hands[seat], top: round.top?.cards || null, mustInclude: round.mustInclude, opponentMin, random });
      const result = move ? round.play(seat, move) : round.pass(seat);
      assert.ok(result.ok, `ván ${game}: ${result.code} ${move}`);
    }
    const outcome = round.results();
    const caps = new Array(players).fill(tienLenMinCoins(50));
    const { nets } = settleCoins(outcome.transfers, { players, stake: 50, caps });
    assert.equal(nets.reduce((sum, value) => sum + value, 0), 0);
    for (const value of nets) assert.ok(value >= -tienLenMinCoins(50));
  }
});
