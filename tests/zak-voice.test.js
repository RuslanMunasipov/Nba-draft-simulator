import test from 'node:test';
import assert from 'node:assert/strict';
import {remark,signature,HEADINGS} from '../scripts/zak-voice.mjs';
test('Зак Онн speaks to the broken rule, harsher to a watched team, and always the same for one protocol',()=>{
 assert.match(remark('violation',['time'],false,'k1'),/08:00–22:00|Ночью/);
 assert.match(remark('violation',['rookie','time'],true,'k1'),/Новичок|новичка/);
 assert.match(remark('violation',['rookie'],true,'k1'),/предупреждал|Прицел больше/);
 assert.equal(remark('approved',[],false,'k2'),remark('approved',[],false,'k2'));
 assert.equal(signature('k3'),signature('k3'));assert.match(signature('k3'),/Зак Онн/);
 assert.equal(HEADINGS.violation,'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>');
});
