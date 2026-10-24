import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {weekOf} from '../awards-bot/core.js';
import {pickGuest,VOTED} from '../awards-bot/inside-fbl.js';
import {showData,dealsOf,openingFacts,numbersFacts,quizOf,infirmaryFacts,lawFacts,weekStatements,mikeFacts,guestCandidates,shameNominees,shameFacts,
 RUNDOWN,HOSTS,SCHEMAS,segmentMessages,segmentProblems,writeSegment,segmentCast,quizPoll,guestPoll,shamePolls,shameOfTheYear,latinIn,studioCast,studioLines,writeStudio,blockSteps,splitForInterrupt,interruptText,pollWinner,segmentCaption,segmentText,
 patientLines,dossierLines,showNodes,showTitle,airTime,airEnd,reviewTime,announceTime,GUESTS,MAX_GUESTS,guestById,rundownOf,speaker,kindOf,guestFacts,saidOf,
 guestPool,pickShowGuests,lifeOf,guestCheck,guestWords,announceFacts,announceProblems,announceCaption,writeAnnouncement,announceCast,writeAnnouncePicture,writeSegmentPicture} from '../awards-bot/inside-show.js';
import {weekTableCard,dossierCard,showOpener} from '../awards-bot/show-cards.js';
import {promptProblems} from '../scripts/picture-prompt.mjs';

// A week of lines as the awards bot archives them, each scored by the league formula (week 2: 26.10 – 01.11).
const S=(pts,reb,ast,tov,fgm,fga,pf=2)=>({pts,reb,ast,stl:1,blk:0,tov,fgm,fga,ftm:2,fta:4,pf});
const L=(d,a,n,c,h,s,m=34)=>({d,e:`g${d}${c}`,a,n,c,t:`${d}T23:00Z`,m,p:fblFormula(s),h,b:[],s});
const lines=[
 L('2026-10-20','1','A. Edwards','MIN',[5],S(20,4,4,2,8,16)),
 L('2026-10-26','1','A. Edwards','MIN',[5],S(40,8,6,2,15,27)),L('2026-10-27','1','A. Edwards','MIN',[5],S(30,5,5,3,11,24)),
 L('2026-10-26','2','N. Jokic','DEN',[0],S(28,14,11,4,11,19)),L('2026-10-28','3','T. Young','ATL',[7],S(6,2,4,7,2,15,5)),
 L('2026-10-29','4','C. Flagg','DAL',[2],S(22,9,3,1,9,17)),L('2026-10-30','5','D. Mitchell','CLE',[7],S(18,3,4,2,7,18)),
 L('2026-10-30','7','J. Brunson','NYK',[3],S(12,2,3,5,4,16,6)),L('2026-11-01','7','J. Brunson','NYK',[3],S(8,1,2,4,3,13)),L('2026-10-31','8','S. Barnes','TOR',[4],S(16,8,5,1,6,12)),
 L('2026-10-31','9','L. Ball','CHA',[1],S(9,3,7,3,3,14)),L('2026-10-28','10','J. Green','HOU',[6],S(25,4,2,1,9,19)),
 L('2026-10-31','6','Free Guy','NYK',[],S(35,6,2,1,13,22)),
];
const table=[300,120,200,90,150,410,80,60];
const names={1:'Эдвардс',2:'Йокич',3:'Янг',4:'Флэгг',5:'Митчелл',7:'Брансон',8:'Барнс',9:'Болл',10:'Грин',11:'Нулевой'};
const who=(a,n)=>names[a]||n;
// Database ids d<ESPN id>; a deal of team 5 that stood and one of team 2 undone the same week.
const at='2026-10-27T10:00:00Z';
const transfers=[{team:5,outId:'d1',inId:'d11',date:'2026-10-27',seenAt:at},{team:2,outId:'d4',inId:'d9',date:'2026-10-27',seenAt:at},{team:2,outId:'d9',inId:'d4',date:'2026-10-28',seenAt:'2026-10-28T10:00:00Z'},
 {team:3,outId:'d2',inId:'d7',date:'2026-10-14'}];
const espnOf=id=>String(id).slice(1),nameOf=id=>names[String(id).slice(1)]||String(id);
const week=weekOf('2026-11-01');
const d=showData(lines,week,{table,who,rostered:new Map([['1',[5]],['2',[0]],['3',[7]],['4',[2]],['5',[7]]]),rookies:new Set(['4']),transfers,espnOf,nameOf});

test('Inside FBL show: the table as the league counts it, the places before the week, the week\'s points of the first holder',()=>{
 assert.equal(week.n,2);assert.deepEqual(d.standings.map(x=>x.t),[5,0,2,4,1,3,6,7]);
 const tc=d.standings.find(x=>x.t===5);assert.equal(tc.weekFo,Math.round(lines[1].p+lines[2].p));assert.equal(tc.placeBefore,1);
 const before=table.map((p,t)=>p-d.weekFo[t]);assert.equal(d.standings.find(x=>x.t===4).placeBefore,1+before.filter(p=>p>before[4]).length,'150 minus its week');
 const first=showData(lines,weekOf('2026-10-21'),{table,who,transfers,espnOf,nameOf});
 assert.ok(first.standings.every(x=>x.placeBefore===null),'the first week has nothing before it');
 assert.ok(!('moved' in openingFacts(first).table[0]));
});

test('Inside FBL show: the week\'s deals that stood, in FBL points since; the pre-season\'s free ones are not the week\'s',()=>{
 assert.equal(d.deals.length,1,'a deal undone the same week and an old one are left out');
 const [x]=d.deals;assert.equal(x.team,'Texas 76 Citrus');assert.equal(x.sold.name,'Эдвардс');assert.equal(x.bought.name,'Нулевой');
 assert.equal(x.sold.fo,Math.round(lines[2].p),'the sold player from the deal\'s day on');assert.equal(x.sold.games,1);
 assert.deepEqual(x.bought,{name:'Нулевой',fo:0,games:0},'a player who has not played since');assert.equal(x.difference,x.bought.fo-x.sold.fo);
 assert.deepEqual(dealsOf([{team:1,outId:'d9',inId:'d5',date:'2026-10-27'}],week,lines,{espnOf,nameOf,who}).length,1);
});

test('Inside FBL show: Dildo\'s quiz is the code\'s: four options of the facts, the answer known',()=>{
 for(let n=1;n<=6;n++){const q=quizOf({...d,week:{...week,n}});
  assert.ok(q,`week ${n}`);assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);
  assert.ok(q.correct>=0&&q.correct<4);assert.ok(q.answer.includes(q.options[q.correct].replace(/ \(.*\)$/,'')),`${q.answer} / ${q.options[q.correct]}`);}
 const q=quizOf({...d,week:{...week,n:1}});assert.equal(q.question,'Чья команда собрала больше всех ФО за неделю?');assert.match(q.options[q.correct],/^Texas 76 Citrus \(Лемариус\)$/);
 const p=quizPoll(q,'Ответ: Texas 76 Citrus.');assert.equal(p.type,'quiz');assert.equal(p.correct_option_id,q.correct);assert.match(p.question,/^🧮 Задачка Дилдо: /);
 assert.equal(numbersFacts(d,q).quiz.answer,q.answer);assert.equal(numbersFacts(d,q).deals[0].t,undefined);
});

