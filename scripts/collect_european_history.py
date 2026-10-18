"""Collect official EuroLeague/EuroCup event histories, with resumable raw evidence.
No automatic mapping to NBA identities, model fitting, app tests or deployment.
"""
import argparse,gzip,hashlib,json,math,time,urllib.request
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

def fetch(url,root):
 key=hashlib.sha256(url.encode()).hexdigest();index=root/'requests'/(key+'.json')
 if index.exists():
  meta=json.loads(index.read_text());raw=gzip.decompress((root/meta['rawPath']).read_bytes())
  if hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('Checksum mismatch')
  return json.loads(raw),meta
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(request,timeout=20) as response:raw=response.read(20_000_001)
 if len(raw)>20_000_000:raise ValueError('Response exceeds size bound')
 data=json.loads(raw);sha=hashlib.sha256(raw).hexdigest();path=Path('raw')/sha[:2]/(sha+'.json.gz');(root/path).parent.mkdir(parents=True,exist_ok=True);(root/path).write_bytes(gzip.compress(raw,mtime=0))
 meta=dict(sourceUrl=url,rawPath=str(path),sha256=sha,fetchedAt=datetime.now(timezone.utc).isoformat(),publishedAt=None)
 index.parent.mkdir(parents=True,exist_ok=True);index.write_text(json.dumps(meta));time.sleep(1);return data,meta

