import test from 'node:test';
import assert from 'node:assert/strict';
import {wordsMessages,patients,untranslated,translateNow,patientFacts,infirmaryFacts,wordsProblems,writeWords,infirmaryText,infirmaryCaption,pictureGroups,wardCast,INFIRMARY_DELAY_MS,PER_PICTURE,MAX_PICTURES} from '../awards-bot/trevor-matolog.js';
import {textKey} from '../src/translate.js';

const row=(id,name,status,{type='Knee',detail='Sprain',date='2026-10-24T01:00Z',comment=`${name} (knee) will miss 2 games.`,returnDate=null}={})=>
 ({athlete:{displayName:name,links:[{href:`https://www.espn.com/nba/player/_/id/${id}/x`}]},status,date,shortComment:comment,details:{type,detail,returnDate}});
const report={injuries:[{injuries:[row('1','Jayson Tatum','Out',{type:'Achilles',detail:'Surgery',returnDate:'2026-11-05'}),row('2','Cade Cunningham','Day-To-Day'),row('3','Free Agent','Out'),row('4','Joel Embiid','Out',{date:'2026-10-20T01:00Z'})]}]};
const rosters=[[{espnId:2,name:'C. Cunningham',team:'DET'}],[],[{espnId:'1',name:'J. Tatum',team:'BOS'},{espnId:4,name:'J. Embiid',team:'PHI'}],[{espnId:'2',team:'DET'}]];
const who=(a,n)=>({1:'Тейтум',2:'Каннингем',4:'Эмбиид'})[a]||n;

test('Infirmary: only the FBL rosters\' patients, by team, the most serious first; a shared player once with every team',()=>{
 const list=patients(report,rosters,who);
 assert.deepEqual(list.map(x=>[x.name,x.teams]),[['Каннингем',[0,3]],['Тейтум',[2]],['Эмбиид',[2]]]);
 assert.ok(!list.some(x=>x.en==='Free Agent'),'a free player is not the league\'s');
 assert.equal(INFIRMARY_DELAY_MS,20*60e3,'20 minutes after the flash interview');
});

test('Infirmary: ESPN\'s comment in Russian (the site\'s translation, else one written now), the facts of the report',async()=>{
 const list=patients(report,rosters,who),tr={texts:{[textKey('Jayson Tatum (knee) will miss 2 games.')]:{text:'Тейтум пропустит 2 матча.'}}};
 const todo=untranslated(list,tr);assert.deepEqual(todo.map(x=>x.story),['Cade Cunningham (knee) will miss 2 games.','Joel Embiid (knee) will miss 2 games.']);
 const ru={...Object.fromEntries(Object.entries(tr.texts).map(([k,v])=>[k,v.text])),...await translateNow(todo,{translate:async b=>Object.fromEntries(b.map(x=>[x.id,{story:'перевод '+x.story.split(' ')[1]}]))})};
 const f=list.map(x=>patientFacts(x,ru)),tatum=f.find(x=>x.en==='Jayson Tatum');
 assert.equal(tatum.comment,'Тейтум пропустит 2 матча.');assert.equal(tatum.status,'Не играет');assert.equal(tatum.until,'до ~05.11');
 assert.equal(tatum.where,'ахиллово сухожилие');assert.equal(tatum.what,'операция');assert.deepEqual(tatum.fblTeams,[{team:'Black Jacks',gm:'Jack Pott'}]);
 assert.equal(f[0].comment,'перевод Cunningham');
 assert.deepEqual(await translateNow(todo,{translate:async()=>{throw Error('429');},log:()=>{}}),{},'a failed batch leaves English');
 assert.ok(!('espnId' in infirmaryFacts(f).patients[0]),'the writers see no ids');
});

