import {test,expect} from '@playwright/test';
const fixture={generatedAt:'2026-10-16T00:00:00Z',coverage:{players:120,rookies:20},players:Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],projectedFP:30-i/10,isRookie:i>=100}))};
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
