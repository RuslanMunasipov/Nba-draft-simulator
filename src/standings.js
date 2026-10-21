// The league race in numbers: shared places for equal totals, the chances of each final place, and the period windows
// of the Teams tab. Shared by the Overview table and the Teams tab, so both screens always agree.
import {teamPoints,playerOutlook,pointsSpread,gameWeeks,horizons} from './season.js';

// Competition ranking: equal totals share a place ("1, 2, 2, 4"), so a tie is never broken by team order or forecast.
export function leagueRanks(totals){return totals.map(x=>1+totals.filter(y=>y>x).length);}
// How many teams share a team's place (1 when it is alone there).
export const tiedWith=(totals,i)=>totals.filter(y=>y===totals[i]).length;
export const placeLabel=r=>r.tied>1?`${r.rank}–${r.rank+r.tied-1}`:String(r.rank);

// Seeded uniform numbers (mulberry32): the same standings give the same chances on every device and every render.
function uniform(seed){let a=seed>>>0||1;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normal(next){let u=0;while(!u)u=next();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*next());}

// Monte Carlo chances of the final place. Each team's final total is normal around `points` (its fact plus the expected
// rest of the season) with its own `sd` (the rest-of-season spread). Teams that draw the same total share the places
// they cover equally, so over the league the chances of 1st sum to 1 and those of the top 3 to 3. Returns, per team in
// the given order: first, top3 and place (the expected final place).
export function placeProbabilities(teams,sims=20000,seed=1){
 const n=teams.length,next=uniform(seed),top=Math.min(3,n),first=new Float64Array(n),top3=new Float64Array(n),place=new Float64Array(n),draw=new Float64Array(n);
 for(let s=0;s<sims;s++){
  for(let i=0;i<n;i++){const t=teams[i],sd=Number.isFinite(t.sd)&&t.sd>0?t.sd:0;draw[i]=(Number(t.points)||0)+(sd?sd*normal(next):0);}
  for(let i=0;i<n;i++){let above=0,tied=0;for(let j=0;j<n;j++)if(draw[j]>draw[i])above++;else if(j!==i&&draw[j]===draw[i])tied++;
   const from=above+1,to=from+tied,w=1/(tied+1);
   if(from===1)first[i]+=w;
   top3[i]+=Math.max(0,Math.min(to,top)-from+1)*w;place[i]+=(from+to)/2;}
 }
 return teams.map((_,i)=>({first:first[i]/sims,top3:top3[i]/sims,place:place[i]/sims}));
}
// A chance in whole percent that never reads as certain when it is not: "<1 %" and ">99 %" at the edges.
const NBSP=' ';
export function chanceText(x){
 if(!Number.isFinite(x))return '—';
 if(x>0&&x<.005)return '<1'+NBSP+'%';if(x<1&&x>.995)return '>99'+NBSP+'%';
 return Math.round(x*100)+NBSP+'%';
}

// The whole league race, once per screen: points so far (official plus `running`, the games Sports.ru has not counted
// yet), the expected rest of the season with its spread (pointsSpread of each player over the rest of the season,
// players independent: the model's measured teammate correlation is about 0), shared places, and the chances of the
// final place. Owner's decision 21.10.2026: advice keeps maximising expected points; the standings add these chances.
// Rosters are today's: future transfers are not modelled. Before any points the place follows the forecast.
export const CHANCE_RUNS=20000;
export function leagueRace(ctx,running=new Map(),{sims=CHANCE_RUNS,seed=1}={}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),official=teamPoints(ctx,ctx.transfers,ctx.picks),rc={...ctx,running};
 const rows=ctx.rosters.map((ids,t)=>{
  const now=ids.reduce((s,id)=>s+(running.get(id)?.points||0),0);
  let rest=0,week=0,variance=0;
  for(const id of ids){const p=byId.get(id);if(!p)continue;const o=playerOutlook(p,rc);rest+=o.season.points;week+=o.week.games;variance+=pointsSpread(p,rc,o.season)**2;}
  return {t,official:official[t],now,rest,week,total:official[t]+now+rest,sd:Math.sqrt(variance)};
 });
 const started=rows.some(r=>r.official||r.now),points=rows.map(r=>started?r.official+r.now:r.total),ranks=leagueRanks(points);
 const chances=placeProbabilities(rows.map(r=>({points:r.total,sd:r.sd})),sims,seed);
 return {started,rows:rows.map((r,i)=>({...r,points:points[i],rank:ranks[i],tied:tiedWith(points,i),...chances[i]}))};
}
// One team's line of the race: its shared place, the leader's and the runner-up's points for the gap, its chances.
export function teamPlace(race,t){
 const me=race.rows[t],sorted=race.rows.map(r=>r.points).sort((a,b)=>b-a);
 return {...me,total:me.points,leader:sorted[0],second:sorted[1],started:race.started};
}

// Fact and forecast windows of the Teams tab: the current Sports.ru tour, the 4-week span and the whole season.
// "4 недели" looks exactly as far ahead as the transfer gains next to it (horizons: 28 days from today); its fact starts
// with the current tour.
export function periodWindows(ctx){
 const list=Object.entries(gameWeeks(ctx.live)).map(([n,w])=>({n:Number(n),...w})).sort((a,b)=>a.start.localeCompare(b.start)),h=horizons(ctx);
 const i=list.findIndex(w=>ctx.today>=w.start&&ctx.today<=w.end),at=i>=0?i:list.findIndex(w=>w.start>ctx.today),cur=list[at]||null,start=cur?.start||ctx.today;
 return {week:{from:start,to:cur?.end||h.week.to},month:{from:start<ctx.today?start:ctx.today,to:h.month.to},season:{from:list[0]?.start||start,to:h.season.to}};
}
// FBL points of a team in a window by the league table's own rule (teamPoints decides which games count for whom), only
// cut to the window's dates, so a period's fact never disagrees with the league place. With `sportsId`, one player's
// part of it: what he brought this team in the window, over all his stints with it.
export function windowFact(ctx,t,w,sportsId=null){
 const players=Object.fromEntries(Object.entries(ctx.live?.players||{}).filter(([sid])=>sportsId==null||sid===String(sportsId))
  .map(([sid,x])=>[sid,{...x,games:(x.games||[]).filter(g=>g.date>=w.from&&g.date<=w.to)}]));
 return teamPoints({...ctx,live:{...ctx.live,players}},ctx.transfers,ctx.picks)[t];
}
