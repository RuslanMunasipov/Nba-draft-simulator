import {readStored,writeStored} from './storage.js';
import {teamLabel,teamName} from './teams.js';
import {CAP,WEEKLY_TRANSFERS,moscowToday,seasonRosters,bank,transfersThisWeek,perGame,horizons,current,playerOutlook,transferOptions,bestTransfers,bestPackage,marketAlerts,teamPoints,parseInjuries,allTransfers} from './season.js';
import {fetchLiveGames,moscowDate} from './live.js';

const $=id=>document.getElementById(id);
const REPO='RuslanMunasipov/Nba-draft-simulator';
const LIVE_URLS=[`https://raw.githubusercontent.com/${REPO}/data/season-live/sports-current.json`,import.meta.env.BASE_URL+'data/sports-current.json'];
const LEAGUE_URL=`https://raw.githubusercontent.com/${REPO}/main/data/fbl-league.json`;
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const SPORTS_URL=id=>`https://www.sports.ru/fantasy/basketball/player/info/150/${id}.html`;
const VIEWS=[['overview','Обзор'],['teams','Команды'],['transfers','Трансферы'],['injuries','Травмы'],['games','Матчи']];
const fmt=n=>Math.round(n).toLocaleString('ru-RU'),signed=n=>(n>=0?'+':'−')+fmt(Math.abs(n));
const ddmm=d=>d?`${d.slice(8,10)}.${d.slice(5,7)}`:'';
const addDaysIso=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const symbol=t=>teamName(t).split(' ')[0];
function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;}
function link(textValue,href,cls){const a=el('a',textValue,cls);a.href=href;a.target='_blank';a.rel='noopener';return a;}

let players=[],byId=new Map(),live=null,injuries=new Map(),league={transfers:[],banks:{}},games=[],card=()=>el('div');
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
function transfersLeft(ctx,t){const x=sportsTeam(t)?.transfersLeft;return Number.isFinite(x)?x:Math.max(0,WEEKLY_TRANSFERS-transfersThisWeek(ctx.transfers,t,ctx.today));}
const draftPrice=id=>{const p=byId.get(id);return live?.players?.[p?.sportsId]?.initialPrice??p?.price??0;};
function teamBank(t,list=transfers()){const local=readJson('fbl-bank',{})[t];if(Number.isFinite(local))return local;const sports=sportsTeam(t)?.balance;if(Number.isFinite(sports))return sports;const shared=league.banks?.[t];if(Number.isFinite(shared))return shared;return bank(t,list,draftPrice);}
function context(){const m=merged(),list=m.transfers;return {players,live,injuries,today:moscowToday(),rosters:seasonRosters(list),transfers:list,warnings:m.warnings,connected:m.connected};}
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
  if(l){live=l;notes.live=`Sports.ru ${stamp(l.collectedAt)}`;}else notes.live='Sports.ru недоступен, цены драфта';
  if(inj){injuries=parseInjuries(inj);notes.injuries=`травмы ESPN ${stamp(Date.now())}`;}
  else if(live?.espnInjuries){injuries=parseInjuries(live.espnInjuries);notes.injuries=`травмы ESPN ${stamp(live.espnInjuries.fetchedAt)}`;}
  else notes.injuries='травмы недоступны';
  if(lg?.transfers)league=lg;
  const connected=merged().connected.size;notes.league=(live?.yahoo?`Yahoo ${stamp(live.yahoo.fetchedAt)} · `:live?.yahooStatus?'Yahoo недоступен · ':'')+`команд подключено: ${connected}/8`;
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
 if(list===players||!list?.length)return;
 players=list;byId=new Map(list.map(p=>[p.id,p]));
 if(tab()==='season')renderSeason();
}
function currentWeek(today){for(const [n,w] of Object.entries(live?.weeks||{}))if(today>=w.start&&today<=w.end)return {n,...w};return null;}
function injuryText(p){const i=injuries.get(String(p.espnId));if(!i)return '';return i.status+(i.fantasyStatus==='OFS'?' · вне сезона':i.returnDate?` до ${ddmm(i.returnDate)}`:'');}
// Running points from ESPN box scores for games Sports.ru has not counted yet.
function livePoints(){
 const out=new Map();
 for(const g of games){if(!g.points)continue;const day=moscowDate(g.date);
  for(const p of players){const x=g.points[String(p.espnId)];if(!x)continue;
   const official=(live?.players?.[p.sportsId]?.games||[]).some(o=>o.date===day&&o.played);
   if(!official)out.set(p.id,{...x,game:g});}}
 return out;
}

