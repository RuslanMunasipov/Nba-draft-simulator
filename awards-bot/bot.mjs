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
//                                                   --holiday: the cards dressed for that holiday of holidays.js,
//                                                   none: without any holiday decor;
//                                                   --prompts: the prompts of the day's two pictures (free);
//                                                   --pictures: the pictures drawn by OpenAI, ~$0.05, into --cards;
//                                                   --mike: Mike Roffon's interview written by Claude and, with
//                                                   OPENAI_API_KEY, drawn, ~$0.02;
//                                                   --infirmary: Trevor Matolog's report from the infirmary, ESPN's
//                                                   injury report as it is now, its pictures' prompts with --prompts,
//                                                   drawn with --pictures, ~$0.06)
//   node awards-bot/bot.mjs --inside-fbl --state DIR --inside DIR --action draft|redo|approve|post [--inside-week DAY]
//                          [--guest G] [--notes TEXT] [--after-thursday]
//                                                   Mike Roffon's weekly long read (inside-fbl.js, workflow
//                                                   inside-fbl.yml) of the week of DAY (by default the one of
//                                                   yesterday: on Friday, Monday to Thursday): written, drawn, its pictures pushed to the
//                                                   branch data/inside-fbl (the --inside DIR, a clone of it), the
//                                                   Telegraph page published for the owner's review; post puts
//                                                   an approved one into the league chat on Friday at 18:00
//                                                   Moscow, never at another time (see insideFbl). G: gm:<1-8>,
//                                                   player:<ESPN id> or commissioner
//   node awards-bot/bot.mjs --mike-day DAY --state DIR [--send] [--picture-only] [--cards DIR]
//                                                   Mike Roffon's interview of an archived day by hand (workflow
//                                                   mike-roffon.yml): written and drawn, posted into the league chat
//                                                   by his bot with --send (--picture-only: only his picture, for
//                                                   an interview that went without one); the state is only read
//   node awards-bot/bot.mjs --trevor-day DAY [--send] [--prompts] [--cards DIR]
//                                                   Trevor Matolog's report from the infirmary by hand (workflow
//                                                   trevor-matolog.yml): ESPN's injury report as it is now, drawn
//                                                   (~$0.06; --prompts: only the pictures' prompts, free) and,
//                                                   with --send, posted by his bot; nothing is saved
//   node awards-bot/bot.mjs --dildo-intro FILE --state DIR
//                                                   Christopher Dildo's introduction to the league written by Claude on
//                                                   the archived season, saved to FILE (data/dildo/); nothing sent
//   node awards-bot/bot.mjs --dildo-post FILE [--send] [--picture]
//                                                   that file posted as it is by his bot with its picture (Claude's
//                                                   prompt, ultra-realistic, ~$0.03; workflow christopher-dildo.yml);
//                                                   without --send printed
//   node awards-bot/bot.mjs --trevor-hello [--send]  Trevor introduces himself (data/trevor/hello.html with his photo)
//   node awards-bot/bot.mjs --steven-hello [--send]  Steven Ex Pert introduces himself (steven.js HELLO_CAPTION, his photo)
// Env: AWARDS_BOT_TOKEN and AWARDS_CHAT_ID (the league chat), AWARDS_COMMISSIONER_CHAT_ID (the rookie check),
// CHRISTOPHER_DILDO_BOT_TOKEN (his bot posts the day, its pictures and the week's heroes: dildo.js),
// STEVEN_EX_PERT_BOT_TOKEN (his bot posts the awards race and the month's five: steven.js),
// TREVOR_MATOLOG_BOT_TOKEN (his bot posts the report from the infirmary: trevor-matolog.js). Without
// the token and chat the posts are printed and kept in the state as previews, never sent. Every post of the day, the week
// and the month goes as one album of cards (cards.js, drawn by render.mjs with Chromium: CHROMIUM_PATH for one of its
// own); when the cards cannot be drawn or sent, its text goes instead.
// Optional: LIVE_URL (sports-current.json), DB_PATH (a local default-draft.json), NOW (ISO time, for a dry run),
// WATCH_MINUTES (how long one run may stay, 330 by default: GitHub stops a job at 360), CHAIN (stay the whole time and
// let the workflow start the next run).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {withMarket,allTransfers,stints,seasonRosters,teamPoints} from '../src/season.js';
import {SEASON_START,SEASON_END,MEF_PRICE,RECORD_ALERTS_FROM_DAY,LEAD_MS,nextStep,addDays,daysBetween,moscowDay,usDay,weekOf,form,
 isSunday,isMonthEnd,parseScoreboard,parseSummary,makeLeague,settle,dailyBlocks,weeklyBlocks,records,recordNews,races,monthFive,
 withoutRookie,siteSummary,byCard} from './core.js';
import {dailyText,weeklyText,racesText,recordsText,monthText,rookieAlert,split,raceKey,esc} from './messages.js';
import {dayAlbum,weekHeroesAlbum,raceAlbum,monthAlbum} from './cards.js';
import {holidayOf,HOLIDAYS} from './holidays.js';
import {dayPictures,momentFacts,blockCast,givenMoments,writeMoments,imageName} from './images.js';
import {interviewFacts,interviewFor,interviewText,interviewCaption,mikeCast,writeMikePicture} from './mike-roffon.js';
import {generate,cost} from '../scripts/image-pipeline.mjs';
import {picture} from '../scripts/picture-prompt.mjs';
import {weekData,pickGuest,longreadFacts,writeLongread,guestReference,longreadCast,writeChapterPicture,publishPage,editPage,longreadCaption,postTime} from './inside-fbl.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {claudeConfigured} from '../scripts/claude-text.mjs';
import {asDildo,teamFacts,dayFacts,weekFacts,commentFor,signCaption,signText,introFacts,introFor,writePostPicture} from './dildo.js';
import {stevenSenders,viaFirst,raceFacts,fiveFacts,verdictFor,withVerdict,verdictText,picturePlayers,stevenCast,writeStevenPicture,pictureCaption,STEVEN_QUALITY,HELLO_PHOTO,HELLO_CAPTION} from './steven.js';
import {INFIRMARY_DELAY_MS,INFIRMARY_LATE_MS,patients,untranslated,translateNow,patientFacts,infirmaryFacts,writeWords,infirmaryText,infirmaryCaption,pictureGroups,wardCast,writeWardPicture} from './trevor-matolog.js';

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
 // The snapshot names a player's card of 17.10: one Sports.ru replaced since is his previous one (byCard).
 const byId=new Map(players.map(p=>[p.id,p])),bySid=byCard(players);
 // The Sports.ru short name, as the league knows its players; ESPN's for the rest of the NBA.
 const who=(a,n)=>{const p=league.player(a);return p?.sportsName||live.players?.[p?.sportsId]?.name||n||String(a);};
 const rookies=new Set(players.filter(p=>p.isRookie===true).map(league.espnOf).filter(Boolean));
 const mef=new Map();
 for(const r of local('data/sports-prices-2026-10-17.json').players)if(r.price>=MEF_PRICE.min&&r.price<=MEF_PRICE.max){
  const e=league.espnOf(bySid.get(String(r.sportsId)));if(e)mef.set(e,r.price);}
 const rosters=seasonRosters(transfers).map(r=>r.map(id=>byId.get(id)));
 return {live,league,who,rookies,mef,rosters,players,transfers};
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
async function post(text,chat=CHAT,label='league chat',token=TOKEN){
 if(!text)return;
 if(!live||!chat){
  console.log(`\n===== ${label} (preview) =====\n${text}\n`);
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`### ${label} (preview)\n\n\`\`\`\n${text}\n\`\`\`\n\n`);
  return;
 }
 for(const part of split(text)){
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({chat_id:chat,text:part,parse_mode:'HTML',disable_web_page_preview:true})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body.ok)throw Error(`Telegram ${label}: ${r.status} ${body.description||''}`);
  await sleep(1100);
 }
}

