import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /<script[^>]+src="\/Nba-draft-simulator\/assets\//);
assert.match(html, /FBL Draft Intelligence/);
const entries = [...html.matchAll(/(?:src|href)="(\/Nba-draft-simulator\/assets\/[^"]+)"/g)].map(m=>m[1]);
assert.ok(entries.length > 0, 'No bundled assets found');
for(const entry of entries) {
  const path='dist/'+entry.replace('/Nba-draft-simulator/','');
  assert.ok((await stat(path)).size>0, 'Missing asset: '+path);
}
console.log('Vite build artifact verified:',entries.length,'assets');
const {readdir}=await import('node:fs/promises');
const assets=await readdir('dist/assets');
assert.ok(assets.some(name=>/^plan-worker-.*\.js$/.test(name)), 'Missing draft plan worker');
assert.ok(assets.some(name=>/^batch-worker-.*\.js$/.test(name)), 'Missing simulation worker');
for(const name of assets)assert.ok((await stat('dist/assets/'+name)).size>0);
console.log('Worker and all emitted assets verified:',assets.length);
const history=JSON.parse(await readFile('dist/data/nba-history.json','utf8'));
assert.equal(history.seasons.length,3);
assert.ok(history.players.length>500,'Historical data missing');
assert.ok(history.players.every(p=>!('projectedFP' in p)&&!('price' in p)), 'History must not pretend to be forecasts or prices');
console.log('Historical reference verified:',history.players.length,'players; no fabricated forecasts');
const baseline=JSON.parse(await readFile('dist/data/experimental-baseline.json','utf8'));
assert.equal(baseline.evaluation.testSeason,'2025-26');
assert.deepEqual(baseline.evaluation.trainSeasons,['2023-24','2024-25']);
assert.ok(baseline.players.length>100);
assert.ok(baseline.players.every(p=>p.status==='ESTIMATED'&&!('projectedFP' in p)&&!('price' in p)));
console.log('Experimental baseline verified:',baseline.players.length,'estimates, separated from draft projections');
assert.equal(baseline.coverage.includedPlayers,history.players.length,'Every historical player must remain visible');
for(const id of [1630169,202681]){
 const p=baseline.players.find(p=>p.id===id);
 assert.ok(p,'Missing returning player '+id);
 assert.equal(p.coverageStatus,'EARLIER_SEASON');
 assert.equal(p.baseSeason,'2024-25');
 assert.equal(p.expectedObservedGames,null);
 assert.equal(p.estimatedCoreSeasonTotal,null);
 assert.ok(p.returnContext?.source.startsWith('https://www.nba.com/'));
}
console.log('Full historical coverage and returning-player regressions verified:',baseline.players.length);
const database=JSON.parse(await readFile('dist/data/default-draft.json','utf8'));
const {newDraft,pick,rosterFits}=await import('../src/engine.js');
const {simulateDraft,batchSimulations,advanceBots,teamRoster}=await import('../src/simulation.js');
assert.equal(database.priceMode,'ON');assert.equal(database.cap,20000);
assert.ok(database.priceAudit.eligiblePricedPlayers>=400);assert.equal(database.positionAuthority,'Sports.ru');
for(const p of database.players.filter(p=>p.positions.length)){assert.equal(p.positions.length,1);assert.ok(Array.isArray(p.yahooPositions));}
const draft=newDraft(database.players,20000,'ON');
assert.ok(database.coverage.rookies>=8);
for(const id of [1630169,202681]){const p=database.players.find(p=>p.id===id);assert.ok(p?.positions.length&&Number.isFinite(p.projectedFP));}
const full=simulateDraft(draft,{seed:19});assert.equal(full.picks.length,80);
for(let i=0;i<8;i++){const r=teamRoster(full,i);assert.ok(rosterFits(r));assert.ok(r.some(p=>p.isRookie));assert.ok(r.every(p=>p.priceStatus==='VERIFIED'));assert.ok(r.reduce((sum,p)=>sum+p.price,0)<=20000);}
const batch=batchSimulations(draft,{runs:100,seed:11});assert.equal(batch.eligibleRuns,100);
const first=full.picks[0].playerId;assert.equal(advanceBots(pick(draft,first)).picks.length,8);
console.log('Real automatic database verified:',database.coverage,'80 picks and 100 valid seeded scenarios');
const {analyzeRecommendations}=await import('../src/analysis.js');
const {severeRisk}=await import('../src/valuation.js');
const later={...draft,picks:full.picks.slice(0,8)};
const safer=analyzeRecommendations(later);assert.equal(safer.length,5);assert.ok(safer.every(r=>r.speculative===severeRisk(r.player)));
for(const id of [203954,203076]){
 const p=database.players.find(p=>p.id===id);assert.ok(p?.espnContext?.projectedGames>0);assert.ok(p.espnContext.adp>0);
 assert.ok(severeRisk(p),'Repeated absence risk must remain despite optimistic source forecasts');
 console.log('ESPN and historical risk evidence:',p.name,p.historyGames,p.espnContext.projectedGames,p.espnContext.adp);
}
console.log('Five safer alternatives after first seven opponents verified; ESPN coverage:',database.espnCoverage);
const {rookieRecommendations}=await import('../src/rookies.js');
const rookieBoard=rookieRecommendations(draft);assert.equal(rookieBoard.players.length,5);
assert.ok(new Set(rookieBoard.players.map(p=>p.espnContext.individualProjection.componentSeasonTotal)).size>1,'Individual rookie forecasts must not collapse to a group constant');
for(const p of rookieBoard.players){const r=p.espnContext.individualProjection;assert.ok(r.games>0&&r.games<=82);assert.ok(r.perGame.minutes>0&&r.perGame.minutes<=48);}
console.log('Individual rookie board:',rookieBoard.players.map(p=>({name:p.name,partialFP:p.espnContext.individualProjection.componentFPPerGame,partialSeason:p.espnContext.individualProjection.componentSeasonTotal,games:p.espnContext.projectedGames}))); 

