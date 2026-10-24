// Season → Игроки without the page (src/season-ui/players.js draws it): the market rows, what the filters show and how many
// rows each of them hides, and the NBA players Sports.ru does not sell. Pure, so tests/season-market.test.js checks it.
import {current,onSale,seasonForm,takenIds} from './season.js';
import {playerSearchMatches} from './player-search.js';

// Any number of games by default: «от 1» hid 128 free players without a game and the page did not say so (24.10.2026);
// an unplayed player already sorts last by average, his forecast breaking the tie.
export const MARKET_DEFAULT={scope:'free',pos:'all',minGames:0,maxPrice:0,sort:'avg',streaks:false,rookies:false};
// Every filter at its widest; the sort is not a filter.
export const MARKET_WIDEST={scope:'all',pos:'all',minGames:0,maxPrice:0,streaks:false,rookies:false};
const MARKET_VERSION=1;
// Settings stored on this device: an object saved before the version field loses its minGames (the whole object is saved
// on any change, so a stored «от 1» would outlive the new default); everything else the owner chose stays.
export function marketSettings(stored){
 const s=stored&&typeof stored==='object'?{...stored}:{};if(!s.version)delete s.minGames;
 return {...MARKET_DEFAULT,...s,version:MARKET_VERSION};
}
// The market of the players view: every player whose Sports.ru card is on sale, plus an off-sale card an FBL team holds
// (he stays on the team, his price frozen: season.js frozen). A free off-sale card cannot be bought, so it is not listed
// (Lonnie Walker's card at «Бешикташ» and 17 emptied ones, 24.10.2026). A row: {p, c (current), row (the card), owner
// (FBL team, -1 held by a team not resolved yet, null free), form (seasonForm), sale (onSale)}.
export function marketRows(ctx){
 const taken=takenIds(ctx),own=new Map(),out=[];ctx.rosters.forEach((ids,t)=>ids.forEach(id=>own.set(id,t)));
 for(const p of ctx.players){
  const row=ctx.live?.players?.[p.sportsId];if(!row)continue;
  const owner=own.has(p.id)?own.get(p.id):taken.has(p.id)?-1:null,sale=onSale(row,ctx.live);
  if(owner===null&&!sale)continue;
  out.push({p,c:current(p,ctx),row,owner,form:seasonForm(p,row),sale});
 }
 return out;
}
// Search reads the card's Russian full name and club too, as the row shows them (Майк Конли, 24.10.2026: 275 of 466 rows
// were not found by the name they show).
export const marketFind=(r,query)=>playerSearchMatches({...r.p,fullName:r.row?.fullName,club:r.row?.club},query);
export function marketFilter(m,query=''){
 const q=String(query??'').trim();
 return r=>(m.scope!=='free'||r.owner===null)&&(m.pos==='all'||r.c.positions.includes(m.pos))&&r.form.games>=m.minGames&&(!m.maxPrice||r.c.price<=m.maxPrice)
  &&(!m.streaks||Boolean(r.form.streak))&&(!m.rookies||r.p.isRookie===true)&&(!q||marketFind(r,q));
}
// The rows the settings show for a query and how many more each filter would show if it alone were widened: scope (on an
// FBL team), games (not played enough), other (position, price cap, streaks, rookies); all — with every filter widened.
// One filter relaxed at a time, so each number is exactly what its button adds.
export function marketView(all,m,query=''){
 const q=String(query??'').trim(),found=q?all.filter(r=>marketFind(r,q)):all,rows=found.filter(marketFilter(m));
 const more=s=>found.filter(marketFilter({...m,...s})).length-rows.length;
 return {rows,found:found.length,hidden:{scope:more({scope:'all'}),games:more({minGames:0}),other:more({pos:'all',maxPrice:0,streaks:false,rookies:false}),all:found.length-rows.length}};
}
// NBA players Sports.ru does not sell: database players at an NBA club (ESPN's team) without a card on sale that no FBL
// team holds, by club and name. They cannot be bought (Sports.ru owns prices, positions and transfers), so the market list
// leaves them out and the page lists them apart (60 on 24.10.2026: Tobe Awaka, Graham Ike, James Wiseman and 55 more
// without a card, Dalton Knecht's and Jaxson Hayes's cards emptied).
export function unsoldPlayers(base,live,held=new Set()){
 return base.filter(p=>p.team&&!held.has(p.id)&&!onSale(live?.players?.[p.sportsId],live))
  .sort((a,b)=>String(a.team).localeCompare(String(b.team))||String(a.name).localeCompare(String(b.name)));
}
// Cards on sale in the snapshot (464 on Sports.ru's market list of 24.10.2026).
export const cardsOnSale=live=>Object.values(live?.players||{}).filter(r=>onSale(r,live)).length;
