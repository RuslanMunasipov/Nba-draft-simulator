import solver from 'javascript-lp-solver';
import {rosterFits,POSITIONS,TEAM_COUNT,DEFAULT_CAP,CLUB_LIMIT as RULE_CLUB_LIMIT} from './engine.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';
import CALIBRATION from '../data/inseason-calibration.json' with {type:'json'};

export const CAP=DEFAULT_CAP,WEEKLY_TRANSFERS=3,CLUB_LIMIT=RULE_CLUB_LIMIT;
export {TEAM_COUNT};
// Sports.ru posts its calendar and fantasy weeks in Moscow dates.
export function moscowToday(now=Date.now()){return new Date(now+3*3600e3).toISOString().slice(0,10);}
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// A Sports.ru week is Monday to Sunday in US game days, which the Moscow-dated calendar shows as Tuesday to Monday.
// Without the published weeks this Tuesday-start week is the fallback.
export function weekStart(day){const d=new Date(day+'T00:00:00Z');return addDays(day,-((d.getUTCDay()+5)%7));}
// Game weeks from the week number of every calendar game, oldest first: each runs from the day after the previous week's
// last game to its own last game, so breaks (All-Star, NBA Cup) belong to the week that follows.
export function gameWeeks(live){
 const last=new Map(),first=new Map();
 for(const games of Object.values(live?.clubs||{}))for(const g of games){if(!Number.isFinite(g.week))continue;
  if(!(last.get(g.week)>=g.date))last.set(g.week,g.date);if(!(first.get(g.week)<=g.date))first.set(g.week,g.date);}
 if(!last.size)return live?.weeks||{};
 const out={};let prev=null;
 for(const n of [...last.keys()].sort((a,b)=>a-b)){out[n]={start:prev?addDays(prev,1):first.get(n),end:last.get(n)};prev=last.get(n);}
 return out;
}
const weekList=weeks=>Object.entries(weeks||{}).map(([n,w])=>({n,...w})).sort((a,b)=>a.start.localeCompare(b.start));
export function weekOf(day,weeks){
 const list=weekList(weeks);if(!list.length){const start=weekStart(day);return {n:null,start,end:addDays(start,6)};}
 return list.find(w=>day>=w.start&&day<=w.end)||(day<list[0].start?{...list[0],preseason:true}:null);
}
// Transfers made before the first game week are free; afterwards a move on a week's last day (after its games) counts for the next one.
function transferWeek(day,weeks){
 const list=weekList(weeks);if(!list.length){const start=weekStart(day);return {start,end:addDays(start,6)};}
 if(day<list[0].start)return null;
 return list.find(w=>w.end>day)||null;
}

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
export function transfersThisWeek(transfers,team,today,weeks){
 const week=transferWeek(today,weeks);if(!week)return 0;
 return transfers.filter(x=>x.team===team&&x.date<=today&&transferWeek(x.date,weeks)?.start===week.start).length;
}

