// Một tiến trình giữ một nhóm người giả. Mỗi người nói đúng protocol như trang thật: vé vào phòng → WebSocket →
// hello → move (đứng ở sân); sau đó lúc đi lúc đứng, chat, quỳ/đứng, ping. Không mở YouTube, TTS hay dịch vụ ngoài.
// Đo: thời gian vào phòng, độ trễ chat (từ lúc người gửi bấm tới lúc người khác nhận), ping RTT, số tin và byte nhận.
import WebSocket from 'ws';
import { DEFAULT_LOCAL_SECRET, createJoinTicket } from '@chanh-dien/session-token';

const PROTOCOL_VERSION = 2;
const url = process.env.LOADTEST_URL;
const roomId = process.env.LOADTEST_ROOM;
const workerId = process.env.LOADTEST_WORKER;
// Hành vi (theo mức ước lượng cho phòng Thiền; đổi bằng biến môi trường khi cần):
const WALKING_SHARE = Number(process.env.LOADTEST_WALKING ?? 0.3); // tỉ lệ người đang đi tại một thời điểm
const HALL_SHARE = Number(process.env.LOADTEST_HALL ?? 0.2); // tỉ lệ người ở trong chánh điện (còn lại ngoài sân)
const AREAS = { hall: { x: [-7.5, 7.5], z: [1.5, 15] }, yard: { x: [-34, 34], z: [18, 96] } };
const pick = ([min, max]) => min + Math.random() * (max - min);
const CHAT_EVERY_MS = Number(process.env.LOADTEST_CHAT_MS ?? 30_000);
const EMOTE_EVERY_MS = Number(process.env.LOADTEST_EMOTE_MS ?? 60_000);
const PING_EVERY_MS = 5_000;
const MOVE_EVERY_MS = 200; // 5 tin/giây khi đi, giống client thật

// Histogram 1 ms, tối đa 30 giây: rẻ, cộng được giữa các tiến trình.
const histogram = () => new Uint32Array(30_001);
const record = (bins, ms) => { bins[Math.max(0, Math.min(30_000, Math.round(ms)))] += 1; };
let stats = fresh();
function fresh() {
  return { chat: histogram(), ping: histogram(), join: histogram(), messages: 0, bytes: 0, chatSent: 0, chatRejected: 0, walkersFull: 0, errors: {}, closed: 0, failedJoins: 0 };
}

const people = [];
let serial = 0;

