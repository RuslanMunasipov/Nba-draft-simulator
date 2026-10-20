import test from 'node:test';
import assert from 'node:assert/strict';
import {remark,signature,HEADINGS,LINES} from '../scripts/zak-voice.mjs';
test('Зак Онн speaks to the broken rule, harsher to a watched team, and always the same for one protocol',()=>{
 for(const seed of ['k1','k2','k3','k4']){
  assert.ok(LINES.BREACH.time.includes(remark('violation',['time'],false,seed)));
  const [first,...rest]=LINES.BREACH.rookie.filter(l=>remark('violation',['rookie','time'],true,seed).startsWith(l));
  assert.ok(first&&!rest.length);
  assert.ok(LINES.BREACH_WATCHED.some(l=>remark('violation',['rookie'],true,seed).endsWith(l)));
  assert.ok(LINES.APPROVED_WATCHED.includes(remark('approved',[],true,seed)));
  assert.ok(LINES.CHECK.includes(remark('check',[],false,seed)));
 }
 assert.equal(remark('approved',[],false,'k2'),remark('approved',[],false,'k2'));
 assert.equal(signature('k3'),signature('k3'));assert.match(signature('k3'),/Зак Онн/);
 assert.equal(HEADINGS.violation,'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>');
});
test('every line is short enough to keep a protocol under the photo',()=>{
 const all=[...LINES.APPROVED,...LINES.APPROVED_WATCHED,...LINES.CHECK,...Object.values(LINES.BREACH).flat(),...LINES.BREACH_WATCHED,...LINES.SIGNATURES];
 assert.ok(all.length>=60);for(const l of all)assert.ok(l.length<=90,l);
});
