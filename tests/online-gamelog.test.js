import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOnlineGames} from '../src/online-gamelog.js';
test('ESPN season-type query does not mix regular season, playoffs, preseason or All-Star',()=>{
 const game=id=>({eventId:id,stats:['20','4']});
 const data={labels:['PTS','TO'],events:{r:{gameDate:'2025-04-13'},p:{gameDate:'2025-05-18'},s:{gameDate:'2024-10-18'},a:{team:{isAllStar:true}},unknown:{}},
 seasonTypes:[
 {displayName:'2024-25 Postseason',categories:[{events:[game('p')]}]},
 {displayName:'2024-25 Regular Season',categories:[{events:[game('r'),game('a'),game('r')]}]},
 {displayName:'2024-25 Preseason',categories:[{events:[game('s')]}]},
 {displayName:'Unknown competition',categories:[{events:[game('unknown')]}]}]};
 assert.deepEqual(parseOnlineGames(data,'2').map(r=>r.event.gameDate),['2025-04-13']);
 assert.deepEqual(parseOnlineGames(data,'3').map(r=>r.event.gameDate),['2025-05-18']);
 assert.deepEqual(parseOnlineGames(data,'1').map(r=>r.event.gameDate),['2024-10-18']);
 assert.equal(parseOnlineGames(data,'2')[0].stats.TO,'4');
 assert.deepEqual(parseOnlineGames(data,'99'),[]);
});
