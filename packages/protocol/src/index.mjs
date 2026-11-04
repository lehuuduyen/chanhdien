export const PROTOCOL_VERSION = 1;

export const LIMITS = Object.freeze({
  roomId: 64,
  participantId: 64,
  connectionId: 64,
  requestId: 64,
  resumeToken: 512,
  displayName: 40,
  chatText: 280,
  seatId: 64,
  benchId: 64,
  itemId: 64,
  videoTitle: 200,
  queue: 50,
  prayer: 120,
  avatarUrl: 200,
  reportNote: 200,
});

// Ảnh đại diện trong phòng: chỉ ảnh Google của thành viên đăng nhập Gmail.
export const AVATAR_URL = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[A-Za-z0-9._~\/=+-]{1,180}$/;

// Id video YouTube: 11 ký tự [A-Za-z0-9_-].
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const PLAYBACK_EVENTS = Object.freeze(['duration', 'ended', 'error']);
export const SKINS = Object.freeze(['man', 'woman', 'granny', 'nun', 'monk', 'child']);
export const OFFERING_KINDS = Object.freeze(['petal', 'incense', 'lotus', 'bell']);
// Động tác của nhân vật (chế độ nhập vai): đứng, quỳ, lạy 3 lạy, lạy 108 lạy.
// chant: tụng kinh (kèm mã bài kinh `sutra`), woodfish: gõ mõ.
export const EMOTES = Object.freeze(['stand', 'kneel', 'bow3', 'bow108', 'chant', 'woodfish']);
const SUTRA_ID = /^[a-z0-9-]{1,32}$/;
// Sớ: cầu an (peace) hoặc cầu siêu (memorial). Cả phòng chỉ biết ai dâng sớ loại gì; tên người trong sớ không đi qua phòng.
export const PRAYER_KINDS = Object.freeze(['peace', 'memorial']);
// Toạ độ nhân vật tính bằng mét, làm tròn 1 cm; giới hạn rộng để dùng chung cho mọi cảnh.
// Trò chơi khiêu chiến giữa hai người trong phòng (server làm trọng tài). Hiện có kéo búa bao (rps).
export const GAMES = Object.freeze(['rps']);
export const RPS_CHOICES = Object.freeze(['rock', 'paper', 'scissors']);
export const CHALLENGE_STATUSES = Object.freeze(['pending', 'declined', 'cancelled', 'expired', 'playing', 'finished']);
export const FRIEND_STATUSES = Object.freeze(['pending', 'accepted', 'declined']);
// Báo cáo người chơi: lý do cố định, kèm ghi chú ngắn tùy chọn.
export const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'inappropriate', 'other']);
const RESULT_SIDES = ['from', 'to', 'draw'];
// Vườn Công Đức: 10 luống chung; server API quyết định mọi thay đổi, realtime chỉ phát lại.
export const GARDEN_PLANTS = Object.freeze(['apple', 'orange', 'peach']);
export const GARDEN_STAGES = Object.freeze(['seed', 'sprout', 'young', 'fruiting']);
export const GARDEN_EFFECTS = Object.freeze(['plant', 'water', 'harvest']);
// Đi nhanh chỉ nhận tên điểm cố định; client không bao giờ được tự gửi tọa độ dịch chuyển.
export const TRAVEL_DESTINATIONS = Object.freeze(['hall', 'courtyard', 'garden']);
// Thả cảm xúc (rạp phim): biểu tượng bay lên trên đầu nhân vật, không lưu vào trạng thái phòng.
export const REACTIONS = Object.freeze(['clap', 'laugh', 'heart', 'wow', 'cry', 'fire']);
// Bầu Cua chơi chung (phòng game): 6 linh vật, ba pha của một ván.
export const BAU_CUA_ANIMALS = Object.freeze(['nai', 'bau', 'ga', 'ca', 'cua', 'tom']);
export const GAME_PHASES = Object.freeze(['betting', 'rolling', 'result']);
const ROUND_ID = /^bc-[a-z0-9-]{4,76}$/;
const MAX_STAKE = 1_000;
export const WORLD_LIMIT = 1_000;
export const MOVES_PER_BATCH = 500;

