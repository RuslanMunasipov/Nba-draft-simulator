import test from 'node:test';import assert from 'node:assert/strict';
import {fblWeek,fblTransfers,checkRules,verdict,appeal,LAWYER} from '../src/rules.js';

test('the first FBL week runs from the draft to Sunday 25.10, then Monday to Sunday',()=>{
 assert.deepEqual(fblWeek('2026-10-18'),{start:'2026-10-18',end:'2026-10-25'});
 assert.deepEqual(fblWeek('2026-10-25'),{start:'2026-10-18',end:'2026-10-25'});
 assert.deepEqual(fblWeek('2026-10-26'),{start:'2026-10-26',end:'2026-11-01'});
 assert.deepEqual(fblWeek('2026-11-01'),{start:'2026-10-26',end:'2026-11-01'});
});
test('pre-season transfers are free; from the first game the FBL week counts three',async()=>{
 const {isFreeTransfer}=await import('../src/rules.js');
 // 18–20.10 Sports.ru showed ∞ transfers: nothing counts, whatever the number.
 const pre=[{team:7,date:'2026-10-18'},{team:7,date:'2026-10-19'},{team:7,date:'2026-10-19'},{team:7,date:'2026-10-20'}];
 assert.equal(fblTransfers(pre,7,'2026-10-20').left,3);assert.deepEqual(fblTransfers(pre,7,'2026-10-20').over,[]);
 // The first-round deadline (20.10, 21:30 Moscow) ends the pre-season, to the minute the watcher saw the transfer.
 assert.ok(isFreeTransfer({team:0,date:'2026-10-20',seenAt:'2026-10-20T18:29:00Z'}));assert.ok(!isFreeTransfer({team:0,date:'2026-10-20',seenAt:'2026-10-20T18:31:00Z'}));
 assert.ok(isFreeTransfer({team:0,date:'2026-10-20'}));assert.ok(!isFreeTransfer({team:0,date:'2026-10-21'}));
 const t=[...pre,{team:7,date:'2026-10-21'},{team:7,date:'2026-10-22'},{team:6,date:'2026-10-22'}];
 assert.equal(fblTransfers(t,7,'2026-10-22').left,1);assert.equal(fblTransfers(t,6,'2026-10-22').left,2);
 assert.equal(fblTransfers(t,7,'2026-10-22').resetOn,'2026-10-26');assert.equal(fblTransfers(t,7,'2026-10-26').left,3);
 assert.deepEqual(fblTransfers([...t,{team:7,date:'2026-10-23'},{team:7,date:'2026-10-24'}],7,'2026-10-24').over,[{start:'2026-10-18',end:'2026-10-25',count:4,certain:true,atDeadline:[]}]);
});
test('a deal whose time window crosses the 21:30 pre-season deadline may have been free: the limit is checked, not breached',async()=>{
 const {freeState,verdict}=await import('../src/rules.js');
 assert.equal(freeState({date:'2026-10-20',seenAfter:'2026-10-20T18:29:00Z',seenAt:'2026-10-20T18:30:40Z'}),'doubt');
 assert.equal(freeState({date:'2026-10-20',seenAfter:'2026-10-20T18:30:10Z',seenAt:'2026-10-20T18:31:00Z'}),'counted');
 assert.equal(freeState({date:'2026-10-20',seenAfter:'2026-10-20T18:28:00Z',seenAt:'2026-10-20T18:29:30Z'}),'free');
 const at=(seenAfter,seenAt)=>({team:0,date:'2026-10-20',outId:1,inId:2,seenAfter,seenAt});
 const four=[at('2026-10-20T18:29:00Z','2026-10-20T18:30:40Z'),...[1,2,3].map(m=>at(`2026-10-20T18:3${m}:00Z`,`2026-10-20T18:3${m+1}:00Z`))];
 const [w]=fblTransfers(four,0,'2026-10-20').over;
 assert.equal(w.count,4);assert.equal(w.certain,false);assert.equal(w.atDeadline.length,1);
 const byId=new Map([[1,{id:1,name:'A',isRookie:true}],[2,{id:2,name:'B',isRookie:true}]]);
 const c=checkRules({rosters:[[2],...Array(7).fill([])],byId,transfers:four,white:[2],today:'2026-10-20'})[0];
 const v=c.violations.find(v=>v.rule==='transfers');
 assert.equal(v.certain,false);assert.match(v.text,/у дедлайна 21:30/);assert.equal(verdict(c).kind,'check');
 // Four deals all after the deadline: a breach.
 const late=[1,2,3,4].map(m=>at(`2026-10-20T18:3${m}:00Z`,`2026-10-20T18:3${m+1}:00Z`));
 assert.equal(verdict(checkRules({rosters:[[2],...Array(7).fill([])],byId,transfers:late,white:[2],today:'2026-10-20'})[0]).kind,'violation');
});
test('missing rookie, white player or a third player of a club is a breach with an appeal to the league lawyer',()=>{
 const p=(id,club,extra={})=>({id,name:'P'+id,sportsClub:club,...extra});
 const byId=new Map([p(1,'A',{isRookie:true}),p(2,'A'),p(3,'B'),p(4,'A'),p(5,'C')].map(x=>[x.id,x]));
 const rosters=[[1,2,3],[2,4,5],...Array(6).fill([])];
 // The league found that team 1 has nobody counting for the white rule.
 const checks=checkRules({rosters,byId,white:[3,'none:1'],today:'2026-10-20'});
 assert.deepEqual(checks[0].violations,[]);assert.equal(checks[0].whiteState,'ok');
 assert.deepEqual(checks[1].violations.map(v=>v.rule),['rookie','white']);
 const third=checkRules({rosters:[[1,2,4,3],...Array(7).fill([])],byId,white:[3],today:'2026-10-20'})[0];
 assert.deepEqual(third.violations.map(v=>v.rule),['club']);
 const text=appeal(checks[1],'2026-10-20');
 assert.ok(text.startsWith(`Уважаемый ${LAWYER.name}!`));assert.match(text,/нет ни одного новичка/);assert.match(text,/белому правилу/);
 // A team nobody marked yet is not a breach: one marked player per team is enough.
 const fresh=checkRules({rosters,byId,white:[3],today:'2026-10-20'})[1];
 assert.equal(fresh.whiteState,'unmarked');assert.ok(!fresh.violations.some(v=>v.rule==='white'));
});
test('selling the only marked white-rule player is reported with who came in',()=>{
 const byId=new Map([[1,{id:1,name:'Rookie',isRookie:true}],[3,{id:3,name:'Marked'}],[6,{id:6,name:'Newcomer'}]]);
 const transfers=[{team:0,outId:3,inId:6,date:'2026-10-27'}];
 const c=checkRules({rosters:[[1,6],...Array(7).fill([])],byId,transfers,white:[3],today:'2026-10-27'})[0];
 assert.equal(c.whiteState,'sold');
 const v=c.violations.find(v=>v.rule==='white');assert.match(v.text,/продан Marked/);assert.match(v.text,/куплены: Newcomer/);
 // Marking the newcomer settles it.
 assert.equal(checkRules({rosters:[[1,6],...Array(7).fill([])],byId,transfers,white:[3,6],today:'2026-10-27'})[0].whiteState,'ok');
});
test('with every decision on record, a team decided without a counting player is a breach and an undecided one is listed',()=>{
 const byId=new Map([1,2,3,4].map(id=>[id,{id,name:'P'+id,isRookie:id===1}]));
 const rosters=[[1,2],[3,4],...Array(6).fill([])];
 const c=checkRules({rosters,byId,white:[2],checked:['1','2','3'],today:'2026-10-20'});
 assert.equal(c[0].whiteState,'ok');assert.deepEqual(c[0].undecided,[]);
 // Team 1: player 3 decided (not counting), player 4 undecided: not a breach yet, 4 is listed.
 assert.equal(c[1].whiteState,'unmarked');assert.deepEqual(c[1].undecided.map(p=>p.id),[4]);
 const full=checkRules({rosters,byId,white:[2],checked:['1','2','3','4'],today:'2026-10-20'})[1];
 assert.equal(full.whiteState,'none');assert.ok(full.violations.some(v=>v.rule==='white'));
});
test('verdict: an obvious breach summons the lawyer, a doubt asks for his check, otherwise he approves',()=>{
 const byId=new Map([[1,{id:1,name:'Rookie',isRookie:true}],[3,{id:3,name:'Marked'}],[6,{id:6,name:'Newcomer'}]]);
 const at=(rosters,o={})=>checkRules({rosters:[rosters,...Array(7).fill([])],byId,today:'2026-10-27',...o})[0];
 assert.equal(verdict(at([1,3],{white:[3]})).kind,'approved');
 // The only marked player sold, nobody else marked: the lawyer checks, it is not an obvious breach.
 const sold=verdict(at([1,6],{white:[3],transfers:[{team:0,outId:3,inId:6,date:'2026-10-27'}]}));
 assert.equal(sold.kind,'check');assert.equal(sold.doubts[0].rule,'white');
 // Players the league has not decided on, nobody marked: a check.
 const open=verdict(at([1,6],{white:[3],checked:[3]}));assert.equal(open.kind,'check');assert.ok(open.unmarked);
 // No rookie is obvious, whatever else is in doubt.
 const breach=verdict(at([6],{white:[3],transfers:[{team:0,outId:3,inId:6,date:'2026-10-27'}]}));
 assert.equal(breach.kind,'violation');assert.deepEqual(breach.breaches.map(v=>v.rule),['rookie']);
});
test('transfer hours: inside 08:00–22:00 Moscow is fine, outside is a breach, a window across the edge needs a check',async()=>{
 const {transferTime,timeLabel}=await import('../src/rules.js');
 // Moscow is UTC+3: 14:32 МСК is 11:32Z.
 assert.equal(transferTime({seenAt:'2026-10-20T11:32:00Z',seenAfter:'2026-10-20T11:31:00Z'}).state,'ok');
 assert.equal(transferTime({seenAt:'2026-10-20T20:14:00Z',seenAfter:'2026-10-20T20:13:00Z'}).state,'breach'); // 23:14
 assert.equal(transferTime({seenAt:'2026-10-21T04:30:00Z',seenAfter:'2026-10-21T04:29:00Z'}).state,'breach'); // 07:30
 assert.equal(transferTime({seenAt:'2026-10-20T19:00:00Z',seenAfter:'2026-10-20T18:59:00Z'}).state,'doubt'); // 22:00 sharp
 const edge=transferTime({seenAt:'2026-10-20T19:01:00Z',seenAfter:'2026-10-20T18:58:00Z'});
 assert.equal(edge.state,'doubt');assert.equal(timeLabel(edge),'между 21:58 и 22:01 (20.10)');
 // A watcher outage overnight: seen at 09:00 after a read at 21:00 — it may have been made at night.
 assert.equal(transferTime({seenAt:'2026-10-21T06:00:00Z',seenAfter:'2026-10-20T18:00:00Z'}).state,'doubt');
 // No seenAfter: the two minutes before seenAt.
 assert.equal(transferTime({seenAt:'2026-10-20T05:01:00Z'}).state,'doubt');assert.equal(transferTime({seenAt:'2026-10-20T05:03:00Z'}).state,'ok');
 assert.equal(transferTime({}).state,'unknown');assert.equal(timeLabel(transferTime({})),'не зафиксировано');
});
test('a night transfer is an obvious breach, one at the edge of the hours a check',()=>{
 const byId=new Map([[1,{id:1,name:'Rookie',isRookie:true}],[3,{id:3,name:'Marked'}],[6,{id:6,name:'Newcomer'}]]);
 const run=x=>checkRules({rosters:[[1,3,6],...Array(7).fill([])],byId,white:[3],today:'2026-10-20',transfers:[{team:0,outId:9,inId:6,date:'2026-10-20',...x}]})[0];
 const night=run({seenAt:'2026-10-20T20:14:00Z',seenAfter:'2026-10-20T20:13:00Z'});
 assert.equal(verdict(night).kind,'violation');assert.match(night.violations[0].text,/23:14 \(20\.10\) МСК — трансферы разрешены только с 08:00 до 22:00/);
 assert.equal(verdict(run({seenAt:'2026-10-20T19:01:00Z',seenAfter:'2026-10-20T18:58:00Z'})).kind,'check');
 assert.equal(verdict(run({seenAt:'2026-10-20T11:32:00Z',seenAfter:'2026-10-20T11:31:00Z'})).kind,'approved');
 assert.equal(verdict(run({})).kind,'approved');
});
test('a player another team already holds: the later buyer is in breach, the first holder is not',()=>{
 const byId=new Map([[1,{id:1,name:'Rookie',isRookie:true}],[2,{id:2,name:'Rookie2',isRookie:true}],[3,{id:3,name:'Shared'}],[4,{id:4,name:'Other'}]]);
 const rosters=[[1,3],[2,3],...Array(6).fill([])];
 const transfers=[{team:1,outId:4,inId:3,date:'2026-10-20'}];
 const checks=checkRules({rosters,byId,transfers,white:[1,2],today:'2026-10-20'});
 assert.ok(!checks[0].violations.some(v=>v.rule==='duplicate'));
 const dup=checks[1].violations.find(v=>v.rule==='duplicate');assert.match(dup.text,/Shared уже в составе/);
 assert.equal(verdict(checks[1]).kind,'violation');assert.match(dup.text,/только в одной команде/);
});
