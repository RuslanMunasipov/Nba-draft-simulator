import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /src="\.\/src\/main\.js"/);
for (const file of ['main', 'engine', 'simulation']) {
  const js = await readFile(`dist/src/${file}.js`, 'utf8');
  assert.ok(js.length > 100, `${file}.js missing`);
}
console.log('Static site verification PASS');
