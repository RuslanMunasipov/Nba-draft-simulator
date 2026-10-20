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
import {seasonRosters,allTransfers,withMarket,bank} from '../src/season.js';
import {fileURLToPath} from 'node:url';
import {checkRules,verdict,transferTime,timeLabel,TRANSFER_HOURS,LAWYER,COMMISSIONER,LEAGUE_FEED,WATCHLIST,isFreeTransfer} from '../src/rules.js';
import {HEADINGS,remark,circumstances,joke,signature} from './zak-voice.mjs';
import {loadHandles,at} from './handles.mjs';
import {teamLabel} from '../src/teams.js';
import {esc,message,sender,moscow,plainText,CAPTION_LIMIT} from './telegram-format.mjs';
const [livePath,statePath]=process.argv.slice(2);
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/';
const RAW='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();};
const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
const db=process.env.DB_PATH?JSON.parse(fs.readFileSync(process.env.DB_PATH,'utf8')):await json(SITE+'data/default-draft.json');
const league=await json(RAW+'main/data/fbl-league.json').catch(()=>JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8')));
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):await json(RAW+'data/season-live/league-state.json').catch(()=>({reported:[]}));
const players=withMarket(db.players,live),byId=new Map(players.map(p=>[p.id,p]));
const {transfers}=allTransfers(players,live,league);
// The league feed posts only through the league's own bot into the league's own chat. The personal bot or chat in its
// place is refused, even for a test, so no league message ever reaches the personal chat.
const leagueToken=process.env.LEAGUE_TELEGRAM_BOT_TOKEN,leagueChat=process.env.LEAGUE_TELEGRAM_CHAT_ID;
if(leagueToken&&(leagueToken===process.env.TELEGRAM_BOT_TOKEN||(leagueChat&&leagueChat===process.env.TELEGRAM_CHAT_ID))){
 console.error('League feed refused: the league bot and chat must differ from the personal ones.');process.exit(1);}
