import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { createAccountStore, OFFERING_RULES } from '@chanh-dien/accounts';
import { createSessionToken, DEFAULT_LOCAL_SECRET, internalKey, SESSION_TTL_MS, verifySessionToken } from '@chanh-dien/session-token';
import { requestIp } from '../../packages/moderation/src/index.mjs';
import { json, readJson } from './http.mjs';

const COOKIE = 'cd_session';
const LEADERBOARD_CACHE_MS = 15_000;
const METRICS = new Set(['merit', 'incense', 'streak']);
const PERIODS = new Set(['all', 'week']);
// Giới hạn thử đăng nhập/đăng ký theo IP để chống dò mật khẩu.
const AUTH_LIMITS = { login: [10, 10 * 60_000], register: [5, 60 * 60_000], google: [20, 10 * 60_000] };

export function openAccountStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  return createAccountStore({ file: join(dataDir, 'app.db') });
}

function cookieValue(req, name) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

// Tài khoản của phiên hiện tại; cookie sai, hết hạn hoặc đã đăng xuất mọi nơi thì coi là khách.
export function currentAccount(req, options) {
  if (!options.accounts) return null;
  const token = cookieValue(req, COOKIE);
  if (!token) return null;
  const verified = verifySessionToken(token, options.secret || DEFAULT_LOCAL_SECRET);
  if (!verified.ok) return null;
  const account = options.accounts.get(verified.value.accountId);
  return account && account.sessionVersion === verified.value.version ? account : null;
}

function secureRequest(req) {
  return req.headers?.['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
}

function sessionCookie(req, token, maxAgeMs) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1_000)}${secureRequest(req) ? '; Secure' : ''}`;
}

// Form đăng nhập chỉ nhận từ chính trang (cùng Host) hoặc trang dev local; chặn trang lạ gửi hộ.
export function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === req.headers.host || ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

// X-Real-IP (nginx) rồi phần tử cuối X-Forwarded-For: phần tử đầu do trình duyệt tự khai, không dùng để giới hạn / khóa.
export function clientIp(req) {
  return requestIp(req.headers || {}, req.socket?.remoteAddress) || 'local';
}

export function allow(options, key, [limit, windowMs]) {
  const rates = options.authRates || (options.authRates = new Map());
  const now = Date.now();
  const hits = (rates.get(key) || []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  rates.set(key, hits);
  if (rates.size > 10_000) rates.delete(rates.keys().next().value);
  return true;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

// Xác minh ID token của Google Identity Services qua tokeninfo: đúng client, đúng nơi cấp, email đã xác minh.
export async function verifyGoogleCredential(credential, clientId) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return null;
  const info = await response.json();
  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== clientId || !issuerOk || Number(info.exp) * 1_000 <= Date.now() || typeof info.sub !== 'string') return null;
  return {
    sub: info.sub,
    email: info.email_verified === 'true' || info.email_verified === true ? info.email : null,
    name: typeof info.name === 'string' ? info.name : null,
    picture: typeof info.picture === 'string' && info.picture.startsWith('https://') ? info.picture : null,
  };
}

function signIn(req, res, options, account) {
  const token = createSessionToken({ accountId: account.id, version: account.sessionVersion }, options.secret || DEFAULT_LOCAL_SECRET);
  res.setHeader?.('Set-Cookie', sessionCookie(req, token, SESSION_TTL_MS));
  json(req, res, 200, { account: publicView(account) });
}

// Không trả sessionVersion ra trình duyệt.
const publicView = ({ sessionVersion, ...account }) => account;

const ERRORS = {
  INVALID_USERNAME: [400, 'Tên đăng nhập 3–24 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới'],
  WEAK_PASSWORD: [400, 'Mật khẩu cần ít nhất 8 ký tự'],
  USERNAME_TAKEN: [409, 'Tên đăng nhập đã có người dùng'],
  INVALID_CREDENTIALS: [401, 'Sai tên đăng nhập hoặc mật khẩu'],
};

function fail(req, res, code) {
  const [status, message] = ERRORS[code] || [400, 'Yêu cầu không hợp lệ'];
  json(req, res, status, { error: code.toLowerCase(), message });
}

export async function body(req, res) {
  try {
    const input = await readJson(req);
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch (error) {
    if (error.message === 'BODY_TOO_LARGE') {
      json(req, res, 413, { error: 'body_too_large' });
      return null;
    }
  }
  json(req, res, 400, { error: 'invalid_json' });
  return null;
}

function leaderboard(options, metric, period) {
  const cache = options.leaderboardCache || (options.leaderboardCache = new Map());
  const key = `${metric}:${period}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LEADERBOARD_CACHE_MS) return hit.rows;
  const rows = options.accounts.leaderboard({ metric, period: metric === 'streak' ? 'all' : period, limit: 50 });
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

