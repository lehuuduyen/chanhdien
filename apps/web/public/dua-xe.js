// Trang Đua xe (/dua-xe.html, phòng duaxe-1). Xe của mình chạy vật lý dùng chung (/shared/race.mjs) ngay trên máy,
// 20 lần/giây gửi race.car; máy realtime làm trọng tài (đếm vòng, chặn gói vô lý), lái xe bot và phát race.cars. Xe
// người khác được đoán tới đúng lúc này (từ gói cuối theo tốc độ + tốc độ quay, tối đa 0,35 giây) rồi làm mượt — vẽ trễ để
// nội suy thì ở 200 km/h xe bám đuôi trông như đè lên nhau và va chạm lệch vài mét. Va xe: máy mình chỉ đẩy xe mình, máy
// người kia tự đẩy xe họ. Tên người chơi chỉ ra màn hình qua textContent / canvas.
import { createRaceRenderer } from '/engine/race3d.mjs';
import { currentCinemaHref } from '/region-cinema.js';
import { createRoomSession } from '/realtime-session.js';
import {
  buildTrack, CAR_COLORS, collideCars, createCar, createDriver, createLapTracker, driveBot, placeCar, rescuePoint, roundCar, STEP, stepCar,
  wrapAngle,
} from '/shared/race.mjs';

const ROOM_ID = 'duaxe-1';
const SEND_MS = 50;
const PREDICT_MAX_S = 0.35;
const COLOR_NAMES = ['Đỏ', 'Xanh dương', 'Vàng', 'Xanh lá', 'Cam', 'Tím', 'Ngọc', 'Hồng'];
const ERROR_TEXT = {
  RACE_RUNNING: 'Đang đua, chạy thử sau khi cuộc đua xong nhé',
  TRACK_FULL: 'Đường đua đang đủ xe, chờ một chút',
  RATE_LIMITED: 'Bạn bấm quá nhanh',
};

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['scene', 'roomChip', 'people', 'camera', 'mute', 'hud', 'hudPos', 'hudLap', 'hudTime', 'hudBest', 'statusPill', 'tower',
  'hudPosBox', 'minimap', 'lights', 'banner', 'toast', 'feed', 'speed', 'speedValue', 'tools', 'rescue', 'stopDrive', 'controls', 'steer', 'wheel', 'gas', 'brake',
  'panel', 'status', 'join', 'practice', 'colors', 'autoGas', 'boardOpen', 'helpOpen', 'message', 'board', 'boardTabs', 'boardList', 'boardMine',
  'boardClose', 'help', 'helpClose', 'results', 'resultsBody', 'resultsNote', 'resultsClose', 'again', 'leaveRace', 'travelToggle', 'travelPanel']
  .map((id) => [id, $(id)]));
const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
const store = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} },
};

// Thời gian vòng kiểu 1:23,456.
function lapText(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  return `${minutes}:${String(seconds).padStart(2, '0')},${String(Math.floor(ms % 1_000)).padStart(3, '0')}`;
}

// ---- Đường đua ----
const trackData = await fetch('/scenes/race-circuit/track.json').then((response) => response.json());
const track = buildTrack(trackData);
const touch = matchMedia('(pointer: coarse)').matches;
const view = createRaceRenderer({ canvas: el.scene, track, colors: CAR_COLORS, lowPower: touch });

// ---- Trạng thái ----
let state = null;
const driversById = new Map();
let racerCount = 0;
let me = { mode: 'none', color: Number(store.get('race-color', -1)) };
let people = 0;
let myId = null;
let driving = false;
let own = null;
const previousOwnPose = { x: 0, z: 0, h: 0, v: 0 };
const ownRenderPose = { self: true };
function rememberOwnPose() {
  previousOwnPose.x = own.x;
  previousOwnPose.z = own.z;
  previousOwnPose.h = own.h;
  previousOwnPose.v = own.v;
}
let tracker = null;
let acc = 0;
let lastSend = 0;
let rescueNext = false;
let watchId = null;
let lastLights = -1;
const remote = new Map();
const names = new Map();
let muted = store.get('race-mute', '0') === '1';
let autoGas = store.get('race-autogas', touch ? '1' : '0') === '1';

// ---- Kết nối ----
const session = createRoomSession({
  roomId: ROOM_ID,
  onMessage,
  onStatus: (status) => {
    el.roomChip.classList.toggle('online', status === 'online');
    if (status !== 'online' && !state) el.status.textContent = 'Đang kết nối…';
  },
});
const send = (type, body = {}) => session.send({ type, ...(type === 'race.car' ? {} : { requestId: `${type.replace('.', '-')}-${crypto.randomUUID()}` }), ...body });
const rememberedName = () => (store.get('displayName', '') || store.get('phapdanh', '') || '').trim().slice(0, 40) || 'Khách';
if (!session.restore()) {
  session.join(rememberedName()).catch((error) => {
    el.status.textContent = error.serverMessage || 'Chưa vào được phòng đua, thử tải lại trang.';
  });
}

