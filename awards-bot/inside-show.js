// Inside FBL, the league's main journal (owner, 24.10.2026): every Monday evening the whole cast of Inside FBL goes on air
// in the league chat, a round table in the manner of a Shaqtin' a Fool studio, each with a block of their own about the
// week that ended on Sunday (a medium read: neither a flash nor a long read). The bots run the show one after another,
// each from its own bot, each block a reply to the one before it, so the chat reads as one broadcast:
//   1. Steven Ex Pert, the host and the league's chief expert, opens: the week's headline, last week's vote, the rundown;
//   2. Christopher Dildo, the genius of analytics: the week's table, the teams' numbers, the deals in numbers, a quiz;
//   3. Trevor Matolog, the league's medic: the week's round of the infirmary;
//   4. Zak Onn, the letter of the league's law: the case file of the week and the teams' standing for the new week
//      (the transfers back to three, the white rule, the rookie rule);
//   5. Mike Roffon: what changed since his Friday long read, and two flash interviews, the best and the worst player of
//      the week; the league votes whom he visits next Friday;
//   6. Steven again: the week's prizes of shame, the league's vote for the prize, and the farewell.
// Every text is written by Claude through the owner's subscription (scripts/claude-text.mjs), every number of it is a
// number of the facts (FBL points: the archive's lines, core.js with fblFormula; the table: season.js teamPoints, the
// same formula); a block that brings its own is sent back to be fixed, then left out. Every picture's prompt is written
// whole by Claude (scripts/picture-prompt.mjs writePicture); the code gives the references and the cards it draws
// itself (show-cards.js). The polls are the code's: their options and the quiz's answer come from the facts.
import {LEAGUE_TEAMS} from '../src/teams.js';
import {fblTransfers,fblWeek,verdict,transferTime,timeLabel,TRANSFER_HOURS,WATCHLIST,FBL_TRANSFERS,isFreeTransfer} from '../src/rules.js';
import {perPlayer,addDays,SEASON_START} from './core.js';
import {weekData,STORIES,storyGuest,REPEAT_WEEKS} from './inside-fbl.js';
import {teamFacts} from './dildo.js';
import {allowedNumbers,strayNumbersIn,copiedIn,staleIn} from './mike-roffon.js';
import {stevenRef} from './steven.js';
import {esc,dayLabel} from './messages.js';
import {imageName} from './images.js';
import {cast,about,mikeRef,zakRef,trevorRef,dildoRef,gmRef,logoRef,commissionerRef,playerRef,promptProblems,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';
import {readImage,gmOf,ASSETS} from '../scripts/image-pipeline.mjs';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {fileURLToPath} from 'node:url';

export const SHOW_MODEL=process.env.INSIDE_SHOW_MODEL||CLAUDE_MODEL;
// Monday 19:00 in Moscow (UTC+3 all year), the evening after the week's Sunday: when the show goes on air.
export const AIR_AT={weekday:1,hour:19};
export const airTime=week=>Date.parse(`${addDays(week.end,1)}T${String(AIR_AT.hour-3).padStart(2,'0')}:00:00Z`);
// A show still goes on air until the end of its Monday (an approval after 19:00 airs it at once).
export const airEnd=week=>Date.parse(`${addDays(week.end,1)}T20:59:00Z`);
const round=x=>Math.round(Number(x)||0);
const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayRu=d=>`${Number(d.slice(8))} ${MONTHS[Number(d.slice(5,7))-1]}`;
const team=t=>LEAGUE_TEAMS[t]?{team:LEAGUE_TEAMS[t].name,gm:LEAGUE_TEAMS[t].gm||null}:null;

// --- The cast: who they are on air, their bot (an env name) and how they sign.
export const HOSTS={
 steven:{name:'Стивен Экс Перт',first:'Стивен',emoji:'🎙',role:'ведущий и главный эксперт Inside FBL',bot:'STEVEN_EX_PERT_BOT_TOKEN',sign:'— Стивен Экс Перт, ведущий Inside FBL'},
 dildo:{name:'Кристофер Дилдо',first:'Кристофер',emoji:'📓',role:'гений аналитики и математики',bot:'CHRISTOPHER_DILDO_BOT_TOKEN',sign:'— Кристофер Дилдо, аналитик Inside FBL'},
 trevor:{name:'Тревор Матолог',first:'Тревор',emoji:'🩺',role:'главный медицинский специалист лиги',bot:'TREVOR_MATOLOG_BOT_TOKEN',sign:'— Тревор Матолог, травматолог лиги FBL'},
 zak:{name:'Зак Онн',first:'Зак',emoji:'⚖️',role:'главная буква закона лиги',bot:'LEAGUE_TELEGRAM_BOT_TOKEN',sign:'— Зак Онн. Закон и порядок. Именно в таком порядке.'},
 mike:{name:'Майк Роффон',first:'Майк',emoji:'🎤',role:'репортёр Inside FBL',bot:'MIKE_ROFFON_BOT_TOKEN',sign:'— Майк Роффон, специально для Inside FBL'},
};
// The run of the show: its blocks in their order on air, the host of each, its rubric and its hashtag.
export const RUNDOWN=[
 {key:'opening',host:'steven',rubric:'Открытие выпуска',tag:'открытие'},
 {key:'numbers',host:'dildo',rubric:'Цифры недели',tag:'цифры_недели'},
 {key:'infirmary',host:'trevor',rubric:'Обход недели',tag:'лазарет'},
 {key:'law',host:'zak',rubric:'Закон и порядок',tag:'закон_и_порядок'},
 {key:'mike',host:'mike',rubric:'После лонгрида: флеш-интервью недели',tag:'флеш_интервью'},
 {key:'shame',host:'steven',rubric:'Позор недели',tag:'позор_недели'},
];
const nextOf=key=>{const i=RUNDOWN.findIndex(s=>s.key===key);return RUNDOWN[i+1]||null;};

// --- The week's numbers. lines: the awards bot's archive; week: core.js weekOf; table: season.js teamPoints (index 0-7);
// who(a,n): the league's name of a player; rostered, rookies, mef: as core.js races takes them; transfers: season.js
// allTransfers; espnOf(id), nameOf(id): a database player's ESPN id and the league's name of him.
export function showData(lines,week,{table,who,rostered=new Map(),rookies=new Set(),mef=new Map(),transfers=[],espnOf=()=>null,nameOf=id=>String(id)}){
 const data=weekData(lines,week.end,{table,who,rostered,rookies,mef});
 // A player counts for the team that held him first at tip-off (FIRST_HOLDER_ONLY, as the table: teamPoints).
 const weekFo=LEAGUE_TEAMS.map((_,t)=>round(data.mine.filter(l=>l.h?.[0]===t).reduce((s,l)=>s+l.p,0)));
 const rankBy=points=>t=>1+points.filter(p=>p>points[t]).length;
 // The places before the week: the table without the week's points; none in the season's first week (nothing before it).
 const now=data.table,before=now.map((p,t)=>p-weekFo[t]),placeNow=rankBy(now),placeBefore=week.start<=SEASON_START?()=>null:rankBy(before);
 const standings=LEAGUE_TEAMS.map((_,t)=>({t,...team(t),place:placeNow(t),placeBefore:placeBefore(t),points:now[t],weekFo:weekFo[t]}))
  .sort((a,b)=>a.place-b.place||a.t-b.t);
 const deals=dealsOf(transfers,week,lines,{espnOf,nameOf,who});
 return {...data,week,weekFo,standings,teams:teamFacts(data.mine,who),deals,who};
}
// The league's transfer week that ends with this week (Moscow dates): its counted deals (the pre-season's free ones
// are not the week's), in their order.
export const weekDeals=(transfers,week)=>{const fw=fblWeek(week.end);return transfers.filter(x=>x.date>=fw.start&&x.date<=fw.end&&Number.isInteger(x.team)&&!isFreeTransfer(x));};
// The deals of the week that stood (the player bought was not sold again by the same team that week): what each brought
// since, in FBL points of the archive's lines (from the deal's US day on, to the week's Sunday): the player bought and
// the one sold.
export function dealsOf(transfers,week,lines,{espnOf=()=>null,nameOf=id=>String(id),who=(a,n)=>n}={}){
 const since=(id,from)=>{const a=espnOf(id),mine=a?lines.filter(l=>l.a===a&&l.d>=from&&l.d<=week.end):[];
  return {name:a?who(a,nameOf(id)):nameOf(id),fo:round(mine.reduce((s,l)=>s+l.p,0)),games:mine.length};};
 const deals=weekDeals(transfers,week);
 // A deal undone (its player sold again, or the swap made back the other way) is no deal of the week.
 const undone=(x,i)=>deals.some((y,j)=>y.team===x.team&&(j>i&&y.outId===x.inId||j!==i&&y.outId===x.inId&&y.inId===x.outId));
 return deals.filter((x,i)=>!undone(x,i)).map(x=>{
  const bought=since(x.inId,x.date),sold=since(x.outId,x.date);
  return {t:x.team,...team(x.team),day:dayRu(x.date),bought,sold,difference:bought.fo-sold.fo};
 });
}
const weekLabel=d=>`неделя ${d.week.n}, игры ${dayRu(d.week.start)} – ${dayRu(d.lastDay)}`;
const box=s=>({pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,fgMissed:s.fga-s.fgm,ftm:s.ftm,fta:s.fta,ftMissed:s.fta-s.ftm,pf:s.pf});
// A player's week (core.js perPlayer row) as the writers see it.
const weekLine=(d,r)=>r&&{name:d.who(r.a,r.n),club:r.c||null,fblTeams:(r.h||[]).map(team).filter(Boolean),games:r.games,minutes:round(r.m),fo:round(r.p),...box(r.s)};
const tableOut=d=>d.standings.map(({t,placeBefore,...x})=>placeBefore?{...x,placeBefore,moved:placeBefore-x.place}:x);

// --- The opening (Steven): the headline of the week, last week's vote and the rundown.
export function openingFacts(d,{lastShame=null}={}){
 const climbs=tableOut(d).filter(x=>x.moved).sort((a,b)=>b.moved-a.moved);
 return {week:weekLabel(d),table:tableOut(d),
  bestWeek:d.teams[0]&&{team:d.teams[0].team,gm:d.teams[0].gm,fo:d.teams[0].fo},worstWeek:d.teams.at(-1)&&{team:d.teams.at(-1).team,gm:d.teams.at(-1).gm,fo:d.teams.at(-1).fo},
  flewUp:climbs[0]?.moved>0?climbs[0]:null,fellDown:climbs.at(-1)?.moved<0?climbs.at(-1):null,
  heroOfTheWeek:weekLine(d,d.weekRows.get(d.heroes[0]?.a)),flopOfTheWeek:weekLine(d,d.weekRows.get(d.flops[0]?.a)),
  mvpLeader:d.mvp[0]&&{name:d.mvp[0].name,fo:d.mvp[0].fo},rookieLeader:d.roy[0]&&{name:d.roy[0].name,fo:d.roy[0].fo},
  lastWeekShame:lastShame,
  rundown:RUNDOWN.slice(1).map(s=>({host:HOSTS[s.host].name,rubric:s.rubric}))};
}

// --- Christopher Dildo: the table of the week, the eight teams' numbers, the deals in numbers and his quiz.
// The quiz is the code's: a question the facts answer, four options of the facts, the answer known (Telegram checks it).
const shuffle=(list,seed)=>{const out=[...list];let h=seed*2654435761>>>0;for(let i=out.length-1;i>0;i--){h=(h*1103515245+12345)>>>0;const j=h%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;};
const teamOption=x=>`${x.team} (${x.gm})`.slice(0,100);
export function quizOf(d){
 const rostered=d.mine.filter(l=>l.h?.length),rows=perPlayer(rostered);
 const unique=(list,val)=>list.length>=4&&val(list[0])!==val(list[1]);
 const byTeams=(list,val,question,answer)=>unique(list,val)&&{question,options:[list[0],...[list[1],list[3],list.at(-1)].filter((x,i,a)=>x!==list[0]&&a.indexOf(x)===i)].slice(0,4).map(teamOption),answer:`${answer}: ${list[0].team}, ${val(list[0])}`};
 const byPlayers=(list,val,question,answer,name=r=>d.who(r.a,r.n))=>unique(list,val)&&{question,options:[list[0],list[1],list[2],list[3]].map(r=>name(r).slice(0,100)),answer:`${answer}: ${name(list[0])}, ${val(list[0])}`};
 const teams=d.teams,desc=(list,val)=>[...list].sort((a,b)=>val(b)-val(a));
 // A player's best game only: the options are four players, never one twice.
 const bestGames=desc(rostered,l=>l.p).filter((l,i,all)=>all.findIndex(x=>x.a===l.a)===i);
 const kinds=[
  ()=>byTeams(teams,x=>x.fo,'Чья команда собрала больше всех ФО за неделю?','больше всех ФО за неделю'),
  ()=>byTeams(desc(teams,x=>x.missedShots),x=>x.missedShots,'У какой команды больше всего промахов с игры за неделю?','больше всего промахов с игры'),
  ()=>byPlayers(desc(rows,r=>r.s.tov),r=>r.s.tov,'Кто из игроков наших составов потерял за неделю больше всех мячей?','больше всех потерь'),
  ()=>byPlayers(bestGames,l=>round(l.p),'Чей матч недели был лучшим по ФО в наших составах?','лучший матч недели по ФО'),
  ()=>byTeams(desc(teams,x=>x.turnovers),x=>x.turnovers,'Какая команда потеряла за неделю больше всех мячей?','больше всего потерь'),
 ];
 for(let i=0;i<kinds.length;i++){const q=kinds[(d.week.n-1+i)%kinds.length]();
  if(q){const options=shuffle(q.options,d.week.n),correct=options.indexOf(q.options[0]);return {question:q.question,options,correct,answer:q.answer};}}
 return null;
}
export function numbersFacts(d,quiz=quizOf(d)){
 return {week:weekLabel(d),...d.week.start<=SEASON_START?{firstWeek:'первая неделя сезона: мест до неё нет'}:{},table:tableOut(d),fblTeams:d.teams,
  deals:d.deals.map(({t,...x})=>x),bestDeal:[...d.deals].sort((a,b)=>b.difference-a.difference)[0]?.bought.name||null,
  quiz:quiz&&{question:quiz.question,options:quiz.options,answer:quiz.answer}};
}

// --- Trevor Matolog: the infirmary as ESPN reports it now (trevor-matolog.js patientFacts), with the games each patient
// missed last week: his NBA club's games of the week (the archive) and his own.
export function infirmaryFacts(d,patients,{max=14}={}){
 const list=patients.slice(0,max).map(({espnId,en,bodyPartEn,injuryEn,commentEn,...p})=>{
  const mine=d.mine.filter(l=>l.a===String(espnId)),last=d.seasonRows.get(String(espnId));
  const club=last?.c||p.club,clubGames=club?new Set(d.mine.filter(l=>l.c===club).map(l=>l.e)).size:0;
  return {...p,...clubGames?{clubGamesLastWeek:clubGames,playedLastWeek:mine.length}:{}};
 });
 const hit=new Map();for(const p of list)for(const t of p.fblTeams)hit.set(t.team,(hit.get(t.team)||0)+1);
 return {week:weekLabel(d),patients:list,teamsHit:[...hit].sort((a,b)=>b[1]-a[1]).map(([team,patients])=>({team,patients})),empty:!list.length};
}

// --- Zak Onn: the case file of the week (the rules check of every roster, src/rules.js) and each team's standing for the
// new week. checks: checkRules on the rosters now; today: the Moscow date of the show; announcements: the league's
// statements of the week [{day, title}]. No FBL points: the law is his business, the game is not.
const RULE_RU={rookie:'правило новичка',white:'белое правило',club:'не больше двух игроков одного клуба НБА',
 transfers:`лимит трансферов: ${FBL_TRANSFERS.perWeek} в неделю`,time:`часы сделок: с ${TRANSFER_HOURS.from} до ${TRANSFER_HOURS.to} по Москве`,duplicate:'один игрок — одна команда лиги'};
const WHITE_RU={ok:'соблюдено',none:'нарушено',sold:'под вопросом: засчитанный игрок продан',unmarked:'решения лиги ещё нет'};
export function lawFacts(d,checks,{transfers=[],today,announcements=[],nameOf=id=>String(id),watchlist=WATCHLIST}={}){
 const fw=fblWeek(d.week.end),watched=new Set(watchlist.map(w=>w.team));
 const teams=checks.map(c=>{
  const v=verdict(c),t=c.team,last=fblTransfers(transfers,t,fw.end),next=fblTransfers(transfers,t,today);
  const detail=x=>x.rule==='club'?`${x.club}: ${x.players.join(', ')}`:x.rule==='time'?(()=>{const deal=transfers.find(y=>`${y.outId}>${y.inId}:${y.date}`===x.transfer);
   return deal?`${nameOf(deal.outId)} → ${nameOf(deal.inId)}, ${timeLabel(transferTime(deal))} МСК`:null;})():x.rule==='duplicate'?x.text.split(' уже ')[0].split(' есть ')[0]:null;
  return {...team(t),watched:watched.has(t),
   verdict:v.kind==='violation'?'нарушение':v.kind==='check'?'под проверкой':'чисто',
   charges:[...v.breaches.map(x=>({rule:RULE_RU[x.rule]||x.rule,sure:true,...detail(x)?{detail:detail(x)}:{}})),...v.doubts.map(x=>({rule:RULE_RU[x.rule]||x.rule,sure:false,...detail(x)?{detail:detail(x)}:{}}))],
   lastWeek:{transfers:last.used,limit:last.limit,deals:weekDeals(transfers,d.week).filter(x=>x.team===t).map(x=>`${nameOf(x.outId)} → ${nameOf(x.inId)}`)},
   newWeek:{transfersLeft:next.left,transfersUsed:next.used,limit:next.limit},
   whiteRule:WHITE_RU[c.whiteState]||c.whiteState,whitePlayers:c.whites.map(p=>nameOf(p.id)),
   rookieRule:c.rookies.length?'соблюдено':'нарушено',rookies:c.rookies.map(p=>nameOf(p.id))};
 });
 return {week:`неделя ${d.week.n}`,newWeek:{opens:dayRu(fblWeek(today).start),closes:dayRu(fblWeek(today).end),limit:FBL_TRANSFERS.perWeek,hours:`${TRANSFER_HOURS.from}–${TRANSFER_HOURS.to} МСК`},
  teams,watchlist:watchlist.map(w=>({...team(w.team),since:dayRu(w.since)})),statementsOfTheWeek:announcements};
}
// The league's statements of the week: data/announcements/<date>-<name>.html of the transfer week up to the show's day,
// each by its first line. files: [{name, text}].
export function weekStatements(files,week,today){
 const fw=fblWeek(week.end);
 return files.filter(f=>/^\d{4}-\d{2}-\d{2}-.*\.html$/.test(f.name)&&f.name.slice(0,10)>=fw.start&&f.name.slice(0,10)<=today)
  .map(f=>({day:dayRu(f.name.slice(0,10)),title:String(f.text).split('\n').find(l=>l.trim())?.replace(/<[^>]+>/g,'').replace(/\{@[^}]*\}/g,'').trim().slice(0,160)||f.name}))
  .sort((a,b)=>a.day.localeCompare(b.day));
}

// --- Mike Roffon: what changed since Friday's long read (inside-fbl.js: its facts, as the page went out), the best and
// the worst players of the week for his two flash interviews, and the guests the league may send him to next Friday.
// longread: {entry (the long reads' state of the week), facts (its facts)} or null.
export function mikeFacts(d,{longread=null,candidates=[]}={}){
 let after=null;
 if(longread?.facts&&longread.entry?.status==='sent'){
  const f=longread.facts,g=f.guest,key=longread.entry.guest?.key||'',now=Object.fromEntries(d.standings.map(x=>[x.team,x]));
  const friday=g.kind==='GM'?{place:g.place,points:g.points,gapToLeader:g.gapToLeader}:g.kind==='игрок'?{weekFo:g.week?.fo??null,games:g.week?.games??null}:null;
  const t=LEAGUE_TEAMS.findIndex(x=>x.name===g.team),row=key.startsWith('player:')?d.weekRows.get(key.slice(7)):null;
  const today=g.kind==='GM'&&t>=0?{place:now[g.team]?.place,points:now[g.team]?.points,gapToLeader:d.standings[0].points-now[g.team]?.points}
   :row?{weekFo:round(row.p),games:row.games}:null;
  after={title:longread.entry.title,guest:{name:g.name,kind:g.kind,...g.team?{team:g.team}:{}},onFriday:friday,afterSunday:today,
   table:(f.table||[]).map(x=>({team:x.team,placeOnFriday:x.place,pointsOnFriday:x.points,placeNow:now[x.team]?.place,pointsNow:now[x.team]?.points}))};
 }
 // The worst only when he is not the best too (a week of few games).
 const best=d.heroes[0]?.a,worst=d.flops[0]?.a!==best?d.flops[0]?.a:null;
 return {week:weekLabel(d),afterLongread:after,
  bestOfTheWeek:weekLine(d,d.weekRows.get(best)),worstOfTheWeek:worst?weekLine(d,d.weekRows.get(worst)):null,
  nextFridayVote:candidates.map(c=>c.label)};
}
// Who the league may send Mike to on Friday: the long read's stories (inside-fbl.js) on this week's numbers, a guest of
// none of the last REPEAT_WEEKS pieces, at most four. {key (inside-fbl.js guest key), force (its --guest), label}.
const STORY_SHORT={'gm:leader':'лидер таблицы','player:weekHero':'герой недели','gm:weekWorst':'худшая неделя','player:mvp':'лидер гонки MVP',
 'gm:last':'последнее место','player:weekFlop':'антигерой недели','gm:weekBest':'лучшая неделя','player:roy':'лидер гонки новичков','commissioner':'комиссар лиги'};
export function guestCandidates(d,recent=[],{max=4}={}){
 const seen=new Set(recent.slice(-REPEAT_WEEKS)),out=[];
 for(const s of STORIES){const g=storyGuest(s.id,d);if(!g||seen.has(g.key))continue;seen.add(g.key);
  const who=g.kind==='gm'?`${LEAGUE_TEAMS[g.team].gm} (${LEAGUE_TEAMS[g.team].name})`:g.kind==='player'?d.who(g.row.a,g.row.n||g.row.name):'Адам Сильверов';
  out.push({key:g.key,force:g.kind==='gm'?`gm:${g.team+1}`:g.key,label:`${who} — ${STORY_SHORT[s.id]}`.slice(0,100)});
  if(out.length>=max)break;}
 return out.length>=2?out:[];
}

// --- Steven's prizes of shame: the week's worst moments of the players on the league's rosters, by the code (one each,
// a player once): the worst game, the most bricks, the most turnovers, the worst deal of a GM, the most fouls, the most
// missed free throws, the week's flop.
export function shameNominees(d,{max=4}={}){
 const lines=d.mine.filter(l=>l.h?.length&&l.s),out=[],used=new Set();
 const pick=(list,score,min,kind,stat)=>{const l=[...list].filter(x=>score(x)>=min&&!used.has(x.a)).sort((a,b)=>score(b)-score(a)||a.t.localeCompare(b.t))[0];
  if(!l)return;used.add(l.a);out.push({kind,a:l.a,en:imageName(l),name:d.who(l.a,l.n),club:l.c,...team(l.h[0]),t:l.h[0],day:dayRu(l.d),stat:stat(l),fo:round(l.p),game:box(l.s)});};
 pick(lines.filter(l=>l.m>=15),l=>-l.p,-Infinity,'худший матч недели',l=>`${round(l.p)} ФО за матч`);
 pick(lines,l=>l.s.fga-l.s.fgm,8,'кирпичи',l=>`${l.s.fga-l.s.fgm} промахов с игры`);
 pick(lines,l=>l.s.tov,5,'потери',l=>`${l.s.tov} потерь`);
 const deal=[...d.deals].filter(x=>x.difference<0).sort((a,b)=>a.difference-b.difference)[0];
 if(deal)out.push({kind:'сделка недели наоборот',gmNominee:true,name:deal.gm,team:deal.team,gm:deal.gm,t:deal.t,stat:`продал ${deal.sold.name}, купил ${deal.bought.name}`,
  sold:deal.sold,bought:deal.bought,difference:deal.difference});
 pick(lines,l=>l.s.pf,5,'фолы',l=>`${l.s.pf} фолов`);
 pick(lines,l=>l.s.fta-l.s.ftm,4,'штрафные',l=>`${l.s.fta-l.s.ftm} промахов со штрафной`);
 const flop=d.flops[0]&&!used.has(d.flops[0].a)?d.weekRows.get(d.flops[0].a):null;
 if(flop)out.push({kind:'антигерой недели',a:flop.a,en:imageName(flop),name:d.who(flop.a,flop.n),club:flop.c,...team(flop.h?.[0]),t:flop.h?.[0],stat:`${round(flop.p)} ФО за неделю`,fo:round(flop.p),games:flop.games});
 return out.slice(0,max).map((x,i)=>({id:`n${i+1}`,...x,option:`${x.gmNominee?`GM ${x.name}`:x.name} — ${x.stat}`.slice(0,100)}));
}
export function shameFacts(d,nominees){
 return {week:weekLabel(d),nominees:nominees.map(({a,en,t,option,...x})=>x),
  nextFriday:'в пятницу — большое интервью Майка Роффона',nextShow:'следующий выпуск Inside FBL — в понедельник'};
}

// --- The voices. The show as all of them know it, then the one who speaks.
const SHOW=`Inside FBL — главный журнал фэнтези-баскетбольной лиги друзей FBL (Fantasy Brothers League). Выходит каждый понедельник вечером прямо в чате лиги: студия, круглый стол, и ведущие по очереди выдают свои блоки о прошедшей неделе лиги (с понедельника по воскресенье). Подача — как у студии Shaqtin' a Fool: смешной перфоманс на настоящей статистике, подколы друг друга и героев, шуточные призы, театральное возмущение, но у каждого своя рубрика и свой голос. Ведущие, в порядке эфира:
- Стивен Экс Перт — ведущий и главный эксперт Inside FBL: открывает выпуск и закрывает его рубрикой «Позор недели».
- Кристофер Дилдо — гений аналитики и математики: таблица недели, цифры команд, сделки в цифрах, задачка для зрителей.
- Тревор Матолог — главный медицинский специалист лиги: обход лазарета недели.
- Зак Онн — главная буква закона лиги: дело недели, законность сделок и правила на новую неделю.
- Майк Роффон — репортёр: что изменилось после его пятничного лонгрида и два флеш-интервью — с лучшим и худшим игроком недели.
Каждый блок — средний рид: не флеш и не лонгрид, а плотный, смешной, насыщенный текст, который читают взахлёб и пересылают друзьям.
В лиге очки называются ФО (фэнтези-очки), формула лиги: очки + подборы + передачи + перехваты + блоки − промахи с игры − промахи штрафных − 2×потери − фолы + 1 за матч.`;
const VOICES={
 steven:`Ты — Стивен Экс Перт, ведущий и главный эксперт Inside FBL. Уверенный эксперт в безупречном тёмном костюме, белой рубашке и синем галстуке в полоску, с папкой бумаг и ручкой; говоришь так, будто твой прогноз уже подшит к делу и заверен печатью. Ты ведёшь студию: держишь темп, подкалываешь коллег и героев, раздаёшь шуточные «призы за позор», театрально возмущаешься и еле сдерживаешь смех, когда пересматриваешь повтор. Смешные прозвища по игре, выкрики и фразочки — каждый раз новые, свои, по-русски. Лидеру достаётся с уважением: подколоть, потом признать.`,
 dildo:`Ты — Кристофер Дилдо, молодой аналитик Inside FBL: прямоугольные очки, клетчатая рубашка, блокнот, где всё посчитано. Очень узкий специалист: кроме математики и цифр ничего не знаешь и не делаешь вид, что знаешь. Злобный ботан, который математически смеётся над всеми: над провалами, над GM и их выбором, над командами и даже над героями; уверен, что умнее всех в лиге, и доказываешь это цифрами. Образы только из твоего мира: графики, выборки, выбросы, медиана, тренды, погрешность, корреляция, теоремы, контрольная, которую все завалили. Ты панически боишься, что за тобой следит ФБР, — одной фразой, не больше.`,
 trevor:`Ты — Тревор Матолог, главный травматолог лиги FBL. Пьяный мастер медицины: тридцать лет при командах НБА, гений, который каждую травму проверил на себе (отсюда шейный корсет и гипс в автографах), давно не просыхает. Манера — циничный безумный гений в духе дядюшки Рика из «Рика и Морти» (без цитат и упоминаний сериала): бормочешь, перескакиваешь с мысли на мысль, сыплешь псевдонаучной чушью (выдуманные синдромы, теории заговора сухожилий, параллельные вселенные), икаешь (*ик* — не больше трёх раз за блок), но в конце ставишь точный диагноз. Чушь — только в образах и шутках, никогда в данных ESPN: статусы, сроки, травмы — ровно как в данных. Ирония — над последствиями для команд и GM, над медициной и над собой, никогда над болью человека.`,
 zak:`Ты — Зак Онн, главный юрист лиги FBL, буква её закона. Адвокат с большой буквы, всегда в красной кепке «God Bless America». Твои слова — для лиги, а не для разработчиков: ты ничего не знаешь о программировании и всё — о законе, делах и сомнительных типах. Никогда не говори о технике: ни карточек, ни номеров, ни реестров, ни баз, ни ботов, ни кода, ни коллекций, ни счёта проверенных записей — всё говори как дело: подозреваемый, документы, расследование, приговор. Твой голос — американский боевик 90-х о законе и порядке: коротко, хлёстко, часто о себе в третьем лице («Зак Онн»), холодная ирония, суровость без мата. Твой мир — значок, наручники, тёмные очки, ночной город, допрос, досье, прицел, суд. О ФО, очках, наградах, игре игроков и прогнозах ты не говоришь: это не твоё дело.`,
 mike:`Ты — Майк Роффон, легендарный репортёр Inside FBL: ветеран, которого не впечатлить ни цифрами, ни позой, всегда в белых перчатках и с винтажным микрофоном. По пятницам у тебя большое интервью — лонгрид, сегодня ты в студии. Стиль: хлёсткий, жёсткий, ироничный. Вопросы короткие, без лести, бьют в слабое место; цепляешься за слово из ответа и разворачиваешь его против собеседника; реплика после ответа — одна сухая строка, как штамп в протоколе. Метафоры свои, свежие, из жизни; ирония через точное наблюдение. Игрок отвечает уверенно, коротко, с баскетбольным жаргоном и вкраплением английских терминов.`,
};
const COMMON=`Правила эфира:
- Только факты из данных. Числа — только из данных, никаких других (ни своих подсчётов, сумм, разниц и процентов, ни счёта матчей, ни дат, ни возрастов, ни количества чего угодно); числа словами тоже проверяются. Где можно — обходись без чисел.
- Имена игроков, команд и GM — ровно как в данных.
- Стебём игру, цифры и решения, а не человека: ни слова о внешности, теле, происхождении, семье, здоровье и личной жизни. Не цитируй и не изображай реальных телеведущих и шоу.
- Это живой эфир за круглым столом: открой блок одной фразой-ответом на то, как тебе передали слово (handedOver), и закончи handoff — одной фразой, которой ты по имени передаёшь слово следующему ведущему (next).
- Каждый выпуск — с чистого листа: свои свежие образы этой недели, ничего из прошлых выпусков; никаких времён года и урожая.
- Без хэштегов, без подписи (её поставит вёрстка), без HTML и markdown; эмодзи — не больше трёх на блок.
- Ответь только JSON по схеме.`;
const TASKS={
 opening:`Твой блок — открытие выпуска (600–1300 знаков в paragraphs). Поприветствуй лигу и задай тон недели: главная история таблицы (лидер, кто взлетел — flewUp, кто рухнул — fellDown, лучшая и худшая неделя команд, герой и антигерой недели). Если есть lastWeekShame — объяви, кому лига вручила «Позор недели» прошлого выпуска голосованием (winner, votes). Коротко анонсируй, кто сегодня в студии и с чем (rundown), без пересказа их цифр. handedOver — пусто: эфир начинается с тебя. title — заголовок выпуска до 70 знаков, без чисел.`,
 numbers:`Твой блок — «Цифры недели» (1200–2300 знаков в paragraphs, 3–5 абзацев). Таблица после недели (table: place сейчас, placeBefore — до недели, moved — сдвиг, weekFo — ФО за неделю), самые неожиданные цифры команд и GM (fblTeams: ФО недели и место, лучший и худший, промахи с игры и штрафных, потери, сколько игроков вышло), сделки недели в цифрах (deals: bought — кого купили и сколько ФО он принёс с тех пор, sold — кого продали и сколько ФО он набрал с тех пор, difference — разница; preseason — бесплатная сделка до старта): высмей GM за плохие сделки и снисходительно похвали за удачные. В конце — задачка для зрителей: quizLine — одна фраза-приглашение решить задачку quiz (сам вопрос и варианты покажет опрос, ответ не выдавай); quizExplanation — до 180 знаков, что увидят после ответа: правильный ответ (quiz.answer) с твоей издёвкой. title — до 70 знаков, без чисел.`,
 infirmary:`Твой блок — «Обход недели» (900–1900 знаков в paragraphs, 2–4 абзаца): обход лазарета лиги на сегодня (patients — игроки из составов FBL в отчёте ESPN о травмах: status, until — срок, where, what; clubGamesLastWeek и playedLastWeek — сколько матчей его клуб сыграл на прошлой неделе и сколько сыграл он сам) и какие команды и GM пострадали сильнее (teamsHit). Список пациентов со статусами вёрстка поставит отдельно под твоим текстом: не перечисляй всех, выбери самое смешное и важное. Если empty — лазарет пуст: обыграй это. В конце блока — точный диагноз недели одной фразой. title — до 70 знаков, без чисел.`,
 law:`Твой блок — «Закон и порядок» (900–1900 знаков в paragraphs, 2–4 абзаца). Дело недели: команды под подозрением и с нарушениями (teams: verdict, charges — rule, sure: доказано или под проверкой, detail), законность сделок недели (lastWeek: сделки и лимит), команды под прицелом (watchlist), постановления лиги недели (statementsOfTheWeek). Потом — новая неделя (newWeek): рынок открыт заново, у каждой команды снова её сделки в запасе (transfersLeft), где стоит белое правило и правило новичка; полное досье по командам вёрстка поставит отдельно под твоим текстом — ты выделяешь главное и предупреждаешь. verdict — одна ударная фраза-приговор недели, до 110 знаков. title — до 70 знаков, без чисел.`,
 mike:`Твой блок — «После лонгрида: флеш-интервью недели» (1500–2700 знаков всего). afterLongread — 1–3 абзаца о том, что изменилось после твоего пятничного лонгрида (afterLongread в данных: герой лонгрида на пятницу — onFriday, после воскресенья — afterSunday, table — места команд в пятницу и сейчас); если afterLongread в данных null, одной-двумя фразами скажи, что в пятницу ты снова едешь в гости. Затем два флеш-интервью: best — с лучшим игроком недели (bestOfTheWeek), worst — с худшим (worstOfTheWeek; если он null — все поля worst пустые строки): prologue — одна-две фразы, qa — 2–3 коротких вопроса и ответа, remark — сухая реплика Майка или пустая строка. pollLine — одна фраза: лига голосует, к кому ты поедешь в пятницу (nextFridayVote — варианты опроса; если их нет — пустая строка). title — до 70 знаков, без чисел.`,
 shame:`Твой блок — «Позор недели», финал выпуска (1000–2000 знаков всего). paragraphs — 1–2 абзаца: вступление к церемонии. prizes — по одному на каждого номинанта из nominees (nominee — его id), в том же порядке: prize — смешное название шуточного приза за позор (до 60 знаков, без чисел), line — колкий комментарий к его номинации (до 220 знаков); gmNominee — это GM за сделку недели наоборот. pollLine — одна фраза: лига голосует, кому достанется главный «Позор недели» (итоги — в следующем выпуске). farewell — 1–2 фразы: прощание до следующего понедельника, напомни про пятничный лонгрид Майка. handoff — пустая строка. title — до 70 знаков, без чисел.`,
};
const str={type:'string'},paras=(min,max)=>({type:'array',minItems:min,maxItems:max,items:str});
const qa={type:'array',minItems:2,maxItems:3,items:{type:'object',additionalProperties:false,required:['q','a'],properties:{q:str,a:str}}};
const flash={type:'object',additionalProperties:false,required:['prologue','qa','remark'],properties:{prologue:str,qa,remark:str}};
const schema=(props)=>({type:'object',additionalProperties:false,required:Object.keys(props),properties:props});
export const SCHEMAS={
 opening:schema({title:str,paragraphs:paras(2,4),handoff:str}),
 numbers:schema({title:str,paragraphs:paras(3,5),quizLine:str,quizExplanation:str,handoff:str}),
 infirmary:schema({title:str,paragraphs:paras(2,4),handoff:str}),
 law:schema({title:str,paragraphs:paras(2,4),verdict:str,handoff:str}),
 mike:schema({title:str,afterLongread:paras(1,3),best:flash,worst:flash,pollLine:str,handoff:str}),
 shame:schema({title:str,paragraphs:paras(1,2),prizes:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,required:['nominee','prize','line'],properties:{nominee:str,prize:str,line:str}}},pollLine:str,farewell:str,handoff:str}),
};
// The lengths of each block's words (characters): a block out of them goes back to be fixed.
export const LENGTH={opening:[450,1700],numbers:[900,2900],infirmary:[600,2400],law:[600,2400],mike:[1100,3300],shame:[700,2600]};

