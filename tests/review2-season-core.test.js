import test from 'node:test';import assert from 'node:assert/strict';
import {fblPoints,teamPoints,perGame,playRate,playerPicture,expectedPoints,withBoxScores,explainSwap,transferOptions,bestTransfers,bestPackage,
 marketAlerts,contestedBy,packageVerdict,seasonRosters,playerOutlook,CALIBRATION} from '../src/season.js';
import {fetchLiveGames} from '../src/live.js';
import {teamName} from '../src/teams.js';
// Review round 2 on src/season.js and src/live.js (21.10.2026): Y01 game points by the league's Yahoo formula only, R04/R34
// the ESPN/model games caveat, shadowed holdings in transfer advice, the season-ending date, R06 rivals without transfers,
// a known absence once the report clears, and the ESPN request timeout.
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
const days=(from,n,step=2)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*step*864e5).toISOString().slice(0,10));

// ---------- Y01: a played row counts its points only when they are FBL points ----------
const row=(date,points,extra={})=>({date,played:true,minutes:'30:00',points,...extra});
test('only ESPN box-score points are FBL points: Sports.ru\'s game table (BOX), NO_BOX, AWAITING_ESPN and SPORTS_WITH_BONUS rows are games played whose points are unknown',()=>{
 // League owner, 22.10.2026: ESPN's protocol is the one source; Sports.ru's own box score is a check only.
 assert.equal(fblPoints(row('2026-10-22',20,{pointsSource:'ESPN'})),20);
 assert.equal(fblPoints(row('2026-10-22',20,{pointsSource:'BOX'})),null);
 assert.equal(fblPoints(row('2026-10-22',null,{pointsSource:'AWAITING_ESPN',sportsBoxPoints:21})),null);
 assert.equal(fblPoints(row('2026-10-22',null,{pointsSource:'NO_BOX',sportsPoints:0})),null);
 assert.equal(fblPoints(row('2026-10-22',27,{pointsSource:'SPORTS_WITH_BONUS',sportsPoints:28})),null);
 // A row of an older snapshot (no source) counts as before; ESPN's line counts whatever the Sports.ru row said.
 assert.equal(fblPoints(row('2026-10-22',15)),15);
 assert.equal(fblPoints(row('2026-10-22',31,{source:'ESPN',pointsSource:'NO_BOX'})),31);
 assert.equal(fblPoints(row('2026-10-22',undefined)),null);
});
test('the league table adds a team\'s box-score points only, never Sports.ru\'s ФО with its result bonus',()=>{
 const picks=[1,2,3,4,5,6,7,8],players=picks.map(id=>({id,sportsId:'s'+id}));
 const live={players:{s1:{games:[row('2026-10-22',20,{pointsSource:'ESPN'}),row('2026-10-24',25,{pointsSource:'SPORTS_WITH_BONUS',sportsPoints:28}),
  row('2026-10-26',null,{pointsSource:'NO_BOX',sportsPoints:0}),row('2026-10-28',15)]}}};
 // Before: 20+25+0+15 = 60, Sports.ru's result bonus included and the unknown game read as 0.
 assert.equal(teamPoints({players,live},[],picks)[0],35);
});
test('the in-season update leaves a game with unknown points out instead of reading it as 0; it is still a game played',()=>{
 const p={id:1,sportsId:'s1',sportsClub:'X',forecast:{meanPerGame:20,minutes:30,games:70}};
 const box=days('2026-10-22',4).map(d=>row(d,25,{pointsSource:'ESPN'})),late='2026-10-30';
 const scored=perGame(p,{games:box});
 for(const extra of [row(late,null,{pointsSource:'NO_BOX',sportsPoints:0}),row(late,40,{pointsSource:'SPORTS_WITH_BONUS',sportsPoints:43})]){
  const x=perGame(p,{games:[...box,extra]});
  near(x.value,scored.value);assert.equal(x.games,4);assert.equal(x.unscored,1);near(x.average,25);
 }
 // Availability counts the game: the share is the one of a scored game, not that of a missed one.
 const calendar=days('2026-10-22',30).map((date,i)=>({date,week:1+Math.floor(i/3),...(i<5?{score:'100:90'}:{})}));
 const ctx={players:[p],live:{clubs:{X:calendar},players:{}},injuries:new Map(),today:'2026-10-31',rosters:[]};
 const withBox=playRate(p,{games:[...box,row(late,30,{pointsSource:'ESPN'})]},ctx),noBox=playRate(p,{games:[...box,row(late,null,{pointsSource:'NO_BOX'})]},ctx);
 near(noBox,withBox);assert.ok(noBox>playRate(p,{games:[...box,{date:late,played:false}]},ctx));
 // The player picture tells the games played from those its average is over.
 const pic=playerPicture(p,{...ctx,live:{...ctx.live,players:{s1:{games:[...box,row(late,null,{pointsSource:'NO_BOX'})]}}}},'season');
 assert.equal(pic.played,5);assert.equal(pic.scored,4);near(pic.average,25);
});
test('ESPN\'s box score replaces a NO_BOX row and counts, marked as ESPN\'s, the Sports.ru row\'s source kept beside it',()=>{
 const players=[{id:1,sportsId:'s1',espnId:'e1'}],picks=[1,2,3,4,5,6,7,8];
 const live={players:{s1:{games:[row('2026-10-21',null,{pointsSource:'NO_BOX',sportsPoints:0,opponent:'Нью-Йорк'})]}}};
 const games=[{id:'g1',date:'2026-10-20T23:30Z',state:'post',final:true,points:{e1:{points:31,counting:30,minutes:33,final:true}}}];
 const out=withBoxScores(live,games,players),g=out.players.s1.games[0];
 assert.equal(g.source,'ESPN');assert.equal(g.pointsSource,'ESPN');assert.equal(g.sportsRowSource,'NO_BOX');assert.equal(g.points,31);
 assert.equal(fblPoints(g),31);assert.equal(teamPoints({players,live:out},[],picks)[0],31);
});

