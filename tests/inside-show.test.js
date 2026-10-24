import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {weekOf} from '../awards-bot/core.js';
import {pickGuest,VOTED} from '../awards-bot/inside-fbl.js';
import {showData,dealsOf,openingFacts,numbersFacts,quizOf,infirmaryFacts,lawFacts,weekStatements,mikeFacts,guestCandidates,shameNominees,shameFacts,
 RUNDOWN,HOSTS,SCHEMAS,segmentMessages,segmentProblems,writeSegment,segmentCast,quizPoll,guestPoll,shamePoll,pollWinner,segmentCaption,segmentText,
 patientLines,dossierLines,showNodes,showTitle,airTime,airEnd} from '../awards-bot/inside-show.js';
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

test('Inside FBL show: the prizes of shame, a player once, a GM for the deal of the week in reverse',()=>{
 const n=shameNominees(d);
 assert.ok(n.length>=3&&n.length<=4);assert.equal(new Set(n.filter(x=>!x.gmNominee).map(x=>x.a)).size,n.filter(x=>!x.gmNominee).length);
 assert.deepEqual(n.map(x=>x.id),n.map((_,i)=>`n${i+1}`));
 assert.equal(n[0].kind,'худший матч недели');assert.equal(n[0].name,'Янг');assert.match(n[0].option,/^Янг — -?\d+ ФО за матч$/);
 const gm=n.find(x=>x.gmNominee);assert.equal(gm.name,'Лемариус');assert.match(gm.option,/^GM Лемариус — продал Эдвардс, купил Нулевой$/);
 const f=shameFacts(d,n);assert.ok(f.nominees.every(x=>!('a' in x)&&!('option' in x)));
 const p=shamePoll(n);assert.equal(p.options.length,n.length);assert.ok(p.options.every(o=>o.length<=100));
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
 const n=shameNominees(d),s=segmentText('shame',{title:'Позор',paragraphs:['Начали.'],prizes:n.map(x=>({nominee:x.id,prize:'«Кирпич»',line:'Ох.'})),pollLine:'Голосуйте.',farewell:'Пока.',handoff:''},shameFacts(d,n),{nominees:n});
 assert.match(s,/🏆 <b>Приз «Кирпич»<\/b> — <b>Янг<\/b> \(-?\d+ ФО за матч\)\nОх\./);assert.match(s,/🏆 <b>Приз «Кирпич»<\/b> — <b>GM Лемариус<\/b>/);assert.doesNotMatch(s,/🎙 <i>/);
 const m=mikeFacts(d,{}),mt=segmentText('mike',{title:'Т',afterLongread:['В пятницу снова в гости.'],best:{prologue:'П.',qa:[{q:'В?',a:'О.'}],remark:''},worst:{prologue:'П2.',qa:[{q:'В2?',a:'О2.'}],remark:'Штамп.'},pollLine:'Голосуйте, куда мне ехать.',handoff:'Стивен, твой позор.'},m);
 assert.match(mt,/<b>🎤 Флеш-интервью: лучший игрок недели, \d+ ФО — Эдвардс<\/b>/);assert.match(mt,/<b>Майк Роффон\.<\/b> В2\?\n<b>Брансон\.<\/b> О2\./);
 assert.match(mt,/<i>Интервью вымышленные: цифры настоящие, слова — нет\.<\/i>/);assert.match(mt,/<i>Майк Роффон: Штамп\.<\/i>/);
 assert.doesNotMatch(segmentText('opening',{...blocks.opening,title:'<x>'},{}),/<x>/,'Claude\'s words are escaped');
});

test('Inside FBL show: the hosts in its pictures: the five at the round table, what never changes about each',()=>{
 const c=segmentCast('opening',{d});
 assert.equal(c.refs.length,6);assert.deepEqual(c.list.filter(r=>r.mustUse).length,5);
 const all=c.list.map((r,i)=>`the person from reference image ${i+1}`).join(', ');
 const p=promptProblems(`A TV studio round table: ${all}. ${'Detailed scene. '.repeat(10)}`,c);
 for(const w of ['God Bless America','white gloves','microphone','neck brace','cast','glasses','notebook'])assert.ok(p.some(x=>x.includes(`"${w}"`)),w);
 const zak=segmentCast('law',{d,facts:law});assert.equal(zak.refs[0].is,'the photo of Zak Onn, the league lawyer');assert.ok(zak.refs.length>=2,'the suspects\' GMs');
 assert.equal(segmentCast('mike',{d}).refs.length,1,'no faces: only Mike');
});

test('Inside FBL show: its page on Telegraph, its hour: Monday 19:00 Moscow, on air until the end of that Monday',()=>{
 const nodes=showNodes(week,[{key:'opening',title:'Неделя',text:segmentText('opening',blocks.opening,{}),picture:'https://x/1.jpg',cards:[],polls:[]},
  {key:'numbers',title:'Цифры',text:segmentText('numbers',blocks.numbers,{}),picture:null,cards:['https://x/c.png'],polls:[quizPoll(quizOf(d),'')]},
  {key:'law',title:'Дело',text:segmentText('law',blocks.law,law),picture:null,cards:[],polls:[]}]);
 assert.equal(nodes.filter(n=>n.tag==='h3').length,3);assert.equal(nodes.filter(n=>n.tag==='figure').length,2);
 assert.ok(nodes.some(n=>n.tag==='blockquote'&&/Голосование — в чате лиги/.test(n.children[0])));
 assert.ok(nodes.some(n=>n.tag==='p'&&n.children.some(c=>c.tag==='br')),'line breaks within a paragraph');
 assert.doesNotMatch(JSON.stringify(nodes),/<b>|&lt;/);
 assert.equal(showTitle(week,blocks.opening),'Inside FBL — выпуск 2: Неделя лимонов');
 assert.equal(new Date(airTime(week)).toISOString(),'2026-11-02T16:00:00.000Z');assert.equal(new Date(airEnd(week)).toISOString(),'2026-11-02T20:59:00.000Z');
});

test('Inside FBL show: the cards: Dildo\'s table of the week, Zak\'s case file without a point in it, the opener',()=>{
 const look={logo:()=>null,emoji:e=>e},fonts={manrope:'',oswald:''};
 const t=weekTableCard(week,numbersFacts(d),look,fonts);
 assert.match(t,/ЦИФРЫ НЕДЕЛИ|Цифры недели/);assert.ok(LEAGUE_TEAMS.every(x=>t.includes(x.name.replace(/\./g,'.'))));assert.match(t,/ФО ЗА НЕДЕЛЮ/);
 const z=dossierCard(week,law,look,fonts);
 assert.match(z,/Досье на неделю/);assert.match(z,/НАРУШЕНИЕ/);assert.match(z,/ПРОВЕРКА/);assert.match(z,/СДЕЛКИ 3 ИЗ 3/);assert.doesNotMatch(z,/ФО/);
 assert.match(showOpener(week,look,fonts),/Выпуск 2/);
});
