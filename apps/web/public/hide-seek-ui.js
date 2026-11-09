// Trốn tìm trong sân chánh điện (giao diện). Server (apps/realtime/hide-seek.mjs) giữ ván, vai, đồng hồ và lọc ai thấy
// ai; trang chỉ hiện trạng thái và khóa / mở đi lại cho khớp:
//   - Nút "🙈 Trốn tìm" trên thanh phòng: mở bảng luật, người đang chờ / đang chơi, nút Tham gia / Rời.
//   - Phòng chờ chung: bấm Tham gia là ra giữa sân (server dịch chuyển); thẻ góc phải liệt kê ai đang chờ + giờ bắt đầu.
//   - Bắt đầu: thẻ lớn báo vai của mình (người đi tìm / người trốn). Người đi tìm có tên đỏ 🔍 và vòng đỏ dưới chân
//     (mọi người đều thấy).
//   - Người đi tìm lúc đi trốn: màn đen đếm ngược kèm danh sách những người sẽ phải tìm (server cũng không gửi vị trí).
//   - Lúc đi tìm: thẻ góc phải ghi rõ cần tìm ai (ai đã bị bắt thì gạch); người trốn thấy người đi tìm là ai.
//   - Người trốn lúc đi tìm, người đã bị bắt: đứng yên / xem camera người khác (◀ ▶).
//   - Người đi tìm chạm vào người trốn (trong 3 m) để bắt.
// Tên người chơi chỉ đưa ra màn hình qua textContent.
const MAX_CHIPS = 8;
const REVEAL_MS = 4_500;

