// Trang Tiến Lên (/tien-len.html): sảnh chọn bàn + bàn chơi. Máy realtime giữ bài và làm trọng tài; trang chỉ hiện bài
// của mình, kiểm tra trước nước đánh bằng chính luật của server (/shared/tien-len.mjs) để sáng nút Đánh / gợi ý.
// Tên người chơi chỉ đưa ra màn hình qua textContent.
import { currentCinemaHref } from '/region-cinema.js';
import { beats, classify, isFreeChop, playOptions, rankOf, RANKS, smartSelect, suitOf, SUITS, TIENLEN_MODES, TIENLEN_STAKES, tienLenMinCoins } from '/shared/tien-len.mjs';

const PROTOCOL_VERSION = 3;
const ROOM_ID = 'tienlen-1';
const SEATS = 4;
const TURN_MS = 20_000;
const AVATARS = { man: '👨', woman: '👩', granny: '👵', nun: '🧕', monk: '🧘', child: '🧒', pilgrim: '🧑', lotusgirl: '👧', chibigirl: '👧', swordsman: '🥷' };
const MODE_NAMES = { rank: 'A · Xếp hạng', count: 'B · Đếm lá' };
const WHITE_NAMES = { 'four-twos': 'Tứ quý 2', dragon: 'Sảnh rồng', 'six-pairs': '6 đôi', 'five-pairs': '5 đôi thông' };
const REASONS = { chop: 'bị chặt', last: 'về bét', third: 'về ba', cong: 'cóng', cards: 'lá còn lại', leftover: 'thối heo / hàng', white: 'tới trắng' };
const RANK_NAMES = ['', '🥇 Nhất', '🥈 Nhì', '🥉 Ba', 'Bét'];
const PHASE_NAMES = { waiting: 'Đang chờ', starting: 'Sắp chia bài', playing: 'Đang chơi', result: 'Xem kết quả' };
const ERROR_TEXT = {
  SIGN_IN_REQUIRED: 'Đăng nhập ở cổng chùa để chơi bằng xu',
  FORBIDDEN: 'Đăng nhập ở cổng chùa để chơi bằng xu',
};

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['lobbyView', 'roomChip', 'balance', 'online', 'playing', 'modes', 'stakes', 'deposit', 'quick', 'open', 'signIn', 'message',
  'tables', 'board', 'leave', 'tableInfo', 'seatTop', 'seatLeft', 'seatRight', 'flash', 'pile', 'whoPlayed', 'status', 'result', 'boardMessage',
  'meName', 'meTag', 'meCoins', 'turnbar', 'turnbarFill', 'hand', 'sort', 'hint', 'pass', 'play', 'rules', 'rulesOpen', 'rulesOpen2', 'rulesClose',
  'travelToggle', 'travelPanel', 'idleBar', 'idleText', 'idleBack', 'net', 'notice', 'noticeTitle', 'noticeText', 'noticeLower', 'noticeGarden',
  'noticeClose', 'autoPick'].map((id) => [id, $(id)]));

