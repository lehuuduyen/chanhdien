import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
import { openGardenStore } from '../garden.mjs';
import { handleApiRequest } from '../server.mjs';
import { openShopStore } from '../shop.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const ADMIN = 'admin-secret-for-tests';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

test('giá mở phim: mặc định 20 xu; admin chuyển sang kim cương; trả / hoàn đúng ví, mỗi lần trả hoàn tối đa một lần', async () => {
  const accounts = createAccountStore();
  const garden = openGardenStore(accounts, 'America/Los_Angeles');
  const shopStore = openShopStore(accounts);
  const an = accounts.register({ username: 'an.xem', password: 'matkhau123', displayName: 'An' }).account;
  shopStore.adjustDiamonds({ accountId: an.id, amount: 20, key: 'grant-diamond-01' });
  const options = { secret: SECRET, adminSecret: ADMIN, accounts, garden, shopStore };
  const internal = (path, body) => request(options, 'POST', path, { body, headers: { 'x-internal-key': internalKey(SECRET) } });
  const admin = (method, body) => request(options, method, '/api/v1/admin/cinema/video-price', { body, headers: { 'x-admin-key': ADMIN } });

  assert.deepEqual((await request(options, 'GET', '/api/v1/cinema/video-price')).json, { currency: 'coins', price: 20 });
  const coins = garden.me(an.id).coins;
  const paid = await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'dQw4w9WgXcQ', key: 'video-pay-0001' });
  assert.deepEqual(paid.json, { ok: true, currency: 'coins', amount: 20, balance: coins - 20 });
  assert.equal((await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'dQw4w9WgXcQ', key: 'video-pay-0001' })).json.balance, coins - 20, 'gửi lại không trừ hai lần');
  // Ví còn 30 xu: trả thêm một phim (còn 10), phim thứ ba thiếu xu.
  assert.equal((await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'aaaaaaaaaaa', key: 'video-pay-0002' })).json.balance, coins - 40);
  const poor = await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'bbbbbbbbbbb', key: 'video-pay-0003' });
  assert.deepEqual([poor.json.ok, poor.json.error, poor.json.price], [false, 'INSUFFICIENT_COINS', 20]);
  // Hủy phim: hoàn đúng xu, gửi lại không hoàn hai lần.
  assert.deepEqual((await internal('/internal/cinema/video/refund', { accountId: an.id, key: 'video-pay-0002', currency: 'coins' })).json, { ok: true, currency: 'coins', balance: coins - 20 });
  assert.equal((await internal('/internal/cinema/video/refund', { accountId: an.id, key: 'video-pay-0002', currency: 'coins' })).json.replayed, true);
  assert.equal(garden.me(an.id).coins, coins - 20);

  // Quyền: trình duyệt không gọi được đường nội bộ, người không có khóa admin không đổi được giá.
  assert.equal((await request(options, 'POST', '/internal/cinema/video/pay', { body: { accountId: an.id, ref: 'x', key: 'video-pay-0009' } })).status, 403);
  assert.equal((await request(options, 'PUT', '/api/v1/admin/cinema/video-price', { body: { currency: 'diamonds', coins: 1, diamonds: 1 } })).status, 403);
  assert.equal((await admin('PUT', { currency: 'gold', coins: 20, diamonds: 20 })).status, 400);
  assert.equal((await admin('PUT', { currency: 'coins', coins: 0, diamonds: 20 })).status, 400);

  // Admin bật công tắc kim cương, giá 15 💎.
  assert.deepEqual((await admin('PUT', { currency: 'diamonds', coins: 25, diamonds: 15 })).json, { currency: 'diamonds', coins: 25, diamonds: 15 });
  assert.deepEqual((await admin('GET')).json, { currency: 'diamonds', coins: 25, diamonds: 15 });
  assert.deepEqual((await request(options, 'GET', '/api/v1/cinema/video-price')).json, { currency: 'diamonds', price: 15 });
  const gem = await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'ccccccccccc', key: 'video-pay-0004' });
  assert.deepEqual(gem.json, { ok: true, currency: 'diamonds', amount: 15, balance: 5 });
  assert.equal(garden.me(an.id).coins, coins - 20, 'trả bằng kim cương thì xu không đổi');
  const gemPoor = await internal('/internal/cinema/video/pay', { accountId: an.id, ref: 'ddddddddddd', key: 'video-pay-0005' });
  assert.deepEqual([gemPoor.json.error, gemPoor.json.price], ['INSUFFICIENT_DIAMONDS', 15]);
  // Video trả bằng xu trước khi đổi công tắc vẫn hoàn bằng xu (máy realtime nhớ loại tiền theo video).
  assert.equal((await internal('/internal/cinema/video/refund', { accountId: an.id, key: 'video-pay-0001', currency: 'coins' })).json.balance, coins);
  assert.equal((await internal('/internal/cinema/video/refund', { accountId: an.id, key: 'video-pay-0004', currency: 'diamonds' })).json.balance, 20);
  assert.equal((await internal('/internal/cinema/video/refund', { accountId: an.id, key: 'video-pay-0099', currency: 'diamonds' })).json.ok, false, 'không hoàn lần trả không có thật');
});
