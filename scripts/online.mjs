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
  const child = spawn(process.execPath, [file], { env: { ...process.env, ...env, SESSION_SECRET: secret }, stdio: 'inherit' });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} đã dừng (${signal || code}).`);
      stop(code || 1);
    }
  });
  children.push(child);
}

const tunnelProvider = String(process.env.TUNNEL_PROVIDER || 'cloudflare').toLowerCase();
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

let ngrokBuffer = '';
function readTunnelOutput(chunk) {
  const text = chunk.toString();
  if (tunnelProvider !== 'ngrok') {
    const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
    announce(url);
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

function startTunnel() {
  if (stopping) return;
  announcedUrl = '';
  ngrokBuffer = '';
  const tunnel = tunnelProvider === 'ngrok'
    ? spawn('ngrok', ['http', WEB_PORT, '--log', 'stdout', '--log-format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${WEB_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  let retryScheduled = false;
  const retry = (reason) => {
    if (stopping || retryScheduled) return;
    retryScheduled = true;
    console.error(`${reason} Thử mở lại sau 3 giây…`);
    tunnelRetryTimer = setTimeout(startTunnel, 3_000);
  };
  tunnel.stdout.on('data', readTunnelOutput);
  tunnel.stderr.on('data', readTunnelOutput);
  tunnel.once('error', () => retry(tunnelProvider === 'ngrok'
    ? 'Không chạy được ngrok. Cài và cấu hình authtoken trước.'
    : 'Không chạy được Cloudflare Tunnel. Cài bằng `brew install cloudflared` trước.'));
  tunnel.once('exit', (code, signal) => retry(`${tunnelProvider === 'ngrok' ? 'ngrok' : 'cloudflared'} đã dừng (${signal || code}).`));
}

startTunnel();

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
