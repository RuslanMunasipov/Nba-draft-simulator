import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {dailyBlocks,weeklyBlocks,form} from '../awards-bot/core.js';
import {dayAlbum,weekHeroesAlbum} from '../awards-bot/cards.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {introFacts,introMessages,introProblems,introText,introFor,writePostPicture,realismProblems} from '../awards-bot/dildo.js';
import {refused,asDildo,lines as noteLines,COMMENT_LIMIT,teamFacts,dayFacts,weekFacts,commentMessages,commentProblems,commentFor,signCaption,signText,SIGNATURE,CAPTION_LIMIT} from '../awards-bot/dildo.js';

const s={pts:31,reb:14,ast:11,stl:2,blk:1,tov:3,fgm:12,fga:19,ftm:5,fta:6,pf:2};
const bad={pts:6,reb:2,ast:1,stl:0,blk:0,tov:5,fgm:2,fga:14,ftm:2,fta:6,pf:5};
const line=(a,st,h=[0],extra={})=>({d:'2026-10-21',e:'g'+a,a,n:'P'+a,c:'DEN',t:'2026-10-22T00:00Z',m:34,p:fblFormula(st),h,b:[],s:st,...extra});
const lines=[line('1',s),line('2',bad,[3]),line('3',s,[])];
const who=(a,n)=>'RU '+n;
const week={n:1,start:'2026-10-19',end:'2026-10-25'};
const look={photo:()=>null,logo:()=>null,emoji:e=>`<i class="emo">${e}</i>`};
const fonts={manrope:'data:font/ttf;base64,AA',oswald:'data:font/ttf;base64,AA'};
const quiet=()=>{};

test('Christopher Dildo: his posts go by his bot when he has a token',async()=>{
 const used=[];
 assert.equal(await asDildo(async t=>{used.push(t);return 'ok';},{dildo:'D',awards:'A'}),'ok');
 assert.deepEqual(used,['D'],'his token, once');
});

test('Christopher Dildo: without his token the awards bot posts, as before',async()=>{
 const used=[];
 await asDildo(async t=>{used.push(t);},{dildo:undefined,awards:'A'});
 await asDildo(async t=>{used.push(t);},{dildo:'',awards:'A'});
 assert.deepEqual(used,['A','A']);
});

test('Christopher Dildo: a token Telegram refuses falls back to the awards bot, nothing lost',async()=>{
 for(const message of ['Telegram album: 401 Unauthorized','Telegram league chat: 403 Forbidden: bot is not a member of the supergroup chat',
  'Telegram sendPhoto: 400 Bad Request: chat not found','Telegram album: 404 Not Found','Telegram sendPhoto: 400 Bad Request: not enough rights to send photos to the chat']){
  assert.ok(refused(Error(message)),message);
  const used=[];
  await asDildo(async t=>{used.push(t);if(t==='D')throw Error(message);},{dildo:'D',awards:'A',warn:quiet});
  assert.deepEqual(used,['D','A'],message);
 }
});

test('Christopher Dildo: any other failure is not sent twice by the awards bot',async()=>{
 for(const message of ['Telegram album: 502 Bad Gateway','Telegram album: fetch failed (ECONNRESET)','Telegram album: 400 Bad Request: can\'t parse entities','Telegram album: 429 Too Many Requests']){
  assert.equal(refused(Error(message)),false,message);
  const used=[];
  await assert.rejects(asDildo(async t=>{used.push(t);throw Error(message);},{dildo:'D',awards:'A',warn:quiet}),{message});
  assert.deepEqual(used,['D'],message);
 }
});

test('Christopher Dildo: the facts carry the FBL points of the league formula, no date',()=>{
 const facts=dayFacts(dailyBlocks(lines),who,{form:form(lines,'2026-10-21')});
 assert.equal(facts.heroes[0].fo,44);assert.equal(facts.heroes[0].fo,fblFormula(s));assert.equal(facts.heroes[0].name,'RU P1');
 assert.equal(facts.flops[0].fo,fblFormula(bad));assert.equal(facts.flops[0].game.fgMissed,12);
 assert.equal(facts.freeAgents[0].name,'RU P3');assert.equal('fblTeam' in facts.freeAgents[0],false);
 assert.doesNotMatch(JSON.stringify(facts),/2026|октябр/);
 const w=weekFacts(week,weeklyBlocks(lines),who);assert.equal(w.week,1);assert.equal(w.heroes[0].games,1);
 const {system,prompt}=commentMessages(facts);
 assert.match(system,/Кристофер Дилдо/);assert.match(system,/Только числа из данных/);assert.match(prompt,/"fo": 44/);
});

