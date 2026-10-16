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
assert.ok(assets.some(name=>/^rookie-timing-worker-.*\.js$/.test(name)), 'Missing rookie timing worker');
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
const draft=newDraft(database.players,20000,'OFF');
assert.ok(database.coverage.rookies>=8);
for(const id of [1630169,202681]){const p=database.players.find(p=>p.id===id);assert.ok(p?.positions.length&&Number.isFinite(p.projectedFP));}
const full=simulateDraft(draft,{seed:19});assert.equal(full.picks.length,80);
for(let i=0;i<8;i++){const r=teamRoster(full,i);assert.ok(rosterFits(r));assert.ok(r.some(p=>p.isRookie));}
const batch=batchSimulations(draft,{runs:100,seed:11});assert.equal(batch.eligibleRuns,100);
const first=full.picks[0].playerId;assert.equal(advanceBots(pick(draft,first)).picks.length,8);
console.log('Real automatic database verified:',database.coverage,'80 picks and 100 valid seeded scenarios');
const {analyzeRecommendations}=await import('../src/analysis.js');
const {severeRisk}=await import('../src/valuation.js');
const later={...draft,picks:full.picks.slice(0,8)};
const safer=analyzeRecommendations(later);assert.equal(safer.length,5);assert.ok(safer.every(r=>!severeRisk(r.player)));
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
assert.equal(timing.totalDrafts,960);assert.ok(timing.rows.every(r=>r.profiles.every(p=>p.validRuns===p.runs)));
console.log('Rookie timing study verified:',JSON.stringify({round:timing.recommendedRound,pick:timing.recommendedPick,profiles:timing.bestByProfile,range:timing.profileRange,meanGap:timing.meanGap,drafts:timing.totalDrafts}));
