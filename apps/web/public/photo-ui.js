// App 📷 Máy ảnh và 🖼️ Album trong điện thoại chánh điện (chỉ cảnh 3D).
//
// Máy ảnh: ẩn mọi nút trên cảnh (class `photo-mode` trên #stage, chanh-dien.css), hiện khung ngắm 9:16 (màn dọc, đăng
// TikTok / Reels) hoặc 16:9 (màn ngang). Vẫn đi bằng cần điều khiển, kéo màn hình để chọn góc; nút selfie đưa camera ra
// trước mặt nhân vật, ✨ Tạo dáng bấm hộ nút Tương tác, ⏱ hẹn giờ 3 giây, 🏷 hiện / ẩn tên (mặc định ẩn tên và bong bóng
// chat của mọi người để ảnh đăng lên mạng không lộ tên người khác). Chụp = renderer.capture (vẽ một khung, chép đúng
// vùng khung ngắm) rồi ghép dải logo LotusGather + nơi chụp + ngày giờ ở mép dưới.
//
// Album: ảnh chỉ lưu trong IndexedDB của trình duyệt trên máy này (không gửi lên server), tối đa ALBUM_MAX ảnh; trình
// duyệt không cho lưu (chế độ riêng tư…) thì giữ trong bộ nhớ tới khi tải lại trang. Xem ảnh: chia sẻ (navigator.share),
// lưu về máy, xóa (chạm hai lần).
import { lang, onLangChange } from '/thien-i18n.js';
import { photoFrame, photoText } from '/photo-text.js';

export const ALBUM_MAX = 60;
const DB_NAME = 'lotus-album';
const STORE = 'photos';
const THUMB_SIDE = 360;
const TIMER_SECONDS = 3;

const tr = (key, vars) => photoText(lang(), key, vars);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}
const remembered = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const remember = (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
};
const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// ---- Kho ảnh: IndexedDB, không được thì bộ nhớ ----
function createAlbum() {
  let memory = null;
  let nextMemoryId = 1;
  const ready = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    if (!db) memory = [];
    return db;
  });
  async function run(mode, work) {
    const db = await ready;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error('album'));
      transaction.onabort = () => reject(transaction.error || new Error('album'));
    });
  }
  return {
    ready,
    get persistent() { return !memory; },
    // Mới nhất trước.
    async list() {
      await ready;
      const rows = memory ? [...memory] : await run('readonly', (store) => store.getAll());
      return rows.sort((a, b) => b.at - a.at);
    },
    async add(record) {
      await ready;
      if (memory) {
        const id = nextMemoryId++;
        memory.push({ ...record, id });
        return id;
      }
      return run('readwrite', (store) => store.add(record));
    },
    async remove(id) {
      await ready;
      if (memory) {
        memory = memory.filter((item) => item.id !== id);
        return;
      }
      await run('readwrite', (store) => store.delete(id));
    },
  };
}

let logoPromise = null;
function logoImage() {
  logoPromise ||= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = '/promo-logo.webp';
  });
  return logoPromise;
}

// Chữ vừa bề ngang: thu nhỏ cỡ chữ tới `min`, vẫn dài thì cắt "…".
function fitText(g, text, weight, size, min, maxWidth) {
  let font = size;
  const family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.font = `${weight} ${font}px ${family}`;
  while (font > min && g.measureText(text).width > maxWidth) {
    font -= 1;
    g.font = `${weight} ${font}px ${family}`;
  }
  let shown = text;
  while (shown.length > 1 && g.measureText(shown).width > maxWidth) shown = `${shown.slice(0, -2)}…`;
  return shown;
}

