// The pictures of Зак Онн's transfer protocols (the picture pipeline: scripts/image-pipeline.mjs). He is the law and only
// the law: every picture is about the rules check of a team's deals, and he deals with that team's GM in person, the
// team's logo in the scene. His mood follows the verdict: a clean roster he approves through gritted teeth, a doubt he
// investigates, a breach he prosecutes. A GM without a photo in scripts/assets/gm/ is drawn from behind, never invented.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {references,zakPhoto,gmPhoto,teamLogo,generate,cost} from './image-pipeline.mjs';

const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};
// His photo of each verdict: the red-cap ones (violation.jpg has a navy cap, the prompt keeps him in the red one).
export const ZAK_MOOD={approved:'approved',check:'check',violation:'check'};

const IDENTITY=zak=>`ZAK ONN (highest priority): the man from ${zak}, the league's lawyer. Preserve his face precisely: face shape, nose, brows, eyes, hairline, greying temples, age, skin tone; instantly recognizable. He wears a tailored charcoal-grey suit, white shirt, plain black tie and the bright red baseball cap with white embroidered text "God Bless America", spelled exactly.`;
const STYLE=`STYLE: photorealistic still from a 90s American action film about law and order, cinematic contrast, 35mm lens, shallow depth of field. Square composition. The only text in the picture: the cap embroidery and the exact words given in quotes, spelled exactly. No other captions or watermarks.`;

// A scene: G is the GM (their reference, or an anonymous figure from behind), L the team's logo (null without one), C the
// case number on the protocol.
const SCENES={
 approved:[
  ({G,L})=>`SCENE: a detective's office at night, neon through the blinds. Zak Onn brings a big red "APPROVED" stamp down on a stack of transfer papers on his desk${L?`, the folder marked with ${L}`:''}, while ${G} grins across the desk. Zak's eyes stay narrow and suspicious: approved, not trusted.`,
  ({G,L})=>`SCENE: a press-photo handshake in front of a backdrop${L?` covered with ${L}`:''}. Zak Onn shakes hands with ${G}, smiling for the cameras through clenched teeth, his other hand resting on the handcuffs at his belt, just in case.`,
  ({G,L})=>`SCENE: a police checkpoint on a highway at night, red and blue lights. Zak Onn shines a flashlight into a convertible${L?` with ${L} on its door`:''} and waves it through with two fingers; ${G} at the wheel salutes nervously.`,
 ],
 check:[
  ({G,L,C})=>`SCENE: an interrogation room under a single hanging lamp. ${G} sits sweating at a metal table; Zak Onn leans over them, one hand on an open case file labelled "${C}"${L?` with ${L} on its cover`:''}, the other holding a pen like a weapon. Expression: cold, patient suspicion.`,
  ({G,L})=>`SCENE: the team's trophy room. Zak Onn dusts ${L?`a trophy bearing ${L}`:'the team trophy'} for fingerprints with a forensic brush and a magnifying glass, while ${G} watches over his shoulder, wringing their hands.`,
  ({G,L,C})=>`SCENE: a police lab. ${G} is strapped to a lie detector, its needle scribbling wildly; Zak Onn studies the printout${L?`, ${L} on the evidence board behind him`:''}, and a tag on the machine reads "${C}". Expression: one eyebrow raised, unconvinced.`,
 ],
 violation:[
  ({G,L})=>`SCENE: the team's headquarters, camera flashes exploding. Zak Onn snaps handcuffs on ${G} right in front of a giant banner${L?` with ${L}`:''}, staring down the lens with total contempt.`,
  ({G,L,C})=>`SCENE: the team's office door${L?` with ${L} on the glass`:''}, sealed with yellow tape reading "FBL CRIME SCENE - DO NOT CROSS". Zak Onn sips coffee in front of the tape holding a file labelled "${C}"; behind the tape, ${G} pleads with both hands. Zak does not care.`,
  ({G,L,C})=>`SCENE: a wood-panelled courtroom. ${G} sits in the defendant's chair; Zak Onn, the prosecutor, points at them with full force, an evidence board behind him showing "${C}"${L?` and ${L}`:''}. Expression: righteous fury.`,
 ],
};

// The picture of a protocol: kind (approved, check, violation), the team's index (0 to 7), the protocol's number and a
// seed (its first deal: a protocol always gets the same scene).
export function zakPicture({kind,team,no,seed,root}){
 const gmName=LEAGUE_TEAMS[team]?.gm;
 const refs=references([{key:'zak',image:zakPhoto(ZAK_MOOD[kind]||'check',root),what:'Zak Onn, the league lawyer'},
  {key:'gm',image:gmPhoto(team,root),what:`the general manager of the fantasy team${gmName?` (${gmName})`:''}`},
  {key:'logo',image:teamLogo(team,root),what:'the fantasy team logo'}]);
 const G=refs.has.gm?`the general manager (the exact person from ${refs.has.gm}, face preserved and recognizable)`
  :'the team\'s general manager, seen only from behind';
 const L=refs.has.logo?`the team logo from ${refs.has.logo}, reproduced exactly`:null;
 const list=SCENES[kind]||SCENES.check,scene=list[hash(`${seed}:${kind}`)%list.length];
 return {images:refs.images,prompt:[refs.legend,IDENTITY(refs.has.zak),scene({G,L,C:`FBL CASE ${no}`}),STYLE].filter(Boolean).join('\n\n')};
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
