import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortByDepth } from '../src/index.mjs';

test('sortByDepth vẽ vật ở xa trước và không sửa mảng đầu vào', () => {
  const input = [{ id: 'front', y: 20 }, { id: 'back', y: 10 }];
  assert.deepEqual(sortByDepth(input).map((item) => item.id), ['back', 'front']);
  assert.deepEqual(input.map((item) => item.id), ['front', 'back']);
});
