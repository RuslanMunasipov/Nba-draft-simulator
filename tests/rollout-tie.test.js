import test from 'node:test';import assert from 'node:assert/strict';import {rolloutTie} from '../src/analysis.js';
const run=(name,adjustedRuns,failed=0)=>({player:{name},adjustedRuns,failed});
test('a gap inside the paired rollout noise is reported as a tie',()=>{
 const tie=rolloutTie(run('A',[12153,12152,12438]),run('B',[12112,12105,12829]));
 assert.equal(tie.other,'B');assert.ok(Math.abs(tie.gap)<tie.margin);assert.equal(tie.runs,3);
});
test('a consistent large gap is not a tie, and failed or misaligned runs are never compared',()=>{
 assert.equal(rolloutTie(run('A',[13500,13600,13550]),run('B',[12100,12150,12120])),null);
 assert.equal(rolloutTie(run('A',[1,2,3],1),run('B',[1,2,3])),null);
 assert.equal(rolloutTie(run('A',[1,2]),run('B',[1,2,3])),null);
});
