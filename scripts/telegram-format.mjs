// Telegram HTML formatting for the FBL notifier: the decision on top in bold, the reasoning in a collapsed quote.
import fs from 'node:fs';
import path from 'node:path';
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
// The Actions log is public: Telegram usernames in a printed message are masked (they are kept only encrypted).
export const hideHandles=text=>String(text).replace(/@[A-Za-z][A-Za-z0-9_]{3,31}/g,'@•••');
// Telegram's limit on a photo caption, counted on the visible text.
export const CAPTION_LIMIT=1024;
// Telegram refuses messages over 4096 characters: a long one is cut at a line and says so.
const fit=text=>text.length<=4000?text:text.slice(0,text.lastIndexOf('\n',3900))+'\n…';
// The text exactly as send() posts it: cut to Telegram's limit, with the Moscow time it is sent.
export const stamped=text=>fit(text)+`\n\n<i>🕒 Отправлено: ${moscow()}</i>`;
// Whether a text goes under a photo as its caption (Telegram counts UTF-16 units, an emoji is two, as JavaScript does).
export const fitsCaption=text=>plainText(stamped(text)).length<=CAPTION_LIMIT;
// Sending to one bot and chat. Without both the message is only printed and send() answers false. Every message ends
// with the Moscow time it was sent. send(text,{photo,caption}) puts a local image on top: the text is its caption when it
// fits; otherwise the photo goes with the short caption and the text follows as a reply to it (without a caption, the bare
// photo, then the text).
export function sender(token,chat){
 const configured=Boolean(token&&chat);
 // One Telegram call: waits out 429 rate limits (retry_after) and retries server errors a few times. A photo is uploaded
 // as a file, so the call is multipart; the form is rebuilt on every attempt.
 async function post(body,photo){
  const method=photo?'sendPhoto':'sendMessage';
  for(let attempt=0;;attempt++){
   let init;
   if(photo){const form=new FormData();form.append('chat_id',String(chat));
    for(const [k,v] of Object.entries(body))form.append(k,String(v));
    form.append('photo',new Blob([fs.readFileSync(photo)],{type:'image/jpeg'}),path.basename(photo));init={method:'POST',body:form};}
   else init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,disable_web_page_preview:true,...body})};
   const res=await fetch(`https://api.telegram.org/bot${token}/${method}`,init);
   if(res.ok||res.status===400||attempt>=4||(res.status!==429&&res.status<500))return res;
   const wait=res.status===429?((await res.json().catch(()=>({})))?.parameters?.retry_after||5):2**attempt;
   await new Promise(r=>setTimeout(r,wait*1000));
  }
 }
 // Rejected markup must not lose the message: resend the same words as plain text. Answers the sent message.
 async function deliver(field,text,photo,extra={}){
  const res=await post({[field]:text,parse_mode:'HTML',...extra},photo);
  if(res.status===400){const plain=await post({[field]:plainText(text),...extra},photo);
   if(!plain.ok)throw Error('Telegram: '+plain.status+' '+await plain.text());console.log('sent to Telegram as plain text');return (await plain.json().catch(()=>null))?.result;}
  if(!res.ok)throw Error('Telegram: '+res.status+' '+await res.text());
  console.log('sent to Telegram');return (await res.json().catch(()=>null))?.result;
 }
 async function send(text,{photo,caption}={}){
  const under=photo&&fitsCaption(text),short=photo&&!under&&caption&&plainText(caption).length<=CAPTION_LIMIT;text=stamped(text);
  console.log((photo?`\n[фото: ${path.basename(photo)}]`:'')+(short?`\n${hideHandles(caption)}\n[ответом на фото]`:'')+'\n'+hideHandles(text)+'\n');
  if(!configured){console.log('Telegram secrets not set: message not sent.');return false;}
  if(under){await deliver('caption',text,photo);return true;}
  if(short){
   const shown=await deliver('caption',caption,photo);
   // The verdict is in the chat under the photo: a failed reply is logged, never a reason to post the photo again.
   try{await deliver('text',text,null,shown?.message_id?{reply_parameters:{message_id:shown.message_id}}:{});}
   catch(e){console.error('the full protocol (reply to the photo) failed: '+e.message);}
   return true;
  }
  if(photo){const res=await post({},photo);if(!res.ok)throw Error('Telegram: '+res.status+' '+await res.text());}
  await deliver('text',text);
  return true;
 }
 return {configured,send};
}
