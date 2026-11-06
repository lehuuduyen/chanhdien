// Chat với bot qua Telegram: người chơi nhắn bot trong phòng (tin bắt đầu bằng "@Tên bot") → máy realtime chuyển tới
// đây → lưu một mã ngắn rồi báo nhóm Telegram quản trị. Quản trị trả lời bằng lệnh `/tl <mã> <nội dung>` (hoặc bấm
// Reply vào tin báo rồi gõ nội dung) → API gửi tới các máy realtime, máy đang giữ phòng cho bot nói câu đó trong phòng.
// Mã lưu trong SQLite (chung file tài khoản) để deploy lại API vẫn trả lời được tin cũ.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { thienRoomName } from '@chanh-dien/room-rules';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { json, readJson } from './http.mjs';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = /^[a-z0-9]{4,8}$/;
const KEEP_MS = 3 * 24 * 60 * 60_000;
const TEXT_MAX = 280;
const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const newCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const roomLabel = (roomId) => thienRoomName(roomId) || roomId;

export function createBotChatStore({ db, notify = null, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS bot_chats (
      code TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      from_name TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_chats_at ON bot_chats (at);`);
  const q = {
    insert: db.prepare('INSERT INTO bot_chats (code, room_id, bot_id, bot_name, from_name, text, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT code, room_id AS roomId, bot_id AS botId, bot_name AS botName, from_name AS fromName, text, at FROM bot_chats WHERE code = ?'),
    // Cùng người nhắn cùng bot trong 30 phút: dùng lại mã cũ (một cuộc trò chuyện một mã).
    // Mã bot (bot-1…) được dùng lại khi bot cũ rời phòng: so cả tên bot để không gộp nhầm sang bot mới.
    thread: db.prepare(`SELECT code FROM bot_chats WHERE room_id = ? AND bot_id = ? AND bot_name = ? AND from_name = ? AND at > ? ORDER BY at DESC LIMIT 1`),
    touch: db.prepare('UPDATE bot_chats SET text = ?, at = ? WHERE code = ?'),
    prune: db.prepare('DELETE FROM bot_chats WHERE at < ?'),
  };

  return {
    // Tin người chơi nhắn bot: lưu + báo Telegram. Trả mã trả lời.
    record({ roomId, botId, botName, fromName, text: message }) {
      const at = now();
      q.prune.run(at - KEEP_MS);
      let code = q.thread.get(roomId, botId, botName, fromName, at - 30 * 60_000)?.code;
      if (code) q.touch.run(message, at, code);
      else {
        for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
          const candidate = newCode();
          if (!q.get.get(candidate)) code = candidate;
        }
        q.insert.run(code, roomId, botId, botName, fromName, message, at);
      }
      notify?.([
        `💬 Nhắn bot · ${roomLabel(roomId)}`,
        `${fromName} → 🤖 ${botName}: "${message}"`,
        `Trả lời: /tl ${code} <nội dung>  (hoặc bấm Reply vào tin này rồi gõ)`,
      ].join('\n'));
      return code;
    },
    get: (code) => (CODE.test(String(code || '')) ? q.get.get(String(code).toLowerCase()) || null : null),
  };
}

export function openBotChatStore(accounts, notify = null) {
  return accounts ? createBotChatStore({ db: accounts.database, notify }) : null;
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
  const said = body.startsWith('@') ? body : `@${chat.fromName} ${body}`.slice(0, TEXT_MAX);
  const result = options.botSpeaker ? await options.botSpeaker({ roomId: chat.roomId, botId: chat.botId, botName: chat.botName, text: said }) : null;
  if (!result) return `🤖 ${chat.botName} đã rời ${roomLabel(chat.roomId)} (hoặc phòng đã đóng), chưa gửi được.`;
  return `✅ 🤖 ${chat.botName} đã nói trong ${roomLabel(chat.roomId)}: "${said}"`;
}

const internalAllowed = (req, options) => {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// Máy realtime báo một tin người chơi nhắn bot.
export async function handleBotChatRequest(req, res, pathname, options) {
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
  };
  if (!event.roomId || !event.botId || !event.botName || !event.fromName || !event.text) return json(req, res, 400, { error: 'invalid_bot_chat' }), true;
  return json(req, res, 200, { ok: true, code: options.botChats.record(event) }), true;
}
