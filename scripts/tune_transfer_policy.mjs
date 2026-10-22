// The decision policy's parameters (src/transfer-plan.js, data/transfer-policy.json) chosen on the transfer backtest: a
// grid of horizon weights, transfer prices, the week's decay of the price (a transfer not used by Sunday is lost) and a
// confidence floor, played in the same leagues of every backtest season, leagues the backtest's report does not score
// (seed 5 on). Out of sample, season by season: the variant with the most points on the other seasons, played on the
// season left out (the backtest's policy planHeldOut). The shipped parameters are the best over every season.
// Usage: node scripts/tune_transfer_policy.mjs [--inputs .cache/transfer-backtest3] [--seeds 1] [--from-seed 5]
//        [--runs <inputs>/tune-runs.json] [--reuse | --only-new]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d;};
const seeds=Number(opt('seeds',1)),from=Number(opt('from-seed',5)),inputs=opt('inputs','.cache/transfer-backtest3'),RUNS=opt('runs',path.join(inputs,'tune-runs.json')),OUT='data/transfer-policy.json';
export const WEIGHTS={season:{season:1},monthSeason:{month:.5,season:.5},weekMonthSeason:{week:.25,month:.25,season:.5}};
export const PRICES=[10,25,50,100];
// Each weighting at each price, with and without the week's decay; the season weighting at no price; and the season
// weighting at 25 and 50 holding packages under 60% sure over the season (src/transfer-plan.js minConfidence).
// (weekMonthSeason, added after the first round chose monthSeason at the lowest price, at 10 and 25 only; price 10 too.)
export const GRID=[...Object.entries(WEIGHTS).flatMap(([w,weights])=>PRICES.filter(p=>w!=='weekMonthSeason'||p<=25).flatMap(movePrice=>[false,true].map(weekDecay=>({key:`${w}/${movePrice}${weekDecay?'/decay':''}`,params:{weights,movePrice,...(weekDecay?{weekDecay}:{})}})))),
 ...['season','monthSeason'].map(w=>({key:`${w}/0`,params:{weights:WEIGHTS[w],movePrice:0}})),
 ...[25,50].map(movePrice=>({key:`season/${movePrice}/sure60`,params:{weights:WEIGHTS.season,movePrice,minConfidence:.6}}))];
const name=g=>'plan:'+JSON.stringify(g.params);
// --only-new plays only the variants missing from the runs file and adds them to it.
const have=fs.existsSync(RUNS)&&args.includes('--only-new')?JSON.parse(fs.readFileSync(RUNS,'utf8')):null;
if(have){const done=new Set(have.map(r=>r.policy)),todo=GRID.filter(g=>!done.has(name(g)));
 if(todo.length){const tmp=RUNS+'.new';execFileSync(process.execPath,['scripts/transfer_backtest.mjs','--inputs',inputs,'--seeds',String(seeds),'--from-seed',String(from),'--no-record','--runs',tmp,'--out','/dev/null','--policies',todo.map(name).join('|')],{stdio:'inherit'});
  fs.writeFileSync(RUNS,JSON.stringify([...have,...JSON.parse(fs.readFileSync(tmp,'utf8'))]));fs.unlinkSync(tmp);}}
else if(!args.includes('--reuse'))execFileSync(process.execPath,['scripts/transfer_backtest.mjs','--inputs',inputs,'--seeds',String(seeds),'--from-seed',String(from),'--no-record','--runs',RUNS,'--out','/dev/null',
 '--policies',GRID.map(name).join('|')],{stdio:'inherit'});
const runs=JSON.parse(fs.readFileSync(RUNS,'utf8')),keyOf=p=>GRID.find(g=>name(g)===p)?.key;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const seasons=[...new Set(runs.map(r=>r.season))].sort(),score={};
for(const r of runs){const k=keyOf(r.policy);if(!k)continue;((score[k]||={})[r.season]||=[]).push(r.points);}
const table=Object.fromEntries(Object.entries(score).map(([k,v])=>[k,Object.fromEntries(seasons.map(s=>[s,Math.round(mean(v[s]))]))]));
const best=on=>Object.keys(table).sort((a,b)=>on.reduce((s,x)=>s+table[b][x],0)-on.reduce((s,x)=>s+table[a][x],0))[0];
const cross=Object.fromEntries(seasons.map(s=>{const other=seasons.filter(x=>x!==s),k=best(other);return [s,{chosenOn:other,variant:k,params:GRID.find(g=>g.key===k).params,points:table[k][s],bestHere:best([s]),bestHerePoints:table[best([s])][s]}];}));
const chosen=best(seasons),params=GRID.find(g=>g.key===chosen).params;
const out={version:2,generatedBy:'scripts/tune_transfer_policy.mjs',params,chosen,
 method:`Grid of horizon weights (${Object.keys(WEIGHTS).join(', ')}) × transfer prices (${PRICES.join(', ')} points of the weighted value per sale), each with and without the week's decay of the price (in full on Monday, 4/7 on Thursday), the season weighting at no price, and at 25 and 50 holding packages under 60% sure over the season; each played in ${seeds*8} leagues of every backtest season (seeds ${from}-${from+seeds-1}, which the backtest's report does not score). Shipped: the most season points over every season. Out of sample: each season gets the variant chosen on the others.`,
 crossSeason:cross,table};
fs.writeFileSync(OUT,JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify({chosen,cross},null,1));
