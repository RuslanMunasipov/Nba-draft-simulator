import test from 'node:test';
import assert from 'node:assert/strict';
import {playerSearchMatches,playerSearchExact} from '../src/player-search.js';
const jaylen={id:1627759,name:'Jaylen Brown',team:'BOS'};
const bruce={id:1628971,name:'Bruce Brown',team:'DEN'};
test('Russian initials narrow surnames without selecting a homonym',()=>{
 for(const q of ['Дж. Браун','Дж Браун','J.Brown','браун дж']){assert.ok(playerSearchMatches(jaylen,q),q);assert.equal(playerSearchMatches(bruce,q),false,q);}
 assert.ok(playerSearchMatches(jaylen,'браун'));assert.ok(playerSearchMatches(bruce,'браун'));
 assert.ok(playerSearchMatches(bruce,'Б. Браун Денвер'));
 assert.equal(playerSearchMatches(jaylen,'Дж. Браун Денвер'),false);
});
test('source names, team aliases and spacing work together',()=>{
 const p={id:203999,name:'Nikola Jokic',team:'DEN'};
 for(const q of ['ЙОКИЧ','Н. Йокич Денвер','денвер йокич','Nikola Jokić','Jokic DEN'])assert.ok(playerSearchMatches(p,q),q);
 assert.ok(playerSearchExact(p,'Йокич'));
 assert.ok(playerSearchMatches({id:'custom',name:'Custom Player',sportsName:'Семён-Иванов',team:'SA'},'семен иванов сан-антонио'));
});
