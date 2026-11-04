import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detectHomeLang, missingHomeTranslations } from '../public/home-i18n.js';

test('trang chủ nhận ngôn ngữ trình duyệt, nhớ lựa chọn và có đủ bốn bản dịch', () => {
  assert.equal(detectHomeLang(['en-US']), 'en');
  assert.equal(detectHomeLang(['fr-FR', 'zh-TW']), 'zh');
  assert.equal(detectHomeLang(['fr-FR']), 'vi');
  assert.equal(detectHomeLang(['en-US'], 'es'), 'es', 'lựa chọn đã lưu được ưu tiên');
  assert.deepEqual(missingHomeTranslations(), {});

  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-home-i18n(?:-aria|-content)?="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(missingHomeTranslations([...new Set(keys)]), {});
});
