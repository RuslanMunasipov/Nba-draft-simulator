// ESPN's texts in Russian (scripts/translate-espn.mjs, src/translate.js): a translation keeps every number of its original
// or is not kept, comments go first, old entries are dropped, and the site finds a text by the same key the job wrote.
import test from 'node:test';import assert from 'node:assert/strict';
import {translateBatch,pending,merged,sameNumbers,numbersOf,batchPrompt,SCHEMA} from '../scripts/translate-espn.mjs';
import {textKey,newsRu,textRu,newsText,injuryDetail} from '../src/translate.js';

test('a translation keeps the numbers of its original, in any order and with a decimal comma',()=>{
 assert.ok(sameNumbers('Booker had 23 points (7-13 FG) in a 124-83 loss','Букер набрал 23 очка (7/13 с игры) в матче, проигранном 83:124'));
 assert.ok(sameNumbers('29.5 minutes','29,5 минуты'));
 assert.ok(!sameNumbers('four rebounds','4 подбора'),'a word turned into a digit');
 assert.ok(!sameNumbers('out 2-4 weeks','не сыграет 2-3 недели'),'a changed number');
 assert.deepEqual(numbersOf('7-13, 9.5'),['13','7','9.5']);
});

test('a batch keeps only the translations whose numbers match and that are there',async()=>{
 const items=[{id:'n1',headline:'Booker scored 23 points.',story:'He shot 7-13.'},{id:'n2',headline:'Gueye out',story:'Out 4-6 weeks.'},{id:'t3',headline:'',story:'Day-to-day.'}];
 let asked=null,warned=[];
 const claude=async x=>{asked=x;return {data:{items:[{id:'n1',headline:'Букер набрал 23 очка.',story:'Он реализовал 7 из 13.'},{id:'n2',headline:'Гей выбыл',story:'Не сыграет 4-8 недель.'}]}};};
 const out=await translateBatch(items,{claude,log:m=>warned.push(m)});
 assert.deepEqual(Object.keys(out),['n1']);
 assert.equal(out.n1.headline,'Букер набрал 23 очка.');
 assert.equal(warned.length,2,'one changed number, one missing');
 assert.deepEqual(asked.schema,SCHEMA);assert.match(asked.system,/латиницей/);assert.match(asked.prompt,/"id": "t3"/);
 assert.match(batchPrompt(items),/headline оставь пустым/);
});

test('what to translate: comments first, then the newest news; done ones skipped',()=>{
 const news=[{id:'1',published:'2026-10-20',headline:'a',story:''},{id:'2',published:'2026-10-22',headline:'b',story:''},{id:'3',published:'2026-10-21',headline:'c',story:''}];
 const done={news:{3:{}},texts:{[textKey('Old comment.')]:{}}};
 const todo=pending({news,comments:['New comment.','Old comment.'],done});
 assert.deepEqual(todo.map(x=>x.id),['t'+textKey('New comment.'),'n2','n1']);
});

test('the file keeps the new translations and drops old news and comments no longer seen',()=>{
 const old={news:{9:{headline:'h',story:'s',published:'2026-01-01T00:00Z'},8:{headline:'h',story:'s',published:'2026-10-01T00:00Z'}},
  texts:{a:{text:'x',seen:'2026-07-01'},b:{text:'y',seen:'2026-07-01'}}};
 const results=[[{kind:'news',newsId:'7',published:'2026-10-22T10:00Z'},{headline:'Новость',story:'Текст'}],[{kind:'text',key:'c'},{headline:'',story:'Комментарий'}]];
 const out=merged(old,results,{today:'2026-10-23',seenTexts:new Set(['b'])});
 assert.deepEqual(Object.keys(out.news).sort(),['7','8']);
 assert.deepEqual(Object.keys(out.texts).sort(),['b','c']);assert.equal(out.texts.b.seen,'2026-10-23');
 assert.equal(out.news[7].headline,'Новость');assert.equal(out.texts.c.text,'Комментарий');
});

test('the site finds a translation by the same key, and shows the original without one',()=>{
 const n={id:53548046,headline:'Booker closed with 23 points.',story:'<p>The Suns   came out flat.</p>'};
 assert.deepEqual(newsText(n),{headline:'Booker closed with 23 points.',story:'The Suns came out flat.'});
 const tr={news:{53548046:{headline:'Букер набрал 23 очка.',story:'«Финикс» начал вяло.'}},texts:{[textKey('Gueye underwent  surgery.')]:{text:'Гею сделали операцию.'}}};
 assert.deepEqual(newsRu(tr,n),{headline:'Букер набрал 23 очка.',story:'«Финикс» начал вяло.',translated:true});
 assert.equal(newsRu(tr,{...n,id:1}).translated,false);assert.equal(newsRu(null,n).headline,'Booker closed with 23 points.');
 assert.deepEqual(textRu(tr,'Gueye underwent surgery.'),{text:'Гею сделали операцию.',translated:true},'spaces do not change the key');
 assert.deepEqual(textRu(tr,'Other.'),{text:'Other.',translated:false});
 assert.equal(textKey('a b'),textKey(' a  b '));assert.notEqual(textKey('a b'),textKey('a c'));
});

test('the kind of an injury in Russian, unknown words as they are',()=>{
 assert.equal(injuryDetail('Sprain'),'растяжение');assert.equal(injuryDetail('Not Specified'),'не уточнено');
 assert.equal(injuryDetail('Weird'),'Weird');assert.equal(injuryDetail(''),'');
});