let welcomed = false;
function onMessage(message) {
  if (message.type === 'welcome') {
    myId = session.participantId;
    // Nối lại sau khi rớt mạng: máy chủ đã cất xe (bỏ cuộc), máy mình thôi lái.
    if (welcomed && driving) {
      stopDriving();
      say('Mất kết nối giữa chừng, xe đã rời đường. Bấm Vào đua / Chạy thử để chạy tiếp.');
    }
    welcomed = true;
  } else if (message.type === 'room.state') {
    people = message.participants.filter((person) => person.connected !== false).length;
    for (const person of message.participants) names.set(person.id, person.displayName);
    el.people.textContent = `👥 ${people}`;
  } else if (message.type === 'race.state') onState(message);
  else if (message.type === 'race.cars') onCars(message);
  else if (message.type === 'race.lap') onLap(message);
  else if (message.type === 'race.me') onMe(message);
  else if (message.type === 'protocol.error') {
    if (['BANNED', 'SESSION_REPLACED'].includes(message.code)) {
      stopDriving();
      say(message.code === 'BANNED' ? message.message : 'Tài khoản vừa vào phòng đua ở trình duyệt / máy khác.');
      return;
    }
    say(ERROR_TEXT[message.code] || message.message);
  }
}

function onState(message) {
  const previous = state;
  state = message;
  driversById.clear();
  racerCount = 0;
  for (const driver of message.drivers) {
    driversById.set(driver.id, driver);
    names.set(driver.id, driver.displayName);
    if (driver.mode === 'race') racerCount += 1;
  }
  // Đang đứng trên lưới: vòng 1 tính từ lúc đèn tắt (race.me có thể tới trước race.state mang startAt).
  if (driving && tracker && me.mode === 'race' && message.startAt && !tracker.state.started) tracker.startRace(message.startAt);
  if (message.phase === 'result' && message.result && previous?.phase !== 'result') showResults(message);
  if (message.phase !== 'result') el.results.hidden = true;
  if (message.phase === 'racing' && previous?.phase === 'grid') banner('XUẤT PHÁT!', '', 1_400);
  // Vừa xếp lưới: báo ô xuất phát của mình (theo vòng nhanh nhất gần đây hoặc bốc thăm).
  const mine = message.phase === 'grid' && previous?.phase !== 'grid' ? message.drivers.find((item) => item.id === myId && item.mode === 'race') : null;
  if (mine && mine.slot !== undefined) {
    banner(`Xuất phát ô ${mine.slot + 1}`, mine.quali ? `Theo vòng nhanh nhất ${lapText(mine.quali)}` : 'Bốc thăm chỗ · chạy thử lấy giờ để xếp lên đầu', 2_600);
  }
  renderPanel();
  renderTower();
}

function onCars(message) {
  const seen = new Set();
  for (const car of message.cars) {
    seen.add(car.id);
    if (car.id === myId && driving) continue;
    let entry = remote.get(car.id);
    if (!entry) {
      entry = { samples: [], lastSeen: 0, prediction: {} };
      remote.set(car.id, entry);
    }
    const last = entry.samples.at(-1);
    if (!last || car.t > last.t) {
      entry.samples.push({ t: car.t, x: car.x, z: car.z, h: car.h, speed: car.speed });
      if (entry.samples.length > 12) entry.samples.shift();
    }
    entry.lastSeen = message.t;
  }
  for (const [id, entry] of remote) {
    if (!seen.has(id) && message.t - entry.lastSeen > 1_000) {
      remote.delete(id);
      view.removeCar(id);
    }
  }
}

function onLap(message) {
  const name = names.get(message.id) || '';
  if (message.id === myId) {
    const text = `Vòng ${message.lap} · ${lapText(message.ms)}${message.invalid ? ' (không tính)' : message.record ? ' · nhanh nhất cuộc đua!' : message.best ? ' · kỷ lục của bạn' : ''}`;
    toast(text, message.invalid ? '' : message.record ? 'record' : message.best ? 'best' : '');
  } else if (message.record) feed(`🟣 ${name} lập vòng nhanh nhất ${lapText(message.ms)}`);
}

