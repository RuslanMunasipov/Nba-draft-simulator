import test from 'node:test';import assert from 'node:assert/strict';
import {availabilityEvidence,draftValue,severeRisk} from '../src/valuation.js';
import {analyzeRecommendations} from '../src/analysis.js';
import {newDraft,pick} from '../src/engine.js';
const healthy=(id)=>({id,name:'SYNTHETIC healthy '+id,positions:['PG','SG','SF','PF','C'],projectedFP:20,idSource:'SYNTHETIC',isRookie:id>100,historyGames:{'2024-25':78,'2025-26':78}});
const players=Array.from({length:120},(_,i)=>({...healthy(i+1),projectedFP:i>=100?5:20}));
players[0]={...players[0],name:'SYNTHETIC Embiid regression',projectedFP:35,historyGames:{'2024-25':19,'2025-26':38}};
players[1]={...players[1],name:'SYNTHETIC Davis regression',projectedFP:32,historyGames:{'2024-25':36,'2025-26':28}};
test('availability changes candidate value before the top twenty cutoff',()=>{
 assert.ok(draftValue(players[0])<draftValue(players[2]));assert.equal(severeRisk(players[0]),true);
 assert.equal(availabilityEvidence(players[0]).weightedGames,(19+2*38)/3);
 const advice=analyzeRecommendations(newDraft(players));assert.equal(advice.length,5);assert.ok(advice.every(r=>!r.speculative));
 assert.ok(analyzeRecommendations(newDraft(players),players[0],true).some(r=>r.player.id===1));
});
test('a risky searched player remains available with an explicit warning and safer alternative',()=>{
 const report=analyzeRecommendations(newDraft(players),players[0])[0];assert.equal(report.speculative,true);
 assert.match(report.conclusion,/Рискованная ставка/);assert.ok(report.drawbacks.some(s=>s.includes('Два сезона')));assert.ok(report.drawbacks.some(s=>s.includes('Альтернатива')));
});
test('unknown rookie history is not presented as zero NBA ability',()=>{
 const rookie={...healthy(500),isRookie:true,historyGames:{}};assert.equal(draftValue(rookie),20);assert.equal(severeRisk(rookie),true);assert.equal(availabilityEvidence(rookie).weightedGames,null);
});
test('required risky rookie still appears when no safer completion exists',()=>{
 const rosterPlayers=Array.from({length:80},(_,i)=>({...healthy(i+1),isRookie:i===79}));let state=newDraft(rosterPlayers);
 for(let i=1;i<=72;i++)state=pick(state,i);
 const result=analyzeRecommendations(state);assert.equal(result.length,1);assert.equal(result[0].player.id,80);assert.equal(result[0].speculative,true);
});
test('unchanged history yields deterministic risk-aware recommendations',()=>{
 const state=newDraft(players);assert.deepEqual(analyzeRecommendations(state),analyzeRecommendations(state));
});
test('source-projected games update the availability index without erasing chronic risk',()=>{
 const p={...players[0],espnContext:{projectedGames:54}};
 assert.equal(availabilityEvidence(p).weight,54/82);assert.equal(severeRisk(p),true);
 assert.equal(availabilityEvidence({...p,espnContext:{projectedGames:0}}).espnGames,null);
});

test('draft value is the roster slot: own season plus the replacement in long absences',()=>{
 const f={metric:'FBL_FULL_FORMULA_ESTIMATE',meanPerGame:40,games:55,meanSeason:2200,slotSeason:2400,transfer:{value:200}};
 assert.equal(draftValue({forecast:f}),2400/82);
 assert.equal(draftValue({forecast:{...f,slotSeason:undefined}}),2200/82);
});
