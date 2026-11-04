import { resolveScene, sortByDepth, validateScene } from '/engine/index.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
let scene = null;
let background = null;
let selectedId = null;
let dragging = null;

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function open(sceneId) {
  scene = await (await fetch(`/scenes/${sceneId}/scene.json`)).json();
  const src = scene.background?.type === 'image' ? scene.background.src : null;
  background = src ? await loadImage(src.startsWith('/') ? src : `/scenes/${sceneId}/${src}`) : null;
  canvas.width = scene.stage.width;
  canvas.height = scene.stage.height;
  selectedId = null;
  syncScreenInputs();
  syncSelection();
  draw();
}

// Chỉnh từng ghế cần danh sách ghế cụ thể thay vì công thức.
function expandLayout() {
  if (!scene?.seatLayout) return;
  scene.seats = resolveScene(scene).seats.map((seat) => ({ ...seat }));
  delete scene.seatLayout;
  draw();
}

function seats() {
  if (scene.seatLayout) expandLayout();
  return scene.seats;
}

function stagePoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function seatAt(point) {
  return [...seats()].reverse().find((seat) => Math.hypot(seat.x - point.x, seat.y - point.y) < Math.max(18, 40 * seat.scale)) || null;
}

function nextSeatId() {
  const used = new Set(seats().map((seat) => seat.id));
  let index = 1;
  while (used.has(`S-${index}`)) index += 1;
  return `S-${index}`;
}

function draw() {
  if (!scene) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background) ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  else {
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x <= canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }
  if (scene.screen) {
    ctx.fillStyle = 'rgba(80, 140, 220, .25)';
    ctx.strokeStyle = '#6fa6e8';
    ctx.lineWidth = 3;
    ctx.fillRect(scene.screen.x, scene.screen.y, scene.screen.width, scene.screen.height);
    ctx.strokeRect(scene.screen.x, scene.screen.y, scene.screen.width, scene.screen.height);
  }
  const height = scene.characters?.height ?? 120;
  for (const seat of resolveScene(scene).seats) {
    const selected = seat.id === selectedId;
    ctx.strokeStyle = selected ? '#e7b85e' : 'rgba(255, 255, 255, .55)';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeRect(seat.x - 40 * seat.scale, seat.y - height * seat.scale, 80 * seat.scale, height * seat.scale);
    ctx.fillStyle = selected ? '#e7b85e' : '#ff6b5a';
    ctx.beginPath();
    ctx.arc(seat.x, seat.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${seat.id}·${seat.row ?? '?'}`, seat.x, seat.y + 26);
  }
}

function syncSelection() {
  const seat = scene && selectedId ? seats().find((item) => item.id === selectedId) : null;
  for (const [id, key] of [['seatId', 'id'], ['seatRow', 'row'], ['seatScale', 'scale'], ['seatGroup', 'group']]) {
    $(id).disabled = !seat;
    $(id).value = seat?.[key] ?? '';
  }
}

function syncScreenInputs() {
  const screen = scene.screen || {};
  $('screenX').value = screen.x ?? '';
  $('screenY').value = screen.y ?? '';
  $('screenW').value = screen.width ?? '';
  $('screenH').value = screen.height ?? '';
}

function exportScene() {
  const output = structuredClone(scene);
  if (Array.isArray(output.seats)) output.seats = sortByDepth(output.seats);
  const { ok, errors } = validateScene(output);
  $('errors').replaceChildren(...errors.map((error) => Object.assign(document.createElement('li'), { textContent: error })));
  $('status').textContent = ok ? `Hợp lệ · ${resolveScene(output).seats.length} ghế` : '';
  $('output').value = `${JSON.stringify(output, null, 2)}\n`;
  return ok;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!scene) return;
  const point = stagePoint(event);
  const seat = seatAt(point);
  if (seat) {
    selectedId = seat.id;
    dragging = { id: seat.id, dx: seat.x - point.x, dy: seat.y - point.y };
    canvas.setPointerCapture(event.pointerId);
  } else {
    const created = { id: nextSeatId(), x: Math.round(point.x), y: Math.round(point.y), scale: Number($('newScale').value), row: Number($('newRow').value) };
    seats().push(created);
    selectedId = created.id;
  }
  syncSelection();
  draw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const point = stagePoint(event);
  const seat = seats().find((item) => item.id === dragging.id);
  seat.x = Math.round(point.x + dragging.dx);
  seat.y = Math.round(point.y + dragging.dy);
  draw();
});
canvas.addEventListener('pointerup', () => { dragging = null; });

document.addEventListener('keydown', (event) => {
  if (!scene || !selectedId || event.target.matches('input, textarea, select')) return;
  const seat = seats().find((item) => item.id === selectedId);
  const step = event.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[event.key]) {
    seat.x += moves[event.key][0];
    seat.y += moves[event.key][1];
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    scene.seats = seats().filter((item) => item.id !== selectedId);
    selectedId = null;
    syncSelection();
  } else return;
  event.preventDefault();
  draw();
});

for (const [id, key, parse] of [['seatRow', 'row', Number], ['seatScale', 'scale', Number], ['seatGroup', 'group', String]]) {
  $(id).addEventListener('input', () => {
    const seat = seats().find((item) => item.id === selectedId);
    if (!seat) return;
    const value = $(id).value.trim();
    if (key === 'group' && !value) delete seat.group;
    else seat[key] = parse(value);
    draw();
  });
}

for (const [id, key] of [['screenX', 'x'], ['screenY', 'y'], ['screenW', 'width'], ['screenH', 'height']]) {
  $(id).addEventListener('input', () => {
    if (!scene.screen) scene.screen = { x: 60, y: 200, width: 960, height: 540 };
    scene.screen[key] = Number($(id).value);
    draw();
  });
}

// Đánh số theo thứ tự hàng xa → gần, trái → phải, khớp cách engine sinh ghế (S-1 ở hàng xa nhất, bên trái).
$('renumber').addEventListener('click', () => {
  const ordered = [...seats()].sort((a, b) => ((a.row ?? 0) - (b.row ?? 0)) || (a.x - b.x));
  ordered.forEach((seat, index) => { seat.id = `S-${index + 1}`; });
  selectedId = null;
  syncSelection();
  draw();
});

$('load').addEventListener('click', () => open($('sceneId').value));
$('expand').addEventListener('click', expandLayout);
$('export').addEventListener('click', exportScene);
$('download').addEventListener('click', () => {
  if (!exportScene()) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([$('output').value], { type: 'application/json' }));
  link.download = 'scene.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

await open($('sceneId').value);
