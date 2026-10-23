// FBL awards bot, its posts as cards (league chat, 22.10.2026): every post is one album of at most four cards, the first
// an opener (the nomination's emblem, its title and date: what a hashtag search shows), and one caption with the
// hashtags that navigate the chat (#итоги_дня, #неделя_N, #октябрь_2026, #дата_21_10_2026). One style for all: the
// layout, the colours and the number of slots never change, only the players, their numbers and the decor of a holiday
// (holidays.js). A player's form marks his headshot: 🔥 a regular among the day's heroes, 🧊 among its flops, 🧱 a flop
// of missed shots (core.js form()). Every number is the bot's own: FBL points come from core.js, scored by the league's
// formula (fblFormula); nothing on a card is drawn by a model. Pure: photos, logos and emoji come in through `look`.
// A card is 1080×1350 (4:5): Telegram keeps a photo's long side at 1280 px, so a taller card would come out unreadable.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {int,count} from '../src/format.js';
import {esc,dayLabel} from './messages.js';
import {special,moved,bricks} from './core.js';
import {HOLIDAY_EMOJI} from './holidays.js';

export const WIDTH=1080,HEIGHT=1350;
const MONTHS_NOM=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const range=(a,b)=>a.slice(5,7)===b.slice(5,7)?`${Number(a.slice(8,10))}–${dayLabel(b)}`:`${dayLabel(a)} – ${dayLabel(b)}`;
const year=d=>d.slice(0,4);
const signed=n=>n>0?'+'+int(n):int(n);
// The fixed palette. Blocks: heroes gold, flops red, free agents green, the NBA antitop violet, records orange, races blue.
const TONE={hero:'#f5b301',flop:'#ff4d5e',gold:'#22c55e',antitop:'#a06bff',record:'#ff8a1f',race:'#3ea6ff'};
// The nominations: their key (a holiday's title layer, design/holidays/<holiday>-title-<key>), emblem icon, title, colours
// and hashtag.
export const NOMINATION={
 day:{key:'day',icon:'⭐',title:'Итоги игрового дня',ring:['#ffcf40','#ff8a1f'],tag:'итоги_дня'},
 week:{key:'week',icon:'🗓️',title:'Итоги недели',ring:['#3ea6ff','#7c5cff'],tag:'итоги_недели'},
 month:{key:'month',icon:'🏅',title:'Символическая пятёрка',ring:['#22c55e','#ffcf40'],tag:'пятёрка_месяца'},
};
// Slots per block: a block always has them all, an empty one is drawn as a dash, so the layout never moves.
export const SLOTS={hero:3,flop:3,gold:3,antitop:3,weekHero:3,weekFlop:3,weekGold:3,mvp:10,roy:4,mef:4,sixth:4,record:3};

// --- Hashtags: the type of the post, its week, its month and its date. Telegram links #words of letters, digits and _.
export const monthTag=d=>`#${MONTHS_NOM[Number(d.slice(5,7))-1]}_${year(d)}`;
export const dateTag=d=>`#дата_${d.slice(8,10)}_${d.slice(5,7)}_${year(d)}`;
export const weekTag=n=>`#неделя_${n}`;

