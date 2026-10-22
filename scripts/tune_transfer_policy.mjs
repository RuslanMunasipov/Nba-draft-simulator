// The decision policy's parameters (src/transfer-plan.js, data/transfer-policy.json) chosen on the transfer backtest: a
// grid of horizon weights and transfer prices played in the same leagues of 2024/25 and 2025/26. Each season's figure
// for the variant chosen on the other season is the out-of-sample check; the shipped parameters are the best over both.
// Usage: node scripts/tune_transfer_policy.mjs [--seeds 2] [--runs .cache/transfer-backtest/tune-runs.json] [--reuse]
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d;};
const seeds=Number(opt('seeds',1)),RUNS=opt('runs','.cache/transfer-backtest/tune-runs.json'),OUT='data/transfer-policy.json';
export const WEIGHTS={season:{season:1},monthSeason:{month:.5,season:.5},weekMonthSeason:{week:.25,month:.25,season:.5},month:{month:1}};
export const PRICES=[0,25,50];
// The four weightings at three prices, and the season weighting at a high price too: on the first 2024/25 leagues prices
// of 100 and 150 lost to every lower one under every weighting.
export const GRID=[...Object.entries(WEIGHTS).flatMap(([w,weights])=>PRICES.map(movePrice=>({key:`${w}/${movePrice}`,params:{weights,movePrice}}))),
 {key:'season/100',params:{weights:WEIGHTS.season,movePrice:100}}];
if(!args.includes('--reuse'))execFileSync(process.execPath,['scripts/transfer_backtest.mjs','--seeds',String(seeds),'--no-record','--runs',RUNS,'--out','/dev/null',
 '--policies',GRID.map(g=>'plan:'+JSON.stringify(g.params)).join('|')],{stdio:'inherit'});
const runs=JSON.parse(fs.readFileSync(RUNS,'utf8')),keyOf=p=>GRID.find(g=>'plan:'+JSON.stringify(g.params)===p)?.key;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const seasons=[...new Set(runs.map(r=>r.season))].sort(),score={};
for(const r of runs){const k=keyOf(r.policy);if(!k)continue;((score[k]||={})[r.season]||=[]).push(r.points);}
const table=Object.fromEntries(Object.entries(score).map(([k,v])=>[k,Object.fromEntries(seasons.map(s=>[s,Math.round(mean(v[s]))]))]));
const best=(on)=>Object.keys(table).sort((a,b)=>on.reduce((s,x)=>s+table[b][x],0)-on.reduce((s,x)=>s+table[a][x],0))[0];
const cross=Object.fromEntries(seasons.map(s=>{const other=seasons.filter(x=>x!==s),k=best(other);return [s,{chosenOn:other,variant:k,points:table[k][s],bestHere:best([s]),bestHerePoints:table[best([s])][s]}];}));
const chosen=best(seasons),params=GRID.find(g=>g.key===chosen).params;
const out={version:1,generatedBy:'scripts/tune_transfer_policy.mjs',params,chosen,
 method:`Grid of horizon weights (${Object.keys(WEIGHTS).join(', ')}) × transfer prices (${PRICES.join(', ')} points of the weighted value per sale; the season weighting at 100 too), each played in ${seeds*8} leagues a season on the transfer backtest (seeds 1-${seeds}); the variant with the most season points over both seasons is shipped.`,
 crossSeason:cross,table};
fs.writeFileSync(OUT,JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify({chosen,cross},null,1));
