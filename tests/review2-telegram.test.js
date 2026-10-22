import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DRAFT_PICKS,DRAFT_DATE} from '../src/fbl-draft-2026.js';
import {hasInjuryRows,outUntil} from '../scripts/telegram-format.mjs';
// The Telegram advisor and the league feed run as the watcher runs them, on synthetic leagues (the 80 real draft ids),
// with the clock fixed and the network blocked: only the ESPN injury report a test hands in and, when a test sets the
// secrets, a Telegram that answers ok (so the advisor saves its state) are reachable.
const NOTIFY=new URL('../scripts/notify-transfers.mjs',import.meta.url).pathname,FEED=new URL('../scripts/league-feed.mjs',import.meta.url).pathname;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'review2-telegram-')),pre=path.join(tmp,'pre.mjs');
fs.writeFileSync(pre,`import fs from 'node:fs';
const t=Date.parse(process.env.FAKE_NOW);if(Number.isFinite(t))Date.now=()=>t;
const json=body=>new Response(body,{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async u=>{const s=String(u);
 if(s.includes('/basketball/nba/injuries')&&process.env.ESPN_INJURIES)return json(fs.readFileSync(process.env.ESPN_INJURIES,'utf8'));
 if(s.startsWith('https://api.telegram.org/'))return json('{"ok":true,"result":{"message_id":1}}');
 throw Error('network blocked: '+s);};
`);
const plain=s=>s.replace(/<[^>]+>/g,'');

// ---------- The advisor (notify-transfers.mjs) ----------
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
const LEAGUE=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
const WHITE=(LEAGUE.white||[]).map(Number).filter(id=>Number.isFinite(id)&&!DRAFT_PICKS.includes(id));
const freeId=i=>WHITE[i]??9000000+i;
// 82 games every other day from 22.10 (tip-off guessed at 02:00 MSK of the date), three a week.
const CAL=Array.from({length:82},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*2*864e5).toISOString().slice(0,10),week:1+Math.floor(i/3)}));
const range=mean=>({meanPerGame:mean,games:82,meanSeason:mean*82,seasonFloor:mean*82*.85,seasonCeiling:mean*82*1.15,gameFloor:mean*.7,gameCeiling:mean*1.3});
// Pick k on team k%8 (two per Sports.ru position by round, the last round rookies, 30 a game, each on its own club), free
// agents F1 (PF 20) and `free` {name: [position, points a game, price]}; espnId 5000+k, free agents 5100+j. Team 3 sells
// D51 for F1 on 21.10.
function league({free={},calendar=CAL}={}){
 const players=[],live={players:{},teams:{},clubs:{}};
 const add=(id,i,name,pos,m,cost,rookie)=>{const sid=`s${i}`,club=`К${i}`;
  players.push({id,name,sportsId:sid,espnId:String(5000+i),team:`A${i}`,sportsClub:club,positions:[pos],price:cost,priceStatus:'VERIFIED',isRookie:rookie,forecast:range(m)});
  live.players[sid]={name:`Ш${i}`,fullName:name,price:cost,initialPrice:cost,position:pos,club,games:[]};live.clubs[club]=calendar;};
 DRAFT_PICKS.forEach((id,k)=>add(id,k,`D${k}`,POS[Math.floor(k/8)],30,1500,Math.floor(k/8)===9));
 Object.entries({F1:['PF',20,1500],...free}).forEach(([name,[pos,m,cost]],j)=>add(freeId(j),100+j,name,pos,m,cost,false));
 const sid=name=>players.find(p=>p.name===name).sportsId;
 for(let t=0;t<8;t++){const mine=DRAFT_PICKS.map((_,k)=>k).filter(k=>k%8===t);
  live.teams[t]={journal:mine.map(k=>({date:DRAFT_DATE,buy:{name:`Ш${k}`,price:1500},sell:null})),roster:mine.map(k=>({sportsId:`s${k}`,name:`Ш${k}`,price:1500})),balance:0,transfersLeft:3};}
 const t3=live.teams[3];
 t3.journal.push({date:'2026-10-21',sell:{name:'Ш51',price:1500},buy:{name:live.players[sid('F1')].name,price:1500},seenAt:'2026-10-21T09:00:00Z',seenAfter:'2026-10-21T08:58:00Z',sellSid:'s51',buySid:sid('F1')});
 t3.roster=[...t3.roster.filter(r=>r.sportsId!=='s51'),{sportsId:sid('F1'),name:live.players[sid('F1')].name,price:1500}];
 return {db:{players},live};
}
// An ESPN injury report row as ESPN publishes it.
const row=(espnId,{status='Out',fantasy='OUT',returnDate=null,comment=''}={})=>({athlete:{displayName:`P${espnId}`,links:[{href:`https://www.espn.com/nba/player/_/id/${espnId}/p`}]},
 status,shortComment:comment,details:{fantasyStatus:{abbreviation:fantasy},returnDate,type:'Knee'}});
