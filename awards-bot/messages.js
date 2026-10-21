// FBL awards bot, Telegram texts (HTML parse mode) of every post: the day, the week, the awards race, the season records,
// the month's five and the rookie check for the commissioner. Pure: names come through `who`.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {int,count} from '../src/format.js';
import {daysBetween,special,moved} from './core.js';

export const LIMIT=4096;
export const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
export const dayLabel=day=>`${Number(day.slice(8,10))} ${MONTHS[Number(day.slice(5,7))-1]}`;
const range=(a,b)=>a.slice(5,7)===b.slice(5,7)?`${Number(a.slice(8,10))}–${dayLabel(b)}`:`${dayLabel(a)} – ${dayLabel(b)}`;
const MEDALS=['🥇','🥈','🥉'];
const place=(i,medals)=>medals&&i<3?MEDALS[i]:`${i+1}.`;
export const badges=teams=>teams.map(t=>LEAGUE_TEAMS[t]?.symbol||'').filter(Boolean).join('');
const signedInt=n=>n>0?'+'+int(n):int(n);
// One game's stat line: the six numbers the league reads, as plain text. Bold is for the block title, the name and the
// FBL points only (league chat, 21.10.2026).
const LABEL=[['pts','очк'],['reb','подб'],['ast','пер'],['stl','перехв'],['blk','блок'],['tov','пот']];
export const statLine=s=>LABEL.map(([k,l])=>`${s[k]} ${l}`).join(' · ');
// "Йокич · DEN 🐎": the Sports.ru short name of a player on the market, else ESPN's.
const head=(who,r,{club=true,free=false,teams=r.h}={})=>{const b=badges(teams||[]);
 return `<b>${esc(who(r.a,r.n))}</b>${club&&r.c?` · ${esc(r.c)}`:''}${b?' '+b:free?' 🆓':''}`;};
const gameRow=(who,l,i,{medals,free})=>`${place(i,medals)} ${head(who,l,{free})} — <b>${int(l.p)}</b>\n${statLine(l.s)}`;
// A block: its title, then its rows with no empty lines between them; blocks stand apart by one empty line.
const block=(title,rows)=>rows.length?`<b>${title}</b>\n${rows.join('\n')}`:'';
const join=parts=>parts.filter(Boolean).join('\n\n');

export function dailyText(day,blocks,who,{news=[],postponed=[],today}={}){
 const parts=[
  block(`⭐ Герои дня · ${dayLabel(day)}`,blocks.heroes.map((l,i)=>gameRow(who,l,i,{medals:true}))),
  block('💩 Провалы дня',blocks.flops.map((l,i)=>gameRow(who,l,i,{}))),
  block('🆓 Золотая жила',blocks.gold.map((l,i)=>gameRow(who,{...l,h:[]},i,{medals:true}))),
  block('🤡 Антитоп НБА',blocks.antitop.map((l,i)=>gameRow(who,l,i,{free:true}))),
  ...news.map(x=>recordAlert(x,who,today))];
 if(postponed.length)parts.push(`⏸ Перенесены: ${postponed.map(g=>esc(`${g.away} — ${g.home}`)).join(', ')}.`);
 if(!parts.some(Boolean))return '';
 return join(parts);
}
function recordAlert({kind,rank,line,previous},who,today){
 const best=kind==='best',title=rank===1?(best?'🚨 Рекорд сезона!':'🗑 Антирекорд сезона!'):(best?'📈 В топ-3 сезона':'📉 В антитоп-3 сезона');
 const mark=special(line.d);
 let text=`<b>${title}</b>\n${head(who,line,{free:true})} — <b>${int(line.p)}</b>${mark?' '+mark:''}${rank>1?` · ${rank}-е место`:''}\n${statLine(line.s)}`;
 if(previous)text+=`\nПрежний ${best?'рекорд':'антирекорд'} — ${esc(who(previous.a,previous.n))}, ${int(previous.p)}, продержался ${count(daysBetween(previous.d,line.d),'день','дня','дней')}`;
 return text;
}
const weekRow=(who,r,i,{medals,free})=>`${place(i,medals)} ${head(who,r,{free})} — <b>${signedInt(r.p)}</b> · ${count(r.games,'матч','матча','матчей')}\n${statLine(r.s)}`;
export function weeklyText(week,blocks,who){
 return join([`<b>📅 Итоги недели ${week.n} · ${range(week.start,week.end)}</b>`,
  block('⭐ Герои недели',blocks.heroes.map((r,i)=>weekRow(who,r,i,{medals:true}))),
  block('💩 Провалы недели',blocks.flops.map((r,i)=>weekRow(who,r,i,{}))),
  block('🆓 Золотая жила недели',blocks.gold.map((r,i)=>weekRow(who,{...r,h:[]},i,{medals:true})))]);
}
// Places moved since last week's post: ▲ up, ▼ down, 🆕 new in the list; nothing on the first post.
const arrow=n=>n===null?' 🆕':n>0?` ▲${n}`:n<0?` ▼${-n}`:'';
export const raceKey=r=>r.key||r.a;
// One line a place; the sixth-man race adds a second line.
const race=(title,list,who,previous,extra=()=>'',more=null,free=false)=>block(title,list.map((r,i)=>
 `${i+1}. ${head(who,r,{club:false,teams:r.teams,free})} — ${extra(r,i)}${previous?arrow(moved(raceKey(r),list,previous)):''}${more?more(r):''}`));