export const CLIENT_MESSAGE_POLICY = Object.freeze({
  hello: { roles: ['guest', 'member', 'moderator', 'host'], rate: '1/kết nối' },
  'chat.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'seat.select': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 giây' },
  'bench.select': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 giây, tối đa theo room rules' },
  'room.command': { roles: ['moderator', 'host'], rate: '10/10 giây' },
  ping: { roles: ['guest', 'member', 'moderator', 'host'], rate: '1/10 giây' },
  'queue.add': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/60 giây, tối đa 3 video chờ mỗi người' },
  'vote.skip': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
  'playback.report': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây' },
  'avatar.set': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
  'offering.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: 'theo từng lễ vật (room rules), tối đa 6/10 giây' },
  'travel.go': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 giây, đích cố định theo room rules' },
  move: { roles: ['guest', 'member', 'moderator', 'host'], rate: '8/giây, chỉ khi đang đi; server gom 200 ms rồi phát' },
  emote: { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'reaction.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '6/10 giây' },
  'bet.place': { roles: ['member', 'moderator', 'host'], rate: '10/5 giây, chỉ trong pha đặt cược, tối đa 1.000 xu mỗi ván' },
  'prayer.announce': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
  'friend.request': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
  'friend.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, mỗi người một trận một lúc' },
  'challenge.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.move': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây' },
  'challenge.cancel': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'player.block': { roles: ['guest', 'member', 'moderator', 'host'], rate: '20/60 giây' },
  'player.report': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
});

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;
const ROLES = new Set(['guest', 'member', 'moderator', 'host']);
const COMMANDS = new Set(['pause', 'resume', 'skip']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCoord = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= WORLD_LIMIT;
const isAngle = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 7;
const position = (value) => isRecord(value) && exactKeys(value, ['x', 'z', 'ry']) && isCoord(value.x) && isCoord(value.z) && isAngle(value.ry);
const isInteger = (value) => Number.isSafeInteger(value);
const isString = (value, max, pattern) => typeof value === 'string'
  && value.length > 0
  && value.length <= max
  && (!pattern || pattern.test(value));

// Số xu theo linh vật Bầu Cua: full = đủ 6 linh vật (tổng cả bàn), không thì chỉ các linh vật có cược.
const animalAmounts = (value, full) => isRecord(value)
  && Object.keys(value).every((key) => BAU_CUA_ANIMALS.includes(key))
  && (!full || BAU_CUA_ANIMALS.every((key) => Object.hasOwn(value, key)))
  && Object.values(value).every((amount) => isInteger(amount) && amount >= 0);

function exactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => allowed.has(key));
}

const base = (message) => isRecord(message)
  && message.v === PROTOCOL_VERSION
  && typeof message.type === 'string';

