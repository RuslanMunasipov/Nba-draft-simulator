import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {references,readImage,gmPhoto,teamLogo,zakPhoto,cost,generate,MODEL,QUALITY,SIZE} from '../scripts/image-pipeline.mjs';
import {zakPicture,sceneOf,ZAK_MOOD} from '../scripts/zak-pictures.mjs';

function assets(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assets-'));
 for(const [dir,file] of [['gm','3.webp'],['team-logos','3.png'],['zak-onn','check.jpg'],['zak-onn','approved.jpg']]){
  fs.mkdirSync(path.join(root,dir),{recursive:true});fs.writeFileSync(path.join(root,dir,file),file);}
 return root;
}

test('image pipeline: assets by team number, any image format, missing ones are null',()=>{
 const root=assets();
 assert.deepEqual([gmPhoto(2,root)?.name,gmPhoto(2,root)?.type],['3.webp','image/webp'],'team index 2 is file 3');
 assert.equal(teamLogo(2,root)?.name,'3.png');assert.equal(gmPhoto(0,root),null);assert.equal(teamLogo(null,root),null);
 assert.equal(zakPhoto('check',root)?.name,'check.jpg');assert.equal(readImage(path.join(root,'nope.png')),null);
 assert.ok(zakPhoto('approved'),'the repository has his photos');
 const refs=references([{key:'a',image:null,what:'A'},{key:'b',image:gmPhoto(2,root),what:'B'}]);
 assert.deepEqual(refs.has,{b:'reference image 1'},'numbered among the present ones only');
 assert.equal(refs.legend,'REFERENCES: reference image 1 is B.');
 assert.deepEqual(references([]),{images:[],legend:'',has:{}});
});

test('image pipeline: a reference goes as its small copy under the original\'s name; the repository\'s copies are small',()=>{
 const root=assets();
 fs.writeFileSync(path.join(root,'team-logos','3.ref.jpg'),'small');
 assert.deepEqual([teamLogo(2,root).name,String(teamLogo(2,root).bytes),teamLogo(2,root).type],['3.png','small','image/jpeg']);
 assert.equal(String(gmPhoto(2,root).bytes),'3.webp','no copy: the original');
 // The size of a JPEG or PNG from its header: width × height.
 const size=b=>{if(b[0]===0x89)return [b.readUInt32BE(16),b.readUInt32BE(20)];
  for(let i=2;i<b.length;){const m=b[i+1],len=b.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc3)return [b.readUInt16BE(i+7),b.readUInt16BE(i+5)];i+=2+len;}};
 const dirs=[['scripts/assets/team-logos',256],['awards-bot/assets',256],['scripts/assets/people',512],['scripts/assets/zak-onn',512]];
 let copies=0;
 for(const [dir,side] of dirs)for(const f of fs.readdirSync(dir).filter(f=>f.includes('.ref.'))){
  const [w,h]=size(fs.readFileSync(path.join(dir,f)));copies++;
  assert.ok(w*h<=side*side*1.01,`${dir}/${f}: ${w}×${h}, more than ${side}² (python3 scripts/shrink-references.py)`);}
 assert.ok(copies>=20,'the copies are in the repository');
 assert.notEqual(teamLogo(0).bytes.length,fs.readFileSync('scripts/assets/team-logos/1.jpg').length,'a logo goes small');
});

test('image pipeline: the price of a picture from the usage the API answers',()=>{
 // The trial picture of 22.10.2026: 271 text + 999 image tokens in, 439 image tokens out.
 assert.equal(cost({input_tokens:1270,input_tokens_details:{image_tokens:999,text_tokens:271},output_tokens:439}).toFixed(4),'0.0225');
 assert.equal(cost(null),0);
});

