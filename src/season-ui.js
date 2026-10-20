import {readStored,writeStored} from './storage.js';
import {teamLabel,teamName} from './teams.js';
import {fblTransfers,checkRules,appeal,LAWYER} from './rules.js';
import {CAP,WEEKLY_TRANSFERS,moscowToday,seasonRosters,bank,transfersThisWeek,perGame,horizons,gameWeeks,weekOf,current,playerOutlook,transferOptions,bestTransfers,bestPackage,marketAlerts,teamPoints,parseInjuries,allTransfers,withMarket,explainSwap,newsInjuries,CONFIDENT,DOUBTFUL} from './season.js';
import {fetchLiveGames,moscowDate} from './live.js';

const $=id=>document.getElementById(id);
const REPO='RuslanMunasipov/Nba-draft-simulator';
const LIVE_URLS=[`https://raw.githubusercontent.com/${REPO}/data/season-live/sports-current.json`,import.meta.env.BASE_URL+'data/sports-current.json'];
const LEAGUE_URL=`https://raw.githubusercontent.com/${REPO}/main/data/fbl-league.json`;
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const SPORTS_URL=id=>`https://www.sports.ru/fantasy/basketball/player/info/150/${id}.html`;
const VIEWS=[['overview','Обзор'],['teams','Команды'],['transfers','Трансферы'],['injuries','Травмы'],['games','Матчи'],['rules','Правила']];
const fmt=n=>Math.round(n).toLocaleString('ru-RU'),signed=n=>(n>=0?'+':'−')+fmt(Math.abs(n));
const ddmm=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';
const addDaysIso=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const symbol=t=>teamName(t).split(' ')[0];
function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;}
function link(textValue,href,cls){const a=el('a',textValue,cls);a.href=href;a.target='_blank';a.rel='noopener';return a;}

let basePlayers=[],players=[],byId=new Map(),live=null,injuries=new Map(),league={transfers:[],banks:{}},games=[],card=()=>el('div');
let notes={live:'',injuries:'',games:'',league:''},loading=null,liveTimer=null;
let view=readStored('fbl-season-view')||'overview',team=Number(readStored('fbl-season-team')||0),horizon=readStored('fbl-season-horizon')||'month';
let replacing=null,query='',onlyFbl=true;
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
// Both limits bind: Sports.ru's own weekly count and the FBL week (pre-season moves count against the first one).
function transfersLeft(ctx,t){const x=sportsTeam(t)?.transfersLeft,sports=Number.isFinite(x)?x:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(ctx.transfers,t,ctx.today,gameWeeks(live)));
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

async function fetchJson(url,opts){const r=await fetch(url,opts);if(!r.ok)throw Error(String(r.status));return r.json();}
async function fetchLive(){for(const url of LIVE_URLS){try{const d=await fetchJson(url,{cache:'no-cache'});if(d?.players&&d?.clubs)return d;}catch{}}return null;}
const stamp=d=>new Date(d).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export async function refreshSeason(){
 if(loading)return loading;
 $('season-status').textContent='Обновляю Sports.ru, травмы и матчи…';
 loading=Promise.all([fetchLive(),fetchJson(INJURY_URL).catch(()=>null),fetchJson(LEAGUE_URL,{cache:'no-cache'}).catch(()=>null)]).then(async([l,inj,lg])=>{
  // Older than a missed collection cycle or two: say so instead of showing old prices and points as current.
  if(l){live=l;const age=(Date.now()-Date.parse(l.collectedAt))/36e5;notes.live=`Sports.ru ${stamp(l.collectedAt)}${age>6?` ⚠️ данные устарели на ${Math.floor(age)} ч`:''}`;addMarket();}else notes.live='Sports.ru недоступен, цены драфта';
  if(inj){injuries=parseInjuries(inj);notes.injuries=`травмы ESPN ${stamp(Date.now())}`;}
  else if(live?.espnInjuries){injuries=parseInjuries(live.espnInjuries);notes.injuries=`травмы ESPN ${stamp(live.espnInjuries.fetchedAt)}`;}
  else notes.injuries='травмы недоступны';
  if(lg?.transfers)league=lg;
  const connected=merged().connected.size;notes.league=`команд подключено: ${connected}/8`;
  await refreshGames();
 }).finally(()=>{loading=null;renderSeason();});
 return loading;
}
async function refreshGames(){
 const ctx=players.length?context():null,wanted=ctx?new Set(ctx.rosters.flat().map(id=>byId.get(id)?.team).filter(Boolean)):null;
 try{games=await fetchLiveGames(wanted);notes.games=`матчи ESPN ${stamp(Date.now())}`;}catch{notes.games='матчи ESPN недоступны';}
 // Poll once a minute while a game is running and the season page is open.
 clearTimeout(liveTimer);
 if(games.some(g=>g.state==='in'))liveTimer=setTimeout(async()=>{if(tab()==='season'&&document.visibilityState!=='hidden'){await refreshGames();renderSeason();}},60000);
}
export function setSeasonPlayers(list,cardFn){
 if(cardFn)card=cardFn;
 if(list===basePlayers||!list?.length)return;
 basePlayers=list;addMarket();
 if(tab()==='season')renderSeason();
}
// Database players plus Sports.ru market players the database does not know yet.
function addMarket(){if(!basePlayers.length)return;players=withMarket(basePlayers,live);byId=new Map(players.map(p=>[p.id,p]));}
function currentWeek(today){const w=weekOf(today,gameWeeks(live));return w?.n?w:null;}
function injuryText(p){const i=injuries.get(String(p.espnId));if(!i)return '';return i.status+(i.fantasyStatus==='OFS'?' · вне сезона':i.returnDate?` до ${ddmm(i.returnDate)}`:'');}
// Running points from ESPN box scores for games Sports.ru has not counted yet.
function livePoints(){
 const out=new Map();
 for(const g of games){if(!g.points)continue;const day=moscowDate(g.date);
  for(const p of players){const x=g.points[String(p.espnId)];if(!x)continue;
   const official=(live?.players?.[p.sportsId]?.games||[]).some(o=>o.date===day&&o.played);
   if(!official)out.set(p.id,{...x,game:g,day});}}
 return out;
}