test('Inside FBL show: the prizes of shame, a player\'s and a GM\'s: a player once, a GM once, each with the league\'s vote',()=>{
 const n=shameNominees(d),pl=n.filter(x=>!x.gmNominee),gms=n.filter(x=>x.gmNominee);
 assert.ok(pl.length>=3&&pl.length<=4);assert.equal(new Set(pl.map(x=>x.a)).size,pl.length);
 assert.ok(gms.length>=2&&gms.length<=4);assert.equal(new Set(gms.map(x=>x.t)).size,gms.length,'a GM once');
 assert.deepEqual(n.map(x=>x.id),n.map((_,i)=>`n${i+1}`));
 assert.equal(n[0].kind,'худший матч недели');assert.equal(n[0].name,'Янг');assert.match(n[0].option,/^Янг — -?\d+ ФО за матч$/);
 const gm=gms[0];assert.equal(gm.name,'Лемариус');assert.equal(gm.kind,'сделка недели наоборот');assert.match(gm.option,/^Лемариус \(Texas 76 Citrus\) — продал Эдвардс, купил Нулевой$/);
 assert.ok(gms.some(x=>x.kind==='худшая неделя лиги'));
 assert.equal(shameNominees(d,{breaches:[7]}).filter(x=>x.gmNominee)[1].kind,'дело Зака Онна','a breach of the rules nominates its GM');
 const f=shameFacts(d,n);assert.equal(f.players.length,pl.length);assert.equal(f.gms.length,gms.length);assert.ok([...f.players,...f.gms].every(x=>!('a' in x)&&!('option' in x)));
 const [pp,gp]=shamePolls(n);assert.equal(pp.key,'shamePlayer');assert.equal(gp.key,'shameGm');assert.match(gp.poll.question,/среди GM/);
 assert.deepEqual(pp.names,pl.map(x=>`player:${x.a}`));assert.deepEqual(gp.names,gms.map(x=>`gm:${x.t}`));assert.ok([...pp.poll.options,...gp.poll.options].every(o=>o.length<=100));
});

test('Inside FBL show: whom the league may send Mike to on Friday, none of the last guests, the long read\'s --guest',()=>{
 const c=guestCandidates(d,['gm:5']);
 assert.ok(c.length>=2&&c.length<=4);assert.ok(!c.some(x=>x.key==='gm:5'),'a guest of the last pieces is not offered');
 const gm=c.find(x=>x.key.startsWith('gm:'));assert.equal(gm.force,`gm:${Number(gm.key.slice(3))+1}`,'--guest counts teams from 1');
 assert.equal(guestPoll(c).options.length,c.length);assert.equal(guestPoll([c[0]]),null);
 const voted=pickGuest({...d,seasonRows:d.seasonRows},[],{force:gm.force,story:VOTED});assert.equal(voted.key,gm.key);assert.equal(voted.story.id,'vote');
 assert.equal(pickGuest(d,[],{force:gm.force}).story.id,'manual');
});

test('Inside FBL show: a stopped poll\'s winner, the first at a tie, none without votes',()=>{
 const poll={options:[{text:'A',voter_count:2},{text:'B',voter_count:5},{text:'C',voter_count:5}]};
 assert.deepEqual(pollWinner(poll,['a','b','c']),{option:'B',key:'b',votes:5,total:12});
 assert.equal(pollWinner({options:[{text:'A',voter_count:0}]}),null);assert.equal(pollWinner(null),null);
});

// Zak Onn's case file: one team with breaches, one in doubt, the rest clean.
const check=(team,{violations=[],whiteState='ok',rookies=[{id:'d4'}]}={})=>({team,violations,whiteState,whites:whiteState==='ok'?[{id:'d2'}]:[],rookies,roster:[],transfers:{}});
const checks=LEAGUE_TEAMS.map((_,t)=>t===7?check(7,{violations:[{rule:'rookie',certain:true,text:'нет новичка'},{rule:'club',club:'NYK',players:['Брансон','Барнс','Грин'],text:'x'}],rookies:[]})
 :t===4?check(4,{violations:[{rule:'white',text:'продан'}],whiteState:'sold'}):check(t));
