// Christopher Dildo, the analyst of Inside FBL (scripts/assets/people.json, christopher-dildo): the hot and cold
// performances of the league. The awards bot's engine stays one (its workflow, its state, its chain of runs); only the
// sender of his posts changes: the day's album, the day's two pictures and the week's heroes, flops and free agents go
// out by his own bot (CHRISTOPHER_DILDO_BOT_TOKEN) into the same chat, and by the awards bot when he has no token or
// Telegram refuses it, so no post is lost. To the captions of the day's and the week's albums he adds a line or two of
// his own: a young analyst in glasses with a notebook, numbers and trends, hard banter on the flops, delight in the hot.
// Claude writes it through the owner's subscription (scripts/claude-text.mjs, nothing billed per call); every number in
// it is a number of the facts (the FBL points come from core.js, scored by fblFormula), else it is written again, and the
// second time without a comment. A comment never holds a post.
import {esc} from './messages.js';
import {allowedNumbers,strayNumbersIn} from './mike-roffon.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {bricks} from './core.js';

export const DILDO_MODEL=process.env.DILDO_MODEL||CLAUDE_MODEL;
export const SIGNATURE='— Кристофер Дилдо, аналитик Inside FBL';
// Telegram keeps 1024 characters of a caption; the HTML tags count here too, so a caption that fits here fits there.
export const CAPTION_LIMIT=1024,COMMENT_LIMIT=300;

// --- The sender. Telegram's refusals of a bot in a chat: a token it does not know (401, or 404 for a malformed one),
// a bot not in the chat or kicked from it (403, 400 chat not found), a bot without the right to post (400). Nothing was
// posted then, so the awards bot posts it instead. Any other failure is the post's own and goes on as before (the
// album's text fallback, a picture that failed): a second sender would post it twice.
const REFUSED_400=/chat not found|not a member|kicked|not enough rights|have no rights|need administrator rights|chat_write_forbidden/i;
export function refused(e){
 const m=String(e?.message||'').match(/:\s(\d{3})\b\s*(.*)$/s);
 if(!m)return false;
 const status=Number(m[1]);
 return status===401||status===403||status===404||(status===400&&REFUSED_400.test(m[2]));
}
// send(token) posts with that token. dildo: his bot's token, awards: the awards bot's.
export async function asDildo(send,{dildo,awards,label='Christopher Dildo',warn=console.warn}={}){
 if(!dildo)return send(awards);
 try{return await send(dildo);}
 catch(e){
  if(!refused(e))throw e;
  warn(`${label}: Telegram refused his bot (${e.message}); the awards bot posts it.`);
  return send(awards);
 }
}

// --- The facts of his comment: the blocks of the album, as the cards show them. who: the league's (Sports.ru) name.
const box=s=>s?{pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,fgMissed:s.fga-s.fgm,ftm:s.ftm,fta:s.fta,ftMissed:s.fta-s.ftm,pf:s.pf}:null;
const fblTeam=r=>Number.isInteger(r.h?.[0])?LEAGUE_TEAMS[r.h[0]]?.name||null:null;
const player=(who,r,extra={})=>({name:who(r.a,r.n),club:r.c||null,fblTeam:fblTeam(r),fo:Math.round(r.p),...extra,game:box(r.s)});
// The day (core.js dailyBlocks), the players' form (core.js form()) and the record alerts (core.js recordNews). No date:
// a date brings the season and its numbers into the comment.
export function dayFacts(blocks,who,{form=new Map(),news=[]}={}){
 const formOf=a=>{const f=form.get(a);return f?{heroDaysLast7:f.hero,flopDaysLast7:f.flop,heroDaysInARow:f.heroRun,onFire:!!f.fire,frozen:!!f.ice}:null;};
 const rows=(list,kind)=>list.map(l=>player(who,l,{minutes:Math.round(l.m||0),form:formOf(l.a),...kind==='flop'&&l.s?{bricks:bricks(l)}:{}}));
 return {post:'итоги игрового дня',heroes:rows(blocks.heroes,'hero'),flops:rows(blocks.flops,'flop'),
  freeAgents:rows(blocks.gold,'gold').map(({fblTeam,...x})=>x),nbaAntitop:rows(blocks.antitop,'flop'),
  seasonRecords:news.slice(0,1).map(x=>({kind:x.rank===1?(x.kind==='best'?'рекорд сезона':'антирекорд сезона'):(x.kind==='best'?'топ сезона':'антитоп сезона'),
   place:x.rank,name:who(x.line.a,x.line.n),fo:Math.round(x.line.p)}))};
}
// The week (core.js weeklyBlocks): the players' sums over their games.
export function weekFacts(week,wb,who){
 const rows=list=>list.map(r=>player(who,r,{games:r.games}));
 return {post:'итоги недели',week:week.n,heroes:rows(wb.heroes),flops:rows(wb.flops),freeAgents:rows(wb.gold).map(({fblTeam,...x})=>x)};
}