// --- Albums: a post's cards drawn and sent as one Telegram media group, the caption (with its hashtags) on the first.
// A post never gets lost to its cards: when they cannot be drawn or sent, its text goes instead.
const CARDS_DIR=opt('--cards'),FORCED=opt('--holiday');
// --holiday KEY dresses the cards for that holiday whatever the day; --holiday none: no holiday decor at all.
if(FORCED&&FORCED!=='none'&&!HOLIDAYS.some(h=>h.key===FORCED))throw Error(`--holiday: ${FORCED} is not a key of holidays.js (or none)`);
const holidayFor=day=>FORCED?HOLIDAYS.find(h=>h.key===FORCED)||null:holidayOf(day);
async function sendAlbum(pngs,caption,token=TOKEN){
 const one=pngs.length===1;
 for(let attempt=0;;attempt++){
  const data=new FormData();data.append('chat_id',String(CHAT));
  if(one){data.append('photo',new Blob([pngs[0]],{type:'image/png'}),'card-1.png');data.append('caption',caption);data.append('parse_mode','HTML');}
  else{data.append('media',JSON.stringify(pngs.map((_,i)=>({type:'photo',media:`attach://c${i}`,...i===0?{caption,parse_mode:'HTML'}:{}}))));
   pngs.forEach((png,i)=>data.append(`c${i}`,new Blob([png],{type:'image/png'}),`card-${i+1}.png`));}
  // A dropped connection (fetch throws, no answer at all: 23.10.2026) is tried again like a server error.
  let r;
  try{r=await fetch(`https://api.telegram.org/bot${token}/${one?'sendPhoto':'sendMediaGroup'}`,{method:'POST',body:data,signal:AbortSignal.timeout(120e3)});}
  catch(e){const why=`${e.message}${e.cause?` (${e.cause.code||e.cause.message})`:''}`;
   if(attempt>=3)throw Error(`Telegram album: ${why}`);console.warn(`Telegram album: ${why}, tried again.`);await sleep(5000*(attempt+1));continue;}
  const body=await r.json().catch(()=>({}));
  if(r.ok&&body.ok)return;
  if(attempt>=3||(r.status!==429&&r.status<500))throw Error(`Telegram album: ${r.status} ${body.description||''}`);
  await sleep(1000*(body.parameters?.retry_after||2**attempt));
 }
}
// build(look) → {cards, caption}; athletes: the ESPN ids whose headshots it shows; text: the post as text, the fallback.
// via(send): the sender (dildo below); the awards bot's by default.
async function postAlbum(name,athletes,build,text,{via=send=>send(TOKEN)}={}){
 let album,pngs;
 try{
  const {loadLook,renderCards,FONTS}=await import('./render.mjs');
  album=build(await loadLook(athletes),FONTS);pngs=await renderCards(album.cards);
 }catch(e){console.warn(`${name}: cards failed (${e.message}); the text goes instead.`);return via(t=>post(text,CHAT,'league chat',t));}
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
 try{await via(t=>sendAlbum(pngs,album.caption,t));}
 catch(e){console.warn(`${name}: album not sent (${e.message}); the text goes instead.`);await via(t=>post(text,CHAT,'league chat',t));}
}

// --- Christopher Dildo (dildo.js): the day's album, the day's pictures and the week's heroes go out by his own bot
// (CHRISTOPHER_DILDO_BOT_TOKEN) into the same chat; without his token, or when Telegram refuses it, by the awards bot.
// His comment in their captions is written by Claude through the subscription; without it, or when he cannot write
// one, the post goes with his signature alone.
const DILDO=env.CHRISTOPHER_DILDO_BOT_TOKEN;
const dildo=send=>asDildo(send,{dildo:DILDO,awards:TOKEN});
const dildoComment=facts=>claudeConfigured(env)?commentFor(facts):Promise.resolve(null);

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

