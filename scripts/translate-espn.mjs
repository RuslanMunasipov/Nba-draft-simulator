// ESPN's English texts on the site, in Russian: the latest news of every Sports.ru player (the three the player card
// shows) and the comments of ESPN's injury report. Written by Claude through the owner's subscription
// (scripts/claude-text.mjs), a batch of texts per call, only texts not translated yet; the result is
// translations.json on the branch data/translations, which the site reads (src/season-ui/state.js translations).
// A translation keeps every number of the original (a score, a stat line, a date): one that adds, drops or changes a
// number is not kept and is tried again on the next run. Names of people stay in Latin letters, as the site writes them.
// Usage: node scripts/translate-espn.mjs <sports-current.json> <translations.json> [--max 300] [--batch 12]
import fs from 'node:fs';
import {claudeJSON,claudeConfigured,CLAUDE_MODEL} from './claude-text.mjs';

export const NEWS_URL=id=>`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=50&playerId=${id}`;
export const NEWS_PER_PLAYER=3;
const KEEP_NEWS_DAYS=120,KEEP_TEXT_DAYS=60;

// A comment's key and a news item's text, as the site computes them.
import {textKey,newsText} from '../src/translate.js';

// Every number of a text, as written: a translation must keep the same ones (any order).
export const numbersOf=s=>(String(s||'').match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>x.replace(',','.')).sort();
export const sameNumbers=(a,b)=>JSON.stringify(numbersOf(a))===JSON.stringify(numbersOf(b));

export const SYSTEM=`Ты переводишь на русский тексты ESPN для сайта фэнтези-лиги НБА: новости игроков (заголовок и текст) и комментарии к отчёту о травмах.
Правила:
- Переводи точно и полностью, ничего не добавляй, не убирай и не оценивай.
- Имена игроков, тренеров и журналистов оставляй латиницей, как в оригинале.
- Клубы НБА называй по-русски, как принято в русской спортивной прессе: «Финикс», «Портленд», «Лейкерс», «Клипперс», «Никс», «Голден Стэйт»; издания и подкасты — как в оригинале.
- Все числа оставляй теми же цифрами: счёт, статистику, минуты, даты, сроки. Не заменяй слова цифрами и цифры словами («four rebounds» — «четыре подбора», «23 points» — «23 очка»). Счёт можно писать через двоеточие.
- Статистика по-русски: очки, подборы, передачи, перехваты, блок-шоты, потери, фолы, с игры, трёхочковые, штрафные, минуты. «Day-to-day» — «под вопросом на ближайшие матчи», «questionable» — «под вопросом», «out» — «не сыграет».
- Пиши живым спортивным языком, без канцелярита.
Ответ — JSON по схеме: для каждого текста его id и перевод.`;
export const SCHEMA={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['id','headline','story'],
 properties:{id:{type:'string'},headline:{type:'string'},story:{type:'string'}}}}}};

// The prompt of a batch: each text with its id; a comment has no headline.
export function batchPrompt(items){
 return 'Переведи тексты. Для комментария к травме заголовка нет: headline оставь пустым, перевод — в story.\n\n'+JSON.stringify(items.map(x=>({id:x.id,headline:x.headline||'',story:x.story||''})),null,1);
}

// Translations of one batch that keep the numbers of their originals: {id: {headline, story}}.
export async function translateBatch(items,{claude=claudeJSON,model=CLAUDE_MODEL,log=console.warn}={}){
 const {data}=await claude({system:SYSTEM,prompt:batchPrompt(items),schema:SCHEMA,model,timeoutMs:240e3});
 const byId=new Map((data?.items||[]).map(x=>[String(x.id),x])),out={};
 for(const x of items){
  const t=byId.get(x.id);
  if(!t||!String(t.story||'').trim()&&String(x.story||'').trim()){log(`translate: no translation for ${x.id}`);continue;}
  if(!sameNumbers(`${x.headline||''} ${x.story||''}`,`${t.headline||''} ${t.story||''}`)){log(`translate: the numbers of ${x.id} changed, not kept`);continue;}
  out[x.id]={headline:String(t.headline||'').trim(),story:String(t.story||'').trim()};
 }
 return out;
}

