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
import {perPlayer,addDays,SEASON_START,SEASON_END} from './core.js';
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
import GUEST_LIST from '../data/inside-show-guests.json' with {type:'json'};

export const SHOW_MODEL=process.env.INSIDE_SHOW_MODEL||CLAUDE_MODEL;
// The Monday after the week's Sunday, in Moscow (UTC+3 all year), owner, 24.10.2026: at 09:00 the owner gets the
// announcement and the whole show in his own chat by Mike Roffon's bot, at 12:00 the announcement goes to the league
// (the studio's photo with the secret guests and the issue's topics), at 18:00 the show goes on air.
export const REVIEW_AT={weekday:1,hour:9},ANNOUNCE_AT={weekday:1,hour:12},AIR_AT={weekday:1,hour:18};
const mondayAt=(week,hour)=>Date.parse(`${addDays(week.end,1)}T${String(hour-3).padStart(2,'0')}:00:00Z`);
export const reviewTime=week=>mondayAt(week,REVIEW_AT.hour),announceTime=week=>mondayAt(week,ANNOUNCE_AT.hour);
export const airTime=week=>mondayAt(week,AIR_AT.hour);
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
// The special guests of an issue (owner, 24.10.2026): at most two living NBA legends or coaches (data/inside-show-guests.json),
// each with a block of his own after Mike's and before the prizes of shame, given the word by the host (his bot posts it).
export const GUESTS=GUEST_LIST.guests,MAX_GUESTS=2,GUEST_REPEAT_WEEKS=8;
export const guestById=id=>GUESTS.find(g=>g.id===id)||null;
export function rundownOf(guests=[]){
 const g=guests.slice(0,MAX_GUESTS).map((x,i)=>({key:`guest${i+1}`,host:'steven',guest:x,rubric:`Гость студии: ${x.name}`,tag:'гость_студии'}));
 return [...RUNDOWN.slice(0,-1),...g,RUNDOWN.at(-1)];
}
const slotOf=(key,guests=[])=>rundownOf(guests).find(s=>s.key===key);
const nextOf=(key,guests=[])=>{const r=rundownOf(guests),i=r.findIndex(s=>s.key===key);return r[i+1]||null;};
// A block's kind: its rules, schema and lengths (every guest's are the same).
export const kindOf=key=>String(key).startsWith('guest')?'guest':key;
// Who speaks in a block: a host, or a guest (named as the hosts address him: calls).
export function speaker(s){
 if(!s?.guest)return {...HOSTS[s.host],calls:[HOSTS[s.host].first]};
 const g=s.guest;
 return {name:g.name,first:g.calls?.[0]||g.name,calls:[...g.calls||[],g.name],emoji:'🌟',role:g.kind==='coach'?'легендарный тренер НБА, гость студии':'легенда НБА, гость студии',sign:`— ${g.name}, гость студии Inside FBL`};
}
export const guestNote=guests=>guests.map(g=>({name:g.name,who:g.kind==='coach'?'легендарный тренер НБА':'легенда НБА',known:g.known}));

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
export function openingFacts(d,{lastShame=null,guests=[]}={}){
 const climbs=tableOut(d).filter(x=>x.moved).sort((a,b)=>b.moved-a.moved);
 return {week:weekLabel(d),table:tableOut(d),
  bestWeek:d.teams[0]&&{team:d.teams[0].team,gm:d.teams[0].gm,fo:d.teams[0].fo},worstWeek:d.teams.at(-1)&&{team:d.teams.at(-1).team,gm:d.teams.at(-1).gm,fo:d.teams.at(-1).fo},
  flewUp:climbs[0]?.moved>0?climbs[0]:null,fellDown:climbs.at(-1)?.moved<0?climbs.at(-1):null,
  heroOfTheWeek:weekLine(d,d.weekRows.get(d.heroes[0]?.a)),flopOfTheWeek:weekLine(d,d.weekRows.get(d.flops[0]?.a)),
  mvpLeader:d.mvp[0]&&{name:d.mvp[0].name,fo:d.mvp[0].fo},rookieLeader:d.roy[0]&&{name:d.roy[0].name,fo:d.roy[0].fo},
  lastWeekShame:lastShame,studioGuests:guestNote(guests),
  rundown:rundownOf(guests).slice(1).map(s=>({host:speaker(s).name,rubric:s.rubric}))};
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

// --- Steven's prizes of shame (owner, 24.10.2026): two of them every week, one for a player and one for a GM, each with
// the league's vote, and at the season's end the prizes of shame of the year for both, by the weeks' winners. The
// nominees are the code's. Players (one each, a player once): the worst game, the most bricks, the most turnovers, the
// most fouls, the most missed free throws, the week's flop. GMs (a GM once): the worst deal of the week, a breach of the
// rules (breaches: the teams Zak found in breach), the week's worst team, the deal that sold the hottest player, the most
// turnovers and the most missed shots of a team.
export function shameNominees(d,{breaches=[],max=4}={}){
 const lines=d.mine.filter(l=>l.h?.length&&l.s),players=[],used=new Set();
 const pick=(list,score,min,kind,stat)=>{if(players.length>=max)return;const l=[...list].filter(x=>score(x)>=min&&!used.has(x.a)).sort((a,b)=>score(b)-score(a)||a.t.localeCompare(b.t))[0];
  if(!l)return;used.add(l.a);players.push({kind,a:l.a,en:imageName(l),name:d.who(l.a,l.n),club:l.c,...team(l.h[0]),t:l.h[0],day:dayRu(l.d),stat:stat(l),fo:round(l.p),game:box(l.s)});};
 pick(lines.filter(l=>l.m>=15),l=>-l.p,-Infinity,'худший матч недели',l=>`${round(l.p)} ФО за матч`);
 pick(lines,l=>l.s.fga-l.s.fgm,8,'кирпичи',l=>`${l.s.fga-l.s.fgm} промахов с игры`);
 pick(lines,l=>l.s.tov,5,'потери',l=>`${l.s.tov} потерь`);
 pick(lines,l=>l.s.pf,5,'фолы',l=>`${l.s.pf} фолов`);
 pick(lines,l=>l.s.fta-l.s.ftm,4,'штрафные',l=>`${l.s.fta-l.s.ftm} промахов со штрафной`);
 const flop=d.flops[0]&&!used.has(d.flops[0].a)&&players.length<max?d.weekRows.get(d.flops[0].a):null;
 if(flop)players.push({kind:'антигерой недели',a:flop.a,en:imageName(flop),name:d.who(flop.a,flop.n),club:flop.c,...team(flop.h?.[0]),t:flop.h?.[0],stat:`${round(flop.p)} ФО за неделю`,fo:round(flop.p),games:flop.games});
 const gms=[],held=new Set(),gm=(t,kind,stat,extra={})=>{if(!Number.isInteger(t)||held.has(t)||gms.length>=max)return;held.add(t);gms.push({kind,gmNominee:true,t,name:LEAGUE_TEAMS[t].gm,team:LEAGUE_TEAMS[t].name,gm:LEAGUE_TEAMS[t].gm,stat,...extra});};
 const bad=[...d.deals].filter(x=>x.difference<0).sort((a,b)=>a.difference-b.difference);
 if(bad[0])gm(bad[0].t,'сделка недели наоборот',`продал ${bad[0].sold.name}, купил ${bad[0].bought.name}`,{sold:bad[0].sold,bought:bad[0].bought,difference:bad[0].difference});
 for(const t of breaches)gm(t,'дело Зака Онна','нарушение регламента');
 const worst=d.standings.reduce((a,b)=>(b.weekFo<a.weekFo?b:a),d.standings[0]);if(worst)gm(worst.t,'худшая неделя лиги',`${worst.weekFo} ФО за неделю`,{weekFo:worst.weekFo});
 const hot=[...d.deals].filter(x=>x.difference<0).sort((a,b)=>b.sold.fo-a.sold.fo)[0];if(hot)gm(hot.t,'продал того, кто выстрелил',`продал ${hot.sold.name}, а тот набрал ${hot.sold.fo} ФО`,{sold:hot.sold,bought:hot.bought,difference:hot.difference});
 const tidx=name=>LEAGUE_TEAMS.findIndex(x=>x.name===name),desc=k=>[...d.teams].sort((a,b)=>b[k]-a[k])[0];
 const tov=desc('turnovers');if(tov)gm(tidx(tov.team),'потери команды',`${tov.turnovers} потерь у команды`,{turnovers:tov.turnovers});
 const miss=desc('missedShots');if(miss)gm(tidx(miss.team),'кирпичный завод',`${miss.missedShots} промахов с игры у команды`,{missedShots:miss.missedShots});
 return [...players,...gms].map((x,i)=>({id:`n${i+1}`,...x,option:(x.gmNominee?`${x.name} (${x.team}) — ${x.stat}`:`${x.name} — ${x.stat}`).slice(0,100)}));
}
// The prizes of shame of the year so far: the weeks' winners counted. results: the shows' shameResult, oldest first.
export function shameOfTheYear(results=[]){
 const count=side=>{const m=new Map();for(const r of results){const k=r?.[side]?.key;if(k)m.set(k,(m.get(k)||0)+1);}
  return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,wins])=>({name,wins}));};
 return {players:count('player'),gms:count('gm')};
}
// seasonFinal: the season's last show, when the prizes of the year are given (the leaders of shameOfTheYear).
export function shameFacts(d,nominees,{year={players:[],gms:[]},seasonFinal=d.week.end>=SEASON_END}={}){
 const out=n=>n.map(({a,en,t,option,...x})=>x),top=list=>list.filter(x=>x.wins===list[0]?.wins);
 return {week:weekLabel(d),players:out(nominees.filter(n=>!n.gmNominee)),gms:out(nominees.filter(n=>n.gmNominee)),
  shameOfTheYear:year,...seasonFinal?{seasonFinal:{player:top(year.players),gm:top(year.gms)}}:{},
  nextFriday:'в пятницу — большое интервью Майка Роффона',nextShow:seasonFinal?'это последний выпуск сезона':'следующий выпуск Inside FBL — в понедельник'};
}

