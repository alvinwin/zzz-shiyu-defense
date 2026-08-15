import { gzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const target = process.argv[2] || 'dist';
const files = (await readdir(target, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const assets = await Promise.all(files.map(async (file) => ({ file, bytes: await readFile(file) })));
const shell = assets.filter(({ file }) => !file.endsWith('current.json'));
const rawShell = shell.reduce((sum, asset) => sum + asset.bytes.length, 0);
const rawData = assets.filter(({ file }) => file.endsWith('current.json')).reduce((sum, asset) => sum + asset.bytes.length, 0);
const gzipTotal = assets.reduce((sum, asset) => sum + gzipSync(asset.bytes).length, 0);

const limits = { shellWarn: 16 * 1024, shellHard: 24 * 1024, dataHard: 48 * 1024, gzipWarn: 10 * 1024, gzipHard: 16 * 1024 };
console.log(`shell raw: ${rawShell} B; data raw: ${rawData} B; total gzip: ${gzipTotal} B`);
if (rawShell > limits.shellWarn) console.warn(`warning: shell exceeds ${limits.shellWarn} B`);
if (gzipTotal > limits.gzipWarn) console.warn(`warning: compressed transfer exceeds ${limits.gzipWarn} B`);
if (rawShell > limits.shellHard || rawData > limits.dataHard || gzipTotal > limits.gzipHard) {
  console.error('asset budget failed: keep the shell under 24 KiB, current data under 48 KiB, and total gzip under 16 KiB');
  process.exit(1);
}
