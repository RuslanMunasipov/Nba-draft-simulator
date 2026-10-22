import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newDraft,pick} from '../src/engine.js';
import {installDatabase,compactDraft,seasonCatalog} from '../src/database.js';
import {restoreBudgetDraft} from '../src/budget.js';
import {combineNote,forecastSources,seasonRangeLine,rangeMethod,healthLine,absenceShort,absenceRates,sportsSeasonsLine,sportsCheckLine,seasonMethod} from '../src/forecast-text.js';
import {playerInsights} from '../src/insights.js';
import {CALIBRATION} from '../src/season.js';
import {injuryFeed,injuryWarning,isOut,returnHead,returnKey,warnedFor,stillInjured} from '../scripts/telegram-format.mjs';
// The season tab is src/season-ui.js and its view modules in src/season-ui/: read as one text.
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),source=f=>f==='src/season-ui.js'?[f,...fs.readdirSync(new URL('../src/season-ui/',import.meta.url)).sort().map(x=>'src/season-ui/'+x)].map(read).join('\n'):read(f),plain=s=>s.replace(/ /g,' ');

// ---------- The season tab scores with the installed catalog ----------
const players=Array.from({length:120},(_,i)=>({id:i+1,name:'SYNTHETIC '+i,positions:['PG','SG','SF','PF','C'],projectedFP:120-i,isRookie:i<20,forecast:{meanPerGame:30-i/10,games:70}}));
test('drafted players get the latest forecasts in the season tab; the draft tab keeps its pick snapshots',()=>{
 const old={generatedAt:'2026-10-18T10:00:00Z',players};
 let state=installDatabase(newDraft(),old);for(const id of [1,2,3])state=pick(state,id);
 // The device saves the draft compactly and restores it on the next visit, when a new database has been published.
 const fresh={generatedAt:'2026-10-21T06:00:00Z',players:players.filter(p=>p.id!==3).map(p=>({...p,forecast:{...p.forecast,meanPerGame:p.forecast.meanPerGame-1,games:40}}))};
 state=installDatabase(restoreBudgetDraft(JSON.stringify(compactDraft(state))),fresh);
 const draft=id=>state.players.find(p=>p.id===id),season=seasonCatalog(state,fresh),inSeason=id=>season.find(p=>p.id===id);
 assert.equal(draft(1).forecast.meanPerGame,30);assert.equal(draft(1).forecast.games,70);
 assert.equal(inSeason(1).forecast.meanPerGame,29);assert.equal(inSeason(1).forecast.games,40);
 // Every drafted player the new database still lists differs from it in 0 places; one it dropped stays as picked.
 assert.equal(season.filter(p=>p.id<=2&&p.forecast.meanPerGame!==fresh.players.find(x=>x.id===p.id).forecast.meanPerGame).length,0);
 assert.equal(inSeason(3).forecast.meanPerGame,29.8);assert.equal(season.length,120);
 // The same inputs give the same array: no season re-render on every draft render.
 assert.equal(seasonCatalog(state,fresh),season);
 assert.equal(seasonCatalog({...state,databaseVersion:'manual'},fresh),state.players);
 assert.equal(seasonCatalog(state,null),state.players);
 const nothingDropped={...fresh,players:[...fresh.players,players[2]]};assert.equal(seasonCatalog(state,nothingDropped),nothingDropped.players);
});

