// FBL awards bot, the pictures of the game day: Зак Онн, the league's lawyer, drawn by OpenAI's Images API (edit mode,
// his photo as the reference) once for every hero and every flop of the day, sent to the league chat as albums after the
// day's post. Pure, except generate(): the scenes, the prompts, the captions and the price of a picture. The numbers in a
// picture and its caption are the line's FBL points (core.js scores every line with the league's formula, fblFormula).
// The player of the day may show up on a billboard or a poster in the scene (league chat, 22.10.2026).
import {int} from '../src/format.js';
import {esc,badges} from './messages.js';

export const MODEL='gpt-image-2.5-sunburst',QUALITY='medium',SIZE='1024x1024';
// USD per million tokens (developers.openai.com/api/docs/pricing, 22.10.2026): the same for gpt-image-2 and both 2.5.
export const PRICE={text:5,image:8,output:30};
// One picture with one reference photo costs about $0.02 at medium; a second reference adds about $0.008 and is not needed.
export const REFERENCE={hero:'approved',flop:'check'};
const hash=seed=>{let h=0;for(const ch of String(seed))h=(h*31+ch.codePointAt(0))>>>0;return h;};

// Who he is and what he wears: the part every picture keeps, so he is the same man in all of them.
const IDENTITY=`IDENTITY (highest priority): the man is the exact same person as in the reference photo. Preserve his face precisely: face shape, nose, brows, eyes, hairline, greying temples, age, skin tone. He must be instantly recognizable.
WARDROBE (no substitutions): tailored charcoal-grey two-piece suit, fully visible, white dress shirt, plain black tie, and the bright red baseball cap with white embroidered text "God Bless America" spelled exactly. No robe, no gown, no coat over the suit.`;
const STYLE=`STYLE: photorealistic editorial photo, 90s American action-film mood, 35mm lens, cinematic contrast, shallow depth of field. Square composition, waist-up. The only text in the picture: the cap embroidery and the exact words given above in quotes, spelled exactly, large and legible. No other captions, logos or watermarks. He is the only person physically in the scene; the player of the day may appear on a screen, a billboard or a poster.`;
const METAL=['GOLD','SILVER','BRONZE'];

// A scene: his mood and the place, with the player's name (N) and FBL points (P) where the text goes. Heroes: he approves,
// without warmth. Flops: the court, the freezer, the wanted poster, the interrogation room.
const HERO=[
 ({N,P,metal})=>`SCENE: a press room full of exploding camera flashes. He stands at a podium with a US-flag backdrop, holding up a gleaming ${metal} plaque engraved "${N}" on the first line and "${P} FBL" on the second, his other hand giving a firm thumbs-up. Expression: the barely-there satisfied smirk of a man who never smiles, eyes straight into the camera.`,
 ({N,P,metal})=>`SCENE: his detective office at night, neon light slicing through window blinds, a desk lamp, a coffee mug. He slams a big red "APPROVED" rubber stamp onto an open case file; the file's tab reads "${N}", and a ${metal}-bordered sheet on top reads "${P} FBL" in bold. Expression: grudging respect, one eyebrow raised.`,
 ({N,P,metal})=>`SCENE: Times Square at night, rain-slick pavement reflecting the neon, the crowd blurred. He points up at a giant LED billboard with a ${metal} frame showing the player's portrait next to the text "${N}" and below it "${P} FBL", his other hand giving a thumbs-up. Expression: proud for exactly one second, then back to stern.`,
 ({N,P,metal})=>`SCENE: an NBA arena after the final buzzer, ${metal} confetti falling through the spotlights. He holds up a basketball jersey by its shoulders like a trophy; the back of the jersey reads "${N}" in big letters, and the arena scoreboard behind him reads "${P} FBL". Expression: stern nod of approval.`,
];
const FLOP=[
 ({N,P})=>`SCENE: a dramatic wood-panelled American courtroom, warm tungsten light with a cool rim light. He sits behind the elevated judge's bench, leaning forward, slamming a wooden gavel onto the sound block at the moment of impact, splinters of dust in the light; his other hand points accusingly at the viewer. A brass nameplate on the bench reads "PEOPLE v. ${N}" and an open case file in front of him reads "${P} FBL" in red. Expression: furious disapproval, deep frown, contemptuous glare into the camera, as if sentencing the worst player of the night.`,
 ({N,P})=>`SCENE: an industrial cold-storage room, frost on every surface, icy blue light, breath visible in the cold air. He is slamming shut a heavy steel freezer door with one hand; inside, a basketball jersey reading "${N}" is frozen solid in a block of ice, with a frost-covered tag reading "${P} FBL - FROZEN". Expression: cold contempt, jaw clenched.`,
 ({N,P})=>`SCENE: a gritty 90s police precinct at night, flickering fluorescent light, a cork board of case files. He slaps a fresh yellowed "WANTED" poster onto the wall with the flat of his hand; the poster shows the player's black-and-white portrait under big block letters "WANTED", with "${N}" and "${P} FBL" printed below it. Expression: grim, disgusted glare over his shoulder into the camera.`,
 ({N,P})=>`SCENE: an interrogation room lit by a single hanging lamp, a one-way mirror behind him. He slaps a stack of box-score printouts onto the metal table; the top page is headed "${N}" with "${P} FBL" circled in thick red marker. Expression: barely contained fury, leaning over the table toward the viewer.`,
];

