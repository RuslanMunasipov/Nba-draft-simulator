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
test('Season records: the season totals and the single games of every category, the anti records apart',()=>{
 const r=Object.fromEntries(x.records.map(c=>[c.key,c]));
 assert.deepEqual(Object.keys(r),['fo','pts','reb','ast','stl','blk','fgm','ftm','min','tov','pf','miss']);
 assert.deepEqual(r.pts.total.map(p=>[p.name,p.value,p.games]),[['RU Ace',58,2],['RU Bee',50,3],['RU Eve',22,1]]);
 assert.deepEqual(r.pts.game.map(p=>[p.name,p.value,p.date]),[['RU Ace',30,'2026-10-21'],['RU Ace',28,'2026-10-22'],['RU Bee',25,'2026-10-21']]);
 assert.deepEqual(r.blk.total.map(p=>[p.name,p.value]),[['RU Eve',6],['RU Fox',3]],'nobody with none');
 assert.equal(r.min.total[0].value,108);assert.equal(r.fo.game[0].value,lines[0].p);assert.ok(r.tov.anti&&!r.pts.anti);
 assert.deepEqual(r.pts.game[0].fblTeams,['Texas 76 Citrus']);
 const t=seasonAwardsText(x);
 assert.match(t,/<b>📈 Очки<\/b>\nЗа сезон:\n1\. RU Ace \(DEN\) · Texas 76 Citrus — <b>58<\/b> за 2 матча\n[^]*За матч:\n1\. RU Ace \(DEN\) · Texas 76 Citrus — <b>30<\/b> \(21\.10\)/);
 assert.ok(t.indexOf('🗑 <b>Антирекорды сезона</b>')<t.indexOf('<b>🗑 Потери</b>'));
});

// The other awards (owner, 24.10.2026): doubles, shooting, consistency, deals, the stat leaders.
import {readFileSync} from 'node:fs';
import {parseSummary} from '../awards-bot/core.js';
const B=(o={})=>({pts:8,reb:3,ast:2,stl:0,blk:0,tov:1,fgm:3,fga:7,ftm:2,fta:2,pf:1,fg3m:0,fg3a:0,...o});
const G=(d,a,n,c,o,m=30)=>{const s=B(o);return {d,e:`${d}${c}`,a,n,c,t:`${d}T23:00Z`,m,p:fblFormula(s),h:[],b:[],s};};
const more=[
 G('2026-11-01','10','Jok','DEN',{pts:25,reb:12,ast:11,fgm:10,fga:15,fg3m:1,fg3a:2}),G('2026-11-02','10','Jok','DEN',{pts:20,reb:14,ast:4,fgm:9,fga:13}),
 G('2026-11-03','10','Jok','DEN',{pts:30,reb:11,ast:10,stl:10,fgm:12,fga:16}),
 G('2026-11-01','11','Sha','OKC',{pts:30,fgm:11,fga:20,fg3m:4,fg3a:6}),G('2026-11-02','11','Sha','OKC',{pts:32,fgm:12,fga:21,fg3m:3,fg3a:5}),
 G('2026-11-03','11','Sha','OKC',{pts:31,fgm:12,fga:20,fg3m:3,fg3a:4}),
 G('2026-11-01','12','Cur','GSW',{pts:20,fgm:6,fga:20,fg3m:6,fg3a:16,tov:6,pf:6}),G('2026-11-02','12','Cur','GSW',{pts:40,fgm:14,fga:24,fg3m:9,fg3a:14}),
 G('2026-11-03','12','Cur','GSW',{pts:5,fgm:2,fga:15,fg3m:1,fg3a:9,tov:5}),
];
const deals=[
 {team:0,date:'2026-11-01',outId:'p12',inId:'p11'},{team:0,date:'2026-11-03',outId:'p11',inId:'p12'},
 {team:2,date:'2026-11-02',outId:'p11',inId:'p10'},{team:3,date:'2026-10-10',outId:'p10',inId:'p12'},
];
const ids=id=>id.slice(1);
const y=seasonAwards(more,{transfers:deals,espnOf:ids,nameOf:id=>`name ${id}`,table:[100,90,80,70,60,50,40,30]});