test('image pipeline: an edit with every reference and the key, a generation without references, no retry on an empty balance',async()=>{
 const png=Buffer.from('png'),calls=[];
 const ok=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}],usage:{output_tokens:1}}),{status:200});};
 const images=[{bytes:Buffer.from('a'),name:'1.png',type:'image/png'},{bytes:Buffer.from('b'),name:'1.jpg',type:'image/jpeg'}];
 const r=await generate({prompt:'P',images},{key:'k',fetchImpl:ok});
 assert.equal(String(r.png),'png');assert.deepEqual(r.usage,{output_tokens:1});
 const form=calls[0].init.body;
 assert.equal(calls[0].url,'https://api.openai.com/v1/images/edits');assert.equal(calls[0].init.headers.authorization,'Bearer k');
 assert.deepEqual([form.get('model'),form.get('quality'),form.get('size'),form.get('prompt')],[MODEL,QUALITY,SIZE,'P']);
 assert.deepEqual(form.getAll('image[]').map(f=>[f.name,f.type]),[['1.png','image/png'],['1.jpg','image/jpeg']]);
 await generate({prompt:'Q'},{fetchImpl:ok});
 await generate({prompt:'F',size:'1024x1536',quality:'medium',background:'transparent'},{fetchImpl:ok});
 assert.equal(QUALITY,'low');
 assert.deepEqual(JSON.parse(calls[2].init.body),{model:MODEL,prompt:'F',size:'1024x1536',quality:'medium',n:1,background:'transparent',output_format:'png'},'a holiday frame: a transparent portrait');
 assert.equal(calls[1].url,'https://api.openai.com/v1/images/generations');
 assert.deepEqual(JSON.parse(calls[1].init.body),{model:MODEL,prompt:'Q',size:SIZE,quality:QUALITY,n:1});
 assert.deepEqual(calls[1].init.headers,{'content-type':'application/json'},'without a key the request goes out bare (a proxy adds it)');
 let broke=0;
 const empty=async()=>{broke++;return new Response(JSON.stringify({error:{type:'insufficient_quota',code:'credit_balance_exhausted',message:'no credits'}}),{status:429});};
 await assert.rejects(generate({prompt:'P',images},{key:'k',fetchImpl:empty}),/429 no credits/);
 assert.equal(broke,1,'no retry on an empty balance');
});

test('Зак Онн pictures: he deals with the team\'s GM in person, the logo in the scene, his mood by the verdict',()=>{
 const root=assets();
 assert.deepEqual(ZAK_MOOD,{approved:'approved',check:'check',violation:'check'},'always a red-cap photo');
 const p=zakPicture({kind:'violation',team:2,no:17,seed:'2:a>b:2026-10-22',root});
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg','3.webp','3.png']);
 assert.match(p.prompt,/reference image 1 is Zak Onn, the league lawyer; reference image 2 is the general manager of the fantasy team \(Jack Pott\); reference image 3 is the fantasy team logo/);
 assert.match(p.prompt,/God Bless America/);assert.match(p.prompt,/the exact person from reference image 2/);
 assert.match(p.prompt,/the team logo from reference image 3/);
 assert.equal(p.prompt,zakPicture({kind:'violation',team:2,no:17,seed:'2:a>b:2026-10-22',root}).prompt,'a protocol always gets the same scene');
 assert.equal(zakPicture({kind:'approved',team:2,no:1,seed:'s',root}).images[0].name,'approved.jpg');
 const alone=zakPicture({kind:'check',team:0,no:5,seed:'s',root});
 assert.deepEqual(alone.images.map(i=>i.name),['check.jpg'],'no GM photo or logo for that team');
 assert.match(alone.prompt,/general manager, seen only from behind/);assert.doesNotMatch(alone.prompt,/logo/);
 // Every scene of every verdict reads through with and without the team's files.
 for(const kind of ['approved','check','violation'])for(let s=0;s<30;s++)for(const team of [0,2]){
  const x=zakPicture({kind,team,no:3,seed:`seed${s}`,root});
  assert.doesNotMatch(x.prompt,/undefined|null/,`${kind} ${s} ${team}`);
 }
});