const law=lawFacts(d,checks,{transfers,today:'2026-11-02',nameOf,announcements:[{day:'27 октября',title:'⚖️ ЗАК ОНН. РЕШЕНИЕ'}],watchlist:[{team:7,since:'2026-10-20'}]});
test('Inside FBL show: Zak\'s case file: the verdicts, the charges, the deals in reserve for the new week, no points',()=>{
 const sh=law.teams[7];assert.equal(sh.verdict,'нарушение');assert.equal(sh.watched,true);assert.equal(sh.rookieRule,'нарушено');
 assert.deepEqual(sh.charges.map(c=>[c.rule,c.sure]),[['правило новичка',true],['не больше двух игроков одного клуба НБА',true]]);assert.match(sh.charges[1].detail,/^NYK: Брансон/);
 assert.equal(law.teams[4].verdict,'под проверкой');assert.match(law.teams[4].whiteRule,/под вопросом/);
 assert.equal(law.teams[5].lastWeek.transfers,1);assert.deepEqual(law.teams[5].lastWeek.deals,['Эдвардс → Нулевой']);assert.equal(law.teams[5].newWeek.transfersLeft,3);
 assert.equal(law.newWeek.opens,'2 ноября');assert.equal(law.newWeek.hours,'08:00–22:00 МСК');
 assert.doesNotMatch(JSON.stringify(law),/ФО|fo"|points/,'the law is his business, the game is not');
 const lines=dossierLines(law);assert.equal(lines.length,8);assert.match(lines[7],/🍬 <b>Shugars Team<\/b> 🎯 — 🚨 нарушение/);assert.match(lines[7],/новичок: 🚫/);
 assert.deepEqual(weekStatements([{name:'2026-10-27-x.html',text:'<b>⚖️ РЕШЕНИЕ</b>\nтекст {@lawyer}'},{name:'2026-10-20-old.html',text:'old'},{name:'notes.txt',text:''}],week,'2026-11-02'),[{day:'27 октября',title:'⚖️ РЕШЕНИЕ'}]);
});

test('Inside FBL show: Trevor\'s round: the patients as ESPN has them, the games they missed last week',()=>{
 const f=infirmaryFacts(d,[{espnId:'2',name:'Йокич',en:'N. Jokic',club:'DEN',fblTeams:[{team:'The Balkan Murderers',gm:'Franky Murder'}],status:'Не играет',out:true,until:'до ~05.11',where:'колено',what:'ушиб',commentEn:'x',bodyPartEn:'Knee'}]);
 assert.deepEqual([f.patients[0].clubGamesLastWeek,f.patients[0].playedLastWeek],[1,1]);assert.ok(!('espnId' in f.patients[0])&&!('commentEn' in f.patients[0]));
 assert.deepEqual(f.teamsHit,[{team:'The Balkan Murderers',patients:1}]);
 assert.match(patientLines(f)[0],/^🔴 <b>Йокич<\/b> \(DEN\) — не играет, до ~05\.11 · колено, ушиб · сыграл 1 из 1\n   The Balkan Murderers$/);
 assert.equal(infirmaryFacts(d,[]).empty,true);
});

test('Inside FBL show: Mike after his long read: the guest on Friday and after Sunday, the best and the worst of the week',()=>{
 const lr={entry:{status:'sent',title:'Лимоны',guest:{key:'gm:5'}},facts:{guest:{kind:'GM',name:'Лемариус',team:'Texas 76 Citrus',place:2,points:250,gapToLeader:10},
  table:[{place:1,team:'The Balkan Murderers',points:260},{place:2,team:'Texas 76 Citrus',points:250}]}};
 const m=mikeFacts(d,{longread:lr,candidates:[{label:'A'},{label:'B'}]});
 assert.deepEqual(m.afterLongread.onFriday,{place:2,points:250,gapToLeader:10});assert.deepEqual(m.afterLongread.afterSunday,{place:1,points:410,gapToLeader:0});
 assert.deepEqual(m.afterLongread.table[1],{team:'Texas 76 Citrus',placeOnFriday:2,pointsOnFriday:250,placeNow:1,pointsNow:410});
 assert.equal(m.bestOfTheWeek.name,'Эдвардс');assert.equal(m.bestOfTheWeek.games,2);assert.deepEqual(m.nextFridayVote,['A','B']);
 assert.equal(mikeFacts(d,{longread:{entry:{status:'page'},facts:lr.facts}}).afterLongread,null,'a piece not sent is not his to talk about');
});

// What each host's block looks like as Claude answers it.
const para=t=>`${t} `.repeat(12).trim();
const blocks={
 opening:{title:'Неделя лимонов',paragraphs:[para('Добрый вечер, лига, Texas 76 Citrus снова наверху.'),para('В студии сегодня все.')],handoff:'Кристофер, покажи им цифры.'},
 numbers:{title:'Цифры не врут',paragraphs:[para('Выборка недели смеётся над вами.'),para('Медиана плачет.'),para('Сделка Лемариуса — выброс.')],quizLine:'Решите задачку, если умеете считать.',quizExplanation:'Texas 76 Citrus. Очевидно.',handoff:'Тревор, твой лазарет.'},
 law:{title:'Дело недели',paragraphs:[para('Зак Онн открыл дело Shugars Team.'),para('Новая неделя, новые сделки.')],verdict:'Закон не спит.',handoff:'Майк, микрофон твой.'},
};
test('Inside FBL show: a block is checked: its numbers, its handoff by name, Zak\'s words of a case, Steven\'s prizes one by one',()=>{
 const f=openingFacts(d);
 assert.deepEqual(segmentProblems('opening',blocks.opening,f),[]);
 assert.match(segmentProblems('opening',{...blocks.opening,paragraphs:[...blocks.opening.paragraphs,'Сорок два раза подряд.']},f).join(),/числа не из данных: 42/);
 assert.match(segmentProblems('opening',{...blocks.opening,handoff:'Дальше — цифры.'},f).join(),/по имени передать слово: Кристофер Дилдо/);
 assert.match(segmentProblems('opening',{...blocks.opening,paragraphs:['Коротко.']},f).join(),/слишком коротко/);
 assert.deepEqual(segmentProblems('opening',{title:'x'},f),['ответ не по схеме']);
 assert.deepEqual(segmentProblems('law',blocks.law,law),[]);
 for(const w of ['карточки','базе данных','бота','коде','реестре'])
  assert.match(segmentProblems('law',{...blocks.law,verdict:`Зак Онн нашёл это в ${w}.`},law).join(),/говорит о технике/,w);
 assert.deepEqual(segmentProblems('law',{...blocks.law,verdict:'Зак Онн изучил кодекс и работу.'},law),[],'a word that only begins like one is his');
 assert.match(segmentProblems('law',{...blocks.law,verdict:'Мне плевать на ФО.'},law).join(),/не дело Зака Онна/);
 const n=shameNominees(d),sf=shameFacts(d,n),prizes=n.map(x=>({nominee:x.id,prize:'Золотой кирпич',line:'Без комментариев, только позор.'}));
 const shame={title:'Позор',paragraphs:[para('Церемония открыта, лига, и сегодня позор раздаём щедро.')],prizes,pollLine:'Голосуйте!',farewell:'До понедельника, в пятницу — лонгрид Майка.',handoff:''};
 assert.deepEqual(segmentProblems('shame',shame,sf,{nominees:n}),[]);
 assert.match(segmentProblems('shame',{...shame,prizes:prizes.slice(1)},sf,{nominees:n}).join(),/ровно по одному на номинанта/);
 assert.match(segmentProblems('numbers',{...blocks.numbers,quizExplanation:'a'.repeat(191)},numbersFacts(d)).join(),/quizExplanation/);
});

test('Inside FBL show: each host speaks with the show and his own voice, handed the word by the one before',()=>{
 const {system,prompt}=segmentMessages('law',law,{handedOver:'Зак, твой выход.'});
 assert.match(system,/Inside FBL — главный журнал/);assert.match(system,/Ты — Зак Онн/);assert.match(system,/ни карточек, ни номеров, ни реестров, ни баз, ни ботов/);
 assert.match(prompt,/handedOver: «Зак, твой выход\.»/);assert.match(prompt,/next: Майк Роффон/);
 assert.match(segmentMessages('shame',{},{}).prompt,/next: — \(ты закрываешь выпуск\)/);
 assert.match(segmentMessages('opening',{},{notes:'больше про лимоны'}).prompt,/Пожелания редакции к этому выпуску \(учти их, правила выше важнее\): больше про лимоны$/);
 assert.deepEqual(RUNDOWN.map(s=>s.host),['steven','dildo','trevor','zak','mike','steven']);
 for(const s of RUNDOWN)assert.ok(SCHEMAS[s.key].required.includes('handoff'));
});

test('Inside FBL show: a block with problems goes back to be fixed, and is left out when it stays wrong',async()=>{
 const f=openingFacts(d),calls=[],claude=answers=>async o=>{calls.push(o);return {data:answers[Math.min(calls.length-1,answers.length-1)]};};
 const bad={...blocks.opening,handoff:'Дальше без имён.'};
 const fixed=await writeSegment('opening',f,{claude:claude([bad,blocks.opening]),log:()=>{}});
 assert.deepEqual(fixed.problems,[]);assert.equal(fixed.tries,2);assert.match(calls[1].prompt,/Исправь только эти места/);assert.equal(calls[1].schema,SCHEMAS.opening);
 calls.length=0;const stuck=await writeSegment('opening',f,{claude:claude([bad]),log:()=>{}});
 assert.equal(calls.length,3);assert.ok(stuck.problems.length);
});

test('Inside FBL show: on air: the captions, the texts with the code\'s lines, each signed by its host',()=>{
 const cap=segmentCaption('opening',blocks.opening,week);
 assert.match(cap,/^<b>🎙 Inside FBL • Выпуск 2<\/b>\n<b>Неделя лимонов<\/b>/);assert.match(cap,/В студии: Стивен Экс Перт, Кристофер Дилдо, Тревор Матолог, Зак Онн, Майк Роффон\./);assert.match(cap,/#inside_fbl #неделя_2$/);
 assert.match(segmentCaption('law',blocks.law,week),/^<b>⚖️ Inside FBL • Закон и порядок<\/b>\nЗак Онн, главная буква закона лиги\n\n#inside_fbl #неделя_2 #закон_и_порядок$/);
 const t=segmentText('law',blocks.law,law);
 assert.match(t,/<b>📁 Досье на новую неделю<\/b>/);assert.match(t,/⚖️ <b>Закон не спит\.<\/b>/);assert.match(t,/🎙 <i>Майк, микрофон твой\.<\/i>/);assert.ok(t.endsWith(HOSTS.zak.sign));
 const n=shameNominees(d),year={players:[{name:'Янг',wins:2}],gms:[{name:'Jack Pott',wins:1}]},s=segmentText('shame',{title:'Позор',paragraphs:['Начали.'],prizes:n.map(x=>({nominee:x.id,prize:'«Кирпич»',line:'Ох.'})),pollLine:'Голосуйте.',farewell:'Пока.',handoff:''},shameFacts(d,n,{year}),{nominees:n});
 assert.match(s,/<b>🧍 Игроки<\/b>\n\n🏆 <b>Приз «Кирпич»<\/b> — <b>Янг<\/b>: -?\d+ ФО за матч\nОх\./);assert.match(s,/<b>👔 GM<\/b>\n\n🏆 <b>Приз «Кирпич»<\/b> — <b>GM Лемариус<\/b> \(Texas 76 Citrus\)/);
 assert.match(s,/<b>📈 Гонка за «Позор года»<\/b>\nИгроки: Янг — 2\nGM: Jack Pott — 1/);assert.doesNotMatch(s,/🎙 <i>/);
 const fin=segmentText('shame',{title:'Позор',paragraphs:['Финал.'],prizes:[],pollLine:'',farewell:'До сезона.',handoff:''},shameFacts(d,n,{year,seasonFinal:true}),{nominees:n});
 assert.match(fin,/<b>👑 Позор года<\/b>\nИгрок: <b>Янг<\/b> \(2\)\nGM: <b>Jack Pott<\/b> \(1\)/);
 const m=mikeFacts(d,{}),mt=segmentText('mike',{title:'Т',afterLongread:['В пятницу снова в гости.'],best:{prologue:'П.',qa:[{q:'В?',a:'О.'}],remark:''},worst:{prologue:'П2.',qa:[{q:'В2?',a:'О2.'}],remark:'Штамп.'},pollLine:'Голосуйте, куда мне ехать.',handoff:'Стивен, твой позор.'},m);
 assert.match(mt,/<b>🎤 Флеш-интервью: лучший игрок недели, \d+ ФО — Эдвардс<\/b>/);assert.match(mt,/<b>Майк Роффон\.<\/b> В2\?\n<b>Брансон\.<\/b> О2\./);
 assert.match(mt,/<i>Интервью вымышленные: цифры настоящие, слова — нет\.<\/i>/);assert.match(mt,/<i>Майк Роффон: Штамп\.<\/i>/);
 assert.doesNotMatch(segmentText('opening',{...blocks.opening,title:'<x>'},{}),/<x>/,'Claude\'s words are escaped');
});

test('Inside FBL show: the hosts in its pictures: the five at the round table, what never changes about each',()=>{
 const c=segmentCast('opening',{d});
 assert.equal(c.refs.length,7);assert.match(c.list[6].is,/Inside FBL studio and its five hosts/);assert.ok(!c.list[6].mustUse,'the studio photo is Claude\'s to use');assert.deepEqual(c.list.filter(r=>r.mustUse).length,5);
 const all=c.list.map((r,i)=>`the person from reference image ${i+1}`).join(', ');
 const p=promptProblems(`A TV studio round table: ${all}. ${'Detailed scene. '.repeat(10)}`,c);
 for(const w of ['God Bless America','white gloves','microphone','neck brace','cast','glasses','notebook'])assert.ok(p.some(x=>x.includes(`"${w}"`)),w);
 const zak=segmentCast('law',{d,facts:law});assert.equal(zak.refs[0].is,'the photo of Zak Onn, the league lawyer');assert.ok(zak.refs.length>=2,'the suspects\' GMs');
 assert.equal(segmentCast('mike',{d}).refs.length,1,'no faces: only Mike');
});

test('Inside FBL show: its page on Telegraph, its Monday: the owner\'s preview at 09:00, the announcement at 12:00, the show at 18:00 Moscow',()=>{
 const nodes=showNodes(week,[{key:'opening',title:'Неделя',text:segmentText('opening',blocks.opening,{}),picture:'https://x/1.jpg',cards:[],polls:[]},
  {key:'numbers',title:'Цифры',text:segmentText('numbers',blocks.numbers,{}),picture:null,cards:['https://x/c.png'],polls:[quizPoll(quizOf(d),'')]},
  {key:'law',title:'Дело',text:segmentText('law',blocks.law,law),picture:null,cards:[],polls:[]}]);
 assert.equal(nodes.filter(n=>n.tag==='h3').length,3);assert.equal(nodes.filter(n=>n.tag==='figure').length,2);
 assert.ok(nodes.some(n=>n.tag==='blockquote'&&/Голосование — в чате лиги/.test(n.children[0])));
 assert.ok(nodes.some(n=>n.tag==='p'&&n.children.some(c=>c.tag==='br')),'line breaks within a paragraph');
 assert.doesNotMatch(JSON.stringify(nodes),/<b>|&lt;/);
 assert.equal(showTitle(week,blocks.opening),'Inside FBL — выпуск 2: Неделя лимонов');
 assert.equal(new Date(reviewTime(week)).toISOString(),'2026-11-02T06:00:00.000Z');assert.equal(new Date(announceTime(week)).toISOString(),'2026-11-02T09:00:00.000Z');
 assert.equal(new Date(airTime(week)).toISOString(),'2026-11-02T15:00:00.000Z');assert.equal(new Date(airEnd(week)).toISOString(),'2026-11-02T20:59:00.000Z');
});

test('Inside FBL show: the cards: Dildo\'s table of the week, Zak\'s case file without a point in it, the opener',()=>{
 const look={logo:()=>null,emoji:e=>e},fonts={manrope:'',oswald:''};
 const t=weekTableCard(week,numbersFacts(d),look,fonts);
 assert.match(t,/ЦИФРЫ НЕДЕЛИ|Цифры недели/);assert.ok(LEAGUE_TEAMS.every(x=>t.includes(x.name.replace(/\./g,'.'))));assert.match(t,/ФО ЗА НЕДЕЛЮ/);
 const z=dossierCard(week,law,look,fonts);
 assert.match(z,/Досье на неделю/);assert.match(z,/НАРУШЕНИЕ/);assert.match(z,/ПРОВЕРКА/);assert.match(z,/СДЕЛКИ 3 ИЗ 3/);assert.doesNotMatch(z,/ФО/);
 assert.match(showOpener(week,look,fonts),/Выпуск 2/);
});

// --- The special guests (owner, 24.10.2026): living NBA legends and coaches, at most two an issue.
const shaq=guestById('shaq'),pop=guestById('pop');
test('Inside FBL show: the guests\' list: legends and coaches, each with his manner and how the hosts call him',()=>{
 assert.ok(GUESTS.length>=40);assert.equal(new Set(GUESTS.map(g=>g.id)).size,GUESTS.length);
 for(const g of GUESTS){assert.ok(['legend','coach'].includes(g.kind),g.id);assert.ok(g.style.length>80&&g.known&&g.wiki&&g.en&&g.calls?.length,g.id);}
 assert.ok(GUESTS.some(g=>g.kind==='coach'));assert.equal(MAX_GUESTS,2);
 for(const gone of ['Bill Walton','Dikembe Mutombo','Jerry Sloan','Lenny Wilkens','Kobe Bryant','Jerry West'])assert.ok(!GUESTS.some(g=>g.en===gone),`${gone} is not alive`);
});
test('Inside FBL show: the guests sit after Mike and before the prizes of shame, the host gives them the word',()=>{
 assert.deepEqual(rundownOf([shaq,pop]).map(s=>s.key),['opening','numbers','infirmary','law','mike','guest1','guest2','shame']);
 assert.deepEqual(rundownOf([shaq,pop,guestById('kg')||guestById('garnett')]).filter(s=>s.guest).length,2,'never more than two');
 assert.deepEqual(rundownOf().map(s=>s.key),RUNDOWN.map(s=>s.key));
 const g=rundownOf([shaq])[5];assert.equal(g.host,'steven');assert.equal(kindOf(g.key),'guest');
 assert.deepEqual(speaker(g).calls,['Шак','Шакил',"Шакил О'Нил"]);assert.equal(speaker(g).sign,"— Шакил О'Нил, гость студии Inside FBL");
 const m=segmentMessages('mike',{},{guests:[shaq]});assert.match(m.prompt,/next: Шакил О'Нил \(Гость студии: Шакил О'Нил\)/);assert.match(m.prompt,/studioGuests: Шакил О'Нил \(легенда НБА\)/);
 const gm=segmentMessages('guest1',{},{guests:[shaq]});assert.match(gm.system,/Ты — Шакил О'Нил \(Shaquille O'Neal\), легенда НБА/);assert.match(gm.system,/Сохраняй свой стиль повествования/);assert.match(gm.prompt,/next: Стивен Экс Перт/);
 const o=openingFacts(d,{guests:[shaq]});assert.equal(o.studioGuests[0].name,"Шакил О'Нил");assert.ok(o.rundown.some(r=>r.host==="Шакил О'Нил"));
});
test('Inside FBL show: a guest\'s block: the week of our league and what the hosts said, his handoff by name',()=>{
 const said=[saidOf('opening',blocks.opening,[shaq])];assert.equal(said[0].host,'Стивен Экс Перт');
 const f=guestFacts(d,{said});assert.equal(f.heroOfTheWeek.name,'Эдвардс');assert.equal(f.saidInTheStudio[0].title,'Неделя лимонов');
 const x={title:'Шак не прощает кирпичей',paragraphs:[para('Шак видел многое, но такой недели не видел никто, лига.'),para('Texas 76 Citrus — вот кто играет как большой.')],handoff:'Стивен, держи микрофон, Шак всё сказал.'};
 assert.deepEqual(segmentProblems('guest1',x,f,{guests:[shaq]}),[]);
 assert.match(segmentProblems('guest1',{...x,handoff:'Всё.'},f,{guests:[shaq]}).join(),/по имени передать слово: Стивен Экс Перт/);
 assert.deepEqual(segmentProblems('mike',{title:'Т',afterLongread:[para('Майк в студии и всё видел своими глазами.')],best:{prologue:para('Пролог.'),qa:[{q:'В?',a:'О.'},{q:'В?',a:'О.'}],remark:''},worst:{prologue:'П',qa:[{q:'В?',a:'О.'},{q:'В?',a:'О.'}],remark:''},pollLine:'',handoff:'Шак, твой выход.'},mikeFacts(d,{}),{guests:[shaq]}).filter(p=>/handoff/.test(p)),[],'Mike hands the word to the guest');
 const t=segmentText('guest1',x,f,{guests:[shaq]});assert.match(t,/^<b>🌟 Гость студии: Шакил О'Нил<\/b>/);assert.match(t,/Слова гостя вымышлены/);assert.ok(t.endsWith("— Шакил О'Нил, гость студии Inside FBL"));
 assert.match(segmentCaption('guest1',x,week,{guests:[shaq]}),/^<b>🌟 Inside FBL • Гость студии: Шакил О'Нил<\/b>\nШакил О'Нил, легенда НБА, гость студии/);
 assert.match(segmentCaption('opening',blocks.opening,week,{guests:[shaq,pop]}),/🌟 Гости студии: Шакил О'Нил, Грегг Попович\./);
 const img={bytes:Buffer.from('x'),name:'g.jpg',type:'image/jpeg'};
 const c=segmentCast('guest1',{d,guests:[shaq],guestFaces:new Map([['shaq',img]])});assert.match(c.list[0].is,/Shaquille O'Neal, the NBA legend/);assert.equal(c.list[0].mustUse,true);
 assert.equal(segmentCast('guest1',{d,guests:[pop]}).list.filter(r=>r.mustUse).length,0,'no photo: no face to keep');
});
test('Inside FBL show: the guests are chosen by Claude from the list, none of the last weeks, by hand first',async()=>{
 const calls=[],claude=data=>async o=>{calls.push(o);return {data};};
 assert.deepEqual((await pickShowGuests({},{claude:claude({guests:[{id:'shaq',why:'центровые'},{id:'pop',why:'GM'}]}),log:()=>{}})).map(g=>g.id),['shaq','pop']);
 assert.match(calls[0].system,/живых легенд НБА и легендарных тренеров, не больше двух/);
 assert.deepEqual((await pickShowGuests({},{recent:['shaq'],claude:claude({guests:[{id:'shaq',why:''},{id:'nobody',why:''}]}),log:()=>{}})).map(g=>g.id),[guestPool(['shaq'])[0].id],'a recent or unknown guest is not taken');
 assert.ok(!JSON.stringify(calls.at(-1).prompt).includes('"id": "shaq"'),'a recent guest is not offered');
 assert.deepEqual((await pickShowGuests({},{force:['pop','shaq','iverson'],claude:()=>{throw Error('no');}})).map(g=>g.id),['pop','shaq']);
 assert.equal((await pickShowGuests({},{claude:async()=>{throw Error('down');},n:3,log:()=>{}}))[0].id,GUESTS[2].id);
});
test('Inside FBL show: a guest is alive by Wikipedia, his photo from there when ESPN has none',async()=>{
 assert.equal(lifeOf({description:'American basketball player (born 1976)'}),true);
 assert.equal(lifeOf({description:'American basketball player and coach (1937–2025)'}),false);
 assert.equal(lifeOf({description:'American basketball coach',extract:'Larry Brown (born September 14, 1940) is an American basketball coach.'}),true);
 assert.equal(lifeOf({description:'',extract:'John Doe (May 1, 1950 – June 2, 2025) was an American basketball player.'}),false);
 assert.equal(lifeOf({}),null);
 const at=[];const fetchImpl=async u=>{at.push(u);return {ok:true,json:async()=>({description:'(born 1972)',thumbnail:{source:'https://upload/s.jpg'}})};};
 assert.deepEqual(await guestCheck(shaq,{fetchImpl}),{alive:true,photo:'https://upload/s.jpg'});assert.match(at[0],/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Shaquille_O'Neal/);
 assert.deepEqual(await guestCheck(shaq,{fetchImpl:async()=>{throw Error('offline');}}),{alive:null,photo:null},'Wikipedia down: the list is trusted');
});
test('Inside FBL show: the announcement at 12:00: the topics, the secret guests never named, in its words or its picture',async()=>{
 const segs=[{key:'opening',x:blocks.opening},{key:'numbers',x:blocks.numbers}],f=announceFacts(week,{segments:segs,guests:[shaq],holiday:{name:'Хэллоуин'}});
 assert.equal(f.holiday,'Хэллоуин');assert.equal(f.blocks[1].host,'Кристофер Дилдо');assert.equal(f.secretGuests[0].realName,"Шакил О'Нил");
 const x={title:'Сегодня студия трещит по швам',topics:['Лимоны держат вершину.','Дилдо нашёл выброс.','Позор недели уже отлит.'],guestHints:['Самый большой человек в истории студии, и штрафные ему не друзья.'],teaser:'В 18:00 — все к экранам.'};
 assert.deepEqual(announceProblems(x,f,[shaq],week),[]);
 assert.match(announceProblems({...x,guestHints:['Шаку есть что сказать.']},f,[shaq],week).join(),/гости секретные.*Шак/);
 assert.match(announceProblems({...x,topics:[...x.topics,"Shaquille O'Neal в студии"]},f,[shaq],week).join(),/гости секретные/);
 assert.match(announceProblems({...x,guestHints:[]},f,[shaq],week).join(),/ровно по одной загадке/);
 assert.match(announceProblems({...x,teaser:'Ровно 777 причин смотреть.'},f,[shaq],week).join(),/числа не из данных: 777/);
 assert.ok(!guestWords([pop]).some(w=>w.length<3));assert.ok(guestWords([pop]).includes('Поп'));
 const cap=announceCaption(x,week,[shaq]);
 assert.match(cap,/^<b>🎙 Inside FBL • Анонс выпуска 2<\/b>/);assert.match(cap,/Сегодня в 18:00 по Москве/);assert.match(cap,/<b>🕵️ Секретный гость студии:<\/b>\n• Самый большой/);assert.match(cap,/#inside_fbl #неделя_2 #анонс$/);
 assert.match(announceCaption(x,week,[]),/^(?![\s\S]*Секретн)/);
 const calls=[];const fixed=await writeAnnouncement(f,[shaq],week,{claude:async o=>{calls.push(o);return {data:calls.length===1?{...x,guestHints:['Это Шак.']}:x};},log:()=>{}});
 assert.deepEqual(fixed.problems,[]);assert.equal(fixed.tries,2);assert.match(calls[0].system,/НИКОГДА не его имя/);
 // Its picture: the five hosts, the guests only hinted; a prompt that names one goes back.
 const c=announceCast();assert.equal(c.list.filter(r=>r.mustUse).length,5);
 const hosts=c.list.map((r,i)=>`the person from reference image ${i+1}`).join(', ');
 const good=`Behind the scenes of a studio recording, LEGO-minifigure style: ${hosts}; Zak in his red cap "God Bless America", Mike's white gloves and microphone, Trevor's neck brace and cast, Dildo's glasses and notebook; two guests hidden under black sheets, a giant size sneaker and a free-throw chart beside one of them. No other text.`;
 const prompts=[];const pic=await writeAnnouncePicture(x,f,c,{guests:[shaq],recent:['old idea'],claude:async o=>{prompts.push(o);return {data:{prompt:prompts.length===1?good.replace('two guests',"Shaquille O'Neal and a guest"):good,idea:'lego'}};},log:()=>{}});
 assert.ok(pic);assert.equal(prompts.length,2);assert.match(prompts[1].prompt,/the guests are secret: never name them/);assert.match(prompts[0].prompt,/old idea/);
 assert.match(prompts[0].system,/фигурками LEGO/);assert.match(prompts[0].system,/Никогда не называй гостей в промпте/);
});

test('Inside FBL show: the prizes of shame of the year: the weeks\' winners counted, the season\'s last show gives them',()=>{
 const y=shameOfTheYear([{player:{key:'Янг'},gm:{key:'Jack Pott'}},{player:{key:'Уилсон'},gm:{key:'Jack Pott'}},{player:{key:'Янг'},gm:null},null]);
 assert.deepEqual(y,{players:[{name:'Янг',wins:2},{name:'Уилсон',wins:1}],gms:[{name:'Jack Pott',wins:1}].map(x=>({...x,wins:2}))});
 const f=shameFacts(d,shameNominees(d),{year:y,seasonFinal:true});assert.deepEqual(f.seasonFinal.player,[{name:'Янг',wins:2}]);assert.match(f.nextShow,/последний выпуск сезона/);
 assert.equal(shameFacts(d,[]).seasonFinal,undefined,'not the last week');
});
test('Inside FBL show: only Russian: Latin words other than the data\'s own go back, the English slang in Russian letters',()=>{
 const f=openingFacts(d);
 assert.deepEqual(latinIn('Сабонис из SAC, Texas 76 Citrus и GM Jack Pott, лидер MVP в FBL.',{...f,x:'SAC Texas 76 Citrus Jack Pott'}),[]);
 assert.deepEqual(latinIn('Glass мой, double-double идёт, это налог на usage.',f),['glass','double','usage']);
 assert.match(segmentProblems('opening',{...blocks.opening,paragraphs:[...blocks.opening.paragraphs,'Это чистый usage, bro.']},f).join(),/латиница не из данных: usage, bro — пиши по-русски.*юзадж/);
 assert.deepEqual(segmentProblems('opening',{...blocks.opening,paragraphs:[...blocks.opening.paragraphs,'Это чистый хай-юзадж шутер.']},f),[]);
 assert.match(segmentMessages('mike',{}).system,/английские словечки — только русскими буквами/);assert.match(segmentMessages('numbers',{}).system,/Только по-русски/);
});
test('Inside FBL show: the live studio: an interruption mid-block, lines from the desk, the answers, each from its own bot',()=>{
 const shaq=guestById('shaq'),segs=[{key:'numbers',host:'dildo',x:blocks.numbers},{key:'law',host:'zak',x:blocks.law},{key:'guest1',host:'steven',x:{title:'Шак',paragraphs:['Раз.','Два.'],handoff:''}}];
 const facts={numbers:numbersFacts(d),law};
 assert.deepEqual(studioCast([shaq]).map(p=>[p.who,p.bot]),[['steven','steven'],['dildo','dildo'],['trevor','trevor'],['zak','zak'],['mike','mike'],['guest1','steven']]);
 const raw={blocks:[
  {key:'numbers',interrupt:{after:1,who:'zak',line:'Зак Онн изымает эту таблицу как улику.',comeback:'Зак, улики считаю я.'},reactions:[{who:'trevor',line:'Кристофер, твоя медиана хромает *ик*.',answer:'Зато не на голеностоп.'},{who:'numbers',line:'сам себе',answer:''}]},
  {key:'law',interrupt:{after:1,who:'zak',line:'Сам себя перебиваю.',comeback:'—'},reactions:[{who:'guest1',line:'Шак видел законы и посерьёзнее.',answer:'Зак Онн видел Шака.'},{who:'mike',line:'Сорок два свидетеля, Зак.',answer:''}]},
  {key:'guest1',interrupt:{after:1,who:'mike',line:'Шак, а штрафные?',comeback:'Майк, не начинай.'},reactions:[{who:'zak',line:'Зак Онн нашёл это в базе данных.',answer:''}]}]};
 const st=studioLines(raw,segs,facts,[shaq]);
 assert.deepEqual(st.numbers.interrupt,{after:1,who:'zak',line:'Зак Онн изымает эту таблицу как улику.',comeback:'Зак, улики считаю я.'});
 assert.equal(st.numbers.reactions.length,1,'nobody answers from his own block');assert.equal(st.law.interrupt,null,'a host never interrupts himself');
 assert.deepEqual(st.law.reactions.map(r=>r.who),['guest1'],'a number not of the show is left out');
 assert.equal(st.guest1.reactions.length,0,'Zak never speaks of machines');assert.equal(st.guest1.interrupt.who,'mike');
 const text=segmentText('numbers',blocks.numbers,facts.numbers),steps=blockSteps({key:'numbers',host:'dildo',text,x:blocks.numbers,studio:st.numbers,polls:[{key:'numbers',poll:{question:'Q',options:['a','b']},names:[]}]});
 assert.deepEqual(steps.map(x=>x.by),['dildo','zak','dildo','trevor','dildo','dildo']);
 assert.ok(steps[0].text.endsWith(blocks.numbers.paragraphs[0].trim()));assert.match(steps[1].text,/^⚡️ <b>Зак Онн<\/b> перебивает:\nЗак Онн изымает/);
 assert.match(steps[2].text,/^<i>Зак, улики считаю я\.<\/i>\n\n/);assert.ok(steps[2].main);assert.ok(steps[2].text.endsWith(HOSTS.dildo.sign));
 assert.match(steps[3].text,/^💬 <b>Тревор Матолог:<\/b> Кристофер, твоя медиана/);assert.match(steps[4].text,/^↩️ <b>Кристофер Дилдо:<\/b> Зато не на голеностоп\./);assert.ok(steps[5].poll);
 const g=blockSteps({key:'guest1',host:'steven',text:segmentText('guest1',segs[2].x,{}, {guests:[shaq]}),x:segs[2].x,studio:st.guest1,guests:[shaq]});
 assert.deepEqual(g.map(x=>x.by),['steven','mike','steven'],'a guest speaks through the host\'s bot');assert.match(g[2].text,/^<i>Майк, не начинай\.<\/i>/);
 assert.deepEqual(blockSteps({key:'law',host:'zak',text:'x',x:blocks.law}).map(x=>x.by),['zak'],'no studio: the block as it is');
 const nodes=showNodes(week,[{key:'numbers',title:'Цифры',text,steps,picture:null,cards:[]}]);
 assert.ok(nodes.filter(n=>n.tag==='blockquote').length>=4,'the studio\'s lines and the poll as quotes on the page');
});
test('Inside FBL show: the studio is written in one pass over the show, and the show goes on without it',async()=>{
 const calls=[];const r=await writeStudio([{key:'law',host:'zak',x:blocks.law}],{law},{claude:async o=>{calls.push(o);return {data:{blocks:[{key:'law',interrupt:{after:1,who:'dildo',line:'Зак, а по формуле?',comeback:'Формулы Зак Онн оставляет присяжным.'},reactions:[]}]}};}});
 assert.equal(r.law.interrupt.who,'dildo');assert.match(calls[0].system,/перебивают друг друга, подкалывают чужие оценки и выбор, добавляют трэш-ток/);assert.match(calls[0].prompt,/"speaker": "zak"/);
 assert.deepEqual(await writeStudio([],{},{claude:async()=>{throw Error('down');},log:()=>{}}),{});
});
test('Inside FBL show: at 18:00 the guests sit at the desk on the cover; the show ends with its closing picture',async()=>{
 const m=await import('../awards-bot/inside-show.js'),shaq=guestById('shaq'),pop=guestById('pop'),img={bytes:Buffer.from('x'),name:'g.jpg',type:'image/jpeg'};
 const c=segmentCast('opening',{d,guests:[shaq,pop],guestFaces:new Map([['shaq',img]])});
 assert.equal(c.refs.length,8,'the five, the logo, the studio and the guest with a photo');assert.match(c.list[7].is,/Shaquille O'Neal, the NBA legend, a special guest/);assert.equal(c.list[7].mustUse,true);
 assert.equal(m.announceCast().refs.length,7,'the announcement keeps them secret');
 assert.equal(segmentCast('closing',{d,guests:[shaq],guestFaces:new Map([['shaq',img]])}).refs.length,8);
 const hosts=c.list.map((r,i)=>`the person from reference image ${i+1}`).join(', '),calls=[];
 const good=`The studio after the broadcast: ${hosts}; Zak in his red cap "God Bless America", Mike's white gloves and microphone, Trevor's neck brace and cast, Dildo's glasses and notebook. The lights dim. No other text.`;
 const pic=await m.writeClosingPicture([{key:'opening',x:blocks.opening}],{opening:openingFacts(d)},c,{guests:[shaq],claude:async o=>{calls.push(o);return {data:{prompt:good,idea:'lights out'}};},log:()=>{}});
 assert.ok(pic);assert.match(calls[0].system,/Закрывающая картинка выпуска/);assert.match(calls[0].prompt,/Выпуск, который только что закончился/);
 assert.match(m.closingCaption(week,[shaq,pop]),/^<b>🎬 Inside FBL • Конец выпуска 2<\/b>\nЭфир окончен\. Спасибо гостям студии — Шакил О'Нил и Грегг Попович — и всей лиге\./);
 assert.doesNotMatch(m.closingCaption(week),/гостям/);
 const nodes=showNodes(week,[{key:'closing',picture:'https://x/end.jpg',steps:[]}]);assert.equal(nodes.at(-2).tag,'figure');
 const seen=[];await writeSegmentPicture('opening',blocks.opening,openingFacts(d,{guests:[shaq]}),c,{guests:[shaq],claude:async o=>{seen.push(o);return {data:{prompt:good,idea:'x'}};},log:()=>{}});
 assert.match(seen[0].system,/они за столом вместе с ведущими/);
});

test('Inside FBL show: the votes closed together, told to the league in one message',async()=>{
 const {votesSummary}=await import('../awards-bot/inside-show.js');
 const q={question:'Q',options:[{text:'Karagali Brothers (Фы Жил)',voter_count:1},{text:'Texas 76 Citrus (Лемариус)',voter_count:3}],total_voter_count:4,correct_option_id:1};
 const t=votesSummary(week,{numbers:{result:{option:'Texas 76 Citrus (Лемариус)',votes:3,total:4},poll:q},
  mike:{result:{option:'Franky Murder (The Balkan Murderers) — худшая неделя',key:'gm:1',votes:2,total:3},poll:null},
  shamePlayer:{result:{option:'Эдвардс — 18 промахов с игры',votes:1,total:1},poll:null},shameGm:{result:null,poll:null}});
 assert.match(t,/^🗳 <b>Inside FBL • Итоги голосований выпуска 2<\/b>\n\n🎤 В пятницу Майк Роффон едет в гости к: <b>Franky Murder \(The Balkan Murderers\)<\/b> \(2 из 3\)\n🏆 Позор недели среди игроков: <b>Эдвардс — 18 промахов с игры<\/b> \(1 из 1\)\n🏆 Позор недели среди GM: голосов нет\n🧮 Задачка Дилдо: верный ответ — <b>Texas 76 Citrus \(Лемариус\)<\/b>, угадали 3 из 4\n\nОпрос завершён, всем спасибо!/);
 assert.match(t,/#inside_fbl #неделя_2 #итоги_голосования$/);assert.equal(votesSummary(week,{}),null,'no votes: no message');
});
test('Inside FBL show: the ledger of the awards: every issue\'s tops, antitops, nominees and winners, by id, counted for the season',async()=>{
 const m=await import('../awards-bot/inside-show.js'),n=shameNominees(d),q=quizOf({...d,week:{...week,n:1}}),c=guestCandidates(d,[]);
 const e=m.ledgerEntry(d,{nominees:n,guests:[guestById('shaq')],quiz:q,candidates:c});
 assert.deepEqual([e.week,e.start,e.end],[2,'2026-11-02'.replace('11-02','10-26'),'2026-11-01']);
 assert.equal(e.top.heroOfTheWeek.key,'player:1');assert.equal(e.top.heroOfTheWeek.name,'Эдвардс');assert.equal(e.top.bestTeam.key,'gm:5');
 assert.ok(e.antitop.flopOfTheWeek.key.startsWith('player:'));assert.ok(e.antitop.worstTeam.key.startsWith('gm:'));
 assert.ok(e.nominations.shamePlayer.nominees.every(x=>/^player:\d+$/.test(x.key)));assert.ok(e.nominations.shameGm.nominees.every(x=>/^gm:\d$/.test(x.key)));
 assert.deepEqual(shamePolls(n)[0].names,e.nominations.shamePlayer.nominees.map(x=>x.key),'the polls count by the same keys');
 assert.deepEqual(e.guests,[{id:'shaq',name:"Шакил О'Нил"}]);assert.equal(e.quiz.answer,q.options[q.correct]);
 const young=e.nominations.shamePlayer.nominees[0],gm=e.nominations.shameGm.nominees[0];
 m.ledgerWinners(e,{shamePlayer:{result:{key:young.key,option:'x',votes:3,total:5}},shameGm:{result:{key:gm.key,option:'y',votes:2,total:4}},
  mike:{result:{key:c[0].force,option:c[0].label,votes:1,total:1}},numbers:{poll:{options:q.options.map((text,i)=>({text,voter_count:i===q.correct?4:1})),total_voter_count:7,correct_option_id:q.correct}}});
 assert.deepEqual(e.nominations.shamePlayer.winner,{key:young.key,name:'Янг',team:young.team,votes:3,total:5});assert.equal(e.nominations.shameGm.winner.name,'Лемариус');
 assert.equal(e.guestVote.winner.key,c[0].force);assert.deepEqual([e.quiz.right,e.quiz.voters],[4,7]);
 // Two players of one name never count as one: the tally goes by the key.
 const other={...structuredClone(e),start:'2026-11-02',nominations:{shamePlayer:{winner:{key:'player:999',name:'Янг'}},shameGm:{winner:{key:gm.key,name:'Лемариус'}}}};
 const t=m.seasonTally([e,other,structuredClone(e)]);
 assert.deepEqual(t.shamePlayer.map(x=>[x.key,x.count]),[[young.key,2],['player:999',1]]);assert.deepEqual(t.shameGm.map(x=>[x.name,x.count]),[['Лемариус',3]]);
 assert.equal(t.heroOfTheWeek[0].count,3);assert.equal(t.guests[0].name,"Шакил О'Нил");
 assert.deepEqual(m.shameYear(t).players,[{name:'Янг',wins:2},{name:'Янг',wins:1}]);
 const text=m.ledgerText(t);assert.match(text,/^📒 <b>Inside FBL • Журнал наград сезона 2026\/27<\/b>\nВыпусков: 3/);assert.match(text,/<b>🏆 Позор года — GM<\/b>\n1\. Лемариус — 3/);assert.match(text,/<b>⭐ Герой недели<\/b>\n1\. Эдвардс — 3/);
});