const css=(fonts,accent)=>`
@font-face{font-family:Manrope;src:url(${fonts.manrope}) format('truetype');font-weight:200 800}
@font-face{font-family:Oswald;src:url(${fonts.oswald}) format('truetype');font-weight:200 700}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${WIDTH}px;height:${HEIGHT}px;background:#0b1020;font-family:Manrope,sans-serif;color:#eef2ff;overflow:hidden}
.card{position:relative;width:${WIDTH}px;height:${HEIGHT}px;padding:44px 52px 36px;display:flex;flex-direction:column;gap:20px;overflow:hidden;
 background:radial-gradient(1200px 700px at 100% -10%,${accent[0]}33 0%,transparent 60%),radial-gradient(900px 600px at -20% 110%,${accent[1]}2e 0%,transparent 55%),#0b1020}
.decor{position:absolute;inset:0;pointer-events:none;z-index:0}
.decor .emo{position:absolute}
.card>:where(:not(.decor,.frame,.bg)){position:relative;z-index:1}
.top{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid;border-image:linear-gradient(90deg,${accent[0]},${accent[1]}) 1;padding-bottom:18px}
.brand{font-family:Oswald;font-weight:600;font-size:28px;letter-spacing:4px;color:${accent[0]};text-transform:uppercase;display:flex;gap:14px;align-items:center}
.badge{display:inline-flex;gap:8px;align-items:center;font-family:Manrope;letter-spacing:0;text-transform:none;font-size:22px;font-weight:800;color:#0b1020;background:linear-gradient(90deg,${accent[0]},${accent[1]});padding:4px 14px 4px 8px;border-radius:999px}
.badge .emo{width:28px;height:28px}
.title{font-family:Oswald;font-weight:700;font-size:64px;line-height:1;text-transform:uppercase;letter-spacing:1px}
.sub{font-size:24px;color:#aab4d4;font-weight:600;text-align:right}
.block{display:flex;flex-direction:column;gap:10px}
.head{display:flex;align-items:center;gap:14px;font-family:Oswald;font-weight:600;font-size:32px;text-transform:uppercase;letter-spacing:1px}
.head .bar{width:10px;height:32px;border-radius:5px}
.head .emo{width:34px;height:34px}
.row{display:grid;grid-template-columns:56px 112px 1fr auto;align-items:center;gap:18px;padding:10px 20px;border-radius:22px;background:#ffffff0d;border:1px solid #ffffff14;height:146px}
.row.empty{color:#5d688c;font-size:26px;font-weight:700}
.place{font-family:Oswald;font-weight:700;font-size:40px;text-align:center;color:#c8d0ea}
.place .emo{width:48px;height:48px}
.ph{position:relative;width:112px;height:112px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.photo{width:104px;height:104px;border-radius:50%;overflow:hidden;border:4px solid;background:#1a2244;display:flex;align-items:flex-end;justify-content:center;position:relative}
.photo img{width:150%;margin-bottom:-6px}
.photo .ini{font-family:Oswald;font-size:40px;color:#c8d0ea;align-self:center}
.mark{position:absolute;right:-12px;bottom:-4px;display:inline-flex;align-items:center;gap:2px;padding:2px 9px 2px 4px;border-radius:999px;font-family:Oswald;font-weight:700;font-size:20px;color:#fff;z-index:2;box-shadow:0 2px 8px #0008}
.mark .emo{width:26px;height:26px}
.fire .photo{border-color:#ff7a1a!important;box-shadow:0 0 0 3px #ff3d0099,0 0 26px 6px #ff7a1acc}
.fire2 .photo{border-color:#ffb020!important;box-shadow:0 0 0 4px #ff3d00cc,0 0 40px 12px #ff5a1aee}
.fire .mark,.fire2 .mark{background:linear-gradient(90deg,#ff3d00,#ffb020)}
.ice .photo{border-color:#9be8ff!important;box-shadow:0 0 0 3px #38bdf899,0 0 26px 6px #7dd3fccc}
.ice .photo img{filter:saturate(.35) brightness(1.08) hue-rotate(170deg)}
.ice .photo:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#e0f7ff55,#7dd3fc22 45%,#e0f7ff66)}
.ice .mark{background:linear-gradient(90deg,#0ea5e9,#7dd3fc)}
.bricks .ph{background:repeating-linear-gradient(0deg,#a8442f 0 12px,#4a1b14 12px 14px)}
.bricks .photo{border-color:#c2553f!important}
.bricks .mark{background:linear-gradient(90deg,#7c2d12,#c2410c)}
.who{display:flex;flex-direction:column;gap:6px;min-width:0}
.name{font-size:34px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;gap:10px;align-items:center;font-size:21px;color:#aab4d4;font-weight:600;flex-wrap:nowrap;overflow:hidden}
.club{padding:3px 10px;border-radius:8px;background:#ffffff14;color:#dfe5ff;font-weight:700}
.team{display:inline-flex;gap:6px;align-items:center;padding:3px 12px 3px 6px;border-radius:999px;background:#ffffff10;white-space:nowrap}
.team .emo,.team img{width:30px;height:30px;object-fit:contain;padding:3px;border-radius:50%;background:#e9edff}
.stats{font-size:20px;color:#c3cbe6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats b{color:#fff;font-weight:800}
.fo{display:flex;flex-direction:column;align-items:flex-end;min-width:150px}
.fo .n{font-family:Oswald;font-weight:700;font-size:64px;line-height:1}
.fo .u{font-size:18px;font-weight:800;letter-spacing:2px;color:#aab4d4}
.fo .x{font-size:18px;color:#aab4d4;font-weight:600;text-align:right;white-space:nowrap}
.fo .x.miss{color:#ff9aa5}
.compact .row{grid-template-columns:44px 84px 1fr auto;padding:6px 16px;gap:14px;border-radius:18px;height:96px}
.compact .ph{width:84px;height:84px}
.compact .photo{width:76px;height:76px;border-width:3px}
.compact .name{font-size:27px}
.compact .place{font-size:30px}
.compact .place .emo{width:36px;height:36px}
.compact .fo .n{font-size:44px}
.compact .fo{min-width:110px}
.compact .mark{font-size:16px;right:-8px}.compact .mark .emo{width:20px;height:20px}
.tall .row{height:118px;padding:8px 16px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}
.grid2 .row{grid-template-columns:40px 70px 1fr auto;padding:6px 14px;gap:12px;border-radius:18px;height:84px}
.grid2 .ph{width:70px;height:70px}
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
.grid2 .row.empty{font-size:20px}
.move{font-size:20px;font-weight:800;margin-left:6px}
.up{color:#4ade80}.down{color:#ff6b7a}.new{color:#ffd166}
.note{font-size:21px;color:#aab4d4;font-weight:600}
.alert{padding:10px 16px;border-radius:22px;border:2px solid;background:#ffffff0a}
.alert .t{font-family:Oswald;font-weight:700;font-size:26px;text-transform:uppercase;margin-bottom:6px}
.foot{margin-top:auto;display:flex;justify-content:space-between;font-size:19px;color:#7f8bb3;font-weight:600}
.opener{align-items:center;justify-content:center;text-align:center;gap:28px}
.emblem{width:600px;height:600px}
.emblem.art{object-fit:contain;filter:drop-shadow(0 18px 42px #000000d9)}
.tart{display:block;max-width:960px;max-height:230px;object-fit:contain;filter:drop-shadow(0 6px 24px #000000e6)}
.otitle{font-family:Oswald;font-weight:700;font-size:90px;line-height:1;text-transform:uppercase;letter-spacing:2px}
.odate{font-size:44px;font-weight:800;color:#dfe5ff}
.osub{font-size:28px;font-weight:600;color:#aab4d4;display:flex;gap:10px;align-items:center;justify-content:center}
.osub .emo{width:34px;height:34px}
.opener .foot{position:absolute;left:52px;right:52px;bottom:36px}
.frame{position:absolute;inset:0;z-index:0;pointer-events:none;border-style:solid;border-width:270px 130px;border-image-slice:20% 12%;border-image-repeat:stretch}
.framed .row{background:#0d1430eb;border-color:#ffffff1f}
.framed .alert{background:#0d1430eb}
.framed .title,.framed .sub,.framed .head,.framed .brand,.framed .foot{text-shadow:0 2px 12px #000,0 0 4px #000}
.framed .otitle,.framed .odate,.framed .osub{text-shadow:0 2px 16px #000,0 0 6px #000}
.bg{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center}
.bg:after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 58%,#0b1020d9 0%,#0b1020a6 55%,#0b102040 100%)}
.opener .bg:after{background:radial-gradient(ellipse at 50% 50%,#0b1020b3 0%,#0b102066 55%,#0b102000 100%)}
.themed .title,.themed .otitle{background:linear-gradient(180deg,#ffffff 0%,${accent[0]} 40%,${accent[1]} 62%,#ffffff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
 -webkit-text-stroke:1.5px #00000080;text-shadow:none;filter:drop-shadow(0 0 16px ${accent[0]}b3) drop-shadow(0 4px 4px #000000cc)}
.themed .otitle{white-space:nowrap}
`;

