// The league's pictures (owner, 23.10.2026): the code writes no prompt and no part of one. Claude writes every prompt
// whole, thinking over the context: the story, the people and how to keep each of them, the composition, the light, the
// style, the words drawn. The code gives only the references (each participant's face, a team's logo) and who is on each
// (the people base, people.json: what never changes about them, their usual look), checks what Claude wrote and sends it
// to the image model as it is. A prompt the checks refuse goes back to Claude with what is wrong; when he still cannot,
// no picture is drawn: there is no scene, style or template of the code's own to fall back on.
import path from 'node:path';
import {claudeJSON,CLAUDE_MODEL} from './claude-text.mjs';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {PEOPLE,person,zakPhoto,gmPhoto,gmOf,teamLogo,readImage,ASSETS} from './image-pipeline.mjs';

// A person of the people base as Claude sees them.
export function about(p){
 if(!p)return {};
 return {name:p.en,...p.keep?{neverChanges:p.keep}:{},...p.style?{alwaysDrawn:p.style}:{},...p.outfit?{usualLook:p.outfit}:{}};
}

// The references of a picture: [{image ({bytes, name, type}, or null: then it is left out), is (what it is, for Claude),
// facts (what Claude should know about it), need (the prompt must use it), say (words the prompt must hold, as the people
// base requires: his red cap's "God Bless America")}] → {images, refs, list: what Claude sees, numbered as they go}.
export function cast(refs){
 const present=refs.filter(r=>r&&r.image);
 return {images:present.map(r=>r.image),refs:present,
  list:present.map((r,i)=>({ref:`reference image ${i+1}`,is:r.is,...r.facts||{},...r.need?{mustUse:true}:{}}))};
}
// Who is who: the references the league's pictures take their people and things from.
// Zak Onn: his photo of the mood (its face), the red cap the people base keeps him in always.
export const zakRef=(mood='check',root)=>({image:zakPhoto(mood,root),is:'the photo of Zak Onn, the league lawyer',facts:about(person('zak-onn')),need:true,say:['God Bless America']});
export function commissionerRef(root,{need=false}={}){
 const p=PEOPLE.find(x=>x.role==='commissioner');
 return {image:p?readImage(path.join(root||ASSETS,p.photo)):null,is:'the photo of Adam Silverov, the league commissioner',facts:about(p),need};
}
export const gmRef=(team,root,{is='the photo of the general manager (GM) of the fantasy team',need=true}={})=>
 ({image:gmPhoto(team,root),is,facts:about(gmOf(team)),need});
export const logoRef=(team,root,{is='the logo of the fantasy team',need=false}={})=>
 ({image:teamLogo(team,root),is,facts:{teamColors:LEAGUE_TEAMS[team]?.kit||null},need});
// Mike Roffon: only the face of his photo (its camouflage helmet and PRESS vest belong to a war zone), always his white
// gloves and his microphone.
export function mikeRef(root){
 const p=person('mike-roffon');
 return {image:readImage(path.join(root||ASSETS,p.photo)),is:'the photo of Mike Roffon, the reporter: take only his face from it, never its clothes',facts:about(p),need:true,say:['white gloves','microphone']};
}
// Trevor Matolog, the league's trauma doctor: his face, and always his neck brace and his cast with players' autographs.
export function trevorRef(root){
 const p=person('trevor-matolog');
 return {image:readImage(path.join(root||ASSETS,p.photo)),is:'the photo of Trevor Matolog, the league\'s trauma doctor',facts:about(p),need:true,say:['neck brace','cast']};
}
// Christopher Dildo, the analyst of Inside FBL (the day's pictures are his): his face, always his glasses and notebook.
export function dildoRef(root){
 const p=person('christopher-dildo');
 return {image:readImage(path.join(root||ASSETS,p.photo)),is:'the photo of Christopher Dildo, the analyst of Inside FBL, whose pictures these are',facts:about(p),need:true,say:['glasses','notebook']};
}
// An NBA player: his ESPN headshot ({bytes, name, type}, or null).
export const playerRef=(face,name,{need=true,...facts}={})=>({image:face,is:`the ESPN headshot of the real NBA player ${name}`,facts,need});

const REF=/\breference image (\d+)/gi;
const used=text=>[...new Set([...String(text).matchAll(REF)].map(m=>Number(m[1])))];
// Claude's prompt as it goes to the image model: only the references it names, numbered anew in their order when one is
// left out (the words of the prompt stay his).
export function picture(prompt,c){
 const keep=used(prompt).filter(n=>n>=1&&n<=c.images.length).sort((a,b)=>a-b),to=new Map(keep.map((n,i)=>[n,i+1]));
 return {images:keep.map(n=>c.images[n-1]),prompt:String(prompt).replace(REF,(m,n)=>to.has(Number(n))?m.replace(/\d+$/,String(to.get(Number(n)))):m).trim()};
}

