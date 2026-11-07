// Bấm vào người khác trong chánh điện: thẻ thông tin (ảnh, tên, cấp, công đức), Kết bạn, Nắm tay và Khiêu chiến.
// Nắm tay (hand.*): người mời dẫn đường, người nhận tự đi bên cạnh; đang nắm thì có nút Buông tay nổi trên cảnh. Khiêu chiến mở
// trò kéo búa bao do server làm trọng tài (challenge.*); lời mời kết bạn / khiêu chiến của người khác hiện thành hộp
// trả lời. Có Chặn (người bị chặn không mời được mình, chat của họ bị ẩn) và Báo cáo (lưu cho người quản lý), cùng
// màn Bạn bè (bạn đã lưu trong tài khoản + bạn trong phòng ở phiên này). Bot có thể tự rủ oẳn tù tì hoặc mời sang phòng
// game (game.invite); hộp mời của bot có nút "Đừng mời nữa" (bot.quiet, nhớ trên máy, bật lại trong menu ⚙). Văn bản từ
// người dùng chỉ đưa ra màn hình bằng textContent. Màn Bạn bè chỉ cho biết online, không hiện phòng / vị trí của người
// hay bot; vẫn có thể mời bạn vào phòng mình, nhắn lời nhắn, xem hộp thư và ẩn trạng thái của mình;
// có thư mới thì server gửi inbox.notify để tải lại hộp thư.
import { avatarNode, levelBadge, titleBadge } from '/badges.js';
import { onLangChange, t } from '/thien-i18n.js';

