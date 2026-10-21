import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters,acquisition,injuredTargets,bestPackage,bestSwapFor,transferOptions,transferVerdict,packageVerdict,netChange,dealGroups,
 explainSwap,splitProduct,pointsSpread,playerOutlook,confidencePercent,confidenceLevel,pickPackage,recommendPackage,contestedBy,transferWindow,takenIds,
 CONFIDENT,DOUBTFUL,MOVE_PRICE} from '../src/season.js';
// The fixture of tests/season.test.js: 80 drafted players (ids 1..80, team = (id-1)%8, 30 a game) plus 20 free agents
// (ids 81..100, 20..39 a game), positions two per Sports.ru slot, the last round rookies.
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,priceStatus:'VERIFIED',isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i<80?30:20+i-80,games:82}}));
const calendar=[{date:'2026-10-23',week:1},{date:'2026-10-25',week:1},{date:'2026-10-28',week:2},{date:'2026-11-20',week:5}];
const live={clubs:Object.fromEntries(players.map(p=>[p.sportsClub,calendar])),players:{}};
const ctx=(extra={})=>({players,live,injuries:new Map(),today:'2026-10-20',rosters:seasonRosters([],picks),...extra});
// A longer calendar (a game every other day from 22.10) for the confidence and the explanation tests.
const longCal=Array.from({length:60},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*2*864e5).toISOString().slice(0,10),week:1+Math.floor(i/4)}));
const withForecasts=(changes,cal=longCal)=>{const list=players.map(p=>changes[p.id]?{...p,...changes[p.id],forecast:{...p.forecast,...changes[p.id].forecast}}:p);
 return {...ctx({today:'2026-10-21'}),players:list,live:{clubs:Object.fromEntries(list.map(p=>[p.sportsClub,cal])),players:{}}};};
const range=(mean,games,lo=.85,hi=1.15)=>({meanPerGame:mean,games,meanSeason:mean*games,seasonFloor:mean*games*lo,seasonCeiling:mean*games*hi,gameFloor:mean*.7,gameCeiling:mean*1.3});

// ---------- acquisition: a player is judged by what he adds, not by the package around him ----------
test('a mediocre player is not worth buying because the package that buys him also holds an unrelated big upgrade',()=>{
 // Every free agent below the roster's 30 a game except SF #96 (45, the real upgrade) and SG #94 (31, one point better).
 const list=players.map(p=>p.id>80?{...p,forecast:{...p.forecast,meanPerGame:p.id===96?45:p.id===94?31:20}}:p),c=ctx({players:list});
 const best=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season'});
 assert.ok(best.pairs.some(x=>x.in.id===96));
 const mediocre=acquisition(c,{team:0,playerId:94,bankMoney:5000,k:3,minGain:15});
 assert.equal(mediocre.worth,false,'the package with #94 only beats doing nothing thanks to #96');
 assert.ok(mediocre.edge<15&&mediocre.edge>-1e-6,`edge ${mediocre.edge}`);
 const star=acquisition(c,{team:0,playerId:96,bankMoney:5000,k:3,minGain:15});
 assert.equal(star.worth,true);assert.ok(star.edge>=15);
 // The same answer when the caller hands in the team's best package.
 assert.equal(acquisition(c,{team:0,playerId:94,bankMoney:5000,k:3,minGain:15,best}).worth,false);
 assert.ok(Math.abs(acquisition(c,{team:0,playerId:96,bankMoney:5000,k:3,minGain:15,best}).edge-star.edge)<1e-6);
 // One transfer keeps the one-swap rule: his own swap must gain minGain.
 const one=acquisition(c,{team:0,playerId:94,bankMoney:5000,k:1,minGain:1});
 assert.equal(one.worth,true);assert.equal(one.pack,null);assert.ok(Math.abs(one.edge-one.swap.gain.season)<1e-9);
});
test('a package excluding a player never buys him, and one including him always does',()=>{
 const c=ctx();
 const without=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season',exclude:100});
 assert.ok(!without.pairs.some(x=>x.in.id===100));
 const withHim=bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season',include:100});
 assert.ok(withHim.pairs.some(x=>x.in.id===100));
 assert.ok(withHim.gains.season>=without.gains.season-1e-6,'#100 (39 a game) is the best free centre');
});
test('injured targets come with their edge, the biggest first; a free substitute leaves no edge',()=>{
 // The only free upgrades: C #100 (39) and PF #98 (37), both back before the first game; every other free agent plays 20.
 const soon={status:'Out',returnDate:'2026-10-22'},only=extra=>players.map(p=>p.id>80?{...p,forecast:{...p.forecast,meanPerGame:p.id===100?39:p.id===98?37:extra[p.id]??20}}:p);
 const list=injuredTargets(ctx({players:only({}),injuries:new Map([['5100',soon],['5098',soon]])}),{team:0,bankMoney:5000,k:2,minGain:20});
 assert.deepEqual(list.map(x=>x.player.id),[100,98]);
 for(const x of list)assert.ok(Number.isFinite(x.edge)&&x.edge>=20&&x.soon);
 assert.ok(list[0].edge>list[1].edge);
 // With C #99 (38) free and healthy, #100 adds one point a game over him: no target.
 const sub=injuredTargets(ctx({players:only({99:38}),injuries:new Map([['5100',soon]])}),{team:0,bankMoney:5000,k:2,minGain:20});
 assert.deepEqual(sub.map(x=>x.player.id),[]);
});

