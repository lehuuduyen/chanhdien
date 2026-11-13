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

const uniqueNames = (...groups) => [...new Set(groups.flat())];
const familyFirstNames = (families, givenNames, separator = ' ') => families.flatMap((family) => givenNames.map((given) => `${family}${separator}${given}`));
const givenFirstNames = (givenNames, families) => givenNames.flatMap((given) => families.map((family) => `${given} ${family}`));

// Kho tên phải lớn hơn mức addbot tối đa để bot trong cùng phòng luôn có tên riêng, không cần gắn số phía sau.
// Các tên ghép được ghi thành mảng ngay khi nạp room rules để API bạn bè vẫn nhận diện bot theo đúng tên hiển thị.
const VI_BOT_NAMES = uniqueNames(
  ['An Nhiên', 'Mây Trắng', 'Sen Nhỏ', 'Tâm Vui', 'Bình Minh', 'Gió Mát', 'Hạt Mưa', 'Trăng Non', 'Lá Bồ Đề',
    'Hoa Đăng', 'Thiện Tâm', 'Pháp Lạc', 'Suối Trong', 'Nắng Mai', 'Tịnh Lạc', 'Diệu Âm', 'Bình An', 'Từ Tâm',
    'Hương Sen', 'Mộc Miên', 'Ngọc Sáng', 'Mầm Xanh', 'Ban Mai', 'Ánh Nguyệt', 'Thanh Phong', 'Lam Khê'],
  familyFirstNames(
    ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Phan'],
    ['Minh An', 'Gia Hân', 'Ngọc Anh', 'Đức Minh', 'Hoài An', 'Thanh Tâm', 'Khánh Linh', 'Tuệ Lâm', 'Hải Đăng', 'Nhật Minh', 'Bảo Châu', 'Quỳnh Anh'],
  ),
);
const THIEN_VI_BOT_NAMES = uniqueNames(
  ['Diệu Hạnh', 'Minh Tâm', 'Thiện Đức', 'Huệ An', 'Tịnh Nhã', 'Quảng Trí', 'Chơn Như', 'Pháp Hỷ',
    'Nguyên Thanh', 'Tâm Đăng', 'Diệu Liên', 'Trí Hải', 'Phước Lộc', 'Hạnh Nguyện', 'Như Ý', 'Bảo Châu',
    'Thu Hà', 'Ngọc Lan', 'Hoàng Nam', 'Bích Ngọc', 'Minh Khoa', 'Thanh Tùng', 'Kim Oanh', 'Quốc Bảo',
    'Mai Anh', 'Hữu Phước', 'Thảo Vy', 'Gia Huy', 'Tường Vi', 'Đức Anh', 'Lan Chi', 'Văn Hùng',
    'Thùy Dung', 'Bảo Ngọc', 'Tuấn Kiệt', 'Hồng Nhung', 'Cô Tư', 'Chú Ba', 'Bác Sáu', 'Dì Năm'],
  VI_BOT_NAMES,
);
const EN_BOT_NAMES = uniqueNames(
  ['Grace', 'Daniel', 'Hannah', 'Michael', 'Sophia', 'James', 'Emily', 'David', 'Olivia', 'Ethan', 'Linda',
    'Robert', 'Mia', 'Joseph', 'Chloe', 'Andrew'],
  givenFirstNames(
    ['Amelia', 'Benjamin', 'Charlotte', 'Elijah', 'Evelyn', 'Henry', 'Isla', 'Jack', 'Lily', 'Noah', 'Violet'],
    ['Bennett', 'Brooks', 'Carter', 'Collins', 'Foster', 'Hayes', 'Morgan', 'Parker', 'Reed', 'Turner'],
  ),
);
const ZH_BOT_NAMES = uniqueNames(
  ['慧心', '明德', '淨蓮', '妙音', '善喜', '如意', '寶珠', '法明', '慈安', '德成', '靜怡', '志遠',
    '心月', '智海', '福祥', '蓮華'],
  familyFirstNames(
    ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊'],
    ['慧心', '明德', '淨蓮', '妙音', '善喜', '如意', '寶珠', '法明', '慈安', '靜怡'],
    '',
  ),
);
const ES_BOT_NAMES = uniqueNames(
  ['María', 'José', 'Carmen', 'Luis', 'Ana', 'Carlos', 'Lucía', 'Miguel', 'Sofía', 'Javier', 'Elena',
    'Diego', 'Isabel', 'Pablo', 'Rosa', 'Andrés'],
  givenFirstNames(
    ['Alba', 'Bruno', 'Camila', 'Daniel', 'Emma', 'Gabriel', 'Inés', 'Mateo', 'Nora', 'Samuel', 'Valentina'],
    ['Castro', 'Flores', 'García', 'Herrera', 'López', 'Morales', 'Navarro', 'Ortega', 'Ramírez', 'Santos'],
  ),
);

export const CINEMA_RULES = defineRoomRules({
  id: 'cinema',
  activity: 'watch-together',
  sceneId: 'cinema-default',
  maxParticipants: 500,
  seats: 100,
  lang: 'vi',
  moderation: 'standard',
  // Mở phim (thêm video vào hàng chờ) tốn tiền, chỉ thành viên đã đăng nhập. videoPrice ở đây chỉ bật tính năng (và là
  // giá kim cương khởi tạo); loại tiền (xu / 💎) + giá thật do admin đặt ở API (apps/api/cinema-pay.mjs), trừ trước khi
  // video vào hàng chờ, hoàn khi không thêm được / người mở hủy / video lỗi / rạp đóng khi video còn chờ.
  content: { source: 'youtube', videoPrice: 20 },
  interaction: { queue: 'everyone', skipVotePercent: 35 },
  // Rạp luôn có khán giả: số bot ngẫu nhiên trong range (10–30), realtime cho dao động trong khoảng đó như người ra
  // vào, mỗi bot ngồi một ghế trống ngẫu nhiên (randomSeat). Khoảng này cố định: addbot và BOTS_CINEMA đều không đổi
  // (máy realtime bỏ qua BOTS_CINEMA). Bot chỉ trò chuyện mô phỏng, không vote đổi phim và không chiếm quyền điều khiển hàng chờ.
  bots: {
    range: [10, 30],
    alwaysOn: true,
    drift: true,
    randomSeat: true,
    max: 100,
    initial: 5,
    arrivalMs: [2_000, 7_000],
    actionMs: [12_000, 35_000],
    churnMs: [180_000, 360_000],
    skins: ['man', 'woman'],
    names: VI_BOT_NAMES,
    lines: ['Phim hay quá', 'Mọi người xem vui nhé', 'Đoạn này ý nghĩa thật', 'Chúc cả phòng một buổi tối bình an'],
  },
  // Nhân vật nam/nữ chọn ở cổng chùa (avatar.set); ở rạp mặc đồ thường ngày, đầu/mặt giữ nguyên. Hình mua trong
  // shop (PREMIUM_SKINS) chỉ người sở hữu mới mặc được.
  skins: ['man', 'woman', 'chibigirl', 'swordsman'],
  // Đi lại trong rạp (góc nhìn nhân vật): vào từ cửa sau, đi xuống lối đi rồi ngồi ghế. Vùng thô theo
  // scenes/cinema-default (theater3d.hall); va chạm với ghế tính ở client. Rạp ≤ 500 người nên phát vị trí cho cả
  // phòng (không chia vùng như chánh điện).
  world: {
    bounds: { x: [-6.3, 6.3], z: [1.2, 18.3] },
    maxSpeed: 6,
    maxWalkers: 500,
  },
});

