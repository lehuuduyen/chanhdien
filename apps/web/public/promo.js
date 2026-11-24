// Video giới thiệu 9:16 (TikTok / Reels / Shorts), xem promo.html.
// Trang này là "đạo diễn": mở các trang thật cùng origin trong iframe (chánh điện 3D, rạp phim, phòng game), chờ chúng sẵn
// sàng rồi chạy kịch bản ~58 giây: bay camera trong sân chùa (renderer3d.debugCinematic / debugView), đổi góc rạp phim,
// bấm vài nút ở phòng game, chồng chữ và chuyển cảnh. Bong bóng chat, thả tim, thú làm trò mà kịch bản gọi chỉ hiện trên
// máy đang quay (renderer.say / react / petInteraction), không gửi lên server. Người dùng quay màn hình khung 9:16, hoặc
// chạy scripts/promo-video.mjs để Chrome chạy ngầm tự quay ra MP4 (?record=1: khung phủ kín cửa sổ, window.promo điều khiển).
// ?film=garden: clip ~33 giây chỉ ở Vườn Công Đức (chọn hạt, gieo, tưới, cây lớn, hái, đem ra quầy bán lấy xu).
// ?film=farm: clip ~47 giây ở Phước Điền (gieo, tưới, thu hoạch, gà, bò, chợ, thăm hàng xóm).
// ?film=stopwatch: clip ~28 giây trò Bấm Giờ (suýt trúng, trúng đúng 1/100 giây, cấp 2 đồng hồ tắt, Bảng vàng).
// ?film=hieu-y: clip ~39 giây trò hai người trên thẻ người chơi (Oẳn tù tì, Đo độ hiểu ý, Đoán ý bạn).
// ?film=chanh-dien: clip ~33 giây trong chánh điện (ngồi thiền, dâng hoa, thỉnh chuông, dâng hương, Quan Âm, Vườn Đèn
// Tâm Nguyện về đêm).
// ?film=canh: clip ~32 giây phong cảnh (Vườn Hoa, Rừng thiền, đường La Hán, khu vui chơi, mỗi bang một cảnh, đêm trăng).
// ?film=tri-tue: clip ~40 giây khu Trí tuệ (Tàng Kinh Các, Bảng vàng, Đố hình, Đố số, Màu mực, Test IQ, ảnh kết quả, Đố vui).
// ?film=dua-xe: clip ~41 giây phòng Đua xe (bay trên khán đài, chạy thử, xếp lưới, 5 đèn, xuất phát, vào cua 1); chỉ mở trang đua.
// Màn cuối ghi LotusGather + địa chỉ web (?url=, mặc định lotusgather.online).
import { thienThemeOf, US_STATES } from '/shared/room-rules.mjs';

const PARAMS = new URLSearchParams(location.search);
const RECORD = PARAMS.has('record');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NAME = 'Minh An';
const CINEMA_ROOM = 'cinema-vn';
const SITE = 'lotusgather.online';

// ---- Toán nhỏ cho camera ----
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((value, index) => lerp(value, b[index], t));
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// Đường bay thẳng có gia tốc: { pos, at, fov } → { pos, at, fov }.
const move = (from, to, curve = ease.inOut) => (u) => {
  const k = curve(clamp01(u));
  return { pos: mix(from.pos, to.pos, k), at: mix(from.at, to.at, k), fov: lerp(from.fov ?? 50, to.fov ?? from.fov ?? 50, k) };
};
// Bay vòng quanh một điểm cố định: góc (radian, 0 = phía +z), bán kính, độ cao có thể đổi dần.
const orbit = ({ center, radius, height, from, to, look = 0.8, fov = 50, radius2 = radius, height2 = height, curve = ease.sine }) => (u) => {
  const k = curve(clamp01(u));
  const angle = lerp(from, to, k);
  const r = lerp(radius, radius2, k);
  return { pos: [center[0] + Math.sin(angle) * r, lerp(height, height2, k), center[2] + Math.cos(angle) * r], at: [center[0], look, center[2]], fov };
};
// Bám theo vật đang di chuyển (thú, nhân vật): subject() trả [x, z] hoặc [x, z, ry] (null khi chưa có); camera bay vòng quanh
// vật đó, vị trí vật được làm mượt để camera không giật theo từng bước chân. relative: góc tính từ hướng mặt của nhân vật
// (0 = ngay trước mặt, âm = phía tay phải) thay vì hướng +z của sân.
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const track = ({ subject, radius, height, from, to, look = 0.5, fov = 45, radius2 = radius, height2 = height, curve = ease.sine, smooth = 3.5, relative = false }) => {
  let state = null;
  let heading = null;
  let last = 0;
  return (u, now) => {
    const point = subject();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1;
    if (point) {
      state = state ? mix(state, point.slice(0, 2), 1 - Math.exp(-dt * smooth)) : point.slice(0, 2);
      // ry của nhân vật: 0 là quay mặt về −z (về chánh điện) → hướng mặt tính theo quy ước góc ở đây là ry + π.
      if (relative && Number.isFinite(point[2])) {
        const face = point[2] + Math.PI;
        heading = heading === null ? face : heading + wrap(face - heading) * (1 - Math.exp(-dt * 2.5));
      }
    }
    last = now;
    if (!state) return null;
    const k = curve(clamp01(u));
    const angle = lerp(from, to, k) + (relative ? heading || 0 : 0);
    const r = lerp(radius, radius2, k);
    return { pos: [state[0] + Math.sin(angle) * r, lerp(height, height2, k), state[1] + Math.cos(angle) * r], at: [state[0], look, state[1]], fov };
  };
};

// ---- Trang thật trong iframe ----
const pages = new Map();
let livePage = null;
const state = { prepared: false, running: false, done: null, signedIn: false, warnings: [] };

