"""Normalize provider observations without inferring unreported values."""
import math

def value(raw):
 result=float(str(raw).replace(',',''))
 if not math.isfinite(result) or result<0:raise ValueError('Invalid nonnegative statistic')
 return result

def game_stats(names,values):
 raw=dict(zip(names,values));s={}
 simple={'points':'pts','totalRebounds':'reb','assists':'ast','steals':'stl','blocks':'blk','turnovers':'tov','fouls':'pf'}
 for source,target in simple.items():s[target]=value(raw[source])
 for source,made,attempt in [('fieldGoalsMade-fieldGoalsAttempted','fgm','fga'),('freeThrowsMade-freeThrowsAttempted','ftm','fta'),('threePointFieldGoalsMade-threePointFieldGoalsAttempted','fg3m','fg3a')]:
  a,b=str(raw[source]).split('-');s[made]=value(a);s[attempt]=value(b)
  if s[made]>s[attempt]:raise ValueError('Makes exceed attempts')
 minute=str(raw['minutes'])
 if ':' in minute:
  m,sec=minute.split(':');s['minutes']=value(m)+value(sec)/60
 else:s['minutes']=value(minute)
 return s

def normalize_gamelog(data,year):
 filters={f['name']:f.get('value') for f in data.get('filters',[])}
 if filters.get('season') is not None and str(filters['season'])!=str(year):raise ValueError('Provider returned another season')
 result=[];seen=set();events=data.get('events',{})
 for block in data.get('seasonTypes',[]):
  label=block.get('displayName','');low=label.lower()
  kind='PRESEASON' if 'preseason' in low else 'POSTSEASON' if 'postseason' in low or 'playoff' in low else 'REGULAR' if 'regular' in low else 'UNCLASSIFIED'
  for category in block.get('categories',[]):
   for row in category.get('events',[]):
    eid=str(row.get('eventId'));key=(kind,eid)
    if key in seen:continue
    seen.add(key);meta=events.get(eid,{})
    item=dict(eventId=eid,season=year,seasonType=kind,sourceSeasonType=label,sourceTeam=block.get('displayTeam'),event=meta,rawStats=dict(zip(data.get('names',[]),row.get('stats',[]))))
    try:item.update(stats=game_stats(data['names'],row['stats']),status='NORMALIZED')
    except Exception as exc:item.update(status='UNNORMALIZED',error=str(exc))
    result.append(item)
 return result


def career_inventory_without_totals(payload,existing):
 """Keep source-reported participation even when a totals row is absent.
 Rounded averages never reconstruct missing counting totals.
 """
 present={r['year'] for r in existing};by_year={}
 for category in payload.get('categories',[]):
  if category.get('name')!='averages':continue
  for row in category.get('statistics',[]):
   season=row.get('season',{});year=season.get('year')
   if not isinstance(year,int) or year in present:continue
   raw=dict(zip(category.get('names',[]),row.get('stats',[])))
   try:games=value(raw['gamesPlayed'])
   except (KeyError,ValueError,TypeError):continue
   if not games.is_integer() or not 0<games<=90:continue
   by_year.setdefault(year,[]).append(dict(year=year,season=season.get('displayName'),games=games,teamId=row.get('teamId'),sourceAverages=raw,statsStatus='TOTALS_NOT_REPORTED',perGame=None))
 result=[]
 for year,rows in by_year.items():
  aggregates=[r for r in rows if r['teamId'] is None]
  if len(aggregates)==1:result.append(aggregates[0]);continue
  ids=[r['teamId'] for r in rows]
  if len(set(ids))!=len(ids):raise ValueError('Ambiguous average-only season stints '+str(year))
  games=sum(r['games'] for r in rows)
  if games>90:raise ValueError('Ambiguous average-only season game count '+str(year))
  result.append(dict(rows[0],games=games,sourceStints=rows))
 return result
