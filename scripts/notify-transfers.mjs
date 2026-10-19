// Transfer alerts for one FBL team, sent to Telegram when something new appears on the market,
// a verdict on every new transfer of the other teams (and whether to grab the player they let go),
// and injured free agents about to return or just back.
// Usage: notify-transfers.mjs <sports-current.json> <notify-state.json>
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (without them the message is only printed), FBL_TEAM (default 0).
import fs from 'node:fs';
import {seasonRosters,bank,transfersThisWeek,moscowToday,marketAlerts,bestPackage,parseInjuries,current,allTransfers,transferVerdict,perGame,acquisition,injuredTargets,WEEKLY_TRANSFERS} from '../src/season.js';
import {playerInsights} from '../src/insights.js';
import {teamLabel} from '../src/teams.js';
const [livePath,statePath]=process.argv.slice(2);
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/';
const RAW='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/';
const team=Number(process.env.FBL_TEAM||0),sort='month';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();};
const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
const db=process.env.DB_PATH?JSON.parse(fs.readFileSync(process.env.DB_PATH,'utf8')):await json(SITE+'data/default-draft.json');
const league=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
const previous=await json(RAW+'data/season-live/notify-state.json').catch(()=>({sent:[],injuries:[]}));
const byId=new Map(db.players.map(p=>[p.id,p])),today=moscowToday();
const {transfers,warnings}=allTransfers(db.players,live,league);
const ctx={players:db.players,live,injuries:parseInjuries(live.espnInjuries),today,rosters:seasonRosters(transfers)};
const bankOf=t=>{const x=live.teams?.[t];return Number.isFinite(x?.balance)?x.balance:Number.isFinite(league.banks?.[t])?league.banks[t]:bank(t,transfers,id=>live.players[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0);};
const leftOf=t=>{const x=live.teams?.[t];return Number.isFinite(x?.transfersLeft)?x.transfersLeft:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(transfers,t,today));};
const money=bankOf(team),left=leftOf(team);
for(const w of warnings)console.log('warning:',w.team+1,w.message);
const budget=warnings.filter(w=>w.team>=0&&/превышен/.test(w.message));
const alerts=marketAlerts(ctx,{team,bankMoney:money,sort,minGain:20});
const pack=left>1?bestPackage(ctx,{team,bankMoney:money,k:left,sort}):null;
const hurt=ctx.rosters[team].map(id=>byId.get(id)).filter(p=>p&&ctx.injuries.get(String(p.espnId)))
 .map(p=>{const i=ctx.injuries.get(String(p.espnId));return {key:`${p.id}:${i.status}:${i.returnDate}`,text:`${p.name} — ${i.status}${i.returnDate?' до '+i.returnDate.slice(8,10)+'.'+i.returnDate.slice(5,7):''}`};});
const r=n=>Math.round(n),s=n=>(n>=0?'+':'−')+Math.abs(r(n));
const keys=[...budget.map(w=>'budget:'+w.message),...alerts.map(a=>`${a.outId}>${a.player.id}`),...(pack?.pairs.length>1?[pack.pairs.map(x=>`${x.out.id}>${x.in.id}`).sort().join('+')]:[])];
const fresh=keys.filter(k=>!previous.sent?.includes(k)),freshHurt=hurt.filter(h=>!previous.injuries?.includes(h.key));
const lines=[`🏀 FBL · ${teamLabel(team)}`,`Банк ${money} · трансферов осталось на неделе ${left}/${WEEKLY_TRANSFERS}`];
if(alerts.length){lines.push('','📈 На рынке есть усиление (ФО за 4 недели / сезон):');
 for(const a of alerts.slice(0,5)){const out=current(byId.get(a.outId),ctx);lines.push(`• ${out.name} (${out.price}) → ${a.player.name} (${a.player.price}): ${s(a.gain.month)} / ${s(a.gain.season)}`);}}
if(pack?.pairs.length>1&&pack.gain>0){lines.push('',`🧩 Лучший пакет из ${pack.pairs.length}: ${s(pack.gains.month)} ФО за 4 недели (сезон ${s(pack.gains.season)}), банк после ${pack.bankAfter}`);for(const x of pack.pairs)lines.push(`• ${x.out.name} → ${x.in.name}`);}
if(budget.length){lines.push('','⚠️ Нарушения бюджета по ценам Sports.ru:');for(const w of budget)lines.push(`• ${teamLabel(w.team)}: ${w.message}`);}
if(hurt.length){lines.push('','🩹 Травмы в составе:');for(const h of hurt)lines.push('• '+h.text);}
lines.push('',SITE);
const message=lines.join('\n');
const changed=fresh.length>0||freshHurt.length>0;
console.log(message,'\n\nnew:',fresh,freshHurt.map(h=>h.key));
async function send(text){
 if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID){console.log('Telegram secrets not set: message not sent.');return;}
 const res=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true})});
 if(!res.ok)throw Error('Telegram: '+res.status+' '+await res.text());
 console.log('sent to Telegram');
}
// The analyst's take from the player cards, one pro and one risk, with the current per-game estimate and injury.
function brief(label,p){
 if(!p)return [];
 const {pros,cons}=playerInsights(p,db.players),injury=ctx.injuries.get(String(p.espnId));
 return [`${label} ${p.name}: ${perGame(p,live.players?.[p.sportsId]).value.toFixed(1)} ФО/матч${injury?` · 🩹 ${injury.status}`:''}`,
  ...pros.slice(0,1).map(x=>'  ✅ '+x),...cons.slice(0,1).map(x=>'  ⚠️ '+x)];
}
const swapLine=x=>{const out=current(byId.get(x.outId),ctx);return `${out.name} (${out.price}) → ${x.player.name} (${x.player.price}): ${s(x.gain.month)} ФО за 4 недели / ${s(x.gain.season)} за сезон, банк после ${x.bankAfter}`;};
const packLines=x=>[`пакет из ${x.pairs.length}: ${s(x.gains.month)} ФО за 4 недели / ${s(x.gains.season)} за сезон, банк после ${x.bankAfter}`,
 ...x.pairs.map(q=>`  • ${q.out.name} (${q.out.price}) → ${q.in.name} (${q.in.price})`)];
