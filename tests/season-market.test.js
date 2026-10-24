import test from 'node:test';import assert from 'node:assert/strict';
import {seasonRosters,withMarket,takenIds} from '../src/season.js';
import {MARKET_DEFAULT,MARKET_WIDEST,marketSettings,marketRows,marketFilter,marketView,unsoldPlayers,cardsOnSale} from '../src/season-market.js';
// 16 drafted players (two a team; #2's card emptied, #3 without a card), free #17 (two hot games) and #18 (a rookie
// without a game), #19's card emptied and #20's at «Бешикташ» (both off sale), #21 and #22 at NBA clubs without a card,
// and a card the database does not know (withMarket adds it).
const g=(date,points)=>({date,played:true,points,minutes:'30:00',pointsSource:'ESPN'});
const P=(id,extra)=>({id,name:'P'+id,sportsId:String(1000+id),positions:['SF'],price:1500,priceStatus:'VERIFIED',team:'BOS',isRookie:false,forecast:{meanPerGame:20,games:82},...extra});
const picks=Array.from({length:16},(_,i)=>i+1);
const base=[...picks.map(i=>P(i,i===3?{team:'LAL'}:{})),P(17,{name:"Royce O'Neale",positions:['PG'],team:'CHA'}),P(18,{positions:['C'],isRookie:true,team:null,sportsClub:'Бостон',price:1200}),
 P(19,{team:'UTAH'}),P(20,{team:null}),P(21,{name:'Tobe Awaka',sportsId:undefined,team:'CHI',isRookie:true}),P(22,{name:'Aaron Able',sportsId:undefined,team:'ATL'})];
const card=extra=>({club:'Бостон',position:'SF',price:1500,games:[],...extra});
const cards=Object.fromEntries(picks.filter(i=>i!==3).map(i=>[String(1000+i),card({games:[g('2026-10-22',25)]})]));
const live={clubs:{'Бостон':[],'Шарлотт':[],'Чикаго':[]},players:{...cards,1002:{games:[]},
 1017:card({club:'Шарлотт',position:'PG',fullName:"Ройс О'Нил",name:"О'Нил",games:[g('2026-10-22',30),g('2026-10-24',28)]}),
 1018:card({club:'Чикаго',position:'C',price:1200}),1019:{games:[]},1020:card({club:'Бешикташ'}),9999:card({fullName:'Market Only',name:'Only'})}};
const ctx={players:withMarket(base,live),live,injuries:new Map(),today:'2026-10-24',rosters:seasonRosters([],picks),transfers:[]};
const all=marketRows(ctx),ids=rows=>rows.map(r=>r.p.id).sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true}));

test('the market is every card on sale plus an off-sale card an FBL team holds',()=>{
 assert.equal(cardsOnSale(live),17);
 assert.deepEqual(ids(all),[1,2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,'sports:9999']);
 // #2's emptied card stays with his team (frozen), marked off sale; free off-sale cards (#19, #20) are not for sale.
 const two=all.find(r=>r.p.id===2);assert.equal(two.sale,false);assert.equal(two.owner,1);
 assert.ok(all.filter(r=>r.p.id!==2).every(r=>r.sale));
});
test('the view counts what each filter hides, one filter widened at a time',()=>{
 const v=marketView(all,MARKET_DEFAULT,'');
 assert.deepEqual(ids(v.rows),[17,18,'sports:9999']);assert.deepEqual(v.hidden,{scope:15,games:0,other:0,all:15});
 // From one game: #18 and the market-only card have none; on FBL teams #2 has none either, so widening the scope adds 14.
 const one=marketView(all,{...MARKET_DEFAULT,minGames:1},'');
 assert.deepEqual(ids(one.rows),[17]);assert.deepEqual(one.hidden,{scope:14,games:2,other:0,all:17});
 const pg=marketView(all,{...MARKET_DEFAULT,pos:'PG',maxPrice:1300},'');
 assert.deepEqual(ids(pg.rows),[]);assert.equal(pg.hidden.other,3);assert.equal(pg.hidden.all,18);
 assert.equal(marketView(all,{...MARKET_DEFAULT,...MARKET_WIDEST},'').rows.length,all.length);
 assert.deepEqual(ids(all.filter(marketFilter({...MARKET_DEFAULT,streaks:true}))),[17]);
 assert.deepEqual(ids(all.filter(marketFilter({...MARKET_DEFAULT,rookies:true}))),[18]);
});
test('the search works inside the filters and the counts tell what they hide',()=>{
 for(const q of ["О'Нил",'О’Нил','Ройс О’Нил','ONeale',"o'neale",'Нил'])assert.deepEqual(ids(marketView(all,MARKET_DEFAULT,q).rows),[17],q);
 // Sports.ru's club of the card: #18's database club is stale and he has no ESPN club.
 assert.deepEqual(ids(marketView(all,MARKET_DEFAULT,'Чикаго').rows),[18]);
 assert.deepEqual(ids(marketView(all,MARKET_DEFAULT,'Market Only').rows),['sports:9999']);
 const held=marketView(all,MARKET_DEFAULT,'P5');assert.deepEqual(held.rows,[]);assert.deepEqual(held.hidden,{scope:1,games:0,other:0,all:1});
 const nobody=marketView(all,MARKET_DEFAULT,'Tobe Awaka');assert.equal(nobody.found,0);assert.equal(nobody.hidden.all,0);
});
test('NBA players Sports.ru does not sell: at an NBA club, no card on sale, no FBL team, by club and name',()=>{
 const name=ps=>ps.map(p=>`${p.team} ${p.name}`);
 assert.deepEqual(name(unsoldPlayers(base,live,takenIds(ctx))),['ATL Aaron Able','CHI Tobe Awaka','UTAH P19']);
 assert.deepEqual(name(unsoldPlayers(base,live)),['ATL Aaron Able','BOS P2','CHI Tobe Awaka','LAL P3','UTAH P19']);
});
test('stored filters: one saved before the version field loses its games filter, the rest stays',()=>{
 assert.equal(MARKET_DEFAULT.minGames,0);assert.equal(MARKET_DEFAULT.scope,'free');
 assert.deepEqual(marketSettings({}),{...MARKET_DEFAULT,version:1});assert.deepEqual(marketSettings(null),{...MARKET_DEFAULT,version:1});
 assert.deepEqual(marketSettings({scope:'all',pos:'C',minGames:1,maxPrice:1500,sort:'price',streaks:true,rookies:false}),
  {...MARKET_DEFAULT,scope:'all',pos:'C',maxPrice:1500,sort:'price',streaks:true,version:1});
 assert.equal(marketSettings({minGames:3,version:1}).minGames,3);
});
