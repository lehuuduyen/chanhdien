// `node scripts/promo-video.mjs [--film tour|garden|farm|stopwatch|hieu-y|chanh-dien|canh|tri-tue|dua-xe] [--base http://localhost:3000] [--out .data/promo/promo.mp4] [--state vn] [--url lotusgather.online]`
// `node scripts/promo-video.mjs --setup-only`: chỉ chuẩn bị dữ liệu máy dev rồi thôi (để tự quay màn hình /promo.html).
// --film garden: clip ~33 giây ở Vườn Công Đức (gieo, tưới, hái, đem bán), mặc định ghi .data/promo/promo-garden.mp4.
// --film farm: clip ~47 giây ở Phước Điền (gieo, tưới, thu hoạch, gà, bò, chợ, thăm hàng xóm), mặc định ghi
// .data/promo/promo-farm.mp4.
// --film stopwatch: clip ~28 giây trò Bấm Giờ (suýt trúng, trúng đúng 1/100 giây, cấp 2, Bảng vàng), mặc định ghi
// .data/promo/promo-stopwatch.mp4.
// --film hieu-y: clip ~39 giây trò hai người trên thẻ người chơi (Oẳn tù tì, Đo độ hiểu ý, Đoán ý bạn), mặc định ghi
// .data/promo/promo-hieu-y.mp4. Cần bot trong chánh điện (BOTS_THIEN) để có người nắm tay / mời chơi.
// --film chanh-dien: clip ~33 giây trong chánh điện (ngồi thiền, dâng hoa, thỉnh chuông, dâng hương, Quan Âm, Vườn Đèn Tâm
// Nguyện về đêm), mặc định ghi .data/promo/promo-chanh-dien.mp4. Cần bot ngồi bồ đoàn (BOTS_THIEN).
// --film canh: clip ~32 giây phong cảnh (Vườn Hoa, Rừng thiền, đường La Hán, khu vui chơi, mỗi bang một cảnh, đêm trăng), mặc
// định ghi .data/promo/promo-canh.mp4.
// --film tri-tue: clip ~40 giây khu Trí tuệ (Tàng Kinh Các, Bảng vàng, Đố hình, Đố số, Màu mực, Test IQ, ảnh kết quả, Đố vui
// cả phòng), mặc định ghi .data/promo/promo-tri-tue.mp4. Cần bot trong sân (BOTS_THIEN) để Đố vui có người chơi cùng.
// --film dua-xe: clip ~41 giây phòng Đua xe (cả trường đua, chạy thử, xếp lưới, 5 đèn, xuất phát, vào cua 1), mặc định ghi
// .data/promo/promo-dua-xe.mp4. Chỉ mở trang đua; lúc bắt đầu quay mới bấm Vào đua (phòng phải đang trống, script chờ cuộc
// đua cũ xong), bot của phòng lấp lưới.
// --url: địa chỉ web trên màn cuối, mặc định lotusgather.online.
//
// Quay video giới thiệu 9:16 (1080×1920) từ apps/web/public/promo.html bằng Chrome chạy ngầm có GPU rồi ghép MP4 bằng
// ffmpeg. Cần web/API/realtime đang chạy (`BOTS_THIEN=30 npm run dev` cho sân đông vui) và ffmpeg trong PATH.
//
// Chuẩn bị (chỉ khi --base là localhost / 127.0.0.1, tức máy dev; bỏ qua bằng --no-setup):
// - Rạp Việt Nam chưa có danh sách phát mặc định thì đặt "Big Buck Bunny" (phim hoạt hình CC BY của Blender Foundation;
//   màn cuối video có ghi công) để màn chiếu có phim. Gỡ: trang admin, hoặc DELETE /api/v1/admin/cinema/playlist.
// - Tài khoản thử "promo.minhan" (tên hiển thị Minh An), mật khẩu ngẫu nhiên lưu ở .data/promo-account.json, ví vườn được
//   nạp tới 2.000 xu trong SQLite máy dev (giao dịch admin_adjustment) để quay cảnh đang đánh Tiến Lên / đặt Bầu Cua.
//   Không bao giờ chạy phần này với server thật.
// - Clip vườn: kết thúc các vụ còn dở của tài khoản thử (lần quay trước hỏng giữa chừng), kho quả về 0, có ít nhất 3 hạt
//   Đào. Lúc quay, trang gọi window.promoHost('ripen'): cây vừa gieo được cho ra quả ngay trong SQLite máy dev (thay cho
//   16 giờ chờ tưới đủ 3 lần) để thẻ luống thật hiện "Hái hết (10)", hái được vào kho rồi đem bán.
// - Clip nông trại: dựng lại Phước Điền của tài khoản thử cho đầy đặn (cấp 18, 23 ô mở, ruộng nhiều cây đang lớn / đã
//   chín, ô 1 trống để gieo, ô 2 đất khô để tưới, 7 gà mái + 2 gà con có trứng, 2 bò + 1 bê có sữa, kho có thức ăn và
//   nông sản, 3 bạn hàng xóm, hai lượt hàng xóm ghé sáng nay). Lúc quay, trang gọi window.promoHost('farm-ripen'): dưa
//   hấu vừa gieo ở ô 1 chín ngay (thay cho 12 giờ) để thu hoạch thật rồi đem ra chợ bán.
// - Clip Bấm Giờ: xóa số lượt, lần trúng, đề của tài khoản thử để lần quay nào cũng bắt đầu từ cấp 1.
// - Clip Trí tuệ: xóa điểm Đề hôm nay (hôm nay) và lịch sử Test IQ của tài khoản thử (màn kết quả không còn "kỷ lục"
//   cũ). Lúc quay, trang gọi window.promoHost('brain-solve') với mã đề vừa xin: script đọc seed của đề trong SQLite máy
//   dev, dựng lại đề bằng apps/api/brain-puzzles.mjs rồi trả đáp án cho trang (window.promoSolved) để tô ô đúng.
//
// Ghi ra <out> (MP4 H.264 30 khung/giây, không tiếng: thêm nhạc trên TikTok / CapCut), <out>-ghep.mp4 (cùng clip, bỏ màn
// cuối, để ghép nối với clip khác) và <out>-sheet.jpg (ảnh ghép mỗi giây một khung để duyệt nhanh). Chrome: CHROME_PATH, mặc định bản cài sẵn trên macOS / google-chrome trên Linux;
// --swiftshader để vẽ bằng CPU (chậm, giật) khi máy không có GPU.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  if (index >= 0) args.splice(index, 1);
  return index >= 0;
};
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const [value] = args.splice(index, 2).slice(1);
  return value;
};
const FILM = option('--film', 'tour');
const FILMS = ['tour', 'garden', 'farm', 'stopwatch', 'hieu-y', 'chanh-dien', 'canh', 'tri-tue', 'dua-xe'];
if (!FILMS.includes(FILM)) throw new Error(`--film phải là một trong: ${FILMS.join(', ')}`);
const BASE = option('--base', 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(ROOT, option('--out', FILM === 'tour' ? '.data/promo/promo.mp4' : `.data/promo/promo-${FILM}.mp4`));
const STATE = option('--state', 'vn');
const URL_TEXT = option('--url', 'lotusgather.online');
const FPS = Number(option('--fps', '30'));
const SETUP_ONLY = flag('--setup-only');
const NO_SETUP = flag('--no-setup');
const SWIFTSHADER = flag('--swiftshader');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || '.data');
const GARDEN_TIMEZONE = process.env.GARDEN_TIMEZONE || 'America/Los_Angeles';
const LOCAL = ['localhost', '127.0.0.1'].includes(new URL(BASE).hostname);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const openDb = async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
};
if (!/^[a-z]{2}$/.test(STATE)) throw new Error('--state phải là mã 2 chữ (vn, ca, tx…)');
if (!Number.isInteger(FPS) || FPS < 24 || FPS > 60) throw new Error('--fps phải là số nguyên 24–60');

