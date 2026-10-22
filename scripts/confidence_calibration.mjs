// Calibration of the transfer confidence on the backtest (scripts/transfer_backtest.mjs): the model's z = expected gain /
// spread of a swap (explainSwap's Φ(z) before this) mapped to the share of such swaps that really gained, for each horizon
// (the FBL week the move counts in, 4 weeks, the rest of the season). Four forms are tried: an isotonic step map or a
// probit Φ(a + b·z), each per phase of the season (before December, December-January, from February) or one for the
// whole season. Each is checked season by season, fitted on the other seasons and tested on the one left out; the form
// with the lowest held-out Brier score is shipped, fitted on every season.
// Usage: node scripts/confidence_calibration.mjs [runs.json] [--out data/confidence-calibration.json] [--method auto|<form>] [--check]
import fs from 'node:fs';
import {reliability,phaseOf} from './backtest-report.mjs';
import {normalCdf,PHASES,HORIZONS,interpolate} from '../src/confidence.js';

const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d;};
const file=args.find(a=>!a.startsWith('--')&&args[args.indexOf(a)-1]!=='--out')||'.cache/transfer-backtest/runs.json';
const OUT=opt('out','data/confidence-calibration.json'),METHOD=opt('method','auto');
const round=(x,d=4)=>Math.round(x*10**d)/10**d;

// Probit regression by Newton's method on (a, b) (with fixA: b alone, a = 0); z is clipped to ±6 so a certain swap does
// not dominate.
export function probit(rows,{fixA=false}={}){
 let a=0,b=1;
 for(let it=0;it<50;it++){
  let ga=0,gb=0,haa=0,hab=0,hbb=0;
  for(const {z,y} of rows){const x=Math.max(-6,Math.min(6,z)),t=a+b*x,p=Math.min(1-1e-9,Math.max(1e-9,normalCdf(t))),d=Math.exp(-t*t/2)/Math.sqrt(2*Math.PI);
   const g=d*(y-p)/(p*(1-p)),w=d*d/(p*(1-p));ga+=g;gb+=g*x;haa+=w;hab+=w*x;hbb+=w*x*x;}
  if(fixA){if(!(hbb>0))break;const db=gb/hbb;b+=db;if(Math.abs(db)<1e-9)break;continue;}
  const det=haa*hbb-hab*hab;if(!(det>0))break;
  const da=(hbb*ga-hab*gb)/det,db=(haa*gb-hab*ga)/det;a+=da;b+=db;if(Math.abs(da)+Math.abs(db)<1e-9)break;
 }
 return {a,b};
}
// Isotonic regression (pool adjacent violators) of the outcome on z, then blocks merged until each holds MIN_BLOCK swaps:
// a monotone step map of z to the share that gained ({upTo, p} knots: z up to upTo gets p).
const MIN_BLOCK=150;
export function isotonic(rows){
 const xs=rows.map(r=>({z:Math.max(-6,Math.min(6,r.z)),y:r.y})).sort((a,b)=>a.z-b.z);
 let blocks=[];
 for(const x of xs){blocks.push({n:1,y:x.y,top:x.z});
  while(blocks.length>1&&blocks.at(-2).y/blocks.at(-2).n>=blocks.at(-1).y/blocks.at(-1).n){const b=blocks.pop(),a=blocks.pop();blocks.push({n:a.n+b.n,y:a.y+b.y,top:b.top});}}
 // Small blocks join their neighbour with the closer rate (the result stays monotone).
 while(blocks.length>1&&blocks.some(b=>b.n<MIN_BLOCK)){
  const i=blocks.findIndex(b=>b.n<MIN_BLOCK),r=b=>b.y/b.n;
  const j=i===0?1:i===blocks.length-1?i-1:Math.abs(r(blocks[i-1])-r(blocks[i]))<=Math.abs(r(blocks[i+1])-r(blocks[i]))?i-1:i+1;
  const [a,b]=[Math.min(i,j),Math.max(i,j)];blocks.splice(a,2,{n:blocks[a].n+blocks[b].n,y:blocks[a].y+blocks[b].y,top:blocks[b].top});
 }
 // A block covers z up to its top (the last one: everything above).
 return blocks.map((b,i)=>({upTo:i===blocks.length-1?null:Math.round(b.top*1e4)/1e4,p:Math.round(b.y/b.n*1e4)/1e4,n:b.n}));
}
const apply=(m,z)=>m.knots?interpolate(m.knots,z):normalCdf(m.a+m.b*Math.max(-6,Math.min(6,z)));

export function samples(runs){
 // Candidate swaps of the 'hold' runs: every team state the advice faces, not only the moves one policy made.
 const out=[];
 for(const r of runs)if(r.policy==='hold')for(const c of r.candidates)for(const h of HORIZONS){
  const e=c.estimate[h];if(!(e.sd>0))continue;
  out.push({season:r.season,h,phase:phaseOf(c.day),z:e.gain/e.sd,y:c.real[h]>0?1:0});
 }
 return out;
}
// The forms: [step map or probit, per phase or one for the season].
// 'scale' is Φ(b·z): the model's z with its spread rescaled; 'raw' is the model's own Φ(z), nothing fitted.
export const FORMS={isotonicByPhase:['isotonic',true],probitByPhase:['probit',true],isotonicSeason:['isotonic',false],probitSeason:['probit',false],
 scale:['scale',false],raw:['raw',false]};
