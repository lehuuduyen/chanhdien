// Ô kim cương 💎 trên header (chùa, rạp phim): hiện số kim cương của tài khoản; bấm vào mở bảng các gói nạp
// (gói do admin đặt, /api/v1/shop) → sang Stripe Checkout. Trả tiền xong Stripe đưa về /shop.html để xác nhận.
// Chữ trên bảng lấy từ text() để trang dịch theo ngôn ngữ; chỉ đưa ra màn hình bằng textContent.
const DEFAULT_TEXT = {
  title: 'Nạp kim cương',
  balance: 'Bạn đang có',
  signIn: 'Đăng nhập để nạp kim cương và mua hình nhân vật',
  off: 'Nạp kim cương đang được cập nhật, bạn quay lại sau nhé.',
  empty: 'Chưa có gói nạp.',
  shop: '🛍 Vào Shop nhân vật',
  close: 'Đóng',
  failed: 'Chưa mở được trang thanh toán, thử lại sau',
  note: 'Thanh toán an toàn qua Stripe. Kim cương là vật phẩm ảo, không đổi ra tiền.',
};

const STYLE = `
.gem-panel { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; padding: 12px; background: rgba(0, 0, 0, .55); }
.gem-panel[hidden] { display: none; }
.gem-sheet { width: min(420px, 100%); max-height: 88dvh; overflow: auto; display: grid; gap: 12px; padding: 16px 16px max(16px, env(safe-area-inset-bottom));
  color: #fff4e2; background: linear-gradient(180deg, #3a1a0c, #22100a); border: 1px solid rgba(255, 214, 140, .25); border-radius: 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .6); font: 14px/1.45 Inter, "Be Vietnam Pro", system-ui, sans-serif; }
.gem-sheet header { display: flex; align-items: center; gap: 8px; }
.gem-sheet h2 { margin: 0; flex: 1; color: #f3c969; font: 600 20px Georgia, serif; }
.gem-sheet .gem-close { width: 36px; height: 36px; color: inherit; background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 214, 140, .2); border-radius: 50%; font-size: 16px; cursor: pointer; }
.gem-sheet .gem-balance { margin: 0; color: #d6b998; }
.gem-sheet .gem-balance b { color: #7fd7ff; font-size: 18px; }
.gem-sheet .gem-packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.gem-sheet .gem-pack { display: grid; gap: 2px; justify-items: center; padding: 12px 6px; color: inherit; background: rgba(0, 0, 0, .28); border: 1px solid rgba(255, 214, 140, .2); border-radius: 14px; font: inherit; cursor: pointer; }
.gem-sheet .gem-pack:disabled { opacity: .5; cursor: default; }
.gem-sheet .gem-pack b { color: #7fd7ff; font-size: 18px; }
.gem-sheet .gem-pack strong { margin-top: 4px; padding: 4px 12px; color: #06202c; background: #7fd7ff; border-radius: 999px; }
.gem-sheet .gem-muted { margin: 0; color: #d6b998; font-size: 13px; }
.gem-sheet .gem-shop { height: 42px; color: #2a1404; background: #f3c969; border: 0; border-radius: 999px; font: inherit; font-weight: 800; cursor: pointer; }
`;

export function createGemUI({ chip, count, showToast, text = () => DEFAULT_TEXT, beforeLeave = () => {} }) {
  let shop = null;
  const label = () => ({ ...DEFAULT_TEXT, ...text() });

  if (!document.getElementById('gem-ui-style')) {
    const style = document.createElement('style');
    style.id = 'gem-ui-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const panel = document.createElement('div');
  panel.className = 'gem-panel';
  panel.hidden = true;
  panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
  document.body.append(panel);

  function close() {
    panel.hidden = true;
  }

  function goShop() {
    beforeLeave();
    location.href = '/shop.html';
  }

  async function checkout(pack, button) {
    button.disabled = true;
    try {
      const response = await fetch('/api/v1/shop/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId: pack.id }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && /^https:\/\/checkout\.stripe\.com\//.test(body.url || '')) {
        beforeLeave();
        location.href = body.url;
        return;
      }
    } catch {}
    button.disabled = false;
    showToast(label().failed);
  }

  function render() {
    const words = label();
    const me = shop?.me;
    const sheet = document.createElement('div');
    sheet.className = 'gem-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = `💎 ${words.title}`;
    const closer = Object.assign(document.createElement('button'), { type: 'button', className: 'gem-close', textContent: '✕', title: words.close });
    closer.setAttribute('aria-label', words.close);
    closer.addEventListener('click', close);
    header.append(title, closer);
    sheet.append(header);

    const balance = document.createElement('p');
    balance.className = 'gem-balance';
    if (me) {
      const amount = document.createElement('b');
      amount.textContent = `💎 ${me.diamonds.toLocaleString()}`;
      balance.append(`${words.balance} `, amount);
    } else balance.textContent = words.signIn;
    sheet.append(balance);

    const packs = shop?.packs || [];
    if (!shop?.payments || !packs.length) {
      const off = document.createElement('p');
      off.className = 'gem-muted';
      off.textContent = shop?.payments ? words.empty : words.off;
      sheet.append(off);
    }
    if (packs.length) {
      const grid = document.createElement('div');
      grid.className = 'gem-packs';
      for (const pack of packs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gem-pack';
        button.disabled = !shop.payments || !me;
        const gems = document.createElement('b');
        gems.textContent = `💎 ${pack.diamonds.toLocaleString()}`;
        const price = document.createElement('strong');
        price.textContent = `$${(pack.cents / 100).toFixed(2)}`;
        button.append(gems, price);
        button.addEventListener('click', () => checkout(pack, button));
        grid.append(button);
      }
      sheet.append(grid);
    }
    const note = document.createElement('p');
    note.className = 'gem-muted';
    note.textContent = words.note;
    const shopButton = Object.assign(document.createElement('button'), { type: 'button', className: 'gem-shop', textContent: words.shop });
    shopButton.addEventListener('click', goShop);
    sheet.append(note, shopButton);
    panel.replaceChildren(sheet);
  }

  async function refresh() {
    try {
      const response = await fetch('/api/v1/shop', { cache: 'no-store' });
      shop = response.ok ? await response.json() : null;
    } catch {
      return shop;
    }
    count.textContent = shop?.me ? shop.me.diamonds.toLocaleString() : '—';
    if (!panel.hidden) render();
    return shop;
  }

  async function open() {
    render();
    panel.hidden = false;
    await refresh();
    render();
  }

  chip.addEventListener('click', open);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { refresh, open, close, goShop, get shop() { return shop; } };
}
