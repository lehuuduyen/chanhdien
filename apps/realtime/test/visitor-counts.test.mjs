import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presenceReporter, Room, RoomRegistry } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

test('số người thật đang kết nối: không tính bot / người mất kết nối, thành viên nhiều tab tính một; báo kèm presence', async () => {
  const registry = new RoomRegistry({ nodeId: 'rt-test', botCounts: { thien: 0, cinema: 0, game: 0, taixiu: 0, loto: 0 } });
  const temple = new Room('thien-ca-vi-1', { botCount: 0 });
  const cinema = new Room('cinema-vn', { botCount: 0 });
  const lotto = new Room('loto-1', { botCount: 0 });
  for (const room of [temple, cinema, lotto]) registry.rooms.set(room.id, room);
  temple.participants.set('m1', { id: 'm1', accountId: 'a-member-0001', connected: true });
  temple.participants.set('g1', { id: 'g1', connected: true });
  temple.participants.set('g2', { id: 'g2', connected: false });
  temple.participants.set('b1', { id: 'b1', bot: true, connected: true });
  cinema.participants.set('m1b', { id: 'm1b', accountId: 'a-member-0001', connected: true });
  cinema.participants.set('g3', { id: 'g3', connected: true });
  lotto.participants.set('b2', { id: 'b2', bot: true, connected: true });
  const expected = { members: 1, guests: 2, areas: { temple: 2, cinema: 1, games: 0 } };
  assert.deepEqual(registry.humanCounts(), expected);

  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return new Response('{"ok":true}');
  };
  try {
    await presenceReporter('http://127.0.0.1:4000', SECRET, registry)();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.url, 'http://127.0.0.1:4000/internal/presence');
  assert.equal(sent.body.nodeId, 'rt-test');
  assert.deepEqual(sent.body.humans, expected);
  for (const room of [temple, cinema, lotto]) room.close();
});
