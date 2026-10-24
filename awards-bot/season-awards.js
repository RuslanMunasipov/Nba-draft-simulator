// The season's awards after the NBA's (owner, 24.10.2026), for the ceremony at the season's end and for the next
// season's draft: the All-FBL First, Second and Third Teams, the Rookie of the Year, the Defensive Player of the Year
// and the Iron Man, counted at any day of the season from the awards bot's archive (every line of every NBA game, its FBL
// points by the league's formula: core.js, fblFormula). Every NBA player counts, on a league roster or not (the draft
// needs them all); each is kept by his ESPN id, with the league's name and the FBL teams that hold him (heldBy).
import {perPlayer,POSITIONS} from './core.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc} from './messages.js';
import {plural} from '../src/format.js';
import {isFreeTransfer} from '../src/rules.js';

const round=x=>Math.round(Number(x)||0);
// A player's season as an award keeps it. extra: the numbers of the award.
const entry=(r,{who,heldBy},extra={})=>({key:`player:${r.a}`,name:who(r.a,r.n),club:r.c||null,games:r.games,fo:round(r.p),perGame:Math.round(10*r.p/Math.max(1,r.games))/10,
 fblTeams:(heldBy.get(r.a)||[]).map(t=>LEAGUE_TEAMS[t]?.name).filter(Boolean),...extra});
const byFo=(a,b)=>b.p-a.p||a.games-b.games||a.a.localeCompare(b.a);
// lines: the archive's lines of the season so far; who(a, n): the league's name; positionOf(a): a player's Sports.ru
// position (PG, SG, SF, PF, C); rookies: the ESPN ids of the rookies; heldBy: ESPN id -> the FBL teams holding him.
// transfers: season.js allTransfers; espnOf(id), nameOf(id): a database player's ESPN id and the league's name of him;
// table: season.js teamPoints (index 0-7), the places of GM of the year.
export function seasonAwards(lines,{who=(a,n)=>n,positionOf=()=>null,rookies=new Set(),heldBy=new Map(),top=3,transfers=[],espnOf=()=>null,nameOf=id=>String(id),table=null}={}){
 const rows=perPlayer(lines),ctx={who,heldBy};
 // All-FBL: a team a position, the best FBL points of the season at each; the Second and Third the next ones.
 const at=pos=>rows.filter(r=>positionOf(r.a)===pos).sort(byFo);
 const allFbl=[1,2,3].map(n=>({team:n,players:POSITIONS.map(pos=>{const r=at(pos)[n-1];return r?{position:pos,...entry(r,ctx)}:{position:pos,name:null};})}));
 const roy=rows.filter(r=>rookies.has(r.a)).sort(byFo).slice(0,top).map(r=>entry(r,ctx));
 // Defence by the box score: steals and blocks (stocks); at equal ones the fewer games.
 const stocks=r=>r.s.stl+r.s.blk;
 const dpoy=[...rows].sort((a,b)=>stocks(b)-stocks(a)||a.games-b.games||a.a.localeCompare(b.a)).slice(0,top)
  .map(r=>entry(r,ctx,{steals:r.s.stl,blocks:r.s.blk,stocks:stocks(r)}));
 // The most games of the season; at equal ones the more minutes.
 const ironMan=[...rows].sort((a,b)=>b.games-a.games||b.m-a.m||a.a.localeCompare(b.a)).slice(0,top).map(r=>entry(r,ctx,{minutes:round(r.m)}));
 // The season's leaders of a box-score number (its total; per game beside it).
 const leaders=of=>rows.filter(r=>of(r)>0).sort((a,b)=>of(b)-of(a)||a.games-b.games||a.a.localeCompare(b.a)).slice(0,top)
  .map(r=>entry(r,ctx,{value:of(r),valuePerGame:Math.round(10*of(r)/r.games)/10}));
 const stats={assists:leaders(r=>r.s.ast),rebounds:leaders(r=>r.s.reb),bricks:leaders(r=>r.s.fga-r.s.fgm),turnovers:leaders(r=>r.s.tov),fouls:leaders(r=>r.s.pf)};
 return {games:new Set(lines.map(l=>l.d)).size,allFbl,roy,dpoy,ironMan,...stats,...doubles(lines,ctx,top),...shooting(rows,ctx,top),fewestTurnovers:careful(rows,ctx,top),
  steady:steady(lines,rows,ctx,top),...dealAwards(lines,{transfers,espnOf,nameOf,who,table,top}),records:seasonRecords(lines,{who,heldBy,top})};
}

