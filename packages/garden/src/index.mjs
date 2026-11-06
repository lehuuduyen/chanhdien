// Vườn Công Đức: 10 luống trồng chung cho mọi phòng chánh điện, xu ảo (không đổi ra tiền thật), hạt giống, quả.
// Mọi thay đổi số dư / kho / luống chạy trong một giao dịch SQLite (BEGIN IMMEDIATE) trên cùng file với tài khoản;
// ràng buộc duy nhất trong cơ sở dữ liệu chặn hai người cùng chiếm một luống. Mốc tưới lấy từ đồng hồ
// server (không tin giờ client): lần đầu có thể tưới ngay, các lần sau cách nhau 8 giờ; quá 24 giờ thì cây héo.
//
// Vòng đời một vụ: gieo (growing, 0 lần tưới) → mầm (1) → cây non (2) → tưới đủ 3 lần: ra 10 quả
// (fruiting) → hái hết: harvested, luống trống. Cây héo không bị xóa và tưới lại sẽ hồi phục. Quả chín để quá
// FRUIT_KEEP_DAYS ngày mới expired. Lịch sử vụ, tưới, hái, giao dịch xu đều được giữ lại để đối soát.

import { randomInt } from 'node:crypto';
export const PLOT_COUNT = 10;
export const WATER_DAYS_TO_FRUIT = 3;
export const FRUITS_PER_CROP = 10;
export const VISITOR_HARVEST_LIMIT = 2;
export const STARTING_COINS = 50;
export const CHORE_REWARD_COINS = 20;
export const CHORE_REWARD_DAILY_LIMIT = 3;
export const CHORE_REWARD_KINDS = Object.freeze(['sweep', 'water', 'light', 'feed', 'clean', 'tea']);
export const WATER_INTERVAL_MS = 8 * 60 * 60 * 1_000;
export const WILT_AFTER_MS = 24 * 60 * 60 * 1_000;
export const FRUIT_KEEP_DAYS = 7;
export const MAX_ITEMS_PER_REQUEST = 20;
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
    id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND ${PLOT_COUNT}),
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
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS garden_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const version = Number(db.prepare("SELECT value FROM garden_meta WHERE key = 'schema_version'").get()?.value || 0);
  for (let index = version; index < MIGRATIONS.length; index += 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[index]);
      db.prepare("INSERT INTO garden_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(index + 1));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
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
    fruitCrop: db.prepare("UPDATE crop_cycles SET status = 'fruiting', fruits_total = ?, fruits_left = ?, fruiting_day = ? WHERE id = ?"),
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
    saveRequest: db.prepare('INSERT INTO garden_requests (account_id, idem_key, action, response, at) VALUES (?, ?, ?, ?, ?)'),
    lottoTicketsOf: db.prepare('SELECT ticket_no AS no, numbers FROM lotto_tickets WHERE round_id = ? AND account_id = ? ORDER BY ticket_no'),
    lottoRoundTickets: db.prepare('SELECT account_id AS accountId, ticket_no AS no, numbers, price FROM lotto_tickets WHERE round_id = ?'),
    lottoAddTicket: db.prepare('INSERT INTO lotto_tickets (round_id, account_id, ticket_no, numbers, price, at) VALUES (?, ?, ?, ?, ?, ?)'),
    lottoAutoMark: db.prepare('SELECT price FROM lotto_auto_marks WHERE round_id = ? AND account_id = ?'),
    lottoRoundAutoMarks: db.prepare('SELECT account_id AS accountId, price FROM lotto_auto_marks WHERE round_id = ?'),
    lottoAddAutoMark: db.prepare('INSERT INTO lotto_auto_marks (round_id, account_id, price, at) VALUES (?, ?, ?, ?)'),
    lottoDone: db.prepare('SELECT status, result FROM lotto_rounds WHERE round_id = ?'),
    lottoClose: db.prepare('INSERT INTO lotto_rounds (round_id, status, result, at) VALUES (?, ?, ?, ?)'),
    lottoStale: db.prepare(`SELECT t.round_id AS roundId FROM lotto_tickets t LEFT JOIN lotto_rounds r ON r.round_id = t.round_id
      WHERE r.round_id IS NULL GROUP BY t.round_id HAVING MAX(t.at) < ?`),
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
    staleRounds: db.prepare(`SELECT s.round_id AS roundId FROM bau_cua_stakes s LEFT JOIN bau_cua_rounds r ON r.round_id = s.round_id
      WHERE r.round_id IS NULL GROUP BY s.round_id HAVING MAX(s.at) < ?`),
    gameRound: db.prepare('INSERT INTO game_rounds (account_id, game, bets, dice, staked, payout, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    choreRewardCount: db.prepare('SELECT COUNT(*) AS n FROM chore_reward_events WHERE account_id = ? AND day = ? AND chore = ?'),
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

  // Quả để quá lâu → expired, luống trống. Thiếu nước chỉ làm cây héo, không xóa vụ.
  function expireStale() {
    const day = today();
    const changed = [];
    for (const crop of q.activeAll.all()) {
      const rotten = crop.status === 'fruiting' && daysBetween(crop.fruiting_day, day) > FRUIT_KEEP_DAYS;
      if (rotten) {
        q.endCrop.run('expired', now(), crop.id);
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

  // Ván Lô Tô treo quá hạn: hoàn vé + tự đánh dấu, đánh dấu ván hủy. Chạy trong giao dịch.
  function refundStaleLotto() {
    const stale = q.lottoStale.all(now() - LOTTO_STALE_MS);
    for (const { roundId } of stale) {
      const items = [...q.lottoRoundTickets.all(roundId), ...q.lottoRoundAutoMarks.all(roundId)];
      for (const item of items) if (item.price) changeCoins(item.accountId, item.price, 'game_refund', null, null);
      q.lottoClose.run(roundId, 'void', JSON.stringify({ ok: true, void: true, stale: true, results: [] }), now());
    }
    return stale.length;
  }

  // Ván Bầu Cua treo quá hạn (máy realtime chết giữa ván): hoàn từng cược, đánh dấu ván hủy. Chạy trong giao dịch.
  function refundStale() {
    const stale = q.staleRounds.all(now() - BAU_CUA_STALE_MS);
    for (const { roundId } of stale) {
      for (const row of q.roundStakes.all(roundId)) changeCoins(row.accountId, row.amount, 'game_refund', null, null);
      q.closeRound.run(roundId, 'void', null, '[]', now());
    }
    return stale.length;
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
      if (grows && crop.water_days + 1 >= WATER_DAYS_TO_FRUIT) q.fruitCrop.run(FRUITS_PER_CROP, FRUITS_PER_CROP, day, crop.id);
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

    // Toàn bộ 10 luống (khách xem được). changed: luống vừa hết hạn để phát realtime.
    snapshot() {
      const changed = transaction(expireStale);
      return { day: today(), timeZone, plots: Array.from({ length: PLOT_COUNT }, (_, index) => plotView(index + 1)), expired: changed };
    },

    plot: plotView,

    me(accountId) {
      return transaction(() => me(accountId));
    },

    history(accountId, { limit = 30 } = {}) {
      return q.transactions.all(accountId, Math.min(Math.max(1, limit), 100));
    },

    // Máy realtime gọi sau khi công việc thật sự hoàn thành. Mỗi loại việc được 20 xu, tối đa 3 lần theo ngày
    // của vườn. Cùng event key luôn trả lại đúng kết quả cũ và không cộng lần hai.
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
        refundStale();
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
        refundStaleLotto();
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
