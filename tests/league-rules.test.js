import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {newDraft,TEAM_COUNT,ROUNDS,POSITIONS,rosterFits} from '../src/engine.js';
const rules=JSON.parse(readFileSync(new URL('../data/league-rules.json',import.meta.url),'utf8'));
test('engine defaults match user-confirmed league rules without fabricating prices or club cap',()=>{
 assert.equal(TEAM_COUNT,rules.teams);assert.equal(ROUNDS,rules.rosterSize);
 assert.equal(newDraft().cap,rules.cap.default);assert.equal(newDraft().priceMode,'OFF');
 assert.equal(rules.draft.order,'LINEAR');assert.equal(rules.nbaClubLimit,null);
 assert.deepEqual(rules.draft.picks,Array.from({length:ROUNDS},(_,i)=>i*TEAM_COUNT+1));
 for(const p of POSITIONS)assert.equal(rules.slots[p],2);
});
test('two slots each admit a full roster while a third single-position player cannot fit',()=>{
 const roster=POSITIONS.flatMap((position,index)=>[0,1].map(n=>({id:index*2+n+1,positions:[position]})));
 assert.equal(rosterFits(roster),true);
 assert.equal(rosterFits([{positions:['C']},{positions:['C']},{positions:['C']}]),false);
});
