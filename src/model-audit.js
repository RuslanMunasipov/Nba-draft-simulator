const output=document.getElementById('model-report');
fetch(import.meta.env.BASE_URL+'data/forecast-audit.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 document.getElementById('model-status').textContent=`Полный расчёт: ${data.forecastPlayers} игроков, в том числе ${data.rookieForecasts} rookie. Проверено ${new Date(data.checkedAt).toLocaleString('ru-RU')}.`;
 function p(text){const el=document.createElement('p');el.textContent=text;output.append(el);}
 p('ФО = очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2 × потери − фолы + бонус минут + бонус результата команды.');
 p('Бонус минут: +2 при 10+ минутах, иначе +1. Результат: победа дома +2, в гостях +3; поражение дома −3, в гостях −2.');
 const link=document.createElement('a');link.href=data.rulesSource;link.textContent='Опубликованные правила Sports.ru';output.append(link);
 p('Статистика, минуты и матчи: индивидуальный ESPN; при отсутствии — исторический ориентир. Фолы и разброс: собственные NBA-матчи игрока либо 10 ближайших статистических профилей по стандартизованным показателям. Бонус команды опирается на результат прошлого сезона, восстановленный из полных протоколов.');
 p('Потолок матча — 90-й процентиль ролевых исторических сценариев, а не рекорд игрока или обещание. Сезонный диапазон использует совместные изменения числа игр и ФО/матч между сезонами. Для rookie это перенос по аналогам, без отдельной проверки точности именно новичков.');
 const h=data.holdout;
 p(`Отложенная проверка: сценарии 2023/24 → 2024/25, проверка на 2025/26; ${h.players} игроков. Ошибка исторического прогноза сезона MAE: ${Math.round(h.historicalPersistenceSeasonMAE)} ФО; фактическое покрытие сценарного диапазона P10–P90: ${Math.round(h.empirical80RangeCoverage*100)}%.`);
 p('Эта проверка относится к историческому ориентиру и сценарному диапазону. Она не доказывает точность текущего ESPN-прогноза. Игроки без матчей в тестовом сезоне не вошли в оценку; долгие травмы и отсутствие всего сезона требуют отдельной проверки. Карьерный потолок не моделируется.');
}).catch(()=>{document.getElementById('model-status').textContent='Отчёт модели временно недоступен.';});
