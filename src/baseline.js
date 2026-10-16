const search=document.getElementById('baseline-search'),output=document.getElementById('baseline-data');
let baseline;
function render(){
 if(!baseline)return;
 const q=search.value.toLowerCase();output.replaceChildren();
 for(const p of baseline.players.filter(p=>p.name.toLowerCase().includes(q)).slice(0,10)){
  const li=document.createElement('li');
  li.textContent=`${p.name}: оценка ${p.estimatedCoreFPPerGame} базовых ФО/матч, ${p.expectedMinutes} мин, ${p.expectedObservedGames} матчей, ${p.estimatedCoreSeasonTotal} базовых ФО за сезон. Основа: ${p.trainingSeasons.join(', ')}. Неопределённость высокая; изменения роли и травмы не учтены.`;
  output.append(li);
 }
}
search.oninput=render;
fetch(import.meta.env.BASE_URL+'data/experimental-baseline.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 baseline=data;const e=data.evaluation;
 document.getElementById('baseline-status').textContent=`Проверка: обучение на ${e.trainSeasons.join(', ')}, отложенный сезон ${e.testSeason}. `+Object.entries(e.models).map(([name,m])=>`${name}: MAE базовых ФО/матч ${m.maeCoreFPPerGame}, минуты ${m.maeMinutes}, матчи ${m.maeObservedGames}; ${m.players} игроков`).join(' | ')+`. Выбрана ${e.selectedModel} по ошибке ФО/матч. Это сравнение на одном отложенном сезоне, а не независимая проверка выбранной модели. Игроки с менее чем 20 матчами исключены; 2024/25 неполон. Данные заканчиваются ${data.dataCutoff}.`;
 render();
}).catch(()=>{document.getElementById('baseline-status').textContent='Экспериментальная модель недоступна. Драфт работает независимо от неё.';});
