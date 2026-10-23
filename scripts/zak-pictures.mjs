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
import {claudeJSON} from './claude-text.mjs';
import {fillPrompt} from './picture-prompt.mjs';

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
// P the newly signed player of an approved deal (league chat, 23.10.2026): Zak and the GM present him, every time a
// different way.
const SIGNING=[
 ({G,L,K,P})=>`SCENE: a packed press conference, camera flashes everywhere. Zak Onn and ${G} unveil the new signing, ${P}: the three stand behind a table full of microphones${L?`, the backdrop behind them printed with ${L}`:''}; ${G} holds up a basketball jersey, beaming, while Zak, arms crossed, looks the player up and down like a suspect in a line-up${K?`; ${K} applauds from the front row`:''}.`,
 ({G,P})=>`SCENE: an airport arrivals hall at night. ${G} waits behind the barrier holding a hand-written sign reading "WELCOME"; ${P} walks out pulling a suitcase, and Zak Onn, in dark sunglasses, stops him at the gate to check his passport with a magnifying glass before letting him through.`,
 ({G,L,P})=>`SCENE: the back of a black stretch limousine at night, city lights streaking past the windows. ${P} signs a contract on a briefcase${L?` stamped with ${L}`:''}; ${G} pops a bottle of champagne; Zak Onn holds the signed page up to the light, checking the signature like evidence.`,
 ({G,P})=>`SCENE: a 90s police precinct booking desk, but friendly. ${P} grins as he presses his fingers onto an ink pad for his background check; Zak Onn compares the prints with a magnifying glass; ${G} leans on the counter with a thumbs-up. A board behind them reads "CLEARED".`,
 ({G,L,P})=>`SCENE: the team's locker room${L?`, ${L} on the wall`:''}. ${G} proudly hangs a fresh basketball jersey in an empty locker for ${P}, who laughs; Zak Onn sweeps the locker with a flashlight for contraband before giving a curt nod.`,
 ({G,P})=>`SCENE: a skyscraper rooftop helipad at dusk, a helicopter landing behind, wind everywhere. ${P} steps off the helicopter; ${G} spreads their arms in welcome; Zak Onn stands between them with a clipboard titled "TRANSFER CLEARED", his tie blown over his shoulder.`,
 ({G,L,P})=>`SCENE: a magazine-cover photo shoot in a studio with softboxes, styled like a 90s action-movie poster. ${P} poses in the centre spinning a basketball on one finger; ${G} on one side${L?` holding a flag with ${L}`:''}, Zak Onn on the other with his arms folded and an "APPROVED" stamp in hand.`,
 ({G,L,K,P})=>`SCENE: night in the city, a motorcade of black SUVs at the arena entrance. Zak Onn, in sunglasses, opens the car door like a bodyguard for ${P}; ${G} walks ahead on a red carpet${L?` under a huge banner with ${L}`:''}${K?`, and ${K} waits at the door to shake the player's hand`:''}.`,
];
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
// --- The scene written by Claude (league chat, 23.10.2026: always a new story, never the same one twice). Claude gets the
// case in words and writes one scene with placeholders for the people the code draws from their photos; the code checks it
// (plain English, Zak and the GM in it, the new player in an approval, only allowed placeholders and numbers, nothing
// violent or out of bounds) and fills the placeholders. The scenes above are the fallback when Claude cannot write.
const CASE={approved:'a clean roster: the deal is approved',watched:'a clean roster of a team on Zak\'s watchlist: approved, but he keeps watching',
 closed:'case closed: these deals repaired an earlier breach',repeat:'a repeat offender: the roster still breaks a rule it broke before',
 violation:'a fresh breach of the league rules','check-time':'in doubt: the deal was made right at the 08:00 or 22:00 edge of the transfer hours',
 'check-white':'in doubt: the white-list rule','check':'in doubt: something about the deal needs checking',
 rookie:'a fresh breach: the roster has no rookie',white:'a fresh breach: no player of the league\'s white list on the roster',
 club:'a fresh breach: three players of one NBA club (the limit is 2)',transfers:'a fresh breach: a fourth transfer this week (the limit is 3)',
 time:'a fresh breach: a transfer made outside the hours 08:00-22:00 Moscow time',duplicate:'a fresh breach: a player another league team already holds'};
