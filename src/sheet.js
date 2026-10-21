// A sheet over the page for content that needs the whole screen width — a player's full card opened from a deep panel.
// One <dialog> is reused; it closes with ✕, Esc or a tap on the dimmed backdrop.
let dialog=null;
export function openSheet(title,content){
 if(!dialog){
  dialog=document.createElement('dialog');dialog.className='sheet';document.body.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 }
 const head=document.createElement('div'),h=document.createElement('h3'),close=document.createElement('button'),body=document.createElement('div');
 head.className='sheet-head';h.textContent=title;close.type='button';close.className='icon-btn sheet-close';close.textContent='✕';close.setAttribute('aria-label','Закрыть');close.onclick=()=>dialog.close();
 body.className='sheet-body';body.append(content);head.append(h,close);
 dialog.replaceChildren(head,body);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
}
// A read-only player card, already open, in a sheet.
export function openPlayerSheet(player,card){
 const c=card(player,null,true),d=c.querySelector('details.card-details');if(d)d.open=true;
 openSheet(player.name,c);
}
