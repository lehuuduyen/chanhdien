// Giá mở phim ở rạp (rạp chung theo khu vực và rạp riêng): admin chọn trả bằng xu (ví Vườn Công Đức, mặc định) hay
// kim cương 💎 (ví shop) và đặt giá từng loại. Máy realtime không biết giá: nó gọi /internal/cinema/video/pay, API đọc
// cấu hình lúc đó rồi trừ đúng ví (khóa chống trừ hai lần theo key), trả lại loại tiền + số tiền để máy realtime ghi vào
// video trong hàng chờ; hoàn tiền (hủy phim, video lỗi, rạp đóng) gửi lại đúng loại tiền + key đó.
//
//   GET  /api/v1/cinema/video-price                         → { currency, price }        (trang rạp hiện giá)
//   GET  /api/v1/admin/cinema/video-price                   → { currency, coins, diamonds } (khóa ADMIN_SECRET)
//   PUT  /api/v1/admin/cinema/video-price { currency, coins, diamonds }
//   POST /internal/cinema/video/pay    { accountId, ref, key }            → { ok, currency, amount, balance } | { ok: false, error }
//   POST /internal/cinema/video/refund { accountId, key, currency }       → { ok, currency, balance }
import { timingSafeEqual } from 'node:crypto';
import { getRoomRules } from '@chanh-dien/room-rules';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { json, readJson } from './http.mjs';
import { isAdmin } from './support.mjs';

export const VIDEO_CURRENCIES = Object.freeze(['coins', 'diamonds']);
export const DEFAULT_VIDEO_PRICE = Object.freeze({ currency: 'coins', coins: 20, diamonds: getRoomRules('cinema')?.content?.videoPrice || 20 });
const MAX_PRICE = 100_000;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;
const validPrice = (value) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_PRICE;

export function createCinemaPay({ db, garden = null, shop = null, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cinema_video_price (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      currency TEXT NOT NULL CHECK (currency IN ('coins', 'diamonds')),
      coins INTEGER NOT NULL CHECK (coins >= 1),
      diamonds INTEGER NOT NULL CHECK (diamonds >= 1),
      updated_at INTEGER NOT NULL
    );`);
  const q = {
    get: db.prepare('SELECT currency, coins, diamonds FROM cinema_video_price WHERE id = 1'),
    set: db.prepare(`INSERT INTO cinema_video_price (id, currency, coins, diamonds, updated_at) VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, coins = excluded.coins, diamonds = excluded.diamonds, updated_at = excluded.updated_at`),
  };
  const config = () => ({ ...DEFAULT_VIDEO_PRICE, ...(q.get.get() || {}) });

  return {
    config,
    // Giá đang áp dụng (cho trang rạp): loại tiền + số tiền.
    price() {
      const current = config();
      return { currency: current.currency, price: current[current.currency] };
    },
    setConfig(input) {
      if (!input || !VIDEO_CURRENCIES.includes(input.currency) || !validPrice(input.coins) || !validPrice(input.diamonds)) return null;
      q.set.run(input.currency, input.coins, input.diamonds, now());
      return config();
    },
    pay({ accountId, ref, key }) {
      if (typeof accountId !== 'string' || typeof ref !== 'string' || !ref || ref.length > 80 || typeof key !== 'string' || !KEY.test(key)) {
        return { ok: false, error: 'INVALID' };
      }
      const { currency, price } = this.price();
      if (currency === 'coins') {
        if (!garden) return { ok: false, error: 'WALLET_UNAVAILABLE' };
        const paid = garden.spendCoins({ accountId, amount: price, reason: 'cinema_video', ref, key });
        if (!paid.ok) return { ok: false, error: paid.code === 'INSUFFICIENT_COINS' ? 'INSUFFICIENT_COINS' : paid.code || 'INVALID', currency, price };
        return { ok: true, currency, amount: paid.amount, balance: paid.coins };
      }
      if (!shop) return { ok: false, error: 'WALLET_UNAVAILABLE' };
      const paid = shop.spend({ accountId, amount: price, reason: 'cinema_video', ref, key });
      if (!paid.ok) return { ok: false, error: paid.error === 'INSUFFICIENT_DIAMONDS' ? 'INSUFFICIENT_DIAMONDS' : paid.error || 'INVALID', currency, price };
      return { ok: true, currency, amount: price, balance: paid.diamonds };
    },
    // Hoàn đúng loại tiền đã trả (máy realtime nhớ theo video), tối đa một lần cho mỗi key.
    refund({ accountId, key, currency }) {
      if (typeof accountId !== 'string' || typeof key !== 'string' || !KEY.test(key) || !VIDEO_CURRENCIES.includes(currency)) return { ok: false, error: 'INVALID' };
      if (currency === 'coins') {
        if (!garden) return { ok: false, error: 'WALLET_UNAVAILABLE' };
        const result = garden.refundCoins({ accountId, key });
        return result.ok ? { ok: true, currency, ...(result.replayed ? { replayed: true } : {}), balance: result.coins } : { ok: false, error: result.code };
      }
      if (!shop) return { ok: false, error: 'WALLET_UNAVAILABLE' };
      const result = shop.refund({ accountId, key });
      return result.ok ? { ok: true, currency, ...(result.replayed ? { replayed: true } : {}), balance: result.diamonds } : { ok: false, error: result.error };
    },
  };
}

const internalAllowed = (req, options) => {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// Dùng chung database tài khoản; tạo một lần khi có yêu cầu đầu tiên.
function payStore(options) {
  if (options.cinemaPay !== undefined) return options.cinemaPay;
  options.cinemaPay = options.accounts?.database
    ? createCinemaPay({ db: options.accounts.database, garden: options.garden || null, shop: options.shopStore || null })
    : null;
  return options.cinemaPay;
}

export async function handleCinemaPayRequest(req, res, pathname, options) {
  const isPublic = pathname === '/api/v1/cinema/video-price';
  const isAdminPath = pathname === '/api/v1/admin/cinema/video-price';
  const isInternal = pathname === '/internal/cinema/video/pay' || pathname === '/internal/cinema/video/refund';
  if (!isPublic && !isAdminPath && !isInternal) return false;
  const store = payStore(options);
  if (isPublic) {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    // Không có database (chạy thử không tài khoản): hiện giá mặc định.
    return json(req, res, 200, store ? store.price() : { currency: DEFAULT_VIDEO_PRICE.currency, price: DEFAULT_VIDEO_PRICE[DEFAULT_VIDEO_PRICE.currency] }), true;
  }
  if (isAdminPath) {
    if (!isAdmin(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
    if (!store) return json(req, res, 503, { error: 'accounts_disabled' }), true;
    if (req.method === 'GET') return json(req, res, 200, store.config()), true;
    if (req.method !== 'PUT') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    let input;
    try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
    const saved = store.setConfig(input);
    return json(req, res, saved ? 200 : 400, saved || { error: 'invalid_price' }), true;
  }
  if (req.method !== 'POST' || !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
  if (!store) return json(req, res, 503, { ok: false, error: 'WALLET_UNAVAILABLE' }), true;
  let input;
  try { input = await readJson(req); } catch { return json(req, res, 400, { ok: false, error: 'INVALID' }), true; }
  const result = pathname.endsWith('/pay') ? store.pay(input || {}) : store.refund(input || {});
  return json(req, res, 200, result), true;
}
