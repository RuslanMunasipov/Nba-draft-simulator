import test from 'node:test';import assert from 'node:assert/strict';
import {gameWeeks,weekOf,horizons,withMarket,seasonRosters,stints,bank,weekStart,transfersThisWeek,perGame,injuryFactor,expectedPoints,transferOptions,bestTransfers,teamPoints,parseInjuries,PRIOR_GAMES,bestPackage,boxScorePoints,liveGamePoints,journalTransfers,allTransfers,transferVerdict,bestSwapFor,injuredTargets,acquisition,playRate,newsInjuries,clockMinutes,CALIBRATION,withBoxScores} from '../src/season.js';
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
// 80 drafted players (ids 1..80, team = (id-1)%8) plus 20 free agents (ids 81..100).
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i<80?30:20+i-80,games:82}}));
const calendar=[{date:'2026-10-23',week:1},{date:'2026-10-25',week:1},{date:'2026-10-28',week:2},{date:'2026-11-20',week:5}];
// Every drafted club appears twice per team (the Sports.ru limit); free agents each have their own club.
const live={clubs:Object.fromEntries(players.map(p=>[p.sportsClub,calendar])),players:{}};
const ctx=(extra={})=>({players,live,injuries:new Map(),today:'2026-10-20',rosters:seasonRosters([],picks),...extra});

