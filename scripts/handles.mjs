// Telegram usernames of the league's people (Зак Онн, the commissioner, each team's GM) are kept in the repository only
// encrypted (data/telegram-handles.enc.json, AES-256-GCM). The key is the LEAGUE_HANDLES_KEY secret (32 bytes, base64)
// and the usernames exist in plain text only in memory while a message is sent. Without the key nobody is tagged.
// Encrypt: LEAGUE_HANDLES_KEY=... node scripts/handles.mjs encrypt < handles.json > data/telegram-handles.enc.json
// handles.json: {"lawyer":"name","commissioner":"name","managers":{"0":"name",...}} (usernames without @).
import fs from 'node:fs';
import crypto from 'node:crypto';
const FILE=new URL('../data/telegram-handles.enc.json',import.meta.url);
const keyOf=key=>{const k=Buffer.from(key||'','base64');if(k.length!==32)throw Error('LEAGUE_HANDLES_KEY must be 32 bytes in base64');return k;};
export function encrypt(handles,key){
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',keyOf(key),iv);
 const data=Buffer.concat([c.update(JSON.stringify(handles),'utf8'),c.final()]);
 return {alg:'aes-256-gcm',iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function decrypt(box,key){
 const d=crypto.createDecipheriv('aes-256-gcm',keyOf(key),Buffer.from(box.iv,'base64'));d.setAuthTag(Buffer.from(box.tag,'base64'));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,'base64')),d.final()]).toString('utf8'));
}
// The usernames for this run: empty without the key (or the file), so messages name people without tagging them.
export function loadHandles(key=process.env.LEAGUE_HANDLES_KEY){
 if(!key||!fs.existsSync(FILE))return {managers:{}};
 return {managers:{},...decrypt(JSON.parse(fs.readFileSync(FILE,'utf8')),key)};
}
export const at=u=>u?`@${String(u).replace(/^@/,'')}`:null;
// Placeholders in a statement: {@lawyer}, {@commissioner}, {@gm:7}. Unknown ones are reported, never sent blank.
export function fillHandles(text,h){
 const missing=[];
 const out=text.replace(/\{@(lawyer|commissioner|gm:(\d+))\}/g,(m,who,team)=>{const u=team!==undefined?h.managers?.[team]:h[who];if(!u)missing.push(m);return at(u)||m;});
 return {text:out,missing};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href&&process.argv[2]==='encrypt')
 process.stdout.write(JSON.stringify(encrypt(JSON.parse(fs.readFileSync(0,'utf8')),process.env.LEAGUE_HANDLES_KEY),null,1)+'\n');
