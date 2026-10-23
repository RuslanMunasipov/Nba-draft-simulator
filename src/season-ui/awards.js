// Season → Награды: the awards bot's day lists, races and records (its site.json).
import {writeStored,readStored} from '../storage.js';
import {teamName} from '../teams.js';
import {stints} from '../season.js';
import sportsMap from '../../data/sports-player-map.json' with {type:'json'};
import {LEAGUE_TEAMS} from '../teams.js';
import {int,dec,count,stampMsk} from '../format.js';
import {withFace} from '../headshot.js';
import {teamLogo} from '../team-logo.js';
import {REPO,button,context,el,errorBlock,fetchJson,live,loadingBlock,needsLive,players,refreshHooks,renderSeason,tab,view} from './state.js';

// ---------- Awards: the day's top and antitop of the whole NBA and the season races ----------
// The awards bot's summary (branch data/awards-bot, site.json): the day's lists, the season races and records, ranked by
// the bot's own code (awards-bot/core.js siteSummary) when it saves, so the page and the league chat never disagree and
// the page reads a few hundred kilobytes, not the whole archive (about 6 MB by the season's end). Without a summary yet
// (a bot that has not run since it began writing one) the page builds the same summary from the archive.
const AWARDS_URL=f=>`https://raw.githubusercontent.com/${REPO}/data/awards-bot/${f}`;
const AWARDS_TABS=[['top','Топ дня'],['flop','Антитоп дня'],['races','Гонки за награды']];
let awards={status:'idle',site:null,at:null},awardsTab=readStored('fbl-awards-tab')||'top',awardsDay=null;
async function fromArchive(ctx){
 const [core,prices,archive,state]=await Promise.all([import('../../awards-bot/core.js'),import('../../data/sports-prices-2026-10-17.json'),
  fetchJson(AWARDS_URL('archive.json'),{cache:'no-cache'}),fetchJson(AWARDS_URL('state.json'),{cache:'no-cache'}).catch(()=>null)]);
 const list=(prices.default||prices).players||[],league=core.makeLeague({players,live,holdings:stints(ctx.transfers),map:sportsMap.players,prices:list});
 const bySid=new Map(players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p]));
 const rookies=new Set(players.filter(p=>p.isRookie===true).map(league.espnOf).filter(Boolean)),mef=new Map();
 for(const r of list)if(r.price>=core.MEF_PRICE.min&&r.price<=core.MEF_PRICE.max){const e=league.espnOf(bySid.get(String(r.sportsId)));if(e)mef.set(e,r.price);}
 const who=a=>{const p=league.player(a);return p?{id:p.id,sid:p.sportsId?String(p.sportsId):null}:null;};
 return core.siteSummary(archive?.lines||[],state,{rostered:league.rostered(),rookies,mef,who});
}
async function loadAwards(){
 if(awards.status==='loading')return;awards={...awards,status:'loading'};
 try{
  const site=await fetchJson(AWARDS_URL('site.json'),{cache:'no-cache'}).catch(()=>null)||await fromArchive(context());
  awards={status:'ok',site,at:Date.now()};
 }catch{awards={...awards,status:awards.site?'ok':'error'};}
 if(tab()==='season'&&view==='awards')renderSeason();
}
// The awards are read again with the season data once the page has been opened (the bot saves them hourly).
refreshHooks.push(()=>{if(awards.status!=='idle')loadAwards();});
// The league's player of a summary row: by his Sports.ru id, else his ESPN id.
let whoMemo=null;
function playerOf(row){
 if(whoMemo?.players!==players)whoMemo={players,sid:new Map(players.filter(p=>p.sportsId).map(p=>[String(p.sportsId),p])),espn:new Map(players.filter(p=>p.espnId).map(p=>[String(p.espnId),p]))};
 return (row.sid&&whoMemo.sid.get(String(row.sid)))||whoMemo.espn.get(String(row.a))||null;
}
const moved=(key,list,previous)=>{if(!previous)return 0;const i=previous.indexOf(key);return i<0?null:i-list.findIndex(x=>(x.key||x.a)===key);};
const MONTHS_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayWord=d=>`${Number(d.slice(8,10))} ${MONTHS_GEN[Number(d.slice(5,7))-1]}`;
// The player of an archive line: the database's name and Sports.ru's Russian one, else ESPN's short name.
function awardWho(row){
 const {n,a}=row,p=playerOf(row),box=el('span',null,'aw-who');
 box.append(el('strong',p?.name||n||String(a)));const ru=p?live?.players?.[p.sportsId]?.fullName:null;if(ru)box.append(el('small',ru,'aw-ru'));
 return box;
}
function teamMarks(teams,free=true){
 const box=el('span',null,'aw-teams');
 if(!teams?.length){if(free){const f=el('span','свободен','chip');f.title='Ни в одной команде FBL на начало матча';box.append(f);}return box;}
 for(const t of teams){const s=teamLogo(t,'sm');s.classList.add('aw-team');if(t===0)s.classList.add('mine');s.removeAttribute('aria-hidden');s.setAttribute('role','img');s.title=teamName(t);s.setAttribute('aria-label',teamName(t));box.append(s);}
 return box;
}
const STAT_WORDS=[['pts','очк'],['reb','подб'],['ast','пер'],['stl','перехв'],['blk','блок'],['tov','пот']];
const statWords=s=>STAT_WORDS.map(([k,l])=>`${s[k]} ${l}`).join(' · ')+` · с игры ${s.fgm}/${s.fga} · штрафные ${s.ftm}/${s.fta}`;
const MEDAL=['🥇','🥈','🥉'];
function awardLine(l,i,flop){
 const li=el('li',null,'aw-row'+(flop?' flop':'')+(l.h?.includes(0)?' mine':''));
 li.append(el('span',!flop&&i<3?MEDAL[i]:String(i+1),'aw-rank'));
 const main=el('span',null,'aw-main'),head=el('span',null,'aw-head');
 head.append(awardWho(l),el('span',l.c||'—','aw-club'),teamMarks(l.h));
 main.append(head,el('small',`${statWords(l.s)} · ${dec(l.m)} мин`,'aw-stats'));
 const pts=el('span',null,'aw-pts');pts.append(el('strong',int(l.p)),el('small','ФО'));
 li.append(withFace({espnId:l.a,name:playerOf(l)?.name||l.n},main,'md'),pts);return li;
}
function dayBlock(flop){
 const all=awards.site?.days||{},days=Object.keys(all).sort().reverse();
 if(!days.length)return [el('p','В архиве бота наград пока нет ни одного матча.','muted')];
 if(!days.includes(awardsDay))awardsDay=days[0];
 const i=days.indexOf(awardsDay),pick=el('div',null,'aw-day');
 const go=d=>{awardsDay=d;renderSeason();},older=button('◀',()=>go(days[i+1]),'btn-secondary btn-sm'),newer=button('▶',()=>go(days[i-1]),'btn-secondary btn-sm');
 older.disabled=i>=days.length-1;newer.disabled=i<=0;older.setAttribute('aria-label','Предыдущий игровой день');newer.setAttribute('aria-label','Следующий игровой день');
 const rec=all[awardsDay];
 const label=el('div',null,'aw-day-label');label.append(el('strong',dayWord(awardsDay)),el('small',rec.done?`${count(rec.final,'матч','матча','матчей')} · день завершён`:rec.left?`идёт: ещё ${count(rec.left,'матч','матча','матчей')}, в списке — завершённые`:'игровой день США'));
 pick.append(older,label,newer);
 const list=el('ol',null,'aw-list');list.append(...(flop?rec.antitop:rec.top).map((l,k)=>awardLine(l,k,flop)));
 const title=el('div',null,'sp-block-head');title.append(el('h3',flop?'🤡 Антитоп дня · НБА':'⭐ Топ дня · НБА'),el('span',count(rec.players,'игрок','игрока','игроков'),'chip'));
 return [pick,title,list,el('p',flop?'Все игроки, вышедшие на площадку, без порога минут — как антитоп в чате лиги. Значок — команда FBL, где игрок был на начало матча.':'Лучшие ФО дня по формуле лиги среди всех игроков НБА. Значок — команда FBL, где игрок был на начало матча.','sp-note')];
}
const raceArrow=(r,list,previous)=>{const m=previous?moved(r.key||r.a,list,previous):0;return m===null?el('span','new','aw-move new'):m>0?el('span','▲'+m,'aw-move up'):m<0?el('span','▼'+(-m),'aw-move down'):null;};
function raceBlock(title,note,list,previous,value){
 const box=el('div',null,'sp-block aw-race'),head=el('div',null,'sp-block-head');head.append(el('h3',title));box.append(head,el('p',note,'sp-note'));
 if(!list.length){box.append(el('p','Пока никого: нет сыгранных матчей.','muted'));return box;}
 const ol=el('ol',null,'aw-list');
 list.forEach((r,i)=>{const li=el('li',null,'aw-row'+((r.teams||[]).includes(0)?' mine':'')),main=el('span',null,'aw-main'),head2=el('span',null,'aw-head');
  // A player with no game yet has no club in the archive: the database's.
  head2.append(awardWho(r),el('span',r.c||playerOf(r)?.team||'—','aw-club'),teamMarks(r.teams,true));const mv=raceArrow(r,list,previous);if(mv)head2.append(mv);
  const [big,small,line]=value(r);main.append(head2,el('small',line,'aw-stats'));
  const pts=el('span',null,'aw-pts');pts.append(el('strong',big),el('small',small));
  li.append(el('span',i<3&&r.p>0?MEDAL[i]:String(i+1),'aw-rank'),main,pts);ol.append(li);});
 box.append(ol);return box;
}
function racesBlock(){
 const races=awards.site?.races,prev=awards.site?.ranks||{},games=r=>count(r.games,'матч','матча','матчей'),mef=awards.site?.mefPrice||{min:1000,max:1900};
 if(!races)return [el('p','Гонки появятся, когда бот наград сохранит их.','muted')];
 const avg=r=>r.games?` · ${dec(r.p/r.games)} за матч`:'';
 return [
  raceBlock('🏆 MVP','Больше всех ФО за сезон среди игроков, которые сейчас в командах FBL.',races.mvp,prev.mvp,r=>[int(r.p),'ФО',games(r)+avg(r)]),
  raceBlock('🌱 Новичок года','То же среди новичков в командах FBL.',races.roy,prev.roy,r=>[int(r.p),'ФО',games(r)+avg(r)]),
  raceBlock('💊 Mef player',`Цена Sports.ru до старта сезона от ${int(mef.min)} до ${int(mef.max)}: кто выжал больше всех из дешёвых.`,races.mef,prev.mef,
   r=>[int(r.p),'ФО',`${games(r)} · цена до старта ${int(r.price)}`]),
  raceBlock('🪑 Шестой игрок','Индекс = ФО × доля матчей, сыгранных запасным (дешевле из двух игроков своей позиции в команде FBL).',
   races.sixth.map(x=>({...x,teams:[x.team]})),prev.sixth,r=>[int(r.index),'индекс',`ФО ${int(r.p)} · запасным ${r.bench} из ${r.games} (${Math.round(100*r.bench/r.games)}%)`])];
}
export function awardsView(){
 const wait=needsLive('Награды');if(wait)return wait;
 if(awards.status==='idle'){loadAwards();return [loadingBlock('Загружаю итоги бота наград…')];}
 if(awards.status==='loading'&&!awards.site)return [loadingBlock('Загружаю итоги бота наград…')];
 if(awards.status==='error')return [errorBlock('Нет итогов бота наград','GitHub не ответил. Повтори через минуту.',()=>loadAwards())];
 const nav=el('div',null,'segmented aw-tabs');nav.setAttribute('role','group');nav.setAttribute('aria-label','Раздел наград');
 for(const [k,t] of AWARDS_TABS){const b=button('',()=>{awardsTab=k;writeStored('fbl-awards-tab',k);renderSeason();},'');const [short,...rest]=t.split(' за ');b.append(short);if(rest.length)b.append(el('span',' за '+rest.join(' за '),'wide-only'));b.setAttribute('aria-pressed',String(awardsTab===k));nav.append(b);}
 const at=awards.site?.stateUpdatedAt||awards.site?.updatedAt,updated=at?el('p',`Итоги бота наград обновлены ${stampMsk(at)} МСК: бот сохраняет их каждый час, матч попадает в них после финальной сирены.`,'sp-note'):null;
 let body;if(awardsTab==='races'){body=el('div',null,'aw-races');body.append(...racesBlock());body=[body];}else body=dayBlock(awardsTab==='flop');
 return [nav,...body,...(updated?[updated]:[])];
}
