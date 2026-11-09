import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
import { openGardenStore } from '../garden.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, url, body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method: 'POST', url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status) { this.status = status; return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

test('thưởng trốn tìm qua API nội bộ: cần khóa nội bộ, trả 10 xu, gửi lại không trả hai lần', async () => {
  const accounts = createAccountStore();
  const garden = openGardenStore(accounts, 'America/Los_Angeles');
  const an = accounts.register({ username: 'an.tron', password: 'matkhau123', displayName: 'An' }).account;
  const options = { secret: SECRET, accounts, garden };
  const coins = garden.me(an.id).coins;
  assert.equal((await request(options, '/internal/hideseek/reward', { accountId: an.id, key: 'hs-round-key-01' })).status, 403, 'trình duyệt không tự nhận thưởng được');
  const headers = { 'x-internal-key': internalKey(SECRET) };
  const first = await request(options, '/internal/hideseek/reward', { accountId: an.id, key: 'hs-round-key-01' }, headers);
  assert.deepEqual([first.status, first.json.reward, first.json.coins], [200, 10, coins + 10]);
  assert.equal((await request(options, '/internal/hideseek/reward', { accountId: an.id, key: 'hs-round-key-01' }, headers)).json.replayed, true);
  assert.equal(garden.me(an.id).coins, coins + 10);
  assert.equal((await request(options, '/internal/hideseek/reward', { accountId: '../x', key: 'hs-round-key-02' }, headers)).status, 400);
});
