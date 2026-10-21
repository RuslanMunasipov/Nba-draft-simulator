import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScoreboard,parseSummary,makeLeague,benchOf,settle,dailyBlocks,weeklyBlocks,records,recordNews,races,sixthRace,monthFive,
 moved,withoutRookie,reportDay,weekOf,isMonthEnd,isSunday,deadline,daysBetween,special} from '../awards-bot/core.js';
import {statLine,split,esc,dailyText,racesText,recordsText,monthText,rookieAlert,dayLabel} from '../awards-bot/messages.js';

const line=(a,p,extra={})=>({d:'2026-10-21',e:'g1',a,n:'P'+a,c:'DEN',t:'2026-10-22T00:00Z',m:30,p,h:[],b:[],
 s:{pts:0,reb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,ftm:0,fta:0,pf:0},...extra});
const who=(a,n)=>n||a;

test('awards bot: ESPN box score lines score by the league formula and skip DNPs',()=>{
 const labels=['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB','DREB','PF','+/-'];
 const summary={boxscore:{players:[{team:{abbreviation:'DEN'},statistics:[{labels,athletes:[
  {athlete:{id:'1',shortName:'N. Jokic'},stats:['36','31','12-19','2-4','5-6','14','11','3','2','1','3','11','2','+8']},
  {athlete:{id:'2',shortName:'Bench'},didNotPlay:true,stats:[]},
  {athlete:{id:'3',shortName:'Cameo'},stats:['0','0','0-0','0-0','0-0','0','0','0','0','0','0','0','0','0']}]}]}]}};
 const out=parseSummary(summary,{id:'g1',tip:'2026-10-22T00:00Z'},'2026-10-21');
 // 31+14+11+2+1 - 7 missed shots - 1 missed free throw - 2*3 turnovers - 2 fouls + 1 for the game played.
 assert.equal(out.find(l=>l.a==='1').p,44);
 assert.equal(out.find(l=>l.a==='1').m,36);
 assert.equal(out.length,2,'a DNP has no line');
 assert.equal(out.find(l=>l.a==='3').p,1,'a cameo still earns the point for the game played');
 const board=parseScoreboard({events:[{id:1,date:'2026-10-22T00:00Z',status:{type:{name:'STATUS_FINAL',completed:true}},competitions:[{competitors:[{homeAway:'home',team:{abbreviation:'DEN'}},{homeAway:'away',team:{abbreviation:'LAL'}}]}]},
  {id:2,date:'2026-10-22T02:00Z',status:{type:{name:'STATUS_POSTPONED',completed:false}},competitions:[{competitors:[]}]}]});
 assert.deepEqual(board.map(g=>[g.id,g.final,g.off,g.home,g.away]),[['1',true,false,'DEN','LAL'],['2',false,true,'','']]);
});

