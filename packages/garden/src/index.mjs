// Vườn Công Đức: 50 luống trồng chung cho mọi phòng chánh điện, xu ảo (không đổi ra tiền thật), hạt giống, quả.
// Mọi thay đổi số dư / kho / luống chạy trong một giao dịch SQLite (BEGIN IMMEDIATE) trên cùng file với tài khoản;
// ràng buộc duy nhất trong cơ sở dữ liệu chặn hai người cùng chiếm một luống. Mốc tưới lấy từ đồng hồ
// server (không tin giờ client): lần đầu có thể tưới ngay, các lần sau cách nhau 8 giờ; quá 24 giờ thì cây héo.
//
// Vòng đời một vụ: gieo (growing, 0 lần tưới) → mầm (1) → cây non (2) → tưới đủ 3 lần: ra 10 quả
// (fruiting) → hái hết: harvested, luống trống. Cây héo không bị xóa và tưới lại sẽ hồi phục. Sau khi ra quả đúng
// FRUIT_KEEP_MS, vụ tự expired và luống trống. Lịch sử vụ, tưới, hái, giao dịch xu đều được giữ lại để đối soát.

import { createHash, randomInt } from 'node:crypto';
import { capTransfers, TIENLEN_MAX_PLAYERS, TIENLEN_MODES, TIENLEN_STAKES, tienLenCut, tienLenMinCoins } from '@chanh-dien/tien-len';
export const PLOT_COUNT = 50;
// Bot làm vườn (Phật tử ảo ở các phòng chánh điện) giữ tối đa 30% số luống, phần còn lại luôn để người chơi.
export const BOT_PLOT_SHARE = 0.3;
export const BOT_PLOT_LIMIT = Math.round(PLOT_COUNT * BOT_PLOT_SHARE);
export const WATER_DAYS_TO_FRUIT = 3;
export const FRUITS_PER_CROP = 10;
export const VISITOR_HARVEST_LIMIT = 2;
export const STARTING_COINS = 50;
export const CHORE_REWARD_COINS = 20;
export const CHORE_REWARD_DAILY_LIMIT = 3;
// Trốn tìm: bên thắng nhận HIDESEEK_REWARD_COINS xu, tối đa HIDESEEK_REWARD_DAILY_LIMIT lần mỗi ngày (theo ngày của vườn).
export const HIDESEEK_REWARD_COINS = 10;
export const HIDESEEK_REWARD_DAILY_LIMIT = 5;
export const CHORE_REWARD_KINDS = Object.freeze(['sweep', 'water', 'light', 'feed', 'clean', 'tea']);
export const WATER_INTERVAL_MS = 8 * 60 * 60 * 1_000;
export const WILT_AFTER_MS = 24 * 60 * 60 * 1_000;
export const FRUIT_KEEP_MS = 24 * 60 * 60 * 1_000;
export const MAX_ITEMS_PER_REQUEST = 20;
// Khu tưởng niệm: 36 ô mộ, đắp một mộ tốn 100 xu, giữ 24 giờ rồi ô trống lại. Tên trên bia 1–24 ký tự.
export const GRAVE_COUNT = 36;
export const GRAVE_PRICE = 100;
export const GRAVE_TTL_MS = 24 * 60 * 60 * 1_000;
export const GRAVE_NAME_MAX = 24;
// Bỏ ký tự điều khiển / định dạng vô hình, gộp khoảng trắng. Trả '' nếu không hợp lệ (rỗng, quá dài).
export function cleanGraveName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return name && [...name].length <= GRAVE_NAME_MAX ? name : '';
}
// Linh thú (Cá Chép, Rùa, Hạc, Sư tử): nhận nuôi bằng kim cương (ví shop, API trừ trước; giá admin đặt, `price` ở đây
// chỉ là giá khởi tạo), nuôi bằng xu. Không phạt khi vắng: linh thú no (≤ PET_FULL_MS từ bữa cuối) đào đủ xu, hơi đói
// (≤ PET_HUNGRY_MS) đào một nửa, lâu hơn thì ngủ (không đào, không mất gì; cho ăn bữa thường là thức dậy). Xu dồn vào
// rương, đầy sau PET_CHEST_HOURS giờ thì ngừng — phải vào nhận. Mỗi ngày (theo ngày của vườn) cho ăn được một bữa; số
// ngày được cho ăn quyết định cấp (PET_LEVEL_DAYS), mỗi cấp đào nhanh thêm PET_LEVEL_BONUS %. Xu tính theo phần trăm xu
// (centi) để cộng dồn từng phút không mất phần lẻ.
//
// Cân bằng (người chơi miễn phí chăm chỉ kiếm ~120 xu/ngày: nhiệm vụ 35, công việc 60, vườn ~25):
//   - rate: centi-xu/giờ ở cấp 1, tăng chậm hơn giá (con đắt đào nhiều hơn nhưng không tỉ lệ thuận) → vào mỗi ngày lãi
//     ròng 14 (Cá Chép, Rùa) / 19 (Hạc) / 24 (Sư tử) xu/ngày ở cấp 1, 21 / 28 / 34 ở cấp 10.
//   - Nuôi đủ 4 con cấp 10, vào mỗi ngày: ~100 xu/ngày < thu nhập miễn phí, người không mua không bị bỏ xa.
//   - Vào mỗi ngày lãi hơn 2 ngày / lần ~5–8 xu/ngày (đáng để quay lại), vắng lâu lãi ít hơn nhưng không bao giờ âm.
//   - Rương 30 giờ để người vào giờ khác nhau mỗi ngày không mất phần đào.
// Đổi các con số này thì chạy lại test "cân bằng xu" (apps/api/test/pets.test.mjs) — nó mô phỏng bằng code thật.
export const SPIRIT_PETS = Object.freeze({
  carp: Object.freeze({ price: 200, rate: 80 }),
  turtle: Object.freeze({ price: 200, rate: 80 }),
  crane: Object.freeze({ price: 300, rate: 100 }),
  lion: Object.freeze({ price: 400, rate: 120 }),
});
export const PET_FOOD_PRICE = 5;
export const PET_FULL_MS = 24 * 60 * 60 * 1_000;
export const PET_HUNGRY_MS = 48 * 60 * 60 * 1_000;
export const PET_CHEST_HOURS = 30;
export const PET_LEVEL_BONUS = 4;
// Cấp n cần PET_LEVEL_DAYS[n − 1] ngày được cho ăn (cấp 1 khi vừa nhận, tối đa cấp 10).
export const PET_LEVEL_DAYS = Object.freeze([0, 1, 3, 6, 10, 15, 21, 28, 36, 45]);
export const PET_NAME_MAX = 20;
// Tốc độ đào (centi-xu / giờ) của một loài ở một cấp: cấp 10 nhanh hơn cấp 1 là 36%.
export const petRate = (species, level) => Math.round(((SPIRIT_PETS[species]?.rate ?? 0) * (100 + PET_LEVEL_BONUS * (Math.max(1, level) - 1))) / 100);
export const petLevel = (fedDays) => PET_LEVEL_DAYS.filter((days) => fedDays >= days).length;
export function cleanPetName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return name && [...name].length <= PET_NAME_MAX ? name : '';
}
export const PLANTS = Object.freeze({
  apple: Object.freeze({ seedPrice: 10, fruitPrice: 5 }),
  orange: Object.freeze({ seedPrice: 15, fruitPrice: 7 }),
  peach: Object.freeze({ seedPrice: 20, fruitPrice: 10 }),
});
const STAGES = ['seed', 'sprout', 'young'];
// Bầu Cua Tôm Cá ở phòng game (chơi chung, thời gian thực): cược bằng xu của ví (xu bán trái cây), 1 xu cược = 1 xu
// ví. Máy realtime giữ nhịp ván và lắc; API (ở đây) giữ tiền: đặt cược trừ ngay, trả thưởng cả ván một lần. Ván treo
// quá BAU_CUA_STALE_MS (máy realtime chết giữa ván) thì hoàn cược.
export const BAU_CUA_ANIMALS = Object.freeze(['nai', 'bau', 'ga', 'ca', 'cua', 'tom']);
export const BAU_CUA_MAX_STAKE = 1_000;
export const BAU_CUA_STALE_MS = 3 * 60_000;
// Tài Xỉu (Sic Bo) chung khung với Bầu Cua: cùng bảng cược / sổ ván, khác ô cược và cách trả thưởng. Mã ván cho biết
// trò: "bc-…" Bầu Cua, "tx-…" Tài Xỉu.
//   xiu / tai: tổng 4–10 / 11–17, ăn 1:1, thua khi ra bộ ba (ba mặt giống nhau)
//   t4 … t17: đúng tổng điểm, ăn theo TAI_XIU_TOTAL_ODDS
//   f1 … f6: mặt đó ra k con, ăn 1:k (như Bầu Cua)
export const TAI_XIU_TOTAL_ODDS = Object.freeze({ 4: 50, 5: 18, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 18, 17: 50 });
export const TAI_XIU_SPOTS = Object.freeze(['xiu', 'tai', ...Object.keys(TAI_XIU_TOTAL_ODDS).map((sum) => `t${sum}`), ...[1, 2, 3, 4, 5, 6].map((face) => `f${face}`)]);
const ROUND_ID = /^(bc|tx)-[a-z0-9-]{4,76}$/;

// Oẳn Tù Tì cược (phòng oantuti, đấu 1–1): mỗi bên đặt cùng một mức cược RPS_STAKES vào cọc (trừ xu ngay khi vào
// bàn), máy realtime làm trọng tài rồi chốt trận ở đây: người thắng nhận cả cọc trừ phế RPS_HOUSE_CUT_PERCENT; hòa /
// hủy thì hoàn cọc, không phế. Đấu với bot: phía bot không có cọc thật — hệ thống là bên đối ứng (người thắng nhận
// cọc mình + phần của bot trừ phế, thua thì mất cọc). Trận treo quá RPS_STALE_MS thì hoàn cọc.
export const RPS_STAKES = Object.freeze([10, 20, 50, 100, 200]);
export const RPS_HOUSE_CUT_PERCENT = 5;
export const RPS_STALE_MS = 5 * 60_000;
// Việc trong phòng được trả bằng xu (spendCoins).
export const ROOM_SPEND_REASONS = Object.freeze(['cinema_video']);
// Đặt cược / mua vé chỉ dọn ván treo tối đa mỗi 30 giây một lần (xem staleScanner).
const STALE_SCAN_MS = 30_000;
const RPS_MATCH_ID = /^rp-[a-z0-9-]{4,76}$/;
// Tiền người thắng nhận từ cọc 2 × stake (phế làm tròn xuống, mức cược nào cũng chia hết).
export const rpsPrize = (stake) => 2 * stake - Math.floor((2 * stake * RPS_HOUSE_CUT_PERCENT) / 100);

// Tiến lên (phòng tienlen, bàn 2–4 người, mã ván tl-…). Không giữ cọc: ví phải có ít nhất tienLenMinCoins(mức cược) mới
// được ngồi bàn (máy realtime hỏi lúc vào bàn và đầu mỗi ván, đầu ván thì ghi tên người chơi vào ván). Hết ván máy realtime
// gửi các khoản phải trả (đã tính theo luật @chanh-dien/tien-len); ở đây mới trừ / cộng ví: ai phải trả nhiều hơn số xu
// đang có thì chỉ trả hết số đó (người nhận nhận ít đi tương ứng); phế TIENLEN_HOUSE_CUT_PERCENT trên phần thắng. Phía bot
// (null) do hệ thống trả / nhận.
const TIENLEN_MATCH_ID = /^tl-[a-z0-9-]{4,76}$/;
const TIENLEN_MAX_TRANSFERS = 64;

