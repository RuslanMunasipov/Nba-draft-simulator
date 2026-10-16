import test from 'node:test';import assert from 'node:assert/strict';
import {fetchDatabase} from '../src/database-loader.js';
test('a hung fetch is bounded even if abort is ignored',async()=>{
 const original=global.fetch;global.fetch=()=>new Promise(()=>{});
 try{await assert.rejects(fetchDatabase('/db',{timeoutMs:5,attempts:1}),/время/);}finally{global.fetch=original;}
});
test('transient database failure retries before returning parsed content',async()=>{
 const original=global.fetch;let calls=0;global.fetch=async()=>{if(++calls===1)throw Error('offline');return {ok:true,json:async()=>({players:[1]})};};
 try{assert.deepEqual(await fetchDatabase('/db',{timeoutMs:100}),{players:[1]});assert.equal(calls,2);}finally{global.fetch=original;}
});
