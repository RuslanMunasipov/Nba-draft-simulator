import test from 'node:test';import assert from 'node:assert/strict';
import {leagueRanks,tiedWith,placeLabel,placeProbabilities,chanceText,leagueRace,teamPlace,periodWindows,windowFact,CHANCE_RUNS} from '../src/standings.js';
import {seasonRosters,teamPoints,horizons} from '../src/season.js';
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
// 80 drafted players (ids 1..80, team = (id-1)%8) and 20 free agents; equal forecasts, so the teams start level.
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,
 forecast:{meanPerGame:20,games:70,meanSeason:1400,seasonFloor:1000,seasonCeiling:1800}}));
// Weeks 1 and 2 of the Sports.ru calendar, then a long tour 7.
const calendar=[{date:'2026-10-20',week:1},{date:'2026-10-23',week:1},{date:'2026-10-26',week:1},{date:'2026-10-28',week:2},{date:'2026-11-02',week:2},{date:'2026-11-20',week:7},{date:'2026-12-04',week:7}];
const clubs=Object.fromEntries(players.map(p=>[p.sportsClub,calendar]));
const played=(points,date='2026-10-20')=>({games:[{date,played:true,points,minutes:'30:00'}]});
const ctx=(extra={})=>({players,live:{clubs,players:{}},injuries:new Map(),today:'2026-10-21',rosters:seasonRosters([],picks),transfers:[],picks,...extra});

