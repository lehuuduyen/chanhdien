import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { resolveScene } from '../src/index.mjs';
import {
  cameraPose, fitWindow, floorHeight, isWalkable, nearestSeat, offAxisFrustum, pathToSeat, theaterCouples, screenBox, slideMove, theaterSeats, validateTheater, windowToPixels,
} from '../src/theater.mjs';

const scene = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../scenes/cinema-default/scene.json'), 'utf8'));
const seats = theaterSeats(scene);

test('rạp 3D: đủ ghế khớp id cảnh 2D, hàng sau cao hơn và xa màn hơn', () => {
  assert.deepEqual(validateTheater(scene), { ok: true, errors: [] });
  assert.deepEqual(seats.map((seat) => seat.id).sort(), resolveScene(scene).seats.map((seat) => seat.id).sort());
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  // S-1 ở hàng cuối bên trái (nhìn về màn chiếu), S-100 ở hàng đầu bên phải.
  assert.ok(byId.get('S-1').z > byId.get('S-100').z && byId.get('S-1').y > byId.get('S-100').y);
  assert.ok(byId.get('S-1').x < 0 && byId.get('S-100').x > 0);
  // Ghế cạnh nhau trong một hàng không chồng lên nhau (hai ghế cùng một sofa ghế đôi thì xích lại gần nhau).
  for (const row of [seats.slice(0, 10), seats.slice(90, 100)]) {
    for (let index = 1; index < row.length; index += 1) {
      const sameSofa = row[index].couple && row[index].couple.id === row[index - 1].couple?.id;
      assert.ok(row[index].x - row[index - 1].x >= (sameSofa ? 0.6 : 0.7), `${row[index - 1].id}–${row[index].id}`);
    }
  }
});

test('bắt lỗi bố cục rạp sai', () => {
  const broken = { ...scene, theater3d: { ...scene.theater3d, seating: { ...scene.theater3d.seating, seatSpacing: 0.4 }, hall: { ...scene.theater3d.hall, x: [-2, 2] } } };
  const { ok, errors } = validateTheater(broken);
  assert.equal(ok, false);
  assert.ok(errors.some((error) => error.includes('0,6 m')));
  assert.ok(errors.some((error) => error.includes('ngoài khán phòng')));
});

test('khung nhìn giữ đúng tỷ lệ màn hình: màn dọc kéo dài xuống dưới, màn ngang nới hai bên', () => {
  const window = { x: [-5, 5], y: [0, 5] };
  const portrait = fitWindow(window, 9 / 16);
  assert.deepEqual(portrait.x, [-5, 5]);
  assert.equal(portrait.y[1], 5);
  assert.ok(Math.abs((portrait.x[1] - portrait.x[0]) / (portrait.y[1] - portrait.y[0]) - 9 / 16) < 1e-9);
  const wide = fitWindow(window, 3);
  assert.deepEqual(wide.y, [0, 5]);
  assert.ok(Math.abs(wide.x[0] + 7.5) < 1e-9 && Math.abs(wide.x[1] - 7.5) < 1e-9);
});

test('mọi góc nhìn thẳng màn chiếu đều thấy trọn màn chiếu, khung player ≥ 200 px trên điện thoại', () => {
  const screen = screenBox(scene.theater3d);
  for (const [width, height] of [[390, 664], [440, 779], [1100, 760]]) {
    for (const [id, seatId] of [['overview'], ['screen'], ['zoom'], ['seat', 'S-1'], ['seat', 'S-100'], ['seat', 'S-55']]) {
      const pose = cameraPose(scene, seats, id, seatId, width / height);
      assert.equal(pose.kind, 'window');
      const rect = windowToPixels(screen, pose.window, width, height);
      assert.ok(rect.x >= -0.5 && rect.y >= -0.5 && rect.x + rect.width <= width + 0.5 && rect.y + rect.height <= height + 0.5, `${id} ${seatId ?? ''} ${width}×${height}`);
      assert.ok(rect.width >= 200 && Math.abs(rect.width / rect.height - 16 / 9) < 1e-6);
    }
  }
  // Camera ghế nhìn qua vai người ngồi ghế đó.
  const seat = seats.find((item) => item.id === 'S-55');
  const { eye, back } = scene.theater3d.cameras.seat;
  assert.deepEqual(cameraPose(scene, seats, 'seat', 'S-55', 1).position, [seat.x, seat.y + eye, seat.z + back]);
  assert.equal(cameraPose(scene, seats, 'audience', null, 0.6).kind, 'look');
});

test('frustum lệch tâm chiếu đúng khung lên mặt phẳng màn chiếu', () => {
  const position = [1, 2, 10];
  const window = { x: [-4, 6], y: [-1, 5] };
  const frustum = offAxisFrustum(position, window, 0.1);
  // Ở khoảng cách near = 0,1 m, khung thu nhỏ đúng tỷ lệ 0,1 / 10.
  assert.ok(Math.abs(frustum.left - -0.05) < 1e-12 && Math.abs(frustum.right - 0.05) < 1e-12);
  assert.ok(Math.abs(frustum.top - 0.03) < 1e-12 && Math.abs(frustum.bottom - -0.03) < 1e-12);
});

