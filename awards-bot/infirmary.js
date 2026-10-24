// Mike Roffon's daily report from the infirmary (owner, 24.10.2026): 20 minutes after his flash interview, the injured
// players of the league, only those on FBL rosters, from ESPN's injury report as it is at the moment of the post (never
// an older copy), each with its comment in Russian: the site's translation (data/translations), or one Claude writes then
// for a comment not translated yet (scripts/translate-espn.mjs: every number of the original kept). Mike's own words are
// only a short opener and afterword, written by Claude through the subscription (numbers only from the facts). The
// pictures show the patients in hospital beds with Mike at their bedside, their prompts written by Claude whole.
import {parseInjuries,seasonEnding} from '../src/season.js';
import {injuryStatus,ddmm} from '../src/format.js';
import {injuryUntil} from '../src/forecast-text.js';
import {textKey,injuryDetail,bodyPart} from '../src/translate.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {claudeJSON} from '../scripts/claude-text.mjs';
import {translateBatch} from '../scripts/translate-espn.mjs';
import {cast,mikeRef,playerRef,promptProblems,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';
import {esc,dayLabel} from './messages.js';
import {dateTag} from './cards.js';
import {MIKE_MODEL,allowedNumbers,strayNumbersIn,copiedIn,staleIn} from './mike-roffon.js';

// Twenty minutes after the flash interview; a report whose time is more than two hours past is not posted (a stale one).
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

// --- Mike's words: an opener and an afterword (the list itself is the report's).
const VOICE=`Ты — Майк Роффон, легендарный репортёр рубрики Inside FBL фэнтези-лиги FBL (Fantasy Brothers League): ветеран в белых перчатках и с винтажным микрофоном. Каждый день после флеш-интервью ты обходишь лазарет лиги — травмированных игроков из составов команд FBL — и пишешь короткий репортаж.
Твой стиль: хлёсткий, жёсткий, ироничный, коротко и плотно. Ирония — над последствиями для фэнтези-команд и их GM (дыры в составах, сгоревшие очки, замены), а не над травмой, болью и здоровьем человека: к самим травмам — с уважением.
Каждый репортаж — с чистого листа: никаких тем, образов и фраз из прошлых выпусков, интервью и лонгридов Inside FBL; не из времени года и не из календаря. Образы — только из этого лазарета и этих команд.`;
const RULES=`Правила:
- Пиши только по данным ниже. Числа — только из данных (сроки «до ~ДД.ММ» можно повторить); никаких других чисел, ни цифрами, ни словами. Можно не называть числа вовсе.
- Имена игроков, команд и GM — как в данных.
- opener — 1–2 предложения: Майк входит в лазарет и ставит общий диагноз лиге (чьи составы пострадали сильнее). afterword — одно предложение, ударная фраза.
- Список пациентов и комментарии ESPN вёрстка добавит сама: не пересказывай их.
- Ответь строго JSON: {"opener": "...", "afterword": "..."}`;
const str={type:'string'};
export const WORDS_SCHEMA={type:'object',additionalProperties:false,required:['opener','afterword'],properties:{opener:str,afterword:str}};
export const wordsMessages=facts=>({system:`${VOICE}\n\n${RULES}`,prompt:`Лазарет лиги сегодня. Данные:\n${JSON.stringify(facts,null,1)}`});
const wordsOf=x=>`${x?.opener||''} ${x?.afterword||''}`;
// What is wrong with Mike's words ([]: they may go out).
export function wordsProblems(x,facts){
 if(!x||typeof x.opener!=='string'||!x.opener.trim()||typeof x.afterword!=='string')return ['не по схеме'];
 const out=[],t=wordsOf(x),stray=strayNumbersIn(t,allowedNumbers(facts)),copied=copiedIn(t),stale=staleIn(t);
 if(stray.length)out.push(`числа не из данных (${stray.join(', ')})`);
 if(copied.length)out.push(`дословные фразы старых выпусков (${copied.join(' | ')})`);
 if(stale.length)out.push(`чужая тема — время года и урожай (${stale.join(', ')})`);
 if(t.length>600)out.push(`слишком длинно (${t.length} знаков, до 600)`);
 return out;
}
// Mike's words, written until they pass (two tries, the second told what was wrong); null: the report goes without them.
export async function writeWords(facts,{claude=claudeJSON,model=MIKE_MODEL,timeoutMs=120e3,log=console.warn}={}){
 const m=wordsMessages(facts);let fix='';
 for(let i=0;i<2;i++){
  const {data}=await claude({system:m.system,prompt:m.prompt+(fix?`\n\nПрошлый вариант отклонён: ${fix}. Напиши заново.`:''),schema:WORDS_SCHEMA,model,timeoutMs});
  const p=wordsProblems(data,facts);if(!p.length)return {opener:data.opener.trim(),afterword:data.afterword.trim()};
  fix=p.join('; ');log(`Infirmary: Mike's words refused (${fix}).`);
 }
 return null;
}

// The facts the writers see: no date (every piece from nothing, mike-roffon.js forWriter).
export const infirmaryFacts=list=>({patients:list.map(({espnId,...p})=>p),teamsHit:[...new Set(list.flatMap(p=>p.fblTeams.map(t=>t.team)))]});

// --- The report as Telegram HTML: Mike's opener, the patients team by team with ESPN's comment, his afterword.
const STATUS_MARK=p=>p.out?'🔴':'🟡';
export function infirmaryText(list,words,day){
 const head=`<b>🏥 Inside FBL • Лазарет</b> · ${esc(dayLabel(day))}`;
 if(!list.length)return [head,'','Лазарет лиги пуст: в составах FBL травмированных нет.','','— Майк Роффон, специально для Inside FBL'].join('\n');
 const groups=new Map();
 for(const p of list){const k=p.fblTeams.map(t=>t.team).join(' · ');if(!groups.has(k))groups.set(k,{teams:p.fblTeams,rows:[]});groups.get(k).rows.push(p);}
 const blocks=[...groups.values()].map(g=>{
  const title=g.teams.map(t=>`<b>${esc(t.team)}</b>${t.gm?` (GM ${esc(t.gm)})`:''}`).join(' · ');
  return [title,...g.rows.map(p=>{
   const injury=[p.where,p.what].filter(Boolean).join(', ');
   const line=`${STATUS_MARK(p)} <b>${esc(p.name)}</b>${p.club?` (${esc(p.club)})`:''} — ${esc([p.status.toLowerCase(),p.until].filter(Boolean).join(' '))}${injury?` · ${esc(injury)}`:''}`;
   const c=p.comment||p.commentEn;
   return c?`${line}\n<i>ESPN${p.reportDay?`, ${esc(p.reportDay)}`:''}: ${esc(c)}</i>`:line;})].join('\n');});
 return [head,...words?.opener?['',esc(words.opener)]:[],'',blocks.join('\n\n'),...words?.afterword?['',esc(words.afterword)]:[],'',
  '— Майк Роффон, специально для Inside FBL','',`#inside_fbl #лазарет ${dateTag(day)}`].join('\n');
}
export const infirmaryCaption=(list,day)=>`<b>🏥 Inside FBL • Лазарет</b> · ${esc(dayLabel(day))} — ${list.length} в палатах\n\n#inside_fbl #лазарет ${dateTag(day)}`;

// --- The pictures: the patients in groups of PER_PICTURE (the most serious first), at most MAX_PICTURES.
export const pictureGroups=list=>Array.from({length:Math.min(MAX_PICTURES,Math.ceil(list.length/PER_PICTURE))},(_,i)=>list.slice(i*PER_PICTURE,(i+1)*PER_PICTURE));
// faces: Map of ESPN id → headshot. A patient without a face is in the facts, not in the references.
export function wardCast(group,faces,root){
 return cast([mikeRef(root),...group.map(p=>playerRef(faces.get(p.espnId)||null,p.en,{role:'a patient of the league infirmary',injury:[p.bodyPartEn,p.injuryEn].filter(Boolean).join(', ')||null,status:p.out?'out':'questionable'}))]);
}
const PICTURE_SYSTEM=`Ты — бильд-редактор Inside FBL, рубрики фэнтези-баскетбольной лиги друзей FBL. Каждый день Майк Роффон, легендарный репортёр рубрики, обходит лазарет лиги: травмированных игроков НБА из составов команд FBL. Ты пишешь промпт картинки к его репортажу.
- Сцена — лазарет: игроки на больничных койках (или в креслах, на костылях — как подсказывают их травмы), Майк у их постелей с микрофоном. Где именно, как и в каком стиле — решаешь ты, каждый раз по-новому.
- Травмы показывай честно и бережно: повязки, лангеты, лёд на нужном месте (injury). Юмор — в ситуации и в деталях палаты, никогда не в боли и не в крови.
- Майк Роффон — ветеран-репортёр, всегда в белых перчатках и с винтажным хромированным микрофоном; одет как спортивный репортёр, никаких касок.
- Игроки — каждый со своим лицом с референса; больничная одежда, на одеяле или пледе можно цвета его фэнтези-команды (kitColors). Никаких логотипов НБА.
- Надписи — только в кавычках; числа в них — только из данных.

${CRAFT}`;
// Claude's picture of a group ({images, prompt, idea}) or null.
export async function writeWardPicture(group,c,{claude=claudeJSON,model=MIKE_MODEL,timeoutMs=180e3}={}){
 const facts={patients:group.map(p=>({name:p.en,club:p.club,fblTeams:p.fblTeams.map(t=>t.team),kitColors:LEAGUE_TEAMS.find(t=>t.name===p.fblTeams[0]?.team)?.kit||null,
  status:p.out?'out':'questionable',injury:[p.bodyPartEn,p.injuryEn].filter(Boolean).join(', ')||null,until:p.until,seasonOver:p.seasonOver}))};
 return writePicture({system:PICTURE_SYSTEM,brief:`Данные:\n${JSON.stringify(facts,null,1)}`,c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:'Infirmary'});
}