test('Infirmary: the report team by team with ESPN\'s comments, Trevor\'s words around it; an empty ward said so',()=>{
 const f=patients(report,rosters,who).map(x=>patientFacts(x,{}));
 const t=infirmaryText(f,{opener:'Тревор начинает обход.',afterword:'Держитесь, GM.',notes:{'Тейтум':'Ахилл <в бегах>.'}},'2026-10-23');
 assert.match(t,/^<b>🏥 Лазарет FBL<\/b> · 23 октября\n\nТревор начинает обход\.\n\n<b>The Balkan Murderers<\/b> \(GM Franky Murder\) · <b>Команда им\. Алачаняна А\.М\.<\/b>/);
 assert.match(t,/🔴 <b>Тейтум<\/b> \(BOS\) — не играет до ~05\.11 · ахиллово сухожилие, операция\n<i>ESPN, 24\.10: Jayson Tatum \(knee\) will miss 2 games\.<\/i>\n🥃 Ахилл &lt;в бегах&gt;\.\n/,'ESPN\'s lines untouched, his own line under them');
 assert.match(t,/🟡 <b>Каннингем<\/b>/);assert.match(t,/Держитесь, GM\.\n\n— Тревор Матолог, травматолог лиги FBL\n\n#лазарет #травмы #дата_23_10_2026$/);
 assert.ok(t.indexOf('Тейтум')<t.indexOf('Эмбиид'));
 assert.match(infirmaryText([],null,'2026-10-23'),/Палаты пусты: в составах FBL травмированных нет\.\n\n— Тревор Матолог/);assert.match(infirmaryCaption(f,'2026-10-23'),/3 в палатах/);
 assert.ok(!infirmaryText(f,null,'2026-10-23').includes('undefined'),'without Trevor\'s words the list goes alone');
});

test('Infirmary: Trevor\'s words only with the facts\' numbers, no stale themes, rewritten once with what was wrong',async()=>{
 const facts=infirmaryFacts(patients(report,rosters,who).map(x=>patientFacts(x,{})));
 assert.deepEqual(wordsProblems({opener:'Тейтум выбыл до ~05.11.',notes:[{name:'Тейтум',note:'Ахилл *ик* ушёл в параллельную вселенную.'}],afterword:'Black Jacks дышат через раз.'},facts),[]);
 assert.match(wordsProblems({opener:'Минус 40 очков у GM.',notes:[],afterword:'.'},facts).join(),/числа не из данных \(40\)/);
 assert.match(wordsProblems({opener:'.',notes:[{name:'Тейтум',note:'Выбыл на 9 недель.'}],afterword:'.'},facts).join(),/числа не из данных \(9\)/,'his lines checked too');
 assert.match(wordsProblems({opener:'.',notes:[{name:'Леброн',note:'Бред.'}],afterword:'.'},facts).join(),/реплики о тех, кого нет в данных \(Леброн\)/);
 assert.match(wordsProblems({opener:'*ик* *ик*',notes:[{name:'Тейтум',note:'*ик* *ик*'}],afterword:'.'},facts).join(),/\*ик\* 4 раз/);
 assert.deepEqual(wordsProblems({opener:'.',afterword:'.'},facts),['не по схеме']);
 assert.match(wordsProblems({opener:'.',notes:[{name:'Тейтум',note:'Ахилл, не играет. Заговор сухожилий.'}],afterword:'.'},facts).join(),/реплики повторяют статус \(Тейтум\)/,'straight into the nonsense');
 assert.deepEqual(wordsProblems({opener:'.',notes:[{name:'Тейтум',note:'А знаешь, почему ты травмирован? Да потому что ахилл ушёл к другому.'}],afterword:'.'},facts),[]);
 assert.match(wordsProblems({opener:'Урожай травм.',notes:[],afterword:'.'},facts).join(),/чужая тема/);
 const seen=[];const claude=async o=>{seen.push(o.prompt);return {data:seen.length===1?{opener:'Минус 40.',notes:[],afterword:'.'}:{opener:'Лазарет полон.',notes:[{name:'Эмбиид',note:' Колено в отпуске. '}],afterword:'Держитесь.'}};};
 assert.deepEqual(await writeWords(facts,{claude,log:()=>{}}),{opener:'Лазарет полон.',afterword:'Держитесь.',notes:{'Эмбиид':'Колено в отпуске.'}});
 assert.match(seen[1],/Прошлый вариант отклонён: числа не из данных/);
 const m=wordsMessages(facts);assert.match(m.system,/Тревор Матолог/);assert.match(m.system,/Данные ESPN неприкосновенны/);assert.doesNotMatch(m.system+m.prompt,/Майк|Inside FBL/,'Trevor\'s own voice');assert.ok(!seen[0].includes('2026-10'),'no date for the writer');
});

test('Infirmary: the pictures, a few patients each, at most two; Trevor and each patient\'s face as references',()=>{
 const many=Array.from({length:11},(_,i)=>({espnId:String(i),en:`P${i}`,out:true,bodyPartEn:'Knee',injuryEn:'Sprain',fblTeams:[]}));
 const g=pictureGroups(many);assert.equal(g.length,MAX_PICTURES);assert.equal(g[0].length,PER_PICTURE);assert.equal(g[1][0].en,`P${PER_PICTURE}`);
 assert.deepEqual(pictureGroups([]),[]);
 const face={bytes:Buffer.from('x'),name:'f.png',type:'image/png'};
 const c=wardCast(g[0],new Map([['0',face],['2',face]]));
 assert.equal(c.images.length,3,'Trevor and the two patients with a face');assert.match(c.refs[0].is,/Trevor Matolog/);assert.deepEqual(c.refs[0].say,['neck brace','cast']);assert.match(c.refs[1].is,/P0/);assert.equal(c.list[1].injury,'Knee, Sprain');
});

test('Trevor\'s introduction: one Telegram message, his signature, balanced tags',async()=>{
 const t=(await import('node:fs')).readFileSync(new URL('../data/trevor/hello.html',import.meta.url),'utf8').trim();
 assert.ok(t.length<4096,'one message');assert.match(t,/<i>— Тревор Матолог, травматолог лиги FBL<\/i>\n\n#лазарет #травмы$/);
 for(const tag of ['b','i'])assert.equal((t.match(new RegExp(`<${tag}>`,'g'))||[]).length,(t.match(new RegExp(`</${tag}>`,'g'))||[]).length,tag);
 assert.ok(!/[<>](?!\/?[bi]>)/.test(t.replace(/<\/?[bi]>/g,'')),'no stray brackets for Telegram HTML');
});