test('equal totals share a place: the competition ranking of both screens',()=>{
 const totals=[0,20,20,0,0,20,0,40];
 assert.deepEqual(leagueRanks(totals),[5,2,2,5,5,2,5,1]);
 assert.equal(tiedWith(totals,1),3);assert.equal(placeLabel({rank:2,tied:3}),'2–4');assert.equal(placeLabel({rank:1,tied:1}),'1');
 // A tie for the lead is a shared 1st place, never "−0 до 1-го".
 assert.deepEqual(leagueRanks([30,30,10]),[1,1,3]);
});
test('place chances: 1st sums to 1, the top 3 to 3, places to 1+…+n; a dominant team is ~certain',()=>{
 const teams=[15169,14356,14222,15020,13726,13569,13831,13914].map((points,i)=>({points,sd:1280+20*i}));
 const p=placeProbabilities(teams,20000,1),sum=k=>p.reduce((s,x)=>s+x[k],0);
 assert.ok(Math.abs(sum('first')-1)<1e-9);assert.ok(Math.abs(sum('top3')-3)<1e-9);assert.ok(Math.abs(sum('place')-36)<1e-9);
 assert.ok(p.every(x=>x.first>=0&&x.first<=x.top3&&x.top3<=1));
 // The favourite leads but is far from sure: the top two forecasts are close.
 assert.ok(p[0].first>p[3].first&&p[0].first<.5);
 const big=placeProbabilities(teams.map((t,i)=>i===4?{...t,points:t.points+10000}:t),20000,1);
 assert.ok(big[4].first>.99);assert.ok(big[4].top3>.999);assert.ok(big[4].place<1.01);
 // Same inputs, same seed: the same numbers on every device; another seed moves them only by sampling error.
 assert.deepEqual(placeProbabilities(teams,5000,7),placeProbabilities(teams,5000,7));
 const other=placeProbabilities(teams,20000,2);assert.ok(Math.abs(other[0].first-p[0].first)<.02);
});
test('place chances of equal teams are equal, and a sure tie shares its places',()=>{
 const level=placeProbabilities(Array.from({length:8},()=>({points:14000,sd:1300})),20000,3),se=Math.sqrt(1/8*7/8/20000);
 for(const x of level){assert.ok(Math.abs(x.first-1/8)<4*se);assert.ok(Math.abs(x.top3-3/8)<.02);}
 // The season is over (no spread left): equal totals split their places exactly.
 const done=placeProbabilities([{points:10,sd:0},{points:10,sd:0},{points:5,sd:0},{points:1,sd:0}],10,1);
 assert.deepEqual(done.map(x=>x.first),[.5,.5,0,0]);assert.deepEqual(done.map(x=>x.top3),[1,1,1,0]);assert.deepEqual(done.map(x=>x.place),[1.5,1.5,3,4]);
});
test('chances print in whole percent and never as certain when they are not',()=>{
 assert.equal(chanceText(.284),'28 %');assert.equal(chanceText(.001),'<1 %');assert.equal(chanceText(.999),'>99 %');
 assert.equal(chanceText(0),'0 %');assert.equal(chanceText(1),'100 %');assert.equal(chanceText(NaN),'—');
});
test('the league race: one ranking for the Overview and the Teams tab, ties shared, chances over all teams',()=>{
 // Night 1 of the audit's tie case: only some players scored, four teams have nothing yet.
 const scored={1:0,2:20,3:20,6:20,8:40};
 const c=ctx({live:{clubs,players:Object.fromEntries(Object.entries(scored).filter(([,v])=>v).map(([id,v])=>[String(1000+Number(id)),played(v)]))}});
 const race=leagueRace(c,new Map(),{sims:4000});
 assert.equal(race.started,true);
 assert.deepEqual(race.rows.map(r=>r.points),[0,20,20,0,0,20,0,40]);
 assert.deepEqual(race.rows.map(r=>r.rank),[5,2,2,5,5,2,5,1]);
 assert.deepEqual(race.rows.map(r=>placeLabel(r)),['5–8','2–4','2–4','5–8','5–8','2–4','5–8','1']);
 assert.ok(Math.abs(race.rows.reduce((s,r)=>s+r.first,0)-1)<1e-9);assert.ok(Math.abs(race.rows.reduce((s,r)=>s+r.top3,0)-3)<1e-9);
 // The remaining season has a spread; the chances follow fact + rest, the lead of 40 points barely moves them.
 assert.ok(race.rows.every(r=>r.sd>0&&r.rest>0));assert.ok(race.rows[7].first>race.rows[0].first);
 const lead=teamPlace(race,7),second=teamPlace(race,1);
 assert.equal(lead.rank,1);assert.equal(lead.second,20);assert.equal(second.leader,40);assert.equal(second.total,20);
 // A shared lead is a lead, not "−0 до 1-го".
 const tie=teamPlace(leagueRace(ctx({live:{clubs,players:{1001:played(30),1002:played(30)}}}),new Map(),{sims:500}),0);
 assert.equal(tie.rank,1);assert.equal(tie.second,tie.total);assert.equal(placeLabel(tie),'1–2');
 // A team far ahead on facts is all but sure of the title.
 const far=leagueRace(ctx({live:{clubs,players:{1001:played(9000)}}}),new Map(),{sims:4000});
 assert.ok(far.rows[0].first>.99);
});
test('before any points the race follows the forecast, and the default run count is the documented one',()=>{
 const race=leagueRace(ctx(),new Map(),{sims:2000});
 assert.equal(race.started,false);assert.ok(race.rows.every(r=>r.rank===1&&r.tied===8));
 assert.equal(CHANCE_RUNS,20000);
});
test('"4 недели" looks as far ahead as the transfer gains; its fact starts with the current tour',()=>{
 for(const today of ['2026-10-21','2026-10-26','2026-10-29','2026-11-05']){
  const c=ctx({today}),w=periodWindows(c),h=horizons(c);
  assert.equal(w.month.to,h.month.to);assert.equal(w.season.to,h.season.to);
 }
 const w=periodWindows(ctx({today:'2026-10-29'}));
 assert.deepEqual(w.week,{from:'2026-10-27',to:'2026-11-02'});assert.equal(w.month.from,'2026-10-27');assert.equal(w.season.from,'2026-10-20');
});
test('period facts follow the league table rule: a player counts only while on the team, and players add up to the team',()=>{
 // Player 1 (team 0) scores 10 on 20.10 and 30 on 29.10; team 0 sells him for 81 on 28.10, who scores 5 on 29.10.
 const games={1001:{games:[{date:'2026-10-20',played:true,points:10},{date:'2026-10-29',played:true,points:30}]},1081:{games:[{date:'2026-10-29',played:true,points:5}]}};
 const transfers=[{team:0,outId:1,inId:81,date:'2026-10-28',outPrice:1500,inPrice:1500}];
 const c=ctx({live:{clubs,players:games},transfers,rosters:seasonRosters(transfers,picks),today:'2026-10-30'});
 const season={from:'2026-10-20',to:'2027-04-12'},week2={from:'2026-10-27',to:'2026-11-02'};
 assert.equal(windowFact(c,0,season),teamPoints(c,transfers,picks)[0]);assert.equal(windowFact(c,0,season),15);
 assert.equal(windowFact(c,0,week2),5);assert.equal(windowFact(c,0,week2,'1001'),0);assert.equal(windowFact(c,0,week2,'1081'),5);
 assert.equal(windowFact(c,0,season,'1001')+windowFact(c,0,season,'1081'),windowFact(c,0,season));
});
test('the week and season windows open at the league opening night, before Sports.ru tour 1', async () => {
 const {periodWindows}=await import('../src/standings.js');
 const live={clubs:{A:[{date:'2026-10-22',week:1},{date:'2026-10-26',week:1},{date:'2026-10-27',week:2},{date:'2026-11-02',week:2}]}};
 const w=periodWindows({live,today:'2026-10-21'});
 assert.equal(w.week.from,'2026-10-20');assert.equal(w.week.to,'2026-10-26');assert.equal(w.season.from,'2026-10-20');
});
