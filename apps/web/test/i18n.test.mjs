import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { missingTranslations } from '../public/thien-i18n.js';

test('chánh điện có đủ bản dịch Việt, Anh, Trung, Tây Ban Nha cho toàn bộ giao diện', () => {
  assert.deepEqual(missingTranslations(), {});

  const html = readFileSync(new URL('../public/chanh-dien.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(missingTranslations([...new Set(keys)]), {});
});

test('bản dịch chánh điện không có key trùng trong cùng một ngôn ngữ (key sau sẽ đè key trước)', () => {
  const source = readFileSync(new URL('../public/thien-i18n.js', import.meta.url), 'utf8');
  const starts = [...source.matchAll(/^ {2}(vi|en|zh|es): \{/gm)];
  assert.equal(starts.length, 4);
  starts.forEach((start, index) => {
    const end = starts[index + 1]?.index ?? source.indexOf('export function');
    const keys = [...source.slice(start.index, end).matchAll(/'([a-zA-Z][a-zA-Z0-9_.]*)':\s/g)].map((match) => match[1]);
    const duplicated = keys.filter((key, position) => keys.indexOf(key) !== position);
    assert.deepEqual(duplicated, [], `${start[1]}: key trùng`);
  });
});
