// FBL awards bot, pure logic: ESPN box scores to FBL game lines, who held each player at tip-off, the bench slot of the
// sixth-man race, and every ranking of the daily, weekly and monthly posts. No network and no files: bot.mjs does that.
// Spec: the league's awards ТЗ (21.10.2026). A line is one player's game: {d: US game day, e: ESPN event, a: ESPN athlete,
// n: ESPN short name, c: NBA club, t: tip-off (UTC), m: minutes, s: box-score stats, p: FBL points, h: league teams that
// held him at tip-off, b: those of them for which he was the bench player (the cheaper of the two at his position)}.
import {fblPoints} from '../src/fbl-scoring.js';
import {inStint} from '../src/season.js';
import {TRANSFER_HOURS} from '../src/rules.js';
import RULES from '../data/league-rules.json' with {type:'json'};

export const SEASON_START=RULES.yahoo.scoringStart,SEASON_END=RULES.yahoo.scoringEnd;
export const STATS=['pts','reb','ast','stl','blk','tov','fgm','fga','ftm','fta','pf'];
// Minimum minutes: a flop of the day among the league's players, a flop of the week. The NBA antitop takes every player
// who took the floor (league chat, 21.10.2026: a minus in eight minutes is the point of it).
export const MIN_FLOP=15,MIN_WEEK_FLOP=60;
// Mef player: pre-season Sports.ru price from 1000 to 1900 inclusive.
export const MEF_PRICE={min:1000,max:1900};
// Season records start announcing new entries a week into the season: before that every big game would be one.
export const RECORD_ALERTS_FROM_DAY=7;
// ESPN statuses of a game that will not be played that day: it is not waited for.
const OFF=new Set(['STATUS_POSTPONED','STATUS_CANCELED','STATUS_SUSPENDED','STATUS_FORFEIT']);

