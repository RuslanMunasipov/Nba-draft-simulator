import {test,expect} from '@playwright/test';
test('mobile fresh open needs no file and preserves a chosen returning player',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await expect(page.locator('#player-count')).toContainText(/в базе [1-9][0-9]{2,}/);
 await expect(page.locator('#settings')).not.toHaveAttribute('open','');
 await expect(page.locator('#advice .player-card')).toHaveCount(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Haliburton');
 await expect(page.locator('#candidates')).toContainText('2024-25');
 await page.locator('#candidates').getByRole('button',{name:'Выбрать Tyrese Haliburton',exact:true}).click();
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 await page.reload();await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 await page.route('**/data/default-draft.json',route=>route.abort());await page.reload();
 await expect(page.locator('#database-status')).toContainText('сохранённая база');
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');expect(errors).toEqual([]);
});
test('training automatically executes seven bots and full default draft',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('combobox',{name:'Режим',exact:true}).selectOption('INTERACTIVE');
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 9 / 80');
 await page.getByRole('button',{name:'Завершить симуляцию',exact:true}).click();
 await expect(page.locator('#turn')).toHaveText('Драфт завершён');
 await expect(page.locator('#advice')).toHaveText('Драфт завершён. Все 80 выборов сохранены.');
 await expect(page.locator('#history li')).toHaveCount(80);
 await expect(page.locator('#results li')).toHaveCount(8);
 await expect(page.locator('#results')).toContainText('бюджет');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fbl-draft')));
 expect(saved.priceMode).toBe('ON');expect(saved.cap).toBe(20000);
 for(let team=0;team<8;team++){const roster=saved.picks.filter(p=>p.team===team).map(p=>saved.players.find(x=>x.id===p.playerId));expect(roster.every(p=>p.priceStatus==='VERIFIED')).toBe(true);expect(roster.reduce((sum,p)=>sum+p.price,0)).toBeLessThanOrEqual(20000);}
 await expect(page.locator('#results')).toContainText('ФО за сезон');
 await expect(page.locator('#simulation-status')).toContainText('сезонных прогнозов ФО');
 await expect(page.locator('#simulation-status')).not.toContainText('ФО/матч');
 await expect(page.locator('#rookie-status')).toContainText('Драфт завершён');
});
test('rookies and all requested explanation fields appear without settings',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 const first=page.locator('#advice .player-card').first();
 await expect(first).toContainText('Риск:');await expect(first).toContainText('Прогноз сезона:');
 await expect(first).toContainText('Плюсы пика');await expect(first).toContainText('Минусы и альтернативы');
 await page.getByRole('checkbox',{name:'Только rookie',exact:true}).check();
 await expect(page.locator('#candidates .player-card').first()).toContainText(/Групповой исторический ориентир|Индивидуальный прогноз|ФО за сезон/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('unknown Sports.ru price blocks Kawhi while Maxey retains comparison',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Kawhi');
 await expect(page.locator('#candidates .player-card').first()).toContainText('Цена Sports.ru: отсутствует');
 await expect(page.locator('#candidates .player-card').first().getByRole('button',{name:'Выбрать Kawhi Leonard',exact:true})).toBeDisabled();
 for(const name of ['Maxey']){
  await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill(name);
  const card=page.locator('#candidates .player-card').first();
  await expect(card).toContainText('Прогноз сезона:');
  await expect(card).toContainText('Плюсы пика');await expect(card).toContainText('Минусы и альтернативы');
  await expect(card).toContainText('Альтернатива сейчас:');
 }
 await expect(page.locator('#candidates')).toContainText('Изменение роли:');
});

test('mobile blocks a searched pick that strands the required rookie',async({page})=>{
 const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+(i+1),positions:i<22?['PG']:['PG','SG','SF','PF','C'],projectedFP:120-i,isRookie:i<20}));
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-16T00:00:00Z',players,coverage:{players:120,rookies:20}}}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 for(const id of [21,30,31,32,33,34,35,36]){
  await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC '+id);
  await page.locator('#candidates').getByRole('button',{name:'Выбрать SYNTHETIC '+id,exact:true}).click();
 }
 await expect(page.locator('#turn')).toContainText('Пик 9 / 80');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC 22');
 await expect(page.locator('#candidates')).toContainText('Не рекомендован');
 await expect(page.locator('#candidates').getByRole('button',{name:'Выбрать SYNTHETIC 22',exact:true})).toBeDisabled();
 await expect(page.locator('#advice')).not.toContainText('SYNTHETIC 22');
});