test('transfers move players between the draft roster and the free agent pool',()=>{
 const t=[{team:0,outId:1,inId:81,date:'2026-10-22',outPrice:1500,inPrice:1400}];
 const r=seasonRosters(t,picks);assert.equal(r[0][0],81);assert.equal(r[0].length,10);
 // Sports.ru lets two teams hold one player: the rules check flags it, the rosters keep both.
 const shared=seasonRosters([...t,{team:1,outId:2,inId:81,date:'2026-10-23'}],picks);assert.ok(shared[0].includes(81)&&shared[1].includes(81));
 assert.throws(()=>seasonRosters([...t,{team:0,outId:picks[8],inId:81,date:'2026-10-23'}],picks),/этой команды/);
 // Each team's stint of a shared player is its own.
 const both=stints([...t,{team:1,outId:2,inId:81,date:'2026-10-23'}],picks).filter(x=>x.playerId===81);
 assert.deepEqual(both.map(x=>[x.team,x.from,x.to]).sort(),[[0,'2026-10-22',null],[1,'2026-10-23',null]]);
 assert.throws(()=>seasonRosters([{team:0,outId:2,inId:82,date:'2026-10-23'}],picks),/нет в составе/);
 const s=stints(t,picks);assert.deepEqual(s.find(x=>x.playerId===1),{team:0,playerId:1,from:'2026-10-18',fromAt:null,to:'2026-10-22',toAt:null});
 assert.equal(bank(0,t,()=>1500,picks),20000-15000+100);
});
test('without a calendar the week runs Tuesday to Monday in Moscow dates',()=>{
 assert.equal(weekStart('2026-10-26'),'2026-10-20');assert.equal(weekStart('2026-10-27'),'2026-10-27');
 const t=[{team:0,date:'2026-10-24'},{team:0,date:'2026-10-27'},{team:1,date:'2026-10-28'}];
 assert.equal(transfersThisWeek(t,0,'2026-10-26'),1);assert.equal(transfersThisWeek(t,0,'2026-10-28'),1);
});
test('game weeks follow the Sports.ru calendar, breaks included',()=>{
 const cal={X:[{date:'2026-10-20',week:1},{date:'2026-10-26',week:1},{date:'2026-10-27',week:2},{date:'2026-11-02',week:2},{date:'2026-12-04',week:7},{date:'2026-12-13',week:8}]};
 const w=gameWeeks({clubs:cal});
 assert.deepEqual(w,{1:{start:'2026-10-20',end:'2026-10-26'},2:{start:'2026-10-27',end:'2026-11-02'},7:{start:'2026-11-03',end:'2026-12-04'},8:{start:'2026-12-05',end:'2026-12-13'}});
 assert.equal(weekOf('2026-12-08',w).n,'8');assert.ok(weekOf('2026-10-19',w).preseason);
 // Pre-season moves are free; a move on a week's last (Monday) date comes after its games and counts for the next week.
 const t=[{team:0,date:'2026-10-19'},{team:0,date:'2026-10-19'},{team:0,date:'2026-10-26'},{team:0,date:'2026-10-27'},{team:0,date:'2026-10-23'}];
 assert.equal(transfersThisWeek(t,0,'2026-10-19',w),0);assert.equal(transfersThisWeek(t,0,'2026-10-24',w),1);assert.equal(transfersThisWeek(t,0,'2026-10-27',w),2);
 assert.equal(horizons({live:{clubs:cal},today:'2026-10-22'}).week.to,'2026-10-26');
});
test('a third player of one NBA club is never offered',()=>{
 const c=ctx(),club=players[0].sportsClub;
 const crowded=players.map(p=>p.id===85?{...p,sportsClub:club,positions:players[0].positions}:p);
 const options=transferOptions({...c,players:crowded,live:{...live,clubs:{...live.clubs}}},{team:0,outId:9,bankMoney:5000,limit:50});
 assert.ok(options.length>0);assert.ok(!options.some(o=>o.player.id===85));
 // Selling one of the two from that club frees the place.
 const freed=transferOptions({...c,players:crowded},{team:0,outId:1,bankMoney:5000,limit:50});
 assert.ok(freed.some(o=>o.player.id===85));
 const pack=bestPackage({...c,players:crowded},{team:0,bankMoney:5000,k:3,sort:'month',protectSeason:false});
 const next=c.rosters[0].filter(id=>!pack.pairs.some(x=>x.out.id===id)).concat(pack.pairs.map(x=>x.in.id));
 assert.ok(next.filter(id=>crowded.find(p=>p.id===id).sportsClub===club).length<=2);
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
 // The same counting rate in a bigger role (29 points per 30 minutes plus the +1): without the early-season lift the
 // estimate is that rate times the expected minutes, between forecast and new role, plus the +1, which minutes do not scale.
 const same=games.map(g=>({...g,points:29/30*40+1})),e=perGame(vet,{games:same},{...CALIBRATION.points,offsets:null});
 assert.ok(Math.abs(e.value-(29/30*e.minutes+1))<1e-9&&e.minutes>30&&e.minutes<40);
 assert.ok(v.minutes>30&&v.minutes<40);
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
 // Without absence hazards each available game counts with the season share.
 assert.ok(Math.abs(expectedPoints(players[0],c,'2026-10-20','2026-11-30').games-2*playRate(players[0],undefined,c))<1e-9);
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
test('box score uses the FBL formula as Yahoo counts it: no team result bonus, 1 per game played',()=>{
 const line={MIN:'36',PTS:'30',FG:'11-20',FT:'6-8',REB:'10',AST:'8',STL:'2',BLK:'1',TO:'3',PF:'2'};
 assert.equal(boxScorePoints(line),30+10+8+2+1-9-2-6-2+1);
 assert.equal(boxScorePoints({...line,MIN:'8'}),33);
 // A few seconds on court with nothing else still earn the participation point.
 assert.equal(boxScorePoints({MIN:'0',FG:'0-0',FT:'0-0',PTS:'0',REB:'0'}),1);
 const event={status:{type:{completed:true}},competitions:[{competitors:[{team:{id:'1'},homeAway:'home',winner:false},{team:{id:'2'},homeAway:'away',winner:true}]}]};
 const summary={boxscore:{players:[{team:{id:'2'},statistics:[{labels:Object.keys(line),athletes:[{athlete:{id:'77'},stats:Object.values(line)},{athlete:{id:'78'},stats:[]}]}]}]}};
 assert.deepEqual(liveGamePoints(summary,event),{77:{points:33,minutes:36,final:true,onCourt:false,counting:32,name:'',team:'',line}});
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
 // #100 (C, 45 a game) costs 3000 with an empty bank: selling C #65 alone (1500) is not enough. He is the real upgrade:
 // the best package without him gains less (a 39-a-game #100 is not worth buying, since his package only beat doing nothing).
 const pricey=players.map(p=>p.id===100?{...p,price:3000,forecast:{...p.forecast,meanPerGame:45}}:p.id===96?{...p,price:0}:p);
 const c=ctx({players:pricey});
 assert.equal(bestSwapFor(c,{team:0,playerId:100,bankMoney:0}),null);
 const one=acquisition(c,{team:0,playerId:100,bankMoney:0,k:1,minGain:0});assert.equal(one.worth,false);
 const two=acquisition(c,{team:0,playerId:100,bankMoney:0,k:2,minGain:0,monthFloor:-Infinity});
 assert.equal(two.worth,true);assert.ok(two.pack.pairs.some(x=>x.in.id===100));assert.ok(two.pack.bankAfter>=0);
});

test('an injured player bought for the season is a season investment, not a weakening',()=>{
 const c=ctx({today:'2026-10-21'}),star={...players[80],id:81,forecast:{meanPerGame:60,games:82}};
 const list=players.map(p=>p.id===81?star:p);
 const injuries=new Map([[star.espnId,{status:'Out',returnDate:'2026-11-25',fantasyStatus:''}]]);
 const cal=Array.from({length:60},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*3*864e5).toISOString().slice(0,10),week:1+Math.floor(i/3)}));
 const liveCal={...live,clubs:Object.fromEntries(list.map(p=>[p.sportsClub,cal]))};
 const t={team:0,outId:1,inId:81,date:'2026-10-21',outPrice:1500,inPrice:1500};
 const v=transferVerdict({...c,players:list,live:liveCal,injuries,rosters:seasonRosters([t],picks)},t,{bankMoney:5000});
 assert.ok(v.gain.month<-15&&v.gain.season>15);assert.equal(v.verdict,'long');
});
test('a running or already listed game is not expected again',()=>{
 const p=players[0],cal=[{date:'2026-10-21'},{date:'2026-10-22'},{date:'2026-10-23'},{date:'2026-10-19'}];
 const base={...ctx({today:'2026-10-21'}),live:{clubs:{[p.sportsClub]:cal},players:{[p.sportsId]:{games:[{date:'2026-10-22',played:true,points:30,minutes:'30:00'}]}}}};
 const share=playRate(p,base.live.players[p.sportsId],base);
 assert.ok(Math.abs(expectedPoints(p,base,'2026-10-19','2026-10-30').games-2*share)<1e-9);
 assert.ok(Math.abs(expectedPoints(p,{...base,running:new Map([[p.id,{day:'2026-10-21'}]])},'2026-10-19','2026-10-30').games-share)<1e-9);
});
test('a game gone from the calendar (played, not listed for the player) is not expected again',()=>{
 const p=players[0],cal=[{date:'2026-10-21',gone:true},{date:'2026-10-21',opponent:'X'},{date:'2026-10-23'}];
 const base={...ctx({today:'2026-10-21'}),live:{clubs:{[p.sportsClub]:cal},players:{[p.sportsId]:{games:[]}}}};
 assert.ok(Math.abs(expectedPoints(p,base,'2026-10-19','2026-10-30').games-2*playRate(p,base.live.players[p.sportsId],base))<1e-9);
});
test('period windows: tours the calendar no longer lists are rebuilt back to the scoring start', async () => {
 const {periodList}=await import('../src/season.js');
 // 05.11: tours 1 and 2 are over and gone from Sports.ru's calendar, tour 3's first game (03.11) too.
 const list=periodList({3:{start:'2026-11-04',end:'2026-11-09'},4:{start:'2026-11-10',end:'2026-11-16'}});
 assert.deepEqual(list.map(w=>[w.n,w.start,w.end]),[[1,'2026-10-20','2026-10-26'],[2,'2026-10-27','2026-11-02'],[3,'2026-11-03','2026-11-09'],[4,'2026-11-10','2026-11-16']]);
 const {periodWindows}=await import('../src/standings.js');
 const w=periodWindows({today:'2026-11-05',live:{weeks:{3:{start:'2026-11-04',end:'2026-11-09'},4:{start:'2026-11-10',end:'2026-11-16'}}},players:[],rosters:[]});
 assert.deepEqual([w.week.from,w.week.to,w.season.from],['2026-11-03','2026-11-09','2026-10-20']);
});
test('market players missing from the database get a price-based prior and are matched by the roster json',()=>{
 const live2={players:{'777':{name:'Новичок',fullName:'Новый Игрок',position:'C',price:1500,club:'Q'}}};
 const all=withMarket(players,live2),x=all.find(p=>p.sportsId==='777');
 assert.equal(x.id,'sports:777');assert.equal(x.isRookie,false);assert.equal(x.forecast.origin,'SPORTS_PRICE_PRIOR');
 assert.equal(x.forecast.meanPerGame,30);
 assert.equal(withMarket(players,{players:{}}),players);
});