// --- A guest's facts: the week of our league as the hosts see it, and what they said in the studio before him (their
// titles and opening lines: a guest may answer them). said: [{host, rubric, title, words}].
export function guestFacts(d,{said=[]}={}){
 const best=[...d.deals].sort((a,b)=>b.difference-a.difference),pick=x=>x&&{team:x.team,gm:x.gm,bought:x.bought,sold:x.sold,difference:x.difference};
 return {week:weekLabel(d),table:tableOut(d),fblTeams:d.teams.map(({place,team,gm,fo,best,worst,missedShots,turnovers})=>({place,team,gm,fo,best,worst,missedShots,turnovers})),
  heroOfTheWeek:weekLine(d,d.weekRows.get(d.heroes[0]?.a)),flopOfTheWeek:weekLine(d,d.weekRows.get(d.flops[0]?.a)),
  mvpRace:d.mvp.slice(0,3).map(p=>({name:p.name,fo:p.fo})),rookieRace:d.roy.slice(0,3).map(p=>({name:p.name,fo:p.fo})),
  bestDeal:pick(best[0]),worstDeal:pick(best.length>1?best.at(-1):null),saidInTheStudio:said};
}
// What a block said, for the guests after it: its title and its first lines.
export const saidOf=(key,x,guests=[])=>({host:speaker(slotOf(key,guests)).name,rubric:slotOf(key,guests).rubric,title:x.title,
 words:String((x.paragraphs||x.afterLongread||[])[0]||'').slice(0,420)});

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
 mike:`Ты — Майк Роффон, легендарный репортёр Inside FBL: ветеран, которого не впечатлить ни цифрами, ни позой, всегда в белых перчатках и с винтажным микрофоном. По пятницам у тебя большое интервью — лонгрид, сегодня ты в студии. Стиль: хлёсткий, жёсткий, ироничный. Вопросы короткие, без лести, бьют в слабое место; цепляешься за слово из ответа и разворачиваешь его против собеседника; реплика после ответа — одна сухая строка, как штамп в протоколе. Метафоры свои, свежие, из жизни; ирония через точное наблюдение. Игрок отвечает уверенно, коротко, с баскетбольным жаргоном по-русски; английские словечки — только русскими буквами (юзадж, клатч, бэк-ту-бэк).`,
};
// A guest speaks in his own manner (the guests' list: style), as a guest of the studio among the hosts.
const guestVoice=g=>`Ты — ${g.name} (${g.en}), ${g.kind==='coach'?'легендарный тренер НБА':'легенда НБА'}: ${g.known}. Сегодня ты специальный гость студии Inside FBL и вместе с ведущими обсуждаешь неделю нашей лиги друзей.
Твоя манера — твоя узнаваемая, как у тебя самого: ${g.style}
- Сохраняй свой стиль повествования от первой до последней фразы: темп, интонация, любимые темы, твой взгляд на баскетбол. Свои прозвища и общеизвестные факты карьеры — можно; дословно не повторяй реальных цитат, придумывай свои фразы в своём духе.
- Как и эксперты студии, стебёшь или поощряешь игроков, GM и команды нашей лиги — по-своему: кого-то разнесёшь, кого-то признаешь.
- О своей реальной жизни — только общеизвестное о карьере; ничего о личной жизни, здоровье, деньгах и скандалах, своих и чужих.`;
const COMMON=`Правила эфира:
- Только факты из данных. Числа — только из данных, никаких других (ни своих подсчётов, сумм, разниц и процентов, ни счёта матчей, ни дат, ни возрастов, ни количества чего угодно); числа словами тоже проверяются. Где можно — обходись без чисел.
- Имена игроков, команд и GM — ровно как в данных.
- Стебём игру, цифры и решения, а не человека: ни слова о внешности, теле, происхождении, семье, здоровье и личной жизни. Не цитируй и не изображай реальных телеведущих и шоу.
- Это живой эфир за круглым столом: открой блок одной фразой-ответом на то, как тебе передали слово (handedOver), и закончи handoff — одной фразой, которой ты по имени передаёшь слово следующему (next). Если в студии сегодня гости (studioGuests) — к ним можно обращаться и подкалывать их, как своих.
- Каждый выпуск — с чистого листа: свои свежие образы этой недели, ничего из прошлых выпусков; никаких времён года и урожая.
- Только по-русски: никакой латиницы, кроме названий команд, имён GM и клубов — ровно как в данных. Баскетбольные термины — по-русски (подбор, потеря, бросок, кирпич, дабл-дабл, концовка); если русского слова нет, английское пиши русскими буквами (юзадж, клатч, хай-юзадж шутер).
- Без хэштегов, без подписи (её поставит вёрстка), без HTML и markdown; эмодзи — не больше трёх на блок.
- Ответь только JSON по схеме.`;
const TASKS={
 opening:`Твой блок — открытие выпуска (600–1400 знаков в paragraphs). Поприветствуй лигу и задай тон недели: главная история таблицы (лидер, кто взлетел — flewUp, кто рухнул — fellDown, лучшая и худшая неделя команд, герой и антигерой недели). Если есть lastWeekShame — объяви, кому лига вручила «Позор недели» прошлого выпуска голосованием (winner, votes). Коротко анонсируй, кто сегодня в студии и с чем (rundown), без пересказа их цифр; если есть studioGuests — с гордостью представь специальных гостей студии (их выход — после Майка). handedOver — пусто: эфир начинается с тебя. title — заголовок выпуска до 70 знаков, без чисел.`,
 numbers:`Твой блок — «Цифры недели» (1200–2300 знаков в paragraphs, 3–5 абзацев). Таблица после недели (table: place сейчас, placeBefore — до недели, moved — сдвиг, weekFo — ФО за неделю), самые неожиданные цифры команд и GM (fblTeams: ФО недели и место, лучший и худший, промахи с игры и штрафных, потери, сколько игроков вышло), сделки недели в цифрах (deals: bought — кого купили и сколько ФО он принёс с тех пор, sold — кого продали и сколько ФО он набрал с тех пор, difference — разница; preseason — бесплатная сделка до старта): высмей GM за плохие сделки и снисходительно похвали за удачные. В конце — задачка для зрителей: quizLine — одна фраза-приглашение решить задачку quiz (сам вопрос и варианты покажет опрос, ответ не выдавай); quizExplanation — до 180 знаков, что увидят после ответа: правильный ответ (quiz.answer) с твоей издёвкой. title — до 70 знаков, без чисел.`,
 infirmary:`Твой блок — «Обход недели» (900–1900 знаков в paragraphs, 2–4 абзаца): обход лазарета лиги на сегодня (patients — игроки из составов FBL в отчёте ESPN о травмах: status, until — срок, where, what; clubGamesLastWeek и playedLastWeek — сколько матчей его клуб сыграл на прошлой неделе и сколько сыграл он сам) и какие команды и GM пострадали сильнее (teamsHit). Список пациентов со статусами вёрстка поставит отдельно под твоим текстом: не перечисляй всех, выбери самое смешное и важное. Если empty — лазарет пуст: обыграй это. В конце блока — точный диагноз недели одной фразой. title — до 70 знаков, без чисел.`,
 law:`Твой блок — «Закон и порядок» (900–1900 знаков в paragraphs, 2–4 абзаца). Дело недели: команды под подозрением и с нарушениями (teams: verdict, charges — rule, sure: доказано или под проверкой, detail), законность сделок недели (lastWeek: сделки и лимит), команды под прицелом (watchlist), постановления лиги недели (statementsOfTheWeek). Потом — новая неделя (newWeek): рынок открыт заново, у каждой команды снова её сделки в запасе (transfersLeft), где стоит белое правило и правило новичка; полное досье по командам вёрстка поставит отдельно под твоим текстом — ты выделяешь главное и предупреждаешь. verdict — одна ударная фраза-приговор недели, до 110 знаков. title — до 70 знаков, без чисел.`,
 mike:`Твой блок — «После лонгрида: флеш-интервью недели» (1500–2700 знаков всего). afterLongread — 1–3 абзаца о том, что изменилось после твоего пятничного лонгрида (afterLongread в данных: герой лонгрида на пятницу — onFriday, после воскресенья — afterSunday, table — места команд в пятницу и сейчас); если afterLongread в данных null, одной-двумя фразами скажи, что в пятницу ты снова едешь в гости. Затем два флеш-интервью: best — с лучшим игроком недели (bestOfTheWeek), worst — с худшим (worstOfTheWeek; если он null — все поля worst пустые строки): prologue — одна-две фразы, qa — 2–3 коротких вопроса и ответа, remark — сухая реплика Майка или пустая строка. pollLine — одна фраза: лига голосует, к кому ты поедешь в пятницу (nextFridayVote — варианты опроса; если их нет — пустая строка). title — до 70 знаков, без чисел.`,
 guest:`Твой блок — слово специального гостя студии (700–1900 знаков в paragraphs, 2–4 абзаца). Обсуди результаты нашей лиги за неделю по данным: таблица, команды и их GM, герой и антигерой недели, гонки, лучшая и худшая сделка. Ответь кому-то из ведущих на то, что они сказали в студии (saidInTheStudio), — поспорь или поддержи. Стебёшь или поощряешь, как эксперты, но своим голосом. title — твоя фраза-заголовок до 70 знаков, без чисел.`,
 shame:`Твой блок — «Позор недели», финал выпуска (1300–2800 знаков всего). Номинаций две: среди игроков (players) и среди GM (gms). paragraphs — 1–2 абзаца: вступление к церемонии. prizes — по одному на каждого номинанта, сначала все игроки, потом все GM, в том порядке, как в данных (nominee — его id): prize — смешное название шуточного приза за позор (до 60 знаков, без чисел), line — колкий комментарий к его номинации (до 220 знаков). GM достаётся за его решения и его команду: сделки, состав, дело Зака Онна. shameOfTheYear — сколько недельных «Позоров» уже собрали игроки и GM: подколи лидеров гонки за «Позор года». Если есть seasonFinal — это последний выпуск сезона: торжественно вручи «Позор года» игроку и GM из seasonFinal. pollLine — одна фраза: лига голосует в двух опросах, кому достанутся «Позор недели» среди игроков и среди GM (итоги — в следующем выпуске). farewell — 1–2 фразы: прощание до следующего понедельника, напомни про пятничный лонгрид Майка. handoff — пустая строка. title — до 70 знаков, без чисел.`,
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
 guest:schema({title:str,paragraphs:paras(2,4),handoff:str}),
 shame:schema({title:str,paragraphs:paras(1,2),prizes:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['nominee','prize','line'],properties:{nominee:str,prize:str,line:str}}},pollLine:str,farewell:str,handoff:str}),
};
// The lengths of each block's words (characters): a block out of them goes back to be fixed.
export const LENGTH={guest:[600,2300],opening:[450,1800],numbers:[900,2900],infirmary:[600,2400],law:[600,2400],mike:[1100,3300],shame:[900,3400]};

