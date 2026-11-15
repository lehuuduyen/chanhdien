import assert from 'node:assert/strict';
import test from 'node:test';
import { benchViewChanged } from '../src/explore3d.mjs';

test('camera ghế đá chỉ đặt lại khi đổi ghế hoặc đổi chỗ ngồi', () => {
  assert.equal(benchViewChanged({}, { benchId: 'B-1', benchSpot: 1 }), true, 'vừa ngồi xuống');
  assert.equal(benchViewChanged({ benchId: 'B-1', benchSpot: 1 }, { benchId: 'B-1', benchSpot: 1 }), false, 'snapshot lặp giữ góc ngắm');
  assert.equal(benchViewChanged({ benchId: 'B-1', benchSpot: 1 }, { benchId: 'B-1', benchSpot: 2 }), true, 'đổi đầu ghế');
  assert.equal(benchViewChanged({ benchId: 'B-1', benchSpot: 2 }, { benchId: 'B-2', benchSpot: 1 }), true, 'đổi ghế');
  assert.equal(benchViewChanged({ benchId: 'B-2', benchSpot: 1 }, {}), true, 'đứng dậy');
});
