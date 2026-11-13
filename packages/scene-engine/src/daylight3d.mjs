// Trời theo giờ thật nơi đặt chùa: độ cao mặt trời (độ) tính từ thời điểm + vĩ độ / kinh độ, rồi pha màu trời, sương,
// nắng và lớp phủ làm tối cảnh (bình minh, nắng chiều, ráng chiều, đêm trăng). Mặt trời cao trên 14° (hoặc không đặt
// giờ) thì giữ nguyên màu của vùng phong cảnh, cảnh ban ngày không đổi gì. Tọa độ mỗi tiểu bang ở THIEN_PLACES (room
// rules); engine không biết tiểu bang.
import * as THREE from 'three';

const RAD = Math.PI / 180;

// Thứ tự vẽ (vật trong suốt): lớp phủ đêm nhân màu mọi thứ vẽ trước nó; quầng đèn, sao / trăng, bảng tên và bong
// bóng chat vẽ sau nên ban đêm vẫn sáng rõ. Ban ngày lớp phủ ẩn, thứ tự này không đổi gì.
export const VEIL_ORDER = 50;
export const GLOW_ORDER = 55;
export const SKY_LIGHTS_ORDER = 56;
export const LABEL_ORDER = 60;

// Công thức thiên văn rút gọn (sai dưới 1°), đủ để biết sáng / chiều / tối. Tính theo giờ UTC nên không phụ thuộc
// múi giờ hay giờ mùa hè.
export function sunElevation(date, lat, lon) {
  const days = date.getTime() / 86_400_000 - 10_957.5; // số ngày từ 1/1/2000 12:00 UTC
  const anomaly = (357.529 + 0.98560028 * days) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * days;
  const longitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * days) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude));
  const ascension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude));
  const hourAngle = (280.46061837 + 360.98564736629 * days + lon) * RAD - ascension;
  const sine = Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sine))) / RAD;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (from, to, value) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

// Mức pha theo độ cao mặt trời: dark = trời tối (0 ngày → 1 đêm), warm = nắng chiều / ráng (mạnh nhất quanh lúc mặt
// trời vừa lặn), veil = lớp phủ làm tối cảnh, stars = sao và trăng. null = ban ngày cố định.
export function daylightLevels(elevation) {
  if (!Number.isFinite(elevation)) return { dark: 0, warm: 0, veil: 0, stars: 0 };
  return {
    dark: 1 - smooth(-6, 4, elevation),
    warm: smooth(-10, -2, elevation) * (1 - smooth(4, 14, elevation)),
    veil: 1 - smooth(-9, 3, elevation),
    stars: 1 - smooth(-12, -5, elevation),
  };
}

// Trời và sương: shader trời / sương của three.js ghi thẳng giá trị màu ra màn hình (không mã hóa sRGB), nên màu đêm /
// ráng ghi bằng đúng màu thấy trên màn hình (display) cho dễ chỉnh. Đèn (nắng, ánh trời) là màu ánh sáng bình thường.
const NIGHT_SKY = { top: '#0e1b3c', horizon: '#2a3c64', fog: '#25324f' };
const DUSK_SKY = { top: '#3e4f86', horizon: '#f2a263', fog: '#7d6474' };
const NIGHT_LIGHT = { sun: '#9fb6e6', sky: '#4d5f96', ground: '#1a2030' };
const DUSK_LIGHT = { sun: '#ffa060', sky: '#e8b49a' };
// Lớp phủ nhân thẳng vào khung hình: đêm tối rõ hơn ban ngày; các cụm đèn vàng ngoài sân bù sáng ở lối đi.
const NIGHT_TINT = [0.38, 0.42, 0.58];
const DUSK_TINT = [1, 0.9, 0.8];

// base: màu ban ngày của vùng { top, horizon, fog, sun, sky, ground } (chuỗi #rrggbb). Trả màu đích (THREE.Color, đã
// đổi sang không gian tuyến tính như mọi màu three.js), hệ số cường độ nắng / ánh trời, lớp phủ, độ sáng đèn lồng,
// cường độ vùng sáng vàng, sao.
export function daylightGrade(base, elevation) {
  const level = daylightLevels(elevation);
  const tone = (from, to, amount) => (amount > 0 ? from.lerp(to.isColor ? to : new THREE.Color(to), Math.min(1, amount)) : from);
  const color = (value) => new THREE.Color(value);
  const display = (hex) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  const tint = [0, 1, 2].map((index) => {
    const warm = 1 + (DUSK_TINT[index] - 1) * level.warm * 0.5;
    return warm + (NIGHT_TINT[index] - warm) * level.veil;
  });
  return {
    level,
    top: tone(tone(color(base.top), display(NIGHT_SKY.top), level.dark), display(DUSK_SKY.top), level.warm * level.dark * 0.6),
    horizon: tone(tone(color(base.horizon), display(NIGHT_SKY.horizon), level.dark), display(DUSK_SKY.horizon), level.warm * (0.45 + 0.4 * level.dark)),
    fog: tone(tone(color(base.fog), display(NIGHT_SKY.fog), level.dark), display(DUSK_SKY.fog), level.warm * (0.3 + 0.4 * level.dark)),
    sun: tone(tone(color(base.sun), NIGHT_LIGHT.sun, level.dark), DUSK_LIGHT.sun, level.warm * 0.8),
    sky: tone(tone(color(base.sky), NIGHT_LIGHT.sky, level.dark), DUSK_LIGHT.sky, level.warm * 0.5),
    ground: tone(color(base.ground), NIGHT_LIGHT.ground, level.dark),
    sunFactor: 1 - 0.78 * level.dark,
    fillFactor: 1 - 0.62 * level.dark,
    tint,
    glow: 1 + level.veil,
    lamp: level.veil,
    stars: level.stars,
  };
}
