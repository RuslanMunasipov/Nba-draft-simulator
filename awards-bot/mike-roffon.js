// Mike Roffon, the league's reporter (Inside FBL): after the game day's post, a flash interview with the hero of the day,
// posted by his own bot. The interview is written by an OpenAI text model in his voice (sharp, hard, ironic; the voice of
// his Inside FBL pieces) from the facts of the game, and drawn by the picture pipeline: Mike, always with his white gloves
// and microphone, and the real player. It is fiction and says so. Every number in it is a number of the facts: the FBL
// points come from core.js (fblFormula); an interview that brings a number of its own is drawn again, then dropped.
import {fileURLToPath} from 'node:url';
import {int} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc,dayLabel} from './messages.js';
import {person,looks,readImage,ASSETS} from '../scripts/image-pipeline.mjs';
import {dateTag} from './cards.js';

export const MIKE_MODEL=process.env.MIKE_MODEL||'gpt-5.4-mini';
// USD per million tokens of gpt-5.4-mini (developers.openai.com/api/docs/pricing, 22.10.2026).
export const TEXT_PRICE={input:0.75,output:4.5};

// The facts of an interview: the hero of the day and his game. who: the league's (Sports.ru) name; form: core.js form().
export function interviewFacts(day,line,who,{form,opponent,holiday}={}){
 const s=line.s,f=form?.get(line.a);
 return {date:`${dayLabel(day)} ${day.slice(0,4)}`,holiday:holiday?.name||null,
  player:{name:who(line.a,line.n),en:line.n,club:line.c,opponent:opponent||null},
  fblTeams:(line.h||[]).map(t=>({team:LEAGUE_TEAMS[t]?.name,gm:LEAGUE_TEAMS[t]?.gm||null})),
  game:{fo:line.p,minutes:Math.round(line.m),pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,ftm:s.ftm,fta:s.fta,pf:s.pf},
  heroOfTheDay:{rank:1,heroDaysLast7:f?.hero||1,daysInARow:f?.heroRun||1}};
}

// His voice, as his Inside FBL pieces have it (Dec 2025).
const VOICE=`Ты — Майк Роффон, легендарный репортёр рубрики Inside FBL фэнтези-лиги FBL (Fantasy Brothers League). Ветеран, который берёт интервью хоть под обстрелом: всегда в белых перчатках и с винтажным микрофоном.
Твой стиль: хлёсткий, жёсткий, ироничный. Вопросы короткие и бьют в слабое место (потери, промахи, «а что, если завтра так же?»), без лести. Иногда — колкая реплика после ответа. Пролог и послесловие — плотные, образные, с собственными метафорами. Это примеры твоего тона, а не готовые фразы: не повторяй их дословно — «не вывеска, а петля, которая стягивает систему»; «„Спокойно и буднично“ — так обычно и начинается самое интересное».
Игрок отвечает в своей манере: уверенно, коротко, с баскетбольным жаргоном и вкраплениями английских терминов (stability floor, +EV, short-roll, clutch), с одной цитатой-афоризмом.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- Интервью вымышленное, но факты — только из данных ниже. Используй только числа из данных; никаких других чисел (ни счёта матча, ни сезонных цифр, ни процентов). Можно не называть числа вовсе.
- Имя игрока пиши так, как в данных (player.name).
- 3 вопроса и 3 ответа. Пролог — 1–2 предложения, послесловие — 1–2 предложения. Всего не длиннее 1300 знаков.
- Ответь строго JSON: {"title": "цитата игрока для заголовка, до 70 знаков, без кавычек и без его имени", "prologue": "...", "qa": [{"q": "...", "a": "..."}, ...], "remark": "колкая реплика Майка после одного из ответов или пустая строка", "afterword": "..."}`;
export function interviewMessages(facts){
 return [{role:'system',content:`${VOICE}\n\n${RULES}`},{role:'user',content:`Флеш-интервью с героем игрового дня. Данные:\n${JSON.stringify(facts,null,1)}`}];
}