test('high per-game injury risks do not crowd out five safer mobile choices',async({page})=>{
 const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+(i+1),positions:['PG','SG','SF','PF','C'],projectedFP:i<2?40:20,isRookie:i>=100,historyGames:i<2?{'2024-25':19,'2025-26':38}:{'2024-25':78,'2025-26':78}}));
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-16T00:00:00Z',players,coverage:{players:120,rookies:20}}}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#advice')).toContainText('Риск:');
 await page.getByText('Рискованные ставки — отдельно от основного ядра',{exact:true}).click();
 await expect(page.locator('#risky-advice')).toContainText('Рискованная ставка');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC 1');
 await expect(page.locator('#candidates .player-card').first().locator('h3')).toHaveText('SYNTHETIC 1');
 await expect(page.locator('#candidates .player-card').first()).toContainText('Два сезона с менее чем 50 играми');
});

test('Embiid source game projection is visible without promoting him into safe picks',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#advice')).toContainText('Риск:');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Embiid');
 const card=page.locator('#candidates .player-card').first();
 await expect(card).toContainText('Риск: ВЫСОКИЙ');await expect(card).toContainText('ESPN 2026/27: прогноз матчей');
 await expect(card).toContainText('ADP');await expect(card).toContainText('Рискованная ставка');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('rookie board uses individual ESPN projections instead of one group value',async({page})=>{
 await page.goto('./');await expect(page.locator('#rookie-advice .player-card')).toHaveCount(5);
 const card=page.locator('#rookie-advice .player-card').first();
 await expect(card).toContainText('ФО/матч');await expect(card).toContainText('мин/матч');
 await expect(card).toContainText('PTS');await expect(card).toContainText('TOV');
 await expect(card).toContainText('NBA Ceiling');
 await expect(page.locator('#rookie-status')).toContainText('Индивидуальный прогноз есть');
});

test('rookie timing worker compares all ten rounds while the mobile UI remains usable',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('link',{name:'Топ rookie по индивидуальному прогнозу',exact:true}).click();
 await expect(page.locator('#timing-result')).toContainText('Условный лучший план:',{timeout:180000});
 await expect(page.locator('#timing-result table tr')).toHaveCount(11);
 await expect(page.locator('#timing-status')).toContainText('960 условных драфтов');
 await expect(page.locator('#timing-result')).toContainText('предпочтения семи GM неизвестны');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('published mobile batch completes 100 draft scenarios without blocking input',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.locator('#batch').click();
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Jokic');
 await expect(page.locator('#candidates')).toContainText('Jokic');
 await page.locator('#candidates').getByRole('button',{name:'Выбрать Nikola Jokic',exact:true}).click();
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 await expect(page.locator('#simulation-status')).toContainText('допустимых 100/100',{timeout:180000});
 await expect(page.locator('#simulation-status')).toContainText('от пика №2');
 await expect(page.locator('#batch')).toBeEnabled();
});

test('completed draft runs 5000 season uncertainty scenarios with visible ranges',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.locator('#simulate').click();
 await expect(page.locator('#turn')).toContainText('Драфт завершён',{timeout:180000});
 await expect(page.locator('#batch')).toContainText('5 000 сценариев сезона');
 await page.locator('#batch').click();
 await expect(page.locator('#simulation-status')).toContainText('5000 сценариев неопределённости сезона',{timeout:180000});
 await expect(page.locator('#scenario-results tbody tr')).toHaveCount(8);
 await expect(page.locator('#scenario-results')).toContainText('P10–P90');
 await expect(page.locator('#scenario-results')).toContainText('не вероятность победы в FBL');
 await page.locator('#season-runs').selectOption('20000');
 await expect(page.locator('#batch')).toHaveText('20 000 сценариев сезона');
 await page.locator('#batch').click();
 await expect(page.locator('#simulation-status')).toContainText('20000 сценариев неопределённости сезона',{timeout:180000});
 await expect(page.locator('#scenario-results tbody tr')).toHaveCount(8);
});

