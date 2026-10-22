import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {interviewFacts,interviewMessages,allowedNumbers,strayNumbers,validInterview,interviewText,interviewCaption,interviewPicture,writeInterview,interviewFor} from '../awards-bot/mike-roffon.js';

const s={pts:45,reb:10,ast:3,stl:2,blk:1,tov:4,fgm:16,fga:29,ftm:4,fta:5,pf:1};
const line={d:'2026-10-21',e:'g1',a:'4594268',n:'A. Edwards',c:'MIN',t:'2026-10-22T00:00Z',m:36.4,p:fblFormula(s),h:[5],b:[],s};
const facts=interviewFacts('2026-10-21',line,(a,n)=>'Эдвардс',{opponent:'MIA'});
const good={title:'Когда темп мой — защита глохнет',prologue:'Он вышел и забрал вечер.',qa:[{q:'45 очков и 39 ФО. Чей это был вечер?',a:'Мой ритм.'},{q:'А четыре потери?',a:'Налог за агрессию.'},{q:'Завтра так же?',a:'Stability floor.'}],
 remark:'Налог, который платят только богатые.',afterword:'Он не позировал.'};

test('Mike Roffon: the facts carry the FBL points of the league formula and nothing else',()=>{
 assert.equal(facts.game.fo,39);assert.equal(facts.game.fo,fblFormula(s));
 assert.equal(facts.player.name,'Эдвардс');assert.equal(facts.player.opponent,'MIA');assert.equal(facts.fblTeams[0].team,'Texas 76 Citrus');
 const [sys,user]=interviewMessages(facts);
 assert.match(sys.content,/Майк Роффон/);assert.match(sys.content,/Используй только числа из данных/);assert.match(user.content,/"fo": 39/);
});

test('Mike Roffon: an interview with a number of its own is caught',()=>{
 assert.ok(allowedNumbers(facts).has('45'));assert.ok(allowedNumbers(facts).has('39'));
 assert.deepEqual(strayNumbers(good,facts),[]);
 assert.deepEqual(strayNumbers({...good,afterword:'Средние 28 очков за сезон.'},facts),['28']);
 assert.ok(validInterview(good));assert.equal(validInterview({...good,qa:[]}),false);
});

test('Mike Roffon: the interview as Telegram HTML, marked as fiction, with the hashtags',()=>{
 const t=interviewText({...good,title:'«Когда темп мой»'},facts);
 assert.match(t,/<b>🎙 Inside FBL • Флеш-интервью<\/b>\n<i>«Когда темп мой»<\/i>/,'one pair of quotes');
 assert.match(t,/<b>Майк Роффон\.<\/b> 45 очков и 39 ФО/);assert.match(t,/<b>Эдвардс\.<\/b> Мой ритм\./);
 assert.match(t,/<i>Майк Роффон: Налог, который платят только богатые\.<\/i>/);
 assert.match(t,/— Майк Роффон, специально для Inside FBL/);assert.match(t,/Интервью вымышленное/);
 assert.match(interviewCaption(facts,'2026-10-21'),/<b>39<\/b> ФО · герой дня 21 октября 2026\n\n#inside_fbl #интервью #дата_21_10_2026/);
});

test('Mike Roffon: his picture keeps his gloves and microphone, the real player and the league logo',()=>{
 const p=interviewPicture(facts,'2026-10-21');
 assert.equal(p.images.length,2);assert.match(p.prompt,/white gloves and a vintage chrome microphone, always/);
 assert.match(p.prompt,/the real NBA player A\. Edwards of the MIN/);assert.match(p.prompt,/INSIDE FBL/);assert.doesNotMatch(p.prompt,/undefined/);
});

test('Mike Roffon: written as JSON by the model, written again when it brings its own numbers, then dropped',async()=>{
 const reply=x=>async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(x)}}],usage:{prompt_tokens:1000,completion_tokens:500}}),{status:200});
 const {interview,usage}=await writeInterview(facts,{fetchImpl:reply(good)});assert.deepEqual(interview,good);assert.equal(usage.prompt_tokens,1000);
 let calls=0;const bad=async(...a)=>{calls++;return reply({...good,prologue:'Средние 28 очков.'})(...a);};
 const out=await interviewFor(facts,{fetchImpl:bad});assert.equal(out.interview,null);assert.equal(calls,2);
 await assert.rejects(writeInterview(facts,{fetchImpl:reply({nope:1})}),/not an interview/);
});
