// Season → Игроки: the Sports.ru market by this season's FBL points, streaks and the swap analyser.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {WEEKLY_TRANSFERS,bank,perGame,current,explainSwap} from '../season.js';
import {seasonForm,swapAnalyzer,takenIds,STREAK} from '../season.js';
import {playerSearchMatches} from '../player-search.js';
import {fblGame} from '../standings.js';
import {int,dec,signed,count,ddmm} from '../format.js';
import {openPlayerSheet} from '../sheet.js';
import {$,readJson,PERIOD,PERIOD_LONG,PERIOD_SHORT,SPORTS_URL,basePlayers,button,byId,card,clubOf,confidenceBadge,el,forGains,games,horizon,injuries,injuryInfo,link,live,livePoints,needsLive,owners,players,rawLive,renderSeason,same,team,teamBank,transfersLeft} from './state.js';
import {controls,courtWord,whyBox} from './widgets.js';
import {POSITIONS} from '../engine.js';
import {planValue} from '../transfer-plan.js';
import {withFace} from '../headshot.js';
import {teamTag} from '../team-logo.js';

// ---------- Players: the Sports.ru market by this season's FBL points ----------
// Free players (or every player) ranked by their average FBL points in this season's games, with a streak mark
// (season.js seasonForm), the best one-for-one swap that brings each one to the team chosen above over the chosen period
// and the model's confidence in it (swapAnalyzer, explainSwap), and the Sports.ru price. The filters stay on this device.
const MARKET_PAGE=40,MARKET_DEFAULT={scope:'free',pos:'all',minGames:1,maxPrice:0,sort:'avg',streaks:false,rookies:false};
let market={...MARKET_DEFAULT,...readJson('fbl-market',{})},marketQuery='',marketShown=MARKET_PAGE;
const saveMarket=()=>writeStored('fbl-market',JSON.stringify(market));
// One analyser per data snapshot, team, period and bank: it answers per player and remembers, so a page asks only for the
// rows it shows (sorting by it asks for every row). Sports.ru's snapshot, not each live tick, is in the key.
let analyzerKey=null,analyzerFn=null;const whyMemo=new Map();
function analyzer(ctx,money){
 const key=[basePlayers,rawLive,injuries,ctx.transfers,ctx.today,team,horizon,money];
 if(!analyzerKey||key.some((v,i)=>v!==analyzerKey[i])){analyzerKey=key;analyzerFn=swapAnalyzer(ctx,{team,bankMoney:money,sort:horizon});whyMemo.clear();}
 return analyzerFn;
}
function swapWhy(ctx,best){const k=best.outId+'>'+best.player.id;if(!whyMemo.has(k))whyMemo.set(k,explainSwap(ctx,best.outId,best.player.id,horizon,null,team));return whyMemo.get(k);}
function marketRows(ctx){
 const taken=takenIds(ctx),own=owners(ctx),out=[];
 for(const p of players){
  const row=live?.players?.[p.sportsId];if(!row)continue;
  const owner=own.has(p.id)?own.get(p.id):taken.has(p.id)?-1:null;
  if(market.scope==='free'&&owner!==null)continue;
  out.push({p,c:current(p,ctx),row,owner,form:seasonForm(p,row)});
 }
 return out;
}
const avgOf=r=>r.form.average??-Infinity;
const streakRank=r=>!r.form.streak?0:r.form.streak.kind==='hot'?100+r.form.streak.length:-100-r.form.streak.length;
function marketSorted(all,analyse){
 const q=marketQuery.trim();
 const rows=all.filter(r=>(market.pos==='all'||r.c.positions.includes(market.pos))&&r.form.games>=market.minGames&&(!market.maxPrice||r.c.price<=market.maxPrice)
  &&(!market.streaks||r.form.streak)&&(!market.rookies||r.p.isRookie===true)&&(!q||playerSearchMatches(r.p,q)));
 const gainOf=r=>r.owner===null?analyse(r.p.id)?.best?.gain[horizon]??-Infinity:-Infinity;
 const byAvg=(a,b)=>avgOf(b)-avgOf(a)||b.form.games-a.form.games||(b.p.forecast?.meanPerGame??0)-(a.p.forecast?.meanPerGame??0);
 const order={avg:byAvg,form:(a,b)=>streakRank(b)-streakRank(a)||byAvg(a,b),gain:(a,b)=>gainOf(b)-gainOf(a)||byAvg(a,b),price:(a,b)=>b.c.price-a.c.price||byAvg(a,b)}[market.sort]||byAvg;
 return rows.sort(order);
}
const streakWord=s=>`${count(s.length,'матч','матча','матчей')} подряд`;
function streakChip(s,norm){
 const c=el('span',(s.kind==='hot'?'🔥 ':'🧊 ')+streakWord(s),'chip chip--'+s.kind);
 c.title=`${streakWord(s)} ${s.kind==='hot'?'выше':'ниже'} прогноза (${dec(norm)} ФО) на ${Math.round(Math.abs(1-(s.kind==='hot'?STREAK.hot:STREAK.cold))*100)}% и минимум на ${STREAK.margin} ФО`;
 return c;
}
// The last games as small columns on one scale per player, with the pre-season forecast as a hairline: hot games warm,
// cold ones cool, the rest neutral. The table under the row has the same numbers.
function sparkBars(form){
 const max=Math.max(10,(form.norm||0)*1.6,...form.last.map(g=>g.points)),wrap=el('span',null,'mk-spark');
 wrap.setAttribute('role','img');
 wrap.setAttribute('aria-label',`Последние матчи: ${form.last.map(g=>int(g.points)).join(', ')} ФО${form.norm!=null?`, прогноз ${dec(form.norm)}`:''}`);
 if(form.norm!=null){const n=el('i',null,'mk-norm');n.style.bottom=Math.min(100,form.norm/max*100)+'%';wrap.append(n);}
 for(const g of form.last){const b=el('b',null,'mk-bar '+g.state);b.style.height=Math.max(8,Math.max(0,g.points)/max*100)+'%';
  b.title=`${ddmm(g.date)}${g.opponent?' · '+g.opponent:''} · ${int(g.points)} ФО${g.minutes?' · '+g.minutes+' мин':''}`;wrap.append(b);}
 return wrap;
}
const RULE_NOTE={club:['лимит клуба',r=>`уже 2 игрока ${clubOf(r.p)||r.p.team}`],rookie:['правило rookie',()=>'без него в составе не останется новичка'],
 white:['белое правило',()=>'в составе не останется игрока из белого списка'],position:['не по позиции',()=>'']};