// Team 0 holds two centres (s1, s2) and a guard; team 1 holds s2 as well. Prices: s1 2000, s2 1800 before 22.10.
function fixture({s1=[],s2=[],order=['s1','s2','s3']}={}){
 const players=[{id:1,sportsId:'s1',espnId:'e1',sportsName:'Один',isRookie:false},{id:2,sportsId:'s2',espnId:'e2',sportsName:'Два',isRookie:true},
  {id:3,sportsId:'s3',espnId:'e3',sportsName:'Три'},{id:4,sportsId:'s4',sportsName:'Четыре'}];
 const live={players:{s1:{position:'C',initialPrice:2000,games:s1},s2:{position:'C',initialPrice:1800,games:s2},s3:{position:'PG',initialPrice:1500,games:[]},s4:{position:'C',initialPrice:1000,games:[]}},
  teams:{0:{roster:order.map(sportsId=>({sportsId}))}}};
 const draft=(team,playerId)=>({team,playerId,from:'2026-10-18',fromAt:null,to:null,toAt:null});
 const holdings=[draft(0,1),draft(0,2),draft(0,3),draft(1,2)];
 return makeLeague({players,live,holdings,map:[{sportsId:'s4',espnId:'e4'}]});
}
// A game at 03:00 Moscow time of `moscow` (the evening before in the US).
const at=(a,moscow='2026-10-22')=>line(a,10,{d:moscow,t:`${moscow}T00:00Z`});
test('awards bot: the cheaper player of a position is the bench player, a price change swaps them',()=>{
 const league=fixture(),slots={};
 assert.equal(benchOf(league,slots,0,league.player('e2'),at('e2')),true);
 assert.equal(benchOf(league,slots,0,league.player('e1'),at('e1')),false);
 assert.equal(slots['0:C'],'s2');
 assert.equal(benchOf(league,slots,0,league.player('e3'),at('e3')),false,'a position with one player has no bench');
 assert.equal(benchOf(league,slots,1,league.player('e2'),at('e2')),false,'team 1 holds one centre');
 // s2 rose above s1 after a game filed under 22.10 (Moscow): from the next day s1 is the bench player.
 const swapped=fixture({s2:[{date:'2026-10-22',price:2100}]}),s={};
 assert.equal(benchOf(swapped,s,0,swapped.player('e2'),at('e2','2026-10-22')),true,'the price before the game day decides');
 assert.equal(benchOf(swapped,s,0,swapped.player('e1'),at('e1','2026-10-23')),true);
 assert.equal(s['0:C'],'s1');
});
test('awards bot: at one price the bench place stays, at the season start the Sports.ru order decides',()=>{
 const tie={s1:[{date:'2026-10-21',price:1800}]};
 assert.equal(benchOf(fixture(tie),{},0,fixture(tie).player('e2'),at('e2')),true,'second on the page: bench');
 const league=fixture({...tie,order:['s2','s1','s3']});
 assert.equal(benchOf(league,{},0,league.player('e1'),at('e1')),true,'page order flipped');
 assert.equal(benchOf(league,{'0:C':'s2'},0,league.player('e2'),at('e2')),true,'the bench player before keeps the place');
});
test('awards bot: settled lines carry holders and bench teams; ESPN ids reach players through the Sports.ru map',()=>{
 const league=fixture(),out=settle([at('e2'),at('e1'),at('e9')],league,{});
 const by=Object.fromEntries(out.map(l=>[l.a,l]));
 assert.deepEqual([by.e2.h,by.e2.b],[[0,1],[0]]);
 assert.deepEqual([by.e1.h,by.e1.b],[[0],[]]);
 assert.deepEqual(by.e9.h,[],'not on Sports.ru: a free agent');
 assert.equal(league.player('e4').sportsName,'Четыре');
});

test('awards bot: day blocks split the league players from free agents and apply the minutes thresholds',()=>{
 const lines=[line('a',40,{h:[0]}),line('b',-5,{h:[1],m:14}),line('c',-2,{h:[2]}),line('d',30),line('e',-9,{m:19}),line('f',-1,{m:25})];
 const b=dailyBlocks(lines);
 assert.deepEqual(b.heroes.map(l=>l.a),['a','c','b']);
 assert.deepEqual(b.flops.map(l=>l.a),['c','a'],'under 15 minutes is not a flop');
 assert.deepEqual(b.gold.map(l=>l.a),['d','f','e']);
 assert.deepEqual(b.antitop.map(l=>l.a),['c','f','d'],'the NBA antitop from 20 minutes');
 const w=weeklyBlocks([line('a',10,{h:[0],m:30}),line('a',12,{h:[0],m:31,e:'g2'}),line('b',-3,{h:[1],m:50})]);
 assert.deepEqual(w.heroes.map(r=>[r.a,r.p,r.games]),[['a',22,2],['b',-3,1]]);
 assert.deepEqual(w.flops.map(r=>r.a),['a'],'a weekly flop needs 60 minutes');
});
test('awards bot: season records rank single games, an earlier game first at one score, and report what a day changed',()=>{
 const old=[line('a',60,{d:'2026-10-25',t:'2026-10-26T00:00Z'}),line('b',50,{d:'2026-10-26',t:'2026-10-27T00:00Z'}),line('c',50,{d:'2026-10-24',t:'2026-10-25T00:00Z'}),line('x',-10)];
 assert.deepEqual(records(old).best.map(l=>l.a),['a','c','b']);
 assert.deepEqual(records(old).worst[0].a,'x');
 const today=[line('d',61,{d:'2026-11-05',e:'g9',t:'2026-11-06T00:00Z'})];
 const news=recordNews(old,today);
 assert.deepEqual(news.map(n=>[n.kind,n.rank,n.line.a,n.previous?.a]),[['best',1,'d','a']]);
 assert.equal(daysBetween('2026-10-25','2026-11-05'),11);
 assert.equal(special('2026-12-25'),'🎄');
});
test('awards bot: races take the league players now, rookies, the pre-season Mef prices and the bench index',()=>{
 const lines=[line('a',40,{h:[0],b:[]}),line('b',30,{h:[1],b:[1]}),line('b',20,{h:[1],b:[],e:'g2'}),line('c',35)];
 const r=races(lines,{rostered:new Map([['a',[0]],['b',[1]],['z',[2]]]),rookies:new Set(['b','z']),mef:new Map([['c',1500],['b',1900]])});
 assert.deepEqual(r.mvp.map(x=>[x.a,x.p]),[['b',50],['a',40],['z',0]]);
 assert.deepEqual(r.roy.map(x=>x.a),['b','z']);
 assert.deepEqual(r.mef.map(x=>[x.a,x.price]),[['b',1900],['c',1500]]);
 assert.deepEqual(r.sixth.map(x=>[x.key,x.bench,x.games,x.index]),[['1:b',1,2,25]]);
 assert.equal(sixthRace([line('a',10,{h:[0],b:[]})]).length,0,'never on the bench: not in the race');
 assert.equal(moved('b',r.mvp,['a','b']),1);assert.equal(moved('z',r.mvp,['a','b']),null);assert.equal(moved('a',r.mvp,null),0);
});
test('awards bot: the month five takes the best of each position held at the month end',()=>{
 const lines=[line('a',100),line('b',100,{e:'g2'}),line('b',1,{e:'g3'}),line('c',90),line('d',500)];
 const five=monthFive(lines,{heldAtEnd:new Map([['a',[0]],['b',[1]],['c',[2]]]),positionOf:a=>({a:'C',b:'C',c:'PG',d:'C'})[a]});
 assert.deepEqual(five.map(x=>[x.pos,x.row?.a]),[['PG','c'],['SG',undefined],['SF',undefined],['PF',undefined],['C','b']]);
 assert.deepEqual(withoutRookie([[{isRookie:true}],[{isRookie:false}]],p=>p.isRookie),[1]);
});
test('awards bot: report day, weeks, month ends and the posting deadline',()=>{
 assert.equal(reportDay(Date.parse('2026-10-22T04:00:00Z')),'2026-10-21','07:00 Moscow reports the US evening before');
 assert.equal(reportDay(Date.parse('2026-10-22T08:50:00Z')),'2026-10-21');
 assert.deepEqual(weekOf('2026-10-25'),{n:1,start:'2026-10-19',end:'2026-10-25'});
 assert.equal(weekOf('2026-10-26').n,2);
 assert.ok(isSunday('2026-10-25'));assert.ok(isMonthEnd('2026-10-31'));assert.ok(!isMonthEnd('2026-10-30'));
 assert.equal(new Date(deadline('2026-10-21')).toISOString(),'2026-10-22T08:45:00.000Z');
});

