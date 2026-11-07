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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getRoomRules, ROOM_CATALOG, roomTypeOf } from '@chanh-dien/room-rules';
import { internalKey } from '@chanh-dien/session-token';
import { json, readJson } from './http.mjs';
import { botChatTelegramCommand } from './bot-chat.mjs';
import { MODERATION_HELP, moderationTelegramCommand } from './moderation.mjs';
import { memorialTelegramCommand } from './memorial.mjs';

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const amount = (value) => (/^\d{1,7}$/.test(String(value ?? '')) ? Number(value) : null);

// Ảnh mã VietQR (chuyển khoản ngân hàng Việt Nam) cho người chọn khu vực Việt Nam: file nằm ngoài repo, đường dẫn
// ở DONATE_VIETQR_IMAGE (.png/.jpg/.webp). Trang chỉ nhận link /api/v1/donate/vietqr, không thấy đường dẫn trên máy.
const VIETQR_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export function vietqrFile(env = process.env) {
  const file = text(env.DONATE_VIETQR_IMAGE, 500);
  return file && VIETQR_TYPES[path.extname(file).toLowerCase()] && existsSync(file) ? file : null;
}

export function donateConfig(env = process.env) {
  const name = text(env.DONATE_ZELLE_NAME, 80);
  const handle = text(env.DONATE_ZELLE_HANDLE, 120);
  return {
    zelle: name && handle ? { name, handle } : null,
    vietqr: vietqrFile(env) ? { name: text(env.DONATE_VIETQR_NAME, 80), image: '/api/v1/donate/vietqr' } : null,
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
  if (pathname === '/api/v1/donate/vietqr') {
    const file = options.vietqrFile === undefined ? vietqrFile() : options.vietqrFile;
    if (req.method !== 'GET' || !file) {
      json(req, res, 404, { error: 'not_found' });
      return true;
    }
    res.writeHead(200, { 'Content-Type': VIETQR_TYPES[path.extname(file).toLowerCase()], 'Cache-Control': 'public, max-age=300' });
    res.end(readFileSync(file));
    return true;
  }
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
export function botAllocation(total, random = Math.random) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 1_000) return null;
  const rooms = ROOM_CATALOG.map((room) => ({ ...room, rules: getRoomRules(room.type) }))
    .filter((room) => room.rules?.bots);
  const allocations = new Map(rooms.map((room) => [room.id, 0]));
  const capacity = (room) => Math.max(0, room.rules.bots.max ?? room.rules.seats ?? 0);
  let remaining = total;
  // Mỗi bàn game cần ít nhất hai bot để nhìn có người chơi; Lô Tô cũng cần hai vé mới mở ván.
  const games = rooms.filter((room) => ['game', 'taixiu', 'loto'].includes(room.type));
  for (let pass = 0; pass < 2 && remaining > 0; pass += 1) {
    for (const room of games) {
      if (remaining <= 0 || allocations.get(room.id) >= capacity(room)) continue;
      allocations.set(room.id, allocations.get(room.id) + 1);
      remaining -= 1;
    }
  }
  while (remaining > 0) {
    const available = rooms.filter((room) => allocations.get(room.id) < capacity(room));
    if (!available.length) break;
    const room = available[Math.floor(random() * available.length) % available.length];
    allocations.set(room.id, allocations.get(room.id) + 1);
    remaining -= 1;
  }
  return { requested: total, planned: total - remaining, allocations: Object.fromEntries(allocations) };
}

const BOT_ROOM_ALIASES = Object.freeze({
  thien: 'thien-1', chanhdien: 'thien-1', 'chanh-dien': 'thien-1',
  cinema: 'cinema-1', rap: 'cinema-1', phim: 'cinema-1', rapphim: 'cinema-1', 'rap-phim': 'cinema-1',
  game: 'game-1', baucua: 'game-1', 'bau-cua': 'game-1',
  taixiu: 'taixiu-1', 'tai-xiu': 'taixiu-1',
  loto: 'loto-1', 'lo-to': 'loto-1',
});

export function botRoomId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return BOT_ROOM_ALIASES[normalized] || (roomTypeOf(normalized) ? normalized : null);
}

