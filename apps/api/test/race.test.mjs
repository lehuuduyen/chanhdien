import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken, internalKey } from '@chanh-dien/session-token';
import { createRaceStore } from '../race.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

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

function setup() {
  const clock = { now: Date.UTC(2026, 10, 24, 20, 0) };
  const accounts = createAccountStore();
  const race = createRaceStore({ db: accounts.database, now: () => clock.now });
  const options = { secret: SECRET, accounts, race };
  const an = accounts.register({ username: 'an.duaxe', password: 'matkhau123', displayName: 'An' }).account;
  const binh = accounts.register({ username: 'binh.duaxe', password: 'matkhau123', displayName: 'Bình' }).account;
  const cookie = `cd_session=${createSessionToken({ accountId: an.id, version: an.sessionVersion ?? 0 }, SECRET)}`;
  const internal = (path, body, key = internalKey(SECRET)) => request(options, 'POST', path, { body, headers: { 'x-internal-key': key } });
  return { clock, options, an, binh, cookie, internal, view: async (signedIn = true) => (await request(options, 'GET', '/api/v1/race', { headers: signedIn ? { cookie } : {} })).json };
}

test('Bảng vàng đua xe: chỉ máy realtime ghi được; vòng trùng khóa không tính hai lần; mỗi người một dòng vòng nhanh nhất', async () => {
  const env = setup();
  const lap = (accountId, key, lapMs, extra = {}) => env.internal('/internal/race/lap', { key, accountId, displayName: extra.name || 'An', lapMs, mode: 'race', ...extra });
  assert.equal((await env.internal('/internal/race/lap', { key: 'rc-x-1', accountId: env.an.id, lapMs: 40_000, mode: 'race' }, 'sai')).status, 403);
  assert.equal((await lap(env.an.id, 'rc-a-u1-1', 40_100)).json.saved, true);
  assert.equal((await lap(env.an.id, 'rc-a-u1-1', 30_000)).json.saved, false, 'gửi lại cùng khóa');
  await lap(env.an.id, 'rc-a-u1-2', 38_500);
  await lap(env.binh.id, 'rc-a-u2-1', 39_000, { name: 'Bình' });
  assert.equal((await lap(env.an.id, 'rc-a-u1-3', 5_000)).status, 400, 'vòng vô lý');
  assert.equal((await lap(env.an.id, 'rc-a-u1-4', 39_000, { mode: 'cheat' })).status, 400);
  const board = await env.view();
  assert.deepEqual(board.today, [{ name: 'An', ms: 38_500 }, { name: 'Bình', ms: 39_000 }]);
  assert.deepEqual(board.all, board.today);
  assert.equal(board.me.best, 38_500);
  // Qua 8 ngày: vòng cũ bị dọn, trừ vòng nhanh nhất mọi lúc của từng người.
  env.clock.now += 9 * 86_400_000;
  await lap(env.binh.id, 'rc-b-u2-1', 41_000, { name: 'Bình' });
  const later = await env.view();
  assert.deepEqual(later.today, [{ name: 'Bình', ms: 41_000 }]);
  assert.deepEqual(later.week, [{ name: 'Bình', ms: 41_000 }]);
  assert.deepEqual(later.all, [{ name: 'An', ms: 38_500 }, { name: 'Bình', ms: 39_000 }]);
  const count = env.options.accounts.database.prepare('SELECT COUNT(*) AS n FROM race_laps').get().n;
  assert.equal(count, 3, 'còn vòng tốt nhất của mỗi người + vòng mới');
  assert.equal((await env.view(false)).me, null, 'khách không có phần của mình');
});

test('kết quả cuộc đua: lưu một lần mỗi người, xếp số lần về nhất 7 ngày', async () => {
  const env = setup();
  const result = (raceId, results) => env.internal('/internal/race/result', { raceId, cars: 8, results });
  const an = (pos, extra = {}) => ({ accountId: env.an.id, displayName: 'An', pos, laps: 3, dnf: false, totalMs: 118_000, bestMs: 38_000, ...extra });
  const binh = (pos) => ({ accountId: env.binh.id, displayName: 'Bình', pos, laps: 3, dnf: false, totalMs: 119_000 });
  assert.equal((await result('rc-duaxe-1-a-1', [an(1), binh(2)])).json.saved, 2);
  assert.equal((await result('rc-duaxe-1-a-1', [an(1), binh(2)])).json.saved, 0, 'gửi lại không tính hai lần');
  await result('rc-duaxe-1-a-2', [an(2), binh(1)]);
  await result('rc-duaxe-1-a-3', [an(1)]);
  await result('rc-duaxe-1-a-4', [an(5, { dnf: true, totalMs: undefined, laps: 1 })]);
  assert.equal((await result('rc-duaxe-1-a-5', [an(9)])).status, 400, 'hạng lớn hơn số xe');
  assert.equal((await result('bad', [an(1)])).status, 400);
  const board = await env.view();
  assert.deepEqual(board.wins, [{ name: 'An', wins: 2, races: 4 }, { name: 'Bình', wins: 1, races: 2 }]);
  assert.equal(board.me.wins, 2);
  assert.equal(board.me.races, 4);
});
