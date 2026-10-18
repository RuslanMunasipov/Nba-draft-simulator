"""Resumable evidence collection, deliberately separate from model/test/deploy jobs.
Raw provider responses are immutable, hashed and never mistaken for observations.
Use --requests to bound a run; rerun to continue the durable SQLite queue.
"""
import argparse,concurrent.futures,gzip,hashlib,json,sqlite3,time,urllib.request
from datetime import datetime,timezone,timedelta
from pathlib import Path

WEB='https://site.web.api.espn.com/apis/common/v3/sports/basketball/'
SITE='https://site.api.espn.com/apis/site/v2/sports/basketball/'
COMPETITIONS=('nba','mens-college-basketball')
def now():return datetime.now(timezone.utc).isoformat()
def connect(root):
 root.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(root/'history.sqlite')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT,espn_id TEXT,nba_id TEXT,is_rookie INTEGER,priced INTEGER);
 CREATE TABLE IF NOT EXISTS jobs(url TEXT PRIMARY KEY,player_id TEXT,competition TEXT,kind TEXT,season INTEGER,status TEXT DEFAULT 'PENDING',attempts INTEGER DEFAULT 0,next_attempt TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS responses(url TEXT,sha256 TEXT,observed_at TEXT,status_code INTEGER,relative_path TEXT,bytes INTEGER,PRIMARY KEY(url,sha256));
 CREATE TABLE IF NOT EXISTS season_inventory(player_id TEXT,competition TEXT,year INTEGER,season TEXT,games REAL,source_url TEXT,sha256 TEXT,PRIMARY KEY(player_id,competition,year));
 CREATE TABLE IF NOT EXISTS expected_nba_seasons(player_id TEXT,year INTEGER,evidence_json TEXT,PRIMARY KEY(player_id,year));
 CREATE TABLE IF NOT EXISTS season_stats(player_id TEXT,competition TEXT,year INTEGER,stats_json TEXT,source_url TEXT,sha256 TEXT,PRIMARY KEY(player_id,competition,year));
 CREATE TABLE IF NOT EXISTS provider_identities(espn_id TEXT PRIMARY KEY,name TEXT,birth_date TEXT,active INTEGER,source_url TEXT,record_json TEXT);
 CREATE TABLE IF NOT EXISTS player_games(player_id TEXT,competition TEXT,event_id TEXT,season INTEGER,season_type TEXT,status TEXT,stats_json TEXT,source_url TEXT,sha256 TEXT,PRIMARY KEY(player_id,competition,event_id,season_type));
 CREATE TABLE IF NOT EXISTS identity_candidates(player_id TEXT,espn_id TEXT,status TEXT,reason TEXT,PRIMARY KEY(player_id,espn_id));
 CREATE TABLE IF NOT EXISTS issues(player_id TEXT,competition TEXT,kind TEXT,detail TEXT,observed_at TEXT,UNIQUE(player_id,competition,kind,detail));
 ''')
 return db
def queue(db,url,pid,competition,kind,season=None):
 db.execute('INSERT OR IGNORE INTO jobs(url,player_id,competition,kind,season) VALUES(?,?,?,?,?)',(url,str(pid),competition,kind,season))
def seed(db,catalog):
 for p in catalog['players']:
  pid=str(p['id']);eid=p.get('espnId')
  db.execute('INSERT OR REPLACE INTO players VALUES(?,?,?,?,?,?)',(pid,p['name'],eid,p.get('nbaId'),bool(p.get('isRookie')),p.get('priceStatus')=='VERIFIED'))
  if not eid:
   db.execute('INSERT OR IGNORE INTO issues VALUES(?,?,?,?,?)',(pid,'ALL','MISSING_ID','No verified ESPN mapping; never guess by similar name',now()));continue
  for competition in COMPETITIONS:
   queue(db,WEB+competition+'/athletes/'+str(eid)+'/stats',pid,competition,'CAREER')
 # Retire the invalid SL athlete-career route without labelling it complete.
 db.execute("UPDATE jobs SET status='SUPERSEDED_BY_EVENT_ROUTE' WHERE competition LIKE 'nba-summer-%'")
 old=db.execute("SELECT url,player_id,competition,season FROM jobs WHERE kind LIKE 'GAMELOG_TYPE_%'").fetchall()
 for url,pid,competition,year in old:
  parsed=urllib.parse.urlsplit(url);q=dict(urllib.parse.parse_qsl(parsed.query));q.pop('seasontype',None)
  queue(db,urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(q))),pid,competition,'GAMELOG',year)
 db.execute("UPDATE jobs SET status='SUPERSEDED_BY_ALL_TYPES_RESPONSE' WHERE kind LIKE 'GAMELOG_TYPE_%'")
 # Provider universe is evidence for resolving inactive players and survivor bias.
 queue(db,'https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&page=1','UNIVERSE','nba','IDENTITY_INDEX')
 queue(db,'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes?limit=1000&page=1','UNIVERSE','nba','IDENTITY_REFERENCE_INDEX')
 db.commit()
def download(job):
 url=job[0]
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'FBL-History-Collector/1.0'})
  with urllib.request.urlopen(req,timeout=15) as response:
   raw=response.read();status=response.status
  data=json.loads(raw)
  if not isinstance(data,dict):raise ValueError('Expected JSON object')
  return job,raw,data,status,None
 except Exception as exc:return job,None,None,getattr(exc,'code',None),str(exc)
def ingest(db,root,result):
 job,raw,data,status,error=result;url,pid,competition,kind,season=job;stamp=now()
 if error:
  state='SOURCE_UNAVAILABLE' if status in (400,404) else 'RETRY'
  db.execute('UPDATE jobs SET status=?,attempts=attempts+1,next_attempt=?,error=? WHERE url=?',(state,(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),error,url))
  return
 digest=hashlib.sha256(raw).hexdigest();relative=Path('raw')/digest[:2]/(digest+'.json.gz');path=root/relative;path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():path.write_bytes(gzip.compress(raw,mtime=0))
 db.execute('INSERT OR IGNORE INTO responses VALUES(?,?,?,?,?,?)',(url,digest,stamp,status,str(relative),len(raw)))
 state='FETCHED_RAW'
 if kind=='CAREER':
  from online_evidence import parse_career
  try:
   rows=parse_career(data)
   for row in rows:
    db.execute('INSERT OR REPLACE INTO season_inventory VALUES(?,?,?,?,?,?,?)',(pid,competition,row['year'],row['season'],row['games'],url,digest))
    eid=db.execute('SELECT espn_id FROM players WHERE id=?',(pid,)).fetchone()[0]
    db.execute('INSERT OR REPLACE INTO season_stats VALUES(?,?,?,?,?,?)',(pid,competition,row['year'],json.dumps(row,ensure_ascii=False),url,digest))
    queue(db,WEB+competition+'/athletes/'+eid+'/gamelog?season='+str(row['year']),pid,competition,'GAMELOG',row['year'])
   state='INDEXED_SEASONS' if rows else 'EMPTY_OR_UNSUPPORTED'
   if not rows:db.execute('INSERT OR IGNORE INTO issues VALUES(?,?,?,?,?)',(pid,competition,'EMPTY_RESPONSE','HTTP success is not proof of zero historical seasons',stamp))
  except Exception as exc:
   state='PARSE_FAILED';error=str(exc)
   db.execute('INSERT OR IGNORE INTO issues VALUES(?,?,?,?,?)',(pid,competition,'PARSE_FAILED',error,stamp))
 if kind in ('IDENTITY_INDEX','IDENTITY_REFERENCE_INDEX'):
  for record in data.get('items',[]):
   if record.get('id'):
    from build_default_database import normalize
    db.execute('INSERT OR REPLACE INTO provider_identities VALUES(?,?,?,?,?,?)',(str(record['id']),record.get('displayName'),record.get('dateOfBirth'),record.get('active'),url,json.dumps(record)))
    for candidate_id,name in db.execute('SELECT id,name FROM players WHERE espn_id IS NULL').fetchall():
     if normalize(name)==normalize(record.get('displayName') or ''):
      db.execute('INSERT OR IGNORE INTO identity_candidates VALUES(?,?,?,?)',(candidate_id,str(record['id']),'UNVERIFIED','Name match only; need independent career/birth evidence'))
   elif record.get('$ref'):
    ref=record['$ref'];parsed=urllib.parse.urlsplit(ref)
    if parsed.hostname=='sports.core.api.espn.com':
     ref=urllib.parse.urlunsplit(parsed._replace(scheme='https'));queue(db,ref,'UNIVERSE','nba','IDENTITY_DETAIL')
  if int(data.get('pageIndex',1))==1:
   for page in range(2,int(data.get('pageCount',1))+1):
    parsed=urllib.parse.urlsplit(url);q=dict(urllib.parse.parse_qsl(parsed.query));q['page']=page
    queue(db,urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(q))),'UNIVERSE','nba',kind)
 if kind=='IDENTITY_DETAIL' and data.get('id'):
  from build_default_database import normalize
  record=data;eid=str(record['id'])
  db.execute('INSERT OR REPLACE INTO provider_identities VALUES(?,?,?,?,?,?)',(eid,record.get('displayName'),record.get('dateOfBirth'),record.get('active'),url,json.dumps(record)))
  for candidate_id,name in db.execute('SELECT id,name FROM players WHERE espn_id IS NULL').fetchall():
   if normalize(name)==normalize(record.get('displayName') or ''):db.execute('INSERT OR IGNORE INTO identity_candidates VALUES(?,?,?,?)',(candidate_id,eid,'UNVERIFIED','Name match only; no silent ID assignment'))
 if kind=='GAMELOG':
  from history_normalization import normalize_gamelog
  try:
   rows=normalize_gamelog(data,season)
   for row in rows:
    db.execute('INSERT OR REPLACE INTO player_games VALUES(?,?,?,?,?,?,?,?,?)',(pid,competition,row['eventId'],season,row['seasonType'],row['status'],json.dumps(row,ensure_ascii=False),url,digest))
   state='NORMALIZED_GAMELOG' if rows else 'EMPTY_OR_UNSUPPORTED'
   if any(r['status']!='NORMALIZED' or r['seasonType']=='UNCLASSIFIED' for r in rows):state='GAMELOG_WITH_GAPS'
  except Exception as exc:state='PARSE_FAILED';error=str(exc)
 db.execute('UPDATE jobs SET status=?,attempts=attempts+1,error=? WHERE url=?',(state,error,url))
def replay_saved(db,root):
 # New parsers must process old raw snapshots too, without re-downloading them.
 rows=db.execute("SELECT j.url,j.player_id,j.competition,j.kind,j.season,r.sha256,r.relative_path FROM jobs j JOIN responses r ON r.url=j.url WHERE j.kind IN ('CAREER','IDENTITY_INDEX','IDENTITY_REFERENCE_INDEX') AND j.competition IN ('nba','mens-college-basketball') ORDER BY r.observed_at").fetchall()
 for url,pid,competition,kind,season,sha,path in rows:
  raw=gzip.decompress((root/path).read_bytes())
  if hashlib.sha256(raw).hexdigest()!=sha:raise ValueError('Saved response checksum mismatch')
  ingest(db,root,((url,pid,competition,kind,season),raw,json.loads(raw),200,None))
 db.commit()

def report(db,root):
 statuses=dict(db.execute('SELECT status,count(*) FROM jobs GROUP BY status'))
 competitions=[dict(competition=c,players=p,seasons=s) for c,p,s in db.execute('SELECT competition,count(DISTINCT player_id),count(*) FROM season_inventory GROUP BY competition')]
 missing=[dict(id=i,name=n,priced=bool(p)) for i,n,p in db.execute("SELECT id,name,priced FROM players WHERE espn_id IS NULL")]
 no_career=[dict(id=i,name=n,rookie=bool(r)) for i,n,r in db.execute("SELECT p.id,p.name,p.is_rookie FROM players p WHERE p.priced=1 AND NOT EXISTS (SELECT 1 FROM season_inventory s WHERE s.player_id=p.id AND s.competition='nba')")]
 reconciliation=[]
 for pid,comp,year,expected in db.execute('SELECT player_id,competition,year,games FROM season_inventory').fetchall():
  scope="season_type='REGULAR'" if comp=='nba' else "season_type!='PRESEASON'"
  query="SELECT count(DISTINCT event_id),count(DISTINCT CASE WHEN status='NORMALIZED' THEN event_id END),sum(CASE WHEN season_type='UNCLASSIFIED' THEN 1 ELSE 0 END),count(*) FROM player_games WHERE player_id=? AND competition=? AND season=? AND "+scope
  n,valid,unknown,physical=db.execute(query,(pid,comp,year)).fetchone();valid=valid or 0;unknown=unknown or 0
  matched=n==expected and valid==n
  state='COUNT_MATCH_TYPE_UNRESOLVED' if matched and unknown else 'INTRA_PROVIDER_COUNT_MATCH' if matched and physical==n else 'UNRESOLVED'
  reconciliation.append(dict(playerId=pid,competition=comp,year=year,expectedGames=expected,observedGames=n,normalizedGames=valid,unclassifiedRows=unknown,duplicateEventTypeRows=physical-n,comparisonScope='NBA_REGULAR' if comp=='nba' else 'NCAA_ALL_NON_PRESEASON_SOURCE_ROWS',status=state))
 (root/'season-reconciliation.json').write_text(json.dumps(reconciliation,ensure_ascii=False,indent=2))
 normalizedGames=[dict(competition=c,status=s,rows=n) for c,s,n in db.execute('SELECT competition,status,count(*) FROM player_games GROUP BY competition,status')]
 expected=db.execute('SELECT count(*) FROM expected_nba_seasons').fetchone()[0]
 found=db.execute("SELECT count(*) FROM expected_nba_seasons e JOIN season_inventory s ON e.player_id=s.player_id AND e.year=s.year AND s.competition='nba'").fetchone()[0]
 output=dict(independentExpectedNBASeasons=dict(expected=expected,foundInProviderSeasonInventory=found,missing=expected-found),seasonReconciliation=dict(total=len(reconciliation),countMatched=sum(r['status']=='INTRA_PROVIDER_COUNT_MATCH' for r in reconciliation),countMatchedWithUnresolvedType=sum(r['status']=='COUNT_MATCH_TYPE_UNRESOLVED' for r in reconciliation),independentVerification=False),normalizedGames=normalizedGames,providerIdentities=db.execute('SELECT count(*) FROM provider_identities').fetchone()[0],unverifiedIdentityCandidates=db.execute('SELECT count(*) FROM identity_candidates').fetchone()[0],asOf=now(),status='INCOMPLETE_EVIDENCE_COLLECTION',jobs=statuses,competitionCoverage=competitions,missingIdentities=missing,pricedWithoutIndexedNBACareer=no_career,
  limitations=['Inventory covers fetched provider seasons, not independently verified career completeness.','Game logs are normalized with source type labels; count matching is within provider, not independent verification or full component reconciliation.','Current catalog is not an unbiased historical training population.','USG, lineup stints, coach tenures and international leagues are not yet collected by this adapter.','Unavailable, empty, parser failure and pending have distinct meanings; none imply zero talent.'])
 (root/'coverage.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
 return output
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--catalog',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('.cache/history'));parser.add_argument('--requests',type=int,default=100);parser.add_argument('--workers',type=int,default=3);parser.add_argument('--identity-map',type=Path);parser.add_argument('--max-seconds',type=int,default=4500);args=parser.parse_args()
 db=connect(args.output)
 raw=args.catalog.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 (args.output/('catalog-'+digest+'.json.gz')).write_bytes(gzip.compress(raw,mtime=0))
 catalog=json.loads(raw);verified={}
 if args.identity_map:
  identity_raw=args.identity_map.read_bytes();identity_data=json.loads(identity_raw)
  verified={str(r['playerId']):r for r in identity_data['mappings'] if r['status']=='VERIFIED_NAME_DOB_NBA_ID'}
  identity_sha=hashlib.sha256(identity_raw).hexdigest();(args.output/('identity-map-'+identity_sha+'.json.gz')).write_bytes(gzip.compress(identity_raw,mtime=0))
  for p in catalog['players']:
   match=verified.get(str(p['id']))
   if match:p['espnId']=match['espnId'];p['nbaId']=match['nbaId']
 seed(db,catalog);replay_saved(db,args.output);done=0;started=time.monotonic()
 for pid,match in verified.items():
  for year in match['expectedNBARegularEndYears']:
   db.execute('INSERT OR REPLACE INTO expected_nba_seasons VALUES(?,?,?)',(pid,year,json.dumps(match['evidence'])))
   queue(db,WEB+'nba/athletes/'+match['espnId']+'/gamelog?season='+str(year),pid,'nba','GAMELOG',year)
 db.commit()
 # Keep requests bounded and checkpoint every batch, including failures.
 while done<args.requests and time.monotonic()-started<args.max_seconds:
  jobs=db.execute("SELECT url,player_id,competition,kind,season FROM jobs WHERE status='PENDING' OR (status='RETRY' AND next_attempt<=?) ORDER BY CASE kind WHEN 'IDENTITY_INDEX' THEN 0 WHEN 'IDENTITY_REFERENCE_INDEX' THEN 0 WHEN 'CAREER' THEN 1 WHEN 'GAMELOG' THEN 2 WHEN 'IDENTITY_DETAIL' THEN 3 ELSE 4 END,player_id,competition LIMIT ?",(now(),min(args.workers,args.requests-done))).fetchall()
  if not jobs:break
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
   for result in pool.map(download,jobs):ingest(db,args.output,result)
  db.commit();done+=len(jobs)
  if done%100<args.workers:print(json.dumps(dict(processed=done,statuses=dict(db.execute('SELECT status,count(*) FROM jobs GROUP BY status')))),flush=True)
 output=report(db,args.output);print('HISTORY_REPORT_BEGIN'+json.dumps(output,ensure_ascii=False)+'HISTORY_REPORT_END',flush=True);db.close()
if __name__=='__main__':main()
