import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick,undo,exportDraft} from '../src/engine.js';
import {installDatabase} from '../src/database.js';
import {enforceBudget,restoreBudgetDraft,budgetSummary} from '../src/budget.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'P'+i,positions:['PG','SG','SF','PF','C'],projectedFP:100-i/10,isRookie:i>=100,price:1500,priceStatus:'VERIFIED'}));
const database={generatedAt:'priced',priceMode:'ON',players};
test('automatic database enables cap and reprices pinned selections without replacing projections',()=>{
 const legacy=pick(newDraft(players.map(({price,priceStatus,...p})=>p)),1);
 const s=installDatabase(legacy,database);assert.equal(s.priceMode,'ON');assert.equal(s.cap,20000);assert.equal(s.picks.length,1);assert.equal(s.players[0].price,1500);assert.equal(s.players[0].projectedFP,100);assert.equal(s.pricingIssue,undefined);
 assert.equal(budgetSummary(s,0).remaining,18500);
 assert.equal(restoreBudgetDraft(exportDraft(s)).priceMode,'ON');
});
test('unpriced legacy selections remain visible but cannot bypass cap; undo repairs state',()=>{
 const legacy=pick(newDraft([{...players[0],price:null,priceStatus:'MISSING'}]),1);
 const s=enforceBudget(legacy);assert.equal(s.picks.length,1);assert.equal(s.priceMode,'ON');assert.match(s.pricingIssue,/Цена/);assert.throws(()=>pick(s,2),/Сохранённый состав/);
 const fixed=enforceBudget(undo(s));assert.equal(fixed.pricingIssue,undefined);
});
test('a grandfathered over-budget roster is blocked instead of silently disabling prices',()=>{
 let s=newDraft(players,20000,'OFF');for(let i=1;i<=9;i++)s=pick(s,i);
 const costly={...s,players:s.players.map(p=>({...p,price:11000}))};const fixed=enforceBudget(costly);
 assert.equal(fixed.picks.length,9);assert.match(fixed.pricingIssue,/Salary Cap/);assert.equal(fixed.priceMode,'ON');
});