// --- Dates. A US game day is YYYY-MM-DD in US Eastern time, the day ESPN's scoreboard files a game under.
export const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
export const daysBetween=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
export const usDay=(ms=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export const moscowDay=(ms=Date.now())=>new Date(ms+3*3600e3).toISOString().slice(0,10);
// The game day the morning run reports: from 06:00 to 14:00 Moscow time, the US evening twelve hours earlier.
export const reportDay=(ms=Date.now())=>usDay(ms-12*3600e3);
// The post of a day goes out as soon as its last game is over (league chat, 22.10.2026); a box score corrected later
// reaches the Monday post, which reads the week again. Only a postponed or cancelled game is not waited for.
// The bot stays on a day from this long before its last game tips off (an hourly run starts it), then follows it.
export const LEAD_MS=75*60e3;
// What to do about a game day now, from ESPN's games of it (tip, final, off):
// 'none' (no games), 'later' (the last game tips off more than LEAD_MS from now: a later run takes it), 'wait' (until the
// last tip-off), 'poll' (games still running: check again) or 'post' (every game is over).
export function nextStep(games,now){
 if(!games.length)return {do:'none'};
 const pending=games.filter(g=>!g.final&&!g.off);
 if(!pending.length)return {do:'post'};
 const last=Math.max(...pending.map(g=>Date.parse(g.tip)));
 if(last-now>LEAD_MS)return {do:'later',until:last};
 if(now<last)return {do:'wait',until:last,left:pending.length};
 return {do:'poll',left:pending.length};
}
// Weeks run Monday to Sunday in US game days; week 1 is the one the season opens in.
const monday=day=>addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
export const weekOf=day=>({n:Math.floor(daysBetween(monday(SEASON_START),day)/7)+1,start:monday(day),end:addDays(monday(day),6)});
export const isSunday=day=>new Date(day+'T12:00:00Z').getUTCDay()===0;
export const isMonthEnd=day=>addDays(day,1).slice(5,7)!==day.slice(5,7);
// Special days get their own mark next to a season record.
const SPECIAL={'12-25':'🎄'};
export const special=day=>SPECIAL[day.slice(5)]||'';

// --- ESPN.
export function parseScoreboard(json){
 return (json?.events||[]).map(e=>{const c=e.competitions?.[0],abbr=h=>c?.competitors?.find(x=>x.homeAway===h)?.team?.abbreviation||'';
  const type=e.status?.type||{};
  return {id:String(e.id),tip:e.date,status:type.name||'',final:Boolean(type.completed),off:OFF.has(type.name),home:abbr('home'),away:abbr('away')};});
}
const num=v=>Number(v)||0,made=v=>String(v||'0-0').split('-').map(Number);
// Every player who took the floor (a line with stats); a DNP has none. Minutes may come as "31" or "31:12".
export function parseSummary(json,game,day){
 const out=[];
 for(const team of json?.boxscore?.players||[])for(const st of team.statistics||[]){
  const labels=st.labels||st.names||[];
  for(const a of st.athletes||[]){
   if(!a.stats?.length||a.didNotPlay)continue;
   const x=Object.fromEntries(labels.map((l,i)=>[l,a.stats[i]])),[fgm,fga]=made(x.FG),[ftm,fta]=made(x.FT);
   const mm=String(x.MIN||'0').split(':'),m=Math.round((num(mm[0])+num(mm[1])/60)*10)/10;
   const s={pts:num(x.PTS),reb:num(x.REB),ast:num(x.AST),stl:num(x.STL),blk:num(x.BLK),tov:num(x.TO),fgm,fga,ftm,fta,pf:num(x.PF)};
   let p;try{p=fblPoints({...s,minutes:m});}catch{continue;}
   out.push({d:day,e:game.id,a:String(a.athlete?.id),n:a.athlete?.shortName||a.athlete?.displayName||'',c:team.team?.abbreviation||'',t:game.tip,m,s,p});
  }
 }
 return out;
}

// --- The league: players, holdings and prices, from the project's data (bot.mjs loads them).
// players: the project's database with the Sports.ru market (season.js withMarket); live: sports-current.json;
// holdings: season.js stints(allTransfers(...).transfers); map: data/sports-player-map.json players; prices: the pre-season
// Sports.ru price snapshot's players.
const moveAt=(day,at)=>at?Date.parse(at):Date.parse(`${day}T${TRANSFER_HOURS.from}:00+03:00`);
// Every Sports.ru card of a player: the current one and those Sports.ru replaced (previousSportsIds: Keaton Wagler's
// 2208842, 2208816 since 23.10.2026). The pre-season price snapshot names the card of its day.
export const cardsOf=p=>[p?.sportsId,...(p?.previousSportsIds||[])].filter(Boolean).map(String);
export const byCard=players=>new Map(players.flatMap(p=>cardsOf(p).map(s=>[s,p])));
export function makeLeague({players,live,holdings,map=[],prices=[]}){
 const bySid=new Map(players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p])),byId=new Map(players.map(p=>[p.id,p]));
 const byEspn=new Map();
 for(const p of players)if(p.espnId)byEspn.set(String(p.espnId),p);
 for(const r of map){const p=bySid.get(String(r.sportsId));if(p&&r.espnId&&!byEspn.has(String(r.espnId)))byEspn.set(String(r.espnId),p);}
 const espnOf=p=>p?.espnId?String(p.espnId):map.find(r=>String(r.sportsId)===String(p?.sportsId))?.espnId||null;
 const initial=new Map(prices.map(r=>[String(r.sportsId),r.price]));
 // A game as season.js reads it: its Moscow date (Sports.ru's) and its tip-off.
 const asGame=line=>({date:moscowDay(Date.parse(line.t)),tip:line.t});
 // Every team holding counts here, the one another team had first too: a badge and the sixth-man race follow the roster.
 const heldAt=(g,s)=>inStint(g,{...s,shadowedBy:undefined});
 const holdersAt=(p,line)=>{if(!p)return [];const g=asGame(line);return [...new Set(holdings.filter(s=>s.playerId===p.id&&heldAt(g,s)).map(s=>s.team))].sort((a,b)=>a-b);};
 const rosterAt=(team,line)=>{const g=asGame(line);return holdings.filter(s=>s.team===team&&heldAt(g,s)).map(s=>byId.get(s.playerId)).filter(Boolean);};
 const teamsAtTime=(p,ms)=>[...new Set(holdings.filter(s=>s.playerId===p.id&&moveAt(s.from,s.fromAt)<=ms&&(!s.to||moveAt(s.to,s.toAt)>ms)).map(s=>s.team))].sort((a,b)=>a-b);
 const currentTeams=p=>[...new Set(holdings.filter(s=>s.playerId===p.id&&!s.to).map(s=>s.team))].sort((a,b)=>a-b);
 const sportsRow=p=>live?.players?.[p?.sportsId];
 const positionOf=p=>sportsRow(p)?.position||p?.positions?.[0]||null;
 // Sports.ru price before a game day: after his last game filed under an earlier Moscow date, else the initial one.
 const priceBefore=(p,moscowDate)=>{const rows=(sportsRow(p)?.games||[]).filter(g=>g.date<moscowDate&&Number.isFinite(g.price));
  return rows.length?rows[rows.length-1].price:sportsRow(p)?.initialPrice??cardsOf(p).map(s=>initial.get(s)).find(Number.isFinite)??p?.price??0;};
 // Order of a team's roster on its Sports.ru page: the tie-break of two players of one price at the season start.
 // When the team's current holding of a player began (a draft holding: before every move).
 const joinedAt=(team,p,line)=>{const g=asGame(line),s=holdings.find(x=>x.team===team&&x.playerId===p.id&&heldAt(g,x));return s?moveAt(s.from,s.fromAt):0;};
 const rosterOrder=(team,p)=>{const i=(live?.teams?.[team]?.roster||[]).findIndex(r=>String(r.sportsId)===String(p.sportsId));return i<0?Infinity:i;};
 const rostered=()=>{const out=new Map();for(const s of holdings)if(!s.to){const p=byId.get(s.playerId),e=espnOf(p);if(e)out.set(e,[...new Set([...(out.get(e)||[]),s.team])].sort((a,b)=>a-b));}return out;};
 return {players,byEspn,espnOf,initial,asGame,holdersAt,rosterAt,teamsAtTime,currentTeams,positionOf,priceBefore,rosterOrder,joinedAt,rostered,
  player:a=>byEspn.get(String(a))||null};
}

