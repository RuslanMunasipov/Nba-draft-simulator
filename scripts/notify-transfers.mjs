// Transfer alerts for one FBL team, sent to Telegram when something new appears on the market,
// a verdict on every new transfer of the other teams (and whether to grab the player they let go), a confirmation of
// each of my own transfers,
// and injured free agents (out, not day-to-day) about to return or just back, once per injury.
// Usage: notify-transfers.mjs <sports-current.json> <notify-state.json>
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (without them the message is only printed), FBL_TEAM (default 0).
import fs from 'node:fs';
import path from 'node:path';
import {seasonRosters,bank,offSportsBank,unreported,dealEvents,reportedEvents,journalEvents,capEvents,transfersThisWeek,moscowToday,marketAlerts,bestPackage,parseInjuries,current,allTransfers,transferVerdict,perGame,acquisition,injuredTargets,gameWeeks,withMarket,withBoxScores,explainSwap,CONFIDENT,DOUBTFUL,WEEKLY_TRANSFERS} from '../src/season.js';
import {packageVerdict,dealGroups,takenIds,contestedBy,transferWindow,confidencePercent,confidenceLevel} from '../src/season.js';
import {transferPlan,planValue} from '../src/transfer-plan.js';
import {count,injuryStatus} from '../src/format.js';
// ESPN's status of a report in Russian («Не играет», «Под вопросом»).
const statusRu=i=>injuryStatus(i?.status).label.toLowerCase();
import {signed} from './telegram-format.mjs';
import {playerInsights} from '../src/insights.js';
import {teamLabel} from '../src/teams.js';
import {fblTransfers} from '../src/rules.js';
import {fetchLiveGames} from '../src/live.js';
import {esc,gains,moveLines,details,message,sender,moscow,injuryFeed,injuryWarning,hasInjuryRows,outUntil,isOut,returnHead,returnKey,warnedFor,stillInjured} from './telegram-format.mjs';
const [livePath,statePath]=process.argv.slice(2);
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/';
const RAW='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/';
const team=Number(process.env.FBL_TEAM||0),sort='month';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();};
const raw=JSON.parse(fs.readFileSync(livePath,'utf8'));
const db=process.env.DB_PATH?JSON.parse(fs.readFileSync(process.env.DB_PATH,'utf8')):await json(SITE+'data/default-draft.json');
// The league log from this checkout: the watcher hands over to a new run whenever main moves, so a white-rule decision
// counts within minutes, and a failed download can never judge on an older list.
const league=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
// A watcher that runs for hours keeps the state locally: the published copy can lag behind the raw-file cache.
const previous=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):await json(RAW+'data/season-live/notify-state.json').catch(()=>({sent:[],injuries:[]}));
const players=withMarket(db.players,raw),byId=new Map(players.map(p=>[p.id,p])),today=moscowToday();
const {transfers,warnings}=allTransfers(players,raw,league);
// The messages quote FBL points only (the Yahoo formula): season.js counts a played row by its box line, never by
// Sports.ru's ФО. As in the app (season-ui scoreBoxes, the clubs of the FBL rosters), finished games are scored from the
// ESPN box scores and a running one waits for the final whistle; without ESPN the rows stay as the collector published
// them, as the app's do.
const rosters=seasonRosters(transfers),live=withBoxScores(raw,await fetchLiveGames(new Set(rosters.flat().map(id=>byId.get(id)?.team).filter(Boolean))).catch(()=>[]),players);
// The collector's ESPN injury report; when its fetch failed, one more try from here, then the report it kept (old, and
// said so) — never an empty one that reads as "everyone is healthy": an answer that lists nobody is the broken feed the
// collector refused, so the kept report stays, with its warning.
let injuryState=injuryFeed(live);
if(!injuryState.fresh){const now=await json('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries').catch(()=>null),at=new Date().toISOString();
 if(hasInjuryRows(now))injuryState={feed:{...now,fetchedAt:at},fresh:true,fetchedAt:at};}
