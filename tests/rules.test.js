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
test('the first holder of a shared player is told by the time of the purchases, not by their order in the list',()=>{
 const byId=new Map([[1,{id:1,name:'Rookie',isRookie:true}],[2,{id:2,name:'Rookie2',isRookie:true}],[3,{id:3,name:'Shared'}],[8,{id:8,name:'P8'}],[9,{id:9,name:'P9'}]]);
 const rosters=[[1,3],...Array(6).fill([]),[2,3]];
 const buy=(team,out,seenAfter,seenAt,date='2026-10-20')=>({team,outId:out,inId:3,date,...(seenAt?{seenAt}:{}),...(seenAfter?{seenAfter}:{})});
 const run=transfers=>{const c=checkRules({rosters,byId,transfers,white:[1,2],today:'2026-10-20'});return [c[0],c[7]];},dup=c=>c.violations.find(v=>v.rule==='duplicate');
 // Team 7 bought him at 13:01, team 0 at 14:06 the same day; the list has team 0 first.
 let [c0,c7]=run([buy(0,9,'2026-10-20T11:05:00Z','2026-10-20T11:06:00Z'),buy(7,8,'2026-10-20T10:00:00Z','2026-10-20T10:01:00Z')]);
 assert.equal(dup(c0).certain,true);assert.match(dup(c0).text,/Shared уже в составе/);assert.equal(verdict(c0).kind,'violation');
 assert.equal(dup(c7),undefined);assert.equal(verdict(c7).kind,'approved');
 // Without seenAfter a purchase is taken as made in the two minutes before seenAt: 13:58–14:00 is before 14:00–14:05.
 [c0,c7]=run([buy(0,9,'2026-10-20T11:00:00Z','2026-10-20T11:05:00Z'),buy(7,8,null,'2026-10-20T11:00:00Z')]);
 assert.ok(dup(c0).certain&&!dup(c7));
 // Both inside one window: neither can be told first, both go to the lawyer's check.
 [c0,c7]=run([buy(0,9,'2026-10-20T11:00:00Z','2026-10-20T11:05:00Z'),buy(7,8,'2026-10-20T11:02:00Z','2026-10-20T11:03:00Z')]);
 for(const c of [c0,c7]){const v=dup(c);assert.equal(v.certain,false);assert.match(v.text,/в одно время.*кто купил первым, сверьте на Sports\.ru/);
  assert.equal(verdict(c).kind,'check');assert.deepEqual(verdict(c).doubts,[v]);}
 // Overlapping windows on different dates: the earlier date is first.
 [c0,c7]=run([buy(0,9,'2026-10-20T18:00:00Z','2026-10-21T06:00:00Z','2026-10-21'),buy(7,8,'2026-10-20T18:30:00Z','2026-10-20T18:31:00Z')]);
 assert.ok(dup(c0).certain&&!dup(c7));
 // A purchase the watcher did not time: the list order decides.
 [c0,c7]=run([buy(7,8),buy(0,9,'2026-10-20T11:05:00Z','2026-10-20T11:06:00Z')]);
 assert.ok(dup(c0).certain&&!dup(c7));
 [c0,c7]=run([buy(0,9),buy(7,8)]);
 assert.ok(dup(c7).certain&&!dup(c0));
 // Team 7's holding since the draft survives its sale and buy-back on the day team 0 bought him in between.
 [c0,c7]=run([{team:7,outId:3,inId:8,date:'2026-10-20',seenAfter:'2026-10-20T09:00:00Z',seenAt:'2026-10-20T09:01:00Z'},buy(0,9,'2026-10-20T10:00:00Z','2026-10-20T10:01:00Z'),
  {team:7,outId:8,inId:3,date:'2026-10-20',seenAfter:'2026-10-20T11:00:00Z',seenAt:'2026-10-20T11:01:00Z'}]);
 assert.ok(dup(c0).certain&&!dup(c7));
});
test('every violation carries a stable identity: the rule and what it is about',()=>{
 const p=(id,club,extra={})=>({id,name:'P'+id,sportsClub:club,...extra});
 const byId=new Map([p(1,'A'),p(2,'A'),p(3,'A'),p(4,'B'),p(5,'C')].map(x=>[x.id,x]));
 const night=x=>({team:0,outId:9,inId:5,date:'2026-10-27',seenAfter:'2026-10-27T20:13:00Z',seenAt:'2026-10-27T20:14:00Z',...x});
 // Team 0 bought 4, whom team 1 holds since the draft, and made four night transfers: a week over the limit.
 const transfers=[{team:0,outId:7,inId:4,date:'2026-10-27'},night(),...[1,2,3].map(n=>night({outId:10+n,inId:20+n}))];
 const [c]=checkRules({rosters:[[1,2,3,4,5],[4],...Array(6).fill([])],byId,transfers,white:['none:0'],today:'2026-10-27'});
 assert.deepEqual(c.violations.map(v=>v.vid),['rookie','white','club:A','time:9>5:2026-10-27','time:11>21:2026-10-27','time:12>22:2026-10-27','time:13>23:2026-10-27','dup:4','transfers:2026-10-26']);
 for(const v of c.violations.filter(v=>v.rule==='time'))assert.equal(v.vid,`time:${v.transfer}`);
 const sold=checkRules({rosters:[[5],...Array(7).fill([])],byId,transfers:[{team:0,outId:3,inId:5,date:'2026-10-27'}],white:[3],today:'2026-10-27'})[0];
 assert.deepEqual(sold.violations.map(v=>[v.rule,v.vid]),[['rookie','rookie'],['white','white']]);
});
