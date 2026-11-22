// Ứng dụng Bản đồ trong điện thoại: raster sân từ world.walk, chọn điểm, dẫn đường và thẻ GPS.
// Không gửi vị trí hay tuyến lên server; người khác không bao giờ xuất hiện trên bản đồ.
import { buildMapRaster, mapPoints, worldToMap } from '/engine/map2d.mjs';
import { onLangChange, t } from '/thien-i18n.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (className, text) => Object.assign(el('button', className, text), { type: 'button' });

const COLORS = [
  [0, 0, 0, 0], [42, 35, 30, 255], [92, 116, 66, 255], [153, 112, 62, 255],
  [111, 78, 118, 255], [89, 134, 76, 255], [151, 119, 65, 255], [123, 99, 67, 255],
  [83, 123, 120, 255], [98, 91, 91, 255], [151, 133, 91, 255], [62, 99, 77, 255],
  [133, 112, 69, 255], [98, 82, 106, 255],
  // Tàng Kinh Các (khu Trí tuệ, MAP_ZONES cuối danh sách).
  [118, 96, 142, 255],
];

function rasterCanvas(raster) {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.cells.length; index += 1) {
    const color = COLORS[raster.cells[index]] || COLORS[2];
    image.data.set(color, index * 4);
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function createMapUI({ stage, explore, getWorld, travel, showToast }) {
  const sheet = el('section', 'map-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  const head = el('header', 'map-head');
  const title = el('h2');
  const tools = el('div', 'map-tools');
  const zoomOut = button('', '−');
  const locate = button('', '◎');
  const fit = button('', '▣');
  const zoomIn = button('', '+');
  const close = button('map-close', '✕');
  tools.append(zoomOut, locate, fit, zoomIn, close);
  head.append(title, tools);
  const viewport = el('div', 'map-viewport');
  const canvas = el('canvas', 'map-canvas');
  const loading = el('div', 'map-loading');
  viewport.append(canvas, loading);
  const card = el('div', 'map-card');
  card.hidden = true;
  const cardName = el('h3');
  const cardDistance = el('p');
  const cardActions = el('div', 'map-card-actions');
  const navigate = button('primary');
  const quick = button('');
  cardActions.append(navigate, quick);
  card.append(cardName, cardDistance, cardActions);
  sheet.append(head, viewport, card);

  const gps = el('aside', 'map-gps');
  gps.hidden = true;
  const gpsText = el('span');
  const gpsName = el('b');
  const gpsDistance = el('small');
  gpsText.append(gpsName, gpsDistance);
  const gpsStop = button('', '✕');
  gps.append(el('span', 'map-gps-icon', '🧭'), gpsText, gpsStop);
  stage.append(sheet, gps);

  let raster = null;
  let background = null;
  let points = [];
  let selected = null;
  let selectedRoute = null;
  let currentNav = null;
  let drawCount = 0;
  let self = null;
  let view = { scale: 1, x: 0, y: 0 };
  let fitScale = 1;
  const pointers = new Map();
  let gesture = null;

  const context = canvas.getContext('2d');
  const screenPoint = (point) => {
    const mapped = worldToMap(raster, point);
    return { x: view.x + mapped.x * view.scale, y: view.y + mapped.y * view.scale };
  };

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  function fitMap() {
    if (!raster) return;
    const rect = viewport.getBoundingClientRect();
    fitScale = Math.min((rect.width - 24) / raster.width, (rect.height - 24) / raster.height);
    view.scale = fitScale;
    view.x = (rect.width - raster.width * view.scale) / 2;
    view.y = (rect.height - raster.height * view.scale) / 2;
    draw();
  }

  function locateSelf() {
    if (!raster || !self) return;
    const rect = viewport.getBoundingClientRect();
    const mapped = worldToMap(raster, self);
    view.x = rect.width / 2 - mapped.x * view.scale;
    view.y = rect.height / 2 - mapped.y * view.scale;
    draw();
  }

  function mapShape(point, rx, rz, color) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const p = screenPoint(point);
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(p.x, p.y, Math.max(2, rx / raster.cell * view.scale), Math.max(2, rz / raster.cell * view.scale), 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawDecor(world) {
    const hall = world.hall;
    if (hall) {
      const a = screenPoint({ x: -hall.halfWidth, z: hall.back });
      const b = screenPoint({ x: hall.halfWidth, z: hall.front });
      context.fillStyle = 'rgba(100, 45, 30, .78)';
      context.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      context.strokeStyle = 'rgba(244, 191, 86, .85)';
      context.lineWidth = 1.5;
      context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    const courtyard = world.courtyard || {};
    const waters = [courtyard.pond, courtyard.grove?.pond, courtyard.flowerGarden?.pond, courtyard.wishGarden?.pond, courtyard.farmZone?.duckpond].filter(Boolean);
    for (const water of waters) {
      const rx = water.rx || water.radius || water.r || water.width / 2 || 2;
      const rz = water.rz || water.radius || water.r || water.depth / 2 || rx * 0.72;
      mapShape(water, rx, rz, 'rgba(49, 133, 151, .9)');
    }
  }

  function labelPoint(point, active, occupied) {
    const p = screenPoint(point);
    const label = t(`travel.${point.id}`);
    context.save();
    context.font = `${active ? 700 : 600} 11px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = Math.min(110, context.measureText(label).width + 13);
    const bounds = { x0: p.x - width / 2, x1: p.x + width / 2, y0: p.y + 10, y1: p.y + 30 };
    const overlaps = !active && occupied.some((item) => bounds.x0 < item.x1 && bounds.x1 > item.x0 && bounds.y0 < item.y1 && bounds.y1 > item.y0);
    if (!overlaps && (active || view.scale >= fitScale * 0.92)) {
      context.fillStyle = active ? 'rgba(236, 177, 60, .96)' : 'rgba(24, 14, 9, .88)';
      context.strokeStyle = active ? '#fff0ad' : 'rgba(236, 177, 60, .55)';
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(bounds.x0, bounds.y0, width, 20, 8);
      context.fill();
      context.stroke();
      context.fillStyle = active ? '#241608' : '#f6e7c4';
      context.fillText(label, p.x, p.y + 20, width - 8);
      occupied.push(bounds);
    }
    context.font = '18px system-ui, sans-serif';
    context.fillStyle = active ? '#241608' : '#f6e7c4';
    context.fillText(point.icon, p.x, p.y - 1);
    context.restore();
  }

  function drawRoute() {
    const route = explore.mapState().route;
    if (!route?.length) return;
    context.save();
    context.strokeStyle = 'rgba(255, 205, 70, .92)';
    context.shadowColor = '#ffb72d';
    context.shadowBlur = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 4;
    context.beginPath();
    route.forEach((point, index) => {
      const p = screenPoint(point);
      if (index) context.lineTo(p.x, p.y);
      else context.moveTo(p.x, p.y);
    });
    context.stroke();
    context.restore();
  }

  function drawSelf() {
    if (!self) return;
    const p = screenPoint(self);
    context.save();
    context.translate(p.x, p.y);
    context.rotate(-(self.ry || 0));
    context.shadowColor = '#ffe277';
    context.shadowBlur = 8;
    context.fillStyle = '#fff5ba';
    context.strokeStyle = '#7b390b';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, -12);
    context.lineTo(8, 9);
    context.lineTo(0, 6);
    context.lineTo(-8, 9);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  function draw() {
    if (!raster || sheet.hidden) return;
    resize();
    const rect = viewport.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#10241c';
    context.fillRect(0, 0, rect.width, rect.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(background, view.x, view.y, raster.width * view.scale, raster.height * view.scale);
    drawDecor(getWorld());
    drawRoute();
    const occupied = [];
    for (const point of points) labelPoint(point, selected?.id === point.id, occupied);
    drawSelf();
    drawCount += 1;
  }

  function label() {
    title.textContent = `🗺️ ${t('map.title')}`;
    close.setAttribute('aria-label', t('close'));
    zoomOut.setAttribute('aria-label', t('map.zoomOut'));
    zoomIn.setAttribute('aria-label', t('map.zoomIn'));
    locate.setAttribute('aria-label', t('map.center'));
    fit.setAttribute('aria-label', t('map.fit'));
    navigate.textContent = `🧭 ${t('map.navigate')}`;
    quick.textContent = `📍 ${t('map.go')}`;
    gpsStop.setAttribute('aria-label', t('map.stop'));
    loading.textContent = t('map.loading');
    renderCard();
    renderGps();
    draw();
  }

  function renderCard() {
    card.hidden = !selected;
    if (!selected) return;
    const state = explore.mapState();
    const here = state.place === selected.id || (state.self && Math.hypot(state.self.x - selected.x, state.self.z - selected.z) <= 2.5);
    cardName.textContent = `${selected.icon} ${t(`travel.${selected.id}`)}`;
    if (here) cardDistance.textContent = t('map.here');
    else if (!selectedRoute?.ok) cardDistance.textContent = t('map.unreachable');
    else cardDistance.textContent = t('map.distance', { m: Math.ceil(selectedRoute.length), s: Math.max(1, Math.ceil(selectedRoute.length / (getWorld()?.walk?.speed || 2.6))) });
    navigate.disabled = here || !selectedRoute?.ok;
    quick.disabled = here || !explore.canTravel();
  }

  function select(point) {
    selected = point;
    selectedRoute = explore.previewNavigation({ x: point.x, z: point.z }, { id: point.id });
    renderCard();
    draw();
  }

  function zoom(factor, center = null) {
    if (!raster) return;
    const rect = viewport.getBoundingClientRect();
    const pivot = center || { x: rect.width / 2, y: rect.height / 2 };
    const next = Math.min(fitScale * 4, Math.max(fitScale, view.scale * factor));
    const ratio = next / view.scale;
    view.x = pivot.x - (pivot.x - view.x) * ratio;
    view.y = pivot.y - (pivot.y - view.y) * ratio;
    view.scale = next;
    draw();
  }

  function pointAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let nearest = null;
    for (const point of points) {
      const screen = screenPoint(point);
      const distance = Math.hypot(screen.x - x, screen.y - y);
      if (!nearest || distance < nearest.distance) nearest = { point, distance };
    }
    return nearest?.distance <= 32 ? nearest.point : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, viewX: view.x, viewY: view.y, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: true };
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const rect = canvas.getBoundingClientRect();
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      if (gesture?.distance) zoom(distance / gesture.distance, center);
      gesture = { distance, scale: view.scale, viewX: view.x, viewY: view.y, center, moved: true };
      return;
    }
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 4) gesture.moved = true;
    view.x = gesture.viewX + dx;
    view.y = gesture.viewY + dy;
    draw();
  });
  const pointerEnd = (event) => {
    const tap = pointers.size === 1 && gesture && !gesture.moved;
    pointers.delete(event.pointerId);
    if (tap) {
      const point = pointAt(event.clientX, event.clientY);
      if (point) select(point);
      else {
        selected = null;
        selectedRoute = null;
        renderCard();
        draw();
      }
    }
    if (!pointers.size) gesture = null;
    else if (pointers.size === 1) {
      const [left] = pointers.values();
      gesture = { x: left.x, y: left.y, viewX: view.x, viewY: view.y, moved: true };
    }
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 1.18 : 1 / 1.18, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });
  canvas.addEventListener('dblclick', (event) => {
    const rect = canvas.getBoundingClientRect();
    zoom(1.6, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
  zoomOut.addEventListener('click', () => zoom(1 / 1.25));
  zoomIn.addEventListener('click', () => zoom(1.25));
  locate.addEventListener('click', locateSelf);
  fit.addEventListener('click', fitMap);

  function setOpen(on) {
    sheet.hidden = !on;
    stage.classList.toggle('map-open-now', on);
    if (on) {
      const world = getWorld();
      if (!world?.walk || !explore.active || explore.mapBlocked()) {
        sheet.hidden = true;
        stage.classList.remove('map-open-now');
        showToast(t(explore.active && explore.mapBlocked() ? 'map.busyHideSeek' : 'phone.only3d'));
        return;
      }
      loading.hidden = false;
      requestAnimationFrame(() => {
        raster = buildMapRaster(world, { cell: 0.5 });
        background = rasterCanvas(raster);
        points = mapPoints(world, travel);
        self = explore.mapState().self;
        loading.hidden = true;
        fitMap();
      });
    }
  }
  close.addEventListener('click', () => setOpen(false));
  sheet.addEventListener('pointerdown', (event) => {
    if (event.target === sheet) setOpen(false);
  });
  navigate.addEventListener('click', () => {
    if (!selected) return;
    const result = explore.navigateTo({ x: selected.x, z: selected.z }, { id: selected.id });
    if (!result.ok) showToast(t('map.noRoute'));
    else setOpen(false);
  });
  quick.addEventListener('click', () => {
    if (!selected || !explore.canTravel()) return;
    explore.goTo(selected.id);
    setOpen(false);
  });
  gpsStop.addEventListener('click', () => explore.stopNavigation('stopped'));

  function renderGps() {
    gps.hidden = !currentNav || currentNav.status !== 'active';
    if (gps.hidden) return;
    gpsName.textContent = t(`travel.${currentNav.id}`);
    gpsDistance.textContent = t('map.walk', { m: Math.max(0, Math.ceil(currentNav.remaining)) });
  }

  explore.onNavigation((state) => {
    currentNav = state;
    renderGps();
    if (!sheet.hidden && raster) draw();
    if (state.status === 'arrived') showToast(t('map.arrived', { place: t(`travel.${state.id}`) }));
    else if (state.status === 'failed') showToast(t('map.noRoute'));
  });

  function syncStage() {
    const concealed = stage.classList.contains('eyes-closed') || stage.classList.contains('hs-clean') || stage.classList.contains('hs-blinded');
    explore.setRouteHidden(concealed);
    if (stage.classList.contains('hs-locked') && !sheet.hidden) setOpen(false);
  }
  new MutationObserver(syncStage).observe(stage, { attributes: true, attributeFilter: ['class'] });
  new ResizeObserver(() => {
    if (!sheet.hidden && raster) fitMap();
  }).observe(viewport);

  let lastPose = null;
  setInterval(() => {
    const next = explore.mapState().self;
    if (!next) return;
    const changed = !lastPose || Math.hypot(next.x - lastPose.x, next.z - lastPose.z) > 0.05 || Math.abs(next.ry - lastPose.ry) > 0.04;
    self = next;
    if (changed && !sheet.hidden && raster) draw();
    if (changed) lastPose = { ...next };
  }, 200);

  onLangChange(label);
  label();
  syncStage();
  return {
    open: () => setOpen(true), close: () => setOpen(false),
    get isOpen() { return !sheet.hidden; },
    debug() { return { raster: raster && { width: raster.width, height: raster.height, cell: raster.cell, buildMs: raster.buildMs }, drawCount, selected: selected?.id || null, navigation: currentNav }; },
  };
}

