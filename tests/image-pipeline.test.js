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
 await generate({prompt:'F',size:'1024x1536',background:'transparent'},{fetchImpl:ok});
 assert.deepEqual(JSON.parse(calls[2].init.body),{model:MODEL,prompt:'F',size:'1024x1536',quality:QUALITY,n:1,background:'transparent',output_format:'png'},'a holiday frame: a transparent portrait');
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
 assert.equal(gmOf(0).id,'franky-murder');assert.equal(gmOf(1).id,'coach-i');assert.equal(gmOf(4).id,'captain-torres-new-win');assert.equal(gmOf(6),null);
 assert.match(looks(person('captain-torres-new-win')),/never changes: always a pirate/);assert.match(looks(person('captain-torres-new-win')),/cartoon/);
 assert.match(looks(person('coach-i')),/always an emperor/);assert.match(looks(person('coach-i')),/oil painting/);
 assert.match(looks(person('franky-murder')),/the face exactly as in the photo.*usual look, which may change to fit the scene: dark aviator sunglasses/);
 assert.match(looks(person('mike-roffon')),/white gloves and a vintage chrome microphone, always/);
 assert.doesNotMatch(person('mike-roffon').keep,/helmet/,'the helmet is one of his outfits, not his signature');
 const p=zakPicture({kind:'violation',team:4,no:3,seed:'s',rules:['time']});
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg','captain-torres-new-win.jpg']);
 assert.match(p.prompt,/GENERAL MANAGER: the exact person from reference image 2.*cartoon/);
 assert.match(p.prompt,/SCENE:.*Captain Torres New-Win \(the general manager, reference image 2\)/);
});
