// Transfer-advice backtest: FBL leagues replayed week by week on the 2024/25 and 2025/26 NBA regular seasons with what
// the season assistant would have known at each moment (scripts/transfer_backtest_inputs.py builds the inputs: forecasts
// fitted before each season, the games as they were played). The advice is src/season.js's own code.
// A league: 8 teams drafted in a straight order by the model's season points (the other teams' valuations with noise),
// every FBL rule (2 per Sports.ru position, a rookie, the white rule, at most 2 players of one NBA club, the cap, 3
// transfers a FBL week, transfers between the night's games). Decisions are taken twice a week, on the Moscow Monday
// (after the week's last games, before the next week's first; the moves count for the next week) and on the Moscow
// Thursday. The other seven teams play a simple rival policy (bestTransfers over the season). The team under test plays
// one policy at a time on the same draft and the same rivals, so the policies are compared pairwise.
// Usage: node scripts/transfer_backtest.mjs [--inputs .cache/transfer-backtest] [--out data/transfer-backtest.json]
//        [--seeds 2] [--jobs N] [--policies hold,current]
// Worker: node scripts/transfer_backtest.mjs --worker <inputs/season.json> <seed> <slot> <policy>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import CAL from '../data/inseason-calibration.json' with {type:'json'};
import LENGTHS from '../data/availability-lengths.json' with {type:'json'};
import * as S from '../src/season.js';
import {rosterFits} from '../src/engine.js';
import {POLICIES,windows} from './backtest-policies.mjs';

const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d;};
const SELF=fileURLToPath(import.meta.url);
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const TEAMS=8,CAP=20000,WEEKLY=3,CLUB=2,SIZE=10;

