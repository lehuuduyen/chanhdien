import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createSessionToken, internalKey } from '@chanh-dien/session-token';
import { createBotChatStore } from '../bot-chat.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const HOOK = 'telegram-hook-secret';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

function setup({ speaks = true } = {}) {
  const accounts = createAccountStore();
  const sent = [];
  const spoken = [];
  const options = {
    secret: SECRET, accounts, telegramWebhookSecret: HOOK, telegramChatId: '-100',
    botChats: createBotChatStore({ db: accounts.database, notify: (text) => sent.push(text) }),
    botSpeaker: async (event) => {
      spoken.push(event);
      return speaks ? { ok: true, botName: 'Sen Nhỏ' } : null;
    },
  };
  return { options, sent, spoken };
}

const forward = (options, body) => request(options, 'POST', '/internal/bot-chat', { body, headers: { 'x-internal-key': internalKey(SECRET) } });
let updateId = 1;
const telegram = (options, message) => request(options, 'POST', '/api/v1/telegram', {
  headers: { 'x-telegram-bot-api-secret-token': HOOK },
  body: { update_id: updateId += 1, message: { chat: { id: -100 }, from: { username: 'quantri' }, ...message } },
});
const chat = { roomId: 'thien-az-vi-1', botId: 'b-7', botName: 'Sen Nhỏ', fromId: 'u-1', fromName: 'Anh', text: '@Sen Nhỏ chào bạn' };

test('tin nhắn bot: báo Telegram kèm mã; /tl <mã> <nội dung> thì bot nói trong phòng (nhắc tên người hỏi)', async () => {
  const { options, sent, spoken } = setup();
  assert.equal((await request(options, 'POST', '/internal/bot-chat', { body: chat })).status, 403, 'thiếu khóa nội bộ');
  const recorded = await forward(options, chat);
  assert.equal(recorded.status, 200);
  const code = recorded.json.code;
  assert.match(code, /^[a-z0-9]{5}$/);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /💬 Nhắn bot · Arizona · PV1\nAnh → 🤖 Sen Nhỏ: "@Sen Nhỏ chào bạn"\nTrả lời: \/tl [a-z0-9]{5} <nội dung>/);
  // Cùng người nhắn tiếp: giữ mã cũ (một cuộc trò chuyện một mã).
  assert.equal((await forward(options, { ...chat, text: '@Sen Nhỏ bạn ở đâu' })).json.code, code);

  const reply = await telegram(options, { text: `/tl ${code} Chào Anh, chúc bạn an lạc 🙏` });
  assert.deepEqual(spoken, [{ roomId: 'thien-az-vi-1', botId: 'b-7', botName: 'Sen Nhỏ', text: '@Anh Chào Anh, chúc bạn an lạc 🙏' }]);
  // Mã bot b-7 nay là bot khác (bot cũ đã rời): cuộc trò chuyện mới, mã mới.
  assert.notEqual((await forward(options, { ...chat, botName: 'Mây Trắng' })).json.code, code);
  assert.match(reply.json.text, /✅ 🤖 Sen Nhỏ đã nói trong Arizona · PV1: "@Anh Chào Anh/);
});

test('Reply vào tin báo rồi gõ nội dung (không cần mã); mã sai / thiếu nội dung / bot đã rời thì báo rõ', async () => {
  const { options, spoken } = setup();
  const code = (await forward(options, chat)).json.code;
  const notice = { text: `💬 Nhắn bot · Arizona · PV1\nAnh → 🤖 Sen Nhỏ: "chào"\nTrả lời: /tl ${code} <nội dung>` };
  await telegram(options, { text: 'Chào bạn nhé', reply_to_message: notice });
  await telegram(options, { text: '/tl chao ban', reply_to_message: notice });
  assert.deepEqual(spoken.map((item) => item.text), ['@Anh Chào bạn nhé', '@Anh chao ban']);
  assert.match((await telegram(options, { text: '/tl zzzzz xin chào' })).json.text, /Cú pháp: \/tl <mã> <nội dung>|Không tìm thấy mã/);
  assert.match((await telegram(options, { text: `/tl ${code}` })).json.text, /Thiếu nội dung/);
  assert.match((await telegram(options, { text: `/tl ${code} @Bình tự gõ tên` })).json.text, /"@Bình tự gõ tên"/, 'tự gõ @ thì không thêm tên');
  const gone = setup({ speaks: false });
  const goneCode = (await forward(gone.options, chat)).json.code;
  assert.match((await telegram(gone.options, { text: `/tl ${goneCode} còn đó không` })).json.text, /đã rời Arizona · PV1/);
});

