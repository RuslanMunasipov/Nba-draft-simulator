import {readStored,writeStored} from './storage.js';
import {teamLabel,teamName} from './teams.js';
import {fblTransfers,checkRules,verdict,appeal,LAWYER,TRANSFER_HOURS} from './rules.js';
import {WEEKLY_TRANSFERS,moscowToday,seasonRosters,bank,transfersThisWeek,perGame,horizons,gameWeeks,weekOf,current,playerOutlook,transferOptions,bestTransfers,bestPackage,marketAlerts,expectedPoints,parseInjuries,allTransfers,withMarket,explainSwap,newsInjuries,withBoxScores,CONFIDENT,DOUBTFUL} from './season.js';
import {recommendPackage,contestedBy,transferWindow} from './season.js';
import {leagueRace,teamPlace,placeLabel,chanceText,periodWindows,windowFact,CHANCE_RUNS} from './standings.js';
import {combineNote,absenceShort,sportsSeasonsLine,seasonMethod} from './forecast-text.js';
import {fetchLiveGames,moscowDate,nextLiveDelay,LIVE_MS} from './live.js';
import {int,dec,signed,count,ddmm,timeMsk,stampMsk,weekday,injuryStatus} from './format.js';
import {statLine} from './stat-line.js';

const $=id=>document.getElementById(id);
const REPO='RuslanMunasipov/Nba-draft-simulator';
const LIVE_URLS=[`https://raw.githubusercontent.com/${REPO}/data/season-live/sports-current.json`,import.meta.env.BASE_URL+'data/sports-current.json'];
const LEAGUE_URL=`https://raw.githubusercontent.com/${REPO}/main/data/fbl-league.json`;
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const SPORTS_URL=id=>`https://www.sports.ru/fantasy/basketball/player/info/150/${id}.html`;
const TEAM_URL=id=>`https://www.sports.ru/fantasy/basketball/team/${id}.html`;
const VIEWS=[['overview','Обзор'],['teams','Команды'],['transfers','Трансферы'],['injuries','Травмы'],['games','Матчи'],['rules','Правила']];
const PERIOD={week:'Неделя',month:'4 недели',season:'Сезон'},PERIOD_LONG={week:'до конца недели',month:'за 4 недели',season:'до конца сезона'};
const addDaysIso=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;}
function link(textValue,href,cls){const a=el('a',textValue,cls);a.href=href;a.target='_blank';a.rel='noopener';return a;}
function button(label,onclick,cls='btn-secondary btn-sm'){const b=el('button',label,cls);b.type='button';b.onclick=onclick;return b;}

let basePlayers=[],players=[],byId=new Map(),live=null,rawLive=null,injuries=new Map(),league={transfers:[],banks:{}},games=[],card=()=>el('div');
// What each source did on the last refresh: the screens say so instead of showing zeros or "no injuries".
let src={live:'idle',injuries:'idle',games:'idle',injuriesAt:null},loading=null,attempted=false,liveTimer=null,gamesAt=null,dbState='loading',dbRetry=null;
let view=readStored('fbl-season-view')||'overview',team=Number(readStored('fbl-season-team')||0),horizon=readStored('fbl-season-horizon')||'month';
let replacing=null,query='',injuryScope='league',onlyMine=true;
const openRows=new Set();
const tab=()=>document.body.dataset.tab;
const readJson=(key,fallback)=>{try{return JSON.parse(readStored(key)||'null')??fallback;}catch{return fallback;}};
// Transfers recorded on this device but not yet confirmed in the shared league log.
let pending=readJson('fbl-transfers',[]);
const same=(a,b)=>a.team===b.team&&a.outId===b.outId&&a.inId===b.inId;
// Sports.ru journals for connected teams, the shared league log for the rest, then this device's unsent records.
let mergedKey=null,mergedValue=null;
function merged(){
 if(mergedKey&&mergedKey[0]===live&&mergedKey[1]===league&&mergedKey[2]===pending&&mergedKey[3]===players)return mergedValue;
 const base=allTransfers(players,live,league),all=[...base.transfers],keep=[];
 for(const x of pending){if(base.connected.has(x.team)||all.some(s=>same(s,x)))continue;try{seasonRosters([...all,x]);all.push(x);keep.push(x);}catch{}}
 if(keep.length!==pending.length){pending=keep;writeStored('fbl-transfers',JSON.stringify(pending));}
 mergedKey=[live,league,pending,players];mergedValue={...base,transfers:all};return mergedValue;
}
const transfers=()=>merged().transfers;
const sportsTeam=t=>live?.teams?.[t]||null;
// Transfers left this week: Sports.ru's own counter for connected teams, the league limit minus recorded ones otherwise.
// Both limits bind: Sports.ru's own weekly count (∞ in pre-season) and the FBL week (pre-season moves are free).
function transfersLeft(ctx,t){const x=sportsTeam(t)?.transfersLeft,sports=sportsTeam(t)?.transfersUnlimited?Infinity:Number.isFinite(x)?x:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(ctx.transfers,t,ctx.today,gameWeeks(live)));
 return Math.min(sports,fblTransfers(ctx.transfers,t,ctx.today).left);}
const draftPrice=id=>{const p=byId.get(id);return live?.players?.[p?.sportsId]?.initialPrice??p?.price??0;};
// Sports.ru's own balance wins: a number typed on this device only stands in for a team Sports.ru does not show.
function teamBank(t,list=transfers()){const sports=sportsTeam(t)?.balance;if(Number.isFinite(sports))return sports;const local=readJson('fbl-bank',{})[t];if(Number.isFinite(local))return local;const shared=league.banks?.[t];if(Number.isFinite(shared))return shared;return bank(t,list,draftPrice);}
function context(){const m=merged(),list=m.transfers;return {players,live,injuries,today:moscowToday(),rosters:seasonRosters(list),transfers:list,warnings:m.warnings,connected:m.connected,
 white:new Set(whiteList().filter(x=>!x.startsWith('none:')))};}
