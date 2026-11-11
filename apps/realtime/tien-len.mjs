// Tiến lên (phòng tienlen, bàn 2–4 người). Máy giữ phòng chia bài và làm trọng tài theo luật @chanh-dien/tien-len; ví xu
// do API giữ. Không giữ cọc: ví phải có ít nhất 10 lần mức cược mới được ngồi (API kiểm tra lúc vào bàn và đầu mỗi ván).
//   waiting (chờ người) → starting (đủ 2 người, đếm ngược; đủ 4 thì nhanh hơn) → ghi người thật vào ván (API, ai không còn
//   đủ xu thì đứng dậy) → chia bài → playing (lượt turnMs; hết giờ tự bỏ / tự đánh lá nhỏ nhất) → result (API trừ / cộng
//   theo các khoản, ai thiếu xu thì trả hết số có, phế phần thắng) → ván mới (người bấm rời / mất kết nối thì đứng dậy) …
// - Bài trên tay chỉ gửi cho chủ bài; người khác chỉ thấy số lá. Hết ván (result) mới lật bài còn lại của mọi người
//   (result.hands; tới trắng thì đủ 13 lá của người thắng). Bot chỉ được đọc bài của chính nó (botChoice).
// - Bot vào bàn như người thật (trang không nhắc gì tới bot, tin gửi trình duyệt không có cờ bot): người thật ngồi xuống
//   xong chờ botFill.firstDelayMs mới có bot đầu tiên (nhường chỗ cho người), rồi lần lượt cách nhau botFill.delayMs cho đủ
//   bàn. Bàn mức trên botFill.maxStake không có bot. tienlen.open { bots: false } (trang không dùng) mở bàn không bot. Vài bàn bot ngồi sẵn trong sảnh cho người bấm "Vào nhanh". Bàn không còn người
//   thật thì giải tán (bàn bot trong sảnh thì hết hạn mới giải tán). Ván chỉ chia khi có ít nhất một người thật.
// - Hết giờ: hệ thống đánh hộ (bỏ lượt / đánh lá nhỏ nhất), nước đó gắn cờ auto; lỡ 2 lượt liên tiếp mới chuyển hẳn sang tự
//   đánh (lượt ngắn afkTurnMs) cho tới khi người chơi bấm "Tôi đã quay lại" (tienlen.back) hoặc tự đánh. Lỡ idleKickMissed
//   lượt liên tiếp thì hết ván phải đứng dậy.
// - Đấu với bot: hệ thống là bên đối ứng (API trả / giữ phần của bot).
// - Rút máy (deploy) / phòng đóng: ván đang chơi bị hủy (chưa ai bị trừ xu vì chỉ trừ lúc chốt).
import { createHash, randomInt } from 'node:crypto';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { botChoice, deal, settleCoins, TienLenRound, tienLenMinCoins } from '@chanh-dien/tien-len';

const SEATS = 4;
const TICK_MS = 250;
const STATE_THROTTLE_MS = 300;
const SETTLE_ATTEMPTS = 3;
const LOBBY_SIZE = 30;
// Bot rời bàn sau một ván với khả năng này (cho bàn đổi người như thật).
const BOT_LEAVE_PERCENT = 15;
const between = (random, [low, high]) => low + random(Math.max(1, high - low + 1));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const ERRORS = {
  GAME_OVER: 'Ván đã xong',
  NOT_IN_GAME: 'Bạn không chơi ván này',
  NOT_YOUR_CARDS: 'Lá bài không có trên tay bạn',
  INVALID_COMBO: 'Các lá này không thành bộ',
  NOT_YOUR_TURN: 'Chưa tới lượt bạn',
  MUST_INCLUDE: 'Nước đầu phải đánh kèm lá nhỏ nhất',
  TOO_SMALL: 'Bộ này không đè được bài trên bàn',
  MUST_LEAD: 'Bạn đang mở vòng, phải đánh',
};

