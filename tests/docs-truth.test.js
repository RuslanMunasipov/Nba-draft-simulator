import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {playerInsights} from '../src/insights.js';
const trend=p=>{const {pros,cons}=playerInsights(p,[p]);return [...pros,...cons].filter(x=>/^(Рост|Спад|Стабильный уровень) на Sports\.ru/.test(x));};
const season=(perGame,fblPerGame)=>({games:70,points:perGame*70,perGame,...(fblPerGame===undefined?{}:{fblPerGame})});

test('the Sports.ru trend compares averages without the team result bonus when both seasons have them',()=>{
 // Sports.ru 20.0 → 18.0 (−10%) only because the club stopped winning: without the bonus both seasons are 19.0.
 const p={id:1,sportsHistory:{'2024-25':season(20,19),'2025-26':season(18,19)}};
 assert.deepEqual(trend(p),['Стабильный уровень на Sports.ru: 19.0 → 19.0 ФО/матч по формуле FBL.']);
 const up={id:2,age:22,sportsHistory:{'2023-24':season(15,14),'2024-25':season(16,15),'2025-26':season(15,16.5)}};
 const {pros}=playerInsights(up,[up]);
 assert.equal(pros[0],'Рост на Sports.ru: 14.0 → 15.0 → 16.5 ФО/матч по формуле FBL (2025-26 к 2024-25: +10%).');
 assert.ok(pros.some(x=>x.startsWith('Возраст 22')),'a growth trend still unlocks the young-player pro');
});

test('without the bonus for a season the trend keeps Sports.ru numbers and says they include it',()=>{
 const p={id:1,sportsHistory:{'2024-25':season(20),'2025-26':season(18,19)}};
 assert.deepEqual(trend(p),['Спад на Sports.ru: 20.0 → 18.0 ФО/матч (с бонусом за результат) (2025-26 к 2024-25: -10%).']);
 // A three-season path on the FBL basis drops a season that has no bonus-free average instead of mixing the two.
 const q={id:2,sportsHistory:{'2023-24':season(30),'2024-25':season(20,19),'2025-26':season(18,19)}};
 assert.deepEqual(trend(q),['Стабильный уровень на Sports.ru: 19.0 → 19.0 ФО/матч по формуле FBL.']);
 assert.deepEqual(trend({id:3,sportsHistory:{'2024-25':season(0,0),'2025-26':season(5,5)}}),[],'no percentage from a zero base');
});

test('league owner decisions of 21.10.2026 are recorded in the league rules',()=>{
 const rules=JSON.parse(readFileSync(new URL('../data/league-rules.json',import.meta.url),'utf8'));
 assert.equal(rules.scoringFormula.participation,'PER_GAME_PLAYED');assert.equal(rules.scoringFormula.resultBonus,false);
 assert.equal(rules.sharedPlayers.scoring,'FIRST_HOLDER_ONLY');assert.equal(rules.sharedPlayers.verdict,'violation');
 assert.deepEqual(rules.forecastBasis.espnCovered,{perGame:'MEAN_OF_ESPN_AND_MODEL',games:'MEAN_OF_ESPN_AND_MODEL'});
 assert.equal(rules.objective.advice,'EXPECTED_POINTS');assert.deepEqual(rules.objective.placeProbabilities,['FIRST','TOP_3']);
 for(const k of ['scoringFormula','sharedPlayers','forecastBasis','objective'])assert.match(JSON.stringify(rules[k]),/league owner, 2026-10-21/);
});
