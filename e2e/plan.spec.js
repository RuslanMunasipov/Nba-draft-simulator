import {test,expect} from '@playwright/test';
test('optimal roster plan proposes a pick, prices each alternative and can make the pick',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 const plan=page.locator('#plan');
 await expect(plan).toContainText('Бери сейчас:',{timeout:120000});
 await expect(plan.locator('.plan-list li')).toHaveCount(10);
 expect(await plan.locator('.plan-options li').count()).toBeGreaterThan(2);
 await plan.locator('.plan-options .plan-pick').first().click();
 await expect(page.locator('#turn')).toContainText('Пик 2 / 80');
 await expect(plan).toContainText('К твоему пику #9',{timeout:120000});
 await expect(plan.locator('.plan-list li')).toHaveCount(9);
 expect(errors).toEqual([]);
});
