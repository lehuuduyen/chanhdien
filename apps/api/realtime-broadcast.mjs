// Báo sự kiện cho MỌI máy realtime (vườn, khu tưởng niệm, công trình chung): mỗi máy chỉ phát cho các phòng chánh
// điện nó đang giữ, nên báo một máy thì người ở phòng do máy kia giữ không thấy gì tới lần tải lại định kỳ.
// options.realtimeBroadcastUrls (danh sách / chuỗi phẩy, = REALTIME_INTERNAL_URLS); không có thì dùng realtimeInternalUrl.
// Lỗi mạng không làm hỏng thao tác (client vẫn tự tải lại định kỳ).
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';

export function realtimeTargets(options) {
  const list = options.realtimeBroadcastUrls ?? options.realtimeInternalUrl;
  const urls = (Array.isArray(list) ? list : String(list || '').split(',')).map((value) => String(value).trim()).filter(Boolean);
  return [...new Set(urls)];
}

export function postToRealtime(options, pathname, payload, label) {
  const urls = realtimeTargets(options);
  if (!urls.length) return Promise.resolve();
  const body = JSON.stringify(payload);
  const headers = { 'content-type': 'application/json', 'x-internal-key': internalKey(options.secret || DEFAULT_LOCAL_SECRET) };
  return Promise.all(urls.map((baseUrl) => fetch(new URL(pathname, baseUrl), {
    method: 'POST', headers, body, signal: AbortSignal.timeout(3_000),
  }).catch((error) => console.warn(`Không báo được realtime ${baseUrl} về ${label}: ${error.message}`)))).then(() => {});
}