test('awards bot: texts bold outstanding numbers, escape names and fit Telegram',()=>{
 assert.equal(statLine({pts:31,reb:14,ast:9,stl:3,blk:1,tov:4}),'<b>31 очк</b> · <b>14 подб</b> · 9 пер · <b>3 перехв</b> · 1 блок · <b>4 пот</b>');
 assert.equal(esc('A<b>&'),'A&lt;b&gt;&amp;');
 assert.equal(dayLabel('2026-10-20'),'20 октября');
 const parts=split(['a'.repeat(3000),'b'.repeat(3000),'c'].join('\n\n'));
 assert.equal(parts.length,2);assert.ok(parts.every(p=>p.length<=4096));
 const text=dailyText('2026-10-21',dailyBlocks([line('a',40,{h:[0]}),line('d',30)]),who,{missing:[{home:'LAL',away:'GS'}]});
 assert.match(text,/⭐ Герои дня · 21 октября/);assert.match(text,/🥇 <b>Pa<\/b> · DEN 🐎 — <b>40<\/b>/);
 assert.match(text,/🆓 Золотая жила/);assert.match(text,/GS — LAL/);
 assert.equal(dailyText('2026-10-21',{heroes:[],flops:[],gold:[],antitop:[]},who),'');
 const r=races([line('a',40,{h:[0],b:[0]})],{rostered:new Map([['a',[0]]]),rookies:new Set(),mef:new Map()});
 const race=racesText({n:2},r,who,{mvp:['x','a'],sixth:['0:a']});
 assert.match(race,/1\. <b>Pa<\/b> 🐎 — <b>40<\/b> ▲1/);assert.match(race,/запасным 1 из 1 \(100%\)/);
 assert.match(recordsText(records([line('a',40,{h:[0]})]),who,'2026-10-31'),/\(10 дн\.\)/);
 assert.match(monthText('2026-10',[{pos:'PG',row:{...line('a',40),games:3,teams:[1]}}],who),/PG · <b>Pa<\/b> · DEN 👑 — <b>40<\/b> · 3\sматча/);
 assert.match(rookieAlert([0]),/The Balkan Murderers/);assert.equal(rookieAlert([]),'');
});