// Points per game: the pre-season full-formula forecast updated by official Sports.ru games as they arrive.
// Weights come from scripts/inseason_calibration.py (fitted 2023/24->2024/25, tested on 2025/26):
// points per minute move slowly, minutes move faster and favour recent games, newcomers adapt fastest.
export const PRIOR_GAMES=10;
export {CALIBRATION};
export const clockMinutes=v=>{const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:Math.max(0,Number(v)||0);};
const newcomer=p=>p.isRookie===true||['EMPIRICAL_ROLE_PRIOR','DRAFT_PICK_MODEL','UNDRAFTED_ROOKIE_MODEL','SPORTS_PRICE_PRIOR'].includes(p.forecast?.origin);
export function perGame(player,live){
 const prior=Number.isFinite(player.forecast?.meanPerGame)?player.forecast.meanPerGame:Number.isFinite(player.projectedFP)?player.projectedFP:0;
 const played=(live?.games||[]).filter(g=>g.played),sum=played.reduce((s,g)=>s+g.points,0);
 const out={prior,games:played.length,average:played.length?sum/played.length:null};
 const priorMinutes=player.forecast?.minutes,minutes=played.map(g=>clockMinutes(g.minutes));
 // Without minutes on both sides only the plain average can be shrunk.
 if(!played.length||!(priorMinutes>0)||minutes.some(m=>!(m>0)))return {...out,value:(PRIOR_GAMES*prior+sum)/(PRIOR_GAMES+played.length)};
 const c=CALIBRATION.points[newcomer(player)?'newcomer':'established'],n=minutes.length;
 const w=minutes.map((_,i)=>c.minuteHalfLife?.5**((n-1-i)/c.minuteHalfLife):1),weight=w.reduce((s,x)=>s+x,0);
 const expectedMinutes=(c.minuteGames*priorMinutes+minutes.reduce((s,m,i)=>s+w[i]*m,0))/(c.minuteGames+weight);
 const rate=(c.rateGames*prior+sum)/(c.rateGames*priorMinutes+minutes.reduce((s,m)=>s+m,0));
 return {...out,minutes:expectedMinutes,value:rate*expectedMinutes};
}
// Share of team games a player plays: his forecast of games, updated by games played and missed so far.
// Missed games count against the club calendar too, in case Sports.ru lists only appearances.
export function playRate(player,live,ctx){
 const g=player.forecast?.games,prior=Number.isFinite(g)?Math.min(.97,Math.max(.5,g/82)):.85,today=ctx?.today;
 const rows=(live?.games||[]).filter(x=>x.played||today&&x.date<today),on=rows.filter(x=>x.played).length;
 const club=ctx?.live?.clubs?.[live?.club||player.sportsClub]||[],finished=club.filter(x=>x.score&&(!today||x.date<=today)).length;
 const team=Math.max(rows.length,finished,on),k=CALIBRATION.availability.priorGames;
 return (k*prior+on)/(k+team);
}
export const seasonEnding=injury=>String(injury?.fantasyStatus||'')==='OFS'||/out for (the )?season|miss the (entire|rest of the|20\d\d-\d\d) season/i.test(injury?.comment||'');
// Chance to play a game on a date given the ESPN injury report.
export function injuryFactor(injury,day,today){
 if(!injury)return 1;
 const status=String(injury.status||''),fantasy=String(injury.fantasyStatus||''),back=injury.returnDate||null;
 if(seasonEnding(injury))return back&&day>=back?1:0;
 const out=/out|suspension/i.test(status)&&fantasy!=='GTD';
 if(back)return day<back?(out?0:.5):1;
 return out?(day<addDays(today,10)?0:1):(day<addDays(today,3)?.5:1);
}
// Expected official points between two dates (inclusive), counting only club games not yet played: a game is done once
// the calendar has its score, its day has passed, Sports.ru lists it for the player, or it is running (ctx.running).
export function expectedPoints(player,ctx,from,to){
 const live=ctx.live?.players?.[player.sportsId],club=live?.club||player.sportsClub,calendar=ctx.live?.clubs?.[club]||[];
 const rate=perGame(player,live).value*playRate(player,live,ctx),injury=ctx.injuries?.get(String(player.espnId));
 const done=new Set((live?.games||[]).map(x=>x.date)),running=ctx.running?.get(player.id)?.day;
 let games=0,points=0;
 for(const g of calendar){if(g.date<from||g.date>to||g.score||(ctx.today&&g.date<ctx.today)||done.has(g.date)||g.date===running)continue;const f=injuryFactor(injury,g.date,ctx.today);games+=f;points+=rate*f;}
 return {points,games};
}
export function horizons(ctx){
 const all=gameWeeks(ctx.live),last=Object.values(all).reduce((m,w)=>w.end>m?w.end:m,ctx.today),week=weekOf(ctx.today,all);
 return {week:{label:'До конца недели',from:ctx.today,to:week?.end||ctx.today},
  month:{label:'4 недели',from:ctx.today,to:addDays(ctx.today,27)},
  season:{label:'До конца сезона',from:ctx.today,to:last}};
}
// Players on the Sports.ru market who are missing from the database (new to the market, reached through an FBL roster).
// They have no forecast: their prior per game is the median forecast of database players at the same Sports.ru price,
// the price being Sports.ru's own valuation. They are never treated as rookies, whose status the market does not show.
export function withMarket(players,live){
 const known=new Set(players.map(p=>p.sportsId).filter(Boolean)),extra=[];
 const priced=players.filter(p=>Number.isFinite(p.price)&&Number.isFinite(p.forecast?.meanPerGame));
 const median=xs=>{const v=[...xs].sort((a,b)=>a-b);return v.length?(v[(v.length-1)>>1]+v[v.length>>1])/2:null;};
 for(const [sid,x] of Object.entries(live?.players||{})){
  if(known.has(sid)||!POSITIONS.includes(x.position)||!Number.isFinite(x.price))continue;
  const near=priced.filter(p=>Math.abs(p.price-x.price)<=100),prior=median((near.length>=5?near:priced.filter(p=>p.price<=x.price+200)).map(p=>p.forecast.meanPerGame));
  extra.push({id:'sports:'+sid,sportsId:sid,name:x.fullName||x.name,sportsName:x.name,positions:[x.position],price:x.price,priceStatus:'VERIFIED',sportsClub:x.club,
   isRookie:false,rookieStatus:'NOT_SHOWN_BY_SPORTS_RU',team:null,
   forecast:prior===null?null:{origin:'SPORTS_PRICE_PRIOR',meanPerGame:prior,games:null,note:'Нет в базе: оценка по медиане игроков той же цены Sports.ru'}});
 }
 return extra.length?[...players,...extra]:players;
}
// Sports.ru position and current price decide transfer legality; the database keeps the draft-time values.
export function current(player,ctx){
 const live=ctx.live?.players?.[player.sportsId];
 return {...player,positions:live?.position&&POSITIONS.includes(live.position)?[live.position]:player.positions,price:Number.isFinite(live?.price)?live.price:player.price,club:live?.club||player.sportsClub||null};
}
export function playerOutlook(player,ctx){
 const h=horizons(ctx),out={};for(const [k,v] of Object.entries(h))out[k]=expectedPoints(player,ctx,v.from,v.to);
 return out;
}
// Every legal one-for-one replacement of a roster player: same Sports.ru slot structure, price within the bank, a rookie kept.
// Gains are expected official points of the newcomer minus those of the player sold, over each horizon.
function selling(ctx,team,outId,bankMoney,byId){
 const roster=ctx.rosters[team].map(id=>current(byId.get(id),ctx)),leaving=roster.find(p=>p.id===outId);
 if(!leaving)return null;
 const rest=roster.filter(p=>p.id!==outId);
 return {leaving,rest,money:bankMoney+leaving.price,needRookie:!rest.some(p=>p.isRookie===true),base:playerOutlook(leaving,ctx)};
}
const onMarket=(raw,ctx)=>raw.sportsId&&(ctx.live?.players?.[raw.sportsId]||raw.priceStatus==='VERIFIED');
// Sports.ru allows at most two players of one NBA club. One already over the limit after an NBA trade may stay, but no purchase may add to it.
export const clubRoom=(rest,p)=>!p.club||rest.filter(q=>q.club===p.club).length<CLUB_LIMIT;
const fits=(sale,p)=>Number.isFinite(p.price)&&p.price<=sale.money&&(!sale.needRookie||p.isRookie===true)&&clubRoom(sale.rest,p)&&rosterFits([...sale.rest,p]);
function swap(sale,p,ctx){
 const outlook=playerOutlook(p,ctx),gain={};for(const k of Object.keys(outlook))gain[k]=outlook[k].points-sale.base[k].points;
 return {outId:sale.leaving.id,player:p,outlook,gain,bankAfter:sale.money-p.price};
}
export function transferOptions(ctx,{team,outId,bankMoney,limit=15,sort='month'}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=new Set(ctx.rosters.flat()),sale=selling(ctx,team,outId,bankMoney,byId);
 if(!sale)return [];
 const options=[];
 for(const raw of ctx.players){
  if(taken.has(raw.id)||!onMarket(raw,ctx))continue;
  const p=current(raw,ctx);
  if(fits(sale,p))options.push(swap(sale,p,ctx));
 }
 return options.sort((a,b)=>b.gain[sort]-a.gain[sort]).slice(0,limit);
}
// The best legal one-for-one swap that brings a given free player into a team, or null when none fits.
export function bestSwapFor(ctx,{team,playerId,bankMoney,sort='season'}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),raw=byId.get(playerId);
 if(!raw||ctx.rosters.flat().includes(playerId)||!onMarket(raw,ctx))return null;
 const p=current(raw,ctx);let best=null;
 for(const outId of ctx.rosters[team]){
  const sale=selling(ctx,team,outId,bankMoney,byId);
  if(!sale||!fits(sale,p))continue;
  const option=swap(sale,p,ctx);
  if(!best||option.gain[sort]>best.gain[sort])best=option;
 }
 return best;
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
export function bestPackage(ctx,{team,bankMoney,k=3,sort='month',poolPerPosition=25,protectSeason=true,include=null}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=new Set(ctx.rosters.flat());
 const value=p=>playerOutlook(p,ctx)[sort].points;
 const roster=ctx.rosters[team].map(id=>current(byId.get(id),ctx)),wealth=bankMoney+roster.reduce((s,p)=>s+p.price,0);
 const pool=[];
 for(const pos of POSITIONS){
  pool.push(...ctx.players.filter(p=>!taken.has(p.id)&&p.sportsId&&(ctx.live?.players?.[p.sportsId]||p.priceStatus==='VERIFIED'))
   .map(p=>current(p,ctx)).filter(p=>p.positions.includes(pos)&&Number.isFinite(p.price)&&p.price<=wealth)
   .map(p=>({p,v:value(p)})).sort((a,b)=>b.v-a.v).slice(0,poolPerPosition));
 }
 // `include`: a free player the package must buy.
 const must=include!=null&&!taken.has(include)&&byId.get(include)?current(byId.get(include),ctx):null;
 if(include!=null&&!must)return null;
 if(must)pool.push({p:must,v:value(must)});
 const unique=[...new Map(pool.map(x=>[x.p.id,x])).values()];
 const model={optimize:'value',opType:'max',constraints:{count:{equal:10},kept:{min:10-k},money:{max:wealth},rookie:{min:1},...(must?{must:{min:1}}:{})},variables:{},ints:{}};
 const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
 subsets.forEach((T,i)=>{model.constraints['pos'+i]={max:2*T.length};});
 const items=[...roster.map(p=>({p,v:value(p),own:true})),...unique.map(x=>({...x,own:false}))];
 const clubs=[...new Set(items.map(x=>x.p.club).filter(Boolean))];
 clubs.forEach((c,i)=>{model.constraints['club'+i]={max:Math.max(CLUB_LIMIT,roster.filter(p=>p.club===c).length)};});
 const seasonOf=new Map(items.map(x=>[x.p.id,playerOutlook(x.p,ctx).season.points]));
 if(protectSeason&&sort!=='season')model.constraints.season={min:roster.reduce((s,p)=>s+seasonOf.get(p.id),0)-1e-6};
 items.forEach((x,i)=>{const v={value:x.v,count:1,money:x.p.price,season:seasonOf.get(x.p.id),['one'+i]:1};if(x.own)v.kept=1;if(x.p.isRookie===true)v.rookie=1;if(x.p.id===must?.id)v.must=1;if(x.p.club)v['club'+clubs.indexOf(x.p.club)]=1;
  subsets.forEach((T,j)=>{if(x.p.positions.every(q=>T.includes(q)))v['pos'+j]=1;});
  model.constraints['one'+i]={max:1};model.variables['x'+i]=v;model.ints['x'+i]=1;});
 const result=solver.Solve(model);if(!result.feasible)return null;
 const chosen=items.filter((_,i)=>result['x'+i]>0.5),next=chosen.map(x=>x.p);
 if(next.length!==10||!rosterFits(next)||!next.some(p=>p.isRookie===true)||next.reduce((s,p)=>s+p.price,0)>wealth)return null;
 if(clubs.some(c=>next.filter(p=>p.club===c).length>Math.max(CLUB_LIMIT,roster.filter(p=>p.club===c).length)))return null;
 const sold=items.filter((x,i)=>x.own&&!(result['x'+i]>0.5)),bought=chosen.filter(x=>!x.own);
 if(sold.length>k)return null;
 const base=roster.reduce((s,p)=>s+value(p),0),gain=chosen.reduce((s,x)=>s+x.v,0)-base;
 // Pair each sale with a purchase of the same position for a readable list of one-for-one transfers.
 const pairs=[],left=[...bought];
 for(const s of sold){const i=left.findIndex(b=>b.p.positions.some(q=>s.p.positions.includes(q)));const b=left.splice(i>=0?i:0,1)[0];pairs.push({out:s.p,in:b.p,gain:b.v-s.v});}
 const gains={};for(const h of ['week','month','season'])gains[h]=pairs.reduce((s,x)=>s+playerOutlook(x.in,ctx)[h].points-playerOutlook(x.out,ctx)[h].points,0);
 return {k,gain,gains,pairs,bankAfter:wealth-next.reduce((s,p)=>s+p.price,0)};
}
// A transfer already made, judged from today: expected official points of the newcomer minus those of the player sold,
// and the best swap of the same player the team could have made with the same money. bankMoney is the bank after the move.
export const VERDICTS={up:'💪 Усиление',down:'🤡 Ослабление',short:'⏳ Усиление только на ближайший месяц',long:'📅 Задел на сезон, сейчас не усиление',even:'🤷 Примерно равноценно'};
export function transferVerdict(ctx,transfer,{bankMoney,threshold=15}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),out=byId.get(transfer.outId),joined=byId.get(transfer.inId);
 if(!out||!joined)return null;
 const a=playerOutlook(out,ctx),b=playerOutlook(joined,ctx),gain={};for(const k of Object.keys(a))gain[k]=b[k].points-a[k].points;
 const m=gain.month,s=gain.season,T=threshold;
 // A season gain decides first: a player bought while injured is a season investment, not a weakening.
 const verdict=s>=T?(m>=T?'up':'long'):m>=T?(s>=0?'up':'short'):m<=-T||s<=-T?'down':'even';
 const before=ctx.rosters.map((r,t)=>t===transfer.team?r.map(id=>id===transfer.inId?transfer.outId:id):r);
 // The money the team had for this move: its bank after it plus the price paid; selling() adds back today's price of the player sold.
 const [best]=transferOptions({...ctx,rosters:before},{team:transfer.team,outId:transfer.outId,bankMoney:bankMoney+transfer.inPrice-current(out,ctx).price,limit:1});
 return {gain,verdict,label:VERDICTS[verdict],best:best&&best.player.id!==transfer.inId&&best.gain.month>gain.month?best:null};
}
// How a team can get a given free player: the best one-for-one swap, or else the best package of up to k transfers
// that buys him. Worth it when the season gains at least minGain and the next 4 weeks do not drop below monthFloor.
export function acquisition(ctx,{team,playerId,bankMoney,k=1,minGain=15,monthFloor=0}){
 const swap=bestSwapFor(ctx,{team,playerId,bankMoney});
 if(swap&&swap.gain.season>=minGain&&swap.gain.month>=monthFloor)return {worth:true,swap,pack:null};
 if(k>1){
  const pack=bestPackage(ctx,{team,bankMoney,k,sort:'season',include:playerId});
  if(pack&&pack.gains.season>=minGain&&pack.gains.month>=monthFloor)return {worth:true,swap,pack};
 }
 return {worth:false,swap,pack:null};
}
// Injured free agents worth getting over the season (not out for it), with how to get them.
// `soon`: day-to-day, or an ESPN return date within `days` — the moment to buy before the rivals and the price react.
export function injuredTargets(ctx,{team,bankMoney,k=1,days=7,minGain=30}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=new Set(ctx.rosters.flat()),until=addDays(ctx.today,days),out=[];
 const rate=p=>perGame(p,ctx.live?.players?.[p.sportsId]).value*playRate(p,ctx.live?.players?.[p.sportsId],ctx);
 const weakest=Math.min(...ctx.rosters[team].map(id=>rate(byId.get(id))));
 for(const raw of ctx.players){
  const injury=raw.espnId&&ctx.injuries?.get(String(raw.espnId));
  if(!injury||taken.has(raw.id)||seasonEnding(injury)||rate(raw)<=weakest)continue;
  // Still out for a while: judged on the season only; the 4-week window is checked again once he is back.
  const deal=acquisition(ctx,{team,playerId:raw.id,bankMoney,k,minGain,monthFloor:-Infinity});
  if(!deal.worth)continue;
  const dayToDay=!/out|suspension/i.test(injury.status||'')||injury.fantasyStatus==='GTD';
  out.push({player:current(raw,ctx),injury,...deal,soon:dayToDay||Boolean(injury.returnDate&&injury.returnDate.slice(0,10)<=until)});
 }
 const gainOf=x=>x.pack?x.pack.gains.season:x.swap.gain.season;
 return out.sort((a,b)=>gainOf(b)-gainOf(a));
}
// Free agents who beat a current player of the same position over the horizon and over the rest of the season,
// affordable in a one-for-one swap: real upgrades, not short-term streams.
export function marketAlerts(ctx,{team,bankMoney,sort='month',minGain=15,minConfidence=CONFIDENT}){
 return bestTransfers(ctx,{team,bankMoney,sort,limit:10}).map(x=>({...x,why:explainSwap(ctx,x.outId,x.player.id,sort)}))
  .filter(x=>x.gain[sort]>=minGain&&x.gain.season>0&&x.why.confidence>=minConfidence);
}