// ---------- Overview ----------
function standingsTable(ctx,running){
 const official=teamPoints(ctx,ctx.transfers),h=horizons(ctx);
 const rows=ctx.rosters.map((ids,t)=>{
  const now=ids.reduce((s,id)=>s+(running.get(id)?.points||0),0);
  let rest=0,week=0;for(const id of ids){const p=byId.get(id);if(!p)continue;const o=playerOutlook(p,{...ctx,running});rest+=o.season.points;week+=o.week.games;}
  return {t,official:official[t],now,rest,week,total:official[t]+now+rest};
 }).sort((a,b)=>(b.official+b.now)-(a.official+a.now)||b.total-a.total);
 const table=el('table',null,'standings-table'),head=el('tr');
 for(const x of ['#','Команда','ФО','Сейчас','Матчей до конца недели','Прогноз итога'])head.append(el('th',x));table.append(head);
 rows.forEach((r,i)=>{const tr=el('tr');if(r.t===0)tr.className='mine';
  for(const c of [String(i+1),teamName(r.t),fmt(r.official),r.now?signed(r.now):'—',r.week.toFixed(1),fmt(r.total)])tr.append(el('td',c));
  tr.onclick=()=>{team=r.t;writeStored('fbl-season-team',String(team));setView('teams');};table.append(tr);});
 const box=el('div');box.append(table,el('small',`ФО — официальные очки Sports.ru (игрок считается, только пока он в команде). «Сейчас» — матчи, которые Sports.ru ещё не засчитал: протоколы ESPN по формуле Sports.ru. «Матчей до конца недели» — ожидаемые игры состава с учётом травм. Прогноз итога добавляет ожидание до ${ddmm(h.season.to)}. Нажми на команду, чтобы открыть состав.`,'muted'));
 return box;
}
function topPlayers(ctx){
 const own=owners(ctx),rows=[];
 for(const p of players){const g=(live?.players?.[p.sportsId]?.games||[]).filter(x=>x.played);if(g.length)rows.push({p,total:g.reduce((s,x)=>s+x.points,0),games:g.length});}
 const box=el('div',null,'sp-top'),owner=p=>own.has(p.id)?teamName(own.get(p.id)):'свободен';
 const list=(items,line)=>{const ol=el('ol');for(const r of items){const li=el('li');li.append(el('strong',r.p.name),el('span',line(r)));ol.append(li);}return ol;};
 if(rows.length){
  box.append(el('h3','Топ-5 по ФО сезона'),list(rows.sort((a,b)=>b.total-a.total).slice(0,5),r=>`${fmt(r.total)} ФО · ${r.games} м. · ${(r.total/r.games).toFixed(1)} за матч · ${owner(r.p)}`));
  const fa=rows.filter(r=>!own.has(r.p.id)&&r.games>=2).sort((a,b)=>b.total/b.games-a.total/a.games).slice(0,5);
  if(fa.length)box.append(el('h3','Лучшие свободные агенты (ФО за матч)'),list(fa,r=>`${(r.total/r.games).toFixed(1)} за матч · ${r.games} м. · ${current(r.p,ctx).price} · ${current(r.p,ctx).positions.join('/')}`));
 }else{
  box.append(el('h3','Топ-5 по прогнозу'),el('p','Сезон ещё не начался: официальные ФО Sports.ru появятся после первых матчей (старт 21.10).','muted'));
  box.append(list([...players].filter(p=>p.sportsId).map(p=>({p,v:perGame(p).value})).sort((a,b)=>b.v-a.v).slice(0,5),r=>`${r.v.toFixed(1)} за матч · ${owner(r.p)}`));
 }
 return box;
}
function liveGamesBlock(ctx){
 const own=owners(ctx),box=el('div',null,'sp-live');box.append(el('h3','Матчи сегодня'));
 const shown=games.filter(g=>g.state!=='post'||moscowDate(g.date)>=addDaysIso(ctx.today,-1));
 if(!shown.length){box.append(el('p','Сейчас матчей нет или ESPN недоступен. Ближайшие — во вкладке «Матчи».','muted'));return box;}
 for(const g of shown){
  const item=el('div',null,'sp-game'+(g.state==='in'?' is-live':''));
  const score=g.state==='pre'?new Date(g.date).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):`${g.away.score} : ${g.home.score}`;
  const head=el('div',null,'sp-game-head');head.append(el('strong',`${g.away.abbr} @ ${g.home.abbr}`),el('span',score),el('small',g.state==='in'?'● '+g.detail:g.detail));
  item.append(head);
  const ours=players.filter(p=>own.has(p.id)&&(p.team===g.home.abbr||p.team===g.away.abbr));
  if(ours.length){const ul=el('ul');for(const p of ours){const x=g.points?.[String(p.espnId)];
   ul.append(el('li',`${symbol(own.get(p.id))} ${p.name}: ${x?`${fmt(x.points)} ФО${x.final?'':' (идёт, без бонуса результата)'} · ${x.minutes} мин`:g.state==='pre'?'не начался':'не играл'}`));}
   item.append(ul);}
  box.append(item);
 }
 return box;
}
function alertsBlock(ctx){
 const box=el('div',null,'sp-alerts'),money=teamBank(0,ctx.transfers);
 const alerts=marketAlerts(ctx,{team:0,bankMoney:money,sort:'month',minGain:20});
 const hurt=ctx.rosters[0].map(id=>byId.get(id)).filter(p=>p&&injuries.get(String(p.espnId)));
 if(!alerts.length&&!hurt.length)return box;
 box.append(el('h3','Для тебя'));
 for(const a of alerts.slice(0,3)){const out=byId.get(a.outId);const p=el('p');p.append(el('strong','📈 Усиление на рынке: '),document.createTextNode(`${out.name} → ${a.player.name}: ${signed(a.gain.month)} ФО за 4 недели, ${signed(a.gain.season)} за сезон · уверенность ${Math.round(a.why.confidence*100)}%.`));box.append(p);}
 for(const p of hurt)box.append(el('p',`🩹 ${p.name}: ${injuryText(p)}`));
 const go=el('button','Открыть помощника по трансферам');go.onclick=()=>{team=0;writeStored('fbl-season-team','0');setView('transfers');};box.append(go);
 return box;
}
function overview(ctx){const running=livePoints();return [alertsBlock(ctx),el('h3','Таблица Лиги'),standingsTable(ctx,running),liveGamesBlock(ctx),topPlayers(ctx)];}

