import {liveGamePoints} from './season.js';

// ESPN public scoreboard and box scores (CORS-open): today's games with running fantasy points by the Sports.ru formula.
const API='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
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
 return {id:e.id,date:e.date,state:e.status?.type?.state,final:Boolean(e.status?.type?.completed),detail:e.status?.type?.shortDetail||'',home:team(side('home')),away:team(side('away'))};
}
async function getJson(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error(String(r.status));return r.json();}
// Yesterday and today (US Eastern) with running points for games that have started.
export async function fetchLiveGames(wantedTeams){
 const days=[usDate(Date.now(),-1),usDate()],events=[];
 let failed=0;for(const d of days){try{events.push(...((await getJson(API+'scoreboard?dates='+d)).events||[]));}catch{failed++;}}
 // Every day failed: ESPN is unreachable, which the screen must not present as "no games today".
 if(failed===days.length)throw Error('ESPN scoreboard unavailable');
 const games=[];
 await Promise.all(events.map(async e=>{
  const info=eventInfo(e);games.push(info);
  if(info.state==='pre'||(wantedTeams&&!wantedTeams.has(info.home.abbr)&&!wantedTeams.has(info.away.abbr)))return;
  if(finals.has(info.id)){info.points=finals.get(info.id);return;}
  try{info.points=liveGamePoints(await getJson(API+'summary?event='+info.id),e);if(info.final)finals.set(info.id,info.points);}catch{info.points=null;}
 }));
 return games.sort((a,b)=>a.date.localeCompare(b.date));
}
