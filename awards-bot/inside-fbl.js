// Inside FBL, Mike Roffon's weekly long read (league chat, 23.10.2026): every Monday at 18:00 (Moscow) a big interview
// with a guest of the week, a GM, a player or the commissioner, picked by what the week did to them: the league table,
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
import {KITS,imageName} from './images.js';
import {person,gmOf,gmPhoto,looks,readImage,espnHeadshot,references,ASSETS} from '../scripts/image-pipeline.mjs';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {esc} from './messages.js';

export const LONGREAD_MODEL=process.env.INSIDE_FBL_MODEL||CLAUDE_MODEL;
// Monday 18:00 in Moscow (UTC+3 all year): when the piece goes out.
export const POST_AT={weekday:1,hour:18};
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
 return {week:w,weekPoints,rank,order,table:table.map(round),
  heroes:blocks.heroes.map(player),flops:blocks.flops.map(player),gold:blocks.gold.map(player),
  mvp:r.mvp.slice(0,5).map(player),roy:r.roy.slice(0,3).map(player),sixth:r.sixth.slice(0,3).map(x=>({...player(x),teams:[x.team],bench:x.bench})),
  seasonRows:new Map(perPlayer(season).map(x=>[x.a,x])),weekRows:new Map(perPlayer(mine).map(x=>[x.a,x])),mine};
}

// --- The guest of the week: the stories in turn (the week's number picks where to start), the first that has a guest
// who was not on in the last REPEAT_WEEKS weeks. history: [{key}] of the past pieces, newest last.
export const STORIES=[
 {id:'gm:leader',ru:'лидер таблицы лиги: как живётся на вершине и сколько ещё продержится'},
 {id:'player:weekHero',ru:'герой недели: лучший по ФО игрок лиги за неделю'},
 {id:'gm:weekWorst',ru:'худшая неделя лиги: команда собрала меньше всех ФО за неделю'},
 {id:'player:mvp',ru:'лидер гонки MVP лиги'},
 {id:'gm:last',ru:'последнее место в таблице: дно, с которого надо выбираться'},
 {id:'player:weekFlop',ru:'антигерой недели: худший по ФО игрок лиги за неделю (антитоп)'},
 {id:'gm:weekBest',ru:'лучшая неделя лиги: команда собрала больше всех ФО за неделю'},
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
export function pickGuest(data,history=[],{force=null}={}){
 if(force){const g=forcedGuest(force,data);if(g)return g;}
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
 const facts={week:{n:w.n,label:`неделя ${w.n}, ${dayRu(w.start)} – ${dayRu(w.end)}`},
  story:guest.story.ru,table,
  weekHeroes:data.heroes.map(lineOut),weekFlops:data.flops.map(lineOut),
  races:{mvp:data.mvp.map((p,i)=>({place:i+1,...lineOut(p)})),rookies:data.roy.map((p,i)=>({place:i+1,...lineOut(p)})),sixthMan:data.sixth.map((p,i)=>({place:i+1,...lineOut(p)}))},
  mikesShelf:gifts.slice(-8),lastGuests:guests.slice(-REPEAT_WEEKS)};
 if(guest.kind==='gm'){const t=guest.team,rows=data.mine.filter(l=>l.h?.includes(t)),per=perPlayer(rows).sort((a,b)=>b.p-a.p);
  const p=gmOf(t);
  facts.guest={kind:'GM',name:LEAGUE_TEAMS[t].gm,team:LEAGUE_TEAMS[t].name,looks:p?[p.keep,p.style].filter(Boolean).join('; '):null,
   place:data.rank(t),points:data.table[t],weekPoints:data.weekPoints[t],gapToLeader:data.order[0].points-data.table[t],
   weekBest:per.slice(0,3).map(r=>({name:who(r.a,r.n),fo:round(r.p),games:r.games})),
   weekWorst:per.slice(-2).reverse().filter(r=>!per.slice(0,3).includes(r)).map(r=>({name:who(r.a,r.n),fo:round(r.p),games:r.games}))};
 }else if(guest.kind==='player'){const r=guest.row,s=data.seasonRows.get(r.a),wk=data.weekRows.get(r.a);
  const placeIn=list=>{const i=list.findIndex(x=>x.a===r.a);return i<0?null:i+1;};
  facts.guest={kind:'игрок',name:who(r.a,r.name),club:r.club,fblTeams:(r.teams||[]).map(teamOf),
   week:wk?{fo:round(wk.p),games:wk.games,pts:wk.s.pts,reb:wk.s.reb,ast:wk.s.ast,stl:wk.s.stl,blk:wk.s.blk,tov:wk.s.tov,fgm:wk.s.fgm,fga:wk.s.fga,ftm:wk.s.ftm,fta:wk.s.fta,pf:wk.s.pf}:null,
   season:s?{fo:round(s.p),games:s.games}:null,mvpPlace:placeIn(data.mvp),rookiePlace:placeIn(data.roy)};
 }else{const p=person('adam-silverov');facts.guest={kind:'комиссар лиги',name:p?.name||'Адам Сильверов',looks:p?.keep||null};}
 return facts;
}

// --- His voice, long form (his Inside FBL pieces of Dec 2025, described, never quoted).
const VOICE=`Ты — Майк Роффон, легендарный репортёр рубрики Inside FBL фэнтези-лиги FBL (Fantasy Brothers League) — лиги друзей. Ветеран, которого не впечатлить ни цифрами, ни позой; всегда в белых перчатках и с винтажным микрофоном.
Каждый понедельник ты выпускаешь большое интервью — лонгрид. Ты едешь в гости к герою недели: домой, в офис, на корабль, во дворец, в тренировочный зал — туда, где он живёт и работает. Смотришь, чем он занят по жизни, участвуешь в его быте и ритуалах, а между делом задаёшь вопросы. Герой может что-то подарить тебе — смешной, говорящий подарок, связанный с его историей; подарки ты бережно ставишь на свою полку (mikesShelf — что там уже стоит, можно вспомнить).
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
- Для каждой главы — scene: одно-два предложения ПО-АНГЛИЙСКИ для смешной фотореалистичной картинки этой главы: что Майк и герой делают вместе в этой сцене (быт, ритуал, подарок, неловкий момент), где это происходит. Без цифр, без надписей, без имён, без оружия; Майка и героя называй «Mike» и «the guest».
- opener: такое же описание обложки по-английски: Майк берёт интервью у героя у него в гостях, протягивая микрофон.
- gift: что герой подарил Майку (коротко, по-русски) или пустая строка.
- title — заголовок до 80 знаков; lead — одна фраза-подзаголовок; quote — цитата-афоризм героя для финала.
Ответь только JSON по схеме.`;
const str={type:'string'};
export const LONGREAD_SCHEMA={type:'object',additionalProperties:false,required:['title','lead','prologue','chapters','epilogue','quote','gift','opener'],properties:{
 title:str,lead:str,prologue:{type:'array',minItems:1,maxItems:4,items:str},
 chapters:{type:'array',minItems:5,maxItems:9,items:{type:'object',additionalProperties:false,required:['heading','story','qa','remark','scene'],properties:{
  heading:str,story:{type:'array',minItems:1,maxItems:4,items:str},qa:{type:'array',minItems:2,maxItems:6,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}}},
  remark:str,scene:str}}},
 epilogue:{type:'array',minItems:1,maxItems:4,items:str},quote:str,gift:str,opener:str}};
