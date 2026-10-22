// Season → Матчи: today's games and the 7-day schedule of a team's players.
import {teamName} from '../teams.js';
import {horizons,playerOutlook} from '../season.js';
import {dec,ddmm,weekday} from '../format.js';
import {$,addDaysIso,byId,clubOf,currentWeek,el,games,injuryText,live,needsLive,onlyMine,owners,players,renderSeason,setOnlyMine,team} from './state.js';
import {controls,gamesToday,teamSelect} from './widgets.js';

// ---------- Upcoming games ----------
// Games of the team chosen above: today's scores and the 7-day schedule list only that team's players.
export function gamesView(ctx){
 const head=el('div',null,'sp-controls sp-games-controls'),toggle=el('label',null,'check'),cb=el('input');
 cb.type='checkbox';cb.checked=onlyMine;cb.onchange=()=>{setOnlyMine(cb.checked);renderSeason();};toggle.append(cb,' Только матчи с игроками команды');
 head.append(teamSelect(),toggle);
 const out=[head,gamesToday(ctx,false,team)];
 const wait=needsLive('Ближайшие 7 дней');if(wait)return [...out,...wait];
 const own=owners(ctx),byClub=new Map();
 for(const p of players){if(own.get(p.id)!==team)continue;const c=clubOf(p);if(!byClub.has(c))byClub.set(c,[]);byClub.get(c).push(p);}
 const until=addDaysIso(ctx.today,6),days=new Map();
 for(const [club,cal] of Object.entries(live?.clubs||{}))for(const g of cal){if(g.date<ctx.today||g.date>until||!g.home||g.gone)continue;if(!days.has(g.date))days.set(g.date,[]);days.get(g.date).push({home:club,away:g.opponent});}
 const week=currentWeek(ctx.today),end=week?.end||horizons(ctx).week.to;
 const block=el('div',null,'sp-block');block.append(el('h3',`Игры составов до ${ddmm(end)}`),el('p','Сколько матчей сыграют 10 игроков каждой команды по календарю Sports.ru и с учётом травм.','muted'));
 const counts=el('table',null,'standings-table'),hr=el('tr');for(const [x,c] of [['Команда',''],['Матчей','num'],['С травмами','num']]){const th=el('th',x,c);th.scope='col';hr.append(th);}counts.append(hr);
 const rows=ctx.rosters.map((ids,t)=>{let w=0,e=0;for(const id of ids){const p=byId.get(id);if(!p)continue;for(const g of live?.clubs?.[clubOf(p)]||[])if(g.date>=ctx.today&&g.date<=end&&!g.score&&!g.gone)w++;e+=playerOutlook(p,{...ctx,running:new Map()}).week.games;}return {t,w,e};}).sort((a,b)=>b.e-a.e);
 for(const r of rows){const tr=el('tr');if(r.t===team)tr.className='mine';tr.append(el('td',teamName(r.t),'team'),el('td',String(r.w),'num'),el('td',dec(r.e),'num total'));counts.append(tr);}
 const wrap=el('div',null,'table-scroll');wrap.append(counts);block.append(wrap);
 const sched=el('div',null,'sp-block');sched.append(el('h3','Расписание на 7 дней'));
 let any=false;
 for(const [day,list] of [...days].sort()){
  const ul=el('ul',null,'sp-day');
  for(const g of list){const ours=[...(byClub.get(g.away)||[]),...(byClub.get(g.home)||[])];if(onlyMine&&!ours.length)continue;
   const li=el('li'),line=el('strong');line.append(el('span',`${g.away} — ${g.home}`));li.append(line);
   if(ours.length)li.append(el('small',ours.map(p=>`${p.name}${injuryText(p)?' ('+injuryText(p).toLowerCase()+')':''}`).join(' · '),'team-players'));
   ul.append(li);}
  if(ul.children.length){sched.append(el('p',weekday(day),'games-day'),ul);any=true;}
 }
 if(!any)sched.append(el('p',onlyMine?`На этой неделе у игроков ${teamName(team)} матчей нет.`:'Нет данных календаря.','muted'));
 out.push(sched,block);
 return out;
}