let coins = null;
let signedIn = false;
let stake = 50;
let mode = 'rank';
let lobby = null;
let people = 0;
let table = null;
let selected = new Set();
let sortBySuit = false;
let hintIndex = -1;
let lastMoveKey = '';
// Tự chọn bộ khi chạm bài (bật / tắt, nhớ ở máy).
let autoPick = true;
// Đã ẩn màn kết quả của ván này (bấm "Ở lại") — ván mới thì hiện lại.
let resultHiddenFor = 0;
// Trạng thái mạng: 'down' đang mất kết nối, 'back' vừa nối lại (hiện 2,5 giây).
let netState = '';
let netTimer = null;
// Lý do bị đưa ra khỏi bàn (không đủ xu / treo máy lâu) vừa nhận: { code, text, at } — về sảnh thì hiện hộp thông báo.
let leaveReason = null;
let clockOffset = 0;
let socket = null;
let session = null;
let myName = '';
const serverNow = () => Date.now() + clockOffset;
const money = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('vi-VN')} xu`;
const short = (value) => (value >= 1_000 ? `${value / 1_000}K` : String(value));
const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};

function say(text, tone = '') {
  el.message.textContent = text;
  el.message.className = `message ${tone}`;
}
function boardSay(text, tone = '') {
  el.boardMessage.textContent = text;
  el.boardMessage.className = `board-message ${tone}`;
}

const COMBO_NAMES = { single: 'rác', pair: 'đôi', triple: 'sám', quad: 'tứ quý' };
const comboName = (cards) => {
  const combo = classify(cards);
  if (!combo) return 'bộ';
  if (combo.type === 'straight') return `sảnh ${combo.size} lá`;
  if (combo.type === 'pairs') return `${combo.size} đôi thông`;
  return COMBO_NAMES[combo.type];
};
function renderAutoPick() {
  el.autoPick.textContent = autoPick ? '🪄 Tự chọn: bật' : '🪄 Tự chọn: tắt';
  el.autoPick.setAttribute('aria-pressed', String(autoPick));
}

const send = (type, body = {}) => {
  if (socket?.readyState !== WebSocket.OPEN) {
    (table ? boardSay : say)('Đang kết nối lại bàn…', 'lose');
    return false;
  }
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId: `${type.replace('.', '-')}-${crypto.randomUUID()}`, ...body }));
  return true;
};

// ---- Lá bài ----
function cardNode(card) {
  const item = node('span', `card${suitOf(card) >= 2 ? ' red' : ''}`);
  item.dataset.card = String(card);
  item.append(node('span', 'r', RANKS[rankOf(card)]), node('span', 's', SUITS[suitOf(card)]), node('span', 'big', SUITS[suitOf(card)]));
  item.setAttribute('aria-label', `${RANKS[rankOf(card)]}${SUITS[suitOf(card)]}`);
  return item;
}
const sortedHand = (hand) => [...hand].sort(sortBySuit ? (a, b) => suitOf(a) - suitOf(b) || a - b : (a, b) => a - b);
// Bài lật lúc hết ván (lá nhỏ, xếp theo thứ tự).
function miniHand(cards, empty = '') {
  const box = node('div', 'mini-hand');
  if (!cards.length) box.append(node('span', 'mini-empty', empty));
  for (const card of [...cards].sort((a, b) => a - b)) box.append(cardNode(card));
  return box;
}

// ---- Sảnh ----
for (const value of TIENLEN_STAKES) {
  const button = node('button');
  button.type = 'button';
  button.dataset.stake = String(value);
  button.append(String(short(value)));
  el.stakes.append(button);
}

// Ngồi bàn cần ít nhất 10 lần mức cược trong ví (server kiểm tra lại lúc vào bàn và đầu mỗi ván).
const canAfford = (value) => coins === null || coins >= tienLenMinCoins(value);

function renderLobby() {
  el.balance.textContent = coins === null ? '—' : coins.toLocaleString('vi-VN');
  for (const button of el.modes.children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  for (const button of el.stakes.children) {
    const value = Number(button.dataset.stake);
    button.setAttribute('aria-pressed', String(value === stake));
    button.disabled = signedIn && !canAfford(value);
  }
  el.deposit.replaceChildren('1 phần = ', node('b', '', `${stake.toLocaleString('vi-VN')} xu`), ' · cần ít nhất ',
    node('b', '', `${tienLenMinCoins(stake).toLocaleString('vi-VN')} xu`), ' trong ví để ngồi');
  el.signIn.hidden = signedIn;
  el.online.textContent = `👥 ${people} người trong sảnh`;
  el.playing.textContent = lobby ? `${lobby.playing} bàn đang chơi` : '';
  const tables = lobby?.tables || [];
  if (!tables.length) {
    el.tables.replaceChildren(node('li', 'empty', 'Chưa có bàn nào · bấm Tạo bàn'));
    return;
  }
  el.tables.replaceChildren(...tables.map((item) => {
    const row = node('li');
    const amount = node('span', 'amount', `${short(item.stake)} xu`);
    amount.append(node('small', '', item.mode === 'rank' ? 'A · Xếp hạng' : 'B · Đếm lá'));
    const who = node('span', 'who');
    who.append(node('span', '', item.players.map((player) => `${AVATARS[player.skin] || '🙂'} ${player.displayName}`).join(' · ')),
      node('small', '', `${item.players.length}/${SEATS} người · ${PHASE_NAMES[item.phase]}`));
    const join = node('button', '', 'Vào');
    join.type = 'button';
    join.dataset.table = item.id;
    join.disabled = item.players.length >= SEATS || item.phase === 'playing' || (signedIn && !canAfford(item.stake));
    row.append(amount, who, join);
    return row;
  }));
}

// ---- Bàn chơi ----
const relative = (seat) => (seat - (table?.seat ?? 0) + SEATS) % SEATS;
const seatBox = (offset) => ({ 1: el.seatRight, 2: el.seatTop, 3: el.seatLeft })[offset];
const nameOf = (seat) => table?.players[seat]?.displayName || '…';
const myTurn = () => table?.phase === 'playing' && table.turn === table.seat;

function tagOf(player, seat) {
  if (!player) return ['', ''];
  if (table.phase === 'result' && table.result?.ranks[seat]) {
    if (player.cong) return ['Cóng', 'bad'];
    const rank = table.result.ranks[seat];
    const last = rank === table.players.filter(Boolean).length && rank > 1;
    return [last ? 'Bét' : RANK_NAMES[rank] || '', last ? 'bad' : 'rank'];
  }
  if (player.cong) return ['Cóng', 'bad'];
  if (player.rank) return [`${RANK_NAMES[player.rank] || ''} · hết bài`, 'rank'];
  if (player.leaving) return ['Rời sau ván', ''];
  if (player.away) return ['Mất kết nối · đánh hộ', 'bad'];
  if (player.missed >= 2) return ['Đang tự đánh', 'bad'];
  if (player.passed) return ['Bỏ lượt', 'pass'];
  return ['', ''];
}

function renderSeat(seat) {
  const box = seatBox(relative(seat));
  const player = table.players[seat];
  box.className = `seat ${({ 1: 'right', 2: 'top', 3: 'left' })[relative(seat)]}${player ? '' : ' empty'}${table.phase === 'playing' && table.turn === seat ? ' turn' : ''}`;
  const avatar = node('div', 'avatar', player ? AVATARS[player.skin] || '🙂' : '＋');
  if (player && table.phase === 'playing' && table.turn === seat) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 64 64');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '32');
    circle.setAttribute('cy', '32');
    circle.setAttribute('r', '29');
    circle.dataset.ring = '1';
    ring.append(circle);
    avatar.append(ring);
  }
  const parts = [avatar, node('div', 'name', player ? player.displayName : 'Ghế trống')];
  if (player && ['playing', 'result'].includes(table.phase) && player.cards >= 0) {
    parts.push(node('div', `count${player.cards && player.cards <= 2 ? ' few' : ''}`, String(player.cards)));
  }
  const [tag, tone] = tagOf(player, seat);
  parts.push(node('div', `tag ${tone}`, tag));
  // Hết ván: lật bài còn lại của người này.
  const revealed = table.phase === 'result' ? table.result?.hands?.[seat] : null;
  if (player && revealed?.length) parts.push(miniHand(revealed));
  box.replaceChildren(...parts);
}

function renderHand() {
  const hand = table?.hand || [];
  for (const card of [...selected]) if (!hand.includes(card)) selected.delete(card);
  const cards = sortedHand(hand).map((card) => {
    const item = cardNode(card);
    if (selected.has(card)) item.classList.add('on');
    return item;
  });
  // Xòe vừa bề ngang: chồng lá nhiều hay ít tùy số lá.
  const width = el.hand.clientWidth || 360;
  const step = cards.length > 1 ? Math.min(46, (width - 56) / (cards.length - 1)) : 0;
  el.hand.style.setProperty('--overlap', `${Math.round(step - 56)}px`);
  el.hand.replaceChildren(...cards);
}

// Nước mình định đánh có hợp lệ không (cùng luật với server).
function selectionPlayable() {
  if (!table || table.phase !== 'playing' || !selected.size) return false;
  const cards = [...selected];
  const combo = classify(cards);
  if (!combo) return false;
  const top = table.top ? classify(table.top.cards) : null;
  if (!myTurn()) return Boolean(top) && table.top.seat !== table.seat && isFreeChop(top, combo);
  if (table.mustInclude !== undefined && !cards.includes(table.mustInclude)) return false;
  return beats(top, combo);
}

function renderButtons() {
  const playing = table?.phase === 'playing';
  el.play.disabled = !selectionPlayable();
  el.play.textContent = playing && !myTurn() && selectionPlayable() ? '💥 Chặt' : 'Đánh';
  el.pass.disabled = !myTurn() || !table.top;
  el.hint.disabled = !playing || !myTurn();
  el.sort.disabled = !(table?.hand || []).length;
}

function statusText() {
  if (!table) return '';
  const left = Math.max(0, Math.ceil(((table.deadline || 0) - serverNow()) / 1_000));
  if (table.phase === 'waiting') return 'Đang chờ thêm người · đủ 2 người là chia bài';
  if (table.phase === 'starting') return `Chia bài sau ${left}s`;
  if (table.phase === 'result') return `Ván mới sau ${left}s`;
  if (table.phase !== 'playing') return '';
  if (myTurn()) return table.lead ? `Tới lượt bạn · mở vòng · ${left}s` : `Tới lượt bạn · ${left}s`;
  return `Lượt của ${nameOf(table.turn)} · ${left}s`;
}

function renderCenter() {
  const top = table.phase === 'playing' ? table.top : null;
  el.pile.replaceChildren(...(top ? top.cards.map(cardNode) : []));
  const last = table.last;
  let who = '';
  if (top) who = top.seat === table.seat ? 'Bạn vừa đánh' : `${nameOf(top.seat)} đánh`;
  else if (table.phase === 'playing' && last?.action === 'pass') who = `${last.seat === table.seat ? 'Bạn' : nameOf(last.seat)} bỏ lượt · hết vòng`;
  el.whoPlayed.textContent = who;
  el.status.replaceChildren(statusText());
}

// Một khoản trong màn kết quả, nhìn từ phía mình: [nội dung, số xu (+ nhận / − trả)].
function lineText(line) {
  const me = table.seat;
  const xu = line.coins;
  const who = (seat) => (seat === me ? 'bạn' : nameOf(seat));
  const mine = line.from === me ? -xu : line.to === me ? xu : 0;
  const text = {
    chop: `${who(line.to)} chặt ${who(line.from)}`,
    last: `${who(line.from)} về bét → trả ${who(line.to)}`,
    third: `${who(line.from)} về ba → trả ${who(line.to)} (nhì)`,
    cong: `${who(line.from)} cóng → trả ${who(line.to)}`,
    cards: `${who(line.from)} còn ${line.units} lá → trả ${who(line.to)}`,
    leftover: `${who(line.from)} thối heo / hàng → trả ${who(line.to)}`,
    white: `${who(line.from)} thua trắng → trả ${who(line.to)}`,
  }[line.reason];
  return [text.charAt(0).toUpperCase() + text.slice(1), mine];
}

function renderResult() {
  const result = table?.phase === 'result' ? table.result : null;
  el.result.hidden = !result || resultHiddenFor === table.game;
  if (!result) return;
  const rows = [];
  for (let seat = 0; seat < SEATS; seat += 1) if (result.ranks[seat]) rows.push(seat);
  rows.sort((a, b) => result.ranks[a] - result.ranks[b]);
  const list = node('ol');
  for (const seat of rows) {
    const player = table.players[seat];
    const item = node('li', seat === table.seat ? 'mine' : '');
    const net = result.nets[seat] ?? 0;
    const [tag] = tagOf(player, seat);
    item.append(node('span', '', tag.split(' ')[0] || '·'), node('b', '', seat === table.seat ? `${player?.displayName || 'Bạn'} (bạn)` : player?.displayName || '…'),
      node('span', net >= 0 ? 'plus' : 'minus', money(net)));
    // Lật bài: bài còn lại của từng người; tới trắng thì đủ 13 lá của người thắng.
    if (result.hands?.[seat]) item.append(miniHand(result.hands[seat], 'Hết bài'));
    list.append(item);
  }
  const title = result.white ? `Tới trắng · ${WHITE_NAMES[result.white]}` : `Kết quả ván ${table.game}`;
  const parts = [node('h3', '', title)];
  // Sau ván không còn đủ 10 lần mức cược: báo ngay dưới tiêu đề (thấy liền, không phải cuộn), hết đếm ngược sẽ rời bàn.
  const broke = result.after !== undefined && result.after < table.minCoins;
  if (broke) {
    parts.push(node('p', 'result-warn', `⚠️ Bạn còn ${result.after.toLocaleString('vi-VN')} xu, không đủ ${table.minCoins.toLocaleString('vi-VN')} xu (10 lần mức cược) để chơi tiếp bàn này. Hết đếm ngược bạn sẽ rời bàn.`));
  }
  parts.push(list);
  // Từng khoản: của mình trước (thắng / thua, chặt, thối, cóng), rồi các khoản khác.
  const lines = result.lines.filter((line) => line.coins > 0);
  const mineLines = lines.filter((line) => line.from === table.seat || line.to === table.seat);
  if (mineLines.length || result.cut || result.before !== undefined) {
    const box = node('div', 'ledger');
    box.append(node('p', 'ledger-title', 'Khoản của bạn'));
    for (const line of mineLines) {
      const [text, amount] = lineText(line);
      const row = node('p', 'ledger-row');
      row.append(node('span', '', text), node('b', amount >= 0 ? 'plus' : 'minus', money(amount)));
      box.append(row);
    }
    if (result.cut) {
      const row = node('p', 'ledger-row');
      row.append(node('span', '', 'Phế 5% phần thắng'), node('b', 'minus', money(-result.cut)));
      box.append(row);
    }
    if (result.net !== undefined) {
      const row = node('p', 'ledger-row total');
      row.append(node('span', '', 'Tổng ván này'), node('b', result.net >= 0 ? 'plus' : 'minus', money(result.net)));
      box.append(row);
    }
    if (result.before !== undefined && result.after !== undefined) {
      box.append(node('p', 'ledger-balance', `Số dư: ${result.before.toLocaleString('vi-VN')} → ${result.after.toLocaleString('vi-VN')} xu`));
    } else if (result.ranks[table.seat]) box.append(node('p', 'ledger-balance', 'Đang chốt tiền…'));
    parts.push(box);
  }
  const others = lines.filter((line) => line.from !== table.seat && line.to !== table.seat);
  if (others.length) {
    parts.push(node('p', 'lines', others.slice(0, 8).map((line) => `${lineText(line)[0]}: ${line.coins.toLocaleString('vi-VN')} xu`).join(' · ')));
  }
  const countdown = node('p', 'result-countdown');
  countdown.dataset.countdown = '1';
  const actions = node('div', 'result-actions');
  const leave = node('button', 'secondary', broke ? '🚪 Rời bàn ngay' : '🚪 Rời bàn');
  leave.type = 'button';
  leave.dataset.resultLeave = '1';
  actions.append(leave);
  if (!broke) {
    const stay = node('button', 'primary', '▶ Ở lại chơi tiếp');
    stay.type = 'button';
    stay.dataset.resultStay = '1';
    actions.append(stay);
  } else actions.classList.add('single');
  parts.push(countdown, actions);
  el.result.replaceChildren(...parts);
}

// Dải báo đánh hộ: lỡ 1 lượt "vừa đánh hộ", lỡ 2 lượt liền "đang tự đánh"; nút "Tôi đã quay lại".
function renderIdle() {
  const missed = table?.phase === 'playing' || table?.phase === 'result' ? table.players[table.seat]?.missed || 0 : 0;
  el.idleBar.hidden = !missed;
  if (!missed) return;
  el.idleText.textContent = missed >= 2 ? '🤖 Đang tự động đánh hộ bạn (lỡ 2 lượt liền)' : '⏱ Bạn vừa hết giờ, hệ thống đã đi hộ';
  el.idleBar.classList.toggle('auto', missed >= 2);
}

// Thông báo mạng nổi ở trên cùng.
function renderNet() {
  el.net.hidden = !netState;
  el.net.className = `net ${netState}`;
  if (netState === 'down') el.net.textContent = table && ['playing', 'starting'].includes(table.phase) ? '📶 Đang kết nối lại… (tự động đánh hộ)' : '📶 Đang kết nối lại…';
  else if (netState === 'back') el.net.textContent = table ? '✅ Đã vào lại bàn' : '✅ Đã kết nối lại';
}
function setNet(state) {
  clearTimeout(netTimer);
  netState = state;
  if (state === 'back') netTimer = setTimeout(() => setNet(''), 2_500);
  renderNet();
}

function renderBoard() {
  const show = Boolean(table && table.phase !== 'closed');
  el.board.hidden = !show;
  el.lobbyView.hidden = show;
  if (!show) return;
  el.tableInfo.replaceChildren(node('b', '', `${table.stake.toLocaleString('vi-VN')} xu`), ` · ${MODE_NAMES[table.mode]}${table.game ? ` · ván ${table.game}` : ''}`);
  const me = table.players[table.seat];
  el.leave.textContent = ['playing'].includes(table.phase) ? (me?.leaving ? '✓ Rời sau ván' : '← Rời sau ván') : '← Rời bàn';
  for (let seat = 0; seat < SEATS; seat += 1) if (seat !== table.seat) renderSeat(seat);
  el.meName.textContent = me?.displayName || myName || 'Bạn';
  el.meTag.textContent = tagOf(me, table.seat)[0];
  el.meCoins.textContent = coins === null ? '' : `🪙 ${coins.toLocaleString('vi-VN')} xu`;
  renderCenter();
  renderHand();
  renderButtons();
  renderResult();
  renderIdle();
  tick();
}

// Nước vừa đi: chặt thì nháy chữ to, tới lượt mình thì rung.
function noticeMove(previous) {
  const key = JSON.stringify([table.game, table.last, table.turn]);
  if (key === lastMoveKey) return;
  lastMoveKey = key;
  const last = table.last;
  if (last?.action === 'chop' && previous?.last?.action !== 'chop') {
    el.flash.textContent = `💥 ${last.seat === table.seat ? 'Bạn' : nameOf(last.seat)} chặt ${last.victim === table.seat ? 'bạn' : nameOf(last.victim)} · ${(last.units * table.stake).toLocaleString('vi-VN')} xu`;
    el.flash.className = 'flash chop';
    clearTimeout(noticeMove.timer);
    noticeMove.timer = setTimeout(() => { el.flash.textContent = ''; }, 3_000);
  }
  if (myTurn() && previous?.turn !== table.seat) navigator.vibrate?.(40);
  // Hệ thống vừa đánh hộ mình (hết giờ).
  if (last?.auto && last.seat === table.seat) {
    el.flash.textContent = last.action === 'pass' ? '⏱ Hệ thống vừa bỏ lượt hộ bạn' : '⏱ Hệ thống vừa đánh hộ bạn';
    el.flash.className = 'flash';
    clearTimeout(noticeMove.timer);
    noticeMove.timer = setTimeout(() => { el.flash.textContent = ''; }, 3_000);
  }
}

function tick() {
  if (!table || el.board.hidden) return;
  const left = Math.max(0, (table.deadline || 0) - serverNow());
  const turning = table.phase === 'playing';
  el.turnbar.hidden = !turning;
  if (turning) {
    const fraction = Math.min(1, left / TURN_MS);
    el.turnbarFill.style.transform = `scaleX(${fraction})`;
    el.turnbar.classList.toggle('urgent', myTurn() && left < 5_000);
    const ring = document.querySelector('[data-ring]');
    if (ring) {
      const length = 2 * Math.PI * 29;
      ring.setAttribute('stroke-dasharray', `${length * fraction} ${length}`);
    }
  }
  el.status.textContent = statusText();
  const countdown = el.result.querySelector('[data-countdown]');
  const leaving = table.result?.after !== undefined && table.result.after < table.minCoins;
  if (countdown && table.phase === 'result') countdown.textContent = `${leaving ? 'Rời bàn sau' : 'Ván mới sau'} ${Math.ceil(left / 1_000)} giây`;
}

function onTable(message) {
  const previous = table;
  if (message.phase === 'closed') {
    if (table && message.tableId === table.tableId) {
      table = null;
      selected = new Set();
      if (leaveReason && Date.now() - leaveReason.at < 5_000) {
        say(leaveReason.text, 'lose');
        showNotice(leaveReason);
      } else say(previous?.phase === 'playing' ? '' : 'Đã rời bàn');
      leaveReason = null;
      loadWallet();
    }
    renderBoard();
    renderLobby();
    return;
  }
  if (previous && previous.tableId !== message.tableId) selected = new Set();
  if (previous?.game !== message.game) {
    selected = new Set();
    hintIndex = -1;
  }
  table = message;
  if (message.coins !== undefined) coins = message.coins;
  if (previous?.phase !== 'result' && message.phase === 'result' && message.result?.net > 0) navigator.vibrate?.([60, 40, 60]);
  if (previous?.phase !== message.phase) boardSay('');
  noticeMove(previous);
  renderBoard();
  renderLobby();
}

function onMessage(event) {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.v !== PROTOCOL_VERSION) return;
  if (message.type === 'welcome') {
    clockOffset = message.serverTime - Date.now();
    if (session) session.resumeToken = message.resumeToken;
    failedOpens = 0;
    retry = 0;
    el.roomChip.classList.add('online');
    if (netState === 'down') setNet('back');
  } else if (message.type === 'room.state') {
    people = message.participants.filter((person) => person.connected !== false).length;
    renderLobby();
  } else if (message.type === 'tienlen.lobby') {
    lobby = message;
    renderLobby();
  } else if (message.type === 'tienlen.table') onTable(message);
  else if (message.type === 'protocol.error' && (message.code === 'BANNED' || message.code === 'SESSION_REPLACED')) {
    sessionReplaced = true;
    say(message.code === 'BANNED' ? message.message : 'Tài khoản đã vào bàn từ trình duyệt hoặc máy khác · tải lại trang để chơi ở đây', 'lose');
  } else if (message.type === 'protocol.error') {
    if (message.code === 'INVALID_TICKET' || message.code === 'INVALID_RESUME_TOKEN') {
      session = null;
      socket?.close();
      return;
    }
    const text = ERROR_TEXT[message.code] || message.message;
    // Đang ngồi bàn mà bị báo không đủ xu / treo máy: máy chủ sắp đưa ra khỏi bàn, nhớ lý do để báo rõ ở sảnh.
    if (table && ['INSUFFICIENT_COINS', 'IDLE_KICKED'].includes(message.code)) leaveReason = { code: message.code, text, at: Date.now() };
    if (table) boardSay(text);
    else say(text, 'lose');
    if (message.code === 'INSUFFICIENT_COINS') loadWallet();
  }
}

// ---- Kết nối (như các bàn khác) ----
function realtimeEndpoint(url) {
  if (!url.startsWith('/')) return new URL(url);
  return new URL(url, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
}
const rememberedName = () => {
  try { return (localStorage.getItem('displayName') || localStorage.getItem('phapdanh') || '').trim().slice(0, 40); } catch { return ''; }
};
let retry = 0;
let failedOpens = 0;
let connecting = false;
let reconnectTimer = null;
let sessionReplaced = false;
async function joinRoom() {
  const response = await fetch('/api/v1/rooms/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId: ROOM_ID, displayName: rememberedName() || 'Khách' }),
  });
  if (response.status === 404) throw new Error('unknown_room');
  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    if (body?.error === 'banned') {
      const error = new Error('banned');
      error.serverMessage = body.message;
      throw error;
    }
  }
  if (!response.ok) throw new Error('join');
  return response.json();
}
async function locateRoom() {
  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(ROOM_ID)}/locate`, { cache: 'no-store' });
  if (!response.ok) throw new Error('locate');
  return (await response.json()).realtimeUrl;
}
async function connect() {
  if (connecting || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) return;
  connecting = true;
  el.roomChip.classList.remove('online');
  try {
    if (!session) session = await joinRoom();
    else session.realtimeUrl = await locateRoom();
    myName = session.displayName || myName;
    const url = realtimeEndpoint(session.realtimeUrl);
    url.searchParams.set('ticket', session.ticket);
    if (session.resumeToken) url.searchParams.set('resumeToken', session.resumeToken);
    const candidate = new WebSocket(url);
    socket = candidate;
    candidate.addEventListener('open', () => {
      connecting = false;
      candidate.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', roomId: session.roomId, displayName: session.displayName, ...(session.resumeToken ? { resumeToken: session.resumeToken } : {}) }));
    });
    candidate.addEventListener('message', onMessage);
    candidate.addEventListener('close', () => {
      if (socket !== candidate) return;
      socket = null;
      connecting = false;
      if (!sessionReplaced) setNet('down');
      if (!el.roomChip.classList.contains('online')) failedOpens += 1;
      scheduleReconnect();
    });
    candidate.addEventListener('error', () => { connecting = false; });
  } catch (error) {
    connecting = false;
    if (error.message === 'banned') {
      sessionReplaced = true;
      say(error.serverMessage, 'lose');
      return;
    }
    if (error.message === 'unknown_room') say('Máy chủ chưa có bàn Tiến Lên · đang chờ server cập nhật…', 'lose');
    scheduleReconnect();
  }
}
function scheduleReconnect() {
  el.roomChip.classList.remove('online');
  if (reconnectTimer || sessionReplaced) return;
  if (failedOpens >= 3) say('Không nối được máy chủ bàn chơi (realtime) · đang thử lại…', 'lose');
  retry += 1;
  const base = Math.min(8_000, 500 * (2 ** Math.min(retry, 4)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, Math.floor(base / 2 + Math.random() * base));
}
function reconnectNow() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (!socket || socket.readyState === WebSocket.CLOSED) connect();
}
async function loadWallet() {
  try {
    const response = await fetch('/api/v1/garden/me', { cache: 'no-store' });
    signedIn = response.ok;
    coins = response.ok ? (await response.json()).me.coins : null;
  } catch {}
  renderLobby();
  if (table) renderBoard();
}