// ---------- Why a transfer, and how sure ----------
// A move is advised only when the model is this sure it gains over the chosen horizon; below DOUBTFUL it is not worth a transfer.
export const CONFIDENT=.7,DOUBTFUL=.6;
const Z90=1.2815515655;
function normalCdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
// Spread of a player's points over a horizon: the forecast's season range (10th-90th percentile, calibrated forward on past
// seasons) narrowed as his own games of this season come in (the in-season prior weight), plus game-to-game noise, which
// dominates a one-week horizon.
export function pointsSpread(player,ctx,outlook){
 const f=player.forecast,live=ctx.live?.players?.[player.sportsId],played=(live?.games||[]).filter(g=>g.played).length;
 const k=CALIBRATION.points.established.rateGames;
 const rel=f&&f.meanSeason>0&&Number.isFinite(f.seasonFloor)?(f.seasonCeiling-f.seasonFloor)/(2*Z90*f.meanSeason):.5;
 const game=f&&Number.isFinite(f.gameFloor)?(f.gameCeiling-f.gameFloor)/(2*Z90):Math.max(4,(outlook.points/Math.max(1,outlook.games))*.4);
 return Math.sqrt((rel*Math.sqrt(k/(k+played))*outlook.points)**2+game*game*Math.max(0,outlook.games));
}
// What one player brings over a horizon, split as points per game x share of the club's games he plays x club games.
export function playerPicture(player,ctx,key){
 const live=ctx.live?.players?.[player.sportsId],club=live?.club||player.sportsClub,h=horizons(ctx)[key];
 const outlook=expectedPoints(player,ctx,h.from,h.to),g=perGame(player,live),rate=playRate(player,live,ctx);
 const clubGames=(ctx.live?.clubs?.[club]||[]).filter(x=>x.date>=h.from&&x.date<=h.to&&!x.score&&!(ctx.today&&x.date<ctx.today)).length;
 const injury=ctx.injuries?.get(String(player.espnId))||null,played=(live?.games||[]).filter(x=>x.played);
 return {player,points:outlook.points,perGame:g.value,prior:g.prior,average:g.average,played:played.length,playRate:rate,
  expectedGames:outlook.games*rate,clubGames,injury,spread:pointsSpread(player,ctx,{points:outlook.points,games:outlook.games*rate}),
  price:current(player,ctx).price,priceChange:Number.isFinite(live?.price)&&Number.isFinite(live?.initialPrice)?live.price-live.initialPrice:0};
}
// Logarithmic-mean split of a difference of products a1*b1*c1 - a0*b0*c0 into exact additive parts.
function splitProduct(before,after){
 const total=after.reduce((a,b)=>a*b,1)-before.reduce((a,b)=>a*b,1);
 if(before.some(x=>!(x>0))||after.some(x=>!(x>0))){return before.map((_,i)=>i===0?total:0);}
 const P0=before.reduce((a,b)=>a*b,1),P1=after.reduce((a,b)=>a*b,1),w=Math.abs(P1-P0)<1e-9?P0:(P1-P0)/Math.log(P1/P0);
 return before.map((x,i)=>w*Math.log(after[i]/x));
}
// Why a swap gains (or not) over a horizon, how sure the model is, and what to check before doing it.
export function explainSwap(ctx,outId,inId,key='month',pairs=null){
 const byId=new Map(ctx.players.map(p=>[p.id,p]));
 const moves=pairs||[[outId,inId]],flags=[];let gain=0,variance=0;const parts={perGame:0,availability:0,schedule:0},sides=[];
 for(const [o,i] of moves){
  const a=playerPicture(byId.get(o),ctx,key),b=playerPicture(byId.get(i),ctx,key);sides.push({out:a,in:b});
  const split=splitProduct([a.perGame,a.expectedGames/Math.max(1e-9,a.clubGames),a.clubGames],[b.perGame,b.expectedGames/Math.max(1e-9,b.clubGames),b.clubGames]);
  const d=b.points-a.points;gain+=d;variance+=a.spread**2+b.spread**2;
  const sum=split.reduce((x,y)=>x+y,0)||1,scale=Math.abs(sum)>1e-9?d/sum:0;
  parts.perGame+=split[0]*scale;parts.availability+=split[1]*scale;parts.schedule+=split[2]*scale;
  const f=b.player.forecast||{},fo=a.player.forecast||{};
  if(b.injury)flags.push(`${b.player.name}: ${b.injury.status}${b.injury.returnDate?' до '+b.injury.returnDate.slice(8,10)+'.'+b.injury.returnDate.slice(5,7):''} — проверь новости перед покупкой.`);
  if(a.injury)flags.push(`${a.player.name}: ${a.injury.status} — это часть причины продажи.`);
  if(['DRAFT_PRIOR','GROUP_PRIOR','LIMITED_PERSONAL'].includes(f.coverageTier)||f.origin==='SPORTS_PRICE_PRIOR')flags.push(`${b.player.name}: прогноз почти без личной истории в NBA — высокая неопределённость.`);
  const e=fo.sources?.espn,m=fo.sources?.model;
  if(e&&m&&Math.abs(e.games-m.games)>=12)flags.push(`${a.player.name}: модель ждёт ${Math.round(m.games)} матчей, ESPN — ${Math.round(e.games)}; итог ${Math.round(fo.games)}. Если он здоров, разница меньше.`);
  const e2=f.sources?.espn,m2=f.sources?.model;
  if(e2&&m2&&Math.abs(e2.games-m2.games)>=12)flags.push(`${b.player.name}: модель ждёт ${Math.round(m2.games)} матчей, ESPN — ${Math.round(e2.games)}; итог ${Math.round(f.games)}.`);
  if(b.played<5&&a.played<5&&ctx.today)flags.push('Сезон только начался: оценки опираются на прогноз, а не на игры этого сезона.');
 }
 const sd=Math.sqrt(variance),confidence=sd>0?normalCdf(gain/sd):gain>0?1:0;
 const total=Math.abs(parts.perGame)+Math.abs(parts.availability)+Math.abs(parts.schedule)||1;
 if(gain>0&&parts.availability/total>.5)flags.unshift('Больше половины выигрыша — из прогноза числа сыгранных матчей, а не из игры за матч: это самая неточная часть прогноза.');
 if(gain>0&&parts.schedule/total>.5)flags.unshift('Выигрыш в основном из календаря (у нового клуба больше матчей в периоде): после периода преимущество исчезнет.');
 const level=confidence>=CONFIDENT?'CONFIDENT':confidence>=DOUBTFUL?'MODERATE':'DOUBTFUL';
 return {gain,sd,confidence,level,parts,flags:[...new Set(flags)],sides};
}
// Official Sports.ru formula on an ESPN box-score line; the result bonus applies only to finished games.
// A line with stats is an appearance (+1 even with zero minutes shown); ESPN leaves the stats of a DNP empty.
export function resultBonus(home,won){return won?(home?2:3):(home?-3:-2);}
export function boxScorePoints(stats,{home,won=null}){
 const n=v=>Number(v)||0,split=v=>String(v||'0-0').split('-').map(Number);
 const [fgm,fga]=split(stats.FG),[ftm,fta]=split(stats.FT),min=n(stats.MIN);
 if(!Object.keys(stats||{}).length)return null;
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
    if(!a.stats?.length||a.didNotPlay)continue;const stats=Object.fromEntries(labels.map((l,i)=>[l,a.stats[i]]));
    const points=boxScorePoints(stats,side);if(points!==null)out[String(a.athlete?.id)]={points,minutes:Number(stats.MIN)||0,final};
   }
  }
 }
 return out;
}

