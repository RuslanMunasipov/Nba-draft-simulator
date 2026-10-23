// Inside FBL, Mike Roffon's weekly long read (league chat, 23.10.2026): every Friday at 18:00 (Moscow) a big interview
// with a guest of the week (the league week so far, Monday to Thursday's games, and the table and races as they stand), a GM, a player or the commissioner, picked by what the week did to them: the league table,
// the award races, the antitop. Mike goes to see them where they live and work, watches what they do, and they may give
// him something. The piece is written by Claude through the owner's subscription (scripts/claude-text.mjs) in his voice
// (mike-roffon.js), one funny picture per chapter and an opener with Mike interviewing the guest are drawn by OpenAI
// (scripts/image-pipeline.mjs), the whole is published on Telegraph, and Mike's bot posts the opener with the link.
// Every number in it is a number of the facts: FBL points come from the archive's lines (core.js, fblFormula on ESPN's
// box score) and the league table from season.js teamPoints (the same formula); a piece that brings a number of its own,
// or a line of his old pieces word for word, is sent back to be fixed, and dropped when it still does.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {perPlayer,weeklyBlocks,races,addDays,weekOf} from './core.js';
import {allowedNumbers,strayNumbersIn,copiedIn} from './mike-roffon.js';
import {imageName} from './images.js';
import {fillPrompt,promptProblems,PROMPT_CRAFT} from '../scripts/picture-prompt.mjs';
import {person,gmOf,gmPhoto,looks,readImage,espnHeadshot,ASSETS} from '../scripts/image-pipeline.mjs';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {esc} from './messages.js';

export const LONGREAD_MODEL=process.env.INSIDE_FBL_MODEL||CLAUDE_MODEL;
// Friday 18:00 in Moscow (UTC+3 all year): when the piece goes out.
export const POST_AT={weekday:5,hour:18};
const round=x=>Math.round(Number(x)||0);
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayRu=d=>`${Number(d.slice(8))} ${MONTHS[Number(d.slice(5,7))-1]}`;

// --- The week and its numbers, from the awards bot's archive (every line scored by core.js with fblFormula) and the
// official table (season.js teamPoints). table: points per team (index 0-7). who(a,n): the league's name of a player.
// rostered: ESPN id -> teams holding him now; rookies, mef: as core.js races takes them.
export function weekData(lines,day,{table,who,rostered,rookies,mef}){
 const w=weekOf(day),mine=lines.filter(l=>l.d>=w.start&&l.d<=w.end),season=lines.filter(l=>l.d<=w.end);
 const weekPoints=LEAGUE_TEAMS.map((_,t)=>round(mine.filter(l=>l.h?.includes(t)).reduce((s,l)=>s+l.p,0)));
 const order=table.map((p,t)=>({t,points:round(p)})).sort((a,b)=>b.points-a.points||a.t-b.t);
 const rank=t=>1+order.filter(x=>x.points>round(table[t])).length;
 const blocks=weeklyBlocks(mine),r=races(season,{rostered,rookies,mef});
 const player=row=>row&&{a:row.a,name:who(row.a,row.n),en:imageName(row),club:row.c||null,fo:round(row.p),games:row.games,
  teams:(row.teams||row.h||[]).filter(Number.isInteger)};
 const lastDay=mine.reduce((m,l)=>l.d>m?l.d:m,w.start);
 return {week:w,lastDay,weekPoints,rank,order,table:table.map(round),
  heroes:blocks.heroes.map(player),flops:blocks.flops.map(player),gold:blocks.gold.map(player),
  mvp:r.mvp.slice(0,5).map(player),roy:r.roy.slice(0,3).map(player),sixth:r.sixth.slice(0,3).map(x=>({...player(x),teams:[x.team],bench:x.bench})),
  seasonRows:new Map(perPlayer(season).map(x=>[x.a,x])),weekRows:new Map(perPlayer(mine).map(x=>[x.a,x])),mine};
}

