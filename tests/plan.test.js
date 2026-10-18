import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,rosterFits} from '../src/engine.js';import {planRoster} from '../src/plan.js';import {riskAdjustedValue} from '../src/valuation.js';
const POS=[['PG'],['SG'],['SF'],['PF'],['C'],['PG','SG'],['SF','PF'],['PF','C']];
const players=Array.from({length:15},(_,i)=>({id:i+1,name:'P'+(i+1),positions:POS[(i*3)%8],price:1500+((i*7)%9)*150,priceStatus:'VERIFIED',projectedFP:20+((i*11)%13),isRookie:i%6===5}));
const picks=Array.from({length:10},(_,r)=>r*8+1);
// Survival falls with value so the deadline constraint matters.
const odds=p=>picks.map((_,r)=>r===0?1:Math.max(0,1-r*(p.projectedFP-18)/150));
const brute=(state,threshold,cap)=>{let best=-Infinity;const n=players.length;
 for(let m=0;m<1<<n;m++){if(m.toString(2).split('1').length-1!==10)continue;const S=players.filter((_,i)=>m>>i&1);
  if(!rosterFits(S)||S.reduce((s,p)=>s+p.price,0)>cap||!S.some(p=>p.isRookie))continue;
  const d=S.map(p=>{let x=-1;odds(p).forEach((a,r)=>{if(a>=threshold)x=r;});return x;}).sort((a,b)=>a-b);
  if(d.some((x,r)=>x<r))continue;best=Math.max(best,S.reduce((s,p)=>s+riskAdjustedValue(p)*82,0));}
 return best;};
test('planner matches exhaustive search under budget, positions, rookie and pick deadlines',()=>{
let feasible=0;
 for(const [cap,threshold] of [[24000,.8],[22000,.6],[21000,.9],[20000,.8],[19000,.5],[17500,.8]]){
  const state=newDraft(players,cap,'ON'),profile={picks,availability:new Map(players.map(p=>[p.id,odds(p)]))};
  const plan=planRoster(state,profile,{threshold}),expected=brute(state,threshold,cap);
  if(expected===-Infinity){assert.equal(plan,null);continue;}feasible++;
  assert.ok(Math.abs(plan.value-expected)<1e-6,`cap ${cap}: ${plan.value} vs ${expected}`);
  assert.ok(rosterFits(plan.plan.map(x=>x.player)));assert.ok(plan.spent<=cap);
  plan.plan.forEach(x=>assert.ok(x.survival>=threshold||x.pick===1));
 }
 assert.ok(feasible>=3,'fixture must exercise feasible plans');
});
test('forcing a player puts him on the current pick',()=>{
 const state=newDraft(players,20000,'ON'),profile={picks,availability:new Map(players.map(p=>[p.id,odds(p)]))};
 const plan=planRoster(state,profile,{threshold:.8,force:3});assert.equal(plan.now.id,3);
});
