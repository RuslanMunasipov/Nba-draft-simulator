import {pickCompletion} from './completion.js';
import {scoringMetric,seasonScore,FULL_SEASON} from './season-scoring.js';
import {draftValue,severeRisk,riskAdjustedValue} from './valuation.js';
import { TEAM_COUNT, ROUNDS, pick, rosterFits, riskPriority, getPlayer } from './engine.js';

// Deterministic PRNG: identical seed + player data => identical draft.
export function randomFromSeed(seed=1) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s = (Math.imul(1664525,s) + 1013904223) >>> 0; return s / 4294967296; };
}
export function currentTeam(state) { return state.picks.length % TEAM_COUNT; }
export function teamRoster(state,team) {
  return state.picks.filter(p=>p.team===team).map(p=>getPlayer(state,p.playerId));
}
export function teamCost(state,team) { const roster=teamRoster(state,team);return roster.some(p=>!Number.isFinite(p.price))?null:roster.reduce((sum,p)=>sum+p.price,0); }
export function isComplete(state) { return state.picks.length === TEAM_COUNT*ROUNDS; }
export function availableCandidates(state) {
  if(isComplete(state)) return [];
  const used=new Set(state.picks.map(p=>p.playerId));
  const roster=teamRoster(state,currentTeam(state));
  const spent=state.priceMode==='ON'?roster.reduce((sum,p)=>sum+p.price,0):0;
  const counts=roster.every(p=>p.positions.length===1)?Object.fromEntries(['PG','SG','SF','PF','C'].map(pos=>[pos,roster.filter(p=>p.positions[0]===pos).length])):null;
  return state.players.filter(p=>!used.has(p.id)&&p.positions.length&&
   (state.priceMode!=='ON'||p.priceStatus==='VERIFIED'&&Number.isFinite(p.price)&&spent+p.price<=state.cap)&&
   (roster.length!==9||roster.some(x=>x.isRookie===true)||p.isRookie===true)&&
   (!counts||p.positions.some(pos=>counts[pos]<2)))
   .filter(p=>{try{pick(state,p.id);return true;}catch{return false;}});
}
function botValue(player,style) { return riskAdjustedValue(player,style); }
function rankingFor(state,style){const metric=scoringMetric(state);return state.players.filter(p=>seasonScore(p,metric)!==null).sort((a,b)=>botValue(b,style)-botValue(a,style)||riskPriority(a)-riskPriority(b));}
export function botPick(state,random=randomFromSeed(1),style='balanced',ranking=null) {
  const metric=scoringMetric(state);
  let candidates=availableCandidates(state).filter(p=>metric!==FULL_SEASON||seasonScore(p,metric)!==null);
  const roster=teamRoster(state,currentTeam(state));
  // Reserve a rookie; budget is only relevant when official prices exist.
  const needsRookie=!roster.some(p=>p.isRookie===true);
  const teamsNeedingRookie=Array.from({length:TEAM_COUNT},(_,team)=>teamRoster(state,team)).filter(r=>!r.some(p=>p.isRookie===true)).length;
  const rookies=candidates.filter(p=>p.isRookie===true);
  if(rookies.length<=teamsNeedingRookie)candidates=needsRookie?rookies:candidates.filter(p=>p.isRookie!==true);
  else if(needsRookie&&roster.length>=5)candidates=rookies;
  if(!candidates.length) throw Error('Нет допустимых игроков для бота: проверьте позиции, новичков и справочник');
  // Only explicitly supplied projections are usable. Never synthesize fantasy points.
  const allowed=new Set(candidates.map(p=>p.id));
  const ranked=(ranking||rankingFor(state,style)).filter(p=>allowed.has(p.id));
  if(!ranked.length) throw Error('Симуляция требует прогнозов projectedFP; без них бот не будет притворяться аналитиком');
  const pool=ranked.slice(0,Math.min(8,ranked.length));
  const index=style==='best' ? 0 : Math.min(pool.length-1,Math.floor(Math.pow(random(),style==='volatile'?0.65:2)*pool.length));
  const preferred=pool[index];
  // A locally legal position assignment may consume the only slot for a rookie.
  // Check the selected move before committing, then try deterministic alternatives.
  for(const candidate of [preferred,...ranked.filter(p=>p.id!==preferred.id)]){
    if(pickCompletion(state,candidate.id).possible)return pick(state,candidate.id);
  }
  throw Error('Нет выбора, после которого можно добрать полный состав с rookie');
}
export function advanceBots(state,{humanTeam=0,seed=1,style='balanced'}={}) {
  const random=randomFromSeed(seed);
  let next=state;const ranking=rankingFor(state,style);
  while(!isComplete(next)&&currentTeam(next)!==humanTeam) next=botPick(next,random,style,ranking);
  return next;
}
export function simulateDraft(state,{seed=1,styles=['balanced','best','volatile']}={}) {
  const random=randomFromSeed(seed);
  let next=state;const rankings=new Map();
  while(!isComplete(next)) {
    const style=styles[Math.floor(random()*styles.length)];
    if(!rankings.has(style))rankings.set(style,rankingFor(state,style));
    next=botPick(next,random,style,rankings.get(style));
  }
  return next;
}
export function draftSummary(state) {
  return Array.from({length:TEAM_COUNT},(_,team)=>{
    const roster=teamRoster(state,team);
    const allProjected=roster.length===ROUNDS&&roster.every(p=>Number.isFinite(p.projectedFP));
    const metric=scoringMetric(state),complete=roster.length>0&&roster.every(p=>seasonScore(p,metric)!==null);
    return {team:team+1,players:roster.length,cost:teamCost(state,team),metric,
      score:complete?roster.reduce((sum,p)=>sum+seasonScore(p,metric),0):null,
      projectedFP:allProjected?roster.reduce((sum,p)=>sum+p.projectedFP,0):null,
      rookieCount:roster.filter(p=>p.isRookie===true).length,
      rookieRule:roster.length===ROUNDS?(roster.some(p=>p.isRookie===true)?'PASS':roster.some(p=>p.isRookie==null)?'UNKNOWN':'FAIL'):'INCOMPLETE'};
  });
}
export function batchSimulations(state,{runs=100,seed=1}={}) {
  if(!Number.isInteger(runs)||runs<1||runs>1000)throw Error('Число прогонов должно быть от 1 до 1000');
  const results=[];
  for(let i=0;i<runs;i++){
    const completed=simulateDraft(state,{seed:seed+i});
    const summary=draftSummary(completed);
    const eligible=summary.every((t,i)=>t.players===ROUNDS&&t.score!==null&&t.rookieRule==='PASS'&&(completed.priceMode!=='ON'||t.cost<=completed.cap)&&rosterFits(teamRoster(completed,i)));
    const best=eligible?Math.max(...summary.map(t=>t.score)):null;
    results.push({seed:seed+i,teams:summary,winners:best===null?[]:summary.filter(t=>t.score===best).map(t=>t.team),eligible});
  }
  return {metric:scoringMetric(state),runs,results,eligibleRuns:results.filter(x=>x.eligible).length,
    // No winner claims if even one simulation violates the rookie rule.
    wins:results.every(x=>x.eligible)?Array.from({length:TEAM_COUNT},(_,i)=>results.reduce((sum,r)=>sum+(r.winners.includes(i+1)?1/r.winners.length:0),0)):null};
}

