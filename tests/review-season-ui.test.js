import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as ST from '../src/standings.js';
import * as FT from '../src/forecast-text.js';
import {seasonRosters,playerOutlook,pointsSpread,expectedPoints,gameWeeks,parseInjuries,injuryFactor,teamPoints} from '../src/season.js';
const source=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),plain=s=>s.replace(/\u00a0/g,' ');
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// 80 drafted players and 20 free agents on one club; #81 (a free agent) is a star.
const cal=Array.from({length:40},(_,i)=>({date:add('2026-10-26',2*i),week:1+Math.floor(i/3)}));
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:'C',
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i===80?60:10,minutes:30,games:82,meanSeason:i===80?4920:820,seasonFloor:i===80?3000:500,seasonCeiling:i===80?6000:1100}}));
const live={clubs:{C:cal},players:Object.fromEntries(players.map(p=>[p.sportsId,{club:'C',games:[]}]))};
const league=(transfers,today='2026-10-24')=>({players,live,transfers,picks,rosters:seasonRosters(transfers,picks),injuries:new Map(),today});
const star=players[80],running=new Map([[81,{points:40,day:'2026-10-24'}]]);
const restOf=(c,ids)=>ids.reduce((s,id)=>s+playerOutlook(players[id-1],{...c,running}).season.points,0);
const sdOf=(c,ids)=>Math.sqrt(ids.reduce((s,id)=>{const p=players[id-1],o=playerOutlook(p,{...c,running});return s+pointsSpread(p,{...c,running},o.season)**2;},0));

