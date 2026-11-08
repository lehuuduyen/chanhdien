// Linh thú (đợt 1): bảng trượt mở từ menu ⚙. Nhận nuôi bằng kim cương, cho ăn (xu) mỗi ngày một bữa, nhận xu trong
// rương, đổi tên. Server (API /api/v1/pets) quyết định mọi con số; trang chỉ hiện và gửi thao tác kèm Idempotency-Key.
// Văn bản từ người dùng (tên linh thú) chỉ đưa ra màn hình bằng textContent.
import { onLangChange, t } from '/thien-i18n.js';

// Ảnh chân dung dựng từ mô hình Meshy (/models/spirits/<loài>.webp); tải lỗi thì hiện emoji.
const ICONS = { carp: '🐟', turtle: '🐢', crane: '🕊️', lion: '🦁' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function spiritIcon(species) {
  const box = el('span', 'spirit-icon');
  const image = el('img');
  image.alt = '';
  image.decoding = 'async';
  image.src = `/models/spirits/${species}.webp`;
  image.addEventListener('error', () => { box.replaceChildren(ICONS[species] || '🐾'); });
  box.append(image);
  return box;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

// stage: khung cảnh để gắn bảng; openGems(): mở bảng nạp kim cương; refreshGems(): đọc lại số kim cương trên header;
// coinsChanged(): ví xu vừa đổi (header vườn đọc lại).
export function createPetUI({ stage, showToast, openGems = () => {}, refreshGems = () => {}, coinsChanged = () => {} }) {
  const sheet = el('section', 'garden-sheet spirit-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(sheet);

  let data = null; // { species, pets, coins, diamonds, signedIn }
  let busy = false;
  let renaming = null;

  const errorText = (code) => {
    const own = t(`spirit.err.${code}`);
    return own === `spirit.err.${code}` ? t('spirit.err.other') : own;
  };
  const nameOf = (pet) => pet.name || t(`spirit.species.${pet.species}`);

  async function load() {
    try {
      const response = await fetch('/api/v1/pets', { credentials: 'same-origin' });
      data = response.ok ? await response.json() : { species: [], pets: [], signedIn: false };
    } catch {
      data = data || { species: [], pets: [], signedIn: false };
    }
    render();
  }

  async function act(action, body) {
    if (busy) return null;
    busy = true;
    render();
    const key = crypto.randomUUID();
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const response = await fetch(`/api/v1/pets/${action}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify(body),
        });
        result = await response.json();
      } catch {}
    }
    busy = false;
    if (!result) showToast(t('spirit.err.other'));
    else if (!result.ok) {
      if (result.code === 'INSUFFICIENT_DIAMONDS') {
        showToast(t('spirit.needGems'));
        openGems();
      } else showToast(errorText(result.code));
    }
    if (result?.ok || result?.pet) {
      // Cập nhật linh thú vừa đổi tại chỗ, số xu / kim cương theo server.
      const pets = data?.pets || [];
      const index = pets.findIndex((pet) => pet.species === result.pet?.species);
      if (result.pet) {
        if (index >= 0) pets[index] = result.pet;
        else pets.push(result.pet);
        // Con đầu tiên nhận nuôi tự đi theo (server đã chọn).
        if (action === 'adopt' && !data.companion) data.companion = result.pet.species;
      }
      if (Number.isFinite(result.coins)) data.coins = result.coins;
      if (Number.isFinite(result.diamonds)) data.diamonds = result.diamonds;
    }
    if (result?.ok) {
      if (action === 'adopt') {
        showToast(t('spirit.adopted', { name: nameOf(result.pet) }));
        refreshGems();
      } else if (action === 'feed') showToast(t(result.woke ? 'spirit.woke' : 'spirit.fed', { name: nameOf(result.pet) }));
      else if (action === 'collect') showToast(t('spirit.got', { n: result.gained, name: nameOf(result.pet) }));
      else if (action === 'rename') showToast(t('spirit.renamed', { name: nameOf(result.pet) }));
      if (action !== 'rename') coinsChanged();
    }
    // Đã nuôi rồi (bấm ở tab khác) hoặc lỗi mạng: tải lại cho đúng.
    if (!result || result.code === 'ALREADY_OWNED') load();
    else render();
    return result;
  }

  async function setCompanion(species, pet) {
    if (busy) return;
    busy = true;
    render();
    let result = null;
    try {
      const response = await fetch('/api/v1/pets/companion', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ species }),
      });
      result = await response.json();
    } catch {}
    busy = false;
    if (result?.ok) {
      data.companion = result.companion;
      showToast(t(species ? 'spirit.followOn' : 'spirit.followOff', { name: nameOf(pet) }));
    } else showToast(errorText(result?.code));
    render();
  }

  function petCard(pet) {
    const card = el('div', `garden-info spirit-card mood-${pet.mood}`);
    const head = el('div', 'spirit-head');
    head.append(spiritIcon(pet.species));
    const title = el('div', 'spirit-title');
    title.append(el('b', '', nameOf(pet)), el('span', 'spirit-species', `${t(`spirit.species.${pet.species}`)} · ${t('spirit.level', { n: pet.level })}`));
    head.append(title);
    card.append(head);

    card.append(el('p', 'spirit-mood', t(`spirit.mood.${pet.mood}`, { rate: pet.ratePerHour.toLocaleString(document.documentElement.lang || undefined) })));

    // Tiến độ lên cấp: số ngày đã cho ăn / số ngày cần cho cấp sau.
    const level = el('div', 'spirit-level');
    if (pet.nextLevelDays === null) level.append(el('span', '', t('spirit.levelMax')));
    else {
      level.append(el('span', '', t('spirit.nextLevel', { n: pet.fedDays, need: pet.nextLevelDays })));
      const bar = el('div', 'garden-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(100, Math.round((pet.fedDays / pet.nextLevelDays) * 100))}%`;
      bar.append(fill);
      level.append(bar);
    }
    if (pet.streak > 1) level.append(el('span', 'spirit-streak', t('spirit.streak', { n: pet.streak })));
    card.append(level);

    const chest = el('div', 'spirit-chest');
    chest.append(el('span', '', `🪙 ${t('spirit.chest', { n: pet.chest, max: pet.chestMax })}`));
    const chestBar = el('div', 'garden-bar');
    const chestFill = el('span');
    chestFill.style.width = `${Math.min(100, Math.round((pet.chest / Math.max(1, pet.chestMax)) * 100))}%`;
    chestBar.append(chestFill);
    chest.append(chestBar);
    card.append(chest);

    const actions = el('div', 'spirit-actions');
    const collect = button('chip primary', t('spirit.collect', { n: pet.chest }), () => act('collect', { species: pet.species }));
    collect.disabled = busy || pet.chest < 1;
    const feed = button(`chip${pet.canFeed ? ' primary' : ''}`, pet.canFeed ? t('spirit.feed', { n: data.foodPrice ?? 5 }) : t('spirit.fedToday'), () => act('feed', { species: pet.species }));
    feed.disabled = busy || !pet.canFeed;
    const rename = button('chip', t('spirit.rename'), () => { renaming = renaming === pet.species ? null : pet.species; render(); });
    // Dẫn theo ngoài sân (mỗi lúc một con); bấm lại để cho linh thú ở nhà.
    const following = data.companion === pet.species;
    const follow = button(`chip${following ? ' following' : ''}`, t(following ? 'spirit.following' : 'spirit.follow'), () => setCompanion(following ? null : pet.species, pet));
    follow.disabled = busy;
    actions.append(feed, collect, follow, rename);
    card.append(actions);

    if (renaming === pet.species) {
      const form = el('form', 'friend-note spirit-rename');
      const input = el('input');
      input.maxLength = 20;
      input.placeholder = t('spirit.renamePlaceholder');
      input.value = pet.name || '';
      input.autocomplete = 'off';
      const save = el('button', 'chip primary', t('spirit.renameSave'));
      save.type = 'submit';
      form.append(input, save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        const result = await act('rename', { species: pet.species, name });
        if (result?.ok) {
          renaming = null;
          render();
        }
      });
      card.append(form);
      requestAnimationFrame(() => input.focus());
    }
    return card;
  }

  function adoptRow(item) {
    const row = el('div', 'garden-shop-row spirit-adopt');
    row.append(spiritIcon(item.id), el('b', 'spirit-adopt-name', t(`spirit.species.${item.id}`)));
    const adopt = button('chip primary', t('spirit.adopt', { n: item.price }), () => act('adopt', { species: item.id }));
    adopt.disabled = busy;
    row.append(adopt);
    return row;
  }

  function render() {
    if (sheet.hidden) return;
    const parts = [button('mala-back', `‹ ${t('mala.back')}`, close), el('h2', '', t('spirit.title'))];
    if (!data) parts.push(el('p', 'garden-sub', t('spirit.loading')));
    else {
      parts.push(el('p', 'garden-sub', t('spirit.intro')), el('p', 'garden-sub', t('spirit.intro2')));
      if (!data.signedIn) parts.push(el('p', 'garden-note', t('spirit.signIn')));
      else {
        const wallet = el('div', 'spirit-wallet');
        wallet.append(el('span', '', `🪙 ${data.coins ?? 0}`), el('span', '', `💎 ${data.diamonds ?? 0}`));
        parts.push(wallet);
      }
      if (data.pets.length) {
        parts.push(el('h3', '', t('spirit.mine')));
        for (const pet of data.pets) parts.push(petCard(pet));
      }
      const owned = new Set(data.pets.map((pet) => pet.species));
      const left = data.species.filter((item) => !owned.has(item.id));
      if (left.length && data.signedIn) {
        parts.push(el('h3', '', t('spirit.adoptTitle')));
        for (const item of left) parts.push(adoptRow(item));
      } else if (!data.signedIn) {
        parts.push(el('h3', '', t('spirit.adoptTitle')));
        for (const item of data.species) {
          const row = el('div', 'garden-shop-row spirit-adopt');
          row.append(spiritIcon(item.id), el('b', 'spirit-adopt-name', t(`spirit.species.${item.id}`)), el('span', 'spirit-price', `${item.price} 💎`));
          parts.push(row);
        }
      }
    }
    sheet.replaceChildren(...parts);
  }

  function open() {
    sheet.hidden = false;
    renaming = null;
    render();
    load();
  }

  function close() {
    sheet.hidden = true;
  }

  // Nút trong menu ⚙.
  const menuButton = el('button', 'chip');
  menuButton.type = 'button';
  const label = () => { menuButton.textContent = t('spirit.menu'); };
  label();
  menuButton.addEventListener('click', open);
  onLangChange(() => {
    label();
    render();
  });

  return { menuButton, open, close, refresh: load };
}
