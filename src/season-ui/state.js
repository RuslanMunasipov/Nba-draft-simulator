// The season page's shared state: the data (Sports.ru, ESPN, the league log), the chosen team, period and view, and the
// helpers every view reads. Only this module assigns them; the views call its setters.
import {readStored,writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {fblTransfers} from '../rules.js';
import {WEEKLY_TRANSFERS,moscowToday,seasonRosters,bank,transfersThisWeek,gameWeeks,weekOf,current,parseInjuries,allTransfers,withMarket,withBoxScores,CONFIDENT,DOUBTFUL} from '../season.js';
import {injuryUntil} from '../forecast-text.js';
import {fetchLiveGames,moscowDate,nextLiveDelay,LIVE_MS} from '../live.js';
import {count,injuryStatus} from '../format.js';

export const $=id=>document.getElementById(id);
export const REPO='RuslanMunasipov/Nba-draft-simulator';
export const LIVE_URLS=[`https://raw.githubusercontent.com/${REPO}/data/season-live/sports-current.json`,import.meta.env.BASE_URL+'data/sports-current.json'];
export const LEAGUE_URL=`https://raw.githubusercontent.com/${REPO}/main/data/fbl-league.json`;
export const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
export const SPORTS_URL=id=>`https://www.sports.ru/fantasy/basketball/player/info/150/${id}.html`;
export const TEAM_URL=id=>`https://www.sports.ru/fantasy/basketball/team/${id}.html`;
export const VIEWS=[['overview','Обзор'],['teams','Команды'],['players','Игроки'],['awards','Награды'],['transfers','Трансферы'],['injuries','Травмы'],['games','Матчи'],['rules','Правила']];
export const PERIOD={week:'Неделя',month:'4 недели',season:'Сезон'},PERIOD_LONG={week:'до конца недели',month:'за 4 недели',season:'до конца сезона'};
export const PERIOD_SHORT={week:'за неделю',month:'за 4 нед.',season:'за сезон'};
export const addDaysIso=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
export function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;}
export function link(textValue,href,cls){const a=el('a',textValue,cls);a.href=href;a.target='_blank';a.rel='noopener';return a;}
export function button(label,onclick,cls='btn-secondary btn-sm'){const b=el('button',label,cls);b.type='button';b.onclick=onclick;return b;}

export let basePlayers=[],players=[],byId=new Map(),live=null,rawLive=null,injuries=new Map(),league={transfers:[],banks:{}},games=[],card=()=>el('div');
// What each source did on the last refresh: the screens say so instead of showing zeros or "no injuries".
export let src={live:'idle',injuries:'idle',games:'idle',injuriesAt:null},loading=null,attempted=false,liveTimer=null,gamesAt=null,dbState='loading',dbRetry=null;
export let view=readStored('fbl-season-view')||'overview',team=Number(readStored('fbl-season-team')||0),horizon=readStored('fbl-season-horizon')||'month';
export let replacing=null,query='',injuryScope='league',onlyMine=true;
export const openRows=new Set();
export const tab=()=>document.body.dataset.tab;
export const readJson=(key,fallback)=>{try{return JSON.parse(readStored(key)||'null')??fallback;}catch{return fallback;}};
// Transfers recorded on this device but not yet confirmed in the shared league log.
export let pending=readJson('fbl-transfers',[]);
export const same=(a,b)=>a.team===b.team&&a.outId===b.outId&&a.inId===b.inId;
// Sports.ru journals for connected teams, the shared league log for the rest, then this device's unsent records.
export let mergedKey=null,mergedValue=null;
export function merged(){
 if(mergedKey&&mergedKey[0]===live&&mergedKey[1]===league&&mergedKey[2]===pending&&mergedKey[3]===players)return mergedValue;
 const base=allTransfers(players,live,league),all=[...base.transfers],keep=[];
 for(const x of pending){if(base.connected.has(x.team)||all.some(s=>same(s,x)))continue;try{seasonRosters([...all,x]);all.push(x);keep.push(x);}catch{}}
 if(keep.length!==pending.length){pending=keep;writeStored('fbl-transfers',JSON.stringify(pending));}
 mergedKey=[live,league,pending,players];mergedValue={...base,transfers:all};return mergedValue;
}
export const transfers=()=>merged().transfers;
export const sportsTeam=t=>live?.teams?.[t]||null;
// Transfers left this week: Sports.ru's own counter for connected teams, the league limit minus recorded ones otherwise.
// Both limits bind: Sports.ru's own weekly count (∞ in pre-season) and the FBL week (pre-season moves are free).
export function transfersLeft(ctx,t){const x=sportsTeam(t)?.transfersLeft,sports=sportsTeam(t)?.transfersUnlimited?Infinity:Number.isFinite(x)?x:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(ctx.transfers,t,ctx.today,gameWeeks(live)));
 return Math.min(sports,fblTransfers(ctx.transfers,t,ctx.today).left);}