// ---------- R22/R13: a later buyer's slot scores nothing for a player another FBL team holds, in the forecast too ----------
test('the league race gives a shared player\'s running points and forecast only to the team that had him first',()=>{
 // Team 0 buys #81 on 22.10; team 1 buys the same #81 on 23.10 while team 0 holds him (an FBL breach).
 const c=league([{team:0,outId:1,inId:81,date:'2026-10-22'},{team:1,outId:2,inId:81,date:'2026-10-23'}]);
 const race=ST.leagueRace(c,running,{sims:2000}),[r0,r1]=race.rows,mine=t=>c.rosters[t].filter(id=>!(t===1&&id===81));
 assert.ok(c.rosters[1].includes(81)&&c.rosters[0].includes(81));
 // His 40 running points and his rest of the season go to team 0 only; team 1 keeps the other nine.
 assert.equal(r0.now,40);assert.equal(r1.now,0);
 assert.deepEqual([...ST.shadowedHoldings(c)],[['1:81',0]]);
 assert.ok(Math.abs(r1.rest-restOf(c,mine(1)))<1e-6);assert.ok(Math.abs(r0.rest-restOf(c,c.rosters[0]))<1e-6);
 assert.ok(Math.abs(r1.sd-sdOf(c,mine(1)))<1e-6);
 assert.ok(r0.rest-r1.rest>playerOutlook(star,{...c,running}).season.points*.9);
 assert.ok(r0.first>r1.first+.5);
 // The Teams tab's window forecast follows the same rule.
 const w=ST.periodWindows(c).season;
 assert.deepEqual(ST.windowAhead(c,1,star,w,running),{points:0,games:0});
 const own=ST.windowAhead(c,0,star,w,running),e=expectedPoints(star,{...c,running},c.today,w.to);
 assert.ok(Math.abs(own.points-(40+e.points))<1e-9);assert.ok(own.games>10);
 // Team 0 sells him on 26.10: from then on he is team 1's, fact and forecast alike.
 const repaired=league([...c.transfers,{team:0,outId:81,inId:82,date:'2026-10-26'}],'2026-10-27');
 assert.equal(ST.shadowedHoldings(repaired).size,0);
 const after=ST.leagueRace(repaired,new Map(),{sims:500});
 assert.ok(Math.abs(after.rows[1].rest-restOf(repaired,repaired.rosters[1]))<1e-6);
});
test('when the watcher cannot tell who bought first, both teams keep the shared player in the race',()=>{
 const at='2026-10-23T09:00:00Z',after='2026-10-23T08:50:00Z';
 const c=league([{team:0,outId:1,inId:81,date:'2026-10-23',seenAt:at,seenAfter:after},{team:1,outId:2,inId:81,date:'2026-10-23',seenAt:at,seenAfter:after}]);
 assert.equal(ST.shadowedHoldings(c).size,0);
 const race=ST.leagueRace(c,running,{sims:500});
 assert.equal(race.rows[0].now,40);assert.equal(race.rows[1].now,40);
 assert.ok(Math.abs(race.rows[1].rest-restOf(c,c.rosters[1]))<1e-6);
 const w=ST.periodWindows(c).week;assert.ok(ST.windowAhead(c,1,star,w,running).points>=40);
});
test('the Teams tab reads the shared rule: rows and KPIs pass the shadowed holdings to windowAhead',()=>{
 const ui=source('src/season-ui.js');
 assert.match(ui,/const ahead=\(p,ctx,w,running,shadow,credit\)=>windowAhead\(ctx,team,p,w,running,shadow,credit\)/);
 assert.match(ui,/shadow=shadowedHoldings\(ctx\)/);assert.doesNotMatch(ui,/expectedPoints\(p,\{\.\.\.ctx,running\}/);
});

// ---------- R28: a played game counts in the tour expectedPoints counted it in ----------
test('period facts place a played game in its own tour: an MLK-day game filed under the previous tour\'s last date',()=>{
 // Club A plays a tour-13 game late on US Sunday (Moscow 18.01); club B an MLK US-Monday afternoon game of tour 14 that
 // Sports.ru also files under 18.01 (tip 18:00 UTC), against club D. Played games stay in the calendars, marked gone.
 const calA=[{date:'2027-01-13',week:13},{date:'2027-01-18',week:13,gone:true},{date:'2027-01-20',week:14},{date:'2027-01-24',week:14}];
 const calB=[{date:'2027-01-14',week:13},{date:'2027-01-18',week:14,opponent:'D',tip:'2027-01-18T18:00:00Z',gone:true},{date:'2027-01-22',week:14}];
 const calD=[{date:'2027-01-15',week:13},{date:'2027-01-18',week:14,opponent:'B',tip:'2027-01-18T18:00:00Z',gone:true},{date:'2027-01-23',week:14}];
 const clubs={A:calA,B:calB,D:calD},weeks=gameWeeks({clubs});
 assert.deepEqual(weeks,{13:{start:'2027-01-13',end:'2027-01-18'},14:{start:'2027-01-19',end:'2027-01-24'}});
 // Player 1 is on B; player 2 played that game for B and has been traded to A since (his club is A now). An ESPN-scored
 // row has no opponent: the player's own club calendar places it.
 const rows={1001:{club:'B',games:[{date:'2027-01-18',played:true,points:40,source:'ESPN'}]},1002:{club:'A',games:[{date:'2027-01-18',opponent:'D',played:true,points:25}]}};
 const ps=[{id:1,name:'X',sportsId:'1001',sportsClub:'B',positions:['PG'],forecast:{meanPerGame:30,games:82}},{id:2,name:'Y',sportsId:'1002',sportsClub:'A',positions:['PG'],forecast:{meanPerGame:20,games:82}}];
 const draft=[1,...Array(7).fill(0).map((_,i)=>100+i),2,...Array(71).fill(0).map((_,i)=>200+i)];
 const c={players:ps,live:{clubs,players:rows},injuries:new Map(),today:'2027-01-20',rosters:seasonRosters([],draft),transfers:[],picks:draft};
 const tour13={from:'2027-01-13',to:'2027-01-18'},tour14={from:'2027-01-19',to:'2027-01-24'},w=ST.periodWindows(c);
 assert.deepEqual(w.week,{from:'2027-01-19',to:'2027-01-24'});
 assert.equal(ST.windowFact(c,0,tour14),40+25);assert.equal(ST.windowFact(c,0,tour13),0);
 assert.equal(ST.windowFact(c,0,w.week,'1001'),40);assert.equal(ST.windowFact(c,0,w.week,'1002'),25);
 // The season fact still equals the league table's points.
 assert.equal(ST.windowFact(c,0,w.season),teamPoints(c,[],draft)[0]);
 // Before tip-off the same game was expected in tour 14, not in tour 13: fact and forecast agree on the tour.
 const before={...c,today:'2027-01-18',live:{clubs:{A:calA,B:calB.map(({gone,...g})=>g),D:calD},players:{1001:{club:'B',games:[]}}}};
 assert.ok(expectedPoints(ps[0],before,tour14.from,tour14.to).games>1);assert.equal(expectedPoints(ps[0],before,tour13.from,tour13.to).games,0);
 // A game no calendar lists counts on its own date.
 const bare={...c,live:{clubs,players:{1001:{club:'B',games:[{date:'2027-01-16',played:true,points:7}]}}}};
 assert.equal(ST.windowFact(bare,0,tour13),7);
});

// ---------- R26/R39: the absence and coverage labels say what the numbers are ----------
test('own absence rates are labelled as the last five seasons, older ones weighted 0.6, as availability_model computes them',()=>{
 const py=source('scripts/availability_model.py');
 const lags=Number(py.match(/for lag in range\(1,(\d+)\):\s*\n\s*o=self\.table\.get\(\(pid,t-lag\)\);w=self\.decay\*\*\(lag-1\)/)[1])-1;
 const decay=Number(py.match(/def __init__\(self,table,history,seasons,decay=([\d.]+)/)[1]);
 assert.equal(FT.OWN_SEASONS,lags);assert.equal(FT.OWN_DECAY,decay);
 const a={ownShortPer82:3.1,ownLongPer82:1.2,leagueShortSpellsPer82:7.2,leagueLongSpellsPer82:1.7,lastSeasonEnd:'healthy'};
 const head=plain(FT.absenceRates(a,60).head);
 assert.equal(head,'Пропуски по логам 5 последних сезонов (каждый более ранний — с весом 0,6 от следующего)');
 assert.doesNotMatch(plain(FT.healthLine(a,{games:60},null)),/2002/);assert.doesNotMatch(plain(FT.absenceShort(a,60)),/2002/);
});
test('the games range quotes the held-out coverage of the published (healthy-start) construction',()=>{
 const a={shortSpellsPer82:4,longSpellsPer82:.8,leagueShortSpellsPer82:7.2,leagueLongSpellsPer82:1.7,gamesRange:[53,81],gamesMedian:74,lastSeasonEnd:'healthy'};
 const audit={testTarget:2026,holdout:{coverage80:.791,gamesCoverage80:.7934,deployedGamesCoverage80:.7872}};
 assert.match(plain(FT.healthLine(a,{games:70},audit)),/медиана 74 \(на сезоне 2025\/26 в такой диапазон попали 79 % игроков\)/);
 assert.equal(FT.rangeCoverage(audit).games,.7872);
 // An older report measured only the regression-anchored chain, which the card does not show: no number then.
 const old={testTarget:2026,holdout:{coverage80:.746,gamesCoverage80:.798}};
 assert.doesNotMatch(FT.healthLine(a,{games:70},old),/попали/);
});

// ---------- R27: a season-ending report never shows ESPN's placeholder date as a return ----------
test('season-ending OUT reports read "до конца сезона", like the 0 games the forecast counts',()=>{
 const feed={injuries:[{injuries:[
  {athlete:{displayName:'Johnny Furphy',links:[{href:'https://espn.com/nba/player/_/id/1'}]},status:'Out',details:{fantasyStatus:{abbreviation:'OUT'},returnDate:'2027-01-02'},shortComment:'Furphy was diagnosed with a torn right ACL on Monday and will miss the remainder of the season, Michael Scotto of USA Today reports.'},
  {athlete:{displayName:'Ariel Hukporti',links:[{href:'https://espn.com/nba/player/_/id/2'}]},status:'Out',details:{fantasyStatus:{abbreviation:'OUT'},returnDate:'2027-10-01'},shortComment:'Hukporti has sustained a season-ending ruptured right Achilles tendon, per Shams Charania of ESPN.'},
  {athlete:{displayName:'A',links:[{href:'https://espn.com/nba/player/_/id/3'}]},status:'Out',details:{fantasyStatus:{abbreviation:'OFS'},returnDate:'2027-04-12'},shortComment:''},
  {athlete:{displayName:'B',links:[{href:'https://espn.com/nba/player/_/id/4'}]},status:'Out',details:{fantasyStatus:{abbreviation:'OUT'},returnDate:'2026-11-02'},shortComment:'B will miss the season opener with a sprained ankle.'},
  {athlete:{displayName:'C',links:[{href:'https://espn.com/nba/player/_/id/5'}]},status:'Day-To-Day',details:{fantasyStatus:{abbreviation:'GTD'},returnDate:'2026-10-23'},shortComment:''}]}]};
 const i=parseInjuries(feed);
 for(const id of ['1','2','3']){assert.equal(FT.injuryUntil(i.get(id)),'до конца сезона');assert.equal(injuryFactor(i.get(id),'2027-03-01','2026-10-21'),0);}
 assert.equal(FT.injuryUntil(i.get('4')),'до ~02.11');assert.equal(FT.injuryUntil(i.get('5')),'');assert.equal(FT.injuryUntil(null),'');
 // The chip, the injuries list and the swap explanation all read it from there.
 const ui=source('src/season-ui.js');
 assert.match(ui,/const until=injuryUntil\(i\);/);assert.match(ui,/\[injuryStatus\(x\.injury\.status\)\.label,injuryUntil\(x\.injury\)\]/);
 assert.doesNotMatch(ui,/fantasyStatus==='OFS'/);
});

// ---------- R29: the card's method texts match the forecast's inputs ----------
test('ESPN\'s own games are quoted as ESPN\'s, with the known-absence cap beside them',()=>{
 const f={version:4,meanPerGame:24.25,games:30,sources:{model:{perGame:21,games:30},espn:{perGame:27.5,games:30,projectedGames:60}},gamesBasis:'MEAN_ESPN_MODEL'};
 const text=plain(FT.forecastSources(f));
 assert.match(text,/ESPN: 27,5 × 60 \(с учётом пропуска — 30\) → итог 24,3 × 30 матчей/);
 assert.equal(plain(FT.espnNumbers({perGame:27.5,games:61})),'27,5 × 61');
 // Below a whole game the cap changes nothing visible, so nothing is added.
 assert.equal(plain(FT.espnNumbers({perGame:27.5,games:60.2,projectedGames:60})),'27,5 × 60');
 assert.match(source('src/season-ui.js'),/ESPN \$\{espnNumbers\(e\)\} → итог/);
});
test('the game ceiling text names the peer fallback for veterans with under 10 logged games too',()=>{
 const py=source('scripts/projection_model.py'),main=source('src/main.js');
 assert.match(py,/if len\(logs\)>=10:\s*\n\s*shift=rate-statistics\.mean\(logs\);game_floor=quantile\(logs,\.1\)\+shift;game_ceiling=quantile\(logs,\.9\)\+shift/);
 assert.match(main,/90-й процентиль собственных матчей игрока за два сезона, сдвинутый к прогнозу ФО за матч \(у новичков и у сыгравших за два сезона меньше 10 матчей — игроков того же уровня\)/);
});
