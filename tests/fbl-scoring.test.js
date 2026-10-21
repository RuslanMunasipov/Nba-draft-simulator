import test from 'node:test';import assert from 'node:assert/strict';import {fblPoints,projectedFblPoints} from '../src/fbl-scoring.js';
const s={pts:25,reb:10,ast:8,stl:2,blk:1,fga:20,fgm:10,fta:6,ftm:5,tov:3,pf:2,minutes:32};
test('FBL formula applies misses, turnovers, fouls and one point per game played',()=>assert.equal(fblPoints(s),28));
test('FBL does not add three pointers separately',()=>assert.equal(fblPoints({...s,threePM:5}),28));
test('FBL gives the same one point for a game of any length (Yahoo GP)',()=>assert.equal(fblPoints({...s,minutes:9}),fblPoints(s)));
test('FBL has no team result bonus (the league scores on Yahoo)',()=>assert.equal(fblPoints(s,3),fblPoints(s)));
test('FBL rejects made field goals above attempts',()=>assert.throws(()=>fblPoints({...s,fgm:21}),/Попаданий/));
test('projection uses identical arithmetic',()=>assert.equal(projectedFblPoints(s),fblPoints(s)));
