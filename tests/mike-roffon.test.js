import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import * as mike from '../awards-bot/mike-roffon.js';
import {mikeCast,writeMikePicture,interviewFacts,interviewMessages,allowedNumbers,strayNumbers,validInterview,interviewText,interviewCaption,writeInterview,interviewFor,copiedLines,staleThemes,SAMPLE_LINES,INTERVIEW_SCHEMA,wordNumbers} from '../awards-bot/mike-roffon.js';

const s={pts:45,reb:10,ast:3,stl:2,blk:1,tov:4,fgm:16,fga:29,ftm:4,fta:5,pf:1};
const line={d:'2026-10-21',e:'g1',a:'4594268',n:'A. Edwards',c:'MIN',t:'2026-10-22T00:00Z',m:36.4,p:fblFormula(s),h:[5],b:[],s};
const facts=interviewFacts('2026-10-21',line,(a,n)=>'Эдвардс',{opponent:'MIA'});
const good={title:'Когда темп мой — защита глохнет',prologue:'Он вышел и забрал вечер.',qa:[{q:'45 очков и 39 ФО. Чей это был вечер?',a:'Мой ритм.'},{q:'А четыре потери?',a:'Налог за агрессию.'},{q:'Завтра так же?',a:'Same energy, другой соперник.'}],
 remark:'Налог, который платят только богатые.',afterword:'Он не позировал.'};

test('Mike Roffon: the facts carry the FBL points of the league formula and nothing else',()=>{
 assert.equal(facts.game.fo,39);assert.equal(facts.game.fo,fblFormula(s));
 assert.equal(facts.player.name,'Эдвардс');assert.equal(facts.player.opponent,'MIA');assert.equal(facts.fblTeams[0].team,'Texas 76 Citrus');
 const {system,prompt}=interviewMessages(facts);
 assert.match(system,/Майк Роффон/);assert.match(system,/Используй только числа из данных/);assert.match(prompt,/"fo": 39/);
});

test('Mike Roffon: an interview with a number of its own is caught',()=>{
 assert.ok(allowedNumbers(facts).has('45'));assert.ok(allowedNumbers(facts).has('39'));
 assert.deepEqual(strayNumbers(good,facts),[]);
 assert.deepEqual(strayNumbers({...good,afterword:'Средние 28 очков за сезон.'},facts),['28']);
 assert.ok(validInterview(good));assert.equal(validInterview({...good,qa:[]}),false);
});

test('Mike Roffon: his voice is described, his old pieces are never quoted, and a repeated line is caught',()=>{
 const sys=interviewMessages(facts).system;
 for(const l of SAMPLE_LINES)assert.ok(!sys.toLowerCase().replace(/ё/g,'е').includes(l.toLowerCase().replace(/ё/g,'е')),`the prompt quotes «${l}»`);
 assert.match(sys,/хлёсткий, жёсткий, ироничный/);
 assert.deepEqual(copiedLines(good),[]);
 assert.deepEqual(copiedLines({...good,remark:'«Спокойно и буднично» — так обычно и начинается самое интересное.'}),['спокойно и буднично','так обычно и начинается самое интересное']);
 assert.deepEqual(copiedLines({...good,qa:[...good.qa,{q:'Итог?',a:'Роль — важнее фамилии.'}]}),['роль важнее фамилии']);
 assert.deepEqual(copiedLines({...good,afterword:'Тихий пол, громкий потолок.'}),[],'single words are free');
});

test('Mike Roffon: numbers in words are numbers too, and only the facts may hold them',()=>{
 assert.deepEqual(wordNumbers('Сорок пять очков, тридцатью девятью ФО, двести тридцать один, тринадцатый промах'),['45','39','231','13']);
 assert.deepEqual(wordNumbers('пять сорок'),['5','40'],'a row adds up only from bigger places to smaller');
 assert.deepEqual(wordNumbers('девятьсот девяносто девять, две тысячи триста сорок, тысяча, семьсот'),['999','2340','1000','700'],'hundreds to 900 and thousands');
 assert.deepEqual(wordNumbers('Семья, пятно, вторник, сторона и пятерка — не числа'),[]);
 assert.deepEqual(wordNumbers('первый раз, на пятом месте, шестнадцать зашло'),['1','5','16']);
 assert.equal(facts.game.fgMissed,13);assert.equal(facts.game.ftMissed,1);
 assert.deepEqual(strayNumbers({...good,qa:[...good.qa,{q:'Двадцать девять бросков, тринадцать мимо?',a:'Сорок пять очков.'}]},facts),[],'the facts: 29 FGA, 13 missed, 45 points');
 assert.deepEqual(strayNumbers({...good,afterword:'В среднем двадцать восемь за сезон.'},facts),['28']);
 assert.deepEqual(strayNumbers({...good,afterword:'Третья игра подряд с тридцатью очками.'},facts),['30']);
});

