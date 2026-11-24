import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PHOTO_TEXT, photoFrame, photoText } from '../public/photo-text.js';

test('Máy ảnh / Album có đủ chữ cho cả 4 ngôn ngữ, giữ đúng các biến {…}', () => {
  const keys = Object.keys(PHOTO_TEXT.vi).sort();
  const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const language of ['en', 'zh', 'es']) {
    assert.deepEqual(Object.keys(PHOTO_TEXT[language]).sort(), keys, `${language}: thiếu / thừa khóa`);
    for (const key of keys) assert.deepEqual(vars(PHOTO_TEXT[language][key]), vars(PHOTO_TEXT.vi[key]), `${language}.${key}`);
  }
  assert.equal(photoText('en', 'album.count', { n: 3, max: 60 }), '3/60 photos · saved on this device only');
  assert.equal(photoText('xx', 'camera.title'), PHOTO_TEXT.vi['camera.title']);
});

test('khung ngắm: màn dọc 9:16 chạm hai cạnh bên, màn ngang 16:9 chạm trên dưới, luôn nằm giữa', () => {
  const portrait = photoFrame(390, 844);
  assert.equal(portrait.wide, false);
  assert.equal(portrait.width, 390);
  assert.ok(Math.abs(portrait.height - (390 * 16) / 9) < 1e-9);
  assert.ok(Math.abs(portrait.top - (844 - portrait.height) / 2) < 1e-9);
  assert.equal(portrait.left, 0);

  const landscape = photoFrame(844, 390);
  assert.equal(landscape.wide, true);
  assert.equal(landscape.height, 390);
  assert.ok(Math.abs(landscape.width - (390 * 16) / 9) < 1e-9);
  assert.ok(Math.abs(landscape.left - (844 - landscape.width) / 2) < 1e-9);

  // Màn dọc thấp hơn 9:16 (iPad dọc): chạm trên dưới, chừa hai bên.
  const tablet = photoFrame(820, 1180);
  assert.equal(tablet.height, 1180);
  assert.ok(tablet.width < 820 && tablet.left > 0);
  // Máy tính 16:10: chạm hai bên, chừa trên dưới.
  const desktop = photoFrame(1280, 800);
  assert.equal(desktop.width, 1280);
  assert.equal(desktop.height, 720);
  assert.equal(desktop.top, 40);
});

test('Máy ảnh / Album: ảnh chỉ ở trên máy (không gửi lên server), chữ chỉ qua textContent', () => {
  const source = readFileSync(new URL('../public/photo-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/, 'photo-ui.js không gửi ảnh đi đâu');
  assert.match(source, /indexedDB\.open/);
});

test('điện thoại: thông báo và số nhắc việc không dùng innerHTML; số "nhẹ" không cộng vào số trên nút 📱', () => {
  const source = readFileSync(new URL('../public/phone-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML/);
  assert.match(source, /sum \+ \(app\.quiet \? 0 : app\.badge\)/);
});