test('Christopher Dildo: the numbers of our teams and GMs are the code\'s, a player counted for his first holder',()=>{
 const shared=line('4',bad,[3,0]),day=[...lines,shared,line('5',s,[3])];
 const teams=teamFacts(day,who,{heroes:dailyBlocks(day).heroes,flops:dailyBlocks(day).flops});
 assert.equal(teams.length,8,'all eight teams, the idle ones too');
 assert.deepEqual(teams.map(t=>t.place),[1,2,3,4,5,6,7,8]);
 const balkan=teams.find(t=>t.team==='The Balkan Murderers'),t3=teams.find(t=>t.team===LEAGUE_TEAMS[3].name);
 assert.equal(balkan.gm,'Franky Murder');assert.equal(balkan.fo,fblFormula(s),'the shared player scores for his first holder only');
 assert.equal(balkan.playersPlayed,1);assert.equal(balkan.worst,null,'one player: no worst');
 assert.equal(t3.fo,fblFormula(bad)*2+fblFormula(s));assert.equal(t3.missedShots,12+12+7);assert.equal(t3.turnovers,5+5+3);
 assert.deepEqual(t3.best,{name:'RU P5',fo:44});assert.equal(t3.worst.fo,fblFormula(bad));
 assert.equal(teams[0].fo,44);assert.ok(teams.slice(1).every((t,i)=>t.fo<=teams[i].fo),'ranked by FBL points');
 assert.ok(teams.filter(t=>t.playersPlayed===0).every(t=>t.fo===0&&t.best===null));
 const facts=dayFacts(dailyBlocks(lines),who,{lines});
 assert.equal(facts.heroes[0].percentOfFblTeamDay,100,'his team\'s whole day');
 const week2=weekFacts(week,weeklyBlocks(day),who,{lines:day});assert.equal(week2.fblTeams.find(t=>t.team==='The Balkan Murderers').fo,44);
});

test('Christopher Dildo: a narrow specialist, numbers only, hunting the numbers of our teams and GMs',()=>{
 const {system}=commentMessages(dayFacts(dailyBlocks(lines),who,{lines}));
 assert.match(system,/узкий специалист/);assert.match(system,/кроме математики и цифр/);assert.match(system,/наши команды FBL и их GM/);
 assert.match(system,/уже посчитано в данных/);
});

test('Christopher Dildo: a comment with a number of its own is caught, in digits and in words',()=>{
 const facts=dayFacts(dailyBlocks(lines),who);
 assert.deepEqual(commentProblems('RU P1 положил 44 ФО и 31 очко, а у RU P2 — 12 кирпичей. Блокнот в восторге.',facts),[]);
 assert.match(commentProblems('RU P1 набрал 44 ФО — плюс 17 к среднему.',facts).join(),/17/);
 assert.match(commentProblems('RU P1: сорок семь процентов с игры.',facts).join(),/47/);
 assert.deepEqual(commentProblems('',facts),['пустой комментарий']);
});

test('Christopher Dildo: a comment is written again once, then dropped; it never holds the post',async()=>{
 const facts=dayFacts(dailyBlocks(lines),who),calls=[];
 const answers=[{comment:'RU P1 — 99 ФО!'},{comment:'RU P1 разогрет: 44 ФО, блокнот дымится.'}];
 const claude=async x=>{calls.push(x.prompt);return {data:answers[calls.length-1]};};
 assert.equal(await commentFor(facts,{claude,warn:quiet}),'RU P1 разогрет: 44 ФО, блокнот дымится.');
 assert.match(calls[1],/числа не из данных \(99\)/,'the second try is told what was wrong');
 let n=0;
 assert.equal(await commentFor(facts,{claude:async()=>({data:{comment:`RU P1 — ${90+(n++)} ФО`}}),warn:quiet}),null);
 assert.equal(n,2,'two tries, then no comment');
 assert.equal(await commentFor(facts,{claude:async()=>{throw Error('Claude Code: 429');},warn:quiet}),null);
 assert.equal(await commentFor(facts,{claude:()=>new Promise(()=>{}),totalMs:50,warn:quiet}),null,'a slow Claude does not hold the post');
});

