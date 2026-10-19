import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters,stints,bank,weekStart,transfersThisWeek,perGame,injuryFactor,expectedPoints,transferOptions,bestTransfers,teamPoints,parseInjuries,PRIOR_GAMES} from '../src/season.js';
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
// 80 drafted players (ids 1..80, team = (id-1)%8) plus 20 free agents (ids 81..100).
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:'A',
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i<80?30:20+i-80,games:82}}));
const calendar=[{date:'2026-10-23',week:1},{date:'2026-10-25',week:1},{date:'2026-10-28',week:2},{date:'2026-11-20',week:5}];
const live={weeks:{1:{start:'2026-10-19',end:'2026-10-25'},5:{start:'2026-11-16',end:'2026-11-22'}},clubs:{A:calendar},players:{}};
const ctx=(extra={})=>({players,live,injuries:new Map(),today:'2026-10-20',rosters:seasonRosters([],picks),...extra});

test('transfers move players between the draft roster and the free agent pool',()=>{
 const t=[{team:0,outId:1,inId:81,date:'2026-10-22',outPrice:1500,inPrice:1400}];
 const r=seasonRosters(t,picks);assert.equal(r[0][0],81);assert.equal(r[0].length,10);
 assert.throws(()=>seasonRosters([...t,{team:1,outId:2,inId:81,date:'2026-10-23'}],picks),/другой команды/);
 assert.throws(()=>seasonRosters([{team:0,outId:2,inId:82,date:'2026-10-23'}],picks),/нет в составе/);
 const s=stints(t,picks);assert.deepEqual(s.find(x=>x.playerId===1),{team:0,playerId:1,from:'2026-10-18',to:'2026-10-22'});
 assert.equal(bank(0,t,()=>1500,picks),20000-15000+100);
});
test('weekly transfer count resets on Monday',()=>{
 assert.equal(weekStart('2026-10-25'),'2026-10-19');assert.equal(weekStart('2026-10-26'),'2026-10-26');
 const t=[{team:0,date:'2026-10-24'},{team:0,date:'2026-10-26'},{team:1,date:'2026-10-27'}];
 assert.equal(transfersThisWeek(t,0,'2026-10-25'),1);assert.equal(transfersThisWeek(t,0,'2026-10-27'),1);
});
test('per-game estimate moves from forecast to official points as games arrive',()=>{
 const p={forecast:{meanPerGame:30}};
 assert.equal(perGame(p,null).value,30);
 const games=Array.from({length:PRIOR_GAMES},()=>({played:true,points:40}));
 assert.equal(perGame(p,{games:[...games,{played:false,points:0}]}).value,35);
});
test('injury report removes games until the return date',()=>{
 assert.equal(injuryFactor({status:'Out',returnDate:'2026-10-28'},'2026-10-25','2026-10-20'),0);
 assert.equal(injuryFactor({status:'Out',returnDate:'2026-10-28'},'2026-10-28','2026-10-20'),1);
 assert.equal(injuryFactor({status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-24'},'2026-10-23','2026-10-20'),.5);
 assert.equal(injuryFactor({status:'Out',fantasyStatus:'OFS',returnDate:'2027-07-01'},'2027-03-01','2026-10-20'),0);
 assert.equal(injuryFactor({status:'Out'},'2026-10-25','2026-10-20'),0);assert.equal(injuryFactor({status:'Out'},'2026-11-25','2026-10-20'),1);
 const c=ctx({injuries:new Map([['5001',{status:'Out',returnDate:'2026-10-26'}]])});
 assert.equal(expectedPoints(players[0],c,'2026-10-20','2026-10-25').games,0);
 assert.equal(expectedPoints(players[0],c,'2026-10-20','2026-11-30').games,2);
});
test('replacements keep the Sports.ru slot, the budget and the rookie rule',()=>{
 const c=ctx(),opts=transferOptions(c,{team:0,outId:1,bankMoney:5000,limit:50,sort:'season'});
 assert.ok(opts.length>0);
 for(const o of opts){assert.deepEqual(o.player.positions,['PG']);assert.ok(o.player.id>80);}
 // Selling a 1500 player with -100 in the bank leaves 1400: nobody at 1500 is affordable.
 assert.equal(transferOptions(c,{team:0,outId:1,bankMoney:-100,limit:50}).length,0);
 // The only rookie cannot leave for a veteran.
 assert.equal(transferOptions(c,{team:0,outId:73,bankMoney:5000,limit:50}).length,0);
 // Sports.ru position changes are respected.
 const moved=ctx({live:{...live,players:{1081:{position:'C',price:1000,games:[]}}}});
 assert.ok(!transferOptions(moved,{team:0,outId:1,bankMoney:0,limit:50}).some(o=>o.player.id===81));
 assert.ok(transferOptions(moved,{team:0,outId:65,bankMoney:0,limit:50}).some(o=>o.player.id===81));
});
test('an injured starter is worth replacing for the month but the best pick is ranked by gain',()=>{
 const c=ctx({injuries:new Map([['5001',{status:'Out',returnDate:'2027-01-01'}]])});
 const best=bestTransfers(c,{team:0,bankMoney:5000,sort:'month'});
 assert.equal(best[0].outId,1);assert.ok(best[0].gain.month>0);
 const ranked=transferOptions(c,{team:0,outId:1,bankMoney:5000,limit:50,sort:'month'});
 for(let i=1;i<ranked.length;i++)assert.ok(ranked[i-1].gain.month>=ranked[i].gain.month);
});
test('team points count only games played while on the team',()=>{
 const g=(date,points)=>({date,points,played:true});
 const c=ctx({live:{...live,players:{1001:{games:[g('2026-10-21',10),g('2026-10-23',20)]},1081:{games:[g('2026-10-21',5),g('2026-10-23',7)]}}}});
 const t=[{team:0,outId:1,inId:81,date:'2026-10-22',outPrice:0,inPrice:0}];
 assert.equal(teamPoints(c,t,picks)[0],17);
});
test('ESPN injury feed is keyed by athlete id',()=>{
 const m=parseInjuries({injuries:[{injuries:[{status:'Out',shortComment:'x',athlete:{links:[{href:'https://www.espn.com/nba/player/_/id/123/x'}]},details:{returnDate:'2026-11-01',fantasyStatus:{abbreviation:'OUT'}}}]}]});
 assert.deepEqual(m.get('123').returnDate,'2026-11-01');
});
