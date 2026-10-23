import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readImage,gmPhoto,teamLogo,zakPhoto,cost,generate,MODEL,QUALITY,SIZE} from '../scripts/image-pipeline.mjs';
import {cast,picture,promptProblems,writePicture,zakRef,gmRef,logoRef,commissionerRef,mikeRef,playerRef,about,UNSAID} from '../scripts/picture-prompt.mjs';
import {sceneOf,sceneFacts,protocolCast,writeProtocolPicture,writeStatementPicture,statementCast,ZAK_MOOD} from '../scripts/zak-pictures.mjs';

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

// A stand-in for Claude: answers in turn, every call kept.
const claude=answers=>{const calls=[];const write=async a=>{calls.push(a);const x=answers.shift();return {data:typeof x==='string'?{prompt:x,idea:'an idea'}:x};};return {calls,write};};
const ZAK=`A still from a 90s action film in a diner at 3 a.m. Zak Onn, the man from reference image 1, his face preserved precisely, in the bright red baseball cap embroidered "God Bless America", slides a file stamped "FBL CASE 7" across the table to the general manager from reference image 2, face exactly as in the photo, who sweats over pancakes. Photorealistic, 35mm, teal and orange grade. No other text, captions or watermarks.`;

test('no prompt of the code\'s own: the scenes, styles and templates are gone, only Claude writes',async()=>{
 const zak=await import('../scripts/zak-pictures.mjs'),pp=await import('../scripts/picture-prompt.mjs'),pipe=await import('../scripts/image-pipeline.mjs');
 for(const name of ['zakPicture','zakStatement','writeScene','writeStatementScene','sceneProblems','drawProtocol','drawStatement'])assert.equal(zak[name],undefined,name);
 for(const name of ['fillPrompt','PROMPT_CRAFT'])assert.equal(pp[name],undefined,name);
 for(const name of ['looks','references'])assert.equal(pipe[name],undefined,name);
 const src=fs.readFileSync(new URL('../scripts/zak-pictures.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/SCENE:|STYLE:|SIGNING|interrogation room/,'no scene of the code\'s');
});

test('the references Claude writes from: numbered as they go, who is on each, the people base\'s facts, never a GM\'s name',()=>{
 const root=assets(),c=cast([zakRef('check',root),gmRef(2,root),logoRef(2,root),commissionerRef(root),gmRef(0,root)]);
 assert.deepEqual(c.images.map(i=>i.name),['check.jpg','3.webp','3.png'],'the missing ones left out');
 assert.deepEqual(c.list.map(x=>x.ref),['reference image 1','reference image 2','reference image 3']);
 assert.equal(c.list[0].name,'Zak Onn');assert.match(c.list[0].neverChanges,/God Bless America/);assert.equal(c.list[0].mustUse,true);
 assert.equal(c.list[1].name,undefined,'a GM is never named');assert.match(c.list[1].neverChanges,/sunglasses/);assert.match(c.list[1].usualLook,/velvet/);
 assert.equal(c.list[2].teamColors,'black, red and cream');assert.equal(c.list[2].mustUse,undefined);
 assert.deepEqual(about(null),{});assert.deepEqual(cast([]),{images:[],refs:[],list:[]});
 const real=cast([zakRef(),commissionerRef(),mikeRef(),playerRef(null,'X')]);
 assert.deepEqual(real.images.map(i=>i.name),['check.jpg','adam-silverov.jpg','mike-roffon.jpg']);
 assert.match(real.list[2].is,/only his face/);
 assert.ok(UNSAID.includes('Franky Murder')&&UNSAID.includes('The Balkan Murderers')&&UNSAID.includes('Strap Onn'));
 assert.ok(!UNSAID.some(n=>/Zak Onn|Mike Roffon|Adam Silverov/.test(n)));
});

test('Claude\'s prompt goes as he wrote it: only the references he names, numbered anew when one is left out',()=>{
 const root=assets(),c=cast([zakRef('check',root),gmRef(2,root),logoRef(2,root)]);
 const p=picture('The man from reference image 1 and the logo of Reference image 3.',c);
 assert.deepEqual(p.images.map(i=>i.name),['check.jpg','3.png']);
 assert.equal(p.prompt,'The man from reference image 1 and the logo of Reference image 2.');
 assert.deepEqual(picture('A sunset, no one.',c).images,[],'drawn from the prompt alone');
});

test('the checks of a prompt: the references it must use, the words the people base requires, numbers, limits, names',()=>{
 const root=assets(),c=cast([zakRef('check',root),gmRef(2,root),logoRef(2,root)]),nums=new Set(['7']);
 assert.deepEqual(promptProblems(ZAK,c,{numbers:nums}),[]);
 assert.match(promptProblems(ZAK.replace('reference image 2','the boss'),c,{numbers:nums}).join(),/reference image 2 \(the photo of the general manager.*\) not used/);
 assert.match(promptProblems(ZAK.replace('God Bless America','USA'),c,{numbers:nums}).join(),/no "God Bless America"/);
 assert.match(promptProblems(ZAK+' And reference image 5.',c,{numbers:nums}).join(),/no reference image 5: there are 3/);
 assert.match(promptProblems(ZAK.replace('FBL CASE 7','CASE 99'),c,{numbers:nums}).join(),/numbers in quotes not in the facts: 99/);
 assert.match(promptProblems(ZAK+' A gun on the table.',c,{numbers:nums}).join(),/off limits: gun/);
 assert.match(promptProblems(ZAK+' {GM} waits.',c,{numbers:nums}).join(),/placeholders in curly braces/);
 assert.match(promptProblems(ZAK+' Jack Pott smiles.',c,{numbers:nums}).join(),/names outside the quotes: Jack Pott/);
 assert.deepEqual(promptProblems(ZAK+' A sign reads "JACK POTT".',c,{numbers:nums}),[],'a name on a sign is drawn, not read as a name');
 assert.match(promptProblems(ZAK+' Суд.',c,{numbers:nums}).join(),/not plain English/);
 assert.match(promptProblems('Short.',c).join(),/length 6/);assert.match(promptProblems(ZAK.repeat(12),c,{numbers:nums}).join(),/length \d+ \(200-4500\)/);
 assert.deepEqual(promptProblems(ZAK+' A wide shot, a jump shot, dead silence, a sharp shooter.',c,{numbers:nums}),[],'basketball and photography words are not violence');
 assert.deepEqual(promptProblems(ZAK+' No weapons, helmets, knives or blood anywhere. Without a gun; never a rifle.',c,{numbers:nums}),[],'his own safety notes are not the picture');
 assert.match(promptProblems(ZAK+' No one sees the gun under the table.',c,{numbers:nums}).join(),/off limits: gun/,'"no one" says nothing is missing');
 assert.match(promptProblems(ZAK+' No hats. He holds a knife.',c,{numbers:nums}).join(),/off limits: knife/,'a negation ends with its sentence');
});

test('writePicture: Claude writes it, a refused prompt goes back to him with its problems, then none',async()=>{
 const root=assets(),c=cast([zakRef('check',root),gmRef(2,root)]),{calls,write}=claude(['Zak alone.',ZAK]);
 const p=await writePicture({system:'SYS',brief:'The case.',c,check:t=>promptProblems(t,c,{numbers:new Set(['7'])}),write,log:()=>{}});
 assert.equal(p.prompt,ZAK);assert.equal(p.idea,'an idea');assert.deepEqual(p.images.map(i=>i.name),['check.jpg','3.webp']);
 assert.equal(calls.length,2);assert.match(calls[0].system,/^SYS\nAnswer only JSON/);
 assert.match(calls[0].prompt,/^The case\.\n\nThe references, the images that go to the image model with your prompt:\n\[/);
 assert.match(calls[0].prompt,/"ref": "reference image 2"/);
 assert.match(calls[1].prompt,/Your prompt:\nZak alone\.\n\nFix only this and write the whole prompt again:\n- length/);
 assert.equal(await writePicture({system:'S',brief:'B',c,write:claude(['no','no']).write,log:()=>{}}),null,'no picture of the code\'s own');
 assert.match((await writePicture({system:'S',brief:'B',c:cast([]),write:async a=>({data:{prompt:a.prompt,idea:''}}),check:()=>[]})).prompt,/none: the picture is drawn from your prompt alone/);
});

test('Зак Онн pictures: the case follows the rule broken first',()=>{
 assert.deepEqual(ZAK_MOOD,{approved:'approved',check:'check',violation:'check'},'always a red-cap photo');
 assert.equal(sceneOf({kind:'violation',rules:['rookie']}),'rookie');
 assert.equal(sceneOf({kind:'violation',rules:['rookie','transfers']}),'transfers','the transfer limit before the rookie rule');
 assert.equal(sceneOf({kind:'violation',rules:['club','duplicate']}),'duplicate');
 assert.equal(sceneOf({kind:'violation',rules:[]}),'violation');assert.equal(sceneOf({kind:'violation',rules:['rookie'],standing:true}),'repeat');
 assert.equal(sceneOf({kind:'check',rules:['time']}),'check-time');assert.equal(sceneOf({kind:'check',rules:['unmarked']}),'check-white');
 assert.equal(sceneOf({kind:'approved',fixed:true}),'closed');assert.equal(sceneOf({kind:'approved',watched:true}),'watched');
});

test('a protocol\'s picture: the case in words, Zak, the GM, the logo, the new player, the commissioner as references; Claude writes the rest',async()=>{
 const root=assets(),player={name:'Anthony Edwards',image:{bytes:Buffer.from('face'),name:'4594268.png',type:'image/png'}};
 const f=sceneFacts({kind:'approved',team:2,no:7,root,player});
 assert.deepEqual(f,{verdict:'approved',case:'a clean roster: the deal is approved',caseLabel:'FBL CASE 7',newPlayer:'Anthony Edwards',gm:'in the picture with his face (his reference)'});
 assert.match(sceneFacts({kind:'violation',team:0,no:8,root,rules:['time']}).gm,/only from behind/);
 const c=protocolCast({kind:'approved',team:2,root,player});
 assert.deepEqual(c.images.map(i=>i.name),['approved.jpg','3.webp','3.png','4594268.png']);
 assert.equal(c.refs[3].need,true,'the new player must be in it');
 assert.equal(protocolCast({kind:'violation',team:2,root,player,rules:['time']}).images.length,3,'only an approval presents him');
 assert.deepEqual(protocolCast({kind:'check',team:4}).images.map(i=>i.name),['check.jpg','captain-torres-new-win.jpg','5.jpg','adam-silverov.jpg'],'the real assets');
 const good=ZAK+' Behind them the real NBA player from reference image 4 grins.';
 const {calls,write}=claude([good]);
 const p=await writeProtocolPicture({kind:'approved',team:2,no:7,player},{root,recent:['a car wash'],write,log:()=>{}});
 assert.equal(p.prompt,good.replace('reference image 4','reference image 3'),'his words, the references numbered anew');assert.deepEqual(p.images.map(i=>i.name),['approved.jpg','3.webp','4594268.png'],'the logo he did not use is not sent');
 assert.match(calls[0].system,/Zak Onn deals in person with the general manager/);assert.match(calls[0].system,/How you write the picture's prompt/);
 assert.match(calls[0].prompt,/Recent pictures, do not repeat their ideas:\n- a car wash/);assert.match(calls[0].prompt,/"caseLabel": "FBL CASE 7"/);
 const w2=claude([ZAK+' The kids laugh.',ZAK]);
 await writeProtocolPicture({kind:'violation',team:2,no:7,rules:['time']},{root,write:w2.write,log:()=>{}});
 assert.match(w2.calls[1].prompt,/off limits: kids/,'his own bounds: no children');
});

test('a statement\'s picture: Claude writes it from the statement and the editor\'s idea, Zak and the commissioner',async()=>{
 const statement='⚖️ <b>ЗАК ОНН. РЕШЕНИЕ</b>\n08:01 и 08:26. {@commissioner} утверждает.';
 assert.deepEqual(statementCast().images.map(i=>i.name),['check.jpg','adam-silverov.jpg']);
 const good=ZAK.replace(/ slides a file.*?pancakes\./,' stamps a deed "SPORTS.RU 08:26" while the commissioner from reference image 2 nods.').replace('FBL CASE 7','');
 const {calls,write}=claude([good]);
 const p=await writeStatementPicture(statement,{idea:'A scale of justice.',write,log:()=>{}});
 assert.equal(p.prompt,good);assert.deepEqual(p.images.map(i=>i.name),['check.jpg','adam-silverov.jpg']);
 assert.match(calls[0].prompt,/^The statement:\n⚖️ ЗАК ОНН\. РЕШЕНИЕ\n08:01 и 08:26\.  утверждает\./);assert.doesNotMatch(calls[0].prompt,/<b>|\{@/);
 assert.match(calls[0].prompt,/The editor's idea of the picture \(use it or make it better; the statement decides\):\nA scale of justice\./);
 assert.match(calls[0].system,/whoever the statement rules for wins in the picture too/);
 assert.equal(await writeStatementPicture(statement,{write:claude(['no','no']).write,log:()=>{}}),null);
});

test('the league\'s people: every photo exists, GMs by team, what a picture keeps of them',async()=>{
 const {PEOPLE,person,gmOf}=await import('../scripts/image-pipeline.mjs');
 for(const p of PEOPLE){assert.ok(fs.existsSync(new URL(`../scripts/assets/${p.photo}`,import.meta.url)),p.id);assert.ok(p.name&&p.en&&p.role&&p.org&&p.job,p.id);}
 assert.equal(gmOf(0).id,'franky-murder');assert.equal(gmOf(1).id,'coach-i');assert.equal(gmOf(4).id,'captain-torres-new-win');
 assert.deepEqual([2,3,5,6,7].map(t=>gmOf(t).id),['jack-pott','robert-khachaturyan','lemarius','fy-zhil','strap-onn']);
 assert.match(about(person('captain-torres-new-win')).neverChanges,/always a pirate: a weathered brown leather tricorn hat.*dreadlocks/);
 assert.match(about(person('coach-i')).neverChanges,/always an emperor/);assert.match(about(person('coach-i')).alwaysDrawn,/oil painting/);
 assert.match(about(person('mike-roffon')).neverChanges,/white gloves and a vintage chrome microphone, always/);
 assert.doesNotMatch(person('mike-roffon').keep,/helmet/,'the helmet is one of his outfits, not his signature');
});

test('the league\'s team logos: one per team, in draft order, as the pictures and the awards cards read them',async()=>{
 for(let t=0;t<8;t++)assert.match(teamLogo(t)?.name||'',new RegExp(`^${t+1}\\.(ref\\.)?jpg$`),`team ${t+1}`);
 assert.deepEqual(protocolCast({kind:'violation',team:7,rules:['rookie']}).images.map(i=>i.name).slice(0,3),['check.jpg','strap-onn.jpg','8.jpg'],'Strap Onn and the Shugars logo');
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

