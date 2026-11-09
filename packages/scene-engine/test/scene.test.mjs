import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  cameraRegion,
  cameraTransform,
  generateSeats,
  hitTestSeat,
  layoutBubbles,
  resolveScene,
  seatFillOrder,
  stageToView,
  truncateBubble,
  validateScene,
  viewToStage,
} from '../src/index.mjs';

const SCENES_DIR = path.resolve(import.meta.dirname, '../../../scenes');
const loadScene = (id) => JSON.parse(readFileSync(path.join(SCENES_DIR, id, 'scene.json'), 'utf8'));

test('hai cảnh có sẵn hợp lệ; Cinema khớp 100 ghế S-1…S-100 của room rules', () => {
  for (const id of ['cinema-default', 'thien-default']) assert.deepEqual(validateScene(loadScene(id)), { ok: true, errors: [] });
  const cinema = resolveScene(loadScene('cinema-default'));
  const ids = new Set(cinema.seats.map((seat) => seat.id));
  assert.equal(ids.size, 100);
  for (let index = 1; index <= 100; index += 1) assert.ok(ids.has(`S-${index}`));
  assert.equal(resolveScene(loadScene('thien-default')).seats.length, 20);
  const thien = loadScene('thien-default');
  assert.deepEqual(thien.ceremony.officiants.map((item) => item.role).sort(), ['bell', 'teacher', 'woodenFish']);
  assert.deepEqual(thien.seats.filter((seat) => seat.cushion).map((seat) => seat.id), ['S-19', 'S-20'], 'bồ đoàn không có trong tranh (giữa lối đi) được vẽ bằng code; S-17, S-18 ngồi lên bồ đoàn mép tranh');
  const wrong = { ...thien, seats: thien.seats.map((seat) => (seat.id === 'S-19' ? { ...seat, cushion: 'yes' } : seat)) };
  assert.ok(validateScene(wrong).errors.some((error) => error.includes('cushion')));
  const missingOfficiant = { ...thien, ceremony: { officiants: thien.ceremony.officiants.slice(0, 2) } };
  assert.ok(validateScene(missingOfficiant).errors.some((error) => error.includes('đủ 3 vị')));
});

test('ghế sinh theo phối cảnh: hàng gần to hơn, rộng hơn, có lối đi giữa', () => {
  const seats = generateSeats({
    rows: 3, columns: 4, yBack: 100, yFront: 300, halfWidthBack: 100, halfWidthFront: 200,
    scaleBack: 0.5, scaleFront: 1, aisleGap: 0.2, centerX: 500,
  });
  assert.equal(seats.length, 12);
  const back = seats.filter((seat) => seat.row === 0);
  const front = seats.filter((seat) => seat.row === 2);
  assert.ok(front[0].scale > back[0].scale);
  assert.ok(front[3].x - front[0].x > back[3].x - back[0].x);
  assert.ok(back[2].x - back[1].x > back[1].x - back[0].x, 'khoảng giữa hai ghế cạnh lối đi phải rộng hơn');
  assert.deepEqual(seatFillOrder(seats, 500).slice(0, 2).map((seat) => seat.row), [2, 2]);
});

test('validateScene bắt lỗi cấu hình hay gặp', () => {
  const scene = loadScene('cinema-default');
  const broken = {
    ...scene,
    id: 'Bad Id',
    screen: { x: 0, y: 0, width: 2000, height: 100 },
    background: { type: 'image', src: '../secret.png' },
    seatLayout: undefined,
    seats: [
      { id: 'S-1', x: 100, y: 1000, scale: 1 },
      { id: 'S-1', x: 200, y: 1000, scale: 1 },
      { id: 'S-3', x: 300, y: 1500, scale: 0.5 },
    ],
  };
  const { ok, errors } = validateScene(broken);
  assert.equal(ok, false);
  for (const fragment of ['id không hợp lệ', 'screen nằm ngoài stage', 'background.src', 'trùng id ghế S-1', 'gần hơn nhưng nhỏ hơn']) {
    assert.ok(errors.some((error) => error.includes(fragment)), `thiếu lỗi: ${fragment}\n${errors.join('\n')}`);
  }
  assert.equal(validateScene({ ...scene, seats: [] }).ok, false, 'không được có cả seats lẫn seatLayout');
});

