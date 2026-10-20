import test from 'node:test';
import assert from 'node:assert/strict';
import {esc,signed,gains,moveLines,details,message,plainText,sender,CAPTION_LIMIT} from '../scripts/telegram-format.mjs';
test('names are escaped for Telegram HTML',()=>{
 assert.equal(esc('A&B <C>'),'A&amp;B &lt;C&gt;');
 assert.equal(moveLines([{out:'D<E',in:'F'}],100)[0],'1. D&lt;E → <b>F</b>');
});
test('gains read season first, with a real minus sign',()=>{
 assert.equal(signed(-535.6),'−536');assert.equal(gains(48.2,-3),'+48 ФО за сезон · −3 за 4 нед.');
});
test('details collapse and empty parts disappear, blank lines stay',()=>{
 assert.equal(details([]),'');assert.equal(details(['a','b']),'<blockquote expandable>a\nb</blockquote>');
 assert.equal(message('x',null,'',['y',undefined]),'x\n\ny');
});
test('plain-text fallback keeps the words',()=>{
 assert.equal(plainText('🎯 <b>Тебе: забирай A&amp;B</b>\n<blockquote expandable>x &lt; y</blockquote>'),'🎯 Тебе: забирай A&B\nx < y');
});
test('a protocol with a photo: the text is its caption when it fits, otherwise it follows the photo',async()=>{
 const calls=[],real=globalThis.fetch,log=console.log;
 globalThis.fetch=async(url,init)=>{calls.push({method:url.split('/').pop(),form:init.body instanceof FormData?init.body:null});return new Response('{}',{status:200});};
 console.log=()=>{};
 try{
  const {send}=sender('t','c'),photo=new URL('../scripts/assets/zak-onn/approved.jpg',import.meta.url).pathname;
  await send('<b>Протокол</b>',{photo});
  assert.deepEqual(calls.map(c=>c.method),['sendPhoto']);assert.match(calls[0].form.get('caption'),/Протокол/);
  assert.ok(calls[0].form.get('photo') instanceof Blob);
  calls.length=0;await send('x'.repeat(CAPTION_LIMIT),{photo});
  assert.deepEqual(calls.map(c=>c.method),['sendPhoto','sendMessage']);assert.equal(calls[0].form.get('caption'),null);
 }finally{globalThis.fetch=real;console.log=log;}
});
