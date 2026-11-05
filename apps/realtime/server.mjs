import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AVATAR_URL, parseClientMessage, parseServerMessage, PROTOCOL_VERSION, RPS_CHOICES } from '@chanh-dien/protocol';
import {
  createDirectoryFromEnv,
  createMemoryDirectory,
  LEASE_TTL_MS,
  NODE_TTL_MS,
  SNAPSHOT_TTL_MS,
} from '@chanh-dien/room-directory';
import { getRoomRules, isPremiumSkin, isShopSkin, parseThienRoomId, roomLangOf, roomTypeOf } from '@chanh-dien/room-rules';
import {
  createResumeToken,
  DEFAULT_LOCAL_SECRET,
  internalKey,
  verifyJoinTicket,
  verifyResumeToken,
} from '@chanh-dien/session-token';
import { WebSocket, WebSocketServer } from 'ws';
import { bauCuaBank, BauCuaTable } from './bau-cua.mjs';

const HEARTBEAT_MS = 15_000;
const MAX_PAYLOAD = 64 * 1_024;
export const RESUME_TTL_MS = 60_000;
export const TICK_MS = 3_000;
export const CLOSE_ROOM_MOVED = 4002;
const EMPTY_ROOM_GRACE_MS = 30_000;
const HELLO_TIMEOUT_MS = 10_000;
// Giới hạn chat cả phòng: 500 người × 5 tin/10 giây vẫn bị chặn ở mức này để bong bóng còn đọc được.
const ROOM_CHAT_PER_SECOND = 30;
const CINEMA = getRoomRules('cinema');
const MAX_QUEUE = 50;
const MAX_QUEUED_PER_PERSON = 3;
// Bài mới bắt đầu sau một nhịp ngắn để mọi client kịp nạp video trước khi tính giờ chung.
const START_DELAY_MS = 1_500;
const END_GRACE_MS = 3_000;
const MOVE_BATCH_MS = 200;
// Phòng đông (room rules có world.view): mỗi máy chỉ nhận người gần mình trong cùng vùng. Danh sách "ai thấy ai"
// tính lại mỗi VIEW_MS; phòng nhỏ (≤ VIEW_INSTANT_LIMIT người) tính lại ngay khi có người vào/đổi vùng để không trễ.
const VIEW_MS = 500;
const VIEW_INSTANT_LIMIT = 80;
// Người đang thấy được ưu tiên giữ (khoảng cách nhân hệ số này) để danh sách không nhảy qua lại ở mép.
const VIEW_KEEP = 0.8;
const COUNT_TOP = 10;
// Kết bạn và khiêu chiến giữa hai người trong phòng.
const FRIEND_REQUEST_TTL_MS = 60_000;
const CHALLENGE_INVITE_MS = 20_000;
const CHALLENGE_ROUND_MS = 10_000;
const CHALLENGE_TARGET = 2;
const CHALLENGE_MAX_ROUNDS = 9;
const CHALLENGE_LINGER_MS = 5_000;
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const seatIdsFor = (rules) => new Set(Array.from({ length: rules.seats || 0 }, (_, index) => `S-${index + 1}`));
const benchIdsFor = (rules) => new Set(Array.from({ length: rules.benches?.count || 0 }, (_, index) => `B-${index + 1}`));

const randomBetween = ([min, max]) => min + Math.random() * (max - min);
// Chibi quay mặt về trục −z cục bộ; phải cùng công thức với explore3d.mjs để không trượt lùi.
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

function hashText(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendRaw(socket, text) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(text);
}

// k phần tử có khoảng cách nhỏ nhất (quickselect, trung bình O(n)); không cần thứ tự trong k phần tử đó.
function nearestIds(list, distances, k) {
  const index = list.map((_, position) => position);
  let low = 0;
  let high = index.length - 1;
  const target = k - 1;
  while (low < high) {
    const pivot = distances[index[(low + high) >> 1]];
    let i = low;
    let j = high;
    while (i <= j) {
      while (distances[index[i]] < pivot) i += 1;
      while (distances[index[j]] > pivot) j -= 1;
      if (i <= j) {
        [index[i], index[j]] = [index[j], index[i]];
        i += 1;
        j -= 1;
      }
    }
    if (target <= j) high = j;
    else if (target >= i) low = i;
    else break;
  }
  return index.slice(0, k).map((position) => list[position].id);
}

function protocolError(socket, epoch, code, message, requestId) {
  const payload = { v: PROTOCOL_VERSION, type: 'protocol.error', epoch, code, message };
  if (requestId) payload.requestId = requestId;
  send(socket, payload);
}

// Kiểm tra video bằng oEmbed của YouTube (không cần API key): 401/403 là cấm nhúng, 400/404 là không có.
// Lỗi mạng hay hết giờ thì vẫn nhận (tên trống); client nào không phát được sẽ báo lỗi để phòng tự bỏ qua.
const videoInfoCache = new Map();
export async function fetchYouTubeInfo(videoId) {
  if (videoInfoCache.has(videoId)) return videoInfoCache.get(videoId);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let result = { ok: true, title: '' };
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 401 || response.status === 403) result = { ok: false, error: 'VIDEO_NOT_EMBEDDABLE' };
    else if (response.status === 400 || response.status === 404) result = { ok: false, error: 'VIDEO_NOT_FOUND' };
    else if (response.ok) result = { ok: true, title: String((await response.json()).title || '').slice(0, 200) };
  } catch {
    return result;
  }
  if (videoInfoCache.size > 1_000) videoInfoCache.delete(videoInfoCache.keys().next().value);
  videoInfoCache.set(videoId, result);
  return result;
}

const validQueueItem = (item) => item !== null && typeof item === 'object'
  && typeof item.itemId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(item.videoId)
  && typeof item.title === 'string' && typeof item.addedBy === 'string';

const validLevel = (level) => Number.isSafeInteger(level) && level >= 1 && level <= 99;
const validRecordParticipant = (item, seatIds, benchIds, seatsPerBench) => item !== null && typeof item === 'object'
  && typeof item.id === 'string' && typeof item.displayName === 'string' && typeof item.resumeToken === 'string'
  && (item.seatId === null || item.seatId === undefined || seatIds.has(item.seatId))
  && !(item.seatId && item.benchId)
  && ((item.benchId === null || item.benchId === undefined) && (item.benchSpot === null || item.benchSpot === undefined)
    || (benchIds.has(item.benchId) && Number.isInteger(item.benchSpot) && item.benchSpot >= 1 && item.benchSpot <= seatsPerBench));

export class Room {
  constructor(id, options = {}) {
    this.id = id;
    this.type = options.type || roomTypeOf(id) || 'cinema';
    this.lang = roomLangOf(id);
    this.rules = getRoomRules(this.type);
    // Hình chia cho người mới và bot: bỏ hình mua trong shop.
    this.freeSkins = (this.rules.skins || []).filter((skin) => !isPremiumSkin(skin));
    this.seatIds = seatIdsFor(this.rules);
    this.benchIds = benchIdsFor(this.rules);
    this.seatsPerBench = this.rules.benches?.seatsPerBench || 0;
    this.epoch = options.epoch || 1;
    this.maxParticipants = options.maxParticipants || this.rules.maxParticipants;
    // Phòng đông: chánh điện / sân riêng, mỗi người chỉ nhận người gần mình (xem refreshViews).
    this.view = this.rules.world?.view || null;
    this.viewsStale = true;
    this.viewTimer = null;
    this.participants = new Map();
    this.rates = new Map();
    this.playback = { current: null, queue: [], votes: new Set(), errors: new Set(), durations: [], timer: null };
    this.skipVotePercent = options.skipVotePercent || this.rules.interaction?.skipVotePercent || CINEMA.interaction.skipVotePercent;
    this.revision = 0;
    this.savedRevision = -1;
    this.closed = false;
    this.openedAt = Date.now();
    this.resumeTtlMs = options.resumeTtlMs || RESUME_TTL_MS;
    this.botCount = Math.max(0, Math.min(options.botCount ?? this.rules.bots?.count ?? 0, this.rules.seats || 0));
    this.botTimer = null;
    this.issueResumeToken = options.issueResumeToken || (() => `r-${randomUUID()}`);
    this.onEmpty = options.onEmpty || (() => {});
    this.pendingMoves = new Map();
    this.moveTimer = null;
    // Sáu công việc phối hợp trong sân. Tiến độ do đúng máy đang giữ phòng tính; client chỉ xin bắt đầu/dừng.
    this.chores = new Map((this.rules.world?.chores || []).map((item) => [item.id, {
      ...item, progress: 0, workers: new Set(), completedAt: null, resetAt: null,
    }]));
    this.choreTimer = null;
    this.choreTickAt = Date.now();
    // Ghi lễ vật của thành viên đã đăng nhập vào sổ công đức (API); khách và bot không ghi.
    this.onOffering = options.onOffering || (() => {});
    // Trả xu công việc qua API. Chỉ thành viên có accountId được ghi ví; khách vẫn cùng làm bình thường.
    this.onChoreReward = options.onChoreReward || null;
    // Hỏi / ghi bạn bè giữa hai thành viên (API); không có thì kết bạn chỉ trong phiên.
    this.onFriend = options.onFriend || null;
    // Chuyển báo cáo người chơi tới API để lưu.
    this.onReport = options.onReport || (() => {});
    this.friendRequests = new Map();
    this.challenges = new Map();
    // Phòng game: bàn Bầu Cua chơi chung (chạy khi có người trong phòng). options.bauCua: { stake, settle } gọi API.
    this.table = this.rules.interaction?.game === 'bau-cua'
      ? new BauCuaTable({ room: this, rules: this.rules.interaction, ...(options.bauCua || {}) })
      : null;
  }

  snapshot() {
    return {
      v: PROTOCOL_VERSION,
      type: 'room.state',
      epoch: this.epoch,
      roomId: this.id,
      revision: this.revision,
      participants: [...this.participants.values()].map((participant) => this.entryOf(participant)),
    };
  }

