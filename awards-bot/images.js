// FBL awards bot, the pictures of the game day (league chat, 22.10.2026): two per day, drawn by the picture pipeline
// (scripts/image-pipeline.mjs) and sent after the day's album. One for the heroes, one for the flops: the block's players
// together in one scene, the first of the block in the centre, each with a moment of his own picked from his stat line (a
// great night is celebrated, a bad one laughed at). Every player wears the kit of the league team that held him at
// tip-off, in the colours of its logo, with that logo on his chest. The moments are written by Claude (below), the
// code's own when he cannot. The awards are the league's, not Зак Онн's: he is the law and stays out of them. The
// numbers in a picture and its caption are the line's FBL points (core.js scores every line with the league's formula,
// fblFormula) and the box score's own counts.
import {int,count} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {references,teamLogo} from '../scripts/image-pipeline.mjs';
import {wordNumbers} from './mike-roffon.js';
import {esc,badges} from './messages.js';
import {MISSED_BRICKS} from './core.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';

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
// A GM's name as the league writes it (src/teams.js): the signs are in Russian.
const gmName=team=>Number.isInteger(team)?LEAGUE_TEAMS[team]?.gm||null:null;

// --- The moments, by the code: the fallback when Claude has not written them (below). In order of priority: the first that fits a player and is not taken yet in the picture is his. when: does
// his line call for it; text: what he does and the words on his sign. The last ones of each list fit anybody.
const tens=s=>[s.pts,s.reb,s.ast,s.stl,s.blk].filter(v=>v>=10).length;
const C=(n,a,b,c)=>count(n,a,b,c).replace(/\s/g,' ').toUpperCase();
const HERO=[
 {id:'triple',when:s=>tens(s)>=3,text:({P})=>`wears a golden crown and holds up a sign reading "ТРИПЛ-ДАБЛ · ${P} ФО", regal and smug`},
 {id:'perfect',when:s=>s.fga>=5&&s.fgm===s.fga,text:({s})=>`sits back in sunglasses, ice-cold, holding a sign reading "БЕЗ ПРОМАХОВ ${s.fgm}/${s.fga}"`},
 {id:'scorer',when:s=>s.pts>=35,text:({P})=>`slouches in a chair in a puffer jacket and orange ski goggles while teammates spray water over him, holding a hand-written sign reading "${P} ФО"`},
 {id:'glass',when:s=>s.reb>=14,text:({s})=>`polishes a backboard with a window squeegee, a sign hanging from the rim reads "${C(s.reb,'подбор','подбора','подборов')}"`},
 {id:'maestro',when:s=>s.ast>=10,text:({s})=>`conducts with a conductor's baton like a maestro, a music stand in front of him reads "${C(s.ast,'передача','передачи','передач')}"`},
 {id:'lockdown',when:s=>s.stl+s.blk>=6,text:()=>`has a heavy chain and padlock over his shoulder, holding a sign reading "КОРЗИНА ЗАКРЫТА"`},
 {id:'thanks',when:(s,x)=>!!x.gm,text:({gm})=>`points at the camera with a grin, holding a hand-written sign reading "СПАСИБО GM ${gm.toUpperCase()} ЗА ДОВЕРИЕ"`},
 {id:'flex',when:()=>true,text:({P})=>`flexes both arms, a gold medal around his neck, holding a sign reading "${P} ФО"`},
 {id:'trophy',when:()=>true,text:({P})=>`kisses a small golden trophy engraved "${P} ФО"`},
];
const FLOP=[
 {id:'bricks',when:s=>s.fga-s.fgm>=MISSED_BRICKS-2,text:({s})=>`sits on a pile of red bricks holding one more brick, a sign stuck in the pile reads "${s.fgm}/${s.fga} С ИГРЫ"`},
 {id:'turnovers',when:s=>s.tov>=5,text:({s})=>`reaches in vain for a handful of basketballs bouncing away from him, a sign at his feet reads "${C(s.tov,'потеря','потери','потерь')}"`},
 {id:'fouls',when:s=>s.pf>=5,text:()=>`is shown the way to the locker room by a referee pointing at the exit, a sign reads "ФОЛАУТ"`},
 {id:'frozen',when:(s,x)=>!!x.ice,text:({P})=>`is frozen solid in a block of ice, a frosty tag on the ice reads "${P} ФО"`},
 {id:'freethrows',when:s=>s.fta-s.ftm>=4,text:({s})=>`stares at a free-throw line with a basketball stuck between the rim and the backboard, a sign reads "${s.ftm}/${s.fta} ШТРАФНЫЕ"`},
 {id:'ghost',when:s=>s.pts<=4,text:({s})=>`is half see-through like a ghost, a sign floating next to him reads "${s.pts} ОЧК. А Я ИГРАЛ?"`},
 {id:'sorry',when:(s,x)=>!!x.gm,text:({gm})=>`holds a hand-written sign reading "ПРОСТИ, GM ${gm.toUpperCase()}", looking guilty`},
 {id:'towel',when:()=>true,text:({P})=>`sits at the end of the bench with a towel over his head, a sign at his feet reads "${P} ФО"`},
 {id:'shrug',when:()=>true,text:({P})=>`shrugs at the camera with a sheepish grin, holding a sign reading "${P} ФО"`},
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
const TITLE_TEXT={hero:'ГЕРОИ ДНЯ FBL',flop:'ПРОВАЛЫ ДНЯ FBL'};
// --- The moments, by Claude (league chat, 22.10.2026): the setting of a picture and each player's scene and sign, written
// through the owner's subscription (scripts/claude-text.mjs, nothing billed per call) as hard, funny basketball banter on
// his line, new every day. The code checks them: plain English scenes, a short Russian sign in capitals, the only numbers
// those of the player's own line, no weapons, violence or other people. What fails twice gives way to the code's moments.
const PLACE_NAMES=['centre','left','right'];
// The facts of a block's picture, the only thing Claude sees: per player his name, club, FBL points (core.js, scored by
// fblFormula), his box score, his fantasy team's GM and his form.
export function momentFacts(kind,rows,{form=new Map()}={}){
 return {picture:kind==='hero'?'the heroes of the day':'the flops of the day',players:rows.slice(0,3).map((l,i)=>{const s=l.s||{},f=form.get(l.a);
  return {place:PLACE_NAMES[i],name:imageName(l),club:l.c||null,fbl:Math.round(l.p),minutes:Math.round(l.m||0),
   game:{pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,fgMissed:s.fga-s.fgm,ftm:s.ftm,fta:s.fta,ftMissed:s.fta-s.ftm,pf:s.pf},
   gm:gmName(pictureTeam(l)),form:f?{heroDaysLast7:f.hero,flopDaysLast7:f.flop,onFire:!!f.fire,frozen:!!f.ice}:null};})};
}
const BANTER=`Ты — мем-редактор FBL (Fantasy Brothers League), фэнтези-баскетбольной лиги друзей. Каждый игровой день лига выкладывает две фотореалистичные мем-картинки: героев дня (их превозносят до небес) и провалы дня (их разносят в щепки). Ты придумываешь одну из них: где всё происходит и что делает каждый игрок. Картинку рисует ChatGPT по твоему описанию.
Тон — жёсткий баскетбольный стёб, трэш-ток и мемы НБА: Shaqtin' a Fool, Inside the NBA, «кирпичный завод», «ледяные вены», «готовит», «отъехал», «MVP-чанты», «пенсионер», «строитель». Это должно быть по-настоящему смешно: неожиданный поворот, абсурд, гипербола, точное попадание в его статлайн. Разноси игру без жалости: промахи, потери, фолы, ноль в графе, «призрака» на площадке; героев возноси до абсурда.
Каждому игроку — своя идея из того, что торчит в его линии (очки, промахи, потери, фолы, подборы, передачи, перехваты и блоки, идеальный вечер, форма), не как у соседей и не как в недавних идеях из списка. Каждый день новое место и новый реквизит: стройка, кулинарное шоу, музей, ток-шоу, ломбард, автомойка, парад, прогноз погоды, реклама, свадьба, автосалон, аукцион — придумывай своё.
Границы:
- Стебём игру, а не человека: ничего про внешность, тело, расу, происхождение, семью, здоровье и личную жизнь.
- Никакого оружия, стрельбы, насилия, крови, смерти, наркотиков и секса. Никаких судов, судей и юристов: закон лиги в награды не лезет.
- На картинке только эти игроки и безликая массовка; GM его фэнтези-команды (gm из данных) можно упомянуть на табличке, но не показывать. Никаких логотипов клубов и лиг НБА.
- Форму не описывай: картинка сама оденет его в форму фэнтези-команды. Позы, реквизит и аксессуары приветствуются.
Формат:
- setting: одно предложение по-английски, место и настроение всей картинки, без цифр и без надписей.
- scene: одно предложение по-английски, начинается с глагола: что игрок делает, поза, реквизит и где его табличка (в руках, на плакате, на футболке, на торте, на табло...). Без цифр.
- sign: надпись таблички ПО-РУССКИ ЗАГЛАВНЫМИ, не больше 6 слов, коротко и смешно. Числа в ней — только его собственные из данных: ФО как «N ФО» (с минусом, если отрицательные) или счётчики бокс-скора вроде «7/21 С ИГРЫ» или «6 ПОТЕРЬ». Числа словами тоже считаются числами.
- Игроки идут в порядке данных: центр (звезда картинки), слева, справа.
Ответь только JSON: {"setting": "...", "players": [{"scene": "...", "sign": "..."}, ...]}`;
const str={type:'string'};
export const MOMENTS_SCHEMA={type:'object',additionalProperties:false,required:['setting','players'],properties:{setting:str,
 players:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,required:['scene','sign'],properties:{scene:str,sign:str}}}}};
