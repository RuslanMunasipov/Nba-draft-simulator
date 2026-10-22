// Mike Roffon, the league's reporter (Inside FBL): after the game day's post, a flash interview with the hero of the day,
// posted by his own bot. The interview is written by Claude through the owner's subscription (scripts/claude-text.mjs) in his voice (sharp, hard, ironic; the voice of
// his Inside FBL pieces) from the facts of the game, and drawn by the picture pipeline: Mike, always with his white gloves
// and microphone, and the real player. It is fiction and says so. Every number in it is a number of the facts: the FBL
// points come from core.js (fblFormula); an interview that brings a number of its own, or a line of his old pieces word
// for word, is written again, then dropped.
import {fileURLToPath} from 'node:url';
import {int} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc,dayLabel} from './messages.js';
import {person,looks,readImage,teamLogo,ASSETS} from '../scripts/image-pipeline.mjs';
import {dateTag} from './cards.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';

export const MIKE_MODEL=process.env.MIKE_MODEL||CLAUDE_MODEL;

// The facts of an interview: the hero of the day and his game. who: the league's (Sports.ru) name; form: core.js form().
export function interviewFacts(day,line,who,{form,opponent,holiday}={}){
 const s=line.s,f=form?.get(line.a);
 return {date:`${dayLabel(day)} ${day.slice(0,4)}`,holiday:holiday?.name||null,
  player:{name:who(line.a,line.n),en:line.n,club:line.c,opponent:opponent||null},
  fblTeams:(line.h||[]).map(t=>({team:LEAGUE_TEAMS[t]?.name,gm:LEAGUE_TEAMS[t]?.gm||null})),
  game:{fo:line.p,minutes:Math.round(line.m),pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,fgMissed:s.fga-s.fgm,ftm:s.ftm,fta:s.fta,ftMissed:s.fta-s.ftm,pf:s.pf},
  heroOfTheDay:{rank:1,heroDaysLast7:f?.hero||1,daysInARow:f?.heroRun||1}};
}

// His voice, as his Inside FBL pieces have it (telegra.ph, Dec 2025): described, never quoted, so that no line of them comes back.
const VOICE=`Ты — Майк Роффон, легендарный репортёр рубрики Inside FBL фэнтези-лиги FBL (Fantasy Brothers League). Ветеран, которого не впечатлить ни цифрами, ни позой; всегда в белых перчатках и с винтажным микрофоном.
Твой стиль: хлёсткий, жёсткий, ироничный.
- Вопросы короткие, без лести и без разгона, бьют в слабое место: потери, промахи с игры и с линии, фолы, «а если завтра так же?». Цепляйся за слово из ответа и разворачивай его против собеседника.
- Реплика после ответа — одна сухая строка, как штамп в протоколе: без восклицаний, с подковыркой.
- Пролог задаёт сцену и ставит диагноз в одну-две фразы, плотно и образно. Послесловие выносит вердикт и заканчивается ударной фразой, которую хочется переслать.
- Метафоры только свои, свежие, из жизни, а не из спортивных штампов. Ирония — через точное наблюдение, а не через грубость.
- Никаких дословных фраз из прошлых выпусков Inside FBL: каждое интервью пишется заново.
Игрок отвечает в своей манере: уверенно, коротко, с баскетбольным жаргоном и вкраплением английских терминов, с одной цитатой-афоризмом собственного сочинения.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- Интервью вымышленное, но факты — только из данных ниже. Используй только числа из данных; никаких других чисел (ни счёта матча, ни сезонных цифр, ни процентов, ни своих подсчётов). Числа словами тоже проверяются. Можно не называть числа вовсе.
- Имя игрока пиши так, как в данных (player.name).
- 3 вопроса и 3 ответа. Пролог — 1–2 предложения, послесловие — 1–2 предложения. Всего не длиннее 1300 знаков.
- Ответь строго JSON: {"title": "цитата игрока для заголовка, до 70 знаков, без кавычек и без его имени", "prologue": "...", "qa": [{"q": "...", "a": "..."}, ...], "remark": "колкая реплика Майка после одного из ответов или пустая строка", "afterword": "..."}`;
export function interviewMessages(facts){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`Флеш-интервью с героем игрового дня. Данные:\n${JSON.stringify(facts,null,1)}`};
}
// The shape of the answer, for the CLI's structured output.
const str={type:'string'};
export const INTERVIEW_SCHEMA={type:'object',additionalProperties:false,required:['title','prologue','qa','remark','afterword'],properties:{
 title:str,prologue:str,remark:str,afterword:str,
 qa:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}}}}};

