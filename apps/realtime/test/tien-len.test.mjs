import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { TIENLEN_RULES } from '@chanh-dien/room-rules';
import { botChoice, capTransfers, TIENLEN_HOUSE_CUT_PERCENT, TIENLEN_MIN_COINS_UNITS, TIENLEN_MODES, TIENLEN_STAKES, tienLenMinCoins } from '@chanh-dien/tien-len';
import { TienLenTable } from '../tien-len.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Nhịp ngắn cho test; còn lại giống luật thật. Mặc định không có bot (bật riêng từng test).
const RULES = {
  ...TIENLEN_RULES.interaction, startMs: 40, fullStartMs: 15, turnMs: 400, afkTurnMs: 30, resultMs: 60, botActMs: [3, 8], tickMs: 5,
  botFill: { always: false, players: [2, 4], firstDelayMs: [10, 20], delayMs: [10, 20] }, botTables: [0, 0], botTableMs: [80, 80],
};

function seeded(seed = 42) {
  let value = seed;
  return (n) => {
    value = (value * 1103515245 + 12345) % 2 ** 31;
    return Math.floor((value / 2 ** 31) * n);
  };
}

function setup({ rules = RULES, coins = {}, seed = 42, bots = 0 } = {}) {
  const sent = new Map();
  const room = {
    id: 'tienlen-1',
    epoch: 1,
    participants: new Map(),
    sendTo(id, message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ: ${JSON.stringify(message)}`);
      if (!sent.has(id)) sent.set(id, []);
      sent.get(id).push(message);
    },
    broadcast(message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ: ${JSON.stringify(message)}`);
      this.lastLobby = message;
    },
  };
  const wallet = { ...coins };
  const balance = (accountId) => wallet[accountId] ?? 100_000;
  const begins = [];
  const settles = [];
  const bank = {
    async check({ accountId, stake }) {
      const need = tienLenMinCoins(stake);
      return balance(accountId) >= need ? { ok: true, coins: balance(accountId), need } : { ok: false, code: 'INSUFFICIENT_COINS', coins: balance(accountId), need };
    },
    async begin({ accountId, matchId, stake }) {
      if (balance(accountId) < tienLenMinCoins(stake)) return { ok: false, code: 'INSUFFICIENT_COINS' };
      begins.push({ accountId, matchId });
      return { ok: true, coins: balance(accountId) };
    },
    async settle(input) {
      settles.push(input);
      const players = begins.filter((item) => item.matchId === input.matchId).map((item) => item.accountId);
      const paid = capTransfers(input.transfers, (from) => (from === null ? undefined : balance(from)));
      return {
        ok: true,
        results: players.map((accountId) => {
          const out = paid.filter((item) => item.from === accountId).reduce((sum, item) => sum + item.coins, 0);
          const received = paid.filter((item) => item.to === accountId).reduce((sum, item) => sum + item.coins, 0);
          const cut = received > out ? Math.floor(((received - out) * TIENLEN_HOUSE_CUT_PERCENT) / 100) : 0;
          wallet[accountId] = balance(accountId) + received - out - cut;
          return { accountId, paid: out, received, net: received - out - cut, cut, coins: wallet[accountId] };
        }),
      };
    },
  };
  const table = new TienLenTable({ room, rules, ...bank, random: seeded(seed) });
  const join = (id, extra = {}) => {
    const participant = { id, accountId: `acc-${id}`, displayName: id.toUpperCase(), connected: true, ...extra };
    room.participants.set(id, participant);
    return participant;
  };
  for (let index = 0; index < bots; index += 1) {
    room.participants.set(`bot-${index}`, { id: `bot-${index}`, displayName: `Bot ${index}`, connected: true, bot: true });
  }
  table.start();
  return { table, room, sent, begins, settles, wallet, join, last: (id) => sent.get(id)?.at(-1) };
}

async function until(check, ms = 3_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('quá giờ chờ');
    await wait(3);
  }
}

