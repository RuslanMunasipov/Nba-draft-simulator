// The league's pictures (owner, 23.10.2026): Opus writes the whole prompt (the scene, the composition, the light, the
// style, the words on signs); the code gives only the references and who is who: each person's face and what never
// changes about them (people.json keep/style). Opus names the people and things of the references by placeholders
// ({MIKE}, {GUEST}, {GM}, {P1}, {LOGO}...), which the code replaces by their names and reference images, and the code
// checks what Opus wrote before it goes to the image model. The code's own scenes are only the fallback.
import {references} from './image-pipeline.mjs';

const TOKEN=/\{([A-Z][A-Z0-9_]*)\}/g;
// refs: [{key ('MIKE'), image (or null), name ('Mike Roffon'), what (the legend's words), identity (who they are: face,
// what never changes; null for a thing like a logo)}] → {images, prompt}: the legend, the identities, the written prompt
// with its placeholders filled ("Mike Roffon (reference image 1)"; a person without a photo by name only). Only the
// references the prompt names go to the image model.
export function fillPrompt(written,refs){
 refs=refs.filter(x=>String(written).includes(`{${x.key}}`));
 const r=references(refs.map(x=>({key:x.key,image:x.image,what:x.what})));
 const named=x=>r.has[x.key]?`${x.name} (${r.has[x.key]})`:x.name;
 const prompt=String(written).replace(TOKEN,(m,k)=>{const x=refs.find(y=>y.key===k);return x?named(x):m;});
 const who=refs.filter(x=>x.identity&&(r.has[x.key]||x.always)).map(x=>`${x.name.toUpperCase()}${r.has[x.key]?` (${r.has[x.key]})`:''}: ${x.identity}`);
 return {images:r.images,prompt:[r.legend,...who,prompt.trim()].filter(Boolean).join('\n')};
}
// Words no picture of the league shows, in any prompt Opus writes.
export const OFF_LIMITS=/\b(guns?|pistols?|rifles?|revolvers?|shotguns?|weapons?|shoot\w*|bullets?|ammo|knife|knives|swords?|blood\w*|kill\w*|murder\w*|dead|death|dies?|corpses?|suicide|drugs?|cocaine|sex\w*|naked|nude|torture\w*|explod\w*|bombs?|nfl|american football|super bowl|touchdown|quarterback|helmets?)\b/i;
// What is wrong with a written prompt ([]: it may go to the image model). required: placeholders it must use; allowed:
// every placeholder it may use; numbers: a Set of the numbers the words in its quotes may carry (they are drawn);
// max: its length.
export function promptProblems(text,{required=[],allowed=[],numbers=new Set(),max=1500}={}){
 if(typeof text!=='string'||!text.trim())return ['no prompt'];
 const t=text.trim(),out=[];
 if(t.length<80||t.length>max)out.push(`length ${t.length} (80-${max})`);
 if(!/^[\x20-\x7e\n]+$/.test(t.replace(/"[^"\n]*"/g,'""')))out.push('not plain English outside the quotes');
 for(const k of required)if(!t.includes(`{${k}}`))out.push(`no {${k}}`);
 const stray=[...new Set((t.match(TOKEN)||[]).filter(x=>!allowed.includes(x.slice(1,-1))))];if(stray.length)out.push(`unknown placeholders ${stray.join(', ')}`);
 const quotes=t.match(/"[^"\n]*"/g)||[],strayN=(quotes.join(' ').match(/\d+/g)||[]).filter(n=>!numbers.has(n));
 if(strayN.length)out.push(`numbers in quotes not in the facts: ${[...new Set(strayN)].join(', ')}`);
 const bad=t.replace(/"[^"\n]*"/g,'').match(OFF_LIMITS);if(bad)out.push(`off limits: ${bad[0]}`);
 return out;
}
// How every prompt-writing instruction tells Opus to write a picture's prompt (the rest is each picture's own).
export const PROMPT_CRAFT=`How to write a picture's prompt (in English, for a photorealistic image model):
- You set everything: the place, the action and the gag, the composition and framing, the camera and lens, the light, the mood, the visual style, the colours, the wardrobe of the scene.
- Name the people and things of the references only by their placeholders, never describe their faces: the code adds who they are and what never changes about them.
- Any words drawn in the picture go in double quotes, spelled exactly; nothing else written in it. Numbers in quotes only from the facts.
- Basketball is the only sport (NBA), never American football or any other. No weapons, shooting, blood, violence, death, drugs, nudity; no helmets.`;
