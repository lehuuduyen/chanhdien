// Game Bấm Giờ ở chánh điện (nút "⏱ Bấm giờ" ngay dưới Trốn tìm trên thanh phòng; chơi được cả trong điện lẫn ngoài
// sân, thẻ nổi phía dưới màn hình, không che kín cảnh). Server (apps/api/stopwatch.mjs) ra đề 00:01–10:00, kiểm tra thời
// gian và lưu lịch sử; trang đo thời gian bằng mốc của chính lần chạm (event.timeStamp) nên chính xác tới 1/100 giây.
//   - Mọi cấp phải dừng đúng mục tiêu (lệch 0,00 s mới trúng). Năm cấp (STOPWATCH trong room rules): đồng hồ tắt sớm dần
//     trước mục tiêu (đếm thầm), cấp 5 ẩn từ đầu. Cấp sau mở khi đã trúng cấp trước; khách chỉ chơi thử cấp 1, không lưu.
//   - Không thưởng xu: chỉ lịch sử bấm trúng của mình và Bảng vàng (người bấm trúng gần đây).
// Tên người khác chỉ đưa ra màn hình qua textContent.
import { STOPWATCH } from '/shared/room-rules.mjs';

const LEVEL_KEY = 'thien-stopwatch-level';
// Trượt trong khoảng này (phần trăm giây) thì báo "Suýt trúng".
const ALMOST = 3;

