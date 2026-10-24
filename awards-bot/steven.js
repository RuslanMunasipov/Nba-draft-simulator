// Steven Ex Pert, the league's expert (Inside FBL; scripts/assets/people.json steven-ex-pert): the awards race after the
// week's Sunday and the month's all-position five are his posts (owner, 24.10.2026). The awards bot's engine stays one:
// its workflow, its state and its chain of runs; only the sender changes. His posts go from his own bot
// (STEVEN_EX_PERT_BOT_TOKEN) into the awards bot's chat; without his token, or when Telegram refuses it, from the awards
// bot. Under the album's caption he adds two or three lines of his verdict, written by Claude through the owner's
// subscription (scripts/claude-text.mjs, free): who is the favourite, who flew up, who fell out, who earned a place in
// the five. Every number of it is a number of the facts (places, FBL points by the league's formula from core.js, the
// sixth man's index, Mef prices); a verdict that brings its own is written again, then left out. The verdict never holds
// a post: without it the album goes as it is.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc,dayLabel,raceKey} from './messages.js';
import {moved} from './core.js';
import {allowedNumbers,strayNumbersIn} from './mike-roffon.js';
import {person} from '../scripts/image-pipeline.mjs';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';

export const STEVEN=person('steven-ex-pert');
export const STEVEN_MODEL=process.env.STEVEN_MODEL||CLAUDE_MODEL;
export const SIGNATURE=`— ${STEVEN?.name||'Стивен Экс Перт'}, эксперт Inside FBL`;
// Telegram keeps 1024 characters of a photo's caption: a verdict that does not fit is left out, never the hashtags.
export const CAPTION_LIMIT=1024;
const MONTHS_NOM=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

// --- The sender. The bots a post of Steven's may go from, in order: his own, then the awards bot's (one bot when both
// are the same token, none without either).
export function stevenSenders({steven,awards}={}){
 const out=[],seen=new Set();
 for(const [name,token] of [['Steven Ex Pert',steven],['awards bot',awards]]){const t=String(token||'').trim();if(t&&!seen.has(t)){seen.add(t);out.push({name,token:t});}}
 return out;
}
// send(token) with the first sender Telegram takes; the next one when it refuses. Answers the sender's name, or throws
// the last refusal. A post goes once: the next sender only tries what the last one could not send.
export async function viaFirst(senders,send,{label='post',log=console.warn}={}){
 let last=Error(`${label}: no bot to send it`);
 for(const [i,s] of senders.entries()){
  try{await send(s.token);return s.name;}
  catch(e){last=e;if(i<senders.length-1)log(`${label}: not sent by ${s.name} (${e.message}); ${senders[i+1].name} sends it.`);}
 }
 throw last;
}

// --- The facts he sees. Names as the league knows them (who); FBL points as core.js scored them.
const teamNames=list=>(list||[]).map(t=>LEAGUE_TEAMS[t]?.name).filter(Boolean);
// The trend of a place since last week's race, as the cards' arrows show it (cards.js, messages.js: moved()).
const trend=(list,key,x,previous)=>{
 if(!previous?.[key])return null;
 const m=moved(raceKey(x),list,previous[key]);
 return m===null?'новый в списке':m>0?`поднялся на ${m}`:m<0?`опустился на ${-m}`:'на месте';
};
// The ones of last week's list who are not in this week's: out of the race. A name the league does not know is left out.
const dropped=(list,key,previous,who)=>{
 const now=new Set(list.map(raceKey));
 return (previous?.[key]||[]).filter(k=>!now.has(k)).map(k=>{const a=String(k).includes(':')?String(k).split(':').pop():String(k);return who(a,'');})
  .filter(n=>n&&!/^\d+$/.test(n));
};
// The race after week n: its four lists and the season records. previous: last week's ranks (state.ranks).
export function raceFacts(week,r,rec,who,previous={}){
 const list=(key,extra=()=>({}))=>({
  top:r[key].map((x,i)=>({place:i+1,name:who(x.a,x.n),fo:x.p,fblTeams:teamNames(x.teams),...extra(x),trend:trend(r[key],key,x,previous)})),
  outOfTheRace:dropped(r[key],key,previous,who)});
 const record=l=>({name:who(l.a,l.n),fo:l.p,day:dayLabel(l.d)});
 return {week:week.n,firstRace:!Object.keys(previous||{}).length,
  mvp:list('mvp'),rookieOfTheYear:list('roy'),
  mefPlayer:list('mef',x=>({priceBeforeSeason:x.price})),
  sixthMan:list('sixth',x=>({fblTeams:teamNames([x.team]),index:x.index,benchGames:x.bench,games:x.games})),
  seasonRecords:{best:rec.best.map(record),worst:rec.worst.map(record)}};
}
// The month's five: a player a position (PG, SG, SF, PF, C), his FBL points of the month and his games.
export function fiveFacts(month,five,who){
 return {month:`${MONTHS_NOM[Number(month.slice(5,7))-1]} ${month.slice(0,4)}`,
  five:five.map(({pos,row:x})=>x?{position:pos,name:who(x.a,x.n),fo:x.p,games:x.games,fblTeams:teamNames(x.teams)}:{position:pos,name:null})};
}

