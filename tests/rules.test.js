import test from 'node:test';import assert from 'node:assert/strict';
import {fblWeek,fblTransfers,checkRules,appeal,LAWYER} from '../src/rules.js';

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
 const checks=checkRules({rosters,byId,white:[3],today:'2026-10-20'});
 assert.deepEqual(checks[0].violations,[]);
 assert.deepEqual(checks[1].violations.map(v=>v.rule),['rookie','white']);
 const third=checkRules({rosters:[[1,2,4,3],...Array(7).fill([])],byId,white:[3],today:'2026-10-20'})[0];
 assert.deepEqual(third.violations.map(v=>v.rule),['club']);
 const text=appeal(checks[1],'2026-10-20');
 assert.ok(text.startsWith(`Уважаемый ${LAWYER.name}!`));assert.match(text,/нет ни одного новичка/);assert.match(text,/белому правилу/);
 // An empty league list means the rule is not checked, never that everyone breaks it.
 assert.ok(!checkRules({rosters,byId,white:[],today:'2026-10-20'})[1].violations.some(v=>v.rule==='white'));
});
