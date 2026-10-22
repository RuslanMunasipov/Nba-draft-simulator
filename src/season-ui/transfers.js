// Season → Трансферы: the transfer assistant and the league's transfer log.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {fblTransfers} from '../rules.js';
import {current,bestTransfers,marketAlerts,DOUBTFUL} from '../season.js';
import {recommendPackage,contestedBy} from '../season.js';
import {int,signed,count,ddmm} from '../format.js';
import {$,PERIOD_LONG,button,byId,card,confidenceBadge,el,forGains,horizon,injuryText,issueUrl,league,link,needsLive,pending,players,renderSeason,replacing,same,setPending,setQuery,setReplacing,sportsTeam,team,teamBank,transfers,transfersLeft} from './state.js';
import {EARLY,controls,gainCells,optionRow,replacementPanel,takeAction,whyBox} from './widgets.js';

// ---------- Transfers assistant ----------
// The answer to "what should I do now", the same as Telegram's (recommendPackage): the best package the model is confident
// of (70%+), that does not cost the season and fits the week. Without one, the borderline package (60-69%) comes first
// among the options, so the hold card names it with its confidence instead of "сделай". The players the shown package
// buys carry the other FBL teams the same model advises to buy them.
function recommendation(ctx,money,left){
 const {best,borderline,options}=recommendPackage(ctx,{team,bankMoney:money,left,sort:horizon}),shown=best||borderline;
 if(shown)shown.contested=new Map(shown.pairs.map(x=>[x.in.id,contestedBy(ctx,{team,playerId:x.in.id,bankOf:t=>teamBank(t,ctx.transfers),leftOf:t=>transfersLeft(ctx,t),sort:horizon})]));
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
export function transfersView(base){
 const ctx=forGains(base),wait=needsLive('Помощник по трансферам');if(wait)return [controls(ctx),...wait];
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