function addPerson() {
  serial += 1;
  const participantId = `lt-${workerId}-${serial}`;
  const displayName = `Tải ${workerId}.${serial}`;
  const ticket = createJoinTicket({ participantId, roomId, displayName }, DEFAULT_LOCAL_SECRET);
  const area = Math.random() < HALL_SHARE ? AREAS.hall : AREAS.yard;
  const person = { participantId, socket: null, joined: false, walking: false, timers: [], area, x: pick(area.x), z: pick(area.z), ry: 0, kneel: false };
  const startedAt = Date.now();
  const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`, { perMessageDeflate: false });
  person.socket = socket;
  const send = (message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message })); };
  socket.on('open', () => send({ type: 'hello', roomId, displayName }));
  socket.on('message', (data) => {
    stats.messages += 1;
    stats.bytes += data.length;
    // Chỉ parse tin cần đo; các tin khác (room.state, room.moves…) chỉ đếm để client giả không thành nút cổ chai.
    const head = data.toString('latin1', 0, 60);
    if (head.includes('"chat.message"')) {
      const text = JSON.parse(data).text;
      const match = /^lt (\d+)$/.exec(text);
      if (match) record(stats.chat, Date.now() - Number(match[1]));
    } else if (head.includes('"pong"')) {
      record(stats.ping, Date.now() - JSON.parse(data).sentAt);
    } else if (head.includes('"welcome"')) {
      person.joined = true;
      record(stats.join, Date.now() - startedAt);
      send({ type: 'move', x: person.x, z: person.z, ry: 0, moving: false });
      start(person, send);
    } else if (head.includes('"error"')) {
      const code = /"code":"([A-Z_]+)"/.exec(data.toString())?.[1] || 'UNKNOWN';
      if (code === 'WALKERS_FULL') stats.walkersFull += 1;
      else if (code === 'ROOM_BUSY' || code === 'RATE_LIMITED') stats.chatRejected += 1;
      else stats.errors[code] = (stats.errors[code] || 0) + 1;
    }
  });
  socket.on('close', () => {
    if (!person.joined) stats.failedJoins += 1;
    else if (!person.leaving) stats.closed += 1;
    for (const timer of person.timers) clearInterval(timer);
  });
  socket.on('error', () => {});
  people.push(person);
}

// Lệch pha ngẫu nhiên để tin không dồn cùng một nhịp.
function every(person, ms, fn) {
  const delay = Math.random() * ms;
  const first = setTimeout(() => {
    fn();
    person.timers.push(setInterval(fn, ms));
  }, delay);
  person.timers.push(first);
}

function start(person, send) {
  every(person, PING_EVERY_MS, () => send({ type: 'ping', sentAt: Date.now() }));
  every(person, CHAT_EVERY_MS, () => {
    stats.chatSent += 1;
    send({ type: 'chat.send', requestId: `c-${person.participantId}-${Date.now()}`, text: `lt ${Date.now()}` });
  });
  every(person, EMOTE_EVERY_MS, () => {
    person.kneel = !person.kneel;
    send({ type: 'emote', requestId: `e-${person.participantId}-${Date.now()}`, kind: person.kneel ? 'kneel' : 'stand' });
  });
  // Mỗi 4 giây đổi ý: đi hay đứng, theo tỉ lệ WALKING_SHARE. Khi đi: bước 1 m mỗi 0,2 giây (5 m/s < maxSpeed 7),
  // quay đầu khi chạm mép khu của mình (chánh điện hoặc sân).
  every(person, 4_000, () => {
    const was = person.walking;
    person.walking = Math.random() < WALKING_SHARE;
    if (person.walking) person.ry = Math.random() * Math.PI * 2 - Math.PI;
    if (was && !person.walking) send({ type: 'move', x: person.x, z: person.z, ry: person.ry, moving: false });
  });
  every(person, MOVE_EVERY_MS, () => {
    if (!person.walking) return;
    const { x: [minX, maxX], z: [minZ, maxZ] } = person.area;
    person.x = Math.max(minX, Math.min(maxX, person.x + Math.sin(person.ry)));
    person.z = Math.max(minZ, Math.min(maxZ, person.z + Math.cos(person.ry)));
    if (person.x <= minX || person.x >= maxX || person.z <= minZ || person.z >= maxZ) person.ry += Math.PI;
    send({ type: 'move', x: Math.round(person.x * 100) / 100, z: Math.round(person.z * 100) / 100, ry: Math.round(Math.atan2(Math.sin(person.ry), Math.cos(person.ry)) * 100) / 100, moving: true });
  });
}

process.on('message', (message) => {
  if (message.type === 'add') {
    // Vào dần trong `overMs` để không thành bão kết nối (trừ khi muốn đo bão).
    const gap = message.count ? message.overMs / message.count : 0;
    for (let index = 0; index < message.count; index += 1) setTimeout(addPerson, index * gap);
  } else if (message.type === 'collect') {
    const open = people.filter((person) => person.socket.readyState === WebSocket.OPEN && person.joined).length;
    process.send({ type: 'stats', value: { ...stats, chat: [...stats.chat], ping: [...stats.ping], join: [...stats.join], open } });
    stats = fresh();
  } else if (message.type === 'stop') {
    for (const person of people) {
      person.leaving = true;
      person.socket.terminate();
    }
    setTimeout(() => process.exit(0), 200);
  }
});
process.send({ type: 'ready' });