// handedOver: the line the previous host gave the word with; notes: the owner's wishes for this issue (a redo).
export function segmentMessages(key,facts,{handedOver='',notes=''}={}){
 const s=RUNDOWN.find(x=>x.key===key),next=nextOf(key);
 return {system:`${SHOW}\n\n${VOICES[s.host]}\n\n${COMMON}\n\n${TASKS[key]}`,
  prompt:`Выпуск Inside FBL. Твой блок: ${s.rubric}.\nhandedOver: ${handedOver?`«${handedOver}»`:'—'}\nnext: ${next?`${HOSTS[next.host].name} (${next.rubric})`:'— (ты закрываешь выпуск)'}\n\nДанные:\n${JSON.stringify(facts,null,1)}${notes?`\n\nПожелания редакции к этому выпуску (учти их, правила выше важнее): ${notes}`:''}`};
}
// Every word of a block, for the checks.
export const segmentWords=x=>[x?.title,...(x?.paragraphs||[]),...(x?.afterLongread||[]),x?.quizLine,x?.quizExplanation,x?.verdict,
 ...['best','worst'].flatMap(k=>x?.[k]?[x[k].prologue,...(x[k].qa||[]).flatMap(q=>[q.q,q.a]),x[k].remark]:[]),
 ...(x?.prizes||[]).flatMap(p=>[p.prize,p.line]),x?.pollLine,x?.farewell,x?.handoff].filter(t=>typeof t==='string'&&t.trim()).join('\n');
