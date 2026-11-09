import http from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const LEGACY_DIR = path.resolve(import.meta.dirname, '../../legacy');
const SCENES_DIR = path.resolve(import.meta.dirname, '../../scenes');
const ENGINE_DIR = path.resolve(import.meta.dirname, '../../packages/scene-engine/src');
const SEAT_EDITOR_DIR = path.resolve(import.meta.dirname, '../../tools/seat-editor');
const ROOM_RULES_FILE = path.resolve(import.meta.dirname, '../../packages/room-rules/src/index.mjs');
const PRAYER_SLIP_FILE = path.resolve(import.meta.dirname, '../../packages/prayer-slip/src/index.mjs');
const THREE_DIR = path.resolve(import.meta.dirname, '../../node_modules/three');

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
});

// Một đoạn duy nhất "bytes=a-b", "bytes=a-" hoặc "bytes=-n". Nhiều đoạn thì bỏ qua, trả cả file.
export function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

function resolveFile(root, requested) {
  const file = path.resolve(root, requested);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

export function resolvePublicFile(pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  return resolveFile(PUBLIC_DIR, requested);
}

export function resolveWebFile(pathname) {
  if (pathname === '/thien' || pathname === '/thien/') return resolveFile(LEGACY_DIR, 'index.html');
  if (pathname.startsWith('/thien/assets/')) {
    return resolveFile(path.join(LEGACY_DIR, 'assets'), pathname.slice('/thien/assets/'.length));
  }
  // Scene engine chạy thẳng trong trình duyệt (ES module, không bundler) cùng dữ liệu cảnh.
  if (pathname.startsWith('/engine/')) return resolveFile(ENGINE_DIR, pathname.slice('/engine/'.length));
  if (pathname === '/shared/room-rules.mjs') return ROOM_RULES_FILE;
  if (pathname === '/shared/prayer-slip.mjs') return PRAYER_SLIP_FILE;
  // Three.js (ghim 0.160.0 trong package.json) phục vụ từ chính server: chỉ bản build và addons.
  if (pathname.startsWith('/vendor/three/build/') || pathname.startsWith('/vendor/three/examples/jsm/')) {
    return resolveFile(THREE_DIR, pathname.slice('/vendor/three/'.length));
  }
  if (pathname.startsWith('/scenes/')) return resolveFile(SCENES_DIR, pathname.slice('/scenes/'.length));
  if (pathname === '/tools/seat-editor/') return resolveFile(SEAT_EDITOR_DIR, 'index.html');
  if (pathname.startsWith('/tools/seat-editor/')) return resolveFile(SEAT_EDITOR_DIR, pathname.slice('/tools/seat-editor/'.length));
  return resolvePublicFile(pathname);
}

// Phiên bản file theo nội dung. Cloudflare cho trình duyệt giữ file JS tới 4 giờ nên sau deploy máy người chơi vẫn
// chạy module cũ (hoặc trộn cũ với mới). Trang HTML (no-cache) gắn ?v=<hash> vào script / stylesheet và khai báo mọi
// module trong import map, nên cả import tĩnh, import() lẫn import tương đối giữa các module đều đi tới bản mới.
const VERSION_TTL_MS = 2000;
const fileHashes = new Map();
let moduleMapCache = { at: -Infinity, imports: null };

export function fileVersion(file) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return null;
  }
  const cached = fileHashes.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.hash;
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);
  fileHashes.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, hash });
  return hash;
}

function versionedPath(pathname) {
  const file = resolveWebFile(pathname);
  const hash = file && fileVersion(file);
  return hash ? `${pathname}?v=${hash}` : null;
}

// Mọi module trình duyệt tải từ server: /<file>.js, /engine/<file>.mjs, /shared/*.mjs (Three.js đã ghim phiên bản).
export function moduleImportMap(now = Date.now()) {
  if (moduleMapCache.imports && now - moduleMapCache.at < VERSION_TTL_MS) return moduleMapCache.imports;
  const list = (dir, prefix, pattern) => {
    try {
      return readdirSync(dir).filter((name) => pattern.test(name)).map((name) => `${prefix}${name}`);
    } catch {
      return [];
    }
  };
  const paths = [
    ...list(PUBLIC_DIR, '/', /\.m?js$/),
    ...list(ENGINE_DIR, '/engine/', /\.mjs$/),
    '/shared/room-rules.mjs',
    '/shared/prayer-slip.mjs',
  ];
  const imports = {};
  for (const pathname of paths) {
    const versioned = versionedPath(pathname);
    if (versioned) imports[pathname] = versioned;
  }
  moduleMapCache = { at: now, imports };
  return imports;
}

