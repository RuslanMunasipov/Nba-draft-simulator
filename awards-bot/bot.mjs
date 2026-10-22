#!/usr/bin/env node
// FBL awards bot: the league's own Telegram bot of the game-day summary, the Monday awards race, the season records and
// the month's all-position five (ТЗ of 21.10.2026). A bot of its own: its token, its chat, its workflow
// (.github/workflows/awards-bot.yml) and its state branch (data/awards-bot). It only reads the project's data: rosters,
// transfers and prices (sports-current.json of the season watcher, the player database) and the box scores from ESPN.
//
// Usage:
//   node awards-bot/bot.mjs --state DIR             scheduled run: archive finished games, post once the day is over
//   node awards-bot/bot.mjs --state DIR --resend DAY
//                                                   the day's post sent again from the archive (a corrected layout); the
//                                                   state is not changed
//   node awards-bot/bot.mjs --preview DAY [--week] [--month] [--cards DIR] [--holiday KEY]
//                                                   the posts of US game day DAY rebuilt from ESPN; nothing saved or sent
//                                                   (--cards: the albums' cards as PNG files in DIR, with their captions;
//                                                   --holiday: the cards dressed for that holiday of holidays.js;
//                                                   --mike: Mike Roffon's interview written by Claude and, with
//                                                   OPENAI_API_KEY, drawn, ~$0.03)
//   node awards-bot/bot.mjs --mike-day DAY --state DIR [--send] [--cards DIR]
//                                                   Mike Roffon's interview of an archived day by hand (workflow
//                                                   mike-roffon.yml): written and drawn, posted into the league chat
//                                                   by his bot with --send; the state is only read, never saved
// Env: AWARDS_BOT_TOKEN and AWARDS_CHAT_ID (the league chat), AWARDS_COMMISSIONER_CHAT_ID (the rookie check). Without
// the token and chat the posts are printed and kept in the state as previews, never sent. Every post of the day, the week
// and the month goes as one album of cards (cards.js, drawn by render.mjs with Chromium: CHROMIUM_PATH for one of its
// own); when the cards cannot be drawn or sent, its text goes instead.
// Optional: LIVE_URL (sports-current.json), DB_PATH (a local default-draft.json), NOW (ISO time, for a dry run),
// WATCH_MINUTES (how long one run may stay, 330 by default: GitHub stops a job at 360), CHAIN (stay the whole time and
// let the workflow start the next run).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {withMarket,allTransfers,stints,seasonRosters} from '../src/season.js';
import {SEASON_START,SEASON_END,MEF_PRICE,RECORD_ALERTS_FROM_DAY,LEAD_MS,nextStep,addDays,daysBetween,moscowDay,usDay,weekOf,form,
 isSunday,isMonthEnd,parseScoreboard,parseSummary,makeLeague,settle,dailyBlocks,weeklyBlocks,records,recordNews,races,monthFive,
 withoutRookie,siteSummary} from './core.js';
import {dailyText,weeklyText,racesText,recordsText,monthText,rookieAlert,split,raceKey} from './messages.js';
import {dayAlbum,weekAlbum,monthAlbum} from './cards.js';
import {holidayOf,HOLIDAYS} from './holidays.js';
import {interviewFacts,interviewFor,interviewText,interviewCaption,interviewPicture} from './mike-roffon.js';
import {generate,cost} from '../scripts/image-pipeline.mjs';
import {claudeConfigured} from '../scripts/claude-text.mjs';

const args=process.argv.slice(2),flag=f=>args.includes(f),opt=f=>{const i=args.indexOf(f);return i>=0?args[i+1]:null;};
const env=process.env,START=Date.now(),now=()=>env.NOW?Date.parse(env.NOW)+Date.now()-START:Date.now();
const WATCH_MS=(Number(env.WATCH_MINUTES)||330)*60e3,POLL_MS=60e3;
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
// The league of the current pass (loadLeague), for the site's races; until the first one site.json keeps its races.
let siteLeague=null;
function save(state,archive){
 if(!STATE_DIR)return;fs.mkdirSync(STATE_DIR,{recursive:true});state.updatedAt=new Date().toISOString();
 fs.writeFileSync(path.join(STATE_DIR,'state.json'),JSON.stringify(state,null,1));
 fs.writeFileSync(path.join(STATE_DIR,'archive.json'),JSON.stringify(archive));
 const ctx=siteLeague,before=read('site.json',null);
 const who=a=>{const p=ctx?.league.player(a);return p?{id:p.id,sid:p.sportsId?String(p.sportsId):null}:null;};
 const site=siteSummary(archive.lines,state,ctx?{rostered:ctx.league.rostered(),rookies:ctx.rookies,mef:ctx.mef,who}:{});
 if(!site.races&&before?.races)site.races=before.races;
 fs.writeFileSync(path.join(STATE_DIR,'site.json'),JSON.stringify(site));
}

