import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fblFormula} from '../src/fbl-scoring.js';
import {parseSummary,dailyBlocks} from '../awards-bot/core.js';
import {dayImages,mediaGroup,picture,imageName,imagePoints,pictureTeam} from '../awards-bot/images.js';

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
// An assets folder with team 1's logo and GM (team index 0) and nothing for the others.
function assets(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assets-'));
 for(const [dir,file] of [['gm','1.jpg'],['team-logos','1.png']]){fs.mkdirSync(path.join(root,dir));fs.writeFileSync(path.join(root,dir,file),file);}
 return root;
}

test('awards pictures: every number in a picture and its caption is the official formula of the line',()=>{
 const lines=goldenDay(),blocks=dailyBlocks(lines),albums=dayImages('2026-10-21',blocks,who);
 assert.deepEqual(albums.map(a=>a.kind),['hero','flop']);
 for(const a of albums)a.items.forEach((it,i)=>{
  const l=(a.kind==='hero'?blocks.heroes:blocks.flops)[i],g=golden[Number(l.a)-1];
  assert.equal(l.p,fblFormula(g));assert.equal(l.p,g.expected,g.name);
  assert.match(it.prompt,new RegExp(`(?:"|· )${imagePoints(g.expected)} FBL`),`${g.name}: ${it.prompt}`);
  assert.match(it.caption,new RegExp(`— <b>${String(g.expected).replace('-','−')}</b> ФО$`));
  assert.ok(it.prompt.includes(imageName(l)));
 });
});

test('awards pictures: Зак Онн is the law and never appears in the awards',()=>{
 const albums=dayImages('2026-10-21',dailyBlocks(goldenDay()),who,{root:assets()});
 for(const a of albums)for(const it of a.items){
  assert.doesNotMatch(it.prompt,/Zak|Onn|God Bless America|lawyer|judge/i);
  assert.ok(it.images.every(im=>!/zak|approved|check|violation/.test(im.name)),'no photo of his among the references');
 }
});

test('awards pictures: the holder team\'s logo and GM are the references when their files exist',()=>{
 const root=assets(),l={a:'7',n:'L. Dončić',c:'LAL',p:51,h:[0,2]};
 assert.equal(pictureTeam(l),0,'a shared player: his first holder');
 const full=picture('hero',l,0,'2026-10-21',{root});
 assert.deepEqual(full.images.map(i=>[i.name,i.type]),[['1.png','image/png'],['1.jpg','image/jpeg']]);
 assert.match(full.prompt,/reference image 1 is the logo of the fantasy team; reference image 2 is a portrait of the fantasy team's general manager \(Franky Murder\)/);
 assert.match(full.prompt,/the team logo from reference image 1/);assert.match(full.prompt,/the exact person from reference image 2/);
 const bare=picture('hero',{...l,h:[3]},0,'2026-10-21',{root});
 assert.deepEqual(bare.images,[],'no files for that team: drawn from the prompt alone');
 assert.doesNotMatch(bare.prompt,/reference image|logo|general manager/);
 assert.match(bare.prompt,/the real NBA player L\. Doncic of the LAL/);
 const free=picture('flop',{...l,h:[]},0,'2026-10-21',{root});
 assert.deepEqual(free.images,[],'a free agent has no team');
});

test('awards pictures: the scenes, names, captions and how many per block',()=>{
 const l={a:'7',n:'L. Dončić',c:'LAL',p:-3,h:[0,2]};
 assert.equal(imageName(l),'L. Doncic','diacritics dropped: the model writes plain Latin');
 assert.equal(imagePoints(-3),'-3');assert.equal(imagePoints(44),'44');
 const scene=p=>p.split('\n\n').find(x=>x.startsWith('SCENE')).replace(/"[^"]*"|GOLD|SILVER|BRONZE/g,'');
 for(const kind of ['hero','flop'])for(const day of ['2026-10-21','2026-10-22','2026-11-05'])
  assert.equal(new Set([0,1,2].map(i=>scene(picture(kind,l,i,day).prompt))).size,3,`${kind} ${day}: no scene twice in an album`);
 assert.equal(picture('flop',l,0,'2026-10-21').prompt,picture('flop',l,0,'2026-10-21').prompt,'a day always gets the same scenes');
 assert.match(picture('hero',{...l,p:51},0,'2026-10-21').prompt,/GOLD/);assert.match(picture('hero',{...l,p:51},2,'2026-10-21').prompt,/BRONZE/);
 const [hero,flop]=dayImages('2026-10-21',{heroes:[{...l,p:51}],flops:[l]},who);
 assert.match(hero.items[0].caption,/^🥇 <b>RU L\. Dončić<\/b> · LAL \S+ — <b>51<\/b> ФО$/);
 assert.equal(flop.items[0].caption.startsWith('1. <b>'),true);
 assert.deepEqual(dayImages('2026-10-21',{heroes:[],flops:[]},who),[],'no lines, no pictures');
 const rows=[1,2,3].map(i=>({...l,a:String(i)}));
 assert.deepEqual(dayImages('2026-10-21',{heroes:rows,flops:rows},who,{perBlock:1}).map(a=>a.items.length),[1,1]);
 assert.deepEqual(dayImages('2026-10-21',{heroes:rows,flops:rows},who,{perBlock:0}),[]);
});

test('awards pictures: the album title goes on the first picture sent, files are attached by name',()=>{
 const g=mediaGroup('⭐ Герои дня',[{caption:'🥈 B',png:Buffer.from('b')},{caption:'🥉 C',png:Buffer.from('c')}],'hero');
 assert.deepEqual(g.media.map(m=>[m.media,m.caption,m.parse_mode]),[['attach://p0','<b>⭐ Герои дня</b>\n🥈 B','HTML'],['attach://p1','🥉 C','HTML']]);
 assert.deepEqual(g.files.map(f=>[f.field,f.name,String(f.bytes)]),[['p0','fbl-hero-1.png','b'],['p1','fbl-hero-2.png','c']]);
});
