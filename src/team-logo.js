// The league teams' logos on the site: src/assets/team-logos/<team number>.webp, 96×96 copies of the bots' originals
// (scripts/site-team-logos.py). A badge of fixed size shows the team's emoji until its logo arrives, and keeps it if the
// logo never does, so the layout never moves. Plain text (selects, toasts, confirms) keeps teamName's emoji.
import {LEAGUE_TEAMS,teamName} from './teams.js';
// Literal URLs, so the build copies and fingerprints each file; null for a team whose new logo has not come yet (its
// emoji stays in the badge).
const LOGOS=[new URL('./assets/team-logos/1.webp',import.meta.url),new URL('./assets/team-logos/2.webp',import.meta.url),
 new URL('./assets/team-logos/3.webp',import.meta.url),new URL('./assets/team-logos/4.webp',import.meta.url),
 new URL('./assets/team-logos/5.webp',import.meta.url),new URL('./assets/team-logos/6.webp',import.meta.url),
 new URL('./assets/team-logos/7.webp',import.meta.url),null].map(u=>u?.href??null);
export const teamLogoUrl=t=>LOGOS[t]??null;
// size: 'xs' 18 px (inside chips and small lines), 'sm' 24 px (tables, lists), 'md' 32 px, 'lg' 48 px (a team's page).
export function teamLogo(t,size='sm'){
 const box=document.createElement('span'),url=teamLogoUrl(t);
 box.className='team-logo team-logo--'+size;box.setAttribute('aria-hidden','true');box.textContent=LEAGUE_TEAMS[t]?.symbol||String(t+1);
 if(url){const img=document.createElement('img');img.alt='';img.decoding='async';img.onload=()=>box.classList.add('is-loaded');img.onerror=()=>img.remove();img.src=url;box.append(img);}
 return box;
}
// The logo and the team's name (without the emoji the logo stands for), for a cell, a heading or a chip.
export function teamTag(t,size='sm'){
 const tag=document.createElement('span'),name=document.createElement('span');
 tag.className='team-tag';tag.title=teamName(t);name.className='team-tag-name';name.textContent=LEAGUE_TEAMS[t]?.name||`GM ${t+1}`;
 tag.append(teamLogo(t,size),name);return tag;
}
