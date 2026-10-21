import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {stints,inStint,shadowed,teamPoints,seasonRosters,perGame,playRate,injuryFactor,seasonEnding,expectedPoints,seasonCalendar,gameWeeks,horizons,tourDate,tipOf,boxScorePoints,liveGamePoints,CALIBRATION} from '../src/season.js';
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:i<80?'C'+(i%40):'F'+i,
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:30,games:82}}));
const g=(date,points,extra={})=>({date,points,played:true,...extra});
const pointsOf=(games,transfers)=>teamPoints({players,live:{players:games}},transfers,picks);
const days=(from,n,step=2)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*step*864e5).toISOString().slice(0,10));

// ---------- Transfer-day credit: a game belongs to the buyer only if it tipped off after the move ----------
test('a night game on the transfer date stays with the team that sold the player',()=>{
 // Sports.ru files the US-evening game under the next Moscow date: it was over long before the 08:00 transfer window.
 const games={1001:{games:[g('2026-10-20',10),g('2026-10-22',40)]},1081:{games:[g('2026-10-22',55),g('2026-10-24',7)]}};
 const t={team:0,outId:1,inId:81,date:'2026-10-22',outPrice:0,inPrice:0,seenAt:'2026-10-22T07:00:00Z'};
 assert.equal(pointsOf(games,[t])[0],10+40+7);
 // Untimed (league log): the move counts from the window's opening, 08:00 MSK, the same answer.
 assert.equal(pointsOf(games,[{...t,seenAt:undefined}])[0],57);
 const s=stints([t],picks);assert.deepEqual(s.filter(x=>[1,81].includes(x.playerId)).map(x=>[x.playerId,x.from,x.fromAt,x.to,x.toAt]),
  [[1,'2026-10-18',null,'2026-10-22','2026-10-22T07:00:00Z'],[81,'2026-10-22','2026-10-22T07:00:00Z',null,null]]);
});
test('a game that tips off after the move goes to the buyer: matinees with a stored tip, the opening night after the deadline',()=>{
 const t={team:0,outId:1,inId:81,date:'2026-12-25',outPrice:0,inPrice:0,seenAt:'2026-12-25T09:00:00Z'};
 // Christmas matinee at 20:00 MSK (17:00Z), after a move seen at 12:00 MSK.
 const xmas={1001:{games:[g('2026-12-25',30,{tip:'2026-12-25T17:00:00Z'})]},1081:{games:[g('2026-12-25',25,{tip:'2026-12-25T17:00:00Z'})]}};
 assert.equal(pointsOf(xmas,[t])[0],25);
 // The same date with a tip before the move: the seller's.
 const early={1001:{games:[g('2026-12-25',30,{tip:'2026-12-25T01:00:00Z'})]},1081:{games:[g('2026-12-25',25,{tip:'2026-12-25T01:00:00Z'})]}};
 assert.equal(pointsOf(early,[t])[0],30);
 // 20.10: Sports.ru's deadline was 21:30 MSK and the only game dated 20.10 tipped at 22:00, after every legal move.
 assert.equal(new Date(tipOf({date:'2026-10-20'})).toISOString(),'2026-10-20T19:00:00.000Z');
 const opener={1001:{games:[g('2026-10-20',30)]},1081:{games:[g('2026-10-20',44)]}};
 const pre={team:0,outId:1,inId:81,date:'2026-10-20',outPrice:0,inPrice:0,seenAt:'2026-10-20T18:20:00Z'};
 assert.equal(pointsOf(opener,[pre])[0],44);assert.equal(pointsOf(opener,[{...pre,seenAt:undefined}])[0],44);
});
test('the shared predicate covers a holding from its move to the next: the same rule for every fact',()=>{
 const t=[{team:0,outId:1,inId:81,date:'2026-10-22',seenAt:'2026-10-22T07:00:00Z'},{team:0,outId:81,inId:1,date:'2026-10-27'}];
 const [sold,bought,back]=stints(t,picks).filter(s=>s.team===0&&[1,81].includes(s.playerId)).sort((a,b)=>a.from.localeCompare(b.from)||a.playerId-b.playerId);
 assert.ok(inStint({date:'2026-10-22'},sold)&&!inStint({date:'2026-10-22'},bought));
 assert.ok(inStint({date:'2026-10-23'},bought)&&inStint({date:'2026-10-27'},bought)&&!inStint({date:'2026-10-28'},bought));
 assert.ok(inStint({date:'2026-10-28'},back)&&!inStint({date:'2026-10-27'},back));
 // Ordinary transfers never shadow anyone.
 assert.ok(stints(t,picks).every(s=>!s.shadowedBy&&!s.doubt));
});