// ---------- Sports.ru team journals ----------
// Each FBL team mirrors its roster on Sports.ru, whose public journal lists every purchase and sale (short name and price).
// FBL transfers are the journal rows after the moment the Sports.ru roster equals the FBL draft roster.
const shortName=(p,live)=>p?.sportsName||live?.players?.[p?.sportsId]?.name||'';
const positionOf=(p,live)=>{const x=live?.players?.[p.sportsId]?.position;return x?[x]:p.positions;};
const priceOf=(p,live)=>live?.players?.[p.sportsId]?.price??p.price;
function sameNames(a,b){if(a.length!==b.length)return false;const x=[...a].sort(),y=[...b].sort();return x.every((v,i)=>v===y[i]);}
export function journalTransfers(players,live,picks=DRAFT_PICKS){
 const byId=new Map(players.map(p=>[p.id,p])),rosters=seasonRosters([],picks),events=[],warnings=[];
 for(const [key,team] of Object.entries(live?.teams||{})){
  const t=Number(key),draft=rosters[t].map(id=>shortName(byId.get(id),live)),journal=team.journal||[];
  let names=[],start=-1;
  journal.forEach((row,i)=>{if(row.sell){const j=names.indexOf(row.sell.name);if(j>=0)names.splice(j,1);}if(row.buy)names.push(row.buy.name);if(sameNames(names,draft))start=i;});
  if(start<0){
   warnings.push({team:t,message:'Состав на Sports.ru ни разу не совпал с драфтом FBL: трансферы взяты по датам после драфта.'});
   start=journal.reduce((m,row,i)=>row.date<=DRAFT_DATE?i:m,-1);
  }
  journal.slice(start+1).forEach((row,i)=>events.push({t,row,i}));
 }
 events.sort((a,b)=>a.row.date.localeCompare(b.row.date)||a.t-b.t||a.i-b.i);
 const taken=new Set(rosters.flat()),out=[];
 for(const {t,row} of events){
  if(!row.buy||!row.sell){warnings.push({team:t,message:`${row.date}: запись без пары покупка/продажа (${row.buy?.name||row.sell?.name}).`});continue;}
  const roster=rosters[t];
  const held=new Set((live?.teams?.[t]?.roster||[]).map(r=>r.sportsId)),gone=p=>held.size&&held.has(p.sportsId)?1e7:0;
  const outs=roster.map(id=>byId.get(id)).filter(p=>p&&shortName(p,live)===row.sell.name).sort((a,b)=>gone(a)+Math.abs(priceOf(a,live)-row.sell.price)-gone(b)-Math.abs(priceOf(b,live)-row.sell.price));
  if(!outs.length){warnings.push({team:t,message:`${row.date}: продан ${row.sell.name}, но его нет в составе.`});continue;}
  const leaving=outs[0],pos=positionOf(leaving,live),now=new Set((live?.teams?.[t]?.roster||[]).map(r=>r.sportsId));
  // The roster JSON names the exact player a team holds today; position and price only break remaining ties.
  const score=p=>(now.size&&!now.has(p.sportsId)?1e7:0)+(positionOf(p,live).some(x=>pos.includes(x))?0:1e6)+Math.abs(priceOf(p,live)-row.buy.price);
  const ins=players.filter(p=>p.sportsId&&!taken.has(p.id)&&shortName(p,live)===row.buy.name).sort((a,b)=>score(a)-score(b));
  if(!ins.length){warnings.push({team:t,message:`${row.date}: куплен ${row.buy.name}, игрок не найден среди свободных.`});continue;}
  if(ins.length>1&&score(ins[0])===score(ins[1]))warnings.push({team:t,message:`${row.date}: ${row.buy.name} неоднозначен, выбран ${ins[0].name} (${ins[0].team}).`});
  const joining=ins[0];
  roster[roster.indexOf(leaving.id)]=joining.id;taken.delete(leaving.id);taken.add(joining.id);
  out.push({team:t,outId:leaving.id,inId:joining.id,date:row.date,outPrice:row.sell.price,inPrice:row.buy.price,source:'sports.ru'});
 }
 return {transfers:out,warnings,teams:new Set(Object.keys(live?.teams||{}).map(Number))};
}
// Sports.ru journals for every connected team, the shared league log for the rest.
// Anything breaking a rule is dropped; every team's bank is replayed with Sports.ru prices and flagged when it goes negative.
export function allTransfers(players,live,league={transfers:[]},picks=DRAFT_PICKS){
 const fromSports=journalTransfers(players,live,picks),warnings=[...fromSports.warnings],covered=fromSports.teams;
 const manual=(league.transfers||[]).filter(x=>!covered.has(x.team)).map(x=>({...x,source:'league'}));
 const merged=[...fromSports.transfers,...manual].sort((a,b)=>a.date.localeCompare(b.date)),valid=[];
 for(const x of merged){try{seasonRosters([...valid,x],picks);valid.push(x);}catch(e){warnings.push({team:x.team,message:`${x.date}: ${e.message}`});}}
 const byId=new Map(players.map(p=>[p.id,p]));
 for(let t=0;t<TEAM_COUNT;t++){let money=CAP;picks.forEach((id,i)=>{if(i%TEAM_COUNT===t)money-=live?.players?.[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0;});
  // Sports.ru confirms a day's transfers as one package: only the bank after the last move of a day must stay within the cap.
  const mine=valid.filter(x=>x.team===t);
  mine.forEach((x,i)=>{money+=x.outPrice-x.inPrice;if(money<0&&mine[i+1]?.date!==x.date)warnings.push({team:t,message:`${x.date}: после трансферов дня (последний ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}) банк по ценам Sports.ru ${money} — превышен лимит ${CAP}.`});});}
 // Cross-check with the roster Sports.ru shows today: a difference means a journal row was misread.
 const now=seasonRosters(valid,picks);
 for(const [key,team] of Object.entries(live?.teams||{})){if(!team.roster?.length)continue;
  const held=new Set(team.roster.map(r=>r.sportsId)),odd=now[Number(key)].map(id=>byId.get(id)).filter(p=>!held.has(p?.sportsId));
  if(odd.length)warnings.push({team:Number(key),message:`Состав по журналу расходится с составом Sports.ru: ${odd.map(p=>p?.name).join(', ')} — проверь трансферы.`});}
 return {transfers:valid,warnings,connected:covered};
}