function onMe(message) {
  const wasDriving = driving;
  me = message;
  if (message.spawn) startDriving(message.spawn);
  else if (message.mode === 'none' && wasDriving) stopDriving();
  if (message.reset && own) {
    Object.assign(own, { x: message.reset.x, z: message.reset.z, h: message.reset.h, v: 0, vl: 0 });
    placeCar(own, track);
    rememberOwnPose();
    acc = 0;
    tracker?.taint();
  }
  renderColors();
  renderPanel();
}

// ---- Lái xe ----
function startDriving(spawn) {
  own = placeCar(createCar(spawn), track);
  rememberOwnPose();
  tracker = createLapTracker(track);
  if (me.mode === 'race' && state?.startAt) tracker.startRace(state.startAt);
  tracker.update(own.x, own.z, session.serverNow());
  driving = true;
  acc = 0;
  watchId = null;
  remote.delete(myId);
  view.removeCar(myId);
  view.setFocus(myId);
  audio.start();
  renderPanel();
}

function stopDriving() {
  driving = false;
  own = null;
  tracker = null;
  input.steer = 0;
  view.removeCar(myId);
  view.setFocus(null);
  renderPanel();
}

const input = { steer: 0, gas: false, brake: false, keys: new Set() };
// Tự lái (chỉ khi gỡ lỗi / quay video: window.chanhDienRace.autopilot = true).
let autopilot = null;
function controls(others = []) {
  if (autopilot && own) return driveBot(autopilot, own, track, others);
  const keys = input.keys;
  let steer = input.steer;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) steer = -1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) steer = 1;
  const brake = input.brake || keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space');
  const assisted = autoGas && touch;
  const gas = !brake && (input.gas || keys.has('ArrowUp') || keys.has('KeyW') || assisted);
  // Ga tự động: nhả ga / phanh nhẹ trước cua theo bảng tốc độ của đường đua (người chơi điện thoại chỉ cần lái).
  if (assisted && gas && own) {
    const ahead = own.s + Math.abs(own.v) * 0.35;
    const index = Math.floor((((ahead % track.length) + track.length) % track.length) / track.step) % track.samples;
    const wanted = track.lineSpeed[index] * 0.97;
    if (own.v > wanted + 1) return { steer, throttle: 0, brake: Math.min(0.8, (own.v - wanted) / 6) };
  }
  return { steer, throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
}

// Xe mình đang bị khóa (trên lưới chờ đèn tắt).
const locked = () => me.mode === 'race' && state && (state.phase === 'grid' || session.serverNow() < (state.startAt || 0));

// Vị trí xe người khác lúc này: từ gói cuối đi tiếp theo tốc độ và tốc độ quay (đo từ hai gói cuối), tối đa
// PREDICT_MAX_S; hình hiển thị đuổi theo vị trí đoán (mượt khi gói mới sửa lại), lệch quá 8 m thì nhảy thẳng tới.
function predict(entry, time) {
  const samples = entry.samples;
  const last = samples.at(-1);
  if (!last) return null;
  const previous = samples.at(-2);
  const turn = previous && last.t > previous.t ? wrapAngle(last.h - previous.h) / ((last.t - previous.t) / 1_000) : 0;
  const ahead = Math.max(0, Math.min(PREDICT_MAX_S, (time - last.t) / 1_000));
  const yaw = Math.max(-1.5, Math.min(1.5, turn));
  const mid = last.h + (yaw * ahead) / 2;
  const target = entry.prediction;
  target.x = last.x + Math.sin(mid) * last.speed * ahead;
  target.z = last.z + Math.cos(mid) * last.speed * ahead;
  target.h = wrapAngle(last.h + yaw * ahead);
  target.speed = last.speed;
  return target;
}
function remoteAt(entry, time, dt) {
  const target = predict(entry, time);
  if (!target) return null;
  const shown = entry.shown;
  if (!shown || Math.hypot(target.x - shown.x, target.z - shown.z) > 8) {
    entry.shown = Object.assign(shown ?? {}, target);
    return entry.shown;
  }
  const follow = 1 - Math.exp(-dt * 14);
  shown.x += (target.x - shown.x) * follow;
  shown.z += (target.z - shown.z) * follow;
  shown.h = wrapAngle(shown.h + wrapAngle(target.h - shown.h) * follow);
  shown.speed = target.speed;
  return shown;
}

