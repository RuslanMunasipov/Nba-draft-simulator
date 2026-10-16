import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /<script[^>]+src="\/Nba-draft-simulator\/assets\//);
assert.match(html, /FBL Draft Intelligence/);
const entries = [...html.matchAll(/(?:src|href)="(\/Nba-draft-simulator\/assets\/[^"]+)"/g)].map(m=>m[1]);
assert.ok(entries.length > 0, 'No bundled assets found');
for(const entry of entries) {
  const path='dist/'+entry.replace('/Nba-draft-simulator/','');
  assert.ok((await stat(path)).size>0, 'Missing asset: '+path);
}
console.log('Vite build artifact verified:',entries.length,'assets');
const {readdir}=await import('node:fs/promises');
const assets=await readdir('dist/assets');
assert.ok(assets.some(name=>/^batch-worker-.*\.js$/.test(name)), 'Missing simulation worker');
for(const name of assets)assert.ok((await stat('dist/assets/'+name)).size>0);
console.log('Worker and all emitted assets verified:',assets.length);
const history=JSON.parse(await readFile('dist/data/nba-history.json','utf8'));
assert.equal(history.seasons.length,3);
assert.ok(history.players.length>500,'Historical data missing');
assert.ok(history.players.every(p=>!('projectedFP' in p)&&!('price' in p)), 'History must not pretend to be forecasts or prices');
console.log('Historical reference verified:',history.players.length,'players; no fabricated forecasts');