export function createHideSeekUI({ stage, host, session, explore, showToast, t, onLangChange, onCoins }) {
  let state = null;
  let seenCatchAt = 0;
  let watchId = null;
  let lastPhase = null;
  let lastRound = 0;
  let revealUntil = 0;

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
  const inLobby = () => Boolean(state?.lobby.some((person) => person.id === me()));
  const clock = () => {
    if (!state?.endsAt) return '';
    const left = Math.max(0, Math.ceil((state.endsAt - session.serverNow()) / 1_000));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };
  const seekers = () => state?.players.filter((player) => player.role === 'seeker') || [];
  const hiders = () => state?.players.filter((player) => player.role === 'hider') || [];
  // Hàng chờ: server đang đếm ngược (đủ người, hoặc có người dạo sân vào chơi cùng) thì hiện giờ bắt đầu.
  const lobbyText = () => (state?.endsAt
    ? t('hs.startsIn', { time: clock() })
    : t('hs.needMore', { n: Math.max(1, state.minPlayers - state.lobby.length) }));

  // Danh sách tên dạng thẻ nhỏ: người đi tìm đỏ, người đã bị bắt gạch ngang, mình in đậm. Quá nhiều thì "+N".
  function chips(list, { label = '' } = {}) {
    const box = el('div', 'hs-people');
    if (label) box.append(el('span', 'hs-people-label', label));
    for (const person of list.slice(0, MAX_CHIPS)) {
      const classes = ['hs-person'];
      if (person.role === 'seeker') classes.push('seeker');
      if (person.caught) classes.push('caught');
      if (person.id === me()) classes.push('me');
      box.append(el('span', classes.join(' '), `${person.role === 'seeker' ? '🔍 ' : person.caught ? '✓ ' : ''}${person.displayName}`));
    }
    if (list.length > MAX_CHIPS) box.append(el('span', 'hs-person more', t('hs.more', { n: list.length - MAX_CHIPS })));
    return box;
  }

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

  // ---- Thẻ trạng thái, thẻ báo vai, màn đen, xem camera, kết quả ----
  const hud = el('div', 'hs-hud');
  hud.hidden = true;
  const blind = el('div', 'hs-blind');
  blind.hidden = true;
  const reveal = el('div', 'hs-reveal');
  reveal.hidden = true;
  reveal.addEventListener('click', () => { revealUntil = 0; reveal.hidden = true; });
  const watch = el('div', 'hs-watch');
  watch.hidden = true;
  const watchName = el('span', 'hs-watch-name');
  const watchPrev = button('chip', '◀', () => cycleWatch(-1));
  const watchNext = button('chip', '▶', () => cycleWatch(1));
  const watchSelf = button('chip', '', () => setWatch(null));
  watch.append(watchPrev, watchName, watchNext, watchSelf);
  const result = el('div', 'hs-result');
  result.hidden = true;
  stage.append(hud, blind, watch, result, reveal);

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
    const player = myPlayer();
    if (active() || state?.phase === 'result') {
      parts.push(el('h3', 'hs-sub', t('hs.inRound', { n: state.players.length })));
      const list = el('ul', 'hs-list');
      for (const item of state.players) {
        const row = el('li', `${item.caught ? 'caught' : ''} ${item.role === 'seeker' ? 'seeker' : ''}`.trim());
        row.append(el('span', '', item.displayName), el('small', '', item.role === 'seeker' ? t('hs.roleSeeker') : item.caught ? t('hs.caught') : t('hs.roleHider')));
        list.append(row);
      }
      parts.push(list);
    }
    parts.push(el('h3', 'hs-sub', t('hs.waiting', { n: queued.length })));
    if (queued.length) {
      const list = el('ul', 'hs-list');
      for (const item of queued) list.append(el('li', item.id === me() ? 'me' : '', item.displayName));
      parts.push(list);
    }
    if (state?.phase === 'lobby') parts.push(el('p', 'hs-status', lobbyText()));
    if (player && active()) parts.push(button('primary hs-action danger', t('hs.leaveRound'), () => { send('hideseek.leave'); openSheet(false); }));
    else if (inLobby()) parts.push(button('primary hs-action', t('hs.leave'), () => send('hideseek.leave')));
    else parts.push(button('primary hs-action', t('hs.join'), () => {
      if (send('hideseek.join')) {
        if (active()) showToast(t('hs.queued'));
        else openSheet(false);
      }
    }));
    card.replaceChildren(...parts);
  }

  // ---- Xem camera người khác ----
  function watchable() {
    if (!state || !active()) return [];
    const visible = new Set(explore.visibleIds());
    // Người đi tìm trước, rồi người trốn còn lại; chỉ người đang có trong cảnh của mình (server đã lọc).
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
  // Ai được xem camera người khác: người trốn đang đứng yên và người đã bị bắt (người ngoài không bị làm phiền).
  function canWatch() {
    const player = myPlayer();
    return state?.phase === 'seeking' && player?.role === 'hider';
  }
  function renderWatch() {
    const show = canWatch() && Date.now() >= revealUntil;
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

  // ---- Thẻ trạng thái (góc phải): vai + đồng hồ, ai là ai, gợi ý ----
  // Chỉ dựng lại khi có người vào / ra / đổi vai / bị bắt; mỗi nhịp chỉ đổi chữ có đồng hồ (nút Rời không bị thay
  // giữa lúc đang bấm).
  let hudKey = null;
  let dynamic = [];
  const live = (node, text) => {
    dynamic.push([node, text]);
    node.textContent = text();
    return node;
  };
  function buildHud() {
    dynamic = [];
    const player = myPlayer();
    const left = () => hiders().filter((item) => !item.caught).length;
    const total = () => hiders().length;
    const parts = [];
    let tone = '';
    if (state?.phase === 'lobby' && inLobby()) {
      tone = 'lobby';
      parts.push(el('b', 'hs-hud-main', t('hs.lobbyTitle', { n: state.lobby.length })));
      parts.push(live(el('span', 'hs-hud-time'), lobbyText));
      parts.push(chips(state.lobby));
      parts.push(el('small', 'hs-hud-hint', t('hs.lobbyHint')));
      parts.push(button('chip hs-hud-action', t('hs.leaveShort'), () => send('hideseek.leave')));
    } else if (state?.phase === 'hiding' && player?.role === 'hider') {
      tone = 'hider';
      parts.push(live(el('b', 'hs-hud-main'), () => t('hs.hudHider', { time: clock() })));
      parts.push(chips(seekers(), { label: t('hs.seekersAre') }));
      parts.push(el('small', 'hs-hud-hint', t('hs.hideHint')));
    } else if (state?.phase === 'seeking' && player?.role === 'seeker') {
      tone = 'seeker';
      parts.push(live(el('b', 'hs-hud-main'), () => t('hs.hudSeek', { left: left(), total: total(), time: clock() })));
      parts.push(chips(hiders(), { label: t('hs.findList', { left: left(), total: total() }) }));
      parts.push(el('small', 'hs-hud-hint', t('hs.tapHint')));
    } else if (state?.phase === 'seeking' && player) {
      tone = player.caught ? 'caught' : 'hider';
      parts.push(live(el('b', 'hs-hud-main'), () => (player.caught
        ? t('hs.hudCaught', { time: clock() })
        : t('hs.hudFrozen', { left: left(), total: total(), time: clock() }))));
      parts.push(chips(seekers(), { label: t('hs.seekersAre') }));
      parts.push(chips(hiders(), { label: t('hs.hidersLeft', { left: left(), total: total() }) }));
      if (!player.caught) parts.push(el('small', 'hs-hud-hint', t('hs.frozenHint')));
    } else if (active() && !player) {
      // Người ngoài: chỉ một dòng nhỏ, không che màn hình.
      tone = 'outside';
      parts.push(live(el('b', 'hs-hud-main'), () => t('hs.hudOutside', { time: clock() })));
      parts.push(el('small', 'hs-hud-hint', inLobby() ? t('hs.queuedHint') : t('hs.outsideHint')));
    }
    hud.className = `hs-hud${tone ? ` ${tone}` : ''}`;
    hud.replaceChildren(...parts);

    // Người đi tìm lúc đi trốn: màn đen + đồng hồ + danh sách người sẽ phải tìm.
    const blinded = state?.phase === 'hiding' && player?.role === 'seeker';
    blind.hidden = !blinded;
    if (blinded) {
      blind.replaceChildren(
        el('h2', '', t('hs.youAreSeeker')),
        live(el('b', 'hs-blind-time'), clock),
        el('p', '', t('hs.blindText')),
        el('p', 'hs-blind-sub', t('hs.blindFind')),
        chips(hiders()),
      );
    }
  }
  function renderHud(force = false) {
    const player = myPlayer();
    const key = JSON.stringify([state?.phase, state?.round, state?.lobby, state?.players, Boolean(state?.endsAt), player?.role, inLobby()]);
    if (force || key !== hudKey) {
      hudKey = key;
      buildHud();
    }
    for (const [node, text] of dynamic) {
      const value = text();
      if (node.textContent !== value) node.textContent = value;
    }
    // Thẻ báo vai đang hiện thì tạm ẩn thẻ góc phải (khỏi chồng lên nhau).
    hud.hidden = !hud.childElementCount || Date.now() < revealUntil;
    if (state?.phase === 'lobby' && !sheet.hidden) {
      const status = sheet.querySelector('.hs-status');
      if (status) status.textContent = lobbyText();
    }
    if (revealUntil && Date.now() >= revealUntil) {
      revealUntil = 0;
      reveal.hidden = true;
      renderWatch();
    }
  }

  // Thẻ lớn lúc bắt đầu ván (người trốn): bạn là ai, người đi tìm là ai. Người đi tìm đã có màn đen ghi rõ vai.
  function showReveal() {
    const player = myPlayer();
    if (!player || player.role !== 'hider') return;
    reveal.className = 'hs-reveal hider';
    reveal.replaceChildren(
      el('h2', '', t('hs.youAreHider')),
      chips(seekers(), { label: t('hs.seekersAre') }),
      el('p', '', t('hs.revealHider')),
    );
    reveal.hidden = false;
    revealUntil = Date.now() + REVEAL_MS;
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
    result.replaceChildren(el('b', '', title), ...(mine ? [el('span', '', mine)] : []), chips(state.players), el('small', '', t('hs.nextRound')));
    result.hidden = false;
  }

  // Khóa đi lại + ẩn tên người trốn + tô đỏ người đi tìm theo pha / vai (server cũng chặn, đây là để giao diện khớp).
  function applyLocks() {
    const player = myPlayer();
    const locked = active() && Boolean(player) && (state.phase === 'hiding' ? player.role === 'seeker' : player.role === 'hider');
    explore.setGameLock(locked);
    explore.setHiddenDecor(active() ? hiders().map((item) => item.id) : []);
    explore.setRoleMarks?.(active() || state?.phase === 'result' ? Object.fromEntries(seekers().map((item) => [item.id, 'seeker'])) : {});
  }

  function onState(message) {
    const previous = state;
    state = message;
    const player = myPlayer();
    if (message.phase !== lastPhase || message.round !== lastRound) {
      if (message.phase === 'hiding' && player) {
        openSheet(false);
        // Vừa vào phòng / nối lại giữa ván thì không hiện lại thẻ báo vai.
        if (previous) showReveal();
        else showToast(t('hs.started', { role: player.role === 'seeker' ? t('hs.roleSeeker') : t('hs.roleHider') }));
      }
      if (message.phase === 'seeking' && player?.role === 'seeker') showToast(t('hs.goSeek'));
      if (!active()) {
        revealUntil = 0;
        reveal.hidden = true;
        if (watchId) setWatch(null);
      }
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

  // Người đi tìm chạm vào một người: đang đi tìm và người đó là người trốn chưa bị bắt thì bắt (server đo khoảng cách).
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

  // Mình đang trong ván (đi tìm / đi trốn / đã bị bắt).
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
    revealUntil = 0;
    if (watchId) setWatch(null);
    explore.setGameLock(false);
    explore.setHiddenDecor([]);
    explore.setRoleMarks?.({});
    hud.hidden = true;
    blind.hidden = true;
    watch.hidden = true;
    result.hidden = true;
    reveal.hidden = true;
    hudKey = null;
    dynamic = [];
    renderChip();
    renderSheet();
  }

  setInterval(() => {
    if (!state || state.phase === 'idle') return;
    renderHud();
    // Người trong cảnh đổi (người bị bắt biến mất…): cập nhật danh sách xem.
    if (canWatch()) renderWatch();
  }, 500);
  onLangChange?.(() => {
    renderChip();
    renderSheet();
    renderHud(true);
    renderWatch();
    renderResult();
  });
  renderChip();

  return { chip, onState, onReward, handleTap, onError, reset, inRound };
}
