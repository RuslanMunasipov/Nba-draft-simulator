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
test('ADP opponents complete a legal 80-pick draft and follow consensus ranks',async()=>{
 const {adpDraft}=await import('../src/plan.js');const {importDraft,exportDraft}=await import('../src/engine.js');
 const pool=Array.from({length:100},(_,i)=>({id:i+1,name:'A'+(i+1),positions:[['PG'],['SG'],['SF'],['PF'],['C']][i%5],price:1000+(i%7)*200,priceStatus:'VERIFIED',projectedFP:30-i/5,isRookie:i%9===0,espnContext:i<90?{adp:i+1}:undefined}));
 const done=adpDraft(newDraft(pool,20000,'ON'),3);
 assert.equal(done.picks.length,80);assert.deepEqual(importDraft(exportDraft(done)).picks,done.picks);
 assert.ok(done.picks.slice(0,8).every(p=>p.playerId<=20));
});
test('GM adjustments change our plan value and choice',()=>{
 const state=newDraft(players,24000,'ON'),profile={picks,availability:new Map(players.map(p=>[p.id,odds(p)]))};
 const base=planRoster(state,profile,{threshold:.8}),cut=planRoster(state,profile,{threshold:.8,adjust:{[base.now.id]:-90}});
 assert.ok(cut.value<base.value);assert.notEqual(cut.now.id,base.now.id);
});
test('white rule: the plan keeps at least one marked player',()=>{
 const state=newDraft(players,24000,'ON'),profile={picks,availability:new Map(players.map(p=>[p.id,odds(p)]))};
 const base=planRoster(state,profile,{threshold:.8}),outside=players.find(p=>!base.plan.some(x=>x.player.id===p.id));
 const plan=planRoster(state,profile,{threshold:.8,white:[outside.id]});
 assert.ok(plan.plan.some(x=>x.player.id===outside.id));assert.ok(plan.value<=base.value);
});