// Vườn Công Đức ở sân sau bên phải: 5 hàng × 10 luống trong hàng rào, cổng ở cạnh tây (z = 68) nhìn ra lối giữa.
// Luống trong một hàng sát nhau; giữa các hàng là lối đi (aisle: lối đứng chăm luống đó), dọc rào phía tây có lối
// nối các hàng với cổng (walkwayX). Một nguồn cho cả scene (scripts/thien-garden-layout.mjs ghi vào thien-default) và
// bot làm vườn ở máy realtime (đi theo approach → walkwayX → aisle, không giẫm lên luống).
export const THIEN_GARDEN = deepFreeze((() => {
  const rows = [{ z: 58.2, aisle: 59.95 }, { z: 61.7, aisle: 63.45 }, { z: 65.2, aisle: 63.45 }, { z: 70.8, aisle: 72.55 }, { z: 74.3, aisle: 72.55 }];
  const columns = Array.from({ length: 10 }, (_, index) => 16 + index * 2);
  return {
    bed: 1.7,
    fence: { x: [13.2, 35.3], z: [57, 76.4] },
    gate: { z: 68, width: 2.4 },
    walkwayX: 14.3,
    // Từ lối giữa sân tới cổng vườn (lệch khỏi bồn hoa ở x = 3,3; z = 67,75).
    approach: [{ x: 0, z: 68.4 }, { x: 14.3, z: 68.4 }],
    plots: rows.flatMap((row, rowIndex) => columns.map((x, column) => ({ id: rowIndex * columns.length + column + 1, x, z: row.z, aisle: row.aisle }))),
  };
})());

