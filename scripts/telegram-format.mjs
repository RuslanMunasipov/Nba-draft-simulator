// Telegram HTML formatting for the FBL notifier: the decision on top in bold, the reasoning in a collapsed quote.
export const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const signed=n=>(n>=0?'+':'−')+Math.abs(Math.round(n));
export const gains=(season,month)=>`${signed(season)} ФО за сезон · ${signed(month)} за 4 нед.`;
// Numbered one-for-one swaps and the bank after them.
export const moveLines=(pairs,bankAfter)=>[...pairs.map((x,i)=>`${i+1}. ${esc(x.out)} → <b>${esc(x.in)}</b>`),`Банк после: ${bankAfter}`];
// Details stay one tap away: Telegram shows the first lines of an expandable quote and hides the rest.
export const details=lines=>lines.length?`<blockquote expandable>${lines.join('\n')}</blockquote>`:'';
export const message=(...blocks)=>blocks.flat().filter(x=>x!==null&&x!==undefined).join('\n');
export const plainText=html=>html.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
// Moscow date and time (UTC+3 all year) of an instant, e.g. "19.10.2026, 14:32 МСК".
export function moscow(at=new Date()){
 const d=new Date(new Date(at).getTime()+3*3600e3),two=n=>String(n).padStart(2,'0');
 return `${two(d.getUTCDate())}.${two(d.getUTCMonth()+1)}.${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} МСК`;
}
// Sending to one bot and chat. Without both the message is only printed and send() answers false. Every message ends
// with the Moscow time it was sent.
export function sender(token,chat){
 const configured=Boolean(token&&chat);
 // One Telegram call: waits out 429 rate limits (retry_after) and retries server errors a few times.
 async function post(body){
  for(let attempt=0;;attempt++){
   const res=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,disable_web_page_preview:true,...body})});
   if(res.ok||res.status===400||attempt>=4||(res.status!==429&&res.status<500))return res;
   const wait=res.status===429?((await res.json().catch(()=>({})))?.parameters?.retry_after||5):2**attempt;
   await new Promise(r=>setTimeout(r,wait*1000));
  }
 }
 // Telegram refuses messages over 4096 characters: a long one is cut at a line and says so.
 const fit=text=>text.length<=4000?text:text.slice(0,text.lastIndexOf('\n',3900))+'\n…';
 async function send(text){
  text=fit(text)+`\n\n<i>🕒 Отправлено: ${moscow()}</i>`;console.log('\n'+text+'\n');
  if(!configured){console.log('Telegram secrets not set: message not sent.');return false;}
  const res=await post({text,parse_mode:'HTML'});
  // Rejected markup must not lose the message: resend the same words as plain text.
  if(res.status===400){const plain=await post({text:plainText(text)});
   if(!plain.ok)throw Error('Telegram: '+plain.status+' '+await plain.text());console.log('sent to Telegram as plain text');return true;}
  if(!res.ok)throw Error('Telegram: '+res.status+' '+await res.text());
  console.log('sent to Telegram');return true;
 }
 return {configured,send};
}
