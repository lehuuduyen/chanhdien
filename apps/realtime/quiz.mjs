// Đố vui nhiều người trong phòng chánh điện (rules.quiz; giao diện trong app 🧠 Trí tuệ, brain-ui.js). Máy giữ phòng
// điều khiển ván; không có tiền.
//   idle → lobby (có người xin chơi; đủ người thì đếm lobbyMs) → question ⇄ reveal … → result → idle / lobby
// - Đề: câu đố hình / đố số của khu Trí tuệ (80 % câu khó), máy này xin API một bộ kèm đáp án (source()); đáp án chỉ nằm
//   ở máy này, state chỉ mang đáp án ở pha mở đáp án. Lựa chọn của từng người không bao giờ phát ra (chỉ "đã trả lời").
// - Mỗi câu: câu dễ easyMs, câu khó hardMs; ai cũng trả lời rồi thì mở đáp án ngay. Sai hoặc không trả lời là bị loại;
//   cả nhà cùng sai thì không ai bị loại (allWrong).
// - Kết thúc: còn một người → người đó thắng; hết câu → những người còn lại cùng thắng; không còn người thật nào → dừng
//   (bot còn lại là người thắng).
// - Ít người: bot rảnh (không ngồi thiền, không đang đấu / trốn tìm) vào cho đủ botFill người; bot trả lời sau vài giây,
//   đúng theo botAccuracy[độ khó − 1].
// - Người vào phòng / xin chơi giữa ván thì chờ ván sau; rời phòng / bấm rời giữa ván coi như bị loại.
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';

const ACTIVE = new Set(['question', 'reveal']);

export class QuizGame {
  // room: cần participants, broadcast(message), epoch, id; tùy chọn availableQuizBots() (bot rảnh có thể chơi cùng),
  // reportQuiz({ key, players }) (Bảng vàng).
  // source(): Promise<[{ problem, answer }]> (API nội bộ); không có thì không chơi được.
  constructor({ room, rules, source = null, now = Date.now, random = Math.random }) {
    this.room = room;
    this.rules = rules;
    this.source = source;
    this.now = now;
    this.random = random;
    this.phase = 'idle';
    this.round = 0;
    this.lobby = new Set();
    // id → { displayName, bot, alive, choice }
    this.players = new Map();
    this.items = [];
    this.index = 0;
    this.endsAt = null;
    this.timer = null;
    this.botTimers = [];
    this.eliminated = [];
    this.allWrong = false;
    this.winners = [];
    this.loading = false;
  }

  get active() {
    return ACTIVE.has(this.phase);
  }

  inRound(participantId) {
    return (this.active || this.loading) && this.players.has(participantId);
  }