const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((file) => existsSync(file));

// ---- Chuẩn bị dữ liệu máy dev ----
const ACCOUNT_FILE = path.join(DATA_DIR, 'promo-account.json');
const DEMO = { username: 'promo.minhan', displayName: 'Minh An' };

function demoAccount() {
  if (existsSync(ACCOUNT_FILE)) return JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'));
  const account = { ...DEMO, password: randomBytes(12).toString('base64url') };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ACCOUNT_FILE, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 });
  return account;
}

async function setup() {
  const { DEFAULT_LOCAL_SECRET } = await import('@chanh-dien/session-token');
  const adminKey = process.env.ADMIN_SECRET || process.env.SESSION_SECRET || DEFAULT_LOCAL_SECRET;
  const playlistUrl = `${BASE}/api/v1/admin/cinema/playlist?roomId=cinema-vn`;
  const current = await fetch(playlistUrl, { headers: { 'x-admin-key': adminKey } }).then((response) => (response.ok ? response.json() : null));
  if (!current) console.warn('! Không đọc được danh sách phát rạp (khóa admin khác mặc định?) — bỏ qua.');
  else if (!current.videos?.length) {
    const response = await fetch(playlistUrl, {
      method: 'PUT',
      headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
      body: JSON.stringify({ videos: [{ videoId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' }] }),
    });
    console.log(response.ok ? '✓ Rạp Việt Nam: đặt danh sách phát mặc định Big Buck Bunny (CC BY)' : `! Không đặt được danh sách phát (${response.status})`);
  } else console.log(`✓ Rạp Việt Nam đã có danh sách phát (${current.videos.length} video)`);

  const account = demoAccount();
  const headers = { 'content-type': 'application/json', origin: BASE };
  let response = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers, body: JSON.stringify({ username: account.username, password: account.password }) });
  if (!response.ok) {
    // Đăng ký cần tháng/năm sinh + đồng ý điều khoản (tài khoản thử là người lớn).
    const signup = { birthYear: 1990, birthMonth: 1, acceptTerms: true };
    response = await fetch(`${BASE}/api/v1/auth/register`, { method: 'POST', headers, body: JSON.stringify({ ...account, ...signup }) });
    if (!response.ok) throw new Error(`Không tạo được tài khoản thử ${account.username}: ${await response.text()} (xóa ${ACCOUNT_FILE} nếu đổi máy dev)`);
  }
  const { account: info } = await response.json();
  const db = await openDb();
  const balance = db.prepare('SELECT balance FROM coin_wallets WHERE account_id = ?').get(info.id)?.balance ?? 0;
  if (balance < 2_000) {
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO coin_wallets (account_id, balance, updated_at) VALUES (?, 2000, ?) ON CONFLICT(account_id) DO UPDATE SET balance = 2000, updated_at = excluded.updated_at').run(info.id, now);
    db.prepare("INSERT INTO coin_transactions (account_id, amount, balance_after, kind, at) VALUES (?, ?, 2000, 'admin_adjustment', ?)").run(info.id, 2_000 - balance, now);
    db.exec('COMMIT');
  }
  if (FILM === 'garden') {
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    const ended = db.prepare("UPDATE crop_cycles SET status = 'harvested', ended_at = ? WHERE owner_account = ? AND status IN ('growing', 'fruiting')").run(now, info.id).changes;
    db.prepare('UPDATE fruit_inventory SET quantity = 0 WHERE account_id = ?').run(info.id);
    db.prepare(`INSERT INTO seed_inventory (account_id, plant_type, quantity) VALUES (?, 'peach', 3)
      ON CONFLICT(account_id, plant_type) DO UPDATE SET quantity = MAX(quantity, 3)`).run(info.id);
    db.exec('COMMIT');
    console.log(`✓ Vườn: tài khoản thử có 3 hạt Đào, kho quả trống${ended ? `, kết thúc ${ended} vụ còn dở` : ''}`);
  }
  if (FILM === 'farm') await stageFarm(db, info.id);
  if (FILM === 'stopwatch') {
    for (const table of ['stopwatch_stats', 'stopwatch_hits', 'stopwatch_rounds']) db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).run(info.id);
    console.log('✓ Bấm Giờ: tài khoản thử về cấp 1, chưa có lần trúng');
  }
  if (FILM === 'tri-tue') {
    const { gardenDay } = await import('@chanh-dien/garden');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('brain_daily', 'brain_iq')").all().map((row) => row.name);
    if (tables.includes('brain_daily')) db.prepare('DELETE FROM brain_daily WHERE account_id = ? AND day = ?').run(info.id, gardenDay(Date.now(), GARDEN_TIMEZONE));
    if (tables.includes('brain_iq')) db.prepare('DELETE FROM brain_iq WHERE account_id = ?').run(info.id);
    console.log('✓ Trí tuệ: tài khoản thử chưa làm Đề hôm nay, chưa có lịch sử Test IQ');
  }
  db.close();
  console.log(`✓ Tài khoản thử ${account.username} / ${account.password} (Minh An) · ví ${Math.max(balance, 2_000)} xu`);
  return { ...account, id: info.id };
}

// Phước Điền của tài khoản thử, dựng thẳng trong SQLite máy dev (xóa ruộng / chuồng cũ của tài khoản này). Mọi ô / con
// mang mốc settled_at = bây giờ nên lượt bạn bot ghé (tính lùi 10–90 phút) không đụng tới; hai lượt ghé sáng nay ghi sẵn
// vào sổ cũng làm hôm nay hết lượt ghé, để ô khô / con sắp đói còn nguyên tới lúc quay.
const FARM_FRIENDS = ['Minh Tâm', 'Diệu Hạnh', 'Hương Sen'];
// [ô, cây, phần đã lớn (1 = chín)]: ô 1 trống (gieo dưa hấu), ô 2 lúa đất khô (tưới), còn lại xen cây chín / đang lớn.
const FARM_PLOTS = [
  [2, 'rice', 0.35], [3, 'tomato', 1], [4, 'pumpkin', 0.7], [5, 'corn', 1], [6, 'carrot', 0.6],
  [7, 'corn', 0.8], [8, 'watermelon', 1], [9, 'rice', 0.75], [10, 'rice', 0.75], [11, 'pumpkin', 1], [12, 'dragonfruit', 0.6],
  [13, 'tomato', 0.5], [14, 'grass', 0.9], [15, 'carrot', 1], [16, 'corn', 0.55], [17, 'spinach', 0.7], [18, 'watermelon', 0.5],
  [19, 'pumpkin', 0.45], [20, 'rice', 0.6], [21, 'dragonfruit', 1], [22, 'grass', 0.6], [23, 'tomato', 0.85],
];
async function stageFarm(db, accountId) {
  const { FARM_CROPS, FARM_MOIST_MS, farmXpFor, gardenDay } = await import('@chanh-dien/garden');
  const now = Date.now();
  const day = gardenDay(now, GARDEN_TIMEZONE);
  const MIN = 60_000;
  db.exec('BEGIN IMMEDIATE');
  db.prepare(`INSERT INTO farm_profiles (account_id, xp, plots, coop, barn, storage, created_at) VALUES (?, ?, 23, 2, 2, 4, ?)
    ON CONFLICT(account_id) DO UPDATE SET xp = excluded.xp, plots = 23, coop = 2, barn = 2, storage = 4`).run(accountId, farmXpFor(18) + 140, now - 20 * 86_400_000);
  for (const table of ['farm_plots', 'farm_animals', 'farm_items', 'farm_basket']) db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).run(accountId);
  db.prepare('DELETE FROM farm_market WHERE account_id = ? AND day = ?').run(accountId, day);
  db.prepare('DELETE FROM farm_log WHERE owner = ? AND day = ?').run(accountId, day);
  const plot = db.prepare(`INSERT INTO farm_plots (account_id, slot, crop, planted_at, cycle, growth_ms, settled_at, moist_until, seed, tended)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 3)`);
  for (const [slot, crop, part] of FARM_PLOTS) {
    const need = FARM_CROPS[crop].growMs;
    // Ô 2 đất đã khô (có giọt 💧 trên ô, thẻ ô có nút Tưới); các ô khác còn ẩm cả buổi quay.
    plot.run(accountId, slot, crop, now - Math.round(need * part), Math.round(need * part), now, slot === 2 ? now - 5 * MIN : now + FARM_MOIST_MS, slot * 7919);
  }
  // Gà / bò no thêm 20 phút: chưa đói (không hiện dấu đói) nhưng thẻ chuồng đã có nút Cho ăn (còn ≤ 30 phút).
  const animal = db.prepare(`INSERT INTO farm_animals (account_id, kind, adult, grow_ms, prod_ms, stored, fed_until, settled_at, bought_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`);
  const fed = now + 20 * MIN;
  for (const stored of [2, 1, 2, 1, 1, 2, 1]) animal.run(accountId, 'chicken', 1, 12 * 3_600_000, stored, fed, now, now - 9 * 86_400_000);
  for (const grown of [0.4, 0.7]) animal.run(accountId, 'chicken', 0, Math.round(12 * 3_600_000 * grown), 0, fed, now, now - 86_400_000);
  for (const stored of [2, 1]) animal.run(accountId, 'cow', 1, 48 * 3_600_000, stored, fed, now, now - 12 * 86_400_000);
  animal.run(accountId, 'cow', 0, 20 * 3_600_000, 0, fed, now, now - 2 * 86_400_000);
  const item = db.prepare('INSERT INTO farm_items (account_id, item, quantity) VALUES (?, ?, ?)');
  for (const [name, quantity] of Object.entries({ corn: 14, grass: 10, hay: 8, tomato: 6 })) item.run(accountId, name, quantity);
  const basket = db.prepare('INSERT INTO farm_basket (account_id, item, quantity) VALUES (?, ?, ?)');
  for (const [name, quantity] of Object.entries({ tomato: 3, corn: 2 })) basket.run(accountId, name, quantity);
  const friend = db.prepare('INSERT INTO bot_friends (account_id, bot_name, since) VALUES (?, ?, ?) ON CONFLICT(account_id, bot_name) DO UPDATE SET since = MIN(since, excluded.since)');
  for (const name of FARM_FRIENDS) friend.run(accountId, name, now - 3 * 86_400_000);
  const log = db.prepare('INSERT INTO farm_log (owner, actor, actor_name, kind, item, count, coins, day, at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)');
  log.run(accountId, `bot:${FARM_FRIENDS[0]}`, FARM_FRIENDS[0], 'water', null, 2, day, now - 150 * MIN);
  log.run(accountId, `bot:${FARM_FRIENDS[1]}`, FARM_FRIENDS[1], 'gift', 'corn', 3, day, now - 70 * MIN);
  db.exec('COMMIT');
  console.log(`✓ Phước Điền: tài khoản thử cấp 18, 23 ô, 9 gà, 3 bò, hàng xóm ${FARM_FRIENDS.join(', ')}`);
}