// What was posted reaches the state branch at once (a run stays for hours; one cut short after a post must not lead
// the next run to post again). Needs GH_TOKEN and GITHUB_REPOSITORY (the workflow's); without them only the files change.
function pushState(state,archive){
 save(state,archive);
 const token=env.GH_TOKEN,repo=env.GITHUB_REPOSITORY;if(!STATE_DIR||!token||!repo)return;
 const git=(...a)=>execFileSync('git',['-C',STATE_DIR,...a],{stdio:'pipe'});
 try{
  if(!fs.existsSync(path.join(STATE_DIR,'.git'))){git('init','-q','-b','data/awards-bot');git('config','user.name','github-actions[bot]');
   git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');}
  git('add','state.json','archive.json','site.json');git('commit','-q','--allow-empty','-m',`Awards bot state ${new Date().toISOString().slice(0,16)}Z`);
  git('push','-qf',`https://x-access-token:${token}@github.com/${repo}.git`,'data/awards-bot');
 }catch{console.warn('State push failed: the end of the run saves it.');}
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

// --- Albums: a post's cards drawn and sent as one Telegram media group, the caption (with its hashtags) on the first.
// A post never gets lost to its cards: when they cannot be drawn or sent, its text goes instead.
const CARDS_DIR=opt('--cards'),FORCED=opt('--holiday');
const holidayFor=day=>FORCED?HOLIDAYS.find(h=>h.key===FORCED)||null:holidayOf(day);
async function sendAlbum(pngs,caption){
 const one=pngs.length===1;
 for(let attempt=0;;attempt++){
  const data=new FormData();data.append('chat_id',String(CHAT));
  if(one){data.append('photo',new Blob([pngs[0]],{type:'image/png'}),'card-1.png');data.append('caption',caption);data.append('parse_mode','HTML');}
  else{data.append('media',JSON.stringify(pngs.map((_,i)=>({type:'photo',media:`attach://c${i}`,...i===0?{caption,parse_mode:'HTML'}:{}}))));
   pngs.forEach((png,i)=>data.append(`c${i}`,new Blob([png],{type:'image/png'}),`card-${i+1}.png`));}
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/${one?'sendPhoto':'sendMediaGroup'}`,{method:'POST',body:data});
  const body=await r.json().catch(()=>({}));
  if(r.ok&&body.ok)return;
  if(attempt>=3||(r.status!==429&&r.status<500))throw Error(`Telegram album: ${r.status} ${body.description||''}`);
  await sleep(1000*(body.parameters?.retry_after||2**attempt));
 }
}
// build(look) → {cards, caption}; athletes: the ESPN ids whose headshots it shows; text: the post as text, the fallback.
async function postAlbum(name,athletes,build,text){
 let album,pngs;
 try{
  const {loadLook,renderCards,FONTS}=await import('./render.mjs');
  album=build(await loadLook(athletes),FONTS);pngs=await renderCards(album.cards);
 }catch(e){console.warn(`${name}: cards failed (${e.message}); the text goes instead.`);return post(text);}
 if(CARDS_DIR){
  fs.mkdirSync(CARDS_DIR,{recursive:true});
  pngs.forEach((png,i)=>{const f=path.join(CARDS_DIR,`${name}-${i+1}.png`);fs.writeFileSync(f,png);console.log('card: '+f);});
  fs.writeFileSync(path.join(CARDS_DIR,`${name}-caption.txt`),album.caption+'\n');
 }
 if(!live||!CHAT){
  console.log(`\n===== ${name}: album of ${pngs.length} (preview) =====\n${album.caption}\n`);
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`### ${name}: album of ${pngs.length} (preview)\n\n\`\`\`\n${album.caption}\n\`\`\`\n\n`);
  return;
 }
 try{await sendAlbum(pngs,album.caption);}
 catch(e){console.warn(`${name}: album not sent (${e.message}); the text goes instead.`);await post(text);}
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
 if(!pending.length){rec.allFinalAt||=new Date(now()).toISOString();rec.done=true;}
 // A game ESPN never closes (a suspended one) stops holding the day three days later.
 else if(daysBetween(day,usDay(now()))>3)rec.done=true;
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
 const week=weekOf(day),days=Array.from({length:7},(_,i)=>addDays(week.start,i)),today=moscowDay(now());
 await refresh(days,archive);
 const all=archive.lines.filter(l=>l.d<=day),r=races(all,{rostered:ctx.league.rostered(),rookies:ctx.rookies,mef:ctx.mef});
 const wb=weeklyBlocks(all.filter(l=>l.d>=week.start)),rec=records(all);
 const text=[weeklyText(week,wb,ctx.who),racesText(week,r,ctx.who,state.ranks),recordsText(rec,ctx.who,today)].join('\n\n');
 const shown=[...Object.values(wb).flat(),...Object.values(r).flat(),...rec.best,...rec.worst].map(x=>x.a);
 await postAlbum(`week-${week.n}`,shown,(look,fonts)=>weekAlbum(week,wb,r,rec,ctx.who,look,fonts,{previous:state.ranks,holiday:holidayFor(day)}),text);
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
 const five=monthFive(lines,{heldAtEnd,positionOf:a=>ctx.league.positionOf(ctx.league.player(a))});
 await postAlbum(`month-${month}`,five.filter(x=>x.row).map(x=>x.row.a),(look,fonts)=>monthAlbum(month,five,ctx.who,look,fonts,{holiday:holidayFor(day)}),monthText(month,five,ctx.who));
 if(mark)state.posted.monthly[month]=live?'sent':'preview';
}
// --- Mike Roffon (mike-roffon.js): after the day's post, his flash interview with the hero of the day, from his own bot
// (MIKE_ROFFON_BOT_TOKEN): his picture with the interview's headline, the interview as a reply under it. Written by Claude
// through the owner's subscription (CLAUDE_CODE_OAUTH_TOKEN), drawn by OpenAI (OPENAI_API_KEY: without it the interview
// goes alone); without his token or the subscription's the facts are only printed. A preview writes it with --mike (the
// picture costs about $0.03). Never holds the awards: a failure is logged.
const MIKE=env.MIKE_ROFFON_BOT_TOKEN,OPENAI_KEY=env.OPENAI_API_KEY;
async function telegram(token,method,body){
 const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,body instanceof FormData?{method:'POST',body}
  :{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const out=await r.json().catch(()=>({}));
 if(!r.ok||!out.ok)throw Error(`Telegram ${method}: ${r.status} ${out.description||''}`);
 return out.result;
}
async function mikeInterview(day,lines,ctx,state,{send=live&&MIKE&&claudeConfigured(env),write=flag('--mike')}={}){
 const hero=dailyBlocks(lines.filter(l=>l.d===day)).heroes[0];
 if(!hero)return null;
 const g=state?.days?.[day]?.games?.[hero.e],opponent=g?(g.home===hero.c?g.away:g.home):null;
 const facts=interviewFacts(day,hero,ctx.who,{form:form(lines,day),opponent,holiday:holidayFor(day)});
 if(!send&&!write){console.log(`\n===== Mike Roffon (not written) =====\n${JSON.stringify(facts)}\n`);return null;}
 try{
  const {interview}=await interviewFor(facts);
  if(!interview){console.warn(`${day}: Mike Roffon's interview kept numbers of its own or lines of his old pieces: not posted.`);return {status:'dropped'};}
  let spent=0,picture=null;
  if(OPENAI_KEY)try{const r=await generate(interviewPicture(facts,day),{key:OPENAI_KEY,timeoutMs:120e3,attempts:2});picture=r.png;spent+=cost(r.usage);}
  catch(e){console.warn(`${day}: Mike Roffon's picture failed (${e.message}): the interview goes alone.`);}
  const text=interviewText(interview,facts),caption=interviewCaption(facts,day);
  if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});if(picture)fs.writeFileSync(path.join(CARDS_DIR,`mike-${day}.png`),picture);
   fs.writeFileSync(path.join(CARDS_DIR,`mike-${day}.txt`),caption+'\n\n'+text+'\n');}
  if(!send){console.log(`\n===== Mike Roffon (preview, $${spent.toFixed(3)}) =====\n${caption}\n\n${text}\n`);return {status:'preview',cost:spent};}
  let shown=null;
  if(picture){const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',caption);form.append('parse_mode','HTML');
   form.append('photo',new Blob([picture],{type:'image/png'}),`mike-roffon-${day}.png`);shown=await telegram(MIKE,'sendPhoto',form);}
  await telegram(MIKE,'sendMessage',{chat_id:CHAT,text:shown?text:caption+'\n\n'+text,parse_mode:'HTML',disable_web_page_preview:true,
   ...shown?{reply_parameters:{message_id:shown.message_id}}:{}});
  console.log(`${day}: Mike Roffon's interview sent, $${spent.toFixed(3)}.`);
  return {status:'sent',cost:Math.round(spent*1e4)/1e4};
 }catch(e){console.warn(`${day}: Mike Roffon failed (${e.message}).`);return {status:'failed'};}
}

