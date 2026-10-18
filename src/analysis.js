import {evaluateRosterPicks} from './roster-value.js';
import {rookieSlotWarnings} from './rookie-watch.js';
import {scoringMetric,seasonScore} from './season-scoring.js';
import {pick} from './engine.js';
import {availabilityEvidence,draftValue,severeRisk,riskAdjustedValue} from './valuation.js';
import {completionPlan,pickCompletion} from './completion.js';
import {randomFromSeed} from './simulation.js';
export function riskProfile(p){
 const games=Object.values(p.historyGames||{});const flags=[];
 if(p.historyUnusableEndYears?.length)flags.push('В истории есть сезоны без полных компонентов: '+p.historyUnusableEndYears.join(', ')+'. Они не считаются нулевыми сезонами.');
 if(p.forecast?.coverageTier==='GROUP_PRIOR')flags.push('Групповой ориентир NBA-роли, не персональный прогноз статистики');
 if(p.forecast?.coverageTier==='LIMITED_PERSONAL')flags.push('Прогноз по малой или устаревшей личной выборке');
 if(p.forecast?.conditionalOnRoster)flags.push('Отдача условна: действующий ростер NBA не подтверждён');
 if(p.coverageStatus==='EARLIER_SEASON'||p.returnContext)flags.push('Возвращение/устаревшая база: текущая нагрузка неизвестна');
 if(p.isRookie||p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR')flags.push('Первый сезон в NBA: особенно важны место в ротации и стабильность минут');
 if(p.coverageStatus==='LOW_SAMPLE')flags.push('Малая выборка: историческая оценка неустойчива');
 if(p.injuries?.length)flags.push('Текущий отчёт источника: '+p.injuries.map(i=>i.status).join(', '));
 if(games.length&&Math.min(...games)<55)flags.push('Нестабильная доступность: в истории '+Object.entries(p.historyGames).map(([s,n])=>s+' — '+n+' игр').join('; ')+'. Причины всех пропусков не установлены');
 if(p.newHighVolumeTeammates?.length||p.roleContext?.roleChange)flags.push('Изменение роли: новые партнёры с большим объёмом бросков '+(p.newHighVolumeTeammates||[]).join(', ')+'. Снижение usage и ФО возможно, но не измерено');
 const high=severeRisk(p);
 const level=high?'ВЫСОКИЙ':flags.length?'СРЕДНИЙ':'ОТНОСИТЕЛЬНО НИЗКИЙ';
 return {level,flags,minFactor:high?.55:flags.length?.7:.85,maxFactor:1.1};
}
export function selectionPressure(pool,player,seed){
 const random=randomFromSeed(seed);let lost=0;
 // Heuristic opponent choices only; not calibrated to the seven real GMs.
 for(let run=0;run<100;run++){
  const alternative=pool.find(p=>p.id!==player.id);const available=pool.filter(p=>p.id!==alternative?.id);
  for(let turn=0;turn<Math.min(7,pool.length-1)&&available.length;turn++){
   const weights=available.map(p=>Math.pow(Math.max(.1,p.projectedFP),3));let draw=random()*weights.reduce((a,b)=>a+b,0),index=0;
   while(index<weights.length-1&&draw>weights[index]){draw-=weights[index];index++;}
   const [selected]=available.splice(index,1);if(selected.id===player.id){lost++;break;}
  }
 }
 return lost;
}
export function analyzeRecommendations(state,focus=null,riskyOnly=false){
 const metric=scoringMetric(state),used=new Set(state.picks.map(p=>p.playerId));
 const legal=state.players.filter(p=>!used.has(p.id)&&seasonScore(p,metric)!==null).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).sort((a,b)=>riskAdjustedValue(b)-riskAdjustedValue(a)||String(a.id).localeCompare(String(b.id)));
 const normal=legal.filter(p=>!severeRisk(p)),risky=legal.filter(p=>severeRisk(p));
 const ranked=riskyOnly?risky:legal;
 // Include budget alternatives and scarce slots before bounded rollout search.
 const diverse=[...ranked.slice(0,8),...ranked.filter(p=>p.isRookie).slice(0,2),...['PG','SG','SF','PF','C'].map(pos=>ranked.find(p=>p.positions.includes(pos))),...ranked.filter(p=>p.price>0).sort((a,b)=>riskAdjustedValue(b)/b.price-riskAdjustedValue(a)/a.price).slice(0,2)];
 const candidates=[...new Map(diverse.filter(Boolean).map(p=>[p.id,p])).values(),...ranked];
 const base=completionPlan(state),pool=[];
 if(base.possible)for(const candidate of candidates){if(!pool.some(p=>p.id===candidate.id)&&pickCompletion(state,candidate.id).possible)pool.push(candidate);if(pool.length===17)break;}
 if(base.possible&&!pool.length&&!riskyOnly)for(const candidate of risky){if(!pool.some(p=>p.id===candidate.id)&&pickCompletion(state,candidate.id).possible)pool.push(candidate);if(pool.length===17)break;}
 if(focus){
  const plan=pickCompletion(state,focus.id);
  if(!plan.possible)return [{player:focus,risk:riskProfile(focus),stability:null,pressure:null,completion:plan,advantages:[],drawbacks:[plan.reason],conclusion:'Не рекомендован: после пика нельзя завершить допустимый состав',method:'Проверено точное назначение пяти позиций, rookie, уже выбранные игроки и подтверждённые цены при включённом бюджете. Прогноз силы здесь не отменяет нарушение правил.'}];
  if(!pool.some(p=>p.id===focus.id)&&legal.some(p=>p.id===focus.id))pool.push(focus);
 }
 const evaluations=evaluateRosterPicks(state,pool);
 pool.splice(0,pool.length,...evaluations.map(x=>x.player));
 const labels=new Map();
 const label=(id,name)=>labels.set(id,[...(labels.get(id)||[]),name]);
 if(pool.length){
  label(pool[0].id,'Сбалансированный');
  const best=(score)=>[...pool].sort((a,b)=>score(b)-score(a))[0];
  label(best(p=>p.forecast?.seasonCeiling??draftValue(p)*82).id,'Агрессивный');
  label(best(p=>p.forecast?.seasonFloor??riskAdjustedValue(p)*82).id,'Безопасный');
  label(best(p=>p.price>0?riskAdjustedValue(p)/p.price:-Infinity).id,'Value');
 }
 const selected=focus?pool.filter(p=>p.id===focus.id):[...new Set([pool[0],...pool.filter(p=>labels.has(p.id)),...pool].filter(Boolean))].slice(0,5);
 return selected.map(p=>{
  const risk=riskProfile(p),availability=availabilityEvidence(p),alternative=pool.find(x=>x.id!==p.id),forecast=p.forecast;
  const advantages=labels.has(p.id)?['Вариант: '+labels.get(p.id).join(' / ')]:[],drawbacks=[...risk.flags,...rookieSlotWarnings(state,p)];
  const breakdown=forecast?.scoringBreakdown,downside=forecast?.historicalDownside;
  if(breakdown)drawbacks.push(`Потери: ${(-breakdown.turnovers/2).toFixed(1)} за матч → ${breakdown.turnovers.toFixed(1)} ФО/матч, ${Math.round(breakdown.turnovers*forecast.games)} ФО за прогнозируемый сезон. Уже вычтены из оценки.`);
  if(downside)drawbacks.push(`История ${downside.season}: ${downside.negativeGames} из ${downside.games} матчей ниже нуля; среднее худших 10% игр ${downside.meanWorstTenPercent.toFixed(1)} ФО. Это прошлые результаты, не вероятность будущего минуса.`);
  if(forecast){
   advantages.push(`Прогноз сезона: ${Math.round(forecast.meanSeason)} ФО за ${Math.round(forecast.games)} матчей; в среднем ${forecast.meanPerGame.toFixed(1)} ФО/матч`);
   advantages.push(forecast.sampleGames?`Потолок одного матча: ${forecast.gameCeiling.toFixed(1)} ФО. Сильный сценарий сезона: ${Math.round(forecast.seasonCeiling)} ФО`:`Верхний ролевой ориентир: ${forecast.gameCeiling.toFixed(1)} ФО/матч; индивидуальный игровой P90 не оценён.`);
  }else if(Number.isFinite(p.projectedFP))advantages.push(`Историческая основа: ${p.projectedFP.toFixed(1)} ФО/матч (${p.projectionBaseSeason||'групповой ориентир'})`);
  if(p.isRookie)advantages.push('Закрывает обязательное место новичка');
  const own=state.picks.filter(x=>x.team===state.picks.length%8).map(x=>state.players.find(p=>p.id===x.playerId));
  if(p.positions.length>1&&own.length>=5)advantages.push('Можно использовать на '+p.positions.join(' или ')+': больше вариантов для оставшихся мест');
  if(severeRisk(p))drawbacks.push('Рискованная ставка: сопоставь потенциальную отдачу с пропусками и изменением роли');
  if(availability.repeatedAbsences)drawbacks.push(`Два сезона с менее чем 50 играми: ${availability.previous} — ${availability.prior}, ${availability.reference} — ${availability.recent}`);
  let difference=null,conclusion;
  if(alternative){
   const other=alternative.forecast;
   if(forecast&&other){
    difference=forecast.meanSeason-other.meanSeason;
    drawbacks.push(`Альтернатива сейчас: ${alternative.name} — ${Math.round(other.meanSeason)} ФО за ${Math.round(other.games)} матчей`);
    (difference>=0?advantages:drawbacks).push(`Разница с ${alternative.name}: ${difference>=0?'+':''}${Math.round(difference)} ФО за сезон`);
    conclusion=p.id===pool[0]?.id?`Первый вариант: ${p.name}. Прогноз выше, чем у ${alternative.name}, на ${Math.round(difference)} ФО за сезон.`:`Лидер сравнения — ${alternative.name}. ${p.name} стоит предпочесть, если важнее его позиции или потолок.`;
    if(p.id===pool[0]?.id&&forecast.seasonFloor<=other.seasonCeiling&&other.seasonFloor<=forecast.seasonCeiling)conclusion+=' Диапазоны сценариев перекрываются: преимущество зависит от фактических минут и числа матчей.';
   }else{
    difference=draftValue(p)-draftValue(alternative);
    drawbacks.push(`Альтернатива сейчас: ${alternative.name} (${alternative.projectedFP.toFixed(1)} исторических ФО/матч)`);
    conclusion=p.id===pool[0]?.id?`Первый вариант по доступной оценке — ${p.name}; ближайшая альтернатива — ${alternative.name}.`:`Сравнить с ${alternative.name}: учитывай состав и ожидаемую нагрузку.`;
   }
  }else conclusion='Единственный доступный кандидат с допустимым добором состава.';
  if(severeRisk(p))conclusion='Рискованная ставка. '+conclusion;
  const evaluation=evaluations.find(x=>x.player.id===p.id),otherEvaluation=evaluations.find(x=>x.player.id!==p.id);
  if(evaluation?.expectedRoster!=null){
   const delta=otherEvaluation?.expectedRoster==null?null:evaluation.expectedRoster-otherEvaluation.expectedRoster;
   const budget=state.priceMode==='ON'?state.cap-own.reduce((sum,x)=>sum+x.price,0)-p.price:null;
   advantages.push(`Итог десятки: ${Math.round(evaluation.expectedRoster)} ФО; риск-скорректированная оценка состава ${Math.round(evaluation.adjustedRoster)}. ${evaluation.runs} парных продолжения, не точный оптимум.`);
   advantages.push(`Риск-скорректированное значение игрока: ${(riskAdjustedValue(p)*82).toFixed(0)} ФО; цена ${p.price??'неизвестна'}; остаток бюджета ${budget??'цены выключены'}.`);
   if(evaluation.survival!==null)drawbacks.push(`Дожил до следующего хода в ${Math.round(evaluation.survival*evaluation.runs)} из ${evaluation.runs} продолжений альтернативы. Малая модельная выборка, не калиброванная вероятность.`);
   if(evaluation.firstPlaceShare!==null)drawbacks.push(`Доля первых мест в условных сезонных сценариях продолжений: ${evaluation.firstPlaceShare.toFixed(1)}%.`);
   if(evaluation.failed)drawbacks.push(`Не завершены ${evaluation.failed} продолжений: рейтинг ограничен, результат может быть смещён.`);
   conclusion=`${severeRisk(p)?'Рискованная ставка. ':''}${p.id===pool[0]?.id?'Сбалансированный лидер':'Альтернатива'}: ${p.name}. Ожидаемый итог десятки ${Math.round(evaluation.expectedRoster)} ФО${delta===null?'':`; разница с ${otherEvaluation.player.name}: ${delta>=0?'+':''}${Math.round(delta)} ФО`}. Рейтинг учитывает риск всей десятки; raw-прогноз игрока сам по себе не определяет порядок.`;
  }
  const completion=pickCompletion(state,p.id);
  if(completion.minimumRemainingCost!==null)advantages.push(`Обязательный минимальный добор после пика: ${completion.minimumRemainingCost} ед. (включая выбранного игрока).`);
  advantages.push(`Позиции Sports.ru: ${p.positions.join('/')}; оставшиеся слоты закрываются точным позиционным назначением. Источник: ${forecast?.origin||'историческая основа'}; сезонов NBA: ${p.careerPrediction?.historySeasons??Object.keys(p.historyGames||{}).length}.`);
  // Feasibility is a constraint, not a selling point for a player.
  return {player:p,risk,advantages,drawbacks,stability:null,pressure:null,completion,availability,valueIndex:draftValue(p),speculative:severeRisk(p),forecast,difference,conclusion,
   method:'Ограниченный поиск по максимум 17 кандидатам: три парных продолжения до 80 пиков, стратегии balanced/best/volatile. Рейтинг — риск-скорректированный итог всей десятки; доля первых мест показана как диагностика допущений. Это не глобальный оптимум и не вероятность выиграть FBL. Полная формула и цены/позиции — Sports.ru; карьерная история, projected games и прогноз — ESPN; игровые логи за три сезона; NCAA для rookie; групповой ориентир не персональный прогноз.'};
 });
}
