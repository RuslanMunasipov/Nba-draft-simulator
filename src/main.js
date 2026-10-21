import {playerSearchMatches,playerSearchExact,normalizeSearch} from './player-search.js';
import {onlinePanel} from './online.js';
import {rookieSlotWarnings} from './rookie-watch.js';
import {restoreBudgetDraft,enforceBudget,budgetSummary} from './budget.js';
import {draftValue,riskAdjustedValue} from './valuation.js';
import {playerInsights} from './insights.js';
import {readStored,writeStored,storageFailed,readCache,writeCache} from './storage.js';
import {fetchDatabase} from './database-loader.js';
import './theme.js';
import {reportElement} from './rookie-reports.js';
import {newDraft,pick,undo,replacePick,replayDraft,exportDraft,DEFAULT_CAP,safeUrl,rosterFits,POSITIONS} from './engine.js';
import {teamName,teamLabel} from './teams.js';
import {setSeasonPlayers,setSeasonDatabaseState,initSeasonTabs,seasonLivePanel} from './season-ui.js';
import LEAGUE from '../data/fbl-league.json' with {type:'json'};
import {advanceBots,simulateDraft,draftSummary,seasonSensitivitySimulations,teamRoster} from './simulation.js';
import {riskProfile} from './analysis.js';
import {pickCompletion,completionPlan,replaceCompletion} from './completion.js';
import {DRAFT_PICKS,DRAFT_DATE} from './fbl-draft-2026.js';
import {installDatabase,restartDraft,compactDraft,seasonCatalog} from './database.js';
import {forecastSources,healthLine,seasonRangeLine,rangeMethod,sportsCheckLine} from './forecast-text.js';
import {int,dec,signed,signedDec,pct,count,stampMsk,injuryStatus} from './format.js';
// The league's «белое правило» list (players who count; "none:<team>" entries are findings about rosters, not players).
// It binds our own picks like the rookie rule while a roster with a listed player is still possible (once rivals took
// them all, the plain rules decide instead of blocking every pick); a rival's pick is the league's matter.
const WHITE=(LEAGUE.white||[]).filter(x=>!String(x).startsWith('none:')),whiteOpen=new WeakMap();
function whiteFor(team){
 if(team!==0||!WHITE.length)return null;
 if(!whiteOpen.has(state))whiteOpen.set(state,completionPlan(state,0,{white:WHITE}).possible);
 return whiteOpen.get(state)?WHITE:null;
}
const $=id=>document.getElementById(id);
// The real draft and the training draft are saved apart: bots never write into the real one.
const KEY={LIVE:'fbl-draft',INTERACTIVE:'fbl-draft-practice'};
let mode=readStored('fbl-mode')==='INTERACTIVE'?'INTERACTIVE':'LIVE';
// A compact save holds only the picked players: the catalog is reinstalled from the cached or fetched database.
function readDraft(key){try{const saved=readStored(key)||'';return {state:restoreBudgetDraft(saved),compact:Boolean(JSON.parse(saved||'null')?.compact)};}catch{return {state:newDraft(),compact:false};}}
let {state,compact:needsCatalog}=readDraft(KEY[mode]);
let database;
// While re-picking, legality is checked against the draft as it stood before that pick.
let replacing=null,replaceBase=null;
function target(){return replaceBase||state;}
function el(tag,value,cls){const node=document.createElement(tag);if(value!=null)node.textContent=value;if(cls)node.className=cls;return node;}
const text=(tag,value)=>el(tag,value);
const onClock=(s=target())=>s.picks.length%8;
const playerName=id=>state.players.find(x=>x.id===id)?.name||String(id);