export function racesText(week,r,who,previous={}){
 const points=x=>`<b>${int(x.p)}</b>`;
 return join([`<b>🏆 Гонка за награды · после ${week.n}-й недели</b>`,
  race('🏆 MVP',r.mvp,who,previous.mvp,points),
  race('🌱 Новичок года',r.roy,who,previous.roy,points),
  race('💊 Mef player',r.mef,who,previous.mef,(x,i)=>`${points(x)} · ${int(x.price)}${i===0?' до старта':''}`,null,true),
  race('🪑 Шестой игрок',r.sixth.map(x=>({...x,teams:[x.team]})),who,previous.sixth,x=>`индекс <b>${int(x.index)}</b>`,
   x=>`\nФО ${int(x.p)} · запасным ${x.bench} из ${x.games} (${Math.round(100*x.bench/x.games)}%)`)]);
}
export function recordsText(rec,who,today){
 const row=(l,i)=>{const mark=special(l.d);return `${i+1}. ${head(who,l,{free:true})} — <b>${int(l.p)}</b> (${mark?mark+' ':''}${daysBetween(l.d,today)} дн.)\n${statLine(l.s)}`;};
 return join([block('🔥 Лучшие выступления сезона',rec.best.map(row)),block('🗑 Худшие выступления сезона',rec.worst.map(row))]);
}
export function monthText(month,five,who){
 const rows=five.map(({pos,row})=>row?`${pos} · ${head(who,row,{teams:row.teams})} — <b>${int(row.p)}</b> · ${count(row.games,'матч','матча','матчей')}`:`${pos} · —`);
 return `<b>🏅 Символическая пятёрка · ${MONTHS_NOM[Number(month.slice(5,7))-1]}</b>\n\n${rows.join('\n')}`;
}
export function rookieAlert(teams){
 if(!teams.length)return '';
 return `<b>⚠️ Проверка новичков</b>\nВ составе нет ни одного новичка: ${teams.map(t=>esc(`${LEAGUE_TEAMS[t]?.symbol||''} ${LEAGUE_TEAMS[t]?.name||'GM '+(t+1)}`.trim())).join(', ')}. По правилам лиги в каждой команде должен быть хотя бы один.`;
}
// Telegram takes 4096 characters a message: a long text is cut between its blocks.
export function split(text,limit=LIMIT){
 const out=[];let cur='';
 for(const part of text.split('\n\n')){
  const next=cur?cur+'\n\n'+part:part;
  if(next.length<=limit){cur=next;continue;}
  if(cur)out.push(cur);
  cur=part.length<=limit?part:part.slice(0,limit);
 }
 if(cur)out.push(cur);
 return out;
}