test('specific rookie tradeoff updates after seven bots and disappears after our rookie pick',async({page})=>{
 const players=Array.from({length:140},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,isRookie:i>=120,positions:['PG','SG','SF','PF','C'],projectedFP:30-i/10,historyGames:{'2024-25':78,'2025-26':78},espnContext:{fetchedAt:'2026-10-16T00:00:00Z',adp:i+1,projectedGames:78,individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:2400-i*10,componentFPPerGame:(2400-i*10)/78,games:78,perGame:{minutes:30,points:20,rebounds:5,assists:4,steals:1,blocks:1,turnovers:2}}}}));
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-16T00:00:00Z',players,coverage:{players:140,rookies:20}}}));
 await page.goto('./');
 await expect(page.locator('#rookie-tradeoff')).toContainText('Наш пик №1 → следующий №9',{timeout:180000});
 await expect(page.locator('#rookie-tradeoff')).toContainText('Потеря rookie до следующего хода:');
 await page.getByRole('combobox',{name:'Режим',exact:true}).selectOption('INTERACTIVE');
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 9 / 80');
 await expect(page.locator('#rookie-tradeoff')).toContainText('Наш пик №9 → следующий №17',{timeout:180000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.locator('#rookie-advice button').first().click();
 await expect(page.locator('#timing-status')).toContainText('rookie уже выбран');
 await expect(page.locator('#rookie-tradeoff')).toHaveCount(0);
});

test('missing forecast in recorded picks blocks timing instead of inventing a comparison',async({page})=>{
 const players=Array.from({length:140},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,isRookie:i>=120,positions:['PG','SG','SF','PF','C'],projectedFP:30-i/10,historyGames:{'2024-25':78,'2025-26':78},espnContext:{fetchedAt:'2026-10-16T00:00:00Z',adp:i+1,projectedGames:78,individualProjection:{metric:'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',componentSeasonTotal:2400-i*10,componentFPPerGame:(2400-i*10)/78,games:78,perGame:{minutes:30,points:20,rebounds:5,assists:4,steals:1,blocks:1,turnovers:2}}}}));
 players[0].espnContext=null;
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-16T00:00:00Z',players,coverage:{players:140,rookies:20}}}));

 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC 0');
 await page.locator('#candidates').getByRole('button',{name:'Выбрать SYNTHETIC 0',exact:true}).click();
 await expect(page.locator('#timing-status')).toContainText('нет сопоставимого индивидуального прогноза',{timeout:30000});
 await expect(page.locator('#rookie-tradeoff')).toHaveCount(0);
});

test('player name toggles a formatted full report and roster progress stays visible',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.getByRole('heading',{name:'Собери сильный состав.'})).toBeVisible();
 const card=page.locator('#advice .player-card').first(),details=card.locator('.card-details');
 await expect(details).not.toHaveAttribute('open','');
 await card.locator('h3').click();await expect(details).toHaveAttribute('open','');
 await expect(card.getByText('Плюсы пика',{exact:true})).toBeVisible();
 await card.locator('h3').click();await expect(details).not.toHaveAttribute('open','');
 await expect(page.locator('#my-roster')).toContainText('0/10');
 await card.locator('button').click();await expect(page.locator('#my-roster')).toContainText('1/10');
 await expect(page.getByRole('progressbar',{name:'Прогресс драфта'})).toHaveAttribute('aria-valuenow','1');
 for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});
