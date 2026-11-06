import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJoinTicket, createResumeToken, createRoomInvite, verifyJoinTicket, verifyResumeToken, verifyRoomInvite } from '../src/index.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const CLAIMS = { participantId: 'u-1', roomId: 'cinema-1', displayName: 'Minh An' };

test('vé tham gia giữ đúng thông tin khách', () => {
  const ticket = createJoinTicket(CLAIMS, SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.deepEqual(verifyJoinTicket(ticket, SECRET, { now: 2_000 }), {
    ok: true,
    value: { ...CLAIMS, role: 'guest', iat: 1_000, exp: 6_000 },
  });
});

test('từ chối vé bị sửa và vé hết hạn', () => {
  const ticket = createJoinTicket(CLAIMS, SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.equal(verifyJoinTicket(`${ticket}x`, SECRET, { now: 2_000 }).error, 'INVALID_SIGNATURE');
  assert.equal(verifyJoinTicket(ticket, SECRET, { now: 6_000 }).error, 'EXPIRED_TICKET');
});

test('resume token có chữ ký, ngắn và xác minh được ở máy khác', () => {
  const token = createResumeToken({ participantId: 'u-1', roomId: 'cinema-1' }, SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.ok(token.length <= 512);
  assert.deepEqual(verifyResumeToken(token, SECRET, { now: 2_000 }), {
    ok: true, value: { participantId: 'u-1', roomId: 'cinema-1' },
  });
  assert.equal(verifyResumeToken(`${token}x`, SECRET, { now: 2_000 }).error, 'INVALID_SIGNATURE');
  assert.equal(verifyResumeToken(token, SECRET, { now: 6_000 }).error, 'EXPIRED_TICKET');
});

test('vé vào phòng không dùng làm resume token được', () => {
  const ticket = createJoinTicket(CLAIMS, SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.equal(verifyResumeToken(ticket, SECRET, { now: 2_000 }).error, 'INVALID_CLAIMS');
});

test('vé thành viên mang accountId; vé khách không được có accountId', async () => {
  const { createSessionToken, verifySessionToken } = await import('../src/index.mjs');
  const member = createJoinTicket({ ...CLAIMS, accountId: 'a-12345678-aaaa' }, SECRET, { now: 1_000 });
  assert.deepEqual(verifyJoinTicket(member, SECRET, { now: 2_000 }).value.role, 'member');
  assert.equal(verifyJoinTicket(member, SECRET, { now: 2_000 }).value.accountId, 'a-12345678-aaaa');
  const session = createSessionToken({ accountId: 'a-12345678-aaaa', version: 3 }, SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.deepEqual(verifySessionToken(session, SECRET, { now: 2_000 }), { ok: true, value: { accountId: 'a-12345678-aaaa', version: 3 } });
  assert.equal(verifySessionToken(session, SECRET, { now: 7_000 }).error, 'EXPIRED_TICKET');
  assert.equal(verifySessionToken(member, SECRET, { now: 2_000 }).error, 'INVALID_CLAIMS', 'vé vào phòng không dùng làm phiên đăng nhập');
});

test('mã mời phòng che roomId, sửa mã bị từ chối và mã có hạn dùng', () => {
  const invite = createRoomInvite('thien-az-vi-2', SECRET, { now: 1_000, ttlMs: 5_000 });
  assert.equal(invite.includes('thien-az-vi-2'), false);
  assert.deepEqual(verifyRoomInvite(invite, SECRET, { now: 2_000 }), { ok: true, value: { roomId: 'thien-az-vi-2' } });
  const changed = `${invite.slice(0, -1)}${invite.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyRoomInvite(changed, SECRET, { now: 2_000 }).error, 'INVALID_INVITE');
  assert.equal(verifyRoomInvite(invite, SECRET, { now: 6_000 }).error, 'EXPIRED_INVITE');
});

test('vé thành viên mang danh sách hình đã mua; khách thì không', () => {
  const member = createJoinTicket({ ...CLAIMS, accountId: 'a-12345678-aaaa', skins: ['chibigirl'] }, SECRET, { now: 1_000 });
  assert.deepEqual(verifyJoinTicket(member, SECRET, { now: 2_000 }).value.skins, ['chibigirl']);
  const guest = createJoinTicket({ ...CLAIMS, skins: ['chibigirl'] }, SECRET, { now: 1_000 });
  assert.equal(verifyJoinTicket(guest, SECRET, { now: 2_000 }).value.skins, undefined);
  assert.throws(() => createJoinTicket({ ...CLAIMS, accountId: 'a-12345678-aaaa', skins: ['<b>'] }, SECRET), TypeError);
});

test('vé thành viên mang danh hiệu và khung; khách không thể tự khai', () => {
  const member = createJoinTicket({
    ...CLAIMS,
    accountId: 'a-12345678-aaaa',
    title: 'steadfast-practitioner',
    frame: 'seven-day-lotus',
  }, SECRET, { now: 1_000 });
  const claims = verifyJoinTicket(member, SECRET, { now: 2_000 }).value;
  assert.deepEqual([claims.title, claims.frame], ['steadfast-practitioner', 'seven-day-lotus']);
  const guest = verifyJoinTicket(createJoinTicket({ ...CLAIMS, title: 'steadfast-practitioner', frame: 'seven-day-lotus' }, SECRET), SECRET).value;
  assert.deepEqual([guest.title, guest.frame], [undefined, undefined]);
  assert.throws(() => createJoinTicket({ ...CLAIMS, accountId: 'a-12345678-aaaa', title: '<b>' }, SECRET), TypeError);
});
