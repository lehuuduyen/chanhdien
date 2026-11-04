import { randomInt } from 'node:crypto';

// Vườn Công Đức: 10 luống trồng chung cho mọi phòng chánh điện, xu ảo (không đổi ra tiền thật), hạt giống, quả.
// Mọi thay đổi số dư / kho / luống chạy trong một giao dịch SQLite (BEGIN IMMEDIATE) trên cùng file với tài khoản;
// ràng buộc duy nhất trong cơ sở dữ liệu chặn hai người cùng chiếm một luống. Mốc tưới lấy từ đồng hồ
// server (không tin giờ client): lần đầu có thể tưới ngay, các lần sau cách nhau 8 giờ; quá 24 giờ thì cây héo.
//
// Vòng đời một vụ: gieo (growing, 0 lần tưới) → mầm (1) → cây non (2) → tưới đủ 3 lần: ra 10 quả
// (fruiting) → hái hết: harvested, luống trống. Cây héo không bị xóa và tưới lại sẽ hồi phục. Quả chín để quá
// FRUIT_KEEP_DAYS ngày mới expired. Lịch sử vụ, tưới, hái, giao dịch xu đều được giữ lại để đối soát.

export const PLOT_COUNT = 10;
export const WATER_DAYS_TO_FRUIT = 3;
export const FRUITS_PER_CROP = 10;
export const VISITOR_HARVEST_LIMIT = 2;
export const STARTING_COINS = 50;
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
// Bầu Cua Tôm Cá ở phòng game: cược bằng xu của ví (xu bán trái cây), 1 xu cược = 1 xu trong ví.
export const BAU_CUA_ANIMALS = Object.freeze(['nai', 'bau', 'ga', 'ca', 'cua', 'tom']);
export const BAU_CUA_MAX_STAKE = 1_000;
// Nhiệm vụ hằng ngày (theo ngày của vườn): làm xong thì bấm nhận xu, mỗi nhiệm vụ một lần mỗi ngày. Server tự kiểm
// tra trong lịch sử tưới / hái / dâng quả; điểm danh thì chỉ cần đăng nhập.
export const DAILY_QUESTS = Object.freeze([
  Object.freeze({ id: 'checkin', reward: 5 }),
  Object.freeze({ id: 'water', reward: 5 }),
  Object.freeze({ id: 'harvest', reward: 5 }),
  Object.freeze({ id: 'offer', reward: 5 }),
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
];

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
// random(n): số nguyên ngẫu nhiên 0…n−1 cho xúc xắc (mặc định crypto.randomInt; test truyền hàm cố định).
export function createGardenStore({ db, now = Date.now, timeZone = 'America/Los_Angeles', random = randomInt }) {
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
    claimed: db.prepare('SELECT quest FROM quest_claims WHERE account_id = ? AND day = ?'),
    claimQuest: db.prepare('INSERT INTO quest_claims (account_id, day, quest, reward, at) VALUES (?, ?, ?, ?, ?)'),
    wateredOn: db.prepare('SELECT 1 FROM crop_watering_events WHERE account_id = ? AND day = ? LIMIT 1'),
    harvestsSince: db.prepare('SELECT at FROM crop_harvest_events WHERE account_id = ? AND at >= ?'),
    offeringsSince: db.prepare('SELECT at FROM fruit_offerings WHERE account_id = ? AND at >= ?'),
    gameRound: db.prepare('INSERT INTO game_rounds (account_id, game, bets, dice, staked, payout, balance_after, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  };

  const today = () => gardenDay(now(), timeZone);

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

  // Nhiệm vụ hôm nay của một người: đã làm chưa (từ lịch sử), đã nhận xu chưa.
  function quests(accountId) {
    const day = today();
    // Sự kiện hái / dâng chỉ lưu thời điểm: lấy 30 giờ gần nhất rồi đổi ra ngày của vườn.
    const since = now() - 30 * 60 * 60 * 1_000;
    const onToday = (rows) => rows.some((row) => gardenDay(row.at, timeZone) === day);
    const done = {
      checkin: true,
      water: Boolean(q.wateredOn.get(accountId, day)),
      harvest: onToday(q.harvestsSince.all(accountId, since)),
      offer: onToday(q.offeringsSince.all(accountId, since)),
    };
    const claimed = new Set(q.claimed.all(accountId, day).map((row) => row.quest));
    return DAILY_QUESTS.map(({ id, reward }) => ({ id, reward, done: done[id], claimed: claimed.has(id) }));
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

    // Một ván Bầu Cua: kiểm tra cược, trừ xu, server lắc 3 xúc xắc, cộng thưởng, ghi sổ — cùng một giao dịch.
    // Cùng idempotencyKey gửi lại: trả nguyên kết quả cũ (không lắc lại, không trừ/cộng lần hai).
    // Trả { ok, dice, hits, staked, payout, net, coins } hoặc { ok: false, code, coins }.
    playBauCua(accountId, bets, idempotencyKey) {
      if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(idempotencyKey)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!q.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      // Chỉ nhận đúng 6 linh vật, số xu nguyên dương; tổng cược 1…BAU_CUA_MAX_STAKE.
      const clean = {};
      const valid = bets && typeof bets === 'object' && !Array.isArray(bets) && Object.entries(bets).every(([id, amount]) => {
        if (!BAU_CUA_ANIMALS.includes(id) || !Number.isSafeInteger(amount) || amount < 0) return false;
        if (amount) clean[id] = amount;
        return true;
      });
      const total = Object.values(clean).reduce((sum, amount) => sum + amount, 0);
      if (!valid || total < 1 || total > BAU_CUA_MAX_STAKE) return { ok: false, code: 'INVALID' };
      return transaction(() => {
        const previous = q.request.get(accountId, idempotencyKey);
        if (previous) {
          if (previous.action !== 'bau_cua') return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        let result;
        if (ensureWallet(accountId) < total) result = { ok: false, code: 'INSUFFICIENT_COINS', coins: ensureWallet(accountId) };
        else {
          const dice = [0, 1, 2].map(() => BAU_CUA_ANIMALS[random(BAU_CUA_ANIMALS.length)]);
          const { staked, payout, net, hits } = settleBauCua(clean, dice);
          let coins = changeCoins(accountId, -staked, 'game_bet', null, null);
          if (payout) coins = changeCoins(accountId, payout, 'game_win', null, null);
          q.gameRound.run(accountId, 'bau_cua', JSON.stringify(clean), JSON.stringify(dice), staked, payout, coins, now());
          result = { ok: true, dice, hits, staked, payout, net, coins };
        }
        q.saveRequest.run(accountId, idempotencyKey, 'bau_cua', JSON.stringify(result), now());
        return result;
      });
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
