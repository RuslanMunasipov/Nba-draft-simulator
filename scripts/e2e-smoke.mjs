// Browser smoke test of the built site on a phone viewport: no script errors while the season tab, the transfer
// explanations, the draft tab, the rookie filter and player cards render. Usage: node scripts/e2e-smoke.mjs [url]
import {chromium,devices} from '@playwright/test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const url=process.argv[2]||'http://localhost:4174/Nba-draft-simulator/';
const server=process.argv[2]?null:spawn('npx',['vite','preview','--port','4174','--strictPort'],{stdio:'ignore'});
try{
 if(server)await new Promise(r=>setTimeout(r,3000));
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await (await browser.newContext({...devices['iPhone 13']})).newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>/База готова/.test(document.getElementById('startup-status')?.textContent||''),null,{timeout:60000});
 await page.getByRole('button',{name:'Трансферы'}).first().click();await page.waitForTimeout(2000);
 const why=page.locator('.sp-why').first();
 if(await why.count()){await why.locator('summary').click();await page.waitForTimeout(300);assert.match(await why.innerText(),/Уверенность/);}
 await page.getByRole('button',{name:'Драфт'}).first().click();await page.waitForTimeout(2000);
 await page.locator('input[type=checkbox]').first().check();await page.waitForTimeout(1500);
 const found=Number((await page.evaluate(()=>document.body.innerText)).match(/Найдено (\d+)/)?.[1]);
 assert.ok(found>=8,'rookie filter shows rookies: '+found);
 const toggles=page.locator('.player-toggle');for(let i=0;i<Math.min(5,await toggles.count());i++){await toggles.nth(i).click();await page.waitForTimeout(150);}
 assert.deepEqual(errors,[],'no script errors');
 console.log(`Browser smoke passed: ${found} rookies listed, transfer explanation and player cards render without errors`);
 await browser.close();
}finally{server?.kill();}