function owners(ctx){const m=new Map();ctx.rosters.forEach((ids,t)=>ids.forEach(id=>m.set(id,t)));return m;}
const clubOf=p=>live?.players?.[p.sportsId]?.club||p.sportsClub;
function issueUrl(title,payload){
 const body='Запись для общего журнала FBL. Нажми «Submit new issue» — бот проверит правила и добавит.\n\n```json\n'+JSON.stringify(payload)+'\n```';
 return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('FBL: '+title)}&body=${encodeURIComponent(body)}`;
}
const teamOption=t=>teamName(t)+(t===0?' — моя':'');
const liveAgeHours=()=>live?(Date.now()-Date.parse(live.collectedAt))/36e5:0;

// ---------- Data ----------
async function fetchJson(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error(String(r.status));return r.json();}
async function fetchLive(){for(const url of LIVE_URLS){try{const d=await fetchJson(url,{cache:'no-cache'});if(d?.players&&d?.clubs)return d;}catch{}}return null;}
export async function refreshSeason(){
 if(loading)return loading;
 const refresh=$('season-refresh');refresh.disabled=true;refresh.setAttribute('aria-busy','true');
 loading=Promise.all([fetchLive(),fetchJson(INJURY_URL).catch(()=>null),fetchJson(LEAGUE_URL,{cache:'no-cache'}).catch(()=>null)]).then(async([l,inj,lg])=>{
  if(l){rawLive=live=l;src.live='ok';addMarket();}else src.live=live?'stale':'error';
  if(inj){injuries=parseInjuries(inj);src.injuries='ok';src.injuriesAt=new Date().toISOString();}
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
async function refreshGames(){
 const ctx=players.length?context():null,wanted=ctx?new Set(ctx.rosters.flat().map(id=>byId.get(id)?.team).filter(Boolean)):null;
 try{games=await fetchLiveGames(wanted);src.games=games.length?'ok':'empty';gamesAt=Date.now();}catch{src.games='error';}
 scoreBoxes();
 // Every 20 s while a game runs, and at the next tip-off (live.js nextLiveDelay), while the season page is open.
 clearTimeout(liveTimer);const wait=nextLiveDelay(games);
 if(wait!==null)liveTimer=setTimeout(liveTick,wait);
}
// Hidden, on the draft tab or while typing: skip the round but keep the rhythm, so the watch never stops by itself.
async function liveTick(){
 if(tab()!=='season'||document.visibilityState==='hidden'||document.activeElement?.closest?.('#season-body input')){liveTimer=setTimeout(liveTick,LIVE_MS);return;}
 await refreshGames();renderSeason();
}
// Finished games Sports.ru has not counted yet are scored from the ESPN box scores (season.js withBoxScores).
function scoreBoxes(){if(rawLive&&players.length){live=withBoxScores(rawLive,games,players);addMarket();}}
export function setSeasonPlayers(list,cardFn){
 if(cardFn)card=cardFn;
 if(list===basePlayers||!list?.length)return;
 basePlayers=list;addMarket();scoreBoxes();
 if(tab()==='season')renderSeason();
}
// The draft tab reports how its player database is doing; without it the season tab has nothing to show.
export function setSeasonDatabaseState(state,retry=null){dbState=state;dbRetry=retry;if(tab()==='season'&&!players.length)renderSeason();}
// Database players plus Sports.ru market players the database does not know yet.
function addMarket(){if(!basePlayers.length)return;players=withMarket(basePlayers,live);byId=new Map(players.map(p=>[p.id,p]));}
function currentWeek(today){const w=weekOf(today,gameWeeks(live));return w?.n?w:null;}
// ESPN's English injury words, in Russian. A return date is shown only for players who are out, never for day-to-day.
const BODY={hamstring:'бицепс бедра',knee:'колено',ankle:'голеностоп',foot:'стопа',back:'спина',groin:'пах',shoulder:'плечо',hip:'бедро',calf:'икроножная',achilles:'ахиллово сухожилие',wrist:'запястье',hand:'кисть',finger:'палец',thumb:'большой палец',toe:'палец стопы',elbow:'локоть',illness:'болезнь',concussion:'сотрясение',personal:'личные причины',rest:'отдых',neck:'шея',quadriceps:'квадрицепс',abdomen:'пресс',oblique:'косые мышцы',shin:'голень',leg:'нога',chest:'грудь',rib:'ребро',head:'голова',eye:'глаз',face:'лицо',lower_leg:'голень',heel:'пятка',undisclosed:'не раскрыто','not injury related':'не травма'};
const bodyPart=t=>t?BODY[String(t).toLowerCase()]||t:'';
function injuryInfo(p){
 const i=injuries.get(String(p.espnId));if(!i)return null;const s=injuryStatus(i.status);
 const until=i.fantasyStatus==='OFS'?'до конца сезона':s.level==='out'&&i.returnDate?`до ~${ddmm(i.returnDate)}`:'';
 return {...s,until,text:[s.label,until].filter(Boolean).join(' '),raw:i};
}
const injuryText=p=>injuryInfo(p)?.text||'';
function injuryChip(p){const i=injuryInfo(p);return i?el('span',i.text,'chip '+(i.level==='out'?'chip--danger':'chip--warn')):null;}
// Running points from ESPN box scores for games Sports.ru has not counted yet.
function livePoints(){
 const out=new Map();
 for(const g of games){if(!g.points)continue;const day=moscowDate(g.date);
  for(const p of players){const x=g.points[String(p.espnId)];if(!x)continue;
   const official=(live?.players?.[p.sportsId]?.games||[]).some(o=>o.date===day&&o.played);
   if(!official)out.set(p.id,{...x,game:g,day});}}
 return out;
}

// ---------- The player's season so far (player cards) ----------
// His 2026/27 games from Sports.ru (a finished game Sports.ru has not counted yet is scored from the ESPN box score) and
// the game he is playing now with its stat line. Null until the season data is loaded.
export function seasonLivePanel(p){
 if(!live||!p)return null;
 const row=live.players?.[p.sportsId],played=(row?.games||[]).filter(g=>g.played),eid=String(p.espnId||'');
 const box=(eid&&games.map(g=>({g,x:g.points?.[eid]})).filter(o=>o.x))||[],now=box.find(o=>o.g.state==='in');
 if(!row&&!box.length)return null;
 const block=el('div',null,'pc-block season-live');block.append(el('h4','Сезон 2026/27 · лайв'));
 if(played.length){
  const total=played.reduce((s,g)=>s+g.points,0),minutes=played.reduce((s,g)=>s+clockMin(g.minutes),0);
  block.append(el('p',`${count(played.length,'матч','матча','матчей')} · ${int(total)} ФО · ${dec(total/played.length)} за матч · ${dec(minutes/played.length)} мин`,'season-live-sum'));
  const t=el('table',null,'sports-table'),h=el('tr');for(const x of ['Дата','Соперник','Мин','ФО'])h.append(el('th',x));t.append(h);
  for(const g of played.slice(-5).reverse()){const tr=el('tr');for(const v of [ddmm(g.date),g.opponent||'—',String(g.minutes??'—'),int(g.points)+(g.source==='ESPN'?' *':'')])tr.append(el('td',v));t.append(tr);}
  block.append(t);
  if(played.some(g=>g.source==='ESPN'))block.append(el('p','* по протоколу ESPN: Sports.ru этот матч ещё не посчитал.','muted'));
 }else if(!now)block.append(el('p','В этом сезоне ещё не играл.','muted'));
 if(now)block.append(el('p',`Сейчас в игре: ${int(now.x.points)} ФО · ${gameStatus(now.g)} · обновляется каждые ${LIVE_MS/1e3} с`,'season-live-now'),lineTable(now.x));
 const last=box.filter(o=>o.g.state==='post').at(-1);
 if(last){const d=el('details',null,'inline');d.dataset.key=`last:${p.id}:${last.g.id}`;d.append(el('summary',`Статлиния последнего матча (${last.g.away.abbr} — ${last.g.home.abbr})`),lineTable(last.x));block.append(d);}
 return block;
}
const clockMin=v=>{const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:Number(v)||0;};

// ---------- States ----------
function skeleton(rows=6){const s=el('div',null,'skeleton');s.setAttribute('aria-hidden','true');for(let i=0;i<rows;i++)s.append(el('span'));return s;}
function loadingBlock(title){const box=el('div');box.setAttribute('aria-busy','true');if(title)box.append(el('h3',title));box.append(el('p','Загружаю данные Sports.ru…','muted'),skeleton());return box;}
function errorBlock(title,line,retry=()=>refreshSeason()){const s=el('div',null,'state state--error');s.append(el('strong',title),el('p',line),button('Повторить',retry));return s;}
// Views that need Sports.ru rosters and prices: a skeleton while loading, an honest error when it never came.
function needsLive(title){
 if(live)return null;
 if(loading||!attempted)return [loadingBlock(title)];
 return [errorBlock('Нет данных Sports.ru','Составы, цены и очки появятся, когда Sports.ru ответит. Проверь интернет и повтори.')];
}
const confidenceWord={CONFIDENT:['стоит делать','chip--accent'],MODERATE:['на грани','chip--warn'],DOUBTFUL:['не стоит','chip--danger']};
// The level follows the rounded-down percent, so a badge never prints "70%" next to "на грани".
function level(why){const p=Math.floor(why.confidence*100);return p>=Math.round(CONFIDENT*100)?'CONFIDENT':p>=Math.round(DOUBTFUL*100)?'MODERATE':'DOUBTFUL';}
function confidenceBadge(why){const [word,cls]=confidenceWord[level(why)];const b=el('span',`${word} · ${Math.floor(why.confidence*100)}%`,'chip sp-confidence '+cls);b.title='Вероятность, что обмен даст плюс за выбранный период';return b;}

// ---------- Overview ----------
// The table and the Teams tab read one league race (src/standings.js): shared places for equal points, the model's
// chances of the final place. It is computed once per change of its inputs (80 outlooks and 20 000 draws take a
// noticeable moment on a phone), not on every re-render of the same screen.
let raceKey=null,raceValue=null;
function race(ctx,running){
 const key=[ctx.players,ctx.live,ctx.injuries,ctx.transfers,ctx.today,[...running].map(([id,x])=>`${id}:${x.points}:${x.day}`).join()];
 if(!raceKey||key.some((v,i)=>v!==raceKey[i])){raceKey=key;raceValue=leagueRace(ctx,running);}
 return raceValue;
}
const CHANCE_NOTE=`Шансы — оценка модели по ${int(CHANCE_RUNS)} розыгрышам остатка сезона (разброс прогноза каждого игрока, составы как сейчас, будущие трансферы не учтены), не гарантия.`;
function standingsTable(ctx,running){
 const h=horizons(ctx),{started,rows:all}=race(ctx,running);
 const rows=[...all].sort((a,b)=>b.points-a.points||b.total-a.total),anyLive=rows.some(r=>r.now);
 const table=el('table',null,'standings-table'),head=el('tr'),week=currentWeek(ctx.today);
 const cols=[['#',''],['Команда',''],...(started?[['Очки','num']]:[]),...(anyLive?[['В игре','num']]:[]),[`Игр до ${ddmm(week?.end||h.week.to)}`,'num wide-only'],[started?'Прогноз':'Прогноз сезона','num'],['1-е','num'],['Топ-3','num wide-only']];
 const tips={'1-е':'Шанс занять 1-е место — оценка модели','Топ-3':'Шанс попасть в первую тройку — оценка модели'};
 for(const [x,c] of cols){const th=el('th',x,c);th.scope='col';if(tips[x])th.title=tips[x];head.append(th);}table.append(head);
 rows.forEach(r=>{const tr=el('tr',null,'clickable'+(r.t===0?' mine':''));
  const name=el('td',null,'team');name.append(teamName(r.t));if(r.t===0)name.append(' ',el('span','ты','chip chip--accent'));
  // Equal points share a place, as on the Teams tab.
  tr.append(el('td',placeLabel(r)),name);
  if(started)tr.append(el('td',int(r.official),'num'));
  if(anyLive)tr.append(el('td',r.now?signed(r.now):'—','num'));
  tr.append(el('td',dec(r.week),'num wide-only'),el('td',int(r.total),'num total'),el('td',chanceText(r.first),'num'),el('td',chanceText(r.top3),'num wide-only'));
  tr.tabIndex=0;tr.setAttribute('aria-label',`${teamName(r.t)}: открыть состав`);
  const open=()=>{team=r.t;writeStored('fbl-season-team',String(team));setView('teams');};
  tr.onclick=open;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};table.append(tr);});
 const box=el('div',null,'sp-block');const head2=el('div',null,'sp-block-head');head2.append(el('h3',started?'Таблица лиги':'Прогноз сезона'));box.append(head2);
 const wrap=el('div',null,'table-scroll');wrap.append(table);box.append(wrap,el('p',(started?'Очки — по формуле лиги; матчи последних двух дней — сразу по протоколам ESPN (категории Yahoo), пока Sports.ru их не посчитал. ':'')+'Нажми на команду, чтобы открыть состав. '+CHANCE_NOTE,'sp-note'));
 return box;
}
// "Сезон стартует 21.10" from the Sports.ru calendar, never a hard-coded date.
function seasonStart(){const days=Object.values(live?.clubs||{}).flat().map(g=>g.date).filter(Boolean).sort();return days[0]||null;}
function topPlayers(ctx){
 const own=owners(ctx),rows=[];
 for(const p of players){const g=(live?.players?.[p.sportsId]?.games||[]).filter(x=>x.played);if(g.length)rows.push({p,total:g.reduce((s,x)=>s+x.points,0),games:g.length});}
 const box=el('div',null,'sp-block sp-top');
 const list=(items,line,value)=>{const ol=el('ol');for(const r of items){const li=el('li'),who=el('div');who.append(el('strong',r.p.name),el('small',line(r)));li.append(who,el('span',value(r),'val'));ol.append(li);}return ol;};
 const free=(p)=>!own.has(p.id);
 if(rows.length){
  const fa=rows.filter(r=>free(r.p)&&r.games>=2).sort((a,b)=>b.total/b.games-a.total/a.games).slice(0,5);
  if(fa.length)box.append(el('h3','Лучшие свободные'),list(fa,r=>`${current(r.p,ctx).positions.join('/')} · ${int(current(r.p,ctx).price)} · ${count(r.games,'матч','матча','матчей')}`,r=>dec(r.total/r.games)+' за матч'));
  box.append(el('h3','Лучшие в сезоне'),list(rows.sort((a,b)=>b.total-a.total).slice(0,5),r=>`${own.has(r.p.id)?teamName(own.get(r.p.id)):'свободен'} · ${dec(r.total/r.games)} за матч`,r=>int(r.total)+' ФО'));
 }else{
  const start=seasonStart(),fa=[...players].filter(p=>p.sportsId&&free(p)&&live?.players?.[p.sportsId]).map(p=>({p,v:perGame(p).value})).sort((a,b)=>b.v-a.v).slice(0,5);
  box.append(el('h3','Лучшие свободные по прогнозу'));
  if(start)box.append(el('p',start<=ctx.today?'Сезон начался: очки появятся после первых матчей.':`Сезон стартует ${ddmm(start)}: пока сравниваем прогнозы.`,'muted'));
  if(fa.length)box.append(list(fa,r=>`${current(r.p,ctx).positions.join('/')} · ${r.p.team||'—'} · ${int(current(r.p,ctx).price)}`,r=>dec(r.v)+' за матч'));
 }
 return box;
}
// ESPN's game status in Russian, in Moscow time.
function gameStatus(g){
 if(g.state==='pre')return `${timeMsk(g.date)} МСК`;
 if(g.state==='post')return /OT/.test(g.detail)?'Финал, ОТ':'Финал';
 const d=String(g.detail||'');let m;
 if(/half/i.test(d))return 'Перерыв';
 if((m=d.match(/^End of (\d)/i)))return `Конец ${m[1]}-й четв.`;
 if((m=d.match(/^Q(\d)\s+(.+)/i)))return `${m[1]}-я четв. · ${m[2]}`;
 // ESPN's scoreboard writes the running clock as "8:22 - 3rd" or "2:00 - OT".
 if((m=d.match(/^(\d+:\d+(?:\.\d+)?)\s*-\s*(\d)(?:st|nd|rd|th)$/i)))return `${m[2]}-я четв. · ${m[1]}`;
 if((m=d.match(/^(\d+:\d+(?:\.\d+)?)\s*-\s*(\d*)OT$/i)))return `Овертайм${m[2]?' '+m[2]:''} · ${m[1]}`;
 if(/OT/.test(d))return 'Овертайм '+d.replace(/.*OT\s*/,'');
 return d;
}
// One game with the players of one FBL team in it: the team chosen in the season tab (my own on the overview).
const inGame=(p,g)=>p.team===g.home.abbr||p.team===g.away.abbr;
function teamInGame(g,focus,own){return players.filter(p=>own.get(p.id)===focus&&inGame(p,g));}
// The FBL formula term by term on one ESPN box-score line: what each stat adds (the live stat line).
function lineTable(x){
 const s=statLine(x?.line);if(!s)return el('p','В протоколе ESPN пока нет статистики.','sp-note');
 const t=el('table',null,'stat-line');
 for(const r of s.rows){const tr=el('tr');tr.append(el('th',r.label),el('td',String(r.value)+(r.note?` · ${r.note}`:''),'v'),el('td',r.points?signed(r.points):'0','num'+(r.points<0?' neg':'')));t.append(tr);}
 const total=el('tr',null,'total');total.append(el('th','ФО'),el('td',x.final?'финал':'матч идёт','v'),el('td',int(s.total),'num'));t.append(total);
 return t;
}
// A player's line in a game card: tap to open his stat line, which stays open while the scores refresh.
function lineRow(key,who,x,status,cls){
 if(!x){const li=el('li',null,cls);li.append(who,el('span',status,'pts'));return li;}
 const li=el('li',null,cls),d=el('details',null,'line-details'),sum=el('summary');d.dataset.key=key;
 sum.append(who,el('span',`${int(x.points)} ФО · ${x.minutes} мин`+(x.final?'':' *'),'pts'));d.append(sum,lineTable(x));li.append(d);return li;
}
function gameCard(g,focus,own,full=false){
 const item=el('div',null,'sp-game'+(g.state==='in'?' is-live':'')),head=el('div',null,'sp-game-head');
 head.append(el('strong',`${g.away.abbr} — ${g.home.abbr}`));
 if(g.state!=='pre')head.append(el('span',`${g.away.score} : ${g.home.score}`,'score'));
 head.append(g.state==='in'?el('span',gameStatus(g),'chip chip--live'):el('small',gameStatus(g)));item.append(head);
 const ours=teamInGame(g,focus,own),pts=p=>g.points?.[String(p.espnId)];
 if(g.state!=='pre'&&!g.points&&ours.length)item.append(el('p','Протокол ESPN пока недоступен.','sp-note'));
 if(ours.length){
  ours.sort((a,b)=>(pts(b)?.points||0)-(pts(a)?.points||0));
  const ul=el('ul');
  for(const p of ours){const x=pts(p),inj=injuryText(p);
   ul.append(lineRow(`line:${g.id}:${p.espnId}`,el('span',p.name+(g.state==='pre'&&inj?` (${inj.toLowerCase()})`:''),'who'),x,g.state==='pre'?'':g.points?(g.state==='post'?'не играл':'ещё не выходил'):'','mine-player'));}
  item.append(ul);
 }
 // Every player of the game, best first: tap anyone to follow his stat line.
 const everyone=Object.entries(g.points||{}).sort((a,b)=>b[1].points-a[1].points);
 if(full&&everyone.length){
  const all=el('details',null,'inline sp-all');all.dataset.key='all:'+g.id;all.append(el('summary',`Все игроки матча (${everyone.length})`));
  const ul=el('ul');for(const [id,x] of everyone)ul.append(lineRow(`all:${g.id}:${id}`,el('span',`${x.name||'—'} · ${x.team}`,'who'),x,'',''));
  all.append(ul);item.append(all);
 }
 return item;
}
function gamesToday(ctx,compact,focus){
 const own=owners(ctx),box=el('div',null,'sp-block sp-live'),head=el('div',null,'sp-block-head');head.append(el('h3','Матчи сегодня'));box.append(head);
 const order={in:0,pre:1,post:2},whose=focus===0?'твоих игроков':`игроков ${teamName(focus)}`;
 const shown=games.filter(g=>g.state!=='post'||moscowDate(g.date)>=addDaysIso(ctx.today,-1)).sort((a,b)=>order[a.state]-order[b.state]||a.date.localeCompare(b.date));
 if(src.games==='error'){box.append(el('p',compact?'Счёт ESPN сейчас недоступен. Расписание — во вкладке «Матчи».':'Счёт ESPN сейчас недоступен. Расписание по календарю Sports.ru — ниже.','muted'));return box;}
 if(!shown.length){box.append(el('p','Сегодня матчей нет.','muted'));return box;}
 const withTeam=shown.filter(g=>teamInGame(g,focus,own).length),list=compact?shown.filter(g=>g.state==='in'||withTeam.includes(g)):onlyMine?withTeam:shown;
 for(const g of list.slice(0,compact?4:99))box.append(gameCard(g,focus,own,!compact));
 if(compact&&shown.length>Math.min(list.length,4)){const more=button(`Все матчи (${shown.length})`,()=>setView('games'),'btn-ghost btn-sm');head.append(more);}
 if(!list.length)box.append(el('p',`Сегодня ${count(shown.length,'матч','матча','матчей')}, ${whose} в них нет.`,'muted'));
 if(list.some(g=>g.state==='in'))box.append(el('p','* матч идёт: очки предварительные, по протоколу ESPN. Нажми на игрока — откроется его статлиния по формуле.','sp-note'));
 return box;
}
function alertsBlock(ctx){
 const box=el('div',null,'sp-alerts'),money=teamBank(0,ctx.transfers);
 const alerts=marketAlerts(ctx,{team:0,bankMoney:money,sort:'month',minGain:20});
 const hurt=ctx.rosters[0].map(id=>byId.get(id)).filter(p=>p&&injuries.get(String(p.espnId)));
 if(!alerts.length&&!hurt.length)return box;
 const head=el('div',null,'sp-block-head');head.append(el('h3','Для тебя'));box.append(head);
 for(const a of alerts.slice(0,3)){const out=byId.get(a.outId),p=el('p',null,'sp-alert');const body=el('span');
  body.append(el('strong',`Продай ${out.name} → купи ${a.player.name}`),document.createTextNode(` · ${signed(a.gain.month)} ФО за 4 недели, ${signed(a.gain.season)} за сезон · `),confidenceBadge(a.why));
  p.append(el('span','📈','sp-alert-icon'),body);box.append(p);}
 for(const p of hurt){const row=el('p',null,'sp-alert'),body=el('span');body.append(el('strong',p.name),document.createTextNode(' — '+injuryText(p)+' '));
  body.append(button('Найти замену',()=>{team=0;writeStored('fbl-season-team','0');replacing=p.id;openRows.add(p.id);setView('teams');},'btn-ghost btn-sm'));
  row.append(el('span','🩹','sp-alert-icon'),body);box.append(row);}
 if(alerts.length)box.append(button('Открыть помощника по трансферам',()=>{team=0;writeStored('fbl-season-team','0');setView('transfers');},'btn-primary'));
 return box;
}
function overview(ctx){
 const wait=needsLive('Таблица лиги');
 const grid=el('div',null,'sp-overview'),left=el('div'),right=el('div');
 if(wait){left.append(...wait);}else{const running=livePoints();left.append(alertsBlock(ctx),standingsTable(ctx,running));}
 right.append(gamesToday(ctx,true,0));if(live)right.append(topPlayers(ctx));
 grid.append(left,right);return [grid];
}

// ---------- Teams ----------
// Fact and forecast windows (the current tour, 4 weeks = the transfer gains' 28 days, the season) and the facts in them,
// by the league table's own rule: src/standings.js.
const windows=periodWindows,teamFact=(ctx,t,w)=>windowFact(ctx,t,w);
const playerFact=(p,t,ctx,w)=>p.sportsId?windowFact(ctx,t,w,p.sportsId):0;
// Still to come in a window: points of a game Sports.ru has not counted yet plus the expectation of the games ahead.
function ahead(p,ctx,w,running){const e=expectedPoints(p,{...ctx,running},ctx.today,w.to);return {points:(running?.get(p.id)?.points||0)+e.points,games:e.games};}
function factForecast(fact,forecast){const v=el('strong',null,'fact');v.append(int(fact),el('span',' / '+int(forecast),'fc'));v.title='Факт / прогноз';return v;}
// The league race of one team, from the same numbers as the overview table: shared place, gap to the 1st or the 2nd, chances.
const leaguePlace=(ctx,t,running)=>teamPlace(race(ctx,running),t);
function playerRow(p,ctx,running){
 const live1=live?.players?.[p.sportsId],c=current(p,ctx),g=perGame(p,live1),inj=injuryInfo(p),now=running?.get(p.id);
 const box=el('details',null,'season-player');box.open=openRows.has(p.id)||replacing===p.id;
 const sum=el('summary'),row=el('div',null,'sp-row');
 const name=el('span',null,'sp-name'),meta=el('small',`${c.positions.join('/')} · ${p.team||'—'}${p.isRookie?' · rookie':''}`);name.append(el('strong',p.name),meta);
 const price=el('span',null,'sp-price'),delta=Number.isFinite(live1?.price)&&Number.isFinite(live1?.initialPrice)?live1.price-live1.initialPrice:0;
 price.append(el('strong',int(c.price)));if(delta){const d=el('small',(delta>0?'▲ ':'▼ ')+int(Math.abs(delta)),delta>0?'up':'down');d.title='Изменение цены с начала сезона';price.append(d);}
 const form=el('span',null,'sp-form'),last=(live1?.games||[]).filter(x=>x.played).slice(-3).map(x=>int(x.points));
 form.append(el('strong',dec(g.average??g.prior)),el('small',now?`в игре ${int(now.points)}`:g.average!=null&&last.length?last.join(' · '):'прогноз'));
 const w=windows(ctx)[horizon],fact=playerFact(p,team,ctx,w),rest=ahead(p,ctx,w,running),next=el('span',null,'sp-next'),left=el('small',`ещё ${dec(rest.games)} м.`);
 left.title='Ожидаемых матчей до конца периода';next.append(factForecast(fact,fact+rest.points),left);
 row.append(name,price,form,next);
 if(inj){const line=el('span',null,'sp-injury'+(inj.level==='out'?' out':''));line.append(`🩹 ${inj.text}`);row.append(line);}
 sum.append(row);box.append(sum);
 const actions=el('div',null,'sp-actions');
 actions.append(button(replacing===p.id?'Скрыть замены':'Найти замену',e=>{e.preventDefault();replacing=replacing===p.id?null:p.id;query='';openRows.add(p.id);renderSeason();}),link('Sports.ru ↗',SPORTS_URL(p.sportsId)));
 box.append(actions);
 if(replacing===p.id)box.append(replacementPanel(p,ctx));
 const dossier=el('details',null,'inline');dossier.dataset.key='dossier:'+p.id;dossier.append(el('summary','Досье игрока'));dossier.addEventListener('toggle',()=>{if(dossier.open&&!dossier.querySelector('.player-card'))dossier.append(card(p,null,true));});box.append(dossier);
 box.addEventListener('toggle',()=>{if(box.open)openRows.add(p.id);else openRows.delete(p.id);});
 return box;
}
function gainCells(gain){
 const gains=el('span',null,'sp-gains');
 for(const k of [horizon,...['week','month','season'].filter(k=>k!==horizon)]){const s=el('span',null,k===horizon?'on':'');s.append(el('strong',signed(gain[k])),el('small',k===horizon?'ФО '+PERIOD_LONG[k]:PERIOD[k].toLowerCase()));if(gain[k]<0)s.classList.add('neg');gains.append(s);}
 return gains;
}
// Connected teams make their moves on Sports.ru; the app follows them there instead of recording them itself. Outside the
// FBL transfer hours a move made now is a certain breach: the button says when it opens instead.
function takeAction(moves,ctx,label){
 const st=sportsTeam(team),hours=transferWindow();
 if(st&&!hours.open){const b=button(`Трансферы с ${hours.from} МСК`,()=>{},'btn-secondary btn-sm sp-take');b.disabled=true;b.title=`Сейчас ${hours.now} МСК: трансферы FBL только с ${hours.from} до ${hours.to}, сделка сейчас будет нарушением`;return b;}
 if(st)return link('Сделать на Sports.ru ↗',TEAM_URL(st.sportsTeamId),'btn-secondary btn-sm sp-take');
 const b=button(label,()=>record(moves,ctx));b.setAttribute('aria-label',`${label}: ${moves.map(m=>`${byId.get(m.outId)?.name} → ${m.player.name}`).join(', ')}`);return b;
}
function optionRow(o,outId,ctx,title,withAction=!sportsTeam(team)){
 const li=el('li',null,'sp-option'),inj=injuryText(o.player),why=explainSwap(ctx,outId,o.player.id,horizon);
 const name=el('span',null,'sp-name');name.append(el('strong',title||o.player.name),el('small',`${o.player.positions.join('/')} · ${o.player.team||'—'} · ${int(o.player.price)} · банк после ${int(o.bankAfter)}${inj?' · '+inj:''}`),confidenceBadge(why));
 li.append(name,gainCells(o.gain));if(withAction)li.append(takeAction([{outId,player:o.player}],ctx,'Записать'));li.append(whyBox(why,ctx));return li;
}

// ---------- Why a move, and the players behind it ----------
const EARLY='Сезон только начался';
function whyBox(why,ctx){
 const box=el('details',null,'sp-why');box.append(el('summary','Почему и об игроках'));
 box.addEventListener('toggle',()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';
  const p=why.parts,part=(v,t)=>`${signed(v)} ${t}`;
  box.append(el('p',`Разница ${PERIOD_LONG[horizon]}: ${signed(why.gain)} ФО = ${part(p.perGame,'за счёт ФО за матч')}, ${part(p.availability,'за счёт доли сыгранных матчей')}, ${part(p.schedule,'за счёт календаря клубов')}.`));
  box.append(el('p',`Уверенность ${Math.floor(why.confidence*100)}%: столько шансов, что обмен действительно даст плюс ${PERIOD_LONG[horizon]}. Делать стоит от ${Math.round(CONFIDENT*100)}%, ниже ${Math.round(DOUBTFUL*100)}% трансфер лучше сберечь.`,'muted'));
  const flags=why.flags.filter(f=>!f.startsWith(EARLY)).map(f=>f.replace(/: (Out|Day-To-Day|Questionable|Doubtful|Suspension)\b/,(_,s)=>': '+injuryStatus(s).label.toLowerCase()));
  if(flags.length){const ul=el('ul',null,'sp-flags');for(const f of flags)ul.append(el('li','⚠ '+f));box.append(ul);}
  for(const side of why.sides){const pair=el('div',null,'sp-pair');pair.append(sideBlock('Отдаёшь',side.out),sideBlock('Получаешь',side.in));box.append(pair);}
 });
 return box;
}
// The forecast's own numbers: career model, ESPN, the draft-pick model, and the result.
function sourcesLine(f){
 const m=f.sources?.model,e=f.sources?.espn;if(!m)return f.basis||'';
 const own=f.draftPick?`модель новичков (пик №${f.draftPick})`:f.origin==='UNDRAFTED_ROOKIE_MODEL'?'модель незадрафтованных':'модель по карьере';
 const note=combineNote(f);
 return `Прогноз до сезона: ${own} ${dec(m.perGame)} × ${Math.round(m.games)}${e?`, ESPN ${dec(e.perGame)} × ${Math.round(e.games)} → итог ${dec(f.meanPerGame)} × ${Math.round(f.games)}`:''} матчей${note?` (${note})`:''}.`;
}
function sideBlock(label,x){
 const p=x.player,f=p.forecast||{},box=el('div',null,'sp-side'),hist=Object.entries(p.sportsHistory||{}).slice(-2);
 box.append(el('small',label),el('strong',`${p.name} · ${int(x.price)}${x.priceChange?` (${signed(x.priceChange)})`:''}`));
 const lines=[`${dec(x.perGame)} ФО за матч сейчас (прогноз до сезона ${dec(x.prior)}${x.played?`, в сезоне ${dec(x.average)} за ${count(x.played,'матч','матча','матчей')}`:''})`,
  `в периоде ${dec(x.expectedGames)} из ${x.clubGames} матчей клуба${x.clubGames?` (шанс сыграть ${Math.round(x.expectedGames/x.clubGames*100)}%)`:''}`,
  p.depth?`состав ESPN: ${p.depth.rank===1?'стартер':'№'+p.depth.rank} на ${p.depth.position}`:'',
  x.injury?`🩹 ${injuryStatus(x.injury.status).label}${injuryStatus(x.injury.status).level==='out'&&x.injury.returnDate?' до ~'+ddmm(x.injury.returnDate):''}`:'травм в отчёте ESPN нет',
  sportsSeasonsLine(hist)];
 for(const l of lines.filter(Boolean))box.append(el('p',l));
 const more=el('details');more.append(el('summary','Подробнее о прогнозе'));
 more.addEventListener('toggle',()=>{if(!more.open||more.dataset.filled)return;more.dataset.filled='1';
  const src2=sourcesLine(f);if(src2)more.append(el('p',src2));
  if(f.availability)more.append(el('p',absenceShort(f.availability,f.games)));
  more.append(newsBlock(p));
  const full=el('details');full.append(el('summary','Полная карточка игрока'));full.addEventListener('toggle',()=>{if(full.open&&!full.querySelector('.player-card'))full.append(card(p,null,true));});more.append(full);
 });
 box.append(more);
 return box;
}
// Latest ESPN fantasy news of a player (CORS-open feed), loaded when the block is opened and cached for the session.
const NEWS_URL=id=>`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=50&playerId=${id}`,newsCache=new Map();
// The watcher's archive of ESPN injury reports (data/season-live), loaded once.
let archiveLoad=null;const injuryArchive=()=>archiveLoad??=fetchJson(`https://raw.githubusercontent.com/${REPO}/data/season-live/injury-history.json`);
function newsBlock(p){
 const box=el('details',null,'sp-news');box.append(el('summary','Новости ESPN'));
 if(!p.espnId){box.append(el('p','Нет ESPN id — новостей нет.','muted'));return box;}
 const fill=async()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';const wait=el('p','Загружаю…','muted');box.append(wait);
  try{if(!newsCache.has(p.espnId))newsCache.set(p.espnId,fetchJson(NEWS_URL(p.espnId)));const feed=(await newsCache.get(p.espnId)).feed||[];wait.remove();
   if(!feed.length)box.append(el('p','Свежих новостей нет.','muted'));
   const hurt=newsInjuries(feed);
   if(hurt.length)box.append(el('p',`Травмы в новостях за последние месяцы: ${hurt.map(x=>`${bodyPart(x.part)} (${ddmm(x.first)}${x.last!==x.first?'–'+ddmm(x.last):''})`).join('; ')}.`,'muted'));
   const archive=await injuryArchive().catch(()=>null),episodes=archive?.players?.[String(p.espnId)]?.episodes||[];
   if(episodes.length)box.append(el('p',`Архив отчётов ESPN: ${episodes.map(e=>`${bodyPart(e.type)||'травма'}${e.detail?' · '+e.detail:''} ${ddmm(e.firstSeen)}${e.lastSeen!==e.firstSeen?'–'+ddmm(e.lastSeen):''}`).join('; ')}.`,'muted'));
   for(const n of feed.slice(0,3)){const item=el('div',null,'sp-news-item');item.append(el('small',new Date(n.published||n.lastModified).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})),el('strong',n.headline||''));if(n.story||n.description)item.append(el('p',String(n.story||n.description).replace(/<[^>]+>/g,'').slice(0,420)));box.append(item);}
  }catch{newsCache.delete(p.espnId);delete box.dataset.filled;wait.replaceChildren('Новости ESPN не загрузились. ',button('Повторить',()=>{wait.remove();fill();},'btn-ghost btn-sm'),' ',link('Открыть на ESPN ↗',`https://www.espn.com/nba/player/_/id/${p.espnId}`));}};
 box.addEventListener('toggle',fill);
 return box;
}
function replacementPanel(p,ctx){
 const box=el('div',null,'sp-replace'),money=teamBank(team,ctx.transfers),price=current(p,ctx).price,st=sportsTeam(team);
 box.append(el('h4',`Замена для ${p.name}`),el('p',`Бюджет до ${int(money+price)} (банк ${int(money)} + продажа ${int(price)}) · трансферов: ${transfersLeft(ctx,team)===Infinity?'без лимита':transfersLeft(ctx,team)+' из '+WEEKLY_TRANSFERS}. Цифры — сколько ФО ты получишь (+) или потеряешь (−) по сравнению с ${p.name}.`));
 if(st)box.append(el('p','Команда подключена к Sports.ru: трансфер делается там, здесь он появится сам примерно через минуту.','muted'));
 const search=el('input');search.type='search';search.enterKeyHint='search';search.placeholder='Найти свободного игрока';search.value=query;search.setAttribute('aria-label','Поиск замены для '+p.name);
 const list=el('ol',null,'sp-options'),verdictLine=el('p');
 const fill=()=>{const all=transferOptions(ctx,{team,outId:p.id,bankMoney:money,limit:query?1000:12,sort:horizon});
  const q=query.trim().toLowerCase(),shown=q?all.filter(o=>[o.player.name,o.player.sportsName,o.player.team].join(' ').toLowerCase().includes(q)).slice(0,12):all;
  list.replaceChildren(...shown.map(o=>optionRow(o,p.id,ctx)));
  const best=all[0]?.gain?.[horizon];verdictLine.className=best>0?'muted':'warning';
  verdictLine.textContent=!all.length?'Нет допустимых замен: не подходит позиция, банк или правила состава (rookie, клуб NBA).':best>0?'':`Замен лучше, чем ${p.name}, ${PERIOD_LONG[horizon]} нет — держи его.`;
  verdictLine.hidden=!verdictLine.textContent||Boolean(q);
  if(q&&!shown.length)list.append(el('li',`Никого не нашлось по «${query}» среди доступных ${p.positions.join('/')} до ${int(money+price)}.`,'muted'));};
 search.oninput=()=>{query=search.value;fill();};
 if(st)box.append(link(`Открыть команду на Sports.ru ↗`,TEAM_URL(st.sportsTeamId),'btn-secondary btn-sm'));
 box.append(search,verdictLine,list);fill();return box;
}
function teamSelect(){
 const pickTeam=el('select');for(let t=0;t<8;t++){const o=el('option',teamOption(t));o.value=String(t);o.title=teamLabel(t);pickTeam.append(o);}pickTeam.value=String(team);
 pickTeam.onchange=()=>{team=Number(pickTeam.value);writeStored('fbl-season-team',String(team));replacing=null;renderSeason();};
 const l=el('label');l.append(el('span','Команда'),pickTeam);return l;
}
function controls(ctx){
 const head=el('div',null,'sp-controls');
 const period=el('div',null,'segmented sp-period');period.setAttribute('role','group');period.setAttribute('aria-label','Период');
 for(const k of ['week','month','season']){const b=button(PERIOD[k],()=>{horizon=k;writeStored('fbl-season-horizon',horizon);renderSeason();},'');b.setAttribute('aria-pressed',String(horizon===k));b.title=horizons(ctx)[k].label;period.append(b);}
 const wrap=el('div',null,'sp-period-field');wrap.append(el('span','Период'),period);
 head.append(teamSelect(),wrap);
 return head;
}
function teamKpis(ctx,roster,running){
 const st=sportsTeam(team),spent=roster.reduce((s,p)=>s+(current(p,ctx).price||0),0),left=transfersLeft(ctx,team),fbl=fblTransfers(ctx.transfers,team,ctx.today);
 const w=windows(ctx)[horizon],fact=teamFact(ctx,team,w),forecast=fact+roster.reduce((s,p)=>s+ahead(p,ctx,w,running).points,0),race=leaguePlace(ctx,team,running);
 // The league race and the period's points come first, money and transfers below them.
 const main=el('div',null,'kpis kpis--main'),kpis=el('div',null,'kpis');let into=main;
 const kpi=(label,value,title)=>{const k=el('div',null,'kpi');k.append(el('small',label),el('strong',value));if(title)k.title=title;into.append(k);return k;};
 into=kpis;kpi('Стоимость',int(spent));
 const bankKpi=kpi('Банк',int(teamBank(team,ctx.transfers)),st?'Баланс Sports.ru, обновляется сам':'');
 if(!Number.isFinite(st?.balance)){
  // A team Sports.ru does not show: its bank can be typed here, on this device.
  const input=el('input');input.type='number';input.min='0';input.step='100';input.inputMode='numeric';input.value=String(teamBank(team,ctx.transfers));input.setAttribute('aria-label','Банк команды');
  input.onchange=()=>{const o=readJson('fbl-bank',{}),v=Number(input.value);if(input.value===''||!Number.isFinite(v)||v<0)delete o[team];else o[team]=v;writeStored('fbl-bank',JSON.stringify(o));renderSeason();};
  bankKpi.querySelector('strong').replaceWith(input);
 }
 kpi('Трансферы',left===Infinity?'∞':`${left} из ${WEEKLY_TRANSFERS}`,`Неделя лиги до ${ddmm(fbl.week.end)}`).append(el('small',`до ${ddmm(fbl.week.end)}`));
 into=main;const place=kpi('Место в лиге',race.started?`${placeLabel(race)} из 8`:'—','Место среди 8 команд FBL по очкам формулы FBL (Yahoo: +1 за сыгранный матч, без бонуса за результат) вместе с идущими матчами; равные очки делят место. Официальная таблица лиги — на Yahoo');
 place.append(el('small',!race.started?'очков пока нет':race.rank===1?`${int(race.total)} ФО · ${race.total>race.second?'+'+int(race.total-race.second)+' к 2-му':'вровень со 2-м'}`:`${int(race.total)} ФО · −${int(race.leader-race.total)} до 1-го`,race.started&&race.rank===1?'lead':''));
 const fo=kpi('ФО · '+PERIOD[horizon].toLowerCase(),'','Факт — очки по формуле FBL за период; прогноз — факт плюс ожидаемые очки до конца периода');
 fo.querySelector('strong').replaceWith(factForecast(fact,forecast));fo.append(el('small',`факт / прогноз · ${ddmm(w.from)}–${ddmm(w.to)}`));
 kpi('Шанс на 1-е',chanceText(race.first),CHANCE_NOTE).append(el('small',`топ-3 · ${chanceText(race.top3)}`));
 const box=el('div');box.append(main,kpis);return box;
}
function teams(ctx){
 const wait=needsLive('Состав');if(wait)return [controls(ctx),...wait];
 const roster=ctx.rosters[team].map(id=>byId.get(id)).filter(Boolean),running=livePoints(),st=sportsTeam(team);
 const out=[controls(ctx),teamKpis(ctx,roster,running)];
 if(st){const info=el('div',null,'sp-team-info');info.append(link('Команда на Sports.ru ↗',TEAM_URL(st.sportsTeamId)));out.push(info);}
 const list=el('div',null,'sp-roster'),header=el('div',null,'sp-header');
 for(const t of ['Игрок','Цена','За матч','Факт / прогноз'])header.append(el('span',t));
 list.append(header,...roster.map(p=>playerRow(p,ctx,running)));out.push(list);
 return out;
}