// Trang gọi window.promoHost(JSON) (chỉ khi quay bằng script này, máy dev). 'ripen': cây đang lớn của tài khoản thử ở
// luống đó ra quả ngay, như vừa tưới đủ 3 lần. 'farm-ripen': cây ở ô Phước Điền đó chín ngay (không cỏ / sâu).
// 'brain-solve': đáp án của một đề Trí tuệ (theo seed lưu trong brain_rounds), trả về trang bằng window.promoSolved.
async function hostCall(account, payload, evaluate) {
  let message = null;
  try { message = JSON.parse(payload); } catch {}
  if (message?.op === 'brain-solve' && typeof message.roundId === 'string' && /^[\w-]{1,80}$/.test(message.roundId)) {
    const { buildPuzzle } = await import('../apps/api/brain-puzzles.mjs');
    const db = await openDb();
    const round = db.prepare('SELECT game, seed FROM brain_rounds WHERE id = ?').get(message.roundId);
    db.close();
    if (!round) {
      console.log(`  ! đề ${message.roundId}: không thấy trong SQLite máy dev`);
      return;
    }
    const { answers } = buildPuzzle(round.game, round.seed);
    await evaluate(`window.promoSolved?.(${JSON.stringify(message.roundId)}, ${JSON.stringify(answers)})`);
    console.log(`  ✓ đáp án đề ${round.game} (${answers.length} câu)`);
    return;
  }
  if (message?.op === 'farm-ripen' && account?.id && Number.isSafeInteger(message.slot)) {
    const { FARM_CROPS, FARM_MOIST_MS } = await import('@chanh-dien/garden');
    const db = await openDb();
    const now = Date.now();
    const row = db.prepare('SELECT crop FROM farm_plots WHERE account_id = ? AND slot = ? AND cycle = 0').get(account.id, message.slot);
    const changed = row && FARM_CROPS[row.crop] ? db.prepare(`UPDATE farm_plots SET growth_ms = ?, settled_at = ?, moist_until = ?, tended = 3
      WHERE account_id = ? AND slot = ?`).run(FARM_CROPS[row.crop].growMs, now, now + FARM_MOIST_MS, account.id, message.slot).changes : 0;
    db.close();
    console.log(changed ? `  ✓ ô ${message.slot}: ${row.crop} chín` : `  ! ô ${message.slot}: không thấy cây của tài khoản thử`);
    return;
  }
  if (message?.op !== 'ripen' || !account?.id || !Number.isSafeInteger(message.plotId)) return;
  const { FRUITS_PER_CROP, WATER_DAYS_TO_FRUIT, gardenDay } = await import('@chanh-dien/garden');
  const db = await openDb();
  const now = Date.now();
  const day = gardenDay(now, GARDEN_TIMEZONE);
  const changed = db.prepare(`UPDATE crop_cycles SET status = 'fruiting', water_days = ?, fruits_total = ?, fruits_left = ?,
    fruiting_day = ?, fruiting_at = ?, last_water_day = ?, last_water_at = ?
    WHERE plot_id = ? AND owner_account = ? AND status = 'growing'`)
    .run(WATER_DAYS_TO_FRUIT, FRUITS_PER_CROP, FRUITS_PER_CROP, day, now, day, now, message.plotId, account.id).changes;
  db.close();
  console.log(changed ? `  ✓ luống ${message.plotId}: cây ra ${FRUITS_PER_CROP} quả` : `  ! luống ${message.plotId}: không thấy cây đang lớn của tài khoản thử`);
}