// --- Steven Ex Pert (steven.js): the awards race and the month's five go from his bot (STEVEN_EX_PERT_BOT_TOKEN), else
// from the awards bot, with his verdict written by Claude through the subscription (free); without the subscription, or
// when Claude cannot write one with the facts' numbers only, the post goes without it.
const STEVEN_SENDERS=stevenSenders({steven:env.STEVEN_EX_PERT_BOT_TOKEN,awards:TOKEN});
const steven=send=>viaFirst(STEVEN_SENDERS,send,{label:'Steven Ex Pert'});
async function stevenVerdict(kind,facts){
 if(!claudeConfigured(env)){console.log(`Steven Ex Pert: no Claude subscription, the ${kind} goes without his verdict.`);return null;}
 const {verdict}=await verdictFor(kind,facts);
 if(verdict)console.log(`Steven Ex Pert on the ${kind}:\n${verdict.join('\n')}`);
 return verdict;
}
// His picture (steven.js), right after his album, from his bot: its prompt written by Claude from his barbs, drawn by
// OpenAI in high quality (ultra-realism, owner 24.10.2026: about $0.05-0.15). A scheduled run draws it with OPENAI_API_KEY; a preview prints its prompt with --prompts (free)
// and draws it with --pictures (paid). null: no picture. Never holds a post: a failure is logged.
async function stevenPicture(name,kind,facts,verdict,players){
 const preview=flag('--preview'),draw=preview?flag('--pictures'):!!OPENAI_KEY;
 if(!claudeConfigured(env)||!(draw||preview&&flag('--prompts')))return null;
 try{
  const {headshot}=await import('./render.mjs');
  const faces=new Map((await Promise.all(players.map(async p=>[p.a,await headshot(p.a)]))).filter(([,f])=>f));
  const written=await writeStevenPicture(kind,facts,verdict,stevenCast(players,{faces}));
  if(!written){console.warn(`${name}: Claude wrote no picture of Steven Ex Pert: none.`);return null;}
  console.log(`\n===== ${name}: Steven Ex Pert's picture (written by Claude, ${written.images.length} references: ${written.images.map(i=>i.name).join(', ')}) =====\n${written.prompt}\n`);
  if(!draw)return null;
  const r=await generate({...written,quality:STEVEN_QUALITY},{key:OPENAI_KEY,timeoutMs:300e3,attempts:2});
  console.log(`${name}: Steven Ex Pert's picture drawn, $${cost(r.usage).toFixed(3)}.`);
  return r.png;
 }catch(e){console.warn(`${name}: Steven Ex Pert's picture failed (${e.message}): none.`);return null;}
}
async function stevenPhoto(name,png,caption){
 if(!png)return;
 if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});fs.writeFileSync(path.join(CARDS_DIR,`${name}-steven.png`),png);fs.writeFileSync(path.join(CARDS_DIR,`${name}-steven.txt`),caption+'\n');}
 if(!live||!CHAT){console.log(`\n===== ${name}: Steven Ex Pert's picture (preview) =====\n${caption}\n`);return;}
 const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',caption);form.append('parse_mode','HTML');
 form.append('photo',new Blob([png],{type:'image/png'}),`${name}-steven.png`);
 try{await steven(t=>telegram(t,'sendPhoto',form));console.log(`${name}: Steven Ex Pert's picture sent.`);}
 catch(e){console.warn(`${name}: Steven Ex Pert's picture not sent (${e.message}).`);}
}
// An album's caption without drawing it (its builders are pure: the caption needs no photos or fonts).
const captionOf=build=>build({photo:()=>null,logo:()=>null,emoji:e=>e},{manrope:'',oswald:''}).caption;
async function weekly(day,ctx,archive,state,mark){
 const week=weekOf(day),days=Array.from({length:7},(_,i)=>addDays(week.start,i)),today=moscowDay(now());
 await refresh(days,archive);
 const all=archive.lines.filter(l=>l.d<=day),r=races(all,{rostered:ctx.league.rostered(),rookies:ctx.rookies,mef:ctx.mef});
 const wb=weeklyBlocks(all.filter(l=>l.d>=week.start)),rec=records(all);
 // Steven Ex Pert's verdict and picture of the race come first, so the week's two albums go one right after the other.
 const facts=raceFacts(week,r,rec,ctx.who,state.ranks),verdict=await stevenVerdict('race',facts);
 const pic=await stevenPicture(`race-${week.n}`,'race',facts,verdict,picturePlayers('race',{r,previous:state.ranks},ctx.who));
 // The week's heroes, flops and free agents first: Christopher Dildo's album, marked apart (a run cut short between the
 // two albums posts only the race next time).
 if(!mark||!state.posted.weekHeroes?.[week.start]){
  const comment=await dildoComment(weekFacts(week,wb,ctx.who,{lines:all.filter(l=>l.d>=week.start)}));
  await postAlbum(`week-${week.n}-heroes`,Object.values(wb).flat().map(x=>x.a),(look,fonts)=>{const a=weekHeroesAlbum(week,wb,ctx.who,look,fonts,{holiday:holidayFor(day)});return {...a,caption:signCaption(a.caption,comment)};},
   signText(weeklyText(week,wb,ctx.who),comment),{via:dildo});
  if(mark){(state.posted.weekHeroes||={})[week.start]=live?'sent':'preview';pushState(state,archive);}
 }
 // The awards race: Steven Ex Pert's album (steven.js), from his bot.
 const shown=[...Object.values(r).flat(),...rec.best,...rec.worst].map(x=>x.a);
 const text=verdictText([racesText(week,r,ctx.who,state.ranks),recordsText(rec,ctx.who,today)].join('\n\n'),verdict);
 const album=(look,fonts)=>raceAlbum(week,r,rec,ctx.who,look,fonts,{previous:state.ranks,holiday:holidayFor(day)});
 await postAlbum(`race-${week.n}`,shown,(look,fonts)=>{const a=album(look,fonts);return {...a,caption:withVerdict(a.caption,verdict)};},text,{via:steven});
 await stevenPhoto(`race-${week.n}`,pic,pictureCaption(captionOf(album)));
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
 // Steven Ex Pert's album (steven.js), from his bot, with his verdict on the five, then his picture.
 const facts=fiveFacts(month,five,ctx.who),verdict=await stevenVerdict('five',facts);
 const pic=await stevenPicture(`month-${month}`,'five',facts,verdict,picturePlayers('five',{five},ctx.who));
 const album=(look,fonts)=>monthAlbum(month,five,ctx.who,look,fonts,{holiday:holidayFor(day)});
 await postAlbum(`month-${month}`,five.filter(x=>x.row).map(x=>x.row.a),(look,fonts)=>{const a=album(look,fonts);return {...a,caption:withVerdict(a.caption,verdict)};},
  verdictText(monthText(month,five,ctx.who),verdict),{via:steven});
 await stevenPhoto(`month-${month}`,pic,pictureCaption(captionOf(album)));
 if(mark)state.posted.monthly[month]=live?'sent':'preview';
}
// --- Mike Roffon (mike-roffon.js): after the day's post, his flash interview with the hero of the day, from his own bot
// (MIKE_ROFFON_BOT_TOKEN): his picture with the interview's headline, the interview as a reply under it. Written by Claude
// through the owner's subscription (CLAUDE_CODE_OAUTH_TOKEN), drawn by OpenAI (OPENAI_API_KEY: without it the interview
// goes alone); without his token or the subscription's the facts are only printed. A preview writes it with --mike (the
// picture costs about $0.02). Never holds the awards: a failure is logged.
const MIKE=env.MIKE_ROFFON_BOT_TOKEN,OPENAI_KEY=env.OPENAI_API_KEY;
async function telegram(token,method,body){
 const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,body instanceof FormData?{method:'POST',body}
  :{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const out=await r.json().catch(()=>({}));
 if(!r.ok||!out.ok)throw Error(`Telegram ${method}: ${r.status} ${out.description||''}`);
 return out.result;
}
// His picture, its prompt written by Claude from the interview (interview null: from the game alone) with the hero's ESPN
// face (hero: his ESPN id). {picture: the PNG or null (no subscription, no prompt Claude could write, no OPENAI_API_KEY,
// a refusal of the image model: the interview goes alone), written: Claude's prompt, spent}.
async function mikePicture(facts,day,team,interview=null,hero=null){
 if(!claudeConfigured(env)){console.warn(`${day}: no Claude subscription, no picture of Mike Roffon.`);return {picture:null,written:null,spent:0};}
 const face=hero?await (await import('./render.mjs')).headshot(hero):null;
 let written=null;
 try{written=await writeMikePicture(facts,interview,mikeCast(facts,{team,face}));}
 catch(e){console.warn(`${day}: Claude did not write Mike Roffon's picture (${e.message}).`);}
 if(!written||!OPENAI_KEY)return {picture:null,written,spent:0};
 try{const r=await generate(written,{key:OPENAI_KEY,timeoutMs:120e3,attempts:2});return {picture:r.png,written,spent:cost(r.usage)};}
 catch(e){console.warn(`${day}: Mike Roffon's picture failed (${e.message}): the interview goes alone.`);return {picture:null,written,spent:0};}
}
// Only his picture of a day whose interview went without one: drawn and, with send, posted with its caption.
async function mikePictureOnly(day,lines,ctx,state,send){
 const hero=dailyBlocks(lines.filter(l=>l.d===day)).heroes[0];
 if(!hero)return null;
 const facts=interviewFacts(day,hero,ctx.who,{form:form(lines,day)});
 const {picture,spent}=await mikePicture(facts,day,hero.h?.[0],null,String(hero.a)),caption=interviewCaption(facts,day);
 if(!picture)return {status:'failed'};
 if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});fs.writeFileSync(path.join(CARDS_DIR,`mike-${day}.png`),picture);}
 if(!send){console.log(`\n===== Mike Roffon's picture (preview, $${spent.toFixed(3)}) =====\n${caption}\n`);return {status:'preview',cost:spent};}
 const body=new FormData();body.append('chat_id',String(CHAT));body.append('caption',caption);body.append('parse_mode','HTML');
 body.append('photo',new Blob([picture],{type:'image/png'}),`mike-roffon-${day}.png`);await telegram(MIKE,'sendPhoto',body);
 console.log(`${day}: Mike Roffon's picture sent, $${spent.toFixed(3)}.`);
 return {status:'sent',cost:spent};
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
  const {picture,written,spent}=await mikePicture(facts,day,hero.h?.[0],interview,String(hero.a));
  const text=interviewText(interview,facts),caption=interviewCaption(facts,day);
  if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});if(picture)fs.writeFileSync(path.join(CARDS_DIR,`mike-${day}.png`),picture);
   fs.writeFileSync(path.join(CARDS_DIR,`mike-${day}.txt`),caption+'\n\n'+text+'\n');}
  if(!send){console.log(`\n===== Mike Roffon (preview, $${spent.toFixed(3)}) =====\n${caption}\n\n${text}\n`);
   // The picture's prompt as it goes to the image model, Claude's own.
   console.log(written?`\n===== Mike Roffon's picture (written by Claude, ${written.images.length} references: ${written.images.map(i=>i.name).join(', ')}) =====\n${written.prompt}\n`:'\n===== Mike Roffon: no picture =====\n');
   return {status:'preview',cost:spent};}
  let shown=null;
  if(picture){const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',caption);form.append('parse_mode','HTML');
   form.append('photo',new Blob([picture],{type:'image/png'}),`mike-roffon-${day}.png`);shown=await telegram(MIKE,'sendPhoto',form);}
  await telegram(MIKE,'sendMessage',{chat_id:CHAT,text:shown?text:caption+'\n\n'+text,parse_mode:'HTML',disable_web_page_preview:true,
   ...shown?{reply_parameters:{message_id:shown.message_id}}:{}});
  console.log(`${day}: Mike Roffon's interview sent, $${spent.toFixed(3)}.`);
  return {status:'sent',cost:Math.round(spent*1e4)/1e4};
 }catch(e){console.warn(`${day}: Mike Roffon failed (${e.message}).`);return {status:'failed'};}
}

