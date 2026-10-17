import {test,expect} from '@playwright/test';
const fixture={priceMode:'ON',cap:20000,generatedAt:'2026-10-16T00:00:00Z',coverage:{players:120,rookies:20},players:Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],projectedFP:30-i/10,isRookie:i>=100,price:1500,priceStatus:'VERIFIED'}))};
test('storage quota cannot prevent fetched database installation or a manual pick',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#startup-status')).toContainText('База готова');
 await expect(page.locator('#storage-status')).toBeVisible();
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
});
test('denied storage reads and unsupported workers do not abort startup',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}});
  window.Worker=class{constructor(){throw new Error('Worker unavailable');}};
 });
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#storage-status')).toBeVisible();
 await page.getByRole('combobox',{name:'Тема оформления'}).selectOption('light');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 expect(errors).toEqual([]);
});
test('dark theme is default and explicit theme choice survives reload',async({page})=>{
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(11, 21, 31)');
 await page.getByRole('combobox',{name:'Тема оформления'}).selectOption('light');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('combobox',{name:'Тема оформления'}).selectOption('dark');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
test('hung database request ends with retry and recovers without imports',async({page})=>{
 await page.route('**/data/default-draft.json',()=>{});
 await page.goto('./');
 await expect(page.locator('#load-retry')).toBeVisible({timeout:30000});
 await expect(page.locator('#advice')).toContainText('Не удалось загрузить базу');
 await page.unroute('**/data/default-draft.json');
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();
 await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#startup-status')).toContainText('База готова');
 await expect(page.locator('#load-retry')).toBeHidden();
});

test('legacy priced draft adopts current Sports.ru prices and cap while preserving picks',async({page})=>{
 await page.addInitScript(({players,generatedAt})=>{
  if(!localStorage.getItem('fbl-draft'))localStorage.setItem('fbl-draft',JSON.stringify({version:1,cap:1,priceMode:'ON',players,picks:[{number:1,team:0,playerId:1}],databaseVersion:generatedAt}));
 },fixture);
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 await expect(page.locator('#my-roster')).toContainText('SYNTHETIC 0');
 await expect(page.locator('.hero-meta')).toContainText('Salary cap 20 000');
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 3 / 80');
 await page.reload();await expect(page.locator('#turn')).toContainText('Пик 3 / 80');
});
test('unsupported batch worker leaves controls usable and explains the available actions',async({page})=>{
 await page.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Worker unavailable');}};});
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 await page.locator('#batch').click();
 await expect(page.locator('#batch')).toBeEnabled();
 await expect(page.locator('#simulation-status')).toContainText('Ручные пики');
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 expect(errors).toEqual([]);
});

test('priced database shows cap and remaining budget and preserves them on reload',async({page})=>{
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:fixture}));
 await page.goto('./');await expect(page.locator('#budget-status')).toContainText('потрачено 0 / 20000');
 await page.locator('#advice .player-card button').first().click();
 await expect(page.locator('#my-roster')).toContainText('Мой бюджет: 1500 / 20000 · осталось 18500');
 await page.reload();await expect(page.locator('#my-roster')).toContainText('осталось 18500');
 await expect(page.locator('.hero-meta')).toContainText('Salary cap 20 000');
});
test('legacy missing-price pick is preserved with a repair message and cannot continue',async({page})=>{
 const old={...fixture,players:fixture.players.map(p=>({...p,price:null,priceStatus:'MISSING'})),picks:[{number:1,team:0,playerId:1}],version:1,databaseVersion:'legacy'};
 await page.addInitScript(s=>localStorage.setItem('fbl-draft',JSON.stringify(s)),old);
 const source={...fixture,players:fixture.players.map((p,i)=>i===0?{...p,price:null,priceStatus:'MISSING'}:p)};
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:source}));
 await page.goto('./');await expect(page.locator('#pricing-warning')).toBeVisible();
 await expect(page.locator('#my-roster')).toContainText('SYNTHETIC 0');
 await expect(page.locator('#advice .player-card')).toHaveCount(0);
 await page.getByText('История выборов',{exact:true}).click();
 await page.locator('#undo').click();await expect(page.locator('#pricing-warning')).toBeHidden();
 await expect(page.locator('#advice .player-card')).toHaveCount(5);
});

test('a third Sports.ru PF is blocked even when Yahoo permits C and SF',async({page})=>{
 const source={...fixture,positionAuthority:'Sports.ru',players:fixture.players.map((p,i)=>({...p,positions:[0,8,16].includes(i)?['PF']:p.positions,yahooPositions:['PF','C','SF'],positionStatus:'SPORTS_RU_VERIFIED'}))};
 await page.route('**/data/default-draft.json',route=>route.fulfill({json:source}));
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 for(let i=0;i<16;i++){
  await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC '+i);
  await page.locator('#candidates').getByRole('button',{name:'Выбрать SYNTHETIC '+i,exact:true}).click();
 }
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill('SYNTHETIC 16');
 await expect(page.locator('#candidates').getByRole('button',{name:'Выбрать SYNTHETIC 16',exact:true})).toBeDisabled();
 await expect(page.locator('#candidates')).toContainText('Невозможно назначить позиции');
 await expect(page.locator('#candidates')).toContainText('Yahoo для переноса: PF/C/SF');
});