const {configured,send}=sender(leagueToken,leagueChat);
const clubOf=p=>live.players?.[p.sportsId]?.club||p.sportsClub;
const day=d=>`${d.slice(8,10)}.${d.slice(5,7)}.${d.slice(0,4)}`,ddmm=d=>`${d.slice(8,10)}.${d.slice(5,7)}`;
// A player as the league sees him on Sports.ru (Russian name).
const name=id=>{const p=byId.get(id);return live.players?.[p?.sportsId]?.fullName||p?.name||String(id);};
const names=list=>list.map(p=>esc(name(p.id))).join(', ');
const key=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`,done=new Set(state.reported||[]);
// Transfers grouped by team and day in the order they happened; a group's place in that order is its protocol number.
// The league chat starts at leagueFeed.since: transfers the watcher saw before it (or never timed) get no protocol and
// no number. A preview shows every transfer since the draft.
const preview=Number(process.env.LEAGUE_FEED_PREVIEW)||0;
const posted=x=>preview||!LEAGUE_FEED.since||(x.seenAt&&Date.parse(x.seenAt)>=Date.parse(LEAGUE_FEED.since));
const groups=new Map();
transfers.forEach((x,i)=>{if(!posted(x))return;const g=`${x.team}:${x.date}`;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i);});
// Sports.ru money: the cap, minus the draft prices, plus every sale, minus every purchase up to the given transfer.
const draftPrice=id=>live.players?.[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0;
function checkLines(c,moves){
 const bad=r=>c.violations.some(v=>v.rule===r),t=c.transfers;
 const white=c.whiteState==='ok'?`✅ ${names(c.whites)}`:c.whiteState==='unmarked'?`⏳ нет решения лиги по ${names(c.undecided)||'игрокам состава'}`
  :c.whiteState==='sold'?'⏳ продан засчитываемый игрок, другого не отмечено':'❌ нет засчитываемого игрока';
 return [`├ Новичок в составе — ${bad('rookie')?'❌ нет':'✅ '+names(c.rookies)}`,`├ Белое правило — ${white}`,
  `├ Лимит клуба NBA (2) — ${bad('club')?'❌ '+esc(c.violations.find(v=>v.rule==='club').text):'✅'}`,
  moves.every(m=>isFreeTransfer(m))?'├ Лимит трансферов — ✅ предсезонье, без лимита':`├ Лимит трансферов — ${bad('transfers')?'❌':'✅'} ${t.used}/${t.limit}`,
  `└ Время сделки (${TRANSFER_HOURS.from}–${TRANSFER_HOURS.to} МСК) — ${[...new Set(moves.map(m=>{const x=transferTime(m);return `${{ok:'✅',breach:'❌',doubt:'⏳',unknown:'❔'}[x.state]} ${timeLabel(x)}`;}))].join(', ')}`];
}
// The protocol's verdict (an obvious breach summons the lawyer, a doubt asks for his check, otherwise he approves) and
// the reasons behind it; each verdict has its photo of Зак Онн.
function reasons(c,blame=new Map()){
 const v=verdict(c);
 // Short names in the conclusion: the check lines above already carry the details.
 const label=r=>r.rule==='rookie'?'правило новичка':r.rule==='white'?(c.whiteState==='sold'?'белое правило — продан засчитываемый игрок, замена не отмечена':'белое правило')
  :r.rule==='club'?'лимит клуба NBA':r.rule==='transfers'?'лимит трансферов':r.rule==='time'?(r.certain?'время сделки — вне 08:00–22:00 МСК':'время сделки — на границе 08:00–22:00 МСК'):esc(r.text);
 const doubts=[...v.doubts.map(label),...(v.unmarked?[`белое правило — нет решения лиги по ${names(c.undecided)||'игрокам состава'}`]:[])];
 // Which deal of the package broke it, when there are several.
 const by=r=>blame.has(r.rule)?`${label(r)} (${blame.get(r.rule)})`:label(r);
 const doubted=[...v.doubts.map(by),...(v.unmarked?[`белое правило — нет решения лиги по ${names(c.undecided)||'игрокам состава'}`]:[])];
 return {kind:v.kind,items:v.kind==='violation'?[...new Set(v.breaches.map(by))]:doubted,doubts:doubted};
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
// The heading names the broken (or doubtful) rules and the deal that did it, first thing.
const HEAD={violation:(team,v)=>[HEADINGS.violation,`🚨 <b>Нарушено:</b> ${v.items.join('; ')}`,`⚖️ Зак Онн открывает дело.${operator?` ${operator} — к расследованию.`:''}`,commissioner,gmLine(team),''],
 check:(team,v)=>[HEADINGS.check,`🔎 <b>На проверке:</b> ${v.items.join('; ')}`,`⚖️ Зак Онн сверяет факты.${operator?` ${operator} — к проверке.`:''}`,commissioner,gmLine(team),''],approved:()=>[]};
const watched=team=>WATCHLIST.find(w=>Number(w.team)===Number(team));
// The heading names the rules; the conclusion states the outcome (and a doubt alongside a breach).
const CONCLUSION={violation:(items,doubts)=>`🔏 <b>Заключение:</b> регламент нарушен, дело открыто.${doubts.length?` Также на проверке: ${doubts.join('; ')}.`:''}`,
 check:()=>'🔏 <b>Заключение:</b> явных нарушений нет, нужна проверка.',
 approved:()=>'🔏 <b>Заключение:</b> состав соответствует регламенту.'};
// LEAGUE_FEED_PREVIEW=N: the last N protocols as a test (printed, or posted to the league chat), remembering nothing.
const firstPreview=groups.size-preview;
// When the transfer happened: the watcher's first sight of the journal row (within a minute), in Moscow time.
const when=moves=>{const at=moves.map(m=>m.seenAt).filter(Boolean).sort().pop();return at?`🕒 Трансфер зафиксирован: ${moscow(at)}`:'🕒 Время трансфера: не зафиксировано (до начала наблюдения)';};
// The rules his remark speaks to: the broken ones for a breach, the doubtful ones for a check.
function rulesOf(v,c){
 if(v.kind==='violation')return [...new Set(c.violations.filter(r=>!(r.rule==='white'&&c.whiteState==='sold')&&(r.rule!=='time'||r.certain)).map(r=>r.rule))];
 if(v.kind==='check')return [...c.violations.filter(r=>(r.rule==='time'&&!r.certain)||(r.rule==='white'&&c.whiteState==='sold')).map(r=>r.rule),...(c.whiteState==='unmarked'?['unmarked']:[])];
 return [];
}
// His remark, then the extra lines (circumstances, a joke), which are dropped again when the protocol would not fit
// under his photo (the caption holds 1024 visible characters, including the sending time).
function voice(v,c,moves,team,money,t){
 const seed=key(moves[0]),lines=[remark(v.kind,rulesOf(v,c),Boolean(watched(team)),seed)];
 const extra=[circumstances({left:t.left,used:t.used,bank:money,moves:moves.length,maxPrice:Math.max(...moves.map(m=>m.inPrice||0))},seed),joke(seed)].filter(Boolean);
 return [...lines,...extra.map(l=>`<i>${esc(l)}</i>`)];
}
// Protocol numbers count posted messages (kept in the state): a day's package is posted again, with a new number,
// when the same team adds a deal that day. Before the count was kept, every reported team-day was one protocol.
let issued=state.count??new Set((state.reported||[]).map(k=>`${k.split(':')[0]}:${k.slice(k.lastIndexOf(':')+1)}`)).size;
let number=0;
for(const idx of groups.values()){
 number++;
 const moves=idx.map(i=>transfers[i]);
 if(preview?number<=firstPreview:moves.every(m=>done.has(key(m))))continue;
 const last=idx[idx.length-1],x=moves[0],after=transfers.slice(0,last+1),rosters=seasonRosters(after);
 const all=checkRules({rosters,byId,transfers:after,white:league.white||[],checked:(league.whiteChecked||[]).map(String),today:moves[moves.length-1].date,clubOf,nameOf:p=>p&&name(p.id)})[x.team];
 // The hours are judged per transfer: this protocol carries those of its own deals, earlier ones had theirs.
 const own=new Set(moves.map(m=>`${m.outId}>${m.inId}:${m.date}`));
 const c={...all,violations:all.violations.filter(v=>v.rule!=='time'||own.has(v.transfer))};
 const money=bank(x.team,after,draftPrice),t=c.transfers;
 // Which deal broke each rule: the one after which the rule stayed broken to the end of the package (a package is
 // judged on its final roster, so a rookie sold and bought back the same day breaks nothing). Time is per deal.
 const dealName=k=>moves.length>1?`сделка ${k+1}`:'сделка';
 const steps=idx.map(i=>new Set(checkRules({rosters:seasonRosters(transfers.slice(0,i+1)),byId,transfers:transfers.slice(0,i+1),white:league.white||[],
  checked:(league.whiteChecked||[]).map(String),today:transfers[i].date,clubOf})[x.team].violations.filter(r=>r.rule!=='time').map(r=>r.rule)));
 const blame=new Map(),broke=new Map(),doubted=new Map();
 for(const r of new Set(c.violations.map(r=>r.rule))){
  if(r==='time'){const k=moves.findIndex(m=>transferTime(m).state!=='ok'&&transferTime(m).state!=='unknown');
   if(k>=0){blame.set(r,dealName(k));if(transferTime(moves[k]).state==='breach')broke.set(k,[...(broke.get(k)||[]),r]);else doubted.set(k,[...(doubted.get(k)||[]),r]);}continue;}
  let k=steps.length-1;while(k>0&&steps[k-1].has(r))k--;
  if(steps[k]?.has(r)){blame.set(r,dealName(k));broke.set(k,[...(broke.get(k)||[]),r]);}
 }
 // Each player is marked when he counts for a rule: «новичок» (rookie) and «белый» (the league's white list).
 const whiteSet=new Set((league.white||[]).map(String));
 const who=id=>`${esc(name(id))}${byId.get(id)?.isRookie===true?' <i>[новичок]</i>':''}${whiteSet.has(String(id))?' <i>[белый]</i>':''}`;
 const ruleName={rookie:'правило новичка',white:'белое правило',club:'лимит клуба NBA',transfers:'лимит трансферов',time:'время сделки'};
 const deals=moves.map((m,i)=>`<b>Сделка${moves.length>1?' '+(i+1):''}:</b> ${who(m.outId)} (${m.outPrice}) ⟶ ${who(m.inId)} (${m.inPrice})${broke.has(i)?` — ❌ ${broke.get(i).map(r=>ruleName[r]).join(', ')}`:''}${doubted.has(i)?` — ⏳ ${doubted.get(i).map(r=>ruleName[r]).join(', ')}`:''}`);
 const v=reasons(c,moves.length>1?blame:new Map());
 const text=message(...(preview?['🧪 <i>Пример протокола бота лиги FBL: так он появится в чате лиги</i>','']:[]),...HEAD[v.kind](x.team,v),`📜 <b>ПРОТОКОЛ ТРАНСФЕРА № ${preview?number:issued+1}</b>`,`Лига FBL · сезон 2026/27 · ${day(x.date)}`,when(moves),'',
  `<b>Команда:</b> ${esc(teamLabel(x.team).replace(/^\d+\.\s*/,''))}`,watched(x.team)?`🎯 <i>Под прицелом Зака Онна с ${ddmm(watched(x.team).since)}</i>`:null,...deals,'',
  `💰 <b>Баланс после трансферов:</b> ${money}`,
  moves.every(m=>isFreeTransfer(m))?`🔁 <b>Трансферы:</b> ∞ · предсезонье, лимит FBL (${t.limit} в неделю) — с первой игры сезона`
   :`🔁 <b>Осталось трансферов:</b> ${t.left} из ${t.limit} · обновление в пн ${ddmm(t.resetOn)}`,'',
  '<b>Проверка регламента</b>',...checkLines(c,moves),'',CONCLUSION[v.kind](v.items,v.doubts),'',
  // Зак Онн's own word on it (the facts above are the rules check's): his remark on the verdict, then, while the
  // protocol still fits under his photo, a word on the circumstances and now and then a joke; then his signature.
  ...voice(v,c,moves,x.team,money,t),
  v.kind==='approved'?`<i>✅ Одобрено. ${signature(key(moves[0]))}</i>`:`<i>${signature(key(moves[0]))}</i>`);
 // Extra lines (circumstances, joke) go first when the protocol would not fit under the photo.
 let fitted=text;
 for(const l of voice(v,c,moves,x.team,money,t).slice(1).reverse())
  if(plainText(fitted).length+45>CAPTION_LIMIT)fitted=fitted.replace('\n'+l,'');
 if(await send(fitted,{photo:photo(v.kind)})&&!preview){for(const m of moves)done.add(key(m));issued++;if(configured)fs.writeFileSync(statePath,JSON.stringify({reported:[...done],count:issued,updatedAt:new Date().toISOString()}));}
}
if(!groups.size)console.log('No new league transfers.');
