import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken, internalKey } from '@chanh-dien/session-token';
import { createBrainStore } from '../brain.mjs';
import { bellReverse, BELL_START, BRAIN_GAMES, BRAIN_LIMITS, BRAIN_SLACK_MS, buildPuzzle, DUEL_ITEMS, gradePuzzle, HARD_LEVEL, HARD_SHARE, IQ_ITEMS, IQ_KINDS, IQ_PERCENT_MIN, IQ_PRIOR, IQ_SAMPLE_MIN, iqIndex, NUMGRID_RULES, percentileOf, QUIZ_ITEMS, SPEED_ITEMS } from '../brain-puzzles.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

function setup() {
  const clock = { now: Date.UTC(2026, 10, 20, 18, 0) };
  const accounts = createAccountStore();
  const brain = createBrainStore({ db: accounts.database, secret: SECRET, now: () => clock.now, timeZone: 'America/Los_Angeles' });
  const options = { secret: SECRET, accounts, brain };
  const cookieOf = (username, displayName) => {
    const account = accounts.register({ username, password: 'matkhau123', displayName }).account;
    return `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}`;
  };
  const an = cookieOf('an.tritue', 'An');
  const binh = cookieOf('binh.tritue', 'Bình');
  const post = (action, body, cookie = an) => request(options, 'POST', `/api/v1/brain/${action}`, { body, headers: cookie ? { cookie } : {} });
  const view = async (cookie = an) => (await request(options, 'GET', '/api/v1/brain', { headers: cookie ? { cookie } : {} })).json;
  const seedOf = (roundId) => accounts.database.prepare('SELECT seed FROM brain_rounds WHERE id = ?').get(roundId).seed;
  // Một lượt: ra đề, chờ waitMs, nộp bài (answers(problem, solution) → mảng nộp).
  const play = async (game, answers, { waitMs = 20_000, cookie = an } = {}) => {
    const round = await post('round', { game }, cookie);
    assert.equal(round.status, 200, JSON.stringify(round.json));
    const solution = buildPuzzle(game, seedOf(round.json.roundId)).answers;
    clock.now += waitMs;
    const answer = await post('answer', { roundId: round.json.roundId, answers: answers(solution, round.json.problem) }, cookie);
    return { round: round.json, answer };
  };
  return { clock, options, accounts, post, view, play, an, binh };
}

// Ma trận: với ô cuối là phương án `option`, mỗi thuộc tính phải theo một luật (cả bảng giống nhau, mỗi hàng giống nhau,
// mỗi cột giống nhau, mỗi hàng / cột đủ 3 giá trị khác nhau, hoặc số lượng cột 3 = cột 1 + cột 2). Viết riêng ở test,
// không dùng hàm của bộ sinh đề.
function matrixValid(cells, option) {
  const grid = [...cells, option];
  if (!grid.every((cell) => cell.f === grid[0].f)) return false;
  return ['s', 'c', 'n', 'z'].every((attr) => {
    const at = (r, k) => grid[r * 3 + k][attr];
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((k) => at(r, k)));
    const cols = [0, 1, 2].map((k) => [0, 1, 2].map((r) => at(r, k)));
    const same = (list) => list.every((value) => value === list[0]);
    const distinct = (list) => new Set(list).size === 3;
    if (same(grid.map((cell) => cell[attr]))) return true;
    if (rows.every(same) && distinct(rows.map((row) => row[0]))) return true;
    if (cols.every(same) && distinct(cols.map((col) => col[0]))) return true;
    if (rows.every(distinct) && cols.every(distinct) && new Set(grid.map((cell) => cell[attr])).size === 3) return true;
    if (attr === 'n' && rows.every((row) => row[2] === row[0] + row[1])) return true;
    return false;
  });
}

// Xoay hình: các dạng xoay 90° của một hình ô vuông, so bằng chuỗi sau khi dời về góc.
function turnsOf(shape) {
  const key = (cells) => {
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => `${x - minX},${y - minY}`).sort().join(';');
  };
  const out = [];
  let cells = shape;
  for (let turn = 0; turn < 4; turn += 1) {
    out.push(key(cells));
    cells = cells.map(([x, y]) => [-y, x]);
  }
  return { key, out };
}

