#!/usr/bin/env node
// FBL awards bot: the league's own Telegram bot of the game-day summary, the Monday awards race, the season records and
// the month's all-position five (ТЗ of 21.10.2026). A bot of its own: its token, its chat, its workflow
// (.github/workflows/awards-bot.yml) and its state branch (data/awards-bot). It only reads the project's data: rosters,
// transfers and prices (sports-current.json of the season watcher, the player database) and the box scores from ESPN.
//
// Usage:
//   node awards-bot/bot.mjs --state DIR             scheduled run: archive finished games, post once the day is over
//   node awards-bot/bot.mjs --preview DAY [--week] [--month]
//                                                   the posts of US game day DAY rebuilt from ESPN; nothing saved or sent
// Env: AWARDS_BOT_TOKEN and AWARDS_CHAT_ID (the league chat), AWARDS_COMMISSIONER_CHAT_ID (the rookie check). Without
// the token and chat the posts are printed and kept in the state as previews, never sent.
// Optional: LIVE_URL (sports-current.json), DB_PATH (a local default-draft.json), NOW (ISO time, for a dry run).
import fs from 'node:fs';
import path from 'node:path';
import {withMarket,allTransfers,stints,seasonRosters} from '../src/season.js';
import {SEASON_START,SEASON_END,MEF_PRICE,RECORD_ALERTS_FROM_DAY,SETTLE_MS,addDays,daysBetween,moscowDay,reportDay,deadline,weekOf,
 isSunday,isMonthEnd,parseScoreboard,parseSummary,makeLeague,settle,dailyBlocks,weeklyBlocks,records,recordNews,races,monthFive,
 withoutRookie} from './core.js';
import {dailyText,weeklyText,racesText,recordsText,monthText,rookieAlert,split,raceKey} from './messages.js';

const args=process.argv.slice(2),flag=f=>args.includes(f),opt=f=>{const i=args.indexOf(f);return i>=0?args[i+1]:null;};
const env=process.env,NOW=env.NOW?Date.parse(env.NOW):Date.now();
const ROOT=new URL('../',import.meta.url);
const local=f=>JSON.parse(fs.readFileSync(new URL(f,ROOT),'utf8'));
const LIVE=env.LIVE_URL||'https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/data/season-live/sports-current.json';
const SITE='https://ruslanmunasipov.github.io/Nba-draft-simulator/data/';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url){
 let last;
 for(let i=0;i<3;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(30e3)});if(r.ok)return await r.json();last=Error(`${url}: ${r.status}`);if(r.status<500)break;}catch(e){last=e;}await sleep(2000*(i+1));}
 throw last;
}

// --- The league as the project sees it now: holdings come from the transfer journals with the time each move was seen.
async function loadLeague(){
 const live=await json(LIVE).catch(()=>json(SITE+'sports-current.json'));
 const db=env.DB_PATH?JSON.parse(fs.readFileSync(env.DB_PATH,'utf8')):await json(SITE+'default-draft.json');
 const players=withMarket(db.players,live),{transfers,warnings}=allTransfers(players,live,local('data/fbl-league.json'));
 for(const w of warnings)console.warn(`team ${w.team+1}: ${w.message}`);
 const league=makeLeague({players,live,holdings:stints(transfers),map:local('data/sports-player-map.json').players,prices:local('data/sports-prices-2026-10-17.json').players});
 const byId=new Map(players.map(p=>[p.id,p])),bySid=new Map(players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p]));
 // The Sports.ru short name, as the league knows its players; ESPN's for the rest of the NBA.
 const who=(a,n)=>{const p=league.player(a);return p?.sportsName||live.players?.[p?.sportsId]?.name||n||String(a);};
 const rookies=new Set(players.filter(p=>p.isRookie===true).map(league.espnOf).filter(Boolean));
 const mef=new Map();
 for(const r of local('data/sports-prices-2026-10-17.json').players)if(r.price>=MEF_PRICE.min&&r.price<=MEF_PRICE.max){
  const e=league.espnOf(bySid.get(String(r.sportsId)));if(e)mef.set(e,r.price);}
 const rosters=seasonRosters(transfers).map(r=>r.map(id=>byId.get(id)));
 return {live,league,who,rookies,mef,rosters};
}

