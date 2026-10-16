const output=document.getElementById('model-report');
fetch(import.meta.env.BASE_URL+'data/forecast-audit.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 document.getElementById('model-status').textContent=`Полный расчёт: ${data.forecastPlayers} игроков, в том числе ${data.rookieForecasts} rookie. Проверено ${new Date(data.checkedAt).toLocaleString('ru-RU')}.`;
 function p(text){const el=document.createElement('p');el.textContent=text;output.append(el);}
 const rules=data.leagueRules;
 if(rules)p(`Регламент FBL подтверждён: ${rules.teams} команд × ${rules.rosterSize} игроков; по два PG, SG, SF, PF, C; минимум один rookie; прямой драфт 1→8; изменяемый cap ${rules.cap.default}. Позиции — Yahoo, цены — Sports.ru. Правила подтверждены пользователем; фактический допуск Yahoo и цены в базе ещё не проверены. До проверки цен бюджет не применяется.`);
 p('ФО = очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2 × потери − фолы + бонус минут + бонус результата команды.');
 p('Бонус минут: +2 при 10+ минутах, иначе +1. Результат: победа дома +2, в гостях +3; поражение дома −3, в гостях −2.');
 const link=document.createElement('a');link.href=data.rulesSource;link.textContent='Опубликованные правила Sports.ru';output.append(link);
 p('Минуты 2024/25 и 2025/26 преобразованы из MM.SS по контролю командных сумм. В 2023/24 секунды отсутствуют, поэтому точность минут этого сезона ниже.');
 p('Статистика, минуты и матчи: индивидуальный ESPN; при отсутствии — исторический ориентир. Фолы и разброс: собственные NBA-матчи игрока либо 10 ближайших статистических профилей по стандартизованным показателям. Бонус команды опирается на результат прошлого сезона, восстановленный из полных протоколов.');
 p('Потолок матча — 90-й процентиль ролевых исторических сценариев, а не рекорд игрока или обещание. Сезонный диапазон использует совместные изменения числа игр и ФО/матч, включая полностью пропущенные сезоны. Ширина калибруется на отдельных игроках; настройка и проверка на следующем сезоне разделены. Для rookie это перенос по аналогам, без отдельной проверки точности именно новичков.');
 const rookie=data.rookieComponentAudit;
 if(rookie?.players)p(`Rookie: проверен перенос фолов и бонусов на ${rookie.players} игроках сезонов 2024/25 и 2025/26. Ошибка этих компонентов: ${rookie.conditionalPerGameMAE.toFixed(2)} ФО/матч; без их оценки: ${rookie.excludingComponentsMAE.toFixed(2)}. Входные очки, подборы, передачи и минуты здесь уже известны: это проверка компонентов, а не прогноза будущей статистики. Выборка ограничена игроками действующих ростеров.`);
 if(rookie?.players&&rookie.conditionalPerGameMAE>=rookie.excludingComponentsMAE)p('На этой малой выборке перенос компонентов rookie не улучшил простой ориентир. Потолок и момент пика новичка требуют проверки сценариев; отдельная точность будущей статистики не доказана.');
 if(data.projectionArchive){
  const available=data.projectionArchive.seasons.filter(s=>s.status==='LIVE_ENDPOINT_NOT_FROZEN').length;
  p(available?'Записи старых сезонов ESPN получены, но их предсезонная дата не подтверждена. Без датированного снимка они исключены из бэктеста.':'Запросы к архивным сезонам ESPN отклонены источником. Проверенного предсезонного архива для бэктеста ESPN пока нет.');
 }
 const h=data.holdout;
 p(`Историческая проверка: сценарии 2023/24 → 2024/25, проверка на 2025/26; ${h.players} игроков. MAE простого повторения прошлого сезона: ${Math.round(h.historicalPersistenceSeasonMAE)} ФО; выбранной модели: ${Math.round(h.selectedModelSeasonMAE)} ФО. Покрытие сезонного диапазона с целевыми 80%: ${Math.round(h.empirical80RangeCoverage*100)}%; средняя ширина: ${Math.round(h.meanRangeWidth)} ФО. Включено игроков без матчей: ${h.absentPlayers}. Ошибка числа матчей: ${h.gamesMAE.toFixed(1)} (повторение прошлого сезона: ${h.baselineGamesMAE.toFixed(1)}); ФО/матч среди игравших: ${h.perGameMAEAmongActive.toFixed(1)}.`);
 p(`Парная разница MAE в пользу модели: ${(h.historicalPersistenceSeasonMAE-h.selectedModelSeasonMAE).toFixed(1)} ФО; bootstrap-интервал 95%: ${h.pairedMAEGain95Bootstrap.map(v=>v.toFixed(1)).join(' … ')}. Это оценка неопределённости сравнения на исторической выборке.`);
 p('Правило защиты от слишком узких диапазонов добавлено после диагностики 2025/26: это проверка в ходе разработки, а не нетронутый внешний экзамен.');
 p('Эта проверка относится к историческому ориентиру и сценарному диапазону. Она не доказывает точность текущего ESPN-прогноза. Игроки без матчей в тестовом сезоне включены с нулевым результатом. Это может означать травму, завершение карьеры или уход из NBA. Целевые 80% относятся к группе, а не к личной вероятности игрока. Карьерный потолок не моделируется.');
}).catch(()=>{document.getElementById('model-status').textContent='Отчёт модели временно недоступен.';});
