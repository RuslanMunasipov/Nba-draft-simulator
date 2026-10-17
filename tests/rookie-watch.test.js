import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick} from '../src/engine.js';
import {rookieWatch,rookieSlotWarnings} from '../src/rookie-watch.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'Player '+i,positions:['PG','SG','SF','PF','C'],projectedFP:20,isRookie:i>=100,espnContext:i>=100?{individualProjection:{componentSeasonTotal:2000-i}}:null}));
players[100]={...players[100],name:'Cameron Boozer',positions:['PF'],projectedFP:100};
players[0]={...players[0],positions:['PF']};players[1]={...players[1],positions:['PF']};
function nextHuman(s){for(let id=10;id<17;id++)s=pick(s,id);return s;}
test('warn before the second PF closes Boozer, but never before a flexible player that fits elsewhere',()=>{
 const state=nextHuman(pick(newDraft(players),1));
 assert.match(rookieSlotWarnings(state,players[1])[0],/Cameron Boozer/);
 assert.equal(rookieSlotWarnings(state,players[2]).length,0);
 assert.equal(rookieWatch(state)[0].status,'AVAILABLE');
});
test('closed position stays visible with reason, and picked rookie records GM and pick',()=>{
 let state=nextHuman(pick(newDraft(players),1));state=pick(state,2);
 // Back to GM 1 without consuming any other relevant players.
 for(let id=20;id<27;id++)state=pick(state,id);
 const watched=rookieWatch(state)[0];assert.equal(watched.status,'BLOCKED');assert.match(watched.reason,/PF/);
 const taken=rookieWatch(pick(newDraft(players),101))[0];assert.equal(taken.status,'TAKEN');assert.match(taken.reason,/GM 1.*№1/);
});

test('all five leading rookies have statuses and changing names cannot alter the result',()=>{
 const state=newDraft(players),base=rookieWatch(state);
 assert.equal(base.length,5);assert.ok(base.every(w=>w.status==='AVAILABLE'));
 const renamed={...state,players:players.map(p=>({...p,name:'Renamed '+p.id}))};
 assert.deepEqual(rookieWatch(renamed).map(w=>[w.player.id,w.status]),base.map(w=>[w.player.id,w.status]));
 for(const w of base){const picked=rookieWatch(pick(state,w.player.id)).find(x=>x.player.id===w.player.id);assert.equal(picked.status,'TAKEN');}
});
