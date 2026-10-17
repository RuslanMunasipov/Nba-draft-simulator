// ESPN returns all competitions even when seasontype is supplied.
export function parseOnlineGames(data, type) {
 const pattern = {'1': /\bPreseason\b/i, '2': /\bRegular Season\b/i, '3': /\b(?:Postseason|Playoffs)\b/i}[String(type)];
 if (!pattern) return [];
 const rows=[],seen=new Set();
 for (const group of data.seasonTypes||[]) {
  if (!pattern.test(group.displayName||'')) continue;
  for (const category of group.categories||[]) for (const game of category.events||[]) {
   const event=data.events?.[game.eventId];
   if (!event || event.team?.isAllStar || event.opponent?.isAllStar || seen.has(String(game.eventId))) continue;
   const stats=Object.fromEntries((data.labels||[]).map((label,i)=>[label,game.stats?.[i]]));
   if (stats.PTS==null) continue;
   seen.add(String(game.eventId));rows.push({event,stats});
  }
 }
 return rows;
}
