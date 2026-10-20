import {playerSearchMatches,playerSearchExact,playerSearchLabel,normalizeSearch} from './player-search.js';
import {onlinePanel} from './online.js';
import {rookieWatch,rookieSlotWarnings} from './rookie-watch.js';
import {restoreBudgetDraft,enforceBudget,budgetSummary} from './budget.js';
import {draftValue,riskAdjustedValue} from './valuation.js';
import {playerInsights} from './insights.js';
import './model-audit.js';
import {readStored,writeStored,storageFailed,readCache,writeCache} from './storage.js';
import {fetchDatabase} from './database-loader.js';
import './theme.js';
import {reportElement} from './rookie-reports.js';
import './baseline.js';
import './history.js';
import {newDraft,pick,undo,replacePick,exportDraft,importDraft,recommendations,riskPriority,DEFAULT_CAP,safeUrl} from './engine.js';
import {teamName,teamLabel} from './teams.js';
import {setSeasonPlayers,initSeasonTabs} from './season-ui.js';
import LEAGUE from '../data/fbl-league.json' with {type:'json'};
// The league's «белое правило» list (players who count; "none:<team>" entries are findings about rosters, not players).
const WHITE=(LEAGUE.white||[]).filter(x=>!String(x).startsWith('none:'));
import {advanceBots,simulateDraft,draftSummary,seasonSensitivitySimulations,teamRoster} from './simulation.js';
import {analyzeRecommendations,riskProfile} from './analysis.js';
import {renderTiming} from './timing-ui.js';
import {rookieRecommendations} from './rookies.js';
import {pickCompletion,completionPlan} from './completion.js';
import {installDatabase,restartDraft,compactDraft} from './database.js';
const $=id=>document.getElementById(id);
// A compact save holds only the picked players: the catalog is reinstalled from the cached or fetched database.
let state,needsCatalog=false;try{const saved=readStored('fbl-draft')||'';needsCatalog=Boolean(JSON.parse(saved||'null')?.compact);state=restoreBudgetDraft(saved);}catch{state=newDraft();}
let database;
let adviceWorker,adviceWorkerState;
let adviceRequest=0;
let mode=readStored('fbl-mode')||'LIVE';
// While re-picking, legality is checked against the draft as it stood before that pick.
let replacing=null,replaceBase=null,replaceNote='';
function target(){return replaceBase||state;}
function startReplace(index){replacing=index;replaceBase={...state,picks:state.picks.slice(0,index)};replaceNote='';render();$('turn').scrollIntoView({block:'start'});}
function stopReplace(){replacing=null;replaceBase=null;}
function save(){stopReplace();writeStored('fbl-draft',JSON.stringify(compactDraft(state)));render();updateSaveStatus();}
function updateSaveStatus(){
 const message=storageFailed()?'Хранилище недоступно: пики только до закрытия страницы. Сохрани резервную копию в настройках.':'Сохранение на устройстве';
 $('save-state').textContent=message;$('storage-status').textContent=storageFailed()?message:'';
 $('storage-status').hidden=!storageFailed();
}
function showError(error){const message='Не удалось выполнить: '+error.message;$('simulation-status').textContent=message;$('draft-message').textContent=message;$('draft-message').hidden=false;}
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function renderScenarioAnalysis(result,startPick){
 const box=$('scenario-results');box.replaceChildren();
 const seconds=(result.elapsedMs/1000).toFixed(2);
 if(result.kind==='DRAFT_COMPLETION'){
  $('simulation-status').textContent=`${result.runs} вариантов завершения драфта от пика №${startPick} за ${seconds} с · допустимых ${result.eligibleRuns}/${result.runs}.`;
  if(result.wins){
   const list=document.createElement('ol');
   result.wins.forEach((count,i)=>list.append(text('li',`${teamName(i)}: первое место по базовому сезонному прогнозу в ${count.toFixed(1)} из ${result.runs} вариантов`)));
   box.append(list,text('p','Меняются только оставшиеся пики ботов. Это не симуляция матчей и не вероятность победы в FBL.'));
  }else box.append(text('p','Есть недопустимый состав, поэтому лидер не определяется.'));
  return;
 }
 $('simulation-status').textContent=`${result.runs} сценариев неопределённости сезона за ${seconds} с. Быстрый расчёт выполняется локально в отдельном потоке.`;
 const table=document.createElement('table');table.className='scoring-breakdown';
 const caption=text('caption','Итог по сезонным ФО Sports.ru');table.append(caption);
 const head=document.createElement('thead'),headRow=document.createElement('tr');
 for(const label of ['GM','База','P10–P90 сценариев','Первые места'])headRow.append(text('th',label));head.append(headRow);table.append(head);
 const body=document.createElement('tbody');
 for(const team of result.teams){const row=document.createElement('tr');row.append(text('th','GM '+team.team),text('td',team.base.toFixed(0)),text('td',`${team.p10.toFixed(0)}–${team.p90.toFixed(0)}`),text('td',team.firstPlaceShare.toFixed(1)+'% (95% ДИ '+team.firstPlaceCI.map(x=>x.toFixed(1)).join('–')+'%)'));body.append(row);}
 table.append(body);box.append(table);
 const details=document.createElement('details');details.append(text('summary','Как читать сезонные сценарии'),text('p',`${result.assumptions.range}. Корреляция: ${result.assumptions.correlation}.`),text('p','«Первые места» — доля первых мест только в этих модельных сценариях, не вероятность победы в FBL. Не моделируются трансферы, waiver, недельный календарь, решения GM и новые травмы вне заложенного диапазона.'));
 box.append(details);
}
const matches=playerSearchMatches;
function chooseReplacement(p){
 try{
  const index=replacing,old=state.picks[index],name=id=>state.players.find(x=>x.id===id)?.name||id;
  const plan=pickCompletion(replaceBase,p.id);if(!plan.possible)throw Error(plan.reason);
  const result=replacePick(state,index,p.id);
  if(result.dropped.length&&!confirm(`Пик #${old.number}: ${name(old.playerId)} → ${p.name}.\nПосле него станут недопустимы и будут удалены пики: ${result.dropped.map(d=>`#${d.number} ${name(d.playerId)}`).join(', ')}. Их нужно будет внести заново. Продолжить?`))return;
  state=result.state.priceMode==='ON'?enforceBudget(result.state):result.state;save();
  replaceNote=`Пик #${old.number} заменён: ${name(old.playerId)} → ${p.name}. `+(result.dropped.length?`Удалены пики с #${result.dropped[0].number}: внеси их заново.`:'Остальные пики сохранены.');render();
 }catch(e){showError(e);}
}
function choose(p){$('draft-message').hidden=true;replaceNote='';if(replacing!==null)return chooseReplacement(p);try{if(!database&&state.databaseVersion!=='manual'&&state.priceMode!=='ON')throw Error('Дождись загрузки базы с ценами Sports.ru');const plan=pickCompletion(state,p.id),mine=state.picks.length%8===0;
 // A pick that leaves no legal completion is refused for my team; a rival's real pick on Sports.ru is a fact to record,
 // so in live mode it only needs confirming (the hard rules — positions, clubs, budget — still apply in pick()).
 if(!plan.possible&&(mine||mode!=='LIVE'||!confirm(`${p.name}: ${plan.reason}\n\nПо расчёту приложения эта команда после такого пика не доберёт состав. Если пик уже сделан на Sports.ru, всё равно записать?`)))throw Error(plan.reason);
 state=pick(state,p.id);if(mode==='INTERACTIVE')state=advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1});save();$('simulation-status').textContent='Выбор сохранён.';}catch(e){save();showError(e);}}
