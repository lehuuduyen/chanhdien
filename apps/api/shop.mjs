// Shop nhân vật: ví kim cương (💎) và đồ đã mua. Kim cương chỉ có khi nạp tiền thật qua Stripe Checkout; không đổi
// qua lại với xu Vườn Công Đức. Khóa Stripe đặt bằng biến môi trường trên máy chạy API, không ghi trong repo:
//
//   STRIPE_SECRET_KEY      sk_live_… / sk_test_… (thiếu thì shop vẫn mở, chỉ tắt nút nạp)
//   STRIPE_WEBHOOK_SECRET  whsec_… của endpoint /api/v1/stripe/webhook (cộng kim cương kể cả khi người dùng đóng tab)
//   PUBLIC_URL             gốc trang để Stripe đưa người dùng quay về (mặc định lấy theo Origin của trang)
//
// Mỗi phiên Checkout cộng kim cương đúng một lần (khóa là session id), dù webhook và trang quay về cùng báo.
// Gói nạp (số kim cương, giá, bật/tắt) chỉnh ở trang admin; phiên Checkout ghi lại số kim cương/giá lúc tạo, nên đổi
// gói sau đó không ảnh hưởng người đang trả tiền.
//
// Nhân vật admin tải lên (mục 05 trang admin): file .glb có khung xương kiểu Mixamo + động tác Walking (Meshy "Rig &
// Animate"). Server kiểm tra, nén bằng gltf-transform (meshopt + WebP 1024) rồi lưu ở DATA_DIR/models/<mã>.glb; danh
// mục (tên, giá, bật/tắt) ở bảng shop_catalog. Mã nhân vật dạng "shop-<tên>" (SHOP_SKIN trong room-rules).
import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PET_LEVEL_DAYS, petRate, SPIRIT_PETS } from '@chanh-dien/garden';
import { isPremiumSkin, isShopSkin, LOGIN_REWARD_ITEMS, LOGIN_REWARDS, SHOP_ITEMS } from '@chanh-dien/room-rules';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { allow, currentAccount, loginRewardView, sameOrigin } from './auth.mjs';
import { json, readJson } from './http.mjs';
import { isAdmin } from './support.mjs';

// Gói nạp mặc định (lần đầu tạo bảng): giá USD tính bằng cent; gói lớn được thêm kim cương.
export const DIAMOND_PACKS = Object.freeze([
  Object.freeze({ id: 'd100', diamonds: 100, cents: 99 }),
  Object.freeze({ id: 'd550', diamonds: 550, cents: 499 }),
  Object.freeze({ id: 'd1200', diamonds: 1200, cents: 999 }),
]);
const CHECKOUT_LIMIT = [10, 10 * 60_000];
const BUY_LIMIT = [20, 60_000];
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const WEBHOOK_LIMIT = 256 * 1_024;
const WEBHOOK_TOLERANCE_S = 300;
const PACK_ID = /^[a-z0-9-]{2,24}$/;
const MAX_PACKS = 8;
// Stripe nhận tối thiểu $0.50; trần $999.99 để tránh gõ nhầm.
const PACK_LIMITS = { diamonds: [1, 1_000_000], cents: [50, 99_999] };
// File nhân vật: bản gốc tải lên tối đa 64 MB (Meshy để nguyên texture 4K); sau khi nén phải ≤ 6 MB.
const MODEL_UPLOAD_LIMIT = 64 * 1_024 * 1_024;
const MODEL_OUTPUT_LIMIT = 6 * 1_024 * 1_024;
const MODEL_MAX_TRIANGLES = 40_000;
const MODEL_BONES = ['hips', 'spine', 'leftupleg', 'leftleg', 'rightupleg', 'rightleg', 'leftarm', 'rightarm'];
const ITEM_PRICE = [0, 1_000_000];
const BASES = ['man', 'woman'];
// Kiểu nhún nhảy bằng code (cùng danh sách DANCE_STYLES trong scene-engine/chibi3d.mjs) và tên điệu nhảy trong file
// (cùng DANCE_CLIP trong rigged3d.mjs; hai gói không phụ thuộc nhau, sửa thì sửa cả hai).
export const DANCE_STYLES = Object.freeze(['bounce', 'sway', 'spin', 'hop', 'nod']);
export const DANCE_CLIP = /danc|hip ?hop|samba|salsa|twerk|shuffl|cheer|celebrat|happy|jump/i;
// Động tác nền; các động tác còn lại là động tác tương tác (nút ✨). Cùng BASE_CLIP trong rigged3d.mjs.
export const BASE_CLIP = /walk|run|idle|breath|t-?pose|a-?pose|bind/i;
// Hình ai cũng chọn được (cổng chùa); hình khác phải mua.
const FREE_SKINS = ['man', 'woman'];
// "mixamorig:LeftUpLeg" / "LeftUpLeg" → "leftupleg" (cùng cách chibi3d.mjs tìm xương).
export const boneKey = (name) => String(name).replace(/^mixamorig\d*:?/i, '').toLowerCase();
const cleanName = (value) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 40) : '');

// Đọc phần JSON của file .glb và kiểm tra đủ để cử động được: có khung xương đủ xương chính, có động tác đi.
export function inspectGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) return { ok: false, error: 'NOT_GLB' };
  const length = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + length > buffer.length) return { ok: false, error: 'NOT_GLB' };
  let gltf;
  try {
    gltf = JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
  } catch {
    return { ok: false, error: 'NOT_GLB' };
  }
  const skin = gltf.skins?.[0];
  if (!skin) return { ok: false, error: 'NO_SKELETON' };
  const bones = new Set(skin.joints.map((index) => boneKey(gltf.nodes?.[index]?.name || '')));
  const missing = MODEL_BONES.filter((bone) => !bones.has(bone));
  if (missing.length) return { ok: false, error: 'MISSING_BONES', missing };
  const clips = (gltf.animations || []).map((animation) => String(animation.name || '').slice(0, 60));
  if (!clips.some((name) => /walk/i.test(name))) return { ok: false, error: 'NO_WALK', clips };
  const triangles = Math.round((gltf.meshes || []).flatMap((mesh) => mesh.primitives || [])
    .reduce((sum, primitive) => sum + (gltf.accessors?.[primitive.indices]?.count || 0) / 3, 0));
  if (triangles > MODEL_MAX_TRIANGLES) return { ok: false, error: 'TOO_MANY_TRIANGLES', triangles };
  return { ok: true, clips, triangles };
}