// ---------- R04/R34: the games caveat names ESPN's figure, the model's and the mean the forecast uses ----------
const cal=days('2026-10-22',82).map((date,i)=>({date,week:1+Math.floor(i/3)}));
const swapCtx=(players,injuries=[])=>({players,live:{clubs:{A:cal,B:cal},players:{}},injuries:new Map(injuries),today:'2026-10-21',rosters:[[1]]});
const seller={id:1,name:'Out',sportsId:'1',espnId:'1',sportsClub:'A',positions:['SG'],price:1500,forecast:{meanPerGame:15,games:82}};
test('owner decision 4: the caveat does not call the ESPN/model mean ESPN\'s games',()=>{
 const herro={id:2,name:'Tyler Herro',sportsId:'2',espnId:'2',sportsClub:'B',positions:['SG'],price:1500,
  forecast:{meanPerGame:19.7,games:58.8,gamesBasis:'MEAN_ESPN_MODEL',sources:{espn:{perGame:19.7,games:67},model:{perGame:19.1,games:50.65}}}};
 const flag=explainSwap(swapCtx([seller,herro]),1,2,'season').flags.find(f=>f.startsWith('Tyler Herro:'));
 assert.ok(flag);assert.doesNotMatch(flag,/59 матчей по ESPN/);
 assert.match(flag,/ESPN ждёт 67 матчей/);assert.match(flag,/модель по истории пропусков — 51/);assert.match(flag,/среднее 59/);
 // A known absence capped ESPN's games in the mean: ESPN's own figure first, the capped one beside it.
 const furphy={...herro,id:3,name:'Furphy',sportsId:'3',espnId:'3',forecast:{...herro.forecast,games:40,sources:{espn:{perGame:12,games:49,projectedGames:61},model:{perGame:12,games:31}}}};
 const capped=explainSwap(swapCtx([seller,furphy]),1,3,'season').flags.find(f=>f.startsWith('Furphy:'));
 assert.match(capped,/ESPN ждёт 61 матч \(с учётом пропуска — 49\), модель по истории пропусков — 31; в расчёте среднее 40/);
 // A database from before the decision (games ESPN's alone) keeps its wording.
 const old={...herro,id:4,name:'Old',sportsId:'4',espnId:'4',forecast:{meanPerGame:19.7,games:67,sources:{espn:{perGame:19.7,games:67},model:{perGame:19.1,games:50.65}}}};
 assert.ok(explainSwap(swapCtx([seller,old]),1,4,'season').flags.includes('Old: в расчёте 67 матчей по ESPN; по истории пропусков модель ждала бы 51.'));
});
test('a season-ending report reads "до конца сезона", not ESPN\'s placeholder return date',()=>{
 const furphy={id:2,name:'Johnny Furphy',sportsId:'2',espnId:'2',sportsClub:'B',positions:['SG'],price:1500,forecast:{meanPerGame:12,games:0}};
 const report={status:'Out',fantasyStatus:'OUT',returnDate:'2027-01-02',comment:'Furphy was diagnosed with a torn right ACL on Monday and will miss the remainder of the season.'};
 const flags=explainSwap(swapCtx([seller,furphy],[['2',report]]),1,2,'season').flags;
 assert.ok(flags.includes('Johnny Furphy: не играет до конца сезона — проверь новости перед покупкой.'),flags.join('\n'));
 const dated=explainSwap(swapCtx([seller,furphy],[['2',{...report,comment:'Furphy (knee) is out until January.'}]]),1,2,'season').flags;
 assert.ok(dated.includes('Johnny Furphy: не играет до 02.01 — проверь новости перед покупкой.'));
});

