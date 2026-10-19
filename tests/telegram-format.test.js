import test from 'node:test';
import assert from 'node:assert/strict';
import {esc,signed,gains,moveLines,details,message,plainText} from '../scripts/telegram-format.mjs';
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
