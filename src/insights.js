// Data-driven pros and cons of a player, shared by the player cards and the Telegram transfer verdicts.
import {riskAdjustedValue} from './valuation.js';
// League-wide reference points for the pros/cons, computed once per player list.
const insightCache=new WeakMap();
function insightContext(players){
 let ctx=insightCache.get(players);if(ctx)return ctx;
 const priced=players.filter(p=>p.forecast&&p.priceStatus==='VERIFIED'&&p.price>0);
 const value=p=>riskAdjustedValue(p)*82/p.price*1000;
 const values=priced.map(value).sort((a,b)=>a-b);
 const byForecast=[...priced].sort((a,b)=>b.forecast.meanSeason-a.forecast.meanSeason);
 const overall=new Map(byForecast.map((p,i)=>[p.id,i+1])),positional=new Map();
 for(const pos of ['PG','SG','SF','PF','C'])byForecast.filter(p=>p.positions.includes(pos)).forEach((p,i)=>positional.set(p.id+pos,i+1));
 ctx={value,values,overall,positional};insightCache.set(players,ctx);return ctx;
}
// Data-driven pros and cons: Sports.ru trend and games, price value, positional rank, market (ADP) and risk.
export function playerInsights(p,players){
 const pros=[],cons=[],ctx=insightContext(players),seasons=Object.entries(p.sportsHistory||{});
 const full=seasons.filter(([,s])=>s.games>=20);
 if(full.length>=2){
  const [[a,prev],[b,last]]=full.slice(-2),change=(last.perGame-prev.perGame)/prev.perGame;
  const path=full.slice(-3).map(([,s])=>s.perGame.toFixed(1)).join(' → ');
  if(change>=.08)pros.push(`Рост на Sports.ru: ${path} ФО/матч (${b} к ${a}: +${Math.round(change*100)}%).`);
  else if(change<=-.08)cons.push(`Спад на Sports.ru: ${path} ФО/матч (${b} к ${a}: ${Math.round(change*100)}%).`);
  else pros.push(`Стабильный уровень на Sports.ru: ${path} ФО/матч.`);
 }
 const recent=seasons.slice(-2);
 if(recent.length===2&&recent.every(([,s])=>s.games>=68))pros.push(`Надёжен по здоровью: ${recent.map(([k,s])=>`${s.games} м. в ${k}`).join(', ')}.`);
 for(const [k,s] of recent)if(s.games<55)cons.push(`Пропуски: всего ${s.games} матчей в ${k}.`);
 if(!seasons.length)cons.push('Нет истории на Sports.ru: прогноз без личной статистики в этой формуле.');
 if(p.forecast&&p.priceStatus==='VERIFIED'&&p.price>0){
  const v=ctx.value(p),share=ctx.values.filter(x=>x<=v).length/ctx.values.length;
  if(share>=.8)pros.push(`Выгодная цена: ${Math.round(v)} ФО на 1000 бюджета — лучше, чем у ${Math.round(share*100)}% игроков.`);
  else if(share<=.3)cons.push(`Дорого за свой прогноз: ${Math.round(v)} ФО на 1000 бюджета — хуже, чем у ${Math.round((1-share)*100)}% игроков.`);
  const pos=p.positions.map(x=>[x,ctx.positional.get(p.id+x)]).filter(([,r])=>r).sort((a,b)=>a[1]-b[1])[0];
  if(pos&&pos[1]<=6)pros.push(`№${pos[1]} среди ${pos[0]} по прогнозу сезона.`);
  const rank=ctx.overall.get(p.id),adp=p.espnContext?.adp;
  if(rank&&Number.isFinite(adp)){
   if(adp-rank>=12)pros.push(`Недооценён рынком: ADP ESPN ${adp.toFixed(0)}, а по нашему прогнозу №${rank}.`);
   else if(rank-adp>=12)cons.push(`Рынок оценивает выше прогноза: ADP ESPN ${adp.toFixed(0)}, по прогнозу №${rank} — могут забрать рано или это переплата.`);
  }
 }
 const f=p.forecast;
 if(f&&Number.isFinite(f.seasonFloor)&&f.meanSeason>0){
  if(f.seasonFloor/f.meanSeason<.06)cons.push(`Большой разброс: слабый сезон всего ${Math.round(f.seasonFloor)} ФО (риск травмы или потери роли).`);
  else if(f.seasonFloor/f.meanSeason>.2)pros.push(`Узкий разброс: даже слабый сезон ${Math.round(f.seasonFloor)} ФО.`);
 }
 const d=f?.historicalDownside;if(d&&Number.isFinite(d.meanWorstTenPercent)&&d.meanWorstTenPercent>=12)pros.push(`Высокий пол: худшие 10% матчей в среднем ${d.meanWorstTenPercent.toFixed(1)} ФО.`);
 if(d?.negativeGames>=3)cons.push(`Минусовые матчи: ${d.negativeGames} в ${d.season}.`);
 if(p.sportsCheck?.flag)cons.push(`Прогноз расходится с прошлым сезоном Sports.ru на ${p.sportsCheck.gap>0?'+':''}${Math.round(p.sportsCheck.gap*100)}%: проверь роль и здоровье.`);
 if(Number.isFinite(p.age)){if(p.age>=32)cons.push(`Возраст ${p.age}: выше риск спада и пропусков.`);else if(p.age<=23&&pros.some(x=>x.startsWith('Рост')))pros.push(`Возраст ${p.age}: потенциал дальнейшего роста.`);}
 if(p.injuries?.length)cons.push('Статус травмы: '+p.injuries.map(i=>i.status||'неизвестно').join(', ')+'.');
 if(p.roleContext?.note)cons.push(p.roleContext.note);
 if(p.isRookie)pros.push('Закрывает обязательный слот rookie.');
 return {pros,cons};
}
