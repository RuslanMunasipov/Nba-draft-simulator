import test from 'node:test';import assert from 'node:assert/strict';import {newDraft,pick,undo,rosterFits,importDraft,exportDraft} from '../src/engine.js';
const players=Array.from({length:80},(_,i)=>({id:i+1,name:`Player ${i+1}`,positions:['PG','SG','SF','PF','C'],price:100,priceStatus:'VERIFIED',isRookie:true}));
test('80 picks, fixed order and unique players',()=>{let s=newDraft(players);for(let i=1;i<=80;i++)s=pick(s,i);assert.equal(s.picks.length,80);assert.deepEqual(s.picks.slice(0,9).map(x=>x.team),[0,1,2,3,4,5,6,7,0]);assert.throws(()=>pick(s,1));assert.deepEqual(importDraft(exportDraft(s)),s);});
test('position matching',()=>{assert.equal(rosterFits([{positions:['PG','SG']},{positions:['PG']}]),true);assert.equal(rosterFits(Array.from({length:3},()=>({positions:['PG']}))),false);});
test('budget, duplicate and undo',()=>{let s=pick(newDraft(players,100),1);assert.throws(()=>pick(s,1));s=undo(s);assert.equal(s.picks.length,0);assert.throws(()=>pick(newDraft(players,99,'ON'),1));});

test('unpriced draft accepts picks and persists mode',()=>{const p=players.map(({price,priceStatus,...rest})=>rest);let s=pick(newDraft(p),1);assert.equal(s.priceMode,'OFF');assert.deepEqual(importDraft(exportDraft(s)),s);});
test('price mode rejects players without verified prices',()=>{const p=players.map(({price,priceStatus,...rest})=>rest);assert.throws(()=>pick(newDraft(p,20000,'ON'),1),/Цена не подтверждена/);});
test('legacy saves remain in price enforcement mode',()=>{const legacy=newDraft(players);delete legacy.priceMode;let s=importDraft(JSON.stringify(legacy));assert.equal(s.priceMode,'ON');});
test('imported players cannot carry script links or non-numeric forecasts',async()=>{
 const {safeUrl,validatePlayer}=await import('../src/engine.js');
 assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('data:text/html,x'),null);assert.equal(safeUrl('https://www.nba.com/x'),'https://www.nba.com/x');
 const base={id:1,name:'A',positions:['PG']};
 assert.ok(validatePlayer({...base,forecast:{meanPerGame:10,games:70}}));
 assert.ok(!validatePlayer({...base,forecast:{meanPerGame:'x'}}));
});
test('the Sports.ru club rule blocks a third player of one NBA club',async()=>{
 const {newDraft,pick}=await import('../src/engine.js');
 const P=['PG','SG','SF','PF','C'];
 const players=Array.from({length:40},(_,i)=>({id:i+1,name:'P'+i,positions:[P[i%5]],sportsClub:i<24?'Club'+(i%3):'Other'+i,isRookie:i===39}));
 // Team 0 picks 1, 9, 17: ids 1 (Club0), 4 (Club0), then a third Club0 player is refused.
 let s=newDraft(players);const order=[1,2,3,5,6,7,8,9, 4,10,11,12,13,14,15,16];
 for(const id of order)s=pick(s,id);
 assert.throws(()=>pick(s,7*3+1),/клуб|Club0/);
});