// ---------- A player held by two FBL teams scores only for the first holder ----------
test('a player bought while another FBL team holds him scores only for the first holder until the breach ends',()=>{
 const games={1081:{games:[g('2026-10-24',50),g('2026-10-27',30)]},1002:{games:[g('2026-10-21',10),g('2026-10-24',10)]}};
 const t=[{team:0,outId:1,inId:81,date:'2026-10-22'},{team:1,outId:2,inId:81,date:'2026-10-23'}];
 const pts=pointsOf(games,t);
 // Team 0 had him first: his 50 is team 0's; team 1's slot scores 0 for it and keeps only #2's game before the move.
 assert.equal(pts[0],50+30);assert.equal(pts[1],10);
 const distinct=50+30+10;assert.equal(pts.reduce((a,b)=>a+b,0),distinct);
 const later=stints(t,picks).find(s=>s.team===1&&s.playerId===81);assert.ok(shadowed(later));
 // Team 0 sells him on 26.10: from then on he scores for team 1.
 const repaired=[...t,{team:0,outId:81,inId:82,date:'2026-10-26'}];
 assert.deepEqual(pointsOf(games,repaired).slice(0,2),[50,10+30]);
 assert.ok(!shadowed(stints(repaired,picks).find(s=>s.team===1&&s.playerId===81)));
 // A drafted player bought by another team stays the drafting team's.
 const drafted=[{team:1,outId:2,inId:1,date:'2026-10-23'}],own={1001:{games:[g('2026-10-24',33)]}};
 assert.deepEqual(pointsOf(own,drafted).slice(0,2),[33,0]);
});
test('when the watcher cannot tell who bought first, both keep the points and both holdings are marked for the lawyer',()=>{
 const games={1081:{games:[g('2026-10-24',50)]}};
 const at='2026-10-23T09:00:00Z',after='2026-10-23T08:50:00Z';
 const t=[{team:0,outId:1,inId:81,date:'2026-10-23',seenAt:at,seenAfter:after},{team:1,outId:2,inId:81,date:'2026-10-23',seenAt:at,seenAfter:after}];
 assert.deepEqual(pointsOf(games,t).slice(0,2),[50,50]);
 const both=stints(t,picks).filter(s=>s.playerId===81);
 assert.deepEqual(both.map(s=>[s.team,s.doubt]).sort(),[[0,[1]],[1,[0]]]);assert.ok(both.every(s=>!shadowed(s)));
 // Seen in separate watcher reads, the earlier one is first.
 const apart=[t[0],{...t[1],seenAt:'2026-10-23T09:10:00Z',seenAfter:'2026-10-23T09:05:00Z'}];
 assert.deepEqual(pointsOf(games,apart).slice(0,2),[50,0]);
});

