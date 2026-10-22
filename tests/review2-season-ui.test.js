import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as ST from '../src/standings.js';
import * as FT from '../src/forecast-text.js';
import {riskAdjustedValue} from '../src/valuation.js';
import {seasonRosters,expectedPoints,teamPoints} from '../src/season.js';
import {checkRules,verdict} from '../src/rules.js';
// The season tab is src/season-ui.js and its view modules in src/season-ui/: read as one text.
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),source=f=>f==='src/season-ui.js'?[f,...fs.readdirSync(new URL('../src/season-ui/',import.meta.url)).sort().map(x=>'src/season-ui/'+x)].map(read).join('\n'):read(f),plain=s=>s.replace(/ /g,' ');
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const picks=Array.from({length:80},(_,i)=>i+1);
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// 80 drafted players and 20 free agents on one club C, which plays every other day from 24.10; #81 is a star.
const cal=Array.from({length:40},(_,i)=>({date:add('2026-10-24',2*i),week:1+Math.floor(i/3)}));
const players=Array.from({length:100},(_,i)=>({id:i+1,name:'P'+(i+1),sportsId:String(1000+i+1),espnId:String(5000+i+1),sportsClub:'C',
 positions:[POS[i<80?Math.floor(i/8):(i-80)%10]],price:1500,isRookie:i<80?Math.floor(i/8)===9:false,forecast:{meanPerGame:i===80?60:10,minutes:30,games:82,meanSeason:i===80?4920:820,seasonFloor:i===80?3000:500,seasonCeiling:i===80?6000:1100}}));
const live={clubs:{C:cal},players:Object.fromEntries(players.map(p=>[p.sportsId,{club:'C',games:[]}]))};
const league=(transfers,today='2026-10-24')=>({players,live,transfers,picks,rosters:seasonRosters(transfers,picks),injuries:new Map(),today});

