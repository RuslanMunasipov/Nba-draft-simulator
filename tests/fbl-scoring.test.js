import test from 'node:test';import assert from 'node:assert/strict';import {fblPoints,projectedFblPoints} from '../src/fbl-scoring.js';
const s={pts:25,reb:10,ast:8,stl:2,blk:1,fga:20,fgm:10,fta:6,ftm:5,tov:3,pf:2,minutes:32};
test('FBL formula applies misses, turnovers, fouls and one point per game played',()=>assert.equal(fblPoints(s),28));
test('FBL does not add three pointers separately',()=>assert.equal(fblPoints({...s,threePM:5}),28));
test('FBL gives the same one point for a game of any length (Yahoo GP)',()=>assert.equal(fblPoints({...s,minutes:9}),fblPoints(s)));
test('FBL has no team result bonus (the league scores on Yahoo)',()=>assert.equal(fblPoints(s,3),fblPoints(s)));
test('FBL rejects made field goals above attempts',()=>assert.throws(()=>fblPoints({...s,fgm:21}),/Попаданий/));
test('projection uses identical arithmetic',()=>assert.equal(projectedFblPoints(s),fblPoints(s)));

// ---------- One official formula: every FBL number goes through it (league owner, 22.10.2026) ----------
test('the official formula: fblPoints, the ESPN box score, the awards bot and the golden lines agree',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fblFormula}=await import('../src/fbl-scoring.js');
 const {boxScorePoints}=await import('../src/season.js');
 const {parseSummary}=await import('../awards-bot/core.js');
 const golden=JSON.parse(readFileSync(new URL('./fixtures/fbl-formula-golden.json',import.meta.url),'utf8'));
 const espn=l=>({MIN:String(l.minutes),PTS:String(l.pts),REB:String(l.reb),AST:String(l.ast),STL:String(l.stl),BLK:String(l.blk),FG:`${l.fgm}-${l.fga}`,FT:`${l.ftm}-${l.fta}`,TO:String(l.tov),PF:String(l.pf)});
 for(const l of golden.lines){
  assert.equal(fblFormula(l),l.expected,l.name);assert.equal(fblPoints(l),l.expected,l.name);
  assert.equal(boxScorePoints(espn(l)),l.expected,l.name+' (ESPN box score)');
  const x=espn(l),summary={boxscore:{players:[{team:{abbreviation:'AAA'},statistics:[{labels:Object.keys(x),athletes:[{athlete:{id:'1'},stats:Object.values(x)}]}]}]}};
  assert.equal(parseSummary(summary,{id:'g',tip:'2026-10-22T00:00Z'},'2026-10-21')[0].p,l.expected,l.name+' (awards bot)');
 }
});