// ---------- Injury reports: one source per absence ----------
const cal82=days('2026-10-22',82).map(date=>({date}));
const ctxWith=(p,extra={})=>({players:[p],live:{clubs:{X:extra.calendar||cal82},players:extra.players||{}},injuries:new Map(extra.injuries||[]),today:extra.today||'2026-10-21',rosters:[]});
const season=(p,c)=>expectedPoints(p,c,c.today,'2027-12-31').games;
test('an ESPN total that priced the reported absence is not cut again after the return',()=>{
 const butler={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:39,availability:{unconditionalGames:44},sources:{espn:{games:39},model:{games:44}}}};
 // Out until the US day of the 35th game: 48 games are left after the return.
 const back=new Date(Date.parse(cal82[34].date)-864e5).toISOString().slice(0,10),out=[['e1',{status:'Out',returnDate:back}]];
 const c=ctxWith(butler,{injuries:out});
 assert.ok(Math.abs(season(butler,c)-48*44/82)<1e-9,`${season(butler,c)} vs ${48*44/82}`);
 // A fresh injury the forecast never saw (ESPN 69, model 58.8) keeps the forecast's share: no switch to the lower model.
 const claxton={...butler,forecast:{meanPerGame:16,games:69,availability:{unconditionalGames:58.8}}};
 assert.ok(Math.abs(season(claxton,ctxWith(claxton,{injuries:out}))-48*69/82)<1e-9);
 // Without a report, and with a game-time decision, the forecast decides as before.
 assert.ok(Math.abs(season(butler,ctxWith(butler))-82*39/82)<1e-9);
 const gtd=[['e1',{status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-21'}]];
 assert.ok(Math.abs(playRate(butler,undefined,ctxWith(butler,{injuries:gtd}))-39/82)<1e-12);
});
test('while a report keeps him out, the games he has missed in this absence count as a few misses, not one each',()=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:70}};
 const played=cal82.slice(0,10).map(x=>({...x,score:'100:90'})),missed=cal82.slice(10,40).map(x=>({...x,score:'100:90'}));
 const calendar=[...played,...missed,...cal82.slice(40)],today=cal82[40].date,k=CALIBRATION.availability.priorGames,cap=CALIBRATION.availability.spellMisses;
 const live={games:played.map(x=>({date:x.date,played:true,points:20,minutes:'30:00'}))};
 const c=ctxWith(p,{calendar,today,players:{s1:live},injuries:[['e1',{status:'Out',returnDate:'2027-01-20'}]]});
 assert.ok(Number.isInteger(cap)&&cap<30);
 assert.ok(Math.abs(playRate(p,live,c)-(k*70/82+10)/(k+10+cap))<1e-12);
 // Without the report every missed game counts, as the calibration measured for unreported absences.
 assert.ok(Math.abs(playRate(p,live,{...c,injuries:new Map()})-(k*70/82+10)/(k+40))<1e-12);
});
test('the forecast share is not floored at 41 games; the .97 cap stays',()=>{
 assert.equal(playRate({forecast:{games:20}},null,null),20/82);
 assert.equal(playRate({forecast:{games:82}},null,null),.97);
 assert.equal(playRate({forecast:{games:0.2}},null,null),.01);
 const fringe={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:10,games:20}};
 assert.ok(Math.abs(season(fringe,ctxWith(fringe))-20)<1e-9);
 // The absence chain is scaled to that low share too.
 const chained={...fringe,forecast:{...fringe.forecast,availability:{hazards:[.05,.01]}}};
 assert.ok(Math.abs(season(chained,ctxWith(chained))-20)<1);
});
test('a day-to-day player is a half chance for the game ESPN dates his return by (its US day)',()=>{
 const gtd={status:'Day-To-Day',fantasyStatus:'GTD',returnDate:'2026-10-21'};
 assert.equal(injuryFactor(gtd,'2026-10-21','2026-10-20'),.5);assert.equal(injuryFactor(gtd,'2026-10-23','2026-10-20'),1);
 // A return date already past while he is still listed: the next three days are doubtful.
 const stale={...gtd,returnDate:'2026-10-15'};
 assert.equal(injuryFactor(stale,'2026-10-22','2026-10-20'),.5);assert.equal(injuryFactor(stale,'2026-10-25','2026-10-20'),1);
 // Moscow-dated calendar: the evening game of US 21.10 is filed under 22.10 and gets the half.
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:82}};
 const calendar=[{date:'2026-10-22'},{date:'2026-10-24'}];
 const c=ctxWith(p,{calendar,today:'2026-10-21',injuries:[['e1',gtd]]}),share=playRate(p,undefined,c);
 assert.ok(Math.abs(expectedPoints(p,c,'2026-10-22','2026-10-22').games-.5*share)<1e-12);
 assert.ok(Math.abs(expectedPoints(p,c,'2026-10-24','2026-10-24').games-share)<1e-12);
});
test('an ESPN return date is a US day: the night game Sports.ru files under it is still missed',()=>{
 const out={status:'Out',returnDate:'2026-11-20'};
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:82}};
 const calendar=[{date:'2026-11-20'},{date:'2026-11-21'}],c=ctxWith(p,{calendar,today:'2026-11-01',injuries:[['e1',out]]});
 assert.ok(Math.abs(expectedPoints(p,c,'2026-11-01','2026-11-30').games-.97)<1e-12);
 // A matinee of the return day itself (tip stored, 13:00 ET) is played.
 const matinee=ctxWith(p,{calendar:[{date:'2026-11-20',tip:'2026-11-20T18:00:00Z'}],today:'2026-11-01',injuries:[['e1',out]]});
 assert.ok(Math.abs(expectedPoints(p,matinee,'2026-11-01','2026-11-30').games-.97)<1e-12);
});
test('season-ending wording without the OFS flag ends the season, whatever placeholder return date ESPN shows',()=>{
 const out=comment=>({status:'Out',fantasyStatus:'OUT',returnDate:'2027-01-02',comment});
 for(const c of ['Furphy was diagnosed with a torn right ACL on Monday and will miss the remainder of the season, Michael Scotto of USA Today reports.',
  'Hukporti has sustained a season-ending ruptured right Achilles tendon, per Shams Charania of ESPN.',
  'Oweh (Achilles) underwent surgery Wednesday and will miss the entirety of the 2026-27 season','X will miss the entire 2026-27 season.'])
  assert.ok(seasonEnding(out(c)),c);
 for(const c of ['Bilodeau will miss the season opener against the Hornets on Wednesday due to a shoulder sprain',
  'Butler, who missed the rest of the 2025-26 season with a torn ACL, is ramping up','X is out for the season opener.'])
  assert.ok(!seasonEnding(out(c)),c);
 assert.ok(!seasonEnding({status:'Day-To-Day',fantasyStatus:'GTD',comment:"recovering from last season's season-ending surgery"}));
 const furphy=out('will miss the remainder of the season');
 assert.equal(injuryFactor(furphy,'2027-02-01','2026-10-20'),0);
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:7,games:61}};
 assert.equal(season(p,ctxWith(p,{injuries:[['e1',furphy]]})),0);
});