test('Season awards: the double-doubles count the triples too, a quadruple-double is a nomination of its own',()=>{
 assert.deepEqual(y.doubleDoubles.map(p=>[p.name,p.count]),[['Jok',3]]);
 assert.deepEqual(y.tripleDoubles.map(p=>[p.name,p.count]),[['Jok',2]]);
 assert.deepEqual(y.quadrupleDoubles.map(q=>[q.name,q.date,q.pts,q.reb,q.ast,q.stl]),[['Jok','2026-11-03',30,11,10,10]]);
 assert.match(seasonAwardsText(y),/<b>💎 Квадрупл-дабл<\/b>\nJok \(DEN\), 03\.11: 30\/11\/10\/10\/0/);
 assert.match(seasonAwardsText(x),/<b>💎 Квадрупл-дабл<\/b>\nПока не случилось\./);
});
test('Season awards: the best shooters are the regulars who shoot, ten attempts a game from the field, five threes',()=>{
 assert.deepEqual(y.fieldGoals.map(p=>[p.name,p.percent]),[['Jok',70.5],['Sha',57.4],['Cur',37.3]]);
 // Jokic's two threes in three games are too few to count.
 assert.deepEqual(y.threes.map(p=>[p.name,p.percent,p.made,p.attempts]),[['Sha',66.7,10,15],['Cur',41,16,39]]);
 const z=seasonAwards([...more,G('2026-11-01','13','Hot','MIA',{fgm:9,fga:10,fg3m:5,fg3a:5}),G('2026-11-02','14','Few','MIA',{fgm:4,fga:4})]);
 assert.equal(z.fieldGoals.some(p=>p.name==='Hot'),false,'one game of three is no regular');
 assert.equal(z.fieldGoals.some(p=>p.name==='Few'),false);
 assert.match(seasonAwardsText(y),/<b>🏹 Лучшие шутеры лиги<\/b>\nС игры \(от 10 бросков за матч\):\n1\. Jok \(DEN\) — 70\.5% \(31\/44, 14\.7 за матч\)[^]*Трёхочковые \(от 5 бросков за матч\):\n1\. Sha \(OKC\) — 66\.7% \(10\/15, 5 за матч\)/);
});
test('Season awards: the fewest turnovers a game, of the regulars with thirty minutes a game',()=>{
 const bench=['2026-11-01','2026-11-02','2026-11-03'].map(d=>G(d,'15','Bench','MIA',{tov:0},12));
 const z=seasonAwards([...more,...bench]);
 assert.deepEqual(z.fewestTurnovers.map(p=>[p.name,p.turnoversPerGame]),[['Jok',1],['Sha',1],['Cur',4]],'twelve minutes a game do not count');
 assert.match(seasonAwardsText(z),/<b>🧤 Меньше всего потерь<\/b> \(от 30 минут за матч\)\n1\. Jok \(DEN\) — 1 за матч \(3 за 3 матча, 30 мин\)/);
});
test('Season awards: Mister Consistency is the lowest spread to the average, worst game beside it',()=>{
 assert.deepEqual(y.steady.map(p=>p.name),['Sha','Jok','Cur']);assert.ok(y.steady[0].spread<y.steady[2].spread);
 assert.equal(y.steady[2].worst,Math.round(Math.min(...more.filter(l=>l.a==='12').map(l=>l.p))));
});
test('Season awards: the deals of the season while the player was held, the GM of the year by their sum',()=>{
 const d=y.dealOfTheYear.concat(y.antiDeal);
 // Team 0 bought Sha on 1.11 and sold him on 3.11: his games of 1 and 2.11 count, and Curry's of the same days.
 const first=d.find(x=>x.t===0&&x.date==='2026-11-01');assert.equal(first.until,'2026-11-03');
 assert.equal(first.bought.games,2);assert.equal(first.sold.games,2);
 assert.equal(first.difference,Math.round(more[3].p+more[4].p)-Math.round(more[6].p+more[7].p));
 assert.equal(d.some(x=>x.t===3),false,'a free pre-season deal is no deal of the year');
 assert.ok(y.dealOfTheYear.every((x,i,a)=>x.difference>0&&(!i||a[i-1].difference>=x.difference)));
 assert.ok(y.antiDeal.every(x=>x.difference<0));
 assert.deepEqual(y.gmOfTheYear.map(g=>g.key).sort(),['gm:0','gm:2']);assert.equal(y.gmOfTheYear.find(g=>g.t===0).place,1);
 assert.match(seasonAwardsText(y),/<b>👔 GM года<\/b> \(сумма сделок сезона\)\n1\. /);
});
test('Season awards: the stat leaders by the season\'s total, the per game beside it',()=>{
 assert.deepEqual(y.rebounds.map(p=>[p.name,p.value]).slice(0,1),[['Jok',37]]);assert.equal(y.rebounds[0].valuePerGame,12.3);
 assert.deepEqual(y.turnovers[0].name,'Cur');assert.deepEqual(y.fouls[0].name,'Cur');assert.deepEqual(y.bricks[0].name,'Cur');
 const t=seasonAwardsText(y);assert.match(t,/<b>🧲 Подборщик года<\/b>\n1\. Jok \(DEN\) — 37 подборов \(12\.3 за матч\)/);
 assert.match(t,/<b>🎁 Король потерь<\/b>\n1\. Cur \(GSW\) — 12 потерь/);
});
test('The awards bot keeps the threes of ESPN\'s box score, outside the FBL formula',()=>{
 const j=JSON.parse(readFileSync(new URL('./fixtures/espn-summary-401909088.json',import.meta.url),'utf8'));
 const lines=parseSummary(j,{id:'401909088',tip:'2026-10-20T19:00Z'},'2026-10-20');
 assert.ok(lines.every(l=>Number.isInteger(l.s.fg3m)&&l.s.fg3a>=l.s.fg3m&&l.s.fgm>=l.s.fg3m));assert.ok(lines.some(l=>l.s.fg3m>0));
});