function analyzerCell(r,ctx,analyse){
 const cell=el('span',null,'mk-ana'),note=t=>el('small',t,'mk-ana-note');
 if(r.owner!==null){cell.append(note(r.owner===team?`в составе «${teamName(team)}»`:'уже в команде FBL'));return cell;}
 const a=analyse(r.p.id);
 if(!a){cell.append(note('—'));return cell;}
 if(a.best){const g=a.best.gain[horizon],out=byId.get(a.best.outId)?.name||'—';
  // The transfer assistant's rule (src/transfer-plan.js): the swap pays for its transfer or not.
  if(g>0){cell.append(confidenceBadge(swapWhy(ctx,a.best)),note(`вместо ${out} · ${signed(g)} ${PERIOD_SHORT[horizon]}`));
   if(planValue(a.best.gain,undefined,ctx)<=0)cell.append(note('не окупает трансфер'));}
  else cell.append(el('span','не усилит','chip'),note(`даже вместо ${out}: ${signed(g)} ${PERIOD_SHORT[horizon]}`));
  return cell;}
 if(a.reason==='money'){cell.append(el('span','не по карману','chip'),note(`не хватает ${int(a.need)}`));return cell;}
 const [label,line]=RULE_NOTE[a.reason]||RULE_NOTE.position,t=line(r);cell.append(el('span',label,'chip'));if(t)cell.append(note(t));return cell;
}
function marketRow(r,i,ctx,analyse,running){
 const {p,c,row,form}=r,inj=injuryInfo(p),now=running.get(p.id);
 const box=el('details',null,'mk-row'+(form.streak?' is-'+form.streak.kind:''));box.dataset.key='mk:'+p.id;
 const sum=el('summary',null,'mk-sum'),who=el('span',null,'mk-text');
 who.append(el('strong',p.name));if(row.fullName)who.append(el('small',row.fullName,'mk-ru'));
 const tags=[];
 if(form.streak)tags.push(streakChip(form.streak,form.norm));
 if(now)tags.push(el('span',`в игре ${int(now.points)}${courtWord(now)}`,'chip chip--live'));
 if(inj)tags.push(el('span',inj.text,'chip '+(inj.level==='out'?'chip--danger':'chip--warn')));
 if(p.isRookie)tags.push(el('span','rookie','chip'));
 if(r.owner!==null){const c=el('span',r.owner===team?'твой':r.owner>=0?null:'в FBL','chip chip--info');if(r.owner!==team&&r.owner>=0)c.append(teamTag(r.owner,'xs'));tags.push(c);}
 if(tags.length){const t=el('span',null,'mk-tags');t.append(...tags);who.append(t);}
 who.append(el('small',`${p.team||'—'} · ${c.positions.join('/')} · ${int(c.price)}`,'mk-meta'));
 const avg=el('span',null,'mk-avg'),fig=el('span',null,'mk-fig');
 fig.append(el('strong',form.average!=null?dec(form.average):'—'),el('small',form.games?`${count(form.games,'матч','матча','матчей')} · ${dec(form.minutes)} мин`:`не играл · прогноз ${dec(perGame(p,row).value)}`));
 avg.append(fig);if(form.last.length)avg.append(sparkBars(form));
 const price=el('span',null,'mk-price'),delta=Number.isFinite(row.price)&&Number.isFinite(row.initialPrice)?row.price-row.initialPrice:0;
 price.append(el('strong',int(c.price)));if(delta){const d=el('small',(delta>0?'▲ ':'▼ ')+int(Math.abs(delta)),delta>0?'up':'down');d.title='Изменение цены с начала сезона';price.append(d);}
 sum.append(el('span',String(i+1),'mk-rank'),withFace(p,who,'md','mk-who'),el('span',p.team||'—','mk-club'),el('span',c.positions.join('/'),'mk-pos'),avg,analyzerCell(r,ctx,analyse),price);
 box.append(sum);
 box.addEventListener('toggle',()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';box.append(marketDetails(r,ctx,analyse));});
 return box;
}
function marketDetails(r,ctx,analyse){
 const box=el('div',null,'mk-details'),games=(r.row.games||[]).filter(fblGame).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,10);
 if(games.length){
  const t=el('table',null,'sports-table mk-games'),h=el('tr');for(const x of ['Дата','Соперник','Мин','ФО','К прогнозу'])h.append(el('th',x));t.append(h);
  for(const g of games){const tr=el('tr'),d=r.form.norm!=null?g.points-r.form.norm:null;for(const v of [ddmm(g.date),g.opponent||'—',String(g.minutes??'—'),int(g.points),d==null?'—':signed(d)])tr.append(el('td',v));t.append(tr);}
  const wrap=el('div',null,'table-scroll');wrap.append(t);box.append(el('h4','Матчи сезона'),wrap);
 }else box.append(el('p','В этом сезоне ещё не играл.','muted'));
 if(r.form.norm!=null)box.append(el('p',`Прогноз до сезона — ${dec(r.form.norm)} ФО за матч, с учётом сыгранного — ${dec(perGame(r.p,r.row).value)}.`,'muted'));
 const a=r.owner===null?analyse(r.p.id):null;
 if(a?.best&&a.best.gain[horizon]>0)box.append(whyBox(swapWhy(ctx,a.best),ctx));
 const actions=el('div',null,'sp-actions');actions.append(button('Досье игрока',()=>openPlayerSheet(r.p,card),'btn-ghost btn-sm'),link('Sports.ru ↗',SPORTS_URL(r.p.sportsId)));box.append(actions);
 return box;
}
export function playersView(base){
 const ctx=forGains(base),wait=needsLive('Игроки');if(wait)return [controls(ctx),...wait];
 const money=teamBank(team,ctx.transfers),left=transfersLeft(ctx,team),analyse=analyzer(ctx,money),running=livePoints(),all=marketRows(ctx);
 const set=(key,v)=>{market[key]=v;marketShown=MARKET_PAGE;saveMarket();renderSeason();};
 const seg=(label,items,key,cls='')=>{const g=el('div',null,'segmented mk-seg '+cls);g.setAttribute('role','group');g.setAttribute('aria-label',label);
  for(const [v,t] of items){const b=button(t,()=>set(key,v),'');b.setAttribute('aria-pressed',String(market[key]===v));g.append(b);}return g;};
 const pick=(label,items,key)=>{const l=el('label',null,'mk-select'),s=el('select');for(const [v,t] of items){const o=el('option',t);o.value=String(v);s.append(o);}
  s.value=String(market[key]);s.onchange=()=>set(key,Number(s.value));l.append(el('span',label),s);return l;};
 const head=el('div',null,'mk-head'),title=el('div'),total=el('span',null,'chip');
 title.append(el('p','Рынок Sports.ru','eyebrow'),el('h3',market.scope==='free'?'Свободные игроки':'Все игроки'));head.append(title,total);
 const search=el('label',null,'mk-search'),input=el('input');input.type='search';input.enterKeyHint='search';input.autocomplete='off';
 input.placeholder='Игрок или клуб NBA';input.value=marketQuery;input.setAttribute('aria-label','Поиск игрока: имя по-русски или по-английски, клуб');search.append(input);
 const streaks=el('label',null,'check mk-check'),cb=el('input');cb.type='checkbox';cb.checked=market.streaks;cb.onchange=()=>set('streaks',cb.checked);streaks.append(cb,'Только стрики');
 const rookies=el('label',null,'check mk-check'),rb=el('input');rb.type='checkbox';rb.checked=market.rookies;// Most rookies have not played yet: the rookie filter starts with any number of games, or it would hide them.
 rb.onchange=()=>{if(rb.checked)market.minGames=0;set('rookies',rb.checked);};rookies.append(rb,'Только новички');
 const filters=el('div',null,'mk-filters');
 filters.append(seg('Кто',[['free','Свободные'],['all','Все']],'scope'),seg('Позиция',[['all','Все'],...POSITIONS.map(x=>[x,x])],'pos','mk-pos-seg'),
  pick('Матчей',[[0,'любое'],[1,'от 1'],[3,'от 3'],[5,'от 5'],[10,'от 10']],'minGames'),
  pick('Цена до',[[0,'любая'],[1300,'1 300'],[1500,'1 500'],[1800,'1 800'],[2200,'2 200'],[2800,'2 800']],'maxPrice'),streaks,rookies);
 const sortRow=el('div',null,'mk-sort');sortRow.append(el('span','Сортировка','mk-label'),seg('Сортировка',[['avg','ФО/матч'],['form','Стрики'],['gain','Анализатор'],['price','Цена']],'sort'));
 const info=el('p',`Анализатор — лучший обмен один на один для «${teamName(team)}» ${PERIOD_LONG[horizon]}: банк ${int(money)}, трансферов ${left===Infinity?'без лимита':left+' из '+WEEKLY_TRANSFERS}. Нажми на игрока — матчи сезона и разбор обмена.`,'sp-note');
 // With the rookie filter: the chosen team's own rookies by the same numbers, to see whether a free one is better.
 const mine=market.rookies?(ctx.rosters[team]||[]).map(id=>byId.get(id)).filter(p=>p?.isRookie===true):[];
 const rookieNote=market.rookies?el('p',mine.length?`${mine.length>1?'Новички':'Новичок'} в составе «${teamName(team)}»: `+mine.map(p=>{const f=seasonForm(p,live?.players?.[p.sportsId]);
   return `${p.name} — ${f.average!=null?dec(f.average)+' ФО/матч, '+count(f.games,'матч','матча','матчей'):'ещё не играл'}`;}).join('; ')+'. Продать единственного новичка можно только за другого новичка.'
  :`В составе «${teamName(team)}» нет новичка — правило обязательного новичка нарушено.`,mine.length?'sp-note':'warning'):null;
 // Rookies of the database Sports.ru's market does not list (its catalog of 17.10 plus the FBL rosters) cannot be shown.
 const unlisted=market.rookies?basePlayers.filter(p=>p.isRookie===true&&!live?.players?.[p.sportsId]).length:0;
 if(rookieNote&&unlisted)rookieNote.append(` Новичков из базы, которых нет в каталоге рынка Sports.ru, — ${int(unlisted)}: их здесь не видно.`);
 const games=Math.max(0,...all.map(r=>r.form.games)),early=games<5?el('p',`Сезон только начался: средние по ${games<=1?'одному матчу':'1–'+games+' матчам'} пока шумные. Стрик — от ${count(STREAK.min,'матча','матчей','матчей')} подряд заметно выше (🔥) или ниже (🧊) прогноза.`,'warning'):null;
 const list=el('div',null,'mk-list'),header=el('div',null,'mk-header');
 for(const [t,c] of [['#','mk-rank'],['Игрок','mk-who'],['Клуб','mk-club'],['Поз.','mk-pos'],['ФО/матч','mk-avg'],['Анализатор · '+PERIOD[horizon].toLowerCase(),'mk-ana'],['Цена','mk-price']])header.append(el('span',t,c));
 const more=button('',()=>{marketShown+=MARKET_PAGE;fill();});more.classList.add('mk-more');
 const fill=()=>{
  const rows=marketSorted(all,analyse),shown=rows.slice(0,marketShown);
  total.textContent=count(rows.length,'игрок','игрока','игроков');
  list.replaceChildren(header,...shown.map((r,i)=>marketRow(r,i,ctx,analyse,running)));
  if(!rows.length){const s=el('div',null,'state');s.append(el('strong','Никого не нашлось'),el('p',marketQuery?`По запросу «${marketQuery}» с этими фильтрами игроков нет.`:'С этими фильтрами игроков нет.'),
   button('Сбросить фильтры',()=>{market={...MARKET_DEFAULT,sort:market.sort};marketQuery='';marketShown=MARKET_PAGE;saveMarket();renderSeason();}));list.append(s);}
  more.hidden=rows.length<=marketShown;more.textContent=`Показать ещё ${Math.min(MARKET_PAGE,Math.max(0,rows.length-marketShown))}`;
 };
 input.oninput=()=>{marketQuery=input.value;marketShown=MARKET_PAGE;fill();};
 fill();
 const panel=el('div',null,'mk-panel');panel.append(head,search,filters,sortRow);
 return [controls(ctx),panel,info,...(rookieNote?[rookieNote]:[]),...(early?[early]:[]),list,more];
}
