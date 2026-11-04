import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageForBirthYear, normalizePrayerSlip, starKeyForAge } from '../src/index.mjs';

test('sao Cửu Diệu lặp mỗi 9 tuổi âm, khác nhau theo nam nữ', () => {
  assert.equal(starKeyForAge(1, 'male'), 'laHau');
  assert.equal(starKeyForAge(10, 'male'), 'laHau');
  assert.equal(starKeyForAge(100, 'male'), 'laHau');
  assert.equal(starKeyForAge(1, 'female'), 'keDo');
  assert.equal(starKeyForAge(8, 'female'), 'thaiBach');
  assert.equal(starKeyForAge(0, 'male'), null);
  assert.equal(starKeyForAge(101, 'female'), null);
});

test('tính tuổi âm từ năm sinh trong phạm vi 1–100 tuổi', () => {
  assert.equal(ageForBirthYear(1990, 2026), 37);
  assert.equal(ageForBirthYear(2026, 2026), 1);
  assert.equal(ageForBirthYear(1927, 2026), 100);
  assert.equal(ageForBirthYear(1926, 2026), null);
});

test('chuẩn hóa sớ cầu an tính sao; sớ cầu siêu không gán sao', () => {
  const base = {
    requesterName: ' Diệu   Hạnh ', roomId: 'thien-az-vi-1', state: 'az', lang: 'vi', note: ' Cầu   bình an ',
    people: [{ name: ' Nguyễn Văn An ', dharmaName: ' Thiện An ', gender: 'male', birthYear: 1990 }],
  };
  const peace = normalizePrayerSlip({ ...base, type: 'peace' }, { year: 2026 });
  assert.deepEqual(peace.people[0], { name: 'Nguyễn Văn An', dharmaName: 'Thiện An', gender: 'male', birthYear: 1990, age: 37, starKey: 'laHau' });
  assert.equal(peace.note, 'Cầu bình an');
  assert.equal(normalizePrayerSlip({ ...base, type: 'memorial' }, { year: 2026 }).people[0].starKey, null);
  assert.equal(normalizePrayerSlip({ ...base, type: 'peace', people: [{ ...base.people[0], birthYear: undefined, age: 37 }] }, { year: 2026 }).people[0].birthYear, 1990);
  assert.equal(normalizePrayerSlip({ ...base, type: 'peace', people: [{ ...base.people[0], birthYear: 1926 }] }, { year: 2026 }), null);
});