// ---------- Teams ----------
function playerRow(p,ctx,running){
 const live1=live?.players?.[p.sportsId],c=current(p,ctx),o=playerOutlook(p,{...ctx,running}),g=perGame(p,live1),inj=injuryText(p),now=running?.get(p.id);
 const box=el('details',null,'season-player');if(replacing===p.id)box.open=true;
 const sum=el('summary'),row=el('div',null,'sp-row');
 const name=el('span',null,'sp-name');name.append(el('strong',p.name),el('small',`${c.positions.join('/')} · ${p.team||'—'}${p.isRookie?' · rookie':''}`));
 const price=el('span',null,'sp-price');const delta=Number.isFinite(live1?.price)&&Number.isFinite(live1?.initialPrice)?live1.price-live1.initialPrice:0;
 price.append(el('strong',String(c.price??'—')),el('small',delta?signed(delta):'цена'));
 const form=el('span',null,'sp-form');const last=(live1?.games||[]).filter(x=>x.played).slice(-3).map(x=>x.points);
 form.append(el('strong',g.average==null?'—':g.average.toFixed(1)),el('small',now?`сейчас ${fmt(now.points)}`:last.length?last.join(' · '):`прогноз ${g.prior.toFixed(1)}`));
 const next=el('span',null,'sp-next');next.append(el('strong',`${o.week.games.toFixed(1)} м.`),el('small',`${fmt(o[horizon].points)} ФО`));
 row.append(name,price,form,next);if(inj)row.append(el('span',inj,'sp-injury'));sum.append(row);box.append(sum);
 const actions=el('div',null,'sp-actions');
 const find=el('button',replacing===p.id?'Скрыть замены':'Найти замену');find.onclick=e=>{e.preventDefault();replacing=replacing===p.id?null:p.id;query='';renderSeason();};
 actions.append(find,link('Sports.ru ↗',SPORTS_URL(p.sportsId)));box.append(actions);
 if(replacing===p.id)box.append(replacementPanel(p,ctx));
 box.addEventListener('toggle',()=>{if(box.open&&!box.querySelector('.player-card'))box.append(card(p,null,true));});
 return box;
}
function gainCells(gain){
 const gains=el('span',null,'sp-gains');
 for(const [k,label] of [['week','неделя'],['month','4 нед.'],['season','сезон']]){const s=el('span',null,k===horizon?'on':'');s.append(el('strong',signed(gain[k])),el('small',label));if(gain[k]<0)s.classList.add('neg');gains.append(s);}
 return gains;
}
function optionRow(o,outId,ctx,title){
 const li=el('li',null,'sp-option'),inj=injuryText(o.player),why=explainSwap(ctx,outId,o.player.id,horizon);
 const name=el('span',null,'sp-name');name.append(el('strong',title||o.player.name),el('small',`${o.player.positions.join('/')} · ${o.player.team||'—'} · ${o.player.price} · банк после ${o.bankAfter}${inj?' · '+inj:''}`),confidenceBadge(why));
 const take=el('button','Записать');take.onclick=()=>record([{outId,player:o.player}],ctx);
 li.append(name,gainCells(o.gain),take,whyBox(why,ctx));return li;
}