const ZAK_WORDS=/(?<!\p{L})(карточ\p{L}*|реестр\p{L}*|баз[аеуыо]й? данных|баз[аеуы](?!\p{L})|бот\p{L}{0,3}(?!\p{L})|код(?:а|ом|у|е)?(?!\p{L})|коллекци\p{L}*|айди|id(?!\p{L})|алгоритм\p{L}*|программ\p{L}*|сервер\p{L}*|компьютер\p{L}*|скрипт\p{L}*|записей)/iu;
const ZAK_OFF=/(?<!\p{L})ФО(?!\p{L})|фэнтези-очк|наград|MVP|прогноз/iu;
// What is wrong with a block for its facts ([]: it may go on air). nominees: Steven's prizes of shame, in order.
export function segmentProblems(key,x,facts,{nominees=[]}={}){
 const s=SCHEMAS[key];
 if(!x||typeof x!=='object'||s.required.some(k=>x[k]===undefined))return ['ответ не по схеме'];
 const out=[],text=segmentWords(x),allowed=allowedNumbers(facts),stray=strayNumbersIn(text,allowed);
 if(stray.length){const where=text.split(/(?<=[.!?…])\s+|\n+/).filter(t=>strayNumbersIn(t,allowed).length).slice(0,4).map(t=>`«${t.trim().slice(0,160)}»`);
  out.push(`числа не из данных: ${stray.join(', ')} (цифрами или словами, в том числе порядковыми) — вот где: ${where.join('; ')}; перепиши эти фразы без чисел`);}
 const copied=copiedIn(text);if(copied.length)out.push(`дословные фразы старых выпусков: ${copied.join(' | ')} — перепиши`);
 const stale=staleIn(text);if(stale.length)out.push(`чужая тема — время года и урожай (${stale.join(', ')}): перепиши образами этой недели`);
 const [min,max]=LENGTH[key],n=text.length;
 if(n<min)out.push(`слишком коротко (${n} знаков), нужно хотя бы ${min}`);if(n>max)out.push(`слишком длинно (${n} знаков), нужно не больше ${max}`);
 const next=nextOf(key);
 if(next&&!String(x.handoff||'').includes(HOSTS[next.host].first))out.push(`handoff должен по имени передать слово: ${HOSTS[next.host].name}`);
 if(key==='zak'||key==='law'){const w=text.match(ZAK_WORDS);if(w)out.push(`Зак Онн говорит о технике («${w[0]}»): скажи это языком дела — подозреваемый, документы, расследование, приговор`);
  const o=text.match(ZAK_OFF);if(o)out.push(`не дело Зака Онна («${o[0]}»): только закон, без очков и наград`);}
 if(key==='numbers'&&facts.quiz&&String(x.quizExplanation||'').length>190)out.push('quizExplanation длиннее 190 знаков');
 if(key==='shame'){const ids=(x.prizes||[]).map(p=>p.nominee);
  if(ids.join()!==nominees.map(n=>n.id).join())out.push(`prizes — ровно по одному на номинанта, по порядку: ${nominees.map(n=>n.id).join(', ')}`);}
 return out;
}
// Written, then sent back with its problems to be fixed (fixes times). {segment, problems, tries}: problems [] when it
// may go on air. claude: scripts/claude-text.mjs claudeJSON (a stand-in in the tests).
export async function writeSegment(key,facts,{handedOver='',notes='',nominees=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=300e3,fixes=2,log=console.warn}={}){
 const base=segmentMessages(key,facts,{handedOver,notes}),schema=SCHEMAS[key];
 let {data}=await claude({...base,schema,model,timeoutMs}),problems=segmentProblems(key,data,facts,{nominees}),tries=1;
 while(problems.length&&tries<=fixes){
  log(`Inside FBL show, ${key}: fixing (${problems.join('; ')}).`);
  ({data}=await claude({system:base.system,schema,model,timeoutMs,
   prompt:`${base.prompt}\n\nТвой черновик:\n${JSON.stringify(data)}\n\nИсправь только эти места, остальное оставь как есть, и верни весь JSON заново:\n${problems.map(p=>`- ${p}`).join('\n')}`}));
  problems=segmentProblems(key,data,facts,{nominees});tries++;
 }
 return {segment:data,problems,tries};
}

