// Biểu tượng app (PWA, favicon, iPhone): node scripts/app-icons.mjs
// Vẽ hoa sen bằng SVG (apps/web/public/icons/icon.svg) rồi dùng Chrome chạy ngầm xuất PNG các cỡ manifest.webmanifest cần.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../apps/web/public/icons');
const CHROME = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((file) => existsSync(file));
const JOBS = [
  ['icon-192.png', 192, { rounded: true }],
  ['icon-512.png', 512, { rounded: true }],
  ['icon-maskable-512.png', 512, { rounded: false, scale: 1.12 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 1.08 }],
];

// Hoa sen vàng trên nền đỏ thẫm. rounded: bo góc (biểu tượng thường, favicon); không bo góc cho maskable / apple-touch
// (hệ điều hành tự cắt), scale phóng hoa cho vừa vùng an toàn.
function lotusSvg({ rounded = true, scale = 1 } = {}) {
  const petal = (len, width) => `M0 0 C ${-width} ${-len * 0.32}, ${-width * 0.78} ${-len * 0.78}, 0 ${-len} C ${width * 0.78} ${-len * 0.78}, ${width} ${-len * 0.32}, 0 0 Z`;
  const vein = (len) => `M0 ${-len * 0.12} L0 ${-len * 0.82}`;
  const petals = [
    { angle: -64, len: 150, width: 52, fill: 'url(#petalBack)' },
    { angle: 64, len: 150, width: 52, fill: 'url(#petalBack)' },
    { angle: -33, len: 186, width: 60, fill: 'url(#petalMid)' },
    { angle: 33, len: 186, width: 60, fill: 'url(#petalMid)' },
    { angle: 0, len: 214, width: 66, fill: 'url(#petalFront)' },
  ];
  const body = petals.map((p) => `<g transform="rotate(${p.angle})"><path d="${petal(p.len, p.width)}" fill="${p.fill}" stroke="#7a3d0c" stroke-width="5" stroke-linejoin="round"/><path d="${vein(p.len)}" stroke="#b5741f" stroke-width="4" stroke-linecap="round" opacity=".55"/></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#7a1c1c"/><stop offset=".55" stop-color="#4a0f10"/><stop offset="1" stop-color="#1c0605"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset=".6" stop-color="#ffb347" stop-opacity=".16"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="petalFront" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2a238"/><stop offset=".6" stop-color="#ffd772"/><stop offset="1" stop-color="#fff2c4"/></linearGradient>
<linearGradient id="petalMid" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#cf8a26"/><stop offset=".65" stop-color="#f6c45a"/><stop offset="1" stop-color="#ffe7a6"/></linearGradient>
<linearGradient id="petalBack" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b8711c"/><stop offset=".7" stop-color="#e7aa45"/><stop offset="1" stop-color="#ffd98a"/></linearGradient>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3c25a"/><stop offset="1" stop-color="#b8711c"/></linearGradient>
</defs>
<rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
<g transform="translate(256 262) scale(${scale}) translate(-256 -262)">
<circle cx="256" cy="232" r="190" fill="url(#halo)"/>
<g transform="translate(256 352)">${body}</g>
<path d="M134 356 Q256 412 378 356 Q362 392 256 400 Q150 392 134 356 Z" fill="url(#base)" stroke="#7a3d0c" stroke-width="5" stroke-linejoin="round"/>
</g>
</svg>`;
}

writeFileSync(path.join(OUT, 'icon.svg'), lotusSvg({ rounded: true }));
const profile = mkdtempSync(path.join(os.tmpdir(), 'app-icons-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  const endpoint = await new Promise((resolve) => {
    let text = '';
    chrome.stderr.on('data', (chunk) => {
      text += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) resolve(match[1]);
    });
  });
  const targets = await fetch(`${endpoint.replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '')}/json/list`).then((r) => r.json());
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  };
  const cmd = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await cmd('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const [name, size, options] of JOBS) {
    const svg = lotusSvg(options).replace('<svg ', `<svg width="${size}" height="${size}" `);
    const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
    await cmd('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data } = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    console.log(name);
  }
  socket.close();
} finally {
  chrome.kill();
  await once(chrome, 'exit');
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
