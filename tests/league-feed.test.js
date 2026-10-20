import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DRAFT_PICKS,DRAFT_DATE} from '../src/fbl-draft-2026.js';
// The league feed run as it runs in the watcher, on a synthetic league: the 80 real draft ids (pick k on team k%8, the
// first eight rookies, each on its own NBA club unless a test says otherwise) and free agents. No Telegram secrets: the
// feed prints each protocol and sends nothing; the network is blocked and the clock is fixed.
const FEED=new URL('../scripts/league-feed.mjs',import.meta.url).pathname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'league-feed-'));
const pre=path.join(tmp,'pre.mjs');
fs.writeFileSync(pre,"globalThis.fetch=async u=>{throw Error('network blocked: '+u);};if(process.env.FAKE_NOW){const t=Date.parse(process.env.FAKE_NOW);Date.now=()=>t;}\n");
function league(clubs={}){
 const free=Array.from({length:12},(_,i)=>({id:`espn:900${i}`,sid:`f${i}`}));
 const db={players:[...DRAFT_PICKS.map((id,k)=>({id,name:`P${k}`,sportsId:`s${k}`,positions:['PG'],price:1000,isRookie:k<8})),
  ...free.map((f,i)=>({id:f.id,name:`F${i}`,sportsId:f.sid,positions:['PG'],price:1000,isRookie:false}))]};
 const live={players:{},teams:{}};
 for(const p of db.players)live.players[p.sportsId]={name:`Ш${p.sportsId}`,fullName:`Игрок ${p.sportsId}`,price:1000,initialPrice:1000,position:'PG',club:clubs[p.sportsId]||`Клуб ${p.sportsId}`};
 for(let t=0;t<8;t++){const mine=DRAFT_PICKS.map((_,k)=>k).filter(k=>k%8===t);
  live.teams[t]={journal:mine.map(k=>({date:DRAFT_DATE,buy:{name:`Шs${k}`,price:1000},sell:null})),roster:mine.map(k=>({sportsId:`s${k}`,name:`Шs${k}`,price:1000}))};}
 fs.writeFileSync(path.join(tmp,'db.json'),JSON.stringify(db));
 return live;
}
// One Sports.ru deal as the watcher stores it: the row with its time window and pinned players, the roster after it.
function deal(live,team,out,inn,at,date=at.slice(0,10)){
 const t=live.teams[team],seenAfter=new Date(Date.parse(at)-60e3).toISOString();
 t.journal.push({date,sell:{name:`Ш${out}`,price:1000},buy:{name:`Ш${inn}`,price:1000},seenAt:at,seenAfter,sellSid:out,buySid:inn});
 t.roster=[...t.roster.filter(r=>r.sportsId!==out),{sportsId:inn,name:`Ш${inn}`,price:1000}];
}
function feed(live,state,now){
 const lp=path.join(tmp,'live.json'),sp=path.join(tmp,'state.json');fs.writeFileSync(lp,JSON.stringify(live));fs.writeFileSync(sp,JSON.stringify(state));
 const env={...process.env,DB_PATH:path.join(tmp,'db.json'),FAKE_NOW:now};
 for(const k of Object.keys(env))if(/TELEGRAM|HANDLES|GH_TOKEN/.test(k))delete env[k];
 return execFileSync(process.execPath,['--import',pre,FEED,lp,sp],{env,encoding:'utf8'});
}
// Every deal up to now as reported: the state the feed saves after posting them.
const posted=(live,count=6)=>({events:Object.entries(live.teams).flatMap(([t,x])=>x.journal.filter(r=>r.sell).flatMap(r=>[`${t}|${r.date}|out|${r.sell.name}|${r.sell.price}`,`${t}|${r.date}|in|${r.buy.name}|${r.buy.price}`])),count});
const plain=s=>s.replace(/<[^>]+>/g,'');
// A player as a deal line shows him: his name, then any [новичок] / [белый] marks, then the price.
const P=sid=>`Игрок ${sid}(?: \\[\\S+\\])* \\(1000\\)`;