let lastFrame = performance.now();
let nextHud = 0;
let nextMinimap = 0;
let watchedId = null;
const others = [];
let measuredMs = 0;
let slowMs = 0;
function frame(now) {
  const frameMs = now - lastFrame;
  const dt = Math.min(0.1, frameMs / 1_000);
  lastFrame = now;
  if (document.hidden || frameMs > 250) {
    measuredMs = 0;
    slowMs = 0;
  } else {
    measuredMs += frameMs;
    if (frameMs > (touch ? 34 : 25)) slowMs += frameMs;
    if (measuredMs >= 3_000) {
      if (slowMs / measuredMs > 0.4) view.lowerResolution();
      measuredMs = 0;
      slowMs = 0;
    }
  }
  const serverNow = session.serverNow();
  others.length = 0;
  for (const [id, entry] of remote) {
    if (id === myId && driving) continue;
    const at = remoteAt(entry, serverNow, dt);
    if (!at) continue;
    at.color = driversById.get(id)?.color ?? 0;
    at.name = names.get(id) || '';
    view.setCar(id, at);
    if (driving) {
      entry.collider ??= { vl: 0, impact: 0 };
      const collider = entry.collider;
      collider.x = at.x;
      collider.z = at.z;
      collider.h = at.h;
      collider.v = at.speed;
      others.push(collider);
    }
  }
  if (driving && own) {
    const command = controls(others);
    if (!locked()) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        rememberOwnPose();
        stepCar(own, command, STEP, track);
        for (const other of others) {
          const hit = collideCars(own, other);
          if (hit > 4) audio.bump(hit);
        }
        acc -= STEP;
        steps += 1;
      }
      for (const event of tracker.update(own.x, own.z, serverNow)) {
        if (event.type === 'missed') toast('Vòng này bị cắt đường, không tính', '');
      }
      if (rescueNext || now - lastSend >= SEND_MS) {
        lastSend = now;
        const out = roundCar(own);
        send('race.car', { x: out.x, z: out.z, h: out.h, speed: out.speed, ...(rescueNext ? { r: true } : {}) });
        rescueNext = false;
      }
    } else {
      rememberOwnPose();
      acc = 0;
    }
    const mine = driversById.get(myId);
    // Xe và camera cùng dùng vị trí nội suy giữa hai bước mô phỏng.
    const blend = Math.min(1, acc / STEP);
    ownRenderPose.x = previousOwnPose.x + (own.x - previousOwnPose.x) * blend;
    ownRenderPose.z = previousOwnPose.z + (own.z - previousOwnPose.z) * blend;
    ownRenderPose.h = wrapAngle(previousOwnPose.h + wrapAngle(own.h - previousOwnPose.h) * blend);
    ownRenderPose.speed = previousOwnPose.v + (own.v - previousOwnPose.v) * blend;
    ownRenderPose.color = mine?.color ?? me.color ?? 0;
    view.setCar(myId, ownRenderPose);
    audio.engine(Math.abs(own.v), command.throttle);
    if (own.impact > 0.6) audio.bump(own.impact * 10);
  } else {
    audio.engine(0, 0);
    // Xem: theo xe được chọn, đang đua thì xe dẫn đầu, không thì một xe đang chạy.
    watchedId = view.hasCar(watchId) ? watchId : null;
    if (!watchedId) {
      let best = Infinity;
      for (const driver of driversById.values()) {
        const place = driver.pos || 99;
        if (place < best && view.hasCar(driver.id)) {
          best = place;
          watchedId = driver.id;
        }
      }
    }
    view.setFocus(watchedId);
  }
  updateStartLights(serverNow);
  if (now >= nextHud) {
    nextHud = now + 100;
    renderHud(serverNow);
  }
  if (now >= nextMinimap) {
    nextMinimap = now + 50;
    drawMinimap();
  }
  view.render(dt);
  requestAnimationFrame(frame);
}

// ---- Giao diện ----
function say(text) {
  el.message.textContent = text || '';
}
let toastTimer = null;
function toast(text, tone) {
  el.toast.textContent = text;
  el.toast.className = `toast ${tone || ''}`;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2_600);
}
function feed(text) {
  const item = node('li', '', text);
  el.feed.prepend(item);
  while (el.feed.children.length > 3) el.feed.lastChild.remove();
  setTimeout(() => item.remove(), 6_000);
}
let bannerTimer = null;
function banner(title, sub, ms) {
  el.banner.replaceChildren(document.createTextNode(title), ...(sub ? [node('small', '', sub)] : []));
  el.banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.banner.hidden = true; }, ms);
}

function countdown(at) {
  return Math.max(0, Math.ceil((at - session.serverNow()) / 1_000));
}

