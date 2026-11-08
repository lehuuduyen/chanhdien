// Vườn Công Đức ở trang chánh điện: tải 50 luống từ API, nhận cập nhật realtime (garden.plot), bảng thông tin luống
// (gieo / tưới / hái) và quầy hạt giống (ví xu ảo, mua hạt, bán / dâng quả, lịch sử). Mọi số liệu do server quyết định;
// mỗi thao tác gửi một Idempotency-Key riêng (gửi lại khi mạng lỗi dùng đúng khóa đó). Chữ người dùng (tên chủ luống)
// chỉ đưa ra bằng textContent.
import { onLangChange, t } from '/thien-i18n.js';

const ICONS = { apple: '🍎', orange: '🍊', peach: '🍑' };
const PLANT_ORDER = ['apple', 'orange', 'peach'];
const POLL_MS = 20_000;
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

// onCoins(n | null, ready): số xu trong ví vừa đổi (null = chưa đăng nhập) và số nhiệm vụ hằng ngày đã xong mà chưa
// nhận, để header luôn hiện số xu (kèm chấm báo có xu nhiệm vụ).
// Thứ tự nhiệm vụ hằng ngày (khớp DAILY_QUESTS của @chanh-dien/garden), dùng khi khách chưa có dữ liệu từ server.
const QUEST_ORDER = ['checkin', 'plant', 'water', 'harvest', 'offer', 'bodhi', 'lotus'];