// Every number a text may use: those of the facts, and small counting words written as digits (1 to 5).
export function allowedNumbers(facts){
 const out=new Set(['1','2','3','4','5']);
 const walk=v=>{if(typeof v==='number')out.add(String(Math.abs(v)));else if(typeof v==='string')(v.match(/\d+/g)||[]).forEach(n=>out.add(n));else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
 walk(facts);return out;
}
// Numbers written as Russian words (any case; ordinals too): «двадцать девять», «тридцатью девятью», «сорок пятый».
// Exact forms for the short words (семья is not семь), stems for the rest. Hundreds, tens and units of a row add up.
const NUMBER_WORDS=(()=>{
 const m=new Map(),set=(v,...ws)=>ws.forEach(w=>m.set(w,v));
 set(0,'ноль','нуля','нулём','нулем');set(1,'один','одна','одно','одного','одной','одному','одним','одну','одними','одних');
 set(2,'два','две','двух','двум','двумя');set(3,'три','трёх','трех','трём','трем','тремя');set(4,'четыре','четырёх','четырех','четырём','четырем','четырьмя');
 set(5,'пять','пяти','пятью');set(6,'шесть','шести','шестью');set(7,'семь','семи');set(8,'восемь','восьми','восемью','восьмью');set(9,'девять','девяти','девятью');
 set(40,'сорок','сорока');set(90,'девяносто','девяноста');set(100,'сто','ста');
 return m;})();
const NUMBER_STEMS=[['одиннадцат',11],['двенадцат',12],['тринадцат',13],['четырнадцат',14],['пятнадцат',15],['шестнадцат',16],['семнадцат',17],
 ['восемнадцат',18],['девятнадцат',19],['десят',10],['двадцат',20],['тридцат',30],['пятьдесят',50],['пятидесят',50],['шестьдесят',60],
 ['шестидесят',60],['семьдесят',70],['семидесят',70],['восемьдесят',80],['восьмидесят',80],['сороков',40],['девяност',90],['двест',200],
 ['двухсот',200],['трист',300],['трехсот',300],['четырест',400],['четырехсот',400],['пятьсот',500],['пятисот',500],['перв',1],['втор',2],
 ['трет',3],['четверт',4],['пят',5],['шест',6],['седьм',7],['восьм',8],['девят',9]];
const numberWord=w=>{
 if(NUMBER_WORDS.has(w))return NUMBER_WORDS.get(w);
 // Ordinals of units only as ordinal endings (пятый, шестого), never other words (пятно, шестерня).
 for(const [stem,v] of NUMBER_STEMS)if(w.startsWith(stem)&&(v>=10||/^(ый|ой|ий|ая|ое|ые|ого|ому|ым|ом|ую|ых|ыми|ья|ье|ьи|ьего|ьему|ьей|ьим|ьих|ьими|ью)$/.test(w.slice(stem.length))))return v;
 return null;
};
export function wordNumbers(text){
 const out=[],words=String(text).toLowerCase().replace(/ё/g,'е').split(/[^\p{L}]+/u);
 let sum=null,last=Infinity;
 const flush=()=>{if(sum!==null)out.push(sum);sum=null;last=Infinity;};
 for(const w of words){
  const v=w?numberWord(w.replace(/ё/g,'е')):null;
  if(v===null){flush();continue;}
  // A row adds up only from bigger to smaller places: «сорок пять», not «пять сорок».
  const place=v>=100?100:v>=20?10:1;
  if(sum!==null&&place<last&&!(last===10&&v>=10))sum+=v;else{flush();sum=v;}
  last=v>=10&&v<20?1:place;
 }
 flush();
 return out.map(String);
}
// The numbers of an interview that are not in its facts, in digits or in words (none: the interview may go out).
export function strayNumbers(interview,facts){
 const allowed=allowedNumbers(facts),text=interviewWords(interview);
 return [...new Set([...(text.match(/\d+/g)||[]),...wordNumbers(text)].filter(n=>!allowed.has(n)))];
}
// The lines of his Inside FBL pieces (the voice's samples) an interview must not bring back word for word.
export const SAMPLE_LINES=['не вывеска, а петля','стягивает систему','цифры без косметики','редакционной косметики','спокойно и буднично',
 'так обычно и начинается самое интересное','печатать без дрожи','побочный эффект правильного решения','не охочусь за хайлайтами',
 'преступление без срока давности','роль важнее фамилии','не перепутай труд и шум','чем меньше шоу, тем больше игры','скорость без чтения',
 'думай до ловли','решение до ловли','рационально прожитое решение','тихие очки','шиномонтаж без домкрата','широкой шиной','хайлайты вместо хлеба',
 'платит по счетам','кардиограмма ровнеет','злость обычно выигрывает весной','жёстче, чем течение','слепок власти','право на реакции','иногда — слишком просто',
 'малую арифметику','новый «пол»','stability floor'];
const plain=t=>String(t).toLowerCase().replace(/ё/g,'е').replace(/[«»"„“”'’]/g,'').replace(/[—–-]/g,' ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
const interviewWords=x=>[x.title,x.prologue,x.remark,x.afterword,...(x.qa||[]).flatMap(q=>[q.q,q.a])].join(' ');
// The sample lines an interview repeats (none: it may go out).
export function copiedLines(interview){
 const text=` ${plain(interviewWords(interview))} `;
 return SAMPLE_LINES.filter(l=>text.includes(` ${plain(l)} `));
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
// Each scene its own clothes: always a sports reporter, dressed for where he is; one look per interview. Only his face comes
// from his photo: its camouflage helmet and PRESS vest belong to a war zone, never to an arena or a press conference.
// The player wears his FBL team's kit (KIT, WARMUP): its colors and its logo; his NBA club's when he has no FBL team.
const SCENES=[
 {where:'outside the arena after the game, at night, by the lit arena entrance, the player in a hoodie over KIT, his bag on his shoulder',
  wear:['a long dark overcoat over a suit, a scarf and a press badge on a lanyard','a navy rain jacket over a shirt and tie, a press badge on a lanyard']},
 {where:'the tunnel under the stands right after the final buzzer, the player still sweaty in KIT, a towel on his neck',
  wear:['a tweed blazer, an open-collar shirt and a press badge on a lanyard','a dark sports jacket over a polo shirt and a press badge on a lanyard']},
 {where:'courtside after the game, confetti and crowd blurred behind, the player catching his breath in KIT',
  wear:['a vintage sports-broadcaster blazer with the INSIDE FBL patch, shirt and tie','a grey suit, an open-collar shirt and a courtside media pass']},
 {where:'the post-game press conference: the player in WARMUP, at the table with a row of microphones, Mike standing at the front leaning in',
  wear:['a dark suit, a polka-dot tie and a press accreditation badge','a charcoal three-piece suit, a knit tie and a press accreditation badge']},
];
// team: the index (0-7) of the hero's FBL team (line.h[0]); its logo from scripts/assets/team-logos.
export function interviewPicture(facts,day,{root=ASSETS,team=null}={}){
 const mike=person('mike-roffon'),logo=readImage(fileURLToPath(new URL('./assets/fbl-logo.png',import.meta.url)));
 const club=Number.isInteger(team)?LEAGUE_TEAMS[team]:null,crest=club?teamLogo(team,root):null;
 const refs=[{image:readImage(`${root}/${mike.photo}`),what:'Mike Roffon, the reporter (take only his face from it, not his clothes)'},
  {image:logo,what:'the logo of the league, FBL'},{image:crest,what:`the logo of ${club?.name}, the player's fantasy team`}].filter(r=>r.image);
 const n=image=>image?refs.findIndex(r=>r.image===image)+1:0,leagueRef=n(logo),crestRef=n(crest);
 const kit=crestRef?`the game jersey of his fantasy team ${club.name}: a basketball uniform in the colors of the logo in reference image ${crestRef}, that logo on the chest`
  :'his game jersey',warmup=crestRef?`the warm-up shirt of his fantasy team ${club.name}, in the colors of the logo in reference image ${crestRef}, that logo on the chest`:'his team warm-up shirt';
 const scene=SCENES[hash(day+facts.player.en)%SCENES.length],outfit=scene.wear[hash(facts.player.en+day+'look')%scene.wear.length];
 return {images:refs.map(r=>r.image),prompt:`REFERENCES: ${refs.map((r,i)=>`reference image ${i+1} is ${r.what}`).join('; ')}.
MIKE ROFFON: ${looks({...mike,outfit:null})}. Preserve his face precisely, instantly recognizable. Today he is dressed as a sports reporter for this scene: ${outfit}, and his white gloves. No helmet, no military uniform, no camouflage, no PRESS or tactical vest.
PLAYER: the real NBA player ${facts.player.en}, exactly as he really looks (face, build, hair), ${crestRef?`dressed not in his NBA club's uniform but in the kit of his fantasy team ${club.name}: its colors and its logo exactly as in reference image ${crestRef}, no NBA club logos`:`in the uniform of the ${facts.player.club}`}.
SCENE: a flash interview, ${scene.where.replace('KIT',kit).replace('WARMUP',warmup)}. Mike, in white gloves, holds his vintage chrome microphone up to the player, asking a hard question with a sharp, sceptical look; the player answers, confident.${leagueRef?` Behind them a press wall printed with the league logo from reference image ${leagueRef}, repeated.`:''} At the bottom a TV lower-third banner reads "INSIDE FBL".
STYLE: photorealistic sports-broadcast still, cinematic light, 35mm lens, shallow depth of field. Square composition. The only text: "INSIDE FBL" on the banner and on the press wall, spelled exactly${crestRef?`, and the lettering inside the team logo, exactly as in reference image ${crestRef}`:''}. No other captions, numbers, jersey numbers or watermarks.`};
}

// The interview from Claude (one headless call of the CLI, JSON by the schema). Answers {interview, usage} or throws.
export async function writeInterview(facts,{claude=claudeJSON,model=MIKE_MODEL,timeoutMs=180e3}={}){
 const {data,usage}=await claude({...interviewMessages(facts),schema:INTERVIEW_SCHEMA,model,timeoutMs});
 if(!validInterview(data))throw Error('Claude text: not an interview');
 return {interview:data,usage:usage||null};
}
// Written until it holds no number of its own and no line of his old pieces (two tries); null when it still does.
// The subscription bills nothing per call, so the text costs nothing.
export async function interviewFor(facts,opts){
 for(let i=0;i<2;i++){
  const {interview}=await writeInterview(facts,opts);
  const stray=strayNumbers(interview,facts),copied=copiedLines(interview);
  if(!stray.length&&!copied.length)return {interview};
  if(stray.length)console.warn(`Mike Roffon: numbers not in the facts (${stray.join(', ')}), written again.`);
  if(copied.length)console.warn(`Mike Roffon: lines of his old pieces (${copied.join(' | ')}), written again.`);
 }
 return {interview:null};
}
