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
