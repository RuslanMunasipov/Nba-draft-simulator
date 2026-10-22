// FBL awards bot, the cards drawn: cards.js writes them as HTML, Chromium (Playwright's) takes each as a 1080×1350 PNG.
// Everything a card shows is embedded before it is drawn: the fonts (assets/fonts, OFL), the players' ESPN headshots,
// the team logos (scripts/assets/team-logos), the holiday frames (assets/holidays), the league's holiday layers
// (design/holidays) and the emoji (Twemoji), so a card never depends on a page load.
// A headshot or an emoji that cannot be fetched is drawn without it (initials, the plain character).
import fs from 'node:fs';
import {chromium} from '@playwright/test';
import {WIDTH,HEIGHT,CARD_EMOJI} from './cards.js';
import {teamLogo} from '../scripts/image-pipeline.mjs';

const TYPE={png:'image/png',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg'};
const dataUri=(bytes,type)=>`data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const font=f=>dataUri(fs.readFileSync(new URL(`./assets/fonts/${f}`,import.meta.url)),'font/ttf');
export const FONTS={get manrope(){return font('Manrope.ttf');},get oswald(){return font('Oswald.ttf');}};
async function fetchBytes(url){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(15e3)});if(!r.ok)return null;return {bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||''};}
 catch{return null;}
}
// Twemoji's file name of an emoji: its code points in hex, without the variation selector unless it joins a sequence.
export const twemojiName=e=>{const cps=[...e].map(c=>c.codePointAt(0));return (cps.includes(0x200d)?cps:cps.filter(c=>c!==0xfe0f)).map(c=>c.toString(16)).join('-');};
const TWEMOJI='https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';
const HEADSHOT=a=>`https://a.espncdn.com/i/headshots/nba/players/full/${a}.png`;
// The same headshot made small by ESPN's own resizer: 384×279 is about 420 input tokens of a picture, the full 600×436
// about 1020 (OpenAI bills a reference by its area, image-pipeline.mjs).
const SMALL_HEADSHOT=a=>`https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${a}.png&w=384&h=279&scale=crop`;

// A player's ESPN headshot as a reference image for the picture pipeline ({bytes, name, type}), the small one when ESPN
// answers it; null when it cannot be had.
export async function headshot(a){
 const ok=x=>x&&/image/.test(x.type);
 let x=await fetchBytes(SMALL_HEADSHOT(a));if(!ok(x))x=await fetchBytes(HEADSHOT(a));
 return ok(x)?{bytes:x.bytes,name:`${a}.png`,type:'image/png'}:null;
}

// The league's art of a holiday (design/, see its README), read once when a card asks for it; null where there is none.
// A holiday's layers (design/holidays/<key>-<part>, made in ChatGPT): bg, the background of every card of the holiday,
// before any other; emblem and title-day/-week/-month, the opener's emblem and title instead of the drawn ones. Without
// a bg layer: design/backgrounds, else the background holiday-frames.mjs drew. The league's logo (Fantasy Brothers
// League): the crowned ball at the heart of every opener, dressed for a holiday when design/logos has that holiday's.
const DESIGN=new URL('../design/',import.meta.url),HOLIDAYS_DIR=new URL('./assets/holidays/',import.meta.url);
export function holidayArt(design=DESIGN,drawn=HOLIDAYS_DIR){
 const league=new URL('./assets/fbl-logo.png',import.meta.url),plain=fs.existsSync(league)?dataUri(fs.readFileSync(league),'image/png'):null;
 const art=new Map(),find=(kind,name,fallback)=>{const k=kind+'/'+name;
  if(!art.has(k)){const f=[...['png','webp','jpg','jpeg','PNG','WEBP','JPG','JPEG'].map(e=>new URL(`${kind}/${name}.${e}`,design)),...fallback?[fallback]:[]].find(u=>fs.existsSync(u));
   art.set(k,f?dataUri(fs.readFileSync(f),TYPE[f.pathname.split('.').pop().toLowerCase()]):null);}
  return art.get(k);};
 const layer=(key,part)=>key?find('holidays',`${key}-${part}`):null;
 return {leagueLogo:key=>key&&find('logos',key)||plain,
  background:key=>key?layer(key,'bg')||find('backgrounds',key,new URL(`${key}-bg.webp`,drawn)):null,
  emblem:key=>layer(key,'emblem'),title:(key,nom)=>layer(key,`title-${nom}`)};
}

// What the cards show, fetched once: the headshots of the given ESPN ids and every emoji a card may use.
export async function loadLook(athletes,{root}={}){
 const photos=new Map(),emoji=new Map();
 await Promise.all([...new Set(athletes.map(String))].map(async a=>{const x=await fetchBytes(HEADSHOT(a));if(x&&/image/.test(x.type))photos.set(a,dataUri(x.bytes,'image/png'));}));
 await Promise.all(CARD_EMOJI.map(async e=>{const x=await fetchBytes(TWEMOJI+twemojiName(e)+'.svg');if(x)emoji.set(e,dataUri(x.bytes,'image/svg+xml'));}));
 const logos=new Map();
 for(let t=0;t<8;t++){const l=teamLogo(t,root);if(l)logos.set(t,dataUri(l.bytes,l.type));}
 // The holiday frames (holiday-frames.mjs), read when a card asks for one.
 const frames=new Map(),frame=key=>{
  if(!frames.has(key)){const f=new URL(`./assets/holidays/${key}.webp`,import.meta.url);frames.set(key,fs.existsSync(f)?dataUri(fs.readFileSync(f),'image/webp'):null);}
  return frames.get(key);};
 return {photo:a=>photos.get(String(a))||null,logo:t=>logos.get(t)||null,frame,
  ...holidayArt(),
  emoji:e=>emoji.has(e)?`<img class="emo" src="${emoji.get(e)}">`:`<span class="emo">${e}</span>`};
}

// A layer drawn in ChatGPT comes on a square or a 3:2 canvas with empty transparent margins: the images marked .trim are
// cut to what they draw, so the emblem and the title fill the place the opener gives them. Runs in the page.
async function trim(){
 for(const img of document.querySelectorAll('img.trim')){
  await img.decode().catch(()=>{});
  const w=img.naturalWidth,h=img.naturalHeight;if(!w||!h)continue;
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(img,0,0);
  const a=g.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[(y*w+x)*4+3]>12){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<0||(x0===0&&y0===0&&x1===w-1&&y1===h-1))continue;
  const out=document.createElement('canvas');out.width=x1-x0+1;out.height=y1-y0+1;
  out.getContext('2d').drawImage(c,x0,y0,out.width,out.height,0,0,out.width,out.height);
  img.src=out.toDataURL('image/png');await img.decode().catch(()=>{});
 }
}

// Every card as a PNG, in order. One browser for the lot.
export async function renderCards(htmls){
 // CHROMIUM_PATH: a Chromium of its own (one Playwright did not install); otherwise Playwright's.
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),out=[];
 try{
  const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1});
  for(const html of htmls){
   await page.setContent(html,{waitUntil:'load'});
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(trim);
   out.push(await page.screenshot({type:'png',clip:{x:0,y:0,width:WIDTH,height:HEIGHT}}));
  }
 }finally{await browser.close();}
 return out;
}