test('rookie name opens sourced editorial scouting report beside individual forecast',async({page})=>{
 await page.goto('./');const card=page.locator('#rookie-advice .player-card').first();
 await expect(card.locator('.forecast-panel')).toHaveCount(1);
 await card.locator('h3').click();
 await expect(card.getByRole('heading',{name:'Что даёт в фэнтези',exact:true})).toBeVisible();
 await expect(card.getByRole('heading',{name:'На что смотреть',exact:true})).toBeVisible();
 await expect(card.locator('.scouting-report a')).toHaveAttribute('href',/nba.com|rotoballer|fantasypros/);
 await expect(card.locator('.stats-grid .stat-cell')).toHaveCount(6);
});

test('season forecasts include full formula, distinct ceilings and no fake confidence',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 const card=page.locator('#advice .player-card').first();await card.locator('h3').click();
 await expect(card.locator('.forecast-panel')).toContainText('Верхний ориентир матча');
 await expect(card.locator('.forecast-panel')).toContainText('Сильный сезон');
 await expect(card).not.toContainText('Уверенность пика');
 await expect(card).not.toContainText('После пика существует полный позиционный состав');
 await expect(card).not.toContainText('Однозначного пика нет');
 await expect(card).toContainText('Альтернатива сейчас:');
 await page.getByText('Модель и проверка · формула, потолок, точность',{exact:true}).click();
 await expect(page.locator('#model-report')).toContainText('MAE');
 for(const width of [360,768]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});

test('Sports.ru determines draft positions while Yahoo remains a separate transfer reference',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Victor Wembanyama');
 const card=page.locator('#candidates .player-card').first();
 await expect(card.locator('h3')).toHaveText('Victor Wembanyama');
 await card.locator('h3').click();
 await expect(card).toContainText('Допуск драфта: позиция Sports.ru.');
 await expect(card).toContainText('Yahoo для переноса:');
 await expect(card.locator('.player-meta')).toHaveText('SA · C · 3200 ед.');
});

test('searched rookie group prior is explicitly labelled and never presented as personal history',async({page})=>{
 const players=Array.from({length:120},(_,i)=>({id:i+1,name:'PRIOR TEST '+i,positions:['PG','SG','SF','PF','C'],projectedFP:i===101?null:20,isRookie:i>=100,projectionStatus:i>=100?'EMPIRICAL_ROOKIE_PRIOR':'HISTORICAL_CORE_ESTIMATE'}));
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-17T00:00:00Z',players,coverage:{players:120,rookies:20}}}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('PRIOR TEST 100');
 const card=page.locator('#candidates .player-card').first();
 await expect(card).toContainText('Групповой ориентир rookie:');
 await expect(card).toContainText('Это не персональный прогноз.');
 await expect(card.locator('strong').first()).not.toContainText('Историческая основа');
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('PRIOR TEST 101');
 await expect(page.locator('#candidates .player-card').first().locator('h3')).toHaveText('PRIOR TEST 101 · rookie');
 await expect(page.locator('#candidates')).not.toContainText('NaN');
});

