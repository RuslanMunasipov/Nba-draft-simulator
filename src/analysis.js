import {pick} from './engine.js';
import {randomFromSeed} from './simulation.js';
export function riskProfile(p){
 const games=Object.values(p.historyGames||{});const flags=[];
 if(p.coverageStatus==='EARLIER_SEASON'||p.returnContext)flags.push('Возвращение/устаревшая база: текущая нагрузка неизвестна');
 if(p.isRookie||p.projectionStatus==='EMPIRICAL_ROOKIE_PRIOR')flags.push('Новичок: индивидуальной статистики NBA нет, используется групповой ориентир');
 if(p.coverageStatus==='LOW_SAMPLE')flags.push('Малая выборка: историческая оценка неустойчива');
 if(p.injuries?.length)flags.push('Текущий отчёт источника: '+p.injuries.map(i=>i.status).join(', '));
 if(games.length&&Math.min(...games)<55)flags.push('Нестабильная доступность: в истории '+Object.entries(p.historyGames).map(([s,n])=>s+' — '+n+' игр').join('; ')+'. Причины всех пропусков не установлены');
 if(p.newHighVolumeTeammates?.length||p.roleContext?.roleChange)flags.push('Изменение роли: новые партнёры с большим объёмом бросков '+(p.newHighVolumeTeammates||[]).join(', ')+'. Снижение usage и ФО возможно, но не измерено');
 const high=p.isRookie||p.coverageStatus==='LOW_SAMPLE'||p.coverageStatus==='EARLIER_SEASON'||p.returnContext||p.injuries?.some(i=>/out|suspension/i.test(i.status||''))||(games.length&&Math.min(...games)<40);
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
export function analyzeRecommendations(state,focus=null){
 const used=new Set(state.picks.map(p=>p.playerId));
 const pool=state.players.filter(p=>!used.has(p.id)&&Number.isFinite(p.projectedFP)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).sort((a,b)=>b.projectedFP-a.projectedFP).slice(0,20);
 if(focus&&!pool.some(p=>p.id===focus.id)&&!used.has(focus.id)&&Number.isFinite(focus.projectedFP)){try{pick(state,focus.id);if(pool.length===20)pool.pop();pool.push(focus);}catch{}}
 const random=randomFromSeed(101+state.picks.length),wins=new Map(pool.map(p=>[p.id,0]));
 for(let scenario=0;scenario<100;scenario++){
  let best=null,score=-Infinity;
  for(const p of pool){const risk=riskProfile(p);const value=p.projectedFP*(risk.minFactor+random()*(risk.maxFactor-risk.minFactor));if(value>score){score=value;best=p.id;}}
  if(best!==null)wins.set(best,wins.get(best)+1);
 }
 pool.sort((a,b)=>wins.get(b.id)-wins.get(a.id)||b.projectedFP-a.projectedFP);
 return (focus?pool.filter(p=>p.id===focus.id):pool.slice(0,5)).map(p=>{
  const risk=riskProfile(p),alternative=pool.find(x=>x.id!==p.id),advantages=[`Базовая оценка ${p.projectedFP.toFixed(2)} ФО за матч по ${p.projectionBaseSeason||'группе молодых игроков'}`,'Допустим для текущего позиционного состава'];
  if(p.isRookie)advantages.push('Закрывает обязательное требование rookie');
  if(p.positions.length>1)advantages.push('Гибкость позиций '+p.positions.join('/')+' в используемом источнике');
  if(!risk.flags.length)advantages.push('В загруженных данных не обнаружены дополнительные флаги риска; это не гарантия здоровья');
  const drawbacks=[...risk.flags,'ФО без бонуса результата; оценка сезона не подтверждена'];
  if(p.positionStatus==='ESTIMATED_FROM_ESPN_NOT_YAHOO')drawbacks.push('Допуск Yahoo не проверен: использованы позиции ESPN');
  if(alternative)drawbacks.push(`Альтернатива сейчас: ${alternative.name} (${alternative.projectedFP.toFixed(2)} базовых ФО/матч)`);
  const stability=wins.get(p.id),pressure=selectionPressure(pool,p,551+state.picks.length);
  return {player:p,risk,advantages,drawbacks,stability,pressure,
   conclusion:p.id===pool[0]?.id?(stability>=60?'Предпочтительный выбор в этом стресс-тесте':'Однозначного пика нет: лидер зависит от допущений'):'Сравнить с лидером, особенно если нужен этот слот или rookie',
   method:`${stability} из 100 условных сценариев дали лучший результат среди ${pool.length} допустимых кандидатов. Нагрузка/роль: ${Math.round(risk.minFactor*100)}–${Math.round(risk.maxFactor*100)}% базовой оценки — стресс-допущение, не прогноз. Не вероятность победы и не калиброванная уверенность. Потребность других GM до следующего пика не подтверждена.`};
 });
}
