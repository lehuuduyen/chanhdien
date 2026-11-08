// Renderer Canvas 2D cho trình duyệt. Thứ tự lớp:
// nền (canvas riêng vẽ một lần, camera di chuyển bằng CSS transform nên không tốn công mỗi khung)
// → canvas chính: [mỗi hàng từ xa tới gần: nhân vật → lưng ghế của hàng đó] → bong bóng chat.
// Khung màn chiếu chỉ được tô đen; trang đặt iframe YouTube lên đúng screenRect().
// Canvas chính phải nằm trong phần tử cha có position khác static; renderer chèn lớp nền ngay trước nó.
import {
  cameraRegion,
  cameraTransform,
  characterHeight,
  hitTestSeat,
  layoutBubbles,
  lerpTransform,
  resolveScene,
  stageToView,
  viewToStage,
} from './index.mjs';

const CAMERA_EASE_MS = 320;
// Trần hiệu ứng khi nhiều người dâng cùng lúc (đo ở bản legacy: không giới hạn thì 720 cánh hoa làm giật).
const MAX_FLOATERS = 140;
const MAX_FX = 12;
// Áo và tóc nhìn từ sau lưng; tóc đủ sáng để đầu nổi trên lưng ghế đỏ sẫm và nền tối.
const SILHOUETTE_COLORS = ['#4f6a92', '#6b5a8e', '#3f7a70', '#8a6a4c', '#5d7a4f', '#8a5468', '#4f7aa0', '#6d6d78'];
const HAIR_COLORS = ['#3b2a20', '#2a2420', '#5a3d28', '#4a4038', '#6b4a2e', '#262a33'];

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function drawCinemaBackground(ctx, scene) {
  const { width, height } = scene.stage;
  const screen = scene.screen;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#06080c');
  sky.addColorStop(0.45, '#0b0f16');
  sky.addColorStop(1, '#10141b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Tường hai bên hội tụ về màn chiếu.
  const floorTop = screen ? screen.y + screen.height + 60 : height * 0.45;
  ctx.fillStyle = '#0d1219';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(70, 120); ctx.lineTo(70, floorTop); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, 0); ctx.lineTo(width - 70, 120); ctx.lineTo(width - 70, floorTop); ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255, 190, 110, 0.5)';
  for (let index = 0; index < 5; index += 1) {
    const y = 360 + index * 260;
    ctx.fillRect(18, y, 6, 26);
    ctx.fillRect(width - 24, y, 6, 26);
  }

  if (screen) {
    // Ánh màn hắt xuống sàn, khung màn và vùng chiếu tối (iframe đặt đè lên).
    const glow = ctx.createRadialGradient(width / 2, screen.y + screen.height, 40, width / 2, screen.y + screen.height, width * 0.75);
    glow.addColorStop(0, 'rgba(120, 150, 210, 0.22)');
    glow.addColorStop(1, 'rgba(120, 150, 210, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, screen.y, width, height - screen.y);
    ctx.fillStyle = '#1a202b';
    roundRect(ctx, screen.x - 16, screen.y - 16, screen.width + 32, screen.height + 32, 10);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(screen.x, screen.y, screen.width, screen.height);
    ctx.fillStyle = '#2a313d';
    ctx.fillRect(screen.x + screen.width / 2 - 90, screen.y + screen.height + 26, 180, 6);
  }

  // Sàn bậc thang theo từng hàng ghế, lối đi giữa có đèn nhỏ.
  const rows = groupRows(scene.seats);
  for (const row of rows) {
    const scale = row.scale;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fillRect(row.left - 40 * scale, row.y + 6 * scale, row.right - row.left + 80 * scale, 3 * scale + 1);
    ctx.fillStyle = 'rgba(255, 196, 120, 0.75)';
    ctx.beginPath();
    ctx.arc(scene.stage.width / 2, row.y + 10 * scale, 3.2 * scale + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function groupRows(seats) {
  const rows = new Map();
  for (const seat of seats) {
    const key = seat.row ?? `y${seat.y}`;
    const row = rows.get(key) || { key, seats: [], y: 0, scale: 0, left: Infinity, right: -Infinity };
    row.seats.push(seat);
    row.y = Math.max(row.y, seat.y);
    row.scale = Math.max(row.scale, seat.scale);
    row.left = Math.min(row.left, seat.x);
    row.right = Math.max(row.right, seat.x);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.y - b.y);
}

const SEATBACK = { width: 92, top: 60, height: 70 };

function drawProceduralSeatback(ctx, seat) {
  const s = seat.scale;
  const width = SEATBACK.width * s;
  const x = seat.x - width / 2;
  const y = seat.y - SEATBACK.top * s;
  const fill = ctx.createLinearGradient(0, y, 0, y + SEATBACK.height * s);
  fill.addColorStop(0, '#6b2432');
  fill.addColorStop(1, '#2c0e15');
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, width, SEATBACK.height * s, 14 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  roundRect(ctx, x + 6 * s, y + 4 * s, width - 12 * s, 8 * s, 4 * s);
  ctx.fill();
}

// Mỗi hàng một dải ảnh lưng ghế dựng sẵn: vẽ xen kẽ giữa các hàng nhân vật mà không tốn công vẽ lại từng ghế.
function buildSeatbackStrips(scene, seatbacksImage) {
  if (!scene.seatbacks) return new Map();
  const strips = new Map();
  const quality = seatbacksImage ? 1 : 2;
  for (const row of groupRows(scene.seats)) {
    const top = Math.min(...row.seats.map((seat) => seat.y - (SEATBACK.top + 4) * seat.scale));
    const bottom = row.y + 16 * row.scale;
    const canvas = makeCanvas(scene.stage.width * quality, (bottom - top) * quality);
    const ctx = canvas.getContext('2d');
    if (seatbacksImage) {
      ctx.drawImage(seatbacksImage, 0, top, scene.stage.width, bottom - top, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.scale(quality, quality);
      ctx.translate(0, -top);
      for (const seat of row.seats) drawProceduralSeatback(ctx, seat);
    }
    strips.set(row.key, { canvas, top, height: bottom - top });
  }
  return strips;
}

export async function createSceneRenderer({ canvas, scene: rawScene, baseUrl = '', onSeatClick, maxFps = 60 }) {
  const scene = resolveScene(rawScene);
  const ctx = canvas.getContext('2d');
  const resolveSrc = (src) => (src.startsWith('/') ? src : `${baseUrl}${src}`);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const effectNames = Object.entries(scene.effects?.sprites || {});
  const [backgroundImage, seatbacksImage, ...images] = await Promise.all([
    scene.background?.type === 'image' ? loadImage(resolveSrc(scene.background.src)) : null,
    scene.seatbacks?.type === 'image' ? loadImage(resolveSrc(scene.seatbacks.src)) : null,
    ...(scene.characters.style === 'sprite' ? scene.characters.skins.map((skin) => loadImage(`${scene.characters.base}${skin}.webp`)) : []),
    ...effectNames.map(([, file]) => loadImage(`${scene.effects.base}${file}.webp`)),
  ]);
  const skinCount = scene.characters.style === 'sprite' ? scene.characters.skins.length : 0;
  const skins = new Map((scene.characters.skins || []).map((skin, index) => [skin, images[index]]));
  const effectImages = new Map(effectNames.map(([name], index) => [name, images[skinCount + index]]));

  const background = makeCanvas(scene.stage.width, scene.stage.height);
  const backgroundCtx = background.getContext('2d');
  if (backgroundImage) backgroundCtx.drawImage(backgroundImage, 0, 0, scene.stage.width, scene.stage.height);
  else drawCinemaBackground(backgroundCtx, scene);
  // Màu mép trên/dưới của ảnh nền: tô phần khung lộ ra ngoài ảnh cho liền với cảnh thay vì một màu đen.
  const edgeColors = (() => {
    const average = (y) => {
      try {
        const data = backgroundCtx.getImageData(0, y, scene.stage.width, 24).data;
        let r = 0; let g = 0; let b = 0;
        for (let index = 0; index < data.length; index += 4) { r += data[index]; g += data[index + 1]; b += data[index + 2]; }
        const count = data.length / 4;
        return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
      } catch {
        return scene.backdrop || '#05070a';
      }
    };
    return { top: average(0), bottom: average(scene.stage.height - 24) };
  })();
  Object.assign(background.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${scene.stage.width}px`,
    height: `${scene.stage.height}px`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
  });
  background.setAttribute('aria-hidden', 'true');
  canvas.before(background);
  let backgroundTransform = '';
  const seatbackStrips = buildSeatbackStrips(scene, seatbacksImage);
  const rows = groupRows(scene.seats);
  const seatsById = new Map(scene.seats.map((seat) => [seat.id, seat]));

  const participants = new Map();
  const effects = { fx: [], floaters: [], glows: new Map(), haloPulse: 0, lastAt: 0 };
  const scaledCache = new Map();
  const glowSprite = (() => {
    const glow = makeCanvas(128, 128);
    const gctx = glow.getContext('2d');
    const gradient = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 200, 110, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 160, 60, 0)');
    gctx.fillStyle = gradient;
    gctx.fillRect(0, 0, 128, 128);
    return glow;
  })();
  let rowsWithPeople = new Map();
  let bubbles = [];
  let cameraId = 'overview';
  let focusSeatId = null;
  let current = null;
  let target = null;
  let from = null;
  let cameraChangedAt = 0;
  let viewport = { width: 1, height: 1, dpr: 1 };
  // Khoảng chừa trên/dưới (px CSS) cho thanh điều khiển của trang: camera thu cảnh vào phần còn lại để nút không đè ghế.
  let insets = { top: 0, bottom: 0 };
  let frame = 0;
  let lastFrameAt = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsWindowStart = performance.now();
  let destroyed = false;
  let ceremonyActive = true;
  let ceremonySettings = {
    labels: { teacher: 'Giảng sư', bell: 'Thỉnh chuông', woodenFish: 'Gõ mõ' },
    serverNow: () => Date.now(),
    moPeriodMs: 1_150,
    bellPeriodMs: 45_000,
  };

  function rebuildRows() {
    rowsWithPeople = new Map();
    for (const person of participants.values()) {
      const seat = seatsById.get(person.seatId);
      if (!seat) continue;
      const key = seat.row ?? `y${seat.y}`;
      if (!rowsWithPeople.has(key)) rowsWithPeople.set(key, []);
      rowsWithPeople.get(key).push({ person, seat });
    }
    for (const list of rowsWithPeople.values()) list.sort((a, b) => a.seat.x - b.seat.x);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const changed = width !== viewport.width || height !== viewport.height;
    viewport = { width, height, dpr };
    if (changed) updateTarget(true);
  }

  function updateTarget(immediate = false) {
    const region = cameraRegion(scene, cameraId, seatsById.get(focusSeatId));
    if (region.focus) {
      // Ảnh tràn ra sau thanh điều khiển, chỉ focus phải nằm giữa hai thanh.
      target = cameraTransform(scene, region, { width: viewport.width, height: viewport.height, insetTop: insets.top, insetBottom: insets.bottom });
    } else {
      const usable = { width: viewport.width, height: Math.max(1, viewport.height - insets.top - insets.bottom) };
      target = cameraTransform(scene, region, usable);
      target = { ...target, offsetY: target.offsetY + insets.top };
    }
    if (immediate || !current || reduceMotion) {
      current = target;
      from = target;
    } else {
      from = current;
      cameraChangedAt = performance.now();
    }
  }

  // Người ngồi nhìn từ sau lưng: vai nhô khỏi lưng ghế, đầu và tóc phía trên; lưng ghế vẽ sau sẽ che phần dưới.
  function drawSilhouette(person, seat, time) {
    const s = seat.scale;
    const seed = hash(person.id);
    const bob = reduceMotion ? 0 : Math.sin(time / 900 + (seed % 628) / 100) * 1.2 * s;
    const top = seat.y - characterHeight(scene, seat) + bob;
    ctx.fillStyle = SILHOUETTE_COLORS[seed % SILHOUETTE_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(seat.x, top + 86 * s, 40 * s, 22 * s, 0, Math.PI, 0);
    ctx.lineTo(seat.x + 40 * s, seat.y - 20 * s);
    ctx.lineTo(seat.x - 40 * s, seat.y - 20 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c99a78';
    ctx.fillRect(seat.x - 9 * s, top + 52 * s, 18 * s, 16 * s);
    ctx.fillStyle = HAIR_COLORS[(seed >>> 4) % HAIR_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(seat.x, top + 34 * s, 25 * s, 29 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.ellipse(seat.x - 7 * s, top + 22 * s, 9 * s, 12 * s, -0.4, 0, Math.PI * 2);
    ctx.fill();
    if (person.me) {
      ctx.strokeStyle = '#f3c969';
      ctx.lineWidth = 3 * s + 1;
      ctx.beginPath();
      ctx.ellipse(seat.x, top + 34 * s, 27 * s, 31 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawSprite(person, seat, time) {
    const image = skins.get(person.skin) || skins.values().next().value;
    if (!image) return;
    const s = seat.scale;
    const height = characterHeight(scene, seat);
    const width = image.naturalWidth * (height / image.naturalHeight);
    const bob = reduceMotion ? 0 : Math.sin(time / 900 + (hash(person.id) % 628) / 100) * 2 * s;
    ctx.drawImage(image, seat.x - width / 2, seat.y - height + bob, width, height);
  }

  function drawNameTag(person, seat) {
    const s = seat.scale;
    const fontSize = Math.round(14 + 14 * s);
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const label = person.name.length > 18 ? `${person.name.slice(0, 17)}…` : person.name;
    const width = ctx.measureText(label).width + 16;
    const height = fontSize + 10;
    const y = seat.y - characterHeight(scene, seat) - height / 2 - 4 * s;
    ctx.fillStyle = person.me ? 'rgba(138, 42, 30, 0.88)' : 'rgba(12, 10, 8, 0.62)';
    roundRect(ctx, seat.x - width / 2, y - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = '#f6ead2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, seat.x, y + 1);
  }

  // Bồ đoàn vẽ bằng code cho ghế không có sẵn trong ảnh nền (seat.cushion = true): trống vẫn thấy để chạm vào ngồi.
  // Kích thước và màu đo theo bồ đoàn vẽ trong tranh chánh điện (rộng ~96·scale, viền nâu sẫm, mặt trên sáng hơn).
  function drawCushion(seat) {
    const s = seat.scale;
    const rx = 94 * s;
    const ry = 30 * s;
    const depth = 24 * s;
    const cy = seat.y - 16 * s;
    // Bóng trên sàn, thân bồ đoàn (phồng, viền nâu sẫm như nét vẽ trong tranh), mặt trên sáng ở giữa có nếp lõm.
    ctx.fillStyle = 'rgba(20, 8, 2, 0.35)';
    ctx.beginPath();
    ctx.ellipse(seat.x + 8 * s, cy + depth, rx * 1.03, ry * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.8 * s;
    ctx.strokeStyle = '#1c0c04';
    ctx.fillStyle = '#43250f';
    ctx.beginPath();
    ctx.ellipse(seat.x, cy + depth / 2, rx, ry + depth / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const topY = cy - depth * 0.1;
    const gradient = ctx.createRadialGradient(seat.x, topY - ry * 0.2, 4 * s, seat.x, topY, rx * 0.95);
    gradient.addColorStop(0, '#7a4b2e');
    gradient.addColorStop(0.65, '#62391f');
    gradient.addColorStop(1, '#4c2b15');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(seat.x, topY, rx * 0.9, ry * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(28, 12, 4, 0.22)';
    ctx.beginPath();
    ctx.moveTo(seat.x - 26 * s, topY - 8 * s);
    ctx.lineTo(seat.x, topY + 4 * s);
    ctx.lineTo(seat.x + 26 * s, topY - 8 * s);
    ctx.lineTo(seat.x, topY - 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 190, 130, 0.16)';
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.ellipse(seat.x, cy + depth / 2, rx * 0.96, ry + depth / 2 - 2 * s, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  function drawMySeatMarker(seat, time) {
    const s = seat.scale;
    const pulse = reduceMotion ? 0.7 : 0.55 + 0.25 * Math.sin(time / 300);
    ctx.strokeStyle = `rgba(243, 201, 105, ${pulse})`;
    ctx.lineWidth = 4 * s + 1;
    ctx.beginPath();
    ctx.ellipse(seat.x, seat.y + 4 * s, 52 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBubbles() {
    for (const bubble of layoutBubbles(scene, bubbles, Date.now())) {
      const alpha = Math.min(1, bubble.age / 180, (6_000 - bubble.age) / 500);
      const { x, y, width, height } = bubble;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = bubble.me ? '#f3c969' : 'rgba(250, 250, 248, 0.95)';
      roundRect(ctx, x, y, width, height, height / 2);
      ctx.fill();
      const tailX = Math.min(Math.max(bubble.tipX, x + height / 2), x + width - height / 2);
      ctx.beginPath();
      ctx.moveTo(tailX - 7, y + height - 1);
      ctx.lineTo(tailX + 7, y + height - 1);
      ctx.lineTo(bubble.tipX, Math.max(bubble.tipY, y + height + 4));
      ctx.closePath();
      ctx.fill();
      ctx.font = `500 ${bubble.fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = '#16130f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.text, x + width / 2, y + height / 2 + 1, width - bubble.fontSize);
      ctx.restore();
    }
    if (bubbles.length > 200) bubbles = bubbles.filter((bubble) => Date.now() - bubble.at < 6_000);
  }

  function drawAmbience(time) {
    if (scene.ambience !== 'temple') return;
    const halo = scene.effects?.halo;
    const haloImage = effectImages.get('halo');
    if (halo && haloImage) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.22 + (reduceMotion ? 0 : 0.08 * Math.sin(time / 830)) + effects.haloPulse * 0.5);
      drawEffect(haloImage, halo.x, halo.y, halo.scale * (1 + effects.haloPulse * 0.15), 0.5);
      ctx.restore();
    }
    if (reduceMotion) return;
    const smoke = scene.effects?.smoke;
    if (smoke) {
      ctx.save();
      ctx.fillStyle = '#e8dcc6';
      for (let index = 0; index < 14; index += 1) {
        const k = ((time / 1000) * 0.09 + index * 0.071) % 1;
        ctx.globalAlpha = 0.3 * (1 - k);
        ctx.beginPath();
        ctx.arc(smoke.x + Math.sin(k * 7 + index) * 18 * k, smoke.y - k * 260, 4 + k * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(time / 110) * Math.sin(time / 75);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(0, 300, scene.stage.width, 900);
    ctx.restore();
  }

  function ceremonyPulse(period, duration) {
    if (!ceremonyActive || reduceMotion || !period) return 0;
    let now = Date.now();
    try { now = ceremonySettings.serverNow?.() ?? now; } catch {}
    const elapsed = ((now % period) + period) % period;
    return elapsed < duration ? Math.sin((elapsed / duration) * Math.PI) : 0;
  }

  function drawCeremonyLabel(text, x, y, scale) {
    if (!text) return;
    ctx.save();
    const fontSize = Math.max(18, 27 * scale / 0.6);
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    const width = ctx.measureText(text).width + 28;
    const height = fontSize + 15;
    ctx.fillStyle = 'rgba(61, 22, 13, 0.9)';
    roundRect(ctx, x - width / 2, y - height, width, height, height / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 189, 90, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff1c8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - height / 2 + 1);
    ctx.restore();
  }

  // Ba vị nghi lễ là thành phần cố định của cảnh, không phải người tham dự và không nhận thao tác chọn ghế.
  function drawCeremony() {
    const officiants = scene.ceremony?.officiants;
    if (!officiants?.length) return;
    const monk = skins.get('c_monk');
    const bellPulse = ceremonyPulse(ceremonySettings.bellPeriodMs, 520);
    const moPulse = ceremonyPulse(ceremonySettings.moPeriodMs, 260);
    for (const item of officiants) {
      const height = scene.characters.height * item.scale;
      const width = monk?.naturalHeight ? monk.naturalWidth * (height / monk.naturalHeight) : height * 0.72;
      if (item.role === 'teacher') {
        ctx.save();
        const daisWidth = width * 1.45;
        const gradient = ctx.createLinearGradient(0, item.y - 30, 0, item.y + 26);
        gradient.addColorStop(0, '#a43422');
        gradient.addColorStop(1, '#4b140e');
        ctx.fillStyle = gradient;
        roundRect(ctx, item.x - daisWidth / 2, item.y - 24, daisWidth, 48, 9);
        ctx.fill();
        ctx.strokeStyle = '#e7b64e';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = '#d9a73f';
        ctx.fillRect(item.x - daisWidth * 0.42, item.y + 22, daisWidth * 0.84, 11);
        ctx.restore();
      } else {
        const instrumentX = item.x + (item.role === 'bell' ? 67 : -67) * item.scale / 0.48;
        const instrumentY = item.y - 25;
        ctx.save();
        if (item.role === 'bell') {
          ctx.fillStyle = '#d6a84f';
          ctx.beginPath();
          ctx.moveTo(instrumentX - 25, instrumentY + 23);
          ctx.quadraticCurveTo(instrumentX - 22, instrumentY - 24, instrumentX, instrumentY - 30);
          ctx.quadraticCurveTo(instrumentX + 22, instrumentY - 24, instrumentX + 25, instrumentY + 23);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#6b4218';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#8e451e';
          ctx.beginPath();
          ctx.ellipse(instrumentX, instrumentY, 34, 24, -0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#3c1c0c';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(instrumentX - 16, instrumentY - 3);
          ctx.quadraticCurveTo(instrumentX, instrumentY + 8, instrumentX + 20, instrumentY - 7);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (monk) ctx.drawImage(monk, item.x - width / 2, item.y - height, width, height);
      if (item.role !== 'teacher') {
        const instrumentX = item.x + (item.role === 'bell' ? 67 : -67) * item.scale / 0.48;
        const instrumentY = item.y - 25;
        const pulse = item.role === 'bell' ? bellPulse : moPulse;
        const side = item.role === 'bell' ? 1 : -1;
        ctx.save();
        ctx.translate(item.x + side * 12, item.y - height * 0.42);
        ctx.rotate(side * (-0.62 + pulse * 0.72));
        ctx.strokeStyle = '#6d3c1c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(instrumentX - (item.x + side * 12), instrumentY - (item.y - height * 0.42));
        ctx.stroke();
        ctx.restore();
      }
      drawCeremonyLabel(ceremonySettings.labels?.[item.role], item.x, item.y - height - 12, item.scale);
    }
  }

  // Ảnh hiệu ứng thu nhỏ sẵn theo bậc tỷ lệ rồi dùng lại: vẽ trăm cánh hoa từ ảnh ~200 px mỗi khung rất tốn.
  function drawEffect(image, x, y, scale, anchorY = 1) {
    if (!image) return;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    let source = image;
    if (scale < 0.9) {
      const bucket = Math.max(0.04, Math.round(scale * 25) / 25);
      const key = `${image.src}|${bucket}`;
      source = scaledCache.get(key);
      if (!source) {
        source = makeCanvas(image.naturalWidth * bucket * 1.5, image.naturalHeight * bucket * 1.5);
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
        scaledCache.set(key, source);
      }
    }
    ctx.drawImage(source, x - width / 2, y - height * anchorY, width, height);
  }

  function addFloater(floater) {
    if (effects.floaters.length < MAX_FLOATERS) effects.floaters.push(floater);
  }

  function updateEffects(time) {
    const dt = Math.min((time - (effects.lastAt || time)) / 1000, 0.05);
    effects.lastAt = time;
    effects.haloPulse = Math.max(0, effects.haloPulse - dt * 0.45);
    for (const [id, value] of effects.glows) {
      if (value - dt * 0.5 <= 0) effects.glows.delete(id);
      else effects.glows.set(id, value - dt * 0.5);
    }
    effects.fx = effects.fx.filter((item) => (item.t += dt) < item.life);
    effects.floaters = effects.floaters.filter((item) => {
      item.t += dt;
      item.x += item.vx * dt + Math.sin(item.t * 3 + item.seed) * 20 * dt;
      item.y += item.vy * dt;
      return item.t < item.life;
    });
  }

  function drawGlow(person, seat) {
    const value = effects.glows.get(person.id);
    if (!value) return;
    const s = seat.scale;
    const height = characterHeight(scene, seat);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = value * 0.7;
    ctx.drawImage(glowSprite, seat.x - 170 * s, seat.y - height * 0.33 - 170 * s, 340 * s, 340 * s);
    ctx.restore();
  }

  function drawEffects() {
    for (const item of effects.fx) {
      const k = item.t / item.life;
      const pop = 1 - (1 - Math.min(1, item.t * 4)) ** 3;
      ctx.save();
      ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
      drawEffect(effectImages.get(item.kind), item.x, item.y - k * 160, item.scale * (0.6 + 0.4 * pop) * 0.9);
      ctx.restore();
    }
    const petal = effectImages.get('petal');
    for (const item of effects.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, item.life - item.t);
      ctx.translate(item.x, item.y);
      ctx.rotate(Math.sin(item.t * 2 + item.seed) * 0.6);
      drawEffect(petal, 0, 0, item.scale, 0.5);
      ctx.restore();
    }
  }

  function render(time) {
    if (destroyed) return;
    requestAnimationFrame(render);
    if (maxFps < 60 && time - lastFrameAt < 1_000 / maxFps - 2) return;
    lastFrameAt = time;
    draw(time);
    frame += 1;
    fpsFrames += 1;
    if (time - fpsWindowStart >= 1_000) {
      fps = Math.round((fpsFrames * 1_000) / (time - fpsWindowStart));
      fpsFrames = 0;
      fpsWindowStart = time;
    }
  }

  function draw(time) {
    resize();
    if (from !== target) {
      const k = (time - cameraChangedAt) / CAMERA_EASE_MS;
      current = k >= 1 ? target : lerpTransform(from, target, 1 - (1 - k) ** 3);
      if (k >= 1) from = target;
    }

    const transform = `matrix(${current.scale}, 0, 0, ${current.scale}, ${current.offsetX}, ${current.offsetY})`;
    if (transform !== backgroundTransform) {
      background.style.transform = transform;
      backgroundTransform = transform;
    }

    // Canvas chính trong suốt; chỉ tô màu nền ở phần ngoài stage (khi khung nhìn rộng hơn cảnh).
    const { dpr } = viewport;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const left = current.offsetX * dpr;
    const top = current.offsetY * dpr;
    const right = left + scene.stage.width * current.scale * dpr;
    const bottom = top + scene.stage.height * current.scale * dpr;
    ctx.fillStyle = edgeColors.top;
    if (top > 0) ctx.fillRect(0, 0, canvas.width, top);
    ctx.fillStyle = edgeColors.bottom;
    if (bottom < canvas.height) ctx.fillRect(0, bottom, canvas.width, canvas.height - bottom);
    ctx.fillStyle = scene.backdrop || '#05070a';
    if (left > 0) ctx.fillRect(0, 0, left, canvas.height);
    if (right < canvas.width) ctx.fillRect(right, 0, canvas.width - right, canvas.height);
    ctx.setTransform(current.scale * dpr, 0, 0, current.scale * dpr, current.offsetX * dpr, current.offsetY * dpr);
    updateEffects(time);
    drawAmbience(time);
    drawCeremony();

    const me = [...participants.values()].find((person) => person.me && person.seatId);
    const mySeat = me && seatsById.get(me.seatId);
    const myRowKey = mySeat && (mySeat.row ?? `y${mySeat.y}`);
    for (const row of rows) {
      const people = rowsWithPeople.get(row.key) || [];
      // Nhân vật sprite đã có bồ đoàn riêng: chỉ vẽ bồ đoàn bằng code khi ghế còn trống.
      for (const seat of row.seats) if (seat.cushion && !people.some((item) => item.seat === seat)) drawCushion(seat);
      for (const { person, seat } of people) {
        drawGlow(person, seat);
        if (scene.characters.style === 'sprite') drawSprite(person, seat, time);
        else drawSilhouette(person, seat, time);
      }
      const strip = seatbackStrips.get(row.key);
      if (strip) ctx.drawImage(strip.canvas, 0, strip.top, scene.stage.width, strip.height);
      if (myRowKey === row.key) drawMySeatMarker(mySeat, time);
      if (scene.characters.nameTags !== 'none') {
        for (const { person, seat } of people) {
          if (scene.characters.nameTags === 'all' || person.me) drawNameTag(person, seat);
        }
      }
    }
    drawEffects();
    drawBubbles();
  }

  function onPointer(event) {
    if (!onSeatClick || !current) return;
    const rect = canvas.getBoundingClientRect();
    const point = viewToStage({ x: event.clientX - rect.left, y: event.clientY - rect.top }, current);
    const onOfficiant = scene.ceremony?.officiants?.some((item) => {
      const height = scene.characters.height * item.scale;
      return Math.abs(point.x - item.x) <= height * 0.46 && point.y >= item.y - height - 42 && point.y <= item.y + 34;
    });
    if (onOfficiant) return;
    const occupied = new Set([...participants.values()].map((person) => person.seatId).filter(Boolean));
    const seat = hitTestSeat(scene, point, { minRadius: 24 / current.scale, occupied });
    if (seat) onSeatClick(seat);
  }
  canvas.addEventListener('click', onPointer);

  resize();
  updateTarget(true);
  requestAnimationFrame(render);

  return {
    scene,
    setParticipants(list) {
      participants.clear();
      for (const person of list) participants.set(person.id, person);
      rebuildRows();
    },
    setCeremony(next = {}) {
      ceremonySettings = { ...ceremonySettings, ...next, labels: { ...ceremonySettings.labels, ...next.labels } };
    },
    setCeremonyActive(active) {
      ceremonyActive = Boolean(active);
    },
    say(participantId, text) {
      const person = participants.get(participantId);
      if (!person?.seatId) return false;
      bubbles.push({ participantId, seatId: person.seatId, text, at: Date.now(), me: Boolean(person.me) });
      return true;
    },
    // Hiệu ứng lễ vật trên đầu người dâng; "big" (thỉnh chuông) thêm mưa cánh hoa và hào quang sáng lên.
    offer(participantId, kind, { big = false } = {}) {
      const person = participants.get(participantId);
      const seat = person && seatsById.get(person.seatId);
      if (big) {
        effects.haloPulse = 1;
        const halo = scene.effects?.halo || { x: scene.stage.width / 2, y: 400 };
        for (let index = 0; index < 24; index += 1) {
          addFloater({ x: halo.x + (Math.random() - 0.5) * 500, y: halo.y - 220 + Math.random() * 300, vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 40, t: 0, life: 4, scale: 0.2 + Math.random() * 0.15, seed: Math.random() * 6 });
        }
      }
      if (!seat) return false;
      effects.glows.set(participantId, 1);
      if (effects.fx.length >= MAX_FX) effects.fx.shift();
      effects.fx.push({ kind, x: seat.x, y: seat.y - characterHeight(scene, seat) * 0.45, t: 0, life: big ? 3.2 : 2.2, scale: seat.scale * (big ? 1.6 : 1.1) });
      const count = big ? 18 : kind === 'lotus' ? 8 : 3;
      for (let index = 0; index < count; index += 1) {
        addFloater({ x: seat.x + (Math.random() - 0.5) * 160 * seat.scale, y: seat.y - 60 * seat.scale, vx: (Math.random() - 0.5) * 30, vy: -(60 + Math.random() * 80), t: 0, life: 2.5 + Math.random(), scale: 0.18 + Math.random() * 0.15, seed: Math.random() * 6 });
      }
      return true;
    },
    setInsets(next) {
      const top = Math.max(0, Math.round(next.top || 0));
      const bottom = Math.max(0, Math.round(next.bottom || 0));
      if (top === insets.top && bottom === insets.bottom) return;
      insets = { top, bottom };
      updateTarget(true);
    },
    setCamera(id, seatId = focusSeatId) {
      cameraId = id;
      focusSeatId = seatId;
      updateTarget();
    },
    // Khung màn chiếu tính theo pixel CSS trong canvas, để trang đặt iframe YouTube đúng chỗ.
    screenRect() {
      if (!scene.screen || !target) return null;
      const topLeft = stageToView(scene.screen, current);
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: scene.screen.width * current.scale,
        height: scene.screen.height * current.scale,
      };
    },
    stats() {
      return { fps, frame, participants: participants.size, seats: scene.seats.length };
    },
    // Đo chi phí vẽ một khung (ms) không phụ thuộc requestAnimationFrame, dùng để kiểm tra mục tiêu ≥ 30 FPS.
    // getImageData cuối cùng buộc GPU vẽ xong để số đo trung thực, nhưng Chrome có thể chuyển canvas sang
    // vẽ bằng CPU sau lần đọc đó: chỉ đo một lần trên trang mới tải, đừng gọi trong lúc chạy thật.
    measureFrameCost(samples = 60) {
      const started = performance.now();
      for (let index = 0; index < samples; index += 1) draw(started + index * 16);
      ctx.getImageData(0, 0, 1, 1);
      return (performance.now() - started) / samples;
    },
    destroy() {
      destroyed = true;
      canvas.removeEventListener('click', onPointer);
      background.remove();
    },
  };
}