test('the derived roster is checked against the roster Sports.ru shows',()=>{
 const roster=picks.filter((_,i)=>i%8===0).map(id=>({sportsId:String(1000+id)}));
 assert.deepEqual(allTransfers(players,{teams:{0:{journal:[],roster}}},{transfers:[]},picks).warnings.filter(w=>/расходится/.test(w.message)),[]);
 const off=[...roster.slice(1),{sportsId:'1081'}],w=allTransfers(players,{teams:{0:{journal:[],roster:off}}},{transfers:[]},picks).warnings;
 assert.ok(w.some(x=>/расходится.*P1\b/.test(x.message)));
});
test('a swap explanation splits the gain exactly and grows surer with a bigger gap',async()=>{
 const {explainSwap}=await import('../src/season.js');
 const cal=Array.from({length:30},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*2*864e5).toISOString().slice(0,10),week:1+Math.floor(i/4)}));
 const f=(mean,games)=>({meanPerGame:mean,games,meanSeason:mean*games,seasonFloor:mean*games*.6,seasonCeiling:mean*games*1.3,gameFloor:mean*.5,gameCeiling:mean*1.5});
 const list=players.map(p=>p.id===81?{...p,forecast:f(34,80)}:p.id===82?{...p,forecast:f(31,80)}:p.id===1?{...p,forecast:f(30,60)}:p);
 const c={...ctx({today:'2026-10-21'}),players:list,live:{clubs:Object.fromEntries(list.map(p=>[p.sportsClub,cal])),players:{}}};
 const big=explainSwap(c,1,81,'season'),small=explainSwap(c,1,82,'season');
 assert.ok(Math.abs(big.parts.perGame+big.parts.availability+big.parts.schedule-big.gain)<1e-6);
 // The model's z grows with the gap; the calibrated chance (data/confidence-calibration.json, a step map) never falls with it.
 assert.ok(big.gain>small.gain&&big.z>small.z&&big.confidence>=small.confidence&&big.confidence<1);
 assert.ok(big.parts.availability>0&&big.parts.perGame>0);
 assert.equal(big.sides[0].out.player.id,1);assert.equal(big.sides[0].in.player.id,81);
 const pack=explainSwap(c,null,null,'season',[[1,81],[2,82]]);assert.equal(pack.sides.length,2);
});

