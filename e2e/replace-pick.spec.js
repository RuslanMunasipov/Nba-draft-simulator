import {test,expect} from '@playwright/test';
const choose=async(page,name,label='Выбрать '+name)=>{
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill(name);
 await page.locator('#candidates').getByRole('button',{name:label,exact:true}).click();
};
test('any earlier pick can be re-picked and later picks are replayed',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await expect(page.locator('#player-count')).toContainText(/в базе [1-9][0-9]{2,}/);
 await choose(page,'Nikola Jokic');await choose(page,'Shai Gilgeous-Alexander');await choose(page,'Victor Wembanyama');
 await expect(page.locator('#turn')).toContainText('Пик 4 / 80');
 await page.locator('#history').evaluate(el=>el.closest('details').open=true);
 await page.locator('#history li').nth(1).getByRole('button',{name:'Перевыбрать'}).click();
 await expect(page.locator('#turn')).toContainText('Перевыбор пика #2');
 await choose(page,'Luka Doncic','Поставить на пик #2: Luka Doncic');
 await expect(page.locator('#history li').nth(1)).toContainText('Luka Doncic');
 await expect(page.locator('#history li').nth(2)).toContainText('Victor Wembanyama');
 await expect(page.locator('#turn')).toContainText('Пик 4 / 80');
 await expect(page.locator('#replace-text')).toContainText('Остальные пики сохранены');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#history li').nth(0).getByRole('button',{name:'Перевыбрать'}).click();
 await choose(page,'Victor Wembanyama','Поставить на пик #1: Victor Wembanyama');
 await expect(page.locator('#turn')).toContainText('Пик 3 / 80');
 await expect(page.locator('#replace-text')).toContainText('Удалены пики с #3');
 await page.reload();await expect(page.locator('#turn')).toContainText('Пик 3 / 80');
 await expect(page.locator('#history li').nth(0)).toContainText('Victor Wembanyama');
 expect(errors).toEqual([]);
});
