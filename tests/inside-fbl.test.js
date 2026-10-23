import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {weekData,pickGuest,STORIES,REPEAT_WEEKS,longreadFacts,longreadMessages,longreadProblems,writeLongread,LONGREAD_SCHEMA,
 longreadPicture,SAFE_SCENE,telegraphNodes,publishPage,longreadCaption,pageTitle,postTime} from '../awards-bot/inside-fbl.js';

// A week of lines as the awards bot archives them: each scored by the league formula.
const S=(pts,reb,ast,tov,fgm,fga)=>({pts,reb,ast,stl:1,blk:0,tov,fgm,fga,ftm:2,fta:2,pf:2});
const L=(d,a,n,c,h,s)=>({d,e:`g${d}${a}`,a,n,c,t:`${d}T23:00Z`,m:34,p:fblFormula(s),h,b:[],s});
const lines=[
 L('2026-10-26','1','A. Edwards','MIN',[5],S(40,8,6,2,15,27)),L('2026-10-27','1','A. Edwards','MIN',[5],S(30,5,5,3,11,24)),
 L('2026-10-26','2','N. Jokic','DEN',[0],S(28,14,11,4,11,19)),L('2026-10-28','3','T. Young','ATL',[7],S(6,2,4,6,2,15)),
 L('2026-10-29','4','C. Flagg','DAL',[2],S(22,9,3,1,9,17)),L('2026-10-30','5','D. Mitchell','CLE',[7],S(18,3,4,2,7,18)),
 L('2026-10-31','6','Free Guy','NYK',[],S(35,6,2,1,13,22)),
];
const table=[300,120,200,90,150,410,80,60];
const ctx={table,who:(a,n)=>({1:'Эдвардс',2:'Йокич',3:'Янг',4:'Флэгг',5:'Митчелл'}[a]||n),
 rostered:new Map([['1',[5]],['2',[0]],['3',[7]],['4',[2]],['5',[7]]]),rookies:new Set(['4']),mef:new Map()};
const data=weekData(lines,'2026-11-01',ctx);

test('Inside FBL: the week from the archive, the table as the league counts it',()=>{
 assert.equal(data.week.start,'2026-10-26');assert.equal(data.week.end,'2026-11-01');
 assert.deepEqual(data.order.map(x=>x.t),[5,0,2,4,1,3,6,7]);assert.equal(data.rank(5),1);assert.equal(data.rank(7),8);
 assert.equal(data.weekPoints[5],Math.round(lines[0].p+lines[1].p));assert.equal(data.heroes[0].name,'Эдвардс');
 assert.deepEqual(data.flops.map(x=>x.name),['Эдвардс'],'a flop needs 60 minutes in the week');assert.equal(data.mvp[0].name,'Эдвардс');assert.equal(data.roy[0].name,'Флэгг');
});

test('Inside FBL: the guest of the week by the stories in turn, never one of the last weeks again, or by hand',()=>{
 const g1=pickGuest(data,[]);assert.equal(g1.story.id,STORIES[(data.week.n-1)%STORIES.length].id);
 const seen=[];let history=[];
 // The toy week has five guests in all (gm 6 and 8, Edwards, Flagg, the commissioner): five weeks without a repeat.
 for(let n=1;n<=Math.min(5,REPEAT_WEEKS);n++){const g=pickGuest({...data,week:{...data.week,n}},history);seen.push(g.key);history=[...history,{key:g.key}];}
 assert.equal(new Set(seen).size,seen.length,'no guest twice within the window');
 assert.equal(pickGuest(data,[],{force:'gm:3'}).team,2);assert.equal(pickGuest(data,[],{force:'player:1'}).row.a,'1');
 assert.equal(pickGuest(data,[],{force:'commissioner'}).kind,'commissioner');
 const kept=pickGuest({...data,week:{...data.week,n:3}},[],{keep:'gm:5'});assert.deepEqual([kept.key,kept.story.id],['gm:5','gm:leader'],'a redo keeps the guest and his story');
 assert.equal(pickGuest(data,[],{keep:'player:4'}).row.a,'4');
 const leader=pickGuest({...data,week:{...data.week,n:1}},[]);assert.deepEqual([leader.kind,leader.team],['gm',5]);
});

