// Trốn tìm trong sân chánh điện (rules.hideSeek). Máy giữ phòng điều khiển ván; không có tiền, không gọi API.
//   idle → lobby (có người xin chơi; đủ minPlayers thì đếm lobbyMs) → hiding → seeking → result → lobby …
// - Bắt đầu ván: người trong hàng chờ thành người chơi, ~1 người đi kiếm / seekersPer người (tránh lặp người đi kiếm
//   ván trước), mọi người về điểm xuất phát (base).
// - Đi trốn (hideMs): người đi kiếm không được đi và KHÔNG nhận vị trí người trốn (server lọc ở danh sách thấy), nên sửa
//   trình duyệt bỏ màn đen cũng không biết ai trốn đâu.
// - Đi kiếm (seekMs): người trốn không được đi (server bỏ vị trí gửi lên); người đi kiếm chạm vào người trốn trong
//   catchDistance m (server đo theo vị trí server giữ) là bắt được.
// - Kết thúc: bắt hết người trốn → người đi kiếm thắng; hết giờ còn người trốn → người trốn thắng; người đi kiếm rời hết
//   → người trốn thắng; người trốn rời hết mà chưa ai bị bắt → hủy ván.
// - Ai thấy ai trong ván (visible): người chơi không thấy người ngoài (bot / người không chơi) cho sân gọn; người ngoài
//   không thấy người trốn (khỏi "mách"); người đi kiếm chỉ thấy người trốn chưa bị bắt trong pha đi kiếm.
// - Ít người: bot đang đi dạo được kéo vào làm người trốn cho đủ botFill người (bot không bao giờ đi kiếm); một người
//   cũng chơi được (làm người đi kiếm). Bot chạy tới chỗ trốn (bot-nav hideSpots: sát bụi cây / hàng rào) rồi đứng yên.
// - Thưởng xu (API giữ giá, giới hạn ngày): bắt hết → người đi kiếm; hết giờ → người trốn chưa bị bắt. Chỉ khi ván có ít
//   nhất rewardMinHumans người thật (chơi một mình với bot không được xu).
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';

const ACTIVE = new Set(['hiding', 'seeking']);

export class HideSeekGame {
  // room: cần participants, broadcast(message), epoch, teleport(id, pos), releaseHand(id), refreshGameViews();
  // tùy chọn: availableGameBots() (bot rảnh có thể vào trốn), nav.hideSpots(), rewardHideSeek(ids, key).
  constructor({ room, rules, now = Date.now, random = Math.random }) {
    this.room = room;
    this.rules = rules;
    this.now = now;
    this.random = random;
    this.phase = 'idle';
    this.round = 0;
    this.lobby = new Set();
    this.players = new Map();
    this.endsAt = null;
    this.winner = null;
    this.lastCatch = null;
    this.lastSeekers = new Set();
    this.timer = null;
    // Bot trong ván: id → chỗ trốn.
    this.botSpots = new Map();
  }

  get active() {
    return ACTIVE.has(this.phase);
  }

  // ---- Thao tác ----
  join(participantId) {
    const participant = this.room.participants.get(participantId);
    if (!participant || participant.bot) return { ok: false, error: 'NOT_IN_ROOM' };
    if (this.players.has(participantId) && this.phase !== 'result') return { ok: true };
    if (this.lobby.size >= this.rules.maxPlayers) return { ok: false, error: 'GAME_FULL' };
    this.lobby.add(participantId);
    if (this.phase === 'idle') this.phase = 'lobby';
    this.armLobby();
    this.broadcast();
    return { ok: true };
  }

  // Rời hàng chờ; đang trong ván thì bỏ cuộc (người trốn chưa bị bắt coi như thua lượt của mình).
  leave(participantId) {
    const wasQueued = this.lobby.delete(participantId);
    const player = this.players.get(participantId);
    if (player && this.active) {
      this.players.delete(participantId);
      if (!this.checkEnd()) {
        this.broadcast();
        this.room.refreshGameViews();
      }
      return { ok: true };
    }
    if (player && this.phase === 'result') this.players.delete(participantId);
    if (wasQueued || player) {
      if (this.phase === 'lobby') this.armLobby();
      this.broadcast();
    }
    return { ok: true };
  }

