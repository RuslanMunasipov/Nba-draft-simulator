// A statement of Зак Онн to the league chat: a Telegram-HTML text from data/announcements/ with one of his photos.
// Usage: league-announce.mjs <announcement.html> <check|approved|violation>
// Env: LEAGUE_TELEGRAM_BOT_TOKEN, LEAGUE_TELEGRAM_CHAT_ID; like the feed, the personal bot or chat is refused.
// ANNOUNCE_PICTURE=1 with OPENAI_API_KEY: the statement goes with its own picture (paid): the scene of
// <announcement>.picture.txt, else one Claude writes from the statement (CLAUDE_CODE_OAUTH_TOKEN); his photo only when
// neither can be had or the picture cannot be drawn.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sender} from './telegram-format.mjs';
import {loadHandles,fillHandles} from './handles.mjs';
import {drawStatement,writeStatementScene} from './zak-pictures.mjs';
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
const sceneFile=file.replace(/\.html$/,'.picture.txt'),draws=configured&&process.env.ANNOUNCE_PICTURE==='1'&&process.env.OPENAI_API_KEY;
let scene=draws&&fs.existsSync(sceneFile)?fs.readFileSync(sceneFile,'utf8'):null;
if(draws&&!scene&&claudeConfigured()){
 try{scene=await writeStatementScene(text);if(scene)console.log(`Scene by Claude: ${scene}`);}
 catch(e){console.warn(`The statement's scene (Claude) unavailable (${e.message}): his photo goes.`);}
}
const picture=scene?await drawStatement({scene,mood},{key:process.env.OPENAI_API_KEY}):null;
await send(text,{photo:picture||fileURLToPath(new URL(`./assets/zak-onn/${mood}.jpg`,import.meta.url))});
