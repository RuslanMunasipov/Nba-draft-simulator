// FBL awards bot, the pictures of the game day (league chat, 22.10.2026): two per day, drawn by the picture pipeline
// (scripts/image-pipeline.mjs) and sent after the day's album. One for the heroes, one for the flops: the block's players
// together in one scene, the first of the block in the centre, each with a moment of his own picked from his stat line (a
// great night is celebrated, a bad one laughed at). Every player wears the kit of the league team that held him at
// tip-off, in the colours of its logo, with that logo on his chest. Claude writes each picture's prompt whole (owner,
// 23.10.2026, scripts/picture-prompt.mjs); the code gives him the players' lines and the references (their faces, their
// teams' logos, the GM of the star) and checks what he wrote; a picture he cannot write is not drawn. The awards are the
// league's, not Зак Онн's: he is the law and stays out of them. The numbers in a picture and its caption are the line's
// FBL points (core.js scores every line with the league's formula, fblFormula) and the box score's own counts.
import {int} from '../src/format.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {wordNumbers} from './mike-roffon.js';
import {esc,badges} from './messages.js';
import {claudeJSON,CLAUDE_MODEL} from '../scripts/claude-text.mjs';
import {cast,playerRef,logoRef,gmRef,promptProblems,writePicture,picture,CRAFT} from '../scripts/picture-prompt.mjs';

export const SIZE='1024x1024';
// The name as the picture spells it: ESPN's short name in Latin letters ("N. Jokic"), which the model writes reliably.
export const imageName=l=>String(l.n||l.a).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'').trim()||String(l.a);
// The team a picture is about: the first that held him at tip-off (a shared player scores for his first holder).
export const pictureTeam=l=>Number.isInteger(l.h?.[0])?l.h[0]:null;
// A GM's name as the league writes it (src/teams.js): the signs are in Russian.
const gmName=team=>Number.isInteger(team)?LEAGUE_TEAMS[team]?.gm||null:null;