// --- The guest of the week: the stories in turn (the week's number picks where to start), the first that has a guest
// who was not on in the last REPEAT_WEEKS weeks. history: [{key}] of the past pieces, newest last.
export const STORIES=[
 {id:'gm:leader',ru:'лидер таблицы лиги: как живётся на вершине и сколько ещё продержится'},
 {id:'player:weekHero',ru:'герой недели: лучший по ФО игрок лиги за эту неделю (с понедельника)'},
 {id:'gm:weekWorst',ru:'худшая неделя лиги: команда собрала меньше всех ФО за эту неделю (с понедельника)'},
 {id:'player:mvp',ru:'лидер гонки MVP лиги'},
 {id:'gm:last',ru:'последнее место в таблице: дно, с которого надо выбираться'},
 {id:'player:weekFlop',ru:'антигерой недели: худший по ФО игрок лиги за эту неделю (антитоп, с понедельника)'},
 {id:'gm:weekBest',ru:'лучшая неделя лиги: команда собрала больше всех ФО за эту неделю (с понедельника)'},
 {id:'player:roy',ru:'лидер гонки новичков'},
 {id:'commissioner',ru:'комиссар лиги: власть, правила и что он думает о таблице'},
];
export const REPEAT_WEEKS=6;
export function storyGuest(id,data){
 const {order,weekPoints}=data,byWeek=[...weekPoints.keys()].sort((a,b)=>weekPoints[b]-weekPoints[a]||a-b);
 const gm=t=>Number.isInteger(t)?{key:`gm:${t}`,kind:'gm',team:t}:null,pl=row=>row?{key:`player:${row.a}`,kind:'player',row}:null;
 switch(id){
  case 'gm:leader':return gm(order[0]?.t);
  case 'gm:last':return gm(order[order.length-1]?.t);
  case 'gm:weekBest':return gm(byWeek[0]);
  case 'gm:weekWorst':return gm(byWeek[byWeek.length-1]);
  case 'player:weekHero':return pl(data.heroes[0]);
  case 'player:weekFlop':return pl(data.flops[0]);
  case 'player:mvp':return pl(data.mvp[0]);
  case 'player:roy':return pl(data.roy[0]);
  case 'commissioner':return {key:'commissioner',kind:'commissioner'};
 }
 return null;
}
export function pickGuest(data,history=[],{force=null,keep=null}={}){
 if(force){const g=forcedGuest(force,data);if(g)return g;}
 // keep: the guest of the draft being redone (its key), with the story that brought them.
 if(keep){for(const st of STORIES){const g=storyGuest(st.id,data);if(g?.key===keep)return {...g,story:st};}
  const [kind,id]=keep.split(':'),g=forcedGuest(kind==='gm'?`gm:${Number(id)+1}`:keep,data);if(g)return g;}
 const recent=new Set(history.slice(-REPEAT_WEEKS).map(h=>h.key)),start=(data.week.n-1)%STORIES.length;
 for(let i=0;i<STORIES.length;i++){const s=STORIES[(start+i)%STORIES.length],g=storyGuest(s.id,data);if(g&&!recent.has(g.key))return {...g,story:s};}
 const s=STORIES[start];return {...storyGuest(s.id,data)||{key:'commissioner',kind:'commissioner'},story:s};
}
// A guest by hand: gm:<team number 1-8>, player:<ESPN id> or commissioner.
function forcedGuest(force,data){
 const [kind,id]=String(force).split(':');
 if(kind==='gm'&&Number(id)>=1&&Number(id)<=LEAGUE_TEAMS.length)return {key:`gm:${Number(id)-1}`,kind:'gm',team:Number(id)-1,story:{id:'manual',ru:'гость недели по выбору редакции'}};
 if(kind==='player'&&id){const row=data.seasonRows.get(String(id));if(row)return {key:`player:${row.a}`,kind:'player',row:{a:row.a,name:row.n,en:imageName(row),club:row.c,fo:round(row.p),games:row.games,teams:row.h},story:{id:'manual',ru:'гость недели по выбору редакции'}};}
 if(kind==='commissioner')return {key:'commissioner',kind:'commissioner',story:{id:'manual',ru:'гость недели по выбору редакции'}};
 return null;
}