// Người chơi (test) tự đánh bằng chính bài trên tay mình, theo bot.
function autoPlay(table, participant) {
  const found = table.seatOf(participant);
  if (!found || found.table.phase !== 'playing') return;
  const { table: board, index } = found;
  const { round } = board;
  const me = board.players.indexOf(index);
  if (round.turn !== me) return;
  const cards = botChoice({ hand: round.hands[me], top: round.top?.cards || null, mustInclude: round.mustInclude, random: () => 0.5 });
  const result = cards ? table.play(participant, { tableId: board.id, cards }) : table.pass(participant, { tableId: board.id });
  assert.ok(result.ok, `${result.code} ${cards}`);
}

test('luật phòng khớp hằng số của bộ luật (mức cược, kiểu, số xu tối thiểu, phế)', () => {
  const rules = TIENLEN_RULES.interaction;
  assert.deepEqual(rules.stakes, [...TIENLEN_STAKES]);
  assert.deepEqual(rules.modes, [...TIENLEN_MODES]);
  assert.equal(rules.minCoinsUnits, TIENLEN_MIN_COINS_UNITS);
  assert.equal(rules.houseCutPercent, TIENLEN_HOUSE_CUT_PERCENT);
  assert.equal(rules.botFill.always, true, 'mọi ván luôn có bot');
  assert.deepEqual(rules.botFill.players, [2, 4], 'mỗi ván chọn ngẫu nhiên 2–4 người');
});

test('mỗi ván chọn lại ngẫu nhiên mục tiêu 2, 3 hoặc 4 người', () => {
  let roll = -1;
  const room = { id: 'tienlen-1', epoch: 1, participants: new Map() };
  const table = new TienLenTable({ room, rules: TIENLEN_RULES.interaction, random: (size) => (roll += 1) % size });
  const board = table.createTable(20, 'rank');
  const targets = [board.targetPlayers];
  table.resetPlayerTarget(board);
  targets.push(board.targetPlayers);
  table.resetPlayerTarget(board);
  targets.push(board.targetPlayers);
  assert.deepEqual(targets, [2, 3, 4]);
});

test('bàn thật chia đúng 2, 3 hoặc 4 người theo mục tiêu và mỗi bàn đều có bot', async () => {
  for (const target of [2, 3, 4]) {
    const botFill = { always: true, players: [target, target], firstDelayMs: [1, 1], delayMs: [1, 1] };
    const { table, join } = setup({ bots: 6, rules: { ...RULES, botFill, startMs: 20, fullStartMs: 5 } });
    const person = join(`nguoi-${target}`);
    await table.open(person, { stake: 50, mode: 'rank' });
    const board = [...table.tables.values()][0];
    await until(() => board.phase === 'playing' || board.phase === 'result');
    assert.equal(board.players.length, target, `ván ${target} người`);
    assert.ok(board.players.some((seatIndex) => board.seats[seatIndex]?.bot), `ván ${target} người có bot`);
    table.stop();
  }
});

