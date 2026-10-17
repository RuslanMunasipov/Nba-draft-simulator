import {importDraft} from './engine.js';
// Normalize before replay: legacy cap rules must not reject an otherwise legal draft.
export function importUncappedDraft(json){
 const saved=JSON.parse(json);
 return importDraft(JSON.stringify({...saved,priceMode:'OFF'}));
}