// ---- Thao tác ----
function canPlay(value) {
  if (!signedIn) {
    say('Đăng nhập ở cổng chùa để chơi bằng xu Vườn Công Đức', 'lose');
    return false;
  }
  if (!canAfford(value)) {
    say(`Cần ít nhất ${tienLenMinCoins(value).toLocaleString('vi-VN')} xu (10 lần mức cược) để ngồi bàn này · ra Khu vườn bán trái cây để có thêm`, 'lose');
    return false;
  }
  return true;
}

el.modes.addEventListener('click', (event) => {
  const button = event.target.closest('[data-mode]');
  if (!button || !TIENLEN_MODES.includes(button.dataset.mode)) return;
  mode = button.dataset.mode;
  try { localStorage.setItem('tienlen-mode', mode); } catch {}
  renderLobby();
});
el.stakes.addEventListener('click', (event) => {
  const button = event.target.closest('[data-stake]');
  if (!button) return;
  stake = Number(button.dataset.stake);
  try { localStorage.setItem('tienlen-stake', String(stake)); } catch {}
  renderLobby();
});
// Vào nhanh: bàn còn chỗ đang chờ, mức cược không cao hơn mức đang chọn và mình đủ xu ngồi (cùng kiểu trước, đông người,
// mức gần nhất); không có thì nhờ server tìm / mở bàn theo mức + kiểu đang chọn.
el.quick.addEventListener('click', () => {
  if (!signedIn) {
    canPlay(stake);
    return;
  }
  const open = (lobby?.tables || [])
    .filter((item) => item.players.length < SEATS && item.phase !== 'playing' && item.stake <= stake && canAfford(item.stake))
    .sort((a, b) => Number(b.mode === mode) - Number(a.mode === mode) || b.players.length - a.players.length || b.stake - a.stake);
  if (open.length) {
    if (send('tienlen.join', { tableId: open[0].id })) say('Đang vào bàn…');
  } else if (canPlay(stake) && send('tienlen.find', { stake, mode })) say('Đang tìm bàn…');
});
el.open.addEventListener('click', () => {
  if (canPlay(stake) && send('tienlen.open', { stake, mode })) say(`Đang mở bàn ${stake.toLocaleString('vi-VN')} xu…`);
});
el.tables.addEventListener('click', (event) => {
  const button = event.target.closest('[data-table]');
  if (!button) return;
  const item = lobby?.tables.find((entry) => entry.id === button.dataset.table);
  if (!item || !canPlay(item.stake)) return;
  if (send('tienlen.join', { tableId: item.id })) say('Đang vào bàn…');
});
el.signIn.addEventListener('click', () => travelTo('hall'));

