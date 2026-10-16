import './baseline.js';
import './history.js';
import {newDraft,pick,undo,exportDraft,importDraft,recommendations,riskPriority} from './engine.js';
import {advanceBots,simulateDraft,draftSummary} from './simulation.js';
import {analyzeRecommendations,riskProfile} from './analysis.js';
import {pickCompletion} from './completion.js';
import {installDatabase} from './database.js';
const $=id=>document.getElementById(id);
let state;try{state=importDraft(localStorage.getItem('fbl-draft')||'');}catch{state=newDraft();}
let database;
let mode=localStorage.getItem('fbl-mode')||'LIVE';
function save(){localStorage.setItem('fbl-draft',exportDraft(state));render();}
function showError(error){$('simulation-status').textContent='Не удалось выполнить: '+error.message;}
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function matches(p,query){const aliases={1630169:'халибертон халлибертон тайриз',202681:'кайри ирвинг',203999:'йокич никола'};return (p.name+' '+(aliases[p.id]||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query);}
function choose(p){try{const plan=pickCompletion(state,p.id);if(!plan.possible)throw Error(plan.reason);state=pick(state,p.id);if(mode==='INTERACTIVE')state=advanceBots(state,{humanTeam:0,seed:Number($('seed').value)||1});save();$('simulation-status').textContent='Выбор сохранён.';}catch(e){save();showError(e);}}
function card(p,analysis=null){
 const el=document.createElement('article');el.className='player-card';
 el.append(text('h3',p.name+(p.isRookie?' · rookie':'')));
 const risk=analysis?.risk||riskProfile(p);el.append(text('strong','Риск: '+risk.level));
 el.append(text('p',(p.team||'Ростер не подтверждён')+' · '+(p.positions.join('/')||'Позиции неизвестны')));
 el.append(text('strong',Number.isFinite(p.projectedFP)?'Основа оценки: '+p.projectedFP.toFixed(2)+' ФО/матч':'Для оценки недостаточно данных'));
 if(p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR')el.append(text('p','Новичок: групповая историческая оценка, очень высокая неопределённость. Индивидуальной статистики NBA нет.'));
 if(p.coverageStatus==='EARLIER_SEASON')el.append(text('p','Пропуск/малая выборка последнего сезона: автоматически использована база '+p.projectionBaseSeason+'. Текущая нагрузка неизвестна.'));
 if(p.injuries?.length)el.append(text('p','Статус источника: '+p.injuries.map(i=>(i.status||'неизвестно')+' ('+(i.date||'дата неизвестна')+')').join(', ')));
 if(p.returnContext)el.append(text('p',p.returnContext.note));
 if(p.positionStatus==='ESTIMATED_FROM_ESPN_NOT_YAHOO')el.append(text('small','Позиции ESPN, допуск Yahoo не подтверждён.'));
 if(state.priceMode==='ON')el.append(text('p','Цена: '+(p.priceStatus==='VERIFIED'?p.price+' ед.':'не подтверждена')));
 if(analysis){
  el.append(text('p','Уверенность пика: '+(analysis.stability===null?'не рассчитывается — недопустимый добор':analysis.stability+'% первых мест в условных сценариях')));
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
 if(p.marketContext)el.append(text('p',`Ориентир ESPN: №${p.marketContext.pick} в одном экспертном mock draft (ROTO), не ADP и не прогноз ФО FBL.`));
 if(p.roleContext){const link=document.createElement('a');link.href=p.roleContext.source;link.textContent=p.roleContext.note;el.append(link);}
 const b=text('button','Выбрать '+p.name);b.onclick=()=>choose(p);
 if(analysis?.completion?.possible===false){b.disabled=true;b.title=analysis.completion.reason;}
 try{pick(state,p.id);}catch(e){b.disabled=true;b.title=e.message;el.append(text('small',e.message));}
 el.append(b);return el;
}
function render(){
 $('cap').value=state.cap;$('price-mode').checked=state.priceMode==='ON';$('price-controls').hidden=state.priceMode!=='ON';
 const n=state.picks.length;$('turn').textContent=n===80?'Драфт завершён':`Пик ${n+1} / 80 · Команда ${(n%8)+1}`;
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
 $('results').replaceChildren();if(n){for(const t of draftSummary(state))$('results').append(text('li',`GM ${t.team}: ${t.players}/10 · сумма базовых оценок ${t.projectedFP?.toFixed(2)??'—'} · rookie ${t.rookieCount} (${t.rookieRule})`));}
}
async function loadDatabase(force=false){
 $('database-status').textContent='Обновляю базу игроков…';
 try{
  const response=await fetch(import.meta.env.BASE_URL+'data/default-draft.json',{cache:'no-cache'});if(!response.ok)throw Error('Источник недоступен');
  const candidate=await response.json();newDraft(candidate.players,20000,'OFF');database=candidate;
  localStorage.setItem('fbl-default-db',JSON.stringify(database));
  if(force||!state.players.length||(state.databaseVersion&&state.databaseVersion!=='manual')||(!state.picks.length&&!state.databaseVersion)){state=installDatabase(state,database);save();}
  $('database-status').textContent=`База ${database.coverage.players} игроков · rookie ${database.coverage.rookies} · обновлена ${new Date(database.generatedAt).toLocaleString('ru-RU')}. Источник позиций — ESPN, не Yahoo. Оценки экспериментальные, ФО без бонуса результата.`;
 }catch(e){
  try{database=JSON.parse(localStorage.getItem('fbl-default-db'));if(database&&(!state.players.length||force)){state=installDatabase(state,database);save();}}catch{}
  $('database-status').textContent=state.players.length?'Источник обновления недоступен. Используется сохранённая база; пики сохранены.':'Не удалось получить базу. Нажмите «Обновить базу» в настройках; файл от вас не требуется.';
 }
}
$('search').oninput=render;$('rookies-only').onchange=render;
$('draft-mode').onchange=()=>{mode=$('draft-mode').value;localStorage.setItem('fbl-mode',mode);$('bots').hidden=mode!=='INTERACTIVE';};
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
render();loadDatabase();
