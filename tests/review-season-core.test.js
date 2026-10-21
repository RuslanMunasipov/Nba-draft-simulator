import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {playRate,perGame,expectedPoints,seasonEnding,injuryFactor,playerPicture,horizons,CALIBRATION} from '../src/season.js';
// Review findings on src/season.js (audit 21.10.2026): R10-R12/R33 known absences, R11 the spell after the return, R14 GTD
// at night, R15 running games, R16 season-ending wording, R18/R07 club games with the NBA Cup placeholders, R19 0 minutes.
const days=(from,n,step=2)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*step*864e5).toISOString().slice(0,10));
const usBefore=day=>new Date(Date.parse(day+'T00:00:00Z')-864e5).toISOString().slice(0,10);
const cal82=days('2026-10-22',82).map((date,i)=>({date,week:1+Math.floor(i/3)}));
const ctxWith=(p,extra={})=>({players:[p],live:{clubs:{X:extra.calendar||cal82},players:extra.players||{}},injuries:new Map(extra.injuries||[]),today:extra.today||'2026-10-21',rosters:[],...(extra.now?{now:extra.now}:{}),...(extra.running?{running:extra.running}:{})});
const season=(p,c)=>expectedPoints(p,c,c.today,'2027-12-31').games;
const {priorGames:k,spellMisses:cap,spellGames:spell}=CALIBRATION.availability;
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);

