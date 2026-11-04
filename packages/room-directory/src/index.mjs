// Danh bạ phòng: máy realtime nào đang giữ phòng nào (lease + epoch) và snapshot để dựng lại phòng.
// Hai bản cùng hợp đồng: bộ nhớ (test, chạy một máy) và Redis (nhiều máy).

export const LEASE_TTL_MS = 10_000;
export const NODE_TTL_MS = 10_000;
export const SNAPSHOT_TTL_MS = 10 * 60_000;

const ownerKey = (prefix, roomId) => `${prefix}room:${roomId}:owner`;
const epochKey = (prefix, roomId) => `${prefix}room:${roomId}:epoch`;
const snapshotKey = (prefix, roomId) => `${prefix}room:${roomId}:snapshot`;
const nodeKey = (prefix, nodeId) => `${prefix}node:${nodeId}`;
const nodesKey = (prefix) => `${prefix}nodes`;

function ownerToken(epoch, nodeId) {
  return `${epoch}:${nodeId}`;
}

function parseOwner(value) {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  return { epoch: Number(value.slice(0, separator)), nodeId: value.slice(separator + 1) };
}

// Snapshot hỏng coi như không có: phòng mở trống thay vì kẹt không mở được.
function parseSnapshot(value) {
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    return record !== null && typeof record === 'object' && !Array.isArray(record) ? record : null;
  } catch {
    return null;
  }
}

export function createMemoryDirectory(options = {}) {
  const now = options.now || Date.now;
  const values = new Map();
  const epochs = new Map();

  function read(key) {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= now()) {
      values.delete(key);
      return null;
    }
    return entry.value;
  }

  function write(key, value, ttlMs) {
    values.set(key, { value, expiresAt: ttlMs ? now() + ttlMs : 0 });
  }

  const owns = (roomId, nodeId, epoch) => read(ownerKey('', roomId)) === ownerToken(epoch, nodeId);

  return {
    async registerNode(nodeId, info, ttlMs = NODE_TTL_MS) {
      write(nodeKey('', nodeId), JSON.stringify({ ...info, nodeId }), ttlMs);
    },
    async removeNode(nodeId) {
      values.delete(nodeKey('', nodeId));
    },
    async listNodes() {
      const nodes = [];
      for (const key of [...values.keys()]) {
        if (!key.startsWith('node:')) continue;
        const value = read(key);
        if (value) nodes.push(JSON.parse(value));
      }
      return nodes;
    },
    async acquireRoom(roomId, nodeId, ttlMs = LEASE_TTL_MS) {
      const owner = parseOwner(read(ownerKey('', roomId)));
      if (owner && owner.nodeId !== nodeId) return { ok: false, owner };
      if (owner) {
        write(ownerKey('', roomId), ownerToken(owner.epoch, nodeId), ttlMs);
        return { ok: true, epoch: owner.epoch };
      }
      const epoch = (epochs.get(roomId) || 0) + 1;
      epochs.set(roomId, epoch);
      write(ownerKey('', roomId), ownerToken(epoch, nodeId), ttlMs);
      return { ok: true, epoch };
    },
    async renewRoom(roomId, nodeId, epoch, ttlMs = LEASE_TTL_MS) {
      if (!owns(roomId, nodeId, epoch)) return false;
      write(ownerKey('', roomId), ownerToken(epoch, nodeId), ttlMs);
      return true;
    },
    async releaseRoom(roomId, nodeId, epoch, { dropSnapshot = false } = {}) {
      if (!owns(roomId, nodeId, epoch)) return false;
      values.delete(ownerKey('', roomId));
      if (dropSnapshot) values.delete(snapshotKey('', roomId));
      return true;
    },
    async getRoomOwner(roomId) {
      return parseOwner(read(ownerKey('', roomId)));
    },
    async saveSnapshot(roomId, nodeId, epoch, record, ttlMs = SNAPSHOT_TTL_MS) {
      if (!owns(roomId, nodeId, epoch)) return false;
      write(snapshotKey('', roomId), JSON.stringify(record), ttlMs);
      return true;
    },
    async loadSnapshot(roomId) {
      return parseSnapshot(read(snapshotKey('', roomId)));
    },
    async close() {},
  };
}