test('mở bàn, người thứ hai vào là đếm ngược; chia bài: mỗi người chỉ nhận bài của mình; không trừ xu đầu ván', async () => {
  const { table, join, last, begins, wallet, room } = setup({ coins: { 'acc-an': 5_000, 'acc-binh': 5_000 } });
  const an = join('an');
  const binh = join('binh');
  assert.equal((await table.open(join('guest', { accountId: undefined }), { stake: 50, mode: 'rank' })).code, 'SIGN_IN_REQUIRED');
  assert.equal((await table.open(an, { stake: 30, mode: 'rank' })).code, 'INVALID');
  assert.ok((await table.open(an, { stake: 50, mode: 'rank' })).ok);
  assert.equal((await table.open(an, { stake: 50, mode: 'rank' })).code, 'BUSY', 'mỗi người một bàn');
  assert.equal(last('an').phase, 'waiting');
  assert.equal(last('an').minCoins, 500, 'cần 10 lần mức cược');
  const tableId = last('an').tableId;
  assert.ok((await table.join(binh, { tableId })).ok);
  await until(() => last('an').phase === 'starting');
  await until(() => last('an').phase === 'playing');
  assert.equal(begins.length, 2, 'ghi cả hai vào ván');
  assert.deepEqual([wallet['acc-an'], wallet['acc-binh']], [5_000, 5_000], 'không giữ cọc');
  const mine = last('an');
  const theirs = last('binh');
  assert.equal(mine.hand.length, 13);
  assert.equal(theirs.hand.length, 13);
  assert.equal(mine.hand.filter((card) => theirs.hand.includes(card)).length, 0);
  assert.equal(mine.players[1].cards, 13, 'chỉ thấy số lá của người khác');
  assert.ok(!JSON.stringify(mine.players).includes('hand'));
  // Ván đầu: người cầm lá nhỏ nhất đi trước và phải đánh kèm lá đó.
  const low = Math.min(...mine.hand, ...theirs.hand);
  const leader = mine.hand.includes(low) ? an : binh;
  const view = leader === an ? mine : theirs;
  assert.equal(view.lead, true);
  assert.equal(view.mustInclude, low);
  const other = leader === an ? binh : an;
  assert.equal(table.pass(other, { tableId }).code, 'NOT_YOUR_TURN');
  const notLow = view.hand.find((card) => card !== low);
  assert.equal(table.play(leader, { tableId, cards: [notLow] }).code, 'MUST_INCLUDE');
  assert.equal(table.pass(leader, { tableId }).code, 'MUST_LEAD');
  assert.ok(table.play(leader, { tableId, cards: [low] }).ok);
  assert.deepEqual(last(other === an ? 'an' : 'binh').top, { seat: leader === an ? 0 : 1, cards: [low] });
  await until(() => room.lastLobby?.tables.some((item) => item.id === tableId && item.phase === 'playing'));
  assert.deepEqual(room.lastLobby.tables[0].players.map((item) => item.displayName), ['AN', 'BINH']);
  table.stop();
});

test('không đủ 10 lần mức cược: không vào được bàn; xu tụt dưới mức lúc sang ván mới thì đứng dậy', async () => {
  const { table, join, last, sent, wallet } = setup({ coins: { 'acc-an': 5_000, 'acc-binh': 499 } });
  const an = join('an');
  const binh = join('binh');
  await table.open(an, { stake: 50, mode: 'rank' });
  const { tableId } = last('an');
  const refused = await table.join(binh, { tableId });
  assert.equal(refused.code, 'INSUFFICIENT_COINS');
  assert.match(refused.message, /500 xu/);
  assert.equal((await table.open(binh, { stake: 20, mode: 'rank' })).ok, true, 'bàn 20 xu (cần 200) thì vào được');
  assert.equal((await table.find(join('chi', { accountId: 'acc-chi' }), { stake: 2_000 })).ok, true, 'chi có 100.000 xu: mở được bàn 2.000');
  // Bình đang ngồi bàn 20 xu; một người khác vào, rồi Bình tụt dưới 200 xu trước lúc chia bài → đứng dậy.
  const dung = join('dung');
  await table.join(dung, { tableId: last('binh').tableId });
  wallet['acc-binh'] = 150;
  await until(() => sent.get('binh').some((message) => message.type === 'protocol.error' && message.code === 'INSUFFICIENT_COINS'));
  await until(() => last('binh').phase === 'closed');
  await until(() => last('dung').phase === 'waiting' && last('dung').players.filter(Boolean).length === 1);
  assert.equal(last('an').players.filter(Boolean).length, 1);
  table.stop();
});

