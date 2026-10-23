// The pictures of Зак Онн's transfer protocols (the picture pipeline: scripts/image-pipeline.mjs). He is the law and only
// the law: every picture is about the rules check of a team's deals, and he deals with that team's GM in person, the
// team's logo in the scene. The scene follows the case: a breach by the rule it broke (rookie, white rule, club limit,
// transfer limit, hours, someone else's player), a breach the roster still carries (a repeat offender), a doubt by what is
// in doubt, a breach repaired (case closed), a clean roster of a team he watches, a clean roster. A GM without a photo in
// scripts/assets/gm/ is drawn from behind, never invented.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {references,zakPhoto,gmPhoto,gmOf,person,looks,teamLogo,generate,cost,PEOPLE,readImage,ASSETS} from './image-pipeline.mjs';

// The league's commissioner as the n-th reference of a picture: his photo, its legend, his block, his name in a scene;
// null without his photo.
const KEY='\u0000K';
function commissioner(n,root){
 const p=PEOPLE.find(x=>x.role==='commissioner'),image=p?readImage(path.join(root||ASSETS,p.photo)):null;
 if(!image)return null;
 const ref=`reference image ${n}`;
 return {image,legend:`${ref} is Adam Silverov, the league commissioner`,name:`${p.en} (the league commissioner, ${ref})`,
  block:`COMMISSIONER: the exact person from ${ref}, face preserved and recognizable: ${looks(p)}.`};
}
const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};
// His photo of each verdict: the red-cap ones (violation.jpg has a navy cap, the prompt keeps him in the red one).
export const ZAK_MOOD={approved:'approved',check:'check',violation:'check'};

// He dresses for the scene, but he is always the Lawyer, and the red cap never comes off (league chat, 22.10.2026).
const IDENTITY=zak=>`ZAK ONN (highest priority): the man from ${zak}. Preserve his face precisely: face shape, nose, brows, eyes, hairline, greying temples, age, skin tone; instantly recognizable. ${looks(person('zak-onn')).replace(/^Zak Onn; the face exactly as in the photo; never/,'Never')}.`;
const STYLE=`STYLE: photorealistic still from a 90s American action film about law and order, cinematic contrast, 35mm lens, shallow depth of field. Square composition. The league is a basketball league: any sports props (balls, jerseys, trophies, helmets) are basketball only. The only text in the picture: the cap embroidery and the exact words given in quotes, spelled exactly. No other captions or watermarks.`;

