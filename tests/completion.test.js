import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick,rosterFits} from '../src/engine.js';
import {completionPlan} from '../src/completion.js';
const positions=['PG','SG','SF','PF','C'];
const catalog=()=>Array.from({length:15},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:[positions[i%5]],price:100,priceStatus:'VERIFIED',projectedFP:50-i,isRookie:i===0}));
test('completion assigns all ten slots, preserves fixed picks and counts a dual-position player once',()=>{
 let players=catalog();players[0].positions=['PG','SG'];let state=pick(newDraft(players,20000,'ON'),1);
 const plan=completionPlan(state,0);assert.equal(plan.possible,true);assert.equal(plan.playerIds.length,10);assert.equal(new Set(plan.playerIds).size,10);assert.ok(plan.playerIds.includes(1));assert.equal(plan.minimumCost,1000);assert.equal(plan.minimumRemainingCost,900);
 assert.ok(rosterFits(plan.playerIds.map(id=>players.find(p=>p.id===id))));
});
test('an individually affordable pick can make the full budget impossible',()=>{
 const players=catalog();players[10].price=1000;const state=pick(newDraft(players,1500,'ON'),11);
 const plan=completionPlan(state,0);assert.equal(plan.possible,false);assert.equal(plan.minimumCost,1900);assert.match(plan.reason,/бюджет/);
 assert.equal(completionPlan({...state,priceMode:'OFF'},0).possible,true);
});
test('rookie must fit available positions, not merely exist in the catalog',()=>{
 const players=catalog();let state=pick(newDraft(players),6);
 for(let i=0;i<7;i++)state=pick(state,players.find(p=>!state.picks.some(x=>x.playerId===p.id)&&p.id!==11&&p.id!==1).id);
 state=pick(state,11); // Both PG slots filled by non-rookies; sole rookie is PG.
 assert.equal(completionPlan(state,0).possible,false);
});
test('players picked by opponents are unavailable for completion',()=>{
 let state=pick(newDraft(catalog()),2);state=pick(state,1);
 assert.equal(completionPlan(state,0).possible,false);
});
test('minimum-cost solver agrees with exhaustive independent subset oracle',()=>{
 for(let seed=1;seed<=25;seed++){
  let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);
  const players=Array.from({length:12},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:positions.filter(()=>random()<.45),isRookie:random()<.2,price:Math.round(random()*150),priceStatus:'VERIFIED'})).map(p=>({...p,positions:p.positions.length?p.positions:['C']}));
  const fixed=seed%2?[players[0].id]:[];let minimum=Infinity;
  for(let omittedA=0;omittedA<12;omittedA++)for(let omittedB=omittedA+1;omittedB<12;omittedB++){
   const roster=players.filter((p,i)=>i!==omittedA&&i!==omittedB);
   if(fixed.every(id=>roster.some(p=>p.id===id))&&roster.some(p=>p.isRookie)&&rosterFits(roster))minimum=Math.min(minimum,roster.reduce((sum,p)=>sum+p.price,0));
  }
  let state=newDraft(players,20000,'ON');if(fixed.length)state=pick(state,fixed[0]);
  const plan=completionPlan(state,0);assert.equal(plan.possible,Number.isFinite(minimum),'seed '+seed);if(plan.possible)assert.equal(plan.minimumCost,minimum,'seed '+seed);
 }
});
test('club-limited completion agrees with exhaustive enumeration',async()=>{
 const {clubsFit}=await import('../src/engine.js');
 for(let seed=1;seed<=400;seed++){
  let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);
  const multi=seed%3===0;
  const players=Array.from({length:13},(_,i)=>({id:i+1,name:'S'+i,positions:multi?positions.filter(()=>random()<.45):[positions[Math.floor(random()*5)]],isRookie:random()<.2,price:Math.round(random()*150),priceStatus:'VERIFIED',sportsClub:random()<.9?'C'+Math.floor(random()*5):undefined})).map(p=>({...p,positions:p.positions.length?p.positions:['C']}));
  const fixed=seed%2?[players[0].id]:[];let minimum=Infinity;
  for(let a=0;a<13;a++)for(let b=a+1;b<13;b++)for(let c=b+1;c<13;c++){
   const roster=players.filter((_,i)=>i!==a&&i!==b&&i!==c);
   if(fixed.every(id=>roster.some(p=>p.id===id))&&roster.some(p=>p.isRookie)&&rosterFits(roster)&&clubsFit(roster))minimum=Math.min(minimum,roster.reduce((s,p)=>s+p.price,0));
  }
  let state=newDraft(players,20000,'ON');if(fixed.length){try{state=pick(state,fixed[0]);}catch{continue;}}
  const plan=completionPlan(state,0);
  assert.equal(plan.possible,Number.isFinite(minimum),'seed '+seed);
  if(plan.possible){assert.equal(plan.minimumCost,minimum,'seed '+seed);assert.ok(clubsFit(plan.playerIds.map(id=>players.find(p=>p.id===id))));}
 }
});
test('interchangeable multi-position players and missing clubs do not fool the pruning',async()=>{
 const {clubsFit}=await import('../src/engine.js');
 for(let seed=1;seed<=300;seed++){
  let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);
  const shared=random()<.5?positions:positions.filter(()=>random()<.6);
  const players=Array.from({length:13},(_,i)=>({id:i+1,name:'S'+i,positions:random()<.6&&shared.length?shared:[positions[Math.floor(random()*5)]],isRookie:random()<.2,price:Math.round(random()*3)*50,priceStatus:'VERIFIED',sportsClub:random()<.5?'C'+Math.floor(random()*3):undefined}));
  let minimum=Infinity;
  for(let a=0;a<13;a++)for(let b=a+1;b<13;b++)for(let c=b+1;c<13;c++){
   const roster=players.filter((_,i)=>i!==a&&i!==b&&i!==c);
   if(roster.some(p=>p.isRookie)&&rosterFits(roster)&&clubsFit(roster))minimum=Math.min(minimum,roster.reduce((s,p)=>s+p.price,0));
  }
  const plan=completionPlan(newDraft(players,20000,'ON'),0);
  assert.equal(plan.possible,Number.isFinite(minimum),'seed '+seed);if(plan.possible)assert.equal(plan.minimumCost,minimum,'seed '+seed);
 }
});
