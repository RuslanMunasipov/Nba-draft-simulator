// The transfer backtest's league machinery (scripts/transfer_backtest.mjs) on a small synthetic season: the draft and every
// policy keep the FBL rules, the points are the games really played while the player was held, and the run is repeatable.
import test from 'node:test';import assert from 'node:assert/strict';
import CAL from '../data/inseason-calibration.json' with {type:'json'};
import LENGTHS from '../data/availability-lengths.json' with {type:'json'};
import {loadSeason,playSeason,draft,realPoints} from '../scripts/transfer_backtest.mjs';
import {rosterFits} from '../src/engine.js';

const POS=['PG','SG','SF','PF','C'],addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
function synthetic(){
 let s=7;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};
 const clubs=Array.from({length:20},(_,i)=>'C'+i),days=Array.from({length:30},(_,i)=>addDays('2024-10-22',i));
 const calendar=Object.fromEntries(clubs.map((c,i)=>[c,days.filter((_,d)=>(d+i)%2===0)]));
 const players=[],games={};
 clubs.forEach((club,ci)=>{for(let j=0;j<7;j++){
  const id=String(1000+ci*10+j),mean=4+r()*26,rookie=j===6,pos=POS[(ci+j)%5];
  players.push({id,name:'P'+id,positions:[pos],positionSource:'TEST',isRookie:rookie,price:1000+Math.round(mean*40/100)*100,team:club,white:j===0,whiteKnown:true,
   forecast:{origin:'CAREER_MODEL',meanPerGame:mean,games:70,minutes:12+mean,meanSeason:mean*70,gameFloor:mean*.5,gameCeiling:mean*1.5,seasonFloor:mean*40,seasonCeiling:mean*85,
    availability:null,components:{participation:1}}});
  games[id]=calendar[club].filter(()=>r()<.85).map(d=>[d,club,20+r()*15,Math.round(mean+8*(r()-.5))]);
 }});
 return {season:'2099-00',target:2100,players,games,clubs:calendar,lengths:{shortLengths:LENGTHS.shortLengths,longLengths:LENGTHS.longLengths},
  calibration:{points:structuredClone(CAL.points),availability:structuredClone(CAL.availability)}};
}
const season=loadSeason(synthetic()),byId=new Map(season.players.map(p=>[p.id,p]));
function legal(ids,bank){
 const ps=ids.map(id=>byId.get(id)),clubs=new Map();for(const p of ps)clubs.set(p.sportsClub,(clubs.get(p.sportsClub)||0)+1);
 return ps.length===10&&new Set(ids).size===10&&rosterFits(ps)&&ps.some(p=>p.isRookie)&&ps.some(p=>season.white.has(p.id))&&bank>=0&&[...clubs.values()].every(n=>n<=2);
}

test('the draft gives every team a legal roster within the cap, and the same seed the same draft',()=>{
 const a=draft(season,3)(2),b=draft(season,3)(2);
 assert.deepEqual(a,b);
 assert.equal(new Set(a.rosters.flat()).size,80,'a player is drafted once');
 a.rosters.forEach((r,t)=>assert.ok(legal(r,a.bank[t]),`team ${t}`));
});

test('a policy that never moves scores exactly the games its drafted players played',()=>{
 const run=playSeason(season,{seed:1,slot:0,policy:'hold'}),{rosters}=draft(season,1)(0);
 const real=rosters[0].reduce((s,id)=>s+realPoints(season,id,'0000-00-00',season.end),0);
 assert.equal(run.points,real);assert.equal(run.moves.length,0);
 assert.ok(run.candidates.length>0,'candidate swaps are recorded for the calibration');
 for(const c of run.candidates)for(const h of ['week','month','season'])assert.ok(Number.isFinite(c.real[h])&&Number.isFinite(c.estimate[h].gain));
});

test('the shipped advice keeps 3 transfers a week and a legal roster, and its moves are scored on what happened',()=>{
 const run=playSeason(season,{seed:2,slot:5,policy:'current'});
 for(const n of Object.values(run.transfersByWeek))assert.ok(n<=3);
 run.final.rosters.forEach((r,t)=>assert.ok(legal(r,run.final.bank[t]),`team ${t}`));
 for(const m of run.moves){
  const to=addDays(m.day,27);
  assert.equal(m.real.month,realPoints(season,m.inId,m.day,to)-realPoints(season,m.outId,m.day,to));
 }
 assert.deepEqual(playSeason(season,{seed:2,slot:5,policy:'current'}).points,run.points,'repeatable');
});