// ---------- Why a move, and the players behind it ----------
const LEVELS={CONFIDENT:['уверенно','ok'],MODERATE:['умеренно','mid'],DOUBTFUL:['сомнительно','low']};
function confidenceBadge(why){const [word,cls]=LEVELS[why.level];return el('span',`${word} · ${Math.round(why.confidence*100)}%`,'sp-confidence '+cls);}
const horizonName=()=>({week:'до конца недели',month:'за 4 недели',season:'до конца сезона'})[horizon];
function whyBox(why,ctx){
 const box=el('details',null,'sp-why');box.append(el('summary','Почему и об игроках'));
 box.addEventListener('toggle',()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';
  const p=why.parts,part=(v,t)=>`${signed(v)} ${t}`;
  box.append(el('p',`Разница ${horizonName()}: ${signed(why.gain)} ФО = ${part(p.perGame,'за счёт ФО за матч')}, ${part(p.availability,'за счёт доли сыгранных матчей (здоровье, роль)')}, ${part(p.schedule,'за счёт календаря клубов')}.`));
  box.append(el('p',`Уверенность ${Math.round(why.confidence*100)}%: столько шансов, что обмен действительно даст плюс ${horizonName()}, по разбросу прогнозов обоих игроков (диапазоны проверены на прошлых сезонах). Совет «делать» — от ${Math.round(CONFIDENT*100)}%, ниже ${Math.round(DOUBTFUL*100)}% трансфер лучше сберечь.`,'muted'));
  if(why.flags.length){const ul=el('ul',null,'sp-flags');for(const f of why.flags)ul.append(el('li','⚠️ '+f));box.append(ul);}
  for(const side of why.sides){const pair=el('div',null,'sp-pair');pair.append(sideBlock('Отдаёшь',side.out),sideBlock('Получаешь',side.in));box.append(pair);}
 });
 return box;
}
// The forecast's own numbers: career model, ESPN, the draft-pick model, and the result.
function sourcesLine(f){
 const m=f.sources?.model,e=f.sources?.espn,t=f.sources?.teamResult;if(!m)return f.basis||'';
 const team=t&&Number.isFinite(t.bpiWins)?` Бонус команды ${t.value>=0?'+':''}${t.value.toFixed(1)} за матч (прогноз ESPN BPI ${Math.round(t.bpiWins)} побед и прошлый сезон).`:'';
 const own=f.draftPick?`модель новичков (пик №${f.draftPick})`:f.origin==='UNDRAFTED_ROOKIE_MODEL'?'модель незадрафтованных':'модель по карьере';
 return `Прогноз до сезона: ${own} ${m.perGame.toFixed(1)} × ${Math.round(m.games)} м.${e?`, ESPN ${e.perGame.toFixed(1)} × ${Math.round(e.games)} м. → итог ${f.meanPerGame.toFixed(1)} × ${Math.round(f.games)} м.`:''}${team}`;
}
function sideBlock(label,x){
 const p=x.player,f=p.forecast||{},box=el('div',null,'sp-side'),hist=Object.entries(p.sportsHistory||{}).slice(-2);
 box.append(el('small',label),el('strong',`${p.name} · ${x.price??'—'}${x.priceChange?` (${signed(x.priceChange)})`:''}`));
 const lines=[`${x.perGame.toFixed(1)} ФО/матч сейчас (прогноз до сезона ${x.prior.toFixed(1)}${x.played?`, в сезоне ${x.average.toFixed(1)} за ${x.played} м.`:''})`,
  `в периоде ${x.expectedGames.toFixed(1)} из ${x.clubGames} матчей клуба${x.clubGames?` (шанс сыграть ${Math.round(x.expectedGames/x.clubGames*100)}%)`:''} · за сезон играет ${Math.round(x.playRate*100)}% матчей`,
  p.depth?`состав ESPN: ${p.depth.rank===1?'стартер':'№'+p.depth.rank} на ${p.depth.position}`:'',
  x.injury?`🩹 ${x.injury.status}${x.injury.returnDate?' до '+ddmm(x.injury.returnDate):''}${x.injury.comment?' — '+x.injury.comment:''}`:'травм в отчёте ESPN нет',
  sourcesLine(f),f.availability?`история пропусков: ${f.availability.shortSpellsPer82.toFixed(1)} коротких и ${f.availability.longSpellsPer82.toFixed(1)} длинных за 82 матча (у ровесников ${f.availability.leagueShortSpellsPer82.toFixed(1)} и ${f.availability.leagueLongSpellsPer82.toFixed(1)}) · до сезона 80%: ${f.availability.gamesRange[0]}–${f.availability.gamesRange[1]} матчей`:'',hist.length?'Sports.ru: '+hist.map(([k,v])=>`${k} ${v.perGame} × ${v.games} м.`).join(' · '):''];
 for(const l of lines.filter(Boolean))box.append(el('p',l));
 box.append(newsBlock(p));
 const more=el('details');more.append(el('summary','Полная карточка игрока'));more.addEventListener('toggle',()=>{if(more.open&&!more.querySelector('.player-card'))more.append(card(p,null,true));});box.append(more);
 return box;
}
// Latest ESPN fantasy news of a player (CORS-open feed), loaded when the block is opened and cached for the session.
const NEWS_URL=id=>`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=50&playerId=${id}`,newsCache=new Map();
// The watcher's archive of ESPN injury reports (data/season-live), loaded once.
let archiveLoad=null;const injuryArchive=()=>archiveLoad??=fetchJson(`https://raw.githubusercontent.com/${REPO}/data/season-live/injury-history.json`);
function newsBlock(p){
 const box=el('details',null,'sp-news');box.append(el('summary','Новости ESPN'));
 if(!p.espnId){box.append(el('p','Нет ESPN id — новостей нет.','muted'));return box;}
 box.addEventListener('toggle',async()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';const wait=el('p','Загружаю…','muted');box.append(wait);
  try{if(!newsCache.has(p.espnId))newsCache.set(p.espnId,fetchJson(NEWS_URL(p.espnId)));const feed=(await newsCache.get(p.espnId)).feed||[];wait.remove();
   if(!feed.length)box.append(el('p','Свежих новостей нет.','muted'));
   const hurt=newsInjuries(feed);
   if(hurt.length)box.append(el('p',`Травмы в новостях ESPN за последние месяцы: ${hurt.map(x=>`${x.part} (${ddmm(x.first)}${x.last!==x.first?'–'+ddmm(x.last):''}, упоминаний ${x.mentions})`).join('; ')}. Это описание, а не множитель прогноза.`,'muted'));
   const archive=await injuryArchive().catch(()=>null),episodes=archive?.players?.[String(p.espnId)]?.episodes||[];
   if(episodes.length)box.append(el('p',`Архив отчётов ESPN: ${episodes.map(e=>`${e.type||'травма'}${e.detail?' · '+e.detail:''} ${ddmm(e.firstSeen)}–${ddmm(e.lastSeen)}`).join('; ')}.`,'muted'));
   for(const n of feed.slice(0,3)){const item=el('div',null,'sp-news-item');item.append(el('small',new Date(n.published||n.lastModified).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})),el('strong',n.headline||''));if(n.story||n.description)item.append(el('p',String(n.story||n.description).replace(/<[^>]+>/g,'').slice(0,420)));box.append(item);}
  }catch{wait.textContent='ESPN недоступен.';}});
 return box;
}
function replacementPanel(p,ctx){
 const box=el('div',null,'sp-replace'),money=teamBank(team,ctx.transfers);
 box.append(el('p',`Банк ${money} + продажа ${current(p,ctx).price} = до ${money+current(p,ctx).price} на нового игрока · трансферов осталось ${transfersLeft(ctx,team)}/${WEEKLY_TRANSFERS}. Выигрыш — ожидаемые ФО новичка минус ФО ${p.name} за период.`,'muted'));
 const search=el('input');search.placeholder='Найти любого свободного игрока на эту позицию…';search.value=query;
 const list=el('ol',null,'sp-options');
 const fill=()=>{const all=transferOptions(ctx,{team,outId:p.id,bankMoney:money,limit:query?1000:12,sort:horizon});
  const q=query.trim().toLowerCase(),shown=q?all.filter(o=>[o.player.name,o.player.sportsName,o.player.team].join(' ').toLowerCase().includes(q)).slice(0,12):all;
  list.replaceChildren(...shown.map(o=>optionRow(o,p.id,ctx)));if(!shown.length)list.append(el('li','Нет допустимых замен: позиция, бюджет или правило rookie.','muted'));};
 search.oninput=()=>{query=search.value;fill();};
 box.append(search,list);fill();return box;
}
function controls(ctx){
 const head=el('div',null,'sp-controls'),h=horizons(ctx);
 const pickTeam=el('select');for(let t=0;t<8;t++){const o=el('option',teamLabel(t));o.value=String(t);pickTeam.append(o);}pickTeam.value=String(team);
 pickTeam.onchange=()=>{team=Number(pickTeam.value);writeStored('fbl-season-team',String(team));replacing=null;renderSeason();};
 const pickH=el('select');for(const [k,v] of Object.entries(h)){const o=el('option',v.label);o.value=k;pickH.append(o);}pickH.value=horizon;
 pickH.onchange=()=>{horizon=pickH.value;writeStored('fbl-season-horizon',horizon);renderSeason();};
 const b=el('input');b.type='number';b.value=String(teamBank(team,ctx.transfers));b.title='Остаток на счету в Sports.ru';
 // A connected team's bank is read from Sports.ru on every update, so it is shown, not edited.
 if(Number.isFinite(sportsTeam(team)?.balance)){b.readOnly=true;b.title='Баланс Sports.ru, обновляется сам';}
 b.onchange=()=>{const o=readJson('fbl-bank',{}),v=Number(b.value);if(b.value===''||!Number.isFinite(v))delete o[team];else o[team]=v;writeStored('fbl-bank',JSON.stringify(o));renderSeason();};
 const labelled=(t,node)=>{const l=el('label');l.append(el('span',t),node);return l;};
 head.append(labelled('Команда',pickTeam),labelled('Горизонт',pickH),labelled('Банк',b));
 return head;
}
function teams(ctx){
 const roster=ctx.rosters[team].map(id=>byId.get(id)).filter(Boolean),spent=roster.reduce((s,p)=>s+(current(p,ctx).price||0),0),h=horizons(ctx);
 const st=sportsTeam(team),info=el('p',`Состав по текущим ценам ${spent} · банк ${teamBank(team,ctx.transfers)}${st?' (Sports.ru)':''} · трансферов осталось ${transfersLeft(ctx,team)}/${WEEKLY_TRANSFERS}${st?` · место на Sports.ru ${st.place??'—'} из ${st.of??'—'}`:''}`,'muted');
 if(st)info.append(document.createTextNode(' '),link('Команда на Sports.ru ↗',`https://www.sports.ru/fantasy/basketball/team/${st.sportsTeamId}.html`));
 const list=el('div',null,'sp-roster'),header=el('div',null,'sp-header');
 for(const t of ['Игрок','Цена','ФО ср. · последние','Неделя · '+h[horizon].label.toLowerCase()])header.append(el('span',t));
 const running=livePoints();list.append(header,...roster.map(p=>playerRow(p,ctx,running)));
 return [controls(ctx),info,list];
}

