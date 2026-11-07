// Chuẩn bị mô hình Khu vui chơi cho web: đọc nhanvat/park.glb (một khối liền: 2 bộ xích đu, tháp + cầu tuột, đu quay,
// thú nhún, khung leo, bụi cây, nền cam dày 0,25 m), cắt bỏ 4 ghế xích đu + dây (engine vẽ ghế riêng để đu theo người
// ngồi), rồi nén (texture webp 1024, meshopt) ra apps/web/public/models/park/park.glb. Chạy ở gốc repo:
//   node scripts/park-model.mjs
// In ra khung các ghế đã cắt (tọa độ trong mô hình) để đối chiếu với PARK_MODEL trong scripts/thien-garden-layout.mjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';

const SOURCE = 'nhanvat/park.glb';
const TARGET = 'apps/web/public/models/park/park.glb';
// Hộp chứa ghế + dây của từng bộ xích đu (tọa độ mô hình, m). Chân khung ở x −4,4 / −2,0 / −1,0 / 2,0 và xà ở
// y ≈ 2,3 nằm ngoài hộp.
const CUT = [
  { x: [-3.95, -2.45], y: [0.3, 2.2], z: [-4.45, -3.75] },
  { x: [-0.2, 1.62], y: [0.3, 2.2], z: [-4.45, -3.75] },
];

const io = new NodeIO();
const doc = await io.read(SOURCE);
const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const position = primitive.getAttribute('POSITION').getArray();
const indices = primitive.getIndices().getArray();
const inside = (box, x, y, z) => x >= box.x[0] && x <= box.x[1] && y >= box.y[0] && y <= box.y[1] && z >= box.z[0] && z <= box.z[1];
const kept = [];
const removed = CUT.map(() => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 }));
for (let index = 0; index < indices.length; index += 3) {
  const corners = [0, 1, 2].map((k) => indices[index + k]);
  const center = [0, 1, 2].map((axis) => corners.reduce((sum, v) => sum + position[v * 3 + axis], 0) / 3);
  const box = CUT.findIndex((item) => inside(item, ...center));
  if (box < 0) {
    kept.push(...corners);
    continue;
  }
  const stats = removed[box];
  stats.count += 1;
  for (const v of corners) {
    for (let axis = 0; axis < 3; axis += 1) {
      stats.min[axis] = Math.min(stats.min[axis], position[v * 3 + axis]);
      stats.max[axis] = Math.max(stats.max[axis], position[v * 3 + axis]);
    }
  }
}
const Indices = indices.constructor;
primitive.getIndices().setArray(new Indices(kept));
for (const [index, stats] of removed.entries()) {
  console.log(`bộ xích đu ${index + 1}: cắt ${stats.count} tam giác, khung ${stats.min.map((v) => v.toFixed(2))} → ${stats.max.map((v) => v.toFixed(2))}`);
}
const work = mkdtempSync(path.join(tmpdir(), 'park-model-'));
const cut = path.join(work, 'park-cut.glb');
await io.write(cut, doc);
mkdirSync(path.dirname(TARGET), { recursive: true });
execFileSync('npx', ['gltf-transform', 'optimize', cut, TARGET, '--texture-size', '1024', '--texture-compress', 'webp', '--compress', 'meshopt', '--simplify', 'false'], { stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });
console.log(`Đã ghi ${TARGET}`);
