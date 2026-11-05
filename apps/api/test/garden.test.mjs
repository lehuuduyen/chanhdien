import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
import { handleApiRequest } from '../server.mjs';
import { openGardenStore } from '../garden.mjs';

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
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

function setup(extra = {}) {
  const accounts = createAccountStore();
  return { secret: SECRET, accounts, garden: openGardenStore(accounts, 'America/Los_Angeles'), ...extra };
}

async function signUp(options, username) {
  const response = await request(options, 'POST', '/api/v1/auth/register', { body: { username, password: 'matkhau123', displayName: username } });
  return response.headers['set-cookie'].split(';')[0];
}

let serial = 0;
const key = () => `test-key-${(serial += 1).toString().padStart(6, '0')}`;

test('vườn: khách xem được 10 luống nhưng không gieo / mua được', async () => {
  const options = setup();
  const view = await request(options, 'GET', '/api/v1/garden');
  assert.equal(view.status, 200);
  assert.equal(view.json.plots.length, 10);
  assert.equal(view.json.plants.apple.seedPrice, 10);
  assert.equal((await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'apple', quantity: 1 }, headers: { 'idempotency-key': key() } })).status, 401);
  assert.equal((await request(options, 'GET', '/api/v1/garden/me')).status, 401);
});

test('API nội bộ công việc: cần khóa máy, cộng xu idempotent và áp giới hạn ngày', async () => {
  const options = setup();
  const accountId = options.accounts.register({ username: 'cong.viec', password: 'matkhau123', displayName: 'Công Việc' }).account.id;
  const url = '/internal/chores/reward';
  const denied = await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-1' } });
  assert.equal(denied.status, 403);
  const headers = { 'x-internal-key': internalKey(SECRET) };
  const first = await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-1' }, headers });
  assert.deepEqual([first.status, first.json.reward, first.json.count], [200, 20, 1]);
  const replay = await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-1' }, headers });
  assert.equal(replay.json.replayed, true);
  await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-2' }, headers });
  await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-3' }, headers });
  const capped = await request(options, 'POST', url, { body: { accountId, chore: 'sweep', key: 'chore-api-4' }, headers });
  assert.deepEqual([capped.json.reward, capped.json.count, capped.json.limited], [0, 3, true]);
  assert.equal(options.garden.me(accountId).coins, 110);
});

test('vườn: thao tác cần khóa idempotency, cùng origin; số liệu do server quyết định', async () => {
  const options = setup();
  const cookie = await signUp(options, 'an.lac');
  const noKey = await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'apple', quantity: 1 }, headers: { cookie } });
  assert.equal(noKey.json.code, 'IDEMPOTENCY_KEY_REQUIRED');
  const foreign = await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'apple', quantity: 1 }, headers: { cookie, origin: 'https://evil.example', 'idempotency-key': key() } });
  assert.equal(foreign.status, 403);
  // Client gửi kèm số dư / chủ luống giả: bị bỏ qua.
  const idem = key();
  const bought = await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'apple', quantity: 2, coins: 99999, owner: 'x' }, headers: { cookie, 'idempotency-key': idem } });
  assert.equal(bought.status, 200);
  assert.equal(bought.json.me.coins, 30);
  const replay = await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'apple', quantity: 2 }, headers: { cookie, 'idempotency-key': idem } });
  assert.equal(replay.json.replayed, true);
  assert.equal(replay.json.me.coins, 30, 'gửi lại không trừ lần hai');
  const me = await request(options, 'GET', '/api/v1/garden/me', { headers: { cookie } });
  assert.deepEqual(me.json.me.seeds, { apple: 2 });
  assert.equal(me.json.history.length, 2);
});

test('vườn: gieo / tưới báo realtime để mọi phòng cùng thấy; người thứ hai không chiếm được luống', async () => {
  const received = [];
  const realtime = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      received.push({ url: req.url, key: req.headers['x-internal-key'], body: JSON.parse(raw) });
      res.end('{}');
    });
  });
  await new Promise((resolve) => realtime.listen(0, '127.0.0.1', resolve));
  const options = setup({ realtimeInternalUrl: `http://127.0.0.1:${realtime.address().port}` });
  const an = await signUp(options, 'an.lac');
  const binh = await signUp(options, 'binh.an');
  for (const cookie of [an, binh]) await request(options, 'POST', '/api/v1/garden/buy', { body: { plantType: 'orange', quantity: 1 }, headers: { cookie, 'idempotency-key': key() } });
  const planted = await request(options, 'POST', '/api/v1/garden/plant', { body: { plotId: 4, plantType: 'orange' }, headers: { cookie: an, 'idempotency-key': key() } });
  assert.equal(planted.status, 200);
  const taken = await request(options, 'POST', '/api/v1/garden/plant', { body: { plotId: 4, plantType: 'orange' }, headers: { cookie: binh, 'idempotency-key': key() } });
  assert.equal(taken.status, 409);
  assert.equal(taken.json.code, 'PLOT_TAKEN');
  const watered = await request(options, 'POST', '/api/v1/garden/water', { body: { plotId: 4 }, headers: { cookie: binh, 'idempotency-key': key() } });
  assert.equal(watered.json.plots[0].crop.stage, 'sprout');
  await new Promise((resolve) => setTimeout(resolve, 100));
  realtime.close();
  assert.deepEqual(received.map((item) => [item.url, item.body.effect?.kind]), [['/internal/garden', 'plant'], ['/internal/garden', 'water']]);
  assert.equal(received[0].body.plots[0].crop.ownerName, 'an.lac');
  assert.ok(received[0].key, 'gọi realtime có khóa nội bộ');
});
