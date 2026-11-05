// Thông báo cho quản trị qua Telegram khi có phiếu hỗ trợ mới. Bật bằng biến môi trường TELEGRAM_BOT_TOKEN và
// TELEGRAM_CHAT_ID (xem `npm run telegram:setup`); không đặt thì không gửi gì. Tin nhắn gửi dạng chữ thường (không
// parse_mode) nên nội dung người dùng không thể chèn định dạng/link ẩn. Lỗi mạng chỉ ghi log, không làm hỏng phiếu.
const KINDS = { bug: '🐞 Báo lỗi', coins: '🪙 Hỗ trợ xu', idea: '💡 Góp ý nâng cấp', other: '💬 Khác' };
const TELEGRAM_LIMIT = 4_000;

export function supportMessage(ticket, adminUrl = null) {
  const accountTarget = ticket.account?.username || ticket.account?.id || null;
  const requestedCoins = ticket.kind === 'coins'
    ? Number(/\b(\d{1,7})\s*xu\b/i.exec(ticket.message || '')?.[1] || 0)
    : 0;
  const lines = [
    `🛟 Phiếu hỗ trợ mới · ${KINDS[ticket.kind] || ticket.kind}`,
    `Từ: ${ticket.account ? `${ticket.account.displayName} (tài khoản)` : 'Khách'}${ticket.contact ? ` · Liên hệ: ${ticket.contact}` : ''}`,
    ...(ticket.account?.username ? [`Tên đăng nhập: @${ticket.account.username}`] : ticket.account?.id ? [`Mã tài khoản: ${ticket.account.id}`] : []),
    ...(ticket.page ? [`Trang: ${ticket.page}`] : []),
    '',
    ticket.message,
    ...(accountTarget && requestedCoins > 0 ? ['', `Lệnh gợi ý (kiểm tra rồi gửi): xu ${accountTarget} +${requestedCoins}`] : []),
    '',
    `Mã: ${ticket.id}`,
    ...(adminUrl ? [`Xem & xử lý: ${adminUrl}`] : []),
  ];
  return lines.join('\n').slice(0, TELEGRAM_LIMIT);
}

// Gửi một tin chữ thường tới nhóm quản trị (dùng chung cho phiếu hỗ trợ và kiểm duyệt).
export function createTelegramSender({ token, chatId, fetchImpl = fetch } = {}) {
  if (!token || !chatId) return null;
  return async function sendTelegram(text) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, TELEGRAM_LIMIT), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) console.warn(`Telegram từ chối tin nhắn (HTTP ${response.status})`);
      return response.ok;
    } catch (error) {
      console.warn(`Không gửi được thông báo Telegram: ${error.message}`);
      return false;
    }
  };
}

export function createTelegramNotifier({ token, chatId, adminUrl = null, fetchImpl = fetch } = {}) {
  const send = createTelegramSender({ token, chatId, fetchImpl });
  if (!send) return null;
  return (ticket) => send(supportMessage(ticket, adminUrl));
}
