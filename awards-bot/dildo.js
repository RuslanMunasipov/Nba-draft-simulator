// Christopher Dildo, the analyst of Inside FBL (scripts/assets/people.json, christopher-dildo): the hot and cold
// performances of the league. The awards bot's engine stays one (its workflow, its state, its chain of runs); only the
// sender of his posts changes: the day's album, the day's two pictures and the week's heroes, flops and free agents go
// out by his own bot (CHRISTOPHER_DILDO_BOT_TOKEN) into the same chat, and by the awards bot when he has no token or
// Telegram refuses it, so no post is lost. To the captions of the day's and the week's albums he adds a line or two of
// his own: a young analyst in glasses with a notebook, a narrow specialist who knows nothing but maths and numbers and
// hunts for the most striking numbers of the game, above all those of the league's teams and their GMs (owner,
// 24.10.2026), an evil nerd who laughs at everyone with maths: the flops, the GMs and their picks, the heroes too. Those numbers are the code's (teamFacts), never his own sums.
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
// His comment: 3 or 4 short notes, a line each (owner, 24.10.2026: more of them, sharper).
export const CAPTION_LIMIT=1024,COMMENT_LIMIT=600,COMMENT_LINES=4;

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
// The league's eight teams over some lines (the day's or the week's), as the league scores them: a player counts for the
// team that held him first at tip-off (as teamPoints in src/season.js), each line's FBL points by fblFormula (core.js).
// Per team: its GM, its FBL points and place among the eight, the players who played and their games, the best and the
// worst of them, the shots they missed and the balls they lost; heroes, flops: the day's blocks, counted per team.
export function teamFacts(lines,who,{heroes=null,flops=null}={}){
 const teams=LEAGUE_TEAMS.map((t,i)=>({i,team:t.name,gm:t.gm||null,fo:0,players:new Map(),games:0,missedShots:0,missedFreeThrows:0,turnovers:0}));
 for(const l of lines){
  const t=teams[l.h?.[0]];if(!t)continue;
  const x=t.players.get(l.a)||{name:who(l.a,l.n),fo:0,games:0};
  x.fo+=l.p;x.games++;t.players.set(l.a,x);
  t.fo+=l.p;t.games++;
  if(l.s){t.missedShots+=l.s.fga-l.s.fgm;t.missedFreeThrows+=l.s.fta-l.s.ftm;t.turnovers+=l.s.tov;}
 }
 const order=[...teams].sort((a,b)=>b.fo-a.fo||a.i-b.i),count=(list,i)=>list.filter(l=>l.h?.[0]===i).length;
 return order.map((t,k)=>{const ps=[...t.players.values()].sort((a,b)=>b.fo-a.fo);
  const name=x=>x?{name:x.name,fo:Math.round(x.fo),...x.games>1?{games:x.games}:{}}:null;
  return {place:k+1,team:t.team,gm:t.gm,fo:Math.round(t.fo),playersPlayed:ps.length,games:t.games,missedShots:t.missedShots,missedFreeThrows:t.missedFreeThrows,turnovers:t.turnovers,
   best:name(ps[0]),worst:ps.length>1?name(ps.at(-1)):null,...heroes?{heroesOfTheDay:count(heroes,t.i)}:{},...flops?{flopsOfTheDay:count(flops,t.i)}:{}};});
}
// A hero's part of his team's day: the per cent of its FBL points he brought (none when the team's day is not positive).
export const teamShare=(l,teams)=>{const t=teams.find(x=>x.team===fblTeam(l));return t&&t.fo>0?Math.round(100*l.p/t.fo):null;};
// The day (core.js dailyBlocks; lines: all the day's lines, for the teams), the players' form (core.js form()) and the
// record alerts (core.js recordNews). No date: a date brings the season and its numbers into the comment.
export function dayFacts(blocks,who,{form=new Map(),news=[],lines=[]}={}){
 const teams=teamFacts(lines,who,{heroes:blocks.heroes,flops:blocks.flops});
 const formOf=a=>{const f=form.get(a);return f?{heroDaysLast7:f.hero,flopDaysLast7:f.flop,heroDaysInARow:f.heroRun,onFire:!!f.fire,frozen:!!f.ice}:null;};
 const rows=(list,kind)=>list.map(l=>{const pct=kind==='hero'?teamShare(l,teams):null;
  return player(who,l,{minutes:Math.round(l.m||0),form:formOf(l.a),...pct!==null?{percentOfFblTeamDay:pct}:{},...kind==='flop'&&l.s?{bricks:bricks(l)}:{}});});
 return {post:'итоги игрового дня',fblTeams:teams,heroes:rows(blocks.heroes,'hero'),flops:rows(blocks.flops,'flop'),
  freeAgents:rows(blocks.gold,'gold').map(({fblTeam,...x})=>x),nbaAntitop:rows(blocks.antitop,'flop'),
  seasonRecords:news.slice(0,1).map(x=>({kind:x.rank===1?(x.kind==='best'?'рекорд сезона':'антирекорд сезона'):(x.kind==='best'?'топ сезона':'антитоп сезона'),
   place:x.rank,name:who(x.line.a,x.line.n),fo:Math.round(x.line.p)}))};
}
// The week (core.js weeklyBlocks; lines: the week's lines, for the teams): the players' sums over their games.
export function weekFacts(week,wb,who,{lines=[]}={}){
 const rows=list=>list.map(r=>player(who,r,{games:r.games}));
 return {post:'итоги недели',week:week.n,fblTeams:teamFacts(lines,who),heroes:rows(wb.heroes),flops:rows(wb.flops),freeAgents:rows(wb.gold).map(({fblTeam,...x})=>x)};
}