test('đi lại: từ cửa sau tới mọi ghế theo lối đi, không xuyên ghế; bậc cao dần về cuối rạp', () => {
  const spawn = scene.theater3d.walk.spawn;
  for (const seat of seats) {
    const path = [spawn, ...pathToSeat(scene, seats, spawn, seat.id)];
    assert.ok(path.length >= 3, seat.id);
    // Chia nhỏ từng đoạn 5 cm: mọi điểm trên đường đều đứng được.
    for (let index = 1; index < path.length; index += 1) {
      const [a, b] = [path[index - 1], path[index]];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
      for (let step = 0; step <= steps; step += 1) {
        const t = steps ? step / steps : 1;
        assert.ok(isWalkable(scene, seats, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), `${seat.id} đoạn ${index}`);
      }
    }
    assert.ok(Math.abs(path.at(-1).x - seat.x) < 1e-9, 'dừng ngay trước ghế');
  }
  assert.equal(floorHeight(scene, 2), 0);
  assert.ok(floorHeight(scene, 15.7) > floorHeight(scene, 8));
  // Đâm vào ghế thì đứng lại hoặc trượt, không đi xuyên.
  const seat = seats.find((item) => item.id === 'S-45');
  const next = slideMove(scene, seats, { x: seat.x, z: seat.z - 0.5 }, { x: seat.x, z: seat.z });
  assert.ok(isWalkable(scene, seats, next.x, next.z));
  assert.equal(isWalkable(scene, seats, 0, 0.5), false, 'không lên sân khấu');
});

test('camera nhân vật: thấy trọn màn chiếu và nửa trên nhân vật, kể cả đứng sát tường cuối', () => {
  const screen = screenBox(scene.theater3d);
  for (const self of [{ x: 0, z: 17.3 }, { x: 5.15, z: 9 }, { x: -1, z: 2 }]) {
    for (const aspect of [440 / 760, 1.4]) {
      const pose = cameraPose(scene, seats, 'follow', null, aspect, self);
      assert.equal(pose.kind, 'window');
      const rect = windowToPixels(screen, pose.window, 1000 * aspect, 1000);
      assert.ok(rect.x >= -0.5 && rect.x + rect.width <= 1000 * aspect + 0.5 && rect.y >= -0.5);
      assert.ok(pose.position[2] > self.z, 'camera sau lưng nhân vật');
    }
  }
});

test('đứng trong hàng ghế: đi dọc hàng cong không kẹt, tìm đường sang hàng khác qua lối đi, biết ghế ngay trước mặt', () => {
  const { legroom } = scene.theater3d.walk;
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  // Đi ngang 6 m trong khoảng để chân (hàng cong nên phải nhích dần theo z).
  let pos = { x: byId.get('S-45').x, z: byId.get('S-45').z - legroom };
  for (let step = 0; step < 200; step += 1) pos = slideMove(scene, seats, pos, { x: pos.x + 0.03, z: pos.z });
  assert.ok(pos.x > 4, `đi hết hàng, dừng ở x = ${pos.x}`);
  // Từ trong hàng S-41 sang ghế S-58 (hàng khác, bên kia lối giữa): đường ngắn qua lối giữa, mọi đoạn đi được.
  const from = { x: byId.get('S-43').x, z: byId.get('S-43').z - legroom };
  const path = [from, ...pathToSeat(scene, seats, from, 'S-58')];
  const length = path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.z - path[index].z), 0);
  assert.ok(length < 7, `đường ${length.toFixed(1)} m`);
  for (let index = 1; index < path.length; index += 1) {
    const [a, b] = [path[index - 1], path[index]];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
    for (let step = 0; step <= steps; step += 1) {
      const t = steps ? step / steps : 1;
      assert.ok(isWalkable(scene, seats, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
    }
  }
  // Lỡ đứng chỗ không hợp lệ thì vẫn bước ra được.
  const seat = byId.get('S-45');
  assert.deepEqual(slideMove(scene, seats, { x: seat.x, z: seat.z }, { x: seat.x, z: seat.z - 0.1 }), { x: seat.x, z: seat.z - 0.1 });
  assert.equal(nearestSeat(scene, seats, { x: seat.x, z: seat.z - legroom })?.id, 'S-45');
  assert.equal(nearestSeat(scene, seats, { x: seat.x, z: seat.z - legroom }, new Set(['S-45']))?.id !== 'S-45', true);
  assert.equal(nearestSeat(scene, seats, { x: 0, z: 17.3 }), null, 'đứng ở cửa sau: không có ghế ngay trước mặt');
});

test('xem ngang: điện thoại xoay ngang thì màn chiếu cao gần kín màn hình', () => {
  const screen = screenBox(scene.theater3d);
  for (const [width, height] of [[844, 390], [932, 430], [667, 375]]) {
    const pose = cameraPose(scene, seats, 'zoom', null, width / height);
    const rect = windowToPixels(screen, pose.window, width, height);
    assert.ok(rect.height >= height * 0.97, `${width}×${height}: cao ${rect.height.toFixed(0)}`);
    assert.ok(rect.x >= 0 && rect.x + rect.width <= width);
  }
});

test('ghế đôi: hai hàng cuối ghép từng cặp từ lối giữa ra, giữ nguyên id ghế; ghế sát tường vẫn là ghế đơn', () => {
  const couples = theaterCouples(seats);
  assert.equal(couples.length, 8);
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  for (const couple of couples) {
    const [a, b] = couple.seats.map((id) => byId.get(id));
    assert.equal(a.row, b.row);
    assert.ok(scene.theater3d.seating.couples.rows.includes(a.row));
    assert.equal(a.couple.partner, b.id);
    assert.ok(Math.abs(Math.abs(a.x - b.x) - scene.theater3d.seating.couples.spacing) < 0.01);
    // Mỗi ghế của sofa vẫn có chỗ đứng trước mặt để đi vào ngồi.
    for (const seat of [a, b]) assert.ok(isWalkable(scene, seats, seat.x, seat.z - scene.theater3d.walk.legroom), seat.id);
  }
  assert.equal(byId.get('S-1').couple, undefined);
  assert.equal(byId.get('S-10').couple, undefined);
  assert.equal(byId.get('S-50').couple, undefined, 'hàng giữa không có ghế đôi');
  assert.equal(seats.length, 100);
});