// Lô Tô chơi chung: mua vé (lưới 3 × 9, mỗi hàng 5 số 1–90) bằng xu, máy realtime gọi số, ai kinh (đủ 5 số một
// hàng) thì thắng và kết thúc ván. Tiền vé gom vào quỹ; người kinh nhận quỹ trừ phế, nhiều vé kinh cùng nhịp thì chia
// đều (làm tròn xuống, phần lẻ vào phế). Tự động đánh dấu (VIP) là tiện ích, tiền vào phế, không vào quỹ. Vé do server
// tạo và giữ; kinh được kiểm tra lại ở đây theo vé gốc + số đã gọi. Ván treo quá LOTTO_STALE_MS thì hoàn tiền.
export const LOTTO_TICKET_PRICE = 10;
export const LOTTO_MAX_TICKETS = 2;
export const LOTTO_AUTO_MARK_PRICE = 5;
export const LOTTO_HOUSE_CUT_PERCENT = 10;
export const LOTTO_STALE_MS = 12 * 60_000;
const LOTTO_ROUND_ID = /^lt-[a-z0-9-]{4,76}$/;
// Cột k chứa số 10k…10k+9 (cột đầu 1–9, cột cuối 80–90).
const LOTTO_COLUMNS = Array.from({ length: 9 }, (_, column) => [column === 0 ? 1 : column * 10, column === 8 ? 90 : column * 10 + 9]);
// Nhiệm vụ hằng ngày (theo ngày của vườn): làm xong thì bấm nhận xu, mỗi nhiệm vụ một lần mỗi ngày. Server tự kiểm
// tra lịch sử vườn và đóng góp công trình chung; `location` chỉ là hướng dẫn UI, không dùng để xác nhận hoàn thành.
export const DAILY_QUESTS = Object.freeze([
  Object.freeze({ id: 'checkin', reward: 5, location: 'hall' }),
  Object.freeze({ id: 'plant', reward: 5, location: 'garden' }),
  Object.freeze({ id: 'water', reward: 5, location: 'garden' }),
  Object.freeze({ id: 'harvest', reward: 5, location: 'garden' }),
  Object.freeze({ id: 'offer', reward: 5, location: 'hall' }),
  Object.freeze({ id: 'bodhi', reward: 5, location: 'courtyard' }),
  Object.freeze({ id: 'lotus', reward: 5, location: 'courtyard' }),
]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_MS = 86_400_000;

// Tên bot giống tên hiện trên đầu nhân vật (1–40 ký tự, không ký tự điều khiển); mã tài khoản suy ra từ tên nên cùng
// một bot ở các phòng khác nhau chung một chủ luống.
const validBotName = (name) => typeof name === 'string' && name.trim() === name && name.length >= 1 && name.length <= 40
  && !/[\u0000-\u001f\u007f]/.test(name);
export const botAccountId = (name) => `gbot-${createHash('sha256').update(String(name)).digest('hex').slice(0, 20)}`;

export class GardenError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Ngày (YYYY-MM-DD) theo múi giờ của vườn.
export function gardenDay(timestamp, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS garden_plots (
    id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 10),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS crop_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_id INTEGER NOT NULL REFERENCES garden_plots(id),
    owner_account TEXT NOT NULL REFERENCES accounts(id),
    plant_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('growing', 'fruiting', 'harvested', 'expired')),
    water_days INTEGER NOT NULL DEFAULT 0,
    last_water_day TEXT,
    planted_day TEXT NOT NULL,
    fruits_total INTEGER NOT NULL DEFAULT 0,
    fruits_left INTEGER NOT NULL DEFAULT 0 CHECK (fruits_left >= 0),
    planted_at INTEGER NOT NULL,
    fruiting_day TEXT,
    ended_at INTEGER
  );
  -- Mỗi luống chỉ có một vụ đang trồng: người gieo thứ hai cùng lúc bị cơ sở dữ liệu từ chối.
  CREATE UNIQUE INDEX IF NOT EXISTS crop_cycles_active_plot ON crop_cycles(plot_id) WHERE status IN ('growing', 'fruiting');
  CREATE INDEX IF NOT EXISTS crop_cycles_owner ON crop_cycles(owner_account, status);
  CREATE TABLE IF NOT EXISTS crop_watering_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id INTEGER NOT NULL REFERENCES crop_cycles(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    day TEXT NOT NULL,
    counted INTEGER NOT NULL CHECK (counted IN (0, 1)),
    at INTEGER NOT NULL
  );
  -- Một lần tưới được tính cho mỗi luống mỗi ngày.
  CREATE UNIQUE INDEX IF NOT EXISTS crop_watering_counted_day ON crop_watering_events(crop_id, day) WHERE counted = 1;
  CREATE UNIQUE INDEX IF NOT EXISTS crop_watering_account_day ON crop_watering_events(crop_id, account_id, day);
  CREATE TABLE IF NOT EXISTS crop_harvest_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id INTEGER NOT NULL REFERENCES crop_cycles(id),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    is_owner INTEGER NOT NULL CHECK (is_owner IN (0, 1)),
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS crop_harvest_crop_account ON crop_harvest_events(crop_id, account_id);
  CREATE TABLE IF NOT EXISTS seed_inventory (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    plant_type TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (account_id, plant_type)
  );
  CREATE TABLE IF NOT EXISTS fruit_inventory (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    plant_type TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (account_id, plant_type)
  );
  CREATE TABLE IF NOT EXISTS coin_wallets (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    balance INTEGER NOT NULL CHECK (balance >= 0),
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coin_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS fruit_offerings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    plant_type TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fruit_offerings_account ON fruit_offerings(account_id, id DESC);
  -- Khóa idempotency: gửi lại cùng khóa thì trả nguyên kết quả cũ, không trừ / cộng lần hai.
  CREATE TABLE IF NOT EXISTS garden_requests (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    idem_key TEXT NOT NULL,
    action TEXT NOT NULL,
    response TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, idem_key)
  );`,
  `ALTER TABLE crop_cycles ADD COLUMN last_water_at INTEGER;
  UPDATE crop_cycles
    SET last_water_at = (SELECT MAX(at) FROM crop_watering_events WHERE crop_id = crop_cycles.id)
    WHERE last_water_at IS NULL;
  DROP INDEX IF EXISTS crop_watering_counted_day;
  DROP INDEX IF EXISTS crop_watering_account_day;
  CREATE INDEX IF NOT EXISTS crop_watering_crop_time ON crop_watering_events(crop_id, at DESC);`,
  // Phòng game: thêm loại giao dịch cược/thắng (SQLite không sửa được CHECK nên dựng lại bảng, giữ nguyên dữ liệu)
  // và bảng ván chơi để đối soát.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS game_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    game TEXT NOT NULL,
    bets TEXT NOT NULL,
    dice TEXT NOT NULL,
    staked INTEGER NOT NULL CHECK (staked > 0),
    payout INTEGER NOT NULL CHECK (payout >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS game_rounds_account ON game_rounds(account_id, id DESC);`,
  // Nhiệm vụ hằng ngày: thêm loại giao dịch "quest" (dựng lại bảng như trên) và bảng ghi đã nhận.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'quest')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS quest_claims (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    day TEXT NOT NULL,
    quest TEXT NOT NULL,
    reward INTEGER NOT NULL CHECK (reward > 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, day, quest)
  );`,
  // Bầu Cua chơi chung: cược theo ván (cộng dồn theo linh vật), ván đã chốt (trả thưởng hoặc hủy), loại giao dịch hoàn cược.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS bau_cua_stakes (
    round_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    animal TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (round_id, account_id, animal)
  );
  CREATE INDEX IF NOT EXISTS bau_cua_stakes_time ON bau_cua_stakes(at);
  CREATE TABLE IF NOT EXISTS bau_cua_rounds (
    round_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('settled', 'void')),
    dice TEXT,
    results TEXT NOT NULL,
    at INTEGER NOT NULL
  );`,
  // Công việc trong chùa: mỗi loại được thưởng tối đa 3 lần/ngày. Sự kiện hoàn thành có khóa duy nhất để máy
  // realtime gửi lại sau lỗi mạng cũng không thể cộng xu hai lần.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS chore_reward_events (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    event_key TEXT NOT NULL,
    day TEXT NOT NULL,
    chore TEXT NOT NULL CHECK (chore IN ('sweep', 'water', 'light', 'feed', 'clean', 'tea')),
    reward INTEGER NOT NULL CHECK (reward = ${CHORE_REWARD_COINS}),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, event_key)
  );
  CREATE INDEX IF NOT EXISTS chore_reward_daily ON chore_reward_events(account_id, day, chore);`,
  // Điều chỉnh ví bởi kênh quản trị đã xác thực (Telegram). Vẫn đi qua sổ giao dịch và khóa idempotency.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);`,
  // Lô Tô chơi chung: vé của từng ván (do server tạo), tiện ích tự đánh dấu, ván đã chốt / hủy.
  `CREATE TABLE IF NOT EXISTS lotto_tickets (
    round_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    ticket_no INTEGER NOT NULL CHECK (ticket_no BETWEEN 1 AND 9),
    numbers TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (round_id, account_id, ticket_no)
  );
  CREATE INDEX IF NOT EXISTS lotto_tickets_time ON lotto_tickets(at);
  CREATE TABLE IF NOT EXISTS lotto_auto_marks (
    round_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    price INTEGER NOT NULL CHECK (price >= 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (round_id, account_id)
  );
  CREATE TABLE IF NOT EXISTS lotto_rounds (
    round_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('settled', 'void')),
    result TEXT NOT NULL,
    at INTEGER NOT NULL
  );`,
  // Mở phòng Lô Tô riêng cho nhóm bạn (trừ xu chủ phòng): thêm loại giao dịch "private_room".
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment', 'private_room')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);`,
  // Mở rộng vườn lên 50 luống: dựng lại bảng luống với giới hạn id mới (chạy khi tắt khóa ngoại, xem bên dưới),
  // vụ trồng cũ giữ nguyên số luống.
  `CREATE TABLE garden_plots_new (
    id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND ${PLOT_COUNT}),
    created_at INTEGER NOT NULL
  );
  INSERT INTO garden_plots_new SELECT id, created_at FROM garden_plots;
  DROP TABLE garden_plots;
  ALTER TABLE garden_plots_new RENAME TO garden_plots;`,
  // Khu tưởng niệm: mộ đắp bằng xu (loại giao dịch "memorial"), mỗi ô tối đa một mộ còn hạn.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment', 'private_room', 'memorial')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS memorial_graves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND ${GRAVE_COUNT}),
    name TEXT NOT NULL,
    builder_account TEXT NOT NULL REFERENCES accounts(id),
    built_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    removed_at INTEGER,
    removed_by TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS memorial_graves_slot ON memorial_graves(slot) WHERE removed_at IS NULL;`,
  // Linh thú: thức ăn (pet_food) và xu nhận từ rương (pet_yield); mỗi tài khoản nuôi được mỗi loài một con.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment', 'private_room', 'memorial', 'pet_food', 'pet_yield')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS spirit_pets (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    species TEXT NOT NULL,
    name TEXT NOT NULL,
    adopted_at INTEGER NOT NULL,
    fed_at INTEGER NOT NULL,
    fed_day TEXT,
    fed_days INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    bank INTEGER NOT NULL DEFAULT 0 CHECK (bank >= 0),
    accrued_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, species)
  );`,
  // Linh thú đang dẫn theo ngoài sân (mỗi tài khoản tối đa một con).
  `CREATE TABLE IF NOT EXISTS spirit_pet_companion (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    species TEXT NOT NULL
  );`,
  // Oẳn Tù Tì cược: cọc của từng người trong trận (một dòng / người / trận) và trận đã chốt.
  `CREATE TABLE IF NOT EXISTS rps_stakes (
    match_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    at INTEGER NOT NULL,
    PRIMARY KEY (match_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS rps_stakes_time ON rps_stakes(at);
  CREATE TABLE IF NOT EXISTS rps_matches (
    match_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('settled', 'void')),
    results TEXT NOT NULL,
    at INTEGER NOT NULL
  );`,
  // Tiêu xu trong phòng (mở phim ở rạp…): room_spend; hoàn khi phòng không làm được việc đã trả (hủy phim, rạp đóng):
  // room_refund. coin_spends giữ khóa chống trừ hai lần cho cùng một lần bấm, hoàn tối đa một lần.
  `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment', 'private_room', 'memorial', 'pet_food', 'pet_yield', 'room_spend', 'room_refund')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS coin_spends (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    idem_key TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    ref TEXT NOT NULL,
    refunded INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, idem_key)
  );`,
  // Tiến lên: người thật trong từng ván (một dòng / người / ván, không giữ tiền) và ván đã chốt (kết quả từng người).
  `CREATE TABLE IF NOT EXISTS tienlen_players (
    match_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    stake INTEGER NOT NULL CHECK (stake > 0),
    mode TEXT NOT NULL CHECK (mode IN ('rank', 'count')),
    at INTEGER NOT NULL,
    PRIMARY KEY (match_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS tienlen_players_time ON tienlen_players(at);
  CREATE TABLE IF NOT EXISTS tienlen_matches (
    match_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('settled', 'void')),
    results TEXT NOT NULL,
    at INTEGER NOT NULL
  );`,
  // Mốc ra quả chính xác theo giờ server. Vụ cũ lấy lần tưới thứ ba (lúc chuyển sang fruiting); nếu dữ liệu rất cũ
  // thiếu sự kiện thì dùng mốc tưới cuối / gieo làm phương án an toàn.
  `ALTER TABLE crop_cycles ADD COLUMN fruiting_at INTEGER;
  UPDATE crop_cycles
    SET fruiting_at = COALESCE(
      (SELECT at FROM crop_watering_events WHERE crop_id = crop_cycles.id ORDER BY at LIMIT 1 OFFSET 2),
      last_water_at,
      planted_at
    )
    WHERE status = 'fruiting' AND fruiting_at IS NULL;`,
];

