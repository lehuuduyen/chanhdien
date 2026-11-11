// Tiến lên: chạy 100 ván liên tiếp qua bàn thật (không chỉ bộ luật) và kiểm tra chống gian lận / chống xem bài.
// - Mỗi tin gửi cho người chơi được đổi ra JSON như trình duyệt nhận (thứ F12 → Network thấy được) rồi đối chiếu với bài
//   thật trên server ngay lúc gửi: chỉ có bài của chính mình, bài người khác chỉ lộ khi họ đã đánh ra.
// - Người chơi "giả" thỉnh thoảng gian lận: đánh lá của người khác, đánh / bỏ lượt khi chưa tới lượt, đánh hộ người khác,
//   đánh vào bàn khác, sửa bài trong tin nhận được — server phải từ chối và không đổi gì.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomInt } from 'node:crypto';
import test from 'node:test';
import { parseServerMessage, PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { TIENLEN_RULES } from '@chanh-dien/room-rules';
import { createJoinTicket } from '@chanh-dien/session-token';
import { botChoice, capTransfers, classify, HAND_SIZE, isFreeChop, playOptions, TIENLEN_HOUSE_CUT_PERCENT, tienLenMinCoins } from '@chanh-dien/tien-len';
import { WebSocket } from 'ws';
import { createRealtimeServer, RoomRegistry } from '../server.mjs';
import { TienLenTable } from '../tien-len.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const sorted = (cards) => [...cards].sort((a, b) => a - b);
// Nhịp rất ngắn để chạy được nhiều ván; lượt người chơi giả đi ngay nên hiếm khi hết giờ (hết giờ vẫn là nước hợp lệ).
const FAST = {
  ...TIENLEN_RULES.interaction, startMs: 4, fullStartMs: 2, turnMs: 60, afkTurnMs: 15, resultMs: 4, botActMs: [1, 2], tickMs: 2,
  botFill: { firstDelayMs: [1, 2], delayMs: [1, 2], maxStake: 500 }, botTables: [0, 0], botTableMs: [100, 100],
};

function seeded(seed) {
  let value = seed;
  const next = () => {
    value = (value * 1103515245 + 12345) % 2 ** 31;
    return value / 2 ** 31;
  };
  return { int: (n) => Math.floor(next() * n), float: next };
}

// Ví giả giống API: kiểm tra đủ 10 lần mức cược, ghi người vào ván, chốt theo các khoản (thiếu xu thì trả hết số có).
function fakeBank(wallet) {
  const balance = (accountId) => wallet[accountId] ?? 0;
  const begins = new Map();
  const settles = [];
  return {
    begins,
    settles,
    async check({ accountId, stake }) {
      const need = tienLenMinCoins(stake);
      return balance(accountId) >= need ? { ok: true, coins: balance(accountId), need } : { ok: false, code: 'INSUFFICIENT_COINS', coins: balance(accountId), need };
    },
    async begin({ accountId, matchId, stake }) {
      if (balance(accountId) < tienLenMinCoins(stake)) return { ok: false, code: 'INSUFFICIENT_COINS' };
      if (!begins.has(matchId)) begins.set(matchId, new Set());
      begins.get(matchId).add(accountId);
      return { ok: true, coins: balance(accountId) };
    },
    async settle(input) {
      const players = begins.get(input.matchId) || new Set();
      for (const item of input.transfers) {
        assert.ok(Number.isSafeInteger(item.coins) && item.coins >= 0, 'khoản là số xu nguyên không âm');
        for (const side of [item.from, item.to]) assert.ok(side === null ? input.bots : players.has(side), `khoản chỉ giữa người trong ván: ${side}`);
      }
      const paid = capTransfers(input.transfers, (from) => (from === null ? undefined : balance(from)));
      const results = [...players].map((accountId) => {
        const out = paid.filter((item) => item.from === accountId).reduce((sum, item) => sum + item.coins, 0);
        const received = paid.filter((item) => item.to === accountId).reduce((sum, item) => sum + item.coins, 0);
        const cut = received > out ? Math.floor(((received - out) * TIENLEN_HOUSE_CUT_PERCENT) / 100) : 0;
        wallet[accountId] = balance(accountId) + received - out - cut;
        return { accountId, paid: out, received, net: received - out - cut, cut, coins: wallet[accountId] };
      });
      settles.push({ input, results });
      return { ok: true, results };
    },
  };
}

// Bàn trong tiến trình test; mọi tin gửi người chơi đi qua bộ kiểm tra lộ bài.
function setup({ seed, bots = 0, coins = {}, rules = FAST, randomInt = null }) {
  const wallet = { ...coins };
  const bank = fakeBank(wallet);
  const leaks = [];
  const sent = new Map();
  let table = null;
  const room = {
    id: 'tienlen-1',
    epoch: 1,
    participants: new Map(),
    sendTo(id, message) {
      const raw = JSON.parse(JSON.stringify(message));
      assert.equal(parseServerMessage(raw).ok, true, `tin hợp lệ: ${JSON.stringify(raw)}`);
      checkView(table, raw, leaks);
      if (!sent.has(id)) sent.set(id, []);
      sent.get(id).push(raw);
    },
    broadcast(message) {
      const raw = JSON.parse(JSON.stringify(message));
      assert.equal(parseServerMessage(raw).ok, true);
      assert.ok(!/"(hand|cards|top|mustInclude)"/.test(JSON.stringify(raw)), 'tin cả phòng không mang bài');
    },
  };
  const random = seeded(seed);
  table = new TienLenTable({ room, rules, ...bank, random: randomInt || random.int });
  const join = (id) => {
    const participant = { id, accountId: `acc-${id}`, displayName: id.toUpperCase(), connected: true };
    room.participants.set(id, participant);
    return participant;
  };
  for (let index = 0; index < bots; index += 1) {
    room.participants.set(`bot-${index}`, { id: `bot-${index}`, displayName: `Bot ${index}`, connected: true, bot: true });
  }
  table.start();
  return { table, room, bank, wallet, leaks, sent, join, random };
}

// Đối chiếu một tin bàn với bài thật trên server ngay lúc gửi.
function checkView(tables, message, leaks) {
  if (message.type !== 'tienlen.table' || message.phase === 'closed') {
    for (const key of ['hand', 'top', 'mustInclude']) if (key in message) leaks.push(`${message.type}/${message.phase} mang ${key}`);
    return;
  }
  const board = tables.tables.get(message.tableId);
  const round = board?.round;
  const me = round ? board.players.indexOf(message.seat) : -1;
  if (!round || me < 0) {
    if (message.hand?.length) leaks.push('chưa vào ván mà có bài');
    return;
  }
  const mine = round.hands[me];
  if (message.hand && sorted(message.hand).join() !== sorted(mine).join()) leaks.push(`bài gửi khác bài thật: ${message.hand} / ${mine}`);
  const others = new Set(round.hands.filter((_, player) => player !== me).flat());
  const shown = [...(message.hand || []), ...(message.top?.cards || []), ...(message.last?.cards || []),
    ...(message.mustInclude === undefined ? [] : [message.mustInclude])];
  for (const card of shown) if (others.has(card)) leaks.push(`lộ lá ${card} còn trên tay người khác`);
  if (message.mustInclude !== undefined && !mine.includes(message.mustInclude)) leaks.push('lá bắt buộc không phải của mình');
  // Lật bài: chỉ khi ván đã xong, và đúng bài còn lại trên server.
  if (message.result?.hands) {
    if (message.phase !== 'result' || !round.over) leaks.push(`lật bài khi ván chưa xong (${message.phase})`);
    board.players.forEach((seat, player) => {
      if (sorted(message.result.hands[seat] || []).join() !== sorted(round.hands[player]).join()) leaks.push('bài lật khác bài thật');
    });
  }
  if (message.phase === 'playing' && message.result) leaks.push('đang chơi mà có kết quả');
  message.players.forEach((player, seat) => {
    const index = board.players.indexOf(seat);
    if (player && index >= 0 && player.cards !== round.hands[index].length) leaks.push('số lá người khác sai');
    if (player && Object.keys(player).some((key) => !['displayName', 'cards', 'skin', 'level', 'passed', 'rank', 'cong', 'away', 'leaving', 'missed'].includes(key))) {
      leaks.push(`ghế mang thêm trường lạ: ${Object.keys(player)}`);
    }
  });
}

// Tình trạng một ván: bài không trùng, không mất, đúng số lá.
function checkRound(board) {
  const { round } = board;
  const held = round.hands.flat();
  assert.equal(new Set(held).size, held.length, 'không lá nào nằm trên hai tay');
  assert.ok(held.every((card) => Number.isInteger(card) && card >= 0 && card < 52));
  const playedCount = round.n * HAND_SIZE - held.length;
  assert.ok(playedCount >= 0 && playedCount <= round.n * HAND_SIZE);
  if (round.top) for (const card of round.top.cards) assert.ok(!held.includes(card), 'bài trên bàn không còn trên tay ai');
  if (!round.over) {
    assert.ok(round.active(round.turn), 'lượt luôn thuộc người còn bài');
    assert.ok(!round.passed.has(round.turn), 'người đã bỏ lượt không được tới lượt');
  }
}

const humanOf = (ctx, seat) => [...ctx.room.participants.values()].find((item) => item.accountId === seat.accountId);

// Người chơi giả đi một nước (đôi khi gian lận / đứng im cho hết giờ). Trả số lần gian lận đã thử.
function humanMove(ctx, board, stats) {
  const { round, players } = board;
  const seat = board.seats[players[round.turn]];
  const participant = humanOf(ctx, seat);
  const me = round.turn;
  const roll = ctx.random.float();
  const snapshot = JSON.stringify([round.hands, round.turn, round.top, [...round.passed]]);
  const unchanged = () => assert.equal(JSON.stringify([round.hands, round.turn, round.top, [...round.passed]]), snapshot, 'nước gian lận không đổi gì');
  // 4 đôi thông chặt ngoài lượt (luật cho phép): người thật nào có thì chặt.
  if (round.top) {
    for (const [player, hand] of round.hands.entries()) {
      const other = board.seats[players[player]];
      if (player === me || player === round.top.seat || other.bot || !round.active(player)) continue;
      const free = playOptions(hand, classify(round.top.cards)).find((cards) => isFreeChop(classify(round.top.cards), classify(cards)));
      if (free) {
        assert.ok(ctx.table.play(humanOf(ctx, other), { tableId: board.id, cards: free }).ok, '4 đôi thông chặt ngoài lượt');
        stats.freeChops += 1;
        return;
      }
    }
  }
  if (roll < 0.05) {
    // Đánh lá đang nằm trên tay người khác.
    const victim = round.hands.findIndex((hand, player) => player !== me && hand.length);
    if (victim >= 0) {
      assert.equal(ctx.table.play(participant, { tableId: board.id, cards: [round.hands[victim][0]] }).code, 'NOT_YOUR_CARDS');
      unchanged();
      stats.cheats += 1;
    }
  } else if (roll < 0.09) {
    // Người chưa tới lượt đánh / bỏ lượt; người không ngồi bàn đánh vào bàn này.
    const waiting = round.hands.findIndex((hand, player) => player !== me && round.active(player) && !board.seats[players[player]].bot);
    if (waiting >= 0) {
      const other = humanOf(ctx, board.seats[players[waiting]]);
      const cards = [round.hands[waiting][0]];
      const result = ctx.table.play(other, { tableId: board.id, cards });
      assert.ok(['NOT_YOUR_TURN', 'TOO_SMALL', 'INVALID_COMBO'].includes(result.code), `chưa tới lượt: ${result.code}`);
      assert.equal(ctx.table.pass(other, { tableId: board.id }).code, 'NOT_YOUR_TURN');
    }
    assert.equal(ctx.table.play(ctx.outsider, { tableId: board.id, cards: [round.hands[me][0]] }).code, 'NOT_IN_GAME');
    unchanged();
    stats.cheats += 1;
  } else if (roll < 0.11) {
    stats.idle += 1;
    return 'idle';
  }
  const top = round.top ? classify(round.top.cards) : null;
  let options = playOptions(round.hands[me], top);
  if (round.mustInclude !== null) options = options.filter((cards) => cards.includes(round.mustInclude));
  if (round.top && (!options.length || ctx.random.float() < 0.3)) {
    assert.ok(ctx.table.pass(participant, { tableId: board.id }).ok);
  } else {
    const cards = options[ctx.random.int(options.length)];
    const result = ctx.table.play(participant, { tableId: board.id, cards });
    assert.ok(result.ok, `${result.code} ${cards}`);
    // Đánh lại đúng bộ vừa đánh (gửi lặp gói): bị từ chối.
    if (!round.over) assert.ok(!ctx.table.play(participant, { tableId: board.id, cards }).ok);
  }
  stats.moves += 1;
  return 'moved';
}

async function playMany({ seed, humans, bots, mode, stake, games, stats }) {
  const names = Array.from({ length: humans }, (_, index) => `p${seed}-${index}`);
  const coins = Object.fromEntries(names.map((name) => [`acc-${name}`, 10_000_000]));
  const ctx = setup({ seed, bots, coins, rules: FAST });
  ctx.outsider = ctx.join(`outsider-${seed}`);
  const people = names.map((name) => ctx.join(name));
  assert.ok((await ctx.table.open(people[0], { stake, mode })).ok);
  const board = [...ctx.table.tables.values()][0];
  for (const person of people.slice(1)) assert.ok((await ctx.table.join(person, { tableId: board.id })).ok);
  const start = { ...ctx.wallet };
  let done = 0;
  let seenGame = 0;
  let deadline = Date.now() + 5_000;
  while (done < games) {
    assert.ok(Date.now() < deadline, `ván ${board.game} không kết thúc (pha ${board.phase})`);
    assert.ok(ctx.table.tables.has(board.id), 'bàn không bị giải tán giữa chừng');
    if (board.phase === 'playing' && board.round && !board.round.over) {
      checkRound(board);
      const seat = board.seats[board.players[board.round.turn]];
      if (!seat.bot && humanMove(ctx, board, stats) === 'idle') {
        // Đứng im cho hết giờ: server tự đi hộ.
        const before = JSON.stringify([board.round.turn, board.round.hands]);
        while (board.phase === 'playing' && board.round && JSON.stringify([board.round.turn, board.round.hands]) === before) await wait(2);
        stats.timeouts += 1;
      }
      await new Promise((resolve) => { setImmediate(resolve); });
      continue;
    }
    if (board.phase === 'result' && board.game !== seenGame && !board.settling) {
      seenGame = board.game;
      const { result, round, players } = board;
      checkRound(board);
      // Kết quả: tổng thắng thua bằng 0, người nhất (trừ tới trắng) đã hết bài, mỗi người chơi đều có hạng.
      const nets = players.map((index) => result.nets[index]);
      assert.equal(nets.reduce((sum, value) => sum + value, 0), 0, `ván ${board.game}: tổng thắng thua = 0`);
      const winner = round.order[0];
      assert.equal(result.ranks[players[winner]], 1);
      if (!round.white) assert.equal(round.hands[winner].length, 0, 'người nhất đã hết bài');
      for (const index of players) assert.ok(result.ranks[index] >= 1 && result.ranks[index] <= players.length);
      // Tiền: API trừ / cộng đúng số hiện trên bảng kết quả.
      const settled = ctx.bank.settles.at(-1);
      assert.equal(settled.input.matchId, board.matchId);
      assert.equal(settled.input.bots, players.some((index) => board.seats[index].bot));
      for (const item of settled.results) {
        const index = board.seats.findIndex((seat) => seat?.accountId === item.accountId);
        assert.equal(result.nets[index], item.received - item.paid, 'bảng kết quả khớp số xu đã chốt');
      }
      stats.byMode[mode] += 1;
      if (round.white) stats.white += 1;
      stats.chopLines += result.lines.filter((line) => line.reason === 'chop').length;
      done += 1;
      deadline = Date.now() + 5_000;
      continue;
    }
    await wait(1);
  }
  ctx.table.stop();
  assert.deepEqual(ctx.leaks, [], 'không tin nào lộ bài');
  // Ví: tổng thay đổi của người thật = tổng xu thắng / thua với bot − phế (không có xu sinh ra / mất đi vô cớ).
  const delta = Object.keys(start).reduce((sum, key) => sum + ctx.wallet[key] - start[key], 0);
  const cuts = ctx.bank.settles.flatMap((item) => item.results).reduce((sum, item) => sum + item.cut, 0);
  if (!bots) assert.equal(delta, -cuts, 'bàn toàn người thật: chỉ mất phần phế');
  stats.games += done;
  return ctx;
}

test('100 ván liên tiếp (2–4 người, có / không bot, kiểu A và B): không lỗi thuật toán, không lộ bài, tiền luôn cân', async () => {
  const stats = { games: 0, moves: 0, cheats: 0, idle: 0, timeouts: 0, freeChops: 0, white: 0, chopLines: 0, byMode: { rank: 0, count: 0 } };
  await playMany({ seed: 11, humans: 4, bots: 0, mode: 'rank', stake: 100, games: 25, stats });
  await playMany({ seed: 23, humans: 3, bots: 0, mode: 'count', stake: 50, games: 25, stats });
  await playMany({ seed: 37, humans: 2, bots: 0, mode: 'rank', stake: 2_000, games: 15, stats });
  await playMany({ seed: 41, humans: 1, bots: 6, mode: 'count', stake: 20, games: 20, stats });
  await playMany({ seed: 53, humans: 2, bots: 6, mode: 'rank', stake: 200, games: 15, stats });
  assert.equal(stats.games, 100);
  assert.equal(stats.byMode.rank + stats.byMode.count, 100);
  assert.ok(stats.moves > 500, `đủ nhiều nước đi (${stats.moves})`);
  assert.ok(stats.cheats > 20, `đã thử gian lận nhiều lần (${stats.cheats})`);
  assert.ok(stats.timeouts > 5, `đã có lượt hết giờ đi hộ (${stats.timeouts})`);
  console.log(`  100 ván: ${stats.moves} nước của người, ${stats.cheats} lần thử gian lận, ${stats.timeouts} lượt hết giờ, ${stats.freeChops} lần 4 đôi thông chặt ngoài lượt, ${stats.chopLines} lần chặt, ${stats.white} lần tới trắng`);
});

test('chống gian lận ở bàn: sửa bài trong tin nhận được không đổi bài trên server; không chơi hộ bàn khác; xong ván không đánh được', async () => {
  const ctx = setup({ seed: 99, coins: { 'acc-an': 5_000, 'acc-binh': 5_000, 'acc-chi': 5_000, 'acc-dung': 5_000 }, rules: { ...FAST, turnMs: 5_000, resultMs: 5_000 } });
  const [an, binh, chi, dung] = ['an', 'binh', 'chi', 'dung'].map((id) => ctx.join(id));
  await ctx.table.open(an, { stake: 50, mode: 'rank' });
  await ctx.table.open(chi, { stake: 50, mode: 'rank' });
  const [first, second] = [...ctx.table.tables.values()];
  await ctx.table.join(binh, { tableId: first.id });
  await ctx.table.join(dung, { tableId: second.id });
  while (first.phase !== 'playing' || second.phase !== 'playing') await wait(2);
  // Sửa bài nhận được (như sửa biến trong F12): server không đổi.
  const view = ctx.sent.get('an').filter((message) => message.type === 'tienlen.table').at(-1);
  const real = [...first.round.hands[first.players.indexOf(view.seat)]];
  view.hand.length = 0;
  view.hand.push(48, 49, 50, 51);
  assert.deepEqual(first.round.hands[first.players.indexOf(view.seat)], real);
  // Người bàn 1 đánh vào bàn 2 (đúng mã bàn, đúng lá của người bàn 2): bị từ chối.
  const otherTurn = second.round.turn;
  const otherCard = second.round.hands[otherTurn][0];
  assert.equal(ctx.table.play(an, { tableId: second.id, cards: [otherCard] }).code, 'NOT_IN_GAME');
  assert.equal(ctx.table.pass(an, { tableId: second.id }).code, 'NOT_IN_GAME');
  // Đang ngồi bàn này không mở / vào bàn khác được (một người một bàn).
  assert.equal((await ctx.table.open(an, { stake: 20, mode: 'rank' })).code, 'BUSY');
  assert.equal((await ctx.table.join(an, { tableId: second.id })).code, 'BUSY');
  // Lá bắt buộc: người đi đầu không bỏ qua được.
  const leader = first.round.turn;
  const leaderSeat = first.seats[first.players[leader]];
  const leaderPerson = [an, binh].find((person) => person.accountId === leaderSeat.accountId);
  const notRequired = first.round.hands[leader].find((card) => card !== first.round.mustInclude);
  assert.equal(ctx.table.play(leaderPerson, { tableId: first.id, cards: [notRequired] }).code, 'MUST_INCLUDE');
  // Chơi hết ván bàn 1 bằng bot cho cả hai rồi thử đánh tiếp.
  while (first.phase === 'playing') {
    const turn = first.round.turn;
    const person = [an, binh].find((item) => item.accountId === first.seats[first.players[turn]].accountId);
    const cards = botChoice({ hand: first.round.hands[turn], top: first.round.top?.cards || null, mustInclude: first.round.mustInclude, random: () => 0.5 });
    const result = cards ? ctx.table.play(person, { tableId: first.id, cards }) : ctx.table.pass(person, { tableId: first.id });
    assert.ok(result.ok, result.code);
  }
  assert.equal(first.phase, 'result');
  assert.equal(ctx.table.play(an, { tableId: first.id, cards: [0] }).code, 'GAME_OVER');
  assert.equal(ctx.table.pass(binh, { tableId: first.id }).code, 'GAME_OVER');
  ctx.table.stop();
  assert.deepEqual(ctx.leaks, []);
});

test('tới trắng ngay lúc chia: ra thẳng kết quả, mỗi người vẫn chỉ thấy bài của mình, tiền đúng luật', async () => {
  // randomInt(n) = n − 1: Fisher–Yates không đổi chỗ lá nào → người đầu nhận 3 3 3 3 4 4 4 4 5 5 5 5 6 (6 đôi, tới trắng).
  const ctx = setup({ seed: 1, coins: { 'acc-an': 5_000, 'acc-binh': 5_000 }, rules: { ...FAST, resultMs: 5_000 }, randomInt: (n) => n - 1 });
  const [an, binh] = ['an', 'binh'].map((id) => ctx.join(id));
  await ctx.table.open(an, { stake: 50, mode: 'count' });
  const board = [...ctx.table.tables.values()][0];
  await ctx.table.join(binh, { tableId: board.id });
  while (board.phase !== 'result' || board.settling) await wait(2);
  const frames = (id) => ctx.sent.get(id).filter((message) => message.type === 'tienlen.table');
  assert.ok(!frames('an').some((message) => message.phase === 'playing'), 'không có lượt đánh nào');
  const view = frames('an').at(-1);
  assert.equal(view.result.white, 'six-pairs');
  // Hết ván lật bài: người tới trắng đủ 13 lá (6 đôi), người thua cũng 13 lá.
  assert.equal(view.result.hands[0].length, 13);
  assert.deepEqual(sorted(view.result.hands[0]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(view.result.hands[1].length, 13);
  assert.deepEqual(frames('binh').at(-1).result.hands, view.result.hands, 'ai trong bàn cũng thấy bài lật');
  assert.deepEqual(view.result.nets, [650, -650, null, null], 'kiểu B: người thua trả 13 phần');
  assert.equal(view.result.net, 650 - 32, 'phế 5% phần thắng');
  assert.equal(frames('binh').at(-1).hand.filter((card) => view.hand.includes(card)).length, 0);
  ctx.table.stop();
  assert.deepEqual(ctx.leaks, []);
});

test('bài chia bằng crypto.randomInt (không đoán trước được), bot chỉ được đọc bài của chính nó', () => {
  const table = new TienLenTable({ room: { id: 'tienlen-1', epoch: 1, participants: new Map() }, rules: TIENLEN_RULES.interaction });
  assert.equal(table.random, randomInt, 'mặc định dùng crypto.randomInt, không dùng Math.random');
  // botChoice chỉ nhận bài của bot + bộ trên bàn + số lá ít nhất của đối thủ (không có tham số nào chứa bài người khác).
  assert.deepEqual(botChoice.toString().match(/\{([^}]*)\}/)[1].split(',').map((item) => item.split('=')[0].trim()).filter(Boolean),
    ['hand', 'top', 'mustInclude', 'opponentMin', 'random']);
});

// ---- Qua WebSocket thật: đúng những gì trình duyệt (F12 → Network) nhận được ----
const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function connect(port, participantId, displayName, accountId) {
  const ticket = createJoinTicket({ participantId, roomId: 'tienlen-1', displayName, ...(accountId ? { accountId } : {}) }, SECRET);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?${new URLSearchParams({ ticket })}`);
  const frames = [];
  socket.on('message', (raw) => frames.push(JSON.parse(raw.toString('utf8'))));
  await once(socket, 'open');
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: 'tienlen-1', displayName }));
  const deadline = Date.now() + 2_000;
  while (!frames.some((frame) => frame.type === 'welcome')) {
    assert.ok(Date.now() < deadline, 'không vào được phòng');
    await wait(5);
  }
  let serial = 0;
  const send = (type, body = {}) => {
    serial += 1;
    const requestId = `${participantId}-${serial}`;
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, ...body }));
    return requestId;
  };
  return { socket, frames, send, latest: () => frames.filter((frame) => frame.type === 'tienlen.table').at(-1) };
}

async function until(check, ms = 5_000, label = 'điều kiện') {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`quá giờ chờ ${label}`);
    await wait(5);
  }
}

test('qua WebSocket: người chơi chỉ nhận bài của mình, người xem không nhận bài; tin gian lận / sai định dạng bị từ chối', async (t) => {
  const wallet = { 'a-an-00000001': 50_000, 'a-binh-0000001': 50_000 };
  const bank = fakeBank(wallet);
  const registry = new RoomRegistry({ nodeId: 'rt-tl', botCounts: { tienlen: 0 }, tienlen: bank });
  const server = createRealtimeServer({ registry, secret: SECRET });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const clients = [];
  t.after(async () => {
    for (const client of clients) if (client.socket.readyState === WebSocket.OPEN) client.socket.close();
    registry.rooms.get('tienlen-1')?.table?.stop();
    await new Promise((resolve) => { server.close(resolve); });
  });
  const an = await connect(port, 'u-an', 'An', 'a-an-00000001');
  const binh = await connect(port, 'u-binh', 'Bình', 'a-binh-0000001');
  const guest = await connect(port, 'u-khach', 'Khách');
  clients.push(an, binh, guest);
  const table = registry.rooms.get('tienlen-1').table;
  // Màn kết quả giữ lâu: trong lúc test chỉ có đúng một ván (không chia sang ván sau).
  table.rules = { ...table.rules, startMs: 30, fullStartMs: 20, resultMs: 30_000, turnMs: 3_000, afkTurnMs: 300 };

  // Khách (chưa đăng nhập) không chơi được.
  const guestFind = guest.send('tienlen.find');
  await until(() => guest.frames.some((frame) => frame.type === 'protocol.error' && frame.requestId === guestFind), 2_000, 'khách bị từ chối');
  assert.equal(guest.frames.find((frame) => frame.requestId === guestFind).code, 'FORBIDDEN');

  an.send('tienlen.open', { stake: 100, mode: 'count' });
  await until(() => an.latest(), 2_000, 'mở bàn');
  binh.send('tienlen.join', { tableId: an.latest().tableId });
  // Chia bài xong: thường là "playing"; có người tới trắng thì ra thẳng "result" (không có khung playing nào).
  const dealtPhase = (person) => ['playing', 'result'].includes(person.latest()?.phase);
  await until(() => dealtPhase(an) && dealtPhase(binh), 5_000, 'chia bài');
  const tableId = an.latest().tableId;
  // Bài được chia của mỗi người theo từng ván = bài trong khung đầu tiên của ván đó có bài (13 lá).
  const dealtOf = (person, game) => sorted(person.frames.find((frame) => frame.type === 'tienlen.table' && frame.game === game && frame.hand)?.hand || []);
  const dealt = { an: dealtOf(an, an.latest().game), binh: dealtOf(binh, binh.latest().game) };
  assert.equal(dealt.an.length, 13);
  assert.equal(dealt.binh.length, 13);
  assert.equal(dealt.an.filter((card) => dealt.binh.includes(card)).length, 0);

  // Tin sai định dạng / giả mạo: thêm trường ghế, lá ngoài bộ bài, lá trùng, đánh lá của người kia.
  const bad = [
    an.send('tienlen.play', { tableId, cards: [dealt.an[0]], seat: 1 }),
    an.send('tienlen.play', { tableId, cards: [52] }),
    an.send('tienlen.play', { tableId, cards: [dealt.an[0], dealt.an[0]] }),
  ];
  const stolen = an.send('tienlen.play', { tableId, cards: [dealt.binh[0]] });
  await until(() => [...bad, stolen].every((id) => an.frames.some((frame) => frame.type === 'protocol.error' && frame.requestId === id)), 2_000, 'từ chối tin xấu');
  for (const id of bad) assert.equal(an.frames.find((frame) => frame.requestId === id).code, 'INVALID_MESSAGE');
  // Ván tới trắng thì đã xong: GAME_OVER cũng là bị từ chối.
  assert.ok(['NOT_YOUR_CARDS', 'NOT_YOUR_TURN', 'GAME_OVER'].includes(an.frames.find((frame) => frame.requestId === stolen).code));

  // Chơi hết một ván qua WebSocket, mỗi người chỉ dùng bài trong tin mình nhận.
  const people = { an, binh };
  await until(() => {
    const view = an.latest();
    if (view.phase === 'result') return true;
    if (view.phase !== 'playing') return false;
    for (const person of Object.values(people)) {
      const mine = person.latest();
      if (mine.turn !== mine.seat || mine.phase !== 'playing' || person.pending === JSON.stringify([mine.turn, mine.hand, mine.top])) continue;
      person.pending = JSON.stringify([mine.turn, mine.hand, mine.top]);
      const cards = botChoice({ hand: mine.hand, top: mine.top?.cards || null, mustInclude: mine.mustInclude ?? null, random: () => 0.5 });
      if (cards) person.send('tienlen.play', { tableId, cards });
      else person.send('tienlen.pass', { tableId });
    }
    return false;
  }, 20_000, 'hết ván');

  const games = new Set(an.frames.filter((frame) => frame.type === 'tienlen.table' && frame.hand).map((frame) => frame.game));
  assert.deepEqual([...games], [an.latest().game], 'trong lúc test chỉ chia đúng một ván');

  // Đối chiếu mọi khung tin hai bên đã nhận (theo đúng ván của khung đó): lá của người kia chỉ xuất hiện khi chính họ
  // vừa đánh ra.
  for (const [name, person] of Object.entries(people)) {
    const otherName = name === 'an' ? 'binh' : 'an';
    const otherSeat = people[otherName].latest().seat;
    for (const frame of person.frames) {
      const text = JSON.stringify(frame);
      if (frame.type !== 'tienlen.table') {
        assert.ok(!/"(hand|top|mustInclude)"/.test(text), `${frame.type} không mang bài`);
        continue;
      }
      const own = new Set(dealtOf(person, frame.game));
      const other = new Set(dealtOf(people[otherName], frame.game));
      for (const card of frame.hand || []) assert.ok(own.has(card), `${name}: bài trên tay chỉ là của mình (ván ${frame.game}, ${frame.phase})`);
      for (const card of frame.hand || []) assert.ok(!other.has(card), `${name}: không thấy lá của người kia`);
      if (frame.mustInclude !== undefined) assert.ok(own.has(frame.mustInclude));
      for (const card of frame.top?.cards || []) if (other.has(card)) assert.equal(frame.top.seat, otherSeat, 'lá của người kia trên bàn là lá họ đã đánh');
      for (const card of frame.last?.cards || []) if (other.has(card)) assert.equal(frame.last.seat, otherSeat);
      // Phần lật bài chỉ có khi ván đã xong.
      if (frame.result) assert.equal(frame.phase, 'result', 'chỉ hết ván mới có kết quả / lật bài');
      if (frame.result?.hands) for (const card of frame.result.hands[otherSeat] || []) assert.ok(other.has(card), 'bài lật của người kia đúng là bài họ');
    }
  }
  // Người xem trong sảnh: chỉ có danh sách bàn, không có tin bàn nào, không có lá nào.
  assert.ok(guest.frames.some((frame) => frame.type === 'tienlen.lobby'));
  assert.ok(!guest.frames.some((frame) => frame.type === 'tienlen.table'));
  assert.ok(!guest.frames.some((frame) => /"(hand|top|mustInclude)"/.test(JSON.stringify(frame))));

  // Bấm dồn dập: quá 30 nước / 10 giây thì bị chặn.
  const flood = Array.from({ length: 40 }, () => an.send('tienlen.pass', { tableId }));
  await until(() => flood.every((id) => an.frames.some((frame) => frame.requestId === id)), 2_000, 'chặn bấm dồn');
  assert.ok(flood.some((id) => an.frames.find((frame) => frame.requestId === id).code === 'RATE_LIMITED'));
  assert.equal(bank.settles.length, 1, 'ván chốt đúng một lần');
});