// ---------- deterministic randomness ----------
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function normal(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

// ---------- a season: players, calendar, games ----------
export function loadSeason(file){
 const data=typeof file==='string'?JSON.parse(fs.readFileSync(file,'utf8')):file;
 // The in-season update and the chain's spell lengths fitted without this season (season.js reads them at call time).
 Object.assign(CAL.points,data.calibration.points);Object.assign(CAL.availability,data.calibration.availability);
 delete CAL.availability.spellMissesAfterReturn;
 LENGTHS.shortLengths=data.lengths.shortLengths;LENGTHS.longLengths=data.lengths.longLengths;
 // Sports.ru files a US evening game under the next Moscow date.
 const msk=d=>addDays(d,1);
 const players=data.players.map(p=>({id:p.id,name:p.name,positions:p.positions,isRookie:p.isRookie,price:p.price,priceStatus:'VERIFIED',
  sportsId:p.id,espnId:null,sportsClub:p.team,forecast:p.forecast,white:p.white}));
 const games=new Map(Object.entries(data.games).map(([id,rows])=>[id,rows.map(([d,team,minutes,points])=>({date:msk(d),team,minutes,points}))]));
 const allDates=[...new Set(Object.values(data.clubs).flat())].sort(),opener=allDates[0],last=allDates.at(-1);
 // Sports.ru weeks: Monday to Sunday in US game days (Tuesday to Monday in Moscow dates).
 const monday=addDays(opener,-((new Date(opener+'T00:00:00Z').getUTCDay()+6)%7)),weekOfUs=d=>Math.floor((Date.parse(d)-Date.parse(monday))/(7*864e5))+1;
 const clubs=Object.fromEntries(Object.entries(data.clubs).map(([c,ds])=>[c,ds.map(d=>({date:msk(d),week:weekOfUs(d)}))]));
 const weeks=Math.max(...Object.values(clubs).flat().map(g=>g.week));
 return {data,players,games,clubs,opener:msk(opener),end:msk(last),monday,weeks,white:new Set(players.filter(p=>p.white).map(p=>p.id))};
}
// The Moscow dates of the decisions: before each week (its Monday, Moscow date = the US Monday) and its Thursday.
function decisions(season){
 const out=[];
 for(let w=1;w<=season.weeks;w++){const mon=addDays(season.monday,7*(w-1));out.push({day:mon,week:w,kind:'start'},{day:addDays(mon,3),week:w,kind:'mid'});}
 return out.filter(x=>x.day<season.end);
}
// The league as the assistant sees it at 12:00 Moscow time of `day`: every game filed under an earlier or the same date
// is over (US evening games end before 08:00 MSK).
function liveAt(season,day){
 const clubs={};
 for(const [c,rows] of Object.entries(season.clubs))clubs[c]=rows.map(g=>({...g,score:g.date<=day?'1:0':null}));
 const players={};
 for(const p of season.players){
  const rows=(season.games.get(p.id)||[]).filter(g=>g.date<=day);
  players[p.id]={club:rows.length?rows.at(-1).team:p.sportsClub,position:p.positions[0],price:p.price,initialPrice:p.price,
   games:rows.map(g=>({date:g.date,played:true,points:g.points,minutes:g.minutes,source:'ESPN'}))};
 }
 return {clubs,players};
}
export function contextAt(season,league,day){
 return {players:season.players,live:liveAt(season,day),injuries:new Map(),today:day,now:Date.parse(day+'T12:00:00+03:00'),
  rosters:league.rosters.map(r=>[...r]),transfers:[],white:season.white,outlooks:new Map()};
}
// Real FBL points of a player in Moscow dates (from, to].
export function realPoints(season,id,from,to){let s=0;for(const g of season.games.get(id)||[])if(g.date>from&&g.date<=to)s+=g.points;return s;}

// ---------- the draft ----------
// Straight order (team 0 picks 1, 9, 17, ...). Each team takes the player with the highest value it sees that keeps its
// roster completable within the cap (positions, a rookie, the white rule, the club limit). The team under test values by
// the model's season points; a rival by the same times its own noise (sd 15%), fixed for the season.
function completable(season,roster,money,free){
 const need={PG:2,SG:2,SF:2,PF:2,C:2};for(const p of roster)need[p.positions[0]]--;
 if(Object.values(need).some(v=>v<0))return false;
 const clubs=new Map();for(const p of roster)clubs.set(p.sportsClub,(clubs.get(p.sportsClub)||0)+1);
 if([...clubs.values()].some(n=>n>CLUB))return false;
 const k=SIZE-roster.length;if(!k)return money>=0&&roster.some(p=>p.isRookie)&&roster.some(p=>season.white.has(p.id));
 // The cheapest completion, the rookie and white players first when still missing.
 const cand=free.filter(p=>need[p.positions[0]]>0&&(clubs.get(p.sportsClub)||0)<CLUB).sort((a,b)=>a.price-b.price);
 let cost=0;const left={...need},used=new Set(),take=p=>{left[p.positions[0]]--;used.add(p.id);cost+=p.price;};
 if(!roster.some(p=>p.isRookie)){const r=cand.find(p=>p.isRookie);if(!r)return false;take(r);}
 if(!roster.some(p=>season.white.has(p.id))&&![...used].some(id=>season.white.has(id))){const w=cand.find(p=>season.white.has(p.id)&&!used.has(p.id)&&left[p.positions[0]]>0);if(!w)return false;take(w);}
 for(const p of cand){if(used.size>=k)break;if(!used.has(p.id)&&left[p.positions[0]]>0)take(p);}
 return used.size===k&&cost<=money;
}
export function draft(season,seed){
 const r=rng(seed*7919+17),noise=Array.from({length:TEAMS},()=>new Map());
 for(let t=0;t<TEAMS;t++)for(const p of season.players)noise[t].set(p.id,Math.max(.3,1+.15*normal(r)));
 const value=p=>(p.forecast?.meanPerGame||0)*(p.forecast?.games||0);
 const pool=season.players.filter(p=>p.forecast&&Number.isFinite(p.price));
 return slot=>{
  // The team in `slot` is the one under test: no noise.
  const rs=Array.from({length:TEAMS},()=>[]),mon=Array(TEAMS).fill(CAP),tk=new Set();
  for(let round=0;round<SIZE;round++)for(let t=0;t<TEAMS;t++){
   const free=pool.filter(p=>!tk.has(p.id)),v=p=>value(p)*(t===slot?1:noise[t].get(p.id));
   const order=[...free].sort((a,b)=>v(b)-v(a));
   const pick=order.find(p=>p.price<=mon[t]&&completable(season,[...rs[t],p],mon[t]-p.price,free.filter(q=>q.id!==p.id)));
   if(!pick)throw Error(`draft: team ${t} cannot complete its roster`);
   rs[t].push(pick);mon[t]-=pick.price;tk.add(pick.id);
  }
  return {rosters:rs.map(x=>x.map(p=>p.id)),bank:mon};
 };
}

// ---------- one season of one league ----------
function legal(season,ctx,team,next,bank){
 const byId=new Map(season.players.map(p=>[p.id,p])),ps=next.map(id=>byId.get(id));
 if(bank<0||ps.length!==SIZE||!rosterFits(ps)||!ps.some(p=>p.isRookie)||(season.white.size&&!ps.some(p=>season.white.has(p.id))))return false;
 const live=ctx.live.players,clubs=new Map();for(const id of next){const c=live[id]?.club;clubs.set(c,(clubs.get(c)||0)+1);}
 const before=new Map();for(const id of ctx.rosters[team]){const c=live[id]?.club;before.set(c,(before.get(c)||0)+1);}
 return [...clubs].every(([c,n])=>n<=Math.max(CLUB,before.get(c)||0));
}
export function playSeason(season,{seed,slot,policy,rivals='rivals',record=true}){
 const {rosters,bank}=draft(season,seed)(slot),league={rosters,bank:[...bank]},byId=new Map(season.players.map(p=>[p.id,p]));
 const holding=rosters.map(r=>new Map(r.map(id=>[id,'0000-00-00'])));  // player -> Moscow date he joined (scores after it)
 const points=Array(TEAMS).fill(0),monthly=Array.from({length:TEAMS},()=>({})),moves=[],candidates=[],state={};
 const used=new Map(),key=(t,w)=>t+':'+w;
 const credit=(t,id,from,to)=>{for(const g of season.games.get(id)||[])if(g.date>from&&g.date<=to){points[t]+=g.points;const m=g.date.slice(0,7);monthly[t][m]=(monthly[t][m]||0)+g.points;}};
 let last='0000-00-00';
 const close=day=>{for(let t=0;t<TEAMS;t++)for(const id of league.rosters[t])credit(t,id,last,day);last=day;};
 for(const d of decisions(season)){
  close(d.day);
  const ctx=contextAt(season,league,d.day);
  for(let t=0;t<TEAMS;t++){
   const left=WEEKLY-(used.get(key(t,d.week))||0);if(left<=0)continue;
   const play=t===slot?POLICIES[policy]:POLICIES[rivals];
   const out=play({S,season,ctx,team:t,bankMoney:league.bank[t],left,decision:d,state:t===slot?state:null,record:t===slot&&record?candidates:null});
   const pairs=(out?.pairs||[]).slice(0,left);if(!pairs.length)continue;
   const next=ctx.rosters[t].map(id=>{const x=pairs.find(q=>q.outId===id);return x?x.inId:id;});
   const taken=new Set(league.rosters.flat());
   if(pairs.some(x=>taken.has(x.inId))||new Set(next).size!==SIZE)continue;
   const money=league.bank[t]+pairs.reduce((s,x)=>s+byId.get(x.outId).price-byId.get(x.inId).price,0);
   if(!legal(season,ctx,t,next,money))continue;
   league.rosters[t]=next;league.bank[t]=money;used.set(key(t,d.week),(used.get(key(t,d.week))||0)+pairs.length);
   // Later teams in this moment see the change (taken players; their own outlooks are unchanged).
   ctx.rosters[t]=[...next];
   if(t===slot)for(const x of pairs){
    moves.push({day:d.day,week:d.week,kind:d.kind,outId:x.outId,inId:x.inId,predicted:x.predicted||out.predicted||null,confidence:x.confidence||out.confidence||null,label:x.label||out.label||null,package:pairs.length});
   }
  }
 }
 close(season.end);
 // Real gains of every recorded swap over the windows it was judged on: the newcomer's points minus the seller's.
 const real=(c,pairs)=>Object.fromEntries(Object.entries(windows(season,c)).map(([h,to])=>[h,pairs.reduce((s,[o,i])=>s+realPoints(season,i,c.day,to)-realPoints(season,o,c.day,to),0)]));
 for(const m of moves)m.real=real(m,[[m.outId,m.inId]]);
 for(const c of candidates)c.real=real(c,[[c.outId,c.inId]]);
 const weekly={};for(const [k,n] of used)if(k.startsWith(slot+':'))weekly[k.split(':')[1]]=n;
 return {season:season.data.season,seed,slot,policy,points:points[slot],monthly:monthly[slot],league:points,rank:1+points.filter(v=>v>points[slot]).length,moves,candidates,
  transfersByWeek:weekly,final:{rosters:league.rosters,bank:league.bank}};
}

// ---------- driver ----------
function runWorker(file,seed,slot,policy){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--max-old-space-size=2048',SELF,'--worker',file,String(seed),String(slot),policy],{stdio:['ignore','pipe','inherit']});
  let out='';p.stdout.on('data',d=>out+=d);p.on('close',code=>code===0?resolve(JSON.parse(out)):reject(Error(`worker ${file} ${seed} ${slot} ${policy}: ${code}`)));
 });
}
async function pool(tasks,jobs){const out=[];let i=0;await Promise.all(Array.from({length:jobs},async()=>{while(i<tasks.length){const k=i++;out[k]=await tasks[k]();}}));return out;}

