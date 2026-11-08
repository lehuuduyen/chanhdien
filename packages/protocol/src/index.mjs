export const PROTOCOL_VERSION = 3;

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
// chibigirl / swordsman: hình thưởng hoặc mua trong shop (máy realtime kiểm tra quyền sở hữu theo vé vào phòng).
// pilgrim / lotusgirl là hai hình khối dành cho bot, không nằm trong danh sách hình người dùng được chọn ở room rules.
export const SKINS = Object.freeze(['man', 'woman', 'granny', 'nun', 'monk', 'child', 'pilgrim', 'lotusgirl', 'chibigirl', 'swordsman']);
// Mỹ phẩm hồ sơ chỉ truyền id cố định; chữ hiển thị được dịch ở client.
export const PLAYER_TITLES = Object.freeze(['steadfast-practitioner']);
export const AVATAR_FRAMES = Object.freeze(['seven-day-lotus']);
// Linh thú đi theo chủ ngoài sân (khớp SPIRIT_PETS trong @chanh-dien/garden); cấp 1–10 quyết định trang trí.
export const SPIRIT_SPECIES = Object.freeze(['carp', 'turtle', 'crane', 'lion']);
export const SPIRIT_LEVEL_MAX = 10;
const spiritPet = (value) => isRecord(value) && exactKeys(value, ['species', 'level'])
  && SPIRIT_SPECIES.includes(value.species) && isInteger(value.level) && value.level >= 1 && value.level <= SPIRIT_LEVEL_MAX;
