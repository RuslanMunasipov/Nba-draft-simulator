import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {encrypt,decrypt,fillHandles,loadHandles} from '../scripts/handles.mjs';
const key='123:bot-token-like-secret';
test('usernames round-trip only with the right key',()=>{
 const box=encrypt({lawyer:'zak',managers:{7:'gm7'}},key);
 assert.ok(!JSON.stringify(box).includes('zak'));
 assert.deepEqual(decrypt(box,key),{lawyer:'zak',managers:{7:'gm7'}});
 assert.throws(()=>decrypt(box,'another-token'));
});
test('statements resolve their tags or report what is missing',()=>{
 const h={lawyer:'zak',managers:{7:'gm7'}};
 assert.deepEqual(fillHandles('{@gm:7}, {@lawyer}',h),{text:'@gm7, @zak',missing:[]});
 assert.deepEqual(fillHandles('{@commissioner} {@gm:3}',h).missing,['{@commissioner}','{@gm:3}']);
});
test('without the key, or with a wrong one, nobody is tagged',()=>{assert.deepEqual(loadHandles(''),{managers:{}});assert.deepEqual(loadHandles('wrong'),{managers:{}});});