// Every number a text may use: those of the facts, and small counting words written as digits (1 to 5).
export function allowedNumbers(facts){
 const out=new Set(['1','2','3','4','5']);
 const walk=v=>{if(typeof v==='number')out.add(String(Math.abs(v)));else if(typeof v==='string')(v.match(/\d+/g)||[]).forEach(n=>out.add(n));else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
 walk(facts);return out;
}
// The numbers of an interview that are not in its facts (none: the interview may go out).
export function strayNumbers(interview,facts){
 const allowed=allowedNumbers(facts),text=[interview.title,interview.prologue,interview.remark,interview.afterword,...(interview.qa||[]).flatMap(x=>[x.q,x.a])].join(' ');
 return [...new Set((text.match(/\d+/g)||[]).filter(n=>!allowed.has(n)))];
}
export function validInterview(x){
 return x&&typeof x.prologue==='string'&&Array.isArray(x.qa)&&x.qa.length>=2&&x.qa.every(q=>typeof q.q==='string'&&typeof q.a==='string')&&typeof x.afterword==='string';
}

// The interview as Telegram HTML (the reply under his picture), and the picture's caption.
export function interviewText(x,facts){
 const name=esc(facts.player.name),qa=x.qa.map((q,i)=>`<b>Майк Роффон.</b> ${esc(q.q)}\n<b>${name}.</b> ${esc(q.a)}${i===0&&x.remark?`\n<i>Майк Роффон: ${esc(x.remark)}</i>`:''}`);
 return [`<b>🎙 Inside FBL • Флеш-интервью</b>`,`<i>«${esc(String(x.title||'').replace(/^[«"„“]+|[»"“”]+$/g,''))}»</i>`,'',`<b>Пролог Майка.</b> ${esc(x.prologue)}`,'',qa.join('\n\n'),'',
  `<b>Послесловие Майка.</b> ${esc(x.afterword)}`,'','— Майк Роффон, специально для Inside FBL','',
  '<i>Интервью вымышленное: цифры настоящие, слова — нет.</i>'].join('\n');
}
export function interviewCaption(facts,day){
 return `<b>🎙 Inside FBL • ${esc(facts.player.name)}</b> — <b>${int(facts.game.fo)}</b> ФО · герой дня ${esc(facts.date)}\n\n#inside_fbl #интервью ${dateTag(day)}`;
}

// --- His picture: Mike interviewing the hero after the game, the league's press wall behind them.
const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};
// His clothes follow the scene (only the white gloves and the microphone never change): one look per interview.
const OUTFITS=['a rumpled trench coat and a fedora with a PRESS card in the band','a tweed jacket, a polka-dot tie and a press lanyard',
 'his war-correspondent look: the camouflage helmet reading "BORN TO ASK" and the PRESS vest','a vintage sports-broadcaster blazer with the INSIDE FBL patch'];
const SCENES=[
 'the arena tunnel right after the final buzzer, the player still sweaty in his game jersey, a towel on his neck',
 'courtside after the game, confetti and crowd blurred behind, the player catching his breath',
 'a post-game press conference: the player at the table with a row of microphones, Mike standing at the front leaning in',
 'the locker room after the game, the player on the bench taping off his wrists, Mike crouched beside him',
];
export function interviewPicture(facts,day,{root=ASSETS}={}){
 const mike=person('mike-roffon'),logo=readImage(fileURLToPath(new URL('./assets/fbl-logo.png',import.meta.url)));
 const images=[readImage(`${root}/${mike.photo}`),logo].filter(Boolean);
 const scene=SCENES[hash(day+facts.player.en)%SCENES.length],outfit=OUTFITS[hash(facts.player.en+day+'look')%OUTFITS.length];
 return {images,prompt:`REFERENCES: reference image 1 is Mike Roffon, the reporter${logo?'; reference image 2 is the logo of the league, FBL':''}.
MIKE ROFFON: ${looks(mike)}. Preserve his face precisely, instantly recognizable. Today he wears ${outfit}, and his white gloves.
PLAYER: the real NBA player ${facts.player.en} of the ${facts.player.club}, exactly as he really looks, in his team's game jersey.
SCENE: a flash interview, ${scene}. Mike, in white gloves, holds his vintage chrome microphone up to the player, asking a hard question with a sharp, sceptical look; the player answers, confident.${logo?' Behind them a press wall printed with the league logo from reference image 2, repeated.':''} At the bottom a TV lower-third banner reads "INSIDE FBL".
STYLE: photorealistic sports-broadcast still, cinematic light, 35mm lens, shallow depth of field. Square composition. The only text: "INSIDE FBL" on the banner and on the press wall, spelled exactly. No other captions, numbers or watermarks.`};
}

// The interview from the model (chat completions, JSON). Answers {interview, usage} or throws.
export async function writeInterview(facts,{key,fetchImpl=fetch,model=MIKE_MODEL,timeoutMs=120e3}={}){
 const r=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(timeoutMs),
  headers:{'content-type':'application/json',...key?{authorization:`Bearer ${key}`}:{}},
  body:JSON.stringify({model,messages:interviewMessages(facts),response_format:{type:'json_object'}})});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(`OpenAI text: ${r.status} ${body.error?.message||''}`.trim());
 let interview;try{interview=JSON.parse(body.choices?.[0]?.message?.content||'');}catch{throw Error('OpenAI text: not JSON');}
 if(!validInterview(interview))throw Error('OpenAI text: not an interview');
 return {interview,usage:body.usage||null};
}
export const textCost=u=>((u?.prompt_tokens||0)*TEXT_PRICE.input+(u?.completion_tokens||0)*TEXT_PRICE.output)/1e6;
// Written until it holds no number of its own (two tries); null when it still does.
export async function interviewFor(facts,opts){
 let spent=0;
 for(let i=0;i<2;i++){
  const {interview,usage}=await writeInterview(facts,opts);spent+=textCost(usage);
  const stray=strayNumbers(interview,facts);
  if(!stray.length)return {interview,spent};
  console.warn(`Mike Roffon: numbers not in the facts (${stray.join(', ')}), written again.`);
 }
 return {interview:null,spent};
}
