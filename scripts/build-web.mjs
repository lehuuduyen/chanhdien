import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

async function copyDirectory(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(ROOT, source), destination, { recursive: true });
}

export async function buildWeb(output = path.join(ROOT, 'dist/web')) {
  const destination = path.resolve(output);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  await copyDirectory('apps/web/public', destination);
  await Promise.all([
    copyDirectory('packages/scene-engine/src', path.join(destination, 'engine')),
    copyDirectory('scenes', path.join(destination, 'scenes')),
    copyDirectory('tools/seat-editor', path.join(destination, 'tools/seat-editor')),
    copyDirectory('legacy/assets', path.join(destination, 'thien/assets')),
    copyDirectory('node_modules/three/build', path.join(destination, 'vendor/three/build')),
    copyDirectory('node_modules/three/examples/jsm', path.join(destination, 'vendor/three/examples/jsm')),
  ]);

  await mkdir(path.join(destination, 'shared'), { recursive: true });
  await mkdir(path.join(destination, 'thien'), { recursive: true });
  await Promise.all([
    copyFile(path.join(ROOT, 'packages/room-rules/src/index.mjs'), path.join(destination, 'shared/room-rules.mjs')),
    copyFile(path.join(ROOT, 'packages/prayer-slip/src/index.mjs'), path.join(destination, 'shared/prayer-slip.mjs')),
    copyFile(path.join(ROOT, 'packages/tien-len/src/index.mjs'), path.join(destination, 'shared/tien-len.mjs')),
    copyFile(path.join(ROOT, 'legacy/index.html'), path.join(destination, 'thien/index.html')),
  ]);

  return destination;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const output = await buildWeb(process.env.WEB_DIST_DIR);
  console.log(`Đã build web tĩnh: ${path.relative(ROOT, output)}`);
}
