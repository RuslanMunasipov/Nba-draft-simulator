// Historical availability is evidence, not a calibrated medical forecast.
// The index is for ordering candidates, never labelled projected season FP.
export function availabilityEvidence(player){
 const history=player.historyGames||{},reference=player.historyReferenceSeason||'2025-26';
 const end=Number(reference.slice(0,4)),previous=`${end-1}-${String(end).slice(-2)}`;
 const recent=Number.isFinite(history[reference])?history[reference]:player.coverageStatus==='EARLIER_SEASON'?0:null;
 const prior=Number.isFinite(history[previous])?history[previous]:null;
 const games=recent===null?prior:prior===null?recent:(recent*2+prior)/3;
 return {recent,prior,reference,previous,weightedGames:games,weight:games===null?1:Math.max(0,Math.min(1,games/82)),repeatedAbsences:recent!==null&&prior!==null&&recent<50&&prior<50};
}
export function severeRisk(player){
 const evidence=availabilityEvidence(player);
 return Boolean(player.isRookie||player.coverageStatus==='LOW_SAMPLE'||player.coverageStatus==='EARLIER_SEASON'||player.returnContext||
  player.injuries?.some(i=>/out|suspension/i.test(i.status||''))||evidence.repeatedAbsences||Object.values(player.historyGames||{}).some(n=>n<40));
}
export function draftValue(player){
 const evidence=availabilityEvidence(player);
 const role=(player.newHighVolumeTeammates?.length||player.roleContext?.roleChange)?.85:1;
 const status=player.injuries?.some(i=>/out|suspension/i.test(i.status||''))?.5:1;
 return (Number.isFinite(player.projectedFP)?player.projectedFP:-Infinity)*evidence.weight*role*status;
}