// Tính nhẩm: tự tính biểu thức (không dùng hàm của bộ sinh đề).
const mathValue = (text) => Function(`return ${text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/(\d+)²/g, '($1*$1)').replace(/(\d+)%/g, '($1/100)')}`)();

test('trí tuệ: đề sinh từ seed — cùng seed cùng đề, phương án không trùng, mỗi câu chỉ một đáp án', () => {
  for (const game of [...BRAIN_GAMES, 'iq']) {
    assert.deepEqual(buildPuzzle(game, 12345), buildPuzzle(game, 12345), game);
    assert.notDeepEqual(buildPuzzle(game, 12345).problem, buildPuzzle(game, 54321).problem, game);
  }
  for (let seed = 1; seed <= 300; seed += 1) {
    for (const game of ['iq', 'matrix', 'series']) {
      const { problem, answers } = buildPuzzle(game, seed * 104729);
      problem.items.forEach((item, index) => {
        const where = `${game} seed ${seed} câu ${index} (${item.kind})`;
        assert.equal(new Set(item.options.map((option) => JSON.stringify(option))).size, item.options.length, where);
        assert.equal(item.options.length, item.kind === 'matrix' ? 6 : 4, where);
        assert.ok(!('answer' in item), 'đề gửi trình duyệt không có đáp án');
        if (item.kind === 'matrix') {
          const valid = item.options.map((option) => matrixValid(item.cells, option));
          assert.equal(valid.filter(Boolean).length, 1, `${where}: chỉ một phương án hợp luật`);
          assert.equal(valid.indexOf(true), answers[index], where);
        }
        if (item.kind === 'rotation') {
          const { key, out } = turnsOf(item.shape);
          const isTurn = item.options.map((option) => out.includes(key(option)));
          assert.equal(isTurn.filter(Boolean).length, 1, `${where}: chỉ một phương án là hình xoay`);
          assert.equal(isTurn.indexOf(true), answers[index], where);
          assert.notEqual(key(item.options[answers[index]]), key(item.shape), `${where}: đáp án phải xoay thật`);
        }
        if (item.kind === 'numgrid') {
          const rows = [item.cells.slice(0, 3), item.cells.slice(3, 6)];
          const [a, b] = item.cells.slice(6, 8);
          const sum = rows[0][0] + rows[0][1] + rows[0][2];
          const fits = Object.values(NUMGRID_RULES).filter((rule) => rows.every(([x, y, z]) => rule(x, y) === z)).map((rule) => rule(a, b));
          if (rows.every((row) => row[0] + row[1] + row[2] === sum)) fits.push(sum - a - b);
          assert.ok(fits.length >= 1, `${where}: có phép khớp hai hàng đầu`);
          assert.ok(fits.every((value) => value === item.options[answers[index]]), `${where}: mọi cách hiểu cùng một đáp án`);
        }
        if (item.kind === 'series') assert.ok(item.terms.every((value) => Number.isInteger(value) && value >= 0), where);
      });
    }
    // Tính nhẩm: đáp án đúng phép tính; màu mực: đáp án theo luật của câu (màu mực / chữ).
    const math = buildPuzzle('math', seed);
    math.problem.items.forEach((item, index) => assert.equal(item.options[math.answers[index]], mathValue(item.text), item.text));
    const stroop = buildPuzzle('stroop', seed);
    stroop.problem.items.forEach((item, index) => {
      assert.equal(stroop.answers[index], item.mode === 'word' ? item.word : item.ink);
      if (item.level >= HARD_LEVEL) assert.notEqual(item.word, item.ink, 'câu khó: chữ luôn khác màu mực');
    });
  }
});