// ---------- Transfers assistant ----------
// The answer to "what should I do now", the same as Telegram's (recommendPackage): the best package the model is confident
// of (70%+), that does not cost the season and fits the week. Without one, the borderline package (60-69%) comes first
// among the options, so the hold card names it with its confidence instead of "сделай". The players the shown package
// buys carry the other FBL teams the same model advises to buy them.
function recommendation(ctx,money,left){
 const {best,borderline,options}=recommendPackage(ctx,{team,bankMoney:money,left,sort:horizon}),shown=best||borderline;
 if(shown)shown.contested=new Map(shown.pairs.map(x=>[x.in.id,contestedBy(ctx,{team,playerId:x.in.id,bankOf:t=>teamBank(t,ctx.transfers),sort:horizon})]));
 return {best,options:borderline?[borderline,...options.filter(o=>o!==borderline)]:options};
}
function packageMoves(p){const ul=el('ul',null,'moves');for(const x of p.pairs){const li=el('li'),rivals=p.contested?.get(x.in.id)||[];li.append(el('span',x.out.name,'out'),el('span','→','arrow'),el('span',x.in.name,'in'),el('small',`${x.in.positions.join('/')} · ${int(x.in.price)}${injuryText(x.in)?' · '+injuryText(x.in):''}`));
 if(rivals.length){const c=el('span',`нужен ещё ${count(rivals.length,'команде','командам','командам')}`,'chip chip--warn');c.title=`По той же модели ${x.in.name} усиливает и ${rivals.map(teamName).join(', ')}. В FBL игрок может быть только в одной команде: кто купит позже, нарушит правило — перед покупкой проверь ленту лиги.`;li.append(c);}
 ul.append(li);}return ul;}