// ---------- one package for the app and Telegram ----------
const option=(pairs,lvl,gains)=>({pairs:Array.from({length:pairs},(_,i)=>({out:{id:i},in:{id:100+i}})),lvl,gains:{week:0,...gains}});
test('the recommended package is confident; a borderline one is only offered; a smaller one wins only if it gives up little on both horizons',()=>{
 // Only a 60-69% package: no "сделай", it is the borderline option.
 const mod=option(1,'MODERATE',{month:40,season:30});
 assert.deepEqual(pickPackage([mod],{left:3}),{best:null,borderline:mod});
 // A confident 2-move package beats a bigger borderline one (team 4 on the season horizon, 20.10: 71% +406 against 69% +465).
 const two=option(2,'CONFIDENT',{month:300,season:406}),three=option(3,'MODERATE',{month:340,season:465});
 assert.deepEqual(pickPackage([two,three],{left:3,sort:'season'}),{best:two,borderline:null});
 // Doubtful only, or costing the season: nothing.
 assert.deepEqual(pickPackage([option(1,'DOUBTFUL',{month:50,season:50})],{left:3}),{best:null,borderline:null});
 assert.deepEqual(pickPackage([option(1,'CONFIDENT',{month:50,season:-1})],{left:3}),{best:null,borderline:null});
 // Team 0 on 21.10, 4-week horizon: one move +46.5 / season +37.4 against two moves +56.0 / +140.0. The 15 FP rule alone
 // took the smaller one and gave up 103 season points; now it must give up little over the season too.
 const k1=option(1,'CONFIDENT',{month:46.5,season:37.4}),k2=option(2,'CONFIDENT',{month:56,season:140});
 assert.equal(pickPackage([k1,k2],{left:3}).best,k2);
 const k2small=option(2,'CONFIDENT',{month:56,season:45});
 assert.equal(pickPackage([k1,k2small],{left:3}).best,k1,'each saved move adds less than 15 on both horizons');
 assert.equal(pickPackage([k1,k2],{left:1}).best,k1,'only what fits the transfers left');
 assert.equal(MOVE_PRICE,15);
 // On the fixture the shared function returns options with their confidence level.
 const r=recommendPackage(ctx({injuries:new Map([['5001',{status:'Out',returnDate:'2027-01-01'}]])}),{team:0,bankMoney:5000,left:3,sort:'month'});
 assert.ok(r.options.length>0);for(const o of r.options)assert.equal(o.lvl,confidenceLevel(o.why.confidence));
 if(r.best)assert.equal(r.best.lvl,'CONFIDENT');
});
test('one rounding: the percent is rounded down and the level follows it',()=>{
 assert.equal(confidencePercent(.6993),69);assert.equal(confidenceLevel(.6993),'MODERATE');
 assert.equal(confidencePercent(.7),70);assert.equal(confidenceLevel(.7),'CONFIDENT');
 assert.equal(confidenceLevel(.5999),'DOUBTFUL');assert.equal(confidenceLevel(.6),'MODERATE');
 for(let c=.5;c<1;c+=.0007){const l=confidenceLevel(c),p=confidencePercent(c);assert.equal(l,p>=70?'CONFIDENT':p>=60?'MODERATE':'DOUBTFUL');}
 assert.equal(CONFIDENT,.7);assert.equal(DOUBTFUL,.6);
 // explainSwap's level is the same rule.
 const c=withForecasts({81:{forecast:range(33,80)},82:{forecast:range(31,80)},1:{forecast:range(30,80)}});
 for(const id of [81,82])for(const h of ['week','month','season']){const w=explainSwap(c,1,id,h);assert.equal(w.level,confidenceLevel(w.confidence));}
});

