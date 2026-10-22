// Season → Трансферы: the transfer assistant and the league's transfer log.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {fblTransfers} from '../rules.js';
import {current,bestTransfers} from '../season.js';
import {transferPlan,planValue} from '../transfer-plan.js';
import {int,signed,count,ddmm} from '../format.js';
import {$,PERIOD_LONG,button,byId,card,el,forGains,horizon,injuryText,issueUrl,league,link,needsLive,pending,players,renderSeason,replacing,same,setPending,setQuery,setReplacing,sportsTeam,team,teamBank,transfers,transfersLeft} from './state.js';
import {EARLY,controls,optionRow,replacementPanel,takeAction,whyBox} from './widgets.js';

// ---------- Transfers assistant ----------
// The answer to "what should I do now", the same as Telegram's: src/transfer-plan.js weighs every package of up to the
// transfers left over the week, 4 weeks and the season (the weights and the price of a transfer chosen on the backtest of
// 2023/24-2025/26) and never lowers the season's expectation. A move comes with its gains, its calibrated confidence,
// the main risks, what would change it and the best alternative; no move worth a transfer says «держать» and why.
const SHORT={week:'неделя',month:'4 недели',season:'сезон'};
function packageMoves(p){const ul=el('ul',null,'moves');for(const x of p.pairs){const li=el('li'),rivals=p.contested?.get(x.in.id)||[];li.append(el('span',x.out.name,'out'),el('span','→','arrow'),el('span',x.in.name,'in'),el('small',`${x.in.positions.join('/')} · ${int(x.in.price)}${injuryText(x.in)?' · '+injuryText(x.in):''}`));
 if(rivals.length){const c=el('span',`нужен ещё ${count(rivals.length,'команде','командам','командам')}`,'chip chip--warn');c.title=`По той же модели ${x.in.name} усиливает и ${rivals.map(teamName).join(', ')}. В FBL игрок может быть только в одной команде: кто купит позже, нарушит правило — перед покупкой проверь ленту лиги.`;li.append(c);}
 ul.append(li);}return ul;}