const dealLines=(head,d)=>d.pack?[`${head} ${packLines(d.pack)[0]}`,...packLines(d.pack).slice(1)]:[`${head} ${swapLine(d.swap)}`];
// Whether my team should pick up a player a rival let go, and how: one swap or a full package of this week's transfers.
function grab(p){
 if(!p)return [];
 if(ctx.rosters.flat().includes(p.id))return [`🔒 ${p.name} уже в другой команде FBL.`];
 const d=acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:left});
 if(d.worth)return dealLines('🎯 Забирай:',d);
 if(!left)return [`⛔ Трансферы на этой неделе закончились.`];
 if(d.swap)return [`🙅 Тебе брать не стоит. Лучший вариант: ${swapLine(d.swap)}`];
 return [`🙅 Тебе ${p.name} не подходит: не влезает по позиции, бюджету или правилу rookie даже пакетом.`];
}
// Every new transfer of the other teams, with the forecast verdict: an upgrade or not, and what would have been better.
const transferKey=x=>`${x.team}:${x.outId}>${x.inId}:${x.date}`,reported=new Set(previous.transfers||[]);
const rival=transfers.filter(x=>x.team!==team&&!reported.has(transferKey(x)));
if(rival.length){
 const blocks=rival.map(x=>{
  const out=byId.get(x.outId),joined=byId.get(x.inId),v=transferVerdict(ctx,x,{bankMoney:bankOf(x.team)});
  const b=[`${teamLabel(x.team)}`,`${x.date.slice(8,10)}.${x.date.slice(5,7)}: ${out?.name} (${x.outPrice}) → ${joined?.name} (${x.inPrice})`];
  if(v)b.push(`${v.label}: ${s(v.gain.month)} ФО за 4 недели, ${s(v.gain.season)} за сезон`);
  b.push(...brief('➖ Ушёл',out),...brief('➕ Пришёл',joined));
  if(v?.best)b.push(`Лучший вариант за те же деньги: ${v.best.player.name} (${v.best.player.price}): ${s(v.best.gain.month)} / ${s(v.best.gain.season)}`);
  b.push(`Банк ${bankOf(x.team)} · трансферов осталось ${leftOf(x.team)}/${WEEKLY_TRANSFERS}`);
  b.push(...grab(out));
  return b.join('\n');});
 const text=[`🔄 Трансферы соперников (${rival.length})`,...blocks,SITE].join('\n\n');
 console.log(text);await send(text);
}
if(changed)await send(message);else console.log('Nothing new for my team: no message.');
// Injured free agents worth a season transfer: warn when one is about to return, and again the moment he is back.
const targets=injuredTargets(ctx,{team,bankMoney:money,k:Math.max(1,left)}),injuryKey=x=>`${x.player.id}:${x.injury.status}:${x.injury.returnDate||''}`;
const warned=new Set(previous.returns||[]),soon=targets.filter(x=>x.soon&&!warned.has(injuryKey(x)));
// Back on the injury-free list and still free: buy now if it pays over the next 4 weeks too.
const back=(previous.watch||[]).map(id=>byId.get(id)).filter(p=>p&&!ctx.injuries.get(String(p.espnId))&&!ctx.rosters.flat().includes(p.id))
 .map(p=>({player:current(p,ctx),...acquisition(ctx,{team,playerId:p.id,bankMoney:money,k:Math.max(1,left)})})).filter(x=>x.worth);
if(soon.length||back.length){
 const date=d=>d?` до ${d.slice(8,10)}.${d.slice(5,7)}`:'';
 const block=(head,x)=>[`${head} ${x.player.name} (${x.player.price})${x.injury?` — ${x.injury.status}${date(x.injury.returnDate)}`:''}`,
  ...dealLines('  🎯',x).map((l,i)=>i?'  '+l:l),...brief(' ',x.player).slice(1)].join('\n');
 const text=['🏥 Свободные игроки после травм',...back.map(x=>block('✅ Вернулся в строй:',x)),...soon.map(x=>block('🔜 Скоро вернётся:',x)),SITE].join('\n\n');
 console.log(text);await send(text);
}
// Remember what was already reported so the same advice is not sent every two hours.
fs.writeFileSync(statePath,JSON.stringify({updatedAt:new Date().toISOString(),sent:[...new Set([...(previous.sent||[]),...keys])].slice(-200),injuries:hurt.map(h=>h.key),
 transfers:[...new Set([...(previous.transfers||[]),...transfers.map(transferKey)])],
 returns:[...new Set([...(previous.returns||[]),...soon.map(injuryKey)])].slice(-500),watch:targets.map(x=>x.player.id)}));
