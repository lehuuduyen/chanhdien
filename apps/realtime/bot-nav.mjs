// Bản đồ đi lại cho bot ngoài sân (chỉ máy realtime): đọc world.walk + world.courtyard của scene JSON, dựng lưới
// CELL m một lần mỗi scene (ô nào đứng được với thân người BODY m), tìm đường A* rồi rút gọn thành đoạn thẳng.
// Bot vì vậy đi khắp sân như người chơi (vòng qua tượng, hồ, hàng rào) thay vì chỉ đi một vòng cố định trên lối giữa.
// Điểm "đáng tới" (ghế đá, bờ hồ, đài phun, bồ đề, Quan Âm, La Hán, khu thú cưng, cổng) cũng lấy từ dữ liệu scene,
// engine không chứa tọa độ riêng của phòng nào.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWalkable } from '@chanh-dien/scene-engine/walk';

const CELL = 0.5;
// Ô lưới "đi được" khi tâm ô cách vật cản BODY m. Điểm bất kỳ trong ô cách tâm tối đa nửa đường chéo (0,35 m), nên
// đi trên các ô này luôn cách vật cản ≥ 0,3 m, rộng hơn thân người chơi (0,25 m): bot không lấn vào tượng / hàng rào.
const BODY = 0.65;
const SCENES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scenes');
const cache = new Map();

// Bản đồ của một scene theo id (đọc scenes/<id>/scene.json một lần). Không có scene / không có sân thì null.
export function botNavFor(sceneId) {
  if (!cache.has(sceneId)) {
    let nav = null;
    try {
      const scene = JSON.parse(readFileSync(path.join(SCENES_DIR, sceneId, 'scene.json'), 'utf8'));
      nav = createBotNav(scene.world);
    } catch (error) {
      console.warn(`Bot không có bản đồ đi lại cho scene ${sceneId}: ${error.message}`);
    }
    cache.set(sceneId, nav);
  }
  return cache.get(sceneId);
}

const local = (item, x, z) => {
  const ry = item.ry || 0;
  return { x: item.x + x * Math.cos(ry) + z * Math.sin(ry), z: item.z - x * Math.sin(ry) + z * Math.cos(ry) };
};

