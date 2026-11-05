// Hỗ trợ: người dùng gửi báo lỗi / hỗ trợ xu / góp ý nâng cấp; quản trị xem trong trang admin. Lưu file JSON ở DATA_DIR (giống
// sớ cầu nguyện). Kiểm tra kiểu và cắt độ dài mọi trường; văn bản người dùng chỉ hiện bằng textContent.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allow, body, clientIp, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';

export const SUPPORT_KINDS = Object.freeze(['bug', 'coins', 'idea', 'other']);
export const SUPPORT_STATUSES = Object.freeze(['new', 'seen', 'done']);
const MAX_TICKETS = 2_000;
const SUBMIT_LIMIT = [5, 10 * 60_000];
const LIMITS = { message: 1_000, contact: 120, page: 200, userAgent: 200 };
const clone = (value) => JSON.parse(JSON.stringify(value));
// Bỏ ký tự điều khiển, gọn khoảng trắng hai đầu, cắt độ dài.
const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');

export function normalizeTicket(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!SUPPORT_KINDS.includes(input.kind)) return null;
  const message = clean(input.message, LIMITS.message);
  if (message.length < 5) return null;
  const contact = clean(input.contact, LIMITS.contact);
  const page = clean(input.page, LIMITS.page);
  return { kind: input.kind, message, ...(contact ? { contact } : {}), ...(page.startsWith('/') ? { page } : {}) };
}

export function createMemorySupportStore(initial = [], { now = () => Date.now(), id = () => `ht-${randomUUID()}` } = {}) {
  let values = Array.isArray(initial) ? clone(initial) : [];
  return {
    create(ticket, extra = {}) {
      const value = { id: id(), ...ticket, ...extra, status: 'new', submittedAt: now(), updatedAt: now() };
      values.unshift(value);
      values = values.slice(0, MAX_TICKETS);
      return clone(value);
    },
    list(limit = 100) {
      return clone(values.slice(0, Math.min(MAX_TICKETS, Math.max(1, limit))));
    },
    setStatus(ticketId, status) {
      if (!SUPPORT_STATUSES.includes(status)) return null;
      const value = values.find((item) => item.id === ticketId);
      if (!value) return null;
      value.status = status;
      value.updatedAt = now();
      return clone(value);
    },
  };
}

export function openSupportStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'support.json');
  let initial = [];
  try { initial = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  const memory = createMemorySupportStore(initial);
  const persist = () => {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(memory.list(MAX_TICKETS), null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
  };
  return {
    create(ticket, extra) { const value = memory.create(ticket, extra); persist(); return value; },
    list: memory.list,
    setStatus(ticketId, status) { const value = memory.setStatus(ticketId, status); if (value) persist(); return value; },
  };
}

export function isAdmin(req, options) {
  const given = Buffer.from(String(req.headers?.['x-admin-key'] || ''));
  const expected = Buffer.from(String(options.adminSecret || ''));
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

const store = (options) => (options.supportStore ||= createMemorySupportStore());

export async function handleSupportRequest(req, res, pathname, options) {
  // Người dùng gửi phiếu (khách cũng gửi được; đã đăng nhập thì kèm tên tài khoản).
  if (pathname === '/api/v1/support') {
    if (req.method !== 'POST') {
      json(req, res, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!sameOrigin(req)) {
      json(req, res, 403, { error: 'forbidden_origin' });
      return true;
    }
    const account = currentAccount(req, options);
    if (!allow(options, `support:${account?.id || clientIp(req)}`, SUBMIT_LIMIT)) {
      json(req, res, 429, { error: 'rate_limited' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    const ticket = normalizeTicket(input);
    if (!ticket) {
      json(req, res, 400, { error: 'invalid_ticket' });
      return true;
    }
    const userAgent = clean(req.headers?.['user-agent'], LIMITS.userAgent);
    const saved = store(options).create(ticket, {
      ...(account ? { account: { id: account.id, displayName: account.displayName } } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    // Báo quản trị (Telegram) nếu đã cấu hình; không chờ, lỗi không ảnh hưởng phiếu đã lưu.
    options.notifySupport?.(saved);
    json(req, res, 201, { id: saved.id, submittedAt: saved.submittedAt });
    return true;
  }
  // Quản trị: xem danh sách, đổi trạng thái (mới / đã xem / đã xử lý).
  if (pathname === '/api/v1/admin/support' && req.method === 'GET') {
    if (!isAdmin(req, options)) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const limit = Number(new URL(req.url, 'http://local').searchParams.get('limit')) || 100;
    json(req, res, 200, { tickets: store(options).list(limit) });
    return true;
  }
  const status = req.method === 'PATCH' && pathname.match(/^\/api\/v1\/admin\/support\/(ht-[a-zA-Z0-9-]{1,80})$/);
  if (status) {
    if (!isAdmin(req, options)) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const input = await body(req, res);
    if (!input) return true;
    const saved = store(options).setStatus(status[1], input.status);
    json(req, res, saved ? 200 : 400, saved || { error: 'invalid_status' });
    return true;
  }
  return false;
}
