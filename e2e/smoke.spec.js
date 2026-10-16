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
 await expect(page.locator('#history li')).toHaveCount(80);
 await expect(page.locator('#results li')).toHaveCount(8);
});
test('rookies and all requested explanation fields appear without settings',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 const first=page.locator('#advice .player-card').first();
 await expect(first).toContainText('Риск:');await expect(first).toContainText('Уверенность пика:');
 await expect(first).toContainText('Плюсы пика');await expect(first).toContainText('Минусы и альтернативы');
 await page.getByRole('checkbox',{name:'Только rookie',exact:true}).check();
 await expect(page.locator('#candidates .player-card').first()).toContainText('групповая историческая оценка');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('searched Kawhi and Maxey have risk, comparison and scenario confidence',async({page})=>{
 await page.goto('./');await expect(page.locator('#advice .player-card')).toHaveCount(5);
 for(const name of ['Kawhi','Maxey']){
  await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill(name);
  const card=page.locator('#candidates .player-card').first();
  await expect(card).toContainText('Уверенность пика:');
  await expect(card).toContainText('Плюсы пика');await expect(card).toContainText('Минусы и альтернативы');
  await expect(card).toContainText('Альтернатива сейчас:');
 }
 await expect(page.locator('#candidates')).toContainText('Изменение роли:');
});