function packageCard(p,ctx,left){
 const item=el('div',null,'sp-package'+(p.pairs.length>left?' over-limit':'')+(p.lvl==='DOUBTFUL'?' doubtful':''));
 const head=el('div',null,'sp-package-head'),title=el('div');title.append(el('strong',count(p.pairs.length,'трансфер','трансфера','трансферов')),confidenceBadge(p.why));
 if(p.pairs.length>left)title.append(el('span',`осталось ${left}`,'chip chip--warn'));
 head.append(title,gainCells(p.gains));item.append(head,packageMoves(p),el('small',`Банк после: ${int(p.bankAfter)}`),whyBox(p.why,ctx));
 if(p.pairs.length<=left)item.append(takeAction(p.pairs.map(x=>({outId:x.out.id,player:x.in})),ctx,'Записать пакет'));
 return item;
}
function transfersView(ctx){
 const wait=needsLive('Помощник по трансферам');if(wait)return [controls(ctx),...wait];
 const money=teamBank(team,ctx.transfers),left=transfersLeft(ctx,team),fbl=fblTransfers(ctx.transfers,team,ctx.today),st=sportsTeam(team),out=[controls(ctx)];
 const {best,options}=recommendation(ctx,money,left);
 const pickCard=el('div',null,'sp-pick'+(best?'':' hold'));
 if(left===0){pickCard.append(el('p','Нет трансферов','eyebrow'),el('h3','Трансферы на эту неделю закончились'),el('p',`Следующие — с ${ddmm(fbl.resetOn)}. Варианты ниже — на будущее.`,'muted'));}
 else if(best){
  pickCard.append(el('p','Рекомендация','eyebrow'),el('h3',best.pairs.length===1?'Сделай этот трансфер':`Сделай ${count(best.pairs.length,'трансфер','трансфера','трансферов')}`),packageMoves(best));
  const kpis=el('div',null,'kpis'),kpi=(l,v)=>{const k=el('div',null,'kpi');k.append(el('small',l),el('strong',v));kpis.append(k);};
  kpi('ФО '+PERIOD_LONG[horizon],signed(best.gains[horizon]));if(horizon!=='season')kpi('За сезон',signed(best.gains.season));kpi('Уверенность',Math.floor(best.why.confidence*100)+' %');kpi('Банк после',int(best.bankAfter));
  const actions=el('div',null,'actions'),act=takeAction(best.pairs.map(x=>({outId:x.out.id,player:x.in})),ctx,'Записать');act.classList.replace('btn-secondary','btn-primary');actions.append(act);
  pickCard.append(kpis,actions,whyBox(best.why,ctx));
 }else{
  const top=options[0];pickCard.append(el('p','Рекомендация','eyebrow'),el('h3','Сейчас лучше не тратить трансферы'),
   el('p',top?`Лучший вариант (${count(top.pairs.length,'трансфер','трансфера','трансферов')}) даёт ${signed(top.gains[horizon])} ФО ${PERIOD_LONG[horizon]}, но ${top.gains.season<0?'теряет '+int(-top.gains.season)+' ФО за сезон':top.pairs.length>left?'требует больше трансферов, чем осталось':'уверенность только '+Math.floor(top.why.confidence*100)+'%'}.`:'Ни одна замена не добавляет ФО за этот период.','muted'));
 }
 out.push(pickCard);
 if(st)out.push(el('p',`${teamName(team)} подключена к Sports.ru: трансфер делается там, здесь он появится сам примерно через минуту.`,'sp-note'));
 const early=options.some(o=>o.why.flags.some(f=>f.startsWith(EARLY)));
 if(early)out.push(el('p','Сезон только начался: оценки опираются на прогноз, а не на игры этого сезона.','warning'));
 const others=options.filter(o=>o!==best);
 if(others.length){const d=el('details',null,'sp-block');d.append(el('summary',`Другие пакеты (${others.length})`));for(const p of others)d.append(packageCard(p,ctx,left));out.push(d);}
 const singles=bestTransfers(ctx,{team,bankMoney:money,sort:horizon}).filter(b=>b.gain[horizon]>0);
 const alerts=new Set(marketAlerts(ctx,{team,bankMoney:money,sort:horizon==='season'?'season':'month',minGain:20}).map(a=>a.outId+'>'+a.player.id));
 const sb=el('details',null,'sp-block sp-best');sb.open=!best&&singles.length>0;sb.append(el('summary',`Лучшая замена для каждого игрока (${singles.length})`));
 if(singles.length){const ol=el('ol',null,'sp-options');for(const b of singles){const row=optionRow(b,b.outId,ctx,`${byId.get(b.outId).name} → ${b.player.name}`);if(alerts.has(b.outId+'>'+b.player.id))row.querySelector('.sp-name').append(el('span','Рекомендуем','chip chip--accent'));ol.append(row);}sb.append(ol);}
 else sb.append(el('p',`Ни одна одиночная замена не добавляет ФО ${PERIOD_LONG[horizon]}.`,'muted'));
 out.push(sb);
 const pick=el('div',null,'sp-block sp-best');pick.append(el('h3','Замена конкретному игроку'));
 const sel=el('select');sel.setAttribute('aria-label','Игрок, которого заменить');sel.append(el('option','Выбери игрока'));sel.firstChild.value='';
 for(const id of ctx.rosters[team]){const p=byId.get(id);if(!p)continue;const c=current(p,ctx);const o=el('option',`${p.name} (${c.positions.join('/')}, ${int(c.price)})${injuryText(p)?' · '+injuryText(p):''}`);o.value=String(id);sel.append(o);}
 if(replacing)sel.value=String(replacing);
 // Ids are NBA numbers or provider strings ("espn:…"): match the option to a roster id, never coerce it.
 sel.onchange=()=>{replacing=ctx.rosters[team].find(id=>String(id)===sel.value)??null;query='';renderSeason();};
 pick.append(sel);if(replacing&&ctx.rosters[team].includes(replacing))pick.append(replacementPanel(byId.get(replacing),ctx));
 out.push(pick,transferLog(ctx));
 return out;
}
function record(moves,ctx){
 const used=Math.max(transfersThisWeek(ctx.transfers,team,ctx.today,gameWeeks(live)),fblTransfers(ctx.transfers,team,ctx.today).used);
 if(used+moves.length>WEEKLY_TRANSFERS&&!confirm(`У команды ${teamName(team)} будет ${count(used+moves.length,'трансфер','трансфера','трансферов')} на этой неделе при лимите ${WEEKLY_TRANSFERS}. Всё равно записать?`))return;
 const list=moves.map(m=>{const out=current(byId.get(m.outId),ctx);return {team,outId:m.outId,inId:m.player.id,date:ctx.today,outPrice:out.price,inPrice:m.player.price};});
 if(!confirm(list.map(x=>`${byId.get(x.outId).name} (${int(x.outPrice)}) → ${byId.get(x.inId).name} (${int(x.inPrice)})`).join('\n')+`\n\nЗаписать для ${teamName(team)} от ${ddmm(ctx.today)}? Затем отправь каждую запись в общий журнал лиги.`))return;
 try{seasonRosters([...ctx.transfers,...list]);}catch(e){alert(e.message);return;}
 pending=[...pending,...list];writeStored('fbl-transfers',JSON.stringify(pending));replacing=null;renderSeason();
 document.querySelector('.sp-log')?.scrollIntoView({block:'start'});
}
function transferLog(ctx){
 const box=el('details',null,'sp-block sp-log');box.open=pending.length>0;box.append(el('summary',`Журнал трансферов лиги (${ctx.transfers.length})`));
 const list=el('ol');
 [...ctx.transfers].reverse().forEach(x=>{
  const isPending=!x.source,li=el('li',null,isPending?'pending':''),what=el('span',null,'what');
  what.append(el('strong',`${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`),el('small',`${teamName(x.team)} · ${int(x.outPrice)} → ${int(x.inPrice)}${x.source==='league'?' · журнал лиги':''}`));
  li.append(el('span',ddmm(x.date),'when'),what);
  if(isPending){li.append(el('span','только на этом устройстве','chip chip--warn'),link('Отправить в журнал ↗',issueUrl(`${teamName(x.team)}: ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`,{action:'transfer',...x}),'btn-secondary btn-sm sp-send'));
   li.append(button('Удалить',()=>{pending=pending.filter(p=>!same(p,x));writeStored('fbl-transfers',JSON.stringify(pending));renderSeason();},'btn-ghost btn-sm'));}
  else if(x.source==='league'&&same(x,league.transfers.at(-1)||{})&&!pending.length)li.append(link('Отменить в журнале ↗',issueUrl('отменить последний трансфер',{action:'undo'}),'sp-send'));
  list.append(li);});
 if(!ctx.transfers.length)list.append(el('li','Пока пусто. Трансферы подключённых команд появятся сами; остальные записывай после одобрения лиги.','muted'));
 const connected=ctx.connected.size;
 box.append(el('p',connected?`Подключены к Sports.ru: ${connected} из 8 команд — их трансферы появляются примерно через минуту, цены и очки обновляются каждые 2 часа.`:'Автоматический источник не подключён: трансферы берутся из журнала лиги.','muted'));
 for(const w of ctx.warnings||[])box.append(el('p',`⚠ ${w.team>=0?teamName(w.team):'Лига'}: ${w.message}`,'warning'));
 box.append(list);
 if(pending.length)box.append(el('p','«Отправить в журнал» открывает GitHub с готовой заявкой: после «Submit new issue» бот проверит правила и добавит её в общий журнал примерно за минуту. Уведомления в Telegram видят только общий журнал.','sp-note'));
 return box;
}

