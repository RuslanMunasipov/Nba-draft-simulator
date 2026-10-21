import solver from 'javascript-lp-solver';
import {rosterFits,POSITIONS,TEAM_COUNT,DEFAULT_CAP,CLUB_LIMIT as RULE_CLUB_LIMIT} from './engine.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';
import CALIBRATION from '../data/inseason-calibration.json' with {type:'json'};
import LENGTHS from '../data/availability-lengths.json' with {type:'json'};
import RULES from '../data/league-rules.json' with {type:'json'};

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
// Sports.ru's tour 1 starts on 22.10, after the league's opening night: Yahoo, which keeps the FBL standings, scores from
// 20.10 (data/league-rules.json yahoo.scoringStart). Period windows open the first week at that day, so the opening
// games count in the week and season facts; Sports.ru's own tours (transfer counting) are left as they are.
export const SCORING_START=RULES.yahoo?.scoringStart||null;
export function periodList(weeks,start=SCORING_START){
 const list=Object.entries(weeks||{}).map(([n,w])=>({n:Number(n),...w})).sort((a,b)=>a.start.localeCompare(b.start));
 if(list.length&&start&&start<list[0].start)list[0]={...list[0],start};
 return list;
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
  // Sports.ru lets several fantasy teams hold one player, so a player on another FBL roster may still be bought; the
  // league's rules check flags it for the lawyer. Only buying a player the team already has is impossible.
  if(roster.includes(x.inId))throw Error('Игрок уже в составе этой команды');
  roster[roster.indexOf(x.outId)]=x.inId;
 }
 return rosters;
}
// Who scored for whom and when: each player counts for a team from the day he joined until the day he left.
export function stints(transfers=[],picks=DRAFT_PICKS){
 // Keyed by team and player: two teams may hold the same player (Sports.ru allows it).
 const k=(team,id)=>`${team}:${id}`;
 const open=new Map(picks.map((id,i)=>[k(i%TEAM_COUNT,id),{team:i%TEAM_COUNT,playerId:id,from:DRAFT_DATE,to:null}])),done=[];
 for(const x of transfers){const s=open.get(k(x.team,x.outId));if(s){s.to=x.date;done.push(s);open.delete(k(x.team,x.outId));}open.set(k(x.team,x.inId),{team:x.team,playerId:x.inId,from:x.date,to:null});}
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

// Points per game: the pre-season full-formula forecast updated by the games played, as they arrive (Sports.ru's points
// of each game minus its team result bonus: FBL scores on Yahoo, without it).
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
// Chance to play each of the next n club games for a player available now: the absence chain (short and long spells
// with the player's hazards, league spell lengths) scaled so that over a season it plays `share` of the games. A healthy
// player plays the next games far more often than his season share (backtest 2025/26, after playing the last game:
// 83.7% of the next 7 played; season share 78.2%, chain 86.4%), because long absences have not started yet.
const curves=new Map();
function chainCurve(h,share,n){
 const key=`${h[0]},${h[1]},${share.toFixed(3)}`;let c=curves.get(key);
 if(!c){
  const run=(m,len)=>{const hs=h[0]*m,hl=h[1]*m,stay=Math.max(0,1-hs-hl),out=[];let p=new Float64Array(LENGTHS.longLengths.length);p[0]=1;
   for(let j=0;j<len;j++){const a=p[0],q=new Float64Array(p.length);out.push(a*stay);for(let r=1;r<p.length;r++)q[r-1]=p[r];q[0]+=a*stay;
    for(let k=1;k<p.length;k++)q[k-1]+=a*(hs*(LENGTHS.shortLengths[k]||0)+hl*LENGTHS.longLengths[k]);p=q;}
   return out;};
  const mean=m=>run(m,82).reduce((s,x)=>s+x,0)/82;let lo=-6,hi=6;
  if(mean(Math.exp(hi))>=share)lo=hi;else if(mean(Math.exp(lo))<=share)hi=lo;
  else for(let i=0;i<22;i++){const m=(lo+hi)/2;if(mean(Math.exp(m))>share)lo=m;else hi=m;}
  c=run(Math.exp((lo+hi)/2),82);curves.set(key,c);
 }
 return Array.from({length:n},(_,j)=>c[Math.min(j,c.length-1)]);
}
// Injuries named in a player's ESPN fantasy news ("Zubac (ankle) will play…"): body part, how often, first and last
// mention. Descriptive only: about nine months of news exist, too few seasons to fit a risk per body part.
const BODY={ankle:'голеностоп',knee:'колено',achilles:'ахилл',foot:'стопа',toe:'палец ноги',hamstring:'бицепс бедра',calf:'икра',groin:'пах',hip:'бедро',
 quadriceps:'квадрицепс',quad:'квадрицепс',thigh:'бедро',back:'спина','lower back':'поясница',neck:'шея',shoulder:'плечо',elbow:'локоть',wrist:'запястье',
 hand:'кисть',finger:'палец',thumb:'большой палец',rib:'ребро',ribs:'рёбра',oblique:'косые мышцы',abdomen:'пресс',head:'голова',concussion:'сотрясение',
 face:'лицо',nose:'нос',eye:'глаз',illness:'болезнь',shin:'голень',leg:'нога',chest:'грудь',heel:'пятка',plantar:'подошва'};
export function newsInjuries(feed){
 const out=new Map();
 for(const n of feed||[]){
  const text=`${n.headline||''} ${String(n.story||n.description||'').replace(/<[^>]+>/g,'')}`,day=String(n.published||n.lastModified||'').slice(0,10);
  for(const m of text.matchAll(/\(([a-z ]{3,16})\)/gi)){
   const part=BODY[m[1].toLowerCase().trim()];if(!part||!day)continue;
   const x=out.get(part)||{part,mentions:0,first:day,last:day};x.mentions++;if(day<x.first)x.first=day;if(day>x.last)x.last=day;out.set(part,x);
  }
 }
 return [...out.values()].sort((a,b)=>a.first<b.first?-1:1);
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
// Each game counts with the injury report's factor times the chain's chance to be available that many healthy games on
// (counted from today, or from the return of an injured player); without hazards (rookies, market players) it is the
// flat season share as before.
export function expectedPoints(player,ctx,from,to){
 const live=ctx.live?.players?.[player.sportsId],club=live?.club||player.sportsClub,calendar=ctx.live?.clubs?.[club]||[];
 const share=playRate(player,live,ctx),value=perGame(player,live).value,injury=ctx.injuries?.get(String(player.espnId));
 const done=new Set((live?.games||[]).map(x=>x.date)),running=ctx.running?.get(player.id)?.day,h=player.forecast?.availability?.hazards;
 const ahead=calendar.filter(g=>!(g.score||(ctx.today&&g.date<ctx.today)||done.has(g.date)||g.date===running)).sort((a,b)=>a.date<b.date?-1:1);
 const curve=Array.isArray(h)?chainCurve(h,share,ahead.length):null;
 let games=0,points=0,healthy=0;
 for(const g of ahead){
  const f=injuryFactor(injury,g.date,ctx.today);if(!f)continue;
  const p=f*(curve?curve[healthy++]:share);
  if(g.date>=from&&g.date<=to){games+=p;points+=value*p;}
 }
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
 const white=whiteOf(ctx);
 return {leaving,rest,money:bankMoney+leaving.price,needRookie:!rest.some(p=>p.isRookie===true),
  white,needWhite:Boolean(white)&&!rest.some(p=>white.has(String(p.id))),base:playerOutlook(leaving,ctx)};
}
// The league's «белое правило» list (ctx.white: ids of players who count); without a list the rule is not enforced.
const whiteOf=ctx=>ctx.white?.size?ctx.white:null;
const onMarket=(raw,ctx)=>raw.sportsId&&(ctx.live?.players?.[raw.sportsId]||raw.priceStatus==='VERIFIED');
// Sports.ru allows at most two players of one NBA club. One already over the limit after an NBA trade may stay, but no purchase may add to it.
export const clubRoom=(rest,p)=>!p.club||rest.filter(q=>q.club===p.club).length<CLUB_LIMIT;
const fits=(sale,p)=>Number.isFinite(p.price)&&p.price<=sale.money&&(!sale.needRookie||p.isRookie===true)&&(!sale.needWhite||sale.white.has(String(p.id)))&&clubRoom(sale.rest,p)&&rosterFits([...sale.rest,p]);
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
// FBL points each team collected so far (Sports.ru's per game minus the team result bonus), counting a player only while
// he was on the team.
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
// keep or sell each player, buy free agents, two per Sports.ru position, at least one rookie, at least one player of the
// league's «белое правило» list (when there is one), money within the bank.
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
 const white=whiteOf(ctx),counts=p=>Boolean(white?.has(String(p.id)));
 const model={optimize:'value',opType:'max',constraints:{count:{equal:10},kept:{min:10-k},money:{max:wealth},rookie:{min:1},...(white?{white:{min:1}}:{}),...(must?{must:{min:1}}:{})},variables:{},ints:{}};
 const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
 subsets.forEach((T,i)=>{model.constraints['pos'+i]={max:2*T.length};});
 const items=[...roster.map(p=>({p,v:value(p),own:true})),...unique.map(x=>({...x,own:false}))];
 const clubs=[...new Set(items.map(x=>x.p.club).filter(Boolean))];
 clubs.forEach((c,i)=>{model.constraints['club'+i]={max:Math.max(CLUB_LIMIT,roster.filter(p=>p.club===c).length)};});
 const seasonOf=new Map(items.map(x=>[x.p.id,playerOutlook(x.p,ctx).season.points]));
 if(protectSeason&&sort!=='season')model.constraints.season={min:roster.reduce((s,p)=>s+seasonOf.get(p.id),0)-1e-6};
 items.forEach((x,i)=>{const v={value:x.v,count:1,money:x.p.price,season:seasonOf.get(x.p.id),['one'+i]:1};if(x.own)v.kept=1;if(x.p.isRookie===true)v.rookie=1;if(counts(x.p))v.white=1;if(x.p.id===must?.id)v.must=1;if(x.p.club)v['club'+clubs.indexOf(x.p.club)]=1;
  subsets.forEach((T,j)=>{if(x.p.positions.every(q=>T.includes(q)))v['pos'+j]=1;});
  model.constraints['one'+i]={max:1};model.variables['x'+i]=v;model.ints['x'+i]=1;});
 const result=solver.Solve(model);if(!result.feasible)return null;
 const chosen=items.filter((_,i)=>result['x'+i]>0.5),next=chosen.map(x=>x.p);
 if(next.length!==10||!rosterFits(next)||!next.some(p=>p.isRookie===true)||(white&&!next.some(counts))||next.reduce((s,p)=>s+p.price,0)>wealth)return null;
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
  expectedGames:outlook.games,clubGames,injury,spread:pointsSpread(player,ctx,outlook),
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
  if(e&&m&&Math.abs(e.games-m.games)>=12)flags.push(`${a.player.name}: в расчёте ${Math.round(fo.games)} матчей по ESPN; по истории пропусков модель ждала бы ${Math.round(m.games)}.`);
  const e2=f.sources?.espn,m2=f.sources?.model;
  if(e2&&m2&&Math.abs(e2.games-m2.games)>=12)flags.push(`${b.player.name}: в расчёте ${Math.round(f.games)} матчей по ESPN; по истории пропусков модель ждала бы ${Math.round(m2.games)}.`);
  if(b.player.depth?.rank>=3)flags.push(`${b.player.name}: по составу ESPN №${b.player.depth.rank} на ${b.player.depth.position} — роль и минуты не гарантированы.`);
  if(b.played<5&&a.played<5&&ctx.today)flags.push('Сезон только начался: оценки опираются на прогноз, а не на игры этого сезона.');
 }
 const sd=Math.sqrt(variance),confidence=sd>0?normalCdf(gain/sd):gain>0?1:0;
 const total=Math.abs(parts.perGame)+Math.abs(parts.availability)+Math.abs(parts.schedule)||1;
 if(gain>0&&parts.availability/total>.5)flags.unshift('Больше половины выигрыша — из прогноза числа сыгранных матчей, а не из игры за матч: это самая неточная часть прогноза.');
 if(gain>0&&parts.schedule/total>.5)flags.unshift('Выигрыш в основном из календаря (у нового клуба больше матчей в периоде): после периода преимущество исчезнет.');
 const level=confidence>=CONFIDENT?'CONFIDENT':confidence>=DOUBTFUL?'MODERATE':'DOUBTFUL';
 return {gain,sd,confidence,level,parts,flags:[...new Set(flags)],sides};
}
// The FBL formula on an ESPN box-score line: Sports.ru's without the team result bonus (the league scores on Yahoo,
// which cannot award it). A line with stats is an appearance (+1 even with zero minutes shown); ESPN leaves the stats of
// a DNP empty.
export function boxScorePoints(stats){
 const n=v=>Number(v)||0,split=v=>String(v||'0-0').split('-').map(Number);
 const [fgm,fga]=split(stats.FG),[ftm,fta]=split(stats.FT),min=n(stats.MIN);
 if(!Object.keys(stats||{}).length)return null;
 return n(stats.PTS)+n(stats.REB)+n(stats.AST)+n(stats.STL)+n(stats.BLK)-(fga-fgm)-(fta-ftm)-2*n(stats.TO)-n(stats.PF)+(min>=10?2:1);
}
const LINE=['MIN','PTS','REB','AST','STL','BLK','FG','3PT','FT','TO','PF'];
// ESPN summary -> {espnAthleteId: {points, minutes, final, counting, name, team, line}}.
export function liveGamePoints(summary,event){
 const final=Boolean(event?.status?.type?.completed),out={};
 for(const team of summary?.boxscore?.players||[]){
  for(const st of team.statistics||[]){
   const labels=st.labels||st.names||[];
   for(const a of st.athletes||[]){
    if(!a.stats?.length||a.didNotPlay)continue;const stats=Object.fromEntries(labels.map((l,i)=>[l,a.stats[i]]));
    const points=boxScorePoints(stats),minutes=Number(stats.MIN)||0;
    // counting: the line without the participation bonus, which follows the exact minutes when Sports.ru lists them.
    // line: the box-score stats the formula reads, for the live stat line; name and team for the full game list.
    if(points!==null)out[String(a.athlete?.id)]={points,minutes,final,counting:points-(minutes>=10?2:1),
     name:a.athlete?.displayName||a.athlete?.shortName||'',team:team.team?.abbreviation||'',line:Object.fromEntries(LINE.filter(k=>k in stats).map(k=>[k,stats[k]]))};
   }
  }
 }
 return out;
}
// Sports.ru lists a game as played with 0 points until it counts it, hours after the final whistle. Games ESPN covers
// (yesterday and today, US Eastern) are therefore scored at once by the league's formula on the ESPN box score — the
// categories Yahoo counts — with Sports.ru's exact minutes for the 10-minute bonus when it lists them. A game still
// running is left to the running points: its Sports.ru row does not count until the final whistle.
const tipDay=iso=>new Date(Date.parse(iso)+3*3600e3).toISOString().slice(0,10);
export function withBoxScores(live,games,players){
 if(!live?.players||!games?.length)return live;
 const byEspn=new Map(players.filter(p=>p.espnId&&p.sportsId).map(p=>[String(p.espnId),String(p.sportsId)]));
 const out={...live,players:{...live.players}};let changed=false;
 for(const g of games){
  if(!g.points||g.state==='pre')continue;const day=tipDay(g.date);
  for(const [eid,x] of Object.entries(g.points)){
   const sid=byEspn.get(eid),info=sid&&out.players[sid];if(!info||!Number.isFinite(x.counting))continue;
   const rows=[...(info.games||[])],i=rows.findIndex(o=>o.date===day),row=i>=0?rows[i]:null;let next;
   if(g.final){
    const exact=/^\d+:\d{2}$/.test(String(row?.minutes??''))&&clockMinutes(row.minutes)>0?clockMinutes(row.minutes):x.minutes;
    next={...(row||{date:day}),minutes:row&&exact!==x.minutes?row.minutes:String(x.minutes),points:x.counting+(exact>=10?2:1),played:true,source:'ESPN',...(row?{sportsRowPoints:row.points}:{})};
   }else if(row?.played)next={...row,played:false,running:true};
   else continue;
   if(row)rows[i]=next;else{rows.push(next);rows.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);}
   out.players[sid]={...info,games:rows};changed=true;
  }
 }
 return changed?out:live;
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
  // Sports.ru lists rows of one date in no stable order: within a date, roster picks (no sale) come before transfers.
  const t=Number(key),draft=rosters[t].map(id=>shortName(byId.get(id),live));
  const journal=(team.journal||[]).map((row,i)=>({row,i})).sort((a,b)=>a.row.date.localeCompare(b.row.date)||(a.row.sell?1:0)-(b.row.sell?1:0)||a.i-b.i).map(x=>x.row);
  // The draft is the first time the journal's roster equals the FBL draft; a team that later trades back to exactly its
  // draft roster must not hide those transfers.
  let names=[],start=-1;
  journal.forEach((row,i)=>{if(row.sell){const j=names.indexOf(row.sell.name);if(j>=0)names.splice(j,1);}if(row.buy)names.push(row.buy.name);if(start<0&&sameNames(names,draft))start=i;});
  if(start<0){
   warnings.push({team:t,message:'Состав на Sports.ru ни разу не совпал с драфтом FBL: трансферы взяты по датам после драфта.'});
   start=journal.reduce((m,row,i)=>row.date<=DRAFT_DATE?i:m,-1);
  }
  journal.slice(start+1).forEach((row,i)=>events.push({t,row,i}));
 }
 // Across teams, a date's transfers go in the order the watcher saw them (rows it never timed first), not by team: the
 // first buyer of a player must come first.
 events.sort((a,b)=>a.row.date.localeCompare(b.row.date)||(a.row.seenAt||'').localeCompare(b.row.seenAt||'')||a.t-b.t||a.i-b.i);
 const out=[],bySid=new Map(players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p]));
 // Within a team's day Sports.ru's order is not stable: a row may sell a player a later-listed row buys, or buy one a
 // later-listed row sells. Such a row moves behind the team's last row of that day, as many times as the day has rows
 // (enough for any order of a package); a row still impossible then is dropped.
 const queue=[...events],day=e=>`${e.t}|${e.row.date}`,size=new Map();for(const e of events)size.set(day(e),(size.get(day(e))||0)+1);
 for(let i=0;i<queue.length;i++){
  const e=queue[i],{t,row}=e;
  if(!row.buy||!row.sell){warnings.push({team:t,message:`${row.date}: запись без пары покупка/продажа (${row.buy?.name||row.sell?.name}).`});continue;}
  const roster=rosters[t];
  const held=new Set((live?.teams?.[t]?.roster||[]).map(r=>r.sportsId)),gone=p=>held.size&&held.has(p.sportsId)?1e7:0;
  // The watcher pinned the exact players when it first saw the row (sellSid, buySid); names only when it could not.
  const pinnedOut=row.sellSid&&bySid.get(String(row.sellSid)),pinnedIn=row.buySid&&bySid.get(String(row.buySid));
  const outs=pinnedOut&&roster.includes(pinnedOut.id)?[pinnedOut]:roster.map(id=>byId.get(id)).filter(p=>p&&shortName(p,live)===row.sell.name).sort((a,b)=>gone(a)+Math.abs(priceOf(a,live)-row.sell.price)-gone(b)-Math.abs(priceOf(b,live)-row.sell.price));
  // The bought player is still here (pinned, or by name other than the one leaving): a later row of the day sells him.
  const kept=roster.some(id=>id!==outs[0]?.id&&(pinnedIn?id===pinnedIn.id:shortName(byId.get(id),live)===row.buy.name));
  if(!outs.length||kept||(pinnedOut&&!roster.includes(pinnedOut.id))){
   const last=queue.findLastIndex(x=>day(x)===day(e));
   if(last>i&&(e.moves||0)<size.get(day(e))){queue.splice(last+1,0,{...e,moves:(e.moves||0)+1});continue;}
  }
  if(!outs.length){warnings.push({team:t,message:`${row.date}: продан ${row.sell.name}, но его нет в составе.`});continue;}
  const leaving=outs[0],pos=positionOf(leaving,live),now=new Set((live?.teams?.[t]?.roster||[]).map(r=>r.sportsId));
  // The roster JSON names the exact player a team holds today; then the journal's price matching his price, then position
  // and the price gap break remaining ties. Another FBL team holding him is no evidence: Sports.ru allows shared players.
  const score=p=>(now.size&&!now.has(p.sportsId)?1e7:0)+(priceOf(p,live)===row.buy.price?0:1e6)+(positionOf(p,live).some(x=>pos.includes(x))?0:1e5)+Math.abs(priceOf(p,live)-row.buy.price);
  const ins=pinnedIn&&!roster.includes(pinnedIn.id)?[pinnedIn]:players.filter(p=>p.sportsId&&!roster.includes(p.id)&&shortName(p,live)===row.buy.name).sort((a,b)=>score(a)-score(b));
  if(!ins.length){warnings.push({team:t,message:`${row.date}: куплен ${row.buy.name}, игрок не найден в базе.`});continue;}
  if(!pinnedIn&&ins.length>1&&score(ins[0])===score(ins[1]))warnings.push({team:t,message:`${row.date}: ${row.buy.name} неоднозначен, выбран ${ins[0].name} (${ins[0].team}).`});
  const joining=ins[0];
  roster[roster.indexOf(leaving.id)]=joining.id;
  out.push({team:t,outId:leaving.id,inId:joining.id,date:row.date,outPrice:row.sell.price,inPrice:row.buy.price,source:'sports.ru',
   // The journal's own words, which never change when a name resolves differently: what «already reported» matches on.
   outName:row.sell.name,inName:row.buy.name,...(row.seenAt?{seenAt:row.seenAt}:{}),...(row.seenAfter?{seenAfter:row.seenAfter}:{})});
 }
 return {transfers:out,warnings,teams:new Set(Object.keys(live?.teams||{}).map(Number))};
}
// The two journal events of a deal, in the journal's own words (short name and price): what «already reported» matches
// on, so a deal is never reported twice when Sports.ru re-pairs a day's rows or a short name resolves to another player.
export const dealEvents=x=>[`${x.team}|${x.date}|out|${x.outName??x.outId}|${x.outPrice}`,`${x.team}|${x.date}|in|${x.inName??x.inId}|${x.inPrice}`];
// Transfers not yet reported. `events` is the multiset of reported deal events (each reported deal adds its two, so a deal
// repeated the same day needs its own); a state from before events were kept gives the keys (team:out>in:date) of the
// reported deals instead, matched by resolved ids.
export function unreported(transfers,keys=[],events=null){
 const pool=new Map(),put=k=>pool.set(k,(pool.get(k)||0)+1),take=k=>{const n=pool.get(k)||0;if(n>0){pool.set(k,n-1);return true;}return false;};
 const idEvents=x=>[`${x.team}:${x.date}:out:${x.outId}`,`${x.team}:${x.date}:in:${x.inId}`];
 if(events)for(const e of events)put(e);
 else for(const k of keys){const m=String(k).match(/^(\d+):(.+)>(.+):(\d{4}-\d{2}-\d{2})$/);if(!m)continue;put(`${m[1]}:${m[4]}:out:${m[2]}`);put(`${m[1]}:${m[4]}:in:${m[3]}`);}
 const fresh=new Set();
 for(const x of transfers){
  const [out,inn]=events?dealEvents(x):idEvents(x);
  if((pool.get(out)||0)>0&&(pool.get(inn)||0)>0){take(out);take(inn);}
  else fresh.add(x);
 }
 return fresh;
}
// Every sale and purchase the journals hold, in dealEvents' words: the reported events can never be more than these (a
// surplus, left by Sports.ru re-pairing rows under an older state, would swallow a new identical deal).
export const journalEvents=live=>Object.entries(live?.teams||{}).flatMap(([t,team])=>(team.journal||[]).flatMap(r=>[
 ...(r.sell?[`${t}|${r.date}|out|${r.sell.name}|${r.sell.price}`]:[]),...(r.buy?[`${t}|${r.date}|in|${r.buy.name}|${r.buy.price}`]:[])]));
export function capEvents(events,allowed){
 const left=new Map();for(const e of allowed)left.set(e,(left.get(e)||0)+1);
 return events.filter(e=>{const n=left.get(e)||0;if(n>0)left.set(e,n-1);return n>0;});
}
// The reported events of a state: kept ones, or, for a state from before they were kept, once, on the first run after
// the update: those of every deal seen before the state was last saved (a post saves the state at once, so a deal seen
// later was never posted, and every deal seen earlier was handled). The keys name resolved players, which a better
// resolution of a short name or a re-paired day changes, so they decide only for a state without that time.
export function reportedEvents(transfers,state){
 if(Array.isArray(state?.events))return [...state.events];
 const saved=Date.parse(state?.updatedAt);
 if(Number.isFinite(saved))return transfers.filter(x=>!x.seenAt||Date.parse(x.seenAt)<=saved).flatMap(dealEvents);
 const open=unreported(transfers,state?.reported||[]);
 return transfers.filter(x=>!open.has(x)).flatMap(dealEvents);
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