test('a healthy player is expected in the next games more often than his season share; an injured one from his return',()=>{
 const p={...players[0],forecast:{...players[0].forecast,games:62,availability:{hazards:[.09,.03]}}};
 const cal=Array.from({length:60},(_,i)=>({date:new Date(Date.UTC(2026,9,21+2*i)).toISOString().slice(0,10)}));
 const base={...ctx({today:'2026-10-21'}),live:{clubs:{[p.sportsClub]:cal},players:{}}},share=playRate(p,undefined,base);
 const week=expectedPoints(p,base,'2026-10-21','2026-10-27'),all=expectedPoints(p,base,'2026-10-21','2027-12-31');
 assert.ok(week.games/4>share+.05,`next games ${week.games/4} vs share ${share}`);
 assert.ok(all.games/60<week.games/4&&Math.abs(all.games/60-share)<.08);
 // ESPN dates the return by the US day: 28.10 is the evening game Sports.ru files under 29.10.
 const hurt={...base,injuries:new Map([[String(p.espnId),{status:'Out',returnDate:'2026-10-28'}]])};
 assert.equal(expectedPoints(p,hurt,'2026-10-21','2026-10-27').games,0);
 // After the return he starts healthy again: the first week back is worth the same as a healthy week now.
 assert.ok(Math.abs(expectedPoints(p,hurt,'2026-10-29','2026-11-04').games-expectedPoints(p,base,'2026-10-21','2026-10-27').games)<1e-9);
});