// --- The facts Claude sees, and the only numbers the piece may carry.
const teamOf=t=>Number.isInteger(t)?{team:LEAGUE_TEAMS[t]?.name,gm:LEAGUE_TEAMS[t]?.gm||null}:null;
const lineOut=p=>p&&{name:p.name,club:p.club,fo:p.fo,games:p.games,fblTeams:(p.teams||[]).map(t=>LEAGUE_TEAMS[t]?.name)};
export function longreadFacts(data,guest,{who,gifts=[],guests=[]}={}){
 const w=data.week,table=data.order.map(x=>({place:data.rank(x.t),...teamOf(x.t),points:x.points,weekPoints:data.weekPoints[x.t]}));
 const facts={week:{n:w.n,label:`неделя ${w.n}, игры ${dayRu(w.start)} – ${dayRu(data.lastDay)}`},
  story:guest.story.ru,table,
  weekHeroes:data.heroes.map(lineOut),weekFlops:data.flops.map(lineOut),
  races:{mvp:data.mvp.map((p,i)=>({place:i+1,...lineOut(p)})),rookies:data.roy.map((p,i)=>({place:i+1,...lineOut(p)})),sixthMan:data.sixth.map((p,i)=>({place:i+1,...lineOut(p)}))},
  mikesShelf:gifts.slice(-8),lastGuests:guests.slice(-REPEAT_WEEKS)};
 if(guest.kind==='gm'){const t=guest.team,rows=data.mine.filter(l=>l.h?.includes(t)),per=perPlayer(rows).sort((a,b)=>b.p-a.p);
  const p=gmOf(t);
  facts.guest={kind:'GM',name:LEAGUE_TEAMS[t].gm,team:LEAGUE_TEAMS[t].name,kitColors:LEAGUE_TEAMS[t].kit||null,looks:p?[p.keep,p.style].filter(Boolean).join('; '):null,lore:p?.lore||null,
   place:data.rank(t),points:data.table[t],weekPoints:data.weekPoints[t],gapToLeader:data.order[0].points-data.table[t],
   weekBest:per.slice(0,3).map(r=>({name:who(r.a,r.n),fo:round(r.p),games:r.games})),
   weekWorst:per.slice(-2).reverse().filter(r=>!per.slice(0,3).includes(r)).map(r=>({name:who(r.a,r.n),fo:round(r.p),games:r.games}))};
 }else if(guest.kind==='player'){const r=guest.row,s=data.seasonRows.get(r.a),wk=data.weekRows.get(r.a);
  const placeIn=list=>{const i=list.findIndex(x=>x.a===r.a);return i<0?null:i+1;};
  facts.guest={kind:'игрок',name:who(r.a,r.name),club:r.club,fblTeams:(r.teams||[]).map(teamOf),kitColors:Number.isInteger(r.teams?.[0])?LEAGUE_TEAMS[r.teams[0]].kit||null:null,
   week:wk?{fo:round(wk.p),games:wk.games,pts:wk.s.pts,reb:wk.s.reb,ast:wk.s.ast,stl:wk.s.stl,blk:wk.s.blk,tov:wk.s.tov,fgm:wk.s.fgm,fga:wk.s.fga,ftm:wk.s.ftm,fta:wk.s.fta,pf:wk.s.pf}:null,
   season:s?{fo:round(s.p),games:s.games}:null,mvpPlace:placeIn(data.mvp),rookiePlace:placeIn(data.roy)};
 }else{const p=person('adam-silverov');facts.guest={kind:'комиссар лиги',name:p?.name||'Адам Сильверов',looks:p?.keep||null};}
 return facts;
}