test('cuộc trò chuyện với bot: tin thành viên nhắn, câu bot nói và câu quản trị trả lời thay đều lưu theo tài khoản + tên bot', async () => {
  const { options } = setup();
  const anh = options.accounts.register({ username: 'anh.anh', password: 'matkhau123', displayName: 'Anh' }).account;
  const binh = options.accounts.register({ username: 'binh.binh', password: 'matkhau123', displayName: 'Bình' }).account;
  const as = (account) => ({ cookie: `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}` });
  const thread = async (account, name = 'Sen Nhỏ') => (await request(options, 'GET', `/api/v1/me/bot-thread?name=${encodeURIComponent(name)}`, { headers: as(account) })).json;

  assert.equal((await request(options, 'GET', '/api/v1/me/bot-thread?name=Sen')).status, 401, 'khách không có cuộc trò chuyện lưu');
  const code = (await forward(options, { ...chat, accountId: anh.id })).json.code;
  assert.equal((await forward(options, { ...chat, accountId: anh.id, text: 'Chào Anh, hôm nay bạn khỏe không?', fromBot: true })).json.saved, true);
  assert.equal((await forward(options, { ...chat, text: 'thiếu tài khoản', fromBot: true })).status, 400);
  await telegram(options, { text: `/tl ${code} Mình là Sen 🙏` });
  // Khách (không có accountId) nhắn bot: vẫn báo Telegram nhưng không lưu cuộc trò chuyện.
  await forward(options, { ...chat, fromName: 'Khách', text: '@Sen Nhỏ xin chào' });

  const items = (await thread(anh)).items;
  assert.deepEqual(items.map(({ mine, text }) => [mine, text]), [
    [true, 'chào bạn'],
    [false, 'Chào Anh, hôm nay bạn khỏe không?'],
    [false, '@Anh Mình là Sen 🙏'],
  ]);
  assert.deepEqual((await thread(binh)).items, [], 'người khác không thấy');
  assert.deepEqual((await thread(anh, 'Mây Trắng')).items, [], 'bot khác là cuộc trò chuyện khác');
});

test('bảng bot_chats cũ (chưa có cột account_id) được thêm cột, mã cũ vẫn trả lời được', () => {
  const accounts = createAccountStore();
  accounts.database.exec(`CREATE TABLE bot_chats (code TEXT PRIMARY KEY, room_id TEXT NOT NULL, bot_id TEXT NOT NULL, bot_name TEXT NOT NULL,
    from_name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
    INSERT INTO bot_chats VALUES ('abcde', 'thien-1', 'b-1', 'Sen Nhỏ', 'Anh', 'chào', ${Date.now()});`);
  const store = createBotChatStore({ db: accounts.database });
  assert.equal(store.get('abcde').accountId, null);
  assert.equal(store.get('abcde').botName, 'Sen Nhỏ');
});

test('nhắn riêng bạn bot như bạn bè: không cần ở cùng phòng, chỉ báo Telegram (không AI); /tl trả lời thẳng vào cuộc trò chuyện', async () => {
  const { createFriendLinks } = await import('../friend-links.mjs');
  const { THIEN_RULES } = await import('@chanh-dien/room-rules');
  const { options, sent, spoken } = setup();
  const bot = THIEN_RULES.bots.names[0];
  const notified = [];
  Object.assign(options, {
    friendLinks: createFriendLinks({ db: options.accounts.database, accounts: options.accounts, secret: SECRET }),
    notifyInbox: (accountId, kind) => notified.push([accountId, kind]),
  });
  const anh = options.accounts.register({ username: 'anh.dm', password: 'matkhau123', displayName: 'Anh' }).account;
  const headers = { cookie: `cd_session=${createSessionToken({ accountId: anh.id, version: anh.sessionVersion ?? 0 }, SECRET)}` };
  const send = (body) => request(options, 'POST', '/api/v1/me/bot-thread', { body, headers });
  const thread = async () => (await request(options, 'GET', `/api/v1/me/bot-thread?name=${encodeURIComponent(bot)}`, { headers })).json.items;

  assert.equal((await request(options, 'POST', '/api/v1/me/bot-thread', { body: { name: bot, text: 'chào' } })).status, 401);
  assert.equal((await send({ name: bot, text: 'chào' })).json.error, 'not_friends', 'chỉ nhắn được bạn đã kết');
  assert.equal(options.friendLinks.addBotFriend(anh.id, bot).ok, true);
  assert.equal((await send({ name: bot, text: '   ' })).json.error, 'empty_note');
  assert.equal((await request(options, 'POST', '/api/v1/me/bot-thread', { body: { name: bot, text: 'chào' }, headers: { ...headers, origin: 'https://evil.test' } })).status, 403, 'khác origin');

  const done = await send({ name: bot, text: 'Hôm nay bạn có đi chùa không?' });
  assert.equal(done.status, 200);
  assert.equal(done.json.items.at(-1).text, 'Hôm nay bạn có đi chùa không?');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual((await thread()).map((item) => item.mine), [true], 'không có câu tự trả lời: chờ quản trị');
  assert.deepEqual(spoken, [], 'tin riêng không bắt bot nói trong phòng nào');
  assert.match(sent.at(-1), /💬 Nhắn bot · Tin nhắn riêng/);
  assert.match(sent.at(-1), /Anh → 🤖 .*: "Hôm nay bạn có đi chùa không\?"/);

  const code = /\/tl ([a-z0-9]{5})/.exec(sent.at(-1))[1];
  const reply = await telegram(options, { text: `/tl ${code} Có chứ, chiều nay mình lên chùa 🙏` });
  assert.match(reply.json.text, /đã trả lời tin nhắn riêng của Anh/);
  assert.deepEqual(notified.at(-1), [anh.id, 'note'], 'báo trang người nhận có tin mới');
  const after = await thread();
  assert.deepEqual(after.map(({ mine, text }) => [mine, text]), [[true, 'Hôm nay bạn có đi chùa không?'], [false, 'Có chứ, chiều nay mình lên chùa 🙏']]);
  // Danh sách bạn bè: bạn bot kèm tin cuối như bạn là người.
  const friends = (await request(options, 'GET', '/api/v1/me/friends', { headers })).json;
  assert.deepEqual(friends.botFriends.map((item) => [item.name, item.last?.text, item.last?.mine]), [[bot, 'Có chứ, chiều nay mình lên chùa 🙏', false]]);
});
