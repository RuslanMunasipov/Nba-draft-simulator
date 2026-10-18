"""Collect all listed Summer League protocols for accepted season aliases.
Data reconciliation only: no model, simulations, application tests or deployment.
"""
import argparse,concurrent.futures,gzip,hashlib,json,urllib.request
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
from online_evidence import parse_box
BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/'
def now():return datetime.now(timezone.utc).isoformat()
def fetch(url,root):
 key=hashlib.sha256(url.encode()).hexdigest();index=root/'requests'/(key+'.json')
 if index.exists():
  metadata=json.loads(index.read_text());raw=gzip.decompress((root/metadata['rawPath']).read_bytes())
  if hashlib.sha256(raw).hexdigest()!=metadata['sha256']:raise ValueError('Raw checksum mismatch')
  return json.loads(raw),metadata
 req=urllib.request.Request(url,headers={'User-Agent':'FBL-History-Collector/1.0'})
 with urllib.request.urlopen(req,timeout=20) as response:raw=response.read(20_000_001);status=response.status
 if len(raw)>20_000_000:raise ValueError('Response too large')
 data=json.loads(raw);sha=hashlib.sha256(raw).hexdigest();path=Path('raw')/sha[:2]/(sha+'.json.gz')
 (root/path).parent.mkdir(parents=True,exist_ok=True);(root/path).write_bytes(gzip.compress(raw,mtime=0))
 metadata=dict(sourceUrl=url,fetchedAt=now(),publishedAt=None,httpStatus=status,sha256=sha,rawPath=str(path),bytes=len(raw))
 index.parent.mkdir(parents=True,exist_ok=True);index.write_text(json.dumps(metadata))
 return data,metadata

def calendar(entry,root):
 result=dict(entry,calendarStatus='FAILED',events=[])
 try:
  data,meta=fetch(entry['scheduleSource'],root);events=data.get('events',[])
  if not events:raise ValueError('Empty schedule does not establish no participation')
  if len(events)>=1000:raise ValueError('Schedule may be truncated at request limit')
  ids=[str(e['id']) for e in events]
  if len(ids)!=len(set(ids)):raise ValueError('Duplicate event IDs in schedule')
  if any(not e.get('date','').startswith(str(entry['year'])) for e in events):raise ValueError('Schedule contains a different year')
  result.update(calendarStatus='FETCHED',events=events,calendarSource=meta,observedCountChanged=len(events)!=entry['observedEvents'])
 except Exception as exc:result['error']=str(exc)
 return result