export function momentMessages(facts,recent=[]){
 return {system:BANTER,prompt:`Картинка: ${facts.picture}.${recent.length?`\nНедавние идеи, не повторяй:\n${recent.slice(-30).map(x=>`- ${x}`).join('\n')}`:''}\nДанные:\n${JSON.stringify(facts.players,null,1)}`};
}
const FORBIDDEN=/\b(guns?|rifles?|pistols?|weapons?|bullets?|knife|knives|blood\w*|kill\w*|corpses?|dead|death|suicide|drugs?|cocaine|naked|sex\w*|zak|onn|lawyer|courtroom|judge)\b|оружи|пистолет|автомат|стрельб|застрел|кров[ьи]|убий|убил|смерт|труп|наркот|суицид|зак онн|юрист|адвокат|суд[ья]/i;
// Every number a player's sign may carry: his FBL points and his box score's counts.
const numbersOf=p=>new Set([p.fbl,p.minutes,...Object.values(p.game)].filter(Number.isFinite).map(v=>String(Math.abs(v))));
// What is wrong with Claude's moments for these facts ([]: they may go into the picture).
export function momentProblems(x,facts){
 const out=[],ascii=t=>/^[\x20-\x7e]*$/.test(t);
 if(!x||typeof x.setting!=='string'||!Array.isArray(x.players))return ['not moments'];
 if(x.players.length!==facts.players.length)out.push(`${x.players.length} players, not ${facts.players.length}`);
 if(!x.setting.trim()||x.setting.length>260||!ascii(x.setting)||/\d/.test(x.setting))out.push('setting: one plain sentence without numbers');
 x.players.slice(0,facts.players.length).forEach((m,i)=>{const p=facts.players[i],who=p.name;
  if(typeof m?.scene!=='string'||typeof m?.sign!=='string'){out.push(`${who}: no scene or sign`);return;}
  if(!m.scene.trim()||m.scene.length>320||!ascii(m.scene)||/\d/.test(m.scene))out.push(`${who}: scene, one plain sentence without numbers`);
  if(!/^[А-ЯЁA-Z0-9 .,!?'"«»\/&:#+\-–—()]{2,48}$/.test(m.sign.trim())||m.sign.trim().split(/\s+/).length>6)out.push(`${who}: sign "${m.sign}", at most 6 words in capitals`);
  const allowed=numbersOf(p),stray=[...(m.sign.match(/\d+/g)||[]),...wordNumbers(m.sign)].filter(n=>!allowed.has(n));
  if(stray.length)out.push(`${who}: numbers not in his line (${stray.join(', ')})`);
 });
 const text=[x.setting,...x.players.flatMap(m=>[m?.scene,m?.sign])].join(' ');
 if(FORBIDDEN.test(text))out.push(`forbidden: ${text.match(FORBIDDEN)[0]}`);
 return out;
}
// Claude's moments for a block (two tries), or null: then the code's. recent: the ideas of the last days.
export async function writeMoments(facts,{recent=[],claude=claudeJSON,model=CLAUDE_MODEL,timeoutMs=120e3}={}){
 for(let i=0;i<2;i++){
  const {data}=await claude({...momentMessages(facts,recent),schema:MOMENTS_SCHEMA,model,timeoutMs});
  const problems=momentProblems(data,facts);
  if(!problems.length)return {setting:data.setting.trim(),players:data.players.slice(0,facts.players.length).map(m=>({scene:m.scene.trim().replace(/\.$/,''),sign:m.sign.trim()}))};
  console.warn(`Pictures: Claude's moments refused (${problems.join('; ')})${i?'; the code\'s go instead':', written again'}.`);
 }
 return null;
}
// The ideas of a picture to keep, so that the next days do not repeat them.
export const ideasOf=w=>w?[w.setting,...w.players.map(p=>`${p.scene} / ${p.sign}`)]:[];

// One picture of a block: its references (each player's face when given, each league team's logo once) and its prompt.
// faces: ESPN id → the headshot ({bytes, name, type}); root: the assets folder (team logos); written: Claude's moments
// (writeMoments), else the code's.
export function blockPicture(kind,rows,{faces=new Map(),form,root,written=null}={}){
 rows=rows.slice(0,3);
 const teams=[...new Set(rows.map(pictureTeam).filter(t=>t!==null))];
 const refs=references([...rows.map(l=>({key:'face:'+l.a,image:faces.get(String(l.a))||null,what:`the face of ${imageName(l)}`})),
  ...teams.map(t=>({key:'logo:'+t,image:teamLogo(t,root),what:`the logo of the fantasy team of ${rows.filter(l=>pictureTeam(l)===t).map(imageName).join(' and ')}`}))]);
 const acts=written?written.players.map(m=>({id:'claude',text:`${m.scene.replace(/^./,c=>c.toLowerCase())}; the words on his sign read "${m.sign}"`}))
  :moments(kind,rows,form);
 const people=rows.map((l,i)=>{const t=pictureTeam(l),face=refs.has['face:'+l.a],logo=refs.has['logo:'+t];
  return `${PLACES[i]}: the real NBA player ${imageName(l)}${l.c?` of the ${l.c}`:''}, ${face?`his face exactly as in ${face}, `:''}exactly as he really looks. `
   +`He wears a basketball uniform ${t!==null?KITS[t]:'in black and gold'}${logo?`, with the logo from ${logo} on the chest, reproduced exactly`:''} (the colours of his fantasy team, not his NBA team). `
   +`He ${acts[i].text}.`;});
 const order=rows.length>1?` The ${rows.length} players are side by side, each with his own moment, the one in the centre the star of the picture.`:'';
 const prompt=[refs.legend,`SCENE: ${written?written.setting.replace(/\.$/,''):SCENE[kind]}.${order} A banner above them reads "${TITLE_TEXT[kind]}".`,...people,
  `STYLE: photorealistic sports-photo, cinematic arena lighting, 35mm lens, the savage humour of a viral basketball meme. Landscape composition, every face clearly visible. The only text in the picture: the exact words given in quotes, in Russian (Cyrillic), spelled exactly letter by letter, large and legible. No other captions, numbers or watermarks.`]
  .filter(Boolean).join('\n\n');
 return {images:refs.images,prompt,size:SIZE,moments:acts.map(a=>a.id),ideas:ideasOf(written)};
}

const MEDALS=['🥇','🥈','🥉'];
// The caption of a picture: its title, then each player: the place, the name as the league knows him (Sports.ru), his
// club, his teams and his FBL points.
const line=(who,l,i,kind)=>`${kind==='hero'?MEDALS[i]||`${i+1}.`:`${i+1}.`} <b>${esc(who(l.a,l.n))}</b>${l.c?` · ${esc(l.c)}`:''}${badges(l.h||[])?' '+badges(l.h):''} — <b>${int(l.p)}</b> ФО`;
const TITLE={hero:'⭐ Герои дня',flop:'💩 Провалы дня'};
// The pictures of a day: heroes, then flops (the day's post's blocks), at most three players each. written: Claude's
// moments of each kind ({hero, flop}), where he wrote them.
export function dayPictures(blocks,who,{written={},...opts}={}){
 return [['hero',blocks.heroes],['flop',blocks.flops]].map(([kind,rows])=>[kind,(rows||[]).slice(0,3)]).filter(([,rows])=>rows.length)
  .map(([kind,rows])=>({kind,players:rows.map(l=>String(l.a)),...blockPicture(kind,rows,{...opts,written:written[kind]||null}),
   caption:[`<b>${TITLE[kind]}</b>`,...rows.map((l,i)=>line(who,l,i,kind))].join('\n')}));
}
