// The season tab: its views live in src/season-ui/ (one module per tab, shared state in state.js); this module renders the
// page and wires the tabs.
import {readStored,writeStored} from './storage.js';
import {moscowToday} from './season.js';
import {fblGame} from './standings.js';
import {seasonMethod} from './forecast-text.js';
import {moscowDate,LIVE_MS} from './live.js';
import {count,ddmm,timeMsk,stampMsk} from './format.js';
import {$,VIEWS,setRenderer,attempted,button,byId,context,currentWeek,dbRetry,dbState,el,errorBlock,games,gamesAt,injuries,live,liveAgeHours,loading,loadingBlock,players,refreshSeason,renderSeason,setReplacing,setView,src,tab,transfers,view} from './season-ui/state.js';
import {overview} from './season-ui/overview.js';
import {teams} from './season-ui/teams.js';
import {transfersView} from './season-ui/transfers.js';
import {injuriesView} from './season-ui/injuries.js';
import {playersView} from './season-ui/players.js';
import {awardsView} from './season-ui/awards.js';
import {gamesView} from './season-ui/games.js';
import {rulesView} from './season-ui/rules.js';
export {refreshSeason,setSeasonPlayers,setSeasonDatabaseState,renderSeason} from './season-ui/state.js';
export {seasonLivePanel} from './season-ui/widgets.js';

// ---------- Page ----------
// Written from the code and the in-season calibration (src/forecast-text.js), so its numbers cannot go stale.
const METHOD=seasonMethod();
function statusLine(ctx){
 const week=currentWeek(ctx.today),parts=[week?`Тур ${week.n} · ${ddmm(week.start)}–${ddmm(week.end)}`:`Сегодня ${ddmm(ctx.today)}`];
 if(loading)parts.push('обновляю данные…');else if(live)parts.push(`данные Sports.ru на ${timeMsk(live.collectedAt)}`+(moscowDate(live.collectedAt)!==ctx.today?` ${ddmm(moscowDate(live.collectedAt))}`:''));
 if(!loading&&gamesAt&&games.some(g=>g.state==='in'))parts.push(`счёт ESPN на ${new Date(gamesAt+3*3600e3).toISOString().slice(11,19)} МСК, обновляется каждые ${LIVE_MS/1e3} с`);
 return parts.join(' · ');
}
function warnings(ctx){
 const out=[],age=liveAgeHours();
 if(live&&src.live==='stale')out.push(`Sports.ru не ответил — показаны данные от ${stampMsk(live.collectedAt)}.`);
 else if(live&&age>6)out.push(`Данные Sports.ru устарели: последнее обновление ${stampMsk(live.collectedAt)}.`);
 if(src.injuries==='error'&&view!=='injuries')out.push('Отчёт ESPN о травмах недоступен: шансы сыграть считаются без него.');
 else if(src.injuries==='stale')out.push(`Отчёт ESPN о травмах не обновился${src.injuriesAt?' с '+stampMsk(src.injuriesAt):''}: шансы сыграть — по последнему полученному.`);
 if(live&&ctx.connected.size<8)out.push(`К Sports.ru подключено ${ctx.connected.size} из 8 команд: остальные трансферы — из журнала лиги.`);
 // A played game of a rostered player without FBL points (no ESPN line yet) is left out of every total until ESPN's box
 // score comes: the screens say so instead of counting Sports.ru's own number.
 const missing=live?[...new Set(ctx.rosters.flat())].reduce((n,id)=>n+(live.players?.[byId.get(id)?.sportsId]?.games||[]).filter(g=>g.played&&!fblGame(g)).length,0):0;
 if(missing)out.push(`Протокола ESPN пока нет у ${count(missing,'матча','матчей','матчей')} игроков FBL: их очки по формуле лиги пока не посчитаны.`);
 return out.map(w=>{const n=el('p',null,'notice notice--warn');n.append(el('p',w));return n;});
}
function render(busy=false){
 const root=$('season-body');if(!root||tab()!=='season')return;
 if(!players.length){
  $('season-status').textContent='';
  root.replaceChildren(dbState==='error'?errorBlock('Не удалось загрузить базу игроков','Проверь интернет и повтори.',()=>dbRetry?.()):loadingBlock('Загружаю базу игроков…'));
  return;
 }
 // One automatic attempt per page: a failed source shows its error and a retry button instead of polling in a loop.
 if(!live&&!loading&&!attempted&&!busy){refreshSeason();return;}
 const ctx=context();
 $('season-status').textContent=statusLine(ctx);
 const nav=el('nav',null,'season-nav segmented');nav.setAttribute('aria-label','Разделы сезона');
 for(const [k,label] of VIEWS){const b=el('button',label);b.type='button';b.setAttribute('aria-pressed',String(view===k));b.onclick=()=>{setReplacing(null);setView(k);};nav.append(b);}
 const content=view==='teams'?teams(ctx):view==='players'?playersView(ctx):view==='awards'?awardsView():view==='transfers'?transfersView(ctx):view==='injuries'?injuriesView(ctx):view==='games'?gamesView(ctx):view==='rules'?rulesView(ctx):overview(ctx);
 const parts=[nav,...warnings(ctx),...content];
 if(METHOD[view]&&live){const method=el('details',null,'method');method.dataset.key='method:'+view;method.append(el('summary','Как считается'));const ul=el('ul');for(const l of METHOD[view])ul.append(el('li',l));method.append(ul);parts.push(method);}
 // Keep the replacement search focused and its caret in place across a re-render.
 const focused=document.activeElement,wasSearch=focused?.closest?.('#season-body')&&focused.type==='search',caret=wasSearch?focused.selectionStart:null,searchBox=focused?.closest?.('.mk-search')?'.mk-search':'.sp-replace';
 // Open blocks (stat lines, dossiers, method notes) stay open across the 20-second live refresh. A lazily filled block
 // gets its toggle event at once, so the blocks nested in what it adds can be reopened in the next pass.
 const open=new Set([...root.querySelectorAll('details[data-key]')].filter(d=>d.open).map(d=>d.dataset.key));
 root.replaceChildren(...parts);
 for(let pass=0,again=true;again&&pass<4;pass++){again=false;
  for(const d of root.querySelectorAll('details[data-key]'))if(!d.open&&open.has(d.dataset.key)){d.open=true;d.dispatchEvent(new Event('toggle'));again=true;}}
 if(wasSearch){const s=root.querySelector(searchBox+' input[type=search]');if(s){s.focus({preventScroll:true});try{s.setSelectionRange(caret,caret);}catch{}}}
}
export function initSeasonTabs(onDraft){
 const set=t=>{document.body.dataset.tab=t;writeStored('fbl-tab',t);$('season').hidden=t!=='season';$('draft-view').hidden=t==='season';
  for(const b of document.querySelectorAll('[data-tab-button]'))b.setAttribute('aria-pressed',String(b.dataset.tabButton===t));
  if(t==='season'){renderSeason();if(live)refreshSeason();}else onDraft?.();};
 for(const b of document.querySelectorAll('[data-tab-button]'))b.onclick=()=>set(b.dataset.tabButton);
 $('season-refresh').onclick=()=>refreshSeason();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&tab()==='season'&&live)refreshSeason();});
 set(readStored('fbl-tab')||(moscowToday()>'2026-10-18'?'season':'draft'));
}
setRenderer(render);
