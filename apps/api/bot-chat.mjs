// Chat với bot qua Telegram: người chơi nhắn bot trong phòng (tin bắt đầu bằng "@Tên bot") → máy realtime chuyển tới
// đây → lưu một mã ngắn rồi báo nhóm Telegram quản trị. Quản trị trả lời bằng lệnh `/tl <mã> <nội dung>` (hoặc bấm
// Reply vào tin báo rồi gõ nội dung) → API gửi tới các máy realtime, máy đang giữ phòng cho bot nói câu đó trong phòng.
// Mã lưu trong SQLite (chung file tài khoản) để deploy lại API vẫn trả lời được tin cũ.
// Cuộc trò chuyện của thành viên với từng bot (tin họ nhắn, câu bot trả lời / bắt chuyện, câu quản trị trả lời thay)
// lưu bảng bot_talk theo tên bot, chỉ trong ngày như lời nhắn bạn bè: màn 💬 Tin nhắn → Bạn bè hiện lại
// (GET /api/v1/me/bot-thread?name=<tên bot>).
// Nhắn riêng bạn bot như nhắn bạn bè (POST /api/v1/me/bot-thread { name, text }, bot không cần ở cùng phòng): lưu tin và
// báo Telegram; chỉ quản trị trả lời (/tl <mã>), câu trả lời vào thẳng cuộc trò chuyện và báo trang người nhận
// (inbox.notify). Nhắn chung trong phòng ("@Tên bot") thì AI ở máy realtime trả lời.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { dayStartOf, thienRoomName } from '@chanh-dien/room-rules';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { allow, currentAccount, sameOrigin } from './auth.mjs';
import { json, readJson } from './http.mjs';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = /^[a-z0-9]{4,8}$/;
const KEEP_MS = 3 * 24 * 60 * 60_000;
const TEXT_MAX = 280;
const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const newCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
// Tin nhắn riêng (màn Tin nhắn) không thuộc phòng nào: lưu bot_chats với roomId / botId = DIRECT.
const DIRECT = 'direct';
const roomLabel = (roomId) => (roomId === DIRECT ? 'Tin nhắn riêng' : thienRoomName(roomId) || roomId);
const DM_TEXT_MAX = 200;
const DM_BURST = [8, 60_000];
const ACCOUNT_ID = /^a-[a-zA-Z0-9-]{8,64}$/;
// Mỗi thành viên tối đa 400 tin với bot mỗi ngày (cả hai chiều); màn Tin nhắn hiện 50 tin gần nhất.
const TALK_DAY_MAX = 400;
const THREAD_MAX = 50;
// Tin nhắn bot bắt đầu bằng "@Tên bot": trong cuộc trò chuyện riêng chỉ giữ phần nội dung.
const withoutMention = (message, botName) => {
  const lower = message.toLowerCase();
  const tag = `@${botName}`.toLowerCase();
  return (lower.startsWith(tag) ? message.slice(tag.length).replace(/^[\s,:.!?]+/, '').trim() : message) || message;
};

