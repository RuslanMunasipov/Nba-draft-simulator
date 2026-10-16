import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,pick,rosterFits,importDraft,exportDraft} from '../src/engine.js';
import {simulateDraft,batchSimulations,teamRoster,advanceBots} from '../src/simulation.js';
// Deliberately synthetic. Never publish these as NBA data.
const positions=['PG','SG','SF','PF','C'];
const players=Array.from({length:150},(_,i)=>({id:i+1,name:`SYNTHETIC ${i+1}`,positions:i%3===0?[positions[i%5],positions[(i+1)%5]]:[positions[i%5]],price:1000+(i%9)*100,priceStatus:'VERIFIED',projectedFP:150-i,isRookie:i<30}));
test('100 diverse seeded drafts are complete, legal, reproducible and within cap',()=>{
 for(let seed=1;seed<=100;seed++){
 const s=simulateDraft(newDraft(players),{seed});
 assert.equal(s.picks.length,80);assert.equal(new Set(s.picks.map(p=>p.playerId)).size,80);
 s.picks.forEach((p,i)=>assert.equal(p.team,i%8));
 for(let team=0;team<8;team++){const r=teamRoster(s,team);assert.equal(r.length,10);assert.ok(rosterFits(r));assert.ok(r.some(p=>p.isRookie));assert.ok(r.reduce((a,p)=>a+p.price,0)<=20000);}
 assert.deepEqual(simulateDraft(newDraft(players),{seed}).picks,s.picks);
 assert.deepEqual(importDraft(exportDraft(s)),s);
 }
 const a=batchSimulations(newDraft(players),{runs:100,seed:20});
 assert.equal(a.eligibleRuns,100);assert.deepEqual(a,batchSimulations(newDraft(players),{runs:100,seed:20}));
 assert.ok(Math.abs(a.wins.reduce((a,b)=>a+b,0)-100)<1e-8);
});
test('human is first and seven bots return control to human',()=>{const s=newDraft(players);assert.equal(advanceBots(s).picks.length,0);assert.equal(advanceBots(pick(s,1)).picks.length,8);});
test('invalid catalogs and negative or nonfinite values are rejected',()=>{
 for(const data of [[players[0],players[0]],[{...players[0],price:-1}],[{...players[0],name:null}],[{...players[0],projectedFP:NaN}],[{...players[0],isRookie:'yes'}]])assert.throws(()=>newDraft(data));
});
test('last slot must contain a rookie',()=>{
 const p=players.map(p=>({...p,positions,isRookie:false}));let s=newDraft(p);
 for(let i=1;i<=72;i++)s=pick(s,i);
 assert.throws(()=>pick(s,73),/новичок/);
});
test('impossible budget, missing rookies and unverified prices stop without winner claims',()=>{
 assert.throws(()=>batchSimulations(newDraft(players,50),{runs:100}));
 assert.throws(()=>batchSimulations(newDraft(players.map(p=>({...p,isRookie:undefined}))),{runs:100}));
 assert.throws(()=>simulateDraft(newDraft(players.map(p=>({...p,priceStatus:'ESTIMATED'})))));
});
test('lowering cap below an existing roster is rejected on restore',()=>{
 const s=pick(newDraft(players),1);assert.throws(()=>importDraft(exportDraft({...s,cap:1})),/Salary Cap/);
});