test('trí tuệ: 80 % câu khó — Test IQ 16 / 20, Đố hình / Đố số 8 / 10, Tính nhẩm / Màu mực 4 / 5; đủ loại câu', () => {
  const hard = (items) => items.filter((item) => item.level >= HARD_LEVEL).length;
  for (const seed of [1, 99, 4242]) {
    const iq = buildPuzzle('iq', seed).problem.items;
    assert.equal(iq.length, IQ_ITEMS);
    assert.equal(hard(iq), IQ_ITEMS * HARD_SHARE);
    for (const kind of IQ_KINDS) assert.equal(iq.filter((item) => item.kind === kind).length, 5, kind);
    for (const [game, kinds] of [['matrix', ['matrix', 'rotation']], ['series', ['series', 'numgrid']]]) {
      const items = buildPuzzle(game, seed).problem.items;
      assert.equal(items.length, QUIZ_ITEMS);
      assert.equal(hard(items), QUIZ_ITEMS * HARD_SHARE, game);
      assert.deepEqual([...new Set(items.map((item) => item.kind))].sort(), [...kinds].sort(), game);
    }
    for (const game of ['math', 'stroop']) assert.equal(hard(buildPuzzle(game, seed).problem.items), SPEED_ITEMS * HARD_SHARE, game);
  }
  // Dãy số / tính nhẩm có nhiều kiểu câu khó: đếm số "dạng" khác nhau qua nhiều đề.
  const mathShapes = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    for (const item of buildPuzzle('math', seed).problem.items) if (item.level >= HARD_LEVEL) mathShapes.add(item.text.replace(/\d+/g, 'n'));
  }
  assert.ok(mathShapes.size >= 8, `tính nhẩm có ${mathShapes.size} dạng câu khó`);
});

test('trí tuệ: chấm điểm từng trò, lượt gõ ngược của chuông, làm nhanh hơn sức người thì không nhận', () => {
  const seed = 777;
  const bells = buildPuzzle('bells', seed).answers;
  assert.deepEqual([bellReverse(4), bellReverse(5), bellReverse(6), bellReverse(7)], [false, true, false, true]);
  assert.equal(gradePuzzle('bells', seed, bells.slice(0, 6), 60_000).points, 40);
  assert.equal(gradePuzzle('bells', seed, bells.slice(0, 7).reverse(), 60_000).points, 50, 'chuỗi 7 tiếng gõ ngược');
  assert.equal(gradePuzzle('bells', seed, bells.slice(0, 7), 60_000).points, 0, 'chuỗi 7 tiếng gõ xuôi là sai');
  assert.equal(gradePuzzle('bells', seed, [...bells.slice(0, 3), (bells[3] + 1) % 4], 60_000).points, 0, 'gõ sai thì không tính');
  assert.equal(gradePuzzle('bells', seed, bells.slice(0, 12), 2_000).code, 'TOO_FAST');
  const matrix = buildPuzzle('matrix', seed).answers;
  assert.deepEqual([gradePuzzle('matrix', seed, matrix, 60_000).points, gradePuzzle('matrix', seed, [matrix[0], null, matrix[2]], 60_000).points], [100, 20]);
  assert.equal(gradePuzzle('matrix', seed, matrix, 2_000).code, 'TOO_FAST');
  const math = buildPuzzle('math', seed).answers;
  const fast = gradePuzzle('math', seed, math.slice(0, 22), 50_000);
  assert.deepEqual([fast.points, fast.correct, fast.total], [100, 22, 22]);
  const sloppy = gradePuzzle('math', seed, math.slice(0, 10).map((value, index) => (index < 4 ? (value + 1) % 4 : value)), 50_000);
  assert.deepEqual([sloppy.correct, sloppy.wrong, sloppy.points], [6, 4, 24]);
  assert.equal(gradePuzzle('stroop', seed, buildPuzzle('stroop', seed).answers.slice(0, 30), 3_000).code, 'TOO_FAST');
  const iq = buildPuzzle('iq', seed).answers;
  const graded = gradePuzzle('iq', seed, iq, 300_000);
  assert.deepEqual([graded.points, graded.byKind], [20, { matrix: 5, rotation: 5, series: 5, numgrid: 5 }]);
  assert.equal(gradePuzzle('series', seed, [9], 10_000).code, 'INVALID');
  assert.equal(gradePuzzle('series', seed, 'x', 10_000).code, 'INVALID');
});

