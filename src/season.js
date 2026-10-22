import solver from 'javascript-lp-solver';
import {rosterFits,POSITIONS,TEAM_COUNT,DEFAULT_CAP,CLUB_LIMIT as RULE_CLUB_LIMIT} from './engine.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';
import {FBL_TRANSFERS,TRANSFER_HOURS,mskTime,firstHolder} from './rules.js';
import CALIBRATION from '../data/inseason-calibration.json' with {type:'json'};
import LENGTHS from '../data/availability-lengths.json' with {type:'json'};
import RULES from '../data/league-rules.json' with {type:'json'};
import {GAME_PLAYED,fblFormula} from './fbl-scoring.js';
import {plural} from './format.js';
import {teamName} from './teams.js';

export const CAP=DEFAULT_CAP,WEEKLY_TRANSFERS=3,CLUB_LIMIT=RULE_CLUB_LIMIT;
export {TEAM_COUNT};
// Sports.ru posts its calendar and fantasy weeks in Moscow dates.
export function moscowToday(now=Date.now()){return new Date(now+3*3600e3).toISOString().slice(0,10);}
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// When a game tipped off: the ESPN start time the collector stores (g.tip, UTC), else a guess from its Moscow date. US
// evening games tip 02:00-05:30 MSK of the date Sports.ru files them under, before the transfer window opens at 08:00;
// the opening day's only game came 30 minutes after Sports.ru's first deadline (players lock 30 minutes before a game).
const OPENER=Date.parse(FBL_TRANSFERS?.countFrom)+30*60e3,OPENING_DAY=Number.isFinite(OPENER)?moscowToday(OPENER):null;
export const tipOf=g=>g.tip?Date.parse(g.tip):g.date===OPENING_DAY?OPENER:Date.parse(g.date+'T02:00:00+03:00');
// The US Eastern day of a game, the one ESPN's injury return dates use (UTC-5: no game tips in the hour daylight time moves).
const usDay=g=>new Date(tipOf(g)-5*3600e3).toISOString().slice(0,10);
// A Sports.ru week is Monday to Sunday in US game days, which the Moscow-dated calendar shows as Tuesday to Monday.
// Without the published weeks this Tuesday-start week is the fallback.
export function weekStart(day){const d=new Date(day+'T00:00:00Z');return addDays(day,-((d.getUTCDay()+5)%7));}
// Game weeks from the week number of every calendar game, oldest first: each runs from the day after the previous week's
// last game to its own last game, so breaks (All-Star, NBA Cup) belong to the week that follows. A game moved past a
// later week's first game keeps its number but does not stretch its week over the next ones.
export function gameWeeks(live){
 const dates=new Map();
 for(const games of Object.values(live?.clubs||{}))for(const g of games)if(Number.isFinite(g.week))(dates.get(g.week)||dates.set(g.week,[]).get(g.week)).push(g.date);
 if(!dates.size)return live?.weeks||{};
 const order=[...dates.keys()].sort((a,b)=>a-b),first=order.map(n=>dates.get(n).reduce((m,d)=>d<m?d:m)),next=[],out={};let prev=null;
 for(let i=order.length-1,m='9999-12-31';i>=0;i--){next[i]=m;if(first[i]<m)m=first[i];}
 order.forEach((n,i)=>{const end=dates.get(n).reduce((m,d)=>d<=next[i]&&d>m?d:m,'')||first[i],start=prev?addDays(prev,1):first[i];
  out[n]={start:start<=end?start:end,end};prev=end;});
 return out;
}
const weekCache=new WeakMap(),weeksOf=live=>{const k=live?.clubs;if(!k)return gameWeeks(live);if(!weekCache.has(k))weekCache.set(k,gameWeeks(live));return weekCache.get(k);};
// Sports.ru numbers its tours by US game day, the calendar dates games in Moscow: a US-afternoon game of a tour's first
// day (MLK day, 18.01.2027) carries the previous tour's last Moscow date. Such a game counts on its own tour's first date.
export function tourDate(g,weeks){const w=Number.isFinite(g?.week)?weeks?.[g.week]:null;return w&&g.date<w.start?w.start:g.date;}
// Period windows (week and season facts) from the tours. Sports.ru's calendar lists only games still to come: a played
// game drops out of it with the start of its tour (the collector keeps them from 21.10, the opening night's are gone).
// Tour 1 therefore opens at the league's scoring start, 20.10 (data/league-rules.json yahoo.scoringStart, Yahoo keeps
// the FBL standings), and tours missing before the first listed one are rebuilt as Tuesday-Monday weeks (Moscow dates)
// back to it, the first listed tour starting on its Tuesday. Sports.ru's own tours (transfer counting) stay as they are.
export const SCORING_START=RULES.yahoo?.scoringStart||null;
export function periodList(weeks,start=SCORING_START){
 const list=Object.entries(weeks||{}).map(([n,w])=>({n:Number(n),...w})).sort((a,b)=>a.start.localeCompare(b.start));
 if(!list.length||!start)return list;
 const first=list[0];
 if(!(first.n>1)){if(start<first.start)list[0]={...first,start};return list;}
 const from=weekStart(first.start);list[0]={...first,start:from>start?from:start};
 for(let n=first.n-1,end=addDays(list[0].start,-1);n>=1&&end>=start;n--){
  const s=n===1?start:weekStart(end),w={n,start:s>start?s:start,end};list.unshift(w);end=addDays(w.start,-1);
 }
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
// The moment of a move: when the watcher first saw it (seenAt), else when that day's transfer window opened.
const movedAt=(day,at)=>at?Date.parse(at):Date.parse(`${day}T${TRANSFER_HOURS.from}:00+03:00`);
const startOf=s=>movedAt(s.from,s.fromAt),endOf=s=>s.to?movedAt(s.to,s.toAt):Infinity;
// A game is played after a move made on `day` when it is filed under a later date or tipped off after the move: a game of
// the move's own Moscow date was nearly always over before the window opened (see tipOf).
const after=(g,day,at)=>g.date>day||(g.date===day&&tipOf(g)>=movedAt(day,at));
const holds=(g,s)=>after(g,s.from,s.fromAt)&&(!s.to||!after(g,s.to,s.toAt));
// Who scored for whom: each holding of a player by a team, from the move that brought him (from: its Moscow date,
// fromAt: when the watcher saw it) to the move that sent him away (to, toAt); a draft holding starts before every game.
// Keyed by team and player: two teams may hold the same player (Sports.ru allows it). Such a player scores only for the
// team that had him first (league owner, 21.10.2026; the order is rules.js firstHolder's): the later holding lists the
// earlier one in `shadowedBy` and scores nothing while it lasts. When the watcher cannot tell who bought first, both keep
// his points and both holdings carry `doubt` (the other teams) for the lawyer's check.
export function stints(transfers=[],picks=DRAFT_PICKS){
 const k=(team,id)=>`${team}:${id}`,since=new Map(),left=new Map(),done=[];
 const open=new Map(picks.map((id,i)=>{const s={team:i%TEAM_COUNT,playerId:id,from:DRAFT_DATE,fromAt:null,to:null,toAt:null};since.set(s,{i:-1});return [k(s.team,id),s];}));
 transfers.forEach((x,i)=>{
  const s=open.get(k(x.team,x.outId));
  if(s){s.to=x.date;s.toAt=x.seenAt||null;done.push(s);open.delete(k(x.team,x.outId));left.set(k(x.team,x.outId),{date:x.date,since:since.get(s)});}
  // A sale and a buy-back on one day keep the holding's start: Sports.ru confirms a day's transfers as one package.
  const back=left.get(k(x.team,x.inId)),t={team:x.team,playerId:x.inId,from:x.date,fromAt:x.seenAt||null,to:null,toAt:null};
  since.set(t,back?.date===x.date?back.since:{i,x});open.set(k(x.team,x.inId),t);
 });
 const all=[...done,...open.values()],by=new Map();
 for(const s of all)by.set(s.playerId,[...(by.get(s.playerId)||[]),s]);
 for(const list of by.values())for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++){
  const A=list[a],B=list[b];if(A.team===B.team||!(startOf(A)<endOf(B)&&startOf(B)<endOf(A)))continue;
  const order=firstHolder(since.get(A),since.get(B));
  if(order==='same'){(A.doubt||=[]).push(B.team);(B.doubt||=[]).push(A.team);}
  else{const [first,later]=order==='before'?[A,B]:[B,A];(later.shadowedBy||=[]).push(first);}
 }
 return all;
}
// Whether a holding scores a game: played after the move that began it, before the one that ended it, and not while
// another FBL team that had the player first holds him. The league table, team and player facts all use it.
export const inStint=(g,s)=>holds(g,s)&&!s.shadowedBy?.some(a=>holds(g,a));
// A holding that scores nothing now: another FBL team had the player first and still holds him.
export const shadowed=s=>Boolean(s.shadowedBy?.some(a=>!a.to));
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