// now: a game that has tipped off can no longer be gained by a move, even before its score or box line is in.
const ctx={players,live,injuries:parseInjuries(injuryState.feed),today,now:Date.now(),rosters,transfers,white:new Set((league.white||[]).map(String).filter(x=>!x.startsWith('none:')))};
const bankOf=t=>{const x=live.teams?.[t];return Number.isFinite(x?.balance)?x.balance+offSportsBank(t,transfers):Number.isFinite(league.banks?.[t])?league.banks[t]:bank(t,transfers,id=>live.players[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0);};
// Both limits bind: Sports.ru's own weekly count (∞ in pre-season) and the FBL week (pre-season moves are free).
const leftOf=t=>{const x=live.teams?.[t],sports=x?.transfersUnlimited?Infinity:Number.isFinite(x?.transfersLeft)?x.transfersLeft:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(transfers,t,today,gameWeeks(live)));
 return Math.min(sports,fblTransfers(transfers,t,today).left);};
const money=bankOf(team),left=leftOf(team);
for(const w of warnings)console.log('warning:',w.team+1,w.message);
const budget=warnings.filter(w=>w.team>=0&&/превышен/.test(w.message));
// With no transfers left a single upgrade cannot be made: not news, and its key waits for the new week.
// Only upgrades that pay for their transfer by the assistant's rule (src/transfer-plan.js planValue).
const alerts=left>0?marketAlerts(ctx,{team,bankMoney:money,sort,minGain:20}).filter(a=>planValue(a.gain,undefined,ctx)>0):[];
// The same decision as the app's recommendation card (src/transfer-plan.js transferPlan): a new move starts a message.
const plan=transferPlan(ctx,{team,bankMoney:money,left,bankOf,leftOf}),pack=plan.action==='move'?plan:null,packWhy=pack?.why.season;
// Transfers count only from 08:00 to 22:00 Moscow time: outside them the advice says when to make the move.
const hours=transferWindow(),when=hours.open?'':` · сделать с ${hours.from} МСК`;
// Other FBL teams the model also tells to buy a player of the package: the first buyer gets him. A team with no transfers
// left this week cannot buy him first.
const rivalsFor=id=>contestedBy(ctx,{team,playerId:id,bankOf,sort}).filter(t=>leftOf(t)>0);
const hurt=ctx.rosters[team].map(id=>byId.get(id)).filter(p=>p&&ctx.injuries.get(String(p.espnId)))
 .map(p=>{const i=ctx.injuries.get(String(p.espnId));return {key:`${p.id}:${i.status}:${i.returnDate}`,text:`${p.name} — ${statusRu(i)}${outUntil(i)}`};});
const keys=[...budget.map(w=>'budget:'+w.message),...alerts.map(a=>`${a.outId}>${a.player.id}`),...(pack?[pack.pairs.map(x=>`${x.out.id}>${x.in.id}`).sort().join('+')]:[])];
// Injuries of my roster are news only from a fresh report: an old or missing one neither adds nor clears them.
const fresh=keys.filter(k=>!previous.sent?.includes(k)),freshHurt=injuryState.fresh?hurt.filter(h=>!previous.injuries?.includes(h.key)):[];
const day=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';
const link=`<a href="${SITE}">Открыть помощника</a>`;
const swapPairs=x=>[{out:current(byId.get(x.outId),ctx).name,in:x.player.name}];
// How sure the model is about a deal over the season, and the main caveats, for the collapsed details.
const dealPairs=d=>d.pack?d.pack.pairs.map(q=>[q.out.id,q.in.id]):[[d.swap.outId,d.swap.player.id]];
// The app's rounding (down) and the level of that percent: "70%" never comes with "умеренно".
const sureness=why=>{const l=confidenceLevel(why.confidence);return `Уверенность ${confidencePercent(why.confidence)}%${why.edge?', что с ним лучше, чем без него':''}: ${l==='CONFIDENT'?'уверенно':l==='MODERATE'?'умеренно':'сомнительно'}`;};
const whyLines=why=>[sureness(why),`Откуда: ${Math.round(why.parts.perGame)} ФО/матч · ${Math.round(why.parts.availability)} доля матчей · ${Math.round(why.parts.schedule)} календарь`,...why.flags.slice(0,3).map(f=>'⚠️ '+esc(f))];
// Latest ESPN fantasy news headline of a player from the last three days, if any.
const news=new Map();
async function headline(p){
 if(!p?.espnId)return null;
 if(!news.has(p.espnId))news.set(p.espnId,json(`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=1&playerId=${p.espnId}`).then(d=>d.feed?.[0]||null).catch(()=>null));
 const n=await news.get(p.espnId);if(!n)return null;
 return Date.now()-Date.parse(n.published||n.lastModified)<3*864e5?`📰 ${esc(n.headline)}`:null;
}
// A deal for my team: the gain, then the numbered moves. A package also says what the player himself adds over the best
// use of the same transfers without him: the other moves are no reason to buy him.
const edgeLine=d=>Number.isFinite(d.edge)?[`Сам игрок: ${signed(d.edge)} ФО за сезон к лучшему ходу без него`]:[];
const dealLines=d=>d.pack?[gains(d.pack.gains.season,d.pack.gains.month),...edgeLine(d),...moveLines(d.pack.pairs.map(q=>({out:q.out.name,in:q.in.name})),d.pack.bankAfter)]
 :[gains(d.swap.gain.season,d.swap.gain.month),...moveLines(swapPairs(d.swap),d.swap.bankAfter)];
