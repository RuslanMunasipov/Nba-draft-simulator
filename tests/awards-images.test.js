import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fblFormula} from '../src/fbl-scoring.js';
import {parseSummary,dailyBlocks} from '../awards-bot/core.js';
import {dayPictures,blockCast,imageName,pictureTeam,SIZE,momentFacts,momentProblems,writeMoments,momentMessages,givenMoments} from '../awards-bot/images.js';
import * as images from '../awards-bot/images.js';

const golden=JSON.parse(fs.readFileSync(new URL('./fixtures/fbl-formula-golden.json',import.meta.url),'utf8')).lines;
// The golden lines as an ESPN box score, every player held by league team 0: the pictures' numbers come from core.js.
function goldenDay(){
 const labels=['MIN','PTS','FG','FT','REB','AST','TO','STL','BLK','PF'];
 const athletes=golden.map((g,i)=>({athlete:{id:String(i+1),shortName:`P${i+1}. Golden`},
  stats:[String(g.minutes),String(g.pts),`${g.fgm}-${g.fga}`,`${g.ftm}-${g.fta}`,String(g.reb),String(g.ast),String(g.tov),String(g.stl),String(g.blk),String(g.pf)]}));
 const lines=parseSummary({boxscore:{players:[{team:{abbreviation:'DEN'},statistics:[{labels,athletes}]}]}},{id:'g1',tip:'2026-10-22T00:00Z'},'2026-10-21');
 return lines.map(l=>({...l,h:[0],b:[]}));
}
const who=(a,n)=>`RU ${n}`;
// An assets folder with the logos of teams 1 and 4 (indexes 0 and 3), team 1's GM, and nothing for the others.
function assets(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assets-'));
 for(const [dir,file] of [['gm','1.jpg'],['team-logos','1.png'],['team-logos','4.png']]){fs.mkdirSync(path.join(root,dir),{recursive:true});fs.writeFileSync(path.join(root,dir,file),file);}
 return root;
}

// A picture as Claude wrote it, for dayPictures.
const written=(prompt='P',idea='an idea')=>({images:[],prompt,idea});

test('awards pictures: every number in a caption is the official formula of the line; the pictures are Claude\'s',()=>{
 const lines=goldenDay(),blocks=dailyBlocks(lines),pics=dayPictures(blocks,who,{written:{hero:written('H'),flop:written('F')}});
 assert.deepEqual(pics.map(p=>[p.kind,p.prompt]),[['hero','H'],['flop','F']],'two pictures a day, as Claude wrote them');
 for(const p of pics){
  const rows=p.kind==='hero'?blocks.heroes:blocks.flops;
  assert.deepEqual(p.players,rows.slice(0,3).map(l=>l.a));
  rows.slice(0,3).forEach((l,i)=>{const g=golden[Number(l.a)-1];
   assert.equal(l.p,fblFormula(g));assert.equal(l.p,g.expected,g.name);
   assert.match(p.caption.split('\n')[i+1],new RegExp(`— <b>${String(g.expected).replace('-','−')}</b> ФО$`));});
  assert.equal(p.size,SIZE);
 }
 const facts=momentFacts('hero',blocks.heroes);
 facts.players.forEach((x,i)=>assert.equal(x.fbl,Math.round(blocks.heroes[i].p),'the facts Claude gets: the formula\'s points'));
 assert.deepEqual(dayPictures(blocks,who,{written:{hero:written()}}).map(p=>p.kind),['hero'],'a picture Claude did not write is not drawn');
 assert.deepEqual(dayPictures(blocks,who),[]);
});