// Double-doubles, triple-doubles (owner, 24.10.2026): ten or more in two, three of points, rebounds, assists, steals,
// blocks; a triple-double counts as a double-double too, as the NBA counts them. A quadruple-double (four) is a
// nomination of its own: every one of the season, by date.
const TENS=['pts','reb','ast','stl','blk'],tens=l=>TENS.filter(k=>(l.s[k]||0)>=10).length;
function doubles(lines,ctx,top){
 const count=n=>{const by=new Map();for(const l of lines)if(tens(l)>=n)by.set(l.a,(by.get(l.a)||0)+1);return by;};
 const rows=perPlayer(lines),dd=count(2),td=count(3);
 const list=by=>rows.filter(r=>by.get(r.a)).sort((a,b)=>by.get(b.a)-by.get(a.a)||a.games-b.games||a.a.localeCompare(b.a)).slice(0,top).map(r=>entry(r,ctx,{count:by.get(r.a)}));
 const quadruple=lines.filter(l=>tens(l)>=4).sort((a,b)=>a.t.localeCompare(b.t)).map(l=>({key:`player:${l.a}`,name:ctx.who(l.a,l.n),club:l.c||null,
  fblTeams:(ctx.heldBy.get(l.a)||[]).map(t=>LEAGUE_TEAMS[t]?.name).filter(Boolean),date:l.d,game:l.e,fo:round(l.p),...Object.fromEntries(TENS.map(k=>[k,l.s[k]]))}));
 return {doubleDoubles:list(dd),tripleDoubles:list(td),quadrupleDoubles:quadruple};
}
// The league's regulars: games at least 60% of the most any player has played (the awards of rates need them).
export const QUALIFY={games:0.6,fgaPerGame:10,fg3aPerGame:5,minutesPerGame:30};
const regulars=rows=>{const most=Math.max(0,...rows.map(r=>r.games)),min=Math.max(1,Math.ceil(QUALIFY.games*most));return rows.filter(r=>r.games>=min);};
// The league's best shooters (owner, 24.10.2026): the best percentage of the regulars who shoot, from the field from ten
// attempts a game, threes from five. Lines without threes count none.
function shooting(rows,ctx,top){
 const best=(made,att,perGame)=>{const rate=x=>x.s[made]/x.s[att];
  return regulars(rows).filter(x=>x.s[att]>0&&x.s[att]>=perGame*x.games).sort((a,b)=>rate(b)-rate(a)||b.s[made]-a.s[made]||a.a.localeCompare(b.a)).slice(0,top)
   .map(x=>entry(x,ctx,{made:x.s[made],attempts:x.s[att],attemptsPerGame:Math.round(10*x.s[att]/x.games)/10,percent:Math.round(1000*rate(x))/10}));};
 return {fieldGoals:best('fgm','fga',QUALIFY.fgaPerGame),threes:best('fg3m','fg3a',QUALIFY.fg3aPerGame)};
}
// The fewest turnovers (owner, 24.10.2026: a turnover costs two FBL points): the regulars with thirty minutes a game and
// more, by turnovers a game; at equal ones the more minutes.
function careful(rows,ctx,top){
 const per=r=>r.s.tov/r.games,mins=r=>r.m/r.games;
 return regulars(rows).filter(r=>mins(r)>=QUALIFY.minutesPerGame).sort((a,b)=>per(a)-per(b)||mins(b)-mins(a)||a.a.localeCompare(b.a)).slice(0,top)
  .map(r=>entry(r,ctx,{turnovers:r.s.tov,turnoversPerGame:Math.round(10*per(r))/10,minutesPerGame:Math.round(10*mins(r))/10}));
}
// Mister Consistency: the steadiest of the season's top 50 by FBL points a game, with games at least 60% of the most any
// player has: the lowest spread of his games' points (standard deviation) to his average.
function steady(lines,rows,ctx,top){
 const most=Math.max(0,...rows.map(r=>r.games)),min=Math.max(2,Math.ceil(0.6*most));
 const games=new Map();for(const l of lines)(games.get(l.a)||games.set(l.a,[]).get(l.a)).push(l.p);
 const sd=r=>{const g=games.get(r.a),m=r.p/r.games;return Math.sqrt(g.reduce((s,x)=>s+(x-m)**2,0)/g.length);};
 return rows.filter(r=>r.games>=min&&r.p>0).sort((a,b)=>b.p/b.games-a.p/a.games).slice(0,50)
  .map(r=>({r,spread:sd(r)/(r.p/r.games)})).sort((a,b)=>a.spread-b.spread||b.r.p-a.r.p||a.r.a.localeCompare(b.r.a)).slice(0,top)
  .map(({r})=>entry(r,ctx,{spread:Math.round(10*sd(r))/10,worst:round(Math.min(...games.get(r.a)))}));
}
// The season's deals (owner, 24.10.2026), counted ones only (no pre-season free ones): what the player bought brought his
// team while it held him (from the deal's day until it sold him), and what the one sold scored in the same days. Deal of
// the year: the best difference; the anti-deal: the worst. GM of the year: the best sum of his deals' differences.
export function seasonDeals(transfers,lines,{espnOf=()=>null,nameOf=id=>String(id),who=(a,n)=>n}={}){
 const deals=transfers.filter(x=>Number.isInteger(x.team)&&x.inId&&x.outId&&!isFreeTransfer(x)).sort((a,b)=>String(a.at||a.date).localeCompare(String(b.at||b.date)));
 return deals.map((x,i)=>{
  const out=deals.slice(i+1).find(y=>y.team===x.team&&y.outId===x.inId),until=out?.date||null;
  const over=id=>{const a=espnOf(id),mine=a?lines.filter(l=>l.a===a&&l.d>=x.date&&(!until||l.d<until)):[];
   return {key:a?`player:${a}`:null,name:a?who(a,nameOf(id)):nameOf(id),fo:round(mine.reduce((s,l)=>s+l.p,0)),games:mine.length};};
  const bought=over(x.inId),sold=over(x.outId);
  return {t:x.team,team:LEAGUE_TEAMS[x.team]?.name||null,gm:LEAGUE_TEAMS[x.team]?.gm||null,date:x.date,until,bought,sold,difference:bought.fo-sold.fo};
 }).filter(d=>d.bought.games+d.sold.games>0);
}
function dealAwards(lines,{transfers,espnOf,nameOf,who,table,top}){
 const deals=seasonDeals(transfers,lines,{espnOf,nameOf,who});
 const place=t=>table?1+table.filter(p=>p>table[t]).length:null;
 const gm=LEAGUE_TEAMS.map((x,t)=>{const mine=deals.filter(d=>d.t===t);return {key:`gm:${t}`,t,team:x.name,gm:x.gm||null,deals:mine.length,net:mine.reduce((s,d)=>s+d.difference,0),place:place(t)};})
  .filter(x=>x.deals).sort((a,b)=>b.net-a.net||(a.place??9)-(b.place??9)||a.t-b.t).slice(0,top);
 const by=dir=>[...deals].sort((a,b)=>dir*(b.difference-a.difference)||String(a.date).localeCompare(String(b.date))).filter(d=>dir*d.difference>0).slice(0,top);
 return {gmOfTheYear:gm,dealOfTheYear:by(1),antiDeal:by(-1)};
}

