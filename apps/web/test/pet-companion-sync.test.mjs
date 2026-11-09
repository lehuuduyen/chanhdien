import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingCompanion,
  normalizeCompanion,
  PENDING_COMPANION_MS,
  readPendingCompanion,
  rememberCompanion,
} from '../public/pet-companion-sync.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test('lựa chọn linh thú chờ realtime xác nhận được giữ ngắn hạn qua trang Shop', () => {
  const storage = memoryStorage();
  const record = rememberCompanion({ species: 'crane', level: 4 }, storage, 1_000);
  assert.deepEqual(readPendingCompanion(storage, 1_500), record);
  assert.equal(readPendingCompanion(storage, 1_000 + PENDING_COMPANION_MS + 1), null);
});

test('cho linh thú ở nhà là lựa chọn hợp lệ và không xóa lựa chọn mới hơn', () => {
  const storage = memoryStorage();
  const old = rememberCompanion(null, storage, 1_000);
  const latest = rememberCompanion({ species: 'lion', level: 2 }, storage, 1_001);
  clearPendingCompanion(old, storage);
  assert.deepEqual(readPendingCompanion(storage, 1_002), latest);
  clearPendingCompanion(latest, storage);
  assert.equal(readPendingCompanion(storage, 1_002), null);
});

test('bỏ dữ liệu linh thú chờ giả hoặc hỏng', () => {
  assert.equal(normalizeCompanion({ species: '../lion', level: 1 }), undefined);
  assert.equal(normalizeCompanion({ species: 'lion', level: 0 }), undefined);
  assert.deepEqual(normalizeCompanion({ species: 'turtle', level: 10 }), { species: 'turtle', level: 10 });
});
