import {pick} from './engine.js';
import {pickCompletion} from './completion.js';
import {riskAdjustedValue,draftValue} from './valuation.js';
import {simulateDraft,advanceBots,teamRoster,seasonSensitivitySimulations} from './simulation.js';

const cache=new WeakMap();
// Paired seeds make every candidate face the same opponent preferences.
// This is bounded rollout search, not a proof of global optimality.
export function evaluateRosterPicks(state,candidates){
 let stored=cache.get(state);if(!stored){stored=new Map();cache.set(state,stored);}
 const team=state.picks.length%8;
 return candidates.map(player=>{
  if(stored.has(player.id))return stored.get(player.id);
  const scores=[],adjusted=[],shares=[],survives=[];let failed=0;
  for(const seed of [713,2027,9059]){
   try{
    const completed=simulateDraft(pick(state,player.id),{seed});
    const roster=teamRoster(completed,team);
    scores.push(roster.reduce((sum,p)=>sum+draftValue(p)*82,0));
    adjusted.push(roster.reduce((sum,p)=>sum+riskAdjustedValue(p)*82,0));
    if(roster.every(p=>p.forecast)&&completed.players.filter(p=>completed.picks.some(x=>x.playerId===p.id)).every(p=>p.forecast)){
     shares.push(seasonSensitivitySimulations(completed,{runs:100,seed}).teams[team].firstPlaceShare);
    }
    // Observe the same continuation after choosing a different current player.
    const alternative=candidates.find(p=>p.id!==player.id);
    if(alternative){const other=advanceBots(pick(state,alternative.id),{seed,humanTeam:team});survives.push(!other.picks.slice(state.picks.length+1,state.picks.length+8).some(p=>p.playerId===player.id));}
   }catch{failed++;}
  }
  const average=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const result={player,expectedRoster:average(scores),adjustedRoster:average(adjusted),firstPlaceShare:average(shares),survival:average(survives),runs:scores.length,failed,completion:pickCompletion(state,player.id)};
  stored.set(player.id,result);return result;
 }).sort((a,b)=>(b.adjustedRoster??-Infinity)-(a.adjustedRoster??-Infinity)||riskAdjustedValue(b.player)-riskAdjustedValue(a.player));
}
