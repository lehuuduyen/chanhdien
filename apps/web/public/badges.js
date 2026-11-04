// Ảnh đại diện và huy hiệu cạnh tên kiểu TikTok LIVE: huy hiệu hạng TOP 1/2/3 (vương miện vàng/bạc/đồng),
// huy hiệu cấp công đức (hoa sen + số cấp, màu theo cấp). Chỉ thành viên đã đăng nhập có cấp.
import { MERIT_LEVELS } from '/shared/room-rules.mjs';
import { t } from '/thien-i18n.js';

const SVG = 'http://www.w3.org/2000/svg';
const LOTUS = 'M8 1.8C6.5 3.9 6.5 7 8 9.6c1.5-2.6 1.5-5.7 0-7.8Z'
  + 'M1.6 5.6c.4 2.8 2.5 4.7 5.5 4.9C6.5 8.1 4.4 6.2 1.6 5.6Z'
  + 'M14.4 5.6c-2.8.6-4.9 2.5-5.5 4.9 3-.2 5.1-2.1 5.5-4.9Z'
  + 'M2.6 11.4c1.5 1.4 3.2 2.2 5.4 2.2s3.9-.8 5.4-2.2c-1.7.5-3.5.7-5.4.7s-3.7-.2-5.4-.7Z';

const CROWN = 'M2 5.2 5 8l3-5.2L11 8l3-2.8-1.3 7.3H3.3L2 5.2Z';

// Tên cấp theo ngôn ngữ đang dùng (Sơ tâm / Beginner Mind / 初心 / Mente de principiante…).
export const levelName = (level) => (MERIT_LEVELS.some((item) => item.level === level) ? t('levels')[level - 1] : '');

export function levelBadge(level) {
  if (!Number.isSafeInteger(level) || level < 1) return null;
  const badge = document.createElement('span');
  badge.className = `lv lv-${Math.min(level, MERIT_LEVELS.length)}`;
  badge.title = t('level.title', { n: level, name: levelName(level) });
  badge.append(icon(LOTUS), document.createTextNode(String(level)));
  return badge;
}

function icon(d) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// Hạng 1–3: vương miện + "TOP n"; hạng khác không có huy hiệu.
export function rankBadge(rank, { compact = false } = {}) {
  if (![1, 2, 3].includes(rank)) return null;
  const badge = document.createElement('span');
  badge.className = `top top-${rank}${compact ? ' compact' : ''}`;
  badge.title = t('rank.title', { n: rank });
  badge.append(icon(CROWN), document.createTextNode(compact ? String(rank) : `TOP ${rank}`));
  return badge;
}

const initial = (name) => (name.trim()[0] || '?').toLocaleUpperCase('vi');

// Ảnh Google nếu có, không thì chữ cái đầu trên nền màu theo tên.
export function avatarNode(person, className = 'avatar') {
  const node = document.createElement('span');
  node.className = className;
  const name = person?.displayName || '?';
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  node.style.setProperty('--hue', String(hash % 360));
  if (person?.avatarUrl) {
    const image = document.createElement('img');
    image.src = person.avatarUrl;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.replaceWith(document.createTextNode(initial(name))), { once: true });
    node.append(image);
  } else {
    node.textContent = initial(name);
  }
  return node;
}

// Tên kèm huy hiệu phía trước (hạng rồi cấp), dùng cho tin nhắn, thông báo, bảng công đức, bảng xếp hạng.
export function nameWithBadge(name, { level, rank } = {}, tag = 'b') {
  const node = document.createElement(tag);
  node.className = 'who';
  for (const badge of [rankBadge(rank), levelBadge(level)]) if (badge) node.append(badge);
  const text = document.createElement('span');
  text.className = 'who-name';
  text.textContent = name;
  node.append(text);
  return node;
}