function waitFor(test, ms, what) {
  return new Promise((resolve, reject) => {
    const until = Date.now() + ms;
    const tick = () => {
      let value = null;
      try { value = test(); } catch {}
      if (value) resolve(value);
      else if (Date.now() > until) reject(new Error(`Hết giờ chờ ${what}`));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

function addPage(name, src) {
  const frame = document.createElement('iframe');
  frame.title = name;
  frame.allow = 'autoplay; fullscreen';
  frame.src = src;
  $('pages').append(frame);
  const page = { name, frame, win: null, doc: null };
  page.loaded = new Promise((resolve) => frame.addEventListener('load', () => {
    page.win = frame.contentWindow;
    page.doc = frame.contentDocument;
    resolve();
  }, { once: true }));
  pages.set(name, page);
  return page;
}

function injectStyle(page, css) {
  const style = page.doc.createElement('style');
  style.textContent = css;
  page.doc.head.append(style);
}

const click = (page, selector) => {
  const element = page?.doc?.querySelector(selector);
  if (!element || element.disabled) return false;
  element.click();
  return true;
};

function silence(page) {
  if (keepSound()) return;
  try {
    page.win.speechSynthesis.cancel();
    page.win.speechSynthesis.speak = () => {};
  } catch {}
}

const keepSound = () => $('soundToggle').checked || PARAMS.get('sound') === '1';
const FILMS = ['tour', 'garden', 'farm', 'stopwatch', 'hieu-y', 'chanh-dien', 'canh', 'tri-tue', 'dua-xe'];
const chosenFilm = () => {
  const name = PARAMS.get('film') || $('filmSelect').value;
  return FILMS.includes(name) ? name : 'tour';
};
const chosenState = () => (/^[a-z]{2}$/.test(PARAMS.get('state') || '') ? PARAMS.get('state') : $('stateSelect').value);

// Chánh điện 3D: vào phòng (khách thì lấy tên "Minh An"), ẩn giao diện, camera tự do chất lượng cao, linh thú cho mình.
async function prepareTemple(page) {
  await page.loaded;
  silence(page);
  const { doc, win } = page;
  await waitFor(() => doc.getElementById('gateForm'), 30_000, 'cổng chánh điện');
  await sleep(2_000);
  if (!doc.getElementById('gate').hidden) {
    if (doc.getElementById('gateSignedIn').hidden) doc.getElementById('dharma').value = NAME;
    doc.getElementById('gateForm').requestSubmit();
  }
  await waitFor(() => win.chanhDienRenderer?.debugCinematic && win.chanhDienExplore?.debugFreeCamera && doc.getElementById('gate').hidden, 60_000, 'vào chánh điện');
  silence(page);
  injectStyle(page, 'body * { visibility: hidden !important; } #scene3d { visibility: visible !important; }');
  const renderer = win.chanhDienRenderer;
  const explore = win.chanhDienExplore;
  renderer.activateAssets?.();
  explore.debugFreeCamera(true);
  renderer.debugCinematic(true);
  // Linh thú cho nhân vật của mình (chỉ trên máy quay): Hạc Tiên cấp 10 có hào quang vàng.
  const setWalkers = explore.setWalkers.bind(explore);
  explore.setWalkers = (list, options) => setWalkers(list.map((item) => (item.me ? { ...item, pet: { species: 'crane', level: 10 } } : item)), options);
  await waitFor(() => {
    const progress = renderer.loadProgress?.();
    return !progress || !progress.total || progress.done >= progress.total;
  }, 90_000, 'tải tượng và mô hình');
  if (!keepSound()) {
    const mute = doc.getElementById('mute');
    if (mute && mute.getAttribute('aria-pressed') !== 'true') mute.click();
  }
  page.r = renderer;
  page.x = explore;
  // Người đang ngồi bồ đoàn trong điện (renderer vẽ riêng, không nằm trong danh sách người đi lại): nhớ lại để kịch bản
  // dâng lễ / nói câu cho đúng người đang ngồi.
  const setParticipants = renderer.setParticipants.bind(renderer);
  renderer.setParticipants = (list) => {
    page.seated = list.filter((item) => !item.me && item.seatId);
    return setParticipants(list);
  };
  if (chosenFilm() === 'garden') {
    await prepareGarden(page);
    return;
  }
  if (chosenFilm() === 'farm') {
    await prepareFarm(page);
    return;
  }
  if (chosenFilm() === 'stopwatch') {
    await prepareStopwatch(page);
    return;
  }
  if (chosenFilm() === 'hieu-y') {
    await prepareHieuY(page);
    return;
  }
  if (chosenFilm() === 'chanh-dien') {
    await prepareHall(page);
    return;
  }
  if (chosenFilm() === 'canh') {
    for (const [code] of regions()) await setRegionTheme(code);
    return;
  }
  if (chosenFilm() === 'tri-tue') {
    await prepareBrain(page);
    return;
  }
  // Đưa nhân vật của mình tới cổng nông trại sẵn cho cảnh linh thú.
  click(page, '.quick-travel-panel button[data-destination="farm"]');
  // Tải sẵn phong cảnh các bang của đoạn biến hình (lần đổi đầu phải tải file; lúc quay chỉ còn dựng lại ~0,1 giây).
  for (const [code] of regions()) await setRegionTheme(code);
}

// Đoạn "mỗi bang một cảnh": vài bang có cảnh khác hẳn nhau, kết thúc ở khu vực đang chọn.
function regions() {
  const home = chosenState();
  const name = (code) => US_STATES.find((item) => item.code === code)?.name || code.toUpperCase();
  return [...['ca', 'az', 'ak', 'ny'].filter((code) => code !== home), home].map((code) => [code, name(code)]);
}
const setRegionTheme = (code) => temple().r.setTheme(thienThemeOf(code), { state: code === 'vn' ? null : code });

// Rạp phim: ẩn giao diện (nút có sẵn của rạp), chờ màn chiếu có phim.
async function prepareCinema(page) {
  await page.loaded;
  silence(page);
  const { doc, win } = page;
  // Vào rạp: rạp có thể hỏi tên hiển thị (hiện muộn, sau khi đọc tài khoản) — điền "Minh An" rồi vào.
  let asked = 0;
  await waitFor(() => {
    const layer = doc.getElementById('joinLayer');
    if (layer && !layer.hidden && Date.now() - asked > 3_000) {
      asked = Date.now();
      const input = doc.getElementById('displayName');
      if (input && !input.value.trim()) input.value = NAME;
      doc.getElementById('joinForm').requestSubmit();
    }
    return win.cinemaRenderer?.debugParticipants?.().some((person) => person.me);
  }, 60_000, 'vào rạp phim');
  try {
    await waitFor(() => doc.querySelector('#player iframe') && doc.getElementById('nowTitle')?.textContent && !/Chưa có video/.test(doc.getElementById('nowTitle').textContent), 25_000, 'phim trên màn chiếu');
  } catch {
    state.warnings.push('Rạp chưa có phim: chạy scripts/promo-video.mjs --setup-only (máy dev) hoặc mở một video ở rạp.');
  }
  await sleep(1_500);
  click(page, '#hideHud');
  // Nút 👁 hiện lại giao diện: chỉ làm trong suốt (trang đo vị trí nút này để chừa chỗ, display: none làm khung chiếu co lại).
  injectStyle(page, '#showHud { opacity: 0 !important; pointer-events: none !important; } #nearSit, #joystick, .zoom-bar { display: none !important; }');
  win.cinemaRenderer.setCamera('overview');
  page.c = win.cinemaRenderer;
}

// Phòng game hiện như màn hình điện thoại thu nhỏ ở nửa dưới khung (class card), chữ ở phía trên.
async function prepareGame(page) {
  page.frame.classList.add('card');
  await page.loaded;
  silence(page);
  await waitFor(() => /\d/.test(page.doc.querySelector('#balance, #meCoins')?.textContent || '') || page.doc.querySelector('#signIn:not([hidden])'), 30_000, `phòng ${page.name}`).catch(() => {});
  injectStyle(page, 'html { scroll-behavior: auto !important; }');
}

// ---- Chuyển cảnh ----
function show(name, transition = 'fade') {
  const next = pages.get(name).frame;
  const previous = livePage && pages.get(livePage).frame;
  livePage = name;
  if (previous === next) {
    if (transition === 'flash') flash();
    return;
  }
  if (transition === 'cut' || transition === 'flash') {
    for (const frame of [next, previous]) if (frame) frame.style.transition = 'none';
    next.classList.add('live');
    previous?.classList.remove('live', 'leaving', 'punch');
    if (transition === 'flash') flash();
    requestAnimationFrame(() => { for (const frame of [next, previous]) if (frame) frame.style.transition = ''; });
    return;
  }
  // fade / whip: trang cũ phóng to + mờ dần, trang mới "đập" vào.
  next.classList.add('live');
  if (transition === 'whip') next.classList.add('punch');
  if (previous) {
    previous.classList.add('leaving');
    setTimeout(() => previous.classList.remove('live', 'leaving', 'punch'), 600);
  }
  setTimeout(() => next.classList.remove('punch'), 700);
}

function flash(soft = false) {
  const element = $('flash');
  element.classList.remove('on');
  element.classList.toggle('soft', soft);
  void element.offsetWidth;
  element.classList.add('on');
}

// ---- Chữ ----
// title: mảng phần tử; chuỗi thường tách theo từng chữ (hiện lần lượt), [chữ, màu] là cụm tô nền, '\n' xuống dòng.
function caption(spec) {
  const box = $('caption');
  if (!spec) {
    if (box.childElementCount) {
      box.classList.add('out');
      setTimeout(() => { if (box.classList.contains('out')) box.replaceChildren(); }, 300);
    }
    return;
  }
  box.className = `caption ${spec.cls || ''}`;
  const parts = [];
  if (spec.kicker) parts.push(Object.assign(document.createElement('div'), { className: 'kicker', textContent: spec.kicker }));
  const title = document.createElement('h2');
  let index = 0;
  for (const part of spec.title || []) {
    if (part === '\n') {
      title.append(document.createElement('br'));
      continue;
    }
    const words = Array.isArray(part) ? [part] : String(part).split(' ').filter(Boolean);
    for (const word of words) {
      const span = document.createElement('span');
      span.className = Array.isArray(word) ? `w hl ${word[1] || ''}` : 'w';
      span.textContent = Array.isArray(word) ? word[0] : word;
      span.style.setProperty('--i', index++);
      title.append(span, ' ');
    }
  }
  parts.push(title);
  if (spec.sub) {
    const sub = Object.assign(document.createElement('p'), { className: 'sub', textContent: spec.sub });
    sub.style.setProperty('--n', index);
    parts.push(sub);
  }
  box.replaceChildren(...parts);
}

function gameChips(list, active, quick = false) {
  const box = $('games');
  box.classList.toggle('quick', quick);
  box.hidden = !list;
  if (!list) {
    box.dataset.labels = '';
    return;
  }
  if (box.dataset.labels !== list.join('|')) {
    box.dataset.labels = list.join('|');
    box.replaceChildren(...list.map((label, index) => {
      const chip = Object.assign(document.createElement('span'), { textContent: label });
      chip.style.setProperty('--i', index);
      return chip;
    }));
  }
  [...box.children].forEach((chip, index) => chip.classList.toggle('on', index === active));
}

function note({ avatar, title, text, act }) {
  const item = document.createElement('div');
  item.className = 'note';
  const face = Object.assign(document.createElement('span'), { className: 'avatar', textContent: avatar });
  const body = document.createElement('div');
  body.append(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('small'), { textContent: text }));
  const action = Object.assign(document.createElement('span'), { className: 'act', textContent: act });
  item.append(face, body, action);
  $('notes').append(item);
  return {
    done(label) {
      action.textContent = label;
      action.classList.add('done');
    },
  };
}
function clearNotes() {
  for (const item of $('notes').children) item.classList.add('out');
  setTimeout(() => $('notes').replaceChildren(), 320);
}

// ---- Trợ giúp trong cảnh ----
const temple = () => pages.get('temple');
const cinema = () => pages.get('cinema');
let animalCache = { at: 0, list: [] };
function animal(id) {
  const now = performance.now();
  if (now - animalCache.at > 8) animalCache = { at: now, list: temple().r.debugAnimals() };
  const found = animalCache.list.find((item) => item.id === id);
  return found ? [found.x, found.z] : null;
}
const walkers = () => temple().x.debugState().walkers;
const selfPose = () => {
  const pose = temple().x.position();
  return pose ? [pose.x, pose.z, pose.ry] : null;
};
const trick = (id, action = 'trick') => temple().x.petInteraction(id, action);
const sayTemple = (id, text) => temple().x.say(id, text);

// Nhóm người đứng gần nhau nhất (để quay cảnh trò chuyện): điểm có nhiều người trong bán kính 6 m nhất, ưu tiên ngoài sân.
function crowd() {
  const { selfId, walkers: all } = temple().x.debugState();
  const list = all.filter((item) => item.id !== selfId && item.visible && item.z > 20 && item.z < 112 && Math.abs(item.x) < 52);
  let best = null;
  for (const item of list) {
    const near = list.filter((other) => Math.hypot(other.x - item.x, other.z - item.z) < 6);
    if (!best || near.length > best.near.length) best = { item, near };
  }
  if (!best) return null;
  const cx = best.near.reduce((sum, item) => sum + item.x, 0) / best.near.length;
  const cz = best.near.reduce((sum, item) => sum + item.z, 0) / best.near.length;
  return { center: [cx, cz], people: best.near };
}

// Tâm nhóm bạn đang trò chuyện (bot vẫn đi lại): trung bình vị trí những người cách người đầu tiên dưới 7 m.
function socialCenter() {
  if (!social) return null;
  const ids = social.people.slice(0, 3).map((item) => item.id);
  const list = walkers().filter((item) => ids.includes(item.id));
  if (!list.length) return social.center;
  const group = list.filter((item) => Math.hypot(item.x - list[0].x, item.z - list[0].z) < 7);
  return [group.reduce((sum, item) => sum + item.x, 0) / group.length, group.reduce((sum, item) => sum + item.z, 0) / group.length];
}

function showRegion(index) {
  const [code, name] = regions()[index] || [];
  if (!code) return;
  setRegionTheme(code);
  if (index) flash(true);
  gameChips([`📍 ${name}`], 0, true);
}

// ---- Vườn Công Đức (kịch bản ?film=garden) ----
// Gieo, tưới, hái, bán là thao tác thật của tài khoản đang đăng nhập: kịch bản bấm nút trên thẻ luống / quầy của trang
// (window.chanhDienGarden), server trừ hạt, ghi luống, cộng quả, cộng xu như khi người chơi bấm. Chỉ hai chỗ dàn dựng, và
// chỉ trên máy quay: các luống đang trống được vẽ thêm cây cho vườn đầy đặn, và 16 giờ chờ cây lớn (tưới đủ 3 lần, mỗi lần
// cách 8 giờ) được tua nhanh trong lúc trời chuyển ngày → đêm → sáng. Script quay (window.promoHost, chỉ máy dev) cho cây
// ra quả thật ngay sau đoạn tua để thẻ luống hiện đúng "Hái hết (10)". Không có script / chưa đăng nhập: dựng cả bằng hình.
const SEED_TYPE = 'peach';
const STALL = { x: 12.5, z: 69.9 };
const GARDEN_CENTER = [25, 0, 66.5];
const USES = ['🌱 Mua hạt', '🐾 Linh thú', '🎬 Mở phim', '🎲 Chơi game'];
const garden = { plot: null, side: 1, live: false, ripe: false, overlay: new Map(), dressing: new Map(), real: new Map(), push: null };
const gardenUI = () => temple().g;
// Tọa độ quanh luống đã chọn: dz > 0 là phía lối đi nơi nhân vật đứng, dz < 0 là phía lối giữa vườn (chỗ đặt camera).
const L = (dx, y, dz) => [garden.plot.x + dx, y, garden.plot.z + garden.side * dz];

// Số ngẫu nhiên có hạt giống: lần quay nào vườn cũng y như nhau.
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// Cây dựng thêm cho luống trống: nhiều luống ra quả, xen cây non / mầm; luống sát luống quay chỉ để cây thấp (không che
// nhân vật).
function dressGarden(plots) {
  const random = seeded(17);
  const near = (plot) => Math.abs(plot.x - garden.plot.x) <= 2.1 && Math.abs(plot.z - garden.plot.z) <= 4;
  for (const plot of plots) {
    if (plot.id === garden.plot.id) continue;
    const roll = random();
    const type = ['apple', 'apple', 'orange', 'orange', 'peach'][Math.floor(random() * 5)];
    const fruits = 6 + Math.floor(random() * 5);
    if (roll < 0.08) continue;
    let stage = roll < 0.56 ? 'fruiting' : roll < 0.8 ? 'young' : roll < 0.92 ? 'sprout' : 'seed';
    if (near(plot) && stage === 'young') stage = 'fruiting';
    garden.dressing.set(plot.id, {
      id: `dress-${plot.id}`, plantType: type, ownerName: '', stage, waterDays: { seed: 0, sprout: 1, young: 2, fruiting: 3 }[stage],
      waterNeeded: 3, wilted: false, canWater: false, fruitsLeft: stage === 'fruiting' ? fruits : 0, fruitsTotal: stage === 'fruiting' ? 10 : 0,
    });
  }
}

function dress(plot) {
  if (garden.overlay.has(plot.id)) return { ...plot, crop: garden.overlay.get(plot.id), mine: true };
  if (!plot.crop && garden.dressing.has(plot.id)) return { ...plot, crop: garden.dressing.get(plot.id), mine: false, dressing: true };
  return plot;
}

// Cây của mình trong đoạn tua nhanh (cùng mã vụ với cây thật để lúc trả về dữ liệu thật không phải dựng lại).
function gStage(stage) {
  const real = garden.real.get(garden.plot.id)?.crop;
  const days = { seed: 0, sprout: 1, young: 2, fruiting: 3 }[stage];
  garden.overlay.set(garden.plot.id, {
    id: real?.id ?? 'promo', plantType: SEED_TYPE, ownerName: real?.ownerName || NAME, stage, waterDays: days, waterNeeded: 3,
    wilted: false, canWater: false, fruitsLeft: stage === 'fruiting' ? 10 : 0, fruitsTotal: stage === 'fruiting' ? 10 : 0,
  });
  garden.push([garden.plot.id]);
}
function gClear() {
  garden.overlay.delete(garden.plot.id);
  garden.push([garden.plot.id]);
}
// Hạt nước / hạt giống bay ở luống mà nhân vật không làm động tác (tên người làm không khớp ai).
const gBurst = (kind) => temple().x.gardenEffect(garden.plot.id, kind, SEED_TYPE, '\u0000');
// Mình làm động tác (đứng sát luống thì làm tại chỗ).
const gAct = (kind) => temple().x.gardenEffect(garden.plot.id, kind, SEED_TYPE);

const gClick = (selector) => click(temple(), selector);
// Bấm nút trong trang chánh điện kèm vòng chạm ngón tay ở đúng chỗ nút (trang phủ kín khung nên tọa độ trùng khung).
function tap(element, delay = 220) {
  if (!element || element.disabled) return false;
  tapRing(element);
  setTimeout(() => element.click(), delay);
  return true;
}
const gq = (selector) => temple().doc.querySelector(selector);
function gOpenCard() {
  if (garden.live) gardenUI().onTap({ plotId: garden.plot.id });
}
const gCloseCard = () => gClick('.garden-card:not([hidden]) .social-close');
function gChooseSeed() {
  if (garden.live) tap(temple().doc.querySelectorAll('.garden-card .garden-seed')[2]);
}
function gPlant() {
  const button = gq('.garden-card > .garden-main');
  if (garden.live && button && /Gieo/.test(button.textContent) && tap(button)) return;
  garden.live = false;
  gStage('seed');
  gAct('plant');
}
function gWater() {
  if (garden.live && tap(gq('.garden-card .garden-hydration .garden-main'))) return;
  gStage('sprout');
  gAct('water');
}
// Sau đoạn tua: nhờ script quay cho cây thật ra quả, tải lại vườn, rồi trả về dữ liệu thật.
async function gRipen() {
  const crop = garden.real.get(garden.plot.id)?.crop;
  if (!garden.live || !crop || typeof window.promoHost !== 'function') return;
  window.promoHost(JSON.stringify({ op: 'ripen', plotId: garden.plot.id, cropId: crop.id }));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(220);
    gardenUI().start();
    await sleep(260);
    if (garden.real.get(garden.plot.id)?.crop?.stage === 'fruiting') {
      garden.ripe = true;
      gClear();
      return;
    }
  }
}
function gHarvest() {
  if (garden.ripe && tap(gq('.garden-card > .garden-main'))) {
    // Hái xong thẻ chuyển sang "Luống trống": đóng ngay.
    setTimeout(gCloseCard, 430);
    return;
  }
  // Dựng bằng hình: quả bay vào giỏ rồi luống trống.
  gAct('harvest');
  setTimeout(() => {
    garden.overlay.set(garden.plot.id, null);
    garden.push([garden.plot.id]);
  }, 300);
}
// Ra quầy hạt giống: đi nhanh tới cổng vườn (sau lưng quầy, camera không thấy chỗ đáp), rồi bước ra trước quầy. Đang
// đứng trong vườn thì nút "Vườn" không làm gì (đã ở khu đó) nên đi nhanh ra sân trước rồi mới về cổng vườn — lúc chớp
// chuyển cảnh, camera đang ở quầy.
async function gToStall() {
  gCloseCard();
  const page = temple();
  const place = () => page.doc.querySelector('.quick-travel-panel button[aria-current="true"]')?.dataset.destination;
  const go = (where) => click(page, `.quick-travel-panel button[data-destination="${where}"]`);
  if (place() === 'garden') {
    go('courtyard');
    await waitFor(() => place() !== 'garden', 1_500, 'ra sân').catch(() => {});
  }
  go('garden');
  await waitFor(() => {
    const pose = selfPose();
    return pose && Math.hypot(pose[0] - 10.8, pose[1] - 68) < 1.5;
  }, 2_000, 'tới cổng vườn').catch(() => {});
  page.x.walkTo(STALL);
}
function gOpenShop() {
  if (garden.live) gardenUI().onTap({ shop: true });
}
function gSellAll() {
  const button = [...temple().doc.querySelectorAll('.garden-sheet .garden-shop-row button')].find((item) => /Bán hết/.test(item.textContent));
  if (garden.live) tap(button);
  setTimeout(() => {
    pop('+100 xu', { coin: true });
    coinRain(22);
  }, 260);
}
const gCloseShop = () => gClick('.garden-sheet:not([hidden]) .mala-back');

function pop(text, { small = false, top = 34, coin = false } = {}) {
  const element = $('pop');
  element.className = `pop${small ? ' small' : ''}`;
  element.style.setProperty('--top', `${top}cqh`);
  element.textContent = text;
  if (coin) element.append(Object.assign(document.createElement('span'), { className: 'coin' }));
  element.hidden = false;
  element.style.animation = 'none';
  void element.offsetWidth;
  element.style.animation = '';
  clearTimeout(pop.timer);
  pop.timer = setTimeout(() => { element.hidden = true; }, 1_800);
}
function coinRain(count) {
  const box = $('coinRain');
  for (let index = 0; index < count; index += 1) {
    const coin = Object.assign(document.createElement('span'), { className: 'coin' });
    coin.style.left = `${3 + Math.random() * 74}%`;
    coin.style.setProperty('--delay', `${(Math.random() * 0.55).toFixed(2)}s`);
    coin.style.setProperty('--dur', `${(1.1 + Math.random() * 0.6).toFixed(2)}s`);
    coin.style.setProperty('--size', `${(6 + Math.random() * 4).toFixed(1)}cqw`);
    coin.style.setProperty('--spin', `${Math.round(240 + Math.random() * 600) * (Math.random() < 0.5 ? -1 : 1)}deg`);
    box.append(coin);
    setTimeout(() => coin.remove(), 2_600);
  }
}

// Trời trong đoạn tua 16 giờ: chiều → tối hẳn → sáng.
function timelapseSun(u) {
  if (u < 0.32) return lerp(14, -14, ease.sine(u / 0.32));
  if (u < 0.5) return -14;
  if (u < 0.78) return lerp(-14, 14, ease.sine((u - 0.5) / 0.28));
  return 14;
}

// Chuẩn bị vườn: chọn luống trống (ưu tiên hàng giữa, nhìn từ lối giữa vườn), dàn cây cho các luống trống khác, chỉ hiện
// nhãn luống của mình, đưa nhân vật tới đứng ở lối cạnh luống, quay mặt vào luống.
async function prepareGarden(page) {
  const { win } = page;
  await waitFor(() => win.chanhDienGarden, 20_000, 'Vườn Công Đức');
  page.g = win.chanhDienGarden;
  const scene = await fetch('/scenes/thien-default/scene.json').then((response) => response.json());
  const layout = scene.world.courtyard.garden.plots;
  const now = await fetch('/api/v1/garden', { credentials: 'same-origin' }).then((response) => response.json());
  for (const plot of now.plots) garden.real.set(plot.id, plot);
  const empty = (id) => !garden.real.get(id)?.crop;
  const prefer = [25, 24, 26, 23, 27, 35, 34, 36, 33, 37, 22, 28, 32, 38];
  const id = prefer.find(empty) ?? layout.find((plot) => empty(plot.id))?.id;
  if (!id) throw new Error('Vườn không còn luống trống');
  garden.plot = layout.find((plot) => plot.id === id);
  garden.side = Math.sign(garden.plot.aisle - garden.plot.z) || 1;
  dressGarden(layout);
  garden.live = state.signedIn;
  if (!state.signedIn) state.warnings.push('Chưa đăng nhập: cảnh gieo / hái / bán chỉ dựng bằng hình (chạy scripts/promo-video.mjs --film garden để bấm thật).');
  // Mọi lần trang gửi luống xuống bộ vẽ đều đi qua đây: luống trống thành luống có cây, luống của mình theo đoạn tua.
  const engineSet = page.x.setGarden.bind(page.x);
  page.x.setGarden = (list) => {
    for (const plot of list) garden.real.set(plot.id, plot);
    engineSet(list.map(dress));
  };
  garden.push = (ids) => engineSet(ids.map((plotId) => dress(garden.real.get(plotId) || { id: plotId, crop: null })));
  // Chỉ luống của mình có nhãn (đặt trước khi vẽ lại cả vườn để nhãn cũ của các luống khác được xóa).
  const label = page.g.labelFor.bind(page.g);
  page.g.labelFor = (plot) => (plot.id === garden.plot.id ? label(plot) : '');
  garden.push(layout.map((plot) => plot.id));
  // Thẻ luống và quầy hiện như giao diện điện thoại trong vùng an toàn (trên phần mô tả TikTok, chừa cột nút bên phải).
  injectStyle(page, `
    .garden-card, .garden-card *, .garden-sheet, .garden-sheet * { visibility: visible !important; }
    .garden-card { left: 4.5% !important; right: 17% !important; bottom: 20.5% !important; max-height: 42% !important; transform: scale(.9); transform-origin: 0 100%; }
    .garden-sheet { top: 42% !important; bottom: 20.5% !important; left: 4% !important; right: 16.5% !important; border-radius: 22px !important; border: 1px solid rgba(166, 214, 120, .45) !important; }
    .garden-sheet .quest-head, .garden-sheet .quest-head + .social-note, .garden-sheet .quest-row { order: 9; }
    .garden-sheet .mala-back { position: absolute; opacity: 0; }
    .garden-sheet h2 { font-size: 22px !important; }
  `);
  // Tới cổng vườn rồi đi tới lối cạnh luống, bước cuối hướng vào luống để nhân vật quay mặt về phía luống.
  click(page, '.quick-travel-panel button[data-destination="garden"]');
  await waitFor(() => {
    const pose = selfPose();
    return pose && Math.hypot(pose[0] - 10.8, pose[1] - 68) < 1.5;
  }, 15_000, 'tới cổng vườn');
  const stand = { x: garden.plot.x, z: garden.plot.aisle };
  const walkVia = async (point) => {
    page.x.walkTo(point);
    await waitFor(() => {
      const pose = selfPose();
      return pose && Math.hypot(pose[0] - point.x, pose[1] - point.z) < 0.15;
    }, 20_000, 'đi tới luống');
  };
  await walkVia({ x: stand.x, z: stand.z + garden.side * 0.6 });
  await walkVia(stand);
}

// ---- Phước Điền (kịch bản ?film=farm) ----
// Nông trại riêng của tài khoản đang đăng nhập; scripts/promo-video.mjs --film farm dựng sẵn ruộng đầy đặn trên máy dev
// (ô 1 trống, ô 2 đất khô, gà / bò có trứng / sữa, kho có thức ăn, ba bạn hàng xóm). Gieo, tưới, thu hoạch, cho gà ăn,
// nhặt trứng, vắt sữa, bán ở chợ, thăm và tưới giúp hàng xóm là thao tác thật: kịch bản bấm nút trên thẻ ô / chuồng, bảng
// chợ, bảng Hàng xóm của trang (window.chanhDienFarm). Chỉ đoạn tua 12 giờ dưa hấu lớn là vẽ trên máy quay, rồi script
// quay cho cây thật chín ngay (window.promoHost 'farm-ripen'). Chưa đăng nhập: bay camera qua ruộng mẫu, động tác dựng bằng
// hình.
const FARM_SLOT = 1;
const FARM_DRY = 2;
const FARM_CROP = 'watermelon';
const FARM_USES = ['🌱 Mua hạt', '🐾 Linh thú', '🎬 Mở phim', '🎲 Chơi game'];
const farmShot = { fields: null, live: false, overlay: null, last: null, push: null, neighbor: null, helpSlot: null, cow: null };
const farmUI = () => temple().f;
const farmData = () => farmUI()?.debug().farm || null;
const plotAt = (slot) => farmShot.fields.plots.find((plot) => plot.slot === slot);
// Điểm [x, y, z] lệch từ tâm một ô.
const atPlot = (slot, dx, y, dz) => [plotAt(slot).x + dx, y, plotAt(slot).z + dz];
const farmSpot = (name) => farmShot.fields[name];

// Đoạn tua: ô 1 vẽ theo giai đoạn của máy quay (empty = ô trống); null = theo dữ liệu thật.
function fStage(stage) {
  farmShot.overlay = stage;
  farmShot.push?.();
}
function dressFarm(data) {
  const stage = farmShot.overlay;
  if (!data || !stage || farmUI()?.debug().visiting) return data;
  const plots = data.plots.filter((plot) => plot.slot !== FARM_SLOT);
  if (stage !== 'empty') plots.push({ slot: FARM_SLOT, crop: FARM_CROP, stage, progress: { seed: 0.05, sprout: 0.3, growing: 0.7, ripe: 1 }[stage], dry: false, issues: [] });
  return { ...data, plots };
}

const farmButton = (scope, pattern) => [...temple().doc.querySelectorAll(`${scope} button`)].find((item) => pattern.test(item.textContent) && !item.disabled);
function fTap(scope, pattern) {
  if (!farmShot.live) return false;
  return tap(farmButton(scope, pattern));
}
function fOpen(target) {
  if (farmShot.live) farmUI().onTap(target);
}
function fClose() {
  gClick('.farm-card:not([hidden]) .social-close');
  gClick('.farm-sheet:not([hidden]) .mala-back');
}
// Không bấm thật được (khách / lỗi): chỉ hiệu ứng + động tác trên máy quay.
const fFake = (kind, target) => temple().x.farmEffect(kind, target);

function fChooseSeed() {
  fOpen({ kind: 'plot', slot: FARM_SLOT });
  setTimeout(() => fTap('.farm-card', /Dưa hấu/), 500);
}
function fPlant() {
  if (fTap('.farm-card', /^🌱 Gieo Dưa hấu/)) return;
  fStage('seed');
  fFake('plant', { kind: 'plot', slot: FARM_SLOT });
}
function fWater() {
  fOpen({ kind: 'plot', slot: FARM_DRY });
  setTimeout(() => {
    if (!fTap('.farm-card', /^💧/)) fFake('water', { kind: 'plot', slot: FARM_DRY });
  }, 550);
}
// Sau đoạn tua: nhờ script quay cho dưa hấu thật chín, tải lại nông trại, rồi trả ô về dữ liệu thật.
async function fRipen() {
  if (!farmShot.live || typeof window.promoHost !== 'function') return;
  window.promoHost(JSON.stringify({ op: 'farm-ripen', slot: FARM_SLOT }));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(250);
    await farmUI().refresh();
    if (farmData()?.plots.find((plot) => plot.slot === FARM_SLOT)?.stage === 'ripe') {
      farmShot.ripe = true;
      return;
    }
  }
}
function fHarvest() {
  if (farmShot.ripe) {
    fStage(null);
    fOpen({ kind: 'plot', slot: FARM_SLOT });
    setTimeout(() => fTap('.farm-card', /^🧺/), 550);
    return;
  }
  fFake('harvest', { kind: 'plot', slot: FARM_SLOT });
  setTimeout(() => fStage('empty'), 400);
}
const stored = (kind) => (farmData()?.animals || []).filter((item) => item.kind === kind).reduce((sum, item) => sum + item.stored, 0);
function fPen(kind) {
  fOpen({ kind });
}
function fFeed() {
  if (!fTap('.farm-card', /Cho ăn/)) fFake('feed', { kind: 'coop' });
}
function fCollect(kind) {
  const count = stored(kind === 'coop' ? 'chicken' : 'cow') || (kind === 'coop' ? 9 : 3);
  if (!fTap('.farm-card', kind === 'coop' ? /Nhặt trứng/ : /Vắt sữa/)) fFake('collect', { kind });
  setTimeout(() => pop(`+${count} ${kind === 'coop' ? '🥚' : '🥛'}`, { small: true, top: 33 }), 600);
}
// Số xu đổi sau một thao tác (bán, giúp hàng xóm): chờ câu trả lời của server, không có thì dùng số dự phòng.
async function coinsGained(before, fallback) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(150);
    const now = farmData()?.coins;
    if (Number.isFinite(now) && now !== before) return now - before;
  }
  return fallback;
}
function fMarket() {
  if (farmShot.live) farmUI().onTap({ kind: 'market' });
}
// Cuộn bảng chợ tới dòng dưa hấu (như người chơi vuốt), rồi bấm Bán hết.
const sellRow = () => [...temple().doc.querySelectorAll('.farm-sheet .garden-shop-row')].find((item) => /Dưa hấu/.test(item.textContent));
function fScrollSell() {
  sellRow()?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
async function fSell() {
  const before = farmData()?.coins;
  const row = sellRow();
  const button = row && [...row.querySelectorAll('button')].find((item) => /Bán hết/.test(item.textContent));
  if (farmShot.live) tap(button);
  const gained = farmShot.live && button ? await coinsGained(before, 40) : 40;
  pop(`+${gained} xu`, { coin: true });
  coinRain(18);
}
function fNeighbors() {
  if (farmShot.live) farmUI().openNeighbors();
}
function fVisit() {
  const name = farmShot.neighbor?.name;
  const row = name && [...temple().doc.querySelectorAll('.farm-sheet .garden-shop-row')].find((item) => item.querySelector('b')?.textContent === name);
  const button = row && [...row.querySelectorAll('button')].find((item) => /Thăm/.test(item.textContent));
  if (farmShot.live && button) tap(button);
}
async function fHelp() {
  const slot = farmShot.helpSlot;
  if (!slot || !farmUI()?.debug().visiting) return;
  fOpen({ kind: 'plot', slot });
  await sleep(550);
  const before = farmData()?.coins;
  if (!fTap('.farm-card', /Tưới giúp$/)) return;
  const gained = await coinsGained(before, 0);
  pop(gained > 0 ? `🤝 +${gained} xu` : '🤝', { small: true, top: 33 });
}
// Bò lớn mình bám camera (vị trí do bộ vẽ nông trại tự đi lại).
function cowPose() {
  const list = temple().x.debugFarm()?.animals || [];
  const found = list.find((item) => item.id === farmShot.cow) || list.find((item) => item.kind === 'cow' && item.form === 'adult');
  return found ? [found.x, found.z] : null;
}
// Nhân vật chạy (giữ Shift trong trang chánh điện) cho đoạn đường ngắn giữa ô ruộng và chuồng gà.
function runTo(point) {
  const { win } = temple();
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Shift' }));
  temple().x.walkTo(point, () => win.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'Shift' })));
}

