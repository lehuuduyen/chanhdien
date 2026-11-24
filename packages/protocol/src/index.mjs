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
// Trò chơi khiêu chiến giữa hai người trong phòng (server làm trọng tài).
// Các trò câu hỏi giữ kín trọn bộ đáp án trên server tới khi đủ điều kiện chấm:
// compatibility: hai bên đoán lựa chọn của người được nêu; same-choice: hai bên chọn đồng thời;
// guess-you: người gửi lời mời trả lời trước, người nhận chỉ bắt đầu đoán sau đó.
export const QUESTION_GAMES = Object.freeze(['compatibility', 'same-choice', 'guess-you']);
// brain: Đấu trí 1–1 — hai bên cùng một đề 10 câu của khu Trí tuệ, lấy đề và nộp bài qua API (mã đề chỉ gửi riêng từng
// người trong challenge.state `duel`), báo đã nộp bằng challenge.check; ai đúng nhiều hơn thắng, bằng thì ai nhanh hơn.
// Thêm vào cuối danh sách là thay đổi cộng thêm (trang cũ không gửi), không tăng PROTOCOL_VERSION.
export const GAMES = Object.freeze(['rps', ...QUESTION_GAMES, 'brain']);
export const BRAIN_DUEL_ITEMS = 10;
const BRAIN_ROUND_ID = /^[0-9a-f]{32}$/;
export const RPS_CHOICES = Object.freeze(['rock', 'paper', 'scissors']);
export const COMPATIBILITY_BANK_SIZE = 600;
// v5: 500 câu id 101–600 là từng tình huống riêng và đã rà lại nghĩa; hai client khác phiên bản chỉ dùng 100 câu gốc.
export const COMPATIBILITY_BANK_VERSION = 5;
export const COMPATIBILITY_QUESTION_COUNT = 10;
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
// Thêm đích mới là thay đổi cộng thêm (client cũ không gửi), không tăng PROTOCOL_VERSION. 'overlook': Đài ngắm cảnh
// ngoài cổng chánh điện; 'grove': Rừng thiền ngoài cổng tây; 'myfarm': Phước Điền (nông trại riêng) ngoài cổng tây phía nam.
export const TRAVEL_DESTINATIONS = Object.freeze(['hall', 'courtyard', 'garden', 'pets', 'memorial', 'park', 'flowers', 'farm', 'overlook', 'grove', 'myfarm', 'library']);
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
// Oẳn Tù Tì cược (phòng oantuti, đấu 1–1): mức cược cố định (khớp RPS_STAKES của @chanh-dien/garden), mã bàn = mã
// trận "rp-…". Pha của một trận: waiting (bàn mình mở, chờ đối thủ) → ready (đếm ngược) → pick (5 giây chọn) → reveal
// (lật tay; hòa thì sang lượt mới) → done (kết quả, chờ đấu lại) | closed (bàn đóng / đối thủ rời).
export const RPS_STAKES = Object.freeze([10, 20, 50, 100, 200]);
// Trốn tìm: idle (chưa ai chờ) → lobby (chờ đủ người, đếm ngược) → hiding (đi trốn) → seeking (đi kiếm) → result.
export const HIDESEEK_PHASES = Object.freeze(['idle', 'lobby', 'hiding', 'seeking', 'result']);
export const HIDESEEK_ROLES = Object.freeze(['seeker', 'hider']);
const HIDESEEK_MAX = 60;
// Đố vui nhiều người trong phòng chánh điện (apps/realtime/quiz.mjs): bấm tham gia → đếm ngược → từng câu (question) →
// mở đáp án (reveal, ai sai bị loại) → … → kết quả (result). Đề là câu đố hình / đố số của khu Trí tuệ; đáp án chỉ có trong
// state ở pha reveal / result.
export const QUIZ_PHASES = Object.freeze(['idle', 'lobby', 'question', 'reveal', 'result']);
export const QUIZ_KINDS = Object.freeze(['matrix', 'rotation', 'series', 'numgrid']);
const QUIZ_MAX = 40;
const QUIZ_QUESTIONS_MAX = 20;
// Một câu đố (khu Trí tuệ, không có đáp án): matrix 8 ô + 6 phương án; rotation hình ô vuông + 4 hình; series 5 số + 4 số;
// numgrid 8 số + 4 số.
function brainProblem(item) {
  if (!isRecord(item) || !QUIZ_KINDS.includes(item.kind) || !isInteger(item.level) || item.level < 1 || item.level > 5) return false;
  const int = (value, min, max) => isInteger(value) && value >= min && value <= max;
  const numbers = (list, length) => Array.isArray(list) && list.length === length && list.every((value) => int(value, 0, 10_000_000));
  const cell = (value) => isRecord(value) && exactKeys(value, ['s', 'c', 'n', 'z', 'f'])
    && int(value.s, 0, 3) && int(value.c, 0, 3) && int(value.n, 1, 3) && int(value.z, 0, 2) && int(value.f, 0, 1);
  const shape = (value) => Array.isArray(value) && value.length >= 1 && value.length <= 9
    && value.every((point) => Array.isArray(point) && point.length === 2 && int(point[0], 0, 8) && int(point[1], 0, 8));
  if (item.kind === 'matrix') {
    return exactKeys(item, ['kind', 'level', 'cells', 'options'])
      && Array.isArray(item.cells) && item.cells.length === 8 && item.cells.every(cell)
      && Array.isArray(item.options) && item.options.length === 6 && item.options.every(cell);
  }
  if (item.kind === 'rotation') {
    return exactKeys(item, ['kind', 'level', 'shape', 'options']) && shape(item.shape)
      && Array.isArray(item.options) && item.options.length === 4 && item.options.every(shape);
  }
  if (item.kind === 'series') return exactKeys(item, ['kind', 'level', 'terms', 'options']) && numbers(item.terms, 5) && numbers(item.options, 4);
  return exactKeys(item, ['kind', 'level', 'cells', 'options']) && numbers(item.cells, 8) && numbers(item.options, 4);
}
export const RPS_PHASES = Object.freeze(['waiting', 'ready', 'pick', 'reveal', 'done', 'closed']);
export const RPS_RESULTS = Object.freeze(['win', 'lose', 'draw', 'void']);
const RPS_MATCH_ID = /^rp-[a-z0-9-]{4,76}$/;
const RPS_LOBBY_TABLES = 20;
const RPS_FEED = 10;
const rpsMatchId = (value) => typeof value === 'string' && RPS_MATCH_ID.test(value);
// Tiến lên (phòng tienlen, bàn 2–4 người): khớp TIENLEN_STAKES / TIENLEN_MODES / INSTANT_WINS của @chanh-dien/tien-len
// (test protocol so hai bên). Lá bài là số 0–51 (hạng = lá >> 2, 3 → 2; chất = lá & 3, ♠ ♣ ♦ ♥). Mã bàn "tl-…".
// Pha của bàn: waiting (chờ người) → starting (đếm ngược chia bài) → playing → result (kết quả ván, rồi ván mới) |
// closed (mình đã rời / bàn giải tán).
export const TIENLEN_STAKES = Object.freeze([20, 50, 100, 200, 500, 1_000, 2_000]);
export const TIENLEN_MODES = Object.freeze(['rank', 'count']);
export const TIENLEN_PHASES = Object.freeze(['waiting', 'starting', 'playing', 'result', 'closed']);
export const TIENLEN_INSTANT_WINS = Object.freeze(['four-twos', 'dragon', 'six-pairs', 'five-pairs']);
export const TIENLEN_REASONS = Object.freeze(['chop', 'last', 'third', 'cong', 'cards', 'leftover', 'white']);
const TIENLEN_TABLE_ID = /^tl-[a-z0-9-]{4,76}$/;
const TIENLEN_SEATS = 4;
const TIENLEN_LOBBY_TABLES = 30;
const tienLenTableId = (value) => typeof value === 'string' && TIENLEN_TABLE_ID.test(value);
const tienLenSeat = (value) => isInteger(value) && value >= 0 && value < TIENLEN_SEATS;
const tienLenCards = (value, min = 1) => Array.isArray(value) && value.length >= min && value.length <= 13
  && value.every((card) => isInteger(card) && card >= 0 && card <= 51) && new Set(value).size === value.length;