const gm=pickGuest({...data,week:{...data.week,n:1}},[]);
const facts=longreadFacts(data,gm,{who:ctx.who,gifts:['банка лимонада'],guests:['Фы Жил']});
test('Inside FBL: the facts of a GM guest: his place, the gap, his week, the league around him',()=>{
 assert.equal(facts.guest.name,'Лемариус');assert.equal(facts.guest.team,'Texas 76 Citrus');assert.equal(facts.guest.place,1);
 assert.equal(facts.guest.gapToLeader,0);assert.equal(facts.guest.weekBest[0].name,'Эдвардс');assert.doesNotMatch(JSON.stringify(facts),/gunslinger|undefined/);
 assert.equal(facts.table.length,8);assert.deepEqual(facts.mikesShelf,['банка лимонада']);
 const {system,prompt}=longreadMessages(facts);
 assert.match(system,/едешь в гости/);assert.match(system,/подарить/);assert.match(system,/Числа — только из данных/);assert.match(system,/и в обыгрывании названий команд и имён тоже/);
 assert.match(prompt,/"story": "лидер таблицы/);
 assert.match(longreadMessages(facts,'больше про подарок').prompt,/Пожелания редакции к этому выпуску \(учти их, правила выше важнее\): больше про подарок$/);assert.doesNotMatch(prompt,/Пожелания/);assert.ok(LONGREAD_SCHEMA.required.includes('opener'));
});

// A piece as Claude answers it: 6 chapters, only the facts' numbers.
const para='Майк входит в дом лидера и видит, как здесь живут на вершине: лимонные деревья в кадках, ковбойские сапоги у двери и тишина, в которой слышно, как растёт отрыв. '.repeat(3);
const good={title:'Вершина пахнет лимоном',lead:'Майк в гостях у лидера таблицы.',prologue:[para,para],
 chapters:Array.from({length:6},(_,i)=>({heading:`Глава про ${['утро','рынок','кухню','зал','отрыв','вечер'][i]}`,story:[para,para],
  qa:[{q:'Ты первый. Надолго?',a:'Пока Эдвардс бросает.'},{q:'Ноль отставания — это скучно?',a:'Скучно тем, кто сзади.'},{q:'А если неделя провалится?',a:'Тогда я подарю тебе ещё лимон.'}],
  remark:'Записано без улыбки.',picture:'A sunny farmhouse kitchen, late morning light through linen curtains: {MIKE} and {GUEST} squeeze lemons into a huge glass jug, {MIKE} holding his microphone like a ladle while {GUEST} lectures him. Warm documentary photo, 35mm, shallow depth of field, square frame. No text.'})),
 epilogue:[para],quote:'Вершина — это не место, а привычка.',gift:'ковбойская шляпа с лимоном',opener:'Golden hour on a porch full of lemon trees: {MIKE} holds his microphone up to {GUEST}, who leans back in a rocking chair. Glossy magazine-cover photo, 50mm, square. A lower-third banner reads "INSIDE FBL".'};
test('Inside FBL: what a piece may not carry: numbers of its own (in words too), old lines, bad scenes, too few words',()=>{
 assert.deepEqual(longreadProblems(good,facts),[]);
 const bad={...good,prologue:[para,'Он живёт на двадцать втором этаже и держит триста тридцать три собаки.']};
 assert.match(longreadProblems(bad,facts).join(),/числа не из данных: 22, 333/);
 assert.match(longreadProblems(bad,facts).join(),/вот где: «Он живёт на двадцать втором этаже и держит триста тридцать три собаки\.»/);
 assert.match(longreadProblems({...good,quote:'Роль важнее фамилии.'},facts).join(),/роль важнее фамилии/);
 assert.match(longreadProblems({...good,opener:good.opener.replace('rocking chair','rocking chair and a gun')},facts).join(),/opener: off limits: gun/);
 assert.match(longreadProblems({...good,chapters:good.chapters.map((c,i)=>i?c:{...c,picture:c.picture.replace('{GUEST} squeeze','the GM squeeze').replace('while {GUEST}','while he')})},facts).join(),/picture главы 1: no \{GUEST\}/);
 assert.match(longreadProblems({...good,chapters:good.chapters.map((c,i)=>i?c:{...c,picture:c.picture.replace('No text.','A sign reads "333 ФО".')})},facts).join(),/numbers in quotes not in the facts: 333/);
 assert.match(longreadProblems({...good,prologue:['Коротко.'],chapters:good.chapters.map(c=>({...c,story:['Коротко.']})),epilogue:['Всё.']},facts).join(),/слишком коротко/);
});

test('Inside FBL: a piece with problems goes back to be fixed, and is dropped when it stays wrong',async()=>{
 const calls=[];const claude=answers=>async o=>{calls.push(o);return {data:answers[Math.min(calls.length-1,answers.length-1)]};};
 const bad={...good,epilogue:['Девятьсот девяносто девять раз подряд он ошибся.']};
 const fixed=await writeLongread(facts,{claude:claude([bad,good])});
 assert.deepEqual(fixed.problems,[]);assert.equal(fixed.tries,2);assert.match(calls[1].prompt,/Исправь только эти места/);assert.match(calls[1].prompt,/числа не из данных: 999/);
 calls.length=0;const stuck=await writeLongread(facts,{claude:claude([bad])});
 assert.equal(calls.length,3);assert.match(stuck.problems.join(),/999/);
});

test('Inside FBL: the pictures: Opus writes the prompt, the code adds only the references and who is who',()=>{
 const img={bytes:Buffer.from('x'),name:'x.jpg',type:'image/jpeg'};
 const p=longreadPicture(good.chapters[0].picture,gm,{mikePhoto:img,guestPhoto:img});
 assert.equal(p.images.length,2);assert.match(p.prompt,/^REFERENCES: reference image 1 is Mike Roffon/);assert.match(p.prompt,/reference image 2 is the guest/);
 assert.match(p.prompt,/MIKE ROFFON \(reference image 1\): .*white gloves and a vintage chrome microphone, always/);
 assert.match(p.prompt,/THE GUEST \(reference image 2\): the guest; the face exactly as in the photo; never changes: thin rimless tinted glasses/);
 assert.match(p.prompt,/Mike Roffon \(reference image 1\) and the guest \(reference image 2\) squeeze lemons/,'the placeholders filled');
 assert.match(p.prompt,/Warm documentary photo, 35mm/,'the style is Opus\'s');assert.doesNotMatch(p.prompt,/STYLE:|SCENE:|\{MIKE\}|Texas|Citrus|Лемариус|gunslinger/);
 const pl=longreadPicture(SAFE_SCENE,{kind:'player',row:{a:'3',en:'T. Young',teams:[7]}},{mikePhoto:img,guestPhoto:null});
 assert.equal(pl.images.length,1);assert.match(pl.prompt,/THE GUEST, THE NBA PLAYER T\. YOUNG: the real NBA player T\. Young, exactly as he really looks/);
 assert.match(pl.prompt,/Mike Roffon \(reference image 1\) and the guest, the NBA player T\. Young sit at the table/);
});

test('Inside FBL: the Telegraph page: chapters numbered, a picture after each, the fiction marked; the post links it',async()=>{
 const nodes=telegraphNodes(good,facts,{opener:'https://x/opener.jpg',images:['https://x/1.jpg',null,'https://x/3.jpg']});
 const h3=nodes.filter(n=>n.tag==='h3').map(n=>n.children[0]);
 assert.deepEqual(h3,['Пролог Майка','1. Глава про утро','2. Глава про рынок','3. Глава про кухню','4. Глава про зал','5. Глава про отрыв','6. Глава про вечер','Послесловие Майка']);
 assert.equal(nodes.filter(n=>n.tag==='figure').length,3);assert.equal(nodes[0].children[0].attrs.src,'https://x/opener.jpg');
 assert.ok(JSON.stringify(nodes).includes('Интервью вымышленное'));assert.ok(JSON.stringify(nodes).includes('На полку Майка: ковбойская шляпа с лимоном.'));
 assert.ok(JSON.stringify(nodes).includes('"Лемариус: "'));
 const seen=[];const fetchImpl=async(url,o)=>{seen.push([url,JSON.parse(o.body)]);return new Response(JSON.stringify({ok:true,result:url.endsWith('createAccount')?{access_token:'T'}:{url:'https://telegra.ph/Inside-FBL-11-02'}}));};
 assert.equal(await publishPage(good,facts,{fetchImpl,opener:null,images:[]}),'https://telegra.ph/Inside-FBL-11-02');
 assert.match(seen[0][0],/createAccount$/);assert.equal(seen[1][1].access_token,'T');assert.equal(seen[1][1].title,'Inside FBL — Вершина пахнет лимоном');
 seen.length=0;await publishPage(good,facts,{fetchImpl,token:'K'});assert.equal(seen.length,1);assert.equal(seen[0][1].access_token,'K');
 const c=longreadCaption(good,facts,'https://telegra.ph/Inside-FBL-11-02');
 assert.match(c,/^<b>🎙 Inside FBL • Большое интервью<\/b>\n\n<b>Вершина пахнет лимоном<\/b>\n<i>Майк в гостях у лидера таблицы\.<\/i>/);
 assert.match(c,/В гостях у Майка Роффона: <b>Лемариус<\/b>, GM Texas 76 Citrus\./);assert.match(c,/👉 <a href="https:\/\/telegra\.ph\/Inside-FBL-11-02">Читать лонгрид<\/a>/);assert.ok(c.length<=1024);
 assert.match(longreadCaption({...good,title:'Лемариус: на вершине пахнет цитрусом'},facts,'u'),/<b>На вершине пахнет цитрусом<\/b>/,'the name is not said twice');
 assert.equal(pageTitle({title:'«Да»'}),'Inside FBL — Да');
 assert.ok(JSON.stringify(telegraphNodes({...good,quote:'«Кто сторожит вершину, тому некогда на ней сидеть». — Лемариус'},facts)).includes('«Кто сторожит вершину, тому некогда на ней сидеть» — Лемариус"'),'signed once');
 assert.ok(JSON.stringify(telegraphNodes(good,facts)).includes('«Вершина — это не место, а привычка» — Лемариус"'),'a dash inside the quote stays');
 assert.ok(JSON.stringify(telegraphNodes({...good,gift:'Говорящий апельсин.'},facts)).includes('На полку Майка: Говорящий апельсин."'),'one full stop');
});

test('Inside FBL: a week\'s piece goes out on its Friday at 18:00 Moscow, the games Monday to Thursday',()=>{
 assert.equal(new Date(postTime('2026-10-26')).toISOString(),'2026-10-30T15:00:00.000Z');
 assert.equal(new Date(postTime('2026-10-19')).toISOString(),'2026-10-23T15:00:00.000Z');
 assert.equal(data.lastDay,'2026-10-31');assert.match(facts.week.label,/игры 26 октября – 31 октября/);
});