// ---------- Injuries ----------
function injuriesView(ctx){
 if(src.injuries==='idle'||(loading&&!injuries.size))return [loadingBlock(null)];
 if(src.injuries==='error')return [errorBlock('Нет данных о травмах','ESPN не ответил. Список травм появится после обновления.')];
 const own=owners(ctx),byEspn=new Map(players.filter(p=>p.espnId).map(p=>[String(p.espnId),p]));
 const all=[...injuries.entries()].map(([id,i])=>({i,p:byEspn.get(id)}));
 const league=all.filter(r=>r.p&&own.has(r.p.id)),market=all.filter(r=>r.p&&!own.has(r.p.id)&&live?.players?.[r.p.sportsId]);
 const scope=el('div',null,'segmented sp-period');scope.setAttribute('role','group');scope.setAttribute('aria-label','Чьи травмы');
 for(const [k,label] of [['league',`Лига (${league.length})`],['market',`Свободные (${market.length})`]]){const b=button(label,()=>{injuryScope=k;renderSeason();},'');b.setAttribute('aria-pressed',String(injuryScope===k));scope.append(b);}
 const rows=injuryScope==='league'?league:market;
 const group=r=>injuryScope==='league'?own.get(r.p.id):9;
 rows.sort((a,b)=>group(a)-group(b)||String(a.i.returnDate||'9').localeCompare(String(b.i.returnDate||'9')));
 const list=el('div',null,'sp-injuries');let last=null;
 for(const r of rows){const g=group(r);
  if(g!==last&&injuryScope==='league'){const h=el('h3',teamName(g));if(g===0)h.append(' ',el('span','ты','chip chip--accent'));list.append(h);last=g;}
  const info=injuryInfo(r.p),item=el('div',null,'sp-injury-item'+(info.level==='out'?' out':'')),head=el('div',null,'head');
  head.append(el('strong',r.p.name),el('span',info.text,'chip '+(info.level==='out'?'chip--danger':'chip--warn')));
  item.append(head,el('small',[r.p.team,bodyPart(r.i.type),r.i.date?'отчёт '+ddmm(String(r.i.date).slice(0,10)):''].filter(Boolean).join(' · ')));
  if(g===0){const o=playerOutlook(r.p,{...ctx,running:new Map()});const missed=Math.max(0,(live?.clubs?.[clubOf(r.p)]||[]).filter(x=>x.date>=ctx.today&&x.date<=horizons(ctx).week.to&&!x.score&&!x.gone).length-o.week.games);
   if(missed>=.5)item.append(el('p',`Пропустит ~${dec(missed)} матча до конца недели.`));
   item.append(button('Найти замену',()=>{team=0;writeStored('fbl-season-team','0');replacing=r.p.id;openRows.add(r.p.id);setView('teams');},'btn-ghost btn-sm'));}
  if(r.i.comment){const c=el('details',null,'inline');c.append(el('summary','Комментарий ESPN'),el('p',r.i.comment));c.lang='en';item.append(c);}
  list.append(item);}
 if(!rows.length)list.append(el('p',injuryScope==='league'?'В составах FBL травмированных нет.':'Среди свободных игроков травмированных нет.','muted'));
 return [el('p',`Отчёт ESPN${src.injuriesAt?' от '+stampMsk(src.injuriesAt):''}. Даты возвращения — оценка ESPN.`,'muted'),scope,list];
}

