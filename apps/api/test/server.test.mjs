import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyJoinTicket } from '@chanh-dien/session-token';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { createMemoryDirectory } from '@chanh-dien/room-directory';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { createJoinResponse, handleApiRequest, listPublicRooms, locateRoom } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(url, options = {}) {
  const response = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; return this; },
    end(body = '') { this.body += body; },
  };
  await handleApiRequest({ method: 'GET', url, headers: {} }, response, options);
  return response;
}

test('API công bố trạng thái và protocol version', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok', service: 'api', protocolVersion: PROTOCOL_VERSION });
});

test('sảnh công bố chánh điện, Cinema và phòng game với sức chứa theo room rules', () => {
  assert.deepEqual(listPublicRooms(), [{
    id: 'thien-1', type: 'thien', name: 'Chánh điện', status: 'open', participantCount: 0,
    maxParticipants: 500, seats: THIEN_RULES.seats, lang: 'vi',
  }, {
    id: 'cinema-1', type: 'cinema', name: 'Cinema #1', status: 'open', participantCount: 0,
    maxParticipants: 500, seats: 100, lang: 'vi',
  }, {
    id: 'game-1', type: 'game', name: 'Bầu Cua #1', status: 'open', participantCount: 0,
    maxParticipants: 500, seats: undefined, lang: 'vi',
  }, {
    id: 'taixiu-1', type: 'taixiu', name: 'Tài Xỉu #1', status: 'open', participantCount: 0,
    maxParticipants: 500, seats: undefined, lang: 'vi',
  }, {
    id: 'loto-1', type: 'loto', name: 'Lô Tô #1', status: 'open', participantCount: 0,
    maxParticipants: 500, seats: undefined, lang: 'vi',
  }]);
});

test('tham gia phòng cấp vé ký số khớp người và phòng', () => {
  const result = createJoinResponse({ roomId: 'cinema-1', displayName: ' Minh An ' }, {
    secret: SECRET, now: 1_000, realtimeUrl: 'ws://local/ws',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.displayName, 'Minh An');
  assert.equal(result.body.realtimeUrl, 'ws://local/ws');
  const verified = verifyJoinTicket(result.body.ticket, SECRET, { now: 2_000 });
  assert.equal(verified.ok, true);
  assert.equal(verified.value.participantId, result.body.participantId);
  assert.equal(verified.value.roomId, 'cinema-1');
});

test('tham gia từ chối phòng lạ và tên rỗng', () => {
  assert.equal(createJoinResponse({ roomId: 'missing', displayName: 'An' }, { secret: SECRET }).status, 404);
  assert.equal(createJoinResponse({ roomId: 'cinema-1', displayName: '  ' }, { secret: SECRET }).status, 400);
});

test('API trả JSON 404 cho route chưa có', async () => {
  const response = await request('/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'not_found' });
});

test('định vị phòng: trả máy đang giữ, chưa ai giữ thì chọn máy ít kết nối nhất', async () => {
  const directory = createMemoryDirectory();
  assert.equal(await locateRoom('cinema-1', { directory }), null);

  await directory.registerNode('rt-a', { url: 'ws://a/ws', rooms: 3, connections: 40 });
  await directory.registerNode('rt-b', { url: 'ws://b/ws', rooms: 1, connections: 5 });
  assert.deepEqual(await locateRoom('cinema-1', { directory }), { nodeId: 'rt-b', realtimeUrl: 'ws://b/ws' });

  await directory.acquireRoom('cinema-1', 'rt-a');
  assert.deepEqual(await locateRoom('cinema-1', { directory }), { nodeId: 'rt-a', realtimeUrl: 'ws://a/ws' });

  // Máy giữ phòng đã biến mất khỏi danh bạ (chết) thì chọn máy còn sống.
  await directory.removeNode('rt-a');
  assert.deepEqual(await locateRoom('cinema-1', { directory }), { nodeId: 'rt-b', realtimeUrl: 'ws://b/ws' });
});

test('API locate trả 404 cho phòng lạ và 503 khi không có máy realtime', async () => {
  const directory = createMemoryDirectory();
  assert.equal((await request('/api/v1/rooms/missing/locate', { directory })).status, 404);
  assert.deepEqual(JSON.parse((await request('/api/v1/rooms/cinema-1/locate', { directory })).body), { error: 'no_realtime_node' });
  await directory.registerNode('rt-a', { url: 'ws://a/ws', rooms: 0, connections: 0 });
  const response = await request('/api/v1/rooms/cinema-1/locate', { directory });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { roomId: 'cinema-1', nodeId: 'rt-a', realtimeUrl: 'ws://a/ws' });
});

test('sảnh cộng số người từ các máy realtime còn sống', async () => {
  const directory = createMemoryDirectory();
  await directory.registerNode('rt-a', { url: 'ws://a/ws', roomCounts: { 'cinema-1': 12 } });
  await directory.registerNode('rt-b', { url: 'ws://b/ws', roomCounts: { 'cinema-1': 3, 'cinema-9': -1 } });
  const response = await request('/api/v1/rooms', { directory });
  const cinema = (body) => JSON.parse(body).rooms.find((room) => room.id === 'cinema-1');
  assert.equal(cinema(response.body).participantCount, 15);
  assert.equal(cinema((await request('/api/v1/rooms')).body).participantCount, 0);
});
