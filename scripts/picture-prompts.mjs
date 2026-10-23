// The prompts of Zak Onn's pictures as they would go to the image model, written by Claude through the owner's
// subscription and printed, never drawn (free): a protocol of each kind of case, and a statement. A check that the
// prompts Claude writes are varied, fit the case and pass the code's checks. The awards bot's pictures and Mike Roffon's
// are printed by its own preview (bot.mjs --preview DAY --prompts --mike). Workflow: picture-prompts.yml.
// Usage: node scripts/picture-prompts.mjs [announcement.html]
import fs from 'node:fs';
import {writeProtocolPicture,writeStatementPicture} from './zak-pictures.mjs';
import {espnHeadshot} from './image-pipeline.mjs';
import {claudeConfigured} from './claude-text.mjs';
if(!claudeConfigured()){console.error('CLAUDE_CODE_OAUTH_TOKEN is not set: nothing to write.');process.exit(1);}
const show=(title,p)=>console.log(p?`\n===== ${title} (written by Claude, ${p.images.length} references: ${p.images.map(i=>i.name).join(', ')}) =====\nIdea: ${p.idea}\n${p.prompt}\n`
 :`\n===== ${title}: Claude could not write it, no picture =====\n`);
// One protocol of each kind of case, on different teams; the ideas already written are passed on as recent, as the feed does.
const CASES=[
 ['approved, a new player',{kind:'approved',team:2,no:101,player:{name:'Anthony Edwards',espn:'4594268'}}],
 ['breach: transfer hours',{kind:'violation',team:4,no:102,rules:['time']}],
 ['breach: two per NBA club',{kind:'violation',team:0,no:103,rules:['club']}],
 ['repeat offender',{kind:'violation',team:5,no:104,rules:['rookie'],standing:true}],
 ['doubt: white list',{kind:'check',team:6,no:105,rules:['white']}],
 ['case closed',{kind:'approved',team:1,no:106,fixed:true}],
 ['watched team, clean',{kind:'approved',team:7,no:107,watched:true}],
];
const recent=[];
for(const [title,c] of CASES){
 const player=c.player?{name:c.player.name,image:await espnHeadshot(c.player.espn)}:null;
 let written=null;
 try{written=await writeProtocolPicture({...c,player},{recent});}catch(e){console.warn(`${title}: Claude unavailable (${e.message})`);}
 if(written?.idea)recent.push(written.idea);
 show(`Zak Onn · ${title}`,written);
}
const file=process.argv[2]||fs.readdirSync('data/announcements').filter(f=>f.endsWith('.html')).sort().pop().replace(/^/,'data/announcements/');
const idea=file.replace(/\.html$/,'.picture.txt');
let statement=null;
try{statement=await writeStatementPicture(fs.readFileSync(file,'utf8'),{idea:fs.existsSync(idea)?fs.readFileSync(idea,'utf8'):null});}
catch(e){console.warn(`statement: Claude unavailable (${e.message})`);}
show(`Zak Onn · statement ${file}`,statement);
