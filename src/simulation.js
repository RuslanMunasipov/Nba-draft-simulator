import {draftValue,severeRisk} from './valuation.js';
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
  return state.players.filter(p=>!used.has(p.id)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}});
}
export function botPick(state,random=randomFromSeed(1),style='balanced') {
  let candidates=availableCandidates(state);
  const roster=teamRoster(state,currentTeam(state));
  // Reserve a rookie; budget is only relevant when official prices exist.
  if(!roster.some(p=>p.isRookie===true)){
    const teamsNeedingRookie=Array.from({length:TEAM_COUNT},(_,team)=>teamRoster(state,team)).filter(r=>!r.some(p=>p.isRookie===true)).length;
    const rookies=candidates.filter(p=>p.isRookie===true);
    if(roster.length>=5||rookies.length<=teamsNeedingRookie)candidates=rookies;
  }
  if(state.priceMode==='ON'){
    const remaining=ROUNDS-roster.length;
    const affordable=candidates.filter(p=>p.price<=(state.cap-teamCost(state,currentTeam(state)))/remaining);
    if(affordable.length)candidates=affordable;
  }
  if(!candidates.length) throw Error('Нет допустимых игроков для бота: проверьте позиции, новичков и справочник');
  // Only explicitly supplied projections are usable. Never synthesize fantasy points.
  const ranked=candidates.filter(p=>Number.isFinite(p.projectedFP)).sort((a,b)=>Number(severeRisk(a))-Number(severeRisk(b))||draftValue(b)-draftValue(a)||riskPriority(a)-riskPriority(b));
  if(!ranked.length) throw Error('Симуляция требует прогнозов projectedFP; без них бот не будет притворяться аналитиком');
  const pool=ranked.slice(0,Math.min(8,ranked.length));
  const index=style==='best' ? 0 : Math.min(pool.length-1,Math.floor(Math.pow(random(),style==='volatile'?0.65:2)*pool.length));
  return pick(state,pool[index].id);
}
export function advanceBots(state,{humanTeam=0,seed=1,style='balanced'}={}) {
  const random=randomFromSeed(seed);
  let next=state;
  while(!isComplete(next)&&currentTeam(next)!==humanTeam) next=botPick(next,random,style);
  return next;
}
export function simulateDraft(state,{seed=1,styles=['balanced','best','volatile']}={}) {
  const random=randomFromSeed(seed);
  let next=state;
  while(!isComplete(next)) {
    const style=styles[Math.floor(random()*styles.length)];
    next=botPick(next,random,style);
  }
  return next;
}
export function draftSummary(state) {
  return Array.from({length:TEAM_COUNT},(_,team)=>{
    const roster=teamRoster(state,team);
    const allProjected=roster.length===ROUNDS&&roster.every(p=>Number.isFinite(p.projectedFP));
    return {team:team+1,players:roster.length,cost:teamCost(state,team),
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
    const eligible=summary.every((t,i)=>t.projectedFP!==null&&t.rookieRule==='PASS'&&(completed.priceMode!=='ON'||t.cost<=completed.cap)&&rosterFits(teamRoster(completed,i)));
    const best=eligible?Math.max(...summary.map(t=>t.projectedFP)):null;
    results.push({seed:seed+i,teams:summary,winners:best===null?[]:summary.filter(t=>t.projectedFP===best).map(t=>t.team),eligible});
  }
  return {runs,results,eligibleRuns:results.filter(x=>x.eligible).length,
    // No winner claims if even one simulation violates the rookie rule.
    wins:results.every(x=>x.eligible)?Array.from({length:TEAM_COUNT},(_,i)=>results.reduce((sum,r)=>sum+(r.winners.includes(i+1)?1/r.winners.length:0),0)):null};
}
