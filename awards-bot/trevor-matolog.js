// Trevor Matolog's daily report from the infirmary (owner, 24.10.2026), by his own bot (TREVOR_MATOLOG_BOT_TOKEN): 20
// minutes after Mike Roffon's flash interview, the injured players of the league, only those on FBL rosters, from ESPN's
// injury report as it is at the moment of the post (never an older copy), each with its comment in Russian: the site's
// translation (data/translations), or one Claude writes then for a comment not translated yet (scripts/translate-espn.mjs:
// every number of the original kept). Trevor's own words are only a short opener and afterword, written by Claude through
// the subscription (numbers only from the facts). The pictures show the patients in hospital beds with Trevor on his
// rounds, their prompts written by Claude whole.
import {parseInjuries,seasonEnding} from '../src/season.js';
import {injuryStatus,ddmm} from '../src/format.js';
import {injuryUntil} from '../src/forecast-text.js';
import {textKey,injuryDetail,bodyPart} from '../src/translate.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {translateBatch} from '../scripts/translate-espn.mjs';
import {cast,trevorRef,playerRef,promptProblems,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';
import {esc,dayLabel} from './messages.js';
import {dateTag} from './cards.js';
import {allowedNumbers,strayNumbersIn,copiedIn,staleIn} from './mike-roffon.js';

export const TREVOR_MODEL=process.env.TREVOR_MODEL||CLAUDE_MODEL;

// Twenty minutes after Mike's flash interview; a report whose time is more than two hours past is not posted (a stale one).
export const INFIRMARY_DELAY_MS=20*60e3,INFIRMARY_LATE_MS=2*36e5;
// Patients per picture and pictures per day: faces stay recognizable with a few people; the rest are in the text.
export const PER_PICTURE=4,MAX_PICTURES=2;

// The patients: every player of an FBL roster in the report (rosters: the teams' players, loadLeague; report: ESPN's
// injuries feed), the most serious first within his team: out before doubtful before day-to-day, then the latest report.
// who: the league's name of a player (loadLeague who). A player held by several teams is listed once, with each team.
export function patients(report,rosters,who=(a,n)=>n){
 const inj=parseInjuries(report),byPlayer=new Map();
 rosters.forEach((roster,team)=>{for(const p of roster||[]){
  const id=p?.espnId!=null?String(p.espnId):null,i=id&&inj.get(id);if(!i)continue;
  const x=byPlayer.get(id)||{espnId:id,i,name:who(id,p.name||i.name),en:i.name,club:p.team||null,teams:[]};
  if(!x.teams.includes(team))x.teams.push(team);byPlayer.set(id,x);}});
 const level=x=>({out:0,dtd:1})[injuryStatus(x.i.status).level]??2;
 return [...byPlayer.values()].map(x=>({...x,teams:x.teams.sort((a,b)=>a-b)}))
  .sort((a,b)=>a.teams[0]-b.teams[0]||level(a)-level(b)||String(b.i.date||'').localeCompare(String(a.i.date||'')));
}
// The comments not translated yet ([{id, kind, key, headline, story}], translate-espn.mjs's shape).
export function untranslated(list,tr){
 const seen=new Set();
 return list.map(x=>x.i.comment).filter(Boolean).map(c=>({c,k:textKey(c)})).filter(({k})=>!tr?.texts?.[k]&&!seen.has(k)&&seen.add(k))
  .map(({c,k})=>({id:'t'+k,kind:'text',key:k,headline:'',story:c}));
}
// The translations of those comments: {key: text}. A batch that fails leaves its comments in English.
export async function translateNow(items,{translate=translateBatch,log=console.warn}={}){
 const out={};
 for(let i=0;i<items.length;i+=12){
  const batch=items.slice(i,i+12);
  try{const got=await translate(batch);for(const x of batch)if(got[x.id]?.story)out[x.key]=got[x.id].story;}
  catch(e){log(`Infirmary: translation failed (${e.message}); those comments go in English.`);}
 }
 return out;
}
// A patient as the report and the writers see him. ru: {key: Russian text} of the comments.
export function patientFacts(x,ru={}){
 const s=injuryStatus(x.i.status),comment=x.i.comment||'';
 return {espnId:x.espnId,name:x.name,en:x.en,club:x.club,fblTeams:x.teams.map(t=>({team:LEAGUE_TEAMS[t]?.name,gm:LEAGUE_TEAMS[t]?.gm||null})),
  status:s.label,out:s.level==='out',until:injuryUntil(x.i)||null,seasonOver:seasonEnding(x.i),
  where:bodyPart(x.i.type)||null,what:injuryDetail(x.i.detail)||null,bodyPartEn:x.i.type||null,injuryEn:x.i.detail||null,
  reportDay:x.i.date?ddmm(String(x.i.date).slice(0,10)):null,comment:comment?ru[textKey(comment)]||null:null,commentEn:comment||null};
}

// --- Trevor's words (owner, 24.10.2026): a voice like no one else's, a drunken master in the manner of Rick Sanchez, who
// may ramble any nonsense, but only around ESPN's data, never in it: his opener, one line on each patient and his afterword
// go beside the report's own lines (the status, the term, the injury, ESPN's comment), which the code lays out untouched.
const VOICE=`Ты — Тревор Матолог, главный травматолог фэнтези-лиги FBL (Fantasy Brothers League). Пьяный мастер медицины: тридцать лет при командах НБА, гений, который видел всё, каждую травму проверил на себе (отсюда шейный корсет и гипс в автографах всех, кого он отправил в лазарет) и давно не просыхает. Каждый день ты делаешь обход лазарета лиги — травмированных игроков из составов команд FBL — и комментируешь его.
Твоя подача ни на кого не похожа. Манера — как у дядюшки Рика из «Рика и Морти»: циничный безумный гений, который умнее всех и не скрывает этого; бормочет, перескакивает с мысли на мысль, обрывает сам себя, сыплет псевдонаучной чушью (выдуманные синдромы, теории заговора сухожилий, параллельные вселенные, где этот голеностоп цел), икает посреди фразы (*ик*), презирает «эти ваши фэнтези-очки», но в конце всё-таки бросает точный диагноз. Можешь нести любую чушь — всё равно никто не поймёт.
Не цитируй сериал и не упоминай Рика, Морти и их фразы: манера твоя собственная. *ик* — не больше трёх раз за весь обход. «Поверьте, я это проходил» — твоя фраза, не чаще раза за обход.
Ирония и чушь — над последствиями для фэнтези-команд и их GM (дыры в составах, сгоревшие очки, срочные замены), над медициной и над самим собой, никогда над болью и здоровьем человека.
Каждый обход — с чистого листа: никаких тем, образов и фраз из прошлых выпусков; не из времени года и не из календаря. Образы — только из этого лазарета и этих команд.`;
const RULES=`Правила:
- Данные ESPN неприкосновенны: статус, срок, часть тела, вид травмы, команды и GM — только как в данных. Не противоречь им и не добавляй фактов о травмах, которых нет в данных (операций, сроков, рецидивов, решений тренера). Чушь — только в образах, теориях и шутках, заведомо абсурдных, а не в фактах.
- Числа — только из данных (сроки «до ~ДД.ММ» можно повторить); никаких других чисел, ни цифрами, ни словами. Можно не называть числа вовсе.
- Имена игроков, команд и GM — как в данных.
- opener — 1–3 предложения: Тревор вваливается на обход и ставит общий диагноз лиге (чьи составы пострадали сильнее).
- notes — по одной реплике Тревора на каждого пациента, до 25 слов: его диагноз и бред о нём. name — ровно как name пациента в данных.
- afterword — одно предложение, ударная фраза.
- Строки пациентов и комментарии ESPN вёрстка добавит сама: не пересказывай их.
- Ответь строго JSON: {"opener": "...", "notes": [{"name": "...", "note": "..."}], "afterword": "..."}`;
const str={type:'string'};
export const WORDS_SCHEMA={type:'object',additionalProperties:false,required:['opener','notes','afterword'],properties:{opener:str,afterword:str,
 notes:{type:'array',items:{type:'object',additionalProperties:false,required:['name','note'],properties:{name:str,note:str}}}}};
export const wordsMessages=facts=>({system:`${VOICE}\n\n${RULES}`,prompt:`Лазарет лиги сегодня. Данные:\n${JSON.stringify(facts,null,1)}`});
const notesOf=x=>Array.isArray(x?.notes)?x.notes:[];
const wordsOf=x=>[x?.opener,...notesOf(x).map(n=>n?.note),x?.afterword].filter(s=>typeof s==='string').join(' ');
// What is wrong with Trevor's words ([]: they may go out).
export function wordsProblems(x,facts){
 if(!x||typeof x.opener!=='string'||!x.opener.trim()||typeof x.afterword!=='string'||!Array.isArray(x.notes))return ['не по схеме'];
 const out=[],t=wordsOf(x),stray=strayNumbersIn(t,allowedNumbers(facts)),copied=copiedIn(t),stale=staleIn(t);
 const names=new Set((facts.patients||[]).map(p=>p.name)),unknown=notesOf(x).filter(n=>!names.has(n?.name)).map(n=>n?.name);
 const long=notesOf(x).filter(n=>String(n?.note||'').length>220).map(n=>n.name),hic=(t.match(/\*ик\*/gi)||[]).length;
 if(stray.length)out.push(`числа не из данных (${stray.join(', ')})`);
 if(copied.length)out.push(`дословные фразы старых выпусков (${copied.join(' | ')})`);
 if(stale.length)out.push(`чужая тема — время года и урожай (${stale.join(', ')})`);
 if(unknown.length)out.push(`реплики о тех, кого нет в данных (${unknown.join(', ')}): name — ровно как в данных`);
 if(long.length)out.push(`слишком длинные реплики (${long.join(', ')}): до 25 слов`);
 if(hic>3)out.push(`*ик* ${hic} раз, не больше трёх`);
 if(x.opener.length+x.afterword.length>700)out.push(`вступление и концовка слишком длинные (${x.opener.length+x.afterword.length} знаков, до 700)`);
 return out;
}
// Trevor's words, written until they pass (two tries, the second told what was wrong); null: the report goes without them.
// {opener, notes: {patient's name: his line}, afterword}.
export async function writeWords(facts,{claude=claudeJSON,model=TREVOR_MODEL,timeoutMs=180e3,log=console.warn}={}){
 const m=wordsMessages(facts);let fix='';
 for(let i=0;i<2;i++){
  const {data}=await claude({system:m.system,prompt:m.prompt+(fix?`\n\nПрошлый вариант отклонён: ${fix}. Напиши заново.`:''),schema:WORDS_SCHEMA,model,timeoutMs});
  const p=wordsProblems(data,facts);
  if(!p.length)return {opener:data.opener.trim(),afterword:data.afterword.trim(),notes:Object.fromEntries(data.notes.filter(n=>n.note.trim()).map(n=>[n.name,n.note.trim()]))};
  fix=p.join('; ');log(`Infirmary: Trevor's words refused (${fix}).`);
 }
 return null;
}

// The facts the writers see: no date (every piece from nothing, mike-roffon.js forWriter).
export const infirmaryFacts=list=>({patients:list.map(({espnId,...p})=>p),teamsHit:[...new Set(list.flatMap(p=>p.fblTeams.map(t=>t.team)))]});

// --- The report as Telegram HTML: Trevor's opener, the patients team by team (ESPN's lines as they are, then his own
// line on each), his afterword.
const HEAD='<b>🏥 Лазарет FBL</b>',SIGNATURE='— Тревор Матолог, травматолог лиги FBL',TAGS=day=>`#лазарет #травмы ${dateTag(day)}`;
const STATUS_MARK=p=>p.out?'🔴':'🟡';
export function infirmaryText(list,words,day){
 const head=`${HEAD} · ${esc(dayLabel(day))}`;
 if(!list.length)return [head,'','Палаты пусты: в составах FBL травмированных нет.','',SIGNATURE,'',TAGS(day)].join('\n');
 const groups=new Map();
 for(const p of list){const k=p.fblTeams.map(t=>t.team).join(' · ');if(!groups.has(k))groups.set(k,{teams:p.fblTeams,rows:[]});groups.get(k).rows.push(p);}
 const blocks=[...groups.values()].map(g=>{
  const title=g.teams.map(t=>`<b>${esc(t.team)}</b>${t.gm?` (GM ${esc(t.gm)})`:''}`).join(' · ');
  return [title,...g.rows.map(p=>{
   const injury=[p.where,p.what].filter(Boolean).join(', ');
   const line=`${STATUS_MARK(p)} <b>${esc(p.name)}</b>${p.club?` (${esc(p.club)})`:''} — ${esc([p.status.toLowerCase(),p.until].filter(Boolean).join(' '))}${injury?` · ${esc(injury)}`:''}`;
   const c=p.comment||p.commentEn,note=words?.notes?.[p.name];
   return [line,...c?[`<i>ESPN${p.reportDay?`, ${esc(p.reportDay)}`:''}: ${esc(c)}</i>`]:[],...note?[`🥃 ${esc(note)}`]:[]].join('\n');})].join('\n');});
 return [head,...words?.opener?['',esc(words.opener)]:[],'',blocks.join('\n\n'),...words?.afterword?['',esc(words.afterword)]:[],'',
  SIGNATURE,'',TAGS(day)].join('\n');
}
export const infirmaryCaption=(list,day)=>`${HEAD} · ${esc(dayLabel(day))} — ${list.length} в палатах\n\n${TAGS(day)}`;

// --- The pictures: the patients in groups of PER_PICTURE (the most serious first), at most MAX_PICTURES.
export const pictureGroups=list=>Array.from({length:Math.min(MAX_PICTURES,Math.ceil(list.length/PER_PICTURE))},(_,i)=>list.slice(i*PER_PICTURE,(i+1)*PER_PICTURE));
// faces: Map of ESPN id → headshot. A patient without a face is in the facts, not in the references.
export function wardCast(group,faces,root){
 return cast([trevorRef(root),...group.map(p=>playerRef(faces.get(p.espnId)||null,p.en,{role:'a patient of the league infirmary',injury:[p.bodyPartEn,p.injuryEn].filter(Boolean).join(', ')||null,status:p.out?'out':'questionable'}))]);
}
const PICTURE_SYSTEM=`Ты — бильд-редактор фэнтези-баскетбольной лиги друзей FBL. Каждый день Тревор Матолог, главный травматолог лиги, делает обход лазарета: травмированных игроков НБА из составов команд FBL. Ты пишешь промпт картинки к его сводке.
- Сцена — лазарет: игроки на больничных койках (или в креслах, на костылях — как подсказывают их травмы), Тревор на обходе у их постелей. Где именно, как и в каком стиле — решаешь ты, каждый раз по-новому.
- Травмы показывай честно и бережно: повязки, лангеты, лёд на нужном месте (injury). Юмор — в ситуации и в деталях палаты, никогда не в боли и не в крови.
- Тревор Матолог — пьяный мастер медицины, безумный циничный гений, сам весь в травмах: всегда шейный корсет и гипс на правой руке в автографах игроков (он проверяет каждую травму на себе). Его обычный вид — белый халат, стетоскоп, планшет, фляжка в кармане; остальное подбери под сцену. Никаких отсылок к чужим мультсериалам и их персонажам.
- Игроки — каждый со своим лицом с референса; больничная одежда, на одеяле или пледе можно цвета его фэнтези-команды (kitColors). Никаких логотипов НБА.
- Надписи — только в кавычках; числа в них — только из данных.

${CRAFT}`;
// Claude's picture of a group ({images, prompt, idea}) or null.
export async function writeWardPicture(group,c,{claude=claudeJSON,model=TREVOR_MODEL,timeoutMs=180e3}={}){
 const facts={patients:group.map(p=>({name:p.en,club:p.club,fblTeams:p.fblTeams.map(t=>t.team),kitColors:LEAGUE_TEAMS.find(t=>t.name===p.fblTeams[0]?.team)?.kit||null,
  status:p.out?'out':'questionable',injury:[p.bodyPartEn,p.injuryEn].filter(Boolean).join(', ')||null,until:p.until,seasonOver:p.seasonOver}))};
 return writePicture({system:PICTURE_SYSTEM,brief:`Данные:\n${JSON.stringify(facts,null,1)}`,c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:'Infirmary'});
}