// ---------- A shadowed holding is worth nothing to the later buyer's advice ----------
// 80 drafted players and 20 free agents, each of his own club with one calendar; #81 (a free agent) is a star, #82 the
// best of the rest.
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'],picks=Array.from({length:80},(_,i)=>i+1);
const club=days('2026-10-26',40).map((date,i)=>({date,week:1+Math.floor(i/3)}));
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:'C'+(i+1),
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,isRookie:i<80?Math.floor(i/8)===9:false,
 forecast:{meanPerGame:i===80?60:i===81?14:10,minutes:30,games:82,meanSeason:i===80?4920:820,seasonFloor:i===80?3000:500,seasonCeiling:i===80?6000:1100}}));
const league=(transfers,today='2026-10-24')=>({players,live:{clubs:Object.fromEntries(players.map(p=>[p.sportsClub,club])),players:Object.fromEntries(players.map(p=>[p.sportsId,{club:p.sportsClub,games:[]}]))},
 transfers,picks,rosters:seasonRosters(transfers,picks),injuries:new Map(),today});
// Team 0 buys #81 on 22.10; team 1 buys him on 23.10 while team 0 holds him: team 1's slot scores nothing.
const breach=[{team:0,outId:1,inId:81,date:'2026-10-22'},{team:1,outId:2,inId:81,date:'2026-10-23'}];
const season=(c,id)=>playerOutlook(players[id-1],c).season.points;
test('selling a shadowed holding costs the later buyer nothing, in a swap and in a package',()=>{
 const c=league(breach);
 // Every replacement of #81 gains its own whole outlook: he brings team 1 nothing (before: the star's 60 a game).
 const options=transferOptions(c,{team:1,outId:81,bankMoney:0,sort:'season',limit:3});
 assert.ok(options.length);for(const o of options)near(o.gain.season,o.outlook.season.points,1e-6);
 const [best]=bestTransfers(c,{team:1,bankMoney:0,sort:'season',limit:1});
 assert.equal(best.outId,81);assert.equal(best.player.id,82);
 // Team 0, which had him first, keeps his value.
 assert.ok(transferOptions(c,{team:0,outId:81,bankMoney:0,sort:'season'}).every(o=>o.gain.season<0));
 // The package of one transfer sells him for the best free agent, his whole outlook the gain.
 const pack=bestPackage(c,{team:1,bankMoney:0,k:1,sort:'season'});
 assert.deepEqual(pack.pairs.map(x=>[x.out.id,x.in.id]),[[81,82]]);near(pack.gains.season,season(c,82),1e-6);near(pack.gain,season(c,82),1e-6);
 // A 'doubt' holding (the watcher cannot tell who bought first) keeps the star's value for both teams.
 const at='2026-10-23T09:00:00Z',after='2026-10-23T08:50:00Z',doubt=league(breach.map(x=>({...x,date:'2026-10-23',seenAt:at,seenAfter:after})));
 assert.ok(transferOptions(doubt,{team:1,outId:81,bankMoney:0,sort:'season'}).every(o=>o.gain.season<0));
});
test('the explanation of a swap that sells a shadowed holding: nothing on his side, for certain, and who scores him',()=>{
 const c=league(breach),why=explainSwap(c,81,82,'season',null,1);
 near(why.gain,season(c,82),1e-6);assert.equal(why.sides[0].out.points,0);assert.equal(why.sides[0].out.shadowedBy,0);
 near(why.parts.availability,why.gain,1e-6);near(why.parts.perGame,0);
 assert.ok(why.flags.includes(`P81: его очки получает ${teamName(0)} — она взяла его раньше, тебе он не приносит ничего.`));
 assert.ok(!why.flags.some(f=>f.startsWith('Больше половины выигрыша')));
 // Certain on the model's own spread; the calibrated chance is the share of such swaps that really gained (its top step).
 assert.ok(why.z>3&&why.confidence>=.9);
 // Without the team (or for team 0) the swap is the star against an average player, as before.
 assert.ok(explainSwap(c,81,82,'season').gain<0);assert.ok(explainSwap(c,81,82,'season',null,0).gain<0);
 // The alerts and the recommended package of team 1 judge it the same way.
 const alert=marketAlerts(c,{team:1,bankMoney:0,sort:'season',minGain:20}).find(a=>a.outId===81);
 assert.ok(alert);assert.equal(alert.why.sides[0].out.points,0);
});
test('the verdict on buying a player another FBL team had first: he brings the buyer nothing, so it is a weakening',()=>{
 const c=league(breach),late=packageVerdict(c,[breach[1]],{bankMoney:0}),first=packageVerdict(c,[breach[0]],{bankMoney:0});
 near(late.gain.season,-season(c,2),1e-6);assert.equal(late.verdict,'down');assert.equal(first.verdict,'up');
 // Two moves of team 1 in one package, the breach among them: only the other one gains.
 const two=[breach[1],{team:1,outId:10,inId:82,date:'2026-10-23'}],both=league([breach[0],...two]);
 near(packageVerdict(both,two,{bankMoney:0}).gain.season,season(both,82)-season(both,10)-season(both,2),1e-6);
});

