import {pickCompletion} from './completion.js';
// Rookie-only comparison: source projections share the same deliberately partial
// FBL metric. Never rank group priors alongside personal projections as equals.
export function rookieRecommendations(state){
 const used=new Set(state.picks.map(p=>p.playerId));
 const available=state.players.filter(p=>p.isRookie===true&&!used.has(p.id));
 const projected=available.filter(p=>p.espnContext?.individualProjection?.metric==='FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES'&&Number.isFinite(p.espnContext.individualProjection.componentSeasonTotal));
 const out=p=>p.injuries?.some(i=>/out|suspension/i.test(i.status||''))?1:0;
 const sorted=projected.sort((a,b)=>out(a)-out(b)||b.espnContext.individualProjection.componentSeasonTotal-a.espnContext.individualProjection.componentSeasonTotal||String(a.id).localeCompare(String(b.id)));
 const feasible=sorted.filter(p=>pickCompletion(state,p.id).possible);
 const teamsNeedingRookie=Array.from({length:8},(_,team)=>state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId))).filter(roster=>!roster.some(p=>p?.isRookie)).length;
 return {players:feasible.slice(0,5),available:available.length,projected:projected.length,feasible:feasible.length,teamsNeedingRookie};
}