// The bench player of a team's position at a game: the cheaper of its two players by the Sports.ru price before that game
// day. At one price the place stays with whoever held it: the bench player before stays on the bench (slots: "team:position"
// -> Sports.ru id of the bench player, carried from game to game), else the newcomer to the team takes it, and at the
// season start the order of the team's Sports.ru page decides (the second listed is the bench player).
export function benchOf(league,slots,team,player,line){
 const pos=league.positionOf(player);if(!pos)return false;
 const mates=league.rosterAt(team,line).filter(q=>league.positionOf(q)===pos);
 if(mates.length<2||!mates.some(q=>q.id===player.id))return false;
 const day=moscowDay(Date.parse(line.t)),price=new Map(mates.map(q=>[q.id,league.priceBefore(q,day)]));
 const low=Math.min(...price.values()),cheapest=mates.filter(q=>price.get(q.id)===low),key=`${team}:${pos}`,sid=q=>String(q.sportsId);
 const bench=cheapest.length===1?cheapest[0]:cheapest.find(q=>sid(q)===slots[key])
  ||[...cheapest].sort((a,b)=>league.joinedAt(team,b,line)-league.joinedAt(team,a,line)||league.rosterOrder(team,b)-league.rosterOrder(team,a))[0];
 slots[key]=sid(bench);
 return bench.id===player.id;
}
// Holders and bench status of a game's lines, in tip-off order so the bench slots move forward in time.
export function settle(lines,league,slots){
 return [...lines].sort((a,b)=>a.t.localeCompare(b.t)||a.a.localeCompare(b.a)).map(l=>{
  const p=league.player(l.a),h=league.holdersAt(p,l);
  return {...l,h,b:h.filter(t=>benchOf(league,slots,t,p,l))};
 });
}

