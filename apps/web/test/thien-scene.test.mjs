import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THIEN_RULES } from '@chanh-dien/room-rules';
import { limitThienScene } from '../public/thien-scene.js';

test('số bồ đoàn 2D và 3D cùng lấy từ cấu hình phòng', () => {
  const source = JSON.parse(readFileSync(new URL('../../../scenes/thien-default/scene.json', import.meta.url), 'utf8'));
  const scene = limitThienScene(source, THIEN_RULES.seats);
  assert.equal(scene.seats.length, THIEN_RULES.seats);
  assert.equal(scene.world.seats.length, THIEN_RULES.seats);
  assert.deepEqual(scene.world.seats.map((seat) => seat.id), scene.seats.map((seat) => seat.id));
  assert.equal(source.seats.length, 20, 'không sửa scene nguồn có 20 vị trí tối đa');
});