// Nhân vật admin tải lên (shop-<tên>); cùng mẫu với SHOP_SKIN trong @chanh-dien/room-rules.
export const SHOP_SKIN = /^shop-[a-z0-9-]{2,30}$/;
const validSkin = (skin) => SKINS.includes(skin) || (typeof skin === 'string' && SHOP_SKIN.test(skin));
export const OFFERING_KINDS = Object.freeze(['petal', 'incense', 'lotus', 'bell']);
// Động tác của nhân vật (chế độ nhập vai): đứng, quỳ, lạy 3 lạy, lạy 108 lạy.
// chant: tụng kinh (kèm mã bài kinh `sutra`), woodfish: gõ mõ.
// dance: nhún nhảy (đứng, chỉ ngoài sân chùa); nhân vật có điệu nhảy trong file .glb chạy điệu đó.
// act: ✨ tương tác, chạy ngẫu nhiên một động tác trong file nhân vật (chọn theo `at` của message emote).
export const EMOTES = Object.freeze(['stand', 'kneel', 'bow3', 'bow108', 'chant', 'woodfish', 'dance', 'act']);
const SUTRA_ID = /^[a-z0-9-]{1,32}$/;
// Sớ: cầu an (peace) hoặc cầu siêu (memorial). Cả phòng chỉ biết ai dâng sớ loại gì; tên người trong sớ không đi qua phòng.
export const PRAYER_KINDS = Object.freeze(['peace', 'memorial']);
// Toạ độ nhân vật tính bằng mét, làm tròn 1 cm; giới hạn rộng để dùng chung cho mọi cảnh.
// Trò chơi khiêu chiến giữa hai người trong phòng (server làm trọng tài). Hiện có kéo búa bao (rps).
export const GAMES = Object.freeze(['rps']);
export const RPS_CHOICES = Object.freeze(['rock', 'paper', 'scissors']);
export const CHALLENGE_STATUSES = Object.freeze(['pending', 'declined', 'cancelled', 'expired', 'playing', 'finished']);
export const FRIEND_STATUSES = Object.freeze(['pending', 'accepted', 'declined']);
// Nắm tay đi dạo: mời → chấp nhận / từ chối; đang nắm thì buông (tự buông, ngồi, đi nhanh, rời phòng, đi quá xa).
export const HAND_STATUSES = Object.freeze(['pending', 'accepted', 'declined', 'released']);
// Phòng game bot có thể mời người chơi sang (trang riêng phía client).
export const GAME_ROOMS = Object.freeze(['loto', 'tai-xiu', 'bau-cua']);
// Số tin chat trong ngày tối đa một phòng giữ để người vào sau xem lại (chat.history).
export const CHAT_HISTORY_MAX = 100;
// Báo cáo người chơi: lý do cố định, kèm ghi chú ngắn tùy chọn.
export const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'inappropriate', 'other']);
const RESULT_SIDES = ['from', 'to', 'draw'];
// Vườn Công Đức: 50 luống chung; server API quyết định mọi thay đổi, realtime chỉ phát lại.
export const GARDEN_PLOT_MAX = 50;
export const GARDEN_PLANTS = Object.freeze(['apple', 'orange', 'peach']);
export const GARDEN_STAGES = Object.freeze(['seed', 'sprout', 'young', 'fruiting']);
export const GARDEN_EFFECTS = Object.freeze(['plant', 'water', 'harvest']);
// Khu tưởng niệm: số ô mộ (khớp GRAVE_COUNT của @chanh-dien/garden) và độ dài tên trên bia.
export const MEMORIAL_GRAVE_MAX = 36;
export const MEMORIAL_NAME_MAX = 24;
// Công việc phối hợp trong chùa. `chore.state` chỉ chứa tiến độ và id người cùng làm; nội dung hiển thị nằm ở
// bản dịch phía client, không nhận văn bản tùy ý từ mạng.
export const CHORE_KINDS = Object.freeze(['sweep', 'water', 'light', 'feed', 'clean', 'tea']);
// Tương tác ngắn với chó mèo trong khu thú cưng. Đây là hiệu ứng phòng, không cộng xu/công đức và không lưu snapshot.
// trick: làm trò riêng từng loài (thỏ nhảy tưng, nai cúi chào, ngựa chồm lên…).
export const PET_ACTIONS = Object.freeze(['pet', 'feed', 'play', 'trick']);
// Các công trình dùng chung toàn hệ thống. Đóng góp đi qua REST có đăng nhập; realtime chỉ phát snapshot công khai.
export const COMMUNITY_PROJECT_STAGES = Object.freeze(['ground', 'sprout', 'young', 'mature', 'complete']);
export const COMMUNITY_PROJECT_KINDS = Object.freeze(['bodhi', 'lotus']);
// Đi nhanh chỉ nhận tên điểm cố định; client không bao giờ được tự gửi tọa độ dịch chuyển.
export const TRAVEL_DESTINATIONS = Object.freeze(['hall', 'courtyard', 'garden', 'pets', 'memorial', 'park', 'flowers', 'farm']);
// Thả cảm xúc (rạp phim): biểu tượng bay lên trên đầu nhân vật, không lưu vào trạng thái phòng.
export const REACTIONS = Object.freeze(['clap', 'laugh', 'heart', 'wow', 'cry', 'fire']);
// Bầu Cua chơi chung (phòng game): 6 linh vật, ba pha của một ván.
export const BAU_CUA_ANIMALS = Object.freeze(['nai', 'bau', 'ga', 'ca', 'cua', 'tom']);
export const GAME_PHASES = Object.freeze(['betting', 'rolling', 'result']);
// Tài Xỉu (chung khung với Bầu Cua): ô cược xiu/tai, tổng điểm t4…t17, mặt f1…f6; xúc xắc là số 1–6.
export const TAI_XIU_SPOTS = Object.freeze(['xiu', 'tai', ...Array.from({ length: 14 }, (_, index) => `t${index + 4}`), ...[1, 2, 3, 4, 5, 6].map((face) => `f${face}`)]);
export const DICE_GAMES = Object.freeze(['bau-cua', 'tai-xiu']);
const TAI_XIU_HISTORY = 10;
// Mã ván: "bc-…" Bầu Cua, "tx-…" Tài Xỉu, "lt-…" Lô Tô.
const ROUND_ID = /^(bc|tx|lt)-[a-z0-9-]{4,76}$/;
const LOTTO_ROUND_ID = /^lt-[a-z0-9-]{4,76}$/;
// Lô Tô: pha mua vé → gọi số → chờ kinh cùng nhịp (claiming) → kết quả. Tối đa 2 vé / người / ván.
export const LOTTO_PHASES = Object.freeze(['buying', 'calling', 'claiming', 'result']);
const LOTTO_MAX_TICKETS = 2;
const lottoNumber = (value) => isInteger(value) && value >= 1 && value <= 90;
// Vé: 3 hàng × 9 ô (0 = trống), mỗi hàng 5 số.
const lottoRows = (rows) => Array.isArray(rows) && rows.length === 3 && rows.every((row) => Array.isArray(row) && row.length === 9
  && row.every((value) => value === 0 || lottoNumber(value)) && row.filter(Boolean).length === 5);
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
  'chore.start': { roles: ['guest', 'member', 'moderator', 'host'], rate: '6/10 giây, phải ở gần điểm việc' },
  'chore.stop': { roles: ['guest', 'member', 'moderator', 'host'], rate: '6/10 giây' },
  'pet.interact': { roles: ['guest', 'member', 'moderator', 'host'], rate: '6/10 giây, chỉ trong chánh điện 3D' },
  move: { roles: ['guest', 'member', 'moderator', 'host'], rate: '8/giây, chỉ khi đang đi; server gom 200 ms rồi phát' },
  emote: { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'reaction.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '6/10 giây' },
  'bet.place': { roles: ['member', 'moderator', 'host'], rate: '10/5 giây, chỉ trong pha đặt cược, tối đa 1.000 xu mỗi ván' },
  'bet.cancel': { roles: ['member', 'moderator', 'host'], rate: '3/5 giây, chỉ trong pha đặt cược' },
  'lotto.buy': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây, chỉ trong pha mua vé, tối đa 2 vé mỗi ván' },
  'lotto.claim': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây; kinh sai khóa nút 10 giây' },
  'prayer.announce': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
  'friend.request': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
  'friend.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, mỗi người một trận một lúc' },
  'challenge.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.move': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây' },
  'challenge.cancel': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'player.block': { roles: ['guest', 'member', 'moderator', 'host'], rate: '20/60 giây' },
  'player.report': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
  'hand.request': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, hai người đang đứng cách nhau ≤ 6 m' },
  'hand.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'hand.release': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'bot.quiet': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
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
// Tiền theo ô cược của một trò (spots: linh vật Bầu Cua / ô Tài Xỉu); full = phải có đủ mọi ô.
const spotAmounts = (value, spots, full) => isRecord(value)
  && Object.keys(value).every((key) => spots.includes(key))
  && (!full || spots.every((key) => Object.hasOwn(value, key)))
  && Object.values(value).every((amount) => isInteger(amount) && amount >= 0);