const {rookieTimingStudy}=await import('../src/rookie-timing.js');
const timing=rookieTimingStudy(draft);assert.ok(timing.recommendedRound>=1&&timing.recommendedRound<=10);
assert.equal(timing.totalDrafts,960);
const recommendedTiming=timing.rows.find(r=>r.round===timing.recommendedRound);
assert.ok(recommendedTiming?.valid&&recommendedTiming.profiles.every(p=>p.validRuns===p.runs),'Only fully legal strategies may be recommended');
for(const row of timing.rows)if(row.profiles.some(p=>p.validRuns!==p.runs))assert.equal(row.valid,false,'Incomplete strategies must remain explicitly excluded');
console.log('Rookie timing study verified:',JSON.stringify({round:timing.recommendedRound,pick:timing.recommendedPick,profiles:timing.bestByProfile,range:timing.profileRange,meanGap:timing.meanGap,drafts:timing.totalDrafts}));

assert.ok(database.forecastAudit.forecastPlayers>=80,'Full-formula forecast coverage');
assert.ok(database.forecastAudit.rookieForecasts>=8,'Individual full-formula rookie forecasts');
assert.ok(database.forecastAudit.holdout.players>100);
for(const p of database.players.filter(p=>p.forecast)){
 const f=p.forecast;assert.equal(f.metric,'FBL_FULL_FORMULA_ESTIMATE');
 assert.ok(Number.isFinite(f.meanPerGame)&&Number.isFinite(f.meanSeason)&&f.games>=0&&f.games<=82);
 assert.ok(Math.abs(Object.values(f.components).reduce((a,b)=>a+b,0)-f.meanPerGame)<1e-6,'Component identity '+p.name);
 assert.ok(f.gameFloor<=f.gameCeiling&&f.seasonFloor<=f.meanSeason&&f.meanSeason<=f.seasonCeiling);
}
console.log('Legacy v2 forecast stage audit (every shown forecast is replaced by projection_model v4 or complete_forecasts v3):',JSON.stringify(database.forecastAudit));
console.log('Shipped projection model, held out 2025/26:',JSON.stringify(database.projectionModelAudit?.holdout??null));
console.log('Complete rookie projections:',JSON.stringify(rookieRecommendations(draft).players.map(p=>({name:p.name,forecast:p.forecast}))));

