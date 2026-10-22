// Season → Команды: a team's roster with facts and forecasts over the chosen period, and its race.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {fblTransfers} from '../rules.js';
import {WEEKLY_TRANSFERS,bank,perGame,current} from '../season.js';
import {teamPlace,placeLabel,chanceText,periodWindows,windowFact,windowAhead,shadowedHoldings,runningCredit,soldRunning,fblGame} from '../standings.js';
import {int,dec,ddmm} from '../format.js';
import {openPlayerSheet} from '../sheet.js';
import {$,PERIOD,SPORTS_URL,TEAM_URL,button,byId,card,el,horizon,injuryInfo,league,link,live,livePoints,needsLive,openRows,readJson,renderSeason,replacing,same,setQuery,setReplacing,sportsTeam,src,team,teamBank,transfers,transfersLeft} from './state.js';
import {CHANCE_NOTE,controls,courtWord,race,replacementPanel} from './widgets.js';

// ---------- Teams ----------
// Fact and forecast windows (the current tour, 4 weeks = the transfer gains' 28 days, the season) and the facts in them,
// by the league table's own rule: src/standings.js.
const windows=periodWindows,teamFact=(ctx,t,w)=>windowFact(ctx,t,w);
const playerFact=(p,t,ctx,w)=>p.sportsId?windowFact(ctx,t,w,p.sportsId):0;
// Still to come in a window for the chosen team: a shadowed holding brings it nothing, a game that tipped off before he
// was bought is the seller's (standings.js windowAhead, runningCredit).
const ahead=(p,ctx,w,running,shadow,credit)=>windowAhead(ctx,team,p,w,running,shadow,credit);
function factForecast(fact,forecast){const v=el('strong',null,'fact');v.append(int(fact),el('span',' / '+int(forecast),'fc'));v.title='Факт / прогноз';return v;}
// The league race of one team, from the same numbers as the overview table: shared place, gap to the 1st or the 2nd, chances.
const leaguePlace=(ctx,t,running)=>teamPlace(race(ctx,running),t);
// `shadow`: the holdings that score for the team that had the player first (standings.js shadowedHoldings); `credit`:
// whose each running game is (standings.js runningCredit).
function playerRow(p,ctx,running,shadow,credit){
 const live1=live?.players?.[p.sportsId],c=current(p,ctx),g=perGame(p,live1),inj=injuryInfo(p),now=credit.has(`${team}:${p.id}`)?running.get(p.id):null;
 const box=el('details',null,'season-player');box.open=openRows.has(p.id)||replacing===p.id;
 const sum=el('summary'),row=el('div',null,'sp-row');
 const name=el('span',null,'sp-name'),meta=el('small',`${c.positions.join('/')} · ${p.team||'—'}${p.isRookie?' · rookie':''}`);name.append(el('strong',p.name),meta);
 const price=el('span',null,'sp-price'),delta=Number.isFinite(live1?.price)&&Number.isFinite(live1?.initialPrice)?live1.price-live1.initialPrice:0;
 price.append(el('strong',int(c.price)));if(delta){const d=el('small',(delta>0?'▲ ':'▼ ')+int(Math.abs(delta)),delta>0?'up':'down');d.title='Изменение цены с начала сезона';price.append(d);}
 const form=el('span',null,'sp-form'),last=(live1?.games||[]).filter(fblGame).slice(-3).map(x=>int(x.points));
 form.append(el('strong',dec(g.average??g.prior)),el('small',now?`в игре ${int(now.points)}${courtWord(now)}`:g.average!=null&&last.length?last.join(' · '):'прогноз'));
 const w=windows(ctx)[horizon],fact=playerFact(p,team,ctx,w),rest=ahead(p,ctx,w,running,shadow,credit),first=shadow.get(`${team}:${p.id}`),next=el('span',null,'sp-next'),left=el('small',`ещё ${dec(rest.games)} м.`);
 left.title='Ожидаемых матчей до конца периода';next.append(factForecast(fact,fact+rest.points),left);
 row.append(name,price,form,next);
 if(inj){const line=el('span',null,'sp-injury'+(inj.level==='out'?' out':''));line.append(`🩹 ${inj.text}`);row.append(line);}
 if(first!=null)row.append(el('span',`⚖️ Его очки получает ${teamName(first)}: она взяла его раньше. Здесь он приносит 0, пока нарушение не исправлено`,'sp-injury'));
 sum.append(row);box.append(sum);
 const actions=el('div',null,'sp-actions');
 actions.append(button(replacing===p.id?'Скрыть замены':'Найти замену',e=>{e.preventDefault();setReplacing(replacing===p.id?null:p.id);setQuery('');openRows.add(p.id);renderSeason();}),link('Sports.ru ↗',SPORTS_URL(p.sportsId)));
 // The full card opens over the page: inside a roster row it would be squeezed to a fraction of the screen.
 actions.append(button('Досье игрока',()=>openPlayerSheet(p,card),'btn-ghost btn-sm'));
 box.append(actions);
 if(replacing===p.id)box.append(replacementPanel(p,ctx));
 box.addEventListener('toggle',()=>{if(box.open)openRows.add(p.id);else openRows.delete(p.id);});
 return box;
}
function teamKpis(ctx,roster,running,shadow,credit){
 const st=sportsTeam(team),spent=roster.reduce((s,p)=>s+(current(p,ctx).price||0),0),left=transfersLeft(ctx,team),fbl=fblTransfers(ctx.transfers,team,ctx.today);
 // A player sold after the tip-off of the game he is playing still brings that game to this team (soldRunning).
 const w=windows(ctx)[horizon],fact=teamFact(ctx,team,w),sold=soldRunning(ctx,team,running,credit,w.to),race=leaguePlace(ctx,team,running);
 const forecast=fact+sold.now+sold.rest+roster.reduce((s,p)=>s+ahead(p,ctx,w,running,shadow,credit).points,0);
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
export function teams(ctx){
 const wait=needsLive('Состав');if(wait)return [controls(ctx),...wait];
 const roster=ctx.rosters[team].map(id=>byId.get(id)).filter(Boolean),running=livePoints(),st=sportsTeam(team),shadow=shadowedHoldings(ctx),credit=runningCredit(ctx,running);
 const out=[controls(ctx),teamKpis(ctx,roster,running,shadow,credit)];
 if(st){const info=el('div',null,'sp-team-info');info.append(link('Команда на Sports.ru ↗',TEAM_URL(st.sportsTeamId)));out.push(info);}
 const list=el('div',null,'sp-roster'),header=el('div',null,'sp-header');
 for(const t of ['Игрок','Цена','За матч','Факт / прогноз'])header.append(el('span',t));
 list.append(header,...roster.map(p=>playerRow(p,ctx,running,shadow,credit)));out.push(list);
 return out;
}
