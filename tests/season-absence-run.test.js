// The chain starts inside an absence for a player missing games with no report on him or a report with no return date
// (season.js absenceRun), the week
// horizon is the FBL week a move counts in, and the confidence is the backtest's calibrated chance (src/confidence.js).
import test from 'node:test';import assert from 'node:assert/strict';
import {absenceRun,expectedPoints,playRate,horizons} from '../src/season.js';
import {calibrated,interpolate,phaseOf,normalCdf} from '../src/confidence.js';
import CONFIDENCE from '../data/confidence-calibration.json' with {type:'json'};
const days=(from,n,step=2)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*step*864e5).toISOString().slice(0,10));
const cal=days('2026-10-22',40).map((date,i)=>({date,week:1+Math.floor(i/3)}));
const today=cal[12].date,clubs={X:cal.map(g=>g.date<=today?{...g,score:'100:90'}:g)};
const p={id:1,sportsId:'s1',sportsClub:'X',forecast:{meanPerGame:30,games:70,minutes:32,availability:{hazards:[.06,.02]}}};
const row=d=>({date:d,played:true,points:30,minutes:'32:00',pointsSource:'ESPN'});
const live=(n)=>({club:'X',games:cal.slice(0,n).map(g=>row(g.date))});
const ctx=(n,extra={})=>({players:[p],live:{clubs,players:{s1:live(n)}},injuries:new Map(),today,...extra});

test('the run of club games missed since his last game, none when he played the last one',()=>{
 assert.equal(absenceRun(p,live(13),ctx(13)),0);
 assert.equal(absenceRun(p,live(9),ctx(9)),4);
 assert.equal(absenceRun(p,live(0),ctx(0)),13,'not one game this season: every finished club game');
});

test('a player missing games with no report is expected in the next games less, and more the longer the horizon lets him return',()=>{
 const to=cal.at(-1).date,next=cal[15].date;
 const healthy=expectedPoints(p,ctx(13),today,next),away=expectedPoints(p,ctx(9),today,next),shipped=expectedPoints(p,ctx(9,{noAbsenceRun:true}),today,next);
 assert.ok(away.games<healthy.games,'4 games out: fewer of the next games');
 assert.ok(away.games<shipped.games,'the chain as shipped read him as available now');
 // Over the rest of the season the gap is a share of what it is over the next games.
 const rest=expectedPoints(p,ctx(9),today,to),restHealthy=expectedPoints(p,ctx(13),today,to);
 assert.ok((restHealthy.games-rest.games)/restHealthy.games<(healthy.games-away.games)/healthy.games);
 // A report covers him instead: the chain then starts from his return, as before.
 const report=new Map([['undefined',{status:'Out',returnDate:cal[14].date}]]);
 assert.equal(expectedPoints({...p,espnId:undefined},ctx(9,{injuries:report}),today,next).games,expectedPoints({...p,espnId:undefined},ctx(9,{injuries:report,noAbsenceRun:true}),today,next).games);
 // The run the chain starts inside is not counted against his share again in full.
 assert.ok(playRate(p,live(6),ctx(6))>playRate(p,live(6),ctx(6,{noAbsenceRun:true})),"7 games out, the cap counts 4");
});

test('a report keeping him out with no return date (the NBA\'s report) continues his spell after the blocked days',()=>{
 const next=cal[25].date,q={...p,espnId:'e1'},out=new Map([['e1',{status:'Out',returnDate:null}]]);
 const reported=expectedPoints(q,ctx(9,{injuries:out}),today,next),shipped=expectedPoints(q,ctx(9,{injuries:out,noAbsenceRun:true}),today,next);
 assert.ok(reported.games<shipped.games,'4 games out and still out: the spell goes on after the 10 blocked days');
 // With a return date the report decides the absence alone, as before.
 const dated=new Map([['e1',{status:'Out',returnDate:cal[14].date}]]);
 assert.equal(expectedPoints(q,ctx(9,{injuries:dated}),today,next).games,expectedPoints(q,ctx(9,{injuries:dated,noAbsenceRun:true}),today,next).games);
});

test('on a week\'s last Moscow date after its games the week horizon is the next FBL week, the one a move counts in',()=>{
 const live={clubs:{X:[{date:'2026-10-25',week:1},{date:'2026-10-26',week:1},{date:'2026-10-28',week:2},{date:'2026-11-02',week:2}]}};
 const night=horizons({live,today:'2026-10-26',now:Date.parse('2026-10-26T05:00:00+03:00')}).week;
 const morning=horizons({live,today:'2026-10-26',now:Date.parse('2026-10-26T12:00:00+03:00')}).week;
 assert.equal(night.to,'2026-10-26','its games still run: this week');
 assert.equal(morning.to,'2026-11-02','after 08:00 the move counts for the next week');
 assert.equal(horizons({live,today:'2026-10-26'}).week.to,'2026-10-26','without a clock (the league race): the week of the date');
});

test('the calibrated confidence is the shipped map of z, never falls as z grows, and is Φ(z) without a map',()=>{
 for(const h of ['week','month','season'])for(const day of ['2026-11-01','2027-01-10','2027-03-01']){
  const zs=Array.from({length:61},(_,i)=>-3+i/10),ps=zs.map(z=>calibrated(CONFIDENCE.maps,z,h,day));
  for(let i=1;i<ps.length;i++)assert.ok(ps[i]>=ps[i-1]-1e-12,`${h} ${day} at z=${zs[i]}`);
  const m=CONFIDENCE.maps[h][phaseOf(day)];
  assert.equal(calibrated(CONFIDENCE.maps,1,h,day),m.knots?interpolate(m.knots,1):normalCdf(m.a+m.b));
 }
 assert.equal(calibrated(null,1,'season','2026-11-01'),normalCdf(1));
 // The step map form: its top step or Φ(z) above the largest z the backtest saw.
 const steps={season:{early:{knots:[{upTo:0,p:.4},{upTo:null,p:.8}],zMax:2}}};
 assert.equal(calibrated(steps,1,'season','2026-11-01'),.8);assert.ok(calibrated(steps,6,'season','2026-11-01')>.99);
 assert.deepEqual([phaseOf('2026-11-30'),phaseOf('2026-12-01'),phaseOf('2027-01-31'),phaseOf('2027-02-01')],['early','mid','mid','late']);
});