test('đánh trọn ván với người thật: hết ván chốt tiền (tổng bằng 0), hiện kết quả rồi tự sang ván mới', async () => {
  const { table, join, last, settles, wallet } = setup({ rules: { ...RULES, turnMs: 2_000 }, coins: { 'acc-an': 3_000, 'acc-binh': 3_000, 'acc-chi': 3_000 } });
  const players = ['an', 'binh', 'chi'].map((id) => join(id));
  await table.open(players[0], { stake: 20, mode: 'count' });
  const { tableId } = last('an');
  await table.join(players[1], { tableId });
  await table.join(players[2], { tableId });
  await until(() => last('an').phase === 'playing');
  const start = { ...wallet };
  await until(() => {
    for (const participant of players) autoPlay(table, participant);
    return last('an').phase === 'result';
  }, 5_000);
  const { result } = last('an');
  assert.equal(result.nets.filter((value) => value !== null).reduce((sum, value) => sum + value, 0), 0);
  assert.ok(result.ranks.includes(1));
  await until(() => settles.length === 1 && last('an').result?.net !== undefined);
  const mine = last('an').result;
  assert.equal(mine.after - mine.before, mine.net, 'số dư trước / sau khớp số xu thắng thua');
  // Hết ván lật bài còn lại của mọi người: người nhất hết bài, người khác đúng số lá còn lại.
  const view = last('an');
  const winnerSeat = view.result.ranks.indexOf(1);
  assert.deepEqual(view.result.hands[winnerSeat], []);
  view.players.forEach((player, seat) => { if (player) assert.equal(view.result.hands[seat].length, player.cards); });
  assert.equal(new Set(view.result.hands.flat()).size, view.result.hands.flat().length);
  assert.equal(settles[0].bots, false);
  assert.ok(settles[0].transfers.every((item) => item.from && item.to), 'ván không có bot: mọi khoản giữa người thật');
  const winner = ['acc-an', 'acc-binh', 'acc-chi'].find((id) => wallet[id] > start[id]);
  assert.ok(winner, 'người thắng được cộng xu');
  const total = ['acc-an', 'acc-binh', 'acc-chi'].reduce((sum, id) => sum + wallet[id] - start[id], 0);
  assert.ok(total <= 0 && total > -200, 'tổng thay đổi chỉ là phế');
  await until(() => ['starting', 'playing'].includes(last('an').phase) && last('an').game === 2, 3_000);
  table.stop();
});

test('hết xu: màn kết quả biết số dư không đủ; hết đếm ngược báo rõ còn bao nhiêu, thiếu bao nhiêu rồi mới đưa ra (không chờ ván sau)', async () => {
  const rules = { ...RULES, turnMs: 2_000, resultMs: 80 };
  const { table, join, last, sent, wallet, settles } = setup({ rules, coins: { 'acc-an': 520, 'acc-binh': 520 } });
  const an = join('an');
  const binh = join('binh');
  await table.open(an, { stake: 50, mode: 'rank' });
  await table.join(binh, { tableId: last('an').tableId });
  await until(() => last('an').phase === 'playing', 6_000);
  await until(() => {
    autoPlay(table, an);
    autoPlay(table, binh);
    return last('an').phase === 'result';
  }, 5_000);
  await until(() => settles.length === 1 && last('an').result?.after !== undefined && last('binh').result?.after !== undefined);
  const [loser, winner] = wallet['acc-an'] < 500 ? ['an', 'binh'] : ['binh', 'an'];
  assert.ok(wallet[`acc-${loser}`] < 500 && wallet[`acc-${winner}`] >= 500, 'một người thua tụt dưới 500 xu');
  const view = last(loser);
  assert.ok(view.result.after < view.minCoins, 'màn kết quả có số dư sau ván < số xu tối thiểu');
  const resultAt = sent.get(loser).length;
  await until(() => last(loser).phase === 'closed', 2_000);
  const after = sent.get(loser).slice(resultAt);
  const error = after.findIndex((message) => message.type === 'protocol.error' && message.code === 'INSUFFICIENT_COINS');
  const closed = after.findIndex((message) => message.phase === 'closed');
  assert.ok(error >= 0 && error < closed, 'báo không đủ xu trước rồi mới đưa ra');
  assert.match(after[error].message, new RegExp(`còn ${wallet[`acc-${loser}`]} xu, không đủ 500 xu`));
  assert.ok(!after.slice(0, closed).some((message) => ['waiting', 'starting', 'playing'].includes(message.phase)), 'không phải ngồi qua ván sau');
  assert.equal(last(winner).phase, 'waiting', 'người còn đủ xu ở lại bàn');
  table.stop();
});