// ---------- Overview ----------
function standingsTable(ctx,running){
 const official=teamPoints(ctx,ctx.transfers),h=horizons(ctx);
 const rows=ctx.rosters.map((ids,t)=>{
  const now=ids.reduce((s,id)=>s+(running.get(id)?.points||0),0);
  let rest=0,week=0;for(const id of ids){const p=byId.get(id);if(!p)continue;const o=playerOutlook(p,ctx);rest+=o.season.points;week+=o.week.games;}
  return {t,official:official[t],now,rest,week,total:official[t]+now+rest};
 }).sort((a,b)=>(b.official+b.now)-(a.official+a.now)||b.total-a.total);
 const table=el('table',null,'standings-table'),head=el('tr');
 for(const x of ['#','Команда','ФО','Сейчас','Матчей до вс','Прогноз итога'])head.append(el('th',x));table.append(head);
 rows.forEach((r,i)=>{const tr=el('tr');if(r.t===0)tr.className='mine';
  for(const c of [String(i+1),teamName(r.t),fmt(r.official),r.now?signed(r.now):'—',r.week.toFixed(1),fmt(r.total)])tr.append(el('td',c));
  tr.onclick=()=>{team=r.t;writeStored('fbl-season-team',String(team));setView('teams');};table.append(tr);});
 const box=el('div');box.append(table,el('small',`ФО — официальные очки Sports.ru (игрок считается, только пока он в команде). «Сейчас» — матчи, которые Sports.ru ещё не засчитал: протоколы ESPN по формуле Sports.ru. «Матчей до вс» — ожидаемые игры состава с учётом травм. Прогноз итога добавляет ожидание до ${ddmm(h.season.to)}. Нажми на команду, чтобы открыть состав.`,'muted'));
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
 for(const a of alerts.slice(0,3)){const out=byId.get(a.outId);const p=el('p');p.append(el('strong','📈 Усиление на рынке: '),document.createTextNode(`${out.name} → ${a.player.name}: ${signed(a.gain.month)} ФО за 4 недели, ${signed(a.gain.season)} за сезон.`));box.append(p);}
 for(const p of hurt)box.append(el('p',`🩹 ${p.name}: ${injuryText(p)}`));
 const go=el('button','Открыть помощника по трансферам');go.onclick=()=>{team=0;writeStored('fbl-season-team','0');setView('transfers');};box.append(go);
 return box;
}
function overview(ctx){const running=livePoints();return [alertsBlock(ctx),el('h3','Таблица Лиги'),standingsTable(ctx,running),liveGamesBlock(ctx),topPlayers(ctx)];}

