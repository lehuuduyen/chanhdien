import { seatFillOrder } from '/engine/index.mjs';
import { createSceneRenderer } from '/engine/renderer.mjs';

const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Huy', 'Khánh', 'Lan', 'Linh', 'Minh', 'Nam', 'Ngọc', 'Phúc', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tú', 'Vy'];
const LINES = ['Đoạn này hay quá', 'Ai xem lần đầu không?', 'haha', 'Âm thanh ổn chưa mọi người?', 'Nam mô A Di Đà Phật', 'Chào cả nhà 👋', 'Cảnh này đẹp ghê', 'Bài tiếp theo là gì vậy?', '🔥🔥🔥', 'Xem cùng nhau vui thật'];

const elements = {
  canvas: document.getElementById('scene'),
  cameras: document.getElementById('cameras'),
  chatter: document.getElementById('chatter'),
  count: document.getElementById('count'),
  countLabel: document.getElementById('countLabel'),
  fps: document.getElementById('fps'),
  hint: document.getElementById('hint'),
  sceneId: document.getElementById('sceneId'),
  screenSlot: document.getElementById('screenSlot'),
};

let renderer = null;
let people = [];
let mySeatId = null;
let cameraId = 'overview';

async function loadScene(sceneId) {
  renderer?.destroy();
  const response = await fetch(`/scenes/${sceneId}/scene.json`);
  const scene = await response.json();
  renderer = await createSceneRenderer({
    canvas: elements.canvas,
    scene,
    baseUrl: `/scenes/${sceneId}/`,
    onSeatClick: sit,
  });
  mySeatId = null;
  elements.count.max = String(renderer.scene.seats.length);
  for (const button of elements.cameras.querySelectorAll('button')) {
    const id = button.dataset.camera;
    button.disabled = id !== 'overview' && id !== 'seat' && !renderer.scene.cameras[id];
  }
  setCamera('overview');
  populate();
}

function populate() {
  const count = Math.min(Number(elements.count.value), renderer.scene.seats.length);
  elements.countLabel.textContent = String(count);
  const skins = renderer.scene.characters.skins || [];
  const order = seatFillOrder(renderer.scene.seats).filter((seat) => seat.id !== mySeatId);
  people = order.slice(0, count - (mySeatId ? 1 : 0)).map((seat, index) => ({
    id: `bot-${seat.id}`,
    name: NAMES[index % NAMES.length],
    seatId: seat.id,
    skin: skins[index % Math.max(1, skins.length)],
  }));
  if (mySeatId) people.push({ id: 'me', name: 'Bạn', seatId: mySeatId, skin: skins[0], me: true });
  renderer.setParticipants(people);
}

function sit(seat) {
  const taken = people.find((person) => person.seatId === seat.id && !person.me);
  if (taken) {
    elements.hint.textContent = `Ghế ${seat.id} đã có ${taken.name}.`;
    return;
  }
  mySeatId = seat.id;
  elements.hint.textContent = `Bạn đang ngồi ghế ${seat.id}. Thử góc "Ghế của tôi".`;
  populate();
  if (cameraId === 'seat') setCamera('seat');
  renderer.say('me', 'Mình ngồi đây nhé!');
}

function setCamera(id) {
  cameraId = id;
  renderer.setCamera(id, mySeatId);
  for (const button of elements.cameras.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.camera === id));
  }
}

function placeScreenSlot() {
  const rect = renderer?.screenRect();
  elements.screenSlot.hidden = !rect;
  if (rect) {
    Object.assign(elements.screenSlot.style, {
      left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
  }
  if (renderer) elements.fps.textContent = `${renderer.stats().fps} FPS · ${people.length} người`;
  requestAnimationFrame(placeScreenSlot);
}

elements.sceneId.addEventListener('change', () => loadScene(elements.sceneId.value));
elements.count.addEventListener('input', populate);
elements.cameras.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button && !button.disabled) setCamera(button.dataset.camera);
});

setInterval(() => {
  if (!elements.chatter.checked || !people.length || document.hidden) return;
  const person = people[Math.floor(Math.random() * people.length)];
  renderer.say(person.id, LINES[Math.floor(Math.random() * LINES.length)]);
}, 700);

// Cho kiểm tra thủ công trong console: sceneDemo.renderer.measureFrameCost()
window.sceneDemo = { get renderer() { return renderer; } };

// ?scene=thien-default&n=100&bench=1: tải cảnh, lấp n người, đo chi phí vẽ một lần (xem measureFrameCost).
const params = new URLSearchParams(location.search);
if (params.has('scene')) elements.sceneId.value = params.get('scene');
if (params.has('n')) elements.count.value = params.get('n');
await loadScene(elements.sceneId.value);
requestAnimationFrame(placeScreenSlot);
if (params.has('bench')) {
  elements.chatter.checked = false;
  people.slice(0, 18).forEach((person, index) => renderer.say(person.id, `Bong bóng thử ${index + 1}`));
  window.sceneDemo.bench = { msPerFrame: Math.round(renderer.measureFrameCost(60) * 100) / 100, people: people.length };
  elements.fps.textContent = `${window.sceneDemo.bench.msPerFrame} ms/khung · ${people.length} người`;
}