export function versionHtml(html, imports = moduleImportMap()) {
  let out = html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\/[^"?#]+\.(?:m?js|css))(")/g, (all, before, pathname, after) => {
    const versioned = imports[pathname] || versionedPath(pathname);
    return versioned ? `${before}${versioned}${after}` : all;
  });
  const existing = /<script type="importmap">([\s\S]*?)<\/script>/.exec(out);
  let declared = {};
  if (existing) {
    try {
      declared = JSON.parse(existing[1]);
    } catch {
      return out;
    }
  }
  const map = JSON.stringify({ ...declared, imports: { ...imports, ...declared.imports } });
  const tag = `<script type="importmap">${map}</script>`;
  if (existing) return out.replace(existing[0], () => tag);
  // Import map phải đứng trước mọi script module.
  const at = [out.search(/<script\b/), out.indexOf('</head>')].filter((index) => index >= 0);
  if (!at.length) return out;
  const index = Math.min(...at);
  out = `${out.slice(0, index)}${tag}\n  ${out.slice(index)}`;
  return out;
}

// Web server cũng là cổng vào chung: /api/* → API, /ws → máy realtime. Nhờ vậy client chỉ cần một origin
// (chạy sau tunnel hoặc load balancer với https/wss mà không phải mở thêm cổng).
function proxyHeaders(req, upstream) {
  const headers = { ...req.headers, host: req.headers.host || upstream.host };
  // Sau tunnel chạy trên chính máy này (ngrok), kết nối tới từ loopback và IP thật nằm ở cuối X-Forwarded-For do
  // tunnel thêm vào; kết nối thẳng thì dùng địa chỉ socket. X-Real-IP do gateway đặt lại, trình duyệt không tự khai được.
  const remote = req.socket.remoteAddress || '';
  const tunneled = /^(127\.|::1$|::ffff:127\.)/.test(remote)
    && String(req.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean).at(-1);
  headers['x-forwarded-for'] = tunneled || remote;
  headers['x-real-ip'] = tunneled || remote;
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return headers;
}

function proxyHttp(req, res, upstream) {
  const forward = http.request({
    host: upstream.hostname,
    port: upstream.port,
    method: req.method,
    path: req.url,
    headers: proxyHeaders(req, upstream),
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  forward.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'upstream_unavailable' }));
  });
  req.pipe(forward);
}

function proxyUpgrade(req, socket, head, upstream) {
  const forward = http.request({
    host: upstream.hostname,
    port: upstream.port,
    method: req.method,
    path: req.url,
    headers: proxyHeaders(req, upstream),
  });
  forward.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
    for (let index = 0; index < response.rawHeaders.length; index += 2) {
      lines.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`);
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
    // Một đầu ngắt (kể cả ngắt ngang không báo lỗi) thì đóng luôn đầu kia, để máy realtime biết người đã rời.
    const close = () => { socket.destroy(); upstreamSocket.destroy(); };
    for (const side of [socket, upstreamSocket]) {
      side.on('error', close);
      side.on('close', close);
    }
  });
  // Upstream từ chối nâng cấp (401/409/403…): trả nguyên mã cho client.
  forward.on('response', (response) => {
    socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    response.resume();
  });
  forward.on('error', () => socket.destroy());
  forward.end();
}

export function createWebServer(options = {}) {
  const apiUpstream = new URL(options.apiUpstream || 'http://127.0.0.1:4000');
  const realtimeUpstream = new URL(options.realtimeUpstream || 'http://127.0.0.1:4001');
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://local');
    const pathname = requestUrl.pathname;
    if (pathname.startsWith('/api/')) {
      proxyHttp(req, res, apiUpstream);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (pathname === '/thien') {
      res.writeHead(308, { Location: '/thien/' }).end();
      return;
    }
    const file = resolveWebFile(pathname);
    if (!file) {
      res.writeHead(404).end('not found');
      return;
    }
    const extension = path.extname(file).toLowerCase();
    if (extension === '.html' && file.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      const body = Buffer.from(versionHtml(readFileSync(file, 'utf8')));
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.html'],
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': body.length,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    const size = statSync(file).size;
    // Đúng phiên bản trang đang trỏ tới thì nội dung URL này không bao giờ đổi; ?v cũ (trang mở từ trước deploy)
    // nhận bản hiện tại nhưng không được giữ lâu.
    const version = requestUrl.searchParams.get('v');
    const immutable = Boolean(version) && version === fileVersion(file);
    const headers = {
      'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    // Safari (nhất là iPhone) chỉ phát audio/video khi server trả đúng đoạn được hỏi (206).
    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    if (range) {
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file, range).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://local').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    proxyUpgrade(req, socket, head, realtimeUpstream);
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const host = process.env.WEB_HOST || '127.0.0.1';
  const port = Number(process.env.WEB_PORT) || 3000;
  createWebServer({
    apiUpstream: process.env.API_UPSTREAM,
    realtimeUpstream: process.env.REALTIME_UPSTREAM,
  }).listen(port, host, () => console.log(`Web: http://${host}:${port}`));
}