// Trả thưởng một ván Tài Xỉu. bets: { ô cược: xu }, dice: 3 số 1–6. Trúng: nhận lại gốc + cược × tỷ lệ.
export function settleTaiXiu(bets, dice) {
  const sum = dice.reduce((total, face) => total + face, 0);
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  let staked = 0;
  let payout = 0;
  for (const [spot, amount] of Object.entries(bets)) {
    staked += amount;
    let odds = 0;
    if (spot === 'xiu') odds = !triple && sum <= 10 ? 1 : 0;
    else if (spot === 'tai') odds = !triple && sum >= 11 ? 1 : 0;
    else if (spot.startsWith('t')) odds = Number(spot.slice(1)) === sum ? TAI_XIU_TOTAL_ODDS[sum] : 0;
    else if (spot.startsWith('f')) odds = dice.filter((face) => face === Number(spot.slice(1))).length;
    if (odds) payout += amount + amount * odds;
  }
  return { staked, payout, net: payout - staked, sum, triple };
}

// Vé Lô Tô: 3 hàng × 9 cột, mỗi hàng 5 số (0 = ô trống), cột nào cũng có ít nhất một số, số trong cột tăng dần từ trên
// xuống. random(n) → số nguyên 0…n−1 (crypto.randomInt ở server).
export function createLottoTicket(random = randomInt) {
  const pick = (list, count) => {
    const pool = [...list];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const other = random(index + 1);
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    return pool.slice(0, count);
  };
  const columns = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let layout;
  do layout = [0, 1, 2].map(() => pick(columns, 5));
  while (!columns.every((column) => layout.some((row) => row.includes(column))));
  const rows = [0, 1, 2].map(() => Array(9).fill(0));
  for (const column of columns) {
    const used = [0, 1, 2].filter((row) => layout[row].includes(column));
    const [low, high] = LOTTO_COLUMNS[column];
    const numbers = pick(Array.from({ length: high - low + 1 }, (_, index) => low + index), used.length).sort((a, b) => a - b);
    used.forEach((row, index) => { rows[row][column] = numbers[index]; });
  }
  return rows;
}

// Hàng row của vé đã đủ 5 số trong danh sách số đã gọi chưa.
export const lottoRowComplete = (rows, row, called) => {
  const set = called instanceof Set ? called : new Set(called);
  return Array.isArray(rows?.[row]) && rows[row].filter(Boolean).length === 5 && rows[row].every((number) => !number || set.has(number));
};

// Mỗi trò xúc xắc: ô cược hợp lệ, mặt xúc xắc hợp lệ, cách trả thưởng, tên ghi sổ (game_rounds.game).
const DICE_GAMES = {
  bc: { name: 'bau_cua', spots: BAU_CUA_ANIMALS, face: (item) => BAU_CUA_ANIMALS.includes(item), settle: (bets, dice) => settleBauCua(bets, dice) },
  tx: { name: 'tai_xiu', spots: TAI_XIU_SPOTS, face: (item) => Number.isSafeInteger(item) && item >= 1 && item <= 6, settle: (bets, dice) => settleTaiXiu(bets, dice) },
};
const gameOfRound = (roundId) => DICE_GAMES[roundId.slice(0, 2)];

// Trả thưởng một ván Bầu Cua. bets: { linh vật: xu }, dice: 3 linh vật. Linh vật có cược xuất hiện k lần: nhận lại
// tiền gốc + cược × k; không xuất hiện: mất cược. Trả { staked, payout, net, hits }.
export function settleBauCua(bets, dice) {
  const hits = {};
  for (const id of dice) hits[id] = (hits[id] || 0) + 1;
  let staked = 0;
  let payout = 0;
  for (const [id, amount] of Object.entries(bets)) {
    staked += amount;
    if (hits[id]) payout += amount + amount * hits[id];
  }
  return { staked, payout, net: payout - staked, hits };
}

