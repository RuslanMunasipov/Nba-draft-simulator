const search=document.getElementById('baseline-search'),output=document.getElementById('baseline-data');
let baseline;
let limit=10;
function render(){
 if(!baseline)return;
 const q=search.value.toLowerCase();output.replaceChildren();
 for(const p of baseline.players.filter(p=>p.name.toLowerCase().includes(q)).slice(0,limit)){
  const li=document.createElement('li');
  const labels={RECENT_SEASON:'последний сезон',EARLIER_SEASON:'использован более ранний сезон',LOW_SAMPLE:'малая выборка'};
  li.textContent=`${p.name}: ${p.estimatedCoreFPPerGame} базовых ФО/матч, минутная основа ${p.expectedMinutes}. Матчи: ${p.expectedObservedGames??'не оценены'}; сезонные ФО: ${p.estimatedCoreSeasonTotal??'не оценены'}. ${labels[p.coverageStatus]}; база ${p.baseSeason}, ${p.sampleGames} матчей. Основа: ${p.trainingSeasons.join(', ')}. Неопределённость ${p.uncertainty==='VERY_HIGH'?'очень высокая':'высокая'}. Текущая роль и нагрузка не подтверждены.`;
  if(p.returnContext){li.append(document.createElement('br'));const link=document.createElement('a');link.href=p.returnContext.source;link.textContent=p.returnContext.note+` Источник ${p.returnContext.publishedAt}, проверено ${p.returnContext.checkedAt}.`;li.append(link);}
  output.append(li);
 }
 document.getElementById('baseline-more').hidden=baseline.players.filter(p=>p.name.toLowerCase().includes(q)).length<=limit;
}
search.oninput=()=>{limit=10;render();};
document.getElementById('baseline-more').onclick=()=>{limit+=25;render();};
fetch(import.meta.env.BASE_URL+'data/experimental-baseline.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 baseline=data;const e=data.evaluation;
 document.getElementById('baseline-status').textContent=`Охват: ${data.coverage.includedPlayers}/${data.coverage.historicalPlayers} игроков из истории; более ранний сезон — ${data.coverage.earlierSeason}, малая выборка — ${data.coverage.lowSample}. Действующий состав NBA для всех не подтверждён; новые rookie без истории требуют отдельного источника. Проверка: обучение на ${e.trainSeasons.join(', ')}, отложенный сезон ${e.testSeason}. `+Object.entries(e.models).map(([name,m])=>`${name}: MAE базовых ФО/матч ${m.maeCoreFPPerGame}, минуты ${m.maeMinutes}, матчи ${m.maeObservedGames}; ${m.players} игроков`).join(' | ')+`. Выбрана ${e.selectedModel} по ошибке ФО/матч. Это сравнение на одном отложенном сезоне, а не независимая проверка выбранной модели. Порог 20 матчей относится только к оценке ошибки модели, а не к охвату каталога; 2024/25 неполон. Данные заканчиваются ${data.dataCutoff}.`;
 render();
}).catch(()=>{document.getElementById('baseline-status').textContent='Экспериментальная модель недоступна. Драфт работает независимо от неё.';});
