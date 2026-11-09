// Oẳn Tù Tì cược (phòng oantuti, đấu 1–1). Máy giữ phòng làm trọng tài; tiền do API giữ:
//   mở bàn (trừ cọc) → có người nhận bàn (trừ cọc người đó) → ready → pick (5 giây) → reveal → … → done → đấu lại / đóng
// - Lựa chọn giữ kín ở server: client chỉ biết đối thủ "đã chọn" cho tới khi lượt được lật (cả hai đã chọn hoặc hết giờ).
// - Không chọn kịp thì thua lượt; cả hai không chọn thì hủy trận (hoàn cọc). Hòa thì đấu lượt mới, hòa maxRounds lượt
//   liền thì hoàn cọc.
// - Bàn của người thật không ai nhận sau botJoinMs thì một bot trong phòng vào đấu. Bot rút tay ngẫu nhiên đều
//   (crypto.randomInt) ngay khi lượt bắt đầu, trước khi người chơi chọn, nên không thể "nhìn tay" người chơi. Đấu với
//   bot thì hệ thống là bên đối ứng (API trả phần của bot khi người thắng, giữ cọc khi người thua).
// - Bot còn mở sẵn vài bàn trong sảnh và đấu với nhau (chỉ để sảnh sinh động, không đụng tới xu).
// - Rút máy (deploy) / phòng đóng: trận chưa chốt được hủy và hoàn cọc; máy chết giữa trận thì API tự hoàn sau RPS_STALE_MS.
import { createHash, randomInt } from 'node:crypto';
import { PROTOCOL_VERSION, RPS_CHOICES } from '@chanh-dien/protocol';

const STATE_THROTTLE_MS = 300;
const SETTLE_ATTEMPTS = 3;
const FEED_SIZE = 10;
const LOBBY_SIZE = 20;
// Nhận tay tới trễ một chút sau hạn (độ trễ mạng) vẫn tính.
const PICK_GRACE_MS = 300;
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const between = (random, [low, high]) => low + random(Math.max(1, high - low + 1));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const rpsOutcome = (a, b) => (a === b ? 'draw' : BEATS[a] === b ? 'a' : 'b');

export class RpsTable {
  // stake({ accountId, matchId, amount, key }) → { ok, coins } | { ok: false, code } | null (lỗi mạng)
  // settle({ matchId, winner, bot }) → { ok, results: [{ accountId, staked, payout, net, coins }] } | { ok: false } | null
  constructor({ room, rules, stake, settle, now = Date.now, random = randomInt }) {
    this.kind = 'rps';
    this.room = room;
    this.rules = rules;
    this.stakes = rules.stakes;
    this.stake = stake || null;
    this.settle = settle || null;
    this.now = now;
    this.random = random;
    this.matches = new Map();
    this.feed = [];
    this.serial = 0;
    this.running = false;
    this.botTimer = null;
    this.stateTimer = null;
    // Bàn không lưu gì vào snapshot phòng (trận dở được hoàn cọc khi rút máy / API tự hoàn khi máy chết), nên revision
    // đứng yên: máy realtime không ghi lại snapshot mỗi lần trận đổi pha.
    this.revision = 0;
    this.nextBotTableAt = 0;
  }

  prize(stake) {
    return 2 * stake - Math.floor((2 * stake * this.rules.houseCutPercent) / 100);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.botTimer = setInterval(() => this.tickBots(), this.rules.tickMs || 1_000);
    this.botTimer.unref?.();
  }

  // Phòng đóng / không còn ai: hủy mọi trận có cọc (hoàn xu), dọn bàn.
  stop() {
    this.running = false;
    clearInterval(this.botTimer);
    clearTimeout(this.stateTimer);
    this.botTimer = null;
    this.stateTimer = null;
    for (const match of [...this.matches.values()]) {
      if (match.settling) continue;
      if (match.phase === 'done') this.close(match);
      else this.finish(match, null, { reason: 'void' });
    }
  }

