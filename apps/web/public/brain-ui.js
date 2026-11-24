// Khu Trí tuệ (app 🧠 trong điện thoại chánh điện; API apps/api/brain.mjs): "Đề hôm nay" 5 trò luyện não (Nhớ tiếng
// chuông, Ma trận hoa sen, Dãy số, Tính nhẩm, Màu mực), "Test IQ vui" 30 câu / 20 phút ra chỉ số tham khảo, Bảng vàng,
// ảnh kết quả 9:16 để chia sẻ. Server ra đề và chấm; trang chỉ vẽ đề, đếm giờ, gửi lựa chọn. Không thưởng xu.
// Chữ ở brain-text.js (vi / en / zh / es). Chữ người dùng (tên trên Bảng vàng) chỉ qua textContent / fillText.
import { lang, onLangChange } from '/thien-i18n.js';
import { brainText } from '/brain-text.js';

const GAMES = ['bells', 'matrix', 'series', 'math', 'stroop'];
// Loại câu của Test IQ (mỗi loại 5 câu), theo thứ tự hiện thanh điểm mạnh.
const IQ_KINDS = ['matrix', 'rotation', 'series', 'numgrid', 'analogy', 'balance'];
const ICONS = { bells: '🔔', matrix: '🪷', series: '🔢', math: '🧮', stroop: '🎨' };
const INSTRUMENTS = ['🔔', '🪵', '🎐', '🥁'];
// Màu hình ma trận theo chỉ số trong đề: vàng, đỏ, ngọc, lam.
const SHAPE_COLORS = ['#ecbc4c', '#e5553f', '#3fc08a', '#5293e6'];
const INK = { red: '#f0503f', blue: '#4b8ff5', green: '#2fbf68', yellow: '#f5c836' };
const SVG_NS = 'http://www.w3.org/2000/svg';

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
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

// ---- Ô ma trận: n hình (tròn, vuông, tam giác, cánh sen), một màu, tô đặc hoặc viền ----
function shapeNode(kind, x, y, r, color, outline) {
  const style = outline ? { fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linejoin': 'round' } : { fill: color };
  if (kind === 0) return svg('circle', { cx: x, cy: y, r, ...style });
  if (kind === 1) return svg('rect', { x: x - r * 0.88, y: y - r * 0.88, width: r * 1.76, height: r * 1.76, rx: 3, ...style });
  if (kind === 2) return svg('polygon', { points: `${x},${y - r * 1.05} ${x + r * 1.1},${y + r * 0.85} ${x - r * 1.1},${y + r * 0.85}`, ...style });
  return svg('path', { d: `M${x},${y - r * 1.2} Q${x + r * 1.1},${y} ${x},${y + r * 1.2} Q${x - r * 1.1},${y} ${x},${y - r * 1.2}Z`, ...style });
}
function tile(cell) {
  const root = svg('svg', { viewBox: '0 0 100 100', class: 'brain-tile', 'aria-hidden': 'true' });
  if (!cell) {
    const mark = svg('text', { x: 50, y: 66, 'text-anchor': 'middle', class: 'brain-tile-q' });
    mark.textContent = '?';
    root.append(mark);
    return root;
  }
  const spots = { 1: [[50, 50]], 2: [[29, 50], [71, 50]], 3: [[50, 27], [28, 71], [72, 71]] }[cell.n] || [[50, 50]];
  // Cỡ z: 0 nhỏ, 1 vừa, 2 to (ma trận khó có cỡ đổi theo luật).
  const radius = [10, 14.5, 19][cell.z ?? 1];
  for (const [x, y] of spots) root.append(shapeNode(cell.s, x, y, radius, SHAPE_COLORS[cell.c], cell.f === 1));
  return root;
}

// ---- Xoay hình: hình ghép từ ô vuông [x, y], vẽ giữa khung vuông ----
function blocks(shape, className = 'brain-blocks') {
  const width = Math.max(...shape.map(([x]) => x)) + 1;
  const height = Math.max(...shape.map(([, y]) => y)) + 1;
  const size = Math.max(width, height, 3);
  const root = svg('svg', { viewBox: `0 0 ${size * 20} ${size * 20}`, class: className, 'aria-hidden': 'true' });
  const offsetX = ((size - width) * 20) / 2;
  const offsetY = ((size - height) * 20) / 2;
  for (const [x, y] of shape) root.append(svg('rect', { x: offsetX + x * 20 + 1, y: offsetY + y * 20 + 1, width: 18, height: 18, rx: 3, fill: '#ecbc4c', stroke: '#8a6418', 'stroke-width': 1.5 }));
  return root;
}

// Giá trị biểu thức Tính nhẩm (+ − × ÷, ngoặc, ², %) để báo đúng / sai ngay; server chấm lại (evaluateMath ở API).
function mathValue(text) {
  const tokens = text.replace(/\s+/g, '').match(/\d+|[+−×÷()²%]/g) || [];
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  function factor() {
    let value;
    if (peek() === '(') {
      take();
      value = sum();
      take();
    } else value = Number(take());
    while (peek() === '²' || peek() === '%') value = take() === '²' ? value * value : value / 100;
    return value;
  }
  function product() {
    let value = factor();
    while (peek() === '×' || peek() === '÷') value = take() === '×' ? value * factor() : value / factor();
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === '+' || peek() === '−') value = take() === '+' ? value + product() : value - product();
    return value;
  }
  return sum();
}

// ---- Âm thanh Nhớ tiếng chuông: tạo bằng WebAudio (không tải file), tắt khi trang đang tắt tiếng ----
function createSounds(muted) {
  let context = null;
  const ensure = () => {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) context = new Audio();
    }
    if (context?.state === 'suspended') context.resume().catch(() => {});
    return context;
  };
  const voice = (at, { freq, type = 'sine', decay, gain, drop = 0 }) => {
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (drop) osc.frequency.exponentialRampToValueAtTime(freq * drop, at + decay);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(amp).connect(context.destination);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  };
  return {
    unlock: ensure,
    play(index) {
      if (muted() || !ensure()) return;
      const at = context.currentTime + 0.01;
      if (index === 0) {
        voice(at, { freq: 880, decay: 1.2, gain: 0.2 });
        voice(at, { freq: 1318, decay: 0.7, gain: 0.07 });
      } else if (index === 1) voice(at, { freq: 560, type: 'square', decay: 0.09, gain: 0.1 });
      else if (index === 2) {
        voice(at, { freq: 660, type: 'triangle', decay: 0.9, gain: 0.18 });
        voice(at, { freq: 1046, decay: 0.5, gain: 0.05 });
      } else voice(at, { freq: 150, decay: 0.38, gain: 0.45, drop: 0.45 });
    },
  };
}

