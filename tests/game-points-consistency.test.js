// One number per game everywhere (league owner, 22.10.2026): the official formula on ESPN's box score gives the same FBL
// points in the site's live overlay (season.js liveGamePoints), the awards bot (awards-bot/core.js parseSummary) and the
// collector (scripts/collect_sports_current.py espn_lines + fbl_points; tests/test_sports_current.py checks it on the same
// files). The golden points are the awards bot's own archive of that game.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {liveGamePoints,fblPoints} from '../src/season.js';
import {parseSummary} from '../awards-bot/core.js';
import {gamePointsMismatches} from '../scripts/check-game-points.mjs';
const read=f=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8'));
const summary=read('espn-summary-401909088.json'),golden=read('espn-points-golden.json');

test('the site\'s overlay and the awards bot score an ESPN box score exactly as the awards archive did',()=>{
 const site=liveGamePoints(summary,{status:{type:{completed:true}}}),bot=parseSummary(summary,{id:golden.event,tip:'2026-10-20T19:00Z'},'2026-10-20');
 assert.deepEqual(Object.fromEntries(Object.entries(site).map(([a,x])=>[a,x.points])),golden.points);
 assert.deepEqual(Object.fromEntries(bot.map(l=>[l.a,l.p])),golden.points);
});

test('the collector\'s rows and the awards archive agree game by game, and a mismatch is reported',()=>{
 const snapshot={players:{s1:{espnId:'4251',games:[{date:'2026-10-21',played:true,points:31,pointsSource:'ESPN',espnEvent:'1'},{date:'2026-10-23',played:true,points:null,pointsSource:'AWAITING_ESPN'}]},
  s2:{espnId:'77',games:[{date:'2026-10-21',played:true,points:12,pointsSource:'ESPN',espnEvent:'1'}]}}};
 const archive={lines:[{e:'1',a:'4251',p:31,d:'2026-10-20'},{e:'1',a:'77',p:11,d:'2026-10-20'}]};
 const out=gamePointsMismatches(snapshot,archive);
 assert.equal(out.compared,2);assert.deepEqual(out.mismatches.map(m=>[m.sportsId,m.site,m.archive]),[['s2',12,11]]);
 assert.equal(fblPoints(snapshot.players.s1.games[1]),null,'a game ESPN has not scored yet counts nothing anywhere');
});

// The published data, when this checkout has it (scripts/check-game-points.mjs reads the two branches).
const live='.cache/season-live/sports-current.json',awards='.cache/awards-bot/archive.json';
test('the published snapshot and the awards archive agree on every game both hold',{skip:!(existsSync(live)&&existsSync(awards))},()=>{
 const out=gamePointsMismatches(JSON.parse(readFileSync(live,'utf8')),JSON.parse(readFileSync(awards,'utf8')));
 assert.ok(out.compared>0);assert.deepEqual(out.mismatches,[]);
});
