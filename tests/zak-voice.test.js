import test from 'node:test';
import assert from 'node:assert/strict';
import {remark,circumstances,joke,signature,HEADINGS,LINES,voiceFacts,voicePrompt,voiceLines,writeVoice,VOICE_SCHEMA} from '../scripts/zak-voice.mjs';
import {ClaudeError} from '../scripts/claude-text.mjs';
const flat=o=>Array.isArray(o)?o:Object.values(o).flatMap(flat);
test('Зак Онн speaks to the broken rule, harsher to a watched team, and always the same for one protocol',()=>{
 for(const seed of ['k1','k2','k3','k4','k5']){
  assert.ok(LINES.BREACH.time.includes(remark('violation',['time'],false,seed)));
  const many=remark('violation',['rookie','time'],false,seed);
  assert.ok(LINES.BREACH.rookie.some(l=>many.startsWith(l))&&LINES.BREACH_MANY.some(l=>many.endsWith(l)));
  const watched=remark('violation',['rookie','time'],true,seed);
  assert.ok(LINES.BREACH_WATCHED.some(l=>watched.endsWith(l))&&!LINES.BREACH_MANY.some(l=>watched.includes(l)));
  assert.ok(LINES.APPROVED_WATCHED.includes(remark('approved',[],true,seed)));
  assert.ok(LINES.CHECK_BY.time.includes(remark('check',['time'],false,seed)));
  assert.ok(LINES.CHECK_BY.unmarked.includes(remark('check',['unmarked'],false,seed)));
  assert.ok(LINES.CHECK.includes(remark('check',[],false,seed)));
 }
 assert.equal(remark('approved',[],false,'k2'),remark('approved',[],false,'k2'));
 assert.equal(signature('k3'),signature('k3'));assert.match(signature('k3'),/Зак Онн/);
 assert.equal(HEADINGS.violation,'⚖️ <b>ЗАК ОНН НЕДОВОЛЕН</b>');
});
test('circumstances: the week\'s last transfer first, then the bank, a big buy, a package, the first of the week',()=>{
 assert.ok(LINES.CONTEXT.lastTransfer.includes(circumstances({left:0,used:3,bank:50},'s')));
 assert.ok(LINES.CONTEXT.emptyBank.includes(circumstances({left:2,used:1,bank:50},'s')));
 assert.ok(LINES.CONTEXT.bigBuy.includes(circumstances({left:2,used:1,bank:900,maxPrice:2400},'s')));
 assert.ok(LINES.CONTEXT.package.includes(circumstances({left:1,used:2,bank:900,moves:2},'s')));
 assert.ok(LINES.CONTEXT.firstOfWeek.includes(circumstances({left:2,used:1,bank:900},'s')));
 assert.equal(circumstances({left:1,used:2,bank:900},'s'),null);
});
test('a joke now and then, and every line short enough for the photo caption',()=>{
 const told=['a','b','c','d','e','f','g','h'].map(joke).filter(Boolean);
 assert.ok(told.length>0&&told.length<8);for(const j of told)assert.ok(LINES.JOKES.includes(j));
 const all=flat(LINES);assert.ok(all.length>=130);for(const l of all)assert.ok(l.length<=100,l);
});

