// Khu tưởng niệm ngoài sân chùa: thành viên trả GRAVE_PRICE xu (ví Vườn Công Đức) đắp một ngôi mộ ghi tên, bia hiện
// chữ R.I.P, giữ GRAVE_TTL_MS rồi ô trống lại. Xem: mọi người. Đắp: đăng nhập, cùng origin, Idempotency-Key, tên qua
// bộ lọc chữ và sổ khóa như chat. Mỗi mộ mới báo nhóm Telegram quản trị; quản trị gỡ bằng `/xoamo <số ô>` (không hoàn
// xu). Ô đổi thì báo máy realtime phát `memorial.grave` cho mọi phòng chánh điện.
//   GET  /api/v1/memorial                         → { graves: [{ slot, grave }], price, ttlMs, nameMax, count }
//   POST /api/v1/memorial/build { slot, name }    → { ok, code?, coins, graves }
import { postToRealtime } from './realtime-broadcast.mjs';
import { cleanGraveName, GRAVE_COUNT, GRAVE_NAME_MAX, GRAVE_PRICE, GRAVE_TTL_MS } from '@chanh-dien/garden';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';
import { requestIpHash } from './moderation.mjs';

const BUILD_LIMIT = [5, 60_000];
const STATUS = { INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 401, GRAVE_TAKEN: 409, INSUFFICIENT_COINS: 409 };

// Báo mọi máy realtime để phát cho mọi phòng chánh điện. Lỗi mạng không làm hỏng thao tác (client tự tải lại khi mở bảng).
export function notifyMemorial(options, graves) {
  if (!graves?.length) return Promise.resolve();
  return postToRealtime(options, '/internal/memorial', { graves }, 'khu tưởng niệm');
}

export async function handleMemorialRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/memorial' && pathname !== '/api/v1/memorial/build') return false;
  const garden = options.garden;
  if (!garden) return json(req, res, 503, { error: 'memorial_disabled' }), true;
  if (pathname === '/api/v1/memorial') {
    if (req.method !== 'GET') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    return json(req, res, 200, { graves: garden.graves(), price: GRAVE_PRICE, ttlMs: GRAVE_TTL_MS, nameMax: GRAVE_NAME_MAX, count: GRAVE_COUNT }), true;
  }
  if (req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' }), true;
  const account = currentAccount(req, options);
  if (!account) return json(req, res, 401, { ok: false, code: 'NOT_SIGNED_IN' }), true;
  if (!allow(options, `memorial:${account.id}`, BUILD_LIMIT)) return json(req, res, 429, { ok: false, code: 'RATE_LIMITED' }), true;
  const input = await body(req, res);
  if (!input) return true;
  const name = cleanGraveName(input.name);
  if (!Number.isSafeInteger(input.slot) || !name) return json(req, res, 400, { ok: false, code: 'INVALID' }), true;
  // Tên trên bia hiện cho mọi người: cùng bộ lọc chữ và sổ khóa như chat.
  if (options.moderation?.restriction({ accountId: account.id, ipHash: requestIpHash(req, options) })) {
    return json(req, res, 403, { ok: false, code: 'CHAT_RESTRICTED' }), true;
  }
  if (options.moderation?.check(name).action === 'block') return json(req, res, 400, { ok: false, code: 'TEXT_NOT_ALLOWED' }), true;
  const result = garden.buildGrave(account.id, { slot: input.slot, name }, req.headers?.['idempotency-key']);
  if (result.ok && !result.replayed) {
    notifyMemorial(options, result.graves);
    const grave = result.graves[0].grave;
    options.memorialNotify?.([
      `🪦 Mộ mới · ô ${input.slot}`,
      `"${grave.name}" — đắp bởi ${account.displayName} (${account.id})`,
      `Gỡ: /xoamo ${input.slot}`,
    ].join('\n'));
  }
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}

// Lệnh Telegram của quản trị: "/xoamo <số ô>" gỡ mộ (tên xúc phạm, quấy rối). Trả câu trả lời hoặc null nếu không phải lệnh này.
export function memorialTelegramCommand(text, options) {
  const match = typeof text === 'string' && /^\/?xoamo(?:@[A-Za-z0-9_]+)?(?:\s+(\d{1,3}))?\s*$/i.exec(text.trim());
  if (!match) return null;
  if (!options.garden) return 'Khu tưởng niệm đang tắt.';
  if (!match[1]) return `Cú pháp: /xoamo <số ô 1–${GRAVE_COUNT}>`;
  const result = options.garden.removeGrave(Number(match[1]), 'telegram');
  if (!result.ok) return result.code === 'NOT_FOUND' ? `Ô ${match[1]} đang trống.` : `Số ô phải từ 1 đến ${GRAVE_COUNT}.`;
  notifyMemorial(options, [{ slot: result.slot, grave: null }]);
  return `🗑 Đã gỡ mộ ô ${result.slot}: "${result.name}" (đắp bởi ${result.builderName}).`;
}
