import solver from 'javascript-lp-solver';
import {POSITIONS,TEAM_COUNT,ROUNDS,rosterFits} from './engine.js';
import {simulateDraft,teamRoster} from './simulation.js';
import {riskAdjustedValue,draftValue} from './valuation.js';

// Our future pick numbers in a straight draft.
export function ownPicks(state,team=0){
 return Array.from({length:ROUNDS},(_,r)=>r*TEAM_COUNT+team+1).filter(k=>k>state.picks.length);
}
// Monte Carlo of the bot opponents from the current state: for each undrafted player,
// the share of drafts in which he is still undrafted when each of our future picks arrives.
export function availabilityProfile(state,{runs=50,team=0}={}){
 const picks=ownPicks(state,team),used=new Set(state.picks.map(p=>p.playerId));
 const counts=new Map(state.players.filter(p=>!used.has(p.id)).map(p=>[p.id,picks.map(()=>0)]));
 let done=0;
 for(let seed=1;seed<=runs;seed++){
  let draft;try{draft=simulateDraft(state,{seed:7919*seed});}catch{continue;}
  done++;const takenAt=new Map(draft.picks.slice(state.picks.length).map(x=>[x.playerId,x.number]));
  for(const [id,row] of counts){const at=takenAt.get(id)??Infinity;picks.forEach((k,r)=>{if(at>=k)row[r]++;});}
 }
 if(!done)throw Error('Не удалось смоделировать ни одного продолжения драфта');
 return {picks,runs:done,availability:new Map([...counts].map(([id,row])=>[id,row.map(c=>c/done)]))};
}
const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
// Exact best completion of our ten: budget, two slots per position (Hall's condition over position sets),
// at least one rookie, and pick deadlines (a player may fill round r only if he survives to it with probability >= threshold).
export function planRoster(state,profile,{threshold=0.8,team=0,force=null}={}){
 const {picks,availability}=profile,R=picks.length;if(!R)return null;
 const mine=teamRoster(state,team),priced=state.priceMode==='ON';
 const budget=priced?state.cap-mine.reduce((s,p)=>s+p.price,0):Infinity;
 const model={optimize:'value',opType:'max',constraints:{count:{equal:R}},variables:{},ints:{}};
 if(priced)model.constraints.budget={max:budget};
 if(!mine.some(p=>p.isRookie===true))model.constraints.rookie={min:1};
 subsets.forEach((T,i)=>{model.constraints['pos'+i]={max:2*T.length-mine.filter(p=>p.positions.every(x=>T.includes(x))).length};});
 for(let r=1;r<R;r++)model.constraints['round'+r]={max:r};
 const candidates=[];
 for(const p of state.players){
  const odds=availability.get(p.id);if(!odds||!p.positions.length||!Number.isFinite(draftValue(p)))continue;
  if(priced&&(p.priceStatus!=='VERIFIED'||!Number.isFinite(p.price)))continue;
  let deadline=-1;odds.forEach((a,r)=>{if(a>=threshold)deadline=r;});
  if(force!==null&&p.id===force){if(odds[0]<1-1e-9)return null;deadline=0;}
  if(deadline<0)continue;
  const v={value:riskAdjustedValue(p)*82,count:1};if(priced)v.budget=p.price;if(p.isRookie===true)v.rookie=1;
  subsets.forEach((T,i)=>{if(p.positions.every(x=>T.includes(x)))v['pos'+i]=1;});
  for(let r=deadline+1;r<R;r++)v['round'+r]=1;
  if(force!==null&&p.id===force){v.forced=1;model.constraints.forced={equal:1};}
  // Integer variables are unbounded in this solver: cap each player at one.
  const key='p'+candidates.length;v['one'+key]=1;model.constraints['one'+key]={max:1};model.variables[key]=v;model.ints[key]=1;candidates.push({player:p,deadline,key,odds});
 }
 if(force!==null&&!model.constraints.forced)return null;
 const result=solver.Solve(model);if(!result.feasible)return null;
 // Earliest deadline first gives a valid round for every chosen player; the first one is the pick to make now.
 const chosen=candidates.filter(c=>result[c.key]>0.5).sort((a,b)=>a.deadline-b.deadline||riskAdjustedValue(b.player)-riskAdjustedValue(a.player));
 // Never present a solver answer that breaks a draft rule.
 const roster=[...mine,...chosen.map(c=>c.player)];
 if(chosen.length!==R||candidates.some(c=>Math.abs(result[c.key]??0)>1e-6&&Math.abs((result[c.key]??0)-1)>1e-6)||!rosterFits(roster)||
  (priced&&roster.reduce((s,p)=>s+p.price,0)>state.cap)||!roster.some(p=>p.isRookie===true)||chosen.some((c,r)=>c.deadline<r))return null;
 return {value:result.result,spent:mine.reduce((s,p)=>s+(p.price||0),0)+chosen.reduce((s,c)=>s+(c.player.price||0),0),
  plan:chosen.map((c,r)=>({pick:picks[r],player:c.player,survival:c.odds[r],nextSurvival:c.odds[r+1]??null})),now:chosen[0]?.player??null};
}
// The best plan plus the best plan after each strong alternative taken now, so the cost of every choice is explicit.
export function planAdvice(state,{runs=50,threshold=0.8,alternatives=8,team=0}={}){
 const profile=availabilityProfile(state,{runs,team});
 const best=planRoster(state,profile,{threshold,team});if(!best)return {profile:{picks:profile.picks,runs},best:null,options:[]};
 const nowPick=profile.picks[0],onTheClock=nowPick===state.picks.length+1;
 const pool=state.players.filter(p=>profile.availability.get(p.id)?.[0]===1&&Number.isFinite(draftValue(p))&&(state.priceMode!=='ON'||p.priceStatus==='VERIFIED'))
  .sort((a,b)=>riskAdjustedValue(b)-riskAdjustedValue(a)).slice(0,alternatives);
 const options=[];
 for(const p of [best.now,...pool.filter(p=>p.id!==best.now.id)]){
  const plan=p.id===best.now.id?best:planRoster(state,profile,{threshold,team,force:p.id});
  if(plan)options.push({player:p,value:plan.value,delta:plan.value-best.value,nextSurvival:profile.availability.get(p.id)?.[1]??null});
 }
 options.sort((a,b)=>b.value-a.value);
 return {profile:{picks:profile.picks,runs},onTheClock,threshold,best,options};
}
