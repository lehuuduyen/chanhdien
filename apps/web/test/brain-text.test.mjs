import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BRAIN_TEXT, brainText } from '../public/brain-text.js';

test('khu Trí tuệ có đủ chữ cho cả 4 ngôn ngữ, giữ đúng các biến {…}', () => {
  const keys = Object.keys(BRAIN_TEXT.vi).sort();
  for (const language of ['en', 'zh', 'es']) {
    assert.deepEqual(Object.keys(BRAIN_TEXT[language]).sort(), keys, `${language}: thiếu / thừa khóa`);
    for (const key of keys) {
      const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      assert.deepEqual(vars(BRAIN_TEXT[language][key]), vars(BRAIN_TEXT.vi[key]), `${language}.${key}`);
    }
  }
  assert.equal(brainText('en', 'daily.total', { points: 420 }), 'Today: 420/500 points');
  assert.equal(brainText('xx', 'title'), BRAIN_TEXT.vi.title);
});

test('khu Trí tuệ: chữ người dùng chỉ qua textContent / canvas, test IQ ghi rõ chỉ để vui', () => {
  const source = readFileSync(new URL('../public/brain-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML/);
  for (const language of ['vi', 'en', 'zh', 'es']) assert.ok(BRAIN_TEXT[language]['iq.disclaimer'].length > 30, language);
  assert.match(source, /tr\('iq\.disclaimer'\)/, 'kết quả và ảnh chia sẻ có lời ghi chú');
});