// --- The decor of a holiday: its background (a full artwork in the style of a special-edition card: design/backgrounds,
// else holiday-frames.mjs --backgrounds), else its frame (an artwork along the edges), both behind the panels and the
// text; else its emoji at fixed places along the edges (faint on content cards, bold on the opener). A holiday also
// styles the big titles in its colours (.themed).
const SPOTS=[[1,1,96],[87,1,84],[46,0.5,60],[-1,30,80],[91,24,70],[1,58,66],[90,52,92],[-2,84,88],[88,86,78],[30,93,64],[62,92,72],[70,8,58]];
function decor(look,holiday,bold){
 if(!holiday)return '';
 const bg=look.background?.(holiday.key);
 if(bg)return `<div class="bg" style="background-image:url(${bg})"></div>`;
 const frame=look.frame?.(holiday.key);
 if(frame)return `<div class="frame" style="border-image-source:url(${frame})"></div>`;
 return `<div class="decor">${SPOTS.map(([x,y,s],i)=>look.emoji(holiday.decor[i%holiday.decor.length])
  .replace('class="emo"',`class="emo" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;font-size:${s}px;opacity:${bold?0.9:0.18};transform:rotate(${(i*37)%50-25}deg)"`)).join('')}</div>`;
}
const framed=(look,holiday)=>!holiday?'':` themed${look.background?.(holiday.key)||look.frame?.(holiday.key)?' framed':''}`;
const badge=(look,holiday)=>holiday?`<span class="badge">${look.emoji(holiday.emoji)}${esc(holiday.name)}</span>`:'';
const ACCENT=['#3ea6ff','#a06bff'];