// --- Rankings.
const sumStats=lines=>Object.fromEntries(STATS.map(k=>[k,lines.reduce((s,l)=>s+l.s[k],0)]));
// Lines summed per player (a week, a month, the season): points, games, minutes, stats, every team that held him.
export function perPlayer(lines){
 const by=new Map();
 for(const l of lines){const x=by.get(l.a)||{a:l.a,n:l.n,c:l.c,last:'',lines:[]};x.lines.push(l);if(l.t>=x.last){x.last=l.t;x.n=l.n;x.c=l.c;}by.set(l.a,x);}
 return [...by.values()].map(x=>({a:x.a,n:x.n,c:x.c,games:x.lines.length,m:x.lines.reduce((s,l)=>s+l.m,0),p:x.lines.reduce((s,l)=>s+l.p,0),
  s:sumStats(x.lines),h:[...new Set(x.lines.flatMap(l=>l.h))].sort((a,b)=>a-b)}));
}
const top=(rows,n,dir=-1)=>[...rows].sort((a,b)=>dir*(a.p-b.p)||a.m-b.m||String(a.t||'').localeCompare(String(b.t||''))||a.a.localeCompare(b.a)).slice(0,n);
// The site's day lists: the best and the worst n lines of the whole NBA, every player who took the floor (as the antitop).
export const dayLists=(lines,n=10)=>({top:top(lines,n),antitop:top(lines,n,1)});
// The day: heroes and flops of the league's players, the best free agents, the NBA antitop.
export function dailyBlocks(lines){
 const drafted=lines.filter(l=>l.h.length),free=lines.filter(l=>!l.h.length);
 return {heroes:top(drafted,3),flops:top(drafted.filter(l=>l.m>=MIN_FLOP),3,1),gold:top(free,3),antitop:top(lines,3,1)};
}
// A player's form on a game day, from the days before it and the day itself (league chat, 22.10.2026): how often he was
// among the day's heroes and flops of the league over the last FORM_DAYS game days, and his run of days in a row. On fire
// (🔥) after 3 heroes in that window or 2 days in a row, ablaze (🔥🔥) after 5 or 3 in a row; frozen (🧊) after 3 flops.
// Bricks (🧱) are a flop that came from missed shots: MISSED_BRICKS or more missed field goals that game.
export const FORM_DAYS=7,MISSED_BRICKS=10;
export function form(lines,day){
 const days=[...new Set(lines.filter(l=>l.d<=day).map(l=>l.d))].sort().slice(-FORM_DAYS),by=new Map();
 for(const d of days){const b=dailyBlocks(lines.filter(l=>l.d===d));
  for(const [kind,rows] of [['hero',b.heroes],['flop',b.flops]])for(const l of rows){const x=by.get(l.a)||{hero:[],flop:[]};x[kind].push(d);by.set(l.a,x);}}
 const run=list=>{let n=0;for(let i=days.length-1;i>=0&&list.includes(days[i]);i--)n++;return n;};
 const out=new Map();
 for(const [a,x] of by){const hero=x.hero.length,flop=x.flop.length,heroRun=run(x.hero),flopRun=run(x.flop);
  out.set(a,{hero,flop,heroRun,flopRun,fire:hero>=5||heroRun>=3?2:hero>=3||heroRun>=2?1:0,ice:flop>=3});}
 return out;
}
export const bricks=l=>l.s.fga-l.s.fgm>=MISSED_BRICKS;
export function weeklyBlocks(lines){
 const rows=perPlayer(lines),drafted=rows.filter(r=>r.h.length),free=rows.filter(r=>!r.h.length);
 return {heroes:top(drafted,3),flops:top(drafted.filter(r=>r.m>=MIN_WEEK_FLOP),3,1),gold:top(free,3)};
}
// Season records: single games, best and worst; at one score the earlier game ranks higher.
export function records(lines,n=3){
 const order=dir=>(a,b)=>dir*(a.p-b.p)||a.t.localeCompare(b.t)||a.a.localeCompare(b.a);
 return {best:[...lines].sort(order(-1)).slice(0,n),worst:[...lines].sort(order(1)).slice(0,n)};
}
const same=(x,y)=>x&&y&&x.e===y.e&&x.a===y.a;
// What a day changed in the records: entries of that day, with the record it broke when it took first place.
export function recordNews(before,day){
 const news=[];
 for(const kind of ['best','worst']){const prev=records(before)[kind],now=records([...before,...day])[kind];
  now.forEach((l,i)=>{if(day.some(x=>same(x,l)))news.push({kind,rank:i+1,line:l,previous:i===0&&prev[0]&&!same(prev[0],l)?prev[0]:null});});}
 return news;
}
// Season races of the Monday post. rostered: ESPN id -> league teams holding him now; rookies: ESPN ids of rookies;
// mef: ESPN id -> pre-season Sports.ru price within MEF_PRICE.
export function races(lines,{rostered,rookies,mef}){
 const rows=new Map(perPlayer(lines).map(r=>[r.a,r]));
 const row=(a,teams)=>({...(rows.get(a)||{a,n:'',c:'',games:0,m:0,p:0,s:sumStats([]),h:[]}),teams});
 const rank=(list,n)=>list.sort((x,y)=>y.p-x.p||x.games-y.games||x.a.localeCompare(y.a)).slice(0,n);
 const mvp=rank([...rostered].map(([a,t])=>row(a,t)),10);
 const roy=rank([...rostered].filter(([a])=>rookies.has(a)).map(([a,t])=>row(a,t)),10);
 const mefList=rank([...mef].map(([a,price])=>({...row(a,rostered.get(a)||[]),price})),5);
 return {mvp,roy,mef:mefList,sixth:sixthRace(lines)};
}
// Sixth man: per team and player, over the games he played for that team. Index = FBL points x bench games / games.
export function sixthRace(lines,n=5){
 const by=new Map();
 for(const l of lines)for(const t of l.h){const k=t+':'+l.a,x=by.get(k)||{key:k,team:t,a:l.a,n:l.n,c:l.c,games:0,bench:0,p:0};
  x.games++;x.p+=l.p;if(l.b.includes(t))x.bench++;x.n=l.n;x.c=l.c;by.set(k,x);}
 return [...by.values()].filter(x=>x.bench>0).map(x=>({...x,index:x.p*x.bench/x.games}))
  .sort((a,b)=>b.index-a.index||b.bench-a.bench||a.key.localeCompare(b.key)).slice(0,n);
}
// Places moved since last week's post: positive is up. null: new in the list.
export const moved=(key,list,previous)=>{if(!previous)return 0;const i=previous.indexOf(key);return i<0?null:i-list.findIndex(x=>(x.key||x.a)===key);};
// The all-position five of a month: the best FBL points per Sports.ru position among the players the league held at the
// month's end; at equal points the one with fewer games. positionOf: ESPN id -> Sports.ru position.
export const POSITIONS=['PG','SG','SF','PF','C'];
export function monthFive(lines,{heldAtEnd,positionOf}){
 const rows=perPlayer(lines).filter(r=>heldAtEnd.has(r.a));
 return POSITIONS.map(pos=>{const best=rows.filter(r=>positionOf(r.a)===pos).sort((x,y)=>y.p-x.p||x.games-y.games||x.a.localeCompare(y.a))[0];
  return {pos,row:best?{...best,teams:heldAtEnd.get(best.a)}:null};});
}
// Teams with no rookie in their current roster (the league requires at least one).
export const withoutRookie=(rosters,isRookie)=>rosters.map((r,t)=>({t,ok:r.some(isRookie)})).filter(x=>!x.ok).map(x=>x.t);