// One pro and one risk from the player cards, with the current per-game estimate and injury.
async function brief(p){
 if(!p)return [];
 const {pros,cons}=playerInsights(p,players),injury=ctx.injuries.get(String(p.espnId)),n=await headline(p);
 return [`<b>${esc(p.name)}</b> · ${perGame(p,live.players?.[p.sportsId]).value.toFixed(1)} ФО/матч${injury?` · 🩹 ${esc(statusRu(injury))}`:''}`,
  ...pros.slice(0,1).map(x=>'✅ '+esc(x)),...cons.slice(0,1).map(x=>'⚠️ '+esc(x)),...(n?[n]:[])];
}

// My team: the best move first, then single upgrades, budget problems and injuries.
const mine=[`🏀 <b>${esc(teamLabel(team))}</b>`,`Банк ${money} · трансферов ${left}/${WEEKLY_TRANSFERS}`];
// The assistant's answer (src/transfer-plan.js, the same as the app's): the move with its gains over the week, 4 weeks and
// the season, its calibrated confidence, the main risks, what would change it and the best alternative; or «держать».
const horizonsLine=g=>`${signed(g.week)} за неделю · ${signed(g.month)} за 4 нед. · ${signed(g.season)} за сезон`;
const injuredLines=p=>(p.injured||[]).map(x=>`🩹 ${esc(x.player.name)}: ${x.verdict==='replace'&&x.replacement?`можно заменить на ${esc(x.replacement.name)} до возвращения (два трансфера, его могут забрать)`:'держать: замена и выкуп не окупают два трансфера'}`);
if(pack){const n=count(pack.pairs.length,'трансфер','трансфера','трансферов');
 mine.push('',`🧩 <b>Лучший ход: ${n}</b> · ${sureness(packWhy).toLowerCase()}${when}`,horizonsLine(pack.gains),
  ...moveLines(pack.pairs.map(x=>({out:x.out.name,in:x.in.name})),pack.bankAfter),...pack.forced.map(r=>'💡 '+esc(r)),...pack.risks.map(r=>'⚠️ '+esc(r)),...pack.changes.map(c=>'🔁 '+esc(c)),
  ...(pack.alternative?[`↔️ Альтернатива: ${esc(pack.alternative.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', '))} (${horizonsLine(pack.alternative.gains)})`]:[]),...injuredLines(pack));}
else if(left>0&&plan.reason==='low-confidence'){const b=plan.best;
 mine.push('',`🙅 <b>Держать: лучший ход окупает трансфер, но уверенность за сезон ${confidencePercent(b.confidence)}% — ниже порога ${Math.round(plan.minConfidence*100)}%</b>`,
  `${esc(b.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', '))}: ${horizonsLine(b.gains)}`,...injuredLines(plan));}
