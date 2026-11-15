import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { STOPWATCH } from '@chanh-dien/room-rules';
import { createSessionToken } from '@chanh-dien/session-token';
import { handleApiRequest } from '../server.mjs';
import { createStopwatchStore, EARLY_SLACK_MS, LATE_SLACK_MS } from '../stopwatch.mjs';

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

// Đồng hồ giả + đề cố định (targets lần lượt) để kiểm tra trúng / trượt chính xác.
function setup(targets = [537]) {
  const clock = { now: Date.UTC(2026, 10, 14, 17, 0) };
  const queue = [...targets];
  const accounts = createAccountStore();
  const stopwatch = createStopwatchStore({ db: accounts.database, now: () => clock.now, random: () => queue.shift() ?? 500 });
  const options = { secret: SECRET, accounts, stopwatch };
  const account = accounts.register({ username: 'an.bamgio', password: 'matkhau123', displayName: 'An' }).account;
  const cookie = `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}`;
  const post = (action, body, signedIn = true) => request(options, 'POST', `/api/v1/stopwatch/${action}`, { body, headers: signedIn ? { cookie } : {} });
  const view = async (signedIn = true) => (await request(options, 'GET', '/api/v1/stopwatch', { headers: signedIn ? { cookie } : {} })).json;
  // Một lượt: ra đề cấp level, bấm Bắt đầu, chờ waitMs (đồng hồ server), báo đã bấm Dừng ở elapsed phần trăm giây.
  const play = async (level, elapsed, { waitMs = elapsed * 10, signedIn = true } = {}) => {
    const round = await post('round', { level }, signedIn);
    if (round.status !== 200) return round;
    assert.equal((await post('start', { roundId: round.json.roundId }, signedIn)).status, 200);
    clock.now += waitMs;
    return post('stop', { roundId: round.json.roundId, elapsed }, signedIn);
  };
  return { clock, options, post, view, play };
}

test('bấm giờ: đề trong 00:01–10:00, dừng đúng mục tiêu là trúng, mở cấp kế, lưu lịch sử và lên Bảng vàng', async () => {
  const { view, play } = setup([537, 537, 250]);
  const first = await view();
  assert.deepEqual(first.levels.map((level) => level.blind), [null, 50, 100, 200, 1000]);
  assert.deepEqual([first.min, first.max], [1, 1000]);
  assert.equal(first.me.unlocked, 1);
  // Mục tiêu 5,37: bấm 5,38 (lệch 0,01 s) là trượt, đúng 5,37 mới trúng.
  const miss = await play(1, 538);
  assert.deepEqual([miss.status, miss.json.hit, miss.json.diff, miss.json.target, miss.json.newLevel], [200, false, 1, 537, null]);
  const hit = await play(1, 537);
  assert.deepEqual([hit.json.hit, hit.json.diff, hit.json.unlocked, hit.json.newLevel], [true, 0, 2, 2]);
  const after = await view();
  assert.equal(after.me.unlocked, 2);
  assert.deepEqual(after.me.stats, [{ level: 1, plays: 2, hits: 1 }]);
  assert.deepEqual(after.me.history.map(({ level, target, elapsed }) => [level, target, elapsed]), [[1, 537, 537]]);
  assert.deepEqual(after.recent.map(({ name, level }) => [name, level]), [['An', 1]]);
  // Cấp 2 đã mở; cấp 3 chưa.
  assert.equal((await play(2, 250)).json.hit, true);
  assert.equal((await view()).me.unlocked, 3);
});