const scoringAudit=JSON.parse(await readFile('dist/data/scoring-audit.json','utf8'));
assert.equal(scoringAudit.status,'PASS');assert.equal(scoringAudit.mismatches,0);
assert.equal(scoringAudit.turnoverWeight,-2);assert.ok(scoringAudit.auditedGames>50000);
assert.equal(scoringAudit.auditedForecasts,database.players.filter(p=>p.forecast).length);
for(const p of database.players.filter(p=>p.forecast)){
 const f=p.forecast,b=f.scoringBreakdown;
 assert.ok(b&&Number.isFinite(b.turnovers));
 assert.ok(Math.abs(Object.values(b).reduce((a,b)=>a+b,0)-f.meanPerGame)<1e-6,p.name+' expanded scoring');
 const q=p.espnContext?.individualProjection;
 if(f.origin==='ESPN_INDIVIDUAL')assert.ok(Math.abs(b.turnovers+2*q.perGame.turnovers)<1e-6,p.name+' TOV weight');
 if(f.historicalDownside)assert.ok(f.historicalDownside.negativeGames<=f.historicalDownside.games);
}
const boozer=database.players.find(p=>p.name==='Cameron Boozer');
assert.ok(boozer?.isRookie&&boozer.forecast);
const {pickCompletion}=await import('../src/completion.js');
assert.ok(pickCompletion(draft,boozer.id).possible,'Boozer must be selectable in a fresh draft');
const chosenBoozer=advanceBots(pick(draft,boozer.id),{seed:1});
assert.equal(chosenBoozer.picks.length,8);
assert.ok(chosenBoozer.picks.some(p=>p.team===0&&p.playerId===boozer.id));
console.log('Scoring consistency check (formula restated vs build_forecasts.full) and external check vs Sports.ru season totals:',JSON.stringify({...database.scoringAudit,focus:scoringAudit.players.filter(p=>['Cade Cunningham','Cameron Boozer'].includes(p.name))}));

for(const rookie of rookieRecommendations(draft).players){
 assert.ok(pickCompletion(draft,rookie.id).possible,'Leading rookie selectable: '+rookie.name);
 const opening=advanceBots(pick(draft,rookie.id),{seed:7});
 assert.equal(opening.picks.length,8);
 const completed=simulateDraft(opening,{seed:7});
 assert.equal(completed.picks.length,80);
 for(let team=0;team<8;team++){const roster=teamRoster(completed,team);assert.ok(rosterFits(roster));assert.ok(roster.some(p=>p.isRookie));}
 console.log('Leading rookie opening verified through 80 picks:',rookie.name);
}

assert.equal(database.forecastCoverage.covered,database.players.length,'Every player needs an explicitly sourced full-formula estimate');
for(const p of database.players){
 assert.ok(p.forecast.coverageTier,p.name+' needs an evidence tier');
 assert.ok(p.positions.length===0||p.positionStatus==='SPORTS_RU_VERIFIED','Only Sports.ru positions may enable a default player: '+p.name);
}
console.log('Full forecast coverage:',JSON.stringify(database.forecastCoverage));
console.log('Career model temporal test:',JSON.stringify(database.careerModelAudit));
console.log('Online source coverage:',JSON.stringify({...database.onlineAudit,errors:database.onlineAudit.errors?.length??0}));

assert.ok(database.onlineAudit.careerSeasons>500,'Online career seasons must be fetched');
for(const p of database.players){assert.ok(p.onlineSummary);const evidence=JSON.parse(await readFile('dist/data/players/'+String(p.id).replace(':','-')+'.json','utf8'));assert.equal(evidence.name,p.name);}
assert.ok((await stat('dist/data/default-draft.json')).size<4_000_000,'Mobile data payload budget');
console.log('Mobile evidence split verified for all players');
