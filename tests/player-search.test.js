import test from 'node:test';
import assert from 'node:assert/strict';
import {playerSearchMatches,playerSearchExact,normalizeSearch} from '../src/player-search.js';
const jaylen={id:1627759,name:'Jaylen Brown',team:'BOS'};
const bruce={id:1628971,name:'Bruce Brown',team:'DEN'};
test('Russian initials narrow surnames without selecting a homonym',()=>{
 for(const q of ['Дж. Браун','Дж Браун','J.Brown','браун дж','Джейлен Браун']){assert.ok(playerSearchMatches(jaylen,q),q);assert.equal(playerSearchMatches(bruce,q),false,q);}
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
test('an apostrophe joins a name in the typed and the stored form, a hyphen still separates',()=>{
 const royce={id:1626220,name:"Royce O'Neale",sportsName:"О'Нил",team:'PHX'};
 for(const q of ["О'Нил",'О’Нил','ОНил','O’Neale',"o'neale",'ONeale','Нил','Royce O`Neale'])assert.ok(playerSearchMatches(royce,q),q);
 assert.ok(playerSearchExact(royce,'О’Нил'));assert.equal(normalizeSearch("Д'Анджело Рассел-мл."),'данджело рассел мл');
});
test('a season row adds Sports.ru\'s full name and club of the card',()=>{
 const conley={id:201144,name:'Mike Conley',sportsName:'Конли',team:'BOS'};
 assert.equal(playerSearchMatches(conley,'Майк Конли'),false);
 assert.ok(playerSearchMatches({...conley,fullName:'Майк Конли',club:'Бостон'},'Майк Конли'));
 assert.ok(playerSearchMatches({id:'sports:1',name:'X Y',team:null,club:'Голден Стэйт'},'голден стэйт'));
});
