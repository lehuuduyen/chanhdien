const ROOM_ID = /^[a-z][a-z0-9-]{1,31}$/;
const MODERATION_LEVELS = new Set(['standard', 'strict']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function defineRoomRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new TypeError('rules phải là object');
  if (typeof rules.id !== 'string' || !ROOM_ID.test(rules.id)) throw new TypeError('rules.id không hợp lệ');
  if (!Number.isInteger(rules.maxParticipants) || rules.maxParticipants < 2 || rules.maxParticipants > 500) {
    throw new RangeError('maxParticipants phải từ 2 đến 500');
  }
  if (rules.seats !== undefined && (!Number.isInteger(rules.seats) || rules.seats < 0 || rules.seats > rules.maxParticipants)) {
    throw new RangeError('seats phải nằm trong sức chứa của phòng');
  }
  if (rules.benches !== undefined && (!Number.isInteger(rules.benches.count) || rules.benches.count < 0
    || !Number.isInteger(rules.benches.seatsPerBench) || rules.benches.seatsPerBench < 1 || rules.benches.seatsPerBench > 4)) {
    throw new RangeError('benches cần count >= 0 và seatsPerBench từ 1 đến 4');
  }
  if (rules.lang !== undefined && !['vi', 'en', 'es', 'zh'].includes(rules.lang)) throw new TypeError('lang không được hỗ trợ');
  if (rules.moderation !== undefined && !MODERATION_LEVELS.has(rules.moderation)) {
    throw new TypeError('moderation không hợp lệ');
  }
  return deepFreeze({ ...rules });
}

export const CINEMA_RULES = defineRoomRules({
  id: 'cinema',
  activity: 'watch-together',
  sceneId: 'cinema-default',
  maxParticipants: 500,
  seats: 100,
  lang: 'vi',
  moderation: 'standard',
  content: { source: 'youtube' },
  interaction: { queue: 'everyone', skipVotePercent: 35 },
  // Nhân vật nam/nữ chọn ở cổng chùa (avatar.set); ở rạp mặc đồ thường ngày, đầu/mặt giữ nguyên.
  skins: ['man', 'woman'],
  // Đi lại trong rạp (góc nhìn nhân vật): vào từ cửa sau, đi xuống lối đi rồi ngồi ghế. Vùng thô theo
  // scenes/cinema-default (theater3d.hall); va chạm với ghế tính ở client. Rạp ≤ 500 người nên phát vị trí cho cả
  // phòng (không chia vùng như chánh điện).
  world: {
    bounds: { x: [-6.3, 6.3], z: [1.2, 18.3] },
    maxSpeed: 6,
    maxWalkers: 500,
  },
});