// --- The site's summary (site.json beside the archive on data/awards-bot): what the Awards page shows, ranked by the code
// above, so the page reads a few hundred kilobytes instead of the whole archive (about 6 MB by the season's end).
// who(a): {id, sid} of the league's player (the database id and the Sports.ru id) for the page's names, or null.
const slim=(l,who)=>{const w=who(l.a);return {a:l.a,n:l.n,c:l.c,m:l.m,s:l.s,p:l.p,h:l.h,...(w?.sid?{sid:w.sid}:{})};};
export function siteSummary(lines,state,{rostered,rookies,mef,who=()=>null,now=new Date().toISOString()}={}){
 const byDay=new Map();for(const l of lines)(byDay.get(l.d)||byDay.set(l.d,[]).get(l.d)).push(l);
 const days={};
 for(const [d,ls] of [...byDay].sort()){
  const {top,antitop}=dayLists(ls,10),rec=state?.days?.[d],games=Object.values(rec?.games||{});
  days[d]={players:ls.length,top:top.map(l=>slim(l,who)),antitop:antitop.map(l=>slim(l,who)),
   done:Boolean(rec?.done),final:games.filter(g=>g.final).length,left:games.filter(g=>!g.final&&!g.off).length};
 }
 const row=r=>{const w=who(r.a);return {...r,s:undefined,h:undefined,...(w?.sid?{sid:w.sid}:{})};};
 const r=rostered?races(lines,{rostered,rookies,mef}):null,rec=records(lines);
 return {version:1,updatedAt:now,stateUpdatedAt:state?.updatedAt||null,mefPrice:MEF_PRICE,days,
  races:r?Object.fromEntries(Object.entries(r).map(([k,list])=>[k,list.map(row)])):null,ranks:state?.ranks||{},
  records:{best:rec.best.map(l=>({...slim(l,who),d:l.d})),worst:rec.worst.map(l=>({...slim(l,who),d:l.d}))}};
}