// ---------- Transfers assistant ----------
function packageBlock(ctx){
 const money=teamBank(team,ctx.transfers),left=transfersLeft(ctx,team);
 const box=el('div',null,'sp-packages');box.append(el('h3','Лучшие пакеты трансферов'),el('p',`Точный перебор: кого продать и кого купить, чтобы набрать больше всего ФО за период «${horizons(ctx)[horizon].label.toLowerCase()}». Учтены банк ${money}, по 2 на позицию Sports.ru, минимум один rookie. На этой неделе осталось ${left} из ${WEEKLY_TRANSFERS}${sportsTeam(team)?' (по Sports.ru)':''}.`,'muted'));
 let previous=0;
 for(const k of [1,2,3]){
  const p=bestPackage(ctx,{team,bankMoney:money,k,sort:horizon});
  if(!p||!p.pairs.length||p.gain<=previous+1e-6)continue;previous=p.gain;
  const item=el('div',null,'sp-package'+(p.pairs.length>left?' over-limit':''));
  const head=el('div',null,'sp-package-head');head.append(el('strong',`${p.pairs.length} ${p.pairs.length===1?'трансфер':'трансфера'}`),gainCells(p.gains));
  item.append(head);const ul=el('ul');for(const x of p.pairs)ul.append(el('li',`${x.out.name} (${x.out.price}) → ${x.in.name} (${x.in.price}, ${x.in.positions.join('/')})${injuryText(x.in)?' · '+injuryText(x.in):''}`));
  const why=explainSwap(ctx,null,null,horizon,p.pairs.map(x=>[x.out.id,x.in.id]));head.querySelector('strong').after(confidenceBadge(why));
  if(why.level==='DOUBTFUL')item.classList.add('doubtful');
  item.append(ul,el('small',`Банк после: ${p.bankAfter}${p.pairs.length>left?' · больше, чем осталось на этой неделе':''}`,'muted'),whyBox(why,ctx));
  const take=el('button','Записать пакет');take.onclick=()=>record(p.pairs.map(x=>({outId:x.out.id,player:x.in})),ctx);item.append(take);
  box.append(item);
 }
 if(previous<=0)box.append(el('p','Сейчас ни одна комбинация не добавляет ФО за этот период — держи состав.','muted'));
 return box;
}
function transfersView(ctx){
 const money=teamBank(team,ctx.transfers),alerts=marketAlerts(ctx,{team,bankMoney:money,sort:horizon==='season'?'season':'month',minGain:20});
 const alertBox=el('div',null,'sp-best');alertBox.append(el('h3','Усиления на рынке'));
 if(alerts.length){const ol=el('ol',null,'sp-options');for(const a of alerts)ol.append(optionRow(a,a.outId,ctx,`${byId.get(a.outId).name} → ${a.player.name}`));alertBox.append(ol);}
 else alertBox.append(el('p','Нет свободного игрока, который лучше твоего и за 4 недели (+20 ФО), и за сезон.','muted'));
 const best=bestTransfers(ctx,{team,bankMoney:money,sort:horizon});
 const singles=el('div',null,'sp-best');singles.append(el('h3','Лучшая замена для каждого игрока'));
 if(best.length){const ol=el('ol',null,'sp-options');for(const b of best)ol.append(optionRow(b,b.outId,ctx,`${byId.get(b.outId).name} → ${b.player.name}`));singles.append(ol);}
 else singles.append(el('p','Ни одна одиночная замена не даёт прироста за этот период.','muted'));
 const pick=el('div',null,'sp-best');pick.append(el('h3','Подобрать замену конкретному игроку'));
 const sel=el('select');sel.append(el('option','— выбери игрока —'));
 for(const id of ctx.rosters[team]){const p=byId.get(id);if(!p)continue;const c=current(p,ctx);const o=el('option',`${p.name} (${c.positions.join('/')}, ${c.price})${injuryText(p)?' · '+injuryText(p):''}`);o.value=String(id);sel.append(o);}
 if(replacing)sel.value=String(replacing);
 // Ids are NBA numbers or provider strings ("espn:…"): match the option to a roster id, never coerce it.
 sel.onchange=()=>{replacing=ctx.rosters[team].find(id=>String(id)===sel.value)??null;query='';renderSeason();};
 pick.append(sel);if(replacing&&ctx.rosters[team].includes(replacing))pick.append(replacementPanel(byId.get(replacing),ctx));
 return [controls(ctx),packageBlock(ctx),alertBox,singles,pick,transferLog(ctx)];
}
function record(moves,ctx){
 if(sportsTeam(team)){alert(`${teamLabel(team)} подключена к Sports.ru: сделай трансфер на Sports.ru после одобрения Лиги — здесь он появится сам примерно через минуту.`);return;}
 const used=Math.max(transfersThisWeek(ctx.transfers,team,ctx.today,gameWeeks(live)),fblTransfers(ctx.transfers,team,ctx.today).used);
 if(used+moves.length>WEEKLY_TRANSFERS&&!confirm(`У ${teamLabel(team)} будет ${used+moves.length} трансфера на этой неделе при лимите ${WEEKLY_TRANSFERS}. Всё равно записать?`))return;
 const list=moves.map(m=>{const out=current(byId.get(m.outId),ctx);return {team,outId:m.outId,inId:m.player.id,date:ctx.today,outPrice:out.price,inPrice:m.player.price};});
 if(!confirm(list.map(x=>`${byId.get(x.outId).name} (${x.outPrice}) → ${byId.get(x.inId).name} (${x.inPrice})`).join('\n')+`\n\nЗаписать для ${teamLabel(team)} от ${ctx.today}? Затем отправь каждую запись в общий журнал Лиги.`))return;
 try{seasonRosters([...ctx.transfers,...list]);}catch(e){alert(e.message);return;}
 pending=[...pending,...list];writeStored('fbl-transfers',JSON.stringify(pending));replacing=null;setView('transfers');
}
function transferLog(ctx){
 const box=el('div',null,'sp-log');box.append(el('h3',`Журнал трансферов Лиги (${ctx.transfers.length})`));
 const list=el('ol');
 ctx.transfers.forEach((x,i)=>{
  const isPending=!x.source,li=el('li',`${ddmm(x.date)} · ${teamName(x.team)}: ${byId.get(x.outId)?.name} (${x.outPrice}) → ${byId.get(x.inId)?.name} (${x.inPrice}) · ${x.source==='sports.ru'?'Sports.ru':x.source==='league'?'журнал Лиги':'не отправлено'}`);
  if(isPending){li.classList.add('pending');li.append(link('Отправить в журнал ↗',issueUrl(`${teamName(x.team)}: ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`,{action:'transfer',...x}),'sp-send'));
   const del=el('button','Удалить');del.onclick=()=>{pending=pending.filter(p=>!same(p,x));writeStored('fbl-transfers',JSON.stringify(pending));renderSeason();};li.append(del);}
  else if(x.source==='league'&&same(x,league.transfers.at(-1)||{})&&!pending.length)li.append(link('Отменить в журнале ↗',issueUrl('отменить последний трансфер',{action:'undo'}),'sp-send'));
  list.append(li);});
 if(!ctx.transfers.length)list.append(el('li','Пока пусто. Записывай одобренные Лигой трансферы любой команды — составы, банк и свободные агенты пересчитаются.','muted'));
 const connected=[...ctx.connected].sort();
 box.append(el('p',connected.length?`Подключены автоматически (${connected.length}/8): ${connected.map(teamName).join(', ')}. Трансферы подтягиваются с Sports.ru примерно через минуту, цены и очки — каждые 2 часа.`:'Автоматический источник не подключён: трансферы берутся из журнала Лиги.','muted'));
 for(const w of ctx.warnings||[])box.append(el('p',`⚠️ ${w.team>=0?teamName(w.team):'Лига'}: ${w.message}`,'muted'));
 box.append(list,el('small','Записи с жёлтой меткой есть только на этом устройстве. «Отправить в журнал» открывает GitHub с готовой заявкой: после «Submit new issue» бот проверяет правила и добавляет её в общий журнал примерно за минуту. Уведомления в Telegram видят только общий журнал.','muted'));
 return box;
}