// ---------- Y03: a running game scores for the team that held the player at its tip-off, as teamPoints will ----------
// The 24.10 matinee of club C tipped at 20:00 MSK (17:00Z) and is in the 3rd quarter; team 0 sells #1 for #81 at 21:00.
const game={date:'2026-10-24T17:00:00Z',detail:'8:22 - 3rd',state:'in'};
const sale=[{team:0,outId:1,inId:81,date:'2026-10-24',seenAt:'2026-10-24T18:00:00Z'}];
const running=new Map([[1,{points:20,minutes:25,day:'2026-10-24',game}],[81,{points:40,minutes:25,day:'2026-10-24',game}]]);
test('a buyer after the tip-off gets nothing of the running game; the seller keeps its points and the rest of it',()=>{
 const c=league(sale),credit=ST.runningCredit(c,running);
 assert.deepEqual([...credit.keys()],['0:1'],'#1 was team 0\'s at the tip-off, #81 a free agent');
 const race=ST.leagueRace(c,running,{sims:500});
 assert.equal(race.rows[0].now,20);assert.ok(race.rows.slice(1).every(r=>r.now===0));
 // Once final, the league table gives the game to the seller too (season.js inStint): the race already agrees.
 const final={...c,live:{...live,players:{...live.players,1001:{club:'C',games:[{date:'2026-10-24',tip:game.date,played:true,points:30}]},1081:{club:'C',games:[{date:'2026-10-24',tip:game.date,played:true,points:55}]}}}};
 assert.equal(teamPoints(final,sale,picks)[0],30);
 // Team 0's rest of the season: #81's games after this one, nothing of the running one, plus #1's rest of this game.
 const w=ST.periodWindows(c).season,star=players[80],one=players[0];
 const gone=new Map([[81,{...running.get(81),final:true}]]),buyer=expectedPoints(star,{...c,running:gone},c.today,w.to);
 assert.deepEqual(ST.windowAhead(c,0,star,w,running,undefined,credit),{points:buyer.points,games:buyer.games});
 assert.ok(ST.windowAhead(c,0,star,w,running).points<expectedPoints(star,{...c,running},c.today,w.to).points+40-1);
 const sold=ST.soldRunning(c,0,running,credit,w.to),left=expectedPoints(one,{...c,running},c.today,w.to).points-expectedPoints(one,{...c,running:new Map([[1,{...running.get(1),final:true}]])},c.today,w.to).points;
 assert.equal(sold.now,20);assert.ok(left>0&&Math.abs(sold.rest-left)<1e-9);
 const others=c.rosters[0].filter(id=>id!==81).reduce((s,id)=>s+expectedPoints(players[id-1],{...c,running},c.today,w.to).points,0);
 assert.ok(Math.abs(race.rows[0].rest-(others+buyer.points+left))<1e-6);
});
test('a move before the tip-off gives the running game to the buyer; an entry without its day goes to the holders',()=>{
 const early=[{...sale[0],seenAt:'2026-10-24T09:00:00Z'}],c=league(early);
 assert.deepEqual([...ST.runningCredit(c,running).keys()],['0:81']);
 assert.equal(ST.leagueRace(c,running,{sims:200}).rows[0].now,40);
 const bare=new Map([[81,{points:40}],[1,{points:20}]]);
 assert.deepEqual([...ST.runningCredit(league(sale),bare).keys()],['0:81']);
 // A shared player still scores only for the team that had him first (R22): team 1 buys #81 on 23.10 after team 0.
 const shared=league([{team:0,outId:1,inId:81,date:'2026-10-22'},{team:1,outId:2,inId:81,date:'2026-10-23'}]);
 assert.deepEqual([...ST.runningCredit(shared,running).keys()],['0:81']);
});
test('the Teams tab and the race read the same credit: rows, KPIs and sold players',()=>{
 const ui=source('src/season-ui.js');
 assert.match(ui,/credit=runningCredit\(ctx,running\)/);assert.match(ui,/now=credit\.has\(`\$\{team\}:\$\{p\.id\}`\)\?running\.get\(p\.id\):null/);
 assert.match(ui,/sold=soldRunning\(ctx,team,running,credit,w\.to\)/);assert.match(ui,/const forecast=fact\+sold\.now\+sold\.rest\+/);
 // The race is cached by the running entries: the rest of a game moves with ESPN's clock and his minutes.
 assert.match(ui,/`\$\{id\}:\$\{x\.points\}:\$\{x\.day\}:\$\{x\.minutes\}:\$\{x\.game\?\.detail\}`/);
});

// ---------- Y10 (app side): only FBL points are counted and shown ----------
test('a played row counts only with FBL points: ESPN\'s box score (the collector\'s or the overlay\'s), never Sports.ru\'s number',()=>{
 const row=(o)=>({date:'2026-10-21',played:true,points:20,...o});
 assert.equal(ST.fblGame(row({pointsSource:'ESPN'})),true);assert.equal(ST.fblGame(row({pointsSource:'BOX'})),false,'the Sports.ru table is a check only');assert.equal(ST.fblGame(row({})),true,'older rows without a source count as before');
 assert.equal(ST.fblGame(row({pointsSource:'NO_BOX',points:null})),false);assert.equal(ST.fblGame(row({pointsSource:'SPORTS_WITH_BONUS',points:31})),false);
 assert.equal(ST.fblGame(row({pointsSource:'NO_BOX',points:null,source:'ESPN'})),false,'no points, no game');
 assert.equal(ST.fblGame(row({pointsSource:'NO_BOX',points:24,source:'ESPN'})),true,'the ESPN box score scores it');
 assert.equal(ST.fblGame(row({played:false,running:true})),false);assert.equal(ST.fblGame(null),false);
 const ui=source('src/season-ui.js');
 assert.match(ui,/const scored=played\.filter\(fblGame\),total=scored\.reduce/);assert.match(ui,/fblGame\(g\)\?int\(g\.points\)/);
 assert.match(ui,/\.games\|\|\[\]\)\.filter\(fblGame\);if\(g\.length\)rows\.push/);assert.match(ui,/last=\(live1\?\.games\|\|\[\]\)\.filter\(fblGame\)/);
 assert.match(ui,/filter\(g=>g\.played&&!fblGame\(g\)\)/);assert.match(ui,/Протокола ESPN пока нет/);
 assert.doesNotMatch(ui,/\.filter\(x=>x\.played\)\.slice\(-3\)/);
});

