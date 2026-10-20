// FBL league feed: every Sports.ru transfer of the league, posted to the league's own Telegram chat with the rules check
// of the roster it leaves (rookie, «белое правило», two per NBA club, the FBL transfer limit) and of the deal's time
// (transfers only from 08:00 to 22:00 Moscow time). No analytics: what happened and whether the roster complies. A
// team's transfers of one day are one message (Sports.ru confirms them as a package), checked on the roster after the
// whole package.
// Usage: league-feed.mjs <sports-current.json> <league-state.json>
// Env: LEAGUE_TELEGRAM_CHAT_ID and LEAGUE_TELEGRAM_BOT_TOKEN, the league's own bot (never the personal one: the league
// chat must not share a bot or a chat with the personal advice). Without them nothing is
// marked as posted, so the feed starts complete once the chat is set.
import fs from 'node:fs';
import {seasonRosters,allTransfers,withMarket,bank,unreported,dealEvents,reportedEvents,journalEvents,capEvents} from '../src/season.js';
import {fileURLToPath} from 'node:url';
import {checkRules,verdict,isDoubt,transferTime,timeLabel,TRANSFER_HOURS,LAWYER,COMMISSIONER,LEAGUE_FEED,WATCHLIST,isFreeTransfer,FBL_TRANSFERS} from '../src/rules.js';
import {HEADINGS,remarkLines,circumstances,joke,signature} from './zak-voice.mjs';
import {loadHandles,at} from './handles.mjs';
import {teamLabel} from '../src/teams.js';
import {esc,message,sender,moscow,fitsCaption} from './telegram-format.mjs';
const [livePath,statePath]=process.argv.slice(2);
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/';
const RAW='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();};
const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
const db=process.env.DB_PATH?JSON.parse(fs.readFileSync(process.env.DB_PATH,'utf8')):await json(SITE+'data/default-draft.json');
// The league's decisions (white list) from this checkout: the watcher hands over to a new run whenever main moves, so a
// decision filed on main counts within minutes, and a failed download can never judge deals on an older list.
const league=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
const players=withMarket(db.players,live),byId=new Map(players.map(p=>[p.id,p]));
const {transfers,warnings}=allTransfers(players,live,league);
// The league feed posts only through the league's own bot into the league's own chat. The personal bot or chat in its
// place is refused, even for a test, so no league message ever reaches the personal chat.
const leagueToken=process.env.LEAGUE_TELEGRAM_BOT_TOKEN,leagueChat=process.env.LEAGUE_TELEGRAM_CHAT_ID;
if(leagueToken&&(leagueToken===process.env.TELEGRAM_BOT_TOKEN||(leagueChat&&leagueChat===process.env.TELEGRAM_CHAT_ID))){
 console.error('League feed refused: the league bot and chat must differ from the personal ones.');process.exit(1);}
const {configured,send}=sender(leagueToken,leagueChat);
// What the chat was already told. Without it every deal of the day would look new: a feed that can post stops rather
// than guess (the watcher retries in a minute).
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):await json(RAW+'data/season-live/league-state.json').catch(e=>{
 if(configured){console.error(`League feed stopped: no league state (${e.message}); nothing posted.`);process.exit(1);}return {reported:[]};});