// --- His voice.
const VOICE=`Ты — Стивен Экс Перт, эксперт рубрики Inside FBL фэнтези-баскетбольной лиги друзей FBL (Fantasy Brothers League). Уверенный эксперт в безупречном тёмном костюме, белой рубашке и синем галстуке в полоску, с папкой бумаг и ручкой; говорит так, будто его прогноз уже подшит к делу и заверен печатью.
Твой стиль: пафосно и с юмором. Экспертный тон телестудии, громкие формулировки, неожиданные сравнения — и всегда лёгкая самоирония эксперта, который никогда не ошибается (а если ошибся, то это рынок не понял прогноз).
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- 2 или 3 строки, каждая — одна законченная фраза до 180 знаков. Без хэштегов, без списков, без подписи (её добавит редакция).
- Только факты из данных. Используй только числа из данных (места, ФО, индекс, цены, недели); никаких других чисел, процентов и своих подсчётов. Числа словами тоже проверяются. Можно не называть числа вовсе.
- Имена — ровно как в данных.
- Ответь строго JSON: {"lines": ["...", "..."]}`;
const TASK={
 race:`Экспертный вердикт к гонке за награды после недели: кто фаворит в гонке MVP, кто взлетел (trend «поднялся»), кто выпал из гонки (outOfTheRace), что с новичками, Mef player и шестым игроком — выбери самое яркое, не обязательно всё. Если firstRace, сравнивать не с чем: только расклад.`,
 five:`Экспертный вердикт к символической пятёрке месяца: кто заслужил место в пятёрке, кто её главная звезда, на какой позиции была битва.`,
};
// fix: what was wrong with the last try, for the next one.
export function verdictMessages(kind,facts,fix=''){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`${TASK[kind]}\nДанные:\n${JSON.stringify(facts,null,1)}${fix?`\n\nПрошлый вариант отклонён: ${fix}. Напиши заново.`:''}`};
}
export const VERDICT_SCHEMA={type:'object',additionalProperties:false,required:['lines'],properties:{lines:{type:'array',minItems:2,maxItems:3,items:{type:'string'}}}};
// Two or three lines of words, none of them too long; trimmed.
export function verdictLines(x){
 const lines=Array.isArray(x?.lines)?x.lines.map(l=>String(l??'').replace(/\s+/g,' ').trim()).filter(Boolean):[];
 return lines.length>=2&&lines.length<=3&&lines.every(l=>l.length<=240)?lines:null;
}
// The numbers of a verdict that are not in its facts, in digits or in words (none: it may go out).
export const strayNumbers=(lines,facts)=>strayNumbersIn(lines.join(' '),allowedNumbers(facts));

// The verdict from Claude: written once, written again when it brings numbers of its own or is not two or three lines,
// then left out. Never throws: {verdict: lines or null}.
export async function verdictFor(kind,facts,{claude=claudeJSON,model=STEVEN_MODEL,timeoutMs=120e3,log=console.warn}={}){
 let fix='';
 for(let i=0;i<2;i++){
  let lines;
  try{const {data}=await claude({...verdictMessages(kind,facts,fix),schema:VERDICT_SCHEMA,model,timeoutMs});lines=verdictLines(data);}
  catch(e){log(`Steven Ex Pert: no verdict (${e.message}).`);return {verdict:null};}
  const stray=lines?strayNumbers(lines,facts):[];
  if(lines&&!stray.length)return {verdict:lines};
  fix=lines?`числа не из данных (${stray.join(', ')})`:'нужно 2 или 3 строки, каждая до 180 знаков';
  log(`Steven Ex Pert: ${fix}${i?', the post goes without his verdict.':', written again.'}`);
 }
 return {verdict:null};
}

// --- His words under a post: the verdict in italics and his signature, before the caption's hashtags (its last
// paragraph); the caption as it is when there is no verdict or it would not fit.
const words=lines=>[...lines.map(l=>`<i>${esc(l)}</i>`),SIGNATURE].join('\n');
export function withVerdict(caption,lines,limit=CAPTION_LIMIT){
 if(!lines?.length)return caption;
 const i=caption.lastIndexOf('\n\n'),out=i<0?`${caption}\n\n${words(lines)}`:`${caption.slice(0,i)}\n\n${words(lines)}${caption.slice(i)}`;
 return out.length<=limit?out:caption;
}
// The same at the end of a post's text (the fallback when its cards fail).
export const verdictText=(text,lines)=>lines?.length?`${text}\n\n${words(lines)}`:text;
