// A statement of Зак Онн to the league chat: a Telegram-HTML text from data/announcements/ with one of his photos.
// Usage: league-announce.mjs <announcement.html> <check|approved|violation>
// Env: LEAGUE_TELEGRAM_BOT_TOKEN, LEAGUE_TELEGRAM_CHAT_ID; like the feed, the personal bot or chat is refused.
// ANNOUNCE_PICTURE=1 with OPENAI_API_KEY: the statement goes with its own picture (paid), its prompt written by Claude
// from the statement (CLAUDE_CODE_OAUTH_TOKEN), with the idea of <announcement>.picture.txt when there is one; his photo
// only when Claude cannot write it or the picture cannot be drawn.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sender} from './telegram-format.mjs';
import {loadHandles,fillHandles} from './handles.mjs';
import {drawPicture,writeStatementPicture} from './zak-pictures.mjs';
import {claudeConfigured} from './claude-text.mjs';
const [file,mood='check']=process.argv.slice(2);
if(!['check','approved','violation'].includes(mood))throw Error('photo: check, approved or violation');
const token=process.env.LEAGUE_TELEGRAM_BOT_TOKEN,chat=process.env.LEAGUE_TELEGRAM_CHAT_ID;
if(token&&(token===process.env.TELEGRAM_BOT_TOKEN||(chat&&chat===process.env.TELEGRAM_CHAT_ID))){
 console.error('Announcement refused: the league bot and chat must differ from the personal ones.');process.exit(1);}
// Usernames are written as {@lawyer}, {@commissioner}, {@gm:<team>} and decrypted only here; a statement whose tags
// cannot be resolved is not sent to the league.
const {text,missing}=fillHandles(fs.readFileSync(file,'utf8').trim(),loadHandles());
const {configured,send}=sender(token,chat);
if(configured&&missing.length){console.error(`Announcement refused: no username for ${missing.join(', ')} (was data/telegram-handles.enc.json encrypted with the current league bot token?).`);process.exit(1);}
const ideaFile=file.replace(/\.html$/,'.picture.txt'),draws=configured&&process.env.ANNOUNCE_PICTURE==='1'&&process.env.OPENAI_API_KEY;
let written=null;
if(draws&&claudeConfigured()){
 try{written=await writeStatementPicture(text,{mood,idea:fs.existsSync(ideaFile)?fs.readFileSync(ideaFile,'utf8'):null});
  if(written)console.log(`Picture by Claude: ${written.prompt}`);}
 catch(e){console.warn(`The statement's picture (Claude) unavailable (${e.message}): his photo goes.`);}
}
const picture=await drawPicture(written,'the statement',{key:process.env.OPENAI_API_KEY,timeoutMs:120e3});
await send(text,{photo:picture||fileURLToPath(new URL(`./assets/zak-onn/${mood}.jpg`,import.meta.url))});
