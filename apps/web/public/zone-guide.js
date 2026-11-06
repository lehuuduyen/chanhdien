// Hướng dẫn theo khu vực trong cảnh nhập vai. Trạng thái chỉ lưu trên trình duyệt: lần đầu bước vào một khu sẽ
// tự mở, còn bảng gỗ trong cảnh luôn có thể mở lại. Không cần tài khoản và không làm tăng dữ liệu phòng/server.
import { onLangChange, t } from '/thien-i18n.js';

const STORAGE_KEY = 'thien-zone-guides-v1';
const GUIDES = {
  hall: { icon: '🛕', steps: 4 },
  courtyard: { icon: '🌳', steps: 4 },
  garden: { icon: '🌱', steps: 6 },
  pets: { icon: '🐾', steps: 4 },
};

function node(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function readSeen() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => GUIDES[id]) : []);
  } catch {
    return new Set();
  }
}

export function createZoneGuide({ stage }) {
  const seen = readSeen();
  let current = null;

  const backdrop = node('div', 'zone-guide');
  backdrop.hidden = true;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'zoneGuideTitle');

  const card = node('section', 'zone-guide-card');
  const kicker = node('small', 'zone-guide-kicker');
  const title = node('h2');
  title.id = 'zoneGuideTitle';
  const intro = node('p', 'zone-guide-intro');
  const steps = node('ol', 'zone-guide-steps');
  const actions = node('div', 'zone-guide-actions');
  const skip = node('button', 'zone-guide-skip');
  skip.type = 'button';
  const done = node('button', 'zone-guide-done');
  done.type = 'button';
  actions.append(skip, done);
  card.append(kicker, title, intro, steps, actions);
  backdrop.append(card);
  stage.append(backdrop);

  function saveSeen() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])); } catch {}
  }

  function render() {
    if (!current) return;
    const guide = GUIDES[current];
    kicker.textContent = t('guide.kicker');
    title.textContent = `${guide.icon} ${t(`guide.${current}.title`)}`;
    intro.textContent = t(`guide.${current}.intro`);
    steps.replaceChildren(...Array.from({ length: guide.steps }, (_, index) => {
      const item = document.createElement('li');
      const number = node('span', 'zone-guide-number');
      number.textContent = String(index + 1);
      const text = document.createElement('span');
      text.textContent = t(`guide.${current}.step${index + 1}`);
      item.append(number, text);
      return item;
    }));
    skip.textContent = t('guide.skip');
    done.textContent = t('guide.done');
  }

  function close() {
    if (!current) return;
    seen.add(current);
    saveSeen();
    current = null;
    backdrop.hidden = true;
    stage.classList.remove('has-zone-guide');
  }

  function open(place, { automatic = false } = {}) {
    if (!GUIDES[place] || (automatic && seen.has(place))) return false;
    current = place;
    render();
    backdrop.hidden = false;
    stage.classList.add('has-zone-guide');
    requestAnimationFrame(() => done.focus({ preventScroll: true }));
    return true;
  }

  skip.addEventListener('click', close);
  done.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  stage.addEventListener('keydown', (event) => {
    if (!backdrop.hidden && event.key === 'Escape') close();
  });
  onLangChange(render);

  return {
    enter(place) { return open(place, { automatic: true }); },
    open(place) { return open(place); },
  };
}
