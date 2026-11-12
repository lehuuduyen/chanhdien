import assert from 'node:assert/strict';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolvePublicFile, resolveWebFile } from '../server.mjs';

test('web resolve sảnh phòng', () => {
  const file = resolvePublicFile('/');
  assert.ok(file);
  assert.match(readFileSync(file, 'utf8'), /Phòng trải nghiệm/);
  assert.ok(resolveWebFile('/home-i18n.js'));
  assert.ok(resolveWebFile('/home.js'));
  assert.ok(resolveWebFile('/thien-scene.js'));
  assert.match(readFileSync(file, 'utf8'), /id="homeLanguage"/);
});

test('web phục vụ phòng Thiền và asset legacy trong cùng origin', () => {
  const room = resolveWebFile('/thien/');
  const background = resolveWebFile('/thien/assets/hall.webp');
  assert.ok(room);
  assert.ok(background);
  assert.match(readFileSync(room, 'utf8'), /Vào chánh điện/);
});

test('web có client phòng Cinema realtime', () => {
  const room = resolveWebFile('/room.html');
  const client = resolveWebFile('/room.js');
  assert.ok(room);
  assert.ok(client);
  assert.match(readFileSync(room, 'utf8'), /Vào rạp/);
  const source = readFileSync(client, 'utf8');
  for (const type of ['seat.select', 'chat.send', 'queue.add', 'vote.skip', 'playback.report']) assert.ok(source.includes(`'${type}'`), type);
});

test('mỗi quốc gia / tiểu bang có rạp riêng; admin chọn playlist theo khu vực', () => {
  const room = readFileSync(resolveWebFile('/room.html'), 'utf8');
  const client = readFileSync(resolveWebFile('/room.js'), 'utf8');
  const admin = readFileSync(resolveWebFile('/admin-thien.html'), 'utf8');
  const adminClient = readFileSync(resolveWebFile('/admin-thien.js'), 'utf8');
  const temple = readFileSync(resolveWebFile('/chanh-dien.js'), 'utf8');
  assert.match(room, /id="cinemaRoomLink"/);
  assert.match(admin, /<select id="cinemaRoom" multiple size="9"/);
  assert.match(adminClient, /US_STATES\.map\(\(state\) => new Option\(/);
  assert.match(client, /parseCinemaRoomId\(requestedRoomId\)/);
  assert.match(temple, /cinemaRoomId\(state\)/);
  assert.match(adminClient, /const roomIds = selectedCinemaRoomIds\(\)/);
  assert.match(adminClient, /selectAllCinemas/);
  assert.ok(resolveWebFile('/region-cinema.js'));
});

test('Cinema đặt ô nhập ngay dưới lịch sử trò chuyện và giữ tên người gửi từ máy khác', () => {
  const markup = readFileSync(resolveWebFile('/room.html'), 'utf8');
  const client = readFileSync(resolveWebFile('/room.js'), 'utf8');
  assert.match(markup, /data-part="chat"[\s\S]*id="messages"[\s\S]*id="chatForm"[\s\S]*id="chatInput"/);
  assert.match(markup, /id="messages"[^>]*role="log"/);
  assert.match(client, /participants\.get\(message\.participantId\)\?\.displayName \|\| message\.displayName \|\| 'Khách'/);
});

test('web không cho thoát khỏi public directory', () => {
  assert.equal(resolvePublicFile('/../../package.json'), null);
  assert.equal(resolveWebFile('/thien/assets/../../../package.json'), null);
});

test('web phục vụ scene engine, dữ liệu cảnh, trang thử cảnh và công cụ đặt ghế', () => {
  for (const pathname of ['/engine/index.mjs', '/engine/renderer.mjs', '/engine/cinema3d.mjs', '/scenes/cinema-default/scene.json',
    '/scenes/thien-default/scene.json', '/scene-demo.html', '/tools/seat-editor/', '/game.html', '/ung-ho.html', '/ho-tro.html']) {
    assert.ok(resolveWebFile(pathname), pathname);
  }
  assert.equal(resolveWebFile('/engine/../../room-rules/src/index.mjs'), null);
  assert.equal(resolveWebFile('/scenes/../package.json'), null);
  assert.equal(resolveWebFile('/tools/seat-editor/../../package.json'), null);
});

test('web làm cổng vào chung: /api tới API, /ws tới realtime, giữ mã lỗi khi bị từ chối', async (t) => {
  const { once } = await import('node:events');
  const { WebSocket } = await import('ws');
  const { createApiServer } = await import('../../api/server.mjs');
  const { createRealtimeServer } = await import('../../realtime/server.mjs');
  const { createWebServer } = await import('../server.mjs');
  const secret = 'test-secret-with-at-least-thirty-two-characters';
  const api = createApiServer({ secret }).listen(0, '127.0.0.1');
  const realtime = createRealtimeServer({ secret }).listen(0, '127.0.0.1');
  await Promise.all([once(api, 'listening'), once(realtime, 'listening')]);
  const web = createWebServer({
    apiUpstream: `http://127.0.0.1:${api.address().port}`,
    realtimeUpstream: `http://127.0.0.1:${realtime.address().port}`,
  }).listen(0, '127.0.0.1');
  await once(web, 'listening');
  const origin = `http://127.0.0.1:${web.address().port}`;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    for (const server of [web, api, realtime]) await new Promise((resolve) => server.close(resolve));
  });

  const join = await (await fetch(`${origin}/api/v1/rooms/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId: 'cinema-1', displayName: 'An' }),
  })).json();
  assert.equal(join.realtimeUrl, '/ws');

  // Origin là tên miền công khai (tunnel) và Host được giữ nguyên qua gateway.
  const socket = new WebSocket(`ws://127.0.0.1:${web.address().port}/ws?ticket=${join.ticket}`, {
    headers: { origin: 'https://demo.example.app', host: 'demo.example.app' },
  });
  sockets.push(socket);
  await once(socket, 'open');
  const welcome = new Promise((resolve) => socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.type === 'welcome') resolve(message);
  }));
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: 'cinema-1', displayName: 'An' }));
  assert.equal((await welcome).epoch, 1);

  const rejected = new WebSocket(`ws://127.0.0.1:${web.address().port}/ws?ticket=${join.ticket}`, {
    headers: { origin: 'https://trang-la.example' },
  });
  rejected.on('error', () => {});
  const [, response] = await once(rejected, 'unexpected-response');
  assert.equal(response.statusCode, 403);
});

