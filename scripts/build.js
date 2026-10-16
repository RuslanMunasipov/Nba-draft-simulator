import { mkdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const output = 'dist';
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'src'), { recursive: true });
for (const path of ['index.html', 'src/main.js', 'src/engine.js', 'src/simulation.js']) {
  await copyFile(path, join(output, path));
}
console.log('Static site built: dist/ (zero npm dependencies)');