else if(left>0){const b=plan.best;
 mine.push('',`🙅 <b>Держать: ни один ход не окупает трансфер</b>`,...(b?[`Лучший — ${esc(b.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', '))}: ${horizonsLine(b.gains)}; по весам прошлых сезонов ${signed(b.value)}, меньше цены трансфера (${Math.round(b.price)})`]:[]),...injuredLines(plan));}
// The single upgrades besides the package (one that is the package itself is not repeated).
const singles=alerts.filter(a=>!(pack?.pairs.length===1&&pack.pairs[0].out.id===a.outId&&pack.pairs[0].in.id===a.player.id));
if(singles.length)mine.push('',`📈 <b>Отдельные усиления</b>${when}`,...singles.slice(0,3).map(a=>`${esc(current(byId.get(a.outId),ctx).name)} → <b>${esc(a.player.name)}</b>: ${gains(a.gain.season,a.gain.month)} · ${confidencePercent(a.why.confidence)}%`));
if(budget.length)mine.push('','⚠️ <b>Бюджет по ценам Sports.ru</b>',...budget.map(w=>`${esc(teamLabel(w.team))}: ${esc(w.message)}`));
if(hurt.length)mine.push('','🩹 <b>Травмы</b>',...hurt.map(h=>esc(h.text)));
const injuryLine=injuryWarning(injuryState);if(injuryLine)mine.push('',injuryLine);
mine.push('',link);
const changed=fresh.length>0||freshHurt.length>0;
console.log(message(mine),'\n\nnew:',fresh,freshHurt.map(h=>h.key));
const {configured,send}=sender(process.env.TELEGRAM_BOT_TOKEN,process.env.TELEGRAM_CHAT_ID);
// What was reported is saved after every message, so a failure halfway never repeats the messages already sent.
const state={...previous,sent:[...(previous.sent||[])],transfers:[...(previous.transfers||[])],returns:[...(previous.returns||[])],unknown:[...(previous.unknown||[])]};
function save(){if(configured)fs.writeFileSync(statePath,JSON.stringify({...state,updatedAt:new Date().toISOString()}));}
async function report(text,mark){if(await send(text)){mark();save();}}
// What my team should do about a player a rival let go: the decision in bold, the deal under it.
function decision(p){
 if(!p)return {head:null,why:[]};
 return decide(p);
}
// My best season package of the transfers left, once: a released player is worth buying only for what he adds to it.
let seasonBest;const bestSeason=()=>seasonBest===undefined?(seasonBest=bestPackage(ctx,{team,bankMoney:money,k:left,sort:'season'})):seasonBest;
// A package buys a player only for what he adds over the best package without him (acquisition's edge), so its percent is
// the chance of that edge: the moves both packages make cancel out and never lend him their certainty. The split and the
// caveats stay those of the moves to make.
const withoutHim=new Map();
function edgePairs(pack,id){
 const top=bestSeason();
 if(!withoutHim.has(id))withoutHim.set(id,top?.pairs.some(x=>x.in.id===id)?bestPackage(ctx,{team,bankMoney:money,k:left,sort:'season',exclude:id}):top);
 const other=withoutHim.get(id),base=other?.gains.season>0?other.pairs:[];
 const plus=[...pack.pairs.map(x=>x.in.id),...base.map(x=>x.out.id)],minus=[...pack.pairs.map(x=>x.out.id),...base.map(x=>x.in.id)];
 for(let i=plus.length-1;i>=0;i--){const j=minus.indexOf(plus[i]);if(j>=0){plus.splice(i,1);minus.splice(j,1);}}
 return minus.map((o,i)=>[o,plus[i]]);
}
function dealWhy(d,id){
 const why=explainSwap(ctx,null,null,'season',dealPairs(d),team);if(!d.pack)return why;
 const edge=explainSwap(ctx,null,null,'season',edgePairs(d.pack,id),team);return {...why,confidence:edge.confidence,level:edge.level,edge:true};
}
function decide(p){
 if(takenIds(ctx).has(p.id))return {kind:'taken',head:`🔒 <b>${esc(p.name)} уже в другой команде FBL</b>`,why:[]};
 // With no transfers left this week nothing can be bought now: say so first, and what the deal would be next week.
 const d=acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:Math.max(1,left),...(left>1?{best:bestSeason()}:{})});
 if(!left)return {kind:'spent',head:'⛔ <b>Тебе: трансферы на неделе закончились</b>',why:d.worth&&confidenceLevel(dealWhy(d,p.id).confidence)!=='DOUBTFUL'?[`Если ${esc(p.name)} останется свободным, на новой неделе:`,...dealLines(d)]:[]};
 // A deal the model is not sure of (60-69%) is offered, not ordered; below DOUBTFUL it is not worth a transfer, as in the
 // app ("не стоит") and the return alerts: nothing to do, the numbers in the details.
 if(d.worth){const why=dealWhy(d,p.id),lvl=confidenceLevel(why.confidence);
  if(lvl==='DOUBTFUL')return {kind:'none',head:'🙅 <b>Тебе: ничего не делать</b>',why:[`Если всё же брать ${esc(p.name)}:`,...dealLines(d),...whyLines(why)]};
  return lvl==='CONFIDENT'?{kind:'take',head:message(`🎯 <b>Тебе: забирай ${esc(p.name)}</b>${when}`,dealLines(d)),why:whyLines(why)}
   :{kind:'take',head:message(`🤔 <b>Тебе: можно взять ${esc(p.name)}, но не уверенно</b>${when}`,dealLines(d)),why:whyLines(why)};}
 if(d.swap)return {kind:'none',head:'🙅 <b>Тебе: ничего не делать</b>',why:[`Если всё же брать ${esc(p.name)}: ${esc(current(byId.get(d.swap.outId),ctx).name)} → ${esc(p.name)}, ${gains(d.swap.gain.season,d.swap.gain.month)}`,...(left>1?edgeLine(d):[])]};
 return {kind:'none',head:'🙅 <b>Тебе: ничего не делать</b>',why:[`${esc(p.name)} не влезает по позиции, бюджету или правилу rookie.`]};
}
// The heads for several players a package let go: each deal worth taking on its own; the rest in one line each kind.
function heads(players){
 const ds=players.map(p=>({p,d:decision(p)})).filter(x=>x.d.head);if(ds.length<2)return ds.map(x=>x.d);
 const names=kind=>ds.filter(x=>x.d.kind===kind).map(x=>esc(x.p.name)).join(', ');
 return [...ds.filter(x=>x.d.kind==='take').map(x=>x.d),
  ...(names('spent')?[{head:'⛔ <b>Тебе: трансферы на неделе закончились</b>',why:ds.filter(x=>x.d.kind==='spent').flatMap(x=>x.d.why)}]:[]),
  ...(names('none')?[{head:`🙅 <b>Тебе: ничего не делать</b> (${names('none')})`,why:ds.filter(x=>x.d.kind==='none').flatMap(x=>x.d.why)}]:[]),
  ...(names('taken')?[{head:`🔒 <b>${names('taken')}: уже в другой команде FBL</b>`,why:[]}]:[])];
}
// Every new transfer of the other teams, one message each: who moved, what it gives them, what I should do.
// Not yet reported, matched by sale and purchase: Sports.ru re-pairs a day's journal rows.
// Reported deals are kept as their journal events (a multiset), saved with every message, so a re-paired day or a
// short name resolving to another player never repeats a message.
const transferKey=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`;
state.transferEvents=capEvents(reportedEvents(transfers,{events:previous.transferEvents,reported:previous.transfers}),[...journalEvents(live),...transfers.filter(x=>x.source!=='sports.ru').flatMap(dealEvents)]);
const pending=unreported(transfers,state.transfers,state.transferEvents),told=x=>{state.transfers.push(transferKey(x));state.transferEvents.push(...dealEvents(x));};
// A package (the deals the watcher saw together) is judged as its net change: a chain of legs is one move, a round trip
// none. The verdict is the expected gain, with the model's certainty of its sign next to it.
const nameOf=id=>esc(byId.get(id)?.name);
const verdictLine=(v,who)=>v?.verdict==='none'?v.label:v?.gain?`${v.gain.season>=0?'📈':'📉'} ${who}: ${gains(v.gain.season,v.gain.month)} · ${v.label}${v.sure!=null?` (${confidencePercent(v.sure)}%)`:''}`:null;
const netLine=(group,v)=>v.net.pairs.length&&v.net.pairs.length<group.length?`Итог: ${v.net.pairs.map(p=>`${nameOf(p.outId)} → ${nameOf(p.inId)}`).join(', ')}`:null;
const betterLine=v=>v?.best?[`Лучше было за те же деньги: ${esc(v.best.player.name)} (${v.best.player.price}), ${gains(v.best.gain.season,v.best.gain.month)}`]:[];
for(const group of dealGroups(transfers.filter(x=>x.team!==team&&pending.has(x)))){
 const x=group[0],v=packageVerdict(ctx,group,{bankMoney:bankOf(x.team)}),mineNow=heads(v.net.outs.map(id=>byId.get(id)));
 const briefs=[];for(const p of v.net.pairs)briefs.push(...await brief(byId.get(p.inId)),...await brief(byId.get(p.outId)));
 await report(message(`🔄 <b>${esc(teamLabel(x.team))}</b> · ${x.seenAt?moscow(x.seenAt):day(x.date)}`,group.map(d=>`${nameOf(d.outId)} → <b>${nameOf(d.inId)}</b>`).join('\n'),netLine(group,v),verdictLine(v,'Им'),'',...mineNow.map(d=>d.head),
  details([...mineNow.flatMap(d=>d.why),...briefs,...betterLine(v),`У них: банк ${bankOf(x.team)}, трансферов ${leftOf(x.team)}/${WEEKLY_TRANSFERS}`])),()=>group.forEach(told));
}
// My own transfers, once each package, as the watcher saw them: what was done, when, what it gives by the model, and where
// the bank and the week's transfers stand. Only those seen live (seenAt); older ones were never news.
const leftLabel=t=>live.teams?.[t]?.transfersUnlimited?'∞ (предсезонье)':`${leftOf(t)}/${WEEKLY_TRANSFERS}`;
for(const group of dealGroups(transfers.filter(x=>x.team===team&&x.seenAt&&pending.has(x)))){
 const x=group[0],v=packageVerdict(ctx,group,{bankMoney:money});
 await report(message(`✅ <b>${group.length>1?'Твои трансферы зафиксированы':'Твой трансфер зафиксирован'}</b> · ${moscow(x.seenAt)}`,group.map(d=>`${nameOf(d.outId)} (${d.outPrice}) → <b>${nameOf(d.inId)}</b> (${d.inPrice})`).join('\n'),
  netLine(group,v),verdictLine(v,'По модели'),'',`Банк: ${money} · трансферов осталось: ${leftLabel(team)}`,details(betterLine(v))),
  ()=>group.forEach(told));
}
// League protocols not posted because they were too late (an outage or an update) that held a breach or a doubt: the
// league chat stays quiet, the owner hears of them here, once, to decide whether Зак Онн should announce them.
const leagueStatePath=path.join(path.dirname(path.resolve(livePath)),'league-state.json');
const unannounced=fs.existsSync(leagueStatePath)?JSON.parse(fs.readFileSync(leagueStatePath,'utf8')).unannounced||[]:[];
const silentKey=u=>`${u.team}:${u.date}:${u.seenAt}`;
for(const u of unannounced.filter(u=>!(previous.silent||[]).includes(silentKey(u))))
 await report(message(`🔕 <b>Не опубликовано в лиге: ${esc(teamLabel(u.team))}</b>`,`${u.deals.map(esc).join('; ')}${u.seenAt?` · ${moscow(u.seenAt)}`:''}`,
  `${u.kind==='violation'?'🚨 Нарушено':'🔎 На проверке'}: ${u.items.join('; ')}`,'',
  'Бот был недоступен дольше 2 часов, поэтому протокол не отправлен задним числом. Если нужно, объяви через «League announcement».'),
  ()=>{state.silent=[...(state.silent||[]),silentKey(u)];});
// Journal rows the database cannot match (a player new to the Sports.ru market): report them as they are, once.
const unknown=warnings.filter(w=>w.team>=0&&w.team!==team&&/не найден/.test(w.message)),unknownKey=w=>`unknown:${w.team}:${w.message}`;
for(const w of unknown.filter(w=>!(previous.unknown||[]).includes(unknownKey(w))))
 await report(message(`❓ <b>${esc(teamLabel(w.team))}</b>`,esc(w.message),'Игрока нет в нашей базе: оценки нет, проверь на Sports.ru.'),()=>state.unknown.push(unknownKey(w)));
if(changed)await report(message(mine),()=>{state.sent=[...new Set([...state.sent,...keys])].slice(-200);state.injuries=injuryState.fresh?hurt.map(h=>h.key):(previous.injuries||[]);});
else console.log('Nothing new for my team: no message.');
// Injured free agents worth a season transfer: warn once per injury when one who is out (never a day-to-day or
// game-time decision) is about to return, and again the moment he is back. Without a fresh ESPN report nobody is about
// to return or back, and the watch list waits for the next good report.
const feedOk=injuryState.fresh,targets=left?injuredTargets(ctx,{team,bankMoney:money,k:left}):[];
const soon=feedOk?targets.filter(x=>x.soon&&isOut(x.injury)&&!warnedFor(previous.returns,x.player.id)):[];
// Back on the injury-free list and still free: buy now if it pays over the next 4 weeks too.
const back=!left||!feedOk?[]:(previous.watch||[]).map(id=>byId.get(id)).filter(p=>p&&!ctx.injuries.get(String(p.espnId))&&!ctx.rosters.flat().includes(p.id))
 .map(p=>({player:current(p,ctx),...acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:left,...(left>1?{best:bestSeason()}:{})})})).filter(x=>x.worth);
// Both alerts follow the same bars as the other advice: sure → buy, moderate → not sure, doubtful → no message; outside
// the transfer hours they say when to make the move.
for(const x of back){const why=dealWhy(x,x.player.id),head=returnHead(why.confidence,{sure:CONFIDENT,maybe:DOUBTFUL,now:true,when});if(!head)continue;
 await report(message(`✅ <b>${esc(x.player.name)} вернулся в строй</b> · ${x.player.price}`,'',head,dealLines(x),details([...whyLines(why),...(await brief(x.player)).slice(1)])),()=>{});}
for(const x of soon){const why=dealWhy(x,x.player.id),head=returnHead(why.confidence,{sure:CONFIDENT,maybe:DOUBTFUL,when});if(!head)continue;
 await report(message(`🔜 <b>${esc(x.player.name)} скоро вернётся</b> · ${esc(statusRu(x.injury))}${outUntil(x.injury)}`,'',
 `${head} · ${sureness(why).toLowerCase()}`,dealLines(x),details([...whyLines(why),...(await brief(x.player)).slice(1)])),()=>state.returns.push(returnKey(x.player.id)));}
// Remember what was already reported so the same advice is not sent again. Until Telegram is configured nothing
// counts as reported: the first messages arrive once the secrets are set. Transfers already in the journal count as seen.
// A return warning is forgotten once the player is off the report, so a new injury warns again; an injured player stays
// watched through out → day-to-day until he is back.
const injuredIds=players.filter(p=>p.espnId&&ctx.injuries.has(String(p.espnId))).map(p=>p.id);
state.transfers=[...new Set([...state.transfers,...transfers.map(transferKey)])];state.transferEvents=transfers.flatMap(dealEvents);state.returns=(feedOk?stillInjured(state.returns,injuredIds):state.returns).slice(-500);state.unknown=state.unknown.slice(-200);
state.watch=feedOk?targets.filter(x=>isOut(x.injury)||(previous.watch||[]).includes(x.player.id)).map(x=>x.player.id):(previous.watch||[]);
if(configured)save();else fs.writeFileSync(statePath,JSON.stringify({...previous,updatedAt:new Date().toISOString()}));