// --- The pictures: one per block, its prompt written whole by Claude from the block he wrote and its facts. The code
// gives the references: the hosts' faces (people.json: what never changes about them), the players' ESPN faces, the
// GMs' photos, the teams' logos.
const FBL_LOGO=fileURLToPath(new URL('./assets/fbl-logo.png',import.meta.url));
const leagueLogo=()=>({image:readImage(FBL_LOGO),is:'the logo of the league, FBL (Fantasy Brothers League)'});
// The references of each block's picture. faces: ESPN id -> headshot ({bytes, name, type}).
export function segmentCast(key,{d,facts,nominees=[],patients=[],faces=new Map(),root=ASSETS}={}){
 const face=(a,name,role,t)=>a&&faces.get(String(a))?playerRef(faces.get(String(a)),name,{need:false,role,...Number.isInteger(t)?{fantasyTeamColors:LEAGUE_TEAMS[t]?.kit||null}:{}}):null;
 if(key==='opening')return cast([stevenRef(root),{...dildoRef(root),is:'the photo of Christopher Dildo, the analyst of Inside FBL'},trevorRef(root),zakRef('check',root),mikeRef(root),leagueLogo()]);
 if(key==='numbers'){const top=d.standings.find(x=>x.team===d.teams[0]?.team)?.t,low=d.standings.find(x=>x.team===d.teams.at(-1)?.team)?.t;
  return cast([dildoRef(root),Number.isInteger(top)?gmRef(top,root,{is:"the photo of the GM of the week's best fantasy team",need:false}):null,
   Number.isInteger(low)&&low!==top?gmRef(low,root,{is:"the photo of the GM of the week's worst fantasy team",need:false}):null]);}
 // patients: trevor-matolog.js patientFacts, the most serious first.
 if(key==='infirmary')return cast([trevorRef(root),...patients.filter(p=>p.out).slice(0,3).map(p=>face(p.espnId,p.en||p.name,`a patient: ${[p.bodyPartEn,p.injuryEn].filter(Boolean).join(', ')||'injured'}`))]);
 if(key==='law'){const suspects=(facts?.teams||[]).filter(t=>t.verdict!=='чисто').slice(0,2).map(t=>LEAGUE_TEAMS.findIndex(x=>x.name===t.team));
  return cast([zakRef(suspects.length?'check':'approved',root),...suspects.map(t=>gmRef(t,root,{is:'the photo of the GM of a fantasy team under investigation',need:false})),commissionerRef(root)]);}
 if(key==='mike'){const b=d.heroes[0],w=d.flops[0];
  return cast([mikeRef(root),b&&faces.get(String(b.a))?playerRef(faces.get(String(b.a)),imageName(b),{role:'the best player of the week',fantasyTeamColors:LEAGUE_TEAMS[b.h?.[0]]?.kit||null}):null,
   w&&faces.get(String(w.a))?playerRef(faces.get(String(w.a)),imageName(w),{role:'the worst player of the week',fantasyTeamColors:LEAGUE_TEAMS[w.h?.[0]]?.kit||null}):null]);}
 if(key==='shame')return cast([stevenRef(root),...nominees.slice(0,3).map(n=>n.gmNominee?gmRef(n.t,root,{is:'the photo of the GM nominated for the deal of the week in reverse',need:false}):face(n.a,n.en,`nominated for a prize of shame: ${n.kind}`,n.t))]);
 return cast([]);
}
const PICTURE={
 opening:`Обложка выпуска Inside FBL: студия шоу и круглый стол, за которым все пятеро ведущих (они все в референсах) — каждый собой, с тем, что у него никогда не меняется. Сцена — из главной истории этой недели (заголовок и текст открытия Стивена): что происходит в студии, кто что держит и над чем все смеются — решаешь ты. Студия своя, без названий и логотипов реальных шоу и каналов; надпись «INSIDE FBL» на студийном экране — по желанию; логотип лиги FBL — по желанию.`,
 numbers:`Картинка к блоку «Цифры недели» Кристофера Дилдо — кадр из фильма о сошедшем с ума математике: Дилдо в кадре, по своему фото, в прямоугольных очках, с блокнотом и ручкой, вокруг его одержимый мир — стены и доски в формулах и графиках, нити между вырезками, и панический страх ФБР (жалюзи, тени агентов, чёрный фургон; агенты никого не трогают, настоящих эмблем ФБР нет). Главная надпись кадра — его «открытие» недели из его блока. GM — если их фото в референсах — могут быть в кадре: ликуют или хватаются за голову.`,
 infirmary:`Картинка к блоку «Обход недели» Тревора Матолога: лазарет лиги, Тревор на обходе, всегда в шейном корсете и с гипсом в автографах, пациенты — по их лицам с референсов, на койках, с повязками по их травмам. Смешно, абсурдно, но без боли и крови.`,
 law:`Картинка к блоку «Закон и порядок» Зака Онна — кадр американского боевика 90-х, где весь сюжет — закон и порядок: дело недели, подозреваемые, документы, допрос, приговор. Зак Онн всегда Юрист, всегда в красной кепке с надписью «God Bless America». GM из референсов — подозреваемые или свидетели его дела, комиссар — когда к месту. Никакой техники: ни экранов, ни кода, ни серверов, ни баз — только дело.`,
 mike:`Картинка к блоку Майка Роффона: его флеш-интервью недели — с лучшим и с худшим игроком (их лица — в референсах): сцена, настроение, колкость — из этих интервью. Майк — ветеран-репортёр, всегда в белых перчатках и с винтажным хромированным микрофоном, одет как спортивный репортёр под сцену. Игроки — в цветах своих фэнтези-команд (fantasyTeamColors), без логотипов НБА.`,
 shame:`Картинка к рубрике «Позор недели» Стивена Экс Перта — церемония вручения шуточных призов за позор в студии Inside FBL: Стивен с серьёзным лицом еле сдерживает смех, номинанты (их лица — в референсах) получают свои нелепые призы из его текста. Стебём игру и цифры, а не человека. Студия и призы свои, без реальных шоу.`,
};
const PICTURE_SYSTEM=key=>`Ты — бильд-редактор Inside FBL, главного журнала фэнтези-баскетбольной лиги друзей FBL: каждый понедельник ведущие по очереди выходят в эфир со своими блоками, и каждый блок выходит с одной фотореалистичной смешной картинкой. Ты придумываешь её целиком и пишешь её промпт для ChatGPT.
${PICTURE[key]}
- Картинка — из этого блока и этих фактов: его шутки, его образы, его главный момент. Место, сюжет и стиль — каждый раз новые.
- Надписи — только в кавычках, по-русски, заглавными, до 6 слов, не больше двух; числа в них — только из данных.
- Ни реальных телеведущих, ни названий, логотипов и заставок реальных шоу и каналов.

${CRAFT}`;
const brief=(key,x,facts)=>`Блок «${RUNDOWN.find(s=>s.key===key).rubric}», как его написал ведущий:\n${segmentWords(x)}\n\nДанные блока:\n${JSON.stringify(facts,null,1)}`;
// Claude's picture of a block ({images, prompt, idea}) or null.
export async function writeSegmentPicture(key,x,facts,c,{claude=claudeJSON,model=SHOW_MODEL,timeoutMs=240e3,log=console.warn}={}){
 return writePicture({system:PICTURE_SYSTEM(key),brief:brief(key,x,facts),c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:`Inside FBL show, ${key}`,log});
}