const report=(rows,fetchedAt)=>({fetchedAt,injuries:rows.length?[{displayName:'Team',injuries:rows}]:[]});
// One advisor run for team 0 at `now`. ok: whether the collector's ESPN fetch succeeded this time (else `injuries` is the
// report it kept); refetch: the body ESPN answers the advisor's own try; telegram: the secrets set (the state is saved).
function notify({db,live},{now,injuries=report([],new Date(Date.parse(now)-30*60e3).toISOString()),ok=true,refetch=null,telegram=false,state={}}){
 const dir=fs.mkdtempSync(path.join(tmp,'run-')),lp=path.join(dir,'live.json'),sp=path.join(dir,'state.json'),dp=path.join(dir,'db.json');
 fs.writeFileSync(lp,JSON.stringify({...live,espnInjuries:injuries,espnInjuriesOk:ok}));fs.writeFileSync(dp,JSON.stringify(db));
 fs.writeFileSync(sp,JSON.stringify({sent:[],injuries:[],transfers:[],transferEvents:[],returns:[],unknown:[],watch:[],...state}));
 const env={...process.env,DB_PATH:dp,FAKE_NOW:now,FBL_TEAM:'0'};
 for(const k of Object.keys(env))if(/TELEGRAM|ESPN_INJURIES/.test(k))delete env[k];
 if(telegram)Object.assign(env,{TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'1'});
 if(refetch!==null){const ep=path.join(dir,'espn.json');fs.writeFileSync(ep,refetch);env.ESPN_INJURIES=ep;}
 const out=execFileSync(process.execPath,['--import',pre,NOTIFY,lp,sp],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 return {out,state:JSON.parse(fs.readFileSync(sp,'utf8'))};
}
const idOf=(db,name)=>db.players.find(p=>p.name===name).id;

test('an ESPN answer that lists nobody is no fresh report: the kept one stays, with its warning and the return memory (C01)',()=>{
 // X (45 a game, free) is out until 24.10 in the report the collector kept after its failed fetch; he was already warned
 // about and is watched.
 const now='2026-10-21T10:00:00Z',l=league({free:{X:['SF',45,1300]}}),x=idOf(l.db,'X');
 const kept=report([row('5101',{returnDate:'2026-10-24'})],'2026-10-21T07:00:00Z'),state={returns:[String(x)],watch:[x]};
 for(const body of ['{"injuries":[]}',JSON.stringify({injuries:[{displayName:'Atlanta Hawks',injuries:[]}]})]){
  const run=notify(l,{now,injuries:kept,ok:false,refetch:body,telegram:true,state});
  assert.match(run.out,/⚠️ Отчёт ESPN о травмах не обновился с 21\.10\.2026, 10:00 МСК/,body);
  // Nobody is "back" on an empty answer, and the memory of the warnings and the watch list survive it.
  assert.doesNotMatch(run.out,/X вернулся в строй/,body);
  assert.deepEqual(run.state.returns,[String(x)],body);assert.deepEqual(run.state.watch,[x],body);
 }
 // A real answer is fresh: no warning, X still out and watched.
 const fresh=notify(l,{now,injuries:kept,ok:false,refetch:JSON.stringify(report([row('5101',{returnDate:'2026-10-24'})])),telegram:true,state});
 assert.doesNotMatch(fresh.out,/Отчёт ESPN о травмах не обновился/);assert.deepEqual(fresh.state.returns,[String(x)]);assert.deepEqual(fresh.state.watch,[x]);
});
test('a game that has tipped off is not gainable any more, before its score is in (R20: ctx.now in the advisor)',()=>{
 // 22.10, 03:30 MSK: the night's game (02:00 MSK) is under way, Sports.ru has no score and no row for it yet. The advice
 // must be the one it gives once the game is gone from the calendar.
 const now='2026-10-22T00:30:00Z',free={X:['SF',45,1300]},gain=out=>out.match(/\n1\. D\d+ → <b>X<\/b>\n/)&&out.match(/🧩[^\n]*\n[^\n]* за неделю · (\+\d+) за 4 нед\. · (\+\d+) за сезон/);
 const tipped=notify(league({free}),{now}).out,gone=notify(league({free,calendar:CAL.map((g,i)=>i?g:{...g,gone:true})}),{now}).out;
 const after=gain(tipped);assert.ok(after,tipped);
 assert.equal(tipped,gone);
 // Before the tip-off the same game is still to gain.
 const before=gain(notify(league({free}),{now:'2026-10-21T22:30:00Z'}).out);
 assert.ok(Number(before[1])>Number(after[1])&&Number(before[2])>Number(after[2]),`${before[0]} / ${after[0]}`);
});
test('a season-ending report reads «до конца сезона», never ESPN\'s placeholder date', ()=>{
 const now='2026-10-21T10:00:00Z',l=league();
 const injuries=report([row('5000',{returnDate:'2027-01-02',comment:'D0 will miss the remainder of the season.'}),row('5008',{returnDate:'2026-10-30',comment:'D8 is out.'}),
  row('5016',{fantasy:'OFS',returnDate:'2027-07-01'})],'2026-10-21T09:30:00Z');
 const out=plain(notify(l,{now,injuries}).out);
 assert.match(out,/🩹 Травмы\nD0 — Out до конца сезона\nD8 — Out до 30\.10\nD16 — Out до конца сезона\n/);
 assert.doesNotMatch(out,/до 02\.01|до 01\.07/);
});
test('the injury helpers: a report needs a row; until when a report keeps a player out',()=>{
 assert.equal(hasInjuryRows(null),false);assert.equal(hasInjuryRows({injuries:[]}),false);assert.equal(hasInjuryRows({injuries:[{injuries:[]}]}),false);
 assert.equal(hasInjuryRows(report([row('1')])),true);
 assert.equal(outUntil(null),'');assert.equal(outUntil({status:'Out',fantasyStatus:'OUT',returnDate:'2026-11-05'}),' до 05.11');
 assert.equal(outUntil({status:'Out',fantasyStatus:'OUT',returnDate:'2027-01-02',comment:'He sustained a season-ending knee injury.'}),' до конца сезона');
 assert.equal(outUntil({status:'Out',fantasyStatus:'OFS',returnDate:'2027-07-01'}),' до конца сезона');
});

// ---------- The league feed (league-feed.mjs) ----------
// Pick k on team k%8, the first eight rookies (one a team), each on its own club; free veterans F0-F11; and M, a player
// only the Sports.ru market knows (withMarket: rookie status not known to the database).
function feedLeague(){
 const free=Array.from({length:12},(_,i)=>({id:`espn:900${i}`,sid:`f${i}`}));
 const db={players:[...DRAFT_PICKS.map((id,k)=>({id,name:`P${k}`,sportsId:`s${k}`,positions:['PG'],price:1000,isRookie:k<8})),
  ...free.map((f,i)=>({id:f.id,name:`F${i}`,sportsId:f.sid,positions:['PG'],price:1000,isRookie:false}))]};
 const live={players:{},teams:{}};
 for(const p of db.players)live.players[p.sportsId]={name:`Ш${p.sportsId}`,fullName:`Игрок ${p.sportsId}`,price:1000,initialPrice:1000,position:'PG',club:`Клуб ${p.sportsId}`};
 live.players.m1={name:'Шm1',fullName:'Игрок m1',price:1000,initialPrice:1000,position:'PG',club:'Клуб m1'};
 for(let t=0;t<8;t++){const mine=DRAFT_PICKS.map((_,k)=>k).filter(k=>k%8===t);
  live.teams[t]={journal:mine.map(k=>({date:DRAFT_DATE,buy:{name:`Шs${k}`,price:1000},sell:null})),roster:mine.map(k=>({sportsId:`s${k}`,name:`Шs${k}`,price:1000}))};}
 const dp=path.join(tmp,'feed-db.json');fs.writeFileSync(dp,JSON.stringify(db));
 return live;
}
function deal(live,team,out,inn,at){
 const t=live.teams[team];
 t.journal.push({date:at.slice(0,10),sell:{name:`Ш${out}`,price:1000},buy:{name:`Ш${inn}`,price:1000},seenAt:at,seenAfter:new Date(Date.parse(at)-60e3).toISOString(),sellSid:out,buySid:inn});
 t.roster=[...t.roster.filter(r=>r.sportsId!==out),{sportsId:inn,name:`Ш${inn}`,price:1000}];
}
const posted=(live,count)=>({events:Object.entries(live.teams).flatMap(([t,x])=>x.journal.filter(r=>r.sell).flatMap(r=>[`${t}|${r.date}|out|${r.sell.name}|${r.sell.price}`,`${t}|${r.date}|in|${r.buy.name}|${r.buy.price}`])),count});
function feed(live,state,now){
 const lp=path.join(tmp,'feed-live.json'),sp=path.join(tmp,'feed-state.json');fs.writeFileSync(lp,JSON.stringify(live));fs.writeFileSync(sp,JSON.stringify(state));
 const env={...process.env,DB_PATH:path.join(tmp,'feed-db.json'),FAKE_NOW:now};
 for(const k of Object.keys(env))if(/TELEGRAM|HANDLES|GH_TOKEN|ESPN_INJURIES/.test(k))delete env[k];
 return plain(execFileSync(process.execPath,['--import',pre,FEED,lp,sp],{env,encoding:'utf8'}));
}
const checkLine=out=>out.match(/Новичок в составе — [^\n]*/)[0];

test('the protocol\'s checklist shows a rookie doubt as a check, not as «❌ нет» (C02)',()=>{
 // Team 4 sells its only rookie (s4) for M, whose rookie status the database does not know.
 const live=feedLeague(),state=posted(live,6);deal(live,4,'s4','m1','2026-10-21T09:00:00Z');
 const out=feed(live,state,'2026-10-21T09:01:00Z');
 assert.match(out,/🔎 На проверке: правило новичка\n/);assert.match(out,/Заключение: явных нарушений нет, нужна проверка/);
 assert.equal(checkLine(out),'Новичок в составе — ⏳ не отмечен, базе не известен статус: Игрок m1');
 // A certain breach still reads «❌ нет».
 const sure=feedLeague(),st=posted(sure,6);deal(sure,4,'s4','f0','2026-10-21T09:00:00Z');
 assert.equal(checkLine(feed(sure,st,'2026-10-21T09:01:00Z')),'Новичок в составе — ❌ нет');
});
test('a deal that turns the rookie doubt into a certain breach opens the case; a doubt that only persists does not (C03)',()=>{
 // 21.10: s4 (the rookie) for M, a doubt. 22.10: M for the veteran F0, so no rookie for sure.
 const live=feedLeague();deal(live,4,'s4','m1','2026-10-21T09:00:00Z');const state=posted(live,7);
 const sold=structuredClone(live);deal(sold,4,'m1','f0','2026-10-22T09:00:00Z');
 const out=feed(sold,state,'2026-10-22T09:01:00Z');
 assert.match(out,/🚨 Нарушено: правило новичка\n/);assert.match(out,/⚖️ Зак Онн открывает дело/);
 assert.match(out,/Сделка: Игрок m1 \(1000\) ⟶ Игрок f0 \(1000\) — ❌ правило новичка/);
 assert.match(out,/Заключение: регламент нарушен, дело открыто\./);assert.doesNotMatch(out,/не устранено|по-прежнему/);
 assert.equal(checkLine(out),'Новичок в составе — ❌ нет');
 // An unrelated deal (s12 for F1) leaves the doubt as it was: still a check, no deal blamed.
 const other=structuredClone(live);deal(other,4,'s12','f1','2026-10-22T09:00:00Z');
 const kept=feed(other,state,'2026-10-22T09:01:00Z');
 assert.match(kept,/🔎 На проверке: правило новичка \(не устранено\)/);assert.doesNotMatch(kept,/открывает дело|— ⏳ правило новичка|— ❌/);
 // A certain breach the roster already had stays «не устранено», with no new case.
 const breach=feedLeague();deal(breach,4,'s4','f0','2026-10-21T09:00:00Z');const st=posted(breach,7);deal(breach,4,'s12','f1','2026-10-22T09:00:00Z');
 const again=feed(breach,st,'2026-10-22T09:01:00Z');
 assert.match(again,/🚨 Нарушение не устранено: правило новичка/);assert.doesNotMatch(again,/открывает дело/);
});
