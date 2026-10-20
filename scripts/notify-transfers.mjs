// Transfer alerts for one FBL team, sent to Telegram when something new appears on the market,
// a verdict on every new transfer of the other teams (and whether to grab the player they let go), a confirmation of
// each of my own transfers,
// and injured free agents about to return or just back.
// Usage: notify-transfers.mjs <sports-current.json> <notify-state.json>
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (without them the message is only printed), FBL_TEAM (default 0).
import fs from 'node:fs';
import path from 'node:path';
import {seasonRosters,bank,unreported,dealEvents,reportedEvents,journalEvents,capEvents,transfersThisWeek,moscowToday,marketAlerts,bestPackage,parseInjuries,current,allTransfers,transferVerdict,perGame,acquisition,injuredTargets,gameWeeks,withMarket,explainSwap,CONFIDENT,WEEKLY_TRANSFERS} from '../src/season.js';
import {playerInsights} from '../src/insights.js';
import {teamLabel} from '../src/teams.js';
import {fblTransfers} from '../src/rules.js';
import {esc,gains,moveLines,details,message,sender,moscow} from './telegram-format.mjs';
const [livePath,statePath]=process.argv.slice(2);
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/';
const RAW='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/';
const team=Number(process.env.FBL_TEAM||0),sort='month';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();};
const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
const db=process.env.DB_PATH?JSON.parse(fs.readFileSync(process.env.DB_PATH,'utf8')):await json(SITE+'data/default-draft.json');
// The league log from this checkout: the watcher hands over to a new run whenever main moves, so a white-rule decision
// counts within minutes, and a failed download can never judge on an older list.
const league=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
// A watcher that runs for hours keeps the state locally: the published copy can lag behind the raw-file cache.
const previous=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):await json(RAW+'data/season-live/notify-state.json').catch(()=>({sent:[],injuries:[]}));
const players=withMarket(db.players,live),byId=new Map(players.map(p=>[p.id,p])),today=moscowToday();
const {transfers,warnings}=allTransfers(players,live,league);
const ctx={players,live,injuries:parseInjuries(live.espnInjuries),today,rosters:seasonRosters(transfers),white:new Set((league.white||[]).map(String).filter(x=>!x.startsWith('none:')))};
const bankOf=t=>{const x=live.teams?.[t];return Number.isFinite(x?.balance)?x.balance:Number.isFinite(league.banks?.[t])?league.banks[t]:bank(t,transfers,id=>live.players[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0);};
// Both limits bind: Sports.ru's own weekly count (∞ in pre-season) and the FBL week (pre-season moves are free).
const leftOf=t=>{const x=live.teams?.[t],sports=x?.transfersUnlimited?Infinity:Number.isFinite(x?.transfersLeft)?x.transfersLeft:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(transfers,t,today,gameWeeks(live)));
 return Math.min(sports,fblTransfers(transfers,t,today).left);};
const money=bankOf(team),left=leftOf(team);
for(const w of warnings)console.log('warning:',w.team+1,w.message);
const budget=warnings.filter(w=>w.team>=0&&/превышен/.test(w.message));
const alerts=marketAlerts(ctx,{team,bankMoney:money,sort,minGain:20});
const pack=left>1?bestPackage(ctx,{team,bankMoney:money,k:left,sort}):null;
// Only a package the model is sure of starts a new message; a doubtful one is shown with its confidence when one is sent.
const packWhy=pack?.pairs.length>1?explainSwap(ctx,null,null,sort,pack.pairs.map(x=>[x.out.id,x.in.id])):null;
const hurt=ctx.rosters[team].map(id=>byId.get(id)).filter(p=>p&&ctx.injuries.get(String(p.espnId)))
 .map(p=>{const i=ctx.injuries.get(String(p.espnId));return {key:`${p.id}:${i.status}:${i.returnDate}`,text:`${p.name} — ${i.status}${i.returnDate?' до '+i.returnDate.slice(8,10)+'.'+i.returnDate.slice(5,7):''}`};});
