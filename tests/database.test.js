import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick,importDraft,exportDraft} from '../src/engine.js';
import {installDatabase} from '../src/database.js';
import {riskProfile,analyzeRecommendations} from '../src/analysis.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],projectedFP:120-i,isRookie:i<20}));
test('default database loads without user JSON and preserves selected snapshots',()=>{
 const database={generatedAt:'2026-10-16',players};let s=installDatabase(newDraft(),database);assert.equal(s.players.length,120);assert.equal(s.databaseVersion,database.generatedAt);
 s=pick(s,1);const updated=installDatabase(s,{generatedAt:'2026-10-17',players:players.map(p=>({...p,projectedFP:1}))});
 assert.equal(updated.players.find(p=>p.id===1).projectedFP,120);assert.deepEqual(updated.picks,s.picks);assert.equal(importDraft(exportDraft(updated)).databaseVersion,'2026-10-17');
});
test('unknown positions remain searchable but not draftable; provider IDs are namespaced',()=>{
 const s=newDraft([{id:'espn:123',name:'SYNTHETIC rookie',positions:[],positionStatus:'MISSING',isRookie:true}]);assert.throws(()=>pick(s,'espn:123'),/позиции/);
 const ready=newDraft([{...s.players[0],positions:['PG']}]);assert.equal(pick(ready,'espn:123').picks.length,1);
});
test('risk automatically detects role changes and unstable availability',()=>{
 assert.ok(riskProfile({...players[30],newHighVolumeTeammates:['SYNTHETIC star']}).flags.some(s=>s.includes('роли')));
 assert.equal(riskProfile({...players[30],historyGames:{'2024-25':36,'2025-26':65}}).level,'ВЫСОКИЙ');
});
test('pick confidence is reproducible scenario stability, not a promise',()=>{
 const state=newDraft(players);const a=analyzeRecommendations(state),b=analyzeRecommendations(state);assert.deepEqual(a,b);assert.equal(a.length,5);
 for(const r of a){assert.ok(r.stability>=0&&r.stability<=100);assert.ok(r.pressure>=0&&r.pressure<=100);assert.ok(r.advantages.length);assert.ok(r.drawbacks.length);assert.match(r.method,/Не вероятность/);}
});