// ---------- The absence chain and the calendar ----------
test('zero hazards (rounded away in the database) give the flat share, not every game',()=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:78,availability:{hazards:[0,0]}}};
 assert.ok(Math.abs(season(p,ctxWith(p))-78)<1e-9);
});
test('a healthy player\'s rest-of-season games stay close to his share (the chain\'s front-loading is pinned)',()=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:.74*82,availability:{hazards:[.08,.022]}}};
 const c=ctxWith(p,{calendar:cal82.slice(42)});
 assert.ok(season(p,c)>.74*40&&season(p,c)<=1.06*.74*40,String(season(p,c)));
});
test('the 2 NBA Cup games Sports.ru has not listed yet are counted in the club\'s December break',()=>{
 const dates=[...days('2026-10-22',22),...days('2026-12-13',58)];assert.equal(dates.length,80);
 const live={clubs:{X:dates.map(date=>({date}))}},full=seasonCalendar(live,'X');
 const extra=full.filter(x=>x.placeholder);assert.equal(full.length,82);
 assert.deepEqual(extra.map(x=>x.date),['2026-12-06','2026-12-10']);
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:72}};
 assert.ok(Math.abs(season(p,ctxWith(p,{calendar:live.clubs.X}))-72)<1e-9);
 // Once the games are listed nothing is added; placeholders in the past are not expected any more; other calendars are left alone.
 assert.equal(seasonCalendar({clubs:{X:cal82}},'X'),cal82);
 assert.ok(Math.abs(season(p,ctxWith(p,{calendar:live.clubs.X,today:'2026-12-20'}))-72/82*dates.filter(d=>d>='2026-12-20').length)<1e-9);
 const short={clubs:{X:cal82.slice(0,60)}};assert.equal(seasonCalendar(short,'X'),short.clubs.X);
});
test('a US-afternoon game of a tour\'s first day counts in that tour, not in the one ending on its Moscow date',()=>{
 // 18.01.2027 (MLK day): A's US-Sunday night game is tour 13, B's Monday matinee tour 14.
 const clubs={A:[{date:'2027-01-12',week:13},{date:'2027-01-18',week:13},{date:'2027-01-20',week:14}],B:[{date:'2027-01-13',week:13},{date:'2027-01-18',week:14},{date:'2027-01-20',week:14}]};
 const weeks=gameWeeks({clubs});assert.deepEqual(weeks[13].end,'2027-01-18');assert.deepEqual(weeks[14].start,'2027-01-19');
 assert.equal(tourDate(clubs.B[1],weeks),'2027-01-19');assert.equal(tourDate(clubs.A[1],weeks),'2027-01-18');
 const mk=club=>({id:club,sportsId:club,espnId:club,sportsClub:club,forecast:{meanPerGame:20,games:82}});
 const ctx={players:[],live:{clubs,players:{}},injuries:new Map(),today:'2027-01-18'},h=horizons(ctx);
 assert.equal(h.week.to,'2027-01-18');
 assert.ok(Math.abs(expectedPoints(mk('A'),ctx,h.week.from,h.week.to).games-.97)<1e-12);
 assert.equal(expectedPoints(mk('B'),ctx,h.week.from,h.week.to).games,0);
 assert.ok(Math.abs(expectedPoints(mk('B'),ctx,'2027-01-19','2027-01-25').games-2*.97)<1e-12);
});
test('a postponed game keeps its tour number without stretching that tour over the next ones',()=>{
 const clubs={X:[{date:'2026-10-20',week:1},{date:'2026-10-26',week:1},{date:'2026-10-27',week:2},{date:'2026-11-02',week:2},{date:'2026-11-03',week:3},{date:'2026-11-09',week:3},{date:'2026-11-12',week:2},{date:'2026-11-10',week:4}]};
 const w=gameWeeks({clubs});
 assert.deepEqual(w[2],{start:'2026-10-27',end:'2026-11-02'});assert.deepEqual(w[3],{start:'2026-11-03',end:'2026-11-09'});
 for(const x of Object.values(w))assert.ok(x.start<=x.end,JSON.stringify(w));
});
test('a game that has already tipped off is not expected any more when the time is known',()=>{
 const p={id:1,sportsId:'s1',espnId:'e1',sportsClub:'X',forecast:{meanPerGame:20,games:82}};
 const c=ctxWith(p,{calendar:[{date:'2026-10-22',tip:'2026-10-21T23:30:00Z'},{date:'2026-10-24'}],today:'2026-10-22'});
 assert.ok(Math.abs(season(p,c)-2*.97)<1e-12);
 assert.ok(Math.abs(season(p,{...c,now:Date.parse('2026-10-22T07:00:00Z')})-.97)<1e-12);
});