// Bạn hàng xóm để quay cảnh thăm: người có ô khô (tưới giúp được), chọn ô khô ở hàng gần cổng.
async function pickNeighbor() {
  const data = await fetch('/api/v1/farm/neighbors', { credentials: 'same-origin' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  // Ưu tiên bạn hàng xóm script quay dựng sẵn (ruộng đầy đặn), rồi tới bạn khác.
  const rows = [...(data?.neighbors || [])].sort((a, b) => Number(Boolean(b.bot)) - Number(Boolean(a.bot)));
  for (const row of rows) {
    if (!row.needs?.water || row.helped >= row.helpMax) continue;
    const query = row.bot ? `bot=${encodeURIComponent(row.bot)}` : `friend=${encodeURIComponent(row.accountId)}`;
    const visit = await fetch(`/api/v1/farm/visit?${query}`, { credentials: 'same-origin' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    const slots = visit?.visit?.needs?.water || [];
    if (!slots.length) continue;
    farmShot.neighbor = row;
    farmShot.helpSlot = Math.min(...slots);
    return;
  }
  farmShot.neighbor = data?.neighbors?.[0] || null;
  state.warnings.push('Không có hàng xóm nào có ô khô: cảnh hàng xóm chỉ bấm Thăm.');
}

// Chuẩn bị: vào Phước Điền, đứng giữa lối ô 1 và ô 2 (làm được cả hai ô, không phải đi), camera ở trên ruộng để tải mô
// hình, chọn bạn hàng xóm.
async function prepareFarm(page) {
  const { win } = page;
  await waitFor(() => win.chanhDienFarm, 20_000, 'Phước Điền');
  page.f = win.chanhDienFarm;
  const scene = await fetch('/scenes/thien-default/scene.json').then((response) => response.json());
  farmShot.fields = scene.world.courtyard.fields;
  farmShot.live = state.signedIn;
  if (!state.signedIn) state.warnings.push('Chưa đăng nhập: clip nông trại chỉ có ruộng mẫu và động tác dựng bằng hình (chạy scripts/promo-video.mjs --film farm để bấm thật).');
  // Mọi lần trang gửi nông trại xuống bộ vẽ đều đi qua đây (đoạn tua vẽ đè ô 1).
  const engineSet = page.x.setFarm.bind(page.x);
  page.x.setFarm = (data) => {
    farmShot.last = data;
    engineSet(dressFarm(data));
  };
  farmShot.push = () => engineSet(dressFarm(farmShot.last));
  // Thẻ ô / chuồng, bảng chợ / hàng xóm hiện như giao diện điện thoại trong vùng an toàn (chừa cột nút bên phải của TikTok).
  injectStyle(page, `
    .farm-card, .farm-card *, .farm-sheet, .farm-sheet * { visibility: visible !important; }
    .farm-card { left: 4.5% !important; right: 17% !important; bottom: 20.5% !important; max-height: 46% !important; transform: scale(.9); transform-origin: 0 100%; }
    .farm-card .farm-crop { min-height: 0 !important; padding: 6px 4px !important; }
    .farm-card .farm-crop small, .farm-card .garden-hint, .farm-card .farm-secondary, .farm-card .farm-animals { display: none !important; }
    .farm-sheet { top: 40% !important; bottom: 20.5% !important; left: 4% !important; right: 16.5% !important; border-radius: 22px !important; border: 1px solid rgba(166, 214, 120, .45) !important; }
    .farm-sheet .social-note, .farm-sheet .farm-secondary { display: none !important; }
    .farm-sheet .mala-back { position: absolute; opacity: 0; }
    .farm-sheet h2 { font-size: 22px !important; }
  `);
  click(page, '.quick-travel-panel button[data-destination="myfarm"]');
  await waitFor(() => {
    const pose = selfPose();
    return pose && pose[0] < -50 && pose[1] > 90;
  }, 15_000, 'tới Phước Điền');
  page.r.debugView([-58, 14, 106], [-72, 0, 84], 50);
  const one = plotAt(FARM_SLOT);
  const two = plotAt(FARM_DRY);
  farmShot.stand = { x: (one.x + two.x) / 2, z: one.aisle };
  page.x.walkTo(farmShot.stand);
  await waitFor(() => {
    const pose = selfPose();
    return pose && Math.hypot(pose[0] - farmShot.stand.x, pose[1] - farmShot.stand.z) < 0.15;
  }, 20_000, 'đi tới ô 1');
  if (farmShot.live) await waitFor(() => farmData()?.plots?.length, 15_000, 'dữ liệu nông trại');
  await waitFor(() => {
    const debug = page.x.debugFarm();
    return debug && debug.animals.every((item) => item.model) && Object.values(debug.crops).every((value) => value !== 'loading');
  }, 30_000, 'mô hình nông trại').catch(() => state.warnings.push('Mô hình / ảnh cây Phước Điền chưa tải xong.'));
  farmShot.cow = farmData()?.animals.find((item) => item.kind === 'cow' && item.adult)?.id ?? null;
  if (farmShot.live) await pickNeighbor();
}

// ---- Bấm Giờ (kịch bản ?film=stopwatch) ----
// Thẻ Bấm Giờ thật của trang chánh điện (nút ⏱ trên thanh phòng), tài khoản thử đăng nhập (script quay xóa lịch sử Bấm
// Giờ của tài khoản thử trên máy dev nên lần quay nào cũng bắt đầu từ cấp 1). Kịch bản bấm Bắt đầu / Dừng bằng sự kiện
// chạm như ngón tay (pointerdown, trang lấy mốc của chính lần chạm) và canh giờ chính xác: lượt đầu dừng trễ 0,02 giây
// (Suýt trúng), lượt hai dừng đúng mục tiêu (Trúng, mở cấp 2 thật trên server), lượt ở cấp 2 trễ 0,03 giây. Chỉ trên máy
// quay: đề do server bốc được bốc lại (vẫn là đề thật) tới khi mục tiêu ngắn, để clip không phải chờ tới 10 giây.
const SW_SHORT = [160, 340];
const SW_LEVEL2 = [200, 300];
const swShot = { pool: [], targets: [], reroll: null, startStamp: 0, live: false };
const swDoc = () => temple().doc;
const swMain = () => swDoc().querySelector('.sw-main');
const swTarget = () => {
  const match = /^(\d\d):(\d\d)$/.exec(swDoc().querySelector('.sw-target')?.textContent || '');
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
};

// Vòng chạm ngón tay ở đúng chỗ nút (trang phủ kín khung nên tọa độ trùng khung).
function tapRing(element) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const frame = $('frame').getBoundingClientRect();
  const ring = Object.assign(document.createElement('span'), { className: 'tap' });
  ring.style.left = `${((rect.left + rect.width / 2) / frame.width) * 100}%`;
  ring.style.top = `${((rect.top + rect.height / 2) / frame.height) * 100}%`;
  $('overlay').append(ring);
  setTimeout(() => ring.remove(), 900);
}
// Chạm nút Bắt đầu / Dừng / Lượt mới: pointerdown như ngón tay; trả mốc thời gian của lần chạm (đồng hồ của trang).
function swPress() {
  const { win } = temple();
  const main = swMain();
  if (!main || main.disabled) return null;
  const event = new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'touch', isPrimary: true });
  const stamp = event.timeStamp;
  main.dispatchEvent(event);
  tapRing(main);
  return stamp;
}
function swStart() {
  const stamp = swPress();
  if (stamp !== null) swShot.startStamp = stamp;
}
// Dừng lúc đồng hồ của trang chạy được (mục tiêu + lệch) phần trăm giây: hẹn giờ tới sát mốc rồi chờ bận vài chục ms cho
// đúng tới dưới 1 ms.
function swStopAt(offset) {
  const target = swTarget();
  if (target === null || !swShot.startStamp) return;
  const { win } = temple();
  const goal = swShot.startStamp + (target + offset) * 10 + 1;
  setTimeout(() => {
    while (win.performance.now() < goal) { /* chờ đúng mốc */ }
    swPress();
  }, Math.max(0, goal - win.performance.now() - 30));
}
const swClick = (selector) => {
  const element = swDoc().querySelector(selector);
  if (!element) return;
  tapRing(element);
  element.click();
};

// Bốc đề (đề thật của server) cho tới khi mục tiêu nằm trong [min, max]; hết lượt cho phép thì lấy đề cuối.
async function swRoll(fetchReal, level, [min, max], tries = 14) {
  let last = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const response = await fetchReal('/api/v1/stopwatch/round', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level }),
    });
    if (!response.ok) return last;
    last = await response.json();
    if (last.target >= min && last.target <= max) return last;
  }
  return last;
}