// --- The polls (Telegram sendPoll): their options are the code's, from the facts.
export function quizPoll(quiz,explanation){
 return quiz&&{question:`🧮 Задачка Дилдо: ${quiz.question}`.slice(0,300),options:quiz.options,type:'quiz',correct_option_id:quiz.correct,
  ...explanation?{explanation:String(explanation).slice(0,200)}:{},is_anonymous:true};
}
export const guestPoll=candidates=>candidates.length>=2?{question:'🎤 К кому Майк Роффон поедет в гости в пятницу?',options:candidates.map(c=>c.label),is_anonymous:true}:null;
export const shamePoll=nominees=>nominees.length>=2?{question:'🏆 Позор недели: кому лига вручает главный приз?',options:nominees.map(n=>n.option),is_anonymous:true}:null;
// The winner of a stopped poll (Telegram's Poll: options with voter_count): the most votes, the first of them at a tie;
// null when nobody voted. keys: what each option stands for, in order.
export function pollWinner(poll,keys=[]){
 const opts=poll?.options||[],top=Math.max(0,...opts.map(o=>o.voter_count||0));
 if(!top)return null;
 const i=opts.findIndex(o=>(o.voter_count||0)===top);
 return {option:opts[i].text,key:keys[i]??null,votes:top,total:opts.reduce((s,o)=>s+(o.voter_count||0),0)};
}

