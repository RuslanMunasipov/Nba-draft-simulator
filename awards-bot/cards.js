// FBL awards bot, its posts as cards: the day, the week and the awards race drawn as HTML (render.mjs turns them into
// PNG). Every number on a card is the bot's own: FBL points come from core.js, scored by the league's formula
// (fblFormula), and nothing on a card is drawn by a model. Pure: photos, logos and emoji come in through `look`.
// A card is 1080×1350 (4:5): Telegram keeps a photo's long side at 1280 px, so a taller card would come out unreadable;
// a long post is several cards sent as one album.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {int,count} from '../src/format.js';
import {esc,dayLabel} from './messages.js';
import {daysBetween,special,moved} from './core.js';

export const WIDTH=1080,HEIGHT=1350;
const range=(a,b)=>a.slice(5,7)===b.slice(5,7)?`${Number(a.slice(8,10))}–${dayLabel(b)}`:`${dayLabel(a)} – ${dayLabel(b)}`;
const signed=n=>n>0?'+'+int(n):int(n);
// Block colours: heroes gold, flops red, free agents green, the NBA antitop violet, records orange, races blue.
const TONE={hero:'#f5b301',flop:'#ff4d5e',gold:'#22c55e',antitop:'#a06bff',record:'#ff8a1f',race:'#3ea6ff'};

const css=fonts=>`
@font-face{font-family:Manrope;src:url(${fonts.manrope}) format('truetype');font-weight:200 800}
@font-face{font-family:Oswald;src:url(${fonts.oswald}) format('truetype');font-weight:200 700}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${WIDTH}px;height:${HEIGHT}px;background:#0b1020;font-family:Manrope,sans-serif;color:#eef2ff;overflow:hidden}
.card{width:${WIDTH}px;height:${HEIGHT}px;padding:44px 52px 36px;display:flex;flex-direction:column;gap:22px;
 background:radial-gradient(1200px 700px at 100% -10%,#1d2a55 0%,transparent 60%),radial-gradient(900px 600px at -20% 110%,#2a1640 0%,transparent 55%),#0b1020}
.top{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #ffffff1f;padding-bottom:20px}
.brand{font-family:Oswald;font-weight:600;font-size:28px;letter-spacing:4px;color:#9fb0ff;text-transform:uppercase}
.title{font-family:Oswald;font-weight:700;font-size:64px;line-height:1;text-transform:uppercase;letter-spacing:1px}
.sub{font-size:24px;color:#aab4d4;font-weight:600;text-align:right}
.block{display:flex;flex-direction:column;gap:12px}
.head{display:flex;align-items:center;gap:14px;font-family:Oswald;font-weight:600;font-size:34px;text-transform:uppercase;letter-spacing:1px}
.head .bar{width:10px;height:34px;border-radius:5px}
.head .emo{width:36px;height:36px}
.row{display:grid;grid-template-columns:56px 104px 1fr auto;align-items:center;gap:18px;padding:12px 20px;border-radius:22px;background:#ffffff0d;border:1px solid #ffffff14}
.place{font-family:Oswald;font-weight:700;font-size:40px;text-align:center;color:#c8d0ea}
.place .emo{width:48px;height:48px}
.photo{width:104px;height:104px;border-radius:50%;overflow:hidden;border:4px solid;background:#1a2244;display:flex;align-items:flex-end;justify-content:center}
.photo img{width:150%;margin-bottom:-6px}
.photo .ini{font-family:Oswald;font-size:40px;color:#c8d0ea;align-self:center}
.who{display:flex;flex-direction:column;gap:6px;min-width:0}
.name{font-size:34px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;gap:10px;align-items:center;font-size:21px;color:#aab4d4;font-weight:600;flex-wrap:nowrap;overflow:hidden}
.club{padding:3px 10px;border-radius:8px;background:#ffffff14;color:#dfe5ff;font-weight:700}
.team{display:inline-flex;gap:6px;align-items:center;padding:3px 12px 3px 6px;border-radius:999px;background:#ffffff10;white-space:nowrap}
.team .emo,.team img{width:30px;height:30px;object-fit:contain;padding:3px;border-radius:50%;background:#e9edff}
.stats{font-size:20px;color:#c3cbe6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats b{color:#fff;font-weight:800}
.stats .miss{color:#ff9aa5}
.fo{display:flex;flex-direction:column;align-items:flex-end;min-width:150px}
.fo .n{font-family:Oswald;font-weight:700;font-size:64px;line-height:1}
.fo .u{font-size:18px;font-weight:800;letter-spacing:2px;color:#aab4d4}
.fo .x{font-size:18px;color:#aab4d4;font-weight:600;text-align:right;white-space:nowrap}
.fo .x.miss{color:#ff9aa5}
.compact .row{grid-template-columns:44px 72px 1fr auto;padding:10px 16px;gap:14px;border-radius:18px}
.compact .photo{width:72px;height:72px;border-width:3px}
.compact .name{font-size:27px}
.compact .place{font-size:30px}
.compact .place .emo{width:36px;height:36px}
.compact .fo .n{font-size:44px}
.compact .fo{min-width:110px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.grid2 .row{grid-template-columns:40px 64px 1fr auto;padding:10px 14px;gap:12px;border-radius:18px}
.grid2 .photo{width:64px;height:64px;border-width:3px}
.grid2 .name{font-size:24px}
.grid2 .meta{font-size:17px;gap:6px}
.grid2 .team .emo,.grid2 .team img{width:24px;height:24px;padding:2px}
.grid2 .place{font-size:28px}
.grid2 .place .emo{width:34px;height:34px}
.grid2 .fo .n{font-size:40px}
.grid2 .fo .u{font-size:14px}
.grid2 .fo .x{font-size:14px}
.grid2 .fo{min-width:70px}
.move{font-size:20px;font-weight:800;margin-left:6px}
.up{color:#4ade80}.down{color:#ff6b7a}.new{color:#ffd166}
.note{font-size:21px;color:#aab4d4;font-weight:600}
.alert{padding:18px 22px;border-radius:22px;border:2px solid;background:#ffffff0a}
.alert .t{font-family:Oswald;font-weight:700;font-size:32px;text-transform:uppercase;margin-bottom:10px}
.foot{margin-top:auto;display:flex;justify-content:space-between;font-size:19px;color:#7f8bb3;font-weight:600}
`;

