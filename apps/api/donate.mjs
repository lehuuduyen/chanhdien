// Trang Ủng hộ (quyên góp tự nguyện để duy trì server). Thông tin nhận tiền KHÔNG ghi trong repo: đặt bằng biến môi
// trường trên máy chạy API. Khoản góp không đổi ra xu hay quyền lợi gì trong game.
//
//   DONATE_ZELLE_NAME     tên người nhận hiện trong app ngân hàng (vd: "Chanh Dien Online")
//   DONATE_ZELLE_HANDLE   email hoặc số điện thoại Zelle
//   DONATE_MEMO           lời nhắn gợi ý (mặc định "Ung ho Chanh Dien Online")
//   DONATE_MONTHLY_GOAL   chi phí server mỗi tháng (USD, số nguyên) — có thì hiện thanh mục tiêu
//   DONATE_MONTH_RAISED   số đầu kỳ (USD, số nguyên); sau đó Telegram `donate 1` cộng và lưu trong SQLite
//   DONATE_CONTACT        email liên hệ (tùy chọn)
//   TELEGRAM_WEBHOOK_SECRET khóa Telegram gửi trong header; TELEGRAM_CHAT_ID là chat duy nhất được phép cập nhật
import { timingSafeEqual } from 'node:crypto';
import { internalKey } from '@chanh-dien/session-token';
import { json, readJson } from './http.mjs';
import { MODERATION_HELP, moderationTelegramCommand } from './moderation.mjs';

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const amount = (value) => (/^\d{1,7}$/.test(String(value ?? '')) ? Number(value) : null);

export function donateConfig(env = process.env) {
  const name = text(env.DONATE_ZELLE_NAME, 80);
  const handle = text(env.DONATE_ZELLE_HANDLE, 120);
  return {
    zelle: name && handle ? { name, handle } : null,
    memo: text(env.DONATE_MEMO, 60) || 'Ung ho Chanh Dien Online',
    goal: amount(env.DONATE_MONTHLY_GOAL),
    raised: amount(env.DONATE_MONTH_RAISED),
    contact: text(env.DONATE_CONTACT, 120),
  };
}

