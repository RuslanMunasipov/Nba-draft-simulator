import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {form,dailyBlocks,bricks,FORM_DAYS} from '../awards-bot/core.js';
import {dayAlbum,weekAlbum,monthAlbum,markOf,statsHtml,shotsHtml,dateTag,weekTag,monthTag,SLOTS,CARD_EMOJI} from '../awards-bot/cards.js';
import {holidayOf,westernEaster,orthodoxEaster,HOLIDAYS,HOLIDAY_EMOJI} from '../awards-bot/holidays.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {twemojiName,holidayArt} from '../awards-bot/render.mjs';

const s={pts:31,reb:14,ast:11,stl:2,blk:1,tov:3,fgm:12,fga:19,ftm:5,fta:6,pf:2};
const line=(a,p,h=[0],extra={})=>({d:'2026-10-21',e:'g1',a,n:'P'+a,c:'DEN',t:'2026-10-22T00:00Z',m:30,p,h,b:[],s,...extra});
const look={photo:a=>a==='1'?'data:image/png;base64,AA':null,logo:()=>null,emoji:e=>`<i class="emo">${e}</i>`};
const fonts={manrope:'data:font/ttf;base64,AA',oswald:'data:font/ttf;base64,AA'};
const who=(a,n)=>'RU '+n;
const week={n:1,start:'2026-10-19',end:'2026-10-25'};

test('awards cards: the day is an opener and two cards, FBL points by the formula, fixed slots',()=>{
 const p=fblFormula(s);assert.equal(p,44);
 const {cards,caption}=dayAlbum('2026-10-21',{heroes:[line('1',p)],flops:[line('2',-3)],gold:[line('3',27,[])],antitop:[]},who,look,fonts,{week});
 assert.equal(cards.length,3,'opener + two cards: an album of at most four');
 assert.match(cards[0],/Итоги игрового дня/);assert.match(cards[0],/21 октября 2026/);assert.match(cards[0],/неделя 1/);
 assert.match(cards[1],/<span class="n">44<\/span><span class="u">ФО<\/span>/);assert.match(cards[1],/−3/,'a real minus sign');
 assert.ok(cards[1].includes(shotsHtml(s)));assert.ok(cards[1].includes(statsHtml(s)));assert.match(cards[1],/RU P1/);
 assert.equal((cards[1].match(/class="row[ "]/g)||[]).length,SLOTS.hero+SLOTS.flop,'every slot drawn');
 assert.equal((cards[1].match(/class="row empty"/g)||[]).length,4,'missing players are dashes, the layout stays');
 assert.match(cards[2],/Золотая жила/);assert.match(cards[2],/Антитоп НБА/);
 assert.equal(caption,'<b>⭐ Итоги игрового дня · 21 октября 2026</b>\nГерой дня: RU P1 — 44 ФО · провал дня: RU P2 — −3 ФО\n\n#итоги_дня #неделя_1 #октябрь_2026 #дата_21_10_2026');
});

test('awards cards: the opener carries the league\'s logo and name, the nomination\'s icon without the logo',()=>{
 const blocks={heroes:[],flops:[],gold:[],antitop:[]};
 const withLogo=dayAlbum('2026-10-21',blocks,who,{...look,leagueLogo:()=>'data:image/png;base64,LOGO'},fonts).cards[0];
 assert.match(withLogo,/<img src="data:image\/png;base64,LOGO"/);assert.match(withLogo,/FANTASY BROTHERS LEAGUE · FBL/);
 assert.doesNotMatch(withLogo,/<i class="emo"[^>]*>⭐/);
 assert.match(dayAlbum('2026-10-21',blocks,who,look,fonts).cards[0],/⭐/);
});