export const draftPrice=id=>{const p=byId.get(id);return live?.players?.[p?.sportsId]?.initialPrice??p?.price??0;};
// Sports.ru's own balance wins: a number typed on this device only stands in for a team Sports.ru does not show.
export function teamBank(t,list=transfers()){const sports=sportsTeam(t)?.balance;if(Number.isFinite(sports))return sports;const local=readJson('fbl-bank',{})[t];if(Number.isFinite(local))return local;const shared=league.banks?.[t];if(Number.isFinite(shared))return shared;return bank(t,list,draftPrice);}
export function context(){const m=merged(),list=m.transfers;return {players,live,injuries,today:moscowToday(),rosters:seasonRosters(list),transfers:list,warnings:m.warnings,connected:m.connected,
 white:new Set(whiteList().filter(x=>!x.startsWith('none:')))};}
// Transfer gains count only games a move can still win: one that has tipped off by now scores for the seller (season.js
// inStint), so the views that weigh moves give expectedPoints the clock (ctx.now). The league race and the team
// forecasts do not: there a tipped game still counts for a holder who has not checked in yet.
export const forGains=ctx=>ctx.now?ctx:{...ctx,now:Date.now()};
export function owners(ctx){const m=new Map();ctx.rosters.forEach((ids,t)=>ids.forEach(id=>m.set(id,t)));return m;}
export const clubOf=p=>live?.players?.[p.sportsId]?.club||p.sportsClub;
export function issueUrl(title,payload){
 const body='Запись для общего журнала FBL. Нажми «Submit new issue» — бот проверит правила и добавит.\n\n```json\n'+JSON.stringify(payload)+'\n```';
 return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('FBL: '+title)}&body=${encodeURIComponent(body)}`;
}
export const teamOption=t=>teamName(t)+(t===0?' — моя':'');
export const liveAgeHours=()=>live?(Date.now()-Date.parse(live.collectedAt))/36e5:0;

// ---------- Data ----------
export async function fetchJson(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error(String(r.status));return r.json();}
// ESPN's news and injury comments in Russian (scripts/translate-espn.mjs, the branch data/translations): loaded once,
// when a view first needs them; without them the originals are shown.
export const TRANSLATIONS_URL=`https://raw.githubusercontent.com/${REPO}/data/translations/translations.json`;
export let translations=null;let translationsLoad=null;
export function loadTranslations(){return translationsLoad??=fetchJson(TRANSLATIONS_URL,{cache:'no-cache'}).then(t=>translations=t).catch(()=>{translationsLoad=null;return null;});}
export async function fetchLive(){for(const url of LIVE_URLS){try{const d=await fetchJson(url,{cache:'no-cache'});if(d?.players&&d?.clubs)return d;}catch{}}return null;}
export const hasInjuryRows=feed=>Boolean(feed?.injuries?.some?.(t=>t?.injuries?.length));
export async function refreshSeason(){
 if(loading)return loading;
 const refresh=$('season-refresh');refresh.disabled=true;refresh.setAttribute('aria-busy','true');
 // Views that keep their own data (the awards) read it again with the season data (refreshHooks).
 for(const f of refreshHooks)f();
 loading=Promise.all([fetchLive(),fetchJson(INJURY_URL).catch(()=>null),fetchJson(LEAGUE_URL,{cache:'no-cache'}).catch(()=>null)]).then(async([l,inj,lg])=>{
  if(l){rawLive=live=l;src.live='ok';addMarket();}else src.live=live?'stale':'error';
  // A report that lists nobody is a broken feed, never «all healthy» (the collector's rule, espn_injuries): like a
  // failed fetch it falls back to the collector's kept report.
  if(hasInjuryRows(inj)){injuries=parseInjuries(inj);src.injuries='ok';src.injuriesAt=new Date().toISOString();}
  // The collector keeps its last good report when ESPN fails (espnInjuriesOk false): used, but shown as old, as is any
  // report older than 6 hours (the Telegram advisor's bar).
  else if(live?.espnInjuries){injuries=parseInjuries(live.espnInjuries);src.injuriesAt=live.espnInjuries.fetchedAt;
   src.injuries=live.espnInjuriesOk===false||!(Date.now()-Date.parse(src.injuriesAt)<6*36e5)?'stale':'ok';}
  else src.injuries=injuries.size?'stale':'error';
  if(lg?.transfers)league=lg;
  await refreshGames();
 }).finally(()=>{loading=null;attempted=true;refresh.disabled=false;refresh.removeAttribute('aria-busy');renderSeason();});
 if(tab()==='season'&&!live)renderSeason(true);else $('season-status').textContent='Обновляю данные…';
 return loading;
}
export async function refreshGames(){
 const ctx=players.length?context():null,wanted=ctx?new Set(ctx.rosters.flat().map(id=>byId.get(id)?.team).filter(Boolean)):null;
 try{games=await fetchLiveGames(wanted);src.games=games.length?'ok':'empty';gamesAt=Date.now();}catch{src.games='error';}
 scoreBoxes();
 // Every 20 s while a game runs, and at the next tip-off (live.js nextLiveDelay), while the season page is open.
 clearTimeout(liveTimer);const wait=nextLiveDelay(games);
 if(wait!==null)liveTimer=setTimeout(liveTick,wait);
}
// Hidden, on the draft tab or while typing: skip the round but keep the rhythm, so the watch never stops by itself.
export async function liveTick(){
 if(tab()!=='season'||document.visibilityState==='hidden'||document.activeElement?.closest?.('#season-body input')){liveTimer=setTimeout(liveTick,LIVE_MS);return;}
 await refreshGames();renderSeason();
}
// Finished games of the last two days are scored from the ESPN box scores (season.js withBoxScores).
export function scoreBoxes(){if(rawLive&&players.length){live=withBoxScores(rawLive,games,players);addMarket();}}
export function setSeasonPlayers(list,cardFn){
 if(cardFn)card=cardFn;
 if(list===basePlayers||!list?.length)return;
 basePlayers=list;addMarket();scoreBoxes();
 if(tab()==='season')renderSeason();
}
// The draft tab reports how its player database is doing; without it the season tab has nothing to show.
export function setSeasonDatabaseState(state,retry=null){dbState=state;dbRetry=retry;if(tab()==='season'&&!players.length)renderSeason();}
// Database players plus Sports.ru market players the database does not know yet.
export function addMarket(){if(!basePlayers.length)return;players=withMarket(basePlayers,live);byId=new Map(players.map(p=>[p.id,p]));}
export function currentWeek(today){const w=weekOf(today,gameWeeks(live));return w?.n?w:null;}
// ESPN's English injury words, in Russian. A return date is shown only for players who are out, never for day-to-day,
// and never for a season-ending injury, whose date is ESPN's placeholder (forecast-text.js injuryUntil).
export const BODY={'lower leg':'голень',mouth:'рот',forearm:'предплечье',thigh:'бедро',quadricep:'квадрицепс',jaw:'челюсть',nose:'нос',hamstring:'бицепс бедра',knee:'колено',ankle:'голеностоп',foot:'стопа',back:'спина',groin:'пах',shoulder:'плечо',hip:'бедро',calf:'икроножная',achilles:'ахиллово сухожилие',wrist:'запястье',hand:'кисть',finger:'палец',thumb:'большой палец',toe:'палец стопы',elbow:'локоть',illness:'болезнь',concussion:'сотрясение',personal:'личные причины',rest:'отдых',neck:'шея',quadriceps:'квадрицепс',abdomen:'пресс',oblique:'косые мышцы',shin:'голень',leg:'нога',chest:'грудь',rib:'ребро',head:'голова',eye:'глаз',face:'лицо',lower_leg:'голень',heel:'пятка',undisclosed:'не раскрыто','not injury related':'не травма'};
export const bodyPart=t=>t?BODY[String(t).toLowerCase()]||t:'';
export function injuryInfo(p){
 const i=injuries.get(String(p.espnId));if(!i)return null;const s=injuryStatus(i.status);
 const until=injuryUntil(i);
 return {...s,until,text:[s.label,until].filter(Boolean).join(' '),raw:i};
}
export const injuryText=p=>injuryInfo(p)?.text||'';
export function injuryChip(p){const i=injuryInfo(p);return i?el('span',i.text,'chip '+(i.level==='out'?'chip--danger':'chip--warn')):null;}
// Running points of the games in progress, from the ESPN box scores (a final game is a played row by then, scored from
// its box score: season.js withBoxScores).
export function livePoints(){
 const out=new Map();
 for(const g of games){if(!g.points)continue;const day=moscowDate(g.date);
  for(const p of players){const x=g.points[String(p.espnId)];if(!x)continue;
   const official=(live?.players?.[p.sportsId]?.games||[]).some(o=>o.date===day&&o.played);
   if(!official)out.set(p.id,{...x,game:g,day});}}
 return out;
}
export const clockMin=v=>{const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:Number(v)||0;};
// ---------- States ----------
export function skeleton(rows=6){const s=el('div',null,'skeleton');s.setAttribute('aria-hidden','true');for(let i=0;i<rows;i++)s.append(el('span'));return s;}
export function loadingBlock(title){const box=el('div');box.setAttribute('aria-busy','true');if(title)box.append(el('h3',title));box.append(el('p','Загружаю данные Sports.ru…','muted'),skeleton());return box;}
export function errorBlock(title,line,retry=()=>refreshSeason()){const s=el('div',null,'state state--error');s.append(el('strong',title),el('p',line),button('Повторить',retry));return s;}
// Views that need Sports.ru rosters and prices: a skeleton while loading, an honest error when it never came.
export function needsLive(title){
 if(live)return null;
 if(loading||!attempted)return [loadingBlock(title)];
 return [errorBlock('Нет данных Sports.ru','Составы, цены и очки появятся, когда Sports.ru ответит. Проверь интернет и повтори.')];
}
export const confidenceWord={CONFIDENT:['стоит делать','chip--accent'],MODERATE:['на грани','chip--warn'],DOUBTFUL:['не стоит','chip--danger']};
// The level follows the rounded-down percent, so a badge never prints "70%" next to "на грани".
export function level(why){const p=Math.floor(why.confidence*100);return p>=Math.round(CONFIDENT*100)?'CONFIDENT':p>=Math.round(DOUBTFUL*100)?'MODERATE':'DOUBTFUL';}
export function confidenceBadge(why){const [word,cls]=confidenceWord[level(why)];const b=el('span',`${word} · ${Math.floor(why.confidence*100)}%`,'chip sp-confidence '+cls);b.title='Вероятность, что обмен даст плюс за выбранный период';return b;}
export function whiteList(){const shared=(league.white||[]).map(String),draft=readJson('fbl-white-pending',null);return draft?draft.map(String):shared;}
export function setView(v){view=v;writeStored('fbl-season-view',v);renderSeason();window.scrollTo({top:0});}
// The page's renderer (src/season-ui.js) and the views' refresh hooks: the views import this module, not the other way.
export let renderer=()=>{};export const refreshHooks=[];
export function setRenderer(f){renderer=f;}
export function renderSeason(busy=false){return renderer(busy);}
export const setTeam=t=>{team=t;},setReplacing=id=>{replacing=id;},setQuery=q=>{query=q;},setOnlyMine=v=>{onlyMine=v;},setInjuryScope=v=>{injuryScope=v;};
export function setHorizon(h){horizon=h;}
export function setPending(list){pending=list;}