// Chánh điện: ngồi bồ đoàn, tụng kinh, dâng lễ vật (miễn phí, mang tính biểu tượng; tiền thật thuộc giai đoạn 6).
// Công đức theo điểm của bản legacy. Lễ vật không có thời gian chờ (theo yêu cầu); chống spam bằng giới hạn chung
// 6 lễ/10 giây mỗi người ở máy realtime. cooldownMs > 0 sẽ bật lại thời gian chờ riêng cho lễ vật đó.
export const THIEN_RULES = defineRoomRules({
  id: 'thien',
  activity: 'chant-together',
  sceneId: 'thien-default',
  maxParticipants: 500,
  // Một phòng nhận tối đa maxParticipants người (sảnh mở phòng tiếp theo khi đầy). Scene có tối đa 20 vị trí bồ
  // đoàn thiết kế: seats quyết định số bồ đoàn thực tế ở client và số ghế realtime chấp nhận. Đổi cấu hình cần khởi
  // động lại API + realtime.
  seats: 20,
  // Ghế đá ngoài sân là chỗ ngồi xã hội, tách khỏi 20 bồ đoàn và không ảnh hưởng ngưỡng mở phòng.
  // Scene dùng mã B-1…B-6; realtime giữ tối đa hai người trên mỗi ghế.
  benches: { count: 6, seatsPerBench: 2 },
  lang: 'vi',
  moderation: 'strict',
  content: { source: 'none' },
  skins: ['man', 'woman', 'granny', 'nun', 'monk', 'child'],
  // Chế độ nhập vai: nhân vật đi lại tự do. Server chỉ kiểm tra thô (vùng chữ nhật, tốc độ tối đa) để chống dịch
  // chuyển tức thời; va chạm chi tiết theo world.walk trong scene JSON ở client. Vùng thô gồm cả sân ngoài chùa;
  // maxSpeed tính cả lúc chạy (giữ Shift). maxWalkers: số nhân vật đi lại tối đa mỗi phòng (bằng sức chứa).
  // Phòng đông: chánh điện và sân là hai vùng riêng (zones.hall; ngoài vùng đó là sân). Mỗi máy chỉ nhận và vẽ
  // view[vùng] người gần mình nhất trong cùng vùng (cộng người ngồi bồ đoàn/ghế đá và người đang mời/đấu với mình);
  // số người cả phòng gửi riêng qua room.count. Load test 2026-11: gửi cả danh sách cho mọi người thì sập ở ~600.
  world: {
    bounds: { x: [-36, 36], z: [-2, 100] },
    maxSpeed: 7,
    maxWalkers: 500,
    zones: { hall: { x: [-9, 9], z: [-6, 16] } },
    view: { hall: 60, yard: 40 },
    // Ba điểm đi nhanh đều nằm trên lối đi hợp lệ của scene thien-default. Người dùng tới trước khu vực, sau đó
    // vẫn đi bộ và chịu va chạm bình thường; tọa độ chỉ nằm ở server, client gửi tên đích.
    travel: {
      hall: { x: 0, z: 13.8, ry: 0 },
      courtyard: { x: 0, z: 33, ry: 0 },
      garden: { x: 10.8, z: 68, ry: -1.5708 },
    },
  },
  // Bot ngồi sẵn cho chánh điện không vắng. Số người hiện trong phòng có tính bot (theo yêu cầu), kèm số bot riêng
  // để giao diện ghi rõ "gồm N Phật tử ảo (máy)"; vote, sức chứa và sảnh chỉ đếm người thật. Bot không chào hỏi
  // riêng, không thỉnh chuông, và phải bị loại khỏi bảng công đức trước khi có ủng hộ bằng tiền thật. Đổi số lượng
  // bằng BOTS_THIEN.
  bots: {
    count: 8,
    initial: 3,
    arrivalMs: [5_000, 20_000],
    actionMs: [8_000, 30_000],
    churnMs: [180_000, 360_000],
    // Một phần bot đi dạo ngoài khuôn viên. Tọa độ bám các lối đá trong scene thien-default; bot còn lại vẫn ngồi
    // bồ đoàn để chánh điện có người tụng. Máy realtime phát vị trí qua room.moves như người thật.
    walk: {
      count: 3,
      initial: 1,
      speed: 1.25,
      pauseMs: [2_000, 7_000],
      // Tuyến khép kín chỉ đi trên lối đá. Các điểm lặp là có chủ ý: bot phải quay lại lối giữa và vòng hai
      // phía bồn nước, không được nội suy thẳng qua tượng hay mặt bồn.
      waypoints: [
        { x: 0, z: 32 }, { x: 0, z: 45 }, { x: 0, z: 50 },
        { x: -15, z: 50 }, { x: 0, z: 50 }, { x: 15, z: 50 }, { x: 0, z: 50 },
        { x: 0, z: 62 }, { x: 0, z: 74 },
        { x: -4, z: 76 }, { x: -4, z: 84 }, { x: 0, z: 88 }, { x: 0, z: 92 },
        { x: 0, z: 88 }, { x: 4, z: 84 }, { x: 4, z: 76 },
        { x: 0, z: 74 }, { x: 0, z: 62 }, { x: 0, z: 50 }, { x: 0, z: 45 },
      ],
    },
    names: ['Diệu Hạnh', 'Minh Tâm', 'Thiện Đức', 'Huệ An', 'Tịnh Nhã', 'Quảng Trí', 'Chơn Như', 'Pháp Hỷ', 'Nguyên Thanh', 'Tâm Đăng', 'Diệu Liên', 'Trí Hải', 'Phước Lộc', 'Hạnh Nguyện', 'Như Ý', 'Bảo Châu'],
    lines: ['Nam mô A Di Đà Phật', 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật', 'Nam mô Đại Bi Quán Thế Âm Bồ Tát', 'Nguyện cầu bình an cho gia đình', 'Cầu cho cha mẹ được khỏe mạnh', 'Nguyện đem công đức này hướng về khắp tất cả'],
    // Phòng theo ngôn ngữ khác: tên và câu tụng của bot đổi theo ngôn ngữ phòng (names/lines ở trên là tiếng Việt).
    byLang: {
      en: {
        names: ['Grace', 'Daniel', 'Hannah', 'Michael', 'Sophia', 'James', 'Emily', 'David', 'Olivia', 'Ethan', 'Linda', 'Robert', 'Mia', 'Joseph', 'Chloe', 'Andrew'],
        lines: ['Namo Amitabha Buddha', 'Namo Shakyamuni Buddha', 'Namo Avalokiteshvara Bodhisattva', 'May my family be safe and well', 'May my parents be healthy', 'May the merit of this practice reach all beings'],
      },
      zh: {
        names: ['慧心', '明德', '淨蓮', '妙音', '善喜', '如意', '寶珠', '法明', '慈安', '德成', '靜怡', '志遠', '心月', '智海', '福祥', '蓮華'],
        lines: ['南無阿彌陀佛', '南無本師釋迦牟尼佛', '南無大悲觀世音菩薩', '願家人平安吉祥', '願父母身體健康', '願以此功德，普及於一切'],
      },
      es: {
        names: ['María', 'José', 'Carmen', 'Luis', 'Ana', 'Carlos', 'Lucía', 'Miguel', 'Sofía', 'Javier', 'Elena', 'Diego', 'Isabel', 'Pablo', 'Rosa', 'Andrés'],
        lines: ['Namo Buda Amitabha', 'Namo Buda Shakyamuni', 'Namo Bodhisattva Avalokiteshvara', 'Que mi familia esté en paz', 'Que mis padres tengan salud', 'Que el mérito de esta práctica llegue a todos los seres'],
      },
    },
  },
  interaction: {
    offerings: {
      petal: { merit: 1, cooldownMs: 0, label: 'Cánh sen' },
      incense: { merit: 5, cooldownMs: 0, label: 'Dâng hương' },
      lotus: { merit: 20, cooldownMs: 0, label: 'Hoa sen' },
      bell: { merit: 99, cooldownMs: 0, label: 'Thỉnh chuông' },
    },
  },
});

// Cấp độ công đức của tài khoản (tổng điểm đã lưu). Dùng chung cho API, máy realtime và huy hiệu cạnh tên trên trình duyệt.
export const MERIT_LEVELS = deepFreeze([
  { level: 1, name: 'Sơ tâm', min: 0 },
  { level: 2, name: 'Tín tâm', min: 100 },
  { level: 3, name: 'Thiện tâm', min: 500 },
  { level: 4, name: 'Tịnh tâm', min: 1_500 },
  { level: 5, name: 'Định tâm', min: 5_000 },
  { level: 6, name: 'Tuệ tâm', min: 15_000 },
  { level: 7, name: 'Bồ đề tâm', min: 50_000 },
]);

// Phòng game: Bầu Cua chơi chung theo thời gian thực. Máy realtime giữ nhịp ván (đặt cược → lắc → kết quả) và lắc
// xúc xắc; ví xu (xu bán trái cây) do API giữ: cược trừ ngay, lắc xong API trả thưởng cả bàn trong một giao dịch.
// Chỉ thành viên đã đăng nhập mới cược được; khách vào xem.
export const GAME_RULES = defineRoomRules({
  id: 'game',
  activity: 'play-together',
  maxParticipants: 500,
  lang: 'vi',
  moderation: 'standard',
  interaction: {
    game: 'bau-cua',
    bettingMs: 20_000,
    rollingMs: 3_000,
    resultMs: 6_000,
    maxStakePerRound: 1_000,
  },
});

export const ROOM_TYPES = Object.freeze({ cinema: CINEMA_RULES, thien: THIEN_RULES, game: GAME_RULES });

// Danh mục phòng công khai. API và máy realtime cùng đọc để biết phòng nào thuộc loại nào.
export const ROOM_CATALOG = deepFreeze([
  { id: 'thien-1', type: 'thien', name: 'Chánh điện' },
  { id: 'cinema-1', type: 'cinema', name: 'Cinema #1' },
  { id: 'game-1', type: 'game', name: 'Bầu Cua #1' },
]);

export function getRoomRules(type) {
  return ROOM_TYPES[type] || null;
}

// ---- Chánh điện theo tiểu bang và ngôn ngữ ----
// Mỗi cặp (tiểu bang, ngôn ngữ) là một nhóm phòng riêng: thien-az-vi-1, thien-az-vi-2… Phòng kế tiếp tự mở khi
// phòng trước kín bồ đoàn (API chọn phòng ở /api/v1/thien/assign). Giờ sự kiện tính theo múi giờ của tiểu bang.
export const THIEN_LANGS = deepFreeze({
  vi: { code: 'PV', label: 'Tiếng Việt', tts: 'vi-VN' },
  en: { code: 'PA', label: 'English', tts: 'en-US' },
  zh: { code: 'PT', label: '中文', tts: 'zh-CN' },
  es: { code: 'PTB', label: 'Español', tts: 'es-US' },
});

// Tiểu bang có nhiều múi giờ dùng múi giờ của phần đông dân số.
export const US_STATES = deepFreeze([
  ['al', 'Alabama', 'America/Chicago'], ['ak', 'Alaska', 'America/Anchorage'], ['az', 'Arizona', 'America/Phoenix'],
  ['ar', 'Arkansas', 'America/Chicago'], ['ca', 'California', 'America/Los_Angeles'], ['co', 'Colorado', 'America/Denver'],
  ['ct', 'Connecticut', 'America/New_York'], ['de', 'Delaware', 'America/New_York'], ['dc', 'District of Columbia', 'America/New_York'],
  ['fl', 'Florida', 'America/New_York'], ['ga', 'Georgia', 'America/New_York'], ['hi', 'Hawaii', 'Pacific/Honolulu'],
  ['id', 'Idaho', 'America/Boise'], ['il', 'Illinois', 'America/Chicago'], ['in', 'Indiana', 'America/Indiana/Indianapolis'],
  ['ia', 'Iowa', 'America/Chicago'], ['ks', 'Kansas', 'America/Chicago'], ['ky', 'Kentucky', 'America/New_York'],
  ['la', 'Louisiana', 'America/Chicago'], ['me', 'Maine', 'America/New_York'], ['md', 'Maryland', 'America/New_York'],
  ['ma', 'Massachusetts', 'America/New_York'], ['mi', 'Michigan', 'America/Detroit'], ['mn', 'Minnesota', 'America/Chicago'],
  ['ms', 'Mississippi', 'America/Chicago'], ['mo', 'Missouri', 'America/Chicago'], ['mt', 'Montana', 'America/Denver'],
  ['ne', 'Nebraska', 'America/Chicago'], ['nv', 'Nevada', 'America/Los_Angeles'], ['nh', 'New Hampshire', 'America/New_York'],
  ['nj', 'New Jersey', 'America/New_York'], ['nm', 'New Mexico', 'America/Denver'], ['ny', 'New York', 'America/New_York'],
  ['nc', 'North Carolina', 'America/New_York'], ['nd', 'North Dakota', 'America/Chicago'], ['oh', 'Ohio', 'America/New_York'],
  ['ok', 'Oklahoma', 'America/Chicago'], ['or', 'Oregon', 'America/Los_Angeles'], ['pa', 'Pennsylvania', 'America/New_York'],
  ['ri', 'Rhode Island', 'America/New_York'], ['sc', 'South Carolina', 'America/New_York'], ['sd', 'South Dakota', 'America/Chicago'],
  ['tn', 'Tennessee', 'America/Chicago'], ['tx', 'Texas', 'America/Chicago'], ['ut', 'Utah', 'America/Denver'],
  ['vt', 'Vermont', 'America/New_York'], ['va', 'Virginia', 'America/New_York'], ['wa', 'Washington', 'America/Los_Angeles'],
  ['wv', 'West Virginia', 'America/New_York'], ['wi', 'Wisconsin', 'America/Chicago'], ['wy', 'Wyoming', 'America/Denver'],
].map(([code, name, timeZone]) => ({ code, name, timeZone })));

// Sự kiện hằng ngày: đúng giờ này theo giờ địa phương của tiểu bang, cả phòng cùng nghe bài giảng YouTube của
// ngôn ngữ phòng (phát từ đầu video lúc bắt đầu; ai vào trễ nghe tiếp đúng đoạn đang giảng). Đổi video ở đây.
export const THIEN_EVENT = deepFreeze({
  hour: 18,
  minute: 0,
  lectures: {
    vi: { videoId: '7twfuIkc9pY', title: 'Ngồi chỉ để mà ngồi · TS Thích Nhất Hạnh (Làng Mai)' },
    en: { videoId: 'qOK8IjP6MQ4', title: 'Day of Mindfulness with Thich Nhat Hanh · Blue Cliff 2013' },
    zh: { videoId: '1AOYP1X5Eto', title: '內在的戰爭與和平 · 一行禪師' },
    es: { videoId: 'cgARyG5HaQ0', title: 'Thich Nhat Hanh · Español / English' },
  },
});

const THIEN_ROOM = /^thien-([a-z]{2})-(vi|en|zh|es)-([1-9][0-9]{0,2})$/;
export const THIEN_MAX_SHARDS = 999;

export function thienRoomId(state, lang, shard) {
  return `thien-${state}-${lang}-${shard}`;
}

// thien-az-vi-2 → { state: 'az', lang: 'vi', shard: 2 }; mã không hợp lệ → null.
export function parseThienRoomId(roomId) {
  const match = typeof roomId === 'string' && THIEN_ROOM.exec(roomId);
  if (!match || !US_STATES.some((state) => state.code === match[1])) return null;
  return { state: match[1], lang: match[2], shard: Number(match[3]) };
}

// Tên hiển thị ngắn kiểu "Arizona · PV2".
export function thienRoomName(roomId) {
  const info = parseThienRoomId(roomId);
  if (!info) return null;
  const state = US_STATES.find((item) => item.code === info.state);
  return `${state.name} · ${THIEN_LANGS[info.lang].code}${info.shard}`;
}

// Ngôn ngữ của phòng: phòng theo tiểu bang lấy từ mã phòng, phòng cố định lấy từ room rules.
export function roomLangOf(roomId) {
  return parseThienRoomId(roomId)?.lang || getRoomRules(roomTypeOf(roomId))?.lang || 'vi';
}

export function roomTypeOf(roomId) {
  if (parseThienRoomId(roomId)) return 'thien';
  return ROOM_CATALOG.find((room) => room.id === roomId)?.type || null;
}
