// Kết nối realtime dùng chung cho các trang phòng: xin vé, nối lại bằng resume token, hỏi API máy đang giữ phòng,
// backoff + jitter, đo giờ server bằng ping/pong. Trang chỉ xử lý message của phòng qua onMessage.
const PROTOCOL_VERSION = 1;
const RESUME_WINDOW_MS = 60_000;

function realtimeEndpoint(url) {
  if (!url.startsWith('/')) return new URL(url);
  return new URL(url, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
}

export function createRoomSession({ roomId, roomInvite = null, onMessage, onStatus }) {
  let storageKey = `room-session-${roomId}`;
  let session = null;
  let socket = null;
  let online = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let pingTimer = null;
  let disconnectedAt = 0;
  let clock = { offset: 0, rtt: Infinity };

  // Trang nhiều ngôn ngữ dịch theo khóa (tham số thứ ba); trang khác dùng chữ tiếng Việt có sẵn.
  const status = (state, label, key) => onStatus?.(state, label, key);

  function save() {
    try {
      if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }

  async function requestTicket(displayName) {
    const response = await fetch(`${location.origin}/api/v1/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, displayName, ...(roomInvite ? { inviteCode: roomInvite } : {}) }),
    });
    if (!response.ok) throw new Error('Không thể vào phòng lúc này, thử lại sau.');
    return response.json();
  }

  async function locate() {
    const response = await fetch(`${location.origin}/api/v1/rooms/${encodeURIComponent(roomId)}/locate`);
    if (!response.ok) throw new Error('Chưa tìm được máy giữ phòng');
    return (await response.json()).realtimeUrl;
  }

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
    return true;
  }

  const ping = () => send({ type: 'ping', sentAt: Date.now() });

  function handle(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.v !== PROTOCOL_VERSION) return;
    if (message.type === 'welcome') {
      reconnectAttempt = 0;
      disconnectedAt = 0;
      session.resumeToken = message.resumeToken;
      delete session.ticketRejected;
      save();
      online = true;
      clock = { offset: message.serverTime - Date.now(), rtt: Infinity };
      for (const delay of [0, 400, 1_200]) setTimeout(ping, delay);
      status('online', 'Đã kết nối', 'status.online');
    } else if (message.type === 'pong') {
      // Giữ mẫu có độ trễ khứ hồi nhỏ nhất: offset chính xác nhất.
      const rtt = Date.now() - message.sentAt;
      if (rtt >= 0 && rtt <= 10_000 && rtt <= clock.rtt * 1.5) {
        clock = { offset: message.serverTime - (message.sentAt + rtt / 2), rtt: Math.min(rtt, clock.rtt) };
      }
      return;
    } else if (message.type === 'protocol.error' && (message.code === 'INVALID_RESUME_TOKEN' || message.code === 'INVALID_TICKET')) {
      // Vé không còn dùng được (hết hạn, server đổi khóa): lần nối lại tới xin vé mới ngay, giữ tên.
      delete session.resumeToken;
      session.ticketRejected = true;
      reconnectAttempt = 0;
      save();
    } else if (message.type === 'protocol.error' && (message.code === 'ROOM_FULL' || message.code === 'SESSION_REPLACED')) {
      // Mã mời trỏ đúng phòng nhưng phòng đã kín, hoặc tài khoản vừa vào phòng từ trình duyệt / máy khác: dừng hẳn vòng
      // nối lại để trang đưa người dùng về cổng vào (không giành qua giành lại giữa hai tab).
      session = null;
      online = false;
      save();
    }
    onMessage(message);
  }

  function connect() {
    clearInterval(pingTimer);
    status('connecting', 'Đang kết nối…', 'status.connecting');
    const url = realtimeEndpoint(session.realtimeUrl);
    url.searchParams.set('ticket', session.ticket);
    if (session.resumeToken) url.searchParams.set('resumeToken', session.resumeToken);
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'hello',
        roomId: session.roomId,
        displayName: session.displayName,
        ...(session.resumeToken ? { resumeToken: session.resumeToken } : {}),
      }));
      pingTimer = setInterval(ping, 10_000);
    });
    socket.addEventListener('message', handle);
    socket.addEventListener('close', () => {
      clearInterval(pingTimer);
      online = false;
      if (!disconnectedAt) disconnectedAt = Date.now();
      if (session) scheduleReconnect();
    });
    socket.addEventListener('error', () => status('connecting', 'Lỗi kết nối', 'status.error'));
  }

  function scheduleReconnect() {
    if (!session || reconnectTimer) return;
    reconnectAttempt += 1;
    // Trần 4 giây (lease phòng hết hạn sau ~10 giây khi máy chết), jitter ±50% để không dồn cùng lúc.
    const base = Math.min(4_000, 500 * (2 ** Math.min(reconnectAttempt, 3)));
    status('connecting', 'Đang kết nối lại…', 'status.reconnecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnect();
    }, Math.floor(base / 2 + Math.random() * base));
  }

  async function reconnect() {
    if (!session.resumeToken || session.ticketRejected || (disconnectedAt && Date.now() - disconnectedAt > RESUME_WINDOW_MS + 5_000)) {
      try {
        session = await requestTicket(session.displayName);
        save();
        disconnectedAt = Date.now();
      } catch {
        scheduleReconnect();
        return;
      }
    }
    try {
      session.realtimeUrl = await locate();
      save();
    } catch {
      scheduleReconnect();
      return;
    }
    connect();
  }

  return {
    get participantId() { return session?.participantId || null; },
    get roomId() { return roomId; },
    // Chánh điện theo tiểu bang: phòng được chọn lúc bấm vào (API xếp phòng), nên đổi phòng trước khi join/restore.
    setRoom(nextRoomId, nextInvite = null) {
      if (session) throw new Error('Rời phòng trước khi đổi phòng');
      roomId = nextRoomId;
      roomInvite = nextInvite;
      storageKey = `room-session-${roomId}`;
    },
    get displayName() { return session?.displayName || ''; },
    get online() { return online && socket?.readyState === WebSocket.OPEN; },
    serverNow: () => Date.now() + clock.offset,
    send,
    async join(displayName) {
      session = await requestTicket(displayName);
      save();
      connect();
    },
    // Phiên còn lưu trong tab (tải lại trang): nối lại ngay, giữ người và ghế.
    restore() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey));
        if (saved?.roomId === roomId && typeof saved.ticket === 'string' && typeof saved.displayName === 'string') {
          session = saved;
          connect();
          return true;
        }
      } catch {}
      return false;
    },
    leave() {
      const closing = socket;
      session = null;
      save();
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closing?.close(1000, 'Rời phòng');
    },
  };
}
