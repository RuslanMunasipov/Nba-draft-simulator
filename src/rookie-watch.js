import {scoringMetric,fullSeason,FULL_SEASON} from './season-scoring.js';
import {rosterFits,clubsFit,clubOf} from './engine.js';
import {pickCompletion,completionPlan} from './completion.js';
import {draftValue} from './valuation.js';
// The five best rookies with their status; `available` watches the five best still undrafted instead, so the warnings
// do not go silent once the leading five are taken.
export function rookieWatch(state,limit=5,{available=false}={}){
 const team=state.picks.length%8;
 const roster=state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId));
 return state.players.filter(p=>p.isRookie&&p.espnContext?.individualProjection&&(scoringMetric(state)!==FULL_SEASON||fullSeason(p)!==null)&&Number.isFinite(draftValue(p))&&(!available||!state.picks.some(x=>x.playerId===p.id)))
  .sort((a,b)=>draftValue(b)-draftValue(a)||String(a.id).localeCompare(String(b.id))).slice(0,limit).map(player=>{
   const taken=state.picks.find(p=>p.playerId===player.id);
   if(taken)return {player,status:'TAKEN',reason:`Выбран GM ${taken.team+1} на пике №${taken.number}`};
   if(!player.positions.length)return {player,status:'BLOCKED',reason:'Позиции драфта пока не подтверждены; выбор заблокирован.'};
   if(!rosterFits([...roster,player]))return {player,status:'BLOCKED',reason:`Нет места на ${player.positions.join('/')}: текущие позиции состава уже заняты. Можно отменить предыдущий пик.`};
   const plan=pickCompletion(state,player.id);
   return {player,status:plan.possible?'AVAILABLE':'BLOCKED',reason:plan.possible?'Доступен для текущей команды':plan.reason};
  });
}
// A pick can shut a watched rookie out by position, by the two-per-club rule or by the budget of the full roster: the
// candidate and the rookie are both put on the roster and the rest must still complete. A team that already has its
// rookie needs no warning.
export function rookieSlotWarnings(state,candidate){
 if(candidate.isRookie)return [];
 const team=state.picks.length%8,roster=state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId));
 if(roster.some(p=>p?.isRookie===true))return [];
 const tail=`Если хочешь этого rookie — выбери его раньше.`;
 return rookieWatch(state,5,{available:true}).filter(w=>w.status==='AVAILABLE').map(({player:rookie})=>{
  const both=[...roster,candidate,rookie];
  if(!rosterFits(both))return `После выбора ${candidate.name} не останется места для ${rookie.name} (${rookie.positions.join('/')}). ${tail}`;
  if(!clubsFit(both))return `После выбора ${candidate.name} не останется места для ${rookie.name}: он был бы третьим игроком ${clubOf(rookie)} (правило Sports.ru). ${tail}`;
  const n=state.picks.length,plan=completionPlan({...state,picks:[...state.picks,{number:n+1,team,playerId:candidate.id},{number:n+2,team,playerId:rookie.id}]},team);
  return plan.possible?null:`После выбора ${candidate.name} с ${rookie.name} уже не собрать состав: ${plan.reason.charAt(0).toLowerCase()+plan.reason.slice(1)}. ${tail}`;
 }).filter(Boolean);
}
