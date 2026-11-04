import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore, dayOf, levelFor, streaksFrom, verifyPassword, hashPassword } from '../src/index.mjs';

test('đăng ký, đăng nhập tên/mật khẩu; mật khẩu băm scrypt, sai mật khẩu bị từ chối', () => {
  const store = createAccountStore();
  assert.equal(store.register({ username: 'A', password: '12345678' }).error, 'INVALID_USERNAME');
  assert.equal(store.register({ username: 'dieu.hanh', password: 'ngan' }).error, 'WEAK_PASSWORD');
  const { account } = store.register({ username: 'Dieu.Hanh', password: 'matkhau123', displayName: '  Diệu   Hạnh ' });
  assert.equal(account.username, 'dieu.hanh');
  assert.equal(account.displayName, 'Diệu Hạnh');
  assert.equal(store.register({ username: 'dieu.hanh', password: 'matkhau123' }).error, 'USERNAME_TAKEN');
  assert.equal(store.login({ username: 'DIEU.HANH', password: 'matkhau123' }).account.id, account.id);
  assert.equal(store.login({ username: 'dieu.hanh', password: 'sai-mat-khau' }).error, 'INVALID_CREDENTIALS');
  assert.equal(store.login({ username: 'khong.co', password: 'matkhau123' }).error, 'INVALID_CREDENTIALS');
  const stored = hashPassword('abc12345');
  assert.ok(stored.startsWith('scrypt$') && !stored.includes('abc12345'));
  assert.equal(verifyPassword('abc12345', stored), true);
});

test('Google: tạo tài khoản lần đầu theo sub, lần sau cập nhật ảnh', () => {
  const store = createAccountStore();
  const first = store.upsertGoogle({ sub: 'g-1', email: 'an@gmail.com', name: 'An Nguyễn', picture: 'https://lh3.googleusercontent.com/a' });
  const again = store.upsertGoogle({ sub: 'g-1', email: 'an@gmail.com', name: 'Khác', picture: 'https://lh3.googleusercontent.com/b' });
  assert.equal(again.id, first.id);
  assert.equal(again.displayName, 'An Nguyễn');
  assert.equal(again.avatarUrl, 'https://lh3.googleusercontent.com/b');
  assert.equal(again.provider, 'google');
});

test('công đức, số lần dâng hương, giới hạn trong ngày, cấp độ, lịch sử', () => {
  let clock = Date.parse('2026-11-01T03:00:00Z');
  const store = createAccountStore({ now: () => clock });
  const { account } = store.register({ username: 'minh.tam', password: 'matkhau123' });
  for (let index = 0; index < 3; index += 1) store.recordOffering({ accountId: account.id, kind: 'incense', text: 'Cầu an', roomId: 'thien-1' });
  for (let index = 0; index < 12; index += 1) store.recordOffering({ accountId: account.id, kind: 'bell' });
  const { stats } = store.profile(account.id);
  assert.equal(stats.incense, 3);
  assert.equal(stats.byKind.bell, 10, 'thỉnh chuông chỉ tính 10 lần mỗi ngày');
  assert.equal(stats.merit, 3 * 5 + 10 * 99);
  assert.equal(stats.level.name, 'Thiện tâm');
  assert.ok(stats.level.next && stats.level.progress > 0);
  const history = store.history(account.id, { limit: 5 });
  assert.equal(history.length, 5);
  assert.equal(history[0].kind, 'bell');
  assert.equal(history[0].counted, false, 'lần vượt giới hạn vẫn có trong lịch sử nhưng không cộng điểm');
  assert.equal(levelFor(0).name, 'Sơ tâm');
  assert.equal(levelFor(50_000).next, null);
});

