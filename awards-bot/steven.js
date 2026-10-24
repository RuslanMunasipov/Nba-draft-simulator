// Steven Ex Pert, the league's expert (Inside FBL; scripts/assets/people.json steven-ex-pert): the awards race after the
// week's Sunday and the month's all-position five are his posts (owner, 24.10.2026). The awards bot's engine stays one:
// its workflow, its state and its chain of runs; only the sender changes. His posts go from his own bot
// (STEVEN_EX_PERT_BOT_TOKEN) into the awards bot's chat; without his token, or when Telegram refuses it, from the awards
// bot. Under the album's caption he adds two or three barbed lines in the style of a Shaqtin' a Fool studio (owner,
// 24.10.2026), written by Claude through the owner's subscription (scripts/claude-text.mjs, free): the favourite, who
// flew up, who fell out, who earned a place in the five. Every number of it is a number of the facts (places, FBL points by the league's formula from core.js, the
// sixth man's index, Mef prices); a verdict that brings its own is written again, then left out. The verdict never holds
// a post: without it the album goes as it is. Right after the album, his picture: the punchline of his barbs, its prompt
// written whole by Claude (owner, 23.10.2026, scripts/picture-prompt.mjs), the code giving only the references (his face,
// the players' ESPN faces), drawn by OpenAI; no prompt or no drawing, no picture. Ultra-realism always (owner,
// 24.10.2026): a real photograph, his face exactly as in his photo (the owner's reference, people/steven-ex-pert.jpg), in
// high quality; a prompt that does not ask for it goes back to Claude.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc,dayLabel,raceKey} from './messages.js';
import {moved} from './core.js';
import {refused} from './dildo.js';
import {allowedNumbers,strayNumbersIn} from './mike-roffon.js';
import path from 'node:path';
import {person,readImage,ASSETS} from '../scripts/image-pipeline.mjs';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {about,cast,playerRef,promptProblems,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';

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
// send(token) with the first sender Telegram takes; the next one only when Telegram refuses the bot (dildo.js refused():
// an unknown token, a bot not in the chat or without the right to post), when nothing was posted. Any other failure is
// the post's own and is thrown as it is (the album's text fallback goes on from there): a second sender would post it
// twice. Answers the sender's name.
export async function viaFirst(senders,send,{label='post',log=console.warn}={}){
 let last=Error(`${label}: no bot to send it`);
 for(const [i,s] of senders.entries()){
  try{await send(s.token);return s.name;}
  catch(e){last=e;if(!refused(e)||i===senders.length-1)throw e;log(`${label}: Telegram refused ${s.name} (${e.message}); ${senders[i+1].name} sends it.`);}
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
Твой стиль — студия после матчей в духе рубрики Shaqtin' a Fool: ведущие ржут над ляпами, подкалывают друг друга и героев, раздают шуточные «награды» за позор. Ты эксперт с серьёзным лицом, но комментарии у тебя колкие, как у человека, который пересматривает повтор и не может сдержать смех.
- Каждая строка — колкий комментарий-подкол: смешные прозвища по игре, шуточные номинации («приз за…»), театральное возмущение, сравнения из баскетбольного мема, а не из учебника.
- Больше всего достаётся тем, кто опустился и выпал из гонки, и пустым местам; лидеру — тоже, но с уважением: подколоть, а потом признать.
- Свои коронные выкрики и фразочки — придумывай каждый раз новые, по-русски; не цитируй и не изображай реальных ведущих и их фразы.
- Стебёшь игру и цифры, а не человека: ни слова о внешности, семье, национальности и личной жизни.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- 2 или 3 строки, каждая — одна законченная фраза до 180 знаков, каждая — отдельный колкий комментарий к посту. Можно одно эмодзи на строку. Без хэштегов, без списков, без подписи (её добавит редакция).
- Только факты из данных. Используй только числа из данных (места, ФО, индекс, цены, недели); никаких других чисел, процентов и своих подсчётов. Числа словами тоже проверяются. Можно не называть числа вовсе.
- Имена — ровно как в данных.
- Ответь строго JSON: {"lines": ["...", "..."]}`;
const TASK={
 race:`Колкие комментарии к гонке за награды после недели: подколи фаворита гонки MVP, того, кто взлетел (trend «поднялся»), и особенно тех, кто опустился или выпал из гонки (outOfTheRace); можно пройтись по новичкам, Mef player и шестому игроку — выбери самое смешное, не обязательно всё. Если firstRace, сравнивать не с чем: подкалывай сам расклад.`,
 five:`Колкие комментарии к символической пятёрке месяца: кто её главная звезда, кто пролез в неё чудом, на какой позиции была битва, а на какой место пустует (name null) — подколи и признай заслуги.`,
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

// --- His picture. Who is in it, besides him: for the race the MVP leader, the one who flew up the MVP list the most and
// the one who dropped the most (last week's order: previous); with no previous order, the rookie leader instead of
// them. For the five, its players. [{a: ESPN id, en: ESPN name, name: the league's, role, teams}]
export function picturePlayers(kind,{r,five,previous={}},who){
 const one=(x,role)=>x&&{a:String(x.a),en:x.n,name:who(x.a,x.n),role,teams:x.teams||[]};
 if(kind==='five')return five.filter(x=>x.row).map(({pos,row:x})=>one(x,`the ${pos} of the month's all-position five`));
 const list=r.mvp,moves=previous.mvp?list.map(x=>({x,m:moved(raceKey(x),list,previous.mvp)})).filter(y=>y.m):[];
 const up=moves.filter(y=>y.m>0).sort((a,b)=>b.m-a.m)[0],down=moves.filter(y=>y.m<0).sort((a,b)=>a.m-b.m)[0];
 const out=[one(list[0],'the leader of the MVP race'),
  up&&one(up.x,`flew up the MVP race by ${up.m} place(s)`),down&&one(down.x,`dropped ${-down.m} place(s) in the MVP race`),
  !previous.mvp&&one(r.roy[0],'the leader of the rookie of the year race')].filter(Boolean);
 return out.filter((p,i)=>out.findIndex(q=>q.a===p.a)===i);
}
// His references: his photo first (always), then the players' faces (faces: ESPN id -> headshot); a player without one
// stays out of the picture.
export function stevenRef(root=ASSETS){
 return {image:readImage(path.join(root,STEVEN.photo)),is:'the photo of Steven Ex Pert, the league expert: his face and look exactly, never the studio or the words behind him',facts:about(STEVEN),need:true};
}
// His pictures are drawn in high quality (the others' in low): one a week and one a month.
export const STEVEN_QUALITY='high';
// What his prompt must ask for (owner, 24.10.2026): ultra-realism and his face exactly as in his reference.
export function realismProblems(text){
 const t=String(text||''),out=[];
 if(!/ultra[- ]?(photo)?realis/i.test(t))out.push('ask for ultra-photorealism in plain words: a real photograph (camera, lens, natural skin texture), never a drawing, a painting, CGI or a cartoon');
 if(!/reference image 1[^.]*\b(face|identity)\b|\b(face|identity)\b[^.]*reference image 1/i.test(t))out.push('say that the face of Steven Ex Pert (reference image 1) is preserved exactly, identical to the reference');
 return out;
}
export function stevenCast(players,{faces=new Map(),root=ASSETS}={}){
 return cast([stevenRef(root),...players.map(p=>playerRef(faces.get(p.a)||null,p.en,{need:false,role:p.role,leagueName:p.name,
  fantasyTeamColors:LEAGUE_TEAMS[p.teams[0]]?.kit||null}))]);
}
const PICTURE_SYSTEM=`Ты — бильд-редактор Inside FBL, рубрики фэнтези-баскетбольной лиги друзей FBL. Эксперт Стивен Экс Перт ведёт свою студию в духе Shaqtin' a Fool: колкие комментарии к гонке за награды и к символической пятёрке месяца, подколы, шуточные «призы за позор», театральное возмущение. К его посту выходит одна смешная картинка — панчлайн его комментариев — в ультрареализме: настоящая фотография, не рисунок.
- Ультрареализм всегда: как живой кадр профессиональной камеры (назови камеру, объектив, свет), естественная кожа с порами, настоящие ткани, никакой рисовки, мультяшности, CGI, пластиковой кожи, каши в лицах и рук с лишними пальцами. В промпте прямо: ultra-photorealistic. Ты придумываешь её целиком и пишешь её промпт для ChatGPT.
- Картинка — из этих комментариев и этих фактов: его подколы, его прозвища, его шуточные награды. Где, как и в каком стиле — решаешь ты, каждый раз по-новому.
- Стивен Экс Перт — всегда в кадре, крупно и резко, лицом к камере или в три четверти, и всегда собой: лицо — точно как на его фото (reference image 1), узнаваемое с первого взгляда, без изменений черт, возраста и причёски; с фото берутся только он сам и его вид, не студия и не надписи за ним. Уверенный эксперт с серьёзным лицом, который еле сдерживает смех.
- Игроки — с лицами с референсов, в форме цветов своей фэнтези-команды (fantasyTeamColors), без логотипов НБА. Стебём игру и цифры, а не человека: ничего унизительного о внешности, семье, национальности.
- Ни реальных телеведущих, ни названий, логотипов и заставок реальных шоу и каналов: студия, награды и выкрики — свои.
- Надписи — только в кавычках, по-русски, заглавными, до 6 слов; числа в них — только из данных.

${CRAFT}`;
// Claude's picture ({images, prompt, idea}) or null. kind: race or five; facts: raceFacts/fiveFacts; verdict: his lines
// (null: from the facts alone); c: stevenCast.
export async function writeStevenPicture(kind,facts,verdict,c,{claude=claudeJSON,model=STEVEN_MODEL,timeoutMs=180e3,log=console.warn}={}){
 const brief=`${kind==='race'?'Гонка за награды после недели.':'Символическая пятёрка месяца.'}\n${verdict?.length?`Комментарии Стивена:\n${verdict.join('\n')}\n\n`:''}Данные:\n${JSON.stringify(facts,null,1)}`;
 return writePicture({system:PICTURE_SYSTEM,brief,c,check:t=>[...promptProblems(t,c,{numbers:allowedNumbers(facts)}),...realismProblems(t)],write:claude,model,timeoutMs,label:'Steven Ex Pert',log});
}
// The caption under his picture: the album's title (its first line), his signature and the album's hashtags.
export function pictureCaption(caption){
 const lines=caption.split('\n'),i=caption.lastIndexOf('\n\n');
 return `${lines[0]}\n🎬 ${SIGNATURE.replace(/^— /,'')}${i<0?'':caption.slice(i)}`;
}

// --- His introduction to the league (owner, 24.10.2026: allowed once, by hand: workflow steven-ex-pert.yml): his photo of
// the people base and these words, from his own bot. Written by Claude in his voice; no number in it.
export const HELLO_PHOTO=path.join(ASSETS,STEVEN?.photo||'people/steven-ex-pert.jpg');
export const HELLO_CAPTION=`<b>🎙 Inside FBL • Знакомьтесь: Стивен Экс Перт</b>

Добрый вечер, лига. Да, это тот самый костюм. Да, бумаги настоящие. Нет, автографы — после эфира.

Я — Стивен Экс Перт, эксперт Inside FBL. Моя студия открывается после каждого воскресенья: гонка за награды — MVP, новичок года, Mef player, шестой игрок и рекорды сезона. А после последнего игрового дня месяца — символическая пятёрка.

Правила студии простые:
— цифры только настоящие, ФО по формуле лиги;
— взлетел — похвалю, выпал из гонки — вручу приз за позор;
— стебём игру, а не человека. Почти всегда.

Фаворитов я уже записал. Блокнот опечатан. Вскроем в воскресенье. 🏆

${SIGNATURE}

#inside_fbl #гонка_за_награды`;
