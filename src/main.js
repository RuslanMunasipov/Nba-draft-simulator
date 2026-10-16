import {readStored,writeStored,storageFailed} from './storage.js';
import {fetchDatabase} from './database-loader.js';
import './theme.js';
import {reportElement} from './rookie-reports.js';
import './baseline.js';
import './history.js';
import {newDraft,pick,undo,exportDraft,importDraft,recommendations,riskPriority} from './engine.js';
import {advanceBots,simulateDraft,draftSummary} from './simulation.js';
import {analyzeRecommendations,riskProfile} from './analysis.js';
import {renderTiming} from './timing-ui.js';
import {rookieRecommendations} from './rookies.js';
import {pickCompletion} from './completion.js';
import {installDatabase} from './database.js';
const $=id=>document.getElementById(id);
let state;try{state=importDraft(readStored('fbl-draft')||'');}catch{state=newDraft();}
let database;
let mode=readStored('fbl-mode')||'LIVE';
function save(){writeStored('fbl-draft',exportDraft(state));render();updateSaveStatus();}
function updateSaveStatus(){
 const message=storageFailed()?'Хранилище недоступно: пики только до закрытия страницы. Сохрани резервную копию в настройках.':'Сохранение на устройстве';
 $('save-state').textContent=message;$('storage-status').textContent=storageFailed()?message:'';
 $('storage-status').hidden=!storageFailed();
}
function showError(error){$('simulation-status').textContent='Не удалось выполнить: '+error.message;}
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function matches(p,query){const aliases={1630169:'халибертон халлибертон тайриз',202681:'кайри ирвинг',203999:'йокич никола'};return (p.name+' '+(aliases[p.id]||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query);}
function choose(p){try{const plan=pickCompletion(state,p.id);if(!plan.possible)throw Error(plan.reason);state=pick(state,p.id);if(mode==='INTERACTIVE')state=advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1});save();$('simulation-status').textContent='Выбор сохранён.';}catch(e){save();showError(e);}}
function card(p,analysis=null){
 const el=document.createElement('article');el.className='player-card';
 const individualRookie=p.isRookie&&p.espnContext?.individualProjection;
 el.append(text('h3',p.name+(p.isRookie?' · rookie':'')));
 const risk=analysis?.risk||riskProfile(p);el.append(text('strong','Риск: '+risk.level));
 el.append(text('p',[p.team,p.positions.join('/')].filter(Boolean).join(' · ')));
 if(individualRookie)el.append(text('strong',`Индивидуальный прогноз: ${individualRookie.componentFPPerGame.toFixed(1)} частичных ФО/матч; фолы и бонусы не учтены. Сравнение — в блоке rookie.`));
 else if(Number.isFinite(p.projectedFP))el.append(text('strong','Основа оценки: '+p.projectedFP.toFixed(2)+' ФО/матч'));else el.append(text('span',''));
 if(p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR'&&!individualRookie)el.append(text('p','Групповой исторический ориентир, не персональный прогноз.'));
 if(p.coverageStatus==='EARLIER_SEASON')el.append(text('p','Пропуск/малая выборка последнего сезона: автоматически использована база '+p.projectionBaseSeason+'. Текущая нагрузка неизвестна.'));
 if(p.injuries?.length)el.append(text('p','Статус источника: '+p.injuries.map(i=>(i.status||'неизвестно')+' ('+(i.date||'дата неизвестна')+')').join(', ')));
 if(p.returnContext)el.append(text('p',p.returnContext.note));
 if(p.positionStatus==='ESTIMATED_FROM_ESPN_NOT_YAHOO')el.append(text('small','Позиции ESPN, допуск Yahoo не подтверждён.'));
 if(state.priceMode==='ON')el.append(text('p','Цена: '+(p.priceStatus==='VERIFIED'?p.price+' ед.':'не подтверждена')));
 if(analysis&&!individualRookie){
  if(analysis.stability!==null)el.append(text('p','Уверенность пика: '+analysis.stability+'% первых мест в условных сценариях'));
  el.append(text('p',analysis.conclusion));
  if(analysis.pressure!==null)el.append(text('p','Брать сейчас или ждать: в '+analysis.pressure+' из 100 эвристических сценариев игрок уходил за следующие 7 выборов, если мы брали альтернативу. Это не реальная вероятность действий GM.'));
  el.append(text('strong','Плюсы пика'));const pros=document.createElement('ul');for(const value of analysis.advantages)pros.append(text('li',value));el.append(pros);
  el.append(text('strong','Минусы и альтернативы'));const cons=document.createElement('ul');for(const value of analysis.drawbacks)cons.append(text('li',value));el.append(cons);
  el.append(text('small','Процент сравнивает кандидатов сейчас, а не предсказывает успех сезона. 0% не означает, что игрок бесполезен.'));
  const details=document.createElement('details');details.append(text('summary','Как рассчитан процент'),text('p',analysis.method));el.append(details);
 }
 if(p.sourceUpdatedAt||p.rosterSource){
  const evidence=document.createElement('details');evidence.append(text('summary','Источники и актуальность'));
  if(p.sourceUpdatedAt)evidence.append(text('p','Срез ростера: '+new Date(p.sourceUpdatedAt).toLocaleString('ru-RU')));
  evidence.append(text('p','Статистическая база: '+(p.projectionBaseSeason||'групповой ориентир')+'. Историческое среднее не гарантирует такую же роль и нагрузку.'));
  if(p.rosterSource){const source=document.createElement('a');source.href=p.rosterSource;source.textContent='Источник ростера и статусов ESPN';evidence.append(source);}el.append(evidence);
 }
 if(p.espnContext){const source=p.espnContext;el.append(text('p',`ESPN 2026/27: ${[source.projectedGames!=null?'прогноз матчей '+source.projectedGames:null,Number.isFinite(source.adp)?'ADP '+source.adp.toFixed(2):null].filter(Boolean).join(' · ')}. ADP — средний номер выбора, не ФО FBL.`));el.append(text('small','Срез ESPN: '+new Date(source.fetchedAt).toLocaleString('ru-RU')));}
 if(p.marketContext)el.append(text('p',`Ориентир ESPN: №${p.marketContext.pick} в одном экспертном mock draft (ROTO), не ADP и не прогноз ФО FBL.`));
 if(p.roleContext){const link=document.createElement('a');link.href=p.roleContext.source;link.textContent=p.roleContext.note;el.append(link);}
 const b=text('button','Выбрать '+p.name);b.onclick=()=>choose(p);
 if(analysis?.completion?.possible===false){b.disabled=true;b.title=analysis.completion.reason;}
 try{pick(state,p.id);}catch(e){b.disabled=true;b.title=e.message;el.append(text('small',e.message));}
 el.append(b);
 el.children[1]?.classList.add('risk-badge');el.children[2]?.classList.add('player-meta');el.children[3]?.classList.add('player-score');
 el.dataset.risk=risk.level.includes('ВЫСОКИЙ')?'high':risk.level.includes('СРЕДНИЙ')?'medium':'low';
 organizeCard(el,b,4);
 return el;
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
 renderTiming(state);
 const result=rookieRecommendations(state);$('rookie-advice').replaceChildren();
 $('rookie-status').textContent=`Индивидуальный прогноз есть у ${result.projected} из ${result.available} доступных rookie; легальный добор с ними: ${result.feasible}. Rookie ещё нужен ${result.teamsNeedingRookie} командам.`;
 if(!result.players.length){$('rookie-advice').append(text('p','Нет доступных rookie с индивидуальным прогнозом и допустимым добором. Групповой ориентир не заменяет персональный прогноз.'));return;}
 const leader=result.players[0].espnContext.individualProjection;
 for(const [index,p] of result.players.entries()){
  const s=p.espnContext.individualProjection,v=s.perGame,el=document.createElement('article');el.className='player-card';
  el.append(text('h3',`${index+1}. ${p.name} · rookie`),text('strong',`${s.componentFPPerGame.toFixed(1)} частичных ФО/матч · ${s.componentSeasonTotal.toFixed(0)} за прогнозируемые ${s.games} игр`));
  el.append(text('p',`${p.team||'Команда не подтверждена'} · ${p.positions.join('/')} · ${v.minutes.toFixed(1)} мин/матч · ADP ESPN ${p.espnContext.adp?.toFixed(1)??'нет'}`));
  if(p.injuries?.length)el.append(text('strong','Текущий статус источника: '+p.injuries.map(i=>(i.status||'неизвестно')+' ('+(i.date||'дата неизвестна')+')').join(', ')));
  el.append(text('p',`PTS ${v.points.toFixed(1)} · REB ${v.rebounds.toFixed(1)} · AST ${v.assists.toFixed(1)} · STL ${v.steals.toFixed(1)} · BLK ${v.blocks.toFixed(1)} · TOV ${v.turnovers.toFixed(1)}`));
  el.append(text('p',`Плюсы: индивидуальный прогноз нагрузки и статистики; ${v.rebounds>=6?'существенный вклад подборами; ':''}${v.minutes>=28?'прогноз большой игровой нагрузки; ':''}после выбора остаётся допустимый добор.`));
  el.append(text('p',`Минусы: нет фактической статистики NBA этого новичка; роль и минуты могут измениться. ${index?`Отставание от лидера по частичному сезонному прогнозу ${(leader.componentSeasonTotal-s.componentSeasonTotal).toFixed(0)}. `:''}Близкие значения не определяют однозначного победителя: фолы и бонусы пока не учтены.`));
  el.append(text('p','Когда брать: ADP — ориентир общих лиг. В FBL всем восьми командам нужен rookie, поэтому спрос может быть выше; ждать до последнего раунда рискованно.'));
  el.append(text('small','Индивидуальный прогноз ESPN, срез '+new Date(p.espnContext.fetchedAt).toLocaleString('ru-RU')+'. Позиции и rookie-статус требуют подтверждения по регламенту.'));
  const b=text('button','Выбрать rookie '+p.name);b.onclick=()=>choose(p);el.append(b);
  el.children[1]?.classList.add('player-score');el.children[2]?.classList.add('player-meta');
  organizeCard(el,b,3);
  $('rookie-advice').append(el);
 }
}
function render(){
 $('cap').value=state.cap;$('price-mode').checked=state.priceMode==='ON';$('price-controls').hidden=state.priceMode!=='ON';
 const n=state.picks.length;
 $('draft-progress-fill').style.width=(n/80*100)+'%';document.querySelector('.draft-progress').setAttribute('aria-valuenow',String(n));
 const own=state.picks.filter(p=>p.team===0).map(p=>state.players.find(x=>x.id===p.playerId));
 const ownBox=$('my-roster');ownBox.replaceChildren();
 const rookie=own.some(p=>p.isRookie);ownBox.append(text('p',`${own.length}/10 игроков · Rookie: ${rookie?'выбран ✓':'ещё нужен'}`));
 const list=document.createElement('ol');list.className='roster-grid';
 for(let i=0;i<10;i++){const row=text('li',own[i]?own[i].name:'Свободное место');if(own[i])row.append(text('small',own[i].positions.join(' / ')+(own[i].isRookie?' · rookie':'')));else row.className='empty-slot';list.append(row);}ownBox.append(list);
 $('turn').textContent=n===80?'Драфт завершён':`Пик ${n+1} / 80 · Команда ${(n%8)+1}`;
 $('history').replaceChildren();for(const p of state.picks)$('history').append(text('li',`#${p.number} · GM ${p.team+1} · ${state.players.find(x=>x.id===p.playerId)?.name||p.playerId}`));
 $('candidates').parentElement.open=Boolean($('search').value||$('rookies-only').checked);
 const query=$('search').value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const used=new Set(state.picks.map(p=>p.playerId));
 const available=state.players.filter(p=>!used.has(p.id)&&matches(p,query)&&(!$('rookies-only').checked||p.isRookie));
 available.sort((a,b)=>(a.currentRosterStatus==='NOT_IN_CURRENT_SOURCE')-(b.currentRosterStatus==='NOT_IN_CURRENT_SOURCE')||riskPriority(a)-riskPriority(b)||(b.projectedFP??-Infinity)-(a.projectedFP??-Infinity));
 $('candidates').replaceChildren(...available.slice(0,30).map((p,index)=>card(p,query.length>=2&&index<5?analyzeRecommendations(state,p)[0]:null)));
 $('player-count').textContent=`Найдено ${available.length} · в базе ${state.players.length}`;
 $('advice').replaceChildren();const a=analyzeRecommendations(state);
 if(!a.length)$('advice').append(text('p',n===80?'Драфт завершён. Все 80 выборов сохранены.':state.players.length?'Нет допустимых рекомендаций: проверьте позиции, rookie и бюджет полного состава.':'Загружается последняя база…'));
 for(const analysis of a)$('advice').append(card(analysis.player,analysis));
 $('risky-advice').replaceChildren();const risky=analyzeRecommendations(state,null,true).slice(0,3);
 for(const analysis of risky)$('risky-advice').append(card(analysis.player,analysis));
 $('risk-section').hidden=!risky.length;
 renderRookies();
 $('results').replaceChildren();if(n){for(const t of draftSummary(state))$('results').append(text('li',`GM ${t.team}: ${t.players}/10 · сумма базовых оценок ${t.projectedFP?.toFixed(2)??'—'} · rookie ${t.rookieCount} (${t.rookieRule})`));}
}
let databaseLoading=false;
async function loadDatabase(force=false){
 if(databaseLoading)return;databaseLoading=true;
 $('load-retry').hidden=true;$('startup-status').textContent='Загружаю базу игроков…';
 // Render a valid cached database before waiting for the network.
 if(!state.players.length){
  try{const cached=JSON.parse(readStored('fbl-default-db')||'null');if(cached){state=installDatabase(state,cached);database=cached;save();$('startup-status').textContent='Сохранённая база готова. Проверяю обновление…';}}catch{}
 }
 $('database-status').textContent='Обновляю базу игроков…';
 try{
  const candidate=await fetchDatabase(import.meta.env.BASE_URL+'data/default-draft.json');
  newDraft(candidate.players,20000,'OFF');
  if(force||!state.players.length||(state.databaseVersion&&state.databaseVersion!=='manual')||(!state.picks.length&&!state.databaseVersion)){
   const installed=installDatabase(state,candidate);
   state=installed;database=candidate;
   // Applying the fetched database must not depend on storage capacity.
   save();
  }else database=candidate;
  writeStored('fbl-default-db',JSON.stringify(candidate));updateSaveStatus();
  $('database-status').textContent=`База ${candidate.coverage.players} игроков · rookie ${candidate.coverage.rookies} · обновлена ${new Date(candidate.generatedAt).toLocaleString('ru-RU')}. Источник позиций — ESPN, не Yahoo. Оценки экспериментальные, ФО без бонуса результата.`;
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
$('undo').onclick=()=>{state=undo(state);save();};
$('reset').onclick=()=>{if(confirm('Начать новый драфт? Текущие пики будут удалены.')){state={...newDraft(state.players,state.cap,state.priceMode),...(state.databaseVersion?{databaseVersion:state.databaseVersion}:{})};save();}};
$('price-mode').onchange=()=>{try{state=importDraft(exportDraft({...state,priceMode:$('price-mode').checked?'ON':'OFF'}));save();}catch(e){showError(e);render();}};
$('apply-cap').onclick=()=>{try{state=importDraft(exportDraft({...state,cap:Number($('cap').value)}));save();}catch(e){showError(e);render();}};
$('refresh-database').onclick=()=>loadDatabase(true);
$('load').onclick=()=>{try{const v=JSON.parse($('data').value);state={...newDraft(v.players,state.cap,state.priceMode),databaseVersion:'manual'};save();$('settings').open=false;}catch(e){showError(e);}};
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([exportDraft(state)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fbl-draft.json';a.click();URL.revokeObjectURL(url);};
$('restore').onchange=async e=>{try{state=importDraft(await e.target.files[0].text());save();}catch(err){showError(err);}};
function runAction(fn){try{state=fn();save();$('simulation-status').textContent='Готово. Итоги — сравнение сценария по сумме базовых ФО/матч, не прогноз победы в сезоне.';}catch(e){showError(e);}}
$('bots').onclick=()=>runAction(()=>advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1}));
$('simulate').onclick=()=>runAction(()=>simulateDraft(state,{seed:Number($('seed').value)||1}));
$('batch').onclick=()=>{
 $('batch').disabled=true;$('simulation-status').textContent='Выполняются 100 сценариев…';
 const worker=new Worker(new URL('./batch-worker.js',import.meta.url),{type:'module'});
 const finish=()=>{worker.terminate();$('batch').disabled=false;};
 worker.onmessage=({data})=>{finish();$('simulation-status').textContent=data.error?'Ошибка: '+data.error:`100 сценариев; допустимых: ${data.result.eligibleRuns}/100. `+(data.result.wins?'Лучшие суммы базовых оценок: '+data.result.wins.map((n,i)=>`GM ${i+1}: ${n}`).join(', '):'Победитель сценария не определяется.')+' Результаты зависят от оценочных позиций и прогнозов, это не вероятность победы в FBL.';};
 worker.onerror=()=>{finish();$('simulation-status').textContent='Ошибка симуляции';};worker.postMessage({state,seed:Number($('seed').value)||1});
};
$('draft-mode').value=mode;$('bots').hidden=mode!=='INTERACTIVE';
render();updateSaveStatus();loadDatabase();
