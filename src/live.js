import {liveGamePoints} from './season.js';

// ESPN public scoreboard and box scores (CORS-open): today's games with running FBL points by the league's Yahoo formula
// (season.js boxScorePoints: the box-score terms, +1 for the game played).
const API='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
// A call ESPN never answers must not hold the page or the notifier (the watcher waits for it): it fails after this long.
export const ESPN_TIMEOUT_MS=20e3;
const finals=new Map();
export function usDate(now=Date.now(),days=0){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now+days*864e5));
 return parts.replaceAll('-','');
}
// Moscow calendar date of a game start: the date Sports.ru files that game under.
export function moscowDate(iso){return new Date(Date.parse(iso)+3*3600e3).toISOString().slice(0,10);}
export function eventInfo(e){
 const c=e.competitions?.[0],side=h=>c?.competitors?.find(x=>x.homeAway===h);
 const team=x=>({abbr:x?.team?.abbreviation,name:x?.team?.shortDisplayName||x?.team?.displayName,score:x?.score,winner:x?.winner});
 // pause: halftime or the break after a quarter, when nobody is on the floor whatever the last lineup.
 return {id:e.id,date:e.date,state:e.status?.type?.state,final:Boolean(e.status?.type?.completed),pause:/HALFTIME|END_PERIOD/.test(e.status?.type?.name||''),
  detail:e.status?.type?.shortDetail||'',home:team(side('home')),away:team(side('away'))};
}
// While a game runs the scores refresh every 20 s. A game past its tip-off that ESPN still lists as not started is checked
// every 30 s; otherwise the page wakes 15 s after the next tip-off within 12 hours. null: no game to watch.
export const LIVE_MS=20e3;
export function nextLiveDelay(games,now=Date.now()){
 if(games.some(g=>g.state==='in'))return LIVE_MS;
 const starts=games.filter(g=>g.state==='pre').map(g=>Date.parse(g.date)).filter(t=>Number.isFinite(t)&&t>now-3*36e5);
 if(starts.some(t=>t<=now))return 30e3;
 const next=Math.min(...starts);
 return next-now<=12*36e5?Math.max(LIVE_MS,next-now+15e3):null;
}
// The timeout covers the body too (a stalled stream aborts the same way); a browser without AbortSignal.timeout waits.
async function getJson(url,ms){const r=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout?.(ms)});if(!r.ok)throw Error(String(r.status));return r.json();}
// Yesterday and today (US Eastern) with running points for games that have started.
export async function fetchLiveGames(wantedTeams,{timeoutMs=ESPN_TIMEOUT_MS}={}){
 const days=[usDate(Date.now(),-1),usDate()],events=[],get=url=>getJson(url,timeoutMs);
 let failed=0;for(const d of days){try{events.push(...((await get(API+'scoreboard?dates='+d)).events||[]));}catch{failed++;}}
 // Every day failed: ESPN is unreachable, which the screen must not present as "no games today".
 if(failed===days.length)throw Error('ESPN scoreboard unavailable');
 const games=[];
 await Promise.all(events.map(async e=>{
  const info=eventInfo(e);games.push(info);
  if(info.state==='pre'||(wantedTeams&&!wantedTeams.has(info.home.abbr)&&!wantedTeams.has(info.away.abbr)))return;
  if(finals.has(info.id)){info.points=finals.get(info.id);return;}
  try{info.points=liveGamePoints(await get(API+'summary?event='+info.id),e);if(info.final)finals.set(info.id,info.points);}catch{info.points=null;}
 }));
 return games.sort((a,b)=>a.date.localeCompare(b.date));
}