test('camera contain thấy trọn vùng; đổi qua lại sân khấu ↔ khung nhìn khớp nhau', () => {
  const scene = resolveScene(loadScene('cinema-default'));
  const viewport = { width: 390, height: 844 };
  const overview = cameraTransform(scene, cameraRegion(scene, 'overview'), viewport);
  assert.ok(Math.abs(overview.scale - 390 / 1080) < 1e-9);
  assert.ok(overview.offsetY > 0, 'màn dọc cao hơn 9:16 thì cảnh nằm giữa theo chiều dọc');

  const seat = scene.seats.find((item) => item.id === 'S-55');
  const region = cameraRegion(scene, 'seat', seat);
  assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= 1080 && region.y + region.height <= 1920);
  const transform = cameraTransform(scene, region, viewport);
  const view = stageToView(seat, transform);
  assert.ok(view.x > 0 && view.x < viewport.width && view.y > 0 && view.y < viewport.height, 'ghế của tôi phải nằm trong khung');
  const back = viewToStage(view, transform);
  assert.ok(Math.abs(back.x - seat.x) < 1e-6 && Math.abs(back.y - seat.y) < 1e-6);
  assert.deepEqual(cameraRegion(scene, 'seat', null), scene.cameras.overview, 'chưa có ghế thì về toàn cảnh');
});

test('bấm vào người hoặc lưng ghế chọn đúng ghế, ưu tiên ghế gần camera', () => {
  const scene = resolveScene(loadScene('cinema-default'));
  const seat = scene.seats.find((item) => item.id === 'S-45');
  assert.equal(hitTestSeat(scene, { x: seat.x, y: seat.y - 30 * seat.scale }, { occupied: new Set(['S-45']) })?.id, 'S-45');
  assert.equal(hitTestSeat(scene, { x: seat.x, y: seat.y - 10 * seat.scale })?.id, 'S-45', 'ghế trống: chạm vào chỗ ngồi');
  assert.equal(hitTestSeat(scene, { x: 540, y: 300 }), null, 'bấm vào màn chiếu không chọn ghế');
});

test('bong bóng: mới nhất trước, mỗi người một cái, không đè màn chiếu, không đè nhau', () => {
  const scene = resolveScene(loadScene('cinema-default'));
  const now = 100_000;
  const bubbles = [];
  for (const seat of scene.seats) bubbles.push({ participantId: `u-${seat.id}`, seatId: seat.id, text: `Xin chào ${seat.id}`, at: now - 1_000 });
  bubbles.push({ participantId: 'u-S-1', seatId: 'S-1', text: 'tin mới hơn', at: now - 10 });
  bubbles.push({ participantId: 'u-old', seatId: 'S-2', text: 'hết hạn', at: now - 7_000 });
  const placed = layoutBubbles(scene, bubbles, now);
  assert.ok(placed.length > 0 && placed.length <= 18);
  assert.equal(placed[0].text, 'tin mới hơn');
  assert.ok(!placed.some((item) => item.text === 'hết hạn'));
  assert.equal(new Set(placed.map((item) => item.participantId)).size, placed.length);
  const screen = scene.screen;
  for (const item of placed) {
    assert.ok(item.y >= screen.y + screen.height || item.x + item.width < screen.x || item.x > screen.x + screen.width, 'đè màn chiếu');
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const [a, b] = [placed[i], placed[j]];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlap, false, `${a.participantId} đè ${b.participantId}`);
    }
  }
});

test('bong bóng cắt chữ theo ký tự Unicode và gom khoảng trắng', () => {
  assert.equal(truncateBubble('  Xin   chào  '), 'Xin chào');
  const long = 'Đoạn phim này thật sự quá hay luôn mọi người ơi 🎬🎬🎬';
  const cut = truncateBubble(long);
  assert.equal([...cut].length, 40);
  assert.ok(cut.endsWith('…'));
});

