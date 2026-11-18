// Nén mô hình nhân vật admin tải lên (shop.mjs). Chạy như tiến trình riêng: `node model-optimize.mjs <vào.glb> <ra.glb>`,
// để việc nén nặng (meshopt, sharp) không chặn API và bị giết được khi quá giờ.
// Cùng các bước với `gltf-transform optimize <vào> <ra> --compress meshopt --texture-compress webp --texture-size 1024
// --no-simplify --flatten false --join false --instance false --palette false` (giữ khung xương, động tác), nhưng gọi
// thẳng thư viện: gói @gltf-transform/cli kéo theo micromatch / picomatch / glob có cảnh báo bảo mật chưa có bản vá,
// làm bước `npm audit --omit=dev` của CI chặn deploy. CLI chỉ còn là devDependency cho script dựng tài nguyên.
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, sparse, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { ready as resampleReady, resample as resampleWasm } from 'keyframe-resample';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

export async function optimizeGlb(input, output, { textureSize = 1024 } = {}) {
  const [dracoDecoder, dracoEncoder] = await Promise.all([
    draco3d.createDecoderModule(),
    draco3d.createEncoderModule(),
    MeshoptDecoder.ready,
    MeshoptEncoder.ready,
  ]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': dracoDecoder,
    'draco3d.encoder': dracoEncoder,
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const document = await io.read(input);
  // File đã nén sẵn (Draco / meshopt) đã được giải khi đọc: bỏ đánh dấu cũ để nén lại bằng meshopt.
  for (const name of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
    if (document.hasExtension(name)) document.disposeExtension(name);
  }
  await document.transform(
    dedup(),
    weld(),
    resample({ ready: resampleReady, resample: resampleWasm }),
    prune({ keepAttributes: false, keepIndices: false, keepLeaves: false, keepSolidTextures: false }),
    sparse(),
    textureCompress({ encoder: sharp, resize: [textureSize, textureSize], targetFormat: 'webp', limitInputPixels: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    unpartition(),
  );
  await io.write(output, document);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [input, output] = process.argv.slice(2);
  optimizeGlb(input, output).then(() => process.exit(0), (error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