test('injuries named in ESPN news are summarised by body part with first and last mention',()=>{
 const feed=[{headline:'Zubac (ankle) is questionable',published:'2026-03-16T10:00Z'},{headline:'x',story:'<p>Zubac (ankle) will play</p>',published:'2026-03-12T10:00Z'},
  {headline:'Zubac (ribs) collected 24 points',published:'2026-07-07T10:00Z'},{headline:'Zubac (personal) is out',published:'2026-01-01T10:00Z'}];
 assert.deepEqual(newsInjuries(feed),[{part:'голеностоп',mentions:2,first:'2026-03-12',last:'2026-03-16'},{part:'рёбра',mentions:1,first:'2026-07-07',last:'2026-07-07'}]);
});

test('the only player counting for the white rule leaves only for another who counts, in swaps and packages',()=>{
 const c=ctx({white:new Set(['1','81'])});
 const opts=transferOptions(c,{team:0,outId:1,bankMoney:5000,limit:50,sort:'season'});
 assert.ok(opts.length>0&&opts.every(o=>o.player.id===81),'only the listed free player replaces him');
 assert.ok(transferOptions(ctx(),{team:0,outId:1,bankMoney:5000,limit:50,sort:'season'}).length>1,'without a list every slot fit is offered');
 const pack=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season'});
 if(pack){const ids=new Set(c.rosters[0]);for(const x of pack.pairs){ids.delete(x.out.id);ids.add(x.in.id);}assert.ok(ids.has(1)||ids.has(81));}
});
test('a team that trades back to its exact draft roster keeps both transfers',async()=>{
 const {journalTransfers}=await import('../src/season.js');
 const {DRAFT_PICKS}=await import('../src/fbl-draft-2026.js');
 // Team 0's ten picks and one free player, all on Sports.ru, with their own short names.
 const mine=DRAFT_PICKS.filter((_,i)=>i%8===0).map((id,i)=>({id,name:`Player ${i}`,sportsId:`s${i}`,position:'PG',price:1500}));
 const other={id:'free-1',name:'Free One',sportsId:'f1',position:'PG',price:1400};
 const short=p=>`П${p.sportsId}`;
 const players={};for(const p of [...mine,other])players[p.sportsId]={fullName:p.name,name:short(p),price:p.price,initialPrice:p.price,position:'PG'};
 const draftRows=mine.map(p=>({date:'2026-10-18',buy:{name:short(p),price:p.price},sell:null}));
 const out=mine[9];
 const there={date:'2026-10-20',buy:{name:short(other),price:other.price},sell:{name:short(out),price:out.price}};
 const back={date:'2026-10-20',buy:{name:short(out),price:out.price},sell:{name:short(other),price:other.price}};
 // Sports.ru put a draft row after the day's transfers: order within a date is not stable.
 const journal=[...draftRows.slice(0,9),there,back,draftRows[9]];
 const r=journalTransfers([...mine,other],{players,teams:{0:{journal}}});
 assert.equal(r.transfers.filter(x=>x.team===0).length,2,JSON.stringify(r.warnings));
});
test('a deal counts as reported by its sale and purchase: Sports.ru re-pairs a day\'s rows',async()=>{
 const {unreported}=await import('../src/season.js');
 const t=(out,inn)=>({team:0,outId:out,inId:inn,date:'2026-10-20'});
 // Reported as J→O and K→E; the journal now pairs them J→E and K→O, plus a new W→K.
 const now=[t('J','E'),t('K','O'),t('W','K')];
 const fresh=unreported(now,['0:J>O:2026-10-20','0:K>E:2026-10-20']);
 assert.deepEqual([...fresh],[now[2]]);
 // Ids with a colon (espn:…) are read whole.
 assert.equal(unreported([t('espn:1','2')],['0:espn:1>2:2026-10-20']).size,0);
 assert.equal(unreported([t('espn:1','2')],[]).size,1);
});
test('reported deals are a multiset of journal events: a deal repeated the same day, re-paired rows, a renamed resolution',async()=>{
 const {unreported,dealEvents,reportedEvents}=await import('../src/season.js');
 const d=(out,inn,o='A',i='B')=>({team:2,outId:out,inId:inn,outName:o,inName:i,outPrice:1800,inPrice:1600,date:'2026-10-20'});
 // Kessler→Queta, back, and Kessler→Queta again: the third is new even though its key equals the first's.
 const [a,b,c]=[d(1,2,'Кесслер','Кета'),d(2,1,'Кета','Кесслер'),d(1,2,'Кесслер','Кета')];
 assert.deepEqual([...unreported([a,b,c],[],[...dealEvents(a),...dealEvents(b)])],[c]);
 // The journal's words, not the resolved ids: «Уайт» resolving to another player later is the same deal.
 const w1={...d(5,7,'Сабонис','Уайт')},w2={...w1,inId:8};
 assert.equal(unreported([w2],[],dealEvents(w1)).size,0);
 // A state from before events were kept: its id keys cover their deals once.
 assert.deepEqual(reportedEvents([a],{reported:['2:1>2:2026-10-20']}),dealEvents(a));
});
test('rows of a day listed out of order, and namesakes pinned by the watcher, resolve to the right deals',async()=>{
 const {journalTransfers}=await import('../src/season.js');
 const {DRAFT_PICKS}=await import('../src/fbl-draft-2026.js');
 const mine=DRAFT_PICKS.filter((_,i)=>i%8===0).map((id,i)=>({id,name:`Player ${i}`,sportsId:`s${i}`,position:'PG',price:1500}));
 const coby={id:'coby',name:'Coby White',sportsId:'c1',position:'PG',price:1500},derrick={id:'derrick',name:'Derrick White',sportsId:'d1',position:'PG',price:1800};
 const short=p=>p.id==='coby'||p.id==='derrick'?'Уайт':`П${p.sportsId}`;
 const players={};for(const p of [...mine,coby,derrick])players[p.sportsId]={fullName:p.name,name:short(p),price:p.price,initialPrice:p.price,position:'PG'};
 const draft=mine.map(p=>({date:'2026-10-18',buy:{name:short(p),price:p.price},sell:null}));
 const out=mine[9];
 // Sold for Derrick White (pinned by the watcher), then back: Sports.ru lists the buy-back first.
 const there={date:'2026-10-20',buy:{name:'Уайт',price:1800},sell:{name:short(out),price:1500},buySid:'d1',sellSid:'s9'};
 const back={date:'2026-10-20',buy:{name:short(out),price:1500},sell:{name:'Уайт',price:1800}};
 const r=journalTransfers([...mine,coby,derrick],{players,teams:{0:{journal:[...draft,back,there]}}});
 assert.deepEqual(r.transfers.map(x=>[x.outId,x.inId]),[[out.id,'derrick'],['derrick',out.id]],JSON.stringify(r.warnings));
});
test('every order Sports.ru lists a day\'s package in gives the same deals',async()=>{
 const {journalTransfers}=await import('../src/season.js');
 const {DRAFT_PICKS}=await import('../src/fbl-draft-2026.js');
 // Team 0 on 20.10.2026: Сабонис → Уайт (Derrick White), then one read showing five rows chained through each other.
 const own=[['Йокич',3500,'C'],['Книппел',1700,'SG'],['Сабонис',2100,'C'],...[3,4,5,6,7,8,9].map(i=>[`П${i}`,1500,'PG'])];
 const mine=DRAFT_PICKS.filter((_,i)=>i%8===0).map((id,i)=>({id,name:own[i][0],sportsId:`s${i}`,position:own[i][2],price:own[i][1]}));
 const free=[['embiid','Эмбиид',2300,'C'],['okongwu','Оконгву',1700,'C'],['derrick','Уайт',1800,'SG'],['coby','Уайт',1500,'PG']].map(([id,name,price,position])=>({id,name,sportsId:id,position,price}));
 const players={};for(const p of [...mine,...free])players[p.sportsId]={fullName:p.name,name:p.name,price:p.price,initialPrice:p.price,position:p.position};
 const row=(sell,sp,buy,bp,seenAt)=>({date:'2026-10-20',sell:{name:sell,price:sp},buy:{name:buy,price:bp},seenAt,seenAfter:new Date(Date.parse(seenAt)-60e3).toISOString()});
 const draft=mine.map(p=>({date:'2026-10-18',buy:{name:p.name,price:p.price},sell:null})),before=row('Сабонис',2100,'Уайт',1800,'2026-10-20T08:03:27Z');
 const at='2026-10-20T08:11:29Z',pack=[row('Йокич',3500,'Эмбиид',2300,at),row('Книппел',1700,'Оконгву',1700,at),row('Уайт',1800,'Книппел',1700,at),row('Эмбиид',2300,'Сабонис',2100,at),row('Оконгву',1700,'Йокич',3500,at)];
 const perms=a=>a.length<2?[a]:a.flatMap((x,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(p=>[x,...p]));
 const [jokic,knueppel,sabonis]=mine.map(p=>p.id),want=[[sabonis,'derrick'],[jokic,'embiid'],[knueppel,'okongwu'],['derrick',knueppel],['embiid',sabonis],['okongwu',jokic]].map(d=>d.join('>')).sort();
 const orders=perms(pack);assert.equal(orders.length,120);
 for(const order of orders){
  const r=journalTransfers([...mine,...free],{players,teams:{0:{journal:[...draft,before,...order]}}});
  assert.deepEqual(r.warnings,[],order.map(x=>`${x.sell.name}→${x.buy.name}`).join(', '));
  assert.deepEqual(r.transfers.map(x=>`${x.outId}>${x.inId}`).sort(),want);
 }
 // A namesake of a held player is bought, not waited for: holding Coby White, the team buys Derrick White.
 const coby=mine.map((p,i)=>i===9?{...free[3]}:p),buy={date:'2026-10-20',sell:{name:'П8',price:1500},buy:{name:'Уайт',price:1800}};
 const r=journalTransfers([...coby,...free.slice(0,3)],{players,teams:{0:{journal:[...coby.map(p=>({date:'2026-10-18',buy:{name:p.name,price:p.price},sell:null})),buy,row('П7',1500,'Эмбиид',2300,at)]}}},
  DRAFT_PICKS.map((id,i)=>i===72?'coby':id));
 assert.deepEqual(r.transfers.map(x=>[x.outId,x.inId]),[[mine[7].id,'embiid'],[mine[8].id,'derrick']],JSON.stringify(r.warnings));
});
test('an unpinned purchase: the roster json first, then the journal price, then position; a shared player is no evidence',async()=>{
 const {journalTransfers}=await import('../src/season.js');
 const {DRAFT_PICKS}=await import('../src/fbl-draft-2026.js');
 const own=[['Сабонис',2100,'C'],['Вашингтон',1400,'PF'],...[2,3,4,5,6,7,8,9].map(i=>[`П${i}`,1500,'PG'])];
 const mine=DRAFT_PICKS.filter((_,i)=>i%8===0).map((id,i)=>({id,name:own[i][0],sportsId:`s${i}`,position:own[i][2],price:own[i][1]}));
 // Team 1 holds Derrick White and Morez Johnson since the draft: Sports.ru allows it, so they may still be bought.
 const derrick={id:DRAFT_PICKS[1],name:'Уайт',sportsId:'derrick',position:'SG',price:1800},morez={id:DRAFT_PICKS[9],name:'Джонсон',sportsId:'morez',position:'PF',price:1200};
 const coby={id:'coby',name:'Уайт',sportsId:'coby',position:'PG',price:1500},tre={id:'tre',name:'Джонсон',sportsId:'tre',position:'SG',price:1200},jalen={id:'jalen',name:'Джонсон',sportsId:'jalen',position:'PF',price:2300};
 const all=[...mine,derrick,morez,coby,tre,jalen],players={};for(const p of all)players[p.sportsId]={fullName:p.name,name:p.name,price:p.price,initialPrice:p.price,position:p.position};
 const draft=mine.map(p=>({date:'2026-10-18',buy:{name:p.name,price:p.price},sell:null}));
 const deals=[{date:'2026-10-20',sell:{name:'Сабонис',price:2100},buy:{name:'Уайт',price:1800}},{date:'2026-10-20',sell:{name:'Вашингтон',price:1400},buy:{name:'Джонсон',price:1200}}];
 // The roster json was read before the deals: it names neither White nor any Johnson.
 const stale=mine.map(p=>({sportsId:p.sportsId}));
 const run=(roster=stale)=>journalTransfers(all,{players,teams:{0:{journal:[...draft,...deals],roster}}}).transfers.map(x=>x.inId);
 // Derrick at 1800, not Coby (1500) because Derrick is held elsewhere; of the two 1200 Johnsons the PF, not a dearer PF.
 assert.deepEqual(run(),[derrick.id,morez.id]);
 // The roster json, when it names the player, outranks everything.
 assert.deepEqual(run([...stale.slice(2),{sportsId:'coby'},{sportsId:'tre'}]),['coby','tre']);
});
test('finished games Sports.ru has not counted yet are scored at once from the ESPN box score', () => {
 // Maxey on 21.10: Sports.ru lists the game as played (39:33) with 0 points before it counts it.
 const live={collectedAt:'2026-10-21T02:20:20Z',players:{
  1:{club:'Филадельфия',games:[{date:'2026-10-21',opponent:'Нью-Йорк',home:false,minutes:'39:33',points:0,played:true}]},
  2:{club:'Детройт',games:[{date:'2026-10-20',opponent:'Бостон',home:true,minutes:'09:58',points:0,played:true}]},
  3:{club:'Оклахома-Сити',games:[{date:'2026-10-21',minutes:'20:00',points:7,played:true}]},
  4:{club:'Сан-Антонио',games:[]}},clubs:{}};
 const players=[{id:'a',espnId:'11',sportsId:'1'},{id:'b',espnId:'22',sportsId:'2'},{id:'c',espnId:'33',sportsId:'3'},{id:'d',espnId:'44',sportsId:'4'}];
 const games=[
  {id:'g1',date:'2026-10-20T23:30Z',state:'post',final:true,points:{11:{points:36,minutes:40,final:true,counting:35}}},
  // ESPN rounds 9:58 to "10": Sports.ru's exact minutes stay on the row; the game point is +1 either way.
  {id:'g2',date:'2026-10-20T19:00Z',state:'post',final:true,points:{22:{points:11,minutes:10,final:true,counting:10}}},
  {id:'g3',date:'2026-10-21T00:00Z',state:'in',final:false,points:{33:{points:10,minutes:20,final:false,counting:9}}},
  {id:'g4',date:'2026-10-21T00:30Z',state:'post',final:true,points:{44:{points:6,minutes:8,final:true,counting:5}}}];
 const out=withBoxScores(live,games,players);
 assert.deepEqual(out.players[1].games[0],{date:'2026-10-21',opponent:'Нью-Йорк',home:false,tip:'2026-10-20T23:30Z',minutes:'39:33',points:36,played:true,source:'ESPN',sportsRowPoints:0});
 assert.equal(out.players[2].games[0].points,11);assert.equal(out.players[2].games[0].minutes,'09:58');
 // A running game: its Sports.ru row does not count yet, the running points do.
 assert.equal(out.players[3].games[0].played,false);
 // Sports.ru has not listed the game at all: the box score adds it.
 assert.deepEqual(out.players[4].games,[{date:'2026-10-21',tip:'2026-10-21T00:30Z',minutes:'8',points:6,played:true,source:'ESPN'}]);
 assert.equal(live.players[1].games[0].points,0,'the fetched snapshot is not changed');
 // Team points and the per-game update use the scored game.
 const ctx={players:[{id:'a',sportsId:'1',forecast:{meanPerGame:20,minutes:35}}],live:out};
 assert.equal(teamPoints(ctx,[],['a',...Array(79).fill('z')])[0],36);
 assert.equal(withBoxScores(live,[],players),live);
});
test('period windows open at the league opening night, before Sports.ru tour 1', async () => {
 const {periodList,SCORING_START}=await import('../src/season.js');
 assert.equal(SCORING_START,'2026-10-20');
 const weeks={1:{start:'2026-10-22',end:'2026-10-26'},2:{start:'2026-10-27',end:'2026-11-02'}};
 const list=periodList(weeks);
 assert.deepEqual(list.map(w=>[w.n,w.start,w.end]),[[1,'2026-10-20','2026-10-26'],[2,'2026-10-27','2026-11-02']]);
 assert.equal(weeks[1].start,'2026-10-22','Sports.ru weeks are not changed');
 assert.deepEqual(periodList(weeks,'2026-10-23')[0].start,'2026-10-22');
 assert.deepEqual(periodList({}),[]);
});
