import { createSceneRenderer } from '/engine/renderer.mjs';
import { parseYouTubeId } from '/youtube.js';
import { createBootLoader, waitFor } from '/boot-loader.js';
import { createGemUI } from '/gem-ui.js';
import { loadShopCharacters } from '/shop-models.js';
import { theaterSeats } from '/engine/theater.mjs';

const PROTOCOL_VERSION = 1;
const RESUME_WINDOW_MS = 60_000;
const SESSION_KEY = 'cinema-session-v1';
const SCENE_ID = 'cinema-default';
const roomId = new URLSearchParams(location.search).get('room') || 'cinema-1';
// API và realtime đi qua cùng origin với trang (web server chuyển tiếp /api và /ws).
const apiOrigin = location.origin;

function realtimeEndpoint(url) {
  if (!url.startsWith('/')) return new URL(url);
  return new URL(url, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
}

const $ = (id) => document.getElementById(id);
const elements = {
  cameras: $('cameras'),
  chatBadge: $('chatBadge'),
  chatCount: $('chatCount'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  coinChip: $('coinChip'),
  coinCount: $('coinCount'),
  copyLink: $('copyLink'),
  drawer: $('drawer'),
  drawerClose: $('drawerClose'),
  drawerTitle: $('drawerTitle'),
  fullscreen: $('fullscreen'),
  hideHud: $('hideHud'),
  hudBottom: $('hudBottom'),
  hudTools: $('hudTools'),
  hudTop: $('hudTop'),
  rotateHint: $('rotateHint'),
  zoomBar: $('zoomBar'),
  zoomExit: $('zoomExit'),
  zoomMute: $('zoomMute'),
  zoomReact: $('zoomReact'),
  joystick: $('joystick'),
  nearSit: $('nearSit'),
  seatMap: $('seatMap'),
  liveState: $('liveState'),
  muteToggle: $('muteToggle'),
  onlineCount: $('onlineCount'),
  queueBadge: $('queueBadge'),
  reactionPicker: $('reactionPicker'),
  showHud: $('showHud'),
  stage: $('stage'),
  voteInfo: $('voteInfo'),
  volume: $('volume'),
  volumeLabel: $('volumeLabel'),
  connection: $('connection'),
  displayName: $('displayName'),
  formError: $('formError'),
  joinForm: $('joinForm'),
  joinLayer: $('joinLayer'),
  messages: $('messages'),
  notice: $('notice'),
  nowMeta: $('nowMeta'),
  nowTitle: $('nowTitle'),
  participantCount: $('participantCount'),
  people: $('people'),
  queueCount: $('queueCount'),
  queueForm: $('queueForm'),
  queueInput: $('queueInput'),
  queueList: $('queueList'),
  scene: $('scene'),
  scene3d: $('scene3d'),
  screenIdle: $('screenIdle'),
  screenSlot: $('screenSlot'),
  seatLabel: $('seatLabel'),
  skipBar: $('skipBar'),
  skipButton: $('skipButton'),
  travelPanel: $('travelPanel'),
  travelToggle: $('travelToggle'),
  unmute: $('unmute'),
};

let session = null;
let socket = null;
let participants = new Map();
let reconnectAttempt = 0;
let reconnectTimer = null;
let pingTimer = null;
let disconnectedAt = 0;
let renderer = null;
let cameraId = 'overview';
let playback = { current: null, queue: [], votes: 0, votesNeeded: 1 };
let votedItemId = null;

// Nam/Nữ (hoặc hình mua trong shop) chọn ở cổng chùa, lưu trong máy; hình cũ (sư cô, bà cụ…) quy về nữ, còn lại nam.
function chosenSkin() {
  let saved = null;
  try { saved = localStorage.getItem('thien-skin'); } catch {}
  if (saved === 'chibigirl' || /^shop-[a-z0-9-]{2,30}$/.test(saved || '')) return saved;
  return ['woman', 'nun', 'granny'].includes(saved) ? 'woman' : 'man';
}

let skinSentFor = null;
// Hình chọn lần cuối theo tài khoản (đăng nhập): ghi vào máy để chosenSkin() trả đúng hình đó.
const skinSync = fetch('/api/v1/shop', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((shop) => {
  if (shop?.me?.skin) {
    try { localStorage.setItem('thien-skin', shop.me.skin); } catch {}
  }
}).catch(() => {});
// Hình shop đã xin vé mới để mặc (chỉ một lần mỗi hình, tránh vòng lặp).
let renewedSkinTicket = null;

function requestId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function send(message) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
  return true;
}

// Thông báo trong khán phòng (lỗi chọn ghế, chat quá nhanh, video bị từ chối…).
let noticeTimer = null;
function notify(text) {
  elements.notice.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { elements.notice.textContent = ''; }, 4_000);
}

function setConnection(state, label) {
  elements.connection.className = `connection ${state}`;
  elements.connection.querySelector('span').textContent = label;
  elements.connection.title = label;
}

let online = false;
function setOnline(enabled) {
  online = enabled;
  for (const control of [elements.chatInput, elements.queueInput, ...document.querySelectorAll('#chatForm button, #queueForm button')]) {
    control.disabled = !enabled;
  }
  renderPlayback();
}

const isOnline = () => online && socket?.readyState === WebSocket.OPEN;

function saveSession() {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

// ---- Đồng hồ server: vị trí video = (giờ server − startedAt) / 1000. Giữ mẫu có độ trễ khứ hồi nhỏ nhất. ----
let clock = { offset: 0, rtt: Infinity };
const serverNow = () => Date.now() + clock.offset;

function onPong(message) {
  const rtt = Date.now() - message.sentAt;
  if (rtt < 0 || rtt > 10_000 || rtt > clock.rtt * 1.5) return;
  clock = { offset: message.serverTime - (message.sentAt + rtt / 2), rtt: Math.min(rtt, clock.rtt) };
}

function ping() {
  send({ type: 'ping', sentAt: Date.now() });
}

// ---- Khán phòng (3D: cả người đang đi; 2.5D: chỉ người ngồi ghế) ----
function sceneParticipants() {
  const all = renderer?.mode === '3d';
  return [...participants.values()].filter((person) => person.seatId || (all && (person.pos || person.id === session?.participantId)))
    .filter((person) => person.connected !== false || person.seatId)
    .map((person) => ({
      id: person.id,
      name: person.displayName,
      seatId: person.seatId,
      pos: person.pos,
      skin: person.skin,
      me: person.id === session?.participantId,
    }));
}

// Rạp 3D khi máy có WebGL (thêm ?2d=1 để dùng cảnh 2.5D); lỗi thì quay về 2.5D. Hai canvas riêng vì một canvas
// chỉ giữ được một loại context.
function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

// Ghế đôi (sofa) theo bố cục rạp 3D: id ghế → id ghế cùng sofa.
let partners = new Map();

async function setupScene() {
  const scene = await (await fetch(`/scenes/${SCENE_ID}/scene.json`)).json();
  if (scene.theater3d) partners = new Map(theaterSeats(scene).filter((seat) => seat.couple).map((seat) => [seat.id, seat.couple.partner]));
  if (scene.theater3d && webglAvailable() && !new URLSearchParams(location.search).has('2d')) {
    try {
      const { createCinemaRenderer3D } = await import('/engine/cinema3d.mjs');
      elements.scene3d.hidden = false;
      elements.scene.hidden = true;
      // Nhân vật admin tải lên (shop-…): nạp mô hình trước khi dựng khán giả / người đi lại.
      await loadShopCharacters();
      renderer = await createCinemaRenderer3D({
        canvas: elements.scene3d, scene, onSeatClick: selectSeat,
        onMove: (position) => send({ type: 'move', ...position }),
        // Đang xem ngang thì giữ góc màn chiếu (vừa vào phòng / ngồi xuống bộ vẽ tự đổi góc).
        onCameraChange: (id) => {
          if (zoom.on && id !== 'zoom') renderer.setCamera('zoom');
          else markCamera(id);
        },
        onNearSeat: (seatId) => {
          elements.nearSit.hidden = !seatId;
          if (seatId) elements.nearSit.textContent = `💺 Ngồi ghế ${seatId}`;
        },
      });
    } catch (error) {
      console.warn('Không dựng được rạp 3D, dùng cảnh 2.5D', error);
      elements.scene3d.hidden = true;
      elements.scene.hidden = false;
    }
  }
  renderer ||= await createSceneRenderer({ canvas: elements.scene, scene, baseUrl: `/scenes/${SCENE_ID}/`, onSeatClick: selectSeat });
  renderer.setParticipants(sceneParticipants());
  renderer.setScreenActive?.(Boolean(playback.current));
  // Kiểm tra khi phát triển: localStorage 'debug-cinema' = '1' thì window.cinemaRenderer là bộ vẽ khán phòng.
  try { if (localStorage.getItem('debug-cinema') === '1') window.cinemaRenderer = renderer; } catch {}
  if (cameraId !== 'overview') setCamera(cameraId);
  updateInsets();
  showJoystick();
  onOrientation();
  requestAnimationFrame(placeScreen);
}

// Khung YouTube đi theo camera: đặt lại mỗi khung hình theo toạ độ màn chiếu của cảnh
// (thêm một nhịp 500 ms vì requestAnimationFrame dừng khi tab ở nền).
function placeScreen() {
  positionScreen();
  requestAnimationFrame(placeScreen);
}

function positionScreen() {
  const rect = renderer?.screenRect();
  if (rect) {
    const style = elements.screenSlot.style;
    style.left = `${rect.x}px`;
    style.top = `${rect.y}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
    elements.screenSlot.classList.toggle('pip', Boolean(rect.pip));
    // Không gì được nằm trên khung player: cần điều khiển / nút "Ngồi" chạm khung thì tạm ẩn (không bấm được).
    const slot = elements.screenSlot.getBoundingClientRect();
    for (const element of [elements.joystick, elements.nearSit]) {
      if (element.hidden) continue;
      const box = element.getBoundingClientRect();
      const touches = box.right > slot.left && box.left < slot.right && box.bottom > slot.top && box.top < slot.bottom;
      element.style.visibility = touches ? 'hidden' : '';
    }
  }
}

function markCamera(id) {
  cameraId = id;
  for (const button of elements.cameras.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.camera === id));
  }
}

function setCamera(id) {
  markCamera(id);
  renderer?.setCamera(id, participants.get(session?.participantId)?.seatId);
}

// Phần khán phòng bị các thanh giao diện che (px). Bộ vẽ đặt màn chiếu trong phần còn lại, nên không nút nào nằm
// đè lên khung YouTube. Ngăn kéo: máy tính chừa bên phải, điện thoại chừa phía dưới.
function updateInsets() {
  if (!renderer?.setInsets) return;
  const stage = elements.stage.getBoundingClientRect();
  // Xem ngang: chừa dải nút bên phải, và chừa bằng nhau bên trái để màn chiếu ở giữa.
  if (zoom.on) {
    const bar = elements.zoomBar.getBoundingClientRect();
    // Màn dọc: thanh nút ở đáy, video rộng hết bề ngang.
    if (stage.height > stage.width) renderer.setInsets({ top: 0, right: 0, bottom: stage.bottom - bar.top + 8, left: 0 });
    else {
      const side = stage.right - bar.left + 8;
      renderer.setInsets({ top: 0, right: side, bottom: 0, left: side });
    }
    return;
  }
  if (elements.stage.classList.contains('hud-off')) {
    renderer.setInsets({ top: 0, right: 0, bottom: stage.bottom - elements.showHud.getBoundingClientRect().top + 8, left: 0 });
    return;
  }
  const visible = (element) => !element.hidden && element.getClientRects().length > 0;
  const top = Math.max(0, ...[...elements.hudTop.children].filter(visible).map((item) => item.getBoundingClientRect().bottom - stage.top)) + 10;
  const below = [elements.hudBottom, elements.hudTools, elements.drawer].filter(visible).map((item) => item.getBoundingClientRect());
  // Thanh nằm ở nửa dưới tính vào phần dưới; thanh dọc bên phải (máy tính) tính vào phần phải.
  let bottom = 0;
  let right = 0;
  for (const box of below) {
    if (box.top - stage.top > stage.height * 0.45) bottom = Math.max(bottom, stage.bottom - box.top + 10);
    else right = Math.max(right, stage.right - box.left + 10);
  }
  renderer.setInsets({ top, right, bottom, left: 0 });
}

function selectSeat(seat) {
  if (!session) {
    elements.joinLayer.hidden = false;
    elements.displayName.focus();
    return;
  }
  if (!isOnline()) {
    notify('Đang kết nối, bạn chọn ghế lại sau giây lát nhé.');
    return;
  }
  const owner = [...participants.values()].find((person) => person.seatId === seat.id);
  if (owner && owner.id !== session.participantId) {
    notify(`Ghế ${seat.id} đã có ${owner.displayName}`);
    return;
  }
  send({ type: 'seat.select', requestId: requestId('seat'), seatId: seat.id });
}

// ---- Danh sách người, chat ----
function renderPeople() {
  elements.participantCount.textContent = `${participants.size} người`;
  const mySeat = participants.get(session?.participantId)?.seatId;
  elements.seatLabel.textContent = mySeat ? `Bạn ngồi ghế ${mySeat}` : 'Chạm ghế có vòng sáng để ngồi';
  const seated = [...participants.values()].filter((person) => person.seatId).length;
  elements.onlineCount.textContent = `👥 ${participants.size} online · ${seated}/100 ghế`;
  elements.people.replaceChildren();
  if (!participants.size) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Chưa có ai trong phòng.';
    elements.people.append(empty);
    return;
  }
  for (const participant of participants.values()) {
    const row = document.createElement('div');
    row.className = `person${participant.id === session?.participantId ? ' me' : ''}${participant.connected === false ? ' disconnected' : ''}`;
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = participant.displayName.slice(0, 1).toLocaleUpperCase('vi');
    const name = document.createElement('b');
    name.textContent = participant.displayName;
    const seat = document.createElement('small');
    seat.textContent = `${participant.connected === false ? 'Đang nối lại · ' : ''}${participant.seatId || 'Khán đài'}`;
    row.append(avatar, name, seat);
    elements.people.append(row);
  }
}

function addMessage(author, text, className = 'message') {
  elements.messages.querySelector('.empty')?.remove();
  const item = document.createElement('p');
  item.className = className;
  if (author) {
    const name = document.createElement('b');
    name.textContent = author;
    item.append(name);
  }
  item.append(document.createTextNode(text));
  elements.messages.append(item);
  while (elements.messages.children.length > 40) elements.messages.firstElementChild.remove();
  elements.messages.scrollTop = elements.messages.scrollHeight;
  if (drawerPart !== 'chat' && className === 'message') {
    unread += 1;
    elements.chatBadge.textContent = unread > 9 ? '9+' : String(unread);
    elements.chatBadge.hidden = false;
  }
}

// ---- YouTube: trình phát nằm đúng khung màn chiếu, không có nút điều khiển riêng; server quyết định bài và giờ. ----
let player = null;
let playerReady = false;
let loadedItemId = null;
let reportedDuration = null;
let muted = true;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = reject;
    document.head.append(script);
  });
}

async function setupPlayer() {
  await loadYouTubeApi();
  player = new YT.Player('player', {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0, origin: location.origin,
    },
    events: {
      onReady: () => {
        playerReady = true;
        player.mute();
        applyPlayback();
      },
      onStateChange: onPlayerState,
      onError: (event) => {
        if (playback.current) send({ type: 'playback.report', itemId: playback.current.itemId, event: 'error', value: Number(event.data) || 0 });
        notify('Video này không phát được trên máy bạn');
      },
    },
  });
}

function onPlayerState(event) {
  const current = playback.current;
  if (!current) return;
  if (event.data === YT.PlayerState.PLAYING) {
    const duration = player.getDuration();
    // Livestream không có thời lượng cố định: không báo, để phòng chuyển bài bằng vote bỏ qua.
    if (duration > 0 && !isLive() && reportedDuration !== current.itemId) {
      reportedDuration = current.itemId;
      send({ type: 'playback.report', itemId: current.itemId, event: 'duration', value: Math.round(duration * 10) / 10 });
    }
    elements.unmute.hidden = !muted;
  } else if (event.data === YT.PlayerState.ENDED) {
    send({ type: 'playback.report', itemId: current.itemId, event: 'ended' });
  }
}

function isLive() {
  try { return Boolean(player.getVideoData?.().isLive); } catch { return false; }
}

function expectedPosition() {
  return playback.current ? (serverNow() - playback.current.startedAt) / 1_000 : 0;
}

function applyPlayback() {
  renderPlayback();
  const current = playback.current;
  elements.screenIdle.hidden = Boolean(current);
  renderer?.setScreenActive?.(Boolean(current));
  if (!playerReady) return;
  if (!current) {
    if (loadedItemId) player.stopVideo();
    loadedItemId = null;
    elements.unmute.hidden = true;
    return;
  }
  if (current.itemId !== loadedItemId) {
    loadedItemId = current.itemId;
    player.loadVideoById({ videoId: current.videoId, startSeconds: Math.max(0, expectedPosition()) });
  }
}

// Mỗi giây so vị trí với giờ chung: lệch < 0,5 s bỏ qua; 0,5–2 s đổi tốc độ; > 2 s tua. Quảng cáo làm lệch tạm thời.
function syncPlayer() {
  const current = playback.current;
  if (!playerReady || !current || current.itemId !== loadedItemId) return;
  const expected = expectedPosition();
  const state = player.getPlayerState();
  if (expected < 0) {
    if (state === YT.PlayerState.PLAYING) player.pauseVideo();
    return;
  }
  if (current.duration && expected > current.duration) return;
  if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.CUED || state === -1) player.playVideo();
  if (state !== YT.PlayerState.PLAYING || isLive()) return;
  const drift = player.getCurrentTime() - expected;
  if (Math.abs(drift) > 2) {
    player.seekTo(expected, true);
    player.setPlaybackRate(1);
  } else if (Math.abs(drift) > 0.5) {
    player.setPlaybackRate(drift > 0 ? 0.75 : 1.25);
  } else if (Math.abs(drift) < 0.2 && player.getPlaybackRate() !== 1) {
    player.setPlaybackRate(1);
  }
}

function formatTime(seconds) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function renderPlayback() {
  const { current, queue, votes, votesNeeded } = playback;
  elements.nowTitle.textContent = current ? (current.title || `YouTube · ${current.videoId}`) : 'Chưa có video';
  elements.nowMeta.textContent = current
    ? `${current.addedBy} đề xuất${current.duration ? ` · ${formatTime(current.duration)}` : ''}`
    : 'Bấm "Gửi video" để chiếu cho cả rạp';
  const voted = Boolean(current) && votedItemId === current.itemId;
  elements.skipButton.disabled = !current || voted || !isOnline();
  elements.skipButton.classList.toggle('voted', voted);
  // Chữ "Vote bỏ qua" tách riêng để điện thoại ẩn đi (chỉ còn ⏭ và số phiếu) cho đủ chỗ nút nhanh bên phải.
  const label = Object.assign(document.createElement('span'), { className: 'skip-label', textContent: ' Vote bỏ qua' });
  elements.skipButton.replaceChildren('⏭', label, current ? ` ${votes}/${votesNeeded}` : '');
  elements.skipButton.title = 'Vote bỏ qua';
  elements.skipBar.style.width = current ? `${Math.min(100, (votes / votesNeeded) * 100)}%` : '0';
  elements.voteInfo.textContent = current ? `${votes}/${votesNeeded} người đồng ý thì chuyển bài` : '';
  elements.liveState.textContent = current ? '● Đang chiếu' : '● Chờ chiếu';
  elements.liveState.classList.toggle('on', Boolean(current));
  elements.queueCount.textContent = `${queue.length} video đang chờ`;
  elements.queueBadge.textContent = String(queue.length);
  elements.queueBadge.hidden = !queue.length;
  elements.queueList.replaceChildren(...queue.map((item) => {
    const row = document.createElement('li');
    const body = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = item.title || `YouTube · ${item.videoId}`;
    const by = document.createElement('small');
    by.textContent = `${item.addedBy} đề xuất`;
    body.append(title, by);
    row.append(body);
    return row;
  }));
}

// ---- Realtime ----
function handleMessage(event) {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.v !== PROTOCOL_VERSION) return;
  if (message.type === 'welcome') {
    reconnectAttempt = 0;
    disconnectedAt = 0;
    session.resumeToken = message.resumeToken;
    saveSession();
    setConnection('online', 'Đã kết nối');
    setOnline(true);
    clock = { offset: message.serverTime - Date.now(), rtt: Infinity };
    for (const delay of [0, 400, 1_200]) setTimeout(ping, delay);
  } else if (message.type === 'room.state') {
    const mySeatBefore = participants.get(session?.participantId)?.seatId;
    participants = new Map(message.participants.map((participant) => [participant.id, participant]));
    // Nhân vật Nam/Nữ đã chọn ở cổng chùa: báo server một lần để cả rạp thấy đúng (không bị đổi nhân vật).
    const mine = participants.get(session?.participantId);
    // Đọc hình lưu theo tài khoản trước (vé đã mang hình đó), tránh hình cũ nhớ trên máy ghi đè.
    skinSync.then(() => {
      const current = participants.get(session?.participantId);
      if (current && current.skin !== chosenSkin() && skinSentFor !== session.participantId) {
        skinSentFor = session.participantId;
        send({ type: 'avatar.set', requestId: requestId('skin'), skin: chosenSkin() });
      }
    });
    renderer?.setParticipants(sceneParticipants());
    renderPeople();
    if (drawerPart === 'seats') renderSeatMap();
    showJoystick();
    const mySeat = participants.get(session?.participantId)?.seatId;
    if (mySeat && mySeat !== mySeatBefore && cameraId === 'seat' && renderer?.mode !== '3d') setCamera('seat');
  } else if (message.type === 'room.moves') {
    for (const move of message.moves) {
      const person = participants.get(move.id);
      if (person) person.pos = { x: move.x, z: move.z, ry: move.ry };
    }
    renderer?.applyMoves?.(message.moves);
  } else if (message.type === 'reaction') {
    // Của mình đã hiện ngay lúc bấm.
    if (message.participantId !== session?.participantId) renderer?.react?.(message.participantId, message.kind);
  } else if (message.type === 'playback.state') {
    const changed = message.current?.itemId !== playback.current?.itemId;
    playback = message;
    if (changed && message.current) {
      addMessage(null, `Đang chiếu: ${message.current.title || message.current.videoId} (${message.current.addedBy} đề xuất)`, 'message system');
    }
    applyPlayback();
  } else if (message.type === 'chat.message') {
    addMessage(participants.get(message.participantId)?.displayName || message.displayName || 'Khách', message.text);
    renderer?.say(message.participantId, message.text);
  } else if (message.type === 'pong') {
    onPong(message);
  } else if (message.type === 'protocol.error') {
    if (message.code === 'SESSION_REPLACED') {
      sessionReplaced = true;
      notify('Tài khoản đã vào rạp từ trình duyệt hoặc máy khác · tải lại trang để xem ở đây');
      return;
    }
    if (message.code === 'INVALID_RESUME_TOKEN' || message.code === 'INVALID_TICKET') {
      // Vé không còn dùng được: lần nối lại tới sẽ xin vé mới ngay (giữ tên hiển thị).
      delete session.resumeToken;
      session.ticketRejected = true;
      reconnectAttempt = 0;
      saveSession();
    }
    // Hình shop chưa mua (chưa đăng nhập, hoặc vé cũ): mặc hình Nữ thường.
    if (message.code === 'SKIN_LOCKED') {
      const wanted = chosenSkin();
      fetch('/api/v1/shop', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null).then((shop) => {
        // Đã mua (vé cũ cấp trước lúc mua, nối lại bằng resume token): xin vé mới một lần, vé mới ghi hình đã mua.
        if (shop?.me?.owned?.includes(wanted) && renewedSkinTicket !== wanted) {
          renewedSkinTicket = wanted;
          delete session.resumeToken;
          session.ticketRejected = true;
          reconnectAttempt = 0;
          saveSession();
          socket?.close();
          return;
        }
        // Chưa mua: tạm mặc hình Nam/Nữ thay thế; vẫn nhớ lựa chọn trên máy (đăng nhập lại là mặc được).
        import('/engine/chibi3d.mjs').then(({ chibiBaseOf }) => {
          send({ type: 'avatar.set', requestId: requestId('skin'), skin: chibiBaseOf(wanted) });
        });
        notify('Bạn chưa sở hữu hình này · tạm mặc hình thường');
      });
    } else if (message.code === 'WALKERS_FULL') notify('Rạp đông, bạn đang xem như khán giả (vẫn chọn ghế được)');
    else if (['UNKNOWN_MESSAGE_TYPE', 'INVALID_MESSAGE'].includes(message.code) && Date.now() - reactedAt < 3_000) {
      notify('Máy chủ rạp chưa cập nhật tính năng thả cảm xúc: cần khởi động lại server');
    }
    else notify(message.message);
  }
}

// Tài khoản vừa vào rạp từ trình duyệt / máy khác: tab này thôi tự nối lại (tải lại trang để xem ở đây).
let sessionReplaced = false;

function scheduleReconnect() {
  if (!session || reconnectTimer || sessionReplaced) return;
  reconnectAttempt += 1;
  // Trần 4 giây: lease phòng hết hạn sau ~10 giây nên máy mới nhận phòng sớm; jitter ±50% để không dồn cùng lúc.
  const base = Math.min(4_000, 500 * (2 ** Math.min(reconnectAttempt, 3)));
  const delay = Math.floor(base / 2 + Math.random() * base);
  setConnection('connecting', 'Đang kết nối lại…');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectRealtime();
  }, delay);
}

async function reconnectRealtime() {
  // Không còn resume token (server báo hết hạn) hoặc đã quá thời gian giữ chỗ: xin vé mới, vào như người mới.
  if (!session.resumeToken || session.ticketRejected || (disconnectedAt && Date.now() - disconnectedAt > RESUME_WINDOW_MS + 5_000)) {
    try {
      session = await joinRoom(session.displayName);
      saveSession();
      disconnectedAt = Date.now();
    } catch {
      scheduleReconnect();
      return;
    }
  }
  // Phòng có thể đã chuyển sang máy realtime khác (máy cũ chết hoặc đang rút): hỏi lại API trước khi nối.
  try {
    session.realtimeUrl = await locateRoom();
    saveSession();
  } catch {
    scheduleReconnect();
    return;
  }
  connectRealtime();
}

async function locateRoom() {
  const response = await fetch(`${apiOrigin}/api/v1/rooms/${encodeURIComponent(roomId)}/locate`);
  if (!response.ok) throw new Error('Chưa tìm được máy giữ phòng');
  return (await response.json()).realtimeUrl;
}

function connectRealtime() {
  clearInterval(pingTimer);
  setConnection('connecting', 'Đang kết nối…');
  const realtimeUrl = realtimeEndpoint(session.realtimeUrl);
  realtimeUrl.searchParams.set('ticket', session.ticket);
  if (session.resumeToken) realtimeUrl.searchParams.set('resumeToken', session.resumeToken);
  socket = new WebSocket(realtimeUrl);
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
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', () => {
    clearInterval(pingTimer);
    if (!disconnectedAt) disconnectedAt = Date.now();
    setOnline(false);
    scheduleReconnect();
  });
  socket.addEventListener('error', () => setConnection('connecting', 'Lỗi kết nối'));
}

async function joinRoom(displayName) {
  const response = await fetch(`${apiOrigin}/api/v1/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, displayName }),
  });
  if (!response.ok) throw new Error('Không thể cấp vé vào phòng. Hãy kiểm tra API đang chạy.');
  return response.json();
}