test('Christopher Dildo: his comment and signature stand before the hashtags, the caption stays',()=>{
 const blocks=dailyBlocks(lines),{caption}=dayAlbum('2026-10-21',blocks,who,look,fonts,{week});
 const signed=signCaption(caption,'RU P1 горит <ярко>.');
 assert.ok(signed.startsWith(caption.split('\n\n')[0]),'the caption\'s head stays');
 assert.ok(signed.endsWith('\n\n#итоги_дня #неделя_1 #октябрь_2026 #дата_21_10_2026'),'the hashtags stay last');
 assert.match(signed,/📓 <i>RU P1 горит &lt;ярко&gt;\.<\/i>\n— Кристофер Дилдо, аналитик Inside FBL/);
 assert.equal(signCaption(caption,null),caption.replace(/\n\n(#итоги_дня)/,`\n\n${SIGNATURE}\n\n$1`),'without a comment: the signature alone');
 const long=signCaption(caption,'х'.repeat(CAPTION_LIMIT));assert.ok(long.length<=CAPTION_LIMIT);assert.doesNotMatch(long,/📓/);
 assert.match(signText('текст','мысль'),/^текст\n\n📓 <i>мысль<\/i>\n— Кристофер Дилдо/);assert.equal(signText('',null),'');
});

test('Christopher Dildo: the week\'s heroes are an album of their own with the week\'s hashtags',()=>{
 const wb=weeklyBlocks(lines),{cards,caption}=weekHeroesAlbum(week,wb,who,look,fonts);
 assert.equal(cards.length,2);assert.match(cards[0],/Итоги недели/);
 assert.match(cards[1],/Герои недели/);assert.match(cards[1],/Провалы недели/);assert.match(cards[1],/Золотая жила недели/);assert.match(cards[1],/\+44/);
 assert.match(caption,/^<b>🗓 Итоги недели 1 · 19–25 октября 2026<\/b>\nГерой недели: RU P1 — \+44 ФО/);
 assert.match(caption,/\n\n#итоги_недели #неделя_1 #октябрь_2026$/);assert.doesNotMatch(caption,/гонка/);
});

test('Christopher Dildo: an evil nerd laughing at everyone with maths, in 3 or 4 sharp notes, a line each',async()=>{
 const facts=dayFacts(dailyBlocks(lines),who,{lines}),{system}=commentMessages(facts);
 assert.match(system,/злобный ботан, который математически смеётся над всеми/);assert.match(system,/даже над героями/);assert.match(system,/3–4 короткие колкие пометки, каждая с новой строки/);
 assert.equal(noteLines('- RU P1: 44 ФО.\n\n2) RU P2:  12 кирпичей.\n• Выборка мала.\nТеорема доказана.\nПятая строка лишняя.'),'RU P1: 44 ФО.\nRU P2: 12 кирпичей.\nВыборка мала.\nТеорема доказана.','a line each, list marks dropped, at most four');
 assert.equal(noteLines('-14 ФО у RU P2.'),'-14 ФО у RU P2.','a minus is not a list mark');
 const notes='RU P1: 44 ФО, выброс, но выборка из одного матча.\nRU P2: 12 кирпичей, теорема о стене доказана.\nGM Franky Murder, ваш выбор — погрешность.';
 const comment=await commentFor(facts,{claude:async()=>({data:{comment:notes}}),warn:quiet});
 assert.equal(comment,notes,'his lines stay lines');
 const {caption}=dayAlbum('2026-10-21',dailyBlocks(lines),who,look,fonts,{week});
 const signed=signCaption(caption,'х'.repeat(COMMENT_LIMIT));
 assert.ok(signed.length<=CAPTION_LIMIT);assert.match(signed,/📓/,'the longest comment he may write still fits the caption');
});

test('Christopher Dildo introduces himself: the season\'s numbers only, his photo\'s caption, a free agent picked up later said so',async()=>{
 const later={...line('3',s,[1]),d:'2026-10-22',e:'g9',t:'2026-10-23T00:00Z'},season=[...lines,later];
 const facts=introFacts(season,who);
 assert.equal(facts.season.gameDays,2);assert.equal(facts.season.playerGames,4);assert.equal(facts.fblTeams.length,8);
 assert.equal(facts.bestGameOfTheSeason.fo,44);assert.equal(facts.worstGameOfTheSeason.fo,fblFormula(bad));assert.equal(facts.worstGameOfTheSeason.fblTeamAtTipOff,LEAGUE_TEAMS[3].name);
 const free=introFacts([line('3',s,[]),later],who).bestGameOfTheSeason;
 assert.equal(free.fblTeamAtTipOff,'свободный агент');assert.equal(free.pickedUpLaterBy,LEAGUE_TEAMS[1].name,'never "nobody took him" when someone did');
 const {system}=introMessages(facts);assert.match(system,/представляешься/);assert.match(system,/ФБР/);assert.match(system,/злобный ботан/);
 const good={title:'Блокнот открыт',paragraphs:['Я Кристофер Дилдо, считаю за вас.','RU P1: 44 ФО. Выброс.','ФБР, я вас вижу.']};
 assert.deepEqual(introProblems(good,facts),[]);
 assert.match(introProblems({...good,paragraphs:[...good.paragraphs,'Средние 17 ФО.']},facts).join(),/17/);
 assert.match(introProblems({...good,title:'44 причины'},facts).join(),/числа в заголовке/);
 assert.match(introProblems({...good,paragraphs:['х'.repeat(1100)]},facts).join(),/не влезает в подпись фото/);
 const text=introText(good);
 assert.match(text,/^<b>📓 Inside FBL • Кристофер Дилдо представляется<\/b>\n<i>«Блокнот открыт»<\/i>\n\nЯ Кристофер Дилдо/);
 assert.ok(text.endsWith(`${SIGNATURE}\n\n#inside_fbl #кристофер_дилдо`));
 const answers=[{...good,paragraphs:['RU P1 — 99 ФО']},good],calls=[];
 assert.equal(await introFor(facts,{claude:async x=>{calls.push(x.prompt);return {data:answers.shift()};},warn:quiet}),text);
 assert.match(calls[1],/числа не из данных \(99\)/);
});

test('Christopher Dildo: his introduction kept in data/dildo fits his photo and holds only checked numbers',()=>{
 const file=new URL('../data/dildo/2026-10-24-intro.html',import.meta.url),text=fs.readFileSync(file,'utf8').trim();
 assert.ok(text.length<=1024);assert.match(text,/Кристофер Дилдо представляется/);assert.ok(text.includes(SIGNATURE));
});

test('Christopher Dildo\'s own posts: a picture Claude writes, ultra-realistic with his face, never the bare reference photo',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assets-'));fs.mkdirSync(path.join(root,'people'));fs.writeFileSync(path.join(root,'people','christopher-dildo.jpg'),'cd');
 const text='<b>📓 Кристофер Дилдо</b>\nЛемариус: 311 ФО.';
 const ok='An ultra-photorealistic film still shot on a real cinema camera: the young man from reference image 1, his face exactly as in the photo, rectangular glasses, a notebook in hand, grins at a wall of chalk formulas; the circled sign reads "311 ФО". Only these Cyrillic words, no other text, captions or watermarks.';
 const calls=[],answers=[{prompt:ok.replace('An ultra-photorealistic film still shot on a real cinema camera','A cartoon'),idea:'x'},{prompt:ok,idea:'chalk wall'}];
 const w=await writePostPicture(text,{root,claude:async a=>{calls.push(a);return {data:answers.shift()};}});
 assert.equal(w.prompt,ok);assert.deepEqual(w.images.map(i=>i.name),['christopher-dildo.jpg'],'his face is the reference, the reference is never the picture');
 assert.match(calls[1].prompt,/not said to be ultra-photorealistic/);assert.match(calls[0].system,/Ультрареализм/);assert.match(calls[0].prompt,/Лемариус: 311 ФО/);
 assert.equal(await writePostPicture(text,{root,claude:async()=>({data:{prompt:ok.replace('"311 ФО"','"999 ФО"'),idea:''}})}),null,'numbers only from the post, else no picture');
 assert.deepEqual(realismProblems('A hyper-realistic photo'),[]);
 const src=fs.readFileSync(new URL('../awards-bot/bot.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/people\/christopher-dildo\.jpg/,'the bot never posts his reference photo');
});