// --- On air: the captions of the blocks' pictures and their texts (Telegram HTML), each text a reply under its picture.
const tags=(w,s)=>`#inside_fbl #неделя_${w.n}${s.key==='opening'?'':` #${s.tag}`}`;
const tidy=t=>String(t??'').replace(/[ \t]+/g,' ').trim();
const unquote=t=>tidy(t).replace(/^[«"„“]+|[»"“”]+$/g,'');
export function segmentCaption(key,x,week){
 const s=RUNDOWN.find(r=>r.key===key),h=HOSTS[s.host];
 if(key==='opening')return `<b>🎙 Inside FBL • Выпуск ${week.n}</b>\n<b>${esc(unquote(x?.title||'Главный журнал лиги'))}</b>\n<i>Неделя ${week.n} · ${esc(dayRu(week.start))} – ${esc(dayRu(week.end))}</i>\n\nВ студии: ${Object.values(HOSTS).map(v=>esc(v.name)).join(', ')}.\n\n${tags(week,s)}`;
 return `<b>${h.emoji} Inside FBL • ${esc(s.rubric)}</b>\n${esc(h.name)}, ${esc(h.role)}\n\n${tags(week,s)}`;
}
const STATUS_ICON=p=>p.out?'🔴':'🟡';
// The lines the code lays out under a host's words, untouched by him: the infirmary as ESPN has it, Zak's case file.
export function patientLines(facts){
 return (facts.patients||[]).map(p=>`${STATUS_ICON(p)} <b>${esc(p.name)}</b>${p.club?` (${esc(p.club)})`:''} — ${esc(String(p.status||'').toLowerCase())}${p.until?`, ${esc(p.until)}`:''}${p.where?` · ${esc(p.where)}${p.what?`, ${esc(p.what)}`:''}`:''}${p.clubGamesLastWeek?` · сыграл ${p.playedLastWeek} из ${p.clubGamesLastWeek}`:''}\n   ${p.fblTeams.map(t=>esc(t.team)).join(', ')}`);
}
const MARK={'соблюдено':'✅','нарушено':'🚫'};
export function dossierLines(facts){
 return (facts.teams||[]).map(t=>{const i=LEAGUE_TEAMS.findIndex(x=>x.name===t.team),sym=LEAGUE_TEAMS[i]?.symbol||'';
  return `${sym} <b>${esc(t.team)}</b>${t.watched?' 🎯':''} — ${t.verdict==='чисто'?'чисто':t.verdict==='нарушение'?'🚨 нарушение':'🔎 под проверкой'}\n   сделок в запасе: ${t.newWeek.transfersLeft} из ${t.newWeek.limit} · белое правило: ${MARK[t.whiteRule]||'❔'} · новичок: ${MARK[t.rookieRule]||'❔'}${t.rookies[0]?` (${esc(t.rookies.join(', '))})`:''}`;});
}
const ps=list=>(list||[]).map(tidy).filter(Boolean).map(esc).join('\n\n');
const handoffLine=x=>tidy(x?.handoff)?`\n\n🎙 <i>${esc(tidy(x.handoff))}</i>`:'';
const flashText=(name,f,label)=>[`<b>🎤 Флеш-интервью: ${esc(label)} — ${esc(name)}</b>`,esc(tidy(f.prologue)),
 ...(f.qa||[]).map(q=>`<b>Майк Роффон.</b> ${esc(tidy(q.q))}\n<b>${esc(name)}.</b> ${esc(tidy(q.a))}`),...tidy(f.remark)?[`<i>Майк Роффон: ${esc(tidy(f.remark))}</i>`]:[]].join('\n\n');
