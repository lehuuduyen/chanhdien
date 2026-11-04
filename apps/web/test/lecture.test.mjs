import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventStartOn } from '../public/lecture.js';

const local = (at, timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(at);

test('bài giảng 18:00 theo giờ từng tiểu bang, kể cả ngày đổi giờ mùa hè', () => {
  const at = Date.parse('2026-11-01T20:00:00Z');
  assert.equal(local(eventStartOn(at, 'America/Phoenix', 18, 0), 'America/Phoenix'), '11/1/26, 6:00 PM');
  assert.equal(local(eventStartOn(at, 'America/New_York', 18, 0), 'America/New_York'), '11/1/26, 6:00 PM', 'ngày hết giờ mùa hè');
  assert.equal(local(eventStartOn(at, 'Pacific/Honolulu', 18, 0, 1), 'Pacific/Honolulu'), '11/2/26, 6:00 PM');
  assert.equal(local(eventStartOn(Date.parse('2026-03-08T12:00:00Z'), 'America/New_York', 18, 0), 'America/New_York'), '3/8/26, 6:00 PM', 'ngày bắt đầu giờ mùa hè');
  assert.notEqual(eventStartOn(at, 'America/Phoenix', 18, 0), eventStartOn(at, 'America/New_York', 18, 0), 'mỗi tiểu bang một giờ khác nhau');
});