function renderPanel() {
  const phase = state?.phase || 'idle';
  const racing = phase === 'grid' || phase === 'racing';
  const mode = me.mode;
  el.panel.hidden = driving;
  el.controls.hidden = !driving;
  el.tools.hidden = !driving;
  el.speed.hidden = !driving;
  el.gas.hidden = !(touch && !autoGas);
  el.hud.hidden = !driving && !racing;
  el.tower.hidden = !racing;
  el.join.disabled = !session.online && !state;
  el.join.textContent = mode === 'queued' ? '⏳ Đang chờ đua · Huỷ' : mode === 'race' ? '🏁 Đang đua' : '🏁 Vào đua';
  el.join.className = mode === 'queued' ? 'queued' : 'primary';
  el.join.disabled = mode === 'race';
  el.practice.disabled = racing;
  el.autoGas.checked = autoGas;
  el.mute.textContent = muted ? '🔇' : '🔊';
  if (!state) return;
  const queued = state.queued;
  const lines = {
    idle: queued ? `${queued} người đang chờ đua` : 'Chưa có cuộc đua. Bấm Vào đua để mở cuộc đua mới (xe khác sẽ vào cùng).',
    lobby: `Cuộc đua mới bắt đầu sau ${countdown(state.endAt)} giây · ${queued} người chờ. Chạy thử trong lúc chờ: lưới xếp theo vòng nhanh nhất.`,
    grid: 'Đang xếp lưới, đèn sắp tắt…',
    racing: `Đang đua ${state.laps} vòng · ${state.drivers.filter((item) => item.mode === 'race').length} xe`,
    result: `Xem kết quả · cuộc đua sau bắt đầu trong ${countdown(state.endAt)} giây`,
  };
  el.status.textContent = lines[phase];
  // Viên trạng thái khi đang chạy thử: còn bao lâu tới lượt đua.
  const pill = driving && me.mode !== 'race' ? (phase === 'lobby' && mode === 'queued' ? `🏁 Xếp lưới sau ${countdown(state.endAt)} giây` : '🚗 Chạy thử · lấy giờ xếp lưới') : '';
  el.statusPill.textContent = pill;
  el.statusPill.hidden = !pill;
}

function renderTower() {
  if (!state) return;
  const list = [...state.drivers].filter((item) => item.mode === 'race').sort((a, b) => (a.pos || 99) - (b.pos || 99));
  el.tower.replaceChildren(...list.map((item) => {
    const row = node('li', `${item.id === myId ? 'me' : ''} ${item.id === watchId ? 'watch' : ''}`.trim());
    const color = node('span', 'c');
    color.style.background = CAR_COLORS[item.color]?.hex || '#888';
    // Trên lưới: giờ phân hạng (giây), chưa có thì "–"; đang đua: vòng hiện tại.
    const lap = state.phase === 'grid' ? (item.quali ? (item.quali / 1_000).toFixed(1).replace('.', ',') : '–')
      : item.done ? '🏁' : item.dnf ? 'Bỏ' : `V${Math.min(state.laps, (item.lap || 0) + 1)}`;
    row.append(node('span', 'p', String(item.pos || '')), color, node('span', 'n', item.displayName), node('span', 'l', lap));
    row.addEventListener('click', () => {
      if (driving) return;
      watchId = item.id;
      renderTower();
    });
    return row;
  }));
}

function renderHud(serverNow) {
  if (!state) return;
  const mine = driversById.get(myId);
  const watched = driving ? mine : driversById.get(watchedId);
  const racer = watched?.mode === 'race';
  el.hudPosBox.hidden = !racer;
  el.hudPos.textContent = racer && watched.pos ? `P${watched.pos}/${racerCount}` : '–';
  el.hudLap.textContent = racer ? `${Math.min(state.laps, (watched.lap || 0) + 1)}/${state.laps}` : watched ? String((watched.lap || 0) + 1) : '–';
  if (driving && tracker) {
    // Chạy thử: giờ vòng tính từ lần qua vạch đầu tiên.
    const lapStart = tracker.state.started ? tracker.state.lapStart : null;
    el.hudTime.textContent = lapStart ? lapText(Math.max(0, serverNow - lapStart)) : 'Qua vạch để tính giờ';
    el.hudTime.classList.toggle('wait', !lapStart);
    el.hudBest.textContent = lapText(mine?.best ?? tracker.state.best ?? NaN);
    el.speedValue.textContent = String(Math.round(Math.abs(own?.v || 0) * 3.6));
  } else {
    el.hudTime.textContent = watched?.last ? lapText(watched.last) : '–';
    el.hudTime.classList.remove('wait');
    el.hudBest.textContent = lapText(watched?.best ?? NaN);
  }
  if (Math.floor(serverNow / 1_000) !== renderHud.second) {
    renderHud.second = Math.floor(serverNow / 1_000);
    renderPanel();
  }
}

