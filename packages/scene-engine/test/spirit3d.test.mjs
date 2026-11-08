import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpirit, SPIRIT_SPECIES } from '../src/spirit3d.mjs';
import { SPIRIT_SPECIES as PROTOCOL_SPECIES } from '../../protocol/src/index.mjs';

test('linh thú: đủ 4 loài khớp protocol; loài lạ thì không dựng', () => {
  assert.deepEqual([...SPIRIT_SPECIES], [...PROTOCOL_SPECIES]);
  assert.equal(createSpirit({ species: 'dragon', level: 1 }), null);
  assert.equal(createSpirit(null), null);
});

test('linh thú đi theo sau lưng chủ, bay (cá chép, hạc) hoặc đi dưới đất (rùa, sư tử); cấp cao thêm trang trí', () => {
  for (const species of SPIRIT_SPECIES) {
    const low = createSpirit({ species, level: 1 });
    const high = createSpirit({ species, level: 10 });
    assert.ok(high.group.children.length >= low.group.children.length + 3, `${species}: cấp 10 có vòng sáng, đốm sáng, hào quang`);
    // Chủ đứng ở gốc, quay mặt về −z (ry = 0): linh thú ở phía +z (sau lưng).
    const owner = { x: 0, z: 0, ry: 0 };
    low.update(0.016, 0, owner);
    const fly = species === 'carp' || species === 'crane';
    if (fly) assert.ok(low.group.position.x > 0.6 && low.group.position.z <= 0, `${species} bay ngang vai, không che nhân vật`);
    else assert.ok(low.group.position.z > 0.4, `${species} đi sau lưng chủ`);
    // Chủ đi 3 m về phía trước: linh thú đuổi theo, sau 2 giây đã tới chỗ mới.
    const moved = { x: 0, z: -3, ry: 0 };
    for (let frame = 0; frame < 120; frame += 1) low.update(1 / 60, frame / 60, moved);
    const spot = fly ? { x: 0.7, z: -3.1 } : { x: 0.55, z: -2.2 };
    assert.ok(Math.hypot(low.group.position.x - spot.x, low.group.position.z - spot.z) < 0.6, `${species} theo kịp chủ`);
    // Chủ dịch chỗ xa (đi nhanh / chuyển khu): linh thú hiện ngay cạnh chủ.
    low.update(0.016, 3, { x: 40, z: 40, ry: 0 });
    assert.ok(Math.hypot(low.group.position.x - 40, low.group.position.z - 40) < 1.2, `${species} dịch theo chủ`);
    low.dispose();
    high.dispose();
  }
});