  // Rút máy: chờ trận đang chốt tiền xong, hủy (hoàn cọc) trận chưa xong rồi dừng.
  async quiesce(limitMs = 10_000) {
    const until = Date.now() + limitMs;
    const settling = () => [...this.matches.values()].map((match) => match.settling).filter(Boolean);
    await Promise.race([Promise.allSettled(settling()), sleep(Math.max(0, until - Date.now()))]);
    const pending = [];
    for (const match of [...this.matches.values()]) {
      clearTimeout(match.timer);
      if (match.phase !== 'done' && !match.settling) pending.push(this.finish(match, null, { reason: 'void' }));
    }
    await Promise.race([Promise.allSettled([...pending, ...settling()]), sleep(Math.max(0, until - Date.now()))]);
    this.stop();
  }

  // ---- Tra cứu ----
  sideOf(match, participant) {
    return match.sides.find((side) => side && (participant.accountId ? side.accountId === participant.accountId : side.pid === participant.id)) || null;
  }

  matchOfAccount(accountId) {
    if (!accountId) return null;
    for (const match of this.matches.values()) if (match.sides.some((side) => side?.accountId === accountId)) return match;
    return null;
  }

  matchOfBot(participantId) {
    for (const match of this.matches.values()) if (match.sides.some((side) => side?.bot && side.pid === participantId)) return match;
    return null;
  }

  // Bot đang mở bàn / đang đấu thì không được rời phòng (churn) giữa chừng.
  hasBotBet(participantId) {
    return Boolean(this.matchOfBot(participantId));
  }

  idleBots() {
    return [...this.room.participants.values()].filter((participant) => participant.bot && !this.matchOfBot(participant.id));
  }

  sideFor(participant, bot = false) {
    const level = Number.isSafeInteger(participant.level) && participant.level >= 1 && participant.level <= 99 ? participant.level : undefined;
    return {
      pid: participant.id,
      accountId: bot ? null : participant.accountId,
      bot,
      name: participant.displayName,
      ...(participant.skin ? { skin: participant.skin } : {}),
      ...(level ? { level } : {}),
      staked: false,
      pick: null,
      pickAt: 0,
      rematch: false,
      left: false,
    };
  }