  // ---- Thao tác ----
  join(participantId) {
    const participant = this.room.participants.get(participantId);
    if (!participant || participant.bot) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.source) return { ok: false, error: 'NOT_ALLOWED' };
    if (this.inRound(participantId) && this.players.get(participantId).alive) return { ok: true };
    if (this.lobby.has(participantId)) return { ok: true };
    if (this.lobby.size >= this.rules.maxPlayers) return { ok: false, error: 'GAME_FULL' };
    this.lobby.add(participantId);
    if (this.phase === 'idle') this.phase = 'lobby';
    this.armLobby();
    this.broadcast();
    return { ok: true };
  }

  leave(participantId) {
    const queued = this.lobby.delete(participantId);
    const player = this.players.get(participantId);
    if (player && this.active && player.alive) {
      player.alive = false;
      if (this.phase === 'question') this.maybeReveal();
      this.broadcast();
      return { ok: true };
    }
    if (queued) {
      if (this.phase === 'lobby') this.armLobby();
      this.broadcast();
    }
    return { ok: true };
  }

  answer(participantId, index, choice) {
    if (this.phase !== 'question' || index !== this.index) return { ok: false, error: 'NOT_ASKING' };
    const player = this.players.get(participantId);
    if (!player?.alive) return { ok: false, error: 'NOT_PLAYING' };
    if (player.choice !== null) return { ok: false, error: 'ALREADY_ANSWERED' };
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.items[index].problem.options.length) return { ok: false, error: 'INVALID' };
    player.choice = choice;
    if (!this.maybeReveal()) this.broadcast();
    return { ok: true };
  }

  participantAway(participantId) {
    if (this.lobby.has(participantId) || this.players.has(participantId)) this.leave(participantId);
  }

  // ---- Nhịp ván ----
  botsAvailable() {
    return Boolean(this.rules.botFill) && (this.room.availableQuizBots?.().length || 0) > 0;
  }

  // Máy realtime gọi mỗi giây: một người đang chờ mà vừa có bot rảnh thì bắt đầu đếm.
  recheckLobby() {
    if (this.phase !== 'lobby' || this.endsAt || this.loading) return;
    this.armLobby();
    if (this.endsAt) this.broadcast();
  }

  armLobby() {
    if (this.phase !== 'lobby' || this.loading) return;
    const ready = this.lobby.size >= this.rules.minPlayers || (this.lobby.size >= 1 && this.botsAvailable());
    if (ready && !this.endsAt) this.schedule(this.rules.lobbyMs, () => this.start());
    if (!ready && this.endsAt) {
      clearTimeout(this.timer);
      this.endsAt = null;
    }
    if (!this.lobby.size) {
      this.phase = 'idle';
      this.endsAt = null;
    }
  }

  schedule(ms, work) {
    clearTimeout(this.timer);
    this.endsAt = this.now() + ms;
    this.timer = setTimeout(work, ms);
    this.timer.unref?.();
  }

  async start() {
    this.endsAt = null;
    const ids = [...this.lobby].filter((id) => this.room.participants.get(id)?.connected !== false && !this.room.participants.get(id)?.bot);
    const pool = ids.length && this.rules.botFill ? (this.room.availableQuizBots?.() || []) : [];
    const bots = pool.map((bot) => ({ bot, key: this.random() })).sort((a, b) => a.key - b.key)
      .slice(0, Math.max(0, this.rules.botFill - ids.length)).map((item) => item.bot.id);
    if (!ids.length || ids.length + bots.length < this.rules.minPlayers) {
      this.lobby = new Set(ids);
      if (!this.lobby.size) this.phase = 'idle';
      this.armLobby();
      this.broadcast();
      return;
    }
    const entry = (id, bot) => [id, {
      displayName: String(this.room.participants.get(id)?.displayName || 'Người chơi').slice(0, 40),
      accountId: bot ? null : this.room.participants.get(id)?.accountId || null,
      bot,
      alive: true,
      choice: null,
    }];
    this.players = new Map([...ids.map((id) => entry(id, false)), ...bots.map((id) => entry(id, true))]);
    this.lobby.clear();
    this.loading = true;
    this.broadcast();
    const items = await Promise.resolve(this.source?.()).catch(() => null);
    this.loading = false;
    if (this.phase === 'stopped') return;
    if (!Array.isArray(items) || !items.length) {
      // API lỗi: người chơi về hàng chờ, thử lại sau lobbyMs.
      this.lobby = new Set([...this.players].filter(([, player]) => !player.bot).map(([id]) => id));
      this.players = new Map();
      this.phase = this.lobby.size ? 'lobby' : 'idle';
      this.armLobby();
      this.broadcast();
      return;
    }
    this.items = items;
    this.index = 0;
    this.round += 1;
    this.winners = [];
    this.ask();
  }

  ask() {
    this.phase = 'question';
    this.eliminated = [];
    this.allWrong = false;
    for (const player of this.players.values()) player.choice = null;
    const item = this.items[this.index];
    const ms = item.problem.level >= 3 ? this.rules.hardMs : this.rules.easyMs;
    this.schedule(ms, () => this.reveal());
    this.scheduleBots(item, ms);
    this.broadcast();
  }

  // Bot trả lời sau 2 giây tới ~80 % thời gian câu, đúng theo độ khó (sai thì chọn ngẫu nhiên một phương án sai).
  scheduleBots(item, ms) {
    this.clearBots();
    const accuracy = this.rules.botAccuracy?.[item.problem.level - 1] ?? 0.6;
    const index = this.index;
    for (const [id, player] of this.players) {
      if (!player.bot || !player.alive) continue;
      const wrong = item.problem.options.map((_, choice) => choice).filter((choice) => choice !== item.answer);
      const choice = this.random() < accuracy ? item.answer : wrong[Math.floor(this.random() * wrong.length)];
      const delay = 2_000 + this.random() * Math.max(0, ms * 0.8 - 2_000);
      const timer = setTimeout(() => this.answer(id, index, choice), delay);
      timer.unref?.();
      this.botTimers.push(timer);
    }
  }

  clearBots() {
    for (const timer of this.botTimers) clearTimeout(timer);
    this.botTimers = [];
  }

  // Mọi người còn trong cuộc đã trả lời: mở đáp án ngay. Trả true nếu đã mở.
  maybeReveal() {
    if (this.phase !== 'question') return false;
    const alive = [...this.players.values()].filter((player) => player.alive);
    if (alive.length && alive.some((player) => player.choice === null)) return false;
    this.reveal();
    return true;
  }

  reveal() {
    if (this.phase !== 'question') return;
    this.clearBots();
    const { answer } = this.items[this.index];
    const alive = [...this.players].filter(([, player]) => player.alive);
    const wrong = alive.filter(([, player]) => player.choice !== answer);
    this.allWrong = alive.length > 0 && wrong.length === alive.length;
    this.eliminated = this.allWrong ? [] : wrong.map(([id]) => id);
    if (!this.allWrong) for (const [, player] of wrong) player.alive = false;
    this.phase = 'reveal';
    this.schedule(this.rules.revealMs, () => this.next());
    this.broadcast();
  }

  next() {
    if (this.phase !== 'reveal') return;
    const alive = [...this.players.values()].filter((player) => player.alive);
    if (alive.length <= 1 || this.index + 1 >= this.items.length || !alive.some((player) => !player.bot)) {
      this.finish();
      return;
    }
    this.index += 1;
    this.ask();
  }

  finish() {
    this.clearBots();
    this.winners = [...this.players].filter(([, player]) => player.alive).map(([id]) => id);
    this.report();
    this.phase = 'result';
    this.schedule(this.rules.resultMs, () => this.reset());
    this.broadcast();
  }

  // Bảng vàng Đố vui: báo API kết quả của thành viên (trụ tới cuối = thắng). Khách, bot không ghi.
  report() {
    const members = [...this.players.values()].filter((player) => !player.bot && player.accountId);
    if (!members.length || !this.room.reportQuiz) return;
    this.room.reportQuiz({
      key: `quiz-${this.room.id}-${this.room.epoch}-${this.round}`,
      players: members.map((player) => ({ accountId: player.accountId, displayName: player.displayName, won: player.alive })),
    });
  }

  // Hết màn kết quả: về hàng chờ (người đã xin chơi ván sau) hoặc nghỉ.
  reset() {
    this.players = new Map();
    this.items = [];
    this.index = 0;
    this.winners = [];
    this.eliminated = [];
    this.allWrong = false;
    this.endsAt = null;
    this.phase = this.lobby.size ? 'lobby' : 'idle';
    this.armLobby();
    this.broadcast();
  }

  stop() {
    clearTimeout(this.timer);
    this.clearBots();
    this.timer = null;
    this.phase = 'stopped';
  }

  // ---- Trạng thái ----
  stateMessage() {
    const name = (id) => String(this.room.participants.get(id)?.displayName || 'Người chơi').slice(0, 40);
    const asking = this.active && this.items[this.index];
    return {
      v: PROTOCOL_VERSION,
      type: 'quiz.state',
      epoch: this.room.epoch,
      phase: this.phase === 'stopped' ? 'idle' : this.phase,
      round: this.round,
      lobby: [...this.lobby].map((id) => ({ id, displayName: name(id) })),
      players: [...this.players].map(([id, player]) => ({ id, displayName: player.displayName, alive: player.alive, answered: player.choice !== null })),
      minPlayers: this.rules.minPlayers,
      ...(this.endsAt ? { endsAt: this.endsAt } : {}),
      ...(asking ? { index: this.index, total: this.items.length, question: asking.problem } : {}),
      ...(this.phase === 'reveal' ? { answer: asking.answer, eliminated: this.eliminated, allWrong: this.allWrong } : {}),
      ...(this.phase === 'result' ? { winners: this.winners } : {}),
    };
  }

  broadcast() {
    this.room.broadcast(this.stateMessage());
  }
}
