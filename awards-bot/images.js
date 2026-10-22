// FBL awards bot, the pictures of the game day (league chat, 22.10.2026): two per day, drawn by the picture pipeline
// (scripts/image-pipeline.mjs) and sent after the day's album. One for the heroes, one for the flops: the block's players
// together in one scene, the first of the block in the centre, each with a moment of his own picked from his stat line (a
// great night is celebrated, a bad one laughed at). Every player wears the kit of the league team that held him at
// tip-off, in the colours of its logo, with that logo on his chest. The awards are the league's, not Зак Онн's: he is the
// law and stays out of them. The numbers in a picture and its caption are the line's FBL points (core.js scores every
// line with the league's formula, fblFormula) and the box score's own counts.
import {int} from '../src/format.js';
import {references,teamLogo,gmOf} from '../scripts/image-pipeline.mjs';
import {esc,badges} from './messages.js';
import {MISSED_BRICKS} from './core.js';

export const SIZE='1536x1024';
// Each league team's kit, from the colours of its logo (scripts/assets/team-logos/<team number>), told apart in one scene.
export const KITS=[
 'black with blood-red and gold trim',
 'imperial gold with black trim',
 'white with black and playing-card-red trim',
 'orange with black and white trim',
 'black with red trim and bone-white details',
 'lemon yellow with navy-blue trim',
 'burnt orange with teal and cream trim',
 'navy blue with red and white trim',
];
// The name as the picture spells it: ESPN's short name in Latin letters ("N. Jokic"), which the model writes reliably.
export const imageName=l=>String(l.n||l.a).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'').trim()||String(l.a);
export const imagePoints=p=>(p<0?'-':'')+Math.abs(Math.round(p));
// The team a picture is about: the first that held him at tip-off (a shared player scores for his first holder).
export const pictureTeam=l=>Number.isInteger(l.h?.[0])?l.h[0]:null;
const gmName=team=>Number.isInteger(team)?gmOf(team)?.en||null:null;

// The moments, in order of priority: the first that fits a player and is not taken yet in the picture is his. when: does
// his line call for it; text: what he does and the words on his sign. The last ones of each list fit anybody.
const tens=s=>[s.pts,s.reb,s.ast,s.stl,s.blk].filter(v=>v>=10).length;
const HERO=[
 {id:'triple',when:s=>tens(s)>=3,text:({P})=>`wears a golden crown and holds up a sign reading "TRIPLE-DOUBLE · ${P} FBL", regal and smug`},
 {id:'perfect',when:s=>s.fga>=5&&s.fgm===s.fga,text:({s})=>`sits back in sunglasses, ice-cold, holding a sign reading "PERFECT ${s.fgm}/${s.fga}"`},
 {id:'scorer',when:s=>s.pts>=35,text:({P})=>`slouches in a chair in a puffer jacket and orange ski goggles while teammates spray water over him, holding a hand-written sign reading "${P} FBL"`},
 {id:'glass',when:s=>s.reb>=14,text:({s})=>`polishes a backboard with a window squeegee, a sign hanging from the rim reads "${s.reb} REBOUNDS"`},
 {id:'maestro',when:s=>s.ast>=10,text:({s})=>`conducts with a conductor's baton like a maestro, a music stand in front of him reads "${s.ast} ASSISTS"`},
 {id:'lockdown',when:s=>s.stl+s.blk>=6,text:()=>`has a heavy chain and padlock over his shoulder, holding a sign reading "LOCKDOWN"`},
 {id:'thanks',when:(s,x)=>!!x.gm,text:({gm})=>`points at the camera with a grin, holding a hand-written sign reading "THANK YOU GM ${gm.toUpperCase()} FOR THE TRUST"`},
 {id:'flex',when:()=>true,text:({P})=>`flexes both arms, a gold medal around his neck, holding a sign reading "${P} FBL"`},
 {id:'trophy',when:()=>true,text:({P})=>`kisses a small golden trophy engraved "${P} FBL"`},
];
const FLOP=[
 {id:'bricks',when:s=>s.fga-s.fgm>=MISSED_BRICKS-2,text:({s})=>`sits on a pile of red bricks holding one more brick, a sign stuck in the pile reads "${s.fgm}/${s.fga} FG"`},
 {id:'turnovers',when:s=>s.tov>=5,text:({s})=>`reaches in vain for a handful of basketballs bouncing away from him, a sign at his feet reads "${s.tov} TURNOVERS"`},
 {id:'fouls',when:s=>s.pf>=5,text:()=>`is shown the way to the locker room by a referee pointing at the exit, a sign reads "FOULED OUT"`},
 {id:'frozen',when:(s,x)=>!!x.ice,text:({P})=>`is frozen solid in a block of ice, a frosty tag on the ice reads "${P} FBL"`},
 {id:'freethrows',when:s=>s.fta-s.ftm>=4,text:({s})=>`stares at a free-throw line with a basketball stuck between the rim and the backboard, a sign reads "${s.ftm}/${s.fta} FT"`},
 {id:'ghost',when:s=>s.pts<=4,text:({s})=>`is half see-through like a ghost, a sign floating next to him reads "${s.pts} PTS. WAS I THERE?"`},
 {id:'sorry',when:(s,x)=>!!x.gm,text:({gm})=>`holds a hand-written sign reading "SORRY GM ${gm.toUpperCase()}", looking guilty`},
 {id:'towel',when:()=>true,text:({P})=>`sits at the end of the bench with a towel over his head, a sign at his feet reads "${P} FBL"`},
 {id:'shrug',when:()=>true,text:({P})=>`shrugs at the camera with a sheepish grin, holding a sign reading "${P} FBL"`},
];
// The moments of a picture's players, in their order: none twice. form: the players' form (core.js form()).
export function moments(kind,rows,form=new Map()){
 const list=kind==='hero'?HERO:FLOP,taken=new Set();
 return rows.map(l=>{const team=pictureTeam(l),x={gm:gmName(team),ice:!!form.get(l.a)?.ice},s=l.s||{};
  const m=list.find(m=>!taken.has(m.id)&&m.when(s,x));
  taken.add(m.id);
  return {id:m.id,text:m.text({N:imageName(l),P:imagePoints(l.p),s,gm:x.gm||''})};});
}

