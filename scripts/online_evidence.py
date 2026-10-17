"""Fetch full careers and recent non-NBA samples without user files.
All competitions and source timestamps stay explicit. No SL -> NBA equivalence.
"""
import concurrent.futures,hashlib,json,time,urllib.request
from collections import defaultdict
from datetime import datetime,timezone,timedelta
from pathlib import Path
from build_default_database import normalize

SITE='https://site.api.espn.com/apis/site/v2/sports/basketball/'
WEB='https://site.web.api.espn.com/apis/common/v3/sports/basketball/'
CACHE=Path('.cache/online');CACHE.mkdir(parents=True,exist_ok=True)

def fetch(url,ttl=3600):
 path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 old=json.loads(path.read_text()) if path.exists() else None
 if old and time.time()-old['time']<ttl:return old['data'],old['fetchedAt'],False
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'FBL-Draft-Intelligence/0.6'})
  with urllib.request.urlopen(req,timeout=15) as r:data=json.load(r)
  now=datetime.now(timezone.utc).isoformat()
  path.write_text(json.dumps(dict(time=time.time(),fetchedAt=now,data=data)))
  return data,now,False
 except Exception:
  if old:return old['data'],old['fetchedAt'],True
  raise

def number(value):
 return float(str(value).replace(',',''))
def pair(value):
 a,b=str(value).split('-');return number(a),number(b)
def parse_career(payload):
 categories={c['name']:c for c in payload.get('categories',[])}
 avg=categories.get('averages',{});totals=categories.get('totals',{})
 averages={(r.get('season',{}).get('year'),r.get('teamId')):dict(zip(avg.get('names',[]),r['stats'])) for r in avg.get('statistics',[])}
 output=[]
 for row in totals.get('statistics',[]):
  year=row.get('season',{}).get('year')
  if not isinstance(year,int):continue
  a=averages.get((year,row.get('teamId')));s=dict(zip(totals.get('names',[]),row.get('stats',[])))
  if not a:continue
  try:
   games=number(a['gamesPlayed']);minutes=number(a['avgMinutes'])
   fgm,fga=pair(s['fieldGoalsMade-fieldGoalsAttempted']);ftm,fta=pair(s['freeThrowsMade-freeThrowsAttempted'])
   if not 0<games<=82 or not 0<minutes<=48 or fgm>fga or ftm>fta:continue
   values=dict(pts=number(s['points']),reb=number(s['totalRebounds']),ast=number(s['assists']),stl=number(s['steals']),
               blk=number(s['blocks']),tov=number(s['turnovers']),pf=number(s['fouls']),fgm=fgm,fga=fga,ftm=ftm,fta=fta)
   if any(v<0 for v in values.values()):continue
   values={k:v/games for k,v in values.items()}
   values['minutes']=minutes
   output.append(dict(season=row['season'].get('displayName'),year=year,games=games,teamId=row.get('teamId'),
                      team=row.get('teamSlug'),competition='NBA_REGULAR',perGame=values))
  except (KeyError,TypeError,ValueError):continue
 # A traded-player total row must not be counted again alongside team splits.
 by_year=defaultdict(list)
 for row in output:by_year[row['year']].append(row)
 result=[]
 for year,rows in by_year.items():
  total=next((r for r in rows if str(r['teamId']) in ('0','-1') or r.get('team') in ('tot','total')),None)
  if total:result.append(total);continue
  games=sum(r['games'] for r in rows)
  if games>82:raise ValueError('Duplicated career season '+str(year))
  result.append(dict(rows[-1],games=games,perGame={k:sum(r['perGame'][k]*r['games'] for r in rows)/games for k in rows[0]['perGame']}))
 return sorted(result,key=lambda r:r['year'])

def parse_box(payload,event,league):
 result=[]
 for team in payload.get('boxscore',{}).get('players',[]):
  for group in team.get('statistics',[]):
   labels=group.get('labels',group.get('names',[]))
   for athlete in group.get('athletes',[]):
    if athlete.get('didNotPlay'):continue
    s=dict(zip(labels,athlete.get('stats',[])))
    try:
     raw=str(s['MIN']);minutes=number(raw.split(':')[0])+number(raw.split(':')[1])/60 if ':' in raw else number(raw)
     if minutes<=0:continue
     fgm,fga=pair(s['FG']);ftm,fta=pair(s['FT'])
     stat=dict(minutes=minutes,pts=number(s['PTS']),reb=number(s['REB']),ast=number(s['AST']),stl=number(s['STL']),
               blk=number(s['BLK']),tov=number(s['TO']),pf=number(s['PF']),fgm=fgm,fga=fga,ftm=ftm,fta=fta)
     if fgm>fga or ftm>fta or any(v<0 for v in stat.values()):continue
     result.append(dict(espnId=str(athlete['athlete']['id']),name=athlete['athlete'].get('displayName'),
                        eventId=str(event['id']),date=event.get('date'),competition=league,stats=stat))
    except (KeyError,TypeError,ValueError):continue
 return result