test('bot vào tới mục tiêu ngẫu nhiên 2–4 người, luôn có cả ở bàn mức cao; hết giờ thì tự đánh', async () => {
  const botFill = { ...RULES.botFill, always: true };
  const { table, join, last, settles, sent } = setup({ bots: 6, rules: { ...RULES, botFill, idleKickMissed: 2 } });
  const an = join('an');
  await table.open(an, { stake: 50, mode: 'rank' });
  const board = [...table.tables.values()][0];
  await until(() => last('an').players.filter(Boolean).length === board.targetPlayers);
  assert.ok(board.targetPlayers >= 2 && board.targetPlayers <= 4);
  assert.ok(board.seats.some((seat) => seat?.bot), 'bàn luôn có ít nhất một bot');
  // Người thật không bấm gì: hết giờ thì hệ thống đánh hộ (gắn cờ auto); ván vẫn xong.
  await until(() => last('an').phase === 'result', 8_000);
  assert.ok(last('an').players[0].missed >= 2, 'đã lỡ nhiều lượt');
  assert.ok(sent.get('an').some((message) => message.last?.seat === 0 && message.last.auto === true), 'nước đánh hộ có cờ auto');
  // Lỡ quá idleKickMissed lượt liên tiếp: hết ván phải đứng dậy.
  await until(() => sent.get('an').some((message) => message.code === 'IDLE_KICKED') && last('an').phase === 'closed', 3_000);
  await until(() => settles.length === 1);
  assert.equal(settles[0].bots, true);
  assert.ok(settles[0].transfers.every((item) => item.from === 'acc-an' || item.to === 'acc-an'), 'chỉ gửi khoản có người thật');
  table.stop();

  const rich = setup({ bots: 6, rules: { ...RULES, botFill } });
  const binh = rich.join('binh');
  await rich.table.open(binh, { stake: 1_000, mode: 'rank' });
  const richBoard = [...rich.table.tables.values()][0];
  await until(() => rich.last('binh').players.filter(Boolean).length === richBoard.targetPlayers);
  assert.ok(rich.last('binh').players.filter(Boolean).length >= 2, 'bàn 1.000 xu cũng có bot');
  assert.ok(richBoard.seats.some((seat) => seat?.bot));
  rich.table.stop();
});