// ---------- R10, R12/R33: an absence the build knew is already out of forecast.games ----------
test('a known absence: the ESPN report alone takes the games until his return; cleared, he plays every club game',()=>{
 // Availability only from the ESPN injury report (the league owner, 21.10.2026): whatever the forecast's games.
 const b=12,left=82-b,out=[['e1',{status:'Out',fantasyStatus:'OUT',returnDate:usBefore(cal82[b].date),comment:'(knee) will not be ready for the start of the regular season'}]];
 for(const F of [40,53.5,70]){
  const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{gamesBasis:'ESPN_REPORT',meanPerGame:20,minutes:30,games:F,knownAbsence:{blockedGames:b,gamesLeft:left,unconditionalGames:82}}};
  near(season(p,ctxWith(p,{injuries:out})),left);
  near(season(p,ctxWith(p)),82);
 }
});
test('a rookie with a known absence: the report\'s games out, the rest all his; a season-ending report takes them all',()=>{
 const back=usBefore(cal82[41].date),out=[['e1',{status:'Out',fantasyStatus:'OUT',returnDate:back,comment:'(knee) out until December'}]];
 const rookie={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',isRookie:true,forecast:{version:4,origin:'DRAFT_PICK_MODEL',gamesBasis:'ESPN_REPORT',meanPerGame:10,minutes:20,games:41,availability:null,
  knownAbsence:{returnDate:back,seasonEnding:false,blockedGames:41,gamesLeft:41,unconditionalGames:82},sources:{model:{perGame:10,games:30}}}};
 near(season(rookie,ctxWith(rookie,{injuries:out})),41);
 near(season(rookie,ctxWith(rookie,{injuries:[['e1',{status:'Out',fantasyStatus:'OFS'}]]})),0);
});
// ---------- R11: the capped spell does not expire the day he is back ----------
const spellCase=(playedIdx,done,injury,forecast={meanPerGame:20,games:70})=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast};
 const calendar=cal82.map((g,i)=>i<done?{...g,score:'100:90'}:g),live={games:playedIdx.map(i=>({date:cal82[i].date,played:true,points:20,minutes:'30:00'}))};
 const c=ctxWith(p,{calendar,today:cal82[done].date,players:{s1:live},injuries:injury?[['e1',injury]]:[]});
 return playRate(p,live,c);
};
const range=(a,b)=>Array.from({length:b-a},(_,i)=>a+i);
test('the play rate is every club game: missed games and spells never lower it, the ESPN report decides absences',()=>{
 assert.equal(spellCase(range(0,10),40,{status:'Out',fantasyStatus:'OUT',returnDate:usBefore(cal82[40].date)}),1);
 assert.equal(spellCase(range(0,10),40,{status:'Day-To-Day',fantasyStatus:'GTD',returnDate:usBefore(cal82[40].date)}),1);
 assert.equal(spellCase([...range(0,10),40],41,null),1);
 assert.equal(spellCase(range(0,10),40,null),1);
 assert.equal(spellCase(range(0,10),40,null,{meanPerGame:20,games:40,knownAbsence:{blockedGames:30,gamesLeft:52}}),1);
});
// ---------- R14: a GTD report is judged against the US day, not the Moscow date ----------
test('from 00:00 MSK on game night a day-to-day report still halves only the doubtful game',()=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:82}};
 // Moscow dates of US-evening games: US 21.10, 23.10, 24.10, 26.10. ESPN dates the doubtful game by its US day.
 const calendar=['2026-10-22','2026-10-24','2026-10-25','2026-10-27'].map(date=>({date,week:1})),gtd=[['e1',{status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-21'}]];
 const per=c=>c.live.clubs.X.map(g=>expectedPoints(p,c,g.date,g.date).games/playRate(p,undefined,c));
 const evening=ctxWith(p,{calendar,today:'2026-10-21',injuries:gtd}),night=ctxWith(p,{calendar,today:'2026-10-22',injuries:gtd});
 assert.deepEqual(per(evening).map(x=>+x.toFixed(6)),[.5,1,1,1]);
 assert.deepEqual(per(night).map(x=>+x.toFixed(6)),[.5,1,1,1]);
 // With the time known (03:00 MSK, the game under way and gone from the expectation) the next games are whole.
 const at=ctxWith(p,{calendar,today:'2026-10-22',injuries:gtd,now:Date.parse('2026-10-22T00:00:00Z')});
 assert.deepEqual(per(at).map(x=>+x.toFixed(6)),[0,1,1,1]);
 // In the day, with the night's result in, the same report is stale: the next three US days are doubtful, as before.
 const day=ctxWith(p,{calendar:calendar.map((g,i)=>i?g:{...g,score:'100:90'}),today:'2026-10-22',injuries:gtd});
 assert.deepEqual(per(day).map(x=>+x.toFixed(6)),[0,.5,.5,1]);
 // The factor itself: a fourth argument names the US day; without it the old reading stands.
 assert.equal(injuryFactor(gtd[0][1],'2026-10-23','2026-10-22','2026-10-21'),1);assert.equal(injuryFactor(gtd[0][1],'2026-10-23','2026-10-22'),.5);
});

// ---------- R15: a running game keeps the part still to play ----------
test('a running game adds its points so far and the rest of it, not nothing, and is not a game left',()=>{
 const p={id:7,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:30,minutes:30,games:82}};
 const calendar=[{date:'2026-10-22',week:1},{date:'2026-10-24',week:1}];
 const at=(detail,minutes=6)=>expectedPoints(p,ctxWith(p,{calendar,today:'2026-10-22',running:new Map([[7,{points:5,minutes,day:'2026-10-22',game:{detail}}]])}),'2026-10-22','2026-10-24');
 const rest=left=>30+(30-1)*left;
 near(at('6:00 - 2nd').points,rest((12+12+6)/48));near(at('6:00 - 2nd').games,1);
 near(at('Halftime').points,rest(.5));near(at('End of 3rd').points,rest(.25));near(at('2:00 - OT').points,rest(2/48));
 near(at('0:45.2 - 4th').points,rest(45.2/60/48));near(at('45.2 - 4th').points,rest(45.2/60/48));
 // Without ESPN's clock: his minutes against those expected. A final game Sports.ru has not counted yet has nothing left.
 near(at('',12).points,rest(1-12/30));
 near(expectedPoints(p,ctxWith(p,{calendar,today:'2026-10-22',running:new Map([[7,{points:5,minutes:6,final:true,day:'2026-10-22',game:{detail:'Final',final:true}}]])}),'2026-10-22','2026-10-24').points,rest(0));
 // Outside the window nothing of it is added.
 near(expectedPoints(p,ctxWith(p,{calendar,today:'2026-10-22',running:new Map([[7,{points:5,minutes:6,day:'2026-10-22',game:{detail:'6:00 - 2nd'}}]])}),'2026-10-24','2026-10-24').points,30);
});

