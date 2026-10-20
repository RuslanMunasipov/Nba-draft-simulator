// FBL roster rules checked on every team: a rookie, a player counting for the «белое правило», at most two players of
// one NBA club, and the league's weekly transfer limit. A breach becomes an appeal to the league's lawyer.
import RULES from '../data/league-rules.json' with {type:'json'};
import {TEAM_COUNT,CLUB_LIMIT} from './engine.js';
import {teamLabel} from './teams.js';

export const FBL_TRANSFERS=RULES.fblTransfers;
export const LAWYER=RULES.lawyer;
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const monday=day=>addDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7));
const ddmm=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';

// The league's transfer week holding a Moscow date: Monday to Sunday, except the first one, which runs from the draft
// to the first Sunday of the season (pre-season transfers count against it).
export function fblWeek(day,rules=FBL_TRANSFERS){
 if(day<=rules.firstWeekTo)return {start:rules.firstWeekFrom,end:rules.firstWeekTo};
 const start=monday(day);return {start,end:addDays(start,6)};
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
export function checkRules({rosters,byId,transfers=[],white=[],checked=[],today,clubOf=p=>p?.sportsClub??null}){
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
   text:`${list.length} игрока одного клуба NBA (${club}): ${list.map(p=>p.name).join(', ')} — допускается не больше ${CLUB_LIMIT}`});
  const moves=fblTransfers(transfers,team,today);
  for(const w of moves.over)violations.push({rule:'transfers',key:`transfers:${team}:${w.start}:${w.count}`,
   text:`${w.count} трансфера за неделю ${ddmm(w.start)}–${ddmm(w.end)} при лимите ${moves.limit}`});
  return {team,label:teamLabel(team),roster,rookies,whites,whiteState,undecided,transfers:moves,violations};
 });
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