// --- The picture of a block, written by Claude (league chat, 22.10.2026) through the owner's subscription
// (scripts/claude-text.mjs, nothing billed per call): hard, funny basketball banter on the players' lines, new every day.
const PLACE_NAMES=['centre','left','right'];
// The facts of a block's picture, the only thing Claude sees besides the references: per player his place, name, club,
// FBL points (core.js, scored by fblFormula), his box score, his fantasy team's GM and kit, his form.
export function momentFacts(kind,rows,{form=new Map()}={}){
 return {picture:kind==='hero'?'the heroes of the day':'the flops of the day',players:rows.slice(0,3).map((l,i)=>{const s=l.s||{},f=form.get(l.a);
  return {place:PLACE_NAMES[i],name:imageName(l),club:l.c||null,fbl:Math.round(l.p),minutes:Math.round(l.m||0),
   game:{pts:s.pts,reb:s.reb,ast:s.ast,stl:s.stl,blk:s.blk,tov:s.tov,fgm:s.fgm,fga:s.fga,fgMissed:s.fga-s.fgm,ftm:s.ftm,fta:s.fta,ftMissed:s.fta-s.ftm,pf:s.pf},
   gm:gmName(pictureTeam(l)),kitColors:pictureTeam(l)!==null?LEAGUE_TEAMS[pictureTeam(l)]?.kit||null:null,
   form:f?{heroDaysLast7:f.hero,flopDaysLast7:f.flop,onFire:!!f.fire,frozen:!!f.ice}:null};})};
}
// The references of a block's picture: each player's face (when ESPN has it), each league team's logo once, the GM who
// picked the star (when the league has his photo).
export function blockCast(kind,rows,{faces=new Map(),root}={}){
 rows=rows.slice(0,3);
 const teams=[...new Set(rows.map(pictureTeam).filter(t=>t!==null))],star=pictureTeam(rows[0]);
 return cast([...rows.map((l,i)=>playerRef(faces.get(String(l.a))||null,imageName(l),{place:PLACE_NAMES[i]})),
  ...teams.map(t=>logoRef(t,root,{is:`the logo of the fantasy team of ${rows.filter(l=>pictureTeam(l)===t).map(imageName).join(' and ')}`})),
  star!==null?gmRef(star,root,{is:`the photo of the general manager (GM) who picked ${imageName(rows[0])}`,need:false}):null]);
}
const BANTER=`Ты — мем-редактор FBL (Fantasy Brothers League), фэнтези-баскетбольной лиги друзей. Каждый игровой день лига выкладывает две фотореалистичные мем-картинки: героев дня (их превозносят до небес) и провалы дня (их разносят в щепки). Ты придумываешь одну из них целиком и пишешь её промпт для ChatGPT.
Тон — жёсткий баскетбольный стёб, трэш-ток и мемы НБА: Shaqtin' a Fool, Inside the NBA, «кирпичный завод», «ледяные вены», «готовит», «отъехал», «MVP-чанты», «пенсионер», «строитель». Это должно быть по-настоящему смешно: неожиданный поворот, абсурд, гипербола, точное попадание в его статлайн. Разноси игру без жалости: промахи, потери, фолы, ноль в графе, «призрака» на площадке; героев возноси до абсурда.
Игроки не обязаны играть в одну историю: у каждого может быть свой нарратив и своя мини-сцена в одном кадре (зоны одного места, витрины, сцены одного шоу). Каждому игроку — своя идея из того, что торчит в его линии (очки, промахи, потери, фолы, подборы, передачи, перехваты и блоки, идеальный вечер, форма), не как у соседей и не как в недавних идеях из списка. Каждый день новое место и новый реквизит: стройка, кулинарное шоу, музей, ток-шоу, ломбард, автомойка, парад, прогноз погоды, реклама, свадьба, автосалон, аукцион — придумывай своё.
Что должно быть на картинке:
- Все игроки данных, звезда — первый (place centre), крупнее и впереди; лицо каждого — точь-в-точь с его референса, если он есть, иначе реальный игрок НБА, как он выглядит на самом деле.
- Каждый игрок — в форме цветов своей фэнтези-команды (kitColors) с её логотипом с референса на груди, не в форме своего клуба НБА; никаких логотипов клубов и лиг НБА.
- У каждого игрока табличка с надписью ПО-РУССКИ ЗАГЛАВНЫМИ в кавычках, не больше 6 слов; числа в ней — только его собственные из данных (ФО как «N ФО» или счётчики бокс-скора вроде «7/21 С ИГРЫ»). Надписи модель должна вывести кириллицей буква в букву — так и напиши. Баннер «ГЕРОИ ДНЯ FBL» или «ПРОВАЛЫ ДНЯ FBL» — по желанию.
- GM, который выбрал звезду, — если его фото есть в референсах: на заднем плане, меньше игроков, радуется героям или в отчаянии от провала. Его имя можно написать только на табличке.
Границы:
- Стебём игру, а не человека: ничего про внешность, тело, расу, происхождение, семью, здоровье и личную жизнь.
- Никакого оружия, стрельбы в людей, насилия, крови, смерти, наркотиков и секса. Никаких судов, судей и юристов: закон лиги в награды не лезет.
- На картинке только эти игроки, GM звезды и безликая массовка.

${CRAFT}`;
export function momentMessages(facts,recent=[]){
 return `Картинка: ${facts.picture}.${recent.length?`\nНедавние идеи, не повторяй:\n${recent.slice(-30).map(x=>`- ${x}`).join('\n')}`:''}\nДанные:\n${JSON.stringify(facts.players,null,1)}`;
}
const FORBIDDEN=/\b(guns?|rifles?|pistols?|weapons?|bullets?|knife|knives|blood\w*|kill\w*|corpses?|death|suicide|drugs?|cocaine|naked|sex\w*|zak|onn|lawyer|courtroom|judge)\b|оружи|пистолет|автомат|стрельб|застрел|кров[ьи]|убий|убил|смерт|труп|наркот|суицид|зак онн|юрист|адвокат|суд[ья]/i;
// Every number a player's sign may carry: his FBL points and his box score's counts.
const numbersOf=p=>new Set([p.fbl,p.minutes,...Object.values(p.game)].filter(Number.isFinite).map(v=>String(Math.abs(v))));
// What is wrong with Claude's prompt for these facts and references ([]: it may go to the image model): the players'
// faces all in it, the numbers in quotes the players' own (in digits or in words), nothing forbidden.
export function momentProblems(text,facts,c){
 const numbers=new Set(facts.players.flatMap(p=>[...numbersOf(p)]));
 const out=promptProblems(text,c,{numbers});
 if(typeof text!=='string')return out;
 const signs=(text.match(/"[^"\n]*"/g)||[]).join(' '),strayW=wordNumbers(signs).filter(v=>!numbers.has(v));
 if(strayW.length)out.push(`numbers in words not in the lines: ${strayW.join(', ')}`);
 if(FORBIDDEN.test(text))out.push(`forbidden: ${text.match(FORBIDDEN)[0]}`);
 return out;
}
// Claude's picture of a block ({images, prompt, idea}), or null: then none is drawn. recent: the ideas of the last days.
export async function writeMoments(facts,c,{recent=[],claude=claudeJSON,model=CLAUDE_MODEL,timeoutMs=180e3}={}){
 return writePicture({system:BANTER,brief:momentMessages(facts,recent),c,check:t=>momentProblems(t,facts,c),write:claude,model,timeoutMs,label:`Pictures, ${facts.picture}`});
}
// A prompt given by hand (a preview's --moments), checked like Claude's: {images, prompt, idea}, or null.
export function givenMoments(x,facts,c){
 const problems=momentProblems(x?.prompt,facts,c);
 if(problems.length){console.warn(`--moments ${facts.picture}: ${problems.join('; ')}`);return null;}
 return {...picture(x.prompt,c),idea:String(x.idea||'').trim()};
}

const MEDALS=['🥇','🥈','🥉'];
// The caption of a picture: its title, then each player: the place, the name as the league knows him (Sports.ru), his
// club, his teams and his FBL points.
const line=(who,l,i,kind)=>`${kind==='hero'?MEDALS[i]||`${i+1}.`:`${i+1}.`} <b>${esc(who(l.a,l.n))}</b>${l.c?` · ${esc(l.c)}`:''}${badges(l.h||[])?' '+badges(l.h):''} — <b>${int(l.p)}</b> ФО`;
const TITLE={hero:'⭐ Герои дня',flop:'💩 Провалы дня'};
// The pictures of a day: heroes, then flops (the day's post's blocks), at most three players each, the ones Claude wrote
// (written: {hero, flop}, each {images, prompt, idea}).
export function dayPictures(blocks,who,{written={}}={}){
 return [['hero',blocks.heroes],['flop',blocks.flops]].map(([kind,rows])=>[kind,(rows||[]).slice(0,3)]).filter(([kind,rows])=>rows.length&&written[kind])
  .map(([kind,rows])=>({kind,players:rows.map(l=>String(l.a)),images:written[kind].images,prompt:written[kind].prompt,size:SIZE,ideas:written[kind].idea?[written[kind].idea]:[],
   caption:[`<b>${TITLE[kind]}</b>`,...rows.map((l,i)=>line(who,l,i,kind))].join('\n')}));
}