export function createGardenUI({ stage, showToast, explore, account, openSignIn, onCoins }) {
  let plants = {};
  const plots = new Map();
  let me = null;
  let history = [];
  let busy = false;
  let pollTimer = null;

  const plantName = (type) => `${ICONS[type] || ''} ${t(`garden.plant.${type}`)}`;
  const mine = (crop) => Boolean(crop && me?.myCropIds?.includes(crop.id));
  // Quyền sở hữu chỉ có trong /garden/me; gắn cờ cục bộ trước khi đưa xuống bộ vẽ để cây của tài khoản hiện tại
  // có vòng sáng riêng. Server vẫn không cần công bố accountId của chủ luống trong snapshot chung.
  const viewPlot = (plot) => ({ ...plot, mine: mine(plot.crop) });
  const syncGardenView = (list = [...plots.values()]) => explore.setGarden?.(list.map(viewPlot));
  const canWater = (crop) => crop.nextWaterAt
    ? Boolean(crop.canWater) || Date.now() >= crop.nextWaterAt
    : (crop.canWater ?? !crop.wateredToday);
  const wilted = (crop) => crop.wilted ?? (crop.wiltsAt ? Date.now() > crop.wiltsAt : false);
  const waitText = (milliseconds) => {
    const minutes = Math.max(1, Math.ceil(Math.max(0, milliseconds) / MINUTE_MS));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? t('garden.timeHoursMinutes', { h: hours, m: rest }) : t('garden.timeMinutes', { m: rest });
  };

  // Nhãn trên luống (chữ ngắn, một dòng). Luống trống không có nhãn (50 luống, nhãn trống che hết vườn); biển số
  // cạnh luống và vòng sáng khi đứng gần đã đủ để chạm vào.
  function labelFor(plot) {
    const crop = plot.crop;
    if (!crop) return '';
    const progress = wilted(crop) ? '🥀' : crop.stage === 'fruiting' ? `${ICONS[crop.plantType]}×${crop.fruitsLeft}` : `💧${crop.waterDays}/${crop.waterNeeded}`;
    return `${plot.id} · ${plantName(crop.plantType)} · ${crop.ownerName} · ${progress}`;
  }

  // at: mốc thứ tự của API. Nhiều người thao tác cùng lúc thì tin realtime có thể tới lệch thứ tự, lần tải lại định kỳ
  // có thể cũ hơn tin vừa nhận: luống nào đã có dữ liệu mới hơn thì bỏ qua dữ liệu cũ.
  const plotAt = new Map();
  function applyPlots(list, at) {
    const fresh = list.filter((plot) => {
      if (!Number.isFinite(at)) return true;
      if ((plotAt.get(plot.id) ?? -1) > at) return false;
      plotAt.set(plot.id, at);
      return true;
    });
    for (const plot of fresh) plots.set(plot.id, plot);
    if (!fresh.length) return;
    syncGardenView(fresh);
    renderOpen();
  }

  async function load() {
    try {
      const response = await fetch('/api/v1/garden', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      plants = data.plants || plants;
      applyPlots(data.plots || [], data.at);
    } catch {}
  }

  async function loadMe() {
    if (!account()) {
      me = null;
      history = [];
      syncGardenView();
      renderOpen();
      return;
    }
    try {
      const response = await fetch('/api/v1/garden/me', { credentials: 'same-origin' });
      if (response.ok) ({ me, history } = await response.json());
    } catch {}
    syncGardenView();
    renderOpen();
  }

  // Thao tác: một khóa idempotency cho mỗi lần bấm; mạng lỗi thì thử lại một lần với đúng khóa đó.
  async function act(action, input) {
    if (busy) return null;
    if (!account()) {
      showToast(t('garden.signIn'));
      return null;
    }
    busy = true;
    renderOpen();
    const key = crypto.randomUUID();
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const response = await fetch(`/api/v1/garden/${action}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify(input),
        });
        result = await response.json();
      } catch {}
    }
    busy = false;
    if (!result) showToast(t('garden.err.NETWORK'));
    else {
      if (result.me) me = result.me;
      if (result.plots?.length) applyPlots(result.plots, result.at);
      if (!result.ok) {
        const known = t(`garden.err.${result.code}`);
        showToast(known === `garden.err.${result.code}` ? t('garden.err.GENERIC') : known);
      }
      if (result.ok && ['buy', 'sell', 'offer'].includes(action)) loadMe();
    }
    renderOpen();
    return result;
  }

  // ---- Thẻ luống (nổi ở đáy màn hình, vẫn thấy cây) và quầy hạt giống (bảng trượt toàn màn) ----
  const card = el('section', 'garden-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  const sheet = el('section', 'garden-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(card, sheet);
  let openPlotId = null;
  let shopOpen = false;
  let chosenSeed = null;
  let pendingAction = null;

  // Đăng nhập: đóng bảng vườn (để form đăng nhập không bị che), đăng nhập xong mở lại đúng bảng đang xem.
  let resumeAfterSignIn = null;
  function signInNote() {
    const note = el('div', 'garden-note');
    note.append(el('p', '', t('garden.signIn')), button('garden-main', t('garden.signInButton'), () => {
      resumeAfterSignIn = shopOpen ? { shop: true } : { plotId: openPlotId };
      close();
      openSignIn?.();
    }));
    return note;
  }

  // Nút chính: chữ "Đang…" khi đang gửi.
  function mainButton(text, action, onClick, disabled = false) {
    const node = button('garden-main', pendingAction === action ? t('garden.working') : text, async () => {
      pendingAction = action;
      await onClick();
      pendingAction = null;
      renderOpen();
    }, disabled || busy);
    return node;
  }

  function wateringBlock(crop, plot) {
    const ready = canWater(crop);
    const dry = wilted(crop);
    const nextWait = crop.nextWaterAt ? waitText(crop.nextWaterAt - Date.now()) : t('garden.timeHoursMinutes', { h: 8, m: 0 });
    const block = el('div', `garden-hydration${dry ? ' wilted' : ''}`);
    const status = dry
      ? t('garden.wilted')
      : ready ? t('garden.waterReady') : t('garden.nextWater', { time: nextWait });
    block.append(el('b', '', `${dry ? '🥀' : '💧'} ${status}`));
    if (!dry && crop.wiltsAt) block.append(el('span', '', t('garden.wiltsIn', { time: waitText(crop.wiltsAt - Date.now()) })));
    if (account()) {
      block.append(mainButton(ready ? `💧 ${t('garden.water')}` : `⏳ ${t('garden.waterAfter', { time: nextWait })}`, 'water', async () => {
        const result = await act('water', { plotId: plot.id });
        if (result?.ok) {
          explore.gardenEffect?.(plot.id, 'water');
          showToast(t(result.revived ? 'garden.revived' : result.counted ? 'garden.wateredCounted' : 'garden.watered'));
        }
      }, !ready));
    }
    return block;
  }

  // Bốn giai đoạn: Hạt → Mầm → Cây non → Ra quả.
  const STAGE_ICONS = { seed: '🌰', sprout: '🌱', young: '🌿', fruiting: '🍎' };
  function stepper(crop) {
    const order = ['seed', 'sprout', 'young', 'fruiting'];
    const current = order.indexOf(crop.stage);
    const wrap = el('ol', 'garden-steps');
    order.forEach((stage, index) => {
      const item = el('li', index < current ? 'done' : index === current ? 'now' : '');
      item.append(el('span', 'garden-step-icon', stage === 'fruiting' ? ICONS[crop.plantType] : STAGE_ICONS[stage]), el('span', 'garden-step-name', t(`garden.stage.${stage}`)));
      wrap.append(item);
    });
    return wrap;
  }

  function renderPlot() {
    const plot = plots.get(openPlotId) || { id: openPlotId, crop: null };
    const crop = plot.crop;
    const closeButton = button('social-close', '✕', close);
    closeButton.setAttribute('aria-label', t('social.close'));
    const head = el('div', 'garden-head');
    head.append(el('span', 'garden-badge', t('garden.plotTitle', { n: plot.id })));
    const parts = [closeButton, head];
    if (!crop) {
      head.append(el('b', 'garden-title', t('garden.emptyTitle')));
      parts.push(el('p', 'garden-sub', t('garden.emptyPlot')));
      if (!account()) {
        parts.push(signInNote());
        card.replaceChildren(...parts);
        return;
      }
      // Chọn một loại hạt (mỗi lần gieo 1 hạt).
      const seeds = el('div', 'garden-seeds');
      const owned = (type) => me?.seeds?.[type] || 0;
      if (!chosenSeed || !owned(chosenSeed)) chosenSeed = PLANT_ORDER.find((type) => owned(type) > 0) || null;
      for (const type of PLANT_ORDER) {
        const option = button(`garden-seed${chosenSeed === type ? ' chosen' : ''}`, '', () => {
          chosenSeed = type;
          renderPlot();
        }, !owned(type));
        option.append(el('span', 'garden-seed-icon', ICONS[type]), el('b', '', t(`garden.plant.${type}`)), el('span', 'garden-seed-count', owned(type) ? t('garden.haveSeeds', { n: owned(type) }) : t('garden.noSeed')));
        seeds.append(option);
      }
      parts.push(seeds);
      parts.push(mainButton(chosenSeed ? `🌱 ${t('garden.plantOne', { plant: t(`garden.plant.${chosenSeed}`) })}` : t('garden.pickSeed'), 'plant', async () => {
        const type = chosenSeed;
        const result = await act('plant', { plotId: plot.id, plantType: type });
        if (result?.ok) {
          explore.gardenEffect?.(plot.id, 'plant', type);
          showToast(t('garden.planted', { plant: plantName(type), n: plot.id }));
        }
      }, !chosenSeed));
      parts.push(button('garden-link', `🛒 ${t('garden.buyMore')}`, openShop));
      card.replaceChildren(...parts);
      return;
    }
    head.append(el('b', 'garden-title', plantName(crop.plantType)));
    parts.push(el('p', 'garden-sub', t('garden.grownBy', { name: crop.ownerName }) + (mine(crop) ? ` · ${t('garden.you')}` : '')));
    parts.push(stepper(crop));
    parts.push(wateringBlock(crop, plot));
    if (crop.stage !== 'fruiting') {
      // Ba giọt nước: số lần tưới đã tính cho quá trình lớn.
      const drops = el('div', 'garden-drops');
      for (let index = 0; index < crop.waterNeeded; index += 1) drops.append(el('span', index < crop.waterDays ? 'garden-drop full' : 'garden-drop', '💧'));
      const status = el('span', 'garden-drop-text', t('garden.watering', { n: crop.waterDays, total: crop.waterNeeded }));
      drops.append(status);
      parts.push(drops);
      if (!account()) parts.push(signInNote());
      else parts.push(el('p', 'garden-hint', t('garden.waterHint')));
    } else {
      // Quả: hàng icon, quả đã hái mờ đi.
      const fruits = el('div', 'garden-fruit-row');
      for (let index = 0; index < crop.fruitsTotal; index += 1) fruits.append(el('span', index < crop.fruitsLeft ? '' : 'picked', ICONS[crop.plantType]));
      parts.push(fruits, el('p', 'garden-sub', t('garden.fruitsLeft', { icon: '', n: crop.fruitsLeft, total: crop.fruitsTotal })));
      if (!account()) parts.push(signInNote());
      else {
        const taken = me?.harvested?.[crop.id] || 0;
        const left = mine(crop) ? crop.fruitsLeft : Math.max(0, 2 - taken);
        parts.push(mainButton(`🧺 ${mine(crop) ? t('garden.harvestAll', { n: crop.fruitsLeft }) : t('garden.harvestSome', { n: left })}`, 'harvest', async () => {
          const result = await act('harvest', { plotId: plot.id });
          if (result?.ok) {
            explore.gardenEffect?.(plot.id, 'harvest', crop.plantType);
            showToast(t('garden.harvested', { n: result.harvested, plant: plantName(result.plantType) }));
          }
        }, !left));
        if (!mine(crop)) parts.push(el('p', 'garden-hint', t('garden.visitorHint')));
      }
    }
    card.replaceChildren(...parts);
  }

  function renderShop() {
    const back = button('mala-back', `‹ ${t('mala.back')}`, close);
    const parts = [back, el('h2', '', t('garden.shop'))];
    if (!account()) {
      // Khách: vẫn thấy có những nhiệm vụ gì để biết đăng nhập sẽ được nhận xu.
      const questHead = el('h3', 'quest-head', `📜 ${t('quest.title')}`);
      parts.push(questHead, el('p', 'social-note', t('quest.signIn')));
      for (const id of QUEST_ORDER) {
        const row = el('div', 'garden-shop-row quest-row claimed');
        const text = el('div', 'friend-text');
        text.append(el('b', '', t(`quest.${id}`)), el('span', 'friend-sub', t(`quest.guide.${id}`)));
        row.append(text);
        parts.push(row);
      }
      parts.push(signInNote(), el('p', 'social-note', t('garden.pricesNote')));
      sheet.replaceChildren(...parts);
      if (scrollToQuests) questHead.scrollIntoView({ block: 'start' });
      scrollToQuests = false;
      return;
    }
    const wallet = el('div', 'garden-wallet');
    wallet.append(el('span', 'garden-coin', '🪙'), el('b', '', t('garden.coins', { n: me?.coins ?? '…' })), el('small', '', t('garden.coinNote')));
    parts.push(wallet);
    // Nhiệm vụ hằng ngày: server kiểm tra đã làm chưa; bấm Nhận để cộng xu (mỗi nhiệm vụ một lần mỗi ngày).
    let questHead = null;
    if (me?.quests?.length) {
      questHead = el('h3', 'quest-head', `📜 ${t('quest.title')}`);
      parts.push(questHead, el('p', 'social-note', t('quest.note')));
      for (const quest of me.quests) {
        const row = el('div', `garden-shop-row quest-row${quest.claimed ? ' claimed' : ''}`);
        const text = el('div', 'friend-text');
        text.append(
          el('b', '', t(`quest.${quest.id}`)),
          el('span', 'friend-sub', `${t(`quest.location.${quest.location}`)} · ${t(`quest.guide.${quest.id}`)}`),
          el('span', 'friend-sub quest-reward', t('garden.coins', { n: `+${quest.reward}` })),
        );
        const label = quest.claimed ? t('quest.claimed') : quest.done ? t('quest.claim', { n: quest.reward }) : t('quest.notDone');
        const controls = el('div', 'quest-actions');
        if (!quest.done) controls.append(button('chip quest-go', `📍 ${t('quest.go')}`, () => {
          close();
          if (explore.goTo?.(quest.location)) showToast(t('quest.going', { place: t(`quest.location.${quest.location}`) }));
        }));
        controls.append(button(`chip${quest.done && !quest.claimed ? ' primary' : ''}`, label, async () => {
          const result = await act('claim', { quest: quest.id });
          if (result?.ok) showToast(t('quest.got', { n: quest.reward, name: t(`quest.${quest.id}`) }));
        }, busy || !quest.done || quest.claimed));
        row.append(text, controls);
        parts.push(row);
      }
    }
    // Thu mua trái cây: có quả thì đưa lên trước phần mua hạt cho dễ thấy.
    const fruitSection = [el('h3', '', `🧺 ${t('garden.fruitStore')}`)];
    const seedSection = [el('h3', '', t('garden.buySeeds'))];
    const grid = el('div', 'garden-shop-grid');
    for (const type of PLANT_ORDER) {
      const price = plants[type]?.seedPrice;
      const item = el('div', 'garden-shop-card');
      item.append(el('span', 'garden-seed-icon', ICONS[type]), el('b', '', t(`garden.plant.${type}`)), el('span', 'garden-seed-count', t('garden.haveSeeds', { n: me?.seeds?.[type] || 0 })));
      item.append(button('garden-buy', t('garden.buyOne', { price }), () => act('buy', { plantType: type, quantity: 1 }), busy || (me && price > me.coins)));
      grid.append(item);
    }
    seedSection.push(grid);
    const fruitTypes = PLANT_ORDER.filter((type) => (me?.fruits?.[type] || 0) > 0);
    if (!fruitTypes.length) fruitSection.push(el('p', 'social-note', t('garden.noFruit')));
    for (const type of fruitTypes) {
      const count = me.fruits[type];
      const row = el('div', 'garden-shop-row');
      const text = el('div', 'friend-text');
      text.append(el('b', '', `${plantName(type)} ×${count}`), el('span', 'friend-sub', t('garden.fruitLine', { price: plants[type]?.fruitPrice })));
      row.append(
        text,
        button('chip', t('garden.sell', { n: 1 }), () => act('sell', { plantType: type, quantity: 1 }), busy),
        button('chip', t('garden.sellAll'), () => act('sell', { plantType: type, quantity: Math.min(count, 20) }), busy),
        button('chip primary', `🙏 ${t('garden.offer')}`, async () => {
          const result = await act('offer', { plantType: type, quantity: 1 });
          if (result?.ok) showToast(t('garden.offered', { plant: plantName(type) }));
        }, busy),
      );
      fruitSection.push(row);
    }
    parts.push(...(fruitTypes.length ? [...fruitSection, ...seedSection] : [...seedSection, ...fruitSection]));
    if (me?.offered) parts.push(el('p', 'social-note', t('garden.offeredTotal', { n: me.offered })));
    parts.push(el('h3', '', t('garden.history')));
    const list = el('div', 'garden-history');
    for (const item of history.slice(0, 10)) {
      const line = el('div', 'garden-history-row');
      line.append(
        el('span', '', t(`garden.tx.${item.kind}`, { plant: item.plantType ? plantName(item.plantType) : '', n: item.quantity || '' })),
        el('b', item.amount >= 0 ? 'plus' : 'minus', `${item.amount >= 0 ? '+' : ''}${item.amount}`),
      );
      list.append(line);
    }
    parts.push(list);
    sheet.replaceChildren(...parts);
    // Mở từ nút 📜 Nhiệm vụ: cuộn tới phần nhiệm vụ (chờ có dữ liệu ví nếu đang tải).
    if (scrollToQuests && questHead) {
      questHead.scrollIntoView({ block: 'start' });
      scrollToQuests = false;
    }
  }

  function renderOpen() {
    const quests = me?.quests || [];
    onCoins?.(me ? me.coins : null, quests.filter((item) => item.done && !item.claimed).length, {
      claimed: quests.filter((item) => item.claimed).length,
      total: quests.length,
    });
    if (!sheet.hidden && shopOpen) renderShop();
    else if (!card.hidden && openPlotId) renderPlot();
  }

  function openPlot(id) {
    shopOpen = false;
    sheet.hidden = true;
    openPlotId = id;
    card.hidden = false;
    renderPlot();
    loadMe();
  }
  let scrollToQuests = false;
  function openQuests() {
    scrollToQuests = true;
    openShop();
  }

  function openShop() {
    shopOpen = true;
    openPlotId = null;
    card.hidden = true;
    sheet.hidden = false;
    renderShop();
    loadMe();
  }
  function close() {
    sheet.hidden = true;
    card.hidden = true;
    shopOpen = false;
    openPlotId = null;
  }

  onLangChange(() => {
    explore.relabelGarden?.([...plots.values()]);
    renderOpen();
  });

  return {
    labelFor,
    onTap(target) {
      if (target.shop) openShop();
      else if (target.plotId) openPlot(target.plotId);
    },
    // Bắt đầu: tải vườn, tải lại định kỳ (bù khi chạy nhiều máy realtime hoặc vừa nối lại).
    start() {
      load();
      loadMe();
      clearInterval(pollTimer);
      pollTimer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    },
    // Mở quầy (ví xu, mua hạt, bán quả, lịch sử) — bấm ô xu trên header.
    openWallet() {
      openShop();
    },
    // Mở quầy ở phần Nhiệm vụ hôm nay — bấm nút 📜 trên header.
    openQuests,
    // Đọc lại số xu (vd: quay về từ phòng game).
    refreshCoins() {
      loadMe();
    },
    accountChanged() {
      loadMe();
      if (account() && resumeAfterSignIn) {
        const target = resumeAfterSignIn;
        resumeAfterSignIn = null;
        if (target.shop) openShop();
        else if (target.plotId) openPlot(target.plotId);
      }
      renderOpen();
    },
    onMessage(message) {
      if (message.type !== 'garden.plot') return false;
      applyPlots(message.plots, message.at);
      const effect = message.effect;
      // Hiệu ứng của người khác (của mình đã chạy lúc bấm).
      if (effect && !(account() && effect.by === account().displayName)) {
        const crop = message.plots.find((plot) => plot.id === effect.plotId)?.crop;
        explore.gardenEffect?.(effect.plotId, effect.kind, crop?.plantType);
      }
      return true;
    },
  };
}
