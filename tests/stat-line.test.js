import test from 'node:test';import assert from 'node:assert/strict';
import {statLine} from '../src/stat-line.js';
import {boxScorePoints,liveGamePoints} from '../src/season.js';

test('the live stat line splits the FBL points term by term and adds up to the box-score points', () => {
 // Maxey, PHI @ NY, 20.10.2026 (ESPN box score): 27 FBL points.
 const maxey={MIN:'40',PTS:'28',FG:'9-19','3PT':'2-9',FT:'8-9',REB:'4',AST:'5',TO:'2',STL:'3',BLK:'3',PF:'3'};
 const s=statLine(maxey);
 assert.equal(s.total,27);assert.equal(s.total,boxScorePoints(maxey));
 const by=Object.fromEntries(s.rows.map(r=>[r.key,r]));
 assert.equal(by.FG.points,-10);assert.equal(by.FT.points,-1);assert.equal(by.TO.points,-4);assert.equal(by.PF.points,-3);assert.equal(by.MIN.points,2);
 assert.equal(by.FG.value,'9/19');assert.equal(by.FG.note,'трёхочковые 2/9');
 // A rounded "10" is flagged; 9 minutes give the single participation point.
 assert.equal(by.MIN.unsure,false);assert.equal(statLine({...maxey,MIN:'10'}).rows.at(-1).unsure,true);
 const short={...maxey,MIN:'9'};assert.equal(statLine(short).total,boxScorePoints(short));assert.equal(statLine(short).total,26);
 assert.equal(statLine({}),null);assert.equal(statLine(null),null);
 // The box-score record carries the line, the name and the team for the game list.
 const summary={boxscore:{players:[{team:{abbreviation:'PHI'},statistics:[{labels:Object.keys(maxey),athletes:[{athlete:{id:'9',displayName:'Tyrese Maxey'},stats:Object.values(maxey)}]}]}]}};
 const x=liveGamePoints(summary,{status:{type:{completed:false}}})[9];
 assert.equal(x.name,'Tyrese Maxey');assert.equal(x.team,'PHI');assert.equal(statLine(x.line).total,x.points);
});
