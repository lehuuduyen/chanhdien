import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['.git', 'node_modules']);
const sourceFiles = [];
const jsonFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(mjs|js)$/.test(entry.name)) sourceFiles.push(file);
    else if (entry.name.endsWith('.json')) jsonFiles.push(file);
  }
}

walk(ROOT);

const failures = [];
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path.relative(ROOT, file)}\n${result.stderr.trim()}`);
}

for (const file of jsonFiles) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${path.relative(ROOT, file)}\n${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(`Đã kiểm tra ${sourceFiles.length} file JavaScript và ${jsonFiles.length} file JSON.`);
}