// --- His voice, long form (his Inside FBL pieces of Dec 2025, described, never quoted).
const VOICE=`Ты — Майк Роффон, легендарный репортёр рубрики Inside FBL фэнтези-лиги FBL (Fantasy Brothers League) — лиги друзей. Ветеран, которого не впечатлить ни цифрами, ни позой; всегда в белых перчатках и с винтажным микрофоном.
Каждую пятницу ты выпускаешь большое интервью — лонгрид. Ты едешь в гости к герою недели: домой, в офис, на корабль, во дворец, в тренировочный зал — туда, где он живёт и работает. Смотришь, чем он занят по жизни, участвуешь в его быте и ритуалах, а между делом задаёшь вопросы. Герой может что-то подарить тебе — смешной, говорящий подарок, связанный с его историей; подарки ты бережно ставишь на свою полку (mikesShelf — что там уже стоит, можно вспомнить).
Твой стиль: хлёсткий, жёсткий, ироничный. Вопросы короткие и бьют в слабое место (место в таблице, отставание, провальная неделя, потери и промахи его игроков, «а если так и дальше?»). Цепляйся за слово из ответа и разворачивай его против собеседника. Реплика после ответа — одна сухая строка, как штамп в протоколе. Метафоры свои, свежие, из жизни. Ирония — через точное наблюдение, а не через грубость. Это вымысел, и он должен быть по-настоящему смешным: неожиданные повороты, абсурд быта, гипербола.
Герой отвечает в своей манере: GM — как менеджер, который сделал ставку и защищает её; игрок — уверенно, с баскетбольным жаргоном и вкраплением английских терминов; комиссар — властно и уклончиво. У каждого — одна цитата-афоризм собственного сочинения.
Никаких дословных фраз из прошлых выпусков Inside FBL: каждый лонгрид пишется заново.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const RULES=`Правила:
- Тема недели — story и положение героя в данных (таблица, гонки, герои и антигерои недели). Обыграй её со всех сторон.
- Вымысел — быт, визит, подарок, разговор. Факты — только из данных. Числа — только из данных, никаких других (ни счёта матчей, ни сезонных цифр, ни процентов, ни своих подсчётов, ни возрастов, ни лет, ни этажей, ни количества чего угодно). Числа словами тоже проверяются. Где можно — обходись без чисел.
- Имена игроков и команд пиши так, как в данных.
- Границы: стебём игру, решения и роль, а не человека — ничего о внешности, теле, расе, происхождении, семье, здоровье и личной жизни. Для реальных игроков НБА — только баскетбол и выдуманные хобби, никаких реальных личных подробностей. Никакого оружия, стрельбы, насилия, крови, смерти, наркотиков и секса — и в обыгрывании названий команд и имён тоже.
- Объём: пролог (2–3 абзаца), 6–8 глав, эпилог (2–3 абзаца). В каждой главе: заголовок, 2–3 абзаца того, что Майк видит и делает в гостях, и 3–5 вопросов с ответами; реплика Майка — по желанию. Всего 9000–16000 знаков.
- Заголовки глав — без номеров (их проставит вёрстка) и без чисел.
- Для каждой главы — picture: полный промпт смешной картинки этой главы ПО-АНГЛИЙСКИ (правила ниже). Картинки одного выпуска — одна серия в одном визуальном стиле, который выбираешь ты. Майка обозначай {MIKE}, героя {GUEST}.
- opener: полный промпт обложки по-английски: {MIKE} берёт интервью у {GUEST} у него в гостях, микрофон у героя; обложка выпуска Inside FBL (надпись «INSIDE FBL» — по желанию, в кавычках).
- Факты для картинок: guest.kitColors — цвета его команды (если есть).

