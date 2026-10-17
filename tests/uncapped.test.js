import test from 'node:test';import assert from 'node:assert/strict';
import {importUncappedDraft} from '../src/uncapped.js';
const player={id:1,name:'Legacy pick',positions:['PG'],isRookie:false,projectedFP:20};
test('uncapped restore replays legacy ON picks even with missing prices and preserves selection',()=>{
 const state=importUncappedDraft(JSON.stringify({version:1,cap:1,priceMode:'ON',players:[player],picks:[{number:1,team:0,playerId:1}],databaseVersion:'manual'}));
 assert.equal(state.priceMode,'OFF');assert.equal(state.picks.length,1);assert.equal(state.databaseVersion,'manual');
});
test('disabling prices does not bypass duplicate picks, positions or turn validation',()=>{
 assert.throws(()=>importUncappedDraft(JSON.stringify({version:1,cap:1,priceMode:'ON',players:[player],picks:[{number:1,team:1,playerId:1}]})),/порядок/);
});
