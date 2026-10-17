import {newDraft,importDraft,exportDraft} from './engine.js';
export function installDatabase(state,database){
 if(!database?.generatedAt||!Array.isArray(database.players)||database.players.length<80)throw Error('Неполная база игроков');
 newDraft(database.players,state.cap,'OFF');
 const players=database.players.map(p=>({...p}));
 // Picked players retain the exact roster/projection snapshot used when selected.
 for(const choice of state.picks){const selected=state.players.find(p=>p.id===choice.playerId);const index=players.findIndex(p=>p.id===selected.id);if(index<0)players.push(selected);else players[index]=selected;}
 return importDraft(exportDraft({...state,players,databaseVersion:database.generatedAt}));
}

export function restartDraft(state,database){
 // Pinned selections belong to the old draft; a new automatic draft uses the raw latest catalog.
 if(state.databaseVersion&&state.databaseVersion!=='manual'&&database?.generatedAt){
  return installDatabase(newDraft([],state.cap,state.priceMode),database);
 }
 return {...newDraft(state.players,state.cap,state.priceMode),...(state.databaseVersion?{databaseVersion:state.databaseVersion}:{})};
}
