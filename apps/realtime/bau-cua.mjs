// Bàn Bầu Cua chơi chung (phòng game). Máy realtime giữ nhịp ván và lắc xúc xắc; tiền do API giữ:
//   đặt cược (betting) → lắc (rolling) → kết quả (result) → ván mới …
// - Đặt cược: gọi API trừ xu ngay (stake); được thì cộng vào tổng của bàn, gửi riêng người đặt `game.mine`.
// - Lắc: chờ các lệnh đặt cược đang dở xong, lắc 3 xúc xắc (crypto.randomInt), gọi API chốt ván (settle) một lần cho
//   cả bàn, rồi phát kết quả và gửi riêng từng người `game.payout`. API không trả lời được thì ván bị hủy (void);
//   API tự hoàn cược ván treo sau vài phút.
// Mọi người trong phòng thấy cùng một đồng hồ (endsAt theo giờ server) và cùng một lần lắc.
// Tài Xỉu dùng chung bàn này (rules.game = 'tai-xiu'): khác ô cược, cách lắc (3 số 1–6) và có giữ 10 ván gần nhất.
import { createHash, randomInt } from 'node:crypto';
import { BAU_CUA_ANIMALS, PROTOCOL_VERSION, TAI_XIU_SPOTS } from '@chanh-dien/protocol';
import { RESUME_GRACE_MS } from './loto.mjs';