// ---------- Injuries ----------
function injuriesView(ctx){
 const own=owners(ctx),byEspn=new Map(players.filter(p=>p.espnId).map(p=>[String(p.espnId),p]));
 const toggle=el('label'),cb=el('input');cb.type='checkbox';cb.checked=onlyFbl;cb.onchange=()=>{onlyFbl=cb.checked;renderSeason();};toggle.append(cb,el('span','Только игроки в составах FBL'));
 const rows=[...injuries.entries()].map(([id,i])=>({i,p:byEspn.get(id)})).filter(r=>!onlyFbl||(r.p&&own.has(r.p.id)));
 const group=r=>r.p&&own.has(r.p.id)?own.get(r.p.id):9;
 rows.sort((a,b)=>group(a)-group(b)||String(a.i.returnDate||'9').localeCompare(String(b.i.returnDate||'9')));
 const list=el('div',null,'sp-injuries');let last=null;
 for(const r of rows){const g=group(r);if(g!==last){list.append(el('h3',g<9?teamName(g):'Не в составах FBL'));last=g;}
  const item=el('div',null,'sp-injury-item'+(/out/i.test(r.i.status)?' out':''));
  const head=el('div');head.append(el('strong',r.p?.name||r.i.name||'—'),el('span',` ${r.p?.team||''} · ${r.i.status}${r.i.type?' · '+r.i.type:''}${r.i.fantasyStatus==='OFS'?' · вне сезона':r.i.returnDate?' · возвращение ~'+ddmm(r.i.returnDate):''}`));
  item.append(head,el('small',`${r.i.comment} (${ddmm(String(r.i.date||'').slice(0,10))})`));list.append(item);}
 if(!rows.length)list.append(el('p',onlyFbl?'В составах FBL травмированных нет.':'Нет данных о травмах.','muted'));
 return [el('p',`${notes.injuries}. Даты возвращения — оценка ESPN.`,'muted'),toggle,list];
}