// --- Trevor Matolog (trevor-matolog.js): 20 minutes after Mike's flash interview, his report from the infirmary by his own
// bot (TREVOR_MATOLOG_BOT_TOKEN): ESPN's injury report as it is now, the FBL rosters' patients, their comments in Russian
// (the site's translations; the missing ones translated now by Claude), his opener and afterword written by Claude, and
// the ward's pictures (prompts written by Claude, drawn by OpenAI, about $0.03 each, at most two). Without his token there
// is no report. send: posted by his bot (sent: {status, cost, patients, at}); else printed. draw: the pictures (paid);
// prompts: only their prompts written by Claude and printed, nothing drawn (free).
const TREVOR=env.TREVOR_MATOLOG_BOT_TOKEN;
const TRANSLATIONS='https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/data/translations/translations.json';
async function infirmary(day,ctx,{send=live&&!!TREVOR,draw=true,prompts:only=false}={}){
 let report;
 try{report=await json(ESPN+'injuries');}catch(e){console.warn(`${day}: no ESPN injury report (${e.message}): no infirmary.`);return {status:'failed'};}
 // A report that lists nobody is a broken feed, never an empty infirmary.
 if(!report?.injuries?.some?.(t=>t?.injuries?.length)){console.warn(`${day}: ESPN's injury report lists nobody: no infirmary.`);return {status:'failed'};}
 const list=patients(report,ctx.rosters,ctx.who),tr=await json(TRANSLATIONS).catch(()=>null);
 const ru=Object.fromEntries(Object.entries(tr?.texts||{}).map(([k,v])=>[k,v.text])),todo=untranslated(list,tr),writes=claudeConfigured(env);
 if(todo.length&&writes)Object.assign(ru,await translateNow(todo));
 const facts=list.map(x=>patientFacts(x,ru));
 let words=null,spent=0;const pics=[],prompts=[];
 if(facts.length&&writes){
  try{words=await writeWords(infirmaryFacts(facts));}catch(e){console.warn(`${day}: Claude did not write Trevor's words (${e.message}).`);}
  if((draw&&OPENAI_KEY)||only){
   const {headshot}=await import('./render.mjs');
   for(const group of pictureGroups(facts)){
    const faces=new Map((await Promise.all(group.map(async p=>[p.espnId,await headshot(p.espnId)]))).filter(([,f])=>f));
    let written=null;
    try{written=await writeWardPicture(group,wardCast(group,faces));}catch(e){console.warn(`${day}: Claude did not write the ward's picture (${e.message}).`);}
    if(!written)continue;
    prompts.push(written);
    if(!draw||!OPENAI_KEY)continue;
    try{const r=await generate(written,{key:OPENAI_KEY,timeoutMs:180e3,attempts:2});pics.push(r.png);spent+=cost(r.usage);}
    catch(e){console.warn(`${day}: the ward's picture failed (${e.message}).`);}
   }
  }
 }
 const text=infirmaryText(facts,words,day),caption=infirmaryCaption(facts,day);
 if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});pics.forEach((p,i)=>fs.writeFileSync(path.join(CARDS_DIR,`infirmary-${day}-${i+1}.png`),p));
  fs.writeFileSync(path.join(CARDS_DIR,`infirmary-${day}.txt`),caption+'\n\n'+text+'\n');}
 if(!send){console.log(`\n===== Trevor Matolog's infirmary (preview, ${pics.length} picture(s), $${spent.toFixed(3)}) =====\n${caption}\n\n${text}\n`);
  // The pictures' prompts as they go to the image model, Claude's own.
  for(const w of prompts)console.log(`\n===== The ward's picture (written by Claude, ${w.images.length} references: ${w.images.map(i=>i.name).join(', ')}) =====\n${w.prompt}\n`);
  return {status:'preview',cost:spent};}
 try{
  let shown=null;
  if(pics.length===1){const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',caption);form.append('parse_mode','HTML');
   form.append('photo',new Blob([pics[0]],{type:'image/png'}),`infirmary-${day}.png`);shown=await telegram(TREVOR,'sendPhoto',form);}
  else if(pics.length>1){const form=new FormData();form.append('chat_id',String(CHAT));
   form.append('media',JSON.stringify(pics.map((_,i)=>({type:'photo',media:`attach://p${i}`,...i?{}:{caption,parse_mode:'HTML'}}))));
   pics.forEach((p,i)=>form.append(`p${i}`,new Blob([p],{type:'image/png'}),`infirmary-${day}-${i+1}.png`));
   shown=(await telegram(TREVOR,'sendMediaGroup',form))[0];}
  for(const [i,part] of split(text).entries())await telegram(TREVOR,'sendMessage',{chat_id:CHAT,text:part,parse_mode:'HTML',disable_web_page_preview:true,
   ...i===0&&shown?{reply_parameters:{message_id:shown.message_id}}:{}});
  console.log(`${day}: Trevor Matolog's infirmary sent: ${facts.length} patient(s), ${pics.length} picture(s), $${spent.toFixed(3)}.`);
  return {status:'sent',cost:Math.round(spent*1e4)/1e4,patients:facts.length,at:new Date(now()).toISOString()};
 }catch(e){console.warn(`${day}: Trevor Matolog's infirmary failed (${e.message}).`);return {status:'failed'};}
}