export function segmentText(key,x,facts,{nominees=[]}={}){
 const s=RUNDOWN.find(r=>r.key===key),h=HOSTS[s.host],head=`<b>${h.emoji} ${esc(s.rubric)}</b>\n<i>«${esc(unquote(x.title))}»</i>`;
 let body;
 if(key==='numbers')body=`${ps(x.paragraphs)}${tidy(x.quizLine)?`\n\n🧮 <b>${esc(tidy(x.quizLine))}</b>`:''}`;
 else if(key==='infirmary')body=`${ps(x.paragraphs)}${facts.patients?.length?`\n\n<b>🏥 Лазарет на сегодня (отчёт ESPN)</b>\n${patientLines(facts).join('\n')}`:''}`;
 else if(key==='law')body=`${ps(x.paragraphs)}\n\n<b>📁 Досье на новую неделю</b>\n${dossierLines(facts).join('\n')}${tidy(x.verdict)?`\n\n⚖️ <b>${esc(tidy(x.verdict))}</b>`:''}`;
 else if(key==='mike'){const b=facts.bestOfTheWeek,w=facts.worstOfTheWeek;
  body=[ps(x.afterLongread),b?flashText(b.name,x.best,`лучший игрок недели, ${b.fo} ФО`):null,w?flashText(w.name,x.worst,`худший игрок недели, ${w.fo} ФО`):null,
   tidy(x.pollLine)?`🗳 <b>${esc(tidy(x.pollLine))}</b>`:null,'<i>Интервью вымышленные: цифры настоящие, слова — нет.</i>'].filter(Boolean).join('\n\n');}
 else if(key==='shame'){const by=new Map((x.prizes||[]).map(p=>[p.nominee,p]));
  body=[ps(x.paragraphs),nominees.map(n=>{const p=by.get(n.id);return `🏆 <b>Приз «${esc(unquote(p?.prize||n.kind))}»</b> — <b>${esc(n.gmNominee?`GM ${n.name}`:n.name)}</b> (${esc(n.stat)})${p?.line?`\n${esc(tidy(p.line))}`:''}`;}).join('\n\n'),
   tidy(x.pollLine)?`🗳 <b>${esc(tidy(x.pollLine))}</b>`:null,ps([x.farewell])].filter(Boolean).join('\n\n');}
 else body=ps(x.paragraphs);
 return `${head}\n\n${body}${handoffLine(x)}\n\n${esc(h.sign)}`;
}

