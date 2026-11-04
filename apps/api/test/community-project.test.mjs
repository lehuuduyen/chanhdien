import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { handleApiRequest } from '../server.mjs';
import { openCommunityProjectStore } from '../community-project.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, next) { this.status = status; Object.assign(this.headers, next); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

function setup(extra = {}) {
  const accounts = createAccountStore();
  return { secret: SECRET, accounts, communityProject: openCommunityProjectStore(accounts), ...extra };
}

async function signUp(options) {
  const response = await request(options, 'POST', '/api/v1/auth/register', {
    body: { username: 'an.lac', password: 'matkhau123', displayName: 'An Lạc' },
  });
  return response.headers['set-cookie'].split(';')[0];
}

test('công trình chung xem công khai; đóng góp cần tài khoản, origin và khóa idempotency', async () => {
  const options = setup();
  const view = await request(options, 'GET', '/api/v1/community-project');
  assert.equal(view.status, 200);
  assert.equal(view.json.project.id, 'bodhi-global-1');
  assert.equal(view.json.me, null);
  assert.equal((await request(options, 'POST', '/api/v1/community-project/contribute', { body: { action: 'water' }, headers: { 'idempotency-key': 'guest-key-01' } })).status, 401);
  const cookie = await signUp(options);
  assert.equal((await request(options, 'POST', '/api/v1/community-project/contribute', { body: { action: 'water' }, headers: { cookie, origin: 'https://evil.example', 'idempotency-key': 'foreign-key-1' } })).status, 403);
  const noKey = await request(options, 'POST', '/api/v1/community-project/contribute', { body: { action: 'water' }, headers: { cookie } });
  assert.equal(noKey.json.code, 'IDEMPOTENCY_KEY_REQUIRED');
  const contributed = await request(options, 'POST', '/api/v1/community-project/contribute', { body: { action: 'water' }, headers: { cookie, 'idempotency-key': 'water-key-001' } });
  assert.equal(contributed.status, 200);
  assert.equal(contributed.json.project.progress, 5);
  assert.deepEqual(contributed.json.me.today, ['water']);
  const replay = await request(options, 'POST', '/api/v1/community-project/contribute', { body: { action: 'water' }, headers: { cookie, 'idempotency-key': 'water-key-001' } });
  assert.equal(replay.json.replayed, true);
  assert.equal(replay.json.project.progress, 5);
});

test('API bỏ trường điểm giả do client gửi', async () => {
  const options = setup();
  const cookie = await signUp(options);
  const result = await request(options, 'POST', '/api/v1/community-project/contribute', {
    body: { action: 'dig', points: 999_999 }, headers: { cookie, 'idempotency-key': 'fake-points-1' },
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.code, 'INVALID');
  assert.equal((await request(options, 'GET', '/api/v1/community-project')).json.project.progress, 0);
});
