import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick} from '../src/engine.js';import {completionPlan} from '../src/completion.js';
const positions=['PG','SG','SF','PF','C'];
const players=positions.flatMap((pos,k)=>Array.from({length:8},(_,i)=>({id:k*100+i,name:`Player ${k}-${i}`,positions:[pos],price:100+i*11+k,isRookie:i===7,priceStatus:'VERIFIED',projectedFP:20})));
test('strict Sports.ru solver matches general flow with a costly irrelevant flexible player',()=>{
 for(let fixed=0;fixed<5;fixed++){
  let state=newDraft(players,20000,'ON');
  for(let i=0;i<fixed;i++)state=pick(state,players[i].id);
  const simple=completionPlan(state,0),general=completionPlan({...state,players:[...state.players,{id:9999,name:'Expensive flexible',positions:['PG','C'],price:19999,priceStatus:'VERIFIED',isRookie:false,projectedFP:20}]},0);
  assert.equal(simple.possible,general.possible);assert.equal(simple.minimumCost,general.minimumCost);
  assert.equal(simple.playerIds.length,10);assert.ok(simple.playerIds.some(id=>players.find(p=>p.id===id)?.isRookie));
 }
});
test('the rookie exchange cannot use an already full fixed position',()=>{
 let state=newDraft(players.map(p=>({...p,isRookie:p.id===7})),20000,'ON');
 state={...state,picks:[{number:1,team:0,playerId:0},{number:9,team:0,playerId:1}]};
 assert.equal(completionPlan(state,0).possible,false);
});
