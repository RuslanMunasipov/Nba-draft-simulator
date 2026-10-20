import test from 'node:test';import assert from 'node:assert/strict';
import {fblWeek,fblTransfers,checkRules,verdict,appeal,LAWYER} from '../src/rules.js';

test('the first FBL week runs from the draft to Sunday 25.10, then Monday to Sunday',()=>{
 assert.deepEqual(fblWeek('2026-10-18'),{start:'2026-10-18',end:'2026-10-25'});
 assert.deepEqual(fblWeek('2026-10-25'),{start:'2026-10-18',end:'2026-10-25'});
 assert.deepEqual(fblWeek('2026-10-26'),{start:'2026-10-26',end:'2026-11-01'});
 assert.deepEqual(fblWeek('2026-11-01'),{start:'2026-10-26',end:'2026-11-01'});
});
test('pre-season transfers count against the first week (School Shooters 0/3, Karagali 1/3 on 20.10)',()=>{
 const t=[{team:7,date:'2026-10-18'},{team:7,date:'2026-10-19'},{team:7,date:'2026-10-19'},{team:6,date:'2026-10-19'},{team:6,date:'2026-10-19'}];
 assert.equal(fblTransfers(t,7,'2026-10-20').left,0);assert.equal(fblTransfers(t,6,'2026-10-20').left,1);
 assert.equal(fblTransfers(t,7,'2026-10-20').resetOn,'2026-10-26');assert.equal(fblTransfers(t,7,'2026-10-26').left,3);
 assert.deepEqual(fblTransfers([...t,{team:7,date:'2026-10-24'}],7,'2026-10-24').over,[{start:'2026-10-18',end:'2026-10-25',count:4}]);
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
