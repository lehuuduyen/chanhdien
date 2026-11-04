// Bàn Bầu Cua chơi chung (phòng game). Máy realtime giữ nhịp ván và lắc xúc xắc; tiền do API giữ:
//   đặt cược (betting) → lắc (rolling) → kết quả (result) → ván mới …
// - Đặt cược: gọi API trừ xu ngay (stake); được thì cộng vào tổng của bàn, gửi riêng người đặt `game.mine`.
// - Lắc: chờ các lệnh đặt cược đang dở xong, lắc 3 xúc xắc (crypto.randomInt), gọi API chốt ván (settle) một lần cho
//   cả bàn, rồi phát kết quả và gửi riêng từng người `game.payout`. API không trả lời được thì ván bị hủy (void);
//   API tự hoàn cược ván treo sau vài phút.
// Mọi người trong phòng thấy cùng một đồng hồ (endsAt theo giờ server) và cùng một lần lắc.
import { createHash, randomInt } from 'node:crypto';
import { BAU_CUA_ANIMALS, PROTOCOL_VERSION } from '@chanh-dien/protocol';

const STATE_THROTTLE_MS = 300;
const SETTLE_ATTEMPTS = 3;
const emptyTotals = () => Object.fromEntries(BAU_CUA_ANIMALS.map((animal) => [animal, 0]));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

export class BauCuaTable {
  // stake({ accountId, roundId, animal, amount, key }) → { ok, mine, coins } | { ok: false, code } | null (lỗi mạng)
  // unstake({ accountId, roundId, key }) → { ok, removed, refunded, coins } | { ok: false, code } | null
  // settle({ roundId, dice }) → { ok, results: [{ accountId, staked, payout, net, coins }] } | { ok: false, code } | null
  // rules: room rules interaction (bettingMs, rollingMs, resultMs, maxStakePerRound); test có thể truyền nhịp ngắn.
  constructor({ room, rules, stake, unstake, settle, now = Date.now, random = randomInt }) {
    this.room = room;
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
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextRound();
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
      id: `bc-${this.room.id}-${this.room.epoch}-${this.serial}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 79),
      phase: 'betting',
      endsAt: this.now() + this.bettingMs,
      totals: emptyTotals(),
      bettors: new Set(),
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

  async roll() {
    const round = this.round;
    if (!this.running || !round || round.phase !== 'betting') return;
    round.phase = 'rolling';
    round.endsAt = this.now() + this.rollingMs;
    const started = this.now();
    this.broadcastState();
    // Lệnh đặt cược gửi trước giờ đóng nhưng API chưa trả lời: chờ xong để ván chốt đủ cược.
    await Promise.allSettled([...round.pending]);
    const dice = [0, 1, 2].map(() => BAU_CUA_ANIMALS[this.random(BAU_CUA_ANIMALS.length)]);
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
  async placeBet(participant, { requestId, roundId, animal, amount }) {
    const round = this.round;
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để cược bằng xu' };
    if (!round || round.phase !== 'betting' || round.id !== roundId || this.now() >= round.endsAt) {
      return { ok: false, code: 'BETTING_CLOSED', message: 'Đã hết giờ đặt cược ván này' };
    }
    const placed = Object.values(round.mine.get(participant.accountId) || {}).reduce((sum, value) => sum + value, 0);
    if (placed + amount > this.maxStake) return { ok: false, code: 'STAKE_LIMIT', message: `Mỗi ván cược tối đa ${this.maxStake} xu` };
    if (!this.stake) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn chưa nối được ví xu, thử lại sau' };
    // Khóa idempotency cho API: cùng người + cùng requestId (gửi lại) thì không trừ hai lần.
    const key = createHash('sha256').update(`${participant.accountId}:${requestId}`).digest('base64url').slice(0, 40);
    const call = Promise.resolve(this.stake({ accountId: participant.accountId, roundId, animal, amount, key }));
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
      round.totals[animal] += amount;
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
    return {
      v: PROTOCOL_VERSION,
      type: 'game.state',
      epoch: this.room.epoch,
      game: 'bau-cua',
      roundId: round.id,
      phase: round.phase,
      endsAt: round.endsAt,
      totals: { ...round.totals },
      bettors: round.bettors.size,
      ...(round.dice ? { dice: [...round.dice] } : {}),
      ...(round.winners ? { winners: round.winners } : {}),
      ...(round.void ? { void: true } : {}),
    };
  }

  // Người vào lại giữa ván: cược của mình trong ván đang chạy.
  mineMessage(accountId) {
    const mine = accountId && this.round?.mine.get(accountId);
    return mine ? { v: PROTOCOL_VERSION, type: 'game.mine', epoch: this.room.epoch, roundId: this.round.id, mine } : null;
  }

  broadcastState() {
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