// ---- Thao tác người dùng ----
elements.joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = elements.joinForm.querySelector('button');
  elements.formError.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Đang vào rạp…';
  try {
    session = await joinRoom(elements.displayName.value.trim());
    saveSession();
    localStorage.setItem('displayName', session.displayName);
    elements.joinLayer.hidden = true;
    connectRealtime();
    if (boot.active) finishBoot();
  } catch (error) {
    boot.done();
    elements.joinLayer.hidden = false;
    elements.formError.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Vào rạp';
  }
});

elements.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = elements.chatInput.value.trim();
  if (!text) return;
  if (send({ type: 'chat.send', requestId: requestId('chat'), text })) elements.chatInput.value = '';
  elements.chatCount.textContent = '0/160';
  if (renderer?.mode !== '3d' && !participants.get(session?.participantId)?.seatId) notify('Chọn một ghế để lời nhắn hiện trên đầu bạn trong rạp');
});
elements.chatInput.addEventListener('input', () => { elements.chatCount.textContent = `${elements.chatInput.value.length}/160`; });

elements.queueForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const videoId = parseYouTubeId(elements.queueInput.value);
  if (!videoId) {
    notify('Link chưa đúng: dán link YouTube (youtube.com/watch?v=…, youtu.be/…, shorts…)');
    return;
  }
  if (send({ type: 'queue.add', requestId: requestId('queue'), videoId })) {
    elements.queueInput.value = '';
    notify('Đang kiểm tra video…');
  }
});

