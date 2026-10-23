// The pictures of Зак Онн (the picture pipeline: scripts/image-pipeline.mjs): his transfer protocols and his statements.
// He is the law and only the law: a protocol's picture is about the rules check of a team's deals, and he deals with that
// team's GM in person; a statement's picture shows its point. Claude writes every prompt whole (owner, 23.10.2026,
// scripts/picture-prompt.mjs): the code gives him the case and the references (Zak's photo, the GM's, the team's logo,
// the new player's face, the commissioner's) and checks what he wrote. When he cannot write one, no picture is drawn: the
// protocol or the statement goes with Zak's usual photo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generate,cost,gmPhoto} from './image-pipeline.mjs';
import {cast,zakRef,gmRef,logoRef,commissionerRef,playerRef,promptProblems,writePicture,CRAFT} from './picture-prompt.mjs';

// His photo of each verdict: the red-cap ones (violation.jpg has a navy cap).
export const ZAK_MOOD={approved:'approved',check:'check',violation:'check'};

// The case of a protocol. rules: the rules broken (a breach) or in doubt (a check); standing: a breach the roster had
// already; fixed: a breach the deals repaired; watched: a team on his watchlist.
const DUTY=['duplicate','transfers','time','club','white','rookie'];
export function sceneOf({kind,rules=[],standing=false,fixed=false,watched=false}){
 if(kind==='violation'){if(standing)return 'repeat';return DUTY.find(r=>rules.includes(r))||'violation';}
 if(kind==='check'){if(rules.includes('time'))return 'check-time';if(rules.includes('white')||rules.includes('unmarked'))return 'check-white';return 'check';}
 if(fixed)return 'closed';
 return watched?'watched':'approved';
}
const CASE={approved:'a clean roster: the deal is approved',watched:'a clean roster of a team on Zak\'s watchlist: approved, but he keeps watching',
 closed:'case closed: these deals repaired an earlier breach',repeat:'a repeat offender: the roster still breaks a rule it broke before',
 violation:'a fresh breach of the league rules','check-time':'in doubt: the deal was made right at the 08:00 or 22:00 edge of the transfer hours',
 'check-white':'in doubt: the white-list rule','check':'in doubt: something about the deal needs checking',
 rookie:'a fresh breach: the roster has no rookie',white:'a fresh breach: no player of the league\'s white list on the roster',
 club:'a fresh breach: three players of one NBA club (the limit is 2)',transfers:'a fresh breach: a fourth transfer this week (the limit is 3)',
 time:'a fresh breach: a transfer made outside the hours 08:00-22:00 Moscow time',duplicate:'a fresh breach: a player another league team already holds'};
// A protocol's case as Claude sees it. kind (approved, check, violation), team (0 to 7), no (the protocol's number),
// player: the newly signed player of an approved deal, {name (in Latin letters), image (his ESPN headshot, or null)}.
export function sceneFacts({kind,team,no,root,player=null,...story}){
 const key=sceneOf({kind,...story}),signing=key==='approved'&&Boolean(player?.name);
 return {verdict:kind,case:CASE[key]||CASE[kind],caseLabel:`FBL CASE ${no}`,newPlayer:signing?player.name:null,
  gm:gmPhoto(team,root)?'in the picture with his face (his reference)':'no photo of the GM: shown only from behind, never a face'};
}
// The references of a protocol's picture: Zak, the GM, the team's logo, the new player's face, the commissioner.
export function protocolCast({kind,team,root,player=null,...story}){
 const signing=sceneOf({kind,...story})==='approved'&&Boolean(player?.name);
 return cast([zakRef(ZAK_MOOD[kind]||'check',root),gmRef(team,root),logoRef(team,root),
  signing?playerRef(player.image||null,player.name,{role:'the newly signed player'}):null,commissionerRef(root)]);
}
const PROTOCOL_SYSTEM=`You write the picture of one transfer protocol of Zak Onn, the lawyer of FBL, a fantasy basketball league of friends. Each protocol goes to the league chat with a photorealistic picture where the only plot is law and order: Zak Onn deals in person with the general manager (GM) of the team whose deals he checked. Zak knows nothing about computers and everything about law, cases and shady types: never screens, code, servers or databases in his pictures — a case, suspects, documents, an investigation, a verdict.
Write a brand-new story every time: a new place, a new situation, new props, a new gag. Never reuse an idea of the recent pictures. Think of anything: a car chase, a stakeout, a diner at 3 a.m., a car wash, a casino, a train, a rooftop, a bowling alley, a talk show, a hospital, a ferry, a bank vault, a fashion show, a wedding, a TV studio, a construction site, a museum — invent your own.
The story fits the case: an approval celebrates but Zak stays suspicious; a doubt is an investigation; a fresh breach is a bust; a repeat offence is harsher; a closed case is a release; a watched team is a stakeout. With a new player, Zak and the GM present the new signing. The commissioner may join when it fits.
Zak Onn is always the Lawyer, always in the bright red cap embroidered "God Bless America"; he may wear what the scene needs. The case label (caseLabel) may be on a file or a tag. At most two short signs or labels besides the cap, in English capitals, at most 4 words each.
Comedy of a 90s action film: tough, ironic, never cruel. Handcuffs, files, stamps, flashlights, binoculars and magnifying glasses are fine; no hitting, no children or schools.

${CRAFT}`;
// Words a picture of his never holds (beyond the league's own, picture-prompt.mjs OFF_LIMITS).
// An old-school barbershop is not a school.
const OUT_OF_BOUNDS=/\b(children|child|kids?|(?<!old[- ])school\w*|punch(es|ed|ing)?)\b/i;
const numbersIn=x=>new Set(JSON.stringify(x).match(/\d+/g)||[]);
// A protocol's picture written by Claude: {images, prompt, idea}, or null. recent: the ideas of his last pictures.
export async function writeProtocolPicture(story,{recent=[],root,write,timeoutMs=120e3,log}={}){
 const facts=sceneFacts({...story,root}),c=protocolCast({...story,root});
 const brief=`${recent.length?`Recent pictures, do not repeat their ideas:\n${recent.slice(-30).map(x=>`- ${x}`).join('\n')}\n\n`:''}The case:\n${JSON.stringify(facts,null,1)}`;
 return writePicture({system:PROTOCOL_SYSTEM,brief,c,check:t=>promptProblems(t,c,{numbers:numbersIn(facts),forbidden:OUT_OF_BOUNDS}),
  ...write?{write}:{},timeoutMs,label:`Zak Onn, protocol ${story.no}`,...log?{log}:{}});
}