const VOICE=`Ты — Кристофер Дилдо, молодой аналитик рубрики Inside FBL фэнтези-баскетбольной лиги друзей FBL (Fantasy Brothers League): прямоугольные очки, клетчатая рубашка, блокнот, где всё посчитано. Ты живёшь цифрами и трендами: кто горит, кто остыл, что торчит в статлайне.
Твой стиль: коротко и метко, как пометка на полях блокнота. Горячим — неприкрытый восторг. Провалам — жёсткий стёб: кирпичи, потери, фолы, пустые графы, лёд в венах. Стебёшь игру, а не человека: ни слова о внешности, теле, происхождении, семье, здоровье и личной жизни.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч. form: сколько раз за последние 7 игровых дней игрок был в героях (heroDaysLast7) и в провалах (flopDaysLast7), onFire — горит, frozen — заморожен; bricks — провал из-за промахов с игры.`;
const RULES=`Правила:
- Комментарий к посту лиги: 1–2 предложения, не длиннее ${COMMENT_LIMIT - 40} знаков. Без приветствия, без хэштегов, без подписи, не больше одного эмодзи.
- Только числа из данных; никаких других чисел (ни процентов, ни средних, ни сумм и разниц, ни своих подсчётов, ни дат). Числа словами тоже проверяются. Можно не называть числа вовсе.
- Имена пиши так, как в данных (name).
- Ответь строго JSON: {"comment": "..."}`;
export const COMMENT_SCHEMA={type:'object',additionalProperties:false,required:['comment'],properties:{comment:{type:'string'}}};
// fix: what was wrong with the last try, for the next one.
export function commentMessages(facts,fix=''){
 return {system:`${VOICE}\n\n${RULES}`,prompt:`Комментарий к посту «${facts.post}». Данные:\n${JSON.stringify(facts,null,1)}${fix?`\n\nПрошлый вариант отклонён: ${fix}. Напиши заново.`:''}`};
}
// What is wrong with a comment for these facts ([]: it may go out).
export function commentProblems(comment,facts){
 const text=String(comment||'').trim();
 if(!text)return ['пустой комментарий'];
 const out=[],stray=strayNumbersIn(text,allowedNumbers(facts));
 if(stray.length)out.push(`числа не из данных (${stray.join(', ')})`);
 if(text.length>COMMENT_LIMIT)out.push(`длиннее ${COMMENT_LIMIT} знаков`);
 return out;
}
// His comment, or null: written at most twice (the second time told what was wrong), never thrown, never longer than
// totalMs: the post does not wait for him.
export async function commentFor(facts,{claude=claudeJSON,model=DILDO_MODEL,timeoutMs=120e3,totalMs=200e3,tries=2,warn=console.warn}={}){
 const write=async()=>{
  let fix='';
  for(let i=0;i<tries;i++){
   const {data}=await claude({...commentMessages(facts,fix),schema:COMMENT_SCHEMA,model,timeoutMs});
   const comment=String(data?.comment||'').replace(/\s+/g,' ').trim(),problems=commentProblems(comment,facts);
   if(!problems.length)return comment;
   fix=problems.join('; ');warn(`Christopher Dildo: ${fix}${i+1<tries?', written again':', no comment'}.`);
  }
  return null;
 };
 let timer;
 try{return await Promise.race([write(),new Promise(r=>{timer=setTimeout(()=>{warn(`Christopher Dildo: no comment in ${Math.round(totalMs/1e3)} s.`);r(null);},totalMs);})]);}
 catch(e){warn(`Christopher Dildo: no comment (${e.message}).`);return null;}
 finally{clearTimeout(timer);}
}

// --- His comment and signature in an album's caption, before its hashtags (the caption's last paragraph); a comment
// that would make the caption too long for Telegram stays out, the signature stays.
const note=comment=>`${comment?`📓 <i>${esc(comment)}</i>\n`:''}${SIGNATURE}`;
export function signCaption(caption,comment=null){
 const parts=String(caption).split('\n\n'),tags=parts.length>1?parts.pop():null;
 const make=c=>[...parts,note(c),...tags!==null?[tags]:[]].join('\n\n');
 const out=make(comment);
 return out.length<=CAPTION_LIMIT||!comment?out:make(null);
}
// The same at the end of the post's text (the album's fallback).
export const signText=(text,comment=null)=>text?`${text}\n\n${note(comment)}`:text;
