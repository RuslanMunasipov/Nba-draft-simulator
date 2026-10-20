// FBL roster rules checked on every team: a rookie, a player counting for the «белое правило», at most two players of
// one NBA club, the league's weekly transfer limit and its transfer hours (08:00–22:00 Moscow time). A breach becomes an
// appeal to the league's lawyer.
import RULES from '../data/league-rules.json' with {type:'json'};
import {TEAM_COUNT,CLUB_LIMIT} from './engine.js';
import {teamLabel} from './teams.js';

export const FBL_TRANSFERS=RULES.fblTransfers;
export const LAWYER=RULES.lawyer;
export const LEAGUE_FEED=RULES.leagueFeed||{};
export const COMMISSIONER=RULES.commissioner||{role:'комиссионер лиги FBL'};
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const monday=day=>addDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7));
const ddmm=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';

// The league's transfer week holding a Moscow date: Monday to Sunday, except the first one, which runs from the draft
// to the first Sunday of the season (pre-season transfers count against it).
export function fblWeek(day,rules=FBL_TRANSFERS){
 if(day<=rules.firstWeekTo)return {start:rules.firstWeekFrom,end:rules.firstWeekTo};
 const start=monday(day);return {start,end:addDays(start,6)};
}
// FBL transfer hours: strictly from 08:00 to 22:00 Moscow time (UTC+3 all year). Sports.ru journals give only the date,
// so the time of a transfer is bounded by the watcher: after its last read of the journal without it (seenAfter) and no
// later than its first read with it (seenAt). Inside the hours throughout: fine; outside throughout: a breach; the window
// crossing 08:00 or 22:00: the lawyer checks the time on Sports.ru. A row without seenAfter is taken as made in the
// two minutes before seenAt (one watcher read); a row without seenAt has no time to check.
export const TRANSFER_HOURS=RULES.fblTransfers.hours||{from:'08:00',to:'22:00'};
const MSK=3*3600e3,minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
export const mskTime=at=>{const d=new Date(Date.parse(at)+MSK);return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;};
const mskDate=at=>{const d=new Date(Date.parse(at)+MSK);return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
export function transferTime(x,hours=TRANSFER_HOURS){
 if(!x?.seenAt)return {state:'unknown'};
 const b=Date.parse(x.seenAt),a=x.seenAfter?Date.parse(x.seenAfter):b-2*60e3,from=minutes(hours.from),to=minutes(hours.to);
 const allowed=t=>{const m=((t+MSK)%864e5)/60e3;return m>=from&&m<to;};
 // A boundary (08:00 or 22:00 Moscow) inside (a, b] means the transfer may fall on either side of it.
 const day0=Math.floor((a+MSK)/864e5)*864e5-MSK;
 for(let d=day0;d<=b;d+=864e5)for(const m of [from,to]){const B=d+m*60e3;if(B>a&&B<=b)return {state:'doubt',from:x.seenAfter||new Date(a).toISOString(),at:x.seenAt};}
 return {state:allowed(b)?'ok':'breach',from:x.seenAfter||null,at:x.seenAt};
}
// How the protocol names the time of a transfer: one minute when the watcher pins it, otherwise the window.
export function timeLabel(t){
 if(t.state==='unknown')return 'не зафиксировано';
 const a=t.from?mskTime(t.from):null,b=mskTime(t.at);
 return a&&a!==b&&t.state==='doubt'?`между ${a} и ${b} (${mskDate(t.at)})`:`${b} (${mskDate(t.at)})`;
}

export function fblTransfers(transfers,team,today,rules=FBL_TRANSFERS){
 const week=fblWeek(today,rules),used=transfers.filter(x=>x.team===team&&x.date>=week.start&&x.date<=today&&x.date<=week.end).length;
 // Weeks in which the team went over the limit, for the appeal.
 const byWeek=new Map();
 for(const x of transfers.filter(x=>x.team===team)){const w=fblWeek(x.date,rules).start;byWeek.set(w,(byWeek.get(w)||0)+1);}
 const over=[...byWeek].filter(([,n])=>n>rules.perWeek).map(([start,count])=>({start,end:fblWeek(start,rules).end,count}));
 return {used,left:Math.max(0,rules.perWeek-used),limit:rules.perWeek,week,resetOn:addDays(week.end,1),over};
}

// Every rule for every team. rosters: player ids per team; white: ids the league counts for the «белое правило»; the
// entry "none:<team>" records the league's finding that a team has no such player. Only one player per team needs to be
// marked: a team breaks the rule when it sells its last marked player (or the league found none), never merely because
// nobody of it is marked yet. checked: every id the league has decided on, counting or not; a team whose whole roster
// is decided with nobody counting breaks the rule, and players nobody decided on are listed as undecided.
export function checkRules({rosters,byId,transfers=[],white=[],checked=[],today,clubOf=p=>p?.sportsClub??null,nameOf=p=>p?.name}){
 const whiteSet=new Set(white.map(String)),decided=new Set([...checked.map(String),...whiteSet]);
 return Array.from({length:TEAM_COUNT},(_,team)=>{
  const roster=(rosters[team]||[]).map(id=>byId.get(id)).filter(Boolean),violations=[];
  const rookies=roster.filter(p=>p.isRookie===true),whites=roster.filter(p=>whiteSet.has(String(p.id)));
  const undecided=checked.length?roster.filter(p=>!decided.has(String(p.id))):[];
  if(!rookies.length)violations.push({rule:'rookie',key:`rookie:${team}:${roster.map(p=>p.id).sort().join(',')}`,
   text:'в составе нет ни одного новичка (rookie) — нарушено правило обязательного новичка'});
  const lastOut=[...transfers].reverse().find(x=>x.team===team&&whiteSet.has(String(x.outId)));
  const fullyDecided=checked.length>0&&roster.length>0&&!undecided.length;
  const whiteState=whites.length?'ok':whiteSet.has(`none:${team}`)||fullyDecided?'none':lastOut?'sold':'unmarked';
  if(whiteState==='none')violations.push({rule:'white',key:`white:${team}:none:${roster.map(p=>p.id).sort().join(',')}`,
   text:'в составе нет ни одного игрока, засчитываемого по «белому правилу» (по отцу) — так решила лига'});
  if(whiteState==='sold'){
   const bought=transfers.filter(x=>x.team===team&&x.date>=lastOut.date).map(x=>byId.get(x.inId)?.name).filter(Boolean);
   violations.push({rule:'white',key:`white:${team}:sold:${lastOut.outId}:${lastOut.date}`,
    text:`${ddmm(lastOut.date)} продан ${byId.get(lastOut.outId)?.name||'игрок'}, который закрывал «белое правило»; другого засчитываемого игрока в составе не отмечено (куплены: ${bought.join(', ')||'—'}) — проверьте, выполняется ли правило`});
  }
  const clubs=new Map();for(const p of roster){const c=clubOf(p);if(c)clubs.set(c,[...(clubs.get(c)||[]),p]);}
  for(const [club,list] of clubs)if(list.length>CLUB_LIMIT)violations.push({rule:'club',key:`club:${team}:${club}:${list.map(p=>p.id).sort().join(',')}`,
   text:`${list.length} игрока одного клуба NBA (${club}): ${list.map(nameOf).join(', ')} — допускается не больше ${CLUB_LIMIT}`});
  // Transfer hours, per transfer of the team (each is checked once, by its own time).
  for(const x of transfers.filter(x=>x.team===team)){
   const t=transferTime(x);if(t.state==='ok'||t.state==='unknown')continue;
   const deal=`${nameOf(byId.get(x.outId))||x.outId} → ${nameOf(byId.get(x.inId))||x.inId}`;
   violations.push({rule:'time',certain:t.state==='breach',transfer:`${x.outId}>${x.inId}:${x.date}`,key:`time:${team}:${x.outId}>${x.inId}:${x.date}`,
    text:t.state==='breach'?`трансфер ${deal} совершён в ${timeLabel(t)} МСК — трансферы разрешены только с ${TRANSFER_HOURS.from} до ${TRANSFER_HOURS.to} МСК`
     :`трансфер ${deal} совершён ${timeLabel(t)} МСК — на границе разрешённого времени (${TRANSFER_HOURS.from}–${TRANSFER_HOURS.to} МСК), сверьте время на Sports.ru`});
  }
  const moves=fblTransfers(transfers,team,today);
  for(const w of moves.over)violations.push({rule:'transfers',key:`transfers:${team}:${w.start}:${w.count}`,
   text:`${w.count} трансфера за неделю ${ddmm(w.start)}–${ddmm(w.end)} при лимите ${moves.limit}`});
  return {team,label:teamLabel(team),roster,rookies,whites,whiteState,undecided,transfers:moves,violations};
 });
}

// What a team's check asks of the league. An obvious breach (no rookie, the club or transfer limit, a team the league
// found without a white player, a transfer outside the hours) is for the lawyer to investigate; a sold white player with
// no other one marked, a roster the league has not decided on, or a transfer whose time window crosses 08:00 or 22:00
// needs his check; otherwise the roster stands approved.
export function verdict(check){
 const doubtful=v=>(v.rule==='white'&&check.whiteState==='sold')||(v.rule==='time'&&!v.certain);
 const breaches=check.violations.filter(v=>!doubtful(v)),doubts=check.violations.filter(doubtful);
 const unmarked=check.whiteState==='unmarked';
 return {kind:breaches.length?'violation':doubts.length||unmarked?'check':'approved',breaches,doubts,unmarked};
}

// The appeal the league owner sends to the league's lawyer about one team's breaches.
export function appeal(check,today,from=0){
 const lines=check.violations.map((v,i)=>`${i+1}. ${v.text}.`);
 return [`Уважаемый ${LAWYER.name}!`,'',
  `Прошу рассмотреть возможное нарушение регламента FBL командой «${check.label.replace(/^\d+\.\s*/,'')}» (проверка от ${ddmm(today)}.${today.slice(0,4)}):`,
  ...lines,'',
  `Состав команды на момент проверки: ${check.roster.map(p=>p.name).join(', ')}.`,
  `Трансферы на текущей неделе лиги (${ddmm(check.transfers.week.start)}–${ddmm(check.transfers.week.end)}): ${check.transfers.used} из ${check.transfers.limit}.`,'',
  'Прошу разобраться и сообщить решение лиги.','',
  'С уважением,',teamLabel(from).replace(/^\d+\.\s*/,'')].join('\n');
}
