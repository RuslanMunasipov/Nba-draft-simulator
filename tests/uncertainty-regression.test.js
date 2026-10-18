import test from 'node:test';import assert from 'node:assert/strict';
import {wilsonInterval,simulateDraft,seasonSensitivitySimulations} from '../src/simulation.js';
import {newDraft} from '../src/engine.js';
import {riskAdjustedValue,draftValue} from '../src/valuation.js';
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'Synthetic '+i,positions:['PG','SG','SF','PF','C'],isRookie:i<20,projectedFP:20,forecast:{metric:'FBL_FULL_FORMULA_ESTIMATE',meanSeason:1000,seasonFloor:800,seasonCeiling:i%2?1200:4000}}));
test('asymmetric uncertainty does not inflate the season expectation; 5k/20k agree within Monte Carlo error',()=>{
 const state=simulateDraft(newDraft(players),{seed:7});
 const a=seasonSensitivitySimulations(state,{runs:5000,seed:31}),b=seasonSensitivitySimulations(state,{runs:20000,seed:31});
 for(let i=0;i<8;i++){assert.ok(Math.abs(b.teams[i].mean-10000)<40);assert.ok(Math.abs(a.teams[i].firstPlaceShare-b.teams[i].firstPlaceShare)<2.5);assert.equal(b.teams[i].firstPlaceCI.length,2);}
 const c=seasonSensitivitySimulations(state,{runs:5000,seed:82});
 assert.ok(c.teams.every((t,i)=>Math.abs(t.firstPlaceShare-a.teams[i].firstPlaceShare)<3));
});
test('Wilson includes endpoint uncertainty and shared risk scoring retains elite risky value',()=>{
 assert.ok(wilsonInterval(0,100)[1]>0);assert.ok(wilsonInterval(100,100)[0]<100);
 const elite={...players[0],historyGames:{'2024-25':19,'2025-26':38},forecast:{...players[0].forecast,meanSeason:3000,seasonFloor:1700,seasonCeiling:4000}};
 assert.ok(riskAdjustedValue(elite)<draftValue(elite));assert.ok(riskAdjustedValue(elite)>riskAdjustedValue(players[1]));
});

test('an elite risky player remains in the main roster recommendations',async()=>{
 const {analyzeRecommendations}=await import('../src/analysis.js');
 const pool=players.map(p=>({...p,isRookie:p.id>80,forecast:{...p.forecast,meanPerGame:20,games:50,gameCeiling:30,sampleGames:0}}));
 pool[0]={...pool[0],historyGames:{'2024-25':19,'2025-26':38},forecast:{...pool[0].forecast,meanSeason:5000,seasonFloor:3000,seasonCeiling:6500}};
 const advice=analyzeRecommendations(newDraft(pool));
 assert.ok(advice.some(r=>r.player.id===pool[0].id));
 assert.ok(advice.find(r=>r.player.id===pool[0].id).drawbacks.some(s=>s.includes('менее чем 50')));
});

test('precomputed bot rankings preserve identical seeded choices',async()=>{
 const {botPick,randomFromSeed,isComplete}=await import('../src/simulation.js');
 const state=newDraft(players),styles=['balanced','best','volatile'];
 for(const seed of [1,19]){
  const rng=randomFromSeed(seed);let reference=state;
  while(!isComplete(reference)){const style=styles[Math.floor(rng()*styles.length)];reference=botPick(reference,rng,style);}
  assert.deepEqual(simulateDraft(state,{seed}).picks,reference.picks);
 }
});