export class TienLenTable {
  // check({ accountId, stake }) → { ok, coins, need } | { ok: false, code, coins?, need? } | null (lỗi mạng)
  // begin({ accountId, matchId, stake, mode }) → { ok, coins } | { ok: false, code } | null
  // settle({ matchId, transfers: [{ from, to, coins }], bots }) → { ok, results: [{ accountId, net, cut, coins, … }] } | null
  constructor({ room, rules, check, begin, settle, now = Date.now, random = randomInt }) {
    this.kind = 'tienlen';
    this.room = room;
    this.rules = rules;
    this.check = check || null;
    this.begin = begin || null;
    this.settle = settle || null;
    this.now = now;
    this.random = random;
    this.tables = new Map();
    this.serial = 0;
    this.running = false;
    this.timer = null;
    this.stateTimer = null;
    this.nextBotTableAt = 0;
    // Bàn không lưu vào snapshot phòng (ván dở được hoàn cọc khi rút máy), nên revision đứng yên.
    this.revision = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.rules.tickMs || TICK_MS);
    this.timer.unref?.();
  }

  // Phòng không còn người thật: bỏ ván dở (chưa ai bị trừ xu), giải tán mọi bàn.
  stop() {
    this.running = false;
    clearInterval(this.timer);
    clearTimeout(this.stateTimer);
    this.timer = null;
    this.stateTimer = null;
    for (const table of [...this.tables.values()]) this.dissolve(table, false);
  }

  // Rút máy: chờ ván đang chốt tiền xong rồi dừng (ván đang chơi bị bỏ, không ai mất xu).
  async quiesce(limitMs = 10_000) {
    const settling = [...this.tables.values()].map((table) => table.settling).filter(Boolean);
    await Promise.race([Promise.allSettled(settling), sleep(limitMs)]);
    this.stop();
  }

  // ---- Tra cứu ----
  seatOf(participant) {
    if (!participant?.accountId) return null;
    for (const table of this.tables.values()) {
      const index = table.seats.findIndex((seat) => seat && !seat.bot && seat.accountId === participant.accountId);
      if (index >= 0) return { table, index, seat: table.seats[index] };
    }
    return null;
  }

  hasBotBet(participantId) {
    for (const table of this.tables.values()) if (table.seats.some((seat) => seat?.bot && seat.pid === participantId)) return true;
    return false;
  }

  idleBots() {
    return [...this.room.participants.values()].filter((participant) => participant.bot && !this.hasBotBet(participant.id));
  }

  humansOf(table) {
    return table.seats.filter((seat) => seat && !seat.bot);
  }

  seatedOf(table) {
    return table.seats.filter(Boolean).length;
  }

  connected(seat) {
    if (seat.bot) return Boolean(this.room.participants.get(seat.pid));
    for (const participant of this.room.participants.values()) {
      if (participant.accountId === seat.accountId && participant.connected) return true;
    }
    return false;
  }

  seatFor(participant, bot = false) {
    const level = Number.isSafeInteger(participant.level) && participant.level >= 1 && participant.level <= 99 ? participant.level : undefined;
    return {
      pid: participant.id,
      accountId: bot ? null : participant.accountId,
      bot,
      name: participant.displayName,
      ...(participant.skin ? { skin: participant.skin } : {}),
      ...(level ? { level } : {}),
      ready: false,
      coins: undefined,
      before: undefined,
      leaving: false,
      // Số lượt liên tiếp hệ thống phải đánh hộ.
      missed: 0,
    };
  }

  newId(prefix = 'tl') {
    this.serial += 1;
    const suffix = randomInt(36 ** 4).toString(36).padStart(4, '0');
    return `${prefix}-${this.room.id}-${this.room.epoch}-${this.serial}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 79);
  }

  key(accountId, purpose) {
    return createHash('sha256').update(`${accountId}:${purpose}`).digest('base64url').slice(0, 40);
  }

  // ---- Thao tác của người chơi ----
  guard(participant) {
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để chơi bằng xu' };
    if (!this.running) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn đang tạm nghỉ, thử lại sau' };
    return null;
  }

  // bots: người tạo bàn cho bot vào (bàn mức trên botFill.maxStake thì không bao giờ có bot).
  createTable(stake, mode, { botHosted = false, bots = true } = {}) {
    const table = {
      id: this.newId(), stake, mode, createdAt: this.now(), phase: 'waiting', seats: new Array(SEATS).fill(null),
      game: 0, matchId: null, round: null, players: [], deadline: 0, botActAt: 0, lastWinner: null, beginning: false,
      bots: Boolean(bots), nextBotAt: 0, botHosted, expiresAt: 0, result: null, settling: null,
    };
    this.tables.set(table.id, table);
    return table;
  }

  botsAllowed(table) {
    return table.bots && table.stake <= this.rules.botFill.maxStake;
  }

  sit(table, seat) {
    const index = table.seats.findIndex((item) => item === null);
    if (index < 0) return -1;
    table.seats[index] = seat;
    // Người thật vừa ngồi: chờ firstDelayMs mới cho bot vào (để người khác kịp vào); bot vừa vào: bot kế cách delayMs.
    table.nextBotAt = this.now() + between(this.random, seat.bot ? this.rules.botFill.delayMs : this.rules.botFill.firstDelayMs);
    return index;
  }

  // Số xu trong ví (hỏi API). Trả { ok, coins } hoặc lỗi để báo người chơi.
  async wallet(participant, stake) {
    let result = null;
    try { result = this.check ? await this.check({ accountId: participant.accountId, stake }) : null; } catch {}
    if (result && Number.isSafeInteger(result.coins)) return { ok: true, coins: result.coins };
    return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Chưa xem được ví xu, thử lại sau' };
  }

  // Không đủ xu: lúc vào bàn thì báo cần bao nhiêu; đang ngồi (hết ván / đầu ván) thì báo còn bao nhiêu, thiếu bao nhiêu.
  poor(stake, coins = null) {
    const need = tienLenMinCoins(stake).toLocaleString('vi-VN');
    const message = Number.isSafeInteger(coins)
      ? `Bạn còn ${coins.toLocaleString('vi-VN')} xu, không đủ ${need} xu (10 lần mức cược) để chơi tiếp bàn ${stake.toLocaleString('vi-VN')} xu nên đã rời bàn`
      : `Cần ít nhất ${need} xu (10 lần mức cược) để ngồi bàn này`;
    return { ok: false, code: 'INSUFFICIENT_COINS', message };
  }

  async open(participant, { stake, mode, bots = true }) {
    const blocked = this.guard(participant);
    if (blocked) return blocked;
    if (this.seatOf(participant)) return { ok: false, code: 'BUSY', message: 'Bạn đang ngồi ở một bàn rồi' };
    if (!this.rules.stakes.includes(stake) || !this.rules.modes.includes(mode)) return { ok: false, code: 'INVALID', message: 'Mức cược / kiểu không có ở bàn này' };
    const wallet = await this.wallet(participant, stake);
    if (!wallet.ok) return wallet;
    if (wallet.coins < tienLenMinCoins(stake)) return this.poor(stake);
    if (this.seatOf(participant)) return { ok: false, code: 'BUSY', message: 'Bạn đang ngồi ở một bàn rồi' };
    const table = this.createTable(stake, mode, { bots: bots !== false });
    this.sit(table, this.seatFor(participant));
    this.sendTable(table);
    this.scheduleState();
    return { ok: true };
  }

  joinable(table) {
    return ['waiting', 'starting', 'result'].includes(table.phase) && !table.beginning && table.seats.some((seat) => seat === null);
  }

  async join(participant, { tableId }, coins = null) {
    const blocked = this.guard(participant);
    if (blocked) return blocked;
    const current = this.seatOf(participant);
    if (current?.table.id === tableId) {
      this.sendTable(current.table);
      return { ok: true };
    }
    if (current) return { ok: false, code: 'BUSY', message: 'Bạn đang ngồi ở một bàn khác' };
    let table = this.tables.get(tableId);
    if (!table || !this.joinable(table)) return { ok: false, code: 'TABLE_TAKEN', message: 'Bàn đã đủ người hoặc đang chơi' };
    if (coins === null) {
      const wallet = await this.wallet(participant, table.stake);
      if (!wallet.ok) return wallet;
      coins = wallet.coins;
    }
    if (coins < tienLenMinCoins(table.stake)) return this.poor(table.stake);
    // Trong lúc hỏi ví, bàn có thể vừa đủ người / đã chia bài.
    table = this.tables.get(tableId);
    if (!table || !this.joinable(table)) return { ok: false, code: 'TABLE_TAKEN', message: 'Bàn đã đủ người hoặc đang chơi' };
    if (this.seatOf(participant)) return { ok: false, code: 'BUSY', message: 'Bạn đang ngồi ở một bàn khác' };
    this.sit(table, this.seatFor(participant));
    this.sendTable(table);
    this.scheduleState();
    return { ok: true };
  }

  // Vào nhanh: bàn còn chỗ mình đủ xu ngồi (lọc theo mức cược / kiểu nếu có), ưu tiên bàn có người thật, đông người;
  // không có thì mở bàn.
  async find(participant, { stake, mode }) {
    const blocked = this.guard(participant);
    if (blocked) return blocked;
    const current = this.seatOf(participant);
    if (current) {
      this.sendTable(current.table);
      return { ok: true };
    }
    const wallet = await this.wallet(participant, stake ?? this.rules.stakes[0]);
    if (!wallet.ok) return wallet;
    const candidates = [...this.tables.values()]
      .filter((table) => this.joinable(table) && (stake === undefined || table.stake === stake) && (mode === undefined || table.mode === mode))
      .filter((table) => tienLenMinCoins(table.stake) <= wallet.coins)
      .sort((a, b) => this.humansOf(b).length - this.humansOf(a).length || this.seatedOf(b) - this.seatedOf(a) || a.createdAt - b.createdAt);
    if (candidates.length) return this.join(participant, { tableId: candidates[0].id }, wallet.coins);
    return this.open(participant, { stake: stake ?? this.rules.stakes[1], mode: mode ?? this.rules.modes[0], bots: true });
  }

  // Rời bàn: đang chơi thì rời sau ván (bot đánh hộ cho hết ván), không thì đứng dậy ngay.
  leave(participant) {
    const found = this.seatOf(participant);
    if (!found) return { ok: true };
    const { table, index, seat } = found;
    if (table.phase === 'playing' || table.beginning) {
      seat.leaving = !seat.leaving;
      this.sendTable(table);
      return { ok: true };
    }
    this.standUp(table, index);
    return { ok: true };
  }

  standUp(table, index) {
    const seat = table.seats[index];
    if (!seat) return;
    table.seats[index] = null;
    if (!seat.bot) this.sendToAccount(seat.accountId, this.view(table, index, seat, true));
    if (!this.humansOf(table).length) this.dissolve(table);
    else this.sendTable(table);
    this.scheduleState();
  }

  dissolve(table, broadcast = true) {
    if (!this.tables.has(table.id)) return;
    for (const [index, seat] of table.seats.entries()) {
      if (seat && !seat.bot) this.sendToAccount(seat.accountId, this.view(table, index, seat, true));
    }
    this.tables.delete(table.id);
    if (broadcast) this.scheduleState();
  }

  // Người rớt kết nối / rời phòng: chưa vào ván thì đứng dậy; đang chơi thì đánh hộ (lượt ngắn) tới hết ván — vào lại
  // kịp thì chơi tiếp, hết ván mà vẫn mất kết nối thì đứng dậy (nextGame).
  participantAway(participantId) {
    for (const table of [...this.tables.values()]) {
      const index = table.seats.findIndex((seat) => seat && seat.pid === participantId);
      if (index < 0) continue;
      const seat = table.seats[index];
      if (table.phase === 'playing' || table.beginning || table.phase === 'result') this.sendTable(table);
      else if (!this.connected(seat)) this.standUp(table, index);
    }
  }

  play(participant, { tableId, cards }) {
    const found = this.seatOf(participant);
    if (!found || found.table.id !== tableId) return { ok: false, code: 'NOT_IN_GAME', message: 'Bạn không ngồi bàn này' };
    const { table, index, seat } = found;
    if (table.phase !== 'playing' || !table.round) return { ok: false, code: 'GAME_OVER', message: 'Ván chưa bắt đầu hoặc đã xong' };
    const result = table.round.play(table.players.indexOf(index), cards);
    if (!result.ok) return { ok: false, code: result.code, message: ERRORS[result.code] || 'Chưa đánh được' };
    seat.missed = 0;
    this.afterMove(table);
    return { ok: true };
  }

  pass(participant, { tableId }) {
    const found = this.seatOf(participant);
    if (!found || found.table.id !== tableId) return { ok: false, code: 'NOT_IN_GAME', message: 'Bạn không ngồi bàn này' };
    const { table, index, seat } = found;
    if (table.phase !== 'playing' || !table.round) return { ok: false, code: 'GAME_OVER', message: 'Ván chưa bắt đầu hoặc đã xong' };
    const result = table.round.pass(table.players.indexOf(index));
    if (!result.ok) return { ok: false, code: result.code, message: ERRORS[result.code] || 'Chưa bỏ lượt được' };
    seat.missed = 0;
    this.afterMove(table);
    return { ok: true };
  }

  // "Tôi đã quay lại": thôi tự đánh. Đang tới lượt mình mà lượt đang ngắn (do tự đánh) thì được đủ thời gian lượt.
  back(participant, { tableId }) {
    const found = this.seatOf(participant);
    if (!found || found.table.id !== tableId) return { ok: false, code: 'NOT_IN_GAME', message: 'Bạn không ngồi bàn này' };
    const { table, index, seat } = found;
    if (!seat.missed) return { ok: true };
    seat.missed = 0;
    if (table.phase === 'playing' && table.round && table.players[table.round.turn] === index) {
      table.deadline = Math.max(table.deadline, this.now() + this.rules.turnMs);
    }
    this.sendTable(table);
    return { ok: true };
  }

  // ---- Nhịp bàn ----
  tick() {
    if (!this.running) return;
    const now = this.now();
    for (const table of [...this.tables.values()]) {
      if (table.beginning || table.settling) continue;
      if (table.phase === 'waiting' || table.phase === 'starting') this.tickWaiting(table, now);
      else if (table.phase === 'playing') this.tickPlaying(table, now);
      else if (table.phase === 'result' && now >= table.deadline) this.nextGame(table);
    }
    this.tickBotTables(now);
  }

  tickWaiting(table, now) {
    const humans = this.humansOf(table).length;
    if (!humans) {
      if (!table.botHosted || table.game > 0 || now >= table.expiresAt) this.dissolve(table);
      return;
    }
    this.fillBots(table, now);
    const seated = this.seatedOf(table);
    if (seated < 2) {
      if (table.phase === 'starting') {
        table.phase = 'waiting';
        this.sendTable(table);
        this.scheduleState();
      }
      return;
    }
    const wait = seated === SEATS ? this.rules.fullStartMs : this.rules.startMs;
    if (table.phase === 'waiting') {
      table.phase = 'starting';
      table.deadline = now + wait;
      this.sendTable(table);
      this.scheduleState();
    } else if (seated === SEATS && table.deadline > now + wait) {
      table.deadline = now + wait;
      this.sendTable(table);
    } else if (now >= table.deadline) this.beginGame(table);
  }

  fillBots(table, now) {
    if (!this.botsAllowed(table) || this.seatedOf(table) >= SEATS || now < table.nextBotAt) return;
    const idle = this.idleBots();
    if (!idle.length) return;
    this.sit(table, this.seatFor(idle[this.random(idle.length)], true));
    this.sendTable(table);
    this.scheduleState();
  }

  // Ghi từng người thật vào ván (API kiểm tra còn đủ xu ngồi bàn) rồi chia bài. Ai không còn đủ thì đứng dậy; còn dưới
  // 2 người thì quay lại chờ.
  async beginGame(table) {
    table.beginning = true;
    const matchId = this.newId();
    const humans = table.seats.map((seat, index) => (seat && !seat.bot ? index : -1)).filter((index) => index >= 0);
    const results = await Promise.all(humans.map((index) => this.register(table, matchId, table.seats[index])));
    table.beginning = false;
    if (!this.tables.has(table.id)) return;
    table.matchId = matchId;
    humans.forEach((index, at) => {
      const seat = table.seats[index];
      if (!seat || results[at].ok) return;
      this.sendToAccount(seat.accountId, { v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.room.epoch, code: results[at].code, message: results[at].message });
      table.seats[index] = null;
      this.sendToAccount(seat.accountId, this.view(table, index, seat, true));
    });
    if (this.seatedOf(table) < 2 || !this.humansOf(table).some((seat) => seat.ready)) {
      for (const seat of table.seats) if (seat) seat.ready = false;
      table.phase = 'waiting';
      if (!this.humansOf(table).length) this.dissolve(table);
      else this.sendTable(table);
      this.scheduleState();
      return;
    }
    this.deal(table);
  }

  async register(table, matchId, seat) {
    if (!this.begin) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn chưa nối được ví xu, thử lại sau' };
    let result = null;
    try {
      result = await this.begin({ accountId: seat.accountId, matchId, stake: table.stake, mode: table.mode });
    } catch {}
    if (result?.ok) {
      seat.ready = true;
      seat.coins = result.coins;
      seat.before = result.coins;
      return { ok: true };
    }
    if (result?.code === 'INSUFFICIENT_COINS') return this.poor(table.stake, Number.isSafeInteger(result.coins) ? result.coins : null);
    return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Chưa vào được ván, thử lại sau' };
  }

  deal(table) {
    const players = table.seats.map((seat, index) => (seat ? index : -1)).filter((index) => index >= 0);
    const hands = deal(players.length, this.random);
    let leader = table.lastWinner === null ? -1 : players.indexOf(table.lastWinner);
    let mustInclude = null;
    if (leader < 0) {
      // Ván đầu (hoặc người nhất ván trước đã rời): người cầm lá nhỏ nhất đi trước, phải đánh kèm lá đó.
      mustInclude = Math.min(...hands.flat());
      leader = hands.findIndex((hand) => hand.includes(mustInclude));
    }
    table.players = players;
    table.round = new TienLenRound({ hands, mode: table.mode, leader, mustInclude });
    table.game += 1;
    table.phase = 'playing';
    table.result = null;
    this.scheduleState();
    if (table.round.over) this.finishGame(table);
    else this.startTurn(table);
  }

  startTurn(table) {
    const seat = table.seats[table.players[table.round.turn]];
    // Lỡ 2 lượt liên tiếp / đã bấm rời / mất kết nối: tự đánh, lượt ngắn.
    const quick = !seat.bot && (seat.missed >= 2 || seat.leaving || !this.connected(seat));
    table.deadline = this.now() + (quick ? this.rules.afkTurnMs : this.rules.turnMs);
    table.botActAt = seat.bot ? this.now() + between(this.random, this.rules.botActMs) : 0;
    this.sendTable(table);
  }

  tickPlaying(table, now) {
    const { round } = table;
    const turnSeat = table.seats[table.players[round.turn]];
    if (turnSeat.bot && now >= table.botActAt) {
      this.botMove(table);
      return;
    }
    if (now < table.deadline) return;
    // Hết giờ: hệ thống đánh hộ (bỏ lượt / đánh lá nhỏ nhất), gắn cờ để trang báo "Hệ thống vừa đánh hộ bạn".
    if (!turnSeat.bot) turnSeat.missed += 1;
    const result = round.auto(round.turn);
    if (result.ok && round.last) round.last.auto = true;
    this.afterMove(table);
  }

  botMove(table) {
    const { round } = table;
    const seat = round.turn;
    const opponentMin = Math.min(...round.seats().filter((other) => other !== seat && round.active(other)).map((other) => round.hands[other].length));
    const cards = botChoice({
      hand: round.hands[seat], top: round.top?.cards || null, mustInclude: round.mustInclude,
      opponentMin, random: () => this.random(1_000_000) / 1_000_000,
    });
    const result = cards ? round.play(seat, cards) : round.pass(seat);
    if (!result.ok) round.auto(seat);
    this.afterMove(table);
  }

  afterMove(table) {
    if (table.round.over) this.finishGame(table);
    else this.startTurn(table);
  }

  // Hết ván: tính tiền theo luật, gửi API chốt (cọc ± thắng thua), hiện kết quả resultMs rồi sang ván mới.
  finishGame(table) {
    const { round, players } = table;
    const outcome = round.results();
    // Người thật trả tối đa bằng số xu đầu ván (API giới hạn lại theo số dư lúc chốt); bot không giới hạn.
    const caps = players.map((index) => (table.seats[index]?.bot ? undefined : table.seats[index]?.coins));
    const { nets, transfers } = settleCoins(outcome.transfers, { players: players.length, stake: table.stake, caps });
    const bySeat = (values) => {
      const list = new Array(SEATS).fill(null);
      players.forEach((index, player) => { list[index] = values[player]; });
      return list;
    };
    table.result = {
      ...(outcome.white ? { white: outcome.white } : {}),
      ranks: bySeat(outcome.ranks),
      nets: bySeat(nets),
      lines: transfers.slice(0, 48).map((item) => ({ from: players[item.from], to: players[item.to], units: item.units, coins: item.coins, reason: item.reason })),
      // Hết ván mới lật bài còn lại của mọi người (tới trắng: đủ 13 lá của người thắng).
      hands: bySeat(round.hands.map((hand) => [...hand])),
      cong: (outcome.cong || []).map((player) => players[player]),
    };
    table.lastWinner = players[outcome.winner];
    table.phase = 'result';
    table.deadline = this.now() + this.rules.resultMs;
    // Các khoản gửi API: người thật theo accountId, bot là null (hệ thống trả / nhận).
    const accountOf = (player) => {
      const seat = table.seats[players[player]];
      return seat && !seat.bot ? seat.accountId : null;
    };
    const lines = transfers.filter((item) => item.coins > 0 && (accountOf(item.from) || accountOf(item.to)))
      .map((item) => ({ from: accountOf(item.from), to: accountOf(item.to), coins: item.coins }));
    const humans = players.filter((index) => table.seats[index] && !table.seats[index].bot && table.seats[index].ready);
    const bots = players.some((index) => table.seats[index]?.bot);
    this.sendTable(table);
    this.scheduleState();
    if (!humans.length) return;
    table.settling = (async () => {
      await null;
      const settled = await this.settleWithRetry(table, table.matchId, lines, bots);
      table.settling = null;
      for (const item of settled?.results || []) {
        const index = table.seats.findIndex((seat) => seat && !seat.bot && seat.accountId === item.accountId);
        if (index < 0) continue;
        table.seats[index].coins = item.coins;
        table.seats[index].paid = { net: item.net, cut: item.cut || 0 };
        // Số thực cộng / trừ (trước phế), có thể ít hơn khi có người thiếu xu.
        if (table.result && Number.isSafeInteger(item.received) && Number.isSafeInteger(item.paid)) table.result.nets[index] = item.received - item.paid;
      }
      for (const seat of table.seats) if (seat) seat.ready = false;
      // API chốt chậm hơn màn kết quả: vẫn cho xem kết quả (có số xu) thêm một chút.
      table.deadline = Math.max(table.deadline, this.now() + Math.min(2_000, this.rules.resultMs));
      this.sendTable(table);
    })();
  }

  // Gọi API chốt, thử lại vài lần; vẫn lỗi thì thử tiếp ở nền (API trả kết quả cũ nếu đã chốt, không trừ / cộng hai lần).
  async settleWithRetry(table, matchId, transfers, bots) {
    if (!this.settle) return null;
    const input = { matchId, transfers, bots };
    let settled = null;
    for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled?.ok; attempt += 1) {
      try { settled = await this.settle(input); } catch { settled = null; }
      if (!settled?.ok && attempt + 1 < SETTLE_ATTEMPTS) await sleep(400);
    }
    if (!settled?.ok) this.retrySettle(input);
    return settled?.ok ? settled : null;
  }

  retrySettle(input, attempt = 0) {
    const waits = [2_000, 5_000, 15_000, 30_000, 60_000];
    if (attempt >= waits.length) return;
    const timer = setTimeout(async () => {
      let result = null;
      try { result = await this.settle(input); } catch {}
      if (!result?.ok) this.retrySettle(input, attempt + 1);
    }, waits[attempt]);
    timer.unref?.();
  }

  // Sau màn kết quả: người bấm rời / mất kết nối / không còn đủ xu / treo máy lâu đứng dậy (báo lý do trước rồi mới đưa ra),
  // vài bot rời; còn người thật thì chờ ván mới.
  nextGame(table) {
    table.round = null;
    table.result = null;
    table.players = [];
    table.phase = 'waiting';
    for (const [index, seat] of table.seats.entries()) {
      if (!seat) continue;
      seat.paid = undefined;
      const idle = !seat.bot && seat.missed >= (this.rules.idleKickMissed || Infinity);
      // Số dư sau khi chốt ván (API trả) dưới 10 lần mức cược: không chơi tiếp được.
      const broke = !seat.bot && Number.isSafeInteger(seat.coins) && seat.coins < tienLenMinCoins(table.stake);
      const gone = seat.bot ? !this.room.participants.get(seat.pid) || this.random(100) < BOT_LEAVE_PERCENT : seat.leaving || idle || broke || !this.connected(seat);
      if (broke && this.connected(seat)) {
        const { code, message } = this.poor(table.stake, seat.coins);
        this.sendToAccount(seat.accountId, { v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.room.epoch, code, message });
      } else if (idle && this.connected(seat)) {
        this.sendToAccount(seat.accountId, { v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.room.epoch, code: 'IDLE_KICKED', message: 'Bạn đã rời bàn vì nhiều lượt liền không thao tác' });
      }
      if (gone) {
        table.seats[index] = null;
        if (!seat.bot) this.sendToAccount(seat.accountId, this.view(table, index, seat, true));
      }
    }
    if (!this.humansOf(table).length) {
      this.dissolve(table);
      return;
    }
    if (table.lastWinner !== null && !table.seats[table.lastWinner]) table.lastWinner = null;
    table.nextBotAt = this.now() + between(this.random, this.rules.botFill.delayMs);
    this.sendTable(table);
    this.scheduleState();
  }

  // Bàn bot ngồi sẵn trong sảnh: giữ trong khoảng botTables, mỗi bàn 1–3 bot, mức cược thấp / vừa.
  tickBotTables(now) {
    if (now < this.nextBotTableAt) return;
    this.nextBotTableAt = now + between(this.random, [4_000, 12_000]);
    const botTables = [...this.tables.values()].filter((table) => table.botHosted && !this.humansOf(table).length);
    const [low, high] = this.rules.botTables;
    if (botTables.length >= high || (botTables.length >= low && this.random(2))) return;
    const idle = this.idleBots();
    if (idle.length < 3) return;
    const stakes = this.rules.stakes.filter((stake) => stake <= this.rules.botFill.maxStake);
    const weights = stakes.map((_, index) => Math.max(1, 5 - index));
    let roll = this.random(weights.reduce((sum, value) => sum + value, 0));
    const stake = stakes.find((_, index) => (roll -= weights[index]) < 0) || stakes[0];
    const table = this.createTable(stake, this.rules.modes[this.random(this.rules.modes.length)], { botHosted: true, bots: true });
    table.expiresAt = now + between(this.random, this.rules.botTableMs);
    const count = 1 + this.random(3);
    for (let added = 0; added < count; added += 1) {
      const pool = this.idleBots();
      if (!pool.length) break;
      this.sit(table, this.seatFor(pool[this.random(pool.length)], true));
    }
    this.scheduleState();
  }

  // ---- Gửi trạng thái ----
  view(table, index, seat, closed = false) {
    const { round } = table;
    const playing = table.phase === 'playing' && round;
    const playerOf = (seatIndex) => (round ? table.players.indexOf(seatIndex) : -1);
    const message = {
      v: PROTOCOL_VERSION,
      type: 'tienlen.table',
      epoch: this.room.epoch,
      tableId: table.id,
      stake: table.stake,
      mode: table.mode,
      phase: closed ? 'closed' : table.phase,
      game: table.game,
      seat: index,
      minCoins: tienLenMinCoins(table.stake),
      players: table.seats.map((item, seatIndex) => {
        if (!item) return null;
        const player = playerOf(seatIndex);
        const entry = { displayName: item.name, cards: player >= 0 ? round.hands[player].length : 0 };
        if (item.skin) entry.skin = item.skin;
        if (item.level) entry.level = item.level;
        if (playing && player >= 0 && round.top && round.passed.has(player)) entry.passed = true;
        if (player >= 0 && round.order.includes(player)) entry.rank = round.order.indexOf(player) + 1;
        if (table.result?.ranks[seatIndex]) entry.rank = table.result.ranks[seatIndex];
        if ((player >= 0 && round.out[player]) || table.result?.cong.includes(seatIndex)) entry.cong = true;
        if (!item.bot && !this.connected(item)) entry.away = true;
        if (!item.bot && item.missed > 0) entry.missed = Math.min(item.missed, 99);
        if (item.leaving) entry.leaving = true;
        return entry;
      }),
    };
    if (closed) return message;
    if (['starting', 'playing', 'result'].includes(table.phase) && table.deadline) message.deadline = table.deadline;
    const mine = playerOf(index);
    if (round && mine >= 0) message.hand = [...round.hands[mine]];
    if (playing) {
      message.turn = table.players[round.turn];
      if (round.top) message.top = { seat: table.players[round.top.seat], cards: [...round.top.cards] };
      if (round.turn === mine) {
        message.lead = !round.top;
        if (round.mustInclude !== null) message.mustInclude = round.mustInclude;
      }
    }
    if (round?.last) {
      const { last } = round;
      message.last = {
        seat: table.players[last.seat],
        action: last.action,
        ...(last.cards ? { cards: [...last.cards] } : {}),
        ...(last.action === 'chop' ? { units: last.units, victim: table.players[last.victim] } : {}),
        ...(last.auto ? { auto: true } : {}),
      };
    }
    if (table.result) {
      const { ranks, nets, lines, white, hands } = table.result;
      message.result = { ranks, nets, lines, hands, ...(white ? { white } : {}) };
      if (seat.paid) Object.assign(message.result, { net: seat.paid.net, cut: seat.paid.cut });
      if (seat.paid && Number.isSafeInteger(seat.before) && Number.isSafeInteger(seat.coins)) Object.assign(message.result, { before: seat.before, after: seat.coins });
    }
    if (Number.isSafeInteger(seat.coins) && seat.coins >= 0) message.coins = seat.coins;
    return message;
  }

  sendTable(table) {
    table.seats.forEach((seat, index) => {
      if (seat && !seat.bot) this.sendToAccount(seat.accountId, this.view(table, index, seat));
    });
  }

  stateMessage() {
    const order = { starting: 0, waiting: 1, result: 2, playing: 3 };
    const tables = [...this.tables.values()]
      .filter((table) => this.seatedOf(table))
      .sort((a, b) => order[a.phase] - order[b.phase] || this.humansOf(b).length - this.humansOf(a).length || b.createdAt - a.createdAt)
      .slice(0, LOBBY_SIZE)
      .map((table) => ({
        id: table.id,
        stake: table.stake,
        mode: table.mode,
        phase: table.phase,
        players: table.seats.filter(Boolean).map((seat) => ({ displayName: seat.name, ...(seat.skin ? { skin: seat.skin } : {}) })),
      }));
    const playing = [...this.tables.values()].filter((table) => table.phase === 'playing').length;
    return { v: PROTOCOL_VERSION, type: 'tienlen.lobby', epoch: this.room.epoch, tables, playing };
  }

  // Người vào lại giữa chừng: bàn mình đang ngồi.
  mineMessage(accountId) {
    if (!accountId) return null;
    for (const table of this.tables.values()) {
      const index = table.seats.findIndex((seat) => seat && !seat.bot && seat.accountId === accountId);
      if (index >= 0) return this.view(table, index, table.seats[index]);
    }
    return null;
  }

  broadcastState() {
    clearTimeout(this.stateTimer);
    this.stateTimer = null;
    this.room.broadcast(this.stateMessage());
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
}

// Gọi API nội bộ để giữ cọc / chốt ván. Lỗi mạng trả null.
export function tienLenBank(apiInternalUrl, key) {
  const call = (path) => (body) => fetch(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json().catch(() => null)).catch((error) => {
    console.warn(`Tiến lên: không gọi được API (${path}): ${error.message}`);
    return null;
  });
  return { check: call('/internal/games/tienlen/check'), begin: call('/internal/games/tienlen/begin'), settle: call('/internal/games/tienlen/settle') };
}
