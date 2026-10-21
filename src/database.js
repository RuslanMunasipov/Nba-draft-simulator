import {enforceBudget} from './budget.js';
import {newDraft,importDraft,exportDraft} from './engine.js';
export function installDatabase(state,database){
 if(!database?.generatedAt||!Array.isArray(database.players)||database.players.length<80)throw Error('Неполная база игроков');
 newDraft(database.players,state.cap,'OFF');
 const players=database.players.map(p=>({...p}));
 // Picked players retain the exact roster/projection snapshot used when selected.
 for(const choice of state.picks){const selected=state.players.find(p=>p.id===choice.playerId);const index=players.findIndex(p=>p.id===selected.id);if(index<0)players.push(database.priceMode==='ON'?{...selected,price:null,priceStatus:'MISSING'}:selected);else players[index]={...selected,...(database.priceMode==='ON'?{price:players[index].price,priceStatus:players[index].priceStatus,sportsId:players[index].sportsId,priceSource:players[index].priceSource,priceCheckedAt:players[index].priceCheckedAt,...(database.positionAuthority==='Sports.ru'?{positions:players[index].positions,positionStatus:players[index].positionStatus,positionSource:players[index].positionSource,yahooPositions:players[index].yahooPositions,yahooPositionStatus:players[index].yahooPositionStatus}:{})}:{})};}
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

// The players the season tab scores the league with: the installed catalog itself, so drafted players carry the same
// latest forecasts as free agents, plus any picked player the catalog no longer lists. The pick snapshots above are the
// draft tab's (its replay and legality); a manual database or no catalog falls back to the draft state. The same
// inputs give the same array, so the season tab does not re-render on every draft render.
let seasonMemo=null;
export function seasonCatalog(state,database){
 if(!database?.players?.length||!state?.databaseVersion||state.databaseVersion==='manual')return state?.players||[];
 if(seasonMemo?.catalog===database.players&&seasonMemo.draft===state.players)return seasonMemo.value;
 const ids=new Set(database.players.map(p=>p.id)),missing=(state.players||[]).filter(p=>!ids.has(p.id));
 seasonMemo={catalog:database.players,draft:state.players,value:missing.length?[...database.players,...missing]:database.players};
 return seasonMemo.value;
}

// What the device keeps for a draft built on the automatic database: the picks and the snapshot of each picked player.
// The catalog itself (several MB) is the cached or fetched database, so the draft fits any storage quota.
export function compactDraft(state){
 if(!state.databaseVersion||state.databaseVersion==='manual')return state;
 const picked=new Set(state.picks.map(p=>p.playerId));
 return {version:state.version,compact:true,cap:state.cap,priceMode:state.priceMode,databaseVersion:state.databaseVersion,picks:state.picks,players:state.players.filter(p=>picked.has(p.id))};
}
