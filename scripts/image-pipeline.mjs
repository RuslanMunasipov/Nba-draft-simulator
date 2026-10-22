// The league's picture pipeline, shared by its two bots: the awards bot (awards-bot/images.js: the heroes and the flops of
// the day) and Зак Онн, the league's lawyer (scripts/zak-pictures.mjs: his transfer protocols). A picture is OpenAI's
// Images API in edit mode: a prompt and up to a few reference images (Зак Онн's photo, a GM's photo, a team's logo).
// The references live in scripts/assets/ (see its README): zak-onn/<mood>.jpg, gm/<team number>.<ext>,
// team-logos/<team number>.<ext>, the team number being its place in the draft order (1 to 8, src/teams.js). A missing
// GM photo or logo is simply left out of the picture.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MODEL='gpt-image-2.5-sunburst',QUALITY='low',SIZE='1024x1024';
// USD per million tokens (developers.openai.com/api/docs/pricing, 22.10.2026): the same for gpt-image-2 and both 2.5.
// A reference is billed by its area, a token per 16×16 pixels up to 1521 (measured 22.10.2026): a 256² logo is 256 tokens
// ($0.002), a 512² face 1024 ($0.008), which is why the references go as their small copies (readImage). A low square
// picture is 196 output tokens ($0.006), a medium one 439 ($0.013).
export const PRICE={text:5,image:8,output:30};
export const ASSETS=fileURLToPath(new URL('./assets/',import.meta.url));
const TYPES={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};

// A reference image from disk: {bytes, name, type}; null when there is no such file. Its small copy <name>.ref.<ext>
// (scripts/shrink-references.py) goes instead where there is one, under the original's name.
export function readImage(file){
 if(!file||!fs.existsSync(file))return null;
 const ext=path.extname(file).toLowerCase(),stem=file.slice(0,-ext.length);
 const small=Object.keys(TYPES).map(e=>stem+'.ref'+e).find(f=>fs.existsSync(f));
 return TYPES[ext]?{bytes:fs.readFileSync(small||file),name:path.basename(file),type:TYPES[small?path.extname(small):ext]}:null;
}
// The first file of a base name in any of the image formats.
const find=(dir,base)=>{for(const ext of Object.keys(TYPES)){const f=path.join(dir,base+ext);if(fs.existsSync(f))return f;}return null;};
// team: the league team's index (0 to 7), as everywhere in the code; the files are numbered from 1.
export const zakPhoto=(mood,root=ASSETS)=>readImage(find(path.join(root,'zak-onn'),mood));
// The league's people (assets/people.json): name, role, photo, and what a picture keeps of them (keep, style).
export const PEOPLE=JSON.parse(fs.readFileSync(path.join(ASSETS,'people.json'),'utf8')).people;
export const person=id=>PEOPLE.find(p=>p.id===id)||null;
export const gmOf=team=>PEOPLE.find(p=>p.role==='gm'&&p.team===team)||null;
// A GM's photo: gm/<team number> when the league put one there, else their photo in the people.
export const gmPhoto=(team,root=ASSETS)=>!Number.isInteger(team)?null:
 readImage(find(path.join(root,'gm'),String(team+1)))||(gmOf(team)?readImage(path.join(root,gmOf(team).photo)):null);
// How a prompt describes a person of the people next to their reference: name, what never changes, how they are drawn.
// The face is always theirs; the clothes follow the scene unless keep fixes them.
export const looks=p=>p?`${p.en}; the face exactly as in the photo${p.keep?`; never changes: ${p.keep}`:''}${p.style?`; ${p.style}`:''}${p.outfit?`; usual look, which may change to fit the scene: ${p.outfit}`:''}`:'';
export const teamLogo=(team,root=ASSETS)=>Number.isInteger(team)?readImage(find(path.join(root,'team-logos'),String(team+1))):null;

// The references of a picture in order, with the words a prompt uses for each ("reference image 2"): only the ones that
// exist. refs: [{key, image, what}] → {images, legend, has: key → its words}.
export function references(refs){
 const present=refs.filter(r=>r.image),has={};
 present.forEach((r,i)=>{has[r.key]=`reference image ${i+1}`;});
 const legend=present.length?'REFERENCES: '+present.map((r,i)=>`reference image ${i+1} is ${r.what}`).join('; ')+'.':'';
 return {images:present.map(r=>r.image),legend,has};
}

// What a picture cost, in USD, from the usage the API answers with.
export function cost(usage){
 const d=usage?.input_tokens_details||{},text=d.text_tokens??0,image=d.image_tokens??Math.max(0,(usage?.input_tokens||0)-text);
 return (text*PRICE.text+image*PRICE.image+(usage?.output_tokens||0)*PRICE.output)/1e6;
}

// One picture: the references edited by the prompt (without references, drawn from the prompt alone). Answers the PNG and
// the usage. key: the OpenAI API key (without it the request goes out bare, for a proxy that adds it). A refused prompt,
// a bad key or an empty balance is not tried again. size, quality and background (transparent) override the defaults: a
// holiday frame of the cards is a transparent portrait in medium quality, drawn once for years.
export async function generate({prompt,images=[],size=SIZE,quality=QUALITY,background},{key,fetchImpl=fetch,timeoutMs=180e3,attempts=3}={}){
 const auth=key?{authorization:`Bearer ${key}`}:{},edit=images.length>0;
 let last;
 for(let attempt=0;attempt<attempts;attempt++){
  let body;
  if(edit){
   body=new FormData();
   body.append('model',MODEL);body.append('prompt',prompt);body.append('size',size);body.append('quality',quality);body.append('n','1');
   if(background)body.append('background',background);
   for(const im of images)body.append('image[]',new Blob([im.bytes],{type:im.type||'image/jpeg'}),im.name);
  }else body=JSON.stringify({model:MODEL,prompt,size,quality,n:1,...background?{background,output_format:'png'}:{}});
  try{
   const r=await fetchImpl(`https://api.openai.com/v1/images/${edit?'edits':'generations'}`,{method:'POST',body,
    headers:edit?auth:{...auth,'content-type':'application/json'},signal:AbortSignal.timeout(timeoutMs)});
   const out=await r.json().catch(()=>({}));
   if(r.ok&&out.data?.[0]?.b64_json)return {png:Buffer.from(out.data[0].b64_json,'base64'),usage:out.usage||null};
   last=Error(`OpenAI images: ${r.status} ${out.error?.message||''}`.trim());
   // An answer without a picture (it happens, once in a while) is tried again like a server error.
   if(!r.ok&&r.status!==429&&r.status<500)break;
   if(out.error?.code==='credit_balance_exhausted'||out.error?.type==='insufficient_quota')break;
  }catch(e){last=e;}
  if(attempt<attempts-1)await new Promise(r=>setTimeout(r,5000*(attempt+1)));
 }
 throw last;
}
