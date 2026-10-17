// Historical availability is evidence, not a calibrated medical forecast.
// The index is for ordering candidates, never labelled projected season FP.
export function availabilityEvidence(player){
 const history=player.historyGames||{},reference=player.historyReferenceSeason||'2025-26';
 const end=Number(reference.slice(0,4)),previous=`${end-1}-${String(end).slice(-2)}`;
 const recent=Number.isFinite(history[reference])?history[reference]:player.coverageStatus==='EARLIER_SEASON'?0:null;
 const prior=Number.isFinite(history[previous])?history[previous]:null;
 const games=recent===null?prior:prior===null?recent:(recent*2+prior)/3;
 const projected=player.espnContext?.projectedGames;const espnGames=Number.isFinite(projected)&&projected>0&&projected<=82?projected:null;
 return {recent,prior,reference,previous,weightedGames:games,espnGames,weightSource:espnGames!==null?'ESPN_PROJECTED_GAMES':'HISTORICAL_OBSERVED_GAMES',weight:espnGames!==null?espnGames/82:games===null?1:Math.max(0,Math.min(1,games/82)),repeatedAbsences:recent!==null&&prior!==null&&recent<50&&prior<50};
}
export function severeRisk(player){
 const evidence=availabilityEvidence(player);
 return Boolean(player.forecast?.conditionalOnRoster||['GROUP_PRIOR','LIMITED_PERSONAL'].includes(player.forecast?.coverageTier)||player.isRookie||player.coverageStatus==='LOW_SAMPLE'||player.coverageStatus==='EARLIER_SEASON'||player.returnContext||
  player.injuries?.some(i=>/out|suspension/i.test(i.status||''))||evidence.repeatedAbsences||(evidence.recent!==null&&evidence.recent<40));
}
export function draftValue(player){
 const forecast=player.forecast;
 if(forecast?.metric==='FBL_FULL_FORMULA_ESTIMATE'&&Number.isFinite(forecast.meanSeason))return forecast.meanSeason/82;
 const personal=player.espnContext?.individualProjection;
 if(personal?.metric==='FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES'&&Number.isFinite(personal.componentSeasonTotal))return personal.componentSeasonTotal/82;
 const evidence=availabilityEvidence(player);
 return (Number.isFinite(player.projectedFP)?player.projectedFP:-Infinity)*evidence.weight;
}