// What needs a translation: the latest news of each player and the injury report's comments, newest first, without
// those already translated (news by ESPN's id, comments by textKey).
export function pending({news,comments,done}){
 const todo=[];
 for(const n of [...news].sort((a,b)=>String(b.published).localeCompare(String(a.published))))
  if(!done.news[n.id])todo.push({id:'n'+n.id,kind:'news',newsId:String(n.id),headline:n.headline,story:n.story,published:n.published});
 for(const c of comments){const k=textKey(c);if(!done.texts[k])todo.push({id:'t'+k,kind:'text',key:k,headline:'',story:c});}
 // Comments first: few, short, shown on the injuries page.
 return [...todo.filter(x=>x.kind==='text'),...todo.filter(x=>x.kind==='news')];
}

// The file after a run: the new translations added, news older than KEEP_NEWS_DAYS and comments not seen for
// KEEP_TEXT_DAYS dropped.
export function merged(old,results,{today,seenTexts=new Set()}){
 const out={version:1,model:CLAUDE_MODEL,updatedAt:new Date().toISOString(),news:{...old.news},texts:{...old.texts}};
 for(const [x,t] of results){
  if(x.kind==='news')out.news[x.newsId]={headline:t.headline,story:t.story,published:x.published};
  else out.texts[x.key]={text:t.story,seen:today};
 }
 const cut=(days)=>new Date(Date.parse(today)-days*864e5).toISOString().slice(0,10);
 for(const [k,v] of Object.entries(out.news))if(String(v.published||'').slice(0,10)<cut(KEEP_NEWS_DAYS))delete out.news[k];
 for(const [k,v] of Object.entries(out.texts)){if(seenTexts.has(k))v.seen=today;else if((v.seen||'')<cut(KEEP_TEXT_DAYS))delete out.texts[k];}
 return out;
}

async function fetchJson(url,tries=3){
 for(let i=0;i<tries;i++){try{const r=await fetch(url);if(r.ok)return await r.json();}catch{}await new Promise(r=>setTimeout(r,1500*(i+1)));}
 return null;
}
// The latest news of each player, as the player card shows them (newsText: the headline and the plain text).
async function playerNews(ids,{concurrency=6}={}){
 const out=[],queue=[...ids];
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(queue.length){const id=queue.shift(),feed=(await fetchJson(NEWS_URL(id)))?.feed||[];
   for(const n of feed.slice(0,NEWS_PER_PLAYER))if(n.id!=null)out.push({id:String(n.id),published:n.published||n.lastModified||'',...newsText(n)});}
 }));
 return [...new Map(out.map(n=>[n.id,n])).values()];
}

if(import.meta.url===`file://${process.argv[1]}`){
 const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:d;};
 const [livePath,outPath]=args.filter((a,i)=>!a.startsWith('--')&&!args[i-1]?.startsWith('--'));
 const max=Number(opt('max',300)),size=Number(opt('batch',12)),today=new Date().toISOString().slice(0,10);
 const live=JSON.parse(fs.readFileSync(livePath,'utf8'));
 const old=fs.existsSync(outPath)?JSON.parse(fs.readFileSync(outPath,'utf8')):{news:{},texts:{}};
 const ids=[...new Set(Object.values(live.players||{}).map(p=>p.espnId).filter(Boolean))];
 const comments=[...new Set((live.espnInjuries?.injuries||[]).flatMap(t=>t.injuries||[]).flatMap(i=>[i.shortComment,i.longComment]).filter(Boolean))];
 const news=await playerNews(ids);
 const todo=pending({news,comments,done:old}).slice(0,max);
 console.log(`players ${ids.length}, news ${news.length}, comments ${comments.length}, to translate ${todo.length}`);
 if(!claudeConfigured()){console.log('CLAUDE_CODE_OAUTH_TOKEN is not set: nothing translated');process.exit(0);}
 const results=[];
 for(let i=0;i<todo.length;i+=size){
  const batch=todo.slice(i,i+size);
  try{const got=await translateBatch(batch);for(const x of batch)if(got[x.id])results.push([x,got[x.id]]);}
  catch(e){console.warn(`translate: batch ${i/size+1} failed: ${e.message}`);if(e.status===429||e.status===401)break;}
 }
 const out=merged(old,results,{today,seenTexts:new Set(comments.map(textKey))});
 fs.writeFileSync(outPath,JSON.stringify(out));
 console.log(`translated ${results.length} of ${todo.length}; news ${Object.keys(out.news).length}, comments ${Object.keys(out.texts).length}`);
}