test('trí tuệ: Đề hôm nay — ai cũng cùng đề, lần đầu mỗi trò mới tính điểm, khách chơi được nhưng không lưu', async () => {
  const { view, play, post, binh } = setup();
  const first = await view();
  assert.deepEqual(first.games, BRAIN_GAMES);
  assert.deepEqual([first.me.today, first.me.streak, first.me.bestIq], [{}, 0, null]);
  const { round, answer } = await play('matrix', (solution) => solution);
  assert.equal(round.practice, false);
  assert.equal(round.problem.items.length, QUIZ_ITEMS);
  assert.ok(round.problem.items.every((item) => !('answer' in item)));
  assert.deepEqual([answer.status, answer.json.points, answer.json.saved, answer.json.today], [200, 100, true, { matrix: 100 }]);
  assert.equal(answer.json.solution.length, QUIZ_ITEMS, 'nộp xong mới có đáp án để xem lại');
  // Người khác cùng ngày nhận đúng đề đó.
  const other = await post('round', { game: 'matrix' }, binh);
  assert.deepEqual(other.json.problem, round.problem);
  // Làm lại: chơi tập, không đổi điểm đã lưu.
  const again = await play('matrix', () => []);
  assert.deepEqual([again.round.practice, again.round.previous, again.answer.json.saved, again.answer.json.today.matrix], [true, 100, false, 100]);
  // Khách: chơi tập, không lưu, không lên Bảng vàng.
  const guest = await play('series', (solution) => solution, { cookie: null });
  assert.deepEqual([guest.round.practice, guest.answer.json.points, guest.answer.json.saved, guest.answer.json.today], [true, 100, false, null]);
  const seen = await view(null);
  assert.equal(seen.me, null);
  assert.deepEqual(seen.board.today, [{ name: 'An', points: 100, games: 1 }]);
  assert.equal(seen.players, 1);
});

test('trí tuệ: mỗi đề nộp một lần, quá giờ / đề người khác / làm quá nhanh không nhận', async () => {
  const { post, clock, binh, accounts } = setup();
  const seedOf = (roundId) => accounts.database.prepare('SELECT seed FROM brain_rounds WHERE id = ?').get(roundId).seed;
  const round = (await post('round', { game: 'series' })).json;
  clock.now += 10_000;
  assert.equal((await post('answer', { roundId: round.roundId, answers: [] }, binh)).json.code, 'ROUND_NOT_FOUND');
  assert.equal((await post('answer', { roundId: round.roundId, answers: [] })).status, 200);
  assert.equal((await post('answer', { roundId: round.roundId, answers: [] })).json.code, 'ROUND_NOT_FOUND');
  const late = (await post('round', { game: 'stroop' })).json;
  clock.now += BRAIN_LIMITS.stroop + BRAIN_SLACK_MS + 1_000;
  assert.equal((await post('answer', { roundId: late.roundId, answers: [] })).json.code, 'ROUND_EXPIRED');
  const quick = (await post('round', { game: 'matrix' })).json;
  clock.now += 500;
  const result = await post('answer', { roundId: quick.roundId, answers: buildPuzzle('matrix', seedOf(quick.roundId)).answers });
  assert.deepEqual([result.status, result.json.code], [409, 'TOO_FAST']);
  assert.equal((await post('round', { game: 'chess' })).json.code, 'INVALID');
  assert.equal((await post('answer', { roundId: '../x', answers: [] })).json.code, 'ROUND_NOT_FOUND');
});

test('trí tuệ: chuỗi ngày làm đủ 5 trò, bỏ một ngày là tính lại', async () => {
  const { view, play, clock } = setup();
  const finishDay = async () => {
    for (const game of BRAIN_GAMES) await play(game, (solution) => (game === 'bells' ? solution.slice(0, BELL_START) : []));
  };
  await finishDay();
  assert.equal((await view()).me.streak, 1);
  clock.now += 24 * 3_600_000;
  assert.equal((await view()).me.streak, 1, 'hôm nay chưa làm vẫn giữ chuỗi tới hôm qua');
  await finishDay();
  assert.equal((await view()).me.streak, 2);
  clock.now += 2 * 24 * 3_600_000;
  assert.equal((await view()).me.streak, 0);
  await finishDay();
  assert.equal((await view()).me.streak, 1);
});

