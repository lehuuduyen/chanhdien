// Giảm lưới mạnh cho mô hình Meshy tạo ở độ chi tiết đầy đủ (should_remesh: false, hàng triệu tam giác): cây hoa, cổng
// hoa hồng… có hàng nghìn mảnh rời (cánh hoa, lá) nên `gltf-transform simplify` thường không giảm được. Dùng
// simplifySloppy của meshoptimizer (gộp theo lưới không gian, không bị chặn bởi mảnh rời / đường nối UV) để đạt đúng số
// tam giác đích, rồi nén như thường (ảnh webp, meshopt).
//
//   node scripts/sloppy-simplify.mjs <vào.glb> <ra.glb> <số tam giác đích> [cạnh ảnh, mặc định 1024]
//
// Thường chạy trên file gốc trong nhanvat/… (đã gitignore), ghi ra apps/web/public/models/….
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [input, output, targetArg, textureArg] = process.argv.slice(2);
const target = Number(targetArg);
if (!input || !output || !Number.isFinite(target) || target < 100) {
  console.error('Cách dùng: node scripts/sloppy-simplify.mjs <vào.glb> <ra.glb> <số tam giác đích> [cạnh ảnh]');
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(input);
const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
const total = primitives.reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0);
let after = 0;
for (const primitive of primitives) {
  const positions = primitive.getAttribute('POSITION');
  let indices = primitive.getIndices()?.getArray();
  if (!indices) indices = Uint32Array.from({ length: positions.getCount() }, (_, index) => index);
  // Mỗi phần nhận số tam giác theo tỉ lệ kích thước của nó.
  const share = Math.max(12, Math.round((target * indices.length) / 3 / total)) * 3;
  const [result] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(indices), positions.getArray(), 3, null, share, 1);
  const accessor = document.createAccessor().setType('SCALAR').setArray(Uint32Array.from(result));
  primitive.setIndices(accessor);
  after += result.length / 3;
}
await document.transform(prune());
const temp = mkdtempSync(path.join(tmpdir(), 'sloppy-'));
const middle = path.join(temp, 'simplified.glb');
await io.write(middle, document);
// Nén như các mô hình khác: bỏ đỉnh thừa, ảnh webp, meshopt.
const cli = path.resolve(import.meta.dirname, '../node_modules/.bin/gltf-transform');
const run = spawnSync(cli, ['optimize', middle, output, '--simplify', 'false', '--texture-size', String(Number(textureArg) || 1024), '--texture-compress', 'webp', '--compress', 'meshopt'], { stdio: 'inherit' });
rmSync(temp, { recursive: true, force: true });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`${path.basename(input)}: ${Math.round(total).toLocaleString('vi-VN')} → ${Math.round(after).toLocaleString('vi-VN')} tam giác`);
