import test from 'node:test';
import assert from 'node:assert/strict';
import {fblFormula} from '../src/fbl-scoring.js';
import {interviewFacts,interviewMessages,allowedNumbers,strayNumbers,validInterview,interviewText,interviewCaption,interviewPicture,writeInterview,interviewFor,copiedLines,SAMPLE_LINES} from '../awards-bot/mike-roffon.js';

const s={pts:45,reb:10,ast:3,stl:2,blk:1,tov:4,fgm:16,fga:29,ftm:4,fta:5,pf:1};
const line={d:'2026-10-21',e:'g1',a:'4594268',n:'A. Edwards',c:'MIN',t:'2026-10-22T00:00Z',m:36.4,p:fblFormula(s),h:[5],b:[],s};
const facts=interviewFacts('2026-10-21',line,(a,n)=>'Эдвардс',{opponent:'MIA'});
const good={title:'Когда темп мой — защита глохнет',prologue:'Он вышел и забрал вечер.',qa:[{q:'45 очков и 39 ФО. Чей это был вечер?',a:'Мой ритм.'},{q:'А четыре потери?',a:'Налог за агрессию.'},{q:'Завтра так же?',a:'Same energy, другой соперник.'}],
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

test('Mike Roffon: his voice is described, his old pieces are never quoted, and a repeated line is caught',()=>{
 const sys=interviewMessages(facts)[0].content;
 for(const l of SAMPLE_LINES)assert.ok(!sys.toLowerCase().replace(/ё/g,'е').includes(l.toLowerCase().replace(/ё/g,'е')),`the prompt quotes «${l}»`);
 assert.match(sys,/хлёсткий, жёсткий, ироничный/);
 assert.deepEqual(copiedLines(good),[]);
 assert.deepEqual(copiedLines({...good,remark:'«Спокойно и буднично» — так обычно и начинается самое интересное.'}),['спокойно и буднично','так обычно и начинается самое интересное']);
 assert.deepEqual(copiedLines({...good,qa:[...good.qa,{q:'Итог?',a:'Роль — важнее фамилии.'}]}),['роль важнее фамилии']);
 assert.deepEqual(copiedLines({...good,afterword:'Тихий пол, громкий потолок.'}),[],'single words are free');
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

test('Mike Roffon: at the arena, under the stands and at the press conference he is a sports reporter, never in a helmet',()=>{
 const seen=new Set();
 for(let d=1;d<=40;d++){
  const day=`2026-11-${String(d%30+1).padStart(2,'0')}`,p=interviewPicture({...facts,player:{...facts.player,en:`Player ${d}`}},day);
  const scene=p.prompt.match(/SCENE: a flash interview, ([^,:]+)/)[1];seen.add(scene);
  assert.match(p.prompt,/dressed as a sports reporter for this scene: [^.]*(suit|blazer|jacket|overcoat)/);
  assert.match(p.prompt,/his white gloves/);assert.match(p.prompt,/vintage chrome microphone/);
  assert.match(p.prompt,/No helmet, no military uniform, no camouflage, no PRESS or tactical vest\./);
  assert.doesNotMatch(p.prompt.replace(/No helmet, no military uniform, no camouflage, no PRESS or tactical vest\./,''),/helmet|camouflage|military|\bwar\b|BORN TO ASK|PRESS vest/i);
 }
 assert.ok([...seen].some(s=>/outside the arena/.test(s))&&[...seen].some(s=>/tunnel under the stands/.test(s))&&[...seen].some(s=>/press conference/.test(s)),[...seen].join(' / '));
});

test('Mike Roffon: written as JSON by the model, written again when it brings its own numbers, then dropped',async()=>{
 const reply=x=>async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(x)}}],usage:{prompt_tokens:1000,completion_tokens:500}}),{status:200});
 const {interview,usage}=await writeInterview(facts,{fetchImpl:reply(good)});assert.deepEqual(interview,good);assert.equal(usage.prompt_tokens,1000);
 let calls=0;const bad=async(...a)=>{calls++;return reply({...good,prologue:'Средние 28 очков.'})(...a);};
 const out=await interviewFor(facts,{fetchImpl:bad});assert.equal(out.interview,null);assert.equal(calls,2);
 let tries=0;const copyThenGood=async(...a)=>(tries++?reply(good):reply({...good,afterword:'Роль важнее фамилии.'}))(...a);
 assert.deepEqual((await interviewFor(facts,{fetchImpl:copyThenGood})).interview,good);assert.equal(tries,2);
 await assert.rejects(writeInterview(facts,{fetchImpl:reply({nope:1})}),/not an interview/);
});