// --- ESPN.
const scoreboard=day=>json(ESPN+'scoreboard?dates='+day.replaceAll('-','')).then(parseScoreboard);
const boxScore=(game,day)=>json(ESPN+'summary?event='+game.id).then(j=>parseSummary(j,game,day));

// --- State: what was archived and posted, the bench slots, last week's race order (data/awards-bot branch).
const STATE_DIR=opt('--state');
const read=(f,empty)=>{try{return JSON.parse(fs.readFileSync(path.join(STATE_DIR,f),'utf8'));}catch{return empty;}};
const fresh=()=>({version:1,days:{},posted:{daily:{},weekly:{},monthly:{},rookies:{}},slots:{},ranks:{},updatedAt:null});
function save(state,archive){
 if(!STATE_DIR)return;fs.mkdirSync(STATE_DIR,{recursive:true});state.updatedAt=new Date().toISOString();
 fs.writeFileSync(path.join(STATE_DIR,'state.json'),JSON.stringify(state,null,1));
 fs.writeFileSync(path.join(STATE_DIR,'archive.json'),JSON.stringify(archive));
}

// --- Telegram.
const TOKEN=env.AWARDS_BOT_TOKEN,CHAT=env.AWARDS_CHAT_ID,COMMISSIONER=env.AWARDS_COMMISSIONER_CHAT_ID;
const live=Boolean(TOKEN&&CHAT)&&!flag('--preview');
async function post(text,chat=CHAT,label='league chat'){
 if(!text)return;
 if(!live||!chat){
  console.log(`\n===== ${label} (preview) =====\n${text}\n`);
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`### ${label} (preview)\n\n\`\`\`\n${text}\n\`\`\`\n\n`);
  return;
 }
 for(const part of split(text)){
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:chat,text:part,parse_mode:'HTML',disable_web_page_preview:true})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body.ok)throw Error(`Telegram ${label}: ${r.status} ${body.description||''}`);
  await sleep(1100);
 }
}

// Archive every finished game of a day not archived yet. Returns the day's games that will still be played.
async function archiveDay(day,state,archive,league){
 const rec=state.days[day]||={games:{}},games=await scoreboard(day);
 for(const g of games){
  const known=rec.games[g.id]||{};
  rec.games[g.id]={...known,tip:g.tip,home:g.home,away:g.away,status:g.status,final:g.final,off:g.off};
  if(!g.final||known.archived)continue;
  archive.lines.push(...settle(await boxScore(g,day),league,state.slots));
  rec.games[g.id].archived=true;
 }
 const pending=games.filter(g=>!g.final&&!g.off);
 if(!pending.length){rec.allFinalAt||=new Date(NOW).toISOString();rec.done=true;}
 // A game ESPN never closes (a suspended one) stops holding the day three days later.
 else if(daysBetween(day,reportDay(NOW))>3)rec.done=true;
 return pending;
}
// Before the Monday post: box scores corrected after the day's post replace the archived numbers (holders stay).
async function refresh(days,archive){
 const ids=new Set(archive.lines.filter(l=>days.includes(l.d)).map(l=>l.e));
 for(const id of ids){
  const old=archive.lines.filter(l=>l.e===id),day=old[0].d,next=new Map((await boxScore({id,tip:old[0].t},day)).map(l=>[l.a,l]));
  for(const l of old){const n=next.get(l.a);if(n)Object.assign(l,{m:n.m,s:n.s,p:n.p,n:n.n,c:n.c});}
 }
}
const ranksOf=r=>Object.fromEntries(Object.entries(r).map(([k,list])=>[k,list.map(raceKey)]));

