// Storage is optional: Safari quota/privacy failures must never stop a draft.
let failed=false;
export function readStored(key){try{return localStorage.getItem(key);}catch{failed=true;return null;}}
export function writeStored(key,value){
 try{localStorage.setItem(key,value);return true;}catch{
  // The optional catalog cache must never displace the user's saved draft.
  if(key==='fbl-default-db')return false;
  if(key==='fbl-draft'){try{localStorage.removeItem('fbl-default-db');localStorage.setItem(key,value);return true;}catch{}}
  failed=true;return false;
 }
}
export function storageFailed(){return failed;}
// The player catalog (several MB) lives in IndexedDB: localStorage holds about 5 MB per site on iOS Safari, which the
// catalog alone would exhaust. Failures only mean the next start waits for the network.
const IDB='fbl',STORE='cache';
function idb(){return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined')return reject(Error('no IndexedDB'));const r=indexedDB.open(IDB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readCache(key){
 try{const db=await idb();return await new Promise((resolve,reject)=>{const q=db.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);});}
 catch{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
}
export async function writeCache(key,value){
 try{const db=await idb();await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
  try{localStorage.removeItem(key);}catch{}return true;}
 catch{return false;}
}