// ---------- Teams ----------
function playerRow(p,ctx,running){
 const live1=live?.players?.[p.sportsId],c=current(p,ctx),o=playerOutlook(p,ctx),g=perGame(p,live1),inj=injuryText(p),now=running?.get(p.id);
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
 const li=el('li',null,'sp-option'),inj=injuryText(o.player);
 const name=el('span',null,'sp-name');name.append(el('strong',title||o.player.name),el('small',`${o.player.positions.join('/')} · ${o.player.team||'—'} · ${o.player.price} · банк после ${o.bankAfter}${inj?' · '+inj:''}`));
 const take=el('button','Записать');take.onclick=()=>record([{outId,player:o.player}],ctx);
 li.append(name,gainCells(o.gain),take);return li;
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
  item.append(ul,el('small',`Банк после: ${p.bankAfter}${p.pairs.length>left?' · больше, чем осталось на этой неделе':''}`,'muted'));
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
 sel.onchange=()=>{replacing=Number(sel.value)||null;query='';renderSeason();};
 pick.append(sel);if(replacing&&ctx.rosters[team].includes(replacing))pick.append(replacementPanel(byId.get(replacing),ctx));
 return [controls(ctx),packageBlock(ctx),alertBox,singles,pick,transferLog(ctx),...(live?.yahoo?[]:[yahooHelper()])];
}
// One-time Yahoo connection from a tablet: consent page for the app's Client ID, then the GitHub workflow that stores the token.
function yahooHelper(){
 const box=el('details',null,'sp-log');box.append(el('summary','Подключить лигу Yahoo (все трансферы автоматически)'));
 const status=live?.yahooStatus;
 if(status?.error==='not_approved'){
  // Since July 2026 Yahoo serves Fantasy data only to apps it approved; consent alone gets a token but every call answers 403.
  const warn=el('div',null,'sp-alerts');warn.append(el('h3','Yahoo не одобрил приложение для Fantasy API'),
   el('p',`Проверено ${stamp(status.checkedAt)}: вход и токен работают, но Yahoo отвечает 403 «not authorized» на любой запрос, даже публичный. С июля 2026 Yahoo даёт Fantasy API только одобренным приложениям. Повторное «Agree» не поможет.`));
  const todo=el('ol');
  const a=el('li');a.append(link('Подать заявку на доступ ↗','https://sports.yahoo.com/developer/access/'),document.createTextNode(' и подписать соглашение из письма (DocuSign).'));
  const b=el('li','После одобрения создать НОВОЕ приложение на developer.yahoo.com (старые Yahoo не включает).');
  const c=el('li');c.append(document.createTextNode('Отправить Client ID и App ID нового приложения через '),link('форму подтверждения ↗','https://sports.yahoo.com/developer/application-confirmation/'),document.createTextNode('.'));
  const d=el('li','Заменить секреты YAHOO_CLIENT_ID и YAHOO_CLIENT_SECRET в GitHub и пройти шаги ниже с новым Client ID. Сбор данных проверяет доступ каждые 2 часа.');
  todo.append(a,b,c,d);warn.append(todo);box.append(warn);box.open=true;
 }else if(status)box.append(el('p',`Yahoo ${stamp(status.checkedAt)}: ${status.message}`,'warning'));
 const id=el('input');id.placeholder='Client ID приложения Yahoo';id.value=readStored('fbl-yahoo-client')||'';
 const redirect=el('input');redirect.placeholder='Redirect URI — оставь пустым: Yahoo сам покажет код';redirect.value=readStored('fbl-yahoo-redirect')||'';
 const go=link('2. Открыть Yahoo и нажать «Agree» ↗','#');
 const update=()=>{writeStored('fbl-yahoo-client',id.value.trim());writeStored('fbl-yahoo-redirect',redirect.value.trim());
  go.href=`https://api.login.yahoo.com/oauth2/request_auth?client_id=${encodeURIComponent(id.value.trim())}&redirect_uri=${encodeURIComponent(redirect.value.trim()||'oob')}&response_type=code&scope=fspt-r&language=en-us&state=${encodeURIComponent(redirect.value.trim()||'oob')}`;};
 id.oninput=update;redirect.oninput=update;update();
 const steps=el('ul');
 const s1=el('li','1. Вставь Client ID (он не секретный; Client Secret сюда не вводи):');s1.append(id,redirect);
 const s2=el('li');s2.append(go);
 const s3=el('li');s3.append(document.createTextNode('3. Скопируй код от Yahoo, открой '),link('workflow «Connect Yahoo league» ↗',`https://github.com/${REPO}/actions/workflows/yahoo-connect.yml`),document.createTextNode(' → Run workflow → вставь код → Run. Через минуту запусти сбор данных или подожди до 2 часов.'));
 steps.append(s1,s2,s3);box.append(steps);return box;
}
function record(moves,ctx){
 if(sportsTeam(team)){alert(`${teamLabel(team)} подключена к Sports.ru: сделай трансфер на Sports.ru после одобрения Лиги — здесь он появится сам при следующем обновлении (до 2 часов).`);return;}
 const used=transfersThisWeek(ctx.transfers,team,ctx.today);
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
  const isPending=!x.source,li=el('li',`${ddmm(x.date)} · ${teamName(x.team)}: ${byId.get(x.outId)?.name} (${x.outPrice}) → ${byId.get(x.inId)?.name} (${x.inPrice}) · ${x.source==='yahoo'?'Yahoo':x.source==='sports.ru'?'Sports.ru':x.source==='league'?'журнал Лиги':'не отправлено'}`);
  if(isPending){li.classList.add('pending');li.append(link('Отправить в журнал ↗',issueUrl(`${teamName(x.team)}: ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`,{action:'transfer',...x}),'sp-send'));
   const del=el('button','Удалить');del.onclick=()=>{pending=pending.filter(p=>!same(p,x));writeStored('fbl-transfers',JSON.stringify(pending));renderSeason();};li.append(del);}
  else if(x.source==='league'&&same(x,league.transfers.at(-1)||{})&&!pending.length)li.append(link('Отменить в журнале ↗',issueUrl('отменить последний трансфер',{action:'undo'}),'sp-send'));
  list.append(li);});
 if(!ctx.transfers.length)list.append(el('li','Пока пусто. Записывай одобренные Лигой трансферы любой команды — составы, банк и свободные агенты пересчитаются.','muted'));
 const connected=[...ctx.connected].sort();
 box.append(el('p',connected.length?`Подключены автоматически (${connected.length}/8): ${connected.map(teamName).join(', ')}. Трансферы подтягиваются сами каждые 2 часа${live?.yahoo?' из лиги Yahoo, цены и бюджет проверяются по Sports.ru':' с Sports.ru'}.`:'Автоматический источник не подключён: трансферы берутся из журнала Лиги.','muted'));
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
 const counts=el('table',null,'standings-table'),hr=el('tr');for(const x of ['Команда','Матчей до вс','Матчей за 7 дней'])hr.append(el('th',x));counts.append(hr);
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

function setView(v){view=v;writeStored('fbl-season-view',v);renderSeason();window.scrollTo({top:0});}
export function renderSeason(){
 const root=$('season-body');if(!root||tab()!=='season')return;
 if(!players.length){root.replaceChildren(el('p','Загружаю базу игроков…','muted'));return;}
 if(!live&&!loading){refreshSeason();}
 const ctx=context(),week=currentWeek(ctx.today);
 $('season-status').textContent=[week?`Неделя ${week.n} (${ddmm(week.start)}–${ddmm(week.end)})`:`Сегодня ${ddmm(ctx.today)}`,notes.live,notes.injuries,notes.games,notes.league].filter(Boolean).join(' · ');
 const nav=el('nav',null,'season-nav');
 for(const [k,label] of VIEWS){const b=el('button',label);b.setAttribute('aria-pressed',String(view===k));b.onclick=()=>{replacing=null;setView(k);};nav.append(b);}
 const content=view==='teams'?teams(ctx):view==='transfers'?transfersView(ctx):view==='injuries'?injuriesView(ctx):view==='games'?gamesView(ctx):overview(ctx);
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
