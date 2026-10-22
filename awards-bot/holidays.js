// FBL awards bot, the holiday calendar of its cards: every holiday the league marks (all of them, league chat,
// 22.10.2026; birthdays are the league's own business). A holiday changes only the decor layer of a card: its badge,
// its accent colour and the emoji scattered at its edges; the layout stays the same. A card is dated by its US game day.
// Rules: md (fixed MM-DD, or a span MM-DD..MM-DD), nth (the n-th weekday of a month, with a span of days around it),
// easter (Western or Orthodox, with offsets), on (exact dates, or spans, of the season's NBA and FBL events).
import RULES from '../data/league-rules.json' with {type:'json'};

const pad=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
// Western Easter (the Gregorian computus) and Orthodox Easter (Julian, as a Gregorian date in 1900–2099).
export function westernEaster(y){
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
 const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 return iso(y,month,day);
}
export function orthodoxEaster(y){
 const a=y%4,b=y%7,c=y%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7,month=Math.floor((d+e+114)/31),day=(d+e+114)%31+1;
 return shift(iso(y,month,day),13);
}
// The n-th weekday (0 Sunday … 6 Saturday) of a month.
const nth=(y,m,weekday,n)=>{const first=new Date(Date.UTC(y,m-1,1)).getUTCDay();return iso(y,m,1+(weekday-first+7)%7+7*(n-1));};

// Each holiday: its key, its name on the badge, its emoji, the decor emoji and its accent colours. The first that
// matches a day wins: the season's own events, then the NBA's, then the holidays.
export const HOLIDAYS=[
 {key:'fbl-start',name:'Старт сезона FBL',emoji:'🏀',decor:['🏀','🎉','✨','🏆'],accent:['#ffcf40','#ff8a1f'],on:[RULES.yahoo.scoringStart]},
 {key:'fbl-end',name:'Финиш сезона FBL',emoji:'🏁',decor:['🏁','🏆','🎉','✨'],accent:['#ffcf40','#3ea6ff'],on:[RULES.yahoo.scoringEnd]},
 {key:'trade-deadline',name:'Дедлайн обменов НБА',emoji:'🔁',decor:['📞','💼','🔁','✍️'],accent:['#3ea6ff','#22c55e'],on:['2027-02-11']},
 {key:'all-star',name:'Матч всех звёзд',emoji:'🌟',decor:['⭐','🌟','🏀','✨'],accent:['#ffcf40','#a06bff'],on:['2027-02-19..2027-02-21']},
 {key:'play-in',name:'Плей-ин',emoji:'🎟️',decor:['🎟️','🏀','🔥','⚡'],accent:['#ff8a1f','#3ea6ff'],on:['2027-04-13..2027-04-16']},
 {key:'playoffs',name:'Старт плей-офф',emoji:'🏆',decor:['🏆','🔥','🏀','⚡'],accent:['#ffcf40','#ff4d5e'],on:['2027-04-17..2027-04-18']},
 {key:'halloween',name:'Хэллоуин',emoji:'🎃',decor:['💀','⚰️','🎃','🕸️','🦇','🕷️','👻'],accent:['#ff7a1a','#8b3dff'],md:'10-31'},
 {key:'thanksgiving',name:'День благодарения',emoji:'🦃',decor:['🦃','🍂','🥧','🌽','🍁'],accent:['#e8862a','#b5532a'],nth:{month:11,weekday:4,n:4,from:-1,to:1}},
 {key:'christmas',name:'Рождество',emoji:'🎄',decor:['🎄','🎅','🎁','❄️','⭐','🔔'],accent:['#22c55e','#ff4d5e'],md:'12-24..12-25'},
 {key:'new-year',name:'Новый год',emoji:'🎆',decor:['🎆','🥂','❄️','🎄','✨','🎇'],accent:['#ffcf40','#3ea6ff'],md:'12-30..01-02'},
 {key:'orthodox-christmas',name:'Рождество Христово',emoji:'⭐',decor:['⭐','🕯️','❄️','🎄','🔔'],accent:['#ffcf40','#3ea6ff'],md:'01-06..01-07'},
 {key:'old-new-year',name:'Старый Новый год',emoji:'🥂',decor:['🥂','❄️','✨','🎆'],accent:['#ffcf40','#9fb0ff'],md:'01-13..01-14'},
 {key:'mlk',name:'День Мартина Лютера Кинга',emoji:'🕊️',decor:['🕊️','✊','⭐','🎙️'],accent:['#3ea6ff','#ffcf40'],nth:{month:1,weekday:1,n:3}},
 {key:'lunar-new-year',name:'Китайский Новый год',emoji:'🧧',decor:['🧧','🏮','🐉','🎆','🧨'],accent:['#ff4d5e','#ffcf40'],on:['2027-02-06']},
 {key:'valentine',name:'День святого Валентина',emoji:'❤️',decor:['❤️','💘','🌹','💌','💕'],accent:['#ff4d8a','#ff4d5e'],md:'02-14'},
 {key:'defender',name:'23 февраля',emoji:'🎖️',decor:['🎖️','⭐','🛡️','🪖'],accent:['#22c55e','#ffcf40'],md:'02-23'},
 {key:'womens-day',name:'8 марта',emoji:'💐',decor:['💐','🌷','🌸','💖','🌹'],accent:['#ff6fb5','#ffb3d9'],md:'03-08'},
 // A week-long holiday gives way to a one-day one inside it (8 March in Maslenitsa week).
 {key:'maslenitsa',name:'Масленица',emoji:'🥞',decor:['🥞','☀️','🔥','🧈','🍯'],accent:['#ffb020','#ff7a1a'],easter:{kind:'orthodox',from:-55,to:-49}},
 {key:'st-patrick',name:'День святого Патрика',emoji:'☘️',decor:['☘️','🍀','🍺','🌈','🎩'],accent:['#22c55e','#ffcf40'],md:'03-17'},
 {key:'april-fools',name:'День смеха',emoji:'🤡',decor:['🤡','😂','🎭','🃏','🎈'],accent:['#a06bff','#ffcf40'],md:'04-01'},
 {key:'cosmonautics',name:'День космонавтики',emoji:'🚀',decor:['🚀','🛰️','🌌','⭐','🪐'],accent:['#3ea6ff','#a06bff'],md:'04-12'},
 {key:'easter',name:'Пасха',emoji:'🥚',decor:['🥚','🐣','🐰','🌷','🕯️'],accent:['#ffcf40','#22c55e'],easter:{kind:'both'}},
 {key:'may-day',name:'Первомай',emoji:'🌷',decor:['🌷','🎈','☀️','🌼'],accent:['#ff4d5e','#ffcf40'],md:'05-01'},
 {key:'victory-day',name:'День Победы',emoji:'🎆',decor:['🎆','🌹','⭐','🕊️'],accent:['#ff4d5e','#ffcf40'],md:'05-09'},
 {key:'russia-day',name:'День России',emoji:'🇷🇺',decor:['🇷🇺','🎆','✨'],accent:['#3ea6ff','#ff4d5e'],md:'06-12'},
];