// The season's records by category (owner, 24.10.2026): the season's totals (rec.total) and the single games (rec.game).
// of(s, line): the number of a box score; anti: a record nobody wants. At equal totals the fewer games ranks higher, at
// equal games the earlier one.
export const RECORD_CATEGORIES=[
 {key:'fo',label:'ФО',of:(s,l)=>l.p},{key:'pts',label:'Очки',of:s=>s.pts},{key:'reb',label:'Подборы',of:s=>s.reb},
 {key:'ast',label:'Передачи',of:s=>s.ast},{key:'stl',label:'Перехваты',of:s=>s.stl},{key:'blk',label:'Блоки',of:s=>s.blk},
 {key:'fgm',label:'Попадания с игры',of:s=>s.fgm},{key:'ftm',label:'Штрафные',of:s=>s.ftm},{key:'min',label:'Минуты',of:(s,l)=>l.m},
 {key:'tov',label:'Потери',of:s=>s.tov,anti:true},{key:'pf',label:'Фолы',of:s=>s.pf,anti:true},
 {key:'miss',label:'Промахи с игры',of:s=>s.fga-s.fgm,anti:true},
];
export function seasonRecords(lines,{who=(a,n)=>n,heldBy=new Map(),top=3}={}){
 const rows=perPlayer(lines),num=x=>Math.round(10*(Number(x)||0))/10;
 const held=a=>(heldBy.get(a)||[]).map(t=>LEAGUE_TEAMS[t]?.name).filter(Boolean);
 return RECORD_CATEGORIES.map(({key,label,of,anti})=>{
  const sum=r=>key==='fo'?r.p:key==='min'?r.m:of(r.s,r);
  const total=rows.filter(r=>sum(r)>0).sort((a,b)=>sum(b)-sum(a)||a.games-b.games||a.a.localeCompare(b.a)).slice(0,top)
   .map(r=>({key:`player:${r.a}`,name:who(r.a,r.n),club:r.c||null,fblTeams:held(r.a),value:num(sum(r)),games:r.games}));
  const game=lines.filter(l=>of(l.s,l)>0).sort((a,b)=>of(b.s,b)-of(a.s,a)||a.t.localeCompare(b.t)||a.a.localeCompare(b.a)).slice(0,top)
   .map(l=>({key:`player:${l.a}`,name:who(l.a,l.n),club:l.c||null,fblTeams:held(l.a),value:num(of(l.s,l)),date:l.d,game:l.e}));
  return {key,label,anti:!!anti,total,game};
 });
}

