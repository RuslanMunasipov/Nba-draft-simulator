import test from 'node:test';import assert from 'node:assert/strict';
import {draftValue,severeRisk} from '../src/valuation.js';
import {analyzeRecommendations} from '../src/analysis.js';import {newDraft} from '../src/engine.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],isRookie:i>=100,projectedFP:100-i/10,historyGames:{'2024-25':78,'2025-26':78},forecast:{metric:'FBL_FULL_FORMULA_ESTIMATE',meanPerGame:20,games:70,meanSeason:1400-i,gameCeiling:35,seasonFloor:800,seasonCeiling:1900}}));
test('primary ranking uses season contribution instead of stress RNG or historical per-game leader',()=>{
 const p=players.map(x=>({...x}));p[10]={...p[10],projectedFP:5,forecast:{...p[10].forecast,meanSeason:2500}};
 const result=analyzeRecommendations(newDraft(p));assert.equal(result[0].player.id,11);assert.equal(result[0].stability,null);assert.equal(result[0].pressure,null);
 assert.match(result[0].conclusion,/2500|1100/);
 assert.ok(!result[0].advantages.some(s=>/полный позиционный состав|флаги риска|Допустим для/.test(s)));
});
test('manual role/out multipliers do not change a complete season estimate',()=>{
 const p={...players[0],newHighVolumeTeammates:['TEST'],injuries:[{status:'Out'}]};
 assert.equal(draftValue(p),1400/82);assert.equal(severeRisk(p),true);
});
test('old low-game season does not permanently classify a recovered veteran high risk',()=>{
 assert.equal(severeRisk({...players[0],historyGames:{'2023-24':10,'2024-25':78,'2025-26':78}}),false);
});