function card(p,analysis=null,readonly=false){
 const el=document.createElement('article');el.className='player-card';
 const individualRookie=p.isRookie&&p.espnContext?.individualProjection;
 el.append(text('h3',p.name+(p.isRookie?' · rookie':'')));
 const risk=analysis?.risk||riskProfile(p);el.append(text('strong','Риск: '+risk.level));
 el.append(text('p',[p.team,p.positions.join('/'),state.priceMode==='ON'?(p.priceStatus==='VERIFIED'?p.price+' ед.':'цена отсутствует'):null].filter(Boolean).join(' · ')));
 el.append(text('small',playerSearchLabel(p)));
 if(p.forecast)el.append(text('strong',`${p.forecast.meanPerGame.toFixed(1)} ФО/матч · ${Math.round(p.forecast.meanSeason)} ФО за сезон`));
 else if(individualRookie)el.append(text('strong',`Индивидуальный прогноз: ${individualRookie.componentFPPerGame.toFixed(1)} частичных ФО/матч; фолы и бонусы не учтены. Сравнение — в блоке rookie.`));
 else if(p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR'&&Number.isFinite(p.projectedFP))el.append(text('strong','Групповой ориентир rookie: '+p.projectedFP.toFixed(1)+' базовых ФО/матч. Это не персональный прогноз.'));
 else if(Number.isFinite(p.projectedFP))el.append(text('strong','Историческая основа: '+p.projectedFP.toFixed(2)+' ФО/матч'));else el.append(text('span',''));
 if(p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR'&&!individualRookie)el.append(text('p','Групповой исторический ориентир, не персональный прогноз.'));
 if(p.coverageStatus==='EARLIER_SEASON')el.append(text('p','Пропуск/малая выборка последнего сезона: автоматически использована база '+p.projectionBaseSeason+'. Текущая нагрузка неизвестна.'));
 if(p.injuries?.length)el.append(text('p','Статус источника: '+p.injuries.map(i=>(i.status||'неизвестно')+' ('+(i.date||'дата неизвестна')+')').join(', ')));
 if(p.returnContext)el.append(text('p',p.returnContext.note));
 // Sports.ru history and our forecast come first; sources, formula and career sit under «Подробнее».
 el.append(sportsHistoryPanel(p));
 if(p.forecast)el.append(forecastSummary(p));
 el.append(insightsPanel(p));
 el.append(adjustControl(p));
 if(p.roleContext){const href=safeUrl(p.roleContext.source),link=document.createElement(href?'a':'span');if(href)link.href=href;link.textContent=p.roleContext.note;el.append(link);}
 if(analysis&&!individualRookie)el.append(text('p',analysis.conclusion));
 const more=document.createElement('details');more.className='card-more';more.append(text('summary','Подробнее: формула, источники, карьера'));
 if(p.forecast)more.append(forecastCard(p));
 if(p.espnContext){const source=p.espnContext;more.append(text('p',`ESPN 2026/27: ${[source.projectedGames!=null?'прогноз матчей '+source.projectedGames:null,Number.isFinite(source.adp)?'ADP '+source.adp.toFixed(1):null].filter(Boolean).join(' · ')}.`));}
 if(p.positionStatus==='SPORTS_RU_VERIFIED')more.append(text('small','Позиция Sports.ru. Yahoo (для переноса): '+(p.yahooPositions?.join('/')||'не подтверждена')+'.'));
 if(p.sourceUpdatedAt)more.append(text('small','Срез ростера ESPN: '+new Date(p.sourceUpdatedAt).toLocaleString('ru-RU')));
 if(p.onlineSummary||p.onlineEvidence)more.append(onlinePanel(p));
 el.append(more);
 const b=text('button','Выбрать '+p.name);b.onclick=()=>choose(p);
 if(readonly)b.hidden=true;
 else{
 if(replacing!==null)b.textContent=`Поставить на пик #${replacing+1}: ${p.name}`;
 if(pickCompletion(target(),p.id).possible===false){b.disabled=true;b.title=pickCompletion(target(),p.id).reason;}
 try{pick(target(),p.id);}catch(e){b.disabled=true;b.title=e.message;el.append(text('small',e.message));}
 }
 el.append(b);
 el.children[1]?.classList.add('risk-badge');el.children[2]?.classList.add('player-meta');el.children[4]?.classList.add('player-score');
 el.dataset.risk=risk.level.includes('ВЫСОКИЙ')?'high':risk.level.includes('СРЕДНИЙ')?'medium':'low';
 organizeCard(el,b,5);
 for(const warning of rookieSlotWarnings(state,p)){const notice=text('p',warning);notice.className='warning';el.insertBefore(notice,b);}
 return el;
}


// Official Sports.ru fantasy points are the reference the forecast is checked against.
function sportsHistoryPanel(p){
 const box=document.createElement('div');box.className='sports-history';
 box.append(text('strong','Sports.ru · официальные ФО по сезонам'));
 const seasons=Object.entries(p.sportsHistory||{});
 if(!seasons.length){box.append(text('p','На Sports.ru сезонов нет: новичок или не играл в NBA.'));return box;}
 const table=document.createElement('table');table.className='sports-table';
 const head=document.createElement('tr');for(const h of ['Сезон','Матчи','ФО/матч','ФО всего'])head.append(text('th',h));table.append(head);
 for(const [season,s] of seasons.reverse()){const row=document.createElement('tr');for(const v of [season,String(s.games),s.perGame.toFixed(1),String(Math.round(s.points))])row.append(text('td',v));table.append(row);}
 box.append(table);return box;
}
function insightsPanel(p){
 const {pros,cons}=playerInsights(p,state.players),box=document.createElement('div');box.className='insights';
 const list=(title,items,cls)=>{if(!items.length)return;const h=text('strong',title);h.className=cls;const ul=document.createElement('ul');for(const x of items)ul.append(text('li',x));box.append(h,ul);};
 list('Плюсы',pros,'pros');list('Минусы и риски',cons,'cons');
 if(!pros.length&&!cons.length)box.append(text('small','Недостаточно данных для выводов.'));
 return box;
}
function forecastSummary(p){
 const f=p.forecast,c=p.sportsCheck,box=document.createElement('div');box.className='forecast-summary';
 box.append(text('strong',`Прогноз 2026/27: ${f.meanPerGame.toFixed(1)} ФО/матч × ${Math.round(f.games)} матчей = ${Math.round(f.meanSeason)} ФО`));
 if(Number.isFinite(f.seasonFloor)&&Number.isFinite(f.seasonCeiling))box.append(text('small',`Диапазон сезона: ${Math.round(f.seasonFloor)}–${Math.round(f.seasonCeiling)} ФО (слабый–сильный)`));
 if(c)box.append(text('small',`${c.flag?'⚠ ':''}${c.gap>0?'+':''}${Math.round(c.gap*100)}% к сезону ${c.season} на Sports.ru (${c.perGame.toFixed(1)} ФО/матч).${c.flag?' Проверь роль, состав или травму и при необходимости задай поправку.':''}`));
 if(p.injuries?.length)box.append(text('small','Статус: '+p.injuries.map(i=>i.status||'неизвестно').join(', ')));
 if(p.returnContext?.note)box.append(text('small',p.returnContext.note));
 return box;
}
// Where a forecast comes from, in one sentence: the career model, ESPN, the draft-pick model and their numbers.
function forecastSources(f){
 if(f.version!==4)return `Основа: ${f.origin==='ESPN_INDIVIDUAL'?'индивидуальный прогноз ESPN':'исторический ориентир'}. Исторических матчей для разброса: ${f.sampleGames??0}.${f.rookieExtrapolation&&f.analogs?.length?' Аналоги для оценки разброса: '+f.analogs.map(a=>a.name).join(', ')+'.':''}`;
 const m=f.sources?.model,e=f.sources?.espn,parts=[];
 if(m)parts.push(`${f.draftPick?`модель новичков (пик №${f.draftPick})`:f.origin==='UNDRAFTED_ROOKIE_MODEL'?'модель незадрафтованных новичков':'модель по карьере'}: ${m.perGame.toFixed(1)} ФО/матч × ${Math.round(m.games)} матчей`);
 if(e)parts.push(`ESPN: ${e.perGame.toFixed(1)} × ${Math.round(e.games)}`);
 return `Основа: ${parts.join('; ')}${e?' — итог их среднее':''}.${Number.isFinite(f.shortSeasonRisk)?` Риск короткого сезона (меньше четверти матчей): ${Math.round(f.shortSeasonRisk*100)}%.`:''}`;
}
const SEASON_END={healthy:'прошлый сезон закончил в строю',endedOut:'прошлый сезон закончил с пропуском 10+ матчей',noGames:'прошлый сезон пропустил целиком'};
// Health in numbers: the absence chain's personal spell rates against the league and the games range they imply.
function healthLine(a){
 const per=(x)=>x.toFixed(1);
 return `Здоровье (цепь пропусков по логам 2002–2026): коротких пропусков (1–3 матча) ${per(a.shortSpellsPer82)} за 82 матча при ${per(a.leagueShortSpellsPer82)} у ровесников, длинных (4+) ${per(a.longSpellsPer82)} при ${per(a.leagueLongSpellsPer82)}; ${SEASON_END[a.lastSeasonEnd]??'конец прошлого сезона неизвестен'}. ${a.healthyNow?`Сейчас травм в отчёте ESPN нет: сезон начинается в строю (без этого было бы ${Math.round(a.unconditionalGames)} матчей по модели). `:''}Это вероятности, а не обещанные пропуски: матчей с вероятностью 80% ${a.gamesRange[0]}–${a.gamesRange[1]}, медиана ${a.gamesMedian}.`;
}
function forecastCard(p){
 const f=p.forecast,box=document.createElement('div');box.className='forecast-panel';
 if(f.basis)box.append(text('p',f.basis));
 if(f.conditionalOnRoster)box.append(text('p','Условная оценка при возвращении в NBA-ротацию: действующий ростер не подтверждён.'));
 if(f.coverageTier==='GROUP_PRIOR')box.append(text('strong','Групповая модель роли · высокая неопределённость'));
 box.append(text('h4','Прогноз и потолок · NBA Ceiling'));
 const grid=document.createElement('div');grid.className='forecast-grid';
 for(const [label,value] of [['ФО / матч',f.meanPerGame.toFixed(1)],['Матчей',Math.round(f.games)],['Минут / матч',f.minutes.toFixed(1)],[f.sampleGames?'Верхний ориентир матча':'Верхний ролевой ориентир',f.gameCeiling.toFixed(1)],['Базовый сезон',Math.round(f.meanSeason)],['Сильный сезон',Math.round(f.seasonCeiling)],['Слабый сезон',Math.round(f.seasonFloor)]]){
  const cell=document.createElement('div');cell.append(text('small',label),text('strong',String(value)));grid.append(cell);
 }
 if(f.version===4&&f.availability)box.append(text('p',healthLine(f.availability)));
 if(f.transfer)box.append(text('p',`Ценность слота с заменами: ${Math.round(f.slotSeason)} ФО = ${Math.round(f.meanSeason)} своих + ${Math.round(f.transfer.value)} от замены. Длинные пропуски (4+ матча) после ${f.transfer.delayGames} матчей закрывает трансфер: в среднем ${f.transfer.replacedGames.toFixed(1)} матча по ${f.transfer.replacementPerGame.toFixed(1)} ФО (лучшие свободные на позиции после 16 стартеров лиги). По этой ценности строится рейтинг драфта.`));
 if(f.version===4)box.append(grid,text('p','Потолок матча — 90-й процентиль собственных матчей игрока за два сезона (у новичков — игроков того же уровня). Слабый и сильный сезон — 10-й и 90-й процентили, откалиброванные на прошлых сезонах; они учитывают и ФО за матч, и число матчей.'));
 else box.append(grid,text('p',f.sampleGames?'Потолок матча — сильная отдельная игра. Сильный сезон учитывает одновременно изменение результативности и числа матчей; он не равен потолку матча × 82.':'Ролевой ориентир сравнивает средние показатели исторических игроков. Это не индивидуальный P90 матча; сезонный диапазон для такой оценки не откалиброван.'));
 const c=f.components,formula=document.createElement('details');
 if(f.scoringBreakdown){
  const table=document.createElement('table');table.className='scoring-breakdown';
  table.append(text('caption','Полная формула · вклад за матч'));
  const body=document.createElement('tbody');
  const labels={points:'Очки',rebounds:'Подборы',assists:'Передачи',steals:'Перехваты',blocks:'Блоки',fieldGoalMisses:'Промахи с игры',freeThrowMisses:'Промахи штрафных',turnovers:'Потери × −2',personalFouls:'Фолы',participation:'Бонус минут',teamResult:'Результат команды',historicalAdjustment:'Историческая поправка',adjustment:'Поправка (возраст, оценка ESPN)'};
  for(const [key,value] of Object.entries(f.scoringBreakdown)){const row=document.createElement('tr');row.append(text('th',labels[key]),text('td',(value>=0?'+':'')+value.toFixed(2)));body.append(row);}
  const total=document.createElement('tr');total.append(text('th','Итого ФО / матч'),text('td',f.meanPerGame.toFixed(2)));body.append(total);table.append(body);box.append(table);
  box.append(text('p',`Потери уже учтены: ${(-f.scoringBreakdown.turnovers/2).toFixed(1)} за игру стоят ${f.scoringBreakdown.turnovers.toFixed(1)} ФО/матч и ${Math.round(f.scoringBreakdown.turnovers*f.games)} ФО за прогнозируемый сезон. Дополнительный штраф к рейтингу не применяется.`));
 }
 if(f.historicalDownside){const h=f.historicalDownside;box.append(text('p',`Минусовые матчи · ${h.season}: ${h.negativeGames} из ${h.games}; худшая игра ${h.worstGame.toFixed(1)} ФО; среднее худших 10% игр ${h.meanWorstTenPercent.toFixed(1)} ФО. Это фактическая история игрока, не прогноз частоты минусовых игр.`));}
 formula.append(text('summary','Из чего складываются ФО'),text('p',`Статистика и промахи ${c.countingAndMisses.toFixed(2)} · фолы ${c.personalFouls.toFixed(2)} · минуты +${c.participation.toFixed(2)} · результат команды ${c.teamResult>=0?'+':''}${c.teamResult.toFixed(2)}${c.historicalAdjustment?' · историческая поправка '+c.historicalAdjustment.toFixed(2):''}${c.adjustment?' · поправка '+(c.adjustment>=0?'+':'')+c.adjustment.toFixed(2):''} = ${f.meanPerGame.toFixed(2)} ФО/матч.`));
 formula.append(text('p',forecastSources(f)));
 box.append(formula);return box;
}

function organizeCard(el,b,previewCount){
 const content=[...el.children],details=document.createElement('details'),summary=document.createElement('summary');
 details.className='card-details';summary.className='player-toggle';
 content.slice(0,previewCount).forEach(node=>summary.append(node));
 const hint=text('span','Нажми на имя · полный разбор');hint.className='expand-hint';summary.append(hint);details.append(summary);
 const body=document.createElement('div');body.className='card-body';
 for(const node of content.slice(previewCount)){if(node!==b){
  if(node.tagName==='P'&&node.textContent.startsWith('PTS ')){
   const stats=document.createElement('div');stats.className='stats-grid';
   for(const value of node.textContent.split(' · ')){const stat=text('span',value);stat.className='stat-cell';stats.append(stat);}body.append(stats);
  }else body.append(node);
 }}
 const report=reportElement({name:content[0].textContent.replace(/^\d+\. /,'').replace(' · rookie','')});if(report)body.prepend(report);
 details.append(body);el.replaceChildren(details,b);
}

function renderRookies(){
 if($('rookie-board').hidden)return;
 renderTiming(state);
 const watch=$('rookie-watch');watch.replaceChildren();
 if(state.players.length&&state.picks.length<80){watch.append(text('h3','Сильные rookie · доступность'));
  for(const item of rookieWatch(state)){const row=document.createElement('div');row.append(text('strong',item.player.name),text('p',item.reason));
   if(item.status==='AVAILABLE'){const button=text('button','Взять rookie '+item.player.name);button.onclick=()=>choose(item.player);row.append(button);}watch.append(row);}
 }
 if(state.picks.length===80){$('rookie-advice').replaceChildren();$('rookie-status').textContent='Драфт завершён. Итоговые составы — в разделе тренировки.';return;}
 const result=rookieRecommendations(state);$('rookie-advice').replaceChildren();
 $('rookie-status').textContent=`Индивидуальный прогноз есть в ESPN у ${result.projected} из ${result.available} доступных rookie; легальный добор с ними: ${result.feasible}. Rookie ещё нужен ${result.teamsNeedingRookie} командам.`;
 if(!result.players.length){$('rookie-advice').append(text('p','Нет доступных rookie с индивидуальным прогнозом и допустимым добором. Групповой ориентир не заменяет персональный прогноз.'));return;}
 const leader=result.players[0].espnContext.individualProjection,leaderForecast=result.players[0].forecast;
 for(const [index,p] of result.players.entries()){
  const s=p.espnContext.individualProjection,v=s.perGame,el=document.createElement('article');el.className='player-card';
  el.append(text('h3',`${index+1}. ${p.name} · rookie`),text('strong',p.forecast?`${p.forecast.meanPerGame.toFixed(1)} ФО/матч · ${Math.round(p.forecast.meanSeason)} ФО за сезон`:`${s.componentFPPerGame.toFixed(1)} частичных ФО/матч · ${s.componentSeasonTotal.toFixed(0)} за прогнозируемые ${s.games} игр`));
  el.append(text('p',`${p.team||'Команда не подтверждена'} · ${p.positions.join('/')} · ${state.priceMode==='ON'?p.price+' ед. · ':''}${v.minutes.toFixed(1)} мин/матч · ADP ESPN ${p.espnContext.adp?.toFixed(1)??'нет'}`));
  if(p.injuries?.length)el.append(text('strong','Текущий статус источника: '+p.injuries.map(i=>(i.status||'неизвестно')+' ('+(i.date||'дата неизвестна')+')').join(', ')));
  el.append(text('p',`ESPN: ${s.componentFPPerGame.toFixed(1)} частичных ФО/матч — до оценки фолов и бонусов.`));
  el.append(text('p',`PTS ${v.points.toFixed(1)} · REB ${v.rebounds.toFixed(1)} · AST ${v.assists.toFixed(1)} · STL ${v.steals.toFixed(1)} · BLK ${v.blocks.toFixed(1)} · TOV ${v.turnovers.toFixed(1)}`));
  el.append(text('p',`Нагрузка в прогнозе ESPN: ${v.minutes.toFixed(1)} мин/матч и ${s.games} матчей. Потери: ${v.turnovers.toFixed(1)} за игру, это −${(2*v.turnovers).toFixed(1)} ФО по формуле.`));
  if(index){
   const full=leaderForecast&&p.forecast,gap=full?p.forecast.meanSeason-leaderForecast.meanSeason:s.componentSeasonTotal-leader.componentSeasonTotal;
   el.append(text('p',`Разница с первым вариантом (${result.players[0].name}): ${gap>=0?'+':''}${gap.toFixed(0)} ${full?'ФО за сезон':'частичных ФО ESPN за сезон'}.`));
  }
  el.append(text('p','Роль, сильные стороны и ограничения игрока — в репорте выше. Момент пика сравнивается в блоке «Rookie сейчас или ветеран сейчас».'));
  el.append(text('small','Индивидуальный прогноз ESPN, срез '+new Date(p.espnContext.fetchedAt).toLocaleString('ru-RU')+'. Допуск: '+(p.positionStatus==='YAHOO_ANALYST_PUBLISHED_NOT_PLATFORM_VERIFIED'?'публикация Yahoo Fantasy на NBA.com':p.positionStatus==='SPORTS_RU_VERIFIED'?'Sports.ru':'не подтверждён')+'. Статус rookie — по источнику ESPN.'));
  if(state.priceMode==='ON')el.append(text('p','Цена Sports.ru: '+p.price+' ед.'));
  if(p.forecast)el.append(forecastCard(p));if(p.sportsHistory)el.append(sportsHistoryPanel(p));el.append(adjustControl(p));
  const b=text('button','Выбрать rookie '+p.name);b.onclick=()=>choose(p);el.append(b);
  el.children[1]?.classList.add('player-score');el.children[2]?.classList.add('player-meta');
  organizeCard(el,b,4);
  $('rookie-advice').append(el);
 }
}
function seasonScenarioLabel(){return $('season-runs').value==='20000'?'20 000':'5 000';}
function updateBatchLabel(){$('batch').textContent=state.picks.length===80?`${seasonScenarioLabel()} сценариев сезона`:'100 сценариев драфта';}
// The GM's own forecast adjustments in percent, kept on this device; they change only our plan, not the bots.
let adjust={};try{adjust=JSON.parse(readStored('fbl-adjust')||'{}')||{};}catch{adjust={};}
function setAdjust(p,value){const pct=Math.max(-90,Math.min(200,Math.round(Number(value)||0)));if(pct)adjust[p.id]=pct;else delete adjust[p.id];writeStored('fbl-adjust',JSON.stringify(adjust));planState=null;render();}
function adjustControl(p){
 const row=document.createElement('label');row.className='adjust-row';
 const input=document.createElement('input');input.type='number';input.step='5';input.inputMode='numeric';input.value=adjust[p.id]??'';input.placeholder='0';input.setAttribute('aria-label','Моя поправка к прогнозу '+p.name);
 input.onchange=()=>setAdjust(p,input.value);
 row.append(text('span','Моя поправка к прогнозу, % (роль, состав, мнение экспертов): '),input);return row;
}
// The roster planner runs in its own worker so the live draft stays responsive on a phone.
let planWorker=null,planState=null,planRequest=0;
function renderPlan(){
 if(planState===state)return;
 planState=state;planWorker?.terminate();planWorker=null;const box=$('plan');box.replaceChildren();
 const remaining=Array.from({length:10},(_,r)=>r*8+1).filter(k=>k>state.picks.length);
 if(!state.players.length||!remaining.length||state.priceMode!=='ON')return;
 box.append(text('h3','Оптимальный план десятки'),text('p',`Моделирую соперников и ищу лучший состав на твои пики ${remaining.join(', ')}… (на телефоне до 30 секунд)`));
 try{planWorker=new Worker(new URL('./plan-worker.js',import.meta.url),{type:'module'});}catch{box.lastChild.textContent='Браузер не поддерживает фоновый расчёт плана.';return;}
 const snapshot=state,requestId=++planRequest;
 planWorker.onmessage=({data})=>{
  if(state!==snapshot||data.requestId!==planRequest)return;
  planWorker.terminate();planWorker=null;box.replaceChildren(text('h3','Оптимальный план десятки'));
  if(data.error){box.append(text('p','Не удалось построить план: '+data.error));return;}
  const a=data.advice,live=id=>state.players.find(p=>p.id===id);
  if(!a.best){box.append(text('p','Нет допустимого плана при текущем бюджете, позициях, rookie и белом правиле.'));return;}
  const pct=x=>x==null?'—':Math.round(x*100)+'%',fp=p=>Math.round(riskAdjustedValue(p)*82*(1+(adjust[p.id]||0)/100))+(adjust[p.id]?` (поправка ${adjust[p.id]>0?'+':''}${adjust[p.id]}%)`:'');
  box.append(text('p',(a.onTheClock?`Бери сейчас: ${a.best.now.name}. `:`К твоему пику #${a.profile.picks[0]}: лучший вариант ${a.best.now.name}. `)+`План десятки: ${Math.round(a.best.value)} ФО с учётом риска, бюджет ${a.best.spent} / ${state.cap}.`));
  const cell=(cls,value)=>{const node=text('span',value);node.className=cls;return node;};
  const now=live(a.best.now.id);
  if(now){const hero=document.createElement('div');hero.className='plan-now';hero.append(cell('plan-now-label',a.onTheClock?'Бери сейчас':`К твоему пику #${a.profile.picks[0]}`),card(now));box.append(hero);}
  box.append(text('h4','План десятки'));
  const plan=document.createElement('ol');plan.className='plan-list';
  for(const x of a.best.plan){const row=document.createElement('li');const who=cell('plan-name',x.player.name);who.append(cell('plan-pos',`${x.player.positions.join('/')}${x.player.isRookie?' · rookie':''}`));row.append(cell('plan-num','#'+x.pick),who,cell('plan-price',String(x.player.price)),cell('plan-fp',`${fp(x.player)} ФО`),cell('plan-surv',pct(x.survival)));row.title=`#${x.pick} · ${x.player.name} · ${fp(x.player)} ФО · доживёт ${pct(x.survival)}`;plan.append(row);}
  box.append(plan,text('h4','Цена каждого выбора сейчас'));
  const options=document.createElement('ol');options.className='plan-options';
  for(const o of a.options){
   const row=document.createElement('li'),info=cell('plan-opt-info','');
   info.append(cell('plan-name',`${o.player.name} · ${o.player.price}`),cell('plan-opt-meta',`план ${Math.round(o.value)} ФО${o.delta?` (${Math.round(o.delta)})`:' — лучший'} · доживёт до #${a.profile.picks[1]??'—'}: ${pct(o.nextSurvival)}`));row.append(info);
   const player=live(o.player.id);
   if(a.onTheClock&&player&&replacing===null){const b=text('button','Выбрать');b.className='plan-pick';b.onclick=()=>choose(player);row.append(b);}
   options.append(row);
  }
  box.append(options);
  const method=document.createElement('details');method.className='plan-method';method.append(text('summary','Как считается'),text('small',`Метод: ${a.profile.runs} симуляций драфта соперниками-ботами приложения от текущего состояния; игрок попадает в раунд плана, только если доживает до этого пика с вероятностью ≥${Math.round(a.threshold*100)}%. Затем точная оптимизация (целочисленное программирование) суммы сезонных прогнозов ФО с поправкой на риск при лимите, двух слотах на позицию, rookie и белом правиле (минимум один игрок из списка лиги). Живые GM могут выбирать иначе, чем боты: вероятности приблизительные, план пересчитывается после каждого пика.`));box.append(method);
 };
 planWorker.onerror=()=>{planWorker=null;box.replaceChildren(text('h3','Оптимальный план десятки'),text('p','Ошибка расчёта плана.'));};
 planWorker.postMessage({state,requestId,runs:50,adjust,white:WHITE});
}
// Every GM's roster with expandable cards and the projected standings; partial during the draft, simulated after it.
// Rosters stay open or closed as the GM left them across re-renders after each pick.
let standingsState=null,standings=null;const openTeams=new Set();
function renderPostDraft(){
 const n=state.picks.length,box=$('postdraft');box.hidden=!n||!state.players.length;if(box.hidden)return;
 const complete=n===80,summary=draftSummary(state);
 if(complete&&standingsState!==state){standingsState=state;try{standings=seasonSensitivitySimulations(state,{runs:5000,seed:1});}catch{standings=null;}}
 const sim=complete?standings:null,name=t=>teamLabel(t-1)+(t===1?' (ты)':'');
 const rows=summary.map((t,i)=>({...t,mean:sim?sim.teams[i].mean:t.score,sim:sim?.teams[i]})).sort((a,b)=>(b.mean??-1)-(a.mean??-1));
 $('standings-note').textContent=complete?`Прогноз мест: ${sim?.runs??0} сценариев сезона по прогнозам ФО Sports.ru-формулы (общие колебания лиги, клубов NBA и игроков). Доли — это частота мест в сценариях из диапазонов прогнозов (откалиброваны на прошлых сезонах), а не гарантия: тренеры, травмы и сделки меняют сезон.`:`Драфт идёт (${n}/80): места по сумме прогнозов уже выбранных игроков; доли мест в сценариях появятся после 80-го пика.`;
 const table=document.createElement('table');table.className='standings-table';
 const head=document.createElement('tr');for(const h of complete?['#','GM','Прогноз ФО','P10–P90','1-е место','Места 1–8, %']:['#','GM','Игроков','Сумма прогнозов'])head.append(text('th',h));table.append(head);
 rows.forEach((t,rank)=>{const row=document.createElement('tr');if(t.team===1)row.className='mine';
  const cells=complete&&t.sim?[String(rank+1),name(t.team),Math.round(t.sim.mean).toLocaleString('ru-RU'),`${Math.round(t.sim.p10)}–${Math.round(t.sim.p90)}`,t.sim.firstPlaceShare.toFixed(1)+'%',t.sim.places.map(x=>Math.round(x)).join(' · ')]:[String(rank+1),name(t.team),`${t.players}/10`,t.score==null?'—':Math.round(t.score).toLocaleString('ru-RU')];
  for(const c of cells)row.append(text('td',c));table.append(row);});
 $('standings').replaceChildren(table);
 const rosters=$('team-rosters');rosters.replaceChildren();
 for(const t of rows){
  const team=t.team-1,players=teamRoster(state,team),details=document.createElement('details');details.className='team-roster';details.open=openTeams.has(team);
  details.append(text('summary',`${name(t.team)} · ${players.length}/10 · ${t.mean==null?'—':Math.round(t.mean).toLocaleString('ru-RU')+' ФО'} · бюджет ${t.cost??'—'} / ${state.cap}`));
  // Opening a team shows its player cards directly; one tap on a name opens the full card.
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
function render(){
 const n=state.picks.length;
 updateBatchLabel();
 $('scenario-results').replaceChildren();
 document.querySelector('.hero-meta .limited').textContent=state.priceMode==='ON'?'Salary cap 20 000 · цены Sports.ru':'Ручная база · без бюджета';
 $('draft-rules').textContent=state.priceMode==='ON'?'Лимит 20 000 на команду. Проверяются цены Sports.ru, позиции Sports.ru, rookie и бюджет полного добора.':'Ручная база без подтверждённых цен: бюджет не проверяется.';
 const budget=budgetSummary(state),reserve=state.priceMode==='ON'?completionPlan(state):null;
 $('budget-status').textContent=state.priceMode==='ON'?`${teamName(n%8)}: потрачено ${budget.spent??'неизвестно'} / ${state.cap} · остаток ${budget.remaining??'неизвестно'} · свободно ${budget.slots} мест`+(reserve?.possible?` · минимум на добор ${reserve.minimumRemainingCost}`:' · допустимый добор не найден'):'Ручная база: бюджет отключён';
 $('pricing-warning').textContent=state.pricingIssue||'';$('pricing-warning').hidden=!state.pricingIssue;
 $('draft-progress-fill').style.width=(n/80*100)+'%';document.querySelector('.draft-progress').setAttribute('aria-valuenow',String(n));
 const own=state.picks.filter(p=>p.team===0).map(p=>state.players.find(x=>x.id===p.playerId));
 const ownBox=$('my-roster');ownBox.replaceChildren();
 const ownBudget=budgetSummary(state,0);if(state.priceMode==='ON')ownBox.append(text('strong',`Мой бюджет: ${ownBudget.spent??'неизвестно'} / ${state.cap} · осталось ${ownBudget.remaining??'неизвестно'}`));
 const rookie=own.some(p=>p.isRookie);ownBox.append(text('p',`${own.length}/10 игроков · Rookie: ${rookie?'выбран ✓':'ещё нужен'}`));
 const list=document.createElement('ol');list.className='roster-grid';
 for(let i=0;i<10;i++){const row=text('li',own[i]?own[i].name:'Свободное место');if(own[i])row.append(text('small',own[i].positions.join(' / ')+(own[i].isRookie?' · rookie':'')));else row.className='empty-slot';list.append(row);}ownBox.append(list);
 $('turn').textContent=replacing!==null?`Перевыбор пика #${replacing+1} · ${teamName(state.picks[replacing].team)}`:n===80?'Драфт завершён':`Пик ${n+1} / 80 · ${teamLabel(n%8)}`;
 $('replace-banner').hidden=replacing===null&&!replaceNote;$('replace-cancel').hidden=replacing===null;
 $('replace-text').textContent=replacing!==null?`Сейчас: ${state.players.find(x=>x.id===state.picks[replacing].playerId)?.name}. Найди нового игрока в списке и нажми «Поставить на пик». Советы ниже относятся к следующему пику, а не к перевыбору.`:replaceNote;
 $('history').replaceChildren();for(const [i,p] of state.picks.entries()){const row=text('li',`#${p.number} · ${teamName(p.team)} · ${state.players.find(x=>x.id===p.playerId)?.name||p.playerId} `);const edit=text('button','Перевыбрать');edit.className='replace-pick';edit.onclick=()=>startReplace(i);row.append(edit);$('history').append(row);}
 $('candidates').parentElement.open=Boolean($('search').value||$('rookies-only').checked);
 const query=normalizeSearch($('search').value);
 const used=new Set(target().picks.map(p=>p.playerId));
 const available=state.players.filter(p=>!used.has(p.id)&&matches(p,query)&&(!$('rookies-only').checked||p.isRookie));
 const exact=p=>playerSearchExact(p,query);
 available.sort((a,b)=>Number(exact(b))-Number(exact(a))||(a.currentRosterStatus==='NOT_IN_CURRENT_SOURCE')-(b.currentRosterStatus==='NOT_IN_CURRENT_SOURCE')||Number(Boolean(b.forecast))-Number(Boolean(a.forecast))||riskPriority(a)-riskPriority(b)||draftValue(b)-draftValue(a));
 $('candidates').replaceChildren(...available.slice(0,30).map((p,index)=>card(p)));
 $('player-count').textContent=`Найдено ${available.length} · в базе ${state.players.length}`;
 const changed=adviceWorkerState!==state;
 if(changed||n===80){adviceWorker?.terminate();adviceWorker=null;}
 if(changed||n===80)$('advice').replaceChildren(text('p',n===80?'Драфт завершён. Все 80 выборов сохранены.':'Сравниваю продолжения до полной десятки…'));
 if(changed||n===80){$('risky-advice').replaceChildren();$('risk-section').hidden=true;}
 // The old rollout comparison only runs when its collapsed section is opened.
 if(n<80&&state.players.length&&document.getElementById('old-advice')?.open){
  const snapshot=state,requestId=++adviceRequest;
  if(!adviceWorker)try{adviceWorker=new Worker(new URL('./advice-worker.js',import.meta.url),{type:'module'});}
  catch{ $('advice').replaceChildren(...recommendations(state).slice(0,5).map(p=>card(p))); $('advice').append(text('p','Расчёт продолжений недоступен: показан риск-скорректированный список без оптимизации состава.'));adviceWorker=null; }
  if(adviceWorker){
  adviceWorkerState=state;
  adviceWorker.onmessage=({data})=>{
   if(state!==snapshot||data.requestId!==adviceRequest)return;
   if(data.error){$('advice').replaceChildren(text('p','Не удалось оценить продолжения: '+data.error));return;}
   $('advice').replaceChildren(...data.advice.map(a=>card(a.player,a)));
   $('risky-advice').replaceChildren(...data.risky.map(a=>card(a.player,a)));$('risk-section').hidden=!data.risky.length;
   for(const report of data.focused||[]){if(!report)continue;const index=available.slice(0,30).findIndex(p=>p.id===report.player.id);if(index>=0)$('candidates').children[index]?.replaceWith(card(report.player,report));}
  };
  adviceWorker.postMessage({...(changed?{state}:{}),requestId,focus:query.length>=2?available.slice(0,5):[]});
  }
 }
 renderRookies();
 renderPlan();
 renderPostDraft();
 setSeasonPlayers(state.players,card);
 $('results').replaceChildren();if(n){for(const t of draftSummary(state))$('results').append(text('li',`${teamName(t.team-1)}: ${t.players}/10 · ${t.metric==='FBL_FULL_FORMULA_ESTIMATE'?'ФО за сезон':'сумма импортированных оценок'} ${t.score?.toFixed(0)??(t.players?'есть игрок без сезонной оценки':'состав пока пуст')} ${state.priceMode==='ON'?' · бюджет '+t.cost+' / '+state.cap:''} · rookie ${t.rookieCount} (${t.rookieRule})`));}
}
let databaseLoading=false;
async function loadDatabase(force=false){
 if(databaseLoading)return;databaseLoading=true;
 $('load-retry').hidden=true;$('startup-status').textContent='Загружаю базу игроков…';
 // Render a valid cached database before waiting for the network.
 if(!state.players.length||needsCatalog){
  try{const cached=await readCache('fbl-default-db');if(cached){state=installDatabase(state,cached);database=cached;needsCatalog=false;save();$('startup-status').textContent='Сохранённая база готова. Проверяю обновление…';}}catch{}
 }
 $('database-status').textContent='Обновляю базу игроков…';
 try{
  const candidate=await fetchDatabase(import.meta.env.BASE_URL+'data/default-draft.json');
  newDraft(candidate.players,DEFAULT_CAP,candidate.priceMode||'OFF');
  if(force||!state.players.length||needsCatalog||(state.databaseVersion&&state.databaseVersion!=='manual')||(!state.picks.length&&!state.databaseVersion)){
   const installed=installDatabase(state,candidate);
   state=installed;database=candidate;needsCatalog=false;
   // Applying the fetched database must not depend on storage capacity.
   save();
  }else database=candidate;
  await writeCache('fbl-default-db',candidate);updateSaveStatus();
  $('database-status').textContent=`База ${candidate.coverage.players} игроков · rookie ${candidate.coverage.rookies} · обновлена ${new Date(candidate.generatedAt).toLocaleString('ru-RU')}. Цены Sports.ru: ${candidate.priceAudit?.matchedPlayers??0} игроков, срез ${candidate.priceAudit?.capturedAt?new Date(candidate.priceAudit.capturedAt).toLocaleString('ru-RU'):'неизвестен'}. Допуск драфта: только позиции Sports.ru. Позиции Yahoo хранятся отдельно для переноса команды; неподтверждённый допуск Sports.ru блокирует выбор. Оценки экспериментальные; полный прогноз включает оценку фолов и бонусов.`;
  $('startup-status').textContent=`База готова · ${state.players.length} игроков`;
 }catch(e){
  const message=state.players.length?'Источник обновления недоступен. Используется сохранённая база; пики сохранены.':'Не удалось загрузить базу. Нажми «Повторить загрузку».';
  $('database-status').textContent=message;$('startup-status').textContent=message;$('load-retry').hidden=false;
  if(!state.players.length)$('advice').replaceChildren(text('p',message));
 }finally{databaseLoading=false;updateSaveStatus();}
}
$('load-retry').onclick=()=>loadDatabase(true);
$('search').oninput=render;$('rookies-only').onchange=render;
$('draft-mode').onchange=()=>{mode=$('draft-mode').value;writeStored('fbl-mode',mode);$('bots').hidden=mode!=='INTERACTIVE';};
document.getElementById('old-advice')?.addEventListener('toggle',()=>{if(document.getElementById('old-advice').open)render();});
$('export-telegram').onclick=async()=>{const value=draftResultsText(),area=$('export-text');area.value=value;
 try{await navigator.clipboard.writeText(value);$('export-telegram').textContent='Скопировано ✓';setTimeout(()=>{$('export-telegram').textContent='Скопировать итоги для Telegram';},2000);}
 catch{area.hidden=false;area.focus();area.select();$('export-telegram').textContent='Выдели текст ниже и скопируй';}};
$('export-txt').onclick=()=>{const url=URL.createObjectURL(new Blob([draftResultsText()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='fbl-draft-2026-27.txt';a.click();URL.revokeObjectURL(url);};
$('replace-cancel').onclick=()=>{stopReplace();render();};
// In training mode the bots answer at once, so undo goes back to before my own last pick, not just the last bot pick.
$('undo').onclick=()=>{
 if(mode==='INTERACTIVE'){const last=state.picks.map(p=>p.team).lastIndexOf(0);state=last<0?undo(state):{...state,picks:state.picks.slice(0,last)};}
 else state=undo(state);
 if(state.priceMode==='ON')state=enforceBudget(state);save();};
$('reset').onclick=()=>{if(confirm('Начать новый драфт? Текущие пики будут удалены.')){state=restartDraft(state,database);save();}};
$('refresh-database').onclick=()=>loadDatabase(true);
$('load').onclick=()=>{try{const v=JSON.parse($('data').value);const priced=v.players.every(p=>p.priceStatus==='VERIFIED'&&Number.isFinite(p.price));state={...newDraft(v.players,DEFAULT_CAP,priced?'ON':'OFF'),databaseVersion:'manual'};save();$('settings').open=false;}catch(e){showError(e);}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([exportDraft(state)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fbl-draft.json';a.click();URL.revokeObjectURL(url);};
$('restore').onchange=async e=>{try{const restored=restoreBudgetDraft(await e.target.files[0].text());state=restored.databaseVersion!=='manual'&&database?.priceMode==='ON'?installDatabase(restored,database):restored;save();}catch(err){showError(err);}};
function runAction(fn){try{state=fn();save();$('simulation-status').textContent=state.picks.length===80?(draftSummary(state)[0].metric==='FBL_FULL_FORMULA_ESTIMATE'?'Драфт завершён. Итоги ниже — суммы сезонных прогнозов ФО.':'Драфт завершён. Итоги ниже — суммы импортированных оценок.'):'Драфт обновлён.';}catch(e){showError(e);}}
$('bots').onclick=()=>runAction(()=>advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1}));
$('simulate').onclick=()=>runAction(()=>simulateDraft(state,{seed:Number($('seed').value)||1}));
$('season-runs').onchange=updateBatchLabel;
$('batch').onclick=()=>{
 $('batch').disabled=true;$('simulation-status').textContent=state.picks.length===80?`Выполняются ${seasonScenarioLabel()} сценариев сезона…`:'Выполняются 100 вариантов завершения драфта…';
 const snapshot=state;
 let worker;try{worker=new Worker(new URL('./batch-worker.js',import.meta.url),{type:'module'});}catch{$('batch').disabled=false;$('simulation-status').textContent='Браузер не поддерживает расчёт в отдельном потоке. Ручные пики и завершение тренировки доступны.';return;}
 const finish=()=>{worker.terminate();$('batch').disabled=false;};
 worker.onmessage=({data})=>{finish();if(state!==snapshot){$('batch').click();return;}if(data.error){$('simulation-status').textContent='Ошибка: '+data.error;return;}renderScenarioAnalysis(data.result,snapshot.picks.length+1);};
 worker.onerror=()=>{finish();$('simulation-status').textContent='Ошибка симуляции';};worker.postMessage({state,seed:Number($('seed').value)||1,seasonRuns:Number($('season-runs').value)});
};
$('draft-mode').value=mode;$('bots').hidden=mode!=='INTERACTIVE';
render();updateSaveStatus();initSeasonTabs(render);loadDatabase();
