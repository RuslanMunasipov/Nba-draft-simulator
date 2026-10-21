// The league race in numbers: shared places for equal totals, the chances of each final place, and the period windows
// of the Teams tab. Shared by the Overview table and the Teams tab, so both screens always agree.
import {teamPoints,playerOutlook,pointsSpread,expectedPoints,gameWeeks,horizons,periodList,stints,shadowed,inStint,tourDate} from './season.js';

// A played row's points count only when they are FBL points: the league's Yahoo formula on that game's own box score
// (the collector's pointsSource BOX, from Sports.ru's game table, or the ESPN box-score overlay, source 'ESPN'). A row
// Sports.ru listed without readable box columns (NO_BOX) or still carrying its result bonus (SPORTS_WITH_BONUS) has no
// FBL points yet; a row without a source (older snapshots) counts as before.
const NOT_FBL=new Set(['NO_BOX','SPORTS_WITH_BONUS']);
export const fblGame=g=>Boolean(g?.played)&&Number.isFinite(g.points)&&(g.source==='ESPN'||!NOT_FBL.has(g.pointsSource));

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

// Holdings that score nothing now ("team:id" -> the team that had the player first): a player bought while another FBL
// team holds him scores only for that team (league owner, 21.10.2026; season.js teamPoints), so the later buyer's slot
// brings neither his running points nor his forecast while it keeps him. When the watcher cannot tell who bought first
// (a 'doubt' holding) both teams keep him, as their facts do.
export function shadowedHoldings(ctx,list=stints(ctx.transfers,ctx.picks)){
 const out=new Map();
 for(const s of list)if(!s.to&&shadowed(s))out.set(`${s.team}:${s.playerId}`,s.shadowedBy.find(a=>!a.to).team);
 return out;
}
// Whose a running game is ("team:id" -> {team, id, x: its running entry}), by the league table's own rule (season.js
// inStint, as teamPoints counts it once it is final): the holding that had the player at the tip-off and is not
// shadowed. A buyer after the tip-off gets none of it and the seller keeps it; a shadowed holder gets none. An entry
// without its day goes to the teams that hold the player now and are not shadowed.
export function runningCredit(ctx,running=new Map(),list=stints(ctx.transfers,ctx.picks)){
 const out=new Map(),by=new Map();if(!running.size)return out;
 for(const s of list)(by.get(s.playerId)||by.set(s.playerId,[]).get(s.playerId)).push(s);
 for(const [id,x] of running){const g=x.day?{date:x.day,...(x.game?.date?{tip:x.game.date}:{})}:null;
  for(const s of by.get(id)||[])if(g?inStint(g,s):!s.to&&!shadowed(s))out.set(`${s.team}:${id}`,{team:s.team,id,x});}
 return out;
}
// The running entries as team t sees them: a running game that is not its own (bought after the tip-off) brings it
// nothing, neither the points so far nor the rest of the game, which expectedPoints adds unless the entry is final.
const forTeam=(running,credit,t,id)=>!running.has(id)||credit.has(`${t}:${id}`)?running:new Map([...running,[id,{...running.get(id),points:0,final:true}]]);
// What team t still gets from the running games of players it no longer holds but had at the tip-off (sold after it):
// their points so far (now) and the expected rest of the game up to `to` (rest, with its spread).
export function soldRunning(ctx,t,running,credit,to=horizons(ctx).season.to){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),held=new Set(ctx.rosters[t]);let now=0,rest=0,variance=0;
 for(const {team,id,x} of credit.values()){if(team!==t||held.has(id))continue;now+=x.points||0;const p=byId.get(id);if(!p)continue;
  const left=expectedPoints(p,{...ctx,running},ctx.today,to).points-expectedPoints(p,{...ctx,running:new Map([[id,{...x,final:true}]])},ctx.today,to).points;
  rest+=left;variance+=pointsSpread(p,{...ctx,running},{points:left,games:0})**2;}
 return {now,rest,variance};
}
// The whole league race, once per screen: points so far (official plus `running`, the games in progress, scored from
// the ESPN box scores), the expected rest of the season with its spread (pointsSpread of each player over the rest of
// the season, players independent: the model's measured teammate correlation is about 0), shared places, and the
// chances of the final place. Owner's decision 21.10.2026: advice keeps maximising expected points; the standings add
// these chances. Rosters are today's: future transfers are not modelled, and a shadowed holding adds nothing
// (shadowedHoldings). A running game counts for the team that held the player at its tip-off (runningCredit), as it
// will once it is final. Before any points the place follows the forecast.
export const CHANCE_RUNS=20000;
export function leagueRace(ctx,running=new Map(),{sims=CHANCE_RUNS,seed=1}={}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),official=teamPoints(ctx,ctx.transfers,ctx.picks),list=stints(ctx.transfers,ctx.picks);
 const shadow=shadowedHoldings(ctx,list),credit=runningCredit(ctx,running,list);
 const rows=ctx.rosters.map((all,t)=>{
  const ids=all.filter(id=>!shadow.has(`${t}:${id}`)),sold=soldRunning(ctx,t,running,credit);
  let now=sold.now+ids.reduce((s,id)=>s+(credit.has(`${t}:${id}`)?running.get(id).points||0:0),0),rest=sold.rest,week=0,variance=sold.variance;
  for(const id of ids){const p=byId.get(id);if(!p)continue;const rc={...ctx,running:forTeam(running,credit,t,id)},o=playerOutlook(p,rc);rest+=o.season.points;week+=o.week.games;variance+=pointsSpread(p,rc,o.season)**2;}
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
 // The first week opens at the league's scoring start (opening night, before Sports.ru's tour 1): season.js periodList.
 const list=periodList(gameWeeks(ctx.live)),h=horizons(ctx);
 const i=list.findIndex(w=>ctx.today>=w.start&&ctx.today<=w.end),at=i>=0?i:list.findIndex(w=>w.start>ctx.today),cur=list[at]||null,start=cur?.start||ctx.today;
 return {week:{from:start,to:cur?.end||h.week.to},month:{from:start<ctx.today?start:ctx.today,to:h.month.to},season:{from:list[0]?.start||start,to:h.season.to}};
}
// What a roster player still brings team t in a window: the points so far of the game he is playing now, if it is
// t's (runningCredit: not when t bought him after its tip-off), plus the expectation of the rest of it and of the
// games ahead; nothing for a shadowed holding, whose games score for the first holder (as its fact).
export function windowAhead(ctx,t,p,w,running=new Map(),shadow=shadowedHoldings(ctx),credit=runningCredit(ctx,running)){
 if(shadow.has(`${t}:${p.id}`))return {points:0,games:0};
 const mine=credit.has(`${t}:${p.id}`),e=expectedPoints(p,{...ctx,running:forTeam(running,credit,t,p.id)},ctx.today,w.to);
 return {points:(mine?running.get(p.id).points||0:0)+e.points,games:e.games};
}
// The day a played game counts on, as expectedPoints counted it before it was played: the date of its Sports.ru tour
// (season.js tourDate), so an MLK-day game filed under the previous tour's last Moscow date stays in its own tour. The
// club calendars keep played games (marked gone) with their week; the opponent's calendar names the game whatever club
// the player was with then (a club plays once a Moscow date). A game no calendar lists counts on its own date.
const tourDays=new WeakMap();
function playedTourDay(live){
 const clubs=live?.clubs;if(!clubs)return g=>g.date;
 let at=tourDays.get(clubs);
 if(!at){const weeks=gameWeeks(live);at=new Map();for(const [club,games] of Object.entries(clubs))for(const g of games)if(Number.isFinite(g.week))at.set(`${club}|${g.date}`,tourDate(g,weeks));tourDays.set(clubs,at);}
 return (g,club)=>at.get(`${g.opponent}|${g.date}`)??at.get(`${club}|${g.date}`)??g.date;
}
// FBL points of a team in a window by the league table's own rule (teamPoints decides which games count for whom), only
// cut to the window's tours, so a period's fact never disagrees with the league place nor with the forecast it replaces.
// With `sportsId`, one player's part of it: what he brought this team in the window, over all his stints with it.
export function windowFact(ctx,t,w,sportsId=null){
 const day=playedTourDay(ctx.live);
 const players=Object.fromEntries(Object.entries(ctx.live?.players||{}).filter(([sid])=>sportsId==null||sid===String(sportsId))
  .map(([sid,x])=>[sid,{...x,games:(x.games||[]).filter(g=>{const d=day(g,x.club);return d>=w.from&&d<=w.to;})}]));
 return teamPoints({...ctx,live:{...ctx.live,players}},ctx.transfers,ctx.picks)[t];
}
