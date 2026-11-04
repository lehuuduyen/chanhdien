// API công trình chung: đọc công khai, đóng góp cần đăng nhập + cùng origin + Idempotency-Key.
// API báo realtime sau khi giao dịch SQLite đã commit; nếu báo lỗi, client vẫn tự tải lại định kỳ.
import { createCommunityProjectStore } from '@chanh-dien/community-project';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';

const STATUS = {
  INVALID: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  ACTION_DONE_TODAY: 409,
  PROJECT_COMPLETE: 409,
};

export function openCommunityProjectStore(accounts, options = {}) {
  return accounts ? createCommunityProjectStore({ db: accounts.database, ...options }) : null;
}

export function notifyCommunityProject(options, project) {
  if (!options.realtimeInternalUrl || !project) return Promise.resolve();
  return fetch(new URL('/internal/community-project', options.realtimeInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(options.secret || DEFAULT_LOCAL_SECRET) },
    body: JSON.stringify({ project }),
    signal: AbortSignal.timeout(3_000),
  }).catch((error) => console.warn(`Không báo được realtime về công trình chung: ${error.message}`));
}

export async function handleCommunityProjectRequest(req, res, pathname, options) {
  if (!pathname.startsWith('/api/v1/community-project')) return false;
  const store = options.communityProject;
  if (!store) {
    json(req, res, 503, { error: 'community_project_disabled' });
    return true;
  }
  const account = currentAccount(req, options);
  if (req.method === 'GET' && pathname === '/api/v1/community-project') {
    json(req, res, 200, store.snapshot(account?.id));
    return true;
  }
  if (req.method !== 'POST' || pathname !== '/api/v1/community-project/contribute') {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!sameOrigin(req)) {
    json(req, res, 403, { error: 'forbidden_origin' });
    return true;
  }
  if (!account) {
    json(req, res, 401, { ok: false, code: 'NOT_SIGNED_IN' });
    return true;
  }
  if (!allow(options, `community-project:${account.id}`, [12, 60_000])) {
    json(req, res, 429, { ok: false, code: 'RATE_LIMITED' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  const clean = input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 1
    && typeof input.action === 'string' ? input.action : null;
  const result = store.contribute(account.id, clean, req.headers?.['idempotency-key']);
  if (result.ok && !result.replayed) notifyCommunityProject(options, result.project);
  json(req, res, result.ok ? 200 : STATUS[result.code] || (result.code === 'NOT_SIGNED_IN' ? 401 : 400), result);
  return true;
}
