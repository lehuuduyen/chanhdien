// Linh thú (đợt 1): nhận nuôi bằng kim cương (ví shop), nuôi bằng xu (ví vườn). Không phạt khi vắng — xem SPIRIT_PETS
// trong @chanh-dien/garden. Tên linh thú qua bộ lọc chữ và sổ khóa như chat.
//   GET  /api/v1/pets                          → { species: [{ id, price }], foodPrice, pets: [...], companion, coins, diamonds, signedIn }
// Giá kim cương admin đặt (trang admin, bảng spirit_pet_prices ở shop); loài admin tắt thì không nhận nuôi mới.
//   POST /api/v1/pets/adopt  { species, name? } → { ok, pet, diamonds, coins }   (trừ kim cương, Idempotency-Key)
//   POST /api/v1/pets/feed|collect|rename { species, name? } → { ok, code?, pet, coins, gained?, woke? }
//   POST /api/v1/pets/companion { species | null }  → { ok, companion }   (linh thú đi theo chủ ngoài sân)
// Đổi con dẫn theo / nhận nuôi / cho ăn (có thể lên cấp) thì báo mọi máy realtime (/internal/account-pet) để người trong
// phòng thấy ngay; vé vào phòng cũng mang linh thú đang dẫn theo.
import { cleanPetName, PET_FOOD_PRICE, SPIRIT_PETS } from '@chanh-dien/garden';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';
import { requestIpHash } from './moderation.mjs';
import { postToRealtime } from './realtime-broadcast.mjs';

// Báo các máy realtime linh thú đang dẫn theo của một tài khoản ({ species, level } hoặc null).
export function notifyPet(options, accountId) {
  return postToRealtime(options, '/internal/account-pet', { accountId, pet: options.garden.companion(accountId) }, 'linh thú');
}

const ACTION_LIMIT = [30, 60_000];
const STATUS = {
  INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 401, NO_PET: 404,
  ALREADY_OWNED: 409, ALREADY_FED: 409, CHEST_EMPTY: 409, INSUFFICIENT_COINS: 409, INSUFFICIENT_DIAMONDS: 409,
  CHAT_RESTRICTED: 403, TEXT_NOT_ALLOWED: 400, SHOP_DISABLED: 503, NOT_FOR_SALE: 409,
};
const catalog = (options) => (options.shopStore?.petPrices() || Object.entries(SPIRIT_PETS).map(([species, item]) => ({ species, price: item.price })))
  .map(({ species, price }) => ({ id: species, price }));

export async function handlePetsRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/pets' && !pathname.startsWith('/api/v1/pets/')) return false;
  const garden = options.garden;
  if (!garden) return json(req, res, 503, { error: 'pets_disabled' }), true;
  const account = currentAccount(req, options);
  if (pathname === '/api/v1/pets') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    if (!account) return json(req, res, 200, { species: catalog(options), foodPrice: PET_FOOD_PRICE, pets: [], coins: 0, diamonds: 0, signedIn: false }), true;
    const { pets, coins, companion } = garden.pets(account.id);
    return json(req, res, 200, { species: catalog(options), foodPrice: PET_FOOD_PRICE, pets, companion, coins, diamonds: options.shopStore?.me(account.id).diamonds ?? 0, signedIn: true }), true;
  }
  const action = pathname.slice('/api/v1/pets/'.length);
  if (!['adopt', 'feed', 'collect', 'rename', 'companion'].includes(action)) return json(req, res, 404, { error: 'not_found' }), true;
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  if (!account) return json(req, res, 401, { ok: false, code: 'NOT_SIGNED_IN' }), true;
  if (!allow(options, `pets:${account.id}`, ACTION_LIMIT)) return json(req, res, 429, { ok: false, code: 'RATE_LIMITED' }), true;
  const input = await body(req, res);
  if (!input) return true;
  if (action === 'companion') {
    const wanted = input.species === null ? null : typeof input.species === 'string' && Object.hasOwn(SPIRIT_PETS, input.species) ? input.species : undefined;
    if (wanted === undefined) return json(req, res, 400, { ok: false, code: 'INVALID' }), true;
    const result = garden.setCompanion(account.id, wanted);
    if (result.ok) notifyPet(options, account.id);
    return json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result), true;
  }
  const species = typeof input.species === 'string' && Object.hasOwn(SPIRIT_PETS, input.species) ? input.species : null;
  if (!species) return json(req, res, 400, { ok: false, code: 'INVALID' }), true;
  const key = req.headers?.['idempotency-key'];
  let name = '';
  if (action === 'rename' || (action === 'adopt' && input.name !== undefined && input.name !== '')) {
    name = cleanPetName(input.name);
    if (!name) return json(req, res, 400, { ok: false, code: 'INVALID' }), true;
    // Tên linh thú hiện cho người khác: cùng bộ lọc chữ và sổ khóa như chat.
    if (options.moderation?.restriction({ accountId: account.id, ipHash: requestIpHash(req, options) })) return json(req, res, 403, { ok: false, code: 'CHAT_RESTRICTED' }), true;
    if (options.moderation?.check(name).action === 'block') return json(req, res, 400, { ok: false, code: 'TEXT_NOT_ALLOWED' }), true;
  }
  const result = action === 'adopt' ? adopt(options, account.id, species, name, key) : garden.petAction(account.id, action, { species, name }, key);
  // Nhận nuôi (con đầu tự đi theo) / cho ăn (có thể lên cấp): cập nhật hình đi theo trong phòng.
  if (result.ok && !result.replayed && (action === 'adopt' || action === 'feed')) notifyPet(options, account.id);
  return json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result), true;
}

// Nhận nuôi: trừ kim cương trước (sổ shop, khóa Idempotency-Key), rồi ghi linh thú. Đã có loài này thì không trừ;
// không ghi được (vừa nhận loài này ở tab khác) thì hoàn kim cương.
function adopt(options, accountId, species, name, key) {
  const { garden, shopStore } = options;
  if (!shopStore) return { ok: false, code: 'SHOP_DISABLED' };
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) return { ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED' };
  const spendKey = `pet-${key}`.slice(0, 64);
  // Đã nuôi loài này (kể cả gửi lại lần nhận nuôi vừa thành công): không trừ thêm, trang tải lại danh sách.
  if (garden.ownsPet(accountId, species)) return { ok: false, code: 'ALREADY_OWNED' };
  // Giá lúc bấm theo bảng admin; loài đang tắt bán thì không nhận nuôi được.
  const offer = shopStore.petPrices().find((item) => item.species === species);
  if (!offer) return { ok: false, code: 'NOT_FOR_SALE' };
  const paid = shopStore.spend({ accountId, amount: offer.price, reason: 'pet_adopt', ref: species, key: spendKey });
  if (!paid.ok) return { ok: false, code: paid.error === 'INSUFFICIENT_DIAMONDS' ? 'INSUFFICIENT_DIAMONDS' : paid.error === 'NOT_SIGNED_IN' ? 'NOT_SIGNED_IN' : 'INVALID', diamonds: paid.diamonds };
  const made = garden.adoptPet(accountId, species, name);
  if (!made.ok || !made.created) {
    const back = shopStore.refund({ accountId, key: spendKey });
    return { ok: false, code: made.ok ? 'ALREADY_OWNED' : 'INVALID', diamonds: back.diamonds };
  }
  return { ok: true, pet: made.pet, diamonds: paid.diamonds, coins: garden.pets(accountId).coins };
}