def normalize(payload,game,season):
 output=dict(eventId=game['identifier'],season=season,date=game.get('utcDate'),calendar=game,players=[],participation=[],coaches=[],warnings=[])
 mapping={'Points':'pts','FieldGoalsMade2':'fg2m','FieldGoalsAttempted2':'fg2a','FieldGoalsMade3':'fg3m','FieldGoalsAttempted3':'fg3a','FreeThrowsMade':'ftm','FreeThrowsAttempted':'fta','TotalRebounds':'reb','OffensiveRebounds':'oreb','DefensiveRebounds':'dreb','Assistances':'ast','Steals':'stl','Turnovers':'tov','BlocksFavour':'blk','FoulsCommited':'pf'}
 for team in payload.get('Stats',[]):
  output['coaches'].append(dict(team=team.get('Team'),name=team.get('Coach'),evidence='AS_REPORTED_IN_GAME_PROTOCOL',roleTenureNotInferred=True))
  points=0;ids=set()
  for player in team.get('PlayersStats',[]):
   pid=(player.get('Player_ID') or '').strip();minutes=player.get('Minutes');participation=dict(playerId=pid,team=player.get('Team'),name=player.get('Player'),sourceMinutes=minutes,isStarter=player.get('IsStarter'),sourceIsPlaying=player.get('IsPlaying'))
   output['participation'].append(participation)
   if minutes=='DNP':continue
   try:
    if not pid or pid in ids:raise ValueError('Missing or duplicated native player ID')
    ids.add(pid);parts=str(minutes).split(':')
    if len(parts)!=2:raise ValueError('Unknown minute representation')
    stats={target:float(player[source]) for source,target in mapping.items()};stats['minutes']=float(parts[0])+float(parts[1])/60
    if any(not math.isfinite(x) or x<0 for x in stats.values()):raise ValueError('Invalid statistic')
    if any(stats[a]>stats[b] for a,b in [('fg2m','fg2a'),('fg3m','fg3a'),('ftm','fta')]):raise ValueError('Makes exceed attempts')
    stats['fgm']=stats['fg2m']+stats['fg3m'];stats['fga']=stats['fg2a']+stats['fg3a'];points+=stats['pts']
    if stats['pts']!=2*stats['fg2m']+3*stats['fg3m']+stats['ftm']:output['warnings'].append(dict(kind='POINT_COMPONENT_MISMATCH',playerId=pid))
    output['players'].append(dict(playerId=pid,provider='EUROLEAGUE',name=player.get('Player'),team=player.get('Team'),stats=stats,valueKind='OBSERVED',nbaIdentityStatus='NOT_MAPPED'))
   except Exception as exc:output['warnings'].append(dict(kind='PLAYER_ROW_NOT_NORMALIZED',playerId=pid,reason=str(exc)))
  expected=team.get('totr',{}).get('Points')
  if expected is None or points!=float(expected):output['warnings'].append(dict(kind='TEAM_POINTS_MISMATCH',team=team.get('Team'),reported=expected,parsed=points))
 if len(payload.get('Stats',[]))!=2 or not output['players']:output['warnings'].append(dict(kind='INCOMPLETE_BOXSCORE'))
 output['status']='NORMALIZED_WITH_WARNINGS' if output['warnings'] else 'NORMALIZED_POINTS_RECONCILED'
 return output

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('.cache/europe-history'));parser.add_argument('--requests',type=int,default=18000);args=parser.parse_args();root=args.output;root.mkdir(parents=True,exist_ok=True)
 calendars=[];results=[];failures=[];processed=0;stopped=False
 # Current ongoing season contributes played games only; unplayed games stay calendar evidence.
 for code,first in [('E',2000),('U',2002)]:
  for year in range(first,2027):
   season=code+str(year)
   try:
    url=f'https://api-live.euroleague.net/v2/competitions/{code}/seasons/{season}/games';data,meta=fetch(url,root)
    games=data.get('data',[]);complete=len(games)==data.get('total');calendars.append(dict(season=season,total=data.get('total'),returned=len(games),source=meta,providerPaginationComplete=complete))
    if not complete:failures.append(dict(season=season,kind='CALENDAR_PAGINATION_INCOMPLETE'));continue
    if not games:failures.append(dict(season=season,kind='EMPTY_CALENDAR_UNVERIFIED'));continue
   except Exception as exc:
    failures.append(dict(season=season,kind='CALENDAR_FETCH_FAILED',reason=str(exc)))
    if getattr(exc,'code',None) in (403,429):stopped=True;break
    continue
   for game in games:
    if not game.get('played'):continue
    if processed>=args.requests:stopped=True;break
    normalized=root/'games'/(game['identifier']+'.json')
    if normalized.exists():results.append(json.loads(normalized.read_text()));continue
    try:
     url=f"https://live.euroleague.net/api/Boxscore?gamecode={game['gameCode']}&seasoncode={season}";payload,meta=fetch(url,root);processed+=1
     row=normalize(payload,game,season);row['source']=meta;normalized.parent.mkdir(parents=True,exist_ok=True);normalized.write_text(json.dumps(row,ensure_ascii=False));results.append(row)
    except Exception as exc:
     processed+=1;failures.append(dict(season=season,eventId=game.get('identifier'),kind='PROTOCOL_FETCH_FAILED',reason=str(exc)))
     if getattr(exc,'code',None) in (403,429):stopped=True;break
    if processed%100==0:print(json.dumps(dict(processed=processed,season=season,statuses=dict(Counter(r['status'] for r in results)))),flush=True)
   if stopped:break
  if stopped:break
 report=dict(asOf=datetime.now(timezone.utc).isoformat(),status='INCOMPLETE_UNTIL_INDEPENDENT_RECONCILIATION_AND_ID_MAPPING',calendars=calendars,protocols=len(results),playerGames=sum(len(r['players']) for r in results),statuses=dict(Counter(r['status'] for r in results)),failures=failures,stoppedBeforeAllSeasons=stopped,limitations=['Native EuroLeague IDs are not silently joined to NBA names.','These tournaments do not cover domestic leagues or national teams.','Historical starting years do not assert availability of every protocol.','Per-game coach names do not establish all tenure dates.'])
 (root/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('EUROPE_REPORT_BEGIN'+json.dumps(report,ensure_ascii=False)+'EUROPE_REPORT_END',flush=True)
if __name__=='__main__':main()
