import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fblFormula} from '../src/fbl-scoring.js';
import {parseSummary,dailyBlocks} from '../awards-bot/core.js';
import {dayPictures,blockPicture,moments,imageName,imagePoints,pictureTeam,KITS,SIZE} from '../awards-bot/images.js';

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

test('awards pictures: every number in a picture and its caption is the official formula of the line',()=>{
 const lines=goldenDay(),blocks=dailyBlocks(lines),pics=dayPictures(blocks,who);
 assert.deepEqual(pics.map(p=>p.kind),['hero','flop'],'two pictures a day: the heroes, the flops');
 for(const p of pics){
  const rows=p.kind==='hero'?blocks.heroes:blocks.flops;
  assert.deepEqual(p.players,rows.slice(0,3).map(l=>l.a));
  rows.slice(0,3).forEach((l,i)=>{const g=golden[Number(l.a)-1];
   assert.equal(l.p,fblFormula(g));assert.equal(l.p,g.expected,g.name);
   assert.match(p.caption.split('\n')[i+1],new RegExp(`— <b>${String(g.expected).replace('-','−')}</b> ФО$`));
   assert.ok(p.prompt.includes(imageName(l)));});
  for(const n of p.prompt.matchAll(/"(-?\d+) FBL"/g))assert.ok(rows.some(l=>imagePoints(l.p)===n[1]),`${n[0]}: a line's FBL points`);
  assert.equal(p.size,SIZE);
 }
});

test('awards pictures: Зак Онн is the law and never appears in the awards',()=>{
 for(const p of dayPictures(dailyBlocks(goldenDay()),who,{root:assets()})){
  assert.doesNotMatch(p.prompt,/Zak|Onn|God Bless America|lawyer|judge/i);
  assert.ok(p.images.every(im=>!/zak|approved|check|violation/.test(im.name)),'no photo of his among the references');
 }
});

const s0={pts:20,reb:5,ast:4,stl:1,blk:0,tov:2,fgm:8,fga:15,ftm:4,fta:5,pf:2};
const row=(a,p,h,s={})=>({a,n:`P${a}. Name`,c:'DEN',p,h,s:{...s0,...s}});

test('awards pictures: the first of the block in the centre, each player in his league team\'s kit and logo',()=>{
 const root=assets(),rows=[row('1',51,[0,2]),row('2',40,[3]),row('3',38,[0])];
 assert.equal(pictureTeam(rows[0]),0,'a shared player: his first holder');
 const faces=new Map([['1',{bytes:Buffer.from('f1'),name:'1.png',type:'image/png'}],['3',{bytes:Buffer.from('f3'),name:'3.png',type:'image/png'}]]);
 const p=blockPicture('hero',rows,{faces,root});
 assert.deepEqual(p.images.map(i=>i.name),['1.png','3.png','1.png','4.png'],'the faces given, then each team\'s logo once');
 assert.match(p.prompt,/reference image 1 is the face of P1\. Name; reference image 2 is the face of P3\. Name; reference image 3 is the logo of the fantasy team of P1\. Name and P3\. Name; reference image 4 is the logo of the fantasy team of P2\. Name\./);
 const part=k=>p.prompt.split('\n\n').find(x=>x.startsWith(k));
 assert.match(part('CENTRE'),/P1\. Name of the DEN, his face exactly as in reference image 1/);
 assert.ok(part('CENTRE').includes(KITS[0]));assert.match(part('CENTRE'),/logo from reference image 3 on the chest/);
 assert.ok(part('LEFT').includes(KITS[3]));assert.match(part('LEFT'),/logo from reference image 4/);assert.doesNotMatch(part('LEFT'),/his face exactly/);
 assert.match(part('RIGHT'),/reference image 2/);
 assert.match(p.prompt,/"FBL HEROES OF THE DAY"/);assert.match(blockPicture('flop',rows,{root}).prompt,/"FBL FLOPS OF THE DAY"/);
 const bare=blockPicture('hero',[row('9',30,[5])],{root});
 assert.deepEqual(bare.images,[],'no files: drawn from the prompt alone');assert.doesNotMatch(bare.prompt,/reference image/);
 assert.ok(bare.prompt.includes(KITS[5]),'the kit\'s colours still');
});

test('awards pictures: each player gets his own moment from his line, never twice in a picture',()=>{
 assert.deepEqual(moments('hero',[row('1',60,[0],{pts:31,reb:14,ast:11}),row('2',50,[1],{pts:40}),row('3',45,[2],{fgm:9,fga:9})]).map(m=>m.id),['triple','scorer','perfect']);
 assert.deepEqual(moments('hero',[row('1',60,[0],{reb:16}),row('2',50,[1],{reb:15}),row('3',45,[2],{reb:14})]).map(m=>m.id),['glass','thanks','flex'],'the same feat once, then the ones that fit anybody');
 const thanks=moments('hero',[row('1',40,[0])])[0];assert.equal(thanks.id,'thanks');assert.match(thanks.text,/"THANK YOU GM FRANKY MURDER FOR THE TRUST"/);
 assert.deepEqual(moments('flop',[row('1',-12,[0],{fgm:3,fga:14}),row('2',-8,[1],{tov:6}),row('3',-5,[2],{pf:6})]).map(m=>m.id),['bricks','turnovers','fouls']);
 const bricks=moments('flop',[row('1',-12,[0],{fgm:3,fga:14})])[0];assert.match(bricks.text,/"3\/14 FG"/,'the box score\'s own counts');
 assert.equal(moments('flop',[row('1',-2,[0])],new Map([['1',{ice:true}]]))[0].id,'frozen','his form: frozen');
 assert.deepEqual(moments('flop',[row('1',-2,[0],{pts:2}),row('2',-2,[0]),row('3',-1,[0])]).map(m=>m.id),['ghost','sorry','towel']);
 assert.match(moments('flop',[row('1',-7,[0]),row('2',-6,[0]),row('3',-5,[0])])[2].text,/"-5 FBL"/);
});

test('awards pictures: captions, at most three players, no lines no pictures',()=>{
 const l={...row('7',51,[0,2]),n:'L. Dončić',c:'LAL'};
 assert.equal(imageName(l),'L. Doncic','diacritics dropped: the model writes plain Latin');
 assert.equal(imagePoints(-3),'-3');assert.equal(imagePoints(44),'44');
 const [hero,flop]=dayPictures({heroes:[l],flops:[{...l,p:-3}]},who);
 assert.match(hero.caption,/^<b>⭐ Герои дня<\/b>\n🥇 <b>RU L\. Dončić<\/b> · LAL 🐎♠️ — <b>51<\/b> ФО$/);
 assert.match(flop.caption,/^<b>💩 Провалы дня<\/b>\n1\. <b>/);
 assert.deepEqual(dayPictures({heroes:[],flops:[]},who),[],'no lines, no pictures');
 const rows=[1,2,3,4].map(i=>row(String(i),50-i,[0]));
 assert.deepEqual(dayPictures({heroes:rows,flops:[]},who)[0].players,['1','2','3']);
 assert.equal(dayPictures({heroes:rows,flops:[]},who)[0].prompt,dayPictures({heroes:rows,flops:[]},who)[0].prompt,'a day always gets the same picture');
});