// A scene: G is the GM (their reference, or an anonymous figure from behind), L the team's logo (null without one), C the
// case number on the protocol, K the league's commissioner (null without his photo): a scene that names K brings him in.
const SCENES={
 approved:[
  ({G,L})=>`SCENE: a detective's office at night, neon through the blinds. Zak Onn brings a big red "APPROVED" stamp down on a stack of transfer papers on his desk${L?`, the folder marked with ${L}`:''}, while ${G} grins across the desk. Zak's eyes stay narrow and suspicious: approved, not trusted.`,
  ({G,L,K})=>`SCENE: a press-photo handshake in front of a backdrop${L?` covered with ${L}`:''}. Zak Onn shakes hands with ${G}, smiling for the cameras through clenched teeth, his other hand resting on the handcuffs at his belt, just in case${K?`; ${K} stands between them, applauding politely for the cameras`:''}.`,
  ({G,L})=>`SCENE: a police checkpoint on a highway at night, red and blue lights. Zak Onn shines a flashlight into a convertible${L?` with ${L} on its door`:''} and waves it through with two fingers; ${G} at the wheel salutes nervously.`,
 ],
 check:[
  ({G,L,C})=>`SCENE: an interrogation room under a single hanging lamp. ${G} sits sweating at a metal table; Zak Onn leans over them, one hand on an open case file labelled "${C}"${L?` with ${L} on its cover`:''}, the other holding a pen like a weapon. Expression: cold, patient suspicion.`,
  ({G,L})=>`SCENE: the team's trophy room. Zak Onn dusts ${L?`a trophy bearing ${L}`:'the team trophy'} for fingerprints with a forensic brush and a magnifying glass, while ${G} watches over his shoulder, wringing their hands.`,
  ({G,L,C})=>`SCENE: a police lab. ${G} is strapped to a lie detector, its needle scribbling wildly; Zak Onn studies the printout${L?`, ${L} on the evidence board behind him`:''}, and a tag on the machine reads "${C}". Expression: one eyebrow raised, unconvinced.`,
 ],
 // A breach by the rule it broke (the first of DUTY that is broken).
 rookie:[
  ({G,L,C})=>`SCENE: the team's locker room${L?` with ${L} on the wall`:''}. Zak Onn stands in front of an empty locker whose nameplate reads "ROOKIE ???", holding an empty baby crib in one hand as evidence; ${G} shrugs helplessly beside it. A tag on the crib reads "${C}". Expression: cold disbelief.`,
  ({G,L})=>`SCENE: a card-collector's office. Zak Onn slams open a binder of player cards${L?` bearing ${L}`:''} on a desk: one slot labelled "ROOKIE" is empty. ${G} looks away. Expression: icy, accusing.`,
 ],
 white:[
  ({G,L,C})=>`SCENE: the team's office${L?`, ${L} on the wall`:''}. Zak Onn holds up a clipboard titled "WHITE LIST" and strikes a line through it with a thick red marker, glaring at ${G}, who pleads with both hands. A folder on the desk reads "${C}".`,
  ({G})=>`SCENE: a dim hallway. Zak Onn pulls open a closet door and finds a basketball jersey hidden inside on a hanger, a tag reading "WHITE LIST?"; ${G} tries to block the door. Expression: caught you.`,
 ],
 club:[
  ({G,L,C})=>`SCENE: a police line-up room with a height chart. Three identical basketball jerseys of the same club hang on hangers in the line-up; the third one has a red tag reading "ONE TOO MANY". Zak Onn points at it with a pen while ${G} sweats behind the glass${L?`, ${L} on their lapel pin`:''}. A board reads "${C}".`,
  ({G,L})=>`SCENE: the team's training court${L?` with ${L} on the floor`:''}. Zak Onn holds up three fingers, then folds one down, staring at ${G}: "2 PER CLUB" is painted on the wall behind him.`,
 ],
 transfers:[
  ({G,L,C})=>`SCENE: a metal turnstile with a sign "3 PER WEEK", locked. ${G} is climbing over it with a basketball jersey under their arm${L?` bearing ${L}`:''}; Zak Onn grabs them by the collar mid-climb. A crate nearby is stencilled "${C}". Expression: cold fury.`,
  ({G})=>`SCENE: a transfer office counter. ${G} pushes a fourth transfer form across the counter; Zak Onn slams his hand down on it, a big red stamp reading "LIMIT" in his other hand, counting "4?" on his fingers. Expression: not in my town.`,
 ],
 time:[
  ({G,L,C})=>`SCENE: night, a dark transfer office, a wall clock showing 22:01. ${G} sneaks out of the door with a stack of transfer papers${L?` in a folder with ${L}`:''}; Zak Onn steps out of the shadows and lights them up with a flashlight. A sign on the door reads "MARKET CLOSED 22:00". A tag reads "${C}".`,
  ({G})=>`SCENE: a rain-soaked street at night under a neon "OPEN 08-22" sign switched off. Zak Onn leans on a lamp post checking his wristwatch as ${G} tries to slip a deal through a closed shop window. Expression: you're late.`,
 ],
 duplicate:[
  ({G,L,C})=>`SCENE: an evidence room. Two identical basketball jerseys lie side by side on a metal table; Zak Onn examines them with a magnifying glass and seals one in a plastic evidence bag labelled "STOLEN PLAYER - ${C}", while ${G}${L?`, ${L} on their cap,`:''} protests.`,
  ({G})=>`SCENE: a parking garage at night. Zak Onn opens the trunk of a car and finds a second copy of a player's jersey; ${G} raises their hands. A note on it reads "ALREADY TAKEN". Expression: grim satisfaction.`,
 ],
 // A breach the roster had already: no new case, a repeat offender.
 repeat:[
  ({G,L,C})=>`SCENE: a detective's office wall covered with case files${L?` and ${L}`:''}. Zak Onn pins a photo of ${G} under a big red label "REPEAT OFFENDER" and connects it with red string to an older file "${C}". Expression: tired, cold, determined.`,
  ({G})=>`SCENE: a police station. ${G}, already in one pair of handcuffs, watches Zak Onn calmly take out a second pair. Expression: I told you so.`,
 ],
 // A breach the deals repaired: the case is closed.
 closed:[
  ({G,L,C})=>`SCENE: a detective's office in morning light. Zak Onn brings down a stamp reading "CASE CLOSED" on file "${C}"${L?` marked with ${L}`:''}; ${G} exhales in relief across the desk. Zak still does not smile.`,
  ({G})=>`SCENE: a jail corridor. Zak Onn unlocks a cell door and lets ${G} walk out, pointing a warning finger at them. A sign on the wall reads "RELEASED". Expression: don't make me come back.`,
 ],
 // A clean roster of a team he watches.
 watched:[
  ({G,L})=>`SCENE: night, a car parked across the street from the team's office${L?` with ${L} lit on its window`:''}. Zak Onn sits behind the wheel with binoculars and a coffee cup, watching ${G} through the window. Expression: patient, unblinking.`,
  ({G,L})=>`SCENE: a surveillance van full of monitors; one screen shows ${G} at their desk${L?`, ${L} on the wall`:''}. Zak Onn, headphones on, writes in a notebook titled "WATCHLIST". Expression: nothing escapes him.`,
 ],
 // A doubt by what is in doubt.
 'check-time':[
  ({G,C})=>`SCENE: an office with two wall clocks showing 21:59 and 22:00. Zak Onn compares them with a stopwatch in his hand while ${G} sweats in a chair. A file reads "${C}". Expression: every second counts.`,
 ],
 'check-white':[
  ({G,L,C})=>`SCENE: a records room. Zak Onn reads a long document titled "WHITE LIST" through a magnifying glass, ${G} waiting nervously${L?`, ${L} on a folder`:''}. A tag reads "${C}". Expression: thorough, suspicious.`,
 ],
 violation:[
  ({G,L})=>`SCENE: the team's headquarters, camera flashes exploding. Zak Onn snaps handcuffs on ${G} right in front of a giant banner${L?` with ${L}`:''}, staring down the lens with total contempt.`,
  ({G,L,C})=>`SCENE: the team's office door${L?` with ${L} on the glass`:''}, sealed with yellow tape reading "FBL CRIME SCENE - DO NOT CROSS". Zak Onn sips coffee in front of the tape holding a file labelled "${C}"; behind the tape, ${G} pleads with both hands. Zak does not care.`,
  ({G,L,C,K})=>`SCENE: a wood-panelled courtroom. ${G} sits in the defendant's chair; Zak Onn, the prosecutor, points at them with full force, an evidence board behind him showing "${C}"${L?` and ${L}`:''}${K?`; ${K} presides from the judge's bench, gavel raised`:''}. Expression: righteous fury.`,
 ],
};

