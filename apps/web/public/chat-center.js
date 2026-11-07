// Màn 💬 Tin nhắn của chánh điện: thẻ "Chung" là chat của phòng trong ngày hôm nay (máy realtime gửi chat.history lúc
// vào; khung tin trên cảnh chỉ hiện 3 tin rồi mờ đi), thẻ "Bạn bè" là cuộc trò chuyện riêng với từng bạn đã lưu (lời nhắn
// qua API, đọc được cả khi bạn offline, cũng chỉ giữ trong ngày) và với từng bạn bot (tin mình nhắn "@Tên bot", câu bot
// trả lời / bắt chuyện; API lưu trong ngày, nhắn tiếp được khi bot đang ở phòng này). Nút có số tin chưa xem. Văn bản từ người dùng chỉ đưa ra màn hình bằng textContent.
import { avatarNode } from '/badges.js';
import { dayStartOf } from '/shared/room-rules.mjs';
import { onLangChange, t } from '/thien-i18n.js';

const ROOM_KEEP = 100;
// Cùng mốc ngày với server (GARDEN_TIMEZONE mặc định): qua nửa đêm thì bỏ tin hôm trước.
const dropYesterday = (items) => {
  const today = dayStartOf(Date.now());
  const keep = items.findIndex((item) => item.at >= today);
  items.splice(0, keep < 0 ? items.length : keep);
};

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