// --- A row: place, headshot (with his form), name, NBA club, league teams, stat line, the big number.
const initials=n=>esc(String(n||'').split(/[\s.]+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase());
// The mark of a line: 🔥 (his hero days) or a bigger fire, 🧊 (his flop days), 🧱 (missed shots); null without one.
export function markOf(kind,line,f){
 if(kind==='hero'&&f?.fire)return {cls:f.fire>1?'fire2':'fire',emoji:'🔥',text:String(f.hero)};
 if(kind==='flop'&&f?.ice)return {cls:'ice',emoji:'🧊',text:String(f.flop)};
 if(kind==='flop'&&line.s&&bricks(line))return {cls:'bricks',emoji:'🧱',text:String(line.s.fga-line.s.fgm)};
 return null;
}
const photo=(look,r,tone,mark)=>{const src=look.photo(r.a);
 return `<div class="ph"><div class="photo" style="border-color:${tone}">${src?`<img src="${src}">`:`<span class="ini">${initials(r.n)}</span>`}</div>${mark?`<span class="mark">${look.emoji(mark.emoji)}${esc(mark.text)}</span>`:''}</div>`;};
// Short team names for the two-column lists, where the full ones do not fit.
const SHORT=['Balkan Murderers','Saint P','Black Jacks','Алачанян','Volga Pirates','Texas Citrus','Karagali','School Sugars'];
const teamPill=(look,t,short)=>{const x=LEAGUE_TEAMS[t];if(!x)return '';const logo=look.logo(t);
 return `<span class="team">${logo?`<img src="${logo}">`:look.emoji(x.symbol)}${esc(short?SHORT[t]||x.name:x.name)}</span>`;};
const teams=(look,list,free,short)=>list?.length?list.map(t=>teamPill(look,t,short)).join(''):free?`<span class="team">${look.emoji('🆓')}${short?'свободен':'свободный агент'}</span>`:'';
const MEDALS=['🥇','🥈','🥉'];
const place=(look,i,medals,label)=>`<div class="place">${label?esc(label):medals&&i<3?look.emoji(MEDALS[i]):i+1}</div>`;
// The stat line the league reads; the shots stand under the points, their misses are what the formula takes off.
export const statsHtml=s=>[[s.pts,'очк'],[s.reb,'подб'],[s.ast,'пер'],[s.stl,'перехв'],[s.blk,'блок'],[s.tov,'пот']].map(([v,l])=>`<b>${int(v)}</b> ${l}`).join(' · ');
export const shotsHtml=s=>`бр ${int(s.fgm)}/${int(s.fga)} · шт ${int(s.ftm)}/${int(s.fta)}`;
const fo=(p,extra='',sign=false,unit='ФО',cls='')=>`<div class="fo"><span class="n">${sign?signed(p):int(p)}</span><span class="u">${unit}</span>${extra?`<span class="x ${cls}">${extra}</span>`:''}</div>`;
function row(look,who,r,i,{tone,medals=false,free=false,list=r.h,extra='',sign=false,stats=true,move='',unit,short=false,mark=null,label=''}={}){
 const shots=stats&&r.s&&!extra;
 return `<div class="row ${mark?.cls||''}">${place(look,i,medals,label)}${photo(look,r,tone,mark)}<div class="who"><div class="name">${esc(who(r.a,r.n))}${move}</div>
<div class="meta">${r.c?`<span class="club">${esc(r.c)}</span>`:''}${teams(look,list,free,short)}</div>${stats&&r.s?`<div class="stats">${statsHtml(r.s)}</div>`:''}</div>${fo(r.p,shots?shotsHtml(r.s):extra,sign,unit,shots?'miss':'')}</div>`;
}
const empty=(i,label)=>`<div class="row empty"><div class="place">${label?esc(label):i+1}</div><div class="ph"></div><div>—</div><div></div></div>`;
const cells=(rows,n,make,from=0,to=n)=>Array.from({length:to-from},(_,k)=>rows[from+k]?make(rows[from+k],from+k):empty(from+k)).join('');
const head=(look,title,emo,tone)=>`<div class="head"><span class="bar" style="background:${tone}"></span>${look.emoji(emo)}${esc(title)}</div>`;
// A block of a fixed number of slots: the rows it has, then dashes; grid: the same in two columns (1–5 and 6–10 of ten).
const block=(look,title,emo,tone,rows,n,make,cls='')=>`<div class="block ${cls}">${head(look,title,emo,tone)}${cells(rows,n,make)}</div>`;
const grid=(look,title,emo,tone,rows,n,make)=>{const half=Math.ceil(n/2);
 return `<div class="block">${head(look,title,emo,tone)}<div class="grid2"><div class="block">${cells(rows,n,make,0,half)}</div><div class="block">${cells(rows,n,make,half,n)}</div></div></div>`;};
function page(look,fonts,{title,sub,foot='',holiday},body){
 return `<!doctype html><html><head><meta charset="utf-8"><style>${css(fonts,holiday?.accent||ACCENT)}</style></head><body><div class="card${framed(look,holiday)}">${decor(look,holiday,false)}
<div class="top"><div><div class="brand">FBL · сезон 2026/27 ${badge(look,holiday)}</div><div class="title">${esc(title)}</div></div><div class="sub">${sub}</div></div>${body}
<div class="foot"><span>ФО по формуле лиги FBL</span><span>${esc(foot)}</span></div></div></body></html>`;
}

// --- The opener: the nomination's emblem (a ring with the league's name around the league's logo, assets/fbl-logo.png,
// or the nomination's icon without it), its title and the date. A holiday's own layers (look.emblem, look.title: the
// league's art, design/holidays) take the place of the drawn emblem and title; the date is always the code's.
const sized=(html,px)=>html.replace('class="emo"',`class="emo" style="width:${px}px;height:${px}px;font-size:${Math.round(px*0.87)}px"`);
function emblem(look,nom,holiday){
 const art=holiday&&look.emblem?.(holiday.key);
 if(art)return `<img class="emblem art trim" src="${art}">`;
 const [a,b]=nom.ring,logo=look.leagueLogo?.(holiday?.key);
 return `<svg class="emblem" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<path id="ring" d="M300,300 m-228,0 a228,228 0 1,1 456,0 a228,228 0 1,1 -456,0"/></defs>
<circle cx="300" cy="300" r="292" fill="url(#g)"/><circle cx="300" cy="300" r="262" fill="#0b1020"/><circle cx="300" cy="300" r="196" fill="none" stroke="url(#g)" stroke-width="6"/>
<text font-family="Oswald" font-weight="700" font-size="34" letter-spacing="6" fill="url(#g)"><textPath href="#ring">FANTASY BROTHERS LEAGUE · FBL · СЕЗОН 2026/27 ·</textPath></text>
<foreignObject x="125" y="125" width="350" height="350"><div xmlns="http://www.w3.org/1999/xhtml" style="width:350px;height:350px;display:flex;align-items:center;justify-content:center">${logo?`<img src="${logo}" style="width:350px;height:350px">`:sized(look.emoji(nom.icon),230)}</div></foreignObject>
${holiday?`<foreignObject x="418" y="418" width="160" height="160"><div xmlns="http://www.w3.org/1999/xhtml" style="width:150px;height:150px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#0b1020;border:6px solid ${a}">${sized(look.emoji(holiday.emoji),96)}</div></foreignObject>`:''}</svg>`;
}
function otitle(look,nom,holiday){
 const art=holiday&&look.title?.(holiday.key,nom.key);
 return art?`<img class="tart trim" src="${art}" alt="${esc(nom.title)}">`:`<div class="otitle">${esc(nom.title)}</div>`;
}
export function opener(look,fonts,{nom,date,sub,holiday}){
 return `<!doctype html><html><head><meta charset="utf-8"><style>${css(fonts,holiday?.accent||nom.ring)}</style></head><body><div class="card opener${framed(look,holiday)}">${decor(look,holiday,true)}
${emblem(look,nom,holiday)}${otitle(look,nom,holiday)}<div class="odate">${esc(date)}</div><div class="osub">${holiday?`${look.emoji(holiday.emoji)}${esc(holiday.name)} · `:''}${esc(sub)}</div>
<div class="foot"><span>FBL · сезон 2026/27</span><span>ФО по формуле лиги FBL</span></div></div></body></html>`;
}

// A record alert of the day: a new season record or antirecord, or a new entry in the season's top 3.
function recordAlert(look,who,{kind,rank,line}){
 const best=kind==='best',tone=best?TONE.record:TONE.flop,mark=special(line.d);
 const title=rank===1?(best?'🚨 Рекорд сезона':'🗑 Антирекорд сезона'):(best?`📈 ${rank}-е место сезона`:`📉 ${rank}-е место антитопа сезона`);
 return `<div class="alert compact" style="border-color:${tone}"><div class="t" style="color:${tone}">${esc(title)}${mark?' '+look.emoji(mark):''}</div>${row(look,who,line,0,{tone,free:true,stats:false})}</div>`;
}
const caption=lines=>lines.filter(x=>x!==null&&x!==undefined).join('\n');

// --- The day: opener, heroes and flops, then free agents, the NBA antitop and the day's record alert.
// f: the players' form (core.js form()).
export function dayAlbum(day,blocks,who,look,fonts,{news=[],postponed=[],form:f=new Map(),holiday=null,week=null}={}){
 const date=`${dayLabel(day)} ${year(day)}`,sub=`${esc(date)}<br>игровой день США`;
 const mk=kind=>(l,i)=>row(look,who,l,i,{tone:TONE[kind],medals:kind==='hero',mark:markOf(kind,l,f.get(l.a))});
 const cards=[opener(look,fonts,{nom:NOMINATION.day,date,sub:`${week?`неделя ${week.n} · `:''}игровой день США`,holiday}),
  page(look,fonts,{title:'Итоги дня',sub,foot:'1 / 2',holiday},block(look,'Герои дня','⭐',TONE.hero,blocks.heroes,SLOTS.hero,mk('hero'))+block(look,'Провалы дня','💩',TONE.flop,blocks.flops,SLOTS.flop,mk('flop'))),
  page(look,fonts,{title:'Итоги дня',sub,foot:'2 / 2',holiday},
   block(look,'Золотая жила','🆓',TONE.gold,blocks.gold,SLOTS.gold,(l,i)=>row(look,who,{...l,h:[]},i,{tone:TONE.gold,medals:true,free:true}),'compact tall')
   +block(look,'Антитоп НБА','🤡',TONE.antitop,blocks.antitop,SLOTS.antitop,(l,i)=>row(look,who,l,i,{tone:TONE.antitop,free:true}),'compact tall')
   +news.slice(0,1).map(x=>recordAlert(look,who,x)).join('')
   +(postponed.length?`<div class="note">⏸ Перенесены: ${postponed.map(g=>esc(`${g.away} — ${g.home}`)).join(', ')}</div>`:''))];
 const top=blocks.heroes[0],low=blocks.flops[0];
 return {cards,caption:caption([`<b>⭐ Итоги игрового дня · ${esc(date)}</b>${holiday?` · ${esc(holiday.emoji)} ${esc(holiday.name)}`:''}`,
  [top&&`Герой дня: ${esc(who(top.a,top.n))} — ${int(top.p)} ФО`,low&&`провал дня: ${esc(who(low.a,low.n))} — ${int(low.p)} ФО`].filter(Boolean).join(' · ')||null,'',
  [`#${NOMINATION.day.tag}`,week&&weekTag(week.n),monthTag(day),dateTag(day)].filter(Boolean).join(' ')])};
}

// --- The week (after its Sunday): opener, the week's heroes, flops and free agents, the awards race (the MVP and rookie
// of the year; Mef player, the sixth man and the season records). Arrows: places moved since last week's race.
const arrow=n=>n===null?'<span class="move new">NEW</span>':n>0?`<span class="move up">▲${n}</span>`:n<0?`<span class="move down">▼${-n}</span>`:'';
const raceKey=r=>r.key||r.a;
export function weekAlbum(week,wb,r,rec,who,look,fonts,{previous={},holiday=null}={}){
 const span=`${range(week.start,week.end)} ${year(week.end)}`,games=x=>count(x.games,'матч','матча','матчей');
 const wrow=(kind,free)=>(x,i)=>row(look,who,free?{...x,h:[]}:x,i,{tone:TONE[kind],medals:kind!=='flop',free,extra:games(x),sign:true,stats:false});
 const mv=(list,key,x)=>previous[key]?arrow(moved(raceKey(x),list,previous[key])):'';
 const race=(list,key,o=()=>({}))=>(x,i)=>{const {row:shown=x,...rest}=o(x);return row(look,who,shown,i,{tone:TONE.race,medals:true,list:x.teams,stats:false,short:true,move:mv(list,key,x),...rest});};
 const recRow=(tone,best)=>(l,i)=>row(look,who,l,i,{tone,medals:best,free:true,short:true,stats:false,extra:dayLabel(l.d)+(special(l.d)?' '+special(l.d):'')});
 const raceSub=`после ${week.n}-й недели<br>${esc(span)}`;
 const cards=[opener(look,fonts,{nom:NOMINATION.week,date:`Неделя ${week.n} · ${range(week.start,week.end)}`,sub:`итоги недели и гонка за награды · ${year(week.end)}`,holiday}),
  page(look,fonts,{title:`Неделя ${week.n}`,sub:`${esc(span)}<br>итоги недели`,holiday},
   block(look,'Герои недели','⭐',TONE.hero,wb.heroes,SLOTS.weekHero,wrow('hero'),'compact')+block(look,'Провалы недели','💩',TONE.flop,wb.flops,SLOTS.weekFlop,wrow('flop'),'compact')
   +block(look,'Золотая жила недели','🆓',TONE.gold,wb.gold,SLOTS.weekGold,wrow('gold',true),'compact')),
  page(look,fonts,{title:'Гонка за награды',sub:raceSub,foot:'1 / 2',holiday},
   grid(look,'MVP','🏆',TONE.race,r.mvp,SLOTS.mvp,race(r.mvp,'mvp'))+grid(look,'Новичок года','🌱',TONE.race,r.roy,SLOTS.roy,race(r.roy,'roy'))),
  page(look,fonts,{title:'Гонка за награды',sub:raceSub,foot:'2 / 2',holiday},
   grid(look,'Mef player','💊',TONE.race,r.mef,SLOTS.mef,race(r.mef,'mef',x=>({free:true,extra:`цена ${int(x.price)}`})))
   // The sixth man ranks by his index (FBL points × bench games / games), not by points: the big number is the index.
   +grid(look,'Шестой игрок','🪑',TONE.race,r.sixth,SLOTS.sixth,race(r.sixth,'sixth',x=>({row:{...x,p:x.index},list:[x.team],unit:'индекс',extra:`${int(x.p)} ФО · запас ${x.bench}/${x.games}`})))
   +`<div class="block">${head(look,'Рекорды сезона','🔥',TONE.record)}<div class="grid2"><div class="block">${cells(rec.best,SLOTS.record,recRow(TONE.record,true))}</div><div class="block">${cells(rec.worst,SLOTS.record,recRow(TONE.flop,false))}</div></div></div>`)];
 const mvp=r.mvp[0];
 return {cards,caption:caption([`<b>🗓 Итоги недели ${week.n} · ${esc(span)}</b>`,mvp?`Лидер гонки MVP: ${esc(who(mvp.a,mvp.n))} — ${int(mvp.p)} ФО`:null,'',
  [`#${NOMINATION.week.tag}`,'#гонка_за_награды',weekTag(week.n),monthTag(week.end)].join(' ')])};
}

// --- The month's all-position five (after its last game day): opener and the five, a slot per position.
export function monthAlbum(month,five,who,look,fonts,{holiday=null}={}){
 const name=`${MONTHS_NOM[Number(month.slice(5,7))-1]} ${month.slice(0,4)}`;
 const rows=five.map(({pos,row:x},i)=>x?row(look,who,x,i,{tone:TONE.hero,list:x.teams,stats:false,label:pos,extra:count(x.games,'матч','матча','матчей')}):empty(i,pos));
 const cards=[opener(look,fonts,{nom:NOMINATION.month,date:name[0].toUpperCase()+name.slice(1),sub:'лучшие на каждой позиции',holiday}),
  page(look,fonts,{title:'Пятёрка месяца',sub:`${esc(name)}<br>по позициям Sports.ru`,holiday},`<div class="block">${head(look,'Символическая пятёрка','🏅',TONE.hero)}${rows.join('')}</div>`)];
 return {cards,caption:caption([`<b>🏅 Символическая пятёрка · ${esc(name)}</b>`,'',`#${NOMINATION.month.tag} ${monthTag(month+'-01')}`])};
}

// Every emoji a card may show, for the renderer to load once.
export const CARD_EMOJI=[...new Set(['⭐','💩','🆓','🤡','🏆','🌱','💊','🪑','🥇','🥈','🥉','🎄','🔥','🧊','🧱','🗓️','🏅',
 ...LEAGUE_TEAMS.map(t=>t.symbol),...HOLIDAY_EMOJI])];
