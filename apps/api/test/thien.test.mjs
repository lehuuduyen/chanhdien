import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { verifyJoinTicket } from '@chanh-dien/session-token';
import { THIEN_EVENT, THIEN_RULES } from '@chanh-dien/room-rules';
import { assignThienRoom } from '../thien.mjs';
import { handleApiRequest } from '../server.mjs';
import { createMemoryThienEventStore } from '../thien-event.mjs';
import { createMemoryPrayerSlipStore, openPrayerSlipStore } from '../prayer-slips.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = { status: 0, body: '', setHeader() {}, writeHead(status) { this.status = status; return this; }, end(chunk = '') { this.body += chunk; } };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: JSON.parse(res.body) };
}

test('admin lưu giờ và video bài giảng; khóa sai không được đổi cấu hình', async () => {
  const adminSecret = 'admin-secret-with-at-least-16-characters';
  const thienEventStore = createMemoryThienEventStore();
  const options = { adminSecret, thienEventStore };
  const current = await request(options, 'GET', '/api/v1/thien/event-config');
  assert.deepEqual(current.json, THIEN_EVENT);

  const input = {
    hour: 19,
    minute: 30,
    lectures: Object.fromEntries(Object.entries(THIEN_EVENT.lectures).map(([lang, lecture]) => [lang, {
      title: `${lecture.title} mới`,
      videoId: lang === 'vi' ? 'https://youtu.be/dQw4w9WgXcQ' : lecture.videoId,
    }])),
  };
  assert.equal((await request(options, 'PUT', '/api/v1/admin/thien/event-config', input, { 'x-admin-key': 'wrong' })).status, 403);
  const saved = await request(options, 'PUT', '/api/v1/admin/thien/event-config', input, { 'x-admin-key': adminSecret });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.hour, 19);
  assert.equal(saved.json.lectures.vi.videoId, 'dQw4w9WgXcQ');
  assert.equal((await request(options, 'PUT', '/api/v1/admin/thien/event-config', { ...input, hour: 25 }, { 'x-admin-key': adminSecret })).status, 400);
  assert.deepEqual((await request(options, 'DELETE', '/api/v1/admin/thien/event-config', undefined, { 'x-admin-key': adminSecret })).json, THIEN_EVENT);
});

test('gửi sớ Cầu an/Cầu siêu; chỉ admin xem và cập nhật trạng thái', async () => {
  const adminSecret = 'admin-secret-with-at-least-16-characters';
  let nextId = 1;
  const prayerSlipStore = createMemoryPrayerSlipStore([], { now: () => 1_700_000_000_000, id: () => `so-test-${nextId++}`, year: () => 2026 });
  const options = { adminSecret, prayerSlipStore };
  const input = {
    type: 'peace', requesterName: 'Diệu Hạnh', roomId: 'thien-az-vi-1', state: 'az', lang: 'vi', note: 'Cầu sức khỏe',
    people: [
      { name: 'Nguyễn Văn An', dharmaName: 'Thiện An', gender: 'male', birthYear: 1990 },
      { name: 'Trần Thị Bình', gender: 'female', birthYear: 1992 },
    ],
  };
  const submitted = await request(options, 'POST', '/api/v1/thien/prayer-slips', input);
  assert.equal(submitted.status, 201);
  assert.equal(submitted.json.id, 'so-test-1');
  assert.equal((await request(options, 'POST', '/api/v1/thien/prayer-slips', { ...input, people: [{ ...input.people[0], birthYear: 1926 }] })).status, 400);
  assert.equal((await request(options, 'GET', '/api/v1/admin/thien/prayer-slips')).status, 403);
  const listed = await request(options, 'GET', '/api/v1/admin/thien/prayer-slips', undefined, { 'x-admin-key': adminSecret });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.prayerSlips[0].people[0].birthYear, 1990);
  assert.equal(listed.json.prayerSlips[0].people[0].age, 37);
  assert.equal(listed.json.prayerSlips[0].people[0].starKey, 'laHau');
  const completed = await request(options, 'PATCH', '/api/v1/admin/thien/prayer-slips/so-test-1', { status: 'completed' }, { 'x-admin-key': adminSecret });
  assert.equal(completed.status, 200);
  assert.equal(completed.json.status, 'completed');
});