test('web trả đúng đoạn file khi được hỏi Range (Safari cần để phát nhạc)', async (t) => {
  const { once } = await import('node:events');
  const { createWebServer, parseRange } = await import('../server.mjs');
  assert.deepEqual(parseRange('bytes=0-1', 10), { start: 0, end: 1 });
  assert.deepEqual(parseRange('bytes=5-', 10), { start: 5, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=8-100', 10), { start: 8, end: 9 });
  assert.equal(parseRange('bytes=10-', 10), 'invalid');
  assert.equal(parseRange('bytes=0-1,4-5', 10), null);

  const web = createWebServer().listen(0, '127.0.0.1');
  await once(web, 'listening');
  t.after(() => new Promise((resolve) => web.close(resolve)));
  const url = `http://127.0.0.1:${web.address().port}/thien/assets/music/music1.mp3`;
  const partial = await fetch(url, { headers: { range: 'bytes=0-1' } });
  assert.equal(partial.status, 206);
  assert.match(partial.headers.get('content-range'), /^bytes 0-1\/\d+$/);
  assert.equal((await partial.arrayBuffer()).byteLength, 2);
  const whole = await fetch(url, { method: 'HEAD' });
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal((await fetch(url, { headers: { range: 'bytes=999999999-' } })).status, 416);
});

test('trang gắn phiên bản cho mọi module để deploy mới có hiệu lực ngay dù CDN giữ JS lâu', async (t) => {
  const { once } = await import('node:events');
  const { createWebServer, versionHtml } = await import('../server.mjs');
  const web = createWebServer().listen(0, '127.0.0.1');
  await once(web, 'listening');
  t.after(() => new Promise((resolve) => web.close(resolve)));
  const base = `http://127.0.0.1:${web.address().port}`;
  const page = await fetch(`${base}/chanh-dien.html`);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  const html = await page.text();
  const entry = /<script type="module" src="\/chanh-dien\.js\?v=([0-9a-f]{10})">/.exec(html);
  assert.ok(entry, 'script chính có ?v=<hash>');
  assert.match(html, /href="\/chanh-dien\.css\?v=[0-9a-f]{10}"/);
  const maps = html.match(/<script type="importmap">([\s\S]*?)<\/script>/g);
  assert.equal(maps.length, 1, 'chỉ một import map');
  const { imports } = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(imports.three, '/vendor/three/build/three.module.js', 'giữ khai báo sẵn có');
  assert.equal(imports['/chanh-dien.js'], `/chanh-dien.js?v=${entry[1]}`, 'script trong trang và import map cùng một URL');
  assert.match(imports['/hide-seek-ui.js'], /^\/hide-seek-ui\.js\?v=[0-9a-f]{10}$/);
  assert.match(imports['/engine/explore3d.mjs'], /^\/engine\/explore3d\.mjs\?v=[0-9a-f]{10}$/);
  assert.match(imports['/engine/landscape/common.mjs'], /^\/engine\/landscape\/common\.mjs\?v=[0-9a-f]{10}$/, 'bộ đồ phong cảnh trong thư mục con');
  assert.match(imports['/shared/room-rules.mjs'], /^\/shared\/room-rules\.mjs\?v=/);

  // Đúng phiên bản: giữ lâu; phiên bản cũ hoặc không có: luôn hỏi lại.
  assert.equal((await fetch(`${base}/chanh-dien.js?v=${entry[1]}`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${base}/chanh-dien.js?v=0000000000`)).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(`${base}/chanh-dien.js`)).headers.get('cache-control'), 'no-cache');

  // Trang chưa có import map: chèn trước script đầu tiên.
  const plain = versionHtml('<head><title>x</title><script type="module">import "/a.js";</script></head>', { '/a.js': '/a.js?v=1' });
  assert.equal(plain, '<head><title>x</title><script type="importmap">{"imports":{"/a.js":"/a.js?v=1"}}</script>\n  <script type="module">import "/a.js";</script></head>');
});

test('nhận link YouTube các dạng phổ biến, từ chối link lạ', async () => {
  const { parseYouTubeId } = await import('../public/youtube.js');
  for (const input of [
    'dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    '  https://www.youtube.com/live/dQw4w9WgXcQ  ',
  ]) assert.equal(parseYouTubeId(input), 'dQw4w9WgXcQ', input);
  for (const input of ['', 'https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/ngan', 'xin chào']) {
    assert.equal(parseYouTubeId(input), null, input);
  }
});

test('web có trang chánh điện nhiều người và các module dùng chung', () => {
  for (const pathname of ['/chanh-dien.html', '/chanh-dien.js', '/realtime-session.js', '/temple-audio.js', '/admin-thien.html', '/admin-thien.js', '/admin-thien.css', '/shared/room-rules.mjs', '/shared/prayer-slip.mjs']) {
    assert.ok(resolveWebFile(pathname), pathname);
  }
  const client = readFileSync(resolveWebFile('/chanh-dien.js'), 'utf8');
  for (const type of ['offering.send', 'avatar.set', 'seat.select', 'chat.send']) assert.ok(client.includes(`'${type}'`), type);
  assert.match(readFileSync(resolvePublicFile('/'), 'utf8'), /href="\/chanh-dien\.html"/);
});

test('shop hiện linh thú thành khu riêng và nhận nuôi qua API an toàn', () => {
  const source = readFileSync(resolveWebFile('/shop.html'), 'utf8');
  assert.match(source, /id="petShop"[\s\S]*id="pets"/);
  assert.match(source, /api\('\/api\/v1\/pets'/);
  assert.match(source, /api\('\/api\/v1\/pets\/adopt'[\s\S]*idempotency-key/);
  assert.match(source, /api\('\/api\/v1\/pets\/companion'/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});

test('chọn linh thú cập nhật ngay cảnh hiện tại, không phải chờ broadcast realtime', () => {
  const petUi = readFileSync(resolveWebFile('/pet-ui.js'), 'utf8');
  const temple = readFileSync(resolveWebFile('/chanh-dien.js'), 'utf8');
  const shop = readFileSync(resolveWebFile('/shop.html'), 'utf8');
  assert.match(petUi, /onCompanionChange\(pet \? \{ species: pet\.species, level: pet\.level \} : null, \{ saved \}\)/);
  assert.match(petUi, /data\.companion = result\.companion;\s*syncCompanion\(true\)/);
  assert.match(temple, /onCompanionChange:\s*\(pet, \{ saved = false \} = \{\}\) => \{\s*showCompanionNow\(pet\)/);
  assert.match(temple, /const stateParticipants = withPendingCompanion\(message\.participants\)/);
  assert.match(temple, /session\.refreshTicket\(\)\.catch/);
  assert.match(readFileSync(resolveWebFile('/realtime-session.js'), 'utf8'), /async refreshTicket\(\)[\s\S]*const resumeToken = session\.resumeToken[\s\S]*connect\(\)/);
  assert.match(shop, /rememberCompanion\(pet \? \{ species: pet\.species, level: pet\.level \} : null\)/);
  assert.match(shop, /setTimeout\(returnToRoom, 300\)/);
});

test('chat nổi của người và bot hiện ở mọi khu; thông báo nghi lễ chỉ hiện trong chánh điện', () => {
  const markup = readFileSync(resolveWebFile('/chanh-dien.html'), 'utf8');
  const styles = readFileSync(resolveWebFile('/chanh-dien.css'), 'utf8');
  assert.match(markup, /class="feed" id="feed"/);
  assert.doesNotMatch(markup, /class="feed hall-only" id="feed"/);
  assert.match(styles, /#stage:not\(\.in-hall\) \.feed \.msg\.gift\s*\{[^}]*display:\s*none/s);
});

test('giao diện chặn double-tap phóng chữ nhưng không chặn thao tác con trỏ riêng của cảnh', () => {
  for (const pathname of ['/chanh-dien.css', '/room.css', '/styles.css', '/admin-thien.css', '/scene-demo.css']) {
    const source = readFileSync(resolveWebFile(pathname), 'utf8');
    assert.match(source, /touch-action:\s*manipulation/, pathname);
    assert.match(source, /text-size-adjust:\s*100%/, pathname);
  }
  assert.match(readFileSync(resolveWebFile('/chanh-dien.css'), 'utf8'), /#scene3d\s*\{[^}]*touch-action:\s*none/s);
  assert.match(readFileSync(resolveWebFile('/room.css'), 'utf8'), /#scene3d\s*\{[^}]*touch-action:\s*none/s);
});
