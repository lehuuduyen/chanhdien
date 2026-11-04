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
