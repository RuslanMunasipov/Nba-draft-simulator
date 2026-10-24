import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moved} from '../awards-bot/core.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {raceAlbum} from '../awards-bot/cards.js';
import {STEVEN,SIGNATURE,CAPTION_LIMIT,stevenSenders,viaFirst,raceFacts,fiveFacts,verdictMessages,verdictLines,strayNumbers,verdictFor,withVerdict,verdictText} from '../awards-bot/steven.js';

const s={pts:31,reb:14,ast:11,stl:2,blk:1,tov:3,fgm:12,fga:19,ftm:5,fta:6,pf:2};
const row=(a,p,extra={})=>({a,n:'P'+a,c:'DEN',games:2,m:60,p,s,h:[1],teams:[1],...extra});
const who=(a,n)=>a==='404'?'404':'RU '+(n||'P'+a);
const week={n:3,start:'2026-11-02',end:'2026-11-08'};
const races={mvp:[row('1',170),row('2',160),row('4',90)],roy:[row('7',80)],mef:[row('3',140,{teams:[],price:1400})],
 sixth:[{key:'2:5',team:2,a:'5',n:'P5',c:'BOS',games:4,bench:3,p:120,index:90}]};
const rec={best:[{a:'9',n:'P9',p:70,d:'2026-11-04'}],worst:[{a:'8',n:'P8',p:-12,d:'2026-11-05'}]};
const previous={mvp:['2','1','6','404'],roy:['7'],mef:['3'],sixth:['2:5']};

test('Steven Ex Pert: the league\'s expert of people.json, his signature',()=>{
 assert.equal(STEVEN.id,'steven-ex-pert');assert.equal(STEVEN.photo,'people/steven-ex-pert.jpg');
 assert.equal(SIGNATURE,'— Стивен Экс Перт, эксперт Inside FBL');
});

test('Steven Ex Pert: his bot first, the awards bot behind it, one bot for one token',()=>{
 assert.deepEqual(stevenSenders({steven:'S',awards:'A'}),[{name:'Steven Ex Pert',token:'S'},{name:'awards bot',token:'A'}]);
 assert.deepEqual(stevenSenders({steven:'',awards:'A'}),[{name:'awards bot',token:'A'}],'no token of his: the awards bot');
 assert.deepEqual(stevenSenders({steven:undefined,awards:'A'}),[{name:'awards bot',token:'A'}]);
 assert.deepEqual(stevenSenders({steven:' A\n',awards:'A'}),[{name:'Steven Ex Pert',token:'A'}],'the same bot is tried once');
 assert.deepEqual(stevenSenders({}),[]);
});

test('Steven Ex Pert: a post goes from the first bot Telegram takes, once; a refusal hands it to the awards bot',async()=>{
 const senders=stevenSenders({steven:'S',awards:'A'}),logs=[];
 const sent=[],ok=async t=>{sent.push(t);};
 assert.equal(await viaFirst(senders,ok,{log:m=>logs.push(m)}),'Steven Ex Pert');
 assert.deepEqual(sent,['S'],'his bot took it: the awards bot sends nothing');assert.deepEqual(logs,[]);
 const tried=[],refused=async t=>{tried.push(t);if(t==='S')throw Error('Telegram album: 403 Forbidden: bot is not a member of the chat');};
 assert.equal(await viaFirst(senders,refused,{label:'race-3',log:m=>logs.push(m)}),'awards bot');
 assert.deepEqual(tried,['S','A'],'each bot once');assert.match(logs[0],/race-3: not sent by Steven Ex Pert \(.*403.*\); awards bot sends it\./);
 const none=[],noToken=await viaFirst(stevenSenders({awards:'A'}),async t=>{none.push(t);});
 assert.equal(noToken,'awards bot');assert.deepEqual(none,['A'],'without his token the awards bot posts as before');
 await assert.rejects(viaFirst(senders,async t=>{throw Error('down '+t);},{log:()=>{}}),/down A/,'both refused: the last refusal, for the text fallback');
 await assert.rejects(viaFirst([],ok),/no bot/);
});