// Đua xe (phòng duaxe, @chanh-dien/race): idle (chưa ai chờ đua) → lobby (đếm ngược, bot vào lấp chỗ) → grid (xếp lưới,
// 5 đèn đỏ sáng dần, tắt lúc startAt) → racing → result (bảng kết quả) → lobby / idle. Ngoài lúc đua, ai cũng chạy thử
// được (practice). Mỗi người: none (đứng xem) | queued (chờ cuộc đua tới) | practice | race. Màu xe là số 0–7. Trạng thái
// xe do máy người lái tự tính rồi gửi race.car (≤ 20 lần/giây, r = vừa đặt lại xe giữa đường); máy realtime gom 50 ms
// thành race.cars (mỗi xe kèm t = giờ server nhận gói, để máy xem nội suy). Không có xu; không mang cờ bot.
export const RACE_PHASES = Object.freeze(['idle', 'lobby', 'grid', 'racing', 'result']);
export const RACE_MODES = Object.freeze(['none', 'queued', 'practice', 'race']);
export const RACE_COLORS = 8;
export const RACE_MAX_CARS = 16;
const RACE_ID = /^rc-[a-z0-9-]{4,76}$/;
const raceColor = (value) => isInteger(value) && value >= 0 && value < RACE_COLORS;
const raceMs = (value) => isInteger(value) && value >= 0 && value <= 3_600_000;
// Tốc độ xe (m/s, âm = lùi). Trường tên speed vì `v` là phiên bản protocol.
const raceSpeed = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 200;
const raceSpot = (value) => isRecord(value) && exactKeys(value, ['x', 'z', 'h']) && isCoord(value.x) && isCoord(value.z) && isAngle(value.h);
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
  'queue.remove': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, chỉ video mình mở còn trong hàng chờ' },
  'vote.skip': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, chỉ người thật; bot không được gửi' },
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
  'hideseek.join': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'hideseek.leave': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'hideseek.catch': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây, chỉ người đi kiếm trong pha đi kiếm' },
  'quiz.join': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'quiz.leave': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'quiz.answer': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây, một lần mỗi câu, chỉ người còn trong cuộc' },
  'rps.open': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây, mỗi người một bàn / trận một lúc' },
  'rps.find': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'rps.join': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'rps.leave': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'rps.pick': { roles: ['member', 'moderator', 'host'], rate: '10/10 giây, chỉ trong pha chọn, một lần mỗi lượt' },
  'rps.rematch': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'tienlen.find': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây, mỗi người một bàn một lúc' },
  'tienlen.open': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây, mỗi người một bàn một lúc' },
  'tienlen.join': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'tienlen.leave': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'tienlen.play': { roles: ['member', 'moderator', 'host'], rate: '30/10 giây (chung với pass), đúng lượt (4 đôi thông chặt ngoài lượt)' },
  'tienlen.pass': { roles: ['member', 'moderator', 'host'], rate: '30/10 giây (chung với play), đúng lượt' },
  'tienlen.back': { roles: ['member', 'moderator', 'host'], rate: '5/10 giây' },
  'race.join': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây, xếp chờ cuộc đua tới' },
  'race.practice': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây, chỉ ngoài lúc xếp lưới / đang đua' },
  'race.leave': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/10 giây' },
  'race.car': { roles: ['guest', 'member', 'moderator', 'host'], rate: '20/giây khi đang lái; server gom 50 ms rồi phát' },
  'prayer.announce': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
  'friend.request': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
  'friend.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.send': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, mỗi người một trận một lúc' },
  'challenge.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.move': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/10 giây' },
  'challenge.answer': { roles: ['guest', 'member', 'moderator', 'host'], rate: '2/60 giây, nộp đúng một bộ 10 đáp án mỗi trận' },
  'challenge.cancel': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'challenge.check': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây, Đấu trí: đã nộp bài qua API' },
  'player.block': { roles: ['guest', 'member', 'moderator', 'host'], rate: '20/60 giây' },
  'player.report': { roles: ['guest', 'member', 'moderator', 'host'], rate: '3/10 phút' },
  'hand.request': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây, hai người đang đứng cách nhau ≤ 6 m' },
  'hand.respond': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'hand.release': { roles: ['guest', 'member', 'moderator', 'host'], rate: '10/60 giây' },
  'bot.quiet': { roles: ['guest', 'member', 'moderator', 'host'], rate: '5/60 giây' },
});

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;
const COMPATIBILITY_QUESTION_ID = /^cq-(?:00[1-9]|0[1-9][0-9]|[1-5][0-9]{2}|600)$/;
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
  // Hủy video mình đã mở khi còn trong hàng chờ (chưa chiếu); đã trả tiền thì API hoàn đúng loại tiền.
  'queue.remove'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'itemId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.itemId, LIMITS.itemId, ID_PATTERN);
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
  // Oẳn Tù Tì cược: mở bàn với mức cược (trừ cọc ngay), tìm trận nhanh (vào bàn đang chờ cùng mức, không có thì mở
  // bàn), nhận một bàn đang chờ, rời bàn / thôi chờ / thôi đấu lại (hoàn cọc nếu chưa đấu), ra tay, đấu lại.
  // Trốn tìm (phòng chánh điện): xin vào ván kế tiếp, rời (đang chơi thì bỏ cuộc), người đi kiếm bắt một người trốn.
  'hideseek.join'(message) {
    return exactKeys(message, ['v', 'type', 'requestId']) && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'hideseek.leave'(message) {
    return exactKeys(message, ['v', 'type', 'requestId']) && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'hideseek.catch'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'targetId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.targetId, LIMITS.participantId, ID_PATTERN);
  },
  // Đố vui (phòng chánh điện): xin vào ván kế tiếp, rời (đang chơi thì coi như bị loại), trả lời câu `index`.
  'quiz.join'(message) {
    return exactKeys(message, ['v', 'type', 'requestId']) && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'quiz.leave'(message) {
    return exactKeys(message, ['v', 'type', 'requestId']) && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'race.join'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'], ['color'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && (message.color === undefined || raceColor(message.color));
  },
  'race.practice'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'], ['color'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && (message.color === undefined || raceColor(message.color));
  },
  'race.leave'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'race.car'(message) {
    return exactKeys(message, ['v', 'type', 'x', 'z', 'h', 'speed'], ['r'])
      && isCoord(message.x) && isCoord(message.z) && isAngle(message.h) && raceSpeed(message.speed)
      && (message.r === undefined || message.r === true);
  },
  'quiz.answer'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'index', 'choice'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isInteger(message.index) && message.index >= 0 && message.index < QUIZ_QUESTIONS_MAX
      && isInteger(message.choice) && message.choice >= 0 && message.choice <= 5;
  },
  'rps.open'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'stake'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && RPS_STAKES.includes(message.stake);
  },
  'rps.find'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'stake'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && RPS_STAKES.includes(message.stake);
  },
  'rps.join'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'tableId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && rpsMatchId(message.tableId);
  },
  'rps.leave'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'rps.pick'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'matchId', 'choice'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && rpsMatchId(message.matchId)
      && RPS_CHOICES.includes(message.choice);
  },
  'rps.rematch'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'matchId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && rpsMatchId(message.matchId);
  },
  // Tiến lên: vào nhanh (lọc theo mức cược / kiểu nếu có), mở bàn, ngồi vào bàn, rời bàn (đang chơi thì rời sau ván),
  // đánh bài, bỏ lượt.
  'tienlen.find'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'], ['stake', 'mode'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && (message.stake === undefined || TIENLEN_STAKES.includes(message.stake))
      && (message.mode === undefined || TIENLEN_MODES.includes(message.mode));
  },
  // bots là trường cũ, chỉ còn nhận để client đang mở không bị rớt khi deploy; server luôn tự ghép bot và bỏ qua giá trị.
  'tienlen.open'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'stake', 'mode'], ['bots'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && TIENLEN_STAKES.includes(message.stake)
      && TIENLEN_MODES.includes(message.mode)
      && (message.bots === undefined || typeof message.bots === 'boolean');
  },
  'tienlen.join'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'tableId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && tienLenTableId(message.tableId);
  },
  'tienlen.leave'(message) {
    return exactKeys(message, ['v', 'type', 'requestId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN);
  },
  'tienlen.play'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'tableId', 'cards'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && tienLenTableId(message.tableId)
      && tienLenCards(message.cards);
  },
  'tienlen.pass'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'tableId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && tienLenTableId(message.tableId);
  },
  // "Tôi đã quay lại": thôi để hệ thống đánh hộ.
  'tienlen.back'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'tableId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && tienLenTableId(message.tableId);
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
  // Nộp trọn bộ một lần để không phát từng đáp án qua mạng. Server còn kiểm tra 10 id này đúng bộ câu của trận.
  'challenge.answer'(message) {
    const validAnswer = (answer) => isRecord(answer) && exactKeys(answer, ['questionId', 'choice'])
      && typeof answer.questionId === 'string' && COMPATIBILITY_QUESTION_ID.test(answer.questionId)
      && isInteger(answer.choice) && (answer.choice === 0 || answer.choice === 1);
    return exactKeys(message, ['v', 'type', 'requestId', 'challengeId', 'answers'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && Array.isArray(message.answers) && message.answers.length === COMPATIBILITY_QUESTION_COUNT
      && message.answers.every(validAnswer)
      && new Set(message.answers.map((answer) => answer.questionId)).size === COMPATIBILITY_QUESTION_COUNT;
  },
  'challenge.cancel'(message) {
    return exactKeys(message, ['v', 'type', 'requestId', 'challengeId'])
      && isString(message.requestId, LIMITS.requestId, ID_PATTERN)
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN);
  },
  // Đấu trí: đã nộp bài lên API; server hỏi API kết quả (không tin số liệu trang gửi).
  'challenge.check'(message) {
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

// Mở phim trả bằng xu (coins) hoặc kim cương (diamonds), admin chọn ở API.
export const VIDEO_CURRENCIES = Object.freeze(['coins', 'diamonds']);
const paidInfo = (value) => isRecord(value) && exactKeys(value, ['currency', 'amount'])
  && VIDEO_CURRENCIES.includes(value.currency) && isInteger(value.amount) && value.amount > 0;
// paid: video này đã trả bao nhiêu (người mở hủy khi còn chờ thì được hoàn đúng số đó). Không mang id người mở.
const queueItem = (value) => isRecord(value)
  && exactKeys(value, ['itemId', 'videoId', 'title', 'addedBy'], ['paid'])
  && isString(value.itemId, LIMITS.itemId, ID_PATTERN)
  && typeof value.videoId === 'string' && VIDEO_ID.test(value.videoId)
  && typeof value.title === 'string' && value.title.length <= LIMITS.videoTitle
  && isString(value.addedBy, LIMITS.displayName)
  && (value.paid === undefined || paidInfo(value.paid));

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
  // Trốn tìm (cả phòng): pha, giờ hết pha (giờ server), người chờ ván sau, người trong ván (vai, đã bị bắt chưa), bên
  // thắng, lần bắt gần nhất. Không mang vị trí: vị trí đi qua room.state / room.moves và server lọc theo vai.
  'hideseek.state'(message) {
    const person = (value) => isRecord(value) && exactKeys(value, ['id', 'displayName'])
      && isString(value.id, LIMITS.participantId, ID_PATTERN) && isString(value.displayName, LIMITS.displayName);
    const player = (value) => isRecord(value) && exactKeys(value, ['id', 'displayName', 'role', 'caught'])
      && isString(value.id, LIMITS.participantId, ID_PATTERN) && isString(value.displayName, LIMITS.displayName)
      && HIDESEEK_ROLES.includes(value.role) && typeof value.caught === 'boolean';
    return exactKeys(message, ['v', 'type', 'epoch', 'phase', 'round', 'lobby', 'players', 'minPlayers'], ['endsAt', 'winner', 'lastCatch'])
      && HIDESEEK_PHASES.includes(message.phase)
      && isInteger(message.round) && message.round >= 0
      && Array.isArray(message.lobby) && message.lobby.length <= HIDESEEK_MAX && message.lobby.every(person)
      && Array.isArray(message.players) && message.players.length <= HIDESEEK_MAX && message.players.every(player)
      && isInteger(message.minPlayers) && message.minPlayers >= 2
      && (message.endsAt === undefined || (isInteger(message.endsAt) && message.endsAt >= 0))
      && (message.winner === undefined || ['seekers', 'hiders', 'none'].includes(message.winner))
      && (message.lastCatch === undefined || (isRecord(message.lastCatch) && exactKeys(message.lastCatch, ['seekerId', 'hiderId', 'at'])
        && isString(message.lastCatch.seekerId, LIMITS.participantId, ID_PATTERN) && isString(message.lastCatch.hiderId, LIMITS.participantId, ID_PATTERN)
        && isInteger(message.lastCatch.at)));
  },
  // Đố vui (cả phòng): pha, người chờ ván sau, người trong ván (còn trong cuộc, đã trả lời câu này chưa — không mang lựa
  // chọn), câu đang hỏi (đề không có đáp án). Pha reveal mới có `answer` + `eliminated` (+ `allWrong`: cả nhà cùng sai, không
  // ai bị loại); pha result có `winners`.
  'quiz.state'(message) {
    const id = (value) => isString(value, LIMITS.participantId, ID_PATTERN);
    const person = (value) => isRecord(value) && exactKeys(value, ['id', 'displayName']) && id(value.id) && isString(value.displayName, LIMITS.displayName);
    const player = (value) => isRecord(value) && exactKeys(value, ['id', 'displayName', 'alive', 'answered'])
      && id(value.id) && isString(value.displayName, LIMITS.displayName) && typeof value.alive === 'boolean' && typeof value.answered === 'boolean';
    const ids = (value) => Array.isArray(value) && value.length <= QUIZ_MAX && value.every(id);
    const asking = ['question', 'reveal'].includes(message.phase);
    return exactKeys(message, ['v', 'type', 'epoch', 'phase', 'round', 'lobby', 'players', 'minPlayers'],
      ['endsAt', 'index', 'total', 'question', 'answer', 'eliminated', 'allWrong', 'winners'])
      && QUIZ_PHASES.includes(message.phase)
      && isInteger(message.round) && message.round >= 0
      && Array.isArray(message.lobby) && message.lobby.length <= QUIZ_MAX && message.lobby.every(person)
      && Array.isArray(message.players) && message.players.length <= QUIZ_MAX && message.players.every(player)
      && isInteger(message.minPlayers) && message.minPlayers >= 2
      && (message.endsAt === undefined || (isInteger(message.endsAt) && message.endsAt >= 0))
      && (asking
        ? isInteger(message.index) && message.index >= 0 && message.index < QUIZ_QUESTIONS_MAX
          && isInteger(message.total) && message.total >= 1 && message.total <= QUIZ_QUESTIONS_MAX && message.index < message.total
          && brainProblem(message.question)
        : message.index === undefined && message.question === undefined)
      && (message.phase === 'reveal'
        ? isInteger(message.answer) && message.answer >= 0 && message.answer <= 5 && ids(message.eliminated) && typeof message.allWrong === 'boolean'
        : message.answer === undefined && message.eliminated === undefined && message.allWrong === undefined)
      && (message.phase === 'result' ? ids(message.winners) : message.winners === undefined);
  },
  // Thưởng thắng trốn tìm (chỉ gửi người thắng có tài khoản): reward 0 khi đã đủ lần trong ngày.
  'hideseek.reward'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'reward', 'coins', 'count', 'limit'])
      && isInteger(message.reward) && message.reward >= 0 && message.reward <= 1_000
      && isInteger(message.coins) && message.coins >= 0
      && isInteger(message.limit) && message.limit >= 1 && message.limit <= 100
      && isInteger(message.count) && message.count >= 0 && message.count <= message.limit;
  },
  // Sảnh Oẳn Tù Tì (cả phòng): bàn đang chờ đối thủ, số trận đang đấu, vài trận vừa xong (a / b là tên hai bên).
  'rps.lobby'(message) {
    const table = (item) => isRecord(item) && exactKeys(item, ['id', 'displayName', 'stake'], ['skin'])
      && rpsMatchId(item.id) && isString(item.displayName, LIMITS.displayName) && RPS_STAKES.includes(item.stake)
      && (item.skin === undefined || validSkin(item.skin));
    const result = (item) => isRecord(item) && exactKeys(item, ['a', 'b', 'stake', 'winner'])
      && isString(item.a, LIMITS.displayName) && isString(item.b, LIMITS.displayName) && RPS_STAKES.includes(item.stake)
      && ['a', 'b', 'draw'].includes(item.winner);
    return exactKeys(message, ['v', 'type', 'epoch', 'tables', 'playing', 'feed'])
      && Array.isArray(message.tables) && message.tables.length <= RPS_LOBBY_TABLES && message.tables.every(table)
      && isInteger(message.playing) && message.playing >= 0
      && Array.isArray(message.feed) && message.feed.length <= RPS_FEED && message.feed.every(result);
  },
  // Trận của chính mình (chỉ gửi hai người trong trận, mỗi người một góc nhìn me / opponent). Tay đối thủ chỉ lộ ra ở
  // `last` sau khi lượt đã lật; `picked` chỉ cho biết đã chọn hay chưa. deadline: giờ server (ms) hết pha hiện tại.
  'rps.match'(message) {
    const choice = (value) => value === null || RPS_CHOICES.includes(value);
    const opponent = (value) => isRecord(value) && exactKeys(value, ['displayName'], ['skin', 'level'])
      && isString(value.displayName, LIMITS.displayName)
      && (value.skin === undefined || validSkin(value.skin))
      && (value.level === undefined || (isInteger(value.level) && value.level >= 1 && value.level <= 99));
    const pair = (value) => isRecord(value) && exactKeys(value, ['me', 'opponent']) && typeof value.me === 'boolean' && typeof value.opponent === 'boolean';
    return exactKeys(message, ['v', 'type', 'epoch', 'matchId', 'stake', 'phase', 'round'],
      ['opponent', 'deadline', 'picked', 'mine', 'last', 'result', 'net', 'coins', 'rematch', 'prize'])
      && rpsMatchId(message.matchId)
      && RPS_STAKES.includes(message.stake)
      && RPS_PHASES.includes(message.phase)
      && isInteger(message.round) && message.round >= 0 && message.round <= 10
      && (message.opponent === undefined || opponent(message.opponent))
      && (message.deadline === undefined || (isInteger(message.deadline) && message.deadline >= 0))
      && (message.picked === undefined || pair(message.picked))
      && (message.mine === undefined || RPS_CHOICES.includes(message.mine))
      && (message.last === undefined || (isRecord(message.last) && exactKeys(message.last, ['mine', 'opponent', 'result'])
        && choice(message.last.mine) && choice(message.last.opponent) && ['win', 'lose', 'draw'].includes(message.last.result)))
      && (message.result === undefined || RPS_RESULTS.includes(message.result))
      && (message.net === undefined || isInteger(message.net))
      && (message.coins === undefined || (isInteger(message.coins) && message.coins >= 0))
      && (message.prize === undefined || (isInteger(message.prize) && message.prize > 0))
      && (message.rematch === undefined || pair(message.rematch));
  },
  // Sảnh Tiến lên (cả phòng): các bàn (đang chờ / đang chơi), người ngồi từng bàn, số bàn đang chơi.
  'tienlen.lobby'(message) {
    const player = (item) => isRecord(item) && exactKeys(item, ['displayName'], ['skin'])
      && isString(item.displayName, LIMITS.displayName) && (item.skin === undefined || validSkin(item.skin));
    const table = (item) => isRecord(item) && exactKeys(item, ['id', 'stake', 'mode', 'phase', 'players'], ['bots'])
      && (item.bots === undefined || typeof item.bots === 'boolean')
      && tienLenTableId(item.id) && TIENLEN_STAKES.includes(item.stake) && TIENLEN_MODES.includes(item.mode)
      && ['waiting', 'starting', 'playing', 'result'].includes(item.phase)
      && Array.isArray(item.players) && item.players.length <= TIENLEN_SEATS && item.players.every(player);
    return exactKeys(message, ['v', 'type', 'epoch', 'tables', 'playing'])
      && Array.isArray(message.tables) && message.tables.length <= TIENLEN_LOBBY_TABLES && message.tables.every(table)
      && isInteger(message.playing) && message.playing >= 0;
  },
  // Bàn của chính mình (chỉ gửi người ngồi bàn; bài trên tay `hand` chỉ là của mình, người khác chỉ thấy số lá).
  // players: đúng 4 chỗ theo số ghế (null = ghế trống); seat: ghế của mình. turn / deadline: ai đang tới lượt, giờ server
  // (ms) hết lượt / hết đếm ngược. top: bộ đang nằm trên bàn. lead: mình đang mở vòng; mustInclude: lá phải đánh kèm.
  // last: nước vừa đi (chop kèm số phần người bị chặt phải trả). result: kết quả ván (ranks / nets theo ghế; lines là các
  // khoản đã tính ra xu; net / cut: xu của mình thực cộng / trừ sau phế; before / after: số dư của mình trước / sau ván;
  // hands: bài còn lại của từng ghế, chỉ lật khi ván đã xong — tới trắng thì đủ 13 lá của người thắng; spade: người nhất
  // tới 3 bích, tiền về trong lines đã nhân đôi).
  // minCoins: số xu tối thiểu để ngồi bàn này. bots: bàn có cho bot vào. players[].missed: số lượt liên tiếp hệ thống đánh
  // hộ (≥ 2 là đang tự đánh); away: mất kết nối. last.auto: nước vừa rồi do hệ thống đánh hộ.
  'tienlen.table'(message) {
    const player = (item) => item === null || (isRecord(item)
      && exactKeys(item, ['displayName', 'cards'], ['skin', 'level', 'passed', 'rank', 'cong', 'away', 'leaving', 'missed'])
      && (item.missed === undefined || (isInteger(item.missed) && item.missed >= 1 && item.missed <= 99))
      && isString(item.displayName, LIMITS.displayName)
      && isInteger(item.cards) && item.cards >= 0 && item.cards <= 13
      && (item.skin === undefined || validSkin(item.skin))
      && (item.level === undefined || (isInteger(item.level) && item.level >= 1 && item.level <= 99))
      && ['passed', 'cong', 'away', 'leaving'].every((key) => item[key] === undefined || typeof item[key] === 'boolean')
      && (item.rank === undefined || (isInteger(item.rank) && item.rank >= 1 && item.rank <= TIENLEN_SEATS)));
    const seatList = (value, valid) => Array.isArray(value) && value.length === TIENLEN_SEATS && value.every((item) => item === null || valid(item));
    const line = (item) => isRecord(item) && exactKeys(item, ['from', 'to', 'units', 'coins', 'reason'])
      && tienLenSeat(item.from) && tienLenSeat(item.to) && item.from !== item.to
      && isInteger(item.units) && item.units >= 0 && isInteger(item.coins) && item.coins >= 0 && TIENLEN_REASONS.includes(item.reason);
    const result = (value) => isRecord(value) && exactKeys(value, ['ranks', 'nets', 'lines'], ['white', 'spade', 'net', 'cut', 'before', 'after', 'hands'])
      && (value.spade === undefined || value.spade === true)
      && (value.hands === undefined || seatList(value.hands, (cards) => tienLenCards(cards, 0)))
      && ['before', 'after'].every((key) => value[key] === undefined || (isInteger(value[key]) && value[key] >= 0))
      && seatList(value.ranks, (rank) => isInteger(rank) && rank >= 1 && rank <= TIENLEN_SEATS)
      && seatList(value.nets, isInteger)
      && Array.isArray(value.lines) && value.lines.length <= 48 && value.lines.every(line)
      && (value.white === undefined || TIENLEN_INSTANT_WINS.includes(value.white))
      && (value.net === undefined || isInteger(value.net))
      && (value.cut === undefined || (isInteger(value.cut) && value.cut >= 0));
    const last = (value) => isRecord(value) && exactKeys(value, ['seat', 'action'], ['cards', 'units', 'victim', 'auto'])
      && (value.auto === undefined || value.auto === true)
      && tienLenSeat(value.seat) && ['play', 'pass', 'chop'].includes(value.action)
      && (value.cards === undefined || tienLenCards(value.cards))
      && (value.units === undefined || (isInteger(value.units) && value.units >= 0))
      && (value.victim === undefined || tienLenSeat(value.victim));
    return exactKeys(message, ['v', 'type', 'epoch', 'tableId', 'stake', 'mode', 'phase', 'game', 'seat', 'players', 'minCoins'],
      ['deadline', 'turn', 'top', 'lead', 'mustInclude', 'hand', 'last', 'result', 'coins', 'bots'])
      && (message.bots === undefined || typeof message.bots === 'boolean')
      && tienLenTableId(message.tableId)
      && TIENLEN_STAKES.includes(message.stake)
      && TIENLEN_MODES.includes(message.mode)
      && TIENLEN_PHASES.includes(message.phase)
      && isInteger(message.game) && message.game >= 0
      && tienLenSeat(message.seat)
      && Array.isArray(message.players) && message.players.length === TIENLEN_SEATS && message.players.every(player)
      && isInteger(message.minCoins) && message.minCoins > 0
      && (message.deadline === undefined || (isInteger(message.deadline) && message.deadline >= 0))
      && (message.turn === undefined || tienLenSeat(message.turn))
      && (message.top === undefined || (isRecord(message.top) && exactKeys(message.top, ['seat', 'cards']) && tienLenSeat(message.top.seat) && tienLenCards(message.top.cards)))
      && (message.lead === undefined || typeof message.lead === 'boolean')
      && (message.mustInclude === undefined || (isInteger(message.mustInclude) && message.mustInclude >= 0 && message.mustInclude <= 51))
      && (message.hand === undefined || tienLenCards(message.hand, 0))
      && (message.last === undefined || last(message.last))
      && (message.result === undefined || result(message.result))
      && (message.coins === undefined || (isInteger(message.coins) && message.coins >= 0));
  },
  // Đua xe — trạng thái chung (cả phòng): pha, số vòng, các xe đang trên đường (đua / chạy thử), số người chờ đua.
  // lightsAt: giờ server đèn đỏ đầu tiên sáng (mỗi giây thêm một đèn, đủ 5), startAt: đèn tắt = xuất phát; endAt: hạn chót
  // (hết pha đếm ngược / hết giờ đua / hết màn kết quả). drivers[].lap: số vòng đã xong, pos: thứ hạng khi đang đua,
  // best / last: vòng nhanh nhất / vòng vừa xong (ms), done: đã về đích, total: tổng thời gian, dnf: bỏ cuộc / mất kết nối.
  // quali: vòng dùng để xếp lưới (ms; không có = bốc thăm chỗ). result: bảng kết quả cuộc đua vừa xong (pha result).
  'race.state'(message) {
    const driver = (item) => isRecord(item)
      && exactKeys(item, ['id', 'displayName', 'color', 'mode'], ['skin', 'slot', 'lap', 'pos', 'best', 'last', 'total', 'quali', 'done', 'dnf'])
      && isString(item.id, LIMITS.participantId, ID_PATTERN)
      && isString(item.displayName, LIMITS.displayName)
      && raceColor(item.color)
      && ['practice', 'race'].includes(item.mode)
      && (item.skin === undefined || validSkin(item.skin))
      && (item.slot === undefined || (isInteger(item.slot) && item.slot >= 0 && item.slot < RACE_MAX_CARS))
      && (item.lap === undefined || (isInteger(item.lap) && item.lap >= 0 && item.lap <= 99))
      && (item.pos === undefined || (isInteger(item.pos) && item.pos >= 1 && item.pos <= RACE_MAX_CARS))
      && ['best', 'last', 'total', 'quali'].every((key) => item[key] === undefined || raceMs(item[key]))
      && ['done', 'dnf'].every((key) => item[key] === undefined || item[key] === true);
    return exactKeys(message, ['v', 'type', 'epoch', 'phase', 'laps', 'drivers', 'queued'], ['raceId', 'lightsAt', 'startAt', 'endAt', 'result'])
      && RACE_PHASES.includes(message.phase)
      && isInteger(message.laps) && message.laps >= 1 && message.laps <= 20
      && Array.isArray(message.drivers) && message.drivers.length <= RACE_MAX_CARS && message.drivers.every(driver)
      && isInteger(message.queued) && message.queued >= 0 && message.queued <= 500
      && (message.raceId === undefined || (typeof message.raceId === 'string' && RACE_ID.test(message.raceId)))
      && ['lightsAt', 'startAt', 'endAt'].every((key) => message[key] === undefined || (isInteger(message[key]) && message[key] >= 0))
      && (message.result === undefined || (Array.isArray(message.result) && message.result.length <= RACE_MAX_CARS && message.result.every(driver)));
  },
  // Vị trí xe đã gom (mỗi 50 ms): t = giờ server lúc gửi, cars[].t = giờ server nhận gói của xe đó.
  'race.cars'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 't', 'cars'])
      && isInteger(message.t) && message.t >= 0
      && Array.isArray(message.cars) && message.cars.length <= RACE_MAX_CARS
      && message.cars.every((car) => isRecord(car) && exactKeys(car, ['id', 'x', 'z', 'h', 'speed', 't'])
        && isString(car.id, LIMITS.participantId, ID_PATTERN)
        && isCoord(car.x) && isCoord(car.z) && isAngle(car.h) && raceSpeed(car.speed)
        && isInteger(car.t) && car.t >= 0);
  },
  // Một xe vừa xong một vòng (cả phòng): best = vòng nhanh nhất của người đó từ lúc vào phòng, record = nhanh nhất cuộc đua,
  // invalid = vòng không tính (bị đặt lại xe / gói tin bị bác).
  'race.lap'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'id', 'lap', 'ms'], ['best', 'record', 'invalid'])
      && isString(message.id, LIMITS.participantId, ID_PATTERN)
      && isInteger(message.lap) && message.lap >= 1 && message.lap <= 999
      && raceMs(message.ms)
      && ['best', 'record', 'invalid'].every((key) => message[key] === undefined || message[key] === true);
  },
  // Riêng từng người: mình đang làm gì, màu xe, ô lưới (đua), chỗ ra đường (spawn, vừa được cho chạy thử / xếp lưới) hoặc
  // reset (máy chủ bác vị trí vừa gửi — đặt xe về đây).
  'race.me'(message) {
    return exactKeys(message, ['v', 'type', 'epoch', 'mode', 'color'], ['slot', 'spawn', 'reset'])
      && RACE_MODES.includes(message.mode)
      && raceColor(message.color)
      && (message.slot === undefined || (isInteger(message.slot) && message.slot >= 0 && message.slot < RACE_MAX_CARS))
      && (message.spawn === undefined || raceSpot(message.spawn))
      && (message.reset === undefined || raceSpot(message.reset));
  },
  // Ví kim cương vừa đổi vì việc trong phòng (mở phim): chỉ gửi cho chủ ví để ô 💎 cập nhật ngay.
  // spent: vừa trừ (mở phim), refunded: vừa hoàn (hủy phim, video lỗi, rạp đóng); đúng một trong hai. currency mặc định
  // diamonds (client cũ); kèm số dư sau giao dịch của đúng ví đó (diamonds hoặc coins). itemId (chỉ gửi người mở): video
  // vừa vào hàng chờ, để trang người đó hiện nút Hủy.
  'wallet.update'(message) {
    const currency = message.currency ?? 'diamonds';
    return exactKeys(message, ['v', 'type', 'epoch'], ['diamonds', 'coins', 'spent', 'refunded', 'currency', 'itemId'])
      && (message.itemId === undefined || (message.spent !== undefined && isString(message.itemId, LIMITS.itemId, ID_PATTERN)))
      && VIDEO_CURRENCIES.includes(currency)
      && (message.spent === undefined) !== (message.refunded === undefined)
      && (message.spent === undefined || (isInteger(message.spent) && message.spent > 0))
      && (message.refunded === undefined || (isInteger(message.refunded) && message.refunded > 0))
      && (message.diamonds === undefined || (currency === 'diamonds' && isInteger(message.diamonds) && message.diamonds >= 0))
      && (message.coins === undefined || (currency === 'coins' && isInteger(message.coins) && message.coins >= 0));
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
  // Trạng thái trận khiêu chiến, chỉ gửi cho hai người chơi. Với rps, lựa chọn của lượt chỉ lộ ra ở `last` khi lượt
  // đã xong. Với các trò câu hỏi, `answered` chỉ cho biết ai đã nộp; đáp án thật không bao giờ nằm trong state.
  'challenge.state'(message) {
    const choice = (value) => value === null || RPS_CHOICES.includes(value);
    const common = exactKeys(message, ['v', 'type', 'epoch', 'challengeId', 'game', 'fromId', 'toId', 'status'],
      ['deadline', 'round', 'fromScore', 'toScore', 'target', 'moved', 'last', 'winner', 'questions', 'answered', 'result', 'phase', 'duel'])
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && GAMES.includes(message.game)
      && isString(message.fromId, LIMITS.participantId, ID_PATTERN)
      && isString(message.toId, LIMITS.participantId, ID_PATTERN)
      && CHALLENGE_STATUSES.includes(message.status)
      && (message.deadline === undefined || (isInteger(message.deadline) && message.deadline >= 0));
    if (!common) return false;
    if (message.game === 'brain') {
      // duel: mã đề riêng của người nhận (bên bot không có), chỉ khi đang chơi. result: số câu đúng / thời gian từng bên.
      const sideResult = (item) => isRecord(item) && exactKeys(item, ['correct', 'ms'])
        && isInteger(item.correct) && item.correct >= 0 && item.correct <= BRAIN_DUEL_ITEMS
        && isInteger(item.ms) && item.ms >= 0 && item.ms <= 3_600_000;
      const playing = message.status === 'playing';
      const finished = message.status === 'finished';
      return exactKeys(message, ['v', 'type', 'epoch', 'challengeId', 'game', 'fromId', 'toId', 'status'], ['deadline', 'duel', 'answered', 'result', 'winner'])
        && (message.duel === undefined || (playing && isRecord(message.duel) && exactKeys(message.duel, ['roundId', 'limitMs', 'total'])
          && typeof message.duel.roundId === 'string' && BRAIN_ROUND_ID.test(message.duel.roundId)
          && isInteger(message.duel.limitMs) && message.duel.limitMs > 0 && message.duel.limitMs <= 3_600_000
          && message.duel.total === BRAIN_DUEL_ITEMS))
        && ((playing || finished) ? isRecord(message.answered) && exactKeys(message.answered, ['from', 'to'])
          && typeof message.answered.from === 'boolean' && typeof message.answered.to === 'boolean' : message.answered === undefined)
        && (finished ? isRecord(message.result) && exactKeys(message.result, ['from', 'to', 'total'])
          && sideResult(message.result.from) && sideResult(message.result.to) && message.result.total === BRAIN_DUEL_ITEMS
          && RESULT_SIDES.includes(message.winner) : message.result === undefined && message.winner === undefined);
    }
    if (message.game === 'rps') {
      return exactKeys(message, ['v', 'type', 'epoch', 'challengeId', 'game', 'fromId', 'toId', 'status', 'round', 'fromScore', 'toScore', 'target'],
        ['deadline', 'moved', 'last', 'winner'])
      && isInteger(message.round) && message.round >= 0 && message.round <= 50
      && isInteger(message.fromScore) && message.fromScore >= 0
      && isInteger(message.toScore) && message.toScore >= 0
      && isInteger(message.target) && message.target >= 1 && message.target <= 10
      && (message.moved === undefined || (isRecord(message.moved) && exactKeys(message.moved, ['from', 'to'])
        && typeof message.moved.from === 'boolean' && typeof message.moved.to === 'boolean'))
      && (message.last === undefined || (isRecord(message.last) && exactKeys(message.last, ['from', 'to', 'winner'])
        && choice(message.last.from) && choice(message.last.to) && RESULT_SIDES.includes(message.last.winner)))
      && (message.winner === undefined || RESULT_SIDES.includes(message.winner));
    }
    const active = ['playing', 'finished'].includes(message.status);
    const question = (item) => isRecord(item)
      && (message.game === 'compatibility' ? exactKeys(item, ['id', 'focus']) : exactKeys(item, ['id']))
      && typeof item.id === 'string' && COMPATIBILITY_QUESTION_ID.test(item.id)
      && (message.game !== 'compatibility' || ['from', 'to'].includes(item.focus));
    const questionsValid = Array.isArray(message.questions) && message.questions.length === COMPATIBILITY_QUESTION_COUNT
      && message.questions.every(question)
      && new Set(message.questions.map((item) => item.id)).size === COMPATIBILITY_QUESTION_COUNT
      && (message.game !== 'compatibility'
        || message.questions.filter((item) => item.focus === 'from').length === COMPATIBILITY_QUESTION_COUNT / 2);
    const answeredValid = isRecord(message.answered) && exactKeys(message.answered, ['from', 'to'])
      && typeof message.answered.from === 'boolean' && typeof message.answered.to === 'boolean';
    const resultValid = isRecord(message.result) && exactKeys(message.result, ['matches', 'total', 'percent'])
      && isInteger(message.result.matches) && message.result.matches >= 0 && message.result.matches <= COMPATIBILITY_QUESTION_COUNT
      && message.result.total === COMPATIBILITY_QUESTION_COUNT
      && isInteger(message.result.percent) && message.result.percent === Math.round((message.result.matches / message.result.total) * 100);
    if (!active) return message.questions === undefined && message.answered === undefined
      && message.result === undefined && message.phase === undefined;
    if (!questionsValid || !answeredValid) return false;
    if (message.game === 'guess-you') {
      if (!['answer', 'guess', 'result'].includes(message.phase)) return false;
      if (message.status === 'playing' && message.phase === 'answer' && (message.answered.from || message.answered.to)) return false;
      if (message.status === 'playing' && message.phase === 'guess' && (!message.answered.from || message.answered.to)) return false;
      if (message.status === 'finished' && (message.phase !== 'result' || !message.answered.from || !message.answered.to)) return false;
    } else if (message.phase !== undefined) return false;
    return message.status === 'finished' ? resultValid : message.result === undefined;
  },
  // Chỉ gửi sau challenge.state `finished`, đúng hai người chơi nhận được. Tách message để client cũ bỏ qua an toàn.
  'challenge.reveal'(message) {
    const answer = (item) => isRecord(item) && exactKeys(item, ['id', 'from', 'to'])
      && typeof item.id === 'string' && COMPATIBILITY_QUESTION_ID.test(item.id)
      && [0, 1].includes(item.from) && [0, 1].includes(item.to);
    return exactKeys(message, ['v', 'type', 'epoch', 'challengeId', 'answers'])
      && isString(message.challengeId, LIMITS.itemId, ID_PATTERN)
      && Array.isArray(message.answers) && message.answers.length === COMPATIBILITY_QUESTION_COUNT
      && message.answers.every(answer)
      && new Set(message.answers.map((item) => item.id)).size === COMPATIBILITY_QUESTION_COUNT;
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