const keys=[...budget.map(w=>'budget:'+w.message),...alerts.map(a=>`${a.outId}>${a.player.id}`),...(pack?.pairs.length>1&&packWhy.confidence>=CONFIDENT?[pack.pairs.map(x=>`${x.out.id}>${x.in.id}`).sort().join('+')]:[])];
const fresh=keys.filter(k=>!previous.sent?.includes(k)),freshHurt=hurt.filter(h=>!previous.injuries?.includes(h.key));
const day=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';
const link=`<a href="${SITE}">Открыть помощника</a>`;
const swapPairs=x=>[{out:current(byId.get(x.outId),ctx).name,in:x.player.name}];
// How sure the model is about a deal over the season, and the main caveats, for the collapsed details.
const dealPairs=d=>d.pack?d.pack.pairs.map(q=>[q.out.id,q.in.id]):[[d.swap.outId,d.swap.player.id]];
const sureness=why=>`Уверенность ${Math.round(why.confidence*100)}%: ${why.level==='CONFIDENT'?'уверенно':why.level==='MODERATE'?'умеренно':'сомнительно'}`;
const whyLines=why=>[sureness(why),`Откуда: ${Math.round(why.parts.perGame)} ФО/матч · ${Math.round(why.parts.availability)} доля матчей · ${Math.round(why.parts.schedule)} календарь`,...why.flags.slice(0,3).map(f=>'⚠️ '+esc(f))];
// Latest ESPN fantasy news headline of a player from the last three days, if any.
const news=new Map();
async function headline(p){
 if(!p?.espnId)return null;
 if(!news.has(p.espnId))news.set(p.espnId,json(`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=1&playerId=${p.espnId}`).then(d=>d.feed?.[0]||null).catch(()=>null));
 const n=await news.get(p.espnId);if(!n)return null;
 return Date.now()-Date.parse(n.published||n.lastModified)<3*864e5?`📰 ${esc(n.headline)}`:null;
}
// A deal for my team: the gain, then the numbered moves.
const dealLines=d=>d.pack?[gains(d.pack.gains.season,d.pack.gains.month),...moveLines(d.pack.pairs.map(q=>({out:q.out.name,in:q.in.name})),d.pack.bankAfter)]
 :[gains(d.swap.gain.season,d.swap.gain.month),...moveLines(swapPairs(d.swap),d.swap.bankAfter)];
// One pro and one risk from the player cards, with the current per-game estimate and injury.
async function brief(p){
 if(!p)return [];
 const {pros,cons}=playerInsights(p,players),injury=ctx.injuries.get(String(p.espnId)),n=await headline(p);
 return [`<b>${esc(p.name)}</b> · ${perGame(p,live.players?.[p.sportsId]).value.toFixed(1)} ФО/матч${injury?` · 🩹 ${esc(injury.status)}`:''}`,
  ...pros.slice(0,1).map(x=>'✅ '+esc(x)),...cons.slice(0,1).map(x=>'⚠️ '+esc(x)),...(n?[n]:[])];
}

// My team: the best move first, then single upgrades, budget problems and injuries.
const mine=[`🏀 <b>${esc(teamLabel(team))}</b>`,`Банк ${money} · трансферов ${left}/${WEEKLY_TRANSFERS}`];
if(pack?.pairs.length>1&&pack.gain>0)mine.push('',`🧩 <b>Лучший ход: ${pack.pairs.length} трансфера</b> · ${sureness(packWhy).toLowerCase()}`,
 gains(pack.gains.season,pack.gains.month),...moveLines(pack.pairs.map(x=>({out:x.out.name,in:x.in.name})),pack.bankAfter));
