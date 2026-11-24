// Điện thoại trong chánh điện: nút 📱 cạnh ô chat mở một màn có biểu tượng app (Tin nhắn, Bạn bè, Đi nhanh, Bản đồ,
// Ví, Linh thú, Nông trại, Bấm giờ, Máy ảnh, Album, Shop, Cài đặt) thay cho các nút rải trên cảnh, để màn chơi gọn, nhất
// là khi xoay ngang. Màn dọc: điện thoại trồi lên từ đáy; màn rộng khi 3D: ngăn phải như các bảng khác (chanh-dien.css,
// khối "Màn rộng"). Module chỉ dựng khung: app nào mở gì do trang khai báo.
//
// app: { id, icon, label (khóa i18n), run?() — đóng điện thoại rồi chạy (mở bảng sẵn có),
//        page?: { build(body), show?() } — trang riêng trong điện thoại (Cài đặt, Đi nhanh, Ví…),
//        soon?: true — chưa có (báo "sắp có"), blocked?() → khóa i18n lý do không mở được (vd: chỉ ở 3D) }
// Nút cũ cần giữ trong trang (vd: test / video bấm thẳng vào) đặt vào `parked`: có trong DOM nhưng không hiện.
import { onLangChange, t } from '/thien-i18n.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (className, text) => {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
};

