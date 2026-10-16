import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,rosterFits} from '../src/engine.js';import {rookieTimingStudy,simulateRookieTiming,DEMAND_PROFILES,timingCohort} from '../src/rookie-timing.js';
const players=Array.from({length:140},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,isRookie:i>=120,positions:['PG','SG','SF','PF','C'],projectedFP:10,historyGames:{'2024-25':78,'2025-26':78},espnContext:{adp:i>=120?70+(i-120)*3:i+1,individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:i>=120?1500-(i-120)*40:2400-i*10}}}));
test('round comparison completes unique 80-pick straight drafts with legal rosters',()=>{
 const state=newDraft(players),cohort=timingCohort(state);
 for(const profile of DEMAND_PROFILES)for(const round of [1,5,10]){
  const result=simulateRookieTiming(state,cohort,round,profile,3);assert.equal(result.valid,true);assert.equal(result.picks.length,80);assert.equal(new Set(result.picks.map(p=>p.playerId)).size,80);
  for(let team=0;team<8;team++){const roster=result.picks.filter(p=>p.team===team).map(p=>players.find(x=>x.id===p.playerId));assert.equal(roster.length,10);assert.ok(roster.some(p=>p.isRookie));assert.ok(rosterFits(roster));}
 }
});
test('best round maximizes paired scenario mean and reports a separate robust result reproducibly',()=>{
 const state=newDraft(players),a=rookieTimingStudy(state,{runs:2}),b=rookieTimingStudy(state,{runs:2});assert.deepEqual(a,b);assert.equal(a.rows.length,10);assert.equal(a.totalDrafts,80);
 const row=a.rows.find(r=>r.round===a.recommendedRound);assert.ok(row.valid);assert.equal(row.meanTeam,Math.max(...a.rows.filter(r=>r.valid).map(r=>r.meanTeam)));const robust=a.rows.find(r=>r.round===a.robustRound);assert.equal(robust.worstRegret,Math.min(...a.rows.filter(r=>r.valid).map(r=>r.worstRegret)));assert.equal(a.recommendedPick,(a.recommendedRound-1)*8+1);
});
test('missing comparable forecasts never become zeros; no decision without eight forecast rookies',()=>{
 assert.throws(()=>rookieTimingStudy(newDraft(players.map(p=>({...p,espnContext:null})))),/80/);
 assert.throws(()=>rookieTimingStudy(newDraft(players.filter(p=>p.id<128))),/8 rookie/);
});
test('already picked rookie suppresses unnecessary first-rookie timing advice',()=>{
 const state={...newDraft(players),picks:[{number:1,team:0,playerId:121}]};assert.equal(rookieTimingStudy(state).covered,true);
});

test('recorded GM picks rule out contradicted demand profiles',()=>{
 const state={...newDraft(players),picks:Array.from({length:32},(_,i)=>({number:i+1,team:i%8,playerId:i+1}))};
 const study=rookieTimingStudy(state,{runs:1});assert.ok(study.excludedProfiles.some(s=>s.includes('Ранний')));assert.ok(study.rows.every(r=>r.round>=5));
});
test('timing policies preserve a distinct feasible rookie for every GM',()=>{
 const layouts=[['PG','PG','SG','SG','SF','SF','PF','C'],...Array.from({length:6},()=>['PG','PG','SG','SF','SF','PF','C','C']),['PG','PG','SG','SF','SF','PF','PF','C']];
 const fixed=Array.from({length:64},(_,i)=>({...players[0],id:i+1,name:'SYNTHETIC fixed '+i,positions:[layouts[i%8][Math.floor(i/8)]],isRookie:false}));
 const rookies=Array.from({length:8},(_,i)=>({...players[0],id:200+i,name:'SYNTHETIC rookie '+i,isRookie:true,positions:[i===0?'C':'PF'],espnContext:{adp:80+i,individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:i===0?5000:1500}}}));
 const rest=Array.from({length:40},(_,i)=>({...players[0],id:800+i,name:'SYNTHETIC remaining '+i,isRookie:false,positions:['PG','SG','SF','PF','C']}));
 const state={...newDraft([...fixed,...rookies,...rest]),picks:fixed.map((p,i)=>({number:i+1,team:i%8,playerId:p.id}))};
 const result=simulateRookieTiming(state,timingCohort(state),9,DEMAND_PROFILES[2],7);assert.equal(result.valid,true);assert.notEqual(result.picks[64].playerId,200,'the only C rookie is needed by another GM');
});