def game(job,root):
 competition,year,code,event=job;identifier=str(event['id']);url=BASE+code+'/summary?event='+identifier
 result=dict(eventId=identifier,competition=competition,year=year,providerCode=code,date=event.get('date'),status='FAILED',players=[],participation=[])
 try:
  payload,meta=fetch(url,root);result['source']=meta
  header=payload.get('header',{});returned=header.get('id')
  if returned is not None and str(returned)!=identifier:raise ValueError('Protocol event ID mismatch')
  if not event.get('status',{}).get('type',{}).get('completed'):
   result['status']='NOT_COMPLETED';return result
  rows=parse_box(payload,event,code)
  if not rows:raise ValueError('No parsed player observations')
  competition_header=(header.get('competitions') or [{}])[0]
  opponents=competition_header.get('competitors',[])
  teams={str(c['id']):dict(teamId=str(c['id']),teamName=(c.get('team') or {}).get('displayName'),homeAway=c.get('homeAway'),winner=c.get('winner'),score=c.get('score')) for c in opponents}
  membership={};warnings=[];source_active=set()
  for group in payload.get('boxscore',{}).get('players',[]):
   team_id=str(group.get('team',{}).get('id'))
   for stat_group in group.get('statistics',[]):
    labels=stat_group.get('labels',stat_group.get('names',[]))
    for athlete in stat_group.get('athletes',[]):
     aid=str(athlete['athlete']['id']);raw=dict(zip(labels,athlete.get('stats',[])))
     membership[aid]=dict(teamId=team_id,starter=athlete.get('starter'),rawStats=raw)
     dnp=athlete.get('didNotPlay')
     result['participation'].append(dict(espnId=aid,teamId=team_id,didNotPlay=dnp,reason=athlete.get('reason'),rawMinutes=raw.get('MIN')))
     if not dnp:source_active.add(aid)
  seen=set()
  for row in rows:
   aid=row['espnId']
   if aid in seen:raise ValueError('Duplicate player rows in protocol')
   seen.add(aid);context=membership.get(aid,{})
   if not context.get('teamId') or context['teamId'] not in teams:raise ValueError('Player team cannot be mapped to scoreboard')
   row.update(providerCompetition=code,competition=competition,year=year,teamId=context['teamId'],starter=context.get('starter'),valueKind='OBSERVED')
   result['players'].append(row)
  # Never silently drop non-DNP rows that the existing parser cannot interpret.
  for aid in sorted(source_active-seen):warnings.append(dict(kind='NON_DNP_ROW_NOT_NORMALIZED',espnId=aid,rawStats=membership[aid]['rawStats']))
  reconciliation=[]
  for team_id,team in teams.items():
   score=team['score'];score=score.get('value') if isinstance(score,dict) else score
   try:score=float(score)
   except (TypeError,ValueError):score=None
   parsed=sum(p['stats']['pts'] for p in rows if p['teamId']==team_id)
   ok=score is not None and abs(parsed-score)<1e-6
   reconciliation.append(dict(teamId=team_id,score=score,playerPointSum=parsed,pointsReconciled=ok))
   if not ok:warnings.append(dict(kind='POINTS_RECONCILIATION_FAILED',teamId=team_id))
  if len(teams)!=2:warnings.append(dict(kind='EXPECTED_TWO_TEAMS',actual=len(teams)))
  result.update(status='NORMALIZED_WITH_WARNINGS' if warnings else 'NORMALIZED_RECONCILED_POINTS',teams=list(teams.values()),reconciliation=reconciliation,warnings=warnings)
 except Exception as exc:result['error']=str(exc)
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('.cache/summer-games'));parser.add_argument('--workers',type=int,default=3);args=parser.parse_args()
 root=args.output;root.mkdir(parents=True,exist_ok=True)
 entries=json.loads(Path('data/competition-source-map.json').read_text())['entries']
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:calendars=list(pool.map(lambda e:calendar(e,root),entries))
 (root/'calendars.json').write_text(json.dumps(calendars,ensure_ascii=False))
 jobs=[];owners={};collisions=[]
 for c in calendars:
  if c['calendarStatus']!='FETCHED':continue
  for e in c['events']:
   key=str(e['id']);owner=(c['competition'],c['year'])
   if key in owners:
    if owners[key]!=owner:collisions.append(dict(eventId=key,owners=[owners[key],owner]))
    continue
   owners[key]=owner;jobs.append((*owner,c['providerCode'],e))
 results=[]
 # Write each result before the next batch, so cancellation retains evidence.
 with (root/'games.ndjson').open('w') as output:
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
   for result in pool.map(lambda j:game(j,root),jobs):
    results.append(result);output.write(json.dumps(result,ensure_ascii=False)+'\n');output.flush()
    if len(results)%25==0:print(json.dumps(dict(processed=len(results),total=len(jobs),statuses=dict(Counter(r['status'] for r in results)))),flush=True)
 groups=[]
 for c in calendars:
  own=[r for r in results if r['competition']==c['competition'] and r['year']==c['year']]
  groups.append(dict(competition=c['competition'],year=c['year'],providerCode=c['providerCode'],calendarStatus=c['calendarStatus'],listedEvents=len(c['events']),observedCountChanged=c.get('observedCountChanged'),statuses=dict(Counter(r['status'] for r in own)),playerGames=sum(len(r['players']) for r in own),participationRows=sum(len(r['participation']) for r in own),independentCalendarReconciled=False))
 report=dict(asOf=now(),status='COLLECTED_PROVIDER_EVENTS_NOT_INDEPENDENTLY_COMPLETE',calendarsExpected=len(entries),calendarsFetched=sum(c['calendarStatus']=='FETCHED' for c in calendars),listedUniqueEvents=len(jobs),eventCollisions=collisions,groups=groups,statuses=dict(Counter(r['status'] for r in results)),playerGames=sum(len(r['players']) for r in results),uniquePlayers=len({p['espnId'] for r in results for p in r['players']}),failures=[dict(eventId=r['eventId'],competition=r['competition'],year=r['year'],error=r.get('error'),warnings=r.get('warnings')) for r in results if r['status']!='NORMALIZED_RECONCILED_POINTS'],calendarFailures=[dict(competition=c['competition'],year=c['year'],error=c.get('error')) for c in calendars if c['calendarStatus']!='FETCHED'],limitations=['All rows retain raw response hashes; checks reconcile player points to protocol scores only.','No independent full-calendar reconciliation yet.','No automatic claim that every returned athlete row has complete stats.','DNP reasons are provider descriptions, not medical diagnoses.','Summer League observations are not NBA predictions or FBL season points.','Raw and normalized output is a checkpoint artifact until permanent storage is deployed.'])
 (root/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));Path('data/summer-games-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('SUMMER_COLLECTION_REPORT_BEGIN'+json.dumps(report,ensure_ascii=False)+'SUMMER_COLLECTION_REPORT_END',flush=True)
if __name__=='__main__':main()