// The facts of a picture's scene, all Claude sees. has: what the picture can show (the GM's face, the logo, the new player,
// the commissioner).
export function sceneFacts({kind,team,no,root,player=null,...story}){
 const key=sceneOf({kind,...story}),signing=key==='approved'&&Boolean(player?.name);
 return {verdict:kind,case:CASE[key]||CASE[kind],caseLabel:`FBL CASE ${no}`,newPlayer:signing?player.name:null,
  gm:gmPhoto(team,root)?'shown with his face':'shown only from behind',logo:Boolean(teamLogo(team,root)),
  commissioner:Boolean(PEOPLE.find(x=>x.role==='commissioner'&&readImage(path.join(root||ASSETS,x.photo))))};
}
const SCENE_SYSTEM=`You write the scene of one picture for Zak Onn, the lawyer of FBL, a fantasy basketball league of friends. Each transfer protocol of the league gets a photorealistic picture: a still from a 90s American action film where the only plot is law and order, starring Zak Onn and the general manager (GM) of the team. The picture is drawn by an image model from your scene.
Write a brand-new story every time: a new place, a new situation, new props, a new gag. Never reuse an idea from the list of recent scenes. Think of anything: a car chase, a stakeout, a diner at 3 a.m., a car wash, a casino, a train, a rooftop, a bowling alley, a talk show, a hospital, a ferry, a bank vault, a fashion show, a wedding, a TV studio, a construction site, a museum — invent your own.
The story fits the case: an approval celebrates but Zak stays suspicious; a doubt is an investigation; a fresh breach is a bust; a repeat offence is harsher; a closed case is a release; a watched team is a stakeout. When there is a new player, the scene presents him: Zak and the GM introduce the new signing.
Placeholders (the code replaces them with the real people and things from photos, do not describe their faces or clothes): {GM} the general manager (always in the scene), {PLAYER} the new player (always in the scene when newPlayer is given, never otherwise), {LOGO} the team's logo on some object (only if logo is true), {COMMISSIONER} the league's commissioner (optional, only if commissioner is true), {CASE} the case label on a file or a tag (optional). Write "Zak Onn" by name.
Rules:
- Write the WHOLE prompt of the picture in plain English, 300-1200 characters: the setting, the action and the gag, the composition, the camera and lens, the light, the colours and the style. His signature look is a still from a 90s American action film about law and order, but the style is yours to set each time.
- Zak Onn is always the Lawyer in a red "God Bless America" cap (the code says so; do not mention the cap). He may wear what the scene needs.
- At most two short signs or labels in English capitals in double quotes, at most 4 words each. No other text.
- Comedy of the 90s action film: tough, ironic, never cruel. Handcuffs, files, stamps, flashlights, binoculars, magnifying glasses are fine. No guns or any weapons, no shooting, no blood, no violence or hitting, no death, no children or schools, no drugs, no sex.
- Numbers in the quoted signs: only those of the facts (the case label, the limits, the hours). Basketball is the only sport.
Answer only JSON: {"scene": "..."} (scene: the whole prompt)`;
export const SCENE_SCHEMA={type:'object',additionalProperties:false,required:['scene'],properties:{scene:{type:'string'}}};
export const sceneMessages=(facts,recent=[])=>({system:SCENE_SYSTEM,prompt:`${recent.length?`Recent scenes, do not repeat their ideas:\n${recent.slice(-30).map(x=>`- ${x}`).join('\n')}\n\n`:''}The case:\n${JSON.stringify(facts,null,1)}`});
// Basketball and photography words are not violence: shooting, a jump shot, a wide shot, dead silence pass.
const OUT_OF_BOUNDS=/\b(guns?|pistols?|rifles?|revolvers?|shotguns?|weapons?|bullets?|ammo|blood\w*|kill\w*|death|corpses?|murder\w*|children|child|kids?|school\w*|drugs?|cocaine|sex\w*|naked|nude|punch\w*|torture\w*|explod\w*|bombs?)\b/i;
// What is wrong with Claude's scene for these facts ([]: it may go into the picture).
export function sceneProblems(text,facts){
 const out=[];
 if(typeof text!=='string'||!text.trim())return ['no scene'];
 const t=text.trim();
 if(t.length<40||t.length>1300)out.push(`length ${t.length}`);
 if(!/^[\x20-\x7e]+$/.test(t))out.push('not plain English');
 if(!/Zak Onn/.test(t))out.push('no Zak Onn');
 if(!t.includes('{GM}'))out.push('no {GM}');
 if(facts.newPlayer&&!t.includes('{PLAYER}'))out.push('no {PLAYER}');
 const allowed=new Set(['{GM}','{CASE}',...facts.newPlayer?['{PLAYER}']:[],...facts.logo?['{LOGO}']:[],...facts.commissioner?['{COMMISSIONER}']:[]]);
 const stray=(t.match(/\{[^}]*\}/g)||[]).filter(x=>!allowed.has(x));if(stray.length)out.push(`placeholders ${[...new Set(stray)].join(', ')}`);
 const quotes=t.match(/"[^"]*"/g)||[];if(quotes.length>2||quotes.some(q=>q.length>40))out.push('too much text in quotes');
 // The words in quotes are drawn: their numbers only the facts' own.
 const numbers=new Set(JSON.stringify(facts).match(/\d+/g)||[]),strayN=(quotes.join(' ').match(/\d+/g)||[]).filter(n=>!numbers.has(n));
 if(strayN.length)out.push(`numbers in quotes ${strayN.join(', ')}`);
 const bad=t.match(OUT_OF_BOUNDS);if(bad)out.push(`out of bounds: ${bad[0]}`);
 return out;
}
// Claude's scene (two tries), or null: then the fixed scenes. A ClaudeError (no CLI, the token, the limit, no answer in
// time) is the caller's.
export async function writeScene(facts,{recent=[],write=claudeJSON,timeoutMs=90e3,log=console.warn}={}){
 for(let i=0;i<2;i++){
  const {data}=await write({...sceneMessages(facts,recent),schema:SCENE_SCHEMA,timeoutMs});
  const problems=sceneProblems(data?.scene,facts);
  if(!problems.length)return data.scene.trim();
  log(`Zak Onn's scene refused (${problems.join('; ')})${i?': a fixed scene goes instead':', written again'}.`);
 }
 return null;
}

