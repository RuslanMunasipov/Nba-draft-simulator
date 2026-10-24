import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {seasonAwards,seasonAwardsText} from '../awards-bot/season-awards.js';

const S=(pts,reb,ast,stl,blk,tov=2,fgm=8,fga=16)=>({pts,reb,ast,stl,blk,tov,fgm,fga,ftm:2,fta:2,pf:2});
const L=(d,a,n,c,s,m=34,h=[])=>({d,e:`g${d}${c}`,a,n,c,t:`${d}T23:00Z`,m,p:fblFormula(s),h,b:[],s});
const pos={1:'PG',2:'PG',3:'PG',4:'PG',5:'C',6:'C',7:'SF'};
const lines=[
 L('2026-10-21','1','Ace','DEN',S(30,5,10,1,0)),L('2026-10-22','1','Ace','DEN',S(28,4,9,1,0)),
 L('2026-10-21','2','Bee','BOS',S(25,3,6,4,0)),L('2026-10-22','2','Bee','BOS',S(20,3,6,4,0)),L('2026-10-23','2','Bee','BOS',S(5,1,1,0,0),40),
 L('2026-10-21','3','Cee','LAL',S(10,2,3,0,0)),L('2026-10-21','4','Dee','MIA',S(8,2,2,0,0)),
 L('2026-10-21','5','Eve','SAS',S(22,14,3,1,6)),L('2026-10-22','6','Fox','NYK',S(12,10,1,2,3)),
 L('2026-10-23','7','Gus','DAL',S(9,4,2,0,0),20,[3]),
];
const x=seasonAwards(lines,{who:(a,n)=>`RU ${n}`,positionOf:a=>pos[a],rookies:new Set(['7','6']),heldBy:new Map([['7',[3]],['1',[5]]])});

test('Season awards: the All-FBL First, Second and Third Teams, a player a position, every NBA player counted',()=>{
 assert.deepEqual(x.allFbl.map(t=>t.team),[1,2,3]);assert.deepEqual(x.allFbl[0].players.map(p=>p.position),['PG','SG','SF','PF','C']);
 const pg=x.allFbl.map(t=>t.players[0].name);assert.deepEqual(pg,['RU Ace','RU Bee','RU Cee'],'the second and third best at the position');
 assert.equal(x.allFbl[0].players[0].key,'player:1');assert.deepEqual(x.allFbl[0].players[0].fblTeams,['Texas 76 Citrus']);
 assert.equal(x.allFbl[0].players[1].name,null,'nobody at SG: an empty place');assert.equal(x.allFbl[0].players[4].name,'RU Eve','free agents count too');
 assert.equal(x.allFbl[0].players[0].fo,Math.round(lines[0].p+lines[1].p));
});
test('Season awards: the rookie of the year, the defender by steals and blocks, the iron man by games',()=>{
 assert.deepEqual(x.roy.map(p=>p.name),['RU Fox','RU Gus']);
 assert.deepEqual(x.dpoy.map(p=>[p.name,p.stocks]),[['RU Bee',8],['RU Eve',7],['RU Fox',5]]);assert.deepEqual([x.dpoy[0].steals,x.dpoy[0].blocks],[8,0]);
 assert.deepEqual(x.ironMan.map(p=>[p.name,p.games]),[['RU Bee',3],['RU Ace',2],['RU Cee',1]]);assert.equal(x.ironMan[0].minutes,108);
 assert.equal(x.games,3);
 const t=seasonAwardsText(x);assert.match(t,/<b>Первая сборная FBL<\/b>\nPG: RU Ace \(DEN\) · Texas 76 Citrus — \d+ ФО\nSG: —/);
 assert.match(t,/<b>🛡 Лучший защитник \(перехваты \+ блоки\)<\/b>\n1\. RU Bee \(BOS\) — 8 \(8 перехв\., 0 блок\.\)/);assert.match(t,/<b>🦾 Железный человек<\/b>\n1\. RU Bee \(BOS\) — 3 матча, 108 мин/);
});