// --- The day's pictures (images.js): the heroes in one picture and the flops in another, their prompts written by Claude
// through the owner's subscription (free; without it, or when he cannot write one, no picture), drawn by OpenAI (about
// $0.03 each) and sent by Christopher Dildo's bot (the awards bot's without it) after the day's album, before Mike
// Roffon. recent: the ideas of the last days, not to repeat. Only with DAY_PICTURES=1 and OPENAI_API_KEY. A preview
// prints their prompts with --prompts (free) and draws them with --pictures (paid; without the key the request goes out
// bare, for a proxy that adds it). Never holds the awards: a failure is logged.
const PICTURES=env.DAY_PICTURES==='1'&&!!OPENAI_KEY;
async function picturesPost(day,lines,ctx,{send=live&&!!CHAT,draw=true,recent=[]}={}){
 const blocks=dailyBlocks(lines.filter(l=>l.d===day)),f=form(lines,day),written={};
 // The day of our eight teams, the numbers Christopher Dildo hunts: names in Latin letters, as the pictures spell them.
 const teams=teamFacts(lines.filter(l=>l.d===day),(a,n)=>imageName({a,n}),{heroes:blocks.heroes,flops:blocks.flops});
 const kinds=[['hero',blocks.heroes],['flop',blocks.flops]].filter(([,rows])=>rows.length);
 // The players' faces first: Claude writes the prompt for the references there are.
 const ids=[...new Set([...blocks.heroes.slice(0,3),...blocks.flops.slice(0,3)].map(l=>String(l.a)))];
 const {headshot}=await import('./render.mjs');
 const faces=new Map((await Promise.all(ids.map(async a=>[a,await headshot(a)]))).filter(([,f])=>f));
 // --moments FILE (a preview): the prompts as JSON {hero: {prompt, idea}, flop: ...}, checked like Claude's.
 const given=opt('--moments')?JSON.parse(fs.readFileSync(opt('--moments'),'utf8')):null;
 for(const [kind,rows] of kinds){
  const facts=momentFacts(kind,rows,{form:f,teams}),c=blockCast(kind,rows,{faces});
  if(!draw)console.log(`\n===== ${day} ${kind} facts =====\n${JSON.stringify(facts.players)}`);
  if(given){written[kind]=givenMoments(given[kind],facts,c);continue;}
  if(!claudeConfigured(env)){console.warn(`${day}: no Claude subscription, no ${kind} picture.`);continue;}
  try{written[kind]=await writeMoments(facts,c,{recent});}
  catch(e){console.warn(`${day}: Claude did not write the ${kind} picture (${e.message}): none.`);}
 }
 const pictures=dayPictures(blocks,ctx.who,{written}),ideas=pictures.flatMap(p=>p.ideas);
 if(!draw){for(const p of pictures)console.log(`\n===== ${day} ${p.kind} picture (written by Claude, ${p.images.length} references: ${p.images.map(i=>i.name).join(', ')}) =====\n${p.prompt}\n\n${p.caption}\n`);return {status:'prompts',ideas};}
 let spent=0,sent=0,drawn=0;
 for(const p of pictures){
  try{
   const r=await generate(p,{key:OPENAI_KEY,timeoutMs:180e3,attempts:2});spent+=cost(r.usage);drawn++;
   if(CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});const f=path.join(CARDS_DIR,`picture-${day}-${p.kind}.png`);fs.writeFileSync(f,r.png);
    fs.writeFileSync(f.replace(/png$/,'txt'),p.caption+'\n\n'+p.prompt+'\n');console.log('picture: '+f);}
   if(send){const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',p.caption);form.append('parse_mode','HTML');
    form.append('photo',new Blob([r.png],{type:'image/png'}),`fbl-${p.kind}-${day}.png`);await dildo(t=>telegram(t,'sendPhoto',form));sent++;}
  }catch(e){console.warn(`${day}: the ${p.kind} picture failed (${e.message}).`);}
 }
 console.log(`${day}: ${drawn} of ${pictures.length} picture(s) drawn${send?`, ${sent} sent`:''}, $${spent.toFixed(3)}.`);
 return {status:send?(sent?'sent':'failed'):(drawn?'preview':'failed'),cost:Math.round(spent*1e4)/1e4,ideas};
}

// The day's post: its album, its text as the fallback; Christopher Dildo's, with his comment.
async function dayPost(day,lines,ctx,postponed){
 const mine=lines.filter(l=>l.d===day),before=lines.filter(l=>l.d<day),blocks=dailyBlocks(mine);
 const news=daysBetween(SEASON_START,day)>=RECORD_ALERTS_FROM_DAY?recordNews(before,mine):[];
 const text=dailyText(day,blocks,ctx.who,{news,postponed,today:moscowDay(now())});
 if(!text)return;
 const shown=[...Object.values(blocks).flat(),...news.map(x=>x.line)].map(x=>x.a),f=form(lines,day);
 const comment=await dildoComment(dayFacts(blocks,ctx.who,{form:f,news,lines:mine}));
 return postAlbum(`day-${day}`,shown,(look,fonts)=>{const a=dayAlbum(day,blocks,ctx.who,look,fonts,{news,postponed,form:f,holiday:holidayFor(day),week:weekOf(day)});return {...a,caption:signCaption(a.caption,comment)};},
  signText(text,comment),{via:dildo});
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
   if(PICTURES&&!state.posted.pictures?.[day]){
    const recent=Object.keys(state.posted.pictures||{}).sort().slice(-7).flatMap(d=>state.posted.pictures[d].ideas||[]);
    (state.posted.pictures||={})[day]=await picturesPost(day,archive.lines,ctx,{recent});pushState(state,archive);}
   if(!state.posted.mike?.[day]){const m=await mikeInterview(day,archive.lines,ctx,state);if(m){(state.posted.mike||={})[day]=m;pushState(state,archive);}}
   // Trevor's report from the infirmary, 20 minutes after Mike's interview (below, once the week and the month are posted).
   if(live&&TREVOR&&!state.posted.infirmary?.[day]){(state.posted.infirmary||={})[day]={status:'due',at:new Date(now()+INFIRMARY_DELAY_MS).toISOString()};pushState(state,archive);}
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
 const inf=state.posted.infirmary?.[day];
 if(inf?.status==='due'){
  const at=Date.parse(inf.at),wait=at-now();
  if(now()-START+wait>WATCH_MS-2*60e3){console.log(`${day}: the infirmary's time (${inf.at}) goes past this run; the next run posts it.`);return true;}
  if(wait>0){console.log(`${day}: the infirmary at ${inf.at}.`);save(state,archive);await sleep(wait);}
  state.posted.infirmary[day]=now()>at+INFIRMARY_LATE_MS?{status:'late',at:inf.at}:await infirmary(day,ctx);
  pushState(state,archive);
 }
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
 if(flag('--prompts')||flag('--pictures'))await picturesPost(day,archive.lines,ctx,{send:false,draw:flag('--pictures')});
 await mikeInterview(day,archive.lines,ctx,state);
 if(flag('--infirmary'))await infirmary(day,ctx,{send:false,draw:flag('--pictures'),prompts:flag('--prompts')});
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
 const send=flag('--send'),only=flag('--picture-only');
 if(send){const missing=[['MIKE_ROFFON_BOT_TOKEN',MIKE],['AWARDS_CHAT_ID',CHAT],...only?[['OPENAI_API_KEY',OPENAI_KEY]]:[['CLAUDE_CODE_OAUTH_TOKEN',claudeConfigured(env)]]].filter(x=>!x[1]).map(x=>x[0]);
  if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);}
 const ctx=await loadLeague(),m=only?await mikePictureOnly(day,archive.lines,ctx,state,send):await mikeInterview(day,archive.lines,ctx,state,{send,write:true});
 if(!m)throw Error(`${day}: no hero of the day`);
 if(m.status!==(send?'sent':'preview'))process.exitCode=1;
}

