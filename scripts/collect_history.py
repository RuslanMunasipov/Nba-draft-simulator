"""Resumable evidence collection, deliberately separate from model/test/deploy jobs.
Raw provider responses are immutable, hashed and never mistaken for observations.
Use --requests to bound a run; rerun to continue the durable SQLite queue.
"""
import argparse,concurrent.futures,gzip,hashlib,json,sqlite3,urllib.request
from datetime import datetime,timezone,timedelta
from pathlib import Path

WEB='https://site.web.api.espn.com/apis/common/v3/sports/basketball/'
SITE='https://site.api.espn.com/apis/site/v2/sports/basketball/'
COMPETITIONS=('nba','mens-college-basketball','nba-summer-las-vegas','nba-summer-utah','nba-summer-sacramento')
def now():return datetime.now(timezone.utc).isoformat()
def connect(root):
 root.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(root/'history.sqlite')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT,espn_id TEXT,nba_id TEXT,is_rookie INTEGER,priced INTEGER);
 CREATE TABLE IF NOT EXISTS jobs(url TEXT PRIMARY KEY,player_id TEXT,competition TEXT,kind TEXT,season INTEGER,status TEXT DEFAULT 'PENDING',attempts INTEGER DEFAULT 0,next_attempt TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS responses(url TEXT,sha256 TEXT,observed_at TEXT,status_code INTEGER,relative_path TEXT,bytes INTEGER,PRIMARY KEY(url,sha256));
 CREATE TABLE IF NOT EXISTS season_inventory(player_id TEXT,competition TEXT,year INTEGER,season TEXT,games REAL,source_url TEXT,sha256 TEXT,PRIMARY KEY(player_id,competition,year));
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
 # Provider universe is evidence for resolving inactive players and survivor bias.
 queue(db,'https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&page=1','UNIVERSE','nba','IDENTITY_INDEX')
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
    # Season type stays explicit: regular, postseason, preseason are not merged.
    types=(1,2,3) if competition=='nba' else (2,3)
    for season_type in types:
     queue(db,WEB+competition+'/athletes/'+eid+'/gamelog?season='+str(row['year'])+'&seasontype='+str(season_type),pid,competition,'GAMELOG_TYPE_'+str(season_type),row['year'])
   state='INDEXED_SEASONS' if rows else 'EMPTY_OR_UNSUPPORTED'
   if not rows:db.execute('INSERT OR IGNORE INTO issues VALUES(?,?,?,?,?)',(pid,competition,'EMPTY_RESPONSE','HTTP success is not proof of zero historical seasons',stamp))
  except Exception as exc:
   state='PARSE_FAILED';error=str(exc)
   db.execute('INSERT OR IGNORE INTO issues VALUES(?,?,?,?,?)',(pid,competition,'PARSE_FAILED',error,stamp))
 if kind=='IDENTITY_INDEX':
  for page in range(2,int(data.get('pageCount',1))+1):
   queue(db,url.replace('page=1','page='+str(page)),'UNIVERSE','nba','IDENTITY_INDEX')
 db.execute('UPDATE jobs SET status=?,attempts=attempts+1,error=? WHERE url=?',(state,error,url))
def report(db,root):
 statuses=dict(db.execute('SELECT status,count(*) FROM jobs GROUP BY status'))
 competitions=[dict(competition=c,players=p,seasons=s) for c,p,s in db.execute('SELECT competition,count(DISTINCT player_id),count(*) FROM season_inventory GROUP BY competition')]
 missing=[dict(id=i,name=n,priced=bool(p)) for i,n,p in db.execute("SELECT id,name,priced FROM players WHERE espn_id IS NULL")]
 no_career=[dict(id=i,name=n,rookie=bool(r)) for i,n,r in db.execute("SELECT p.id,p.name,p.is_rookie FROM players p WHERE p.priced=1 AND NOT EXISTS (SELECT 1 FROM season_inventory s WHERE s.player_id=p.id AND s.competition='nba')")]
 output=dict(asOf=now(),status='INCOMPLETE_EVIDENCE_COLLECTION',jobs=statuses,competitionCoverage=competitions,missingIdentities=missing,pricedWithoutIndexedNBACareer=no_career,
  limitations=['Inventory covers fetched provider seasons, not independently verified career completeness.','Fetched game logs are raw evidence until normalized and reconciled with season totals.','Current catalog is not an unbiased historical training population.','USG, lineup stints, coach tenures and international leagues are not yet collected by this adapter.','Unavailable, empty, parser failure and pending have distinct meanings; none imply zero talent.'])
 (root/'coverage.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
 return output
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--catalog',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('.cache/history'));parser.add_argument('--requests',type=int,default=100);parser.add_argument('--workers',type=int,default=3);args=parser.parse_args()
 db=connect(args.output)
 raw=args.catalog.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 (args.output/('catalog-'+digest+'.json.gz')).write_bytes(gzip.compress(raw,mtime=0))
 seed(db,json.loads(raw));done=0
 # Keep requests bounded and checkpoint every batch, including failures.
 while done<args.requests:
  jobs=db.execute("SELECT url,player_id,competition,kind,season FROM jobs WHERE status='PENDING' OR (status='RETRY' AND next_attempt<=?) ORDER BY CASE kind WHEN 'CAREER' THEN 0 WHEN 'IDENTITY_INDEX' THEN 1 ELSE 2 END,player_id,competition LIMIT ?",(now(),min(args.workers,args.requests-done))).fetchall()
  if not jobs:break
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
   for result in pool.map(download,jobs):ingest(db,args.output,result)
  db.commit();done+=len(jobs);print(json.dumps(dict(processed=done,statuses=dict(db.execute('SELECT status,count(*) FROM jobs GROUP BY status')))),flush=True)
 output=report(db,args.output);print(json.dumps({k:v for k,v in output.items() if k not in ('missingIdentities','pricedWithoutIndexedNBACareer')},ensure_ascii=False));db.close()
if __name__=='__main__':main()