export function longreadMessages(facts){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`Большое интервью недели. Данные:\n${JSON.stringify(facts,null,1)}`};
}

// --- The checks: the shape, the numbers, the old lines and the pictures' scenes.
const FORBIDDEN=/\b(guns?|rifles?|pistols?|weapons?|bullets?|shoot\w*|shot ?gun|knife|knives|swords?|blood\w*|kill\w*|corpses?|dead|death|suicide|drugs?|cocaine|naked|sex\w*)\b/i;
export const longreadWords=x=>[x.title,x.lead,...(x.prologue||[]),...(x.chapters||[]).flatMap(c=>[c.heading,...(c.story||[]),...(c.qa||[]).flatMap(q=>[q.q,q.a]),c.remark]),
 ...(x.epilogue||[]),x.quote,x.gift].filter(Boolean).join('\n');
export function validLongread(x){
 return Boolean(x&&typeof x.title==='string'&&Array.isArray(x.prologue)&&Array.isArray(x.chapters)&&x.chapters.length>=5&&
  x.chapters.every(c=>typeof c.heading==='string'&&Array.isArray(c.story)&&Array.isArray(c.qa)&&c.qa.every(q=>typeof q.q==='string'&&typeof q.a==='string')&&typeof c.scene==='string')&&
  Array.isArray(x.epilogue)&&typeof x.opener==='string');
}
export const sceneProblem=s=>!s||!s.trim()?'empty':s.length>500?'too long':!/^[\x20-\x7e]*$/.test(s)?'not plain English':/\d/.test(s)?'has numbers':FORBIDDEN.test(s)?'forbidden words':null;
// What is wrong with a piece for these facts ([]: it may go out).
export function longreadProblems(x,facts){
 if(!validLongread(x))return ['not a long read in the schema'];
 const out=[],text=longreadWords(x),stray=strayNumbersIn(text,allowedNumbers(facts)),copied=copiedIn(text);
 if(stray.length)out.push(`числа не из данных: ${stray.join(', ')} — убери их или замени словами без чисел`);
 if(copied.length)out.push(`дословные фразы из прошлых выпусков: ${copied.join(' | ')} — перепиши`);
 if(text.length<6000)out.push(`слишком коротко (${text.length} знаков), нужно 9000–16000`);
 x.chapters.forEach((c,i)=>{const p=sceneProblem(c.scene);if(p)out.push(`scene главы ${i+1}: ${p}`);});
 const p=sceneProblem(x.opener);if(p)out.push(`opener: ${p}`);
 return out;
}
// Written, then sent back with its problems to be fixed (up to `fixes` times). {longread, problems, tries}: problems []
// when it may go out. claude: scripts/claude-text.mjs claudeJSON (a stand-in in the tests).
export async function writeLongread(facts,{claude=claudeJSON,model=LONGREAD_MODEL,timeoutMs=600e3,fixes=2}={}){
 const base=longreadMessages(facts);
 let {data}=await claude({...base,schema:LONGREAD_SCHEMA,model,timeoutMs}),problems=longreadProblems(data,facts),tries=1;
 while(problems.length&&tries<=fixes){
  console.warn(`Inside FBL: fixing (${problems.join('; ')}).`);
  ({data}=await claude({system:base.system,schema:LONGREAD_SCHEMA,model,timeoutMs,
   prompt:`${base.prompt}\n\nТвой черновик:\n${JSON.stringify(data)}\n\nИсправь только эти места, остальное оставь как есть, и верни весь JSON заново:\n${problems.map(p=>`- ${p}`).join('\n')}`}));
  problems=longreadProblems(data,facts);tries++;
 }
 return {longread:data,problems,tries};
}