// handedOver: the line the previous host gave the word with; notes: the owner's wishes for this issue (a redo).
// guests: the issue's special guests (the guests' list), in every host's sight.
export function segmentMessages(key,facts,{handedOver='',notes='',guests=[]}={}){
 const s=slotOf(key,guests),next=nextOf(key,guests);
 return {system:`${SHOW}\n\n${s.guest?guestVoice(s.guest):VOICES[s.host]}\n\n${COMMON}\n\n${TASKS[kindOf(key)]}`,
  prompt:`Выпуск Inside FBL. Твой блок: ${s.rubric}.\nhandedOver: ${handedOver?`«${handedOver}»`:'—'}\nnext: ${next?`${speaker(next).name} (${next.rubric})`:'— (ты закрываешь выпуск)'}${guests.length?`\nstudioGuests: ${guests.map(g=>`${g.name} (${g.kind==='coach'?'тренер':'легенда НБА'})`).join(', ')}`:''}\n\nДанные:\n${JSON.stringify(facts,null,1)}${notes?`\n\nПожелания редакции к этому выпуску (учти их, правила выше важнее): ${notes}`:''}`};
}
// Every word of a block, for the checks.
export const segmentWords=x=>[x?.title,...(x?.paragraphs||[]),...(x?.afterLongread||[]),x?.quizLine,x?.quizExplanation,x?.verdict,
 ...['best','worst'].flatMap(k=>x?.[k]?[x[k].prologue,...(x[k].qa||[]).flatMap(q=>[q.q,q.a]),x[k].remark]:[]),
 ...(x?.prizes||[]).flatMap(p=>[p.prize,p.line]),x?.pollLine,x?.farewell,x?.handoff].filter(t=>typeof t==='string'&&t.trim()).join('\n');
