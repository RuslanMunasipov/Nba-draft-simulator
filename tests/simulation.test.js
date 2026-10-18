import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,pick} from '../src/engine.js';
import {teamCost,randomFromSeed,currentTeam,botPick,advanceBots,simulateDraft,draftSummary,batchSimulations,seasonSensitivitySimulations,scenarioAnalysis} from '../src/simulation.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'Player '+(i+1),positions:['PG','SG','SF','PF','C'],price:100,priceStatus:'VERIFIED',projectedFP:120-i,isRookie:i<16}));
test('deterministic RNG',()=>{const a=randomFromSeed(42),b=randomFromSeed(42);assert.deepEqual([a(),a(),a()],[b(),b(),b()]);});
test('bot does not fabricate projections',()=>{assert.throws(()=>botPick(newDraft(players.map(({projectedFP,...p})=>p))),/projectedFP/);});
test('interactive bots stop on human turn',()=>{let s=pick(newDraft(players),1);s=advanceBots(s,{seed:12});assert.equal(s.picks.length,8);assert.equal(currentTeam(s),0);});
test('full simulated draft has 80 unique picks',()=>{const s=simulateDraft(newDraft(players),{seed:11});assert.equal(s.picks.length,80);assert.equal(new Set(s.picks.map(p=>p.playerId)).size,80);assert.deepEqual(draftSummary(s).map(t=>t.players),Array(8).fill(10));});
test('same seed same simulation',()=>{const a=simulateDraft(newDraft(players),{seed:17}),b=simulateDraft(newDraft(players),{seed:17});assert.deepEqual(a.picks,b.picks);});
test('batch has 100 seeded runs; no false wins without rookies',()=>{const x=batchSimulations(newDraft(players),{runs:100,seed:8});assert.equal(x.results.length,100);assert.equal(x.runs,100);assert.equal(x.results[0].teams.length,8);});
test('rookie missing blocks winner claims',()=>{const p=players.map(x=>({...x,isRookie:false}));assert.throws(()=>batchSimulations(newDraft(p),{runs:2}),/Нет допустимых/);});
test('invalid batch sizes rejected',()=>assert.throws(()=>batchSimulations(newDraft(players),{runs:1001})));

test('unknown prices stay unknown rather than zero in summaries',()=>{const p=players.map(({price,priceStatus,...rest})=>rest);const s=pick(newDraft(p),1);assert.equal(teamCost(s,0),null);assert.equal(draftSummary(s)[0].cost,null);});

test('bot may take an elite player above the per-slot average when an exact legal completion exists',()=>{
 const priced=players.map((p,i)=>({...p,price:i===0?3500:1000,projectedFP:i===0?500:120-i,isRookie:i>=20&&i<36}));
 const next=botPick(newDraft(priced,20000,'ON'),randomFromSeed(1),'best');
 assert.equal(next.picks[0].playerId,1);
});

test('completed draft models season uncertainty instead of cloning one result',()=>{
 const forecastPlayers=players.map((p,i)=>({...p,team:'NBA '+(i%30),projectedFP:100,forecast:{metric:'FBL_FULL_FORMULA_ESTIMATE',seasonFloor:500,meanSeason:1000,seasonCeiling:1500}}));
 const complete=simulateDraft(newDraft(forecastPlayers),{seed:7});
 const result=seasonSensitivitySimulations(complete,{runs:1000,seed:19});
 assert.equal(result.kind,'SEASON_SENSITIVITY');
 assert.equal(result.teams.length,8);
 assert.ok(result.teams.every(t=>t.p10<t.p90));
 assert.ok(result.teams.filter(t=>t.firstPlaceShare>0).length>1);
 assert.ok(Math.abs(result.teams.reduce((sum,t)=>sum+t.firstPlaceShare,0)-100)<1e-8);
 assert.deepEqual(result,seasonSensitivitySimulations(complete,{runs:1000,seed:19}));
 assert.equal(scenarioAnalysis(complete,{seasonRuns:100,seed:2}).kind,'SEASON_SENSITIVITY');
});

test('incomplete draft analysis still varies the remaining picks',()=>{
 const result=scenarioAnalysis(newDraft(players),{draftRuns:10,seed:3});
 assert.equal(result.kind,'DRAFT_COMPLETION');assert.equal(result.runs,10);
});

test('bot does not occupy the last PG slot when every available rookie is PG',()=>{
 const pool=players.map(p=>({...p,positions:p.isRookie?['PG']:['PG','SG','SF','PF','C']}));
 pool[20]={...pool[20],positions:['PG'],projectedFP:9999};
 pool[21]={...pool[21],positions:['PG']};
 let state=pick(newDraft(pool),22);
 for(let id=30;id<37;id++)state=pick(state,id);
 const next=botPick(state,randomFromSeed(1),'best');
 assert.notEqual(next.picks.at(-1).playerId,21);
 assert.equal(next.picks.length,9);
});