// --- The pictures: Mike and the guest in the chapter's scene, funny and photorealistic, like the photos of his pieces.
// The guest's face from their photo (a GM's or the commissioner's from the league's people, a player's ESPN headshot);
// no team names or logos in a picture (the image model refuses some), a player's clothes in his FBL team's colours.
// The opener carries the INSIDE FBL banner; the chapters no text at all.
export async function guestReference(guest,{root=ASSETS,fetchImpl=fetch}={}){
 if(guest.kind==='gm')return gmPhoto(guest.team,root);
 if(guest.kind==='commissioner'){const p=person('adam-silverov');return p?readImage(`${root}/${p.photo}`):null;}
 return espnHeadshot(guest.row.a,{fetchImpl});
}
function guestLooks(guest){
 if(guest.kind==='gm'){const p=gmOf(guest.team);return p?looks({...p,outfit:null}):'the GM';}
 if(guest.kind==='commissioner'){const p=person('adam-silverov');return p?looks(p):'the commissioner';}
 const t=guest.row.teams?.[0],kit=Number.isInteger(t)?KITS[t]:null;
 return `the real NBA player ${guest.row.en}, exactly as he really looks (face, build, hair)${kit?`; when he wears team clothes they are ${kit}, no logos`:''}`;
}
export const SAFE_SCENE='Mike and the guest sit at the guest\'s kitchen table over coffee, both laughing at something on a tablet, Mike\'s vintage microphone on the table between the cups.';
export function longreadPicture(scene,guest,{mikePhoto,guestPhoto,opener=false}){
 const refs=references([{key:'mike',image:mikePhoto,what:'Mike Roffon, the reporter (take only his face from it, not his clothes)'},
  {key:'guest',image:guestPhoto,what:'the guest'}]);
 const mike=person('mike-roffon');
 return {images:refs.images,prompt:`${refs.legend}
MIKE ROFFON${refs.has.mike?` (${refs.has.mike})`:''}: ${looks({...mike,outfit:null})}. Preserve his face precisely, instantly recognizable. He is dressed for the scene, a sports reporter visiting someone (a jacket or a suit, or what the scene calls for), always his white gloves. No helmet, no military uniform, no camouflage.
THE GUEST${refs.has.guest?` (${refs.has.guest})`:''}: ${guestLooks(guest)}. Preserve the guest's face precisely.${guest.kind!=='player'?' Dressed for the scene, at home.':''}
SCENE: ${scene}${opener?' Mike holds his vintage chrome microphone up to the guest, interviewing, with a sharp, sceptical look.':''}
STYLE: a funny candid photorealistic photo, like a still from a documentary about the guest's life, natural light, 35mm lens. Square composition. ${opener?'At the bottom a TV lower-third banner reads "INSIDE FBL", spelled exactly; no other text.':'No text, captions, signs, logos or watermarks.'}`};
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
 if(x.gift)nodes.push(p({tag:'i',children:[`На полку Майка: ${x.gift}.`]}));
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
// The post in the league chat: the opener and the link.
export function longreadCaption(x,facts,url){
 const kind=facts.guest.kind==='GM'?`GM ${facts.guest.team}`:facts.guest.kind==='игрок'?facts.guest.club||'игрок':'комиссар лиги';
 return `<b>🎙 Inside FBL • Большое интервью</b>\n<b>${esc(facts.guest.name)}</b> (${esc(kind)}) — <i>${esc(String(x.title).replace(/^[«"„“]+|[»"“”]+$/g,''))}</i>\n\n${esc(x.lead)}\n\n<a href="${esc(url)}">Читать лонгрид →</a>\n\n#inside_fbl #лонгрид #неделя_${facts.week.n}`.slice(0,1024);
}
// When the piece of a week goes out: Monday 18:00 Moscow after that week's Sunday.
export const postTime=weekStart=>Date.parse(`${addDays(weekStart,7)}T${String(POST_AT.hour-3).padStart(2,'0')}:00:00Z`);
