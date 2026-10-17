import {rosterFits} from './engine.js';
import {pickCompletion} from './completion.js';
import {draftValue} from './valuation.js';
export function rookieWatch(state,limit=3){
 const team=state.picks.length%8;
 const roster=state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId));
 return state.players.filter(p=>p.isRookie&&p.espnContext?.individualProjection&&Number.isFinite(draftValue(p)))
  .sort((a,b)=>draftValue(b)-draftValue(a)||String(a.id).localeCompare(String(b.id))).slice(0,limit).map(player=>{
   const taken=state.picks.find(p=>p.playerId===player.id);
   if(taken)return {player,status:'TAKEN',reason:`Выбран GM ${taken.team+1} на пике №${taken.number}`};
   if(!rosterFits([...roster,player]))return {player,status:'BLOCKED',reason:`Нет места на ${player.positions.join('/')}: текущие позиции состава уже заняты. Можно отменить предыдущий пик.`};
   const plan=pickCompletion(state,player.id);
   return {player,status:plan.possible?'AVAILABLE':'BLOCKED',reason:plan.possible?'Доступен для текущей команды':plan.reason};
  });
}
export function rookieSlotWarnings(state,candidate){
 if(candidate.isRookie)return [];
 const roster=state.picks.filter(p=>p.team===state.picks.length%8).map(p=>state.players.find(x=>x.id===p.playerId));
 return rookieWatch(state).filter(w=>w.status==='AVAILABLE'&&!rosterFits([...roster,candidate,w.player]))
  .map(w=>`После выбора ${candidate.name} не останется места для ${w.player.name} (${w.player.positions.join('/')}). Если хочешь этого rookie — выбери его раньше.`);
}
