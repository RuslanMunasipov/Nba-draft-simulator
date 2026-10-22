// Browser smoke test of the built site on a phone viewport: no script errors while the season tab, the transfer
// explanations, the draft tab, the rookie filter and player cards render. Usage: node scripts/e2e-smoke.mjs [url]
import {chromium,devices} from '@playwright/test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const url=process.argv[2]||'http://localhost:4174/Nba-draft-simulator/';
// Its own process group, so the preview server npx starts is stopped with it.
const server=process.argv[2]?null:spawn('npx',['vite','preview','--port','4174','--strictPort'],{stdio:'ignore',detached:true});
try{
 if(server)await new Promise(r=>setTimeout(r,3000));
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await (await browser.newContext({...devices['iPhone 13']})).newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>/База готова/.test(document.getElementById('startup-status')?.textContent||''),null,{timeout:60000});
 // Every season view (one module each, src/season-ui/) renders.
 for(const name of ['Обзор','Команды','Травмы','Матчи']){await page.getByRole('button',{name}).first().click();await page.waitForTimeout(1200);
  assert.ok((await page.locator('#season-body').innerText()).length>50,name+' renders');}
 await page.getByRole('button',{name:'Трансферы'}).first().click();await page.waitForTimeout(2000);
 const why=page.locator('.sp-why').first();
 if(await why.count()){await why.locator('summary').click();await page.waitForTimeout(300);assert.match(await why.innerText(),/Уверенность/);}
 // The players page: free players by this season's points, a row opens with its games and the analyser's swap, and
 // sorting by the analyser keeps the list.
 await page.getByRole('button',{name:'Игроки'}).first().click();await page.waitForSelector('.mk-list .mk-row',{timeout:30000});
 const rows=await page.locator('.mk-row').count();assert.ok(rows>=10,'players page lists free players: '+rows);
 await page.locator('.mk-row summary').first().click();await page.waitForTimeout(300);
 assert.match(await page.locator('.mk-details').first().innerText(),/Матчи сезона|ещё не играл/);
 await page.getByRole('button',{name:'Анализатор'}).first().click();await page.waitForTimeout(1500);
 assert.ok(await page.locator('.mk-row').count()>=10,'sorted by the analyser');
 await page.getByRole('button',{name:'ФО/матч'}).first().click();await page.waitForTimeout(500);
 // The awards page: the day's top ten of the NBA from the awards bot's summary (site.json), and the season races.
 await page.getByRole('button',{name:'Награды'}).first().click();await page.waitForSelector('.aw-list .aw-row',{timeout:30000});
 assert.ok(await page.locator('.aw-list .aw-row').count()>=3,'the day\'s top from the awards archive');
 await page.locator('.aw-tabs button').nth(2).click();await page.waitForTimeout(1500);
 assert.ok(await page.locator('.aw-race').count()===4,'four award races');
 // The rules screen checks all eight teams.
 await page.getByRole('button',{name:'Правила'}).first().click();await page.waitForTimeout(1500);
 const ruleRows=await page.locator('.sp-table tr').count();assert.ok(ruleRows>=9,'rules table has eight teams: '+ruleRows);
 await page.getByRole('button',{name:'Драфт'}).first().click();await page.waitForTimeout(2000);
 // The real draft is restored from the official picks of 18.10 and is complete, so its search is closed; the rookie filter
 // and the player cards are checked in a training draft.
 assert.ok(await page.locator('#draft-desk').isHidden(),'the restored real draft is complete');
 await page.locator('#settings > summary').click();await page.selectOption('#draft-mode','INTERACTIVE');await page.waitForTimeout(2000);
 await page.locator('#rookies-only').check();await page.waitForTimeout(1500);
 const found=Number((await page.evaluate(()=>document.body.innerText)).match(/Найдено (\d+)/)?.[1]);
 assert.ok(found>=8,'rookie filter shows rookies: '+found);
 const toggles=page.locator('.player-toggle');for(let i=0;i<Math.min(5,await toggles.count());i++){await toggles.nth(i).click();await page.waitForTimeout(150);}
 assert.deepEqual(errors,[],'no script errors');
 console.log(`Browser smoke passed: ${found} rookies listed, every season view, players and awards pages, rules for 8 teams, transfer explanation and player cards render without errors`);
 await browser.close();
}finally{if(server)try{process.kill(-server.pid);}catch{}}
