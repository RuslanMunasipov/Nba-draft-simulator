import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DRAFT_PICKS,DRAFT_DATE} from '../src/fbl-draft-2026.js';
import {explainSwap,confidencePercent,perGame,withBoxScores,liveGamePoints} from '../src/season.js';
import {eventInfo} from '../src/live.js';
import {returnHead} from '../scripts/telegram-format.mjs';
// The Telegram advisor run as the watcher runs it, on a synthetic league: the 80 real draft ids (pick k on team k%8, two
// per Sports.ru position by round, the last round rookies, 30 a game, each on its own club) and a few free agents. The
// clock is fixed, Telegram is not configured (every message is only printed) and the network is blocked, except for the
// ESPN scoreboard and box scores a test hands in.
const NOTIFY=new URL('../scripts/notify-transfers.mjs',import.meta.url).pathname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'notify-'));
const pre=path.join(tmp,'pre.mjs');
fs.writeFileSync(pre,`import fs from 'node:fs';
const t=Date.parse(process.env.FAKE_NOW);if(Number.isFinite(t))Date.now=()=>t;
const espn=process.env.ESPN_FIXTURE?JSON.parse(fs.readFileSync(process.env.ESPN_FIXTURE,'utf8')):null;
globalThis.fetch=async u=>{const s=String(u),d=s.match(/scoreboard\\?dates=(\\d+)/),e=s.match(/summary\\?event=(\\d+)/);
 const body=espn&&(d?{events:espn.scoreboard[d[1]]||[]}:e?espn.summary[e[1]]:null);
 if(body)return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 throw Error('network blocked: '+s);};
`);
const POS=['PG','PG','SG','SG','SF','SF','PF','PF','C','C'];
// Free agents count for the league's «белое правило» (ids of its list), so the rule never decides a test.
const LEAGUE=JSON.parse(fs.readFileSync(new URL('../data/fbl-league.json',import.meta.url),'utf8'));
const WHITE=(LEAGUE.white||[]).map(Number).filter(id=>Number.isFinite(id)&&!DRAFT_PICKS.includes(id));
const freeId=i=>WHITE[i]??9000000+i;
// 82 games every other day from 22.10, three a week: every player's season is the same length.
const CAL=Array.from({length:82},(_,i)=>({date:new Date(Date.parse('2026-10-22')+i*2*864e5).toISOString().slice(0,10),week:1+Math.floor(i/3)}));
const range=mean=>({meanPerGame:mean,games:82,meanSeason:mean*82,seasonFloor:mean*82*.85,seasonCeiling:mean*82*1.15,gameFloor:mean*.7,gameCeiling:mean*1.3});
const NOW='2026-10-21T10:00:00Z',NIGHT='2026-10-21T20:00:00Z';
// My team 0 sells and buys nothing; team 3 sells its PF D51 (round 6) for a 20-a-game filler, so D51 is free.
// free: {name: [position, points a game, price]}; mean, price, games: by draft index; left, bank: by team.
function league({free={},mean={},price={},left={},bank={},games={}}={}){
 const players=[],live={players:{},teams:{},clubs:{},espnInjuriesOk:true};
 const add=(id,i,name,pos,m,cost,rookie)=>{const sid=`s${i}`,club=`К${i}`;
  players.push({id,name,sportsId:sid,espnId:String(5000+i),team:`A${i}`,sportsClub:club,positions:[pos],price:cost,priceStatus:'VERIFIED',isRookie:rookie,forecast:range(m)});
  live.players[sid]={name:`Ш${i}`,fullName:name,price:cost,initialPrice:cost,position:pos,club,games:games[i]||[]};live.clubs[club]=CAL;};
 DRAFT_PICKS.forEach((id,k)=>add(id,k,`D${k}`,POS[Math.floor(k/8)],mean[k]??30,price[k]??1500,Math.floor(k/8)===9));
 Object.entries({F1:['PF',20,1500],...free}).forEach(([name,[pos,m,cost]],j)=>add(freeId(j),100+j,name,pos,m,cost,false));
 const sid=name=>players.find(p=>p.name===name).sportsId;
 for(let t=0;t<8;t++){const mine=DRAFT_PICKS.map((_,k)=>k).filter(k=>k%8===t);
  live.teams[t]={journal:mine.map(k=>({date:DRAFT_DATE,buy:{name:`Ш${k}`,price:price[k]??1500},sell:null})),roster:mine.map(k=>({sportsId:`s${k}`,name:`Ш${k}`,price:price[k]??1500})),
   balance:bank[t]??0,transfersLeft:left[t]??3};}
 const t3=live.teams[3];
 t3.journal.push({date:'2026-10-21',sell:{name:'Ш51',price:price[51]??1500},buy:{name:live.players[sid('F1')].name,price:1500},seenAt:'2026-10-21T09:00:00Z',seenAfter:'2026-10-21T08:58:00Z',sellSid:'s51',buySid:sid('F1')});
 t3.roster=[...t3.roster.filter(r=>r.sportsId!=='s51'),{sportsId:sid('F1'),name:live.players[sid('F1')].name,price:1500}];
 return {db:{players},live};
}
// One notifier run for team 0 at `now`, the ESPN report fresh (fetched 30 minutes before): what it prints.
function notify({db,live},{now=NOW,watch=[],espn=null}={}){
 const dir=fs.mkdtempSync(path.join(tmp,'run-')),lp=path.join(dir,'live.json'),sp=path.join(dir,'state.json'),dp=path.join(dir,'db.json');
 fs.writeFileSync(lp,JSON.stringify({...live,espnInjuries:{fetchedAt:new Date(Date.parse(now)-30*60e3).toISOString(),injuries:[]}}));
 fs.writeFileSync(sp,JSON.stringify({sent:[],injuries:[],transfers:[],transferEvents:[],returns:[],unknown:[],watch}));fs.writeFileSync(dp,JSON.stringify(db));
 const env={...process.env,DB_PATH:dp,FAKE_NOW:now,FBL_TEAM:'0'};
 for(const k of Object.keys(env))if(/TELEGRAM/.test(k))delete env[k];
 if(espn){const ep=path.join(dir,'espn.json');fs.writeFileSync(ep,JSON.stringify(espn));env.ESPN_FIXTURE=ep;}
 return execFileSync(process.execPath,['--import',pre,NOTIFY,lp,sp],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
// The message that starts with `head` (each printed message ends with the "sent at" stamp).
const block=(out,head)=>{const i=out.indexOf(head);return i<0?null:out.slice(i,out.indexOf('Отправлено',i));};
const idOf=(db,name)=>db.players.find(p=>p.name===name).id;
const ctxOf=({db,live})=>({players:db.players,live,injuries:new Map(),today:'2026-10-21'});

// The package for team 0 (bank 0): its SF D32 or D40 for X (45 a game and 200 cheaper: the money for the rest), its C
// D64 for V and a PF (D48 or D56) for D51 (31 a game, one more), V and D51 100 dearer than the players they replace, so
// neither is a single swap. The rookie C D72 stays: no free rookie.
const scenario=v=>league({free:{X:['SF',45,1300],V:['C',v,1600],W:['C',32,1500]},mean:{51:31},price:{51:1600}});

test('a player bought in a package is judged by what he adds, not by the moves around him (R01, R02)',()=>{
 const l=scenario(33),out=notify(l,{watch:[idOf(l.db,'V')]});
 // D51 adds one point a game over the PF he replaces: the package is near-certain, his own edge a coin flip.
 const rival=block(out,'🔄 <b>4.');assert.ok(rival,out);
 assert.doesNotMatch(rival,/забирай D51|можно взять D51/);
 assert.match(rival,/🙅 <b>Тебе: ничего не делать<\/b>/);assert.match(rival,/Если всё же брать D51:/);
 const edge=confidencePercent(explainSwap(ctxOf(l),idOf(l.db,'D48'),idOf(l.db,'D51'),'season').confidence);
 assert.ok(edge<60,`edge ${edge}%`);assert.match(rival,new RegExp(`Уверенность ${edge}%, что с ним лучше, чем без него: сомнительно`));
 // V back from injury adds one point a game over W, who is free too: no "забирай" for a coin flip.
 assert.doesNotMatch(out,/V вернулся в строй/);
});
test('a confident edge still says "забирай", with the edge\'s own percent; at night with the transfer hours (R01, R03)',()=>{
 const l=scenario(40),out=notify(l,{watch:[idOf(l.db,'V')],now:NIGHT});
 const back=block(out,'✅ <b>V вернулся в строй</b>');assert.ok(back,out);
 assert.match(back,/🎯 <b>Тебе: забирай<\/b> · сделать с 08:00 МСК\n/);
 // The moves both packages make (X, D51) cancel: what is left is V instead of W.
 const edge=confidencePercent(explainSwap(ctxOf(l),idOf(l.db,'W'),idOf(l.db,'V'),'season').confidence);
 assert.ok(edge>=70&&edge<95,`edge ${edge}%`);assert.match(back,new RegExp(`Уверенность ${edge}%, что с ним лучше, чем без него: уверенно`));
 assert.match(out,/📈 <b>Отдельные усиления<\/b> · сделать с 08:00 МСК/);
 // In the hours the suffix is gone.
 assert.match(block(notify(l,{watch:[idOf(l.db,'V')]}),'✅ <b>V вернулся в строй</b>'),/🎯 <b>Тебе: забирай<\/b>\n/);
});
test('return heads carry the transfer-hours note; doubtful still sends nothing (R03, R23)',()=>{
 const when=' · сделать с 08:00 МСК',bars={sure:.7,maybe:.6,when};
 assert.equal(returnHead(.75,{...bars,now:true}),'🎯 <b>Тебе: забирай</b>'+when);
 assert.equal(returnHead(.65,bars),'🤔 <b>Тебе: можно брать, но не уверенно</b>'+when);
 assert.equal(returnHead(.55,bars),null);assert.equal(returnHead(.75,{sure:.7,maybe:.6}),'🎯 <b>Тебе: можно брать</b>');
});
test('a doubtful single swap is not offered as a buy, now or for next week (R02)',()=>{
 const one=notify(league({mean:{51:31},left:{0:1}})),rival=block(one,'🔄 <b>4.');
 assert.doesNotMatch(rival,/можно взять D51|забирай D51/);assert.match(rival,/🙅 <b>Тебе: ничего не делать<\/b>/);assert.match(rival,/Уверенность \d+%: сомнительно/);
 const none=block(notify(league({mean:{51:31},left:{0:0}})),'🔄 <b>4.');
 assert.match(none,/⛔ <b>Тебе: трансферы на неделе закончились<\/b>/);assert.doesNotMatch(none,/останется свободным/);
 // A sure one is still named for next week.
 assert.match(block(notify(league({mean:{51:40},left:{0:0}})),'🔄 <b>4.'),/Если D51 останется свободным, на новой неделе:/);
});
test('with no transfers left the summary lists no single upgrades and keeps their keys for the new week (R08)',()=>{
 const l=league({free:{X:['SF',45,1300],Y:['PG',40,1500]},left:{0:0}}),out=notify(l),x=idOf(l.db,'X');
 assert.doesNotMatch(out,/Отдельные усиления/);assert.doesNotMatch(out,new RegExp(`>${x}'`));
 // With transfers the same upgrade is news.
 assert.match(notify({...l,live:{...l.live,teams:{...l.live.teams,0:{...l.live.teams[0],transfersLeft:3}}}}),/Отдельные усиления/);
});
test('the race warning counts only rivals who can still transfer this week (R06)',()=>{
 // Every rival would buy X for its SF; only teams 3 (two FBL transfers left after its deal) and 7 still can.
 const all=notify(league({free:{X:['SF',45,1300]}}));assert.match(all,/⚠️ X по модели нужен ещё 7\sкомандам лиги/);
 const out=notify(league({free:{X:['SF',45,1300]},left:{1:0,2:0,4:0,5:0,6:0}}));
 assert.match(out,/⚠️ X по модели нужен ещё 2\sкомандам лиги/);
 assert.doesNotMatch(notify(league({free:{X:['SF',45,1300]},left:{1:0,2:0,3:0,4:0,5:0,6:0,7:0}})),/⚠️ X по модели нужен/);
});
test('a game Sports.ru lists as played with 0 points is scored from the ESPN box score, as in the app (R05)',()=>{
 // D51 played on opening night (20.10 US, 21.10 Moscow): Sports.ru has not counted it yet; ESPN has the final.
 const row={date:'2026-10-21',opponent:'К0',home:true,minutes:'30:00',points:0,played:true,price:1500};
 const l=league({mean:{51:31},games:{51:[row]}});
 const stats=['30','30','10','5','1','1','12-20','2-5','4-5','2','3'],labels=['MIN','PTS','REB','AST','STL','BLK','FG','3PT','FT','TO','PF'];
 const event={id:'401',date:'2026-10-20T23:00Z',status:{type:{state:'post',completed:true,shortDetail:'Final'}},
  competitions:[{competitors:[{homeAway:'home',score:'110',team:{abbreviation:'A51',shortDisplayName:'К51'}},{homeAway:'away',score:'100',team:{abbreviation:'A0',shortDisplayName:'К0'}}]}]};
 const summary={boxscore:{players:[{team:{abbreviation:'A51'},statistics:[{labels,athletes:[{athlete:{id:'5051',displayName:'D51'},stats}]}]}]}};
 const p=l.db.players.find(x=>x.name==='D51'),games=[{...eventInfo(event),points:liveGamePoints(summary,event)}];
 const app=perGame(p,withBoxScores(l.live,games,l.db.players).players.s51).value,raw=perGame(p,l.live.players.s51).value;
 assert.ok(app-raw>2,`${raw} → ${app}`);
 const out=notify(l,{espn:{scoreboard:{20261020:[event]},summary:{401:summary}}});
 assert.match(out,new RegExp(`<b>D51</b> · ${app.toFixed(1)} ФО/матч`));
 // ESPN unreachable: the rows as Sports.ru lists them, as the app does then.
 assert.match(notify(l),new RegExp(`<b>D51</b> · ${raw.toFixed(1)} ФО/матч`));
});