// Khu tưởng niệm trên dải sân mở rộng phía tây: 36 ô mộ (12 hàng × 3 cột) trong hàng rào đá, cổng ở cạnh đông
// (z = 63,5) nối lối đá về lối giữa. Mỗi mộ: nấm đất dài 2 m theo trục x, bia ở đầu phía tây quay mặt về phía đông
// (người đứng ở lối đi phía đông đọc được). Ô 1–3 là hàng gần chánh điện nhất, cột 1 gần cổng nhất. Giá, thời hạn và
// số ô do @chanh-dien/garden quyết định (GRAVE_COUNT phải bằng graves.length).
export const THIEN_MEMORIAL = deepFreeze((() => {
  const columns = [-40.4, -44.8, -49.2];
  const rows = Array.from({ length: 12 }, (_, index) => 59 + index * 3);
  return {
    fence: { x: [-51.2, -37.2], z: [56.6, 94.6] },
    gate: { z: 63.5, width: 2.4 },
    mound: { length: 2, width: 1.1 },
    graves: rows.flatMap((z, row) => columns.map((x, column) => ({ id: row * columns.length + column + 1, x, z }))),
  };
})());

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
  // Scene dùng mã B-1…B-15 (B-1…B-6 ghế đá, B-7…B-9 xích đu / cầu tuột ở khu vui chơi, B-10…B-13 ghế Vườn Hoa,
  // B-14 / B-15 ghế trên Đài ngắm cảnh ngoài cổng, B-16…B-18 ghế ven hồ Rừng thiền ngoài cổng tây); mỗi món tối đa hai
  // người.
  benches: { count: 18, seatsPerBench: 2 },
  lang: 'vi',
  moderation: 'strict',
  content: { source: 'none' },
  skins: ['man', 'woman', 'granny', 'nun', 'monk', 'child', 'chibigirl', 'swordsman'],
  // Chế độ nhập vai: nhân vật đi lại tự do. Server chỉ kiểm tra thô (vùng chữ nhật, tốc độ tối đa) để chống dịch
  // chuyển tức thời; va chạm chi tiết theo world.walk trong scene JSON ở client. Vùng thô gồm cả sân ngoài chùa;
  // maxSpeed tính cả lúc chạy (giữ Shift). maxWalkers: số nhân vật đi lại tối đa mỗi phòng (bằng sức chứa).
  // Phòng đông: chánh điện và sân là hai vùng riêng (zones.hall; ngoài vùng đó là sân). Mỗi máy chỉ nhận và vẽ
  // view[vùng] người gần mình nhất trong cùng vùng (cộng người ngồi bồ đoàn/ghế đá và người đang mời/đấu với mình);
  // số người cả phòng gửi riêng qua room.count. Load test 2026-11: gửi cả danh sách cho mọi người thì sập ở ~600.
  world: {
    // z tới 136: gồm lối đá ngoài cổng và Đài ngắm cảnh (world.courtyard.overlook); x tới −96: Rừng thiền ngoài cổng
    // tây (world.courtyard.grove).
    bounds: { x: [-96, 52], z: [-2, 136] },
    maxSpeed: 7,
    maxWalkers: 500,
    zones: { hall: { x: [-9, 9], z: [-6, 16] } },
    view: { hall: 60, yard: 40 },
    // Các điểm đi nhanh đều nằm trên lối đi hợp lệ của scene thien-default. Người dùng tới trước khu vực, sau đó
    // vẫn đi bộ và chịu va chạm bình thường; tọa độ chỉ nằm ở server, client gửi tên đích.
    travel: {
      hall: { x: 0, z: 13.8, ry: 0 },
      courtyard: { x: 0, z: 33, ry: 0 },
      garden: { x: 10.8, z: 68, ry: -1.5708 },
      pets: { x: 10.5, z: 87.5, ry: -1.5708 },
      memorial: { x: -35.8, z: 63.5, ry: 1.5708 },
      park: { x: 13.2, z: 28.6, ry: -1.5708 },
      flowers: { x: -13.9, z: 40.75, ry: 1.5708 },
      farm: { x: 43.4, z: 64.6, ry: 3.1416 },
      // Đầu Đài ngắm cảnh ngoài cổng, quay mặt ra cảnh tiểu bang.
      overlook: { x: 0, z: 116.5, ry: 3.1416 },
      // Trên lối đá vào Rừng thiền ngoài cổng tây, quay mặt vào rừng.
      grove: { x: -59, z: 31.5, ry: 1.5708 },
    },
    // Mã thú cố định dùng để realtime từ chối id giả; hình dáng, tên và vị trí vẫn là dữ liệu của scene.
    pets: ['pet-dog-moc', 'pet-dog-nau', 'pet-dog-sua', 'pet-cat-miu', 'pet-cat-may', 'pet-cat-bong', 'pet-dog-milo', 'pet-dog-fox', 'pet-cat-meomeo',
      // Nông trại nhỏ (kế bên khu thú cưng, mô hình Meshy).
      'farm-rabbit-bong', 'farm-rabbit-mochi', 'farm-duck-vang', 'farm-duck-bau', 'farm-goat-rau', 'farm-pig-un', 'farm-deer-sao', 'farm-pony-gio'],
    petArea: { x: [7.2, 34], z: [77, 97] },
    // Nông trại nhỏ: đứng trong khu này cũng tương tác được với thú (pet.interact).
    farmArea: { x: [36, 50.8], z: [60, 97] },
    // Công việc chung trong sân chùa. Server dùng chính các điểm này để xác nhận người chơi đã lại gần; scene
    // thien-default khai báo cùng id/toạ độ để engine hiện nút và đạo cụ. Một người làm mất khoảng 36 giây,
    // nhiều người cùng làm được cộng thêm 25% hiệu quả cho mỗi người sau người đầu tiên.
    chores: [
      { id: 'sweep-yard', kind: 'sweep', x: 0, z: 41, radius: 2.8, durationMs: 36_000 },
      { id: 'water-planters', kind: 'water', x: 1.2, z: 58.75, radius: 2.8, durationMs: 36_000 },
      { id: 'light-lanterns', kind: 'light', x: 3.4, z: 29, radius: 2.8, durationMs: 36_000 },
      { id: 'feed-koi', kind: 'feed', x: -6.6, z: 80, radius: 2.8, durationMs: 36_000 },
      { id: 'clean-guanyin', kind: 'clean', x: 16.4, z: 50, radius: 2.8, durationMs: 36_000 },
      { id: 'make-tea', kind: 'tea', x: 8.5, z: 68, radius: 2.8, durationMs: 36_000 },
    ],
  },
  // Trốn tìm trong sân (apps/realtime/hide-seek.mjs): ai muốn chơi bấm Tham gia; đủ minPlayers thì đếm lobbyMs rồi bắt
  // đầu. Mọi người về điểm xuất phát (base), khoảng 1 người đi kiếm / seekersPer người chơi. Pha đi trốn (hideMs): người
  // đi kiếm màn hình đen, không đi được và không nhận vị trí người trốn. Pha đi kiếm (seekMs): người trốn đứng yên, xem
  // camera người khác; người đi kiếm chạm người trốn trong vòng catchDistance m để bắt. Bắt hết thì người đi kiếm thắng,
  // hết giờ còn người trốn thì người trốn thắng. Trong ván, người chơi chỉ thấy người chơi (bot / người ngoài được ẩn),
  // người ngoài không thấy người trốn.
  hideSeek: {
    minPlayers: 2,
    maxPlayers: 40,
    lobbyMs: 20_000,
    hideMs: 60_000,
    seekMs: 180_000,
    resultMs: 10_000,
    catchDistance: 3,
    seekersPer: 6,
    base: { x: 0, z: 33 },
    // Ít người: kéo bot đang đi dạo vào làm người trốn cho đủ botFill người (một người cũng chơi được, làm người đi
    // kiếm). Thưởng xu chỉ khi ván có ít nhất rewardMinHumans người thật (giá + giới hạn ngày ở @chanh-dien/garden).
    botFill: 4,
    rewardMinHumans: 2,
  },
  // Bot ngồi sẵn cho chánh điện không vắng. Số người hiện trong phòng có tính bot; server vẫn giữ số bot riêng để
  // vận hành nhưng giao diện gộp vào tổng theo yêu cầu. Vote, sức chứa và sảnh chỉ đếm người thật. Bot không chào hỏi
  // riêng, không thỉnh chuông, và phải bị loại khỏi bảng công đức trước khi có ủng hộ bằng tiền thật. Đổi số lượng
  // bằng BOTS_THIEN.
  bots: {
    count: 16,
    initial: 8,
    arrivalMs: [3_000, 10_000],
    actionMs: [8_000, 30_000],
    churnMs: [180_000, 360_000],
    // Hai hình cuối chỉ dành cho bot, không đưa vào THIEN_RULES.skins nên người dùng không thể chọn lách qua client.
    skins: ['man', 'woman', 'pilgrim', 'lotusgirl', 'granny', 'nun', 'monk', 'child'],
    // Khoảng 30% bot dẫn theo một linh thú (loài, cấp ngẫu nhiên) như người chơi đã nuôi.
    spiritPets: 0.3,
    // Một phần bot đi dạo ngoài khuôn viên. Tọa độ bám các lối đá trong scene thien-default; bot còn lại vẫn ngồi
    // bồ đoàn để chánh điện có người tụng. Máy realtime phát vị trí qua room.moves như người thật.
    // Số bot = đúng số addbot (tối đa max; mỗi bot cần một tên riêng nên phòng ngôn ngữ khác còn bị giới hạn bởi số tên).
    // Bot ngồi không vượt số bồ đoàn còn trống, phần còn lại ra sân.
    max: 200,
    walk: {
      // roam: đi khắp sân theo bản đồ đi lại của scene (máy realtime tìm đường, xem apps/realtime/bot-nav.mjs);
      // waypoints chỉ dùng khi không đọc được scene.
      roam: true,
      count: 6,
      initial: 2,
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
    // Bot làm vườn: bot đi dạo tới điểm (0, 62) hoặc (0, 74) thì có chance khả năng rẽ vào Vườn Công Đức (mỗi phòng
    // tối đa một bot mỗi cooldownMs). API chọn việc (hái → tưới → gieo) và giữ trần bot chiếm 30% số luống.
    garden: { chance: 0.6, cooldownMs: [40_000, 90_000], workMs: 4_000, perVisit: 3 },
    names: THIEN_VI_BOT_NAMES,
    lines: ['Nam mô A Di Đà Phật', 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật', 'Nam mô Đại Bi Quán Thế Âm Bồ Tát', 'Nguyện cầu bình an cho gia đình', 'Cầu cho cha mẹ được khỏe mạnh', 'Nguyện đem công đức này hướng về khắp tất cả'],
    // Bot đi dạo ngoài sân nói chuyện đời thường thay vì chỉ niệm Phật: câu lẻ (`lines`), đối đáp giữa hai bot đứng
    // gần nhau (`dialogues`, {name} là tên người nghe) và câu chào lại người thật vừa chào cả sân (`greetBack`).
    talk: {
      lines: ['Sân chùa hôm nay mát ghê', 'Hoa sen ngoài hồ nở đẹp quá', 'Ai cho cá koi ăn chưa nhỉ?', 'Đi dạo một vòng cho nhẹ người', 'Lâu lắm rồi mới lên chùa', 'Tối nay có giảng pháp không mọi người?', 'Nghe tiếng chuông thấy yên lòng thật', 'Để mình đi quét sân phụ một tay', 'Mới đi làm về, ghé chùa ngồi chút', 'Cây bồ đề này chắc lâu năm lắm rồi', 'Mọi người ăn cơm chưa?', 'Ở đây yên tĩnh, thích ghê', 'Đi một vòng mỏi chân luôn 😅', 'Trà sen ở chùa thơm thật', 'Ai rảnh thắp đèn lồng với mình không?', 'Nam mô A Di Đà Phật 🙏'],
      dialogues: [
        ['{name} ơi, hôm nay rảnh ghé chùa hả?', 'Dạ, cuối tuần nên lên ngồi chút cho thong thả', 'Vậy lát đi dạo chung nha'],
        ['Bạn cho cá ăn chưa?', 'Chưa nè, lát đi chung không?', 'Ok, đợi mình chút'],
        ['Trà ở đây uống thơm ghê', 'Trà sen đó {name}, sư cô ướp kỹ lắm'],
        ['Nhà mình dạo này khỏe không {name}?', 'Dạ cũng ổn, cảm ơn nha', 'Vậy là mừng rồi'],
        ['Lát có ai chơi bầu cua không ta?', 'Chơi vui thôi nha, hết xu là nghỉ 😆'],
        ['Nghe nói tối nay có giảng pháp', 'Vậy để mình ở lại nghe luôn'],
        ['Ủa {name} cũng ở đây hả', 'Hihi trùng hợp ghê', 'Đi một vòng hồ sen không?'],
        ['Đèn lồng thắp lên đẹp quá', 'Tối nhìn càng lung linh nữa {name}'],
        ['Mình mới tập thiền, ngồi yên khó ghê', 'Từ từ thôi {name}, mỗi ngày vài phút là được'],
        ['Hôm nay đi làm mệt quá', 'Lên chùa ngồi chút là nhẹ người liền', 'Đúng vậy đó'],
      ],
      greetBack: ['Chào {name} nha 🙏', 'Chào {name}, mới tới hả?', 'A Di Đà Phật, chào {name}', 'Chào bạn {name}, chúc một ngày an lành'],
    },
    // Phòng theo ngôn ngữ khác: tên và câu tụng của bot đổi theo ngôn ngữ phòng (names/lines ở trên là tiếng Việt).
    byLang: {
      en: {
        names: EN_BOT_NAMES,
        lines: ['Namo Amitabha Buddha', 'Namo Shakyamuni Buddha', 'Namo Avalokiteshvara Bodhisattva', 'May my family be safe and well', 'May my parents be healthy', 'May the merit of this practice reach all beings'],
        talk: {
          lines: ['The courtyard feels so peaceful today', 'The lotus pond looks beautiful', 'Has anyone fed the koi yet?', 'Just taking a slow walk around', 'First time here in a while', 'Is there a dharma talk tonight?', 'That bell sound is so calming', 'Stopping by after work to unwind', 'Anyone want to light the lanterns with me?', 'Namo Amitabha 🙏'],
          dialogues: [
            ['Hey {name}, nice to see you here', 'You too! Weekend visit?', 'Yep, just needed some quiet'],
            ['Did you feed the koi already?', 'Not yet, want to go together?'],
            ['The tea here smells amazing', 'Lotus tea, {name}. So good'],
            ['I just started meditating, sitting still is hard', 'Go easy, {name}. A few minutes a day is enough'],
            ['Long day at work', 'Same. This place helps a lot'],
          ],
          greetBack: ['Hi {name} 🙏', 'Hey {name}, welcome!', 'Hello {name}, have a peaceful day'],
        },
      },
      zh: {
        names: ZH_BOT_NAMES,
        lines: ['南無阿彌陀佛', '南無本師釋迦牟尼佛', '南無大悲觀世音菩薩', '願家人平安吉祥', '願父母身體健康', '願以此功德，普及於一切'],
        talk: {
          lines: ['今天寺院裡好涼快', '荷花池的花開得真美', '有人餵錦鯉了嗎？', '散散步，心情輕鬆多了', '好久沒來寺院了', '今晚有講經嗎？', '聽到鐘聲心裡很平靜', '下班順路來坐一下', '阿彌陀佛 🙏'],
          dialogues: [
            ['{name}，今天也來啦？', '是啊，週末來靜一靜', '等下一起走走吧'],
            ['你餵魚了嗎？', '還沒，一起去吧？'],
            ['這裡的茶好香', '是蓮花茶喔，{name}'],
            ['我剛開始學打坐，好難靜下來', '慢慢來，{name}，每天幾分鐘就好'],
          ],
          greetBack: ['{name} 你好 🙏', '歡迎 {name}！', '阿彌陀佛，{name} 你好'],
        },
      },
      es: {
        names: ES_BOT_NAMES,
        lines: ['Namo Buda Amitabha', 'Namo Buda Shakyamuni', 'Namo Bodhisattva Avalokiteshvara', 'Que mi familia esté en paz', 'Que mis padres tengan salud', 'Que el mérito de esta práctica llegue a todos los seres'],
        talk: {
          lines: ['Qué tranquilo está el patio hoy', 'El estanque de lotos está precioso', '¿Alguien ya alimentó a los koi?', 'Dando un paseo para despejarme', 'Hacía tiempo que no venía', '¿Hay charla de dharma esta noche?', 'El sonido de la campana calma mucho', 'Paso un rato después del trabajo', 'Namo Amitabha 🙏'],
          dialogues: [
            ['Hola {name}, ¿también por aquí?', 'Sí, vine a buscar un poco de paz', 'Luego damos una vuelta juntos'],
            ['¿Ya alimentaste a los peces?', 'Todavía no, ¿vamos juntos?'],
            ['El té de aquí huele muy bien', 'Es té de loto, {name}'],
            ['Empecé a meditar y me cuesta quedarme quieto', 'Con calma, {name}, unos minutos al día bastan'],
          ],
          greetBack: ['Hola {name} 🙏', '¡Bienvenido, {name}!', 'Hola {name}, que tengas un día tranquilo'],
        },
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
  bots: {
    count: 8,
    max: 100,
    initial: 5,
    arrivalMs: [2_000, 7_000],
    actionMs: [1_000, 4_000],
    churnMs: [150_000, 300_000],
    play: 'dice',
    stakes: [1, 5, 10, 20, 50],
    skins: ['pilgrim', 'lotusgirl', 'man', 'woman', 'child', 'granny', 'nun', 'monk'],
    names: VI_BOT_NAMES,
  },
  interaction: {
    game: 'bau-cua',
    bettingMs: 20_000,
    rollingMs: 3_000,
    resultMs: 6_000,
    maxStakePerRound: 1_000,
  },
});

// Tài Xỉu (Sic Bo): cùng khung bàn chung với Bầu Cua (nhịp ván, ví xu, đặt/hủy cược), khác ô cược và cách trả thưởng;
// bàn giữ 10 ván gần nhất để người vào sau xem cầu.
export const TAI_XIU_RULES = defineRoomRules({
  id: 'taixiu',
  activity: 'play-together',
  maxParticipants: 500,
  lang: 'vi',
  moderation: 'standard',
  bots: {
    count: 8,
    max: 100,
    initial: 5,
    arrivalMs: [2_000, 7_000],
    actionMs: [1_000, 4_000],
    churnMs: [150_000, 300_000],
    play: 'dice',
    stakes: [1, 5, 10, 20, 50],
    skins: ['lotusgirl', 'pilgrim', 'woman', 'man', 'granny', 'child', 'nun', 'monk'],
    names: uniqueNames(['Tí Xúc Xắc', 'Mèo May Mắn', 'Sáu Mặt', 'Chấm Đỏ', 'Song Hỷ', 'Tam Hoa', 'Cầu Vồng',
      'Mầm Non', 'May Mắn', 'Tài Lộc', 'Đom Đóm'], VI_BOT_NAMES),
  },
  interaction: {
    game: 'tai-xiu',
    bettingMs: 20_000,
    rollingMs: 3_000,
    resultMs: 6_000,
    maxStakePerRound: 1_000,
    historyRounds: 10,
  },
});

// Oẳn Tù Tì cược (đấu 1–1): mở bàn hoặc bấm "Tìm trận" với một mức cược cố định (stakes, khớp RPS_STAKES ở API),
// cọc trừ ngay khi vào bàn; mỗi lượt pickMs để chọn Kéo / Búa / Bao, server giữ kín tới khi lật. Thắng ăn cả cọc trừ
// phế houseCutPercent; hòa thì đấu lượt mới, hòa maxRounds lượt liền thì hoàn cọc. Không chọn kịp thì thua lượt đó
// (cả hai không chọn: hủy, hoàn cọc). Không có người nhận bàn sau botJoinMs thì một người chơi ảo trong phòng vào đấu
// (chọn ngẫu nhiên đều, chốt trước khi thấy tay người — không gian lận); bot cũng mở sẵn vài bàn (botTables) và đấu
// với nhau cho sảnh có người chơi (trận bot với bot không đụng tới xu).
export const RPS_RULES = defineRoomRules({
  id: 'rps',
  activity: 'play-together',
  maxParticipants: 500,
  lang: 'vi',
  moderation: 'standard',
  bots: {
    count: 14,
    alwaysOn: true,
    max: 100,
    initial: 8,
    arrivalMs: [3_000, 9_000],
    actionMs: [2_000, 6_000],
    churnMs: [180_000, 420_000],
    play: 'rps',
    skins: ['man', 'woman', 'child', 'pilgrim', 'lotusgirl', 'granny', 'monk', 'nun'],
    names: uniqueNames(['Tuấn Kiệt', 'Minh Khang', 'Bảo Ngọc', 'Hoàng Long', 'Thu Trang', 'Quốc Bảo', 'Phương Vy', 'Gia Huy',
      'Khánh Vy', 'Đức Anh', 'Trâm Anh', 'Nhật Nam', 'Thảo Nhi', 'Tiến Đạt', 'Mai Anh', 'Văn Hậu', 'Hồng Nhung', 'Anh Thư'],
    familyFirstNames(['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Võ', 'Huỳnh', 'Đặng', 'Bùi'], ['Hùng', 'Linh', 'Phúc', 'Nhi', 'Tài', 'Vy', 'Khoa', 'Hà'])),
  },
  interaction: {
    game: 'rps',
    stakes: [10, 20, 50, 100, 200],
    readyMs: 2_000,
    pickMs: 5_000,
    revealMs: 2_500,
    rematchMs: 12_000,
    maxRounds: 3,
    houseCutPercent: 5,
    // Bàn của người thật không ai nhận: bot vào trong khoảng này (như có người vừa bấm Tìm trận).
    botJoinMs: [3_000, 9_000],
    // Bàn bot mở sẵn trong sảnh và trận bot với bot (chỉ để sảnh sinh động).
    botTables: [1, 3],
    botTableMs: [20_000, 60_000],
    botMatchMs: [8_000, 20_000],
    // Bàn chờ quá lâu thì tự đóng, hoàn cọc.
    waitMs: 90_000,
  },
});

// Tiến lên miền Nam (phòng tienlen, bàn 2–4 người). Máy realtime chia bài, làm trọng tài, điều khiển bot; API giữ cọc
// từng ván bằng xu ví vườn. Luật đánh và cách tính tiền ở @chanh-dien/tien-len (stakes / modes / depositUnits /
// minCoinsUnits / houseCutPercent dưới đây phải khớp hằng số ở đó). Hai kiểu tính tiền: rank (A: xếp hạng, nhất ăn bét,
// nhì ăn ba) và count (B: đếm lá). Không giữ cọc: ví phải có ít nhất mức cược × minCoinsUnits mới được ngồi bàn (kiểm
// tra lúc vào bàn và đầu mỗi ván), hết ván mới cộng / trừ xu.
export const TIENLEN_RULES = defineRoomRules({
  id: 'tienlen',
  activity: 'play-together',
  maxParticipants: 500,
  lang: 'vi',
  moderation: 'standard',
  bots: {
    count: 18,
    alwaysOn: true,
    max: 120,
    initial: 10,
    arrivalMs: [3_000, 9_000],
    actionMs: [2_000, 6_000],
    churnMs: [240_000, 600_000],
    play: 'tienlen',
    skins: ['man', 'woman', 'child', 'pilgrim', 'lotusgirl', 'granny', 'monk', 'nun'],
    names: uniqueNames(['Thanh Tùng', 'Ngọc Hân', 'Minh Triết', 'Bảo Trâm', 'Đăng Khoa', 'Thùy Dung', 'Quang Vinh', 'Hải Yến',
      'Trọng Nhân', 'Kim Ngân', 'Phúc Thịnh', 'Lan Chi', 'Gia Bảo', 'Mỹ Duyên', 'Tấn Phát', 'Ánh Dương', 'Hữu Nghĩa', 'Diệu Linh'],
    familyFirstNames(['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hồ', 'Vũ', 'Đỗ', 'Ngô'], ['Sang', 'Thư', 'Lộc', 'My', 'Hiếu', 'Uyên', 'Toàn', 'Quyên'])),
  },
  interaction: {
    game: 'tienlen',
    stakes: [20, 50, 100, 200, 500, 1_000, 2_000],
    modes: ['rank', 'count'],
    minCoinsUnits: 10,
    houseCutPercent: 5,
    maxPlayers: 4,
    // Đủ 2 người (có ít nhất một người thật): đếm ngược rồi chia bài; đủ 4 thì chỉ chờ fullStartMs.
    startMs: 10_000,
    fullStartMs: 3_000,
    // Mỗi lượt turnMs; hết giờ thì hệ thống đánh hộ (bỏ lượt, đang mở vòng thì đánh lá nhỏ nhất). Lỡ 2 lượt liên tiếp /
    // mất kết nối thì chuyển hẳn sang tự đánh: lượt chỉ chờ afkTurnMs cho tới khi bấm "Tôi đã quay lại" hoặc tự đánh. Lỡ
    // idleKickMissed lượt liên tiếp thì hết ván phải đứng dậy.
    turnMs: 20_000,
    afkTurnMs: 5_000,
    idleKickMissed: 8,
    // Màn kết quả (đếm ngược rồi tự sang ván mới; có nút Rời bàn).
    resultMs: 10_000,
    botActMs: [900, 2_600],
    // Mỗi ván luôn có ít nhất một bot và chọn lại ngẫu nhiên tổng 2–4 người. Người thật ngồi xuống xong chờ
    // firstDelayMs mới có bot đầu tiên (nhường chỗ cho người), các bot sau cách nhau delayMs cho tới mục tiêu của ván.
    botFill: { always: true, players: [2, 4], firstDelayMs: [5_000, 8_000], delayMs: [1_500, 3_000] },
    // Bàn bot ngồi sẵn trong sảnh (1–3 bot chờ người vào cho có chỗ "Vào nhanh"), mỗi bàn sống botTableMs rồi giải tán.
    botTables: [1, 3],
    botTableMs: [60_000, 150_000],
  },
});

// Shop nhân vật: mua bằng kim cương (💎, chỉ có khi nạp tiền qua Stripe). Người thật không bao giờ được chia ngẫu
// nhiên hình trong PREMIUM_SKINS; máy realtime chỉ nhận avatar.set khi vé vào phòng ghi đã sở hữu. Bot được phép lấy
// danh mục shop đang bật từ API để cảnh có nhiều nhân vật hơn, nhưng không mang quyền sở hữu của tài khoản.
// base: hình khối thay thế khi máy không tải được mô hình .glb (và ảnh 2D).
export const SHOP_ITEMS = deepFreeze([
  // thumb: ảnh chân dung dựng sẵn (shop/cổng hiện ngay, không phải tải three.js và mô hình mới thấy hình).
  { id: 'chibigirl', kind: 'skin', skin: 'chibigirl', base: 'woman', price: 300, thumb: '/models/characters/chibi-girl.webp' },
]);
// Quà đăng nhập: tính tổng số ngày khác nhau đã điểm danh, không bắt buộc liên tiếp. Bé Mũ Đỏ vẫn có thể mua sớm;
// Kiếm Sĩ chỉ nhận từ sự kiện. Quyền sở hữu được ghi chung vào shop_items nên tồn tại vĩnh viễn và không cấp trùng.
export const LOGIN_REWARDS = deepFreeze([
  { days: 3, itemId: 'chibigirl', skin: 'chibigirl', name: 'Bé Mũ Đỏ' },
  { days: 7, itemId: 'swordsman', skin: 'swordsman', name: 'Kiếm Sĩ' },
]);
// Hoàn thành toàn bộ sự kiện còn mở danh hiệu + khung đại diện. Hai id ngắn được mang trong vé
// và room.state; chữ hiển thị dịch ở client để phòng vi/en/zh/es cùng dùng một protocol.
export const LOGIN_ACHIEVEMENT = deepFreeze({
  days: 7,
  id: 'steadfast-practitioner',
  title: 'Hành Giả Bền Tâm',
  frame: 'seven-day-lotus',
  frameName: 'Khung Sen Thất Nhật',
});
export const LOGIN_REWARD_ITEMS = deepFreeze([
  {
    id: 'swordsman', kind: 'skin', skin: 'swordsman', base: 'man', price: 0, rewardOnly: true, rewardDays: 7,
    name: 'Kiếm Sĩ', thumb: '/models/characters/swordsman.svg',
  },
]);
export const PREMIUM_SKINS = Object.freeze([...new Set([
  ...SHOP_ITEMS.filter((item) => item.kind === 'skin').map((item) => item.skin),
  ...LOGIN_REWARD_ITEMS.map((item) => item.skin),
])]);
// Nhân vật admin tải lên ở trang quản trị (mô hình .glb có khung xương, danh mục trong database): mã "shop-<tên>".
// Cùng mẫu với SHOP_SKIN trong @chanh-dien/protocol (hai gói không phụ thuộc nhau; sửa thì sửa cả hai).
export const SHOP_SKIN = /^shop-[a-z0-9-]{2,30}$/;
export const isShopSkin = (skin) => typeof skin === 'string' && SHOP_SKIN.test(skin);
export const isPremiumSkin = (skin) => PREMIUM_SKINS.includes(skin) || isShopSkin(skin);

// Lô Tô chơi chung: mua vé (10 xu, tối đa 2 vé) → máy gọi số 4 giây/số → ai đủ 5 số một hàng tự bấm KINH; kinh đúng
// đầu tiên thì ngừng gọi, chờ claimWindowMs cho người kinh cùng nhịp rồi chia quỹ (phế houseCutPercent). Kinh sai khóa
// nút falseClaimLockMs. Gọi hết 90 số mà không ai kinh thì sau graceAfterLastMs hủy ván, hoàn tiền. Giá / phế thật do
// API giữ (@chanh-dien/garden); ở đây để realtime giữ nhịp và trang hiển thị.
export const LOTO_RULES = defineRoomRules({
  id: 'loto',
  activity: 'play-together',
  maxParticipants: 500,
  lang: 'vi',
  moderation: 'standard',
  bots: {
    // Phòng công cộng luôn có bàn đang chơi: quanh 30 bot. Mở phòng chọn ngẫu nhiên trong 30 ± spread rồi tăng /
    // giảm dần như người ra vào, đông lên buổi tối, vắng lúc khuya (daily, theo GARDEN_TIMEZONE). BOTS_LOTO / addbot
    // riêng vẫn ghi đè con số gốc (0 là tắt). Phòng Lô Tô riêng loại bỏ toàn bộ cấu hình bots này.
    count: 30,
    alwaysOn: true,
    drift: { spread: 12, daily: true, randomStart: true },
    // Mỗi bot một thói quen: có ván ngồi xem không mua (chance = xác suất mua vé mỗi ván), có người hay mua 2 vé
    // (double = xác suất cao nhất mua 2 vé); mua rải rác trong pha mua vé (spread = phần đầu của pha mua vé).
    tickets: { chance: [0.5, 0.95], double: 0.6, spread: 0.85 },
    max: 100,
    initial: 5,
    arrivalMs: [2_000, 7_000],
    actionMs: [1_000, 4_000],
    churnMs: [150_000, 300_000],
    play: 'loto',
    skins: ['pilgrim', 'lotusgirl', 'man', 'woman', 'child', 'granny', 'nun', 'monk'],
    names: uniqueNames(['Lô Tô Vui', 'Bông Sen'], VI_BOT_NAMES),
    lines: ['Chúc mọi người may mắn'],
  },
  interaction: {
    game: 'loto',
    buyMs: 30_000,
    callMs: 4_000,
    claimWindowMs: 3_000,
    resultMs: 8_000,
    graceAfterLastMs: 15_000,
    falseClaimLockMs: 10_000,
    ticketPrice: 10,
    maxTickets: 2,
    // Cần ít nhất 2 người có vé mới bắt đầu gọi số.
    minPlayers: 2,
    autoMarkPrice: 5,
    houseCutPercent: 10,
  },
});

// Phòng Lô Tô riêng của nhóm bạn (mã loto-p-<8 ký tự>): chủ phòng bỏ PRIVATE_LOTO.price xu để mở, mời tối đa
// PRIVATE_LOTO.maxGuests bạn đã lưu (người hoặc bot); không có bot tự vào, chỉ người / bot được mời mới vào được. Phòng
// sống tới khi chủ phòng rời phòng. Danh sách mời do API giữ (apps/api/private-rooms.mjs).
export const PRIVATE_LOTO = deepFreeze({ price: 50, maxGuests: 20 });
// Rạp phim riêng (mã cinema-p-<8 ký tự>): cùng cách mở / mời / đuổi / đóng như Lô Tô riêng, xem chung YouTube với nhóm
// bạn. Mở phim vẫn tốn content.videoPrice 💎 như rạp chung; hàng chờ trống thì chiếu danh sách phát mặc định.
export const PRIVATE_CINEMA = deepFreeze({ price: 50, maxGuests: 20 });
export const PRIVATE_GAMES = deepFreeze({ loto: PRIVATE_LOTO, cinema: PRIVATE_CINEMA });
const PRIVATE_ROOM = /^(loto|cinema)-p-[a-z0-9]{8}$/;
export const isPrivateRoomId = (roomId) => typeof roomId === 'string' && PRIVATE_ROOM.test(roomId);
// loto-p-… → 'loto', cinema-p-… → 'cinema', mã khác → null.
export const privateRoomGame = (roomId) => (isPrivateRoomId(roomId) ? roomId.slice(0, roomId.indexOf('-p-')) : null);
const { bots: _publicLotoBots, ...LOTO_BASE } = LOTO_RULES;
export const LOTO_PRIVATE_RULES = defineRoomRules({
  ...LOTO_BASE,
  id: 'loto-private',
  maxParticipants: PRIVATE_LOTO.maxGuests + 1,
  private: { game: 'loto', ...PRIVATE_LOTO, botSkins: LOTO_RULES.bots.skins },
});
// Rạp riêng: như rạp chung nhưng không có bot tự vào (chỉ bạn bot được chủ phòng mời, ngồi ghế trống).
const { bots: _publicCinemaBots, ...CINEMA_BASE } = CINEMA_RULES;
export const CINEMA_PRIVATE_RULES = defineRoomRules({
  ...CINEMA_BASE,
  id: 'cinema-private',
  // Sức chứa kỹ thuật bằng số ghế của cảnh rạp (rules bắt buộc seats ≤ maxParticipants); số khách thật (maxGuests)
  // do API giữ lúc cấp vé.
  maxParticipants: CINEMA_RULES.seats,
  private: { game: 'cinema', ...PRIVATE_CINEMA, botSkins: CINEMA_RULES.bots.skins },
});

export const ROOM_TYPES = Object.freeze({ cinema: CINEMA_RULES, thien: THIEN_RULES, game: GAME_RULES, taixiu: TAI_XIU_RULES, loto: LOTO_RULES, 'loto-private': LOTO_PRIVATE_RULES, 'cinema-private': CINEMA_PRIVATE_RULES, rps: RPS_RULES, tienlen: TIENLEN_RULES });

// Danh mục phòng công khai. API và máy realtime cùng đọc để biết phòng nào thuộc loại nào.
export const ROOM_CATALOG = deepFreeze([
  { id: 'thien-1', type: 'thien', name: 'Chánh điện' },
  { id: 'cinema-vn', type: 'cinema', name: 'Rạp phim · Việt Nam' },
  { id: 'game-1', type: 'game', name: 'Bầu Cua #1' },
  { id: 'taixiu-1', type: 'taixiu', name: 'Tài Xỉu #1' },
  { id: 'loto-1', type: 'loto', name: 'Lô Tô #1' },
  { id: 'oantuti-1', type: 'rps', name: 'Oẳn Tù Tì #1' },
  { id: 'tienlen-1', type: 'tienlen', name: 'Tiến Lên #1' },
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

// Khu vực của chánh điện: Việt Nam (đứng đầu danh sách) và các tiểu bang Mỹ. Tiểu bang có nhiều múi giờ dùng múi giờ
// của phần đông dân số. Tên giữ US_STATES cho các chỗ đang dùng; mã phòng vẫn dạng thien-<mã>-<ngôn ngữ>-<số>.
export const US_STATES = deepFreeze([
  ['vn', 'Việt Nam', 'Asia/Ho_Chi_Minh'],
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

// Phong cảnh sân chùa theo vùng (KE_HOACH_VUNG.md): mỗi mã của Mỹ thuộc đúng một vùng. Vùng chỉ đổi phần nhìn (chùa
// nhìn từ ngoài, nền đất, núi, cây, trời); bố cục sân giữ nguyên nên bot, trốn tìm, vườn không đổi. Dữ liệu vùng ở
// scenes/thien-default/themes/<vùng>.json, hình dựng ở packages/scene-engine/src/landscape/<vùng>.mjs; vùng chưa có
// dữ liệu thì hiện cảnh gốc ('default', cũng dùng cho mã không có ở đây). Việt Nam có vùng riêng `vietnam` (đồng lúa,
// lũy tre, núi đá vôi).
export const THIEN_THEMES = deepFreeze({
  vietnam: ['vn'],
  desert: ['az', 'nv', 'nm', 'ut'],
  snow: ['ak', 'co', 'mt', 'wy', 'id'],
  tropical: ['fl', 'hi'],
  autumn: ['ct', 'me', 'ma', 'mi', 'mn', 'nh', 'nj', 'ny', 'pa', 'ri', 'vt', 'wi'],
  plains: ['il', 'in', 'ia', 'ks', 'mo', 'ne', 'nd', 'oh', 'ok', 'sd'],
  south: ['al', 'ar', 'ga', 'la', 'ms', 'sc', 'tx'],
  blossom: ['dc', 'de', 'ky', 'md', 'nc', 'tn', 'va', 'wv'],
  pacific: ['or', 'wa'],
  california: ['ca'],
});

export function thienThemeOf(state) {
  for (const [theme, states] of Object.entries(THIEN_THEMES)) if (states.includes(state)) return theme;
  return 'default';
}

// Trời theo giờ thật ở sân chánh điện (packages/scene-engine/src/daylight3d.mjs): [vĩ độ, kinh độ] của nơi đông dân
// hoặc giữa mỗi tiểu bang, chỉ để tính độ cao mặt trời (bình minh, hoàng hôn, đêm) nên không cần chính xác. Cả phòng
// thấy cùng một bầu trời theo nơi đặt chùa, không theo giờ máy người xem.
export const THIEN_PLACES = deepFreeze({
  vn: [16.05, 108.2],
  al: [33.52, -86.8], ak: [61.22, -149.9], az: [33.45, -112.07], ar: [34.75, -92.29], ca: [36.78, -119.42],
  co: [39.74, -104.99], ct: [41.76, -72.67], de: [39.74, -75.55], dc: [38.9, -77.04], fl: [28.54, -81.38],
  ga: [33.75, -84.39], hi: [21.31, -157.86], id: [43.62, -116.2], il: [41.88, -87.63], in: [39.77, -86.16],
  ia: [41.59, -93.62], ks: [37.69, -97.34], ky: [38.25, -85.76], la: [29.95, -90.07], me: [43.66, -70.26],
  md: [39.29, -76.61], ma: [42.36, -71.06], mi: [42.33, -83.05], mn: [44.98, -93.27], ms: [32.3, -90.18],
  mo: [38.58, -92.17], mt: [45.78, -108.5], ne: [41.26, -95.93], nv: [36.17, -115.14], nh: [42.99, -71.46],
  nj: [40.74, -74.17], nm: [35.08, -106.65], ny: [40.71, -74.01], nc: [35.23, -80.84], nd: [46.88, -96.79],
  oh: [39.96, -83], ok: [35.47, -97.52], or: [45.52, -122.68], pa: [40.27, -76.88], ri: [41.82, -71.41],
  sc: [34, -81.03], sd: [43.55, -96.73], tn: [36.16, -86.78], tx: [31.97, -97.74], ut: [40.76, -111.89],
  vt: [44.48, -73.21], va: [37.54, -77.44], wa: [47.61, -122.33], wv: [38.35, -81.63], wi: [43.04, -87.91],
  wy: [41.14, -104.82],
});

export function thienPlaceOf(state) {
  return THIEN_PLACES[state] || null;
}

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
const CINEMA_ROOM = /^cinema-([a-z]{2})$/;
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

export function cinemaRoomId(state) {
  return `cinema-${state}`;
}

// Mỗi quốc gia / tiểu bang có đúng một rạp. `cinema-1` chỉ là bí danh tương thích link cũ và quy về Việt Nam.
export function parseCinemaRoomId(roomId) {
  if (roomId === 'cinema-1') return { state: 'vn' };
  const match = typeof roomId === 'string' && CINEMA_ROOM.exec(roomId);
  if (!match || !US_STATES.some((state) => state.code === match[1])) return null;
  return { state: match[1] };
}

export function cinemaRoomName(roomId) {
  const info = parseCinemaRoomId(roomId);
  const state = info && US_STATES.find((item) => item.code === info.state);
  return state ? `Rạp phim · ${state.name}` : null;
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
  if (parseCinemaRoomId(roomId)) return 'cinema';
  if (isPrivateRoomId(roomId)) return `${privateRoomGame(roomId)}-private`;
  return ROOM_CATALOG.find((room) => room.id === roomId)?.type || null;
}

// Mốc "trong ngày" dùng chung (chat phòng, tin nhắn bạn bè): nửa đêm hôm nay theo múi giờ dự án (GARDEN_TIMEZONE, mặc
// định giờ California). Trả timestamp ms của 00:00 ngày chứa `timestamp`.
export function dayStartOf(timestamp, timeZone = 'America/Los_Angeles') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, Number(part.value)]));
  return timestamp - (((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1_000 + (timestamp % 1_000));
}
