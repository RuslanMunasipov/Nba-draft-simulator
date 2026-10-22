// Season → Обзор: the league table with the race, the alerts for my team, today's games and the best players.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {perGame,horizons,current,marketAlerts} from '../season.js';
import {placeLabel,chanceText,fblGame} from '../standings.js';
import {int,dec,signed,count,ddmm} from '../format.js';
import {$,button,byId,confidenceBadge,currentWeek,el,forGains,games,injuries,injuryText,live,livePoints,needsLive,openRows,owners,players,setReplacing,setTeam,setView,tab,team,teamBank,transfers} from './state.js';
import {CHANCE_NOTE,gamesToday,race} from './widgets.js';

function standingsTable(ctx,running){
 const h=horizons(ctx),{started,rows:all}=race(ctx,running);
 const rows=[...all].sort((a,b)=>b.points-a.points||b.total-a.total),anyLive=rows.some(r=>r.now);
 const table=el('table',null,'standings-table'),head=el('tr'),week=currentWeek(ctx.today);
 const cols=[['#',''],['Команда',''],...(started?[['Очки','num']]:[]),...(anyLive?[['В игре','num']]:[]),[`Игр до ${ddmm(week?.end||h.week.to)}`,'num wide-only'],[started?'Прогноз':'Прогноз сезона','num'],['1-е','num'],['Топ-3','num wide-only']];
 const tips={'Очки':'Сыгранные матчи по формуле лиги (Yahoo)','В игре':'Матчи, которые идут сейчас: очки по протоколу ESPN, предварительно','1-е':'Шанс занять 1-е место — оценка модели','Топ-3':'Шанс попасть в первую тройку — оценка модели'};
 for(const [x,c] of cols){const th=el('th',x,c);th.scope='col';if(tips[x])th.title=tips[x];head.append(th);}table.append(head);
 rows.forEach(r=>{const tr=el('tr',null,'clickable'+(r.t===0?' mine':''));
  const name=el('td',null,'team');name.append(teamName(r.t));if(r.t===0)name.append(' ',el('span','ты','chip chip--accent'));
  // Equal points share a place, as on the Teams tab.
  tr.append(el('td',placeLabel(r)),name);
  if(started)tr.append(el('td',int(r.official),'num'));
  if(anyLive)tr.append(el('td',r.now?signed(r.now):'—','num'));
  tr.append(el('td',dec(r.week),'num wide-only'),el('td',int(r.total),'num total'),el('td',chanceText(r.first),'num'),el('td',chanceText(r.top3),'num wide-only'));
  tr.tabIndex=0;tr.setAttribute('aria-label',`${teamName(r.t)}: открыть состав`);
  const open=()=>{setTeam(r.t);writeStored('fbl-season-team',String(team));setView('teams');};
  tr.onclick=open;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};table.append(tr);});
 const box=el('div',null,'sp-block');const head2=el('div',null,'sp-block-head');head2.append(el('h3',started?'Таблица лиги':'Прогноз сезона'));box.append(head2);
 const wrap=el('div',null,'table-scroll');wrap.append(table);box.append(wrap,el('p',(started?'Очки — по формуле лиги на Yahoo из протокола ESPN каждого матча (сразу после финальной сирены). «В игре» — матчи, которые идут сейчас, предварительно. ':'')+'Нажми на команду, чтобы открыть состав. '+CHANCE_NOTE,'sp-note'));
 return box;
}
// "Сезон стартует 21.10" from the Sports.ru calendar, never a hard-coded date.
function seasonStart(){const days=Object.values(live?.clubs||{}).flat().map(g=>g.date).filter(Boolean).sort();return days[0]||null;}
function topPlayers(ctx){
 const own=owners(ctx),rows=[];
 for(const p of players){const g=(live?.players?.[p.sportsId]?.games||[]).filter(fblGame);if(g.length)rows.push({p,total:g.reduce((s,x)=>s+x.points,0),games:g.length});}
 const box=el('div',null,'sp-block sp-top');
 const list=(items,line,value)=>{const ol=el('ol');for(const r of items){const li=el('li'),who=el('div');who.append(el('strong',r.p.name),el('small',line(r)));li.append(who,el('span',value(r),'val'));ol.append(li);}return ol;};
 const free=(p)=>!own.has(p.id);
 if(rows.length){
  const fa=rows.filter(r=>free(r.p)&&r.games>=2).sort((a,b)=>b.total/b.games-a.total/a.games).slice(0,5);
  if(fa.length)box.append(el('h3','Лучшие свободные'),list(fa,r=>`${current(r.p,ctx).positions.join('/')} · ${int(current(r.p,ctx).price)} · ${count(r.games,'матч','матча','матчей')}`,r=>dec(r.total/r.games)+' за матч'));
  box.append(el('h3','Лучшие в сезоне'),list(rows.sort((a,b)=>b.total-a.total).slice(0,5),r=>`${own.has(r.p.id)?teamName(own.get(r.p.id)):'свободен'} · ${dec(r.total/r.games)} за матч`,r=>int(r.total)+' ФО'));
 }else{
  const start=seasonStart(),fa=[...players].filter(p=>p.sportsId&&free(p)&&live?.players?.[p.sportsId]).map(p=>({p,v:perGame(p).value})).sort((a,b)=>b.v-a.v).slice(0,5);
  box.append(el('h3','Лучшие свободные по прогнозу'));
  if(start)box.append(el('p',start<=ctx.today?'Сезон начался: очки появятся после первых матчей.':`Сезон стартует ${ddmm(start)}: пока сравниваем прогнозы.`,'muted'));
  if(fa.length)box.append(list(fa,r=>`${current(r.p,ctx).positions.join('/')} · ${r.p.team||'—'} · ${int(current(r.p,ctx).price)}`,r=>dec(r.v)+' за матч'));
 }
 return box;
}
function alertsBlock(ctx){
 const box=el('div',null,'sp-alerts'),money=teamBank(0,ctx.transfers);
 const alerts=marketAlerts(forGains(ctx),{team:0,bankMoney:money,sort:'month',minGain:20});
 const hurt=ctx.rosters[0].map(id=>byId.get(id)).filter(p=>p&&injuries.get(String(p.espnId)));
 if(!alerts.length&&!hurt.length)return box;
 const head=el('div',null,'sp-block-head');head.append(el('h3','Для тебя'));box.append(head);
 for(const a of alerts.slice(0,3)){const out=byId.get(a.outId),p=el('p',null,'sp-alert');const body=el('span');
  body.append(el('strong',`Продай ${out.name} → купи ${a.player.name}`),document.createTextNode(` · ${signed(a.gain.month)} ФО за 4 недели, ${signed(a.gain.season)} за сезон · `),confidenceBadge(a.why));
  p.append(el('span','📈','sp-alert-icon'),body);box.append(p);}
 for(const p of hurt){const row=el('p',null,'sp-alert'),body=el('span');body.append(el('strong',p.name),document.createTextNode(' — '+injuryText(p)+' '));
  body.append(button('Найти замену',()=>{setTeam(0);writeStored('fbl-season-team','0');setReplacing(p.id);openRows.add(p.id);setView('teams');},'btn-ghost btn-sm'));
  row.append(el('span','🩹','sp-alert-icon'),body);box.append(row);}
 if(alerts.length)box.append(button('Открыть помощника по трансферам',()=>{setTeam(0);writeStored('fbl-season-team','0');setView('transfers');},'btn-primary'));
 return box;
}
export function overview(ctx){
 const wait=needsLive('Таблица лиги');
 const grid=el('div',null,'sp-overview'),left=el('div'),right=el('div');
 if(wait){left.append(...wait);}else{const running=livePoints();left.append(alertsBlock(ctx),standingsTable(ctx,running));}
 right.append(gamesToday(ctx,true,0));if(live)right.append(topPlayers(ctx));
 grid.append(left,right);return [grid];
}