function updateStartLights(serverNow) {
  if (!state) return;
  const phase = state.phase;
  // Đèn xuất phát bám từng khung hình, độc lập với nhịp cập nhật HUD.
  let lit = 0;
  if ((phase === 'grid' || phase === 'racing') && state.lightsAt && serverNow < state.startAt) {
    lit = serverNow < state.lightsAt ? 0 : Math.min(5, 1 + Math.floor((serverNow - state.lightsAt) / 1_000));
  }
  const showLights = (phase === 'grid' || phase === 'racing') && serverNow < (state.startAt || 0) && serverNow >= (state.lightsAt || 0) - 2_000;
  if (el.lights.hidden === showLights) el.lights.hidden = !showLights;
  if (lit !== lastLights) {
    [...el.lights.children].forEach((light, index) => light.classList.toggle('on', index < lit));
    view.setLights(lit);
    if (lit > 0 && lit > lastLights) audio.beep(lit === 5 ? 520 : 440, 0.12);
    if (lastLights === 5 && lit === 0) audio.beep(880, 0.35);
    lastLights = lit;
  }
}

function drawMinimap() {
  const canvas = el.minimap;
  const output = canvas.getContext('2d');
  if (!drawMinimap.box) {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (let index = 0; index < track.samples; index += 1) {
      minX = Math.min(minX, track.x[index]); maxX = Math.max(maxX, track.x[index]);
      minZ = Math.min(minZ, track.z[index]); maxZ = Math.max(maxZ, track.z[index]);
    }
    const size = Math.max(maxX - minX, maxZ - minZ);
    drawMinimap.box = { minX, minZ, scale: (canvas.width - 28) / size, padX: (canvas.width - (maxX - minX) * ((canvas.width - 28) / size)) / 2, padZ: (canvas.height - (maxZ - minZ) * ((canvas.width - 28) / size)) / 2 };
  }
  const { minX, minZ, scale, padX, padZ } = drawMinimap.box;
  const px = (x) => padX + (x - minX) * scale;
  const pz = (z) => padZ + (z - minZ) * scale;
  if (!drawMinimap.background) {
    const background = document.createElement('canvas');
    background.width = canvas.width;
    background.height = canvas.height;
    const ctx = background.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(px(track.x[0]), pz(track.z[0]));
    for (let index = 2; index < track.samples; index += 2) {
      ctx.lineTo(px(track.x[index]), pz(track.z[index]));
    }
    ctx.closePath();
    ctx.stroke();
    const start = track.pointAt(0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px(start.x) - 2, pz(start.z) - 6, 4, 12);
    drawMinimap.background = background;
  }
  const ctx = output;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(drawMinimap.background, 0, 0);
  const dot = (x, z, color, self) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(x), pz(z), self ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    if (self) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };
  for (const [id, entry] of remote) {
    if (id === myId && driving) continue;
    const at = entry.shown;
    const driver = driversById.get(id);
    if (at) dot(at.x, at.z, CAR_COLORS[driver?.color ?? 0].hex, false);
  }
  if (driving && own) dot(own.x, own.z, CAR_COLORS[me.color ?? 0]?.hex || '#fff', true);
}

function renderColors() {
  const chosen = Number(store.get('race-color', me.color ?? -1));
  for (const button of el.colors.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.color) === chosen));
}
CAR_COLORS.forEach((color, index) => {
  const button = node('button');
  button.type = 'button';
  button.dataset.color = String(index);
  button.style.background = color.hex;
  button.setAttribute('aria-label', `Xe màu ${COLOR_NAMES[index]}`);
  button.addEventListener('click', () => {
    store.set('race-color', index);
    renderColors();
  });
  el.colors.append(button);
});
renderColors();
const chosenColor = () => {
  const value = Number(store.get('race-color', -1));
  return Number.isInteger(value) && value >= 0 && value < CAR_COLORS.length ? { color: value } : {};
};

function showResults(message) {
  const rows = message.result.map((item) => {
    const row = node('tr', item.id === myId ? 'me' : '');
    const dot = node('span', 'dot');
    dot.style.background = CAR_COLORS[item.color]?.hex || '#888';
    const name = node('td');
    name.append(dot, document.createTextNode(item.displayName));
    row.append(node('td', '', item.pos === 1 ? '🥇' : item.pos === 2 ? '🥈' : item.pos === 3 ? '🥉' : String(item.pos)), name,
      node('td', '', item.dnf ? 'Bỏ cuộc' : item.done ? lapText(item.total) : `${item.lap} vòng`),
      node('td', '', item.best ? `⏱ ${lapText(item.best)}` : ''));
    return row;
  });
  el.resultsBody.replaceChildren(...rows);
  const mine = message.result.find((item) => item.id === myId);
  el.resultsNote.textContent = mine ? `Bạn về thứ ${mine.pos}/${message.result.length}. Cuộc đua sau tự bắt đầu, bấm "Thôi, xem thôi" nếu muốn nghỉ.` : 'Cuộc đua sau sắp bắt đầu.';
  el.again.hidden = !mine;
  el.leaveRace.hidden = !mine;
  el.results.hidden = false;
  if (mine?.pos === 1) audio.beep(660, 0.4);
}

