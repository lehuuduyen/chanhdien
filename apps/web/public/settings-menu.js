// Nút cấu hình ⚙ trên thanh trên cùng: gom Đăng nhập, Sao chép mã phòng, 2D/3D, âm nhạc, tắt tiếng, Rời vào một
// menu xổ xuống cho thanh trên gọn. Các nút cũ được chuyển vào menu nguyên vẹn (giữ sự kiện đã gắn), mỗi dòng ẩn
// theo nút gốc hoặc theo khối chứa cũ (vd: Rời chỉ hiện khi đang ở trong phòng).
// host: đặt các dòng thẳng vào khối này (app Cài đặt của điện thoại, phone-ui.js), không có nút ⚙; bấm một mục
// (trừ keepOpen) thì gọi onPick để nơi chứa tự đóng.
import { onLangChange, t } from '/thien-i18n.js';

export function createSettingsMenu({ topBar, host = null, rows, onPick = () => {} }) {
  const wrap = document.createElement('div');
  wrap.className = 'settings';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chip settings-toggle';
  toggle.textContent = '⚙';
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = host ? 'settings-panel in-phone' : 'settings-panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = !host;
  wrap.append(toggle, panel);

  const built = rows.filter((row) => row.element).map((row) => {
    const line = document.createElement('div');
    line.className = 'settings-row';
    const caption = document.createElement('span');
    caption.className = 'settings-label';
    line.append(caption, row.element);
    row.element.classList.add('in-menu');
    panel.append(line);
    return { ...row, line, caption };
  });

  function refresh() {
    for (const row of built) {
      row.caption.textContent = row.label ? t(row.label) : '';
      row.caption.hidden = !row.label;
      row.line.hidden = row.element.hidden || Boolean(row.container?.hidden);
    }
    toggle.title = t('menu.settings');
    toggle.setAttribute('aria-label', t('menu.settings'));
  }

  if (host) {
    panel.addEventListener('click', (event) => {
      const row = built.find((item) => item.line.contains(event.target));
      if (row && !row.keepOpen && event.target.closest('button, a')) onPick();
    });
    onLangChange(refresh);
    host.append(panel);
    refresh();
    return { refresh, close: () => {} };
  }

  function open(next) {
    panel.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    if (next) refresh();
  }

  toggle.addEventListener('click', () => open(panel.hidden));
  document.addEventListener('pointerdown', (event) => { if (!wrap.contains(event.target)) open(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') open(false); });
  // Bấm một mục thì đóng menu (trừ âm nhạc/tắt tiếng để bấm liên tiếp được).
  panel.addEventListener('click', (event) => {
    const row = built.find((item) => item.line.contains(event.target));
    if (row && !row.keepOpen) open(false);
  });
  onLangChange(refresh);

  topBar.append(wrap);
  refresh();
  return { refresh, close: () => open(false) };
}
