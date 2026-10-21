// Telegram HTML formatting for the FBL notifier: the decision on top in bold, the reasoning in a collapsed quote.
import fs from 'node:fs';
import path from 'node:path';
import {seasonEnding} from '../src/season.js';
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
// ---------- Injury and return alerts ----------
// The ESPN injury report a run may trust: present, fetched by the collector this time (espnInjuriesOk is false when it
// kept an older report after a failed fetch) and at most `maxHours` old. A run without one never says a player is back.
export function injuryFeed(live,now=Date.now(),maxHours=6){
 const feed=live?.espnInjuries?.injuries?live.espnInjuries:null,at=Date.parse(feed?.fetchedAt||'');
 return {feed,fresh:Boolean(feed)&&live.espnInjuriesOk!==false&&Number.isFinite(at)&&now-at<=maxHours*36e5,fetchedAt:Number.isFinite(at)?new Date(at).toISOString():null};
}
// A report that lists nobody is a broken feed, never "everyone is healthy" (the collector's rule: espn_injuries in
// collect_sports_current.py keeps the previous report then).
export const hasInjuryRows=feed=>Boolean(feed?.injuries?.some(t=>t?.injuries?.length));
// Until when a report keeps a player out, as the messages say it: a season-ending one (season.js seasonEnding: OFS, or
// OUT whose comment says so; the forecast counts no game) to the end of the season, whatever placeholder date ESPN shows.
export const outUntil=i=>!i?'':seasonEnding(i)?' до конца сезона':i.returnDate?` до ${String(i.returnDate).slice(8,10)}.${String(i.returnDate).slice(5,7)}`:'';
// The line that says the advice ran without a fresh ESPN report, or null when it had one.
export const injuryWarning=state=>state.fresh?null:state.feed?`⚠️ Отчёт ESPN о травмах не обновился${state.fetchedAt?' с '+moscow(state.fetchedAt):''}: травмы — по последнему полученному, о возвращениях не сообщаю.`
 :'⚠️ Отчёт ESPN о травмах недоступен: советы без учёта травм, о возвращениях не сообщаю.';
// Out (or suspended) and not a game-time decision: only such a player can "return"; day-to-day players are never news.
export const isOut=injury=>/out|suspension/i.test(String(injury?.status||''))&&injury?.fantasyStatus!=='GTD';
// The decision line of a return alert, by the model's confidence: sure → buy, between the bars → offered as not sure,
// below the lower bar → no alert at all (the same bars as the other advice). `when`: outside the transfer hours, when to
// make the move (a move made then is a certain breach).
export function returnHead(confidence,{sure,maybe,now=false,when=''}){
 if(confidence>=sure)return (now?'🎯 <b>Тебе: забирай</b>':'🎯 <b>Тебе: можно брать</b>')+when;
 return confidence>=maybe?'🤔 <b>Тебе: можно брать, но не уверенно</b>'+when:null;
}
// One "скоро вернётся" per injury: the key is the player, so a new status or return date of the same injury is not news
// again. Older keys ("id:status:date") still count for their player.
export const returnKey=id=>String(id);
const keyOf=(k,id)=>k===String(id)||String(k).startsWith(String(id)+':');
export const warnedFor=(keys,id)=>(keys||[]).some(k=>keyOf(k,id));
// A player off the injury report is forgotten, so his next injury warns again.
export const stillInjured=(keys,injuredIds)=>{const ids=[...injuredIds];return (keys||[]).filter(k=>ids.some(id=>keyOf(k,id)));};

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
