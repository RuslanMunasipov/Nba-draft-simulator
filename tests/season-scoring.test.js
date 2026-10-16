import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft} from '../src/engine.js';
import {draftSummary,simulateDraft,batchSimulations} from '../src/simulation.js';
import {timingCohort,simulateRookieTiming,DEMAND_PROFILES} from '../src/rookie-timing.js';
import {FULL_SEASON} from '../src/season-scoring.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'TEST '+i,positions:['PG','SG','SF','PF','C'],isRookie:i<16,projectedFP:999-i,
 forecast:{metric:FULL_SEASON,meanSeason:2000-i*8},historyGames:{'2025-26':78},espnContext:{adp:i+1,individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:100+i}}}));
test('complete simulation and winners use seasonal full formula, not legacy sums',()=>{
 const state=simulateDraft(newDraft(players),{seed:8}),summary=draftSummary(state);
 for(const team of summary){
  const ids=state.picks.filter(p=>p.team===team.team-1).map(p=>p.playerId);
  assert.equal(team.metric,FULL_SEASON);
  assert.equal(team.score,players.filter(p=>ids.includes(p.id)).reduce((s,p)=>s+p.forecast.meanSeason,0));
  assert.notEqual(team.score,team.projectedFP);
 }
 const batch=batchSimulations(newDraft(players),{runs:2});assert.equal(batch.eligibleRuns,2);assert.equal(batch.metric,FULL_SEASON);
 for(const r of batch.results)assert.deepEqual(r.winners,r.teams.filter(t=>t.score===Math.max(...r.teams.map(t=>t.score))).map(t=>t.team));
});
test('rookie timing uses same full season score and can include full forecasts without ESPN counting projections',()=>{
 const state=newDraft(players.map(p=>({...p,espnContext:null}))),cohort=timingCohort(state);
 const r=simulateRookieTiming(state,cohort,2,DEMAND_PROFILES[1],3);
 assert.equal(r.valid,true);
 const human=r.picks.filter(p=>p.team===0).map(p=>players.find(x=>x.id===p.playerId));
 assert.equal(r.teamScore,human.reduce((s,p)=>s+p.forecast.meanSeason,0));
});
test('recorded unscored player never becomes zero or mixes old units',()=>{
 const unscored={...players[0],id:500,forecast:null};
 const state={...newDraft([...players,unscored]),picks:[{number:1,team:0,playerId:500}]};
 assert.throws(()=>timingCohort(state),/нет сопоставимого/);
 const complete={...state,picks:Array.from({length:80},(_,i)=>({number:i+1,team:i%8,playerId:i===0?500:i+1}))};
 assert.equal(draftSummary(complete)[0].score,null);
});

test('valid full forecasts do not depend on obsolete projectedFP being populated',()=>{
 const state=simulateDraft(newDraft(players.map(p=>({...p,projectedFP:null}))),{seed:3});
 assert.equal(state.picks.length,80);assert.ok(draftSummary(state).every(t=>t.score!==null));
});

test('forecast stress scenarios use distinct rookie and veteran season bounds without changing units',()=>{
 const ps=players.map(p=>({...p,forecast:{...p.forecast,seasonFloor:100+p.id,seasonCeiling:4000+p.id}}));
 const state=newDraft(ps),r=simulateRookieTiming(state,timingCohort(state),2,DEMAND_PROFILES[1],4,'rookieUpside');
 const picked=r.picks.filter(p=>p.team===0).map(p=>ps.find(x=>x.id===p.playerId));
 assert.equal(r.teamScore,picked.reduce((s,p)=>s+(p.isRookie?p.forecast.seasonCeiling:p.forecast.seasonFloor),0));
 assert.equal(r.valid,true);
});