export function createBotNav(world) {
  const walk = world?.walk;
  const yard = world?.courtyard;
  if (!walk?.bounds || !yard) return null;
  // Chỉ ngoài sân: trong chánh điện bot ngồi bồ đoàn, không đi lại.
  const minZ = (world.hall?.front ?? walk.bounds.z[0]) + 0.6;
  const x0 = walk.bounds.x[0];
  const z0 = Math.max(walk.bounds.z[0], minZ);
  const columns = Math.floor((walk.bounds.x[1] - x0) / CELL) + 1;
  const rows = Math.floor((walk.bounds.z[1] - z0) / CELL) + 1;
  const body = { ...walk, radius: BODY };
  // Trong Vườn Công Đức lối đi hẹp giữa các luống: bot chỉ vào vườn khi làm vườn (tuyến riêng), không đi dạo trong đó.
  const fence = (yard.garden?.fence || []).flat();
  const gardenBox = fence.length ? {
    x: [Math.min(...fence.filter((_, index) => index % 2 === 0)), Math.max(...fence.filter((_, index) => index % 2 === 0))],
    z: [Math.min(...fence.filter((_, index) => index % 2 === 1)), Math.max(...fence.filter((_, index) => index % 2 === 1))],
  } : null;
  const inGarden = (x, z) => gardenBox && x > gardenBox.x[0] - 0.3 && x < gardenBox.x[1] + 0.3 && z > gardenBox.z[0] - 0.3 && z < gardenBox.z[1] + 0.3;
  const mask = new Uint8Array(columns * rows);
  const open = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = x0 + column * CELL;
      const z = z0 + row * CELL;
      if (!inGarden(x, z) && isWalkable(body, x, z)) {
        mask[row * columns + column] = 1;
        open.push(row * columns + column);
      }
    }
  }
  // Chỉ giữ vùng nối liền với chỗ rộng nhất của sân (tránh ô trống bị kẹt kín giữa vật cản: bot tới đó rồi kẹt).
  {
    const label = new Int32Array(columns * rows).fill(-1);
    let biggest = -1;
    let biggestSize = 0;
    for (const seed of open) {
      if (label[seed] !== -1) continue;
      const stack = [seed];
      label[seed] = seed;
      let size = 0;
      while (stack.length) {
        const key = stack.pop();
        size += 1;
        const column = key % columns;
        const row = Math.floor(key / columns);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = column + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
          const next = r * columns + c;
          if (mask[next] === 1 && label[next] === -1) {
            label[next] = seed;
            stack.push(next);
          }
        }
      }
      if (size > biggestSize) {
        biggest = seed;
        biggestSize = size;
      }
    }
    for (let index = 0; index < mask.length; index += 1) if (mask[index] && label[index] !== biggest) mask[index] = 0;
    open.splice(0, open.length, ...open.filter((index) => mask[index] === 1));
  }
  const cellOf = (point) => [Math.round((point.x - x0) / CELL), Math.round((point.z - z0) / CELL)];
  const free = (column, row) => column >= 0 && row >= 0 && column < columns && row < rows && mask[row * columns + column] === 1;
  const cellFree = (point) => free(...cellOf(point));
  // Điểm bất kỳ (chỗ đứng, bước tránh người): ô lưới phải thuộc vùng đi được và chính điểm đó cách vật cản đủ thân
  // người (ô gần nhất có thể lệch tới nửa ô, ra ngoài mép sân / sát tượng).
  const precise = { ...walk, radius: 0.3 };
  const walkable = (point) => cellFree(point) && !inGarden(point.x, point.z) && isWalkable(precise, point.x, point.z);
  const pointOf = (index) => ({ x: x0 + (index % columns) * CELL, z: z0 + Math.floor(index / columns) * CELL });

  // Đoạn thẳng a → b không đi qua ô bị chặn (lấy mẫu mỗi CELL / 2).
  function clear(a, b) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2)));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      if (!cellFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  // Ô trống gần nhất quanh một điểm (điểm sát vật cản / lệch ra ngoài).
  function nearestFree(point, reach = 6) {
    const [column, row] = cellOf(point);
    let best = null;
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        if (!free(column + dc, row + dr)) continue;
        const distance = Math.hypot(dc, dr);
        if (!best || distance < best.distance) best = { column: column + dc, row: row + dr, distance };
      }
    }
    return best ? [best.column, best.row] : null;
  }

  // Tuyến đi from → to: danh sách điểm (không gồm from), đã rút gọn; [] nếu không tới được.
  function route(from, to) {
    const start = free(...cellOf(from)) ? cellOf(from) : nearestFree(from);
    const goal = free(...cellOf(to)) ? cellOf(to) : nearestFree(to);
    if (!start || !goal) return [];
    const startKey = start[1] * columns + start[0];
    const goalKey = goal[1] * columns + goal[0];
    const cost = new Map([[startKey, 0]]);
    const parent = new Map();
    const heap = [[0, startKey]];
    const push = (item) => {
      heap.push(item);
      let index = heap.length - 1;
      while (index > 0) {
        const up = (index - 1) >> 1;
        if (heap[up][0] <= item[0]) break;
        heap[index] = heap[up];
        index = up;
      }
      heap[index] = item;
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        let index = 0;
        for (;;) {
          const left = index * 2 + 1;
          if (left >= heap.length) break;
          const child = left + 1 < heap.length && heap[left + 1][0] < heap[left][0] ? left + 1 : left;
          if (heap[child][0] >= last[0]) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return top;
    };
    const closed = new Set();
    const goalColumn = goal[0];
    const goalRow = goal[1];
    let found = false;
    while (heap.length) {
      const [, key] = pop();
      if (closed.has(key)) continue;
      closed.add(key);
      if (key === goalKey) {
        found = true;
        break;
      }
      const column = key % columns;
      const row = Math.floor(key / columns);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dc && !dr) continue;
          if (!free(column + dc, row + dr)) continue;
          // Không cắt góc vật cản.
          if (dc && dr && (!free(column + dc, row) || !free(column, row + dr))) continue;
          const next = (row + dr) * columns + column + dc;
          const g = cost.get(key) + (dc && dr ? Math.SQRT2 : 1);
          if (g >= (cost.get(next) ?? Infinity)) continue;
          cost.set(next, g);
          parent.set(next, key);
          push([g + Math.hypot(goalColumn - column - dc, goalRow - row - dr), next]);
        }
      }
    }
    if (!found) return [];
    const cells = [];
    for (let key = goalKey; key !== undefined && key !== startKey; key = parent.get(key)) cells.push(pointOf(key));
    cells.reverse();
    // Rút gọn: từ điểm hiện tại nhảy tới điểm xa nhất còn nhìn thấy thẳng.
    const points = [];
    let anchor = { x: from.x, z: from.z };
    let index = 0;
    while (index < cells.length) {
      let far = index;
      for (let probe = cells.length - 1; probe > index; probe -= 1) {
        if (clear(anchor, cells[probe])) {
          far = probe;
          break;
        }
      }
      points.push(cells[far]);
      anchor = cells[far];
      index = far + 1;
    }
    // Đích thật (nếu đứng được) thay cho tâm ô cuối.
    if (points.length && walkable(to) && clear(points.length > 1 ? points.at(-2) : from, to)) points[points.length - 1] = { x: to.x, z: to.z };
    return points;
  }

  function randomPoint(random = Math.random) {
    return open.length ? pointOf(open[Math.floor(random() * open.length)]) : null;
  }

  // Điểm đáng tới: { kind, x, z, face?, bench? }. Chỉ giữ điểm đứng được.
  const spots = [];
  // Điểm sát vật cản (vd: trước ghế đá bên bờ hồ) thì lấy ô trống gần nhất trong vòng 1 m.
  const add = (kind, point, face, extra = {}) => {
    if (!point) return;
    let at = point;
    if (!walkable(at)) {
      const near = nearestFree(at, 2);
      if (!near) return;
      at = pointOf(near[1] * columns + near[0]);
    }
    spots.push({ kind, x: at.x, z: at.z, ...(face ? { face } : {}), ...extra });
  };
  const ring = (kind, center, radiusX, radiusZ, count) => {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      add(kind, { x: center.x + Math.cos(angle) * radiusX, z: center.z + Math.sin(angle) * radiusZ }, { x: center.x, z: center.z });
    }
  };
  for (const bench of yard.benches || []) {
    // Đứng trước ghế 0,95 m (như người chơi đi tới rồi mới ngồi); xích đu / cầu tuột có điểm chờ riêng (approach).
    const scale = bench.scale || 1;
    const [ax, az] = Array.isArray(bench.approach) ? bench.approach : [0, 0.95];
    add('bench', local(bench, ax * scale, az * scale), null, { bench: bench.id, ...(bench.kind ? { play: bench.kind } : {}) });
  }
  // Vườn Hoa: điểm ngắm trên lối sỏi, nhìn vào luống.
  for (const view of yard.flowerGarden?.views || []) add('flowers', { x: view.x, z: view.z }, view.face || null);
  if (yard.fountain) ring('fountain', yard.fountain, yard.fountain.radius + 1.6, yard.fountain.radius + 1.6, 10);
  if (yard.pond) ring('pond', yard.pond, yard.pond.radiusX + 1.3, yard.pond.radiusZ + 1.3, 16);
  if (yard.bodhi) ring('bodhi', yard.bodhi, 4.4, 4.4, 8);
  if (yard.burner) ring('burner', yard.burner, 2.2, 2.2, 6);
  if (yard.guanyin) {
    // Đứng trước tượng Quan Âm, trong vòng hàng rào, nhìn vào tượng.
    for (const side of [-1.2, 0, 1.2]) add('guanyin', local(yard.guanyin, side, 4.2), { x: yard.guanyin.x, z: yard.guanyin.z });
  }
  for (const arhat of yard.arhats || []) add('arhat', local(arhat, 0, 1.9), { x: arhat.x, z: arhat.z });
  const pets = yard.petZone?.area;
  if (pets) {
    for (let index = 0; index < 10; index += 1) {
      add('pets', { x: pets.x[0] + 2 + ((index * 7) % 10) / 10 * (pets.x[1] - pets.x[0] - 4), z: pets.z[0] + 2 + (index / 10) * (pets.z[1] - pets.z[0] - 4) });
    }
  }
  // Nông trại nhỏ: cùng loại điểm với khu thú cưng (đứng xem thú một lúc rồi đi tiếp).
  const farm = yard.farmZone?.area;
  if (farm) {
    for (let index = 0; index < 8; index += 1) {
      add('pets', { x: farm.x[0] + 1.6 + ((index * 5) % 8) / 8 * (farm.x[1] - farm.x[0] - 3.2), z: farm.z[0] + 2 + (index / 8) * (farm.z[1] - farm.z[0] - 4) });
    }
  }
  if (yard.gate?.z) for (const x of [-2, 0, 2]) add('gate', { x, z: yard.gate.z - 3 }, { x, z: yard.gate.z });
  const entry = yard.gate?.z ? (() => {
    const at = nearestFree({ x: 0, z: yard.gate.z - 1.5 });
    return at ? pointOf(at[1] * columns + at[0]) : null;
  })() : null;

  // Chỗ trốn cho bot chơi trốn tìm: ô đi được mà quanh nó (bán kính COVER_REACH ô) có nhiều ô bị chặn — sát bụi cây,
  // hàng rào, gốc cây, tượng. Tính một lần khi cần (vài chục nghìn ô).
  const COVER_REACH = 3;
  let covered = null;
  function coverCells() {
    if (covered) return covered;
    covered = [];
    for (const index of open) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      let blocked = 0;
      for (let dr = -COVER_REACH; dr <= COVER_REACH; dr += 1) {
        for (let dc = -COVER_REACH; dc <= COVER_REACH; dc += 1) {
          const c = column + dc;
          const r = row + dr;
          if (c >= 0 && r >= 0 && c < columns && r < rows && mask[r * columns + c] === 0) blocked += 1;
        }
      }
      // Kẹt giữa vật cản quá (≥ 70%) thường là khe hở bot khó tới; quá thoáng thì không phải chỗ trốn.
      if (blocked >= 14 && blocked <= 34) covered.push({ ...pointOf(index), cover: blocked });
    }
    return covered;
  }
  // count chỗ trốn cách base trong [minDistance, maxDistance], cách nhau ≥ spacing; ưu tiên chỗ che chắn nhiều.
  function hideSpots(base, count, { minDistance = 10, maxDistance = 45, spacing = 6, random = Math.random } = {}) {
    const pool = coverCells()
      .filter((spot) => {
        const distance = Math.hypot(spot.x - base.x, spot.z - base.z);
        return distance >= minDistance && distance <= maxDistance;
      })
      .map((spot) => ({ spot, key: spot.cover + random() * 12 }))
      .sort((a, b) => b.key - a.key)
      .map((item) => item.spot);
    const picked = [];
    for (const spot of pool) {
      if (picked.length >= count) break;
      if (picked.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= spacing)) picked.push({ x: spot.x, z: spot.z });
    }
    return picked;
  }

  return { cell: CELL, columns, rows, walkable, clear, route, randomPoint, spots, entry, openCount: open.length, hideSpots };
}
