import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  AVATAR_FRAMES, AVATAR_URL, CHAT_HISTORY_MAX, GAME_ROOMS, parseClientMessage, parseServerMessage, PET_ACTIONS, PLAYER_TITLES, PROTOCOL_VERSION, RPS_CHOICES,
} from '@chanh-dien/protocol';
import {
  createDirectoryFromEnv,
  createMemoryDirectory,
  LEASE_TTL_MS,
  NODE_TTL_MS,
  SNAPSHOT_TTL_MS,
} from '@chanh-dien/room-directory';
import { dayStartOf, getRoomRules, isPremiumSkin, isPrivateRoomId, isShopSkin, parseThienRoomId, roomLangOf, roomTypeOf } from '@chanh-dien/room-rules';
import {
  createResumeToken,
  DEFAULT_LOCAL_SECRET,
  internalKey,
  verifyJoinTicket,
  verifyResumeToken,
} from '@chanh-dien/session-token';
import { WebSocket, WebSocketServer } from 'ws';
import { bauCuaBank, BauCuaTable, DICE_TABLE_GAMES } from './bau-cua.mjs';
import { BOT_AI_MODEL, createBotAi, guessLang } from './bot-ai.mjs';
import { LottoTable, lottoBank } from './loto.mjs';
import { createModerationGuard, hasPromo, moderationRemote, repeatKey } from './moderation.mjs';

