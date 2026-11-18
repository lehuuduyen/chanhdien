// Cài như ứng dụng (PWA) và toàn màn hình cho chánh điện. Mở từ màn hình chính là toàn màn hình nhờ
// manifest.webmanifest; trong trình duyệt thì:
// - Android / máy tính / iPad: nút ⛶ (cột góc nhìn khi màn rộng, mục "Màn hình" trong menu ⚙) gọi requestFullscreen.
// - iPhone: Safari không cho trang tự toàn màn hình, nên hướng dẫn "Thêm vào MH chính" (hộp thoại ba bước).
// - Chrome báo cài được (beforeinstallprompt) thì nút "Thêm vào màn hình chính" mở hộp cài của trình duyệt.
// Điện thoại xoay ngang lần đầu (thanh địa chỉ chiếm chỗ nhất) thì gợi ý một lần, nhớ ở localStorage.
import { onLangChange, t } from '/thien-i18n.js';

const HINT_KEY = 'thien-app-hint';
const ua = navigator.userAgent;
const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
// Trình duyệt nhúng trong app (Zalo, Facebook, Messenger, Instagram, TikTok, Line) không thêm được vào màn hình chính.
const inAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Zalo|Line\/|TikTok|musical_ly|BytedanceWebview/i.test(ua);
const root = document.documentElement;
const canFullscreen = Boolean((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen));
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
// Mở từ màn hình chính (đã cài). Chrome cũng báo display-mode: fullscreen khi trang đang toàn màn hình bằng
// requestFullscreen, nên trường hợp đó không tính là đã cài.
const appFullscreen = () => matchMedia('(display-mode: fullscreen)').matches && !fullscreenElement();
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || appFullscreen();
// Điện thoại xoay ngang (cùng điều kiện "điện thoại ngang" của khối Màn rộng trong chanh-dien.css).
const phoneLandscape = matchMedia('(min-aspect-ratio: 1/1) and (max-height: 520px) and (pointer: coarse)');

let installEvent = null;
const listeners = new Set();
const notify = () => { for (const fn of listeners) fn(); };
window.addEventListener('beforeinstallprompt', (event) => {
  // Dùng nút / gợi ý của trang thay cho thanh "Cài đặt" của Chrome (thanh đó đè lên cần điều khiển và ô chat).
  event.preventDefault();
  installEvent = event;
  notify();
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  notify();
});

export function createAppInstall({ stage, viewTools, toast = () => {}, ready = () => true }) {
  const chip = (className) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip ${className}`;
    return button;
  };
  // Mục trong menu ⚙ và nút ⛶ ở cột góc nhìn (CSS chỉ hiện ở màn rộng).
  const fullscreenButton = chip('app-fullscreen');
  const viewButton = chip('fs-toggle');
  viewButton.textContent = '⛶';
  viewTools?.append(viewButton);
  const installButton = chip('app-install');

  // Hộp thoại hướng dẫn thêm vào màn hình chính (cùng kiểu hộp thoại .ledger của trang).
  const help = document.createElement('div');
  help.className = 'ledger app-help';
  help.hidden = true;
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'ledger-card';
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.id = 'appHelpTitle';
  help.setAttribute('aria-labelledby', title.id);
  const close = chip('');
  close.textContent = '✕';
  header.append(title, close);
  const warn = document.createElement('p');
  warn.className = 'ledger-note app-help-warn';
  const steps = document.createElement('ol');
  steps.className = 'app-help-steps';
  card.append(header, warn, steps);
  help.append(card);
  stage.append(help);
  close.addEventListener('click', () => { help.hidden = true; });
  help.addEventListener('click', (event) => { if (event.target === help) help.hidden = true; });

  // Gợi ý một lần ở điện thoại ngang.
  const hint = document.createElement('div');
  hint.className = 'app-hint';
  hint.hidden = true;
  hint.setAttribute('role', 'status');
  const hintText = document.createElement('span');
  const hintGo = document.createElement('button');
  hintGo.type = 'button';
  hintGo.className = 'app-hint-go';
  const hintClose = document.createElement('button');
  hintClose.type = 'button';
  hintClose.className = 'app-hint-close';
  hintClose.textContent = '✕';
  hint.append(hintText, hintGo, hintClose);
  stage.append(hint);
  let hintTimer = null;
  const hideHint = () => {
    hint.hidden = true;
    clearTimeout(hintTimer);
  };
  hintClose.addEventListener('click', hideHint);

  // Cài được: Chrome đã báo (mở hộp cài), iPhone / iPad Safari (hướng dẫn), Android trình duyệt khác (hướng dẫn menu ⋮).
  const installable = () => !standalone() && Boolean(installEvent || isIOS || isAndroid);

  function showHelp() {
    const lines = isIOS ? ['app.iosStep1', 'app.iosStep2', 'app.iosStep3'] : ['app.androidStep1', 'app.androidStep2', 'app.iosStep3'];
    title.textContent = t('app.howTitle');
    close.setAttribute('aria-label', t('app.close'));
    warn.textContent = t('app.inApp');
    warn.hidden = !inAppBrowser;
    steps.replaceChildren(...lines.map((key) => Object.assign(document.createElement('li'), { textContent: t(key) })));
    help.hidden = false;
  }

  async function install() {
    hideHint();
    if (installEvent) {
      const event = installEvent;
      installEvent = null;
      try {
        await event.prompt();
        await event.userChoice;
      } catch {}
      notify();
      return;
    }
    showHelp();
  }

  async function toggleFullscreen() {
    hideHint();
    try {
      if (fullscreenElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
    } catch {
      toast(t('app.fullscreenFailed'));
    }
  }

  function refresh() {
    const full = Boolean(fullscreenElement());
    fullscreenButton.hidden = !canFullscreen || appFullscreen();
    viewButton.hidden = fullscreenButton.hidden;
    fullscreenButton.textContent = t(full ? 'app.exitFullscreen' : 'app.fullscreen');
    viewButton.setAttribute('aria-pressed', String(full));
    viewButton.title = fullscreenButton.textContent.replace('⛶ ', '');
    viewButton.setAttribute('aria-label', viewButton.title);
    installButton.hidden = !installable();
    installButton.textContent = t('app.install');
    hintClose.setAttribute('aria-label', t('app.close'));
    if (full || standalone()) hideHint();
  }

  // Điện thoại ngang, đang ở trong chánh điện 3D, chưa toàn màn hình / chưa cài: gợi ý (một lần trên máy này).
  function maybeHint() {
    if (!hint.hidden || standalone() || fullscreenElement() || !phoneLandscape.matches) return;
    if (!stage.classList.contains('view-3d') || !ready()) return;
    try { if (localStorage.getItem(HINT_KEY)) return; } catch { return; }
    const action = canFullscreen ? 'fullscreen' : installable() ? 'install' : null;
    if (!action) return;
    try { localStorage.setItem(HINT_KEY, String(Date.now())); } catch {}
    hintText.textContent = t(action === 'fullscreen' ? 'app.hintFullscreen' : 'app.hintInstall');
    hintGo.textContent = action === 'fullscreen' ? '⛶' : t('app.hintGo');
    hintGo.onclick = action === 'fullscreen' ? toggleFullscreen : install;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 12_000);
  }

  fullscreenButton.addEventListener('click', toggleFullscreen);
  viewButton.addEventListener('click', toggleFullscreen);
  installButton.addEventListener('click', install);
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(name, refresh);
  phoneLandscape.addEventListener('change', () => setTimeout(maybeHint, 600));
  listeners.add(refresh);
  onLangChange(refresh);
  refresh();
  return { fullscreenButton, installButton, maybeHint, showHelp };
}