// Đồng hồ đếm ngược dạng thanh; onEnd khi hết giờ. Đo bằng performance.now (tab ẩn rồi quay lại vẫn đúng).
function timerBar(limitMs, onEnd, format) {
  const wrap = el('div', 'brain-timer');
  const fill = el('i');
  const label = el('b');
  wrap.append(fill, label);
  const started = performance.now();
  let frame = 0;
  let done = false;
  const tick = () => {
    if (done) return;
    const left = Math.max(0, limitMs - (performance.now() - started));
    fill.style.width = `${(left / limitMs) * 100}%`;
    wrap.classList.toggle('low', left < Math.min(10_000, limitMs * 0.2));
    label.textContent = format(left);
    if (left <= 0) {
      done = true;
      onEnd();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  tick();
  return { node: wrap, stop() { done = true; cancelAnimationFrame(frame); } };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

// sendRoom(message): gửi tin tới phòng (Đấu trí: challenge.check / cancel / send).
// selfId(): participantId của mình trong phòng; serverNow(): giờ server (Đố vui đếm giờ theo server).
export function createBrainUI({ stage, showToast, account, openSignIn, displayName = () => '', muted = () => false, locale = () => undefined, sendRoom = () => false, selfId = () => null, serverNow = () => Date.now(), onDaily = () => {} }) {
  const tr = (key, vars) => brainText(lang(), key, vars);
  const sheet = el('section', 'brain-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(sheet);

  let view = null;
  let failed = false;
  let tab = 'daily';
  // null = trang chính (tab); { type: 'howto' | 'play' | 'submitting' | 'result', game, … }
  let screen = null;
  let stopActive = () => {};
  // Các câu đã chọn của bài đang làm (nút Nộp bài của Test IQ nộp sớm).
  let liveAnswers = [];
  // Khách: điểm trong phiên (không lưu server) để danh sách vẫn hiện trò nào đã chơi.
  const guestToday = {};
  const sounds = createSounds(muted);

  async function api(path, body) {
    const response = await fetch(path, body === undefined
      ? { cache: 'no-store', credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { ok: response.ok && data?.ok !== false, status: response.status, data };
  }

  async function load() {
    const response = await api('/api/v1/brain').catch(() => null);
    failed = !response?.ok;
    if (response?.ok) view = response.data;
    if (!sheet.hidden && (!screen || screen.type === 'result')) render();
    onDaily(dailyStatus());
  }

  // Đề hôm nay của thành viên: còn mấy trò, chuỗi ngày (tính tới hôm qua khi hôm nay chưa xong), số người đã làm.
  // null với khách (điểm không lưu nên không nhắc).
  function dailyStatus() {
    if (!view?.me || !account()) return null;
    const done = GAMES.filter((game) => view.me.today?.[game] !== undefined).length;
    return { day: view.day, done, left: GAMES.length - done, streak: view.me.streak || 0, players: view.players || 0 };
  }

  // Lời nhắc quay lại (trang hiện thành thông báo trên điện thoại): giữ chuỗi ngày, còn mấy trò, hoặc đề mới đã mở.
  function reminder(status) {
    if (!status?.left) return null;
    const actionLabel = tr('remind.play');
    if (status.streak > 0) {
      return { title: tr('remind.streakTitle', { n: status.streak }), text: tr('remind.streakText', { left: status.left, next: status.streak + 1 }), actionLabel };
    }
    if (status.done > 0) return { title: tr('remind.leftTitle', { left: status.left }), text: tr('remind.leftText'), actionLabel };
    return { title: tr('remind.newTitle'), text: status.players > 0 ? tr('remind.newPlayers', { n: status.players }) : tr('remind.newText'), actionLabel };
  }

  const errorText = (code) => (code && tr(`err.${code}`) !== `err.${code}` ? tr(`err.${code}`) : tr('error'));
  const todayScores = () => (account() ? view?.me?.today || {} : guestToday);
  const nextGame = () => GAMES.find((game) => todayScores()[game] === undefined) || null;
  const seconds = (ms) => {
    const total = Math.ceil(ms / 1000);
    return total >= 60 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : tr('seconds', { s: total });
  };

  // ---- Khung chung ----
  function head(title, onBack) {
    const bar = el('header', onBack ? 'brain-head sub' : 'brain-head');
    if (onBack) bar.append(button('chip brain-back', tr('back'), onBack));
    bar.append(el('h2', '', title), button('chip brain-close', '✕', close));
    bar.lastChild.setAttribute('aria-label', tr('close'));
    return bar;
  }
  function tabs() {
    const row = el('div', 'brain-tabs');
    row.setAttribute('role', 'tablist');
    for (const name of ['daily', 'iq', 'quiz', 'board']) {
      const item = button('', tr(`tab.${name}`), () => {
        tab = name;
        render();
      });
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(tab === name));
      row.append(item);
    }
    return row;
  }
  const note = (text, className = '') => el('p', `brain-note ${className}`.trim(), text);
  const signInRow = (text) => {
    const box = el('div', 'brain-guest');
    box.append(el('span', '', text), button('chip primary', tr('signIn'), () => {
      close();
      openSignIn();
    }));
    return box;
  };

  // ---- Đề hôm nay ----
  function dailyPage() {
    const parts = [note(tr('daily.intro'))];
    const scores = todayScores();
    const done = GAMES.filter((game) => scores[game] !== undefined);
    const total = done.reduce((sum, game) => sum + scores[game], 0);
    const summary = el('div', 'brain-summary');
    summary.append(el('b', '', tr('daily.total', { points: total })));
    if (view?.me?.streak) summary.append(el('span', 'brain-streak', tr('daily.streak', { n: view.me.streak })));
    parts.push(summary);
    if (!account()) parts.push(signInRow(tr('daily.guest')));
    const list = el('div', 'brain-games');
    for (const game of GAMES) {
      const card = button('brain-game', undefined, () => {
        screen = { type: 'howto', game };
        render();
      });
      card.dataset.game = game;
      const text = el('span', 'brain-game-text');
      text.append(el('b', '', tr(`game.${game}`)), el('small', '', tr(`skill.${game}`)));
      const status = scores[game] !== undefined ? el('span', 'brain-game-done', tr('daily.done', { points: scores[game] })) : el('span', 'brain-game-play', `${tr('daily.play')} ›`);
      card.append(el('span', 'brain-game-icon', ICONS[game]), text, status);
      list.append(card);
    }
    parts.push(list);
    if (done.length === GAMES.length) {
      parts.push(note(tr('result.allDone'), 'brain-done'));
      parts.push(button('brain-share', tr('daily.share'), () => share('daily')));
    }
    return parts;
  }

  // ---- Test IQ vui ----
  function iqPage() {
    const parts = [note(tr('iq.intro')), note(tr('iq.disclaimer'), 'brain-small')];
    parts.push(button('brain-start', tr('iq.start'), () => start('iq')));
    if (!account()) parts.push(signInRow(tr('iq.signIn')));
    const history = view?.me?.iq || [];
    if (view?.me?.bestIq) parts.push(el('p', 'brain-best', tr('iq.best', { n: view.me.bestIq })));
    if (history.length) {
      parts.push(el('h3', '', tr('iq.history')));
      const list = el('ol', 'brain-history');
      for (const row of history) {
        const item = el('li');
        item.append(el('b', '', String(row.index)), el('span', '', tr('iq.correct', { n: row.correct, total: row.total || 20 })), el('small', '', new Date(row.at).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })));
        list.append(item);
      }
      parts.push(list);
    }
    return parts;
  }

  // ---- Bảng vàng ----
  function boardPage() {
    const parts = [];
    const medal = (index) => ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
    if (view?.me) {
      const mine = el('div', 'brain-summary');
      const total = Object.values(view.me.today).reduce((sum, value) => sum + value, 0);
      mine.append(el('b', '', `${tr('board.me')}: ${tr('daily.total', { points: total })}`));
      if (view.me.streak) mine.append(el('span', 'brain-streak', tr('daily.streak', { n: view.me.streak })));
      if (view.me.bestIq) mine.append(el('span', 'brain-streak', tr('iq.best', { n: view.me.bestIq })));
      if (view.me.quiz?.wins) mine.append(el('span', 'brain-streak', `🏆 ${tr('board.wins', { n: view.me.quiz.wins })}`));
      parts.push(mine);
    }
    const section = (title, rows, value, extra) => {
      parts.push(el('h3', '', title));
      if (extra) parts.push(note(extra, 'brain-small'));
      if (!rows?.length) {
        parts.push(note(tr('board.empty'), 'brain-small'));
        return;
      }
      const list = el('ol', 'brain-board');
      rows.forEach((row, index) => {
        const item = el('li');
        item.append(el('span', 'brain-rank', medal(index)), el('span', 'brain-name', row.name), el('b', '', value(row)));
        list.append(item);
      });
      parts.push(list);
    };
    section(tr('board.today'), view?.board?.today, (row) => tr('board.points', { n: row.points }), view ? tr('board.players', { n: view.players }) : '');
    section(tr('board.iq'), view?.board?.iq, (row) => String(row.index));
    section(tr('board.quiz'), view?.board?.quiz, (row) => tr('board.wins', { n: row.wins }));
    return parts;
  }

  // ---- Hướng dẫn trước khi chơi ----
  function howtoPage(game) {
    const parts = [];
    const hero = el('div', 'brain-hero');
    hero.append(el('span', 'brain-hero-icon', ICONS[game]), el('b', '', tr(`game.${game}`)), el('small', '', tr(`skill.${game}`)));
    parts.push(hero, note(tr(`howto.${game}`)));
    const before = todayScores()[game];
    if (account() && before !== undefined) parts.push(note(tr('practice.note', { points: before }), 'brain-small'));
    parts.push(button('brain-start', tr('start'), () => start(game)));
    return parts;
  }

  // ---- Ra đề, chơi, nộp ----
  async function start(game) {
    // Mở âm thanh ngay trong lần chạm (iOS chỉ cho bật âm thanh khi người dùng chạm).
    if (game === 'bells') sounds.unlock();
    const response = await api('/api/v1/brain/round', { game }).catch(() => null);
    if (!response?.ok) {
      showToast(errorText(response?.data?.code));
      return;
    }
    screen = { type: 'play', game, round: response.data };
    render();
  }

  async function submit(game, round, answers) {
    stopActive();
    stopActive = () => {};
    if (game === 'duel') {
      submitDuel(round, answers);
      return;
    }
    screen = { type: 'submitting', game };
    render();
    const response = await api('/api/v1/brain/answer', { roundId: round.roundId, answers }).catch(() => null);
    if (!response?.ok) {
      showToast(errorText(response?.data?.code));
      screen = game === 'iq' ? null : { type: 'howto', game };
      if (game === 'iq') tab = 'iq';
      render();
      return;
    }
    const result = response.data;
    if (game !== 'iq' && !account() && guestToday[game] === undefined) guestToday[game] = result.points;
    if (game !== 'iq' && result.today && view?.me) view.me.today = result.today;
    if (game !== 'iq' && view?.me) view.me.streak = result.streak;
    screen = { type: 'result', game, round, answers, result };
    render();
    load();
  }

  // Vẽ một câu đố (ma trận, xoay hình, bảng số, dãy số) vào ask / board / options; onPick(choice) khi chạm phương án.
  // Dùng chung cho bài tự làm (quizPlay) và Đố vui nhiều người.
  function fillQuestion(item, kind, { ask, board, options }, onPick) {
    ask.textContent = tr(`${kind}.ask`);
    options.className = `brain-options ${kind}`;
    const pick = (className, content, choice) => {
      const pickButton = button(className, typeof content === 'string' ? content : undefined, () => onPick(choice));
      if (typeof content !== 'string') {
        pickButton.append(content);
        pickButton.setAttribute('aria-label', String.fromCharCode(65 + choice));
      }
      return pickButton;
    };
    if (kind === 'matrix') {
      const grid = el('div', 'brain-grid');
      for (const cell of [...item.cells, null]) {
        const box = el('div', cell ? 'brain-cell' : 'brain-cell missing');
        box.append(tile(cell));
        grid.append(box);
      }
      board.replaceChildren(grid);
      options.replaceChildren(...item.options.map((cell, choice) => pick('brain-option', tile(cell), choice)));
    } else if (kind === 'rotation') {
      const frame = el('div', 'brain-rotate');
      frame.append(blocks(item.shape, 'brain-blocks main'));
      board.replaceChildren(frame);
      options.replaceChildren(...item.options.map((shape, choice) => pick('brain-option', blocks(shape), choice)));
    } else if (kind === 'numgrid') {
      const grid = el('div', 'brain-numgrid');
      for (const value of [...item.cells, null]) grid.append(el('span', value === null ? 'missing' : '', value === null ? '?' : value.toLocaleString(locale())));
      board.replaceChildren(grid);
      options.replaceChildren(...item.options.map((value, choice) => pick('brain-option number', value.toLocaleString(locale()), choice)));
    } else if (kind === 'analogy') {
      const card = (cell, missing = false) => {
        const node = el('span', missing ? 'brain-analogy-card missing' : 'brain-analogy-card');
        node.append(tile(cell));
        return node;
      };
      const analogy = el('div', 'brain-analogy');
      analogy.append(card(item.a), el('b', '', '→'), card(item.b), card(item.c), el('b', '', '→'), card(null, true));
      board.replaceChildren(analogy);
      options.replaceChildren(...item.options.map((cell, choice) => pick('brain-option', tile(cell), choice)));
    } else if (kind === 'balance') {
      const icons = (values) => {
        const group = el('span', 'brain-balance-icons');
        values.forEach((value, index) => {
          if (index) group.append(el('i', '', '+'));
          const symbol = el('span', 'brain-balance-symbol');
          symbol.append(tile(item.symbols[value]));
          group.append(symbol);
        });
        return group;
      };
      const balance = el('div', 'brain-balance');
      for (const equation of item.equations) {
        const row = el('div', 'brain-balance-row');
        row.append(icons(equation.icons), el('b', '', '='), el('strong', '', equation.total.toLocaleString(locale())));
        balance.append(row);
      }
      const target = el('div', 'brain-balance-row target');
      target.append(icons(item.target), el('b', '', '='), el('strong', '', '?'));
      balance.append(target);
      board.replaceChildren(balance);
      options.replaceChildren(...item.options.map((value, choice) => pick('brain-option number', value.toLocaleString(locale()), choice)));
    } else {
      board.replaceChildren(el('p', 'brain-terms', `${item.terms.map((value) => value.toLocaleString(locale())).join(', ')}, ?`));
      options.replaceChildren(...item.options.map((value, choice) => pick('brain-option number', value.toLocaleString(locale()), choice)));
    }
  }

  // Ma trận / dãy số / test IQ: từng câu một, chọn là sang câu kế; hết giờ nộp những câu đã làm.
  function quizPlay(game, round) {
    const items = round.problem.items;
    const answers = [];
    liveAnswers = answers;
    let index = 0;
    let locked = false;
    let over = false;
    const wrap = el('div', 'brain-play');
    const top = el('div', 'brain-play-top');
    const counter = el('b', 'brain-counter');
    const finish = () => {
      if (over) return;
      over = true;
      submit(game, round, answers);
    };
    const timer = timerBar(round.limitMs, finish, seconds);
    stopActive = () => {
      over = true;
      timer.stop();
    };
    top.append(counter, timer.node);
    const ask = el('p', 'brain-ask');
    const board = el('div', 'brain-question');
    const options = el('div', 'brain-options');
    const skip = button('chip brain-skip', tr('skip'), () => choose(null));
    wrap.append(top, ask, board, options, skip);
    function show() {
      const item = items[index];
      counter.textContent = tr('question', { n: index + 1, total: items.length });
      fillQuestion(item, item.kind || game, { ask, board, options }, choose);
    }
    function choose(choice) {
      if (locked || over) return;
      locked = true;
      answers.push(choice);
      const picked = choice === null ? null : options.children[choice];
      picked?.classList.add('picked');
      setTimeout(() => {
        if (over) return;
        locked = false;
        index += 1;
        if (index >= items.length) {
          timer.stop();
          finish();
        } else show();
      }, picked ? 160 : 0);
    }
    show();
    return wrap;
  }

  // Tính nhẩm / màu mực: càng nhiều câu đúng trong thời gian càng tốt; đúng / sai báo ngay (trang tự biết đáp án
  // phép tính và màu mực vì phải vẽ ra; server chấm lại).
  function speedPlay(game, round) {
    const { items } = round.problem;
    const colors = round.problem.colors || [];
    const answers = [];
    let index = 0;
    let right = 0;
    let wrong = 0;
    let over = false;
    const wrap = el('div', 'brain-play');
    const top = el('div', 'brain-play-top');
    const counter = el('b', 'brain-counter');
    const finish = () => {
      if (over) return;
      over = true;
      submit(game, round, answers);
    };
    const timer = timerBar(round.limitMs, finish, seconds);
    stopActive = () => {
      over = true;
      timer.stop();
    };
    top.append(counter, timer.node);
    const ask = el('p', 'brain-ask', game === 'stroop' ? tr('stroop.ask') : '');
    const prompt = el('div', `brain-prompt ${game}`);
    const options = el('div', `brain-options ${game}`);
    wrap.append(top, ask, prompt, options);
    if (game === 'stroop') {
      options.append(...colors.map((color, choice) => {
        const pickButton = button('brain-option color', undefined, () => choose(choice));
        const dot = el('i');
        dot.style.background = INK[color];
        pickButton.append(dot, el('span', '', tr(`pick.${color}`)));
        return pickButton;
      }));
    }
    function show() {
      counter.textContent = tr('speed.count', { right, wrong });
      const item = items[index];
      if (game === 'math') {
        prompt.textContent = item.text;
        options.replaceChildren(...item.options.map((value, choice) => button('brain-option number', String(value), () => choose(choice))));
      } else {
        // Câu khó đổi luật bất ngờ: 🖌 chọn màu mực, 🔤 chọn theo chữ.
        ask.textContent = tr(item.mode === 'word' ? 'stroop.cueWord' : 'stroop.cueInk');
        ask.classList.toggle('brain-cue-word', item.mode === 'word');
        prompt.textContent = tr(`color.${colors[item.word]}`);
        prompt.style.color = INK[colors[item.ink]];
      }
    }
    function choose(choice) {
      if (over) return;
      const item = items[index];
      answers.push(choice);
      const ok = game === 'math' ? item.options[choice] === mathValue(item.text) : choice === (item.mode === 'word' ? item.word : item.ink);
      if (ok) right += 1;
      else wrong += 1;
      prompt.classList.remove('good', 'bad');
      void prompt.offsetWidth;
      prompt.classList.add(ok ? 'good' : 'bad');
      index += 1;
      if (index >= items.length) {
        timer.stop();
        finish();
      } else show();
    }
    show();
    return wrap;
  }

  // Nhớ tiếng chuông: xem → gõ lại; đúng cả lượt thì dài thêm một tiếng, sai là dừng. Lượt có trong problem.reverse
  // (chuỗi 5, 7, 9… tiếng) phải gõ ngược; gửi server đúng thứ tự đã gõ của lượt dài nhất.
  function bellsPlay(round) {
    const { sequence } = round.problem;
    const reverse = new Set(round.problem.reverse || []);
    const order = (length) => (reverse.has(length) ? sequence.slice(0, length).reverse() : sequence.slice(0, length));
    let level = round.problem.start;
    let reached = 0;
    let input = 0;
    let phase = 'watch';
    const timers = new Set();
    const later = (ms, run) => {
      const id = setTimeout(() => {
        timers.delete(id);
        run();
      }, ms);
      timers.add(id);
    };
    stopActive = () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      phase = 'stopped';
    };
    const wrap = el('div', 'brain-play');
    const top = el('div', 'brain-play-top');
    const counter = el('b', 'brain-counter');
    const status = el('p', 'brain-ask');
    top.append(counter);
    const pads = el('div', 'brain-pads');
    const padButtons = INSTRUMENTS.map((icon, index) => {
      const pad = button('brain-pad', undefined, () => tap(index));
      pad.dataset.pad = String(index);
      pad.append(el('span', 'brain-pad-icon', icon), el('small', '', tr(`inst.${index}`)));
      pads.append(pad);
      return pad;
    });
    wrap.append(top, status, pads);
    const flash = (index) => {
      const pad = padButtons[index];
      pad.classList.add('lit');
      sounds.play(index);
      later(380, () => pad.classList.remove('lit'));
    };
    const finish = () => submit('bells', round, reached ? order(reached) : []);
    function watch() {
      phase = 'watch';
      input = 0;
      counter.textContent = `${level}/${sequence.length}`;
      status.textContent = tr(reverse.has(level) ? 'bells.watchReverse' : 'bells.watch');
      status.classList.toggle('brain-cue-word', reverse.has(level));
      pads.classList.add('locked');
      for (let step = 0; step < level; step += 1) later(650 + step * 640, () => flash(sequence[step]));
      later(650 + level * 640, () => {
        phase = 'input';
        pads.classList.remove('locked');
        status.textContent = tr(reverse.has(level) ? 'bells.turnReverse' : 'bells.turn', { n: level });
        status.classList.toggle('brain-cue-word', reverse.has(level));
      });
    }
    function tap(index) {
      if (phase !== 'input') return;
      flash(index);
      if (order(level)[input] !== index) {
        phase = 'over';
        status.textContent = tr('bells.wrong');
        padButtons[index].classList.add('miss');
        later(1_000, finish);
        return;
      }
      input += 1;
      if (input < level) return;
      reached = level;
      phase = 'wait';
      status.textContent = tr('bells.ok');
      if (level >= sequence.length) {
        later(800, finish);
        return;
      }
      level += 1;
      later(900, watch);
    }
    watch();
    return wrap;
  }

  // ---- Kết quả ----
  // Dải chấm ✓ / ✗ / – cho từng câu (ma trận, dãy số, test).
  function reviewDots(answers, solution) {
    const row = el('div', 'brain-dots');
    solution.forEach((answer, index) => {
      const given = answers[index];
      const state = given === undefined || given === null ? 'skip' : given === answer ? 'good' : 'bad';
      row.append(el('i', state, state === 'good' ? '✓' : state === 'bad' ? '✗' : '–'));
    });
    return row;
  }

  function resultPage({ game, answers, result }) {
    const parts = [];
    const badge = result.points >= 90 ? '🏆' : result.points >= 60 ? '🌟' : result.points >= 30 ? '👍' : '🌱';
    const hero = el('div', 'brain-hero');
    hero.append(el('span', 'brain-hero-icon', badge), el('b', 'brain-big', tr('result.points', { points: result.points })), el('small', '', tr(`game.${game}`)));
    parts.push(hero);
    parts.push(note(result.percent === null ? tr('result.first') : tr('result.percent', { n: result.percent }), 'brain-percent'));
    parts.push(note(result.saved ? tr('result.saved') : result.practice && account() ? tr('result.practice') : tr('result.guest'), 'brain-small'));
    if (game === 'bells') parts.push(note(tr('result.bells', { n: result.correct })));
    else if (game === 'math' || game === 'stroop') parts.push(note(tr('result.speed', { right: result.correct, wrong: result.wrong })));
    else {
      parts.push(note(tr('result.quiz', { right: result.correct, total: result.solution.length })));
      parts.push(reviewDots(answers, result.solution));
    }
    const next = nextGame();
    const actions = el('div', 'brain-actions');
    if (next) {
      actions.append(button('brain-start', tr('result.next'), () => {
        screen = { type: 'howto', game: next };
        render();
      }));
    } else {
      parts.push(note(tr('result.allDone'), 'brain-done'));
      actions.append(button('brain-share', tr('daily.share'), () => share('daily')));
    }
    actions.append(button('chip', tr('result.list'), () => {
      screen = null;
      tab = 'daily';
      render();
    }));
    parts.push(actions);
    return parts;
  }

  function iqResultPage({ answers, result }) {
    const parts = [];
    const hero = el('div', 'brain-hero iq');
    hero.append(el('small', '', tr('iq.index')), el('b', 'brain-iq', String(result.index)), el('span', '', tr('iq.correct', { n: result.correct, total: result.total })));
    parts.push(hero);
    parts.push(note(result.percent === null ? tr('iq.calibrating') : tr('iq.percent', { n: result.percent }), 'brain-percent'));
    const bars = el('div', 'brain-bars');
    const bar = (label, value, max, text) => {
      const row = el('div', 'brain-bar');
      const track = el('span', 'brain-bar-track');
      const fill = el('i');
      fill.style.width = `${Math.round((value / max) * 100)}%`;
      track.append(fill);
      row.append(el('span', '', label), track, el('b', '', text));
      return row;
    };
    // Mỗi loại câu 5 câu (ma trận, xoay hình, dãy số, bảng số); thanh thời gian = phần thời gian còn dư.
    const { seconds: spent } = result.strengths;
    const limit = Math.round((screen.round?.limitMs || 1_200_000) / 1000);
    bars.append(
      ...IQ_KINDS.map((kind) => bar(tr(`iq.${kind}`), result.strengths[kind] || 0, 5, `${result.strengths[kind] || 0}/5`)),
      bar(tr('iq.time'), Math.max(0, limit - spent), limit, tr('iq.minutes', { m: Math.floor(spent / 60), s: spent % 60 })),
    );
    parts.push(bars, reviewDots(answers, result.solution));
    if (result.best) parts.push(el('p', 'brain-best', tr('iq.best', { n: result.best })));
    if (!account()) parts.push(signInRow(tr('iq.signIn')));
    parts.push(note(tr('iq.disclaimer'), 'brain-small'));
    const actions = el('div', 'brain-actions');
    actions.append(button('brain-share', tr('share'), () => share('iq', result)), button('chip', tr('iq.retry'), () => {
      screen = null;
      tab = 'iq';
      render();
    }));
    parts.push(actions);
    return parts;
  }

  // ---- Ảnh kết quả 9:16 để đăng TikTok / Zalo: vẽ trên canvas ở máy, không gửi đi đâu ----
  async function share(kind, result) {
    try {
      await document.fonts?.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const g = canvas.getContext('2d');
      const bg = g.createLinearGradient(0, 0, 0, 1920);
      bg.addColorStop(0, '#2c1a42');
      bg.addColorStop(0.55, '#170d20');
      bg.addColorStop(1, '#0d0604');
      g.fillStyle = bg;
      g.fillRect(0, 0, 1080, 1920);
      const glow = g.createRadialGradient(540, 760, 40, 540, 760, 620);
      glow.addColorStop(0, 'rgba(236, 188, 76, .35)');
      glow.addColorStop(1, 'rgba(236, 188, 76, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1080, 1920);
      g.textAlign = 'center';
      const serif = '"Noto Serif", Georgia, serif';
      const sans = '"Be Vietnam Pro", system-ui, sans-serif';
      const logo = await loadImage('/promo-logo.webp').catch(() => null);
      if (logo) {
        g.save();
        g.beginPath();
        g.arc(540, 220, 95, 0, Math.PI * 2);
        g.clip();
        g.drawImage(logo, 445, 125, 190, 190);
        g.restore();
      }
      g.fillStyle = '#ecbc4c';
      g.font = `600 52px ${serif}`;
      g.fillText('LotusGather', 540, 380);
      g.fillStyle = '#f3e6cc';
      const name = String(displayName() || '').slice(0, 30);
      if (kind === 'iq') {
        g.font = `600 70px ${sans}`;
        g.fillText(`🧠 ${tr('card.iq')}`, 540, 520);
        g.font = `600 44px ${sans}`;
        g.fillStyle = '#cdbb9b';
        g.fillText(tr('iq.index'), 540, 620);
        g.fillStyle = '#ffd877';
        g.font = `700 320px ${serif}`;
        g.fillText(String(result.index), 540, 930);
        g.fillStyle = '#f3e6cc';
        g.font = `500 50px ${sans}`;
        g.fillText(tr('iq.correct', { n: result.correct, total: result.total }), 540, 1030);
        if (result.percent !== null) g.fillText(tr('iq.percent', { n: result.percent }), 540, 1100);
        const bars = IQ_KINDS.map((kind) => [tr(`iq.${kind}`), result.strengths[kind] || 0]);
        bars.forEach(([label, value], index) => {
          const y = 1175 + index * 66;
          g.textAlign = 'left';
          g.font = `500 40px ${sans}`;
          g.fillStyle = '#cdbb9b';
          g.fillText(label, 170, y);
          g.textAlign = 'right';
          g.fillStyle = '#f3e6cc';
          g.fillText(`${value}/5`, 910, y);
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fillRect(170, y + 14, 740, 14);
          g.fillStyle = '#ecbc4c';
          g.fillRect(170, y + 14, 740 * (value / 5), 14);
        });
        g.textAlign = 'center';
      } else {
        const scores = todayScores();
        const total = GAMES.reduce((sum, game) => sum + (scores[game] || 0), 0);
        g.font = `600 70px ${sans}`;
        g.fillText(`🧠 ${tr('card.daily')}`, 540, 520);
        g.font = `500 44px ${sans}`;
        g.fillStyle = '#cdbb9b';
        g.fillText(new Date().toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }), 540, 600);
        g.fillStyle = '#ffd877';
        g.font = `700 260px ${serif}`;
        g.fillText(String(total), 540, 860);
        g.font = `600 64px ${sans}`;
        g.fillStyle = '#f3e6cc';
        g.fillText('/ 500', 540, 950);
        if (view?.me?.streak) g.fillText(tr('daily.streak', { n: view.me.streak }), 540, 1040);
        GAMES.forEach((game, index) => {
          const y = 1140 + index * 92;
          const value = scores[game] || 0;
          g.textAlign = 'left';
          g.font = `500 38px ${sans}`;
          g.fillStyle = '#cdbb9b';
          g.fillText(`${ICONS[game]} ${tr(`game.${game}`)}`, 150, y);
          g.textAlign = 'right';
          g.fillStyle = '#f3e6cc';
          g.fillText(String(value), 930, y);
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fillRect(150, y + 18, 780, 16);
          g.fillStyle = '#ecbc4c';
          g.fillRect(150, y + 18, 780 * (value / 100), 16);
        });
        g.textAlign = 'center';
      }
      if (name) {
        g.font = `600 48px ${sans}`;
        g.fillStyle = '#f3e6cc';
        g.fillText(name, 540, 1640);
      }
      g.font = `500 42px ${sans}`;
      g.fillStyle = '#cdbb9b';
      g.fillText(tr('card.free'), 540, 1730);
      g.font = `700 60px ${sans}`;
      g.fillStyle = '#ecbc4c';
      g.fillText('lotusgather.online', 540, 1810);
      if (kind === 'iq') {
        g.font = `400 26px ${sans}`;
        g.fillStyle = 'rgba(243, 230, 204, .55)';
        // Lời ghi chú "cho vui" xuống dòng theo bề ngang ảnh.
        const words = tr('iq.disclaimer').split(' ');
        const lines = [''];
        for (const word of words) {
          const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
          if (g.measureText(next).width > 940 && lines.at(-1)) lines.push(word);
          else lines[lines.length - 1] = next;
        }
        lines.slice(0, 3).forEach((line, index) => g.fillText(line, 540, 1862 + index * 34 - (Math.min(3, lines.length) - 1) * 17));
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas');
      const file = new File([blob], kind === 'iq' ? 'lotusgather-iq.png' : 'lotusgather-tri-tue.png', { type: 'image/png' });
      showCard(blob, file, tr(kind === 'iq' ? 'card.iq' : 'card.daily'));
    } catch {
      showToast(tr('error'));
    }
  }

  // Xem trước ảnh: nút Lưu ảnh (tải về), Chia sẻ (bảng chia sẻ của máy, khi trình duyệt cho gửi file), trên điện thoại
  // nhấn giữ ảnh cũng lưu được. Không tự mở bảng chia sẻ: máy tính thường không có mục lưu ảnh trong đó.
  let card = null;
  function closeCard() {
    if (!card) return;
    URL.revokeObjectURL(card.url);
    card.node.remove();
    card = null;
  }
  function showCard(blob, file, title) {
    closeCard();
    const url = URL.createObjectURL(blob);
    const node = el('div', 'brain-card');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-label', title);
    const image = Object.assign(document.createElement('img'), { src: url, alt: title });
    const actions = el('div', 'brain-actions');
    const save = Object.assign(el('a', 'brain-share', tr('card.save')), { href: url, download: file.name });
    actions.append(save);
    if (navigator.canShare?.({ files: [file] })) actions.append(button('brain-start', tr('card.share'), () => navigator.share({ files: [file], title }).catch(() => {})));
    actions.append(button('chip', tr('close'), closeCard));
    node.append(image, note(tr('card.hint'), 'brain-small'), actions);
    node.addEventListener('click', (event) => { if (event.target === node) closeCard(); });
    stage.append(node);
    card = { node, url };
  }

  // ---- Đấu trí 1–1 ----
  // Máy realtime làm trọng tài (challenge.state game 'brain'); đề lấy bằng mã đề riêng (state.duel.roundId) qua API,
  // nộp bài qua API rồi báo phòng challenge.check. duel: { challengeId, state, rival, rivalId, side, problem, mine }.
  let duel = null;
  const clockText = (ms) => {
    const total = Math.round((ms || 0) / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  const rivalSide = () => (duel.side === 'from' ? 'to' : 'from');
  const send = (message) => sendRoom({ ...message, challengeId: duel.challengeId });

  function duelLine() {
    const line = el('p', 'brain-duel-line');
    line.dataset.duelLine = '1';
    fillDuelLine(line);
    return line;
  }
  function fillDuelLine(line) {
    const done = duel?.state.answered?.[rivalSide()];
    line.textContent = done ? tr('duel.rivalDone', { name: duel.rival }) : tr('duel.rivalWorking', { name: duel.rival });
    line.classList.toggle('done', Boolean(done));
  }

  function onDuel(state, info) {
    if (duel && duel.challengeId !== state.challengeId && duel.state.status === 'playing') return;
    if (['declined', 'cancelled', 'expired'].includes(state.status)) {
      if (duel?.challengeId !== state.challengeId) return;
      stopActive();
      stopActive = () => {};
      duel = null;
      if (screen?.type === 'play' || screen?.type?.startsWith('duel')) screen = null;
      sheet.hidden = true;
      return;
    }
    if (duel?.challengeId !== state.challengeId) {
      stopActive();
      stopActive = () => {};
      closeCard();
      duel = { challengeId: state.challengeId, problem: null, mine: null, loading: false };
      sheet.hidden = false;
    }
    Object.assign(duel, info, { state });
    if (state.status === 'finished') {
      stopActive();
      stopActive = () => {};
      screen = { type: 'duel-result' };
      render();
      return;
    }
    if (state.duel && !duel.problem && !duel.mine && !duel.loading) loadDuel();
    if (screen?.type === 'play' && screen.game === 'duel') {
      // Đang làm bài: chỉ cập nhật dòng đối thủ, không vẽ lại đề.
      const line = sheet.querySelector('[data-duel-line]');
      if (line) fillDuelLine(line);
      return;
    }
    screen = { type: 'duel-wait' };
    render();
  }

  async function loadDuel() {
    duel.loading = true;
    const current = duel;
    const response = await api('/api/v1/brain/duel', { roundId: current.state.duel.roundId }).catch(() => null);
    current.loading = false;
    if (duel !== current || current.state.status !== 'playing') return;
    if (!response?.ok) {
      showToast(errorText(response?.data?.code));
      cancelDuel();
      return;
    }
    current.problem = response.data;
    const limitMs = Math.max(5_000, response.data.limitMs - response.data.elapsed);
    screen = { type: 'play', game: 'duel', round: { roundId: current.state.duel.roundId, problem: response.data.problem, limitMs } };
    render();
  }

  async function submitDuel(round, answers) {
    const current = duel;
    if (!current) return;
    screen = { type: 'duel-wait' };
    current.submitting = true;
    render();
    const response = await api('/api/v1/brain/answer', { roundId: round.roundId, answers }).catch(() => null);
    current.submitting = false;
    if (response?.ok) current.mine = { ...response.data, answers };
    else {
      showToast(errorText(response?.data?.code));
      current.mine = { correct: 0, total: round.problem.items.length, ms: null, answers, failed: true };
    }
    if (duel === current) {
      send({ type: 'challenge.check' });
      if (screen?.type === 'duel-wait') render();
    }
  }

  function cancelDuel() {
    if (duel && ['pending', 'playing'].includes(duel.state.status)) send({ type: 'challenge.cancel' });
    stopActive();
    stopActive = () => {};
    duel = null;
    screen = null;
    sheet.hidden = true;
  }

  function duelWaitPage() {
    const parts = [];
    const hero = el('div', 'brain-hero');
    if (!duel.mine) {
      hero.append(el('span', 'brain-hero-icon', '🧩'), el('b', '', tr(duel.submitting ? 'submitting' : 'duel.loading')));
      parts.push(hero, note(tr('duel.rules'), 'brain-small'));
    } else {
      hero.append(el('span', 'brain-hero-icon', '⏳'), el('b', '', duel.mine.failed ? tr('duel.notCounted') : tr('duel.yourScore', { n: duel.mine.correct, total: duel.mine.total, time: clockText(duel.mine.ms) })));
      parts.push(hero, duelLine(), note(tr('duel.waitRival', { name: duel.rival }), 'brain-small'));
    }
    return parts;
  }

  function duelResultPage() {
    const { result, winner } = duel.state;
    const me = duel.side;
    const them = rivalSide();
    const outcome = winner === 'draw' ? 'draw' : winner === me ? 'win' : 'lose';
    const parts = [];
    const hero = el('div', `brain-hero duel ${outcome}`);
    hero.append(
      el('span', 'brain-hero-icon', outcome === 'win' ? '🏆' : outcome === 'draw' ? '🤝' : '💪'),
      el('b', 'brain-big', outcome === 'win' ? tr('duel.win') : outcome === 'draw' ? tr('duel.draw') : tr('duel.lose', { name: duel.rival })),
    );
    parts.push(hero);
    const table = el('div', 'brain-duel-table');
    for (const [side, name] of [[me, tr('duel.you')], [them, duel.rival]]) {
      const row = el('div', `brain-duel-row${winner === side ? ' winner' : ''}`);
      row.append(el('span', 'brain-name', name), el('b', '', tr('duel.correct', { n: result[side].correct, total: result.total })), el('small', '', clockText(result[side].ms)));
      table.append(row);
    }
    parts.push(table, note(tr('duel.rules'), 'brain-small'));
    if (duel.mine?.solution) parts.push(reviewDots(duel.mine.answers, duel.mine.solution));
    const actions = el('div', 'brain-actions');
    const rivalId = duel.rivalId;
    actions.append(
      button('brain-start', tr('duel.again'), () => {
        duel = null;
        screen = null;
        sheet.hidden = true;
        sendRoom({ type: 'challenge.send', targetId: rivalId, game: 'brain' });
      }),
      button('chip', tr('close'), () => {
        duel = null;
        close();
      }),
    );
    parts.push(actions);
    return parts;
  }

  // ---- Đố vui nhiều người (quiz.state của phòng; máy realtime điều khiển ván, giữ đáp án) ----
  let quiz = null;
  // Lựa chọn của mình ở câu đang hỏi { round, index, choice } (server không gửi lại lựa chọn của ai).
  let quizPick = null;
  let quizKey = '';
  let quizNotified = 0;
  let quizClock = { key: '', start: 0 };
  let quizFrame = 0;
  const quizMe = () => quiz?.players.find((player) => player.id === selfId()) || null;
  const quizQueued = () => Boolean(quiz?.lobby.some((person) => person.id === selfId()));
  const quizChoice = () => (quizPick && quiz && quizPick.round === quiz.round && quizPick.index === quiz.index ? quizPick.choice : null);

  function onQuiz(message) {
    const before = quiz;
    quiz = message;
    const mine = quizMe();
    // Một ván sắp bắt đầu mà mình chưa tham gia: nhắc một lần (khi bảng đang đóng).
    if (message.phase === 'lobby' && message.endsAt && !quizQueued() && quizNotified !== message.endsAt) {
      quizNotified = message.endsAt;
      if (sheet.hidden) showToast(tr('quiz.toast'));
    }
    // Mình đang chơi mà sang câu mới: bảng đang đóng thì mở thẳng thẻ Đố vui; đang ở thẻ khác (không chơi trò khác) thì chuyển.
    const fresh = message.phase === 'question' && (!before || before.phase !== 'question' || before.index !== message.index || before.round !== message.round);
    if (mine?.alive && fresh) {
      if (sheet.hidden && !duel) {
        tab = 'quiz';
        screen = null;
        sheet.hidden = false;
        load();
      } else if (!screen && tab !== 'quiz') tab = 'quiz';
    }
    if (!sheet.hidden && !screen && tab === 'quiz') renderQuizInPlace();
  }

  // Đang hỏi cùng một câu: chỉ cập nhật dòng "còn / đã trả lời", không vẽ lại đề.
  function renderQuizInPlace() {
    const key = quiz ? [quiz.phase, quiz.round, quiz.index ?? '', quiz.phase === 'question' ? '' : `${quiz.lobby.length}:${quiz.players.length}:${quiz.endsAt || 0}`].join(':') : '';
    if (key === quizKey && quiz?.phase === 'question') {
      const status = sheet.querySelector('[data-quiz-status]');
      if (status) {
        fillQuizStatus(status);
        return;
      }
    }
    quizKey = key;
    render();
  }

  function fillQuizStatus(node) {
    const alive = quiz.players.filter((player) => player.alive);
    node.textContent = tr('quiz.status', { alive: alive.length, answered: alive.filter((player) => player.answered).length });
  }

  // Đồng hồ theo giờ server tới quiz.endsAt; text: lobby "bắt đầu sau…", câu hỏi: thanh + số giây.
  function quizCountdown(node, format) {
    const key = [quiz.phase, quiz.round, quiz.index ?? ''].join(':');
    if (quizClock.key !== key) quizClock = { key, start: serverNow() };
    const end = quiz.endsAt || serverNow();
    cancelAnimationFrame(quizFrame);
    const tick = () => {
      if (!node.isConnected) return;
      const left = Math.max(0, end - serverNow());
      format(left, Math.max(1, end - quizClock.start));
      if (left > 0) quizFrame = requestAnimationFrame(tick);
    };
    quizFrame = requestAnimationFrame(tick);
    format(Math.max(0, end - serverNow()), Math.max(1, end - quizClock.start));
  }

  function quizPage() {
    const parts = [];
    const join = (label) => button('brain-start', label, () => sendRoom({ type: 'quiz.join' }));
    // Thành viên: số ván thắng 7 ngày qua (Bảng vàng Đố vui).
    const record = view?.me?.quiz?.plays ? note(tr('quiz.myWins', { n: view.me.quiz.wins, plays: view.me.quiz.plays }), 'brain-best') : null;
    if (!quiz || quiz.phase === 'idle') {
      parts.push(note(tr('quiz.intro')), note(tr('quiz.rules'), 'brain-small'), join(tr('quiz.join')));
      if (record) parts.push(record);
      return parts;
    }
    const mine = quizMe();
    const queued = quizQueued();
    if (quiz.phase === 'lobby') {
      const loading = quiz.players.length > 0;
      parts.push(note(tr('quiz.rules'), 'brain-small'));
      const status = el('p', 'brain-percent');
      if (loading) status.textContent = tr('quiz.loading');
      else if (quiz.endsAt) quizCountdown(status, (left) => { status.textContent = tr('quiz.starts', { s: Math.ceil(left / 1000) }); });
      else status.textContent = tr('quiz.needMore');
      parts.push(status);
      const people = loading ? quiz.players : quiz.lobby;
      if (people.length) {
        const list = el('div', 'brain-quiz-people');
        for (const person of people) list.append(el('span', person.id === selfId() ? 'me' : '', person.displayName));
        parts.push(list);
      }
      if (!loading) parts.push(queued ? button('chip', tr('quiz.leave'), () => sendRoom({ type: 'quiz.leave' })) : join(tr('quiz.join')));
      return parts;
    }
    if (quiz.phase === 'question' || quiz.phase === 'reveal') {
      const top = el('div', 'brain-play-top');
      const timer = el('div', 'brain-timer');
      const fill = el('i');
      const label = el('b');
      timer.append(fill, label);
      if (quiz.phase === 'question') {
        quizCountdown(timer, (left, total) => {
          fill.style.width = `${(left / total) * 100}%`;
          label.textContent = seconds(left);
          timer.classList.toggle('low', left < 5_000);
        });
      } else {
        fill.style.width = '0%';
        label.textContent = tr('quiz.answerIs');
      }
      top.append(el('b', 'brain-counter', tr('question', { n: quiz.index + 1, total: quiz.total })), timer);
      const status = el('p', 'brain-duel-line');
      status.dataset.quizStatus = '1';
      fillQuizStatus(status);
      parts.push(top, status);
      const ask = el('p', 'brain-ask');
      const board = el('div', 'brain-question');
      const options = el('div');
      const myChoice = quizChoice();
      const canPick = quiz.phase === 'question' && mine?.alive && myChoice === null;
      fillQuestion(quiz.question, quiz.question.kind, { ask, board, options }, (choice) => {
        if (quiz.phase !== 'question' || !quizMe()?.alive || quizChoice() !== null) return;
        quizPick = { round: quiz.round, index: quiz.index, choice };
        sendRoom({ type: 'quiz.answer', index: quiz.index, choice });
        render();
      });
      [...options.children].forEach((node, choice) => {
        if (choice === myChoice) node.classList.add('picked');
        if (quiz.phase === 'reveal' && choice === quiz.answer) node.classList.add('correct');
        if (quiz.phase === 'reveal' && choice === myChoice && choice !== quiz.answer) node.classList.add('wrong');
        if (!canPick) node.disabled = true;
      });
      parts.push(ask, board, options);
      let line = '';
      if (!mine) line = tr('quiz.watching');
      else if (quiz.phase === 'question') line = !mine.alive ? tr('quiz.out') : myChoice !== null ? tr('quiz.picked') : '';
      else if (quiz.allWrong) line = tr('quiz.allWrong');
      else line = quiz.eliminated.includes(selfId()) ? tr('quiz.youOut') : mine.alive ? tr('quiz.youRight') : tr('quiz.out');
      if (line) parts.push(note(line, 'brain-percent'));
      if (quiz.phase === 'reveal' && !quiz.allWrong) parts.push(note(tr('quiz.eliminated', { n: quiz.eliminated.length }), 'brain-small'));
      if (!mine) parts.push(queued ? note(tr('quiz.queued'), 'brain-small') : join(tr('quiz.joinNext')));
      return parts;
    }
    // Kết quả.
    const nameOf = (id) => quiz.players.find((player) => player.id === id)?.displayName || '?';
    const names = quiz.winners.map(nameOf);
    const iWin = quiz.winners.includes(selfId());
    const hero = el('div', 'brain-hero');
    hero.append(
      el('span', 'brain-hero-icon', names.length ? '🏆' : '🌱'),
      el('b', 'brain-big', iWin ? tr(names.length > 1 ? 'quiz.youShare' : 'quiz.youWin', { n: names.length })
        : names.length === 1 ? tr('quiz.winner', { name: names[0] }) : names.length ? tr('quiz.winners', { n: names.length }) : tr('quiz.noWinner')),
    );
    parts.push(hero);
    if (names.length > 1) {
      const list = el('div', 'brain-quiz-people');
      for (const id of quiz.winners) list.append(el('span', id === selfId() ? 'me' : '', nameOf(id)));
      parts.push(list);
    }
    parts.push(queued ? note(tr('quiz.queued'), 'brain-small') : join(tr('quiz.joinNext')));
    return parts;
  }

  // ---- Vẽ ----
  function render() {
    if (sheet.hidden) return;
    const parts = [];
    if (!screen) {
      parts.push(head(`🧠 ${tr('title')}`), tabs());
      if (!view) parts.push(note(failed ? tr('error') : tr('loading')));
      parts.push(...(tab === 'daily' ? dailyPage() : tab === 'iq' ? iqPage() : tab === 'quiz' ? quizPage() : boardPage()));
    } else if (screen.type === 'howto') {
      parts.push(head(tr(`game.${screen.game}`), () => {
        screen = null;
        render();
      }), ...howtoPage(screen.game));
    } else if (screen.type === 'play') {
      const { game, round } = screen;
      const quit = () => {
        stopActive();
        stopActive = () => {};
        screen = game === 'iq' ? null : { type: 'howto', game };
        render();
      };
      if (game === 'duel') {
        parts.push(head(`🧩 ${tr('duel.title')}`, cancelDuel), duelLine());
      } else parts.push(head(game === 'iq' ? tr('card.iq') : tr(`game.${game}`), quit));
      if (round.practice && round.previous !== null && account()) parts.push(note(tr('result.practice'), 'brain-small'));
      parts.push(game === 'bells' ? bellsPlay(round) : game === 'math' || game === 'stroop' ? speedPlay(game, round) : quizPlay(game, round));
      if (game === 'iq' || game === 'duel') parts.push(button('chip brain-submit', tr('iq.submit'), () => submit(game, round, [...liveAnswers])));
    } else if (screen.type === 'duel-wait') {
      parts.push(head(`🧩 ${tr('duel.title')}`, cancelDuel), ...duelWaitPage());
    } else if (screen.type === 'duel-result') {
      parts.push(head(`🧩 ${tr('duel.title')}`), ...duelResultPage());
    } else if (screen.type === 'submitting') {
      parts.push(head(tr(screen.game === 'iq' ? 'card.iq' : `game.${screen.game}`)), note(tr('submitting'), 'brain-wait'));
    } else if (screen.type === 'result') {
      const back = () => {
        screen = null;
        render();
      };
      parts.push(head(screen.game === 'iq' ? tr('card.iq') : tr(`game.${screen.game}`), back));
      parts.push(...(screen.game === 'iq' ? iqResultPage(screen) : resultPage(screen)));
    }
    sheet.classList.toggle('playing', screen?.type === 'play');
    sheet.replaceChildren(...parts);
  }

  function close() {
    if (duel && duel.state.status === 'playing') {
      cancelDuel();
      return;
    }
    if (duel?.state.status === 'finished') duel = null;
    stopActive();
    stopActive = () => {};
    closeCard();
    if (screen?.type === 'play' || screen?.type === 'submitting' || screen?.type?.startsWith('duel')) screen = null;
    sheet.hidden = true;
  }

  onLangChange(() => {
    if (screen?.type !== 'play') render();
  });

  return {
    open(name) {
      // Mở thẳng một thẻ (thông báo nhắc Đề hôm nay, video giới thiệu): bỏ màn hướng dẫn trò còn để lại từ lần trước.
      if (name) {
        tab = name;
        if (screen?.type === 'howto') screen = null;
      }
      sheet.hidden = false;
      if (screen?.type === 'result') screen = null;
      render();
      load();
    },
    close,
    // Trận Đấu trí (player-social.js chuyển challenge.state của game 'brain' sang đây).
    duel: onDuel,
    // Đố vui nhiều người (quiz.state của phòng).
    onQuiz,
    // Xin vào ván Đố vui kế tiếp (như nút Tham gia ở thẻ Đố vui).
    joinQuiz: () => sendRoom({ type: 'quiz.join' }),
    get isOpen() { return !sheet.hidden; },
    // Tải lại Đề hôm nay của mình (cũng gọi onDaily); trả dailyStatus() — null với khách / lỗi mạng.
    async checkDaily() {
      if (!account()) {
        onDaily(null);
        return null;
      }
      await load();
      return dailyStatus();
    },
    reminder,
    accountChanged() {
      view = null;
      if (!sheet.hidden) load();
    },
  };
}