test('chuỗi ngày liên tiếp theo giờ Việt Nam', () => {
  assert.equal(dayOf(Date.parse('2026-10-31T18:30:00Z')), '2026-11-01', '01:30 sáng giờ Việt Nam đã là ngày mới');
  assert.deepEqual(streaksFrom(['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-25', '2026-10-24'], '2026-11-01'), { current: 3, best: 3 });
  assert.deepEqual(streaksFrom(['2026-10-31', '2026-10-30'], '2026-11-01'), { current: 2, best: 2 }, 'chưa dâng hôm nay vẫn giữ chuỗi tới hôm qua');
  assert.deepEqual(streaksFrom(['2026-10-29'], '2026-11-01'), { current: 0, best: 1 });

  let clock = Date.parse('2026-10-29T03:00:00Z');
  const store = createAccountStore({ now: () => clock });
  const { account } = store.register({ username: 'chuoi.ngay', password: 'matkhau123' });
  for (let day = 0; day < 4; day += 1) {
    store.recordOffering({ accountId: account.id, kind: 'incense', at: clock });
    clock += 86_400_000;
  }
  clock -= 86_400_000;
  assert.equal(store.profile(account.id).stats.streak, 4);
});

test('bảng xếp hạng cộng đồng: công đức, dâng hương, chuỗi ngày; tuần gần nhất', () => {
  let clock = Date.parse('2026-11-01T03:00:00Z');
  const store = createAccountStore({ now: () => clock });
  const a = store.register({ username: 'nguoi.a', password: 'matkhau123', displayName: 'Người A' }).account;
  const b = store.register({ username: 'nguoi.b', password: 'matkhau123', displayName: 'Người B' }).account;
  store.register({ username: 'nguoi.c', password: 'matkhau123' });
  store.recordOffering({ accountId: a.id, kind: 'bell', at: clock - 20 * 86_400_000 });
  for (let index = 0; index < 5; index += 1) store.recordOffering({ accountId: b.id, kind: 'incense' });
  assert.deepEqual(store.leaderboard({ metric: 'merit' }).map((row) => [row.rank, row.displayName, row.value]), [[1, 'Người A', 99], [2, 'Người B', 25]]);
  assert.deepEqual(store.leaderboard({ metric: 'merit', period: 'week' }).map((row) => row.displayName), ['Người B']);
  assert.deepEqual(store.leaderboard({ metric: 'incense' }).map((row) => [row.displayName, row.value]), [['Người B', 5]]);
  assert.deepEqual(store.leaderboard({ metric: 'streak' }).map((row) => [row.displayName, row.value]), [['Người B', 1]]);
});

test('bạn bè: kết bạn hai chiều, không trùng, không tự kết bạn với mình', () => {
  const store = createAccountStore();
  const a = store.register({ username: 'ban_a', password: 'matkhau123', displayName: 'Bạn A' }).account;
  const b = store.register({ username: 'ban_b', password: 'matkhau123', displayName: 'Bạn B' }).account;
  assert.equal(store.areFriends(a.id, b.id), false);
  assert.deepEqual(store.addFriend(b.id, a.id), { ok: true, created: true });
  assert.deepEqual(store.addFriend(a.id, b.id), { ok: true, created: false });
  assert.equal(store.areFriends(a.id, b.id), true);
  assert.equal(store.addFriend(a.id, a.id).ok, false);
  assert.deepEqual(store.friends(a.id).map((item) => item.displayName), ['Bạn B']);
  assert.deepEqual(store.friends(b.id).map((item) => item.accountId), [a.id]);
  store.close();
});

test('sổ báo cáo người chơi: lưu cả khách, cắt độ dài, mới nhất trước', () => {
  const store = createAccountStore();
  store.addReport({ roomId: 'thien-ca-vi-1', reporterName: 'Khách A', targetName: 'Người B', reason: 'spam', at: 1 });
  store.addReport({ roomId: 'thien-ca-vi-1', reporterName: 'Khách A', targetName: 'x'.repeat(80), reason: 'harassment', note: 'n'.repeat(500), at: 2 });
  const [latest, first] = store.reports();
  assert.equal(latest.reason, 'harassment');
  assert.equal(latest.targetName.length, 40);
  assert.equal(latest.note.length, 200);
  assert.equal(first.reporterAccount, null);
  store.close();
});
