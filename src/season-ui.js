import {readStored,writeStored} from './storage.js';
import {teamLabel} from './teams.js';
import {CAP,WEEKLY_TRANSFERS,moscowToday,seasonRosters,bank,transfersThisWeek,perGame,horizons,current,playerOutlook,transferOptions,bestTransfers,teamPoints,parseInjuries} from './season.js';

const $=id=>document.getElementById(id);
const LIVE_URLS=['https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/data/season-live/sports-current.json',import.meta.env.BASE_URL+'data/sports-current.json'];
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const SPORTS_URL=id=>`https://www.sports.ru/fantasy/basketball/player/info/150/${id}.html`;
const fmt=n=>Math.round(n).toLocaleString('ru-RU'),signed=n=>(n>=0?'+':'−')+fmt(Math.abs(n));
function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;}

let players=[],byId=new Map(),live=null,injuries=new Map(),liveNote='',injuryNote='',card=()=>el('div');
let team=Number(readStored('fbl-season-team')||0),horizon=readStored('fbl-season-horizon')||'month',replacing=null,query='',loading=null;
const tab=()=>document.body.dataset.tab;
function loadTransfers(){try{const t=JSON.parse(readStored('fbl-transfers')||'[]');seasonRosters(t);return t;}catch{return [];}}
let transfers=loadTransfers();
function bankOverrides(){try{return JSON.parse(readStored('fbl-bank')||'{}');}catch{return {};}}
function context(){return {players,live,injuries,today:moscowToday(),rosters:seasonRosters(transfers)};}
const draftPrice=id=>{const p=byId.get(id);return live?.players?.[p?.sportsId]?.initialPrice??p?.price??0;};
function teamBank(t){const o=bankOverrides()[t];return Number.isFinite(o)?o:bank(t,transfers,draftPrice);}

