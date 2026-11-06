import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
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