// What is wrong with Claude's prompt ([]: it may go to the image model). c: its cast; numbers: a Set of the numbers its
// quotes may carry (they are drawn). No list of forbidden words: OpenAI draws weapons, the dead and the rest (owner,
// 23.10.2026), the story is Claude's.
export function promptProblems(text,c,{numbers=new Set(),min=200,max=4500}={}){
 if(typeof text!=='string'||!text.trim())return ['no prompt'];
 const t=text.trim(),out=[],bare=t.replace(/"[^"\n]*"/g,'""'),lower=t.toLowerCase();
 if(t.length<min||t.length>max)out.push(`length ${t.length} (${min}-${max})`);
 if(!/^[\x20-\x7e\n]+$/.test(bare))out.push('not plain English outside the quotes');
 if(/\{[^}]*\}/.test(t))out.push('placeholders in curly braces: name each person or thing by its reference image');
 const named=used(t);
 c.refs.forEach((r,i)=>{if(r.need&&!named.includes(i+1))out.push(`reference image ${i+1} (${r.is}) not used`);});
 const stray=named.filter(n=>n<1||n>c.images.length);if(stray.length)out.push(`no reference image ${stray.join(', ')}: there are ${c.images.length}`);
 c.refs.forEach((r,i)=>{if(named.includes(i+1)||r.need)for(const w of r.say||[])if(!lower.includes(w.toLowerCase()))out.push(`no "${w}" (reference image ${i+1}: ${r.is})`);});
 const quotes=t.match(/"[^"\n]*"/g)||[],strayN=(quotes.join(' ').match(/\d+/g)||[]).filter(n=>!numbers.has(n));
 if(strayN.length)out.push(`numbers in quotes not in the facts: ${[...new Set(strayN)].join(', ')}`);
 return out;
}

// How every picture's prompt is written: the part of Claude's instructions all the league's pictures share.
export const CRAFT=`How you write the picture's prompt. Your prompt is the WHOLE prompt the image model gets (gpt-image, editing the reference images listed in the task): the code adds nothing to it. Think the context over first, then write it in English:
- everything is yours: the place, the story and the gag, who stands where and does what, the composition and framing, the camera and lens, the light, the mood, the colours, the visual style, the wardrobe;
- name each person or thing of the references by its reference image ("the man from reference image 2") and say what to take from it: a face exactly, preserved and instantly recognizable; a logo reproduced exactly. Write in yourself what never changes about each person (neverChanges, alwaysDrawn), and dress them for the scene (usualLook is only their usual look). Use every reference marked mustUse; a reference you do not name is not sent;
- any words drawn in the picture go in double quotes, spelled exactly, and the prompt says that no other text, captions or watermarks appear. Numbers in quotes only from the facts;
- basketball is the only sport (NBA), never American football or any other;
- plain English outside the quotes, no placeholders in curly braces, at most 4500 characters.`;
const ANSWER='Answer only JSON: {"prompt": "the whole prompt", "idea": "the picture\'s idea in one line, so that later pictures do not repeat it"}';
const str={type:'string'};
export const PICTURE_SCHEMA={type:'object',additionalProperties:false,required:['prompt','idea'],properties:{prompt:str,idea:str}};
// The task Claude gets: the brief (the facts of the picture), then its references.
export const pictureTask=(brief,c)=>`${brief}\n\nThe references, the images that go to the image model with your prompt:\n${c.list.length?JSON.stringify(c.list,null,1):'none: the picture is drawn from your prompt alone'}`;
// One picture written by Claude: system (who he writes it for, the rules of this picture, then CRAFT; the answer's shape
// is added), brief (its facts),
// c (its cast), check (its problems; promptProblems by default). A refused prompt goes back to him with its problems (fixes
// times). Answers {images, prompt, idea}, ready for the image model, or null. A ClaudeError is the caller's.
export async function writePicture({system,brief,c,check=t=>promptProblems(t,c),write=claudeJSON,model=CLAUDE_MODEL,timeoutMs=180e3,fixes=1,label='Picture',log=console.warn}){
 const task=pictureTask(brief,c);
 let ask=task;
 for(let i=0;i<=fixes;i++){
  const {data}=await write({system:`${system}\n${ANSWER}`,prompt:ask,schema:PICTURE_SCHEMA,model,timeoutMs});
  const problems=check(data?.prompt);
  if(!problems.length)return {...picture(data.prompt,c),idea:String(data.idea||'').trim()};
  log(`${label}: Claude's prompt refused (${problems.join('; ')})${i<fixes?', sent back to fix':': no picture'}.`);
  ask=`${task}\n\nYour prompt:\n${data?.prompt??''}\n\nFix only this and write the whole prompt again:\n${problems.map(p=>`- ${p}`).join('\n')}`;
 }
 return null;
}