// ---------- Upcoming games ----------
function gamesView(ctx){
 const own=owners(ctx),byClub=new Map();
 for(const p of players){if(!own.has(p.id))continue;const c=clubOf(p);if(!byClub.has(c))byClub.set(c,[]);byClub.get(c).push(p);}
 const until=addDaysIso(ctx.today,6),days=new Map();
 for(const [club,cal] of Object.entries(live?.clubs||{}))for(const g of cal){if(g.date<ctx.today||g.date>until||!g.home)continue;if(!days.has(g.date))days.set(g.date,[]);days.get(g.date).push({home:club,away:g.opponent});}
 const week=currentWeek(ctx.today),out=[el('p',`Календарь Sports.ru (даты по Москве)${week?` · неделя ${week.n} до ${ddmm(week.end)}`:''}.`,'muted')];
 const counts=el('table',null,'standings-table'),hr=el('tr');for(const x of ['Команда','Матчей до конца недели','Матчей за 7 дней'])hr.append(el('th',x));counts.append(hr);
 ctx.rosters.forEach((ids,t)=>{let w=0,s=0;for(const id of ids){const p=byId.get(id);if(!p)continue;for(const g of live?.clubs?.[clubOf(p)]||[]){if(g.date>=ctx.today&&g.date<=until&&!g.score){s++;if(week&&g.date<=week.end)w++;}}}
  const tr=el('tr');if(t===0)tr.className='mine';for(const c of [teamName(t),String(w),String(s)])tr.append(el('td',c));counts.append(tr);});
 out.push(counts);
 for(const [day,list] of [...days].sort()){
  out.push(el('h3',new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})));
  const ul=el('ul',null,'sp-day');
  for(const g of list){const li=el('li');li.append(el('strong',`${g.away} — ${g.home}`));
   const ours=[...(byClub.get(g.away)||[]),...(byClub.get(g.home)||[])];
   if(ours.length)li.append(el('small',ours.map(p=>`${symbol(own.get(p.id))} ${p.name}${injuryText(p)?' ('+injuryText(p)+')':''}`).join(' · ')));
   ul.append(li);}
  out.push(ul);
 }
 if(!days.size)out.push(el('p','Нет данных календаря.','muted'));
 return out;
}

