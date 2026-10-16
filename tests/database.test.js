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
 assert.equal(riskProfile({...players[30],historyGames:{'2024-25':36,'2025-26':65}}).level,'СРЕДНИЙ');
});
test('pick confidence is reproducible scenario stability, not a promise',()=>{
 const state=newDraft(players);const a=analyzeRecommendations(state),b=analyzeRecommendations(state);assert.deepEqual(a,b);assert.equal(a.length,5);
 for(const r of a){assert.equal(r.stability,null);assert.equal(r.pressure,null);assert.ok(r.advantages.length);assert.ok(r.drawbacks.length);assert.match(r.method,/Это не вероятность/);}
});

test('searched candidate outside top twenty receives an honest comparison',()=>{
 const state=newDraft(players),focus=players[90],report=analyzeRecommendations(state,focus);
 assert.equal(report.length,1);assert.equal(report[0].player.id,focus.id);
 assert.ok(report[0].advantages.length);assert.ok(report[0].drawbacks.some(x=>x.includes('Альтернатива')));
 assert.match(report[0].conclusion,/Сравнить/);
});

test('advice excludes high-FP picks that prevent rookie completion',()=>{
 const blocked=players.map(p=>({...p,positions:p.id<=21?['PG']:['PG','SG','SF','PF','C'],isRookie:p.id<=20}));
 let state=pick(newDraft(blocked),21);
 // Seven opponent picks; preserve all rookies for this test.
 for(let i=0;i<7;i++)state=pick(state,30+i);
 const candidate={...blocked[21],projectedFP:9999,positions:['PG']};
 state={...state,players:blocked.map(p=>p.id===candidate.id?candidate:p)};
 const report=analyzeRecommendations(state,candidate)[0];assert.equal(report.completion.possible,false);assert.equal(report.stability,null);
 assert.ok(!analyzeRecommendations(state).some(r=>r.player.id===candidate.id));
});
test('advice explains numerical tradeoff and exact full-roster budget',()=>{
 const state=newDraft(players.map(p=>({...p,price:100,priceStatus:'VERIFIED'})),20000,'ON');
 const report=analyzeRecommendations(state)[0];assert.equal(report.completion.minimumCost,1000);
 assert.ok(!report.advantages.some(s=>/Минимальный бюджет|полный позиционный состав/.test(s)));
 assert.ok(report.drawbacks.some(s=>s.includes('Альтернатива сейчас')));
 assert.match(report.method,/Проверка добора состава выполняется отдельно/);
});
