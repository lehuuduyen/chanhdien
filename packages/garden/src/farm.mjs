// Phước Điền: nông trại riêng của từng tài khoản (KE_HOACH_NONG_TRAI.md). Trồng cây theo giờ thật, nuôi gà lấy trứng,
// nuôi bò lấy sữa, kho chung, chợ thu theo giá trong ngày có hạn mức, cấp độ mở thêm cây / con / đất.
//
// Dùng chung ví xu, sổ giao dịch và khóa idempotency với Vườn Công Đức (createGardenStore gọi createFarm) nên mỗi thao
// tác là một giao dịch SQLite. Trạng thái tính "lười" từ các mốc thời gian server (không chạy đồng hồ cho từng nông
// trại): cây chỉ lớn khi đất còn ẩm, gà / bò chỉ lớn và sinh trứng / sữa khi còn no, ổ / thùng đầy thì ngừng.
// Không phạt: đất khô thì cây ngừng lớn, con đói thì ngừng đẻ — không chết, không mất đồ.
import { createHash, randomInt } from 'node:crypto';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const FARM_PLOTS_START = 6;
export const FARM_PLOTS_MAX = 36;
export const FARM_LEVEL_MAX = 30;
// Gieo xong đất ẩm sẵn; mỗi lần tưới giữ ẩm 6 giờ. Cây ngắn không cần tưới, cây dài cần tưới giữa chừng.
export const FARM_MOIST_MS = 6 * HOUR;
// Bán quá hạn mức chợ trong ngày: chợ chỉ trả 20 % giá.
export const FARM_OVER_CAP_PERCENT = 20;
// Cỏ / sâu để nguyên tới lúc thu: mỗi thứ bớt 10 % sản lượng.
const ISSUE_PENALTY = 0.1;
export const FARM_HAY_PRICE = 3;
export const FARM_MAX_QUANTITY = 999;

// Cây trồng: cấp mở, thời gian chín, sản lượng, giá hạt (trả lúc gieo), giá chợ gốc, kinh nghiệm khi thu. feed: thức ăn
// của gà / bò (cỏ voi không bán được). regrow: cây lâu năm thu thêm `times` lứa, mỗi lứa `ms`.
export const FARM_CROPS = Object.freeze({
  spinach: Object.freeze({ level: 1, growMs: 20 * MINUTE, yield: 3, seed: 1, price: 1, xp: 1 }),
  tomato: Object.freeze({ level: 1, growMs: HOUR, yield: 4, seed: 1, price: 2, xp: 2 }),
  corn: Object.freeze({ level: 2, growMs: 3 * HOUR, yield: 5, seed: 1, price: 2, xp: 4, feed: 'chicken' }),
  rice: Object.freeze({ level: 3, growMs: 6 * HOUR, yield: 8, seed: 2, price: 2, xp: 6, feed: 'chicken' }),
  carrot: Object.freeze({ level: 4, growMs: 4 * HOUR, yield: 5, seed: 2, price: 3, xp: 5 }),
  grass: Object.freeze({ level: 5, growMs: 2 * HOUR, yield: 4, seed: 1, price: 0, xp: 2, feed: 'cow' }),
  pumpkin: Object.freeze({ level: 7, growMs: 8 * HOUR, yield: 4, seed: 4, price: 7, xp: 8 }),
  watermelon: Object.freeze({ level: 9, growMs: 12 * HOUR, yield: 4, seed: 6, price: 10, xp: 10 }),
  dragonfruit: Object.freeze({ level: 12, growMs: 24 * HOUR, yield: 3, seed: 15, price: 9, xp: 12, regrow: Object.freeze({ ms: 12 * HOUR, times: 4 }) }),
});
export const FARM_CROP_ORDER = Object.freeze(Object.keys(FARM_CROPS));

// Vật nuôi: mua con non bằng xu (vừa mua đã được cho ăn một bữa), no `fullMs` mỗi bữa (ăn `eat` món trong `food`),
// được nuôi no đủ `growMs` thì thành con lớn; con lớn còn no thì cứ `cycleMs` cho 1 sản phẩm, giữ tối đa `cap`.
// Không giết thịt, không bán con.
export const FARM_ANIMALS = Object.freeze({
  chicken: Object.freeze({ level: 3, price: 20, growMs: 12 * HOUR, fullMs: 8 * HOUR, food: Object.freeze(['corn', 'rice']), eat: 1, product: 'egg', cycleMs: 6 * HOUR, cap: 4, xp: 2 }),
  cow: Object.freeze({ level: 5, price: 60, growMs: 48 * HOUR, fullMs: 12 * HOUR, food: Object.freeze(['grass', 'hay']), eat: 2, product: 'milk', cycleMs: 12 * HOUR, cap: 2, xp: 4 }),
});
export const FARM_PRODUCTS = Object.freeze({ egg: Object.freeze({ price: 3 }), milk: Object.freeze({ price: 12 }) });
// Đồ dâng lên Tam Bảo: nông sản và sữa (không dâng trứng).
const OFFERABLE = (item) => item === 'milk' || (Object.hasOwn(FARM_CROPS, item) && FARM_CROPS[item].price > 0);

// Nâng cấp: chuồng gà (chỗ), chuồng bò (chỗ), kho (sức chứa). Bậc 0 có sẵn.
export const FARM_UPGRADES = Object.freeze({
  coop: Object.freeze([{ slots: 3 }, { slots: 6, level: 8, price: 150 }, { slots: 9, level: 14, price: 400 }]),
  barn: Object.freeze([{ slots: 1 }, { slots: 2, level: 10, price: 300 }, { slots: 3, level: 18, price: 800 }]),
  storage: Object.freeze([{ capacity: 50 }, { capacity: 75, level: 4, price: 100 }, { capacity: 100, level: 8, price: 200 },
    { capacity: 125, level: 12, price: 350 }, { capacity: 150, level: 16, price: 500 }]),
});

// Tổng kinh nghiệm để đạt cấp L: 10 · L · (L − 1) — cấp 2: 20, cấp 5: 200, cấp 10: 900, cấp 30: 8.700.
export const farmXpFor = (level) => 10 * level * (level - 1);
export function farmLevel(xp) {
  let level = 1;
  while (level < FARM_LEVEL_MAX && xp >= farmXpFor(level + 1)) level += 1;
  return level;
}
// Hạn mức chợ mỗi ngày (xu thu đủ giá): 30 ở cấp 1, tăng đều tới 90 ở cấp 30.
export const farmMarketCap = (level) => 30 + Math.round((60 * (Math.min(level, FARM_LEVEL_MAX) - 1)) / (FARM_LEVEL_MAX - 1));
// Ô đất thứ n (7…36): mở ở cấp 2…30, giá tăng dần.
export const farmPlotLevel = (slot) => (slot <= FARM_PLOTS_START ? 1 : 1 + Math.ceil(((slot - FARM_PLOTS_START) * (FARM_LEVEL_MAX - 1)) / (FARM_PLOTS_MAX - FARM_PLOTS_START)));
export const farmPlotPrice = (slot) => (slot <= FARM_PLOTS_START ? 0 : 8 * (slot - FARM_PLOTS_START));

const basePrice = (item) => (Object.hasOwn(FARM_PRODUCTS, item) ? FARM_PRODUCTS[item].price : FARM_CROPS[item]?.price || 0);
// Giá chợ trong ngày: lệch ±15 % theo (ngày, món) nên mọi người cùng thấy một giá.
export function farmPrice(day, item) {
  const base = basePrice(item);
  if (!base) return 0;
  const roll = createHash('sha256').update(`${day}:${item}`).digest().readUInt16BE(0) / 65_535;
  return Math.max(1, Math.round(base * (1 + 0.15 * (roll * 2 - 1))));
}
const SELLABLE = [...FARM_CROP_ORDER.filter((crop) => FARM_CROPS[crop].price > 0), ...Object.keys(FARM_PRODUCTS)];