  entryOf({ id, displayName, seatId, benchId, benchSpot, connected, skin, merit, bot, level, avatarUrl, pos, emote, sutra }) {
    return {
      id,
      displayName,
      ...(seatId ? { seatId } : {}),
      ...(benchId ? { benchId, benchSpot } : {}),
      connected,
      ...(skin ? { skin } : {}),
      ...(merit !== undefined ? { merit } : {}),
      ...(bot ? { bot: true } : {}),
      ...(level ? { level } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(emote ? { emote } : {}),
      ...(emote === 'chant' && sutra ? { sutra } : {}),
      // pos để cuối: bản không có pos dùng làm khóa so sánh (đi lại không làm gửi lại cả danh sách).
      ...(pos && !seatId ? { pos } : {}),
    };
  }

  choreMessage() {
    return {
      v: PROTOCOL_VERSION,
      type: 'chore.state',
      epoch: this.epoch,
      chores: [...this.chores.values()].map(({ id, kind, progress, workers, completedAt }) => ({
        id, kind, progress: Math.round(progress), workers: [...workers], ...(completedAt ? { completedAt } : {}),
      })),
    };
  }

  broadcastChores(socket = null) {
    const message = this.choreMessage();
    if (socket) send(socket, message);
    else this.broadcast(message);
  }

  activeChoreOf(participantId) {
    return [...this.chores.values()].find((chore) => chore.workers.has(participantId)) || null;
  }

  startChore(participantId, choreId) {
    const participant = this.participants.get(participantId);
    const chore = this.chores.get(choreId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!chore || !participant.pos || participant.seatId || participant.benchId) return { ok: false, error: 'INVALID_CHORE' };
    if (!this.allow(`${participantId}:chore`, 6, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    if (Math.hypot(participant.pos.x - chore.x, participant.pos.z - chore.z) > chore.radius) {
      return { ok: false, error: 'TOO_FAR' };
    }
    const current = this.activeChoreOf(participantId);
    if (current && current !== chore) current.workers.delete(participantId);
    if (chore.completedAt) {
      chore.progress = 0;
      chore.completedAt = null;
      chore.resetAt = null;
    }
    chore.workers.add(participantId);
    const hadEmote = Boolean(participant.emote);
    participant.emote = null;
    participant.sutra = null;
    this.revision += 1;
    if (hadEmote) this.broadcastState();
    this.startChoreTimer();
    this.broadcastChores();
    return { ok: true };
  }

  stopChore(participantId, choreId = null) {
    let changed = false;
    for (const chore of this.chores.values()) {
      if (choreId && chore.id !== choreId) continue;
      changed = chore.workers.delete(participantId) || changed;
    }
    if (changed) {
      this.revision += 1;
      this.broadcastChores();
    }
    return changed ? { ok: true } : { ok: false, error: 'NOT_WORKING' };
  }

  startChoreTimer() {
    if (this.choreTimer || !this.chores.size) return;
    this.choreTickAt = Date.now();
    this.choreTimer = setInterval(() => this.tickChores(), 500);
    this.choreTimer.unref?.();
  }

  rewardChoreCompletion(participantId, chore, completedAt) {
    const participant = this.participants.get(participantId);
    if (!participant?.accountId || !this.onChoreReward) return;
    const key = createHash('sha256')
      .update(`${this.id}:${this.epoch}:${chore.id}:${completedAt}:${participant.accountId}`)
      .digest('base64url');
    Promise.resolve(this.onChoreReward({ accountId: participant.accountId, chore: chore.kind, key }))
      .then((result) => {
        if (!result?.ok) return;
        const current = this.participants.get(participantId);
        if (!current?.socket) return;
        const message = {
          v: PROTOCOL_VERSION,
          type: 'chore.reward',
          epoch: this.epoch,
          choreId: chore.id,
          kind: chore.kind,
          reward: result.reward,
          coins: result.coins,
          count: result.count,
          limit: result.limit,
        };
        if (parseServerMessage(message).ok) send(current.socket, message);
      })
      .catch((error) => console.warn(`Không trả được xu công việc: ${error.message}`));
  }

  tickChores(now = Date.now()) {
    const elapsed = Math.min(1_000, Math.max(0, now - this.choreTickAt));
    this.choreTickAt = now;
    let changed = false;
    let active = false;
    for (const chore of this.chores.values()) {
      if (chore.resetAt && now >= chore.resetAt) {
        chore.progress = 0;
        chore.completedAt = null;
        chore.resetAt = null;
        changed = true;
      }
      const workers = chore.workers.size;
      if (!workers || chore.completedAt) {
        if (chore.resetAt) active = true;
        continue;
      }
      active = true;
      // Hai người: 2,5 lần nhanh hơn một người; ba người: 4,5 lần. Khuyến khích phối hợp nhưng không bán sức mạnh.
      const collaboration = workers * (1 + Math.max(0, workers - 1) * 0.25);
      chore.progress = Math.min(1_000, chore.progress + (elapsed / chore.durationMs) * 1_000 * collaboration);
      changed = true;
      if (chore.progress >= 1_000) {
        const completedBy = [...chore.workers];
        chore.progress = 1_000;
        chore.completedAt = now;
        chore.resetAt = now + 8_000;
        chore.workers.clear();
        for (const participantId of completedBy) this.rewardChoreCompletion(participantId, chore, now);
      }
    }
    if (changed) {
      this.revision += 1;
      this.broadcastChores();
    }
    if (!active) {
      clearInterval(this.choreTimer);
      this.choreTimer = null;
    }
  }

  // ---- Phòng đông: ai thấy ai ----
  zoneOf(pos) {
    const hall = this.rules.world?.zones?.hall;
    return hall && pos.x >= hall.x[0] && pos.x <= hall.x[1] && pos.z >= hall.z[0] && pos.z <= hall.z[1] ? 'hall' : 'yard';
  }

  ensureViews() {
    if (this.viewsStale && this.participants.size <= VIEW_INSTANT_LIMIT) this.refreshViews();
  }

  // Mỗi người (có kết nối) thấy: chính mình, mọi người ngồi bồ đoàn/ghế đá (ít, cố định), người đang mời/đấu với
  // mình, và view[vùng] người đứng/đi gần mình nhất trong cùng vùng. Người chưa có vị trí coi như đứng ở cửa sân.
  refreshViews() {
    this.viewsStale = false;
    const fixed = [];
    const zones = { hall: [], yard: [] };
    for (const participant of this.participants.values()) {
      if (participant.seatId || participant.benchId) fixed.push(participant.id);
      else if (participant.pos && participant.connected) zones[this.zoneOf(participant.pos)].push(participant);
    }
    const links = new Map();
    const link = (a, b) => {
      if (!links.has(a)) links.set(a, []);
      links.get(a).push(b);
    };
    for (const key of this.friendRequests.keys()) {
      const [from, to] = key.split('>');
      link(from, to);
      link(to, from);
    }
    for (const challenge of this.challenges.values()) {
      link(challenge.fromId, challenge.toId);
      link(challenge.toId, challenge.fromId);
    }
    for (const viewer of this.participants.values()) {
      if (!viewer.socket) continue;
      const door = this.rules.world.zones?.hall?.z[1] ?? 0;
      const center = viewer.pos || { x: 0, z: door };
      const zone = viewer.seatId ? 'hall' : viewer.benchId || !viewer.pos ? 'yard' : this.zoneOf(center);
      const list = zones[zone];
      const limit = this.view[zone] || 40;
      let near;
      if (list.length <= limit) near = list.map((participant) => participant.id);
      else {
        const before = viewer.view;
        const distances = list.map((participant) => {
          const distance = (participant.pos.x - center.x) ** 2 + (participant.pos.z - center.z) ** 2;
          return before?.has(participant.id) ? distance * VIEW_KEEP : distance;
        });
        near = nearestIds(list, distances, limit);
      }
      viewer.view = new Set([viewer.id, ...fixed, ...(links.get(viewer.id) || []), ...near]);
    }
  }

  // Gửi room.state riêng cho từng người theo danh sách mình thấy; chỉ gửi khi phần đó đổi (bỏ qua vị trí, vị trí
  // đi bằng room.moves).
  broadcastViews() {
    this.ensureViews();
    const entries = new Map();
    const entryText = (participant) => {
      let entry = entries.get(participant.id);
      if (!entry) {
        const { pos, ...rest } = this.entryOf(participant);
        const key = JSON.stringify(rest);
        entry = { key, full: pos ? `${key.slice(0, -1)},"pos":${JSON.stringify(pos)}}` : key };
        entries.set(participant.id, entry);
      }
      return entry;
    };
    const head = `{"v":${PROTOCOL_VERSION},"type":"room.state","epoch":${this.epoch},"roomId":${JSON.stringify(this.id)},"revision":${this.revision},"participants":[`;
    for (const viewer of this.participants.values()) {
      if (!viewer.socket) continue;
      if (!viewer.view) this.refreshViews();
      const seen = [];
      for (const id of viewer.view) {
        const participant = this.participants.get(id);
        if (participant) seen.push(entryText(participant));
      }
      const key = seen.map((entry) => entry.key).join(',');
      if (key === viewer.stateKey) continue;
      viewer.stateKey = key;
      sendRaw(viewer.socket, `${head}${seen.map((entry) => entry.full).join(',')}]}`);
    }
  }

  // Số người cả phòng (có tính bot, kèm số bot) và bảng công đức đầu phòng; mỗi người nhận hạng của mình.
  // Chỉ gửi khi phần của người đó đổi.
  sendCounts() {
    let total = 0;
    let bots = 0;
    const ranked = [];
    for (const participant of this.participants.values()) {
      if (!participant.connected) continue;
      total += 1;
      if (participant.bot) bots += 1;
      if (participant.merit > 0) ranked.push(participant);
    }
    ranked.sort((a, b) => b.merit - a.merit);
    const ranks = new Map(ranked.map((participant, index) => [participant.id, index + 1]));
    const top = JSON.stringify(ranked.slice(0, COUNT_TOP).map(({ id, displayName, merit, level, avatarUrl }) => ({
      id, displayName, merit, ...(level ? { level } : {}), ...(avatarUrl ? { avatarUrl } : {}),
    })));
    const head = `{"v":${PROTOCOL_VERSION},"type":"room.count","epoch":${this.epoch},"total":${total},"bots":${bots},"top":${top}`;
    for (const viewer of this.participants.values()) {
      if (!viewer.socket) continue;
      const rank = ranks.get(viewer.id);
      const text = `${head}${rank ? `,"rank":${rank}` : ''}}`;
      if (text === viewer.countKey) continue;
      viewer.countKey = text;
      sendRaw(viewer.socket, text);
    }
  }

  startViews() {
    if (!this.view || this.viewTimer) return;
    this.viewTimer = setInterval(() => {
      if (this.closed) return;
      this.refreshViews();
      this.broadcastViews();
      this.sendCounts();
    }, VIEW_MS);
    this.viewTimer.unref?.();
  }

  stopViews() {
    clearInterval(this.viewTimer);
    this.viewTimer = null;
  }

  // ---- Đi lại (chế độ nhập vai) ----
  get walkers() {
    let count = 0;
    for (const participant of this.participants.values()) if (participant.pos) count += 1;
    return count;
  }

  // Nhận vị trí người chơi gửi lên: giữ trong vùng thô của phòng, chặn đi nhanh hơn maxSpeed (kéo về theo hướng đi),
  // làm tròn 1 cm; gom lại phát mỗi 200 ms thay vì phát từng tin.
  move(participantId, { x, z, ry, moving }) {
    const world = this.rules.world;
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!world) return { ok: false, error: 'NOT_ALLOWED' };
    if (!participant.pos && this.walkers >= world.maxWalkers) return { ok: false, error: 'WALKERS_FULL' };
    if (!this.allow(`${participantId}:move`, 8, 1_000)) return { ok: false, error: 'RATE_LIMITED' };
    const now = Date.now();
    let next = { x, z };
    if (participant.pos && participant.movedAt) {
      // Cộng 0,3 giây dung sai: mạng hay dồn tin (hai tin gửi cách 0,2 giây có thể tới cách nhau rất gần), nếu không
      // người đang chạy bị cắt quãng đường, sai lệch cộng dồn rồi bị kéo ngược. Vẫn chặn dịch chuyển tức thời.
      const limit = (world.maxSpeed * (now - participant.movedAt + 300)) / 1_000 + 0.6;
      const dx = x - participant.pos.x;
      const dz = z - participant.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance > limit) next = { x: participant.pos.x + (dx / distance) * limit, z: participant.pos.z + (dz / distance) * limit };
    }
    const clamp = (value, [min, max]) => Math.round(Math.min(Math.max(value, min), max) * 100) / 100;
    const zoneBefore = participant.pos ? this.zoneOf(participant.pos) : null;
    participant.pos = { x: clamp(next.x, world.bounds.x), z: clamp(next.z, world.bounds.z), ry: Math.round(ry * 100) / 100 };
    participant.movedAt = now;
    participant.moving = moving;
    const activeChore = this.activeChoreOf(participantId);
    if (activeChore && Math.hypot(participant.pos.x - activeChore.x, participant.pos.z - activeChore.z) > activeChore.radius) {
      this.stopChore(participantId, activeChore.id);
    }
    if (this.view && zoneBefore !== this.zoneOf(participant.pos)) this.viewsStale = true;
    // Đứng dậy đi thì rời bồ đoàn/ghế đá và thôi quỳ/lạy.
    if (moving && (participant.seatId || participant.benchId || participant.emote)) {
      participant.seatId = null;
      participant.benchId = null;
      participant.benchSpot = null;
      participant.emote = null;
      participant.sutra = null;
      this.revision += 1;
      this.broadcastState();
    }
    this.pendingMoves.set(participantId, participant);
    if (!this.moveTimer) {
      this.moveTimer = setTimeout(() => this.flushMoves(), MOVE_BATCH_MS);
      this.moveTimer.unref?.();
    }
    return { ok: true };
  }

  // Đi nhanh giữa ba khu cố định. Client chỉ gửi tên đích; tọa độ lấy từ room rules để không biến lệnh này thành
  // cách vượt va chạm hoặc dịch chuyển tới vị trí tùy ý. Vị trí mới vẫn được phát qua room.moves như đi bộ.
  travel(participantId, destination) {
    const world = this.rules.world;
    const participant = this.participants.get(participantId);
    const target = world?.travel?.[destination];
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!target) return { ok: false, error: 'NOT_ALLOWED' };
    if (!participant.pos && this.walkers >= world.maxWalkers) return { ok: false, error: 'WALKERS_FULL' };
    if (!this.allow(`${participantId}:travel`, 3, 10_000)) return { ok: false, error: 'RATE_LIMITED' };

    const zoneBefore = participant.pos ? this.zoneOf(participant.pos) : null;
    const hadState = Boolean(participant.seatId || participant.benchId || participant.emote);
    participant.pos = { x: target.x, z: target.z, ry: target.ry };
    participant.movedAt = Date.now();
    participant.moving = false;
    participant.seatId = null;
    participant.benchId = null;
    participant.benchSpot = null;
    participant.emote = null;
    participant.sutra = null;
    this.stopChore(participantId);
    if (this.view && zoneBefore !== this.zoneOf(participant.pos)) this.viewsStale = true;
    if (hadState) {
      this.revision += 1;
      this.broadcastState();
    }
    this.pendingMoves.set(participantId, participant);
    if (!this.moveTimer) {
      this.moveTimer = setTimeout(() => this.flushMoves(), MOVE_BATCH_MS);
      this.moveTimer.unref?.();
    }
    return { ok: true };
  }

