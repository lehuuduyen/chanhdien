import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { RPS_RULES } from '@chanh-dien/room-rules';
import { rpsOutcome, RpsTable } from '../rps.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Nhịp ngắn cho test; còn lại giống luật thật.
const RULES = {
  ...RPS_RULES.interaction, readyMs: 20, pickMs: 120, revealMs: 20, rematchMs: 300, botJoinMs: [40, 40], waitMs: 2_000,
  botTables: [0, 0], tickMs: 10,
};

function setup({ rules = RULES, coins = {}, random } = {}) {
  const sent = new Map();
  const room = {
    id: 'oantuti-1',
    epoch: 1,
    participants: new Map(),
    sendTo(id, message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ: ${JSON.stringify(message)}`);
      if (!sent.has(id)) sent.set(id, []);
      sent.get(id).push(message);
    },
    broadcast(message) {
      assert.equal(parseServerMessage(message).ok, true, `${message.type} hợp lệ`);
      this.lastLobby = message;
    },
  };
  const wallet = { ...coins };
  const stakes = [];
  const settles = [];
  const bank = {
    async stake({ accountId, matchId, amount }) {
      if ((wallet[accountId] ?? 1_000) < amount) return { ok: false, code: 'INSUFFICIENT_COINS' };
      wallet[accountId] = (wallet[accountId] ?? 1_000) - amount;
      stakes.push({ accountId, matchId, amount });
      return { ok: true, coins: wallet[accountId] };
    },
    async settle(input) {
      settles.push(input);
      const mine = stakes.filter((item) => item.matchId === input.matchId);
      return {
        ok: true,
        results: mine.map(({ accountId, amount }) => {
          const payout = input.winner === null ? amount : input.winner === accountId ? 2 * amount - Math.floor(amount / 10) : 0;
          wallet[accountId] += payout;
          return { accountId, staked: amount, payout, net: payout - amount, coins: wallet[accountId] };
        }),
      };
    },
  };
  const table = new RpsTable({ room, rules, ...bank, ...(random ? { random } : {}) });
  const join = (id, extra = {}) => {
    const participant = { id, displayName: id.toUpperCase(), connected: true, ...extra };
    room.participants.set(id, participant);
    return participant;
  };
  table.start();
  return { table, room, sent, stakes, settles, wallet, join, last: (id) => sent.get(id)?.at(-1) };
}

async function until(check, ms = 2_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('quá giờ chờ');
    await wait(5);
  }
}

test('kéo búa bao: búa thắng kéo, kéo thắng bao, bao thắng búa', () => {
  assert.equal(rpsOutcome('rock', 'scissors'), 'a');
  assert.equal(rpsOutcome('scissors', 'paper'), 'a');
  assert.equal(rpsOutcome('paper', 'rock'), 'a');
  assert.equal(rpsOutcome('scissors', 'rock'), 'b');
  assert.equal(rpsOutcome('paper', 'paper'), 'draw');
});

test('hai người: mở bàn → tìm trận ghép đúng bàn, tay giữ kín tới khi lật, người thắng được chốt', async () => {
  const { table, sent, stakes, settles, join, last, room } = setup();
  const a = join('a', { accountId: 'acc-a' });
  const b = join('b', { accountId: 'acc-b' });
  assert.deepEqual(await table.open(a, { requestId: 'r1', stake: 50 }), { ok: true });
  assert.equal(last('a').phase, 'waiting');
  table.broadcastState();
  assert.equal(room.lastLobby.tables.length, 1);
  assert.deepEqual(await table.find(b, { requestId: 'r2', stake: 50 }), { ok: true });
  assert.deepEqual(stakes.map((item) => item.accountId), ['acc-a', 'acc-b']);
  assert.equal(stakes[0].matchId, stakes[1].matchId, 'cùng một trận');
  await until(() => last('a').phase === 'pick');
  const matchId = last('a').matchId;
  assert.equal(table.pick(a, { matchId, choice: 'rock' }).ok, true);
  assert.equal(table.pick(a, { matchId, choice: 'paper' }).code, 'ALREADY_PICKED');
  // B chỉ biết A đã chọn, không biết chọn gì.
  const seenByB = JSON.stringify(sent.get('b'));
  assert.equal(last('b').picked.opponent, true);
  assert.equal(seenByB.includes('rock'), false, 'tay của A không lộ cho B trước khi lật');
  assert.equal(table.pick(b, { matchId, choice: 'scissors' }).ok, true);
  assert.equal(last('b').phase, 'reveal');
  assert.deepEqual(last('b').last, { mine: 'scissors', opponent: 'rock', result: 'lose' });
  await until(() => last('a').phase === 'done');
  assert.deepEqual(settles, [{ matchId, winner: 'acc-a', bot: false }]);
  assert.equal(last('a').result, 'win');
  assert.equal(last('a').net, 45);
  assert.equal(last('b').result, 'lose');
  assert.equal(last('b').net, -50);
  table.broadcastState();
  assert.deepEqual(room.lastLobby.feed[0], { a: 'A', b: 'B', stake: 50, winner: 'a' });
  table.stop();
});

test('không chọn kịp thì thua lượt; cả hai không chọn thì hủy trận, hoàn cọc', async () => {
  const { table, settles, join, last } = setup();
  const a = join('a', { accountId: 'acc-a' });
  const b = join('b', { accountId: 'acc-b' });
  await table.open(a, { requestId: 'r1', stake: 10 });
  await table.join(b, { requestId: 'r2', tableId: last('a').matchId });
  await until(() => last('a').phase === 'pick');
  table.pick(b, { matchId: last('a').matchId, choice: 'paper' });
  await until(() => last('a').phase === 'done');
  assert.equal(settles[0].winner, 'acc-b');
  assert.deepEqual(last('a').last, { mine: null, opponent: 'paper', result: 'lose' });

  const c = join('c', { accountId: 'acc-c' });
  const d = join('d', { accountId: 'acc-d' });
  await table.open(c, { requestId: 'r3', stake: 10 });
  await table.join(d, { requestId: 'r4', tableId: last('c').matchId });
  await until(() => last('c').phase === 'done');
  assert.equal(settles[1].winner, null);
  assert.equal(last('c').result, 'void');
  assert.equal(last('c').net, 0);
  table.stop();
});

test('hòa 3 lượt liền thì hoàn cọc', async () => {
  const { table, settles, join, last } = setup();
  const a = join('a', { accountId: 'acc-a' });
  const b = join('b', { accountId: 'acc-b' });
  await table.open(a, { requestId: 'r1', stake: 20 });
  await table.join(b, { requestId: 'r2', tableId: last('a').matchId });
  for (let round = 1; round <= 3; round += 1) {
    await until(() => last('a').phase === 'pick' && last('a').round === round);
    table.pick(a, { matchId: last('a').matchId, choice: 'paper' });
    table.pick(b, { matchId: last('a').matchId, choice: 'paper' });
  }
  await until(() => last('a').phase === 'done');
  assert.equal(settles[0].winner, null);
  assert.equal(last('a').result, 'draw');
  table.stop();
});

test('không ai nhận bàn thì bot vào đấu; bot rút tay lúc mở lượt, trước khi người chọn', async () => {
  // random luôn trả 0: bot rút "rock" (RPS_CHOICES[0]) ngay khi mở lượt.
  const { table, settles, join, last } = setup({ random: () => 0 });
  join('bot-1', { bot: true, skin: 'woman' });
  const a = join('a', { accountId: 'acc-a' });
  await table.open(a, { requestId: 'r1', stake: 100 });
  await until(() => last('a').phase === 'pick');
  assert.equal(last('a').opponent.displayName, 'BOT-1');
  assert.equal(JSON.stringify(last('a')).includes('"bot"'), false, 'người chơi không thấy cờ bot trong trận');
  assert.equal(table.hasBotBet('bot-1'), true, 'bot đang đấu không rời phòng');
  table.pick(a, { matchId: last('a').matchId, choice: 'paper' });
  await until(() => last('a').phase === 'done');
  assert.deepEqual(settles[0], { matchId: last('a').matchId, winner: 'acc-a', bot: true });
  assert.equal(last('a').result, 'win');
  table.stop();
});

test('thiếu xu không mở được bàn; rời bàn đang chờ thì hoàn cọc; đang đấu thì không rời được', async () => {
  const { table, settles, join, last, room } = setup({ coins: { 'acc-a': 5 } });
  const a = join('a', { accountId: 'acc-a' });
  assert.equal((await table.open(a, { requestId: 'r1', stake: 10 })).code, 'INSUFFICIENT_COINS');
  table.broadcastState();
  assert.equal(room.lastLobby.tables.length, 0);
  const guest = join('g');
  assert.equal((await table.open(guest, { requestId: 'r2', stake: 10 })).code, 'SIGN_IN_REQUIRED');

  const b = join('b', { accountId: 'acc-b' });
  await table.open(b, { requestId: 'r3', stake: 10 });
  assert.equal((await table.open(b, { requestId: 'r4', stake: 10 })).code, 'BUSY');
  assert.equal(table.leave(b).ok, true);
  await until(() => last('b').phase === 'closed');
  assert.equal(settles.at(-1).winner, null);

  const c = join('c', { accountId: 'acc-c' });
  const d = join('d', { accountId: 'acc-d' });
  await table.open(c, { requestId: 'r5', stake: 10 });
  await table.join(d, { requestId: 'r6', tableId: last('c').matchId });
  assert.equal(table.leave(c).code, 'IN_MATCH');
  table.stop();
});

test('người mở bàn rớt mạng: bàn đóng, hoàn cọc', async () => {
  const { table, settles, join, last } = setup();
  const a = join('a', { accountId: 'acc-a' });
  await table.open(a, { requestId: 'r1', stake: 50 });
  a.connected = false;
  table.participantAway('a');
  await until(() => last('a').phase === 'closed');
  assert.deepEqual(settles[0], { matchId: last('a').matchId, winner: null, bot: false });
  table.stop();
});

test('đấu lại: cả hai đồng ý thì trận mới trừ cọc lại', async () => {
  const { table, stakes, join, last } = setup();
  const a = join('a', { accountId: 'acc-a' });
  const b = join('b', { accountId: 'acc-b' });
  await table.open(a, { requestId: 'r1', stake: 20 });
  await table.join(b, { requestId: 'r2', tableId: last('a').matchId });
  await until(() => last('a').phase === 'pick');
  const first = last('a').matchId;
  table.pick(a, { matchId: first, choice: 'rock' });
  table.pick(b, { matchId: first, choice: 'paper' });
  await until(() => last('a').phase === 'done');
  table.rematch(a, { matchId: first });
  assert.deepEqual(last('b').rematch, { me: false, opponent: true });
  table.rematch(b, { matchId: first });
  await until(() => last('a').phase === 'ready' && last('a').matchId !== first);
  assert.equal(stakes.length, 4);
  table.stop();
});

test('sảnh: bot mở bàn rồi đấu với nhau (không gọi API, không ghi snapshot), người vào bàn bot thì đấu với bot', async () => {
  const rules = { ...RULES, botTables: [1, 2], botTableMs: [30, 30], botMatchMs: [30, 30], botTableEveryMs: [10, 10] };
  const { table, room, stakes, settles, join, last } = setup({ rules });
  for (const id of ['bot-1', 'bot-2', 'bot-3', 'bot-4']) join(id, { bot: true });
  await until(() => table.feed.length >= 2, 3_000);
  assert.equal(stakes.length + settles.length, 0, 'trận bot với bot không đụng tới xu');
  assert.equal(table.revision, 0, 'bàn không làm máy realtime ghi snapshot');
  for (const item of table.feed) assert.ok(item.a.startsWith('BOT-') && item.b.startsWith('BOT-'));
  // Người vào một bàn bot đang chờ.
  const a = join('a', { accountId: 'acc-a' });
  await until(() => [...table.matches.values()].some((match) => match.botHosted && match.phase === 'waiting'));
  table.broadcastState();
  const tableId = room.lastLobby.tables[0].id;
  assert.deepEqual(await table.join(a, { requestId: 'r1', tableId }), { ok: true });
  await until(() => last('a').phase === 'pick');
  table.pick(a, { matchId: tableId, choice: 'rock' });
  await until(() => last('a').phase === 'done');
  assert.equal(settles.at(-1).bot, true);
  table.stop();
});