test('sớ được lưu bền qua lần mở store mới; file riêng tư và trạng thái không mất', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'chanh-dien-prayer-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const input = {
    type: 'memorial', requesterName: 'Tâm An', roomId: 'thien-az-vi-1', state: 'az', lang: 'vi', note: 'Hồi hướng công đức',
    people: [{ name: 'Nguyễn Văn Tịnh', dharmaName: '', gender: 'male', birthYear: 1950 }],
  };
  const first = openPrayerSlipStore(dataDir);
  const saved = first.create(input);
  assert.ok(saved?.id.startsWith('so-'));
  assert.equal(first.setStatus(saved.id, 'scheduled').status, 'scheduled');

  const file = join(dataDir, 'prayer-slips.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf8')));

  const reopened = openPrayerSlipStore(dataDir);
  assert.equal(reopened.list()[0].id, saved.id);
  assert.equal(reopened.list()[0].status, 'scheduled');
  assert.equal(reopened.list()[0].people[0].name, 'Nguyễn Văn Tịnh');
});

test('gửi sớ chỉ nhận cùng origin và giới hạn ba lần trong mười phút', async () => {
  const input = {
    type: 'peace', requesterName: 'An', roomId: 'thien-az-vi-1', state: 'az', lang: 'vi', note: '',
    people: [{ name: 'Bình An', dharmaName: '', gender: 'female', birthYear: 1990 }],
  };
  const foreign = await request({ prayerSlipStore: createMemoryPrayerSlipStore() }, 'POST', '/api/v1/thien/prayer-slips', input, { origin: 'https://trang-la.example' });
  assert.equal(foreign.status, 403);

  const options = { prayerSlipStore: createMemoryPrayerSlipStore() };
  for (let count = 0; count < 3; count += 1) {
    assert.equal((await request(options, 'POST', '/api/v1/thien/prayer-slips', input, { origin: 'https://chanh-dien.test' })).status, 201);
  }
  assert.equal((await request(options, 'POST', '/api/v1/thien/prayer-slips', input, { origin: 'https://chanh-dien.test' })).status, 429);
});

test('xếp phòng: phòng 1 còn bồ đoàn thì vào phòng 1; kín theo cấu hình thì tự mở phòng 2, 3…', () => {
  const capacity = THIEN_RULES.maxParticipants;
  const options = {};
  assert.deepEqual(assignThienRoom('az', 'vi', {}, options), { roomId: 'thien-az-vi-1', shard: 1, name: 'Arizona · PV1' });
  assert.equal(assignThienRoom('az', 'vi', { 'thien-az-vi-1': capacity }, {}).roomId, 'thien-az-vi-2');
  assert.equal(assignThienRoom('az', 'vi', { 'thien-az-vi-1': capacity, 'thien-az-vi-2': capacity }, {}).roomId, 'thien-az-vi-3');
  assert.equal(assignThienRoom('az', 'en', { 'thien-az-vi-1': capacity }, {}).name, 'Arizona · PA1', 'mỗi ngôn ngữ là nhóm phòng riêng');
  const burst = {};
  const rooms = Array.from({ length: capacity + 5 }, () => assignThienRoom('tx', 'es', { 'thien-tx-es-1': 0 }, burst).roomId);
  assert.equal(rooms.filter((id) => id === 'thien-tx-es-1').length, capacity, 'nhiều người bấm cùng lúc: giữ chỗ để không vượt sức chứa');
  assert.equal(rooms[capacity], 'thien-tx-es-2');
  for (const roomId of new Set(rooms)) assert.ok(rooms.filter((id) => id === roomId).length <= capacity);

  const caughtUp = {};
  assert.equal(assignThienRoom('ca', 'vi', {}, caughtUp).roomId, 'thien-ca-vi-1');
  assert.equal(assignThienRoom('ca', 'vi', { 'thien-ca-vi-1': 1 }, caughtUp).roomId, 'thien-ca-vi-1', 'realtime đã đếm người thì phải bỏ giữ chỗ tương ứng, không đếm hai lần');
  assert.equal(assignThienRoom('ca', 'vi', { 'thien-ca-vi-1': capacity }, caughtUp).roomId, 'thien-ca-vi-2');
});