// Bảng + loại giao dịch xu mới (SQLite không sửa được CHECK nên dựng lại coin_transactions, giữ nguyên dữ liệu).
export const FARM_MIGRATION = `CREATE TABLE coin_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('grant', 'buy_seed', 'sell_fruit', 'game_bet', 'game_win', 'game_refund', 'quest', 'chore', 'admin_adjustment', 'private_room', 'memorial', 'pet_food', 'pet_yield', 'room_spend', 'room_refund', 'farm_buy', 'farm_sell')),
    plant_type TEXT,
    quantity INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO coin_transactions_new SELECT * FROM coin_transactions;
  DROP TABLE coin_transactions;
  ALTER TABLE coin_transactions_new RENAME TO coin_transactions;
  CREATE INDEX IF NOT EXISTS coin_transactions_account ON coin_transactions(account_id, id DESC);
  CREATE TABLE IF NOT EXISTS farm_profiles (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    plots INTEGER NOT NULL DEFAULT ${FARM_PLOTS_START} CHECK (plots BETWEEN ${FARM_PLOTS_START} AND ${FARM_PLOTS_MAX}),
    coop INTEGER NOT NULL DEFAULT 0,
    barn INTEGER NOT NULL DEFAULT 0,
    storage INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS farm_plots (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND ${FARM_PLOTS_MAX}),
    crop TEXT NOT NULL,
    planted_at INTEGER NOT NULL,
    cycle INTEGER NOT NULL DEFAULT 0,
    growth_ms INTEGER NOT NULL DEFAULT 0,
    settled_at INTEGER NOT NULL,
    moist_until INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    tended INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, slot)
  );
  CREATE TABLE IF NOT EXISTS farm_animals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    kind TEXT NOT NULL CHECK (kind IN ('chicken', 'cow')),
    adult INTEGER NOT NULL DEFAULT 0,
    grow_ms INTEGER NOT NULL DEFAULT 0,
    prod_ms INTEGER NOT NULL DEFAULT 0,
    stored INTEGER NOT NULL DEFAULT 0 CHECK (stored >= 0),
    fed_until INTEGER NOT NULL,
    settled_at INTEGER NOT NULL,
    bought_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS farm_animals_account ON farm_animals(account_id, kind, id);
  CREATE TABLE IF NOT EXISTS farm_items (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (account_id, item)
  );
  CREATE TABLE IF NOT EXISTS farm_market (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    day TEXT NOT NULL,
    full INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, day)
  );`;

// Hàng xóm (giai đoạn 4): rổ chia sẻ ở cổng, điểm phước của chủ, sổ ghé thăm trong ngày (ai giúp gì, ai lấy / tặng gì).
// owner / actor là mã tài khoản hoặc `bot:<tên>` (nông trại bạn bot do server tự sinh, không có dòng nào khác).
export const FARM_SOCIAL_MIGRATION = `CREATE TABLE IF NOT EXISTS farm_basket (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (account_id, item)
  );
  CREATE TABLE IF NOT EXISTS farm_social (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    blessings INTEGER NOT NULL DEFAULT 0 CHECK (blessings >= 0)
  );
  CREATE TABLE IF NOT EXISTS farm_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    item TEXT,
    count INTEGER NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    day TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS farm_log_owner ON farm_log(owner, day);
  CREATE INDEX IF NOT EXISTS farm_log_actor ON farm_log(actor, day);`;

// Giới hạn hàng xóm (KE_HOACH_NONG_TRAI.md mục 4.7, 6.6). Xu từ giúp đỡ chỉ có khi đã là bạn từ 24 giờ (chống nick phụ).
export const FARM_HELP_PER_FARM = 5;
export const FARM_HELP_COIN_CAP = 10;
export const FARM_FRIEND_MIN_MS = 24 * HOUR;
export const FARM_TAKE_PER_FARM = 2;
export const FARM_TAKE_BOT_CAP = 4;
export const FARM_BASKET_MAX = 20;
export const FARM_GIFT_PER_DAY = 3;
export const FARM_GIFT_MAX_QUANTITY = 10;
const SOCIAL_ACTIONS = ['help', 'take', 'gift'];
export const FARM_SOCIAL_ACTIONS = Object.freeze(SOCIAL_ACTIONS);
const HELP_TASKS = ['water', 'tend', 'feed'];

export class FarmError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const ACTIONS = ['plant', 'water', 'tend', 'harvest', 'buyAnimal', 'feed', 'collect', 'buy', 'sell', 'offer', 'expand', 'upgrade', 'share', 'unshare'];
export const FARM_ACTIONS = Object.freeze(ACTIONS);

// Cỏ / sâu của một lứa: định sẵn theo hạt ngẫu nhiên lúc gieo (không cần việc nền), mọc khi cây lớn tới mốc. Cây chín
// trong 1 giờ trở xuống (rau muống, cà chua) không có cỏ / sâu.
function issuesOf(row, need) {
  if (need <= HOUR) return [];
  const seed = row.seed;
  const list = [];
  if (seed % 100 < 45) list.push({ bit: 1, kind: 'weed', at: 0.2 + ((seed >>> 7) % 50) / 100 });
  if ((seed >>> 13) % 100 < 35) list.push({ bit: 2, kind: 'pest', at: 0.3 + ((seed >>> 19) % 50) / 100 });
  return list;
}

const needOf = (row) => {
  const crop = FARM_CROPS[row.crop];
  return row.cycle > 0 && crop.regrow ? crop.regrow.ms : crop.growMs;
};

// Cây lớn trong khoảng [settled_at, now] phần đất còn ẩm. Không ghi xuống cơ sở dữ liệu (thao tác tự lưu).
function settlePlot(row, at) {
  const need = needOf(row);
  if (row.growth_ms < need) {
    const end = Math.min(at, row.moist_until);
    if (end > row.settled_at) row.growth_ms = Math.min(need, row.growth_ms + (end - row.settled_at));
  }
  row.settled_at = Math.max(row.settled_at, at);
  return row;
}
const presentIssues = (row) => {
  const need = needOf(row);
  return issuesOf(row, need).filter((item) => row.growth_ms >= item.at * need && !(row.tended & item.bit));
};

// Con vật trong khoảng [settled_at, now] phần còn no: con non lớn trước, phần no còn lại (con lớn) sinh sản phẩm.
function settleAnimal(row, at) {
  const def = FARM_ANIMALS[row.kind];
  const end = Math.min(at, row.fed_until);
  if (end > row.settled_at) {
    let span = end - row.settled_at;
    if (!row.adult) {
      const used = Math.min(span, def.growMs - row.grow_ms);
      row.grow_ms += used;
      span -= used;
      if (row.grow_ms >= def.growMs) row.adult = 1;
    }
    if (row.adult && span > 0 && row.stored < def.cap) {
      row.prod_ms += span;
      const made = Math.floor(row.prod_ms / def.cycleMs);
      row.stored = Math.min(def.cap, row.stored + made);
      row.prod_ms = row.stored >= def.cap ? 0 : row.prod_ms - made * def.cycleMs;
    }
  }
  row.settled_at = Math.max(row.settled_at, at);
  return row;
}