test('trí tuệ: Test IQ vui — chỉ số theo số câu đúng, lưu kết quả tốt nhất, Bảng vàng chỉ có thành viên', async () => {
  const { view, play, binh } = setup();
  const { round, answer } = await play('iq', (solution) => solution.map((value, index) => (index < 15 ? value : null)), { waitMs: 300_000 });
  assert.equal(round.problem.items.length, 20);
  assert.equal(round.limitMs, 900_000);
  const expected = iqIndex(15, []);
  assert.deepEqual([answer.json.correct, answer.json.total, answer.json.index, answer.json.percent, answer.json.calibrated], [15, 20, expected.index, null, false]);
  assert.equal(IQ_KINDS.reduce((sum, kind) => sum + answer.json.strengths[kind], 0), 15);
  assert.equal(answer.json.strengths.seconds, 300);
  assert.equal(answer.json.best, expected.index);
  await play('iq', () => [], { waitMs: 60_000, cookie: binh });
  await play('iq', (solution) => solution, { waitMs: 400_000, cookie: null });
  const seen = await view();
  assert.equal(seen.me.bestIq, expected.index);
  assert.equal(seen.me.iq.length, 1);
  assert.deepEqual(seen.board.iq.map((row) => row.name), ['An', 'Bình'], 'khách không lên Bảng vàng');
});

test('trí tuệ: chỉ số tham khảo tăng theo số câu đúng, kẹp 70–145, đủ mẫu thì theo người chơi thật', () => {
  let last = 0;
  for (let correct = 0; correct <= 20; correct += 1) {
    const { index } = iqIndex(correct, []);
    assert.ok(index >= last && index >= 70 && index <= 145, `${correct} → ${index}`);
    last = index;
  }
  assert.equal(iqIndex(IQ_PRIOR.mean, []).index, 100);
  assert.equal(percentileOf(5, [1, 5, 9, 9]), 0.375);
  const small = Array.from({ length: IQ_PERCENT_MIN }, (_, index) => index % 21);
  assert.equal(typeof iqIndex(10, small).percent, 'number');
  assert.equal(iqIndex(10, small).calibrated, false);
  const big = Array.from({ length: IQ_SAMPLE_MIN }, () => 5);
  const top = iqIndex(6, big);
  assert.deepEqual([top.calibrated, top.percent], [true, 100]);
  assert.ok(top.index > iqIndex(6, []).index, 'mẫu thật toàn người 5 câu thì 6 câu đứng đầu');
});

test('trí tuệ: Đấu trí — chỉ máy realtime tạo trận, mỗi người chỉ lấy đề của mình, kết quả để phân thắng thua', async () => {
  const { options, accounts, post, clock, an, binh } = setup();
  const anId = accounts.database.prepare("SELECT id FROM accounts WHERE username = 'an.tritue'").get().id;
  const internal = (method, url, body, key = internalKey(SECRET)) => request(options, method, url, { body, headers: key ? { 'x-internal-key': key } : {} });
  const challengeId = 'g-12345678-1234-1234-1234-123456789abc';
  assert.equal((await internal('POST', '/internal/brain/duel', { challengeId, from: { accountId: anId }, to: { bot: true } }, null)).status, 403);
  assert.equal((await internal('POST', '/internal/brain/duel', { challengeId, from: { bot: true }, to: { bot: true } })).json.code, 'INVALID');
  const created = await internal('POST', '/internal/brain/duel', { challengeId, from: { accountId: anId }, to: { accountId: null } });
  assert.deepEqual([created.status, Object.keys(created.json.rounds), created.json.limitMs, created.json.total], [200, ['from', 'to'], BRAIN_LIMITS.duel, DUEL_ITEMS]);
  const again = await internal('POST', '/internal/brain/duel', { challengeId, from: { accountId: anId }, to: { accountId: null } });
  assert.deepEqual(again.json.rounds, created.json.rounds, 'gọi lại trả đúng trận cũ');
  // Trang không tự tạo được đề đấu; người khác không lấy được đề của An; khách lấy được đề bên khách.
  assert.equal((await post('round', { game: 'duel' })).json.code, 'INVALID');
  assert.equal((await post('duel', { roundId: created.json.rounds.from }, binh)).json.code, 'ROUND_NOT_FOUND');
  const mine = await post('duel', { roundId: created.json.rounds.from }, an);
  assert.equal(mine.json.problem.items.length, DUEL_ITEMS);
  assert.ok(mine.json.problem.items.every((item) => !('answer' in item)));
  const guest = await post('duel', { roundId: created.json.rounds.to }, null);
  assert.deepEqual(guest.json.problem, mine.json.problem, 'hai bên cùng một đề');
  let status = await internal('GET', `/internal/brain/duel?challengeId=${challengeId}`);
  assert.deepEqual([status.json.from, status.json.to], [{ done: false }, { done: false }]);
  const seed = accounts.database.prepare('SELECT seed FROM brain_rounds WHERE id = ?').get(created.json.rounds.from).seed;
  const solution = buildPuzzle('duel', seed).answers;
  clock.now += 95_000;
  const answered = await post('answer', { roundId: created.json.rounds.from, answers: solution.map((value, index) => (index < 6 ? value : null)) }, an);
  assert.deepEqual([answered.json.correct, answered.json.total, answered.json.ms, answered.json.solution.length], [6, DUEL_ITEMS, 95_000, DUEL_ITEMS]);
  status = await internal('GET', `/internal/brain/duel?challengeId=${challengeId}`);
  assert.deepEqual([status.json.from, status.json.to], [{ done: true, correct: 6, ms: 95_000 }, { done: false }]);
  assert.equal((await post('duel', { roundId: created.json.rounds.from }, an)).json.code, 'ROUND_NOT_FOUND', 'đã nộp thì không lấy lại đề');
  assert.equal((await internal('GET', '/internal/brain/duel?challengeId=g-x')).json.code, 'INVALID');
});

