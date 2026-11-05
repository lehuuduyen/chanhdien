// Bàn Lô Tô chơi chung (phòng loto-1). Máy realtime giữ nhịp ván và gọi số; tiền và vé do API giữ:
//   mua vé (buying) → gọi số (calling) → chờ kinh cùng nhịp (claiming) → kết quả (result) → ván mới …
// - Mua vé: gọi API trừ xu và tạo vé (server tạo, không tin client); gửi riêng người mua `lotto.tickets`. Hết giờ mua
//   mà chưa đủ minPlayers người có vé (mặc định 2) thì kéo dài pha mua, người đã mua giữ vé chờ thêm người.
// - Gọi số: mỗi callMs rút một số 1–90 chưa gọi (crypto.randomInt), phát cho cả phòng; tự tính ai đang "đợi" (một hàng
//   còn thiếu đúng 1 số) theo vé gốc.
// - Kinh: người chơi tự bấm; kiểm tra hàng đó đủ 5 số đã gọi (theo vé gốc, không theo chỗ người chơi đánh dấu). Sai thì
//   khóa nút falseClaimLockMs. Kinh đúng đầu tiên thì ngừng gọi, chờ claimWindowMs cho người kinh cùng nhịp, rồi gọi API
//   chốt ván (API kiểm tra lại, chia quỹ sau phế). Gọi hết 90 số mà không ai kinh thì sau graceAfterLastMs hủy ván.
import { createHash, randomInt } from 'node:crypto';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';

const STATE_THROTTLE_MS = 300;
// Ít nhất 2 người chơi mới mở ván (một người thì không có ai để thắng thua).
export const LOTTO_MIN_PLAYERS = 2;
const SETTLE_ATTEMPTS = 3;
const MAX_CLAIMS = 200;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });
const complete = (rows, row, called) => rows[row].every((number) => !number || called.has(number));
const LOTTO_COLUMNS = Array.from({ length: 9 }, (_, column) => [column === 0 ? 1 : column * 10, column === 8 ? 90 : column * 10 + 9]);

// Vé bot chỉ nằm trong bộ nhớ realtime. Thuật toán giống vé thật (3 × 9, 5 số/hàng, đủ 9 cột), nhưng không gọi
// API và không đụng ví xu.
function createBotTicket() {
  const pick = (list, count) => {
    const pool = [...list];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    return pool.slice(0, count);
  };
  const columns = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let layout;
  do layout = [0, 1, 2].map(() => pick(columns, 5));
  while (!columns.every((column) => layout.some((row) => row.includes(column))));
  const rows = [0, 1, 2].map(() => Array(9).fill(0));
  for (const column of columns) {
    const used = [0, 1, 2].filter((row) => layout[row].includes(column));
    const [low, high] = LOTTO_COLUMNS[column];
    const numbers = pick(Array.from({ length: high - low + 1 }, (_, index) => low + index), used.length).sort((a, b) => a - b);
    used.forEach((row, index) => { rows[row][column] = numbers[index]; });
  }
  return rows;
}