// ---- Chrome ----
async function openChrome() {
  if (!chromePath) throw new Error('Không thấy Chrome: đặt CHROME_PATH=<đường dẫn Chrome>.');
  const profile = mkdtempSync(path.join(os.tmpdir(), 'promo-video-'));
  const chrome = spawn(chromePath, [
    '--headless=new', ...(SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]),
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=540,960', 'about:blank',
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
  const handlers = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method) handlers.get(message.method)?.(message.params);
    if (message.method === 'Runtime.exceptionThrown') console.warn('  lỗi trong trang:', message.params.exceptionDetails.exception?.description?.split('\n')[0] || message.params.exceptionDetails.text);
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
  return { cmd, evaluate, on: (method, handler) => handlers.set(method, handler), close: () => { socket.close(); cleanup(); } };
}

async function main() {
  const alive = await fetch(`${BASE}/promo.html`).then((response) => response.ok, () => false);
  if (!alive) throw new Error(`Không mở được ${BASE}/promo.html — chạy \`npm run dev\` trước (hoặc --base <địa chỉ web>).`);
  // API / realtime chạy từ trước khi có khu Trí tuệ thì trang vẫn mở (web đọc file mới) nhưng không xin được đề: các cảnh
  // đứng ở màn hướng dẫn Đố hình. Dừng trước khi quay để không ghi đè video cũ.
  if (FILM === 'tri-tue') {
    const brainApi = await fetch(`${BASE}/api/v1/brain`).then((response) => response.status, () => 0);
    if (brainApi !== 200) throw new Error(`API ở ${BASE} chưa có khu Trí tuệ (GET /api/v1/brain trả ${brainApi || 'lỗi mạng'}) — server đang chạy bản cũ: tắt \`npm run dev\` rồi chạy lại (BOTS_THIEN=30 npm run dev).`);
  }
  const account = LOCAL && !NO_SETUP ? await setup() : null;
  if (SETUP_ONLY) {
    if (account) console.log(`Mở ${BASE}/promo.html, đăng nhập tài khoản trên ở cổng chánh điện trước nếu muốn quay cảnh đánh bài.`);
    return;
  }
  if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('Cần ffmpeg trong PATH (macOS: brew install ffmpeg).');

  const browser = await openChrome();
  const { cmd, evaluate } = browser;
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  if (account && LOCAL) {
    await cmd('Runtime.addBinding', { name: 'promoHost' });
    browser.on('Runtime.bindingCalled', ({ name, payload }) => {
      if (name === 'promoHost') hostCall(account, payload, evaluate).catch((error) => console.warn('  ! promoHost:', error.message));
    });
  }
  // 540×960 điểm CSS × 2 = khung 1080×1920.
  await cmd('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: false });
  await cmd('Page.navigate', { url: `${BASE}/promo.html?record=1` });
  await sleep(1_500);
  if (account) {
    const status = await evaluate(`fetch('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ username: account.username, password: account.password }))} }).then((r) => r.status)`);
    if (status !== 200) console.warn(`! Đăng nhập tài khoản thử thất bại (${status}) — quay ở chế độ khách.`);
  }
  const query = new URLSearchParams({ record: '1', film: FILM, state: STATE, ...(URL_TEXT ? { url: URL_TEXT } : {}) });
  await cmd('Page.navigate', { url: `${BASE}/promo.html?${query}` });
  for (let index = 0; index < 60 && !(await evaluate('Boolean(window.promo)').catch(() => false)); index += 1) await sleep(500);
  console.log({ garden: '… tải chánh điện 3D, chọn luống ở Vườn Công Đức', farm: '… tải chánh điện 3D, đi vào Phước Điền', stopwatch: '… tải chánh điện 3D, bốc đề Bấm Giờ', 'hieu-y': '… tải chánh điện 3D, nắm tay một người bạn', 'chanh-dien': '… tải chánh điện 3D, chờ người ngồi thiền', canh: '… tải chánh điện 3D, phong cảnh các bang', 'tri-tue': '… tải chánh điện 3D, ngồi bàn đá Tàng Kinh Các, xin đề Trí tuệ', 'dua-xe': '… mở phòng Đua xe, chờ đường đua trống' }[FILM] || '… tải các cảnh (chánh điện 3D, rạp phim, phòng game)');
  const readChecks = () => evaluate("[...document.querySelectorAll('#checks li')].map((li) => `${li.className === 'ok' ? '✓' : '!'} ${li.textContent}`).join('\\n')");
  try {
    await evaluate('window.promo.prepare()');
  } catch (error) {
    // Lỗi chi tiết của từng trang nằm trong danh sách kiểm tra (lỗi trả về chỉ là "Chánh điện 3D chưa sẵn sàng").
    console.log(await readChecks().catch(() => ''));
    throw error;
  }
  const endAt = await evaluate('window.promo.endAt');
  console.log(await readChecks());
  // Chờ máy ổn định (bóng đổ, shader) rồi mới quay.
  await sleep(4_000);

  const work = mkdtempSync(path.join(os.tmpdir(), 'promo-frames-'));
  let frames = [];
  browser.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cmd('Page.screencastFrameAck', { sessionId });
    const file = path.join(work, `f${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    // metadata.timestamp: giây kể từ epoch, lúc khung được vẽ.
    frames.push({ file, at: metadata.timestamp });
  });
  await cmd('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await sleep(300);
  console.log('● đang quay…');
  const started = Date.now();
  // Bỏ các khung trước lúc kịch bản bắt đầu (giữ một khung cuối trước đó làm khung đầu).
  const startAt = started / 1_000;
  await evaluate('window.promo.start()');
  await sleep(600);
  await cmd('Page.stopScreencast');
  browser.close();
  const seconds = (Date.now() - started) / 1_000;
  console.log(`■ xong: ${frames.length} khung trong ${seconds.toFixed(1)} giây (~${(frames.length / seconds).toFixed(0)} khung/giây gốc)`);
  if (frames.length < 10) throw new Error('Quá ít khung hình — kiểm tra Chrome có GPU (thử --swiftshader).');
  const first = Math.max(0, frames.findIndex((frame) => frame.at >= startAt) - 1);
  frames = frames.slice(first).map((frame, index, list) => ({ ...frame, at: frame.at - list[0].at }));

  // Khung đến không đều: mỗi khung giữ tới khung kế, rồi ffmpeg lấy mẫu đều FPS khung/giây.
  const list = frames.map((frame, index) => {
    const next = frames[index + 1]?.at ?? frame.at + 1 / FPS;
    return `file '${frame.file}'\nduration ${Math.max(0.001, next - frame.at).toFixed(4)}`;
  });
  list.push(`file '${frames.at(-1).file}'`);
  writeFileSync(path.join(work, 'list.txt'), `${list.join('\n')}\n`);
  mkdirSync(path.dirname(OUT), { recursive: true });
  const encode = (file, seconds) => spawnSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'),
    ...(seconds ? ['-t', seconds.toFixed(3)] : []),
    '-vf', `fps=${FPS},scale=1080:1920:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-movflags', '+faststart', file,
  ], { stdio: 'inherit' }).status === 0;
  if (!encode(OUT)) throw new Error('ffmpeg lỗi khi ghép video');
  // Bản để ghép với clip khác: cắt ngay trước màn cuối.
  const joinable = OUT.replace(/\.mp4$/, '') + '-ghep.mp4';
  const cut = Number.isFinite(endAt) && endAt > 0 && encode(joinable, endAt);
  const sheet = OUT.replace(/\.mp4$/, '') + '-sheet.jpg';
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', OUT, '-vf', 'fps=1,scale=270:480,tile=8x8', '-frames:v', '1', '-q:v', '3', sheet], { stdio: 'inherit' });
  rmSync(work, { recursive: true, force: true });
  console.log(`✓ ${path.relative(ROOT, OUT)}${cut ? `\n✓ ${path.relative(ROOT, joinable)} (bỏ màn cuối, dài ${endAt.toFixed(1)} giây)` : ''}\n✓ ${path.relative(ROOT, sheet)} (ảnh ghép mỗi giây một khung)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