// The day's post: its album, its text as the fallback.
function dayPost(day,lines,ctx,postponed){
 const mine=lines.filter(l=>l.d===day),before=lines.filter(l=>l.d<day),blocks=dailyBlocks(mine);
 const news=daysBetween(SEASON_START,day)>=RECORD_ALERTS_FROM_DAY?recordNews(before,mine):[];
 const text=dailyText(day,blocks,ctx.who,{news,postponed,today:moscowDay(now())});
 if(!text)return Promise.resolve();
 const shown=[...Object.values(blocks).flat(),...news.map(x=>x.line)].map(x=>x.a);
 return postAlbum(`day-${day}`,shown,(look,fonts)=>dayAlbum(day,blocks,ctx.who,look,fonts,{news,postponed,form:form(lines,day),holiday:holidayFor(day),week:weekOf(day)}),text);
}

// Follow a game day to its post: wait for the last tip-off, check every minute until every game is over (archiving each
// one as it ends), wait for corrections, read the box scores again and post; then the week after a Sunday and the month
// after its last day. Returns false when the day is not over within this run (a later run goes on with it).
async function watchDay(day,ctx,archive,state){
 while(!state.posted.daily[day]){
  const rec=state.days[day],step=nextStep(Object.values(rec?.games||{}),now());
  if(step.do==='none'){state.posted.daily[day]='no games';break;}
  if(step.do==='post'){
   await refresh([day],archive);
   await dayPost(day,archive.lines,ctx,Object.values(rec.games).filter(g=>g.off));
   state.posted.daily[day]=live?'sent':'preview';pushState(state,archive);
   if(!state.posted.mike?.[day]){const m=await mikeInterview(day,archive.lines,ctx,state);if(m){(state.posted.mike||={})[day]=m;pushState(state,archive);}}
   break;
  }
  if(step.do==='later'){console.log(`${day}: the last game tips off at ${step.until?new Date(step.until).toISOString():'?'}; a later run follows it.`);return false;}
  const until=step.until||now()+POLL_MS,wait=Math.max(POLL_MS,until-now());
  if(now()-START+wait>WATCH_MS){console.log(`${day}: ${step.do} goes past this run; the next run goes on.`);return false;}
  console.log(`${day}: ${step.do}${step.left?` (${step.left} game(s) to finish)`:''}, next check ${new Date(now()+wait).toISOString()}.`);
  save(state,archive);await sleep(wait);
  await archiveDay(day,state,archive,ctx.league);
 }
 save(state,archive);
 if(isSunday(day)&&!state.posted.weekly[weekOf(day).start]){await weekly(day,ctx,archive,state,true);pushState(state,archive);}
 if(isMonthEnd(day)&&!state.posted.monthly[day.slice(0,7)]){await monthly(day,ctx,archive,state,true);pushState(state,archive);}
 return true;
}
// One pass: archive what finished, then follow yesterday's and today's games (US Eastern) to their posts, in order: last
// night's games may still run after midnight in New York.
async function pass(state,archive,ctx){
 const today=usDay(now())>SEASON_END?SEASON_END:usDay(now());
 if(today<SEASON_START){console.log(`Season starts ${SEASON_START}: nothing to do.`);return;}
 // Posts start from the bot's first day: the days before it are archived without a post.
 state.firstDay||=Object.keys(state.posted.daily).sort()[0]||today;
 for(let day=SEASON_START;day<=today;day=addDays(day,1)){
  if(state.days[day]?.done)continue;
  await archiveDay(day,state,archive,ctx.league);
  save(state,archive);
 }
 for(const day of [addDays(today,-1),today])if(day>=state.firstDay&&day>=SEASON_START&&!(await watchDay(day,ctx,archive,state)))break;
 save(state,archive);
}
// When the bot has to be on the next game day not posted yet: LEAD_MS before its last tip-off (now when it is over).
// null: no game in sight today or tomorrow.
async function nextWake(state){
 const today=usDay(now());
 for(const day of [today,addDays(today,1)]){
  if(day<SEASON_START||day>SEASON_END||day<state.firstDay||state.posted.daily[day])continue;
  const games=(state.days[day]?Object.values(state.days[day].games):await scoreboard(day)).filter(g=>!g.off);
  if(!games.length)continue;
  const pending=games.filter(g=>!g.final);
  return pending.length?Math.max(...pending.map(g=>Date.parse(g.tip)))-LEAD_MS:now();
 }
 return null;
}
// CHAIN: the run stays for its whole time and the workflow then starts the next one, so the bot never depends on
// GitHub's schedule (best-effort, often hours late). It sleeps until the next game day needs it, follows that day and
// sleeps again; with nothing in reach before its time is up it sleeps to the end and hands over.
async function scheduled(){
 const state=read('state.json',fresh()),archive=read('archive.json',{lines:[]});
 for(;;){
  siteLeague=await loadLeague();await pass(state,archive,siteLeague);
  if(!env.CHAIN)return;
  const wake=await nextWake(state),left=START+WATCH_MS-now()-10*60e3;
  if(wake===null||wake-now()>left){
   console.log(`Next game day ${wake?'from '+new Date(wake).toISOString():'not in sight'}: sleeping ${Math.round(Math.max(0,left)/60e3)} min, then the next run.`);
   save(state,archive);if(left>0)await sleep(left);return;
  }
  console.log(`Back on the game day at ${new Date(Math.max(wake,now())).toISOString()}.`);
  save(state,archive);await sleep(Math.max(POLL_MS,wake-now()));
 }
}
// The posts of a past day rebuilt from ESPN with today's transfer journals: nothing saved or sent.
async function preview(day){
 const ctx=await loadLeague(),state=fresh(),archive={lines:[]};
 for(let d=SEASON_START;d<=day;d=addDays(d,1))await archiveDay(d,state,archive,ctx.league);
 await dayPost(day,archive.lines,ctx,[]);
 await mikeInterview(day,archive.lines,ctx,state);
 if(flag('--week')||isSunday(day))await weekly(day,ctx,archive,state,false);
 if(flag('--month')||isMonthEnd(day))await monthly(day,ctx,archive,state,false);
}