def recent_competition(league,dates):
 url=SITE+league+'/scoreboard?dates='+dates+'&limit=1000'
 try:
  payload,at,stale=fetch(url)
 except Exception as exc:
  return [],dict(source=url,checkedAt=None,stale=False,events=0,playerGames=0,errors=[dict(error=str(exc))])
 events=[e for e in payload.get('events',[]) if e.get('status',{}).get('type',{}).get('completed')]
 errors=[];rows=[]
 def game(event):
  source=SITE+league+'/summary?event='+str(event['id'])
  try:
   box,checked,old=fetch(source,86400*30)
   parsed=parse_box(box,event,league)
   return parsed,None
  except Exception as exc:return [],dict(event=event['id'],error=str(exc))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for parsed,error in pool.map(game,events):
   rows.extend(parsed)
   if error:errors.append(error)
 return rows,dict(source=url,checkedAt=at,stale=stale,events=len(events),playerGames=len(rows),errors=errors)

def build():
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text());now=datetime.now(timezone.utc)
 listing,listing_at,stale=fetch('https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000')
 names=defaultdict(list)
 for item in listing.get('items',[]):names[normalize(item.get('displayName',''))].append(item)
 for p in data['players']:
  matches=names.get(normalize(p['name']),[])
  if not p.get('espnId') and len(matches)==1:p['espnId']=str(matches[0]['id'])
  if len(matches)==1:
   p['age']=matches[0].get('age');p['draftContext']=matches[0].get('draft')
 careers={};errors=[]
 def career(p):
  if not p.get('espnId'):return p['id'],None,'No unique provider ID'
  source=WEB+'nba/athletes/'+p['espnId']+'/stats'
  try:
   payload,at,stale=fetch(source,21600)
   seasons=parse_career(payload)
   return p['id'],dict(source=source,checkedAt=at,stale=stale,seasons=seasons),None
  except Exception as exc:return p['id'],None,str(exc)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for identifier,record,error in pool.map(career,data['players']):
   if record:careers[str(identifier)]=record
   if error:errors.append(dict(id=identifier,error=error))
   if (len(careers)+len(errors))%100==0:print('Online careers processed',len(careers)+len(errors),flush=True)
 summer,summer_audit=recent_competition('nba-summer-las-vegas',str(now.year))
 preseason=[];daily=[]
 start=datetime(now.year,10,1,tzinfo=timezone.utc)
 dates=[(start+timedelta(days=i)).strftime('%Y%m%d') for i in range(max(0,(now-start).days+1))]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for rows,report in pool.map(lambda date:recent_competition('nba',date),dates):preseason.extend(rows);daily.append(report)
 preseason_audit=dict(days=len(daily),events=sum(r['events'] for r in daily),playerGames=len(preseason),errors=[e for r in daily for e in r['errors']])
 by_espn=defaultdict(list)
 for row in summer+preseason:by_espn[row['espnId']].append(row)
 for p in data['players']:
  p['onlineEvidence']=dict(career=careers.get(str(p['id'])),recentGames=by_espn.get(p.get('espnId'),[]),
                           note='NBA, Summer League and preseason are distinct competitions; no unvalidated numeric equivalence.')
 report=dict(checkedAt=now.isoformat(),careerPlayers=len(careers),careerSeasons=sum(len(c['seasons']) for c in careers.values()),
             earliestYear=min((s['year'] for c in careers.values() for s in c['seasons']),default=None),
             summer=summer_audit,preseason=preseason_audit,errors=errors,
             limitations=['Public provider coverage is finite, not every resource or every season.','Career rows use provider rounded minutes, not reconstructed game result bonuses.','Summer/preseason stats are evidence, not NBA forecast points.'])
 data['onlineAudit']=report
 path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 Path('public/data/online-evidence.json').write_text(json.dumps(dict(audit=report,players=[dict(id=p['id'],name=p['name'],espnId=p.get('espnId'),evidence=p['onlineEvidence']) for p in data['players']]),ensure_ascii=False),encoding='utf-8')
 print(json.dumps(dict(report,errorsCount=len(errors),errors=errors[:5]),ensure_ascii=False))
if __name__=='__main__':build()