// --- The show on one page (Telegraph: telegra.ph/api#Node), the web edition of the issue linked from its opening.
const node=(tag,...children)=>({tag,children});
const plain=t=>String(t).replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
// Telegram HTML (b and i only) as Telegraph's nodes: a paragraph a node, its line breaks as br.
const inline=line=>{const parts=[],re=/<(b|i)>(.*?)<\/\1>/s;let rest=line;
 for(let m=rest.match(re);m;m=rest.match(re)){if(m.index)parts.push(plain(rest.slice(0,m.index)));parts.push(node(m[1],plain(m[2])));rest=rest.slice(m.index+m[0].length);}
 if(rest)parts.push(plain(rest));return parts;};
export const htmlToNodes=html=>String(html).split('\n\n').filter(p=>p.trim()).map(par=>node('p',...par.split('\n').flatMap((l,i)=>[...i?[{tag:'br'}]:[],...inline(l)])));
// segments: [{key, title, text (segmentText), picture (its URL or null), cards: [URLs], polls: [{question, options}]}].
export function showNodes(week,segments){
 const out=[node('p',node('i',`Главный журнал лиги FBL. Неделя ${week.n}: ${dayRu(week.start)} – ${dayRu(week.end)}. В студии: ${Object.values(HOSTS).map(h=>h.name).join(', ')}.`))];
 for(const s of segments){
  const r=RUNDOWN.find(x=>x.key===s.key),h=HOSTS[r.host];
  out.push(node('h3',`${h.emoji} ${r.rubric} — ${h.name}`));
  if(s.picture)out.push(node('figure',{tag:'img',attrs:{src:s.picture}}));
  if(s.title)out.push(node('p',node('b',`«${unquote(s.title)}»`)));
  out.push(...htmlToNodes(s.text.split('\n\n').slice(1).join('\n\n')));
  for(const c of s.cards||[])out.push(node('figure',{tag:'img',attrs:{src:c}}));
  for(const p of s.polls||[])out.push(node('blockquote',`🗳 ${p.question}\n${p.options.map(o=>`• ${o}`).join('\n')}\nГолосование — в чате лиги.`));
 }
 out.push(node('p',node('i','Inside FBL выходит по понедельникам. Цифры настоящие, ФО по формуле лиги; слова и интервью — вымышленные.')));
 return out;
}
export const showTitle=(week,x)=>`Inside FBL — выпуск ${week.n}: ${unquote(x?.title||'главный журнал лиги')}`.slice(0,256);