// Ảnh chụp + dải dưới: logo, LotusGather, lotusgather.online (trái); 📍 nơi chụp, ngày giờ (phải).
async function compose(shot, { place, when }) {
  const canvas = document.createElement('canvas');
  canvas.width = shot.width;
  canvas.height = shot.height;
  const g = canvas.getContext('2d');
  g.drawImage(shot, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const unit = Math.min(w, h) / 100;
  const band = unit * 26;
  const shade = g.createLinearGradient(0, h - band, 0, h);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  g.fillStyle = shade;
  g.fillRect(0, h - band, w, band);
  const pad = unit * 4.2;
  const logoSize = unit * 10;
  const logo = await logoImage();
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.55)';
  g.shadowBlur = unit * 1.2;
  let textX = pad;
  if (logo) {
    g.save();
    g.beginPath();
    g.arc(pad + logoSize / 2, h - pad - logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(logo, pad, h - pad - logoSize, logoSize, logoSize);
    g.restore();
    textX = pad + logoSize + unit * 2.4;
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  const brand = fitText(g, 'LotusGather', 700, Math.round(unit * 4.6), Math.round(unit * 3), w * 0.4);
  g.fillText(brand, textX, h - pad - logoSize * 0.46);
  const brandWidth = g.measureText(brand).width;
  g.fillStyle = 'rgba(255, 255, 255, 0.86)';
  const site = fitText(g, 'lotusgather.online', 500, Math.round(unit * 3.3), Math.round(unit * 2.4), w * 0.4);
  g.fillText(site, textX, h - pad - unit * 0.6);
  const brandRight = textX + Math.max(brandWidth, g.measureText(site).width);
  const right = w - pad;
  const room = right - brandRight - unit * 4;
  g.textAlign = 'right';
  if (place) {
    g.fillStyle = '#ffffff';
    g.fillText(fitText(g, `📍 ${place}`, 600, Math.round(unit * 3.9), Math.round(unit * 2.6), room), right, h - pad - logoSize * 0.46);
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.86)';
  g.fillText(fitText(g, when, 500, Math.round(unit * 3.3), Math.round(unit * 2.4), room), right, h - pad - unit * 0.6);
  g.restore();
  const photo = await toBlob(canvas, 'image/jpeg', 0.9);
  const scale = Math.min(1, THUMB_SIDE / Math.max(w, h));
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w * scale));
  small.height = Math.max(1, Math.round(h * scale));
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  const thumb = await toBlob(small, 'image/jpeg', 0.8);
  return { photo, thumb, width: w, height: h };
}