if(alerts.length)mine.push('','📈 <b>Отдельные усиления</b>',...alerts.slice(0,3).map(a=>`${esc(current(byId.get(a.outId),ctx).name)} → <b>${esc(a.player.name)}</b>: ${gains(a.gain.season,a.gain.month)} · ${Math.round(a.why.confidence*100)}%`));
if(budget.length)mine.push('','⚠️ <b>Бюджет по ценам Sports.ru</b>',...budget.map(w=>`${esc(teamLabel(w.team))}: ${esc(w.message)}`));
if(hurt.length)mine.push('','🩹 <b>Травмы</b>',...hurt.map(h=>esc(h.text)));
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
function decide(p){
 if(ctx.rosters.flat().includes(p.id))return {head:`🔒 <b>${esc(p.name)} уже в другой команде FBL</b>`,why:[]};
 // With no transfers left this week nothing can be bought now: say so first, and what the deal would be next week.
 const d=acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:Math.max(1,left)});
 if(!left)return {head:'⛔ <b>Тебе: трансферы на неделе закончились</b>',why:d.worth?[`Если ${esc(p.name)} останется свободным, на новой неделе:`,...dealLines(d)]:[]};
 // A deal the model is not sure of is offered, not ordered.
 if(d.worth){const why=explainSwap(ctx,null,null,'season',dealPairs(d));
  return why.confidence>=CONFIDENT?{head:message(`🎯 <b>Тебе: забирай ${esc(p.name)}</b>`,dealLines(d)),why:whyLines(why)}
   :{head:message(`🤔 <b>Тебе: можно взять ${esc(p.name)}, но не уверенно</b>`,dealLines(d)),why:whyLines(why)};}
 if(d.swap)return {head:'🙅 <b>Тебе: ничего не делать</b>',why:[`Если всё же брать ${esc(p.name)}: ${esc(current(byId.get(d.swap.outId),ctx).name)} → ${esc(p.name)}, ${gains(d.swap.gain.season,d.swap.gain.month)}`]};
 return {head:'🙅 <b>Тебе: ничего не делать</b>',why:[`${esc(p.name)} не влезает по позиции, бюджету или правилу rookie.`]};
}
// Every new transfer of the other teams, one message each: who moved, what it gives them, what I should do.
// Not yet reported, matched by sale and purchase: Sports.ru re-pairs a day's journal rows.
// Reported deals are kept as their journal events (a multiset), saved with every message, so a re-paired day or a
// short name resolving to another player never repeats a message.
const transferKey=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`;
state.transferEvents=capEvents(reportedEvents(transfers,{events:previous.transferEvents,reported:previous.transfers}),[...journalEvents(live),...transfers.filter(x=>x.source!=='sports.ru').flatMap(dealEvents)]);
const pending=unreported(transfers,[],state.transferEvents),told=x=>{state.transfers.push(transferKey(x));state.transferEvents.push(...dealEvents(x));};
const rival=transfers.filter(x=>x.team!==team&&pending.has(x));
for(const x of rival){
 const out=byId.get(x.outId),joined=byId.get(x.inId),v=transferVerdict(ctx,x,{bankMoney:bankOf(x.team)}),mineNow=decision(out);
 const briefs=[...await brief(joined),...await brief(out)];
 const effect=v?`${v.gain.season>=0?'📈':'📉'} Им: ${gains(v.gain.season,v.gain.month)} · ${v.label}`:null;
 await report(message(`🔄 <b>${esc(teamLabel(x.team))}</b> · ${x.seenAt?moscow(x.seenAt):day(x.date)}`,`${esc(out?.name)} → <b>${esc(joined?.name)}</b>`,effect,'',mineNow.head,
  details([...mineNow.why,...briefs,
   ...(v?.best?[`Лучше было за те же деньги: ${esc(v.best.player.name)} (${v.best.player.price}), ${gains(v.best.gain.season,v.best.gain.month)}`]:[]),
   `У них: банк ${bankOf(x.team)}, трансферов ${leftOf(x.team)}/${WEEKLY_TRANSFERS}`])),()=>told(x));
}
// My own transfers, once each, as the watcher saw them: what was done, when, what it gives by the model, and where the
// bank and the week's transfers stand. Only those seen live (seenAt); older ones were never news.
const leftLabel=t=>live.teams?.[t]?.transfersUnlimited?'∞ (предсезонье)':`${leftOf(t)}/${WEEKLY_TRANSFERS}`;
for(const x of transfers.filter(x=>x.team===team&&x.seenAt&&pending.has(x))){
 const out=byId.get(x.outId),joined=byId.get(x.inId),v=transferVerdict(ctx,x,{bankMoney:money});
 const effect=v?`${v.gain.season>=0?'📈':'📉'} По модели: ${gains(v.gain.season,v.gain.month)} · ${v.label}`:null;
 await report(message(`✅ <b>Твой трансфер зафиксирован</b> · ${moscow(x.seenAt)}`,`${esc(out?.name)} (${x.outPrice}) → <b>${esc(joined?.name)}</b> (${x.inPrice})`,effect,'',
  `Банк: ${money} · трансферов осталось: ${leftLabel(team)}`,
  details(v?.best?[`Лучше было за те же деньги: ${esc(v.best.player.name)} (${v.best.player.price}), ${gains(v.best.gain.season,v.best.gain.month)}`]:[])),
  ()=>told(x));
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
if(changed)await report(message(mine),()=>{state.sent=[...new Set([...state.sent,...keys])].slice(-200);state.injuries=hurt.map(h=>h.key);});
else console.log('Nothing new for my team: no message.');
// Injured free agents worth a season transfer: warn when one is about to return, and again the moment he is back.
const targets=left?injuredTargets(ctx,{team,bankMoney:money,k:left}):[],injuryKey=x=>`${x.player.id}:${x.injury.status}:${x.injury.returnDate||''}`;
const warned=new Set(previous.returns||[]),soon=targets.filter(x=>x.soon&&!warned.has(injuryKey(x)));
// Back on the injury-free list and still free: buy now if it pays over the next 4 weeks too.
const back=!left?[]:(previous.watch||[]).map(id=>byId.get(id)).filter(p=>p&&!ctx.injuries.get(String(p.espnId))&&!ctx.rosters.flat().includes(p.id))
 .map(p=>({player:current(p,ctx),...acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:left})})).filter(x=>x.worth);
for(const x of back){const why=explainSwap(ctx,null,null,'season',dealPairs(x)),sure=why.confidence>=CONFIDENT;
 await report(message(`✅ <b>${esc(x.player.name)} вернулся в строй</b> · ${x.player.price}`,'',sure?'🎯 <b>Тебе: забирай</b>':'🤔 <b>Тебе: можно брать, но не уверенно</b>',dealLines(x),details([...whyLines(why),...(await brief(x.player)).slice(1)])),()=>{});}
for(const x of soon){const why=explainSwap(ctx,null,null,'season',dealPairs(x));
 await report(message(`🔜 <b>${esc(x.player.name)} скоро вернётся</b> · ${esc(x.injury.status)}${x.injury.returnDate?' до '+day(x.injury.returnDate):''}`,'',
 `🎯 <b>Тебе: можно брать</b> · ${sureness(why).toLowerCase()}`,dealLines(x),details([...whyLines(why),...(await brief(x.player)).slice(1)])),()=>state.returns.push(injuryKey(x)));}
// Remember what was already reported so the same advice is not sent again. Until Telegram is configured nothing
// counts as reported: the first messages arrive once the secrets are set. Transfers already in the journal count as seen.
state.transfers=[...new Set([...state.transfers,...transfers.map(transferKey)])];state.transferEvents=transfers.flatMap(dealEvents);state.returns=state.returns.slice(-500);state.unknown=state.unknown.slice(-200);
state.watch=targets.map(x=>x.player.id);
if(configured)save();else fs.writeFileSync(statePath,JSON.stringify({...previous,updatedAt:new Date().toISOString()}));