elements.skipButton.addEventListener('click', () => {
  if (!playback.current) return;
  if (send({ type: 'vote.skip', requestId: requestId('vote'), itemId: playback.current.itemId })) {
    votedItemId = playback.current.itemId;
    renderPlayback();
  }
});

// Trình duyệt chỉ cho phát có tiếng sau một lần chạm của người dùng.
function setMuted(next) {
  muted = next;
  elements.muteToggle.textContent = muted || Number(elements.volume.value) === 0 ? '🔇' : '🔊';
  if (!playerReady) return;
  if (muted) player.mute();
  else {
    player.unMute();
    player.setVolume(Number(elements.volume.value));
    player.playVideo();
  }
  elements.unmute.hidden = !muted || !playback.current;
}
elements.unmute.addEventListener('click', () => setMuted(false));
elements.muteToggle.addEventListener('click', () => setMuted(!muted));
elements.volume.addEventListener('input', () => {
  elements.volumeLabel.textContent = `${elements.volume.value}%`;
  if (muted && Number(elements.volume.value) > 0) setMuted(false);
  else if (playerReady) player.setVolume(Number(elements.volume.value));
  elements.muteToggle.textContent = muted || Number(elements.volume.value) === 0 ? '🔇' : '🔊';
});

elements.cameras.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.camera === 'seat' && !participants.get(session?.participantId)?.seatId) {
    notify('Bạn chưa chọn ghế');
    return;
  }
  if (button.dataset.camera === 'follow' && (renderer?.mode !== '3d' || !session)) {
    notify(session ? 'Máy này đang dùng cảnh 2.5D, không đi lại được' : 'Vào rạp để đi lại');
    return;
  }
  setCamera(button.dataset.camera);
});