// ---------- Feedback ----------
let toastTimer=null;
function toast(message,kind=''){const t=$('toast');t.textContent=message;t.className='toast'+(kind?' toast--'+kind:'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},kind==='error'?6000:3500);}
// Errors are shown where the GM is looking: next to the control that failed, or as a toast for draft actions.
const ERRORS=[[/JSON|Unexpected token|Expected property/i,'Файл не похож на резервную копию FBL. Выбери .json, скачанный кнопкой «Скачать копию».']];
const humanError=e=>{const m=String(e?.message||e);return ERRORS.find(([re])=>re.test(m))?.[1]||m;};
function showError(error,near){
 const message=humanError(error);
 if(near){near.parentElement.querySelector('.notice--error.inline-error')?.remove();const n=el('p',message,'notice notice--error inline-error');n.setAttribute('role','alert');near.after(n);return;}
 toast(message,'error');
}

// ---------- Modes and saving ----------
function save(){stopReplace();writeStored(KEY[mode],JSON.stringify(compactDraft(state)));render();updateSaveStatus();}
function updateSaveStatus(){
 const failed=storageFailed();
 $('save-state').textContent=failed?'Не сохраняется':'';
 $('storage-status').textContent=failed?'Хранилище браузера недоступно: пики сохранятся только до закрытия страницы. Скачай резервную копию в настройках.':'';
 $('storage-status').hidden=!failed;
}
function applyMode(){
 const training=mode==='INTERACTIVE';
 document.body.dataset.mode=mode;$('draft-mode').value=mode;$('practice').hidden=!training;$('mode-badge').hidden=!training;
}
function setMode(next){
 if(next===mode)return;
 writeStored(KEY[mode],JSON.stringify(compactDraft(state)));
 mode=next;writeStored('fbl-mode',mode);stopReplace();lastScenario=null;
 ({state,compact:needsCatalog}=readDraft(KEY[mode]));
 if(database&&(!state.players.length||needsCatalog)){try{state=installDatabase(state,database);needsCatalog=false;}catch{}}
 seedLive();applyMode();save();toast(mode==='INTERACTIVE'?'Тренировка: отдельный драфт с ботами':'Реальный драфт');
}
// After 18.10 the real draft is the official one (src/fbl-draft-2026.js): a device that never recorded it gets it
// replayed through the draft rules, instead of a live plan for a finished draft. Recorded picks are never overwritten;
// a replay the catalog refuses leaves the draft as it was. Until the next summer, so a new draft can start then.
function seedLive(){
 const today=new Date(Date.now()+3*3600e3).toISOString().slice(0,10),season=today>=DRAFT_DATE&&today<`${Number(DRAFT_DATE.slice(0,4))+1}-08-01`;
 if(mode!=='LIVE'||!season||DRAFT_PICKS.length!==80||state.picks.length||!state.players.length||state.priceMode!=='ON'||state.databaseVersion==='manual')return false;
 const official=replayDraft(state,DRAFT_PICKS);if(official)state=official;return Boolean(official);
}

// ---------- Picking ----------
function startReplace(index){
 replacing=index;replaceBase={...state,picks:state.picks.slice(0,index)};
 $('search').value='';listLimit=30;render();
 $('draft-desk').scrollIntoView({block:'start'});$('search').focus({preventScroll:true});
}
function stopReplace(){replacing=null;replaceBase=null;}
function chooseReplacement(p){
 try{
  const index=replacing,old=state.picks[index];
  // The hard rules first; then the completion with the team's later picks that the replay keeps (not the draft cut at
  // this pick, which let a re-pick strand the team with no legal completion and no warning).
  const result=replacePick(state,index,p.id),plan=replaceCompletion(state,index,p.id,whiteFor(old.team));
  if(!plan.possible&&(old.team===0||mode!=='LIVE'||!confirm(`${p.name}: ${plan.reason}\n\nПо расчёту приложения ${teamName(old.team)} после такой замены не доберёт состав. Если так записано на Sports.ru, всё равно заменить?`)))throw Error(plan.reason);
  if(result.dropped.length&&!confirm(`Пик #${old.number}: ${playerName(old.playerId)} → ${p.name}.\nПосле него станут недопустимы и будут удалены пики: ${result.dropped.map(d=>`#${d.number} ${playerName(d.playerId)}`).join(', ')}. Их нужно будет внести заново. Продолжить?`))return;
  state=result.state.priceMode==='ON'?enforceBudget(result.state):result.state;save();
  toast(`Пик #${old.number}: ${playerName(old.playerId)} → ${p.name}`+(result.dropped.length?` · внеси заново пики с #${result.dropped[0].number}`:''));
 }catch(e){showError(e);}
}
function choose(p){
 if(replacing!==null)return chooseReplacement(p);
 try{
  if(!database&&state.databaseVersion!=='manual'&&state.priceMode!=='ON')throw Error('Дождись загрузки базы с ценами Sports.ru');
  const team=onClock(state),mine=team===0,number=state.picks.length+1;
  // The hard rules (positions, clubs, budget, the rookie at the tenth pick) refuse in pick() before anything is asked.
  // A pick that leaves no legal completion is refused for my team; a rival's real pick on Sports.ru is a fact to record,
  // so in live mode it only needs confirming.
  const next=pick(state,p.id),plan=pickCompletion(state,p.id,whiteFor(team));
  if(!plan.possible&&(mine||mode!=='LIVE'||!confirm(`${p.name}: ${plan.reason}\n\nПо расчёту приложения эта команда после такого пика не доберёт состав. Если пик уже сделан на Sports.ru, всё равно записать?`)))throw Error(plan.reason);
  state=next;if(mode==='INTERACTIVE')state=advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1});
  const hadQuery=Boolean($('search').value);if(hadQuery){$('search').value='';listLimit=30;}
  save();toast(`Пик #${number} · ${teamName(team)} — ${p.name}`);
  if(hadQuery&&!mine)$('search').focus({preventScroll:true});
 }catch(e){save();showError(e);}
}
// Plan buttons act only for my own pick, never while another pick is being redone.
function choosePlanned(p){if(replacing!==null||onClock(state)!==0)return;choose(p);}

// ---------- Player cards ----------
const RISK={'ВЫСОКИЙ':'high','СРЕДНИЙ':'medium','ОТНОСИТЕЛЬНО НИЗКИЙ':'low'};
const openCards=new Set();
function statusChips(p){
 const chips=[];
 for(const i of p.injuries||[]){const s=injuryStatus(i.status);chips.push(el('span',s.label,'chip '+(s.level==='out'?'chip--danger':'chip--warn')));break;}
 if(p.currentRosterStatus==='NOT_IN_CURRENT_SOURCE')chips.push(el('span','Нет в ростере NBA','chip'));
 if(state.priceMode==='ON'&&p.priceStatus!=='VERIFIED')chips.push(el('span','Нет цены Sports.ru','chip chip--warn'));
 return chips;
}
function card(p,analysis=null,readonly=false){
 const article=el('article',null,'player-card'),risk=analysis?.risk||riskProfile(p),level=RISK[risk.level]||'medium';article.dataset.risk=level;
 const details=el('details',null,'card-details'),summary=el('summary',null,'player-toggle');details.dataset.key='card:'+p.id;
 const main=el('div',null,'pc-main'),name=el('h3',null,'pc-name');name.append(p.name);
 if(p.isRookie)name.append(el('span','rookie','chip chip--accent'));
 const price=state.priceMode==='ON'?(p.priceStatus==='VERIFIED'?int(p.price):null):null;
 main.append(name,el('p',[p.positions.join('/'),p.currentRosterStatus==='NOT_IN_CURRENT_SOURCE'?null:p.team,price].filter(Boolean).join(' · '),'pc-meta'));
 const tags=el('div',null,'pc-tags');tags.append(...statusChips(p));if(level==='high')tags.append(el('span','Высокий риск','chip chip--warn'));
 if(tags.children.length)main.append(tags);
 const score=el('div',null,'pc-score'),f=p.forecast,personal=p.espnContext?.individualProjection;
 if(f){score.append(el('strong',dec(f.meanPerGame)),el('small','ФО за матч'),el('small',int(f.meanSeason)+' за сезон'));}
 else if(personal){score.append(el('strong',dec(personal.componentFPPerGame)),el('small','без фолов и +1 за матч'));}
 else if(Number.isFinite(p.projectedFP)){score.append(el('strong',dec(p.projectedFP)),el('small','ориентир'));}
 summary.append(main,score,el('span',null,'pc-chevron'));
 summary.setAttribute('aria-label',`${p.name}: ${f?`${dec(f.meanPerGame)} ФО за матч, ${int(f.meanSeason)} за сезон`:'без прогноза'}. Открыть разбор`);
 details.append(summary);
 // The body is built on first open: thirty closed cards cost almost nothing to render.
 const fill=()=>{if(details.dataset.filled)return;details.dataset.filled='1';details.append(cardBody(p,risk,readonly));};
 details.addEventListener('toggle',()=>{if(details.open){openCards.add(p.id);fill();}else openCards.delete(p.id);});
 if(!readonly&&openCards.has(p.id)){details.open=true;fill();}
 article.append(details);
 if(!readonly)article.append(cardAction(p));
 return article;
}
function cardAction(p){
 const box=el('div',null,'pc-action'),n=state.picks.length;
 if(n===80&&replacing===null){box.hidden=true;return box;}
 const team=onClock(),mine=team===0&&replacing===null;
 const b=el('button',replacing!==null?`На пик #${replacing+1}`:mine?'Выбрать':`Записать за ${teamName(team)}`,mine||replacing!==null?'btn-primary':'btn-secondary');
 b.setAttribute('aria-label',replacing!==null?`Поставить ${p.name} на пик #${replacing+1}`:mine?`Выбрать ${p.name}`:`Записать ${p.name} в пик команды ${teamName(team)}`);
 b.onclick=()=>choose(p);
 // Hard rules disable the button. A completion the app cannot find disables it for my team and in training; for a
 // rival's real pick in live mode it only warns, so the pick made on Sports.ru can still be recorded after confirming.
 let reason='',warn='';
 try{pick(target(),p.id);}catch(e){reason=e.message;}
 if(!reason){
  const plan=replacing!==null?replaceCompletion(state,replacing,p.id,whiteFor(team)):pickCompletion(target(),p.id,whiteFor(team));
  if(plan.possible===false){if(team!==0&&mode==='LIVE')warn=plan.reason;else reason=plan.reason;}
 }
 if(reason){b.disabled=true;const wrap=el('div');wrap.append(el('small',reason));box.append(wrap);box.classList.add('is-blocked');}
 else{
  if(warn)box.append(el('small',`По расчёту приложения команда после этого не доберёт состав: ${warn.charAt(0).toLowerCase()+warn.slice(1)}. Пик с Sports.ru можно записать с подтверждением.`));
  if(replacing!==null){const later=state.picks.findIndex(x=>x.playerId===p.id);if(later>replacing)box.append(el('small',`Уже выбран на пике #${later+1}: перевыбор удалит пики с #${later+1}.`));}
 }
 box.prepend(b);
 return box;
}
// Bot-shared insight strings, adjusted for the screen: Russian injury words and number agreement.
function ruInsight(s){
 return s.replace(/Статус травмы: ([^.]+)\./,(_,list)=>'Сейчас: '+list.split(', ').map(x=>injuryStatus(x).label.toLowerCase()).join(', ')+'.')
  .replace(/всего (\d+) матчей/g,(_,n)=>`всего ${count(Number(n),'матч','матча','матчей')}`)
  .replace(/(\d+) ФО на 1000 бюджета/g,(_,n)=>`${n} ФО на 1${' '}000 бюджета`)
  .replace('Высокий пол:','Надёжная база:').replace(/(\d)\.(\d)/g,'$1,$2').replace(/(?<![\d,-])(\d{4,})(?![\d-])/g,(_,n)=>int(Number(n))).replace(/(\d) ?%/g,'$1\u00a0%');
}
function cardBody(p,risk,readonly){
 const body=el('div',null,'card-body'),f=p.forecast;
 const notes=[];
 for(const i of p.injuries||[])notes.push(`${injuryStatus(i.status).label}${i.date?' · с '+new Date(i.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace(/\.$/,''):''}.`);
 if(p.coverageStatus==='EARLIER_SEASON')notes.push(`Мало матчей в прошлом сезоне: прогноз опирается на сезон ${p.projectionBaseSeason}, текущая нагрузка неизвестна.`);
 if(p.returnContext?.note)notes.push(p.returnContext.note);
 if(!readonly&&replacing===null&&onClock()===0)for(const w of rookieSlotWarnings(state,p))notes.push(w);
 if(notes.length){const box=el('div',null,'pc-block');for(const n of notes)box.append(el('p',n,'warning'));body.append(box);}
 body.append(forecastSummary(p));
 const season=seasonLivePanel(p);if(season)body.append(season);
 const history=sportsHistoryPanel(p);if(history)body.append(history);
 body.append(insightsPanel(p));
 const report=p.isRookie?reportElement({name:p.name}):null;
 if(report){const d=el('details','','inline');d.append(el('summary','Скаутский отчёт'),report);body.append(d);}
 if(!readonly)body.append(adjustControl(p));
 if(p.roleContext){const href=safeUrl(p.roleContext.source),link=el(href?'a':'p',p.roleContext.note);if(href){link.href=href;link.target='_blank';link.rel='noopener';}body.append(link);}
 const more=el('details',null,'card-more');more.dataset.key='more:'+p.id;more.append(el('summary','Как считается прогноз'));
 more.addEventListener('toggle',()=>{if(!more.open||more.dataset.filled)return;more.dataset.filled='1';
  if(f)more.append(forecastCard(p));
  if(p.espnContext){const e=p.espnContext,parts=[e.projectedGames!=null?'прогноз '+count(e.projectedGames,'матч','матча','матчей'):null,Number.isFinite(e.adp)?'средний номер выбора в лигах ESPN (ADP) '+dec(e.adp):null].filter(Boolean);if(parts.length)more.append(el('p','ESPN 2026/27, для справки (в прогноз не входит): '+parts.join(' · ')+'.'));}
  if(p.onlineSummary||p.onlineEvidence)more.append(onlinePanel(p));
 });
 body.append(more);
 return body;
}
// Sports.ru's own fantasy points by season (its formula: the team result bonus, +2 for 10+ minutes), and the same
// seasons by the league's Yahoo formula the forecast uses (fblPerGame: the box-score terms and +1 per game played) when
// the database has them.
function sportsHistoryPanel(p){
 const seasons=Object.entries(p.sportsHistory||{}).reverse();if(!seasons.length)return null;
 const clean=seasons.some(([,s])=>Number.isFinite(s.fblPerGame));
 const box=el('div',null,'pc-block');box.append(el('h4','Sports.ru · ФО по сезонам'));
 const table=el('table',null,'sports-table'),head=el('tr');for(const h of ['Сезон','Матчи','За матч',...(clean?['По формуле FBL']:[]),'Всего'])head.append(el('th',h));table.append(head);
 const row=([season,s])=>{const tr=el('tr');for(const v of [season.replace(/^20(\d\d)-(\d\d)$/,'$1/$2'),String(s.games),dec(s.perGame),...(clean?[dec(s.fblPerGame)]:[]),int(s.points)])tr.append(el('td',v));return tr;};
 for(const s of seasons.slice(0,3))table.append(row(s));box.append(table,el('p',clean?'«За матч» и «Всего» — ФО Sports.ru по его формуле: с бонусом за результат команды и +2 за 10+ минут. «По формуле FBL» — тот же сезон так, как считает лига на Yahoo: статистика матча и +1 за сыгранный матч, без бонусов.':'ФО Sports.ru по его формуле: с бонусом за результат команды и +2 за 10+ минут. В FBL бонусов нет, за сыгранный матч +1.','muted'));
 if(seasons.length>3){const all=el('details',null,'inline'),t=el('table',null,'sports-table');for(const s of seasons.slice(3))t.append(row(s));all.append(el('summary',`Ещё ${count(seasons.length-3,'сезон','сезона','сезонов')}`),t);box.append(all);}
 return box;
}
function insightsPanel(p){
 const {pros,cons}=playerInsights(p,state.players),box=el('div',null,'insights');
 const list=(title,items,cls)=>{if(!items.length)return;const h=el('h4',title,cls),ul=el('ul');for(const x of items)ul.append(el('li',ruInsight(x)));box.append(h,ul);};
 list('Плюсы',pros,'pros');list('Минусы и риски',cons,'cons');
 if(!pros.length&&!cons.length)box.append(el('p','Данных для выводов пока мало.'));
 return box;
}
function forecastSummary(p){
 const f=p.forecast,c=p.sportsCheck,box=el('div',null,'pc-block');box.append(el('h4','Прогноз 2026/27'));
 const personal=p.espnContext?.individualProjection;
 if(f){
  box.append(el('p',`${int(f.meanSeason)} ФО за сезон = ${dec(f.meanPerGame)} за матч × ${count(Math.round(f.games),'матч','матча','матчей')}.`));
  if(Number.isFinite(f.seasonFloor)&&Number.isFinite(f.seasonCeiling))box.append(el('p',seasonRangeLine(f,database?.projectionModelAudit)));
  if(c)box.append(el('p',sportsCheckLine(c)));
 }else if(personal)box.append(el('p',`Индивидуальный прогноз ESPN: ${dec(personal.componentFPPerGame)} ФО за матч без фолов и +1 за матч.`));
 else if(p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR'&&Number.isFinite(p.projectedFP))box.append(el('p',`Групповой ориентир для rookie: ${dec(p.projectedFP)} ФО за матч. Это не персональный прогноз.`));
 else if(Number.isFinite(p.projectedFP))box.append(el('p',`Историческая основа: ${dec(p.projectedFP,2)} ФО за матч.`));
 else box.append(el('p','Прогноза нет.'));
 return box;
}
// Where a forecast comes from, its range and the player's absences: src/forecast-text.js, shared with the season tab.
function forecastCard(p){
 const f=p.forecast,box=el('div',null,'forecast-panel');
 if(f.conditionalOnRoster)box.append(el('p','Условная оценка при возвращении в ротацию NBA: действующий ростер не подтверждён.','warning'));
 if(f.coverageTier==='GROUP_PRIOR')box.append(el('p','Групповая модель роли: высокая неопределённость.','warning'));
 const grid=el('div',null,'forecast-grid');
 for(const [label,value] of [['Минут за матч',dec(f.minutes)],[f.version===4||f.sampleGames?'Потолок матча':'Ролевой потолок',dec(f.gameCeiling)],['Матчей',String(Math.round(f.games))],['Слабый сезон',int(f.seasonFloor)],['Базовый сезон',int(f.meanSeason)],['Сильный сезон',int(f.seasonCeiling)]]){
  const cell=el('div');cell.append(el('small',label),el('strong',value));grid.append(cell);
 }
 box.append(grid);
 box.append(el('p',f.version===4?'Потолок матча — 90-й процентиль собственных матчей игрока за два сезона, сдвинутый к прогнозу ФО за матч (у новичков и у сыгравших за два сезона меньше 10 матчей — игроков того же уровня). '+rangeMethod(f,database?.projectionModelAudit):'Ролевой ориентир сравнивает средние показатели похожих игроков; сезонный диапазон для такой оценки не откалиброван.'));
 if(f.version===4&&f.availability)box.append(el('p',healthLine(f.availability,f,database?.projectionModelAudit)));
 if(f.transfer)box.append(el('p',`С заменами при травмах: ${int(f.slotSeason)} ФО = ${int(f.meanSeason)} своих + ${int(f.transfer.value)} от замены. Длинные пропуски закрывает трансфер: в среднем ${dec(f.transfer.replacedGames)} матча по ${dec(f.transfer.replacementPerGame)} ФО. По этой ценности строится рейтинг драфта.`));
 if(f.scoringBreakdown){
  const table=el('table',null,'scoring-breakdown');table.append(el('caption','Формула FBL (Yahoo: +1 за сыгранный матч, без бонуса за результат) · вклад за матч'));
  const labels={points:'Очки',rebounds:'Подборы',assists:'Передачи',steals:'Перехваты',blocks:'Блоки',fieldGoalMisses:'Промахи с игры',freeThrowMisses:'Промахи штрафных',turnovers:'Потери (×2)',personalFouls:'Фолы',participation:'За сыгранный матч',historicalAdjustment:'Историческая поправка',adjustment:'Поправка (возраст, ESPN)'};
  for(const [key,value] of Object.entries(f.scoringBreakdown)){const row=el('tr');row.append(el('th',labels[key]||key),el('td',signedDec(value,2)));table.append(row);}
  const total=el('tr');total.append(el('th','Итого за матч'),el('td',dec(f.meanPerGame,2)));table.append(total);
  const wrap=el('div',null,'table-scroll');wrap.append(table);box.append(wrap);
 }
 if(f.historicalDownside){const h=f.historicalDownside;box.append(el('p',`Сезон ${h.season}: минусовых матчей ${h.negativeGames} из ${h.games}, худший ${signedDec(h.worstGame)} ФО, худшие 10% матчей в среднем ${dec(h.meanWorstTenPercent)} ФО.`));}
 box.append(el('p',forecastSources(f)));
 return box;
}
// The GM's own forecast adjustments in percent, kept on this device; they change only our plan, not the bots.
let adjust={};try{adjust=JSON.parse(readStored('fbl-adjust')||'{}')||{};}catch{adjust={};}
function setAdjust(p,value){const pct=Math.max(-90,Math.min(200,Math.round(Number(value)||0)));if(pct)adjust[p.id]=pct;else delete adjust[p.id];writeStored('fbl-adjust',JSON.stringify(adjust));planState=null;render();}
function adjustControl(p){
 const row=el('label',null,'adjust-row'),input=el('input');input.type='number';input.step='5';input.inputMode='numeric';input.value=adjust[p.id]??'';input.placeholder='±0';
 input.setAttribute('aria-label','Моя поправка к прогнозу '+p.name+', процентов');input.onchange=()=>setAdjust(p,input.value);
 const label=el('span');label.append(el('strong','Моя поправка, %'),el('small','Меняет только план на этом устройстве'));
 row.append(label,input);return row;
}

// ---------- Plan ----------
// The roster planner runs in its own worker so the live draft stays responsive on a phone.
let planWorker=null,planState=null,planRequest=0;
const myPicks=()=>Array.from({length:10},(_,r)=>r*8+1);
function skeletonBars(n){const sk=el('div',null,'skeleton');sk.setAttribute('aria-hidden','true');for(let i=0;i<n;i++)sk.append(el('span'));return sk;}
function planMessage(title,line,action){
 const box=$('plan');box.removeAttribute('aria-busy');const s=el('div',null,'state');s.append(el('strong',title));if(line)s.append(el('p',line));if(action)s.append(action);box.replaceChildren(s);
}
function renderPlan(){
 const section=document.querySelector('.plan-section'),n=state.picks.length;
 section.hidden=replacing!==null||n===80||!state.players.length;
 if(planState===state)return;
 planState=state;planWorker?.terminate();planWorker=null;const box=$('plan');
 if(section.hidden)return;
 const remaining=myPicks().filter(k=>k>n);
 if(state.priceMode!=='ON'){if(state.databaseVersion==='manual')planMessage('План недоступен','В своей базе нет цен Sports.ru — бюджет не проверяется.');else box.replaceChildren();return;}
 if(!remaining.length){planMessage('Твой состав собран',`Ждём остальные пики до 80-го.`);return;}
 // Keep the last plan on screen while the next one is computed, so the page does not jump after each pick.
 box.setAttribute('aria-busy','true');
 if(box.querySelector('.plan-now')){
  // The old advice may name a player who is gone: keep the layout, drop the names and buttons until the new plan arrives.
  box.classList.add('is-stale');const hero=box.querySelector('.plan-now'),h=hero.offsetHeight;
  hero.style.minHeight=h+'px';hero.replaceChildren(el('span',`Пересчитываю план после пика #${n}…`,'plan-now-label'),skeletonBars(3));
  box.querySelector('.section-heading h2')?.replaceChildren('Обновляю план…');box.querySelectorAll('.plan-box button:not(.method button)').forEach(b=>b.remove());
 }
 else{const head=el('div',null,'section-heading'),h=el('div');h.append(el('p','План драфта','eyebrow'),el('h2','Считаю лучший состав…'));head.append(h);box.replaceChildren(head,el('p',`Перебираю ходы соперников до твоих пиков ${remaining[0]}–${remaining.at(-1)}. Обычно это занимает 5–15 секунд.`),skeletonBars(5));}
 try{planWorker=new Worker(new URL('./plan-worker.js',import.meta.url),{type:'module'});}catch{planMessage('План недоступен','Браузер не поддерживает фоновый расчёт.');return;}
 const snapshot=state,requestId=++planRequest;
 planWorker.onmessage=({data})=>{
  if(state!==snapshot||data.requestId!==planRequest)return;
  planWorker.terminate();planWorker=null;box.classList.remove('is-stale');
  if(data.error){const retry=el('button','Повторить','btn-secondary btn-sm');retry.onclick=()=>{planState=null;renderPlan();};planMessage('План не построен','Попробуй ещё раз.',retry);console.error(data.error);return;}
  const a=data.advice,live=id=>state.players.find(p=>p.id===id);
  if(!a.best){planMessage('Нет допустимого плана','При текущем бюджете, позициях, rookie и белом правиле состав не собрать. Проверь последние пики.');return;}
  box.removeAttribute('aria-busy');
  const value=p=>riskAdjustedValue(p)*82*(1+(adjust[p.id]||0)/100);
  const head=el('div',null,'section-heading'),title=el('div');
  title.append(el('p','План драфта','eyebrow'),el('h2',a.onTheClock?'Твой пик: бери сейчас':`К твоему пику #${a.profile.picks[0]}`));
  head.append(title,el('span',`${int(a.best.value)} ФО`,'chip chip--accent'));
  const now=live(a.best.now.id),hero=el('div',null,'plan-now');
  if(now){
   const f=now.forecast;hero.append(el('span',a.onTheClock?'Лучший выбор':'Лучший вариант к твоему пику','plan-now-label'),el('div',now.name,'plan-now-name'),el('p',[now.positions.join('/'),now.team,int(now.price)].filter(Boolean).join(' · '),'plan-now-meta'));
   const kpis=el('div',null,'kpis'),kpi=(label,v)=>{const k=el('div',null,'kpi');k.append(el('small',label),el('strong',v));kpis.append(k);};
   if(f){kpi('ФО за матч',dec(f.meanPerGame));kpi('За сезон',int(f.meanSeason));}
   const first=a.best.plan.find(x=>x.player.id===now.id);if(!a.onTheClock&&first?.survival!=null)kpi('Шанс дожить',pct(first.survival));
   hero.append(kpis);
   if(a.onTheClock&&replacing===null){const b=el('button',`Выбрать ${now.name}`,'btn-primary');b.onclick=()=>choosePlanned(now);hero.append(b);}
   else hero.append(el('p',`Кнопка появится на твоём пике #${a.profile.picks[0]}. Сейчас выбирает ${teamName(onClock(state))}.`,'plan-wait'));
  }
  const listHead=el('div',null,'plan-head');for(const h of ['Пик','Игрок','Цена','ФО*','Шанс'])listHead.append(el('span',h));
  const plan=el('ol',null,'plan-list');
  for(const x of a.best.plan){const row=el('li'),who=el('span',x.player.name,'plan-name');
   who.append(el('span',`${x.player.positions.join('/')}${x.player.isRookie?' · rookie':''}${adjust[x.player.id]?` · поправка ${signed(adjust[x.player.id])}${' '}%`:''}`,'plan-pos'));
   row.append(el('span','#'+x.pick,'plan-num'),who,el('span',int(x.player.price),'plan-price'),el('span',int(value(x.player)),'plan-fp'),el('span',pct(x.survival),'plan-surv'));plan.append(row);}
  const parts=[head,hero,el('h4','Твои пики по плану'),listHead,plan];
  const alternatives=(a.options||[]).filter(o=>o.player.id!==a.best.now.id);
  if(alternatives.length){
   const options=el('ol',null,'plan-options');
   for(const o of alternatives){
    const row=el('li'),info=el('span',null,'plan-opt-info');
    info.append(el('span',`${o.player.name} · ${int(o.player.price)}`,'plan-name'),el('span',`${o.delta?`${signed(o.delta)} ФО к плану`:'лучший выбор'} · доживёт до #${a.profile.picks[1]??'—'}: ${pct(o.nextSurvival)}`,'plan-opt-meta'));row.append(info);
    const player=live(o.player.id);
    if(a.onTheClock&&player&&replacing===null){const b=el('button','Выбрать','btn-secondary btn-sm plan-pick');b.setAttribute('aria-label','Выбрать '+o.player.name);b.onclick=()=>choosePlanned(player);row.append(b);}
    options.append(row);
   }
   parts.push(el('h4',a.onTheClock?'Если взять другого':'Альтернативы к твоему пику'),options);
  }
  const method=el('details',null,'method');method.append(el('summary','Как считается'),el('p',`${count(a.profile.runs,'симуляция','симуляции','симуляций')} драфта${a.profile.requested>a.profile.runs?` из ${int(a.profile.requested)} (в остальных соперники не нашли допустимого пика)`:''}: в половине соперники — боты приложения, в половине выбирают по ADP ESPN с шумом. Игрок попадает в план, только если доживает до твоего пика с вероятностью от ${pct(a.threshold)}. Затем точная оптимизация суммы ценностей слотов при бюджете, двух слотах на позицию, rookie и белом правиле. *ФО в списке — ценность слота: свои очки игрока плюс очки замены в его длинных пропусках (как «С заменами при травмах» в карточке), минус небольшая поправка на слабый сезон. Поэтому у игроков с риском пропусков она обычно выше, чем «за сезон» в карточке, у остальных — немного ниже. Шанс дожить — ориентир, а не точная вероятность: на повторе драфта 18.10 из игроков с шансом от 80 % соперники забрали 8 %, а не 4 %. Живые GM выбирают иначе, чем боты: план пересчитывается после каждого пика.`));
  parts.push(method);
  box.replaceChildren(...parts);
 };
 planWorker.onerror=()=>{planWorker=null;const retry=el('button','Повторить','btn-secondary btn-sm');retry.onclick=()=>{planState=null;renderPlan();};planMessage('План не построен','Ошибка расчёта.',retry);};
 planWorker.postMessage({state,requestId,runs:50,adjust,white:WHITE});
}

// ---------- My roster and history ----------
// Positions a new player could still take: two slots per position, multi-position players flex between them.
function openSlots(roster){
 const out=[];for(const pos of POSITIONS){let k=0;while(k<2&&rosterFits([...roster,...Array.from({length:k+1},()=>({positions:[pos]}))]))k++;if(k)out.push(k===2?pos+' ×2':pos);}
 return out;
}
function renderRoster(){
 const own=state.picks.filter(p=>p.team===0).map(p=>state.players.find(x=>x.id===p.playerId)).filter(Boolean),box=$('my-roster');
 document.querySelector('#my-team .section-heading .chip').textContent=teamName(0);
 const chips=el('div',null,'roster-summary'),budget=budgetSummary(state,0);
 chips.append(el('span',`${own.length}/10`,'chip'));
 if(state.priceMode==='ON')chips.append(el('span',`Бюджет ${int(budget.spent)} из ${int(state.cap)}`,'chip'));
 const rookie=own.some(p=>p.isRookie);chips.append(el('span',rookie?'Rookie ✓':'Rookie нужен',rookie?'chip chip--accent':'chip chip--warn'));
 const total=own.reduce((s,p)=>s+(p.forecast?.meanSeason||0),0);if(own.length)chips.append(el('span',`Прогноз ${int(total)} ФО`,'chip'));
 const list=el('ol',null,'roster-grid');
 for(let i=0;i<10;i++){const p=own[i];const row=el('li',p?p.name:'Свободно');
  if(p)row.append(el('small',[p.positions.join('/'),state.priceMode==='ON'?int(p.price):null,p.forecast?dec(p.forecast.meanPerGame)+' за матч':null].filter(Boolean).join(' · ')+(p.isRookie?' · rookie':'')));else row.className='empty-slot';list.append(row);}
 const parts=[chips,list];
 if(own.length&&own.length<10){const open=openSlots(own);if(open.length)parts.push(el('p',`Свободные позиции: ${open.join(', ')}`,'muted'));}
 box.replaceChildren(...parts);
}
function renderHistory(){
 const list=$('history'),n=state.picks.length;list.replaceChildren();
 document.querySelector('.history-section summary').textContent=n?`История пиков · ${n}`:'История пиков';
 if(!n)list.append(el('li','Пиков пока нет.','muted'));
 for(const [i,p] of state.picks.entries()){
  if(i%8===0)list.append(el('li',`Раунд ${i/8+1}`,'round'));
  const row=el('li'),who=el('span',null,'pick-who');who.append(el('strong',playerName(p.playerId)),el('small',teamName(p.team)));
  const edit=el('button','Перевыбрать','btn-ghost btn-sm replace-pick');edit.setAttribute('aria-label',`Перевыбрать пик #${p.number}: ${playerName(p.playerId)}`);edit.onclick=()=>startReplace(i);
  if(replacing===i)row.setAttribute('aria-current','true');
  row.append(el('span','#'+p.number,'pick-no'),who,edit);list.append(row);
 }
 const last=state.picks.at(-1);$('undo').disabled=!n;$('undo').textContent=last?`Отменить пик #${last.number}`:'Отменить последний пик';
}

// ---------- Candidates ----------
let listLimit=30,searchTimer=null;
function renderCandidates(){
 const box=$('candidates'),details=$('candidates-box'),raw=$('search').value,query=normalizeSearch(raw),rookies=$('rookies-only').checked;
 if(query||rookies)details.open=true;
 const used=new Set(target().picks.map(p=>p.playerId));
 const available=state.players.filter(p=>!used.has(p.id)&&playerSearchMatches(p,query)&&(!rookies||p.isRookie));
 const exact=p=>playerSearchExact(p,query),away=p=>p.currentRosterStatus==='NOT_IN_CURRENT_SOURCE';
 // Value decides the order; injuries and risk are shown on the card, not used to bury a player.
 available.sort((a,b)=>Number(exact(b))-Number(exact(a))||Number(away(a))-Number(away(b))||Number(Boolean(b.forecast))-Number(Boolean(a.forecast))||draftValue(b)-draftValue(a));
 $('player-count').textContent=!state.players.length?'':query||rookies?`Найдено ${available.length}`:`Доступно ${count(available.length,'игрок','игрока','игроков')}`;
 const shown=available.slice(0,listLimit);
 if(shown.length)box.replaceChildren(...shown.map(p=>card(p)));
 else if(state.players.length){
  const s=el('div',null,'state');
  const taken=query?state.picks.find(x=>playerSearchMatches(state.players.find(p=>p.id===x.playerId)||{name:''},query)):null;
  s.append(el('strong',taken?`${playerName(taken.playerId)} уже выбран`:`Никого не нашли по «${raw.trim()||'фильтру'}»`),el('p',taken?`Пик #${taken.number} · ${teamName(taken.team)}`:'Проверь написание или ищи по фамилии, инициалам, клубу.'));
  const clear=el('button','Сбросить поиск','btn-secondary btn-sm');clear.onclick=()=>{$('search').value='';$('rookies-only').checked=false;renderCandidates();$('search').focus();};s.append(clear);box.replaceChildren(s);
 }else box.replaceChildren();
 $('show-more').hidden=available.length<=listLimit;$('show-more').textContent=`Показать ещё ${Math.min(30,available.length-listLimit)}`;
}

// ---------- Post-draft ----------
// Every GM's roster during the draft; after pick 80 the projected standings, rosters and the export.
let standingsState=null,standings=null;const openTeams=new Set();
function renderPostDraft(){
 const n=state.picks.length,box=$('postdraft');box.hidden=!n||!state.players.length;if(box.hidden)return;
 const complete=n===80,summary=draftSummary(state);
 box.querySelector('.eyebrow').textContent=complete?'Итоги драфта':`Драфт идёт · ${n}/80`;
 box.querySelector('h2').textContent=complete?'Прогноз сезона и составы':'Составы команд';
 if(complete&&standingsState!==state){standingsState=state;try{standings=seasonSensitivitySimulations(state,{runs:5000,seed:1});}catch{standings=null;}}
 const sim=complete?standings:null;
 const rows=summary.map((t,i)=>({...t,mean:sim?sim.teams[i].mean:t.score,sim:sim?.teams[i]})).sort((a,b)=>(b.mean??-1)-(a.mean??-1));
 $('standings-note').textContent=complete?`Прогноз мест по ${int(sim?.runs??0)} сценариям сезона. Проценты — как часто команда занимала место в модели, а не гарантия: травмы, сделки и решения GM меняют сезон.`:'';
 $('standings-note').hidden=!complete;
 if(complete&&sim){
  const table=el('table',null,'standings-table'),head=el('tr');
  for(const [h,cls] of [['#',''],['Команда',''],['Прогноз','num'],['80% сценариев','num wide-only'],['1-е место','num']]){const th=el('th',h,cls);th.scope='col';head.append(th);}table.append(head);
  rows.forEach((t,rank)=>{const tr=el('tr');if(t.team===1)tr.className='mine';
   const team=el('th',null,'team');team.scope='row';team.append(teamName(t.team-1));if(t.team===1)team.append(' ',el('span','ты','chip chip--accent'));
   tr.append(el('td',String(rank+1)),team,el('td',int(t.sim.mean),'num total'),el('td',`${int(t.sim.p10)}–${int(t.sim.p90)}`,'num wide-only'),el('td',dec(t.sim.firstPlaceShare)+' %','num'));table.append(tr);});
  $('standings').replaceChildren(table);
 }else $('standings').replaceChildren();
 box.querySelector('.export-row').hidden=!complete;
 const area=$('export-text');if(!complete){area.hidden=true;area.value='';}else if(!area.hidden)area.value=draftResultsText();
 const rosters=$('team-rosters');rosters.replaceChildren();
 for(const t of rows){
  const team=t.team-1,players=teamRoster(state,team);if(!players.length)continue;
  const details=el('details',null,'team-roster');details.open=openTeams.has(team);
  const sum=el('summary');sum.append(teamName(team),el('span',`${players.length}/10 · ${t.mean==null?'—':int(t.mean)+' ФО'}${state.priceMode==='ON'?` · ${int(t.cost)}`:''}`,'num'));details.append(sum);
  // Opening a team shows its players; one tap on a name opens the full card.
  const fill=()=>{if(details.open&&details.children.length===1)for(const p of players)details.append(card(p,null,true));};
  details.addEventListener('toggle',()=>{if(details.open)openTeams.add(team);else openTeams.delete(team);fill();});fill();
  rosters.append(details);
 }
}
// Plain-text draft results for the commissioner: picks by round, then every roster with its budget.
function draftResultsText(){
 const by=id=>state.players.find(p=>p.id===id),line=p=>`${p.name} (${p.positions.join('/')}, ${p.price??'—'})`;
 const out=[`FBL 2026/27 — итоги драфта (${state.picks.length}/80)`];
 state.picks.forEach((x,i)=>{if(i%8===0)out.push('',`Раунд ${i/8+1}`);out.push(`${x.number}. ${teamName(x.team)} — ${line(by(x.playerId))}`);});
 out.push('','Составы');
 for(let team=0;team<8;team++){const roster=teamRoster(state,team);if(!roster.length)continue;
  out.push('',`${teamLabel(team)} — бюджет ${roster.reduce((s,p)=>s+(p.price||0),0)} / ${state.cap}`);
  for(const p of roster)out.push(`• ${line(p)}${p.isRookie?' · rookie':''}`);}
 return out.join('\n');
}

// ---------- Training ----------
let lastScenario=null;
function renderScenarioAnalysis(){
 const box=$('scenario-results');
 if(!lastScenario||lastScenario.state!==state){box.replaceChildren();if(lastScenario)$('simulation-status').textContent='';lastScenario=null;return;}
 const {result,startPick}=lastScenario;
 if(result.kind==='DRAFT_COMPLETION'){
  const bad=result.runs-result.eligibleRuns;
  $('simulation-status').textContent=`Готово: ${count(result.runs,'вариант','варианта','вариантов')} драфта от пика №${startPick}.${bad?` В ${bad} боты собрали недопустимый состав — они не учтены.`:''}`;
  if(!result.wins){box.replaceChildren(el('p','Есть недопустимый состав, поэтому лидер не определяется.','muted'));return;}
  const table=el('table',null,'standings-table'),head=el('tr');for(const [h,c] of [['Команда',''],['Лидирует','num']])head.append(el('th',h,c));table.append(head);
  result.wins.map((w,i)=>({i,share:w/result.runs})).sort((a,b)=>b.share-a.share).forEach(r=>{const tr=el('tr');if(r.i===0)tr.className='mine';tr.append(el('td',teamName(r.i)),el('td',pct(r.share),'num'));table.append(tr);});
  box.replaceChildren(el('h4','Кто чаще лидирует, если остальные пики сделают боты'),table,el('p','Меняются только пики ботов; матчи не моделируются.','muted'));return;
 }
 $('simulation-status').textContent=`Готово: ${int(result.runs)} сценариев сезона.`;
 const table=el('table',null,'standings-table'),head=el('tr');for(const [h,c] of [['Команда',''],['Прогноз','num'],['80% сценариев','num wide-only'],['1-е место','num']])head.append(el('th',h,c));table.append(head);
 for(const t of [...result.teams].sort((a,b)=>b.base-a.base)){const tr=el('tr');if(t.team===1)tr.className='mine';const first=el('td',dec(t.firstPlaceShare)+' %','num');first.title=`Точность расчёта (Монте-Карло, 95%): ${t.firstPlaceCI.map(x=>dec(x)).join('–')}%. Не учитывает неточность самой модели.`;
  tr.append(el('td',teamName(t.team-1)),el('td',int(t.base),'num'),el('td',`${int(t.p10)}–${int(t.p90)}`,'num wide-only'),first);table.append(tr);}
 const details=el('details',null,'method');details.append(el('summary','Как читать'),el('p',`${result.assumptions.range}. Корреляция: ${result.assumptions.correlation}. «1-е место» — доля первых мест в этих модельных сценариях, а не вероятность победы в FBL.`));
 const wrap=el('div',null,'table-scroll');wrap.append(table);box.replaceChildren(wrap,details);
}
function renderPractice(){
 const n=state.picks.length,busy=$('batch').getAttribute('aria-busy')==='true';
 $('bots').disabled=busy||n===80||onClock(state)===0;$('simulate').disabled=busy||n===80;
 if(!busy)$('batch').textContent=n===80?'Уточнить прогноз мест':'Кто чаще выигрывает · 100 драфтов';
 $('season-runs').closest('label').hidden=n!==80;
}

// ---------- Render ----------
function renderStatus(){
 const n=state.picks.length,t=target(),team=onClock(t),turn=$('turn');
 document.body.classList.toggle('is-replacing',replacing!==null);
 if(!state.players.length)turn.textContent=$('load-retry').hidden?'Загружаю базу игроков…':'База не загружена';
 else if(replacing!==null)turn.textContent=`Перевыбор пика #${replacing+1} · ${teamName(state.picks[replacing].team)}`;
 else if(n===80)turn.textContent='Драфт завершён';
 else if(team===0){turn.replaceChildren(el('span','Твой пик','turn-mine'),` · №${n+1} из 80`);}
 else turn.textContent=`Пик ${n+1}/80 · ${teamName(team)}`;
 document.querySelector('.status-bar').classList.toggle('is-mine',team===0&&n<80&&replacing===null&&state.players.length>0);
 let line='';
 if(state.players.length&&n<80&&replacing===null){
  if(state.priceMode==='ON'){const b=budgetSummary(t,team),reserve=completionPlan(t);line=`Осталось ${int(b.remaining)} из ${int(t.cap)} · ${count(b.slots,'место','места','мест')}`+(reserve?.possible?` · добор от ${int(reserve.minimumRemainingCost)}`:' · добор не найден');}
  else if(state.databaseVersion==='manual')line='Своя база: бюджет не проверяется';
 }
 $('budget-status').textContent=line;
 $('pricing-warning').textContent=state.pricingIssue||'';$('pricing-warning').hidden=!state.pricingIssue;
 $('draft-progress-fill').style.width=(n/80*100)+'%';
 const bar=document.querySelector('.draft-progress');bar.setAttribute('aria-valuenow',String(n));bar.setAttribute('aria-valuetext',`Пик ${Math.min(n+1,80)} из 80, раунд ${Math.min(Math.floor(n/8)+1,10)}`);
 $('replace-banner').hidden=replacing===null;
 if(replacing!==null)$('replace-text').textContent=`Сейчас: ${playerName(state.picks[replacing].playerId)}. Найди замену в поиске.`;
 $('search').placeholder=replacing!==null?`Кого поставить на пик #${replacing+1}?`:'Игрок или клуб NBA';
 const loading=!state.players.length;$('search').disabled=loading;$('rookies-only').disabled=loading;
 document.querySelector('.desk-layout').classList.toggle('is-complete',n===80);
 $('draft-desk').hidden=n===80&&replacing===null;
}
function render(){
 renderStatus();renderRoster();renderHistory();renderCandidates();renderPlan();renderPostDraft();renderPractice();renderScenarioAnalysis();
 // The season tab scores the league with the latest installed forecasts; pick snapshots stay with the draft tab.
 setSeasonPlayers(seasonCatalog(state,database),card);
}

// ---------- Database ----------
let databaseLoading=false;
function banner(kind,message,action){
 const b=$('startup-banner');b.className='notice notice--'+kind;$('startup-status').textContent=message;
 const retry=$('load-retry');retry.hidden=!action;retry.disabled=false;retry.removeAttribute('aria-busy');if(action)retry.textContent=action;b.hidden=false;
}
async function loadDatabase(force=false){
 if(databaseLoading)return;databaseLoading=true;
 const retry=$('load-retry');if(!retry.hidden){retry.disabled=true;retry.setAttribute('aria-busy','true');retry.textContent='Загружаю…';}else banner('info','Загружаю базу игроков…');
 setSeasonDatabaseState('loading');
 // Render a valid cached database before waiting for the network.
 if(!state.players.length||needsCatalog){
  try{const cached=await readCache('fbl-default-db');if(cached){state=installDatabase(state,cached);database=cached;needsCatalog=false;seedLive();save();banner('info','Сохранённая база готова. Проверяю обновление…');}}catch{}
 }
 try{
  const candidate=await fetchDatabase(import.meta.env.BASE_URL+'data/default-draft.json');
  newDraft(candidate.players,DEFAULT_CAP,candidate.priceMode||'OFF');
  if(force||!state.players.length||needsCatalog||(state.databaseVersion&&state.databaseVersion!=='manual')||(!state.picks.length&&!state.databaseVersion)){
   state=installDatabase(state,candidate);database=candidate;needsCatalog=false;seedLive();
   // Applying the fetched database must not depend on storage capacity.
   save();
  }else database=candidate;
  await writeCache('fbl-default-db',candidate);updateSaveStatus();
  const prices=candidate.priceAudit?.capturedAt?` · цены Sports.ru от ${stampMsk(candidate.priceAudit.capturedAt)}`:'';
  $('database-status').textContent=`База: ${count(candidate.coverage.players,'игрок','игрока','игроков')}, rookie ${candidate.coverage.rookies} · обновлена ${stampMsk(candidate.generatedAt)}${prices}. Позиции — по Sports.ru.`;
  // The ready line stays in the (hidden) banner: the browser smoke test waits for it.
  $('startup-status').textContent=`База готова · ${count(state.players.length,'игрок','игрока','игроков')}`;$('startup-banner').hidden=true;$('load-retry').hidden=true;
  setSeasonDatabaseState('ready');
 }catch{
  if(state.players.length){banner('warn',`Нет связи. Работаю на сохранённой базе${database?.generatedAt?' от '+stampMsk(database.generatedAt):''}; пики сохранены.`,'Обновить');setSeasonDatabaseState('ready');}
  else{banner('error','Не удалось загрузить базу игроков. Проверь интернет.','Повторить');setSeasonDatabaseState('error',()=>loadDatabase(true));}
 }finally{databaseLoading=false;updateSaveStatus();render();}
}

// ---------- Controls ----------
$('load-retry').onclick=()=>loadDatabase(true);
$('search').oninput=()=>{listLimit=30;clearTimeout(searchTimer);searchTimer=setTimeout(renderCandidates,120);};
$('rookies-only').onchange=()=>{listLimit=30;renderCandidates();};
$('show-more').onclick=()=>{listLimit+=30;renderCandidates();};
$('draft-mode').onchange=()=>setMode($('draft-mode').value);
$('export-telegram').onclick=async()=>{const value=draftResultsText(),area=$('export-text'),b=$('export-telegram');area.value=value;
 try{await navigator.clipboard.writeText(value);toast('Итоги скопированы');}
 catch{area.hidden=false;area.focus();area.select();area.scrollTop=0;toast('Не удалось скопировать автоматически — выдели текст и скопируй');}
 b.blur();};
$('export-txt').onclick=()=>{const url=URL.createObjectURL(new Blob([draftResultsText()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='fbl-draft-2026-27.txt';a.click();URL.revokeObjectURL(url);};
$('replace-cancel').onclick=()=>{const i=replacing;stopReplace();render();document.querySelectorAll('#history .replace-pick')[i]?.focus();};
// In training the bots answer at once, so undo goes back to before my own last pick, not just the last bot pick.
$('undo').onclick=()=>{
 if(!state.picks.length)return;
 const before=state.picks.length;
 if(mode==='INTERACTIVE'){const last=state.picks.map(p=>p.team).lastIndexOf(0);
  if(last>=0&&before-last>1&&!confirm(`Отменить твой пик #${last+1} и ${count(before-last-1,'ответ','ответа','ответов')} ботов?`))return;
  state=last<0?undo(state):{...state,picks:state.picks.slice(0,last)};}
 else state=undo(state);
 if(state.priceMode==='ON')state=enforceBudget(state);save();
 toast(before-state.picks.length>1?`Отменено пиков: ${before-state.picks.length}`:`Пик #${before} отменён`);
};
$('reset').onclick=()=>{
 const n=state.picks.length;
 if(!confirm(n?`Удалить все ${count(n,'пик','пика','пиков')} (${mode==='INTERACTIVE'?'тренировка':'реальный драфт'}) и начать заново? Резервную копию можно скачать в этих же настройках.`:'Начать драфт заново?'))return;
 state=restartDraft(state,database);lastScenario=null;$('simulation-status').textContent='';const official=seedLive();save();toast(official?`Реальный драфт: восстановлены итоги ${DRAFT_DATE.slice(8)}.${DRAFT_DATE.slice(5,7)}`:'Новый драфт начат');
};
$('refresh-database').onclick=()=>loadDatabase(true);
$('load').onclick=()=>{try{const v=JSON.parse($('data').value);const priced=v.players.every(p=>p.priceStatus==='VERIFIED'&&Number.isFinite(p.price));state={...newDraft(v.players,DEFAULT_CAP,priced?'ON':'OFF'),databaseVersion:'manual'};save();$('settings').open=false;toast('Своя база загружена');}catch(e){showError(e,$('load'));}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([exportDraft(state)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=mode==='INTERACTIVE'?'fbl-training.json':'fbl-draft.json';a.click();URL.revokeObjectURL(url);};
$('restore').onchange=async e=>{const label=e.target.closest('.setting-row');try{const restored=restoreBudgetDraft(await e.target.files[0].text());state=restored.databaseVersion!=='manual'&&database?.priceMode==='ON'?installDatabase(restored,database):restored;save();label.querySelector('.inline-error')?.remove();toast(`Восстановлено: ${count(state.picks.length,'пик','пика','пиков')}`);}catch(err){showError(err,label.lastElementChild);}finally{e.target.value='';}};
function runAction(fn,done){try{state=fn();save();toast(state.picks.length===80?'Драфт завершён — итоги ниже':done);}catch(e){showError(e);}}
$('bots').onclick=()=>runAction(()=>advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1}),'Боты сделали пики до твоего хода');
$('simulate').onclick=()=>runAction(()=>simulateDraft(state,{seed:Number($('seed').value)||1}),'Драфт доигран');
$('batch').onclick=()=>{
 const b=$('batch'),snapshot=state,runs=Number($('season-runs').value);
 b.disabled=true;b.setAttribute('aria-busy','true');b.textContent=state.picks.length===80?`Считаю ${int(runs)} сценариев…`:'Доигрываю 100 драфтов…';renderPractice();
 $('simulation-status').textContent=state.picks.length===80?'Это займёт несколько секунд.':'Это может занять до минуты на телефоне.';
 let worker;const finish=()=>{worker?.terminate();b.disabled=false;b.removeAttribute('aria-busy');renderPractice();};
 try{worker=new Worker(new URL('./batch-worker.js',import.meta.url),{type:'module'});}catch{finish();$('simulation-status').textContent='Браузер не поддерживает расчёт в отдельном потоке.';return;}
 worker.onmessage=({data})=>{finish();if(state!==snapshot){$('simulation-status').textContent='Драфт изменился — запусти расчёт заново.';return;}if(data.error){$('simulation-status').textContent='Расчёт не удался: '+data.error;return;}lastScenario={state:snapshot,result:data.result,startPick:snapshot.picks.length+1};renderScenarioAnalysis();};
 worker.onerror=()=>{finish();$('simulation-status').textContent='Расчёт не удался.';};worker.postMessage({state,seed:Number($('seed').value)||1,seasonRuns:runs});
};
$('season-runs').onchange=renderPractice;

// On a wide screen the player list has its own column, so it starts open.
if(matchMedia('(min-width: 900px)').matches)$('candidates-box').open=true;
applyMode();render();updateSaveStatus();initSeasonTabs(render);loadDatabase();
