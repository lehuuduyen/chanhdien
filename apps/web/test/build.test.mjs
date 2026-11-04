import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildWeb } from '../../../scripts/build-web.mjs';

test('build web tĩnh mang đủ trang, scene engine, Three.js và tài nguyên legacy', async (t) => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'lotusgather-web-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await buildWeb(output);
  for (const file of [
    'index.html', 'chanh-dien.html', 'room.html', 'engine/renderer3d.mjs',
    'scenes/thien-default/scene.json', 'shared/room-rules.mjs',
    'vendor/three/build/three.module.js', 'thien/index.html', 'thien/assets/hall.jpg',
  ]) assert.equal((await stat(path.join(output, file))).isFile(), true, file);
  assert.match(await readFile(path.join(output, 'index.html'), 'utf8'), /Chánh Điện Online/);
});