// Trevor Matolog's report from the infirmary by hand: ESPN's injury report as it is now, drawn and, with --send, posted by
// his bot. Nothing is saved, so each run with --send posts again.
async function trevorByHand(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('--trevor-day: a US day, YYYY-MM-DD');
 const send=flag('--send');
 if(send){const missing=[['TREVOR_MATOLOG_BOT_TOKEN',TREVOR],['AWARDS_CHAT_ID',CHAT]].filter(x=>!x[1]).map(x=>x[0]);if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);}
 const r=await infirmary(day,await loadLeague(),{send,draw:!flag('--prompts'),prompts:flag('--prompts')});
 if(r.status!==(send?'sent':'preview'))process.exitCode=1;
}

// Trevor introduces himself to the league (owner, 24.10.2026), once, by hand: his photo, then his words of
// data/trevor/hello.html as a reply under it, from his bot with --send; printed without it.
const TREVOR_HELLO_CAPTION='🏥 <b>Тревор Матолог</b>, травматолог лиги FBL, заступает на смену.';
async function trevorHello(){
 const text=fs.readFileSync(new URL('data/trevor/hello.html',ROOT),'utf8').trim(),send=flag('--send');
 if(!send){console.log(`\n===== Trevor Matolog's introduction (preview) =====\n${TREVOR_HELLO_CAPTION}\n\n${text}\n`);return;}
 const missing=[['TREVOR_MATOLOG_BOT_TOKEN',TREVOR],['AWARDS_CHAT_ID',CHAT]].filter(x=>!x[1]).map(x=>x[0]);if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);
 const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',TREVOR_HELLO_CAPTION);form.append('parse_mode','HTML');
 form.append('photo',new Blob([fs.readFileSync(new URL('scripts/assets/people/trevor-matolog.jpg',ROOT))],{type:'image/jpeg'}),'trevor-matolog.jpg');
 const shown=await telegram(TREVOR,'sendPhoto',form);
 await telegram(TREVOR,'sendMessage',{chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true,reply_parameters:{message_id:shown.message_id}});
 console.log('Trevor Matolog introduced himself to the league.');
}