// A statement's picture (league chat, 23.10.2026: a statement always goes with its own picture): Zak Onn and, when it
// fits, the commissioner. idea: the editor's idea of the picture (data/announcements/<name>.picture.txt), Claude's to use.
const STATEMENT_SYSTEM=`You write the picture of one statement of Zak Onn, the lawyer of FBL, a fantasy basketball league of friends. The statement goes to the league chat with a photorealistic picture: a still from a 90s American action film where the only plot is law and order, starring Zak Onn.
Read the statement and show its point, as the statement rules it, in one strong, inventive image: a place, an action, props, a gag that fits it. The picture agrees with the statement: whoever the statement rules for wins in the picture too, and no sign or prop says the opposite of the ruling. Zak Onn knows nothing about computers: never screens, code, servers or databases; show it as a case — suspects, documents, an investigation, a verdict. Never a plain portrait, never Zak just smiling at the camera.
The commissioner joins when the statement concerns him or the league's decisions. Other figures are anonymous or seen from behind; no other real people.
Zak Onn is always the Lawyer, always in the bright red cap embroidered "God Bless America"; he may wear what the scene needs. At most two short signs or labels besides the cap, in English capitals, at most 4 words each; numbers in them only from the statement.
Tough, ironic 90s action-film tone, never cruel; no hitting, no children or schools.

${CRAFT}`;
export const statementCast=({mood='check',root}={})=>cast([zakRef(mood,root),commissionerRef(root)]);
export async function writeStatementPicture(statement,{idea=null,mood='check',root,write,timeoutMs=180e3,log}={}){
 const text=String(statement).replace(/<[^>]+>/g,'').replace(/\{@[^}]*\}/g,'').trim(),c=statementCast({mood,root});
 const brief=`The statement:\n${text}${idea?`\n\nThe editor's idea of the picture (use it or make it better; the statement decides):\n${idea.trim()}`:''}`;
 return writePicture({system:STATEMENT_SYSTEM,brief,c,check:t=>promptProblems(t,c,{numbers:numbersIn(text),forbidden:OUT_OF_BOUNDS}),
  ...write?{write}:{},timeoutMs,label:'Zak Onn, statement',...log?{log}:{}});
}

// Draws a picture Claude wrote ({images, prompt}) into a temporary PNG: its path, or null when it could not be drawn (Zak's
// usual photo goes instead: a picture never holds a protocol or a statement back). what: for the log and the file.
export async function drawPicture(picture,what,{key,timeoutMs=120e3,attempts=2}={}){
 if(!picture)return null;
 try{
  const {png,usage}=await generate(picture,{key,timeoutMs,attempts});
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'zak-')),`zak-onn-${String(what).replace(/[^a-z0-9]+/gi,'-')}.png`);
  fs.writeFileSync(file,png);
  console.log(`Picture of ${what}: $${cost(usage).toFixed(3)}`);
  return file;
 }catch(e){console.warn(`Picture of ${what} failed (${e.message}): his photo goes instead.`);return null;}
}
