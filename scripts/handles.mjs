// Telegram usernames of the league's people (Зак Онн, the commissioner, each team's GM) are kept in the repository only
// encrypted (data/telegram-handles.enc.json, AES-256-GCM). The key is derived (SHA-256) from a secret: LEAGUE_HANDLES_KEY
// when set, otherwise the league bot's token (LEAGUE_TELEGRAM_BOT_TOKEN), which only GitHub secrets hold. The usernames
// exist in plain text only in memory while a message is sent; without the secret nobody is tagged. A new bot token
// (BotFather /revoke) means encrypting the file again with it.
// Encrypt: LEAGUE_TELEGRAM_BOT_TOKEN=... node scripts/handles.mjs encrypt < handles.json > data/telegram-handles.enc.json
// handles.json: {"lawyer":"name","commissioner":"name","managers":{"0":"name",...}} (usernames without @).
import fs from 'node:fs';
import crypto from 'node:crypto';
const FILE=new URL('../data/telegram-handles.enc.json',import.meta.url);
const keyOf=secret=>{if(!secret)throw Error('no secret for the Telegram usernames');return crypto.createHash('sha256').update('fbl-telegram-handles\0'+secret).digest();};
const secretOf=()=>process.env.LEAGUE_HANDLES_KEY||process.env.LEAGUE_TELEGRAM_BOT_TOKEN;
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
// A secret that does not open the file (e.g. a revoked bot token) is reported and tags nobody.
export function loadHandles(key=secretOf()){
 if(!key||!fs.existsSync(FILE))return {managers:{}};
 try{return {managers:{},...decrypt(JSON.parse(fs.readFileSync(FILE,'utf8')),key)};}
 catch{console.error('Telegram usernames: the secret does not open data/telegram-handles.enc.json; nobody is tagged.');return {managers:{}};}
}
export const at=u=>u?`@${String(u).replace(/^@/,'')}`:null;
// Placeholders in a statement: {@lawyer}, {@commissioner}, {@gm:7}. Unknown ones are reported, never sent blank.
export function fillHandles(text,h){
 const missing=[];
 const out=text.replace(/\{@(lawyer|commissioner|gm:(\d+))\}/g,(m,who,team)=>{const u=team!==undefined?h.managers?.[team]:h[who];if(!u)missing.push(m);return at(u)||m;});
 return {text:out,missing};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href&&process.argv[2]==='encrypt')
 process.stdout.write(JSON.stringify(encrypt(JSON.parse(fs.readFileSync(0,'utf8')),secretOf()),null,1)+'\n');
