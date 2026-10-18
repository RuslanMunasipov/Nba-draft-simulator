"""Collect official NBA context tables; stop on sustained access failures.
Read-only data work. Does not run forecasting, tests, build or deployment.
"""
import argparse,concurrent.futures,gzip,hashlib,json,time,urllib.parse,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from audit_data_sources import params

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('.cache/nba-context'));parser.add_argument('--league-id',default='00');parser.add_argument('--first-year',type=int,default=1996);parser.add_argument('--last-year',type=int,default=2025);parser.add_argument('--workers',type=int,default=3);parser.add_argument('--include-games',action='store_true');parser.add_argument('--include-totals',action='store_true');args=parser.parse_args();root=args.output;root.mkdir(parents=True,exist_ok=True)
 jobs=[]
 for start in range(args.first_year,args.last_year+1):
  season=f'{start}-{str(start+1)[-2:]}'
  for endpoint,measure in [('leaguedashplayerstats','Base'),('leaguedashplayerstats','Advanced'),('leaguedashteamstats','Base'),('leaguedashteamstats','Advanced')]:
   jobs.append(dict(endpoint=endpoint,measure=measure,season=season))
  if args.include_totals:
   for endpoint in ['leaguedashplayerstats','leaguedashteamstats']:jobs.append(dict(endpoint=endpoint,measure='Base',season=season,perMode='Totals'))
  if args.include_games:
   for season_type in ['Regular Season','Playoffs','Pre Season']:
    for measure in ['Base','Advanced']:jobs.append(dict(endpoint='playergamelogs',measure=measure,season=season,seasonType=season_type))
  if start>=2007:jobs.append(dict(endpoint='leaguedashlineups',measure='Advanced',season=season,groupQuantity=5))
 def collect(job):
  query=dict(params,LeagueID=args.league_id,Season=job['season'],MeasureType=job['measure'],SeasonType=job.get('seasonType','Regular Season'),PerMode=job.get('perMode','PerGame'))
  if job['endpoint']=='playergamelogs':query['PlayerID']=0
  if job.get('groupQuantity'):query['GroupQuantity']=job['groupQuantity']
  url='https://stats.nba.com/stats/'+job['endpoint']+'?'+urllib.parse.urlencode(query)
  key=hashlib.sha256(url.encode()).hexdigest();metadata=root/(key+'.json');record=dict(job,sourceUrl=url,status='PENDING')
  try:
   if metadata.exists():
    try:
     old=json.loads(metadata.read_text());raw=gzip.decompress((root/old['rawPath']).read_bytes())
     if hashlib.sha256(raw).hexdigest()!=old['rawSha256']:raise ValueError('Cached raw checksum mismatch')
     old['status']='TABLES_RECEIVED_NOT_RECONCILED' if any(t.get('rows',0)>0 for t in old.get('tables',[])) else 'EMPTY_TABLE_UNVERIFIED'
     return old
    except Exception:metadata.rename(metadata.with_suffix('.invalid'))
   request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/','Origin':'https://www.nba.com'})
   with urllib.request.urlopen(request,timeout=15) as response:raw=response.read(25_000_001)
   if len(raw)>25_000_000:raise ValueError('Table exceeds response size bound')
   data=json.loads(raw);sets=data.get('resultSets',[])
   if not isinstance(sets,list):raise ValueError('Unexpected official response schema')
   sha=hashlib.sha256(raw).hexdigest();path=Path('raw')/(sha+'.json.gz');(root/path).parent.mkdir(parents=True,exist_ok=True);(root/path).write_bytes(gzip.compress(raw,mtime=0))
   record.update(status='TABLES_RECEIVED_NOT_RECONCILED' if any(t.get('rowSet') for t in sets) else 'EMPTY_TABLE_UNVERIFIED',fetchedAt=datetime.now(timezone.utc).isoformat(),rawSha256=sha,rawPath=str(path),tables=[dict(name=t.get('name'),rows=len(t.get('rowSet',[])),columns=t.get('headers',[])) for t in sets])
   temporary=metadata.with_suffix('.tmp');temporary.write_text(json.dumps(record));temporary.replace(metadata)
  except Exception as exc:record.update(status='SOURCE_REQUEST_FAILED',error=str(exc),httpStatus=getattr(exc,'code',None))
  return record
 # Read cached evidence before network work, including when access has failed.
 def cached(job):
  query=dict(params,LeagueID=args.league_id,Season=job['season'],MeasureType=job['measure'],SeasonType=job.get('seasonType','Regular Season'),PerMode=job.get('perMode','PerGame'))
  if job['endpoint']=='playergamelogs':query['PlayerID']=0
  if job.get('groupQuantity'):query['GroupQuantity']=job['groupQuantity']
  url='https://stats.nba.com/stats/'+job['endpoint']+'?'+urllib.parse.urlencode(query)
  return (root/(hashlib.sha256(url.encode()).hexdigest()+'.json')).exists()
 jobs.sort(key=lambda job:not cached(job))
 observations=[];failures=0
 for at in range(0,len(jobs),args.workers):
  batch=jobs[at:at+args.workers]
  if failures>=3:
   observations.extend(dict(job,status='PENDING_SOURCE_ACCESS_FAILURE') for job in batch);continue
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:records=list(pool.map(collect,batch))
  for record in records:
   failures=failures+1 if record['status']=='SOURCE_REQUEST_FAILED' else 0
   observations.append(record);print(record['season'],record['endpoint'],record['measure'],record['status'],flush=True)
  (root/'observations.json').write_text(json.dumps(observations,ensure_ascii=False,indent=2));time.sleep(.3)
 report=dict(asOf=datetime.now(timezone.utc).isoformat(),status='INCOMPLETE_UNTIL_ALL_TABLES_RECONCILED',jobs=len(jobs),received=sum(o['status']=='TABLES_RECEIVED_NOT_RECONCILED' for o in observations),pendingOrFailed=[o for o in observations if o['status']!='TABLES_RECEIVED_NOT_RECONCILED'],rowsByTable=[dict(season=o['season'],endpoint=o['endpoint'],measure=o['measure'],tables=[dict(name=t['name'],rows=t['rows']) for t in o.get('tables',[])]) for o in observations if o['status']=='TABLES_RECEIVED_NOT_RECONCILED'],limitations=['Source availability varies by runtime.','Empty/missing table is not a zero-valued historical statistic.','Coach tenures and tracking are not supplied by these endpoints.','Access conditions and permanent update infrastructure remain separate acceptance gates.'])
 (root/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(dict(jobs=report['jobs'],received=report['received'],remaining=len(report['pendingOrFailed']))),flush=True)
if __name__=='__main__':main()
