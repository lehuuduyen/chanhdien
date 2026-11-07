import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseServerMessage } from '@chanh-dien/protocol';
import { WebSocket } from 'ws';
import { cleanLine, createBotAi, guessLang, templateLine } from '../bot-ai.mjs';
import { Room } from '../server.mjs';

const context = { lang: 'vi', botName: 'Sen Nhỏ', toName: 'An', game: 'loto' };
const reply = (content, status = 200, headers = {}) => ({
  ok: status < 400, status, headers: new Headers(headers), json: async () => ({ choices: [{ message: { content } }] }),
});

test('bot AI: không có khóa thì dùng câu mẫu theo ngôn ngữ phòng; câu AI được làm sạch', async () => {
  const ai = createBotAi({ fetcher: () => assert.fail('không gọi mạng khi không có khóa') });
  assert.equal(ai.enabled, false);
  assert.match(await ai.line('invite', context), /An|Lô Tô/);
  assert.match(templateLine('invite', { lang: 'en', toName: 'Mia', game: 'tai-xiu' }), /Mia|Tài Xỉu/);
  assert.equal(cleanLine('<think>suy nghĩ</think>\n "Chào An 🙏" '), 'Chào An 🙏');
  assert.ok(cleanLine('a '.repeat(300)).length <= 200);
});

test('bot AI: gọi Groq kèm vai bot + lịch sử; câu bị bộ lọc chặn, lỗi mạng, 429 hay hết hạn mức thì dùng câu mẫu', async () => {
  const calls = [];
  let answer = () => reply('"Chào An, qua Lô Tô chơi với mình nhé 🎲"');
  const ai = createBotAi({
    apiKey: 'gsk_test', perMinute: 3, now: () => 1_000_000,
    screen: (text) => !/tục/.test(text),
    fetcher: async (url, init) => { calls.push({ url, init }); return answer(); },
  });
  assert.equal(await ai.line('reply', { ...context, history: [{ bot: false, text: 'chơi lô tô không' }] }), 'Chào An, qua Lô Tô chơi với mình nhé 🎲');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers.authorization, 'Bearer gsk_test');
  assert.deepEqual([body.model, body.reasoning_effort], ['qwen/qwen3.8-27b', 'none']);
  assert.match(body.messages[0].content, /"Sen Nhỏ".*là bot/);
  assert.deepEqual(body.messages.slice(1), [{ role: 'user', content: 'chơi lô tô không' }]);

  answer = () => reply('câu tục tĩu');
  assert.doesNotMatch(await ai.line('greet', context), /tục/, 'bị bộ lọc chặn: câu mẫu');
  answer = () => { throw new Error('mạng lỗi'); };
  assert.match(await ai.line('greet', context), /An/);
  assert.equal(calls.length, 3);
  assert.match(await ai.line('greet', context), /An/, 'quá 3 lượt/phút: không gọi nữa');
  assert.equal(calls.length, 3);

  const limited = createBotAi({ apiKey: 'k', fetcher: async () => { calls.push(1); return reply('', 429, { 'retry-after': '30' }); } });
  const before = calls.length;
  await limited.line('greet', context);
  await limited.line('greet', context);
  assert.equal(calls.length, before + 1, '429: tạm ngừng gọi theo retry-after');
});

function aiRoom(lines = {}) {
  const asked = [];
  const forwarded = [];
  const botAi = { line: async (kind, ctx) => { asked.push({ kind, ...ctx }); return lines[kind] || `câu ${kind}`; } };
  const room = new Room('thien-1', { botCount: 0, botAi, onBotChat: (event) => forwarded.push(event) });
  const inbox = {};
  const join = (id, name, pos, accountId) => {
    inbox[id] = [];
    room.join({ readyState: WebSocket.OPEN, send: (raw) => inbox[id].push(JSON.parse(raw)), close() {} }, { participantId: id, displayName: name, role: accountId ? 'member' : 'guest', ...(accountId ? { accountId } : {}) });
    room.participants.get(id).movedAt = 0;
    if (pos) room.move(id, { ...pos, ry: 0, moving: false });
    // Phòng không đặt số bot: người vào thì bot thừa bị bỏ ra; đặt lại bot thử sau mỗi lần có người vào.
    room.participants.set('b-1', bot);
  };
  const bot = { id: 'b-1', displayName: 'Sen Nhỏ', bot: true, connected: true, socket: null, pos: { x: 3, z: 40, ry: 0 }, walk: { waitUntil: 0 } };
  const of = (id, type) => inbox[id].filter((message) => message.type === type);
  return { room, bot, join, of, asked, forwarded };
}

function withRandom(value, run) {
  const original = Math.random;
  Math.random = () => value;
  try { return run(); } finally { Math.random = original; }
}