// The scene of a case. rules: the rules broken (a breach) or in doubt (a check); standing: a breach the roster had
// already; fixed: a breach the deals repaired; watched: a team on his watchlist.
const DUTY=['duplicate','transfers','time','club','white','rookie'];
export function sceneOf({kind,rules=[],standing=false,fixed=false,watched=false}){
 if(kind==='violation'){if(standing)return 'repeat';return DUTY.find(r=>rules.includes(r))||'violation';}
 if(kind==='check'){if(rules.includes('time'))return 'check-time';if(rules.includes('white')||rules.includes('unmarked'))return 'check-white';return 'check';}
 if(fixed)return 'closed';
 return watched?'watched':'approved';
}
// The picture of a protocol: kind (approved, check, violation), the team's index (0 to 7), the protocol's number, a seed
// (its first deal: a protocol always gets the same scene) and the case (sceneOf).
export function zakPicture({kind,team,no,seed,root,...story}){
 const gm=gmOf(team),gmName=gm?.en||LEAGUE_TEAMS[team]?.gm;
 const refs=references([{key:'zak',image:zakPhoto(ZAK_MOOD[kind]||'check',root),what:'Zak Onn, the league lawyer'},
  {key:'gm',image:gmPhoto(team,root),what:`the general manager of the fantasy team${gmName?` (${gmName})`:''}`},
  {key:'logo',image:teamLogo(team,root),what:'the fantasy team logo'}]);
 const G=refs.has.gm?`${gm?.en||'the general manager'} (the general manager, ${refs.has.gm})`:'the team\'s general manager, seen only from behind';
 // Who the GM is and what never changes about them, in a block of its own (the scene names them only).
 const who=refs.has.gm?`GENERAL MANAGER: the exact person from ${refs.has.gm}, face preserved and recognizable${gm?`: ${looks(gm)}`:''}.`:'';
 const L=refs.has.logo?`the team logo from ${refs.has.logo}, reproduced exactly`:null;
 const key=sceneOf({kind,...story}),list=SCENES[key]||SCENES[kind]||SCENES.check,scene=list[hash(`${seed}:${key}`)%list.length];
 // The commissioner joins only the scenes written for him, and only with his photo.
 const C=`FBL CASE ${no}`,wantsK=scene({G,L,C,K:KEY}).includes(KEY),k=wantsK?commissioner(refs.images.length+1,root):null;
 const all=k?{...refs,images:[...refs.images,k.image],legend:`${refs.legend.replace(/\.$/,'')}; ${k.legend}.`}:refs;
 return {images:all.images,prompt:[all.legend,IDENTITY(refs.has.zak),who,k?.block,scene({G,L,C,K:k?.name||null}),STYLE].filter(Boolean).join('\n\n')};
}