test('Steven Ex Pert: the race facts carry the cards\' arrows, the ones out of the race and the numbers he may use',()=>{
 const f=raceFacts(week,races,rec,who,previous);
 assert.equal(f.week,3);assert.equal(f.firstRace,false);
 assert.deepEqual(f.mvp.top.map(x=>[x.place,x.name,x.fo,x.trend]),[[1,'RU P1',170,'поднялся на 1'],[2,'RU P2',160,'опустился на 1'],[3,'RU P4',90,'новый в списке']]);
 // The same places as the arrows of the cards (cards.js, moved()).
 for(const [i,x] of races.mvp.entries()){const m=moved(x.a,races.mvp,previous.mvp),t=f.mvp.top[i].trend;
  assert.equal(t,m===null?'новый в списке':m>0?`поднялся на ${m}`:m<0?`опустился на ${-m}`:'на месте');}
 const cards=raceAlbum(week,races,rec,who,{photo:()=>null,logo:()=>null,emoji:e=>e},{manrope:'',oswald:''},{previous}).cards[1];
 assert.match(cards,/RU P1<span class="move up">▲1/);assert.match(cards,/RU P2<span class="move down">▼1/);assert.match(cards,/RU P4<span class="move new">NEW/);
 assert.deepEqual(f.mvp.outOfTheRace,['RU P6'],'a name the league does not know is left out, never an id');
 assert.equal(f.rookieOfTheYear.top[0].trend,'на месте');
 assert.equal(f.mefPlayer.top[0].priceBeforeSeason,1400);
 assert.deepEqual(f.sixthMan.top[0],{place:1,name:'RU P5',fo:120,fblTeams:[LEAGUE_TEAMS[2].name],index:90,benchGames:3,games:4,trend:'на месте'});
 assert.deepEqual(f.seasonRecords,{best:[{name:'RU P9',fo:70,day:'4 ноября'}],worst:[{name:'RU P8',fo:-12,day:'5 ноября'}]});
 const first=raceFacts(week,races,rec,who,{});
 assert.equal(first.firstRace,true);assert.equal(first.mvp.top[0].trend,null,'no arrows on the first race');assert.deepEqual(first.mvp.outOfTheRace,[]);
 const five=fiveFacts('2026-11',[{pos:'PG',row:row('1',300,{games:12})},{pos:'C',row:null}],who);
 assert.deepEqual(five,{month:'ноябрь 2026',five:[{position:'PG',name:'RU P1',fo:300,games:12,fblTeams:[LEAGUE_TEAMS[1].name]},{position:'C',name:null}]});
 const m=verdictMessages('race',f);assert.match(m.system,/Стивен Экс Перт/);assert.match(m.system,/только числа из данных/);assert.match(m.prompt,/"outOfTheRace"/);
});

test('Steven Ex Pert: a verdict with numbers of its own is written again, then left out; the post never waits on it',async()=>{
 const f=raceFacts(week,races,rec,who,previous);
 const good=['RU P1 со своими 170 ФО уже примеряет пиджак MVP.','RU P2 опустился на 1 место — рынок не понял мой прогноз.'];
 assert.deepEqual(strayNumbers(good,f),[]);
 assert.deepEqual(strayNumbers(['RU P1 набрал 171 ФО','и сорок два подбора'],f),['171','42'],'digits and words');
 const calls=[],answers=[{lines:['RU P1 на 999 ФО впереди всех.','Вторая строка.']},{lines:good}];
 const claude=async x=>{calls.push(x);return {data:answers.shift()};};
 const logs=[],r=await verdictFor('race',f,{claude,log:m=>logs.push(m)});
 assert.deepEqual(r.verdict,good);assert.equal(calls.length,2);assert.match(calls[1].prompt,/Прошлый вариант отклонён: числа не из данных \(999\)/);
 assert.match(logs[0],/written again/);
 const twice=[];const bad=await verdictFor('race',f,{claude:async x=>{twice.push(x);return {data:{lines:['Ровно 999 ФО.','И 1000 сверху.']}};},log:()=>{}});
 assert.equal(bad.verdict,null,'from the second time: no verdict');assert.equal(twice.length,2,'never a third try');
 assert.equal((await verdictFor('five',f,{claude:async()=>{throw Error('429 limit');},log:()=>{}})).verdict,null,'Claude down: no verdict, no throw');
 assert.equal(verdictLines({lines:['одна']}),null);assert.equal(verdictLines({lines:['a','b','c','d']}),null);
 assert.deepEqual(verdictLines({lines:[' a  b ','c']}),['a b','c']);
});