test('no picture of the code\'s own: no moments, kits, scenes or styles left',()=>{
 for(const name of ['moments','blockPicture','KITS','imagePoints'])assert.equal(images[name],undefined,name);
 const src=fs.readFileSync(new URL('../awards-bot/images.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/STYLE:|SCENE:|CENTRE \(|ГЕРОИ ДНЯ FBL'|towel over his head/);
});

const s0={pts:20,reb:5,ast:4,stl:1,blk:0,tov:2,fgm:8,fga:15,ftm:4,fta:5,pf:2};
const row=(a,p,h,s={})=>({a,n:`P${a}. Name`,c:'DEN',p,h,s:{...s0,...s}});

test('awards pictures: the references: each face given, each league team\'s logo once, the GM of the star; Зак Онн never',()=>{
 const root=assets(),rows=[row('1',51,[0,2]),row('2',40,[3]),row('3',38,[0])];
 assert.equal(pictureTeam(rows[0]),0,'a shared player: his first holder');
 const faces=new Map([['1',{bytes:Buffer.from('f1'),name:'1.png',type:'image/png'}],['3',{bytes:Buffer.from('f3'),name:'3.png',type:'image/png'}]]);
 const c=blockCast('hero',rows,{faces,root});
 assert.deepEqual(c.images.map(i=>i.name),['1.png','3.png','1.png','4.png','1.jpg']);
 assert.deepEqual(c.list.map(x=>x.is),['the ESPN headshot of the real NBA player P1. Name','the ESPN headshot of the real NBA player P3. Name',
  'the logo of the fantasy team of P1. Name and P3. Name','the logo of the fantasy team of P2. Name','the photo of the general manager (GM) who picked P1. Name']);
 assert.deepEqual(c.list.map(x=>x.mustUse||false),[true,true,false,false,false]);assert.equal(c.list[0].place,'centre');
 assert.equal(c.list[4].name,undefined,'the GM never named');
 assert.deepEqual(blockCast('hero',[row('9',30,[5])],{root}).images,[],'no files: drawn from the prompt alone');
 assert.ok(c.images.every(im=>!/zak|approved|check|violation/.test(im.name)),'no photo of Зак Онн');
});

test('awards pictures: captions, at most three players',()=>{
 const l={...row('7',51,[0,2]),n:'L. Dončić',c:'LAL'};
 assert.equal(imageName(l),'L. Doncic','diacritics dropped: the model writes plain Latin');
 const [hero,flop]=dayPictures({heroes:[l],flops:[{...l,p:-3}]},who,{written:{hero:written(),flop:written()}});
 assert.match(hero.caption,/^<b>⭐ Герои дня<\/b>\n🥇 <b>RU L\. Dončić<\/b> · LAL 🐎♠️ — <b>51<\/b> ФО$/);
 assert.match(flop.caption,/^<b>💩 Провалы дня<\/b>\n1\. <b>/);
 const rows=[1,2,3,4].map(i=>row(String(i),50-i,[0]));
 assert.deepEqual(dayPictures({heroes:rows,flops:[]},who,{written:{hero:written()}})[0].players,['1','2','3']);
});

const factsOf=()=>momentFacts('flop',[row('1',-12,[0],{fgm:3,fga:14,tov:6}),row('2',-3,[3],{pf:6})]);
const castOf=()=>blockCast('flop',[row('1',-12,[0],{fgm:3,fga:14,tov:6}),row('2',-3,[3],{pf:6})],{root:assets(),
 faces:new Map([['1',{bytes:Buffer.from('f1'),name:'1.png',type:'image/png'}],['2',{bytes:Buffer.from('f2'),name:'2.png',type:'image/png'}]])});
const good='A dusty construction site at golden hour, shot like a glossy home-improvement commercial: the real NBA player from reference image 1, his face exactly as in the photo, lays bricks into a crooked wall with a trowel, his sign nailed to it reading "11 КИРПИЧЕЙ. ПРОРАБ ГОДА"; the player from reference image 2, face exactly as in the photo, poses in a sash of referee whistles, his sign at his feet reading "-3 ФО. ЗАТО 6 ФОЛОВ". Both in the colours of their fantasy teams, the logos from reference image 3 and reference image 4 on their chests. The Russian words drawn letter by letter in Cyrillic; no other text. Wide 24mm, warm haze, square frame.';

test('awards pictures: Claude\'s prompt is checked: his players\' faces in it, their own numbers only, nothing forbidden',()=>{
 const facts=factsOf(),c=castOf();
 assert.equal(facts.players[0].gm,'Franky Murder','the GM as the league writes him, for a sign');assert.equal(facts.players[0].fbl,-12);assert.equal(facts.players[0].game.fgMissed,11);
 assert.equal(facts.players[0].kitColors,'black, red and gold');
 assert.deepEqual(momentProblems(good,facts,c),[]);
 const bad=prompt=>momentProblems(prompt,facts,c).join();
 assert.match(bad(good.replace('"11 КИРПИЧЕЙ','"13 КИРПИЧЕЙ')),/numbers in quotes not in the facts: 13/);
 assert.match(bad(good.replace('"11 КИРПИЧЕЙ','"ТРИНАДЦАТЬ КИРПИЧЕЙ')),/numbers in words not in the lines: 13/,'numbers in words too');
 assert.match(bad(good.replace('the player from reference image 2','a man')),/reference image 2 \(the ESPN headshot.*\) not used/);
 assert.deepEqual(momentProblems(good+' The general manager from reference image 5 despairs in the back.',facts,c),[],'the star\'s GM has a photo');
 assert.match(bad(good.replace('with a trowel','with a knife')),/off limits: knife/);
 assert.match(bad(good.replace('construction site','courtroom')),/forbidden: courtroom/,'the law stays out of the awards');
 assert.match(bad(good+' Zak Onn watches.'),/forbidden: zak/i,'Зак Онн never appears in the awards');
 assert.deepEqual(momentProblems(good+' No lawyers, judges or courtrooms.',facts,c),[],'a note of what is not there');
 assert.deepEqual(momentProblems(good.replace('ПРОРАБ ГОДА','СПАСИБО GM STRAP ONN'),facts,c),[],'GM Strap Onn on a sign is not Зак Онн');
 assert.match(bad(good+' Franky Murder despairs.'),/names outside the quotes: Franky Murder/);
 const m=momentMessages(facts,['old idea']);
 assert.match(m,/^Картинка: the flops of the day\.\nНедавние идеи, не повторяй:\n- old idea\nДанные:/);
});

test('awards pictures: Claude writes the picture, a refused one goes back to him, then none; his prompt goes as written',async()=>{
 const facts=factsOf(),c=castOf(),calls=[];
 const answers=[{prompt:good.replace('"11 КИРПИЧЕЙ','"99 КИРПИЧЕЙ'),idea:'x'},{prompt:good,idea:'a construction site'}];
 const w=await writeMoments(facts,c,{claude:async a=>{calls.push(a);return {data:answers.shift()};}});
 assert.equal(calls.length,2,'a refused answer is sent back');assert.match(calls[1].prompt,/numbers in quotes not in the facts: 99/);
 assert.match(calls[0].system,/жёсткий баскетбольный стёб/);assert.match(calls[0].system,/How you write the picture's prompt/);
 assert.equal(w.prompt,good);assert.equal(w.idea,'a construction site');assert.deepEqual(w.images.map(i=>i.name),['1.png','2.png','1.png','4.png']);
 assert.equal(await writeMoments(facts,c,{claude:async()=>({data:{prompt:'x',idea:''}})}),null,'no picture of the code\'s');
 const rows=[row('1',-12,[0],{fgm:3,fga:14,tov:6}),row('2',-3,[3],{pf:6})];
 const [p]=dayPictures({heroes:[],flops:rows},who,{written:{flop:w}});
 assert.equal(p.prompt,good);assert.deepEqual(p.ideas,['a construction site'],'kept so that the next days do not repeat them');
 assert.equal(givenMoments({prompt:good,idea:'i'},facts,c).prompt,good,'a prompt given by hand, checked like his');
 assert.equal(givenMoments({prompt:'x'},facts,c),null);
});
