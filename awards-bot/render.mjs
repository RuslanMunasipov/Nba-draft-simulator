// FBL awards bot, the cards drawn: cards.js writes them as HTML, Chromium (Playwright's) takes each as a 1080×1350 PNG.
// Everything a card shows is embedded before it is drawn: the fonts (assets/fonts, OFL), the players' ESPN headshots,
// the team logos (scripts/assets/team-logos), the holiday frames (assets/holidays) and the emoji (Twemoji), so a card
// never depends on a page load.
// A headshot or an emoji that cannot be fetched is drawn without it (initials, the plain character).
import fs from 'node:fs';
import {chromium} from '@playwright/test';
import {WIDTH,HEIGHT,CARD_EMOJI} from './cards.js';
import {teamLogo} from '../scripts/image-pipeline.mjs';

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
  emoji:e=>emoji.has(e)?`<img class="emo" src="${emoji.get(e)}">`:`<span class="emo">${e}</span>`};
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
   out.push(await page.screenshot({type:'png',clip:{x:0,y:0,width:WIDTH,height:HEIGHT}}));
  }
 }finally{await browser.close();}
 return out;
}
