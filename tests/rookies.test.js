import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick} from '../src/engine.js';import {rookieRecommendations} from '../src/rookies.js';
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],projectedFP:5,isRookie:i<20,espnContext:i<3?{individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:[1200,1400,900][i]}}:null}));
test('individual rookie projections outrank group priors and rank season contribution',()=>{
 const result=rookieRecommendations(newDraft(players));assert.deepEqual(result.players.map(p=>p.id),[2,1,3]);assert.equal(result.available,20);assert.equal(result.projected,3);assert.equal(result.teamsNeedingRookie,8);
});
test('picked rookies disappear and rookie obligations update',()=>{
 const result=rookieRecommendations(pick(newDraft(players),2));assert.ok(!result.players.some(p=>p.id===2));assert.equal(result.teamsNeedingRookie,7);
});
test('no individual projection means no fabricated rookie top five',()=>{
 const result=rookieRecommendations(newDraft(players.map(p=>({...p,espnContext:null}))));assert.equal(result.players.length,0);assert.equal(result.projected,0);
});
test('rookie shortlist respects full-roster budget',()=>{
 const result=rookieRecommendations(newDraft(players.map(p=>({...p,price:100,priceStatus:'VERIFIED'})),500,'ON'));assert.equal(result.feasible,0);
});