test('vùng chạm phủ cả mép bồ đoàn và đủ to cho ngón tay trên màn nhỏ', () => {
  const scene = resolveScene(loadScene('thien-default'));
  for (const id of ['S-1', 'S-5', 'S-8', 'S-9', 'S-12', 'S-16']) {
    const seat = scene.seats.find((item) => item.id === id);
    const cushionHalf = 192 * seat.scale * 0.45;
    for (const dx of [-cushionHalf, cushionHalf]) {
      assert.equal(hitTestSeat(scene, { x: seat.x + dx, y: seat.y - 20 * seat.scale })?.id, id, `${id} mép ${dx > 0 ? 'phải' : 'trái'}`);
    }
  }
  // Điện thoại 390 px: 1 px màn hình ≈ 2,8 đơn vị sân khấu; chạm lệch 20 px vẫn trúng bồ đoàn hàng sau cùng.
  const back = scene.seats.find((item) => item.id === 'S-1');
  const stagePerPx = 1080 / 390;
  assert.equal(hitTestSeat(scene, { x: back.x + 20 * stagePerPx, y: back.y - 10 }, { minRadius: 24 * stagePerPx })?.id, 'S-1');

  // Có người ngồi S-5 (hàng trước) thì thân người đó che mép trái bồ đoàn S-1: chạm vào đó là chạm người S-5.
  const edge = { x: back.x - 192 * back.scale * 0.45, y: back.y - 20 * back.scale };
  assert.equal(hitTestSeat(scene, edge, { occupied: new Set(['S-5']) })?.id, 'S-5');
  assert.equal(hitTestSeat(scene, edge, { occupied: new Set(['S-1', 'S-5']) })?.id, 'S-5', 'người hàng trước nằm trên');
  const s1Head = { x: back.x, y: back.y - characterHeightOf(scene, back) * 0.9 };
  assert.equal(hitTestSeat(scene, s1Head, { occupied: new Set(['S-1', 'S-5']) })?.id, 'S-1', 'chạm đầu người S-1 vẫn trúng S-1');
});

test('ghế có người: chạm vào hai góc bồ đoàn dưới chân vẫn trúng', () => {
  const scene = resolveScene(loadScene('thien-default'));
  for (const seat of scene.seats) {
    for (const side of [-1, 1]) {
      const point = { x: seat.x + side * 192 * seat.scale * 0.4, y: seat.y - 25 * seat.scale };
      const occupied = new Set([seat.id]);
      assert.equal(hitTestSeat(scene, point, { occupied })?.id, seat.id, `${seat.id} góc ${side < 0 ? 'trái' : 'phải'}`);
    }
  }
});

function characterHeightOf(scene, seat) {
  return scene.characters.height * seat.scale;
}

test('chánh điện: lấp kín bề ngang trên màn dài/thấp, cắt trần nhà, luôn thấy từ tượng Phật tới hàng bồ đoàn cuối', () => {
  const scene = resolveScene(loadScene('thien-default'));
  const region = cameraRegion(scene, 'overview');
  const focus = region.focus;
  // iPhone Pro Max (thanh trên 50 px, dải nút 127 px), có và không có thanh địa chỉ Safari; iPhone thường.
  for (const viewport of [
    { width: 440, height: 956, insetTop: 50, insetBottom: 127 },
    { width: 440, height: 830, insetTop: 50, insetBottom: 127 },
    { width: 390, height: 664, insetTop: 46, insetBottom: 118 },
  ]) {
    const label = `${viewport.width}×${viewport.height}`;
    const transform = cameraTransform(scene, region, viewport);
    const at = (x, y) => stageToView({ x, y }, transform);
    assert.ok(at(0, 0).x <= 0.5 && at(1080, 0).x >= viewport.width - 0.5, `ảnh phủ kín bề ngang, không hở hai bên ${label}`);
    assert.ok(at(focus.x0, 0).x >= -0.5 && at(focus.x1, 0).x <= viewport.width + 0.5, `thấy trọn bồ đoàn ngoài cùng ${label}`);
    assert.ok(at(0, focus.y0).y >= viewport.insetTop - 0.5, `đỉnh focus dưới thanh trên ${label}`);
    assert.ok(at(0, focus.y1).y <= viewport.height - viewport.insetBottom + 0.5, `bồ đoàn cuối trên dải nút ${label}`);
    assert.ok(at(0, 0).y <= viewport.insetTop + 0.5 && at(0, 1920).y >= viewport.height - viewport.insetBottom - 0.5, `phần hở (nếu có) nằm sau thanh ${label}`);
  }
  // Khung quá thấp (máy tính nằm ngang): co lại cho vừa focus, hở hai bên nhưng ít hơn khi thấy cả ảnh.
  const wide = cameraTransform(scene, region, { width: 900, height: 500 });
  assert.ok(Math.abs(wide.scale - 500 / (focus.y1 - focus.y0)) < 1e-9);
  assert.ok(wide.scale > 500 / 1920);
  for (const offset of [stageToView({ x: 0, y: focus.y0 }, wide).y, 500 - stageToView({ x: 0, y: focus.y1 }, wide).y]) assert.ok(offset >= -0.5);
});

test('tượng Phật ngồi chính giữa không bị tượng GLB tải trễ thay thế', () => {
  const shrine = loadScene('thien-default').world?.statues?.shrine ?? [];
  assert.equal(shrine.some((item) => item.replaces === 'buddha'), false);
  assert.deepEqual(shrine.map((item) => item.id), ['dia-tang', 'quan-am']);
});
