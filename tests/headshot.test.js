import test from 'node:test';
import assert from 'node:assert/strict';
import {espnIdOf,initials,HEADSHOT_URL} from '../src/headshot.js';
test('the ESPN id of a database player, a player known only to ESPN and an awards row',()=>{
 assert.equal(espnIdOf({id:1628983,espnId:'4278073',name:'Shai Gilgeous-Alexander'}),'4278073');
 assert.equal(espnIdOf({id:'espn:5041935',name:'Cameron Boozer'}),'5041935');
 assert.equal(espnIdOf({espnId:3112335}),'3112335');
 for(const p of [{id:201143,name:'JaVale McGee'},{espnId:'../x'},null,undefined])assert.equal(espnIdOf(p),null);
});
test('initials hold the circle without a picture',()=>{
 assert.equal(initials('Shai Gilgeous-Alexander'),'SG');
 assert.equal(initials('Kenyon Martin Jr.'),'KM');
 assert.equal(initials('Trey Murphy III'),'TM');
 assert.equal(initials("De'Aaron Fox"),'DF');
 assert.equal(initials('Nikola Jokić'),'NJ');
 assert.equal(initials('Cui Yongxi'),'CY');
 assert.equal(initials('Nene'),'N');
 assert.equal(initials(''),'');
});
test('the small picture from ESPN\'s image service',()=>{
 assert.equal(HEADSHOT_URL('3112335'),'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3112335.png&w=96&h=70&scale=crop');
});
