import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters,stints,bank,weekStart,transfersThisWeek,perGame,injuryFactor,expectedPoints,transferOptions,bestTransfers,teamPoints,parseInjuries,PRIOR_GAMES,bestPackage,boxScorePoints,liveGamePoints,journalTransfers,allTransfers,transferVerdict,bestSwapFor,injuredTargets,acquisition,playRate,clockMinutes,CALIBRATION} from '../src/season.js';
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
test('calibrated update beats the old rule on the held-out season',()=>{
 for(const r of Object.values(CALIBRATION.holdout)){assert.ok(r.calibratedMAE<r.currentMAE);assert.ok(r.maeGain95[0]>0);}
});
test('minutes move the estimate before points per minute do',()=>{
 assert.equal(clockMinutes('35:30'),35.5);assert.equal(clockMinutes('00:00'),0);
 const vet={forecast:{meanPerGame:30,minutes:30}},rookie={...vet,isRookie:true};
 const games=Array.from({length:5},(_,i)=>({played:true,points:40,minutes:'40:00',date:'2026-10-2'+i}));
 const v=perGame(vet,{games}),r=perGame(rookie,{games});
 // Same 1 FP per minute: the estimate is exactly the expected minutes, between forecast and new role.
 assert.ok(Math.abs(v.value-v.minutes)<1e-9&&v.minutes>30&&v.minutes<40);
 assert.ok(r.value>v.value,'newcomers adapt to a new role faster');
 assert.equal(perGame(vet,{games:[...games,{played:true,points:10,minutes:''}]}).value,(10*30+210)/16);
});
test('missed games lower the play rate, also when only appearances are listed',()=>{
 const p={forecast:{games:78},sportsClub:'X'},k=CALIBRATION.availability.priorGames,prior=78/82;
 assert.equal(playRate(p,null,null),prior);
 const games=[{date:'2026-10-22',played:true},{date:'2026-10-24',played:false},{date:'2026-10-26',played:false}];
 assert.equal(playRate(p,{games},{today:'2026-10-27'}),(k*prior+1)/(k+3));
 const clubs={X:Array.from({length:6},(_,i)=>({date:'2026-10-2'+i,score:'100:90'}))};
 assert.equal(playRate(p,{games:[games[0]],club:'X'},{today:'2026-10-27',live:{clubs}}),(k*prior+1)/(k+6));
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
test('one-transfer package equals the best single swap; more transfers never lose',()=>{
 const c=ctx({injuries:new Map([['5001',{status:'Out',returnDate:'2027-01-01'}]])});
 const single=bestTransfers(c,{team:0,bankMoney:5000,sort:'month'})[0];
 const p1=bestPackage(c,{team:0,bankMoney:5000,k:1,sort:'month'});
 assert.ok(Math.abs(p1.gain-single.gain.month)<1e-6);assert.equal(p1.pairs.length,1);assert.equal(p1.pairs[0].out.id,1);
 const p2=bestPackage(c,{team:0,bankMoney:5000,k:2,sort:'month'}),p3=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'month'});
 assert.ok(p2.gain>=p1.gain-1e-6&&p3.gain>=p2.gain-1e-6);assert.ok(p3.pairs.length<=3);
 for(const x of p3.pairs){assert.deepEqual(x.in.positions,x.out.positions);assert.ok(x.in.id>80);}
});
test('a package can sell an expensive player to fund a better one elsewhere',()=>{
 // Free agent 100 (C, 39/game) costs 2400; with 0 in the bank only selling two players makes room.
 const prices=Object.fromEntries(players.slice(80).map(p=>[p.sportsId,{price:99999,position:p.positions[0],games:[]}]));prices[1100].price=2400;prices[1091].price=600;
 const c=ctx({live:{...live,players:prices}});
 assert.ok(!transferOptions(c,{team:0,outId:65,bankMoney:0,limit:100}).some(o=>o.player.id===100));
 const p=bestPackage(c,{team:0,bankMoney:0,k:2,sort:'season'});
 assert.ok(p.pairs.some(x=>x.in.id===100));assert.ok(p.bankAfter>=0);
});
test('box score uses the Sports.ru formula with the result bonus only for finished games',()=>{
 const line={MIN:'36',PTS:'30',FG:'11-20',FT:'6-8',REB:'10',AST:'8',STL:'2',BLK:'1',TO:'3',PF:'2'};
 assert.equal(boxScorePoints(line,{home:true,won:null}),30+10+8+2+1-9-2-6-2+2);
 assert.equal(boxScorePoints(line,{home:false,won:true}),34+3);
 assert.equal(boxScorePoints({...line,MIN:'8'},{home:true,won:false}),34-1-3);
 const event={status:{type:{completed:true}},competitions:[{competitors:[{team:{id:'1'},homeAway:'home',winner:false},{team:{id:'2'},homeAway:'away',winner:true}]}]};
 const summary={boxscore:{players:[{team:{id:'2'},statistics:[{labels:Object.keys(line),athletes:[{athlete:{id:'77'},stats:Object.values(line)},{athlete:{id:'78'},stats:[]}]}]}]}};
 assert.deepEqual(liveGamePoints(summary,event),{77:{points:37,minutes:36,final:true}});
});
test('packages never trade the season for a short-term gain unless asked',()=>{
 // Free agent 99 (C) is great this week but out from November; the roster centre is steady all season.
 const c=ctx({injuries:new Map([['5099',{status:'Out',returnDate:'2027-06-01'}]]),today:'2026-10-26'});
 c.injuries.set('5099',{status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-27'});
 const free=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'week',protectSeason:false}),safe=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'week'});
 assert.ok(safe.gains.season>=-1e-6);assert.ok(free.gain>=safe.gain-1e-6);
});
test('Sports.ru journals become FBL transfers after the roster matches the draft',()=>{
 const named=players.map(p=>({...p,sportsName:p.id===81||p.id===91?'Twin':'N'+p.id}));
 const draftRows=[...picks.filter((_,i)=>i%8===0).map(id=>({date:'2026-10-18',buy:{name:'N'+id,price:1500},sell:null}))];
 // Pre-draft churn, then the draft roster, then one real transfer: PG #1 out for 'Twin', a name two free-agent PGs (81, 91) share.
 const journal=[{date:'2026-10-16',buy:{name:'N99',price:1500},sell:null},{date:'2026-10-17',buy:{name:'N1',price:1500},sell:{name:'N99',price:1500}},
  ...draftRows.slice(1),{date:'2026-10-25',buy:{name:'Twin',price:1500},sell:{name:'N1',price:1500}}];
 const liveTeams={...live,teams:{0:{journal}}};
 const r=journalTransfers(named,liveTeams,picks);
 assert.equal(r.transfers.length,1);assert.equal(r.transfers[0].outId,1);assert.ok([81,91].includes(r.transfers[0].inId));
 assert.ok(r.warnings.some(w=>/неоднозначен/.test(w.message)));
 // Connected teams take transfers from Sports.ru only; the league log still covers the others.
 const all=allTransfers(named,liveTeams,{transfers:[{team:0,outId:9,inId:82,date:'2026-10-20'},{team:1,outId:2,inId:83,date:'2026-10-20',outPrice:1,inPrice:1}]},picks);
 assert.deepEqual(all.transfers.map(x=>[x.team,x.source]),[[1,'league'],[0,'sports.ru']]);
});
test('a sold player is matched by name and the buy by position and price',()=>{
 const named=players.map(p=>({...p,sportsName:[82,84].includes(p.id)?'Same':'N'+p.id}));
 // 82 is PG, 84 is SG: selling the SG #17 must bring the SG namesake.
 const journal=[...picks.filter((_,i)=>i%8===0).map(id=>({date:'2026-10-18',buy:{name:'N'+id,price:1500},sell:null})),{date:'2026-10-21',buy:{name:'Same',price:1500},sell:{name:'N17',price:1500}}];
 const r=journalTransfers(named,{...live,teams:{0:{journal}}},picks);
 assert.equal(r.transfers[0].inId,84);assert.equal(r.warnings.length,0);
});
test('a transfer that breaks the Sports.ru budget is flagged',()=>{
 const t=[{team:0,outId:1,inId:81,date:'2026-10-26',outPrice:1500,inPrice:9000}];
 const r=allTransfers(players,live,{transfers:t},picks);
 assert.ok(r.warnings.some(w=>w.team===0&&/превышен/.test(w.message)));
});
test('a day of transfers is one package: a dearer buy funded by a later sale the same day is no breach',()=>{
 const t=[{team:0,outId:1,inId:81,date:'2026-10-26',outPrice:1500,inPrice:8000},{team:0,outId:9,inId:82,date:'2026-10-26',outPrice:5000,inPrice:1500}];// bank 5000 → −1500 → +2000
 assert.ok(!allTransfers(players,live,{transfers:t},picks).warnings.some(w=>/превышен/.test(w.message)));
 const split=[t[0],{...t[1],date:'2026-10-27'}];
 assert.ok(allTransfers(players,live,{transfers:split},picks).warnings.some(w=>w.team===0&&/2026-10-26.*превышен/.test(w.message)));
});
test('a made transfer is judged by the forecast and compared with the best swap',()=>{
 // Team 0 sells #1 (PG, 30 a game) for #81 (PG, 20 a game); #92 (PG, 31 a game) was free.
 const t={team:0,outId:1,inId:81,date:'2026-10-20',outPrice:1500,inPrice:1500};
 const v=transferVerdict(ctx({rosters:seasonRosters([t],picks)}),t,{bankMoney:500});
 assert.equal(v.verdict,'down');assert.ok(v.gain.month<-15&&v.gain.season<v.gain.month);
 assert.equal(v.best.player.id,92);assert.ok(v.best.gain.month>0);
 const w=transferVerdict(ctx({rosters:seasonRosters([{...t,inId:92}],picks)}),{...t,inId:92},{bankMoney:500});
 assert.equal(w.verdict,'even');assert.equal(w.best,null);
});
test('a free player is brought in for the roster player he beats most, within the slots and the rookie rule',()=>{
 // #100 is a C (39 a game); team 0 has C #65 (30) and the rookie C #73, which must stay.
 const s=bestSwapFor(ctx(),{team:0,playerId:100,bankMoney:0});
 assert.equal(s.outId,65);assert.ok(s.gain.season>0);
 assert.equal(bestSwapFor(ctx(),{team:0,playerId:2,bankMoney:0}),null);// #2 plays for team 1
 const poor=players.map(p=>p.id===100?{...p,price:9000}:p);
 assert.equal(bestSwapFor(ctx({players:poor}),{team:0,playerId:100,bankMoney:0}),null);
});
test('injured free agents worth a season transfer are flagged when they are about to return',()=>{
 const injuries=new Map([['5100',{status:'Out',returnDate:'2026-10-22'}],['5099',{status:'Out',fantasyStatus:'OFS',returnDate:'2027-07-01'}],
  ['5090',{status:'Out',returnDate:'2026-10-22'}],['5098',{status:'Out',returnDate:'2026-11-18'}]]);
 const list=injuredTargets(ctx({injuries}),{team:0,bankMoney:0,minGain:20});
 // #99 is out for the season, #90 (29 a game) is no upgrade; #98 returns too late to be worth it on this short calendar.
 assert.deepEqual(list.map(x=>[x.player.id,x.swap.outId,x.soon]),[[100,65,true]]);
});
test('a player too expensive for one swap is bought within a package that funds him',()=>{
 // #100 (C, 39 a game) costs 3000 with an empty bank: selling C #65 alone (1500) is not enough.
 const pricey=players.map(p=>p.id===100?{...p,price:3000}:p.id===96?{...p,price:0}:p);
 const c=ctx({players:pricey});
 assert.equal(bestSwapFor(c,{team:0,playerId:100,bankMoney:0}),null);
 const one=acquisition(c,{team:0,playerId:100,bankMoney:0,k:1,minGain:0});assert.equal(one.worth,false);
 const two=acquisition(c,{team:0,playerId:100,bankMoney:0,k:2,minGain:0,monthFloor:-Infinity});
 assert.equal(two.worth,true);assert.ok(two.pack.pairs.some(x=>x.in.id===100));assert.ok(two.pack.bankAfter>=0);
});