const fileName = (record) => {
  const date = new Date(record.at);
  const pad = (value) => String(value).padStart(2, '0');
  return `lotusgather-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
};

// stage: #stage; getCanvas(): canvas cảnh 3D; getRenderer(): bộ vẽ 3D (capture, setLabelsHidden); explore: explore-ui
// (faceCamera, pose, place); placeLabel(): "Tàng Kinh Các · California"; locale(); onChange(active) khi vào / ra máy ảnh
// (trang mở mắt, bỏ khoảng chừa của camera, trả nhãn tên về như cũ); onAlbumChange() khi album đổi.
export function createPhotoUI({ stage, getCanvas, getRenderer, explore, placeLabel = () => '', locale = () => undefined, onChange = () => {}, onAlbumChange = () => {} }) {
  const album = createAlbum();
  let active = false;
  let busy = false;
  let showNames = remembered('photo-names') === '1';
  let timerOn = remembered('photo-timer') === '1';
  let selfie = false;
  let countdown = null;
  let lastThumbUrl = '';
  let statusTimer = 0;
  let hinted = false;

  // ---- Khung ngắm + nút ----
  const finder = el('div', 'photo-finder');
  finder.hidden = true;
  finder.setAttribute('aria-hidden', 'true');
  finder.append(el('i', 'photo-thirds'), ...['tl', 'tr', 'bl', 'br'].map((corner) => el('i', `photo-corner ${corner}`)));
  const flash = el('div', 'photo-flash');
  flash.hidden = true;
  const count = el('div', 'photo-count');
  count.hidden = true;
  count.setAttribute('aria-live', 'assertive');

  const controls = el('div', 'photo-controls');
  controls.hidden = true;
  const exitButton = button('photo-round photo-exit', '✕', () => close());
  const status = el('p', 'photo-status');
  status.hidden = true;
  status.setAttribute('role', 'status');
  const side = el('div', 'photo-side');
  const namesButton = button('photo-pill', '', () => {
    showNames = !showNames;
    remember('photo-names', showNames ? '1' : '0');
    getRenderer()?.setLabelsHidden?.(!showNames);
    label();
    say(tr(showNames ? 'camera.namesOn' : 'camera.namesOff'));
  });
  const timerButton = button('photo-pill', '', () => {
    timerOn = !timerOn;
    remember('photo-timer', timerOn ? '1' : '0');
    label();
    say(tr(timerOn ? 'camera.timerOn' : 'camera.timerOff'));
  });
  const poseButton = button('photo-pill', '', () => {
    if (explore.place === 'hall') say(tr('camera.poseHall'));
    else if (!explore.pose()) say(tr('camera.poseHall'));
  });
  side.append(namesButton, timerButton, poseButton);
  const bar = el('div', 'photo-bar');
  const thumbButton = button('photo-thumb', undefined, () => openLatest());
  const thumbImage = el('img');
  thumbImage.alt = '';
  thumbButton.append(thumbImage);
  const shutter = button('photo-shutter', undefined, () => shoot());
  shutter.append(el('i'));
  const selfieButton = button('photo-round photo-selfie', '🔄', () => {
    const next = !selfie;
    if (!explore.faceCamera(next)) {
      say(tr('camera.selfieFail'));
      return;
    }
    selfie = next;
    label();
  });
  bar.append(thumbButton, shutter, selfieButton);
  controls.append(exitButton, status, side, bar);

  // ---- Xem ảnh ----
  const viewer = el('div', 'photo-viewer');
  viewer.hidden = true;
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  const viewerHead = el('header', 'photo-viewer-head');
  const viewerTitle = el('div', 'photo-viewer-title');
  const viewerPlace = el('b');
  const viewerWhen = el('small');
  viewerTitle.append(viewerPlace, viewerWhen);
  const viewerClose = button('photo-round', '✕', () => closeViewer());
  viewerHead.append(viewerTitle, viewerClose);
  const viewerFigure = el('div', 'photo-viewer-figure');
  const viewerImage = el('img');
  viewerImage.alt = '';
  const prevButton = button('photo-round photo-nav prev', '‹', () => step(-1));
  const nextButton = button('photo-round photo-nav next', '›', () => step(1));
  viewerFigure.append(viewerImage, prevButton, nextButton);
  const viewerNote = el('p', 'photo-viewer-note');
  const viewerActions = el('div', 'photo-viewer-actions');
  const shareButton = button('photo-action primary', '', () => share());
  const saveButton = button('photo-action', '', () => download());
  const deleteButton = button('photo-action danger', '', () => removeCurrent());
  viewerActions.append(shareButton, saveButton, deleteButton);
  viewer.append(viewerHead, viewerFigure, viewerNote, viewerActions);
  viewer.addEventListener('click', (event) => { if (event.target === viewer) closeViewer(); });

  stage.append(finder, flash, count, controls, viewer);

  let viewing = { list: [], index: 0 };
  let viewerUrl = '';
  let confirmDelete = 0;

  function label() {
    exitButton.setAttribute('aria-label', tr('camera.exit'));
    exitButton.title = tr('camera.exit');
    shutter.setAttribute('aria-label', tr('camera.shoot'));
    namesButton.textContent = `🏷 ${tr('camera.names')}`;
    namesButton.setAttribute('aria-pressed', String(showNames));
    timerButton.textContent = `⏱ ${timerOn ? `${TIMER_SECONDS}s` : tr('camera.timer')}`;
    timerButton.setAttribute('aria-pressed', String(timerOn));
    poseButton.textContent = `✨ ${tr('camera.pose')}`;
    selfieButton.setAttribute('aria-label', tr(selfie ? 'camera.back' : 'camera.selfie'));
    selfieButton.title = tr(selfie ? 'camera.back' : 'camera.selfie');
    selfieButton.setAttribute('aria-pressed', String(selfie));
    thumbButton.setAttribute('aria-label', tr('album.title'));
    viewer.setAttribute('aria-label', tr('album.title'));
    viewerClose.setAttribute('aria-label', tr('viewer.close'));
    prevButton.setAttribute('aria-label', tr('viewer.prev'));
    nextButton.setAttribute('aria-label', tr('viewer.next'));
    shareButton.textContent = tr('viewer.share');
    saveButton.textContent = tr('viewer.save');
    if (!confirmDelete) deleteButton.textContent = tr('viewer.delete');
    renderAlbum();
  }

  function say(text, ms = 2_600) {
    status.textContent = text;
    status.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.hidden = true; }, ms);
  }

  function layout() {
    if (!active) return;
    const frame = photoFrame(stage.clientWidth, stage.clientHeight);
    Object.assign(finder.style, { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` });
    stage.classList.toggle('photo-wide', frame.wide);
  }
  new ResizeObserver(layout).observe(stage);

  // Vùng khung ngắm theo tọa độ khung vẽ 3D (ở iPhone xoay ngang khung vẽ tràn qua vùng tai thỏ, lệch với #stage).
  function captureRect() {
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = getCanvas().getBoundingClientRect();
    const frame = photoFrame(stageRect.width, stageRect.height);
    return { x: stageRect.left + frame.left - canvasRect.left, y: stageRect.top + frame.top - canvasRect.top, width: frame.width, height: frame.height };
  }

  async function refreshThumb() {
    const latest = (await album.list().catch(() => []))[0];
    if (lastThumbUrl) URL.revokeObjectURL(lastThumbUrl);
    lastThumbUrl = latest ? URL.createObjectURL(latest.thumb || latest.photo) : '';
    thumbImage.hidden = !latest;
    if (latest) thumbImage.src = lastThumbUrl;
    else thumbImage.removeAttribute('src');
  }

  function open() {
    if (active) return;
    active = true;
    selfie = false;
    stage.classList.add('photo-mode');
    finder.hidden = false;
    controls.hidden = false;
    layout();
    label();
    // Trang mở mắt (nếu đang nhắm) trước, rồi mới ẩn / hiện nhãn tên theo lựa chọn của máy ảnh.
    onChange(true);
    getRenderer()?.setLabelsHidden?.(!showNames);
    refreshThumb();
    if (!hinted) {
      hinted = true;
      say(tr('camera.hint'), 3_600);
    }
  }

  function close() {
    if (!active) return;
    active = false;
    stopCountdown();
    if (selfie) explore.faceCamera(false);
    selfie = false;
    stage.classList.remove('photo-mode', 'photo-wide');
    finder.hidden = true;
    controls.hidden = true;
    status.hidden = true;
    onChange(false);
  }

  function stopCountdown() {
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown.resolve(false);
    countdown = null;
    count.hidden = true;
    shutter.classList.remove('counting');
  }

  // Đếm 3-2-1 trên màn hình; true khi đếm xong (bấm lại nút chụp hoặc thoát thì hủy).
  function runCountdown() {
    return new Promise((resolve) => {
      let left = TIMER_SECONDS;
      count.textContent = String(left);
      count.hidden = false;
      shutter.classList.add('counting');
      countdown = {
        resolve,
        timer: setInterval(() => {
          left -= 1;
          if (left > 0) {
            count.textContent = String(left);
            return;
          }
          clearInterval(countdown.timer);
          countdown = null;
          count.hidden = true;
          shutter.classList.remove('counting');
          resolve(true);
        }, 1_000),
      };
    });
  }

  async function shoot() {
    if (countdown) {
      stopCountdown();
      return;
    }
    if (busy || !active) return;
    busy = true;
    try {
      if (timerOn && !(await runCountdown())) return;
      if (!active) return;
      const renderer = getRenderer();
      // Cạnh ngắn của ảnh ít nhất 1080 điểm ảnh (khung 9:16 trên điện thoại → 1080 × 1920, đúng cỡ TikTok / Reels).
      const rect = captureRect();
      const shot = renderer?.capture?.({ ...rect, scale: Math.max(2, 1080 / Math.max(1, Math.min(rect.width, rect.height))) });
      if (!shot) throw new Error('capture');
      flash.hidden = false;
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      setTimeout(() => { flash.hidden = true; }, 420);
      const at = Date.now();
      const when = new Date(at).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const place = placeLabel();
      const made = await compose(shot, { place, when });
      if (!made.photo || !made.thumb) throw new Error('encode');
      const record = { at, place, ...made };
      const list = await album.list().catch(() => []);
      if (list.length >= ALBUM_MAX) {
        say(tr('camera.full', { max: ALBUM_MAX }), 4_200);
        showViewer([record], 0);
        return;
      }
      record.id = await album.add(record);
      say(`✓ ${tr('camera.saved')}`);
      await refreshThumb();
      thumbButton.classList.remove('pop');
      void thumbButton.offsetWidth;
      thumbButton.classList.add('pop');
      onAlbumChange();
    } catch {
      say(tr('camera.failed'));
    } finally {
      busy = false;
    }
  }

  async function openLatest() {
    const list = await album.list().catch(() => []);
    if (list.length) showViewer(list, 0);
  }

  // ---- Xem ảnh: list là các bản ghi (ảnh chưa lưu vì album đầy thì không có id) ----
  function showViewer(list, index) {
    viewing = { list, index };
    confirmDelete = 0;
    viewer.hidden = false;
    renderViewer();
    viewerClose.focus({ preventScroll: true });
  }
  function closeViewer() {
    viewer.hidden = true;
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = '';
    viewerImage.removeAttribute('src');
  }
  function renderViewer() {
    const record = viewing.list[viewing.index];
    if (!record) {
      closeViewer();
      return;
    }
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(record.photo);
    viewerImage.src = viewerUrl;
    viewerImage.alt = tr('album.photo', { n: viewing.index + 1 });
    viewerPlace.textContent = record.place || tr('album.title');
    viewerWhen.textContent = new Date(record.at).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    viewerNote.textContent = record.id === undefined ? tr('viewer.unsaved') : '';
    viewerNote.hidden = record.id !== undefined;
    prevButton.hidden = viewing.index <= 0;
    nextButton.hidden = viewing.index >= viewing.list.length - 1;
    deleteButton.hidden = record.id === undefined;
    const file = new File([record.photo], fileName(record), { type: 'image/jpeg' });
    shareButton.hidden = !navigator.canShare?.({ files: [file] });
    confirmDelete = 0;
    deleteButton.textContent = tr('viewer.delete');
  }
  function step(delta) {
    const next = viewing.index + delta;
    if (next < 0 || next >= viewing.list.length) return;
    viewing.index = next;
    renderViewer();
  }
  function share() {
    const record = viewing.list[viewing.index];
    if (!record) return;
    const file = new File([record.photo], fileName(record), { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file], title: 'LotusGather' }).catch(() => {});
  }
  function download() {
    const record = viewing.list[viewing.index];
    if (!record) return;
    const link = document.createElement('a');
    const url = URL.createObjectURL(record.photo);
    link.href = url;
    link.download = fileName(record);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function removeCurrent() {
    const record = viewing.list[viewing.index];
    if (!record || record.id === undefined) return;
    // Chạm hai lần (trong 3 giây) mới xóa: ảnh chỉ có trên máy này, xóa là mất.
    if (!confirmDelete || Date.now() - confirmDelete > 3_000) {
      confirmDelete = Date.now();
      deleteButton.textContent = tr('viewer.confirm');
      return;
    }
    confirmDelete = 0;
    await album.remove(record.id).catch(() => {});
    viewing.list.splice(viewing.index, 1);
    viewing.index = Math.min(viewing.index, viewing.list.length - 1);
    renderViewer();
    refreshThumb();
    onAlbumChange();
    renderAlbum();
  }

  // ---- Trang Album trong điện thoại ----
  let albumBody = null;
  let albumUrls = [];
  let albumToken = 0;
  const albumNote = el('p', 'phone-note photo-album-note');
  const albumShoot = button('phone-row primary', '', () => openCamera?.());
  const albumGrid = el('div', 'photo-album-grid');
  let openCamera = null;
  async function renderAlbum() {
    if (!albumBody || albumBody.hidden) return;
    const token = ++albumToken;
    albumShoot.textContent = tr('album.shoot');
    if (!albumGrid.childElementCount) albumNote.textContent = tr('album.loading');
    const list = await album.list().catch(() => []);
    if (token !== albumToken) return;
    for (const url of albumUrls) URL.revokeObjectURL(url);
    albumUrls = [];
    albumNote.textContent = list.length ? tr('album.count', { n: list.length, max: ALBUM_MAX }) : tr('album.empty');
    if (!album.persistent) albumNote.textContent += ` · ${tr('album.memory')}`;
    albumGrid.replaceChildren(...list.map((record, index) => {
      const url = URL.createObjectURL(record.thumb || record.photo);
      albumUrls.push(url);
      const tile = button('photo-album-tile', undefined, () => showViewer(list, index));
      const image = el('img');
      image.src = url;
      image.alt = tr('album.photo', { n: index + 1 });
      image.loading = 'lazy';
      tile.append(image);
      return tile;
    }));
  }
  const albumPage = {
    build(body) {
      albumBody = body;
      body.append(albumShoot, albumNote, albumGrid);
    },
    show() {
      renderAlbum();
    },
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!viewer.hidden) closeViewer();
    else if (active) close();
  });
  onLangChange(label);
  label();

  return {
    open,
    close,
    get active() { return active; },
    get showNames() { return showNames; },
    albumPage,
    // Nút "📷 Chụp ảnh" trong trang Album: trang tự cất điện thoại rồi mở máy ảnh (có kiểm tra 3D / Trốn tìm).
    setOpenCamera(run) {
      openCamera = run;
    },
  };
}