el.hand.addEventListener('click', (event) => {
  const item = event.target.closest('[data-card]');
  if (!item || !table) return;
  const card = Number(item.dataset.card);
  if (selected.has(card)) {
    // Bỏ chọn: chỉ bỏ lá đó (sảnh tự chọn dài quá thì chạm bớt lá cuối).
    selected.delete(card);
    boardSay('');
  } else {
    selected.add(card);
    // Tự chọn bộ: 3 rồi 4 → cả sảnh; đôi + hạng kế → đôi thông; 2 lá của tứ quý → tứ quý; đang chặn thì bộ nhỏ nhất đè được.
    const top = table.phase === 'playing' ? table.top?.cards || null : null;
    const picked = autoPick && table.hand ? smartSelect({ hand: table.hand, picked: [...selected], top }) : null;
    if (picked) {
      selected = new Set(picked);
      boardSay(`🪄 Tự chọn ${comboName(picked)} · chạm lá để bỏ bớt`, 'info');
    } else boardSay('');
  }
  hintIndex = -1;
  renderHand();
  renderButtons();
});
el.autoPick.addEventListener('click', () => {
  autoPick = !autoPick;
  try { localStorage.setItem('tienlen-autopick', autoPick ? '1' : '0'); } catch {}
  renderAutoPick();
  boardSay(autoPick ? '🪄 Chạm 2 lá liền nhau (3, 4…) là tự chọn cả sảnh / đôi thông / tứ quý' : 'Đã tắt tự chọn: chạm lá nào chọn lá đó', 'info');
});
el.sort.addEventListener('click', () => {
  sortBySuit = !sortBySuit;
  renderHand();
});
// Gợi ý: lần lượt các bộ đè được (bộ nhỏ trước); nước đầu thì chỉ bộ có lá bắt buộc.
el.hint.addEventListener('click', () => {
  if (!myTurn()) return;
  const top = table.top ? classify(table.top.cards) : null;
  let options = playOptions(table.hand, top);
  if (table.mustInclude !== undefined) options = options.filter((cards) => cards.includes(table.mustInclude));
  options.sort((a, b) => classify(a).top - classify(b).top || a.length - b.length);
  if (!options.length) {
    selected = new Set();
    boardSay('Không có bộ nào đè được · bấm Bỏ lượt');
  } else {
    hintIndex = (hintIndex + 1) % options.length;
    selected = new Set(options[hintIndex]);
    boardSay('');
  }
  renderHand();
  renderButtons();
});
el.play.addEventListener('click', () => {
  if (!selectionPlayable()) return;
  if (send('tienlen.play', { tableId: table.tableId, cards: [...selected] })) {
    selected = new Set();
    hintIndex = -1;
    boardSay('');
  }
});
el.pass.addEventListener('click', () => {
  if (myTurn() && table.top && send('tienlen.pass', { tableId: table.tableId })) {
    selected = new Set();
    boardSay('');
  }
});
el.idleBack.addEventListener('click', () => {
  if (table && send('tienlen.back', { tableId: table.tableId })) boardSay('');
});
el.result.addEventListener('click', (event) => {
  if (event.target.closest('[data-result-leave]')) {
    send('tienlen.leave');
  } else if (event.target.closest('[data-result-stay]') && table) {
    resultHiddenFor = table.game;
    renderResult();
  }
});
el.leave.addEventListener('click', () => {
  if (!table) return;
  if (send('tienlen.leave') && table.phase === 'playing') boardSay(table.players[table.seat]?.leaving ? 'Bạn ở lại bàn' : 'Bạn sẽ rời bàn khi hết ván này');
});
// Hộp thông báo ở sảnh khi vừa bị đưa ra khỏi bàn (không đủ xu / treo máy lâu).
function showNotice(reason) {
  const poor = reason.code === 'INSUFFICIENT_COINS';
  el.noticeTitle.textContent = poor ? '💸 Không đủ xu để chơi tiếp' : '⏱ Bạn đã rời bàn';
  el.noticeText.textContent = reason.text;
  el.noticeLower.hidden = !poor;
  el.noticeGarden.hidden = !poor;
  el.notice.hidden = false;
}
// Chọn mức cược cao nhất còn đủ xu ngồi.
function pickAffordable() {
  const affordable = TIENLEN_STAKES.filter((value) => coins !== null && coins >= tienLenMinCoins(value));
  if (affordable.length) {
    stake = affordable.at(-1);
    try { localStorage.setItem('tienlen-stake', String(stake)); } catch {}
    say(`Đã chọn mức ${stake.toLocaleString('vi-VN')} xu (bạn đang có ${coins.toLocaleString('vi-VN')} xu)`);
  } else say(`Bạn còn ${(coins ?? 0).toLocaleString('vi-VN')} xu, chưa đủ ${tienLenMinCoins(TIENLEN_STAKES[0]).toLocaleString('vi-VN')} xu cho bàn thấp nhất · ra Khu vườn bán trái cây để có thêm`, 'lose');
  renderLobby();
}
el.noticeClose.addEventListener('click', () => { el.notice.hidden = true; });
el.noticeLower.addEventListener('click', async () => {
  el.notice.hidden = true;
  await loadWallet();
  pickAffordable();
});
el.noticeGarden.addEventListener('click', () => travelTo('garden'));
const openRules = (on) => { el.rules.hidden = !on; };
el.rulesOpen.addEventListener('click', () => openRules(true));
el.rulesOpen2.addEventListener('click', () => openRules(true));
el.rulesClose.addEventListener('click', () => openRules(false));
el.rules.addEventListener('click', (event) => { if (event.target === el.rules) openRules(false); });

