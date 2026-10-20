// FBL league feed: every Sports.ru transfer of the league, posted to the league's own Telegram chat with the rules check
// of the roster it leaves (rookie, «белое правило», two per NBA club, the FBL transfer limit). No analytics: what
// happened and whether the roster complies. A team's transfers of one day are one message (Sports.ru confirms them as a
// package), checked on the roster after the whole package.
// Usage: league-feed.mjs <sports-current.json> <league-state.json>
// Env: LEAGUE_TELEGRAM_CHAT_ID, LEAGUE_TELEGRAM_BOT_TOKEN (defaults to TELEGRAM_BOT_TOKEN). Without them nothing is
// marked as posted, so the feed starts complete once the chat is set.
import fs from 'node:fs';
import {seasonRosters,allTransfers,withMarket} from '../src/season.js';
import {checkRules,LAWYER} from '../src/rules.js';
import {teamLabel} from '../src/teams.js';
import {esc,message,sender} from './telegram-format.mjs';
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
// A player as the league sees him on Sports.ru: Russian name, club, role, and the price of the deal.
function who(id,price){
 const p=byId.get(id),x=live.players?.[p?.sportsId]||{};
 return [x.fullName||p?.name||String(id),x.club||p?.sportsClub,x.role,Number.isFinite(price)?`${price}`:null].filter(Boolean);
}
const key=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`,done=new Set(state.reported||[]);
// New transfers grouped by team and day, in the order they happened.
const groups=new Map();
transfers.forEach((x,i)=>{if(done.has(key(x)))return;const g=`${x.team}:${x.date}`;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(i);});
function checkLines(c){
 const t=c.transfers,white=c.whiteState==='ok'?`✅ Белое правило: ${c.whites.map(p=>esc(live.players?.[p.sportsId]?.fullName||p.name)).join(', ')}`
  :c.whiteState==='unmarked'?`⏳ Белое правило: нет решения лиги по ${c.undecided.map(p=>esc(live.players?.[p.sportsId]?.fullName||p.name)).join(', ')||'игрокам состава'}`
  :'❌ Белое правило: в составе нет засчитываемого игрока';
 const bad=r=>c.violations.some(v=>v.rule===r);
 return [bad('rookie')?'❌ Новичок: в составе нет новичка':`✅ Новичок: ${c.rookies.map(p=>esc(live.players?.[p.sportsId]?.fullName||p.name)).join(', ')}`,white,
  bad('club')?`❌ Клубы NBA: ${esc(c.violations.find(v=>v.rule==='club').text)}`:'✅ Не больше двух игроков одного клуба NBA',
  `${bad('transfers')?'❌':'✅'} Трансферы на неделе лиги: ${t.used} из ${t.limit} (новые — с ${ddmm(t.resetOn)})`];
}
for(const idx of groups.values()){
 const moves=idx.map(i=>transfers[i]),last=idx[idx.length-1],x=moves[0];
 const after=transfers.slice(0,last+1),rosters=seasonRosters(after);
 const c=checkRules({rosters,byId,transfers:after,white:league.white||[],checked:(league.whiteChecked||[]).map(String),today:moves[moves.length-1].date,clubOf})[x.team];
 const ok=!c.violations.length;
 const text=message(`🔄 <b>${moves.length>1?`Трансферы FBL · ${moves.length}`:'Трансфер FBL'}</b> · ${day(x.date)}`,`🏀 <b>${esc(teamLabel(x.team))}</b>`,'',
  ...moves.flatMap((m,i)=>[...(moves.length>1?[`<b>${i+1}.</b>`]:[]),`➖ ${esc(who(m.outId,m.outPrice).join(' · '))}`,`➕ <b>${esc(who(m.inId,m.inPrice)[0])}</b> · ${esc(who(m.inId,m.inPrice).slice(1).join(' · '))}`]),
  '','📋 <b>Проверка регламента после трансфера</b>',...checkLines(c),'',
  ok?'✅ <b>Состав соответствует регламенту</b>':`❌ <b>Нарушение регламента</b> — вопрос к юристу лиги ${esc(LAWYER.name)}`);
 if(await send(text)){for(const m of moves)done.add(key(m));if(configured)fs.writeFileSync(statePath,JSON.stringify({reported:[...done],updatedAt:new Date().toISOString()}));}
}
if(!groups.size)console.log('No new league transfers.');