test('Зак Онн pictures: the scene follows the case, the rule broken first',()=>{
 assert.equal(sceneOf({kind:'violation',rules:['rookie']}),'rookie');
 assert.equal(sceneOf({kind:'violation',rules:['rookie','transfers']}),'transfers','the transfer limit before the rookie rule');
 assert.equal(sceneOf({kind:'violation',rules:['club','duplicate']}),'duplicate');
 assert.equal(sceneOf({kind:'violation',rules:['time']}),'time');assert.equal(sceneOf({kind:'violation',rules:['white']}),'white');
 assert.equal(sceneOf({kind:'violation',rules:[]}),'violation');
 assert.equal(sceneOf({kind:'violation',rules:['rookie'],standing:true}),'repeat');
 assert.equal(sceneOf({kind:'check',rules:['time']}),'check-time');assert.equal(sceneOf({kind:'check',rules:['unmarked']}),'check-white');
 assert.equal(sceneOf({kind:'check',rules:['club']}),'check');
 assert.equal(sceneOf({kind:'approved',fixed:true}),'closed');assert.equal(sceneOf({kind:'approved',watched:true}),'watched');
 assert.equal(sceneOf({kind:'approved'}),'approved');
 const root=assets();
 const cases=[['violation',{rules:['rookie']}],['violation',{rules:['white']}],['violation',{rules:['club']}],['violation',{rules:['transfers']}],
  ['violation',{rules:['time']}],['violation',{rules:['duplicate']}],['violation',{standing:true}],['check',{rules:['time']}],['check',{rules:['white']}],
  ['approved',{fixed:true}],['approved',{watched:true}]];
 for(const [kind,story] of cases)for(let s=0;s<6;s++){
  const p=zakPicture({kind,team:2,no:9,seed:'x'+s,root,...story}).prompt;
  assert.doesNotMatch(p,/undefined|null/,`${kind} ${JSON.stringify(story)}`);assert.match(p,/God Bless America/);
 }
 assert.match(zakPicture({kind:'violation',team:2,no:9,seed:'x',root,rules:['transfers']}).prompt,/3 PER WEEK|LIMIT/);
});

test('the league\'s people: every photo exists, GMs by team, their looks go into the GM block of a picture',async()=>{
 const {PEOPLE,person,gmOf,looks}=await import('../scripts/image-pipeline.mjs');
 for(const p of PEOPLE){assert.ok(fs.existsSync(new URL(`../scripts/assets/${p.photo}`,import.meta.url)),p.id);assert.ok(p.name&&p.en&&p.role,p.id);}
 assert.equal(gmOf(0).id,'franky-murder');assert.equal(gmOf(1).id,'coach-i');assert.equal(gmOf(4).id,'captain-torres-new-win');
 assert.deepEqual([2,3,5,6].map(t=>gmOf(t).id),['jack-pott','robert-khachaturyan','lemarius','fy-zhil']);assert.equal(gmOf(7),null,'Strap Onn: no avatar yet');
 assert.match(looks(person('captain-torres-new-win')),/never changes: always a pirate: a weathered brown leather tricorn hat.*dreadlocks/);assert.doesNotMatch(looks(person('captain-torres-new-win')),/cartoon/,'a real face now (23.10)');
 assert.match(looks(person('coach-i')),/always an emperor/);assert.match(looks(person('coach-i')),/oil painting/);
 assert.match(looks(person('franky-murder')),/the face exactly as in the photo.*usual look, which may change to fit the scene: dark aviator sunglasses/);
 assert.match(looks(person('mike-roffon')),/white gloves and a vintage chrome microphone, always/);
 assert.doesNotMatch(person('mike-roffon').keep,/helmet/,'the helmet is one of his outfits, not his signature');
 const p=zakPicture({kind:'violation',team:4,no:3,seed:'s',rules:['time']});
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg','captain-torres-new-win.jpg','5.jpg'],'his photo, then the Volga Pirates logo');
 assert.match(p.prompt,/GENERAL MANAGER: the exact person from reference image 2.*always a pirate/);
 assert.match(p.prompt,/SCENE:.*Captain Torres New-Win \(the general manager, reference image 2\)/);
});


test('the league\'s team logos: one per team, in draft order, as the pictures and the awards cards read them',async()=>{
 const {teamLogo}=await import('../scripts/image-pipeline.mjs');
 for(let t=0;t<7;t++)assert.match(teamLogo(t)?.name||'',new RegExp(`^${t+1}\\.(ref\\.)?jpg$`),`team ${t+1}`);
 assert.equal(teamLogo(7),null,'School Sugars Team: its new logo has not come yet');
 const p=zakPicture({kind:'violation',team:7,no:5,seed:'s',rules:['rookie']});
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg'],'neither an avatar nor a logo yet');assert.match(p.prompt,/seen only from behind/);
});