const openTravel = (next) => {
  el.travelPanel.hidden = !next;
  el.travelToggle.setAttribute('aria-expanded', String(next));
};
el.travelToggle.addEventListener('click', () => openTravel(el.travelPanel.hidden));
document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.travel')) openTravel(false); });
el.travelPanel.addEventListener('click', (event) => {
  const destination = event.target.closest('[data-destination]')?.dataset.destination;
  openTravel(false);
  if (destination && destination !== 'games') travelTo(destination);
});
function travelTo(destination) {
  if (destination === 'cinema') {
    location.href = currentCinemaHref();
    return;
  }
  let back = '/chanh-dien.html';
  try { back = sessionStorage.getItem('thien-return') || back; } catch {}
  const url = new URL(back, location.origin);
  if (url.origin !== location.origin) return;
  url.searchParams.set('go', destination);
  location.href = `${url.pathname}${url.search}`;
}

try {
  const savedStake = Number(localStorage.getItem('tienlen-stake'));
  if (TIENLEN_STAKES.includes(savedStake)) stake = savedStake;
  const savedMode = localStorage.getItem('tienlen-mode');
  if (TIENLEN_MODES.includes(savedMode)) mode = savedMode;
  autoPick = localStorage.getItem('tienlen-autopick') !== '0';
} catch {}
renderLobby();
renderBoard();
renderAutoPick();
loadWallet().then(connect);
setInterval(tick, 200);
window.addEventListener('resize', () => { if (table) renderHand(); });
window.addEventListener('online', reconnectNow);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadWallet();
    reconnectNow();
  }
});
