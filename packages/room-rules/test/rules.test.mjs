import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CINEMA_RULES, defineRoomRules, getRoomRules } from '../src/index.mjs';

test('định nghĩa room rules bất biến ở cấp ngoài', () => {
  const rules = defineRoomRules({ id: 'cinema', maxParticipants: 500 });
  assert.equal(rules.id, 'cinema');
  assert.equal(Object.isFrozen(rules), true);
});

test('không cho phòng vượt quá 500 người', () => {
  assert.throws(() => defineRoomRules({ id: 'cinema', maxParticipants: 501 }), RangeError);
});

test('Cinema dùng YouTube, có 100 ghế và ngưỡng bỏ qua 35%', () => {
  assert.equal(getRoomRules('cinema'), CINEMA_RULES);
  assert.equal(CINEMA_RULES.content.source, 'youtube');
  assert.equal(CINEMA_RULES.seats, 100);
  assert.equal(CINEMA_RULES.interaction.skipVotePercent, 35);
  assert.equal(Object.isFrozen(CINEMA_RULES.interaction), true);
});

test('Chánh điện: số bồ đoàn cấu hình được, lễ vật có công đức và không có thời gian chờ; danh mục phòng biết loại phòng', async () => {
  const { THIEN_RULES, ROOM_CATALOG, roomTypeOf } = await import('../src/index.mjs');
  assert.equal(getRoomRules('thien'), THIEN_RULES);
  assert.ok(THIEN_RULES.seats > 0 && THIEN_RULES.seats <= 20);
  assert.deepEqual(THIEN_RULES.benches, { count: 6, seatsPerBench: 2 });
  assert.deepEqual(Object.keys(THIEN_RULES.world.travel), ['hall', 'courtyard', 'garden']);
  for (const point of Object.values(THIEN_RULES.world.travel)) {
    assert.ok(point.x >= THIEN_RULES.world.bounds.x[0] && point.x <= THIEN_RULES.world.bounds.x[1]);
    assert.ok(point.z >= THIEN_RULES.world.bounds.z[0] && point.z <= THIEN_RULES.world.bounds.z[1]);
  }
  assert.deepEqual(Object.keys(THIEN_RULES.interaction.offerings), ['petal', 'incense', 'lotus', 'bell']);
  assert.equal(THIEN_RULES.interaction.offerings.bell.merit, 99);
  for (const offering of Object.values(THIEN_RULES.interaction.offerings)) assert.equal(offering.cooldownMs, 0, 'lễ vật không có thời gian chờ');
  assert.equal(roomTypeOf('thien-1'), 'thien');
  assert.equal(roomTypeOf('cinema-1'), 'cinema');
  assert.equal(roomTypeOf('khong-co'), null);
  assert.equal(Object.isFrozen(ROOM_CATALOG[0]), true);
});

test('chánh điện theo tiểu bang và ngôn ngữ: mã phòng, tên ngắn, ngôn ngữ, múi giờ, bài giảng mỗi ngôn ngữ', async () => {
  const { parseThienRoomId, roomLangOf, roomTypeOf, thienRoomId, thienRoomName, THIEN_EVENT, THIEN_LANGS, THIEN_RULES, US_STATES } = await import('../src/index.mjs');
  assert.equal(US_STATES.length, 51, '50 tiểu bang và DC');
  assert.equal(US_STATES.find((state) => state.code === 'az').timeZone, 'America/Phoenix');
  for (const state of US_STATES) assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: state.timeZone }));
  assert.equal(thienRoomId('az', 'vi', 2), 'thien-az-vi-2');
  assert.deepEqual(parseThienRoomId('thien-az-vi-2'), { state: 'az', lang: 'vi', shard: 2 });
  assert.equal(parseThienRoomId('thien-xx-vi-1'), null, 'tiểu bang lạ');
  assert.equal(parseThienRoomId('thien-az-fr-1'), null, 'ngôn ngữ chưa hỗ trợ');
  assert.equal(parseThienRoomId('thien-az-vi-0'), null);
  assert.equal(thienRoomName('thien-az-vi-2'), 'Arizona · PV2');
  assert.equal(thienRoomName('thien-az-en-1'), 'Arizona · PA1');
  assert.equal(roomTypeOf('thien-ca-zh-3'), 'thien');
  assert.equal(roomLangOf('thien-tx-es-1'), 'es');
  assert.equal(roomLangOf('thien-1'), 'vi');
  for (const lang of Object.keys(THIEN_LANGS)) {
    assert.match(THIEN_EVENT.lectures[lang].videoId, /^[A-Za-z0-9_-]{11}$/, `bài giảng ${lang}`);
    if (lang !== 'vi') assert.equal(THIEN_RULES.bots.byLang[lang].names.length, 16, `tên bot ${lang}`);
  }
});
