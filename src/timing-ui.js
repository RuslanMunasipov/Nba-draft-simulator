let previous,worker;
const $=id=>document.getElementById(id);
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
export function renderTiming(state){
 if(previous===state)return;previous=state;worker?.terminate();$('timing-result').replaceChildren();
 if(!state.players.length){$('timing-status').textContent='Жду базу индивидуальных прогнозов…';return;}
 if(state.picks.some(p=>p.team===0&&state.players.find(x=>x.id===p.playerId)?.isRookie)){$('timing-status').textContent='Ваш обязательный rookie уже выбран. Расчёт первого rookie больше не нужен.';return;}
 $('timing-status').textContent='Сравниваю раунды выбора в сценариях раннего, среднего, позднего и смешанного спроса GM… Интерфейс доступен.';
 const snapshot=state,current=new Worker(new URL('./rookie-timing-worker.js',import.meta.url),{type:'module'});worker=current;
 current.onerror=()=>{current.terminate();if(previous===snapshot)$('timing-status').textContent='Не удалось завершить расчёт. Точный раунд не будет выдуман.';};
 current.onmessage=({data})=>{
  current.terminate();if(previous!==snapshot)return;
  if(data.error){$('timing-status').textContent=data.error;return;}
  const r=data.result;
  if(r.covered){$('timing-status').textContent=r.message;return;}
  $('timing-status').textContent=`Проверено ${r.totalDrafts} условных драфтов · ${r.cohort} сопоставимых прогнозов · ${r.rookies} rookie.`;
  const box=$('timing-result');
  if(r.recommendedRound===null){box.append(text('strong','Нет проверенного решения: стратегии содержат недопустимые прогоны.'));return;}
  box.append(text('h3',`Условный лучший план: раунд ${r.recommendedRound}, наш пик №${r.recommendedPick}`));
  box.append(text('p',r.stable?'Этот раунд лидирует во всех совместимых заданных сценариях. Это не гарантия реальных действий GM.':`Единого устойчивого раунда нет: сценарные лидеры — от ${r.profileRange[0]} до ${r.profileRange[1]} раунда. После реальных пиков расчёт обновится.`));
  box.append(text('p',`Отрыв от следующего плана по среднему результату: ${r.meanGap?.toFixed(0)??'—'} частичных ФО за сезон всего состава. Малые разницы не доказывают преимущество: PF и бонусы не учтены.`));
  const advanced=document.createElement('details');advanced.append(text('summary','Математика и сценарии'));box.append(advanced);
  for(const p of r.bestByProfile)advanced.append(text('p',`${p.name}: лучший раунд ${p.round??'не определён'}.`));
  advanced.append(text('p',`Альтернативный критерий минимакса сожаления даёт раунд ${r.robustRound??'не определён'}. Это другая цель оптимизации, а не дополнительная уверенность в основном результате.`));
  if(r.excludedProfiles?.length)advanced.append(text('p','Уже записанные пики противоречат сценариям: '+r.excludedProfiles.join('; ')+'. Они исключены из сравнения.'));
  const wrapper=document.createElement('div');wrapper.style.overflowX='auto';const table=document.createElement('table');
  const header=document.createElement('tr');for(const title of ['План: раунд / пик','Команда: среднее','Вклад rookie','Макс. отставание','Верхняя тройка rookie','Валидные'])header.append(text('th',title));table.append(header);
  for(const row of r.rows){const tr=document.createElement('tr');for(const value of [`${row.round} / ${row.pick}`,row.meanTeam?.toFixed(0)??'—',row.meanRookie?.toFixed(0)??'—',row.worstRegret?.toFixed(0)??'нет решения',row.profiles.map(p=>`${p.topTierRuns}/${p.runs}`).join(' · '),row.profiles.map(p=>`${p.validRuns}/${p.runs}`).join(' · ')])tr.append(text('td',value));table.append(tr);}
  wrapper.append(table);advanced.append(wrapper,text('p',r.method),text('p','Ранний выбор может улучшить rookie, но ухудшить доступного ветерана. Таблица сравнивает итог всего состава, а не одного новичка. Реальные предпочтения семи GM неизвестны; ESPN ADP не учитывает обязательного rookie в FBL.'));
 };
 current.postMessage({state:snapshot});
}