async function prepareStopwatch(page) {
  const { win } = page;
  swShot.live = state.signedIn;
  if (!state.signedIn) state.warnings.push('Chưa đăng nhập: khách chỉ chơi cấp 1, không lưu lịch sử (chạy scripts/promo-video.mjs --film stopwatch).');
  try { win.localStorage.setItem('thien-stopwatch-level', '1'); } catch {}
  // Đề cho hai lượt đầu bốc sẵn (biết trước độ dài cảnh); trang xin đề nào thì đưa đề bốc sẵn, cấp 2 thì bốc lại tới khi ngắn.
  const fetchReal = win.fetch.bind(win);
  for (let index = 0; index < 2; index += 1) {
    const round = await swRoll(fetchReal, 1, SW_SHORT);
    if (round) swShot.pool.push(round);
  }
  swShot.targets = swShot.pool.map((round) => round.target);
  win.fetch = async (url, init) => {
    if (String(url) === '/api/v1/stopwatch/round' && init?.method === 'POST') {
      const level = JSON.parse(init.body || '{}').level;
      const ready = level === 1 ? swShot.pool.shift() : null;
      const round = ready || (level === 2 ? await swRoll(fetchReal, 2, SW_LEVEL2) : null);
      if (round) return new win.Response(JSON.stringify(round), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return fetchReal(url, init);
  };
  // Thẻ Bấm Giờ và thông báo mở cấp hiện như giao diện điện thoại trong vùng an toàn (chừa cột nút bên phải của TikTok).
  injectStyle(page, `
    .sw-card, .sw-card *, #toast, #toast * { visibility: visible !important; }
    .sw-card { left: 4.5% !important; right: 17% !important; bottom: 20.5% !important; max-height: 52% !important; }
    .sw-card .sw-guest { display: none !important; }
    #toast { top: 41% !important; font-size: 17px !important; }
  `);
}

const SW_BOARD_TAGS = ['⏱ Bấm Giờ', '🌾 Nông trại', '🎬 Rạp phim', '🎲 Game', '💬 Bạn bè'];

// ---- Trò hai người: Oẳn tù tì, Đo độ hiểu ý, Đoán ý bạn (kịch bản ?film=hieu-y) ----
// Thẻ người chơi thật của trang chánh điện (chạm vào người → thẻ có các trò hai người). Chuẩn bị: đi tới người (bot)
// gần nhất, nắm tay (bot nhận lời rồi đi theo), dắt nhau ra trước chánh điện. Lúc quay: khiêu chiến Oẳn tù tì, Đo độ
// hiểu ý, Đoán ý bạn đều gửi thật qua server; bot nhận lời và trả lời như người, kết quả (thắng thua, phần trăm) là
// kết quả thật nên mỗi lần quay một khác. Bot rủ chơi tự phát được tắt (🔕) để không chen ngang.
const duoShot = { partner: null, partnerName: '', live: false };
const duoDoc = () => temple().doc;
const duoButton = (scope, pattern) => [...duoDoc().querySelectorAll(`${scope} button`)].find((item) => pattern.test(item.textContent) && !item.disabled);
// Chờ điều kiện rồi mới làm (bot nhận lời / trả lời trễ ngẫu nhiên).
function whenReady(test, run, ms = 6_000) {
  const until = performance.now() + ms;
  const tick = () => {
    let ready = false;
    try { ready = test(); } catch {}
    if (ready) run();
    else if (performance.now() < until) setTimeout(tick, 100);
  };
  tick();
}
function duoCard() {
  if (duoShot.partner) temple().s.open(duoShot.partner);
}
function duoClosePanel() {
  duoDoc().querySelector('.rps:not([hidden]) .social-close')?.click();
  duoDoc().querySelector('.social-card:not([hidden]) .social-close')?.click();
}
// Mời một trò từ thẻ người chơi (nút trên thẻ, kèm vòng chạm).
function duoInvite(pattern) {
  if (!duoDoc().querySelector('.social-card:not([hidden])')) duoCard();
  setTimeout(() => tap(duoButton('.social-card', pattern)), 250);
}
// Oẳn tù tì: bot nhận lời xong thì ra Búa.
function duoPickRock() {
  whenReady(() => duoDoc().querySelector('.rps:not([hidden]) .rps-pick:not(:disabled)'), () => tap(duoDoc().querySelector('.rps .rps-pick')));
}
// Trả lời 10 câu liền tay (chọn hai phía xen nhau), rồi bấm nút chính (Nộp).
const DUO_PICKS = [0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
function duoAnswerAll(step = 330) {
  let count = 0;
  const next = () => {
    const options = [...duoDoc().querySelectorAll('.rps:not([hidden]) .compat-option')];
    if (options.length) {
      tap(options[DUO_PICKS[count % DUO_PICKS.length]] || options[0], 90);
      count += 1;
      setTimeout(next, step);
      return;
    }
    const submit = duoDoc().querySelector('.rps:not([hidden]) .compat-tools button.primary');
    if (submit) tap(submit, 120);
    else if (count < 12) setTimeout(next, step);
  };
  whenReady(() => duoDoc().querySelector('.rps:not([hidden]) .compat-option'), next, 6_000);
}
// Chữ kết quả theo đúng phần trăm trên màn hình (kết quả thật).
function duoResultCaption(kicker, words) {
  whenReady(() => duoDoc().querySelector('.rps:not([hidden]) .compat-score strong'), () => {
    const percent = duoDoc().querySelector('.rps .compat-score strong').textContent;
    caption({ cls: 'tight', kicker, title: [...words, [percent, 'pink'], '💞'] });
  }, 7_000);
}
const duoPose = () => {
  const list = temple().x.debugState().walkers;
  const self = selfPose();
  const partner = list.find((item) => item.id === duoShot.partner);
  if (!self) return null;
  if (!partner) return self;
  return [(self[0] + partner.x) / 2, (self[1] + partner.z) / 2, self[2]];
};

async function prepareHieuY(page) {
  const { win } = page;
  await waitFor(() => win.chanhDienSocial, 20_000, 'thẻ người chơi');
  page.s = win.chanhDienSocial;
  duoShot.live = state.signedIn;
  // Thẻ người chơi và bảng trò hiện như giao diện điện thoại trong vùng an toàn; bảng trò thu xuống nửa dưới để còn thấy
  // hai nhân vật phía trên.
  injectStyle(page, `
    .social-card, .social-card *, .rps, .rps * { visibility: visible !important; }
    .social-card { left: 4.5% !important; right: 17% !important; bottom: 20.5% !important; }
    .social-card .social-safety, .social-card .social-note { display: none !important; }
    .rps { top: 42% !important; bottom: 16% !important; left: 3.5% !important; right: 15.5% !important; gap: 8px !important; padding: 12px 14px !important; border: 1px solid rgba(217, 164, 65, .45) !important; border-radius: 22px !important; }
    .rps > * { flex-shrink: 0 !important; }
    .rps h2 { margin: 0 !important; font-size: 22px !important; }
    .rps .compat-scenario { margin: 0 !important; }
    .rps .compat-question { margin: 0 !important; font-size: 17px !important; }
    .rps .compat-option { min-height: 0 !important; padding: 10px 12px !important; }
    .rps .compat-answer-list { display: none !important; }
  `);
  const near = () => {
    const { selfId, walkers: all } = page.x.debugState();
    const self = all.find((item) => item.id === selfId);
    if (!self) return null;
    return all.filter((item) => item.id !== selfId && !item.benchId && item.z > 18 && item.z < 80 && Math.abs(item.x) < 30)
      .map((item) => ({ ...item, distance: Math.hypot(item.x - self.x, item.z - self.z) }))
      .sort((a, b) => a.distance - b.distance)[0] || null;
  };
  // Mới bật máy realtime thì bot vào phòng dần: chờ có người trong sân.
  await waitFor(() => page.x.debugState().walkers.length > 4, 40_000, 'người trong sân').catch(() => {});
  // Đi tới người gần nhất, mời nắm tay; bot nhận lời thì đi sát bên mình.
  for (let attempt = 0; attempt < 4 && !duoShot.partner; attempt += 1) {
    const target = near();
    if (!target) break;
    const reached = await waitFor(() => {
      const now = page.x.debugState().walkers.find((item) => item.id === target.id);
      const self = selfPose();
      if (!now || !self) return false;
      if (Math.hypot(now.x - self[0], now.z - self[1]) < 2.6) return true;
      page.x.walkTo({ x: now.x + 1.2, z: now.z + 0.6 });
      return false;
    }, 12_000, 'tới gần người').then(() => true, () => false);
    if (!reached) continue;
    page.s.open(target.id);
    await sleep(300);
    duoButton('.social-card', /Nắm tay/)?.click();
    const held = await waitFor(() => {
      const now = page.x.debugState().walkers.find((item) => item.id === target.id);
      const self = selfPose();
      return now && self && Math.hypot(now.x - self[0], now.z - self[1]) < 1.4;
    }, 8_000, 'nắm tay').then(() => true, () => false);
    duoClosePanel();
    if (held) {
      duoShot.partner = target.id;
      duoShot.partnerName = target.name;
    }
  }
  if (!duoShot.partner) {
    const fallback = near();
    duoShot.partner = fallback?.id || null;
    duoShot.partnerName = fallback?.name || '';
    state.warnings.push('Chưa nắm tay được ai: vẫn mời chơi người gần nhất.');
  }
  // Dắt nhau ra trước chánh điện, bước cuối quay mặt ra sân (camera trước mặt, chánh điện phía sau lưng).
  const walkVia = async (point) => {
    page.x.walkTo(point);
    await waitFor(() => {
      const pose = selfPose();
      return pose && Math.hypot(pose[0] - point.x, pose[1] - point.z) < 0.2;
    }, 20_000, 'đi ra trước chánh điện').catch(() => {});
  };
  await walkVia({ x: 0, z: 34.5 });
  await walkVia({ x: 0, z: 36.5 });
  await sleep(1_500);
}

// ---- Trí tuệ (kịch bản ?film=tri-tue) ----
// Tàng Kinh Các + khu Trí tuệ thật của trang chánh điện (window.chanhDienBrain khi debug-explore). Chuẩn bị: đi nhanh tới
// Tàng Kinh Các, ngồi ghế đá quanh bàn; xin sẵn đề thật (Đố hình, Đố số, Màu mực, Test IQ) để lúc quay mở ra ngay. Đáp án
// do server giữ: chỉ khi quay bằng scripts/promo-video.mjs trên máy dev, script đọc seed của đề trong SQLite rồi trả
// đáp án cho trang (window.promoSolved) để kịch bản tô ô đúng và làm Test IQ ra kết quả thật. Đố hình / Đố số / Màu mực
// không nộp (chỉ quay vài câu) nên được xếp lại thứ tự câu trên máy quay cho câu khó lên trước; Test IQ nộp thật (đề xin
// từ lúc chuẩn bị nên không bị TOO_FAST). Đố vui: xin vào ván ~20 giây trước cảnh Đố vui, bot trong sân vào cùng.
const brainShot = { live: false, rounds: {}, order: {}, solved: {}, iqIndex: null };
const brainDoc = () => temple().doc;
const brainUI = () => temple().win.chanhDienBrain;
const brainOptions = () => [...brainDoc().querySelectorAll('.brain-sheet .brain-options .brain-option')];
// Script quay trả đáp án của một đề (mảng chỉ số phương án theo thứ tự câu của server).
window.promoSolved = (roundId, answers) => { brainShot.solved[roundId] = answers; };
// Đáp án của câu đang hiện thứ `index` (theo thứ tự đã xếp lại trên máy quay).
function brainSolution(game, index) {
  const round = brainShot.rounds[game];
  const answers = round && brainShot.solved[round.roundId];
  if (!answers) return null;
  const original = brainShot.order[game]?.[index] ?? index;
  return Number.isInteger(answers[original]) ? answers[original] : null;
}
// Tô ô đúng (lớp .correct có sẵn của Đố vui) rồi chạm vào; chưa có đáp án thì chạm ô đầu.
function brainReveal(game, index = 0, { press = true } = {}) {
  const options = brainOptions();
  const answer = brainSolution(game, index);
  const target = answer === null ? options[0] : options[answer];
  if (answer !== null) target?.classList.add('correct');
  if (press) tap(target, 260);
  return target;
}
// Màu mực: chạm liền tay theo đúng luật của câu (trang tự biết đáp án vì phải vẽ màu ra).
function brainStroop(count, step = 420) {
  const round = brainShot.rounds.stroop;
  let index = 0;
  const next = () => {
    const options = brainOptions();
    const item = round?.problem.items[index];
    if (!options.length || !item) return;
    tap(options[item.mode === 'word' ? item.word : item.ink], 60);
    index += 1;
    if (index < count) setTimeout(next, step);
  };
  next();
}
// Test IQ tua nhanh: trả lời đủ 30 câu (sai vài câu cho thật), câu kế hiện thì mới chạm (trang chờ 160 ms giữa hai câu).
function brainIqRun({ step = 190, wrong = [3, 9, 14, 18] } = {}) {
  const round = brainShot.rounds.iq;
  if (!round) return;
  const total = round.problem.items.length;
  let index = 0;
  let shown = '';
  const next = () => {
    const counter = brainDoc().querySelector('.brain-sheet .brain-counter')?.textContent || '';
    const options = brainOptions();
    if (!options.length || index >= total) return;
    if (counter === shown) {
      setTimeout(next, 30);
      return;
    }
    shown = counter;
    const answer = brainSolution('iq', index) ?? 0;
    const choice = wrong.includes(index) ? (answer + 1) % options.length : answer;
    options[choice]?.click();
    tapRing(options[choice]);
    index += 1;
    if (index < total) setTimeout(next, step);
  };
  next();
}
// Đổi màn khu Trí tuệ: đóng (dừng bài đang làm, đóng ảnh kết quả) rồi mở thẻ.
function brainOpen(tab) {
  const ui = brainUI();
  ui?.close();
  ui?.open(tab);
}
// Mở một trò của Đề hôm nay: chạm thẻ trò → hướng dẫn → Bắt đầu (đề đã xin sẵn nên hiện ngay).
function brainPlay(game) {
  brainOpen('daily');
  tap(brainDoc().querySelector(`.brain-sheet .brain-game[data-game="${game}"]`), 120);
  setTimeout(() => tap(brainDoc().querySelector('.brain-sheet .brain-start'), 120), 520);
}

async function prepareBrain(page) {
  const { win, doc } = page;
  await waitFor(() => win.chanhDienBrain, 20_000, 'khu Trí tuệ');
  brainShot.live = state.signedIn;
  if (!state.signedIn) state.warnings.push('Chưa đăng nhập: Test IQ của khách vẫn chạy nhưng không có đáp án để tô (chạy scripts/promo-video.mjs --film tri-tue).');
  // Khu Trí tuệ (ngăn trò chơi, ảnh kết quả) hiện như giao diện điện thoại ở nửa dưới, chừa chữ phía trên và cột nút
  // TikTok bên phải; nền phía trên là Tàng Kinh Các.
  injectStyle(page, `
    .brain-sheet, .brain-sheet *, .brain-card, .brain-card * { visibility: visible !important; }
    .brain-sheet { inset: auto !important; top: 27.5% !important; bottom: 15.5% !important; left: 3.5% !important; right: 15.5% !important; gap: 8px !important; padding: 12px 14px !important; border: 1px solid rgba(178, 150, 255, .5) !important; border-radius: 22px !important; overflow: hidden !important; }
    .brain-sheet .brain-play { gap: 7px !important; }
    .brain-sheet .brain-grid { width: min(100%, 214px) !important; gap: 4px !important; padding: 5px !important; }
    .brain-sheet .brain-options.matrix { width: min(100%, 290px) !important; gap: 6px !important; }
    .brain-sheet .brain-options.matrix .brain-option { aspect-ratio: 1.3 !important; }
    .brain-sheet .brain-rotate { width: min(42%, 132px) !important; padding: 6px !important; }
    .brain-sheet .brain-options.rotation { width: min(100%, 270px) !important; gap: 6px !important; }
    .brain-sheet .brain-options.rotation .brain-option { aspect-ratio: 1.7 !important; padding: 5px !important; }
    .brain-sheet .brain-numgrid { width: min(100%, 230px) !important; }
    .brain-sheet .brain-option { min-height: 44px !important; }
    .brain-sheet .brain-skip, .brain-sheet .brain-submit { display: none !important; }
    /* Test IQ làm tua nhanh trên máy quay: ẩn dòng thời gian làm bài (vài chục giây, không giống người làm thật). */
    .brain-sheet .brain-bars .brain-bar:last-child { display: none !important; }
    .brain-card { inset: auto !important; top: 26% !important; bottom: 13% !important; left: 5% !important; right: 17% !important; border-radius: 22px !important; padding: 10px !important; }
    .brain-card .brain-small { display: none !important; }
  `);
  // Đi nhanh tới Tàng Kinh Các (bỏ qua hướng dẫn khu), rồi tới ngồi ghế đá B-19 (bên tây bàn thứ nhất).
  click(page, '.quick-travel-panel button[data-destination="library"]');
  await sleep(2_500);
  doc.querySelector('.zone-guide-skip')?.click();
  const scene = await fetch('/scenes/thien-default/scene.json').then((response) => response.json()).catch(() => null);
  const bench = scene?.world.courtyard.benches.find((item) => item.id === 'B-19');
  if (bench) {
    const [ax, az] = bench.approach;
    const spot = { x: bench.x + ax * Math.cos(bench.ry) + az * Math.sin(bench.ry), z: bench.z - ax * Math.sin(bench.ry) + az * Math.cos(bench.ry) };
    page.x.walkTo(spot, () => page.x.activateNearby());
    await waitFor(() => page.x.debugState().walkers.find((item) => item.id === page.x.debugState().selfId)?.benchId === 'B-19', 15_000, 'ngồi ghế đá').catch(() => {
      state.warnings.push('Chưa ngồi được ghế đá Tàng Kinh Các (có người ngồi rồi?).');
    });
  }
  // Xin sẵn đề thật; trang xin đề trò nào thì đưa đề đã xin (một lần).
  const fetchReal = win.fetch.bind(win);
  for (const game of ['matrix', 'series', 'stroop', 'iq']) {
    const response = await fetchReal('/api/v1/brain/round', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game }),
    }).catch(() => null);
    const round = response?.ok ? await response.json() : null;
    // Không có đề thì mọi cảnh trò chơi đứng ở màn hướng dẫn: dừng hẳn thay vì quay ra clip sai.
    if (!round) throw new Error(`không xin được đề ${game} (${response?.status || 'lỗi mạng'}) — API chạy bản cũ? Tắt npm run dev rồi chạy lại`);
    brainShot.rounds[game] = round;
    try { window.promoHost?.(JSON.stringify({ op: 'brain-solve', roundId: round.roundId })); } catch {}
  }
  // Xếp lại câu của các trò chỉ quay (không nộp): Đố hình câu khó nhất lên trước, Đố số câu khó mà số còn dễ đọc, Màu mực
  // có câu đổi luật (🔤 chọn theo chữ) ở lượt thứ ba.
  const reorder = (game, pick) => {
    const round = brainShot.rounds[game];
    if (!round) return;
    const items = round.problem.items;
    const order = pick(items).filter((index, position, list) => index >= 0 && list.indexOf(index) === position);
    const full = [...order, ...items.map((_, index) => index).filter((index) => !order.includes(index))];
    brainShot.order[game] = full;
    round.problem = { ...round.problem, items: full.map((index) => items[index]) };
  };
  const hardest = (items, test = () => true) => items.map((item, index) => ({ item, index })).filter(({ item }) => test(item)).sort((a, b) => b.item.level - a.item.level)[0]?.index ?? 0;
  reorder('matrix', (items) => [hardest(items, (item) => item.kind === 'matrix')]);
  reorder('series', (items) => [hardest(items, (item) => Array.isArray(item.terms) && item.terms.length <= 6 && Math.max(...item.terms.map(Math.abs)) < 1000)]);
  reorder('stroop', (items) => {
    const ink = items.map((item, index) => (item.mode === 'ink' && item.level >= 3 ? index : -1)).filter((index) => index >= 0);
    const word = items.map((item, index) => (item.mode === 'word' ? index : -1)).filter((index) => index >= 0);
    return [ink[0], ink[1], word[0], ink[2], word[1], ink[3]].filter((index) => index !== undefined);
  });
  win.fetch = async (url, init) => {
    if (String(url) === '/api/v1/brain/round' && init?.method === 'POST') {
      const { game } = JSON.parse(init.body || '{}');
      const ready = brainShot.rounds[game];
      if (ready && !ready.served) {
        ready.served = true;
        return new win.Response(JSON.stringify(ready), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return fetchReal(url, init);
  };
  // Chờ đáp án từ script quay (có ngay sau vài chục ms).
  if (window.promoHost) {
    await waitFor(() => ['matrix', 'series', 'iq'].every((game) => !brainShot.rounds[game] || brainShot.solved[brainShot.rounds[game].roundId]), 8_000, 'đáp án đề')
      .catch(() => state.warnings.push('Không có đáp án đề (script quay không đọc được SQLite máy dev?).'));
  }
}
// Chữ kết quả Test IQ theo đúng chỉ số trên màn hình (kết quả thật).
function brainIqCaption() {
  whenReady(() => brainDoc().querySelector('.brain-sheet .brain-iq'), () => {
    const index = brainDoc().querySelector('.brain-sheet .brain-iq').textContent;
    brainShot.iqIndex = index;
    caption({ cls: 'tight', kicker: '🧩 Test IQ vui', title: ['Mình', 'được', [index, 'green'], '\n', 'Còn', ['bạn?', 'pink'], '🤔'] });
  }, 9_000);
}

// ---- Đua xe (kịch bản ?film=dua-xe) ----
// Trang /dua-xe.html thật (tài khoản thử hoặc khách "Minh An"). Lúc bắt đầu quay mới bấm Vào đua: phòng đếm 15 giây (xe
// mình chạy thử trong lúc chờ, tự lái bằng autopilot của trang — chỉ có khi debug-race), xếp lưới, 5 đèn đỏ, xuất phát.
// Xe khác là bot thật của phòng (lấp lưới như mọi cuộc đua). Góc máy đặt bằng view.debugView; cảnh bám xe để camera bám
// của trang (debugView(null)), có cảnh bám một xe giữa đoàn cho thấy chen nhau vào cua. Mốc thời gian theo luật phòng:
// lobbyMs 15 giây + gridMs 3 giây + 5 đèn × 1 giây + tắt đèn ngẫu nhiên 0,3–1,5 giây → xuất phát ở giây ~23,3–24,5.
const raceApi = () => pages.get('race')?.win?.chanhDienRace;
const racePose = (id) => (id ? raceApi()?.view.carPose(id) : null);
const raceShot = { focus: null, side: null };
// Camera đứng yên ở pos (mảng hoặc hàm), nhìn theo một xe (vị trí nhìn làm mượt để không giật theo từng gói).
function watchCar({ pos, id, fov = 45, lift = 0.9, smooth = 5 }) {
  let look = null;
  let last = 0;
  return (u, now) => {
    const dt = last ? Math.min(0.1, (now - last) / 1_000) : 1;
    last = now;
    const pose = racePose(id());
    if (pose) {
      const target = [pose.x, lift, pose.z];
      look = look ? mix(look, target, 1 - Math.exp(-dt * smooth)) : target;
    }
    const where = typeof pos === 'function' ? pos(u) : pos;
    return look && where ? { pos: where, at: look, fov } : null;
  };
}
// Bám một xe từ trên cao phía sau (đuôi camera kéo dài dần theo u).
function riseFrom({ id, back = [10, 34], up = [4, 30], fov = 52 }) {
  let anchor = null;
  return (u) => {
    const pose = racePose(id());
    if (pose) anchor = pose;
    if (!anchor) return null;
    const k = ease.inOut(clamp01(u));
    const fx = Math.sin(anchor.h);
    const fz = Math.cos(anchor.h);
    const b = lerp(back[0], back[1], k);
    return { pos: [anchor.x - fx * b, lerp(up[0], up[1], k), anchor.z - fz * b], at: [anchor.x + fx * 6, 0.8, anchor.z + fz * 6], fov };
  };
}

async function prepareRace(page) {
  await page.loaded;
  silence(page);
  const { win } = page;
  await waitFor(() => win.chanhDienRace?.state && win.chanhDienRace.myId, 60_000, 'vào phòng đua xe');
  const race = win.chanhDienRace;
  // Lần quay trước còn trong hàng chờ / đang chạy thử: rời ra rồi chờ đường trống (cuộc đua cũ kết thúc).
  if (race.me?.mode === 'queued') click(page, '#join');
  if (race.me?.mode === 'practice') click(page, '#stopDrive');
  await waitFor(() => race.state.phase === 'idle', 240_000, 'đường đua trống (cuộc đua trước kết thúc)');
  click(page, '#colors button[data-color="0"]');
  // Chỉ để cảnh 3D + bảng thứ hạng (giữa bên trái, dưới chữ của clip); nút, bảng, đồng hồ của trang ẩn hết.
  injectStyle(page, `
    .top, .hud, .status-pill, .minimap, .lights, .banner, .toast, .feed, .speed, .tools, .controls, .panel, .sheet { display: none !important; }
    .tower { top: 46% !important; font-size: 13px !important; width: 150px !important; }
    body:not(.promo-tower) .tower { display: none !important; }
  `);
  await sleep(1_500);
}

function buildRaceFilm() {
  const race = raceApi();
  const track = race.track;
  const length = track.length;
  const spot = (s, d = 0, y = 0) => {
    const point = track.pointAt(s, d);
    return [point.x, y, point.z];
  };
  // Chỗ đứng bên đường trước mặt một xe (xe tới sau ~seconds giây), phía ngoài cua để tầm nhìn tới xe nằm trên mặt đường
  // (phía trong cua bị rào / cây che).
  const aheadOf = (pose, seconds, height) => {
    const s = track.project(pose.x, pose.z).s + Math.max(28, Math.abs(pose.speed) * seconds);
    const index = Math.floor((((s % length) + length) % length) / track.step) % track.samples;
    const outside = track.curvature[index] > 0 ? -1 : 1;
    const wall = outside > 0 ? track.wallLeft[index] : track.wallRight[index];
    return spot(s, outside * Math.min(track.half + 4, wall - 1.5), height);
  };
  const mine = () => race.myId;
  const view = () => race.view;
  const body = () => pages.get('race').doc.body.classList;
  const turnOne = 0.2 * length;
  const turnIndex = Math.floor(turnOne / track.step) % track.samples;
  return [
    // 0. Trên cao: cả trường đua. Bấm Vào đua (phòng bắt đầu đếm 15 giây) + chạy thử, xe tự lái.
    {
      page: 'race', dur: 3.6, transition: 'cut',
      enter: () => {
        const page = pages.get('race');
        click(page, '#join');
        setTimeout(() => {
          click(page, '#practice');
          race.autopilot = true;
        }, 250);
      },
      // Bay trên khán đài chính dọc đường thẳng: giàn đèn, dãy pit, khán đài.
      cam: move({ pos: spot(-150, 45, 80), at: spot(40, -10, 0), fov: 52 }, { pos: spot(-70, 30, 42), at: spot(130, -10, 0), fov: 54 }, ease.inOut),
      caption: { kicker: '🏎️ Phòng mới', title: ['Trường', 'đua', ['Hoa Sen', '']], sub: 'Đua cùng người chơi khác, ngay trên điện thoại' },
    },
    // 1. Bám sau xe mình đang chạy thử.
    {
      page: 'race', dur: 4.8, transition: 'flash',
      enter: () => { view().setFocus(mine()); view().setCameraMode('chase'); },
      caption: { kicker: '🕹 Một ngón tay', title: ['Kéo', 'để', 'lái,', ['ga tự động', 'blue']], sub: 'Xe tự giảm tốc trước mỗi khúc cua' },
    },
    // 2. Đứng bên đường đón xe lao tới.
    {
      page: 'race', dur: 3.6, transition: 'cut',
      enter: () => {
        const pose = racePose(mine());
        if (!pose) return;
        raceShot.side = aheadOf(pose, 2.3, 1.5);
      },
      cam: watchCar({ pos: () => raceShot.side, id: mine, fov: 40, lift: 0.7, smooth: 7 }),
      caption: { kicker: '🎨 8 màu xe', title: ['Xe', 'đua', ['3D', ''], 'như', 'thật'] },
    },
    // 3. Lại sau xe: phòng sắp xếp lưới.
    {
      page: 'race', dur: 3.3, transition: 'cut',
      enter: () => { view().setFocus(mine()); view().setCameraMode('chase'); },
      caption: { kicker: '⏱ Chạy thử lấy giờ', title: ['Đua', 'cùng', ['bạn bè', 'blue']], sub: 'Đủ người là xếp lưới, xe khác vào lấp chỗ' },
    },
    // 4. Trước vạch xuất phát nhìn về lưới: các xe xếp hàng dưới giàn đèn.
    {
      page: 'race', dur: 2.9, transition: 'flash',
      enter: () => { view().debugLabels(false); body().add('promo-tower'); },
      cam: move({ pos: spot(16, 0, 3.6), at: spot(-42, 0, 0.6), fov: 46 }, { pos: spot(11, 1.5, 2.7), at: spot(-40, 0, 0.8), fov: 44 }, ease.out),
      caption: { kicker: '🏁 Xếp lưới', title: ['Xếp', 'theo', ['vòng nhanh nhất', '']], sub: 'Chạy thử trước để giành ô đầu' },
    },
    // 5. Sau đoàn xe nhìn lên giàn đèn: 5 đèn đỏ sáng dần rồi tắt.
    {
      page: 'race', dur: 6.4, transition: 'cut',
      enter: () => body().remove('promo-tower'),
      cam: move({ pos: spot(-80, 0, 2.9), at: spot(2, 0, 5.4), fov: 30 }, { pos: spot(-76, 0, 2.5), at: spot(2, 0, 5.6), fov: 28 }, ease.linear),
      caption: { kicker: '🔴 5 đèn đỏ', title: ['Đèn', 'tắt', 'là', ['xuất phát!', 'red']] },
    },
    // 6. Bám một xe giữa đoàn từ trên cao: cả đoàn lao xuống đường thẳng.
    {
      page: 'race', dur: 3.8, transition: 'cut',
      enter: () => {
        const order = [...(race.state?.drivers || [])].filter((item) => item.mode === 'race').sort((a, b) => (a.pos || 99) - (b.pos || 99));
        raceShot.focus = (order[Math.min(3, order.length - 1)] || order[0])?.id || mine();
        view().setFocus(raceShot.focus);
        view().setCameraMode('far');
        view().debugLabels(true);
        body().add('promo-tower');
      },
      caption: { kicker: '💥 Va chạm thật', title: ['Chen', 'nhau', 'từng', ['khúc cua', 'blue']] },
    },
    // 7. Bên đường trước đoàn xe (phía ngoài cua): cả đoàn lao tới rồi vụt qua.
    {
      page: 'race', dur: 4.2, transition: 'cut',
      enter: () => {
        const pose = racePose(raceShot.focus || mine());
        raceShot.side = pose ? aheadOf(pose, 2.6, 2.6) : spot(turnOne, track.wallLeft[turnIndex] - 1.5, 3.4);
      },
      cam: watchCar({ pos: () => raceShot.side, id: () => raceShot.focus || mine(), fov: 44, lift: 0.6, smooth: 4 }),
      caption: { kicker: '💨 Sát nút', title: ['Phanh', 'muộn,', ['vượt lên', '']] },
    },
    // 8. Lại xe mình, bảng thứ hạng bên trái.
    {
      page: 'race', dur: 4.0, transition: 'cut',
      enter: () => { view().setFocus(mine()); view().setCameraMode('chase'); },
      caption: { kicker: '🏆 Bảng vàng', title: ['Vòng', 'nhanh', 'nhất', ['mỗi ngày', '']], sub: 'Không tốn xu · chỉ cần tay lái' },
    },
    // 9. Màn cuối: camera rút lên cao sau xe mình.
    {
      page: 'race', dur: 4.2, transition: 'cut', end: true,
      cam: riseFrom({ id: mine }),
      caption: null,
      enter: () => {
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// ---- Chánh điện (kịch bản ?film=chanh-dien) ----
// Người ngồi bồ đoàn là bot của phòng (BOTS_THIEN). Dâng hoa, thỉnh chuông, dâng hương gọi renderer.offer trên máy quay
// (người ngồi cúi lạy, cánh sen bay, nén hương bay ra lư), không gửi server. Bảy trạm Vườn Đèn thắp bằng
// explore.setPilgrimage: chỉ đổi hình trên máy quay, không ghi tiến độ của ai.
const HALL_SEAT = (item) => Number(String(item.seatId).replace(/\D/g, '')) || 99;
// Người đang ngồi, hàng đầu trước (S-1… gần bàn thờ).
const hallSeated = () => [...(temple().seated || [])].sort((a, b) => HALL_SEAT(a) - HALL_SEAT(b));
function hallOffer(kind, count, gap = 280, from = 0) {
  hallSeated().slice(from, from + count).forEach((item, index) => {
    setTimeout(() => temple().r.offer(item.id, kind, { big: kind === 'bell' }), index * gap);
  });
}
function hallSay(index, text) {
  const item = hallSeated()[index];
  if (item) temple().r.say(item.id, text);
}
// Thắp lần lượt các trạm đèn (mã trạm theo world.courtyard.wishGarden.stations), mỗi trạm sau gap giây.
const WISH_STATIONS = ['wish-1', 'wish-2', 'wish-3', 'wish-4', 'wish-5', 'wish-6', 'wish-7'];
function lightStations(count, gap) {
  for (let index = 1; index <= count; index += 1) setTimeout(() => temple().x.setPilgrimage?.(WISH_STATIONS.slice(0, index)), index * gap * 1_000);
}

async function prepareHall(page) {
  page.x.setPilgrimage?.([]);
  await waitFor(() => (page.seated || []).length >= 6, 45_000, 'người ngồi thiền trong điện').catch(() => {
    state.warnings.push('Trong điện ít người ngồi: chạy dev với bot (BOTS_THIEN=30 npm run dev) rồi quay lại.');
  });
}

function buildHallFilm() {
  return [
    // 0. Mở đầu: chiều muộn, bay từ sân vào trước cửa chánh điện.
    {
      page: 'temple', dur: 3.6, transition: 'cut', sun: (u) => lerp(9, 6, u),
      enter: () => temple().x.setPilgrimage?.([]),
      cam: move({ pos: [10, 13, 70], at: [0, 4, 18], fov: 54 }, { pos: [2.6, 4.0, 37], at: [0, 3.2, 12], fov: 46 }),
      caption: { cls: 'big', title: ['Đi', 'chùa', '\n', ['ngay trên', 'pink'], '\n', ['điện thoại', ''], '🙏'] },
    },
    // 1. Trong điện: lướt từ cửa vào giữa các hàng bồ đoàn, mọi người ngồi thiền.
    {
      page: 'temple', dur: 4.2, transition: 'flash', sun: 6,
      cam: move({ pos: [0, 2.3, 15.4], at: [0, 1.9, -3], fov: 50 }, { pos: [0, 1.7, 12.0], at: [0, 1.6, 2], fov: 50 }, ease.out),
      at: [[1.6, () => hallSay(2, 'Nam Mô A Di Đà Phật 🙏')]],
      caption: { cls: 'tight', kicker: '🪷 Chánh điện 3D', title: ['Ngồi', 'thiền', ['cùng nhau', '']], sub: 'Mỗi người một bồ đoàn · từ khắp nơi' },
    },
    // 2. Dâng hoa rồi thỉnh chuông: người ngồi cúi lạy, cánh sen bay, chuông lớn làm hào quang sáng lên.
    {
      page: 'temple', dur: 4.8, transition: 'cut', sun: 6,
      enter: () => hallOffer('petal', 4, 220),
      at: [
        [1.4, () => {
          hallOffer('lotus', 3, 260, 4);
          caption({ cls: 'tight', kicker: '🙏 Dâng lễ', title: ['Dâng', ['hoa sen', 'pink'], '🪷'] });
        }],
        [2.9, () => {
          hallOffer('bell', 1, 0, 1);
          flash(true);
          caption({ cls: 'tight', kicker: '🙏 Dâng lễ', title: ['Thỉnh', ['chuông', ''], '🔔'], sub: 'Cả điện cùng nghe 🙏' });
        }],
      ],
      cam: move({ pos: [2.4, 2.2, 9.4], at: [-0.3, 1.5, 1.6], fov: 48 }, { pos: [1.4, 2.6, 7.8], at: [0, 2.2, -0.5], fov: 48 }),
      caption: { cls: 'tight', kicker: '🙏 Dâng lễ', title: ['Dâng', ['cánh sen', 'pink'], '🌸'] },
    },
    // 3. Dâng hương: lư hương trước điện (nén hương của người dâng cắm thêm vào lư), nhìn qua cửa vào điện.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: 5,
      enter: () => hallOffer('incense', 6, 380),
      cam: move({ pos: [2.2, 3.5, 28.4], at: [0, 2.2, 18], fov: 46 }, { pos: [1.4, 3.1, 26.6], at: [0, 2.4, 17], fov: 44 }, ease.linear),
      caption: { cls: 'tight', kicker: '🕯 Dâng hương', title: ['Thắp', 'nén', ['nhang', ''], 'nguyện', 'cầu'], sub: 'Bình an cho người thân 💛' },
    },
    // 4. Quan Âm lúc hoàng hôn.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: (u) => lerp(3, 0.5, u),
      cam: orbit({ center: [22, 0, 50], radius: 19, radius2: 16, height: 3.2, height2: 4.4, from: -2.05, to: -1.6, look: 3.0, fov: 46 }),
      caption: { cls: 'tight', kicker: '🌅 Sân chùa', title: ['Tĩnh', 'tâm', ['mỗi ngày', 'blue']], sub: 'Quan Âm · Bồ Đề · La Hán · hồ sen' },
    },
    // 5. Vườn Đèn Tâm Nguyện về đêm: thắp lần lượt 7 trạm, cây nguyện ước giữa hồ sáng dần.
    {
      page: 'temple', dur: 5.4, transition: 'flash', sun: -13,
      enter: () => { temple().x.setPilgrimage?.([]); lightStations(7, 0.55); },
      cam: orbit({ center: [5, 0, 122], radius: 19, radius2: 16, height: 6.5, height2: 5.5, from: 3.6, to: 3.1, look: 4.2, fov: 52 }),
      caption: { cls: 'tight', kicker: '🏮 Vườn Đèn Tâm Nguyện', title: ['Thắp', '7', 'trạm', '\n', ['đèn tâm nguyện', '']], sub: 'Cây nguyện ước giữa hồ sáng dần ✨' },
    },
    // 6. Đêm trăng trên mái chánh điện.
    {
      page: 'temple', dur: 3.2, transition: 'flash', sun: -15,
      cam: move({ pos: [0, 2.6, 62], at: [0, 5.4, 20], fov: 50 }, { pos: [0, 3.2, 52], at: [0, 5.8, 18], fov: 46 }),
      caption: { cls: 'tight', kicker: '🌙 Trời theo giờ thật', title: ['Đêm', 'về,', ['đèn lồng', 'blue'], 'sáng'] },
    },
    // 7. Màn cuối.
    {
      page: 'temple', dur: 4.2, transition: 'cut', end: true, sun: -15,
      cam: move({ pos: [0, 3.2, 52], at: [0, 5.8, 18], fov: 46 }, { pos: [0, 4.2, 45], at: [0, 6.1, 17], fov: 44 }, ease.out),
      caption: null,
      enter: () => {
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// ---- Phong cảnh (kịch bản ?film=canh) ----
// Chỉ bay camera + đổi giờ trời / phong cảnh bang trên máy quay; bot vẫn đi dạo, chơi xích đu như thường.
function buildSceneryFilm() {
  return [
    // 0. Mở đầu: từ trên Vườn Hoa lướt về phía chánh điện.
    {
      page: 'temple', dur: 3.8, transition: 'cut', sun: 14,
      cam: move({ pos: [-40, 24, 95], at: [-20, 2, 40], fov: 52 }, { pos: [-28, 16, 74], at: [-6, 3, 28], fov: 50 }),
      caption: { cls: 'big', title: ['Cả', 'một', 'ngôi', 'chùa', '\n', ['để dạo chơi', 'green'], '🌿'] },
    },
    // 1. Vườn Hoa: lướt thấp qua luống hoa tới đình.
    {
      page: 'temple', dur: 4.2, transition: 'flash', sun: 14,
      cam: move({ pos: [-19, 1.5, 21], at: [-33, 1.3, 31.5], fov: 50 }, { pos: [-21.6, 2.2, 23.2], at: [-33.5, 1.5, 32], fov: 50 }),
      caption: { cls: 'tight', kicker: '🌸 Vườn Hoa', title: ['Vườn', 'hoa', ['ngàn bông', 'pink']], sub: 'Tulip · oải hương · hướng dương · anh đào' },
    },
    // 2. Rừng thiền: theo bến gỗ ra thủy đình giữa hồ sen.
    {
      page: 'temple', dur: 4.2, transition: 'flash', sun: 12,
      cam: move({ pos: [-74.6, 2.6, 25.2], at: [-76, 1.5, 40], fov: 50 }, { pos: [-75.5, 2.1, 28.8], at: [-76, 1.7, 40], fov: 50 }),
      caption: { cls: 'tight', kicker: '🌲 Rừng thiền', title: ['Thủy', 'đình', 'giữa', ['hồ sen', 'green']], sub: 'Thiền hành quanh hồ · ngồi ghế ngắm sen' },
    },
    // 3. Đường La Hán: bay vòng quanh tượng La Hán dát vàng bên lối vào chánh điện. (Không quay Hồ Sen lớn: sen / đá bờ chỉ
    // hiện khi công trình chung đủ tiến độ, máy dev thường chưa có.)
    {
      page: 'temple', dur: 3.6, transition: 'flash', sun: 12,
      cam: orbit({ center: [5.6, 0, 38.5], radius: 4.8, radius2: 4.2, height: 1.3, height2: 1.7, from: -1.4, to: -0.8, look: 1.3, fov: 50 }),
      caption: { cls: 'tight', kicker: '🙏 Đường La Hán', title: ['Dạo', 'bước', 'giữa', ['La Hán', 'blue']], sub: 'Rồi vào chánh điện lễ Phật 🪷' },
    },
    // 4. Khu vui chơi: xích đu, cầu tuột, đu quay.
    {
      page: 'temple', dur: 3.6, transition: 'flash', sun: 12,
      cam: orbit({ center: [23, 0, 30.9], radius: 13, radius2: 11, height: 4.6, height2: 3.6, from: -1.15, to: -0.55, look: 1.4, fov: 48 }),
      caption: { cls: 'tight', kicker: '🎠 Khu vui chơi', title: ['Xích', 'đu,', ['cầu tuột', 'pink']], sub: 'Rủ bạn ra chơi cùng' },
    },
    // 5. Mỗi bang một cảnh: cùng một khung, phong cảnh đổi theo bang mỗi 0,8 giây.
    {
      page: 'temple', dur: 4.0, transition: 'flash', sun: 14,
      enter: () => showRegion(0),
      at: [0.8, 1.6, 2.4, 3.2].map((at, index) => [at, () => showRegion(index + 1)]),
      cam: move({ pos: [0, 9.6, 127], at: [0, 3, 75], fov: 52 }, { pos: [0, 7.6, 113], at: [0, 3.4, 70], fov: 50 }, ease.linear),
      caption: { cls: 'tight', kicker: '🗺️ Khu vực', title: ['Mỗi', 'bang', ['một cảnh', 'blue']] },
    },
    // 6. Hoàng hôn xuống rồi đêm trăng trên chánh điện.
    {
      page: 'temple', dur: 4.4, transition: 'flash',
      enter: () => gameChips(null),
      sun: (u) => lerp(4, -15, u),
      cam: move({ pos: [0, 3.0, 70], at: [0, 5.2, 20], fov: 50 }, { pos: [0, 3.2, 54], at: [0, 5.8, 18], fov: 46 }),
      caption: { cls: 'tight', kicker: '🌅 Trời theo giờ thật', title: ['Hoàng', 'hôn,', '\n', ['đêm lên đèn', ''], '🏮'], sub: 'Bầu trời theo giờ nơi bạn ở' },
    },
    // 7. Màn cuối.
    {
      page: 'temple', dur: 4.0, transition: 'cut', end: true, sun: -15,
      cam: move({ pos: [0, 3.2, 54], at: [0, 5.8, 18], fov: 46 }, { pos: [0, 4.2, 46], at: [0, 6.1, 17], fov: 44 }, ease.out),
      caption: null,
      enter: () => {
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// ---- Kịch bản ----
// Mỗi cảnh: page, dur (giây), transition, cam(u, now) cho chánh điện, sun (độ hoặc hàm u → độ), caption (undefined = giữ chữ
// cũ, null = xóa), enter(), at: [[giây, hàm]] chạy giữa cảnh.
const GAMES = ['🃏 Tiến Lên', '🦀 Bầu Cua', '🔢 Lô Tô', '✊ Tù Tì'];
let social = null;
let cinemaCast = [];

function buildFilm() {
  return [
    // 0. Mở đầu: bay từ ngoài cổng tam quan vào sân chùa.
    {
      page: 'temple', dur: 4.0, transition: 'cut', sun: 16,
      cam: move({ pos: [0, 15, 128], at: [0, 4, 52], fov: 54 }, { pos: [0, 7.5, 97], at: [0, 4.6, 32], fov: 46 }),
      caption: { cls: 'big', title: ['Web', 'này', 'có', 'cả', '\n', ['nông trại', 'green'], '\n', ['rạp phim', 'pink'], '\n', 'và', ['game', ''], '😳'] },
    },
    // 1. Nông trại: đứng ngoài cổng nhìn nhân vật của mình (Hạc Tiên bay cạnh) bước vào, camera nâng lên lộ cả trại.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: 16,
      enter: () => temple().x.walkTo({ x: 44, z: 73 }),
      cam: move({ pos: [43.2, 1.5, 61.6], at: [43.6, 1.2, 72], fov: 50 }, { pos: [42.6, 6.4, 61.2], at: [44.8, 0.3, 80], fov: 50 }),
      caption: { kicker: '🐐 Nông trại', title: ['Nuôi', 'thú', ['dễ thương', 'green']], sub: 'Thỏ · vịt · dê · heo con · nai · ngựa con' },
    },
    {
      page: 'temple', dur: 2.6, transition: 'cut', sun: 16,
      enter: () => trick('farm-goat-rau'),
      cam: track({ subject: () => animal('farm-goat-rau'), radius: 3.2, height: 1.3, from: -0.9, to: -0.2, look: 0.55, fov: 42 }),
      caption: { kicker: '🐐 Nông trại', title: ['Cho', 'ăn,', 'vuốt', 've,', '\n', ['xem làm trò', 'green']], sub: 'Mỗi con một trò riêng 🐰🦆🐷' },
    },
    {
      page: 'temple', dur: 2.4, transition: 'cut', sun: 16,
      enter: () => { trick('farm-pony-gio'); trick('farm-rabbit-bong', 'feed'); },
      cam: track({ subject: () => animal('farm-pony-gio'), radius: 4.2, height: 1.6, from: 0.6, to: 1.3, look: 0.9, fov: 44 }),
    },
    // 2. Linh thú: camera phía trước bên tay phải nhân vật (Hạc Tiên bay ngang vai phải).
    {
      page: 'temple', dur: 3.6, transition: 'flash', sun: 16,
      enter: () => temple().x.walkTo({ x: 40.5, z: 86 }),
      cam: track({ subject: selfPose, relative: true, radius: 4.6, radius2: 3.8, height: 1.9, height2: 1.7, from: -1.55, to: -1.05, look: 1.3, fov: 44, smooth: 6 }),
      caption: { kicker: '✨ Linh thú', title: ['Linh', 'thú', ['đi theo', 'blue'], 'bạn'], sub: 'Cá Chép · Rùa Thần · Hạc Tiên · Sư Tử' },
    },
    // 3. Khu thú cưng: chó Milo làm trò.
    {
      page: 'temple', dur: 3.0, transition: 'flash', sun: 16,
      enter: () => { trick('pet-dog-milo'); trick('pet-dog-fox', 'play'); },
      cam: track({ subject: () => animal('pet-dog-milo'), radius: 3.4, height: 1.4, from: -0.5, to: 0.3, look: 0.4, fov: 44 }),
      caption: { kicker: '🐶 Thú cưng', title: ['Chơi', 'với', ['cún & mèo', 'pink']], sub: 'Milo, Fox, Meomeo… chờ bạn ghé chơi' },
    },
    // 4. Rạp phim: toàn cảnh rạp rồi quay ngược nhìn khán giả. Chữ đặt giữa khung (màn chiếu ở phía trên).
    {
      page: 'cinema', dur: 4.2, transition: 'whip',
      enter: () => {
        $('credit').hidden = false;
        cinema().c.setCamera('overview');
        cinemaCast = pickCinemaCast();
      },
      at: [
        [0.5, () => cinemaSay(0, 'Phim dễ thương quá 🥰')],
        [1.2, () => cinemaReact('heart', 6)],
        [1.6, () => cinemaSay(1, 'Con thỏ to ghê 🤣')],
        [2.4, () => cinemaReact('laugh', 5)],
        [2.8, () => cinemaSay(2, 'Cả rạp cùng xem vui ghê!')],
        [3.4, () => cinemaReact('heart', 6)],
      ],
      caption: { cls: 'mid', kicker: '🎬 Rạp phim', title: ['Xem', 'phim', ['chung', 'pink'], 'cả', 'rạp'], sub: 'Chat bay trên đầu · thả tim cùng nhau 💖' },
    },
    {
      page: 'cinema', dur: 3.6, transition: 'cut',
      enter: () => cinema().c.setCamera('audience'),
      at: [
        [0.2, () => cinemaReact('clap', 6)],
        [0.6, () => cinemaSay(3, 'Mai chiếu tiếp nha mọi người 🍿')],
        [1.2, () => cinemaReact('heart', 8)],
        [1.8, () => cinemaSay(4, 'Hay quá trời 👏')],
        [2.2, () => cinemaReact('fire', 5)],
        [2.8, () => cinemaReact('wow', 5)],
      ],
    },
    // 5. Phòng game: bốn trò hiện như màn hình điện thoại, cắt nhanh. Ghi rõ xu ảo, không đổi ra tiền thật.
    {
      page: 'tienlen', dur: 3.0, transition: 'whip',
      enter: () => { $('credit').hidden = true; gameChips(GAMES, 0); },
      at: [[0.5, () => click(pages.get('tienlen'), '#hint')], [1.4, () => click(pages.get('tienlen'), '#play')]],
      caption: { cls: 'tight', title: ['Game', ['cùng nhau', '']], sub: 'Xu ảo miễn phí · không đổi ra tiền thật' },
    },
    {
      page: 'baucua', dur: 2.4, transition: 'flash',
      enter: () => gameChips(GAMES, 1),
      at: [[0.3, () => betBauCua(0)], [0.8, () => betBauCua(3)], [1.3, () => betBauCua(4)]],
    },
    {
      page: 'loto', dur: 2.2, transition: 'flash',
      // Chưa có vé (ván đang gọi số): mở bảng 90 số, các số đã gọi sáng lên.
      enter: () => {
        gameChips(GAMES, 2);
        const loto = pages.get('loto');
        if (!loto.doc.querySelector('#tickets .ticket') && loto.doc.getElementById('toggleBoard')?.getAttribute('aria-expanded') !== 'true') click(loto, '#toggleBoard');
      },
    },
    {
      page: 'rps', dur: 2.4, transition: 'flash',
      enter: () => gameChips(GAMES, 3),
      at: [[0.4, () => click(pages.get('rps'), '#choices [data-choice="rock"]')]],
    },
    // 6. Bạn bè: quay nhóm người đứng gần nhau nhất trong sân (nhân vật ở nửa dưới khung, bong bóng chat trên đầu),
    // thông báo kết bạn / tin nhắn / lời mời hiện ở nửa trên.
    {
      page: 'temple', dur: 5.4, transition: 'whip', sun: 14,
      enter: () => {
        gameChips(null);
        social = crowd();
        const names = social?.people.map((item) => item.name) || [];
        const lines = ['Chào bạn, kết bạn nha! 🤝', 'Tối nay coi phim chung hông? 🍿', 'Đi! Rủ thêm mọi người 😆'];
        social?.people.slice(0, 3).forEach((item, index) => setTimeout(() => sayTemple(item.id, lines[index]), 300 + index * 1_400));
        setTimeout(() => {
          const friend = note({ avatar: '🤝', title: names[0] || 'Hải Đăng', text: 'muốn kết bạn với bạn', act: 'Đồng ý' });
          setTimeout(() => friend.done('✓ Bạn bè'), 1_100);
        }, 900);
        setTimeout(() => note({ avatar: '💌', title: names[1] || 'Gia Hân', text: 'Vào rạp xem phim không? 🍿', act: 'Trả lời' }), 2_500);
        setTimeout(() => note({ avatar: '🎟', title: 'Lời mời vào bàn', text: 'Tiến Lên · 20 xu', act: 'Vào' }), 3_800);
      },
      cam: track({ subject: socialCenter, radius: 5.6, radius2: 4.6, height: 1.8, height2: 1.6, from: 0.55, to: 0.1, look: 2.2, fov: 48, smooth: 2 }),
      caption: { cls: 'compact', kicker: '💬 Bạn bè', title: ['Kết', 'bạn', ['khắp nơi', 'blue']] },
    },
    // 7. Mỗi bang một cảnh: cùng một khung từ ngoài cổng, camera trôi đều, phong cảnh đổi theo bang mỗi 0,8 giây.
    {
      page: 'temple', dur: 4.0, transition: 'flash', sun: 16,
      enter: () => { clearNotes(); showRegion(0); },
      at: [0.8, 1.6, 2.4, 3.2].map((at, index) => [at, () => showRegion(index + 1)]),
      cam: move({ pos: [0, 9.6, 127], at: [0, 3, 75], fov: 52 }, { pos: [0, 7.6, 113], at: [0, 3.4, 70], fov: 50 }, ease.linear),
      caption: { cls: 'tight', kicker: '🗺️ Khu vực', title: ['Mỗi', 'bang', ['một cảnh', 'blue']] },
    },
    // 8. Phong cảnh: Vườn Hoa lúc hoàng hôn rồi sân chùa về đêm.
    {
      page: 'temple', dur: 3.6, transition: 'flash',
      enter: () => gameChips(null),
      sun: (u) => lerp(9, -2.5, u),
      cam: move({ pos: [-18, 15, 8], at: [-33, 0, 32], fov: 52 }, { pos: [-22, 9, 15], at: [-34, 0.6, 33], fov: 48 }),
      caption: { kicker: '🌅 Phong cảnh', title: ['Trời', 'theo', ['giờ thật', '']], sub: 'Bình minh · hoàng hôn · đêm trăng 🌙' },
    },
    {
      page: 'temple', dur: 3.0, transition: 'flash',
      sun: (u) => lerp(-9, -16, u),
      cam: move({ pos: [0, 2.6, 66], at: [0, 5.2, 22], fov: 50 }, { pos: [0, 3.4, 54], at: [0, 5.6, 20], fov: 46 }),
    },
    // 9. Màn cuối.
    {
      page: 'temple', dur: 4.4, transition: 'cut', end: true, sun: -16,
      cam: move({ pos: [0, 3.4, 54], at: [0, 5.6, 20], fov: 46 }, { pos: [0, 4.4, 46], at: [0, 6, 18], fov: 44 }, ease.out),
      caption: null,
      enter: () => {
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// Clip vườn (~33 giây): gieo → tưới → tua 16 giờ → hái → ra quầy bán → xu dùng cho cả web → màn cuối.
function buildGardenFilm() {
  return [
    // 0. Mở đầu: bay trên Vườn Công Đức, luống nào cũng có cây, quả chín.
    {
      page: 'temple', dur: 3.2, transition: 'cut', sun: 14,
      cam: move({ pos: [45, 18, 88], at: [25, 0, 66], fov: 50 }, { pos: [38, 11, 81], at: [24.5, 0.4, 66.5], fov: 48 }),
      caption: { cls: 'big', title: ['Trồng', 'cây,', ['hái quả', 'green'], '\n', 'đem', 'bán', 'lấy', ['xu', '']] },
    },
    // 1. Chọn hạt Đào trên thẻ luống rồi gieo: nhân vật cầm túi hạt rải xuống luống.
    {
      page: 'temple', dur: 5.0, transition: 'flash', sun: 14,
      at: [[0.2, gOpenCard], [0.9, gChooseSeed], [1.7, gPlant], [2.5, gCloseCard]],
      cam: move({ pos: L(1.9, 2.6, -4.6), at: L(0, 0.2, 1.2), fov: 46 }, { pos: L(1.2, 2.2, -3.6), at: L(0, 0.35, 1.3), fov: 44 }),
      caption: { cls: 'tight', kicker: '🌱 Vườn Công Đức', title: ['Chọn', 'hạt,', ['gieo xuống', 'green'], 'luống'], sub: '🍎 Táo · 🍊 Cam · 🍑 Đào' },
    },
    // 2. Tưới: nhìn ngang từ lối đi, bình tưới và giọt nước rơi xuống luống.
    {
      page: 'temple', dur: 3.4, transition: 'cut', sun: 14,
      at: [[0.1, gOpenCard], [0.7, gWater], [1.3, gCloseCard]],
      cam: move({ pos: L(1.8, 2.3, -3.2), at: L(0, 0.35, 1.1), fov: 44 }, { pos: L(1.3, 2.0, -2.7), at: L(0, 0.4, 1.1), fov: 44 }),
      caption: { cls: 'tight', kicker: '💧 Chăm cây', title: ['Tưới', ['3 lần', 'blue'], 'là', 'ra', 'quả'], sub: 'Mỗi lần cách nhau 8 giờ' },
    },
    // 3. Tua nhanh 16 giờ: chiều → đêm → sáng, cây mầm → cây non → ra 10 quả.
    {
      page: 'temple', dur: 4.4, transition: 'fade', sun: timelapseSun, night: (u) => clamp01((14 - timelapseSun(u)) / 28) * 0.8,
      enter: () => gStage('sprout'),
      at: [[1.0, () => gBurst('water')], [1.9, () => gStage('young')], [2.9, () => gBurst('water')], [3.35, () => gStage('fruiting')], [3.6, gRipen]],
      cam: move({ pos: L(2.4, 2.9, -5.2), at: L(0, 0.5, 0.6), fov: 44 }, { pos: L(1.8, 3.1, -4.4), at: L(0, 0.3, 0.9), fov: 44 }, ease.linear),
      caption: { cls: 'tight', kicker: '⏩ 16 giờ sau', title: ['Cây', ['lớn dần', 'green'], '\n', 'ra', ['10 quả', '']] },
    },
    // 4. Hái hết 10 quả: nhân vật xách giỏ, quả bay vào giỏ.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: 14,
      at: [[0.15, gOpenCard], [0.8, gHarvest], [1.6, () => pop('+10 🍑', { small: true, top: 23 })]],
      cam: move({ pos: L(-1.7, 3.3, -3.6), at: L(0, 0.35, 1.6), fov: 42 }, { pos: L(-1.2, 2.3, -2.8), at: L(0, 0.55, 1.4), fov: 42 }),
      caption: { cls: 'tight', kicker: '🧺 Thu hoạch', title: ['Hái', ['cả giỏ', 'green'], '🍑'] },
    },
    // 5. Ra Quầy hạt giống ngay cổng vườn.
    {
      page: 'temple', dur: 2.3, transition: 'flash', sun: 14,
      enter: gToStall,
      cam: move({ pos: [16.6, 4.6, 76.8], at: [11.6, 0.4, 69.4], fov: 48 }, { pos: [15.3, 3.7, 74.8], at: [12.0, -0.2, 69.6], fov: 46 }),
      caption: { cls: 'tight', kicker: '🏪 Quầy hạt giống', title: ['Đem', 'ra', ['quầy bán', '']] },
    },
    // 6. Bán hết quả ở quầy (bảng quầy thật: ví xu, kho quả, nút Bán hết / Dâng).
    {
      page: 'temple', dur: 4.0, transition: 'cut', sun: 14,
      at: [[0.1, gOpenShop], [1.3, gSellAll]],
      cam: move({ pos: [15.3, 3.7, 74.8], at: [12.0, -0.2, 69.6], fov: 46 }, { pos: [14.9, 3.5, 74.2], at: [12.1, -0.3, 69.6], fov: 45 }),
      caption: { cls: 'tight', kicker: '💰 Thu mua trái cây', title: ['Bán', 'quả', 'lấy', ['xu', '']], sub: 'hoặc dâng quả lên Tam Bảo 🙏' },
    },
    // 7. Xu dùng khắp web: camera bay lên lộ cả vườn lúc nắng chiều.
    {
      page: 'temple', dur: 3.6, transition: 'fade', sun: (u) => lerp(9, 5, u),
      enter: () => { gCloseShop(); gameChips(USES, 0); },
      at: [0.7, 1.4, 2.1].map((at, index) => [at, () => gameChips(USES, index + 1)]),
      cam: move({ pos: [14.9, 3.5, 74.2], at: [12.1, -0.3, 69.6], fov: 45 }, { pos: [6, 17, 82], at: GARDEN_CENTER, fov: 50 }),
      caption: { cls: 'tight', title: ['Xu', 'dùng', 'cho', ['cả web', '']] },
    },
    // 8. Màn cuối.
    {
      page: 'temple', dur: 3.6, transition: 'cut', end: true, sun: (u) => lerp(5, -1, u),
      cam: move({ pos: [6, 17, 82], at: GARDEN_CENTER, fov: 50 }, { pos: [4, 19, 85], at: GARDEN_CENTER, fov: 50 }, ease.out),
      caption: null,
      enter: () => {
        gameChips(null);
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// Phước Điền (~47 giây, ~43 giây không tính màn cuối): ruộng riêng → gieo → tưới → tua 12 giờ → thu hoạch → gà → bò →
// chợ → hàng xóm → màn cuối.
// Góc máy tính theo ô / chuồng trong scene (chạy sau khi chuẩn bị). Thẻ / bảng của trang chiếm nửa dưới khung nên camera
// nhắm thấp hơn chỗ làm việc (chỗ làm việc nằm ở nửa trên).
function buildFarmFilm() {
  const one = plotAt(FARM_SLOT);
  const two = plotAt(FARM_DRY);
  const stand = farmShot.stand || { x: (one.x + two.x) / 2, z: one.aisle };
  const coop = farmSpot('coop');
  const barn = farmSpot('barn');
  const market = farmSpot('market');
  const help = farmShot.helpSlot ? plotAt(farmShot.helpSlot) : plotAt(8);
  const center = [-72, 0, 85];
  return [
    // 0. Mở đầu: bay từ trên cổng vào ruộng, gà bò dạo trong chuồng.
    {
      page: 'temple', dur: 3.4, transition: 'cut', sun: 14,
      cam: move({ pos: [-44, 20, 108], at: [-70, 0, 84], fov: 52 }, { pos: [-57, 9.5, 101], at: [-70, 0.4, 86], fov: 48 }),
      caption: { cls: 'big', title: ['Mỗi', 'người', 'một', '\n', ['nông trại riêng', 'green'], '🌾'] },
    },
    // 1. Chọn hạt dưa hấu trên thẻ ô rồi gieo: nhân vật rải hạt.
    {
      page: 'temple', dur: 4.6, transition: 'flash', sun: 14,
      at: [[0.15, fChooseSeed], [1.6, fPlant], [2.6, fClose]],
      cam: move({ pos: [one.x + 1.8, 2.5, one.z - 3.6], at: [one.x - 1.3, -0.3, one.z + 1.6], fov: 46 }, { pos: [one.x + 1.55, 2.28, one.z - 3.18], at: [one.x - 1.3, -0.3, one.z + 1.6], fov: 46 }),
      caption: { cls: 'tight', kicker: '🌱 Gieo hạt', title: ['Chọn', 'cây,', ['gieo', 'green'], 'xuống', 'ruộng'], sub: '🥬 🍅 🌽 🌾 🥕 🎃 🍉 🐉 · 9 loại cây' },
    },
    // 2. Tưới ô lúa đất khô bên cạnh.
    {
      page: 'temple', dur: 3.6, transition: 'cut', sun: 14,
      at: [[0.1, fWater], [2.4, fClose]],
      cam: move({ pos: [two.x - 0.7, 2.5, two.z - 3.8], at: [two.x + 1.9, -0.3, two.z + 1.4], fov: 46 }, { pos: [two.x - 0.49, 2.28, two.z - 3.38], at: [two.x + 1.9, -0.3, two.z + 1.4], fov: 46 }),
      caption: { cls: 'tight', kicker: '💧 Chăm cây', title: ['Đất', 'khô', 'thì', ['tưới nước', 'blue']], sub: 'Cây không chết, chỉ ngừng lớn chờ bạn' },
    },
    // 3. Tua nhanh 12 giờ: chiều → đêm → sáng, dưa hấu mầm → lớn → chín.
    {
      page: 'temple', dur: 4.2, transition: 'fade', sun: timelapseSun, night: (u) => clamp01((14 - timelapseSun(u)) / 28) * 0.8,
      enter: () => fStage('sprout'),
      at: [[1.4, () => fStage('growing')], [3.0, () => fStage('ripe')], [3.3, fRipen]],
      cam: move({ pos: [one.x - 3.4, 3.4, one.z - 4.6], at: [one.x, 0.3, one.z + 0.6], fov: 44 }, { pos: [one.x - 2.6, 3.0, one.z - 3.8], at: [one.x, 0.3, one.z + 0.6], fov: 44 }, ease.linear),
      caption: { cls: 'tight', kicker: '⏩ 12 giờ sau', title: ['Dưa', 'hấu', ['chín rộ', 'green'], '🍉'] },
    },
    // 4. Thu hoạch: nhân vật xách giỏ, dưa vào kho.
    {
      page: 'temple', dur: 3.6, transition: 'flash', sun: 14,
      at: [[0.15, fHarvest], [1.3, fClose], [1.4, () => pop('+4 🍉', { small: true, top: 33 })]],
      cam: move({ pos: [one.x + 1.4, 2.0, one.z - 3.0], at: [one.x - 0.8, 0.2, one.z + 1.6], fov: 44 }, { pos: [one.x + 1.0, 1.7, one.z - 2.5], at: [one.x - 0.8, 0.3, one.z + 1.6], fov: 43 }),
      caption: { cls: 'tight', kicker: '🧺 Thu hoạch', title: ['Thu', 'cả', ['ô dưa', 'green'], 'về', 'kho'] },
    },
    // 5. Chuồng gà: chạy ra cửa sân gà (camera trong sân nhìn ra, quầy chợ chắn phía ngoài), cho ăn; rồi nhìn vào sân gà
    // lúc nhặt trứng.
    {
      page: 'temple', dur: 2.9, transition: 'flash', sun: 14,
      enter: () => runTo(coop.stand),
      at: [[1.3, () => fPen('coop')], [1.8, fFeed]],
      cam: move({ pos: [coop.stand.x + 2.3, 2.9, coop.stand.z - 5.2], at: [coop.stand.x - 0.3, -0.4, coop.stand.z + 0.9], fov: 50 }, { pos: [coop.stand.x + 2.1, 2.8, coop.stand.z - 4.8], at: [coop.stand.x - 0.3, -0.4, coop.stand.z + 0.9], fov: 50 }),
      caption: { cls: 'tight', kicker: '🐔 Chuồng gà', title: ['Cho', 'gà', 'ăn,', ['nhặt trứng', '']], sub: 'Gà con ăn no sẽ lớn thành gà mái' },
    },
    {
      page: 'temple', dur: 2.3, transition: 'cut', sun: 14,
      at: [[0.2, () => fCollect('coop')], [1.3, fClose]],
      cam: move({ pos: [coop.stand.x + 1.3, 4.8, coop.stand.z - 2.8], at: [coop.stand.x - 0.3, -0.5, coop.stand.z - 11.3], fov: 50 }, { pos: [coop.stand.x + 1.1, 4.5, coop.stand.z - 3.4], at: [coop.stand.x - 0.3, -0.5, coop.stand.z - 11.3], fov: 49 }),
    },
    // 6. Chuồng bò: camera bám một con bò đang gặm cỏ, vắt sữa.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: 14,
      enter: fClose,
      at: [[0.6, () => fPen('barn')], [1.3, () => fCollect('barn')], [3.0, fClose]],
      cam: track({ subject: cowPose, radius: 5.6, radius2: 4.8, height: 2.4, height2: 2.1, from: 0.5, to: 0.95, look: -0.6, fov: 46 }),
      caption: { cls: 'tight', kicker: '🐄 Chuồng bò', title: ['Nuôi', 'bò', 'lấy', ['sữa', 'blue'], '🥛'], sub: 'Ổ đầy, thùng đầy thì chờ bạn — vắng không mất gì' },
    },
    // 7. Chợ ngay cổng: bán hết dưa hấu.
    {
      page: 'temple', dur: 4.0, transition: 'flash', sun: 14,
      at: [[0.1, fMarket], [0.9, fScrollSell], [1.8, fSell]],
      cam: move({ pos: [market.x + 3.8, 5.6, market.z + 9.2], at: [market.x, -4.2, market.z - 0.9], fov: 46 }, { pos: [market.x + 3.4, 5.2, market.z + 8.4], at: [market.x, -4.2, market.z - 0.9], fov: 46 }),
      caption: { cls: 'tight', kicker: '💰 Chợ Phước Điền', title: ['Bán', 'ở', 'chợ', ['lấy xu', '']], sub: 'Giá đổi mỗi ngày · hoặc dâng lên Tam Bảo 🙏' },
    },
    // 8. Hàng xóm: bảng bạn bè, bấm Thăm → ruộng bạn hiện ra.
    {
      page: 'temple', dur: 3.0, transition: 'cut', sun: 14,
      enter: () => { fClose(); setTimeout(fNeighbors, 120); },
      at: [[1.9, fVisit]],
      cam: move({ pos: [-55, 13, 104], at: [-71, -3, 84], fov: 50 }, { pos: [-57, 12, 103], at: [-71, -3, 84], fov: 50 }),
      caption: { cls: 'tight', kicker: '🏡 Hàng xóm', title: ['Ghé', 'thăm', ['ruộng bạn bè', 'pink']] },
    },
    // 9. Ruộng của bạn: tưới giúp ô khô.
    {
      page: 'temple', dur: 4.2, transition: 'flash', sun: 14,
      at: [[0.5, fHelp], [3.3, fClose]],
      cam: move({ pos: [help.x + 3.0, 6.0, help.z + 8.5], at: [help.x, -3.0, help.z - 1.0], fov: 48 }, { pos: [help.x + 2.6, 5.4, help.z + 7.6], at: [help.x, -3.0, help.z - 1.0], fov: 47 }),
      caption: { cls: 'tight', kicker: '🏡 Hàng xóm', title: ['Tưới', 'giúp,', 'nhận', ['quà', 'pink']], sub: 'Không hái trộm — chỉ giúp nhau 🤝' },
    },
    // 10. Xu dùng khắp web: camera bay lên lộ cả ruộng lúc nắng chiều.
    {
      page: 'temple', dur: 3.4, transition: 'fade', sun: (u) => lerp(9, 5, u),
      enter: () => gameChips(FARM_USES, 0),
      at: [0.6, 1.2, 1.8].map((at, index) => [at, () => gameChips(FARM_USES, index + 1)]),
      cam: move({ pos: [help.x + 2.6, 5.4, help.z + 7.6], at: [help.x, -3.0, help.z - 1.0], fov: 47 }, { pos: [-52, 19, 106], at: center, fov: 50 }),
      caption: { cls: 'tight', title: ['Xu', 'dùng', 'cho', ['cả web', '']] },
    },
    // 11. Màn cuối.
    {
      page: 'temple', dur: 3.6, transition: 'cut', end: true, sun: (u) => lerp(5, -1, u),
      cam: move({ pos: [-52, 19, 106], at: center, fov: 50 }, { pos: [-50, 21, 109], at: center, fov: 50 }, ease.out),
      caption: null,
      enter: () => {
        gameChips(null);
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
    },
  ];
}

// Bấm Giờ (~28 giây): mở thẻ → lượt 1 suýt trúng → lượt 2 trúng, mở cấp 2 → cấp 2 đồng hồ tắt trước mục tiêu → Bảng vàng
// → màn cuối. Độ dài hai lượt đầu theo đề đã bốc sẵn; cảnh nhìn từ sân vào chánh điện (tượng Phật phía trên thẻ).
function buildStopwatchFilm() {
  const [first = 300, second = 260] = swShot.targets;
  const one = first / 100;
  const two = second / 100;
  // Sau lưng nhân vật, nhìn thẳng vào cửa chánh điện: tượng Phật nằm giữa chữ và thẻ Bấm Giờ.
  const behind = (dx, y, z) => ({ pos: [dx, y, z], at: [0, 0.9, 25], fov: 44 });
  return [
    // 0. Mở đầu: bay từ sân vào trước chánh điện.
    {
      page: 'temple', dur: 3.0, transition: 'cut', sun: 22,
      cam: move({ pos: [7, 10, 56], at: [0, 4, 20], fov: 52 }, { pos: [1.8, 3.4, 45], at: [0, 1.2, 25], fov: 46 }),
      caption: { cls: 'big', title: ['Bấm', 'dừng', 'đúng', '\n', ['1/100 giây', 'green'], '⏱'] },
    },
    // 1. Mở thẻ Bấm Giờ: mục tiêu ngẫu nhiên.
    {
      page: 'temple', dur: 2.0, transition: 'flash', sun: 22,
      // Nút ⏱ nằm trên thanh phòng (đang ẩn khi quay): bấm thẳng, không vẽ vòng chạm.
      enter: () => swDoc().querySelector('.sw-chip')?.click(),
      cam: move(behind(1.6, 3.0, 43.5), behind(1.4, 2.9, 42.8)),
      caption: { cls: 'tight', kicker: '⏱ Bấm Giờ', title: ['Mục', 'tiêu', ['ngẫu nhiên', '']], sub: 'Từ 00:01 tới 10:00 · bấm Bắt đầu rồi Dừng' },
    },
    // 2. Lượt 1: dừng trễ 0,02 giây.
    {
      page: 'temple', dur: 0.3 + one + 2.1, transition: 'cut', sun: 22,
      enter: () => setTimeout(swStart, 300),
      at: [
        [0.6, () => swStopAt(2)],
        [0.5 + one, () => caption({ cls: 'tight', kicker: '⏱ Cấp 1 · Tập sự', title: ['Suýt!', 'Lệch', ['0,02 giây', 'pink'], '😮'] })],
      ],
      cam: move(behind(1.4, 2.9, 42.8), behind(1.1, 2.8, 41.8), ease.linear),
      caption: { cls: 'tight', kicker: '⏱ Cấp 1 · Tập sự', title: ['Bấm', ['Dừng', ''], 'đúng', 'lúc', 'chạm', 'mục', 'tiêu'] },
    },
    // 3. Lượt 2: lượt mới (đề đã tải sẵn), dừng đúng mục tiêu → Trúng, mở cấp 2.
    {
      page: 'temple', dur: 0.9 + two + 2.7, transition: 'cut', sun: 22,
      enter: () => setTimeout(swPress, 150),
      at: [
        [0.9, swStart],
        [1.2, () => swStopAt(0)],
        [1.05 + two, () => {
          pop('🎯 TRÚNG!');
          flash(true);
          caption({ cls: 'tight', kicker: '⏱ Cấp 1 · Tập sự', title: ['Trúng!', 'Lệch', ['0,00 giây', 'green']], sub: 'Trúng là mở cấp kế 🔓' });
        }],
      ],
      cam: move(behind(-1.2, 2.9, 42.8), behind(-0.9, 2.8, 41.8), ease.linear),
      caption: { cls: 'tight', kicker: '⏱ Cấp 1 · Tập sự', title: ['Thử', 'lại', 'lần', 'nữa…'] },
    },
    // 4. Cấp 2: đồng hồ tắt 0,5 giây trước mục tiêu (đếm thầm), dừng trễ 0,03 giây.
    {
      page: 'temple', dur: 6.2, transition: 'flash', sun: 22,
      enter: () => swClick('.sw-level:nth-child(2)'),
      at: [[1.3, swStart], [1.6, () => swStopAt(3)]],
      cam: move(behind(1.3, 2.8, 42.2), behind(1.0, 2.7, 41.2), ease.linear),
      caption: { cls: 'tight', kicker: '🌘 Cấp 2 · Tỉnh thức', title: ['Đồng', 'hồ', ['tắt', 'blue'], 'trước', 'mục', 'tiêu'], sub: 'Đếm thầm 🤫 · 5 cấp, cấp sau khó hơn' },
    },
    // 5. Lịch sử + Bảng vàng.
    {
      page: 'temple', dur: 3.2, transition: 'flash', sun: 22,
      enter: () => swClick('.sw-tab'),
      cam: move(behind(0.4, 3.4, 44.5), behind(0.2, 3.8, 46), ease.out),
      caption: { cls: 'tight', kicker: '📜 Lịch sử', title: ['Lên', ['Bảng vàng', ''], '🏆'], sub: 'Lưu mọi lần bấm trúng · chơi miễn phí' },
    },
    // 6. Màn cuối.
    {
      page: 'temple', dur: 3.6, transition: 'cut', end: true, sun: (u) => lerp(22, 8, u),
      enter: () => {
        swClick('.sw-close');
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
      cam: move(behind(0.2, 3.8, 46), { pos: [0, 9, 52], at: [0, 3, 20], fov: 50 }, ease.out),
      caption: null,
    },
  ];
}

// Trò hai người (~39 giây): hai bạn nắm tay trước chánh điện → thẻ người chơi → Oẳn tù tì → Đo độ hiểu ý (trả lời 10
// câu, kết quả phần trăm) → Đoán ý bạn (mình trả lời, bạn đoán) → màn cuối. Camera trước mặt hai người, chánh điện phía
// sau; bảng trò chiếm nửa dưới.
function buildHieuYFilm() {
  // Hai người đứng ở phần trên khung (đầu dưới chữ, chân khuất sau mép bảng trò).
  const face = (from, to, radius = 6.4, height = 2.4) => track({ subject: duoPose, relative: true, radius, radius2: radius - 0.4, height, height2: height - 0.1, from, to, look: 0.05, fov: 46, smooth: 5 });
  return [
    // 0. Mở đầu: bay từ sân tới hai người đang nắm tay.
    {
      page: 'temple', dur: 3.2, transition: 'cut', sun: 22,
      cam: move({ pos: [6, 11, 60], at: [0, 2, 34], fov: 52 }, { pos: [1.4, 2.6, 41.2], at: [0, 0.6, 35.8], fov: 46 }),
      caption: { cls: 'big', title: ['Hiểu', 'ý', 'nhau', '\n', ['bao nhiêu %?', 'pink'], '💞'] },
    },
    // 1. Chạm vào bạn: thẻ người chơi với các trò hai người.
    {
      page: 'temple', dur: 2.8, transition: 'flash', sun: 22,
      enter: duoCard,
      cam: face(-0.35, -0.2),
      caption: { cls: 'tight', kicker: '👆 Chạm vào một người', title: ['Mời', 'chơi', ['trò hai người', '']], sub: '⚔️ Oẳn tù tì · 🧠 Hiểu ý · 🎯 Cùng lựa chọn · 🔮 Đoán ý' },
    },
    // 2. Oẳn tù tì: khiêu chiến, bạn nhận lời, ra Búa, hai tay lật cùng lúc.
    {
      page: 'temple', dur: 7.0, transition: 'cut', sun: 22,
      at: [[0.2, () => duoInvite(/Khiêu chiến/)], [0.8, duoPickRock]],
      cam: face(-0.2, 0.15),
      caption: { cls: 'tight', kicker: '⚔️ Khiêu chiến', title: ['Oẳn', 'tù', 'tì,', ['ra cái gì?', 'pink']], sub: '✊ Búa · ✋ Bao · ✌️ Kéo — ai thắng 2 lượt trước' },
    },
    // 3. Đo độ hiểu ý: 10 câu kín đáp án, trả lời liền tay.
    {
      page: 'temple', dur: 6.6, transition: 'flash', sun: 22,
      enter: duoClosePanel,
      at: [[0.3, () => duoInvite(/Đo độ hiểu ý/)], [0.9, () => duoAnswerAll()]],
      cam: face(0.3, 0.1),
      caption: { cls: 'tight', kicker: '🧠 Đo độ hiểu ý', title: ['10', 'câu', 'hỏi,', ['giữ kín', 'blue'], 'đáp', 'án'], sub: 'Theo bạn, bạn ấy sẽ chọn gì?' },
    },
    {
      page: 'temple', dur: 3.8, transition: 'cut', sun: 22,
      at: [[0.1, () => duoResultCaption('🧠 Đo độ hiểu ý', ['Hiểu', 'ý', 'nhau'])]],
      cam: face(0.1, -0.05, 6.0),
      caption: { cls: 'tight', kicker: '🧠 Đo độ hiểu ý', title: ['Kết', 'quả…'] },
    },
    // 4. Đoán ý bạn: mình trả lời trước, bạn đoán lựa chọn của mình.
    {
      page: 'temple', dur: 6.2, transition: 'flash', sun: 22,
      enter: duoClosePanel,
      at: [[0.3, () => duoInvite(/Đoán ý bạn/)], [0.9, () => duoAnswerAll()]],
      cam: face(-0.3, -0.12),
      caption: { cls: 'tight', kicker: '🔮 Đoán ý bạn', title: ['Mình', 'chọn', 'trước,', '\n', 'bạn', ['đoán ý', 'pink'], 'mình'] },
    },
    {
      page: 'temple', dur: 6.0, transition: 'cut', sun: 22,
      at: [[0.1, () => duoResultCaption('🔮 Đoán ý bạn', ['Đoán', 'đúng'])]],
      cam: face(-0.12, 0.05, 6.0),
      caption: { cls: 'tight', kicker: '🔮 Đoán ý bạn', title: ['Bạn', 'ấy', 'đang', 'đoán…', '🤔'] },
    },
    // 5. Màn cuối.
    {
      page: 'temple', dur: 3.6, transition: 'cut', end: true, sun: (u) => lerp(22, 8, u),
      enter: () => {
        duoClosePanel();
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
      cam: move({ pos: [1.4, 2.6, 41.2], at: [0, 0.6, 35.8], fov: 46 }, { pos: [0, 9, 52], at: [0, 3, 20], fov: 50 }, ease.out),
      caption: null,
    },
  ];
}

// Trí tuệ (~40 giây): Tàng Kinh Các → Bảng vàng → Đề hôm nay → Đố hình (tô đáp án) → Đố số → Màu mực → Test IQ (làm
// đủ 30 câu, chỉ số thật) → ảnh kết quả → Đố vui cả phòng → màn cuối. Khu Trí tuệ chiếm nửa dưới khung, mái Tàng Kinh Các
// phía trên sau hàng chữ.
function buildBrainFilm() {
  const library = [41.5, 0, 22.6];
  // Mái Tàng Kinh Các ở phần trên khung (sau hàng chữ), ngăn Trí tuệ che phần dưới.
  const roof = (from, to, radius = 15) => orbit({ center: library, radius, radius2: radius - 1.2, height: 2.0, height2: 2.2, from, to, look: 1.2, fov: 50, curve: ease.linear });
  return [
    // 0. Mở đầu: bay tới Tàng Kinh Các, mình ngồi bàn đá trước sân.
    {
      page: 'temple', dur: 3.0, transition: 'cut', sun: 20,
      cam: move({ pos: [35, 14, 64], at: [41.5, 3.5, 24], fov: 54 }, { pos: [38.2, 3.4, 44], at: [40.6, 3.2, 23], fov: 48 }),
      caption: { cls: 'big', title: ['Luyện', 'não', '\n', ['trong chùa', 'green'], '🧠'] },
    },
    // 1. Bàn đá trước sân: mình ngồi ghế đá, Tàng Kinh Các phía sau.
    {
      page: 'temple', dur: 2.6, transition: 'flash', sun: 20,
      cam: move({ pos: [33.2, 1.9, 38.4], at: [37.6, 1.6, 31.4], fov: 48 }, { pos: [33.9, 1.8, 37.4], at: [37.6, 1.7, 31.2], fov: 48 }, ease.out),
      caption: { cls: 'tight', kicker: '📚 Tàng Kinh Các', title: ['Ngồi', 'bàn', 'đá,', ['giải đố', ''], 'cùng', 'nhau'], sub: 'Bảng vàng · Đố vui · Đấu trí 1–1' },
    },
    // 2. Mở 🧠 Trí tuệ: 5 trò mỗi ngày.
    {
      page: 'temple', dur: 1.8, transition: 'flash', sun: 20,
      enter: () => brainOpen('daily'),
      cam: roof(-0.5, -0.42),
      caption: { cls: 'tight', kicker: '🧠 Đề hôm nay', title: ['5', 'trò', 'luyện', ['trí não', 'blue']], sub: '80% câu khó · ai cũng cùng một đề' },
    },
    // 3. Đố hình: câu ma trận khó nhất, 3 giây suy nghĩ rồi tô đáp án. Xin vào ván Đố vui ở đây (ván bắt đầu ~20 giây sau,
    // đúng lúc cảnh Đố vui).
    {
      page: 'temple', dur: 5.6, transition: 'cut', sun: 20,
      enter: () => brainPlay('matrix'),
      at: [
        [3.4, () => {
          brainReveal('matrix', 0, { press: false });
          caption({ cls: 'tight', kicker: '🪷 Đố hình', title: ['Đáp', 'án', 'đây!', ['✅', 'green']], sub: 'Bạn chọn đúng không? 👇' });
        }],
        [3.8, () => brainUI()?.joinQuiz()],
        [4.9, () => brainReveal('matrix', 0)],
      ],
      cam: roof(-0.42, -0.3),
      caption: { cls: 'tight', kicker: '🪷 Đố hình', title: ['Bạn', 'chọn', ['ô nào?', 'pink'], '🤔'], sub: '⏳ 3 giây suy nghĩ…' },
    },
    // 4. Đố số: dãy số khó, tô đáp án.
    {
      page: 'temple', dur: 4.4, transition: 'flash', sun: 20,
      enter: () => brainPlay('series'),
      at: [
        [2.6, () => {
          brainReveal('series', 0, { press: false });
          caption({ cls: 'tight', kicker: '🔢 Đố số', title: ['Là', 'số', 'này', ['✅', 'green']], sub: 'Dãy số, bảng số · ~25 kiểu luật' });
        }],
        [3.8, () => brainReveal('series', 0)],
      ],
      cam: roof(-0.3, -0.2),
      caption: { cls: 'tight', kicker: '🔢 Đố số', title: ['Số', 'tiếp', 'theo', ['là gì?', 'pink']] },
    },
    // 5. Màu mực: chạm liền tay, có câu đổi luật.
    {
      page: 'temple', dur: 3.8, transition: 'flash', sun: 20,
      enter: () => brainPlay('stroop'),
      at: [[0.9, () => brainStroop(6)]],
      cam: roof(-0.2, -0.1),
      caption: { cls: 'tight', kicker: '🎨 Màu mực', title: ['Màu', 'mực', 'hay', ['chữ?', 'pink'], '🎨'], sub: 'Luật đổi bất ngờ: 🖌 màu mực / 🔤 chữ ghi' },
    },
    // 6. Test IQ vui: 30 câu (tua nhanh), nộp thật → chỉ số.
    {
      page: 'temple', dur: 7.4, transition: 'flash', sun: 20,
      enter: () => {
        brainOpen('iq');
        setTimeout(() => tap(brainDoc().querySelector('.brain-sheet .brain-start'), 120), 250);
      },
      at: [
        [1.8, () => {
          brainIqRun();
          caption({ cls: 'tight', kicker: '🧩 Test IQ vui', title: ['⏩', 'Làm', 'đủ', ['30 câu', 'blue']], sub: '6 dạng: ma trận · xoay · tương quan · cân hình' });
        }],
        [2.0, brainIqCaption],
      ],
      cam: roof(-0.1, 0.05),
      caption: { cls: 'tight', kicker: '🧩 Test IQ vui', title: ['Test', ['IQ vui', 'green'], '🧩'], sub: '30 câu · 20 phút · 80% câu khó' },
    },
    // 7. Ảnh kết quả 9:16 để khoe.
    {
      page: 'temple', dur: 3.0, transition: 'cut', sun: 20,
      enter: () => tap(brainDoc().querySelector('.brain-sheet .brain-actions .brain-share'), 160),
      cam: roof(0.05, 0.12),
      caption: { cls: 'tight', kicker: '📸 Ảnh kết quả', title: ['Khoe', 'ngay', ['lên TikTok', 'pink']] },
    },
    // 8. Đố vui cả phòng: ván đang chạy, ai sai là bị loại.
    {
      page: 'temple', dur: 5.0, transition: 'flash', sun: 20,
      enter: () => brainOpen('quiz'),
      cam: roof(0.12, 0.25),
      caption: { cls: 'tight', kicker: '🎯 Đố vui cả phòng', title: ['Sai', 'là', ['bị loại!', 'pink'], '😱'], sub: 'Ai trụ tới câu cuối thì thắng · có 🧩 Đấu trí 1–1' },
    },
    // 9. Màn cuối.
    {
      page: 'temple', dur: 3.6, transition: 'cut', end: true, sun: (u) => lerp(20, 8, u),
      enter: () => {
        brainUI()?.close();
        $('brand').classList.add('hidden');
        $('endcard').hidden = false;
      },
      cam: move({ pos: [39.6, 3.2, 42], at: [40.4, 3.0, 23], fov: 48 }, { pos: [41.5, 9, 52], at: [41.5, 3.5, 22], fov: 50 }, ease.out),
      caption: null,
    },
  ];
}

// Việc làm trước một cảnh (giây trước lúc cảnh bắt đầu): vào bàn Tiến Lên để kịp chia bài, mua vé Lô Tô ở pha mua vé,
// vào trận Oẳn Tù Tì để lúc quay đang tới lượt ra tay. Chỉ khi đã đăng nhập (khách không chơi được).
const PREP = [
  { page: 'tienlen', lead: 24, run: joinTienLen },
  { page: 'loto', lead: 60, run: buyLoto },
  { page: 'rps', lead: 5, run: findRps },
];

// Rạp: chọn 5 người đang ngồi (không phải mình) để nói câu theo kịch bản.
function pickCinemaCast() {
  const c = cinema().c;
  const canvas = cinema().doc.getElementById('scene3d');
  const middle = (person) => {
    const point = c.seatPoint(person.seatId);
    return point ? Math.abs(point.x / canvas.clientWidth - 0.5) + Math.abs(point.y / canvas.clientHeight - 0.66) * 0.5 : 9;
  };
  return c.debugParticipants().filter((person) => person.seatId && !person.me)
    .map((person) => ({ ...person, score: middle(person) + Math.random() * 0.08 }))
    .sort((a, b) => a.score - b.score);
}
const cinemaSay = (index, text) => {
  const person = cinemaCast[index % Math.max(1, cinemaCast.length)];
  if (person) cinema().c.say(person.id, text);
};
function cinemaReact(kind, count) {
  cinemaCast.slice(0, 12).sort(() => Math.random() - 0.5).slice(0, count).forEach((person, index) => {
    setTimeout(() => cinema().c.react(person.id, kind), index * 90);
  });
}
function betBauCua(index) {
  const page = pages.get('baucua');
  click(page, '#chips [data-chip="10"]');
  const tiles = page.doc.querySelectorAll('#board .tile');
  tiles[index]?.click();
}

// ---- Chuẩn bị + chạy ----
function setCheck(id, label, status) {
  let item = document.querySelector(`#checks [data-id="${id}"]`);
  if (!item) {
    item = Object.assign(document.createElement('li'), { textContent: label });
    item.dataset.id = id;
    $('checks').append(item);
  }
  item.textContent = label;
  item.className = status;
}
const status = (text) => { $('status').textContent = text; };

async function prepare() {
  if (state.preparing) return state.preparing;
  state.preparing = (async () => {
    $('prepare').disabled = true;
    status('Đang tải các cảnh…');
    try {
      Object.entries({ 'thien-view': '3d', 'debug-explore': '1', 'debug-cinema': '1', 'debug-race': '1', 'thien-lang': 'vi', 'tienlen-stake': '20' }).forEach(([key, value]) => localStorage.setItem(key, value));
      if (!keepSound()) localStorage.setItem('race-mute', '1');
      // Clip trò hai người: tắt bot tự rủ chơi (lời mời đến làm mình bận, không gửi được khiêu chiến của kịch bản).
      if (chosenFilm() === 'hieu-y') localStorage.setItem('bot-quiet', '1');
    } catch {}
    const me = await fetch('/api/v1/me', { credentials: 'same-origin' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    state.signedIn = Boolean(me?.account || me?.id);
    if (!state.signedIn) {
      try { localStorage.setItem('displayName', NAME); localStorage.setItem('phapdanh', NAME); } catch {}
    }
    setCheck('account', state.signedIn ? `Đăng nhập: ${me.account?.displayName || me.displayName}` : 'Khách (đăng nhập tài khoản có xu để quay cảnh đang đánh bài)', state.signedIn ? 'ok' : 'warn');
    const kind = chosenFilm();
    const jobs = kind === 'dua-xe' ? [['race', '/dua-xe.html', prepareRace, 'Đua xe']] : [
      ['temple', `/chanh-dien.html?state=${chosenState()}&sun=16`, prepareTemple, { garden: 'Chánh điện 3D · Vườn Công Đức', farm: 'Chánh điện 3D · Phước Điền', stopwatch: 'Chánh điện 3D · Bấm Giờ', 'hieu-y': 'Chánh điện 3D · Trò hai người', 'chanh-dien': 'Chánh điện 3D · người ngồi thiền', canh: 'Chánh điện 3D · phong cảnh các bang', 'tri-tue': 'Chánh điện 3D · Tàng Kinh Các + Trí tuệ' }[kind] || 'Chánh điện 3D'],
      // Clip vườn / nông trại chỉ quay ở chánh điện.
      ...(kind !== 'tour' ? [] : [
        ['cinema', `/room.html?room=${CINEMA_ROOM}`, prepareCinema, 'Rạp phim'],
        ['tienlen', '/tien-len.html', prepareGame, 'Tiến Lên'],
        ['baucua', '/game.html', prepareGame, 'Bầu Cua'],
        ['loto', '/loto.html', prepareGame, 'Lô Tô'],
        ['rps', '/oan-tu-ti.html', prepareGame, 'Oẳn Tù Tì'],
      ]),
    ];
    // Chánh điện tải trước (nặng nhất); các trang còn lại tải song song.
    const results = await Promise.all(jobs.map(async ([name, src, run, label], index) => {
      if (index > 0) await sleep(1_500);
      setCheck(name, label, 'wait');
      try {
        await run(addPage(name, src));
        setCheck(name, label, 'ok');
        return true;
      } catch (error) {
        setCheck(name, `${label}: ${error.message}`, 'warn');
        return false;
      }
    }));
    if (!results[0]) throw new Error(`${jobs[0][3]} chưa sẵn sàng`);
    // Kịch bản dựng sau khi chuẩn bị xong (góc máy clip vườn tính theo luống vừa chọn).
    film = { garden: buildGardenFilm, farm: buildFarmFilm, stopwatch: buildStopwatchFilm, 'hieu-y': buildHieuYFilm, 'chanh-dien': buildHallFilm, canh: buildSceneryFilm, 'tri-tue': buildBrainFilm, 'dua-xe': buildRaceFilm }[kind]?.() || buildFilm();
    // Khoảng trắng trong từng mục không ngắt dòng (chỉ xuống dòng ở dấu ·).
    const tags = {
      garden: ['🌱 Trồng cây', '🧺 Thu hoạch', '💰 Bán lấy xu', '🐾 Linh thú', '🎬 Rạp phim'],
      farm: ['🌾 Nông trại riêng', '🐔 Nuôi gà, bò', '💰 Bán lấy xu', '🏡 Hàng xóm', '🎬 Rạp phim'],
      stopwatch: SW_BOARD_TAGS,
      'hieu-y': ['⚔️ Oẳn tù tì', '🧠 Hiểu ý', '🔮 Đoán ý', '🌾 Nông trại', '🎬 Rạp phim'],
      'chanh-dien': ['🪷 Ngồi thiền', '🙏 Dâng lễ', '🏮 Vườn Đèn', '🌾 Nông trại', '🎬 Rạp phim'],
      canh: ['🌸 Vườn Hoa', '🌲 Rừng thiền', '🎠 Khu vui chơi', '🌾 Nông trại', '🎬 Rạp phim'],
      'tri-tue': ['🧠 Đề hôm nay', '🧩 Test IQ vui', '🎯 Đố vui', '🌾 Nông trại', '🎬 Rạp phim'],
      'dua-xe': ['🏎️ Đua xe', '🏆 Bảng vàng', '🌾 Nông trại', '🎬 Rạp phim', '🎲 Game'],
    }[kind] || ['🐐 Nông trại', '🐾 Thú cưng', '🎬 Rạp phim', '🎲 Game', '💬 Bạn bè'];
    $('endTags').textContent = tags.map((tag) => tag.replaceAll(' ', '\u00a0')).join(' · ');
    for (const warning of state.warnings) status(warning);
    // Đứng yên ở góc đầu tiên trong lúc chờ bấm Bắt đầu.
    show(jobs[0][0], 'cut');
    applyShot(film[0], 0);
    for (const name of ['cinema', 'tienlen', 'baucua', 'loto', 'rps']) pages.get(name)?.frame.classList.remove('live');
    $('cover').hidden = true;
    $('start').disabled = false;
    state.prepared = true;
    if (!state.warnings.length) status('Sẵn sàng. Bấm Bắt đầu rồi quay màn hình khung 9:16.');
  })().catch((error) => {
    status(error.message);
    $('prepare').disabled = false;
    state.preparing = null;
    throw error;
  });
  return state.preparing;
}

let film = buildFilm();
let current = null;
let shotStart = 0;

function applyShot(shot, u, now = performance.now()) {
  // Lớp tối chỉ của video (đoạn tua ngày → đêm): đêm trong sân vẫn sáng ở gần đèn khu vườn, lớp này cho đêm đọc rõ.
  $('night').style.opacity = shot.night ? shot.night(clamp01(u)).toFixed(3) : '0';
  if (shot.page === 'race') {
    // Không có cam: để camera bám xe của trang đua.
    const view = shot.cam?.(u, now) || null;
    raceApi()?.view.debugView(view?.pos || null, view?.at, view?.fov);
    return;
  }
  if (shot.page !== 'temple') return;
  const renderer = temple()?.r;
  if (!renderer) return;
  const sun = typeof shot.sun === 'function' ? shot.sun(u) : shot.sun;
  if (Number.isFinite(sun)) renderer.setDaylight(sun);
  const view = shot.cam?.(u, now);
  if (view) renderer.debugView(view.pos, view.at, view.fov);
}

function frameLoop(now) {
  if (!state.running) return;
  if (current) applyShot(current, (now - shotStart) / (current.dur * 1_000), now);
  requestAnimationFrame(frameLoop);
}

// Mở trước cảnh sắp tới: chánh điện tạm dừng vẽ khi không chiếu (đỡ tốn GPU), bật lại sớm để khung đầu đã đúng góc.
function preroll(shot) {
  if (!shot) return;
  const renderer = temple()?.r;
  if (shot.page === 'temple') renderer?.setPaused(false);
}

async function start() {
  if (!state.prepared) await prepare();
  if (state.running) return state.done;
  state.running = true;
  $('start').disabled = true;
  status('Đang chạy…');
  document.activeElement?.blur?.();
  let resolveDone;
  state.done = new Promise((resolve) => { resolveDone = resolve; });
  requestAnimationFrame(frameLoop);
  const begin = performance.now();
  let cursor = begin;
  for (const { page, lead, run } of state.signedIn ? PREP.filter((item) => pages.has(item.page)) : []) {
    const at = film.slice(0, film.findIndex((shot) => shot.page === page)).reduce((sum, shot) => sum + shot.dur, 0) - lead;
    setTimeout(() => run(begin + (at + lead) * 1_000).catch(() => {}), Math.max(0, at * 1_000));
  }
  for (const [index, shot] of film.entries()) {
    current = shot;
    shotStart = performance.now();
    if (shot.page === 'temple') temple().r.setPaused(false);
    shot.enter?.();
    applyShot(shot, 0, shotStart);
    show(shot.page, shot.transition);
    if (shot.caption !== undefined) caption(shot.caption);
    for (const [at, run] of shot.at || []) setTimeout(run, at * 1_000);
    const next = film[index + 1];
    if (next) setTimeout(() => preroll(next), Math.max(0, shot.dur * 1_000 - 700));
    cursor += shot.dur * 1_000;
    await sleep(Math.max(0, cursor - performance.now()));
    // Rời chánh điện: tạm dừng vẽ nền 3D.
    if (next && next.page !== 'temple' && shot.page === 'temple') setTimeout(() => temple().r.setPaused(true), 700);
  }
  state.running = false;
  // Không để tài khoản ngồi lại bàn Tiến Lên (hệ thống sẽ đánh hộ rồi mời ra): rời bàn / rời sau ván.
  click(pages.get('tienlen'), '#leave');
  status('Xong. Bấm Chuẩn bị lại (tải lại trang) để quay lần nữa.');
  resolveDone(true);
  return state.done;
}

// Tiến Lên: vào bàn mức 20 xu; bị mời ra (vd. còn ngồi bàn cũ từ lần quay trước, bỏ lượt lâu) thì vào lại, tới lúc quay.
async function joinTienLen(until) {
  const page = pages.get('tienlen');
  if (!page?.doc) return;
  while (performance.now() < until) {
    if (!page.doc.getElementById('lobbyView')?.hidden) {
      click(page, '#stakes button:first-child');
      click(page, '#quick');
    }
    await sleep(1_500);
  }
}

// Lô Tô: mua 1 vé (bật tự đánh dấu để vé sáng số) ngay khi tới pha mua vé.
async function buyLoto() {
  const page = pages.get('loto');
  if (!page?.doc) return;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (page.doc.querySelector('#tickets .ticket')) return;
    if (!page.doc.getElementById('buyPanel')?.hidden) {
      const auto = page.doc.getElementById('autoMark');
      if (auto && !auto.checked) auto.click();
      click(page, '#buyOne');
    }
    await sleep(1_200);
  }
}

// Oẳn Tù Tì: vào thẳng một bàn đang chờ đối thủ (bot hay mở sẵn) để lúc quay đang tới lượt ra tay; không có bàn nào thì
// Tìm trận ở mức 20 xu.
async function findRps() {
  const page = pages.get('rps');
  if (!page?.doc) return;
  for (let attempt = 0; attempt < 4 && page.doc.getElementById('arena')?.hidden; attempt += 1) {
    const waiting = page.doc.querySelector('#tables button[data-table]:not(:disabled)');
    if (waiting) waiting.click();
    else {
      [...page.doc.querySelectorAll('#stakes button')].find((button) => /^20\b/.test(button.textContent.trim()))?.click();
      click(page, '#find');
    }
    await sleep(1_200);
  }
}

// ---- Bảng điều khiển ----
$('endUrl').textContent = PARAMS.get('url') || SITE;
$('urlInput').value = PARAMS.get('url') || SITE;
$('urlInput').addEventListener('input', () => { $('endUrl').textContent = $('urlInput').value.trim() || SITE; });
$('endTags').textContent = '🐐 Nông trại · 🐾 Thú cưng · 🎬 Rạp phim · 🎲 Game · 💬 Bạn bè';
if (/^[a-z]{2}$/.test(PARAMS.get('state') || '')) $('stateSelect').value = PARAMS.get('state');
if (FILMS.includes(PARAMS.get('film'))) $('filmSelect').value = PARAMS.get('film');
$('prepare').addEventListener('click', () => { prepare().catch(() => {}); });
$('start').addEventListener('click', () => { start(); });
if (RECORD) {
  document.body.classList.add('record');
  $('cover').hidden = true;
}

// Script quay (scripts/promo-video.mjs) điều khiển qua window.promo.
window.promo = {
  prepare, start, state, pages,
  get film() { return film; },
  // Chỉ để duyệt góc máy clip vườn: đổi giai đoạn cây của mình, cho nhân vật làm động tác.
  garden: { stage: (stage) => gStage(stage), act: (kind) => gAct(kind), plot: () => garden.plot },
  // Chỉ để duyệt góc máy clip nông trại: đổi giai đoạn ô 1 (seed | sprout | growing | ripe | empty | null).
  farm: { stage: (stage) => fStage(stage), shot: farmShot },
  stopwatch: swShot,
  duo: duoShot,
  // Giây bắt đầu màn cuối (script quay cắt thêm bản không có màn cuối để ghép với clip khác).
  get endAt() {
    const index = film.findIndex((shot) => shot.end);
    return index < 0 ? null : film.slice(0, index).reduce((sum, shot) => sum + shot.dur, 0);
  },
  // Nhảy tới một cảnh để duyệt góc máy (không chạy kịch bản): promo.preview(chỉ số cảnh, u 0–1).
  preview(index, u = 0.5) {
    const shot = film[index];
    if (!shot) return false;
    if (shot.page === 'temple') temple().r.setPaused(false);
    show(shot.page, 'cut');
    if (shot.caption) caption(shot.caption);
    applyShot(shot, u);
    return true;
  },
};