const VOICE=`Ты — Кристофер Дилдо, молодой аналитик рубрики Inside FBL фэнтези-баскетбольной лиги друзей FBL (Fantasy Brothers League): прямоугольные очки, клетчатая рубашка, блокнот, где всё посчитано.
Ты очень узкий специалист: кроме математики и цифр толком ничего не знаешь — ни кино, ни истории, ни музыки, ни житейских премудростей, и не делаешь вид, что знаешь. Всё, что тебя волнует, — аналитика. Ты постоянно в поиске по-настоящему интересных цифр из мира баскетбола, и больше всего — про наши команды FBL и их GM (fblTeams): чья команда собрала больше всех и кто её вытащил, у кого вечер держится на одном игроке, у какого GM больше всего кирпичей и потерь, у кого никто не вышел, где лидер и аутсайдер дня разошлись сильнее всего.
Ты злобный ботан, который математически смеётся над всеми: над провалами, над GM и их выбором, над командами и даже над героями. Ты уверен, что умнее всех в лиге, и доказываешь это цифрами: каждая цифра — повод для издёвки. Высокомерно, ядовито, с удовольствием; доказательство, после которого не поспоришь.
Твой стиль: выкопай в данных самые неожиданные цифры и построй на них комментарий — пометки на полях блокнота, каждая бьёт одной цифрой. Сравнения и образы — только из твоего мира: графики, таблицы, выборки, выбросы, медиана, тренды, погрешность, корреляция, формулы, теоремы, контрольная, которую все завалили. Героям — восторг аналитика, нашедшего выброс, но свысока, с подковыркой: удача, погрешность, долго ли продержится. Провалам — беспощадный стёб цифрами: кирпичи, потери, фолы, пустые графы. GM — ядовито за его команду и его выбор, а не за что-то другое. Стебёшь игру, а не человека: ни слова о внешности, теле, происхождении, семье, здоровье и личной жизни.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч. form: сколько раз за последние 7 игровых дней игрок был в героях (heroDaysLast7) и в провалах (flopDaysLast7), onFire — горит, frozen — заморожен; bricks — провал из-за промахов с игры.`;
const RULES=`Правила:
- Комментарий к посту лиги: 3–4 короткие колкие пометки, каждая с новой строки (\n), каждая — одна-две фразы о своей цифре и своём адресате (провал, GM, команда, герой). Вместе не длиннее ${COMMENT_LIMIT - 60} знаков. Без приветствия, без хэштегов, без подписи, без нумерации и маркеров списка, не больше одного эмодзи.
- Только числа из данных; никаких других чисел (ни своих процентов, средних, сумм и разниц, ни своих подсчётов, ни дат). Всё, что можно посчитать, уже посчитано в данных: суммы и места команд, доля героя в ФО его команды (percentOfFblTeamDay), промахи и потери команд. Числа словами тоже проверяются.
- Имена игроков, команд и GM пиши так, как в данных (name, team, gm).
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
// His notes as they go out: a line each, spaces tidied, list marks dropped, at most COMMENT_LINES.
export const lines=text=>String(text||'').split(/\n+/).map(l=>l.replace(/\s+/g,' ').replace(/^(?:[-–—•*]|\d+[.)])\s+/,'').trim()).filter(Boolean).slice(0,COMMENT_LINES).join('\n');
// His comment, or null: written at most twice (the second time told what was wrong), never thrown, never longer than
// totalMs: the post does not wait for him.
export async function commentFor(facts,{claude=claudeJSON,model=DILDO_MODEL,timeoutMs=120e3,totalMs=200e3,tries=2,warn=console.warn}={}){
 const write=async()=>{
  let fix='';
  for(let i=0;i<tries;i++){
   const {data}=await claude({...commentMessages(facts,fix),schema:COMMENT_SCHEMA,model,timeoutMs});
   const comment=lines(data?.comment),problems=commentProblems(comment,facts);
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
