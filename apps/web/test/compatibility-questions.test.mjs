import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPATIBILITY_BANK_VERSION,
  COMPATIBILITY_QUESTIONS,
  compatibilityQuestion,
} from '../public/compatibility-questions.js';

test('ngân hàng có 100 câu gốc + 500 câu mới, id ổn định và đủ bốn ngôn ngữ', () => {
  assert.equal(COMPATIBILITY_BANK_VERSION, 2);
  assert.equal(COMPATIBILITY_QUESTIONS.length, 600);
  assert.equal(new Set(COMPATIBILITY_QUESTIONS.map(({ id }) => id)).size, 600);
  assert.deepEqual([COMPATIBILITY_QUESTIONS[0].id, COMPATIBILITY_QUESTIONS.at(-1).id], ['cq-001', 'cq-600']);
  for (const { id, pair } of COMPATIBILITY_QUESTIONS) {
    assert.equal(pair.length, 8, id);
    assert.equal(pair.every((text) => typeof text === 'string' && text.trim().length > 0), true, id);
    for (const language of ['vi', 'en', 'zh', 'es']) {
      const question = compatibilityQuestion(id, language);
      assert.equal(question.options.length, 2, `${id}:${language}`);
      assert.notEqual(question.options[0], question.options[1], `${id}:${language}`);
      if (Number(id.slice(3)) > 100) assert.equal(typeof question.prompt, 'string', `${id}:${language}:prompt`);
    }
  }
  for (const language of ['vi', 'en', 'zh', 'es']) {
    const rendered = COMPATIBILITY_QUESTIONS.map(({ id }) => {
      const question = compatibilityQuestion(id, language);
      return `${question.prompt || ''}|${question.options.join('|')}`;
    });
    assert.equal(new Set(rendered).size, 600, `không trùng nội dung ${language}`);
  }
  assert.equal(compatibilityQuestion('cq-601'), null);
});
