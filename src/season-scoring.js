// A draft comparison uses one metric throughout; incomplete forecasts never become zero.
export const FULL_SEASON='FBL_FULL_FORMULA_ESTIMATE';
export function fullSeason(player){return player.forecast?.metric===FULL_SEASON&&Number.isFinite(player.forecast.meanSeason)?player.forecast.meanSeason:null;}
export function scoringMetric(state){return state.players.some(p=>fullSeason(p)!==null)?FULL_SEASON:'IMPORTED_BASELINE';}
export function seasonScore(player,metric){return metric===FULL_SEASON?fullSeason(player):Number.isFinite(player.projectedFP)?player.projectedFP:null;}