// Opus's picture (owner, 23.10.2026: the whole prompt is his): the code fills in the references and who is who: Zak's
// face and his red cap, the GM's face (never named: a name can trip the image model), the logo, the new player, the
// commissioner when the prompt calls him.
function writtenZak({kind,team,no,root,player,written,...story}){
 const gm=gmOf(team),gmFace=gmPhoto(team,root),signing=sceneOf({kind,...story})==='approved'&&Boolean(player?.name),k=PEOPLE.find(x=>x.role==='commissioner');
 const text=written.replaceAll('{CASE}',`"FBL CASE ${no}"`).replace('Zak Onn','{ZAK}');
 return fillPrompt(text,[
  {key:'ZAK',image:zakPhoto(ZAK_MOOD[kind]||'check',root),name:'Zak Onn',what:'Zak Onn, the league lawyer',always:true,
   identity:`preserve his face precisely: face shape, nose, brows, eyes, hairline, greying temples, age, skin tone; instantly recognizable. ${looks(person('zak-onn')).replace(/^Zak Onn; the face exactly as in the photo; never/,'Never')}`},
  {key:'GM',image:gmFace,name:gmFace?'the general manager':'the team\'s general manager, seen only from behind',what:'the general manager of the fantasy team',
   identity:gmFace&&gm?`${looks({...gm,en:'the general manager'})}; the face preserved and recognizable`:null},
  {key:'LOGO',image:teamLogo(team,root),name:'the team logo',what:'the fantasy team logo'},
  {key:'PLAYER',image:signing?player.image||null:null,name:signing?`${player.name}, the newly signed NBA player`:'the new player',what:`${player?.name}, the newly signed NBA player`,always:signing,
   identity:signing?`the real NBA player ${player.name}, exactly as he really looks`:null},
  {key:'COMMISSIONER',image:k?readImage(path.join(root||ASSETS,k.photo)):null,name:'Adam Silverov, the league commissioner',what:'Adam Silverov, the league commissioner',
   identity:k?`${looks(k)}; the face preserved and recognizable`:null}]);
}
// player: the newly signed player of an approved deal, {name (in Latin letters), image (his ESPN headshot, or null)}.
// written: Claude's scene (writeScene), with its placeholders; without it, a fixed scene.
export function zakPicture({kind,team,no,seed,root,player=null,written=null,...story}){
 if(written)return writtenZak({kind,team,no,root,player,written,...story});
 const gm=gmOf(team),gmName=gm?.en||LEAGUE_TEAMS[team]?.gm;
 // An approved deal with its new player is presented, one of the signing scenes; without him, the plain approval.
 const key=sceneOf({kind,...story}),signing=key==='approved'&&Boolean(player?.name);
 const refs=references([{key:'zak',image:zakPhoto(ZAK_MOOD[kind]||'check',root),what:'Zak Onn, the league lawyer'},
  {key:'gm',image:gmPhoto(team,root),what:`the general manager of the fantasy team${gmName?` (${gmName})`:''}`},
  {key:'logo',image:teamLogo(team,root),what:'the fantasy team logo'},
  {key:'player',image:signing?player.image||null:null,what:`${player?.name}, the newly signed NBA player`}]);
 const G=refs.has.gm?`${gm?.en||'the general manager'} (the general manager, ${refs.has.gm})`:'the team\'s general manager, seen only from behind';
 // Who the GM is and what never changes about them, in a block of its own (the scene names them only).
 const who=refs.has.gm?`GENERAL MANAGER: the exact person from ${refs.has.gm}, face preserved and recognizable${gm?`: ${looks(gm)}`:''}.`:'';
 const L=refs.has.logo?`the team logo from ${refs.has.logo}, reproduced exactly`:null;
 const list=signing?SIGNING:SCENES[key]||SCENES[kind]||SCENES.check,fixed=list[hash(`${seed}:${signing?'signing':key}`)%list.length];
 const scene=written?({G,L,C,P,K})=>`SCENE: ${written.replaceAll('{GM}',G).replaceAll('{PLAYER}',P||'the new player').replaceAll('{LOGO}',L||'the team logo')
  .replaceAll('{CASE}',`"${C}"`).replaceAll('{COMMISSIONER}',K||'the league commissioner')}`:fixed;
 const P=signing?(refs.has.player?`${player.name} (the newly signed real NBA player, ${refs.has.player})`:`the newly signed real NBA player ${player.name}`):null;
 const newcomer=signing?`NEW PLAYER: the real NBA player ${player.name}${refs.has.player?`, his face exactly as in ${refs.has.player}`:''}, exactly as he really looks, in smart casual clothes unless the scene gives him a jersey.`:null;
 // The commissioner joins only the scenes written for him, and only with his photo.
 const C=`FBL CASE ${no}`,wantsK=scene({G,L,C,P,K:KEY}).includes(KEY),k=wantsK?commissioner(refs.images.length+1,root):null;
 const all=k?{...refs,images:[...refs.images,k.image],legend:`${refs.legend.replace(/\.$/,'')}; ${k.legend}.`}:refs;
 return {images:all.images,prompt:[all.legend,IDENTITY(refs.has.zak),who,newcomer,k?.block,scene({G,L,C,P,K:k?.name||null}),STYLE].filter(Boolean).join('\n\n')};
}

