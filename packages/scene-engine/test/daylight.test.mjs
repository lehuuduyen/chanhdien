// Trời theo giờ thật ở sân chánh điện (daylight3d.mjs): độ cao mặt trời, pha màu theo độ cao, tọa độ từng tiểu bang.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { THIEN_PLACES, thienPlaceOf, US_STATES } from '@chanh-dien/room-rules';
import { daylightGrade, daylightLevels, sunElevation } from '../src/daylight3d.mjs';

const BASE = { top: '#7aa6d8', horizon: '#f6dcb0', fog: '#d9c3a0', sun: '#fff1d6', sky: '#cfe2ff', ground: '#6b5a3c' };
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected} ± ${tolerance}`);

test('độ cao mặt trời đúng ở vài nơi / thời điểm biết trước', () => {
  // Phoenix trưa hạ chí: 90 − 33,45 + 23,44 ≈ 80°.
  near(sunElevation(new Date('2026-06-21T19:30:00Z'), 33.45, -112.07), 80, 1.5, 'Phoenix hạ chí');
  // Anchorage trưa đông chí: 90 − 61,22 − 23,44 ≈ 5,3°.
  near(sunElevation(new Date('2026-12-21T22:15:00Z'), 61.22, -149.9), 5.3, 1.5, 'Anchorage đông chí');
  // Xích đạo, kinh tuyến gốc, trưa xuân phân: gần đỉnh đầu; nửa đêm: gần dưới chân.
  near(sunElevation(new Date('2026-03-20T12:07:00Z'), 0, 0), 90, 2, 'xích đạo trưa');
  near(sunElevation(new Date('2026-03-20T00:07:00Z'), 0, 0), -90, 2, 'xích đạo nửa đêm');
  // Cùng một lúc: New York đã tối khi Los Angeles còn nắng chiều (giờ UTC, không phụ thuộc múi giờ máy).
  const at = new Date('2026-11-12T23:00:00Z');
  assert.ok(sunElevation(at, 40.71, -74.01) < -5);
  assert.ok(sunElevation(at, 34.05, -118.24) > 0);
});

test('ban ngày (mặt trời cao / không đặt giờ) giữ nguyên màu của vùng', () => {
  for (const elevation of [null, undefined, Number.NaN, 14, 35, 90]) {
    const grade = daylightGrade(BASE, elevation);
    assert.deepEqual(grade.level, { dark: 0, warm: 0, veil: 0, stars: 0 });
    for (const key of ['top', 'horizon', 'fog', 'sun', 'sky', 'ground']) assert.equal(`#${grade[key].getHexString()}`, BASE[key], `${elevation} ${key}`);
    assert.deepEqual(grade.tint, [1, 1, 1]);
    assert.equal(grade.sunFactor, 1);
    assert.equal(grade.fillFactor, 1);
    assert.equal(grade.glow, 1);
    assert.equal(grade.lamp, 0);
    assert.equal(grade.stars, 0);
  }
});

test('mặt trời càng thấp cảnh càng tối, đêm có sao và đèn sáng hơn', () => {
  let previous = null;
  for (let elevation = 20; elevation >= -25; elevation -= 1) {
    const grade = daylightGrade(BASE, elevation);
    const level = daylightLevels(elevation);
    for (const value of [...Object.values(level), ...grade.tint]) assert.ok(value >= 0 && value <= 1, `${elevation}: ${value}`);
    if (previous) {
      grade.tint.forEach((value, index) => assert.ok(value <= previous.tint[index] + 1e-9, `lớp phủ sáng lên ở ${elevation}°`));
      assert.ok(grade.sunFactor <= previous.sunFactor + 1e-9);
      assert.ok(grade.stars >= previous.stars - 1e-9);
    }
    previous = grade;
  }
  const night = daylightGrade(BASE, -20);
  assert.equal(night.stars, 1);
  assert.equal(night.lamp, 1);
  assert.ok(night.glow >= 1.9 && night.glow <= 2.1);
  // Đêm tối rõ hơn trước, còn lối đi được bù bằng các cụm đèn vàng.
  assert.ok(Math.min(...night.tint) >= 0.35 && Math.max(...night.tint) <= 0.6);
  // Ráng chiều: chân trời ngả cam (đỏ > lam rõ rệt) khi mặt trời vừa lặn.
  const dusk = daylightGrade(BASE, -2).horizon;
  assert.ok(dusk.r > dusk.b * 1.5);
});

test('mọi khu vực ở cổng chánh điện có tọa độ để tính trời', () => {
  for (const { code } of US_STATES) {
    const place = thienPlaceOf(code);
    assert.ok(place, `thiếu tọa độ ${code}`);
    const [lat, lon] = place;
    assert.ok(lat > 5 && lat < 72 && lon > -170 && lon < 170, `${code}: ${place}`);
  }
  assert.equal(Object.keys(THIEN_PLACES).length, US_STATES.length);
  assert.equal(thienPlaceOf('xx'), null);
});
