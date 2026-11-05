// Thông báo cho quản trị qua Telegram khi có phiếu hỗ trợ mới. Bật bằng biến môi trường TELEGRAM_BOT_TOKEN và
// TELEGRAM_CHAT_ID (xem `npm run telegram:setup`); không đặt thì không gửi gì. Tin nhắn gửi dạng chữ thường (không
// parse_mode) nên nội dung người dùng không thể chèn định dạng/link ẩn. Lỗi mạng chỉ ghi log, không làm hỏng phiếu.
const KINDS = { bug: '🐞 Báo lỗi', coins: '🪙 Hỗ trợ xu', idea: '💡 Góp ý nâng cấp', other: '💬 Khác' };
const TELEGRAM_LIMIT = 4_000;

export function supportMessage(ticket, adminUrl = null) {
  const lines = [
    `🛟 Phiếu hỗ trợ mới · ${KINDS[ticket.kind] || ticket.kind}`,
    `Từ: ${ticket.account ? `${ticket.account.displayName} (tài khoản)` : 'Khách'}${ticket.contact ? ` · Liên hệ: ${ticket.contact}` : ''}`,
    ...(ticket.page ? [`Trang: ${ticket.page}`] : []),
    '',
    ticket.message,
    '',
    `Mã: ${ticket.id}`,
    ...(adminUrl ? [`Xem & xử lý: ${adminUrl}`] : []),
  ];
  return lines.join('\n').slice(0, TELEGRAM_LIMIT);
}

export function createTelegramNotifier({ token, chatId, adminUrl = null, fetchImpl = fetch } = {}) {
  if (!token || !chatId) return null;
  return async function notifySupport(ticket) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: supportMessage(ticket, adminUrl), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) console.warn(`Telegram từ chối thông báo phiếu hỗ trợ (HTTP ${response.status})`);
      return response.ok;
    } catch (error) {
      console.warn(`Không gửi được thông báo Telegram: ${error.message}`);
      return false;
    }
  };
}