test('awards cards: hashtags navigate by type, week, month and date',()=>{
 assert.equal(dateTag('2027-01-07'),'#дата_07_01_2027');assert.equal(weekTag(12),'#неделя_12');assert.equal(monthTag('2027-02-11'),'#февраль_2027');
 const wk=weekAlbum(week,{heroes:[],flops:[],gold:[]},{mvp:[],roy:[],mef:[],sixth:[]},{best:[],worst:[]},who,look,fonts);
 assert.match(wk.caption,/#итоги_недели #гонка_за_награды #неделя_1 #октябрь_2026$/);
 const mo=monthAlbum('2026-10',[{pos:'PG',row:null}],who,look,fonts);assert.match(mo.caption,/#пятёрка_месяца #октябрь_2026$/);
});

test('awards cards: the week album is four cards, the sixth man by his index, arrows since last week',()=>{
 const row=(a,p)=>({a,n:'P'+a,c:'DEN',games:2,m:60,p,s,h:[1]});
 const r={mvp:[row('1',70),row('2',60)].map(x=>({...x,teams:[1]})),roy:[],mef:[{...row('3',40),teams:[],price:1400}],
  sixth:[{key:'2:5',team:2,a:'5',n:'P5',c:'BOS',games:2,bench:1,p:30,index:15}]};
 const {cards}=weekAlbum(week,{heroes:[row('1',70)],flops:[],gold:[]},r,{best:[line('9',50)],worst:[line('8',-12)]},who,look,fonts,{previous:{mvp:['2','1']}});
 assert.equal(cards.length,4);assert.match(cards[0],/Итоги недели/);
 assert.match(cards[1],/\+70/);assert.match(cards[1],/2 матча/);
 assert.match(cards[2],/▲1/,'up one place since last week');
 assert.match(cards[3],/<span class="n">15<\/span><span class="u">индекс<\/span>/);assert.match(cards[3],/30 ФО · запас 1\/2/);assert.match(cards[3],/Рекорды сезона/);
});

test('awards cards: a holiday dresses the cards, the layout stays',()=>{
 const blocks={heroes:[line('1',44)],flops:[],gold:[],antitop:[]};
 const plain=dayAlbum('2026-10-21',blocks,who,look,fonts).cards,dressed=dayAlbum('2026-10-31',blocks,who,look,fonts,{holiday:holidayOf('2026-10-31')}).cards;
 assert.match(dressed[1],/Хэллоуин/);assert.match(dressed[1],/class="decor"/);assert.match(dressed[0],/🎃/);
 assert.doesNotMatch(plain[1],/class="decor"/);
 const strip=h=>h.replace(/<style>.*?<\/style>/s,'').replace(/<div class="decor">.*?<\/div>\n/s,'').replace(/<span class="badge">.*?<\/span>/,'').replace(/ (themed|framed)/g,'').replace(/\s+/g,'');
 assert.equal(strip(dressed[1]).replace('31октября','21октября'),strip(plain[1]),'same layout, only the decor differs');
});

test('awards cards: a holiday with a frame lays it behind the panels, without one the emoji decor',()=>{
 const framedLook={...look,frame:key=>key==='halloween'?'data:image/webp;base64,AA':null};
 const blocks={heroes:[line('1',44)],flops:[],gold:[],antitop:[]};
 const h=dayAlbum('2026-10-31',blocks,who,framedLook,fonts,{holiday:holidayOf('2026-10-31')}).cards;
 for(const card of h){assert.match(card,/class="frame" style="border-image-source:url\(data:image\/webp;base64,AA\)"/);assert.match(card,/class="card[^"]* framed"/);assert.doesNotMatch(card,/class="decor"/);}
 const x=dayAlbum('2026-12-25',blocks,who,framedLook,fonts,{holiday:holidayOf('2026-12-25')}).cards;
 assert.match(x[1],/class="decor"/);assert.doesNotMatch(x[1],/class="frame"/);
});

test('awards cards: a holiday background beats its frame, styles the titles, and the holiday logo takes the opener',()=>{
 const art={...look,frame:()=> 'data:image/webp;base64,FRAME',background:key=>key==='halloween'?'data:image/webp;base64,BG':null,
  leagueLogo:key=>key==='halloween'?'data:image/png;base64,PUMPKIN':'data:image/png;base64,LOGO'};
 const blocks={heroes:[line('1',44)],flops:[],gold:[],antitop:[]};
 const h=dayAlbum('2026-10-31',blocks,who,art,fonts,{holiday:holidayOf('2026-10-31')}).cards;
 for(const card of h){assert.match(card,/class="bg" style="background-image:url\(data:image\/webp;base64,BG\)"/);assert.doesNotMatch(card,/class="frame"/);
  assert.match(card,/class="card[^"]* themed framed"/);}
 assert.match(h[0],/data:image\/png;base64,PUMPKIN/,'the holiday logo');
 const x=dayAlbum('2026-12-25',blocks,who,art,fonts,{holiday:holidayOf('2026-12-25')}).cards;
 assert.match(x[1],/class="frame"/,'no background: the frame');assert.match(x[0],/data:image\/png;base64,LOGO/,'no holiday logo: the league\'s');
 const plain=dayAlbum('2026-10-21',blocks,who,art,fonts).cards;
 assert.doesNotMatch(plain[1],/class="card[^"]*themed|class="bg"|class="frame"/,'an ordinary day stays plain');
});

test('awards cards: the holiday calendar, Easter both ways, the season\'s events',()=>{
 assert.deepEqual([westernEaster(2027),orthodoxEaster(2027),westernEaster(2026),orthodoxEaster(2026),orthodoxEaster(2025)],['2027-03-28','2027-05-02','2026-04-05','2026-04-12','2025-04-20']);
 const name=d=>holidayOf(d)?.name||null;
 assert.equal(name('2026-10-20'),'Старт сезона FBL');assert.equal(name('2026-10-31'),'Хэллоуин');
 assert.equal(name('2026-11-26'),'День благодарения');assert.equal(name('2026-11-25'),'День благодарения','the day before counts too');
 assert.equal(name('2026-12-25'),'Рождество');assert.equal(name('2027-01-01'),'Новый год');assert.equal(name('2027-01-07'),'Рождество Христово');
 assert.equal(name('2027-01-18'),'День Мартина Лютера Кинга');assert.equal(name('2027-02-11'),'Дедлайн обменов НБА');
 assert.equal(name('2027-03-08'),'8 марта','a one-day holiday beats Maslenitsa week');assert.equal(name('2027-03-10'),'Масленица');
 assert.equal(name('2027-03-28'),'Пасха');assert.equal(name('2027-05-02'),'Пасха');assert.equal(name('2027-04-17'),'Старт плей-офф');
 assert.equal(name('2026-10-21'),null);
 assert.ok(HOLIDAYS.length>=25);for(const e of HOLIDAY_EMOJI)assert.ok(CARD_EMOJI.includes(e),e);
});

test('awards cards: form marks, on fire, frozen and bricks',()=>{
 const days=['2026-10-20','2026-10-21','2026-10-22'];
 // Player 1 tops every day, player 2 is the worst every day; player 3 is never a hero (a and b outscore him).
 const lines=days.flatMap(d=>[line('1',40,[0],{d}),line('2',-8,[1],{d,m:30}),line('3',10,[2],{d}),line('a',30,[3],{d}),line('b',25,[4],{d})]);
 const f=form(lines,'2026-10-22');
 assert.equal(f.get('1').hero,3);assert.equal(f.get('1').heroRun,3);assert.equal(f.get('1').fire,2,'3 days in a row: ablaze');
 assert.equal(form(lines,'2026-10-21').get('1').fire,1,'2 days in a row: on fire');
 assert.equal(f.get('2').ice,true);assert.equal(form(lines,'2026-10-21').get('2').ice,false);
 assert.equal(FORM_DAYS,7);
 assert.deepEqual(markOf('hero',lines[0],f.get('1')),{cls:'fire2',emoji:'🔥',text:'3'});
 assert.deepEqual(markOf('flop',lines[1],f.get('2')),{cls:'ice',emoji:'🧊',text:'3'});
 const brick={...line('4',-5),s:{...s,fgm:3,fga:15}};assert.ok(bricks(brick));
 assert.deepEqual(markOf('flop',brick,undefined),{cls:'bricks',emoji:'🧱',text:'12'});
 assert.equal(markOf('hero',lines[2],f.get('3')),null);
 assert.equal(dailyBlocks(lines.filter(l=>l.d==='2026-10-22')).heroes[0].a,'1');
});

test('awards cards: Twemoji names, every team symbol among the emoji to load',()=>{
 assert.equal(twemojiName('🐎'),'1f40e');assert.equal(twemojiName('♠️'),'2660');assert.equal(twemojiName('🏴‍☠️'),'1f3f4-200d-2620-fe0f');
 assert.equal(twemojiName('🇦🇲'),'1f1e6-1f1f2');
 for(const e of ['🐎','👑','♠️','🇦🇲','🏴‍☠️','🍋','🏜️','⚰️','🥇','🔥','🧊','🧱'])assert.ok(CARD_EMOJI.includes(e),e);
});

test('awards cards: a holiday\'s own layers take the opener\'s emblem and title, the date stays the code\'s',()=>{
 const blocks={heroes:[line('1',44)],flops:[],gold:[],antitop:[]},halloween=holidayOf('2026-10-31');
 const layers={...look,background:key=>key==='halloween'?'data:image/png;base64,BG':null,emblem:key=>key==='halloween'?'data:image/png;base64,EMBLEM':null,
  title:(key,nom)=>key==='halloween'&&nom!=='month'?`data:image/png;base64,TITLE-${nom}`:null};
 const day=dayAlbum('2026-10-31',blocks,who,layers,fonts,{holiday:halloween}).cards;
 assert.match(day[0],/<img class="emblem art trim" src="data:image\/png;base64,EMBLEM">/);assert.doesNotMatch(day[0],/<svg class="emblem"/,'the drawn emblem gives way');
 assert.match(day[0],/<img class="tart trim" src="data:image\/png;base64,TITLE-day" alt="Итоги игрового дня">/);assert.doesNotMatch(day[0],/class="otitle"/);
 assert.match(day[0],/<div class="odate">31 октября 2026<\/div>/,'the date is drawn by the code');
 for(const card of day)assert.match(card,/class="bg" style="background-image:url\(data:image\/png;base64,BG\)"/,'the background under every card');
 assert.doesNotMatch(day[1],/EMBLEM|TITLE/,'the layers only dress the opener');
 const wk=weekAlbum(week,{heroes:[],flops:[],gold:[]},{mvp:[],roy:[],mef:[],sixth:[]},{best:[],worst:[]},who,layers,fonts,{holiday:halloween}).cards[0];
 assert.match(wk,/TITLE-week/);
 const mo=monthAlbum('2026-10',[{pos:'PG',row:null}],who,layers,fonts,{holiday:halloween}).cards[0];
 assert.match(mo,/EMBLEM/);assert.match(mo,/<div class="otitle">Символическая пятёрка<\/div>/,'no month title layer: the drawn title');
 const xmas=dayAlbum('2026-12-25',blocks,who,layers,fonts,{holiday:holidayOf('2026-12-25')}).cards[0];
 assert.match(xmas,/<svg class="emblem"/);assert.match(xmas,/class="otitle"/,'a holiday without layers looks as before');
 assert.doesNotMatch(dayAlbum('2026-10-21',blocks,who,layers,fonts).cards[0],/EMBLEM|TITLE|class="bg"/,'an ordinary day stays plain');
});

test('awards cards: the league\'s holiday layers on disk, design/holidays first, then the older art',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fbl-design-')),drawn=path.join(dir,'drawn')+'/';
 for(const d of ['holidays','backgrounds','logos','drawn'])fs.mkdirSync(path.join(dir,d));
 const put=(f,body)=>fs.writeFileSync(path.join(dir,f),body);
 put('drawn/christmas-bg.webp','DRAWN');put('backgrounds/halloween.jpg','OLD');put('holidays/halloween-bg.png','NEW');
 put('holidays/halloween-emblem.webp','EMB');put('holidays/halloween-title-week.png','WEEK');put('logos/halloween.png','PUMPKIN');
 const art=holidayArt(pathToFileURL(dir+'/'),pathToFileURL(drawn));
 const body=uri=>uri&&Buffer.from(uri.split(',')[1],'base64').toString();
 assert.equal(body(art.background('halloween')),'NEW','design/holidays/<key>-bg beats design/backgrounds');
 assert.match(art.background('halloween'),/^data:image\/png;base64,/);
 assert.equal(body(art.background('christmas')),'DRAWN','no layer: the drawn background');
 assert.equal(art.background('easter'),null);assert.equal(art.background(null),null);
 assert.equal(body(art.emblem('halloween')),'EMB');assert.match(art.emblem('halloween'),/^data:image\/webp;/);
 assert.equal(body(art.title('halloween','week')),'WEEK');assert.equal(art.title('halloween','day'),null);assert.equal(art.emblem('christmas'),null);
 assert.equal(body(art.leagueLogo('halloween')),'PUMPKIN');
});

test('awards cards: every file in design/holidays is named <holiday key>-<layer>',()=>{
 const dir=new URL('../design/holidays/',import.meta.url),keys=new Set(HOLIDAYS.map(h=>h.key));
 const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>!f.startsWith('.')&&f!=='README.md'):[];
 for(const f of files){
  const m=f.match(/^(.+)-(bg|emblem|title-day|title-week|title-month)\.(png|webp|jpe?g)$/i);
  assert.ok(m&&keys.has(m[1]),`design/holidays/${f}: expected <key>-bg|emblem|title-day|title-week|title-month.png, the key from holidays.js`);
 }
});