test('Steven Ex Pert: his words go under the caption before its hashtags, never past Telegram\'s limit',()=>{
 const caption='<b>🏆 Гонка за награды · после 3-й недели</b>\nЛидер гонки MVP: RU P1 — 170 ФО\n\n#гонка_за_награды #неделя_3 #ноябрь_2026';
 assert.equal(withVerdict(caption,['Фаворит <один>.','Второй — на подходе.']),
  '<b>🏆 Гонка за награды · после 3-й недели</b>\nЛидер гонки MVP: RU P1 — 170 ФО\n\n<i>Фаворит &lt;один&gt;.</i>\n<i>Второй — на подходе.</i>\n— Стивен Экс Перт, эксперт Inside FBL\n\n#гонка_за_награды #неделя_3 #ноябрь_2026');
 assert.equal(withVerdict(caption,null),caption);
 assert.equal(withVerdict(caption,['x'.repeat(CAPTION_LIMIT),'y']),caption,'too long: the caption as it is');
 assert.equal(verdictText('текст',['a','b']),'текст\n\n<i>a</i>\n<i>b</i>\n— Стивен Экс Перт, эксперт Inside FBL');
 assert.equal(verdictText('текст',null),'текст');
});

test('Steven Ex Pert: the bot sends the race and the five from his bot, keeps the state\'s keys and the rookie check',()=>{
 const src=fs.readFileSync(new URL('../awards-bot/bot.mjs',import.meta.url),'utf8');
 assert.match(src,/stevenSenders\(\{steven:env\.STEVEN_EX_PERT_BOT_TOKEN,awards:TOKEN\}\)/);
 assert.match(src,/postAlbum\(`race-\$\{week\.n\}`[^\n]*raceAlbum[^\n]*STEVEN_SENDERS\);/);
 assert.match(src,/postAlbum\(`week-\$\{week\.n\}`[^\n]*weekAlbum\(week,wb,ctx\.who[^\n]*\);\n/);
 assert.doesNotMatch(src.match(/postAlbum\(`week-\$\{week\.n\}`[^\n]*/)[0],/STEVEN/,'the week\'s heroes are not his');
 assert.match(src,/postAlbum\(`month-\$\{month\}`[\s\S]{0,400}?STEVEN_SENDERS\);/);
 for(const key of ['state.posted.weekly[week.start]=live?\'sent\':\'preview\'','state.ranks=ranksOf(r)','state.posted.monthly[month]=live?\'sent\':\'preview\''])
  assert.equal(src.split(key).length,2,key);
 assert.match(src,/await post\(rookieAlert\(missing\),COMMISSIONER,'commissioner'\);/,'the rookie check stays the awards bot\'s');
 const wf=fs.readFileSync(new URL('../.github/workflows/awards-bot.yml',import.meta.url),'utf8');
 assert.match(wf,/STEVEN_EX_PERT_BOT_TOKEN: \$\{\{ secrets\.STEVEN_EX_PERT_BOT_TOKEN \}\}/);
});