test('Claude writes his voice from the protocol\'s facts in words: the verdict, the rules, the case, never a player or money',()=>{
 const f=voiceFacts({kind:'violation',rules:['club','time'],watched:true,team:5,circumstance:'lastTransfer',joke:true});
 assert.equal(f.verdict,'нарушение регламента');assert.equal(f.case,'новое нарушение: дело открыто');
 assert.deepEqual(f.rules,['лимит клуба NBA: не больше 2 игроков одного клуба','время сделок: только с 08:00 до 22:00 по Москве']);
 assert.equal(f.team,'Texas 76 Citrus');assert.equal(f.gm,'Лемариус');assert.equal(f.secondLine,true);assert.equal(f.joke,true);
 assert.match(f.circumstance,/последний трансфер/);
 assert.equal(voiceFacts({kind:'violation',rules:['rookie'],standing:true,team:0}).case,'нарушение не устранено: команда уже нарушала, это рецидив');
 assert.match(voiceFacts({kind:'approved',fixed:['club'],team:0}).case,/устранено \(лимит клуба NBA\): дело закрыто/);
 const one=voiceFacts({kind:'check',rules:['unmarked'],team:7});
 assert.equal(one.secondLine,false);assert.equal(one.watched,null);assert.equal(one.circumstance,null);assert.match(one.rules[0],/нет решения лиги/);
 const {system,prompt}=voicePrompt(f);
 assert.match(system,/боевик 90-х/);assert.match(system,/God Bless America/);assert.match(system,/О наградах, ФО/);
 assert.match(prompt,/"gm": "Лемариус"/);assert.deepEqual(VOICE_SCHEMA.required,['remark','remark2','circumstance','joke','signature']);
});
test('his lines from Claude go out only when they keep to the facts and to the law',()=>{
 const f=voiceFacts({kind:'violation',rules:['club'],team:2,circumstance:'bigBuy',joke:true});
 const ok={remark:'Лимит клуба — 2. Зак Онн видит третьего.',remark2:'лишнее',circumstance:'Дорогая покупка. Чек приобщён.',joke:'Возражение отклонено.',signature:'Зак Онн. Закон не спит.'};
 assert.deepEqual(voiceLines(ok,f),{lines:['Лимит клуба — 2. Зак Онн видит третьего.',{extra:'Дорогая покупка. Чек приобщён.'},{extra:'Возражение отклонено.'}],signature:'Зак Онн. Закон не спит.'},
  'no second line where none is asked');
 assert.deepEqual(voiceLines({...ok,joke:''},{...f,joke:false,circumstance:null}).lines,['Лимит клуба — 2. Зак Онн видит третьего.']);
 const bad=x=>voiceLines({...ok,...x},f).error;
 assert.match(bad({remark:'Три трансфера за 5 минут.'}),/numbers not in the facts: 5/);
 assert.match(bad({joke:'Счёт 1-800-ЗАК-ОНН.'}),/numbers/);
 assert.match(bad({circumstance:'Наш MVP недели — не ты.'}),/not his business/);assert.match(bad({remark:'Твои ФО меня не волнуют.'}),/not his business/);
 assert.match(bad({remark:'Ладно, одобряю.'}),/approves a breach/);assert.match(bad({remark:''}),/no remark/);
 assert.match(bad({signature:'Ваш юрист.'}),/signature/);assert.match(bad({remark:'Закон. '.repeat(30)}),/too long/);
 assert.match(bad({remark:'**Закон**'}),/markup/);
 assert.equal(bad({remark:'Тёмные очки Зака Онна видят всё.'}),undefined,'his glasses are not fantasy points');
});
test('writeVoice: one more try after a broken answer, then the bank; a Claude error is the caller\'s',async()=>{
 const f=voiceFacts({kind:'approved',team:0}),good={remark:'Чисто. Пока.',remark2:'',circumstance:'',joke:'',signature:'Зак Онн. Порядок.'};
 const calls=[],answers=[{...good,remark:'Пять звёзд из 10.'},good];
 const write=async a=>{calls.push(a);return {data:answers.shift()};};
 assert.deepEqual(await writeVoice(f,{write,log:()=>{}}),{lines:['Чисто. Пока.'],signature:'Зак Онн. Порядок.'});
 assert.equal(calls.length,2);assert.equal(calls[0].schema,VOICE_SCHEMA);assert.match(calls[0].prompt,/Факты/);
 assert.equal(await writeVoice(f,{write:async()=>({data:{remark:'5'}}),log:()=>{}}),null);
 await assert.rejects(writeVoice(f,{write:async()=>{throw new ClaudeError('429 limit');}}),ClaudeError);
});