// ---------- confidence calibration ----------
test('the spread of a player is not narrowed by the games he has played (remaining availability risk does not shrink)',()=>{
 const p={...players[0],forecast:range(30,70,.6,1.3)},c=ctx({today:'2026-12-20'});
 const outlook={points:600,games:20};
 const games=Array.from({length:60},(_,i)=>({date:'2026-11-0'+(i%9+1),played:true,points:30,minutes:'30:00'}));
 const none=pointsSpread(p,c,outlook),many=pointsSpread(p,{...c,live:{...c.live,players:{[p.sportsId]:{games}}}},outlook);
 assert.equal(none,many);
 const Z90=1.2815515655,rel=(.7*30*70)/(2*Z90*30*70),game=(30*.6)/(2*Z90);
 assert.ok(Math.abs(none-Math.sqrt((rel*600)**2+game*game*20))<1e-9);
});

// ---------- explanations that stay exact with zeros ----------
test('the gain split stays exact when a factor is zero and gives the change to the factor that caused it',()=>{
 // A seller out for the whole period (no expected games), a buyer who plays: availability, not points per game.
 const s=splitProduct([30,0,14],[21,.8,14]);
 assert.ok(Math.abs(s.reduce((a,b)=>a+b,0)-21*.8*14)<1e-9);
 assert.ok(s[0]<0&&s[1]>21*.8*14&&Math.abs(s[2])<1e-9,JSON.stringify(s));
 // All positive: the logarithmic mean, exact as before.
 const t=splitProduct([30,.8,14],[33,.9,15]);assert.ok(Math.abs(t.reduce((a,b)=>a+b,0)-(33*.9*15-30*.8*14))<1e-9);
 assert.ok(t.every(x=>x>0));
});
test('selling a player out for the period is explained by availability, and a club with no games by the calendar',()=>{
 // Seller #1 (30 a game) is out beyond the 4 weeks; buyer #81 (20 a game) plays.
 const c={...withForecasts({}),injuries:new Map([['5001',{status:'Out',returnDate:'2027-02-01'}]])};
 const w=explainSwap(c,1,81,'month');
 assert.ok(w.gain>0);assert.equal(w.sides[0].out.expectedGames,0);
 assert.ok(Math.abs(w.parts.perGame+w.parts.availability+w.parts.schedule-w.gain)<1e-6);
 assert.ok(w.parts.perGame<0,'the buyer is worse per game');assert.ok(w.parts.availability>.5*w.gain);
 assert.ok(w.flags.some(f=>f.startsWith('Больше половины выигрыша — из прогноза числа сыгранных матчей')));
 // Week horizon: the buyer's club has no games left in the week, the seller's has two.
 const list=players,cal=Object.fromEntries(list.map(p=>[p.sportsClub,p.id===81?calendar.filter(g=>g.week>1):calendar]));
 const wk=explainSwap({...ctx(),live:{clubs:cal,players:{}}},1,81,'week');
 assert.equal(wk.sides[0].in.clubGames,0);assert.ok(wk.gain<0);
 assert.ok(Math.abs(wk.parts.perGame+wk.parts.availability+wk.parts.schedule-wk.gain)<1e-6);
 assert.ok(wk.parts.schedule<0&&Math.abs(wk.parts.schedule)>=Math.abs(wk.parts.perGame)&&Math.abs(wk.parts.schedule)>=Math.abs(wk.parts.availability),JSON.stringify(wk.parts));
});