${PROMPT_CRAFT}
- Mike Roffon is a veteran sports reporter visiting the guest: the code adds his face, his white gloves and his vintage chrome microphone; you dress him for the scene.
- A prompt is 300-1200 characters.
- gift: что герой подарил Майку (коротко, по-русски) или пустая строка.
- title — заголовок до 80 знаков; lead — одна фраза-подзаголовок; quote — цитата-афоризм героя для финала.
Ответь только JSON по схеме.`;
const str={type:'string'};
export const LONGREAD_SCHEMA={type:'object',additionalProperties:false,required:['title','lead','prologue','chapters','epilogue','quote','gift','opener'],properties:{
 title:str,lead:str,prologue:{type:'array',minItems:1,maxItems:4,items:str},
 chapters:{type:'array',minItems:5,maxItems:9,items:{type:'object',additionalProperties:false,required:['heading','story','qa','remark','picture'],properties:{
  heading:str,story:{type:'array',minItems:1,maxItems:4,items:str},qa:{type:'array',minItems:2,maxItems:6,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}}},
  remark:str,picture:str}}},
 epilogue:{type:'array',minItems:1,maxItems:4,items:str},quote:str,gift:str,opener:str}};
// notes: the owner's wishes for this issue (a redo), given to the writer as the editor's.
export function longreadMessages(facts,notes=''){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`Большое интервью недели. Данные:\n${JSON.stringify(facts,null,1)}${notes?`\n\nПожелания редакции к этому выпуску (учти их, правила выше важнее): ${notes}`:''}`};
}

// --- The checks: the shape, the numbers, the old lines and the pictures' scenes.
export const longreadWords=x=>[x.title,x.lead,...(x.prologue||[]),...(x.chapters||[]).flatMap(c=>[c.heading,...(c.story||[]),...(c.qa||[]).flatMap(q=>[q.q,q.a]),c.remark]),
 ...(x.epilogue||[]),x.quote,x.gift].filter(Boolean).join('\n');
export function validLongread(x){
 return Boolean(x&&typeof x.title==='string'&&Array.isArray(x.prologue)&&Array.isArray(x.chapters)&&x.chapters.length>=5&&
  x.chapters.every(c=>typeof c.heading==='string'&&Array.isArray(c.story)&&Array.isArray(c.qa)&&c.qa.every(q=>typeof q.q==='string'&&typeof q.a==='string')&&typeof c.picture==='string')&&
  Array.isArray(x.epilogue)&&typeof x.opener==='string');
}
// A picture's prompt as Opus wrote it: {MIKE} and {GUEST} in it, the numbers in its quotes the facts' own.
export const pictureProblems=(text,facts)=>promptProblems(text,{required:['MIKE','GUEST'],allowed:['MIKE','GUEST'],numbers:allowedNumbers(facts),max:1400});
// What is wrong with a piece for these facts ([]: it may go out).
export function longreadProblems(x,facts){
 if(!validLongread(x))return ['not a long read in the schema'];
 const out=[],text=longreadWords(x),stray=strayNumbersIn(text,allowedNumbers(facts)),copied=copiedIn(text);
 if(stray.length){const allowed=allowedNumbers(facts),where=text.split(/(?<=[.!?…])\s+|\n+/).filter(t=>strayNumbersIn(t,allowed).length).slice(0,4).map(t=>`«${t.trim().slice(0,200)}»`);
  out.push(`числа не из данных: ${stray.join(', ')} (цифрами или словами, в том числе порядковыми вроде «шестой») — вот где: ${where.join('; ')}; перепиши эти фразы без чисел`);}
 if(copied.length)out.push(`дословные фразы из прошлых выпусков: ${copied.join(' | ')} — перепиши`);
 if(text.length<6000)out.push(`слишком коротко (${text.length} знаков), нужно 9000–16000`);
 x.chapters.forEach((c,i)=>{const p=pictureProblems(c.picture,facts);if(p.length)out.push(`picture главы ${i+1}: ${p.join(', ')}`);});
 const p=pictureProblems(x.opener,facts);if(p.length)out.push(`opener: ${p.join(', ')}`);
 return out;
}
// Written, then sent back with its problems to be fixed (up to `fixes` times). {longread, problems, tries}: problems []
// when it may go out. claude: scripts/claude-text.mjs claudeJSON (a stand-in in the tests).
export async function writeLongread(facts,{claude=claudeJSON,model=LONGREAD_MODEL,timeoutMs=600e3,fixes=2,notes=''}={}){
 const base=longreadMessages(facts,notes);
 let {data}=await claude({...base,schema:LONGREAD_SCHEMA,model,timeoutMs}),problems=longreadProblems(data,facts),tries=1;
 while(problems.length&&tries<=fixes){
  console.warn(`Inside FBL: fixing (${problems.join('; ')}).`);
  ({data}=await claude({system:base.system,schema:LONGREAD_SCHEMA,model,timeoutMs,
   prompt:`${base.prompt}\n\nТвой черновик:\n${JSON.stringify(data)}\n\nИсправь только эти места, остальное оставь как есть, и верни весь JSON заново:\n${problems.map(p=>`- ${p}`).join('\n')}`}));
  problems=longreadProblems(data,facts);tries++;
 }
 return {longread:data,problems,tries};
}

// --- The pictures: Opus writes each prompt whole (the scene, the composition, the light, the style); the code gives the
// references and who is who: Mike's face, his white gloves and microphone; the guest's face from their photo (a GM's or the
// commissioner's from the league's people, a player's ESPN headshot) and what never changes about them. No names of GMs or
// teams go to the image model (a name can trip its safety system): the guest is "the guest".
export async function guestReference(guest,{root=ASSETS,fetchImpl=fetch}={}){
 if(guest.kind==='gm')return gmPhoto(guest.team,root);
 if(guest.kind==='commissioner'){const p=person('adam-silverov');return p?readImage(`${root}/${p.photo}`):null;}
 return espnHeadshot(guest.row.a,{fetchImpl});
}
function guestIdentity(guest){
 if(guest.kind==='gm'){const p=gmOf(guest.team);return {name:'the guest',identity:p?`${looks({...p,outfit:null,en:'the guest'})}; the face preserved precisely`:null};}
 if(guest.kind==='commissioner'){const p=person('adam-silverov');return {name:'the guest',identity:p?`${looks({...p,en:'the guest'})}; the face preserved precisely`:null};}
 return {name:`the guest, the NBA player ${guest.row.en}`,identity:`the real NBA player ${guest.row.en}, exactly as he really looks (face, build, hair)`,always:true};
}
// The fallback picture when a written one is refused: coffee at the guest's kitchen table.
export const SAFE_SCENE='A warm candid photo in the guest\'s kitchen: {MIKE} and {GUEST} sit at the table over coffee, both laughing at something on a tablet, the vintage microphone lying between the cups. Soft window light, 35mm lens, shallow depth of field, square frame. No text.';
// prompt: the picture's prompt as Opus wrote it (or one written by hand), with its placeholders.
export function longreadPicture(prompt,guest,{mikePhoto,guestPhoto}){
 const mike=person('mike-roffon');
 return fillPrompt(prompt,[
  {key:'MIKE',image:mikePhoto,name:'Mike Roffon',what:'Mike Roffon, the reporter (take only his face from it, not his clothes)',always:true,
   identity:`${looks({...mike,outfit:null})}; his face preserved precisely, instantly recognizable`},
  {key:'GUEST',image:guestPhoto,what:'the guest',...guestIdentity(guest)}]);
}

// --- Telegraph: the page as its nodes (telegra.ph/api#Node), the images by their URLs.
const p=(...children)=>({tag:'p',children});
const figure=(src,caption)=>({tag:'figure',children:[{tag:'img',attrs:{src}},...caption?[{tag:'figcaption',children:[caption]}]:[]]});
export function telegraphNodes(x,facts,{opener,images=[]}={}){
 const name=facts.guest.name,nodes=[];
 if(opener)nodes.push(figure(opener,`Майк Роффон в гостях: ${name}`));
 nodes.push(p({tag:'i',children:[x.lead]}));
 nodes.push({tag:'h3',children:['Пролог Майка']},...x.prologue.map(t=>p(t)));
 x.chapters.forEach((c,i)=>{
  nodes.push({tag:'h3',children:[`${i+1}. ${c.heading}`]},...c.story.map(t=>p(t)));
  for(const q of c.qa)nodes.push(p({tag:'b',children:['Майк Роффон: ']},q.q),p({tag:'b',children:[`${name}: `]},q.a));
  if(c.remark)nodes.push({tag:'blockquote',children:[c.remark]});
  if(images[i])nodes.push(figure(images[i]));
 });
 nodes.push({tag:'h3',children:['Послесловие Майка']},...x.epilogue.map(t=>p(t)));
 if(x.quote)nodes.push({tag:'blockquote',children:[`«${String(x.quote).replace(/^[«"„“]+|[»"“”]+$/g,'')}» — ${name}`]});
 if(x.gift)nodes.push(p({tag:'i',children:[`На полку Майка: ${String(x.gift).trim().replace(/[.!…\s]+$/,'')}.`]}));
 nodes.push(p('— Майк Роффон, специально для Inside FBL'),p({tag:'i',children:['Интервью вымышленное: цифры настоящие, слова — нет.']}));
 return nodes;
}
export const pageTitle=x=>`Inside FBL — ${String(x.title).replace(/^[«"„“]+|[»"“”]+$/g,'')}`.slice(0,256);
const telegraph=async(method,params,fetchImpl)=>{
 const r=await fetchImpl(`https://api.telegra.ph/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(60e3)});
 const out=await r.json().catch(()=>({}));
 if(!out.ok)throw Error(`Telegraph ${method}: ${out.error||r.status}`);
 return out.result;
};
// The page published under the league's Telegraph account (TELEGRAPH_ACCESS_TOKEN, so the pages can be edited later),
// or a fresh account of its own when there is no token. Answers the page's URL.
export async function publishPage(x,facts,{token,opener,images,fetchImpl=fetch}={}){
 const access=token||(await telegraph('createAccount',{short_name:'InsideFBL',author_name:'Майк Роффон'},fetchImpl)).access_token;
 const page=await telegraph('createPage',{access_token:access,title:pageTitle(x),author_name:'Майк Роффон · Inside FBL',
  content:telegraphNodes(x,facts,{opener,images}),return_content:false},fetchImpl);
 return page.url;
}
// The page edited in place (the same URL): its content anew, a picture changed. Needs the account that published it.
export async function editPage(url,x,facts,{token,opener,images,fetchImpl=fetch}={}){
 if(!token)throw Error('Telegraph editPage: TELEGRAPH_ACCESS_TOKEN');
 const page=await telegraph(`editPage/${new URL(url).pathname.slice(1)}`,{access_token:token,title:pageTitle(x),author_name:'Майк Роффон · Inside FBL',
  content:telegraphNodes(x,facts,{opener,images}),return_content:false},fetchImpl);
 return page.url;
}
// The post in the league chat: the opener and the link.
export function longreadCaption(x,facts,url){
 const who=facts.guest.kind==='GM'?`GM ${facts.guest.team}`:facts.guest.kind==='игрок'?(facts.guest.club?`игрок ${facts.guest.club}`:'игрок'):'комиссар лиги';
 const title=String(x.title).replace(/^[«"„“]+|[»"“”]+$/g,'').replace(new RegExp(`^${facts.guest.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*[:—–-]\\s*`),'').replace(/^\p{Ll}/u,c=>c.toUpperCase());
 return `<b>🎙 Inside FBL • Большое интервью</b>\n\n<b>${esc(title)}</b>\n<i>${esc(x.lead)}</i>\n\nВ гостях у Майка Роффона: <b>${esc(facts.guest.name)}</b>, ${esc(who)}.\n\n👉 <a href="${esc(url)}">Читать лонгрид</a>\n\n#inside_fbl #лонгрид #неделя_${facts.week.n}`.slice(0,1024);
}
// When the piece of a week goes out: that week's Friday at 18:00 Moscow.
export const postTime=weekStart=>Date.parse(`${addDays(weekStart,POST_AT.weekday-1)}T${String(POST_AT.hour-3).padStart(2,'0')}:00:00Z`);
