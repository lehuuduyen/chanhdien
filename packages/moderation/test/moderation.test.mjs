import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkText,
  cleanWord,
  cloneKey,
  createCloneWatch,
  createWordList,
  hasPromo,
  ipHash,
  isPublicIp,
  maskWord,
  requestIp,
} from '../src/index.mjs';

const SECRET = 'moderation-test-secret-0123456789abcdef';

test('chặn chửi thề kể cả khi viết lách, che chỉ hiện chữ đầu', () => {
  for (const text of ['dm thằng này', 'ĐMMMM', 'đ.m mày', 'đ m', 'c4c', 'l-ồ-n', 'lồnnn', 'đéo thích', 'địt mẹ', 'dit me may', 'vcl', 'what the fuck', 'fucking', 'puta madre', 'el coño']) {
    assert.equal(checkText(text).action, 'block', text);
  }
  assert.equal(checkText('dm thằng này').masked, 'd* thằng này');
  assert.equal(checkText('địt mẹ').masked, 'đ** m*');
  assert.equal(maskWord('c4c'), 'c**');
});

test('không chặn nhầm chữ lành khi bỏ dấu hoặc từ Phật học', () => {
  for (const text of ['Nam mô A Di Đà Phật', 'các bạn ơi', 'cac ban oi', 'đi chùa lễ Phật', 'tham sân si, ngu si', 'ngủ ngon nhé', 'giữ ngũ giới',
    'đeo khẩu trang', 'buổi lễ hôm nay', 'con chó nhà mình', 'cono de helado', '100k nhé', 'b4n ơi', 'v.v', 'đít']) {
    assert.equal(checkText(text).action, 'ok', text);
  }
});

test('từ khả nghi được cho gửi nhưng báo kèm chữ gợi ý', () => {
  const result = checkText('mày ngu quá');
  assert.equal(result.action, 'suspect');
  assert.deepEqual(result.suspects, ['ngu']);
  assert.equal(result.masked, 'mày n** quá');
  assert.deepEqual(checkText('đ.ụ.c').suspects, ['đục']);
});

test('quản trị thêm / bỏ từ', () => {
  const list = createWordList({ block: ['ngu', 'ăn hại'], allow: ['vl'] });
  assert.equal(checkText('mày ngu quá', list).action, 'block');
  assert.equal(checkText('đồ ăn hại', list).action, 'block');
  assert.equal(checkText('vl', list).action, 'ok');
  assert.equal(cleanWord('  Fuck*  '), 'fuck*');
  assert.equal(cleanWord('<b>'), null);
  assert.equal(cleanWord('x'.repeat(41)), null);
});

test('quảng cáo: link, số điện thoại, mời sang Zalo', () => {
  assert.ok(hasPromo('add zalo 0912345678'));
  assert.ok(hasPromo('vào web abc.xyz kiếm tiền'));
  assert.ok(!hasPromo('chào cả nhà, hôm nay 15 tháng 7'));
});

test('clone: chừa người gửi đầu tiên và nick cũ, khóa nick mới nhắn trùng', () => {
  const watch = createCloneWatch();
  const text = 'Vào nhóm kiếm tiền online nhanh nhất';
  assert.equal(watch.add({ text, sender: 'first', fresh: true, at: 0 }), null);
  assert.equal(watch.add({ text: 'vào nhóm   kiếm tiền ONLINE nhanh nhất!!!', sender: 'n1', fresh: true, at: 1_000 }), null);
  assert.equal(watch.add({ text, sender: 'old', fresh: false, at: 2_000 }), null);
  const hit = watch.add({ text, sender: 'n2', fresh: true, at: 3_000 });
  assert.deepEqual(hit.offenders.map((item) => item.sender), ['n1', 'n2']);
  assert.equal(hit.first.sender, 'first');
  assert.deepEqual(watch.add({ text, sender: 'n3', fresh: true, at: 4_000 }).offenders.map((item) => item.sender), ['n3']);
  assert.equal(watch.add({ text, sender: 'n3', fresh: true, at: 5_000 }), null);
  // Hết cửa sổ thời gian: tính lại từ đầu.
  assert.equal(watch.add({ text, sender: 'n4', fresh: true, at: 400_000 }), null);
});

test('clone: câu niệm Phật và tin ngắn không tính', () => {
  const watch = createCloneWatch();
  for (const sender of ['a', 'b', 'c', 'd', 'e']) {
    assert.equal(watch.add({ text: 'Nam mô A Di Đà Phật, Nam mô Quan Thế Âm Bồ Tát', sender, fresh: true }), null);
    assert.equal(watch.add({ text: 'hay quá', sender, fresh: true }), null);
  }
  assert.equal(cloneKey('Mua ACC rẻ!!!'), cloneKey('mua acc re'));
});

test('IP: lấy X-Real-IP / phần tử cuối X-Forwarded-For, không băm IP nội bộ', () => {
  assert.equal(requestIp({ 'x-forwarded-for': '1.2.3.4, 8.8.8.8' }), '8.8.8.8');
  assert.equal(requestIp({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }), '9.9.9.9');
  assert.equal(requestIp({}, '::ffff:8.8.4.4'), '::ffff:8.8.4.4');
  for (const ip of ['127.0.0.1', '10.0.0.2', '192.168.1.5', '172.20.0.1', '::1', 'local', '']) assert.equal(isPublicIp(ip), false, ip);
  assert.ok(isPublicIp('8.8.8.8'));
  assert.equal(ipHash('127.0.0.1', SECRET), null);
  assert.equal(ipHash('8.8.8.8', SECRET), ipHash('::ffff:8.8.8.8', SECRET));
  assert.notEqual(ipHash('8.8.8.8', SECRET), ipHash('8.8.8.8', `${SECRET}x`));
});