test('API xếp phòng theo tiểu bang/ngôn ngữ và cho vào phòng mới mở', async () => {
  const options = { secret: SECRET };
  const assigned = await request(options, 'POST', '/api/v1/thien/assign', { state: 'az', lang: 'vi' });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.json.roomId, 'thien-az-vi-1');
  assert.match(assigned.json.inviteCode, /^[A-Za-z0-9_-]{40,512}$/);
  const resolved = await request(options, 'GET', `/api/v1/thien/invite/${assigned.json.inviteCode}`);
  assert.equal(resolved.status, 200);
  assert.deepEqual({ roomId: resolved.json.roomId, state: resolved.json.state, lang: resolved.json.lang, shard: resolved.json.shard }, {
    roomId: 'thien-az-vi-1', state: 'az', lang: 'vi', shard: 1,
  });
  const changed = `${assigned.json.inviteCode.slice(0, -1)}${assigned.json.inviteCode.endsWith('A') ? 'B' : 'A'}`;
  assert.equal((await request(options, 'GET', `/api/v1/thien/invite/${changed}`)).status, 404);
  assert.equal((await request(options, 'POST', '/api/v1/thien/assign', { state: 'zz', lang: 'vi' })).status, 400);
  assert.equal((await request(options, 'POST', '/api/v1/thien/assign', { state: 'az', lang: 'fr' })).status, 400);
  const room7 = (await request(options, 'POST', '/api/v1/thien/assign', { state: 'ca', lang: 'en' })).json;
  const joined = await request(options, 'POST', '/api/v1/rooms/join', { roomId: room7.roomId, inviteCode: room7.inviteCode, displayName: 'An' });
  assert.equal(joined.status, 200);
  assert.equal(verifyJoinTicket(joined.json.ticket, SECRET).value.roomId, room7.roomId);
  assert.equal((await request(options, 'POST', '/api/v1/rooms/join', { roomId: room7.roomId, inviteCode: changed, displayName: 'An' })).status, 403);
  assert.equal((await request(options, 'POST', '/api/v1/rooms/join', { roomId: 'thien-zz-vi-1', displayName: 'An' })).status, 404);
  assert.equal((await request(options, 'GET', '/api/v1/rooms/thien-ca-en-2/locate')).status, 200);
});

test('nhiều máy: xếp phòng theo số chỗ người thật đang giữ, không tính bot hay chỉ số online ở sảnh', async () => {
  const nodes = [{
    roomCounts: { 'thien-az-vi-1': 19 },
    roomSeatCounts: { 'thien-az-vi-1': THIEN_RULES.maxParticipants },
  }];
  const directory = { listNodes: async () => nodes };
  const assigned = await request({ secret: SECRET, directory }, 'POST', '/api/v1/thien/assign', { state: 'az', lang: 'vi' });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.json.roomId, 'thien-az-vi-2');
});

test('danh sách phòng đang mở kèm mã mời để đổi sang đúng phòng; chỉ phòng đang có người', async () => {
  const directory = {
    listNodes: async () => [{ nodeId: 'rt-1', url: '/ws', roomCounts: { 'thien-az-vi-1': 3, 'thien-az-vi-2': 0, 'thien-az-vi-3': 1, 'thien-ca-vi-1': 2 } }],
    getRoomOwner: async () => null,
  };
  const options = { secret: SECRET, directory };
  const listed = await request(options, 'GET', '/api/v1/thien/rooms?state=az&lang=vi');
  assert.deepEqual(listed.json.rooms.map((room) => [room.roomId, room.count]), [['thien-az-vi-1', 3], ['thien-az-vi-3', 1]]);
  const target = listed.json.rooms[1];
  const joined = await request(options, 'POST', '/api/v1/rooms/join', { roomId: target.roomId, inviteCode: target.inviteCode, displayName: 'An' });
  assert.equal(joined.status, 200);
  // Mã mời của phòng này không vào được phòng khác.
  assert.equal((await request(options, 'POST', '/api/v1/rooms/join', { roomId: 'thien-az-vi-9', inviteCode: target.inviteCode, displayName: 'An' })).status, 403);
});