// ---------- Forecast texts follow the data ----------
const base={version:4,meanPerGame:24.25,games:48,sources:{model:{perGame:21,games:35},espn:{perGame:27.5,games:61}},shortSeasonRisk:.04,seasonFloor:610,seasonCeiling:2039};
test('the forecast basis says what the numbers are: the mean of model and ESPN, or ESPN games in older data',()=>{
 assert.equal(combineNote({...base,gamesBasis:'MEAN_ESPN_MODEL'}),'ФО за матч и число матчей — средние модели и ESPN');
 assert.equal(combineNote(base),'ФО за матч и число матчей — средние модели и ESPN');
 assert.equal(combineNote({...base,games:61}),'ФО за матч — среднее модели и ESPN, число матчей — ESPN');
 assert.equal(combineNote({...base,sources:{model:base.sources.model}}),'');
 const text=plain(forecastSources({...base,gamesBasis:'MEAN_ESPN_MODEL'}));
 assert.match(text,/ESPN: 27,5 × 61 → итог 24,3 × 48 матчей \(ФО за матч и число матчей — средние модели и ESPN\)/);
 assert.doesNotMatch(forecastSources({...base,games:61}),/итог их среднее/);
});
const audit={testTarget:2026,holdout:{coverage80:.7458677685950413,gamesCoverage80:.7975,deployedGamesCoverage80:.7872}};
test('the season range quotes its measured held-out coverage, not "8 seasons out of 10"',()=>{
 const line=seasonRangeLine(base,audit);
 assert.match(line,/Слабый сезон 610, сильный 2 039/);assert.match(line,/2025\/26/);assert.match(line,/75 % игроков/);
 assert.doesNotMatch(line,/8 сезонах из 10/);
 assert.equal(seasonRangeLine(base,null),'Слабый сезон 610, сильный 2 039 — 10-й и 90-й процентили прогноза.');
 assert.match(rangeMethod(base,audit),/75 % игроков при цели 80 %.*только модельной части/);
 assert.doesNotMatch(rangeMethod({...base,sources:{}},audit),/модельной части/);
 assert.doesNotMatch(rangeMethod(base,null),/проверенные на прошлых сезонах/);
});
const scaled={shortSpellsPer82:174,longSpellsPer82:39.9,leagueShortSpellsPer82:6.85,leagueLongSpellsPer82:1.74,gamesRange:[0,11],gamesMedian:2,lastSeasonEnd:'healthy'};
test('health: own logged absence rates are "по логам"; scaled hazards are only the pace behind the games forecast',()=>{
 const own={...scaled,ownShortPer82:7.94,ownLongPer82:1.6};
 assert.match(plain(healthLine(own,{games:4},audit)),/^Пропуски по логам 5 последних сезонов \(каждый более ранний — с весом 0,6 от следующего\): коротких \(1–3 матча\) 7,9 за 82 матча при 6,9 у ровесников, длинных \(4\+\) 1,6 при 1,7/);
 const line=plain(healthLine(scaled,{games:4},audit));
 assert.doesNotMatch(line,/по логам|ровесник/);assert.match(line,/^Темп пропусков под прогноз 4 матча: коротких \(1–3 матча\) больше 82 и длинных \(4\+\) 39,9 за 82 матча/);
 assert.match(line,/По модели с вероятностью 80 % сыграет 0–11 матчей, медиана 2 \(на сезоне 2025\/26 в такой диапазон попали 79 % игроков\)/);
 // An ESPN-covered forecast: the games check covers the model only, so no coverage is quoted.
 assert.doesNotMatch(healthLine(scaled,{games:4,sources:{espn:{}}},audit),/попали/);
 assert.match(absenceRates({...scaled,ownShortPer82:null},61).text,/своих матчей в логах мало/);
 assert.equal(plain(absenceShort(scaled,61)),'Темп пропусков под прогноз 61 матч: больше 82 коротких и 39,9 длинных за 82 матча.');
 assert.match(plain(absenceShort({...scaled,ownShortPer82:7,ownLongPer82:2},61)),/^Пропуски по логам 5 последних сезонов \(каждый более ранний — с весом 0,6 от следующего\): 7,0 коротких и 2,0 длинных за 82 матча \(у ровесников 6,9 и 1,7\)/);
});
test('Sports.ru seasons next to FBL forecasts: by the league formula when known, labelled as Sports.ru\'s own otherwise',()=>{
 const hist=[['2024-25',{perGame:18.2,games:70,fblPerGame:17.4}],['2025-26',{perGame:19,games:65,fblPerGame:19.6}]];
 assert.equal(sportsSeasonsLine(hist),'По формуле FBL (Yahoo: +1 за матч, без бонусов Sports.ru): 24/25 — 17,4 × 70 · 25/26 — 19,6 × 65');
 assert.equal(sportsSeasonsLine([['2025-26',{perGame:19,games:65}]]),'ФО Sports.ru по его формуле (с бонусом за результат и +2 за 10+ минут): 25/26 — 19,0 × 65');
 assert.equal(sportsSeasonsLine([]),'');
 const fbl=sportsCheckLine({season:'2025-26',perGame:9.08,sportsPerGame:6.62,basis:'FBL_NO_RESULT_BONUS',gap:.07,flag:false});
 assert.match(fbl,/^\+7 % к сезону 25\/26 по формуле FBL \(9,1 за матч; ФО Sports\.ru с его бонусами — 6,6\)\.$/);
 const old=sportsCheckLine({season:'2025-26',perGame:6.62,gap:.37,flag:true});
 assert.match(old,/^⚠ \+37 % к сезону 25\/26 по ФО Sports\.ru \(6,6 за матч, с его бонусом за результат и \+2 за 10\+ минут, которых в FBL нет\)\. Проверь роль/);
 const cons=b=>playerInsights({name:'X',positions:['C'],sportsCheck:{gap:.37,flag:true,...b}},[]).cons.join(' ');
 assert.match(cons({}),/по ФО Sports\.ru \(с его бонусом за результат и \+2 за 10\+ минут, которых в FBL нет\) на \+37%/);
 assert.match(cons({basis:'FBL_NO_RESULT_BONUS'}),/\(по формуле FBL\) на \+37%/);
});
test('the season tab\'s method notes come from the calibration and the league limits',()=>{
 const m=seasonMethod(),all=plain([...m.overview,...m.transfers,...m.teams].join('\n'));
 assert.match(all,new RegExp(`с весом прогноза ${CALIBRATION.points.established.rateGames} матчей \\(у новичков ${CALIBRATION.points.newcomer.rateGames}\\)`));
 assert.doesNotMatch(all,/официальн|10 матчей\)|вес прогноза — 10/);
 assert.match(all,/не больше 2 игроков одного клуба NBA/);assert.match(all,/«белому правилу»/);assert.match(all,/цепи коротких и длинных пропусков/);
 assert.match(all,/«4 недели» — 28 дней начиная с сегодня/);assert.match(all,/Официальная таблица лиги — на Yahoo/);assert.match(all,/Шансы на 1-е место и топ-3/);
 const other=seasonMethod({...CALIBRATION,points:{established:{rateGames:7,minuteGames:3},newcomer:{rateGames:9,minuteGames:1}},availability:{priorGames:11}});
 assert.match(plain(other.transfers.join(' ')),/с весом прогноза 7 матчей \(у новичков 9\).*вес прогноза 3, у новичков 1.*с весом 11 матчей/);
});
test('no stale claims are left in the screens',()=>{
 for(const f of ['src/season-ui.js','src/main.js','src/forecast-text.js'])
  for(const stale of [/официальн/,/вес прогноза — 10/,/итог их среднее/,/в 8 сезонах из 10/,/Здоровье по логам/,/История пропусков:/,/проверенные на прошлых сезонах/,/доверительный интервал/,/без бонуса за результат\.'/])
   assert.doesNotMatch(source(f),stale,`${f}: ${stale}`);
 assert.doesNotMatch(source('src/insights.js'),/по истории травм/);
 // The season tab is fed from the catalog, not from the draft state.
 assert.match(source('src/main.js'),/setSeasonPlayers\(seasonCatalog\(state,database\),card\)/);
});

// ---------- Telegram: return and injury alerts ----------
const now=Date.parse('2026-10-21T10:00:00Z'),feed=at=>({fetchedAt:at,injuries:[{injuries:[]}]});
test('an ESPN report is trusted only when fresh and fetched this time; otherwise the advice says so',()=>{
 assert.equal(injuryFeed({espnInjuries:feed('2026-10-21T08:30:00Z')},now).fresh,true);
 assert.equal(injuryFeed({espnInjuries:feed('2026-10-21T02:00:00Z')},now).fresh,false);
 const kept=injuryFeed({espnInjuries:feed('2026-10-21T09:00:00Z'),espnInjuriesOk:false},now);
 assert.equal(kept.fresh,false);assert.ok(kept.feed);assert.match(injuryWarning(kept),/не обновился с 21\.10\.2026, 12:00 МСК: травмы — по последнему полученному, о возвращениях не сообщаю/);
 const none=injuryFeed({},now);assert.equal(none.fresh,false);assert.equal(none.feed,null);assert.match(injuryWarning(none),/недоступен: советы без учёта травм/);
 assert.equal(injuryWarning({fresh:true}),null);
});
test('only an out player can "return"; day-to-day and game-time decisions never trigger it',()=>{
 assert.equal(isOut({status:'Out'}),true);assert.equal(isOut({status:'Suspension'}),true);
 assert.equal(isOut({status:'Day-To-Day'}),false);assert.equal(isOut({status:'Out',fantasyStatus:'GTD'}),false);assert.equal(isOut(null),false);
});
test('return alerts follow the advice bars: sure buys, moderate is offered as not sure, doubtful sends nothing',()=>{
 const bars={sure:.7,maybe:.6};
 assert.equal(returnHead(.56,bars),null);assert.match(returnHead(.65,bars),/можно брать, но не уверенно/);
 assert.equal(returnHead(.75,bars),'🎯 <b>Тебе: можно брать</b>');assert.equal(returnHead(.7,{...bars,now:true}),'🎯 <b>Тебе: забирай</b>');
 assert.match(returnHead(.699,{...bars,now:true}),/не уверенно/);
});
test('one return warning per injury: a new status or date is not news, a new injury after recovery is',()=>{
 const legacy=['202699:Day-To-Day:2026-10-20','202699:Out:2026-10-23','1629651:Day-To-Day:2026-10-21'];
 assert.equal(warnedFor(legacy,202699),true);assert.equal(warnedFor(legacy,1629651),true);assert.equal(warnedFor(legacy,20269),false);
 assert.equal(warnedFor([returnKey('espn:55')],'espn:5'),false);assert.equal(warnedFor([returnKey('espn:55')],'espn:55'),true);
 // Off the report: forgotten, so the next injury warns again.
 assert.deepEqual(stillInjured([...legacy,'777'],[202699,777]),['202699:Day-To-Day:2026-10-20','202699:Out:2026-10-23','777']);
 assert.deepEqual(stillInjured(legacy,[]),[]);
});
test('the notifier holds return alerts during an ESPN outage and keys them by player',()=>{
 const s=source('scripts/notify-transfers.mjs');
 assert.match(s,/const back=!left\|\|!feedOk\?\[\]/);assert.match(s,/const soon=feedOk\?targets\.filter\(x=>x\.soon&&isOut\(x\.injury\)&&!warnedFor\(previous\.returns,x\.player\.id\)\):\[\]/);
 assert.match(s,/state\.watch=feedOk\?/);assert.match(s,/state\.returns\.push\(returnKey\(x\.player\.id\)\)/);
 assert.doesNotMatch(s,/parseInjuries\(live\.espnInjuries\)/);
});
