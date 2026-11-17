// Video giới thiệu 9:16 (TikTok / Reels / Shorts), xem promo.html.
// Trang này là "đạo diễn": mở các trang thật cùng origin trong iframe (chánh điện 3D, rạp phim, phòng game), chờ chúng sẵn
// sàng rồi chạy kịch bản ~58 giây: bay camera trong sân chùa (renderer3d.debugCinematic / debugView), đổi góc rạp phim,
// bấm vài nút ở phòng game, chồng chữ và chuyển cảnh. Bong bóng chat, thả tim, thú làm trò mà kịch bản gọi chỉ hiện trên
// máy đang quay (renderer.say / react / petInteraction), không gửi lên server. Người dùng quay màn hình khung 9:16, hoặc
// chạy scripts/promo-video.mjs để Chrome chạy ngầm tự quay ra MP4 (?record=1: khung phủ kín cửa sổ, window.promo điều khiển).
// ?film=garden: clip ~33 giây chỉ ở Vườn Công Đức (chọn hạt, gieo, tưới, cây lớn, hái, đem ra quầy bán lấy xu).
// ?film=farm: clip ~47 giây ở Phước Điền (gieo, tưới, thu hoạch, gà, bò, chợ, thăm hàng xóm).
// ?film=stopwatch: clip ~28 giây trò Bấm Giờ (suýt trúng, trúng đúng 1/100 giây, cấp 2 đồng hồ tắt, Bảng vàng).
import { thienThemeOf, US_STATES } from '/shared/room-rules.mjs';

const PARAMS = new URLSearchParams(location.search);
const RECORD = PARAMS.has('record');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NAME = 'Minh An';
const CINEMA_ROOM = 'cinema-vn';

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
const FILMS = ['tour', 'garden', 'farm', 'stopwatch'];
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
      Object.entries({ 'thien-view': '3d', 'debug-explore': '1', 'debug-cinema': '1', 'thien-lang': 'vi', 'tienlen-stake': '20' }).forEach(([key, value]) => localStorage.setItem(key, value));
    } catch {}
    const me = await fetch('/api/v1/me', { credentials: 'same-origin' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    state.signedIn = Boolean(me?.account || me?.id);
    if (!state.signedIn) {
      try { localStorage.setItem('displayName', NAME); localStorage.setItem('phapdanh', NAME); } catch {}
    }
    setCheck('account', state.signedIn ? `Đăng nhập: ${me.account?.displayName || me.displayName}` : 'Khách (đăng nhập tài khoản có xu để quay cảnh đang đánh bài)', state.signedIn ? 'ok' : 'warn');
    const kind = chosenFilm();
    const jobs = [
      ['temple', `/chanh-dien.html?state=${chosenState()}&sun=16`, prepareTemple, { garden: 'Chánh điện 3D · Vườn Công Đức', farm: 'Chánh điện 3D · Phước Điền', stopwatch: 'Chánh điện 3D · Bấm Giờ' }[kind] || 'Chánh điện 3D'],
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
    if (!results[0]) throw new Error('Chánh điện 3D chưa sẵn sàng');
    // Kịch bản dựng sau khi chuẩn bị xong (góc máy clip vườn tính theo luống vừa chọn).
    film = { garden: buildGardenFilm, farm: buildFarmFilm, stopwatch: buildStopwatchFilm }[kind]?.() || buildFilm();
    // Khoảng trắng trong từng mục không ngắt dòng (chỉ xuống dòng ở dấu ·).
    const tags = {
      garden: ['🌱 Trồng cây', '🧺 Thu hoạch', '💰 Bán lấy xu', '🐾 Linh thú', '🎬 Rạp phim'],
      farm: ['🌾 Nông trại riêng', '🐔 Nuôi gà, bò', '💰 Bán lấy xu', '🏡 Hàng xóm', '🎬 Rạp phim'],
      stopwatch: SW_BOARD_TAGS,
    }[kind] || ['🐐 Nông trại', '🐾 Thú cưng', '🎬 Rạp phim', '🎲 Game', '💬 Bạn bè'];
    $('endTags').textContent = tags.map((tag) => tag.replaceAll(' ', '\u00a0')).join(' · ');
    for (const warning of state.warnings) status(warning);
    // Đứng yên ở góc đầu tiên trong lúc chờ bấm Bắt đầu.
    show('temple', 'cut');
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
$('endUrl').textContent = PARAMS.get('url') || location.host;
$('urlInput').value = PARAMS.get('url') || location.host;
$('urlInput').addEventListener('input', () => { $('endUrl').textContent = $('urlInput').value.trim() || location.host; });
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