const inMd=(day,md)=>{const [a,b=a]=md.split('..'),x=day.slice(5);return a<=b?x>=a&&x<=b:x>=a||x<=b;};
const inOn=(day,list)=>list.some(s=>{const [a,b=a]=s.split('..');return day>=a&&day<=b;});
function matches(h,day){
 const y=Number(day.slice(0,4));
 if(h.md)return inMd(day,h.md);
 if(h.on)return inOn(day,h.on.filter(Boolean));
 if(h.nth){const d=nth(y,h.nth.month,h.nth.weekday,h.nth.n);return day>=shift(d,h.nth.from||0)&&day<=shift(d,h.nth.to||0);}
 if(h.easter){
  if(h.easter.kind==='both')return day===westernEaster(y)||day===orthodoxEaster(y);
  const e=h.easter.kind==='orthodox'?orthodoxEaster(y):westernEaster(y);return day>=shift(e,h.easter.from||0)&&day<=shift(e,h.easter.to||0);
 }
 return false;
}
// The holiday of a US game day, or null.
export const holidayOf=day=>HOLIDAYS.find(h=>matches(h,day))||null;
// Every holiday of a period (a week's cards are dated by their last day; this is for the opener of a week or a month).
export const holidaysBetween=(a,b)=>{const out=[];for(let d=a;d<=b;d=shift(d,1)){const h=holidayOf(d);if(h&&!out.includes(h))out.push(h);}return out;};
export const HOLIDAY_EMOJI=[...new Set(HOLIDAYS.flatMap(h=>[h.emoji,...h.decor]))];