test('bấm giờ: cấp chưa mở bị từ chối; khách chỉ chơi thử cấp 1, không lưu lịch sử', async () => {
  const { view, play, post } = setup([300, 300]);
  const locked = await post('round', { level: 3 });
  assert.deepEqual([locked.status, locked.json.code], [403, 'LEVEL_LOCKED']);
  assert.equal((await post('round', { level: 9 })).json.code, 'INVALID');
  const guestLocked = await post('round', { level: 2 }, false);
  assert.deepEqual([guestLocked.status, guestLocked.json.code], [401, 'NOT_SIGNED_IN']);
  const guest = await play(1, 300, { signedIn: false });
  assert.deepEqual([guest.status, guest.json.hit, guest.json.newLevel], [200, true, null]);
  const seen = await view(false);
  assert.equal(seen.me, null);
  assert.deepEqual(seen.recent, [], 'khách bấm trúng không lên Bảng vàng');
});

test('bấm giờ: cấp nào cũng phải đúng từng phần trăm giây, lệch 0,01 s là trượt', async () => {
  const { play, options } = setup(Array.from({ length: 15 }, (_, index) => 777 - index * 37));
  for (const level of [1, 2, 3, 4, 5]) {
    const target = 777 - (level - 1) * 3 * 37;
    assert.equal((await play(level, target + 1)).json.hit, false, `cấp ${level} lệch +0,01 s`);
    assert.equal((await play(level, target - 38)).json.hit, false, `cấp ${level} lệch -0,01 s`);
    const hit = await play(level, target - 74);
    assert.deepEqual([hit.json.hit, hit.json.diff], [true, 0], `cấp ${level} đúng mục tiêu`);
  }
  assert.equal(options.stopwatch.unlocked(null), 1, 'khách vẫn chỉ cấp 1');
});

test('bấm giờ: thời gian máy báo phải khớp thời gian thật (trễ mạng cho phép), mỗi đề dùng một lần', async () => {
  const { play, post, clock } = setup([500, 500, 500, 500, 500]);
  // Chờ 1 giây mà báo 5 giây: không nhận.
  const fake = await play(1, 500, { waitMs: 1_000 });
  assert.deepEqual([fake.status, fake.json.code], [409, 'TIMING_MISMATCH']);
  // Trong khoảng trễ mạng thì nhận.
  assert.equal((await play(1, 500, { waitMs: 5_000 - EARLY_SLACK_MS + 20 })).status, 200);
  assert.equal((await play(1, 500, { waitMs: 5_000 + LATE_SLACK_MS - 20 })).status, 200);
  assert.equal((await play(1, 500, { waitMs: 5_000 + LATE_SLACK_MS + 200 })).json.code, 'TIMING_MISMATCH');
  // Chưa bấm Bắt đầu; dừng hai lần.
  const round = await post('round', { level: 1 });
  assert.equal((await post('stop', { roundId: round.json.roundId, elapsed: 100 })).json.code, 'NOT_STARTED');
  await post('start', { roundId: round.json.roundId });
  assert.equal((await post('start', { roundId: round.json.roundId })).json.code, 'ALREADY_STARTED');
  clock.now += 1_000;
  assert.equal((await post('stop', { roundId: round.json.roundId, elapsed: 100 })).status, 200);
  assert.equal((await post('stop', { roundId: round.json.roundId, elapsed: 100 })).json.code, 'ROUND_NOT_FOUND');
  // Đề của người khác (khách đoán mã) không dùng được; mã sai dạng bị từ chối.
  const mine = await post('round', { level: 1 });
  assert.equal((await post('start', { roundId: mine.json.roundId }, false)).json.code, 'ROUND_NOT_FOUND');
  assert.equal((await post('start', { roundId: '../x' })).json.code, 'ROUND_NOT_FOUND');
  assert.equal((await post('stop', { roundId: mine.json.roundId, elapsed: STOPWATCH.timeout + 1 })).json.code, 'NOT_STARTED');
});

test('bấm giờ: số ngẫu nhiên thật nằm trong 00:01–10:00', () => {
  const accounts = createAccountStore();
  const store = createStopwatchStore({ db: accounts.database });
  for (let index = 0; index < 300; index += 1) {
    const { target } = store.round({ accountId: null, level: 1 });
    assert.ok(Number.isSafeInteger(target) && target >= STOPWATCH.min && target <= STOPWATCH.max, `${target}`);
  }
});
