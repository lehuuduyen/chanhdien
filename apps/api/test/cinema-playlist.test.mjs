import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { internalKey } from '@chanh-dien/session-token';
import { createMemoryCinemaPlaylistStore, normalizeCinemaPlaylist, openCinemaPlaylistStore } from '../cinema-playlist.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const ADMIN_SECRET = 'admin-secret-with-at-least-16-characters';

async function request(options, method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0,
    body: '',
    setHeader() {},
    writeHead(status) { this.status = status; return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: JSON.parse(res.body) };
}

test('danh sách rạp nhận link/ID YouTube, bỏ trùng và giới hạn dữ liệu', () => {
  assert.deepEqual(normalizeCinemaPlaylist({ videos: [
    'https://youtu.be/dQw4w9WgXcQ',
    { videoId: 'dQw4w9WgXcQ', title: 'Trùng' },
    { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'Phim A' },
  ] }), {
    videos: [{ videoId: 'dQw4w9WgXcQ' }, { videoId: 'aaaaaaaaaaa', title: 'Phim A' }],
  });
  assert.equal(normalizeCinemaPlaylist({ videos: ['không-phải-video'] }), null);
  assert.equal(normalizeCinemaPlaylist({ videos: Array.from({ length: 51 }, () => 'dQw4w9WgXcQ') }), null);
});

test('chỉ admin đổi danh sách; máy realtime đọc bằng khóa nội bộ', async () => {
  const cinemaPlaylistStore = createMemoryCinemaPlaylistStore();
  const options = { secret: SECRET, adminSecret: ADMIN_SECRET, cinemaPlaylistStore };
  const body = { videos: ['https://youtu.be/dQw4w9WgXcQ', 'aaaaaaaaaaa'] };
  assert.equal((await request(options, 'PUT', '/api/v1/admin/cinema/playlist?roomId=cinema-az', body)).status, 403);
  const saved = await request(options, 'PUT', '/api/v1/admin/cinema/playlist?roomId=cinema-az', body, { 'x-admin-key': ADMIN_SECRET });
  assert.deepEqual(saved, { status: 200, json: { videos: [{ videoId: 'dQw4w9WgXcQ' }, { videoId: 'aaaaaaaaaaa' }] } });
  assert.equal((await request(options, 'GET', '/internal/cinema/playlist?roomId=cinema-az')).status, 403);
  const internal = await request(options, 'GET', '/internal/cinema/playlist?roomId=cinema-az', undefined, { 'x-internal-key': internalKey(SECRET) });
  assert.deepEqual(internal.json, saved.json);
  assert.deepEqual((await request(options, 'GET', '/api/v1/admin/cinema/playlist?roomId=cinema-az', undefined, { 'x-admin-key': ADMIN_SECRET })).json, saved.json);
  assert.deepEqual((await request(options, 'GET', '/api/v1/admin/cinema/playlist?roomId=cinema-vn', undefined, { 'x-admin-key': ADMIN_SECRET })).json, { videos: [] });
  const batch = await request(options, 'PUT', '/api/v1/admin/cinema/playlist?roomId=cinema-vn', {
    roomIds: ['cinema-vn', 'cinema-ca', 'cinema-az', 'cinema-ca'],
    videos: ['bbbbbbbbbbb'],
  }, { 'x-admin-key': ADMIN_SECRET });
  assert.deepEqual(batch, { status: 200, json: {
    roomIds: ['cinema-vn', 'cinema-ca', 'cinema-az'],
    videos: [{ videoId: 'bbbbbbbbbbb' }],
  } });
  for (const roomId of batch.json.roomIds) {
    assert.deepEqual((await request(options, 'GET', `/api/v1/admin/cinema/playlist?roomId=${roomId}`, undefined, { 'x-admin-key': ADMIN_SECRET })).json, {
      videos: [{ videoId: 'bbbbbbbbbbb' }],
    });
  }
  assert.equal((await request(options, 'PUT', '/api/v1/admin/cinema/playlist', {
    roomIds: [], videos: ['bbbbbbbbbbb'],
  }, { 'x-admin-key': ADMIN_SECRET })).status, 400);
  assert.deepEqual(await request(options, 'GET', '/api/v1/admin/cinema/playlist?roomId=cinema-9', undefined, { 'x-admin-key': ADMIN_SECRET }), {
    status: 400, json: { error: 'invalid_cinema_room' },
  });
});

test('mỗi rạp có danh sách riêng và được lưu bền trong file riêng tư', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'chanh-dien-cinema-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const first = openCinemaPlaylistStore(dataDir);
  first.update('cinema-vn', { videos: ['dQw4w9WgXcQ'] });
  first.update('cinema-az', { videos: [{ videoId: 'aaaaaaaaaaa', title: 'Phim A' }] });
  first.updateMany(['cinema-ca', 'cinema-tx'], { videos: ['bbbbbbbbbbb'] });
  const file = join(dataDir, 'cinema-playlist.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
    version: 2,
    rooms: {
      'cinema-vn': { videos: [{ videoId: 'dQw4w9WgXcQ' }] },
      'cinema-az': { videos: [{ videoId: 'aaaaaaaaaaa', title: 'Phim A' }] },
      'cinema-ca': { videos: [{ videoId: 'bbbbbbbbbbb' }] },
      'cinema-tx': { videos: [{ videoId: 'bbbbbbbbbbb' }] },
    },
  });
  const reopened = openCinemaPlaylistStore(dataDir);
  assert.deepEqual(reopened.get('cinema-vn'), { videos: [{ videoId: 'dQw4w9WgXcQ' }] });
  assert.deepEqual(reopened.get('cinema-az'), { videos: [{ videoId: 'aaaaaaaaaaa', title: 'Phim A' }] });
  assert.deepEqual(reopened.get('cinema-ca'), { videos: [{ videoId: 'bbbbbbbbbbb' }] });
});
