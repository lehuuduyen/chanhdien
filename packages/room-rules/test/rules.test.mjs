import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CINEMA_RULES, GAME_RULES, LOTO_RULES, TAI_XIU_RULES, THIEN_RULES, defineRoomRules, getRoomRules,
} from '../src/index.mjs';

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

test('skin thưởng đăng nhập là hình cao cấp và có mốc ngày cố định', async () => {
  const { isPremiumSkin, LOGIN_ACHIEVEMENT, LOGIN_REWARD_ITEMS, LOGIN_REWARDS, THIEN_RULES } = await import('../src/index.mjs');
  assert.deepEqual(LOGIN_REWARDS.map(({ days, skin }) => [days, skin]), [[3, 'chibigirl'], [7, 'swordsman']]);
  assert.deepEqual(
    [LOGIN_ACHIEVEMENT.days, LOGIN_ACHIEVEMENT.id, LOGIN_ACHIEVEMENT.frame],
    [7, 'steadfast-practitioner', 'seven-day-lotus'],
  );
  assert.equal(LOGIN_REWARD_ITEMS[0].rewardOnly, true);
  assert.equal(isPremiumSkin('swordsman'), true);
  assert.ok(THIEN_RULES.skins.includes('swordsman'));
});

test('Chánh điện: số bồ đoàn cấu hình được, lễ vật có công đức và không có thời gian chờ; danh mục phòng biết loại phòng', async () => {
  const { THIEN_RULES, ROOM_CATALOG, roomTypeOf } = await import('../src/index.mjs');
  assert.equal(getRoomRules('thien'), THIEN_RULES);
  assert.ok(THIEN_RULES.seats > 0 && THIEN_RULES.seats <= 20);
  assert.deepEqual(THIEN_RULES.benches, { count: 6, seatsPerBench: 2 });
  assert.deepEqual(Object.keys(THIEN_RULES.world.travel), ['hall', 'courtyard', 'garden', 'pets', 'memorial']);
  for (const point of Object.values(THIEN_RULES.world.travel)) {
    assert.ok(point.x >= THIEN_RULES.world.bounds.x[0] && point.x <= THIEN_RULES.world.bounds.x[1]);
    assert.ok(point.z >= THIEN_RULES.world.bounds.z[0] && point.z <= THIEN_RULES.world.bounds.z[1]);
  }
  assert.equal(THIEN_RULES.world.pets.length, 9, "6 thú khối + Milo, Fox, Meomeo có mô hình riêng");
  assert.deepEqual(THIEN_RULES.world.petArea, { x: [7.2, 34], z: [77, 97] });
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
  assert.equal(US_STATES.length, 52, 'Việt Nam + 50 tiểu bang và DC');
  assert.deepEqual(US_STATES[0], { code: 'vn', name: 'Việt Nam', timeZone: 'Asia/Ho_Chi_Minh' });
  assert.deepEqual(parseThienRoomId('thien-vn-vi-1'), { state: 'vn', lang: 'vi', shard: 1 });
  assert.equal(thienRoomName('thien-vn-vi-1'), 'Việt Nam · PV1');
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
    const names = lang === 'vi' ? THIEN_RULES.bots.names : THIEN_RULES.bots.byLang[lang].names;
    assert.ok(names.length >= 100, `có ít nhất 100 tên bot ${lang}`);
  }
});

test('kho tên bot đủ cho addbot 100, không trùng và không chứa tên đánh số', () => {
  const pools = [
    ['cinema', CINEMA_RULES.bots.names],
    ['thien-vi', THIEN_RULES.bots.names],
    ...Object.entries(THIEN_RULES.bots.byLang).map(([lang, words]) => [`thien-${lang}`, words.names]),
    ['game', GAME_RULES.bots.names],
    ['taixiu', TAI_XIU_RULES.bots.names],
    ['loto', LOTO_RULES.bots.names],
  ];
  for (const [room, names] of pools) {
    assert.ok(names.length >= 100, `${room} đủ tên cho addbot 100`);
    assert.equal(new Set(names).size, names.length, `${room} không trùng tên trong kho`);
    assert.ok(names.every((name) => typeof name === 'string' && name.trim() === name && !/\s\d+$/.test(name)), `${room} không có tên đánh số`);
  }
});