test('bot vào như người thật: chờ firstDelayMs, bots:false cũ bị bỏ qua, tin trình duyệt không có cờ bot', async () => {
  const rules = { ...RULES, startMs: 5_000, fullStartMs: 5_000,
    botFill: { always: true, players: [2, 4], firstDelayMs: [150, 150], delayMs: [10, 10] } };
  const { table, join, last, room } = setup({ bots: 4, rules });
  const an = join('an');
  await table.open(an, { stake: 20, mode: 'rank', bots: false });
  await wait(80);
  assert.equal(last('an').players.filter(Boolean).length, 1, 'chưa tới firstDelayMs: chưa có bot');
  const board = [...table.tables.values()][0];
  await until(() => last('an').players.filter(Boolean).length === board.targetPlayers, 2_000);
  assert.equal('bots' in last('an'), false, 'tin bàn không có cờ bot');
  assert.ok(!/"bot/.test(JSON.stringify(last('an'))), 'ghế bot trông như người thật');
  await until(() => room.lastLobby?.tables.some((item) => item.players.length === board.targetPlayers));
  assert.ok(!/"bot/.test(JSON.stringify(room.lastLobby)), 'sảnh không có cờ bot');
  // Trước khi chia bài vẫn rời bàn ngay được.
  assert.equal(last('an').phase, 'starting');
  assert.ok(table.leave(an).ok);
  assert.equal(last('an').phase, 'closed');
  table.stop();
});

test('hết giờ lần đầu: hệ thống đánh hộ, lượt sau vẫn đủ giờ; lỡ 2 lượt liền mới tự đánh (lượt ngắn); "Tôi đã quay lại" thì đủ giờ lại', async () => {
  const rules = { ...RULES, turnMs: 150, afkTurnMs: 20 };
  const { table, join, last } = setup({ rules, coins: { 'acc-an': 5_000, 'acc-binh': 5_000 } });
  const an = join('an');
  const binh = join('binh');
  await table.open(an, { stake: 20, mode: 'rank' });
  const { tableId } = last('an');
  await table.join(binh, { tableId });
  await until(() => last('an').phase === 'playing');
  const board = table.tables.get(tableId);
  const seatOf = (person) => board.seats.findIndex((seat) => seat?.accountId === person.accountId);
  const myTurn = (person) => board.phase === 'playing' && board.players[board.round.turn] === seatOf(person);
  // An không bấm gì, Bình luôn tự đánh: theo dõi thời gian lượt của An.
  const turns = [];
  while (turns.length < 3 && board.phase === 'playing') {
    if (myTurn(binh)) autoPlay(table, binh);
    else if (myTurn(an) && board.deadline !== turns.at(-1)?.deadline) turns.push({ deadline: board.deadline, length: board.deadline - Date.now(), missed: board.seats[seatOf(an)].missed });
    await wait(2);
  }
  assert.ok(turns.length === 3, 'An tới lượt 3 lần');
  assert.ok(turns[0].length > 100 && turns[1].length > 100, `lượt đầu và lượt sau lần đánh hộ đầu vẫn đủ giờ: ${turns.map((item) => item.length)}`);
  assert.equal(turns[1].missed, 1);
  assert.ok(turns[2].length <= 25 && turns[2].missed === 2, 'lỡ 2 lượt liền: tự đánh, lượt ngắn');
  assert.equal(last('an').players[seatOf(an)].missed, 2);
  // Bấm "Tôi đã quay lại" ngay trong lượt ngắn: thôi tự đánh, được đủ giờ.
  assert.ok(table.back(an, { tableId }).ok);
  assert.equal(last('an').players[seatOf(an)].missed, undefined);
  if (myTurn(an)) assert.ok(board.deadline - Date.now() > 100, 'đang tới lượt: được đủ giờ lại');
  assert.equal(table.back(binh, { tableId: 'tl-khong-co-1-1-1-abcd' }).code, 'NOT_IN_GAME');
  table.stop();
});

test('rời bàn giữa ván thì rời sau ván; rút máy thì bỏ ván dở, không trừ xu ai', async () => {
  const { table, join, last, settles, wallet } = setup({ bots: 3, coins: { 'acc-an': 1_000 }, rules: { ...RULES, turnMs: 5_000 } });
  const an = join('an');
  await table.open(an, { stake: 20, mode: 'rank' });
  await until(() => last('an').phase === 'playing');
  assert.ok(table.leave(an).ok);
  assert.equal(last('an').players[0].leaving, true);
  await table.quiesce(1_000);
  assert.equal(settles.length, 0, 'ván dở không chốt');
  assert.equal(wallet['acc-an'], 1_000);
  assert.equal(last('an').phase, 'closed');
  assert.equal(table.tables.size, 0);
});

test('bàn bot ngồi sẵn trong sảnh để vào nhanh; vào nhanh ưu tiên bàn đang có người', async () => {
  const { table, join, last, room } = setup({ bots: 8, rules: { ...RULES, botTables: [1, 1], botTableMs: [5_000, 5_000] } });
  await until(() => room.lastLobby?.tables.length === 1);
  const botTable = room.lastLobby.tables[0];
  assert.ok(botTable.players.length >= 1 && botTable.players.length <= 3);
  const an = join('an');
  assert.ok((await table.find(an, {})).ok);
  assert.equal(last('an').tableId, botTable.id, 'vào nhanh: vào bàn bot đang chờ');
  const binh = join('binh');
  assert.ok((await table.find(binh, { stake: 2_000 })).ok, 'không có bàn 2.000: mở bàn mới');
  assert.notEqual(last('binh').tableId, botTable.id);
  assert.equal(last('binh').stake, 2_000);
  table.stop();
});
