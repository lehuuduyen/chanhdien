import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { Redis } from 'ioredis';
import { createMemoryDirectory, createRedisDirectory } from '../src/index.mjs';

// Cùng một bộ test cho bản bộ nhớ và bản Redis (Redis chỉ chạy khi có REDIS_URL).
function contract(name, setup) {
  describe(name, () => {
    test('chỉ một máy giữ được phòng; máy khác thấy chủ hiện tại', async () => {
      const { directory, roomId } = await setup();
      assert.deepEqual(await directory.acquireRoom(roomId, 'rt-a', 1_000), { ok: true, epoch: 1 });
      assert.deepEqual(await directory.acquireRoom(roomId, 'rt-a', 1_000), { ok: true, epoch: 1 });
      assert.deepEqual(await directory.acquireRoom(roomId, 'rt-b', 1_000), { ok: false, owner: { epoch: 1, nodeId: 'rt-a' } });
      assert.deepEqual(await directory.getRoomOwner(roomId), { epoch: 1, nodeId: 'rt-a' });
    });

    test('lease hết hạn thì máy khác nhận phòng với epoch mới; máy cũ bị chặn ghi', async () => {
      const { directory, roomId, advance } = await setup();
      await directory.acquireRoom(roomId, 'rt-a', 50);
      assert.equal(await directory.saveSnapshot(roomId, 'rt-a', 1, { revision: 3, participants: [] }), true);
      await advance(80);
      assert.deepEqual(await directory.acquireRoom(roomId, 'rt-b', 1_000), { ok: true, epoch: 2 });
      assert.equal(await directory.renewRoom(roomId, 'rt-a', 1, 1_000), false);
      assert.equal(await directory.saveSnapshot(roomId, 'rt-a', 1, { revision: 9, participants: [] }), false);
      assert.deepEqual(await directory.loadSnapshot(roomId), { revision: 3, participants: [] });
      assert.equal(await directory.renewRoom(roomId, 'rt-b', 2, 1_000), true);
    });

    test('trả lease giữ snapshot cho máy sau; phòng trống thì xóa snapshot', async () => {
      const { directory, roomId } = await setup();
      await directory.acquireRoom(roomId, 'rt-a', 1_000);
      await directory.saveSnapshot(roomId, 'rt-a', 1, { revision: 1, participants: [] });
      assert.equal(await directory.releaseRoom(roomId, 'rt-b', 1), false);
      assert.equal(await directory.releaseRoom(roomId, 'rt-a', 1), true);
      assert.equal(await directory.getRoomOwner(roomId), null);
      assert.deepEqual(await directory.loadSnapshot(roomId), { revision: 1, participants: [] });

      assert.deepEqual(await directory.acquireRoom(roomId, 'rt-b', 1_000), { ok: true, epoch: 2 });
      assert.equal(await directory.releaseRoom(roomId, 'rt-b', 2, { dropSnapshot: true }), true);
      assert.equal(await directory.loadSnapshot(roomId), null);
    });

    test('máy realtime đăng ký và tự biến mất khi ngừng gửi nhịp', async () => {
      const { directory, advance, nodePrefix } = await setup();
      await directory.registerNode(`${nodePrefix}a`, { url: 'ws://a/ws', rooms: 1, connections: 5 }, 50);
      await directory.registerNode(`${nodePrefix}b`, { url: 'ws://b/ws', rooms: 0, connections: 0 }, 1_000);
      const ids = (await directory.listNodes()).map((node) => node.nodeId).sort();
      assert.deepEqual(ids, [`${nodePrefix}a`, `${nodePrefix}b`]);
      await advance(80);
      assert.deepEqual((await directory.listNodes()).map((node) => node.nodeId), [`${nodePrefix}b`]);
    });
  });
}

let clock = 0;
contract('danh bạ trong bộ nhớ', async () => ({
  directory: createMemoryDirectory({ now: () => clock }),
  roomId: 'cinema-1',
  nodePrefix: 'rt-',
  advance: async (ms) => { clock += ms; },
}));

if (process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL);
  const prefix = `test:${process.pid}:${Date.now()}:`;
  let counter = 0;
  after(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });
  contract('danh bạ Redis', async () => {
    counter += 1;
    return {
      directory: createRedisDirectory(redis, { prefix: `${prefix}${counter}:` }),
      roomId: 'cinema-1',
      nodePrefix: 'rt-',
      advance: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
  });
}
