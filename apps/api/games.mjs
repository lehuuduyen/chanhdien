// API phòng game. Bầu Cua chơi chung theo thời gian thực: máy realtime giữ nhịp ván và lắc xúc xắc, rồi gọi hai đường
// nội bộ dưới đây (khóa x-internal-key); ví xu (xu bán trái cây, 1 xu cược = 1 xu ví) chỉ đổi ở đây:
//   POST /internal/games/bau-cua/stake   { accountId, roundId, animal, amount, key } → trừ xu, ghi cược của ván
//   POST /internal/games/bau-cua/settle  { roundId, dice }                          → trả thưởng cả ván một lần
// Trình duyệt không gọi trực tiếp được (không có khóa nội bộ).
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { timingSafeEqual } from 'node:crypto';
import { body } from './auth.mjs';
import { json } from './http.mjs';

const STATUS = { INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, NOT_SIGNED_IN: 404, INSUFFICIENT_COINS: 409, STAKE_LIMIT: 409, ROUND_CLOSED: 409, ROUND_VOID: 409 };

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleGameRequest(req, res, pathname, options) {
  const match = pathname.match(/^\/internal\/games\/bau-cua\/(stake|settle)$/);
  if (!match && !pathname.startsWith('/api/v1/games')) return false;
  if (!match || req.method !== 'POST') {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!internalAllowed(req, options)) {
    json(req, res, 403, { error: 'forbidden' });
    return true;
  }
  if (!options.garden) {
    json(req, res, 503, { error: 'garden_disabled' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  const result = match[1] === 'stake'
    ? options.garden.stakeBauCua({ accountId: input.accountId, roundId: input.roundId, animal: input.animal, amount: input.amount, key: input.key })
    : options.garden.settleBauCuaRound({ roundId: input.roundId, dice: input.dice });
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
