import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fblFormula} from '../src/fbl-scoring.js';
import {parseSummary,dailyBlocks} from '../awards-bot/core.js';
import {dayImages,mediaGroup,imagePrompt,imageName,imagePoints,cost,generate,MODEL,QUALITY,SIZE} from '../awards-bot/images.js';

const golden=JSON.parse(readFileSync(new URL('./fixtures/fbl-formula-golden.json',import.meta.url),'utf8')).lines;
// The golden lines as an ESPN box score, every player held by league team 0: the pictures' numbers come from core.js.
function goldenDay(){
 const labels=['MIN','PTS','FG','FT','REB','AST','TO','STL','BLK','PF'];
 const athletes=golden.map((g,i)=>({athlete:{id:String(i+1),shortName:`P${i+1}. Golden`},
  stats:[String(g.minutes),String(g.pts),`${g.fgm}-${g.fga}`,`${g.ftm}-${g.fta}`,String(g.reb),String(g.ast),String(g.tov),String(g.stl),String(g.blk),String(g.pf)]}));
 const lines=parseSummary({boxscore:{players:[{team:{abbreviation:'DEN'},statistics:[{labels,athletes}]}]}},{id:'g1',tip:'2026-10-22T00:00Z'},'2026-10-21');
 return lines.map(l=>({...l,h:[0],b:[]}));
}
const who=(a,n)=>`RU ${n}`;

test('awards pictures: every number in a picture and its caption is the official formula of the line',()=>{
 const lines=goldenDay(),blocks=dailyBlocks(lines),albums=dayImages('2026-10-21',blocks,who);
 assert.deepEqual(albums.map(a=>a.kind),['hero','flop']);
 for(const a of albums)a.items.forEach((it,i)=>{
  const l=(a.kind==='hero'?blocks.heroes:blocks.flops)[i],g=golden[Number(l.a)-1];
  assert.equal(l.p,fblFormula(g));assert.equal(l.p,g.expected,g.name);
  assert.ok(it.prompt.includes(`"${imagePoints(g.expected)} FBL`)||it.prompt.includes(`${imagePoints(g.expected)} FBL"`),`${g.name}: ${it.prompt}`);
  assert.match(it.caption,new RegExp(`— <b>${String(g.expected).replace('-','−')}</b> ФО$`));
  assert.ok(it.prompt.includes(imageName(l)));
 });
});

test('awards pictures: the scenes, names, captions and references',()=>{
 const l={a:'7',n:'L. Dončić',c:'LAL',p:-3,h:[0,2]};
 assert.equal(imageName(l),'L. Doncic','diacritics dropped: the model writes plain Latin');
 assert.equal(imagePoints(-3),'-3');assert.equal(imagePoints(44),'44');
 assert.equal(imagePrompt('flop',l,0,'2026-10-21'),imagePrompt('flop',l,0,'2026-10-21'),'a day always gets the same scenes');
 const scene=p=>p.split('\n\n')[1].replace(/"[^"]*"|GOLD|SILVER|BRONZE/g,'');
 for(const kind of ['hero','flop'])for(const day of ['2026-10-21','2026-10-22','2026-11-05'])
  assert.equal(new Set([0,1,2].map(i=>scene(imagePrompt(kind,l,i,day)))).size,3,`${kind} ${day}: no scene twice in an album`);
 const p=imagePrompt('hero',{...l,p:51},0,'2026-10-21');
 assert.match(p,/God Bless America/);assert.match(p,/charcoal-grey/);assert.match(p,/GOLD/);assert.match(p,/"51 FBL"|51 FBL"/);
 assert.match(imagePrompt('hero',{...l,p:51},2,'2026-10-21'),/BRONZE/);
 const [hero,flop]=dayImages('2026-10-21',{heroes:[{...l,p:51}],flops:[l]},who);
 assert.equal(hero.items[0].ref,'approved');assert.equal(flop.items[0].ref,'check');
 assert.match(hero.items[0].caption,/^🥇 <b>RU L\. Dončić<\/b> · LAL \S+ — <b>51<\/b> ФО$/);
 assert.equal(flop.items[0].caption.startsWith('1. <b>'),true);
 assert.deepEqual(dayImages('2026-10-21',{heroes:[],flops:[]},who),[],'no lines, no pictures');
});

test('awards pictures: the album title goes on the first picture sent, files are attached by name',()=>{
 const g=mediaGroup('⭐ Герои дня',[{caption:'🥈 B',png:Buffer.from('b')},{caption:'🥉 C',png:Buffer.from('c')}],'hero');
 assert.deepEqual(g.media.map(m=>[m.media,m.caption,m.parse_mode]),[['attach://p0','<b>⭐ Герои дня</b>\n🥈 B','HTML'],['attach://p1','🥉 C','HTML']]);
 assert.deepEqual(g.files.map(f=>[f.field,f.name,String(f.bytes)]),[['p0','zak-onn-hero-1.png','b'],['p1','zak-onn-hero-2.png','c']]);
});

test('awards pictures: the price of a picture from the usage the API answers',()=>{
 // The trial picture of 22.10.2026: 271 text + 999 image tokens in, 439 image tokens out.
 const usage={input_tokens:1270,input_tokens_details:{image_tokens:999,text_tokens:271},output_tokens:439};
 assert.equal(cost(usage).toFixed(4),'0.0225');
 assert.equal(cost(null),0);
});

test('awards pictures: one edit request with the key, none tried again on an empty balance',async()=>{
 const png=Buffer.from('png'),calls=[];
 const ok=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}],usage:{output_tokens:1}}),{status:200});};
 const r=await generate({prompt:'P',photo:{bytes:Buffer.from('jpg'),name:'check.jpg'}},{key:'k',fetchImpl:ok});
 assert.equal(String(r.png),'png');assert.deepEqual(r.usage,{output_tokens:1});
 const {url,init}=calls[0],form=init.body;
 assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(init.headers.authorization,'Bearer k');
 assert.deepEqual([form.get('model'),form.get('quality'),form.get('size'),form.get('prompt')],[MODEL,QUALITY,SIZE,'P']);
 assert.equal(form.getAll('image[]').length,1);
 const bare=[];await generate({prompt:'P',photo:{bytes:Buffer.from('jpg'),name:'x.jpg'}},{fetchImpl:async(u,i)=>{bare.push(i);return ok(u,i);}});
 assert.deepEqual(bare[0].headers,{},'without a key the request goes out bare (a proxy adds it)');
 let broke=0;
 const empty=async()=>{broke++;return new Response(JSON.stringify({error:{type:'insufficient_quota',code:'credit_balance_exhausted',message:'no credits'}}),{status:429});};
 await assert.rejects(generate({prompt:'P',photo:{bytes:Buffer.from('j'),name:'x.jpg'}},{key:'k',fetchImpl:empty}),/429 no credits/);
 assert.equal(broke,1,'no retry on an empty balance');
});