const PLACES=['CENTRE (the first of the block, bigger and in front)','LEFT','RIGHT'];
const SCENE={
 hero:'a jubilant NBA locker room after a big win, confetti and water spray in the air, flashes of photographers',
 flop:'a gloomy NBA locker room after a bad loss, dim light, a single flickering lamp, the fun of a sports meme',
};
const TITLE_TEXT={hero:'FBL HEROES OF THE DAY',flop:'FBL FLOPS OF THE DAY'};
// One picture of a block: its references (each player's face when given, each league team's logo once) and its prompt.
// faces: ESPN id → the headshot ({bytes, name, type}); root: the assets folder (team logos).
export function blockPicture(kind,rows,{faces=new Map(),form,root}={}){
 rows=rows.slice(0,3);
 const teams=[...new Set(rows.map(pictureTeam).filter(t=>t!==null))];
 const refs=references([...rows.map(l=>({key:'face:'+l.a,image:faces.get(String(l.a))||null,what:`the face of ${imageName(l)}`})),
  ...teams.map(t=>({key:'logo:'+t,image:teamLogo(t,root),what:`the logo of the fantasy team of ${rows.filter(l=>pictureTeam(l)===t).map(imageName).join(' and ')}`}))]);
 const acts=moments(kind,rows,form);
 const people=rows.map((l,i)=>{const t=pictureTeam(l),face=refs.has['face:'+l.a],logo=refs.has['logo:'+t];
  return `${PLACES[i]}: the real NBA player ${imageName(l)}${l.c?` of the ${l.c}`:''}, ${face?`his face exactly as in ${face}, `:''}exactly as he really looks. `
   +`He wears a basketball uniform ${t!==null?KITS[t]:'in black and gold'}${logo?`, with the logo from ${logo} on the chest, reproduced exactly`:''} (the colours of his fantasy team, not his NBA team). `
   +`He ${acts[i].text}.`;});
 const order=rows.length>1?` The ${rows.length} players are side by side, each with his own moment, the one in the centre the star of the picture.`:'';
 const prompt=[refs.legend,`SCENE: ${SCENE[kind]}.${order} A banner above them reads "${TITLE_TEXT[kind]}".`,...people,
  `STYLE: photorealistic sports-photo, cinematic arena lighting, 35mm lens, the humour of a viral sports meme, good-natured, never cruel. Landscape composition, every face clearly visible. The only text in the picture: the exact words given in quotes, spelled exactly, large and legible. No other captions, numbers or watermarks.`]
  .filter(Boolean).join('\n\n');
 return {images:refs.images,prompt,size:SIZE,moments:acts.map(a=>a.id)};
}

const MEDALS=['🥇','🥈','🥉'];
// The caption of a picture: its title, then each player: the place, the name as the league knows him (Sports.ru), his
// club, his teams and his FBL points.
const line=(who,l,i,kind)=>`${kind==='hero'?MEDALS[i]||`${i+1}.`:`${i+1}.`} <b>${esc(who(l.a,l.n))}</b>${l.c?` · ${esc(l.c)}`:''}${badges(l.h||[])?' '+badges(l.h):''} — <b>${int(l.p)}</b> ФО`;
const TITLE={hero:'⭐ Герои дня',flop:'💩 Провалы дня'};
// The pictures of a day: heroes, then flops (the day's post's blocks), at most three players each.
export function dayPictures(blocks,who,opts={}){
 return [['hero',blocks.heroes],['flop',blocks.flops]].map(([kind,rows])=>[kind,(rows||[]).slice(0,3)]).filter(([,rows])=>rows.length)
  .map(([kind,rows])=>({kind,players:rows.map(l=>String(l.a)),...blockPicture(kind,rows,opts),
   caption:[`<b>${TITLE[kind]}</b>`,...rows.map((l,i)=>line(who,l,i,kind))].join('\n')}));
}