// Trả true nếu đã xử lý request (đăng ký, đăng nhập, hồ sơ, xếp hạng, ghi lễ vật nội bộ).
export async function handleAuthRequest(req, res, pathname, options) {
  const accounts = options.accounts;
  if (req.method === 'GET' && pathname === '/api/v1/auth/config') {
    json(req, res, 200, { accounts: Boolean(accounts), googleClientId: accounts ? options.googleClientId || null : null });
    return true;
  }
  const authMatch = pathname.match(/^\/api\/v1\/auth\/(register|login|google|logout)$/);
  const known = authMatch || pathname === '/api/v1/me' || pathname === '/api/v1/me/history' || pathname === '/api/v1/me/friends'
    || pathname === '/api/v1/leaderboard' || pathname === '/internal/offerings' || pathname === '/internal/friends' || pathname === '/internal/reports';
  if (!known) return false;
  if (!accounts) {
    json(req, res, 503, { error: 'accounts_disabled' });
    return true;
  }

  if (req.method === 'POST' && pathname === '/internal/offerings') {
    if (!safeEqual(req.headers?.['x-internal-key'], internalKey(options.secret || DEFAULT_LOCAL_SECRET))) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    const valid = typeof input.accountId === 'string' && Object.hasOwn(OFFERING_RULES, input.kind)
      && (input.text === null || input.text === undefined || typeof input.text === 'string')
      && (input.roomId === undefined || typeof input.roomId === 'string')
      && (input.at === undefined || (Number.isSafeInteger(input.at) && Math.abs(input.at - Date.now()) < 5 * 60_000));
    const result = valid ? accounts.recordOffering({ accountId: input.accountId, kind: input.kind, text: input.text, roomId: input.roomId?.slice(0, 64), at: input.at }) : { ok: false };
    json(req, res, result.ok ? 200 : 400, result.ok ? result : { error: 'invalid_offering' });
    return true;
  }

  // Realtime hỏi / ghi bạn bè giữa hai thành viên trong phòng. action: check | add.
  if (req.method === 'POST' && pathname === '/internal/friends') {
    if (!safeEqual(req.headers?.['x-internal-key'], internalKey(options.secret || DEFAULT_LOCAL_SECRET))) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    const id = /^a-[a-zA-Z0-9-]{8,64}$/;
    if (!['check', 'add'].includes(input.action) || !id.test(input.first || '') || !id.test(input.second || '')) {
      json(req, res, 400, { error: 'invalid_friend' });
      return true;
    }
    if (input.action === 'check') {
      json(req, res, 200, { ok: true, friends: accounts.areFriends(input.first, input.second) });
      return true;
    }
    const result = accounts.addFriend(input.first, input.second);
    json(req, res, result.ok ? 200 : 400, result.ok ? result : { error: 'invalid_friend' });
    return true;
  }

  // Realtime chuyển báo cáo người chơi tới đây để lưu (chỉ API ghi cơ sở dữ liệu).
  if (req.method === 'POST' && pathname === '/internal/reports') {
    if (!safeEqual(req.headers?.['x-internal-key'], internalKey(options.secret || DEFAULT_LOCAL_SECRET))) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    const account = (value) => (typeof value === 'string' && /^a-[a-zA-Z0-9-]{8,64}$/.test(value) ? value : null);
    const valid = typeof input.roomId === 'string' && typeof input.reporterName === 'string' && typeof input.targetName === 'string'
      && ['spam', 'harassment', 'inappropriate', 'other'].includes(input.reason)
      && (input.note === undefined || input.note === null || typeof input.note === 'string');
    if (!valid) {
      json(req, res, 400, { error: 'invalid_report' });
      return true;
    }
    json(req, res, 200, accounts.addReport({
      roomId: input.roomId, reporterAccount: account(input.reporterAccount), reporterName: input.reporterName,
      targetAccount: account(input.targetAccount), targetName: input.targetName, reason: input.reason, note: input.note || null,
    }));
    return true;
  }

  if (authMatch && req.method === 'POST') {
    const action = authMatch[1];
    if (!sameOrigin(req)) {
      json(req, res, 403, { error: 'forbidden_origin' });
      return true;
    }
    if (action === 'logout') {
      const account = currentAccount(req, options);
      const input = await body(req, res);
      if (!input) return true;
      if (account && input.everywhere === true) accounts.revokeSessions(account.id);
      res.setHeader?.('Set-Cookie', sessionCookie(req, '', 0));
      json(req, res, 200, { ok: true });
      return true;
    }
    if (!allow(options, `${action}:${clientIp(req)}`, AUTH_LIMITS[action])) {
      json(req, res, 429, { error: 'rate_limited', message: 'Thử quá nhiều lần, xin đợi ít phút' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    if (action === 'register') {
      const names = [input.username, input.displayName].filter((value) => typeof value === 'string').join(' ');
      if (options.moderation?.check(names).action === 'block') {
        json(req, res, 400, { error: 'display_name_not_allowed', message: 'Tên có từ không phù hợp, xin chọn tên khác.' });
        return true;
      }
      const result = accounts.register({
        username: typeof input.username === 'string' ? input.username : '',
        password: typeof input.password === 'string' ? input.password : '',
        displayName: typeof input.displayName === 'string' ? input.displayName : '',
      });
      if (result.ok) signIn(req, res, options, result.account);
      else fail(req, res, result.error);
      return true;
    }
    if (action === 'login') {
      const result = accounts.login({
        username: typeof input.username === 'string' ? input.username.slice(0, 64) : '',
        password: typeof input.password === 'string' ? input.password.slice(0, 200) : '',
      });
      if (result.ok) signIn(req, res, options, result.account);
      else fail(req, res, result.error);
      return true;
    }
    // Google
    if (!options.googleClientId) {
      json(req, res, 503, { error: 'google_disabled', message: 'Chưa cấu hình đăng nhập Google' });
      return true;
    }
    if (typeof input.credential !== 'string' || input.credential.length > 4_096) {
      json(req, res, 400, { error: 'invalid_credential' });
      return true;
    }
    const verify = options.verifyGoogle || verifyGoogleCredential;
    const profile = await verify(input.credential, options.googleClientId).catch(() => null);
    if (!profile) {
      json(req, res, 401, { error: 'invalid_credential', message: 'Không xác minh được tài khoản Google' });
      return true;
    }
    signIn(req, res, options, accounts.upsertGoogle(profile));
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v1/leaderboard') {
    const params = new URL(req.url, 'http://local').searchParams;
    const metric = METRICS.has(params.get('metric')) ? params.get('metric') : 'merit';
    const period = PERIODS.has(params.get('period')) ? params.get('period') : 'all';
    const account = currentAccount(req, options);
    const rows = leaderboard(options, metric, period);
    json(req, res, 200, { metric, period, rows, me: account ? rows.find((row) => row.accountId === account.id)?.rank ?? null : null });
    return true;
  }

  if (req.method === 'GET' && (pathname === '/api/v1/me' || pathname === '/api/v1/me/history' || pathname === '/api/v1/me/friends')) {
    const account = currentAccount(req, options);
    if (!account) {
      json(req, res, 401, { error: 'not_signed_in' });
      return true;
    }
    if (pathname === '/api/v1/me') {
      const { stats } = accounts.profile(account.id);
      json(req, res, 200, { account: publicView(account), stats });
      return true;
    }
    if (pathname === '/api/v1/me/friends') {
      json(req, res, 200, { friends: accounts.friends(account.id) });
      return true;
    }
    const params = new URL(req.url, 'http://local').searchParams;
    const before = Number(params.get('before'));
    const items = accounts.history(account.id, { before: Number.isSafeInteger(before) && before > 0 ? before : undefined, limit: 30 });
    json(req, res, 200, { items: items.map(({ id, kind, merit, counted, text, at }) => ({ id, kind, merit, counted, text, at })) });
    return true;
  }

  json(req, res, 405, { error: 'method_not_allowed' });
  return true;
}
