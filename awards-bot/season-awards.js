// The season's awards after the NBA's (owner, 24.10.2026), for the ceremony at the season's end and for the next
// season's draft: the All-FBL First, Second and Third Teams, the Rookie of the Year, the Defensive Player of the Year
// and the Iron Man, counted at any day of the season from the awards bot's archive (every line of every NBA game, its FBL
// points by the league's formula: core.js, fblFormula). Every NBA player counts, on a league roster or not (the draft
// needs them all); each is kept by his ESPN id, with the league's name and the FBL teams that hold him (heldBy).
import {perPlayer,POSITIONS} from './core.js';
import {LEAGUE_TEAMS} from '../src/teams.js';
import {esc} from './messages.js';
import {plural} from '../src/format.js';

const round=x=>Math.round(Number(x)||0);
// A player's season as an award keeps it. extra: the numbers of the award.
const entry=(r,{who,heldBy},extra={})=>({key:`player:${r.a}`,name:who(r.a,r.n),club:r.c||null,games:r.games,fo:round(r.p),perGame:Math.round(10*r.p/Math.max(1,r.games))/10,
 fblTeams:(heldBy.get(r.a)||[]).map(t=>LEAGUE_TEAMS[t]?.name).filter(Boolean),...extra});
const byFo=(a,b)=>b.p-a.p||a.games-b.games||a.a.localeCompare(b.a);
// lines: the archive's lines of the season so far; who(a, n): the league's name; positionOf(a): a player's Sports.ru
// position (PG, SG, SF, PF, C); rookies: the ESPN ids of the rookies; heldBy: ESPN id -> the FBL teams holding him.
export function seasonAwards(lines,{who=(a,n)=>n,positionOf=()=>null,rookies=new Set(),heldBy=new Map(),top=3}={}){
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
 return {games:new Set(lines.map(l=>l.d)).size,allFbl,roy,dpoy,ironMan,records:seasonRecords(lines,{who,heldBy,top})};
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
  ...x.records?[seasonRecordsText(x.records)]:[]].join('\n\n');
}
// The records as the owner reads them: a category a block, the season's leaders, then the best single games.
const DAY=d=>`${d.slice(8,10)}.${d.slice(5,7)}`;
export function seasonRecordsText(rec){
 const who=p=>`${esc(p.name)}${p.club?` (${esc(p.club)})`:''}${p.fblTeams?.length?` · ${esc(p.fblTeams.join(', '))}`:''}`;
 const rows=(list,tail)=>list.length?list.map((p,i)=>`${i+1}. ${who(p)} — <b>${p.value}</b>${tail(p)}`).join('\n'):'—';
 const block=c=>`<b>${c.anti?'🗑':'📈'} ${c.label}</b>\nЗа сезон:\n${rows(c.total,p=>` за ${p.games} ${plural(p.games,'матч','матча','матчей')}`)}\nЗа матч:\n${rows(c.game,p=>` (${DAY(p.date)})`)}`;
 return [`📚 <b>Рекорды сезона</b>`,...rec.filter(c=>!c.anti).map(block),`🗑 <b>Антирекорды сезона</b>`,...rec.filter(c=>c.anti).map(block)].join('\n\n');
}