export function createStopwatchUI({ stage, host, controls, t, onLangChange, locale, account, openSignIn, showToast }) {
  let open = false;
  let view = null;
  let level = 1;
  let round = null;
  let phase = 'idle'; // idle | loading | ready | running | checking | done | error
  let startedAt = 0;
  let startRequest = null;
  let result = null;
  let tab = 'play';
  let frame = 0;
  let request = 0;
  let next = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, onClick) => {
    const node = el('button', className, text);
    node.type = 'button';
    if (onClick) node.addEventListener('click', onClick);
    return node;
  };
  const clock = (cs) => `${String(Math.floor(cs / 100)).padStart(2, '0')}:${String(cs % 100).padStart(2, '0')}`;
  const seconds = (cs, sign = false) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: sign ? 'exceptZero' : 'auto' }).format(cs / 100);
  const levelInfo = (id) => STOPWATCH.levels.find((item) => item.id === id);
  const unlocked = () => view?.me?.unlocked || 1;
  const statsOf = (id) => view?.me?.stats?.find((item) => item.level === id) || { plays: 0, hits: 0 };
  const when = (at) => new Date(at).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function api(path, body) {
    const response = await fetch(`/api/v1/stopwatch${path}`, body === undefined
      ? { cache: 'no-store', credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { ok: response.ok && data?.ok !== false, status: response.status, data };
  }

  // ---- Nút trên thanh phòng ----
  const chip = button('chip sw-chip', '', () => setOpen(!open));
  host.append(chip);

  // ---- Thẻ chơi ----
  const card = el('section', 'sw-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  const head = el('header', 'sw-head');
  const title = el('b', 'sw-title');
  const tabButton = button('chip sw-tab', '', () => {
    tab = tab === 'play' ? 'history' : 'play';
    render();
  });
  const close = button('chip sw-close', '✕', () => setOpen(false));
  head.append(title, tabButton, close);
  const levels = el('div', 'sw-levels');
  levels.setAttribute('role', 'group');
  const rule = el('p', 'sw-rule');
  const board = el('div', 'sw-board');
  const targetBox = el('div', 'sw-box');
  const targetLabel = el('small', '');
  const targetValue = el('b', 'sw-target');
  targetBox.append(targetLabel, targetValue);
  const clockBox = el('div', 'sw-box');
  const clockLabel = el('small', '');
  const clockValue = el('b', 'sw-clock');
  clockBox.append(clockLabel, clockValue);
  board.append(targetBox, clockBox);
  // Bắt đầu / Dừng tính ở pointerdown (không chờ nhấc tay) và lấy mốc của chính lần chạm.
  const main = button('sw-main', '');
  const message = el('p', 'sw-message');
  message.setAttribute('aria-live', 'polite');
  const stats = el('p', 'sw-stats');
  const guest = el('div', 'sw-guest');
  const play = el('div', 'sw-play');
  play.append(levels, rule, board, main, message, stats, guest);
  const history = el('div', 'sw-history');
  card.append(head, play, history);
  stage.append(card);
  const wide = matchMedia('(min-aspect-ratio: 1/1)');
  wide.addEventListener('change', () => { if (open) place(); });

  function place() {
    // Ngay trên thanh chat / nút hành động. Màn rộng khi 3D: thẻ ở cột phải, đáy màn (chanh-dien.css, khối "Màn rộng").
    if (wide.matches && stage.classList.contains('view-3d')) {
      card.style.bottom = '';
      return;
    }
    const stageBox = stage.getBoundingClientRect();
    const bottom = controls && !controls.hidden ? stageBox.bottom - controls.getBoundingClientRect().top + 8 : 12;
    card.style.bottom = `${Math.max(12, Math.round(bottom))}px`;
  }

  async function setOpen(next) {
    open = next;
    card.hidden = !open;
    stage.classList.toggle('sw-open', open);
    if (!open) {
      cancelAnimationFrame(frame);
      if (phase === 'running') phase = 'idle';
      render();
      return;
    }
    tab = 'play';
    place();
    render();
    await refresh();
    if (!round || phase === 'idle' || phase === 'error') newRound();
  }

  async function refresh() {
    const response = await api('').catch(() => null);
    if (!response?.ok) return;
    const first = !view;
    view = response.data;
    // Chọn cấp lúc mới mở (cấp đã chọn lần trước, không có thì cấp cao nhất đã mở); sau đó chỉ người chơi đổi cấp
    // (vừa mở cấp mới thì có thông báo, màn kết quả vẫn là lượt vừa chơi).
    if (first || level > unlocked()) {
      let saved = 0;
      try { saved = Number(localStorage.getItem(LEVEL_KEY)); } catch {}
      if (!Number.isSafeInteger(saved) || saved < 1) saved = unlocked();
      if (phase !== 'running' && phase !== 'checking') level = Math.min(saved, unlocked());
    }
    render();
  }

  async function newRound() {
    const mine = ++request;
    result = null;
    next = null;
    phase = 'loading';
    round = null;
    render();
    const response = await api('/round', { level }).catch(() => null);
    if (mine !== request) return;
    if (!response?.ok) {
      phase = 'error';
      result = { error: response?.data?.code === 'NOT_SIGNED_IN' ? 'signIn' : response?.status === 429 ? 'slow' : 'network' };
      render();
      return;
    }
    round = response.data;
    phase = 'ready';
    render();
  }

  // Chơi xong: màn kết quả giữ nguyên mục tiêu + thời gian bấm của lượt đó; đề kế được tải sẵn, bấm "Lượt mới" là hiện.
  function prefetch() {
    next = { level, promise: api('/round', { level }).catch(() => null) };
  }
  async function useNext() {
    const pending = next;
    next = null;
    if (!pending || pending.level !== level) return newRound();
    const mine = ++request;
    phase = 'loading';
    render();
    const response = await pending.promise;
    if (mine !== request) return;
    if (!response?.ok) return newRound();
    round = response.data;
    result = null;
    phase = 'ready';
    render();
  }

  function begin(timeStamp) {
    if (phase !== 'ready' || !round) return;
    phase = 'running';
    startedAt = timeStamp;
    result = null;
    startRequest = api('/start', { roundId: round.roundId }).catch(() => ({ ok: false }));
    render();
    tick();
  }

  async function finish(timeStamp, timedOut = false) {
    if (phase !== 'running') return;
    cancelAnimationFrame(frame);
    const elapsed = timedOut ? STOPWATCH.timeout : Math.min(STOPWATCH.timeout, Math.max(0, Math.round((timeStamp - startedAt) / 10)));
    phase = 'checking';
    result = { elapsed, pending: true };
    render();
    const started = await startRequest;
    const response = started?.ok ? await api('/stop', { roundId: round.roundId, elapsed }).catch(() => null) : null;
    if (!response?.ok) {
      phase = 'error';
      result = { elapsed, error: response?.data?.code === 'TIMING_MISMATCH' ? 'timing' : 'network' };
      render();
      return;
    }
    const outcome = response.data;
    result = { ...outcome, timedOut };
    phase = 'done';
    if (outcome.newLevel) {
      showToast?.(t('sw.unlocked', { level: outcome.newLevel, name: t(`sw.level.${outcome.newLevel}`) }));
    }
    await refresh();
    prefetch();
    render();
  }

  function tick() {
    if (phase !== 'running') return;
    const elapsed = Math.round((performance.now() - startedAt) / 10);
    if (elapsed >= STOPWATCH.timeout) {
      finish(performance.now(), true);
      return;
    }
    renderClock(elapsed);
    frame = requestAnimationFrame(tick);
  }

  // Đồng hồ: cấp cao tắt khi còn blind phần trăm giây tới mục tiêu (đếm thầm); đã dừng thì luôn hiện thời gian thật.
  function renderClock(elapsed) {
    const info = levelInfo(level);
    const hidden = phase === 'running' && info.blind !== null && elapsed >= (round?.target ?? 0) - info.blind;
    clockValue.textContent = hidden ? '??:??' : clock(Math.min(elapsed, 9_999));
    clockValue.classList.toggle('hidden-time', hidden);
  }

  function press(event) {
    if (event.button !== undefined && event.button > 0) return;
    if (phase === 'ready') {
      event.preventDefault();
      begin(event.timeStamp);
    } else if (phase === 'running') {
      event.preventDefault();
      finish(event.timeStamp);
    } else if (phase === 'done') {
      event.preventDefault();
      useNext();
    } else if (phase === 'error') {
      event.preventDefault();
      if (result?.error === 'signIn') {
        setOpen(false);
        openSignIn?.();
      } else newRound();
    }
  }
  main.addEventListener('pointerdown', press);
  // Bàn phím: Space / Enter khi thẻ đang mở (không đang gõ chat).
  document.addEventListener('keydown', (event) => {
    if (!open || tab !== 'play' || event.repeat || !['Space', 'Enter'].includes(event.code)) return;
    const focused = document.activeElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName) || (focused?.tagName === 'BUTTON' && focused !== main)) return;
    press(event);
  });

  function selectLevel(id) {
    if (id > unlocked() || phase === 'running' || phase === 'checking') return;
    level = id;
    try { localStorage.setItem(LEVEL_KEY, String(id)); } catch {}
    result = null;
    newRound();
  }

  function renderLevels() {
    levels.setAttribute('aria-label', t('sw.levels'));
    levels.replaceChildren(...STOPWATCH.levels.map((info) => {
      const locked = info.id > unlocked();
      const done = statsOf(info.id).hits > 0;
      const node = button(`sw-level${info.id === level ? ' active' : ''}${locked ? ' locked' : ''}`, `${locked ? '🔒' : done ? '✓' : ''}${info.id}`, () => selectLevel(info.id));
      node.title = locked ? t(account() ? 'sw.lockedHint' : 'sw.guestHint', { level: info.id - 1 }) : `${t('sw.levelN', { level: info.id })} · ${t(`sw.level.${info.id}`)}`;
      node.setAttribute('aria-pressed', String(info.id === level));
      node.disabled = locked;
      return node;
    }));
  }

  function renderPlay() {
    const info = levelInfo(level);
    const hide = info.blind === null ? t('sw.clockShown') : info.blind >= STOPWATCH.max ? t('sw.clockHidden') : t('sw.clockHides', { s: new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(info.blind / 100) });
    rule.textContent = `${t('sw.levelN', { level })} · ${t(`sw.level.${level}`)} — ${t('sw.exact')} · ${hide}`;
    targetLabel.textContent = t('sw.target');
    clockLabel.textContent = t('sw.clock');
    targetValue.textContent = round ? clock(round.target) : '--:--';
    if (phase === 'running') renderClock(Math.round((performance.now() - startedAt) / 10));
    else clockValue.textContent = result?.elapsed !== undefined ? clock(result.elapsed) : '00:00';
    if (phase !== 'running') clockValue.classList.remove('hidden-time');
    const label = phase === 'running' ? `■ ${t('sw.stop')}`
      : phase === 'ready' ? `▶ ${t('sw.start')}`
        : phase === 'loading' || phase === 'checking' ? t('sw.wait')
          : phase === 'done' ? `↻ ${t('sw.next')}` : result?.error === 'signIn' ? t('sw.signIn') : `↻ ${t('sw.again')}`;
    main.textContent = label;
    main.className = `sw-main${phase === 'running' ? ' running' : ''}`;
    main.disabled = phase === 'loading' || phase === 'checking' || phase === 'idle';
    card.classList.toggle('sw-hit', Boolean(result?.hit));
    // Kết quả.
    if (result?.error) message.textContent = t(`sw.error.${result.error}`);
    else if (result?.pending) message.textContent = t('sw.checking');
    else if (result?.hit !== undefined) {
      const diff = `${t('sw.diff')} ${seconds(result.diff, true)} s`;
      message.textContent = result.hit ? `🎯 ${t('sw.hit')}` : result.timedOut ? `⌛ ${t('sw.timeout')}`
        : Math.abs(result.diff) <= ALMOST ? `😮 ${t('sw.almost')} · ${diff}` : `${t('sw.miss')} · ${diff}`;
    } else message.textContent = phase === 'ready' ? t('sw.readyHint') : '';
    message.className = `sw-message${result?.hit ? ' hit' : result?.hit === false || result?.error ? ' miss' : ''}`;
    const mine = statsOf(level);
    stats.textContent = account() ? t('sw.stats', { hits: mine.hits, plays: mine.plays }) : '';
    guest.replaceChildren();
    if (!account()) {
      guest.append(el('span', '', t('sw.guest')), button('chip sw-sign', t('sw.signIn'), () => {
        setOpen(false);
        openSignIn?.();
      }));
    }
  }

  function historyList(rows, withName) {
    const list = el('ul', 'sw-list');
    if (!rows?.length) list.append(el('li', 'empty', t('sw.none')));
    for (const row of rows || []) {
      const item = el('li');
      if (withName) item.append(el('b', '', row.name));
      item.append(
        el('span', 'sw-badge', t('sw.levelN', { level: row.level })),
        el('span', '', `🎯 ${clock(row.target)} · ⏱ ${clock(row.elapsed)}`),
        el('small', '', when(row.at)),
      );
      list.append(item);
    }
    return list;
  }

  function renderHistory() {
    const parts = [];
    if (account()) parts.push(el('h3', '', t('sw.myHistory')), historyList(view?.me?.history, false));
    parts.push(el('h3', '', `🏆 ${t('sw.board')}`), historyList(view?.recent, true));
    history.replaceChildren(...parts);
  }

  function render() {
    chip.textContent = `⏱ ${t('sw.chip')}`;
    chip.setAttribute('aria-expanded', String(open));
    card.setAttribute('aria-label', t('sw.title'));
    title.textContent = `⏱ ${t('sw.title')}`;
    tabButton.textContent = tab === 'play' ? `📜 ${t('sw.historyTab')}` : `⏱ ${t('sw.playTab')}`;
    close.setAttribute('aria-label', t('sw.close'));
    play.hidden = tab !== 'play';
    history.hidden = tab !== 'history';
    if (!open) return;
    renderLevels();
    if (tab === 'play') renderPlay();
    else renderHistory();
  }

  onLangChange?.(render);
  window.addEventListener('resize', () => { if (open) place(); });
  render();

  return {
    get open() { return open; },
    // App Bấm giờ trong điện thoại (nút trên thanh phòng được cất vào điện thoại).
    show: () => setOpen(true),
    close: () => setOpen(false),
  };
}