const HEARTBEAT_MS = 15_000;
const MAX_PAYLOAD = 64 * 1_024;
export const RESUME_TTL_MS = 60_000;
export const TICK_MS = 3_000;
export const CLOSE_ROOM_MOVED = 4002;
// Bị khóa (kiểm duyệt): client thôi tự nối lại.
export const CLOSE_BANNED = 4004;
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
const PRESENCE_REPORT_MS = 15_000;
// Kết bạn và khiêu chiến giữa hai người trong phòng.
const FRIEND_REQUEST_TTL_MS = 60_000;
const CHALLENGE_INVITE_MS = 20_000;
const CHALLENGE_ROUND_MS = 10_000;
const CHALLENGE_TARGET = 2;
const CHALLENGE_MAX_ROUNDS = 9;
const CHALLENGE_LINGER_MS = 5_000;
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
// Nắm tay đi dạo: mời khi hai người đứng cách ≤ HAND_REACH m; cách nhau quá HAND_BREAK m (kẹt vật cản, mạng lag) thì tự buông.
const HAND_REQUEST_TTL_MS = 30_000;
const HAND_REACH = 6;
const HAND_BREAK = 12;
const HAND_GAP = 0.55;
// Người chơi nhắn bot (tin bắt đầu bằng @Tên bot): bot ở lại phòng ít nhất ngần này để quản trị kịp trả lời qua Telegram.
const BOT_TALK_HOLD_MS = 15 * 60_000;
// Bot nhận lời kết bạn / nắm tay sau một chốc như người thật.
const botDelay = () => 1_200 + Math.random() * 1_800;
// Bot tự bắt chuyện (cần botAi): thưa thôi cho đỡ tốn lượt AI — mỗi phòng một lần mỗi 3–6 phút, với người đứng cách
// ≤ 8 m; mỗi người tối đa một lần mỗi 30 phút. Bot dừng đi dạo một lúc để người kia kịp trả lời.
const BOT_APPROACH_GAP_MS = [3 * 60_000, 6 * 60_000];
// Số bot do `addbot` đặt không đứng yên: dao động ±BOT_DRIFT_RANGE quanh con số đó, mỗi lần thêm / bớt một bot
// (cách nhau BOT_DRIFT_STEP_MS), mỗi BOT_DRIFT_TARGET_MS chọn lại đích mới, để trông như có người ra vào.
const BOT_DRIFT_RANGE = 10;
const BOT_DRIFT_STEP_MS = [15_000, 45_000];
const BOT_DRIFT_TARGET_MS = [2 * 60_000, 5 * 60_000];
const BOT_APPROACH_RANGE = 8;
const BOT_APPROACH_PERSON_MS = 30 * 60_000;
const BOT_APPROACH_HOLD_MS = 25_000;
// Hai bot đi dạo cách nhau trong khoảng này thì có thể đứng lại đối đáp vài câu.
const BOT_DIALOGUE_RANGE = 7;
// Chat của phòng chỉ giữ trong ngày (nửa đêm theo GARDEN_TIMEZONE, như Vườn Công Đức), tối đa CHAT_HISTORY_MAX tin, chỉ
// trong bộ nhớ máy đang giữ phòng: người vào sau xem lại được qua chat.history.
const CHAT_TIME_ZONE = process.env.GARDEN_TIMEZONE || 'America/Los_Angeles';
// Cả phòng chỉ có một câu bot nói vu vơ mỗi khoảng này (đối đáp đang diễn ra không tính): 20 bot cùng nói liên tục
// trông như máy.
const BOT_CHAT_GAP_MS = 8_000;
// Người thật chào cả sân thì một bot gần đó chào lại (câu mẫu, không tốn lượt AI).
const GREETING = /^(?:(?:xin\s+)?ch[àa]o|hello|hi|hey|hola|buenas)(?:$|[\s,!.?~])|^(?:你好|大家好|嗨)/iu;
// Người chơi nhắn "chơi oẳn tù tì" / tên phòng game: bot trả lời rồi khiêu chiến / gửi lời mời luôn.
const WANTS_RPS = /oẳn|tù tì|kéo búa|búa bao|rock|paper|scissors|猜拳|剪刀|piedra|tijera/i;
const WANTS_GAME = [
  ['loto', /lô ?tô|loto|bingo|樂透/i],
  ['tai-xiu', /tài ?xỉu|tai ?xiu|大小/i],
  ['bau-cua', /bầu ?cua|bau ?cua|魚蝦蟹/i],
];
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
  && (item.title === undefined || PLAYER_TITLES.includes(item.title))
  && (item.frame === undefined || AVATAR_FRAMES.includes(item.frame))
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
    // Hình tự chia cho người thật mới: bỏ hình mua trong shop.
    this.freeSkins = (this.rules.skins || []).filter((skin) => !isPremiumSkin(skin));
    // Người thật vẫn phải sở hữu hình shop; riêng bot được lấy thêm danh mục shop do API cấp khi mở phòng.
    this.botSkins = [...new Set((options.botSkins || []).filter(isPremiumSkin))];
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
    this.chatLog = [];
    // Ví kim cương ({ spend, refund } qua API): mở phim tốn kim cương.
    this.wallet = options.wallet || null;
    // Phòng Lô Tô riêng: tài khoản chủ phòng (chủ rời phòng thì đóng phòng) và báo API khi đóng. Bot chỉ có khi được mời.
    this.privateOwner = options.privateOwner || null;
    this.onPrivateClosed = options.onPrivateClosed || null;
    this.privateTimer = null;
    this.privateClosing = false;
    this.playback = { current: null, queue: [], votes: new Set(), errors: new Set(), durations: [], timer: null };
    this.skipVotePercent = options.skipVotePercent || this.rules.interaction?.skipVotePercent || CINEMA.interaction.skipVotePercent;
    this.revision = 0;
    this.savedRevision = -1;
    this.closed = false;
    this.openedAt = Date.now();
    this.resumeTtlMs = options.resumeTtlMs || RESUME_TTL_MS;
    // Chánh điện bị chặn theo số bồ đoàn; phòng game không có ghế nên dùng giới hạn bot riêng trong room rules.
    this.botLimit = this.rules.seats ?? this.rules.bots?.max ?? 0;
    this.botCount = Math.max(0, Math.min(options.botCount ?? this.rules.bots?.count ?? 0, this.botLimit));
    // Bot do `addbot N` quản lý vẫn giữ phòng và bàn game chạy khi chưa có người thật.
    this.keepBotsAlive = false;
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
    // Tin người chơi nhắn bot: chuyển tới API → Telegram để quản trị trả lời thay bot.
    this.onBotChat = options.onBotChat || null;
    // Lời bot do AI viết (bot-ai.mjs): có thì bot tự bắt chuyện và tự trả lời tin nhắn; không có thì chỉ quản trị trả lời.
    this.botAi = options.botAi || null;
    // Kiểm duyệt chữ (moderation.mjs): không có thì không lọc.
    this.moderation = options.moderation || null;
    this.friendRequests = new Map();
    // Lời mời nắm tay `${from}>${to}` → hết hạn lúc nào.
    this.handRequests = new Map();
    this.challenges = new Map();
    // Phòng game: bàn Bầu Cua chơi chung (chạy khi có người trong phòng). options.bauCua: { stake, settle } gọi API.
    // Tài Xỉu dùng chung bàn (khác ô cược / cách lắc), cùng ví xu qua API.
    // Lô Tô: bàn riêng (vé, gọi số, kinh), cùng giao diện start/stop/stateMessage/mineMessage. options.lotto: { buy, settle }.
    const game = this.rules.interaction?.game;
    this.table = DICE_TABLE_GAMES[game]
      ? new BauCuaTable({ room: this, rules: this.rules.interaction, ...(options.bauCua || {}) })
      : game === 'loto' ? new LottoTable({ room: this, rules: this.rules.interaction, ...(options.lotto || {}) }) : null;
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

  entryOf({ id, displayName, seatId, benchId, benchSpot, connected, skin, merit, bot, level, avatarUrl, title, frame, pos, emote, sutra, handWith, handLead }) {
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
      ...(title ? { title } : {}),
      ...(frame ? { frame } : {}),
      ...(emote ? { emote } : {}),
      ...(emote === 'chant' && sutra ? { sutra } : {}),
      ...(handWith ? { handWith, ...(handLead ? { handLead: true } : {}) } : {}),
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
    for (const key of this.handRequests.keys()) {
      const [from, to] = key.split('>');
      link(from, to);
      link(to, from);
    }
    for (const participant of this.participants.values()) if (participant.handWith) link(participant.id, participant.handWith);
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
    const top = JSON.stringify(ranked.slice(0, COUNT_TOP).map(({ id, displayName, merit, level, avatarUrl, title, frame }) => ({
      id, displayName, merit, ...(level ? { level } : {}), ...(avatarUrl ? { avatarUrl } : {}),
      ...(title ? { title } : {}), ...(frame ? { frame } : {}),
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
    const partner = participant.handWith && this.participants.get(participant.handWith);
    if (partner?.pos && Math.hypot(partner.pos.x - participant.pos.x, partner.pos.z - participant.pos.z) > HAND_BREAK) this.releaseHand(participantId);
    else if (partner?.bot && participant.handLead) this.followLeader(partner, participant);
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

  // Đi nhanh giữa các khu cố định. Client chỉ gửi tên đích; tọa độ lấy từ room rules để không biến lệnh này thành
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

  // Vuốt ve / cho ăn / chơi bóng với chó mèo. Vị trí chi tiết của thú là hoạt ảnh phía client; server chỉ
  // xác nhận đúng mã thú của cảnh, giới hạn spam rồi phát hiệu ứng cho mọi người trong phòng cùng thấy.
  petInteract(participantId, petId, action) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (this.type !== 'thien' || !this.rules.world?.pets?.includes(petId) || !PET_ACTIONS.includes(action)) return { ok: false, error: 'INVALID_PET' };
    if (!participant.pos || participant.seatId || participant.benchId) return { ok: false, error: 'NOT_ALLOWED' };
    const area = this.rules.world.petArea;
    if (!area || participant.pos.x < area.x[0] || participant.pos.x > area.x[1]
      || participant.pos.z < area.z[0] || participant.pos.z > area.z[1]) return { ok: false, error: 'TOO_FAR' };
    if (!this.allow(`${participantId}:pet`, 6, 10_000)) return { ok: false, error: 'RATE_LIMITED' };
    this.broadcast({ v: PROTOCOL_VERSION, type: 'pet.interaction', epoch: this.epoch, participantId, petId, action, at: Date.now() });
    return { ok: true };
  }

  emote(participantId, kind, sutra) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.rules.world) return { ok: false, error: 'NOT_ALLOWED' };
    // Nhún nhảy và tương tác (✨) chỉ ngoài sân (đang đứng ngoài chánh điện), giữ trang nghiêm trong điện.
    if ((kind === 'dance' || kind === 'act') && (!participant.pos || participant.seatId || this.zoneOf(participant.pos) === 'hall')) return { ok: false, error: 'YARD_ONLY' };
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
    if (this.blockedBetween(from, target)) return { ok: false, error: 'NOT_ALLOWED' };
    if (!this.allow(`${fromId}:friend`, 5, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    // Bot nhận lời như người thật (bạn trong phiên, không lưu vào tài khoản vì bot không có tài khoản).
    if (target.bot) {
      this.friendState(fromId, targetId, 'pending');
      const accept = setTimeout(() => {
        if (this.participants.has(fromId) && this.participants.has(targetId)) this.friendState(fromId, targetId, 'accepted', false);
      }, botDelay());
      accept.unref?.();
      return { ok: true };
    }
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

  // ---- Nắm tay: hai người đứng gần nhau trong khuôn viên đi dạo cùng nhau; người mời dẫn đường, người nhận tự đi
  // bên cạnh (client của người đi theo tính vị trí và gửi move như đi bộ thường, server vẫn chặn tốc độ). ----
  handState(fromId, toId, status, byId) {
    const message = { v: PROTOCOL_VERSION, type: 'hand.state', epoch: this.epoch, fromId, toId, status, ...(byId ? { byId } : {}) };
    this.sendTo(fromId, message);
    this.sendTo(toId, message);
  }

  // Hai người cùng đang đứng trong khuôn viên (không ngồi bồ đoàn / ghế đá) và cách nhau không quá `reach` mét.
  standingNear(first, second, reach) {
    if (!first?.pos || !second?.pos || first.seatId || second.seatId || first.benchId || second.benchId) return false;
    return Math.hypot(first.pos.x - second.pos.x, first.pos.z - second.pos.z) <= reach;
  }

  handRequest(fromId, targetId) {
    const from = this.participants.get(fromId);
    const target = this.participants.get(targetId);
    if (!from || !target || fromId === targetId) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.rules.world || from.bot || target.connected === false || this.blockedBetween(from, target)) return { ok: false, error: 'NOT_ALLOWED' };
    if (from.handWith || target.handWith) return { ok: false, error: 'HAND_BUSY' };
    if (!this.standingNear(from, target, HAND_REACH)) return { ok: false, error: 'TOO_FAR' };
    if (!this.allow(`${fromId}:hand`, 5, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    // Người kia đã mời mình trước: coi như hai bên cùng đồng ý.
    if (this.handRequests.has(`${targetId}>${fromId}`)) return this.handRespond(fromId, targetId, true);
    this.handRequests.set(`${fromId}>${targetId}`, Date.now() + HAND_REQUEST_TTL_MS);
    this.viewsStale = true;
    this.handState(fromId, targetId, 'pending');
    // Bot đang đi dạo nhận nắm tay sau một chốc rồi đi theo người mời.
    if (target.bot) {
      const accept = setTimeout(() => {
        if (this.handRequests.has(`${fromId}>${targetId}`)) this.handRespond(targetId, fromId, true);
      }, botDelay());
      accept.unref?.();
    }
    return { ok: true };
  }

  handRespond(toId, fromId, accept) {
    const key = `${fromId}>${toId}`;
    const expiresAt = this.handRequests.get(key);
    this.handRequests.delete(key);
    if (!expiresAt || expiresAt < Date.now()) return { ok: false, error: 'NO_REQUEST' };
    if (!accept) {
      this.handState(fromId, toId, 'declined');
      return { ok: true };
    }
    const from = this.participants.get(fromId);
    const to = this.participants.get(toId);
    if (!from || !to) return { ok: false, error: 'NOT_IN_ROOM' };
    if (from.handWith || to.handWith) return { ok: false, error: 'HAND_BUSY' };
    if (!this.standingNear(from, to, HAND_REACH + 2)) return { ok: false, error: 'TOO_FAR' };
    from.handWith = toId;
    from.handLead = true;
    to.handWith = fromId;
    to.handLead = false;
    // Bên đứng của người đi theo so với người dẫn (giữ nguyên bên đó khi đi).
    to.handSide = (to.pos.x - from.pos.x) * Math.cos(from.pos.ry) - (to.pos.z - from.pos.z) * Math.sin(from.pos.ry) >= 0 ? 1 : -1;
    if (to.bot) this.followLeader(to, from);
    this.revision += 1;
    this.broadcastState();
    this.handState(fromId, toId, 'accepted');
    return { ok: true };
  }

  // Bot đi theo người dẫn: đứng cạnh người dẫn HAND_GAP m (client người thật tự tính phần này cho chính mình).
  followLeader(bot, leader) {
    if (!bot.pos || !leader.pos) return;
    const side = bot.handSide || 1;
    bot.movedAt = 0;
    this.move(bot.id, {
      x: leader.pos.x + Math.cos(leader.pos.ry) * HAND_GAP * side,
      z: leader.pos.z - Math.sin(leader.pos.ry) * HAND_GAP * side,
      ry: leader.pos.ry,
      moving: Boolean(leader.moving),
    });
  }

  // Buông tay (tự bấm, ngồi xuống, đi nhanh, đi quá xa). Không đang nắm tay ai thì không làm gì.
  releaseHand(participantId) {
    const participant = this.participants.get(participantId);
    if (!participant?.handWith) return { ok: false, error: 'NO_REQUEST' };
    const partner = this.participants.get(participant.handWith);
    const fromId = participant.handLead ? participantId : participant.handWith;
    const toId = participant.handLead ? participant.handWith : participantId;
    participant.handWith = null;
    participant.handLead = false;
    if (partner) {
      partner.handWith = null;
      partner.handLead = false;
    }
    this.revision += 1;
    this.broadcastState();
    this.handState(fromId, toId, 'released', participantId);
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
    for (const key of this.handRequests.keys()) if (key.split('>').includes(participantId)) this.handRequests.delete(key);
    // Người rời phòng (đã xóa khỏi danh sách): người còn lại thôi nắm tay.
    for (const other of this.participants.values()) {
      if (other.handWith !== participantId) continue;
      const lead = Boolean(other.handLead);
      other.handWith = null;
      other.handLead = false;
      this.revision += 1;
      this.handState(lead ? other.id : participantId, lead ? participantId : other.id, 'released', participantId);
    }
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
        .map(({ id, displayName, seatId, benchId, benchSpot, resumeToken, skin, merit, accountId, level, avatarUrl, title, frame }) => ({
          id, displayName, seatId, benchId, benchSpot, resumeToken, skin, merit,
          ...(accountId ? { accountId, level, avatarUrl, title, frame } : {}),
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
          ? {
            accountId: item.accountId,
            ...(validLevel(item.level) ? { level: item.level } : {}),
            ...(AVATAR_URL.test(item.avatarUrl || '') ? { avatarUrl: item.avatarUrl } : {}),
            ...(PLAYER_TITLES.includes(item.title) ? { title: item.title } : {}),
            ...(AVATAR_FRAMES.includes(item.frame) ? { frame: item.frame } : {}),
          } : {}),
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
    const check = this.canAddVideo(participantId, videoId);
    if (!check.ok) return check;
    const { current, queue } = this.playback;
    queue.push({ itemId: `q-${randomUUID()}`, videoId, title, addedBy: participant.displayName, addedById: participantId });
    if (!current) this.advance();
    else this.broadcastPlayback();
    return { ok: true };
  }

  // Mở phim tốn kim cương (rules.content.videoPrice): kiểm tra hàng chờ trước, trừ 💎 qua sổ API (khóa theo requestId nên
  // gửi lại không trừ hai lần), rồi mới thêm video; thêm không được (vừa có người thêm trùng…) thì hoàn ngay.
  async addPaidVideo(participantId, videoId, title, requestId) {
    const price = this.rules.content?.videoPrice || 0;
    if (!price) return this.addVideo(participantId, videoId, title);
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!participant.accountId) return { ok: false, error: 'SIGN_IN_REQUIRED' };
    const check = this.canAddVideo(participantId, videoId);
    if (!check.ok) return check;
    if (!this.wallet) return { ok: false, error: 'WALLET_UNAVAILABLE' };
    const accountId = participant.accountId;
    const key = createHash('sha256').update(`${accountId}:video:${requestId}`).digest('base64url').slice(0, 40);
    const paid = await this.wallet.spend({ accountId, amount: price, reason: 'cinema_video', ref: videoId, key }).catch(() => null);
    if (!paid?.ok) return { ok: false, error: paid?.error === 'INSUFFICIENT_DIAMONDS' ? 'INSUFFICIENT_DIAMONDS' : 'WALLET_UNAVAILABLE' };
    const result = this.closed ? { ok: false, error: 'NOT_IN_ROOM' } : this.addVideo(participantId, videoId, title);
    if (!result.ok) {
      await this.wallet.refund({ accountId, key }).catch(() => null);
      return result;
    }
    this.sendTo(participantId, { v: PROTOCOL_VERSION, type: 'wallet.update', epoch: this.epoch, diamonds: paid.diamonds, spent: price });
    return result;
  }

  canAddVideo(participantId, videoId) {
    const { current, queue } = this.playback;
    if (queue.length >= MAX_QUEUE) return { ok: false, error: 'QUEUE_FULL' };
    if (current?.videoId === videoId || queue.some((item) => item.videoId === videoId)) return { ok: false, error: 'ALREADY_QUEUED' };
    if (queue.filter((item) => item.addedById === participantId).length >= MAX_QUEUED_PER_PERSON) return { ok: false, error: 'TOO_MANY_QUEUED' };
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

  // ---- Bot: bot mặc định theo người thật; bot do Telegram quản lý có thể giữ phòng hoạt động. ----
  freeSeat(except) {
    const taken = new Set([...this.participants.values()].map((participant) => participant.seatId).filter(Boolean));
    return [...this.seatIds].find((seatId) => seatId !== except && !taken.has(seatId)) || null;
  }

  // Bot không bị đẩy khỏi ghế khi có người bấm vào. Khi số người thật tăng, bot ngồi rời trước để mỗi người thật
  // vẫn có bồ đoàn; bot đi dạo ngoài sân không chiếm ghế nên vẫn ở lại cả khi chánh điện đã đủ chỗ ngồi.
  // Đông bot thì khoảng một nửa ra sân đi dạo (tối thiểu walk.count), để sân không vắng khi bồ đoàn đã kín.
  get botWalkingTarget() {
    const walk = this.rules.bots?.walk;
    if (!walk?.count || !walk.waypoints?.length) return 0;
    return Math.min(this.botCount, Math.max(walk.count, Math.ceil(this.botCount / 2)));
  }

  get botSeatedTarget() {
    // Bot game là người xem bàn, không cần ghế hay vị trí 3D.
    // Tổng room.state vẫn phải nằm trong giới hạn protocol 500 người; người thật vào thì bot game rời trước.
    if (this.rules.bots?.play) return Math.min(this.botCount, Math.max(0, this.maxParticipants - this.realCount));
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
    const allNames = this.botWords().names || config.names || ['Phật tử'];
    const names = allNames.filter((name) => !used.has(name));
    const walkingNow = [...this.participants.values()].filter((participant) => participant.bot && participant.pos).length;
    // Lúc tạo sẵn (mở phòng / addbot) cho một nửa số bot đi dạo ra sân ngay, phần còn lại vào dần theo arrivalMs.
    const walkLimit = seeded ? Math.max(config.walk?.initial || 0, Math.ceil(this.botWalkingTarget / 2)) : this.botWalkingTarget;
    const walking = Boolean(config.walk?.waypoints?.length && walkingNow < Math.min(walkLimit, this.botTargetCount));
    const needsSeat = Boolean(this.rules.seats);
    const seatId = walking || !needsSeat ? null : this.freeSeat();
    if (!walking && needsSeat && !seatId) return null;
    state.serial += 1;
    const id = `bot-${state.serial}`;
    let displayName = names[Math.floor(Math.random() * names.length)];
    if (!displayName) {
      const base = allNames[Math.floor(Math.random() * allNames.length)] || 'Phật tử';
      let suffix = 2;
      while (used.has(`${base} ${suffix}`)) suffix += 1;
      displayName = `${base} ${suffix}`;
    }
    const skins = [...new Set([...(config.skins?.length ? config.skins : this.freeSkins), ...this.botSkins])];
    // Xáo một túi hình rồi rút dần: thứ tự bot mỗi phòng khác nhau nhưng chưa dùng hết danh mục thì không lặp hình.
    if (!state.skinBag?.length) {
      state.skinBag = [...skins];
      for (let index = state.skinBag.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [state.skinBag[index], state.skinBag[swap]] = [state.skinBag[swap], state.skinBag[index]];
      }
    }
    const skin = state.skinBag.pop();
    const bot = {
      id,
      displayName,
      seatId,
      socket: null,
      connected: true,
      bot: true,
      resumeToken: null,
      expireTimer: null,
      ...(skin ? { skin } : {}),
      ...(this.rules.interaction?.offerings ? { merit: seeded ? [120, 80, 55, 30, 20, 12, 8, 5][state.serial - 1] || 0 : Math.floor(Math.random() * 40) } : {}),
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
    if (!bot.pos || !bot.walk || !config?.waypoints?.length || bot.handWith) return false;
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

  // ---- Phòng Lô Tô riêng ----
  // Bot được chủ phòng mời: ngồi bàn như người chơi, mỗi ván tự mua vé (bàn Lô Tô gọi số, bot tự kinh như ở phòng chung).
  addInvitedBot(name) {
    if (!this.privateOwner || this.closed || this.privateClosing || typeof name !== 'string' || !name.trim()) return null;
    for (const participant of this.participants.values()) if (participant.bot && participant.displayName === name) return participant;
    const skins = this.rules.private?.botSkins || [];
    const bot = {
      id: `bot-p-${randomUUID().slice(0, 8)}`, displayName: name.slice(0, 40), seatId: null, socket: null, connected: true, bot: true,
      resumeToken: null, expireTimer: null, invited: true, ...(skins.length ? { skin: skins[Math.floor(Math.random() * skins.length)] } : {}),
    };
    this.participants.set(bot.id, bot);
    if (!this.privateTimer) {
      this.privateTimer = setInterval(() => {
        for (const participant of this.participants.values()) if (participant.bot) this.table?.placeBotTicket?.(participant);
      }, 2_000);
      this.privateTimer.unref?.();
    }
    this.revision += 1;
    this.broadcastState();
    return bot;
  }

  removeInvitedBot(name) {
    const bot = [...this.participants.values()].find((participant) => participant.bot && participant.displayName === name);
    if (!bot) return false;
    this.participants.delete(bot.id);
    this.dropSocial(bot.id);
    this.revision += 1;
    this.broadcastState();
    return true;
  }

  // Chủ phòng đuổi người được mời (API đã bỏ khỏi danh sách mời nên người đó không xin được vé mới).
  kickAccount(accountId) {
    let kicked = 0;
    for (const [id, participant] of [...this.participants]) {
      if (participant.bot || participant.accountId !== accountId || accountId === this.privateOwner) continue;
      if (this.kick(id, 'PRIVATE_KICKED', 'Chủ phòng đã mời bạn ra khỏi phòng riêng')) kicked += 1;
    }
    return kicked;
  }

  // Chủ phòng rời phòng: đóng phòng riêng. Ván Lô Tô đang dở bị hủy (API hoàn vé), mọi người nhận PRIVATE_ROOM_CLOSED.
  closePrivate() {
    if (!this.privateOwner || this.privateClosing) return;
    this.privateClosing = true;
    clearInterval(this.privateTimer);
    this.privateTimer = null;
    this.table?.abort?.();
    for (const [id, participant] of [...this.participants]) {
      if (!participant.bot) this.kick(id, 'PRIVATE_ROOM_CLOSED', 'Chủ phòng đã rời, phòng riêng đã đóng');
    }
    this.removeBots();
    this.onPrivateClosed?.(this.id);
    if (this.participants.size === 0) this.onEmpty();
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

  // Đổi số bot ngay trong lúc server đang chạy. Lệnh Telegram cần thấy kết quả ngay nên tạo đủ mục tiêu thay vì
  // chờ từng bot vào theo nhịp arrivalMs; sau đó churn vẫn thay người dần như cũ.
  // Dao động số bot quanh con số addbot: [gốc - 10, gốc + 10], không dưới min(gốc, 2) để bàn game vẫn đủ người
  // mở ván, không vượt giới hạn bot của phòng. botTick thêm / bớt bot theo botCount mới như bot ra vào thường ngày.
  driftBotCount(now = Date.now(), random = Math.random) {
    const drift = this.botDrift;
    if (!drift) return;
    const low = Math.max(Math.min(drift.base, 2), drift.base - BOT_DRIFT_RANGE);
    const high = Math.min(this.botLimit, drift.base + BOT_DRIFT_RANGE);
    if (!drift.nextTargetAt) {
      drift.nextTargetAt = now + randomBetween(BOT_DRIFT_TARGET_MS);
      drift.nextStepAt = now + randomBetween(BOT_DRIFT_STEP_MS);
      return;
    }
    if (now >= drift.nextTargetAt) {
      drift.target = low + Math.floor(random() * (high - low + 1));
      drift.nextTargetAt = now + randomBetween(BOT_DRIFT_TARGET_MS);
    }
    if (now < drift.nextStepAt) return;
    drift.nextStepAt = now + randomBetween(BOT_DRIFT_STEP_MS);
    if (this.botCount === drift.target) return;
    this.botCount = Math.max(low, Math.min(high, this.botCount + Math.sign(drift.target - this.botCount)));
  }

  setBotCount(count, options = {}) {
    const next = Math.max(0, Math.min(Number.isSafeInteger(count) ? count : 0, this.botLimit));
    this.botCount = next;
    // addbot: nhớ con số gốc để dao động quanh nó (0 thì tắt hẳn, không dao động).
    this.botDrift = options.drift && next > 0 ? { base: next, target: next, nextStepAt: 0, nextTargetAt: 0 } : null;
    this.keepBotsAlive = options.managed !== false && next > 0;
    if (!next) {
      this.removeBots();
      if (!this.realCount) this.table?.stop();
    } else {
      this.table?.start();
      this.ensureBots();
      let current = [...this.participants.values()].filter((participant) => participant.bot).length;
      while (current < this.botTargetCount && this.addBot(true)) current += 1;
      this.trimBotsForPeople();
      // Bồ đoàn đã đủ thì phần còn lại là bot đi dạo: cho ra sân luôn thay vì chờ vào dần.
      current = [...this.participants.values()].filter((participant) => participant.bot).length;
      while (current < this.botTargetCount && this.addBot()) current += 1;
      if (this.botState) this.botState.nextArrivalAt = 0;
    }
    this.revision += 1;
    this.broadcastState();
    return [...this.participants.values()].filter((participant) => participant.bot).length;
  }

  botTick() {
    if ((!this.connectedCount && !this.keepBotsAlive) || !this.botState) return;
    const config = this.rules.bots;
    const state = this.botState;
    const now = Date.now();
    const bots = [...this.participants.values()].filter((participant) => participant.bot);
    this.driftBotCount(now);
    const target = this.botTargetCount;
    let changed = false;
    const busyBot = (bot) => this.activeChallengeOf(bot.id) || this.table?.hasBotBet?.(bot.id) || this.table?.hasBotTicket?.(bot.id)
      || bot.handWith || (bot.talkUntil || 0) > now;
    if (bots.length > target) {
      // Bớt bot (addbot giảm / số bot dao động): ưu tiên bot rảnh, bot đang chơi dở rời sau cùng.
      const leaving = [...bots].reverse().find((bot) => !busyBot(bot)) || bots[bots.length - 1];
      this.dropSocial(leaving.id);
      this.participants.delete(leaving.id);
      changed = true;
    } else if (bots.length < target && now >= state.nextArrivalAt) {
      changed = Boolean(this.addBot());
      state.nextArrivalAt = now + randomBetween(config.arrivalMs);
    } else if (bots.length && now >= state.nextChurnAt) {
      const leaving = bots[Math.floor(Math.random() * bots.length)];
      // Bot đang chơi khiêu chiến thì không rời giữa trận.
      // Bot đang nắm tay, hoặc vừa được nhắn tin (chờ quản trị trả lời qua Telegram) cũng ở lại.
      const busy = busyBot(leaving);
      if (!busy) {
        this.participants.delete(leaving.id);
        this.dropSocial(leaving.id);
      }
      state.nextChurnAt = now + randomBetween(config.churnMs);
      state.nextArrivalAt = now + randomBetween(config.arrivalMs);
      changed = !busy;
    }
    if (changed) {
      this.revision += 1;
      this.broadcastState();
    }
    for (const bot of bots) {
      if (this.participants.has(bot.id)) this.advanceBotWalk(bot, now);
      // Bot đang đối đáp / chờ trả lời thì không chen câu khác vào giữa.
      if (!this.participants.has(bot.id) || now < bot.nextActionAt || (bot.talkUntil || 0) > now) continue;
      bot.nextActionAt = now + randomBetween(config.actionMs) * bot.pace;
      this.botAct(bot);
    }
    if (this.botAi && this.rules.world) {
      state.nextApproachAt ??= now + randomBetween(BOT_APPROACH_GAP_MS);
      if (now >= state.nextApproachAt) {
        state.nextApproachAt = now + randomBetween(BOT_APPROACH_GAP_MS);
        this.botApproach(now);
      }
    }
  }

  // Một bot đang đi dạo dừng lại bắt chuyện với người đứng gần: chào, rủ oẳn tù tì, hoặc mời sang phòng game.
  // Bỏ qua người đang ngồi, đang tụng kinh, đang nắm tay / đang chơi, người đã tắt (bot.quiet) và người đã chặn bot.
  botApproach(now = Date.now()) {
    const people = [];
    const bots = [];
    for (const participant of this.participants.values()) {
      if (!participant.pos) continue;
      if (participant.bot) {
        if (!participant.handWith && (participant.talkUntil || 0) <= now && !this.activeChallengeOf(participant.id)) bots.push(participant);
      } else if (participant.connected && !participant.botQuiet && !participant.seatId && !participant.benchId && !participant.handWith
        && !participant.sutra && now - (participant.botApproachedAt || 0) >= BOT_APPROACH_PERSON_MS && !this.activeChallengeOf(participant.id)) {
        people.push(participant);
      }
    }
    const pairs = [];
    for (const person of people) {
      for (const bot of bots) {
        if (!this.blockedBetween(person, bot) && Math.hypot(person.pos.x - bot.pos.x, person.pos.z - bot.pos.z) <= BOT_APPROACH_RANGE) pairs.push([bot, person]);
      }
    }
    if (!pairs.length) return null;
    const [bot, person] = pairs[Math.floor(Math.random() * pairs.length)];
    person.botApproachedAt = now;
    bot.talkUntil = now + BOT_APPROACH_HOLD_MS;
    // Đứng lại, quay mặt về phía người kia.
    if (bot.walk) bot.walk.waitUntil = now + BOT_APPROACH_HOLD_MS;
    bot.movedAt = 0;
    this.move(bot.id, { x: bot.pos.x, z: bot.pos.z, ry: headingOf(person.pos.x - bot.pos.x, person.pos.z - bot.pos.z), moving: false });
    const roll = Math.random();
    const kind = roll < 0.4 ? 'challenge' : roll < 0.8 ? 'invite' : 'greet';
    const game = kind === 'invite' ? GAME_ROOMS[Math.floor(Math.random() * GAME_ROOMS.length)] : undefined;
    const done = this.botAi.line(kind, { lang: this.lang, botName: bot.displayName, toName: person.displayName, game, sample: person.lastChat }).then((line) => {
      if (!this.botStillWith(bot, person)) return;
      this.botSpeak(bot, line);
      this.botMemory(bot, person.id).push({ bot: true, text: line });
      if (kind === 'challenge') this.challengeSend(bot.id, person.id, 'rps');
      if (kind === 'invite') this.botInvite(bot, person, game);
    });
    return { botId: bot.id, personId: person.id, kind, game, done };
  }

  // Hai bot đứng gần nhau đối đáp theo kịch bản có sẵn: cả hai dừng lại quay mặt vào nhau, mỗi câu cách nhau vài
  // giây như đang gõ. {name} là tên người nghe câu đó. Bot nào rời phòng giữa chừng thì dừng cuộc nói chuyện.
  botDialogue(bot, dialogues, now = Date.now()) {
    if (!dialogues?.length || !bot.pos || bot.handWith || (bot.talkUntil || 0) > now) return null;
    let partner = null;
    let best = BOT_DIALOGUE_RANGE;
    for (const other of this.participants.values()) {
      if (!other.bot || other === bot || !other.pos || other.handWith || (other.talkUntil || 0) > now || this.activeChallengeOf(other.id)) continue;
      const distance = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
      if (distance <= best) {
        best = distance;
        partner = other;
      }
    }
    if (!partner) return null;
    const script = dialogues[Math.floor(Math.random() * dialogues.length)];
    const pair = [bot, partner];
    const lines = script.map((text, index) => ({
      gap: index ? 2_500 + Math.min(3_000, text.length * 60) + Math.random() * 1_500 : 0,
      speaker: pair[index % 2],
      text: text.replaceAll('{name}', pair[(index + 1) % 2].displayName),
    }));
    const total = lines.reduce((sum, item) => sum + item.gap, 0);
    for (const [self, other] of [[bot, partner], [partner, bot]]) {
      self.talkUntil = now + total + 4_000;
      if (self.walk) self.walk.waitUntil = self.talkUntil;
      self.movedAt = 0;
      this.move(self.id, { x: self.pos.x, z: self.pos.z, ry: headingOf(other.pos.x - self.pos.x, other.pos.z - self.pos.z), moving: false });
    }
    const present = () => !this.closed && pair.every((member) => this.participants.get(member.id) === member);
    const done = lines.reduce((previous, { gap, speaker, text }) => previous.then((going) => going && new Promise((resolve) => {
      setTimeout(() => {
        if (!present()) return resolve(false);
        this.botSpeak(speaker, text);
        resolve(true);
      }, gap);
    })), Promise.resolve(true));
    return { botId: bot.id, partnerId: partner.id, lines, done };
  }

  // Người thật chào cả sân ("chào mọi người", "hello"…): bot đi dạo gần nhất chào lại bằng tên, theo ngôn ngữ người
  // chào. Mỗi người một lần / 5 phút, cả phòng một lần / 20 giây để không thành cả đám bot đồng thanh.
  botGreetBack(person, text, now = Date.now()) {
    if (!this.rules.bots || !person?.pos || person.bot || person.botQuiet || !GREETING.test(text.trim())) return null;
    let bot = null;
    let best = BOT_APPROACH_RANGE;
    for (const other of this.participants.values()) {
      if (!other.bot || !other.pos || other.handWith || (other.talkUntil || 0) > now || this.blockedBetween(person, other)) continue;
      const distance = Math.hypot(other.pos.x - person.pos.x, other.pos.z - person.pos.z);
      if (distance <= best) {
        best = distance;
        bot = other;
      }
    }
    if (!bot || !this.allow(`${person.id}:bot-greet`, 1, 5 * 60_000) || !this.allow('*:bot-greet', 1, 20_000)) return null;
    const lang = guessLang(text) || this.lang;
    const lines = (this.rules.bots.byLang?.[lang] || (lang === 'vi' ? this.rules.bots : this.botWords())).talk?.greetBack;
    if (!lines?.length) return null;
    const line = lines[Math.floor(Math.random() * lines.length)].replaceAll('{name}', person.displayName);
    bot.talkUntil = now + 6_000;
    if (bot.walk) bot.walk.waitUntil = Math.max(bot.walk.waitUntil, bot.talkUntil);
    bot.movedAt = 0;
    this.move(bot.id, { x: bot.pos.x, z: bot.pos.z, ry: headingOf(person.pos.x - bot.pos.x, person.pos.z - bot.pos.z), moving: false });
    const done = new Promise((resolve) => setTimeout(() => {
      if (this.botStillWith(bot, person)) this.botSpeak(bot, line);
      resolve(line);
    }, 1_200 + Math.random() * 1_800));
    return { botId: bot.id, line, done };
  }

  // Bot và người kia vẫn còn trong phòng (mã bot được dùng lại khi bot cũ rời: so cả đối tượng).
  botStillWith(bot, person) {
    return !this.closed && this.participants.get(bot.id) === bot && this.participants.get(person.id) === person && person.connected;
  }

  botInvite(bot, person, game) {
    if (person.botQuiet) return;
    this.sendTo(person.id, { v: PROTOCOL_VERSION, type: 'game.invite', epoch: this.epoch, fromId: bot.id, game });
  }

  // Vài câu gần nhất giữa bot và từng người (để AI trả lời có ngữ cảnh). Chỉ trong bộ nhớ, mất khi bot rời phòng.
  botMemory(bot, personId) {
    bot.memory ||= new Map();
    let turns = bot.memory.get(personId);
    if (!turns) {
      if (bot.memory.size >= 20) bot.memory.delete(bot.memory.keys().next().value);
      turns = [];
      bot.memory.set(personId, turns);
    }
    if (turns.length > 6) turns.splice(0, turns.length - 6);
    return turns;
  }

  // Người chơi nhắn bot (@Tên bot …): AI trả lời sau chốc lát như đang gõ. Muốn chơi oẳn tù tì / nhắc tên phòng game thì
  // bot khiêu chiến / mời luôn. Quản trị vẫn nhận tin qua Telegram và trả lời thay được (/tl).
  botReply(from, bot, text) {
    if (!this.botAi || !from || from.bot || !this.allow(`${from.id}:bot-ai`, 3, 60_000)) return null;
    const said = text.slice(bot.displayName.length + 1).replace(/^[\s,:.!?]+/, '').trim() || text;
    const turns = this.botMemory(bot, from.id);
    turns.push({ bot: false, text: said });
    const history = turns.slice();
    const game = WANTS_GAME.find(([, pattern]) => pattern.test(said))?.[0];
    const rps = !game && WANTS_RPS.test(said);
    const started = Date.now();
    bot.talkUntil = Math.max(bot.talkUntil || 0, started + BOT_TALK_HOLD_MS);
    return this.botAi.line('reply', { lang: this.lang, botName: bot.displayName, toName: from.displayName, history, sample: said }).then((line) => new Promise((resolve) => {
      // Trả lời ngay quá trông như máy: chờ ít nhất 1,5 giây kể từ lúc nhận tin.
      setTimeout(() => {
        if (this.botStillWith(bot, from)) {
          this.botSpeak(bot, line);
          turns.push({ bot: true, text: line });
          if (rps && !this.activeChallengeOf(bot.id) && !this.activeChallengeOf(from.id)) this.challengeSend(bot.id, from.id, 'rps');
          if (game) this.botInvite(bot, from, game);
        }
        resolve(line);
      }, Math.max(0, 1_500 - (Date.now() - started)));
      // Promise phía trên chỉ hoàn tất khi timer này chạy. Không `unref()` timer:
      // nếu đây là việc cuối trong event loop (thường gặp ở CI hoặc lúc server đang
      // drain), Node có thể thoát trong khi Promise vẫn pending và hủy câu trả lời.
    }));
  }

  // Không muốn bot tự bắt chuyện / mời (chỉ trong phiên; client nhớ lựa chọn và gửi lại khi vào phòng).
  setBotQuiet(participantId, quiet) {
    const participant = this.participants.get(participantId);
    if (!participant) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!this.allow(`${participantId}:bot-quiet`, 5, 60_000)) return { ok: false, error: 'RATE_LIMITED' };
    participant.botQuiet = quiet;
    return { ok: true };
  }

  // Tụng một câu kinh, hoặc dâng lễ (dâng hương là thường nhất), đôi khi kèm lời nguyện. Bot không thỉnh chuông.
  botAct(bot) {
    const config = this.rules.bots;
    if (config.play === 'dice' && this.table?.placeBotBet) {
      const spots = this.table.definition.spots;
      const stakes = config.stakes || [1, 5, 10];
      this.table.placeBotBet(bot, {
        key: spots[Math.floor(Math.random() * spots.length)],
        amount: stakes[Math.floor(Math.random() * stakes.length)],
      });
      return;
    }
    if (config.play === 'loto' && this.table?.placeBotTicket) {
      this.table.placeBotTicket(bot);
      return;
    }
    const { lines } = this.botWords();
    const line = () => lines[Math.floor(Math.random() * lines.length)];
    // Bot đang đi ngoài sân chỉ trò chuyện/niệm Phật; lễ vật được dâng bởi bot đang ở chánh điện. Ngoài sân nói ít
    // hơn và chủ yếu chuyện đời thường (talk.lines), có lúc đứng lại đối đáp với bot gần đó, thỉnh thoảng mới niệm Phật.
    const chatty = () => this.allow('*:bot-chat', 1, BOT_CHAT_GAP_MS);
    if (bot.pos) {
      const talk = this.botWords().talk;
      const roll = Math.random();
      if (!chatty()) return;
      if (talk && roll < 0.3 && this.botDialogue(bot, talk.dialogues)) return;
      if (talk && roll >= 0.85) return;
      this.botSpeak(bot, talk?.lines?.length && roll < 0.7 ? talk.lines[Math.floor(Math.random() * talk.lines.length)] : line());
      return;
    }
    const roll = Math.random();
    if (!this.rules.interaction?.offerings || roll < 0.5) {
      if (!chatty()) return;
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
      this.offer(bot.id, kind, Math.random() < 0.4 && chatty() ? line() : undefined);
    }
  }

  broadcast(message) {
    if (message.type === 'chat.message') this.recordChat(message);
    for (const participant of this.participants.values()) send(participant.socket, message);
  }

  recordChat({ participantId, displayName, text, sentAt }) {
    this.chatLog.push({ participantId, ...(displayName ? { displayName } : {}), text, sentAt });
    this.trimChat(sentAt);
  }

  // Bỏ tin của hôm trước và tin cũ quá số tối đa.
  trimChat(now = Date.now()) {
    const today = dayStartOf(now, CHAT_TIME_ZONE);
    let drop = this.chatLog.findIndex((item) => item.sentAt >= today);
    if (drop < 0) drop = this.chatLog.length;
    drop = Math.max(drop, this.chatLog.length - CHAT_HISTORY_MAX);
    if (drop > 0) this.chatLog.splice(0, drop);
  }

  chatHistoryMessage() {
    this.trimChat();
    // Người đã bị khóa chat/nick lúc trước vẫn có thể còn tin trong sổ; trang tự ẩn tin của người mình đã chặn.
    return { v: PROTOCOL_VERSION, type: 'chat.history', epoch: this.epoch, messages: this.chatLog.slice() };
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
    this.dropOtherSessions(claims);
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
        ...(PLAYER_TITLES.includes(claims.title) ? { title: claims.title } : {}),
        ...(AVATAR_FRAMES.includes(claims.frame) ? { frame: claims.frame } : {}),
        // Hình đã mua (theo vé); nối lại bằng resume token thì giữ danh sách cũ.
        ownedSkins: claims.skins || previous?.ownedSkins || [],
      } : {}),
      // "Nick mới" khi dò clone: khách, hoặc tài khoản tạo chưa tới 24 giờ (vé ghi).
      fresh: claims.role === 'guest' || claims.fresh === true,
      ipHash: previous?.ipHash || null,
      resumeExpiresAt: 0,
      expireTimer: null,
      // Danh sách người mình chặn (giữ khi nối lại).
      blocked: previous?.blocked || new Set(),
      ...this.personalization(claims.participantId, previous, claims),
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

  // left: người dùng bấm rời phòng (đóng kết nối mã 1000), không phải rớt mạng / tải lại trang.
  disconnect(participantId, socket, { left = false } = {}) {
    const participant = this.participants.get(participantId);
    if (!participant || participant.socket !== socket) return false;
    // Chủ phòng riêng bấm rời: đóng phòng ngay (rớt mạng / tải lại thì còn thời hạn nối lại như mọi người).
    if (left && this.privateOwner && participant.accountId === this.privateOwner) {
      participant.socket = null;
      participant.connected = false;
      this.closePrivate();
      return true;
    }
    participant.socket = null;
    participant.connected = false;
    participant.resumeExpiresAt = Date.now() + this.resumeTtlMs;
    this.stopChore(participantId);
    this.scheduleExpiry(participant);
    this.revision += 1;
    this.broadcastState();
    return true;
  }

  // Một tài khoản chỉ là một người trong phòng: vào từ trình duyệt / máy khác (hoặc bằng vé mới) thì người cũ của
  // tài khoản đó rời phòng ngay — kể cả bản đang chờ nối lại — thay vì hiện hai nhân vật cùng tên. Tab cũ nhận
  // SESSION_REPLACED rồi bị đóng (mã 4003) và thôi tự nối lại.
  dropOtherSessions(claims) {
    if (!claims.accountId) return;
    for (const [id, other] of this.participants) {
      if (id === claims.participantId || other.bot || other.accountId !== claims.accountId) continue;
      if (other.expireTimer) clearTimeout(other.expireTimer);
      if (other.socket?.readyState === WebSocket.OPEN) {
        other.socket.send(JSON.stringify({
          v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.epoch, code: 'SESSION_REPLACED',
          message: 'Tài khoản đã vào phòng từ trình duyệt hoặc máy khác',
        }));
        other.socket.close(4003, 'Tài khoản đã vào từ nơi khác');
      }
      this.participants.delete(id);
      this.stopChore(id);
      this.dropSocial(id);
      for (const key of this.rates.keys()) if (key.startsWith(`${id}:`)) this.rates.delete(key);
    }
  }

  // Tin bắt đầu bằng "@Tên bot" là nhắn bot đó (tên dài nhất khớp trước). Trả về bot hoặc null.
  botMentioned(text) {
    if (typeof text !== 'string' || !text.startsWith('@')) return null;
    let found = null;
    for (const participant of this.participants.values()) {
      if (!participant.bot) continue;
      const name = participant.displayName;
      const rest = text.slice(1, name.length + 2);
      if (rest.toLowerCase().startsWith(name.toLowerCase()) && (rest.length === name.length || /[\s,:.!?]/.test(rest[name.length]))
        && (!found || name.length > found.displayName.length)) found = participant;
    }
    return found;
  }

  // Người chơi nhắn bot: giữ bot ở lại phòng và chuyển tin tới quản trị (Telegram) qua API.
  forwardBotChat(from, bot, text) {
    bot.talkUntil = Date.now() + BOT_TALK_HOLD_MS;
    if (!this.onBotChat || !from || from.bot) return;
    Promise.resolve(this.onBotChat({
      roomId: this.id, botId: bot.id, botName: bot.displayName,
      fromId: from.id, fromName: from.displayName, ...(from.accountId ? { accountId: from.accountId } : {}), text,
    })).catch(() => {});
  }

  // Quản trị trả lời thay bot (lệnh Telegram /tl): bot nói câu đó trong phòng như chat thường.
  // botName: tên bot lúc người chơi nhắn; mã bot được dùng lại cho bot mới nên khác tên là bot cũ đã rời phòng.
  botSay(botId, text, botName = null) {
    const bot = this.participants.get(botId);
    if (!bot?.bot || this.closed || (botName && bot.displayName !== botName)) return { ok: false, error: 'BOT_GONE' };
    const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!clean) return { ok: false, error: 'INVALID_TEXT' };
    bot.talkUntil = Date.now() + BOT_TALK_HOLD_MS;
    this.botSpeak(bot, clean);
    return { ok: true, botName: bot.displayName };
  }

  botSpeak(bot, text) {
    this.broadcast({
      v: PROTOCOL_VERSION, type: 'chat.message', epoch: this.epoch, messageId: `m-${randomUUID()}`,
      participantId: bot.id, displayName: bot.displayName, text: String(text).slice(0, 280), sentAt: Date.now(),
    });
  }

  // Đá một người khỏi phòng ngay (bị khóa): báo mã lỗi, đóng kết nối (client thôi nối lại), bỏ cả chỗ chờ nối lại.
  kick(participantId, code, message) {
    const participant = this.participants.get(participantId);
    if (!participant || participant.bot) return false;
    if (participant.expireTimer) clearTimeout(participant.expireTimer);
    if (participant.socket?.readyState === WebSocket.OPEN) {
      participant.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'protocol.error', epoch: this.epoch, code, message }));
      participant.socket.close(CLOSE_BANNED, 'Bị khóa');
    }
    participant.connected = false;
    participant.resumeToken = null;
    this.expire(participantId, null);
    return true;
  }

  expire(participantId, resumeToken) {
    const participant = this.participants.get(participantId);
    if (!participant || participant.connected || participant.resumeToken !== resumeToken) return false;
    this.participants.delete(participantId);
    this.stopChore(participantId);
    this.dropSocial(participantId);
    for (const key of this.rates.keys()) if (key.startsWith(`${participantId}:`)) this.rates.delete(key);
    // Chủ phòng riêng hết thời hạn nối lại (đóng trang, mất mạng lâu): đóng phòng.
    if (this.privateOwner && participant.accountId === this.privateOwner && !this.privateClosing) {
      this.closePrivate();
      return true;
    }
    if (this.realCount === 0 && !this.keepBotsAlive) {
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
  personalization(participantId, previous, claims = null) {
    const skins = this.rules.skins;
    if (!skins) return {};
    // Hình chọn lần cuối của tài khoản (vé ghi): mặc ngay nếu phòng có hình đó; hình shop thì vé phải ghi đã mua.
    const wanted = claims?.skin;
    const wantedOk = typeof wanted === 'string' && (skins.includes(wanted) || isShopSkin(wanted))
      && (!isPremiumSkin(wanted) || Boolean(claims.skins?.includes(wanted)));
    // Hình mua trong shop không chia cho ai; chỉ giữ lại khi người đó đang mặc (nối lại).
    const keep = skins.includes(previous?.skin) || isShopSkin(previous?.skin);
    const skin = wantedOk ? wanted : keep ? previous.skin : this.freeSkins[hashText(participantId) % this.freeSkins.length];
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

  // Đá mọi người đang bị khóa (theo tài khoản hoặc IP) khỏi các phòng trên máy này. Gọi sau mỗi lần đồng bộ sổ khóa.
  enforceBans(guard = this.moderation) {
    if (!guard) return 0;
    let kicked = 0;
    for (const room of this.rooms.values()) {
      for (const participant of [...room.participants.values()]) {
        if (participant.bot) continue;
        const ban = guard.banned({ accountId: participant.accountId, ipHash: participant.ipHash });
        if (ban && room.kick(participant.id, 'BANNED', bannedText(ban))) kicked += 1;
      }
    }
    return kicked;
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
    this.botManaged = false;
    this.managedBotCounts = new Map();
    this.botPlanReplacesDefaults = false;
    this.getBotSkins = options.getBotSkins || (async () => []);
    this.onOffering = options.onOffering;
    this.onChoreReward = options.onChoreReward;
    this.onFriend = options.onFriend;
    this.onReport = options.onReport;
    this.onBotChat = options.onBotChat;
    this.botAi = options.botAi || null;
    this.moderation = options.moderation || null;
    this.bauCua = options.bauCua;
    this.lotto = options.lotto;
    this.wallet = options.wallet;
    this.privateRooms = options.privateRooms;
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

  // `addbot N`: mở các phòng công khai nền tảng, dành tối thiểu hai bot cho từng trò rồi rải ngẫu nhiên phần còn
  // lại vào mọi phòng có cấu hình bot đang nằm trên node. Bot vượt sức chứa được bỏ qua và báo lại `assigned`.
  async setBotTotal(total, random = Math.random) {
    if (!Number.isSafeInteger(total) || total < 0 || total > 1_000) return null;
    this.botManaged = true;
    this.botPlanReplacesDefaults = true;
    for (const type of ['thien', 'cinema', 'game', 'taixiu', 'loto']) this.botCounts[type] = 0;
    const baseRooms = ['thien-1', 'cinema-1', 'game-1', 'taixiu-1', 'loto-1'];
    if (total > 0) await Promise.all(baseRooms.map((roomId) => this.open(roomId)));

    const rooms = [...this.rooms.values()].filter((room) => room.rules.bots && !room.closed);
    const allocations = new Map(rooms.map((room) => [room.id, 0]));
    const capacity = (room) => Math.max(0, Math.min(room.botLimit, room.maxParticipants - room.realCount));
    let remaining = total;
    const games = ['game-1', 'taixiu-1', 'loto-1'].map((roomId) => this.rooms.get(roomId)).filter((room) => room?.rules.bots);
    // Hai người là đủ để Lô Tô bắt đầu; Bầu Cua/Tài Xỉu cũng không còn cảnh bàn trống.
    for (let pass = 0; pass < 2 && remaining > 0; pass += 1) {
      for (const room of games) {
        if (remaining <= 0 || allocations.get(room.id) >= capacity(room)) continue;
        allocations.set(room.id, allocations.get(room.id) + 1);
        remaining -= 1;
      }
    }
    while (remaining > 0) {
      const available = rooms.filter((room) => allocations.get(room.id) < capacity(room));
      if (!available.length) break;
      const room = available[Math.floor(random() * available.length) % available.length];
      allocations.set(room.id, allocations.get(room.id) + 1);
      remaining -= 1;
    }

    const result = [];
    this.managedBotCounts = new Map(allocations);
    for (const room of rooms) {
      const bots = allocations.get(room.id) || 0;
      room.setBotCount(bots, { managed: true, drift: true });
      result.push({ roomId: room.id, type: room.type, name: this.roomName(room.id), bots });
    }
    // Phòng không được chia bot và không có người thật thì trả lease; addbot 0 cũng dọn sạch các phòng bot-only.
    for (const room of [...rooms]) if (!allocations.get(room.id) && room.realCount === 0) this.removeIfEmpty(room.id);
    return { requested: total, assigned: total - remaining, rooms: result.sort((a, b) => a.roomId.localeCompare(b.roomId)) };
  }

  // API gửi cùng kế hoạch này tới mọi node. Mỗi node chỉ áp dụng các phòng nó đang giữ (hoặc giành được lease
  // nếu phòng chưa mở), nên một phòng không bao giờ bị nhân đôi bot. Kế hoạch được giữ để phòng mở lại vẫn nhận
  // đúng số bot thay vì rơi về BOTS_GAME/BOTS_TAIXIU hay 0 của Lô Tô.
  async setBotAllocations(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const allocations = new Map();
    let requested = 0;
    for (const [roomId, count] of Object.entries(input)) {
      if (!roomTypeOf(roomId) || !Number.isSafeInteger(count) || count < 0 || count > 1_000) return null;
      requested += count;
      if (requested > 1_000) return null;
      allocations.set(roomId, count);
    }
    const replace = options.replace !== false;
    const perState = (room) => Boolean(parseThienRoomId(room.id)) && allocations.has('thien-1');
    this.botManaged = true;
    if (replace) {
      this.managedBotCounts = allocations;
      this.botPlanReplacesDefaults = true;
    } else {
      for (const [roomId, count] of allocations) this.managedBotCounts.set(roomId, count);
    }
    await Promise.all([...allocations].filter(([, count]) => count > 0).map(([roomId]) => this.open(roomId)));

    const result = [];
    for (const room of [...this.rooms.values()]) {
      if (!room.rules.bots || room.closed) continue;
      if (!replace && !allocations.has(room.id) && !perState(room)) continue;
      const bots = room.setBotCount(this.managedBotCount(room.id) ?? 0, { managed: !parseThienRoomId(room.id), drift: true });
      if (bots > 0 || allocations.has(room.id)) result.push({ roomId: room.id, type: room.type, name: this.roomName(room.id), bots });
      if (bots === 0 && room.realCount === 0) this.removeIfEmpty(room.id);
    }
    return { requested, assigned: result.reduce((sum, room) => sum + room.bots, 0), rooms: result.sort((a, b) => a.roomId.localeCompare(b.roomId)) };
  }

  // Lệnh `addbot chanhdien N` đặt bot cho thien-1, nhưng người chơi vào chánh điện theo tiểu bang (thien-ca-vi-1…):
  // số bot của thien-1 áp dụng cho từng chánh điện tiểu bang. Phòng tiểu bang không giữ lease chỉ vì bot (managed:
  // false), hết người thật thì đóng như thường.
  managedBotCount(roomId) {
    if (this.botManaged && this.managedBotCounts.has(roomId)) return this.managedBotCounts.get(roomId);
    if (this.botManaged && parseThienRoomId(roomId) && this.managedBotCounts.has('thien-1')) return this.managedBotCounts.get('thien-1');
    return this.botPlanReplacesDefaults ? 0 : undefined;
  }

  roomName(roomId) {
    return ({ 'thien-1': 'Chánh điện', 'cinema-1': 'Rạp phim', 'game-1': 'Bầu Cua', 'taixiu-1': 'Tài Xỉu', 'loto-1': 'Lô Tô' })[roomId] || roomId;
  }

  async #open(roomId) {
    if (!roomTypeOf(roomId)) return { ok: false, error: 'UNKNOWN_ROOM' };
    // Phòng Lô Tô riêng: hỏi API chủ phòng và bot đã được mời; phòng đã đóng thì không mở lại.
    let privateInfo = null;
    if (isPrivateRoomId(roomId)) {
      privateInfo = await Promise.resolve(this.privateRooms?.info(roomId)).catch(() => null);
      if (!privateInfo?.ok) return { ok: false, error: 'ROOM_CLOSED' };
    }
    const botSkins = await this.getBotSkins().catch(() => []);
    const lease = await this.directory.acquireRoom(roomId, this.nodeId, this.leaseTtlMs);
    if (!lease.ok) return { ok: false, error: 'ROOM_ELSEWHERE', owner: lease.owner };
    const managedBotCount = this.managedBotCount(roomId);
    const room = new Room(roomId, {
      botCount: managedBotCount ?? this.botCounts[roomTypeOf(roomId)],
      botSkins,
      epoch: lease.epoch,
      resumeTtlMs: this.resumeTtlMs,
      issueResumeToken: this.issueResumeToken,
      onEmpty: () => this.removeIfEmpty(roomId),
      onOffering: this.onOffering,
      onChoreReward: this.onChoreReward,
      onFriend: this.onFriend,
      onReport: this.onReport,
      onBotChat: this.onBotChat,
      botAi: this.botAi,
      moderation: this.moderation,
      bauCua: this.bauCua,
      lotto: this.lotto,
      wallet: this.wallet,
      ...(privateInfo ? { privateOwner: privateInfo.owner, onPrivateClosed: (id) => this.privateRooms?.closed(id) } : {}),
    });
    for (const name of privateInfo?.bots || []) room.addInvitedBot(name);
    try {
      const record = await this.directory.loadSnapshot(roomId);
      if (record) room.restore(record);
    } catch (error) {
      await this.directory.releaseRoom(roomId, this.nodeId, lease.epoch).catch(() => {});
      throw error;
    }
    if (managedBotCount !== undefined) room.setBotCount(managedBotCount, { managed: !parseThienRoomId(roomId), drift: true });
    this.rooms.set(roomId, room);
    return { ok: true, room };
  }

  removeIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.realCount > 0 || room.keepBotsAlive) return;
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

  // Thành viên đã đăng nhập đang kết nối trên máy này: báo API để bạn bè thấy mình ở phòng nào.
  presenceEntries() {
    const entries = [];
    for (const room of this.rooms.values()) {
      if (room.closed) continue;
      for (const participant of room.participants.values()) {
        if (participant.accountId && participant.connected && !participant.bot) entries.push({ accountId: participant.accountId, roomId: room.id, participantId: participant.id });
      }
    }
    return entries;
  }

  // Có lời nhắn / lời mời bạn bè mới: báo mọi kết nối của tài khoản này trên máy này để trang tải hộp thư.
  notifyAccount(accountId, kind) {
    let sent = 0;
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        if (participant.accountId !== accountId || !participant.connected) continue;
        send(participant.socket, { v: PROTOCOL_VERSION, type: 'inbox.notify', epoch: room.epoch, kind });
        sent += 1;
      }
    }
    return sent;
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
    if (context.ipHash) joined.participant.ipHash = context.ipHash;
    if (joined.participant.accountId) context.presenceChanged?.();
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
    if (room.chatLog.length) send(socket, room.chatHistoryMessage());
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
    if (!room.table?.placeBet) {
      protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không có bàn cược', message.requestId);
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
    if (!room.table?.cancelBets) {
      protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không có bàn cược', message.requestId);
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
  if (message.type === 'lotto.buy' || message.type === 'lotto.claim') {
    if (room.table?.kind !== 'loto') {
      protocolError(socket, room.epoch, 'NOT_ALLOWED', 'Phòng này không có bàn Lô Tô', message.requestId);
      return;
    }
    const buying = message.type === 'lotto.buy';
    if (!room.allow(`${context.participantId}:${buying ? 'lotto-buy' : 'lotto-claim'}`, 5, 10_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', buying ? 'Bạn mua vé quá nhanh' : 'Bạn bấm kinh quá nhanh', message.requestId);
      return;
    }
    const participant = room.participants.get(context.participantId);
    Promise.resolve(buying ? room.table.buy(participant, message) : room.table.claim(participant, message)).then((result) => {
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
    if (!screenText(socket, room, room.participants.get(context.participantId), message.text, message.requestId, { chat: true })) return;
    const mentioned = room.botMentioned(message.text);
    // Câu gần nhất người này gõ: bot bắt chuyện bằng đúng ngôn ngữ họ dùng.
    const speaker = room.participants.get(context.participantId);
    if (speaker) speaker.lastChat = message.text.slice(0, 120);
    if (mentioned) {
      room.forwardBotChat(room.participants.get(context.participantId), mentioned, message.text);
      room.botReply(room.participants.get(context.participantId), mentioned, message.text)?.catch(() => {});
    } else room.botGreetBack(speaker, message.text);
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
    // Ngồi xuống thì buông tay người đang nắm.
    if (result.ok) room.releaseHand(context.participantId);
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'SEAT_TAKEN' ? 'Ghế đã có người' : 'Ghế không hợp lệ', message.requestId);
    return;
  }
  if (message.type === 'bench.select') {
    if (!room.allow(`${context.participantId}:bench`, 3, 10_000)) {
      protocolError(socket, room.epoch, 'RATE_LIMITED', 'Bạn đang đổi ghế quá nhanh', message.requestId);
      return;
    }
    const result = room.selectBench(context.participantId, message.benchId);
    if (result.ok) room.releaseHand(context.participantId);
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
    // Đi nhanh sang khu khác: người đi cùng không theo kịp, buông tay.
    if (result.ok) room.releaseHand(context.participantId);
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
  if (message.type === 'pet.interact') {
    const result = room.petInteract(context.participantId, message.petId, message.action);
    if (!result.ok) {
      const detail = result.error === 'RATE_LIMITED' ? 'Bạn đang chơi với thú cưng quá nhanh'
        : result.error === 'INVALID_PET' ? 'Không tìm thấy thú cưng này'
          : 'Hãy lại gần thú cưng để tương tác';
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
    if (!result.ok) protocolError(socket, room.epoch, result.error, result.error === 'RATE_LIMITED' ? 'Bạn đổi động tác quá nhanh' : result.error === 'YARD_ONLY' ? 'Tương tác ngoài sân chùa nhé, trong chánh điện giữ trang nghiêm 🙏' : 'Phòng này không có động tác', message.requestId);
    return;
  }
  if (message.type === 'bot.quiet') {
    const result = room.setBotQuiet(context.participantId, message.quiet);
    if (!result.ok) protocolError(socket, room.epoch, result.error, 'Bạn đổi quá nhanh', message.requestId);
    return;
  }
  if (message.type.startsWith('friend.') || message.type.startsWith('challenge.') || message.type.startsWith('player.') || message.type.startsWith('hand.')) {
    const id = context.participantId;
    const result = message.type === 'player.block' ? room.block(id, message.targetId, message.blocked)
      : message.type === 'hand.request' ? room.handRequest(id, message.targetId)
      : message.type === 'hand.respond' ? room.handRespond(id, message.fromId, message.accept)
      : message.type === 'hand.release' ? room.releaseHand(id)
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
    if (message.text && !screenText(socket, room, room.participants.get(context.participantId), message.text, message.requestId)) return;
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
      return room.addPaidVideo(context.participantId, message.videoId, info.title, message.requestId).then((result) => {
        if (!result.ok) protocolError(socket, room.epoch, result.error, QUEUE_ERRORS[result.error] || 'Không thêm được video', message.requestId);
      });
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

const minutesLeft = (until) => Math.max(1, Math.ceil(((until ?? Date.now()) - Date.now()) / 60_000));
const mutedText = (until) => (until && until < Date.now() + 365 * 24 * 60 * 60_000
  ? `Bạn đang bị tạm khóa chat (còn ${minutesLeft(until) >= 120 ? `${Math.round(minutesLeft(until) / 60)} giờ` : `${minutesLeft(until)} phút`}) vì dùng từ không phù hợp.`
  : 'Bạn đang bị khóa chat vì dùng từ không phù hợp.');
function bannedText(ban) {
  if (!ban?.until) return 'Tài khoản đã bị khóa vì vi phạm quy định trò chuyện. Nếu khóa nhầm, hãy gửi Góp ý & Báo lỗi.';
  const minutes = minutesLeft(ban.until);
  const left = minutes >= 2 * 24 * 60 ? `${Math.round(minutes / (24 * 60))} ngày` : minutes >= 120 ? `${Math.round(minutes / 60)} giờ` : `${minutes} phút`;
  return `Tài khoản đang bị khóa (còn ${left}) vì vi phạm quy định trò chuyện. Nếu khóa nhầm, hãy gửi Góp ý & Báo lỗi.`;
}

// Kiểm duyệt chữ trước khi phát cho phòng: đang tắt chat, từ cấm (cộng điểm vi phạm), và với chat thì thêm: nick mới
// gửi link / số điện thoại, gửi lặp cùng nội dung, nick clone nhắn trùng, từ khả nghi (vẫn gửi, báo Telegram).
function screenText(socket, room, participant, text, requestId, { chat = false } = {}) {
  const guard = room.moderation;
  if (!guard || !participant || participant.bot || typeof text !== 'string') return true;
  const mutedUntil = guard.mutedUntil(participant);
  if (mutedUntil) {
    protocolError(socket, room.epoch, 'CHAT_MUTED', mutedText(mutedUntil), requestId);
    return false;
  }
  const result = guard.check(text);
  if (result.action === 'block') {
    protocolError(socket, room.epoch, 'CHAT_BLOCKED', 'Tin có từ ngữ không phù hợp nên không được gửi. Tái phạm nhiều lần sẽ bị khóa chat.', requestId);
    guard.violation(participant, room, result).then((answer) => {
      if (answer?.action === 'mute' && socket.readyState === WebSocket.OPEN) protocolError(socket, room.epoch, 'CHAT_MUTED', mutedText(answer.ban?.expiresAt));
    }).catch(() => {});
    return false;
  }
  if (chat) {
    const promo = hasPromo(text);
    if (promo && participant.fresh) {
      protocolError(socket, room.epoch, 'CHAT_PROMO', 'Tài khoản mới chưa được gửi link, số điện thoại hay lời mời sang ứng dụng khác.', requestId);
      return false;
    }
    if (!room.allow(`${participant.id}:same:${repeatKey(text)}`, 2, 30_000)) {
      protocolError(socket, room.epoch, 'CHAT_REPEAT', 'Bạn vừa gửi tin này rồi, xin đợi một chút.', requestId);
      return false;
    }
    const clones = guard.clones(participant, room, text, promo || result.action === 'suspect');
    if (clones) {
      for (const offender of clones.offenders) room.kick(offender.participantId, 'BANNED', 'Tài khoản bị khóa vì nhắn trùng hàng loạt (nick clone). Nếu khóa nhầm, hãy gửi Góp ý & Báo lỗi.');
      if (clones.offenders.some((offender) => offender.participantId === participant.id)) return false;
    }
  }
  if (result.action === 'suspect') guard.suspect(participant, room, result);
  return true;
}

const SOCIAL_ERRORS = {
  NOT_IN_ROOM: 'Người này không còn trong phòng',
  NOT_ALLOWED: 'Người này không nhận lời mời',
  RATE_LIMITED: 'Bạn thao tác quá nhanh, chờ một chút nhé',
  NO_REQUEST: 'Lời mời đã hết hạn',
  BUSY: 'Một trong hai người đang có trận khác',
  NO_CHALLENGE: 'Trận đấu đã kết thúc',
  ALREADY_MOVED: 'Bạn đã ra tay ở lượt này',
  HAND_BUSY: 'Một trong hai người đang nắm tay người khác',
  TOO_FAR: 'Hai người cần cùng đứng gần nhau (không ngồi) mới nắm tay được',
};

const QUEUE_ERRORS = {
  QUEUE_FULL: 'Hàng chờ đã đầy',
  ALREADY_QUEUED: 'Video này đã có trong hàng chờ',
  TOO_MANY_QUEUED: 'Mỗi người chỉ được chờ tối đa 3 video',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng',
  SIGN_IN_REQUIRED: 'Đăng nhập để mở phim (mỗi phim 20 💎)',
  INSUFFICIENT_DIAMONDS: 'Không đủ kim cương để mở phim (cần 20 💎)',
  WALLET_UNAVAILABLE: 'Chưa trừ được kim cương, thử lại sau',
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
  if (opened.error === 'ROOM_CLOSED') return { status: '410 Gone', message: 'private room closed' };
  if (!opened.ok) return { status: '409 Conflict', message: 'room is on another node' };
  if (ticket.ok) return { claims: ticket.value, room: opened.room };

  const participant = opened.room.participants.get(resume.value.participantId);
  // Hết hạn giữ chỗ: nhận kết nối để báo mã lỗi rõ ràng, client sẽ xin vé mới thay vì thử lại mãi.
  if (!participant) return { rejected: 'INVALID_RESUME_TOKEN', room: opened.room };
  const claims = participant.accountId
    ? {
      participantId: participant.id, roomId, displayName: participant.displayName, role: 'member',
      accountId: participant.accountId, level: participant.level, avatarUrl: participant.avatarUrl,
      title: participant.title, frame: participant.frame, skins: participant.ownedSkins, fresh: participant.fresh,
    }
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
  // API đã xác thực lệnh Telegram `addbot N`: đặt tổng bot cho node và trả phân bổ thực tế từng phòng.
  // Quản trị trả lời thay bot từ Telegram (qua API): chỉ máy đang giữ phòng có bot đó trả 200.
  if (req.method === 'POST' && req.url === '/internal/bot-say') {
    const allowed = options.secret && req.headers?.['x-internal-key'] === internalKey(options.secret);
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4 * 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const valid = typeof input?.roomId === 'string' && typeof input?.botId === 'string' && typeof input?.text === 'string';
      const room = valid ? registry.rooms.get(input.roomId) : null;
      const result = room ? room.botSay(input.botId, input.text, typeof input.botName === 'string' ? input.botName : null) : { ok: false, error: valid ? 'ROOM_ELSEWHERE' : 'INVALID' };
      res.writeHead(result.ok ? 200 : valid ? 404 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(result));
    });
    return;
  }
  // API báo việc của phòng Lô Tô riêng: thêm / bỏ bot được mời, đuổi người. Máy không giữ phòng đó thì bỏ qua.
  if (req.method === 'POST' && req.url === '/internal/private-room') {
    if (!options.secret || req.headers?.['x-internal-key'] !== internalKey(options.secret)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const room = isPrivateRoomId(input?.roomId) ? registry.rooms.get(input.roomId) : null;
      const valid = ['bot-add', 'bot-remove', 'kick'].includes(input?.action);
      let done = false;
      if (room && valid) {
        if (input.action === 'bot-add') done = Boolean(room.addInvitedBot(input.name));
        else if (input.action === 'bot-remove') done = room.removeInvitedBot(input.name);
        else done = /^a-[a-zA-Z0-9-]{8,64}$/.test(input.accountId || '') && room.kickAccount(input.accountId) > 0;
      }
      res.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(valid ? { ok: true, done } : { error: 'invalid' }));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/internal/account-notify') {
    if (!options.secret || req.headers?.['x-internal-key'] !== internalKey(options.secret)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const valid = /^a-[a-zA-Z0-9-]{8,64}$/.test(input?.accountId || '') && ['note', 'invite'].includes(input?.kind);
      const sent = valid ? registry.notifyAccount(input.accountId, input.kind) : 0;
      res.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(valid ? { ok: true, sent } : { error: 'invalid' }));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/internal/bots') {
    const allowed = options.secret && req.headers?.['x-internal-key'] === internalKey(options.secret);
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"forbidden"}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_024) req.destroy();
    });
    req.on('end', () => {
      let input = null;
      try { input = JSON.parse(raw); } catch {}
      const hasTotal = Number.isSafeInteger(input?.total) && input.total >= 0 && input.total <= 1_000;
      const hasAllocations = input?.allocations && typeof input.allocations === 'object' && !Array.isArray(input.allocations);
      if (!hasTotal && !hasAllocations) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"invalid_bot_total"}');
        return;
      }
      const operation = hasAllocations
        ? registry.setBotAllocations(input.allocations, { replace: input.replace !== false })
        : registry.setBotTotal(input.total);
      operation.then((result) => {
        res.writeHead(result ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end(JSON.stringify(result || { error: 'invalid_bot_total' }));
      }).catch(() => {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end('{"error":"bot_distribution_failed"}');
      });
    });
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

// Báo API danh sách thành viên đang online trên máy này (cả danh sách mỗi lần, để người đã rời tự mất khỏi danh sách).
export function presenceReporter(apiInternalUrl, secret, registry) {
  const key = internalKey(secret);
  const url = new URL('/internal/presence', apiInternalUrl);
  return () => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify({ nodeId: registry.nodeId, entries: registry.presenceEntries() }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
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

// Chuyển tin người chơi nhắn bot tới API (API báo Telegram để quản trị trả lời). Lỗi mạng chỉ ghi log.
export function botChatRecorder(apiInternalUrl, secret) {
  const key = internalKey(secret);
  const url = new URL('/internal/bot-chat', apiInternalUrl);
  return (event) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => {
    if (!response.ok) console.warn(`Không chuyển được tin nhắn bot (${response.status})`);
  }).catch((error) => console.warn(`Không chuyển được tin nhắn bot: ${error.message}`));
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

// Danh mục hình bot lấy từ các nhân vật shop đang bật. Cache một phút để mở nhiều phòng không dồn request vào API;
// khi API tạm mất kết nối, phòng vẫn mở ngay với các hình bot có sẵn trong room rules.
// Phòng Lô Tô riêng: thông tin phòng (chủ phòng, bot được mời) và báo đóng phòng qua API nội bộ.
export function privateRoomApi(apiInternalUrl, key, fetcher = fetch) {
  const call = (path) => (roomId) => fetcher(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify({ roomId }),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json());
  return { info: call('/internal/private-rooms/info'), closed: (roomId) => call('/internal/private-rooms/closed')(roomId).catch(() => null) };
}

// Gọi API trừ / hoàn kim cương. Lỗi mạng ném lỗi (phòng coi như chưa trừ được).
export function diamondWallet(apiInternalUrl, key, fetcher = fetch) {
  const call = (path) => (body) => fetcher(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => response.json());
  return { spend: call('/internal/shop/spend'), refund: call('/internal/shop/refund') };
}

export function shopBotSkinProvider(apiInternalUrl, fetcher = fetch) {
  const url = new URL('/api/v1/shop', apiInternalUrl);
  let cached = [];
  let refreshAfter = 0;
  let pending = null;
  return async () => {
    if (Date.now() < refreshAfter) return cached;
    pending ||= (async () => {
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) {
          const shop = await response.json();
          cached = [...new Set((shop.items || [])
            .filter((item) => item.kind === 'skin' && isPremiumSkin(item.skin))
            .map((item) => item.skin))];
        }
      } catch {
        // Danh mục shop không phải điều kiện để vào phòng; lần làm mới sau sẽ thử lại.
      } finally {
        refreshAfter = Date.now() + 60_000;
        pending = null;
      }
      return cached;
    })();
    return pending;
  };
}

export function createRealtimeServer(options = {}) {
  const secret = options.secret || DEFAULT_LOCAL_SECRET;
  // Kiểm duyệt: danh sách từ + sổ khóa đồng bộ từ API (API_INTERNAL_URL); không có API thì chỉ lọc từ mặc định.
  const moderation = options.moderation || createModerationGuard({
    secret,
    remote: options.apiInternalUrl ? moderationRemote(options.apiInternalUrl, internalKey(secret)) : null,
  });
  const registry = options.registry || new RoomRegistry({
    moderation,
    nodeId: options.nodeId,
    publicUrl: options.publicUrl,
    directory: options.directory,
    leaseTtlMs: options.leaseTtlMs,
    nodeTtlMs: options.nodeTtlMs,
    resumeTtlMs: options.resumeTtlMs,
    botCounts: options.botCounts,
    getBotSkins: options.getBotSkins || (options.apiInternalUrl ? shopBotSkinProvider(options.apiInternalUrl) : undefined),
    issueResumeToken: (claims) => createResumeToken(claims, secret),
    onOffering: options.recordOffering || (options.apiInternalUrl ? offeringRecorder(options.apiInternalUrl, secret) : undefined),
    onChoreReward: options.recordChoreReward || (options.apiInternalUrl ? choreRewardRecorder(options.apiInternalUrl, secret) : undefined),
    onFriend: options.recordFriend || (options.apiInternalUrl ? friendRecorder(options.apiInternalUrl, secret) : undefined),
    onReport: options.recordReport || (options.apiInternalUrl ? reportRecorder(options.apiInternalUrl, secret) : undefined),
    onBotChat: options.recordBotChat || (options.apiInternalUrl ? botChatRecorder(options.apiInternalUrl, secret) : undefined),
    // Bầu Cua: đặt cược / chốt ván qua ví xu ở API.
    bauCua: options.bauCua || (options.apiInternalUrl ? bauCuaBank(options.apiInternalUrl, internalKey(secret)) : undefined),
    lotto: options.lotto || (options.apiInternalUrl ? lottoBank(options.apiInternalUrl, internalKey(secret)) : undefined),
    // Ví kim cương (mở phim): trừ / hoàn qua API.
    wallet: options.wallet || (options.apiInternalUrl ? diamondWallet(options.apiInternalUrl, internalKey(secret)) : undefined),
    // Phòng Lô Tô riêng: hỏi API chủ phòng + bot được mời, báo API khi phòng đóng.
    privateRooms: options.privateRooms || (options.apiInternalUrl ? privateRoomApi(options.apiInternalUrl, internalKey(secret)) : undefined),
  });
  registry.moderation ||= moderation;
  // Bot nói bằng AI: options.botAi (test), hoặc tạo từ khóa Groq (botAiKey rỗng = chỉ câu mẫu). Câu AI viết phải qua
  // bộ lọc chat (không từ cấm / khả nghi, không link) mới được nói.
  const botAi = options.botAi ?? (options.botAiKey !== undefined ? createBotAi({
    apiKey: options.botAiKey,
    model: options.botAiModel || BOT_AI_MODEL,
    screen: (text) => moderation.check(text).action === 'ok' && !hasPromo(text),
  }) : null);
  if (botAi) registry.botAi ||= botAi;
  // Bạn bè thấy mình online ở phòng nào: báo API mỗi PRESENCE_REPORT_MS, và ~1 giây sau khi có thành viên vào phòng.
  const reportPresence = options.reportPresence || (options.apiInternalUrl ? presenceReporter(options.apiInternalUrl, secret, registry) : null);
  let presenceTimer = null;
  let presenceSoon = null;
  if (reportPresence) {
    presenceTimer = setInterval(reportPresence, PRESENCE_REPORT_MS);
    presenceTimer.unref?.();
    registry.presenceChanged = () => {
      if (presenceSoon) return;
      presenceSoon = setTimeout(() => {
        presenceSoon = null;
        reportPresence();
      }, 1_000);
      presenceSoon.unref?.();
    };
  }
  moderation.onEnforce = () => registry.enforceBans(moderation);
  const server = http.createServer((req, res) => handleRealtimeRequest(req, res, registry, { secret }));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname !== '/ws' || !validOrigin(req)) {
      rejectUpgrade(socket, '403 Forbidden', 'forbidden');
      return;
    }
    authorizeUpgrade(url, registry, secret).then(async (result) => {
      // Nick / IP đang bị khóa: hỏi lại API một lần (có thể vừa được mở khóa) rồi mới từ chối.
      if (result.claims) {
        result.ipHash = moderation.ipKey(req);
        const who = { accountId: result.claims.accountId, ipHash: result.ipHash };
        if (moderation.banned(who)) await moderation.refresh();
        result.ban = moderation.banned(who);
      }
      if (!result.claims && !result.rejected) {
        rejectUpgrade(socket, result.status, result.message);
        return;
      }
      sockets.handleUpgrade(req, socket, head, (webSocket) => {
        sockets.emit('connection', webSocket, req, result);
      });
    }).catch(() => rejectUpgrade(socket, '503 Service Unavailable', 'room directory unavailable'));
  });

  sockets.on('connection', (socket, req, { claims, room, rejected, ipHash: ipKey, ban }) => {
    // Kết nối chết (điện thoại mất sóng, trình duyệt bị tắt ngang) không báo ngắt: ping mức WebSocket mỗi nhịp,
    // hai nhịp không thấy pong thì cắt để người đó rời phòng (vẫn giữ chỗ trong thời hạn resume).
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    if (rejected) {
      protocolError(socket, room?.epoch ?? 0, rejected, rejected === 'INVALID_TICKET' ? 'Vé vào phòng không hợp lệ' : 'Phiên nối lại đã hết hạn');
      socket.close(1008, 'Phiên nối lại hết hạn');
      return;
    }
    // Nick / IP đang bị khóa: báo mã BANNED rồi đóng (vé cấp trước lúc khóa, hoặc nối lại bằng resume token).
    if (ban) {
      protocolError(socket, room.epoch, 'BANNED', bannedText(ban));
      socket.close(CLOSE_BANNED, 'Bị khóa');
      return;
    }
    const context = {
      claims, participantId: null, room, ipHash: ipKey, fetchVideoInfo: options.fetchVideoInfo || fetchYouTubeInfo, presenceChanged: registry.presenceChanged,
    };
    const helloTimer = setTimeout(() => {
      if (!context.participantId) socket.close(1008, 'Chưa gửi hello');
    }, options.helloTimeoutMs || HELLO_TIMEOUT_MS);
    socket.on('message', (raw) => handleRoomMessage(socket, context, raw));
    socket.on('close', (code) => {
      clearTimeout(helloTimer);
      if (!context.participantId) return;
      context.room.disconnect(context.participantId, socket, { left: code === 1000 });
    });
    socket.on('error', () => {});
  });

  server.on('listening', () => {
    registry.start(options.tickMs);
    moderation.start(options.moderationSyncMs);
  });
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
    clearInterval(presenceTimer);
    clearTimeout(presenceSoon);
    moderation.stop();
    registry.stop();
  });

  server.roomRegistry = registry;
  server.moderation = moderation;
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
  // Số bot theo loại phòng: BOTS_THIEN / BOTS_CINEMA / BOTS_GAME / BOTS_TAIXIU / BOTS_LOTO (0 để tắt).
  const botCounts = {};
  for (const type of ['thien', 'cinema', 'game', 'taixiu', 'loto']) {
    const value = process.env[`BOTS_${type.toUpperCase()}`];
    if (value !== undefined && /^\d+$/.test(value)) botCounts[type] = Number(value);
  }
  // API_INTERNAL_URL: địa chỉ API trong mạng nội bộ để ghi công đức của thành viên (không đặt thì không ghi).
  const apiInternalUrl = process.env.API_INTERNAL_URL || null;
  // Bot tự bắt chuyện / trả lời bằng AI: GROQ_API_KEY (không đặt thì dùng câu mẫu), BOT_AI_MODEL, BOT_AI=0 để tắt hẳn.
  const botAiKey = process.env.BOT_AI === '0' ? undefined : (process.env.GROQ_API_KEY || '');
  const server = createRealtimeServer({ secret, nodeId, publicUrl, directory, botCounts, apiInternalUrl, botAiKey, botAiModel: process.env.BOT_AI_MODEL });
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
