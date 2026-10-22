// Pieces several season views share: the game cards, the transfer options and their reasons, the team and period controls, the league race.
import {writeStored} from '../storage.js';
import {teamLabel,teamName} from '../teams.js';
import {fblTransfers} from '../rules.js';
import {WEEKLY_TRANSFERS,seasonRosters,transfersThisWeek,horizons,gameWeeks,current,transferOptions,explainSwap,newsInjuries,CONFIDENT,DOUBTFUL} from '../season.js';
import {transferWindow} from '../season.js';
import {leagueRace,fblGame,CHANCE_RUNS} from '../standings.js';
import {combineNote,absenceShort,sportsSeasonsLine,espnNumbers,injuryUntil} from '../forecast-text.js';
import {moscowDate,LIVE_MS} from '../live.js';
import {int,dec,signed,count,ddmm,timeMsk,injuryStatus} from '../format.js';
import {statLine} from '../stat-line.js';
import {openPlayerSheet} from '../sheet.js';
import {$,PERIOD,PERIOD_LONG,REPO,TEAM_URL,addDaysIso,bodyPart,button,byId,card,clockMin,confidenceBadge,el,fetchJson,forGains,games,horizon,injuryText,league,link,live,onlyMine,owners,pending,players,query,renderSeason,same,setHorizon,setPending,setQuery,setReplacing,setTeam,setView,sportsTeam,src,tab,team,teamBank,teamOption,transfers,transfersLeft} from './state.js';