const clientSchemas = {
  hello(message) {
    return exactKeys(message, ['v', 'type', 'roomId', 'displayName'], ['resumeToken'])
      && isString(message.roomId, LIMITS.roomId, ID_PATTERN)
      && isString(message.displayName, LIMITS.displayName)
      && (message.resumeToken === undefined || isString(message.resumeToken, LIMITS.resumeToken));
  },
  'chat.send'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'text'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.text, LIMITS.chatText);
  },
  'seat.select'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'seatId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.seatId, LIMITS.seatId, ID_PATTERN);
  },
  'bench.select'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'benchId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.benchId, LIMITS.benchId, ID_PATTERN);
  },
  'room.command'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'command'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && COMMANDS.has(message.command);
  },
  ping(message) {
    return exactKeys(message, ['v', 'type', 'sentAt']) && isInteger(message.sentAt) && message.sentAt >= 0;
  },
  'queue.add'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'videoId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.videoId === 'string' && VIDEO_ID.test(message.videoId);
  },
  'vote.skip'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'itemId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.itemId, LIMITS.itemId, ID_PATTERN);
  },
  'avatar.set'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'skin'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && SKINS.includes(message.skin);
  },
  // Lễ vật ở chánh điện, kèm lời nguyện tùy chọn.
  'offering.send'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'kind'], ['text'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && OFFERING_KINDS.includes(message.kind)
      && (message.text === undefined || isString(message.text, LIMITS.prayer));
  },
  // Đi nhanh giữa các khu trong cùng cảnh; server tra tọa độ từ room rules để không cho client xuyên tới điểm lạ.
  'travel.go'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'destination'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && TRAVEL_DESTINATIONS.includes(message.destination);
  },
  // Vị trí nhân vật khi đang đi (moving = false ở lần gửi cuối khi dừng lại).
  move(message) {
    return exactKeys(message, ['v', 'type', 'x', 'z', 'ry', 'moving'])
      && isCoord(message.x) && isCoord(message.z) && isAngle(message.ry)
      && typeof message.moving === 'boolean';
  },
  // Báo phòng mình vừa gửi sớ (sau khi API nhận sớ) để thầy làm lễ đọc sớ.
  'prayer.announce'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'kind'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && PRAYER_KINDS.includes(message.kind);
  },
  emote(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'kind'], ['sutra'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && EMOTES.includes(message.kind)
      && (message.sutra === undefined || (message.kind === 'chant' && typeof message.sutra === 'string' && SUTRA_ID.test(message.sutra)));
  },
  // Đặt cược Bầu Cua (phòng game): một lần chạm = một khoản cược vào một linh vật; API trừ xu ngay.
  'bet.place'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'roundId', 'animal', 'amount'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && BAU_CUA_ANIMALS.includes(message.animal)
      && isInteger(message.amount) && message.amount >= 1 && message.amount <= MAX_STAKE;
  },
  'reaction.send'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'kind'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && REACTIONS.includes(message.kind);
  },
  // Lời mời kết bạn tới một người trong phòng; người nhận trả lời bằng friend.respond.
  'friend.request'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN);
  },
  'friend.respond'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'fromId', 'accept'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && typeof message.accept === 'boolean';
  },
  // Khiêu chiến một người trong phòng chơi `game`.
  'challenge.send'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId', 'game'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN)
      && GAMES.includes(message.game);
  },
  'challenge.respond'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'challengeId', 'accept'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && typeof message.accept === 'boolean';
  },
  // Ra tay trong lượt hiện tại; server giữ kín tới khi cả hai đã ra.
  'challenge.move'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'challengeId', 'choice'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && RPS_CHOICES.includes(message.choice);
  },
  'challenge.cancel'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'challengeId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN);
  },
  // Chặn / bỏ chặn một người trong phòng: người bị chặn không gửi lời mời được tới mình (chỉ trong phiên).
  'player.block'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId', 'blocked'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN)
      && typeof message.blocked === 'boolean';
  },
  // Báo cáo một người trong phòng cho người quản lý.
  'player.report'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId', 'reason'], ['note'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN)
      && REPORT_REASONS.includes(message.reason)
      && (message.note === undefined || isString(message.note, LIMITS.reportNote));
  },
  // Client báo thời lượng video (giây), video đã hết, hoặc không phát được. Server chỉ dùng làm tín hiệu tổng hợp.
  'playback.report'(message) {
    return exactKeys(message, ['v', 'type', 'itemId', 'event'], ['value'])
      && isString(message.itemId, LIMITS.itemId, ID_PATTERN)
      && PLAYBACK_EVENTS.includes(message.event)
      && (message.event === 'duration'
        ? typeof message.value === 'number' && Number.isFinite(message.value) && message.value > 0 && message.value <= 6 * 3600
        : message.value === undefined || (Number.isSafeInteger(message.value) && message.value >= 0 && message.value < 1_000));
  },
};

const queueItem = (value) => isRecord(value)
  && exactKeys(value, ['itemId', 'videoId', 'title', 'addedBy'])
  && isString(value.itemId, LIMITS.itemId, ID_PATTERN)
  && typeof value.videoId === 'string' && VIDEO_ID.test(value.videoId)
  && typeof value.title === 'string' && value.title.length <= LIMITS.videoTitle
  && isString(value.addedBy, LIMITS.displayName);

const participant = (value) => isRecord(value)
  && exactKeys(value, ['id', 'displayName'], ['seatId', 'benchId', 'benchSpot', 'connected', 'skin', 'merit', 'bot', 'level', 'avatarUrl', 'pos', 'emote', 'sutra'])
  && (value.pos === undefined || position(value.pos))
  && (value.emote === undefined || EMOTES.includes(value.emote))
  && (value.sutra === undefined || (typeof value.sutra === 'string' && SUTRA_ID.test(value.sutra)))
  && (value.avatarUrl === undefined || (typeof value.avatarUrl === 'string' && value.avatarUrl.length <= LIMITS.avatarUrl && AVATAR_URL.test(value.avatarUrl)))
  && (value.bot === undefined || value.bot === true)
  && (value.level === undefined || (isInteger(value.level) && value.level >= 1 && value.level <= 99))
  && (value.skin === undefined || SKINS.includes(value.skin))
  && (value.merit === undefined || (isInteger(value.merit) && value.merit >= 0))
  && isString(value.id, LIMITS.participantId, ID_PATTERN)
  && isString(value.displayName, LIMITS.displayName)
  && (value.seatId === undefined || value.seatId === null || isString(value.seatId, LIMITS.seatId, ID_PATTERN))
  && ((value.benchId === undefined && value.benchSpot === undefined)
    || (isString(value.benchId, LIMITS.benchId, ID_PATTERN) && isInteger(value.benchSpot) && value.benchSpot >= 1 && value.benchSpot <= 4))
  && (value.connected === undefined || typeof value.connected === 'boolean');