// A played game's FBL points, or null when they are not known: the league's Yahoo formula on the game's own box score,
// which the collector reads from Sports.ru's table (pointsSource 'BOX') and withBoxScores from ESPN's (source 'ESPN').
// A row without readable box columns ('NO_BOX') or with Sports.ru's result bonus in it ('SPORTS_WITH_BONUS') is a game
// played whose points are unknown: Sports.ru's ФО is never FBL points. A row without a source (an older snapshot) counts.
const NOT_FBL=new Set(['NO_BOX','SPORTS_WITH_BONUS']);
export const fblPoints=g=>Number.isFinite(g?.points)&&(g.source==='ESPN'||!NOT_FBL.has(g.pointsSource))?g.points:null;
// Points per game: the pre-season full-formula forecast updated by the games played, as they arrive (each game's FBL
// points, fblPoints: a game whose points are not known yet is left out of the update, not read as 0).
// Weights come from scripts/inseason_calibration.py (fitted 2023/24->2024/25 on squared error, tested on 2025/26), which
// tests/fixtures/inseason-golden.json pins this function to: counting points (the formula without its +1 participation
// term) per minute move slowly, minutes move faster and favour recent games, newcomers adapt fastest; the participation
// term is shrunk like minutes, never scaled by them. Early games run below the rest of a season (players ramp up), so each
// game is lifted by its place in the season (offsets measured on the previous season), or the update would run low.
export const PRIOR_GAMES=10;
export {CALIBRATION};
export const clockMinutes=v=>{const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:Math.max(0,Number(v)||0);};
const newcomer=p=>p.isRookie===true||['EMPIRICAL_ROLE_PRIOR','DRAFT_PICK_MODEL','UNDRAFTED_ROOKIE_MODEL','SPORTS_PRICE_PRIOR'].includes(p.forecast?.origin);
// One point per game played, whatever the minutes (Yahoo league settings, 21.10.2026).
const participation=()=>GAME_PLAYED;
export function perGame(player,live,points=CALIBRATION.points){
 const prior=Number.isFinite(player.forecast?.meanPerGame)?player.forecast.meanPerGame:Number.isFinite(player.projectedFP)?player.projectedFP:0;
 const all=(live?.games||[]).filter(g=>g.played),played=all.filter(g=>fblPoints(g)!==null).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))),sum=played.reduce((s,g)=>s+g.points,0);
 // unscored: games played whose FBL points are not known (they still count as games played for playRate).
 const out={prior,games:played.length,average:played.length?sum/played.length:null,unscored:all.length-played.length};
 const priorMinutes=player.forecast?.minutes,minutes=played.map(g=>clockMinutes(g.minutes));
 // Without minutes on both sides only the plain average can be shrunk. A real 0 (an ESPN line of a few seconds, MIN '0')
 // is minutes, as Sports.ru's '00:04' is: one cameo must not switch the estimator for the whole season.
 if(!played.length||!(priorMinutes>0)||played.some(g=>String(g.minutes??'').trim()===''))return {...out,value:(PRIOR_GAMES*prior+sum)/(PRIOR_GAMES+played.length)};
 const c=points[newcomer(player)?'newcomer':'established'],n=minutes.length,o=points.offsets,scale=o?c.offsetScale||0:0;
 const lift=(xs,i)=>scale*xs[o.buckets.findIndex(([a,b])=>i>=a&&(b==null||i<=b))];
 const part=Number.isFinite(player.forecast?.components?.participation)?player.forecast.components.participation:participation(priorMinutes);
 const w=minutes.map((_,i)=>c.minuteHalfLife?.5**((n-1-i)/c.minuteHalfLife):1),weight=w.reduce((s,x)=>s+x,0);
 const mins=minutes.map((m,i)=>scale?m+lift(o.minutes,i+1):m),counts=played.map((g,i)=>g.points-participation(minutes[i])+(scale?lift(o.counting,i+1):0));
 const expectedMinutes=(c.minuteGames*priorMinutes+mins.reduce((s,m,i)=>s+w[i]*m,0))/(c.minuteGames+weight);
 const bonus=(c.minuteGames*part+minutes.reduce((s,m,i)=>s+w[i]*participation(m),0))/(c.minuteGames+weight);
 const rate=(c.rateGames*(prior-part)+counts.reduce((s,x)=>s+x,0))/(c.rateGames*priorMinutes+mins.reduce((s,m)=>s+m,0));
 return {...out,minutes:expectedMinutes,value:rate*expectedMinutes+bonus};
}
// Share of team games a player plays: his forecast of games, updated by games played and missed so far. The forecast is
// already fitted, so it is not floored (scripts/inseason_calibration.py's [.5,.97] clamp regularises its raw previous-
// season prior; it counted a 16-game forecast as 41 games, +100-240 FP a season). Missed games count against the club calendar
// too, in case Sports.ru lists only appearances.
// The report alone removes the games until his return (injuryFactor), so the share for the games after it must not count
// that absence again. An absence the build knew (forecast.knownAbsence, ESPN's dated return) is already out of
// forecast.games, which covers only the games it leaves (the mean of ESPN's and the model's, owner decision 4): while a
// report keeps him out the share is games/gamesLeft (a rookie's model games are cut by the block too). Once none does
// (ESPN cleared him early, or only a day-to-day entry is left; the next build drops the block) the blocked games still
// ahead, the club's games left beyond gamesLeft, come back at his report-free share (unconditionalGames/82). Spread over
// them, the post-return share of a short window overstated the rest of the season (21.10 build, report cleared:
// DiVincenzo, 5 of 5 games after an April return, 79.5 games against 61.7 report-free, now 63.0; Mark Williams 61.4, now
// 55.8). For a report the build did not see the prior is never below the model's own games (which never see the report; a forecast under them has
// priced the absence in, as ESPN's totals for known long injuries do). The current run of missed games counts at most
// CALIBRATION.availability.spellMisses while a report (or the build's block) covers it, fitted at the first game back;
// once he has played again his latest spell of spellGames+ misses keeps counting at most spellMissesAfterReturn
// (spellMisses until that is fitted), no report needed: counted in full, the share fell by about 40% the day he came
// back, and replayed on 2023-26 the share after a return is closer capped (2025/26: MAE 0.264 -> 0.245, t+1..t+40).
export function playRate(player,live,ctx){
 const f=player.forecast,injury=ctx?.injuries?.get?.(String(player.espnId)),ending=Boolean(injury)&&seasonEnding(injury),out=Boolean(injury)&&keptOut(injury)&&!ending;
 const ka=f?.knownAbsence,left=ka?.gamesLeft>0&&Number.isFinite(f?.games)?ka.gamesLeft:0,today=ctx?.today,key=live?.club||player.sportsClub;
 const free=f?.availability?.unconditionalGames??ka?.unconditionalGames??f?.sources?.model?.games;
 const blocked=left&&!out&&!ending&&Number.isFinite(free)?Math.max(0,seasonCalendar(ctx?.live,key).filter(x=>!(x.score||x.gone)&&(!today||x.date>=today)).length-left):0;
 const g=left?82*(f.games+(blocked?free*blocked/82:0))/(left+blocked):out&&Number.isFinite(free)?Math.max(Number.isFinite(f?.games)?f.games:0,free):f?.games;
 const prior=Number.isFinite(g)?Math.min(.97,Math.max(.01,g/82)):.85;
 const rows=(live?.games||[]).filter(x=>x.played||today&&x.date<today),on=rows.filter(x=>x.played).length;
 const club=ctx?.live?.clubs?.[key]||[],finished=club.filter(x=>x.score&&(!today||x.date<=today));
 let team=Math.max(rows.length,finished.length,on);const {priorGames:k,spellMisses:cap,spellGames:spell}=CALIBRATION.availability,back=CALIBRATION.availability.spellMissesAfterReturn??cap;
 if(Number.isFinite(cap)){
  const seen=new Set(rows.filter(x=>x.played).map(x=>x.date)),last=[...seen].reduce((m,d)=>d>m?d:m,'');
  const run=Math.max(finished.filter(x=>x.date>last).length,rows.filter(x=>!x.played&&x.date>last).length);
  // Misses before his last game, over the club's finished games and his listed rows (a traded player's old club too).
  let r=0,spellRun=0;
  if(last){for(const d of [...new Set([...finished,...rows].map(x=>x.date))].filter(d=>d<last).sort()){if(seen.has(d)){if(r>=spell)spellRun=r;r=0;}else r++;}if(r>=spell)spellRun=r;}
  const excess=(injury?!ending:left)?run-Math.min(run,cap):0;
  team=Math.max(on,team-excess-(spellRun-Math.min(spellRun,back)));
 }
 return (k*prior+on)/(k+team);
}
// Chance to play each of the next n club games for a player available now: the absence chain (short and long spells
// with the player's hazards, league spell lengths) scaled so that over a season it plays `share` of the games. A healthy
// player plays the next games more often than his season share, because long absences have not started yet; replayed on
// 2025/26 (audit, 21.10.2026) the chain runs 1-2 points of share high over a week or a month and about 3 over the rest of a
// season, still closer than the flat share. Hazards that cannot reach the share (zero after rounding in the database) give
// the flat share.
const curves=new Map();
function chainCurve(h,share,n){
 const flat=()=>Array(n).fill(share);
 if(!(h[0]+h[1]>0))return flat();
 const key=`${h[0]},${h[1]},${share.toFixed(3)}`;let c=curves.get(key);
 if(c===undefined){
  const run=(m,len)=>{const hs=h[0]*m,hl=h[1]*m,stay=Math.max(0,1-hs-hl),out=[];let p=new Float64Array(LENGTHS.longLengths.length);p[0]=1;
   for(let j=0;j<len;j++){const a=p[0],q=new Float64Array(p.length);out.push(a*stay);for(let r=1;r<p.length;r++)q[r-1]=p[r];q[0]+=a*stay;
    for(let k=1;k<p.length;k++)q[k-1]+=a*(hs*(LENGTHS.shortLengths[k]||0)+hl*LENGTHS.longLengths[k]);p=q;}
   return out;};
  const mean=m=>run(m,82).reduce((s,x)=>s+x,0)/82;let lo=-6,hi=6;
  if(mean(Math.exp(hi))>=share||mean(Math.exp(lo))<=share)c=null;
  else{for(let i=0;i<22;i++){const m=(lo+hi)/2;if(mean(Math.exp(m))>share)lo=m;else hi=m;}c=run(Math.exp((lo+hi)/2),82);}
  curves.set(key,c);
 }
 return c?Array.from({length:n},(_,j)=>c[Math.min(j,c.length-1)]):flat();
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
// The season tag of ESPN comments ("2026-27"), from the draft's year.
const YEAR=Number(DRAFT_DATE.slice(0,4)),SEASON=`${YEAR}-${String(YEAR+1).slice(2)}`;
// An injury report that keeps the player out (not a game-time decision).
const keptOut=injury=>/out|suspension/i.test(String(injury?.status||''))&&String(injury?.fantasyStatus||'')!=='GTD';
// ESPN marks a season-ending injury OFS, or keeps OUT with a placeholder return date and says it only in the comment:
// "will miss the remainder of the (regular) season", "is out for the season", "has sustained a season-ending ruptured
// Achilles". Not "the season opener" (finale, series, debut) or "the start of the season", and not an injury of his
// past: "season-ending" counts only after sustain/suffer/undergo/underwent/require/need ("the season-ending surgery he
// underwent in March" is his history), and a part of the comment (a sentence, or a part between commas) naming an earlier
// season or year ("last season", "a year ago", "2025", "2025-26") or saying he "missed the rest of"/"was out for" it is
// skipped. One false match zeroes his season everywhere. scripts/projection_model.py absence() must read the same words.
const OVER=new RegExp(`\\bout for (the )?(${SEASON} )?(regular[- ])?season\\b(?![- ](opener|finale|series|debut))|\\b(sustain|suffer|undergo|underwent|require|need)\\w*\\s+(an?\\s+)?season[- ]ending\\b|\\bmiss the (entire |rest of the |remainder of the )?(${SEASON} )?(regular[- ])?season\\b(?![- ](opener|finale|series|debut))|\\b(remainder|rest|entirety|balance) of the (${SEASON} )?(regular[- ])?season\\b(?![- ](opener|finale|series|debut))`,'i');
const PAST=/\b(last|previous|past) (season|year|campaign)\b|\ba year ago\b|\bmissed (all |most |much )?(of )?the (entire|rest|remainder|entirety|balance)\b|\bwas out for\b/i;
const earlier=part=>PAST.test(part)||[...part.matchAll(/\b(20\d\d)\b/g)].some(m=>Number(m[1])<YEAR);
export const seasonEnding=injury=>String(injury?.fantasyStatus||'')==='OFS'||keptOut(injury)&&String(injury?.comment||'').split(/[.;!?](?:\s|$)|,\s/).some(s=>OVER.test(s)&&!earlier(s));
// Chance to play a game given the ESPN injury report. `day` is the game's US day (usDay), the calendar of ESPN's return
// dates; today is the Moscow date, usToday the US day now (from 00:00 MSK until the US evening ends it is the day before).
// Season-ending: no game, whatever placeholder date ESPN shows. Out with a return date: no game before it (without one:
// none for 10 days). Day-to-day: ESPN's return date is the doubtful game itself, so the games up to it count half
// (without a date, or with one already past in US days, those of the next 3 days do).
export function injuryFactor(injury,day,today,usToday=today){
 if(!injury)return 1;
 if(seasonEnding(injury))return 0;
 const back=injury.returnDate?String(injury.returnDate).slice(0,10):null;
 if(keptOut(injury))return back?(day<back?0:1):(day<addDays(today,10)?0:1);
 return day<=(back&&back>=usToday?back:addDays(usToday,2))?.5:1;
}
// The NBA adds each club's last 2 of 82 games after the NBA Cup group stage; until Sports.ru lists them the calendar has
// 80 and the season horizon misses 2.4% of every player's games. They are counted in the club's longest December break,
// where the Cup knockout days are (no week, no score: they never show as real games), and stop once Sports.ru lists them.
export const SEASON_GAMES=82;
const filled=new WeakMap();
export function seasonCalendar(live,club){
 const games=live?.clubs?.[club]||[],missing=SEASON_GAMES-games.length;
 if(missing<=0||missing>2)return games;
 if(filled.has(games))return filled.get(games);
 const dates=games.map(g=>g.date).sort(),span=([a,b])=>(Date.parse(b)-Date.parse(a))/864e5;
 const gap=dates.slice(1).map((b,i)=>[dates[i],b]).filter(([a])=>a.slice(5,7)==='12').reduce((m,x)=>!m||span(x)>span(m)?x:m,null);
 const out=gap&&span(gap)>missing?[...games,...Array.from({length:missing},(_,i)=>({date:addDays(gap[0],Math.round(span(gap)*(i+1)/(missing+1))),placeholder:true}))]:games;
 filled.set(games,out);return out;
}
// Share of a running game still to play: from ESPN's clock on it ("8:22 - 3rd", "Halftime", "End of 1st", "2:00 - OT";
// 48 regulation minutes), else from the minutes he has played against those he is expected to play; none of a final.
function gameLeft(run,minutes){
 const d=String(run?.game?.detail||'').trim();let m;
 if(run?.final||run?.game?.final)return 0;
 if(/half/i.test(d))return .5;
 if((m=d.match(/^End of (\d)(st|nd|rd|th)\b/i)))return Math.max(0,4-m[1])/4;
 if((m=d.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)\s*-\s*(\d*)(st|nd|rd|th|OT)$/i))){const clock=(m[1]?Number(m[1]):0)+m[2]/60;return /OT/i.test(m[4])?clock/48:Math.max(0,(4-m[3])*12+clock)/48;}
 return minutes>0?Math.max(0,1-clockMinutes(run?.minutes)/minutes):0;
}
// Expected official points between two dates (inclusive), counting only club games not yet played: a game is done once
// the calendar has its score or marks it gone (dropped from Sports.ru's calendar), its day has passed, Sports.ru lists it
// for the player, it is running (ctx.running), or it has tipped off by ctx.now (a time, when given: such a game can no
// longer be gained by a move). A game counts in the window of its Sports.ru tour (tourDate). Each game counts with the
// injury report's factor times the chain's chance to be available that many healthy games on (counted from today, or
// from the return of an injured player); without hazards (rookies, market players) it is the flat season share.
// A game he is playing now (ctx.running, which the standings and the team forecast pass with its points so far; transfer
// gains never do, a move cannot gain it) adds the rest of it: his counting points per game times the share still to
// play, the game point being in the running points already. It is not a game left. clubGames: the club games left in
// the window, the same ones (what the share of games he plays is read against).
export function expectedPoints(player,ctx,from,to){
 const live=ctx.live?.players?.[player.sportsId],club=live?.club||player.sportsClub,calendar=seasonCalendar(ctx.live,club),weeks=weeksOf(ctx.live);
 const share=playRate(player,live,ctx),pg=perGame(player,live),value=pg.value,injury=ctx.injuries?.get(String(player.espnId));
 const run=ctx.running?.get(player.id),done=new Set((live?.games||[]).map(x=>x.date)),running=run?.day,h=player.forecast?.availability?.hazards;
 const ahead=calendar.filter(g=>!(g.score||g.gone||(ctx.today&&g.date<ctx.today)||done.has(g.date)||g.date===running||ctx.now&&tipOf(g)<=ctx.now)).sort((a,b)=>a.date<b.date?-1:1);
 // ESPN's return dates are US days. The US day now: from ctx.now when given; else the Moscow date, or the day before
 // while a US evening game filed under today's Moscow date has no score yet (from 00:00 MSK until its result is in).
 const usToday=!injury?ctx.today:ctx.now?new Date(ctx.now-5*3600e3).toISOString().slice(0,10):ctx.today&&calendar.some(g=>g.date===ctx.today&&!g.score&&!g.gone&&usDay(g)<g.date)?addDays(ctx.today,-1):ctx.today;
 const curve=Array.isArray(h)?chainCurve(h,share,ahead.length):null;
 let games=0,points=0,healthy=0,clubGames=0;
 for(const g of ahead){
  const day=tourDate(g,weeks),inside=day>=from&&day<=to;if(inside)clubGames++;
  const f=injury?injuryFactor(injury,usDay(g),ctx.today,usToday):1;if(!f)continue;
  const p=f*(curve?curve[healthy++]:share);
  if(inside){games+=p;points+=value*p;}
 }
 if(running){const now=calendar.find(g=>g.date===running),day=now?tourDate(now,weeks):running;
  if(day>=from&&day<=to)points+=(value-GAME_PLAYED)*gameLeft(run,pg.minutes??player.forecast?.minutes);}
 return {points,games,clubGames};
}
export function horizons(ctx){
 const all=weeksOf(ctx.live),last=Object.values(all).reduce((m,w)=>w.end>m?w.end:m,ctx.today),week=weekOf(ctx.today,all);
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
// Holdings that score nothing now (standings.js shadowedHoldings): a later buyer's slot of a player another FBL team had
// first and still holds (stints). Advice values such a slot at 0, as the league table and the race do: selling him costs
// the team nothing, keeping him brings it nothing. A 'doubt' holding (who bought first is unknown) keeps its value.
const shadowCache=new WeakMap();
function shadowFirst(ctx){
 const t=ctx.transfers;if(!t?.length)return null;
 let c=shadowCache.get(t);
 if(!c||c.picks!==ctx.picks){c={picks:ctx.picks,map:new Map()};for(const s of stints(t,ctx.picks))if(!s.to&&shadowed(s))c.map.set(`${s.team}:${s.playerId}`,s.shadowedBy.find(a=>!a.to).team);shadowCache.set(t,c);}
 return c.map;
}
// The team that scores a roster player of `team` now because it had him first, or null.
const firstOf=(ctx,team,id)=>team==null?null:shadowFirst(ctx)?.get(`${team}:${id}`)??null;
// What a roster player brings his own team over each horizon: nothing for a shadowed holding.
function ownOutlook(p,ctx,team){
 const o=playerOutlook(p,ctx);if(firstOf(ctx,team,p.id)===null)return o;
 const z={};for(const [k,v] of Object.entries(o))z[k]={...v,points:0,games:0};return z;
}
// Every legal one-for-one replacement of a roster player: same Sports.ru slot structure, price within the bank, a rookie kept.
// Gains are expected official points of the newcomer minus those the player sold brings the team, over each horizon.
function selling(ctx,team,outId,bankMoney,byId){
 const roster=ctx.rosters[team].map(id=>current(byId.get(id),ctx)),leaving=roster.find(p=>p.id===outId);
 if(!leaving)return null;
 const rest=roster.filter(p=>p.id!==outId);
 const white=whiteOf(ctx);
 return {leaving,rest,money:bankMoney+leaving.price,needRookie:!rest.some(p=>p.isRookie===true),
  white,needWhite:Boolean(white)&&!rest.some(p=>white.has(String(p.id))),base:ownOutlook(leaving,ctx,team)};
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
// Players an FBL team holds: the rosters rebuilt from the journals plus every player the Sports.ru roster JSON shows on a
// team, so a journal row not resolved yet never makes a held player look free (FBL allows a player on one team only, and
// the later buyer is in breach).
export function takenIds(ctx){
 const taken=new Set(ctx.rosters.flat()),teams=Object.values(ctx.live?.teams||{}).filter(t=>t?.roster?.length);
 if(!teams.length)return taken;
 const bySid=new Map(ctx.players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p.id]));
 for(const t of teams)for(const r of t.roster){const id=bySid.get(String(r.sportsId));if(id!=null)taken.add(id);}
 return taken;
}
export function transferOptions(ctx,{team,outId,bankMoney,limit=15,sort='month'}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=takenIds(ctx),sale=selling(ctx,team,outId,bankMoney,byId);
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
 if(!raw||takenIds(ctx).has(playerId)||!onMarket(raw,ctx))return null;
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
// ---------- Players page: a player's season so far and the best move that brings them to a team ----------
// A streak: the player's latest games in a row all well above (hot) or below (cold) the pre-season forecast per game, by 25% and at
// least 3 FP. Checked on 2024/25 and 2025/26 regular seasons (the previous season's average as the norm, players of 8+ FP a
// game): after two such games the next one averaged +2.2 FP over the norm (cold −2.5), after three +3.3 (−3.2).
export const STREAK={hot:1.25,cold:.75,margin:3,min:2,shown:5};
export function seasonForm(player,row,rule=STREAK){
 const games=(row?.games||[]).filter(g=>g.played&&fblPoints(g)!==null).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
 const norm=Number.isFinite(player?.forecast?.meanPerGame)?player.forecast.meanPerGame:null,total=games.reduce((s,g)=>s+g.points,0);
 const hot=x=>norm!==null&&x>=Math.max(rule.hot*norm,norm+rule.margin),cold=x=>norm!==null&&x<=Math.min(rule.cold*norm,norm-rule.margin);
 const state=x=>hot(x)?'hot':cold(x)?'cold':'even';
 let kind=games.length?state(games.at(-1).points):'even',length=0;
 if(kind!=='even')for(let i=games.length-1;i>=0&&state(games[i].points)===kind;i--)length++;
 return {games:games.length,total,average:games.length?total/games.length:null,norm,
  minutes:games.length?games.reduce((s,g)=>s+clockMinutes(g.minutes),0)/games.length:null,
  last:games.slice(-rule.shown).map(g=>({date:g.date,opponent:g.opponent||null,points:g.points,minutes:g.minutes??null,state:state(g.points)})),
  streak:kind!=='even'&&length>=rule.min?{kind,length}:null};
}
// The best one-for-one swap that brings a free player to a team, by transferOptions' rules: swapAnalyzer works the sales
// out once and answers per player (memoised), so a page can ask only for the rows it shows. A player no swap brings in
// carries why: the money it lacks (the smallest gap over the sales the player's position allows), or the NBA club limit, the rookie
// rule or the white rule. Null for a player an FBL team holds or not on the Sports.ru market.
export function swapAnalyzer(ctx,{team,bankMoney,sort='month'}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=takenIds(ctx),memo=new Map();
 const sales=ctx.rosters[team].map(id=>selling(ctx,team,id,bankMoney,byId)).filter(Boolean);
 return id=>{
  if(memo.has(id))return memo.get(id);
  const raw=byId.get(id);let result=null;
  if(raw&&!taken.has(id)&&onMarket(raw,ctx)){
   const p=current(raw,ctx);let best=null,need=Infinity,rule=null,outlook=null;
   for(const sale of sales){
    if(!Number.isFinite(p.price)||!rosterFits([...sale.rest,p]))continue;
    if(!clubRoom(sale.rest,p)){rule??='club';continue;}
    if(sale.needRookie&&p.isRookie!==true){rule??='rookie';continue;}
    if(sale.needWhite&&!sale.white.has(String(p.id))){rule??='white';continue;}
    if(p.price>sale.money){need=Math.min(need,p.price-sale.money);continue;}
    outlook??=playerOutlook(p,ctx);
    const gain={};for(const k of Object.keys(outlook))gain[k]=outlook[k].points-sale.base[k].points;
    if(!best||gain[sort]>best.gain[sort])best={outId:sale.leaving.id,player:p,outlook,gain,bankAfter:sale.money-p.price};
   }
   result=best?{best}:Number.isFinite(need)?{reason:'money',need}:{reason:rule||'position'};
  }
  memo.set(id,result);return result;
 };
}
export function bestSwaps(ctx,options){
 const analyse=swapAnalyzer(ctx,options),out=new Map();
 for(const p of ctx.players){const r=analyse(p.id);if(r)out.set(p.id,r);}
 return out;
}
// FBL points each team collected so far (each game's by the league's Yahoo formula on its box score, fblPoints; a game
// whose points are not known adds nothing yet), counting a player only for the games he played while on the team and not
// held first by another FBL team (inStint).
export function teamPoints(ctx,transfers,picks=DRAFT_PICKS){
 const totals=Array(TEAM_COUNT).fill(0),byId=new Map(ctx.players.map(p=>[p.id,p]));
 for(const s of stints(transfers,picks)){
  const games=ctx.live?.players?.[byId.get(s.playerId)?.sportsId]?.games||[];
  for(const g of games){const v=fblPoints(g);if(g.played&&v!==null&&inStint(g,s))totals[s.team]+=v;}
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
// `include`: a free player the package must buy; `exclude`: free players it may not buy.
export function bestPackage(ctx,{team,bankMoney,k=3,sort='month',poolPerPosition=25,protectSeason=true,include=null,exclude=null}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=takenIds(ctx);for(const id of exclude==null?[]:[].concat(exclude))taken.add(id);
 // A roster player counts what he brings this team (nothing for a shadowed holding, ownOutlook), a free agent his outlook.
 const roster=ctx.rosters[team].map(id=>current(byId.get(id),ctx)),wealth=bankMoney+roster.reduce((s,p)=>s+p.price,0);
 const own=new Map(roster.map(p=>[p.id,ownOutlook(p,ctx,team)])),outlook=p=>own.get(p.id)||playerOutlook(p,ctx),value=p=>outlook(p)[sort].points;
 // A club already over the limit after an NBA trade keeps its players, but no purchase may add to it (as clubRoom does
 // for a single swap): no player of it is bought, even for one of its own sold.
 const crowded=new Set(roster.map(p=>p.club).filter(c=>c&&roster.filter(p=>p.club===c).length>CLUB_LIMIT));
 const pool=[];
 for(const pos of POSITIONS){
  pool.push(...ctx.players.filter(p=>!taken.has(p.id)&&p.sportsId&&(ctx.live?.players?.[p.sportsId]||p.priceStatus==='VERIFIED'))
   .map(p=>current(p,ctx)).filter(p=>p.positions.includes(pos)&&Number.isFinite(p.price)&&p.price<=wealth&&!crowded.has(p.club))
   .map(p=>({p,v:value(p)})).sort((a,b)=>b.v-a.v).slice(0,poolPerPosition));
 }
 const must=include!=null&&!taken.has(include)&&byId.get(include)?current(byId.get(include),ctx):null;
 if(include!=null&&(!must||crowded.has(must.club)))return null;
 if(must)pool.push({p:must,v:value(must)});
 const unique=[...new Map(pool.map(x=>[x.p.id,x])).values()];
 const white=whiteOf(ctx),counts=p=>Boolean(white?.has(String(p.id)));
 const model={optimize:'value',opType:'max',constraints:{count:{equal:10},kept:{min:10-k},money:{max:wealth},rookie:{min:1},...(white?{white:{min:1}}:{}),...(must?{must:{min:1}}:{})},variables:{},ints:{}};
 const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
 subsets.forEach((T,i)=>{model.constraints['pos'+i]={max:2*T.length};});
 const items=[...roster.map(p=>({p,v:value(p),own:true})),...unique.map(x=>({...x,own:false}))];
 const clubs=[...new Set(items.map(x=>x.p.club).filter(Boolean))];
 clubs.forEach((c,i)=>{model.constraints['club'+i]={max:Math.max(CLUB_LIMIT,roster.filter(p=>p.club===c).length)};});
 const seasonOf=new Map(items.map(x=>[x.p.id,outlook(x.p).season.points]));
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
 const gains={};for(const h of ['week','month','season'])gains[h]=pairs.reduce((s,x)=>s+outlook(x.in)[h].points-outlook(x.out)[h].points,0);
 return {k,gain,gains,pairs,bankAfter:wealth-next.reduce((s,p)=>s+p.price,0)};
}
// A transfer already made, judged from today: expected official points of the newcomer minus those of the player sold,
// and the best swap of the same player the team could have made with the same money. bankMoney is the bank after the move.
export const VERDICTS={up:'💪 Усиление',down:'🤡 Ослабление',short:'⏳ Усиление только на ближайший месяц',long:'📅 Задел на сезон, сейчас не усиление',even:'🤷 Примерно равноценно'};
// The verdict follows the expected gain: a season gain decides first (a player bought while injured is a season investment,
// not a weakening). How sure it is, the model's chance that the deciding gain has its sign, goes next to it: below
// CONFIDENT the label says «неуверенно», so a coin-flip move never reads as a firm judgement.
function verdictOf(gain,T){const m=gain.month,s=gain.season;return s>=T?(m>=T?'up':'long'):m>=T?(s>=0?'up':'short'):m<=-T||s<=-T?'down':'even';}
function judged(ctx,pairs,gain,T,team){
 const verdict=verdictOf(gain,T),confidence={season:explainSwap(ctx,null,null,'season',pairs,team).confidence,month:explainSwap(ctx,null,null,'month',pairs,team).confidence};
 const h=verdict==='long'||(verdict==='up'&&gain.season>=T)||(verdict==='down'&&gain.season<=-T)?'season':'month';
 const sure=verdict==='even'?null:verdict==='down'?1-confidence[h]:confidence[h];
 return {verdict,label:VERDICTS[verdict]+(sure!==null&&confidenceLevel(sure)!=='CONFIDENT'?', неуверенно':''),confidence,sure,horizon:verdict==='even'?null:h};
}
// The net change of a team's deals made together (Sports.ru confirms a day's transfers as one package): the players sold
// and not bought back, and those bought and not sold again. A chain (A→B, B→C) is one move A→C; a round trip is no move
// at all. A deal both of whose players are in the net keeps its own pair; the rest are paired by Sports.ru position.
export function netChange(ctx,deals){
 const n=new Map(),add=(id,d)=>n.set(id,(n.get(id)||0)+d);for(const x of deals){add(x.outId,-1);add(x.inId,1);}
 const byId=new Map(ctx.players.map(p=>[p.id,p])),pos=id=>byId.get(id)?current(byId.get(id),ctx).positions:[];
 const outs=[...n].filter(([,v])=>v<0).map(([id])=>id),ins=[...n].filter(([,v])=>v>0).map(([id])=>id),pairs=[];
 const restOut=[...outs],restIn=[...ins],take=(list,id)=>{const i=list.indexOf(id);return i>=0?(list.splice(i,1),true):false;};
 for(const x of deals)if(restOut.includes(x.outId)&&restIn.includes(x.inId)){take(restOut,x.outId);take(restIn,x.inId);pairs.push({outId:x.outId,inId:x.inId});}
 for(const o of restOut){if(!restIn.length)break;const i=restIn.findIndex(id=>pos(id).some(q=>pos(o).includes(q)));pairs.push({outId:o,inId:restIn.splice(i>=0?i:0,1)[0]});}
 return {outs,ins,pairs};
}
// A team's deals the watcher saw together (one journal read, seenAt), or of one date when never timed: one package each.
export function dealGroups(deals){
 const m=new Map();for(const x of deals){const k=`${x.team}|${x.seenAt||x.date}`;if(!m.has(k))m.set(k,[]);m.get(k).push(x);}
 return [...m.values()];
}
// `deals`: the package the transfer was part of (default: itself). The alternative is judged on the team before the whole
// package: the players it bought then are free again, those it sold are back, and the money is the bank before it (the
// bank after it, plus what the package paid, minus what it got). It is named only when it is no worse on either horizon
// and better by at least the threshold on one, so a move good for the season is never "beaten" by a 4-week stream.
export function transferVerdict(ctx,transfer,{bankMoney,threshold=15,deals=[transfer]}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),out=byId.get(transfer.outId),joined=byId.get(transfer.inId);
 if(!out||!joined)return null;
 // A player bought while another FBL team that had him first still holds him brings this team nothing (ownOutlook).
 const t=transfer.team,a=playerOutlook(out,ctx),b=ownOutlook(joined,ctx,t),gain={};for(const k of Object.keys(a))gain[k]=b[k].points-a[k].points;
 const T=threshold,v=judged(ctx,[[transfer.outId,transfer.inId]],gain,T,t);
 const back=new Map(netChange(ctx,deals).pairs.map(x=>[x.inId,x.outId]));if(!back.size)back.set(transfer.inId,transfer.outId);
 const before=ctx.rosters.map((r,i)=>i===t?r.map(id=>back.get(id)??id):r);
 // Journal prices, today's when a record has none.
 const price=(x,side)=>x[side+'Price']??(byId.get(x[side+'Id'])?current(byId.get(x[side+'Id']),ctx).price:0);
 const bankBefore=bankMoney+deals.reduce((s,x)=>s+price(x,'in')-price(x,'out'),0),sale=deals.find(x=>x.outId===transfer.outId)||transfer;
 // Sports.ru's roster of the team shows the package already made: the counterfactual takes the rebuilt one alone.
 const teams=Object.fromEntries(Object.entries(ctx.live?.teams||{}).filter(([k])=>Number(k)!==t));
 // The money for the move is the bank before the package plus what the sale got; selling() adds back today's price of
 // the player sold.
 const options=transferOptions({...ctx,rosters:before,live:{...ctx.live,teams}},{team:t,outId:transfer.outId,bankMoney:bankBefore+price(sale,'out')-current(out,ctx).price,limit:20,sort:'season'});
 const best=options.find(o=>o.player.id!==transfer.inId&&o.gain.season>=gain.season&&o.gain.month>=gain.month&&(o.gain.season-gain.season>=T||o.gain.month-gain.month>=T))||null;
 return {gain,...v,best};
}
// A package of deals judged as its net change: no move for a round trip, the single-transfer verdict for one net move,
// the summed gains of the net moves otherwise.
export function packageVerdict(ctx,deals,{bankMoney,threshold=15}){
 const net=netChange(ctx,deals),t=deals[0]?.team;
 if(!net.pairs.length)return {net,gain:{week:0,month:0,season:0},verdict:'none',label:'🔁 Обмен туда-обратно: состав не изменился',best:null,sure:null};
 const byId=new Map(ctx.players.map(p=>[p.id,p]));
 if(net.pairs.some(x=>!byId.get(x.outId)||!byId.get(x.inId)))return {net,gain:null,verdict:null,label:null,best:null,sure:null};
 if(net.pairs.length===1){const [x]=net.pairs;return {net,...transferVerdict(ctx,{team:t,outId:x.outId,inId:x.inId},{bankMoney,threshold,deals})};}
 const gain={week:0,month:0,season:0};
 for(const x of net.pairs){const a=playerOutlook(byId.get(x.outId),ctx),b=ownOutlook(byId.get(x.inId),ctx,t);for(const k of Object.keys(gain))gain[k]+=b[k].points-a[k].points;}
 return {net,gain,...judged(ctx,net.pairs.map(x=>[x.outId,x.inId]),gain,threshold,t),best:null};
}
// How a team can get a given free player: the best one-for-one swap, or else the best package of up to k transfers that
// buys him. With one transfer he is worth it when his swap gains at least minGain over the season and the next 4 weeks do
// not drop below monthFloor. With several, the other moves of a package must not pay for him: he is worth it only for
// what he adds over the best package of the same transfers without him (`edge`, season points), at least minGain. `best`:
// the team's best season package of k transfers, when the caller already has it.
export function acquisition(ctx,{team,playerId,bankMoney,k=1,minGain=15,monthFloor=0,best}){
 const swap=bestSwapFor(ctx,{team,playerId,bankMoney});
 if(k<=1)return {worth:Boolean(swap&&swap.gain.season>=minGain&&swap.gain.month>=monthFloor),swap,pack:null,edge:swap?swap.gain.season:-Infinity};
 const top=best!==undefined?best:bestPackage(ctx,{team,bankMoney,k,sort:'season'}),buys=p=>Boolean(p?.pairs.some(x=>x.in.id===playerId));
 // The best package either buys him (then the best one without him is the comparison) or not (then it is that one).
 const pack=buys(top)?top:bestPackage(ctx,{team,bankMoney,k,sort:'season',include:playerId});
 const without=buys(top)?bestPackage(ctx,{team,bankMoney,k,sort:'season',exclude:playerId}):top;
 const edge=pack?pack.gains.season-Math.max(0,without?.gains.season??0):-Infinity;
 if(edge>=minGain&&swap&&swap.gain.season>=minGain&&swap.gain.month>=monthFloor)return {worth:true,swap,pack:null,edge};
 if(edge>=minGain&&pack.gains.month>=monthFloor)return {worth:true,swap,pack,edge};
 return {worth:false,swap,pack:null,edge};
}
// Injured free agents worth getting over the season (not out for it), with how to get them, the biggest edge first.
// `soon`: day-to-day, or an ESPN return date within `days` — the moment to buy before the rivals and the price react.
export function injuredTargets(ctx,{team,bankMoney,k=1,days=7,minGain=30}){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),taken=takenIds(ctx),until=addDays(ctx.today,days),out=[];
 const rate=p=>perGame(p,ctx.live?.players?.[p.sportsId]).value*playRate(p,ctx.live?.players?.[p.sportsId],ctx);
 const weakest=Math.min(...ctx.rosters[team].map(id=>firstOf(ctx,team,id)===null?rate(byId.get(id)):0));
 let best;
 for(const raw of ctx.players){
  const injury=raw.espnId&&ctx.injuries?.get(String(raw.espnId));
  if(!injury||taken.has(raw.id)||seasonEnding(injury)||rate(raw)<=weakest)continue;
  if(k>1&&best===undefined)best=bestPackage(ctx,{team,bankMoney,k,sort:'season'});
  // Still out for a while: judged on the season only; the 4-week window is checked again once he is back.
  const deal=acquisition(ctx,{team,playerId:raw.id,bankMoney,k,minGain,monthFloor:-Infinity,best});
  if(!deal.worth)continue;
  const dayToDay=!/out|suspension/i.test(injury.status||'')||injury.fantasyStatus==='GTD';
  out.push({player:current(raw,ctx),injury,...deal,soon:dayToDay||Boolean(injury.returnDate&&injury.returnDate.slice(0,10)<=until)});
 }
 return out.sort((a,b)=>b.edge-a.edge);
}
// Free agents who beat a current player of the same position over the horizon and over the rest of the season,
// affordable in a one-for-one swap: real upgrades, not short-term streams.
export function marketAlerts(ctx,{team,bankMoney,sort='month',minGain=15,minConfidence=CONFIDENT}){
 return bestTransfers(ctx,{team,bankMoney,sort,limit:10}).map(x=>({...x,why:explainSwap(ctx,x.outId,x.player.id,sort,null,team)}))
  .filter(x=>x.gain[sort]>=minGain&&x.gain.season>0&&x.why.confidence>=minConfidence);
}
// The package to make now, one answer for the app and Telegram. Options: the best package of up to 1, 2 and 3 transfers
// over the horizon, each kept when it gains more than the smaller one. A package is advised (`best`) only when the model is
// CONFIDENT, it does not cost the season and it fits the transfers left. A transfer is a weekly resource, so a smaller
// package wins when each move it saves would add less than `price` FP, over the horizon and over the season alike (saving
// a transfer must not give up the season). `borderline`: the same choice among MODERATE packages, when none is confident:
// "можно, но не уверенно", never "сделай".
export const MOVE_PRICE=15;
export function pickPackage(options,{left,sort='month',price=MOVE_PRICE}){
 const pick=lvl=>{
  const fits=options.filter(o=>o.lvl===lvl&&o.gains.season>=0&&o.pairs.length<=left&&o.gains[sort]>0).sort((a,b)=>b.gains[sort]-a.gains[sort]);
  let best=fits[0]||null;
  for(const f of fits){const d=best?best.pairs.length-f.pairs.length:0;if(d>0&&best.gains[sort]-f.gains[sort]<price*d&&best.gains.season-f.gains.season<price*d)best=f;}
  return best;
 };
 const best=pick('CONFIDENT');
 return {best,borderline:best?null:pick('MODERATE')};
}
export function recommendPackage(ctx,{team,bankMoney,left,sort='month',price=MOVE_PRICE}){
 const options=[];let previous=0;
 for(const k of [1,2,3]){const p=bestPackage(ctx,{team,bankMoney,k,sort});if(!p||!p.pairs.length||p.gain<=previous+1e-6)continue;previous=p.gain;
  const why=explainSwap(ctx,null,null,sort,p.pairs.map(x=>[x.out.id,x.in.id]),team);options.push({...p,why,lvl:why.level});}
 return {...pickPackage(options,{left,sort,price}),options};
}
// Other FBL teams the same model would also tell to buy a player (his best swap for them gains at least minGain over the
// horizon without costing the season): FBL allows a player on one team only, so the first buyer gets him and a later one
// is in breach. The advice itself stays each team's own expected points. `leftOf(t)`: a rival's transfers left this week;
// one with none cannot buy him now and is not counted (without it every rival is).
export function contestedBy(ctx,{team,playerId,bankOf,leftOf=null,sort='month',minGain=15}){
 const out=[];
 for(let t=0;t<ctx.rosters.length;t++){if(t===team||leftOf&&!(leftOf(t)>0))continue;const s=bestSwapFor(ctx,{team:t,playerId,bankMoney:bankOf(t),sort});if(s&&s.gain[sort]>=minGain&&s.gain.season>0)out.push(t);}
 return out;
}
// FBL transfer hours (08:00-22:00 Moscow time): whether a move made now is inside them. Outside them every move is a
// certain breach, so advice says when to make it instead of "now".
export function transferWindow(now=Date.now(),hours=TRANSFER_HOURS){
 const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;},m=((now+3*3600e3)%864e5+864e5)%864e5/60e3;
 return {open:m>=minutes(hours.from)&&m<minutes(hours.to),now:mskTime(new Date(now).toISOString()),from:hours.from,to:hours.to};
}

