import solver from 'javascript-lp-solver';
import {rosterFits,POSITIONS,TEAM_COUNT} from './engine.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';

export const CAP=20000,WEEKLY_TRANSFERS=3;
export {TEAM_COUNT};
// Sports.ru posts its calendar and fantasy weeks in Moscow dates.
export function moscowToday(now=Date.now()){return new Date(now+3*3600e3).toISOString().slice(0,10);}
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// Monday-to-Sunday week of a date; transfers refresh every Monday.
export function weekStart(day){const d=new Date(day+'T00:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7));}

// Draft rosters plus every recorded transfer, in order. A transfer is {team,outId,inId,date,outPrice,inPrice}.
export function seasonRosters(transfers=[],picks=DRAFT_PICKS){
 const rosters=Array.from({length:TEAM_COUNT},(_,t)=>picks.filter((_,i)=>i%TEAM_COUNT===t));
 for(const x of transfers){
  const roster=rosters[x.team];
  if(!roster?.includes(x.outId))throw Error('Игрока, которого отдают, нет в составе');
  if(rosters.some(r=>r.includes(x.inId)))throw Error('Игрок уже в составе другой команды');
  roster[roster.indexOf(x.outId)]=x.inId;
 }
 return rosters;
}
// Who scored for whom and when: each player counts for a team from the day he joined until the day he left.
export function stints(transfers=[],picks=DRAFT_PICKS){
 const open=new Map(picks.map((id,i)=>[id,{team:i%TEAM_COUNT,playerId:id,from:DRAFT_DATE,to:null}])),done=[];
 for(const x of transfers){const s=open.get(x.outId);if(s){s.to=x.date;done.push(s);open.delete(x.outId);}open.set(x.inId,{team:x.team,playerId:x.inId,from:x.date,to:null});}
 return [...done,...open.values()];
}
// Sports.ru money: start at the cap, pay the initial price of each drafted player, then sell and buy at the prices of the day.
export function bank(team,transfers,priceAtDraft,picks=DRAFT_PICKS){
 let money=CAP;picks.forEach((id,i)=>{if(i%TEAM_COUNT===team)money-=priceAtDraft(id);});
 for(const x of transfers)if(x.team===team)money+=x.outPrice-x.inPrice;
 return money;
}
export function transfersThisWeek(transfers,team,today){const from=weekStart(today);return transfers.filter(x=>x.team===team&&x.date>=from&&x.date<=today).length;}

// Points per game: the pre-season full-formula forecast shrunk toward official Sports.ru points as games arrive.
export const PRIOR_GAMES=10;
export function perGame(player,live){
 const prior=Number.isFinite(player.forecast?.meanPerGame)?player.forecast.meanPerGame:Number.isFinite(player.projectedFP)?player.projectedFP:0;
 const played=(live?.games||[]).filter(g=>g.played),sum=played.reduce((s,g)=>s+g.points,0);
 return {prior,games:played.length,average:played.length?sum/played.length:null,value:(PRIOR_GAMES*prior+sum)/(PRIOR_GAMES+played.length)};
}
// Share of team games a healthy player plays, from his own forecast of games.
export function playRate(player){const g=player.forecast?.games;return Number.isFinite(g)?Math.min(.97,Math.max(.5,g/82)):.85;}
// Chance to play a game on a date given the ESPN injury report.
export function injuryFactor(injury,day,today){
 if(!injury)return 1;
 const status=String(injury.status||''),fantasy=String(injury.fantasyStatus||''),back=injury.returnDate||null;
 if(fantasy==='OFS'||/out for (the )?season|miss the (entire|rest of the|20\d\d-\d\d) season/i.test(injury.comment||''))return back&&day>=back?1:0;
 const out=/out|suspension/i.test(status)&&fantasy!=='GTD';
 if(back)return day<back?(out?0:.5):1;
 return out?(day<addDays(today,10)?0:1):(day<addDays(today,3)?.5:1);
}
// Expected official points between two dates (inclusive), counting only club games not yet played.
export function expectedPoints(player,ctx,from,to){
 const live=ctx.live?.players?.[player.sportsId],club=live?.club||player.sportsClub,calendar=ctx.live?.clubs?.[club]||[];
 const rate=perGame(player,live).value*playRate(player),injury=ctx.injuries?.get(String(player.espnId));
 let games=0,points=0;
 for(const g of calendar){if(g.date<from||g.date>to||g.score)continue;const f=injuryFactor(injury,g.date,ctx.today);games+=f;points+=rate*f;}
 return {points,games};
}
export function horizons(ctx){
 const weeks=Object.values(ctx.live?.weeks||{}),last=weeks.reduce((m,w)=>w.end>m?w.end:m,ctx.today);
 return {week:{label:'До конца недели',from:ctx.today,to:addDays(weekStart(ctx.today),6)},
  month:{label:'4 недели',from:ctx.today,to:addDays(ctx.today,27)},
  season:{label:'До конца сезона',from:ctx.today,to:last}};
}
// Sports.ru position and current price decide transfer legality; the database keeps the draft-time values.
export function current(player,ctx){
 const live=ctx.live?.players?.[player.sportsId];
 return {...player,positions:live?.position&&POSITIONS.includes(live.position)?[live.position]:player.positions,price:Number.isFinite(live?.price)?live.price:player.price};
}
export function playerOutlook(player,ctx){
 const h=horizons(ctx),out={};for(const [k,v] of Object.entries(h))out[k]=expectedPoints(player,ctx,v.from,v.to);
 return out;
}
// Every legal one-for-one replacement of a roster player: same Sports.ru slot structure, price within the bank, a rookie kept.
// Gains are expected official points of the newcomer minus those of the player sold, over each horizon.
export function transferOptions(ctx,{team,outId,bankMoney,limit=15,sort='month'}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),rosters=ctx.rosters,taken=new Set(rosters.flat());
 const roster=rosters[team].map(id=>current(byId.get(id),ctx)),leaving=roster.find(p=>p.id===outId);
 if(!leaving)return [];
 const rest=roster.filter(p=>p.id!==outId),money=bankMoney+leaving.price,needRookie=!rest.some(p=>p.isRookie===true);
 const base=playerOutlook(leaving,ctx),options=[];
 for(const raw of ctx.players){
  if(taken.has(raw.id)||!raw.sportsId||!ctx.live?.players?.[raw.sportsId]&&raw.priceStatus!=='VERIFIED')continue;
  const p=current(raw,ctx);
  if(!Number.isFinite(p.price)||p.price>money||(needRookie&&p.isRookie!==true)||!rosterFits([...rest,p]))continue;
  const outlook=playerOutlook(p,ctx),gain={};for(const k of Object.keys(outlook))gain[k]=outlook[k].points-base[k].points;
  options.push({player:p,outlook,gain,bankAfter:money-p.price});
 }
 return options.sort((a,b)=>b.gain[sort]-a.gain[sort]).slice(0,limit);
}
// The single best replacement for every player of a team, best gains first.
export function bestTransfers(ctx,{team,bankMoney,sort='month',limit=10}){
 return ctx.rosters[team].map(outId=>{const [best]=transferOptions(ctx,{team,outId,bankMoney,limit:1,sort});return best?{outId,...best}:null;})
  .filter(x=>x&&x.gain[sort]>0).sort((a,b)=>b.gain[sort]-a.gain[sort]).slice(0,limit);
}
// Official Sports.ru points each team collected so far, counting a player only while he was on the team.
export function teamPoints(ctx,transfers,picks=DRAFT_PICKS){
 const totals=Array(TEAM_COUNT).fill(0),byId=new Map(ctx.players.map(p=>[p.id,p]));
 for(const s of stints(transfers,picks)){
  const games=ctx.live?.players?.[byId.get(s.playerId)?.sportsId]?.games||[];
  for(const g of games)if(g.played&&g.date>=s.from&&(!s.to||g.date<s.to))totals[s.team]+=g.points;
 }
 return totals;
}
// ESPN injury feed (CORS-open) as a map from ESPN athlete id.
export function parseInjuries(feed){
 const map=new Map();
 for(const team of feed?.injuries||[])for(const i of team.injuries||[]){
  const id=String(i.athlete?.links?.[0]?.href||'').match(/\/id\/(\d+)/)?.[1];if(!id)continue;
  map.set(id,{name:i.athlete?.displayName||'',status:i.status,fantasyStatus:i.details?.fantasyStatus?.abbreviation||'',returnDate:i.details?.returnDate||null,comment:i.shortComment||'',date:i.date,type:i.details?.type||''});
 }
 return map;
}

// Exact best package of up to k transfers this week (integer programming over the roster and the strongest free agents):
// keep or sell each player, buy free agents, two per Sports.ru position, at least one rookie, money within the bank.
// By default the package may not lower the rest-of-season expectation: short-term gains never cost the season.
export function bestPackage(ctx,{team,bankMoney,k=3,sort='month',poolPerPosition=25,protectSeason=true}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=new Set(ctx.rosters.flat());
 const value=p=>playerOutlook(p,ctx)[sort].points;
 const roster=ctx.rosters[team].map(id=>current(byId.get(id),ctx)),wealth=bankMoney+roster.reduce((s,p)=>s+p.price,0);
 const pool=[];
 for(const pos of POSITIONS){
  pool.push(...ctx.players.filter(p=>!taken.has(p.id)&&p.sportsId&&(ctx.live?.players?.[p.sportsId]||p.priceStatus==='VERIFIED'))
   .map(p=>current(p,ctx)).filter(p=>p.positions.includes(pos)&&Number.isFinite(p.price)&&p.price<=wealth)
   .map(p=>({p,v:value(p)})).sort((a,b)=>b.v-a.v).slice(0,poolPerPosition));
 }
 const unique=[...new Map(pool.map(x=>[x.p.id,x])).values()];
 const model={optimize:'value',opType:'max',constraints:{count:{equal:10},kept:{min:10-k},money:{max:wealth},rookie:{min:1}},variables:{},ints:{}};
 const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
 subsets.forEach((T,i)=>{model.constraints['pos'+i]={max:2*T.length};});
 const items=[...roster.map(p=>({p,v:value(p),own:true})),...unique.map(x=>({...x,own:false}))];
 const seasonOf=new Map(items.map(x=>[x.p.id,playerOutlook(x.p,ctx).season.points]));
 if(protectSeason&&sort!=='season')model.constraints.season={min:roster.reduce((s,p)=>s+seasonOf.get(p.id),0)-1e-6};
 items.forEach((x,i)=>{const v={value:x.v,count:1,money:x.p.price,season:seasonOf.get(x.p.id),['one'+i]:1};if(x.own)v.kept=1;if(x.p.isRookie===true)v.rookie=1;
  subsets.forEach((T,j)=>{if(x.p.positions.every(q=>T.includes(q)))v['pos'+j]=1;});
  model.constraints['one'+i]={max:1};model.variables['x'+i]=v;model.ints['x'+i]=1;});
 const result=solver.Solve(model);if(!result.feasible)return null;
 const chosen=items.filter((_,i)=>result['x'+i]>0.5),next=chosen.map(x=>x.p);
 if(next.length!==10||!rosterFits(next)||!next.some(p=>p.isRookie===true)||next.reduce((s,p)=>s+p.price,0)>wealth)return null;
 const sold=items.filter((x,i)=>x.own&&!(result['x'+i]>0.5)),bought=chosen.filter(x=>!x.own);
 if(sold.length>k)return null;
 const base=roster.reduce((s,p)=>s+value(p),0),gain=chosen.reduce((s,x)=>s+x.v,0)-base;
 // Pair each sale with a purchase of the same position for a readable list of one-for-one transfers.
 const pairs=[],left=[...bought];
 for(const s of sold){const i=left.findIndex(b=>b.p.positions.some(q=>s.p.positions.includes(q)));const b=left.splice(i>=0?i:0,1)[0];pairs.push({out:s.p,in:b.p,gain:b.v-s.v});}
 const gains={};for(const h of ['week','month','season'])gains[h]=pairs.reduce((s,x)=>s+playerOutlook(x.in,ctx)[h].points-playerOutlook(x.out,ctx)[h].points,0);
 return {k,gain,gains,pairs,bankAfter:wealth-next.reduce((s,p)=>s+p.price,0)};
}
// Free agents who beat a current player of the same position over the horizon and over the rest of the season,
// affordable in a one-for-one swap: real upgrades, not short-term streams.
export function marketAlerts(ctx,{team,bankMoney,sort='month',minGain=15}){
 return bestTransfers(ctx,{team,bankMoney,sort,limit:10}).filter(x=>x.gain[sort]>=minGain&&x.gain.season>0);
}
// Official Sports.ru formula on an ESPN box-score line; the result bonus applies only to finished games.
export function resultBonus(home,won){return won?(home?2:3):(home?-3:-2);}
export function boxScorePoints(stats,{home,won=null}){
 const n=v=>Number(v)||0,split=v=>String(v||'0-0').split('-').map(Number);
 const [fgm,fga]=split(stats.FG),[ftm,fta]=split(stats.FT),min=n(stats.MIN);
 if(!min&&!n(stats.PTS)&&!n(stats.REB))return null;
 return n(stats.PTS)+n(stats.REB)+n(stats.AST)+n(stats.STL)+n(stats.BLK)-(fga-fgm)-(fta-ftm)-2*n(stats.TO)-n(stats.PF)+(min>=10?2:1)+(won===null?0:resultBonus(home,won));
}
// ESPN summary -> {espnAthleteId: {points, minutes, final}}.
export function liveGamePoints(summary,event){
 const comp=event?.competitions?.[0],final=Boolean(event?.status?.type?.completed),out={};
 const sides=new Map((comp?.competitors||[]).map(c=>[String(c.team?.id),{home:c.homeAway==='home',won:final?Boolean(c.winner):null}]));
 for(const team of summary?.boxscore?.players||[]){
  const side=sides.get(String(team.team?.id))||{home:false,won:null};
  for(const st of team.statistics||[]){
   const labels=st.labels||st.names||[];
   for(const a of st.athletes||[]){
    if(!a.stats?.length)continue;const stats=Object.fromEntries(labels.map((l,i)=>[l,a.stats[i]]));
    const points=boxScorePoints(stats,side);if(points!==null)out[String(a.athlete?.id)]={points,minutes:Number(stats.MIN)||0,final};
   }
  }
 }
 return out;
}