function planList(title,lines,cls=''){if(!lines?.length)return null;const box=el('div',null,'sp-plan-list '+cls);box.append(el('strong',title));const ul=el('ul');for(const l of lines)ul.append(el('li',l));box.append(ul);return box;}
// Each roster player out now: hold him, or a replacement until he is back (two transfers, and he may be bought meanwhile).
function injuredLines(plan){
 return (plan.injured||[]).map(x=>{const who=`${x.player.name}${x.report?' ('+injuryText(x.player).toLowerCase()+')':` (пропустил ${count(x.away,'матч','матча','матчей')} подряд)`}`;
  return x.verdict==='replace'&&x.replacement?`${who}: можно заменить на ${x.replacement.name} до возвращения (${signed(x.gains.month)} ФО за 4 недели) — это два трансфера, и его могут забрать`:`${who}: держать — замена и выкуп не окупают два трансфера`;});
}
function recommendationCard(ctx,plan,left,fbl){
 const card=el('div',null,'sp-pick'+(plan.action==='move'?'':' hold'));
 if(plan.action!=='move'){
  card.append(el('p','Рекомендация','eyebrow'));
  if(plan.reason==='no-transfers')card.append(el('h3','Держать: трансферы на эту неделю закончились'),el('p',`Следующие — с ${ddmm(fbl.resetOn)}. Варианты ниже — на будущее.`,'muted'));
  else if(plan.reason==='low-confidence'){const b=plan.best;
   card.append(el('h3','Держать: лучший ход окупает трансфер, но в нём мало уверенности'),
    el('p',`${b.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', ')}: ${signed(b.gains.week)} ФО за неделю, ${signed(b.gains.month)} за 4 недели, ${signed(b.gains.season)} за сезон, уверенность за сезон ${Math.floor(b.confidence*100)}% — ниже порога ${Math.round(plan.minConfidence*100)}%, подобранного на прошлых сезонах.`,'muted'));
  }
  else{
   card.append(el('h3','Держать: сейчас ни один ход не окупает трансфер'));
   const b=plan.best;
   card.append(el('p',b?`Лучший ход — ${b.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', ')}: ${signed(b.gains.week)} ФО за неделю, ${signed(b.gains.month)} за 4 недели, ${signed(b.gains.season)} за сезон. По весам, подобранным на прошлых сезонах, это ${signed(b.value)}, меньше цены трансфера (${int(plan.price??b.price)}): прогнозы выигрыша завышают реальный, а трансфер может понадобиться позже на неделе.`:'Ни одна замена не добавляет очков по правилам состава и банку.','muted'));
  }
  const inj=planList('Травмированные в составе',injuredLines(plan));if(inj)card.append(inj);
  return card;
 }
 card.append(el('p','Рекомендация','eyebrow'),el('h3',plan.pairs.length===1?'Сделай этот трансфер':`Сделай ${count(plan.pairs.length,'трансфер','трансфера','трансферов')}`),packageMoves(plan));
 const kpis=el('div',null,'kpis'),kpi=(l,v,t)=>{const k=el('div',null,'kpi');k.append(el('small',l),el('strong',v));if(t)k.title=t;kpis.append(k);};
 for(const h of ['week','month','season'])kpi('ФО · '+SHORT[h],signed(plan.gains[h]));
 kpi('Уверенность',Math.floor(plan.confidence.season*100)+' %',`За сезон; за 4 недели ${Math.floor(plan.confidence.month*100)}%, за неделю ${Math.floor(plan.confidence.week*100)}%. Доля похожих обменов, давших плюс в прогоне советов на сезонах 2023/24–2025/26, в среднем за три сезона.`);
 kpi('Банк после',int(plan.bankAfter));
 const actions=el('div',null,'actions'),act=takeAction(plan.pairs.map(x=>({outId:x.out.id,player:x.in})),ctx,'Записать');act.classList.replace('btn-secondary','btn-primary');actions.append(act);
 card.append(kpis,actions);
 for(const box of [planList('Зачем в пакете ход в минус',plan.forced),planList('Главные риски',plan.risks,'risks'),planList('Что изменит решение',plan.changes),
  plan.alternative?planList('Лучшая альтернатива',[`${plan.alternative.pairs.map(x=>`${x.out.name} → ${x.in.name}`).join(', ')}: ${signed(plan.alternative.gains.week)} за неделю, ${signed(plan.alternative.gains.month)} за 4 недели, ${signed(plan.alternative.gains.season)} за сезон`]):null,
  planList('Травмированные в составе',injuredLines(plan))])if(box)card.append(box);
 card.append(whyBox(plan.why[horizon],ctx));
 return card;
}
export function transfersView(base){
 const ctx=forGains(base),wait=needsLive('Помощник по трансферам');if(wait)return [controls(ctx),...wait];
 const money=teamBank(team,ctx.transfers),left=transfersLeft(ctx,team),fbl=fblTransfers(ctx.transfers,team,ctx.today),st=sportsTeam(team),out=[controls(ctx)];
 const plan=transferPlan(ctx,{team,bankMoney:money,left,bankOf:t=>teamBank(t,ctx.transfers),leftOf:t=>transfersLeft(ctx,t)});
 out.push(recommendationCard(ctx,plan,left,fbl));
 if(st)out.push(el('p',`${teamName(team)} подключена к Sports.ru: трансфер делается там, здесь он появится сам примерно через минуту.`,'sp-note'));
 if(plan.why?.season.flags.some(f=>f.startsWith(EARLY)))out.push(el('p','Сезон только начался: оценки опираются на прогноз, а не на игры этого сезона.','warning'));
 const singles=bestTransfers(ctx,{team,bankMoney:money,sort:horizon}).filter(b=>b.gain[horizon]>0);
 const sb=el('details',null,'sp-block sp-best');sb.open=plan.action!=='move'&&singles.length>0;sb.append(el('summary',`Лучшая замена для каждого игрока (${singles.length})`));
 if(singles.length){const ol=el('ol',null,'sp-options');for(const b of singles){const row=optionRow(b,b.outId,ctx,`${byId.get(b.outId).name} → ${b.player.name}`);
   row.querySelector('.sp-name').append(planValue(b.gain,undefined,ctx)>0?el('span','окупает трансфер','chip chip--accent'):el('span','не окупает трансфер','chip'));ol.append(row);}sb.append(ol);}
 else sb.append(el('p',`Ни одна одиночная замена не добавляет ФО ${PERIOD_LONG[horizon]}.`,'muted'));
 out.push(sb);
 const pick=el('div',null,'sp-block sp-best');pick.append(el('h3','Замена конкретному игроку'));
 const sel=el('select');sel.setAttribute('aria-label','Игрок, которого заменить');sel.append(el('option','Выбери игрока'));sel.firstChild.value='';
 for(const id of ctx.rosters[team]){const p=byId.get(id);if(!p)continue;const c=current(p,ctx);const o=el('option',`${p.name} (${c.positions.join('/')}, ${int(c.price)})${injuryText(p)?' · '+injuryText(p):''}`);o.value=String(id);sel.append(o);}
 if(replacing)sel.value=String(replacing);
 // Ids are NBA numbers or provider strings ("espn:…"): match the option to a roster id, never coerce it.
 sel.onchange=()=>{setReplacing(ctx.rosters[team].find(id=>String(id)===sel.value)??null);setQuery('');renderSeason();};
 pick.append(sel);if(replacing&&ctx.rosters[team].includes(replacing))pick.append(replacementPanel(byId.get(replacing),ctx));
 out.push(pick,transferLog(ctx));
 return out;
}
function transferLog(ctx){
 const box=el('details',null,'sp-block sp-log');box.open=pending.length>0;box.append(el('summary',`Журнал трансферов лиги (${ctx.transfers.length})`));
 const list=el('ol');
 [...ctx.transfers].reverse().forEach(x=>{
  const isPending=!x.source,li=el('li',null,isPending?'pending':''),what=el('span',null,'what');
  what.append(el('strong',`${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`),el('small',`${teamName(x.team)} · ${int(x.outPrice)} → ${int(x.inPrice)}${x.source==='league'?' · журнал лиги':''}`));
  li.append(el('span',ddmm(x.date),'when'),what);
  if(isPending){li.append(el('span','только на этом устройстве','chip chip--warn'),link('Отправить в журнал ↗',issueUrl(`${teamName(x.team)}: ${byId.get(x.outId)?.name} → ${byId.get(x.inId)?.name}`,{action:'transfer',...x}),'btn-secondary btn-sm sp-send'));
   li.append(button('Удалить',()=>{setPending(pending.filter(p=>!same(p,x)));writeStored('fbl-transfers',JSON.stringify(pending));renderSeason();},'btn-ghost btn-sm'));}
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
