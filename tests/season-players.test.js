import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters,seasonForm,swapAnalyzer,bestSwaps,transferOptions,STREAK} from '../src/season.js';
import {seasonMethod} from '../src/forecast-text.js';
// The fixture of tests/season-transfers.test.js: 80 drafted players (ids 1..80, team = (id-1)%8, 30 a game) plus 20 free
// agents (ids 81..100, 20..39 a game), positions two per Sports.ru slot, the last round rookies.
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i<80?30:20+i-80,games:82}}));
const calendar=[{date:'2026-10-23',week:1},{date:'2026-10-25',week:1},{date:'2026-10-28',week:2},{date:'2026-11-20',week:5}];
const live={clubs:Object.fromEntries(players.map(p=>[p.sportsClub,calendar])),players:{}};
const ctx=(extra={})=>({players,live,injuries:new Map(),today:'2026-10-20',rosters:seasonRosters([],picks),...extra});
const game=(date,points,extra={})=>({date,played:true,points,minutes:'30:00',pointsSource:'ESPN',...extra});
const norm20={forecast:{meanPerGame:20}};

// ---------- seasonForm: this season's average and the streak ----------
test('the average counts only games with FBL points, in date order, and the streak runs back from the latest game',()=>{
 // Out of order on purpose; the NO_BOX row has no FBL points and a DNP row is not a game.
 const row={games:[game('2026-10-26',27),game('2026-10-22',12),game('2026-10-24',26),game('2026-10-25',40,{pointsSource:'NO_BOX'}),
  {date:'2026-10-23',played:false},game('2026-10-28',30)]};
 const f=seasonForm(norm20,row);
 assert.equal(f.games,4);assert.equal(f.total,12+26+27+30);assert.equal(f.average,95/4);assert.equal(f.minutes,30);
 assert.deepEqual(f.last.map(g=>g.date),['2026-10-22','2026-10-24','2026-10-26','2026-10-28']);
 // Hot from 25 (20 × 1.25, at least 20 + 3): 26, 27 and 30 in a row; the 12 before them is cold and ends the run.
 assert.deepEqual(f.last.map(g=>g.state),['cold','hot','hot','hot']);
 assert.deepEqual(f.streak,{kind:'hot',length:3});
});
test('a cold streak needs 25% and 3 FP below the forecast; one game or a game in between is no streak',()=>{
 assert.deepEqual(seasonForm(norm20,{games:[game('2026-10-22',14),game('2026-10-24',15)]}).streak,{kind:'cold',length:2});
 // 16 is 20% below: not cold, and it breaks the run before it.
 assert.equal(seasonForm(norm20,{games:[game('2026-10-22',14),game('2026-10-24',16)]}).streak,null);
 assert.equal(seasonForm(norm20,{games:[game('2026-10-22',40)]}).streak,null,`a streak needs ${STREAK.min} games`);
 // A low forecast: hot needs the 3 FP margin (6 > 4 × 1.25), cold only a game 3 FP under it.
 const low={forecast:{meanPerGame:4}};
 assert.equal(seasonForm(low,{games:[game('2026-10-22',5),game('2026-10-24',5.5)]}).streak,null);
 assert.deepEqual(seasonForm(low,{games:[game('2026-10-22',7),game('2026-10-24',8)]}).streak,{kind:'hot',length:2});
 // Without a forecast there is no norm: the average still shows, no streak and no game marked.
 const none=seasonForm({},{games:[game('2026-10-22',40),game('2026-10-24',41)]});
 assert.equal(none.average,40.5);assert.equal(none.streak,null);assert.equal(none.norm,null);assert.ok(none.last.every(g=>g.state==='even'));
 // No games: nothing to average.
 assert.deepEqual(seasonForm(norm20,{games:[]}),{games:0,total:0,average:null,norm:20,minutes:null,last:[],streak:null});
 assert.equal(seasonForm(norm20,{games:Array.from({length:9},(_,i)=>game(`2026-11-${10+i}`,20))}).last.length,STREAK.shown);
});

// ---------- swapAnalyzer: the best swap for every free player, by transferOptions' own rules ----------
test('the analyser finds, for every free player, the swap transferOptions ranks first for him',()=>{
 const c=ctx({today:'2026-10-21'});
 for(const sort of ['week','month','season']){
  const map=bestSwaps(c,{team:0,bankMoney:300,sort});
  assert.deepEqual([...map.keys()].sort((a,b)=>a-b),Array.from({length:20},(_,i)=>81+i),'every free player, none of the drafted ones');
  for(const [id,r] of map){
   let best=null;
   for(const outId of c.rosters[0]){const o=transferOptions(c,{team:0,outId,bankMoney:300,limit:200,sort}).find(o=>o.player.id===id);if(o&&(!best||o.gain[sort]>best.gain[sort]))best=o;}
   assert.equal(Boolean(r.best),Boolean(best),`${sort} #${id}`);
   if(best){assert.equal(r.best.outId,best.outId);assert.ok(Math.abs(r.best.gain[sort]-best.gain[sort])<1e-9);assert.equal(r.best.bankAfter,best.bankAfter);}
  }
 }
 const analyse=swapAnalyzer(c,{team:0,bankMoney:300,sort:'season'});
 assert.equal(analyse(1),null,'a player an FBL team holds');
 assert.equal(analyse(81),analyse(81),'answers are remembered');
});
test('without a legal swap the analyser says why: the money it lacks, the club limit, the rookie rule or the white rule',()=>{
 const pricey=players.map(p=>p.id===100?{...p,price:2100}:p);
 assert.deepEqual(swapAnalyzer(ctx({players:pricey}),{team:0,bankMoney:300,sort:'month'})(100),{reason:'money',need:300},'2100 against 1500 + 300');
 // Team 0 already holds two players of club C0 (ids 1 and 41): a third one may not come in for anyone else.
 const sameClub=players.map(p=>p.id===100?{...p,sportsClub:'C0'}:p);
 const live2={...live,clubs:{...live.clubs,C0:calendar}};
 assert.deepEqual(swapAnalyzer(ctx({players:sameClub,live:live2}),{team:0,bankMoney:300,sort:'month'})(100),{reason:'club'});
 // Team 0's only rookie is its C #73 (round 10) and #65, the other C, the white list's only player on it: a veteran centre
 // can replace neither. The first sale's rule is named (roster order).
 assert.deepEqual(swapAnalyzer(ctx({white:new Set(['65'])}),{team:0,bankMoney:300,sort:'month'})(100),{reason:'white'});
 const swapped=players.map(p=>p.id===65?{...p,isRookie:true}:p.id===73?{...p,isRookie:false}:p);
 assert.deepEqual(swapAnalyzer(ctx({players:swapped,white:new Set(['73'])}),{team:0,bankMoney:300,sort:'month'})(100),{reason:'rookie'});
 // Without the white list the same centre comes in for #65.
 assert.equal(swapAnalyzer(ctx(),{team:0,bankMoney:300,sort:'month'})(100).best.outId,65);
});

test('the players page method names the streak rule from STREAK and the analyser rules',()=>{
 const lines=seasonMethod().players.join('\n');
 assert.match(lines,new RegExp(`последние ${STREAK.min}\\+ матча подряд выше прогноза до сезона на 25`));
 assert.match(lines,/после трёх — на 3,3 выше/);assert.match(lines,/белое правило/);assert.match(lines,/от 70/);
});