// ---------- The player's season so far (player cards) ----------
// His 2026/27 games with their FBL points (ESPN's box score of each game: the collector's, the last two days' from ESPN live) and
// the game he is playing now with its stat line. Null until the season data is loaded.
export function seasonLivePanel(p){
 if(!live||!p)return null;
 const row=live.players?.[p.sportsId],played=(row?.games||[]).filter(g=>g.played),eid=String(p.espnId||'');
 const box=(eid&&games.map(g=>({g,x:g.points?.[eid]})).filter(o=>o.x))||[],now=box.find(o=>o.g.state==='in');
 if(!row&&!box.length)return null;
 const block=el('div',null,'pc-block season-live');block.append(el('h4','Сезон 2026/27 · лайв'));
 if(played.length){
  // Only FBL points are summed (standings.js fblGame): a game Sports.ru listed without its box score has none yet.
  const scored=played.filter(fblGame),total=scored.reduce((s,g)=>s+g.points,0),minutes=played.reduce((s,g)=>s+clockMin(g.minutes),0),missing=played.length-scored.length;
  block.append(el('p',`${count(played.length,'матч','матча','матчей')} · ${scored.length?int(total):'—'} ФО · ${scored.length?dec(total/scored.length):'—'} за матч · ${dec(minutes/played.length)} мин`,'season-live-sum'));
  const t=el('table',null,'sports-table'),h=el('tr');for(const x of ['Дата','Соперник','Мин','ФО'])h.append(el('th',x));t.append(h);
  for(const g of played.slice(-5).reverse()){const tr=el('tr');for(const v of [ddmm(g.date),g.opponent||'—',String(g.minutes??'—'),fblGame(g)?int(g.points)+(g.source==='ESPN'?' *':''):'—'])tr.append(el('td',v));t.append(tr);}
  block.append(t);
  if(played.some(g=>g.source==='ESPN'&&fblGame(g)))block.append(el('p','* по протоколу ESPN: матчи последних двух дней считаются по нему сразу после финальной сирены.','muted'));
  if(missing)block.append(el('p',`${scored.length?`ФО — по ${count(scored.length,'матчу','матчам','матчам')}: у`:'У'} ${count(missing,'матча','матчей','матчей')} ещё нет протокола ESPN («—»), очки по формуле лиги появятся вместе с ним.`,'muted'));
 }else if(!now)block.append(el('p','В этом сезоне ещё не играл.','muted'));
 if(now)block.append(el('p',`Сейчас в игре: ${int(now.x.points)} ФО · ${gameStatus(now.g)} · обновляется каждые ${LIVE_MS/1e3} с`,'season-live-now'),lineTable(now.x));
 const last=box.filter(o=>o.g.state==='post').at(-1);
 if(last){const d=el('details',null,'inline');d.dataset.key=`last:${p.id}:${last.g.id}`;d.append(el('summary',`Статлиния последнего матча (${last.g.away.abbr} — ${last.g.home.abbr})`),lineTable(last.x));block.append(d);}
 return block;
}
// ---------- Overview ----------
// The table and the Teams tab read one league race (src/standings.js): shared places for equal points, the model's
// chances of the final place. It is computed once per change of its inputs (80 outlooks and 20 000 draws take a
// noticeable moment on a phone), not on every re-render of the same screen. The rest of a running game follows ESPN's
// clock and his minutes (season.js expectedPoints), so both are in the key with his points.
export let raceKey=null,raceValue=null;
export function race(ctx,running){
 const key=[ctx.players,ctx.live,ctx.injuries,ctx.transfers,ctx.today,[...running].map(([id,x])=>`${id}:${x.points}:${x.day}:${x.minutes}:${x.game?.detail}`).join()];
 if(!raceKey||key.some((v,i)=>v!==raceKey[i])){raceKey=key;raceValue=leagueRace(ctx,running);}
 return raceValue;
}
export const CHANCE_NOTE=`Шансы — оценка модели по ${int(CHANCE_RUNS)} розыгрышам остатка сезона (разброс прогноза каждого игрока, составы как сейчас, будущие трансферы не учтены), не гарантия.`;
// ESPN's game status in Russian, in Moscow time.
export function gameStatus(g){
 if(g.state==='pre')return `${timeMsk(g.date)} МСК`;
 if(g.state==='post')return /OT/.test(g.detail)?'Финал, ОТ':'Финал';
 const d=String(g.detail||'');let m;
 if(/half/i.test(d))return 'Перерыв';
 if((m=d.match(/^End of (\d)/i)))return `Конец ${m[1]}-й четв.`;
 if((m=d.match(/^Q(\d)\s+(.+)/i)))return `${m[1]}-я четв. · ${m[2]}`;
 // ESPN's scoreboard writes the running clock as "8:22 - 3rd" or "2:00 - OT".
 if((m=d.match(/^(\d+:\d+(?:\.\d+)?)\s*-\s*(\d)(?:st|nd|rd|th)$/i)))return `${m[2]}-я четв. · ${m[1]}`;
 if((m=d.match(/^(\d+:\d+(?:\.\d+)?)\s*-\s*(\d*)OT$/i)))return `Овертайм${m[2]?' '+m[2]:''} · ${m[1]}`;
 if(/OT/.test(d))return 'Овертайм '+d.replace(/.*OT\s*/,'');
 return d;
}
// One game with the players of one FBL team in it: the team chosen in the season tab (my own on the overview).
export const inGame=(p,g)=>p.team===g.home.abbr||p.team===g.away.abbr;
export function teamInGame(g,focus,own){return players.filter(p=>own.get(p.id)===focus&&inGame(p,g));}
// The FBL formula term by term on one ESPN box-score line: what each stat adds (the live stat line).
export function lineTable(x){
 const s=statLine(x?.line);if(!s)return el('p','В протоколе ESPN пока нет статистики.','sp-note');
 const t=el('table',null,'stat-line');
 for(const r of s.rows){const tr=el('tr');tr.append(el('th',r.label),el('td',String(r.value)+(r.note?` · ${r.note}`:''),'v'),el('td',r.points?signed(r.points):'0','num'+(r.points<0?' neg':'')));t.append(tr);}
 const total=el('tr',null,'total');total.append(el('th','ФО'),el('td',x.final?'финал':'матч идёт','v'),el('td',int(s.total),'num'));t.append(total);
 return t;
}
// On the floor or on the bench right now (ESPN's lineup, refreshed with the scores): null outside a running game and in a
// break, when nobody is on the floor. dot: the mark alone, its words in the tooltip, for the long all-players list.
export function court(x,g,dot=false){
 if(!x||x.final||g?.state!=='in'||g.pause)return null;
 const label=x.onCourt?'на паркете':'на скамейке',s=el('span',dot?null:label,'court'+(x.onCourt?' on':'')+(dot?' dot':''));
 s.title=x.onCourt?'Сейчас на площадке (по протоколу ESPN)':'Сейчас на скамейке (по протоколу ESPN)';if(dot)s.setAttribute('aria-label',label);return s;
}
export const courtWord=x=>x?.game?.state==='in'&&!x.game.pause&&!x.final?(x.onCourt?' · на паркете':' · на скамейке'):'';
// A player's line in a game card: tap to open the stat line, which stays open while the scores refresh.
export function lineRow(key,who,x,status,cls,badge=null){
 if(!x){const li=el('li',null,cls);li.append(who,el('span',status,'pts'));return li;}
 const li=el('li',null,cls),d=el('details',null,'line-details'),sum=el('summary');d.dataset.key=key;
 // The words go under the name, so a long name keeps its room; the bare mark leads the row, in one column for the list.
 if(badge?.classList.contains('dot'))sum.append(badge,who);else if(badge){const col=el('span',null,'who-col');col.append(who,badge);sum.append(col);}else sum.append(who);
 sum.append(el('span',`${int(x.points)} ФО · ${x.minutes} мин`+(x.final?'':' *'),'pts'));d.append(sum,lineTable(x));li.append(d);return li;
}
export function gameCard(g,focus,own,full=false){
 const item=el('div',null,'sp-game'+(g.state==='in'?' is-live':'')),head=el('div',null,'sp-game-head');
 head.append(el('strong',`${g.away.abbr} — ${g.home.abbr}`));
 if(g.state!=='pre')head.append(el('span',`${g.away.score} : ${g.home.score}`,'score'));
 head.append(g.state==='in'?el('span',gameStatus(g),'chip chip--live'):el('small',gameStatus(g)));item.append(head);
 const ours=teamInGame(g,focus,own),pts=p=>g.points?.[String(p.espnId)];
 if(g.state!=='pre'&&!g.points&&ours.length)item.append(el('p','Протокол ESPN пока недоступен.','sp-note'));
 if(ours.length){
  ours.sort((a,b)=>(pts(b)?.points||0)-(pts(a)?.points||0));
  const ul=el('ul');
  for(const p of ours){const x=pts(p),inj=injuryText(p);
   ul.append(lineRow(`line:${g.id}:${p.espnId}`,el('span',p.name+(g.state==='pre'&&inj?` (${inj.toLowerCase()})`:''),'who'),x,g.state==='pre'?'':g.points?(g.state==='post'?'не играл':'ещё не выходил'):'','mine-player',court(x,g)));}
  item.append(ul);
 }
 // Every player of the game, best first: tap anyone to follow his stat line.
 const everyone=Object.entries(g.points||{}).sort((a,b)=>b[1].points-a[1].points);
 if(full&&everyone.length){
  const all=el('details',null,'inline sp-all');all.dataset.key='all:'+g.id;all.append(el('summary',`Все игроки матча (${everyone.length})`));
  const ul=el('ul');for(const [id,x] of everyone)ul.append(lineRow(`all:${g.id}:${id}`,el('span',`${x.name||'—'} · ${x.team}`,'who'),x,'','',court(x,g,true)));
  all.append(ul);item.append(all);
 }
 return item;
}
export function gamesToday(ctx,compact,focus){
 const own=owners(ctx),box=el('div',null,'sp-block sp-live'),head=el('div',null,'sp-block-head');head.append(el('h3','Матчи сегодня'));box.append(head);
 const order={in:0,pre:1,post:2},whose=focus===0?'твоих игроков':`игроков ${teamName(focus)}`;
 const shown=games.filter(g=>g.state!=='post'||moscowDate(g.date)>=addDaysIso(ctx.today,-1)).sort((a,b)=>order[a.state]-order[b.state]||a.date.localeCompare(b.date));
 if(src.games==='error'){box.append(el('p',compact?'Счёт ESPN сейчас недоступен. Расписание — во вкладке «Матчи».':'Счёт ESPN сейчас недоступен. Расписание по календарю Sports.ru — ниже.','muted'));return box;}
 if(!shown.length){box.append(el('p','Сегодня матчей нет.','muted'));return box;}
 const withTeam=shown.filter(g=>teamInGame(g,focus,own).length),list=compact?shown.filter(g=>g.state==='in'||withTeam.includes(g)):onlyMine?withTeam:shown;
 for(const g of list.slice(0,compact?4:99))box.append(gameCard(g,focus,own,!compact));
 if(compact&&shown.length>Math.min(list.length,4)){const more=button(`Все матчи (${shown.length})`,()=>setView('games'),'btn-ghost btn-sm');head.append(more);}
 if(!list.length)box.append(el('p',`Сегодня ${count(shown.length,'матч','матча','матчей')}, ${whose} в них нет.`,'muted'));
 if(list.some(g=>g.state==='in'))box.append(el('p','* матч идёт: очки предварительные, по протоколу ESPN. «На паркете» и «на скамейке» — по составу на площадке в протоколе ESPN, обновляется вместе со счётом (каждые 20 с; ESPN может отставать на минуту), в перерывах не показывается. Нажми на игрока — откроется его статлиния по формуле.','sp-note'));
 return box;
}
export function gainCells(gain){
 const gains=el('span',null,'sp-gains');
 for(const k of [horizon,...['week','month','season'].filter(k=>k!==horizon)]){const s=el('span',null,k===horizon?'on':'');s.append(el('strong',signed(gain[k])),el('small',k===horizon?'ФО '+PERIOD_LONG[k]:PERIOD[k].toLowerCase()));if(gain[k]<0)s.classList.add('neg');gains.append(s);}
 return gains;
}
// Connected teams make their moves on Sports.ru; the app follows them there instead of recording them itself. Outside the
// FBL transfer hours a move made now is a certain breach: the button says when it opens instead.
export function takeAction(moves,ctx,label){
 const st=sportsTeam(team),hours=transferWindow();
 if(st&&!hours.open){const b=button(`Трансферы с ${hours.from} МСК`,()=>{},'btn-secondary btn-sm sp-take');b.disabled=true;b.title=`Сейчас ${hours.now} МСК: трансферы FBL только с ${hours.from} до ${hours.to}, сделка сейчас будет нарушением`;return b;}
 if(st)return link('Сделать на Sports.ru ↗',TEAM_URL(st.sportsTeamId),'btn-secondary btn-sm sp-take');
 const b=button(label,()=>record(moves,ctx));b.setAttribute('aria-label',`${label}: ${moves.map(m=>`${byId.get(m.outId)?.name} → ${m.player.name}`).join(', ')}`);return b;
}
export function optionRow(o,outId,ctx,title,withAction=!sportsTeam(team)){
 const li=el('li',null,'sp-option'),inj=injuryText(o.player),why=explainSwap(ctx,outId,o.player.id,horizon,null,team);
 const name=el('span',null,'sp-name');name.append(el('strong',title||o.player.name),el('small',`${o.player.positions.join('/')} · ${o.player.team||'—'} · ${int(o.player.price)} · банк после ${int(o.bankAfter)}${inj?' · '+inj:''}`),confidenceBadge(why));
 li.append(name,gainCells(o.gain));if(withAction)li.append(takeAction([{outId,player:o.player}],ctx,'Записать'));li.append(whyBox(why,ctx));return li;
}
// ---------- Why a move, and the players behind it ----------
export const EARLY='Сезон только начался';
export function whyBox(why,ctx){
 const box=el('details',null,'sp-why');box.append(el('summary','Почему и об игроках'));
 box.addEventListener('toggle',()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';
  const p=why.parts,part=(v,t)=>`${signed(v)} ${t}`;
  box.append(el('p',`Разница ${PERIOD_LONG[horizon]}: ${signed(why.gain)} ФО = ${part(p.perGame,'за счёт ФО за матч')}, ${part(p.availability,'за счёт доли сыгранных матчей')}, ${part(p.schedule,'за счёт календаря клубов')}.`));
  box.append(el('p',`Уверенность ${Math.floor(why.confidence*100)}%: столько шансов, что обмен действительно даст плюс ${PERIOD_LONG[horizon]}. Делать стоит от ${Math.round(CONFIDENT*100)}%, ниже ${Math.round(DOUBTFUL*100)}% трансфер лучше сберечь.`,'muted'));
  const flags=why.flags.filter(f=>!f.startsWith(EARLY)).map(f=>f.replace(/: (Out|Day-To-Day|Questionable|Doubtful|Suspension)\b/,(_,s)=>': '+injuryStatus(s).label.toLowerCase()));
  if(flags.length){const ul=el('ul',null,'sp-flags');for(const f of flags)ul.append(el('li','⚠ '+f));box.append(ul);}
  for(const side of why.sides){const pair=el('div',null,'sp-pair');pair.append(sideBlock('Отдаёшь',side.out),sideBlock('Получаешь',side.in));box.append(pair);}
 });
 return box;
}
// The forecast's own numbers: career model, ESPN, the draft-pick model, and the result.
export function sourcesLine(f){
 const m=f.sources?.model,e=f.sources?.espn;if(!m)return f.basis||'';
 const own=f.draftPick?`модель новичков (пик №${f.draftPick})`:f.origin==='UNDRAFTED_ROOKIE_MODEL'?'модель незадрафтованных':'модель по карьере';
 const note=combineNote(f);
 return `Прогноз до сезона: ${own} ${dec(m.perGame)} × ${Math.round(m.games)}${e?`, ESPN ${espnNumbers(e)} → итог ${dec(f.meanPerGame)} × ${Math.round(f.games)}`:''} матчей${note?` (${note})`:''}.`;
}
export function sideBlock(label,x){
 const p=x.player,f=p.forecast||{},box=el('div',null,'sp-side'),hist=Object.entries(p.sportsHistory||{}).slice(-2);
 box.append(el('small',label),el('strong',`${p.name} · ${int(x.price)}${x.priceChange?` (${signed(x.priceChange)})`:''}`));
 const lines=[`${dec(x.perGame)} ФО за матч сейчас (прогноз до сезона ${dec(x.prior)}${x.scored?`, в сезоне ${dec(x.average)} за ${count(x.scored,'матч','матча','матчей')}`:''})`,
  `в периоде ${dec(x.expectedGames)} из ${x.clubGames} матчей клуба${x.clubGames?` (шанс сыграть ${Math.round(x.expectedGames/x.clubGames*100)}%)`:''}`,
  p.depth?`состав ESPN: ${p.depth.rank===1?'стартер':'№'+p.depth.rank} на ${p.depth.position}`:'',
  x.injury?'🩹 '+[injuryStatus(x.injury.status).label,injuryUntil(x.injury)].filter(Boolean).join(' '):'травм в отчёте ESPN нет',
  sportsSeasonsLine(hist)];
 for(const l of lines.filter(Boolean))box.append(el('p',l));
 const more=el('details');more.append(el('summary','Подробнее о прогнозе'));
 more.addEventListener('toggle',()=>{if(!more.open||more.dataset.filled)return;more.dataset.filled='1';
  const src2=sourcesLine(f);if(src2)more.append(el('p',src2));
  if(f.availability)more.append(el('p',absenceShort(f.availability,f.games)));
  more.append(newsBlock(p));
  more.append(button('Полная карточка игрока',()=>openPlayerSheet(p,card),'btn-ghost btn-sm'));
 });
 box.append(more);
 return box;
}
// Latest ESPN fantasy news of a player (CORS-open feed), loaded when the block is opened and cached for the session.
export const NEWS_URL=id=>`https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players?limit=50&playerId=${id}`,newsCache=new Map();
// The watcher's archive of ESPN injury reports (data/season-live), loaded once.
export let archiveLoad=null;const injuryArchive=()=>archiveLoad??=fetchJson(`https://raw.githubusercontent.com/${REPO}/data/season-live/injury-history.json`);
export function newsBlock(p){
 const box=el('details',null,'sp-news');box.append(el('summary','Новости ESPN'));
 if(!p.espnId){box.append(el('p','Нет ESPN id — новостей нет.','muted'));return box;}
 const fill=async()=>{if(!box.open||box.dataset.filled)return;box.dataset.filled='1';const wait=el('p','Загружаю…','muted');box.append(wait);
  try{if(!newsCache.has(p.espnId))newsCache.set(p.espnId,fetchJson(NEWS_URL(p.espnId)));const feed=(await newsCache.get(p.espnId)).feed||[];wait.remove();
   if(!feed.length)box.append(el('p','Свежих новостей нет.','muted'));
   const hurt=newsInjuries(feed);
   if(hurt.length)box.append(el('p',`Травмы в новостях за последние месяцы: ${hurt.map(x=>`${bodyPart(x.part)} (${ddmm(x.first)}${x.last!==x.first?'–'+ddmm(x.last):''})`).join('; ')}.`,'muted'));
   const archive=await injuryArchive().catch(()=>null),episodes=archive?.players?.[String(p.espnId)]?.episodes||[];
   if(episodes.length)box.append(el('p',`Архив отчётов ESPN: ${episodes.map(e=>`${bodyPart(e.type)||'травма'}${e.detail?' · '+e.detail:''} ${ddmm(e.firstSeen)}${e.lastSeen!==e.firstSeen?'–'+ddmm(e.lastSeen):''}`).join('; ')}.`,'muted'));
   for(const n of feed.slice(0,3)){const item=el('div',null,'sp-news-item');item.append(el('small',new Date(n.published||n.lastModified).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})),el('strong',n.headline||''));if(n.story||n.description)item.append(el('p',String(n.story||n.description).replace(/<[^>]+>/g,'').slice(0,420)));box.append(item);}
  }catch{newsCache.delete(p.espnId);delete box.dataset.filled;wait.replaceChildren('Новости ESPN не загрузились. ',button('Повторить',()=>{wait.remove();fill();},'btn-ghost btn-sm'),' ',link('Открыть на ESPN ↗',`https://www.espn.com/nba/player/_/id/${p.espnId}`));}};
 box.addEventListener('toggle',fill);
 return box;
}
export function replacementPanel(p,base){
 const ctx=forGains(base);
 const box=el('div',null,'sp-replace'),money=teamBank(team,ctx.transfers),price=current(p,ctx).price,st=sportsTeam(team);
 box.append(el('h4',`Замена для ${p.name}`),el('p',`Бюджет до ${int(money+price)} (банк ${int(money)} + продажа ${int(price)}) · трансферов: ${transfersLeft(ctx,team)===Infinity?'без лимита':transfersLeft(ctx,team)+' из '+WEEKLY_TRANSFERS}. Цифры — сколько ФО ты получишь (+) или потеряешь (−) по сравнению с ${p.name}.`));
 if(st)box.append(el('p','Команда подключена к Sports.ru: трансфер делается там, здесь он появится сам примерно через минуту.','muted'));
 const search=el('input');search.type='search';search.enterKeyHint='search';search.placeholder='Найти свободного игрока';search.value=query;search.setAttribute('aria-label','Поиск замены для '+p.name);
 const list=el('ol',null,'sp-options'),verdictLine=el('p');
 const fill=()=>{const all=transferOptions(ctx,{team,outId:p.id,bankMoney:money,limit:query?1000:12,sort:horizon});
  const q=query.trim().toLowerCase(),shown=q?all.filter(o=>[o.player.name,o.player.sportsName,o.player.team].join(' ').toLowerCase().includes(q)).slice(0,12):all;
  list.replaceChildren(...shown.map(o=>optionRow(o,p.id,ctx)));
  const best=all[0]?.gain?.[horizon];verdictLine.className=best>0?'muted':'warning';
  verdictLine.textContent=!all.length?'Нет допустимых замен: не подходит позиция, банк или правила состава (rookie, клуб NBA).':best>0?'':`Замен лучше, чем ${p.name}, ${PERIOD_LONG[horizon]} нет — держи его.`;
  verdictLine.hidden=!verdictLine.textContent||Boolean(q);
  if(q&&!shown.length)list.append(el('li',`Никого не нашлось по «${query}» среди доступных ${p.positions.join('/')} до ${int(money+price)}.`,'muted'));};
 search.oninput=()=>{setQuery(search.value);fill();};
 if(st)box.append(link(`Открыть команду на Sports.ru ↗`,TEAM_URL(st.sportsTeamId),'btn-secondary btn-sm'));
 box.append(search,verdictLine,list);fill();return box;
}
export function teamSelect(){
 const pickTeam=el('select');for(let t=0;t<8;t++){const o=el('option',teamOption(t));o.value=String(t);o.title=teamLabel(t);pickTeam.append(o);}pickTeam.value=String(team);
 pickTeam.onchange=()=>{setTeam(Number(pickTeam.value));writeStored('fbl-season-team',String(team));setReplacing(null);renderSeason();};
 const l=el('label');l.append(el('span','Команда'),pickTeam);return l;
}
export function controls(ctx){
 const head=el('div',null,'sp-controls');
 const period=el('div',null,'segmented sp-period');period.setAttribute('role','group');period.setAttribute('aria-label','Период');
 for(const k of ['week','month','season']){const b=button(PERIOD[k],()=>{setHorizon(k);writeStored('fbl-season-horizon',horizon);renderSeason();},'');b.setAttribute('aria-pressed',String(horizon===k));b.title=horizons(ctx)[k].label;period.append(b);}
 const wrap=el('div',null,'sp-period-field');wrap.append(el('span','Период'),period);
 head.append(teamSelect(),wrap);
 return head;
}
export function record(moves,ctx){
 const used=Math.max(transfersThisWeek(ctx.transfers,team,ctx.today,gameWeeks(live)),fblTransfers(ctx.transfers,team,ctx.today).used);
 if(used+moves.length>WEEKLY_TRANSFERS&&!confirm(`У команды ${teamName(team)} будет ${count(used+moves.length,'трансфер','трансфера','трансферов')} на этой неделе при лимите ${WEEKLY_TRANSFERS}. Всё равно записать?`))return;
 const list=moves.map(m=>{const out=current(byId.get(m.outId),ctx);return {team,outId:m.outId,inId:m.player.id,date:ctx.today,outPrice:out.price,inPrice:m.player.price};});
 if(!confirm(list.map(x=>`${byId.get(x.outId).name} (${int(x.outPrice)}) → ${byId.get(x.inId).name} (${int(x.inPrice)})`).join('\n')+`\n\nЗаписать для ${teamName(team)} от ${ddmm(ctx.today)}? Затем отправь каждую запись в общий журнал лиги.`))return;
 try{seasonRosters([...ctx.transfers,...list]);}catch(e){alert(e.message);return;}
 setPending([...pending,...list]);writeStored('fbl-transfers',JSON.stringify(pending));setReplacing(null);renderSeason();
 document.querySelector('.sp-log')?.scrollIntoView({block:'start'});
}
