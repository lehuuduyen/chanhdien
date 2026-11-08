// Khoét lòng mô hình kiến trúc Meshy (đình, nhà mở): Meshy thường tạo mô hình kín nên dưới mái có lớp vỏ bịt từ diềm mái
// xuống sàn, nhìn vào như tấm rèm đen. Script bỏ các tam giác có tâm nằm trong trụ đứng giữa mô hình (bán kính = tỉ lệ
// của nửa bề ngang, cao từ yMin tới yMax tính theo tỉ lệ chiều cao), giữ cột (ở vòng ngoài), mái và nền.
//
//   node scripts/carve-interior.mjs <vào.glb> <ra.glb> <bán kính 0–1> <yMin 0–1> <yMax 0–1>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, radiusArg, yMinArg, yMaxArg] = process.argv.slice(2);
const [radiusFrac, yMinFrac, yMaxFrac] = [radiusArg, yMinArg, yMaxArg].map(Number);
if (!input || !output || ![radiusFrac, yMinFrac, yMaxFrac].every(Number.isFinite)) {
  console.error('Cách dùng: node scripts/carve-interior.mjs <vào.glb> <ra.glb> <bán kính> <yMin> <yMax>');
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(input);
const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
// Khung bao chung (tọa độ hình, các mô hình Meshy chỉ có một node không biến đổi).
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const primitive of primitives) {
  const positions = primitive.getAttribute('POSITION').getArray();
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
}
const cx = (min[0] + max[0]) / 2;
const cz = (min[2] + max[2]) / 2;
const radius = (Math.max(max[0] - min[0], max[2] - min[2]) / 2) * radiusFrac;
const yLow = min[1] + (max[1] - min[1]) * yMinFrac;
const yHigh = min[1] + (max[1] - min[1]) * yMaxFrac;
let removed = 0;
let kept = 0;
for (const primitive of primitives) {
  const positions = primitive.getAttribute('POSITION').getArray();
  const indices = primitive.getIndices().getArray();
  const keep = [];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]];
    const x = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
    const y = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3;
    const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
    if (Math.hypot(x - cx, z - cz) < radius && y > yLow && y < yHigh) {
      removed += 1;
      continue;
    }
    keep.push(a, b, c);
    kept += 1;
  }
  primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(keep)));
}
await document.transform(prune());
await io.write(output, document);
console.log(`Bỏ ${removed.toLocaleString('vi-VN')} tam giác trong lòng, giữ ${kept.toLocaleString('vi-VN')}.`);
