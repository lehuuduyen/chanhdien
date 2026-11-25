// Lượt mở trang + nguồn người tới (thống kê ở apps/api/visitor-stats.mjs, quản trị xem bằng /thongke, /nguon trong nhóm
// Telegram). Nguồn lấy theo thứ tự: ?src= trên link quảng cáo (vd. /dua-xe.html?src=tt-duaxe), nguồn đã nhận trong phiên
// này (đi từ trang chủ sang chánh điện vẫn cùng nguồn), trang dẫn tới (Google, Facebook…), app có trình duyệt riêng
// (TikTok, Facebook, Zalo… thường không gửi trang dẫn tới), còn lại là vào thẳng (''). Chỉ gửi tên nguồn ngắn, không gửi
// đường dẫn đầy đủ. ?src= được bỏ khỏi thanh địa chỉ để link người dùng chép gửi bạn không mang nguồn cũ.
const SOURCE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SITES = [
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)coccoc\.com$/, 'coccoc'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)messenger\.com$/, 'messenger'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)zalo\.(me|vn)$/, 'zalo'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
  [/(^|\.)reddit\.com$/, 'reddit'],
];
const APPS = [
  [/musical_ly|BytedanceWebview|TikTok/i, 'tiktok-app'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'facebook-app'],
  [/Instagram/i, 'instagram-app'],
  [/Zalo/i, 'zalo-app'],
];

function detectSource() {
  const url = new URL(location.href);
  const param = (url.searchParams.get('src') || '').trim().toLowerCase();
  if (url.searchParams.has('src')) {
    url.searchParams.delete('src');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  if (SOURCE.test(param)) return param;
  try {
    const saved = sessionStorage.getItem('lg-src');
    if (saved !== null && (saved === '' || SOURCE.test(saved))) return saved;
  } catch {}
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch {}
  if (host && host !== location.hostname) return SITES.find(([pattern]) => pattern.test(host))?.[1] || 'web';
  return APPS.find(([pattern]) => pattern.test(navigator.userAgent))?.[1] || '';
}

// page: một trong VISIT_PAGES của visitor-stats.mjs (home, temple, cinema, race, tienlen, loto, baucua, taixiu, rps, shop).
export function recordVisit(page) {
  // Trang mở trong khung (máy quay video giới thiệu /promo.html) không phải người thật mở trang.
  try { if (window.top !== window) return; } catch { return; }
  let src = '';
  try {
    src = detectSource();
    sessionStorage.setItem('lg-src', src);
  } catch {}
  fetch('/api/v1/visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page, src }),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {});
}