// ---------- Upcoming games ----------
// Games of the team chosen above: today's scores and the 7-day schedule list only that team's players.
function gamesView(ctx){
 const head=el('div',null,'sp-controls sp-games-controls'),toggle=el('label',null,'check'),cb=el('input');
 cb.type='checkbox';cb.checked=onlyMine;cb.onchange=()=>{onlyMine=cb.checked;renderSeason();};toggle.append(cb,' Только матчи с игроками команды');
 head.append(teamSelect(),toggle);
 const out=[head,gamesToday(ctx,false,team)];
 const wait=needsLive('Ближайшие 7 дней');if(wait)return [...out,...wait];
 const own=owners(ctx),byClub=new Map();
 for(const p of players){if(own.get(p.id)!==team)continue;const c=clubOf(p);if(!byClub.has(c))byClub.set(c,[]);byClub.get(c).push(p);}
 const until=addDaysIso(ctx.today,6),days=new Map();
 for(const [club,cal] of Object.entries(live?.clubs||{}))for(const g of cal){if(g.date<ctx.today||g.date>until||!g.home||g.gone)continue;if(!days.has(g.date))days.set(g.date,[]);days.get(g.date).push({home:club,away:g.opponent});}
 const week=currentWeek(ctx.today),end=week?.end||horizons(ctx).week.to;
 const block=el('div',null,'sp-block');block.append(el('h3',`Игры составов до ${ddmm(end)}`),el('p','Сколько матчей сыграют 10 игроков каждой команды по календарю Sports.ru и с учётом травм.','muted'));
 const counts=el('table',null,'standings-table'),hr=el('tr');for(const [x,c] of [['Команда',''],['Матчей','num'],['С травмами','num']]){const th=el('th',x,c);th.scope='col';hr.append(th);}counts.append(hr);
 const rows=ctx.rosters.map((ids,t)=>{let w=0,e=0;for(const id of ids){const p=byId.get(id);if(!p)continue;for(const g of live?.clubs?.[clubOf(p)]||[])if(g.date>=ctx.today&&g.date<=end&&!g.score&&!g.gone)w++;e+=playerOutlook(p,{...ctx,running:new Map()}).week.games;}return {t,w,e};}).sort((a,b)=>b.e-a.e);
 for(const r of rows){const tr=el('tr');if(r.t===team)tr.className='mine';tr.append(el('td',teamName(r.t),'team'),el('td',String(r.w),'num'),el('td',dec(r.e),'num total'));counts.append(tr);}
 const wrap=el('div',null,'table-scroll');wrap.append(counts);block.append(wrap);
 const sched=el('div',null,'sp-block');sched.append(el('h3','Расписание на 7 дней'));
 let any=false;
 for(const [day,list] of [...days].sort()){
  const ul=el('ul',null,'sp-day');
  for(const g of list){const ours=[...(byClub.get(g.away)||[]),...(byClub.get(g.home)||[])];if(onlyMine&&!ours.length)continue;
   const li=el('li'),line=el('strong');line.append(el('span',`${g.away} — ${g.home}`));li.append(line);
   if(ours.length)li.append(el('small',ours.map(p=>`${p.name}${injuryText(p)?' ('+injuryText(p).toLowerCase()+')':''}`).join(' · '),'team-players'));
   ul.append(li);}
  if(ul.children.length){sched.append(el('p',weekday(day),'games-day'),ul);any=true;}
 }
 if(!any)sched.append(el('p',onlyMine?`На этой неделе у игроков ${teamName(team)} матчей нет.`:'Нет данных календаря.','muted'));
 out.push(sched,block);
 return out;
}

