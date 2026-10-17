import {enforceBudget} from './budget.js';
import {newDraft,importDraft,exportDraft} from './engine.js';
export function installDatabase(state,database){
 if(!database?.generatedAt||!Array.isArray(database.players)||database.players.length<80)throw Error('Неполная база игроков');
 newDraft(database.players,state.cap,'OFF');
 const players=database.players.map(p=>({...p}));
 // Picked players retain the exact roster/projection snapshot used when selected.
 for(const choice of state.picks){const selected=state.players.find(p=>p.id===choice.playerId);const index=players.findIndex(p=>p.id===selected.id);if(index<0)players.push(database.priceMode==='ON'?{...selected,price:null,priceStatus:'MISSING'}:selected);else players[index]={...selected,...(database.priceMode==='ON'?{price:players[index].price,priceStatus:players[index].priceStatus,sportsId:players[index].sportsId,priceSource:players[index].priceSource,priceCheckedAt:players[index].priceCheckedAt}:{})};}
 const next={...state,players,databaseVersion:database.generatedAt};
 return database.priceMode==='ON'?enforceBudget(next):importDraft(exportDraft(next));
}

export function restartDraft(state,database){
 // Pinned selections belong to the old draft; a new automatic draft uses the raw latest catalog.
 if(state.databaseVersion&&state.databaseVersion!=='manual'&&database?.generatedAt){
  return installDatabase(newDraft([],state.cap,state.priceMode),database);
 }
 return {...newDraft(state.players,state.cap,state.priceMode),...(state.databaseVersion?{databaseVersion:state.databaseVersion}:{})};
}