// ---------- R06: rivals with no transfer left this week cannot buy the player now ----------
test('contestedBy counts only the rivals that still have a transfer this week',()=>{
 const c=league([]);
 assert.deepEqual(contestedBy(c,{team:0,playerId:81,bankOf:()=>0,sort:'season'}),[1,2,3,4,5,6,7]);
 assert.deepEqual(contestedBy(c,{team:0,playerId:81,bankOf:()=>0,leftOf:t=>t%2?0:2,sort:'season'}),[2,4,6]);
});

// ---------- A known absence once the report has cleared, before the next build ----------
test('a known absence cleared early: the blocked games still ahead come back at the report-free share, not the post-return one',()=>{
 // ESPN dates the return by US day, the day before the Moscow date the calendar files a US-evening game under.
 const b=12,left=82-b,U=55,F=(U*left/82+60)/2,back=new Date(Date.parse(cal[b].date+'T00:00:00Z')-864e5).toISOString().slice(0,10);
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{origin:'ESPN_MODEL_COMBINED',gamesBasis:'MEAN_ESPN_MODEL',meanPerGame:20,minutes:30,games:F,
  availability:{unconditionalGames:U},knownAbsence:{returnDate:back,blockedGames:b,gamesLeft:left,unconditionalGames:U},sources:{model:{games:U*left/82},espn:{games:60}}}};
 const ctx=(injuries=[],extra={})=>({players:[p],live:{clubs:{X:extra.calendar||cal},players:extra.players||{}},injuries:new Map(injuries),today:extra.today||'2026-10-21',rosters:[]});
 const games=c=>expectedPoints(p,c,c.today,'2027-12-31').games;
 // Still reported out: the published forecast, the share being F over the games after the return.
 near(games(ctx([['e1',{status:'Out',fantasyStatus:'OUT',returnDate:back,comment:'(knee) out until November'}]])),F);
 // Cleared: the 12 blocked games are his again at U/82 each (before: all 82 at F/70, 62.6 games).
 near(games(ctx([['e9',{status:'Out',fantasyStatus:'OUT',returnDate:back}]])),F+U*b/82);
 near(games(ctx()),F+U*b/82);
 // Only a day-to-day entry left: the blocked games come back too, the doubtful ones at half.
 const gtd=games(ctx([['e1',{status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-21'}]]));
 near(gtd,(F+U*b/82)*(1-.5/82));
 // Back after 6 of the 12 blocked games and playing every one since: 6 blocked games are still ahead.
 const k=CALIBRATION.availability.priorGames,played=cal.slice(0,6).map(g=>row(g.date,25,{pointsSource:'ESPN'}));
 const now=ctx([],{today:cal[6].date,calendar:cal.map((g,i)=>i<6?{...g,score:'100:90'}:g),players:{s1:{games:played}}});
 const prior=(F+U*6/82)/(left+6);near(playRate(p,{games:played},now),(k*prior+6)/(k+6));
});

// ---------- live.js: an ESPN call that never answers fails, it does not hold the notifier ----------
test('a hung ESPN request is aborted after the timeout: the scoreboard fails, a summary leaves the game without points',{timeout:5000},async()=>{
 // A request ESPN never answers: it settles only when its signal aborts it.
 const real=globalThis.fetch,signals=[],hang=(url,init)=>{signals.push(init?.signal);return new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal.reason)));};
 const ev={id:'1',date:'2026-10-21T23:30Z',status:{type:{state:'in',completed:false,shortDetail:'6:00 - 2nd'}},competitions:[{competitors:[{homeAway:'home',team:{abbreviation:'NY'}},{homeAway:'away',team:{abbreviation:'BOS'}}]}]};
 // AbortSignal.timeout's timer does not hold the event loop (a real request's socket does): this one stands in for it,
 // for 2 s at most, so a request that is never aborted fails the test instead of holding the run.
 const alive=setInterval(()=>{},50),stop=setTimeout(()=>clearInterval(alive),2000);
 try{
  globalThis.fetch=hang;
  await assert.rejects(fetchLiveGames(null,{timeoutMs:30}),/ESPN scoreboard unavailable/);
  globalThis.fetch=(url,init)=>/scoreboard/.test(url)?Promise.resolve({ok:true,json:async()=>({events:[ev]})}):hang(url,init);
  const games=await fetchLiveGames(null,{timeoutMs:30});
  assert.equal(games.length,2);assert.ok(games.every(g=>g.points===null));
  assert.equal(signals.length,4);assert.ok(signals.every(s=>s instanceof AbortSignal&&s.aborted));
 }finally{globalThis.fetch=real;clearInterval(alive);clearTimeout(stop);}
});
