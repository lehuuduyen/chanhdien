// Khu tưởng niệm ở trang chánh điện: tải các mộ từ API, nhận cập nhật realtime (memorial.grave), thẻ ô mộ ở đáy màn
// hình: ô trống thì nhập tên rồi đắp mộ (trừ xu ở ví Vườn Công Đức, giữ 24 giờ), ô có mộ thì xem tên, người đắp và
// thời gian còn lại. Mỗi lần đắp gửi một Idempotency-Key riêng (mạng lỗi thì gửi lại đúng khóa đó). Chữ người dùng
// (tên trên bia, tên người đắp) chỉ đưa ra bằng textContent; trên bia vẽ bằng canvas.
import { onLangChange, t } from '/thien-i18n.js';

const MINUTE_MS = 60_000;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick, disabled = false) {
  const node = el('button', className, text);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

// onCoins(): ví xu vừa đổi (trang đọc lại số xu cho header).
export function createMemorialUI({ stage, showToast, explore, account, openSignIn, onCoins }) {
  const graves = new Map();
  let price = 100;
  let ttlMs = 24 * 60 * MINUTE_MS;
  let nameMax = 24;
  let openSlot = null;
  let busy = false;
  let draft = '';
  let resumeSlot = null;
  let tick = null;

  const live = (slot) => {
    const grave = graves.get(slot);
    return grave && grave.expiresAt > Date.now() ? grave : null;
  };
  const leftText = (milliseconds) => {
    const minutes = Math.max(1, Math.ceil(Math.max(0, milliseconds) / MINUTE_MS));
    const hours = Math.floor(minutes / 60);
    return hours ? t('memorial.leftHours', { h: hours, m: minutes % 60 }) : t('memorial.leftMinutes', { m: minutes });
  };

  function apply(list, full = false) {
    if (full) graves.clear();
    for (const item of list || []) {
      if (item.grave) graves.set(item.slot, item.grave);
      else graves.delete(item.slot);
    }
    explore.setMemorial?.(list, { full });
    render();
  }

  async function load() {
    try {
      const response = await fetch('/api/v1/memorial', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      price = data.price ?? price;
      ttlMs = data.ttlMs ?? ttlMs;
      nameMax = data.nameMax ?? nameMax;
      apply(data.graves || [], true);
    } catch {}
  }

  async function build(slot, name) {
    if (busy) return;
    busy = true;
    render();
    const key = crypto.randomUUID();
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const response = await fetch('/api/v1/memorial/build', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({ slot, name }),
        });
        result = await response.json();
      } catch {}
    }
    busy = false;
    if (!result) showToast(t('memorial.err.NETWORK'));
    else {
      if (result.graves?.length) apply(result.graves);
      if (result.ok) {
        draft = '';
        showToast(t('memorial.built', { name: result.graves[0].grave.name }));
        onCoins?.();
      } else {
        const known = t(`memorial.err.${result.code}`, { price });
        showToast(known === `memorial.err.${result.code}` ? t('memorial.err.GENERIC') : known);
      }
    }
    render();
  }

  const card = el('section', 'garden-card memorial-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  stage.append(card);

  function render() {
    if (card.hidden || !openSlot) return;
    const slot = openSlot;
    const grave = live(slot);
    const head = el('div', 'garden-head');
    head.append(el('span', 'garden-badge', t('memorial.slot', { n: slot })), el('b', 'garden-title', grave ? `🪦 ${grave.name}` : t('memorial.emptyTitle')));
    const close = button('social-close', '✕', () => { card.hidden = true; openSlot = null; });
    close.setAttribute('aria-label', t('social.close'));
    const parts = [close, head];
    if (grave) {
      parts.push(
        el('p', 'garden-sub', t('memorial.builtBy', { name: grave.builderName })),
        el('p', 'garden-sub', leftText(grave.expiresAt - Date.now())),
        el('p', 'garden-sub memorial-rip', t('memorial.rip')),
      );
    } else if (!account()) {
      const note = el('div', 'garden-note');
      note.append(el('p', '', t('memorial.signIn', { price })), button('garden-main', t('memorial.signInButton'), () => {
        resumeSlot = slot;
        card.hidden = true;
        openSignIn?.();
      }));
      parts.push(el('p', 'garden-sub', t('memorial.emptyText', { price, hours: Math.round(ttlMs / 3_600_000) })), note);
    } else {
      const form = el('form', 'memorial-form');
      const input = el('input');
      input.maxLength = nameMax * 2;
      input.placeholder = t('memorial.namePlaceholder');
      input.autocomplete = 'off';
      input.value = draft;
      input.addEventListener('input', () => { draft = input.value; });
      const submit = el('button', 'garden-main', busy ? t('memorial.working') : t('memorial.build', { price }));
      submit.type = 'submit';
      submit.disabled = busy;
      form.append(input, submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = input.value.normalize('NFC').replace(/\s+/g, ' ').trim();
        if (!name) return showToast(t('memorial.err.EMPTY'));
        if ([...name].length > nameMax) return showToast(t('memorial.err.TOO_LONG', { max: nameMax }));
        build(slot, name);
      });
      parts.push(el('p', 'garden-sub', t('memorial.emptyText', { price, hours: Math.round(ttlMs / 3_600_000) })), form, el('p', 'garden-sub memorial-rule', t('memorial.rule')));
    }
    // Giữ chữ đang gõ và con trỏ khi vẽ lại.
    const focused = card.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    card.replaceChildren(...parts);
    if (focused) card.querySelector('input')?.focus();
  }

  function openGrave(slot) {
    openSlot = slot;
    card.hidden = false;
    render();
    clearInterval(tick);
    // Cập nhật thời gian còn lại; mộ hết hạn thì thẻ chuyển sang ô trống.
    tick = setInterval(() => {
      if (card.hidden) return clearInterval(tick);
      if (!card.contains(document.activeElement)) render();
    }, 30_000);
  }

  onLangChange(render);

  return {
    start: load,
    onTap({ slot }) {
      if (Number.isInteger(slot)) openGrave(slot);
    },
    accountChanged() {
      if (account() && resumeSlot) {
        const slot = resumeSlot;
        resumeSlot = null;
        openGrave(slot);
      } else render();
    },
    onMessage(message) {
      if (message.type !== 'memorial.grave') return false;
      apply(message.graves);
      return true;
    },
  };
}
