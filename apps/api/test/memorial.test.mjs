import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken } from '@chanh-dien/session-token';
import { openGardenStore } from '../garden.mjs';
import { memorialTelegramCommand } from '../memorial.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

function setup() {
  const accounts = createAccountStore();
  const notices = [];
  const restricted = new Set();
  const options = {
    secret: SECRET, accounts, garden: openGardenStore(accounts, 'America/Los_Angeles'),
    moderation: { check: (text) => ({ action: /tục/.test(text) ? 'block' : 'ok' }), restriction: ({ accountId }) => (restricted.has(accountId) ? { until: Date.now() + 60_000 } : null) },
    memorialNotify: (text) => notices.push(text),
  };
  const member = (username) => {
    const account = accounts.register({ username, password: 'matkhau123', displayName: username }).account;
    return { id: account.id, headers: { cookie: `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}` } };
  };
  return { options, notices, restricted, member };
}

let serial = 0;
const key = () => `memorial-key-${(serial += 1).toString().padStart(6, '0')}`;
const build = (options, who, body) => request(options, 'POST', '/api/v1/memorial/build', { body, headers: { ...(who?.headers || {}), 'idempotency-key': key() } });

test('khu tưởng niệm: khách xem được; thành viên đắp mộ 100 xu, tên qua bộ lọc chữ, mỗi mộ báo Telegram', async () => {
  const { options, notices, restricted, member } = setup();
  const view = await request(options, 'GET', '/api/v1/memorial');
  assert.deepEqual([view.status, view.json.graves, view.json.price, view.json.count, view.json.nameMax, view.json.ttlMs], [200, [], 100, 36, 24, 86_400_000]);
  assert.equal((await build(options, null, { slot: 1, name: 'Ông Ba' })).status, 401);

  const an = member('an.lac');
  assert.equal((await build(options, an, { slot: 1, name: 'Ông Ba' })).json.code, 'INSUFFICIENT_COINS', 'ví mới chỉ có 50 xu');
  options.garden.adjustCoins({ accountId: an.id, amount: 300, key: 'grant-memorial-api' });
  assert.equal((await build(options, an, { slot: 1, name: 'đồ tục tĩu' })).json.code, 'TEXT_NOT_ALLOWED');
  assert.equal((await build(options, an, { slot: '1', name: 'Ông Ba' })).json.code, 'INVALID');
  const built = await build(options, an, { slot: 1, name: 'Ông Ba' });
  assert.equal(built.status, 200);
  assert.equal(built.json.coins, 250);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /🪦 Mộ mới · ô 1\n"Ông Ba" — đắp bởi an\.lac \(a-[^)]+\)\nGỡ: \/xoamo 1/);
  assert.equal((await build(options, an, { slot: 1, name: 'Bà Tư' })).status, 409);
  const after = await request(options, 'GET', '/api/v1/memorial');
  assert.deepEqual(after.json.graves.map(({ slot, grave }) => [slot, grave.name, grave.builderName]), [[1, 'Ông Ba', 'an.lac']]);
  // Quá 5 lần / phút: chặn.
  assert.equal((await build(options, an, { slot: 2, name: 'Bà Tư' })).json.code, 'RATE_LIMITED');
  // Đang bị khóa chat: không đắp được.
  const binh = member('binh.an');
  restricted.add(binh.id);
  assert.equal((await build(options, binh, { slot: 2, name: 'Bà Tư' })).json.code, 'CHAT_RESTRICTED');
  // Khác origin: từ chối.
  assert.equal((await request(options, 'POST', '/api/v1/memorial/build', { body: { slot: 3, name: 'Bà Tư' }, headers: { ...binh.headers, origin: 'https://evil.test', 'idempotency-key': key() } })).status, 403);

  // Quản trị gỡ qua Telegram.
  assert.equal(memorialTelegramCommand('xin chào', options), null);
  assert.match(memorialTelegramCommand('/xoamo', options), /Cú pháp/);
  assert.match(memorialTelegramCommand('/xoamo 1', options), /Đã gỡ mộ ô 1: "Ông Ba"/);
  assert.match(memorialTelegramCommand('/xoamo 1', options), /Ô 1 đang trống/);
  assert.deepEqual((await request(options, 'GET', '/api/v1/memorial')).json.graves, []);
});