// Nông trại của bạn bot: sinh theo (tên, giờ) nên không cần lưu hay chạy việc nền, nhưng cư xử như ruộng người thật: cấp
// tăng dần theo ngày, mỗi ô trồng một loài cả tuần (gieo → lớn → chín chờ thu → bỏ trống một lúc → gieo lại), ô cây dài
// ngày có lúc khô vì chủ không tưới kịp, cỏ / sâu mọc theo lứa, gà bò đói giữa các bữa chủ cho ăn, rổ chủ bày mỗi ngày.
// `memory` = việc mọi người đã làm ở ruộng này (như ruộng thật, ai ghé cũng thấy cùng một cảnh): `water` / `tend`
// (Map ô → mốc làm), `feed` (Map loài → mốc cho ăn), `taken` (món đã bị lấy khỏi rổ hôm nay). Tưới giữ ẩm 6 giờ, nhổ cỏ
// xong cả lứa, cho ăn no một bữa.
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const BOT_FARM_START = '2026-11-01';
const roll = (...parts) => createHash('sha256').update(parts.join('|')).digest();
const dayNumber = (day) => Math.floor(Date.parse(`${day}T12:00:00Z`) / DAY);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export function farmBotFarm(name, day, at, { water = new Map(), tend = new Map(), feed = new Map(), taken = {} } = {}) {
  const base = roll('farm-bot', name);
  const days = Math.max(0, dayNumber(day) - dayNumber(BOT_FARM_START));
  const level = Math.min(12 + (base[2] % 10), 2 + (base[0] % 8) + Math.floor(days / (4 + (base[1] % 6))));
  const plotsOpen = Math.min(FARM_PLOTS_MAX, FARM_PLOTS_START + Math.floor((level - 1) * 1.2));
  const crops = FARM_CROP_ORDER.filter((crop) => FARM_CROPS[crop].level <= level);
  const recent = crops.slice(-4);
  const plots = [];
  for (let slot = 1; slot <= plotsOpen; slot += 1) {
    const week = Math.floor((at + roll('farm-bot', name, 'slot', slot).readUInt32BE(0)) / WEEK);
    const w = roll('farm-bot', name, slot, week);
    if (w[0] % 100 < 12) continue;
    // Thường trồng các loài mới mở (người chơi hay chọn cây giá cao vừa mở), thỉnh thoảng loài bất kỳ.
    const crop = w[1] % 100 < 65 ? recent[w[2] % recent.length] : crops[w[2] % crops.length];
    const need = FARM_CROPS[crop].growMs;
    const ripeWait = Math.min(4 * HOUR, Math.max(20 * MINUTE, need * 0.4));
    const period = need + ripeWait + (10 + (w[3] % 50)) * MINUTE;
    const phase = at + w.readUInt32BE(4);
    const t = phase % period;
    if (t >= need + ripeWait) continue;
    const start = at - t;
    const c = roll('farm-bot', name, slot, week, Math.floor(phase / period));
    const ripe = t >= need;
    const progress = Math.min(1, t / need);
    // Khung 6 giờ đầu đất ẩm sẵn (vừa gieo); các khung sau chủ tưới kịp ~60 %.
    const window = Math.floor(t / FARM_MOIST_MS);
    const ownerWatered = window === 0 || c[8 + Math.min(window, 23)] % 100 < 60;
    const wateredAt = water.get(slot) || 0;
    const issues = ripe || (tend.get(slot) || 0) >= start || need <= HOUR ? [] : [
      ...(c[0] % 100 < 30 && progress > 0.2 + (c[1] % 40) / 100 ? ['weed'] : []),
      ...(c[2] % 100 < 25 && progress > 0.3 + (c[3] % 40) / 100 ? ['pest'] : []),
    ];
    plots.push({
      slot, crop,
      stage: ripe ? 'ripe' : progress < 0.15 ? 'seed' : progress < 0.5 ? 'sprout' : 'growing',
      progress: Math.round(progress * 1000) / 1000,
      dry: !ripe && !ownerWatered && !(wateredAt >= start && wateredAt > at - FARM_MOIST_MS),
      issues,
    });
  }
  // Gà / bò: số con theo cấp; mỗi bữa (fullMs) chủ cho ăn kịp ~55 %, khách cho ăn thì no một bữa.
  const animals = [];
  const counts = {
    chicken: level >= FARM_ANIMALS.chicken.level ? 2 + (base[3] % 2) + (level >= 10 ? 1 : 0) : 0,
    cow: level >= FARM_ANIMALS.cow.level ? 1 + (level >= 10 ? 1 : 0) : 0,
  };
  for (const [kind, count] of Object.entries(counts)) {
    const def = FARM_ANIMALS[kind];
    const phase = at + roll('farm-bot', name, kind).readUInt32BE(0);
    const m = roll('farm-bot', name, kind, Math.floor(phase / def.fullMs));
    const hungry = m[0] % 100 >= 55 && !((feed.get(kind) || 0) > at - def.fullMs);
    for (let index = 0; index < count; index += 1) {
      animals.push({ id: animals.length + 1, kind, adult: true, stored: m[1 + index] % (def.cap + 1), cap: def.cap, hungry });
    }
  }
  // Rổ chia sẻ: chủ bày 2–3 món mỗi ngày; ai lấy thì vơi cho mọi người.
  const basket = {};
  const goods = [...crops.filter((crop) => FARM_CROPS[crop].price > 0), ...(counts.chicken ? ['egg'] : []), ...(counts.cow ? ['milk'] : [])];
  const pick = roll('farm-bot', name, day, 'basket');
  for (let index = 0; index < 2 + (pick[0] % 2); index += 1) {
    const item = goods[pick[index + 1] % goods.length];
    basket[item] = (basket[item] || 0) + 2 + (pick[index + 4] % 4);
  }
  let takenToday = 0;
  for (const [item, quantity] of Object.entries(taken)) {
    takenToday += quantity;
    if (basket[item]) basket[item] = Math.max(0, basket[item] - quantity);
  }
  for (const item of Object.keys(basket)) if (!basket[item]) delete basket[item];
  const blessings = 4 + (base.readUInt16BE(4) % 30) + Math.floor((days * (1 + (base[6] % 3))) / 2) + takenToday;
  return { level, plotsOpen, plots, animals, basket, blessings };
}

