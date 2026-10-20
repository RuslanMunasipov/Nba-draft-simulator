import {readStored,writeStored} from './storage.js';
// Dark or light as chosen on this device; until the GM chooses, the theme follows the system setting.
const button=document.getElementById('theme-toggle'),media=matchMedia('(prefers-color-scheme: light)');
const chosen=()=>{const t=readStored('fbl-theme');return t==='light'||t==='dark'?t:null;};
function apply(value){
 document.documentElement.dataset.theme=value;
 document.querySelector('meta[name=theme-color]')?.setAttribute('content',value==='light'?'#f3f6f5':'#0b141d');
 button?.setAttribute('aria-label',value==='light'?'Включить тёмную тему':'Включить светлую тему');
}
apply(chosen()||(media.matches?'light':'dark'));
media.addEventListener?.('change',e=>{if(!chosen())apply(e.matches?'light':'dark');});
if(button)button.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';apply(next);writeStored('fbl-theme',next);};
