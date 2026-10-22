// FBL awards bot, the pictures of the game day: one for every hero and every flop of the day, sent to the league chat as
// albums after the day's post (the picture pipeline: scripts/image-pipeline.mjs). The awards are the league's, not Зак
// Онн's: he is the law and stays out of them (league chat, 22.10.2026). A picture shows the player himself, the logo of
// the league team that held him at tip-off and that team's GM when their photo is in scripts/assets/. The numbers in a
// picture and its caption are the line's FBL points (core.js scores every line with the league's formula, fblFormula).
import {int} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {references,gmPhoto,teamLogo} from '../scripts/image-pipeline.mjs';
import {esc,badges} from './messages.js';

const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};
const METAL=['GOLD','SILVER','BRONZE'];
const STYLE=`STYLE: photorealistic sports-magazine photo, dramatic arena lighting, 35mm lens, cinematic contrast, shallow depth of field. Square composition. The only text in the picture: the exact words given in quotes, spelled exactly, large and legible. No other captions or watermarks.`;

// A scene: the place and the moment, with the player's name (N), his FBL points (P) and NBA club; logo and gm are the
// words for the team's logo and GM when they are in the references (null otherwise), so a scene reads well without them.
// Heroes: the night belongs to them. Flops: the league laughs, the GM suffers.
const HERO=[
 ({N,P,metal,logo,gm})=>`SCENE: a glossy sports-magazine cover. The player soars for a thunderous dunk, arena lights flaring behind him. Cover title "HERO OF THE DAY" in ${metal} letters, with "${N}" and "${P} FBL" in big type.${logo?` ${logo} printed as a ${metal}-framed badge in the corner of the cover.`:''}${gm?` A small inset photo on the cover shows ${gm} screaming with joy.`:''}`,
 ({N,P,metal,logo,gm})=>`SCENE: an NBA arena after the final buzzer, ${metal} confetti raining through the spotlights. The player stands at center court roaring with his arms spread; the jumbotron above reads "${N}" and "${P} FBL"${logo?` next to ${logo}`:''}.${gm?` Courtside, ${gm} jumps out of their seat in ecstasy.`:''}`,
 ({N,P,metal,logo,gm})=>`SCENE: a champagne-soaked locker room. The player, drenched, holds up a ${metal} trophy engraved "${N} · ${P} FBL".${logo?` ${logo} is painted big on the locker-room wall behind him.`:''}${gm?` ${gm} sprays champagne over him, laughing.`:''}`,
 ({N,P,metal,logo,gm})=>`SCENE: a grand unveiling in a city square at night, fireworks overhead. A towering ${metal} statue of the player mid-dunk stands on a marble pedestal with a plaque reading "${N}" and "${P} FBL"${logo?` above ${logo}`:''}.${gm?` ${gm} pulls the silk cover off the statue with a proud grin.`:''} The player himself, in his jersey, poses next to it.`,
];
const FLOP=[
 ({N,P,logo,gm})=>`SCENE: an arena turned into a freezer, frost on the floor and icy blue light. The player is frozen solid inside a huge block of ice at center court, caught mid-airball; a frost-covered tag on the ice reads "${N}" and "${P} FBL - FROZEN".${logo?` ${logo} is frozen into the ice next to him.`:''}${gm?` ${gm} stands beside the ice block, facepalming in despair.`:''}`,
 ({N,P,logo,gm})=>`SCENE: an empty arena after the game, only the scoreboard still lit, reading "${N}" and "${P} FBL". The player sits alone at the very end of the bench with a towel over his head.${logo?` ${logo} is painted on the floor in front of him, half in shadow.`:''}${gm?` In the empty stands behind him, ${gm} holds their head in both hands.`:''}`,
 ({N,P,logo,gm})=>`SCENE: a tabloid newspaper front page. The giant headline "DISASTER" over a photo of the player bricking a wide-open layup, with "${N}" and "${P} FBL" in bold red.${logo?` ${logo} is printed next to the headline.`:''}${gm?` ${gm} holds the newspaper up in front of the camera, staring at it in shock.`:''}`,
 ({N,P,logo,gm})=>`SCENE: a basketball court buried in a pile of red bricks, one for every missed shot. The player stands on top of the pile shrugging; "${P} FBL" is spray-painted on the bricks, and a sign stuck into the pile reads "${N}".${logo?` ${logo} hangs on a banner above the court, crooked.`:''}${gm?` Next to the pile, ${gm} holds a cardboard sign reading "REFUND?".`:''}`,
];