export function fit(rows,form){
 const [kind,byPhase]=FORMS[form],maps={};
 const one=xs=>kind==='isotonic'?{knots:isotonic(xs),zMax:Math.round(Math.max(...xs.map(r=>r.z))*1e4)/1e4,n:xs.length}
  :kind==='raw'?{a:0,b:1,n:xs.length}:{...probit(xs,{fixA:kind==='scale'}),n:xs.length};
 for(const h of HORIZONS){maps[h]={};const all=byPhase?null:one(rows.filter(r=>r.h===h));
  for(const ph of PHASES)maps[h][ph]=all||one(rows.filter(r=>r.h===h&&r.phase===ph));}
 return maps;
}
const prob=maps=>r=>apply(maps[r.h][r.phase],r.z);
function evaluate(rows,maps){
 const out={};
 for(const h of HORIZONS){
  const xs=rows.filter(r=>r.h===h);
  out[h]={before:reliability(xs,r=>normalCdf(r.z)),after:reliability(xs,prob(maps)),
   byPhase:Object.fromEntries(PHASES.map(ph=>[ph,reliability(xs.filter(r=>r.phase===ph),prob(maps))]))};
 }
 return out;
}
// Held out season by season: each form fitted on the other seasons, its Brier score and largest decile gap (deciles of
// 100+ swaps) on the season left out.
function heldOut(rows,seasons,form){
 const out={};
 for(const test of seasons){const train=rows.filter(r=>r.season!==test);if(!train.length)continue;out[test]=evaluate(rows.filter(r=>r.season===test),fit(train,form));}
 return out;
}
const gapOf=rel=>Math.max(0,...rel.deciles.filter(d=>d.n>=100).map(d=>Math.abs(d.gap)));
function score(cross){
 const tests=Object.values(cross),brier=h=>tests.reduce((s,t)=>s+t[h].after.brier,0)/tests.length;
 return {brier:Object.fromEntries(HORIZONS.map(h=>[h,round(brier(h))])),raw:Object.fromEntries(HORIZONS.map(h=>[h,round(tests.reduce((s,t)=>s+t[h].before.brier,0)/tests.length)])),
  maxGap:Object.fromEntries(HORIZONS.map(h=>[h,Math.max(...tests.map(t=>gapOf(t[h].after)))])),total:HORIZONS.reduce((s,h)=>s+brier(h),0)};
}
export function calibrate(runs,method=METHOD){
 const rows=samples(runs),seasons=[...new Set(rows.map(r=>r.season))].sort();
 const forms=Object.fromEntries(Object.keys(FORMS).map(f=>{const cross=heldOut(rows,seasons,f);return [f,{cross,score:score(cross)}];}));
 const chosen=method==='auto'?Object.keys(forms).sort((a,b)=>forms[a].score.total-forms[b].score.total)[0]:method;
 const maps=fit(rows,chosen);
 for(const h of HORIZONS)for(const ph of PHASES){const m=maps[h][ph];if(!m.knots)maps[h][ph]={a:round(m.a),b:round(m.b),n:m.n};}
 const [kind,byPhase]=FORMS[chosen];
 return {version:2,generatedBy:'scripts/confidence_calibration.mjs',source:'scripts/transfer_backtest.mjs candidate swaps (policy hold), seasons '+seasons.join(', '),
  method:`P(real gain > 0) from z = expected gain / spread (explainSwap): ${kind==='isotonic'?`isotonic regression (a step map, blocks of at least ${MIN_BLOCK} swaps)`:kind==='raw'?'Φ(z), the model\'s own spread, nothing fitted':kind==='scale'?'Φ(b·z) by probit maximum likelihood':'Φ(a + b·z) by probit maximum likelihood'}${kind==='raw'?'':' per horizon'+(byPhase?' and phase of the season':'')}; chosen among ${Object.keys(FORMS).join(', ')} by the Brier score on each season held out (fitted on the others)`,
  form:chosen,phases:{early:'October-November',mid:'December-January',late:'February-April'},maps,inSample:evaluate(rows,maps),
  heldOut:Object.fromEntries(Object.entries(forms).map(([f,v])=>[f,v.score])),crossSeason:forms[chosen].cross,samples:rows.length};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=calibrate(JSON.parse(fs.readFileSync(file,'utf8'))),text=JSON.stringify(out,null,1)+'\n';
 if(args.includes('--check')){if(fs.readFileSync(OUT,'utf8')!==text){console.error(OUT+' is stale: rerun scripts/confidence_calibration.mjs');process.exit(1);}}
 else fs.writeFileSync(OUT,text);
 console.log('form',out.form,JSON.stringify(out.heldOut));
 for(const h of HORIZONS)console.log(h,'before',out.inSample[h].before.brier,out.inSample[h].before.maxGap,'after',out.inSample[h].after.brier,out.inSample[h].after.maxGap);
}