// db: kết nối DatabaseSync đã có bảng accounts (dùng chung với @chanh-dien/accounts).
export function createGardenStore({ db, now = Date.now, timeZone = 'America/Los_Angeles' }) {
  db.exec('CREATE TABLE IF NOT EXISTS garden_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const version = Number(db.prepare("SELECT value FROM garden_meta WHERE key = 'schema_version'").get()?.value || 0);
  // Dựng lại bảng đang được bảng khác tham chiếu (garden_plots) phải tắt khóa ngoại trong lúc đổi (quy trình 12 bước
  // của SQLite); PRAGMA này không đổi được trong giao dịch nên đặt trước, kiểm tra lại khóa ngoại trước khi commit.
  if (version < MIGRATIONS.length) db.exec('PRAGMA foreign_keys = OFF;');
  try {
    for (let index = version; index < MIGRATIONS.length; index += 1) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(MIGRATIONS[index]);
        if (db.prepare('PRAGMA foreign_key_check(crop_cycles)').all().length) throw new Error('garden migration broke foreign keys');
        db.prepare("INSERT INTO garden_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(index + 1));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  const insertPlot = db.prepare('INSERT OR IGNORE INTO garden_plots (id, created_at) VALUES (?, ?)');
  for (let id = 1; id <= PLOT_COUNT; id += 1) insertPlot.run(id, now());

  const q = {
    account: db.prepare('SELECT id, display_name AS displayName FROM accounts WHERE id = ?'),
    active: db.prepare(`SELECT c.*, a.display_name AS owner_name FROM crop_cycles c JOIN accounts a ON a.id = c.owner_account
      WHERE c.plot_id = ? AND c.status IN ('growing', 'fruiting')`),
    activeAll: db.prepare(`SELECT c.*, a.display_name AS owner_name FROM crop_cycles c JOIN accounts a ON a.id = c.owner_account
      WHERE c.status IN ('growing', 'fruiting')`),
    insertCrop: db.prepare(`INSERT INTO crop_cycles (plot_id, owner_account, plant_type, status, planted_day, planted_at)
      VALUES (?, ?, ?, 'growing', ?, ?)`),
    endCrop: db.prepare('UPDATE crop_cycles SET status = ?, ended_at = ? WHERE id = ?'),
    waterCrop: db.prepare('UPDATE crop_cycles SET water_days = water_days + ?, last_water_day = ?, last_water_at = ? WHERE id = ?'),
    fruitCrop: db.prepare("UPDATE crop_cycles SET status = 'fruiting', fruits_total = ?, fruits_left = ?, fruiting_day = ?, fruiting_at = ? WHERE id = ?"),
    takeFruit: db.prepare('UPDATE crop_cycles SET fruits_left = fruits_left - ? WHERE id = ? AND fruits_left >= ?'),
    waterEvent: db.prepare('INSERT INTO crop_watering_events (crop_id, account_id, day, counted, at) VALUES (?, ?, ?, ?, ?)'),
    harvestEvent: db.prepare('INSERT INTO crop_harvest_events (crop_id, account_id, quantity, is_owner, at) VALUES (?, ?, ?, ?, ?)'),
    harvestedBy: db.prepare('SELECT COALESCE(SUM(quantity), 0) AS n FROM crop_harvest_events WHERE crop_id = ? AND account_id = ?'),
    wallet: db.prepare('SELECT balance FROM coin_wallets WHERE account_id = ?'),
    insertWallet: db.prepare('INSERT INTO coin_wallets (account_id, balance, updated_at) VALUES (?, ?, ?)'),
    setBalance: db.prepare('UPDATE coin_wallets SET balance = ?, updated_at = ? WHERE account_id = ?'),
    coinTx: db.prepare('INSERT INTO coin_transactions (account_id, amount, balance_after, kind, plant_type, quantity, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    seeds: db.prepare('SELECT plant_type AS plantType, quantity FROM seed_inventory WHERE account_id = ? AND quantity > 0'),
    seed: db.prepare('SELECT quantity FROM seed_inventory WHERE account_id = ? AND plant_type = ?'),
    addSeed: db.prepare(`INSERT INTO seed_inventory (account_id, plant_type, quantity) VALUES (?, ?, ?)
      ON CONFLICT(account_id, plant_type) DO UPDATE SET quantity = quantity + excluded.quantity`),
    useSeed: db.prepare('UPDATE seed_inventory SET quantity = quantity - 1 WHERE account_id = ? AND plant_type = ? AND quantity >= 1'),
    fruits: db.prepare('SELECT plant_type AS plantType, quantity FROM fruit_inventory WHERE account_id = ? AND quantity > 0'),
    fruit: db.prepare('SELECT quantity FROM fruit_inventory WHERE account_id = ? AND plant_type = ?'),
    addFruit: db.prepare(`INSERT INTO fruit_inventory (account_id, plant_type, quantity) VALUES (?, ?, ?)
      ON CONFLICT(account_id, plant_type) DO UPDATE SET quantity = quantity + excluded.quantity`),
    useFruit: db.prepare('UPDATE fruit_inventory SET quantity = quantity - ? WHERE account_id = ? AND plant_type = ? AND quantity >= ?'),
    offering: db.prepare('INSERT INTO fruit_offerings (account_id, plant_type, quantity, at) VALUES (?, ?, ?, ?)'),
    transactions: db.prepare('SELECT id, amount, balance_after AS balanceAfter, kind, plant_type AS plantType, quantity, at FROM coin_transactions WHERE account_id = ? ORDER BY id DESC LIMIT ?'),
    offeringsOf: db.prepare('SELECT COALESCE(SUM(quantity), 0) AS n FROM fruit_offerings WHERE account_id = ?'),
    myCrops: db.prepare("SELECT id FROM crop_cycles WHERE owner_account = ? AND status IN ('growing', 'fruiting')"),
    myHarvests: db.prepare(`SELECT h.crop_id AS cropId, SUM(h.quantity) AS n FROM crop_harvest_events h JOIN crop_cycles c ON c.id = h.crop_id
      WHERE h.account_id = ? AND c.status IN ('growing', 'fruiting') GROUP BY h.crop_id`),
    request: db.prepare('SELECT action, response FROM garden_requests WHERE account_id = ? AND idem_key = ?'),
    petsOf: db.prepare('SELECT * FROM spirit_pets WHERE account_id = ? ORDER BY adopted_at'),
    companionOf: db.prepare('SELECT species FROM spirit_pet_companion WHERE account_id = ?'),
    setCompanion: db.prepare(`INSERT INTO spirit_pet_companion (account_id, species) VALUES (?, ?)
      ON CONFLICT(account_id) DO UPDATE SET species = excluded.species`),
    clearCompanion: db.prepare('DELETE FROM spirit_pet_companion WHERE account_id = ?'),
    petOf: db.prepare('SELECT * FROM spirit_pets WHERE account_id = ? AND species = ?'),
    insertPet: db.prepare(`INSERT OR IGNORE INTO spirit_pets (account_id, species, name, adopted_at, fed_at, accrued_at)
      VALUES (?, ?, ?, ?, ?, ?)`),
    savePet: db.prepare(`UPDATE spirit_pets SET name = ?, fed_at = ?, fed_day = ?, fed_days = ?, streak = ?, bank = ?, accrued_at = ?
      WHERE account_id = ? AND species = ?`),
    saveRequest: db.prepare('INSERT INTO garden_requests (account_id, idem_key, action, response, at) VALUES (?, ?, ?, ?, ?)'),
    requestsSince: db.prepare('SELECT response, at FROM garden_requests WHERE account_id = ? AND action = ? AND at >= ?'),
    lottoTicketsOf: db.prepare('SELECT ticket_no AS no, numbers FROM lotto_tickets WHERE round_id = ? AND account_id = ? ORDER BY ticket_no'),
    lottoRoundTickets: db.prepare('SELECT account_id AS accountId, ticket_no AS no, numbers, price FROM lotto_tickets WHERE round_id = ?'),
    lottoAddTicket: db.prepare('INSERT INTO lotto_tickets (round_id, account_id, ticket_no, numbers, price, at) VALUES (?, ?, ?, ?, ?, ?)'),
    lottoAutoMark: db.prepare('SELECT price FROM lotto_auto_marks WHERE round_id = ? AND account_id = ?'),
    lottoRoundAutoMarks: db.prepare('SELECT account_id AS accountId, price FROM lotto_auto_marks WHERE round_id = ?'),
    lottoAddAutoMark: db.prepare('INSERT INTO lotto_auto_marks (round_id, account_id, price, at) VALUES (?, ?, ?, ?)'),
    lottoDone: db.prepare('SELECT status, result FROM lotto_rounds WHERE round_id = ?'),
    lottoClose: db.prepare('INSERT INTO lotto_rounds (round_id, status, result, at) VALUES (?, ?, ?, ?)'),
    lottoStale: db.prepare(`SELECT DISTINCT t.round_id AS id FROM lotto_tickets t LEFT JOIN lotto_rounds r ON r.round_id = t.round_id
      WHERE t.at >= ? AND t.at < ? AND r.round_id IS NULL`),
    lottoLastAt: db.prepare('SELECT MAX(at) AS at FROM lotto_tickets WHERE round_id = ?'),
    claimed: db.prepare('SELECT quest FROM quest_claims WHERE account_id = ? AND day = ?'),
    claimQuest: db.prepare('INSERT INTO quest_claims (account_id, day, quest, reward, at) VALUES (?, ?, ?, ?, ?)'),
    plantedOn: db.prepare('SELECT 1 FROM crop_cycles WHERE owner_account = ? AND planted_day = ? LIMIT 1'),
    wateredOn: db.prepare('SELECT 1 FROM crop_watering_events WHERE account_id = ? AND day = ? LIMIT 1'),
    harvestsSince: db.prepare('SELECT at FROM crop_harvest_events WHERE account_id = ? AND at >= ?'),
    offeringsSince: db.prepare('SELECT at FROM fruit_offerings WHERE account_id = ? AND at >= ?'),
    stake: db.prepare(`INSERT INTO bau_cua_stakes (round_id, account_id, animal, amount, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(round_id, account_id, animal) DO UPDATE SET amount = amount + excluded.amount, at = excluded.at`),
    stakesOf: db.prepare('SELECT animal, amount FROM bau_cua_stakes WHERE round_id = ? AND account_id = ?'),
    roundStakes: db.prepare('SELECT account_id AS accountId, animal, amount FROM bau_cua_stakes WHERE round_id = ?'),
    unstake: db.prepare('DELETE FROM bau_cua_stakes WHERE round_id = ? AND account_id = ?'),
    roundDone: db.prepare('SELECT status, dice, results FROM bau_cua_rounds WHERE round_id = ?'),
    closeRound: db.prepare('INSERT INTO bau_cua_rounds (round_id, status, dice, results, at) VALUES (?, ?, ?, ?, ?)'),
    staleRounds: db.prepare(`SELECT DISTINCT s.round_id AS id FROM bau_cua_stakes s LEFT JOIN bau_cua_rounds r ON r.round_id = s.round_id
      WHERE s.at >= ? AND s.at < ? AND r.round_id IS NULL`),
    stakesLastAt: db.prepare('SELECT MAX(at) AS at FROM bau_cua_stakes WHERE round_id = ?'),
    rpsStake: db.prepare('INSERT INTO rps_stakes (match_id, account_id, amount, at) VALUES (?, ?, ?, ?)'),
    rpsStakes: db.prepare('SELECT account_id AS accountId, amount FROM rps_stakes WHERE match_id = ? ORDER BY rowid'),
    rpsDone: db.prepare('SELECT status, results FROM rps_matches WHERE match_id = ?'),
    rpsClose: db.prepare('INSERT INTO rps_matches (match_id, status, results, at) VALUES (?, ?, ?, ?)'),
    rpsStale: db.prepare(`SELECT DISTINCT s.match_id AS id FROM rps_stakes s LEFT JOIN rps_matches m ON m.match_id = s.match_id
      WHERE s.at >= ? AND s.at < ? AND m.match_id IS NULL`),
    rpsLastAt: db.prepare('SELECT MAX(at) AS at FROM rps_stakes WHERE match_id = ?'),
    tienLenJoin: db.prepare('INSERT INTO tienlen_players (match_id, account_id, stake, mode, at) VALUES (?, ?, ?, ?, ?)'),
    tienLenPlayers: db.prepare('SELECT account_id AS accountId, stake, mode FROM tienlen_players WHERE match_id = ? ORDER BY rowid'),
    tienLenDone: db.prepare('SELECT status, results FROM tienlen_matches WHERE match_id = ?'),
    tienLenClose: db.prepare('INSERT INTO tienlen_matches (match_id, status, results, at) VALUES (?, ?, ?, ?)'),
    coinSpend: db.prepare('SELECT amount, reason, ref, refunded FROM coin_spends WHERE account_id = ? AND idem_key = ?'),
    addCoinSpend: db.prepare('INSERT INTO coin_spends (account_id, idem_key, amount, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?)'),
    markCoinRefunded: db.prepare('UPDATE coin_spends SET refunded = 1 WHERE account_id = ? AND idem_key = ?'),
    gameRound: db.prepare('INSERT INTO game_rounds (account_id, game, bets, dice, staked, payout, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    choreRewardCount: db.prepare('SELECT COUNT(*) AS n FROM chore_reward_events WHERE account_id = ? AND day = ? AND chore = ?'),
    botAccount: db.prepare('INSERT OR IGNORE INTO accounts (id, display_name, created_at) VALUES (?, ?, ?)'),
    botCrops: db.prepare(`SELECT plot_id AS plotId, owner_account AS owner, status, last_water_at AS lastWaterAt, planted_at AS plantedAt
      FROM crop_cycles WHERE status IN ('growing', 'fruiting') AND owner_account LIKE 'gbot-%'`),
    takenPlots: db.prepare("SELECT plot_id AS plotId FROM crop_cycles WHERE status IN ('growing', 'fruiting')"),
    graves: db.prepare(`SELECT g.id, g.slot, g.name, g.built_at AS builtAt, g.expires_at AS expiresAt, a.display_name AS builderName
      FROM memorial_graves g JOIN accounts a ON a.id = g.builder_account WHERE g.removed_at IS NULL AND g.expires_at > ? ORDER BY g.slot`),
    graveAt: db.prepare(`SELECT g.id, g.slot, g.name, g.built_at AS builtAt, g.expires_at AS expiresAt, a.display_name AS builderName
      FROM memorial_graves g JOIN accounts a ON a.id = g.builder_account WHERE g.slot = ? AND g.removed_at IS NULL AND g.expires_at > ?`),
    expireGraves: db.prepare("UPDATE memorial_graves SET removed_at = expires_at, removed_by = 'expired' WHERE removed_at IS NULL AND expires_at <= ?"),
    insertGrave: db.prepare('INSERT INTO memorial_graves (slot, name, builder_account, built_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
    removeGrave: db.prepare('UPDATE memorial_graves SET removed_at = ?, removed_by = ? WHERE slot = ? AND removed_at IS NULL AND expires_at > ?'),
    choreReward: db.prepare(`INSERT INTO chore_reward_events
      (account_id, event_key, day, chore, reward, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  };

  const today = () => gardenDay(now(), timeZone);
  const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
  let communityContributionsSince = null;

  // Community store được khởi tạo sau garden store trên API; chỉ chuẩn bị câu query lúc bảng đã tồn tại.
  // Vì vậy bộ garden vẫn chạy độc lập trong test hoặc khi tắt tính năng công trình chung.
  function contributedToProjectToday(accountId, projectId, day, since) {
    if (!communityContributionsSince && tableExists.get('community_project_contributions')) {
      communityContributionsSince = db.prepare(`SELECT at FROM community_project_contributions
        WHERE account_id = ? AND project_id = ? AND at >= ?`);
    }
    return Boolean(communityContributionsSince?.all(accountId, projectId, since)
      .some((row) => gardenDay(row.at, timeZone) === day));
  }

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  // Quả chín đủ 24 giờ → expired, luống trống. Thiếu nước chỉ làm cây héo, không xóa vụ.
  function expireStale() {
    const timestamp = now();
    const changed = [];
    for (const crop of q.activeAll.all()) {
      const fruitingAt = crop.fruiting_at ?? crop.last_water_at ?? crop.planted_at;
      const rotten = crop.status === 'fruiting' && timestamp >= fruitingAt + FRUIT_KEEP_MS;
      if (rotten) {
        q.endCrop.run('expired', timestamp, crop.id);
        changed.push(crop.plot_id);
      }
    }
    return changed;
  }

  function plotView(plotId) {
    const crop = q.active.get(plotId);
    if (!crop) return { id: plotId, crop: null };
    const timestamp = now();
    const hydratedAt = crop.last_water_at ?? crop.planted_at;
    // Chưa tưới lần nào thì được tưới ngay; sau đó khóa đúng 8 giờ theo server.
    const nextWaterAt = crop.last_water_at === null ? crop.planted_at : crop.last_water_at + WATER_INTERVAL_MS;
    const wiltsAt = hydratedAt + WILT_AFTER_MS;
    const canWater = timestamp >= nextWaterAt;
    return {
      id: plotId,
      crop: {
        id: crop.id,
        plantType: crop.plant_type,
        ownerName: crop.owner_name,
        stage: crop.status === 'fruiting' ? 'fruiting' : STAGES[Math.min(crop.water_days, STAGES.length - 1)],
        waterDays: crop.water_days,
        waterNeeded: WATER_DAYS_TO_FRUIT,
        // Giữ trường cũ để client đang mở không lỗi; ý nghĩa mới là đang trong thời gian chờ 8 giờ.
        wateredToday: !canWater,
        canWater,
        wilted: timestamp > wiltsAt,
        lastWateredAt: hydratedAt,
        nextWaterAt,
        wiltsAt,
        fruitsLeft: crop.fruits_left,
        fruitsTotal: crop.fruits_total,
        plantedAt: crop.planted_at,
      },
    };
  }

  // Cộng xu đào được từ accrued_at tới `at` vào rương (centi-xu): no thì đủ, hơi đói một nửa, ngủ thì không; rương đầy
  // (PET_CHEST_HOURS giờ của cấp hiện tại) thì ngừng. Trả bản ghi đã cập nhật (chưa lưu).
  function accrue(row, at) {
    const pet = { ...row };
    const rate = petRate(pet.species, petLevel(pet.fed_days));
    const cap = rate * PET_CHEST_HOURS;
    const from = Math.min(pet.accrued_at, at);
    const overlap = (start, end) => Math.max(0, Math.min(at, end) - Math.max(from, start));
    const fedMs = overlap(pet.fed_at, pet.fed_at + PET_FULL_MS);
    const hungryMs = overlap(pet.fed_at + PET_FULL_MS, pet.fed_at + PET_HUNGRY_MS);
    const gain = Math.floor((rate * (fedMs + hungryMs / 2)) / 3_600_000);
    pet.bank = Math.min(cap, pet.bank + gain);
    pet.accrued_at = at;
    return pet;
  }

  function petView(pet, at) {
    const level = petLevel(pet.fed_days);
    const since = at - pet.fed_at;
    const rate = petRate(pet.species, level);
    return {
      species: pet.species,
      name: pet.name,
      level,
      maxLevel: PET_LEVEL_DAYS.length,
      fedDays: pet.fed_days,
      nextLevelDays: PET_LEVEL_DAYS[level] ?? null,
      streak: pet.streak,
      mood: since <= PET_FULL_MS ? 'happy' : since <= PET_HUNGRY_MS ? 'hungry' : 'sleeping',
      fedAt: pet.fed_at,
      canFeed: pet.fed_day !== today(),
      chest: Math.floor(pet.bank / 100),
      chestMax: Math.floor((rate * PET_CHEST_HOURS) / 100),
      ratePerHour: rate / 100,
      adoptedAt: pet.adopted_at,
    };
  }

  const graveView = (row) => ({ slot: row.slot, grave: { name: row.name, builderName: row.builderName, builtAt: row.builtAt, expiresAt: row.expiresAt } });

  function ensureWallet(accountId) {
    const wallet = q.wallet.get(accountId);
    if (wallet) return wallet.balance;
    q.insertWallet.run(accountId, STARTING_COINS, now());
    q.coinTx.run(accountId, STARTING_COINS, STARTING_COINS, 'grant', null, null, now());
    return STARTING_COINS;
  }

  function changeCoins(accountId, amount, kind, plantType, quantity) {
    const balance = ensureWallet(accountId) + amount;
    if (balance < 0) throw new GardenError('INSUFFICIENT_COINS');
    q.setBalance.run(balance, now(), accountId);
    q.coinTx.run(accountId, amount, balance, kind, plantType, quantity, now());
    return balance;
  }

  // Tìm ván treo (có cược / vé mà chưa chốt, lần cược cuối đã quá staleMs). Bảng cược lớn dần mãi nên không quét cả
  // bảng mỗi lần đặt cược (đo với 200 nghìn ván cũ: ~50 ms / lần đặt Bầu Cua, ~180 ms / trận Oẳn Tù Tì): mỗi lần chỉ xét
  // các dòng trong khoảng [mốc lần trước, mốc mới) theo chỉ mục thời gian — dòng mới luôn mang giờ hiện tại nên không sót
  // — rồi kiểm lại lần cược cuối của từng ván ứng viên. Lần đầu sau khi mở API quét hết một lần. Gọi từ lúc đặt cược thì
  // tối đa STALE_SCAN_MS một lần; gọi trực tiếp (refundStale…()) thì quét ngay.
  function staleScanner(windowQuery, lastAtQuery, staleMs) {
    let done = 0;
    let scannedAt = -Infinity;
    return (force) => {
      if (!force && now() - scannedAt < STALE_SCAN_MS) return [];
      scannedAt = now();
      const cutoff = now() - staleMs;
      const ids = windowQuery.all(done, cutoff).map((row) => row.id).filter((id) => lastAtQuery.get(id).at < cutoff);
      done = Math.max(done, cutoff);
      return ids;
    };
  }
  const staleLotto = staleScanner(q.lottoStale, q.lottoLastAt, LOTTO_STALE_MS);
  const staleBauCua = staleScanner(q.staleRounds, q.stakesLastAt, BAU_CUA_STALE_MS);
  const staleRps = staleScanner(q.rpsStale, q.rpsLastAt, RPS_STALE_MS);

  // Ván Lô Tô treo quá hạn: hoàn vé + tự đánh dấu, đánh dấu ván hủy. Chạy trong giao dịch.
  function refundStaleLotto(force = true) {
    const stale = staleLotto(force);
    for (const roundId of stale) {
      const items = [...q.lottoRoundTickets.all(roundId), ...q.lottoRoundAutoMarks.all(roundId)];
      for (const item of items) if (item.price) changeCoins(item.accountId, item.price, 'game_refund', null, null);
      q.lottoClose.run(roundId, 'void', JSON.stringify({ ok: true, void: true, stale: true, results: [] }), now());
    }
    return stale.length;
  }

  // Ván Bầu Cua treo quá hạn (máy realtime chết giữa ván): hoàn từng cược, đánh dấu ván hủy. Chạy trong giao dịch.
  function refundStale(force = true) {
    const stale = staleBauCua(force);
    for (const roundId of stale) {
      for (const row of q.roundStakes.all(roundId)) changeCoins(row.accountId, row.amount, 'game_refund', null, null);
      q.closeRound.run(roundId, 'void', null, '[]', now());
    }
    return stale.length;
  }

  // Trận Oẳn Tù Tì treo quá hạn (máy realtime chết giữa trận): hoàn cọc, đánh dấu trận hủy. Chạy trong giao dịch.
  function refundStaleRps(force = true) {
    const stale = staleRps(force);
    for (const matchId of stale) closeRps(matchId, null, false);
    return stale.length;
  }

  // Chốt một trận Oẳn Tù Tì (trong giao dịch). winner: accountId người thắng, 'bot' (bot thắng) hoặc null (hòa / hủy:
  // hoàn cọc). Trả danh sách { accountId, staked, payout, net, coins } của người thật.
  function closeRps(matchId, winner, bot) {
    const stakes = q.rpsStakes.all(matchId);
    const refund = winner === null;
    const results = stakes.map(({ accountId, amount }) => {
      // Hai cọc luôn bằng nhau (stakeRps kiểm tra); trận với bot thì phần của bot do hệ thống bù.
      const payout = refund ? amount : accountId === winner ? rpsPrize(amount) : 0;
      const coins = payout ? changeCoins(accountId, payout, refund ? 'game_refund' : 'game_win', null, null) : ensureWallet(accountId);
      if (!refund) q.gameRound.run(accountId, 'rps', JSON.stringify({ stake: amount, bot: Boolean(bot) }), JSON.stringify({ winner: accountId === winner ? 'me' : 'other' }), amount, payout, coins, now());
      return { accountId, staked: amount, payout, net: payout - amount, coins };
    });
    q.rpsClose.run(matchId, refund ? 'void' : 'settled', JSON.stringify(results), now());
    return results;
  }

  // Nhiệm vụ hôm nay của một người: đã làm chưa (từ lịch sử), đã nhận xu chưa.
  function quests(accountId) {
    const day = today();
    // Sự kiện hái / dâng chỉ lưu thời điểm: lấy 30 giờ gần nhất rồi đổi ra ngày của vườn.
    const since = now() - 30 * 60 * 60 * 1_000;
    const onToday = (rows) => rows.some((row) => gardenDay(row.at, timeZone) === day);
    const done = {
      checkin: true,
      plant: Boolean(q.plantedOn.get(accountId, day)),
      water: Boolean(q.wateredOn.get(accountId, day)),
      harvest: onToday(q.harvestsSince.all(accountId, since)),
      offer: onToday(q.offeringsSince.all(accountId, since)),
      bodhi: contributedToProjectToday(accountId, 'bodhi-global-1', day, since),
      lotus: contributedToProjectToday(accountId, 'lotus-global-1', day, since),
    };
    const claimed = new Set(q.claimed.all(accountId, day).map((row) => row.quest));
    return DAILY_QUESTS.map(({ id, reward, location }) => ({ id, reward, location, done: done[id], claimed: claimed.has(id) }));
  }

  function me(accountId) {
    const balance = ensureWallet(accountId);
    return {
      quests: quests(accountId),
      coins: balance,
      seeds: Object.fromEntries(q.seeds.all(accountId).map((row) => [row.plantType, row.quantity])),
      fruits: Object.fromEntries(q.fruits.all(accountId).map((row) => [row.plantType, row.quantity])),
      offered: q.offeringsOf.get(accountId).n,
      myCropIds: q.myCrops.all(accountId).map((row) => row.id),
      harvested: Object.fromEntries(q.myHarvests.all(accountId).map((row) => [row.cropId, row.n])),
    };
  }

  const validPlot = (plotId) => Number.isSafeInteger(plotId) && plotId >= 1 && plotId <= PLOT_COUNT;
  const validPlant = (plantType) => typeof plantType === 'string' && Object.hasOwn(PLANTS, plantType);
  const validQuantity = (quantity) => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_ITEMS_PER_REQUEST;

  // ---- Các thao tác (đã ở trong giao dịch). Trả { plotIds: [luống đổi], ...kết quả }. ----
  const actions = {
    // Nhận xu nhiệm vụ hằng ngày: phải làm xong và chưa nhận hôm nay.
    claim(accountId, { quest }) {
      const item = DAILY_QUESTS.find((entry) => entry.id === quest);
      if (!item) throw new GardenError('INVALID');
      const status = quests(accountId).find((entry) => entry.id === quest);
      if (status.claimed) throw new GardenError('QUEST_CLAIMED');
      if (!status.done) throw new GardenError('QUEST_NOT_DONE');
      q.claimQuest.run(accountId, today(), quest, item.reward, now());
      changeCoins(accountId, item.reward, 'quest', null, null);
      return { plotIds: [], quest, reward: item.reward };
    },
    buy(accountId, { plantType, quantity }) {
      if (!validPlant(plantType) || !validQuantity(quantity)) throw new GardenError('INVALID');
      changeCoins(accountId, -PLANTS[plantType].seedPrice * quantity, 'buy_seed', plantType, quantity);
      q.addSeed.run(accountId, plantType, quantity);
      return { plotIds: [] };
    },
    plant(accountId, { plotId, plantType }) {
      if (!validPlot(plotId) || !validPlant(plantType)) throw new GardenError('INVALID');
      if (q.active.get(plotId)) throw new GardenError('PLOT_TAKEN');
      if (q.useSeed.run(accountId, plantType).changes !== 1) throw new GardenError('NO_SEED');
      try {
        q.insertCrop.run(plotId, accountId, plantType, today(), now());
      } catch (error) {
        // Chỉ mục duy nhất: người khác vừa chiếm luống trong cùng khoảnh khắc.
        if (String(error.message).includes('UNIQUE')) throw new GardenError('PLOT_TAKEN');
        throw error;
      }
      return { plotIds: [plotId] };
    },
    water(accountId, { plotId }) {
      if (!validPlot(plotId)) throw new GardenError('INVALID');
      const crop = q.active.get(plotId);
      if (!crop || !['growing', 'fruiting'].includes(crop.status)) throw new GardenError('NOT_GROWING');
      const timestamp = now();
      const hydratedAt = crop.last_water_at ?? crop.planted_at;
      const nextWaterAt = crop.last_water_at === null ? crop.planted_at : crop.last_water_at + WATER_INTERVAL_MS;
      if (timestamp < nextWaterAt) throw new GardenError('WATER_TOO_SOON');
      const day = today();
      const grows = crop.status === 'growing';
      q.waterEvent.run(crop.id, accountId, day, 1, timestamp);
      q.waterCrop.run(grows ? 1 : 0, day, timestamp, crop.id);
      if (grows && crop.water_days + 1 >= WATER_DAYS_TO_FRUIT) q.fruitCrop.run(FRUITS_PER_CROP, FRUITS_PER_CROP, day, timestamp, crop.id);
      return { plotIds: [plotId], counted: grows, revived: timestamp > hydratedAt + WILT_AFTER_MS };
    },
    harvest(accountId, { plotId, quantity }) {
      if (!validPlot(plotId) || (quantity !== undefined && !validQuantity(quantity))) throw new GardenError('INVALID');
      const crop = q.active.get(plotId);
      if (!crop || crop.status !== 'fruiting') throw new GardenError('NOT_FRUITING');
      const owner = crop.owner_account === accountId;
      const allowed = owner ? crop.fruits_left : Math.min(crop.fruits_left, VISITOR_HARVEST_LIMIT - q.harvestedBy.get(crop.id, accountId).n);
      if (allowed <= 0) throw new GardenError(crop.fruits_left ? 'HARVEST_LIMIT' : 'NO_FRUIT_LEFT');
      const take = Math.min(quantity ?? allowed, allowed);
      // Trừ có điều kiện: không bao giờ hái quá số quả còn lại kể cả khi nhiều người hái cùng lúc.
      if (q.takeFruit.run(take, crop.id, take).changes !== 1) throw new GardenError('NO_FRUIT_LEFT');
      q.harvestEvent.run(crop.id, accountId, take, owner ? 1 : 0, now());
      q.addFruit.run(accountId, crop.plant_type, take);
      if (crop.fruits_left - take === 0) q.endCrop.run('harvested', now(), crop.id);
      return { plotIds: [plotId], harvested: take, plantType: crop.plant_type };
    },
    sell(accountId, { plantType, quantity }) {
      if (!validPlant(plantType) || !validQuantity(quantity)) throw new GardenError('INVALID');
      if (q.useFruit.run(quantity, accountId, plantType, quantity).changes !== 1) throw new GardenError('INSUFFICIENT_FRUIT');
      changeCoins(accountId, PLANTS[plantType].fruitPrice * quantity, 'sell_fruit', plantType, quantity);
      return { plotIds: [] };
    },
    offer(accountId, { plantType, quantity }) {
      if (!validPlant(plantType) || !validQuantity(quantity)) throw new GardenError('INVALID');
      if (q.useFruit.run(quantity, accountId, plantType, quantity).changes !== 1) throw new GardenError('INSUFFICIENT_FRUIT');
      q.offering.run(accountId, plantType, quantity, now());
      return { plotIds: [] };
    },
  };

  return {
    timeZone,
    plants: PLANTS,

    // Toàn bộ luống (khách xem được). changed: luống vừa hết hạn để phát realtime.
    snapshot() {
      const changed = transaction(expireStale);
      return { day: today(), timeZone, plots: Array.from({ length: PLOT_COUNT }, (_, index) => plotView(index + 1)), expired: changed };
    },

    plot: plotView,

    // ---- Bot làm vườn (máy realtime gọi qua API nội bộ) ----
    // Mỗi tên bot là một tài khoản riêng (mã gbot-…, không có mật khẩu / Google nên không đăng nhập được). Bot không
    // dùng ví hay hạt giống; chỉ chăm luống của bot, không hái quả trên luống người chơi. Số luống bot giữ không vượt
    // BOT_PLOT_LIMIT. botTask chọn việc (hái → tưới → gieo); botAct làm việc đó khi bot đã đi tới luống.
    botTask(name, random = Math.random) {
      if (!validBotName(name)) return null;
      return transaction(() => {
        expireStale();
        const crops = q.botCrops.all();
        const pick = (list) => list[Math.floor(random() * list.length)];
        const ripe = crops.filter((crop) => crop.status === 'fruiting');
        if (ripe.length) return { action: 'harvest', plotId: pick(ripe).plotId };
        const timestamp = now();
        const thirsty = crops.filter((crop) => crop.status === 'growing' && timestamp >= (crop.lastWaterAt === null ? crop.plantedAt : crop.lastWaterAt + WATER_INTERVAL_MS));
        if (thirsty.length) return { action: 'water', plotId: pick(thirsty).plotId };
        if (crops.length >= BOT_PLOT_LIMIT) return null;
        const taken = new Set(q.takenPlots.all().map((row) => row.plotId));
        const empty = Array.from({ length: PLOT_COUNT }, (_, index) => index + 1).filter((id) => !taken.has(id));
        if (!empty.length) return null;
        const types = Object.keys(PLANTS);
        return { action: 'plant', plotId: pick(empty), plantType: pick(types) };
      });
    },

    // Trả { ok, code?, plots: [luống đã đổi] }.
    botAct(name, { action, plotId, plantType } = {}) {
      if (!validBotName(name) || !['plant', 'water', 'harvest'].includes(action) || !validPlot(plotId)
        || (action === 'plant' && !validPlant(plantType))) return { ok: false, code: 'INVALID', plots: [] };
      return transaction(() => {
        const expired = expireStale();
        const done = (plotIds, extra = {}) => ({ ok: true, ...extra, plots: [...new Set([...expired, ...plotIds])].map(plotView) });
        const fail = (code) => ({ ok: false, code, plots: expired.map(plotView) });
        const crop = q.active.get(plotId);
        db.exec('SAVEPOINT garden_bot');
        try {
          let result;
          if (action === 'plant') {
            if (crop) throw new GardenError('PLOT_TAKEN');
            if (q.botCrops.all().length >= BOT_PLOT_LIMIT) throw new GardenError('BOT_LIMIT');
            const accountId = botAccountId(name);
            q.botAccount.run(accountId, name, now());
            q.insertCrop.run(plotId, accountId, plantType, today(), now());
            result = done([plotId]);
          } else {
            // Tưới / hái thay cho chủ luống là bot (bot chăm chung vườn của bot); luống người chơi thì bỏ qua.
            if (!crop || !crop.owner_account.startsWith('gbot-')) throw new GardenError('NOT_BOT_PLOT');
            const { plotIds, ...detail } = actions[action](crop.owner_account, { plotId });
            result = done(plotIds, detail);
          }
          db.exec('RELEASE garden_bot');
          return result;
        } catch (error) {
          db.exec('ROLLBACK TO garden_bot');
          db.exec('RELEASE garden_bot');
          if (!(error instanceof GardenError)) throw error;
          return fail(error.code);
        }
      });
    },

    // Số luống bot đang giữ (cho test / trang quản trị).
    botPlots() {
      return q.botCrops.all().map((crop) => crop.plotId).sort((a, b) => a - b);
    },

    me(accountId) {
      return transaction(() => me(accountId));
    },

    history(accountId, { limit = 30 } = {}) {
      return q.transactions.all(accountId, Math.min(Math.max(1, limit), 100));
    },

    // Máy realtime gọi sau khi công việc thật sự hoàn thành. Mỗi loại việc được 20 xu, tối đa 3 lần theo ngày
    // của vườn. Cùng event key luôn trả lại đúng kết quả cũ và không cộng lần hai.
    // Thưởng thắng trốn tìm (máy realtime gọi, khóa theo ván + tài khoản). Quá giới hạn ngày thì reward 0, vẫn ok.
    rewardHideSeek({ accountId, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== 'hideseek') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const day = today();
        // Lần thưởng trong ngày: lấy 30 giờ gần nhất rồi đổi ra ngày của vườn, chỉ đếm lần có xu.
        const count = q.requestsSince.all(accountId, 'hideseek', now() - 30 * 60 * 60 * 1_000)
          .filter((row) => gardenDay(row.at, timeZone) === day && JSON.parse(row.response).reward > 0).length;
        const limited = count >= HIDESEEK_REWARD_DAILY_LIMIT;
        const coins = limited ? ensureWallet(accountId) : changeCoins(accountId, HIDESEEK_REWARD_COINS, 'game_win', null, null);
        const result = {
          ok: true, reward: limited ? 0 : HIDESEEK_REWARD_COINS, coins, count: limited ? count : count + 1,
          limit: HIDESEEK_REWARD_DAILY_LIMIT, limited,
        };
        q.saveRequest.run(accountId, key, 'hideseek', JSON.stringify(result), now());
        return result;
      });
    },

    rewardChore({ accountId, chore, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!CHORE_REWARD_KINDS.includes(chore)) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const action = `chore:${chore}`;
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== action) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const day = today();
        const count = q.choreRewardCount.get(accountId, day, chore).n;
        let result;
        if (count >= CHORE_REWARD_DAILY_LIMIT) {
          result = {
            ok: true, reward: 0, coins: ensureWallet(accountId), count,
            limit: CHORE_REWARD_DAILY_LIMIT, limited: true,
          };
        } else {
          const coins = changeCoins(accountId, CHORE_REWARD_COINS, 'chore', null, null);
          q.choreReward.run(accountId, key, day, chore, CHORE_REWARD_COINS, coins, now());
          result = {
            ok: true, reward: CHORE_REWARD_COINS, coins, count: count + 1,
            limit: CHORE_REWARD_DAILY_LIMIT, limited: false,
          };
        }
        q.saveRequest.run(accountId, key, action, JSON.stringify(result), now());
        return result;
      });
    },

    // Quản trị cộng/trừ xu. `key` lấy từ Telegram update_id nên gửi lại không đổi số dư lần hai.
    // Máy realtime / API trừ xu cho một việc trong phòng (mở phim…). Ghi sổ trước, phòng làm việc sau; gửi lại cùng khóa
    // không trừ hai lần. Thiếu xu thì không ghi gì. Trả { ok, coins } | { ok: false, code }.
    spendCoins({ accountId, amount, reason, ref, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!ROOM_SPEND_REASONS.includes(reason) || typeof ref !== 'string' || !ref || ref.length > 80
        || !Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.coinSpend.get(accountId, key);
        if (previous) return previous.refunded ? { ok: false, code: 'REFUNDED', coins: ensureWallet(accountId) } : { ok: true, replayed: true, amount: previous.amount, coins: ensureWallet(accountId) };
        if (ensureWallet(accountId) < amount) return { ok: false, code: 'INSUFFICIENT_COINS', coins: ensureWallet(accountId) };
        const coins = changeCoins(accountId, -amount, 'room_spend', null, null);
        q.addCoinSpend.run(accountId, key, amount, reason, ref, now());
        return { ok: true, amount, coins };
      });
    },

    // Hoàn lần tiêu xu có khóa này (hủy phim, rạp đóng…): chỉ hoàn lần tiêu có thật, tối đa một lần.
    refundCoins({ accountId, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'INVALID' };
      return transaction(() => {
        const spent = q.coinSpend.get(accountId, key);
        if (!spent) return { ok: false, code: 'UNKNOWN_SPEND' };
        if (spent.refunded) return { ok: true, replayed: true, amount: spent.amount, coins: ensureWallet(accountId) };
        const coins = changeCoins(accountId, spent.amount, 'room_refund', null, null);
        q.markCoinRefunded.run(accountId, key);
        return { ok: true, amount: spent.amount, coins };
      });
    },

    adjustCoins({ accountId, amount, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== 'admin_coins') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const before = ensureWallet(accountId);
        const result = before + amount < 0
          ? { ok: false, code: 'INSUFFICIENT_COINS', coins: before }
          : { ok: true, amount, coins: changeCoins(accountId, amount, 'admin_adjustment', null, null) };
        q.saveRequest.run(accountId, key, 'admin_coins', JSON.stringify(result), now());
        return result;
      });
    },

    // ---- Khu tưởng niệm ----
    // Các mộ còn hạn (ô không có trong danh sách là ô trống).
    graves() {
      return q.graves.all(now()).map(graveView);
    },
    // Đắp mộ: trừ GRAVE_PRICE xu, giữ GRAVE_TTL_MS. Tên đã qua bộ lọc chữ ở API. Cùng khóa gửi lại trả kết quả cũ.
    buildGrave(accountId, { slot, name } = {}, key) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      const clean = cleanGraveName(name);
      if (!Number.isSafeInteger(slot) || slot < 1 || slot > GRAVE_COUNT || !clean) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== 'memorial') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const at = now();
        q.expireGraves.run(at);
        let result;
        const taken = q.graveAt.get(slot, at);
        const before = ensureWallet(accountId);
        if (taken) result = { ok: false, code: 'GRAVE_TAKEN', graves: [graveView(taken)], coins: before };
        else if (before < GRAVE_PRICE) result = { ok: false, code: 'INSUFFICIENT_COINS', coins: before };
        else {
          const coins = changeCoins(accountId, -GRAVE_PRICE, 'memorial', null, slot);
          q.insertGrave.run(slot, clean, accountId, at, at + GRAVE_TTL_MS);
          result = { ok: true, coins, graves: [graveView(q.graveAt.get(slot, at))] };
        }
        q.saveRequest.run(accountId, key, 'memorial', JSON.stringify(result), at);
        return result;
      });
    },
    // Quản trị gỡ một mộ (tên xúc phạm, quấy rối…). Không hoàn xu. Trả { ok, slot } hoặc NOT_FOUND.
    removeGrave(slot, by = 'admin') {
      if (!Number.isSafeInteger(slot) || slot < 1 || slot > GRAVE_COUNT) return { ok: false, code: 'INVALID' };
      const at = now();
      const grave = q.graveAt.get(slot, at);
      if (!grave) return { ok: false, code: 'NOT_FOUND' };
      q.removeGrave.run(at, String(by).slice(0, 80), slot, at);
      return { ok: true, slot, name: grave.name, builderName: grave.builderName };
    },

    // ---- Linh thú ----
    // Linh thú của một người + số xu (khách / chưa nuôi: danh sách rỗng).
    pets(accountId) {
      if (!q.account.get(accountId)) return { pets: [], coins: 0 };
      const at = now();
      return {
        pets: q.petsOf.all(accountId).map((row) => petView(accrue(row, at), at)),
        coins: ensureWallet(accountId),
        companion: q.companionOf.get(accountId)?.species ?? null,
      };
    },
    // Linh thú đang dẫn theo, để ghi vào vé vào phòng: { species, level } hoặc null.
    companion(accountId) {
      const species = q.companionOf.get(accountId)?.species;
      const row = species && q.petOf.get(accountId, species);
      return row ? { species, level: petLevel(row.fed_days) } : null;
    },
    // Chọn linh thú dẫn theo (null = không dẫn con nào). Phải là con mình đang nuôi.
    setCompanion(accountId, species) {
      if (species === null) {
        q.clearCompanion.run(accountId);
        return { ok: true, companion: null };
      }
      if (!Object.hasOwn(SPIRIT_PETS, species) || !q.petOf.get(accountId, species)) return { ok: false, code: 'NO_PET' };
      q.setCompanion.run(accountId, species);
      return { ok: true, companion: species };
    },
    // Ghi linh thú mới (API đã trừ kim cương trước). Đã có loài này thì không tạo thêm: created false.
    adoptPet(accountId, species, name) {
      if (!Object.hasOwn(SPIRIT_PETS, species) || !q.account.get(accountId)) return { ok: false, code: 'INVALID' };
      const at = now();
      const created = q.insertPet.run(accountId, species, cleanPetName(name) || '', at, at, at).changes === 1;
      // Con đầu tiên tự đi theo chủ ngay.
      if (created && !q.companionOf.get(accountId)) q.setCompanion.run(accountId, species);
      return { ok: true, created, pet: petView(q.petOf.get(accountId, species), at) };
    },
    ownsPet: (accountId, species) => Boolean(q.petOf.get(accountId, species)),
    // feed (PET_FOOD_PRICE xu, mỗi ngày một bữa) | collect (nhận xu trong rương) | rename. Cùng khóa gửi lại trả kết quả cũ.
    petAction(accountId, action, { species, name } = {}, key) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!['feed', 'collect', 'rename'].includes(action) || !Object.hasOwn(SPIRIT_PETS, species)) return { ok: false, code: 'INVALID' };
      const clean = action === 'rename' ? cleanPetName(name) : '';
      if (action === 'rename' && !clean) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== 'pet') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const at = now();
        const found = q.petOf.get(accountId, species);
        let result;
        if (!found) result = { ok: false, code: 'NO_PET' };
        else {
          const pet = accrue(found, at);
          let coins = ensureWallet(accountId);
          let code = null;
          let woke = false;
          let gained = 0;
          if (action === 'feed') {
            const day = today();
            if (pet.fed_day === day) code = 'ALREADY_FED';
            else if (coins < PET_FOOD_PRICE) code = 'INSUFFICIENT_COINS';
            else {
              coins = changeCoins(accountId, -PET_FOOD_PRICE, 'pet_food', null, null);
              woke = at - pet.fed_at > PET_HUNGRY_MS;
              pet.streak = pet.fed_day && daysBetween(pet.fed_day, day) === 1 ? pet.streak + 1 : 1;
              pet.fed_day = day;
              pet.fed_days += 1;
              pet.fed_at = at;
            }
          } else if (action === 'collect') {
            gained = Math.floor(pet.bank / 100);
            if (gained < 1) code = 'CHEST_EMPTY';
            else {
              coins = changeCoins(accountId, gained, 'pet_yield', null, gained);
              pet.bank -= gained * 100;
            }
          } else pet.name = clean;
          q.savePet.run(pet.name, pet.fed_at, pet.fed_day, pet.fed_days, pet.streak, pet.bank, pet.accrued_at, accountId, species);
          const view = petView(pet, at);
          result = code ? { ok: false, code, coins, pet: view } : { ok: true, coins, pet: view, ...(gained ? { gained } : {}), ...(woke ? { woke } : {}) };
        }
        q.saveRequest.run(accountId, key, 'pet', JSON.stringify(result), at);
        return result;
      });
    },

    // Trừ xu mở phòng Lô Tô riêng (API gọi trước khi tạo phòng). Cùng key gửi lại trả nguyên kết quả cũ, không trừ hai lần.
    payPrivateRoom({ accountId, amount, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) {
          if (previous.action !== 'private_room') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const before = ensureWallet(accountId);
        if (before < amount) return { ok: false, code: 'INSUFFICIENT_COINS', coins: before };
        const result = { ok: true, amount, coins: changeCoins(accountId, -amount, 'private_room', null, null) };
        q.saveRequest.run(accountId, key, 'private_room', JSON.stringify(result), now());
        return result;
      });
    },

    // Bầu Cua chơi chung — đặt cược (máy realtime gọi qua /internal): trừ xu ngay, cộng dồn vào cược của ván.
    // Ván đã chốt thì từ chối. Cùng key gửi lại trả nguyên kết quả cũ. Trả { ok, mine: { linh vật: xu }, coins }.
    stakeBauCua({ accountId, roundId, animal, amount, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      // animal: ô cược của trò theo mã ván (linh vật Bầu Cua / ô Tài Xỉu).
      if (typeof roundId !== 'string' || !ROUND_ID.test(roundId) || !gameOfRound(roundId).spots.includes(animal)
        || !Number.isSafeInteger(amount) || amount < 1 || amount > BAU_CUA_MAX_STAKE) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        refundStale(false);
        const previous = q.request.get(accountId, key);
        if (previous) return { ...JSON.parse(previous.response), replayed: true };
        const mineBefore = Object.fromEntries(q.stakesOf.all(roundId, accountId).map((row) => [row.animal, row.amount]));
        const total = Object.values(mineBefore).reduce((sum, value) => sum + value, 0);
        let result;
        if (q.roundDone.get(roundId)) result = { ok: false, code: 'ROUND_CLOSED' };
        else if (total + amount > BAU_CUA_MAX_STAKE) result = { ok: false, code: 'STAKE_LIMIT' };
        else if (ensureWallet(accountId) < amount) result = { ok: false, code: 'INSUFFICIENT_COINS', coins: ensureWallet(accountId) };
        else {
          const coins = changeCoins(accountId, -amount, 'game_bet', null, null);
          q.stake.run(roundId, accountId, animal, amount, now());
          result = { ok: true, mine: { ...mineBefore, [animal]: (mineBefore[animal] || 0) + amount }, coins };
        }
        q.saveRequest.run(accountId, key, 'bau_cua_stake', JSON.stringify(result), now());
        return result;
      });
    },

    // Bầu Cua chơi chung — chốt ván (máy realtime gọi sau khi lắc): trả thưởng mọi cược của ván trong một giao dịch.
    // Gọi lại cùng ván: trả nguyên kết quả cũ. Ván đã bị hủy (quá hạn, đã hoàn cược): { ok: false, code: 'ROUND_VOID' }.
    // Trả { ok, results: [{ accountId, staked, payout, net, coins }] }.
    settleBauCuaRound({ roundId, dice }) {
      if (typeof roundId !== 'string' || !ROUND_ID.test(roundId) || !Array.isArray(dice) || dice.length !== 3
        || !dice.every(gameOfRound(roundId)?.face || (() => false))) return { ok: false, code: 'INVALID' };
      const game = gameOfRound(roundId);
      return transaction(() => {
        const done = q.roundDone.get(roundId);
        if (done) return done.status === 'void' ? { ok: false, code: 'ROUND_VOID' } : { ok: true, results: JSON.parse(done.results), replayed: true };
        const byAccount = new Map();
        for (const row of q.roundStakes.all(roundId)) {
          if (!byAccount.has(row.accountId)) byAccount.set(row.accountId, {});
          byAccount.get(row.accountId)[row.animal] = row.amount;
        }
        const results = [];
        for (const [accountId, bets] of byAccount) {
          const { staked, payout, net } = game.settle(bets, dice);
          const coins = payout ? changeCoins(accountId, payout, 'game_win', null, null) : ensureWallet(accountId);
          q.gameRound.run(accountId, game.name, JSON.stringify(bets), JSON.stringify(dice), staked, payout, coins, now());
          results.push({ accountId, staked, payout, net, coins });
        }
        q.closeRound.run(roundId, 'settled', JSON.stringify(dice), JSON.stringify(results), now());
        return { ok: true, results };
      });
    },

    // Bầu Cua chơi chung — hủy cược (trong pha đặt cược): hoàn hết cược của người này trong ván, ván đã chốt thì từ
    // chối. Cùng key gửi lại trả nguyên kết quả cũ. Trả { ok, removed: { linh vật: xu }, refunded, mine: {}, coins }.
    unstakeBauCua({ accountId, roundId, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (typeof roundId !== 'string' || !ROUND_ID.test(roundId)) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, key);
        if (previous) return { ...JSON.parse(previous.response), replayed: true };
        let result;
        if (q.roundDone.get(roundId)) result = { ok: false, code: 'ROUND_CLOSED' };
        else {
          const removed = Object.fromEntries(q.stakesOf.all(roundId, accountId).map((row) => [row.animal, row.amount]));
          const refunded = Object.values(removed).reduce((sum, value) => sum + value, 0);
          q.unstake.run(roundId, accountId);
          const coins = refunded ? changeCoins(accountId, refunded, 'game_refund', null, null) : ensureWallet(accountId);
          result = { ok: true, removed, refunded, mine: {}, coins };
        }
        q.saveRequest.run(accountId, key, 'bau_cua_unstake', JSON.stringify(result), now());
        return result;
      });
    },

    // Oẳn Tù Tì — vào bàn (máy realtime gọi khi người chơi mở bàn / nhận bàn): trừ cọc, mỗi người một cọc mỗi trận,
    // tối đa 2 người. Cùng key gửi lại trả nguyên kết quả cũ. Trả { ok, coins } | { ok: false, code }.
    stakeRps({ accountId, matchId, amount, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (typeof matchId !== 'string' || !RPS_MATCH_ID.test(matchId) || !RPS_STAKES.includes(amount)) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        refundStaleRps(false);
        const previous = q.request.get(accountId, key);
        if (previous) return { ...JSON.parse(previous.response), replayed: true };
        const stakes = q.rpsStakes.all(matchId);
        let result;
        if (q.rpsDone.get(matchId)) result = { ok: false, code: 'ROUND_CLOSED' };
        else if (stakes.some((row) => row.accountId === accountId)) result = { ok: false, code: 'STAKE_LIMIT' };
        else if (stakes.length >= 2 || stakes.some((row) => row.amount !== amount)) result = { ok: false, code: 'INVALID' };
        else if (ensureWallet(accountId) < amount) result = { ok: false, code: 'INSUFFICIENT_COINS', coins: ensureWallet(accountId) };
        else result = { ok: true, coins: changeCoins(accountId, -amount, 'game_bet', null, null) };
        if (result.ok) q.rpsStake.run(matchId, accountId, amount, now());
        q.saveRequest.run(accountId, key, 'rps_stake', JSON.stringify(result), now());
        return result;
      });
    },

    // Oẳn Tù Tì — chốt trận. winner: accountId | 'bot' | null (hòa / hủy → hoàn cọc). bot: trận đấu với bot (đúng một
    // người có cọc); không phải bot thì người thắng phải là một trong hai người có cọc. Gọi lại cùng trận: trả kết quả
    // cũ. Trả { ok, results: [{ accountId, staked, payout, net, coins }] }.
    settleRps({ matchId, winner, bot }) {
      if (typeof matchId !== 'string' || !RPS_MATCH_ID.test(matchId) || typeof bot !== 'boolean'
        || !(winner === null || (typeof winner === 'string' && winner.length <= 64))) return { ok: false, code: 'INVALID' };
      return transaction(() => {
        const done = q.rpsDone.get(matchId);
        if (done) return { ok: true, results: JSON.parse(done.results), void: done.status === 'void', replayed: true };
        const stakes = q.rpsStakes.all(matchId);
        if (winner !== null) {
          const valid = bot
            ? stakes.length === 1 && (winner === 'bot' || winner === stakes[0].accountId)
            : stakes.length === 2 && stakes[0].amount === stakes[1].amount && stakes.some((row) => row.accountId === winner);
          if (!valid) return { ok: false, code: 'INVALID' };
        }
        return { ok: true, results: closeRps(matchId, winner, bot), void: winner === null };
      });
    },

    refundStaleRps() {
      return transaction(refundStaleRps);
    },

    // Tiến lên — xem một người có đủ xu ngồi bàn mức cược này không (không đổi gì). Trả { ok, coins, need } hoặc
    // { ok: false, code: 'INSUFFICIENT_COINS', coins, need }.
    checkTienLen({ accountId, stake }) {
      if (!TIENLEN_STAKES.includes(stake)) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      const coins = ensureWallet(accountId);
      const need = tienLenMinCoins(stake);
      return coins >= need ? { ok: true, coins, need } : { ok: false, code: 'INSUFFICIENT_COINS', coins, need };
    },

    // Tiến lên — đầu ván: ghi người này vào ván nếu còn đủ xu ngồi bàn (không trừ xu). Mọi người trong ván cùng mức cược và
    // kiểu; tối đa TIENLEN_MAX_PLAYERS người. Gửi lại cùng người cùng ván trả kết quả cũ.
    beginTienLen({ accountId, matchId, stake, mode }) {
      if (typeof matchId !== 'string' || !TIENLEN_MATCH_ID.test(matchId) || !TIENLEN_STAKES.includes(stake) || !TIENLEN_MODES.includes(mode)) {
        return { ok: false, code: 'INVALID' };
      }
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        if (q.tienLenDone.get(matchId)) return { ok: false, code: 'ROUND_CLOSED' };
        const players = q.tienLenPlayers.all(matchId);
        const coins = ensureWallet(accountId);
        if (players.some((row) => row.accountId === accountId)) return { ok: true, coins, replayed: true };
        if (players.length >= TIENLEN_MAX_PLAYERS || players.some((row) => row.stake !== stake || row.mode !== mode)) return { ok: false, code: 'INVALID' };
        const need = tienLenMinCoins(stake);
        if (coins < need) return { ok: false, code: 'INSUFFICIENT_COINS', coins, need };
        q.tienLenJoin.run(matchId, accountId, stake, mode, now());
        return { ok: true, coins };
      });
    },

    // Tiến lên — chốt ván. transfers: [{ from, to, coins }] (from / to là accountId đã ghi vào ván, hoặc null = bot khi
    // bots = true); [] để đóng ván không đổi gì (ván bị hủy). Người trả thiếu xu thì chỉ trả hết số đang có. Gọi lại cùng
    // ván trả kết quả cũ. Trả { ok, results: [{ accountId, paid, received, net, cut, coins }] } (net: số xu thực cộng / trừ
    // sau phế).
    settleTienLen({ matchId, transfers, bots }) {
      if (typeof matchId !== 'string' || !TIENLEN_MATCH_ID.test(matchId) || typeof bots !== 'boolean'
        || !Array.isArray(transfers) || transfers.length > TIENLEN_MAX_TRANSFERS) return { ok: false, code: 'INVALID' };
      return transaction(() => {
        const done = q.tienLenDone.get(matchId);
        if (done) return { ok: true, results: JSON.parse(done.results), void: done.status === 'void', replayed: true };
        const players = q.tienLenPlayers.all(matchId);
        const known = new Set(players.map((row) => row.accountId));
        const limit = (players[0]?.stake || 0) * 60;
        const side = (value) => (value === null ? bots : known.has(value));
        const valid = transfers.every((item) => item && side(item.from) && side(item.to) && item.from !== item.to
          && Number.isSafeInteger(item.coins) && item.coins >= 0 && item.coins <= limit);
        if (!valid) return { ok: false, code: 'INVALID' };
        // Người thật trả tối đa bằng số xu đang có; bot (null) do hệ thống trả đủ.
        const balance = new Map(players.map((row) => [row.accountId, ensureWallet(row.accountId)]));
        const paid = capTransfers(transfers, (from) => (from === null ? undefined : balance.get(from)));
        const results = players.map(({ accountId }) => {
          const out = paid.filter((item) => item.from === accountId).reduce((sum, item) => sum + item.coins, 0);
          const received = paid.filter((item) => item.to === accountId).reduce((sum, item) => sum + item.coins, 0);
          const cut = tienLenCut(received - out);
          const net = received - out - cut;
          const coins = net ? changeCoins(accountId, net, net > 0 ? 'game_win' : 'game_bet', null, null) : ensureWallet(accountId);
          return { accountId, paid: out, received, net, cut, coins };
        });
        const empty = !transfers.length;
        q.tienLenClose.run(matchId, empty ? 'void' : 'settled', JSON.stringify(results), now());
        return { ok: true, results, void: empty };
      });
    },

    // Hoàn cược các ván treo (không được chốt sau BAU_CUA_STALE_MS). Trả số ván đã hủy.
    refundStaleBauCua() {
      return transaction(refundStale);
    },

    // Lô Tô — mua vé (máy realtime gọi trong pha mua vé): count vé mới (tổng ≤ LOTTO_MAX_TICKETS mỗi ván) và/hoặc tiện
    // ích tự đánh dấu. Vé do server tạo. Trả { ok, tickets: [{ no, rows }], autoMark, coins } (mọi vé của người đó trong
    // ván). Cùng key gửi lại trả nguyên kết quả cũ.
    buyLotto({ accountId, roundId, count = 0, autoMark = false, key }) {
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (typeof roundId !== 'string' || !LOTTO_ROUND_ID.test(roundId) || !Number.isSafeInteger(count) || count < 0
        || count > LOTTO_MAX_TICKETS || typeof autoMark !== 'boolean' || (!count && !autoMark)) return { ok: false, code: 'INVALID' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        refundStaleLotto(false);
        const previous = q.request.get(accountId, key);
        if (previous) return { ...JSON.parse(previous.response), replayed: true };
        const owned = q.lottoTicketsOf.all(roundId, accountId);
        const hasAutoMark = Boolean(q.lottoAutoMark.get(roundId, accountId));
        const addAutoMark = autoMark && !hasAutoMark;
        const cost = count * LOTTO_TICKET_PRICE + (addAutoMark ? LOTTO_AUTO_MARK_PRICE : 0);
        let result;
        if (q.lottoDone.get(roundId)) result = { ok: false, code: 'ROUND_CLOSED' };
        else if (owned.length + count > LOTTO_MAX_TICKETS) result = { ok: false, code: 'TICKET_LIMIT' };
        else if (!cost) result = { ok: false, code: 'INVALID' };
        else if (ensureWallet(accountId) < cost) result = { ok: false, code: 'INSUFFICIENT_COINS', coins: ensureWallet(accountId) };
        else {
          const coins = changeCoins(accountId, -cost, 'game_bet', null, null);
          for (let index = 0; index < count; index += 1) {
            q.lottoAddTicket.run(roundId, accountId, owned.length + index + 1, JSON.stringify(createLottoTicket()), LOTTO_TICKET_PRICE, now());
          }
          if (addAutoMark) q.lottoAddAutoMark.run(roundId, accountId, LOTTO_AUTO_MARK_PRICE, now());
          const tickets = q.lottoTicketsOf.all(roundId, accountId).map((row) => ({ no: row.no, rows: JSON.parse(row.numbers) }));
          result = { ok: true, tickets, autoMark: hasAutoMark || addAutoMark, coins };
        }
        q.saveRequest.run(accountId, key, 'lotto_buy', JSON.stringify(result), now());
        return result;
      });
    },

    // Lô Tô — chốt ván: called = các số đã gọi, claims = [{ accountId, ticket, row }] (lời kinh máy realtime đã nhận).
    // Kiểm tra lại từng lời kinh theo vé gốc; vé kinh hợp lệ chia đều quỹ sau phế. Không có lời kinh hợp lệ thì hủy ván
    // và hoàn toàn bộ tiền (vé + tự đánh dấu). Gọi lại cùng ván trả nguyên kết quả cũ.
    // Trả { ok, void?, pool, prize, share, winners: [{ accountId, ticket, row }], results: [{ accountId, staked, payout, net, coins }] }.
    // botWinners: số bot kinh đúng cùng nhịp (máy realtime giữ vé bot). Bot được tính như người thắng khi chia quỹ;
    // phần của bot không vào ví nào. Chỉ bot kinh thì ván vẫn chốt: người chơi thua tiền vé như thua người thật.
    // botTickets: số vé bot trong ván; mỗi vé bot góp LOTTO_TICKET_PRICE vào quỹ như vé thật (hệ thống bù), nên quỹ
    // hiện trên bàn khớp số vé và người chơi trung bình nhận lại đúng phần sau phế.
    settleLottoRound({ roundId, called, claims = [], botWinners = 0, botTickets = 0 }) {
      if (!Number.isSafeInteger(botWinners) || botWinners < 0 || botWinners > 20
        || !Number.isSafeInteger(botTickets) || botTickets < 0 || botTickets > 1_000) return { ok: false, code: 'INVALID' };
      if (typeof roundId !== 'string' || !LOTTO_ROUND_ID.test(roundId) || !Array.isArray(called) || called.length > 90
        || !called.every((number) => Number.isSafeInteger(number) && number >= 1 && number <= 90) || new Set(called).size !== called.length
        || !Array.isArray(claims) || claims.length > 1_000) return { ok: false, code: 'INVALID' };
      return transaction(() => {
        const done = q.lottoDone.get(roundId);
        if (done) return { ...JSON.parse(done.result), replayed: true };
        const tickets = q.lottoRoundTickets.all(roundId);
        const autoMarks = q.lottoRoundAutoMarks.all(roundId);
        const calledSet = new Set(called);
        const seen = new Set();
        const winners = [];
        for (const claim of claims) {
          const ticket = tickets.find((item) => item.accountId === claim?.accountId && item.no === claim?.ticket);
          if (!ticket || !Number.isSafeInteger(claim.row) || seen.has(`${ticket.accountId}:${ticket.no}`)) continue;
          if (!lottoRowComplete(JSON.parse(ticket.numbers), claim.row, calledSet)) continue;
          seen.add(`${ticket.accountId}:${ticket.no}`);
          winners.push({ accountId: ticket.accountId, ticket: ticket.no, row: claim.row });
        }
        // Tiền mỗi người đã bỏ ra trong ván (vé + tự đánh dấu).
        const paid = new Map();
        for (const item of [...tickets, ...autoMarks]) paid.set(item.accountId, (paid.get(item.accountId) || 0) + item.price);
        const pool = tickets.reduce((sum, item) => sum + item.price, 0) + botTickets * LOTTO_TICKET_PRICE;
        const voided = !winners.length && !botWinners;
        const prize = voided ? 0 : Math.floor((pool * (100 - LOTTO_HOUSE_CUT_PERCENT)) / 100);
        const share = voided ? 0 : Math.floor(prize / (winners.length + botWinners));
        const won = new Map();
        for (const winner of winners) won.set(winner.accountId, (won.get(winner.accountId) || 0) + share);
        const results = [];
        for (const [accountId, staked] of paid) {
          const payout = voided ? staked : won.get(accountId) || 0;
          const coins = payout ? changeCoins(accountId, payout, voided ? 'game_refund' : 'game_win', null, null) : ensureWallet(accountId);
          if (!voided && staked > 0) q.gameRound.run(accountId, 'loto', JSON.stringify({ tickets: tickets.filter((item) => item.accountId === accountId).length }), JSON.stringify(called), staked, payout, coins, now());
          results.push({ accountId, staked, payout, net: payout - staked, coins });
        }
        const result = { ok: true, ...(voided ? { void: true } : {}), pool, prize, share, winners, ...(botWinners ? { botWinners } : {}), results };
        q.lottoClose.run(roundId, voided ? 'void' : 'settled', JSON.stringify(result), now());
        return result;
      });
    },

    // Hoàn tiền các ván Lô Tô treo (máy realtime chết giữa ván). Trả số ván đã hủy.
    refundStaleLotto() {
      return transaction(refundStaleLotto);
    },

    // Thực hiện một thao tác kinh tế / luống. idempotencyKey bắt buộc: gửi lại cùng khóa trả nguyên kết quả cũ.
    // Trả { ok, code?, plots: [luống đã đổi], me, ...chi tiết }.
    perform(accountId, action, input, idempotencyKey) {
      if (!Object.hasOwn(actions, action)) return { ok: false, code: 'INVALID' };
      if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(idempotencyKey)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      return transaction(() => {
        const previous = q.request.get(accountId, idempotencyKey);
        if (previous) {
          if (previous.action !== action) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const expired = expireStale();
        let result;
        // Lỗi nghiệp vụ: lùi mọi thay đổi của thao tác (savepoint), vẫn lưu khóa để gửi lại nhận cùng câu trả lời.
        db.exec('SAVEPOINT garden_action');
        try {
          const { plotIds, ...detail } = actions[action](accountId, input || {});
          db.exec('RELEASE garden_action');
          result = { ok: true, ...detail, plots: [...new Set([...expired, ...plotIds])].map(plotView), me: me(accountId) };
        } catch (error) {
          db.exec('ROLLBACK TO garden_action');
          db.exec('RELEASE garden_action');
          if (!(error instanceof GardenError)) throw error;
          result = { ok: false, code: error.code, plots: expired.map(plotView), me: me(accountId) };
        }
        q.saveRequest.run(accountId, idempotencyKey, action, JSON.stringify(result), now());
        return result;
      });
    },
  };
}