// ---------- Y02, Y09, Y10, Y16, Y21: every statement says how the league counts ----------
test('the season tab says the league counts on Yahoo from each game\'s own statistics, and what «В игре» is',()=>{
 const m=FT.seasonMethod(),all=plain([...m.overview,...m.teams].join('\n'));
 for(const term of ['+1 за сыгранный матч','FGM−FGA','FTM−FTA','PTS','REB','AST','ST','BLK','TO −2','PF −1'])assert.ok(m.overview[0].includes(term),term);
 assert.match(m.overview[0],/по протоколу ESPN/);assert.match(m.overview[0],/таблица матча Sports\.ru — только сверка/);
 assert.match(m.overview[0],/ФО Sports\.ru по его собственной формуле \(бонус за результат команды, \+2 за 10\+ минут\) в очки FBL не входят/);
 assert.match(m.overview[1],/^«В игре» — матчи, которые идут сейчас/);
 assert.doesNotMatch(all,/вычитаются|ещё не засчитал|не засчитанными/);assert.match(m.teams[0],/очки идущих сейчас матчей/);
 const ui=source('src/season-ui.js');
 assert.doesNotMatch(ui,/Sports\.ru этот матч ещё не посчитал|пока Sports\.ru их не посчитал/);
 assert.match(ui,/из протокола ESPN каждого матча \(сразу после финальной сирены\)/);
});
test('the card history names the league-formula column and what Sports.ru\'s own numbers include',()=>{
 const main=source('src/main.js');
 assert.match(main,/\.\.\.\(clean\?\['По формуле FBL'\]:\[\]\)/);assert.doesNotMatch(main,/'Без бонуса'/);
 assert.match(main,/«За матч» и «Всего» — ФО Sports\.ru по его формуле: с бонусом за результат команды и \+2 за 10\+ минут\. «По формуле FBL» — тот же сезон так, как считает лига на Yahoo/);
 // ESPN's component projection leaves out fouls and the point for the game played, not "bonuses".
 assert.doesNotMatch(main,/без фолов и бонусов/);assert.equal((main.match(/без фолов и \+1 за матч/g)||[]).length,2);
 assert.match(plain(FT.sportsSeasonsLine([['2025-26',{perGame:19,games:65}]])),/^ФО Sports\.ru по его формуле \(с бонусом за результат и \+2 за 10\+ минут\)/);
});

// ---------- C08: the plan note says what ФО* is ----------
test('the plan\'s ФО* is the slot value: above the card\'s season with replacement credit, a little below without',()=>{
 const f={metric:'FBL_FULL_FORMULA_ESTIMATE',meanSeason:1600,seasonFloor:1200};
 const slot={forecast:{...f,slotSeason:1700,transfer:{value:100}}},own={forecast:{...f}};
 assert.ok(riskAdjustedValue(slot)*82>f.meanSeason);assert.ok(riskAdjustedValue(own)*82<f.meanSeason);
 const main=source('src/main.js');
 assert.doesNotMatch(main,/поэтому немного ниже, чем в карточке/);
 assert.match(main,/\*ФО в списке — ценность слота: свои очки игрока плюс очки замены в его длинных пропусках/);
 assert.match(main,/обычно выше, чем «за сезон» в карточке, у остальных — немного ниже/);assert.match(main,/точная оптимизация суммы ценностей слотов/);
});