const botRoomName = (roomId) => ROOM_CATALOG.find((room) => room.id === roomId)?.name?.replace(/ #1$/, '') || roomId;

export function realtimeBotController(realtimeInternalUrls, secret, fetcher = fetch) {
  const urls = (Array.isArray(realtimeInternalUrls) ? realtimeInternalUrls : String(realtimeInternalUrls || '').split(','))
    .map((value) => String(value).trim()).filter(Boolean);
  if (!urls.length || !secret) return null;
  return async (total, targetRoomId = null) => {
    const roomId = targetRoomId ? botRoomId(targetRoomId) : null;
    if (targetRoomId && !roomId) return null;
    const globalPlan = roomId ? null : botAllocation(total);
    const plan = roomId
      ? { requested: total, planned: total, allocations: { [roomId]: total }, replace: false }
      : globalPlan && { ...globalPlan, replace: true };
    if (!plan) return null;
    // Cùng một kế hoạch được gửi tới mọi node. Lease của phòng bảo đảm chỉ đúng node đang giữ phòng áp dụng số bot;
    // nhờ vậy game đang nằm ở rt2 không bị bỏ sót khi API mặc định nối nội bộ tới rt1.
    const results = await Promise.all(urls.map((baseUrl) => fetcher(new URL('/internal/bots', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': internalKey(secret) },
      body: JSON.stringify({ allocations: plan.allocations, replace: plan.replace }),
      signal: AbortSignal.timeout(5_000),
    }).then(async (response) => (response.ok ? response.json().catch(() => null) : null)).catch(() => null)));
    const byRoom = new Map();
    for (const result of results.filter(Boolean)) {
      for (const room of Array.isArray(result.rooms) ? result.rooms : []) {
        const current = byRoom.get(room.roomId);
        if (!current || room.bots > current.bots) byRoom.set(room.roomId, room);
      }
    }
    if (!results.some(Boolean)) return null;
    if (roomId && !byRoom.has(roomId) && total === 0) {
      byRoom.set(roomId, { roomId, name: botRoomName(roomId), bots: 0 });
    }
    const rooms = [...byRoom.values()].sort((a, b) => a.roomId.localeCompare(b.roomId));
    return { requested: total, assigned: rooms.reduce((sum, room) => sum + room.bots, 0), rooms };
  };
}

// Webhook chỉ nhận từ Telegram có secret header và chỉ cho đúng TELEGRAM_CHAT_ID. Cú pháp:
//   donate 1       (cộng 1 USD)
//   /donate 25     (cộng 25 USD)
//   xu tam.an +100 / xu tam.an -20
//   kimcuong tam.an +50 / kimcuong a-<uuid> -10
//   addbot 100     (chia tổng 100 bot vào các phòng; addbot 0 để tắt)
//   addbot baucua 20 / addbot loto 0 (đặt bot riêng một phòng, không đổi các phòng khác)
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
  // Trả lời thay bot: /tl <mã> <nội dung>, hoặc Reply vào tin "Nhắn bot" rồi gõ.
  const botReply = await botChatTelegramCommand(message, options);
  if (botReply) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: botReply });
    return true;
  }
  // Gỡ mộ ở Khu tưởng niệm: /xoamo <số ô>.
  const memorialReply = memorialTelegramCommand(message.text, options);
  if (memorialReply) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: memorialReply });
    return true;
  }
  // Lệnh kiểm duyệt: /blockchattu dm, /unban k-…, /ban, /dsban…
  const by = message.from?.username ? `@${message.from.username}` : String(message.from?.first_name || 'Telegram').slice(0, 40);
  const moderationReply = moderationTelegramCommand(message.text, options.moderation, `Telegram ${by}`);
  if (moderationReply) {
    json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: moderationReply });
    return true;
  }
  const addBotRoomMatch = typeof message.text === 'string'
    && /^\/?addbot(?:@[A-Za-z0-9_]+)?\s+(?:([A-Za-z0-9_-]+)\s+(\d{1,4})|(\d{1,4})\s+([A-Za-z0-9_-]+))$/i.exec(message.text.trim());
  if (addBotRoomMatch) {
    const roomId = botRoomId(addBotRoomMatch[1] || addBotRoomMatch[4]);
    const total = Number(addBotRoomMatch[2] || addBotRoomMatch[3]);
    if (!roomId) {
      json(req, res, 200, {
        method: 'sendMessage', chat_id: message.chat.id,
        text: 'Không nhận ra phòng. Dùng: chanhdien, cinema, baucua, taixiu, loto hoặc mã phòng.',
      });
      return true;
    }
    const result = options.configureBots ? await options.configureBots(total, roomId) : null;
    if (!result || !Number.isSafeInteger(result.assigned)) {
      json(req, res, 200, { method: 'sendMessage', chat_id: message.chat.id, text: 'Máy realtime đang tạm mất kết nối, chưa đổi được số bot.' });
      return true;
    }
    const actual = result.rooms?.find((room) => room.roomId === roomId)?.bots ?? result.assigned;
    const capped = actual < total ? ` (sức chứa hiện tại nhận ${actual}/${total})` : '';
    json(req, res, 200, {
      method: 'sendMessage', chat_id: message.chat.id,
      text: total === 0
        ? `✅ Đã tắt bot riêng phòng ${botRoomName(roomId)}.`
        : `✅ ${botRoomName(roomId)}: ${actual} bot${capped}. Các phòng khác giữ nguyên.\nSố bot tự lên xuống ±10 quanh con số này cho giống người ra vào.`,
    });
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
        : `✅ Đã chia ${result.assigned} bot${capped}.${allocation ? `\n${allocation}` : ''}\nMỗi phòng tự lên xuống ±10 bot quanh con số này cho giống người ra vào.`,
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
      text: `Cú pháp:\ndonate 1\naddbot 100\naddbot 0\naddbot baucua 20\naddbot taixiu 20\naddbot loto 20\naddbot cinema 20\naddbot chanhdien 20\n/tl <mã> <nội dung> (trả lời thay bot)\nxu <tài_khoản> +100\nxu <tài_khoản> -20\nkimcuong <tài_khoản> +50${options.moderation ? `\n\n${MODERATION_HELP}` : ''}`,
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
