import {riskAdjustedValue} from './valuation.js';
import RULES from '../data/league-rules.json' with {type:'json'};
export const POSITIONS=['PG','SG','SF','PF','C'];
export const TEAM_COUNT=RULES.teams, ROUNDS=RULES.rosterSize, DEFAULT_CAP=RULES.cap.default;
// Sports.ru: at most two players of one NBA club (rules page 150). Players without a known club are not limited.
export const CLUB_LIMIT=RULES.nbaClubLimit??Infinity;
export const clubOf=p=>p?.sportsClub??null;
export function clubsFit(players){const n=new Map();for(const p of players){const c=clubOf(p);if(c===null)continue;n.set(c,(n.get(c)||0)+1);if(n.get(c)>CLUB_LIMIT)return false;}return true;}
export const STATUS=['VERIFIED','ESTIMATED','MISSING'];
// Draft states are immutable; cache ID lookup and current rosters across candidate checks.
const indexes=new WeakMap(),rosters=new WeakMap();
export function getPlayer(state,id){
 let index=indexes.get(state.players);if(!index){index=new Map(state.players.map(p=>[p.id,p]));indexes.set(state.players,index);}return index.get(id);
}
function cachedRoster(state,team){
 let teams=rosters.get(state);if(!teams){teams=Array.from({length:TEAM_COUNT},()=>[]);for(const choice of state.picks)teams[choice.team].push(getPlayer(state,choice.playerId));rosters.set(state,teams);}return teams[team];
}
export function newDraft(players=[],cap=DEFAULT_CAP,priceMode='OFF'){
 if(!['OFF','ON'].includes(priceMode))throw Error('Неверный режим цен');
 if(!Number.isFinite(cap)||cap<0)throw Error('Неверный Salary Cap');
 if(!Array.isArray(players)||players.some(p=>!validatePlayer(p))||new Set(players.map(p=>p.id)).size!==players.length)throw Error('Неверные данные игроков или дубли ID');
 return {version:1,cap,priceMode,players,picks:[]};
}
// Only web links leave the page: an imported "javascript:" or data URL is never rendered as a link.
export const safeUrl=url=>typeof url==='string'&&/^https?:\/\//i.test(url)?url:null;
// Forecast numbers of an imported player must be numbers, or every later render would break on them.
const finiteOrMissing=v=>v==null||Number.isFinite(v);
function validForecast(f){return f==null||(typeof f==='object'&&['meanPerGame','meanSeason','games','seasonFloor','seasonCeiling','gameFloor','gameCeiling','minutes'].every(k=>finiteOrMissing(f[k])));}
export function validatePlayer(p){return p!=null&&validForecast(p.forecast)&&typeof p.name==='string'&&p.name.trim().length>0&&(p.price==null||(Number.isFinite(p.price)&&p.price>=0))&&(p.projectedFP==null||Number.isFinite(p.projectedFP))&&(p.isRookie==null||typeof p.isRookie==='boolean')&&((Number.isInteger(p.id)&&p.id>0)||(typeof p.id==='string'&&/^espn:[0-9]+$/.test(p.id)))&&Array.isArray(p.positions)&&(p.positions.length>0||p.positionStatus==='MISSING')&&p.positions.every(x=>POSITIONS.includes(x))&&(!p.priceStatus||STATUS.includes(p.priceStatus));}
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
 if(!clubsFit([...roster,player]))throw Error(`Больше ${CLUB_LIMIT} игроков из ${clubOf(player)} нельзя (правило Sports.ru)`);
 if(state.priceMode==='ON'&&[...roster,player].some(p=>p.priceStatus!=='VERIFIED'||!Number.isFinite(p.price)))throw Error('Цена не подтверждена');
 if(roster.length===9&&![...roster,player].some(p=>p.isRookie===true))throw Error('В составе нужен минимум один подтверждённый новичок');
 const cost=[...roster,player].every(p=>Number.isFinite(p.price))?[...roster,player].reduce((s,p)=>s+p.price,0):null;
 if(state.priceMode==='ON'&&cost>state.cap)throw Error('Превышен Salary Cap');
 return {...state,picks:[...state.picks,{number:state.picks.length+1,team,playerId}]};
}
export function undo(state){return {...state,picks:state.picks.slice(0,-1)};}
// Straight order fixes each later pick's team, so replay stops at the first pick the change made illegal.
export function replacePick(state,index,playerId){
 if(!Number.isInteger(index)||index<0||index>=state.picks.length)throw Error('Нет такого пика');
 const later=state.picks.slice(index+1);
 let next=pick({...state,picks:state.picks.slice(0,index)},playerId),kept=0;
 for(const choice of later){try{next=pick(next,choice.playerId);kept++;}catch{break;}}
 return {state:next,dropped:later.slice(kept)};
}
export function exportDraft(state){return JSON.stringify(state,null,2);}
export function importDraft(json){const state=JSON.parse(json);if(state.version!==1||!Array.isArray(state.players)||!Array.isArray(state.picks)||!Number.isFinite(state.cap)||state.cap<0)throw Error('Неверный формат');let replay=newDraft(state.players,state.cap,state.priceMode??'ON');for(const p of state.picks){if(p.team!==replay.picks.length%8||p.number!==replay.picks.length+1)throw Error('Нарушен порядок пиков');replay=pick(replay,p.playerId);}return {...replay,...(typeof state.databaseVersion==='string'?{databaseVersion:state.databaseVersion}:{})};}
export function riskPriority(player){return player.injuries?.some(i=>/out|suspension/i.test(i.status||''))?2:player.injuries?.length||player.returnContext?1:0;}
export function recommendations(state){const legal=state.players.filter(p=>!state.picks.some(x=>x.playerId===p.id)).filter(p=>{try{pick(state,p.id);return true;}catch{return false;}}).filter(p=>Number.isFinite(p.projectedFP));return legal.sort((a,b)=>riskAdjustedValue(b)-riskAdjustedValue(a)).slice(0,5);}