// ---- Thanh công cụ, ngăn kéo, cảm xúc ----
let drawerPart = null;
let unread = 0;
const DRAWER_TITLES = { seats: 'Chọn ghế', queue: 'Hàng chờ', chat: 'Trò chuyện', people: 'Người xem' };
let reactedAt = 0;
function openDrawer(part) {
  drawerPart = drawerPart === part ? null : part;
  elements.drawer.hidden = !drawerPart;
  for (const section of elements.drawer.querySelectorAll('[data-part]')) section.hidden = section.dataset.part !== drawerPart;
  for (const button of elements.hudTools.querySelectorAll('[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === drawerPart || (button.dataset.tool === 'react' && !elements.reactionPicker.hidden)));
  }
  if (drawerPart) elements.drawerTitle.textContent = DRAWER_TITLES[drawerPart];
  if (drawerPart === 'seats') renderSeatMap();
  if (drawerPart === 'chat') {
    unread = 0;
    elements.chatBadge.hidden = true;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
  updateInsets();
}
elements.drawerClose.addEventListener('click', () => openDrawer(drawerPart));
elements.hudTools.addEventListener('click', (event) => {
  const tool = event.target.closest('[data-tool]')?.dataset.tool;
  if (!tool) return;
  if (tool === 'react') {
    elements.reactionPicker.hidden = !elements.reactionPicker.hidden;
    event.target.closest('button').setAttribute('aria-pressed', String(!elements.reactionPicker.hidden));
    return;
  }
  if (tool === 'seat') {
    if (!session) elements.joinLayer.hidden = false;
    else openDrawer('seats');
    return;
  }
  if (tool === 'donate') {
    // Mở tab mới để phim đang chiếu không bị dừng.
    window.open('/ung-ho.html', '_blank', 'noopener');
    return;
  }
  if (tool === 'send') {
    if (drawerPart !== 'queue') openDrawer('queue');
    elements.queueInput.focus();
    return;
  }
  openDrawer(tool);
});
elements.reactionPicker.addEventListener('click', (event) => {
  const kind = event.target.closest('[data-reaction]')?.dataset.reaction;
  if (!kind) return;
  if (!session) {
    elements.joinLayer.hidden = false;
    return;
  }
  if (!send({ type: 'reaction.send', requestId: requestId('react'), kind })) {
    notify('Đang kết nối…');
    return;
  }
  reactedAt = Date.now();
  renderer?.react?.(session.participantId, kind);
  // Thả xong một lúc thì đóng bảng để thấy biểu tượng bay lên (bấm liên tiếp thì vẫn mở).
  clearTimeout(pickerTimer);
  pickerTimer = setTimeout(() => {
    elements.reactionPicker.hidden = true;
    elements.hudTools.querySelector('[data-tool="react"]').setAttribute('aria-pressed', 'false');
  }, 2_000);
});
let pickerTimer = null;

// Sơ đồ ghế: màn chiếu ở trên, hàng đầu (S-91…S-100) gần màn nhất, lối đi ở giữa. Chọn ghế trống thì nhân vật đi
// tới ngồi (rạp 3D) hoặc ngồi luôn (cảnh 2.5D).
const SEAT_ROWS = 10;
const SEAT_COLUMNS = 10;
function renderSeatMap() {
  const owners = new Map([...participants.values()].filter((person) => person.seatId).map((person) => [person.seatId, person]));
  const buttons = [];
  for (let row = SEAT_ROWS - 1; row >= 0; row -= 1) {
    for (let column = 0; column < SEAT_COLUMNS; column += 1) {
      if (column === SEAT_COLUMNS / 2) buttons.push(document.createElement('span'));
      const seatId = `S-${row * SEAT_COLUMNS + column + 1}`;
      const owner = owners.get(seatId);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.seat = seatId;
      button.textContent = seatId.slice(2);
      const mine = owner?.id === session?.participantId;
      const classes = [mine ? 'mine' : owner ? 'taken' : ''];
      // Ghế đôi: hai nửa sofa nằm liền nhau trên sơ đồ.
      const partner = partners.get(seatId);
      if (partner) {
        const partnerColumn = (Number(partner.slice(2)) - 1) % SEAT_COLUMNS;
        classes.push('couple', partnerColumn > column ? 'couple-l' : 'couple-r');
      }
      button.className = classes.filter(Boolean).join(' ');
      button.title = `${partner ? 'Ghế đôi · ' : ''}${mine ? `Ghế của bạn (${seatId})` : owner ? `${seatId}: ${owner.displayName}` : `Ghế trống ${seatId}`}`;
      buttons.push(button);
    }
  }
  elements.seatMap.replaceChildren(...buttons);
}
elements.seatMap.addEventListener('click', (event) => {
  const button = event.target.closest('[data-seat]');
  if (!button || button.classList.contains('mine')) return;
  if (button.classList.contains('taken')) {
    notify(button.title);
    return;
  }
  openDrawer('seats');
  if (renderer?.goToSeat?.(button.dataset.seat)) notify(`Đang đi tới ghế ${button.dataset.seat}…`);
  else selectSeat({ id: button.dataset.seat });
});

elements.nearSit.addEventListener('click', () => {
  if (renderer?.sitNearby?.()) elements.nearSit.hidden = true;
});

// Cần điều khiển (máy cảm ứng, rạp 3D): kéo núm, độ xa so với tâm là tốc độ.
const touchDevice = matchMedia('(pointer: coarse)').matches;
function showJoystick() {
  elements.joystick.hidden = !(touchDevice && renderer?.setJoystick && session && participants.has(session.participantId));
}
let joystickPointer = null;
function moveJoystick(event) {
  const box = elements.joystick.getBoundingClientRect();
  const radius = box.width / 2;
  let x = (event.clientX - box.left - radius) / radius;
  let y = (event.clientY - box.top - radius) / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  elements.joystick.firstElementChild.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`;
  renderer?.setJoystick?.(x, y);
}
elements.joystick.addEventListener('pointerdown', (event) => {
  joystickPointer = event.pointerId;
  elements.joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
elements.joystick.addEventListener('pointermove', (event) => {
  if (event.pointerId === joystickPointer) moveJoystick(event);
});
for (const type of ['pointerup', 'pointercancel']) {
  elements.joystick.addEventListener(type, (event) => {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    elements.joystick.firstElementChild.style.transform = '';
    renderer?.setJoystick?.(0, 0);
  });
}

// Xu Vườn Công Đức (bán trái cây, dùng ở phòng game): luôn hiện trên header; đọc lại mỗi phút và khi quay lại tab.
let coins = null;
let questsReady = 0;
async function loadCoins() {
  try {
    const response = await fetch('/api/v1/garden/me', { cache: 'no-store' });
    const me = response.ok ? (await response.json()).me : null;
    coins = me ? me.coins : null;
    questsReady = (me?.quests || []).filter((item) => item.done && !item.claimed).length;
  } catch {}
  elements.coinCount.textContent = coins === null ? '—' : coins.toLocaleString('vi-VN');
  // Chấm đỏ: có nhiệm vụ hằng ngày đã xong mà chưa nhận xu (nhận ở Quầy trong Khu vườn).
  elements.coinChip.classList.toggle('has-quest', Boolean(questsReady));
}
elements.coinChip.addEventListener('click', () => {
  notify(coins === null
    ? 'Đăng nhập ở cổng chùa để có ví xu (bán trái cây ở Khu vườn)'
    : `Bạn có ${coins.toLocaleString('vi-VN')} xu${questsReady ? ` · có ${questsReady} nhiệm vụ chưa nhận xu` : ''} · nhận nhiệm vụ, bán trái cây ở Quầy trong Khu vườn`);
});
loadCoins();
setInterval(() => { if (!document.hidden) loadCoins(); }, 60_000);
// Kim cương: bấm mở các gói nạp (admin đặt) → Stripe; trong bảng có lối vào Shop nhân vật.
const gems = createGemUI({ chip: $('gemChip'), count: $('gemCount'), showToast: notify });
gems.refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCoins(); });

// Góp ý / Báo lỗi: mở tab mới để phim đang chiếu không bị dừng.
$('support').addEventListener('click', () => {
  window.open(`/ho-tro.html?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`, '_blank', 'noopener');
});

// Nút nhanh: chép link phòng, toàn màn hình (iPhone không có Fullscreen API cho khung thường: phóng bằng CSS),
// ẩn/hiện giao diện để xem trọn rạp.
elements.copyLink.addEventListener('click', async () => {
  const link = `${location.origin}/room.html?room=${encodeURIComponent(roomId)}`;
  try {
    await navigator.clipboard.writeText(link);
    notify('Đã chép link phòng, gửi cho bạn bè để cùng xem');
  } catch {
    notify(link);
  }
});
// ---- Xem ngang (zoom): camera phóng vào màn chiếu, mọi thanh ẩn. Điện thoại xoay ngang thì tự vào; nút ⛶ vào
// được ở mọi máy (kèm toàn màn hình và khóa hướng ngang nếu trình duyệt cho, vd Chrome Android).
const zoom = { on: false, auto: false, previousCamera: 'overview' };
function setZoom(on, { auto = false } = {}) {
  if (on === zoom.on) return;
  zoom.on = on;
  zoom.auto = on && auto;
  elements.stage.classList.toggle('zoom-mode', on);
  elements.zoomBar.hidden = !on;
  elements.reactionPicker.hidden = true;
  if (on) {
    if (drawerPart) openDrawer(drawerPart);
    zoom.previousCamera = cameraId;
    renderer?.setJoystick?.(0, 0);
    setCamera(renderer?.mode === '3d' ? 'zoom' : 'screen');
  } else setCamera(zoom.previousCamera === 'zoom' ? 'overview' : zoom.previousCamera);
  syncZoomMute();
  updateInsets();
}
function syncZoomMute() {
  elements.zoomMute.textContent = muted ? '🔇' : '🔊';
}
const phoneLandscape = matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 520px)');
function onOrientation() {
  if (phoneLandscape.matches) {
    elements.rotateHint.hidden = true;
    if (renderer) setZoom(true, { auto: !zoom.on || zoom.auto });
  } else if (zoom.auto) setZoom(false);
  requestAnimationFrame(updateInsets);
}
phoneLandscape.addEventListener('change', onOrientation);
async function enterZoom() {
  setZoom(true);
  try { await elements.stage.requestFullscreen?.(); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
  // iPhone không khóa được hướng màn hình: nhắc xoay ngang.
  if (touchDevice && !phoneLandscape.matches && matchMedia('(orientation: portrait)').matches) {
    elements.rotateHint.hidden = false;
    setTimeout(() => { elements.rotateHint.hidden = true; }, 3_500);
  }
}
async function exitZoom() {
  // Điện thoại đang ngang: giao diện đầy đủ không đủ chỗ (khung YouTube sẽ nhỏ hơn 200 px), nên nhắc xoay dọc.
  if (phoneLandscape.matches) {
    notify('Xoay dọc điện thoại để về giao diện đầy đủ');
    return;
  }
  setZoom(false);
  elements.rotateHint.hidden = true;
  try { screen.orientation?.unlock?.(); } catch {}
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
}
elements.fullscreen.addEventListener('click', () => (zoom.on ? exitZoom() : enterZoom()));
elements.zoomExit.addEventListener('click', exitZoom);
elements.zoomMute.addEventListener('click', () => {
  setMuted(!muted);
  syncZoomMute();
});
elements.zoomReact.addEventListener('click', () => {
  if (!session) return;
  elements.reactionPicker.hidden = !elements.reactionPicker.hidden;
});
function setHud(visible) {
  elements.stage.classList.toggle('hud-off', !visible);
  elements.showHud.hidden = visible;
  if (!visible) elements.reactionPicker.hidden = true;
  updateInsets();
}
elements.hideHud.addEventListener('click', () => setHud(false));
elements.showHud.addEventListener('click', () => setHud(true));
const hudObserver = new ResizeObserver(() => updateInsets());
for (const element of [elements.stage, elements.hudTop, elements.hudBottom, elements.hudTools, elements.drawer]) hudObserver.observe(element);
document.addEventListener('fullscreenchange', () => {
  // Máy tính: Esc thoát toàn màn hình thì thoát luôn xem ngang.
  if (!document.fullscreenElement && zoom.on && !zoom.auto && !touchDevice) setZoom(false);
  requestAnimationFrame(updateInsets);
});

// Đi nhanh về các khu của chùa (map khác): quay lại đúng phòng chùa vừa ở (link lưu khi sang rạp), kèm ?go=<khu>
// để trang chùa tự đưa nhân vật tới khu đó sau khi vào phòng.
function openTravel(next) {
  elements.travelPanel.hidden = !next;
  elements.travelToggle.setAttribute('aria-expanded', String(next));
}
elements.travelToggle.addEventListener('click', () => openTravel(elements.travelPanel.hidden));
elements.travelPanel.addEventListener('click', (event) => {
  const destination = event.target.closest('[data-destination]')?.dataset.destination;
  openTravel(false);
  if (!destination || destination === 'cinema') return;
  if (destination === 'games') {
    location.href = '/game.html';
    return;
  }
  let back = '/chanh-dien.html';
  try { back = sessionStorage.getItem('thien-return') || back; } catch {}
  const url = new URL(back, location.origin);
  if (url.origin !== location.origin) return;
  url.searchParams.set('go', destination);
  location.href = `${url.pathname}${url.search}`;
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.quick-travel')) openTravel(false);
});

// Màn tải: đã có tên (phiên trong tab, hoặc đã nhập ở chùa/rạp) thì vào thẳng rạp; chưa có thì tải xong mới hiện
// khung nhập tên.
const boot = createBootLoader($('boot'));
boot.step('Đang tải…', 15);
async function finishBoot() {
  boot.step('Đang vào rạp…', 55);
  await waitFor(isOnline, 8_000);
  boot.step('Đang dựng rạp 3D…', 80);
  await waitFor(() => renderer, 8_000);
  await boot.done();
}

const rememberedName = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
elements.displayName.value = rememberedName('displayName') || rememberedName('phapdanh');
setOnline(false);
setupScene().catch(() => notify('Không tải được khán phòng'));
setupPlayer().catch(() => notify('Không tải được trình phát YouTube'));
setInterval(syncPlayer, 1_000);
setInterval(positionScreen, 500);

try {
  const restored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  if (restored?.roomId === roomId && typeof restored.ticket === 'string' && typeof restored.displayName === 'string') {
    session = restored;
    elements.joinLayer.hidden = true;
    connectRealtime();
    finishBoot();
  }
} catch {
  sessionStorage.removeItem(SESSION_KEY);
}

// Đã nhập tên một lần (ở chùa hoặc ở rạp): vào rạp luôn, không hiện khung hỏi tên (lỗi thì mới hiện lại).
const params = new URLSearchParams(location.search);
if (params.has('from')) {
  params.delete('from');
  history.replaceState(null, '', `${location.pathname}?${params}`);
}
if (!session && elements.displayName.value.trim()) {
  elements.joinLayer.hidden = true;
  boot.step('Đang vào rạp…', 40);
  elements.joinForm.requestSubmit();
} else if (!session) boot.done().then(() => { elements.joinLayer.hidden = false; });
