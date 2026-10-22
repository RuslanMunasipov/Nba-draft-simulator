// The transfer decision (src/transfer-plan.js): one answer for the app and the bot, a move only when it pays for its
// transfer by the backtest's weights and price, never lowering the season's expectation, with its explanation.
import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters} from '../src/season.js';
import {transferPlan,planValue,PLAN} from '../src/transfer-plan.js';
import POLICY from '../data/transfer-policy.json' with {type:'json'};
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const base=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i<80?30:20,games:70}}));
const cal=Array.from({length:60},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*2*864e5).toISOString().slice(0,10),week:1+Math.floor(i/4)}));
const range=(mean,games)=>({meanPerGame:mean,games,meanSeason:mean*games,seasonFloor:mean*games*.85,seasonCeiling:mean*games*1.15,gameFloor:mean*.7,gameCeiling:mean*1.3});
function league(changes={}){
 const players=base.map(p=>changes[p.id]?{...p,forecast:{...p.forecast,...range(changes[p.id],70)}}:{...p,forecast:{...p.forecast,...range(p.forecast.meanPerGame,70)}});
 return {players,live:{clubs:Object.fromEntries(players.map(p=>[p.sportsClub,cal])),players:{}},injuries:new Map(),today:'2026-10-21',now:Date.parse('2026-10-21T12:00:00+03:00'),rosters:seasonRosters([],picks)};
}

test('the plan\'s parameters come from the backtest, and its value of a swap is the weighted gains less the price',()=>{
 assert.deepEqual(PLAN,POLICY.params);
 const g={week:10,month:40,season:200};
 assert.equal(planValue(g,{weights:{month:.5,season:.5},movePrice:25}),.5*40+.5*200-25);
});

test('a clear upgrade is a move with its gains, calibrated confidence, risks, what would change it and an alternative',()=>{
 // SF #85 plays 45 a game against the roster's 30; SF #95 is a smaller upgrade, the alternative.
 const c=league({85:45,95:38}),plan=transferPlan(c,{team:0,bankMoney:5000,left:1,bankOf:()=>5000,leftOf:()=>3});
 assert.equal(plan.action,'move');assert.ok(plan.pairs.some(x=>x.in.id===85));
 for(const h of ['week','month','season']){assert.ok(Number.isFinite(plan.gains[h]));assert.ok(plan.confidence[h]>0&&plan.confidence[h]<=1);}
 assert.ok(plan.gains.season>=0,'never below the season expectation');assert.ok(plan.value>0);
 assert.ok(plan.risks.length<=3);assert.ok(plan.changes.some(t=>/ФО за матч/.test(t)));
 assert.ok(plan.alternative&&!plan.alternative.pairs.some(x=>x.in.id===85),'the alternative buys someone else');
 // Rivals the model also tells to buy him are named (every team holds 30-a-game SFs).
 assert.ok(plan.contested.get(85).length>0&&plan.risks.some(t=>/по модели нужен ещё/.test(t)));
});

test('no move worth a transfer: «держать», with the best move and why it does not pay',()=>{
 const c=league({85:30.3}),plan=transferPlan(c,{team:0,bankMoney:5000,left:3,params:{weights:{season:1},movePrice:500}});
 assert.equal(plan.action,'hold');assert.equal(plan.reason,'no-gain');
 assert.ok(plan.best&&plan.best.value<500);
 assert.deepEqual(transferPlan(c,{team:0,bankMoney:5000,left:0}).reason,'no-transfers');
});

test('a move bought on a short-term gain at the season\'s cost is never made',()=>{
 // #85 plays 60 a game but only 6 games (he is expected to miss the rest): his month beats the roster's, his season not.
 const c=league({85:60}),cut=c.players.find(p=>p.id===85);cut.forecast={...cut.forecast,...range(60,6),games:6};
 const plan=transferPlan(c,{team:0,bankMoney:5000,left:3,params:{weights:{week:1},movePrice:0}});
 if(plan.action==='move')assert.ok(plan.gains.season>=-1e-6);
});

test('a pair that loses on its own says why it is in the package: the roster\'s rookie it keeps',()=>{
 // Team 0's only rookie, C #73, plays 5 a game; the free C #89 plays 60. Selling #73 needs another rookie: the free PG
 // #81 (10 a game) for the roster's PG #1 (30), a loss that the C upgrade more than pays for.
 const c=league({73:5,89:60,81:10});c.players.find(p=>p.id===81).isRookie=true;
 const plan=transferPlan(c,{team:0,bankMoney:0,left:3});
 assert.equal(plan.action,'move');
 assert.deepEqual(plan.pairs.map(x=>[x.out.id,x.in.id]).sort((a,b)=>a[0]-b[0]),[[1,81],[73,89]]);
 assert.equal(plan.forced.length,1);
 assert.match(plan.forced[0],/^P1 → P81 сам по себе даёт −.* ФО за сезон: в составе обязателен новичок \(rookie\), а P73 продаётся\. Пакет целиком — \+/);
});
