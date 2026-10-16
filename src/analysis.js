import {pick} from './engine.js';
import {availabilityEvidence,draftValue,severeRisk} from './valuation.js';
import {completionPlan,pickCompletion} from './completion.js';
import {randomFromSeed} from './simulation.js';
export function riskProfile(p){
 const games=Object.values(p.historyGames||{});const flags=[];
 if(p.coverageStatus==='EARLIER_SEASON'||p.returnContext)flags.push('Возвращение/устаревшая база: текущая нагрузка неизвестна');
 if(p.isRookie||p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR')flags.push('Новичок: индивидуальной статистики NBA нет, используется групповой ориентир');
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
 const used=new Set(state.picks.map(p=>p.playerId));
 const legal=state.players.filter(p=>!used.has(p.id)&&Number.isFinite(p.projectedFP)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).sort((a,b)=>draftValue(b)-draftValue(a)||String(a.id).localeCompare(String(b.id)));
 const normal=legal.filter(p=>!severeRisk(p)),risky=legal.filter(p=>severeRisk(p));
 const candidates=riskyOnly?risky:normal.length?normal:legal;
 const base=completionPlan(state),pool=[];
 if(base.possible)for(const candidate of candidates){if(pickCompletion(state,candidate.id).possible)pool.push(candidate);if(pool.length===20)break;}
 if(base.possible&&!pool.length&&!riskyOnly)for(const candidate of risky){if(pickCompletion(state,candidate.id).possible)pool.push(candidate);if(pool.length===20)break;}
 if(focus){
  const plan=pickCompletion(state,focus.id);
  if(!plan.possible)return [{player:focus,risk:riskProfile(focus),stability:null,pressure:null,completion:plan,advantages:[],drawbacks:[plan.reason],conclusion:'Не рекомендован: после пика нельзя завершить допустимый состав',method:'Проверено точное назначение пяти позиций, rookie, уже выбранные игроки и подтверждённые цены при включённом бюджете. Прогноз силы здесь не отменяет нарушение правил.'}];
  if(!pool.some(p=>p.id===focus.id)&&legal.some(p=>p.id===focus.id))pool.push(focus);
 }
 const random=randomFromSeed(101+state.picks.length),wins=new Map(pool.map(p=>[p.id,0]));
 for(let scenario=0;scenario<100;scenario++){
  let best=null,score=-Infinity;
  for(const p of pool){const risk=riskProfile(p);const value=draftValue(p)*(risk.minFactor+random()*(risk.maxFactor-risk.minFactor));if(value>score){score=value;best=p.id;}}
  if(best!==null)wins.set(best,wins.get(best)+1);
 }
 pool.sort((a,b)=>wins.get(b.id)-wins.get(a.id)||draftValue(b)-draftValue(a));
 return (focus?pool.filter(p=>p.id===focus.id):pool.slice(0,5)).map(p=>{
  const risk=riskProfile(p),availability=availabilityEvidence(p),alternative=pool.find(x=>x.id!==p.id),advantages=[`Базовая оценка ${p.projectedFP.toFixed(2)} ФО за матч по ${p.projectionBaseSeason||'группе молодых игроков'}`,'Допустим для текущего позиционного состава'];
  if(availability.weightedGames!==null)advantages.push(`Индекс с учётом исторической доступности: ${draftValue(p).toFixed(2)}; вес игр ${(availability.weight*100).toFixed(0)}%. Это не прогноз ФО за сезон`);
  if(p.isRookie)advantages.push('Закрывает обязательное требование rookie');
  if(p.positions.length>1)advantages.push('Гибкость позиций '+p.positions.join('/')+' в используемом источнике');
  if(!risk.flags.length)advantages.push('В загруженных данных не обнаружены дополнительные флаги риска; это не гарантия здоровья');
  const drawbacks=[...risk.flags,'ФО без бонуса результата; оценка сезона не подтверждена'];
  if(severeRisk(p))drawbacks.push('Рискованная ставка, не безопасное ядро команды; высокая средняя ФО не компенсирует автоматически пропуски');
  if(availability.repeatedAbsences)drawbacks.push(`Два сезона с менее чем 50 играми: ${availability.previous} — ${availability.prior}, ${availability.reference} — ${availability.recent}`);
  if(p.positionStatus==='ESTIMATED_FROM_ESPN_NOT_YAHOO')drawbacks.push('Допуск Yahoo не проверен: использованы позиции ESPN');
  if(alternative)drawbacks.push(`Альтернатива сейчас: ${alternative.name} (${alternative.projectedFP.toFixed(2)} базовых ФО/матч)`);
  if(alternative){
   const difference=p.projectedFP-alternative.projectedFP;
   (difference>0?advantages:drawbacks).push(`Базовая разница с ${alternative.name}: ${difference>=0?'+':''}${difference.toFixed(2)} ФО/матч; это не разница за сезон`);
   const otherRisk=riskProfile(alternative),levels={'ОТНОСИТЕЛЬНО НИЗКИЙ':0,'СРЕДНИЙ':1,'ВЫСОКИЙ':2};
   if(levels[risk.level]<levels[otherRisk.level])advantages.push(`Меньше выявленных флагов риска, чем у ${alternative.name} (${otherRisk.level})`);
   if(levels[risk.level]>levels[otherRisk.level])drawbacks.push(`Риск выше, чем у ${alternative.name} (${otherRisk.level})`);
  }
  const completion=pickCompletion(state,p.id);
  advantages.push(completion.minimumCost===null?'После пика существует полный позиционный состав с rookie при текущей доступности':`Минимальный бюджет полного состава после пика: ${completion.minimumCost.toFixed(2)} из ${state.cap}; на оставшиеся слоты нужно минимум ${completion.minimumRemainingCost.toFixed(2)}`);
  drawbacks.push('Добор проверен по доступным сейчас игрокам: соперники могут забрать их до следующего хода');
  const stability=wins.get(p.id),pressure=selectionPressure(pool,p,551+state.picks.length);
  return {player:p,risk,advantages,drawbacks,stability,pressure,completion,availability,valueIndex:draftValue(p),speculative:severeRisk(p),
   conclusion:severeRisk(p)?'Рискованная ставка: рассматривать отдельно от основного ядра':p.id===pool[0]?.id?(stability>=60?'Предпочтительный выбор в этом стресс-тесте':'Однозначного пика нет: лидер зависит от допущений'):'Сравнить с лидером, особенно если нужен этот слот или rookie',
   method:`${stability} из 100 условных сценариев дали лучший результат среди ${pool.length} допустимых кандидатов. Нагрузка/роль: ${Math.round(risk.minFactor*100)}–${Math.round(risk.maxFactor*100)}% базовой оценки — стресс-допущение, не прогноз. 0% означает отсутствие первых мест в этой выборке, а не бесполезность игрока. Сравнивается индекс: базовые ФО/матч × исторический вес доступности (двойной вес последнего сезона) × стресс-множители роли/статуса. Множители роли 0.85 и OUT 0.5 — политика осторожности, не измеренный эффект. Основная пятёрка формируется из кандидатов без высокого риска, если они доступны. Игры и ФО за сезон не прогнозируются. Не вероятность победы и не калиброванная уверенность. Потребность других GM до следующего пика не подтверждена.`};
 });
}