// ---------- Rules ----------
// League rules for every team, the appeal to the league's lawyer for each breach, and the league's «белое правило» list.
// The list is the league's decision (data/fbl-league.json "white"); marks made here wait on this device until the
// league log has them, and a draft mark never turns into a breach before the league decides.
function whiteList(){const shared=(league.white||[]).map(String),draft=readJson('fbl-white-pending',null);return draft?draft.map(String):shared;}
function rulesView(ctx){
 const wait=needsLive('Правила лиги');if(wait)return wait;
 const official=(league.white||[]).map(String),draft=readJson('fbl-white-pending',null),marks=new Set(draft?draft.map(String):official),out=[];
 const args={rosters:ctx.rosters,byId,transfers:ctx.transfers,checked:(league.whiteChecked||[]).map(String),today:ctx.today,clubOf,nameOf:p=>p?.name};
 const checks=checkRules({...args,white:official}),shown=draft?checkRules({...args,white:[...marks]}):checks;
 const t0=checks[0].transfers;
 const intro=el('ul',null,'sp-rules-intro');
 for(const line of ['Минимум 1 rookie в составе.','Минимум 1 игрок по «белому правилу» — засчитывается по отцу, решает лига.','Не больше 2 игроков одного клуба NBA и ни одного игрока сразу в двух командах FBL.',`До ${t0.limit} трансферов за неделю лиги (пн–вс). Трансферы до старта сезона на Sports.ru бесплатны и в лимит не входят.`,`Трансферы только с ${TRANSFER_HOURS.from} до ${TRANSFER_HOURS.to} МСК.`])intro.append(el('li',line));
 out.push(el('h3','Правила лиги'),intro,el('p',`Нарушения разбирает ${LAWYER.name}, юрист лиги.`,'muted'));
 const unmarked=shown.filter(c=>c.whiteState==='unmarked').length;
 if(unmarked)out.push(el('p',`Белое правило: отметь по одному игроку у ${count(unmarked,'команды','команд','команд')} — кто закрывает правило. Дальше приложение само следит за продажами этих игроков.`,'warning'));
 const pickMark=(c,value)=>{for(const p of c.roster)marks.delete(String(p.id));marks.delete(`none:${c.team}`);if(value)marks.add(value);writeStored('fbl-white-pending',JSON.stringify([...marks]));renderSeason();};
 const table=el('table',null,'sp-table'),head=el('tr');for(const h of ['Команда','Rookie','Белое правило','Клубы NBA',`Трансферы до ${ddmm(t0.week.end)}`,'Итог'])head.append(el('th',h));table.append(head);
 for(const [i,c] of checks.entries()){
  const d=shown[i],v=verdict(c),tr=el('tr');if(c.team===0)tr.className='mine';
  const has=r=>c.violations.some(x=>x.rule===r);
  // On phones each row becomes a card: the label comes from data-label and the content sits in one inner block.
  const cell=(label,value,cls)=>{const td=el('td',null,cls),inner=el('div');td.dataset.label=label;if(value!=null)inner.append(value);td.append(inner);tr.append(td);return inner;};
  const name=cell('Команда',teamName(c.team),'team');if(c.team===0)name.append(' ',el('span','ты','chip chip--accent'));
  cell('Rookie',has('rookie')?'❌ нет':'✅ '+c.rookies.map(p=>p.name).join(', '),has('rookie')?'bad':'');
  // One player per team is enough: the select names who satisfies the rule for this team, or the league's finding of none.
  const w=cell('Белое правило'),select=el('select');select.setAttribute('aria-label','Белое правило: '+teamName(c.team));
  const decided=c.whites[0]||marks.has(`none:${c.team}`);
  for(const [value,label] of [...(decided?[]:[['','не отмечен']]),...c.roster.map(p=>[String(p.id),p.name]),[`none:${c.team}`,'никто не подходит']]){const o=el('option',label);o.value=value;select.append(o);}
  select.value=d.whites[0]?String(d.whites[0].id):marks.has(`none:${c.team}`)?`none:${c.team}`:'';select.onchange=()=>pickMark(c,select.value);
  const state=d.whiteState==='ok'?['✅','ok']:d.whiteState==='unmarked'?['⏳','wait']:d.whiteState==='sold'?['⏳','wait']:['❌','bad'];
  w.append(el('span',state[0]+' ',state[1]),select);
  if(c.undecided.length)w.append(el('small',`нет решения лиги: ${c.undecided.map(p=>p.name).join(', ')}`));
  cell('Клубы NBA',has('club')?'❌ больше двух':'✅',has('club')?'bad':'');
  const tc=cell('Трансферы',`${c.transfers.left} из ${c.transfers.limit}`);tc.append(el('small',`осталось до ${ddmm(t0.week.end)}`));if(has('transfers'))tc.append(el('small','❌ превышение','bad'));
  const other=c.violations.filter(x=>x.rule==='time'||x.rule==='duplicate');
  const sum=cell('Итог',v.kind==='violation'?'❌ нарушение':v.kind==='check'?'⏳ проверить':'✅ в порядке',v.kind==='violation'?'bad':v.kind==='check'?'wait':'ok');
  if(other.length)sum.append(el('small',other.map(x=>x.rule==='time'?'время сделки':'игрок в двух командах').join(', ')));
  table.append(tr);
 }
 const wrap=el('div',null,'table-scroll');wrap.append(table);out.push(wrap);
 if(draft){const bar=el('div',null,'white-pending notice notice--warn');
  const send=link('Отправить в лигу ↗',issueUrl('белое правило',{action:'white',players:[...marks].map(x=>/^\d+$/.test(x)?Number(x):x)}),'btn-primary btn-sm');
  bar.append(el('p','Черновик белого правила на этом устройстве. Чтобы его увидели бот лиги и Telegram, отправь заявку.'),send,button('Сбросить',()=>{writeStored('fbl-white-pending','');renderSeason();},'btn-ghost btn-sm'));out.push(bar);}
 for(const c of checks.filter(c=>c.violations.length)){
  const v=verdict(c),items=[...v.breaches,...v.doubts];
  if(c.team===0){const box=el('div',null,'sp-appeal');box.append(el('h4',v.breaches.length?'⚠ У тебя нарушение':'⏳ Проверь свой состав'),...items.map(x=>el('p','• '+x.text)));
   box.append(button('Открыть мой состав',()=>{team=0;writeStored('fbl-season-team','0');setView('teams');}));out.push(box);continue;}
  const box=el('div',null,'sp-appeal'),text=appeal(c,ctx.today,0),area=el('textarea');area.value=text;area.rows=10;area.readOnly=true;area.setAttribute('aria-label','Текст обращения');
  box.append(el('h4',`${v.breaches.length?'⚖️':'⏳'} ${teamName(c.team)} — ${v.breaches.length?'обращение к юристу лиги':'нужна проверка'}`),...items.map(x=>el('p','• '+x.text)));
  const letter=el('details',null,'inline');letter.append(el('summary','Текст обращения'),area);box.append(letter);
  const copy=button('Скопировать обращение',async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='Скопировано ✓';setTimeout(()=>{copy.textContent='Скопировать обращение';},2000);}catch{letter.open=true;area.select();copy.textContent='Выдели текст и скопируй';}});
  const share=link('Отправить в Telegram ↗',`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`,'btn-secondary btn-sm');
  const actions=el('div',null,'actions');actions.append(copy,share);box.append(actions);out.push(box);
 }
 if(!checks.some(c=>c.violations.length))out.push(el('p','Нарушений не найдено.','muted'));
 return out;
}