// sendRoom(text) → true nếu đã gửi; isBlocked(participantId): người mình đã chặn thì không hiện tin của họ.
// botHere(name): bot tên đó đang ở phòng này (participant) hay không.
export function createChatCenter({ stage, sendRoom, isBlocked, showToast, selfId, botHere = () => null }) {
  const openButton = el('button', 'chip chat-open');
  openButton.type = 'button';
  const sheet = el('section', 'social-friends chat-center');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(sheet);

  const roomMessages = [];
  let unseenRoom = 0;
  let friendUnread = 0;
  let tab = 'room';
  let friends = null; // null: đang tải; 'guest': chưa đăng nhập; [] danh sách bạn đã lưu
  let botFriends = []; // [{ name, since }]
  let threadReload = null;
  let inbox = [];
  let thread = null; // { friend, items }
  // Danh sách tin đang hiện: tin mới chỉ thêm vào đây, không vẽ lại cả màn (giữ chữ đang gõ dở).
  let logNode = null;

  const timeOf = (at) => new Date(at).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });
  const label = () => {
    const unread = unseenRoom + friendUnread;
    // Cạnh ô chat chỗ hẹp: chỉ biểu tượng + số tin chưa xem.
    openButton.textContent = `💬${unread ? ` ${unread > 99 ? '99+' : unread}` : ''}`;
    openButton.setAttribute('aria-label', t('chat.center'));
    openButton.classList.toggle('has-unread', Boolean(unread));
  };
  label();

  async function api(path, body) {
    const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  }

  async function refreshUnread() {
    const result = await api('/api/v1/me/inbox').catch(() => null);
    if (!result?.ok) return;
    inbox = result.data.items || [];
    friendUnread = inbox.filter((item) => item.kind === 'note' && !item.read).length;
    label();
    if (!sheet.hidden && tab === 'friends' && !thread) render();
  }

  function composer(placeholder, onSend) {
    const form = el('form', 'friend-note chat-compose');
    const input = el('input');
    input.maxLength = tab === 'room' ? 120 : 200;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    const send = el('button', 'chip primary', t('chat.send'));
    send.type = 'submit';
    form.append(input, send);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (await onSend(text)) input.value = '';
      input.focus();
    });
    return form;
  }

  function messageRow({ name, avatar, text, at, mine }) {
    const row = el('div', `chat-line${mine ? ' mine' : ''}`);
    if (!mine) row.append(avatarNode({ displayName: name, avatarUrl: avatar }, 'avatar small'));
    const bubble = el('div', 'chat-bubble');
    const head = el('small', 'chat-meta', mine ? timeOf(at) : `${name} · ${timeOf(at)}`);
    bubble.append(head, el('span', '', text));
    row.append(bubble);
    return row;
  }

  function scrollDown(list, force = true) {
    // Đang kéo lên đọc tin cũ thì không giật xuống cuối.
    if (force || list.scrollHeight - list.scrollTop - list.clientHeight < 80) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  function fillRoom() {
    if (!roomMessages.length) logNode.replaceChildren(el('p', 'social-note', t('chat.empty')));
    else logNode.replaceChildren(...roomMessages.map(messageRow));
  }

  function renderRoom(body) {
    logNode = el('div', 'chat-log');
    fillRoom();
    body.append(logNode, composer(t('chat.placeholderRoom'), (text) => sendRoom(text)));
    scrollDown(logNode);
  }

  function renderFriendList(body) {
    const list = el('div', 'friend-list');
    if (friends === null) list.append(el('p', 'social-note', t('friends.loading')));
    else if (friends === 'guest') list.append(el('p', 'social-note', t('chat.signIn')));
    else if (!friends.length && !botFriends.length) list.append(el('p', 'social-note', t('chat.friendsEmpty')));
    else {
      const lastFrom = new Map();
      for (const item of inbox) if (item.kind === 'note' && !lastFrom.has(item.from.accountId)) lastFrom.set(item.from.accountId, item);
      const unreadOf = (id) => inbox.filter((item) => item.kind === 'note' && !item.read && item.from.accountId === id).length;
      const people = [...friends].sort((a, b) => (unreadOf(b.accountId) - unreadOf(a.accountId)) || ((lastFrom.get(b.accountId)?.at || 0) - (lastFrom.get(a.accountId)?.at || 0)) || (Number(b.online) - Number(a.online)));
      for (const friend of people) {
        const row = el('button', 'friend-row chat-friend');
        row.type = 'button';
        const unread = unreadOf(friend.accountId);
        row.classList.toggle('unread', Boolean(unread));
        const text = el('div', 'friend-text');
        const last = lastFrom.get(friend.accountId);
        text.append(el('b', '', `${friend.displayName}${unread ? ` · ${unread}` : ''}`), el('span', 'friend-sub', last ? last.text : friend.online ? `🟢 ${t('chat.online')}` : t('chat.offline')));
        row.append(avatarNode(friend, 'avatar'), text);
        row.addEventListener('click', () => openThread(friend));
        list.append(row);
      }
      // Không hiện bot đang ở phòng nào; trạng thái nội bộ chỉ dùng để quyết định có nhắn trực tiếp được hay không.
      for (const bot of botFriends) {
        const row = el('button', 'friend-row chat-friend');
        row.type = 'button';
        const text = el('div', 'friend-text');
        const date = new Date(bot.since).toLocaleDateString(document.documentElement.lang || undefined);
        text.append(el('b', '', bot.name), el('span', 'friend-sub', t('friends.since', { date })));
        row.append(avatarNode({ displayName: bot.name }, 'avatar'), text);
        row.addEventListener('click', () => openThread({ bot: true, displayName: bot.name }));
        list.append(row);
      }
    }
    body.append(list);
  }

  function renderThread(body) {
    const { friend, items } = thread;
    const head = el('div', 'chat-thread-head');
    head.append(button('chip', `‹ ${t('chat.tabFriends')}`, () => { thread = null; render(); refreshUnread(); }), el('b', '', friend.displayName));
    logNode = el('div', 'chat-log');
    fillThread();
    if (friend.bot) {
      // Nhắn bot = chat "@Tên bot …" trong phòng: chỉ được khi bot đang ở phòng này.
      const here = botHere(friend.displayName);
      body.append(head, logNode, here ? composer(t('chat.placeholderFriend', { name: friend.displayName }), (text) => {
        const sent = sendRoom(`@${friend.displayName} ${text}`.slice(0, 280));
        if (sent !== false) reloadThreadSoon();
        return sent !== false;
      }) : el('p', 'social-note', t('chat.botAway')));
      scrollDown(logNode);
      return;
    }
    body.append(head, logNode, composer(t('chat.placeholderFriend', { name: friend.displayName }), async (text) => {
      const result = await api('/api/v1/me/friends/note', { accountId: friend.accountId, text }).catch(() => ({ ok: false, data: {} }));
      if (!result.ok) {
        const own = t(`friends.err.${result.data?.error}`);
        showToast(own !== `friends.err.${result.data?.error}` ? own : t('friends.err.other'));
        return false;
      }
      await loadThread();
      return true;
    }));
    scrollDown(logNode);
  }

  function fillThread() {
    const { friend, items } = thread;
    if (items === null) logNode.replaceChildren(el('p', 'social-note', t('friends.loading')));
    else if (!items.length) logNode.replaceChildren(el('p', 'social-note', t('chat.threadEmpty')));
    else logNode.replaceChildren(...items.map((item) => messageRow({ name: friend.displayName, avatar: friend.avatarUrl, text: item.text, at: item.at, mine: item.mine })));
  }

  function render() {
    const close = button('mala-back', `‹ ${t('mala.back')}`, () => { sheet.hidden = true; });
    const tabs = el('div', 'tabs chat-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [key, text] of [['room', t('chat.tabRoom')], ['friends', `${t('chat.tabFriends')}${friendUnread ? ` · ${friendUnread}` : ''}`]]) {
      const tabButton = button('', text, () => { tab = key; thread = null; if (key === 'friends') loadFriends(); render(); });
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-selected', String(tab === key));
      tabs.append(tabButton);
    }
    const body = el('div', 'chat-body');
    logNode = null;
    if (tab === 'room') renderRoom(body);
    else if (thread) renderThread(body);
    else renderFriendList(body);
    sheet.replaceChildren(close, el('h2', '', t('chat.center')), tabs, body);
  }

  async function loadFriends() {
    friends = null;
    try {
      const response = await fetch('/api/v1/me/friends', { credentials: 'same-origin' });
      if (response.status === 401 || response.status === 503) friends = 'guest';
      else {
        const data = response.ok ? await response.json() : {};
        friends = data.friends || [];
        botFriends = (data.botFriends || []).filter((item) => typeof item?.name === 'string');
      }
    } catch {
      friends = [];
    }
    if (friends !== 'guest') await refreshUnread();
    if (!sheet.hidden && tab === 'friends' && !thread) render();
  }

  async function loadThread() {
    if (!thread) return;
    const current = thread;
    const result = await api(current.friend.bot
      ? `/api/v1/me/bot-thread?name=${encodeURIComponent(current.friend.displayName)}`
      : `/api/v1/me/friends/thread?with=${encodeURIComponent(current.friend.accountId)}`).catch(() => null);
    if (thread !== current) return;
    current.items = result?.ok ? result.data.items : [];
    if (!sheet.hidden && logNode && thread === current) {
      fillThread();
      scrollDown(logNode);
    }
  }

  // Câu bot trả lời đến qua chat phòng, API lưu ngay sau đó: chờ một chút rồi tải lại cuộc trò chuyện.
  function reloadThreadSoon() {
    clearTimeout(threadReload);
    threadReload = setTimeout(() => { if (thread?.friend.bot && !sheet.hidden) loadThread(); }, 700);
  }

  async function openThread(friend) {
    thread = { friend, items: null };
    render();
    await loadThread();
    // Mở cuộc trò chuyện là đã đọc tin của bạn đó (API ghi đã đọc).
    for (const item of inbox) if (item.kind === 'note' && item.from.accountId === friend.accountId) item.read = true;
    friendUnread = inbox.filter((item) => item.kind === 'note' && !item.read).length;
    label();
  }

  function open(nextTab = tab) {
    tab = nextTab;
    thread = null;
    sheet.hidden = false;
    if (tab === 'room') unseenRoom = 0;
    label();
    render();
    loadFriends();
  }

  // Có tin riêng của bạn bè chưa đọc thì mở thẳng thẻ Bạn bè.
  openButton.addEventListener('click', () => open(friendUnread ? 'friends' : tab));
  onLangChange(() => {
    label();
    if (!sheet.hidden) render();
  });

  return {
    openButton,
    open,
    // Không "nuốt" message: chánh điện và màn Bạn bè vẫn xử lý tiếp.
    onMessage(message) {
      if (message.type === 'room.state' && !friendUnread && friends === null) refreshUnread();
      if (message.type === 'inbox.notify') {
        refreshUnread();
        if (thread && !sheet.hidden) loadThread();
      }
      // Vào phòng / nối lại: thay bằng sổ chat trong ngày của phòng (không cộng vào số tin chưa xem).
      if (message.type === 'chat.history') {
        roomMessages.splice(0, roomMessages.length, ...message.messages.filter((item) => !isBlocked?.(item.participantId)).map((item) => ({
          name: item.displayName || '?', text: item.text, at: item.sentAt, mine: item.participantId === selfId?.(),
        })));
        dropYesterday(roomMessages);
        if (!sheet.hidden && tab === 'room' && logNode) {
          fillRoom();
          scrollDown(logNode);
        }
        return;
      }
      if (message.type !== 'chat.message' || isBlocked?.(message.participantId)) return;
      if (thread?.friend.bot && !sheet.hidden && message.displayName === thread.friend.displayName && botHere(message.displayName)?.id === message.participantId) reloadThreadSoon();
      const item = { name: message.displayName, text: message.text, at: message.sentAt || Date.now(), mine: message.participantId === selfId?.() };
      roomMessages.push(item);
      dropYesterday(roomMessages);
      if (roomMessages.length > ROOM_KEEP) roomMessages.splice(0, roomMessages.length - ROOM_KEEP);
      if (sheet.hidden || tab !== 'room' || !logNode) {
        if (!item.mine) unseenRoom += 1;
        label();
        return;
      }
      if (!logNode.querySelector('.chat-line')) logNode.replaceChildren();
      logNode.append(messageRow(item));
      while (logNode.children.length > ROOM_KEEP) logNode.firstElementChild.remove();
      scrollDown(logNode, item.mine);
    },
  };
}