// Nén bằng gltf-transform CLI (đã có trong dependencies): giữ khung xương, động tác; texture WebP 1024.
// Gói chỉ export file chính: đi từ đó lên thư mục gói để lấy bin/cli.js.
const GLTF_CLI = (() => {
  const main = createRequire(import.meta.url).resolve('@gltf-transform/cli');
  const marker = `${path.sep}@gltf-transform${path.sep}cli${path.sep}`;
  return path.join(main.slice(0, main.lastIndexOf(marker) + marker.length), 'bin', 'cli.js');
})();
export function optimizeModel(input, output, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GLTF_CLI, 'optimize', input, output, '--compress', 'meshopt', '--texture-compress', 'webp',
      '--texture-size', '1024', '--no-simplify', '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false'], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`gltf-transform ${code}`));
    });
  });
}

// Mã từ tên tiếng Việt: "Kiếm Sĩ Lam" → "shop-kiem-si-lam".
export function shopIdFor(name) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '');
  return `shop-${slug.length >= 2 ? slug : randomUUID().slice(0, 8)}`;
}

// Kiểm tra danh sách gói admin gửi lên: id riêng, số nguyên trong giới hạn, active là boolean.
export function normalizePacks(input) {
  if (!Array.isArray(input) || input.length > MAX_PACKS) return null;
  const seen = new Set();
  const packs = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { id, diamonds, cents, active } = item;
    if (typeof id !== 'string' || !PACK_ID.test(id) || seen.has(id)) return null;
    const within = (value, [min, max]) => Number.isSafeInteger(value) && value >= min && value <= max;
    if (!within(diamonds, PACK_LIMITS.diamonds) || !within(cents, PACK_LIMITS.cents) || typeof active !== 'boolean') return null;
    seen.add(id);
    packs.push({ id, diamonds, cents, active });
  }
  return packs;
}

export function shopConfig(env = process.env) {
  const secretKey = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(env.STRIPE_SECRET_KEY || '') ? env.STRIPE_SECRET_KEY : null;
  const webhookSecret = /^whsec_[A-Za-z0-9]{10,}$/.test(env.STRIPE_WEBHOOK_SECRET || '') ? env.STRIPE_WEBHOOK_SECRET : null;
  const publicUrl = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(env.PUBLIC_URL || '') ? env.PUBLIC_URL : null;
  return { secretKey, webhookSecret, publicUrl };
}