// ---------- Points per game: participation not scaled by minutes, early games lifted, pinned to Python ----------
test('the in-season estimate equals scripts/inseason_calibration.split on the golden cases',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/inseason-golden.json',import.meta.url)));
 const clock=m=>`${Math.floor(m)}:${String(Math.round((m-Math.floor(m))*60)).padStart(2,'0')}`;
 for(const x of fixture.cases){
  const player={isRookie:x.newcomer,forecast:{meanPerGame:x.prior.fp,minutes:x.prior.min,components:{participation:x.prior.part}}};
  const games=x.obs.map((o,i)=>({played:true,points:o.fp,minutes:clock(o.min),date:days('2026-10-21',x.obs.length,1)[i]}));
  const v=perGame(player,{games},fixture.points).value;
  assert.ok(Math.abs(v-x.expected)<1e-9,`${v} vs ${x.expected}`);
 }
});
test('the +1 per game played term is not scaled by minutes, and the shipped update lifts early games',()=>{
 const p={forecast:{meanPerGame:17,minutes:16,components:{participation:1}}},flat={...CALIBRATION.points,offsets:null};
 // The same counting rate (1 per minute) in a 30-minute role: the estimate is rate x minutes + 1, not (17/16) x minutes.
 const games=Array.from({length:6},(_,i)=>({played:true,points:30+1,minutes:'30:00',date:`2026-10-2${i}`})),e=perGame(p,{games},flat);
 assert.ok(Math.abs(e.value-(e.minutes+1))<1e-9);
 // Games exactly at the forecast's level: without the lift the estimate stays put; the early-season lift raises it.
 const level=Array.from({length:5},(_,i)=>({played:true,points:17,minutes:'16:00',date:`2026-10-2${i}`}));
 assert.ok(Math.abs(perGame(p,{games:level},flat).value-17)<1e-9);assert.ok(perGame(p,{games:level}).value>17);
});
test('live box scores: one point for the game played, whatever the minutes (Yahoo GP)',()=>{
 const line={MIN:'10',PTS:'4',FG:'2-3',FT:'0-0',REB:'1',AST:'0',STL:'0',BLK:'0',TO:'0',PF:'1'};
 assert.equal(boxScorePoints(line),4+1-1-1+1);assert.equal(boxScorePoints({...line,MIN:'9:45'}),4+1-1-1+1);assert.equal(boxScorePoints({...line,MIN:'0'}),4+1-1-1+1);
 const event={status:{type:{completed:false}}};
 const summary=lines=>({boxscore:{players:[{statistics:[{labels:Object.keys(line),athletes:lines.map((l,i)=>({athlete:{id:String(i)},stats:Object.values(l)}))}]}]}});
 const out=liveGamePoints(summary([line,{...line,MIN:'11'},{...line,MIN:'9'}]),event);
 assert.deepEqual({...out[0],name:undefined,team:undefined,line:undefined},{points:4,minutes:10,final:false,counting:3,name:undefined,team:undefined,line:undefined});assert.equal(out[0].line.MIN,'10');
 assert.equal(out[1].points,4);assert.equal(out[2].points,4);
});
