// A statement of Зак Онн to the league chat: a Telegram-HTML text from data/announcements/ with one of his photos.
// Usage: league-announce.mjs <announcement.html> <check|approved|violation>
// Env: LEAGUE_TELEGRAM_BOT_TOKEN, LEAGUE_TELEGRAM_CHAT_ID; like the feed, the personal bot or chat is refused.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sender} from './telegram-format.mjs';
const [file,mood='check']=process.argv.slice(2);
if(!['check','approved','violation'].includes(mood))throw Error('photo: check, approved or violation');
const token=process.env.LEAGUE_TELEGRAM_BOT_TOKEN,chat=process.env.LEAGUE_TELEGRAM_CHAT_ID;
if(token&&(token===process.env.TELEGRAM_BOT_TOKEN||(chat&&chat===process.env.TELEGRAM_CHAT_ID))){
 console.error('Announcement refused: the league bot and chat must differ from the personal ones.');process.exit(1);}
const {send}=sender(token,chat);
await send(fs.readFileSync(file,'utf8').trim(),{photo:fileURLToPath(new URL(`./assets/zak-onn/${mood}.jpg`,import.meta.url))});