// ---------- Page ----------
// Written from the code and the in-season calibration (src/forecast-text.js), so its numbers cannot go stale.
const METHOD=seasonMethod();
function statusLine(ctx){
 const week=currentWeek(ctx.today),parts=[week?`Тур ${week.n} · ${ddmm(week.start)}–${ddmm(week.end)}`:`Сегодня ${ddmm(ctx.today)}`];
 if(loading)parts.push('обновляю данные…');else if(live)parts.push(`данные Sports.ru на ${timeMsk(live.collectedAt)}`+(moscowDate(live.collectedAt)!==ctx.today?` ${ddmm(moscowDate(live.collectedAt))}`:''));
 if(!loading&&gamesAt&&games.some(g=>g.state==='in'))parts.push(`счёт ESPN на ${new Date(gamesAt+3*3600e3).toISOString().slice(11,19)} МСК, обновляется каждые ${LIVE_MS/1e3} с`);
 return parts.join(' · ');
}
function warnings(ctx){
 const out=[],age=liveAgeHours();
 if(live&&src.live==='stale')out.push(`Sports.ru не ответил — показаны данные от ${stampMsk(live.collectedAt)}.`);
 else if(live&&age>6)out.push(`Данные Sports.ru устарели: последнее обновление ${stampMsk(live.collectedAt)}.`);
 if(src.injuries==='error'&&view!=='injuries')out.push('Отчёт ESPN о травмах недоступен: шансы сыграть считаются без него.');
 else if(src.injuries==='stale')out.push(`Отчёт ESPN о травмах не обновился${src.injuriesAt?' с '+stampMsk(src.injuriesAt):''}: шансы сыграть — по последнему полученному.`);
 if(live&&ctx.connected.size<8)out.push(`К Sports.ru подключено ${ctx.connected.size} из 8 команд: остальные трансферы — из журнала лиги.`);
 return out.map(w=>{const n=el('p',null,'notice notice--warn');n.append(el('p',w));return n;});
}
function setView(v){view=v;writeStored('fbl-season-view',v);renderSeason();window.scrollTo({top:0});}
export function renderSeason(busy=false){
 const root=$('season-body');if(!root||tab()!=='season')return;
 if(!players.length){
  $('season-status').textContent='';
  root.replaceChildren(dbState==='error'?errorBlock('Не удалось загрузить базу игроков','Проверь интернет и повтори.',()=>dbRetry?.()):loadingBlock('Загружаю базу игроков…'));
  return;
 }
 // One automatic attempt per page: a failed source shows its error and a retry button instead of polling in a loop.
 if(!live&&!loading&&!attempted&&!busy){refreshSeason();return;}
 const ctx=context();
 $('season-status').textContent=statusLine(ctx);
 const nav=el('nav',null,'season-nav segmented');nav.setAttribute('aria-label','Разделы сезона');
 for(const [k,label] of VIEWS){const b=el('button',label);b.type='button';b.setAttribute('aria-pressed',String(view===k));b.onclick=()=>{replacing=null;setView(k);};nav.append(b);}
 const content=view==='teams'?teams(ctx):view==='transfers'?transfersView(ctx):view==='injuries'?injuriesView(ctx):view==='games'?gamesView(ctx):view==='rules'?rulesView(ctx):overview(ctx);
 const parts=[nav,...warnings(ctx),...content];
 if(METHOD[view]&&live){const method=el('details',null,'method');method.dataset.key='method:'+view;method.append(el('summary','Как считается'));const ul=el('ul');for(const l of METHOD[view])ul.append(el('li',l));method.append(ul);parts.push(method);}
 // Keep the replacement search focused and its caret in place across a re-render.
 const focused=document.activeElement,wasSearch=focused?.closest?.('#season-body')&&focused.type==='search',caret=wasSearch?focused.selectionStart:null;
 // Open blocks (stat lines, dossiers, method notes) stay open across the 20-second live refresh. A lazily filled block
 // gets its toggle event at once, so the blocks nested in what it adds can be reopened in the next pass.
 const open=new Set([...root.querySelectorAll('details[data-key]')].filter(d=>d.open).map(d=>d.dataset.key));
 root.replaceChildren(...parts);
 for(let pass=0,again=true;again&&pass<4;pass++){again=false;
  for(const d of root.querySelectorAll('details[data-key]'))if(!d.open&&open.has(d.dataset.key)){d.open=true;d.dispatchEvent(new Event('toggle'));again=true;}}
 if(wasSearch){const s=root.querySelector('.sp-replace input[type=search]');if(s){s.focus({preventScroll:true});try{s.setSelectionRange(caret,caret);}catch{}}}
}
export function initSeasonTabs(onDraft){
 const set=t=>{document.body.dataset.tab=t;writeStored('fbl-tab',t);$('season').hidden=t!=='season';$('draft-view').hidden=t==='season';
  for(const b of document.querySelectorAll('[data-tab-button]'))b.setAttribute('aria-pressed',String(b.dataset.tabButton===t));
  if(t==='season'){renderSeason();if(live)refreshSeason();}else onDraft?.();};
 for(const b of document.querySelectorAll('[data-tab-button]'))b.onclick=()=>set(b.dataset.tabButton);
 $('season-refresh').onclick=()=>refreshSeason();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&tab()==='season'&&live)refreshSeason();});
 set(readStored('fbl-tab')||(moscowToday()>'2026-10-18'?'season':'draft'));
}