// ---------- R16: season-ending wording of the present only ----------
test('a past season-ending injury in the comment does not end this season; "the rest of the regular season" does',()=>{
 const out=comment=>({status:'Out',fantasyStatus:'OUT',returnDate:'2026-10-23',comment});
 for(const c of ['Smith (knee) has been ruled out for Thursday\'s game as he continues to work back from the season-ending surgery he underwent in March.',
  'Murray (knee), who missed the remainder of the season last year with a torn ACL, will not play Thursday.',
  'Doe (ankle) is out Thursday; he was out for the season last year after ankle surgery.',
  'Jones (Achilles) will not play Friday, his first back-to-back since returning from a season-ending Achilles tear suffered in 2025.',
  'Green (ankle) is out for the rest of the season series against the Celtics.','Lee will miss the season finale.',
  'Cardwell (calf) is expected to miss at least the first five or six games of the regular season, with a longer absence possible.'])
  assert.ok(!seasonEnding(out(c)),c);
 for(const c of ['Brown (hamstring) will miss the rest of the regular season.','Brown (hamstring) will be shut down for the remainder of the regular season.',
  'Brown will miss the remainder of the 2026-27 regular season.','Hukporti has sustained a season-ending ruptured right Achilles tendon, per Shams Charania of ESPN.',
  'Simmons is believed to have suffered a season-ending Achilles tear during practice Sunday, Shams Charania of ESPN reports.',
  'Smith (knee) will undergo season-ending surgery Monday.','Smith will miss the remainder of the 2026-27 season and part of 2027-28.','Furphy was diagnosed with a torn right ACL on Monday and will miss the remainder of the season, Michael Scotto of USA Today reports.'])
  assert.ok(seasonEnding(out(c)),c);
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:30,games:70}};
 assert.ok(season(p,ctxWith(p,{injuries:[['e1',out('Smith (knee) has been ruled out for Thursday\'s game as he continues to work back from the season-ending surgery he underwent in March.')]]}))>60);
 assert.equal(season(p,ctxWith(p,{injuries:[['e1',out('Brown (hamstring) will miss the rest of the regular season.')]]})),0);
});

// ---------- R18/R07: the club games of a player picture are those the expectation counts ----------
test('a player picture counts the NBA Cup games Sports.ru has not listed yet, so the share shown is his play rate',()=>{
 const dates=[...days('2026-10-22',22),...days('2026-12-13',58)],calendar=dates.map((date,i)=>({date,week:1+Math.floor(i/3)}));
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:72}},c=ctxWith(p,{calendar});
 const x=playerPicture(p,c,'season');
 assert.equal(x.clubGames,82);near(x.expectedGames/x.clubGames,playRate(p,undefined,c));
 assert.equal(horizons(c).season.to,dates.at(-1));
});

// ---------- R19: a 0-minute appearance is minutes, not a reason to drop the minute model ----------
test('an ESPN line with MIN 0 keeps the calibrated estimate, as a few seconds on Sports.ru do',()=>{
 const p={forecast:{meanPerGame:10,minutes:22,components:{participation:1}}};
 const games=days('2026-10-22',8).map((date,i)=>({date,played:true,points:[9,14,6,12,10,8,11,13][i],minutes:'18:40'}));
 const cameo=minutes=>perGame(p,{games:[...games,{date:'2026-11-08',played:true,points:2,minutes}]});
 const zero=cameo('0'),sec=cameo('0:01');
 assert.ok(Number.isFinite(zero.minutes));near(zero.value,sec.value,.01);
 // A row with no minutes at all still falls back to the plain shrink.
 assert.equal(cameo(undefined).minutes,undefined);
});
test('season-ending wording: the app reads the ESPN report exactly as the projection model does (shared fixture)',()=>{
 const {cases}=JSON.parse(readFileSync(new URL('./fixtures/season-ending-comments.json',import.meta.url),'utf8'));
 for(const c of cases)assert.equal(seasonEnding(c),c.ending,c.comment);
});