// ---------- Why a transfer, and how sure ----------
// A move is advised only when the model is this sure it gains over the chosen horizon; below DOUBTFUL it is not worth a transfer.
export const CONFIDENT=.7,DOUBTFUL=.6;
// One rounding everywhere (app and Telegram): the percent shown is rounded down and the level follows that percent, so
// "70%" is never printed next to a lower level.
export const confidencePercent=c=>Math.floor(c*100);
export function confidenceLevel(c){const p=confidencePercent(c);return p>=Math.round(CONFIDENT*100)?'CONFIDENT':p>=Math.round(DOUBTFUL*100)?'MODERATE':'DOUBTFUL';}
const Z90=1.2815515655;
function normalCdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
// Spread of a player's points over a horizon: the forecast's season range (10th-90th percentile, calibrated forward on past
// seasons) as a share of his expected points, plus game-to-game noise (about half of the variance over one week). The range
// is not narrowed as his games of this season come in: most of it is availability and role (injuries, rest, trades), which
// the games played do not settle. Fitted on the held-out 2024/25 season (a narrowing prior of 20, 40, 60, 100 or 200 games
// or none, times a scale of 0.8-1.5): none at scale 1 has the lowest log-loss of P(gain>0) over 15 in-season cells (0.540,
// the old 20-game narrowing 0.563), and so it does on 2025/26 (0.530 against 0.549; season horizon, 70-80% bin, from
// January: 74-77% won, before 65-70%). Pre-season, with no games played, nothing changes.
export function pointsSpread(player,ctx,outlook){
 const f=player.forecast;
 const rel=f&&f.meanSeason>0&&Number.isFinite(f.seasonFloor)?(f.seasonCeiling-f.seasonFloor)/(2*Z90*f.meanSeason):.5;
 const game=f&&Number.isFinite(f.gameFloor)?(f.gameCeiling-f.gameFloor)/(2*Z90):Math.max(4,(outlook.points/Math.max(1,outlook.games))*.4);
 return Math.sqrt((rel*outlook.points)**2+game*game*Math.max(0,outlook.games));
}
// What one player brings over a horizon, split as points per game x share of the club's games he plays x club games
// (those expectedPoints counts: the NBA Cup games not listed yet included, by tour).
export function playerPicture(player,ctx,key){
 const live=ctx.live?.players?.[player.sportsId],h=horizons(ctx)[key];
 const outlook=expectedPoints(player,ctx,h.from,h.to),g=perGame(player,live),rate=playRate(player,live,ctx);
 const injury=ctx.injuries?.get(String(player.espnId))||null,played=(live?.games||[]).filter(x=>x.played);
 // played: games he played; scored: those whose FBL points are known, which `average` is over.
 return {player,points:outlook.points,perGame:g.value,prior:g.prior,average:g.average,played:played.length,scored:g.games,playRate:rate,
  expectedGames:outlook.games,clubGames:outlook.clubGames,injury,spread:pointsSpread(player,ctx,outlook),
  price:current(player,ctx).price,priceChange:Number.isFinite(live?.price)&&Number.isFinite(live?.initialPrice)?live.price-live.initialPrice:0};
}
// Exact additive split of a difference of products a1*b1*c1 - a0*b0*c0: the logarithmic mean when every factor is positive;
// with a zero (a player out for the whole period, a club with no games left in it) the Shapley average over every order of
// changing one factor at a time, which stays exact and gives the change to the factor that caused it.
const orders=n=>n<2?[[...Array(n).keys()]]:orders(n-1).flatMap(o=>Array.from({length:n},(_,i)=>[...o.slice(0,i),n-1,...o.slice(i)]));
export function splitProduct(before,after){
 const prod=xs=>xs.reduce((a,b)=>a*b,1),P0=prod(before),P1=prod(after);
 if(![...before,...after].every(Number.isFinite))return before.map((_,i)=>i===0?P1-P0:0);
 if(before.some(x=>!(x>0))||after.some(x=>!(x>0))){
  const all=orders(before.length),out=before.map(()=>0);
  for(const o of all){const cur=[...before];for(const i of o){const p=prod(cur);cur[i]=after[i];out[i]+=(prod(cur)-p)/all.length;}}
  return out;
 }
 const w=Math.abs(P1-P0)<1e-9?P0:(P1-P0)/Math.log(P1/P0);
 return before.map((x,i)=>w*Math.log(after[i]/x));
}
// ESPN and the model far apart on a player's games: both figures and what the forecast counts, the mean of the two since
// owner decision 4 (gamesBasis 'MEAN_ESPN_MODEL'; older databases took ESPN's). ESPN's own figure is projectedGames when a
// known absence capped the games it adds to the mean (sources.espn.games).
function gamesFlag(name,f){
 const e=f?.sources?.espn,m=f?.sources?.model;if(!e||!m||!(Math.abs(e.games-m.games)>=12))return null;
 if(f.gamesBasis!=='MEAN_ESPN_MODEL')return `${name}: в расчёте ${Math.round(f.games)} матчей по ESPN; по истории пропусков модель ждала бы ${Math.round(m.games)}.`;
 const capped=Number.isFinite(e.projectedGames)&&Math.round(e.projectedGames)!==Math.round(e.games),n=Math.round(capped?e.projectedGames:e.games);
 return `${name}: ESPN ждёт ${n} ${plural(n,'матч','матча','матчей')}${capped?` (с учётом пропуска — ${Math.round(e.games)})`:''}, модель по истории пропусков — ${Math.round(m.games)}; в расчёте среднее ${Math.round(f.games)}.`;
}
// Why a swap gains (or not) over a horizon, how sure the model is, and what to check before doing it. `team`: the team
// making it, whose shadowed holdings (firstOf: one sold, or, judging a move made, one bought) bring it nothing; without
// it every player counts his outlook.
export function explainSwap(ctx,outId,inId,key='month',pairs=null,team=null){
 const byId=new Map(ctx.players.map(p=>[p.id,p]));
 const moves=pairs||[[outId,inId]],flags=[];let gain=0,variance=0,held=0;const parts={perGame:0,availability:0,schedule:0},sides=[];
 // A shadowed holding scores for the team that had him first: he brings this one nothing, for certain.
 const nothing=(x,first)=>first===null?x:{...x,points:0,expectedGames:0,playRate:0,spread:0,shadowedBy:first};
 for(const [o,i] of moves){
  const firstOut=firstOf(ctx,team,o),firstIn=firstOf(ctx,team,i);
  const a=nothing(playerPicture(byId.get(o),ctx,key),firstOut),b=nothing(playerPicture(byId.get(i),ctx,key),firstIn);sides.push({out:a,in:b});
  // Share of the club's games he plays; a club with no games in the period has none, so his usual share stands in and
  // the difference goes to the calendar.
  const share=x=>x.clubGames>0?x.expectedGames/x.clubGames:x.playRate;
  const d=b.points-a.points,shadow=firstOut!==null||firstIn!==null;gain+=d;variance+=a.spread**2+b.spread**2;
  // A side that plays no games for this team: all of the difference is the share of games, and none of it is uncertain.
  const split=shadow?[0,d,0]:splitProduct([a.perGame,share(a),a.clubGames],[b.perGame,share(b),b.clubGames]);if(shadow)held+=d;
  const sum=split.reduce((x,y)=>x+y,0)||1,scale=Math.abs(sum)>1e-9?d/sum:0;
  parts.perGame+=split[0]*scale;parts.availability+=split[1]*scale;parts.schedule+=split[2]*scale;
  const f=b.player.forecast||{},fo=a.player.forecast||{};
  // A season-ending report shows ESPN's placeholder date: the season is over for him, as injuryFactor reads it.
  if(b.injury)flags.push(`${b.player.name}: ${b.injury.status}${seasonEnding(b.injury)?' до конца сезона':b.injury.returnDate?' до '+b.injury.returnDate.slice(8,10)+'.'+b.injury.returnDate.slice(5,7):''} — проверь новости перед покупкой.`);
  for(const [x,first] of [[a,firstOut],[b,firstIn]])if(first!==null)flags.push(`${x.player.name}: его очки получает ${teamName(first)} — она взяла его раньше, тебе он не приносит ничего.`);
  if(a.injury&&firstOut===null)flags.push(`${a.player.name}: ${a.injury.status} — это часть причины продажи.`);
  if(['DRAFT_PRIOR','GROUP_PRIOR','LIMITED_PERSONAL'].includes(f.coverageTier)||f.origin==='SPORTS_PRICE_PRIOR')flags.push(`${b.player.name}: прогноз почти без личной истории в NBA — высокая неопределённость.`);
  for(const x of [firstOut===null?gamesFlag(a.player.name,fo):null,firstIn===null?gamesFlag(b.player.name,f):null])if(x)flags.push(x);
  if(b.player.depth?.rank>=3)flags.push(`${b.player.name}: по составу ESPN №${b.player.depth.rank} на ${b.player.depth.position} — роль и минуты не гарантированы.`);
  if(b.played<5&&a.played<5&&ctx.today)flags.push('Сезон только начался: оценки опираются на прогноз, а не на игры этого сезона.');
 }
 const sd=Math.sqrt(variance),confidence=sd>0?normalCdf(gain/sd):gain>0?1:0;
 const total=Math.abs(parts.perGame)+Math.abs(parts.availability)+Math.abs(parts.schedule)||1;
 if(gain>0&&(parts.availability-held)/total>.5)flags.unshift('Больше половины выигрыша — из прогноза числа сыгранных матчей, а не из игры за матч: это самая неточная часть прогноза.');
 if(gain>0&&parts.schedule/total>.5)flags.unshift('Выигрыш в основном из календаря (у нового клуба больше матчей в периоде): после периода преимущество исчезнет.');
 return {gain,sd,confidence,level:confidenceLevel(confidence),parts,flags:[...new Set(flags)],sides};
}
// The FBL formula on an ESPN box-score line, as Yahoo counts it: the box-score terms plus 1 for the game played. A line
// with stats is an appearance (+1 even with zero minutes shown); ESPN leaves the stats of a DNP empty.
export function boxScorePoints(stats){
 const n=v=>Number(v)||0,split=v=>String(v||'0-0').split('-').map(Number);
 if(!Object.keys(stats||{}).length)return null;
 const [fgm,fga]=split(stats.FG),[ftm,fta]=split(stats.FT);
 return fblFormula({pts:n(stats.PTS),reb:n(stats.REB),ast:n(stats.AST),stl:n(stats.STL),blk:n(stats.BLK),fgm,fga,ftm,fta,tov:n(stats.TO),pf:n(stats.PF)});
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
    const points=boxScorePoints(stats),minutes=clockMinutes(stats.MIN);
    // counting: the line without the point for the game played.
    // line: the box-score stats the formula reads, for the live stat line; name and team for the full game list.
    if(points!==null)out[String(a.athlete?.id)]={points,minutes,final,counting:points-GAME_PLAYED,
     name:a.athlete?.displayName||a.athlete?.shortName||'',team:team.team?.abbreviation||'',line:Object.fromEntries(LINE.filter(k=>k in stats).map(k=>[k,stats[k]]))};
   }
  }
 }
 return out;
}
// A Sports.ru row may have no FBL points yet: no readable box score ('NO_BOX'), or, in an older snapshot, Sports.ru's 0
// before it counts the game. Games ESPN covers (yesterday and today, US Eastern) are therefore scored at once by the
// league's formula on the ESPN box score — the categories Yahoo counts — with Sports.ru's exact minutes for the in-season
// update when it lists them. A game still running is left to the running points: its Sports.ru row does not count until
// the final whistle.
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
    // The Sports.ru row's points and their source stay beside ESPN's (a 'NO_BOX' row must not mark ESPN's line unknown).
    next={...(row||{date:day}),tip:row?.tip||g.date,minutes:row&&exact!==x.minutes?row.minutes:String(x.minutes),points:x.counting+GAME_PLAYED,played:true,source:'ESPN',
     ...(row?{sportsRowPoints:row.points}:{}),...(row?.pointsSource?{pointsSource:'ESPN',sportsRowSource:row.pointsSource}:{})};
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