// ---------- C01 (browser): an ESPN report that lists nobody is a failed fetch ----------
test('the app\'s own ESPN injury fetch with no injury rows falls back to the collector\'s kept report',()=>{
 const ui=source('src/season-ui.js'),def=ui.match(/const hasInjuryRows=(feed=>[^;]+);/);assert.ok(def);
 const hasInjuryRows=new Function(`return ${def[1]}`)();
 assert.equal(hasInjuryRows({injuries:[]}),false);assert.equal(hasInjuryRows({injuries:[{displayName:'X',injuries:[]}]}),false);
 assert.equal(hasInjuryRows(null),false);assert.equal(hasInjuryRows({injuries:[{injuries:[{status:'Out'}]}]}),true);
 assert.match(ui,/if\(hasInjuryRows\(inj\)\)\{injuries=parseInjuries\(inj\);src\.injuries='ok'/);assert.doesNotMatch(ui,/if\(inj\)\{injuries=/);
});

// ---------- C02 (app): a rookie doubt is a check in the Rules table, not a breach ----------
test('the Rules table marks a rookie rule the database cannot settle as a check',()=>{
 // Team 0's only rookie (#73) is swapped for a market-only player whose rookie status the database does not know.
 const market={...players[81],id:'sports:1',isRookie:false,rookieStatus:'NOT_SHOWN_BY_SPORTS_RU'};
 const byId=new Map([...players,market].map(p=>[p.id,p])),rosters=seasonRosters([],picks);rosters[0]=rosters[0].map(id=>id===73?'sports:1':id);
 const [c]=checkRules({rosters,byId,today:'2026-10-24',clubOf:()=>null}),rk=c.violations.find(x=>x.rule==='rookie');
 assert.equal(rk.certain,false);assert.equal(verdict(c).kind,'check');
 const ui=source('src/season-ui.js');
 assert.match(ui,/const rk=c\.violations\.find\(x=>x\.rule==='rookie'\),unsure=rk\?\.certain===false;/);
 assert.match(ui,/!rk\?'✅ '\+c\.rookies\.map\(p=>p\.name\)\.join\(', '\):unsure\?'⏳ не отмечен':'❌ нет',!rk\?'':unsure\?'wait':'bad'/);
 assert.doesNotMatch(ui,/has\('rookie'\)\?'❌ нет'/);
});

// ---------- R20 (wiring) and R06 (app display) ----------
test('transfer gains get the clock; «нужен ещё N командам» counts only rivals with transfers left',()=>{
 const ui=source('src/season-ui.js');
 assert.match(ui,/const forGains=ctx=>ctx\.now\?ctx:\{\.\.\.ctx,now:Date\.now\(\)\};/);
 assert.match(ui,/function transfersView\(base\)\{\n const ctx=forGains\(base\)/);assert.match(ui,/function replacementPanel\(p,base\)\{\n const ctx=forGains\(base\);/);
 assert.match(ui,/marketAlerts\(forGains\(ctx\),\{team:0/);
 assert.match(FT.seasonMethod().transfers.join(' '),/Матч, который уже начался, в выигрыш не входит/);
 // The league race and the team forecasts keep counting a tipped game of a holder who has not checked in yet.
 assert.match(ui,/function context\(\)\{const m=merged\(\),list=m\.transfers;return \{players,live,injuries,today:moscowToday\(\),rosters/);assert.doesNotMatch(ui.match(/function context\(\)[^\n]*\n[^\n]*/)[0],/now:/);
 // The decision (src/transfer-plan.js) counts the rivals with the banks and the transfers left of each team.
 assert.match(ui,/transferPlan\(ctx,\{team,bankMoney:money,left,bankOf:t=>teamBank\(t,ctx\.transfers\),leftOf:t=>transfersLeft\(ctx,t\)\}\)/);
 // Season-ending players come last in the injuries list: their ESPN date is a placeholder.
 assert.match(ui,/const back=r=>seasonEnding\(r\.i\)\?'99':String\(r\.i\.returnDate\|\|'9'\);/);
});