export class LottoTable {
  // buy({ accountId, roundId, count, autoMark, key }) → { ok, tickets: [{ no, rows }], autoMark, coins } | { ok: false, code } | null
  // settle({ roundId, called, claims }) → { ok, void?, winners, share, results } | { ok: false, code } | null (lỗi mạng)
  // rules: room rules interaction (buyMs, callMs, claimWindowMs, resultMs, graceAfterLastMs, falseClaimLockMs, ticketPrice).
  constructor({ room, rules, buy, settle, now = Date.now, random = randomInt }) {
    this.kind = 'loto';
    this.room = room;
    this.rules = rules;
    this.buyFn = buy || null;
    this.settleFn = settle || null;
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

  schedule(ms, work) {
    clearTimeout(this.timer);
    this.timer = setTimeout(work, ms);
    this.timer.unref?.();
  }

  nextRound() {
    if (!this.running) return;
    this.serial += 1;
    const suffix = randomInt(36 ** 4).toString(36).padStart(4, '0');
    this.round = {
      id: `lt-${this.room.id}-${this.room.epoch}-${this.serial}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 79),
      phase: 'buying',
      endsAt: this.now() + this.rules.buyMs,
      nextCallAt: null,
      called: [],
      calledSet: new Set(),
      tickets: new Map(), // accountId → [{ no, rows }]
      botTickets: new Map(), // participantId → [{ no, rows }], không có tiền thật
      autoMark: new Set(),
      pending: new Set(),
      claims: [],
      botClaims: [],
      locks: new Map(), // accountId → khóa nút kinh tới lúc nào
      waiting: [],
      winners: null,
      void: false,
    };
    this.broadcastState();
    this.schedule(this.rules.buyMs, () => this.startCalling());
  }

  ticketCount() {
    let count = 0;
    for (const tickets of this.round.tickets.values()) count += tickets.length;
    for (const tickets of this.round.botTickets.values()) count += tickets.length;
    return count;
  }

  realTicketCount() {
    let count = 0;
    for (const tickets of this.round.tickets.values()) count += tickets.length;
    return count;
  }

  playerCount() {
    return this.round.tickets.size + this.round.botTickets.size;
  }

  placeBotTicket(participant) {
    const round = this.round;
    if (!participant?.bot || !round || round.phase !== 'buying' || this.now() >= round.endsAt) return false;
    if (round.botTickets.has(participant.id)) return true;
    round.botTickets.set(participant.id, [{ no: 1, rows: createBotTicket() }]);
    this.scheduleState();
    return true;
  }

  hasBotTicket(participantId) {
    return Boolean(this.round?.botTickets.has(participantId));
  }

  async startCalling() {
    const round = this.round;
    if (!this.running || round.phase !== 'buying') return;
    // Lệnh mua gửi trước giờ đóng nhưng API chưa trả lời: chờ xong để vé có mặt khi gọi số.
    await Promise.allSettled([...round.pending]);
    if (!this.running || this.round !== round) return;
    if (this.playerCount() < (this.rules.minPlayers ?? LOTTO_MIN_PLAYERS)) {
      round.endsAt = this.now() + this.rules.buyMs;
      this.broadcastState();
      this.schedule(this.rules.buyMs, () => this.startCalling());
      return;
    }
    round.phase = 'calling';
    this.callNext();
  }

  callNext() {
    const round = this.round;
    if (!this.running || round.phase !== 'calling') return;
    if (round.called.length >= 90) {
      // Hết số mà không ai kinh: chờ thêm một chút cho người còn dò, rồi hủy ván (API hoàn tiền).
      round.endsAt = this.now() + this.rules.graceAfterLastMs;
      round.nextCallAt = null;
      this.broadcastState();
      this.schedule(this.rules.graceAfterLastMs, () => this.finish());
      return;
    }
    const left = [];
    for (let number = 1; number <= 90; number += 1) if (!round.calledSet.has(number)) left.push(number);
    const number = left[this.random(left.length)];
    round.called.push(number);
    round.calledSet.add(number);
    round.waiting = this.waitingList();
    // Bot chỉ được kết thúc ván bot-only. Khi có vé trả tiền thật, kết quả hoàn toàn do người thật kinh để bot
    // không bao giờ làm người chơi mất xu hoặc thay đổi người thắng.
    if (!round.tickets.size) {
      for (const [botId, tickets] of round.botTickets) {
        if (round.botClaims.some((claim) => claim.botId === botId)) continue;
        let won = null;
        for (const ticket of tickets) {
          const row = ticket.rows.findIndex((_, index) => complete(ticket.rows, index, round.calledSet));
          if (row >= 0) { won = { botId, ticket: ticket.no, row }; break; }
        }
        if (won) round.botClaims.push(won);
      }
      if (round.botClaims.length) {
        round.phase = 'claiming';
        round.nextCallAt = null;
        round.endsAt = this.now() + this.rules.claimWindowMs;
        this.broadcastState();
        this.schedule(this.rules.claimWindowMs, () => this.finish());
        return;
      }
    }
    round.nextCallAt = this.now() + this.rules.callMs;
    round.endsAt = round.nextCallAt;
    this.broadcastState();
    this.schedule(this.rules.callMs, () => this.callNext());
  }

  // Người đang "đợi": hàng còn thiếu đúng 1 số (mỗi người tối đa một dòng, tối đa 8 người).
  waitingList() {
    const round = this.round;
    const list = [];
    for (const [accountId, tickets] of [...round.tickets, ...round.botTickets]) {
      let missing = null;
      for (const { rows } of tickets) {
        for (const row of rows) {
          const left = row.filter((number) => number && !round.calledSet.has(number));
          if (left.length === 1) missing = left[0];
        }
      }
      if (missing) list.push({ displayName: this.nameOf(accountId), number: missing });
      if (list.length >= 8) break;
    }
    return list;
  }

  async buy(participant, { requestId, roundId, count, autoMark }) {
    const round = this.round;
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để mua vé bằng xu' };
    if (!round || round.phase !== 'buying' || round.id !== roundId || this.now() >= round.endsAt) {
      return { ok: false, code: 'BUYING_CLOSED', message: 'Đã hết giờ mua vé ván này' };
    }
    if (!this.buyFn) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn chưa nối được ví xu, thử lại sau' };
    const key = createHash('sha256').update(`${participant.accountId}:lotto:${requestId}`).digest('base64url').slice(0, 40);
    const call = Promise.resolve(this.buyFn({ accountId: participant.accountId, roundId, count, autoMark, key }));
    round.pending.add(call);
    let result = null;
    try { result = await call; } catch {}
    round.pending.delete(call);
    if (!result?.ok) {
      const code = ['INSUFFICIENT_COINS', 'TICKET_LIMIT'].includes(result?.code) ? result.code : result?.code === 'ROUND_CLOSED' ? 'BUYING_CLOSED' : 'GAME_UNAVAILABLE';
      const message = { INSUFFICIENT_COINS: 'Không đủ xu', TICKET_LIMIT: 'Mỗi ván mua tối đa 2 vé', BUYING_CLOSED: 'Đã hết giờ mua vé ván này', GAME_UNAVAILABLE: 'Chưa mua được vé, thử lại sau' }[code];
      return { ok: false, code, message };
    }
    if (this.round !== round) return { ok: true };
    round.tickets.set(participant.accountId, result.tickets);
    if (result.autoMark) round.autoMark.add(participant.accountId);
    this.sendToAccount(participant.accountId, { ...this.ticketsMessage(participant.accountId), coins: result.coins, requestId });
    this.scheduleState();
    return { ok: true };
  }

  claim(participant, { roundId, ticket, row }) {
    const round = this.round;
    const accountId = participant?.accountId;
    if (!accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để chơi Lô Tô' };
    if (!round || round.id !== roundId || !['calling', 'claiming'].includes(round.phase)) return { ok: false, code: 'NOT_CALLING', message: 'Chưa tới lúc kinh' };
    const lockedUntil = round.locks.get(accountId) || 0;
    if (this.now() < lockedUntil) return { ok: false, code: 'CLAIM_LOCKED', message: `Kinh sai, chờ ${Math.ceil((lockedUntil - this.now()) / 1_000)} giây` };
    const owned = round.tickets.get(accountId)?.find((item) => item.no === ticket);
    if (!owned || !complete(owned.rows, row, round.calledSet)) {
      round.locks.set(accountId, this.now() + this.rules.falseClaimLockMs);
      return { ok: false, code: 'FALSE_CLAIM', message: `Kinh sai! Khóa nút kinh ${Math.round(this.rules.falseClaimLockMs / 1_000)} giây` };
    }
    if (round.claims.some((item) => item.accountId === accountId && item.ticket === ticket)) return { ok: true };
    if (round.claims.length >= MAX_CLAIMS) return { ok: false, code: 'NOT_CALLING', message: 'Đã đủ người kinh' };
    round.claims.push({ accountId, ticket, row });
    if (round.phase === 'calling') {
      // Kinh đúng đầu tiên: ngừng gọi số, chờ người kinh cùng nhịp (cùng bộ số đã gọi).
      round.phase = 'claiming';
      round.nextCallAt = null;
      round.endsAt = this.now() + this.rules.claimWindowMs;
      this.schedule(this.rules.claimWindowMs, () => this.finish());
    }
    this.broadcastState();
    return { ok: true };
  }

  async finish() {
    const round = this.round;
    if (!this.running || !['calling', 'claiming'].includes(round.phase)) return;
    round.phase = 'settling';
    let settled = null;
    if (!round.tickets.size) {
      settled = { ok: true, ...(round.botClaims.length ? {} : { void: true }), winners: [], share: 0, results: [] };
    } else {
      for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled?.ok; attempt += 1) {
        settled = this.settleFn ? await this.settleFn({ roundId: round.id, called: round.called, claims: round.claims }) : null;
        if (!settled?.ok && attempt + 1 < SETTLE_ATTEMPTS) await sleep(500);
      }
    }
    if (!this.running || this.round !== round) return;
    round.phase = 'result';
    round.endsAt = this.now() + this.rules.resultMs;
    round.nextCallAt = null;
    // Không chốt được (API lỗi): coi như hủy; API tự hoàn tiền ván treo.
    round.void = !settled?.ok || Boolean(settled.void);
    const realWinners = settled?.ok && !settled.void
      ? (settled.winners || []).slice(0, 20).map((item) => ({ displayName: this.nameOf(item.accountId), share: settled.share }))
      : [];
    const botWinners = !round.tickets.size && settled?.ok && !settled.void
      ? round.botClaims.slice(0, Math.max(0, 20 - realWinners.length)).map((item) => ({ displayName: this.nameOf(item.botId), share: 0 }))
      : [];
    round.winners = [...realWinners, ...botWinners];
    if (settled?.ok) {
      for (const item of settled.results || []) {
        if (!item.staked) continue;
        this.sendToAccount(item.accountId, {
          v: PROTOCOL_VERSION, type: 'game.payout', epoch: this.room.epoch, roundId: round.id,
          staked: item.staked, payout: item.payout, net: item.net, coins: item.coins,
        });
      }
    }
    this.broadcastState();
    this.schedule(this.rules.resultMs, () => this.nextRound());
  }

  stateMessage() {
    const round = this.round;
    if (!round) return null;
    const tickets = this.ticketCount();
    return {
      v: PROTOCOL_VERSION,
      type: 'lotto.state',
      epoch: this.room.epoch,
      roundId: round.id,
      phase: round.phase === 'settling' ? 'claiming' : round.phase,
      endsAt: round.endsAt,
      called: [...round.called],
      pool: this.realTicketCount() * this.rules.ticketPrice,
      tickets,
      players: this.playerCount(),
      ...(round.nextCallAt ? { nextCallAt: round.nextCallAt } : {}),
      ...(round.waiting.length ? { waiting: round.waiting } : {}),
      ...(round.claims.length + round.botClaims.length ? { claims: round.claims.length + round.botClaims.length } : {}),
      ...(round.winners ? { winners: round.winners } : {}),
      ...(round.void ? { void: true } : {}),
    };
  }

  ticketsMessage(accountId) {
    const round = this.round;
    return {
      v: PROTOCOL_VERSION, type: 'lotto.tickets', epoch: this.room.epoch, roundId: round.id,
      tickets: (round.tickets.get(accountId) || []).map(({ no, rows }) => ({ no, rows })), autoMark: round.autoMark.has(accountId),
    };
  }

  // Người vào lại giữa ván: vé của mình trong ván đang chạy (cùng tên hàm với bàn xúc xắc).
  mineMessage(accountId) {
    return accountId && this.round?.tickets.has(accountId) ? this.ticketsMessage(accountId) : null;
  }

  broadcastState() {
    clearTimeout(this.stateTimer);
    this.stateTimer = null;
    const message = this.stateMessage();
    if (message) this.room.broadcast(message);
  }

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
    for (const participant of this.room.participants.values()) {
      if (participant.accountId === accountId || participant.id === accountId) return participant.displayName;
    }
    return 'Người chơi';
  }
}

// Gọi API nội bộ mua vé / chốt ván. Lỗi mạng trả null.
export function lottoBank(apiInternalUrl, key) {
  const call = (path) => (body) => fetch(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json().catch(() => null)).catch((error) => {
    console.warn(`Lô Tô: không gọi được API (${path}): ${error.message}`);
    return null;
  });
  return { buy: call('/internal/games/loto/buy'), settle: call('/internal/games/loto/settle') };
}