// ---- Bảng vàng ----
let boardData = null;
let boardTab = 'today';
async function loadBoard() {
  el.boardList.replaceChildren(node('li', 'empty', 'Đang tải…'));
  try {
    const response = await fetch('/api/v1/race', { cache: 'no-store' });
    boardData = response.ok ? await response.json() : null;
  } catch { boardData = null; }
  renderBoard();
}
function renderBoard() {
  for (const button of el.boardTabs.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.tab === boardTab));
  if (!boardData) {
    el.boardList.replaceChildren(node('li', 'empty', 'Chưa tải được Bảng vàng, thử lại sau.'));
    el.boardMine.textContent = '';
    return;
  }
  const list = boardData[boardTab] || [];
  el.boardList.replaceChildren(...(list.length ? list.map((item, index) => {
    const row = node('li');
    row.append(node('span', 'rank', String(index + 1)), node('span', '', item.name),
      node('b', '', boardTab === 'wins' ? `${item.wins} lần nhất / ${item.races}` : lapText(item.ms)));
    return row;
  }) : [node('li', 'empty', boardTab === 'wins' ? 'Chưa ai về nhất trong 7 ngày qua.' : 'Chưa có vòng nào. Chạy một vòng để mở hàng!')]));
  const mine = boardData.me;
  el.boardMine.textContent = mine
    ? `Của bạn: hôm nay ${lapText(mine.today ?? NaN)} · 7 ngày ${lapText(mine.week ?? NaN)} · mọi lúc ${lapText(mine.best ?? NaN)} · về nhất ${mine.wins}/${mine.races} cuộc (7 ngày)`
    : 'Đăng nhập ở cổng chùa để lưu vòng nhanh nhất lên Bảng vàng.';
}

// ---- Tiếng ----
const audio = (() => {
  let ctx = null;
  let engine = null;
  let bumpBuffer = null;
  const ensure = () => {
    if (ctx || muted) return ctx;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    ctx = new Context();
    const length = Math.floor(ctx.sampleRate * 0.15);
    bumpBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const noise = bumpBuffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) noise[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    const high = ctx.createOscillator();
    high.type = 'square';
    const highGain = ctx.createGain();
    highGain.gain.value = 0.25;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(ctx.destination);
    low.start();
    high.start();
    engine = { gain, filter, low, high };
    return ctx;
  };
  return {
    start() { ensure(); ctx?.resume?.(); },
    // Tiếng máy theo tốc độ: 7 số, mỗi số vòng tua lên rồi tụt khi sang số.
    engine(speed, throttle) {
      if (!engine) return;
      const gear = Math.min(6, Math.floor(speed / 11));
      const within = Math.min(1, (speed - gear * 11) / 11);
      const rpm = 70 + within * 120 + gear * 10;
      const now = ctx.currentTime;
      engine.low.frequency.setTargetAtTime(rpm, now, 0.05);
      engine.high.frequency.setTargetAtTime(rpm * 2, now, 0.05);
      engine.filter.frequency.setTargetAtTime(500 + throttle * 900 + speed * 8, now, 0.08);
      engine.gain.gain.setTargetAtTime(muted || !driving ? 0 : 0.035 + throttle * 0.03, now, 0.1);
    },
    beep(frequency, duration) {
      if (!ensure() || muted) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    bump(strength) {
      if (!ctx || muted || audio.bumpAt > performance.now()) return;
      audio.bumpAt = performance.now() + 250;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = Math.min(0.4, 0.05 + strength * 0.02);
      source.buffer = bumpBuffer;
      source.connect(gain).connect(ctx.destination);
      source.start();
    },
    bumpAt: 0,
  };
})();

// ---- Thao tác ----
el.join.addEventListener('click', () => {
  audio.start();
  if (me.mode === 'queued') send('race.leave');
  else send('race.join', chosenColor());
  say('');
});
el.practice.addEventListener('click', () => {
  audio.start();
  send('race.practice', chosenColor());
  say('');
});
el.stopDrive.addEventListener('click', () => {
  send('race.leave');
  stopDriving();
});
el.rescue.addEventListener('click', () => {
  if (!own || locked()) return;
  const spot = rescuePoint(track, own.s);
  Object.assign(own, { x: spot.x, z: spot.z, h: spot.h, v: 0, vl: 0 });
  placeCar(own, track);
  rememberOwnPose();
  acc = 0;
  tracker?.taint();
  rescueNext = true;
});
el.autoGas.addEventListener('change', () => {
  autoGas = el.autoGas.checked;
  store.set('race-autogas', autoGas ? '1' : '0');
  renderPanel();
});
el.mute.addEventListener('click', () => {
  muted = !muted;
  store.set('race-mute', muted ? '1' : '0');
  if (!muted) audio.start();
  renderPanel();
});
el.camera.addEventListener('click', () => view.setCameraMode(view.cameraMode === 'chase' ? 'far' : 'chase'));
el.boardOpen.addEventListener('click', () => {
  el.board.hidden = false;
  loadBoard();
});
el.boardTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]')?.dataset.tab;
  if (!tab) return;
  boardTab = tab;
  renderBoard();
});
el.helpOpen.addEventListener('click', () => { el.help.hidden = false; });
for (const [sheet, close] of [[el.board, el.boardClose], [el.help, el.helpClose], [el.results, el.resultsClose]]) {
  close.addEventListener('click', () => { sheet.hidden = true; });
  sheet.addEventListener('click', (event) => { if (event.target === sheet) sheet.hidden = true; });
}
el.again.addEventListener('click', () => {
  // Bỏ cuộc thì không tự xếp chờ: bấm Đua tiếp là xin vào lại.
  if (me.mode !== 'queued') send('race.join', chosenColor());
  el.results.hidden = true;
});
el.leaveRace.addEventListener('click', () => {
  send('race.leave');
  el.results.hidden = true;
});

