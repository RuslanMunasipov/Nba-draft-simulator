export const POSITIONS=['PG','SG','SF','PF','C'];
export const TEAM_COUNT=8, ROUNDS=10;
export const STATUS=['VERIFIED','ESTIMATED','MISSING'];
export function newDraft(players=[],cap=20000){
 if(!Number.isFinite(cap)||cap<0)throw Error('Неверный Salary Cap');
 if(!Array.isArray(players)||players.some(p=>!validatePlayer(p))||new Set(players.map(p=>p.id)).size!==players.length)throw Error('Неверные данные игроков или дубли ID');
 return {version:1,cap,players,picks:[]};
}
export function validatePlayer(p){return p!=null&&typeof p.name==='string'&&p.name.trim().length>0&&(p.price==null||(Number.isFinite(p.price)&&p.price>=0))&&(p.projectedFP==null||Number.isFinite(p.projectedFP))&&(p.isRookie==null||typeof p.isRookie==='boolean')&&Number.isInteger(p.id)&&p.id>0&&Array.isArray(p.positions)&&p.positions.length>0&&p.positions.every(x=>POSITIONS.includes(x))&&(!p.priceStatus||STATUS.includes(p.priceStatus));}
export function rosterFits(players){
 if(players.length>10)return false;
 const slots=POSITIONS.flatMap(p=>[p,p]);
 const assigned=Array(10).fill(-1);
 function assign(i,seen){
  for(let j=0;j<slots.length;j++)if(!seen.has(j)&&players[i].positions.includes(slots[j])){
   seen.add(j);
   if(assigned[j]===-1||assign(assigned[j],seen)){assigned[j]=i;return true;}
  }
  return false;
 }
 return players.every((_,i)=>assign(i,new Set()));
}
export function pick(state,playerId){
 if(state.picks.length>=80)throw Error('Драфт завершён');
 if(state.picks.some(p=>p.playerId===playerId))throw Error('Игрок уже выбран');
 const player=state.players.find(p=>p.id===playerId);
 if(!player||!validatePlayer(player))throw Error('Неизвестный игрок или позиции');
 const team=state.picks.length%TEAM_COUNT;
 const roster=state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId));
 if(!rosterFits([...roster,player]))throw Error('Невозможно назначить позиции');
 if([...roster,player].some(p=>p.priceStatus!=='VERIFIED'||!Number.isFinite(p.price)))throw Error('Цена не подтверждена');
 if(roster.length===9&&![...roster,player].some(p=>p.isRookie===true))throw Error('В составе нужен минимум один подтверждённый новичок');
 const cost=[...roster,player].reduce((s,p)=>s+p.price,0);
 if(cost>state.cap)throw Error('Превышен Salary Cap');
 return {...state,picks:[...state.picks,{number:state.picks.length+1,team,playerId}]};
}
export function undo(state){return {...state,picks:state.picks.slice(0,-1)};}
export function exportDraft(state){return JSON.stringify(state,null,2);}
export function importDraft(json){const state=JSON.parse(json);if(state.version!==1||!Array.isArray(state.players)||!Array.isArray(state.picks)||!Number.isFinite(state.cap)||state.cap<0)throw Error('Неверный формат');let replay=newDraft(state.players,state.cap);for(const p of state.picks){if(p.team!==replay.picks.length%8||p.number!==replay.picks.length+1)throw Error('Нарушен порядок пиков');replay=pick(replay,p.playerId);}return replay;}
export function recommendations(state){return state.players.filter(p=>!state.picks.some(x=>x.playerId===p.id)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).sort((a,b)=>(b.projectedFP??-Infinity)-(a.projectedFP??-Infinity)).slice(0,5);}
