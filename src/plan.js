import solver from 'javascript-lp-solver';
import {POSITIONS,TEAM_COUNT,ROUNDS,rosterFits,clubsFit,clubOf,CLUB_LIMIT,pick} from './engine.js';
import {pickCompletion} from './completion.js';
import {simulateDraft,teamRoster,randomFromSeed} from './simulation.js';
import {riskAdjustedValue,draftValue} from './valuation.js';

// Our future pick numbers in a straight draft.
export function ownPicks(state,team=0){
 return Array.from({length:ROUNDS},(_,r)=>r*TEAM_COUNT+team+1).filter(k=>k>state.picks.length);
}
// Monte Carlo of the bot opponents from the current state: for each undrafted player,
// the share of drafts in which he is still undrafted when each of our future picks arrives.
// Human GMs follow consensus ranks more than our forecasts: each pick takes the best legal player by ESPN ADP
// with rank noise growing with ADP (players without ADP rank after everyone who has one).
export function adpDraft(state,seed){
 const random=randomFromSeed(seed),gauss=()=>Math.sqrt(-2*Math.log(1-random()))*Math.cos(2*Math.PI*random());
 const fallback=new Map([...state.players].filter(p=>!Number.isFinite(p.espnContext?.adp)).sort((a,b)=>riskAdjustedValue(b)-riskAdjustedValue(a)).map((p,i)=>[p.id,150+i]));
 const rank=p=>{const adp=Number.isFinite(p.espnContext?.adp)?p.espnContext.adp:fallback.get(p.id);return adp+gauss()*(1.5+0.2*adp);};
 let next=state;
 while(next.picks.length<TEAM_COUNT*ROUNDS){
  const used=new Set(next.picks.map(p=>p.playerId));
  const order=next.players.filter(p=>!used.has(p.id)&&p.positions.length&&(next.priceMode!=='ON'||p.priceStatus==='VERIFIED')).map(p=>[rank(p),p]).sort((a,b)=>a[0]-b[0]);
  let moved=false;
  for(const [,p] of order){try{if(!pickCompletion(next,p.id).possible)continue;next=pick(next,p.id);moved=true;break;}catch{}}
  if(!moved)throw Error('ADP-модель не нашла допустимый пик');
 }
 return next;
}
// Survival to each of our picks counts only opponents' picks. When our own simulated pick takes a player, he is known
// to be there at that pick and his fate afterwards is unknown (censored): a Kaplan-Meier product over the gaps between
// our picks uses exactly that, instead of counting our own choice as a loss.
export function availabilityProfile(state,{runs=50,team=0}={}){
 const picks=ownPicks(state,team),used=new Set(state.picks.map(p=>p.playerId));
 const ids=state.players.filter(p=>!used.has(p.id)).map(p=>p.id);
 const atRisk=new Map(ids.map(id=>[id,picks.map(()=>0)])),lost=new Map(ids.map(id=>[id,picks.map(()=>0)]));
 let done=0;
 // Half the futures use the app's forecast-driven bots, half ADP-driven humans: the plan must survive both.
 for(let seed=1;seed<=runs;seed++){
  let draft;try{draft=seed%2?simulateDraft(state,{seed:7919*seed}):adpDraft(state,7919*seed);}catch{continue;}
  done++;const taken=new Map(draft.picks.slice(state.picks.length).map(x=>[x.playerId,x]));
  for(const id of ids){
   const x=taken.get(id),risk=atRisk.get(id),loss=lost.get(id);
   // Interval r: from our pick r-1 (or now) up to our pick r.
   for(let r=0;r<picks.length;r++){
    const from=r?picks[r-1]:state.picks.length+1;
    if(x&&x.number<from)break;
    risk[r]++;
    if(x&&x.number<picks[r]){if(x.team!==team)loss[r]++;break;}
    if(x&&x.number===picks[r])break;
   }
  }
 }
 if(!done)throw Error('Не удалось смоделировать ни одного продолжения драфта');
 // A player our own bot always takes leaves no evidence for later gaps: his hazard is then pooled from the ten players
 // ranked next to him by value, who face the same opponents.
 const worth=new Map(state.players.map(p=>[p.id,riskAdjustedValue(p)])),ranked=[...ids].sort((a,b)=>(worth.get(b)||0)-(worth.get(a)||0));
 const MIN_RISK=5,hazard=(i,r)=>{
  const id=ranked[i];if(atRisk.get(id)[r]>=MIN_RISK)return lost.get(id)[r]/atRisk.get(id)[r];
  let n=0,k=0;for(let j=Math.max(0,i-5);j<=Math.min(ranked.length-1,i+5);j++){n+=atRisk.get(ranked[j])[r];k+=lost.get(ranked[j])[r];}
  return n?k/n:0;
 };
 const availability=new Map(ranked.map((id,i)=>{let s=1;return [id,picks.map((_,r)=>{s*=1-hazard(i,r);return s;})];}));
 return {picks,runs:done,availability};
}
// The GM's own percentage adjustments (expert opinion, role changes) scale our objective only; opponents keep their own view.
export function planValue(p,adjust={}){return riskAdjustedValue(p)*82*(1+(Number(adjust[p.id])||0)/100);}
const subsets=Array.from({length:31},(_,m)=>POSITIONS.filter((_,i)=>(m+1)>>i&1));
// Exact best completion of our ten: budget, two slots per position (Hall's condition over position sets),
// at least one rookie, and pick deadlines (a player may fill round r only if he survives to it with probability >= threshold).
export function planRoster(state,profile,{threshold=0.8,team=0,force=null,adjust={}}={}){
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
  const v={value:planValue(p,adjust),count:1};if(priced)v.budget=p.price;if(p.isRookie===true)v.rookie=1;
  subsets.forEach((T,i)=>{if(p.positions.every(x=>T.includes(x)))v['pos'+i]=1;});
  const club=clubOf(p);
  if(club!==null&&CLUB_LIMIT!==Infinity){const key='club:'+club;v[key]=1;model.constraints[key]??={max:CLUB_LIMIT-mine.filter(q=>clubOf(q)===club).length};}
  for(let r=deadline+1;r<R;r++)v['round'+r]=1;
  if(force!==null&&p.id===force){v.forced=1;model.constraints.forced={equal:1};}
  // Integer variables are unbounded in this solver: cap each player at one.
  const key='p'+candidates.length;v['one'+key]=1;model.constraints['one'+key]={max:1};model.variables[key]=v;model.ints[key]=1;candidates.push({player:p,deadline,key,odds});
 }
 if(force!==null&&!model.constraints.forced)return null;
 const result=solver.Solve(model);if(!result.feasible)return null;
 // Earliest deadline first gives a valid round for every chosen player; the first one is the pick to make now.
 const chosen=candidates.filter(c=>result[c.key]>0.5).sort((a,b)=>a.deadline-b.deadline||planValue(b.player,adjust)-planValue(a.player,adjust));
 // Never present a solver answer that breaks a draft rule.
 const roster=[...mine,...chosen.map(c=>c.player)];
 if(chosen.length!==R||candidates.some(c=>Math.abs(result[c.key]??0)>1e-6&&Math.abs((result[c.key]??0)-1)>1e-6)||!rosterFits(roster)||!clubsFit(roster)||
  (priced&&roster.reduce((s,p)=>s+p.price,0)>state.cap)||!roster.some(p=>p.isRookie===true)||chosen.some((c,r)=>c.deadline<r))return null;
 return {value:result.result,spent:mine.reduce((s,p)=>s+(p.price||0),0)+chosen.reduce((s,c)=>s+(c.player.price||0),0),
  plan:chosen.map((c,r)=>({pick:picks[r],player:c.player,survival:c.odds[r],nextSurvival:c.odds[r+1]??null})),now:chosen[0]?.player??null};
}
// The best plan plus the best plan after each strong alternative taken now, so the cost of every choice is explicit.
export function planAdvice(state,{runs=50,threshold=0.8,alternatives=8,team=0,adjust={}}={}){
 const profile=availabilityProfile(state,{runs,team});
 const best=planRoster(state,profile,{threshold,team,adjust});if(!best)return {profile:{picks:profile.picks,runs},best:null,options:[]};
 const nowPick=profile.picks[0],onTheClock=nowPick===state.picks.length+1;
 const pool=state.players.filter(p=>profile.availability.get(p.id)?.[0]===1&&Number.isFinite(draftValue(p))&&(state.priceMode!=='ON'||p.priceStatus==='VERIFIED'))
  .sort((a,b)=>planValue(b,adjust)-planValue(a,adjust)).slice(0,alternatives);
 const options=[];
 for(const p of [best.now,...pool.filter(p=>p.id!==best.now.id)]){
  const plan=p.id===best.now.id?best:planRoster(state,profile,{threshold,team,force:p.id,adjust});
  if(plan)options.push({player:p,value:plan.value,delta:plan.value-best.value,nextSurvival:profile.availability.get(p.id)?.[1]??null});
 }
 options.sort((a,b)=>b.value-a.value);
 return {profile:{picks:profile.picks,runs},onTheClock,threshold,best,options,adjust};
}