// The picture of a statement of his (data/announcements/<name>.picture.txt holds its scene): Zak Onn alone, his photo of
// the given mood the only reference.
// {commissioner} in the scene brings in the league's commissioner, Adam Silverov, with his photo (without it, the words
// "the league commissioner").
export function zakStatement({scene,mood='check',root}){
 const refs=references([{key:'zak',image:zakPhoto(mood,root),what:'Zak Onn, the league lawyer'}]);
 const k=scene.includes('{commissioner}')?commissioner(refs.images.length+1,root):null;
 const legend=k?`${refs.legend.replace(/\.$/,'')}; ${k.legend}.`:refs.legend;
 const text=scene.trim().replaceAll('{commissioner}',k?.name||'the league commissioner');
 return {images:k?[...refs.images,k.image]:refs.images,prompt:[legend,IDENTITY(refs.has.zak),k?.block,`SCENE: ${text}`,STYLE].filter(Boolean).join('\n\n')};
}
// Draws a statement's picture into a temporary PNG; null when it could not be drawn (his photo goes instead).
export async function drawStatement(args,{key,root,timeoutMs=120e3,attempts=2}={}){
 try{
  const {png,usage}=await generate(zakStatement({...args,root}),{key,timeoutMs,attempts});
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zak-')),'zak-onn-statement.png');
  fs.writeFileSync(file,png);
  console.log(`Picture of the statement: $${cost(usage).toFixed(3)}`);
  return file;
 }catch(e){console.warn(`Picture of the statement failed (${e.message}): his photo goes instead.`);return null;}
}

// Draws a protocol's picture into a temporary PNG. Answers its path, or null when it could not be drawn (the protocol then
// goes with his usual photo: a picture never holds a protocol back). Quick by design: the feed runs every minute.
export async function drawProtocol(args,{key,root,timeoutMs=90e3,attempts=2}={}){
 try{
  const {png,usage}=await generate(zakPicture({...args,root}),{key,timeoutMs,attempts});
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zak-')),`zak-onn-${args.kind}.png`);
  fs.writeFileSync(file,png);
  console.log(`Picture of protocol ${args.no}: $${cost(usage).toFixed(3)}`);
  return file;
 }catch(e){console.warn(`Picture of protocol ${args.no} failed (${e.message}): his photo goes instead.`);return null;}
}