export function createBotChatStore({ db, notify = null, now = Date.now, timeZone = 'America/Los_Angeles' }) {
  db.exec(`CREATE TABLE IF NOT EXISTS bot_chats (
      code TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      from_name TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_chats_at ON bot_chats (at);
    CREATE TABLE IF NOT EXISTS bot_talk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      from_bot INTEGER NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_talk_thread ON bot_talk (account_id, bot_name, at);
    CREATE INDEX IF NOT EXISTS bot_talk_at ON bot_talk (at);`);
  // Bảng cũ chưa có cột account_id (người nhắn là thành viên nào): quản trị trả lời bằng /tl thì lưu vào cuộc trò chuyện.
  if (!db.prepare('PRAGMA table_info(bot_chats)').all().some((column) => column.name === 'account_id')) {
    db.exec('ALTER TABLE bot_chats ADD COLUMN account_id TEXT');
  }
  const q = {
    insert: db.prepare('INSERT INTO bot_chats (code, room_id, bot_id, bot_name, from_name, text, at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT code, room_id AS roomId, bot_id AS botId, bot_name AS botName, from_name AS fromName, text, at, account_id AS accountId FROM bot_chats WHERE code = ?'),
    // Cùng người nhắn cùng bot trong 30 phút: dùng lại mã cũ (một cuộc trò chuyện một mã).
    // Mã bot (bot-1…) được dùng lại khi bot cũ rời phòng: so cả tên bot để không gộp nhầm sang bot mới.
    thread: db.prepare(`SELECT code FROM bot_chats WHERE room_id = ? AND bot_id = ? AND bot_name = ? AND from_name = ? AND at > ? ORDER BY at DESC LIMIT 1`),
    touch: db.prepare('UPDATE bot_chats SET text = ?, at = ?, account_id = COALESCE(?, account_id) WHERE code = ?'),
    prune: db.prepare('DELETE FROM bot_chats WHERE at < ?'),
    talk: db.prepare('INSERT INTO bot_talk (account_id, bot_name, from_bot, text, at) VALUES (?, ?, ?, ?, ?)'),
    talkCount: db.prepare('SELECT COUNT(*) AS n FROM bot_talk WHERE account_id = ? AND at >= ?'),
    talkThread: db.prepare(`SELECT id, from_bot AS fromBot, text, at FROM bot_talk
      WHERE account_id = ? AND bot_name = ? AND at >= ? ORDER BY at DESC, id DESC LIMIT ${THREAD_MAX}`),
    talkPrune: db.prepare('DELETE FROM bot_talk WHERE at < ?'),
    talkLatest: db.prepare(`SELECT bot_name AS botName, from_bot AS fromBot, text, at FROM bot_talk
      WHERE account_id = ? AND at >= ? ORDER BY at DESC, id DESC LIMIT 400`),
  };
  const today = () => dayStartOf(now(), timeZone);
  let prunedAt = 0;

  // Một câu trong cuộc trò chuyện riêng của thành viên với bot (khách không có tài khoản thì không lưu).
  function talk(accountId, botName, fromBot, message) {
    if (!ACCOUNT_ID.test(String(accountId || '')) || !botName || !message) return false;
    const since = today();
    if (now() - prunedAt >= 60_000) {
      prunedAt = now();
      q.talkPrune.run(since);
    }
    if (q.talkCount.get(accountId, since).n >= TALK_DAY_MAX) return false;
    q.talk.run(accountId, botName, fromBot ? 1 : 0, fromBot ? message : withoutMention(message, botName), now());
    return true;
  }

  return {
    talk,
    // Cuộc trò chuyện hôm nay với một bot (cũ trước).
    thread: (accountId, botName) => q.talkThread.all(accountId, botName, today()).reverse()
      .map((row) => ({ id: row.id, mine: !row.fromBot, text: row.text, at: row.at })),
    // Tin cuối hôm nay với từng bot: Map tên bot → { text, at, mine } (danh sách bạn bè hiện như bạn là người).
    lastByBot(accountId) {
      const last = new Map();
      for (const row of q.talkLatest.all(accountId, today())) {
        if (!last.has(row.botName)) last.set(row.botName, { text: row.text, at: row.at, mine: !row.fromBot });
      }
      return last;
    },
    // Tin người chơi nhắn bot: lưu + báo Telegram. Trả mã trả lời.
    record({ roomId, botId, botName, fromName, accountId = null, text: message }) {
      const at = now();
      q.prune.run(at - KEEP_MS);
      const member = ACCOUNT_ID.test(String(accountId || '')) ? accountId : null;
      let code = q.thread.get(roomId, botId, botName, fromName, at - 30 * 60_000)?.code;
      if (code) q.touch.run(message, at, member, code);
      else {
        for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
          const candidate = newCode();
          if (!q.get.get(candidate)) code = candidate;
        }
        q.insert.run(code, roomId, botId, botName, fromName, message, at, member);
      }
      if (member) talk(member, botName, false, message);
      notify?.([
        `💬 Nhắn bot · ${roomLabel(roomId)}${roomId === DIRECT ? ' (bot không cần ở trong phòng)' : ''}`,
        `${fromName} → 🤖 ${botName}: "${message}"`,
        `Trả lời: /tl ${code} <nội dung>  (hoặc bấm Reply vào tin này rồi gõ)`,
      ].join('\n'));
      return code;
    },
    get: (code) => (CODE.test(String(code || '')) ? q.get.get(String(code).toLowerCase()) || null : null),
  };
}

