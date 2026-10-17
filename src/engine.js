import {draftValue,severeRisk} from './valuation.js';
export const POSITIONS=['PG','SG','SF','PF','C'];
export const TEAM_COUNT=8, ROUNDS=10;
export const STATUS=['VERIFIED','ESTIMATED','MISSING'];
// Draft states are immutable; cache ID lookup and current rosters across candidate checks.
const indexes=new WeakMap(),rosters=new WeakMap();
export function getPlayer(state,id){
 let index=indexes.get(state.players);if(!index){index=new Map(state.players.map(p=>[p.id,p]));indexes.set(state.players,index);}return index.get(id);
}
function cachedRoster(state,team){
 let teams=rosters.get(state);if(!teams){teams=Array.from({length:TEAM_COUNT},()=>[]);for(const choice of state.picks)teams[choice.team].push(getPlayer(state,choice.playerId));rosters.set(state,teams);}return teams[team];
}
export function newDraft(players=[],cap=20000,priceMode='OFF'){
 if(!['OFF','ON'].includes(priceMode))throw Error('Неверный режим цен');
 if(!Number.isFinite(cap)||cap<0)throw Error('Неверный Salary Cap');
 if(!Array.isArray(players)||players.some(p=>!validatePlayer(p))||new Set(players.map(p=>p.id)).size!==players.length)throw Error('Неверные данные игроков или дубли ID');
 return {version:1,cap,priceMode,players,picks:[]};
}
export function validatePlayer(p){return p!=null&&typeof p.name==='string'&&p.name.trim().length>0&&(p.price==null||(Number.isFinite(p.price)&&p.price>=0))&&(p.projectedFP==null||Number.isFinite(p.projectedFP))&&(p.isRookie==null||typeof p.isRookie==='boolean')&&((Number.isInteger(p.id)&&p.id>0)||(typeof p.id==='string'&&/^espn:[0-9]+$/.test(p.id)))&&Array.isArray(p.positions)&&(p.positions.length>0||p.positionStatus==='MISSING')&&p.positions.every(x=>POSITIONS.includes(x))&&(!p.priceStatus||STATUS.includes(p.priceStatus));}
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
 if(state.pricingIssue)throw Error(state.pricingIssue);
 if(state.picks.length>=80)throw Error('Драфт завершён');
 if(state.picks.some(p=>p.playerId===playerId))throw Error('Игрок уже выбран');
 const player=getPlayer(state,playerId);
 if(!player||!validatePlayer(player)||player.positions.length===0)throw Error('Неизвестный игрок или позиции');
 const team=state.picks.length%TEAM_COUNT;
 const roster=cachedRoster(state,team);
 if(!rosterFits([...roster,player]))throw Error('Невозможно назначить позиции');
 if(state.priceMode==='ON'&&[...roster,player].some(p=>p.priceStatus!=='VERIFIED'||!Number.isFinite(p.price)))throw Error('Цена не подтверждена');
 if(roster.length===9&&![...roster,player].some(p=>p.isRookie===true))throw Error('В составе нужен минимум один подтверждённый новичок');
 const cost=[...roster,player].every(p=>Number.isFinite(p.price))?[...roster,player].reduce((s,p)=>s+p.price,0):null;
 if(state.priceMode==='ON'&&cost>state.cap)throw Error('Превышен Salary Cap');
 return {...state,picks:[...state.picks,{number:state.picks.length+1,team,playerId}]};
}
export function undo(state){return {...state,picks:state.picks.slice(0,-1)};}
export function exportDraft(state){return JSON.stringify(state,null,2);}
export function importDraft(json){const state=JSON.parse(json);if(state.version!==1||!Array.isArray(state.players)||!Array.isArray(state.picks)||!Number.isFinite(state.cap)||state.cap<0)throw Error('Неверный формат');let replay=newDraft(state.players,state.cap,state.priceMode??'ON');for(const p of state.picks){if(p.team!==replay.picks.length%8||p.number!==replay.picks.length+1)throw Error('Нарушен порядок пиков');replay=pick(replay,p.playerId);}return {...replay,...(typeof state.databaseVersion==='string'?{databaseVersion:state.databaseVersion}:{})};}
export function riskPriority(player){return player.injuries?.some(i=>/out|suspension/i.test(i.status||''))?2:player.injuries?.length||player.returnContext?1:0;}
export function recommendations(state){const legal=state.players.filter(p=>!state.picks.some(x=>x.playerId===p.id)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).filter(p=>Number.isFinite(p.projectedFP));const safer=legal.filter(p=>!severeRisk(p));return (safer.length?safer:legal).sort((a,b)=>draftValue(b)-draftValue(a)).slice(0,5);}