// db, now, today, changeCoins, ensureWallet, transaction, q (câu lệnh của Vườn Công Đức: account, request, saveRequest,
// offering), GardenError (lỗi nghiệp vụ của ví, vd. thiếu xu) do createGardenStore truyền vào.
export function createFarm({ db, now, today, changeCoins, ensureWallet, transaction, q: gardenQ, GardenError }) {
  const q = {
    profile: db.prepare('SELECT * FROM farm_profiles WHERE account_id = ?'),
    insertProfile: db.prepare('INSERT OR IGNORE INTO farm_profiles (account_id, created_at) VALUES (?, ?)'),
    saveProfile: db.prepare('UPDATE farm_profiles SET xp = ?, plots = ?, coop = ?, barn = ?, storage = ? WHERE account_id = ?'),
    plots: db.prepare('SELECT * FROM farm_plots WHERE account_id = ? ORDER BY slot'),
    plot: db.prepare('SELECT * FROM farm_plots WHERE account_id = ? AND slot = ?'),
    insertPlot: db.prepare(`INSERT INTO farm_plots (account_id, slot, crop, planted_at, cycle, growth_ms, settled_at, moist_until, seed, tended)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, 0)`),
    savePlot: db.prepare('UPDATE farm_plots SET cycle = ?, growth_ms = ?, settled_at = ?, moist_until = ?, seed = ?, tended = ? WHERE account_id = ? AND slot = ?'),
    deletePlot: db.prepare('DELETE FROM farm_plots WHERE account_id = ? AND slot = ?'),
    animals: db.prepare('SELECT * FROM farm_animals WHERE account_id = ? ORDER BY id'),
    insertAnimal: db.prepare(`INSERT INTO farm_animals (account_id, kind, adult, grow_ms, prod_ms, stored, fed_until, settled_at, bought_at)
      VALUES (?, ?, 0, 0, 0, 0, ?, ?, ?)`),
    saveAnimal: db.prepare('UPDATE farm_animals SET adult = ?, grow_ms = ?, prod_ms = ?, stored = ?, fed_until = ?, settled_at = ? WHERE id = ?'),
    items: db.prepare('SELECT item, quantity FROM farm_items WHERE account_id = ? AND quantity > 0'),
    addItem: db.prepare(`INSERT INTO farm_items (account_id, item, quantity) VALUES (?, ?, ?)
      ON CONFLICT(account_id, item) DO UPDATE SET quantity = quantity + excluded.quantity`),
    useItem: db.prepare('UPDATE farm_items SET quantity = quantity - ? WHERE account_id = ? AND item = ? AND quantity >= ?'),
    market: db.prepare('SELECT full FROM farm_market WHERE account_id = ? AND day = ?'),
    addMarket: db.prepare(`INSERT INTO farm_market (account_id, day, full) VALUES (?, ?, ?)
      ON CONFLICT(account_id, day) DO UPDATE SET full = full + excluded.full`),
    basket: db.prepare('SELECT item, quantity FROM farm_basket WHERE account_id = ? AND quantity > 0'),
    addBasket: db.prepare(`INSERT INTO farm_basket (account_id, item, quantity) VALUES (?, ?, ?)
      ON CONFLICT(account_id, item) DO UPDATE SET quantity = quantity + excluded.quantity`),
    useBasket: db.prepare('UPDATE farm_basket SET quantity = quantity - ? WHERE account_id = ? AND item = ? AND quantity >= ?'),
    social: db.prepare('SELECT blessings FROM farm_social WHERE account_id = ?'),
    bless: db.prepare(`INSERT INTO farm_social (account_id, blessings) VALUES (?, ?)
      ON CONFLICT(account_id) DO UPDATE SET blessings = blessings + excluded.blessings`),
    log: db.prepare('INSERT INTO farm_log (owner, actor, actor_name, kind, item, count, coins, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    visitors: db.prepare(`SELECT actor, actor_name AS name, kind, item, count, at FROM farm_log
      WHERE owner = ? AND day = ? AND actor <> owner ORDER BY at DESC, id DESC LIMIT 30`),
    pairLog: db.prepare('SELECT kind, item, count FROM farm_log WHERE actor = ? AND owner = ? AND day = ?'),
    helpsDone: db.prepare(`SELECT COALESCE(SUM(count), 0) AS n FROM farm_log WHERE actor = ? AND owner = ? AND day = ?
      AND kind IN ('water', 'tend', 'feed')`),
    takesDone: db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM farm_log WHERE actor = ? AND owner = ? AND day = ? AND kind = 'take'"),
    botTakes: db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM farm_log WHERE actor = ? AND day = ? AND kind = 'take' AND owner LIKE 'bot:%'"),
    coinsToday: db.prepare('SELECT COALESCE(SUM(coins), 0) AS n FROM farm_log WHERE actor = ? AND day = ?'),
    giftsToday: db.prepare("SELECT COUNT(*) AS n FROM farm_log WHERE actor = ? AND day = ? AND kind = 'gift'"),
    // Mọi việc ở một nông trại bot trong vài ngày gần đây (của mọi người): dựng lại ô đã tưới / nhổ cỏ, con đã cho ăn, rổ.
    botLog: db.prepare('SELECT kind, item, count, day, at FROM farm_log WHERE owner = ? AND day >= ?'),
    // Bạn bot đã ghé nông trại chủ hôm nay (mỗi bạn một lượt).
    botVisits: db.prepare(`SELECT actor, MAX(at) AS at FROM farm_log WHERE owner = ? AND day = ? AND actor LIKE 'bot:%'
      GROUP BY actor`),
    lastVisit: db.prepare('SELECT MAX(at) AS at FROM farm_log WHERE owner = ? AND day = ? AND actor <> owner'),
    hasProfile: db.prepare('SELECT 1 AS hit FROM farm_profiles WHERE account_id = ?'),
  };

  function profileOf(accountId) {
    q.insertProfile.run(accountId, now());
    return q.profile.get(accountId);
  }
  const itemsOf = (accountId) => Object.fromEntries(q.items.all(accountId).map((row) => [row.item, row.quantity]));
  const basketOf = (accountId) => Object.fromEntries(q.basket.all(accountId).map((row) => [row.item, row.quantity]));
  const blessingsOf = (accountId) => q.social.get(accountId)?.blessings || 0;
  // Sổ ghé thăm hôm nay của chủ (mới trước): ai giúp / lấy ở rổ / tặng gì. Bạn bot ghi y như bạn người.
  const visitorsOf = (accountId, day) => q.visitors.all(accountId, day).map((row) => ({
    name: row.name, kind: row.kind, count: row.count, at: row.at,
    ...(row.kind === 'take' || row.kind === 'gift' || row.kind === 'feed' ? { item: row.item } : {}),
  }));
  const capacityOf = (profile) => FARM_UPGRADES.storage[profile.storage].capacity;
  // Kho tính mọi món (nông sản, trứng, sữa, cỏ khô).
  const usedOf = (items) => Object.values(items).reduce((sum, value) => sum + value, 0);

  function plotView(row, at) {
    const crop = FARM_CROPS[row.crop];
    const need = needOf(row);
    const ripe = row.growth_ms >= need;
    const progress = Math.min(1, row.growth_ms / need);
    const remaining = need - row.growth_ms;
    const moistLeft = row.moist_until - at;
    const view = {
      slot: row.slot, crop: row.crop,
      stage: ripe ? 'ripe' : progress < 0.15 ? 'seed' : progress < 0.5 ? 'sprout' : 'growing',
      progress: Math.round(progress * 1000) / 1000,
      dry: !ripe && moistLeft <= 0,
      issues: presentIssues(row).map((item) => item.kind),
      ...(crop.regrow ? { harvestsLeft: crop.regrow.times + 1 - row.cycle } : {}),
    };
    if (!ripe) {
      if (moistLeft >= remaining) view.ripeAt = at + remaining;
      else view.dryAt = row.moist_until;
      view.remainingMs = remaining;
    }
    return view;
  }

  function animalView(row, at) {
    const def = FARM_ANIMALS[row.kind];
    const full = row.fed_until > at;
    const view = { id: row.id, kind: row.kind, adult: Boolean(row.adult), stored: row.stored, cap: def.cap, fedUntil: row.fed_until, hungry: !full };
    if (!row.adult) view.growLeftMs = def.growMs - row.grow_ms;
    else if (full && row.stored < def.cap) view.nextAt = at + (def.cycleMs - row.prod_ms);
    return view;
  }

  function nextUpgrade(target, tier, level) {
    const next = FARM_UPGRADES[target][tier + 1];
    return next ? { ...next, ready: level >= next.level } : null;
  }

  function view(accountId) {
    const at = now();
    const day = today();
    const profile = profileOf(accountId);
    const level = farmLevel(profile.xp);
    const items = itemsOf(accountId);
    const plots = q.plots.all(accountId).map((row) => plotView(settlePlot(row, at), at));
    const animals = q.animals.all(accountId).map((row) => animalView(settleAnimal(row, at), at));
    const cap = farmMarketCap(level);
    const nextSlot = profile.plots + 1;
    return {
      at, day,
      coins: ensureWallet(accountId),
      level, xp: profile.xp, xpFloor: farmXpFor(level), xpNext: level < FARM_LEVEL_MAX ? farmXpFor(level + 1) : null,
      plotsOpen: profile.plots,
      plots, animals, items,
      coop: { tier: profile.coop, slots: FARM_UPGRADES.coop[profile.coop].slots, next: nextUpgrade('coop', profile.coop, level) },
      barn: { tier: profile.barn, slots: FARM_UPGRADES.barn[profile.barn].slots, next: nextUpgrade('barn', profile.barn, level) },
      storage: { tier: profile.storage, capacity: capacityOf(profile), used: usedOf(items), next: nextUpgrade('storage', profile.storage, level) },
      expand: nextSlot <= FARM_PLOTS_MAX ? { slot: nextSlot, level: farmPlotLevel(nextSlot), price: farmPlotPrice(nextSlot), ready: level >= farmPlotLevel(nextSlot) } : null,
      basket: { items: basketOf(accountId), max: FARM_BASKET_MAX },
      blessings: blessingsOf(accountId),
      visitors: visitorsOf(accountId, day),
      market: {
        cap, full: q.market.get(accountId, day)?.full || 0, overPercent: FARM_OVER_CAP_PERCENT,
        prices: Object.fromEntries(SELLABLE.map((item) => [item, farmPrice(day, item)])),
      },
      catalog: {
        crops: FARM_CROP_ORDER.map((id) => ({ id, ...FARM_CROPS[id], growMs: FARM_CROPS[id].growMs, unlocked: level >= FARM_CROPS[id].level })),
        animals: Object.entries(FARM_ANIMALS).map(([id, def]) => ({ id, ...def, unlocked: level >= def.level })),
        hayPrice: FARM_HAY_PRICE,
        moistMs: FARM_MOIST_MS,
      },
    };
  }

  // ---- Thao tác (đã ở trong giao dịch). Trả { gained: { xp, items, coins }, ...chi tiết } ----
  const slotList = (input, profile) => {
    const list = Array.isArray(input.slots) ? input.slots : [input.slot];
    if (!list.length || list.length > FARM_PLOTS_MAX || !list.every((slot) => Number.isSafeInteger(slot) && slot >= 1 && slot <= profile.plots)) throw new FarmError('INVALID');
    return [...new Set(list)];
  };
  const quantityOf = (value) => {
    if (!Number.isSafeInteger(value) || value < 1 || value > FARM_MAX_QUANTITY) throw new FarmError('INVALID');
    return value;
  };
  const savePlot = (row, accountId) => q.savePlot.run(row.cycle, row.growth_ms, row.settled_at, row.moist_until, row.seed, row.tended, accountId, row.slot);
  const saveAnimal = (row) => q.saveAnimal.run(row.adult, row.grow_ms, row.prod_ms, row.stored, row.fed_until, row.settled_at, row.id);
  const takeItem = (accountId, item, quantity) => q.useItem.run(quantity, accountId, item, quantity).changes === 1;
  function storeItem(accountId, profile, item, quantity) {
    const room = capacityOf(profile) - usedOf(itemsOf(accountId));
    if (room < quantity) throw new FarmError('STORAGE_FULL');
    q.addItem.run(accountId, item, quantity);
  }

  const actions = {
    // Gieo (một ô hoặc nhiều ô trống): trả tiền hạt lúc gieo, đất ẩm sẵn.
    plant(accountId, profile, level, at, input) {
      const crop = FARM_CROPS[input.crop];
      if (!crop) throw new FarmError('INVALID');
      if (level < crop.level) throw new FarmError('LOCKED');
      const slots = slotList(input, profile).filter((slot) => !q.plot.get(accountId, slot));
      if (!slots.length) throw new FarmError('PLOT_TAKEN');
      changeCoins(accountId, -crop.seed * slots.length, 'farm_buy', input.crop, slots.length);
      for (const slot of slots) q.insertPlot.run(accountId, slot, input.crop, at, at, at + FARM_MOIST_MS, randomInt(0, 2 ** 30));
      return { slots, xp: slots.length };
    },
    // Tưới: cây đang lớn mà đất đã khô hoặc sắp khô (còn dưới nửa thời gian ẩm). Kinh nghiệm khi tưới đất đã khô.
    water(accountId, profile, level, at, input) {
      const done = [];
      let xp = 0;
      for (const slot of slotList(input, profile)) {
        const row = q.plot.get(accountId, slot);
        if (!row) continue;
        settlePlot(row, at);
        if (row.growth_ms >= needOf(row) || row.moist_until - at > FARM_MOIST_MS / 2) continue;
        if (row.moist_until <= at) xp += 1;
        row.moist_until = at + FARM_MOIST_MS;
        savePlot(row, accountId);
        done.push(slot);
      }
      if (!done.length) throw new FarmError('NOT_DRY');
      return { slots: done, xp };
    },
    // Nhổ cỏ, bắt sâu: dọn hết cỏ / sâu đang có ở ô.
    tend(accountId, profile, level, at, input) {
      const done = [];
      let xp = 0;
      for (const slot of slotList(input, profile)) {
        const row = q.plot.get(accountId, slot);
        if (!row) continue;
        settlePlot(row, at);
        const present = presentIssues(row);
        if (!present.length) continue;
        for (const item of present) row.tended |= item.bit;
        xp += 2 * present.length;
        savePlot(row, accountId);
        done.push(slot);
      }
      if (!done.length) throw new FarmError('NOTHING_TO_TEND');
      return { slots: done, xp };
    },
    // Thu hoạch các ô đã chín vào kho. Cây lâu năm còn lứa thì lớn lại từ đầu lứa sau.
    harvest(accountId, profile, level, at, input) {
      const done = [];
      const got = {};
      let xp = 0;
      let full = false;
      for (const slot of slotList(input, profile)) {
        const row = q.plot.get(accountId, slot);
        if (!row) continue;
        settlePlot(row, at);
        if (row.growth_ms < needOf(row)) continue;
        const crop = FARM_CROPS[row.crop];
        const amount = Math.max(1, Math.round(crop.yield * (1 - ISSUE_PENALTY * presentIssues(row).length)));
        try {
          storeItem(accountId, profile, row.crop, amount);
        } catch (error) {
          if (error.code !== 'STORAGE_FULL') throw error;
          full = true;
          break;
        }
        got[row.crop] = (got[row.crop] || 0) + amount;
        xp += crop.xp;
        if (crop.regrow && row.cycle < crop.regrow.times) {
          row.cycle += 1;
          row.growth_ms = 0;
          row.settled_at = at;
          row.seed = randomInt(0, 2 ** 30);
          row.tended = 0;
          savePlot(row, accountId);
        } else q.deletePlot.run(accountId, slot);
        done.push(slot);
      }
      if (!done.length) throw new FarmError(full ? 'STORAGE_FULL' : 'NOT_RIPE');
      return { slots: done, xp, items: got, ...(full ? { storageFull: true } : {}) };
    },
    buyAnimal(accountId, profile, level, at, input) {
      const def = FARM_ANIMALS[input.kind];
      if (!def) throw new FarmError('INVALID');
      if (level < def.level) throw new FarmError('LOCKED');
      const slots = FARM_UPGRADES[input.kind === 'chicken' ? 'coop' : 'barn'][input.kind === 'chicken' ? profile.coop : profile.barn].slots;
      if (q.animals.all(accountId).filter((row) => row.kind === input.kind).length >= slots) throw new FarmError('PEN_FULL');
      changeCoins(accountId, -def.price, 'farm_buy', input.kind, 1);
      q.insertAnimal.run(accountId, input.kind, at + def.fullMs, at, at);
      return { xp: 1 };
    },
    // Cho ăn mọi con đang đói (hoặc sắp đói) cùng loài, lấy thức ăn trong kho theo thứ tự trong `food`.
    feed(accountId, profile, level, at, input) {
      const def = FARM_ANIMALS[input.kind];
      if (!def) throw new FarmError('INVALID');
      const hungry = q.animals.all(accountId).filter((row) => row.kind === input.kind).map((row) => settleAnimal(row, at))
        .filter((row) => row.fed_until - at <= 30 * MINUTE);
      if (!hungry.length) throw new FarmError('NOT_HUNGRY');
      const ids = [];
      const used = {};
      for (const row of hungry) {
        const food = def.food.find((item) => takeItem(accountId, item, def.eat));
        if (!food) break;
        used[food] = (used[food] || 0) + def.eat;
        row.fed_until = at + def.fullMs;
        saveAnimal(row);
        ids.push(row.id);
      }
      for (const row of hungry) if (!ids.includes(row.id)) saveAnimal(row);
      if (!ids.length) throw new FarmError('NO_FOOD');
      return { animals: ids, used, xp: ids.length };
    },
    // Nhặt trứng / vắt sữa mọi con cùng loài vào kho (kho đầy thì lấy tới khi đầy).
    collect(accountId, profile, level, at, input) {
      const def = FARM_ANIMALS[input.kind];
      if (!def) throw new FarmError('INVALID');
      const rows = q.animals.all(accountId).filter((row) => row.kind === input.kind).map((row) => settleAnimal(row, at));
      let room = capacityOf(profile) - usedOf(itemsOf(accountId));
      let taken = 0;
      const ids = [];
      for (const row of rows) {
        const take = Math.min(row.stored, room);
        if (take > 0) {
          row.stored -= take;
          room -= take;
          taken += take;
          ids.push(row.id);
        }
        saveAnimal(row);
      }
      if (!taken) throw new FarmError(rows.some((row) => row.stored > 0) ? 'STORAGE_FULL' : 'NOTHING_TO_COLLECT');
      q.addItem.run(accountId, def.product, taken);
      return { animals: ids, items: { [def.product]: taken }, xp: def.xp * taken };
    },
    // Mua cỏ khô cho bò ở chợ.
    buy(accountId, profile, level, at, input) {
      if (input.item !== 'hay') throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity);
      changeCoins(accountId, -FARM_HAY_PRICE * quantity, 'farm_buy', 'hay', quantity);
      storeItem(accountId, profile, 'hay', quantity);
      return { items: { hay: quantity } };
    },
    // Bán ở chợ: giá trong ngày, tính đủ giá tới hạn mức của cấp, phần vượt chỉ được 20 %.
    sell(accountId, profile, level, at, input) {
      if (!SELLABLE.includes(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity);
      if (!takeItem(accountId, input.item, quantity)) throw new FarmError('NOT_ENOUGH');
      const day = today();
      const total = farmPrice(day, input.item) * quantity;
      const left = Math.max(0, farmMarketCap(level) - (q.market.get(accountId, day)?.full || 0));
      const full = Math.min(total, left);
      const paid = full + Math.floor(((total - full) * FARM_OVER_CAP_PERCENT) / 100);
      if (full) q.addMarket.run(accountId, day, full);
      if (paid) changeCoins(accountId, paid, 'farm_sell', input.item, quantity);
      return { sold: { item: input.item, quantity, paid, full, over: total - full } };
    },
    // Dâng nông sản / sữa lên Tam Bảo (tính nhiệm vụ "Dâng quả" hằng ngày như Vườn Công Đức).
    offer(accountId, profile, level, at, input) {
      if (!OFFERABLE(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity ?? 1);
      if (!takeItem(accountId, input.item, quantity)) throw new FarmError('NOT_ENOUGH');
      gardenQ.offering.run(accountId, input.item, quantity, at);
      return { offered: { item: input.item, quantity }, xp: 1 };
    },
    expand(accountId, profile, level) {
      const slot = profile.plots + 1;
      if (slot > FARM_PLOTS_MAX) throw new FarmError('MAXED');
      if (level < farmPlotLevel(slot)) throw new FarmError('LOCKED');
      changeCoins(accountId, -farmPlotPrice(slot), 'farm_buy', 'plot', slot);
      profile.plots = slot;
      return { slot };
    },
    upgrade(accountId, profile, level, at, input) {
      if (!Object.hasOwn(FARM_UPGRADES, input.target)) throw new FarmError('INVALID');
      const next = FARM_UPGRADES[input.target][profile[input.target] + 1];
      if (!next) throw new FarmError('MAXED');
      if (level < next.level) throw new FarmError('LOCKED');
      changeCoins(accountId, -next.price, 'farm_buy', input.target, profile[input.target] + 1);
      profile[input.target] += 1;
      return { target: input.target, tier: profile[input.target] };
    },
    // Bỏ nông sản / trứng / sữa từ kho vào rổ chia sẻ ở cổng (rổ chứa tối đa 20 món, không tính vào kho).
    share(accountId, profile, level, at, input) {
      if (!SELLABLE.includes(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity ?? 1);
      if (usedOf(basketOf(accountId)) + quantity > FARM_BASKET_MAX) throw new FarmError('BASKET_FULL');
      if (!takeItem(accountId, input.item, quantity)) throw new FarmError('NOT_ENOUGH');
      q.addBasket.run(accountId, input.item, quantity);
      return { shared: { item: input.item, quantity } };
    },
    // Lấy lại từ rổ về kho.
    unshare(accountId, profile, level, at, input) {
      if (!SELLABLE.includes(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity ?? 1);
      if (q.useBasket.run(quantity, accountId, input.item, quantity).changes !== 1) throw new FarmError('NOT_ENOUGH');
      storeItem(accountId, profile, input.item, quantity);
      return { unshared: { item: input.item, quantity } };
    },
  };

  // ---- Hàng xóm ----
  // owner: { accountId } (nông trại người) hoặc { bot: tên } (bạn bot). Khóa trong sổ: mã tài khoản / `bot:<tên>`.
  const ownerKey = (owner) => (owner.bot ? `bot:${owner.bot}` : owner.accountId);
  // Việc mọi người đã làm ở nông trại bot (2 ngày gần đây đủ cho lứa cây dài nhất và một bữa của bò).
  function botMemory(owner, day) {
    const memory = { water: new Map(), tend: new Map(), feed: new Map(), taken: {} };
    const latest = (map, key, at) => map.set(key, Math.max(map.get(key) || 0, at));
    for (const row of q.botLog.all(ownerKey(owner), shiftDay(day, -2))) {
      if (row.kind === 'water' || row.kind === 'tend') for (const slot of String(row.item || '').split(',')) latest(memory[row.kind], Number(slot), row.at);
      else if (row.kind === 'feed') latest(memory.feed, row.item, row.at);
      else if (row.kind === 'take' && row.day === day) memory.taken[row.item] = (memory.taken[row.item] || 0) + row.count;
    }
    return memory;
  }

  // Nông trại người khác như khách thấy: ô, con, rổ (không có ví, kho, chợ).
  function publicFarm(viewerId, owner, at, day) {
    if (owner.bot) {
      // Món lấy từ rổ các nông trại bot có trần chung mỗi ngày (FARM_TAKE_BOT_CAP, chống nuôi nhiều bạn bot để lấy đồ):
      // phần vượt trần không hiện trong rổ (như rổ đã có người lấy), không báo lỗi riêng.
      const farm = farmBotFarm(owner.bot, day, at, botMemory(owner, day));
      let room = Math.max(0, FARM_TAKE_BOT_CAP - q.botTakes.get(viewerId, day).n);
      for (const item of Object.keys(farm.basket)) {
        const keep = Math.min(farm.basket[item], room);
        room -= keep;
        if (keep) farm.basket[item] = keep;
        else delete farm.basket[item];
      }
      return farm;
    }
    const profile = profileOf(owner.accountId);
    return {
      level: farmLevel(profile.xp),
      plotsOpen: profile.plots,
      plots: q.plots.all(owner.accountId).map((row) => plotView(settlePlot(row, at), at)),
      animals: q.animals.all(owner.accountId).map((row) => {
        const { fedUntil, ...rest } = animalView(settleAnimal(row, at), at);
        return rest;
      }),
      basket: basketOf(owner.accountId),
      blessings: blessingsOf(owner.accountId),
    };
  }
  // Việc khách giúp được ngay: ô khô (đang lớn), ô có cỏ / sâu, loài đang đói.
  const needsOf = (farm) => ({
    water: farm.plots.filter((plot) => plot.dry).map((plot) => plot.slot),
    tend: farm.plots.filter((plot) => plot.issues.length).map((plot) => plot.slot),
    feed: [...new Set(farm.animals.filter((animal) => animal.hungry).map((animal) => animal.kind))],
  });
  function limitsOf(viewerId, owner, day) {
    const key = ownerKey(owner);
    const takes = q.takesDone.get(viewerId, key, day).n;
    return {
      helps: { done: q.helpsDone.get(viewerId, key, day).n, max: FARM_HELP_PER_FARM },
      takes: { done: takes, max: FARM_TAKE_PER_FARM, left: Math.max(0, FARM_TAKE_PER_FARM - takes) },
      coins: { today: q.coinsToday.get(viewerId, day).n, cap: FARM_HELP_COIN_CAP },
    };
  }

  // Giúp ở nông trại người: làm thật trên ô / con của chủ (thức ăn lấy ở kho chủ). Trả số việc đã làm.
  function helpOwner(ownerId, task, input, at, room) {
    const profile = profileOf(ownerId);
    if (task === 'feed') {
      const def = FARM_ANIMALS[input.kind];
      if (!def) throw new FarmError('INVALID');
      const hungry = q.animals.all(ownerId).filter((row) => row.kind === input.kind).map((row) => settleAnimal(row, at))
        .filter((row) => row.fed_until <= at);
      if (!hungry.length) throw new FarmError('NOT_HUNGRY');
      let done = 0;
      for (const row of hungry) {
        if (done < room && def.food.find((item) => takeItem(ownerId, item, def.eat))) {
          row.fed_until = at + def.fullMs;
          done += 1;
        }
        saveAnimal(row);
      }
      if (!done) throw new FarmError('NO_FOOD');
      return { done, item: input.kind };
    }
    const slots = slotList(input, profile);
    const done = [];
    for (const slot of slots) {
      if (done.length >= room) break;
      const row = q.plot.get(ownerId, slot);
      if (!row) continue;
      settlePlot(row, at);
      if (task === 'water') {
        if (row.growth_ms >= needOf(row) || row.moist_until > at) continue;
        row.moist_until = at + FARM_MOIST_MS;
      } else {
        const present = presentIssues(row);
        if (!present.length) continue;
        for (const item of present) row.tended |= item.bit;
      }
      savePlot(row, ownerId);
      done.push(slot);
    }
    if (!done.length) throw new FarmError(task === 'water' ? 'NOT_DRY' : 'NOTHING_TO_TEND');
    return { done: done.length, item: done.join(',') };
  }
  // Giúp ở nông trại bot: chỉ ghi sổ (nông trại bot dựng lại theo sổ, ai ghé sau cũng thấy đã làm).
  function helpBot(viewerId, owner, task, input, at, day, room) {
    const farm = publicFarm(viewerId, owner, at, day);
    const need = needsOf(farm);
    if (task === 'feed') {
      if (!need.feed.includes(input.kind)) throw new FarmError('NOT_HUNGRY');
      return { done: Math.min(room, farm.animals.filter((animal) => animal.kind === input.kind && animal.hungry).length), item: input.kind };
    }
    const list = Array.isArray(input.slots) ? input.slots : [input.slot];
    if (!list.length || list.length > FARM_PLOTS_MAX || !list.every(Number.isSafeInteger)) throw new FarmError('INVALID');
    const done = [...new Set(list)].filter((slot) => need[task].includes(slot)).slice(0, room);
    if (!done.length) throw new FarmError(task === 'water' ? 'NOT_DRY' : 'NOTHING_TO_TEND');
    return { done: done.length, item: done.join(',') };
  }

  const socialActions = {
    // Giúp: tưới ô khô, nhổ cỏ / bắt sâu, cho con đói ăn. Tối đa 5 việc mỗi nông trại mỗi ngày; người giúp được 1 kinh
    // nghiệm / việc và 1 xu / việc (khi đã là bạn từ 24 giờ, tối đa 10 xu / ngày từ mọi nông trại).
    help(actor, owner, input, at, day, options) {
      const task = input.task;
      if (!HELP_TASKS.includes(task)) throw new FarmError('INVALID');
      const room = FARM_HELP_PER_FARM - q.helpsDone.get(actor.accountId, ownerKey(owner), day).n;
      if (room <= 0) throw new FarmError('HELP_LIMIT');
      const { done, item } = owner.bot ? helpBot(actor.accountId, owner, task, input, at, day, room) : helpOwner(owner.accountId, task, input, at, room);
      const coins = options.paid ? Math.max(0, Math.min(done, FARM_HELP_COIN_CAP - q.coinsToday.get(actor.accountId, day).n)) : 0;
      if (coins) changeCoins(actor.accountId, coins, 'chore', 'farm_help', done);
      q.log.run(ownerKey(owner), actor.accountId, actor.name, task, item, done, coins, day, at);
      return { helped: { task, count: done, coins }, xp: done };
    },
    // Lấy ở rổ chia sẻ: tối đa 2 món mỗi nông trại mỗi ngày. Chủ được 1 điểm phước / món (nông trại bot: điểm tính theo sổ).
    take(actor, owner, input, at, day) {
      if (!SELLABLE.includes(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity ?? 1);
      if (quantity > limitsOf(actor.accountId, owner, day).takes.left) throw new FarmError('TAKE_LIMIT');
      if (owner.bot) {
        if ((publicFarm(actor.accountId, owner, at, day).basket[input.item] || 0) < quantity) throw new FarmError('NOT_ENOUGH');
      } else {
        if (q.useBasket.run(quantity, owner.accountId, input.item, quantity).changes !== 1) throw new FarmError('NOT_ENOUGH');
        q.bless.run(owner.accountId, quantity);
      }
      storeItem(actor.accountId, profileOf(actor.accountId), input.item, quantity);
      q.log.run(ownerKey(owner), actor.accountId, actor.name, 'take', input.item, quantity, 0, day, at);
      return { taken: { item: input.item, quantity } };
    },
    // Tặng bạn nông sản / trứng / sữa từ kho mình vào thẳng kho bạn: 3 lần / ngày, mỗi lần tối đa 10 món. Bạn bot nhận
    // quà như bạn người (API ghi lời tặng vào cuộc trò chuyện), quà chỉ rời kho người tặng.
    gift(actor, owner, input, at, day) {
      if (!SELLABLE.includes(input.item)) throw new FarmError('INVALID');
      const quantity = quantityOf(input.quantity ?? 1);
      if (quantity > FARM_GIFT_MAX_QUANTITY) throw new FarmError('INVALID');
      if (q.giftsToday.get(actor.accountId, day).n >= FARM_GIFT_PER_DAY) throw new FarmError('GIFT_LIMIT');
      if (!takeItem(actor.accountId, input.item, quantity)) throw new FarmError('NOT_ENOUGH');
      if (!owner.bot) {
        const profile = profileOf(owner.accountId);
        if (capacityOf(profile) - usedOf(itemsOf(owner.accountId)) < quantity) throw new FarmError('RECEIVER_FULL');
        q.addItem.run(owner.accountId, input.item, quantity);
      }
      q.log.run(ownerKey(owner), actor.accountId, actor.name, 'gift', input.item, quantity, 0, day, at);
      return { gifted: { item: input.item, quantity } };
    },
  };

  // Nông trại hàng xóm người xem đang thăm: trạng thái công khai + việc giúp được + giới hạn còn lại của người xem.
  function visit(viewerId, owner) {
    const at = now();
    const day = today();
    const farm = publicFarm(viewerId, owner, at, day);
    return { farm, needs: needsOf(farm), ...limitsOf(viewerId, owner, day) };
  }

  return {
    view,
    visit,
    // Một dòng trong danh sách Hàng xóm (null: bạn chưa mở nông trại). Không trả gì về phòng / vị trí của chủ.
    neighbor(viewerId, owner) {
      if (!owner.bot && !q.hasProfile.get(owner.accountId)) return null;
      const { farm, needs, helps, takes } = visit(viewerId, owner);
      const basket = Object.values(farm.basket).reduce((sum, value) => sum + value, 0);
      return {
        level: farm.level, blessings: farm.blessings,
        needs: { water: needs.water.length, tend: needs.tend.length, feed: needs.feed.length },
        ripe: farm.plots.filter((plot) => plot.stage === 'ripe').length,
        basket: Math.min(basket, takes.left), helped: helps.done, helpMax: helps.max,
      };
    },
    // Bạn bot ghé nông trại chủ như hàng xóm thật. Tính lúc chủ mở nông trại, giờ ghé lùi 10–90 phút trước đó (trạng thái
    // ô / con lúc ấy dựng lại được từ mốc server). Mỗi ngày tối đa 2 lượt của 2 bạn khác nhau (lượt đầu ~60 % số ngày,
    // lượt hai ~35 %, cách lượt trước ≥ 3 giờ). Mỗi lượt làm như người giúp, tổng ≤ 5 việc: tưới ≤ 3 ô khô, cho con đói ăn
    // bằng thức ăn trong kho chủ, còn sức thì nhổ cỏ / bắt sâu; đôi khi lấy 1 món ở rổ (chủ được điểm phước) hoặc tặng
    // 1–3 món của ruộng mình vào kho chủ. Không có gì để làm thì lượt đó chưa tính (lần mở sau thử lại).
    // botNames: tên bạn bot của chủ. Trả { name, at, water: [ô], tend: [ô], feed: [loài], took?, gift? } hoặc null.
    botVisit(ownerId, botNames) {
      if (!botNames?.length || !gardenQ.account.get(ownerId) || !q.hasProfile.get(ownerId)) return null;
      const day = today();
      const at = now();
      return transaction(() => {
        const visits = q.botVisits.all(ownerId, day);
        const turn = visits.length;
        if (turn >= 2) return null;
        const h = roll('farm-bot-visit', ownerId, day, turn);
        if (h[0] % 100 >= (turn === 0 ? 60 : 35)) return null;
        // Ghé sau mọi lượt đã ghi (sổ ghé thăm và dòng 📬 trên trang tính lượt mới theo giờ ghé).
        const visitAt = Math.max(at - (10 + (h[1] % 80)) * MINUTE, (q.lastVisit.get(ownerId, day)?.at || 0) + MINUTE);
        if (visitAt > at || visits.some((row) => visitAt - row.at < 3 * HOUR)) return null;
        const choices = botNames.filter((name) => !visits.some((row) => row.actor === `bot:${name}`));
        if (!choices.length) return null;
        const name = choices[h[2] % choices.length];
        const actor = `bot:${name}`;
        const profile = profileOf(ownerId);
        const result = { name, at: visitAt, water: [], tend: [], feed: [] };
        let room = FARM_HELP_PER_FARM;
        // Chỉ ô / con chưa đổi sau giờ ghé (trạng thái lúc ghé dựng lại đúng).
        const plots = q.plots.all(ownerId).filter((row) => row.settled_at <= visitAt).map((row) => settlePlot(row, visitAt));
        const changed = new Set();
        for (const row of plots) {
          if (result.water.length >= 3) break;
          if (row.growth_ms >= needOf(row) || row.moist_until > visitAt) continue;
          row.moist_until = visitAt + FARM_MOIST_MS;
          result.water.push(row.slot);
          changed.add(row);
          room -= 1;
        }
        for (const row of q.animals.all(ownerId)) {
          if (room <= 0) break;
          if (row.settled_at > visitAt) continue;
          settleAnimal(row, visitAt);
          const def = FARM_ANIMALS[row.kind];
          if (row.fed_until > visitAt || !def.food.find((item) => takeItem(ownerId, item, def.eat))) continue;
          row.fed_until = visitAt + def.fullMs;
          saveAnimal(row);
          result.feed.push(row.kind);
          room -= 1;
        }
        for (const row of plots) {
          if (room <= 0) break;
          const present = presentIssues(row);
          if (!present.length) continue;
          for (const item of present) row.tended |= item.bit;
          result.tend.push(row.slot);
          changed.add(row);
          room -= 1;
        }
        for (const row of changed) savePlot(row, ownerId);
        const basket = Object.keys(basketOf(ownerId));
        if (basket.length && h[3] % 100 < 35) {
          const item = basket[h[4] % basket.length];
          if (q.useBasket.run(1, ownerId, item, 1).changes === 1) {
            q.bless.run(ownerId, 1);
            result.took = { item, quantity: 1 };
          }
        }
        if (h[5] % 100 < 20) {
          const goods = Object.keys(farmBotFarm(name, day, visitAt).basket);
          const item = goods[h[6] % goods.length];
          const quantity = 1 + (h[7] % 3);
          if (item && capacityOf(profile) - usedOf(itemsOf(ownerId)) >= quantity) {
            q.addItem.run(ownerId, item, quantity);
            result.gift = { item, quantity };
          }
        }
        if (!result.water.length && !result.tend.length && !result.feed.length && !result.took && !result.gift) return null;
        const log = (kind, item, count) => q.log.run(ownerId, actor, name, kind, item, count, 0, day, visitAt);
        if (result.water.length) log('water', result.water.join(','), result.water.length);
        if (result.tend.length) log('tend', result.tend.join(','), result.tend.length);
        for (const kind of new Set(result.feed)) log('feed', kind, result.feed.filter((value) => value === kind).length);
        if (result.took) log('take', result.took.item, 1);
        if (result.gift) log('gift', result.gift.item, result.gift.quantity);
        return result;
      });
    },
    // Thao tác ở nông trại hàng xóm: help | take | gift. actor { accountId, name }, owner như trên; options.paid = được
    // nhận xu khi giúp (API xét: đã là bạn từ 24 giờ). Cùng khóa gửi lại trả nguyên kết quả cũ.
    social(actor, owner, action, input, key, options = {}) {
      if (!SOCIAL_ACTIONS.includes(action)) return { ok: false, code: 'INVALID' };
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!gardenQ.account.get(actor.accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      if (!owner.bot && (owner.accountId === actor.accountId || !gardenQ.account.get(owner.accountId))) return { ok: false, code: 'INVALID' };
      const stored = `farm.${action}`;
      return transaction(() => {
        const previous = gardenQ.request.get(actor.accountId, key);
        if (previous) {
          if (previous.action !== stored) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const at = now();
        const day = today();
        let result;
        db.exec('SAVEPOINT farm_social');
        try {
          const profile = profileOf(actor.accountId);
          const levelBefore = farmLevel(profile.xp);
          const { xp = 0, ...detail } = socialActions[action](actor, owner, input && typeof input === 'object' ? input : {}, at, day, options);
          profile.xp += xp;
          q.saveProfile.run(profile.xp, profile.plots, profile.coop, profile.barn, profile.storage, actor.accountId);
          db.exec('RELEASE farm_social');
          const level = farmLevel(profile.xp);
          result = { ok: true, ...detail, xpGained: xp, ...(level > levelBefore ? { levelUp: level } : {}), farm: view(actor.accountId), ...(action === 'gift' ? {} : { visit: visit(actor.accountId, owner) }) };
        } catch (error) {
          db.exec('ROLLBACK TO farm_social');
          db.exec('RELEASE farm_social');
          if (!(error instanceof FarmError) && !(GardenError && error instanceof GardenError)) throw error;
          result = { ok: false, code: error.code, farm: view(actor.accountId), ...(action === 'gift' ? {} : { visit: visit(actor.accountId, owner) }) };
        }
        gardenQ.saveRequest.run(actor.accountId, key, stored, JSON.stringify(result), at);
        return result;
      });
    },
    // Một thao tác. Cùng khóa gửi lại trả nguyên kết quả cũ. Lỗi nghiệp vụ lùi mọi thay đổi (savepoint) nhưng vẫn lưu
    // khóa. Trả { ok, code?, farm: view mới, ...chi tiết, levelUp? }.
    act(accountId, action, input, key) {
      if (!ACTIONS.includes(action)) return { ok: false, code: 'INVALID' };
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
      if (!gardenQ.account.get(accountId)) return { ok: false, code: 'NOT_SIGNED_IN' };
      const stored = `farm.${action}`;
      return transaction(() => {
        const previous = gardenQ.request.get(accountId, key);
        if (previous) {
          if (previous.action !== stored) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
          return { ...JSON.parse(previous.response), replayed: true };
        }
        const at = now();
        let result;
        db.exec('SAVEPOINT farm_action');
        try {
          const profile = profileOf(accountId);
          const levelBefore = farmLevel(profile.xp);
          const { xp = 0, ...detail } = actions[action](accountId, profile, levelBefore, at, input && typeof input === 'object' ? input : {});
          profile.xp += xp;
          q.saveProfile.run(profile.xp, profile.plots, profile.coop, profile.barn, profile.storage, accountId);
          db.exec('RELEASE farm_action');
          const level = farmLevel(profile.xp);
          result = { ok: true, ...detail, xpGained: xp, ...(level > levelBefore ? { levelUp: level } : {}), farm: view(accountId) };
        } catch (error) {
          db.exec('ROLLBACK TO farm_action');
          db.exec('RELEASE farm_action');
          if (!(error instanceof FarmError) && !(GardenError && error instanceof GardenError)) throw error;
          result = { ok: false, code: error.code, farm: view(accountId) };
        }
        gardenQ.saveRequest.run(accountId, key, stored, JSON.stringify(result), at);
        return result;
      });
    },
  };
}
