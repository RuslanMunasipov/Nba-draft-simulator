import test from 'node:test';
import assert from 'node:assert/strict';
import {fblPoints} from '../src/fbl-scoring.js';

const zero={pts:0,reb:0,ast:0,stl:0,blk:0,fga:0,fgm:0,fta:0,ftm:0,tov:0,pf:0,minutes:0};
for(const [name,stats,bonus,expected] of [
 ['points',{pts:10},0,11],['rebounds',{reb:10},0,11],['assists',{ast:10},0,11],
 ['steals',{stl:4},0,5],['blocks',{blk:4},0,5],['field misses',{fga:5},0,-4],
 ['field makes',{fga:5,fgm:5},0,1],['free misses',{fta:3},0,-2],
 ['free makes',{fta:3,ftm:3},0,1],['turnovers',{tov:4},0,-7],['fouls',{pf:4},0,-3],
 ['below ten',{minutes:9.99},0,1],['ten exactly',{minutes:10},0,1],['above ten',{minutes:40},0,1],
 ['no team result bonus',{},0,1],['negative total',{tov:10,pf:6},0,-25],
 ['three pointers not doubled',{pts:9,fg3m:3,fga:3,fgm:3},0,10],
 ['mixed line',{pts:20,reb:8,ast:6,stl:2,blk:1,fga:15,fgm:8,fta:5,ftm:4,tov:3,pf:2,minutes:35},0,22]
])test('scoring edge: '+name,()=>assert.equal(fblPoints({...zero,...stats},bonus),expected));