export function createPhoneUI({ stage, apps, status = [], parked: parkedHost = null, showToast = () => {}, locale = () => undefined }) {
  const list = apps.map((app) => ({ ...app, badge: 0, quiet: false }));

  // ---- Nút 📱 (trang đặt vào thanh chat) ----
  // Hình điện thoại vẽ bằng SVG theo màu chữ (emoji 📱 đen gần như mất trên nền tối của thanh chat).
  const openButton = button('chip phone-open');
  openButton.setAttribute('aria-haspopup', 'dialog');
  openButton.setAttribute('aria-expanded', 'false');
  const svg = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const glyph = svg('svg', { class: 'phone-glyph', viewBox: '0 0 16 24', 'aria-hidden': 'true' });
  glyph.append(
    svg('rect', { x: 1.5, y: 1.5, width: 13, height: 21, rx: 3.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    svg('rect', { x: 5.5, y: 18, width: 5, height: 1.8, rx: 0.9, fill: 'currentColor' }),
  );
  const unreadCount = el('b', 'phone-open-count');
  openButton.append(glyph, unreadCount);

  // ---- Khung điện thoại ----
  const sheet = el('section', 'phone');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  const frame = el('div', 'phone-frame');
  const bar = el('div', 'phone-status');
  const clock = el('b', 'phone-clock');
  const balances = el('span', 'phone-balances');
  balances.append(...status);
  const closeButton = button('phone-x', '✕');
  bar.append(clock, balances, closeButton);

  const home = el('div', 'phone-home');
  const grid = el('div', 'phone-apps');
  home.append(grid);

  const page = el('div', 'phone-page');
  page.hidden = true;
  const pageHead = el('header', 'phone-page-head');
  const back = button('phone-back', '‹');
  const pageTitle = el('h2', 'phone-page-title');
  pageHead.append(back, pageTitle);
  page.append(pageHead);

  const homeBar = button('phone-home-bar');
  homeBar.append(el('i'));
  frame.append(bar, home, page, homeBar);
  sheet.append(frame);

  // Thông báo kiểu điện thoại: thẻ trượt xuống đầu màn, chạm là chạy việc (vd: mở Trí tuệ), ✕ hoặc sau vài giây thì
  // tự cất. Mỗi lúc một thẻ, thẻ sau xếp hàng.
  const notice = el('div', 'phone-notice');
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  const noticeMain = button('phone-notice-main');
  const noticeIcon = el('span', 'phone-notice-icon');
  const noticeText = el('span', 'phone-notice-text');
  const noticeTitle = el('b');
  const noticeBody = el('small');
  noticeText.append(noticeTitle, noticeBody);
  const noticeGo = el('span', 'phone-notice-go');
  noticeMain.append(noticeIcon, noticeText, noticeGo);
  const noticeX = button('phone-notice-x', '✕');
  notice.append(noticeMain, noticeX);
  const notices = [];
  let noticeShown = null;
  let noticeTimer = 0;
  function nextNotice() {
    clearTimeout(noticeTimer);
    noticeShown = notices.shift() || null;
    notice.hidden = !noticeShown;
    if (!noticeShown) return;
    noticeIcon.textContent = noticeShown.icon || '📱';
    noticeTitle.textContent = noticeShown.title || '';
    noticeBody.textContent = noticeShown.text || '';
    noticeBody.hidden = !noticeShown.text;
    noticeGo.textContent = noticeShown.actionLabel ? `${noticeShown.actionLabel} ›` : '';
    noticeGo.hidden = !noticeShown.actionLabel;
    notice.classList.remove('in');
    void notice.offsetWidth;
    notice.classList.add('in');
    noticeTimer = setTimeout(nextNotice, noticeShown.ms || 9_000);
  }
  noticeMain.addEventListener('click', () => {
    const action = noticeShown?.action;
    nextNotice();
    action?.();
  });
  noticeX.addEventListener('click', nextNotice);
  stage.append(notice);

  const parked = parkedHost || el('div', 'phone-parked');
  parked.hidden = true;
  parked.setAttribute('aria-hidden', 'true');
  stage.append(sheet);
  if (!parkedHost) stage.append(parked);

  // Biểu tượng app + trang riêng (dựng một lần, giữ lại để nút / sự kiện bên trong không mất).
  for (const app of list) {
    const tile = button('phone-app');
    tile.dataset.app = app.id;
    const icon = el('span', 'phone-app-icon', app.icon);
    const badge = el('b', 'phone-badge');
    badge.hidden = true;
    icon.append(badge);
    const name = el('span', 'phone-app-name');
    const soon = el('small', 'phone-soon');
    soon.hidden = !app.soon;
    tile.append(icon, name, soon);
    grid.append(tile);
    tile.addEventListener('click', () => launch(app));
    app.tile = tile;
    app.badgeNode = badge;
    app.nameNode = name;
    app.soonNode = soon;
    if (app.page) {
      app.body = el('div', 'phone-page-body');
      app.body.dataset.app = app.id;
      app.body.hidden = true;
      page.append(app.body);
      app.page.build(app.body);
    }
  }

  let current = null; // app đang mở trang
  let clockTimer = 0;

  function tickClock() {
    clock.textContent = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  }

  function label() {
    for (const app of list) {
      app.nameNode.textContent = t(app.label);
      app.soonNode.textContent = t('phone.soon');
      app.tile.classList.toggle('is-soon', Boolean(app.soon));
      app.soonNode.hidden = !app.soon;
      app.tile.setAttribute('aria-label', app.badge ? `${t(app.label)} (${app.badge})` : t(app.label));
    }
    // Số "nhẹ" (vd: Trí tuệ còn mấy trò hôm nay) chỉ hiện trên biểu tượng app, không cộng vào số trên nút 📱 (số đó
    // dành cho tin chưa đọc); nút 📱 chỉ có một chấm nhỏ.
    const total = list.reduce((sum, app) => sum + (app.quiet ? 0 : app.badge), 0);
    const dot = !total && list.some((app) => app.quiet && app.badge);
    openButton.classList.toggle('has-dot', dot);
    // Cạnh ô chat chỗ hẹp: chỉ biểu tượng + số tin chưa xem (như nút 💬 trước đây).
    unreadCount.textContent = total ? (total > 99 ? '99+' : String(total)) : '';
    unreadCount.hidden = !total;
    openButton.classList.toggle('has-unread', Boolean(total));
    openButton.setAttribute('aria-label', total ? `${t('phone.title')} (${total})` : t('phone.title'));
    openButton.title = t('phone.title');
    sheet.setAttribute('aria-label', t('phone.title'));
    closeButton.setAttribute('aria-label', t('close'));
    noticeX.setAttribute('aria-label', t('close'));
    back.setAttribute('aria-label', t('phone.back'));
    homeBar.setAttribute('aria-label', t('phone.home'));
    if (current) pageTitle.textContent = t(current.label);
  }

  function showHome() {
    if (current) current.body.hidden = true;
    current = null;
    page.hidden = true;
    home.hidden = false;
    sheet.classList.remove('on-page');
  }

  function showPage(app) {
    if (current && current !== app) current.body.hidden = true;
    current = app;
    pageTitle.textContent = t(app.label);
    app.body.hidden = false;
    home.hidden = true;
    page.hidden = false;
    sheet.classList.add('on-page');
    app.page.show?.();
  }

  function setOpen(next, appId = null) {
    if (next) {
      sheet.hidden = false;
      tickClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(tickClock, 15_000);
      const app = appId && list.find((item) => item.id === appId);
      if (app?.page) showPage(app);
      else showHome();
    } else {
      sheet.hidden = true;
      clearInterval(clockTimer);
      showHome();
    }
    openButton.setAttribute('aria-expanded', String(next));
    stage.classList.toggle('phone-open-now', next);
  }

  function launch(app) {
    if (app.soon) {
      showToast(t('phone.soonToast', { app: t(app.label) }));
      return;
    }
    const blocked = app.blocked?.();
    if (blocked) {
      showToast(t(blocked));
      return;
    }
    if (app.page) {
      showPage(app);
      return;
    }
    setOpen(false);
    app.run?.();
  }

  openButton.addEventListener('click', () => setOpen(sheet.hidden));
  closeButton.addEventListener('click', () => setOpen(false));
  back.addEventListener('click', showHome);
  // Thanh dưới như điện thoại thật: đang ở trang app thì về màn chính, đang ở màn chính thì cất điện thoại.
  homeBar.addEventListener('click', () => (current ? showHome() : setOpen(false)));
  // Bấm ô xu / kim cương trên thanh trạng thái: ví / bảng nạp mở ra, cất điện thoại cho khỏi che.
  balances.addEventListener('click', () => setOpen(false));
  document.addEventListener('pointerdown', (event) => {
    if (sheet.hidden || sheet.contains(event.target) || openButton.contains(event.target)) return;
    // Hộp thoại mở từ trong điện thoại (vd: hồ sơ, đổi phòng) nằm ngoài khung: để hộp thoại tự xử lý.
    if (event.target.closest?.('[role="dialog"]')) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || sheet.hidden) return;
    if (current) showHome();
    else setOpen(false);
  });
  onLangChange(label);
  label();

  return {
    openButton,
    parked,
    get isOpen() { return !sheet.hidden; },
    open: (appId) => setOpen(true, appId),
    close: () => setOpen(false),
    home: showHome,
    // Số chưa xem trên biểu tượng app; nút 📱 hiện tổng. quiet: số nhắc việc (không phải tin chưa đọc) — chỉ hiện trên
    // biểu tượng app, nút 📱 có chấm nhỏ thay vì cộng số.
    setBadge(id, count, { quiet = false } = {}) {
      const app = list.find((item) => item.id === id);
      if (!app) return;
      app.badge = Math.max(0, Number(count) || 0);
      app.quiet = Boolean(quiet);
      app.badgeNode.hidden = !app.badge;
      app.badgeNode.textContent = app.badge > 99 ? '99+' : String(app.badge);
      app.badgeNode.classList.toggle('quiet', app.quiet);
      label();
    },
    // Thông báo { icon, title, text, actionLabel, action, ms }: thẻ đầu màn (xem `notice` ở trên).
    notify(item) {
      notices.push(item);
      if (!noticeShown) nextNotice();
    },
    // App làm sau (Bản đồ, Máy ảnh, Album) gắn vào khi đã có: phone.setApp('map', { run, soon: false }).
    setApp(id, patch) {
      const app = list.find((item) => item.id === id);
      if (!app) return;
      for (const key of ['run', 'soon', 'blocked']) if (key in patch) app[key] = patch[key];
      label();
    },
    // Trang đang mở cần vẽ lại (vd: số xu vừa đổi).
    refresh() {
      if (!sheet.hidden && current) current.page.show?.();
    },
  };
}
