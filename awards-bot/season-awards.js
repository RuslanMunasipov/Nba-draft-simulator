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
 return {games:new Set(lines.map(l=>l.d)).size,allFbl,roy,dpoy,ironMan};
}

// The awards as the owner reads them (Telegram HTML).
export function seasonAwardsText(x){
 const who=p=>p?.name?`${esc(p.name)}${p.club?` (${esc(p.club)})`:''}${p.fblTeams?.length?` · ${esc(p.fblTeams.join(', '))}`:''}`:'—';
 const list=(rows,num)=>rows.length?rows.map((p,i)=>`${i+1}. ${who(p)} — ${num(p)}`).join('\n'):'—';
 const team=t=>`<b>${['Первая','Вторая','Третья'][t.team-1]} сборная FBL</b>\n${t.players.map(p=>`${p.position}: ${who(p)}${p.name?` — ${p.fo} ФО`:''}`).join('\n')}`;
 return [`🏅 <b>Награды сезона на сегодня</b> (игровых дней: ${x.games})`,...x.allFbl.map(team),
  `<b>🌱 Новичок года</b>\n${list(x.roy,p=>`${p.fo} ФО`)}`,`<b>🛡 Лучший защитник (перехваты + блоки)</b>\n${list(x.dpoy,p=>`${p.stocks} (${p.steals} перехв., ${p.blocks} блок.)`)}`,
  `<b>🦾 Железный человек</b>\n${list(x.ironMan,p=>`${p.games} ${plural(p.games,'матч','матча','матчей')}, ${p.minutes} мин`)}`].join('\n\n');
}