// ---------- the club limit in packages ----------
test('a team with three players of one club after an NBA trade buys no player of that club, in swaps or packages',()=>{
 // #17 joins C0, where team 0 already has #1 and #41; free agent #91 (PG, 45 a game) plays for C0 too.
 const list=players.map(p=>p.id===17?{...p,sportsClub:'C0'}:p.id===91?{...p,sportsClub:'C0',forecast:{...p.forecast,meanPerGame:45}}:p);
 const c=ctx({players:list});
 assert.equal(bestSwapFor(c,{team:0,playerId:91,bankMoney:5000}),null);
 assert.ok(!transferOptions(c,{team:0,outId:1,bankMoney:5000,limit:100}).some(o=>o.player.id===91));
 for(const k of [1,2,3]){const p=bestPackage(c,{team:0,bankMoney:5000,k,sort:'season'});assert.ok(!p||!p.pairs.some(x=>x.in.id===91),`k=${k}`);}
 assert.equal(bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season',include:91}),null);
 const a=acquisition(c,{team:0,playerId:91,bankMoney:5000,k:3});assert.equal(a.worth,false);assert.equal(a.pack,null);
 // Without the crowded club the same star is bought.
 const free=ctx({players:players.map(p=>p.id===91?{...p,sportsClub:'C0',forecast:{...p.forecast,meanPerGame:45}}:p)});
 assert.ok(bestPackage(free,{team:0,bankMoney:5000,k:1,sort:'season'}).pairs.some(x=>x.in.id===91));
});

// ---------- a player held on Sports.ru is never free ----------
test('a player another team holds on Sports.ru is not offered, even before its journal row is resolved',()=>{
 const own=picks.filter((_,i)=>i%8===1).map(id=>({sportsId:String(1000+id)}));
 const c=ctx({live:{...live,teams:{1:{roster:[...own,{sportsId:'1100'}]}}}});
 assert.ok(takenIds(c).has(100)&&!takenIds(ctx()).has(100));
 assert.ok(!transferOptions(c,{team:0,outId:65,bankMoney:5000,limit:100}).some(o=>o.player.id===100));
 assert.equal(bestSwapFor(c,{team:0,playerId:100,bankMoney:5000}),null);
 assert.equal(bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season',include:100}),null);
 assert.ok(!bestPackage(c,{team:0,bankMoney:5000,k:3,sort:'season'}).pairs.some(x=>x.in.id===100));
 // A Sports.ru roster that agrees with the journals changes nothing.
 const same=ctx({live:{...live,teams:{1:{roster:own}}}});
 assert.deepEqual(bestPackage(same,{team:0,bankMoney:5000,k:3,sort:'season'}).pairs.map(x=>[x.out.id,x.in.id]),bestPackage(ctx(),{team:0,bankMoney:5000,k:3,sort:'season'}).pairs.map(x=>[x.out.id,x.in.id]));
});

// ---------- verdicts on transfers made ----------
test('a verdict keeps the sign of the expected gain and says when it is unsure',()=>{
 // #81 is 6 a game better than #1 over the season but his range is wide: an upgrade in expectation, near a coin flip.
 const wide=withForecasts({81:{forecast:range(36,80,.3,1.6)},1:{forecast:range(30,80,.3,1.6)}});
 const t={team:0,outId:1,inId:81,date:'2026-10-21',outPrice:1500,inPrice:1500};
 const v=transferVerdict({...wide,rosters:seasonRosters([t],picks)},t,{bankMoney:500});
 assert.equal(v.verdict,'up');assert.ok(v.gain.season>15);
 assert.ok(v.sure>.5&&v.sure<CONFIDENT,`sure ${v.sure}`);assert.equal(v.label,'💪 Усиление, неуверенно');
 assert.equal(v.horizon,'season');assert.ok(Math.abs(v.sure-v.confidence.season)<1e-12);
 // The same move with narrow ranges is a firm upgrade.
 const narrow=withForecasts({81:{forecast:range(36,80,.95,1.05)},1:{forecast:range(30,80,.95,1.05)}});
 const firm=transferVerdict({...narrow,rosters:seasonRosters([t],picks)},t,{bankMoney:500});
 assert.equal(firm.verdict,'up');assert.ok(firm.sure>=CONFIDENT);assert.equal(firm.label,'💪 Усиление');
 // A clear weakening (30 a game for 20): the certainty is that of the loss.
 const down=withForecasts({81:{forecast:range(20,80,.95,1.05)},1:{forecast:range(30,80,.95,1.05)}});
 const d=transferVerdict({...down,rosters:seasonRosters([t],picks)},t,{bankMoney:500});
 assert.equal(d.verdict,'down');assert.ok(d.sure>=CONFIDENT&&d.confidence.season<1-CONFIDENT);assert.equal(d.label,'🤡 Ослабление');
});
test('"better for the same money" must not lose on the season, and never names a player of the same package',()=>{
 // #1 (30) → #91, a 55-a-game star out until 25.11: a season investment. #92 (36, healthy) gains more over the next 4
 // weeks but much less over the season: it is not "better for the same money".
 const c0=withForecasts({91:{forecast:range(55,80,.9,1.1)},92:{forecast:range(36,80,.9,1.1)}});
 const c={...c0,injuries:new Map([['5091',{status:'Out',returnDate:'2026-11-25'}]])};
 const t={team:0,outId:1,inId:91,date:'2026-10-21',outPrice:1500,inPrice:1500};
 const v=transferVerdict({...c,rosters:seasonRosters([t],picks)},t,{bankMoney:500});
 assert.equal(v.verdict,'long');
 const [top]=transferOptions({...c,rosters:seasonRosters([],picks)},{team:0,outId:1,bankMoney:500,limit:1,sort:'month'});
 assert.ok(top.player.id===92&&top.gain.month>v.gain.month&&top.gain.season<v.gain.season,'the 4-week pick the old rule named');
 assert.equal(v.best,null);
 // Two legs of one package: PG #1 → #81 and PG #9 (40 a game) → #82. The alternative for the first leg is judged on the
 // team before the package: never #9 (sold in it, so back on the team) nor #82 (bought in it).
 const at='2026-10-21T08:00:00Z',t1={team:0,outId:1,inId:81,date:'2026-10-21',outPrice:1500,inPrice:1500,seenAt:at},t2={team:0,outId:9,inId:82,date:'2026-10-21',outPrice:1500,inPrice:1500,seenAt:at};
 const strong=players.map(p=>p.id===9?{...p,forecast:{...p.forecast,meanPerGame:40}}:p),both=ctx({players:strong,rosters:seasonRosters([t1,t2],picks)});
 assert.equal(transferVerdict(both,t1,{bankMoney:500}).best.player.id,9,'judged leg by leg, the team\'s own sold player looked free');
 const leg=transferVerdict(both,t1,{bankMoney:500,deals:[t1,t2]});
 assert.equal(leg.best.player.id,92,'the best free PG for the money');
});
test('a package is judged by its net change: a chain is one move, a round trip none',()=>{
 // Team 0: #1 → #81, #81 → #91, #9 → #82, #82 → #9 in one read: net #1 → #91.
 const at='2026-10-21T08:11:29Z',d=(outId,inId)=>({team:0,outId,inId,date:'2026-10-21',outPrice:1500,inPrice:1500,seenAt:at});
 const deals=[d(1,81),d(81,91),d(9,82),d(82,9)];
 assert.deepEqual(netChange(ctx(),deals),{outs:[1],ins:[91],pairs:[{outId:1,inId:91}]});
 assert.deepEqual(netChange(ctx(),[d(9,82),d(82,9)]).pairs,[]);
 const c=ctx({rosters:seasonRosters(deals,picks)});
 const v=packageVerdict(c,deals,{bankMoney:500}),single=transferVerdict(c,{team:0,outId:1,inId:91},{bankMoney:500,deals});
 assert.deepEqual(v.gain,single.gain);assert.equal(v.verdict,single.verdict);assert.deepEqual(v.net.pairs,[{outId:1,inId:91}]);
 const round=packageVerdict(c,[d(9,82),d(82,9)],{bankMoney:500});assert.equal(round.verdict,'none');assert.match(round.label,/туда-обратно/);
 // Two net moves: the summed gains.
 const two=[d(1,91),d(9,92)],cc=ctx({rosters:seasonRosters(two,picks)}),pv=packageVerdict(cc,two,{bankMoney:500});
 const sum=k=>[[1,91],[9,92]].reduce((s,[o,i])=>s+playerOutlook(players[i-1],cc)[k].points-playerOutlook(players[o-1],cc)[k].points,0);
 assert.ok(Math.abs(pv.gain.season-sum('season'))<1e-9&&Math.abs(pv.gain.month-sum('month'))<1e-9);assert.equal(pv.best,null);
 // The watcher's reads group the deals; rows never timed group by date.
 const groups=dealGroups([...deals,{...d(17,83),seenAt:'2026-10-21T09:00:00Z'},{team:1,outId:2,inId:84,date:'2026-10-21'},{team:1,outId:10,inId:85,date:'2026-10-21'}]);
 assert.deepEqual(groups.map(g=>g.length),[4,1,2]);
});

// ---------- transfer hours and contested targets ----------
test('transfers are open from 08:00 to 22:00 Moscow time',()=>{
 const at=s=>Date.parse(s);
 assert.equal(transferWindow(at('2026-10-21T04:59:00Z')).open,false);assert.equal(transferWindow(at('2026-10-21T05:00:00Z')).open,true);
 assert.equal(transferWindow(at('2026-10-21T18:59:00Z')).open,true);assert.equal(transferWindow(at('2026-10-21T19:00:00Z')).open,false);
 const w=transferWindow(at('2026-10-21T20:30:00Z'));assert.equal(w.now,'23:30');assert.equal(w.from,'08:00');assert.equal(w.to,'22:00');
 assert.equal(transferWindow(at('2026-10-21T06:00:00Z'),{from:'10:00',to:'12:00'}).open,false);
});
test('a free agent every team would buy is flagged as contested by the others',()=>{
 const list=players.map(p=>p.id===91?{...p,forecast:{...p.forecast,meanPerGame:45}}:p),c=ctx({players:list});
 const rivals=contestedBy(c,{team:0,playerId:91,bankOf:()=>5000,sort:'season'});
 assert.deepEqual(rivals,[1,2,3,4,5,6,7]);
 assert.deepEqual(contestedBy(c,{team:0,playerId:91,bankOf:()=>-5000,sort:'season'}),[],'nobody can afford him');
 assert.deepEqual(contestedBy(c,{team:0,playerId:81,bankOf:()=>5000,sort:'season'}),[],'20 a game helps nobody');
});
