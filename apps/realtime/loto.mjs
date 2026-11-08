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
// Dựng lại ván sau khi máy realtime khởi động lại (deploy): cho người chơi vài giây nối lại trước khi ván chạy tiếp.
export const RESUME_GRACE_MS = 4_000;
const QUIESCE_LIMIT_MS = 10_000;
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

const KINH_LINES = ['Kinh! 🎉', 'Kinh rồi nè!', 'Kinh kinh! Dò giùm mình với', 'Kinh! Hên quá 😆', 'Ê kinh rồi nha!'];

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
    // Tăng mỗi lần trạng thái bàn đổi: máy realtime lưu snapshot khi số này đổi.
    this.revision = 0;
    // Ván đọc từ snapshot, chờ start() để chạy tiếp.
    this.restored = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.resume()) return;
    this.nextRound();
  }

  // ---- Lưu / dựng lại ván (deploy, máy chết) ----
  // Vé người thật vẫn nằm ở API (đã trừ xu); bản ghi này chỉ giúp máy mới gọi số tiếp đúng ván, rồi chốt bằng cùng
  // roundId (API chốt idempotent). Vé bot đi kèm tên bot để còn hiện người thắng khi bot cũ không quay lại.
  toRecord() {
    const round = this.round;
    if (!round) return null;
    const names = {};
    for (const botId of round.botTickets.keys()) names[botId] = this.nameOf(botId);
    return {
      serial: this.serial,
      round: {
        id: round.id, phase: round.phase, endsAt: round.endsAt, nextCallAt: round.nextCallAt, called: [...round.called],
        tickets: [...round.tickets], botTickets: [...round.botTickets], names: { ...round.names, ...names },
        autoMark: [...round.autoMark], claims: round.claims, botClaims: round.botClaims, winners: round.winners, void: round.void,
      },
    };
  }

  restoreRecord(record) {
    const round = record?.round;
    const ticketList = (value) => (Array.isArray(value) ? value : []).filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1]));
    if (!round || typeof round.id !== 'string' || !['buying', 'calling', 'claiming', 'settling', 'result'].includes(round.phase)) return false;
    // Phòng công cộng có bot nên bàn có thể đã start() ngay trong constructor, trước lúc RoomRegistry tải snapshot.
    // Khi đó timer của ván rỗng đang chạy; chỉ ghi đè `round` sẽ làm callback cũ thoát vì pha không khớp và ván
    // snapshot đứng vĩnh viễn. Hủy mọi timer cũ rồi resume ngay nếu bàn đã chạy.
    const wasRunning = this.running;
    if (wasRunning) {
      clearTimeout(this.timer);
      clearTimeout(this.stateTimer);
      this.timer = null;
      this.stateTimer = null;
    }
    const called = (Array.isArray(round.called) ? round.called : []).filter((number) => Number.isSafeInteger(number) && number >= 1 && number <= 90);
    this.serial = Number.isSafeInteger(record.serial) ? record.serial : this.serial;
    this.round = {
      id: round.id.slice(0, 79),
      phase: round.phase === 'settling' ? 'claiming' : round.phase,
      endsAt: Number(round.endsAt) || this.now(),
      nextCallAt: Number(round.nextCallAt) || null,
      called,
      calledSet: new Set(called),
      tickets: new Map(ticketList(round.tickets)),
      botTickets: new Map(ticketList(round.botTickets)),
      names: round.names && typeof round.names === 'object' ? round.names : {},
      autoMark: new Set((Array.isArray(round.autoMark) ? round.autoMark : []).filter((id) => typeof id === 'string')),
      pending: new Set(),
      claims: Array.isArray(round.claims) ? round.claims : [],
      botClaims: Array.isArray(round.botClaims) ? round.botClaims : [],
      botSeen: new Map(),
      locks: new Map(),
      waiting: [],
      winners: Array.isArray(round.winners) ? round.winners : null,
      void: Boolean(round.void),
    };
    this.round.waiting = this.waitingList();
    this.restored = true;
    if (wasRunning) this.resume();
    return true;
  }

  // Chạy tiếp ván vừa dựng lại, đồng hồ lùi lại ít nhất RESUME_GRACE_MS để người chơi kịp nối lại.
  resume() {
    if (!this.restored || !this.round) return false;
    this.restored = null;
    const round = this.round;
    const now = this.now();
    const later = (at) => Math.max(RESUME_GRACE_MS, (at || 0) - now);
    if (round.phase === 'buying') {
      const wait = later(round.endsAt);
      round.endsAt = now + wait;
      this.schedule(wait, () => this.startCalling());
    } else if (round.phase === 'calling' && round.called.length >= 90) {
      round.endsAt = now + later(round.endsAt);
      round.nextCallAt = null;
      this.schedule(round.endsAt - now, () => this.finish());
    } else if (round.phase === 'calling') {
      const wait = later(round.nextCallAt);
      round.nextCallAt = now + wait;
      round.endsAt = round.nextCallAt;
      this.schedule(wait, () => this.callNext());
    } else if (round.phase === 'claiming') {
      const wait = later(round.endsAt);
      round.endsAt = now + wait;
      this.schedule(wait, () => this.finish());
    } else {
      const wait = Math.max(1_000, round.endsAt - now);
      round.endsAt = now + wait;
      this.schedule(wait, () => this.nextRound());
    }
    this.broadcastState();
    return true;
  }

  // Rút máy: chờ ván đang chốt tiền xong (tối đa 10 giây) rồi dừng bàn, để bản ghi không kẹt giữa lúc chốt.
  async quiesce(limitMs = QUIESCE_LIMIT_MS) {
    const until = Date.now() + limitMs;
    while (this.round?.phase === 'settling' && Date.now() < until) await sleep(100);
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

  // Phòng đóng giữa ván (phòng riêng: chủ phòng rời): dừng bàn và hủy ván đang dở, API hoàn vé người đã mua.
  async abort() {
    const round = this.round;
    this.stop();
    if (!round || !round.tickets.size || !['buying', 'calling', 'claiming'].includes(round.phase)) return;
    round.phase = 'settling';
    await Promise.allSettled([...round.pending]);
    await Promise.resolve(this.settleFn?.({ roundId: round.id, called: round.called, claims: [] })).catch(() => null);
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
      names: {},
      botSeen: new Map(), // bot vừa đủ hàng ở nhịp gọi này (ván có vé thật: nhịp sau mới kinh)
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

  botTicketCount() {
    let count = 0;
    for (const tickets of this.round.botTickets.values()) count += tickets.length;
    return count;
  }

  playerCount() {
    return this.round.tickets.size + this.round.botTickets.size;
  }

  // count: 1 hoặc 2 vé (như người thật, tối đa 2 vé mỗi người).
  placeBotTicket(participant, count = 1) {
    const round = this.round;
    if (!participant?.bot || !round || round.phase !== 'buying' || this.now() >= round.endsAt) return false;
    if (round.botTickets.has(participant.id)) return true;
    const tickets = count === 2 ? [1, 2] : [1];
    round.botTickets.set(participant.id, tickets.map((no) => ({ no, rows: createBotTicket() })));
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
    // Bot tự kinh như người chơi: ván có vé thật thì bot "dò chậm" một nhịp gọi (người thật đủ hàng cùng lúc luôn kinh
    // kịp). Lúc chốt, API chia quỹ cho cả người thật lẫn bot kinh đúng; phần của bot không vào ví nào.
    const late = round.tickets.size > 0;
    for (const [botId, tickets] of round.botTickets) {
      if (round.botClaims.some((claim) => claim.botId === botId)) continue;
      let won = round.botSeen.get(botId) || null;
      for (const ticket of won ? [] : tickets) {
        const row = ticket.rows.findIndex((_, index) => complete(ticket.rows, index, round.calledSet));
        if (row >= 0) { won = { botId, ticket: ticket.no, row, at: round.called.length }; break; }
      }
      if (!won) continue;
      if (late && won.at === round.called.length) round.botSeen.set(botId, won);
      else round.botClaims.push({ botId, ticket: won.ticket, row: won.row });
    }
    if (round.botClaims.length) {
      for (const { botId } of round.botClaims) this.botShout(botId);
      round.phase = 'claiming';
      round.nextCallAt = null;
      round.endsAt = this.now() + this.rules.claimWindowMs;
      this.broadcastState();
      this.schedule(this.rules.claimWindowMs, () => this.finish());
      return;
    }
    round.nextCallAt = this.now() + this.rules.callMs;
    round.endsAt = round.nextCallAt;
    this.broadcastState();
    this.schedule(this.rules.callMs, () => this.callNext());
  }

  // Người đang "đợi": hàng còn thiếu đúng 1 số. Một người đợi nhiều hàng (cùng vé hoặc hai vé) thì có một mục cho mỗi
  // số đang đợi (không trùng số), client gộp theo tên: "An đợi 5, 12". Tối đa 8 mục (giới hạn protocol).
  waitingList() {
    const round = this.round;
    const list = [];
    for (const [accountId, tickets] of [...round.tickets, ...round.botTickets]) {
      const missing = new Set();
      for (const { rows } of tickets) {
        for (const row of rows) {
          const left = row.filter((number) => number && !round.calledSet.has(number));
          if (left.length === 1) missing.add(left[0]);
        }
      }
      const displayName = missing.size ? this.nameOf(accountId) : null;
      for (const number of [...missing].sort((a, b) => a - b)) {
        if (list.length >= 8) return list;
        list.push({ displayName, number });
      }
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

  // Bot hô "Kinh!" trong chat như người thật.
  botShout(botId) {
    const bot = this.room.participants?.get(botId);
    if (!bot?.bot || !this.room.botSpeak) return;
    this.room.botSpeak(bot, KINH_LINES[this.random(KINH_LINES.length)]);
  }

  async finish() {
    const round = this.round;
    if (!this.running || !['calling', 'claiming'].includes(round.phase)) return;
    round.phase = 'settling';
    let settled = null;
    if (!round.tickets.size) {
      // Ván toàn bot: không có xu thật, chỉ tính phần chia để hiện kết quả.
      const prize = Math.floor((this.ticketCount() * this.rules.ticketPrice * (100 - (this.rules.houseCutPercent ?? 10))) / 100);
      settled = round.botClaims.length
        ? { ok: true, winners: [], share: Math.floor(prize / round.botClaims.length), results: [] }
        : { ok: true, void: true, winners: [], share: 0, results: [] };
    } else {
      for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled?.ok; attempt += 1) {
        // Vé bot góp quỹ như vé thật (hệ thống bù phần xu đó); bot kinh được chia phần nhưng phần đó không vào ví ai.
        settled = this.settleFn ? await this.settleFn({
          roundId: round.id, called: round.called, claims: round.claims,
          botWinners: Math.min(20, round.botClaims.length), botTickets: Math.min(1_000, this.botTicketCount()),
        }) : null;
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
    const botWinners = settled?.ok && !settled.void
      ? round.botClaims.slice(0, Math.max(0, 20 - realWinners.length)).map((item) => ({ displayName: this.nameOf(item.botId), share: settled.share || 0 }))
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
      // Quỹ gồm cả vé bot (vé bot góp quỹ như vé thật, hệ thống bù phần xu đó).
      pool: tickets * this.rules.ticketPrice,
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
    this.revision += 1;
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
    return this.round?.names?.[accountId] || 'Người chơi';
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