const clubOf=p=>live.players?.[p.sportsId]?.club||p.sportsClub;
const day=d=>`${d.slice(8,10)}.${d.slice(5,7)}.${d.slice(0,4)}`,ddmm=d=>`${d.slice(8,10)}.${d.slice(5,7)}`;
// A player as the league sees him on Sports.ru (Russian name).
const name=id=>{const p=byId.get(id);return live.players?.[p?.sportsId]?.fullName||p?.name||String(id);};
const names=list=>list.map(p=>esc(name(p.id))).join(', ');
const key=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`,done=new Set(state.reported||[]);
// Deals not yet published, matched by their sale and purchase in the journal's words (Sports.ru re-pairs a day's rows,
// and a deal repeated the same day is its own): the reported events are a multiset kept in the state.
// They never exceed the journals' own events, and a state from before events were kept is migrated and saved at once.
const migrated=!Array.isArray(state.events);
const events=capEvents(reportedEvents(transfers,state),[...journalEvents(live),...transfers.filter(x=>x.source!=='sports.ru').flatMap(dealEvents)]);
const pending=unreported(transfers,[],events);
const save=()=>{if(configured)fs.writeFileSync(statePath,JSON.stringify({...state,reported:[...done],events,count:issued,updatedAt:new Date().toISOString()}));};
// Transfers grouped by team and day in the order they happened; a group's place in that order is its protocol number.
// The league chat starts at leagueFeed.since: transfers the watcher saw before it (or never timed) get no protocol and
// no number. A preview shows every transfer since the draft.
const preview=Number(process.env.LEAGUE_FEED_PREVIEW)||0;
const posted=x=>preview||!LEAGUE_FEED.since||(x.seenAt&&Date.parse(x.seenAt)>=Date.parse(LEAGUE_FEED.since));
const groups=new Map();
transfers.forEach((x,i)=>{if(!posted(x))return;const g=`${x.team}:${x.date}`;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i);});
// Sports.ru money: the cap, minus the draft prices, plus every sale, minus every purchase up to the given transfer.
const draftPrice=id=>live.players?.[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0;
// The rules check, item by item: a passed item can be folded into one line when the protocol must fit under the photo.
function checkItems(c,moves){
 const of=r=>c.violations.filter(v=>v.rule===r),bad=r=>of(r).length>0,t=c.transfers,icon={ok:'✅',breach:'❌',doubt:'⏳',unknown:'❔'};
 const white=c.whiteState==='ok'?`✅ ${names(c.whites)}`:c.whiteState==='unmarked'?`⏳ нет решения лиги по ${names(c.undecided)||'игрокам состава'}`
  :c.whiteState==='sold'?'⏳ продан засчитываемый игрок, другого не отмечено':'❌ нет засчитываемого игрока';
 // With several deals each has its own time.
 const times=moves.map(m=>transferTime(m));
 const time=moves.length>1?times.map((x,i)=>`сд. ${i+1} ${icon[x.state]} ${timeLabel(x)}`).join(', '):times.map(x=>`${icon[x.state]} ${timeLabel(x)}`).join(', ');
 return [{ok:!bad('rookie'),name:'новичок',line:`Новичок в составе — ${bad('rookie')?'❌ нет':'✅ '+names(c.rookies)}`},
  {ok:c.whiteState==='ok',name:'белое правило',line:`Белое правило — ${white}`},
  {ok:!bad('club'),name:'лимит клуба',line:`Лимит клуба NBA (2) — ${bad('club')?of('club').map(v=>`❌ ${esc(v.club)}: ${esc(v.players.join(', '))}`).join('; '):'✅'}`},
  {ok:!bad('transfers'),name:'лимит трансферов',line:moves.every(m=>isFreeTransfer(m))?'Лимит трансферов — ✅ предсезонье, без лимита'
   :`Лимит трансферов — ${bad('transfers')?(of('transfers')[0].certain===false?'⏳':'❌'):'✅'} ${t.used}/${t.limit}`},
  {ok:!bad('duplicate'),name:'уникальность',line:`Уникальность игроков — ${bad('duplicate')?of('duplicate').map(r=>`${r.certain===false?'⏳':'❌'} ${esc(r.text.split(' — ')[0])}`).join('; '):'✅'}`},
  {ok:times.every(x=>x.state==='ok'),name:'время',line:`Время сделки (${TRANSFER_HOURS.from}–${TRANSFER_HOURS.to} МСК) — ${time}`}];
}
const tree=(items,fold)=>{
 const rows=fold&&items.some(i=>i.ok)?[`✅ ${items.filter(i=>i.ok).map(i=>i.name).join(', ')}`,...items.filter(i=>!i.ok).map(i=>i.line)]:items.map(i=>i.line);
 return rows.map((l,i)=>`${i===rows.length-1?'└':'├'} ${l}`);
};
// The protocol's verdict (an obvious breach summons the lawyer, a doubt asks for his check, otherwise he approves) and
// the reasons behind it; each verdict has its photo of Зак Онн.
function reasons(c,blame=new Map(),standing=new Set(),{single=false,extra=[]}={}){
 const v=verdict(c);
 // Short names in the conclusion: the check lines above already carry the details.
 const label=r=>r.rule==='rookie'?'правило новичка':r.rule==='white'?(c.whiteState==='sold'?'белое правило — продан засчитываемый игрок, замена не отмечена':'белое правило')
  :r.rule==='club'?'лимит клуба NBA':r.rule==='transfers'?(r.certain===false?'лимит трансферов — сделка у дедлайна':'лимит трансферов')
  :r.rule==='duplicate'?(r.certain===false?'уникальность игроков — покупки в одно время':'уникальность игроков')
  :r.rule==='time'?(r.certain?'время сделки — вне 08:00–22:00 МСК':'время сделки — на границе 08:00–22:00 МСК'):esc(r.text);
 // Only breaches the roster already had: no new case is opened, the lawyer is not summoned again.
 const old=v.breaches.length>0&&v.breaches.every(r=>standing.has(r.vid));
 // One item per label, with the deals of the package that broke it («сделки 1, 2»); a breach the roster already had
 // is «не устранено» next to new ones.
 const group=list=>{
  const out=new Map();
  for(const r of list){const st=standing.has(r.vid),k=label(r)+(st&&!old?' (не устранено)':'');if(!out.has(k))out.set(k,new Set());
   if(!st&&!single)for(const n of blame.get(r.vid)||[])out.get(k).add(n);}
  return [...out].map(([k,n])=>n.size?`${k} (${n.size>1?'сделки':'сделка'} ${[...n].sort((a,b)=>a-b).join(', ')})`:k);
 };
 const doubts=[...group(v.doubts),...(v.unmarked?[`белое правило — нет решения лиги по ${names(c.undecided)||'игрокам состава'}`]:[]),...extra];
 const kind=v.kind==='approved'&&extra.length?'check':v.kind;
 return {kind,items:kind==='violation'?group(v.breaches):doubts,doubts,standingOnly:kind==='violation'&&old};
}
const photo=kind=>fileURLToPath(new URL(`./assets/zak-onn/${kind}.jpg`,import.meta.url));
// The lawyer and the commissioner by their Telegram usernames (Telegram then notifies them personally), decrypted for
// this run only; without the key they are named, not tagged.
const handles=loadHandles();
const commissioner=at(handles.commissioner)?`👔 ${at(handles.commissioner)} (${esc(COMMISSIONER.role)}) — к сведению.`:null;
// The team's general manager is tagged too, so the one who made the deal hears of it first.
const gmLine=team=>at(handles.managers[team])?`📣 GM команды: ${at(handles.managers[team])}`:null;
// The bot speaks as Зак Онн; the member who answers for him is tagged to take the case.
const operator=at(handles.lawyer);
// The heading names the broken (or doubtful) rules and the deal that did it, first thing. folded: the lawyer, the
// commissioner and the GM on one line, when the protocol must fit under the photo.
const gmAt=team=>at(handles.managers[team]);
const tags=(team,role)=>[operator&&`${operator} — ${role}`,at(handles.commissioner),gmAt(team)&&`GM ${gmAt(team)}`].filter(Boolean).join(' · ');
const HEAD={violation:(team,v,folded)=>v.standingOnly?[HEADINGS.violation,`🚨 <b>Нарушение не устранено:</b> ${v.items.join('; ')}`,gmLine(team),'']
  :[HEADINGS.violation,`🚨 <b>Нарушено:</b> ${v.items.join('; ')}`,...(folded?[`⚖️ Зак Онн открывает дело.${tags(team,'к расследованию')?' '+tags(team,'к расследованию'):''}`]
   :[`⚖️ Зак Онн открывает дело.${operator?` ${operator} — к расследованию.`:''}`,commissioner,gmLine(team)]),''],
 check:(team,v,folded)=>[HEADINGS.check,`🔎 <b>На проверке:</b> ${v.items.join('; ')}`,...(folded?[`⚖️ Зак Онн сверяет факты.${tags(team,'к проверке')?' '+tags(team,'к проверке'):''}`]
   :[`⚖️ Зак Онн сверяет факты.${operator?` ${operator} — к проверке.`:''}`,commissioner,gmLine(team)]),''],approved:()=>[]};
const watched=team=>WATCHLIST.find(w=>Number(w.team)===Number(team));
// The heading names the rules; the conclusion states the outcome (and a doubt alongside a breach).
const CONCLUSION={violation:(items,doubts,standingOnly)=>`🔏 <b>Заключение:</b> ${standingOnly?'регламент по-прежнему нарушен.':'регламент нарушен, дело открыто.'}${doubts.length?` Также на проверке: ${doubts.join('; ')}.`:''}`,
 check:()=>'🔏 <b>Заключение:</b> явных нарушений нет, нужна проверка.',
 approved:()=>'🔏 <b>Заключение:</b> состав соответствует регламенту.'};
// LEAGUE_FEED_PREVIEW=N: the last N protocols as a test (printed, or posted to the league chat), remembering nothing.
const firstPreview=groups.size-preview;
// When the transfer happened: the watcher's first sight of the journal row (within a minute), in Moscow time.
const when=moves=>{const at=moves.map(m=>m.seenAt).filter(Boolean).sort().pop();return at?`🕒 Трансфер зафиксирован: ${moscow(at)}`:'🕒 Время трансфера: не зафиксировано (до начала наблюдения)';};
// The rules his remark speaks to: the broken ones for a breach, the doubtful ones for a check.
function rulesOf(v,c){
 if(v.kind==='violation')return [...new Set(c.violations.filter(r=>!isDoubt(r,c)).map(r=>r.rule))];
 if(v.kind==='check')return [...new Set([...c.violations.filter(r=>isDoubt(r,c)).map(r=>r.rule),...(c.whiteState==='unmarked'?['unmarked']:[])])];
 return [];
}
// His remark, then the extra lines (circumstances, a joke), which are dropped again when the protocol would not fit
// under his photo (the caption holds 1024 visible characters, including the sending time).
function voice(v,c,moves,team,money,t){
 const seed=key(moves[0]),[main,...more]=remarkLines(v.kind,rulesOf(v,c),Boolean(watched(team)),seed);
 const extra=[circumstances({left:t.left,used:t.used,bank:money,moves:moves.length,maxPrice:Math.max(...moves.map(m=>m.inPrice||0))},seed),joke(seed)].filter(Boolean);
 // Dropped from the end when too long: the joke first, then the circumstances, then the second remark line.
 return [main,...more,...extra.map(l=>`<i>${esc(l)}</i>`)];
}
// Protocol numbers count posted messages (kept in the state): a day's package is posted again, with a new number,
// when the same team adds a deal that day. Before the count was kept, every reported team-day was one protocol.
let issued=state.count??new Set((state.reported||[]).map(k=>`${k.split(':')[0]}:${k.slice(k.lastIndexOf(':')+1)}`)).size;
if(migrated)save();
let number=0;
const plural=n=>n%10===1&&n%100!==11?'сделка':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'сделки':'сделок';
for(const idx of groups.values()){
 number++;
 const moves=idx.map(i=>transfers[i]);
 if(preview?number<=firstPreview:moves.every(m=>!pending.has(m)))continue;
 // Only the deals not yet published are shown (a day's earlier deals had their protocol); the rules are checked on the
 // roster after the whole day's package, since Sports.ru confirms a day's transfers as one.
 const news=preview?moves:moves.filter(m=>pending.has(m)),fresh=m=>news.includes(m);
 const last=idx[idx.length-1],x=moves[0],after=transfers.slice(0,last+1);
 const check=upto=>checkRules({rosters:seasonRosters(transfers.slice(0,upto)),byId,transfers:transfers.slice(0,upto),white:league.white||[],
  checked:(league.whiteChecked||[]).map(String),today:transfers[Math.max(0,upto-1)]?.date||x.date,clubOf,nameOf:p=>p&&name(p.id)})[x.team];
 const all=check(last+1);
 // The hours are judged per transfer: this protocol carries those of its own deals, earlier ones had theirs.
 const own=new Set(news.map(m=>`${m.outId}>${m.inId}:${m.date}`));
 const c={...all,violations:all.violations.filter(v=>v.rule!=='time'||own.has(v.transfer))};
 const money=bank(x.team,after,draftPrice),t=c.transfers;
 // Each breach by what it is about (vid: the rule, the club, the shared player, the week): one the roster already had
 // before this protocol's deals is not theirs («не устранено»), one it had and the deals repair is «устранено», a new one
 // next to an old one of the same rule is new. The transfer limit and the hours are judged per deal and per week.
 const lasting=r=>r.rule!=='time'&&r.rule!=='transfers';
 const before=check(transfers.indexOf(news[0])).violations.filter(lasting),base=new Set(before.map(r=>r.vid));
 const nowBroken=new Set(c.violations.filter(lasting).map(r=>r.vid)),standing=new Set([...nowBroken].filter(v=>base.has(v)));
 const fixed=[...new Set(before.filter(r=>!nowBroken.has(r.vid)).map(r=>r.rule))];
 // Which deal broke each new breach: the one after which it stayed broken to the end of the package (a package is
 // judged on its final roster, so a rookie sold and bought back the same day breaks nothing). The hours go to every deal
 // made outside them.
 const dealNo=k=>news.indexOf(moves[k])+1;
 const steps=idx.map(i=>fresh(transfers[i])?new Set(check(i+1).violations.filter(r=>r.rule!=='time').map(r=>r.vid)):null);
 const blame=new Map(),broke=new Map(),doubted=new Map();
 const mark=(k,r,doubt)=>{const m=doubt?doubted:broke;m.set(k,[...new Set([...(m.get(k)||[]),r.rule])]);blame.set(r.vid,[...new Set([...(blame.get(r.vid)||[]),dealNo(k)])]);};
 for(const r of c.violations){
  if(r.rule==='time'){moves.forEach((m,k)=>{if(fresh(m)&&`${m.outId}>${m.inId}:${m.date}`===r.transfer)mark(k,r,!r.certain);});continue;}
  if(standing.has(r.vid))continue;
  // Walk back over this protocol's deals while the breach stays: the earliest of them made it.
  let k=-1;for(let j=steps.length-1;j>=0;j--){if(!steps[j])continue;if(steps[j].has(r.vid))k=j;else break;}
  if(k>=0)mark(k,r,isDoubt(r,c));
 }
 // A replay the journal cannot confirm (a row dropped on this date, a namesake chosen by price, or the roster Sports.ru
 // shows today differing from the replay) is never approved: the lawyer checks the roster.
 const unsure=warnings.some(w=>w.team===x.team&&(/расходится с составом Sports\.ru/.test(w.message)||w.message.startsWith(x.date+':')&&/нет в составе|не найден в базе|без пары|неоднозначен/.test(w.message)));
 const v=reasons(c,blame,standing,{single:news.length===1,extra:unsure?['состав по журналу не сходится с Sports.ru — сверьте состав команды']:[]});
 // Each player is marked when he counts for a rule: «новичок» (rookie) and «белый» (the league's white list).
 const whiteSet=new Set((league.white||[]).map(String));
 const who=id=>`${esc(name(id))}${byId.get(id)?.isRookie===true?' <i>[новичок]</i>':''}${whiteSet.has(String(id))?' <i>[белый]</i>':''}`;
 const ruleName={rookie:'правило новичка',white:'белое правило',club:'лимит клуба NBA',transfers:'лимит трансферов',time:'время сделки',duplicate:'уникальность игроков'};
 const deals=moves.map((m,i)=>[m,i]).filter(([m])=>fresh(m)).map(([m,i],n)=>({flagged:broke.has(i)||doubted.has(i),
  line:`<b>Сделка${news.length>1?' '+(n+1):''}:</b> ${who(m.outId)} (${m.outPrice}) ⟶ ${who(m.inId)} (${m.inPrice})${broke.has(i)?` — ❌ ${broke.get(i).map(r=>ruleName[r]).join(', ')}`:''}${doubted.has(i)?` — ⏳ ${doubted.get(i).map(r=>ruleName[r]).join(', ')}`:''}`}));
 const repaired=fixed.length?`♻️ <b>Нарушение устранено:</b> ${fixed.map(r=>ruleName[r]).join(', ')}`:null;
 // A package only stale deals make up (seen longer ago than maxAgeMinutes: an outage or an update) is not posted late:
 // it is recorded as reported; a breach or a doubt in it is kept for the owner (the personal bot tells him).
 const maxAge=(LEAGUE_FEED.maxAgeMinutes||0)*60e3,stale=m=>maxAge&&(!m.seenAt||Date.now()-Date.parse(m.seenAt)>maxAge);
 if(!preview&&news.every(stale)){
  console.log(`Not posted (older than ${LEAGUE_FEED.maxAgeMinutes} min): ${news.map(key).join(', ')}`);
  if(v.kind!=='approved')(state.unannounced=state.unannounced||[]).push({team:x.team,date:x.date,kind:v.kind,items:v.items,
   deals:news.map(m=>`${name(m.outId)} → ${name(m.inId)}`),seenAt:news.map(m=>m.seenAt).filter(Boolean).sort().pop()||null});
  for(const m of news){done.add(key(m));pending.delete(m);events.push(...dealEvents(m));}
  save();
  continue;
 }
 const no=`📜 <b>ПРОТОКОЛ ТРАНСФЕРА № ${preview?number:issued+1}</b>`,teamLine=`<b>Команда:</b> ${esc(teamLabel(x.team).replace(/^\d+\.\s*/,''))}`;
 const conclusion=CONCLUSION[v.kind](v.items,v.doubts,v.standingOnly),lines=voice(v,c,news,x.team,money,t),items=checkItems(c,news);
 // The protocol, shortened step by step only while it does not fit under the photo (Telegram's caption limit, counted on
 // the exact text sent): Зак Онн's extra lines (the joke first), the season line, the tags on one line, the passed checks
 // on one line, the deals without remarks as a count. The heading, every deal with ❌ or ⏳, every failed check and the
 // conclusion always stay.
 const build=o=>{
  const clean=deals.filter(d=>!d.flagged).length,shown=o.fold&&news.length>1&&clean?[...deals.filter(d=>d.flagged).map(d=>d.line),`+ ещё ${clean} ${plural(clean)} без нарушений`]:deals.map(d=>d.line);
  return message(...(preview?['🧪 <i>Пример протокола бота лиги FBL: так он появится в чате лиги</i>','']:[]),...HEAD[v.kind](x.team,v,o.tags),no,o.season?`Лига FBL · сезон 2026/27 · ${day(x.date)}`:null,when(news),'',
   teamLine,watched(x.team)?`🎯 <i>Под прицелом Зака Онна с ${ddmm(watched(x.team).since)}</i>`:null,...shown,repaired,'',
   `💰 <b>Баланс после трансферов:</b> ${money}`,
   news.every(m=>isFreeTransfer(m))?`🔁 <b>Трансферы:</b> ∞ · предсезонье, лимит ${t.limit}/нед. — с ${moscow(FBL_TRANSFERS.countFrom).replace(/\.\d{4},/,',')}`
    :`🔁 <b>Осталось трансферов:</b> ${t.left} из ${t.limit} · обновление в пн ${ddmm(t.resetOn)}`,'',
   '<b>Проверка регламента</b>',...tree(items,o.passed),'',conclusion,'',
   // Зак Онн's own word on it (the facts above are the rules check's): his remark on the verdict, then, while the
   // protocol still fits under his photo, a word on the circumstances and now and then a joke; then his signature.
   ...lines.slice(0,1+o.extras),
   v.kind==='approved'?`<i>✅ Одобрено. ${signature(key(news[0]))}</i>`:`<i>${signature(key(news[0]))}</i>`);
 };
 let o={extras:lines.length-1,season:true,tags:false,passed:false,fold:false},text=build(o);
 const shorter=[...lines.slice(1).map(()=>o=>({...o,extras:o.extras-1})),o=>({...o,season:false}),o=>({...o,tags:true}),o=>({...o,passed:true}),o=>({...o,fold:true})];
 for(const step of shorter){if(fitsCaption(text))break;o=step(o);text=build(o);}
 // Still too long (a big package): the photo carries the verdict, the protocol follows as a reply to it.
 const caption=message(...HEAD[v.kind](x.team,v,true),no,teamLine,'',conclusion,'','<i>Протокол — ответом на это сообщение.</i>');
 if(await send(text,{photo:photo(v.kind),caption})&&!preview){for(const m of news){done.add(key(m));pending.delete(m);events.push(...dealEvents(m));}issued++;save();}
}
if(!groups.size)console.log('No new league transfers.');
