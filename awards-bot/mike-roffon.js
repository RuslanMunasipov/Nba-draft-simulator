// Mike Roffon, the league's reporter (Inside FBL): after the game day's post, a flash interview with the hero of the day,
// posted by his own bot. The interview is written by Claude through the owner's subscription (scripts/claude-text.mjs) in his voice (sharp, hard, ironic; the voice of
// his Inside FBL pieces) from the facts of the game, and drawn by the picture pipeline: Mike, always with his white gloves
// and microphone, and the real player, in a picture whose prompt Claude writes whole from the interview (owner,
// 23.10.2026, scripts/picture-prompt.mjs). It is fiction and says so. Every number in it is a number of the facts: the FBL
// points come from core.js (fblFormula); an interview that brings a number of its own, or a line of his old pieces word
// for word, is written again, then dropped.
import {fileURLToPath} from 'node:url';
import {int} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc,dayLabel} from './messages.js';
import {readImage,gmOf,ASSETS} from '../scripts/image-pipeline.mjs';
import {dateTag} from './cards.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {cast,mikeRef,playerRef,gmRef,logoRef,promptProblems,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';

export const MIKE_MODEL=process.env.MIKE_MODEL||CLAUDE_MODEL;

// Some days Mike also turns to the GM of the hero's fantasy team (its first holder) with one question, and the GM stands
// beside the player in the picture (league chat, 23.10.2026): every other day, the same for a day and a player.
const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};
export function gmCorner(day,line){
 const team=Number.isInteger(line.h?.[0])?line.h[0]:null,gm=team!==null?LEAGUE_TEAMS[team]?.gm:null;
 return gm&&hash(`${day}:${line.a}:gm`)%2===0?{name:gm,team:LEAGUE_TEAMS[team].name}:null;
}
// The facts of an interview: the hero of the day and his game. who: the league's (Sports.ru) name; form: core.js form().
export function interviewFacts(day,line,who,{form,opponent,holiday}={}){
 const s=line.s,f=form?.get(line.a),corner=gmCorner(day,line);
 const t=Number.isInteger(line.h?.[0])?line.h[0]:null;
 return {date:`${dayLabel(day)} ${day.slice(0,4)}`,holiday:holiday?.name||null,gmQuestion:corner?{gm:corner.name,team:corner.team,lore:(t!==null&&gmOf(t)?.lore)||null}:null,
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
- Каждое интервью — с чистого листа: никаких дословных фраз, тем, образов и сюжетов из прошлых интервью и лонгридов Inside FBL. Образы — только из этого матча, этого игрока, его клуба и его игры; не из времени года и не из календаря (никакой осени, урожая, огорода, грядок, теплиц).
Игрок отвечает в своей манере: уверенно, коротко, с баскетбольным жаргоном по-русски (английские словечки — только русскими буквами: юзадж, клатч), с одной цитатой-афоризмом собственного сочинения.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- Интервью вымышленное, но факты — только из данных ниже. Используй только числа из данных; никаких других чисел (ни счёта матча, ни сезонных цифр, ни процентов, ни своих подсчётов). Числа словами тоже проверяются. Можно не называть числа вовсе.
- Имя игрока пиши так, как в данных (player.name).
- 3 вопроса и 3 ответа. Пролог — 1–2 предложения, послесловие — 1–2 предложения. Всего не длиннее 1300 знаков.
- Если в данных есть gmQuestion, Майк после трёх вопросов игроку поворачивает микрофон к GM его фэнтези-команды (gmQuestion.gm, команда gmQuestion.team) и задаёт ему один короткий колкий вопрос о выборе этого игрока; GM отвечает одной-двумя фразами как менеджер, который сделал ставку. Это поле gm; без gmQuestion оба его поля — пустые строки. Ни слова о внешности, семье и личной жизни GM: только его выбор и его команда.
- Ответь строго JSON: {"title": "цитата игрока для заголовка, до 70 знаков, без кавычек и без его имени", "prologue": "...", "qa": [{"q": "...", "a": "..."}, ...], "remark": "колкая реплика Майка после одного из ответов или пустая строка", "gm": {"q": "вопрос GM или пустая строка", "a": "ответ GM или пустая строка"}, "afterword": "..."}`;
// What the writers see of the facts: no date (owner, 24.10.2026: an autumn date turned a flash interview into a harvest,
// the theme of the week's long read; every interview starts from nothing). The date stays in the caption only.
const forWriter=({date,...facts})=>facts;
// fix: what was wrong with the last try, for the next one.
export function interviewMessages(facts,fix=''){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`Флеш-интервью с героем игрового дня. Данные:\n${JSON.stringify(forWriter(facts),null,1)}${fix?`\n\nПрошлый вариант отклонён: ${fix}. Напиши заново, с чистого листа.`:''}`};
}
// The shape of the answer, for the CLI's structured output.
const str={type:'string'};
export const INTERVIEW_SCHEMA={type:'object',additionalProperties:false,required:['title','prologue','qa','remark','gm','afterword'],properties:{
 title:str,prologue:str,remark:str,afterword:str,gm:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}},
 qa:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}}}}};

// Every number a text may use: those of the facts, and small counting words written as digits (1 to 5).
export function allowedNumbers(facts){
 const out=new Set(['1','2','3','4','5']);
 const walk=v=>{if(typeof v==='number')out.add(String(Math.abs(v)));else if(typeof v==='string')(v.match(/\d+/g)||[]).forEach(n=>out.add(n));else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
 walk(facts);return out;
}
// Numbers written as Russian words (any case; ordinals too): «двадцать девять», «тридцатью девятью», «сорок пятый»,
// «две тысячи триста».
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
 ['двухсот',200],['трист',300],['трехсот',300],['четырест',400],['четырехсот',400],['пятьсот',500],['пятисот',500],['шестьсот',600],['шестисот',600],['семьсот',700],['семисот',700],
 ['восемьсот',800],['восьмисот',800],['девятьсот',900],['девятисот',900],['тысяч',1000],['перв',1],['втор',2],
 ['трет',3],['четверт',4],['пят',5],['шест',6],['седьм',7],['восьм',8],['девят',9]];
const numberWord=w=>{
 if(NUMBER_WORDS.has(w))return NUMBER_WORDS.get(w);
 // Ordinals of units only as ordinal endings (пятый, шестого), never other words (пятно, шестерня).
 for(const [stem,v] of NUMBER_STEMS)if(w.startsWith(stem)&&(v>=10||/^(ый|ой|ий|ая|ое|ые|ого|ому|ым|ом|ую|ых|ыми|ья|ье|ьи|ьего|ьему|ьей|ьим|ьих|ьими|ью)$/.test(w.slice(stem.length))))return v;
 return null;
};
export function wordNumbers(text){
 // Punctuation ends a row: «сорок, тысяча» is 40 and 1000.
 const out=[],words=String(text).toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\s]+/gu,' | ').split(/\s+/);
 let sum=null,last=Infinity;
 const flush=()=>{if(sum!==null)out.push(sum);sum=null;last=Infinity;};
 for(const w of words){
  const v=w&&w!=='|'?numberWord(w):null;
  if(v===null){flush();continue;}
  // Thousands multiply what comes before them: «две тысячи триста» is 2300, «тысяча» alone 1000.
  if(v===1000){if(sum!==null&&last>=1000){flush();}sum=(sum===null?1:sum)*1000;last=1000;continue;}
  // A row adds up only from bigger to smaller places: «сорок пять», not «пять сорок».
  const place=v>=100?100:v>=20?10:1;
  if(sum!==null&&place<last&&!(last===10&&v>=10))sum+=v;else{flush();sum=v;}
  last=v>=10&&v<20?1:place;
 }
 flush();
 return out.map(String);
}
// The numbers of an interview that are not in its facts, in digits or in words (none: the interview may go out).
export function strayNumbers(interview,facts){return strayNumbersIn(interviewWords(interview),allowedNumbers(facts));}
// The numbers of any text, in digits or in words, that are not in allowed (a set of strings).
export function strayNumbersIn(text,allowed){
 return [...new Set([...(String(text).match(/\d+/g)||[]),...wordNumbers(text)].filter(n=>!allowed.has(n)))];
}
// The lines of his Inside FBL pieces (the voice's samples) an interview must not bring back word for word.
export const SAMPLE_LINES=['не вывеска, а петля','стягивает систему','цифры без косметики','редакционной косметики','спокойно и буднично',
 'так обычно и начинается самое интересное','печатать без дрожи','побочный эффект правильного решения','не охочусь за хайлайтами',
 'преступление без срока давности','роль важнее фамилии','не перепутай труд и шум','чем меньше шоу, тем больше игры','скорость без чтения',
 'думай до ловли','решение до ловли','рационально прожитое решение','тихие очки','шиномонтаж без домкрата','широкой шиной','хайлайты вместо хлеба',
 'платит по счетам','кардиограмма ровнеет','злость обычно выигрывает весной','жёстче, чем течение','слепок власти','право на реакции','иногда — слишком просто',
 'малую арифметику','новый «пол»','stability floor'];
const plain=t=>String(t).toLowerCase().replace(/ё/g,'е').replace(/[«»"„“”'’]/g,'').replace(/[—–-]/g,' ').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
const interviewWords=x=>[x.title,x.prologue,x.remark,x.afterword,...(x.qa||[]).flatMap(q=>[q.q,q.a]),x.gm?.q,x.gm?.a].filter(Boolean).join(' ');
// The sample lines an interview repeats (none: it may go out).
export function copiedLines(interview){return copiedIn(interviewWords(interview));}
// Themes that belong to no flash interview or long read (owner, 24.10.2026: always new): the seasons and the harvest
// of the 23.10 long read (Lemarius's greenhouse), which a flash interview with Tatum brought back.
const STALE=/(?<!\p{L})(урожа\p{L}*|огород\p{L}*|грядк\p{L}*|(?:до|не|недо|со|пере)зре\p{L}*|колос(?!с)\p{L}*|колось\p{L}*|жатв\p{L}*|посев\p{L}*|теплиц\p{L}*|осен\p{L}*)/giu;
// The stale theme words of any text (none: it may go out).
export function staleIn(text){return [...new Set((String(text).toLowerCase().replace(/ё/g,'е').match(STALE)||[]))];}
export const staleThemes=interview=>staleIn(interviewWords(interview));
// The sample lines any text repeats.
export function copiedIn(text){
 const t=` ${plain(text)} `;
 return SAMPLE_LINES.filter(l=>t.includes(` ${plain(l)} `));
}
export function validInterview(x){
 return x&&typeof x.prologue==='string'&&Array.isArray(x.qa)&&x.qa.length>=2&&x.qa.every(q=>typeof q.q==='string'&&typeof q.a==='string')&&typeof x.afterword==='string';
}

// The interview as Telegram HTML (the reply under his picture), and the picture's caption.
export function interviewText(x,facts){
 const name=esc(facts.player.name),qa=x.qa.map((q,i)=>`<b>Майк Роффон.</b> ${esc(q.q)}\n<b>${name}.</b> ${esc(q.a)}${i===0&&x.remark?`\n<i>Майк Роффон: ${esc(x.remark)}</i>`:''}`);
 // The GM's word, on the days Mike asks him (gmQuestion) and he answered.
 const g=facts.gmQuestion&&x.gm?.q?.trim()&&x.gm?.a?.trim()?`<b>Майк Роффон.</b> ${esc(x.gm.q.trim())}\n<b>GM ${esc(facts.gmQuestion.gm)} (${esc(facts.gmQuestion.team)}).</b> ${esc(x.gm.a.trim())}`:null;
 return [`<b>🎙 Inside FBL • Флеш-интервью</b>`,`<i>«${esc(String(x.title||'').replace(/^[«"„“]+|[»"“”]+$/g,''))}»</i>`,'',`<b>Пролог Майка.</b> ${esc(x.prologue)}`,'',qa.join('\n\n'),'',...g?[g,'']:[],
  `<b>Послесловие Майка.</b> ${esc(x.afterword)}`,'','— Майк Роффон, специально для Inside FBL','',
  '<i>Интервью вымышленное: цифры настоящие, слова — нет.</i>'].join('\n');
}
export function interviewCaption(facts,day){
 return `<b>🎙 Inside FBL • ${esc(facts.player.name)}</b> — <b>${int(facts.game.fo)}</b> ФО · герой дня ${esc(facts.date)}\n\n#inside_fbl #интервью ${dateTag(day)}`;
}

// --- His picture: Claude writes its prompt whole from the interview and the game (the code only gives the references:
// Mike's face, the hero's ESPN face, the GM's photo on the days Mike asks him too, the fantasy team's logo, the league's).
const FBL_LOGO=fileURLToPath(new URL('./assets/fbl-logo.png',import.meta.url));
// team: the index (0-7) of the hero's FBL team (line.h[0]); face: his ESPN headshot (render.mjs headshot), or null.
export function mikeCast(facts,{root=ASSETS,team=null,face=null}={}){
 const club=Number.isInteger(team);
 return cast([mikeRef(root),playerRef(face,facts.player.en,{role:'the hero of the day'}),
  facts.gmQuestion&&club&&gmOf(team)?gmRef(team,root,{is:'the photo of the general manager (GM) who picked the player'}):null,
  club?logoRef(team,root,{is:"the logo of the player's fantasy team"}):null,
  {image:readImage(FBL_LOGO),is:'the logo of the league, FBL'}]);
}
const PICTURE_SYSTEM=`Ты — бильд-редактор Inside FBL, рубрики фэнтези-баскетбольной лиги друзей FBL. После игрового дня Майк Роффон, легендарный репортёр рубрики, берёт флеш-интервью у героя дня; интервью выходит с фотореалистичной картинкой. Ты придумываешь её целиком и пишешь её промпт для ChatGPT.
- Картинка — из этого интервью: его сцена, его настроение, его колкость. Где, как и в каком стиле — решаешь ты, каждый раз по-новому.
- Майк Роффон — ветеран-репортёр, всегда в белых перчатках и с винтажным хромированным микрофоном; одет как спортивный репортёр под сцену, никогда не в каске, военной форме, камуфляже или жилете PRESS. Микрофон — у игрока.
- Игрок — в форме цветов своей фэнтези-команды (kitColors) с её логотипом с референса, не в форме своего клуба НБА; никаких логотипов НБА.
- Если в данных есть gmQuestion и фото GM в референсах — GM его фэнтези-команды стоит рядом и ждёт своей очереди к микрофону.
- Логотип лиги FBL — по желанию: на пресс-волле, на кубе микрофона.
- Надписи — только в кавычках; числа в них — только из данных.

${CRAFT}`;
// Claude's picture of an interview ({images, prompt, idea}), or null. interview: the interview he wrote (null for a day
// whose picture is drawn alone: then from the game).
export async function writeMikePicture(facts,interview,c,{claude=claudeJSON,model=MIKE_MODEL,timeoutMs=180e3}={}){
 const team=facts.fblTeams?.[0],kit=LEAGUE_TEAMS.find(t=>t.name===team?.team)?.kit||null;
 const brief=`${interview?`Интервью:\n${JSON.stringify(interview,null,1)}\n\n`:''}Данные:\n${JSON.stringify({...forWriter(facts),kitColors:kit},null,1)}`;
 return writePicture({system:PICTURE_SYSTEM,brief,c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:'Mike Roffon'});
}

// The interview from Claude (one headless call of the CLI, JSON by the schema). Answers {interview, usage} or throws.
export async function writeInterview(facts,{claude=claudeJSON,model=MIKE_MODEL,timeoutMs=180e3,fix=''}={}){
 const {data,usage}=await claude({...interviewMessages(facts,fix),schema:INTERVIEW_SCHEMA,model,timeoutMs});
 if(!validInterview(data))throw Error('Claude text: not an interview');
 return {interview:data,usage:usage||null};
}
// Written until it holds no number of its own, no line of his old pieces and no stale theme (three tries, each told what
// was wrong with the last); null when it still does. The subscription bills nothing per call, so the text costs nothing.
export async function interviewFor(facts,opts={}){
 let fix='';
 for(let i=0;i<3;i++){
  const {interview}=await writeInterview(facts,{...opts,fix});
  const stray=strayNumbers(interview,facts),copied=copiedLines(interview),stale=staleThemes(interview);
  if(!stray.length&&!copied.length&&!stale.length)return {interview};
  fix=[stray.length&&`числа не из данных (${stray.join(', ')})`,copied.length&&`дословные фразы старых выпусков (${copied.join(' | ')})`,
   stale.length&&`чужая тема — время года и урожай (${stale.join(', ')}); образы только из этого матча и этого игрока`].filter(Boolean).join('; ');
  console.warn(`Mike Roffon: ${fix}, written again.`);
 }
 return {interview:null};
}
