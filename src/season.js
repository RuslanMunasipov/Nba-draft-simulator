import {rosterFits,POSITIONS,TEAM_COUNT} from './engine.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';

export const CAP=20000,WEEKLY_TRANSFERS=3;
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
  map.set(id,{status:i.status,fantasyStatus:i.details?.fantasyStatus?.abbreviation||'',returnDate:i.details?.returnDate||null,comment:i.shortComment||'',date:i.date,type:i.details?.type||''});
 }
 return map;
}