// The pieces of a row. look: {photo(a) → image URL or null, emoji(e) → HTML, logo(team) → image URL or null}.
const initials=n=>esc(String(n||'').split(/[\s.]+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase());
const photo=(look,r,tone)=>{const src=look.photo(r.a);return `<div class="photo" style="border-color:${tone}">${src?`<img src="${src}">`:`<span class="ini">${initials(r.n)}</span>`}</div>`;};
// Short team names for the two-column lists, where the full ones do not fit.
const SHORT=['Balkan Murderers','Saint P','Black Jacks','Алачанян','Volga Pirates','Texas Citrus','Karagali','School Shooters'];
const teamPill=(look,t,short)=>{const x=LEAGUE_TEAMS[t];if(!x)return '';const logo=look.logo(t);
 return `<span class="team">${logo?`<img src="${logo}">`:look.emoji(x.symbol)}${esc(short?SHORT[t]||x.name:x.name)}</span>`;};
const teams=(look,list,free,short)=>list?.length?list.map(t=>teamPill(look,t,short)).join(''):free?`<span class="team">${look.emoji('🆓')}${short?'свободен':'свободный агент'}</span>`:'';
const MEDALS=['🥇','🥈','🥉'];
const place=(look,i,medals)=>`<div class="place">${medals&&i<3?look.emoji(MEDALS[i]):i+1}</div>`;
// The stat line the league reads, with the missed shots that cost points (the formula takes them off).
export const statsHtml=s=>[[s.pts,'очк'],[s.reb,'подб'],[s.ast,'пер'],[s.stl,'перехв'],[s.blk,'блок'],[s.tov,'пот']].map(([v,l])=>`<b>${int(v)}</b> ${l}`).join(' · ');
// The shots: the misses are what the formula takes off, so they stand under the points.
export const shotsHtml=s=>`бр ${int(s.fgm)}/${int(s.fga)} · шт ${int(s.ftm)}/${int(s.fta)}`;
const fo=(p,extra='',sign=false,unit='ФО',cls='')=>`<div class="fo"><span class="n">${sign?signed(p):int(p)}</span><span class="u">${unit}</span>${extra?`<span class="x ${cls}">${extra}</span>`:''}</div>`;
function row(look,who,r,i,{tone,medals=false,free=false,list=r.h,extra='',sign=false,stats=true,move='',unit,short=false}={}){
 const shots=stats&&r.s&&!extra;
 return `<div class="row">${place(look,i,medals)}${photo(look,r,tone)}<div class="who"><div class="name">${esc(who(r.a,r.n))}${move}</div>
<div class="meta">${r.c?`<span class="club">${esc(r.c)}</span>`:''}${teams(look,list,free,short)}</div>${stats&&r.s?`<div class="stats">${statsHtml(r.s)}</div>`:''}</div>${fo(r.p,shots?shotsHtml(r.s):extra,sign,unit,shots?'miss':'')}</div>`;
}
const block=(look,title,emo,tone,rows,cls='')=>rows.length?`<div class="block ${cls}"><div class="head"><span class="bar" style="background:${tone}"></span>${look.emoji(emo)}${esc(title)}</div>${rows.join('')}</div>`:'';
const page=(fonts,{title,sub,brand='FBL · сезон 2026/27',foot=''},body)=>`<!doctype html><html><head><meta charset="utf-8"><style>${css(fonts)}</style></head><body><div class="card">
<div class="top"><div><div class="brand">${esc(brand)}</div><div class="title">${esc(title)}</div></div><div class="sub">${sub}</div></div>${body}<div class="foot"><span>ФО по формуле лиги FBL</span><span>${esc(foot)}</span></div></div></body></html>`;

// A record alert of the day: a new season record or antirecord, or a new entry in the season's top 3.
function recordAlert(look,who,{kind,rank,line,previous}){
 const best=kind==='best',tone=best?TONE.record:TONE.flop,mark=special(line.d);
 const title=rank===1?(best?'🚨 Рекорд сезона':'🗑 Антирекорд сезона'):(best?`📈 ${rank}-е место в топ-3 сезона`:`📉 ${rank}-е место в антитопе сезона`);
 return `<div class="alert" style="border-color:${tone}"><div class="t" style="color:${tone}">${esc(title)}${mark?' '+look.emoji(mark):''}</div>${row(look,who,line,0,{tone,free:true})}
${previous?`<div class="note" style="margin-top:10px">Прежний ${best?'рекорд':'антирекорд'} — ${esc(who(previous.a,previous.n))}, ${int(previous.p)} ФО, продержался ${count(daysBetween(previous.d,line.d),'день','дня','дней')}</div>`:''}</div>`;
}

// The day: card 1 is the league's heroes and flops, card 2 the free agents, the NBA antitop, the season records and the
// postponed games (only when it has something).
export function dailyCards(day,blocks,who,look,fonts,{news=[],postponed=[]}={}){
 const sub=`${esc(dayLabel(day))}<br>игровой день США`,cards=[];
 const one=[block(look,'Герои дня','⭐',TONE.hero,blocks.heroes.map((l,i)=>row(look,who,l,i,{tone:TONE.hero,medals:true}))),
  block(look,'Провалы дня','💩',TONE.flop,blocks.flops.map((l,i)=>row(look,who,l,i,{tone:TONE.flop})))].join('');
 if(one)cards.push(page(fonts,{title:'Итоги дня',sub,foot:'1 / 2'},one));
 const two=[block(look,'Золотая жила','🆓',TONE.gold,blocks.gold.map((l,i)=>row(look,who,{...l,h:[]},i,{tone:TONE.gold,medals:true,free:true})),'compact'),
  block(look,'Антитоп НБА','🤡',TONE.antitop,blocks.antitop.map((l,i)=>row(look,who,l,i,{tone:TONE.antitop,free:true})),'compact'),
  ...news.slice(0,2).map(x=>recordAlert(look,who,x)),
  postponed.length?`<div class="note">⏸ Перенесены: ${postponed.map(g=>esc(`${g.away} — ${g.home}`)).join(', ')}</div>`:''].join('');
 if(two)cards.push(page(fonts,{title:'Итоги дня',sub,foot:'2 / 2'},two));
 if(cards.length===1)cards[0]=cards[0].replace('1 / 2','');
 return cards;
}

// The week: heroes, flops and free agents of the week on one card, the points summed over its games.
export function weeklyCards(week,blocks,who,look,fonts){
 const games=r=>count(r.games,'матч','матча','матчей');
 const body=[block(look,'Герои недели','⭐',TONE.hero,blocks.heroes.map((r,i)=>row(look,who,r,i,{tone:TONE.hero,medals:true,extra:games(r),sign:true,stats:false})),'compact'),
  block(look,'Провалы недели','💩',TONE.flop,blocks.flops.map((r,i)=>row(look,who,r,i,{tone:TONE.flop,extra:games(r),sign:true,stats:false})),'compact'),
  block(look,'Золотая жила недели','🆓',TONE.gold,blocks.gold.map((r,i)=>row(look,who,{...r,h:[]},i,{tone:TONE.gold,medals:true,free:true,extra:games(r),sign:true,stats:false})),'compact')].join('');
 return body?[page(fonts,{title:`Неделя ${week.n}`,sub:`${esc(range(week.start,week.end))}<br>итоги недели`},body)]:[];
}

// The awards race after a week: card 1 the MVP race (top 10, two columns), card 2 rookie of the year, Mef player and the
// sixth man. Arrows: places moved since last week's post.
const arrow=n=>n===null?'<span class="move new">NEW</span>':n>0?`<span class="move up">▲${n}</span>`:n<0?`<span class="move down">▼${-n}</span>`:'';
const raceKey=r=>r.key||r.a;
export function raceCards(week,r,who,look,fonts,previous={}){
 const mv=(list,key,x)=>previous[key]?arrow(moved(raceKey(x),list,previous[key])):'';
 const sub=`после ${week.n}-й недели<br>${esc(range(week.start,week.end))}`;
 // A race in two columns (places 1–5 and 6–10 for the MVP, 1–3 and 4–5 for the others), short team names.
 const race=(title,emo,list,key,opts=()=>({}))=>{
  if(!list.length)return '';
  const line=(x,i)=>{const {row:shown=x,...o}=opts(x);return row(look,who,shown,i,{tone:TONE.race,medals:true,list:x.teams,stats:false,short:true,move:mv(list,key,x),...o});};
  const half=Math.ceil(list.length/2),col=(from,to)=>`<div class="block">${list.slice(from,to).map((x,i)=>line(x,from+i)).join('')}</div>`;
  return `<div class="block"><div class="head"><span class="bar" style="background:${TONE.race}"></span>${look.emoji(emo)}${esc(title)}</div><div class="grid2">${col(0,half)}${col(half,list.length)}</div></div>`;
 };
 const cards=[];
 const mvp=race('MVP','🏆',r.mvp,'mvp'),roy=race('Новичок года','🌱',r.roy.slice(0,5),'roy');
 if(mvp||roy)cards.push(page(fonts,{title:'Гонка за награды',sub,foot:'1 / 2'},mvp+roy));
 const mef=race('Mef player','💊',r.mef,'mef',x=>({free:true,extra:`цена ${int(x.price)}`}));
 // The sixth man ranks by his index (FBL points × bench games / games), not by points: the big number is the index.
 const sixth=race('Шестой игрок','🪑',r.sixth,'sixth',x=>({row:{...x,p:x.index},list:[x.team],unit:'индекс',extra:`${int(x.p)} ФО · запас ${x.bench}/${x.games}`}));
 if(mef||sixth)cards.push(page(fonts,{title:'Гонка за награды',sub,foot:'2 / 2'},[mef,sixth].join('')));
 if(cards.length===1)cards[0]=cards[0].replace('1 / 2','').replace('2 / 2','');
 return cards;
}
// Every emoji a card may show, for the renderer to load once.
export const CARD_EMOJI=['⭐','💩','🆓','🤡','🏆','🌱','💊','🪑','🥇','🥈','🥉','🎄',...LEAGUE_TEAMS.map(t=>t.symbol)];