test('bot tự bắt chuyện: rủ người đứng gần oẳn tù tì; bỏ qua người ở xa, đang ngồi, đã tắt; mỗi người 10 phút một lần', async () => {
  const { room, bot, join, of, asked } = aiRoom({ challenge: 'An ơi, oẳn tù tì không?' });
  join('an', 'An', { x: 0, z: 40 });
  join('xa', 'Xa', { x: 0, z: 70 });
  join('tat', 'Tắt', { x: 2, z: 41 });
  room.setBotQuiet('tat', true);
  const plan = withRandom(0.1, () => room.botApproach());
  assert.deepEqual([plan.botId, plan.personId, plan.kind], ['b-1', 'an', 'challenge']);
  assert.ok(bot.talkUntil > Date.now() && bot.walk.waitUntil > Date.now(), 'bot đứng lại chờ trả lời');
  await plan.done;
  assert.deepEqual(asked.map(({ kind, toName, botName, lang }) => [kind, toName, botName, lang]), [['challenge', 'An', 'Sen Nhỏ', 'vi']]);
  const said = of('an', 'chat.message').at(-1);
  assert.deepEqual([said.participantId, said.text], ['b-1', 'An ơi, oẳn tù tì không?']);
  const challenge = of('an', 'challenge.state').at(-1);
  assert.deepEqual([challenge.fromId, challenge.toId, challenge.status], ['b-1', 'an', 'pending']);
  assert.equal(of('tat', 'challenge.state').length, 0);
  room.challengeRespond('an', challenge.challengeId, false);
  bot.talkUntil = 0;
  assert.equal(withRandom(0.1, () => room.botApproach()), null, 'An vừa được bắt chuyện; Tắt đã tắt; Xa ở xa');
  room.close();
});

test('bot mời sang phòng game (game.invite chỉ tới người được mời); nhắn bot thì AI trả lời, nhắc phòng game / oẳn tù tì thì bot mời luôn', async () => {
  const { room, join, of, asked } = aiRoom({ reply: 'Được chứ An, qua Lô Tô nhé 🎲' });
  join('an', 'An', { x: 0, z: 40 });
  join('binh', 'Bình');
  const plan = withRandom(0.5, () => room.botApproach());
  assert.deepEqual([plan.kind, plan.game], ['invite', 'tai-xiu']);
  await plan.done;
  const invite = of('an', 'game.invite').at(-1);
  assert.deepEqual([invite.fromId, invite.game], ['b-1', 'tai-xiu']);
  assert.equal(parseServerMessage(invite).ok, true);
  assert.equal(of('binh', 'game.invite').length, 0);

  const started = Date.now();
  const line = await room.botReply(room.participants.get('an'), room.participants.get('b-1'), '@Sen Nhỏ chơi lô tô không bạn');
  assert.ok(Date.now() - started >= 1_400, 'chờ như đang gõ');
  assert.equal(line, 'Được chứ An, qua Lô Tô nhé 🎲');
  assert.equal(of('binh', 'chat.message').at(-1).text, line, 'cả phòng thấy bot nói');
  assert.equal(of('an', 'game.invite').at(-1).game, 'loto');
  const last = asked.at(-1);
  assert.equal(last.kind, 'reply');
  assert.deepEqual(last.history.map((turn) => [turn.bot, turn.text]), [[true, 'câu invite'], [false, 'chơi lô tô không bạn']]);

  await room.botReply(room.participants.get('an'), room.participants.get('b-1'), '@Sen Nhỏ oẳn tù tì nhé');
  assert.equal(of('an', 'challenge.state').at(-1).fromId, 'b-1');
  room.close();
});

test('bot nói theo ngôn ngữ người chơi vừa gõ: AI được dặn theo câu mẫu của họ; câu mẫu dự phòng đoán ngôn ngữ', async () => {
  assert.deepEqual(['chào bạn nhé', 'hello, want to play?', '¿quieres jugar?', '你好', 'ok 123'].map(guessLang), ['vi', 'en', 'es', 'zh', null]);
  const bodies = [];
  const ai = createBotAi({ apiKey: 'k', fetcher: async (url, init) => { bodies.push(JSON.parse(init.body)); throw new Error('mạng lỗi'); } });
  const line = await ai.line('challenge', { lang: 'vi', botName: 'Sen Nhỏ', toName: 'Tom', sample: 'hello, are you a bot?' });
  assert.match(bodies[0].messages[0].content, /Tom vừa viết: "hello, are you a bot\?"\. BẮT BUỘC viết toàn bộ câu bằng đúng ngôn ngữ/);
  assert.equal(bodies[0].max_completion_tokens, 120);
  assert.match(line, /rock-paper-scissors/, 'dự phòng: câu mẫu tiếng Anh dù phòng tiếng Việt');
  assert.match(await createBotAi().line('greet', { lang: 'en', toName: 'Mai', sample: 'xin chào' }), /Mai/);

  const { room, join, asked } = aiRoom();
  join('tom', 'Tom', { x: 0, z: 40 });
  room.participants.get('tom').lastChat = 'hello everyone';
  await withRandom(0.9, () => room.botApproach()).done;
  assert.equal(asked.at(-1).sample, 'hello everyone');
  room.close();
});

test('câu bot nói với thành viên (bắt chuyện, trả lời) được gửi API để lưu cuộc trò chuyện riêng; khách thì không', async () => {
  const { room, join, forwarded } = aiRoom({ greet: 'Chào An 🙏', reply: 'Mình khỏe, cảm ơn An' });
  join('an', 'An', { x: 0, z: 40 }, 'a-an-00000001');
  join('khach', 'Khách', { x: 0, z: 70 });
  await withRandom(0.9, () => room.botApproach()).done;
  await room.botReply(room.participants.get('an'), room.participants.get('b-1'), '@Sen Nhỏ bạn khỏe không');
  await room.botReply(room.participants.get('khach'), room.participants.get('b-1'), '@Sen Nhỏ chào');
  assert.deepEqual(forwarded.filter((event) => event.fromBot).map(({ accountId, botName, fromName, text }) => [accountId, botName, fromName, text]), [
    ['a-an-00000001', 'Sen Nhỏ', 'An', 'Chào An 🙏'],
    ['a-an-00000001', 'Sen Nhỏ', 'An', 'Mình khỏe, cảm ơn An'],
  ]);
  room.close();
});