const monthOf = (timestamp) => new Date(timestamp).toISOString().slice(0, 7);
const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Dùng chung database tài khoản để tiến độ không mất sau deploy. update_id là khóa idempotency của Telegram:
// Telegram gửi lại cùng update khi webhook timeout cũng không cộng tiền lần hai.
export function createDonateStore({ db, config = donateConfig({}), now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS donation_progress (
      month TEXT PRIMARY KEY,
      raised INTEGER NOT NULL CHECK (raised >= 0),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telegram_donate_updates (
      update_id INTEGER PRIMARY KEY,
      chat_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      month TEXT NOT NULL,
      raised_after INTEGER NOT NULL CHECK (raised_after >= 0),
      at INTEGER NOT NULL
    );`);
  const q = {
    month: db.prepare('SELECT raised, updated_at FROM donation_progress WHERE month = ?'),
    monthCount: db.prepare('SELECT COUNT(*) AS count FROM donation_progress'),
    insertMonth: db.prepare('INSERT OR IGNORE INTO donation_progress (month, raised, updated_at) VALUES (?, ?, ?)'),
    add: db.prepare('UPDATE donation_progress SET raised = raised + ?, updated_at = ? WHERE month = ?'),
    update: db.prepare('SELECT update_id AS updateId, amount, month, raised_after AS raisedAfter FROM telegram_donate_updates WHERE update_id = ?'),
    saveUpdate: db.prepare(`INSERT INTO telegram_donate_updates
      (update_id, chat_id, amount, month, raised_after, at) VALUES (?, ?, ?, ?, ?, ?)`),
  };

  function ensureMonth(month, at) {
    const seed = q.monthCount.get().count === 0 ? (config.raised || 0) : 0;
    q.insertMonth.run(month, seed, at);
    return q.month.get(month);
  }

  function snapshot() {
    const at = now();
    const month = monthOf(at);
    const row = ensureMonth(month, at);
    return { ...config, raised: row.raised, month };
  }

  function addFromTelegram(updateId, chatId, value) {
    const amountValue = Number(value);
    if (!Number.isSafeInteger(updateId) || updateId < 0 || typeof chatId !== 'string'
      || !Number.isSafeInteger(amountValue) || amountValue < 1 || amountValue > 1_000_000) {
      return { ok: false, code: 'INVALID' };
    }
    const previous = q.update.get(updateId);
    if (previous) return { ok: true, ...previous, replayed: true };
    const at = now();
    const month = monthOf(at);
    db.exec('BEGIN IMMEDIATE');
    try {
      const raced = q.update.get(updateId);
      if (raced) {
        db.exec('COMMIT');
        return { ok: true, ...raced, replayed: true };
      }
      ensureMonth(month, at);
      q.add.run(amountValue, at, month);
      const raisedAfter = q.month.get(month).raised;
      q.saveUpdate.run(updateId, chatId, amountValue, month, raisedAfter, at);
      db.exec('COMMIT');
      return { ok: true, updateId, amount: amountValue, month, raisedAfter, replayed: false };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { snapshot, addFromTelegram };
}

export function openDonateStore(accounts, config, options = {}) {
  return accounts ? createDonateStore({ db: accounts.database, config, ...options }) : null;
}

export function handleDonateRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/donate') return false;
  if (req.method !== 'GET') {
    json(req, res, 405, { error: 'method_not_allowed' });
    return true;
  }
  json(req, res, 200, options.donateStore?.snapshot() || options.donate || donateConfig({}));
  return true;
}

// API chỉ chuyển lệnh quản trị sang máy realtime qua mạng nội bộ. Khóa được suy ra từ SESSION_SECRET như các
// endpoint nội bộ khác; Telegram không bao giờ nhận được khóa này.
export function realtimeBotController(realtimeInternalUrl, secret, fetcher = fetch) {
  if (!realtimeInternalUrl || !secret) return null;
  return (total) => fetcher(new URL('/internal/bots', realtimeInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(secret) },
    body: JSON.stringify({ total }),
    signal: AbortSignal.timeout(5_000),
  }).then(async (response) => {
    const result = await response.json().catch(() => null);
    return response.ok ? result : null;
  }).catch(() => null);
}

// Webhook chỉ nhận từ Telegram có secret header và chỉ cho đúng TELEGRAM_CHAT_ID. Cú pháp:
//   donate 1       (cộng 1 USD)
//   /donate 25     (cộng 25 USD)
//   xu tam.an +100 / xu tam.an -20
//   kimcuong tam.an +50 / kimcuong a-<uuid> -10
//   addbot 100     (chia tổng 100 bot vào các phòng; addbot 0 để tắt)
//   /blockchattu dm · /boblockchattu dm · /unban k-ab12cd34 · /ban tam.an 24 · /dsban (xem moderation.mjs)
// Trả method sendMessage ngay trong response để Telegram tự gửi xác nhận, không cần thêm một HTTP call.
export async function handleTelegramDonateRequest(req, res, pathname, options) {
  if (!['/api/v1/telegram', '/api/v1/telegram/donate'].includes(pathname)) return false;
  if (req.method !== 'POST' || !options.telegramWebhookSecret || !options.telegramChatId) {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!safeEqual(req.headers?.['x-telegram-bot-api-secret-token'], options.telegramWebhookSecret)) {
    json(req, res, 403, { error: 'forbidden' });
    return true;
  }
  let update;
  try {
    update = await readJson(req);
  } catch (error) {
    json(req, res, error.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'invalid_update' });
    return true;
  }
  const message = update?.message;
  const chatId = String(message?.chat?.id ?? '');
  if (!Number.isSafeInteger(update?.update_id) || chatId !== String(options.telegramChatId)) {
    json(req, res, 200, { ok: true });
    return true;
  }
  // Lệnh kiểm duyệt: /blockchattu dm, /unban k-…, /ban, /dsban…
  const by = message.from?.username ? `@${message.from.username}` : String(message.from?.first_name || 'Telegram').slice(0, 40);
  const moderationReply = moderationTelegramCommand(message.text, options.moderation, `Telegram ${by}`);
  if (moderationReply) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: moderationReply });
    return true;
  }
  const addBotMatch = typeof message.text === 'string'
    && /^\/?addbot(?:@[A-Za-z0-9_]+)?\s+(\d{1,4})$/i.exec(message.text.trim());
  if (addBotMatch) {
    const total = Number(addBotMatch[1]);
    if (!Number.isSafeInteger(total) || total > 1_000) {
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Số bot phải từ 0 đến 1000.' });
      return true;
    }
    const result = options.configureBots ? await options.configureBots(total) : null;
    if (!result || !Number.isSafeInteger(result.assigned)) {
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Máy realtime đang tạm mất kết nối, chưa đổi được số bot.' });
      return true;
    }
    const rooms = Array.isArray(result.rooms) ? result.rooms.filter((room) => room.bots > 0) : [];
    const allocation = rooms.map((room) => `${room.name || room.roomId}: ${room.bots}`).join(' · ');
    const capped = result.assigned < total ? ` (sức chứa hiện tại nhận ${result.assigned}/${total})` : '';
    json(req, res, 200, {
      method: 'sendMessage', chat_id: message.chat.id,
      text: total === 0
        ? '✅ Đã tắt toàn bộ bot do Telegram quản lý.'
        : `✅ Đã chia ${result.assigned} bot${capped}.${allocation ? `\n${allocation}` : ''}`,
    });
    return true;
  }
  const walletMatch = typeof message.text === 'string'
    && /^\/?(xu|coins?|kimcuong|diamonds?)(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_.-]{3,64})\s+([+-]?\d{1,7})$/i.exec(message.text.trim());
  if (walletMatch) {
    const [, command, target, rawAmount] = walletMatch;
    const account = options.accounts?.findByUsername(target) || options.accounts?.get(target);
    if (!account) {
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: `Không tìm thấy tài khoản: ${target}.` });
      return true;
    }
    const value = Number(rawAmount);
    const key = `telegram-${update.update_id}`;
    const diamonds = /^(kimcuong|diamonds?)$/i.test(command);
    const result = diamonds
      ? options.shopStore?.adjustDiamonds({ accountId: account.id, amount: value, key })
      : options.garden?.adjustCoins({ accountId: account.id, amount: value, key });
    if (!result) {
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Ví đang tạm tắt trên máy chủ.' });
      return true;
    }
    const balance = diamonds ? result.diamonds : result.coins;
    const unit = diamonds ? 'kim cương' : 'xu';
    if (!result.ok) {
      const reason = ['INSUFFICIENT_COINS', 'INSUFFICIENT_DIAMONDS'].includes(result.code || result.error)
        ? `Số dư không đủ để trừ. Hiện có ${balance} ${unit}.`
        : 'Số lượng không hợp lệ.';
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: reason });
      return true;
    }
    const signed = value > 0 ? `+${value}` : String(value);
    json(req, res, 200, {
      method: 'sendMessage', chat_id: message.chat.id,
      text: result.replayed
        ? `Tin này đã được xử lý trước đó. ${account.username || account.id}: ${balance} ${unit}.`
        : `✅ ${account.username || account.id}: ${signed} ${unit}. Số dư mới: ${balance}.`,
    });
    return true;
  }
  const match = typeof message.text === 'string' && /^\/?donate(?:@[A-Za-z0-9_]+)?\s+(\d{1,7})$/i.exec(message.text.trim());
  if (!match) {
    json(req, res, 200, {
      method: 'sendMessage', chat_id: message.chat.id,
      text: `Cú pháp:\ndonate 1\naddbot 100\naddbot 0\nxu <tài_khoản> +100\nxu <tài_khoản> -20\nkimcuong <tài_khoản> +50${options.moderation ? `\n\n${MODERATION_HELP}` : ''}`,
    });
    return true;
  }
  if (!options.donateStore) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Theo dõi quyên góp đang tạm tắt trên máy chủ.' });
    return true;
  }
  const result = options.donateStore.addFromTelegram(update.update_id, chatId, Number(match[1]));
  if (!result.ok) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Số tiền không hợp lệ.' });
    return true;
  }
  json(req, res, 200, {
    method: 'sendMessage', chat_id: message.chat.id,
    text: result.replayed
      ? `Tin này đã được tính trước đó. Tổng tháng ${result.month}: $${result.raisedAfter}.`
      : `✅ Đã cộng $${result.amount}. Tổng tháng ${result.month}: $${result.raisedAfter}.`,
  });
  return true;
}
