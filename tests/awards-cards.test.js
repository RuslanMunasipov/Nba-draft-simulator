import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {dailyCards,weeklyCards,raceCards,statsHtml,shotsHtml,CARD_EMOJI} from '../awards-bot/cards.js';
import {twemojiName} from '../awards-bot/render.mjs';

const s={pts:31,reb:14,ast:11,stl:2,blk:1,tov:3,fgm:12,fga:19,ftm:5,fta:6,pf:2};
const line=(a,p,h=[0],extra={})=>({d:'2026-10-21',e:'g1',a,n:'P'+a,c:'DEN',t:'2026-10-22T00:00Z',m:30,p,h,b:[],s,...extra});
const look={photo:a=>a==='1'?'data:image/png;base64,AA':null,logo:()=>null,emoji:e=>`<i>${e}</i>`};
const fonts={manrope:'data:font/ttf;base64,AA',oswald:'data:font/ttf;base64,AA'};
const who=(a,n)=>'RU '+n;

test('awards cards: the day on two cards, FBL points by the formula, the shots under them',()=>{
 const p=fblFormula(s);assert.equal(p,44);
 const cards=dailyCards('2026-10-21',{heroes:[line('1',p)],flops:[line('2',-3)],gold:[line('3',27,[])],antitop:[line('4',-12,[])]},who,look,fonts);
 assert.equal(cards.length,2);
 assert.match(cards[0],/Герои дня/);assert.match(cards[0],/Провалы дня/);assert.match(cards[0],/<span class="n">44<\/span><span class="u">ФО<\/span>/);
 assert.match(cards[0],/−3/,'a real minus sign');assert.ok(cards[0].includes(shotsHtml(s)));assert.ok(cards[0].includes(statsHtml(s)));
 assert.match(cards[0],/RU P1/);assert.match(cards[0],/Balkan Murderers/);assert.match(cards[0],/data:image\/png;base64,AA/);
 assert.match(cards[0],/class="ini">P</,'no headshot: initials');
 assert.match(cards[1],/Золотая жила/);assert.match(cards[1],/свободный агент/);assert.match(cards[1],/Антитоп НБА/);
 assert.equal(dailyCards('2026-10-21',{heroes:[],flops:[],gold:[],antitop:[]},who,look,fonts).length,0);
});

test('awards cards: the week and the race, the sixth man by his index',()=>{
 const row=(a,p)=>({a,n:'P'+a,c:'DEN',games:2,m:60,p,s,h:[1]});
 const week={n:1,start:'2026-10-19',end:'2026-10-25'};
 const wk=weeklyCards(week,{heroes:[row('1',70)],flops:[],gold:[]},who,look,fonts);
 assert.equal(wk.length,1);assert.match(wk[0],/Неделя 1/);assert.match(wk[0],/\+70/);assert.match(wk[0],/2\u00a0матча/);
 const race={mvp:[row('1',70),row('2',60)].map(x=>({...x,teams:[1]})),roy:[],mef:[{...row('3',40),teams:[],price:1400}],
  sixth:[{key:'2:5',team:2,a:'5',n:'P5',c:'BOS',games:2,bench:1,p:30,index:15}]};
 const rc=raceCards(week,race,who,look,fonts,{mvp:['2','1']});
 assert.equal(rc.length,2);assert.match(rc[0],/MVP/);assert.match(rc[0],/▲1/,'up one place since last week');
 assert.match(rc[1],/цена 1/);assert.match(rc[1],/<span class="n">15<\/span><span class="u">индекс<\/span>/);assert.match(rc[1],/30 ФО · запас 1\/2/);
});

test('awards cards: Twemoji names, every team symbol among the emoji to load',()=>{
 assert.equal(twemojiName('🐎'),'1f40e');assert.equal(twemojiName('♠️'),'2660');assert.equal(twemojiName('🏴‍☠️'),'1f3f4-200d-2620-fe0f');
 assert.equal(twemojiName('🇦🇲'),'1f1e6-1f1f2');
 for(const e of ['🐎','👑','♠️','🇦🇲','🏴‍☠️','🍋','🏜️','⚰️','🥇'])assert.ok(CARD_EMOJI.includes(e),e);
});
