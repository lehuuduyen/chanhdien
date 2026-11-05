// API nội bộ nhận kết quả công việc từ máy realtime. Trình duyệt không có khóa x-internal-key nên không thể tự
// khai hoàn thành để lấy xu. Ví và giới hạn hằng ngày do garden store cập nhật trong một giao dịch SQLite.
import { timingSafeEqual } from 'node:crypto';
import { CHORE_REWARD_KINDS } from '@chanh-dien/garden';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { body } from './auth.mjs';
import { json } from './http.mjs';

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EVENT_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const STATUS = { INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 404 };

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleChoreRewardRequest(req, res, pathname, options) {
  if (pathname !== '/internal/chores/reward') return false;
  if (req.method !== 'POST') {
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
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 3 || !Object.keys(input).every((key) => ['accountId', 'chore', 'key'].includes(key))
    || !ACCOUNT_ID.test(input.accountId || '') || !CHORE_REWARD_KINDS.includes(input.chore)
    || !EVENT_KEY.test(input.key || '')) {
    json(req, res, 400, { ok: false, code: 'INVALID' });
    return true;
  }
  const result = options.garden.rewardChore({ accountId: input.accountId, chore: input.chore, key: input.key });
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