// The Latin words of a text that are not the data's own (team, GM and club names) nor the show's (FBL, Inside, NBA,
// MVP, GM): the owner wants Russian, the English slang in Russian letters (24.10.2026).
const LATIN_OK=new Set(['fbl','inside','nba','mvp','gm','espn']);
export function latinIn(text,facts){
 const known=new Set(),words=t=>(String(t).match(/[A-Za-z][A-Za-z'’]*/g)||[]).map(w=>w.toLowerCase());
 const walk=v=>{if(typeof v==='string')words(v).forEach(w=>known.add(w));else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(facts);
 return [...new Set(words(text).filter(w=>!LATIN_OK.has(w)&&!known.has(w)))];
}
export const LATIN_FIX='пиши по-русски: термины по-русски, а если русского слова нет — английское русскими буквами (юзадж, клатч, хай-юзадж шутер)';
const ZAK_WORDS=/(?<!\p{L})(карточ\p{L}*|реестр\p{L}*|баз[аеуыо]й? данных|баз[аеуы](?!\p{L})|бот\p{L}{0,3}(?!\p{L})|код(?:а|ом|у|е)?(?!\p{L})|коллекци\p{L}*|айди|id(?!\p{L})|алгоритм\p{L}*|программ\p{L}*|сервер\p{L}*|компьютер\p{L}*|скрипт\p{L}*|записей)/iu;
const ZAK_OFF=/(?<!\p{L})ФО(?!\p{L})|фэнтези-очк|наград|MVP|прогноз/iu;
// What is wrong with a block for its facts ([]: it may go on air). nominees: Steven's prizes of shame, players then GMs.
export function segmentProblems(key,x,facts,{nominees=[],guests=[]}={}){
 const s=SCHEMAS[kindOf(key)];
 if(!x||typeof x!=='object'||s.required.some(k=>x[k]===undefined))return ['ответ не по схеме'];
 const out=[],text=segmentWords(x),allowed=allowedNumbers(facts),stray=strayNumbersIn(text,allowed);
 if(stray.length){const where=text.split(/(?<=[.!?…])\s+|\n+/).filter(t=>strayNumbersIn(t,allowed).length).slice(0,4).map(t=>`«${t.trim().slice(0,160)}»`);
  out.push(`числа не из данных: ${stray.join(', ')} (цифрами или словами, в том числе порядковыми) — вот где: ${where.join('; ')}; перепиши эти фразы без чисел`);}
 const copied=copiedIn(text);if(copied.length)out.push(`дословные фразы старых выпусков: ${copied.join(' | ')} — перепиши`);
 const lat=latinIn(text,facts);if(lat.length)out.push(`латиница не из данных: ${lat.join(', ')} — ${LATIN_FIX}`);
 const stale=staleIn(text);if(stale.length)out.push(`чужая тема — время года и урожай (${stale.join(', ')}): перепиши образами этой недели`);
 const [min,max]=LENGTH[kindOf(key)],n=text.length;
 if(n<min)out.push(`слишком коротко (${n} знаков), нужно хотя бы ${min}`);if(n>max)out.push(`слишком длинно (${n} знаков), нужно не больше ${max}`);
 const next=nextOf(key,guests),to=next&&speaker(next);
 if(next&&!to.calls.some(c=>String(x.handoff||'').includes(c)))out.push(`handoff должен по имени передать слово: ${to.name}`);
 if(key==='zak'||key==='law'){const w=text.match(ZAK_WORDS);if(w)out.push(`Зак Онн говорит о технике («${w[0]}»): скажи это языком дела — подозреваемый, документы, расследование, приговор`);
  const o=text.match(ZAK_OFF);if(o)out.push(`не дело Зака Онна («${o[0]}»): только закон, без очков и наград`);}
 if(key==='numbers'&&facts.quiz&&String(x.quizExplanation||'').length>190)out.push('quizExplanation длиннее 190 знаков');
 if(key==='shame'){const ids=(x.prizes||[]).map(p=>p.nominee);
  if(ids.join()!==nominees.map(n=>n.id).join())out.push(`prizes — ровно по одному на номинанта, по порядку: ${nominees.map(n=>n.id).join(', ')}`);}
 return out;
}
// Written, then sent back with its problems to be fixed (fixes times). {segment, problems, tries}: problems [] when it
// may go on air. claude: scripts/claude-text.mjs claudeJSON (a stand-in in the tests).
export async function writeSegment(key,facts,{handedOver='',notes='',nominees=[],guests=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=300e3,fixes=2,log=console.warn}={}){
 const base=segmentMessages(key,facts,{handedOver,notes,guests}),schema=SCHEMAS[kindOf(key)];
 let {data}=await claude({...base,schema,model,timeoutMs}),problems=segmentProblems(key,data,facts,{nominees,guests}),tries=1;
 while(problems.length&&tries<=fixes){
  log(`Inside FBL show, ${key}: fixing (${problems.join('; ')}).`);
  ({data}=await claude({system:base.system,schema,model,timeoutMs,
   prompt:`${base.prompt}\n\nТвой черновик:\n${JSON.stringify(data)}\n\nИсправь только эти места, остальное оставь как есть, и верни весь JSON заново:\n${problems.map(p=>`- ${p}`).join('\n')}`}));
  problems=segmentProblems(key,data,facts,{nominees,guests});tries++;
 }
 return {segment:data,problems,tries};
}

// --- The pictures: one per block, its prompt written whole by Claude from the block he wrote and its facts. The code
// gives the references: the hosts' faces (people.json: what never changes about them), the players' ESPN faces, the
// GMs' photos, the teams' logos.
const FBL_LOGO=fileURLToPath(new URL('./assets/fbl-logo.png',import.meta.url));
const leagueLogo=()=>({image:readImage(FBL_LOGO),is:'the logo of the league, FBL (Fantasy Brothers League)'});
// The photo of the studio and its cast (owner, 24.10.2026): the show's set and how each host looks at its desk.
export const STUDIO_PHOTO=fileURLToPath(new URL('../scripts/assets/studio/inside-fbl-cast.jpg',import.meta.url));
export const studioRef=(file=STUDIO_PHOTO)=>({image:readImage(file),is:"the photo of the Inside FBL studio and its five hosts at the desk, left to right: Mike Roffon, Christopher Dildo, Steven Ex Pert, Trevor Matolog, Zak Onn: the show's own set (the desk, the brick-wall INSIDE FBL logo, the red and blue lights) and each host's studio look; their faces come from their own references"});
// The references of each block's picture. faces: ESPN id -> headshot ({bytes, name, type}).
// guestFaces: a guest's id -> his photo (his ESPN headshot, else the Wikipedia lead photo), when there is one.
export function segmentCast(key,{d,facts,nominees=[],patients=[],faces=new Map(),guests=[],guestFaces=new Map(),root=ASSETS}={}){
 const slot=slotOf(key,guests);
 if(slot?.guest){const g=slot.guest,face=guestFaces.get(g.id)||null;
  return cast([face?{image:face,is:`the photo of ${g.en}, ${g.kind==='coach'?'the legendary NBA coach':'the NBA legend'}, the special guest of the studio`,need:true}:null,
   {...stevenRef(root),need:false},leagueLogo()]);}
 const face=(a,name,role,t)=>a&&faces.get(String(a))?playerRef(faces.get(String(a)),name,{need:false,role,...Number.isInteger(t)?{fantasyTeamColors:LEAGUE_TEAMS[t]?.kit||null}:{}}):null;
 // The opening and the closing at 18:00: the five hosts and the guests of the issue, revealed now (the announcement's cast
 // has no guests: they are secret at 12:00).
 if(key==='opening'||key==='closing')return cast([stevenRef(root),{...dildoRef(root),is:'the photo of Christopher Dildo, the analyst of Inside FBL'},trevorRef(root),zakRef('check',root),mikeRef(root),leagueLogo(),studioRef(),
  ...guests.map(g=>guestFaces.get(g.id)?{image:guestFaces.get(g.id),is:`the photo of ${g.en}, ${g.kind==='coach'?'the legendary NBA coach':'the NBA legend'}, a special guest of the studio today`,need:true}:null)]);
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
 if(key==='shame'){const pl=nominees.filter(n=>!n.gmNominee).slice(0,2),gm=nominees.filter(n=>n.gmNominee).slice(0,2);
  return cast([stevenRef(root),...pl.map(n=>face(n.a,n.en,`a player nominated for the prize of shame: ${n.kind}`,n.t)),...gm.map(n=>gmRef(n.t,root,{is:`the photo of a GM nominated for the prize of shame: ${n.kind}`,need:false}))]);}
 return cast([]);
}
const PICTURE={
 opening:`Обложка выпуска Inside FBL: студия шоу и круглый стол, за которым все пятеро ведущих (они все в референсах) — каждый собой, с тем, что у него никогда не меняется. Майк Роффон — в студийном пиджаке, без каски, камуфляжа и жилета PRESS. Сцена — из главной истории этой недели (заголовок и текст открытия Стивена): что происходит в студии, кто что держит и над чем все смеются — решаешь ты. Если сегодня в студии гости (studioGuests, их фото в референсах) — они за столом вместе с ведущими, каждый собой и в своём узнаваемом образе: это их выпуск тоже. Студия — наша, как на общем фото студии Inside FBL (оно в референсах: декорации и облик ведущих за столом), без названий и логотипов реальных шоу и каналов; надпись «INSIDE FBL» — по желанию; логотип лиги FBL — по желанию.`,
 numbers:`Картинка к блоку «Цифры недели» Кристофера Дилдо — кадр из фильма о сошедшем с ума математике: Дилдо в кадре, по своему фото, в прямоугольных очках, с блокнотом и ручкой, вокруг его одержимый мир — стены и доски в формулах и графиках, нити между вырезками, и панический страх ФБР (жалюзи, тени агентов, чёрный фургон; агенты никого не трогают, настоящих эмблем ФБР нет). Главная надпись кадра — его «открытие» недели из его блока. GM — если их фото в референсах — могут быть в кадре: ликуют или хватаются за голову.`,
 infirmary:`Картинка к блоку «Обход недели» Тревора Матолога: лазарет лиги, Тревор на обходе, всегда в шейном корсете и с гипсом в автографах, пациенты — по их лицам с референсов, на койках, с повязками по их травмам. Смешно, абсурдно, но без боли и крови.`,
 law:`Картинка к блоку «Закон и порядок» Зака Онна — кадр американского боевика 90-х, где весь сюжет — закон и порядок: дело недели, подозреваемые, документы, допрос, приговор. Зак Онн всегда Юрист, всегда в красной кепке с надписью «God Bless America». GM из референсов — подозреваемые или свидетели его дела, комиссар — когда к месту. Никакой техники: ни экранов, ни кода, ни серверов, ни баз — только дело.`,
 mike:`Картинка к блоку Майка Роффона: его флеш-интервью недели — с лучшим и с худшим игроком (их лица — в референсах): сцена, настроение, колкость — из этих интервью. Майк — ветеран-репортёр, всегда в белых перчатках и с винтажным хромированным микрофоном, одет как спортивный репортёр под сцену. Игроки — в цветах своих фэнтези-команд (fantasyTeamColors), без логотипов НБА.`,
 guest:`Картинка к слову специального гостя студии Inside FBL: гость (его лицо — в референсе, если оно там есть) в сцене из своего блока — в студии за круглым столом или там, куда его унесла собственная история; ведущий Стивен Экс Перт — по желанию. Гость — собой, в своём узнаваемом образе; если его фото в референсах нет — не рисуй его лицо: со спины, силуэтом, в тени или так, чтобы лица не было видно.`,
 closing:`Закрывающая картинка выпуска Inside FBL — финальный кадр после эфира: все пятеро ведущих и гости студии (их фото в референсах), каждый собой. Свет гаснет, эфир окончен, но студия ещё живёт главными историями выпуска: его панчлайнами, «Позором недели», победителями и проигравшими. Что происходит в кадре и в каком стиле — решаешь ты; студия — наша, как на общем фото студии; надпись «INSIDE FBL» и короткая прощальная надпись по-русски — по желанию.`,
 shame:`Картинка к рубрике «Позор недели» Стивена Экс Перта — церемония вручения шуточных призов за позор в студии Inside FBL: Стивен с серьёзным лицом еле сдерживает смех, номинанты — игроки и GM (их лица — в референсах) — получают свои нелепые призы из его текста. Стебём игру и цифры, а не человека. Студия и призы свои, без реальных шоу.`,
};
const PICTURE_SYSTEM=key=>`Ты — бильд-редактор Inside FBL, главного журнала фэнтези-баскетбольной лиги друзей FBL: каждый понедельник ведущие по очереди выходят в эфир со своими блоками, и каждый блок выходит с одной фотореалистичной смешной картинкой. Ты придумываешь её целиком и пишешь её промпт для ChatGPT.
${PICTURE[kindOf(key)]}
- Картинка — из этого блока и этих фактов: его шутки, его образы, его главный момент. Место, сюжет и стиль — каждый раз новые.
- Надписи — только в кавычках, по-русски, заглавными, до 6 слов, не больше двух; числа в них — только из данных.
- Ни реальных телеведущих, ни названий, логотипов и заставок реальных шоу и каналов.

${CRAFT}`;
const brief=(key,x,facts,guests)=>key==='closing'?`Выпуск, который только что закончился (блоки по порядку, их заголовки и первые слова):\n${JSON.stringify(x,null,1)}\n\nДанные выпуска:\n${JSON.stringify(facts,null,1)}`:`Блок «${slotOf(key,guests).rubric}», как его написал ${slotOf(key,guests).guest?'гость':'ведущий'}:\n${segmentWords(x)}\n\nДанные блока:\n${JSON.stringify(facts,null,1)}`;
// Claude's picture of a block ({images, prompt, idea}) or null.
export async function writeSegmentPicture(key,x,facts,c,{guests=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=240e3,log=console.warn}={}){
 return writePicture({system:PICTURE_SYSTEM(key),brief:brief(key,x,facts,guests),c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:`Inside FBL show, ${key}`,log});
}

// --- The polls (Telegram sendPoll): their options are the code's, from the facts.
export function quizPoll(quiz,explanation){
 return quiz&&{question:`🧮 Задачка Дилдо: ${quiz.question}`.slice(0,300),options:quiz.options,type:'quiz',correct_option_id:quiz.correct,
  ...explanation?{explanation:String(explanation).slice(0,200)}:{},is_anonymous:true};
}
export const guestPoll=candidates=>candidates.length>=2?{question:'🎤 К кому Майк Роффон поедет в гости в пятницу?',options:candidates.map(c=>c.label),is_anonymous:true}:null;
// The two votes of shame: {key, poll, names (whom each option stands for: the year's count goes by them)}.
export function shamePolls(nominees){
 const one=(key,list,question)=>list.length>=2?{key,poll:{question,options:list.map(n=>n.option),is_anonymous:true},names:list.map(n=>n.name)}:null;
 return [one('shamePlayer',nominees.filter(n=>!n.gmNominee),'🏆 Позор недели среди игроков: кому лига вручает приз?'),
  one('shameGm',nominees.filter(n=>n.gmNominee),'🏆 Позор недели среди GM: кому лига вручает приз?')].filter(Boolean);
}
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
export function segmentCaption(key,x,week,{guests=[]}={}){
 const s=slotOf(key,guests),h=speaker(s);
 if(key==='opening')return `<b>🎙 Inside FBL • Выпуск ${week.n}</b>\n<b>${esc(unquote(x?.title||'Главный журнал лиги'))}</b>\n<i>Неделя ${week.n} · ${esc(dayRu(week.start))} – ${esc(dayRu(week.end))}</i>\n\nВ студии: ${Object.values(HOSTS).map(v=>esc(v.name)).join(', ')}.${guests.length?`\n🌟 Гости студии: ${guests.map(g=>esc(g.name)).join(', ')}.`:''}\n\n${tags(week,s)}`;
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
export function segmentText(key,x,facts,{nominees=[],guests=[]}={}){
 const s=slotOf(key,guests),h=speaker(s),head=`<b>${h.emoji} ${esc(s.rubric)}</b>\n<i>«${esc(unquote(x.title))}»</i>`;
 let body;
 if(key==='numbers')body=`${ps(x.paragraphs)}${tidy(x.quizLine)?`\n\n🧮 <b>${esc(tidy(x.quizLine))}</b>`:''}`;
 else if(key==='infirmary')body=`${ps(x.paragraphs)}${facts.patients?.length?`\n\n<b>🏥 Лазарет на сегодня (отчёт ESPN)</b>\n${patientLines(facts).join('\n')}`:''}`;
 else if(key==='law')body=`${ps(x.paragraphs)}\n\n<b>📁 Досье на новую неделю</b>\n${dossierLines(facts).join('\n')}${tidy(x.verdict)?`\n\n⚖️ <b>${esc(tidy(x.verdict))}</b>`:''}`;
 else if(key==='mike'){const b=facts.bestOfTheWeek,w=facts.worstOfTheWeek;
  body=[ps(x.afterLongread),b?flashText(b.name,x.best,`лучший игрок недели, ${b.fo} ФО`):null,w?flashText(w.name,x.worst,`худший игрок недели, ${w.fo} ФО`):null,
   tidy(x.pollLine)?`🗳 <b>${esc(tidy(x.pollLine))}</b>`:null,'<i>Интервью вымышленные: цифры настоящие, слова — нет.</i>'].filter(Boolean).join('\n\n');}
 else if(key==='shame'){const by=new Map((x.prizes||[]).map(p=>[p.nominee,p]));
  const prize=n=>{const p=by.get(n.id);return `🏆 <b>Приз «${esc(unquote(p?.prize||n.kind))}»</b> — <b>${esc(n.gmNominee?`GM ${n.name}`:n.name)}</b>${n.gmNominee?` (${esc(n.team)})`:''}: ${esc(n.stat)}${p?.line?`\n${esc(tidy(p.line))}`:''}`;};
  const pl=nominees.filter(n=>!n.gmNominee),gm=nominees.filter(n=>n.gmNominee),yr=facts.shameOfTheYear,fin=facts.seasonFinal;
  const race=list=>list.slice(0,3).map(x=>`${esc(x.name)} — ${x.wins}`).join(' · ');
  body=[ps(x.paragraphs),pl.length?`<b>🧍 Игроки</b>\n\n${pl.map(prize).join('\n\n')}`:null,gm.length?`<b>👔 GM</b>\n\n${gm.map(prize).join('\n\n')}`:null,
   fin?`<b>👑 Позор года</b>\nИгрок: ${fin.player.map(x=>`<b>${esc(x.name)}</b> (${x.wins})`).join(', ')||'—'}\nGM: ${fin.gm.map(x=>`<b>${esc(x.name)}</b> (${x.wins})`).join(', ')||'—'}`
    :yr&&(yr.players.length||yr.gms.length)?`<b>📈 Гонка за «Позор года»</b>${yr.players.length?`\nИгроки: ${race(yr.players)}`:''}${yr.gms.length?`\nGM: ${race(yr.gms)}`:''}`:null,
   tidy(x.pollLine)?`🗳 <b>${esc(tidy(x.pollLine))}</b>`:null,ps([x.farewell])].filter(Boolean).join('\n\n');}
 else if(s.guest)body=`${ps(x.paragraphs)}\n\n<i>Слова гостя вымышлены: цифры настоящие, слова — нет.</i>`;
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
export function showNodes(week,segments,{guests=[]}={}){
 const out=[node('p',node('i',`Главный журнал лиги FBL. Неделя ${week.n}: ${dayRu(week.start)} – ${dayRu(week.end)}. В студии: ${Object.values(HOSTS).map(h=>h.name).join(', ')}${guests.length?`; гости студии: ${guests.map(g=>g.name).join(', ')}`:''}.`))];
 for(const s of segments){
  // The closing picture: the last of the page.
  if(s.key==='closing'){if(s.picture)out.push(node('figure',{tag:'img',attrs:{src:s.picture}},node('figcaption','Конец выпуска')));continue;}
  const r=slotOf(s.key,guests),h=speaker(r);
  out.push(node('h3',`${h.emoji} ${r.rubric} — ${h.name}`));
  if(s.picture)out.push(node('figure',{tag:'img',attrs:{src:s.picture}}));
  if(s.title)out.push(node('p',node('b',`«${unquote(s.title)}»`)));
  // The live studio's lines (s.steps) as quotes between the host's words; the host's first words without their heading.
  const steps=s.steps||[{text:s.text}];let first=true;
  for(const st of steps){
   if(st.poll){out.push(node('blockquote',`🗳 ${st.poll.poll.question}\n${st.poll.poll.options.map(o=>`• ${o}`).join('\n')}\nГолосование — в чате лиги.`));continue;}
   if(st.studio){out.push(node('blockquote',...inline(st.text.replace(/\n/g,' '))));continue;}
   out.push(...htmlToNodes(first?st.text.split('\n\n').slice(1).join('\n\n'):st.text));first=false;
  }
  for(const c of s.cards||[])out.push(node('figure',{tag:'img',attrs:{src:c}}));
  if(!s.steps)for(const p of s.polls||[])out.push(node('blockquote',`🗳 ${p.question}\n${p.options.map(o=>`• ${o}`).join('\n')}\nГолосование — в чате лиги.`));
 }
 out.push(node('p',node('i','Inside FBL выходит по понедельникам. Цифры настоящие, ФО по формуле лиги; слова и интервью — вымышленные.')));
 return out;
}
export const showTitle=(week,x)=>`Inside FBL — выпуск ${week.n}: ${unquote(x?.title||'главный журнал лиги')}`.slice(0,256);

// --- Choosing the guests. Claude picks one or two from the guests' list who fit the week's stories (a centre's week for
// a great centre, a week of bricks for a famous shooter, a coach for a GM's blunder), none of the last GUEST_REPEAT_WEEKS
// issues; the owner may name them himself (force). Answers the guests, or the first fitting by the week's number when
// Claude cannot choose: a show always has its guest.
export const guestPool=(recent=[])=>{const seen=new Set(recent);return GUESTS.filter(g=>!seen.has(g.id));};
export const GUEST_PICK_SCHEMA={type:'object',additionalProperties:false,required:['guests'],properties:{guests:{type:'array',minItems:1,maxItems:MAX_GUESTS,
 items:{type:'object',additionalProperties:false,required:['id','why'],properties:{id:str,why:str}}}}};
export function guestPickMessages(digest,pool){
 return {system:`${SHOW}\n\nТы — шеф-редактор Inside FBL. В каждый выпуск можно пригласить специальных гостей студии — живых легенд НБА и легендарных тренеров, не больше двух. Они обсуждают результаты нашей лиги в своём узнаваемом стиле и стебут или поощряют, как эксперты. Выбери одного или двух гостей из списка, кому есть что сказать именно об этой неделе (её истории, герои и провалы, сделки GM, праздник), и так, чтобы вместе они давали контраст и спор. Только id из списка. Ответь только JSON по схеме: {"guests": [{"id": "...", "why": "почему он, одной фразой"}]}.`,
  prompt:`Неделя лиги:\n${JSON.stringify(digest,null,1)}\n\nГости, которых можно пригласить (id, кто, чем известен, манера):\n${JSON.stringify(pool.map(g=>({id:g.id,name:g.name,kind:g.kind,known:g.known,style:g.style})),null,1)}`};
}
export async function pickShowGuests(digest,{recent=[],force=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=180e3,n=1,log=console.warn}={}){
 const forced=force.map(guestById).filter(Boolean).slice(0,MAX_GUESTS);
 if(forced.length)return forced;
 const pool=guestPool(recent);if(!pool.length)return [];
 try{const {data}=await claude({...guestPickMessages(digest,pool),schema:GUEST_PICK_SCHEMA,model,timeoutMs});
  const ids=[...new Set((data?.guests||[]).map(x=>x.id))].map(id=>pool.find(g=>g.id===id)).filter(Boolean).slice(0,MAX_GUESTS);
  if(ids.length){for(const x of data.guests)if(ids.some(g=>g.id===x.id))log(`Inside FBL show: guest ${x.id} (${x.why}).`);return ids;}
  log('Inside FBL show: Claude named no guest of the list.');}
 catch(e){log(`Inside FBL show: no guests chosen by Claude (${e.message}).`);}
 return [pool[(n-1)%pool.length]];
}
// Whether a guest is alive and his photo, by his Wikipedia article (the summary's description and first lines: «(born
// 1976)», or a life's span «(1952–2024)»). {alive: true, false, or null when Wikipedia could not tell, photo: URL or null}.
export function lifeOf(summary){
 const desc=String(summary?.description||''),lead=String(summary?.extract||'').slice(0,400);
 if(/\(\s*\d{4}\s*[–—-]\s*\d{4}\s*\)/.test(desc)||/\([^()]*\d{4}\s*[–—-]\s*[^()]*\d{4}\)/.test(lead)||/\b(was|were) an? [^.]*\b(player|coach)\b/.test(lead.split('.')[0]||''))return false;
 if(/\bborn\b/i.test(desc)||/\(born\b/.test(lead)||/\b(is|are) an? /.test(lead.split('.')[0]||''))return true;
 return null;
}
export async function guestCheck(g,{fetchImpl=fetch}={}){
 try{
  const r=await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(g.wiki)}`,{headers:{'user-agent':'FBL-league-bot/1.0 (Inside FBL; github.com/RuslanMunasipov/Nba-draft-simulator)'},signal:AbortSignal.timeout(20e3)});
  if(!r.ok)return {alive:null,photo:null};
  const x=await r.json();return {alive:lifeOf(x),photo:x.originalimage?.source||x.thumbnail?.source||null};
 }catch{return {alive:null,photo:null};}
}

// --- The announcement at 12:00: the photo of the studio's recording with the guests kept secret (easter eggs for those
// who guess them) and the issue's topics, posted by the host's bot. Written by Claude in Steven's voice from the blocks
// the hosts wrote; the guests are never named in it, nor in its picture's prompt.
// segments: [{key, x (the block)}]; holiday: holidays.js holidaysBetween's first, or null.
export function announceFacts(week,{segments=[],guests=[],holiday=null}){
 return {week:`неделя ${week.n}, ${dayRu(week.start)} – ${dayRu(week.end)}`,airsAt:'сегодня в 18:00 по Москве',holiday:holiday?.name||null,
  blocks:segments.map(s=>({...saidOf(s.key,s.x,guests)})),
  secretGuests:guests.map(g=>({who:g.kind==='coach'?'легендарный тренер НБА':'легенда НБА',known:g.known,realName:g.name}))};
}
export const ANNOUNCE_SCHEMA={type:'object',additionalProperties:false,required:['title','topics','guestHints','teaser'],properties:{
 title:str,topics:{type:'array',minItems:3,maxItems:5,items:str},guestHints:{type:'array',minItems:0,maxItems:MAX_GUESTS,items:str},teaser:str}};
export function announceMessages(facts){
 return {system:`${SHOW}\n\n${VOICES.steven}\n\n${COMMON}\n\nТвой текст — анонс сегодняшнего выпуска в чате лиги, он выходит в полдень, сам выпуск — в 18:00. title — заголовок анонса до 70 знаков, без чисел. topics — 3–5 тем выпуска из блоков ведущих (blocks), каждая — одна интригующая фраза до 120 знаков, без спойлеров развязки. guestHints — по одной загадке на каждого секретного гостя (secretGuests), до 120 знаков: намёк на его карьеру и стиль, по которому знатоки угадают, но НИКОГДА не его имя, фамилия, прозвище или клуб в названии. teaser — одна фраза, которой ты зовёшь всех к 18:00. Без handoff.`,
  prompt:`Анонс выпуска Inside FBL. Данные:\n${JSON.stringify(facts,null,1)}`};
}
// The words that would give a guest away: his names in both languages, his surname, how he is called.
export function guestWords(guests){
 const out=new Set();
 for(const g of guests){for(const n of [g.name,g.en,...g.calls||[]]){if(!n)continue;out.add(n);const parts=n.split(/\s+/);if(parts.length>1&&parts.at(-1).length>=4)out.add(parts.at(-1));}}
 return [...out].filter(w=>w.length>=3);
}
// A name in any case of Russian (Шака, Шаку, Шаком), never a longer word that starts like it (Филадельфия).
const giveaway=(text,guests)=>guestWords(guests).filter(w=>new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:а|у|ом|е|ы|ов|ам|ами|ах|'s)?(?![\\p{L}])`,'iu').test(String(text)));
export function announceProblems(x,facts,guests,week){
 if(!x||!Array.isArray(x.topics)||typeof x.title!=='string')return ['ответ не по схеме'];
 const out=[],text=[x.title,...x.topics,...x.guestHints||[],x.teaser].join('\n'),factsNoNames={...facts,secretGuests:facts.secretGuests.map(({realName,...g})=>g)};
 const stray=strayNumbersIn(text,allowedNumbers(factsNoNames));if(stray.length)out.push(`числа не из данных: ${stray.join(', ')} — перепиши без них`);
 const leak=giveaway(text,guests);if(leak.length)out.push(`гости секретные: в анонсе их не называют (${leak.join(', ')}) — только намёки`);
 const lat=latinIn(text,factsNoNames);if(lat.length)out.push(`латиница не из данных: ${lat.join(', ')} — ${LATIN_FIX}`);
 if((x.guestHints||[]).length!==guests.length)out.push(`guestHints — ровно по одной загадке на гостя: ${guests.length}`);
 const stale=staleIn(text);if(stale.length)out.push(`чужая тема — время года и урожай (${stale.join(', ')})`);
 if(announceCaption(x,week,guests).length>1024)out.push('анонс длиннее подписи к фото Telegram: сократи темы');
 return out;
}
export function announceCaption(x,week,guests=[]){
 return [`<b>🎙 Inside FBL • Анонс выпуска ${week.n}</b>`,`<b>${esc(unquote(x.title))}</b>`,`<i>Сегодня в 18:00 по Москве — главный журнал лиги.</i>`,'',
  '<b>🔥 В выпуске:</b>',...x.topics.map(t=>`• ${esc(tidy(t))}`),
  ...guests.length?['',`<b>🕵️ ${guests.length>1?'Секретные гости':'Секретный гость'} студии:</b>`,...(x.guestHints||[]).map(t=>`• ${esc(tidy(t))}`)]:[],
  '',`<i>${esc(tidy(x.teaser))}</i>`,'',`#inside_fbl #неделя_${week.n} #анонс`].join('\n');
}
export async function writeAnnouncement(facts,guests,week,{claude=claudeJSON,model=SHOW_MODEL,timeoutMs=180e3,fixes=2,log=console.warn}={}){
 const base=announceMessages(facts);
 let {data}=await claude({...base,schema:ANNOUNCE_SCHEMA,model,timeoutMs}),problems=announceProblems(data,facts,guests,week),tries=1;
 while(problems.length&&tries<=fixes){
  log(`Inside FBL announcement: fixing (${problems.join('; ')}).`);
  ({data}=await claude({system:base.system,schema:ANNOUNCE_SCHEMA,model,timeoutMs,prompt:`${base.prompt}\n\nТвой черновик:\n${JSON.stringify(data)}\n\nИсправь только эти места и верни весь JSON заново:\n${problems.map(p=>`- ${p}`).join('\n')}`}));
  problems=announceProblems(data,facts,guests,week);tries++;
 }
 return {announcement:data,problems,tries};
}
// Its picture: the five hosts at the studio's recording (their references), the guests there but unrecognisable, with
// easter eggs of their careers; a new idea, look and style every week (the holiday, the guests' theme: the hosts may be
// dressed for it), the ideas of the last weeks given so that none comes back. Its prompt never names a guest.
export const announceCast=(root=ASSETS)=>segmentCast('opening',{root});
const ANNOUNCE_PICTURE=`Ты — бильд-редактор Inside FBL, главного журнала фэнтези-баскетбольной лиги друзей FBL. В полдень в чат лиги выходит анонс вечернего выпуска с одной картинкой — фото со студийной записи: пятеро ведущих (их лица — в референсах) и засекреченные гости выпуска. Ты придумываешь её целиком и пишешь её промпт для ChatGPT.
- Гости в кадре, но неузнаваемы — как именно их спрятать, решаешь ты. Рядом с ними — пасхалки: предметы, по которым знатоки угадают, кто это (из их карьеры и стиля). Никогда не называй гостей в промпте — ни имени, ни фамилии, ни прозвища: только образы и предметы.
- Общее фото студии Inside FBL (в референсах) — наши декорации и облик ведущих: от него можно оттолкнуться, а можно уйти в совсем другой мир и стиль.
- Каждую неделю — новая идея, новый вид и новый стиль: что угодно (владелец лиги вспоминал выпуск с фигурками LEGO — получилось очень стильно; это пример свободы, а не шаблон). Ведущих можно переодеть под праздник (holiday) или под тему гостей; то, что у каждого никогда не меняется (neverChanges), остаётся.
- Не повторяй идеи прошлых анонсов (recentIdeas).
- Надписи — только в кавычках, не больше двух коротких, без имён гостей; числа в них — только из данных.
- Ни реальных телеведущих, ни названий, логотипов и заставок реальных шоу и каналов.

${CRAFT}`;
export async function writeAnnouncePicture(x,facts,c,{guests=[],recent=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=240e3,log=console.warn}={}){
 const brief=`Анонс выпуска:\n${[x.title,...x.topics,...x.guestHints||[],x.teaser].join('\n')}\n\nДанные:\n${JSON.stringify({...facts,recentIdeas:recent.slice(-10)},null,1)}`;
 const check=t=>{const p=promptProblems(t,c,{numbers:allowedNumbers(facts)}),leak=giveaway(t,guests);return leak.length?[...p,`the guests are secret: never name them in the prompt (${leak.join(', ')}), only hint with objects`]:p;};
 return writePicture({system:ANNOUNCE_PICTURE,brief,c,check,write:claude,model,timeoutMs,label:'Inside FBL announcement',log});
}

// --- The live studio (owner, 24.10.2026): the hosts and the guests interrupt one another mid-block and, after a block,
// tease its verdicts and choices with trash talk; the one who spoke answers back. Written by Claude in one pass over the
// whole show once its blocks are written, so the jokes can run through it. Each line from the bot of whoever says it.
// Who may speak: the hosts by their key, a guest by his block's key (guest1, guest2).
export function studioCast(guests=[]){
 const out=Object.entries(HOSTS).map(([who,h])=>({who,name:h.name,role:h.role,bot:who}));
 rundownOf(guests).filter(s=>s.guest).forEach(s=>out.push({who:s.key,name:s.guest.name,role:speaker(s).role,bot:'steven',style:s.guest.style}));
 return out;
}
const speakerKey=s=>s.guest?s.key:s.host;
const BANTER_LINE=220;
const line={type:'object',additionalProperties:false,required:['who','line','answer'],properties:{who:str,line:str,answer:str}};
export const BANTER_SCHEMA={type:'object',additionalProperties:false,required:['blocks'],properties:{blocks:{type:'array',items:{type:'object',additionalProperties:false,required:['key','interrupt','reactions'],properties:{
 key:str,interrupt:{type:'object',additionalProperties:false,required:['after','who','line','comeback'],properties:{after:{type:'integer'},who:str,line:str,comeback:str}},
 reactions:{type:'array',maxItems:2,items:line}}}}}};
// The paragraphs of a block where it may be interrupted.
const parasOf=x=>x?.paragraphs||x?.afterLongread||[];
export function banterMessages(segments,guests=[]){
 const people=studioCast(guests),slots=segments.map(s=>({key:s.key,speaker:speakerKey(slotOf(s.key,guests)),rubric:slotOf(s.key,guests).rubric,title:s.x.title,paragraphs:parasOf(s.x),
  ...s.key==='mike'?{interviews:[s.x.best,s.x.worst]}:{},...s.key==='shame'?{prizes:s.x.prizes}:{}}));
 return {system:`${SHOW}\n\nТы — режиссёр живой студии Inside FBL. Блоки ведущих уже написаны; твоя задача — сделать из них живой эфир за круглым столом: ведущие и гости перебивают друг друга, подкалывают чужие оценки и выбор, добавляют трэш-ток, а тот, кому досталось, огрызается в ответ.
Кто в студии (who — ключ, им подписываешь реплику):
${people.map(p=>`- ${p.who}: ${p.name}, ${p.role}${p.style?`. Манера: ${p.style}`:''}`).join('\n')}
Голоса ведущих: Стивен — уверенный эксперт студии с театральным возмущением; Кристофер Дилдо — злобный ботан, высмеивает всех цифрами; Тревор Матолог — пьяный безумный гений медицины, бормочет и икает; Зак Онн — юрист из боевика 90-х, говорит только о законе, о себе в третьем лице, без очков и наград, ни слова о технике; Майк Роффон — хлёсткий ветеран-репортёр с сухими штампами. Гости — в своей манере.
Правила:
- Для каждого блока (key) — interrupt: кто-то перебивает ведущего посреди блока (after — после скольких абзацев paragraphs, от 1 до их числа минус 1; who — не сам ведущий блока; line — реплика, которой он вклинивается; comeback — короткий ответ ведущего блока, после которого он продолжает). Перебивай только там, где это смешно: в двух–четырёх блоках за выпуск; в остальных interrupt.who — пустая строка.
- reactions — одна-две реплики с места после блока: подколоть оценку или выбор ведущего, добавить трэш-тока, поспорить или неожиданно поддержать; answer — ответ ведущего блока (или пустая строка). who — не сам ведущий блока.
- Каждая реплика — одна-две фразы, до ${BANTER_LINE} знаков, в голосе того, кто говорит. Цепляйся за конкретные слова и цифры блока. Перекидывайтесь шутками через весь выпуск.
- Стебём игру, цифры, оценки и решения, а не человека: ни слова о внешности, теле, происхождении, семье, здоровье.
- Числа — только те, что есть в блоках; никаких своих.
- Только по-русски: никакой латиницы, кроме названий команд и имён GM, как в блоках; английские словечки — русскими буквами.
- Ответь только JSON по схеме.`,
  prompt:`Выпуск, блоки по порядку эфира:\n${JSON.stringify(slots,null,1)}`};
}
// Claude's studio, line by line: a line out of the rules is left out (a number not of the show, Latin, Zak off his law,
// a speaker answering himself, too long). allFacts: every block's facts. Answers key -> {interrupt, reactions}.
export function studioLines(raw,segments,allFacts,guests=[]){
 const present=new Set(studioCast(guests).map(p=>p.who)),allowed=allowedNumbers(allFacts),out={};
 const ok=(who,text)=>{const t=tidy(text);if(!t||t.length>BANTER_LINE+40)return null;
  if(strayNumbersIn(t,allowed).length||latinIn(t,allFacts).length||staleIn(t).length)return null;
  if(who==='zak'&&(ZAK_WORDS.test(t)||ZAK_OFF.test(t)))return null;return t;};
 let interrupts=0;
 for(const b of raw?.blocks||[]){
  const seg=segments.find(s=>s.key===b.key);if(!seg)continue;
  const me=speakerKey(slotOf(seg.key,guests)),n=parasOf(seg.x).length,r={interrupt:null,reactions:[]};
  const i=b.interrupt;
  if(i&&i.who&&i.who!==me&&present.has(i.who)&&Number.isInteger(i.after)&&i.after>=1&&i.after<n&&interrupts<4){
   const l=ok(i.who,i.line),c=ok(me,i.comeback);if(l&&c){r.interrupt={after:i.after,who:i.who,line:l,comeback:c};interrupts++;}}
  for(const x of (b.reactions||[]).slice(0,2)){if(!x.who||x.who===me||!present.has(x.who))continue;const l=ok(x.who,x.line);if(!l)continue;
   r.reactions.push({who:x.who,line:l,answer:x.answer?ok(me,x.answer)||'':''});}
  out[seg.key]=r;
 }
 return out;
}
export async function writeStudio(segments,allFacts,{guests=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=300e3,log=console.warn}={}){
 try{const {data}=await claude({...banterMessages(segments,guests),schema:BANTER_SCHEMA,model,timeoutMs});return studioLines(data,segments,allFacts,guests);}
 catch(e){log(`Inside FBL show: no live studio (${e.message}).`);return {};}
}
// The studio's lines as they go out: who says it (his bot, his name) and the words (Telegram HTML). speakers: who -> name.
export const studioName=(who,guests=[])=>studioCast(guests).find(p=>p.who===who)?.name||who;
export const studioBot=(who,guests=[])=>studioCast(guests).find(p=>p.who===who)?.bot||'steven';
export const interruptText=(who,line,guests)=>`⚡️ <b>${esc(studioName(who,guests))}</b> перебивает:\n${esc(line)}`;
export const reactionText=(who,line,guests)=>`💬 <b>${esc(studioName(who,guests))}:</b> ${esc(line)}`;
export const answerText=(who,line,guests)=>`↩️ <b>${esc(studioName(who,guests))}:</b> ${esc(line)}`;
// A block's text cut where it is interrupted: [before, after] (after begins with the speaker's comeback), or null.
export function splitForInterrupt(text,x,interrupt){
 const p=parasOf(x)[interrupt.after-1];if(!p)return null;
 const mark=esc(tidy(p)),i=text.indexOf(mark);if(i<0)return null;
 const a=text.slice(0,i+mark.length).trim(),b=text.slice(i+mark.length).trim();
 return b?[a,`<i>${esc(interrupt.comeback)}</i>\n\n${b}`]:null;
}
// A block on air as its messages after its picture, each a reply to the one before: [{by: the bot (a host key), text,
// main: the block's own last words (the opening's buttons go there)} | {by, poll: {key, poll, names}}]. key, host, text,
// x: the block; studio: studioLines' for it; polls: its polls.
export function blockSteps({key,host,text,x,studio=null,polls=[],guests=[]}){
 const me=speakerKey(slotOf(key,guests)),out=[],i=studio?.interrupt,cut=i&&splitForInterrupt(text,x,i);
 if(cut)out.push({by:host,text:cut[0]},{by:studioBot(i.who,guests),text:interruptText(i.who,i.line,guests),studio:true},{by:host,text:cut[1],main:true});
 else out.push({by:host,text,main:true});
 for(const r of studio?.reactions||[]){
  out.push({by:studioBot(r.who,guests),text:reactionText(r.who,r.line,guests),studio:true});
  if(r.answer)out.push({by:host,text:answerText(me,r.answer,guests),studio:true});
 }
 for(const p of polls)out.push({by:host,poll:p});
 return out;
}

// --- The closing picture after the show (owner, 24.10.2026): the studio after the broadcast, the hosts and the guests,
// the issue's punchlines; its prompt written whole by Claude from the whole show. segments: [{key, x}]; facts: the
// opening's and the shame's (the numbers its words may carry). Answers {images, prompt, idea} or null.
export async function writeClosingPicture(segments,facts,c,{guests=[],claude=claudeJSON,model=SHOW_MODEL,timeoutMs=240e3,log=console.warn}={}){
 const x=segments.map(s=>saidOf(s.key,s.x,guests));
 return writePicture({system:PICTURE_SYSTEM('closing'),brief:brief('closing',x,facts,guests),c,check:t=>promptProblems(t,c,{numbers:allowedNumbers(facts)}),write:claude,model,timeoutMs,label:'Inside FBL show, closing',log});
}
export const closingCaption=(week,guests=[])=>`<b>🎬 Inside FBL • Конец выпуска ${week.n}</b>\nЭфир окончен. Спасибо ${guests.length?`гостям студии — ${guests.map(g=>esc(g.name)).join(' и ')} — и `:''}всей лиге.\nДо понедельника! А в пятницу — большое интервью Майка Роффона.\n\n#inside_fbl #неделя_${week.n}`;

// --- The votes of a show, closed together on Friday morning (owner, 24.10.2026): one message for the league with all their
// results, never a message a vote. closed: key -> {result: pollWinner's or null, poll: Telegram's stopped Poll or null}
// (numbers: Dildo's quiz, mike: whom Mike visits, shamePlayer, shameGm).
const lead=t=>String(t||'').split(' — ')[0].trim();
export function votesSummary(week,closed){
 const res=k=>closed[k]?.result,line=(icon,label,k,what=lead)=>{const r=res(k);if(!closed[k])return null;
  return `${icon} ${label}: ${r?`<b>${esc(what(r.option))}</b> (${r.votes} из ${r.total})`:'голосов нет'}`;};
 const q=closed.numbers?.poll,qi=q?.correct_option_id,quiz=q&&Number.isInteger(qi)?`🧮 Задачка Дилдо: верный ответ — <b>${esc(q.options[qi].text)}</b>, угадали ${q.options[qi].voter_count} из ${q.total_voter_count}`:null;
 const rows=[line('🎤','В пятницу Майк Роффон едет в гости к','mike'),line('🏆','Позор недели среди игроков','shamePlayer',t=>t),line('🏆','Позор недели среди GM','shameGm',t=>t),quiz].filter(Boolean);
 return rows.length?[`🗳 <b>Inside FBL • Итоги голосований выпуска ${week.n}</b>`,'',...rows,'','Опрос завершён, всем спасибо!','',`#inside_fbl #неделя_${week.n} #итоги_голосования`].join('\n'):null;
}
