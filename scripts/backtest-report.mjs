// Summary of the transfer backtest runs (scripts/transfer_backtest.mjs): points of the team under test by policy, the
// paired differences between policies with a bootstrap over leagues, the real gains of the moves made, and how the model's
// confidence compares with the share of swaps that really gained.
import fs from 'node:fs';
const HORIZONS=['week','month','season'];
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
const round=(x,d=1)=>x==null||!Number.isFinite(x)?null:Math.round(x*10**d)/10**d;
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
// Percentile bootstrap of the mean over clusters (each a list of values, or one value).
export function bootstrap(clusters,{draws=4000,seed=11,stat=mean}={}){
 const r=rng(seed),n=clusters.length,out=[];if(!n)return null;
 for(let b=0;b<draws;b++){const xs=[];for(let i=0;i<n;i++){const c=clusters[Math.floor(r()*n)];Array.isArray(c)?xs.push(...c):xs.push(c);}out.push(stat(xs));}
 out.sort((a,b)=>a-b);return [out[Math.floor(.025*draws)],out[Math.floor(.975*draws)]];
}
function normalCdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
// Phase of the season of a Moscow date: before December, December-January, from February.
import {phaseOf} from '../src/confidence.js';
export {phaseOf};
export function reliability(rows,prob){
 const xs=rows.map(r=>({p:prob(r),y:r.y})).filter(x=>Number.isFinite(x.p));if(!xs.length)return null;
 const bins=Array.from({length:10},(_,i)=>({lo:i/10,hi:(i+1)/10,n:0,p:0,y:0}));
 for(const x of xs){const b=bins[Math.min(9,Math.floor(x.p*10))];b.n++;b.p+=x.p;b.y+=x.y;}
 const brier=mean(xs.map(x=>(x.p-x.y)**2)),base=mean(xs.map(x=>x.y));
 return {n:xs.length,brier:round(brier,4),baseRateBrier:round(mean(xs.map(x=>(base-x.y)**2)),4),
  deciles:bins.filter(b=>b.n).map(b=>({from:b.lo,to:b.hi,n:b.n,predicted:round(100*b.p/b.n),actual:round(100*b.y/b.n),gap:round(100*(b.y-b.p)/b.n)})),
  maxGap:round(Math.max(...bins.filter(b=>b.n>=30).map(b=>Math.abs(100*(b.y-b.p)/b.n)))),
  at70:(()=>{const s=xs.filter(x=>x.p>=.7&&x.p<.8);return s.length?{n:s.length,predicted:round(100*mean(s.map(x=>x.p))),actual:round(100*mean(s.map(x=>x.y)))}:null;})()};
}
function policySummary(runs){
 const byMonth={};for(const r of runs)for(const [m,v] of Object.entries(r.monthly))(byMonth[m]||=[]).push(v);
 const moves=runs.flatMap(r=>r.moves);
 return {runs:runs.length,points:round(mean(runs.map(r=>r.points))),rank:round(mean(runs.map(r=>r.rank)),2),
  monthly:Object.fromEntries(Object.entries(byMonth).sort().map(([m,v])=>[m,round(mean(v))])),
  movesPerSeason:round(mean(runs.map(r=>r.moves.length)),1),
  moves:moves.length?Object.fromEntries(HORIZONS.map(h=>[h,{meanRealGain:round(mean(moves.map(m=>m.real[h]))),ci95:bootstrap(runs.filter(r=>r.moves.length).map(r=>r.moves.map(m=>m.real[h])))?.map(x=>round(x)),
   positive:round(100*mean(moves.map(m=>m.real[h]>0?1:0))),meanPredicted:round(mean(moves.filter(m=>m.predicted).map(m=>m.predicted[h].gain)))}])):null};
}
export function report(runs,{seeds,policies,files}){
 const seasons=[...new Set(runs.map(r=>r.season))].sort(),out={};
 const cell=r=>`${r.season}|${r.seed}|${r.slot}`;
 const pairsOf=(rs,a,b)=>{const m=new Map();for(const r of rs)(m.get(cell(r))||m.set(cell(r),{}).get(cell(r)))[r.policy]=r.points;return [...m.values()].filter(x=>a in x&&b in x).map(x=>x[b]-x[a]);};
 // Every later policy against every earlier one (hold, current, new): the paired difference of the same league.
 const compare=rs=>{const o={};policies.forEach((a,i)=>policies.slice(i+1).forEach(b=>{const d=pairsOf(rs,a,b);if(d.length)o[`${b}-${a}`]={mean:round(mean(d)),ci95:bootstrap(d).map(x=>round(x)),leagues:d.length,better:d.filter(x=>x>0).length};}));return o;};
 for(const s of [...seasons,'both']){
  const rs=s==='both'?runs:runs.filter(r=>r.season===s);
  out[s]={policies:Object.fromEntries(policies.map(p=>[p,policySummary(rs.filter(r=>r.policy===p))])),differences:compare(rs)};
 }
 // The shipped confidence (Φ(gain/sd), explainSwap) against the share of candidate swaps that really gained, by horizon
 // and phase of the season.
 const cands=runs.filter(r=>r.policy===policies[0]).flatMap(r=>r.candidates);
 const confidence={};
 for(const h of HORIZONS){
  const rows=cands.map(c=>({z:c.estimate[h].sd>0?c.estimate[h].gain/c.estimate[h].sd:null,y:c.real[h]>0?1:0,phase:phaseOf(c.day)})).filter(r=>r.z!==null);
  confidence[h]={all:reliability(rows,r=>normalCdf(r.z)),...Object.fromEntries(['early','mid','late'].map(ph=>[ph,reliability(rows.filter(r=>r.phase===ph),r=>normalCdf(r.z))]))};
 }
 return {version:1,generatedBy:'scripts/transfer_backtest.mjs',inputs:files,design:{leaguesPerSeason:seeds*8,seeds,slots:8,policies,
   decisions:'Moscow Monday 12:00 (after the week\'s last games; moves count for the next week) and Moscow Thursday 12:00',
   rivals:'seven teams drafted with noisy valuations (sd 15%); once a week each makes the best one-for-one swap over the season when it gains 40+ and does not lose the next 4 weeks',
   realGain:'points the newcomer really scored minus the points the player sold really scored, over the window the move was judged on (Moscow dates after the decision)'},
  seasons:out,confidence,candidates:cands.length,
  limitations:['No historical ESPN injury report: absences are seen only through missed games (the live app also reads the report).',
   'Sports.ru prices are modelled (the 2026/27 prices regressed on the previous season\'s FBL points per game, rookies on the pick) and fixed through the season.',
   'Positions: Sports.ru 2026/27 where the player is on the market, otherwise the nearest stat profile; the white rule: the league\'s 2026/27 list.',
   'Rivals follow one simple rule; real managers differ.',
   'Each league is one draft; leagues of one season share the games, so seasons, not leagues, are the independent samples.']};
}
if(process.argv[2]==='--from'){const runs=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));console.log(JSON.stringify(report(runs,JSON.parse(process.argv[4])),null,1));}