// The awards as the owner reads them (Telegram HTML).
export function seasonAwardsText(x){
 const who=p=>p?.name?`${esc(p.name)}${p.club?` (${esc(p.club)})`:''}${p.fblTeams?.length?` · ${esc(p.fblTeams.join(', '))}`:''}`:'—';
 const list=(rows,num)=>rows.length?rows.map((p,i)=>`${i+1}. ${who(p)} — ${num(p)}`).join('\n'):'—';
 const team=t=>`<b>${['Первая','Вторая','Третья'][t.team-1]} сборная FBL</b>\n${t.players.map(p=>`${p.position}: ${who(p)}${p.name?` — ${p.fo} ФО`:''}`).join('\n')}`;
 return [`🏅 <b>Награды сезона на сегодня</b> (игровых дней: ${x.games})`,...x.allFbl.map(team),
  `<b>🌱 Новичок года</b>\n${list(x.roy,p=>`${p.fo} ФО`)}`,`<b>🛡 Лучший защитник (перехваты + блоки)</b>\n${list(x.dpoy,p=>`${p.stocks} (${p.steals} перехв., ${p.blocks} блок.)`)}`,
  `<b>🦾 Железный человек</b>\n${list(x.ironMan,p=>`${p.games} ${plural(p.games,'матч','матча','матчей')}, ${p.minutes} мин`)}`,
  ...x.records?[otherAwardsText(x),seasonRecordsText(x.records)]:[]].join('\n\n');
}
const games=n=>`${n} ${plural(n,'матч','матча','матчей')}`;
function otherAwardsText(x){
 const who=p=>`${esc(p.name)}${p.club?` (${esc(p.club)})`:''}${p.fblTeams?.length?` · ${esc(p.fblTeams.join(', '))}`:''}`;
 const list=(rows,num)=>rows?.length?rows.map((p,i)=>`${i+1}. ${who(p)} — ${num(p)}`).join('\n'):'—';
 const shot=p=>`${p.percent}% (${p.made}/${p.attempts}, ${p.attemptsPerGame} за матч)`;
 const total=(...forms)=>p=>`${p.value} ${plural(p.value,...forms)} (${p.valuePerGame} за матч)`;
 const gm=g=>`${esc(g.team)}${g.gm?` (GM ${esc(g.gm)})`:''}`;
 const deal=d=>`${gm(d)}, ${DAY(d.date)}: ${esc(d.sold.name)} → ${esc(d.bought.name)} — ${d.difference>0?'+':''}${d.difference} ФО (купленный ${d.bought.fo}, проданный ${d.sold.fo})`;
 const deals=rows=>rows?.length?rows.map((d,i)=>`${i+1}. ${deal(d)}`).join('\n'):'—';
 const quad=x.quadrupleDoubles?.length?x.quadrupleDoubles.map(q=>`${who(q)}, ${DAY(q.date)}: ${TENS.map(k=>q[k]).join('/')} (очки/подборы/передачи/перехваты/блоки)`).join('\n'):'Пока не случилось.';
 return [
  `<b>🎯 Ассистент года</b>\n${list(x.assists,total('передача','передачи','передач'))}`,`<b>🧲 Подборщик года</b>\n${list(x.rebounds,total('подбор','подбора','подборов'))}`,
  `<b>✌️ Дабл-даблы</b>\n${list(x.doubleDoubles,p=>`${p.count} за ${games(p.games)}`)}`,`<b>🔺 Трипл-даблы</b>\n${list(x.tripleDoubles,p=>`${p.count} за ${games(p.games)}`)}`,
  `<b>💎 Квадрупл-дабл</b>\n${quad}`,
  `<b>🏹 Лучшие шутеры лиги</b>\nС игры (от ${QUALIFY.fgaPerGame} бросков за матч):\n${list(x.fieldGoals,shot)}\nТрёхочковые (от ${QUALIFY.fg3aPerGame} бросков за матч):\n${list(x.threes,shot)}`,
  `<b>🧤 Меньше всего потерь</b> (от ${QUALIFY.minutesPerGame} минут за матч)\n${list(x.fewestTurnovers,p=>`${p.turnoversPerGame} за матч (${p.turnovers} за ${games(p.games)}, ${p.minutesPerGame} мин)`)}`,
  `<b>📏 Мистер стабильность</b>\n${list(x.steady,p=>`${p.perGame} ФО за матч, разброс ±${p.spread}, худший матч ${p.worst}`)}`,
  `<b>👔 GM года</b> (сумма сделок сезона)\n${x.gmOfTheYear?.length?x.gmOfTheYear.map((g,i)=>`${i+1}. ${gm(g)} — ${g.net>0?'+':''}${g.net} ФО за ${g.deals} ${plural(g.deals,'сделку','сделки','сделок')}${g.place?`, ${g.place}-е место`:''}`).join('\n'):'—'}`,
  `<b>🤝 Сделка года</b>\n${deals(x.dealOfTheYear)}`,`<b>🙈 Сделка года наоборот</b>\n${deals(x.antiDeal)}`,
  `<b>🧱 Кирпич года</b>\n${list(x.bricks,total('промах','промаха','промахов'))}`,`<b>🎁 Король потерь</b>\n${list(x.turnovers,total('потеря','потери','потерь'))}`,`<b>🚨 Фол-машина</b>\n${list(x.fouls,total('фол','фола','фолов'))}`,
 ].join('\n\n');
}
// The records as the owner reads them: a category a block, the season's leaders, then the best single games.
const DAY=d=>`${d.slice(8,10)}.${d.slice(5,7)}`;
export function seasonRecordsText(rec){
 const who=p=>`${esc(p.name)}${p.club?` (${esc(p.club)})`:''}${p.fblTeams?.length?` · ${esc(p.fblTeams.join(', '))}`:''}`;
 const rows=(list,tail)=>list.length?list.map((p,i)=>`${i+1}. ${who(p)} — <b>${p.value}</b>${tail(p)}`).join('\n'):'—';
 const block=c=>`<b>${c.anti?'🗑':'📈'} ${c.label}</b>\nЗа сезон:\n${rows(c.total,p=>` за ${p.games} ${plural(p.games,'матч','матча','матчей')}`)}\nЗа матч:\n${rows(c.game,p=>` (${DAY(p.date)})`)}`;
 return [`📚 <b>Рекорды сезона</b>`,...rec.filter(c=>!c.anti).map(block),`🗑 <b>Антирекорды сезона</b>`,...rec.filter(c=>c.anti).map(block)].join('\n\n');
}