// League rules for every team, the appeal to the league's lawyer for each breach, and the league's «белое правило» list.
// The list is the league's decision (data/fbl-league.json "white"); marks made here wait on this device until the
// league log has them.
function whiteList(){const shared=(league.white||[]).map(String),pending=readJson('fbl-white-pending',null);return pending?pending.map(String):shared;}
function rulesView(ctx){
 const white=whiteList(),pending=readJson('fbl-white-pending',null),out=[];
 const checks=checkRules({rosters:ctx.rosters,byId,transfers:ctx.transfers,white,checked:(league.whiteChecked||[]).map(String),today:ctx.today,clubOf});
 out.push(el('h3','Правила лиги'),el('p',`Минимум один новичок (rookie) · минимум один игрок по «белому правилу» (засчитывается по отцу; кто засчитывается — решает лига) · не больше двух игроков одного клуба NBA · не больше ${checks[0].transfers.limit} трансферов за неделю лиги (пн–вс; первая неделя — от драфта до ${ddmm(checks[0].transfers.week.end)}, предсезонные трансферы входят в неё). Нарушения разбирает ${LAWYER.name}, ${LAWYER.role}.`,'muted'));
 const unmarked=checks.filter(c=>c.whiteState==='unmarked').length;
 if(unmarked)out.push(el('p',`⚠ Белое правило: выбери по одному игроку у ${unmarked} команд — кто у них закрывает правило. Дальше приложение само следит за продажами этих игроков.`,'warning'));
 const marks=new Set(white),pick=(c,value)=>{for(const p of c.roster)marks.delete(String(p.id));marks.delete(`none:${c.team}`);if(value)marks.add(value);
  writeStored('fbl-white-pending',JSON.stringify([...marks]));renderSeason();};
 const table=el('table',null,'sp-table'),head=el('tr');for(const h of ['Команда','Rookie','Белое правило','Клубы NBA','Трансферы'])head.append(el('th',h));table.append(head);
 for(const c of checks){
  const tr=el('tr');if(c.team===0)tr.className='mine';const bad=r=>c.violations.some(v=>v.rule===r);
  const t=c.transfers;
  for(const v of [c.label,bad('rookie')?'❌ нет':'✅ '+c.rookies.map(p=>p.name).join(', ')])tr.append(el('td',v));
  // One player per team is enough: the select names who satisfies the rule for this team, or the league's finding of none.
  const cell=el('td'),select=el('select');select.setAttribute('aria-label','Белое правило: '+c.label);
  for(const [value,label] of [['','— не выбран —'],...c.roster.map(p=>[String(p.id),p.name]),[`none:${c.team}`,'❌ нет такого игрока']]){const o=el('option',label);o.value=value;select.append(o);}
  select.value=c.whites[0]?String(c.whites[0].id):marks.has(`none:${c.team}`)?`none:${c.team}`:'';select.onchange=()=>pick(c,select.value);
  cell.append(c.whiteState==='ok'?'✅ ':c.whiteState==='unmarked'?'· ':'❌ ',select);
  if(c.undecided.length)cell.append(el('small',` нет решения лиги: ${c.undecided.map(p=>p.name).join(', ')}`,'muted'));tr.append(cell);
  for(const v of [bad('club')?'❌ больше двух':'✅',`${t.left}/${t.limit} осталось · обновление ${ddmm(t.resetOn)}${bad('transfers')?' · ❌ превышение':''}`])tr.append(el('td',v));
  table.append(tr);
 }
 out.push(table);
 if(pending){const save=el('a','Сохранить выбор в лиге (заявка)');save.href=issueUrl('белое правило',{action:'white',players:[...marks].map(x=>/^\d+$/.test(x)?Number(x):x)});save.target='_blank';save.rel='noopener';
  const reset=el('button','Отменить');reset.onclick=()=>{writeStored('fbl-white-pending','');renderSeason();};
  out.push(el('p','Выбор пока только на этом устройстве: чтобы его видели сторож и Telegram, сохрани его в лиге.','muted'),save,document.createTextNode(' '),reset);}
 for(const c of checks.filter(c=>c.violations.length)){
  const box=el('div',null,'sp-appeal'),text=appeal(c,ctx.today,0),area=el('textarea');area.value=text;area.rows=12;area.readOnly=true;
  const copy=el('button','Скопировать обращение');copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='Скопировано';}catch{area.select();}};
  const share=el('a','Отправить в Telegram');share.href=`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`;share.target='_blank';share.rel='noopener';
  box.append(el('h4',`⚖️ ${c.label}: обращение к ${LAWYER.name}`),...c.violations.map(v=>el('p','• '+v.text)),area,copy,document.createTextNode(' '),share);out.push(box);
 }
 if(!checks.some(c=>c.violations.length))out.push(el('p','Нарушений не найдено.','muted'));
 return out;
}
function setView(v){view=v;writeStored('fbl-season-view',v);renderSeason();window.scrollTo({top:0});}
export function renderSeason(){
 const root=$('season-body');if(!root||tab()!=='season')return;
 if(!players.length){root.replaceChildren(el('p','Загружаю базу игроков…','muted'));return;}
 if(!live&&!loading){refreshSeason();}
 const ctx=context(),week=currentWeek(ctx.today);
 $('season-status').textContent=[week?`Неделя ${week.n} (${ddmm(week.start)}–${ddmm(week.end)})`:`Сегодня ${ddmm(ctx.today)}`,notes.live,notes.injuries,notes.games,notes.league].filter(Boolean).join(' · ');
 const nav=el('nav',null,'season-nav');
 for(const [k,label] of VIEWS){const b=el('button',label);b.setAttribute('aria-pressed',String(view===k));b.onclick=()=>{replacing=null;setView(k);};nav.append(b);}
 const content=view==='teams'?teams(ctx):view==='transfers'?transfersView(ctx):view==='injuries'?injuriesView(ctx):view==='games'?gamesView(ctx):view==='rules'?rulesView(ctx):overview(ctx);
 const method=el('details',null,'plan-method');method.append(el('summary','Как считается'),el('small',`ФО за матч: прогноз сезона по формуле Sports.ru, который с каждым сыгранным матчем сдвигается к официальным ФО Sports.ru (вес прогноза = 10 матчей). Ожидаемые ФО = ФО за матч × доля матчей, которые игрок обычно играет × матчи клуба по календарю Sports.ru × шанс сыграть по отчёту ESPN (Out до даты возвращения — 0, Day-To-Day — 50%). Допустимость: позиция Sports.ru (по 2 на позицию), текущие цены, банк, минимум один rookie, лимит ${WEEKLY_TRANSFERS} трансфера в неделю (с понедельника), бюджет ${CAP}. Пакеты — точная целочисленная оптимизация. Sports.ru обновляется каждые 2 часа, травмы и матчи ESPN — при открытии, во время матчей — раз в минуту.`));
 root.replaceChildren(nav,...content,method);
}
export function initSeasonTabs(onDraft){
 const set=t=>{document.body.dataset.tab=t;writeStored('fbl-tab',t);for(const b of document.querySelectorAll('[data-tab-button]'))b.setAttribute('aria-pressed',String(b.dataset.tabButton===t));if(t==='season'){renderSeason();if(live)refreshSeason();}else onDraft?.();};
 for(const b of document.querySelectorAll('[data-tab-button]'))b.onclick=()=>set(b.dataset.tabButton);
 $('season-refresh').onclick=()=>refreshSeason();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&tab()==='season'&&live)refreshSeason();});
 set(readStored('fbl-tab')||(moscowToday()>'2026-10-18'?'season':'draft'));
}