// --- Inside FBL (inside-fbl.js): Mike Roffon's weekly long read. The awards bot's state is only read; the long reads keep
// their own state and pictures on the branch data/inside-fbl (--inside DIR, a clone of it): the pictures must be there
// before the Telegraph page shows them (by their raw.githubusercontent.com URLs, as Telegraph takes no uploads now).
const INSIDE_DIR=opt('--inside'),TELEGRAPH=env.TELEGRAPH_ACCESS_TOKEN;
const RAW=`https://raw.githubusercontent.com/${env.GITHUB_REPOSITORY||'RuslanMunasipov/Nba-draft-simulator'}/data/inside-fbl/`;
const insideRead=()=>{try{return JSON.parse(fs.readFileSync(path.join(INSIDE_DIR,'state.json'),'utf8'));}catch{return {version:1,weeks:{}};}};
function insidePush(inside,message){
 fs.mkdirSync(INSIDE_DIR,{recursive:true});fs.writeFileSync(path.join(INSIDE_DIR,'state.json'),JSON.stringify(inside,null,1));
 const token=env.GH_TOKEN,repo=env.GITHUB_REPOSITORY;if(!token||!repo)return;
 const git=(...a)=>execFileSync('git',['-C',INSIDE_DIR,...a],{stdio:'pipe'});
 try{
  if(!fs.existsSync(path.join(INSIDE_DIR,'.git')))git('init','-q','-b','data/inside-fbl');
  git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
  git('add','-A');git('commit','-q','--allow-empty','-m',message);
  git('push','-q',`https://x-access-token:${token}@github.com/${repo}.git`,'HEAD:data/inside-fbl');
 }catch(e){console.warn(`Inside FBL: push to data/inside-fbl failed (${String(e.stderr||e.message).trim().slice(-300)}).`);}
}
// The pictures of a piece, three at a time: the opener and one per chapter, as Claude wrote their prompts (c: their
// references, longreadCast). A picture that fails twice is left out. {bytes by key, spent}.
async function longreadPictures(longread,c){
 const todo=[{key:'opener',prompt:longread.opener},...longread.chapters.map((ch,i)=>({key:String(i+1),prompt:ch.picture}))],out={};let spent=0;
 const one=async t=>{
  try{const r=await generate({...picture(t.prompt,c),format:'jpeg'},{key:OPENAI_KEY,timeoutMs:180e3,attempts:2});out[t.key]=r.png;spent+=cost(r.usage);}
  catch(e){console.warn(`Inside FBL: picture ${t.key} failed (${e.message}): left out.`);}};
 for(let i=0;i<todo.length;i+=3)await Promise.all(todo.slice(i,i+3).map(one));
 return {out,spent};
}
// The owner approves every issue (owner, 23.10.2026): a draft (its Telegraph page, sent to him for review when
// INSIDE_FBL_REVIEW_CHAT_ID is set), approve, then the post run puts it into the league chat on Friday at 18:00 Moscow
// and never at another time; an issue not approved by then does not go out. --action:
//   draft    write, draw and publish the week's page unless there is one; --after-thursday: only once the awards bot
//            posted Thursday's games (the scheduled drafts on Friday morning)
//   redo     the same anew (--guest, --notes: the owner's wishes to the writer); the approval is gone
//   approve  the week's page may go out at 18:00
//   post     wait for Friday 18:00 Moscow, read the state again (an approval may have come meanwhile), post if approved
const REVIEW=env.INSIDE_FBL_REVIEW_CHAT_ID;
function insideRefresh(){
 if(!fs.existsSync(path.join(INSIDE_DIR,'.git'))||!env.GH_TOKEN||!env.GITHUB_REPOSITORY)return;
 try{execFileSync('git',['-C',INSIDE_DIR,'pull','-q','--ff-only',`https://x-access-token:${env.GH_TOKEN}@github.com/${env.GITHUB_REPOSITORY}.git`,'data/inside-fbl'],{stdio:'pipe'});}
 catch(e){console.warn(`Inside FBL: could not read the state again (${String(e.stderr||e.message).trim().slice(-200)}).`);}
}
async function insidePhoto(chat,file,caption){
 const bytes=file&&fs.existsSync(path.join(INSIDE_DIR,file))?fs.readFileSync(path.join(INSIDE_DIR,file)):null;
 if(!bytes)return telegram(MIKE,'sendMessage',{chat_id:chat,text:caption,parse_mode:'HTML'});
 const body=new FormData();body.append('chat_id',String(chat));body.append('caption',caption);body.append('parse_mode','HTML');
 body.append('photo',new Blob([bytes],{type:'image/jpeg'}),'inside-fbl.jpg');return telegram(MIKE,'sendPhoto',body);
}
async function insideFbl(){
 if(!INSIDE_DIR)throw Error('--inside-fbl: --inside DIR (a clone of the branch data/inside-fbl, or an empty directory)');
 const action=opt('--action')||'draft';
 if(!['draft','redo','approve','post','picture'].includes(action))throw Error(`--action: draft, redo, approve, post or picture, not ${action}`);
 const archive=read('archive.json',{lines:[]}),inside=insideRead();
 const w=weekOf(opt('--inside-week')||addDays(usDay(now()),-1)),rec=inside.weeks[w.start];
 if(rec?.status==='sent'){console.log(`Inside FBL, week ${w.n}: already sent (${rec.url}).`);return;}
 // picture: one chapter's picture drawn anew, its prompt written again by Claude from --scene (the owner's wish for it),
 // the Telegraph page edited to show it; the rest of the draft and its approval stay.
 if(action==='picture'){
  if(rec?.status!=='page'||!rec.opener)throw Error(`Inside FBL, week ${w.n}: no draft with pictures to change`);
  const n=Number(opt('--chapter')),wish=opt('--scene');if(!(n>=0)||!wish)throw Error('--action picture: --chapter N (0: the opener) and --scene TEXT (the wish)');
  const prefix=rec.opener.replace(/opener(-[a-z0-9]+)?\.jpg$/,''),{facts,longread}=JSON.parse(fs.readFileSync(path.join(INSIDE_DIR,`${prefix}longread.json`),'utf8'));
  if(n>0&&!longread.chapters[n-1])throw Error(`--chapter: the draft has ${longread.chapters.length} chapters`);
  const guest=facts.guest.kind==='GM'?{kind:'gm',team:LEAGUE_TEAMS.findIndex(t=>t.name===facts.guest.team)}:facts.guest.kind==='комиссар лиги'?{kind:'commissioner'}:null;
  if(!guest)throw Error('--action picture: a player guest is not supported yet');
  const c=longreadCast(guest,{guestPhoto:await guestReference(guest)}),written=await writeChapterPicture(longread,n,facts,c,wish);
  if(!written)throw Error(`Inside FBL: Claude could not write picture ${n||'opener'} anew`);
  const scene=written.prompt,r=await generate({...written,format:'jpeg'},{key:OPENAI_KEY,timeoutMs:180e3,attempts:2});
  const file=`${prefix}${n||'opener'}-${Date.now().toString(36)}.jpg`;fs.writeFileSync(path.join(INSIDE_DIR,file),r.png);
  const images=longread.chapters.map((_,i)=>rec.images?.[i]||`${RAW}${prefix}${i+1}.jpg`);if(n>0)images[n-1]=`${RAW}${file}`;
  const opener=n>0?rec.opener:file;
  if(n>0)longread.chapters[n-1].picture=scene;else longread.opener=scene;
  fs.writeFileSync(path.join(INSIDE_DIR,`${prefix}longread.json`),JSON.stringify({facts,longread},null,1));
  insidePush(inside,`Inside FBL ${w.start}: picture ${n||'opener'}`);
  await editPage(rec.url,longread,facts,{token:TELEGRAPH,opener:`${RAW}${opener}`,images});
  inside.weeks[w.start]={...rec,images,opener,caption:longreadCaption(longread,facts,rec.url),cost:Math.round(((rec.cost||0)+cost(r.usage))*1e4)/1e4};
  insidePush(inside,`Inside FBL ${w.start}: picture ${n} on the page`);
  console.log(`Inside FBL, week ${w.n}: picture ${n} drawn anew (${RAW}${file}), the page edited.`);return;
 }
 if(action==='approve'){
  if(rec?.status!=='page')throw Error(`Inside FBL, week ${w.n}: no page to approve (${rec?.status||'nothing yet'}); run draft first`);
  inside.weeks[w.start]={...rec,approved:true,approvedAt:new Date().toISOString()};insidePush(inside,`Inside FBL ${w.start}: approved`);
  console.log(`Inside FBL, week ${w.n}: approved, goes out on ${new Date(postTime(w.start)).toISOString()} (${rec.url}).`);return;
 }
 if(action==='post'){
  const missing=[['MIKE_ROFFON_BOT_TOKEN',MIKE],['AWARDS_CHAT_ID',CHAT]].filter(x=>!x[1]).map(x=>x[0]);
  if(missing.length)throw Error(`--action post: missing ${missing.join(', ')}`);
  const at=postTime(w.start);
  if(now()>at+30*60e3){console.log(`Inside FBL, week ${w.n}: its time (${new Date(at).toISOString()}) is past; not posted.`);return;}
  if(now()<at){console.log(`Inside FBL: waiting for ${new Date(at).toISOString()}.`);await sleep(at-now());}
  insideRefresh();const fresh=insideRead(),x=fresh.weeks[w.start];
  if(x?.status==='sent'){console.log(`Inside FBL, week ${w.n}: already sent.`);return;}
  if(x?.status!=='page'||!x.approved){console.log(`Inside FBL, week ${w.n}: not approved by 18:00 (${x?.status||'no page'}); not posted.`);return;}
  await insidePhoto(CHAT,x.opener,x.caption);
  fresh.weeks[w.start]={...x,status:'sent',sentAt:new Date().toISOString()};insidePush(fresh,`Inside FBL ${w.start}: sent`);
  console.log(`Inside FBL, week ${w.n}: sent.`);return;
 }
 // draft or redo
 if(action==='draft'&&rec?.status==='page'){console.log(`Inside FBL, week ${w.n}: the draft is there (${rec.url})${rec.approved?', approved':''}.`);return;}
 if(flag('--after-thursday')&&!read('state.json',{posted:{daily:{}}}).posted.daily[addDays(w.start,3)]){
  console.log(`Inside FBL, week ${w.n}: Thursday's games are not posted yet; a later run drafts.`);return;}
 if(!archive.lines.some(l=>l.d>=w.start&&l.d<=w.end))throw Error(`Inside FBL: no archived games of the week ${w.start} – ${w.end}`);
 const ctx=await loadLeague(),table=teamPoints({players:ctx.players,live:ctx.live},ctx.transfers);
 const data=weekData(archive.lines,w.end,{table,who:ctx.who,rostered:ctx.league.rostered(),rookies:ctx.rookies,mef:ctx.mef});
 const past=Object.entries(inside.weeks).filter(([k,x])=>k<w.start&&x.status==='sent').sort(([a],[b])=>a.localeCompare(b)).map(([,x])=>x);
 const guest=pickGuest(data,past.map(x=>x.guest),{force:opt('--guest'),keep:action==='redo'?rec?.guest?.key:null});
 const facts=longreadFacts(data,guest,{who:ctx.who,gifts:past.map(x=>x.gift).filter(Boolean),guests:past.map(x=>x.guest.name)});
 console.log(`Inside FBL, week ${w.n} (${w.start} – ${w.end}): ${facts.guest.name}, ${guest.story.id}${action==='redo'?', anew':''}.`);
 // The references of its pictures first: Claude writes their prompts with the piece.
 const c=longreadCast(guest,{guestPhoto:await guestReference(guest)});
 const {longread,problems,tries}=await writeLongread(facts,c,{notes:opt('--notes')||''});
 const dir=path.join(INSIDE_DIR,'images',w.start);fs.mkdirSync(dir,{recursive:true});
 if(problems.length){console.warn(`Inside FBL: still wrong after ${tries} tries (${problems.join('; ')}): no draft.`);
  fs.writeFileSync(path.join(dir,'dropped.json'),JSON.stringify({facts,longread,problems},null,1));
  if(rec?.status!=='page')inside.weeks[w.start]={status:'dropped',guest:{key:guest.key,name:facts.guest.name},problems,at:new Date().toISOString()};
  insidePush(inside,`Inside FBL ${w.start}: dropped`);process.exitCode=1;return;}
 const {out,spent}=OPENAI_KEY?await longreadPictures(longread,c):{out:{},spent:0};
 // Each draft its own files, so a page under review keeps its pictures while a new one is made.
 const tag=Date.now().toString(36);
 for(const [k,bytes] of Object.entries(out))fs.writeFileSync(path.join(dir,`${tag}-${k}.jpg`),bytes);
 fs.writeFileSync(path.join(dir,`${tag}-longread.json`),JSON.stringify({facts,longread},null,1));
 insidePush(inside,`Inside FBL ${w.start}: pictures`);
 const url=k=>out[k]?`${RAW}images/${w.start}/${tag}-${k}.jpg`:null;
 const page=await publishPage(longread,facts,{token:TELEGRAPH,opener:url('opener'),images:longread.chapters.map((_,i)=>url(String(i+1)))});
 const entry={status:'page',url:page,title:longread.title,images:longread.chapters.map((_,i)=>url(String(i+1))),guest:{key:guest.key,name:facts.guest.name},gift:longread.gift||'',approved:false,
  caption:longreadCaption(longread,facts,page),opener:out.opener?`images/${w.start}/${tag}-opener.jpg`:null,pictures:Object.keys(out).length,
  cost:Math.round(((rec?.cost||0)+spent)*1e4)/1e4,at:new Date().toISOString(),drafts:[...(rec?.drafts||[]),...rec?.url?[rec.url]:[]]};
 inside.weeks[w.start]=entry;insidePush(inside,`Inside FBL ${w.start}: draft`);
 console.log(`Inside FBL: draft ${page} (${entry.pictures} pictures, $${spent.toFixed(3)}).`);
 if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`### Inside FBL, неделя ${w.n}: черновик на согласование\n\n${facts.guest.name}: [${longread.title}](${page})\n\n`);
 if(REVIEW&&MIKE){
  const note=`📝 <b>На согласование: Inside FBL, неделя ${w.n}</b>\n${esc(facts.guest.name)} — <a href="${esc(page)}">${esc(longread.title)}</a>\n\nВыйдет в пятницу в 18:00 по Москве, только если одобришь: Actions → Inside FBL → approve. Переписать: redo (можно с пожеланиями).`;
  try{await insidePhoto(REVIEW,entry.opener,note.slice(0,1024));}catch(e){console.warn(`Inside FBL: the review note failed (${e.message}).`);}
 }
}

