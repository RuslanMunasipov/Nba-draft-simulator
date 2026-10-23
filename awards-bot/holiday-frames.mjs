#!/usr/bin/env node
// FBL awards bot, the holiday frames of its cards (league chat, 22.10.2026): one artwork per holiday of holidays.js,
// drawn once by the picture pipeline (scripts/image-pipeline.mjs) as a transparent portrait whose ornaments keep to the
// edges, then kept in awards-bot/assets/holidays/<key>.webp and laid over the cards of that holiday every year. Claude
// writes each prompt (owner, 23.10.2026, scripts/picture-prompt.mjs) from the holiday and what the card needs of it.
// The centre is cleared after drawing (frame-clean.py), so a frame never covers a card's numbers.
// With --backgrounds it draws instead a full background per holiday, in the style of a special-edition card promo
// (Christmas, Halloween, St Patrick's...), kept as <key>-bg.webp: the league's own art in design/backgrounds wins over it.
// Usage: node awards-bot/holiday-frames.mjs [--backgrounds] [KEY ...]   (no keys: every holiday without one yet; --force)
// Env: OPENAI_API_KEY (or a proxy that adds it), CLAUDE_CODE_OAUTH_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HOLIDAYS} from './holidays.js';
import {generate,cost} from '../scripts/image-pipeline.mjs';
import {cast,writePicture,CRAFT} from '../scripts/picture-prompt.mjs';

const DIR=fileURLToPath(new URL('./assets/holidays/',import.meta.url));
// What a card needs of its holiday's art, the facts Claude writes the prompt from: a frame lies over the card (its centre
// is cleared after drawing), a background lies under its panels.
const NEEDS={
 frame:'a decorative border frame for a dark sports infographic card (the league\'s award cards, dark navy), portrait 1024x1536, drawn on a transparent background: ornaments only along the four edges and in the corners, at most 12% of the width on the left and right and at most 10% of the height at the top and bottom; the whole centre empty and fully transparent. No text, letters, numbers, logos or human faces.',
 background:'a full background artwork for a special-edition sports trading card promo, like the holiday promo cards of football card games, portrait 1024x1536, built around the holiday\'s accent colours on deep dark tones; the centre darker and calmer, so that white text and photos on top stay readable. No text, letters, numbers, logos, people or faces.',
};
const SYSTEM=`You are the art director of the FBL awards bot (Fantasy Brothers League, a fantasy basketball league of friends). Its award cards dress up for holidays; you write the prompt of one holiday's artwork: what fills it, the motifs of that holiday (its own, recognizable, never generic), the style (a polished premium sports-broadcast look), the colours and the light, exactly to what the card needs of it.

${CRAFT}`;
const writeArt=(h,bg)=>writePicture({system:SYSTEM,brief:`The holiday: ${JSON.stringify({key:h.key,name:h.name,emoji:h.emoji,decor:h.decor,accent:h.accent})}\nWhat the card needs: ${NEEDS[bg?'background':'frame']}`,
 c:cast([]),label:`Holiday ${h.key}`});
const file=(h,bg)=>path.join(DIR,`${h.key}${bg?'-bg':''}.webp`);
async function draw(h,bg){
 const out=file(h,bg),raw=out.replace(/\.webp$/,'.raw.png');
 const written=await writeArt(h,bg);
 if(!written)throw Error('Claude could not write its prompt');
 const {png,usage}=await generate({prompt:written.prompt,size:'1024x1536',quality:'medium',...bg?{}:{background:'transparent'}},{key:process.env.OPENAI_API_KEY});
 fs.writeFileSync(raw,png);
 // A frame gets its centre cleared; both are packed as WebP (a PNG is megabytes).
 execFileSync('python3',['-I',fileURLToPath(new URL('./frame-clean.py',import.meta.url)),raw,out,...bg?['--keep']:[]],{stdio:'inherit'});
 fs.unlinkSync(raw);
 console.log(`${h.key}: $${cost(usage).toFixed(4)}`);
 return cost(usage);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),force=args.includes('--force'),bg=args.includes('--backgrounds'),keys=args.filter(a=>!a.startsWith('--'));
 fs.mkdirSync(DIR,{recursive:true});
 const todo=HOLIDAYS.filter(h=>keys.length?keys.includes(h.key):force||!fs.existsSync(file(h,bg)));
 let spent=0;
 const results=await Promise.allSettled(todo.map(h=>draw(h,bg)));
 results.forEach((r,i)=>{if(r.status==='fulfilled')spent+=r.value;else console.error(`${todo[i].key}: ${r.reason?.message||r.reason}`);});
 console.log(`${todo.length} ${bg?'background':'frame'}(s), $${spent.toFixed(3)}`);
}
