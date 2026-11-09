// Trốn tìm trong sân chánh điện (giao diện). Server (apps/realtime/hide-seek.mjs) giữ ván, vai, đồng hồ và lọc ai thấy
// ai; trang chỉ hiện trạng thái và khóa / mở đi lại cho khớp:
//   - Nút "🙈 Trốn tìm" trên thanh phòng: mở bảng luật, người đang chờ / đang chơi, nút Tham gia / Rời.
//   - Thanh trạng thái giữa trên: vai của mình, đồng hồ, số người trốn còn lại.
//   - Người đi kiếm lúc đi trốn: màn đen đếm ngược (server cũng không gửi vị trí người trốn).
//   - Người trốn lúc đi kiếm, người đã bị bắt, người ngoài: đứng yên / xem camera người khác (◀ ▶).
//   - Người đi kiếm chạm vào người trốn (trong 3 m) để bắt.
// Tên người chơi chỉ đưa ra màn hình qua textContent.
export function createHideSeekUI({ stage, host, session, explore, showToast, t, onLangChange, onCoins }) {
  let state = null;
  let seenCatchAt = 0;
  let watchId = null;
  let lastPhase = null;
  let lastRound = 0;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, onClick) => {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  const send = (type, body = {}) => session.send({ type, requestId: `hideseek-${crypto.randomUUID()}`, ...body });
  const me = () => session.participantId;
  const myPlayer = () => state?.players.find((player) => player.id === me()) || null;
  const active = () => state?.phase === 'hiding' || state?.phase === 'seeking';
  const clock = () => {
    if (!state?.endsAt) return '';
    const left = Math.max(0, Math.ceil((state.endsAt - session.serverNow()) / 1_000));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };
  const hiders = () => state?.players.filter((player) => player.role === 'hider') || [];
  // Hàng chờ: server đang đếm ngược (đủ người, hoặc có người dạo sân vào chơi cùng) thì hiện giờ bắt đầu.
  const lobbyText = () => (state?.endsAt
    ? t('hs.startsIn', { time: clock() })
    : t('hs.needMore', { n: Math.max(1, state.minPlayers - state.lobby.length) }));

  // ---- Nút trên thanh phòng ----
  const chip = button('chip hs-chip', '', () => openSheet(true));
  host.append(chip);

  // ---- Bảng luật / danh sách ----
  const sheet = el('div', 'ledger hs-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const card = el('div', 'ledger-card hs-card');
  sheet.append(card);
  sheet.addEventListener('click', (event) => { if (event.target === sheet) openSheet(false); });
  stage.append(sheet);
  function openSheet(on) {
    sheet.hidden = !on;
    if (on) renderSheet();
  }

  // ---- Thanh trạng thái, màn đen, xem camera, kết quả ----
  const hud = el('div', 'hs-hud');
  hud.hidden = true;
  const hudMain = el('b', 'hs-hud-main');
  const hudHint = el('small', 'hs-hud-hint');
  hud.append(hudMain, hudHint);
  const blind = el('div', 'hs-blind');
  blind.hidden = true;
  const blindTitle = el('h2');
  const blindTime = el('b', 'hs-blind-time');
  const blindText = el('p');
  blind.append(blindTitle, blindTime, blindText);
  const watch = el('div', 'hs-watch');
  watch.hidden = true;
  const watchName = el('span', 'hs-watch-name');
  const watchPrev = button('chip', '◀', () => cycleWatch(-1));
  const watchNext = button('chip', '▶', () => cycleWatch(1));
  const watchSelf = button('chip', '', () => setWatch(null));
  watch.append(watchPrev, watchName, watchNext, watchSelf);
  const result = el('div', 'hs-result');
  result.hidden = true;
  stage.append(hud, blind, watch, result);

  function renderChip() {
    const count = active() || state?.phase === 'result' ? state.players.length : state?.lobby.length || 0;
    chip.textContent = count ? t('hs.chipCount', { n: count }) : t('hs.chip');
    chip.classList.toggle('on', Boolean(count));
  }

  function renderSheet() {
    if (sheet.hidden) return;
    const header = el('header');
    header.append(el('h2', '', t('hs.title')), button('chip', '✕', () => openSheet(false)));
    const parts = [header, el('p', 'ledger-note', t('hs.rules'))];
    const queued = state?.lobby || [];
    const inLobby = queued.some((person) => person.id === me());
    const player = myPlayer();
    if (active() || state?.phase === 'result') {
      parts.push(el('h3', 'hs-sub', t('hs.inRound', { n: state.players.length })));
      const list = el('ul', 'hs-list');
      for (const item of state.players) {
        const row = el('li', item.caught ? 'caught' : '');
        row.append(el('span', '', item.displayName), el('small', '', item.role === 'seeker' ? t('hs.roleSeeker') : item.caught ? t('hs.caught') : t('hs.roleHider')));
        list.append(row);
      }
      parts.push(list);
    }
    parts.push(el('h3', 'hs-sub', t('hs.waiting', { n: queued.length })));
    if (queued.length) {
      const list = el('ul', 'hs-list');
      for (const item of queued) list.append(el('li', '', item.displayName));
      parts.push(list);
    }
    if (state?.phase === 'lobby') parts.push(el('p', 'hs-status', lobbyText()));
    if (player && active()) parts.push(button('primary hs-action danger', t('hs.leaveRound'), () => { send('hideseek.leave'); openSheet(false); }));
    else if (inLobby) parts.push(button('primary hs-action', t('hs.leave'), () => send('hideseek.leave')));
    else parts.push(button('primary hs-action', t('hs.join'), () => {
      if (send('hideseek.join') && active()) showToast(t('hs.queued'));
    }));
    card.replaceChildren(...parts);
  }

  // ---- Xem camera người khác ----
  function watchable() {
    if (!state || !active()) return [];
    const visible = new Set(explore.visibleIds());
    // Người đi kiếm trước, rồi người trốn còn lại; chỉ người đang có trong cảnh của mình (server đã lọc).
    const order = [...state.players].sort((a, b) => (a.role === b.role ? 0 : a.role === 'seeker' ? -1 : 1));
    return order.filter((player) => player.id !== me() && !player.caught && visible.has(player.id));
  }
  function setWatch(id) {
    watchId = id && explore.setCameraFollow(id) ? id : null;
    if (!watchId) explore.setCameraFollow(null);
    renderWatch();
  }
  function cycleWatch(step) {
    const list = watchable();
    if (!list.length) return setWatch(null);
    const index = list.findIndex((player) => player.id === watchId);
    setWatch(list[(index + step + list.length) % list.length].id);
  }
  // Ai được xem camera người khác: người trốn đang đứng yên, người đã bị bắt, người ngoài khi đang có ván.
  function canWatch() {
    const player = myPlayer();
    if (!active()) return false;
    if (!player) return true;
    return state.phase === 'seeking' && player.role === 'hider';
  }
  function renderWatch() {
    const show = canWatch();
    watch.hidden = !show;
    if (!show) {
      if (watchId) setWatch(null);
      return;
    }
    if (watchId && !watchable().some((player) => player.id === watchId)) {
      watchId = null;
      explore.setCameraFollow(null);
    }
    const target = state.players.find((player) => player.id === watchId);
    watchName.textContent = target ? t('hs.watching', { name: target.displayName }) : t('hs.watchHint');
    watchSelf.textContent = t('hs.watchSelf');
    watchSelf.hidden = !watchId;
  }

  // ---- Trạng thái mỗi nhịp ----
  function renderHud() {
    const player = myPlayer();
    const left = hiders().filter((item) => !item.caught).length;
    const total = hiders().length;
    let main = '';
    let hint = '';
    if (state?.phase === 'lobby' && state.lobby.some((person) => person.id === me())) {
      main = `🙈 ${lobbyText()}`;
    } else if (state?.phase === 'hiding') {
      if (player?.role === 'hider') {
        main = t('hs.hudHide', { time: clock() });
        hint = t('hs.hideHint');
      } else if (!player) main = t('hs.hudOutside', { time: clock() });
    } else if (state?.phase === 'seeking') {
      if (player?.role === 'seeker') {
        main = t('hs.hudSeek', { left, total, time: clock() });
        hint = t('hs.tapHint');
      } else if (player?.caught) main = t('hs.hudCaught', { time: clock() });
      else if (player) {
        main = t('hs.hudFrozen', { left, total, time: clock() });
        hint = t('hs.frozenHint');
      } else main = t('hs.hudOutside', { time: clock() });
    }
    hud.hidden = !main;
    hudMain.textContent = main;
    hudHint.textContent = hint;
    hudHint.hidden = !hint;
    const blinded = state?.phase === 'hiding' && player?.role === 'seeker';
    blind.hidden = !blinded;
    if (blinded) {
      blindTitle.textContent = t('hs.blindTitle');
      blindTime.textContent = clock();
      blindText.textContent = t('hs.blindText');
    }
    if (state?.phase === 'lobby' && !sheet.hidden) {
      const status = sheet.querySelector('.hs-status');
      if (status) status.textContent = lobbyText();
    }
  }

  function renderResult() {
    if (state?.phase !== 'result') {
      result.hidden = true;
      return;
    }
    const player = myPlayer();
    const title = state.winner === 'seekers' ? t('hs.winSeekers') : state.winner === 'hiders' ? t('hs.winHiders') : t('hs.winNone');
    const mine = player && state.winner !== 'none'
      ? ((state.winner === 'seekers') === (player.role === 'seeker') ? t('hs.youWin') : t('hs.youLose'))
      : '';
    result.replaceChildren(el('b', '', title), ...(mine ? [el('span', '', mine)] : []), el('small', '', t('hs.nextRound')));
    result.hidden = false;
  }

  // Khóa đi lại + ẩn tên người trốn theo pha / vai (server cũng chặn, đây là để giao diện khớp).
  function applyLocks() {
    const player = myPlayer();
    const locked = active() && Boolean(player) && (state.phase === 'hiding' ? player.role === 'seeker' : player.role === 'hider');
    explore.setGameLock(locked);
    explore.setHiddenDecor(active() ? hiders().map((item) => item.id) : []);
  }

  function onState(message) {
    const previous = state;
    state = message;
    const player = myPlayer();
    if (message.phase !== lastPhase || message.round !== lastRound) {
      if (message.phase === 'hiding' && player) {
        openSheet(false);
        showToast(t('hs.started', { role: player.role === 'seeker' ? t('hs.roleSeeker') : t('hs.roleHider') }));
      }
      if (message.phase === 'seeking' && player?.role === 'seeker') showToast(t('hs.goSeek'));
      if (!active() && watchId) setWatch(null);
      lastPhase = message.phase;
      lastRound = message.round;
    }
    // Lần bắt mới (không báo lại lần bắt cũ khi vừa vào phòng / nối lại giữa ván).
    if (message.lastCatch && message.lastCatch.at !== seenCatchAt && !previous) seenCatchAt = message.lastCatch.at;
    if (message.lastCatch && message.lastCatch.at !== seenCatchAt) {
      seenCatchAt = message.lastCatch.at;
      const name = (id) => message.players.find((item) => item.id === id)?.displayName || '';
      if (message.lastCatch.hiderId === me()) showToast(t('hs.youCaught', { seeker: name(message.lastCatch.seekerId) }));
      else showToast(t('hs.catchToast', { seeker: name(message.lastCatch.seekerId), hider: name(message.lastCatch.hiderId) }));
      navigator.vibrate?.(60);
    }
    if (previous?.phase !== 'result' && message.phase === 'result') navigator.vibrate?.([60, 40, 60]);
    applyLocks();
    renderChip();
    renderSheet();
    renderHud();
    renderWatch();
    renderResult();
  }

  // Người đi kiếm chạm vào một người: đang đi kiếm và người đó là người trốn chưa bị bắt thì bắt (server đo khoảng cách).
  function handleTap(id) {
    const player = myPlayer();
    if (state?.phase !== 'seeking' || player?.role !== 'seeker') return false;
    const target = state.players.find((item) => item.id === id);
    if (target?.role !== 'hider' || target.caught) return false;
    send('hideseek.catch', { targetId: id });
    return true;
  }

  // Thắng được thưởng xu (đã đủ lần trong ngày thì reward 0).
  function onReward(message) {
    showToast(message.reward ? t('hs.reward', { coins: message.reward, count: message.count, limit: message.limit }) : t('hs.rewardLimit', { limit: message.limit }));
    onCoins?.(message.coins);
  }

  // Mình đang trong ván (đi kiếm / đi trốn / đã bị bắt).
  function inRound() {
    return active() && Boolean(myPlayer());
  }

  function onError(message) {
    if (!message.requestId?.startsWith('hideseek-')) return false;
    showToast(t(`hs.err.${message.code}`) !== `hs.err.${message.code}` ? t(`hs.err.${message.code}`) : message.message);
    return true;
  }

  // Kết nối mới (đổi phòng, nối lại): bỏ trạng thái cũ; server gửi lại nếu phòng đang có ván.
  function reset() {
    state = null;
    lastPhase = null;
    if (watchId) setWatch(null);
    explore.setGameLock(false);
    explore.setHiddenDecor([]);
    hud.hidden = true;
    blind.hidden = true;
    watch.hidden = true;
    result.hidden = true;
    renderChip();
    renderSheet();
  }

  setInterval(() => {
    if (!state || state.phase === 'idle') return;
    renderHud();
    // Người trong cảnh đổi (người bị bắt biến mất…): cập nhật danh sách xem.
    if (canWatch()) renderWatch();
  }, 250);
  onLangChange?.(() => {
    renderChip();
    renderSheet();
    renderHud();
    renderWatch();
    renderResult();
  });
  renderChip();

  return { chip, onState, onReward, handleTap, onError, reset, inRound };
}