test('Cade exposes the actual turnover deduction and historical negative games',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Cade Cunningham');
 const card=page.locator('#candidates .player-card').first();await card.locator('h3').click();
 await expect(card.locator('.scoring-breakdown')).toContainText('Потери × −2');
 await expect(card.locator('.forecast-panel')).toContainText('Потери уже учтены:');
 await expect(card.locator('.forecast-panel')).toContainText('Минусовые матчи · 2025-26:');
 await expect(card.locator('.scoring-breakdown')).toContainText('Промахи с игры');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('Boozer can be selected directly, survives seven bots and reload, then completes a legal draft',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('combobox',{name:'Режим',exact:true}).selectOption('INTERACTIVE');
 await page.locator('#rookie-watch').getByRole('button',{name:'Взять rookie Cameron Boozer',exact:true}).click();
 await expect(page.locator('#turn')).toContainText('Пик 9 / 80');
 await expect(page.locator('#my-roster')).toContainText('Cameron Boozer');
 await expect(page.locator('#rookie-watch')).toContainText('Выбран GM 1 на пике №1');
 await page.reload();await expect(page.locator('#my-roster')).toContainText('Cameron Boozer');
 await page.getByRole('button',{name:'Завершить симуляцию',exact:true}).click();
 await expect(page.locator('#turn')).toHaveText('Драфт завершён');
 await expect(page.locator('#history li')).toHaveCount(80);
 await expect(page.locator('#results li')).toHaveCount(8);
 for(const row of await page.locator('#results li').allTextContents())expect(row).toContain('(PASS)');
});

for(const name of ['Caleb Wilson','AJ Dybantsa','Darryn Peterson','Darius Acuff Jr.']){
 test('leading rookie '+name+' is selectable and saved after seven bots',async({page})=>{
  await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
  await page.getByRole('combobox',{name:'Режим',exact:true}).selectOption('INTERACTIVE');
  await page.locator('#rookie-watch').getByRole('button',{name:'Взять rookie '+name,exact:true}).click();
  await expect(page.locator('#turn')).toContainText('Пик 9 / 80');
  await expect(page.locator('#my-roster')).toContainText(name);
  await page.reload();await expect(page.locator('#my-roster')).toContainText(name);
 });
}

test('full career loads on demand without replacing the draft forecast',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('Nikola Jokic');
 const card=page.locator('#candidates .player-card').first();await card.locator('h3').click();
 await card.locator('.online-evidence summary').click();
 await expect(card.locator('.online-evidence')).toContainText('NBA-карьера:',{timeout:30000});
 const select=card.getByRole('combobox',{name:'Сезон карьеры Nikola Jokic',exact:true});
 expect(await select.locator('option').count()).toBeGreaterThan(3);
 await expect(card.getByRole('button',{name:'Обновить онлайн',exact:true})).toBeVisible();
});

test('Russian initials keep Brown homonyms separate and permit a manual pick',async({page})=>{
 const players=Array.from({length:120},(_,i)=>({id:10000+i,name:'SEARCH FIXTURE '+i,team:'DEN',positions:['PG','SG','SF','PF','C'],projectedFP:25-i/100,isRookie:i>=100}));
 players[0]={...players[0],id:1627759,name:'Jaylen Brown',team:'BOS'};
 players[1]={...players[1],id:1628971,name:'Bruce Brown',team:'DEN'};
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:{generatedAt:'2026-10-18',players}}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 const search=page.getByRole('textbox',{name:'Поиск игрока',exact:true});
 await search.fill('Браун');await expect(page.locator('#candidates .player-card')).toHaveCount(2);
 for(const query of ['Дж. Браун','Дж Браун Бостон','J.Brown']){
  await search.fill(query);await expect(page.locator('#candidates .player-card')).toHaveCount(1);
  await expect(page.locator('#candidates h3')).toHaveText('Jaylen Brown');
 }
 await page.locator('#candidates').getByRole('button',{name:'Выбрать Jaylen Brown',exact:true}).click();
 await expect(page.locator('#my-roster')).toContainText('Jaylen Brown');
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
});


test('Russian initials and Sports.ru team terms keep Brown names distinct',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 const search=page.getByRole('textbox',{name:'Поиск игрока',exact:true});
 await search.fill('браун');
 await expect(page.locator('#candidates')).toContainText('Jaylen Brown');
 await expect(page.locator('#candidates')).toContainText('Bruce Brown');
 await search.fill('дж.браун');
 await expect(page.locator('#candidates h3')).toHaveText(['Jaylen Brown']);
 await search.fill('браун филадельфия');
 await expect(page.locator('#candidates h3')).toHaveText(['Jaylen Brown']);
});
