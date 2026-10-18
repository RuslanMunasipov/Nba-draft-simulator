import test from 'node:test';import assert from 'node:assert/strict';import {newDraft,pick,replacePick} from '../src/engine.js';
const players=Array.from({length:90},(_,i)=>({id:i+1,name:`Player ${i+1}`,positions:['PG','SG','SF','PF','C'],price:100,priceStatus:'VERIFIED',isRookie:true}));
const draft=n=>{let s=newDraft(players);for(let i=1;i<=n;i++)s=pick(s,i);return s;};
test('replacing an earlier pick keeps later picks that remain legal',()=>{
 const {state,dropped}=replacePick(draft(10),2,85);
 assert.deepEqual(state.picks.map(p=>p.playerId),[1,2,85,4,5,6,7,8,9,10]);
 assert.deepEqual(state.picks.map(p=>p.team),[0,1,2,3,4,5,6,7,0,1]);
 assert.deepEqual(dropped,[]);
});
test('a later pick of the newly chosen player ends the replay',()=>{
 const {state,dropped}=replacePick(draft(10),2,7);
 assert.deepEqual(state.picks.map(p=>p.playerId),[1,2,7,4,5,6]);
 assert.deepEqual(dropped.map(p=>p.number),[7,8,9,10]);
});
test('illegal replacement and unknown pick numbers are rejected without changes',()=>{
 const s=draft(5);
 assert.throws(()=>replacePick(s,1,1),/уже выбран/);
 assert.throws(()=>replacePick(s,5,50),/Нет такого пика/);
 assert.equal(s.picks.length,5);
});