  newId() {
    this.serial += 1;
    const suffix = randomInt(36 ** 4).toString(36).padStart(4, '0');
    return `rp-${this.room.id}-${this.room.epoch}-${this.serial}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 79);
  }

  key(accountId, purpose) {
    return createHash('sha256').update(`${accountId}:${purpose}`).digest('base64url').slice(0, 40);
  }

  // Trừ cọc của một người thật cho trận. Trả { ok, coins } hoặc lỗi để báo người đó.
  async escrow(match, side, requestId) {
    if (!this.stake) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn chưa nối được ví xu, thử lại sau' };
    let result = null;
    try {
      result = await this.stake({ accountId: side.accountId, matchId: match.id, amount: match.stake, key: this.key(side.accountId, `${match.id}:${requestId}`) });
    } catch {}
    if (result?.ok) {
      side.staked = true;
      side.coins = result.coins;
      return { ok: true };
    }
    if (result?.code === 'INSUFFICIENT_COINS') return { ok: false, code: 'INSUFFICIENT_COINS', message: 'Không đủ xu để vào bàn này' };
    return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Chưa vào được bàn, thử lại sau' };
  }

  // ---- Thao tác của người chơi ----
  guard(participant) {
    if (!participant?.accountId) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Đăng nhập để cược bằng xu' };
    if (!this.running) return { ok: false, code: 'GAME_UNAVAILABLE', message: 'Bàn đang tạm nghỉ, thử lại sau' };
    const current = this.matchOfAccount(participant.accountId);
    if (current && current.phase === 'done') this.leaveDone(current, this.sideOf(current, participant));
    else if (current) return { ok: false, code: 'BUSY', message: current.phase === 'waiting' ? 'Bạn đang mở một bàn rồi' : 'Bạn đang trong một trận' };
    return null;
  }

  async open(participant, { requestId, stake }) {
    const blocked = this.guard(participant);
    if (blocked) return blocked;
    if (!this.stakes.includes(stake)) return { ok: false, code: 'INVALID', message: 'Mức cược không có ở bàn này' };
    const match = this.createMatch(stake, this.sideFor(participant));
    const paid = await this.escrow(match, match.sides[0], requestId);
    if (!paid.ok) {
      this.matches.delete(match.id);
      return paid;
    }
    if (!this.matches.has(match.id)) {
      // Bị đóng trong lúc chờ API (rời phòng): hoàn lại cọc vừa trừ.
      this.refundOrphan(match);
      return { ok: true };
    }
    match.waitUntil = this.now() + this.rules.waitMs;
    match.botJoinAt = this.now() + between(this.random, this.rules.botJoinMs);
    this.sendMatch(match);
    this.scheduleState();
    return { ok: true };
  }

  async find(participant, { requestId, stake }) {
    const blocked = this.guard(participant);
    if (blocked) return blocked;
    if (!this.stakes.includes(stake)) return { ok: false, code: 'INVALID', message: 'Mức cược không có ở bàn này' };
    // Ưu tiên bàn người thật đang chờ lâu nhất, rồi tới bàn còn lại cùng mức.
    const waiting = [...this.matches.values()]
      .filter((match) => match.phase === 'waiting' && match.stake === stake && !match.joining && (match.sides[0].bot || match.sides[0].staked))
      .filter((match) => match.sides[0].accountId !== participant.accountId)
      .sort((a, b) => Number(a.sides[0].bot) - Number(b.sides[0].bot) || a.createdAt - b.createdAt);
    const table = waiting.find((match) => match.sides[0].bot || this.connected(match.sides[0]));
    if (table) return this.join(participant, { requestId, tableId: table.id }, true);
    return this.open(participant, { requestId, stake });
  }

  async join(participant, { requestId, tableId }, checked = false) {
    if (!checked) {
      const blocked = this.guard(participant);
      if (blocked) return blocked;
    }
    const match = this.matches.get(tableId);
    if (!match || match.phase !== 'waiting' || match.joining || (!match.sides[0].bot && !match.sides[0].staked)) {
      return { ok: false, code: 'TABLE_TAKEN', message: 'Bàn này vừa có người vào hoặc đã đóng' };
    }
    if (match.sides[0].accountId === participant.accountId) return { ok: false, code: 'INVALID', message: 'Đây là bàn của bạn' };
    const side = this.sideFor(participant);
    match.joining = side;
    this.scheduleState();
    const paid = await this.escrow(match, side, requestId);
    if (match.joining === side) match.joining = null;
    if (!paid.ok) {
      this.scheduleState();
      return paid;
    }
    if (!this.matches.has(match.id) || match.phase !== 'waiting') {
      // Chủ bàn rời trong lúc chờ API: trận chỉ còn cọc của người vào → hoàn.
      if (!match.settling) this.finish(match, null, { reason: 'void', extra: side });
      return { ok: false, code: 'TABLE_TAKEN', message: 'Chủ bàn vừa rời bàn' };
    }
    match.sides[1] = side;
    this.begin(match);
    return { ok: true };
  }

  leave(participant) {
    const match = this.matchOfAccount(participant?.accountId);
    if (!match) return { ok: true };
    const side = this.sideOf(match, participant);
    if (match.phase === 'waiting') {
      this.finish(match, null, { reason: 'void', silent: true });
      return { ok: true };
    }
    if (match.phase === 'done') {
      this.leaveDone(match, side);
      return { ok: true };
    }
    return { ok: false, code: 'IN_MATCH', message: 'Đang đấu, đánh xong ván này đã' };
  }

  pick(participant, { matchId, choice }) {
    const match = this.matches.get(matchId);
    const side = match && this.sideOf(match, participant);
    if (!match || !side) return { ok: false, code: 'NOT_IN_MATCH', message: 'Bạn không ở trong trận này' };
    if (match.phase !== 'pick' || this.now() > match.deadline + PICK_GRACE_MS) return { ok: false, code: 'PICK_CLOSED', message: 'Đã hết giờ chọn' };
    if (side.pick) return { ok: false, code: 'ALREADY_PICKED', message: 'Bạn đã chọn rồi' };
    if (!RPS_CHOICES.includes(choice)) return { ok: false, code: 'INVALID', message: 'Chọn Kéo, Búa hoặc Bao' };
    side.pick = choice;
    if (match.sides.every((item) => item.pick)) this.reveal(match);
    else this.sendMatch(match);
    return { ok: true };
  }

  rematch(participant, { matchId }) {
    const match = this.matches.get(matchId);
    const side = match && this.sideOf(match, participant);
    if (!match || !side || match.phase !== 'done') return { ok: false, code: 'NOT_IN_MATCH', message: 'Trận đã đóng' };
    const other = match.sides.find((item) => item !== side);
    if (other.left) return { ok: false, code: 'OPPONENT_LEFT', message: 'Đối thủ đã rời bàn' };
    side.rematch = true;
    if (other.bot && other.rematch === false && !match.botRematchAt) {
      // Bot nghĩ một chút rồi mới nhận (hoặc thôi), như người thật.
      match.botRematchAt = this.now() + between(this.random, [900, 2_800]);
      match.botRematchYes = this.random(100) < 60;
    }
    if (other.rematch) this.startRematch(match);
    else this.sendMatch(match);
    return { ok: true };
  }

  // Người rời phòng / mất kết nối: bàn đang chờ thì đóng (hoàn cọc); đang đấu thì để hết giờ (thua lượt).
  participantAway(participantId) {
    const participant = this.room.participants.get(participantId);
    for (const match of [...this.matches.values()]) {
      const side = match.sides.find((item) => item && item.pid === participantId);
      if (!side && match.joining?.pid !== participantId) continue;
      if (match.phase === 'waiting' && side) this.finish(match, null, { reason: 'void', silent: true });
      else if (match.phase === 'done' && side) this.leaveDone(match, side);
      else if (side?.bot && !participant) this.finish(match, null, { reason: 'void' });
    }
  }

  // ---- Nhịp trận ----
  createMatch(stake, host, botHosted = false) {
    const match = {
      id: this.newId(), stake, phase: 'waiting', round: 0, createdAt: this.now(), deadline: 0,
      sides: [host, null], joining: null, timer: null, last: null, result: null, settling: null,
      botHosted, waitUntil: 0, botJoinAt: 0, botRematchAt: 0, botRematchYes: false, expiresAt: 0,
    };
    this.matches.set(match.id, match);
    return match;
  }

  begin(match) {
    match.phase = 'ready';
    match.round = 1;
    match.deadline = this.now() + this.rules.readyMs;
    match.last = null;
    this.sendMatch(match);
    this.scheduleState();
    this.at(match, this.rules.readyMs, () => this.openPick(match));
  }

  at(match, ms, work) {
    clearTimeout(match.timer);
    match.timer = setTimeout(work, Math.max(0, ms));
    match.timer.unref?.();
  }

  openPick(match) {
    if (!this.matches.has(match.id)) return;
    match.phase = 'pick';
    match.deadline = this.now() + this.rules.pickMs;
    for (const side of match.sides) {
      side.pick = null;
      if (side.bot) {
        // Bot rút tay ngay bây giờ (ngẫu nhiên đều), chỉ "bấm" muộn hơn cho giống người.
        side.botChoice = RPS_CHOICES[this.random(3)];
        side.pickAt = this.now() + between(this.random, [700, Math.max(800, this.rules.pickMs - 900)]);
      }
    }
    this.sendMatch(match);
    this.at(match, this.rules.pickMs + PICK_GRACE_MS, () => this.reveal(match));
  }

  reveal(match) {
    if (!this.matches.has(match.id) || match.phase !== 'pick') return;
    clearTimeout(match.timer);
    // Bot chưa kịp "bấm" lúc người chơi đã chọn xong: lật luôn tay bot đã rút từ đầu lượt.
    for (const side of match.sides) if (side.bot && !side.pick) side.pick = side.botChoice;
    const [a, b] = match.sides;
    match.phase = 'reveal';
    match.deadline = this.now() + this.rules.revealMs;
    const outcome = !a.pick && !b.pick ? 'none' : !a.pick ? 'b' : !b.pick ? 'a' : rpsOutcome(a.pick, b.pick);
    match.last = { a: a.pick, b: b.pick, outcome: outcome === 'none' ? 'draw' : outcome };
    this.sendMatch(match);
    if (outcome === 'none') {
      this.at(match, this.rules.revealMs, () => this.finish(match, null, { reason: 'void' }));
    } else if (outcome === 'draw' && match.round < this.rules.maxRounds) {
      this.at(match, this.rules.revealMs, () => {
        if (!this.matches.has(match.id)) return;
        match.round += 1;
        match.phase = 'ready';
        match.deadline = this.now() + this.rules.readyMs / 2;
        this.sendMatch(match);
        this.at(match, this.rules.readyMs / 2, () => this.openPick(match));
      });
    } else {
      const winner = outcome === 'draw' ? null : outcome === 'a' ? a : b;
      this.at(match, this.rules.revealMs, () => this.finish(match, winner, { reason: outcome === 'draw' ? 'draw' : 'win' }));
    }
  }

  // Chốt trận: winner là side thắng, null = hòa / hủy (hoàn cọc).
  finish(match, winner, { reason, silent = false, extra = null }) {
    clearTimeout(match.timer);
    const work = (async () => {
      // Nhường một nhịp: match.settling phải được gán (dòng cuối hàm) trước khi thân này chạy xong và xóa nó; không thì
      // trận không có cọc nào (chốt xong ngay) bị kẹt cờ "đang chốt" và các đường hoàn cọc về sau bỏ qua nó.
      await null;
      const humans = [...match.sides, extra].filter((side) => side && !side.bot && side.staked);
      const bot = match.sides.some((side) => side?.bot);
      let settled = { ok: true, results: [] };
      if (humans.length) {
        settled = null;
        const winnerId = winner ? (winner.bot ? 'bot' : winner.accountId) : null;
        for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled?.ok; attempt += 1) {
          try { settled = this.settle ? await this.settle({ matchId: match.id, winner: winnerId, bot }) : null; } catch { settled = null; }
          if (!settled?.ok && attempt + 1 < SETTLE_ATTEMPTS) await sleep(400);
        }
      }
      // API không trả lời sau vài lần: thử tiếp ở nền (chốt trùng trận thì API trả kết quả cũ, không trả hai lần), để
      // người thắng vẫn nhận xu thay vì chỉ được hoàn cọc khi API tự dọn trận treo sau RPS_STALE_MS.
      if (humans.length && !settled?.ok && this.settle) this.retrySettle({ matchId: match.id, winner: winner ? (winner.bot ? 'bot' : winner.accountId) : null, bot });
      match.settling = null;
      const byAccount = new Map((settled?.results || []).map((item) => [item.accountId, item]));
      const failed = !settled?.ok;
      match.result = failed || reason === 'void' ? 'void' : reason === 'draw' ? 'draw' : 'win';
      match.winner = winner;
      for (const side of match.sides) {
        if (!side || side.bot) continue;
        const item = byAccount.get(side.accountId);
        if (item) side.coins = item.coins;
        side.net = item ? item.net : 0;
      }
      if (silent || match.sides[1] === null) {
        // Bàn đóng khi chưa có đối thủ: báo chủ bàn đã hoàn cọc rồi bỏ bàn.
        match.phase = 'closed';
        this.sendMatch(match);
        this.matches.delete(match.id);
        this.scheduleState();
        return;
      }
      match.phase = 'done';
      match.deadline = this.now() + this.rules.rematchMs;
      for (const side of match.sides) side.rematch = false;
      if (match.result !== 'void') this.pushFeed(match);
      this.sendMatch(match);
      this.scheduleState();
      this.at(match, this.rules.rematchMs, () => this.close(match));
    })();
    match.settling = work;
    return work;
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

  // Trận bị đóng trước khi kịp ghi vào bàn (rời phòng lúc đang trừ cọc): hoàn cọc riêng.
  refundOrphan(match) {
    this.matches.set(match.id, match);
    this.finish(match, null, { reason: 'void', silent: true });
  }

  leaveDone(match, side) {
    if (!side) return;
    side.left = true;
    side.rematch = false;
    this.close(match);
  }

  close(match) {
    clearTimeout(match.timer);
    if (!this.matches.has(match.id)) return;
    match.phase = 'closed';
    this.sendMatch(match);
    this.matches.delete(match.id);
    this.scheduleState();
  }

  // Cả hai bấm đấu lại: trận mới cùng mức cược, trừ cọc lại cả hai. Một bên không đủ xu thì hoàn bên kia, đóng bàn.
  async startRematch(match) {
    if (match.phase !== 'done' || match.restarting) return;
    match.restarting = true;
    clearTimeout(match.timer);
    this.matches.delete(match.id);
    const fresh = (side) => ({ ...side, staked: false, pick: null, rematch: false, left: false, net: undefined });
    const next = this.createMatch(match.stake, fresh(match.sides[0]));
    next.sides[1] = fresh(match.sides[1]);
    // Đang trừ cọc: ẩn khỏi sảnh, bot không vào.
    next.joining = next.sides[1];
    const results = await Promise.all(next.sides.map((side) => (side.bot ? { ok: true } : this.escrow(next, side, `rematch-${match.id}`))));
    next.joining = null;
    if (!this.matches.has(next.id)) {
      // Trận mới bị đóng trong lúc đang trừ cọc (một bên rời phòng, rút máy): hoàn ngay phần đã trừ.
      if (next.sides.some((side) => side.staked) && !next.settling) this.refundOrphan(next);
      return;
    }
    if (results.every((item) => item.ok)) {
      this.begin(next);
      return;
    }
    next.sides.forEach((side, index) => {
      if (!results[index].ok && !side.bot) {
        this.sendToAccount(side.accountId, { v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.room.epoch, code: results[index].code, message: results[index].message });
      }
    });
    this.finish(next, null, { reason: 'void', silent: true });
  }

  pushFeed(match) {
    const [a, b] = match.sides;
    this.feed = [{ a: a.name, b: b.name, stake: match.stake, winner: match.winner === a ? 'a' : match.winner === b ? 'b' : 'draw' }, ...this.feed].slice(0, FEED_SIZE);
  }

  connected(side) {
    return Boolean(this.room.participants.get(side.pid)?.connected);
  }

  // ---- Bot ----
  tickBots() {
    if (!this.running) return;
    const now = this.now();
    for (const match of [...this.matches.values()]) {
      // Trận bot với bot (ghost) chạy bằng timer riêng, không qua nhịp ra tay.
      if (match.settling || match.ghost) continue;
      const humans = match.sides.filter((side) => side && !side.bot);
      if (match.phase === 'waiting') {
        if (!humans.length) {
          // Bàn bot: hết giờ thì có bot khác vào đấu (trận ảo) hoặc tự đóng.
          if (now >= match.expiresAt) this.botTableDone(match);
        } else if (match.sides[0].staked && !match.joining && now >= match.waitUntil) this.finish(match, null, { reason: 'void', silent: true });
        else if (match.sides[0].staked && !match.joining && now >= match.botJoinAt) this.botJoin(match);
      } else if (match.phase === 'pick') {
        for (const side of match.sides) {
          if (side.bot && !side.pick && now >= side.pickAt) {
            side.pick = side.botChoice;
            if (match.sides.every((item) => item.pick)) this.reveal(match);
            else this.sendMatch(match);
          }
        }
      } else if (match.phase === 'done' && match.botRematchAt && now >= match.botRematchAt) {
        match.botRematchAt = 0;
        const bot = match.sides.find((side) => side.bot);
        const human = match.sides.find((side) => !side.bot);
        if (match.botRematchYes && human?.rematch && this.room.participants.get(bot.pid)) {
          bot.rematch = true;
          this.startRematch(match);
        } else this.leaveDone(match, bot);
      }
    }
    this.tickBotTables(now);
  }

  botJoin(match) {
    const idle = this.idleBots();
    const bot = idle.length ? idle[this.random(idle.length)] : null;
    if (!bot) {
      match.botJoinAt = this.now() + 2_000;
      return;
    }
    match.sides[1] = this.sideFor(bot, true);
    this.begin(match);
  }

  // Bàn bot trong sảnh: giữ trong khoảng botTables, mỗi bàn sống botTableMs rồi thành trận bot với bot (chỉ ghi kết
  // quả lên bảng tin) hoặc tự đóng.
  tickBotTables(now) {
    const botTables = [...this.matches.values()].filter((match) => match.botHosted && match.phase === 'waiting');
    const [low, high] = this.rules.botTables;
    if (now < this.nextBotTableAt) return;
    this.nextBotTableAt = now + between(this.random, this.rules.botTableEveryMs || [4_000, 12_000]);
    if (botTables.length >= high) return;
    if (botTables.length >= low && this.random(2)) return;
    const idle = this.idleBots();
    const bot = idle.length ? idle[this.random(idle.length)] : null;
    if (!bot) return;
    // Bàn bot thường là mức thấp / vừa, ít khi mức cao.
    const weights = [5, 4, 4, 2, 1];
    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = this.random(total);
    const stake = this.stakes.find((_, index) => (roll -= weights[index] ?? 1) < 0) || this.stakes[0];
    const match = this.createMatch(stake, this.sideFor(bot, true), true);
    match.expiresAt = now + between(this.random, this.rules.botTableMs);
    this.scheduleState();
  }

  botTableDone(match) {
    const opponent = this.idleBots().find((bot) => bot.id !== match.sides[0].pid);
    if (!opponent || this.random(3) === 0) {
      this.matches.delete(match.id);
      this.scheduleState();
      return;
    }
    // Trận bot với bot: chạy ngầm vài giây rồi ghi kết quả, không gọi API.
    match.sides[1] = this.sideFor(opponent, true);
    match.phase = 'pick';
    match.ghost = true;
    this.scheduleState();
    this.at(match, between(this.random, this.rules.botMatchMs), () => {
      if (!this.matches.has(match.id)) return;
      const roll = this.random(9);
      match.winner = roll < 4 ? match.sides[0] : roll < 8 ? match.sides[1] : null;
      this.pushFeed(match);
      this.matches.delete(match.id);
      this.scheduleState();
    });
  }

  // ---- Gửi trạng thái ----
  view(match, side) {
    const other = match.sides.find((item) => item && item !== side) || null;
    const message = {
      v: PROTOCOL_VERSION,
      type: 'rps.match',
      epoch: this.room.epoch,
      matchId: match.id,
      stake: match.stake,
      phase: match.phase,
      round: match.round,
      prize: this.prize(match.stake),
    };
    if (other) {
      message.opponent = { displayName: other.name, ...(other.skin ? { skin: other.skin } : {}), ...(other.level ? { level: other.level } : {}) };
    }
    if (match.phase !== 'closed') message.deadline = match.phase === 'waiting' ? match.waitUntil : match.deadline;
    if (match.phase === 'pick' && other) {
      message.picked = { me: Boolean(side.pick), opponent: Boolean(other.pick) };
      if (side.pick) message.mine = side.pick;
    }
    if (match.last && other && ['reveal', 'ready', 'done'].includes(match.phase)) {
      const mineKey = match.sides[0] === side ? 'a' : 'b';
      const result = match.last.outcome === 'draw' ? 'draw' : match.last.outcome === mineKey ? 'win' : 'lose';
      message.last = { mine: match.last[mineKey], opponent: match.last[mineKey === 'a' ? 'b' : 'a'], result };
    }
    if (match.phase === 'done' || match.phase === 'closed') {
      if (match.result) message.result = match.result === 'win' ? (match.winner === side ? 'win' : 'lose') : match.result;
      if (Number.isSafeInteger(side.net)) message.net = side.net;
    }
    if (match.phase === 'done' && other) message.rematch = { me: side.rematch, opponent: other.rematch };
    if (Number.isSafeInteger(side.coins)) message.coins = side.coins;
    return message;
  }

  sendMatch(match) {
    for (const side of match.sides) {
      if (side && !side.bot) this.sendToAccount(side.accountId, this.view(match, side));
    }
  }

  stateMessage() {
    const tables = [...this.matches.values()]
      .filter((match) => match.phase === 'waiting' && !match.joining && (match.sides[0].bot || match.sides[0].staked))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LOBBY_SIZE)
      .map((match) => ({ id: match.id, displayName: match.sides[0].name, stake: match.stake, ...(match.sides[0].skin ? { skin: match.sides[0].skin } : {}) }));
    const playing = [...this.matches.values()].filter((match) => match.sides[1] && ['ready', 'pick', 'reveal'].includes(match.phase)).length;
    return { v: PROTOCOL_VERSION, type: 'rps.lobby', epoch: this.room.epoch, tables, playing, feed: this.feed };
  }

  // Người vào lại giữa trận: trận của mình.
  mineMessage(accountId) {
    const match = this.matchOfAccount(accountId);
    if (!match) return null;
    const side = match.sides.find((item) => item?.accountId === accountId);
    return side && side.staked ? this.view(match, side) : null;
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

// Gọi API nội bộ để giữ cọc / chốt trận. Lỗi mạng trả null.
export function rpsBank(apiInternalUrl, key) {
  const call = (path) => (body) => fetch(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json().catch(() => null)).catch((error) => {
    console.warn(`Oẳn Tù Tì: không gọi được API (${path}): ${error.message}`);
    return null;
  });
  return { stake: call('/internal/games/rps/stake'), settle: call('/internal/games/rps/settle') };
}
