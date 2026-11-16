import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPATIBILITY_BANK_VERSION,
  COMPATIBILITY_QUESTIONS,
  compatibilityQuestion,
} from '../public/compatibility-questions.js';

test('ngân hàng đo độ hiểu ý có đúng 100 câu, id ổn định và đủ bốn ngôn ngữ', () => {
  assert.equal(COMPATIBILITY_BANK_VERSION, 1);
  assert.equal(COMPATIBILITY_QUESTIONS.length, 100);
  assert.equal(new Set(COMPATIBILITY_QUESTIONS.map(({ id }) => id)).size, 100);
  assert.deepEqual([COMPATIBILITY_QUESTIONS[0].id, COMPATIBILITY_QUESTIONS.at(-1).id], ['cq-001', 'cq-100']);
  for (const { id, pair } of COMPATIBILITY_QUESTIONS) {
    assert.equal(pair.length, 8, id);
    assert.equal(pair.every((text) => typeof text === 'string' && text.trim().length > 0), true, id);
    for (const language of ['vi', 'en', 'zh', 'es']) {
      const question = compatibilityQuestion(id, language);
      assert.equal(question.options.length, 2, `${id}:${language}`);
      assert.notEqual(question.options[0], question.options[1], `${id}:${language}`);
    }
  }
  assert.equal(compatibilityQuestion('cq-101'), null);
});
