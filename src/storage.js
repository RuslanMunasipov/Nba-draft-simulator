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