test('a new shared player next to one the team already had is a new breach: the deal is blamed and the case opened',()=>{
 const live=league();
 // Karagali Brothers (6) took team 1's player on 21.10; on 22.10 they take team 2's.
 deal(live,6,'s6','s1','2026-10-21T09:00:00Z');const state=posted(live);
 deal(live,6,'s14','s2','2026-10-22T09:00:00Z');
 const out=plain(feed(live,state,'2026-10-22T09:01:00Z'));
 assert.match(out,/🚨 Нарушено: (уникальность игроков; уникальность игроков \(не устранено\)|уникальность игроков \(не устранено\); уникальность игроков)\n/);
 assert.match(out,/Зак Онн открывает дело/);
 assert.match(out,new RegExp(`Сделка: ${P('s14')} ⟶ ${P('s2')} — ❌ уникальность игроков`));
 assert.match(out,/❌ Игрок s1 уже в составе.*❌ Игрок s2 уже в составе/);
 // An unrelated deal later: the breaches stand, no deal is blamed, no new case.
 const again=posted(live,7);deal(live,6,'s22','f0','2026-10-23T09:00:00Z');
 const later=plain(feed(live,again,'2026-10-23T09:01:00Z'));
 assert.match(later,/🚨 Нарушение не устранено: уникальность игроков/);assert.doesNotMatch(later,/открывает дело/);
 assert.match(later,new RegExp(`Сделка: ${P('s22')} ⟶ ${P('f0')}\n`));
});
test('two club breaches in one package are both named, each on the deal that made it',()=>{
 // Team 0 holds s0 and s8 of club A, s16 and s24 of club B; it buys one more of each.
 const live=league({s0:'Атланта',s8:'Атланта',f0:'Атланта',s16:'Бостон',s24:'Бостон',f1:'Бостон'});
 const state=posted(live);deal(live,0,'s32','f0','2026-10-21T09:00:00Z');deal(live,0,'s40','f1','2026-10-21T09:00:00Z');
 const out=plain(feed(live,state,'2026-10-21T09:01:00Z'));
 assert.match(out,/Нарушено: лимит клуба NBA \(сделки 1, 2\)/);
 assert.match(out,/Сделка 1: .* — ❌ лимит клуба NBA/);assert.match(out,/Сделка 2: .* — ❌ лимит клуба NBA/);
 assert.match(out,/❌ Атланта: .*; ❌ Бостон: /);
});
test('every deal made after 22:00 is marked, with its own time',()=>{
 const live=league(),state=posted(live);
 deal(live,3,'s3','f0','2026-10-21T19:01:00Z');deal(live,3,'s11','f1','2026-10-21T19:01:00Z');
 const out=plain(feed(live,state,'2026-10-21T19:02:00Z'));
 assert.match(out,/время сделки — вне 08:00–22:00 МСК \(сделки 1, 2\)/);
 assert.equal((out.match(/— ❌[^\n]*время сделки/g)||[]).length,2);assert.match(out,/сд\. 1 ❌ 22:01 \(21\.10\), сд\. 2 ❌ 22:01 \(21\.10\)/);
});
test('reported events never exceed the journal: a state from before events were kept cannot swallow a new deal',()=>{
 const live=league();deal(live,0,'s0','f0','2026-10-21T09:00:00Z');
 // The old state: keys of resolved players and the time it was saved; one key too many (a re-paired day).
 const state={reported:['0:'+DRAFT_PICKS[0]+'>espn:9000:2026-10-21','0:'+DRAFT_PICKS[8]+'>espn:9001:2026-10-22'],count:6,updatedAt:'2026-10-21T09:30:00Z'};
 deal(live,0,'s8','f1','2026-10-22T09:00:00Z');
 const out=plain(feed(live,state,'2026-10-22T09:01:00Z'));
 assert.match(out,new RegExp(`Сделка: ${P('s8')} ⟶ ${P('f1')}`));assert.doesNotMatch(out,new RegExp(`${P('s0')} ⟶`));
});
test('a long breach protocol is shortened to fit under the photo, keeping every deal at fault',()=>{
 const live=league({s4:'Атланта',s12:'Атланта',f0:'Атланта'}),state=posted(live);
 // Team 4 at 22:30: three deals, all outside the hours, one over the club limit, one taking team 1's player.
 deal(live,4,'s20','f0','2026-10-21T19:30:00Z');deal(live,4,'s28','s1','2026-10-21T19:30:00Z');deal(live,4,'s36','f2','2026-10-21T19:30:00Z');
 const out=feed(live,state,'2026-10-21T19:31:00Z'),body=out.slice(out.indexOf('\n',out.indexOf('[фото:'))+1,out.indexOf('Telegram secrets not set')).trim();
 const text=body.includes('[ответом на фото]')?body.split('[ответом на фото]')[0]:body;
 assert.ok(plain(text).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').length<=1024,`${plain(text).length} units`);
 for(const n of [1,2,3])assert.match(plain(out),new RegExp(`Сделка ${n}: .* — ❌`));
 assert.match(plain(out),/Заключение: регламент нарушен/);
});