// Mỗi script chạy nguyên tử trong Redis; owner lưu dạng "epoch:nodeId".
const ACQUIRE = `
local current = redis.call('GET', KEYS[1])
if current then
  local sep = string.find(current, ':', 1, true)
  local owner = string.sub(current, sep + 1)
  if owner == ARGV[1] then
    redis.call('PEXPIRE', KEYS[1], ARGV[2])
    return {1, current}
  end
  return {0, current}
end
local epoch = redis.call('INCR', KEYS[2])
local token = epoch .. ':' .. ARGV[1]
redis.call('SET', KEYS[1], token, 'PX', ARGV[2])
return {1, token}`;

const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0`;

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  if ARGV[2] == '1' then redis.call('DEL', KEYS[2]) end
  return 1
end
return 0`;

const SAVE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
  return 1
end
return 0`;

export function createRedisDirectory(redis, options = {}) {
  const prefix = options.prefix ?? 'cdo:';

  return {
    async registerNode(nodeId, info, ttlMs = NODE_TTL_MS) {
      await redis.multi()
        .set(nodeKey(prefix, nodeId), JSON.stringify({ ...info, nodeId }), 'PX', ttlMs)
        .sadd(nodesKey(prefix), nodeId)
        .exec();
    },
    async removeNode(nodeId) {
      await redis.multi().del(nodeKey(prefix, nodeId)).srem(nodesKey(prefix), nodeId).exec();
    },
    async listNodes() {
      const ids = await redis.smembers(nodesKey(prefix));
      if (!ids.length) return [];
      const values = await redis.mget(ids.map((id) => nodeKey(prefix, id)));
      const expired = ids.filter((_, index) => values[index] === null);
      if (expired.length) await redis.srem(nodesKey(prefix), ...expired);
      return values.filter(Boolean).map((value) => JSON.parse(value));
    },
    async acquireRoom(roomId, nodeId, ttlMs = LEASE_TTL_MS) {
      const [ok, token] = await redis.eval(ACQUIRE, 2, ownerKey(prefix, roomId), epochKey(prefix, roomId), nodeId, ttlMs);
      const owner = parseOwner(token);
      return ok === 1 ? { ok: true, epoch: owner.epoch } : { ok: false, owner };
    },
    async renewRoom(roomId, nodeId, epoch, ttlMs = LEASE_TTL_MS) {
      return await redis.eval(RENEW, 1, ownerKey(prefix, roomId), ownerToken(epoch, nodeId), ttlMs) === 1;
    },
    async releaseRoom(roomId, nodeId, epoch, { dropSnapshot = false } = {}) {
      const keys = [ownerKey(prefix, roomId), snapshotKey(prefix, roomId)];
      return await redis.eval(RELEASE, 2, ...keys, ownerToken(epoch, nodeId), dropSnapshot ? '1' : '0') === 1;
    },
    async getRoomOwner(roomId) {
      return parseOwner(await redis.get(ownerKey(prefix, roomId)));
    },
    async saveSnapshot(roomId, nodeId, epoch, record, ttlMs = SNAPSHOT_TTL_MS) {
      const keys = [ownerKey(prefix, roomId), snapshotKey(prefix, roomId)];
      return await redis.eval(SAVE, 2, ...keys, ownerToken(epoch, nodeId), JSON.stringify(record), ttlMs) === 1;
    },
    async loadSnapshot(roomId) {
      return parseSnapshot(await redis.get(snapshotKey(prefix, roomId)));
    },
    async close() {
      await redis.quit();
    },
  };
}

// REDIS_URL có thì dùng Redis (nhiều máy), không thì dùng bộ nhớ (chỉ một máy).
export async function createDirectoryFromEnv(env = process.env) {
  if (!env.REDIS_URL) return { directory: createMemoryDirectory(), shared: false };
  const { Redis } = await import('ioredis');
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  await redis.connect();
  return { directory: createRedisDirectory(redis, { prefix: env.REDIS_PREFIX }), shared: true };
}