// The day's post once more, as the archive has it now: nothing in the state changes, so nothing else is posted.
async function resend(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('--resend: a US game day, YYYY-MM-DD');
 const archive=read('archive.json',{lines:[]});
 if(!archive.lines.some(l=>l.d===day))throw Error(`--resend: no archived games of ${day}`);
 await dayPost(day,archive.lines,await loadLeague(),[]);
}

// Mike Roffon's interview of an archived day by hand: written, drawn and, with --send, posted by his bot. The state is
// only read (the awards bot's chain may hold it): nothing is saved, so each run with --send posts again.
async function mikeByHand(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('--mike-day: a US game day, YYYY-MM-DD');
 const state=read('state.json',fresh()),archive=read('archive.json',{lines:[]});
 if(!archive.lines.some(l=>l.d===day))throw Error(`--mike-day: no archived games of ${day}`);
 const send=flag('--send');
 if(send){const missing=[['MIKE_ROFFON_BOT_TOKEN',MIKE],['AWARDS_CHAT_ID',CHAT],['CLAUDE_CODE_OAUTH_TOKEN',claudeConfigured(env)]].filter(x=>!x[1]).map(x=>x[0]);
  if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);}
 const m=await mikeInterview(day,archive.lines,await loadLeague(),state,{send,write:true});
 if(!m)throw Error(`${day}: no hero of the day`);
 if(m.status!==(send?'sent':'preview'))process.exitCode=1;
}

const day=opt('--preview'),again=opt('--resend'),mikeDay=opt('--mike-day');
if(mikeDay&&STATE_DIR)await mikeByHand(mikeDay);
else if(day)await preview(day);
else if(STATE_DIR&&again)await resend(again);
else if(STATE_DIR)await scheduled();
else{console.error('Usage: bot.mjs --state DIR [--resend YYYY-MM-DD | --mike-day YYYY-MM-DD [--send]] | --preview YYYY-MM-DD [--week] [--month]');process.exit(2);}
