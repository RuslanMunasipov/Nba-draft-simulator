// Historical reference only: never feeds unverified positions or forecasts into the draft.
const season=document.getElementById('history-season');
const search=document.getElementById('history-search');
const output=document.getElementById('history-data');
let history;
function render(){
 if(!history)return;
 const q=search.value.toLowerCase();
 const rows=history.players.filter(p=>p.name.toLowerCase().includes(q)&&p.seasons[season.value])
  .sort((a,b)=>b.seasons[season.value].historicalCoreFPPerGame-a.seasons[season.value].historicalCoreFPPerGame).slice(0,50);
 output.replaceChildren();
 for(const p of rows){const s=p.seasons[season.value],li=document.createElement('li');
  li.textContent=`${p.name} • ${s.lastHistoricalTeam} (в выбранном сезоне) • ${s.games} матчей • ${s.averages.minutes} мин/матч по файлу • ${s.historicalCoreFPPerGame} базовых ФО/матч без бонуса результата`;
  output.append(li);
 }
}
season.onchange=render;search.oninput=render;
fetch(import.meta.env.BASE_URL+'data/nba-history.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
 .then(data=>{history=data;document.getElementById('history-status').textContent=`${data.players.length} игроков за три сезона. Источник: загруженные Parquet / kaggle_v515. 2024/25: неполное покрытие матчей. По документации загрузчика минуты десятичные; построчная сверка с NBA не выполнена. Позиции Yahoo, актуальные команды, травмы и прогнозы 2026/27 не подтверждены.`;render();})
 .catch(()=>{document.getElementById('history-status').textContent='Исторические данные сейчас недоступны. Текущий драфт сохранён; можно использовать ручной импорт.';});
