// FBL league feed: every Sports.ru transfer of the league, posted to the league's own Telegram chat with the rules check
// of the roster it leaves (rookie, «белое правило», two per NBA club, the FBL transfer limit). No analytics: what
// happened and whether the roster complies. A team's transfers of one day are one message (Sports.ru confirms them as a
// package), checked on the roster after the whole package.
// Usage: league-feed.mjs <sports-current.json> <league-state.json>
// Env: LEAGUE_TELEGRAM_CHAT_ID, LEAGUE_TELEGRAM_BOT_TOKEN (defaults to TELEGRAM_BOT_TOKEN). Without them nothing is
// marked as posted, so the feed starts complete once the chat is set.
import fs from 'node:fs';
import {seasonRosters,allTransfers,withMarket,bank} from '../src/season.js';
import {checkRules,LAWYER} from '../src/rules.js';
import {teamLabel} from '../src/teams.js';
import {esc,message,sender,moscow} from './telegram-format.mjs';
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
const {configured,send}=sender(process.env.LEAGUE_TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN,process.env.LEAGUE_TELEGRAM_CHAT_ID);
const clubOf=p=>live.players?.[p.sportsId]?.club||p.sportsClub;
const day=d=>`${d.slice(8,10)}.${d.slice(5,7)}.${d.slice(0,4)}`,ddmm=d=>`${d.slice(8,10)}.${d.slice(5,7)}`;
// A player as the league sees him on Sports.ru (Russian name).
const name=id=>{const p=byId.get(id);return live.players?.[p?.sportsId]?.fullName||p?.name||String(id);};
const names=list=>list.map(p=>esc(name(p.id))).join(', ');
const key=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`,done=new Set(state.reported||[]);
// Transfers grouped by team and day in the order they happened; a group's place in that order is its protocol number.
const groups=new Map();
transfers.forEach((x,i)=>{const g=`${x.team}:${x.date}`;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i);});
// Sports.ru money: the cap, minus the draft prices, plus every sale, minus every purchase up to the given transfer.
const draftPrice=id=>live.players?.[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0;
function checkLines(c){
 const bad=r=>c.violations.some(v=>v.rule===r),t=c.transfers;
 const white=c.whiteState==='ok'?`✅ ${names(c.whites)}`:c.whiteState==='unmarked'?`⏳ нет решения лиги по ${names(c.undecided)||'игрокам состава'}`:'❌ нет засчитываемого игрока';
 return [`├ Новичок в составе — ${bad('rookie')?'❌ нет':'✅ '+names(c.rookies)}`,`├ Белое правило — ${white}`,
  `├ Лимит клуба NBA (2) — ${bad('club')?'❌ '+esc(c.violations.find(v=>v.rule==='club').text):'✅'}`,
  `└ Лимит трансферов — ${bad('transfers')?'❌':'✅'} ${t.used}/${t.limit}`];
}
// LEAGUE_FEED_PREVIEW=N: post the last N protocols as a test (wherever the chat points), remember nothing.
const preview=Number(process.env.LEAGUE_FEED_PREVIEW)||0,firstPreview=groups.size-preview;
// When the transfer happened: the watcher's first sight of the journal row (within a minute), in Moscow time.
const when=moves=>{const at=moves.map(m=>m.seenAt).filter(Boolean).sort().pop();return at?`🕒 Трансфер зафиксирован: ${moscow(at)}`:'🕒 Время трансфера: не зафиксировано (до начала наблюдения)';};
let number=0;
for(const idx of groups.values()){
 number++;
 const moves=idx.map(i=>transfers[i]);
 if(preview?number<=firstPreview:moves.every(m=>done.has(key(m))))continue;
 const last=idx[idx.length-1],x=moves[0],after=transfers.slice(0,last+1),rosters=seasonRosters(after);
 const c=checkRules({rosters,byId,transfers:after,white:league.white||[],checked:(league.whiteChecked||[]).map(String),today:moves[moves.length-1].date,clubOf})[x.team];
 const money=bank(x.team,after,draftPrice),t=c.transfers;
 const deals=moves.map((m,i)=>`<b>Сделка${moves.length>1?' '+(i+1):''}:</b> ${esc(name(m.outId))} (${m.outPrice}) ⟶ ${esc(name(m.inId))} (${m.inPrice})`);
 const conclusion=c.violations.length?`🔏 <b>Заключение:</b> выявлено нарушение — ${c.violations.map(v=>esc(v.text)).join('; ')}. Материалы направлены юристу лиги ${esc(LAWYER.name)} для рассмотрения.`
  :'🔏 <b>Заключение:</b> состав соответствует регламенту.';
 const text=message(...(preview?['🧪 <i>Тест ленты лиги: так протокол увидит чат FBL</i>','']:[]),`📜 <b>ПРОТОКОЛ ТРАНСФЕРА № ${number}</b>`,`Лига FBL · сезон 2026/27 · ${day(x.date)}`,when(moves),'',
  `<b>Команда:</b> ${esc(teamLabel(x.team).replace(/^\d+\.\s*/,''))}`,...deals,'',
  `💰 <b>Баланс после трансферов:</b> ${money}`,`🔁 <b>Осталось трансферов:</b> ${t.left} из ${t.limit} · обновление в пн ${ddmm(t.resetOn)}`,'',
  '<b>Проверка регламента</b>',...checkLines(c),'',conclusion,`<i>Юрист лиги: ${esc(LAWYER.name)}</i>`);
 if(await send(text)&&!preview){for(const m of moves)done.add(key(m));if(configured)fs.writeFileSync(statePath,JSON.stringify({reported:[...done],updatedAt:new Date().toISOString()}));}
}
if(!groups.size)console.log('No new league transfers.');