async function weekly(day,ctx,archive,state,mark){
 const week=weekOf(day),days=Array.from({length:7},(_,i)=>addDays(week.start,i)),today=moscowDay(NOW);
 await refresh(days,archive);
 const all=archive.lines.filter(l=>l.d<=day),r=races(all,{rostered:ctx.league.rostered(),rookies:ctx.rookies,mef:ctx.mef});
 await post(weeklyText(week,weeklyBlocks(all.filter(l=>l.d>=week.start)),ctx.who));
 await post(racesText(week,r,ctx.who,state.ranks));
 await post(recordsText(records(all),ctx.who,today));
 if(mark){state.posted.weekly[week.start]=live?'sent':'preview';state.ranks=ranksOf(r);}
 const missing=withoutRookie(ctx.rosters,p=>p?.isRookie===true);
 if(missing.length&&(!mark||!state.posted.rookies[week.start])){
  await post(rookieAlert(missing),COMMISSIONER,'commissioner');
  if(mark)state.posted.rookies[week.start]=live&&COMMISSIONER?'sent':'preview';
 }
}
async function monthly(day,ctx,archive,state,mark){
 const month=day.slice(0,7),lines=archive.lines.filter(l=>l.d.startsWith(month)&&l.d<=day);
 // Held at the month's end: just before the transfer window opens on the morning after its last game day.
 const end=Date.parse(`${addDays(day,1)}T08:00:00+03:00`)-1,heldAtEnd=new Map();
 for(const p of ctx.league.players){const e=ctx.league.espnOf(p),t=ctx.league.teamsAtTime(p,end);if(e&&t.length)heldAtEnd.set(e,t);}
 await post(monthText(month,monthFive(lines,{heldAtEnd,positionOf:a=>ctx.league.positionOf(ctx.league.player(a))}),ctx.who));
 if(mark)state.posted.monthly[month]=live?'sent':'preview';
}
const dayPost=(day,lines,ctx,missing)=>{
 const mine=lines.filter(l=>l.d===day),before=lines.filter(l=>l.d<day);
 const news=daysBetween(SEASON_START,day)>=RECORD_ALERTS_FROM_DAY?recordNews(before,mine):[];
 return dailyText(day,dailyBlocks(mine),ctx.who,{news,missing,today:moscowDay(NOW)});
};

async function scheduled(){
 const state=read('state.json',fresh()),archive=read('archive.json',{lines:[]}),ctx=await loadLeague();
 const D=reportDay(NOW)>SEASON_END?SEASON_END:reportDay(NOW);
 if(D<SEASON_START){console.log(`Season starts ${SEASON_START}: nothing to do.`);return;}
 let pending=[];
 for(let day=SEASON_START;day<=D;day=addDays(day,1)){
  if(state.days[day]?.done)continue;
  const p=await archiveDay(day,state,archive,ctx.league);if(day===D)pending=p;
  save(state,archive);
 }
 const rec=state.days[D],games=Object.keys(rec?.games||{}).length;
 if(!state.posted.daily[D]){
  if(!games){state.posted.daily[D]='no games';}
  else{
   const settled=rec.allFinalAt&&NOW-Date.parse(rec.allFinalAt)>=SETTLE_MS,late=NOW>=deadline(D);
   if(!settled&&!late){console.log(`${D}: ${pending.length} game(s) still to finish${rec.allFinalAt?', settling':''}.`);save(state,archive);return;}
   await post(dayPost(D,archive.lines,ctx,pending));
   state.posted.daily[D]=live?'sent':'preview';save(state,archive);
  }
 }
 if(isSunday(D)&&state.posted.daily[D]&&!state.posted.weekly[weekOf(D).start]){await weekly(D,ctx,archive,state,true);save(state,archive);}
 if(isMonthEnd(D)&&state.posted.daily[D]&&!state.posted.monthly[D.slice(0,7)]){await monthly(D,ctx,archive,state,true);save(state,archive);}
 save(state,archive);
}
// The posts of a past day rebuilt from ESPN with today's transfer journals: nothing saved or sent.
async function preview(day){
 const ctx=await loadLeague(),state=fresh(),archive={lines:[]};
 for(let d=SEASON_START;d<=day;d=addDays(d,1))await archiveDay(d,state,archive,ctx.league);
 await post(dayPost(day,archive.lines,ctx,[]));
 if(flag('--week')||isSunday(day))await weekly(day,ctx,archive,state,false);
 if(flag('--month')||isMonthEnd(day))await monthly(day,ctx,archive,state,false);
}

const day=opt('--preview');
if(day)await preview(day);
else if(STATE_DIR)await scheduled();
else{console.error('Usage: bot.mjs --state DIR | --preview YYYY-MM-DD [--week] [--month]');process.exit(2);}