// The name as the picture spells it: ESPN's short name in Latin letters ("N. Jokic"), which the model writes reliably.
export const imageName=l=>String(l.n||l.a).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'').trim()||String(l.a);
export const imagePoints=p=>(p<0?'-':'')+Math.abs(Math.round(p));
// The team a picture is about: the first that held him at tip-off (a shared player scores for his first holder).
export const pictureTeam=l=>Number.isInteger(l.h?.[0])?l.h[0]:null;

// One picture: its references (the team's logo, its GM) and its prompt. The scenes of an album follow each other from a
// place picked by the day: no two pictures of an album share a scene, and a day always gets the same ones.
export function picture(kind,line,i,day,{root}={}){
 const team=pictureTeam(line),gm=LEAGUE_TEAMS[team]?.gm;
 const refs=references([{key:'logo',image:teamLogo(team,root),what:'the logo of the fantasy team'},
  {key:'gm',image:gmPhoto(team,root),what:`a portrait of the fantasy team's general manager${gm?` (${gm})`:''}`}]);
 const list=kind==='hero'?HERO:FLOP,scene=list[(hash(`${day}:${kind}`)+i)%list.length];
 const player=`PLAYER: the real NBA player ${imageName(line)}${line.c?` of the ${line.c}`:''}, exactly as he really looks, in his team's jersey.`;
 const gmText=refs.has.gm?`the general manager (the exact person from ${refs.has.gm}, face preserved and recognizable)`:null;
 const logoText=refs.has.logo?`the team logo from ${refs.has.logo}, reproduced exactly`:null;
 const text=scene({N:imageName(line),P:imagePoints(line.p),metal:METAL[i]||METAL[2],logo:logoText,gm:gmText});
 return {images:refs.images,prompt:[refs.legend,player,text,STYLE].filter(Boolean).join('\n\n')};
}

const MEDALS=['🥇','🥈','🥉'];
// The caption of a picture: the place, the name as the league knows him (Sports.ru), his club, his teams and his FBL points.
const caption=(who,l,i,kind)=>`${kind==='hero'?MEDALS[i]||`${i+1}.`:`${i+1}.`} <b>${esc(who(l.a,l.n))}</b>${l.c?` · ${esc(l.c)}`:''}${badges(l.h||[])?' '+badges(l.h):''} — <b>${int(l.p)}</b> ФО`;
const TITLE={hero:'⭐ Герои дня',flop:'💩 Провалы дня'};
// The albums of a day: heroes, then flops (the day's post's blocks), the first `perBlock` of each. Their title goes on the
// first picture sent.
export function dayImages(day,blocks,who,{perBlock=3,root}={}){
 return [['hero',blocks.heroes],['flop',blocks.flops]].map(([kind,rows])=>[kind,(rows||[]).slice(0,perBlock)]).filter(([,rows])=>rows.length)
  .map(([kind,rows])=>({kind,title:TITLE[kind],items:rows.map((l,i)=>({...picture(kind,l,i,day,{root}),caption:caption(who,l,i,kind)}))}));
}
// A Telegram media group of an album's pictures ({caption, png}): the title above the first caption.
export function mediaGroup(title,pictures,kind){
 return {media:pictures.map((x,i)=>({type:'photo',media:`attach://p${i}`,caption:(i===0?`<b>${title}</b>\n`:'')+x.caption,parse_mode:'HTML'})),
  files:pictures.map((x,i)=>({field:`p${i}`,name:`fbl-${kind}-${i+1}.png`,bytes:x.png}))};
}
