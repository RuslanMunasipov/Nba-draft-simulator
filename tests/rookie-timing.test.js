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

test('now versus next turn uses paired outcomes and reports their observed range',()=>{
 const a=rookieTimingStudy(newDraft(players),{runs:3});
 assert.equal(a.paired.length,4);
 for(const p of a.paired){
  const first=a.rows[0].profiles.find(q=>q.id===p.id),next=a.rows[1].profiles.find(q=>q.id===p.id);
  const differences=first.scores.map((v,i)=>v-next.scores[i]);
  assert.equal(p.min,Math.min(...differences));assert.equal(p.max,Math.max(...differences));
  assert.equal(p.mean,differences.reduce((x,y)=>x+y,0)/3);
 }
 assert.ok(['Брать сейчас','Можно ждать до следующего хода','Результат неустойчив'].includes(a.decision));
});
test('real opponent rookie picks update demand and remove taken rookie alternatives',()=>{
 const state={...newDraft(players),picks:[{number:1,team:0,playerId:1},{number:2,team:1,playerId:121}]};
 const a=rookieTimingStudy(state,{runs:1});
 assert.equal(a.rows[0].pick,9);assert.equal(a.bestByProfile.length,1);assert.equal(a.bestByProfile[0].id,'mixed');
 for(const row of a.rows)for(const p of row.profiles)assert.ok(!Object.hasOwn(p.names,players[120].name));
});

test('specific rookie loss counts equal opponent selections before the next human turn',()=>{
 const state=newDraft(players),a=rookieTimingStudy(state,{runs:3});
 assert.equal(a.ourPick,1);assert.equal(a.nextPick,9);assert.equal(a.teamsNeedingRookie,7);
 for(const p of a.paired){
  const profile=DEMAND_PROFILES.find(x=>x.id===p.id);
  let lost=0;
  for(let i=0;i<3;i++){
   const now=simulateRookieTiming(state,players,1,profile,2026+i),wait=simulateRookieTiming(state,players,2,profile,2026+i);
   assert.equal(players.find(x=>x.id===now.firstChoice.playerId).isRookie,true);
   assert.equal(players.find(x=>x.id===wait.firstChoice.playerId).isRookie,false);
   if(wait.picks.some(x=>x.number<9&&x.playerId===now.firstChoice.playerId))lost++;
  }
  assert.equal(p.observed,3);assert.equal(p.lost,lost);
  assert.equal(Object.values(p.rookieNow).reduce((x,y)=>x+y,0),3);
  assert.equal(Object.values(p.veteranNow).reduce((x,y)=>x+y,0),3);
 }
});

test('unaffordable timing policies report invalid runs and never invent a best round',()=>{
 const priced=players.map(p=>({...p,price:3000,priceStatus:'VERIFIED'}));
 const result=rookieTimingStudy(newDraft(priced,20000,'ON'),{runs:1});
 assert.equal(result.recommendedRound,null);assert.ok(result.rows.every(r=>!r.valid));
 assert.ok(result.rows.every(r=>r.profiles.every(p=>p.validRuns===0&&p.meanTeam===null)));
});