// Vô lăng: giữ và kéo ngang trong ô bên trái (70 px = đánh hết lái).
let steerPointer = null;
let steerFrom = 0;
el.steer.addEventListener('pointerdown', (event) => {
  steerPointer = event.pointerId;
  steerFrom = event.clientX;
  el.steer.setPointerCapture(event.pointerId);
  audio.start();
});
el.steer.addEventListener('pointermove', (event) => {
  if (event.pointerId !== steerPointer) return;
  input.steer = Math.max(-1, Math.min(1, (event.clientX - steerFrom) / 70));
  el.wheel.style.transform = `rotate(${input.steer * 110}deg)`;
});
const steerEnd = (event) => {
  if (event.pointerId !== steerPointer) return;
  steerPointer = null;
  input.steer = 0;
  el.wheel.style.transform = '';
};
el.steer.addEventListener('pointerup', steerEnd);
el.steer.addEventListener('pointercancel', steerEnd);
for (const [button, key] of [[el.brake, 'brake'], [el.gas, 'gas']]) {
  button.addEventListener('pointerdown', (event) => {
    input[key] = true;
    button.classList.add('on');
    button.setPointerCapture(event.pointerId);
    audio.start();
  });
  const release = () => {
    input[key] = false;
    button.classList.remove('on');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
}
addEventListener('keydown', (event) => {
  if (event.target.closest?.('input, textarea')) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  input.keys.add(event.code);
  if (event.code === 'KeyR' && driving) el.rescue.click();
});
addEventListener('keyup', (event) => input.keys.delete(event.code));
addEventListener('blur', () => input.keys.clear());

// Đi nhanh sang khu khác (giống các phòng game).
function travelTo(destination) {
  if (driving) send('race.leave');
  if (destination === 'cinema') {
    location.href = currentCinemaHref();
    return;
  }
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
}
el.travelToggle.addEventListener('click', () => {
  el.travelPanel.hidden = !el.travelPanel.hidden;
  el.travelToggle.setAttribute('aria-expanded', String(!el.travelPanel.hidden));
});
el.travelPanel.addEventListener('click', (event) => {
  const destination = event.target.closest('[data-destination]')?.dataset.destination;
  if (destination) travelTo(destination);
});
document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.travel')) el.travelPanel.hidden = true; });

function resize() {
  view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
renderPanel();
requestAnimationFrame(frame);
// Gỡ lỗi: localStorage.debug-race = '1'.
if (store.get('debug-race', '0') === '1') {
  window.chanhDienRace = {
    view, track, session,
    get own() { return own; },
    get state() { return state; },
    get me() { return me; },
    get myId() { return myId; },
    set autopilot(on) { autopilot = on ? createDriver({ skill: 0.95, random: () => 0.5 }) : null; },
  };
}
