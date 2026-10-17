import {completionPlan} from './completion.js';
import {scoringMetric,fullSeason,FULL_SEASON} from './season-scoring.js';
import {rosterFits} from './engine.js';
import {severeRisk} from './valuation.js';
export const DEMAND_PROFILES=[
 {id:'early',name:'Ранний спрос: GM планируют rookie в раундах 2–4',from:2,to:4},
 {id:'middle',name:'Средний спрос: раунды 4–6',from:4,to:6},
 {id:'late',name:'Поздний спрос: раунды 6–8',from:6,to:8},
 {id:'mixed',name:'Разные GM: диапазон 1–10, включая очень ранний выбор',from:1,to:10}
];
function random(seed){let x=seed>>>0;return ()=>{x=(x+0x6D2B79F5)>>>0;let t=Math.imul(x^(x>>>15),x|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

export function timingCohort(state){
 const metric=scoringMetric(state);
 const players=state.players.filter(p=>{
  const q=p.espnContext?.individualProjection;
  return p.forecast?.coverageTier!=='GROUP_PRIOR'&&p.positions.length&&(metric===FULL_SEASON?fullSeason(p)!==null:q?.metric==='FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES'&&Number.isFinite(q.componentSeasonTotal))&&
   (state.priceMode!=='ON'||(p.priceStatus==='VERIFIED'&&Number.isFinite(p.price)));
 });
 const ids=new Set(players.map(p=>p.id));
 if(state.picks.some(p=>!ids.has(p.playerId)))throw Error('Для одного из уже выбранных игроков нет сопоставимого индивидуального прогноза. Расчёт раунда не будет подменять его нулём.');
 if(players.length<80||players.filter(p=>p.isRookie).length<8)throw Error('Для расчёта нужны минимум 80 сопоставимых прогнозов, включая 8 rookie, с допустимыми позициями и ценами при включённом бюджете.');
 return players;
}
export function compatibleProfile(state,players,profile){
 const byId=new Map(players.map(p=>[p.id,p]));
 for(let team=1;team<8;team++){
  const choices=state.picks.filter(p=>p.team===team),rookie=choices.find(p=>byId.get(p.playerId)?.isRookie);
  if(rookie){const round=Math.floor((rookie.number-1)/8)+1;if(round<profile.from||round>profile.to)return false;}
  else if(choices.length>=profile.to)return false;
 }
 return true;
}
// One complete straight draft. Common seed and per-turn randomness pair round
// strategies without pretending that ADP supplies a calibrated pick probability.
export function simulateRookieTiming(state,players,targetRound,profile,seed,scenario='base'){
 const byId=new Map(players.map(p=>[p.id,p])),used=new Set(),rosters=Array.from({length:8},()=>[]),picks=[];
 const metric=scoringMetric(state);
 const value=p=>{
  if(metric!==FULL_SEASON)return p.espnContext.individualProjection.componentSeasonTotal;
  const key=scenario==='rookieUpside'?(p.isRookie?'seasonCeiling':'seasonFloor'):scenario==='veteranUpside'?(p.isRookie?'seasonFloor':'seasonCeiling'):'meanSeason';
  return Number.isFinite(p.forecast[key])?p.forecast[key]:fullSeason(p);
 };
 const valueOrder=[...players].sort((a,b)=>value(b)-value(a)||String(a.id).localeCompare(String(b.id)));
 const marketOrder=[...players].sort((a,b)=>(a.espnContext?.adp??9999)-(b.espnContext?.adp??9999)||value(b)-value(a));
 for(const choice of state.picks){const p=byId.get(choice.playerId);used.add(p.id);rosters[choice.team].push(p);picks.push({...choice});}
 const plans=Array.from({length:8},(_,team)=>{const from=Math.max(profile.from,rosters[team].length+1);return from+Math.floor(random(seed+team*997)()*Math.max(1,profile.to-from+1));});
 let actualRookieRound=state.picks.find(p=>p.team===0&&byId.get(p.playerId).isRookie)?.number;actualRookieRound=actualRookieRound?Math.floor((actualRookieRound-1)/8)+1:null;
 const rookies=players.filter(p=>p.isRookie),compatibility=Array.from({length:8},()=>new Map());
 function reserveRookies(candidate,team){
  const remaining=rookies.filter(p=>!used.has(p.id)&&p.id!==candidate.id),requirements=[];
  for(let other=0;other<8;other++){
   const roster=other===team?[...rosters[other],candidate]:rosters[other];
   if(roster.some(p=>p.isRookie))continue;
   const eligible=[];
   for(let i=0;i<remaining.length;i++){
    const rookie=remaining[i];let fits;
    if(other!==team&&compatibility[other].has(rookie.id))fits=compatibility[other].get(rookie.id);
    else{fits=rosterFits([...roster,rookie])&&(state.priceMode!=='ON'||roster.reduce((s,p)=>s+p.price,0)+rookie.price<=state.cap);if(other!==team)compatibility[other].set(rookie.id,fits);}
    if(fits)eligible.push(i);
   }
   if(!eligible.length)return false;requirements.push(eligible);
  }
  if(remaining.length<requirements.length)return false;
  requirements.sort((a,b)=>a.length-b.length);const assigned=Array(remaining.length).fill(-1);
  function assign(teamIndex,seen){for(const i of requirements[teamIndex])if(!seen.has(i)){seen.add(i);if(assigned[i]===-1||assign(assigned[i],seen)){assigned[i]=teamIndex;return true;}}return false;}
  return requirements.every((_,i)=>assign(i,new Set()));
 }
 function allowed(p,team,reserve=true){
  if(used.has(p.id)||!rosterFits([...rosters[team],p]))return false;
  const next=[...rosters[team],p],hasRookie=next.some(x=>x.isRookie);
  if(next.length===10&&!hasRookie)return false;
  if(state.priceMode==='ON'){
   const cost=next.reduce((s,x)=>s+x.price,0);if(cost>state.cap)return false;
   const remaining=10-next.length;
   const cheapest=players.filter(x=>!used.has(x.id)&&x.id!==p.id).map(x=>x.price).sort((a,b)=>a-b).slice(0,remaining);
   if(cheapest.length<remaining||cost+cheapest.reduce((a,b)=>a+b,0)>state.cap)return false;
  }
  if(state.priceMode==='ON'){
   const after={...state,players,picks:[...picks,{number:picks.length+1,team,playerId:p.id}]};
   if(!completionPlan(after,team).possible)return false;
  }
  if(reserve&&!reserveRookies(p,team))return false;
  return true;
 }
 for(let number=picks.length+1;number<=80;number++){
  const team=(number-1)%8,round=Math.floor((number-1)/8)+1,needs=!rosters[team].some(p=>p.isRookie);
  const wants=needs&&(round>=(team===0?targetRound:plans[team])||rosters[team].length===9);
  const order=team===0||wants?valueOrder:marketOrder;
  function choices(rookie,safer=false){const selected=[];for(const p of order){if(Boolean(p.isRookie)!==rookie||(safer&&severeRisk(p))||!allowed(p,team))continue;selected.push(p);if(selected.length===(team===0?1:3))break;}return selected;}
  let candidates=wants?choices(true):choices(false,team===0);
  if(!candidates.length&&!wants)candidates=choices(false);
  if(!candidates.length)candidates=choices(true);
  if(!candidates.length)return {valid:false,reason:'Нет легального продолжения',picks};
  const draw=random(seed+number*7919)(),p=candidates[team===0?0:Math.min(candidates.length-1,Math.floor(draw*draw*candidates.length))];
  used.add(p.id);rosters[team].push(p);compatibility[team].clear();picks.push({number,team,playerId:p.id});
  if(team===0&&p.isRookie&&actualRookieRound===null)actualRookieRound=round;
 }
 const valid=rosters.every(r=>r.length===10&&r.some(p=>p.isRookie)&&rosterFits(r)&&(state.priceMode!=='ON'||r.reduce((s,p)=>s+p.price,0)<=state.cap));
 const human=rosters[0],rookie=human.filter(p=>p.isRookie).reduce((s,p)=>s+value(p),0),veterans=human.filter(p=>!p.isRookie).reduce((s,p)=>s+value(p),0);
 const topThree=new Set(valueOrder.filter(p=>p.isRookie).slice(0,3).map(p=>p.id));
 const future=picks.slice(state.picks.length),humanChoices=future.filter(p=>p.team===0);
 const firstChoice=humanChoices[0],nextChoice=humanChoices[1];
 const atNextTurn=nextChoice?future.filter(p=>p.number<nextChoice.number).map(p=>p.playerId):null;
 return {firstChoice,nextChoice,atNextTurn,valid,picks,actualRookieRound,topTier:human.some(p=>topThree.has(p.id)),rookieScore:rookie,veteranScore:veterans,teamScore:rookie+veterans,rookieNames:human.filter(p=>p.isRookie).map(p=>p.name)};
}
export function rookieTimingStudy(state,{runs=24,seed=2026}={}){
 if(!Number.isInteger(runs)||runs<1||runs>100)throw Error('Для расчёта раунда допустимо 1–100 прогонов на сценарий');
 if(state.picks.some(p=>p.team===0&&state.players.find(x=>x.id===p.playerId)?.isRookie))return {covered:true,message:'Обязательный rookie уже выбран; расчёт времени первого выбора больше не нужен.'};
 const players=timingCohort(state),profilesToUse=DEMAND_PROFILES.filter(p=>compatibleProfile(state,players,p)),excludedProfiles=DEMAND_PROFILES.filter(p=>!profilesToUse.includes(p)).map(p=>p.name),firstRound=Math.ceil(state.picks.length/8)+1,rows=[];
 for(let round=firstRound;round<=10;round++){
  const profiles=profilesToUse.map(profile=>{
   const outcomes=Array.from({length:runs},(_,i)=>simulateRookieTiming(state,players,round,profile,seed+i));
   const valid=outcomes.filter(r=>r.valid),mean=key=>valid.length?valid.reduce((sum,r)=>sum+r[key],0)/valid.length:null;
   const names={};for(const r of valid)for(const name of r.rookieNames)names[name]=(names[name]||0)+1;
   return {id:profile.id,name:profile.name,runs,validRuns:valid.length,topTierRuns:valid.filter(r=>r.topTier).length,meanTeam:mean('teamScore'),meanRookie:mean('rookieScore'),meanVeterans:mean('veteranScore'),meanActualRound:mean('actualRookieRound'),names,branches:round<=firstRound+1?outcomes.map(r=>({valid:r.valid,firstChoice:r.firstChoice,nextChoice:r.nextChoice,atNextTurn:r.atNextTurn})):[],scores:outcomes.map(r=>r.valid?r.teamScore:null)};
  });
  rows.push({round,pick:(round-1)*8+1,profiles});
 }
 if(!profilesToUse.length)return {covered:false,cohort:players.length,rookies:players.filter(p=>p.isRookie).length,totalDrafts:0,rows:[],excludedProfiles,recommendedRound:null,decision:'Результат неустойчив',reason:'Все заданные сценарии спроса противоречат реальным пикам. Лучший раунд не определён.'};
 const bestByProfile=profilesToUse.map(profile=>{
  const eligible=rows.filter(r=>{const p=r.profiles.find(x=>x.id===profile.id);return p.validRuns===runs;});
  const best=[...eligible].sort((a,b)=>b.profiles.find(x=>x.id===profile.id).meanTeam-a.profiles.find(x=>x.id===profile.id).meanTeam)[0];
  return {id:profile.id,name:profile.name,round:best?.round??null,bestTeam:best?.profiles.find(x=>x.id===profile.id).meanTeam??null};
 });
 for(const row of rows){
  row.valid=row.profiles.every(p=>p.validRuns===runs)&&bestByProfile.every(p=>p.bestTeam!==null);
  row.worstRegret=row.valid?Math.max(...row.profiles.map(p=>Math.max(0,bestByProfile.find(b=>b.id===p.id).bestTeam-p.meanTeam))):null;
  row.meanTeam=row.profiles.every(p=>p.meanTeam!==null)?row.profiles.reduce((s,p)=>s+p.meanTeam,0)/row.profiles.length:null;
  row.meanRookie=row.profiles.every(p=>p.meanRookie!==null)?row.profiles.reduce((s,p)=>s+p.meanRookie,0)/row.profiles.length:null;
 }
 const eligible=rows.filter(r=>r.valid);
 const best=[...eligible].sort((a,b)=>b.meanTeam-a.meanTeam||a.round-b.round)[0];
 const robust=[...eligible].sort((a,b)=>a.worstRegret-b.worstRegret||b.meanTeam-a.meanTeam)[0];
 const runner=[...eligible].filter(r=>r!==best).sort((a,b)=>b.meanTeam-a.meanTeam)[0];
 const profileRounds=bestByProfile.map(p=>p.round).filter(n=>n!==null);

 const current=rows[0],next=rows[1];
 const paired=current?.valid&&next?.valid?current.profiles.map(p=>{
  const other=next.profiles.find(q=>q.id===p.id),delta=p.scores.map((v,i)=>v-other.scores[i]).sort((a,b)=>a-b);
  const counts=choices=>{const result={};for(const c of choices){const player=players.find(x=>x.id===c?.playerId);if(player)result[player.name]=(result[player.name]||0)+1;}return result;};
  const rookieNow=counts(p.branches.map(b=>b.firstChoice)),veteranNow=counts(other.branches.map(b=>b.firstChoice));
  const alternatives=counts(other.branches.map(b=>b.nextChoice));
  const losses=p.branches.map((b,i)=>other.branches[i].atNextTurn?.includes(b.firstChoice?.playerId)??null);
  const observed=losses.filter(x=>x!==null),lost=observed.filter(Boolean).length;
  return {rookieNow,veteranNow,alternatives,lost,observed:observed.length,id:p.id,name:p.name,mean:delta.reduce((a,b)=>a+b,0)/delta.length,min:delta[0],max:delta.at(-1),nowNames:p.names,nextNames:other.names};
 }):[];
 const now=paired.length>0&&paired.every(p=>p.min>0),wait=paired.length>0&&paired.every(p=>p.max<0);
 let decision=!next&&current?.valid?'Брать сейчас':now?'Брать сейчас':wait?'Можно ждать до следующего хода':'Результат неустойчив';
 let reason=!next&&current?.valid?'Следующего нашего хода для выполнения обязательного rookie нет.':now?'Во всех парных прогонах текущий выбор дал больший итог состава.':wait?'Во всех парных прогонах ожидание дало больший итог состава.':'Знак преимущества меняется, равен нулю или есть невалидные продолжения.';
 const forecastSensitivity=[];
 if(scoringMetric(state)===FULL_SEASON&&current?.valid&&next?.valid){
  for(const [scenario,name] of [['rookieUpside','Сильный rookie / слабые ветераны'],['veteranUpside','Слабый rookie / сильные ветераны']]){
   const deltas=[];let valid=true;
   for(const profile of profilesToUse)for(let i=0;i<3;i++){
    const now=simulateRookieTiming(state,players,current.round,profile,seed+i,scenario);
    const wait=simulateRookieTiming(state,players,next.round,profile,seed+i,scenario);
    if(!now.valid||!wait.valid)valid=false;else deltas.push(now.teamScore-wait.teamScore);
   }
   const min=valid?Math.min(...deltas):null,max=valid?Math.max(...deltas):null;
   forecastSensitivity.push({name,valid,min,max,decision:valid&&min>0?'Брать сейчас':valid&&max<0?'Можно ждать до следующего хода':'Результат неустойчив'});
  }
  if(forecastSensitivity.some(s=>!s.valid||s.decision!==decision)){
   decision='Результат неустойчив';
   reason='Совет меняется при сильном/слабом сценарии rookie относительно ветеранов. Базовый прогноз не даёт устойчивого преимущества по моменту пика.';
  }
 }
 return {sensitivityDrafts:forecastSensitivity.length*profilesToUse.length*3*2,forecastSensitivity,metric:scoringMetric(state),decision,reason,paired,ourPick:current?.pick??null,nextPick:next?.pick??null,teamsNeedingRookie:Array.from({length:7},(_,i)=>i+1).filter(team=>!state.picks.some(p=>p.team===team&&players.find(x=>x.id===p.playerId)?.isRookie)).length,covered:false,cohort:players.length,rookies:players.filter(p=>p.isRookie).length,runsPerProfile:runs,totalDrafts:rows.length*profilesToUse.length*runs,rows,bestByProfile,excludedProfiles,recommendedRound:best?.round??null,recommendedPick:best?.pick??null,robustRound:robust?.round??null,profileRange:profileRounds.length?[Math.min(...profileRounds),Math.max(...profileRounds)]:null,stable:profileRounds.length===profilesToUse.length&&new Set(profileRounds).size===1,meanGap:best&&runner?best.meanTeam-runner.meanTeam:null,
  method:'Основной критерий — максимальная средняя сумма сезонных оценок полного состава в единой метрике при РАВНОМ техническом весе совместимых сценариев, не подтверждённых вероятностях. Дополнительно рассчитываем минимакс сожаления: минимальное наибольшее отставание от лучшего решения внутри каждого сценария спроса. Профили спроса и выбор GM — допущения, не подтверждённые вероятности. Сценарии, противоречащие уже записанным пикам GM, исключаются; это согласование гипотез, не калибровка вероятностей. ADP задаёт рыночный порядок ветеранов; новичков GM выбирают по индивидуальному прогнозу. Для автоматической базы учитываются все компоненты формулы, включая оценочные фолы и бонусы. Импорт без полной модели сравнивается отдельно по частичным ФО. Позиции ESPN не подтверждены по Yahoo. Невалидные прогоны не исключаются молча: стратегия с ними не допускается к рекомендации.'};
}