const STATE_THROTTLE_MS = 300;
const SETTLE_ATTEMPTS = 3;
// Mỗi trò xúc xắc chung bàn: tiền tố mã ván (API chọn cách trả thưởng theo đó), ô cược, tên trường ô cược trong
// bet.place, cách lắc ba xúc xắc.
export const DICE_TABLE_GAMES = Object.freeze({
  'bau-cua': { prefix: 'bc', spots: BAU_CUA_ANIMALS, field: 'animal', roll: (random) => [0, 1, 2].map(() => BAU_CUA_ANIMALS[random(BAU_CUA_ANIMALS.length)]) },
  'tai-xiu': { prefix: 'tx', spots: TAI_XIU_SPOTS, field: 'spot', roll: (random) => [0, 1, 2].map(() => random(6) + 1) },
});
// Đây là timer đang được roll()/quiesce() await trực tiếp. Giữ timer có tham chiếu để tiến trình không thoát
// giữa lúc dựng lại ván đang lắc; các timer chạy nền của bàn vẫn unref riêng ở nơi tạo chúng.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export class BauCuaTable {
  // stake({ accountId, roundId, animal, amount, key }) → { ok, mine, coins } | { ok: false, code } | null (lỗi mạng)
  // unstake({ accountId, roundId, key }) → { ok, removed, refunded, coins } | { ok: false, code } | null
  // settle({ roundId, dice }) → { ok, results: [{ accountId, staked, payout, net, coins }] } | { ok: false, code } | null
  // rules: room rules interaction (game, bettingMs, rollingMs, resultMs, maxStakePerRound, historyRounds); test có thể
  // truyền nhịp ngắn.
  constructor({ room, rules, stake, unstake, settle, now = Date.now, random = randomInt }) {
    this.room = room;
    this.game = DICE_TABLE_GAMES[rules.game] ? rules.game : 'bau-cua';
    this.definition = DICE_TABLE_GAMES[this.game];
    // Ván gần nhất (mới nhất trước), chỉ giữ trong bộ nhớ: người vào sau xem cầu.
    this.historyRounds = rules.historyRounds || 0;
    this.history = [];
    this.bettingMs = rules.bettingMs;
    this.rollingMs = rules.rollingMs;
    this.resultMs = rules.resultMs;
    this.maxStake = rules.maxStakePerRound;
    this.stake = stake || null;
    this.unstake = unstake || null;
    this.settle = settle || null;
    this.now = now;
    this.random = random;
    this.round = null;
    this.serial = 0;
    this.timer = null;
    this.stateTimer = null;
    this.running = false;
    // Tăng mỗi lần trạng thái bàn đổi: máy realtime lưu snapshot khi số này đổi.
    this.revision = 0;
    this.restored = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.resume()) return;
    this.nextRound();
  }

  // ---- Lưu / dựng lại ván (deploy, máy chết) ----
  // Cược người thật nằm ở API; bản ghi giữ tổng cược, cược từng người và xúc xắc đã lắc (lắc trước khi chốt) để máy
  // mới chốt đúng ván với cùng roundId và cùng kết quả. Cược bot chỉ là trang trí nên giữ tổng, bỏ chi tiết.
  toRecord() {
    const round = this.round;
    if (!round) return null;
    return {
      serial: this.serial,
      history: this.history,
      round: {
        id: round.id, phase: round.phase, endsAt: round.endsAt, totals: round.totals, botTotals: round.botTotals,
        bettors: [...round.bettors], mine: [...round.mine], dice: round.dice, rolled: round.rolled || null,
        winners: round.winners, void: round.void,
      },
    };
  }

  restoreRecord(record) {
    const round = record?.round;
    if (!round || typeof round.id !== 'string' || !['betting', 'rolling', 'result'].includes(round.phase)) return false;
    const spots = this.definition.spots;
    const amounts = (value) => Object.fromEntries(spots.map((spot) => [spot, Number.isSafeInteger(value?.[spot]) && value[spot] >= 0 ? value[spot] : 0]));
    const dice = (value) => (Array.isArray(value) && value.length === 3 ? value : null);
    this.serial = Number.isSafeInteger(record.serial) ? record.serial : this.serial;
    if (Array.isArray(record.history) && this.historyRounds) this.history = record.history.filter((item) => dice(item)).slice(0, this.historyRounds);
    this.round = {
      id: round.id.slice(0, 79),
      phase: round.phase,
      endsAt: Number(round.endsAt) || this.now(),
      totals: amounts(round.totals),
      botTotals: amounts(round.botTotals),
      bettors: new Set((Array.isArray(round.bettors) ? round.bettors : []).filter((id) => typeof id === 'string')),
      botBettors: new Set(),
      botMine: new Map(),
      botActions: new Map(),
      mine: new Map((Array.isArray(round.mine) ? round.mine : []).filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string')),
      pending: new Set(),
      dice: dice(round.dice),
      rolled: dice(round.rolled),
      winners: Array.isArray(round.winners) ? round.winners : null,
      void: Boolean(round.void),
    };
    this.restored = true;
    return true;
  }

  // Chạy tiếp ván vừa dựng lại; đồng hồ lùi lại ít nhất RESUME_GRACE_MS để người chơi kịp nối lại.
  resume() {
    if (!this.restored || !this.round) return false;
    this.restored = null;
    const round = this.round;
    const now = this.now();
    if (round.phase === 'result') {
      const wait = Math.max(1_000, round.endsAt - now);
      round.endsAt = now + wait;
      this.timer = setTimeout(() => this.nextRound(), wait);
    } else {
      // Đang cược hoặc đang lắc dở: lắc (lại) khi hết giờ; roll() dùng xúc xắc đã lắc nếu có.
      round.phase = 'betting';
      const wait = Math.max(RESUME_GRACE_MS, round.endsAt - now);
      round.endsAt = now + wait;
      this.timer = setTimeout(() => this.roll(), wait);
    }
    this.timer.unref?.();
    this.broadcastState();
    return true;
  }

  // Rút máy: chờ lần lắc đang chốt tiền xong (tối đa 10 giây) rồi dừng bàn.
  async quiesce(limitMs = 10_000) {
    const until = Date.now() + limitMs;
    while (this.round?.phase === 'rolling' && Date.now() < until) await sleep(100);
    await Promise.allSettled([...(this.round?.pending || [])]);
    this.stop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    clearTimeout(this.stateTimer);
    this.timer = null;
    this.stateTimer = null;
  }

  nextRound() {
    if (!this.running) return;
    this.serial += 1;
    const suffix = randomInt(36 ** 4).toString(36).padStart(4, '0');
    this.round = {
      id: `${this.definition.prefix}-${this.room.id}-${this.room.epoch}-${this.serial}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 79),
      phase: 'betting',
      endsAt: this.now() + this.bettingMs,
      totals: Object.fromEntries(this.definition.spots.map((spot) => [spot, 0])),
      // Cược bot chỉ làm bàn sinh động: không gọi API ví, không nằm trong settle và mất khi sang ván mới.
      botTotals: Object.fromEntries(this.definition.spots.map((spot) => [spot, 0])),
      bettors: new Set(),
      botBettors: new Set(),
      botMine: new Map(),
      botActions: new Map(),
      mine: new Map(),
      pending: new Set(),
      dice: null,
      winners: null,
      void: false,
    };
    this.broadcastState();
    this.timer = setTimeout(() => this.roll(), this.bettingMs);
    this.timer.unref?.();
  }

  // Bot đặt cược mô phỏng trong bộ nhớ. Tiền bot tuyệt đối không đi qua stake/settle nên không thể tạo hoặc lấy xu thật.
  placeBotBet(participant, { key, amount }) {
    const round = this.round;
    if (!participant?.bot || !this.definition.spots.includes(key) || !Number.isSafeInteger(amount) || amount < 1) return false;
    if (!round || round.phase !== 'betting' || this.now() >= round.endsAt) return false;
    const actions = round.botActions.get(participant.id) || 0;
    const mine = round.botMine.get(participant.id) || {};
    const placed = Object.values(mine).reduce((sum, value) => sum + value, 0);
    if (actions >= 3 || placed + amount > this.maxStake) return false;
    mine[key] = (mine[key] || 0) + amount;
    round.botMine.set(participant.id, mine);
    round.botActions.set(participant.id, actions + 1);
    round.botTotals[key] += amount;
    round.botBettors.add(participant.id);
    this.scheduleState();
    return true;
  }

  hasBotBet(participantId) {
    return Boolean(this.round?.botBettors.has(participantId));
  }

  async roll() {
    const round = this.round;
    if (!this.running || !round || round.phase !== 'betting') return;
    round.phase = 'rolling';
    round.endsAt = this.now() + this.rollingMs;
    const started = this.now();
    this.broadcastState();
    // Lệnh đặt cược gửi trước giờ đóng nhưng API chưa trả lời: chờ xong để ván chốt đủ cược.
    await Promise.allSettled([...round.pending]);
    // Lắc một lần cho mỗi ván: máy dựng lại ván đang lắc dở dùng lại đúng xúc xắc đã gửi API chốt.
    const dice = round.rolled || this.definition.roll(this.random);
    round.rolled = dice;
    this.revision += 1;
    let settled = { ok: true, results: [] };
    if (round.bettors.size) {
      settled = null;
      for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled?.ok; attempt += 1) {
        settled = this.settle ? await this.settle({ roundId: round.id, dice }) : null;
        if (!settled?.ok && settled?.code === 'ROUND_VOID') break;
        if (!settled?.ok && attempt + 1 < SETTLE_ATTEMPTS) await sleep(500);
      }
    }
    // Hoạt cảnh lắc chạy đủ rollingMs rồi mới mở bát.
    const wait = started + this.rollingMs - this.now();
    if (wait > 0) await sleep(wait);
    if (!this.running || this.round !== round) return;
    round.phase = 'result';
    round.endsAt = this.now() + this.resultMs;
    round.dice = dice;
    if (this.historyRounds) this.history = [[...dice], ...this.history].slice(0, this.historyRounds);
    if (settled?.ok) {
      round.winners = settled.results.filter((item) => item.net > 0).sort((a, b) => b.net - a.net).slice(0, 5)
        .map((item) => ({ displayName: this.nameOf(item.accountId), net: item.net }));
      for (const item of settled.results) {
        this.sendToAccount(item.accountId, {
          v: PROTOCOL_VERSION, type: 'game.payout', epoch: this.room.epoch, roundId: round.id,
          staked: item.staked, payout: item.payout, net: item.net, coins: item.coins,
        });
      }
    } else round.void = true;
    this.broadcastState();
    this.timer = setTimeout(() => this.nextRound(), this.resultMs);
    this.timer.unref?.();
  }

  // Đặt cược của một thành viên. Trả { ok } hoặc { ok: false, code, message } để báo lỗi riêng người đặt.
  async placeBet(participant, { requestId, roundId, animal, spot, amount }) {
    const round = this.round;
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để cược bằng xu' };
    // Ô cược của đúng trò ở bàn này (Bầu Cua: animal, Tài Xỉu: spot).
    const key = this.definition.field === 'spot' ? spot : animal;
    if (!this.definition.spots.includes(key)) return { ok: false, code: 'INVALID_BET', message: 'Ô cược không có ở bàn này' };
    if (!round || round.phase !== 'betting' || round.id !== roundId || this.now() >= round.endsAt) {
      return { ok: false, code: 'BETTING_CLOSED', message: 'Đã hết giờ đặt cược ván này' };
    }
    const placed = Object.values(round.mine.get(participant.accountId) || {}).reduce((sum, value) => sum + value, 0);
    if (placed + amount > this.maxStake) return { ok: false, code: 'STAKE_LIMIT', message: `Mỗi ván cược tối đa ${this.maxStake} xu` };
    if (!this.stake) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn chưa nối được ví xu, thử lại sau' };
    // Khóa idempotency cho API: cùng người + cùng requestId (gửi lại) thì không trừ hai lần.
    const requestKey = createHash('sha256').update(`${participant.accountId}:${requestId}`).digest('base64url').slice(0, 40);
    const call = Promise.resolve(this.stake({ accountId: participant.accountId, roundId, animal: key, amount, key: requestKey }));
    round.pending.add(call);
    let result = null;
    try { result = await call; } catch {}
    round.pending.delete(call);
    if (!result?.ok) {
      const code = result?.code === 'INSUFFICIENT_COINS' ? 'INSUFFICIENT_COINS'
        : result?.code === 'STAKE_LIMIT' ? 'STAKE_LIMIT'
          : result?.code === 'ROUND_CLOSED' ? 'BETTING_CLOSED' : 'GAME_UNAVAILABLE';
      const message = { INSUFFICIENT_COINS: 'Không đủ xu', STAKE_LIMIT: `Mỗi ván cược tối đa ${this.maxStake} xu`, BETTING_CLOSED: 'Đã hết giờ đặt cược ván này', GAME_UNAVAILABLE: 'Chưa đặt được cược, thử lại sau' }[code];
      return { ok: false, code, message };
    }
    if (this.round !== round) return { ok: true };
    if (!result.replayed) {
      round.totals[key] += amount;
      round.bettors.add(participant.accountId);
    }
    round.mine.set(participant.accountId, result.mine);
    this.sendToAccount(participant.accountId, {
      v: PROTOCOL_VERSION, type: 'game.mine', epoch: this.room.epoch, roundId: round.id, mine: result.mine, coins: result.coins, requestId,
    });
    this.scheduleState();
    return { ok: true };
  }

  // Hủy toàn bộ cược của một thành viên trong ván (chỉ trong pha đặt cược): API hoàn xu, bàn trừ khỏi tổng.
  async cancelBets(participant, { requestId, roundId }) {
    const round = this.round;
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để cược bằng xu' };
    if (!round || round.phase !== 'betting' || round.id !== roundId || this.now() >= round.endsAt) {
      return { ok: false, code: 'BETTING_CLOSED', message: 'Đã hết giờ cược, không hủy được nữa' };
    }
    if (!this.unstake) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Chưa hủy được cược, thử lại sau' };
    const key = createHash('sha256').update(`${participant.accountId}:cancel:${requestId}`).digest('base64url').slice(0, 40);
    // Đặt cược đang dở của người này phải xong trước, để hủy đủ.
    await Promise.allSettled([...round.pending]);
    const call = Promise.resolve(this.unstake({ accountId: participant.accountId, roundId, key }));
    round.pending.add(call);
    let result = null;
    try { result = await call; } catch {}
    round.pending.delete(call);
    if (!result?.ok) {
      const closed = result?.code === 'ROUND_CLOSED';
      return { ok: false, code: closed ? 'BETTING_CLOSED' : 'GAME_UNAVAILABLE', message: closed ? 'Đã hết giờ cược, không hủy được nữa' : 'Chưa hủy được cược, thử lại sau' };
    }
    if (this.round !== round) return { ok: true };
    if (!result.replayed) {
      for (const [animal, amount] of Object.entries(result.removed || {})) round.totals[animal] = Math.max(0, round.totals[animal] - amount);
      round.bettors.delete(participant.accountId);
    }
    round.mine.delete(participant.accountId);
    this.sendToAccount(participant.accountId, {
      v: PROTOCOL_VERSION, type: 'game.mine', epoch: this.room.epoch, roundId: round.id, mine: {}, coins: result.coins, requestId,
    });
    this.scheduleState();
    return { ok: true };
  }

  stateMessage() {
    const round = this.round;
    if (!round) return null;
    const totals = Object.fromEntries(this.definition.spots.map((spot) => [spot, round.totals[spot] + round.botTotals[spot]]));
    return {
      v: PROTOCOL_VERSION,
      type: 'game.state',
      epoch: this.room.epoch,
      game: this.game,
      roundId: round.id,
      phase: round.phase,
      endsAt: round.endsAt,
      totals,
      bettors: round.bettors.size + round.botBettors.size,
      ...(round.dice ? { dice: [...round.dice] } : {}),
      ...(round.winners ? { winners: round.winners } : {}),
      ...(round.void ? { void: true } : {}),
      ...(this.historyRounds ? { history: this.history.map((dice) => [...dice]) } : {}),
    };
  }

  // Người vào lại giữa ván: cược của mình trong ván đang chạy.
  mineMessage(accountId) {
    const mine = accountId && this.round?.mine.get(accountId);
    return mine ? { v: PROTOCOL_VERSION, type: 'game.mine', epoch: this.room.epoch, roundId: this.round.id, mine } : null;
  }

  broadcastState() {
    this.revision += 1;
    clearTimeout(this.stateTimer);
    this.stateTimer = null;
    const message = this.stateMessage();
    if (message) this.room.broadcast(message);
  }

  // Tổng cược đổi liên tục khi đông người đặt: gom lại, phát tối đa ~3 lần/giây.
  scheduleState() {
    if (this.stateTimer) return;
    this.stateTimer = setTimeout(() => this.broadcastState(), STATE_THROTTLE_MS);
    this.stateTimer.unref?.();
  }

  sendToAccount(accountId, message) {
    for (const participant of this.room.participants.values()) {
      if (participant.accountId === accountId) this.room.sendTo(participant.id, message);
    }
  }

  nameOf(accountId) {
    for (const participant of this.room.participants.values()) if (participant.accountId === accountId) return participant.displayName;
    return 'Người chơi';
  }
}

// Gọi API nội bộ để đặt cược / chốt ván. Lỗi mạng trả null (bàn tự xử lý: báo lỗi người đặt / hủy ván).
export function bauCuaBank(apiInternalUrl, key) {
  const call = (path) => (body) => fetch(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json().catch(() => null)).catch((error) => {
    console.warn(`Bầu Cua: không gọi được API (${path}): ${error.message}`);
    return null;
  });
  return {
    stake: call('/internal/games/bau-cua/stake'),
    unstake: call('/internal/games/bau-cua/unstake'),
    settle: call('/internal/games/bau-cua/settle'),
  };
}
