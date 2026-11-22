import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { buildQuizRoom } from '../../api/brain-puzzles.mjs';
import { QuizGame } from '../quiz.mjs';

// Phòng giả: người / bot, gom mọi tin phát ra.
function setup({ bots = 0, accuracy = 1, source } = {}) {
  const participants = new Map();
  for (const id of ['an', 'binh', 'chi']) participants.set(id, { id, displayName: id.toUpperCase(), connected: true, ...(id === 'chi' ? {} : { accountId: `acc-${id}` }) });
  for (let index = 0; index < bots; index += 1) participants.set(`bot-${index}`, { id: `bot-${index}`, displayName: `Bot ${index}`, bot: true, connected: true });
  const sent = [];
  const reports = [];
  const room = {
    id: 'thien-ca-vi-1',
    reportQuiz: (event) => reports.push(event),
    participants,
    epoch: 3,
    broadcast: (message) => sent.push(structuredClone(message)),
    availableQuizBots: () => [...participants.values()].filter((participant) => participant.bot),
  };
  const items = buildQuizRoom(4242);
  const rules = { ...THIEN_RULES.quiz, botFill: bots ? 4 : 0, botAccuracy: [accuracy, accuracy, accuracy, accuracy, accuracy] };
  const game = new QuizGame({ room, rules, source: source || (async () => items), random: () => 0.5 });
  const last = () => sent.at(-1);
  return { game, room, sent, items, last, reports };
}

test('đố vui: sai là bị loại, đáp án chỉ lộ khi mở đáp án, còn một người là thắng', async () => {
  const { game, sent, items, last, reports } = setup();
  assert.deepEqual(game.join('an'), { ok: true });
  assert.equal(last().phase, 'lobby');
  assert.equal(last().endsAt, undefined, 'một người, không có bot: chưa đếm ngược');
  game.join('binh');
  assert.ok(last().endsAt, 'đủ hai người thì đếm ngược');
  await game.start();
  const asked = last();
  assert.deepEqual([asked.phase, asked.index, asked.total, asked.players.length], ['question', 0, items.length, 2]);
  assert.equal(Object.hasOwn(asked, 'answer'), false, 'đang hỏi thì không có đáp án');
  assert.deepEqual(asked.question, items[0].problem);
  assert.equal(game.answer('an', 1, 0).error, 'NOT_ASKING');
  assert.deepEqual(game.answer('an', 0, items[0].answer), { ok: true });
  assert.equal(game.answer('an', 0, items[0].answer).error, 'ALREADY_ANSWERED');
  assert.deepEqual(last().players.find((player) => player.id === 'an'), { id: 'an', displayName: 'AN', alive: true, answered: true });
  assert.equal(JSON.stringify(sent).includes('"choice"'), false, 'không phát lựa chọn của ai');
  // Bình chọn sai → mở đáp án ngay (ai cũng đã trả lời), Bình bị loại.
  game.answer('binh', 0, (items[0].answer + 1) % items[0].problem.options.length);
  const reveal = last();
  assert.deepEqual([reveal.phase, reveal.answer, reveal.eliminated, reveal.allWrong], ['reveal', items[0].answer, ['binh'], false]);
  assert.equal(game.answer('binh', 0, 0).error, 'NOT_ASKING');
  game.next();
  assert.deepEqual([last().phase, last().winners], ['result', ['an']]);
  assert.deepEqual(reports, [{ key: 'quiz-thien-ca-vi-1-3-1', players: [{ accountId: 'acc-an', displayName: 'AN', won: true }, { accountId: 'acc-binh', displayName: 'BINH', won: false }] }], 'báo Bảng vàng: chỉ thành viên');
  for (const message of sent) assert.equal(parseServerMessage(message).ok, true, JSON.stringify(message).slice(0, 200));
  game.stop();
});

test('đố vui: cả nhà cùng sai thì không ai bị loại; hết giờ không trả lời là bị loại', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { game, items, last } = setup();
  game.join('an');
  game.join('binh');
  game.join('chi');
  await game.start();
  const wrong = (index) => (items[index].answer + 1) % items[index].problem.options.length;
  for (const id of ['an', 'binh', 'chi']) game.answer(id, 0, wrong(0));
  assert.deepEqual([last().phase, last().allWrong, last().eliminated], ['reveal', true, []]);
  assert.equal(last().players.every((player) => player.alive), true);
  t.mock.timers.tick(THIEN_RULES.quiz.revealMs);
  assert.deepEqual([last().phase, last().index], ['question', 1]);
  // Câu 2: An đúng, Bình sai, Chi không trả lời → hết giờ: Bình, Chi bị loại.
  game.answer('an', 1, items[1].answer);
  game.answer('binh', 1, wrong(1));
  t.mock.timers.tick(items[1].problem.level >= 3 ? THIEN_RULES.quiz.hardMs : THIEN_RULES.quiz.easyMs);
  assert.deepEqual([last().phase, last().eliminated.sort()], ['reveal', ['binh', 'chi']]);
  t.mock.timers.tick(THIEN_RULES.quiz.revealMs);
  assert.deepEqual(last().winners, ['an']);
  t.mock.timers.tick(THIEN_RULES.quiz.resultMs);
  assert.equal(last().phase, 'idle');
  game.stop();
});

test('đố vui: một người cũng chơi được với bot; người thật rời hết thì dừng, bot còn lại thắng', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { game, items, last } = setup({ bots: 5, accuracy: 1 });
  game.join('an');
  assert.ok(last().endsAt, 'có bot rảnh: một người cũng đếm ngược');
  await game.start();
  assert.equal(last().players.length, 4, 'bot vào cho đủ botFill người');
  game.answer('an', 0, items[0].answer);
  t.mock.timers.tick(THIEN_RULES.quiz.hardMs);
  assert.deepEqual([last().phase, last().eliminated], ['reveal', []], 'bot trả lời đúng (độ chính xác 1)');
  // Đang chơi mà có người xin vào: chờ ván sau. Người thật rời: coi như bị loại → hết người thật thì dừng.
  game.join('binh');
  assert.deepEqual(last().lobby.map((person) => person.id), ['binh']);
  game.leave('an');
  t.mock.timers.tick(THIEN_RULES.quiz.revealMs);
  assert.equal(last().phase, 'result');
  assert.deepEqual(last().winners.sort(), last().players.filter((player) => player.alive).map((player) => player.id).sort());
  assert.ok(last().winners.every((id) => id.startsWith('bot-')));
  game.stop();
});

test('đố vui: API không cho đề thì về hàng chờ; bot không tự xin chơi', async () => {
  const { game, last } = setup({ source: async () => null });
  assert.equal(game.join('bot-x').error, 'NOT_IN_ROOM');
  game.join('an');
  game.join('binh');
  await game.start();
  assert.deepEqual([last().phase, last().lobby.map((person) => person.id).sort(), last().players], ['lobby', ['an', 'binh'], []]);
  game.stop();
  const disabled = new QuizGame({ room: { participants: new Map([['an', { id: 'an' }]]), broadcast() {}, epoch: 1 }, rules: THIEN_RULES.quiz });
  assert.equal(disabled.join('an').error, 'NOT_ALLOWED', 'không có nguồn đề thì không mở');
});
