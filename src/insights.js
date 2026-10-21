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
 // Spread is judged against the other priced players: the weakest and strongest fifth of floor-to-mean ratios.
 const floors=priced.filter(p=>Number.isFinite(p.forecast.seasonFloor)&&p.forecast.meanSeason>0).map(p=>p.forecast.seasonFloor/p.forecast.meanSeason).sort((a,b)=>a-b);
 const at=q=>floors.length?floors[Math.floor(q*(floors.length-1))]:null;
 ctx={value,values,overall,positional,wide:at(.2),narrow:at(.8)};insightCache.set(players,ctx);return ctx;
}
// Data-driven pros and cons: Sports.ru trend and games, price value, positional rank, market (ADP) and risk.
export function playerInsights(p,players){
 const pros=[],cons=[],ctx=insightContext(players),seasons=Object.entries(p.sportsHistory||{});
 const full=seasons.filter(([,s])=>s.games>=20);
 // Sports.ru's averages carry its team result bonus (about ±2 a game by the club's record), which FBL does not count:
 // the trend compares the averages without it whenever both seasons have them, so a club's record is not read as form.
 const [[a,prev],[b,last]]=full.length>=2?full.slice(-2):[[],[]],fbl=full.length>=2&&Number.isFinite(prev.fblPerGame)&&Number.isFinite(last.fblPerGame);
 const level=s=>fbl?s.fblPerGame:s.perGame;
 if(full.length>=2&&level(prev)>0){
  const change=(level(last)-level(prev))/level(prev),unit=fbl?'ФО/матч без бонуса за результат':'ФО/матч (с бонусом за результат)';
  const path=full.slice(-3).filter(([,s])=>!fbl||Number.isFinite(s.fblPerGame)).map(([,s])=>level(s).toFixed(1)).join(' → ');
  if(change>=.08)pros.push(`Рост на Sports.ru: ${path} ${unit} (${b} к ${a}: +${Math.round(change*100)}%).`);
  else if(change<=-.08)cons.push(`Спад на Sports.ru: ${path} ${unit} (${b} к ${a}: ${Math.round(change*100)}%).`);
  else pros.push(`Стабильный уровень на Sports.ru: ${path} ${unit}.`);
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
  const ratio=f.seasonFloor/f.meanSeason;
  if(ctx.wide!==null&&ratio<=ctx.wide)cons.push(`Большой разброс: слабый сезон всего ${Math.round(f.seasonFloor)} ФО — среди 20% самых рискованных (травмы или потеря роли у похожих игроков).`);
  else if(ctx.narrow!==null&&ratio>=ctx.narrow)pros.push(`Узкий разброс: даже слабый сезон ${Math.round(f.seasonFloor)} ФО — среди 20% самых надёжных.`);
  if(Number.isFinite(f.shortSeasonRisk)&&f.shortSeasonRisk>=.2)cons.push(f.availability?`Риск короткого сезона: ${Math.round(f.shortSeasonRisk*100)}% сыграть меньше четверти матчей (цепь по истории пропусков).`:`Риск короткого сезона: у ${Math.round(f.shortSeasonRisk*100)}% похожих случаев — меньше четверти матчей.`);
 }
 const d=f?.historicalDownside;if(d&&Number.isFinite(d.meanWorstTenPercent)&&d.meanWorstTenPercent>=12)pros.push(`Высокий пол: худшие 10% матчей в среднем ${d.meanWorstTenPercent.toFixed(1)} ФО.`);
 if(d?.negativeGames>=3)cons.push(`Минусовые матчи: ${d.negativeGames} в ${d.season}.`);
 // Like for like only when the check is on the FBL formula; otherwise the gap includes Sports.ru's team result bonus.
 if(p.sportsCheck?.flag)cons.push(`Прогноз расходится с прошлым сезоном ${p.sportsCheck.basis==='FBL_NO_RESULT_BONUS'?'(Sports.ru без бонуса за результат)':'Sports.ru (с бонусом за результат, которого в FBL нет)'} на ${p.sportsCheck.gap>0?'+':''}${Math.round(p.sportsCheck.gap*100)}%: проверь роль и здоровье.`);
 if(Number.isFinite(p.age)){if(p.age>=32)cons.push(`Возраст ${p.age}: выше риск спада и пропусков.`);else if(p.age<=23&&pros.some(x=>x.startsWith('Рост')))pros.push(`Возраст ${p.age}: потенциал дальнейшего роста.`);}
 if(p.injuries?.length)cons.push('Статус травмы: '+p.injuries.map(i=>i.status||'неизвестно').join(', ')+'.');
 if(p.roleContext?.note)cons.push(p.roleContext.note);
 if(p.isRookie)pros.push('Закрывает обязательный слот rookie.');
 return {pros,cons};
}