test('trí tuệ: Đố vui — chỉ máy realtime xin được bộ đề kèm đáp án, 12 câu, 80 % trở lên là câu khó', async () => {
  const { options } = setup();
  const denied = await request(options, 'POST', '/internal/brain/quiz', { body: {} });
  assert.equal(denied.status, 403);
  const { status, json } = await request(options, 'POST', '/internal/brain/quiz', { body: {}, headers: { 'x-internal-key': internalKey(SECRET) } });
  assert.equal(status, 200);
  assert.equal(json.items.length, 12);
  assert.ok(json.items.filter((item) => item.problem.level >= HARD_LEVEL).length >= 12 * HARD_SHARE);
  assert.ok(json.items.every((item) => Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.problem.options.length));
  assert.deepEqual([...new Set(json.items.map((item) => item.problem.kind))].sort(), [...IQ_KINDS].sort());
});

test('trí tuệ: Bảng vàng Đố vui — máy realtime báo kết quả, gửi lại không tính hai lần, xếp theo số ván thắng 7 ngày', async () => {
  const { options, accounts, view, clock, an } = setup();
  const idOf = (username) => accounts.database.prepare('SELECT id FROM accounts WHERE username = ?').get(username).id;
  const [anId, binhId] = [idOf('an.tritue'), idOf('binh.tritue')];
  const report = (key, players, withKey = true) => request(options, 'POST', '/internal/brain/quiz/result', { body: { key, players }, headers: withKey ? { 'x-internal-key': internalKey(SECRET) } : {} });
  assert.equal((await report('quiz-thien-1-1-1', [], false)).status, 403);
  assert.equal((await report('bad key', [])).json.code, 'INVALID');
  assert.equal((await report('quiz-thien-1-1-1', [{ accountId: anId }])).json.code, 'INVALID', 'thiếu won');
  assert.equal((await report('quiz-thien-1-1-1', [{ accountId: anId, displayName: 'An', won: true }, { accountId: binhId, displayName: 'Bình', won: false }])).json.saved, 2);
  assert.equal((await report('quiz-thien-1-1-1', [{ accountId: anId, displayName: 'An', won: true }])).json.saved, 0, 'gửi lại không tính');
  await report('quiz-thien-1-1-2', [{ accountId: binhId, displayName: 'Bình', won: true }]);
  await report('quiz-thien-1-1-3', [{ accountId: binhId, displayName: 'Bình', won: true }, { accountId: anId, displayName: 'An', won: false }]);
  let seen = await view(an);
  assert.deepEqual(seen.board.quiz, [{ name: 'Bình', wins: 2, plays: 3 }, { name: 'An', wins: 1, plays: 2 }]);
  assert.deepEqual(seen.me.quiz, { wins: 1, plays: 2 });
  clock.now += 8 * 24 * 3_600_000;
  seen = await view(an);
  assert.deepEqual([seen.board.quiz, seen.me.quiz], [[], { wins: 0, plays: 0 }], 'quá 7 ngày thì không tính');
});
