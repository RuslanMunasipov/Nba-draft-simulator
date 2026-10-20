import test from 'node:test';
import assert from 'node:assert/strict';
import {remark,circumstances,joke,signature,HEADINGS,LINES} from '../scripts/zak-voice.mjs';
const flat=o=>Array.isArray(o)?o:Object.values(o).flatMap(flat);
test('Зак Онн speaks to the broken rule, harsher to a watched team, and always the same for one protocol',()=>{
 for(const seed of ['k1','k2','k3','k4','k5']){
  assert.ok(LINES.BREACH.time.includes(remark('violation',['time'],false,seed)));
  const many=remark('violation',['rookie','time'],false,seed);
  assert.ok(LINES.BREACH.rookie.some(l=>many.startsWith(l))&&LINES.BREACH_MANY.some(l=>many.endsWith(l)));
  const watched=remark('violation',['rookie','time'],true,seed);
  assert.ok(LINES.BREACH_WATCHED.some(l=>watched.endsWith(l))&&!LINES.BREACH_MANY.some(l=>watched.includes(l)));
  assert.ok(LINES.APPROVED_WATCHED.includes(remark('approved',[],true,seed)));
  assert.ok(LINES.CHECK_BY.time.includes(remark('check',['time'],false,seed)));
  assert.ok(LINES.CHECK_BY.unmarked.includes(remark('check',['unmarked'],false,seed)));
  assert.ok(LINES.CHECK.includes(remark('check',[],false,seed)));
 }
 assert.equal(remark('approved',[],false,'k2'),remark('approved',[],false,'k2'));
 assert.equal(signature('k3'),signature('k3'));assert.match(signature('k3'),/Зак Онн/);
 assert.equal(HEADINGS.violation,'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>');
});
test('circumstances: the week\'s last transfer first, then the bank, a big buy, a package, the first of the week',()=>{
 assert.ok(LINES.CONTEXT.lastTransfer.includes(circumstances({left:0,used:3,bank:50},'s')));
 assert.ok(LINES.CONTEXT.emptyBank.includes(circumstances({left:2,used:1,bank:50},'s')));
 assert.ok(LINES.CONTEXT.bigBuy.includes(circumstances({left:2,used:1,bank:900,maxPrice:2400},'s')));
 assert.ok(LINES.CONTEXT.package.includes(circumstances({left:1,used:2,bank:900,moves:2},'s')));
 assert.ok(LINES.CONTEXT.firstOfWeek.includes(circumstances({left:2,used:1,bank:900},'s')));
 assert.equal(circumstances({left:1,used:2,bank:900},'s'),null);
});
test('a joke now and then, and every line short enough for the photo caption',()=>{
 const told=['a','b','c','d','e','f','g','h'].map(joke).filter(Boolean);
 assert.ok(told.length>0&&told.length<8);for(const j of told)assert.ok(LINES.JOKES.includes(j));
 const all=flat(LINES);assert.ok(all.length>=130);for(const l of all)assert.ok(l.length<=100,l);
});