// The name as the picture spells it: ESPN's short name in Latin letters ("N. Jokic"), which the model writes reliably.
export const imageName=l=>String(l.n||l.a).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'').trim()||String(l.a);
export const imagePoints=p=>(p<0?'-':'')+Math.abs(Math.round(p));
// The scenes of an album follow each other from a place picked by the day: no two pictures of an album share a scene, and
// a day always gets the same ones.
export function imagePrompt(kind,line,i,day){
 const list=kind==='hero'?HERO:FLOP,scene=list[(hash(`${day}:${kind}`)+i)%list.length];
 return `${IDENTITY}\n\n${scene({N:imageName(line),P:imagePoints(line.p),metal:METAL[i]||METAL[2]})}\n\n${STYLE}`;
}

const MEDALS=['🥇','🥈','🥉'];
// The caption of a picture: the place, the name as the league knows him (Sports.ru), his club, his teams and his FBL points.
const caption=(who,l,i,kind)=>`${kind==='hero'?MEDALS[i]||`${i+1}.`:`${i+1}.`} <b>${esc(who(l.a,l.n))}</b>${l.c?` · ${esc(l.c)}`:''}${badges(l.h||[])?' '+badges(l.h):''} — <b>${int(l.p)}</b> ФО`;
const TITLE={hero:'⭐ Герои дня',flop:'🧊 Провалы дня: Зак Онн выносит приговор'};
// The albums of a day: heroes, then flops (the day's post's blocks). Their title goes on the first picture sent.
export function dayImages(day,blocks,who){
 return [['hero',blocks.heroes],['flop',blocks.flops]].filter(([,rows])=>rows?.length).map(([kind,rows])=>({kind,title:TITLE[kind],
  items:rows.map((l,i)=>({ref:REFERENCE[kind],prompt:imagePrompt(kind,l,i,day),caption:caption(who,l,i,kind)}))}));
}
// A Telegram media group of an album's pictures ({caption, png}): the title above the first caption.
export function mediaGroup(title,pictures,kind){
 return {media:pictures.map((x,i)=>({type:'photo',media:`attach://p${i}`,caption:(i===0?`<b>${title}</b>\n`:'')+x.caption,parse_mode:'HTML'})),
  files:pictures.map((x,i)=>({field:`p${i}`,name:`zak-onn-${kind}-${i+1}.png`,bytes:x.png}))};
}

// What a picture cost, in USD, from the usage the API answers with.
export function cost(usage){
 const d=usage?.input_tokens_details||{},text=d.text_tokens??0,image=d.image_tokens??Math.max(0,(usage?.input_tokens||0)-text);
 return (text*PRICE.text+image*PRICE.image+(usage?.output_tokens||0)*PRICE.output)/1e6;
}

// One picture: the reference photo edited by the prompt. Answers the PNG and the usage. key: the OpenAI API key (without
// it the request goes out bare, for a proxy that adds it).
export async function generate({prompt,photo},{key,fetchImpl=fetch,timeoutMs=180e3}={}){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  const form=new FormData();
  form.append('model',MODEL);form.append('prompt',prompt);form.append('size',SIZE);form.append('quality',QUALITY);form.append('n','1');
  form.append('image[]',new Blob([photo.bytes],{type:'image/jpeg'}),photo.name);
  try{
   const r=await fetchImpl('https://api.openai.com/v1/images/edits',{method:'POST',body:form,headers:key?{authorization:`Bearer ${key}`}:{},
    signal:AbortSignal.timeout(timeoutMs)});
   const body=await r.json().catch(()=>({}));
   if(r.ok&&body.data?.[0]?.b64_json)return {png:Buffer.from(body.data[0].b64_json,'base64'),usage:body.usage||null};
   last=Error(`OpenAI images: ${r.status} ${body.error?.message||''}`.trim());
   // A refused prompt, a bad key or no credits stays so: only rate limits and server errors are tried again.
   if(r.status!==429&&r.status<500)break;
   if(body.error?.code==='credit_balance_exhausted'||body.error?.type==='insufficient_quota')break;
  }catch(e){last=e;}
  await new Promise(r=>setTimeout(r,5000*(attempt+1)));
 }
 throw last;
}