// --- Christopher Dildo's own words (dildo.js), by hand. --dildo-intro FILE: his introduction to the league written by
// Claude on the season so far (the archive of --state), its numbers checked, saved to FILE (data/dildo/) and printed;
// nothing is sent. --dildo-post FILE [--send] [--picture]: that file posted as it is by his own bot only (his word never
// goes from another bot), with its picture: its prompt written by Claude from the post, ultra-realistic with his face
// as in the reference, drawn by OpenAI (about $0.03; with --send, or --picture in a preview, into --cards). Never his
// bare reference photo (owner, 24.10.2026): without a picture the post goes as text. Without --send it is printed.
async function dildoIntro(file){
 const archive=read('archive.json',{lines:[]});
 if(!archive.lines.length)throw Error('--dildo-intro: no archived games in --state');
 const ctx=await loadLeague(),text=await introFor(introFacts(archive.lines,ctx.who));
 if(!text)throw Error('--dildo-intro: Claude could not write it with the numbers of the facts');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text+'\n');
 console.log(`\n===== Christopher Dildo's introduction (${text.length} characters): ${file} =====\n${text}\n`);
}
async function dildoPost(file,send){
 const text=fs.readFileSync(file,'utf8').trim();
 if(text.length>1024)throw Error(`--dildo-post: ${text.length} characters, a photo's caption takes 1024`);
 if(send){const missing=[['CHRISTOPHER_DILDO_BOT_TOKEN',DILDO],['AWARDS_CHAT_ID',CHAT]].filter(x=>!x[1]).map(x=>x[0]);
  if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);}
 let png=null,spent=0;
 if(send||flag('--picture')){
  if(!OPENAI_KEY||!claudeConfigured(env))console.warn('Christopher Dildo: no OPENAI_API_KEY or Claude subscription, no picture: the post goes as text.');
  else try{
   const written=await writePostPicture(text);
   if(written){console.log(`\n===== Christopher Dildo's picture (written by Claude) =====\n${written.prompt}\n`);
    const r=await generate(written,{key:OPENAI_KEY,timeoutMs:180e3,attempts:2});png=r.png;spent=cost(r.usage);}
   else console.warn('Christopher Dildo: Claude could not write the picture: the post goes as text.');
  }catch(e){console.warn(`Christopher Dildo: the picture failed (${e.message}): the post goes as text.`);}
 }
 if(png&&CARDS_DIR){fs.mkdirSync(CARDS_DIR,{recursive:true});fs.writeFileSync(path.join(CARDS_DIR,path.basename(file).replace(/\.html$/,'.png')),png);}
 if(!send){console.log(`\n===== Christopher Dildo (preview${png?`, picture $${spent.toFixed(3)}`:''}) =====\n${text}\n`);return;}
 if(png){const body=new FormData();body.append('chat_id',String(CHAT));body.append('caption',text);body.append('parse_mode','HTML');
  body.append('photo',new Blob([png],{type:'image/png'}),'christopher-dildo.png');await telegram(DILDO,'sendPhoto',body);}
 else await telegram(DILDO,'sendMessage',{chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true});
 console.log(`Christopher Dildo: ${file} sent${png?` with its picture, $${spent.toFixed(3)}`:' as text'}.`);
}

// Steven Ex Pert introduces himself to the league (steven.js): his photo and his words, by his own bot only (an
// introduction from another bot would not be his); without --send only printed.
async function stevenHello(){
 if(!flag('--send')){console.log(`\n===== Steven Ex Pert's introduction (preview, ${path.basename(HELLO_PHOTO)}) =====\n${HELLO_CAPTION}\n`);return;}
 const missing=[['STEVEN_EX_PERT_BOT_TOKEN',env.STEVEN_EX_PERT_BOT_TOKEN],['AWARDS_CHAT_ID',CHAT]].filter(x=>!x[1]).map(x=>x[0]);
 if(missing.length)throw Error(`--send: missing ${missing.join(', ')}`);
 const form=new FormData();form.append('chat_id',String(CHAT));form.append('caption',HELLO_CAPTION);form.append('parse_mode','HTML');
 form.append('photo',new Blob([fs.readFileSync(HELLO_PHOTO)],{type:'image/jpeg'}),'steven-ex-pert.jpg');
 await telegram(env.STEVEN_EX_PERT_BOT_TOKEN,'sendPhoto',form);
 console.log('Steven Ex Pert introduced himself to the league.');
}

const day=opt('--preview'),again=opt('--resend'),mikeDay=opt('--mike-day'),trevorDay=opt('--trevor-day');
if(flag('--steven-hello'))await stevenHello();
else if(opt('--dildo-intro')&&STATE_DIR)await dildoIntro(opt('--dildo-intro'));
else if(opt('--dildo-post'))await dildoPost(opt('--dildo-post'),flag('--send'));
else if(flag('--inside-fbl')&&STATE_DIR)await insideFbl();
else if(mikeDay&&STATE_DIR)await mikeByHand(mikeDay);
else if(flag('--trevor-hello'))await trevorHello();
else if(trevorDay)await trevorByHand(trevorDay);
else if(day)await preview(day);
else if(STATE_DIR&&again)await resend(again);
else if(STATE_DIR)await scheduled();
else{console.error('Usage: bot.mjs --state DIR [--resend YYYY-MM-DD | --mike-day YYYY-MM-DD [--send] | --dildo-intro FILE] | --dildo-post FILE [--send] | --trevor-day YYYY-MM-DD [--send] | --preview YYYY-MM-DD [--week] [--month] [--infirmary]');process.exit(2);}