async function fetchLive(){
 for(const url of LIVE_URLS){try{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)continue;const data=await r.json();if(data?.players&&data?.clubs)return data;}catch{}}
 return null;
}
export async function refreshSeason(){
 if(loading)return loading;
 $('season-status').textContent='Загружаю Sports.ru и травмы ESPN…';
 loading=Promise.all([fetchLive(),fetch(INJURY_URL).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([l,inj])=>{
  if(l){live=l;liveNote=`Sports.ru: ${new Date(l.collectedAt).toLocaleString('ru-RU')}`;}else liveNote='Sports.ru: срез недоступен, цены из базы драфта';
  if(inj){injuries=parseInjuries(inj);injuryNote=`травмы ESPN: ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;}
  else if(l?.espnInjuries){injuries=parseInjuries(l.espnInjuries);injuryNote=`травмы ESPN: срез ${new Date(l.espnInjuries.fetchedAt).toLocaleString('ru-RU')}`;}
  else injuryNote='травмы ESPN недоступны';
 }).finally(()=>{loading=null;renderSeason();});
 return loading;
}
export function setSeasonPlayers(list,cardFn){
 if(cardFn)card=cardFn;
 if(list===players||!list?.length)return;
 players=list;byId=new Map(list.map(p=>[p.id,p]));
 if(tab()==='season')renderSeason();
}
function currentWeek(today){for(const [n,w] of Object.entries(live?.weeks||{}))if(today>=w.start&&today<=w.end)return {n,...w};return null;}
function injuryText(p){const i=injuries.get(String(p.espnId));if(!i)return '';return i.status+(i.returnDate&&i.fantasyStatus!=='OFS'?` до ${i.returnDate.slice(8,10)}.${i.returnDate.slice(5,7)}`:'')+(i.fantasyStatus==='OFS'?' · вне сезона':'');}

function standings(ctx){
 const points=teamPoints(ctx,transfers),rows=ctx.rosters.map((ids,t)=>{
  const rest=ids.reduce((s,id)=>s+(byId.has(id)?playerOutlook(byId.get(id),ctx).season.points:0),0);
  return {t,points:points[t],rest,total:points[t]+rest};
 }).sort((a,b)=>b.total-a.total);
 const table=el('table',null,'standings-table'),head=el('tr');for(const h of ['#','Команда','ФО Sports.ru','Ожидается до конца','Итог (прогноз)'])head.append(el('th',h));table.append(head);
 rows.forEach((r,i)=>{const tr=el('tr');if(r.t===0)tr.className='mine';for(const c of [String(i+1),teamLabel(r.t),fmt(r.points),fmt(r.rest),fmt(r.total)])tr.append(el('td',c));tr.onclick=()=>{team=r.t;writeStored('fbl-season-team',String(team));replacing=null;renderSeason();};table.append(tr);});
 return table;
}
function playerRow(p,ctx){
 const live1=live?.players?.[p.sportsId],c=current(p,ctx),o=playerOutlook(p,ctx),g=perGame(p,live1),inj=injuryText(p);
 const box=el('details',null,'season-player');if(replacing===p.id)box.open=true;
 const sum=el('summary');
 const name=el('span',null,'sp-name');name.append(el('strong',p.name),el('small',`${c.positions.join('/')} · ${p.team||'—'}${p.isRookie?' · rookie':''}`));
 const price=el('span',null,'sp-price');const delta=Number.isFinite(live1?.price)&&Number.isFinite(live1?.initialPrice)?live1.price-live1.initialPrice:0;
 price.append(el('strong',String(c.price??'—')),el('small',delta?signed(delta):'цена'));
 const form=el('span',null,'sp-form');const last=(live1?.games||[]).filter(x=>x.played).slice(-3).map(x=>x.points);
 form.append(el('strong',g.average==null?'—':g.average.toFixed(1)),el('small',last.length?last.join(' · '):`прогноз ${g.prior.toFixed(1)}`));
 const next=el('span',null,'sp-next');next.append(el('strong',`${o.week.games.toFixed(1)} м.`),el('small',`${fmt(o[horizon].points)} ФО`));
 const row=el('div',null,'sp-row');row.append(name,price,form,next);if(inj)row.append(el('span',inj,'sp-injury'));sum.append(row);
 box.append(sum);
 const actions=el('div',null,'sp-actions');
 const find=el('button',replacing===p.id?'Скрыть замены':'Найти замену');find.onclick=e=>{e.preventDefault();replacing=replacing===p.id?null:p.id;query='';renderSeason();};
 const link=el('a','Sports.ru ↗');link.href=SPORTS_URL(p.sportsId);link.target='_blank';link.rel='noopener';
 actions.append(find,link);box.append(actions);
 if(replacing===p.id)box.append(replacementPanel(p,ctx));
 box.addEventListener('toggle',()=>{if(box.open&&!box.querySelector('.player-card'))box.append(card(p,null,true));});
 return box;
}
function optionRow(o,outId,ctx,bankMoney){
 const li=el('li',null,'sp-option'),inj=injuryText(o.player);
 const name=el('span',null,'sp-name');name.append(el('strong',o.player.name),el('small',`${o.player.positions.join('/')} · ${o.player.team||'—'} · ${o.player.price} · банк после ${o.bankAfter}${inj?' · '+inj:''}`));
 const gains=el('span',null,'sp-gains');
 for(const [k,label] of [['week','неделя'],['month','4 нед.'],['season','сезон']]){const s=el('span',null,k===horizon?'on':'');s.append(el('strong',signed(o.gain[k])),el('small',label));if(o.gain[k]<0)s.classList.add('neg');gains.append(s);}
 const take=el('button','Записать');take.onclick=()=>record(outId,o.player,ctx);
 li.append(name,gains,take);return li;
}
function replacementPanel(p,ctx){
 const box=el('div',null,'sp-replace'),money=teamBank(team);
 const used=transfersThisWeek(transfers,team,ctx.today);
 box.append(el('p',`Банк ${money} + продажа ${current(p,ctx).price} = до ${money+current(p,ctx).price} на нового игрока · трансферов на этой неделе ${used}/${WEEKLY_TRANSFERS}. Выигрыш — ожидаемые ФО новичка минус ФО ${p.name} за период (травмы и расписание Sports.ru учтены).`,'muted'));
 const search=el('input');search.placeholder='Найти любого свободного игрока на эту позицию…';search.value=query;
 const list=el('ol',null,'sp-options');
 const fill=()=>{const all=transferOptions(ctx,{team,outId:p.id,bankMoney:money,limit:query?1000:12,sort:horizon});
  const q=query.trim().toLowerCase(),shown=q?all.filter(o=>[o.player.name,o.player.sportsName,o.player.team].join(' ').toLowerCase().includes(q)).slice(0,12):all;
  list.replaceChildren(...shown.map(o=>optionRow(o,p.id,ctx,money)));if(!shown.length)list.append(el('li','Нет допустимых замен: позиция, бюджет или правило rookie.','muted'));};
 search.oninput=()=>{query=search.value;fill();};
 box.append(search,list);fill();return box;
}
function record(outId,player,ctx){
 const out=current(byId.get(outId),ctx),used=transfersThisWeek(transfers,team,ctx.today);
 if(used>=WEEKLY_TRANSFERS&&!confirm(`У ${teamLabel(team)} уже ${used} трансфера на этой неделе. Всё равно записать?`))return;
 if(!confirm(`${teamLabel(team)}: ${out.name} (${out.price}) → ${player.name} (${player.price}). Записать трансфер от ${ctx.today}?`))return;
 const next=[...transfers,{team,outId,inId:player.id,date:ctx.today,outPrice:out.price,inPrice:player.price}];
 try{seasonRosters(next);}catch(e){alert(e.message);return;}
 transfers=next;writeStored('fbl-transfers',JSON.stringify(transfers));replacing=null;renderSeason();
}
function transferLog(){
 const box=el('details',null,'sp-log');box.append(el('summary',`Журнал трансферов (${transfers.length})`));
 const list=el('ol');
 transfers.forEach((x,i)=>{const li=el('li',`${x.date} · ${teamLabel(x.team)}: ${byId.get(x.outId)?.name} (${x.outPrice}) → ${byId.get(x.inId)?.name} (${x.inPrice}) `);
  // Removing a transfer is allowed only for the latest one, so every later roster stays valid.
  if(i===transfers.length-1){const b=el('button','Отменить');b.onclick=()=>{if(confirm('Удалить последний трансфер из журнала?')){transfers=transfers.slice(0,-1);writeStored('fbl-transfers',JSON.stringify(transfers));renderSeason();}};li.append(b);}
  list.append(li);});
 if(!transfers.length)list.append(el('li','Пока пусто. Записывай одобренные Лигой трансферы любой команды — составы и банк пересчитаются.','muted'));
 const copy=el('button','Скопировать журнал');copy.onclick=async()=>{try{await navigator.clipboard.writeText(transfers.map(x=>`${x.date} ${teamLabel(x.team)}: ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`).join('\n'));copy.textContent='Скопировано ✓';}catch{}};
 box.append(list,copy);return box;
}
export function renderSeason(){
 const root=$('season-body');if(!root||tab()!=='season')return;
 if(!players.length){root.replaceChildren(el('p','Загружаю базу игроков…','muted'));return;}
 if(!live&&!loading){refreshSeason();}
 const ctx=context(),h=horizons(ctx),week=currentWeek(ctx.today);
 $('season-status').textContent=[week?`Неделя ${week.n} (${week.start.slice(8)}.${week.start.slice(5,7)}–${week.end.slice(8)}.${week.end.slice(5,7)})`:`Сегодня ${ctx.today}`,liveNote,injuryNote].filter(Boolean).join(' · ');
 const head=el('div',null,'sp-controls');
 const pickTeam=el('select');for(let t=0;t<8;t++){const o=el('option',teamLabel(t));o.value=String(t);pickTeam.append(o);}pickTeam.value=String(team);
 pickTeam.onchange=()=>{team=Number(pickTeam.value);writeStored('fbl-season-team',String(team));replacing=null;renderSeason();};
 const pickH=el('select');for(const [k,v] of Object.entries(h)){const o=el('option',v.label);o.value=k;pickH.append(o);}pickH.value=horizon;
 pickH.onchange=()=>{horizon=pickH.value;writeStored('fbl-season-horizon',horizon);renderSeason();};
 const bankInput=el('input');bankInput.type='number';bankInput.value=String(teamBank(team));bankInput.title='Остаток на счету в Sports.ru';
 bankInput.onchange=()=>{const o=bankOverrides(),v=Number(bankInput.value);if(bankInput.value===''||!Number.isFinite(v))delete o[team];else o[team]=v;writeStored('fbl-bank',JSON.stringify(o));renderSeason();};
 const labelled=(t,node)=>{const l=el('label');l.append(el('span',t),node);return l;};
 head.append(labelled('Команда',pickTeam),labelled('Горизонт',pickH),labelled('Банк',bankInput));
 const roster=ctx.rosters[team].map(id=>byId.get(id)).filter(Boolean);
 const spent=roster.reduce((s,p)=>s+(current(p,ctx).price||0),0);
 const info=el('p',`Состав по текущим ценам ${spent} · банк ${teamBank(team)}${Number.isFinite(bankOverrides()[team])?' (введён вручную)':' (расчёт: 20 000 − цены драфта ± трансферы)'} · трансферов на неделе ${transfersThisWeek(transfers,team,ctx.today)}/${WEEKLY_TRANSFERS}`,'muted');
 const list=el('div',null,'sp-roster');
 const header=el('div',null,'sp-header');for(const t of ['Игрок','Цена','ФО ср. · последние','Неделя · '+h[horizon].label.toLowerCase()])header.append(el('span',t));
 list.append(header,...roster.map(p=>playerRow(p,ctx)));
 const best=bestTransfers(ctx,{team,bankMoney:teamBank(team),sort:horizon});
 const ideas=el('div',null,'sp-best');ideas.append(el('h3','Лучшие трансферы'));
 if(best.length){const ol=el('ol',null,'sp-options');for(const b of best){const li=optionRow(b,b.outId,ctx,teamBank(team));li.querySelector('.sp-name strong').textContent=`${byId.get(b.outId).name} → ${b.player.name}`;ol.append(li);}ideas.append(ol);}
 else ideas.append(el('p',`Ни одна замена не даёт прироста за период «${h[horizon].label.toLowerCase()}».`,'muted'));
 const method=el('details',null,'plan-method');method.append(el('summary','Как считается'),el('small',`ФО за матч: прогноз сезона по формуле Sports.ru, который с каждым сыгранным матчем сдвигается к официальным ФО Sports.ru (вес прогноза = 10 матчей). Ожидаемые ФО = ФО за матч × доля матчей, которые игрок обычно играет × матчи клуба по календарю Sports.ru за период × шанс сыграть по отчёту ESPN (Out до даты возвращения — 0, Day-To-Day — 50%). Допустимость: позиция Sports.ru (по 2 на позицию), текущие цены, банк, минимум один rookie. Лимит ${WEEKLY_TRANSFERS} трансфера в неделю (с понедельника). Лимит бюджета ${CAP}.`));
 root.replaceChildren(head,info,list,ideas,el('h3','Таблица Лиги'),standings(ctx),transferLog(),method);
}
export function initSeasonTabs(onDraft){
 const set=t=>{document.body.dataset.tab=t;writeStored('fbl-tab',t);for(const b of document.querySelectorAll('[data-tab-button]'))b.setAttribute('aria-pressed',String(b.dataset.tabButton===t));if(t==='season')renderSeason();else onDraft?.();};
 for(const b of document.querySelectorAll('[data-tab-button]'))b.onclick=()=>set(b.dataset.tabButton);
 $('season-refresh').onclick=()=>refreshSeason();
 set(readStored('fbl-tab')||(moscowToday()>'2026-10-18'?'season':'draft'));
}
