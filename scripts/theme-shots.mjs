// `npm run theme:shots -- [vùng…] [--base http://localhost:3000] [--out .data/theme-shots] [--sun 50]`
//
// Chụp phong cảnh sân chùa theo vùng (KE_HOACH_VUNG.md) để duyệt và so sánh: mở chánh điện trong Chrome chạy ngầm
// (khung điện thoại 390×844), ẩn mọi lớp giao diện, đặt camera tự do ở 6 góc chuẩn rồi chụp từng vùng. Không vào phòng
// (không tạo tài khoản, không kết nối realtime). Cần web server đang chạy (`npm run dev`). Không nêu vùng thì chụp cảnh
// gốc + mọi file scenes/thien-default/themes/*.json.
//
// Ghi ra <out>/<vùng>/<góc>.png, <out>/sheet.png (ảnh ghép: mỗi hàng một vùng), <out>/report.json, và in bảng số đo:
// - ms đổi vùng: lần đầu (có tải file) / lần sau (chỉ dựng lại);
// - mesh và tam giác của riêng phần phong cảnh (cây, vật rải, núi, chùa) thêm so với cảnh gốc: số cố định, dùng để so
//   với ngân sách trong KE_HOACH_VUNG.md (lệnh vẽ cả khung hình dao động theo khói hương, thú đi lại nên chỉ để tham khảo);
// - FPS: chỉ để so giữa các vùng trên cùng một máy;
// - geometry trên GPU trước / sau khi đổi qua lại 5 lần: tăng ≥ 5 (mỗi lần đổi rò ít nhất một) là rò bộ nhớ.
// Trời cố định ở độ cao mặt trời --sun (độ, mặc định 50 = ban ngày, ảnh không đổi theo giờ chạy); vd. --sun -3 chụp
// ráng chiều, --sun -15 chụp đêm (daylight3d.mjs).
// Chrome: CHROME_PATH, mặc định bản cài sẵn trên macOS / google-chrome / chromium trên Linux.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const [value] = args.splice(index, 2).slice(1);
  return value;
};
const BASE = option('--base', 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(ROOT, option('--out', '.data/theme-shots'));
const SUN = Number(option('--sun', '50'));
if (!Number.isFinite(SUN) || SUN < -90 || SUN > 90) {
  console.error('--sun phải là số độ từ -90 tới 90');
  process.exit(1);
}
const NAME = /^[a-z0-9-]{1,32}$/;
const themeFiles = readdirSync(path.join(ROOT, 'scenes/thien-default/themes')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
const themes = ['default', ...(args.length ? args : themeFiles).filter((name) => name !== 'default')];
for (const name of themes) {
  if (!NAME.test(name)) {
    console.error(`Tên vùng không hợp lệ: ${name}`);
    process.exit(1);
  }
}

// 6 góc chuẩn của sân thien-default: [tên file, vị trí camera, điểm nhìn] (điểm nhìn gần camera: camera tự do giới hạn
// khoảng cách tới điểm nhìn).
const VIEWS = [
  ['1-mat-tien', [7, 3.2, 40], [4.2, 5.2, 33]],
  ['2-san', [0, 6, 92], [0, 4.6, 85]],
  ['3-cong-nui', [0, 5, 70], [0, 6.2, 77]],
  ['4-tuong-dong', [44, 4, 55], [50, 5.2, 57]],
  ['5-tren-cao', [-20, 22, 70], [-15, 18.5, 64]],
  ['6-vuon-hoa', [-8, 18, 44], [-14, 15, 39]],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((file) => existsSync(file));

async function main() {
  if (!chromePath) throw new Error('Không thấy Chrome: đặt CHROME_PATH=<đường dẫn Chrome>.');
  const alive = await fetch(`${BASE}/chanh-dien.html`).then((response) => response.ok, () => false);
  if (!alive) throw new Error(`Không mở được ${BASE}/chanh-dien.html — chạy \`npm run dev\` trước (hoặc --base <địa chỉ web>).`);

  const profile = mkdtempSync(path.join(os.tmpdir(), 'theme-shots-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => {
    chrome.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  const endpoint = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('Chrome không mở cổng điều khiển')), 20_000);
    chrome.stderr.on('data', (chunk) => {
      text += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const targets = await fetch(`${endpoint.replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '')}/json/list`).then((response) => response.json());
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const problems = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') problems.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      problems.push(message.params.args.map((item) => item.value ?? item.description ?? '').join(' '));
    }
  };
  const cmd = (method, params = {}) => new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || 'lỗi trong trang');
    return response.result?.result?.value;
  };
  const waitFor = async (expression, ms, what) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(500);
    }
    throw new Error(`Hết giờ chờ ${what}`);
  };
  const screenshot = async (file) => {
    const { result } = await cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(result.data, 'base64'));
  };

  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cmd('Page.navigate', { url: `${BASE}/chanh-dien.html?sun=${SUN}` });
  await sleep(1_500);
  await evaluate("localStorage.setItem('thien-view', '3d'); localStorage.setItem('debug-explore', '1'); localStorage.setItem('thien-lang', 'vi'); location.reload(); 1");
  await waitFor('Boolean(window.chanhDienRenderer?.setTheme && window.chanhDienExplore?.debugFreeCamera)', 60_000, 'cảnh 3D');
  // Chỉ để lại khung 3D; tải tượng / Vườn Hoa như lúc đã vào phòng.
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = 'body * { visibility: hidden !important; } #scene3d { visibility: visible !important; }';
    document.head.append(style);
    window.chanhDienRenderer.activateAssets?.();
    window.chanhDienExplore.debugFreeCamera(true);
    return 1;
  })()`);
  await waitFor('(() => { const p = window.chanhDienRenderer.loadProgress?.(); return !p || !p.total || p.done >= p.total; })()', 90_000, 'tải tượng');
  const view = async ([, position, target]) => {
    for (let index = 0; index < 6; index += 1) {
      await evaluate(`window.chanhDienRenderer.debugView(${JSON.stringify(position)}, ${JSON.stringify(target)}), 1`);
      await sleep(120);
    }
    await sleep(600);
  };
  // Máy chậm thì renderer tự hạ chất lượng sau vài giây: chờ mức chất lượng đứng yên để mọi vùng chụp cùng một mức.
  await view(VIEWS[4]);
  let quality = '';
  for (let stable = 0, rounds = 0; stable < 3 && rounds < 30; rounds += 1) {
    await sleep(1_500);
    const next = await evaluate('window.chanhDienRenderer.stats().quality');
    stable = next === quality ? stable + 1 : 0;
    quality = next;
  }

  const stats = () => evaluate('window.chanhDienRenderer.stats()');
  const report = { base: BASE, quality, views: VIEWS.map(([name]) => name), themes: {} };
  for (const name of themes) {
    const firstStart = Date.now();
    const applied = await evaluate(`window.chanhDienRenderer.setTheme(${JSON.stringify(name)})`);
    const firstMs = Date.now() - firstStart;
    if (applied !== name) console.warn(`  ${name}: chưa có dữ liệu vùng, đang hiện ${applied}`);
    // Lần sau (đã tải): chỉ còn thời gian dựng lại.
    const againMs = name === 'default' ? 0 : await evaluate(`(async () => {
      await window.chanhDienRenderer.setTheme('default');
      const start = performance.now();
      await window.chanhDienRenderer.setTheme(${JSON.stringify(name)});
      return Math.round(performance.now() - start);
    })()`);
    mkdirSync(path.join(OUT, name), { recursive: true });
    const perView = {};
    for (const item of VIEWS) {
      await view(item);
      await screenshot(path.join(OUT, name, `${item[0]}.png`));
      // Lệnh vẽ cả khung hình: lấy số nhỏ nhất của vài khung (khói hương, thú làm số nhảy lên xuống).
      let drawCalls = Infinity;
      for (let sample = 0; sample < 4; sample += 1) {
        drawCalls = Math.min(drawCalls, (await stats()).drawCalls);
        await sleep(250);
      }
      perView[item[0]] = { drawCalls };
    }
    await sleep(2_000);
    const { fps, landscape } = await stats();
    // Đổi qua lại 5 lần: số geometry trên GPU phải trở về như cũ (không rò bộ nhớ).
    const other = themes.find((item) => item !== name && item !== 'default') || 'default';
    const leak = await evaluate(`(async () => {
      const r = window.chanhDienRenderer;
      const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const cycle = async () => {
        await r.setTheme('default');
        await r.setTheme(${JSON.stringify(other)});
        await r.setTheme(${JSON.stringify(name)});
        await frame();
      };
      await cycle();
      const before = r.stats().geometries;
      for (let i = 0; i < 5; i += 1) await cycle();
      return { before, after: r.stats().geometries };
    })()`);
    report.themes[name] = { applied, firstMs, againMs, fps, landscape, geometries: leak, views: perView };
  }

  // Bảng số đo so với cảnh gốc.
  const base = report.themes.default.views;
  console.log(`\nChất lượng renderer khi chụp: ${quality}\n`);
  const own = report.themes.default.landscape;
  console.log('vùng          đổi lần đầu / sau   +mesh  +tam giác  (lệnh vẽ khung hình)   FPS   geometry trước → sau');
  for (const [name, item] of Object.entries(report.themes)) {
    const meshes = item.landscape.meshes - own.meshes;
    const tris = item.landscape.triangles - own.triangles;
    const frame = Math.max(...VIEWS.map(([key]) => item.views[key].drawCalls - base[key].drawCalls));
    Object.assign(item, { extraMeshes: meshes, extraTriangles: tris, extraFrameDrawCalls: frame });
    const leakNote = item.geometries.after - item.geometries.before >= 5 ? '  ← RÒ' : '';
    console.log(`${name.padEnd(13)} ${`${item.firstMs} ms / ${item.againMs} ms`.padEnd(19)} ${String(meshes).padStart(5)} ${String(tris).padStart(10)}  ${`(${frame >= 0 ? '+' : ''}${frame})`.padStart(20)} ${String(item.fps).padStart(6)}   ${item.geometries.before} → ${item.geometries.after}${leakNote}`);
  }
  console.log('Ngân sách mỗi vùng (KE_HOACH_VUNG.md): +mesh ≤ 12, +tam giác ≤ 150.000, đổi lần sau ≤ 80 ms (máy bàn có GPU).');
  writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  // Ảnh ghép: dựng trang HTML lưới ảnh rồi chụp nguyên trang.
  const cell = { width: 195, height: 422 };
  const rows = Object.keys(report.themes).map((name) => `<div class="row"><b>${name}</b>${VIEWS.map(([key]) => `<img src="${name}/${key}.png">`).join('')}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:14px sans-serif}.row{display:flex;align-items:center;gap:4px;margin:4px}b{width:90px}img{width:${cell.width}px;height:${cell.height}px}</style>${rows}`;
  writeFileSync(path.join(OUT, 'sheet.html'), html);
  const width = 98 + VIEWS.length * (cell.width + 4);
  const height = Object.keys(report.themes).length * (cell.height + 8) + 8;
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: pathToFileURL(path.join(OUT, 'sheet.html')).href });
  await sleep(1_500);
  await screenshot(path.join(OUT, 'sheet.png'));

  const pageProblems = problems.filter((text) => !/AudioContext|api\/v1\/me|401/.test(text));
  if (pageProblems.length) console.log(`\nLỗi / cảnh báo trong trang:\n- ${[...new Set(pageProblems)].slice(0, 15).join('\n- ')}`);
  console.log(`\nẢnh: ${OUT}/<vùng>/*.png · ảnh ghép: ${path.join(OUT, 'sheet.png')} · số đo: ${path.join(OUT, 'report.json')}`);
  socket.close();
  cleanup();
}

main().then(() => process.exit(0), (error) => {
  console.error(error.message);
  process.exit(1);
});
