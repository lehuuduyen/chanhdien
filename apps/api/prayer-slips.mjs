import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePrayerSlip, PRAYER_STATUSES } from '../../packages/prayer-slip/src/index.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createMemoryPrayerSlipStore(initial = [], {
  now = () => Date.now(),
  id = () => `so-${randomUUID()}`,
  year = () => new Date(now()).getFullYear(),
} = {}) {
  let values = Array.isArray(initial) ? clone(initial) : [];
  return {
    create(input) {
      const normalized = normalizePrayerSlip(input, { year: year() });
      if (!normalized) return null;
      const value = { id: id(), ...normalized, status: 'received', submittedAt: now(), updatedAt: now() };
      values.unshift(value);
      values = values.slice(0, 5_000);
      return clone(value);
    },
    list(limit = 100) {
      return clone(values.slice(0, Math.min(5_000, Math.max(1, limit))));
    },
    setStatus(prayerId, status) {
      if (!PRAYER_STATUSES.includes(status)) return null;
      const value = values.find((item) => item.id === prayerId);
      if (!value) return null;
      value.status = status;
      value.updatedAt = now();
      return clone(value);
    },
  };
}

export function openPrayerSlipStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'prayer-slips.json');
  let initial = [];
  try { initial = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  const memory = createMemoryPrayerSlipStore(initial);
  const persist = () => {
    const values = memory.list(5_000);
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
  };
  return {
    create(input) { const value = memory.create(input); if (value) persist(); return value; },
    list: memory.list,
    setStatus(id, status) { const value = memory.setStatus(id, status); if (value) persist(); return value; },
  };
}
