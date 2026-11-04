// Bấm vào người khác trong chánh điện: thẻ thông tin (ảnh, tên, cấp, công đức), Kết bạn và Khiêu chiến. Khiêu chiến mở
// trò kéo búa bao do server làm trọng tài (challenge.*); lời mời kết bạn / khiêu chiến của người khác hiện thành hộp
// trả lời. Có Chặn (người bị chặn không mời được mình, chat của họ bị ẩn) và Báo cáo (lưu cho người quản lý), cùng
// màn Bạn bè (bạn đã lưu trong tài khoản + bạn trong phòng ở phiên này). Văn bản từ người dùng chỉ đưa ra màn hình bằng
// textContent.
import { avatarNode, levelBadge } from '/badges.js';
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

export function createPlayerSocial({ stage, session, showToast, participant, nameOf, audio, onGameActive }) {
  const requestId = () => `social-${crypto.randomUUID()}`;
  const send = (message) => session.send({ requestId: requestId(), ...message });
  // Bạn trong phiên này (id người trong phòng) và lời mời đang chờ mình trả lời.
  const friends = new Set();
  const pendingFriends = new Set();
  const blocked = new Set();
  let reporting = false;

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
    const facts = el('div', 'social-facts');
    facts.textContent = person.bot ? t('social.bot') : person.level ? t('social.member') : t('social.guest');
    const merit = el('div', 'social-merit', t('social.merit', { n: person.merit || 0 }));
    const text = el('div', 'social-text');
    text.append(name, facts, merit);
    head.append(avatarNode(person, 'avatar social-avatar'), text);

    const actions = el('div', 'social-actions');
    const friendLabel = friends.has(person.id) ? t('social.friends') : pendingFriends.has(person.id) ? t('social.friendSent') : t('social.addFriend');
    const friend = button('chip social-btn', `🤝 ${friendLabel}`, () => {
      send({ type: 'friend.request', targetId: person.id });
      pendingFriends.add(person.id);
      renderCard();
    });
    friend.disabled = Boolean(person.bot) || friends.has(person.id) || pendingFriends.has(person.id);
    const duel = button('chip social-btn primary', `⚔️ ${t('social.challenge')}`, () => {
      send({ type: 'challenge.send', targetId: person.id, game: 'rps' });
      closeCard();
    });
    duel.disabled = Boolean(game);
    actions.append(friend, duel);
    const note = el('p', 'social-note', person.bot ? t('social.botNote') : t('social.gameNote'));
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
  function invite(key, text, { accept, decline, expiresAt }) {
    invites.querySelector(`[data-key="${key}"]`)?.remove();
    const box = el('div', 'social-invite');
    box.dataset.key = key;
    const line = el('p', '', text);
    const yes = button('chip primary', t('social.accept'), () => { box.remove(); accept(); });
    const no = button('chip', t('social.decline'), () => { box.remove(); decline(); });
    const row = el('div', 'social-actions');
    row.append(yes, no);
    box.append(line, row);
    invites.append(box);
    audio?.bead?.();
    const remove = () => box.remove();
    setTimeout(remove, Math.max(1_000, (expiresAt || Date.now() + 30_000) - session.serverNow()));
  }
  const dropInvite = (key) => invites.querySelector(`[data-key="${key}"]`)?.remove();

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
        showToast(t(state.saved ? 'social.friendSaved' : 'social.friendSession', { name }));
      } else if (meFrom) showToast(t('social.friendDeclined', { name }));
    }
    if (cardId === otherId) renderCard();
  }

  // ---- Màn Bạn bè (mở từ menu ⚙) ----
  const friendsButton = button('chip', `👥 ${t('friends.title')}`, () => openFriends());
  const sheet = el('section', 'social-friends');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(sheet);
  let saved = null;

  function friendRow(person, extra) {
    const row = el('div', 'friend-row');
    const text = el('div', 'friend-text');
    text.append(el('b', '', person.displayName), el('span', 'friend-sub', extra));
    row.append(avatarNode(person, 'avatar'), text);
    return row;
  }

  function renderFriends() {
    const back = button('mala-back', `‹ ${t('mala.back')}`, () => { sheet.hidden = true; });
    const list = el('div', 'friend-list');
    const here = [...friends].map((id) => participant(id)).filter(Boolean);
    if (here.length) {
      list.append(el('h3', '', t('friends.here')));
      for (const person of here) {
        const row = friendRow(person, t('friends.inRoom'));
        row.append(button('chip', `⚔️ ${t('social.challenge')}`, () => {
          sheet.hidden = true;
          send({ type: 'challenge.send', targetId: person.id, game: 'rps' });
        }));
        list.append(row);
      }
    }
    list.append(el('h3', '', t('friends.saved')));
    if (saved === null) list.append(el('p', 'social-note', t('friends.loading')));
    else if (saved === 'guest') list.append(el('p', 'social-note', t('friends.signIn')));
    else if (!saved.length) list.append(el('p', 'social-note', t('friends.none')));
    else {
      for (const friend of saved) {
        const since = new Date(friend.since).toLocaleDateString(document.documentElement.lang || undefined);
        list.append(friendRow(friend, t('friends.since', { date: since })));
      }
    }
    sheet.replaceChildren(back, el('h2', '', t('friends.title')), list);
  }

  async function openFriends() {
    sheet.hidden = false;
    saved = null;
    renderFriends();
    try {
      const response = await fetch('/api/v1/me/friends', { credentials: 'same-origin' });
      saved = response.status === 401 || response.status === 503 ? 'guest' : response.ok ? (await response.json()).friends : [];
    } catch {
      saved = [];
    }
    if (!sheet.hidden) renderFriends();
  }

  onLangChange(() => {
    friendsButton.textContent = `👥 ${t('friends.title')}`;
    if (!card.hidden) renderCard();
    if (!panel.hidden) renderGame();
    if (!sheet.hidden) renderFriends();
  });

  return {
    open: openCard,
    friendsButton,
    // Người mình đã chặn: trang ẩn chat và lời nguyện của họ.
    isBlocked: (id) => blocked.has(id),
    // Trả true nếu đã xử lý message.
    onMessage(message) {
      if (message.type === 'friend.state') onFriend(message);
      else if (message.type === 'challenge.state') onChallenge(message);
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
      friends.clear();
      pendingFriends.clear();
      blocked.clear();
      sheet.hidden = true;
    },
  };
}
