#!/usr/bin/env node
// FBL awards bot, the holiday frames of its cards (league chat, 22.10.2026): one artwork per holiday of holidays.js,
// drawn once by the picture pipeline (scripts/image-pipeline.mjs) as a transparent portrait whose ornaments keep to the
// edges, then kept in awards-bot/assets/holidays/<key>.webp and laid over the cards of that holiday every year.
// The centre is cleared after drawing (frame-clean.py), so a frame never covers a card's numbers.
// With --backgrounds it draws instead a full background per holiday, in the style of a special-edition card promo
// (Christmas, Halloween, St Patrick's...), kept as <key>-bg.webp: the league's own art in design/backgrounds wins over it.
// Usage: node awards-bot/holiday-frames.mjs [--backgrounds] [KEY ...]   (no keys: every holiday without one yet; --force)
// Env: OPENAI_API_KEY (or a proxy that adds it).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HOLIDAYS} from './holidays.js';
import {generate,cost} from '../scripts/image-pipeline.mjs';

const DIR=fileURLToPath(new URL('./assets/holidays/',import.meta.url));
// The art direction of each frame: what fills its edges and corners.
export const THEMES={
 'fbl-start':'the opening night of a basketball season: golden basketballs, confetti bursts, arena spotlights beaming in from the top corners, streamers and sparkles',
 'fbl-end':'the season finale: checkered racing flags, golden trophies in the bottom corners, falling gold confetti, fireworks in the top corners',
 'trade-deadline':'a frantic trade deadline: ringing vintage telephones, flying contract papers, briefcases, a big clock in a top corner, pens and swirling arrows',
 'all-star':'an all-star weekend: shooting stars, glittering gold and purple stars, spotlights, basketballs with star trails, glamorous sparkles',
 'play-in':'a do-or-die play-in: golden tickets, lightning bolts, flaming basketballs, electric blue and orange energy',
 'playoffs':'the playoffs: golden trophies, flames along the bottom edge, lightning, basketballs, red and gold banners',
 'halloween':'spooky Halloween: carved glowing jack-o\'-lanterns in the bottom corners, small cartoon skeletons peeking in from the side edges, little coffins, cobwebs with dangling spiders in the top corners, flying bats along the top edge, ghosts, purple and orange mist',
 'thanksgiving':'Thanksgiving: a roast turkey, pumpkin pies, corn cobs, autumn maple leaves in red, orange and gold, a harvest cornucopia in a bottom corner',
 'christmas':'Christmas: fir branches with red and gold baubles along the top, a glowing garland of lights, wrapped presents and a Santa hat in the bottom corners, candy canes, snowflakes',
 'new-year':'New Year\'s Eve: fireworks bursting in the top corners, champagne glasses clinking, streamers, gold and silver confetti, a glittering garland of lights, sparklers',
 'orthodox-christmas':'Orthodox Christmas: a shining star of Bethlehem at the top, candles, snowy fir branches, golden ornaments, gentle snowfall, warm candlelight',
 'old-new-year':'the Old New Year: snowy fir branches, sparkling champagne, gentle fireworks, frosty silver and gold ornaments, falling snow',
 'mlk':'Martin Luther King Jr. Day: white doves in flight, olive branches, rays of light from the top, stars, a dignified blue and gold palette',
 'lunar-new-year':'Lunar New Year: red paper lanterns hanging from the top edge, a golden dragon curling along one side, red envelopes, firecrackers, plum blossoms',
 'valentine':'Valentine\'s Day: red and pink hearts, roses along the bottom, cupid arrows, love letters, glowing heart-shaped bokeh',
 'defender':'Defender of the Fatherland Day: military medals and stars, laurel branches, ribbons in green and gold, a dignified ceremonial style',
 'maslenitsa':'Maslenitsa: stacks of golden pancakes with butter and honey, a bright folk-art sun at the top, Russian folk ornaments, bonfire sparks',
 'womens-day':'International Women\'s Day (8 March): bouquets of tulips and mimosa, spring flowers in pink and yellow, ribbons, petals drifting',
 'st-patrick':'Saint Patrick\'s Day: shamrocks and four-leaf clovers, a leprechaun hat, pots of gold coins in the bottom corners, a rainbow arching across the top, frothy green beer mugs',
 'april-fools':'April Fools\' Day: clown faces, jester hats, whoopee cushions, rubber chickens, party balloons, comedy and tragedy masks, playing cards',
 'cosmonautics':'Cosmonautics Day: rockets blasting off from the bottom corners, planets and satellites, stars and nebulae, astronaut helmets, deep space blue and violet',
 'easter':'Easter: painted Easter eggs, fluffy chicks hatching, spring tulips and willow branches, a woven basket in a bottom corner, candles',
 'may-day':'May Day (spring and labour): spring tulips and daisies, colourful balloons, a bright sun, ribbons and flags in red and gold',
 'victory-day':'Victory Day: festive fireworks in the top corners, red carnations, golden stars, a dignified red and gold ceremonial style',
 'russia-day':'Russia Day: fireworks, white, blue and red ribbons, a festive and dignified style',
};
const prompt=h=>`A decorative border frame for a dark sports infographic card, portrait orientation.
Ornaments only along the four edges and in the corners: at most 12% of the width on the left and right sides and at most 10% of the height at the top and bottom. The whole centre of the image is completely empty and fully transparent.
Theme: ${THEMES[h.key]||h.name}.
Style: polished premium sports-broadcast illustration, rich colour, soft glow, crisp detail, consistent lighting, made to sit on a dark navy background.
No text, no letters, no numbers, no logos, no human faces.`;

const backgroundPrompt=h=>`A full background artwork for a special-edition sports trading card promo, in the style of the holiday promo cards of football card games, portrait orientation.
Theme: ${THEMES[h.key]||h.name}. Colours: built around ${h.accent.join(' and ')} on deep dark tones.
Composition: bold abstract graphic design: diagonal light beams, glossy gradients, angular geometric shards, metallic foil accents and glow, the theme's motifs as a subtle repeating pattern and a few larger stylised motifs towards the edges. The centre stays darker and calmer so that white text and photos on top remain readable.
No text, no letters, no numbers, no logos, no people, no faces.`;
const file=(h,bg)=>path.join(DIR,`${h.key}${bg?'-bg':''}.webp`);
async function draw(h,bg){
 const out=file(h,bg),raw=out.replace(/\.webp$/,'.raw.png');
 const {png,usage}=await generate(bg?{prompt:backgroundPrompt(h),size:'1024x1536'}:{prompt:prompt(h),size:'1024x1536',background:'transparent'},{key:process.env.OPENAI_API_KEY});
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