function normalDraw(random) {
  const u=Math.max(Number.EPSILON,random()),v=random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function quantile(sorted,q) {
  const at=(sorted.length-1)*q,low=Math.floor(at),high=Math.ceil(at);
  return sorted[low]+(sorted[high]-sorted[low])*(at-low);
}
// A season drawn from the player's forecast range: a two-sided normal through the weak season (10th percentile),
// the expectation and, where the two allow it, the strong season (90th percentile); otherwise the upside narrows so
// the expectation is never inflated. Ranges are forward-calibrated on past seasons. No season goes below zero.
const Z90=1.2815515655,HALF=Math.sqrt(2/Math.PI)/2;
export function scenarioSeasonScore(player,z) {
  const {seasonFloor:floor,meanSeason:mean,seasonCeiling:ceiling}=player.forecast;
  // Median m with P10=floor and P90=ceiling has mean m+(ceiling+floor-2m)*HALF/Z90; solve for the given mean.
  const k=HALF/Z90,median=Math.min(ceiling,Math.max(floor,(mean-k*(ceiling+floor))/(1-2*k)));
  const low=(median-floor)/Z90,high=Math.max(0,(mean-median)/HALF+low);
  return Math.max(0,median+z*(z<0?low:high));
}
// Season errors of players of one NBA club move together by this measured correlation (projection model audit).
const clubCorrelation=player=>Number.isFinite(player.forecast?.clubCorrelation)?player.forecast.clubCorrelation:0;
function validateCompletedRoster(state) {
  if(!isComplete(state))throw Error('Сценарии сезона доступны после 80-го пика');
  if(scoringMetric(state)!==FULL_SEASON)throw Error('Для сценариев сезона нужны прогнозы полной формулы Sports.ru');
  const summary=draftSummary(state);
  const legal=summary.every((t,i)=>t.players===ROUNDS&&t.score!==null&&t.rookieRule==='PASS'&&(state.priceMode!=='ON'||t.cost<=state.cap)&&rosterFits(teamRoster(state,i)));
  if(!legal)throw Error('Составы должны соблюдать позиции Sports.ru, rookie и salary cap');
  for(const team of Array.from({length:TEAM_COUNT},(_,i)=>teamRoster(state,i)))for(const player of team){
    const f=player.forecast;
    if(!f||![f.seasonFloor,f.meanSeason,f.seasonCeiling].every(Number.isFinite)||f.seasonFloor>f.meanSeason||f.meanSeason>f.seasonCeiling)throw Error('У каждого выбранного игрока нужен согласованный диапазон слабый / базовый / сильный сезон');
  }
}
export function wilsonInterval(wins,runs){
 const z=1.95996398454,p=wins/runs,d=1+z*z/runs;
 const center=(p+z*z/(2*runs))/d,half=z*Math.sqrt(p*(1-p)/runs+z*z/(4*runs*runs))/d;
 return [Math.max(0,center-half)*100,Math.min(1,center+half)*100];
}
export function seasonSensitivitySimulations(state,{runs=5000,seed=1}={}) {
  if(!Number.isInteger(runs)||runs<100||runs>20000)throw Error('Число сезонных сценариев должно быть от 100 до 20000');
  validateCompletedRoster(state);
  const random=randomFromSeed(seed),rosters=Array.from({length:TEAM_COUNT},(_,i)=>teamRoster(state,i));
  const totals=Array.from({length:TEAM_COUNT},()=>[]),wins=Array(TEAM_COUNT).fill(0);
  const places=Array.from({length:TEAM_COUNT},()=>Array(TEAM_COUNT).fill(0));
  for(let run=0;run<runs;run++){
    // A league-wide swing moves every FBL team alike and cannot change the places, so only clubs and players vary.
    const nbaTeamShocks=new Map(),scores=[];
    for(let team=0;team<TEAM_COUNT;team++){
      let total=0;
      for(const player of rosters[team]){
        const key=player.team||`player:${player.id}`;
        if(!nbaTeamShocks.has(key))nbaTeamShocks.set(key,normalDraw(random));
        const rho=Math.max(0,clubCorrelation(player)),z=Math.sqrt(rho)*nbaTeamShocks.get(key)+Math.sqrt(1-rho)*normalDraw(random);
        total+=scenarioSeasonScore(player,z);
      }
      scores.push(total);totals[team].push(total);
    }
    scores.map((score,i)=>[score,i]).sort((a,b)=>b[0]-a[0]).forEach(([,i],rank)=>places[i][rank]++);
    const best=Math.max(...scores),leaders=scores.map((score,i)=>score===best?i:-1).filter(i=>i>=0);
    for(const team of leaders)wins[team]+=1/leaders.length;
  }
  const base=draftSummary(state);
  const teams=totals.map((values,i)=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return {team:i+1,base:base[i].score,mean:values.reduce((sum,x)=>sum+x,0)/runs,p10:quantile(sorted,.1),p50:quantile(sorted,.5),p90:quantile(sorted,.9),firstPlaceShare:wins[i]/runs*100,firstPlaceCI:wilsonInterval(wins[i],runs),places:places[i].map(c=>c/runs*100)};
  });
  return {kind:'SEASON_SENSITIVITY',metric:FULL_SEASON,runs,teams,
    assumptions:{range:'Сезон каждого игрока — из его диапазона прогноза: слабый и сильный сезон — 10-й и 90-й процентили, откалиброванные на прошлых сезонах',correlation:`связь ошибок игроков одного клуба NBA измерена по прошлым сезонам: ${(Math.max(0,clubCorrelation(rosters[0][0]))*100).toFixed(0)}%; общий фон лиги не меняет мест и не моделируется`}};
}
export function scenarioAnalysis(state,{seed=1,draftRuns=100,seasonRuns=5000}={}) {
  if(isComplete(state))return seasonSensitivitySimulations(state,{runs:seasonRuns,seed});
  return {kind:'DRAFT_COMPLETION',...batchSimulations(state,{runs:draftRuns,seed})};
}