const animalAmounts = (value, full) => spotAmounts(value, BAU_CUA_ANIMALS, full);
const dieFace = (value) => isInteger(value) && value >= 1 && value <= 6;

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
      && validSkin(message.skin);
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
  'chore.start'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'choreId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.choreId, LIMITS.itemId, ID_PATTERN);
  },
  'chore.stop'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'choreId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.choreId, LIMITS.itemId, ID_PATTERN);
  },
  'pet.interact'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'petId', 'action'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.petId, LIMITS.itemId, ID_PATTERN)
      && PET_ACTIONS.includes(message.action);
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
  // Bầu Cua gửi animal (linh vật), Tài Xỉu gửi spot (ô cược); đúng một trong hai.
  'bet.place'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'roundId', 'amount'], ['animal', 'spot'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && (message.animal === undefined) !== (message.spot === undefined)
      && (message.animal === undefined || BAU_CUA_ANIMALS.includes(message.animal))
      && (message.spot === undefined || TAI_XIU_SPOTS.includes(message.spot))
      && isInteger(message.amount) && message.amount >= 1 && message.amount <= MAX_STAKE;
  },
  // Hủy toàn bộ cược của mình trong ván (chỉ trong pha đặt cược); API hoàn xu.
  // Mua vé Lô Tô (count 0–2; autoMark = mua thêm tự đánh dấu cho ván này).
  'lotto.buy'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'roundId', 'count', 'autoMark'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.roundId === 'string' && LOTTO_ROUND_ID.test(message.roundId)
      && isInteger(message.count) && message.count >= 0 && message.count <= LOTTO_MAX_TICKETS
      && typeof message.autoMark === 'boolean' && (message.count > 0 || message.autoMark);
  },
  // Kinh: vé số ticket (1–2), hàng row (0–2). Server kiểm tra theo vé gốc, không theo chỗ người chơi đánh dấu.
  'lotto.claim'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'roundId', 'ticket', 'row'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.roundId === 'string' && LOTTO_ROUND_ID.test(message.roundId)
      && isInteger(message.ticket) && message.ticket >= 1 && message.ticket <= LOTTO_MAX_TICKETS
      && isInteger(message.row) && message.row >= 0 && message.row <= 2;
  },
  'bet.cancel'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'roundId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId);
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
  // Mời một người đang đứng gần nắm tay đi dạo; người nhận trả lời bằng hand.respond. Đang nắm thì hand.release để buông.
  'hand.request'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN);
  },
  'hand.respond'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'fromId', 'accept'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && typeof message.accept === 'boolean';
  },
  'hand.release'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  // Không muốn bot tự bắt chuyện / khiêu chiến / mời sang phòng game (quiet: true), hoặc bật lại.
  'bot.quiet'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'quiet'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && typeof message.quiet === 'boolean';
  },
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
  && exactKeys(value, ['id', 'displayName'], ['seatId', 'benchId', 'benchSpot', 'connected', 'skin', 'merit', 'bot', 'level', 'avatarUrl', 'title', 'frame', 'pet', 'pos', 'emote', 'sutra', 'handWith', 'handLead'])
  // Linh thú đang dẫn theo (chỉ hình, vị trí do client tự tính theo chủ).
  && (value.pet === undefined || spiritPet(value.pet))
  // Đang nắm tay người khác (handWith = id người kia); handLead: người dẫn đường, người kia đi theo.
  && (value.handWith === undefined || isString(value.handWith, LIMITS.participantId, ID_PATTERN))
  && (value.handLead === undefined || (value.handLead === true && value.handWith !== undefined))
  && (value.pos === undefined || position(value.pos))
  && (value.emote === undefined || EMOTES.includes(value.emote))
  && (value.sutra === undefined || (typeof value.sutra === 'string' && SUTRA_ID.test(value.sutra)))
  && (value.avatarUrl === undefined || (typeof value.avatarUrl === 'string' && value.avatarUrl.length <= LIMITS.avatarUrl && AVATAR_URL.test(value.avatarUrl)))
  && (value.title === undefined || PLAYER_TITLES.includes(value.title))
  && (value.frame === undefined || AVATAR_FRAMES.includes(value.frame))
  && (value.bot === undefined || value.bot === true)
  && (value.level === undefined || (isInteger(value.level) && value.level >= 1 && value.level <= 99))
  && (value.skin === undefined || validSkin(value.skin))
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
      && message.top.every((item) => isRecord(item) && exactKeys(item, ['id', 'displayName', 'merit'], ['level', 'avatarUrl', 'title', 'frame'])
        && isString(item.id, LIMITS.participantId, ID_PATTERN)
        && isString(item.displayName, LIMITS.displayName)
        && isInteger(item.merit) && item.merit > 0
        && (item.level === undefined || (isInteger(item.level) && item.level >= 1))
        && (item.avatarUrl === undefined || (typeof item.avatarUrl === 'string' && item.avatarUrl.length <= LIMITS.avatarUrl && AVATAR_URL.test(item.avatarUrl)))
        && (item.title === undefined || PLAYER_TITLES.includes(item.title))
        && (item.frame === undefined || AVATAR_FRAMES.includes(item.frame)))
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
  // Snapshot nhỏ của sáu công việc. Tất cả người đang làm cùng một việc dùng chung progress để hoạt ảnh phối hợp.
  'chore.state'(message) {
    const chore = (value) => isRecord(value)
      && exactKeys(value, ['id', 'kind', 'progress', 'workers'], ['completedAt'])
      && isString(value.id, LIMITS.itemId, ID_PATTERN)
      && CHORE_KINDS.includes(value.kind)
      && isInteger(value.progress) && value.progress >= 0 && value.progress <= 1_000
      && Array.isArray(value.workers) && value.workers.length <= 500
      && value.workers.every((id) => isString(id, LIMITS.participantId, ID_PATTERN))
      && (value.completedAt === undefined || (isInteger(value.completedAt) && value.completedAt >= 0));
    return exactKeys(message, ['v', 'type', 'epoch', 'chores'])
      && Array.isArray(message.chores) && message.chores.length <= CHORE_KINDS.length
      && message.chores.every(chore);
  },
  // Gửi riêng cho thành viên vừa hoàn thành việc. reward = 0 khi loại việc đó đã đủ giới hạn trong ngày.
  'chore.reward'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'choreId', 'kind', 'reward', 'coins', 'count', 'limit'])
      && isString(message.choreId, LIMITS.itemId, ID_PATTERN)
      && CHORE_KINDS.includes(message.kind)
      && (message.reward === 0 || message.reward === 20)
      && isInteger(message.coins) && message.coins >= 0
      && isInteger(message.limit) && message.limit === 3
      && isInteger(message.count) && message.count >= 0 && message.count <= message.limit;
  },
  'pet.interaction'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'participantId', 'petId', 'action', 'at'])
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && isString(message.petId, LIMITS.itemId, ID_PATTERN)
      && PET_ACTIONS.includes(message.action)
      && isInteger(message.at) && message.at >= 0;
  },
  emote(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'participantId', 'kind', 'at'], ['sutra'])
      && isString(message.participantId, LIMITS.participantId, ID_PATTERN)
      && EMOTES.includes(message.kind)
      && (message.sutra === undefined || (typeof message.sutra === 'string' && SUTRA_ID.test(message.sutra)))
      && isInteger(message.at) && message.at >= 0;
  },
  // Trạng thái bàn Bầu Cua (phát cả phòng khi đổi pha, và khi tổng cược đổi — tối đa ~3 lần/giây).
  // Tài Xỉu kèm history: tối đa 10 ván gần nhất (mới nhất trước), mỗi ván 3 xúc xắc.
  'game.state'(message) {
    const taiXiu = message.game === 'tai-xiu';
    const face = taiXiu ? dieFace : (item) => BAU_CUA_ANIMALS.includes(item);
    return exactKeys(message, ['v', 'type', 'epoch', 'game', 'roundId', 'phase', 'endsAt', 'totals', 'bettors'], ['dice', 'winners', 'void', 'history'])
      && DICE_GAMES.includes(message.game)
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && GAME_PHASES.includes(message.phase)
      && isInteger(message.endsAt) && message.endsAt >= 0
      && spotAmounts(message.totals, taiXiu ? TAI_XIU_SPOTS : BAU_CUA_ANIMALS, true)
      && isInteger(message.bettors) && message.bettors >= 0
      && (message.dice === undefined || (Array.isArray(message.dice) && message.dice.length === 3 && message.dice.every(face)))
      && (message.history === undefined || (taiXiu && Array.isArray(message.history) && message.history.length <= TAI_XIU_HISTORY
        && message.history.every((dice) => Array.isArray(dice) && dice.length === 3 && dice.every(dieFace))))
      && (message.winners === undefined || (Array.isArray(message.winners) && message.winners.length <= 5 && message.winners.every((item) => isRecord(item)
        && exactKeys(item, ['displayName', 'net']) && isString(item.displayName, LIMITS.displayName) && isInteger(item.net) && item.net > 0)))
      && (message.void === undefined || message.void === true);
  },
  // Cược của chính mình trong ván (sau mỗi lần đặt được, và khi vào lại giữa ván); coins: số dư ví sau khi trừ.
  'game.mine'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roundId', 'mine'], ['coins', 'requestId'])
      && typeof message.roundId === 'string' && ROUND_ID.test(message.roundId)
      && (animalAmounts(message.mine, false) || spotAmounts(message.mine, TAI_XIU_SPOTS, false))
      && (message.coins === undefined || (isInteger(message.coins) && message.coins >= 0))
      && (message.requestId === undefined || isString(message.requestId, LIMITS.requestId, ID_PATTERN));
  },
  // Kết quả của chính mình sau khi lắc (chỉ gửi người có cược trong ván).
  // Trạng thái bàn Lô Tô (cả phòng): số đã gọi theo thứ tự, quỹ, số vé đã bán, người đang đợi (thiếu 1 số), người kinh.
  'lotto.state'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roundId', 'phase', 'endsAt', 'called', 'pool', 'tickets', 'players'], ['nextCallAt', 'waiting', 'winners', 'void', 'claims'])
      && typeof message.roundId === 'string' && LOTTO_ROUND_ID.test(message.roundId)
      && LOTTO_PHASES.includes(message.phase)
      && isInteger(message.endsAt) && message.endsAt >= 0
      && Array.isArray(message.called) && message.called.length <= 90 && message.called.every(lottoNumber) && new Set(message.called).size === message.called.length
      && isInteger(message.pool) && message.pool >= 0
      && isInteger(message.tickets) && message.tickets >= 0
      && isInteger(message.players) && message.players >= 0
      && (message.nextCallAt === undefined || (isInteger(message.nextCallAt) && message.nextCallAt >= 0))
      && (message.waiting === undefined || (Array.isArray(message.waiting) && message.waiting.length <= 8 && message.waiting.every((item) => isRecord(item)
        && exactKeys(item, ['displayName', 'number']) && isString(item.displayName, LIMITS.displayName) && lottoNumber(item.number))))
      && (message.winners === undefined || (Array.isArray(message.winners) && message.winners.length <= 20 && message.winners.every((item) => isRecord(item)
        && exactKeys(item, ['displayName', 'share']) && isString(item.displayName, LIMITS.displayName) && isInteger(item.share) && item.share >= 0)))
      && (message.claims === undefined || (isInteger(message.claims) && message.claims >= 0))
      && (message.void === undefined || message.void === true);
  },
  // Vé của chính mình trong ván (sau khi mua, và khi vào lại giữa ván); coins: số dư ví sau khi trừ.
  'lotto.tickets'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'roundId', 'tickets', 'autoMark'], ['coins', 'requestId'])
      && typeof message.roundId === 'string' && LOTTO_ROUND_ID.test(message.roundId)
      && Array.isArray(message.tickets) && message.tickets.length <= LOTTO_MAX_TICKETS
      && message.tickets.every((ticket) => isRecord(ticket) && exactKeys(ticket, ['no', 'rows']) && isInteger(ticket.no) && ticket.no >= 1 && ticket.no <= LOTTO_MAX_TICKETS && lottoRows(ticket.rows))
      && typeof message.autoMark === 'boolean'
      && (message.coins === undefined || (isInteger(message.coins) && message.coins >= 0))
      && (message.requestId === undefined || isString(message.requestId, LIMITS.requestId, ID_PATTERN));
  },
  // Ví kim cương vừa đổi vì việc trong phòng (mở phim): chỉ gửi cho chủ ví để ô 💎 cập nhật ngay.
  'wallet.update'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'diamonds', 'spent'])
      && isInteger(message.diamonds) && message.diamonds >= 0
      && isInteger(message.spent) && message.spent > 0;
  },
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
  // Nắm tay, chỉ gửi cho hai người: fromId là người mời (người dẫn), toId người được mời (đi theo); byId: ai buông tay.
  'hand.state'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'fromId', 'toId', 'status'], ['byId'])
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && isString(message.toId, LIMITS.participantId, ID_PATTERN)
      && HAND_STATUSES.includes(message.status)
      && (message.byId === undefined || isString(message.byId, LIMITS.participantId, ID_PATTERN));
  },
  // Chat của phòng trong ngày hôm nay (cũ trước), gửi riêng cho người vừa vào để xem lại; sang ngày mới thì xóa.
  'chat.history'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'messages'])
      && Array.isArray(message.messages) && message.messages.length <= CHAT_HISTORY_MAX
      && message.messages.every((item) => isRecord(item) && exactKeys(item, ['participantId', 'text', 'sentAt'], ['displayName'])
        && isString(item.participantId, LIMITS.participantId, ID_PATTERN)
        && (item.displayName === undefined || isString(item.displayName, LIMITS.displayName))
        && isString(item.text, LIMITS.chatText)
        && isInteger(item.sentAt) && item.sentAt >= 0);
  },
  // Có lời nhắn / lời mời bạn bè mới (gửi tới mọi kết nối của tài khoản nhận); trang tự tải hộp thư qua API.
  'inbox.notify'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'kind'])
      && ['note', 'invite'].includes(message.kind);
  },
  // Bot mời một người sang phòng game, chỉ gửi cho người được mời (bot nói câu mời trong chat riêng).
  'game.invite'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'fromId', 'game'])
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && GAME_ROOMS.includes(message.game);
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
  // Luống vườn vừa đổi (gieo, tưới, ra quả, hái, trống lại). effect: hiệu ứng để mọi người cùng thấy. at: mốc thứ tự của
  // API (ms, tăng dần) để client bỏ qua tin tới trễ có trạng thái cũ hơn cái đang hiện.
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
    const plot = (value) => isRecord(value) && exactKeys(value, ['id', 'crop']) && isInteger(value.id) && value.id >= 1 && value.id <= GARDEN_PLOT_MAX && crop(value.crop);
    return exactKeys(message, ['v', 'type', 'epoch', 'plots'], ['effect', 'at'])
      && (message.at === undefined || (isInteger(message.at) && message.at >= 0))
      && Array.isArray(message.plots) && message.plots.length >= 1 && message.plots.length <= GARDEN_PLOT_MAX && message.plots.every(plot)
      && (message.effect === undefined || (isRecord(message.effect) && exactKeys(message.effect, ['plotId', 'kind', 'by'])
        && isInteger(message.effect.plotId) && message.effect.plotId >= 1 && message.effect.plotId <= GARDEN_PLOT_MAX
        && GARDEN_EFFECTS.includes(message.effect.kind) && isString(message.effect.by, LIMITS.displayName)));
  },
  // Ô mộ vừa đổi (đắp mới, quản trị gỡ). grave null = ô trống; mộ hết hạn thì client tự ẩn theo expiresAt.
  'memorial.grave'(message) {
    const grave = (value) => value === null || (isRecord(value) && exactKeys(value, ['name', 'builderName', 'builtAt', 'expiresAt'])
      && isString(value.name, MEMORIAL_NAME_MAX * 2) && value.name.length > 0 && isString(value.builderName, LIMITS.displayName)
      && isInteger(value.builtAt) && value.builtAt >= 0 && isInteger(value.expiresAt) && value.expiresAt > value.builtAt);
    const slot = (value) => isRecord(value) && exactKeys(value, ['slot', 'grave'])
      && isInteger(value.slot) && value.slot >= 1 && value.slot <= MEMORIAL_GRAVE_MAX && grave(value.grave);
    return exactKeys(message, ['v', 'type', 'epoch', 'graves'])
      && Array.isArray(message.graves) && message.graves.length >= 1 && message.graves.length <= MEMORIAL_GRAVE_MAX && message.graves.every(slot);
  },
  'community.project'(message) {
    const project = message.project;
    const expectedKind = project?.id === 'bodhi-global-1' ? 'bodhi'
      : project?.id === 'lotus-global-1' ? 'lotus' : null;
    return exactKeys(message, ['v', 'type', 'epoch', 'project'])
      && isRecord(project)
      && exactKeys(project, ['id', 'kind', 'stage', 'stageIndex', 'progress', 'target', 'percent', 'completed', 'contributors', 'contributions', 'updatedAt'])
      && expectedKind !== null
      && project.kind === expectedKind
      && COMMUNITY_PROJECT_STAGES.includes(project.stage)
      && isInteger(project.stageIndex) && project.stageIndex === COMMUNITY_PROJECT_STAGES.indexOf(project.stage)
      && isInteger(project.progress) && project.progress >= 0
      && isInteger(project.target) && project.target > 0 && project.progress <= project.target
      && isInteger(project.percent) && project.percent >= 0 && project.percent <= 100
      && typeof project.completed === 'boolean'
      && project.completed === (project.stage === 'complete')
      && isInteger(project.contributors) && project.contributors >= 0
      && isInteger(project.contributions) && project.contributions >= 0
      && isInteger(project.updatedAt) && project.updatedAt >= 0;
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
