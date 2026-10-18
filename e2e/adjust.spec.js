import {test,expect} from '@playwright/test';
test('a GM forecast adjustment feeds the optimal plan',async({page})=>{
 await page.goto('./');const plan=page.locator('#plan');
 await expect(plan).toContainText('Бери сейчас:',{timeout:120000});
 const first=(await plan.locator('p').first().textContent()).match(/Бери сейчас: ([^.]+)\./)[1];
 await page.getByRole('textbox',{name:'Поиск игрока',exact:true}).fill(first);
 const card=page.locator('#candidates .player-card').first();await card.locator('h3').click();
 const input=card.getByRole('spinbutton',{name:'Моя поправка к прогнозу '+first});await input.fill('-60');await input.blur();
 await expect(plan).toContainText('Бери сейчас:',{timeout:120000});
 await expect(plan.locator('p').first()).not.toContainText('Бери сейчас: '+first+'.',{timeout:120000});
 await page.reload();await expect(plan).toContainText('Бери сейчас:',{timeout:120000});
 await expect(plan.locator('p').first()).not.toContainText('Бери сейчас: '+first+'.');
});
