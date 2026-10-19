// Transfer alerts for one FBL team, sent to Telegram when something new appears on the market.
// Usage: notify-transfers.mjs <sports-current.json> <notify-state.json>
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (without them the message is only printed), FBL_TEAM (default 0).
import fs from 'node:fs';
import {seasonRosters,bank,transfersThisWeek,moscowToday,marketAlerts,bestPackage,parseInjuries,current,WEEKLY_TRANSFERS} from '../src/season.js';
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
const ctx={players:db.players,live,injuries:parseInjuries(live.espnInjuries),today,rosters:seasonRosters(league.transfers)};
const money=Number.isFinite(league.banks?.[team])?league.banks[team]:bank(team,league.transfers,id=>live.players[byId.get(id)?.sportsId]?.initialPrice??byId.get(id)?.price??0);
const left=Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(league.transfers,team,today));
const alerts=marketAlerts(ctx,{team,bankMoney:money,sort,minGain:20});
const pack=left>1?bestPackage(ctx,{team,bankMoney:money,k:left,sort}):null;
const hurt=ctx.rosters[team].map(id=>byId.get(id)).filter(p=>p&&ctx.injuries.get(String(p.espnId)))
 .map(p=>{const i=ctx.injuries.get(String(p.espnId));return {key:`${p.id}:${i.status}:${i.returnDate}`,text:`${p.name} — ${i.status}${i.returnDate?' до '+i.returnDate.slice(8,10)+'.'+i.returnDate.slice(5,7):''}`};});
const r=n=>Math.round(n),s=n=>(n>=0?'+':'−')+Math.abs(r(n));
const keys=[...alerts.map(a=>`${a.outId}>${a.player.id}`),...(pack?.pairs.length>1?[pack.pairs.map(x=>`${x.out.id}>${x.in.id}`).sort().join('+')]:[])];
const fresh=keys.filter(k=>!previous.sent?.includes(k)),freshHurt=hurt.filter(h=>!previous.injuries?.includes(h.key));
const lines=[`🏀 FBL · ${teamLabel(team)}`,`Банк ${money} · трансферов осталось на неделе ${left}/${WEEKLY_TRANSFERS}`];
if(alerts.length){lines.push('','📈 На рынке есть усиление (ФО за 4 недели / сезон):');
 for(const a of alerts.slice(0,5)){const out=current(byId.get(a.outId),ctx);lines.push(`• ${out.name} (${out.price}) → ${a.player.name} (${a.player.price}): ${s(a.gain.month)} / ${s(a.gain.season)}`);}}
if(pack?.pairs.length>1&&pack.gain>0){lines.push('',`🧩 Лучший пакет из ${pack.pairs.length}: ${s(pack.gains.month)} ФО за 4 недели (сезон ${s(pack.gains.season)}), банк после ${pack.bankAfter}`);for(const x of pack.pairs)lines.push(`• ${x.out.name} → ${x.in.name}`);}
if(hurt.length){lines.push('','🩹 Травмы в составе:');for(const h of hurt)lines.push('• '+h.text);}
lines.push('',SITE);
const message=lines.join('\n');
const changed=fresh.length>0||freshHurt.length>0;
console.log(message,'\n\nnew:',fresh,freshHurt.map(h=>h.key));
if(changed&&process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID){
 const res=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:message,disable_web_page_preview:true})});
 if(!res.ok)throw Error('Telegram: '+res.status+' '+await res.text());
 console.log('sent to Telegram');
}else console.log(changed?'Telegram secrets not set: message not sent.':'Nothing new: no message.');
// Remember what was already reported so the same advice is not sent every two hours.
fs.writeFileSync(statePath,JSON.stringify({updatedAt:new Date().toISOString(),sent:[...new Set([...(previous.sent||[]),...keys])].slice(-200),injuries:hurt.map(h=>h.key)}));