// The scene of a statement's picture written by Claude from the statement itself, when the statement has no scene of its
// own (league chat, 23.10.2026: a statement always goes with its picture). Zak Onn and, when it fits, the commissioner.
const STATEMENT_SYSTEM=`You write the scene of one picture for a statement of Zak Onn, the lawyer of FBL, a fantasy basketball league of friends. The statement is posted in the league chat with a photorealistic picture: a still from a 90s American action film where the only plot is law and order, starring Zak Onn. The picture is drawn by an image model from your scene.
Read the statement and show its point in one strong, inventive image: a place, an action, props, a gag that fits it. Zak Onn knows nothing about computers: never screens, code, servers or databases; show it as a case — suspects, documents, an investigation, a verdict. Never a plain portrait, never Zak just smiling at the camera. Something new every time.
Placeholders (the code replaces them with the real person from his photo, do not describe his face or clothes): {COMMISSIONER} the league's commissioner, optional, when the statement concerns him or the league's decisions. Write "Zak Onn" by name; no other real people, other figures are anonymous or seen from behind.
Rules:
- 2 to 4 sentences of plain English, at most 600 characters, starting with the setting.
- Zak Onn is always the Lawyer in a red "God Bless America" cap (the code says so; do not mention the cap). He may wear what the scene needs.
- At most two short signs or labels in English capitals in double quotes, at most 4 words each. No other text. Numbers in them only from the statement.
- Tough, ironic 90s action-film tone, never cruel. No guns or any weapons, no shooting, no blood, no violence, no death, no children or schools, no drugs, no sex. Basketball is the only sport.
Answer only JSON: {"scene": "..."}`;
// What is wrong with a statement's scene ([]: it may be drawn).
export function statementSceneProblems(scene,statement){
 const out=[];
 if(typeof scene!=='string'||!scene.trim())return ['no scene'];
 const t=scene.trim(),quotes=t.match(/"[^"]*"/g)||[];
 if(t.length<40||t.length>700)out.push(`length ${t.length}`);
 if(!/^[\x20-\x7e]+$/.test(t))out.push('not plain English');
 if(!/Zak Onn/.test(t))out.push('no Zak Onn');
 const stray=(t.match(/\{[^}]*\}/g)||[]).filter(x=>x!=='{COMMISSIONER}');if(stray.length)out.push(`placeholders ${[...new Set(stray)].join(', ')}`);
 if(quotes.length>2||quotes.some(q=>q.length>40))out.push('too much text in quotes');
 const numbers=new Set(String(statement).match(/\d+/g)||[]),strayN=(quotes.join(' ').match(/\d+/g)||[]).filter(n=>!numbers.has(n));
 if(strayN.length)out.push(`numbers in quotes ${strayN.join(', ')}`);
 const bad=t.match(OUT_OF_BOUNDS);if(bad)out.push(`out of bounds: ${bad[0]}`);
 return out;
}
// Claude's scene of a statement (two tries) in zakStatement's form ({commissioner}), or null.
export async function writeStatementScene(statement,{write=claudeJSON,timeoutMs=90e3,log=console.warn}={}){
 const text=String(statement).replace(/<[^>]+>/g,'').replace(/\{@[^}]*\}/g,'').trim();
 for(let i=0;i<2;i++){
  const {data}=await write({system:STATEMENT_SYSTEM,prompt:`The statement:\n${text}`,schema:SCENE_SCHEMA,timeoutMs});
  const problems=statementSceneProblems(data?.scene,text);
  if(!problems.length)return data.scene.trim().replaceAll('{COMMISSIONER}','{commissioner}');
  log(`The statement's scene refused (${problems.join('; ')})${i?'':', written again'}.`);
 }
 return null;
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
