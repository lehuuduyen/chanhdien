import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// `npm run online`: chạy web + API + realtime trên máy này rồi mở Cloudflare Quick Tunnel để người ở xa vào được.
// Mọi thứ đi qua một cổng (web server chuyển tiếp /api và /ws), nên chỉ cần một tunnel https/wss.
// Cổng mặc định khác `npm run dev` để chạy song song được.
const WEB_PORT = process.env.WEB_PORT || '3100';
const API_PORT = process.env.API_PORT || '4100';
const REALTIME_PORT = process.env.REALTIME_PORT || '4101';
// Khóa phiên giữ nguyên giữa các lần chạy (lưu ở .env.online, đã gitignore): người đang xem không bị mất vé
// mỗi khi server khởi động lại. File này cũng chứa cấu hình riêng của máy (TELEGRAM_*, DONATE_*… mỗi dòng KEY=VALUE):
// nạp cho các dịch vụ, biến đặt sẵn trên dòng lệnh vẫn được ưu tiên.
const SECRET_FILE = '.env.online';
function readEnvFile() {
  try {
    return Object.fromEntries(readFileSync(SECRET_FILE, 'utf8').split(/\r?\n/)
      .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim().replace(/^(['"])(.*)\1$/, '$2')]));
  } catch {
    return {};
  }
}
const fileEnv = readEnvFile();
function persistentSecret() {
  if (fileEnv.SESSION_SECRET?.length >= 32) return fileEnv.SESSION_SECRET;
  const created = randomBytes(32).toString('base64url');
  // Thêm vào cuối file, không ghi đè các dòng cấu hình khác.
  appendFileSync(SECRET_FILE, `${existsSync(SECRET_FILE) && !readFileSync(SECRET_FILE, 'utf8').endsWith('\n') ? '\n' : ''}SESSION_SECRET=${created}\n`, { mode: 0o600 });
  return created;
}
for (const [key, value] of Object.entries(fileEnv)) if (process.env[key] === undefined) process.env[key] = value;
const secret = process.env.SESSION_SECRET || persistentSecret();

const services = [
  ['api', 'apps/api/server.mjs', { API_PORT, REALTIME_PUBLIC_URL: '/ws', REALTIME_INTERNAL_URL: `http://127.0.0.1:${REALTIME_PORT}` }],
  ['realtime', 'apps/realtime/server.mjs', { REALTIME_PORT, NODE_ID: 'rt-online', API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}` }],
  ['web', 'apps/web/server.mjs', {
    WEB_PORT,
    API_UPSTREAM: `http://127.0.0.1:${API_PORT}`,
    REALTIME_UPSTREAM: `http://127.0.0.1:${REALTIME_PORT}`,
  }],
];

const children = [];
let stopping = false;
let tunnelRetryTimer = null;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (tunnelRetryTimer) clearTimeout(tunnelRetryTimer);
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

for (const [name, file, env] of services) {
  // Token tunnel chỉ dành cho cloudflared, không đưa vào web / API / realtime.
  const { CLOUDFLARE_TUNNEL_TOKEN: _tunnelToken, ...serviceEnv } = process.env;
  const child = spawn(process.execPath, [file], { env: { ...serviceEnv, ...env, SESSION_SECRET: secret }, stdio: 'inherit' });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} đã dừng (${signal || code}).`);
      stop(code || 1);
    }
  });
  children.push(child);
}

// Cloudflare Tunnel có tên (miễn phí, link cố định trên domain riêng, không bị giới hạn lượt tạo như Quick Tunnel):
// tạo tunnel trong Cloudflare Zero Trust, trỏ Public Hostname về http://localhost:<WEB_PORT>, rồi ghi token
// (CLOUDFLARE_TUNNEL_TOKEN) và link (PUBLIC_URL, vd. https://dev.example.com) vào .env.online. Có token thì tự dùng.
const namedTunnelToken = process.env.CLOUDFLARE_TUNNEL_TOKEN || '';
const tunnelProvider = String(process.env.TUNNEL_PROVIDER || (namedTunnelToken ? 'cloudflare-named' : 'cloudflare')).toLowerCase();
const namedTunnelUrl = /^https:\/\/[a-z0-9.-]+\/?$/i.test(process.env.PUBLIC_URL || '') ? process.env.PUBLIC_URL : '';
if (tunnelProvider === 'cloudflare-named' && (!namedTunnelToken || !namedTunnelUrl)) {
  console.error('Tunnel có tên cần CLOUDFLARE_TUNNEL_TOKEN và PUBLIC_URL=https://<tên miền> trong .env.online.');
  stop(1);
}
let announcedUrl = '';
function announce(url) {
  if (!url || announcedUrl) return;
  announcedUrl = url.replace(/\/$/, '');
  mkdirSync('.data', { recursive: true });
  writeFileSync('.data/public-url.txt', `${announcedUrl}\n`);
  console.log(`\nĐã mở công khai: ${announcedUrl}`);
  console.log(`  Sảnh:          ${announcedUrl}/`);
  console.log(`  Chánh điện:    ${announcedUrl}/chanh-dien.html`);
  console.log(`  Phòng Cinema:  ${announcedUrl}/room.html?room=cinema-1`);
  console.log(`  Quản trị:      ${announcedUrl}/admin-thien.html`);
  console.log('Ai có link đều vào được. Ctrl+C để tắt.\n');
}

// Link Quick Tunnel là vài từ nối gạch ngang (vd. https://quiet-river-moon-lake.trycloudflare.com). Dòng lỗi của
// cloudflared cũng chứa https://api.trycloudflare.com (máy chủ cấp tunnel): không được coi đó là link công khai.
const QUICK_TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/i;
let ngrokBuffer = '';
let tunnelRateLimited = false;
function readTunnelOutput(chunk) {
  const text = chunk.toString();
  if (tunnelProvider === 'cloudflare-named') {
    // Link do Public Hostname quyết định; có kết nối tới Cloudflare là link dùng được.
    for (const line of text.split('\n')) {
      if (/Registered tunnel connection/i.test(line)) announce(namedTunnelUrl);
      else if (/\bERR\b|\b(error|failed|unable)\b/i.test(line)) process.stderr.write(`${line}\n`);
    }
    return;
  }
  if (tunnelProvider === 'localhostrun') {
    // localhost.run in link dạng https://<mã>.lhr.life (banner còn có link tài liệu của localhost.run, bỏ qua).
    announce(text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i)?.[0]);
    if (/\b(error|failed|denied|refused)\b/i.test(text)) process.stderr.write(text);
    return;
  }
  if (tunnelProvider !== 'ngrok') {
    const url = text.match(QUICK_TUNNEL_URL)?.[0];
    announce(url);
    if (/status 429|Too Many Requests/i.test(text)) tunnelRateLimited = true;
    if (!url && /\b(error|failed|unable)\b/i.test(text)) process.stderr.write(text);
    return;
  }
  ngrokBuffer += text;
  let newline;
  while ((newline = ngrokBuffer.indexOf('\n')) >= 0) {
    const line = ngrokBuffer.slice(0, newline);
    ngrokBuffer = ngrokBuffer.slice(newline + 1);
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.url && entry.msg === 'started tunnel') announce(entry.url);
    else if (entry.lvl === 'eror' || (entry.err && entry.err !== '<nil>')) console.error(`ngrok: ${entry.err || entry.msg}`);
  }
}

// Thử lại giãn dần (3 giây, 6, 12… tối đa 5 phút) khi tunnel chưa lên được; đã có link rồi mới rớt thì thử lại nhanh.
// Cloudflare báo 429 (tạo Quick Tunnel quá nhiều lần) thì chờ ít nhất 1 phút: thử dồn chỉ làm bị chặn lâu hơn.
let tunnelFailures = 0;
function startTunnel() {
  if (stopping) return;
  announcedUrl = '';
  ngrokBuffer = '';
  tunnelRateLimited = false;
  const tunnel = tunnelProvider === 'ngrok'
    ? spawn('ngrok', ['http', WEB_PORT, '--log', 'stdout', '--log-format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] })
    // Token đưa qua biến môi trường TUNNEL_TOKEN (cloudflared tự đọc), không nằm trên dòng lệnh để `ps` không thấy.
    : tunnelProvider === 'cloudflare-named'
      ? spawn('cloudflared', ['tunnel', '--no-autoupdate', 'run'], { env: { ...process.env, TUNNEL_TOKEN: namedTunnelToken }, stdio: ['ignore', 'pipe', 'pipe'] })
      // localhost.run: tunnel miễn phí qua ssh, không cần tài khoản; link đổi mỗi lần nối. stdin để mở (không ghi gì):
      // đóng stdin thì phiên ssh kết thúc kéo theo tunnel.
      : tunnelProvider === 'localhostrun'
        ? spawn('ssh', ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes',
          '-R', `80:127.0.0.1:${WEB_PORT}`, 'nokey@localhost.run'], { stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${WEB_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  let retryScheduled = false;
  const retry = (reason) => {
    const index = children.indexOf(tunnel);
    if (index >= 0) children.splice(index, 1);
    if (stopping || retryScheduled) return;
    retryScheduled = true;
    tunnelFailures = announcedUrl ? 0 : tunnelFailures + 1;
    let delay = Math.min(300_000, 3_000 * 2 ** Math.max(0, tunnelFailures - 1));
    if (tunnelRateLimited) {
      delay = Math.max(60_000, delay);
      console.error('Cloudflare đang giới hạn tạo Quick Tunnel (429). Đợi vài phút, dùng tunnel có tên (CLOUDFLARE_TUNNEL_TOKEN, xem README) '
        + 'hoặc localhost.run: TUNNEL_PROVIDER=localhostrun npm run online');
    }
    console.error(`${reason} Thử mở lại sau ${delay >= 60_000 ? `${Math.round(delay / 60_000)} phút` : `${delay / 1_000} giây`}…`);
    tunnelRetryTimer = setTimeout(startTunnel, delay);
  };
  tunnel.stdout.on('data', readTunnelOutput);
  tunnel.stderr.on('data', readTunnelOutput);
  const program = { ngrok: 'ngrok', localhostrun: 'ssh (localhost.run)' }[tunnelProvider] || 'cloudflared';
  tunnel.once('error', () => retry({
    ngrok: 'Không chạy được ngrok. Cài và cấu hình authtoken trước.',
    localhostrun: 'Không chạy được ssh.',
  }[tunnelProvider] || 'Không chạy được Cloudflare Tunnel. Cài bằng `brew install cloudflared` trước.'));
  tunnel.once('exit', (code, signal) => retry(`${program} đã dừng (${signal || code}).`));
}

startTunnel();

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