  catch(seekerId, targetId) {
    if (this.phase !== 'seeking') return { ok: false, error: 'NOT_SEEKING' };
    const seeker = this.players.get(seekerId);
    const hider = this.players.get(targetId);
    if (seeker?.role !== 'seeker') return { ok: false, error: 'NOT_SEEKER' };
    if (hider?.role !== 'hider' || hider.caught) return { ok: false, error: 'NOT_HIDER' };
    const a = this.room.participants.get(seekerId)?.pos;
    const b = this.room.participants.get(targetId)?.pos;
    if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > this.rules.catchDistance) return { ok: false, error: 'TOO_FAR' };
    hider.caught = true;
    this.lastCatch = { seekerId, hiderId: targetId, at: this.now() };
    if (!this.checkEnd()) {
      this.broadcast();
      this.room.refreshGameViews();
    }
    return { ok: true };
  }

  // Người rời phòng hẳn (hết hạn nối lại / bị đuổi): như bấm rời.
  participantAway(participantId) {
    if (this.lobby.has(participantId) || this.players.has(participantId)) this.leave(participantId);
  }

  // ---- Luật trong ván ----
  inRound(participantId) {
    return this.active && this.players.has(participantId);
  }

  // Được đi lại không: người đi kiếm đứng yên lúc đi trốn; người trốn (và người đã bị bắt) đứng yên lúc đi kiếm.
  canMove(participantId) {
    const player = this.active ? this.players.get(participantId) : null;
    if (!player) return true;
    if (this.phase === 'hiding') return player.role === 'hider';
    return player.role === 'seeker';
  }

  visible(viewerId, subjectId) {
    if (!this.active || viewerId === subjectId) return true;
    const viewer = this.players.get(viewerId);
    const subject = this.players.get(subjectId);
    if (!subject) return !viewer;
    if (subject.role === 'seeker') return true;
    if (!viewer) return false;
    if (viewer.role === 'seeker') return this.phase === 'seeking' && !subject.caught;
    return true;
  }

  // ---- Nhịp ván ----
  // Có bot rảnh để chơi cùng không (một người cũng bắt đầu được).
  botsAvailable() {
    return Boolean(this.rules.botFill) && (this.room.availableGameBots?.().length || 0) > 0;
  }

  // Xét lại hàng chờ định kỳ (máy realtime gọi mỗi giây): một người đang chờ mà vừa có bot rảnh thì bắt đầu đếm.
  recheckLobby() {
    if (this.phase !== 'lobby' || this.endsAt) return;
    this.armLobby();
    if (this.endsAt) this.broadcast();
  }

  armLobby() {
    if (this.phase !== 'lobby') return;
    const ready = this.lobby.size >= this.rules.minPlayers || (this.lobby.size >= 1 && this.botsAvailable());
    if (ready && !this.endsAt) this.schedule(this.rules.lobbyMs, () => this.start());
    if (!ready && this.endsAt) {
      clearTimeout(this.timer);
      this.endsAt = null;
    }
    if (!this.lobby.size && !this.players.size) {
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

  start() {
    this.endsAt = null;
    // Chỉ người đang kết nối (người tắt app còn trong thời gian chờ nối lại thì không được chọn, nhất là làm người đi kiếm).
    const ids = [...this.lobby].filter((id) => this.room.participants.get(id)?.connected);
    // Ít người: kéo bot rảnh vào làm người trốn cho đủ botFill người.
    const pool = ids.length && this.rules.botFill ? (this.room.availableGameBots?.() || []) : [];
    const bots = pool.map((bot) => ({ bot, key: this.random() })).sort((a, b) => a.key - b.key)
      .slice(0, Math.max(0, this.rules.botFill - ids.length)).map((item) => item.bot.id);
    if (ids.length + bots.length < this.rules.minPlayers || !ids.length) {
      this.lobby = new Set(ids);
      this.armLobby();
      this.broadcast();
      return;
    }
    // Xáo người chơi; người vừa đi kiếm ván trước xuống cuối danh sách chọn người đi kiếm. Bot luôn đi trốn.
    const shuffled = ids.map((id) => ({ id, key: this.random() + (this.lastSeekers.has(id) ? 1 : 0) })).sort((a, b) => a.key - b.key).map((item) => item.id);
    const total = ids.length + bots.length;
    const seekers = Math.min(ids.length, total - 1, Math.max(1, Math.round(total / this.rules.seekersPer)));
    const entry = (id, role) => [id, { role, caught: false, bot: Boolean(this.room.participants.get(id).bot), displayName: this.room.participants.get(id).displayName }];
    this.players = new Map([
      ...shuffled.map((id, index) => entry(id, index < seekers ? 'seeker' : 'hider')),
      ...bots.map((id) => entry(id, 'hider')),
    ]);
    const spots = bots.length ? (this.room.nav?.hideSpots?.(this.rules.base, bots.length, { random: this.random }) || []) : [];
    this.botSpots = new Map(bots.map((id, index) => [id, spots[index] || null]).filter(([, spot]) => spot));
    this.lobby.clear();
    this.round += 1;
    this.winner = null;
    this.lastCatch = null;
    this.phase = 'hiding';
    // Về điểm xuất phát: người đi kiếm đứng giữa, người trốn đứng vòng quanh (khỏi chồng lên nhau).
    const { base } = this.rules;
    let hiderIndex = 0;
    let seekerIndex = 0;
    for (const [id, player] of this.players) {
      const ring = player.role === 'seeker' ? 0.8 : 2.4;
      const index = player.role === 'seeker' ? seekerIndex++ : hiderIndex++;
      const count = player.role === 'seeker' ? seekers : this.players.size - seekers;
      const angle = (index / Math.max(1, count)) * Math.PI * 2;
      this.room.releaseHand?.(id);
      this.room.teleport(id, { x: base.x + Math.cos(angle) * ring, z: base.z + Math.sin(angle) * ring, ry: Math.atan2(-Math.cos(angle), -Math.sin(angle)) });
    }
    this.schedule(this.rules.hideMs, () => this.startSeeking());
    // Báo pha mới trước, rồi mới gửi danh sách thấy (người đi kiếm biết đã sang pha đi kiếm trước khi nhận vị trí).
    this.broadcast();
    this.room.refreshGameViews();
  }

  startSeeking() {
    if (this.phase !== 'hiding') return;
    this.phase = 'seeking';
    this.schedule(this.rules.seekMs, () => this.finish('hiders'));
    // Báo pha mới trước, rồi mới gửi danh sách thấy (người đi kiếm biết đã sang pha đi kiếm trước khi nhận vị trí).
    this.broadcast();
    this.room.refreshGameViews();
  }

  // Kiểm tra hết ván sau khi có người bị bắt / rời. Trả true nếu đã kết thúc (đã phát trạng thái).
  checkEnd() {
    if (!this.active) return false;
    const seekers = [...this.players.values()].filter((player) => player.role === 'seeker');
    const hiders = [...this.players.values()].filter((player) => player.role === 'hider');
    if (!seekers.length) return this.finish(hiders.length ? 'hiders' : 'none'), true;
    if (!hiders.length) return this.finish('none'), true;
    if (hiders.every((player) => player.caught)) return this.finish('seekers'), true;
    return false;
  }

  finish(winner) {
    if (!this.active) return;
    this.phase = 'result';
    this.winner = winner;
    this.botSpots = new Map();
    this.reward(winner);
    this.lastSeekers = new Set([...this.players].filter(([, player]) => player.role === 'seeker').map(([id]) => id));
    this.schedule(this.rules.resultMs, () => this.nextLobby());
    // Báo pha mới trước, rồi mới gửi danh sách thấy (người đi kiếm biết đã sang pha đi kiếm trước khi nhận vị trí).
    this.broadcast();
    this.room.refreshGameViews();
  }

  // Thưởng bên thắng (người thật có tài khoản; API trả xu, giới hạn mỗi ngày). Ván phải có đủ người thật.
  reward(winner) {
    const humans = [...this.players].filter(([, player]) => !player.bot);
    if (!this.room.rewardHideSeek || humans.length < (this.rules.rewardMinHumans || 2)) return;
    const winners = humans.filter(([, player]) => (winner === 'seekers' ? player.role === 'seeker' : winner === 'hiders' && player.role === 'hider' && !player.caught));
    if (winners.length) this.room.rewardHideSeek(winners.map(([id]) => id), `hs-${this.room.id}-${this.room.epoch}-${this.round}`);
  }

  // Bot đang trong ván: { phase, spot } để máy realtime cho bot chạy tới chỗ trốn (pha đi trốn) rồi đứng yên.
  botPlan(participantId) {
    const player = this.active ? this.players.get(participantId) : null;
    if (!player?.bot) return null;
    return { phase: this.phase, spot: this.botSpots.get(participantId) || null };
  }

  // Hết màn kết quả: người vừa chơi (còn kết nối, không phải bot) tự xếp vào ván sau, cùng người đã xin chờ.
  nextLobby() {
    for (const [id, player] of this.players) {
      if (!player.bot && this.room.participants.get(id)?.connected && this.lobby.size < this.rules.maxPlayers) this.lobby.add(id);
    }
    this.players = new Map();
    this.winner = null;
    this.lastCatch = null;
    this.endsAt = null;
    this.phase = this.lobby.size ? 'lobby' : 'idle';
    this.armLobby();
    this.broadcast();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  // Snapshot phòng (deploy / máy chết): chỉ giữ hàng chờ và người vừa đi kiếm. Ván đang chơi không giữ — snapshot không có
  // vị trí người chơi, dựng lại thì người trốn mất chỗ trốn; người trong ván được xếp lại vào hàng chờ ván sau.
  toRecord() {
    const queued = [...new Set([...this.lobby, ...[...this.players].filter(([, player]) => !player.bot).map(([id]) => id)])];
    if (!queued.length && !this.lastSeekers.size) return null;
    return { lobby: queued.slice(0, this.rules.maxPlayers), lastSeekers: [...this.lastSeekers], round: this.round };
  }

  restoreRecord(record) {
    const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id.length <= 64) : []);
    this.lobby = new Set(ids(record?.lobby).slice(0, this.rules.maxPlayers));
    this.lastSeekers = new Set(ids(record?.lastSeekers));
    this.round = Number.isSafeInteger(record?.round) && record.round >= 0 ? record.round : 0;
    if (this.lobby.size) {
      this.phase = 'lobby';
      this.armLobby();
    }
  }

  // ---- Trạng thái ----
  stateMessage() {
    const name = (id) => this.room.participants.get(id)?.displayName || 'Người chơi';
    return {
      v: PROTOCOL_VERSION,
      type: 'hideseek.state',
      epoch: this.room.epoch,
      phase: this.phase,
      round: this.round,
      lobby: [...this.lobby].map((id) => ({ id, displayName: name(id).slice(0, 40) })),
      players: [...this.players].map(([id, player]) => ({ id, displayName: player.displayName.slice(0, 40), role: player.role, caught: player.caught })),
      minPlayers: this.rules.minPlayers,
      ...(this.endsAt ? { endsAt: this.endsAt } : {}),
      ...(this.winner ? { winner: this.winner } : {}),
      ...(this.lastCatch ? { lastCatch: this.lastCatch } : {}),
    };
  }

  broadcast() {
    this.room.broadcast(this.stateMessage());
  }
}