  flushMoves() {
    this.moveTimer = null;
    if (!this.pendingMoves.size || this.closed) return;
    const moves = [...this.pendingMoves.values()]
      .filter((participant) => this.participants.has(participant.id) && participant.pos)
      .map(({ id, pos, moving }) => ({ id, x: pos.x, z: pos.z, ry: pos.ry, m: Boolean(moving) }));
    this.pendingMoves.clear();
    if (!moves.length) return;
    if (!this.view) {
      this.broadcast({ v: PROTOCOL_VERSION, type: 'room.moves', epoch: this.epoch, moves });
      return;
    }
    // Mỗi người chỉ nhận vị trí của những người mình đang thấy.
    this.ensureViews();
    const encoded = new Map(moves.map((item) => [item.id, JSON.stringify(item)]));
    const head = `{"v":${PROTOCOL_VERSION},"type":"room.moves","epoch":${this.epoch},"moves":[`;
    for (const viewer of this.participants.values()) {
      if (!viewer.socket || !viewer.view) continue;
      const mine = [];
      for (const id of viewer.view) {
        const text = encoded.get(id);
        if (text) mine.push(text);
      }
      if (mine.length) sendRaw(viewer.socket, `${head}${mine.join(',')}]}`);
    }
  }

  // Nhà chùa đã nhận sớ: cả phòng thấy thầy nhận sớ của ai (tên trong phòng), không có tên người được cầu nguyện.
  announcePrayer(participantId, kind) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (this.type !== 'thien') return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${participantId}:prayer`, 3, 10 * 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    this.broadcast({ v: PROTOCOL_VERSION, type: 'prayer.received', epoch: this.epoch, participantId, displayName: participant.displayName, kind, at: Date.now() });
    return { ok: true };
  }

  // Động tác: quỳ, lạy 3 lạy, lạy 108 lạy, đứng; người vào sau thấy người đang quỳ/lạy qua room.state.
  // Thả cảm xúc: chỉ phát lại cho cả phòng, không lưu vào trạng thái (người vào sau không cần thấy).
  reaction(participantId, kind) {
    if (!this.participants.has(participantId)) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.allow(`${participantId}:reaction`, 6, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    this.broadcast({ v: PROTOCOL_VERSION, type: 'reaction', epoch: this.epoch, participantId, kind, at: Date.now() });
    return { ok: true };
  }

  emote(participantId, kind, sutra) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.rules.world) return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${participantId}:emote`, 5, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    this.stopChore(participantId);
    const leftBench = Boolean(participant.benchId);
    participant.benchId = null;
    participant.benchSpot = null;
    participant.emote = kind === 'stand' ? null : kind;
    participant.sutra = kind === 'chant' && sutra ? sutra : null;
    if (leftBench) {
      this.revision += 1;
      this.broadcastState();
    }
    this.broadcast({ v: PROTOCOL_VERSION, type: 'emote', epoch: this.epoch, participantId, kind, at: Date.now(), ...(participant.sutra ? { sutra: participant.sutra } : {}) });
    return { ok: true };
  }

  // ---- Kết bạn: lời mời tới người trong phòng; chấp nhận thì lưu vào tài khoản khi cả hai đã đăng nhập. ----
  sendTo(participantId, message) {
    send(this.participants.get(participantId)?.socket, message);
  }

  friendState(fromId, toId, status, saved) {
    const message = { v: PROTOCOL_VERSION, type: 'friend.state', epoch: this.epoch, fromId, toId, status, ...(saved !== undefined ? { saved } : {}) };
    this.sendTo(fromId, message);
    this.sendTo(toId, message);
  }

  // Một trong hai đã chặn người kia: không gửi lời mời được (không nói ai chặn ai).
  blockedBetween(first, second) {
    return Boolean(first?.blocked?.has(second?.id) || second?.blocked?.has(first?.id));
  }

  friendRequest(fromId, targetId) {
    const from = this.participants.get(fromId);
    const target = this.participants.get(targetId);
    if (!from || !target || fromId === targetId) return { ok: false, error: 'NOT_IN_ROOM' };
    if (target.bot || this.blockedBetween(from, target)) return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${fromId}:friend`, 5, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    // Người kia đã mời mình trước: coi như hai bên cùng đồng ý.
    if (this.friendRequests.has(`${targetId}>${fromId}`)) return this.friendRespond(fromId, targetId, true);
    this.friendRequests.set(`${fromId}>${targetId}`, Date.now() + FRIEND_REQUEST_TTL_MS);
    this.friendState(fromId, targetId, 'pending');
    return { ok: true };
  }

  friendRespond(toId, fromId, accept) {
    const key = `${fromId}>${toId}`;
    const expiresAt = this.friendRequests.get(key);
    if (!expiresAt || expiresAt < Date.now()) {
      this.friendRequests.delete(key);
      return { ok: false, error: 'NO_REQUEST' };
    }
    this.friendRequests.delete(key);
    if (!accept) {
      this.friendState(fromId, toId, 'declined');
      return { ok: true };
    }
    const first = this.participants.get(fromId)?.accountId;
    const second = this.participants.get(toId)?.accountId;
    if (!first || !second || !this.onFriend) {
      this.friendState(fromId, toId, 'accepted', false);
      return { ok: true };
    }
    Promise.resolve(this.onFriend({ action: 'add', first, second }))
      .then((result) => this.friendState(fromId, toId, 'accepted', Boolean(result?.ok)))
      .catch(() => this.friendState(fromId, toId, 'accepted', false));
    return { ok: true };
  }

  // ---- Khiêu chiến (kéo búa bao): server làm trọng tài, giữ kín lựa chọn tới khi cả hai đã ra. ----
  activeChallengeOf(participantId) {
    for (const challenge of this.challenges.values()) {
      if ((challenge.fromId === participantId || challenge.toId === participantId) && ['pending', 'playing'].includes(challenge.status)) return challenge;
    }
    return null;
  }

  challengeState(challenge) {
    const message = {
      v: PROTOCOL_VERSION,
      type: 'challenge.state',
      epoch: this.epoch,
      challengeId: challenge.id,
      game: challenge.game,
      fromId: challenge.fromId,
      toId: challenge.toId,
      status: challenge.status,
      round: challenge.round,
      fromScore: challenge.fromScore,
      toScore: challenge.toScore,
      target: CHALLENGE_TARGET,
      ...(['pending', 'playing'].includes(challenge.status) ? { deadline: challenge.deadline } : {}),
      ...(challenge.status === 'playing' ? { moved: { from: Boolean(challenge.choices.from), to: Boolean(challenge.choices.to) } } : {}),
      ...(challenge.last ? { last: challenge.last } : {}),
      ...(challenge.winner ? { winner: challenge.winner } : {}),
    };
    this.sendTo(challenge.fromId, message);
    this.sendTo(challenge.toId, message);
  }

  // Kết thúc trận (từ chối, huỷ, hết hạn, xong): báo hai bên rồi xoá sau một lúc.
  endChallenge(challenge, status) {
    clearTimeout(challenge.timer);
    challenge.status = status;
    this.challengeState(challenge);
    challenge.timer = setTimeout(() => this.challenges.delete(challenge.id), CHALLENGE_LINGER_MS);
    challenge.timer.unref?.();
  }

  challengeSend(fromId, targetId, game) {
    const from = this.participants.get(fromId);
    const target = this.participants.get(targetId);
    if (!from || !target || fromId === targetId) return { ok: false, error: 'NOT_IN_ROOM' };
    if (this.blockedBetween(from, target)) return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${fromId}:challenge`, 5, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    if (this.activeChallengeOf(fromId) || this.activeChallengeOf(targetId)) return { ok: false, error: 'BUSY' };
    const challenge = {
      id: `g-${randomUUID()}`,
      game,
      fromId,
      toId: targetId,
      status: 'pending',
      round: 0,
      fromScore: 0,
      toScore: 0,
      choices: { from: null, to: null },
      last: null,
      winner: null,
      deadline: Date.now() + CHALLENGE_INVITE_MS,
      timer: null,
    };
    this.challenges.set(challenge.id, challenge);
    challenge.timer = setTimeout(() => this.endChallenge(challenge, 'expired'), CHALLENGE_INVITE_MS);
    challenge.timer.unref?.();
    this.challengeState(challenge);
    // Bot (đã ghi rõ là máy trên thẻ thông tin) nhận lời sau chốc lát để người chơi một mình vẫn thử được.
    if (target.bot) {
      const accept = setTimeout(() => {
        if (challenge.status === 'pending') this.challengeRespond(targetId, challenge.id, true);
      }, 1_200 + Math.random() * 1_000);
      accept.unref?.();
    }
    return { ok: true, challengeId: challenge.id };
  }

  challengeRespond(participantId, challengeId, accept) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.toId !== participantId || challenge.status !== 'pending') return { ok: false, error: 'NO_CHALLENGE' };
    clearTimeout(challenge.timer);
    if (!accept) {
      this.endChallenge(challenge, 'declined');
      return { ok: true };
    }
    challenge.status = 'playing';
    this.startRound(challenge);
    return { ok: true };
  }

  startRound(challenge) {
    challenge.round += 1;
    challenge.choices = { from: null, to: null };
    challenge.deadline = Date.now() + CHALLENGE_ROUND_MS;
    challenge.timer = setTimeout(() => this.resolveRound(challenge), CHALLENGE_ROUND_MS);
    challenge.timer.unref?.();
    this.challengeState(challenge);
    for (const side of ['from', 'to']) {
      const playerId = side === 'from' ? challenge.fromId : challenge.toId;
      if (!this.participants.get(playerId)?.bot) continue;
      const round = challenge.round;
      const think = setTimeout(() => {
        if (challenge.status === 'playing' && challenge.round === round) {
          this.challengeMove(playerId, challenge.id, RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)]);
        }
      }, 1_000 + Math.random() * 2_500);
      think.unref?.();
    }
  }

  challengeMove(participantId, challengeId, choice) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.status !== 'playing') return { ok: false, error: 'NO_CHALLENGE' };
    const side = participantId === challenge.fromId ? 'from' : participantId === challenge.toId ? 'to' : null;
    if (!side) return { ok: false, error: 'NO_CHALLENGE' };
    if (!this.allow(`${participantId}:challenge-move`, 10, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    if (challenge.choices[side]) return { ok: false, error: 'ALREADY_MOVED' };
    challenge.choices[side] = choice;
    if (challenge.choices.from && challenge.choices.to) this.resolveRound(challenge);
    else this.challengeState(challenge);
    return { ok: true };
  }

  // Chấm lượt: ai không ra tay trong 10 giây thì thua lượt (cả hai không ra là hoà).
  resolveRound(challenge) {
    if (challenge.status !== 'playing') return;
    clearTimeout(challenge.timer);
    const { from, to } = challenge.choices;
    const winner = from && to
      ? (from === to ? 'draw' : BEATS[from] === to ? 'from' : 'to')
      : from ? 'from' : to ? 'to' : 'draw';
    if (winner === 'from') challenge.fromScore += 1;
    if (winner === 'to') challenge.toScore += 1;
    challenge.last = { from, to, winner };
    const done = challenge.fromScore >= CHALLENGE_TARGET || challenge.toScore >= CHALLENGE_TARGET || challenge.round >= CHALLENGE_MAX_ROUNDS;
    if (done) {
      challenge.winner = challenge.fromScore === challenge.toScore ? 'draw' : challenge.fromScore > challenge.toScore ? 'from' : 'to';
      this.endChallenge(challenge, 'finished');
      return;
    }
    this.startRound(challenge);
  }

  challengeCancel(participantId, challengeId) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || ![challenge.fromId, challenge.toId].includes(participantId) || !['pending', 'playing'].includes(challenge.status)) {
      return { ok: false, error: 'NO_CHALLENGE' };
    }
    this.endChallenge(challenge, 'cancelled');
    return { ok: true };
  }

  // ---- Chặn / báo cáo ----
  block(participantId, targetId, blocked) {
    const participant = this.participants.get(participantId);
    if (!participant || participantId === targetId) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.allow(`${participantId}:block`, 20, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    // Người dựng lại từ bản ghi (máy khác giữ phòng) chưa có danh sách chặn.
    participant.blocked ||= new Set();
    if (!blocked) {
      participant.blocked.delete(targetId);
      return { ok: true };
    }
    participant.blocked.add(targetId);
    // Huỷ lời mời và trận đang có giữa hai người.
    this.friendRequests.delete(`${participantId}>${targetId}`);
    this.friendRequests.delete(`${targetId}>${participantId}`);
    for (const challenge of this.challenges.values()) {
      const pair = [challenge.fromId, challenge.toId];
      if (pair.includes(participantId) && pair.includes(targetId) && ['pending', 'playing'].includes(challenge.status)) this.endChallenge(challenge, 'cancelled');
    }
    return { ok: true };
  }

  reportPlayer(participantId, targetId, reason, note) {
    const reporter = this.participants.get(participantId);
    const target = this.participants.get(targetId);
    if (!reporter || !target || participantId === targetId) return { ok: false, error: 'NOT_IN_ROOM' };
    if (target.bot) return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${participantId}:report`, 3, 10 * 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    Promise.resolve(this.onReport({
      roomId: this.id,
      reporterAccount: reporter.accountId || null,
      reporterName: reporter.displayName,
      targetAccount: target.accountId || null,
      targetName: target.displayName,
      reason,
      note: note ? note.replace(/\s+/g, ' ').trim().slice(0, 200) : null,
    })).catch(() => {});
    return { ok: true };
  }

  // Người rời phòng hẳn: huỷ trận và lời mời kết bạn của người đó.
  dropSocial(participantId) {
    for (const key of this.friendRequests.keys()) if (key.split('>').includes(participantId)) this.friendRequests.delete(key);
    for (const challenge of this.challenges.values()) {
      if ([challenge.fromId, challenge.toId].includes(participantId) && ['pending', 'playing'].includes(challenge.status)) {
        this.endChallenge(challenge, 'cancelled');
      }
    }
  }

  // Bản ghi lưu vào danh bạ phòng để máy khác dựng lại phòng khi máy này chết.
  toRecord() {
    return {
      revision: this.revision,
      playback: { current: this.playback.current, queue: this.playback.queue },
      chores: [...this.chores.values()].map(({ id, progress, completedAt, resetAt }) => ({ id, progress: Math.round(progress), completedAt, resetAt })),
      participants: [...this.participants.values()].filter((participant) => !participant.bot)
        .map(({ id, displayName, seatId, benchId, benchSpot, resumeToken, skin, merit, accountId, level, avatarUrl }) => ({
          id, displayName, seatId, benchId, benchSpot, resumeToken, skin, merit, ...(accountId ? { accountId, level, avatarUrl } : {}),
        })),
    };
  }

  // Mọi người trong bản ghi coi như vừa rớt mạng: giữ ghế trong thời hạn resume tính từ lúc dựng lại.
  // Bản ghi hỏng thì bỏ qua từng mục hỏng; người không còn trong phòng sẽ được báo INVALID_RESUME_TOKEN và vào lại.
  restore(record) {
    const items = Array.isArray(record?.participants) ? record.participants : [];
    const seats = new Set();
    const benchSpots = new Set();
    for (const item of items) {
      if (!validRecordParticipant(item, this.seatIds, this.benchIds, this.seatsPerBench) || this.participants.has(item.id)) continue;
      if (item.seatId && seats.has(item.seatId)) item.seatId = null;
      if (item.seatId) seats.add(item.seatId);
      const benchKey = item.benchId ? `${item.benchId}:${item.benchSpot}` : null;
      if (benchKey && benchSpots.has(benchKey)) {
        item.benchId = null;
        item.benchSpot = null;
      } else if (benchKey) benchSpots.add(benchKey);
      const participant = {
        id: item.id,
        displayName: item.displayName,
        seatId: item.seatId || null,
        benchId: item.benchId || null,
        benchSpot: item.benchId ? item.benchSpot : null,
        socket: null,
        connected: false,
        resumeToken: item.resumeToken,
        ...(typeof item.accountId === 'string' && /^a-[a-zA-Z0-9-]{8,64}$/.test(item.accountId)
          ? { accountId: item.accountId, ...(validLevel(item.level) ? { level: item.level } : {}), ...(AVATAR_URL.test(item.avatarUrl || '') ? { avatarUrl: item.avatarUrl } : {}) } : {}),
        resumeExpiresAt: Date.now() + this.resumeTtlMs,
        expireTimer: null,
        ...this.personalization(item.id, item),
      };
      this.participants.set(item.id, participant);
      this.scheduleExpiry(participant);
    }
    this.revision = (Number.isSafeInteger(record?.revision) ? record.revision : 0) + 1;
    for (const item of Array.isArray(record?.chores) ? record.chores : []) {
      const chore = this.chores.get(item?.id);
      if (!chore || !Number.isSafeInteger(item.progress) || item.progress < 0 || item.progress > 1_000) continue;
      chore.progress = item.progress;
      chore.completedAt = Number.isSafeInteger(item.completedAt) && item.completedAt >= 0 ? item.completedAt : null;
      chore.resetAt = Number.isSafeInteger(item.resetAt) && item.resetAt >= 0 ? item.resetAt : null;
      if (chore.resetAt) this.startChoreTimer();
    }
    if (this.realCount > 0) this.ensureBots();
    const playback = record?.playback;
    if (playback && typeof playback === 'object') {
      this.playback.queue = (Array.isArray(playback.queue) ? playback.queue : []).filter(validQueueItem).slice(0, MAX_QUEUE);
      const current = playback.current;
      if (validQueueItem(current) && Number.isSafeInteger(current.startedAt)) {
        this.playback.current = current;
        this.scheduleEnd();
      } else if (this.playback.queue.length) this.advance();
    }
  }

  // ---- Phát video: server giữ bài đang chiếu, giờ bắt đầu và hàng chờ; client tự đồng bộ theo giờ server. ----
  votesNeeded() {
    return Math.max(1, Math.ceil((this.connectedCount * this.skipVotePercent) / 100));
  }

  playbackState() {
    const { current, queue, votes } = this.playback;
    return {
      v: PROTOCOL_VERSION,
      type: 'playback.state',
      epoch: this.epoch,
      current: current ? { ...current } : null,
      queue: queue.map(({ itemId, videoId, title, addedBy }) => ({ itemId, videoId, title, addedBy })),
      votes: votes.size,
      votesNeeded: this.votesNeeded(),
    };
  }

  broadcastPlayback() {
    this.revision += 1;
    this.broadcast(this.playbackState());
  }

  addVideo(participantId, videoId, title) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    const { current, queue } = this.playback;
    if (queue.length >= MAX_QUEUE) return { ok: false, error: 'QUEUE_FULL' };
    if (current?.videoId === videoId || queue.some((item) => item.videoId === videoId)) return { ok: false, error: 'ALREADY_QUEUED' };
    if (queue.filter((item) => item.addedById === participantId).length >= MAX_QUEUED_PER_PERSON) {
      return { ok: false, error: 'TOO_MANY_QUEUED' };
    }
    queue.push({ itemId: `q-${randomUUID()}`, videoId, title, addedBy: participant.displayName, addedById: participantId });
    if (!current) this.advance();
    else this.broadcastPlayback();
    return { ok: true };
  }

  advance() {
    const playback = this.playback;
    clearTimeout(playback.timer);
    playback.timer = null;
    playback.votes.clear();
    playback.errors.clear();
    playback.durations = [];
    const next = playback.queue.shift();
    playback.current = next
      ? { itemId: next.itemId, videoId: next.videoId, title: next.title, addedBy: next.addedBy, startedAt: Date.now() + START_DELAY_MS }
      : null;
    this.broadcastPlayback();
  }

  scheduleEnd() {
    const playback = this.playback;
    clearTimeout(playback.timer);
    playback.timer = null;
    const current = playback.current;
    if (!current?.duration || this.closed) return;
    const delay = current.startedAt + current.duration * 1_000 + END_GRACE_MS - Date.now();
    playback.timer = setTimeout(() => this.advance(), Math.max(0, delay));
    playback.timer.unref?.();
  }

  voteSkip(participantId, itemId) {
    const playback = this.playback;
    if (!playback.current || playback.current.itemId !== itemId) return { ok: false, error: 'STALE_ITEM' };
    playback.votes.add(participantId);
    if (playback.votes.size >= this.votesNeeded()) this.advance();
    else this.broadcastPlayback();
    return { ok: true };
  }

  // Thời lượng lấy trung vị cao của các báo cáo, để một client báo sai không cắt ngang bài của cả phòng.
  report(participantId, itemId, event, value) {
    const playback = this.playback;
    const current = playback.current;
    if (!current || current.itemId !== itemId) return;
    if (event === 'duration') {
      // Dưới 3 giây thường là livestream hoặc trình phát chưa nạp xong: bỏ qua để không cắt bài.
      if (value < 3) return;
      if (playback.durations.some((item) => item.participantId === participantId) || playback.durations.length >= 15) return;
      playback.durations.push({ participantId, value });
      const sorted = playback.durations.map((item) => item.value).sort((a, b) => a - b);
      const duration = Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
      if (duration !== current.duration) {
        current.duration = duration;
        this.scheduleEnd();
        this.broadcastPlayback();
      }
    } else if (event === 'ended') {
      if (current.duration && Date.now() >= current.startedAt + current.duration * 1_000 - 5_000) this.advance();
    } else if (event === 'error') {
      playback.errors.add(participantId);
      if (playback.errors.size >= this.votesNeeded()) this.advance();
    }
  }

  // Đếm theo phòng nên giới hạn của một người vẫn giữ khi người đó nối lại.
  allow(key, limit, windowMs) {
    const now = Date.now();
    const recent = (this.rates.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    this.rates.set(key, recent);
    return true;
  }

  // Người thật đang kết nối (không tính bot): dùng cho vote, số người ở sảnh, ngưỡng lỗi phát.
  get connectedCount() {
    let count = 0;
    for (const participant of this.participants.values()) if (participant.connected && !participant.bot) count += 1;
    return count;
  }

  get realCount() {
    let count = 0;
    for (const participant of this.participants.values()) if (!participant.bot) count += 1;
    return count;
  }

  // ---- Bot: chỉ có khi phòng có người thật; một số ngồi bồ đoàn, một số đi dạo ngoài khuôn viên. ----
  freeSeat(except) {
    const taken = new Set([...this.participants.values()].map((participant) => participant.seatId).filter(Boolean));
    return [...this.seatIds].find((seatId) => seatId !== except && !taken.has(seatId)) || null;
  }

  // Bot không bị đẩy khỏi ghế khi có người bấm vào. Khi số người thật tăng, bot ngồi rời trước để mỗi người thật
  // vẫn có bồ đoàn; bot đi dạo ngoài sân không chiếm ghế nên vẫn ở lại cả khi chánh điện đã đủ chỗ ngồi.
  get botWalkingTarget() {
    return Math.min(this.botCount, this.rules.bots?.walk?.count || 0);
  }

  get botSeatedTarget() {
    const freeForBots = Math.max(0, (this.rules.seats || 0) - this.realCount);
    return Math.min(this.botCount - this.botWalkingTarget, freeForBots);
  }

  get botTargetCount() {
    return this.botWalkingTarget + this.botSeatedTarget;
  }

  trimBotsForPeople() {
    const bots = () => [...this.participants.values()].filter((participant) => participant.bot);
    const remove = (bot) => {
      this.dropSocial(bot.id);
      this.participants.delete(bot.id);
    };
    const seated = bots().filter((bot) => bot.seatId);
    while (seated.length > this.botSeatedTarget) remove(seated.pop());
    const remaining = bots();
    while (remaining.length > this.botTargetCount) {
      remove(remaining.pop());
    }
  }

  // Bot vào lần lượt: vài người ngồi sẵn để chánh điện không trống, số còn lại vào dần; thỉnh thoảng có bot rời đi
  // và người khác vào thay. Mỗi bot có nhịp riêng (người hay tụng, người ít nói).
  ensureBots() {
    const config = this.rules.bots;
    if (!config || this.closed || this.botCount === 0) return;
    if (!this.botState) {
      this.botState = { serial: 0, nextArrivalAt: 0, nextChurnAt: Date.now() + randomBetween(config.churnMs) };
      for (let index = 0; index < Math.min(config.initial, this.botTargetCount); index += 1) this.addBot(true);
      this.botState.nextArrivalAt = Date.now() + randomBetween(config.arrivalMs);
    }
    if (!this.botTimer) {
      this.botTimer = setInterval(() => this.botTick(), 1_000);
      this.botTimer.unref?.();
    }
  }

  // Tên và câu tụng của bot theo ngôn ngữ phòng (phòng tiếng Anh có bot tên tiếng Anh, tụng tiếng Anh…).
  botWords() {
    const config = this.rules.bots;
    return config.byLang?.[this.lang] || config;
  }

  addBot(seeded = false) {
    const config = this.rules.bots;
    const state = this.botState;
    const used = new Set([...this.participants.values()].map((participant) => participant.displayName));
    const names = this.botWords().names.filter((name) => !used.has(name));
    const walkingNow = [...this.participants.values()].filter((participant) => participant.bot && participant.pos).length;
    const walkLimit = seeded ? (config.walk?.initial || 0) : (config.walk?.count || 0);
    const walking = Boolean(config.walk?.waypoints?.length && walkingNow < Math.min(walkLimit, this.botTargetCount));
    const seatId = walking ? null : this.freeSeat();
    if (!names.length || (!walking && !seatId)) return null;
    state.serial += 1;
    const id = `bot-${state.serial}`;
    const bot = {
      id,
      displayName: names[Math.floor(Math.random() * names.length)],
      seatId,
      socket: null,
      connected: true,
      bot: true,
      resumeToken: null,
      expireTimer: null,
      skin: this.freeSkins[Math.floor(Math.random() * this.freeSkins.length)],
      merit: seeded ? [120, 80, 55, 30, 20, 12, 8, 5][state.serial - 1] || 0 : Math.floor(Math.random() * 40),
      // Nhịp riêng: 0,6 → tụng nhiều; 1,8 → ít nói.
      pace: 0.6 + Math.random() * 1.2,
      nextActionAt: Date.now() + randomBetween(config.actionMs) * (seeded ? 0.5 : 1),
    };
    if (walking) {
      const waypointIndex = (state.serial - 1) % config.walk.waypoints.length;
      const start = config.walk.waypoints[waypointIndex];
      bot.pos = { x: start.x, z: start.z, ry: 0 };
      bot.moving = false;
      bot.walk = {
        waypointIndex: (waypointIndex + 1) % config.walk.waypoints.length,
        lastAt: Date.now(),
        waitUntil: Date.now() + randomBetween(config.walk.pauseMs),
      };
    }
    this.participants.set(id, bot);
    return bot;
  }

  advanceBotWalk(bot, now = Date.now()) {
    const config = this.rules.bots?.walk;
    if (!bot.pos || !bot.walk || !config?.waypoints?.length) return false;
    if (now < bot.walk.waitUntil) return false;
    const target = config.waypoints[bot.walk.waypointIndex];
    const dx = target.x - bot.pos.x;
    const dz = target.z - bot.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      bot.walk.waypointIndex = (bot.walk.waypointIndex + 1) % config.waypoints.length;
      bot.walk.waitUntil = now + randomBetween(config.pauseMs);
      bot.walk.lastAt = now;
      if (bot.moving) this.move(bot.id, { ...bot.pos, ry: bot.pos.ry, moving: false });
      return true;
    }
    const elapsed = Math.min(1.5, Math.max(0.05, (now - bot.walk.lastAt) / 1_000));
    const step = Math.min(distance, config.speed * elapsed);
    bot.walk.lastAt = now;
    return this.move(bot.id, {
      x: bot.pos.x + (dx / distance) * step,
      z: bot.pos.z + (dz / distance) * step,
      ry: headingOf(dx, dz),
      moving: step < distance,
    }).ok;
  }

  removeBots() {
    clearInterval(this.botTimer);
    this.botTimer = null;
    this.botState = null;
    for (const [id, participant] of this.participants) {
      if (!participant.bot) continue;
      this.dropSocial(id);
      this.participants.delete(id);
    }
  }

  botTick() {
    if (!this.connectedCount || !this.botState) return;
    const config = this.rules.bots;
    const state = this.botState;
    const now = Date.now();
    const bots = [...this.participants.values()].filter((participant) => participant.bot);
    const target = this.botTargetCount;
    let changed = false;
    if (bots.length > target) {
      this.dropSocial(bots[bots.length - 1].id);
      this.participants.delete(bots[bots.length - 1].id);
      changed = true;
    } else if (bots.length < target && now >= state.nextArrivalAt) {
      changed = Boolean(this.addBot());
      state.nextArrivalAt = now + randomBetween(config.arrivalMs);
    } else if (bots.length && now >= state.nextChurnAt) {
      const leaving = bots[Math.floor(Math.random() * bots.length)];
      // Bot đang chơi khiêu chiến thì không rời giữa trận.
      if (!this.activeChallengeOf(leaving.id)) this.participants.delete(leaving.id);
      state.nextChurnAt = now + randomBetween(config.churnMs);
      state.nextArrivalAt = now + randomBetween(config.arrivalMs);
      changed = true;
    }
    if (changed) {
      this.revision += 1;
      this.broadcastState();
    }
    for (const bot of bots) {
      if (this.participants.has(bot.id)) this.advanceBotWalk(bot, now);
      if (!this.participants.has(bot.id) || now < bot.nextActionAt) continue;
      bot.nextActionAt = now + randomBetween(config.actionMs) * bot.pace;
      this.botAct(bot);
    }
  }

  // Tụng một câu kinh, hoặc dâng lễ (dâng hương là thường nhất), đôi khi kèm lời nguyện. Bot không thỉnh chuông.
  botAct(bot) {
    const config = this.rules.bots;
    const { lines } = this.botWords();
    const line = () => lines[Math.floor(Math.random() * lines.length)];
    // Bot đang đi ngoài sân chỉ trò chuyện/niệm Phật; lễ vật được dâng bởi bot đang ở chánh điện.
    if (bot.pos) {
      this.broadcast({
        v: PROTOCOL_VERSION,
        type: 'chat.message',
        epoch: this.epoch,
        messageId: `m-${randomUUID()}`,
        participantId: bot.id,
        displayName: bot.displayName,
        text: line(),
        sentAt: Date.now(),
      });
      return;
    }
    const roll = Math.random();
    if (roll < 0.5) {
      this.broadcast({
        v: PROTOCOL_VERSION,
        type: 'chat.message',
        epoch: this.epoch,
        messageId: `m-${randomUUID()}`,
        participantId: bot.id,
        displayName: bot.displayName,
        text: line(),
        sentAt: Date.now(),
      });
    } else {
      const kind = roll < 0.8 ? 'incense' : roll < 0.92 ? 'petal' : 'lotus';
      this.offer(bot.id, kind, Math.random() < 0.4 ? line() : undefined);
    }
  }

  broadcast(message) {
    for (const participant of this.participants.values()) send(participant.socket, message);
  }

  broadcastState() {
    if (this.view) {
      // Ghế, ghế đá, người vào/ra có thể đổi danh sách "ai thấy ai": phòng nhỏ tính lại ngay, phòng đông chờ nhịp.
      this.viewsStale = true;
      this.broadcastViews();
    } else this.broadcast(this.snapshot());
  }

  join(socket, claims, resumeToken, options = {}) {
    if (this.realCount >= this.maxParticipants && !this.participants.has(claims.participantId)) return false;
    const previous = this.participants.get(claims.participantId);
    if (resumeToken && (!previous || previous.resumeToken !== resumeToken
      || (!previous.connected && previous.resumeExpiresAt <= Date.now()))) {
      return { ok: false, error: 'INVALID_RESUME_TOKEN' };
    }
    if (previous?.socket && previous.socket !== socket) previous.socket.close(4001, 'Phiên mới đã kết nối');
    if (previous?.expireTimer) clearTimeout(previous.expireTimer);
    const participant = {
      id: claims.participantId,
      displayName: claims.displayName,
      seatId: previous?.seatId || null,
      benchId: previous?.benchId || null,
      benchSpot: previous?.benchId ? previous.benchSpot : null,
      socket,
      connected: true,
      resumeToken: previous?.resumeToken || this.issueResumeToken(claims),
      ...(claims.accountId ? {
        accountId: claims.accountId,
        level: validLevel(claims.level) ? claims.level : previous?.level || 1,
        ...(claims.avatarUrl ? { avatarUrl: claims.avatarUrl } : {}),
        // Hình đã mua (theo vé); nối lại bằng resume token thì giữ danh sách cũ.
        ownedSkins: claims.skins || previous?.ownedSkins || [],
      } : {}),
      resumeExpiresAt: 0,
      expireTimer: null,
      // Danh sách người mình chặn (giữ khi nối lại).
      blocked: previous?.blocked || new Set(),
      ...this.personalization(claims.participantId, previous),
    };
    this.participants.set(claims.participantId, participant);
    this.table?.start();
    this.trimBotsForPeople();
    this.ensureBots();
    if (this.view) {
      this.viewsStale = true;
      this.startViews();
    }
    this.revision += 1;
    if (options.broadcast !== false) this.broadcastState();
    return { ok: true, participant, resumed: Boolean(previous && resumeToken) };
  }

  scheduleExpiry(participant) {
    participant.expireTimer = setTimeout(() => this.expire(participant.id, participant.resumeToken), this.resumeTtlMs);
    participant.expireTimer.unref?.();
  }

  disconnect(participantId, socket) {
    const participant = this.participants.get(participantId);
    if (!participant || participant.socket !== socket) return false;
    participant.socket = null;
    participant.connected = false;
    participant.resumeExpiresAt = Date.now() + this.resumeTtlMs;
    this.stopChore(participantId);
    this.scheduleExpiry(participant);
    this.revision += 1;
    this.broadcastState();
    return true;
  }

  expire(participantId, resumeToken) {
    const participant = this.participants.get(participantId);
    if (!participant || participant.connected || participant.resumeToken !== resumeToken) return false;
    this.participants.delete(participantId);
    this.stopChore(participantId);
    this.dropSocial(participantId);
    for (const key of this.rates.keys()) if (key.startsWith(`${participantId}:`)) this.rates.delete(key);
    if (this.realCount === 0) {
      this.removeBots();
      this.stopViews();
      this.table?.stop();
    }
    this.revision += 1;
    this.broadcastState();
    if (this.participants.size === 0) this.onEmpty();
    return true;
  }

  // Hình nhân vật chỉ có ở loại phòng có danh sách skin (chánh điện, rạp phim); giữ nguyên khi nối lại/dựng lại.
  personalization(participantId, previous) {
    const skins = this.rules.skins;
    if (!skins) return {};
    // Hình mua trong shop không chia cho ai; chỉ giữ lại khi người đó đang mặc (nối lại).
    const keep = skins.includes(previous?.skin) || isShopSkin(previous?.skin);
    const skin = keep ? previous.skin : this.freeSkins[hashText(participantId) % this.freeSkins.length];
    // Công đức chỉ có ở phòng có lễ vật (chánh điện); rạp phim chỉ có hình nhân vật Nam/Nữ.
    if (!this.rules.interaction?.offerings) return { skin };
    const merit = Number.isSafeInteger(previous?.merit) && previous.merit >= 0 ? previous.merit : 0;
    return { skin, merit };
  }

  setSkin(participantId, skin) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    // Phòng có hình nhân vật thì nhận cả nhân vật admin tải lên (shop-…), miễn là người đó đã mua.
    if (!this.rules.skins || !(this.rules.skins.includes(skin) || isShopSkin(skin))) return { ok: false, error: 'INVALID_SKIN' };
    if (isPremiumSkin(skin) && !participant.ownedSkins?.includes(skin)) return { ok: false, error: 'SKIN_LOCKED' };
    if (participant.skin !== skin) {
      participant.skin = skin;
      this.revision += 1;
      this.broadcastState();
    }
    return { ok: true };
  }

  // Lễ vật: thời gian chờ riêng từng loại cho mỗi người, cộng công đức, phát cho cả phòng.
  offer(participantId, kind, text) {
    const participant = this.participants.get(participantId);
    const offering = this.rules.interaction?.offerings?.[kind];
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!offering) return { ok: false, error: 'OFFERING_NOT_ALLOWED' };
    if (!this.allow(`${participantId}:offer`, 6, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    if (offering.cooldownMs > 0 && !this.allow(`${participantId}:offer:${kind}`, 1, offering.cooldownMs)) {
      return { ok: false, error: 'OFFERING_COOLDOWN', cooldownMs: offering.cooldownMs };
    }
    participant.merit = (participant.merit || 0) + offering.merit;
    const prayer = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    this.revision += 1;
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: 'offering',
      epoch: this.epoch,
      offeringId: `o-${randomUUID()}`,
      participantId,
      displayName: participant.displayName,
      kind,
      at: Date.now(),
      ...(prayer ? { text: prayer } : {}),
    });
    this.broadcastState();
    if (participant.accountId && !participant.bot) {
      // Sổ công đức trả về cấp mới: cập nhật huy hiệu cạnh tên cho cả phòng.
      Promise.resolve(this.onOffering({ accountId: participant.accountId, kind, text: prayer || null, roomId: this.id, at: Date.now() }))
        .then((result) => this.setLevel(participantId, result?.level))
        .catch(() => {});
    }
    return { ok: true };
  }

  setLevel(participantId, level) {
    const participant = this.participants.get(participantId);
    if (!participant?.accountId || !validLevel(level) || participant.level === level) return false;
    participant.level = level;
    this.revision += 1;
    this.broadcastState();
    return true;
  }

  selectSeat(participantId, seatId) {
    if (!this.seatIds.has(seatId)) return { ok: false, error: 'INVALID_SEAT' };
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    const owner = [...this.participants.values()].find((item) => item.id !== participantId && item.seatId === seatId);
    if (owner) return { ok: false, error: 'SEAT_TAKEN' };
    participant.seatId = seatId;
    participant.benchId = null;
    participant.benchSpot = null;
    this.stopChore(participantId);
    this.revision += 1;
    this.broadcastState();
    return { ok: true };
  }

  // Ghế đá ngoài sân: server chọn chỗ trống 1/2 để hai người bấm cùng lúc vẫn không ngồi chồng lên nhau.
  selectBench(participantId, benchId) {
    if (!this.benchIds.has(benchId)) return { ok: false, error: 'INVALID_BENCH' };
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (participant.benchId === benchId && participant.benchSpot) return { ok: true, spot: participant.benchSpot };
    const occupied = new Set([...this.participants.values()]
      .filter((item) => item.id !== participantId && item.benchId === benchId)
      .map((item) => item.benchSpot));
    const spot = Array.from({ length: this.seatsPerBench }, (_, index) => index + 1).find((item) => !occupied.has(item));
    if (!spot) return { ok: false, error: 'BENCH_FULL' };
    participant.seatId = null;
    participant.benchId = benchId;
    participant.benchSpot = spot;
    participant.emote = null;
    participant.sutra = null;
    this.stopChore(participantId);
    this.revision += 1;
    this.broadcastState();
    return { ok: true, spot };
  }

  // Đóng phòng trên máy này (mất lease hoặc rút máy). Client nhận 4002 và hỏi API phòng đang ở đâu.
  close(code = CLOSE_ROOM_MOVED, reason = 'Phòng đã chuyển máy') {
    if (this.closed) return;
    this.closed = true;
    this.table?.stop();
    clearTimeout(this.playback.timer);
    clearTimeout(this.moveTimer);
    clearInterval(this.botTimer);
    clearInterval(this.choreTimer);
    this.stopViews();
    for (const challenge of this.challenges.values()) clearTimeout(challenge.timer);
    const participants = [...this.participants.values()];
    this.participants.clear();
    for (const participant of participants) {
      clearTimeout(participant.expireTimer);
      participant.socket?.close(code, reason);
    }
  }
}

export class RoomRegistry {
  // Phát luống vườn cho mọi phòng chánh điện (kiểm tra bằng schema protocol trước khi phát). Trả số phòng, null nếu sai.
  broadcastGarden(input) {
    const message = { v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 0, plots: input?.plots, ...(input?.effect ? { effect: input.effect } : {}) };
    if (!parseServerMessage(message).ok) return null;
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.type !== 'thien' || room.closed) continue;
      room.broadcast({ ...message, epoch: room.epoch });
      count += 1;
    }
    return count;
  }

  // Công trình chung không chia shard: mọi phòng chánh điện đang mở trên node đều nhận cùng một snapshot.
  broadcastCommunityProject(input) {
    const message = { v: PROTOCOL_VERSION, type: 'community.project', epoch: 0, project: input?.project };
    if (!parseServerMessage(message).ok) return null;
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.type !== 'thien' || room.closed) continue;
      room.broadcast({ ...message, epoch: room.epoch });
      count += 1;
    }
    return count;
  }

  constructor(options = {}) {
    this.rooms = new Map();
    this.opening = new Map();
    this.nodeId = options.nodeId || `rt-${randomUUID().slice(0, 8)}`;
    this.publicUrl = options.publicUrl || null;
    this.directory = options.directory || createMemoryDirectory();
    this.leaseTtlMs = options.leaseTtlMs || LEASE_TTL_MS;
    this.nodeTtlMs = options.nodeTtlMs || NODE_TTL_MS;
    this.resumeTtlMs = options.resumeTtlMs || RESUME_TTL_MS;
    this.issueResumeToken = options.issueResumeToken;
    this.botCounts = options.botCounts || {};
    this.onOffering = options.onOffering;
    this.onChoreReward = options.onChoreReward;
    this.onFriend = options.onFriend;
    this.onReport = options.onReport;
    this.bauCua = options.bauCua;
    this.ticker = null;
    this.ticking = false;
  }

  // Giữ phòng bằng lease trong danh bạ; có snapshot thì dựng lại người và ghế.
  open(roomId) {
    const room = this.rooms.get(roomId);
    if (room) return Promise.resolve({ ok: true, room });
    if (!this.opening.has(roomId)) {
      this.opening.set(roomId, this.#open(roomId).finally(() => this.opening.delete(roomId)));
    }
    return this.opening.get(roomId);
  }

  async #open(roomId) {
    if (!roomTypeOf(roomId)) return { ok: false, error: 'UNKNOWN_ROOM' };
    const lease = await this.directory.acquireRoom(roomId, this.nodeId, this.leaseTtlMs);
    if (!lease.ok) return { ok: false, error: 'ROOM_ELSEWHERE', owner: lease.owner };
    const room = new Room(roomId, {
      botCount: this.botCounts[roomTypeOf(roomId)],
      epoch: lease.epoch,
      resumeTtlMs: this.resumeTtlMs,
      issueResumeToken: this.issueResumeToken,
      onEmpty: () => this.removeIfEmpty(roomId),
      onOffering: this.onOffering,
      onChoreReward: this.onChoreReward,
      onFriend: this.onFriend,
      onReport: this.onReport,
      bauCua: this.bauCua,
    });
    try {
      const record = await this.directory.loadSnapshot(roomId);
      if (record) room.restore(record);
    } catch (error) {
      await this.directory.releaseRoom(roomId, this.nodeId, lease.epoch).catch(() => {});
      throw error;
    }
    this.rooms.set(roomId, room);
    return { ok: true, room };
  }

  removeIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.realCount > 0) return;
    this.rooms.delete(roomId);
    room.close();
    this.directory.releaseRoom(roomId, this.nodeId, room.epoch, { dropSnapshot: true }).catch(() => {});
  }

  evict(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.delete(roomId);
    room.close();
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const [roomId, room] of [...this.rooms]) {
        // Phòng mở ra nhưng không ai gửi hello: trả lease sau thời gian chờ.
        if (room.realCount === 0 && Date.now() - room.openedAt > EMPTY_ROOM_GRACE_MS) {
          this.removeIfEmpty(roomId);
          continue;
        }
        try {
          if (!await this.directory.renewRoom(roomId, this.nodeId, room.epoch, this.leaseTtlMs)) {
            this.evict(roomId);
            continue;
          }
          if (room.revision === room.savedRevision) continue;
          const revision = room.revision;
          if (await this.directory.saveSnapshot(roomId, this.nodeId, room.epoch, room.toRecord(), SNAPSHOT_TTL_MS)) {
            room.savedRevision = revision;
          } else {
            this.evict(roomId);
          }
        } catch {
          // Lỗi danh bạ tạm thời: giữ phòng, thử lại ở nhịp sau. Lease hết hạn thì máy khác sẽ nhận phòng.
        }
      }
      await this.directory.registerNode(this.nodeId, {
        url: this.publicUrl,
        rooms: this.rooms.size,
        connections: this.connections,
        roomCounts: Object.fromEntries([...this.rooms].map(([roomId, room]) => [roomId, room.connectedCount])),
        roomSeatCounts: Object.fromEntries([...this.rooms].map(([roomId, room]) => [roomId, room.realCount])),
      }, this.nodeTtlMs).catch(() => {});
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = TICK_MS) {
    if (this.ticker) return;
    this.tick();
    this.ticker = setInterval(() => this.tick(), intervalMs);
    this.ticker.unref?.();
  }

  stop() {
    clearInterval(this.ticker);
    this.ticker = null;
  }

  // Rút máy: lưu snapshot lần cuối, trả lease để máy khác nhận phòng ngay, rồi đóng phòng.
  async shutdown() {
    this.stop();
    for (const [roomId, room] of [...this.rooms]) {
      await this.directory.saveSnapshot(roomId, this.nodeId, room.epoch, room.toRecord(), SNAPSHOT_TTL_MS).catch(() => {});
      await this.directory.releaseRoom(roomId, this.nodeId, room.epoch).catch(() => {});
      this.evict(roomId);
    }
    await this.directory.removeNode(this.nodeId).catch(() => {});
  }

  get connections() {
    let count = 0;
    for (const room of this.rooms.values()) count += room.connectedCount;
    return count;
  }

  get size() {
    return this.rooms.size;
  }
}

function handleRoomMessage(socket, context, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString('utf8'));
  } catch {
    protocolError(socket, context.room.epoch, 'INVALID_JSON', 'Message phải là JSON hợp lệ');
    return;
  }

  const parsed = parseClientMessage(message, { role: context.claims.role });
  if (!parsed.ok) {
    protocolError(socket, context.room.epoch, parsed.error, 'Message không hợp lệ', message?.requestId);
    return;
  }

  const room = context.room;
  if (!context.participantId) {
    if (message.type !== 'hello') {
      protocolError(socket, 0, 'EXPECTED_HELLO', 'Message đầu tiên phải là hello');
      return;
    }
    if (message.roomId !== context.claims.roomId || message.displayName !== context.claims.displayName) {
      protocolError(socket, 0, 'TICKET_MISMATCH', 'Thông tin hello không khớp vé vào phòng');
      socket.close(1008, 'Vé không khớp');
      return;
    }
    if (room.closed) {
      socket.close(CLOSE_ROOM_MOVED, 'Phòng đã chuyển máy');
      return;
    }
    context.participantId = context.claims.participantId;
    const joined = room.join(socket, context.claims, message.resumeToken, { broadcast: false });
    if (joined === false) {
      protocolError(socket, room.epoch, 'ROOM_FULL', 'Phòng đã đủ người');
      socket.close(1013, 'Phòng đã đầy');
      return;
    }
    if (!joined.ok) {
      protocolError(socket, room.epoch, joined.error, 'Phiên nối lại không hợp lệ');
      socket.close(1008, 'Phiên nối lại không hợp lệ');
      return;
    }
    send(socket, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      epoch: room.epoch,
      connectionId: `c-${randomUUID()}`,
      serverTime: Date.now(),
      heartbeatMs: HEARTBEAT_MS,
      resumeToken: joined.participant.resumeToken,
    });
    room.broadcastState();
    if (room.view) room.sendCounts();
    send(socket, room.playbackState());
    if (room.chores.size) room.broadcastChores(socket);
    // Phòng game: trạng thái bàn Bầu Cua và cược của mình trong ván đang chạy (vào lại giữa ván).
    if (room.table) {
      const state = room.table.stateMessage();
      if (state) send(socket, state);
      const mine = room.table.mineMessage(joined.participant.accountId);
      if (mine) send(socket, mine);
    }
    return;
  }

  if (message.type === 'hello') {
    protocolError(socket, room.epoch, 'ALREADY_JOINED', 'Kết nối đã tham gia phòng');
    return;
  }
  if (message.type === 'ping') {
    send(socket, { v: PROTOCOL_VERSION, type: 'pong', epoch: room.epoch, sentAt: message.sentAt, serverTime: Date.now() });
    return;
  }
  if (message.type === 'bet.place') {
    if (!room.table) {
      protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không có bàn Bầu Cua', message.requestId);
      return;
    }
    if (!room.allow(`${context.participantId}:bet`, 10, 5_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đặt cược quá nhanh', message.requestId);
      return;
    }
    const participant = room.participants.get(context.participantId);
    room.table.placeBet(participant, message).then((result) => {
      if (!result.ok) protocolError(socket, room.epoch, result.code, result.message, message.requestId);
    });
    return;
  }
  if (message.type === 'bet.cancel') {
    if (!room.table) {
      protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không có bàn Bầu Cua', message.requestId);
      return;
    }
    if (!room.allow(`${context.participantId}:bet-cancel`, 3, 5_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn hủy cược quá nhanh', message.requestId);
      return;
    }
    room.table.cancelBets(room.participants.get(context.participantId), message).then((result) => {
      if (!result.ok) protocolError(socket, room.epoch, result.code, result.message, message.requestId);
    });
    return;
  }
  if (message.type === 'chat.send') {
    if (!room.allow(`${context.participantId}:chat`, 5, 10_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đang gửi tin quá nhanh', message.requestId);
      return;
    }
    if (!room.allow('*:chat', ROOM_CHAT_PER_SECOND, 1_000)) {
      protocolError(socket, room.epoch, 'ROOM_BUSY', 'Phòng đang nhiều tin, thử lại sau giây lát', message.requestId);
      return;
    }
    room.broadcast({
      v: PROTOCOL_VERSION,
      type: 'chat.message',
      epoch: room.epoch,
      messageId: `m-${randomUUID()}`,
      participantId: context.participantId,
      displayName: room.participants.get(context.participantId)?.displayName,
      text: message.text,
      sentAt: Date.now(),
    });
    return;
  }
  if (message.type === 'seat.select') {
    if (!room.allow(`${context.participantId}:seat`, 3, 10_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đang đổi ghế quá nhanh', message.requestId);
      return;
    }
    const result = room.selectSeat(context.participantId, message.seatId);
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'SEAT_TAKEN' ? 'Ghế đã có người' : 'Ghế không hợp lệ', message.requestId);
    return;
  }
  if (message.type === 'bench.select') {
    if (!room.allow(`${context.participantId}:bench`, 3, 10_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đang đổi ghế quá nhanh', message.requestId);
      return;
    }
    const result = room.selectBench(context.participantId, message.benchId);
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'BENCH_FULL' ? 'Ghế đá đã đủ hai người' : 'Ghế đá không hợp lệ', message.requestId);
    return;
  }
  if (message.type === 'move') {
    // Vị trí gửi liên tục: sai thì bỏ qua lặng lẽ, chỉ báo khi phòng đã đủ người đi lại.
    const result = room.move(context.participantId, message);
    if (result.error === 'WALKERS_FULL' && room.allow(`${context.participantId}:walkers-full`, 1, 30_000)) {
      protocolError(socket, room.epoch, 'WALKERS_FULL', 'Chánh điện đã đủ người đi lại, bạn đang xem như khán giả');
    }
    return;
  }
  if (message.type === 'travel.go') {
    const result = room.travel(context.participantId, message.destination);
    if (!result.ok) {
      const detail = result.error === 'RATE_LIMITED' ? 'Bạn đang đổi khu quá nhanh'
        : result.error === 'WALKERS_FULL' ? 'Chánh điện đã đủ người đi lại'
          : 'Không thể đi nhanh tới khu này';
      protocolError(socket, room.epoch, result.error, detail, message.requestId);
    }
    return;
  }
  if (message.type === 'chore.start' || message.type === 'chore.stop') {
    const result = message.type === 'chore.start'
      ? room.startChore(context.participantId, message.choreId)
      : room.stopChore(context.participantId, message.choreId);
    if (!result.ok && result.error !== 'NOT_WORKING') {
      const detail = result.error === 'TOO_FAR' ? 'Hãy lại gần công việc hơn'
        : result.error === 'RATE_LIMITED' ? 'Bạn thao tác quá nhanh'
          : 'Công việc này không hợp lệ';
      protocolError(socket, room.epoch, result.error, detail, message.requestId);
    }
    return;
  }
  if (message.type === 'prayer.announce') {
    const result = room.announcePrayer(context.participantId, message.kind);
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'RATE_LIMITED' ? 'Bạn gửi sớ quá nhanh, xin đợi ít phút' : 'Phòng này không nhận sớ', message.requestId);
    return;
  }
  if (message.type === 'reaction.send') {
    const result = room.reaction(context.participantId, message.kind);
    if (!result.ok) protocolError(socket, room.epoch, result.error, 'Bạn thả cảm xúc quá nhanh', message.requestId);
    return;
  }
  if (message.type === 'emote') {
    const result = room.emote(context.participantId, message.kind, message.sutra);
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'RATE_LIMITED' ? 'Bạn đổi động tác quá nhanh' : 'Phòng này không có động tác', message.requestId);
    return;
  }
  if (message.type.startsWith('friend.') || message.type.startsWith('challenge.') || message.type.startsWith('player.')) {
    const id = context.participantId;
    const result = message.type === 'player.block' ? room.block(id, message.targetId, message.blocked)
      : message.type === 'player.report' ? room.reportPlayer(id, message.targetId, message.reason, message.note)
      : message.type === 'friend.request' ? room.friendRequest(id, message.targetId)
      : message.type === 'friend.respond' ? room.friendRespond(id, message.fromId, message.accept)
        : message.type === 'challenge.send' ? room.challengeSend(id, message.targetId, message.game)
          : message.type === 'challenge.respond' ? room.challengeRespond(id, message.challengeId, message.accept)
            : message.type === 'challenge.move' ? room.challengeMove(id, message.challengeId, message.choice)
              : room.challengeCancel(id, message.challengeId);
    if (!result.ok) protocolError(socket, room.epoch, result.error, SOCIAL_ERRORS[result.error] || 'Không thực hiện được', message.requestId);
    return;
  }
  if (message.type === 'avatar.set') {
    if (!room.allow(`${context.participantId}:avatar`, 5, 60_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đổi hình quá nhanh', message.requestId);
      return;
    }
    const result = room.setSkin(context.participantId, message.skin);
    if (!result.ok) {
      const text = result.error === 'SKIN_LOCKED' ? 'Bạn chưa sở hữu hình nhân vật này (mua trong Shop nhân vật)' : 'Phòng này không đổi được hình nhân vật';
      protocolError(socket, room.epoch, result.error, text, message.requestId);
    }
    return;
  }
  if (message.type === 'offering.send') {
    const result = room.offer(context.participantId, message.kind, message.text);
    if (!result.ok) {
      const text = result.error === 'OFFERING_COOLDOWN'
        ? `Lễ vật này dâng lại sau ${Math.ceil(result.cooldownMs / 1_000)} giây`
        : result.error === 'RATE_LIMITED' ? 'Bạn dâng quá nhanh, xin chậm lại' : 'Phòng này không nhận lễ vật';
      protocolError(socket, room.epoch, result.error, text, message.requestId);
    }
    return;
  }
  if ((message.type === 'queue.add' || message.type === 'vote.skip') && room.rules.content?.source !== 'youtube') {
    protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không chiếu video', message.requestId);
    return;
  }
  if (message.type === 'queue.add') {
    if (!room.allow(`${context.participantId}:queue`, 3, 60_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn thêm video quá nhanh, chờ một chút nhé', message.requestId);
      return;
    }
    context.fetchVideoInfo(message.videoId).then((info) => {
      if (room.closed) return;
      if (!info.ok) {
        const text = info.error === 'VIDEO_NOT_EMBEDDABLE' ? 'Video này không cho phát nhúng ngoài YouTube' : 'Không tìm thấy video này';
        protocolError(socket, room.epoch, info.error, text, message.requestId);
        return;
      }
      const result = room.addVideo(context.participantId, message.videoId, info.title);
      if (!result.ok) protocolError(socket, room.epoch, result.error, QUEUE_ERRORS[result.error] || 'Không thêm được video', message.requestId);
    }).catch(() => protocolError(socket, room.epoch, 'VIDEO_CHECK_FAILED', 'Chưa kiểm tra được video, thử lại sau', message.requestId));
    return;
  }
  if (message.type === 'vote.skip') {
    if (!room.allow(`${context.participantId}:vote`, 5, 60_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn vote quá nhanh', message.requestId);
      return;
    }
    const result = room.voteSkip(context.participantId, message.itemId);
    if (!result.ok) protocolError(socket, room.epoch, result.error, 'Video đã đổi, vote lại cho video mới nhé', message.requestId);
    return;
  }
  if (message.type === 'playback.report') {
    if (room.allow(`${context.participantId}:playback-report`, 10, 10_000)) room.report(context.participantId, message.itemId, message.event, message.value);
    return;
  }
  protocolError(socket, room.epoch, 'UNSUPPORTED_COMMAND', 'Lệnh chưa được hỗ trợ', message.requestId);
}

const SOCIAL_ERRORS = {
  NOT_IN_ROOM: 'Người này không còn trong phòng',
  NOT_ALLOWED: 'Người này không nhận lời mời',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, chờ một chút nhé',
  NO_REQUEST: 'Lời mời đã hết hạn',
  BUSY: 'Một trong hai người đang có trận khác',
  NO_CHALLENGE: 'Trận đấu đã kết thúc',
  ALREADY_MOVED: 'Bạn đã ra tay ở lượt này',
};

const QUEUE_ERRORS = {
  QUEUE_FULL: 'Hàng chờ đã đầy',
  ALREADY_QUEUED: 'Video này đã có trong hàng chờ',
  TOO_MANY_QUEUED: 'Mỗi người chỉ được chờ tối đa 3 video',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng',
};

// Nhận localhost, cùng origin với Host (khi đi qua web gateway/tunnel, Host được giữ nguyên)
// và các host khai báo trong ALLOWED_ORIGIN_HOSTS (phân tách bằng dấu phẩy).
const EXTRA_ORIGIN_HOSTS = new Set((process.env.ALLOWED_ORIGIN_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean));

function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const { host, hostname } = new URL(origin);
    return ['127.0.0.1', 'localhost'].includes(hostname) || host === req.headers.host || EXTRA_ORIGIN_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
  socket.destroy();
}

// Vé vào phòng (lần đầu) hoặc resume token có chữ ký (nối lại, kể cả sau khi phòng chuyển máy).
async function authorizeUpgrade(url, registry, secret) {
  const ticket = verifyJoinTicket(url.searchParams.get('ticket'), secret);
  const resume = ticket.ok ? null : verifyResumeToken(url.searchParams.get('resumeToken'), secret);
  // Vé/resume sai hoặc hết hạn (kể cả ký bằng khóa cũ trước khi server khởi động lại): nhận kết nối để báo mã lỗi,
  // client biết phải xin vé mới thay vì thử lại mãi.
  if (!ticket.ok && !resume.ok) return { rejected: url.searchParams.has('resumeToken') ? 'INVALID_RESUME_TOKEN' : 'INVALID_TICKET', room: null };

  const roomId = ticket.ok ? ticket.value.roomId : resume.value.roomId;
  const opened = await registry.open(roomId);
  if (opened.error === 'UNKNOWN_ROOM') return { status: '404 Not Found', message: 'unknown room' };
  if (!opened.ok) return { status: '409 Conflict', message: 'room is on another node' };
  if (ticket.ok) return { claims: ticket.value, room: opened.room };

  const participant = opened.room.participants.get(resume.value.participantId);
  // Hết hạn giữ chỗ: nhận kết nối để báo mã lỗi rõ ràng, client sẽ xin vé mới thay vì thử lại mãi.
  if (!participant) return { rejected: 'INVALID_RESUME_TOKEN', room: opened.room };
  const claims = participant.accountId
    ? { participantId: participant.id, roomId, displayName: participant.displayName, role: 'member', accountId: participant.accountId, level: participant.level, avatarUrl: participant.avatarUrl, skins: participant.ownedSkins }
    : { participantId: participant.id, roomId, displayName: participant.displayName, role: 'guest' };
  return { claims, room: opened.room };
}

export function handleRealtimeRequest(req, res, registry = new RoomRegistry(), options = {}) {
  // Số chỗ người thật đang giữ theo phòng, cho API chọn phòng còn bồ đoàn khi chạy một máy (không có Redis).
  // Người rớt mạng vẫn giữ bồ đoàn trong thời hạn resume nên vẫn được tính; bot không được tính.
  if (req.method === 'GET' && req.url === '/internal/rooms') {
    const allowed = options.secret && req.headers?.['x-internal-key'] === internalKey(options.secret);
    const payload = JSON.stringify(allowed
      ? { counts: Object.fromEntries([...registry.rooms].map(([roomId, room]) => [roomId, room.realCount])) }
      : { error: 'forbidden' });
    res.writeHead(allowed ? 200 : 403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(payload);
    return;
  }
  // API báo luống vườn vừa đổi: phát cho mọi phòng chánh điện đang mở trên máy này.
  if (req.method === 'POST' && req.url === '/internal/garden') {
    const allowed = options.secret && req.headers?.['x-internal-key'] === internalKey(options.secret);
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const sent = registry.broadcastGarden(input);
      res.writeHead(sent === null ? 400 : 200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(sent === null ? { error: 'invalid_garden' } : { rooms: sent }));
    });
    return;
  }
  // API đã commit một đóng góp: phát snapshot công trình cho mọi phòng chánh điện trên node này.
  if (req.method === 'POST' && req.url === '/internal/community-project') {
    const allowed = options.secret && req.headers?.['x-internal-key'] === internalKey(options.secret);
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16 * 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const sent = registry.broadcastCommunityProject(input);
      res.writeHead(sent === null ? 400 : 200, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(sent === null ? { error: 'invalid_community_project' } : { rooms: sent }));
    });
    return;
  }
  const found = req.method === 'GET' && req.url === '/health';
  const body = JSON.stringify(found
    ? {
      status: 'ok',
      service: 'realtime',
      protocolVersion: PROTOCOL_VERSION,
      nodeId: registry.nodeId,
      rooms: registry.size,
      connections: registry.connections,
    }
    : { error: 'not_found' });
  res.writeHead(found ? 200 : 404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

// Gửi lễ vật của thành viên tới API (chỉ API ghi cơ sở dữ liệu); trả về cấp mới. Lỗi mạng không chặn phòng: chỉ ghi log.
export function offeringRecorder(apiInternalUrl, secret) {
  const key = internalKey(secret);
  const url = new URL('/internal/offerings', apiInternalUrl);
  return (event) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => {
    if (response.ok) return response.json();
    console.warn(`Không ghi được lễ vật (${response.status})`);
    return null;
  }).catch((error) => {
    console.warn(`Không ghi được lễ vật: ${error.message}`);
    return null;
  });
}

// API là nơi duy nhất đổi số dư. event key khiến việc gửi lại sau timeout không thể cộng xu hai lần.
export function choreRewardRecorder(apiInternalUrl, secret) {
  const key = internalKey(secret);
  const url = new URL('/internal/chores/reward', apiInternalUrl);
  return (event) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => {
    if (response.ok) return response.json();
    console.warn(`Không trả được xu công việc (${response.status})`);
    return null;
  }).catch((error) => {
    console.warn(`Không trả được xu công việc: ${error.message}`);
    return null;
  });
}

// Hỏi / ghi bạn bè giữa hai thành viên qua API. Lỗi mạng: coi như chưa lưu (vẫn là bạn trong phiên).
export function friendRecorder(apiInternalUrl, secret) {
  const key = internalKey(secret);
  const url = new URL('/internal/friends', apiInternalUrl);
  return (event) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => (response.ok ? response.json() : null)).catch((error) => {
    console.warn(`Không lưu được bạn bè: ${error.message}`);
    return null;
  });
}

// Chuyển báo cáo người chơi tới API (lỗi mạng chỉ ghi log).
export function reportRecorder(apiInternalUrl, secret) {
  const key = internalKey(secret);
  const url = new URL('/internal/reports', apiInternalUrl);
  return (event) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => {
    if (!response.ok) console.warn(`Không lưu được báo cáo (${response.status})`);
  }).catch((error) => console.warn(`Không lưu được báo cáo: ${error.message}`));
}

export function createRealtimeServer(options = {}) {
  const secret = options.secret || DEFAULT_LOCAL_SECRET;
  const registry = options.registry || new RoomRegistry({
    nodeId: options.nodeId,
    publicUrl: options.publicUrl,
    directory: options.directory,
    leaseTtlMs: options.leaseTtlMs,
    nodeTtlMs: options.nodeTtlMs,
    resumeTtlMs: options.resumeTtlMs,
    botCounts: options.botCounts,
    issueResumeToken: (claims) => createResumeToken(claims, secret),
    onOffering: options.recordOffering || (options.apiInternalUrl ? offeringRecorder(options.apiInternalUrl, secret) : undefined),
    onChoreReward: options.recordChoreReward || (options.apiInternalUrl ? choreRewardRecorder(options.apiInternalUrl, secret) : undefined),
    onFriend: options.recordFriend || (options.apiInternalUrl ? friendRecorder(options.apiInternalUrl, secret) : undefined),
    onReport: options.recordReport || (options.apiInternalUrl ? reportRecorder(options.apiInternalUrl, secret) : undefined),
    // Bầu Cua: đặt cược / chốt ván qua ví xu ở API.
    bauCua: options.bauCua || (options.apiInternalUrl ? bauCuaBank(options.apiInternalUrl, internalKey(secret)) : undefined),
  });
  const server = http.createServer((req, res) => handleRealtimeRequest(req, res, registry, { secret }));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname !== '/ws' || !validOrigin(req)) {
      rejectUpgrade(socket, '403 Forbidden', 'forbidden');
      return;
    }
    authorizeUpgrade(url, registry, secret).then((result) => {
      if (!result.claims && !result.rejected) {
        rejectUpgrade(socket, result.status, result.message);
        return;
      }
      sockets.handleUpgrade(req, socket, head, (webSocket) => {
        sockets.emit('connection', webSocket, req, result);
      });
    }).catch(() => rejectUpgrade(socket, '503 Service Unavailable', 'room directory unavailable'));
  });

  sockets.on('connection', (socket, req, { claims, room, rejected }) => {
    // Kết nối chết (điện thoại mất sóng, trình duyệt bị tắt ngang) không báo ngắt: ping mức WebSocket mỗi nhịp,
    // hai nhịp không thấy pong thì cắt để người đó rời phòng (vẫn giữ chỗ trong thời hạn resume).
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    if (rejected) {
      protocolError(socket, room?.epoch ?? 0, rejected, rejected === 'INVALID_TICKET' ? 'Vé vào phòng không hợp lệ' : 'Phiên nối lại đã hết hạn');
      socket.close(1008, 'Phiên nối lại hết hạn');
      return;
    }
    const context = { claims, participantId: null, room, fetchVideoInfo: options.fetchVideoInfo || fetchYouTubeInfo };
    const helloTimer = setTimeout(() => {
      if (!context.participantId) socket.close(1008, 'Chưa gửi hello');
    }, options.helloTimeoutMs || HELLO_TIMEOUT_MS);
    socket.on('message', (raw) => handleRoomMessage(socket, context, raw));
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (!context.participantId) return;
      context.room.disconnect(context.participantId, socket);
    });
    socket.on('error', () => {});
  });

  server.on('listening', () => registry.start(options.tickMs));
  const liveness = setInterval(() => {
    for (const client of sockets.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, options.livenessMs || HEARTBEAT_MS * 2);
  liveness.unref?.();
  server.on('close', () => {
    clearInterval(liveness);
    registry.stop();
  });

  server.roomRegistry = registry;
  server.webSocketServer = sockets;
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const host = process.env.REALTIME_HOST || '127.0.0.1';
  const port = Number(process.env.REALTIME_PORT) || 4001;
  const secret = process.env.SESSION_SECRET || DEFAULT_LOCAL_SECRET;
  const nodeId = process.env.NODE_ID || `rt-${port}`;
  const publicUrl = process.env.REALTIME_PUBLIC_URL || `ws://${host}:${port}/ws`;
  const { directory, shared } = await createDirectoryFromEnv();
  // Số bot theo loại phòng: BOTS_THIEN=8 (0 để tắt). Không đặt thì theo room rules.
  const botCounts = {};
  for (const type of ['thien', 'cinema']) {
    const value = process.env[`BOTS_${type.toUpperCase()}`];
    if (value !== undefined && /^\d+$/.test(value)) botCounts[type] = Number(value);
  }
  // API_INTERNAL_URL: địa chỉ API trong mạng nội bộ để ghi công đức của thành viên (không đặt thì không ghi).
  const apiInternalUrl = process.env.API_INTERNAL_URL || null;
  const server = createRealtimeServer({ secret, nodeId, publicUrl, directory, botCounts, apiInternalUrl });
  server.listen(port, host, () => {
    console.log(`Realtime ${nodeId}: ${publicUrl} (${shared ? 'Redis' : 'bộ nhớ, một máy'})`);
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.roomRegistry.shutdown();
    for (const client of server.webSocketServer.clients) client.terminate();
    server.close();
    await directory.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
