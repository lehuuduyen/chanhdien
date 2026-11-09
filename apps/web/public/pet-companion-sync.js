// Giữ lựa chọn linh thú mới trong lúc API và máy realtime đang đồng bộ. Khi quay lại từ Shop, phiên realtime
// có thể nối lại bằng resume token cũ và phát một room.state còn mang linh thú trước đó; bản ghi ngắn hạn này
// giúp cảnh hiện đúng lựa chọn vừa lưu, rồi tự bỏ khi server đã xác nhận.
const KEY = 'thien-pending-companion';
const CHANNEL = 'lotusgather-pet-companion';
export const PENDING_COMPANION_MS = 60_000;

function safeStorage(storage) {
  if (storage) return storage;
  try { return sessionStorage; } catch { return null; }
}

export function normalizeCompanion(pet) {
  if (pet === null) return null;
  if (!pet || typeof pet !== 'object' || !/^[a-z0-9-]{2,30}$/.test(pet.species || '')) return undefined;
  const level = Number(pet.level);
  if (!Number.isInteger(level) || level < 1 || level > 10) return undefined;
  return { species: pet.species, level };
}

function normalizeRecord(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.at)) return null;
  if (now - value.at < 0 || now - value.at > PENDING_COMPANION_MS) return null;
  const pet = normalizeCompanion(value.pet);
  if (pet === undefined) return null;
  return { pet, at: value.at };
}

export function readPendingCompanion(storage, now = Date.now()) {
  const target = safeStorage(storage);
  if (!target) return null;
  try {
    const record = normalizeRecord(JSON.parse(target.getItem(KEY)), now);
    if (!record) target.removeItem(KEY);
    return record;
  } catch {
    try { target.removeItem(KEY); } catch {}
    return null;
  }
}

export function rememberCompanion(pet, storage, now = Date.now()) {
  const normalized = normalizeCompanion(pet);
  if (normalized === undefined) return null;
  const record = { pet: normalized, at: now };
  const target = safeStorage(storage);
  try { target?.setItem(KEY, JSON.stringify(record)); } catch {}
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(record);
    channel.close();
  } catch {}
  return record;
}

export function clearPendingCompanion(record, storage) {
  const target = safeStorage(storage);
  if (!target) return;
  try {
    const saved = JSON.parse(target.getItem(KEY));
    // Không xóa một lựa chọn mới hơn vừa được ghi từ Shop/tab khác.
    if (!record || saved?.at === record.at) target.removeItem(KEY);
  } catch {}
}

export function onCompanionRemembered(callback) {
  if (typeof callback !== 'function') return () => {};
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event) => {
      const record = normalizeRecord(event.data);
      if (record) callback(record);
    });
    return () => channel.close();
  } catch {
    return () => {};
  }
}