export function openBotChatStore(accounts, notify = null) {
  return accounts ? createBotChatStore({ db: accounts.database, notify, timeZone: process.env.GARDEN_TIMEZONE || 'America/Los_Angeles' }) : null;
}

// Gửi câu trả lời tới mọi máy realtime; máy đang giữ phòng (bot còn trong phòng) trả 200.
export function realtimeBotSpeaker(realtimeInternalUrls, secret, fetcher = fetch) {
  const urls = (Array.isArray(realtimeInternalUrls) ? realtimeInternalUrls : String(realtimeInternalUrls || '').split(','))
    .map((value) => String(value).trim()).filter(Boolean);
  if (!urls.length || !secret) return null;
  return async ({ roomId, botId, botName, text: message }) => {
    const results = await Promise.all(urls.map((baseUrl) => fetcher(new URL('/internal/bot-say', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(secret) },
      body: JSON.stringify({ roomId, botId, botName, text: message }),
      signal: AbortSignal.timeout(5_000),
    }).then(async (response) => (response.ok ? response.json().catch(() => null) : null)).catch(() => null)));
    return results.find((result) => result?.ok) || null;
  };
}

// Lệnh Telegram: "/tl <mã> <nội dung>", hoặc Reply vào tin báo (tin có "/tl <mã>") rồi gõ nội dung.
// Trả câu xác nhận cho nhóm, hoặc null nếu không phải lệnh trả lời bot.
export async function botChatTelegramCommand(message, options) {
  const input = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!input || !options.botChats) return null;
  let code = null;
  let reply = null;
  const command = /^\/?tl(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9]{4,8}))?(?:\s+([\s\S]+))?$/i.exec(input);
  if (command) {
    code = command[1] || null;
    reply = command[2] || null;
    // Reply vào tin báo và gõ "/tl nội dung" (không mã): lấy mã từ tin được trả lời.
    if (code && !options.botChats.get(code)) {
      reply = input.replace(/^\/?tl(?:@[A-Za-z0-9_]+)?\s*/i, '');
      code = null;
    }
  } else if (!input.startsWith('/')) reply = input;
  const quoted = /\/tl\s+([a-z0-9]{4,8})\b/i.exec(message.reply_to_message?.text || '')?.[1];
  if (!code) code = quoted || null;
  // Tin thường không trả lời tin báo nào: không phải việc của bot chat.
  if (!command && !quoted) return null;
  if (!code) return 'Cú pháp: /tl <mã> <nội dung> (mã nằm trong tin báo "Nhắn bot"), hoặc bấm Reply vào tin báo rồi gõ nội dung.';
  const chat = options.botChats.get(code);
  if (!chat) return `Không tìm thấy mã ${code} (tin nhắn quá 3 ngày hoặc gõ sai mã).`;
  const body = text(reply, TEXT_MAX);
  if (!body) return `Thiếu nội dung. Ví dụ: /tl ${code} Chào bạn, chúc bạn an lạc 🙏`;
  // Nhắc tên người hỏi để họ biết bot đang trả lời mình (trừ khi quản trị đã tự gõ @).
  // Tin nhắn riêng: lưu thẳng vào cuộc trò chuyện (không cần bot ở phòng nào) và báo trang người nhận.
  if (chat.roomId === DIRECT) {
    if (!chat.accountId || !options.botChats.talk(chat.accountId, chat.botName, true, body)) return `Chưa lưu được câu trả lời cho ${chat.fromName}.`;
    options.notifyInbox?.(chat.accountId, 'note');
    return `✅ 🤖 ${chat.botName} đã trả lời tin nhắn riêng của ${chat.fromName}: "${body}"`;
  }
  const said = body.startsWith('@') ? body : `@${chat.fromName} ${body}`.slice(0, TEXT_MAX);
  const result = options.botSpeaker ? await options.botSpeaker({ roomId: chat.roomId, botId: chat.botId, botName: chat.botName, text: said }) : null;
  if (!result) return `🤖 ${chat.botName} đã rời ${roomLabel(chat.roomId)} (hoặc phòng đã đóng), chưa gửi được.`;
  if (chat.accountId) options.botChats.talk(chat.accountId, chat.botName, true, said);
  return `✅ 🤖 ${chat.botName} đã nói trong ${roomLabel(chat.roomId)}: "${said}"`;
}

