// API phòng game. Bầu Cua cược bằng xu của ví Vườn Công Đức (xu bán trái cây, 1 xu cược = 1 xu ví): phải đăng nhập,
// cùng origin, kèm header Idempotency-Key. Server lắc xúc xắc và quyết định số dư, không tin số liệu client gửi lên
// (client chỉ gửi số xu cược cho từng linh vật).
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';

const ROLL_LIMIT = [40, 60_000];
const STATUS = { INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 401, INSUFFICIENT_COINS: 409 };

export async function handleGameRequest(req, res, pathname, options) {
  if (!pathname.startsWith('/api/v1/games')) return false;
  if (req.method !== 'POST' || pathname !== '/api/v1/games/bau-cua/roll') {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!options.garden) {
    json(req, res, 503, { error: 'garden_disabled' });
    return true;
  }
  if (!sameOrigin(req)) {
    json(req, res, 403, { error: 'forbidden_origin' });
    return true;
  }
  const account = currentAccount(req, options);
  if (!account) {
    json(req, res, 401, { ok: false, code: 'NOT_SIGNED_IN' });
    return true;
  }
  if (!allow(options, `game:${account.id}`, ROLL_LIMIT)) {
    json(req, res, 429, { ok: false, code: 'RATE_LIMITED' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  const result = options.garden.playBauCua(account.id, input.bets, req.headers?.['idempotency-key']);
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
