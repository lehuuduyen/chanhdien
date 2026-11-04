// Trang Ủng hộ (quyên góp tự nguyện để duy trì server). Thông tin nhận tiền KHÔNG ghi trong repo: đặt bằng biến môi
// trường trên máy chạy API. Khoản góp không đổi ra xu hay quyền lợi gì trong game.
//
//   DONATE_ZELLE_NAME     tên người nhận hiện trong app ngân hàng (vd: "Chanh Dien Online")
//   DONATE_ZELLE_HANDLE   email hoặc số điện thoại Zelle
//   DONATE_MEMO           lời nhắn gợi ý (mặc định "Ung ho Chanh Dien Online")
//   DONATE_MONTHLY_GOAL   chi phí server mỗi tháng (USD, số nguyên) — có thì hiện thanh mục tiêu
//   DONATE_MONTH_RAISED   đã nhận trong tháng (USD, số nguyên), cập nhật tay
//   DONATE_CONTACT        email liên hệ (tùy chọn)
import { json } from './http.mjs';

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

export function handleDonateRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/donate') return false;
  if (req.method !== 'GET') {
    json(req, res, 405, { error: 'method_not_allowed' });
    return true;
  }
  json(req, res, 200, options.donate || donateConfig({}));
  return true;
}