test('Mike Roffon: the interview as Telegram HTML, marked as fiction, with the hashtags',()=>{
 const t=interviewText({...good,title:'«Когда темп мой»'},facts);
 assert.match(t,/<b>🎙 Inside FBL • Флеш-интервью<\/b>\n<i>«Когда темп мой»<\/i>/,'one pair of quotes');
 assert.match(t,/<b>Майк Роффон\.<\/b> 45 очков и 39 ФО/);assert.match(t,/<b>Эдвардс\.<\/b> Мой ритм\./);
 assert.match(t,/<i>Майк Роффон: Налог, который платят только богатые\.<\/i>/);
 assert.match(t,/— Майк Роффон, специально для Inside FBL/);assert.match(t,/Интервью вымышленное/);
 assert.match(interviewCaption(facts,'2026-10-21'),/<b>39<\/b> ФО · герой дня 21 октября 2026\n\n#inside_fbl #интервью #дата_21_10_2026/);
});

const face={bytes:Buffer.from('face'),name:'4594268.png',type:'image/png'};
const PIC='Night outside the arena, wet asphalt under sodium lamps. Mike Roffon, the man from reference image 1, his face preserved precisely, in a long overcoat, his white gloves on, thrusts his vintage chrome microphone at the real NBA player from reference image 2, face exactly as in the photo, who wears a hoodie in black, gold and diamond white with the logo from reference image 3 on the chest. Gritty sports-documentary still, 28mm, square. A lower-third reads "INSIDE FBL"; no other text or watermarks.';

test('Mike Roffon: his picture\'s references: his face, the hero\'s, the GM on the days he is asked, the logos; no picture of the code\'s own',()=>{
 for(const name of ['interviewPicture','writtenPicture','writtenPictureProblems'])assert.equal(mike[name],undefined,name);
 const c=mikeCast({...facts,gmQuestion:null},{team:5,face});
 assert.deepEqual(c.images.map(i=>i.name),['mike-roffon.jpg','4594268.png','6.jpg','fbl-logo.png']);
 assert.match(c.list[0].is,/his face and his studio look/);assert.match(c.list[0].neverChanges,/white gloves and a vintage chrome microphone/);
 assert.deepEqual(c.refs[0].say,['white gloves','microphone']);assert.equal(c.list[1].mustUse,true);assert.equal(c.list[2].teamColors,'navy blue, lemon yellow and cream');
 assert.deepEqual(mikeCast(facts).images.map(i=>i.name),['mike-roffon.jpg','fbl-logo.png'],'no face, no fantasy team');
});

test('Mike Roffon: Claude writes his picture from the interview; refused, it goes back to him; then the interview goes alone',async()=>{
 const c=mikeCast({...facts,gmQuestion:null},{team:7,face}),calls=[],answers=[{prompt:PIC.replace('white gloves','gloves'),idea:'x'},{prompt:PIC,idea:'outside the arena'}];
 const p=await writeMikePicture(facts,good,c,{claude:async a=>{calls.push(a);return {data:answers.shift()};}});
 assert.equal(p.prompt,PIC);assert.deepEqual(p.images.map(i=>i.name),['mike-roffon.jpg','4594268.png','8.jpg'],'the league logo he did not use is not sent');
 assert.match(calls[0].prompt,/^Интервью:\n\{/);assert.match(calls[0].prompt,/Налог за агрессию/);assert.match(calls[0].prompt,/"fo": 39/);
 assert.match(calls[0].system,/никогда не в каске, военной форме, камуфляже или жилете PRESS/);assert.match(calls[1].prompt,/no "white gloves"/);
 assert.match((await writeMikePicture(facts,null,c,{claude:async a=>{calls.push(a);return {data:{prompt:PIC,idea:''}};}})).prompt,/INSIDE FBL/);
 assert.match(calls.at(-1).prompt,/^Данные:/,'a picture drawn alone: from the game');
 assert.equal(await writeMikePicture(facts,good,c,{claude:async()=>({data:{prompt:PIC.replace('"INSIDE FBL"','"77 ФО"'),idea:''}})}),null,'numbers of its own: no picture');
});

test('Mike Roffon: written by Claude (the subscription module, JSON by the schema), again on its own numbers or old lines, then dropped',async()=>{
 const seen=[],reply=x=>async opts=>{seen.push(opts);return {data:x,text:JSON.stringify(x),usage:{output_tokens:500},costUsd:0.02};};
 const {interview}=await writeInterview(facts,{claude:reply(good)});assert.deepEqual(interview,good);
 assert.match(seen[0].system,/Майк Роффон/);assert.match(seen[0].prompt,/"fo": 39/);assert.equal(seen[0].schema,INTERVIEW_SCHEMA);
 assert.deepEqual(INTERVIEW_SCHEMA.required,['title','prologue','qa','remark','gm','afterword'],'the picture is written apart, from the interview');
 let calls=0;const bad=async o=>{calls++;return reply({...good,prologue:'Средние 28 очков.'})(o);};
 const out=await interviewFor(facts,{claude:bad});assert.equal(out.interview,null);assert.equal(calls,3);
 let tries=0;const copyThenGood=async o=>(tries++?reply(good):reply({...good,afterword:'Роль важнее фамилии.'}))(o);
 assert.deepEqual((await interviewFor(facts,{claude:copyThenGood})).interview,good);assert.equal(tries,2);
 await assert.rejects(writeInterview(facts,{claude:reply({nope:1})}),/not an interview/);
 await assert.rejects(interviewFor(facts,{claude:async()=>{throw Error('Claude Code: 401 expired');}}),/401/);
});

test('Mike Roffon: the interview goes through scripts/claude-text.mjs, never through the OpenAI text API',async()=>{
 const src=(await import('node:fs')).readFileSync(new URL('../awards-bot/mike-roffon.js',import.meta.url),'utf8');
 assert.match(src,/from '\.\.\/scripts\/claude-text\.mjs'/);assert.doesNotMatch(src,/api\.openai\.com|chat\/completions|gpt-/);
});

test('Mike Roffon: every other day he turns to the GM of the hero\'s team too, and the GM stands beside him in the picture',()=>{
 const days=Array.from({length:12},(_,i)=>`2026-11-${String(i+1).padStart(2,'0')}`),hero=d=>({...line,d,h:[4]});
 const asked=days.filter(d=>interviewFacts(d,hero(d),()=>'Эдвардс').gmQuestion);
 assert.ok(asked.length>0&&asked.length<days.length,'some days, not all');
 const day=asked[0],f=interviewFacts(day,hero(day),()=>'Эдвардс');
 assert.deepEqual(f.gmQuestion,{gm:'Капитан Торрес Нью-Вин',team:'Volga Pirates',lore:null});
 assert.deepEqual(interviewFacts(day,hero(day),()=>'Эдвардс').gmQuestion,f.gmQuestion,'the same for a day and a player');
 assert.equal(interviewFacts(day,{...line,d:day,h:[]},()=>'Эдвардс').gmQuestion,null,'no FBL team, no GM');
 assert.match(interviewMessages(f).system,/gmQuestion/);assert.match(interviewMessages(f).prompt,/"gm": "Капитан Торрес Нью-Вин"/);
 const withGm={...good,gm:{q:'Зачем он вам?',a:'Пиратам нужен штурман.'}};
 const t=interviewText(withGm,f);
 assert.match(t,/<b>Майк Роффон\.<\/b> Зачем он вам\?\n<b>GM Капитан Торрес Нью-Вин \(Volga Pirates\)\.<\/b> Пиратам нужен штурман\./);
 assert.doesNotMatch(interviewText(withGm,{...f,gmQuestion:null}),/Пиратам/,'no GM block on a day he is not asked');
 assert.deepEqual(strayNumbers({...withGm,gm:{q:'Сколько стоил?',a:'2000, и ни монетой больше.'}},f),['2000'],'his answer is checked too');
 const c=mikeCast(f,{team:4});
 assert.deepEqual(c.images.map(i=>i.name),['mike-roffon.jpg','captain-torres-new-win.jpg','5.jpg','fbl-logo.png']);
 assert.match(c.list[1].is,/general manager \(GM\) who picked the player/);assert.match(c.list[1].neverChanges,/always a pirate/);assert.equal(c.list[1].name,'Captain Torres New-Win');
 assert.equal(mikeCast({...f,gmQuestion:null},{team:4}).images.length,3,'no GM on a day he is not asked');
});

test('Mike Roffon: every interview starts from nothing: no date for the writer, no harvest of an old long read (24.10.2026)',async()=>{
 assert.ok(facts.date);const m=interviewMessages(facts);
 assert.ok(!m.prompt.includes(facts.date)&&!/"date"/.test(m.prompt),'the writer never sees the date');
 assert.match(m.system,/с чистого листа/);
 const tatum={...good,qa:[{q:'12 промахов?',a:'Промах — это бросок, который ещё не дозрел.'},...good.qa.slice(1)],remark:'Весь огород держится на одной грядке.',afterword:'Урожай богатый.'};
 assert.deepEqual(staleThemes(tatum),['огород','грядке','урожай','дозрел']);
 assert.deepEqual(staleThemes({...good,afterword:'Колоссальный вечер, заносы и осечки.'}),[],'колоссальный is not колос, осечка is not осень');
 assert.deepEqual(staleThemes(good),[]);
 const seen=[];const staleThenGood=async o=>{seen.push(o.prompt);const x=seen.length===1?tatum:good;return {data:x,text:JSON.stringify(x),usage:null,costUsd:0};};
 assert.deepEqual((await interviewFor(facts,{claude:staleThenGood})).interview,good);
 assert.equal(seen.length,2);assert.match(seen[1],/Прошлый вариант отклонён:.*чужая тема/);assert.ok(!/отклонён/.test(seen[0]));
});