const serverSchemas = {
  welcome(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'connectionId', 'serverTime', 'heartbeatMs'], ['resumeToken'])
      && isString(message.connectionId, LIMITS.connectionId, ID_PATTERN)
      && isInteger(message.serverTime) && message.serverTime >= 0
      && isInteger(message.heartbeatMs) && message.heartbeatMs >= 1_000
      && (message.resumeToken === undefined || isString(message.resumeToken, LIMITS.resumeToken));
  },
  'room.state'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roomId', 'revision', 'participants'])
      && isString(message.roomId, LIMITS.roomId, ID_PATTERN)
      && isInteger(message.revision) && message.revision >= 0
      && Array.isArray(message.participants) && message.participants.length <= 500
      && message.participants.every(participant);
  },
  // displayName: tên người gửi, để máy không thấy người đó (phòng đông) vẫn hiện được tên.
  'chat.message'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'messageId', 'participantId', 'text', 'sentAt'], ['displayName'])
      && isString(message.messageId, LIMITS.requestId, ID_PATTERN)
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && (message.displayName === undefined || isString(message.displayName, LIMITS.displayName))
      && isString(message.text, LIMITS.chatText)
      && isInteger(message.sentAt) && message.sentAt >= 0;
  },
  // Trạng thái phát: client tự tính vị trí = (giờ server − startedAt) / 1000 giây.
  'playback.state'(message) {
    const current = message.current;
    return exactKeys(message, ['v', 'type', 'epoch', 'current', 'queue', 'votes', 'votesNeeded'])
      && (current === null || (isRecord(current)
        && exactKeys(current, ['itemId', 'videoId', 'title', 'addedBy', 'startedAt'], ['duration'])
        && queueItem({ itemId: current.itemId, videoId: current.videoId, title: current.title, addedBy: current.addedBy })
        && isInteger(current.startedAt) && current.startedAt >= 0
        && (current.duration === undefined || (typeof current.duration === 'number' && current.duration > 0))))
      && Array.isArray(message.queue) && message.queue.length <= LIMITS.queue && message.queue.every(queueItem)
      && isInteger(message.votes) && message.votes >= 0
      && isInteger(message.votesNeeded) && message.votesNeeded >= 1;
  },
  offering(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'offeringId', 'participantId', 'kind', 'at'], ['text', 'displayName'])
      && isString(message.offeringId, LIMITS.requestId, ID_PATTERN)
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && (message.displayName === undefined || isString(message.displayName, LIMITS.displayName))
      && OFFERING_KINDS.includes(message.kind)
      && isInteger(message.at) && message.at >= 0
      && (message.text === undefined || isString(message.text, LIMITS.prayer));
  },
  // Phòng đông: số người cả phòng (có tính bot; bots là số bot trong đó), bảng công đức đầu phòng và hạng của
  // người nhận. Gửi riêng từng người, chỉ khi đổi; room.state lúc đó chỉ chứa những người máy này thấy.
  'room.count'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'total', 'bots', 'top'], ['rank'])
      && isInteger(message.total) && message.total >= 0
      && isInteger(message.bots) && message.bots >= 0 && message.bots <= message.total
      && Array.isArray(message.top) && message.top.length <= 20
      && message.top.every((item) => isRecord(item) && exactKeys(item, ['id', 'displayName', 'merit'], ['level', 'avatarUrl'])
        && isString(item.id, LIMITS.participantId, ID_PATTERN)
        && isString(item.displayName, LIMITS.displayName)
        && isInteger(item.merit) && item.merit > 0
        && (item.level === undefined || (isInteger(item.level) && item.level >= 1))
        && (item.avatarUrl === undefined || (typeof item.avatarUrl === 'string' && item.avatarUrl.length <= LIMITS.avatarUrl && AVATAR_URL.test(item.avatarUrl))))
      && (message.rank === undefined || (isInteger(message.rank) && message.rank >= 1));
  },
  // Vị trí đã gom của những người vừa di chuyển (mỗi 200 ms). m = đang đi.
  'room.moves'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'moves'])
      && Array.isArray(message.moves) && message.moves.length <= MOVES_PER_BATCH
      && message.moves.every((item) => isRecord(item) && exactKeys(item, ['id', 'x', 'z', 'ry', 'm'])
        && isString(item.id, LIMITS.participantId, ID_PATTERN) && isCoord(item.x) && isCoord(item.z) && isAngle(item.ry)
        && typeof item.m === 'boolean');
  },
  emote(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'participantId', 'kind', 'at'], ['sutra'])
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && EMOTES.includes(message.kind)
      && (message.sutra === undefined || (typeof message.sutra === 'string' && SUTRA_ID.test(message.sutra)))
      && isInteger(message.at) && message.at >= 0;
  },
  // Trạng thái bàn Bầu Cua (phát cả phòng khi đổi pha, và khi tổng cược đổi — tối đa ~3 lần/giây).
  'game.state'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'game', 'roundId', 'phase', 'endsAt', 'totals', 'bettors'], ['dice', 'winners', 'void'])
      && message.game === 'bau-cua'
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && GAME_PHASES.includes(message.phase)
      && isInteger(message.endsAt) && message.endsAt >= 0
      && animalAmounts(message.totals, true)
      && isInteger(message.bettors) && message.bettors >= 0
      && (message.dice === undefined || (Array.isArray(message.dice) && message.dice.length === 3 && message.dice.every((item) => BAU_CUA_ANIMALS.includes(item))))
      && (message.winners === undefined || (Array.isArray(message.winners) && message.winners.length <= 5 && message.winners.every((item) => isRecord(item)
        && exactKeys(item, ['displayName', 'net']) && isString(item.displayName, LIMITS.displayName) && isInteger(item.net) && item.net > 0)))
      && (message.void === undefined || message.void === true);
  },
  // Cược của chính mình trong ván (sau mỗi lần đặt được, và khi vào lại giữa ván); coins: số dư ví sau khi trừ.
  'game.mine'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roundId', 'mine'], ['coins', 'requestId'])
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && animalAmounts(message.mine, false)
      && (message.coins === undefined || (isInteger(message.coins) && message.coins >= 0))
      && (message.requestId === undefined || isString(message.requestId, LIMITS.requestId, ID_PATTERN));
  },
  // Kết quả của chính mình sau khi lắc (chỉ gửi người có cược trong ván).
  'game.payout'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roundId', 'staked', 'payout', 'net', 'coins'])
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && isInteger(message.staked) && message.staked > 0
      && isInteger(message.payout) && message.payout >= 0
      && isInteger(message.net) && message.net === message.payout - message.staked
      && isInteger(message.coins) && message.coins >= 0;
  },
  reaction(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'participantId', 'kind', 'at'])
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && REACTIONS.includes(message.kind)
      && isInteger(message.at) && message.at >= 0;
  },
  'prayer.received'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'participantId', 'kind', 'at'], ['displayName'])
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && (message.displayName === undefined || isString(message.displayName, LIMITS.displayName))
      && PRAYER_KINDS.includes(message.kind)
      && isInteger(message.at) && message.at >= 0;
  },
  // Trạng thái lời mời kết bạn, chỉ gửi cho hai người liên quan. saved: đã lưu vào tài khoản (cả hai đã đăng nhập).
  'friend.state'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'fromId', 'toId', 'status'], ['saved'])
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && isString(message.toId, LIMITS.participantId, ID_PATTERN)
      && FRIEND_STATUSES.includes(message.status)
      && (message.saved === undefined || typeof message.saved === 'boolean');
  },
  // Trạng thái trận khiêu chiến, chỉ gửi cho hai người chơi. Lựa chọn của lượt chỉ lộ ra ở `last` khi lượt đã xong;
  // `moved` cho biết ai đã ra tay ở lượt đang chơi. deadline: giờ server (ms) hết lượt / hết hạn lời mời.
  'challenge.state'(message) {
    const choice = (value) => value === null || RPS_CHOICES.includes(value);
    return exactKeys(message, ['v', 'type', 'epoch', 'challengeId', 'game', 'fromId', 'toId', 'status', 'round', 'fromScore', 'toScore', 'target'],
      ['deadline', 'moved', 'last', 'winner'])
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && GAMES.includes(message.game)
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && isString(message.toId, LIMITS.participantId, ID_PATTERN)
      && CHALLENGE_STATUSES.includes(message.status)
      && isInteger(message.round) && message.round >= 0 && message.round <= 50
      && isInteger(message.fromScore) && message.fromScore >= 0
      && isInteger(message.toScore) && message.toScore >= 0
      && isInteger(message.target) && message.target >= 1 && message.target <= 10
      && (message.deadline === undefined || (isInteger(message.deadline) && message.deadline >= 0))
      && (message.moved === undefined || (isRecord(message.moved) && exactKeys(message.moved, ['from', 'to'])
        && typeof message.moved.from === 'boolean' && typeof message.moved.to === 'boolean'))
      && (message.last === undefined || (isRecord(message.last) && exactKeys(message.last, ['from', 'to', 'winner'])
        && choice(message.last.from) && choice(message.last.to) && RESULT_SIDES.includes(message.last.winner)))
      && (message.winner === undefined || RESULT_SIDES.includes(message.winner));
  },
  // Luống vườn vừa đổi (gieo, tưới, ra quả, hái, trống lại). effect: hiệu ứng để mọi người cùng thấy.
  'garden.plot'(message) {
    const crop = (value) => value === null || (isRecord(value)
      && exactKeys(value, ['id', 'plantType', 'ownerName', 'stage', 'waterDays', 'waterNeeded', 'wateredToday', 'fruitsLeft', 'fruitsTotal', 'plantedAt'],
        ['canWater', 'wilted', 'lastWateredAt', 'nextWaterAt', 'wiltsAt'])
      && isInteger(value.id) && value.id > 0 && GARDEN_PLANTS.includes(value.plantType) && isString(value.ownerName, LIMITS.displayName)
      && GARDEN_STAGES.includes(value.stage) && isInteger(value.waterDays) && value.waterDays >= 0 && isInteger(value.waterNeeded)
      && typeof value.wateredToday === 'boolean' && isInteger(value.fruitsLeft) && value.fruitsLeft >= 0
      && isInteger(value.fruitsTotal) && value.fruitsTotal >= 0 && isInteger(value.plantedAt) && value.plantedAt >= 0
      && (value.canWater === undefined || typeof value.canWater === 'boolean')
      && (value.wilted === undefined || typeof value.wilted === 'boolean')
      && ['lastWateredAt', 'nextWaterAt', 'wiltsAt'].every((key) => value[key] === undefined || (isInteger(value[key]) && value[key] >= 0)));
    const plot = (value) => isRecord(value) && exactKeys(value, ['id', 'crop']) && isInteger(value.id) && value.id >= 1 && value.id <= 10 && crop(value.crop);
    return exactKeys(message, ['v', 'type', 'epoch', 'plots'], ['effect'])
      && Array.isArray(message.plots) && message.plots.length >= 1 && message.plots.length <= 10 && message.plots.every(plot)
      && (message.effect === undefined || (isRecord(message.effect) && exactKeys(message.effect, ['plotId', 'kind', 'by'])
        && isInteger(message.effect.plotId) && message.effect.plotId >= 1 && message.effect.plotId <= 10
        && GARDEN_EFFECTS.includes(message.effect.kind) && isString(message.effect.by, LIMITS.displayName)));
  },
  pong(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'sentAt', 'serverTime'])
      && isInteger(message.sentAt) && message.sentAt >= 0
      && isInteger(message.serverTime) && message.serverTime >= 0;
  },
  'protocol.error'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'code', 'message'], ['requestId'])
      && isString(message.code, 64, ID_PATTERN)
      && isString(message.message, 200)
      && (message.requestId === undefined || isString(message.requestId, LIMITS.requestId, ID_PATTERN));
  },
};

function resultError(code) {
  return { ok: false, error: code };
}

export function parseClientMessage(message, context = {}) {
  if (!base(message)) return resultError('INVALID_ENVELOPE');
  const schema = clientSchemas[message.type];
  if (!schema) return resultError('UNKNOWN_MESSAGE_TYPE');
  if (!schema(message)) return resultError('INVALID_MESSAGE');
  const role = context.role || 'guest';
  if (!ROLES.has(role)) return resultError('INVALID_ROLE');
  if (!CLIENT_MESSAGE_POLICY[message.type].roles.includes(role)) return resultError('FORBIDDEN');
  return { ok: true, value: message };
}

export function parseServerMessage(message) {
  if (!base(message)) return resultError('INVALID_ENVELOPE');
  const schema = serverSchemas[message.type];
  if (!schema) return resultError('UNKNOWN_MESSAGE_TYPE');
  if (!isInteger(message.epoch) || message.epoch < 0) return resultError('INVALID_EPOCH');
  if (!schema(message)) return resultError('INVALID_MESSAGE');
  return { ok: true, value: message };
}