const HANDS = { rock: '✊', paper: '✋', scissors: '✌️' };
const CHOICES = ['rock', 'paper', 'scissors'];
const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function createPlayerSocial({ stage, session, showToast, participant, everyone, nameOf, audio, onGameActive, onMessageBot, onGoGame, onGoRoom, currentRoomId }) {
  const requestId = () => `social-${crypto.randomUUID()}`;
  const send = (message) => session.send({ requestId: requestId(), ...message });
  // Bạn trong phiên này (id người trong phòng) và lời mời đang chờ mình trả lời.
  const friends = new Set();
  const pendingFriends = new Set();
  const blocked = new Set();
  let reporting = false;
  // Bạn bot lưu theo tên (bot không có tài khoản): thành viên lưu ở API, khách lưu trên máy. Gặp lại bot cùng tên là bạn.
  const botFriends = new Map();
  try { for (const item of JSON.parse(localStorage.getItem('bot-friends') || '[]')) if (typeof item?.name === 'string') botFriends.set(item.name, item.since || Date.now()); } catch {}
  const saveBotFriendsLocal = () => {
    try { localStorage.setItem('bot-friends', JSON.stringify([...botFriends].slice(-100).map(([name, since]) => ({ name, since })))); } catch {}
  };
  const isFriend = (person) => friends.has(person.id) || Boolean(person.bot && botFriends.has(person.displayName));
  function keepBotFriend(name) {
    if (!botFriends.has(name)) botFriends.set(name, Date.now());
    saveBotFriendsLocal();
    fetch('/api/v1/me/bot-friends', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    }).catch(() => {});
  }
  // Thành viên: lấy bạn bot đã lưu trong tài khoản (đăng nhập máy khác vẫn còn); bạn bot lưu trên máy lúc là khách thì gửi lên.
  async function loadBotFriends() {
    try {
      const response = await fetch('/api/v1/me/friends', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      const remote = new Set();
      for (const item of data.botFriends || []) {
        remote.add(item.name);
        if (!botFriends.has(item.name)) botFriends.set(item.name, item.since);
      }
      for (const name of botFriends.keys()) if (!remote.has(name)) keepBotFriend(name);
      saveBotFriendsLocal();
      if (cardId) renderCard();
    } catch {}
  }

  // ---- Thẻ thông tin ----
  const card = el('section', 'social-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  stage.append(card);
  let cardId = null;

  function renderCard() {
    const person = participant(cardId);
    if (!person) {
      closeCard();
      return;
    }
    const close = button('social-close', '✕', closeCard);
    close.setAttribute('aria-label', t('social.close'));
    const head = el('div', 'social-head');
    const name = el('div', 'social-name');
    const title = el('b', '', person.displayName);
    name.append(title);
    const badge = levelBadge(person.level);
    if (badge) name.append(badge);
    const earnedTitle = titleBadge(person.title);
    if (earnedTitle) name.append(earnedTitle);
    const facts = el('div', 'social-facts');
    facts.textContent = person.level ? t('social.member') : t('social.guest');
    const merit = el('div', 'social-merit', t('social.merit', { n: person.merit || 0 }));
    const text = el('div', 'social-text');
    text.append(name, facts, merit);
    head.append(avatarNode(person, 'avatar social-avatar'), text);

    const actions = el('div', 'social-actions');
    const friendLabel = isFriend(person) ? t('social.friends') : pendingFriends.has(person.id) ? t('social.friendSent') : t('social.addFriend');
    const friend = button('chip social-btn', `🤝 ${friendLabel}`, () => {
      send({ type: 'friend.request', targetId: person.id });
      pendingFriends.add(person.id);
      renderCard();
    });
    friend.disabled = isFriend(person) || pendingFriends.has(person.id);
    const duel = button('chip social-btn primary', `⚔️ ${t('social.challenge')}`, () => {
      send({ type: 'challenge.send', targetId: person.id, game: 'rps' });
      closeCard();
    });
    duel.disabled = Boolean(game);
    // Nắm tay: đang nắm người này thì nút thành Buông tay; người kia đang nắm tay ai khác thì khóa.
    const holding = handWith() === person.id;
    const hand = button('chip social-btn', holding ? `✋ ${t('hand.release')}` : `💞 ${t('hand.hold')}`, () => {
      send(holding ? { type: 'hand.release' } : { type: 'hand.request', targetId: person.id });
      closeCard();
    });
    hand.disabled = !holding && (blocked.has(person.id) || Boolean(person.handWith) || Boolean(handWith()));
    actions.append(friend, hand, duel);
    // Nhắn bot: điền "@Tên bot " vào ô chat; quản trị đọc qua Telegram và trả lời thay bot.
    if (person.bot && onMessageBot) {
      actions.append(button('chip social-btn', `💬 ${t('social.messageBot')}`, () => {
        closeCard();
        onMessageBot(person);
      }));
    }
    const note = el('p', 'social-note', t('social.gameNote'));
    const safety = el('div', 'social-safety');
    if (!person.bot) {
      const isBlocked = blocked.has(person.id);
      safety.append(
        button('social-link', isBlocked ? t('social.unblock') : `🚫 ${t('social.block')}`, () => {
          send({ type: 'player.block', targetId: person.id, blocked: !isBlocked });
          if (isBlocked) blocked.delete(person.id);
          else blocked.add(person.id);
          showToast(t(isBlocked ? 'social.unblocked' : 'social.blocked', { name: person.displayName }));
          renderCard();
        }),
        button('social-link', `⚑ ${t('social.report')}`, () => {
          reporting = !reporting;
          renderCard();
        }),
      );
    }
    const parts = [close, head, actions, note, safety];
    if (reporting && !person.bot) {
      // Chọn lý do báo cáo; gửi xong thì cảm ơn, không báo cho người bị báo cáo.
      const box = el('div', 'social-report');
      box.append(el('p', '', t('social.reportWhy', { name: person.displayName })));
      const reasons = el('div', 'social-actions');
      for (const reason of REPORT_REASONS) {
        reasons.append(button('chip', t(`social.reason.${reason}`), () => {
          send({ type: 'player.report', targetId: person.id, reason });
          reporting = false;
          showToast(t('social.reported'));
          renderCard();
        }));
      }
      box.append(reasons);
      parts.push(box);
    }
    duel.disabled = Boolean(game) || blocked.has(person.id);
    friend.disabled = friend.disabled || blocked.has(person.id);
    card.replaceChildren(...parts);
  }

  function openCard(id) {
    if (!id || id === session.participantId || !participant(id)) return;
    if (cardId !== id) reporting = false;
    cardId = id;
    card.hidden = false;
    renderCard();
  }
  function closeCard() {
    cardId = null;
    card.hidden = true;
  }

  // ---- Hộp mời (kết bạn / khiêu chiến của người khác) ----
  const invites = el('div', 'social-invites');
  stage.append(invites);
  function invite(key, text, { accept, decline, expiresAt, acceptText, fromBot = false }) {
    invites.querySelector(`[data-key="${key}"]`)?.remove();
    const box = el('div', 'social-invite');
    box.dataset.key = key;
    const line = el('p', '', text);
    const yes = button('chip primary', acceptText || t('social.accept'), () => { box.remove(); accept(); });
    const no = button('chip', t('social.decline'), () => { box.remove(); decline(); });
    const row = el('div', 'social-actions');
    row.append(yes, no);
    if (fromBot) row.append(button('chip', t('bot.quiet'), () => { box.remove(); decline(); setBotQuiet(true); }));
    box.append(line, row);
    invites.append(box);
    audio?.bead?.();
    const remove = () => box.remove();
    setTimeout(remove, Math.max(1_000, (expiresAt || Date.now() + 30_000) - session.serverNow()));
  }
  const dropInvite = (key) => invites.querySelector(`[data-key="${key}"]`)?.remove();

  // ---- Bot tự bắt chuyện: mời sang phòng game; tắt / bật trong menu ⚙ ----
  let botQuiet = false;
  try { botQuiet = localStorage.getItem('bot-quiet') === '1'; } catch {}
  let quietSent = false;
  const quietButton = button('chip', '', () => setBotQuiet(!botQuiet));
  const labelQuiet = () => { quietButton.textContent = t(botQuiet ? 'bot.menuOff' : 'bot.menuOn'); };
  labelQuiet();
  function setBotQuiet(quiet) {
    botQuiet = quiet;
    try { localStorage.setItem('bot-quiet', quiet ? '1' : '0'); } catch {}
    labelQuiet();
    send({ type: 'bot.quiet', quiet });
    if (quiet) showToast(t('bot.quietOn'));
  }
  function onGameInvite(message) {
    if (botQuiet || blocked.has(message.fromId)) return;
    const name = nameOf(message.fromId);
    invite(`play-${message.fromId}`, t('bot.gameInvite', { name, game: t(`game.${message.game}`) }), {
      expiresAt: session.serverNow() + 30_000,
      acceptText: t('bot.go'),
      fromBot: true,
      accept: () => onGoGame?.(message.game),
      decline: () => {},
    });
  }

  // ---- Nắm tay ----
  const handWith = () => participant(session.participantId)?.handWith || null;
  const handChip = button('chip hand-chip', '', () => send({ type: 'hand.release' }));
  handChip.hidden = true;
  stage.append(handChip);
  let holdingId = null;
  function showHandChip(id) {
    holdingId = id;
    handChip.hidden = !id;
    if (id) handChip.textContent = `✋ ${t('hand.chip', { name: nameOf(id) })}`;
  }
  function onHand(state) {
    const meFrom = state.fromId === session.participantId;
    const otherId = meFrom ? state.toId : state.fromId;
    const name = nameOf(otherId);
    const key = `hand-${state.fromId}`;
    if (state.status === 'pending') {
      if (meFrom) showToast(t('hand.sent', { name }));
      else {
        invite(key, t('hand.invite', { name }), {
          expiresAt: session.serverNow() + 30_000,
          accept: () => send({ type: 'hand.respond', fromId: state.fromId, accept: true }),
          decline: () => send({ type: 'hand.respond', fromId: state.fromId, accept: false }),
        });
      }
      return;
    }
    dropInvite(key);
    if (state.status === 'accepted') {
      showHandChip(otherId);
      showToast(t(meFrom ? 'hand.lead' : 'hand.follow', { name }));
    } else if (state.status === 'declined') {
      if (meFrom) showToast(t('hand.declined', { name }));
    } else if (state.status === 'released') {
      if (holdingId === otherId) showHandChip(null);
      showToast(t(state.byId === session.participantId ? 'hand.releasedSelf' : 'hand.releasedBy', { name }));
    }
    if (cardId === otherId) renderCard();
  }

  // ---- Trận kéo búa bao ----
  const panel = el('section', 'rps');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  stage.append(panel);
  let game = null;
  let myChoice = null;
  let reveal = null;
  let ticker = null;
  let renderedSecond = null;
  let gameActive = false;

  function setGameActive(active) {
    const next = Boolean(active);
    if (gameActive === next) return;
    gameActive = next;
    onGameActive?.(next);
  }

  const side = (state) => (state.fromId === session.participantId ? 'from' : 'to');
  const other = (state) => (side(state) === 'from' ? 'to' : 'from');
  const opponentId = (state) => (side(state) === 'from' ? state.toId : state.fromId);
  const score = (state, who) => (who === 'from' ? state.fromScore : state.toScore);

  function seconds(state) {
    return state.deadline ? Math.max(0, Math.ceil((state.deadline - session.serverNow()) / 1_000)) : 0;
  }

  function countdownText(state) {
    const rival = nameOf(opponentId(state));
    if (state.status === 'pending') {
      return state.fromId === session.participantId
        ? t('rps.waiting', { name: rival, s: seconds(state) })
        : t('rps.invited', { name: rival });
    }
    return t('rps.round', { n: state.round, target: state.target, s: seconds(state) });
  }

  function updateCountdown() {
    if (!game || !['pending', 'playing'].includes(game.status)) return;
    const next = seconds(game);
    if (next === renderedSecond) return;
    renderedSecond = next;
    const info = panel.querySelector('.rps-info');
    const text = countdownText(game);
    if (info && info.textContent !== text) info.textContent = text;
  }

  function renderGame() {
    if (!game) return;
    const state = game;
    renderedSecond = seconds(state);
    const me = side(state);
    const them = other(state);
    const rival = nameOf(opponentId(state));
    const close = button('social-close', '✕', () => {
      if (['pending', 'playing'].includes(state.status)) send({ type: 'challenge.cancel', challengeId: state.challengeId });
      closeGame();
    });
    close.setAttribute('aria-label', t('social.close'));
    const title = el('h2', '', t('rps.title'));
    const board = el('div', 'rps-board');
    const mine = el('div', 'rps-side', '');
    mine.append(el('span', 'rps-who', t('rps.you')), el('b', 'rps-score', String(score(state, me))));
    const theirs = el('div', 'rps-side');
    theirs.append(el('span', 'rps-who', rival), el('b', 'rps-score', String(score(state, them))));
    board.append(mine, el('span', 'rps-vs', 'VS'), theirs);
    const info = el('p', 'rps-info');
    const hands = el('div', 'rps-hands');
    const result = el('p', 'rps-result');

    if (reveal) {
      // Kết quả lượt vừa xong: hai bàn tay lộ ra cùng lúc.
      const shown = el('div', 'rps-reveal');
      shown.append(el('span', 'rps-hand big', reveal.mine ? HANDS[reveal.mine] : '…'), el('span', 'rps-vs', ':'), el('span', 'rps-hand big', reveal.theirs ? HANDS[reveal.theirs] : '…'));
      hands.append(shown);
      result.textContent = reveal.text;
      result.dataset.tone = reveal.tone;
    }
    if (state.status === 'pending') {
      info.textContent = countdownText(state);
    } else if (state.status === 'playing') {
      info.textContent = countdownText(state);
      if (!reveal) {
        const picks = el('div', 'rps-picks');
        for (const choice of CHOICES) {
          const pick = button(`rps-pick${myChoice === choice ? ' chosen' : ''}`, '', () => {
            if (myChoice) return;
            myChoice = choice;
            send({ type: 'challenge.move', challengeId: state.challengeId, choice });
            audio?.bead?.();
            renderGame();
          });
          pick.append(el('span', 'rps-hand', HANDS[choice]), el('span', 'rps-label', t(`rps.${choice}`)));
          pick.disabled = Boolean(myChoice);
          picks.append(pick);
        }
        hands.append(picks);
        const theyMoved = state.moved?.[them];
        result.textContent = myChoice ? (theyMoved ? t('rps.bothIn') : t('rps.waitMove', { name: rival })) : theyMoved ? t('rps.theyMoved', { name: rival }) : t('rps.pick');
        delete result.dataset.tone;
      }
    } else if (state.status === 'finished') {
      const won = state.winner === me;
      const lost = state.winner === them;
      info.textContent = won ? t('rps.won') : lost ? t('rps.lost', { name: rival }) : t('rps.draw');
      info.dataset.tone = won ? 'win' : lost ? 'lose' : 'draw';
    }
    const tools = el('div', 'social-actions');
    if (state.status === 'finished') {
      tools.append(
        button('chip primary', t('rps.again'), () => {
          const target = opponentId(state);
          closeGame();
          if (participant(target)) send({ type: 'challenge.send', targetId: target, game: 'rps' });
        }),
        button('chip', t('social.close'), closeGame),
      );
    } else if (state.status === 'pending' && state.toId === session.participantId) {
      tools.append(
        button('chip primary', t('social.accept'), () => send({ type: 'challenge.respond', challengeId: state.challengeId, accept: true })),
        button('chip', t('social.decline'), () => {
          send({ type: 'challenge.respond', challengeId: state.challengeId, accept: false });
          closeGame();
        }),
      );
    }
    panel.replaceChildren(close, title, board, info, hands, result, tools);
  }

  function openGame() {
    panel.hidden = false;
    setGameActive(true);
    clearInterval(ticker);
    // Kiểm tra sát ranh giới giây nhưng chỉ dựng lại DOM khi con số hiển thị thực sự đổi. Trước đây dựng lại cả
    // bảng mỗi 500 ms, tạo node/handler thừa và làm animation tay bị khựng trên điện thoại.
    ticker = setInterval(() => {
      if (!game || reveal || !['pending', 'playing'].includes(game.status)) return;
      updateCountdown();
    }, 250);
  }
  function closeGame() {
    game = null;
    myChoice = null;
    reveal = null;
    clearInterval(ticker);
    panel.hidden = true;
    setGameActive(false);
  }

  function onChallenge(state) {
    const mine = state.fromId === session.participantId || state.toId === session.participantId;
    if (!mine) return;
    const rival = nameOf(opponentId(state));
    const key = `game-${state.challengeId}`;
    if (game && game.challengeId !== state.challengeId && ['pending', 'playing'].includes(game.status)) return;
    if (['declined', 'cancelled', 'expired'].includes(state.status)) {
      dropInvite(key);
      if (game?.challengeId === state.challengeId) closeGame();
      showToast(t(`rps.${state.status}`, { name: rival }));
      return;
    }
    // Lời mời tới mình: hộp trả lời nhỏ, chưa mở bàn chơi.
    if (state.status === 'pending' && state.toId === session.participantId && !game) {
      invite(key, t('rps.inviteText', { name: rival }), {
        expiresAt: state.deadline,
        fromBot: Boolean(participant(state.fromId)?.bot),
        accept: () => {
          game = state;
          openGame();
          renderGame();
          send({ type: 'challenge.respond', challengeId: state.challengeId, accept: true });
        },
        decline: () => send({ type: 'challenge.respond', challengeId: state.challengeId, accept: false }),
      });
      return;
    }
    dropInvite(key);
    const previous = game?.challengeId === state.challengeId ? game : null;
    game = state;
    if (panel.hidden) openGame();
    // Lượt mới bắt đầu (hoặc trận xong): lật bài lượt vừa rồi 1,8 giây.
    if (state.last && (!previous || previous.round !== state.round || state.status === 'finished')) {
      const me = side(state);
      const winner = state.last.winner;
      reveal = {
        mine: state.last[me],
        theirs: state.last[other(state)],
        tone: winner === 'draw' ? 'draw' : winner === me ? 'win' : 'lose',
        text: winner === 'draw' ? t('rps.roundDraw') : winner === me ? t('rps.roundWin') : t('rps.roundLose'),
      };
      myChoice = null;
      audio?.bead?.();
      const shownFor = state.challengeId;
      setTimeout(() => {
        if (game?.challengeId !== shownFor) return;
        reveal = null;
        renderGame();
      }, state.status === 'finished' ? 2_400 : 1_800);
    }
    if (state.status === 'playing' && previous && previous.round !== state.round && !state.last) myChoice = null;
    renderGame();
  }

  function onFriend(state) {
    const meFrom = state.fromId === session.participantId;
    const otherId = meFrom ? state.toId : state.fromId;
    const name = nameOf(otherId);
    const key = `friend-${state.fromId}`;
    if (state.status === 'pending') {
      if (!meFrom) {
        invite(key, t('social.friendInvite', { name }), {
          expiresAt: session.serverNow() + 60_000,
          accept: () => send({ type: 'friend.respond', fromId: state.fromId, accept: true }),
          decline: () => send({ type: 'friend.respond', fromId: state.fromId, accept: false }),
        });
      } else showToast(t('social.friendSentToast', { name }));
    } else {
      dropInvite(key);
      pendingFriends.delete(otherId);
      if (state.status === 'accepted') {
        friends.add(otherId);
        // Bot không có tài khoản: lưu theo tên (tài khoản hoặc máy này) để ra vào phòng vẫn còn.
        const bot = participant(otherId)?.bot;
        if (bot) keepBotFriend(name);
        showToast(t(bot ? 'social.friendBot' : state.saved ? 'social.friendSaved' : 'social.friendSession', { name }));
      } else if (meFrom) showToast(t('social.friendDeclined', { name }));
    }
    if (cardId === otherId) renderCard();
  }

  // ---- Màn Bạn bè (mở từ menu ⚙) ----
  const friendsButton = button('chip', '', () => openFriends());
  const sheet = el('section', 'social-friends');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(sheet);
  let saved = null;
  let presenceHidden = false;
  // Hộp thư (lời nhắn + lời mời của bạn đã lưu). null: chưa tải hoặc là khách.
  let inbox = null;
  let inboxLoaded = false;
  let noteFor = null;
  // Lời mời đã hiện hộp (không hiện lại khi đổi phòng / tải lại hộp thư).
  const shownInvites = new Set();
  const labelFriends = () => {
    friendsButton.textContent = `👥 ${t('friends.title')}${inbox?.unread ? ` · ${inbox.unread} ✉️` : ''}`;
  };
  labelFriends();

  const GAME_KEYS = { game: 'game.bau-cua', taixiu: 'game.tai-xiu', loto: 'game.loto' };
  const placeName = (room) => (room.type === 'thien' ? room.name || t('place.thien') : room.type === 'cinema' ? t('place.cinema') : t(GAME_KEYS[room.type] || 'place.thien'));
  const goRoom = (room) => {
    sheet.hidden = true;
    onGoRoom?.(room);
  };

  async function api(path, body) {
    const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }
  const apiError = (data) => {
    const own = t(`friends.err.${data?.error}`);
    return own !== `friends.err.${data?.error}` ? own : t('friends.err.other');
  };

  // Tải hộp thư; popup: hiện hộp mời / báo lời nhắn mới chưa đọc.
  async function loadInbox({ popup = false } = {}) {
    let result;
    try { result = await api('/api/v1/me/inbox'); } catch { return; }
    if (!result.ok) {
      if (result.status === 401 || result.status === 503) inbox = null;
      return;
    }
    const before = new Set((inbox?.items || []).map((item) => item.id));
    inbox = result.data;
    labelFriends();
    if (!sheet.hidden) renderFriends();
    if (!popup) return;
    const fresh = inbox.items.filter((item) => !item.read && !before.has(item.id));
    for (const item of fresh) {
      if (item.kind !== 'invite' || item.expired || shownInvites.has(item.id) || item.room?.roomId === currentRoomId?.()) continue;
      shownInvites.add(item.id);
      invite(`room-${item.id}`, t('friends.inviteText', { name: item.from.displayName, place: placeName(item.room) }), {
        expiresAt: session.serverNow() + 60_000,
        acceptText: t('friends.goNow'),
        accept: () => goRoom(item.room),
        decline: () => {},
      });
    }
    const notes = fresh.filter((item) => item.kind === 'note');
    if (notes.length === 1) showToast(`✉️ ${notes[0].from.displayName}: ${notes[0].text}`);
    else if (notes.length > 1) showToast(t('friends.newNotes', { n: notes.length }));
  }

  function friendRow(person, extra) {
    const row = el('div', 'friend-row');
    const text = el('div', 'friend-text');
    text.append(el('b', '', person.displayName), el('span', 'friend-sub', extra));
    row.append(avatarNode(person, 'avatar'), text);
    return row;
  }

  async function sendNote(friend, input) {
    const text = input.value.trim();
    if (!text) return;
    const result = await api('/api/v1/me/friends/note', { accountId: friend.accountId, text }).catch(() => ({ ok: false, data: {} }));
    if (result.ok) {
      noteFor = null;
      showToast(t('friends.noteSent', { name: friend.displayName }));
      renderFriends();
    } else showToast(apiError(result.data));
  }

  async function inviteFriend(friend) {
    const result = await api('/api/v1/me/friends/invite', { accountId: friend.accountId }).catch(() => ({ ok: false, data: {} }));
    showToast(result.ok ? t('friends.invited', { name: friend.displayName }) : apiError(result.data));
  }

  function savedFriendRow(friend) {
    const since = new Date(friend.since).toLocaleDateString(document.documentElement.lang || undefined);
    const row = friendRow(friend, friend.online ? `🟢 ${t('chat.online')}` : t('friends.since', { date: since }));
    const actions = el('div', 'friend-actions');
    if (friend.online) actions.append(button('chip', `📨 ${t('friends.invite')}`, () => inviteFriend(friend)));
    actions.append(button('chip', `✉️ ${t('friends.note')}`, () => {
      noteFor = noteFor === friend.accountId ? null : friend.accountId;
      renderFriends();
      sheet.querySelector('.friend-note input')?.focus();
    }));
    row.append(actions);
    if (noteFor === friend.accountId) {
      const form = el('form', 'friend-note');
      const input = el('input');
      input.maxLength = 200;
      input.placeholder = t('friends.notePlaceholder', { name: friend.displayName });
      form.append(input, button('chip primary', t('friends.send'), () => form.requestSubmit()));
      form.querySelector('button').type = 'submit';
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        sendNote(friend, input);
      });
      row.append(form);
    }
    return row;
  }

  // Bạn bot không hiện đang ở đâu; nếu bot tình cờ ở cùng phòng thì vẫn có thể nhắn.
  function botFriendRow(name, since) {
    const here = [...(everyone?.() || [])].find((person) => person.bot && person.displayName === name);
    const date = new Date(since).toLocaleDateString(document.documentElement.lang || undefined);
    const row = friendRow(here || { displayName: name }, t('friends.since', { date }));
    if (here) {
      const actions = el('div', 'friend-actions');
      if (onMessageBot) actions.append(button('chip', `💬 ${t('social.messageBot')}`, () => { sheet.hidden = true; onMessageBot(here); }));
      row.append(actions);
    }
    return row;
  }

  function inboxRow(item) {
    const when = new Date(item.at).toLocaleString(document.documentElement.lang || undefined, { dateStyle: 'short', timeStyle: 'short' });
    const line = item.kind === 'note' ? item.text : t(item.expired ? 'friends.inviteOld' : 'friends.inviteText', { name: item.from.displayName, place: placeName(item.room) });
    const row = friendRow(item.from, when);
    row.classList.toggle('unread', !item.read);
    const body = el('p', 'friend-message', line);
    row.append(body);
    if (item.kind === 'invite' && !item.expired && item.room.roomId !== currentRoomId?.()) {
      const actions = el('div', 'friend-actions');
      actions.append(button('chip primary', t('friends.goNow'), () => goRoom(item.room)));
      row.append(actions);
    }
    return row;
  }

  function renderFriends() {
    const back = button('mala-back', `‹ ${t('mala.back')}`, () => { sheet.hidden = true; });
    const list = el('div', 'friend-list');
    // Không lặp lại danh sách người / bot đang ở phòng hiện tại: vị trí của bạn bè là riêng tư.
    if (inbox?.items?.length) {
      list.append(el('h3', '', `📬 ${t('friends.inbox')}`));
      for (const item of inbox.items.slice(0, 10)) list.append(inboxRow(item));
    }
    list.append(el('h3', '', t('friends.saved')));
    const bots = [...botFriends].map(([name, since]) => botFriendRow(name, since));
    if (saved === null) list.append(el('p', 'social-note', t('friends.loading')));
    else if (saved === 'guest' && !bots.length) list.append(el('p', 'social-note', t('friends.signIn')));
    else if (Array.isArray(saved) && !saved.length && !bots.length) list.append(el('p', 'social-note', t('friends.none')));
    if (saved !== null) {
      // Bạn online lên trước; bot giữ thứ tự kết bạn, không dùng vị trí hiện tại để sắp xếp.
      const people = Array.isArray(saved) ? [...saved].sort((a, b) => Number(b.online) - Number(a.online)) : [];
      for (const friend of people.filter((item) => item.online)) list.append(savedFriendRow(friend));
      for (const friend of people.filter((item) => !item.online)) list.append(savedFriendRow(friend));
      for (const bot of bots) list.append(bot);
    }
    const nodes = [back, el('h2', '', t('friends.title')), list];
    if (Array.isArray(saved)) {
      nodes.push(button('chip friend-hide', t(presenceHidden ? 'friends.hiddenOn' : 'friends.hiddenOff'), async () => {
        const result = await api('/api/v1/me/presence', { hidden: !presenceHidden }).catch(() => ({ ok: false }));
        if (result.ok) presenceHidden = result.data.hidden;
        renderFriends();
      }));
    }
    sheet.replaceChildren(...nodes);
  }

  async function openFriends() {
    sheet.hidden = false;
    saved = null;
    noteFor = null;
    renderFriends();
    try {
      const response = await fetch('/api/v1/me/friends', { credentials: 'same-origin' });
      if (response.status === 401 || response.status === 503) saved = 'guest';
      else if (response.ok) {
        const data = await response.json();
        saved = data.friends;
        presenceHidden = Boolean(data.hidden);
      } else saved = [];
    } catch {
      saved = [];
    }
    if (saved !== 'guest') await loadInbox();
    if (!sheet.hidden) renderFriends();
    // Đã mở hộp thư: đánh dấu đã đọc (lần mở sau thôi tô đậm).
    if (inbox?.unread) {
      api('/api/v1/me/inbox/read', {}).catch(() => {});
      inbox.unread = 0;
      labelFriends();
    }
  }

  onLangChange(() => {
    labelFriends();
    labelQuiet();
    if (!card.hidden) renderCard();
    if (!panel.hidden) renderGame();
    if (!sheet.hidden) renderFriends();
    if (holdingId) showHandChip(holdingId);
  });

  return {
    open: openCard,
    friendsButton,
    quietButton,
    // Người mình đã chặn: trang ẩn chat và lời nguyện của họ.
    isBlocked: (id) => blocked.has(id),
    // Trả true nếu đã xử lý message.
    onMessage(message) {
      // Vào phòng (hoặc nối lại): báo server lựa chọn "đừng mời nữa" đã nhớ trên máy.
      if (message.type === 'room.state' && botQuiet && !quietSent) {
        quietSent = true;
        send({ type: 'bot.quiet', quiet: true });
      }
      // Thành viên vào phòng: tải hộp thư một lần (lời mời / lời nhắn đến khi chưa online).
      if (message.type === 'room.state' && !inboxLoaded) {
        inboxLoaded = true;
        loadInbox({ popup: true });
        loadBotFriends();
      }
      if (message.type === 'inbox.notify') loadInbox({ popup: true });
      else if (message.type === 'game.invite') onGameInvite(message);
      else if (message.type === 'friend.state') onFriend(message);
      else if (message.type === 'challenge.state') onChallenge(message);
      else if (message.type === 'hand.state') onHand(message);
      else return false;
      return true;
    },
    // Lỗi của thao tác kết bạn / khiêu chiến: báo bằng câu riêng, không dùng câu lỗi chung của lễ vật.
    onError(message) {
      if (!message.requestId?.startsWith('social-')) return false;
      const own = t(`social.err.${message.code}`);
      const shared = t(`err.${message.code}`);
      showToast(own !== `social.err.${message.code}` ? own : shared !== `err.${message.code}` ? shared : message.message);
      if (message.code === 'BUSY' || message.code === 'NO_CHALLENGE') {
        if (game && !['pending', 'playing'].includes(game.status)) closeGame();
      }
      return true;
    },
    // Rời phòng: đóng hết.
    reset() {
      closeCard();
      closeGame();
      invites.replaceChildren();
      quietSent = false;
      friends.clear();
      pendingFriends.clear();
      blocked.clear();
      sheet.hidden = true;
      showHandChip(null);
    },
  };
}