if(args[0]==='--worker'){
 const [,file,seed,slot,policy]=args,season=loadSeason(file);
 process.stdout.write(JSON.stringify(playSeason(season,{seed:Number(seed),slot:Number(slot),policy})));
}else if(import.meta.url===`file://${process.argv[1]}`){
 const inputs=opt('inputs','.cache/transfer-backtest'),out=opt('out','data/transfer-backtest.json'),seeds=Number(opt('seeds',2));
 const policies=opt('policies','hold,current').split(','),jobs=Number(opt('jobs',os.availableParallelism?.()||os.cpus().length));
 const files=fs.readdirSync(inputs).filter(f=>/^\d{4}-\d{2}\.json$/.test(f)).sort().map(f=>path.join(inputs,f));
 const tasks=[];
 for(const file of files)for(let seed=1;seed<=seeds;seed++)for(let slot=0;slot<TEAMS;slot++)for(const policy of policies)tasks.push(()=>runWorker(file,seed,slot,policy).then(r=>{process.stderr.write(`${r.season} seed ${seed} slot ${slot} ${policy}: ${Math.round(r.points)}\n`);return r;}));
 const runs=await pool(tasks,jobs);
 fs.writeFileSync(path.join(inputs,'runs.json'),JSON.stringify(runs));
 const {report}=await import('./backtest-report.mjs');
 fs.writeFileSync(out,JSON.stringify(report(runs,{seeds,policies,files:files.map(f=>path.basename(f))}),null,1)+'\n');
 console.log('wrote',out);
}
