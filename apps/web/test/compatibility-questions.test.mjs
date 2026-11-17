import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPATIBILITY_BANK_VERSION,
  COMPATIBILITY_QUESTIONS,
  compatibilityQuestion,
} from '../public/compatibility-questions.js';
import { addQuestionBankCapability } from '../public/realtime-session.js';
import { COMPATIBILITY_BANK_VERSION as PROTOCOL_BANK_VERSION } from '@chanh-dien/protocol';

test('ngân hàng có 100 câu gốc + 500 câu mới, id ổn định và đủ bốn ngôn ngữ', () => {
  assert.equal(COMPATIBILITY_BANK_VERSION, 5);
  assert.equal(COMPATIBILITY_BANK_VERSION, PROTOCOL_BANK_VERSION);
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

test('500 câu tình huống: mỗi câu một tình huống riêng, không ghép chéo, viết trung tính cho mọi kiểu câu hỏi', () => {
  const extras = COMPATIBILITY_QUESTIONS.slice(100);
  const topics = ['daily', 'food', 'travel', 'people', 'mind'];
  assert.deepEqual([...new Set(extras.map(({ topic }) => topic))], topics);
  for (const topic of topics) assert.equal(extras.filter((question) => question.topic === topic).length, 100, topic);
  for (const [index, language] of ['vi', 'en', 'zh', 'es'].entries()) {
    // Bản v3 ghép 20 tình huống × 5 cặp lựa chọn nên ra câu vô nghĩa: giờ tình huống nào cũng chỉ dùng một lần.
    const prompts = extras.map(({ prompt }) => prompt[index]);
    assert.equal(new Set(prompts).size, 500, `${language}: tình huống không lặp`);
    // Trang tự thêm câu hỏi ("Theo bạn, {tên} sẽ chọn điều nào?"…) ngay dưới nên tình huống không phải câu hỏi.
    assert.equal(prompts.some((text) => /[?？¿]/.test(text)), false, `${language}: tình huống không phải câu hỏi`);
  }
  // Không có ngôi thứ hai là người chọn: câu hỏi có thể hỏi về chính người chơi hoặc người kia.
  for (const { id, prompt } of extras) {
    assert.doesNotMatch(prompt[0], /giống bạn|hợp với bạn|của bạn/, `${id}:vi`);
    assert.doesNotMatch(prompt[1], /\byou(r)?\b/i, `${id}:en`);
    assert.doesNotMatch(prompt[2], /你/, `${id}:zh`);
  }
  assert.equal(compatibilityQuestion('cq-101', 'vi').prompt, 'Sáng thứ Bảy không có lịch gì');
  assert.deepEqual(compatibilityQuestion('cq-101', 'vi').options, ['Ngủ nướng thêm một chút', 'Dậy sớm đi dạo']);
  assert.equal(compatibilityQuestion('cq-201', 'en').prompt, 'A weekday breakfast');
  assert.deepEqual(compatibilityQuestion('cq-600', 'es').options, ['Aprender algo nuevo', 'Dejar un mal hábito']);
  // 100 câu gốc giữ nguyên nội dung (trang cũ và trang mới cùng hiển thị như nhau).
  assert.deepEqual(compatibilityQuestion('cq-001', 'vi'), { id: 'cq-001', prompt: null, options: ['Ở nhà thư giãn', 'Ra ngoài khám phá'] });
  assert.deepEqual(compatibilityQuestion('cq-100', 'en').options, ['Grow green plants', 'Grow colorful flowers']);
});

test('capability theo phiên bản giữ an toàn khi web mới gặp realtime cũ', () => {
  const url = new URL('ws://localhost/ws');
  addQuestionBankCapability(url, 600, COMPATIBILITY_BANK_VERSION);
  assert.equal(url.searchParams.get('questionBankSize'), '100', 'realtime cũ chỉ nhìn thấy 100 câu ổn định');
  assert.equal(url.searchParams.get('questionBankMax'), '600');
  assert.equal(url.searchParams.get('questionBankVersion'), String(COMPATIBILITY_BANK_VERSION));
});