test('a statement of Zak Onn: his photo the only reference, his identity, the scene of the statement, the style',async()=>{
 const {zakStatement}=await import('../scripts/zak-pictures.mjs');
 const p=zakStatement({scene:'  A desk, a stamp reading "OFFICIAL WARNING".\n'});
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg']);
 assert.match(p.prompt,/ZAK ONN \(highest priority\): the man from reference image 1/);assert.match(p.prompt,/God Bless America/);
 assert.match(p.prompt,/SCENE: A desk, a stamp reading "OFFICIAL WARNING"\.\n\nSTYLE:/);
 const file=new URL('../data/announcements/2026-10-23-school-shooters-warning.picture.txt',import.meta.url);
 assert.match(fs.readFileSync(file,'utf8'),/No weapons of any kind.*no children, no school/);
});

test('the commissioner joins the scenes written for him (the courtroom, the press photo) and a statement that calls him',async()=>{
 const {zakStatement}=await import('../scripts/zak-pictures.mjs');
 const seeds=Array.from({length:40},(_,i)=>'s'+i);
 const court=seeds.map(seed=>zakPicture({kind:'violation',team:2,no:5,seed})).find(p=>/courtroom/.test(p.prompt));
 assert.deepEqual(court.images.map(i=>i.name).slice(-1),['adam-silverov.jpg']);
 assert.match(court.prompt,/reference image 4 is Adam Silverov, the league commissioner/);
 assert.match(court.prompt,/COMMISSIONER: the exact person from reference image 4.*long curly grey-brown mullet hair, thin round metal-rimmed glasses/);
 assert.match(court.prompt,/Adam Silverov \(the league commissioner, reference image 4\) presides from the judge's bench/);
 const other=seeds.map(seed=>zakPicture({kind:'violation',team:2,no:5,seed})).find(p=>!/courtroom/.test(p.prompt));
 assert.doesNotMatch(other.prompt,/Silverov|COMMISSIONER/);assert.ok(!other.images.some(i=>i.name==='adam-silverov.jpg'));
 const st=zakStatement({scene:'Zak Onn and {commissioner} sign the rules.'});
 assert.deepEqual(st.images.map(i=>i.name),['check.jpg','adam-silverov.jpg']);
 assert.match(st.prompt,/SCENE: Zak Onn and Adam Silverov \(the league commissioner, reference image 2\) sign the rules\./);
 assert.doesNotMatch(zakStatement({scene:'Zak alone.'}).prompt,/Silverov/);
});

test('an approved deal presents its new player: Zak and the GM unveil him, in a different scene from deal to deal',async()=>{
 const player={name:'Anthony Edwards',image:{bytes:Buffer.from('face'),name:'4594268.png',type:'image/png'}};
 const pics=Array.from({length:40},(_,i)=>zakPicture({kind:'approved',team:2,no:3,seed:'s'+i,player}));
 const scenes=new Set(pics.map(p=>p.prompt.match(/SCENE: ([^,.]*)/)[1]));
 assert.ok(scenes.size>=6,`varied: ${[...scenes].join(' / ')}`);
 const p=pics[0];
 assert.deepEqual(p.images.map(i=>i.name).slice(0,4),['approved.jpg','jack-pott.jpg','3.jpg','4594268.png']);
 assert.match(p.prompt,/reference image 4 is Anthony Edwards, the newly signed NBA player/);
 assert.match(p.prompt,/NEW PLAYER: the real NBA player Anthony Edwards, his face exactly as in reference image 4/);
 assert.match(p.prompt,/SCENE:.*Anthony Edwards \(the newly signed real NBA player, reference image 4\)/);
 for(const q of pics)assert.doesNotMatch(q.prompt,/undefined|null/);
 const faceless=zakPicture({kind:'approved',team:2,no:3,seed:'s1',player:{name:'Anthony Edwards',image:null}});
 assert.match(faceless.prompt,/the newly signed real NBA player Anthony Edwards/);assert.ok(!faceless.images.some(i=>i.name==='4594268.png'));
 const plain=zakPicture({kind:'approved',team:2,no:3,seed:'s1'});
 assert.doesNotMatch(plain.prompt,/NEW PLAYER|newly signed/,'no player, the plain approval');
 assert.doesNotMatch(zakPicture({kind:'violation',team:2,no:3,seed:'s1',player,rules:['time']}).prompt,/newly signed/,'only an approval presents him');
});

test('the ESPN headshot: the small one first, the full one when ESPN has no small, null when neither',async()=>{
 const {espnHeadshot}=await import('../scripts/image-pipeline.mjs');
 const seen=[],answer=(ok,type='image/png')=>({ok,headers:{get:()=>type},arrayBuffer:async()=>new TextEncoder().encode('png').buffer});
 const small=await espnHeadshot('42',{fetchImpl:async u=>{seen.push(u);return answer(true);}});
 assert.deepEqual(small,{bytes:Buffer.from('png'),name:'42.png',type:'image/png'});assert.match(seen[0],/combiner.*42\.png&w=384/);
 seen.length=0;await espnHeadshot('42',{fetchImpl:async u=>{seen.push(u);return answer(/full\/42\.png$/.test(u));}});
 assert.equal(seen.length,2);assert.match(seen[1],/full\/42\.png$/);
 assert.equal(await espnHeadshot('42',{fetchImpl:async()=>answer(true,'text/html')}),null);
 assert.equal(await espnHeadshot('42',{fetchImpl:async()=>{throw Error('offline');}}),null);
});

test('Claude writes each scene anew: the case in words, placeholders the code fills, checked before it is drawn',async()=>{
 const {sceneFacts,sceneProblems,writeScene,sceneMessages,SCENE_SCHEMA}=await import('../scripts/zak-pictures.mjs');
 const f=sceneFacts({kind:'approved',team:2,no:7,player:{name:'Anthony Edwards'}});
 assert.deepEqual({...f},{verdict:'approved',case:'a clean roster: the deal is approved',caseLabel:'FBL CASE 7',newPlayer:'Anthony Edwards',
  gm:'shown with his face',logo:true,commissioner:true});
 assert.match(sceneFacts({kind:'violation',team:7,no:8,rules:['time']}).case,/outside the hours/);assert.equal(sceneFacts({kind:'violation',team:7,no:8,rules:['time']}).gm,'shown only from behind');
 const good='A diner at 3 a.m., rain on the window. Zak Onn slides a menu titled "TRANSFER CLEARED" to {PLAYER} while {GM} orders pancakes and {COMMISSIONER} reads the contract stamped {CASE}.';
 assert.deepEqual(sceneProblems(good,f),[]);
 assert.match(sceneProblems(good.replace('{PLAYER}','the player'),f).join(),/no \{PLAYER\}/);
 assert.match(sceneProblems(good.replace('{GM}','the boss'),f).join(),/no \{GM\}/);
 assert.match(sceneProblems(good+' {DOG} barks.',f).join(),/placeholders \{DOG\}/);
 assert.match(sceneProblems(good.replace('TRANSFER CLEARED','DEAL 99'),f).join(),/numbers in quotes 99/);
 assert.match(sceneProblems(good+' Zak Onn draws a gun.',f).join(),/out of bounds: gun/);
 assert.match(sceneProblems(good.replace('Zak Onn','The lawyer'),f).join(),/no Zak Onn/);
 assert.match(sceneProblems('Zak Onn {GM} {PLAYER} ты',f).join(),/not plain English/);
 const p=zakPicture({kind:'approved',team:2,no:7,seed:'x',player:{name:'Anthony Edwards',image:null},written:good});
 const scene=p.prompt.split('\n\n').find(x=>x.startsWith('SCENE'));
 assert.match(scene,/to the newly signed real NBA player Anthony Edwards while Jack Pott \(the general manager, reference image 2\) orders pancakes and Adam Silverov \(the league commissioner, reference image 4\) reads the contract stamped "FBL CASE 7"\./);
 assert.deepEqual(p.images.map(i=>i.name).slice(-1),['adam-silverov.jpg']);
 const calls=[],answers=[{scene:'Zak Onn alone.'},{scene:good}];
 assert.equal(await writeScene(f,{recent:['an old idea'],write:async a=>{calls.push(a);return {data:answers.shift()};},log:()=>{}}),good);
 assert.equal(calls.length,2);assert.equal(calls[0].schema,SCENE_SCHEMA);assert.match(calls[0].prompt,/Recent scenes, do not repeat their ideas:\n- an old idea/);
 assert.match(sceneMessages(f).system,/brand-new story every time/);
 assert.equal(await writeScene(f,{write:async()=>({data:{scene:'nope'}}),log:()=>{}}),null);
});