// Thành viên nhắn riêng một bạn bot: lưu + báo Telegram. Quản trị trả lời bằng /tl thì tin tới sau (inbox.notify).
async function sendDirect(req, res, account, options) {
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'forbidden_origin' });
  if (!allow(options, `bot-dm:${account.id}`, DM_BURST)) return json(req, res, 429, { error: 'rate_limited' });
  let input;
  try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }); }
  const name = text(input?.name, 40);
  const said = text(input?.text, DM_TEXT_MAX);
  if (!name) return json(req, res, 400, { error: 'invalid_bot' });
  if (!said) return json(req, res, 400, { error: 'empty_note' });
  if (!options.friendLinks?.botFriends(account.id).some((bot) => bot.name === name)) return json(req, res, 403, { error: 'not_friends' });
  // Qua bộ lọc chữ và sổ khóa như chat / lời nhắn bạn bè.
  if (options.moderation?.restriction({ accountId: account.id })) return json(req, res, 403, { error: 'chat_restricted' });
  if (options.moderation?.check(said).action === 'block') return json(req, res, 400, { error: 'text_not_allowed' });
  const botChats = options.botChats;
  const before = botChats.thread(account.id, name);
  botChats.record({ roomId: DIRECT, botId: DIRECT, botName: name, fromName: account.displayName, accountId: account.id, text: said });
  const items = botChats.thread(account.id, name);
  // Quá 400 tin hôm nay thì record không lưu thêm.
  if (items.at(-1)?.id === before.at(-1)?.id) return json(req, res, 429, { error: 'rate_limited' });
  json(req, res, 200, { ok: true, items });
}

const internalAllowed = (req, options) => {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// Máy realtime báo một tin người chơi nhắn bot, hoặc (fromBot) một câu bot nói với thành viên.
// Trang hỏi cuộc trò chuyện với một bot: GET /api/v1/me/bot-thread?name=<tên bot>.
export async function handleBotChatRequest(req, res, pathname, options) {
  if (pathname === '/api/v1/me/bot-thread') {
    if (req.method !== 'GET' && req.method !== 'POST') return json(req, res, 405, { error: 'method_not_allowed' }), true;
    if (!options.botChats) return json(req, res, 503, { error: 'bot_chat_disabled' }), true;
    const account = currentAccount(req, options);
    if (!account) return json(req, res, 401, { error: 'not_signed_in' }), true;
    if (req.method === 'POST') {
      await sendDirect(req, res, account, options);
      return true;
    }
    const name = text(new URL(req.url, 'http://local').searchParams.get('name'), 40);
    if (!name) return json(req, res, 400, { error: 'invalid_bot' }), true;
    return json(req, res, 200, { ok: true, items: options.botChats.thread(account.id, name) }), true;
  }
  if (pathname !== '/internal/bot-chat') return false;
  if (req.method !== 'POST' || !internalAllowed(req, options)) return json(req, res, 403, { error: 'forbidden' }), true;
  if (!options.botChats) return json(req, res, 503, { error: 'bot_chat_disabled' }), true;
  let input;
  try { input = await readJson(req); } catch { return json(req, res, 400, { error: 'invalid_json' }), true; }
  const id = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
  const event = {
    roomId: id.test(input?.roomId || '') ? input.roomId : null,
    botId: id.test(input?.botId || '') ? input.botId : null,
    botName: text(input?.botName, 40),
    fromName: text(input?.fromName, 40),
    text: text(input?.text, TEXT_MAX),
    accountId: ACCOUNT_ID.test(String(input?.accountId || '')) ? input.accountId : null,
  };
  if (!event.roomId || !event.botId || !event.botName || !event.fromName || !event.text) return json(req, res, 400, { error: 'invalid_bot_chat' }), true;
  // Câu bot nói với thành viên: chỉ lưu vào cuộc trò chuyện, không báo Telegram.
  if (input.fromBot === true) {
    if (!event.accountId) return json(req, res, 400, { error: 'invalid_bot_chat' }), true;
    return json(req, res, 200, { ok: true, saved: options.botChats.talk(event.accountId, event.botName, true, event.text) }), true;
  }
  return json(req, res, 200, { ok: true, code: options.botChats.record(event) }), true;
}
