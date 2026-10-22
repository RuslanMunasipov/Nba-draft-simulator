import test from 'node:test';import assert from 'node:assert/strict';
import {nextLiveDelay,LIVE_MS,eventInfo} from '../src/live.js';

test('scores refresh every 20 s while a game runs, and the page wakes at the next tip-off', () => {
 const now=Date.parse('2026-10-21T22:00:00Z'),at=h=>new Date(now+h*36e5).toISOString();
 assert.equal(nextLiveDelay([{state:'post',date:at(-5)},{state:'in',date:at(-1)},{state:'pre',date:at(1)}],now),LIVE_MS);
 // Next tip-off in an hour: wake 15 s after it.
 assert.equal(nextLiveDelay([{state:'post',date:at(-5)},{state:'pre',date:at(1)},{state:'pre',date:at(2)}],now),36e5+15e3);
 // A tip-off due in 5 s still waits at least the live interval.
 assert.equal(nextLiveDelay([{state:'pre',date:new Date(now+5e3).toISOString()}],now),LIVE_MS);
 // Past its tip-off but not started yet (late start): every 30 s.
 assert.equal(nextLiveDelay([{state:'pre',date:at(-0.1)}],now),30e3);
 // Nothing within 12 hours, a postponed game from hours ago, or no games: no polling.
 assert.equal(nextLiveDelay([{state:'pre',date:at(13)}],now),null);
 assert.equal(nextLiveDelay([{state:'pre',date:at(-4)}],now),null);
 assert.equal(nextLiveDelay([],now),null);
});

test('a break between quarters or at halftime is a pause: nobody is on the floor then', () => {
 const event=name=>({id:'1',date:'2026-10-22T02:00Z',status:{type:{name,state:'in',completed:false,shortDetail:''}},competitions:[{competitors:[]}]});
 assert.equal(eventInfo(event('STATUS_HALFTIME')).pause,true);
 assert.equal(eventInfo(event('STATUS_END_PERIOD')).pause,true);
 assert.equal(eventInfo(event('STATUS_IN_PROGRESS')).pause,false);
});
