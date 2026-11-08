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
  // Mở phim (thêm video vào hàng chờ) tốn videoPrice kim cương 💎: chỉ thành viên đã đăng nhập, trừ qua sổ API trước khi
  // video vào hàng chờ, không thêm được thì hoàn.
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
  // Scene dùng mã B-1…B-9 (B-1…B-6 ghế đá, B-7…B-9 xích đu / cầu tuột ở khu vui chơi); mỗi món tối đa hai người.
  benches: { count: 13, seatsPerBench: 2 },
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
    bounds: { x: [-52, 52], z: [-2, 100] },
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
      flowers: { x: -25.4, z: 40.75, ry: 1.5708 },
    },
    // Mã thú cố định dùng để realtime từ chối id giả; hình dáng, tên và vị trí vẫn là dữ liệu của scene.
    pets: ['pet-dog-moc', 'pet-dog-nau', 'pet-dog-sua', 'pet-cat-miu', 'pet-cat-may', 'pet-cat-bong', 'pet-dog-milo', 'pet-dog-fox', 'pet-cat-meomeo'],
    petArea: { x: [7.2, 34], z: [77, 97] },
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

// Shop nhân vật: mua bằng kim cương (💎, chỉ có khi nạp tiền qua Stripe). Người thật không bao giờ được chia ngẫu
// nhiên hình trong PREMIUM_SKINS; máy realtime chỉ nhận avatar.set khi vé vào phòng ghi đã sở hữu. Bot được phép lấy
// danh mục shop đang bật từ API để cảnh có nhiều nhân vật hơn, nhưng không mang quyền sở hữu của tài khoản.
// base: hình khối thay thế khi máy không tải được mô hình .glb (và ảnh 2D).
export const SHOP_ITEMS = deepFreeze([
  // thumb: ảnh chân dung dựng sẵn (shop/cổng hiện ngay, không phải tải three.js và mô hình mới thấy hình).
  { id: 'chibigirl', kind: 'skin', skin: 'chibigirl', base: 'woman', price: 300, thumb: '/models/characters/chibi-girl.png' },
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
const PRIVATE_ROOM = /^loto-p-[a-z0-9]{8}$/;
export const isPrivateRoomId = (roomId) => typeof roomId === 'string' && PRIVATE_ROOM.test(roomId);
const { bots: _publicLotoBots, ...LOTO_BASE } = LOTO_RULES;
export const LOTO_PRIVATE_RULES = defineRoomRules({
  ...LOTO_BASE,
  id: 'loto-private',
  maxParticipants: PRIVATE_LOTO.maxGuests + 1,
  private: { game: 'loto', ...PRIVATE_LOTO, botSkins: LOTO_RULES.bots.skins },
});

export const ROOM_TYPES = Object.freeze({ cinema: CINEMA_RULES, thien: THIEN_RULES, game: GAME_RULES, taixiu: TAI_XIU_RULES, loto: LOTO_RULES, 'loto-private': LOTO_PRIVATE_RULES });

// Danh mục phòng công khai. API và máy realtime cùng đọc để biết phòng nào thuộc loại nào.
export const ROOM_CATALOG = deepFreeze([
  { id: 'thien-1', type: 'thien', name: 'Chánh điện' },
  { id: 'cinema-1', type: 'cinema', name: 'Cinema #1' },
  { id: 'game-1', type: 'game', name: 'Bầu Cua #1' },
  { id: 'taixiu-1', type: 'taixiu', name: 'Tài Xỉu #1' },
  { id: 'loto-1', type: 'loto', name: 'Lô Tô #1' },
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
  if (isPrivateRoomId(roomId)) return 'loto-private';
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
