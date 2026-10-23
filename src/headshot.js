// ESPN's small headshot next to a player's name: ESPN's own image service (a.espncdn.com, open to any page) scales the
// headshot to 96×70, about 8 KB, and the page crops it to a circle. The circle has its size before the picture arrives
// and shows the player's initials until it does, so a slow, missing (a new rookie, a player without an ESPN id) or
// blocked picture changes nothing in the layout.
export const HEADSHOT_URL=id=>`https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=96&h=70&scale=crop`;
// The pictures ESPN does not have are asked once per page, not on every redraw (the season tab redraws every 20 s in a game).
const missing=new Set();
// A player of the database (espnId, or an id "espn:<n>" for one without an NBA id), or an awards row's ESPN id.
export function espnIdOf(p){
 const id=p?.espnId??/^espn:(\d+)$/.exec(String(p?.id??''))?.[1];
 return id!=null&&/^\d+$/.test(String(id))?String(id):null;
}
// "Shai Gilgeous-Alexander" → "SG", "Kenyon Martin Jr." → "KM": the first letters of the first and the last name.
export function initials(name){
 const words=String(name||'').replace(/[.,]/g,' ').split(/\s+/).filter(w=>w&&!/^(jr|sr|ii|iii|iv|v)$/i.test(w));
 return [words[0],words.length>1?words.at(-1):null].filter(Boolean).map(w=>[...w].find(c=>/\p{L}/u.test(c))||'').join('').toUpperCase();
}
// size: 'sm' 28 px (lists), 'md' 40 px (cards, award rows), 'lg' 56 px (the plan's pick). Decorative: the name is beside it.
export function face(p,size='sm'){
 const box=document.createElement('span'),id=espnIdOf(p);
 box.className='face face--'+size;box.setAttribute('aria-hidden','true');box.textContent=initials(p?.name);
 if(id&&!missing.has(id)){
  const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.onload=()=>box.classList.add('is-loaded');img.onerror=()=>{missing.add(id);img.remove();};
  img.src=HEADSHOT_URL(id);box.append(img);
 }
 return box;
}
// The face before a block of name lines, in one row: the block keeps its own layout and takes the room left.
export function withFace(p,block,size='sm',cls=''){
 const row=document.createElement('div');row.className='with-face'+(cls?' '+cls:'');row.append(face(p,size),block);return row;
}
