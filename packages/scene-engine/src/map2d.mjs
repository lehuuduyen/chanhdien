// Dữ liệu bản đồ 2D của sân chùa. Không đụng DOM/canvas để Node test được và để UI tự chọn độ phân giải vẽ.
import { isWalkable } from './walk.mjs';
import { placeExtras, placeOf } from './places.mjs';

export const MAP_ZONES = Object.freeze([
  'courtyard', 'hall', 'flowers', 'garden', 'pets', 'farm', 'park', 'memorial', 'overlook', 'grove', 'myfarm', 'wishes', 'library',
]);

export const MAP_TRAVEL_ICONS = Object.freeze({
  hall: '🛕', courtyard: '🌳', overlook: '🌄', grove: '🌲', park: '🛝', flowers: '🌸',
  garden: '🌱', pets: '🐾', farm: '🐐', myfarm: '🌾', memorial: '🪦', library: '📚',
});

const cache = new WeakMap();
const inRect = (rect, x, z) => x >= rect.x[0] && x <= rect.x[1] && z >= rect.z[0] && z <= rect.z[1];

export function worldToMap(map, point) {
  return { x: (point.x - map.bounds.x[0]) / map.cell, y: (point.z - map.bounds.z[0]) / map.cell };
}

export function mapToWorld(map, point) {
  return { x: map.bounds.x[0] + point.x * map.cell, z: map.bounds.z[0] + point.y * map.cell };
}

export function rasterCellAt(map, point) {
  const mapped = worldToMap(map, point);
  const column = Math.min(map.width - 1, Math.max(0, Math.round(mapped.x)));
  const row = Math.min(map.height - 1, Math.max(0, Math.round(mapped.y)));
  return map.cells[row * map.width + column];
}

export function buildMapRaster(world, { cell = 0.5 } = {}) {
  if (!world?.walk) throw new TypeError('world.walk is required');
  if (!Number.isFinite(cell) || cell < 0.25 || cell > 2) throw new RangeError('map cell must be between 0.25 and 2 metres');
  let byCell = cache.get(world);
  if (!byCell) cache.set(world, (byCell = new Map()));
  if (byCell.has(cell)) return byCell.get(cell);

  const started = performance.now();
  const { walk } = world;
  const width = Math.ceil((walk.bounds.x[1] - walk.bounds.x[0]) / cell) + 1;
  const height = Math.ceil((walk.bounds.z[1] - walk.bounds.z[0]) / cell) + 1;
  const cells = new Uint8Array(width * height);
  const zoneIndex = new Map(MAP_ZONES.map((name, index) => [name, index + 2]));
  const extras = placeExtras(world);
  const insideAreas = (x, z) => inRect(walk.bounds, x, z)
    && (!walk.areas?.length || walk.areas.some((area) => inRect(area, x, z)));

  for (let row = 0; row < height; row += 1) {
    const z = Math.min(walk.bounds.z[1], walk.bounds.z[0] + row * cell);
    for (let column = 0; column < width; column += 1) {
      const x = Math.min(walk.bounds.x[1], walk.bounds.x[0] + column * cell);
      const index = row * width + column;
      if (!insideAreas(x, z)) cells[index] = 0;
      else if (!isWalkable(walk, x, z)) cells[index] = 1;
      else cells[index] = zoneIndex.get(placeOf(world, { x, z }, extras)) || 2;
    }
  }
  const result = {
    bounds: { x: [...walk.bounds.x], z: [...walk.bounds.z] }, cell, width, height, cells,
    cols: width, rows: height, origin: { x: walk.bounds.x[0], z: walk.bounds.z[0] },
    zones: [...MAP_ZONES], buildMs: performance.now() - started,
  };
  byCell.set(cell, result);
  return result;
}

export function mapPoints(world, travel = {}) {
  const extras = placeExtras(world);
  return Object.entries(travel).map(([id, point]) => ({
    id, icon: MAP_TRAVEL_ICONS[id] || '📍', x: point.x, z: point.z, ry: point.ry || 0,
    place: placeOf(world, point, extras), quick: true,
  }));
}