// Loại giao dịch trong sổ kim cương. spend / refund: tiêu trong phòng (mở phim) và hoàn khi không thực hiện được.
const TX_KINDS = "'topup', 'purchase', 'admin_adjustment', 'spend', 'refund'";
// Việc được phép tiêu kim cương (lý do ghi vào sổ): mở phim (máy realtime), nhận nuôi linh thú (API).
export const SPEND_REASONS = Object.freeze(['cinema_video', 'pet_adopt']);
const SPEND_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export function createShopStore({ db, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS shop_wallets (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      diamonds INTEGER NOT NULL CHECK (diamonds >= 0),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      amount INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN (${TX_KINDS})),
      ref TEXT NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS shop_transactions_account ON shop_transactions (account_id, id);
    CREATE TABLE IF NOT EXISTS shop_payments (
      session_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      pack_id TEXT NOT NULL,
      diamonds INTEGER NOT NULL CHECK (diamonds > 0),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS shop_packs (
      id TEXT PRIMARY KEY,
      diamonds INTEGER NOT NULL CHECK (diamonds > 0),
      cents INTEGER NOT NULL CHECK (cents > 0),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      sort INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_catalog (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      base TEXT NOT NULL CHECK (base IN ('man', 'woman')),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      version INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      clips TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_items (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      item_id TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      acquired_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS account_skins (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      skin TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shop_item_overrides (
      item_id TEXT PRIMARY KEY,
      price INTEGER NOT NULL CHECK (price >= 0),
      original_price INTEGER,
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      updated_at INTEGER NOT NULL
    );
    -- Tiêu kim cương trong phòng (mở phim…): khóa chống trừ hai lần cho cùng một lần bấm, hoàn tiền tối đa một lần.
    CREATE TABLE IF NOT EXISTS shop_spends (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      idem_key TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      ref TEXT NOT NULL,
      refunded INTEGER NOT NULL DEFAULT 0,
      at INTEGER NOT NULL,
      PRIMARY KEY (account_id, idem_key)
    );
    CREATE TABLE IF NOT EXISTS shop_admin_requests (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      idem_key TEXT NOT NULL,
      response TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (account_id, idem_key)
    );`);
  // Database cũ có CHECK thiếu loại giao dịch mới (điều chỉnh quản trị, tiêu / hoàn trong phòng); SQLite cần dựng lại bảng.
  const transactionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'shop_transactions'").get()?.sql || '';
  if (!transactionSql.includes("'refund'")) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE shop_transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      amount INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN (${TX_KINDS})),
      ref TEXT NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      at INTEGER NOT NULL
    );
    INSERT INTO shop_transactions_new SELECT * FROM shop_transactions;
    DROP TABLE shop_transactions;
    ALTER TABLE shop_transactions_new RENAME TO shop_transactions;
    CREATE INDEX IF NOT EXISTS shop_transactions_account ON shop_transactions (account_id, id);
    COMMIT;`);
  // Giá nhận nuôi linh thú (kim cương) do admin đặt; tắt thì không nhận nuôi mới được (con đã nuôi vẫn nuôi tiếp).
  db.exec(`CREATE TABLE IF NOT EXISTS spirit_pet_prices (
      species TEXT PRIMARY KEY,
      price INTEGER NOT NULL CHECK (price >= 1),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      updated_at INTEGER NOT NULL
    );`);
  // Giá gốc (gạch ngang khi đang giảm giá): thêm cột cho database tạo trước khi có tính năng này.
  const catalogColumns = db.prepare('PRAGMA table_info(shop_catalog)').all().map((column) => column.name);
  if (!catalogColumns.includes('original_price')) db.exec('ALTER TABLE shop_catalog ADD COLUMN original_price INTEGER');
  // Ảnh chân dung (PNG admin dựng từ mô hình): 0 = chưa có.
  if (!catalogColumns.includes('thumb_version')) db.exec('ALTER TABLE shop_catalog ADD COLUMN thumb_version INTEGER NOT NULL DEFAULT 0');
  // Kiểu nhún nhảy khi file không có điệu nhảy riêng (DANCE_STYLES).
  if (!catalogColumns.includes('dance')) db.exec("ALTER TABLE shop_catalog ADD COLUMN dance TEXT NOT NULL DEFAULT 'bounce'");
  const q = {
    petPrices: db.prepare('SELECT species, price, active FROM spirit_pet_prices'),
    setPetPrice: db.prepare(`INSERT INTO spirit_pet_prices (species, price, active, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(species) DO UPDATE SET price = excluded.price, active = excluded.active, updated_at = excluded.updated_at`),
    preferredSkin: db.prepare('SELECT skin FROM account_skins WHERE account_id = ?'),
    setPreferredSkin: db.prepare(`INSERT INTO account_skins (account_id, skin, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET skin = excluded.skin, updated_at = excluded.updated_at`),
    wallet: db.prepare('SELECT diamonds FROM shop_wallets WHERE account_id = ?'),
    ensureWallet: db.prepare('INSERT OR IGNORE INTO shop_wallets (account_id, diamonds, updated_at) VALUES (?, 0, ?)'),
    change: db.prepare('UPDATE shop_wallets SET diamonds = diamonds + ?, updated_at = ? WHERE account_id = ?'),
    log: db.prepare('INSERT INTO shop_transactions (account_id, amount, kind, ref, balance_after, at) VALUES (?, ?, ?, ?, ?, ?)'),
    history: db.prepare('SELECT amount, kind, ref, at FROM shop_transactions WHERE account_id = ? ORDER BY id DESC LIMIT 10'),
    items: db.prepare('SELECT item_id AS itemId FROM shop_items WHERE account_id = ? ORDER BY acquired_at'),
    own: db.prepare('INSERT INTO shop_items (account_id, item_id, price, acquired_at) VALUES (?, ?, ?, ?)'),
    owns: db.prepare('SELECT 1 FROM shop_items WHERE account_id = ? AND item_id = ?'),
    payment: db.prepare('SELECT session_id AS sessionId, account_id AS accountId, pack_id AS packId, diamonds, amount_cents AS amountCents, status FROM shop_payments WHERE session_id = ?'),
    addPayment: db.prepare(`INSERT INTO shop_payments (session_id, account_id, pack_id, diamonds, amount_cents, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`),
    markPaid: db.prepare("UPDATE shop_payments SET status = 'paid', paid_at = ? WHERE session_id = ? AND status = 'pending'"),
    packs: db.prepare('SELECT id, diamonds, cents, active FROM shop_packs ORDER BY sort'),
    packCount: db.prepare('SELECT COUNT(*) AS count FROM shop_packs'),
    clearPacks: db.prepare('DELETE FROM shop_packs'),
    addPack: db.prepare('INSERT INTO shop_packs (id, diamonds, cents, active, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    catalog: db.prepare('SELECT id, name, price, original_price, base, active, version, thumb_version, bytes, clips, dance FROM shop_catalog ORDER BY created_at'),
    catalogItem: db.prepare('SELECT id, name, price, original_price, base, active, version, thumb_version, dance FROM shop_catalog WHERE id = ?'),
    setThumb: db.prepare('UPDATE shop_catalog SET thumb_version = thumb_version + 1, updated_at = ? WHERE id = ?'),
    overrides: db.prepare('SELECT item_id AS itemId, price, original_price, active FROM shop_item_overrides'),
    setOverride: db.prepare(`INSERT INTO shop_item_overrides (item_id, price, original_price, active, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET price = excluded.price, original_price = excluded.original_price, active = excluded.active, updated_at = excluded.updated_at`),
    addModel: db.prepare(`INSERT INTO shop_catalog (id, name, price, base, active, version, bytes, clips, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`),
    replaceModel: db.prepare('UPDATE shop_catalog SET version = version + 1, bytes = ?, clips = ?, updated_at = ? WHERE id = ?'),
    updateItem: db.prepare('UPDATE shop_catalog SET name = ?, price = ?, original_price = ?, base = ?, active = ?, dance = ?, updated_at = ? WHERE id = ?'),
    account: db.prepare('SELECT id FROM accounts WHERE id = ?'),
    spend: db.prepare('SELECT amount, reason, ref, refunded FROM shop_spends WHERE account_id = ? AND idem_key = ?'),
    addSpend: db.prepare('INSERT INTO shop_spends (account_id, idem_key, amount, reason, ref, at) VALUES (?, ?, ?, ?, ?, ?)'),
    markRefunded: db.prepare('UPDATE shop_spends SET refunded = 1 WHERE account_id = ? AND idem_key = ?'),
    adminRequest: db.prepare('SELECT response FROM shop_admin_requests WHERE account_id = ? AND idem_key = ?'),
    saveAdminRequest: db.prepare('INSERT INTO shop_admin_requests (account_id, idem_key, response, at) VALUES (?, ?, ?, ?)'),
  };

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

  // Cộng/trừ kim cương và ghi sổ (gọi bên trong transaction).
  function changeDiamonds(accountId, amount, kind, ref) {
    const at = now();
    q.ensureWallet.run(accountId, at);
    const balance = q.wallet.get(accountId).diamonds + amount;
    if (balance < 0) return null;
    q.change.run(amount, at, accountId);
    q.log.run(accountId, amount, kind, ref, balance, at);
    return balance;
  }

  const ownedItems = (accountId) => q.items.all(accountId).map((row) => row.itemId);
  const loginRewardByItem = new Map(LOGIN_REWARDS.map((reward) => [reward.itemId, reward]));
  // Món bán: hình có sẵn trong code (SHOP_ITEMS) + nhân vật admin tải lên (shop_catalog, kèm link file .glb).
  // originalPrice: giá gốc khi đang giảm (luôn lớn hơn giá bán), không giảm thì null.
  const original = (price, originalPrice) => (Number.isSafeInteger(originalPrice) && originalPrice > price ? originalPrice : null);
  const catalogItem = (row) => ({
    id: row.id, kind: 'skin', skin: row.id, base: row.base, price: row.price, originalPrice: original(row.price, row.original_price),
    name: row.name, active: row.active === 1,
    model: `/api/v1/shop/models/${row.id}.glb?v=${row.version}`,
    thumb: row.thumb_version ? `/api/v1/shop/models/${row.id}.png?v=${row.thumb_version}` : null,
    ...(row.clips ? { clips: JSON.parse(row.clips) } : {}),
    // Có điệu nhảy trong file thì dùng điệu đó; dance là kiểu thay thế khi không có.
    danceClip: row.clips ? JSON.parse(row.clips).some((name) => DANCE_CLIP.test(name)) : false,
    actClips: row.clips ? JSON.parse(row.clips).filter((name) => !BASE_CLIP.test(name)) : [],
    dance: DANCE_STYLES.includes(row.dance) ? row.dance : 'bounce',
  });
  // Hình có sẵn trong code: giá / bật-tắt admin chỉnh lưu ở shop_item_overrides.
  const builtinItems = () => {
    const overrides = new Map(q.overrides.all().map((row) => [row.itemId, row]));
    return SHOP_ITEMS.map((item) => {
      const override = overrides.get(item.id);
      const price = override?.price ?? item.price;
      const reward = loginRewardByItem.get(item.id);
      return {
        ...item, price, originalPrice: original(price, override?.original_price), active: override ? override.active === 1 : true,
        ...(reward ? { rewardDays: reward.days } : {}),
      };
    });
  };
  const rewardItems = () => LOGIN_REWARD_ITEMS.map((item) => ({ ...item, active: true, originalPrice: null }));
  const allItems = () => [...builtinItems(), ...rewardItems(), ...q.catalog.all().map(catalogItem)];
  const writePacks = (packs) => {
    q.clearPacks.run();
    packs.forEach((pack, index) => q.addPack.run(pack.id, pack.diamonds, pack.cents, pack.active ? 1 : 0, index, now()));
  };
  if (!q.packCount.get().count) transaction(() => writePacks(DIAMOND_PACKS.map((pack) => ({ ...pack, active: true }))));

  return {
    // Giá linh thú theo thứ tự SPIRIT_PETS; loài chưa đặt giá dùng giá khởi tạo trong code. Người dùng chỉ thấy loài đang bán.
    petPrices({ all = false } = {}) {
      const saved = new Map(q.petPrices.all().map((row) => [row.species, row]));
      return Object.entries(SPIRIT_PETS).map(([species, item]) => {
        const row = saved.get(species);
        return { species, price: row?.price ?? item.price, active: row ? row.active === 1 : true };
      }).filter((item) => all || item.active);
    },
    // Admin lưu giá: [{ species, price, active }] (loài phải có trong SPIRIT_PETS, giá nguyên 1–1.000.000). Sai thì null.
    setPetPrices(list) {
      if (!Array.isArray(list) || !list.length || list.length > Object.keys(SPIRIT_PETS).length) return null;
      const seen = new Set();
      for (const item of list) {
        if (!item || typeof item !== 'object' || !Object.hasOwn(SPIRIT_PETS, item.species) || seen.has(item.species)
          || !Number.isSafeInteger(item.price) || item.price < 1 || item.price > 1_000_000 || typeof item.active !== 'boolean') return null;
        seen.add(item.species);
      }
      transaction(() => { for (const item of list) q.setPetPrice.run(item.species, item.price, item.active ? 1 : 0, now()); });
      return this.petPrices({ all: true });
    },
    // Gói nạp: người dùng chỉ thấy gói đang bật; admin thấy cả gói tắt.
    packs({ all = false } = {}) {
      return q.packs.all().map((row) => ({ id: row.id, diamonds: row.diamonds, cents: row.cents, active: row.active === 1 }))
        .filter((pack) => all || pack.active);
    },
    setPacks(packs) {
      transaction(() => writePacks(packs));
      return this.packs({ all: true });
    },
    items({ all = false } = {}) {
      return allItems().filter((item) => all || item.active);
    },
    // Admin tải file mới: món mới (bật ngay) hoặc thay file của món cũ (giữ tên/giá, tăng version để máy tải lại).
    saveModel({ id, name, price, base, bytes, clips }) {
      const at = now();
      if (q.catalogItem.get(id)) q.replaceModel.run(bytes, JSON.stringify(clips), at, id);
      else q.addModel.run(id, name, price, base, bytes, JSON.stringify(clips), at, at);
      return catalogItem({ ...q.catalogItem.get(id), clips: JSON.stringify(clips) });
    },
    hasModel: (id) => Boolean(q.catalogItem.get(id)),
    // Admin vừa lưu ảnh chân dung mới: tăng version để link ảnh đổi (cache lâu được).
    setThumb(id) {
      q.setThumb.run(now(), id);
      return allItems().find((item) => item.id === id);
    },
    // Sửa món: tên / giá bán / giá gốc / hình thay thế / bật-tắt. Hình có sẵn trong code chỉ đổi giá và bật-tắt.
    updateItem(id, changes) {
      const builtin = builtinItems().find((item) => item.id === id);
      if (builtin) {
        const next = { price: builtin.price, originalPrice: builtin.originalPrice, active: builtin.active, ...changes };
        q.setOverride.run(id, next.price, original(next.price, next.originalPrice), next.active ? 1 : 0, now());
        return allItems().find((item) => item.id === id);
      }
      const row = q.catalogItem.get(id);
      if (!row) return null;
      const next = { name: row.name, price: row.price, originalPrice: row.original_price, base: row.base, active: row.active === 1, dance: row.dance || 'bounce', ...changes };
      q.updateItem.run(next.name, next.price, original(next.price, next.originalPrice), next.base, next.active ? 1 : 0, next.dance, now(), id);
      return allItems().find((item) => item.id === id);
    },
    // Hình nhân vật chọn lần cuối (lưu theo tài khoản): Nam/Nữ hoặc hình đã mua; hình không còn hợp lệ thì null.
    preferredSkin(accountId) {
      const skin = q.preferredSkin.get(accountId)?.skin;
      return skin && (FREE_SKINS.includes(skin) || this.ownedSkins(accountId).includes(skin)) ? skin : null;
    },
    setPreferredSkin(accountId, skin) {
      if (typeof skin !== 'string' || !(FREE_SKINS.includes(skin) || isPremiumSkin(skin))) return { ok: false, error: 'INVALID_SKIN' };
      if (!FREE_SKINS.includes(skin) && !this.ownedSkins(accountId).includes(skin)) return { ok: false, error: 'SKIN_LOCKED' };
      q.setPreferredSkin.run(accountId, skin, now());
      return { ok: true, skin };
    },
    me(accountId) {
      return {
        diamonds: q.wallet.get(accountId)?.diamonds ?? 0,
        owned: ownedItems(accountId),
        skin: this.preferredSkin(accountId),
        history: q.history.all(accountId).map((row) => ({ ...row })),
      };
    },
    // Máy realtime trừ kim cương cho một việc trong phòng (mở phim…). Ghi sổ trước, phòng làm việc đó sau; gửi lại cùng
    // khóa không trừ hai lần. Thiếu kim cương thì không ghi gì (bấm lại sau khi nạp vẫn được).
    spend({ accountId, amount, reason, ref, key }) {
      if (typeof accountId !== 'string' || !SPEND_REASONS.includes(reason) || typeof ref !== 'string' || !ref || ref.length > 80
        || !Number.isSafeInteger(amount) || amount < 1 || amount > 10_000 || typeof key !== 'string' || !SPEND_KEY.test(key)) return { ok: false, error: 'INVALID' };
      return transaction(() => {
        if (!q.account.get(accountId)) return { ok: false, error: 'NOT_SIGNED_IN' };
        const previous = q.spend.get(accountId, key);
        if (previous) return { ok: !previous.refunded, replayed: true, diamonds: q.wallet.get(accountId)?.diamonds ?? 0, ...(previous.refunded ? { error: 'REFUNDED' } : {}) };
        const diamonds = changeDiamonds(accountId, -amount, 'spend', `${reason}:${ref}`);
        if (diamonds === null) return { ok: false, error: 'INSUFFICIENT_DIAMONDS', diamonds: q.wallet.get(accountId).diamonds };
        q.addSpend.run(accountId, key, amount, reason, ref, now());
        return { ok: true, diamonds };
      });
    },
    // Hoàn lần tiêu có khóa này (phòng không làm được việc đã trả tiền). Chỉ hoàn lần tiêu có thật, tối đa một lần.
    refund({ accountId, key }) {
      if (typeof accountId !== 'string' || typeof key !== 'string' || !SPEND_KEY.test(key)) return { ok: false, error: 'INVALID' };
      return transaction(() => {
        const spent = q.spend.get(accountId, key);
        if (!spent) return { ok: false, error: 'UNKNOWN_SPEND' };
        if (spent.refunded) return { ok: true, replayed: true, diamonds: q.wallet.get(accountId)?.diamonds ?? 0 };
        const diamonds = changeDiamonds(accountId, spent.amount, 'refund', `${spent.reason}:${spent.ref}`);
        q.markRefunded.run(accountId, key);
        return { ok: true, diamonds };
      });
    },
    // Quản trị cộng/trừ kim cương, ghi sổ riêng và chống Telegram gửi trùng cùng update_id.
    adjustDiamonds({ accountId, amount, key }) {
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(key)
        || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, error: 'INVALID' };
      return transaction(() => {
        const previous = q.adminRequest.get(accountId, key);
        if (previous) return { ...JSON.parse(previous.response), replayed: true };
        q.ensureWallet.run(accountId, now());
        const before = q.wallet.get(accountId).diamonds;
        const result = before + amount < 0
          ? { ok: false, error: 'INSUFFICIENT_DIAMONDS', diamonds: before }
          : { ok: true, amount, diamonds: changeDiamonds(accountId, amount, 'admin_adjustment', key) };
        q.saveAdminRequest.run(accountId, key, JSON.stringify(result), now());
        return result;
      });
    },
    // Hình nhân vật đã mua: ghi vào vé vào phòng để máy realtime cho mặc.
    ownedSkins(accountId) {
      const owned = new Set(ownedItems(accountId));
      return allItems().filter((item) => item.kind === 'skin' && owned.has(item.id) && isPremiumSkin(item.skin)).map((item) => item.skin);
    },
    // Quà đăng nhập ghi chung với món đã mua. Khóa chính (account_id, item_id) giúp gọi lại bao nhiêu lần cũng chỉ
    // cấp một bản; không tự mặc để người dùng chủ động chọn ở cổng hoặc trong shop.
    grantLoginReward(accountId, itemId) {
      const reward = LOGIN_REWARDS.find((candidate) => candidate.itemId === itemId);
      const item = allItems().find((candidate) => candidate.id === itemId);
      if (!reward || !item) return { ok: false, error: 'UNKNOWN_REWARD' };
      return transaction(() => {
        if (q.owns.get(accountId, itemId)) return { ok: true, granted: false, itemId, skin: reward.skin };
        q.own.run(accountId, itemId, 0, now());
        return { ok: true, granted: true, itemId, skin: reward.skin };
      });
    },
    // Mua một món: đã có thì thôi (không trừ lần hai), thiếu kim cương thì báo.
    buy(accountId, itemId) {
      const item = allItems().find((candidate) => candidate.id === itemId && candidate.active && !candidate.rewardOnly);
      if (!item) return { ok: false, error: 'UNKNOWN_ITEM' };
      return transaction(() => {
        if (q.owns.get(accountId, itemId)) return { ok: true, already: true, diamonds: q.wallet.get(accountId)?.diamonds ?? 0, owned: ownedItems(accountId) };
        const diamonds = changeDiamonds(accountId, -item.price, 'purchase', item.id);
        if (diamonds === null) return { ok: false, error: 'INSUFFICIENT_DIAMONDS' };
        q.own.run(accountId, item.id, item.price, now());
        return { ok: true, already: false, diamonds, owned: ownedItems(accountId) };
      });
    },
    // Phiên Checkout vừa tạo (chưa trả tiền).
    addPayment({ sessionId, accountId, pack }) {
      q.addPayment.run(sessionId, accountId, pack.id, pack.diamonds, pack.cents, now());
    },
    // Stripe báo đã trả: đối chiếu với phiên đã ghi (đúng người, đúng số tiền) rồi cộng kim cương đúng một lần.
    creditPayment({ sessionId, accountId, amountCents, currency }) {
      return transaction(() => {
        const payment = q.payment.get(sessionId);
        if (!payment) return { ok: false, error: 'UNKNOWN_PAYMENT' };
        if (payment.accountId !== accountId || payment.amountCents !== amountCents || currency !== 'usd') return { ok: false, error: 'PAYMENT_MISMATCH' };
        if (payment.status === 'paid') return { ok: true, credited: false, diamonds: q.wallet.get(accountId)?.diamonds ?? 0 };
        q.markPaid.run(now(), sessionId);
        const diamonds = changeDiamonds(accountId, payment.diamonds, 'topup', sessionId);
        return { ok: true, credited: true, added: payment.diamonds, diamonds };
      });
    },
  };
}

export function openShopStore(accounts) {
  return accounts ? createShopStore({ db: accounts.database }) : null;
}

// ---- Stripe (REST, không dùng SDK) ----
async function stripeRequest(config, method, path, params, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(`stripe_${response.status}`);
  return body;
}

export function createCheckoutSession(config, { pack, accountId, origin }, fetchImpl) {
  return stripeRequest(config, 'POST', '/checkout/sessions', {
    mode: 'payment',
    client_reference_id: accountId,
    'metadata[accountId]': accountId,
    'metadata[packId]': pack.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(pack.cents),
    'line_items[0][price_data][product_data][name]': `${pack.diamonds} Kim cương · Chánh Điện Online`,
    success_url: `${origin}/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/shop.html?checkout=cancel`,
  }, fetchImpl);
}

export function retrieveCheckoutSession(config, sessionId, fetchImpl) {
  return stripeRequest(config, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`, null, fetchImpl);
}

// Header Stripe-Signature: "t=<giây>,v1=<hmac>"; ký HMAC-SHA256 trên "<t>.<body gốc>" bằng whsec.
export function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now()) {
  if (typeof header !== 'string' || !secret) return false;
  const parts = Object.groupBy(header.split(','), (part) => part.split('=')[0]);
  const timestamp = Number(parts.t?.[0]?.slice(2));
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs / 1_000 - timestamp) > WEBHOOK_TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'));
  return (parts.v1 || []).some((part) => {
    const received = Buffer.from(part.slice(3));
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

// Phiên Checkout đã trả tiền → cộng kim cương (dùng chung cho webhook và trang quay về).
function creditSession(store, session) {
  if (session?.object !== 'checkout.session' || session.payment_status !== 'paid') return { ok: false, error: 'NOT_PAID' };
  const accountId = session.client_reference_id;
  if (typeof accountId !== 'string' || accountId !== session.metadata?.accountId) return { ok: false, error: 'PAYMENT_MISMATCH' };
  return store.creditPayment({ sessionId: session.id, accountId, amountCents: session.amount_total, currency: session.currency });
}

const THUMB_LIMIT = 600 * 1_024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function readRawBuffer(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readRaw(req, limit) {
  return (await readRawBuffer(req, limit)).toString('utf8');
}

// Gốc trang để Stripe đưa người dùng quay về: PUBLIC_URL, không có thì Origin của trang (đã qua sameOrigin).
function originOf(req, config) {
  if (config.publicUrl) return config.publicUrl;
  const origin = req.headers?.origin;
  return typeof origin === 'string' && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin) ? origin : null;
}

async function readBody(req, res) {
  try {
    const input = await readJson(req);
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch {}
  json(req, res, 400, { error: 'invalid_body' });
  return null;
}

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleShopRequest(req, res, pathname, options) {
  const store = options.shopStore;
  const config = options.shop || shopConfig({});
  // Máy realtime trừ / hoàn kim cương (khóa x-internal-key; trình duyệt không gọi trực tiếp được).
  //   POST /internal/shop/spend  { accountId, amount, reason, ref, key } → { ok, diamonds } | { ok: false, error }
  //   POST /internal/shop/refund { accountId, key }
  if (pathname === '/internal/shop/spend' || pathname === '/internal/shop/refund') {
    if (req.method !== 'POST' || !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (!store) return json(req, res, 503, { ok: false, error: 'SHOP_DISABLED' }), true;
    let input;
    try { input = await readJson(req); } catch { return json(req, res, 400, { ok: false, error: 'INVALID' }), true; }
    const result = pathname.endsWith('/spend') ? store.spend(input || {}) : store.refund(input || {});
    return json(req, res, 200, result), true;
  }
  if (pathname === '/api/v1/stripe/webhook') {
    if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    if (!store || !config.webhookSecret) return json(req, res, 503, { error: 'webhook_disabled' }), true;
    let raw;
    try {
      raw = await readRaw(req, WEBHOOK_LIMIT);
    } catch {
      return json(req, res, 413, { error: 'body_too_large' }), true;
    }
    if (!verifyStripeSignature(raw, req.headers['stripe-signature'], config.webhookSecret)) return json(req, res, 400, { error: 'invalid_signature' }), true;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return json(req, res, 400, { error: 'invalid_json' }), true;
    }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event?.type)) {
      const result = creditSession(store, event.data?.object);
      // Phiên không do shop tạo (hoặc lệch số tiền): báo 200 để Stripe không gửi lại mãi, ghi log để kiểm tra tay.
      if (!result.ok && result.error !== 'NOT_PAID') console.warn(`Stripe webhook bỏ qua ${event.data?.object?.id}: ${result.error}`);
    }
    return json(req, res, 200, { received: true }), true;
  }
  // File nhân vật đã nén và ảnh chân dung (link kèm ?v=version nên cache lâu được).
  const modelFile = pathname.match(/^\/api\/v1\/shop\/models\/(shop-[a-z0-9-]{2,30})\.(glb|png)$/);
  if (modelFile) {
    const file = options.shopModelDir && path.join(options.shopModelDir, `${modelFile[1]}.${modelFile[2]}`);
    if (req.method !== 'GET' || !store?.hasModel(modelFile[1]) || !file || !existsSync(file)) return json(req, res, 404, { error: 'not_found' }), true;
    // File đã nén ≤ 6 MB, ảnh ≤ 600 KB: đọc một lần rồi gửi.
    const body = readFileSync(file);
    res.writeHead(200, {
      'Content-Type': modelFile[2] === 'png' ? 'image/png' : 'model/gltf-binary',
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
    return true;
  }
  // Admin: danh mục nhân vật (cả món đang ẩn) và sửa tên / giá / bật-tắt.
  if (pathname === '/api/v1/admin/shop/items' || pathname.startsWith('/api/v1/admin/shop/items/')) {
    if (!store) return json(req, res, 503, { error: 'shop_unavailable' }), true;
    if (!isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (pathname === '/api/v1/admin/shop/items') {
      if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
      return json(req, res, 200, { items: store.items({ all: true }).filter((item) => !item.rewardOnly) }), true;
    }
    // Ảnh chân dung admin dựng từ mô hình (PNG ≤ 600 KB) → DATA_DIR/models/<mã>.png.
    const thumbFor = pathname.match(/^\/api\/v1\/admin\/shop\/items\/(shop-[a-z0-9-]{2,30})\/thumb$/);
    if (thumbFor) {
      if (req.method !== 'PUT') return json(req, res, 405, { error: 'method_not_allowed' }), true;
      if (!store.hasModel(thumbFor[1]) || !options.shopModelDir) return json(req, res, 404, { error: 'not_found' }), true;
      let image;
      try {
        image = await readRawBuffer(req, THUMB_LIMIT);
      } catch {
        return json(req, res, 413, { error: 'body_too_large' }), true;
      }
      if (image.length < 8 || !image.subarray(0, 8).equals(PNG_MAGIC)) return json(req, res, 400, { error: 'not_png' }), true;
      mkdirSync(options.shopModelDir, { recursive: true });
      const target = path.join(options.shopModelDir, `${thumbFor[1]}.png`);
      writeFileSync(`${target}.tmp`, image);
      renameSync(`${target}.tmp`, target);
      return json(req, res, 200, { item: store.setThumb(thumbFor[1]) }), true;
    }
    const id = pathname.slice('/api/v1/admin/shop/items/'.length);
    if (req.method !== 'PATCH' || !(isShopSkin(id) || SHOP_ITEMS.some((item) => item.id === id))) return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const input = await readBody(req, res);
    if (!input) return true;
    const changes = {};
    if (input.name !== undefined) changes.name = cleanName(input.name);
    if (input.price !== undefined) changes.price = input.price;
    // Giá gốc: null / bỏ trống = không giảm giá.
    if (input.originalPrice !== undefined) changes.originalPrice = input.originalPrice;
    if (input.base !== undefined) changes.base = input.base;
    if (input.active !== undefined) changes.active = input.active;
    if (input.dance !== undefined) changes.dance = input.dance;
    const valid = (changes.name === undefined || changes.name.length >= 1)
      && (changes.price === undefined || (Number.isSafeInteger(changes.price) && changes.price >= ITEM_PRICE[0] && changes.price <= ITEM_PRICE[1]))
      && (changes.originalPrice === undefined || changes.originalPrice === null
        || (Number.isSafeInteger(changes.originalPrice) && changes.originalPrice >= ITEM_PRICE[0] && changes.originalPrice <= ITEM_PRICE[1]))
      && (changes.base === undefined || BASES.includes(changes.base))
      && (changes.active === undefined || typeof changes.active === 'boolean')
      && (changes.dance === undefined || DANCE_STYLES.includes(changes.dance));
    if (!valid) return json(req, res, 400, { error: 'invalid_item' }), true;
    const item = store.updateItem(id, changes);
    return json(req, res, item ? 200 : 404, item ? { item } : { error: 'not_found' }), true;
  }
  // Admin tải nhân vật mới (body là file .glb; tên, giá, hình 2D thay thế ở query). Có ?id=shop-… thì thay file của món đó.
  if (pathname === '/api/v1/admin/shop/models') {
    if (!store || !options.shopModelDir) return json(req, res, 503, { error: 'shop_unavailable' }), true;
    if (!isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const params = new URL(req.url, 'http://local').searchParams;
    const replacing = params.get('id');
    const name = cleanName(params.get('name') || '');
    const price = Number(params.get('price'));
    const base = params.get('base') || 'man';
    if (replacing ? !store.hasModel(replacing) : (!name || !Number.isSafeInteger(price) || price < ITEM_PRICE[0] || price > ITEM_PRICE[1] || !BASES.includes(base))) {
      return json(req, res, 400, { error: 'invalid_item' }), true;
    }
    if (options.shopUploadBusy) return json(req, res, 429, { error: 'busy' }), true;
    options.shopUploadBusy = true;
    mkdirSync(options.shopModelDir, { recursive: true });
    const raw = path.join(options.shopModelDir, `.upload-${randomUUID()}.glb`);
    const packed = `${raw}.out.glb`;
    try {
      let size = 0;
      await pipeline(req, async function* limit(source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > MODEL_UPLOAD_LIMIT) throw new Error('BODY_TOO_LARGE');
          yield chunk;
        }
      }, createWriteStream(raw));
      const checked = inspectGlb(readFileSync(raw));
      if (!checked.ok) return json(req, res, 422, checked), true;
      await optimizeModel(raw, packed);
      const bytes = statSync(packed).size;
      if (bytes > MODEL_OUTPUT_LIMIT) return json(req, res, 422, { ok: false, error: 'TOO_LARGE_AFTER_COMPRESS', bytes }), true;
      if (!inspectGlb(readFileSync(packed)).ok) return json(req, res, 422, { ok: false, error: 'COMPRESS_FAILED' }), true;
      let id = replacing;
      if (!id) {
        id = shopIdFor(name);
        for (let suffix = 2; store.hasModel(id) || SHOP_ITEMS.some((item) => item.id === id); suffix += 1) id = `${shopIdFor(name).slice(0, 27)}-${suffix}`;
      }
      renameSync(packed, path.join(options.shopModelDir, `${id}.glb`));
      const item = store.saveModel({ id, name, price, base, bytes, clips: checked.clips });
      return json(req, res, 200, { item, triangles: checked.triangles }), true;
    } catch (error) {
      return json(req, res, error.message === 'BODY_TOO_LARGE' ? 413 : 500, { error: error.message === 'BODY_TOO_LARGE' ? 'body_too_large' : 'upload_failed' }), true;
    } finally {
      options.shopUploadBusy = false;
      rmSync(raw, { force: true });
      rmSync(packed, { force: true });
    }
  }
  // Admin: giá nhận nuôi linh thú (GET / PUT { pets: [{ species, price, active }] }, khóa ADMIN_SECRET).
  if (pathname === '/api/v1/admin/shop/pets') {
    if (!store) return json(req, res, 503, { error: 'shop_unavailable' }), true;
    if (!isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    // Kèm tốc độ đào (xu/giờ) ở cấp 1 và cấp cao nhất để admin xem; con số này nằm trong code, không sửa ở đây.
    const withRates = (pets) => pets.map((pet) => ({ ...pet, rate: [petRate(pet.species, 1) / 100, petRate(pet.species, PET_LEVEL_DAYS.length) / 100] }));
    if (req.method === 'GET') return json(req, res, 200, { pets: withRates(store.petPrices({ all: true })) }), true;
    if (req.method !== 'PUT') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const input = await readBody(req, res);
    if (!input) return true;
    const pets = store.setPetPrices(input.pets);
    if (!pets) return json(req, res, 400, { error: 'invalid_pets' }), true;
    return json(req, res, 200, { pets: withRates(pets) }), true;
  }
  // Admin: xem / lưu cả danh sách gói nạp (khóa ADMIN_SECRET trong header x-admin-key).
  if (pathname === '/api/v1/admin/shop/packs') {
    if (!store) return json(req, res, 503, { error: 'shop_unavailable' }), true;
    if (!isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (req.method === 'GET') return json(req, res, 200, { packs: store.packs({ all: true }), payments: Boolean(config.secretKey) }), true;
    if (req.method !== 'PUT') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const input = await readBody(req, res);
    if (!input) return true;
    const packs = normalizePacks(input.packs);
    if (!packs) return json(req, res, 400, { error: 'invalid_packs' }), true;
    json(req, res, 200, { packs: store.setPacks(packs) });
    return true;
  }
  if (!pathname.startsWith('/api/v1/shop')) return false;
  if (!store) return json(req, res, 503, { error: 'shop_unavailable' }), true;
  const account = currentAccount(req, options);

  if (pathname === '/api/v1/shop') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    const loginReward = account ? loginRewardView(options, account.id, { record: true }) : null;
    json(req, res, 200, {
      items: store.items(),
      // File mô hình của mọi nhân vật đã tải lên (cả món đang ẩn: người đã mua vẫn mặc, người khác phải thấy đúng hình).
      models: store.items({ all: true }).filter((item) => item.model).map(({ skin, model, base, name, thumb, dance }) => ({ skin, url: model, base, name, thumb, dance })),
      packs: store.packs().map(({ id, diamonds, cents }) => ({ id, diamonds, cents })),
      payments: Boolean(config.secretKey),
      me: account ? store.me(account.id) : null,
      loginReward,
    });
    return true;
  }
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  if (!account) return json(req, res, 401, { error: 'sign_in_required' }), true;

  // Lưu hình nhân vật đang chọn (cổng chùa, nút "Mặc" ở shop): Nam/Nữ hoặc hình đã mua.
  if (pathname === '/api/v1/shop/skin') {
    const input = await readBody(req, res);
    if (!input) return true;
    if (!allow(options, `shop-skin:${account.id}`, BUY_LIMIT)) return json(req, res, 429, { error: 'rate_limited' }), true;
    const result = store.setPreferredSkin(account.id, input.skin);
    return json(req, res, result.ok ? 200 : result.error === 'SKIN_LOCKED' ? 409 : 400, result.ok ? { skin: result.skin } : { error: result.error }), true;
  }
  if (pathname === '/api/v1/shop/buy') {
    const input = await readBody(req, res);
    if (!input) return true;
    if (!allow(options, `shop-buy:${account.id}`, BUY_LIMIT)) return json(req, res, 429, { error: 'rate_limited' }), true;
    const result = store.buy(account.id, input.itemId);
    if (!result.ok) return json(req, res, result.error === 'UNKNOWN_ITEM' ? 404 : 409, { error: result.error }), true;
    // Mua xong là mặc luôn: lưu làm hình đang chọn của tài khoản.
    if (!result.already) store.setPreferredSkin(account.id, input.itemId);
    json(req, res, 200, { ...result, me: store.me(account.id) });
    return true;
  }
  if (pathname === '/api/v1/shop/checkout') {
    const input = await readBody(req, res);
    if (!input) return true;
    const pack = store.packs().find((candidate) => candidate.id === input.packId);
    if (!pack) return json(req, res, 404, { error: 'unknown_pack' }), true;
    if (!config.secretKey) return json(req, res, 503, { error: 'payments_disabled' }), true;
    const origin = originOf(req, config);
    if (!origin) return json(req, res, 400, { error: 'unknown_origin' }), true;
    if (!allow(options, `shop-checkout:${account.id}`, CHECKOUT_LIMIT)) return json(req, res, 429, { error: 'rate_limited' }), true;
    let session;
    try {
      session = await createCheckoutSession(config, { pack, accountId: account.id, origin }, options.fetchImpl);
    } catch {
      return json(req, res, 502, { error: 'stripe_unavailable' }), true;
    }
    if (!SESSION_ID.test(session.id || '') || typeof session.url !== 'string') return json(req, res, 502, { error: 'stripe_unavailable' }), true;
    store.addPayment({ sessionId: session.id, accountId: account.id, pack });
    json(req, res, 200, { url: session.url });
    return true;
  }
  // Trang quay về từ Stripe hỏi lại phiên: cộng ngay nếu đã trả (không phải chờ webhook).
  if (pathname === '/api/v1/shop/checkout/confirm') {
    const input = await readBody(req, res);
    if (!input) return true;
    if (!SESSION_ID.test(input.sessionId || '')) return json(req, res, 400, { error: 'invalid_session' }), true;
    if (!config.secretKey) return json(req, res, 503, { error: 'payments_disabled' }), true;
    let session;
    try {
      session = await retrieveCheckoutSession(config, input.sessionId, options.fetchImpl);
    } catch {
      return json(req, res, 502, { error: 'stripe_unavailable' }), true;
    }
    if (session.client_reference_id !== account.id) return json(req, res, 403, { error: 'not_your_payment' }), true;
    const result = creditSession(store, session);
    if (!result.ok) return json(req, res, result.error === 'NOT_PAID' ? 202 : 409, { error: result.error, me: store.me(account.id) }), true;
    json(req, res, 200, { credited: result.credited, added: result.added || 0, me: store.me(account.id) });
    return true;
  }
  json(req, res, 404, { error: 'not_found' });
  return true;
}
