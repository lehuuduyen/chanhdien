// `npm run telegram:setup`: kiểm tra bot Telegram báo phiếu hỗ trợ, tìm chat ID và gửi tin thử.
// Đọc TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID từ biến môi trường hoặc file .env.online (gitignore). Không in token.
//
//   npm run telegram:setup            # xem bot, liệt kê các chat đã nhắn cho bot (lấy chat ID)
//   npm run telegram:setup -- --save  # có đúng một chat: ghi TELEGRAM_CHAT_ID vào .env.online
//   npm run telegram:setup -- --test  # gửi tin thử tới TELEGRAM_CHAT_ID
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const ENV_FILE = '.env.online';
const fileEnv = (() => {
  try {
    return Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)
      .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim().replace(/^(['"])(.*)\1$/, '$2')]));
  } catch {
    return {};
  }
})();
const token = process.env.TELEGRAM_BOT_TOKEN || fileEnv.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID || fileEnv.TELEGRAM_CHAT_ID;
const args = process.argv.slice(2);

if (!token) {
  console.log(`Chưa có TELEGRAM_BOT_TOKEN.

1. Mở Telegram, nhắn cho @BotFather: /newbot → đặt tên → nhận token dạng 123456789:AA...
2. Thêm dòng này vào file ${ENV_FILE} (ở thư mục dự án, file đã được gitignore):
     TELEGRAM_BOT_TOKEN=<token vừa nhận>
3. Mở bot vừa tạo trong Telegram, bấm Start (hoặc nhắn /start).
4. Chạy lại: npm run telegram:setup`);
  process.exit(1);
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `HTTP ${response.status}`);
  return data.result;
}

try {
  const bot = await call('getMe');
  console.log(`Bot: @${bot.username} (${bot.first_name})`);
} catch (error) {
  console.error(`Token không dùng được: ${error.message}. Kiểm tra lại TELEGRAM_BOT_TOKEN.`);
  process.exit(1);
}

if (args.includes('--test')) {
  if (!chatId) {
    console.error('Chưa có TELEGRAM_CHAT_ID. Chạy `npm run telegram:setup` để tìm chat ID trước.');
    process.exit(1);
  }
  try {
    await call('sendMessage', { chat_id: chatId, text: '✅ Chánh Điện Online đã kết nối. Phiếu hỗ trợ mới (báo lỗi / góp ý) sẽ được báo vào đây.' });
    console.log(`Đã gửi tin thử tới chat ${chatId}. Mở Telegram để xem.`);
  } catch (error) {
    console.error(`Không gửi được: ${error.message}. Bạn đã bấm Start với bot chưa? Chat ID có đúng không?`);
    process.exit(1);
  }
  process.exit(0);
}

// Các chat đã nhắn cho bot gần đây (Telegram giữ khoảng 24 giờ).
const updates = await call('getUpdates');
const chats = new Map();
for (const update of updates) {
  const chat = (update.message || update.edited_message || update.channel_post || update.my_chat_member)?.chat;
  if (chat) chats.set(chat.id, chat);
}
if (!chats.size) {
  console.log(`Chưa thấy ai nhắn cho bot. Mở bot trong Telegram, bấm Start (hoặc nhắn /start), rồi chạy lại lệnh này.
(Muốn báo vào một nhóm: thêm bot vào nhóm, nhắn một tin trong nhóm, rồi chạy lại.)`);
  process.exit(0);
}
console.log('Các chat đã nhắn cho bot:');
for (const chat of chats.values()) {
  const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '';
  console.log(`  TELEGRAM_CHAT_ID=${chat.id}   (${chat.type}${name ? `: ${name}` : ''})`);
}
if (args.includes('--save')) {
  if (chats.size !== 1) {
    console.log('\nCó nhiều chat: tự chép dòng TELEGRAM_CHAT_ID đúng vào file .env.online.');
  } else if (chatId) {
    console.log(`\nĐã có TELEGRAM_CHAT_ID=${chatId}, không ghi đè. Sửa tay trong ${ENV_FILE} nếu muốn đổi.`);
  } else {
    const [only] = chats.keys();
    const needsNewline = existsSync(ENV_FILE) && !readFileSync(ENV_FILE, 'utf8').endsWith('\n');
    appendFileSync(ENV_FILE, `${needsNewline ? '\n' : ''}TELEGRAM_CHAT_ID=${only}\n`, { mode: 0o600 });
    console.log(`\nĐã ghi TELEGRAM_CHAT_ID=${only} vào ${ENV_FILE}. Gửi tin thử: npm run telegram:setup -- --test`);
  }
} else {
  console.log(`\nChép dòng TELEGRAM_CHAT_ID của bạn vào ${ENV_FILE} (hoặc chạy: npm run telegram:setup -- --save), rồi gửi tin thử: npm run telegram:setup -- --test`);
}
