import test from 'node:test';import assert from 'node:assert/strict';
import {writeStored} from '../src/storage.js';
test('a redundant catalog cache cannot prevent the draft from being saved',()=>{
 const previous=globalThis.localStorage;const memory=new Map([['fbl-default-db','cache']]);
 globalThis.localStorage={setItem(key,value){if(memory.has('fbl-default-db')&&key==='fbl-draft')throw Error('quota');memory.set(key,value);},removeItem(key){memory.delete(key);}};
 try{assert.equal(writeStored('fbl-draft','saved picks'),true);assert.equal(memory.get('fbl-draft'),'saved picks');assert.equal(memory.has('fbl-default-db'),false);}finally{globalThis.localStorage=previous;}
});
