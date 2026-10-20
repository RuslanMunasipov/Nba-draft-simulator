// Russian number, plural and date formatting shared by every screen: non-breaking group spaces, a real minus sign,
// a decimal comma, and plural endings that agree with the number ("1 игрок", "3 игрока", "874 игрока").
const NBSP=' ',MINUS='−';
export const int=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ru-RU').replace(/\s/g,NBSP).replace('-',MINUS):'—';
export const dec=(n,digits=1)=>Number.isFinite(n)?n.toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits}).replace(/\s/g,NBSP).replace('-',MINUS):'—';
export const signed=n=>!Number.isFinite(n)?'—':(Math.round(n)>0?'+':Math.round(n)<0?MINUS:'')+int(Math.abs(n));
export const signedDec=(n,digits=1)=>!Number.isFinite(n)?'—':(n>0?'+':n<0?MINUS:'')+dec(Math.abs(n),digits);
export const pct=x=>Number.isFinite(x)?Math.round(x*100)+NBSP+'%':'—';
// plural(5,'игрок','игрока','игроков') → 'игроков'; count(5,…) → '5 игроков'.
export function plural(n,one,few,many){const a=Math.abs(Math.trunc(n)),d=a%10,h=a%100;return d===1&&h!==11?one:d>=2&&d<=4&&(h<12||h>14)?few:many;}
export const count=(n,one,few,many)=>`${int(n)}${NBSP}${plural(n,one,few,many)}`;
export const ddmm=d=>d?`${String(d).slice(8,10)}.${String(d).slice(5,7)}`:'';
// "20 окт", "21 окт, 02:30" in Moscow time (the league lives on Moscow time).
const MSK='Europe/Moscow';
export const dayMonth=iso=>new Date(iso).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:MSK}).replace('.','');
export const timeMsk=iso=>new Date(iso).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:MSK});
export const stampMsk=iso=>`${new Date(iso).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',timeZone:MSK})}, ${timeMsk(iso)}`;
export const weekday=day=>new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
// ESPN injury statuses in plain Russian, with how worried the GM should be.
const STATUS={'out':['Не играет','out'],'day-to-day':['Под вопросом','dtd'],'questionable':['Под вопросом','dtd'],'doubtful':['Скорее не сыграет','out'],'probable':['Скорее сыграет','dtd'],'suspension':['Дисквалификация','out'],'game time decision':['Решение перед матчем','dtd']};
export function injuryStatus(status){const s=STATUS[String(status||'').trim().toLowerCase()];return s?{label:s[0],level:s[1]}:{label:status||'Травма',level:'dtd'};}
