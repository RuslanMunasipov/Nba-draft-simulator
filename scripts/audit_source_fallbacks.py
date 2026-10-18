"""Bounded follow-up source observations; no model tests, build or deployment."""
import concurrent.futures,hashlib,json,re,urllib.parse,urllib.request
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from audit_data_sources import params

BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/'
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th') and self.row is not None:self.cell=[]
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   self.row.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip());self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None

def jobs():
 result=[]
 for league in ['nba-summer-california','nba-summer-las-vegas','nba-summer-utah']:
  for year in [2024,2025,2026]:result.append(dict(id=f'{league}_{year}',kind='SCOREBOARD',url=BASE+league+f'/scoreboard?dates={year}&limit=1000',expectedYear=year))
 result.extend([
  dict(id='espn_nba_calendar_2027',kind='SCOREBOARD',url=BASE+'nba/scoreboard?dates=20261001-20270701&limit=1000',expectedYear=None),
  dict(id='espn_nba_team_schedule',kind='SCHEDULE',url=BASE+'nba/teams/den/schedule?season=2027&seasontype=2'),
  dict(id='duke_2024_25',kind='COLLEGE_TABLE',url='https://goduke.com/sports/mens-basketball/stats/2024-25'),
  dict(id='ncaa_di_archive',kind='PAGE',url='https://www.ncaa.com/stats/basketball-men/d1/2024-25/individual/136'),
  dict(id='ncaa_mens_records',kind='PAGE',url='https://www.ncaa.org/championships/statistics-and-records/mens-basketball/'),
  dict(id='nba_advanced_2024_25',kind='ADVANCED',url='https://stats.nba.com/stats/leaguedashplayerstats?'+urllib.parse.urlencode(dict(params,Season='2024-25'))),
  dict(id='nba_california_official_2026',kind='PAGE',url='https://www.nba.com/2026-summer-league-california-schedule'),
 ])
 return result

def inspect(job):
 result=dict(job,checkedAt=datetime.now(timezone.utc).isoformat(),coverageStatus='NOT_ESTABLISHED')
 try:
  req=urllib.request.Request(job['url'],headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/'})
  with urllib.request.urlopen(req,timeout=20) as response:raw=response.read(20_000_001);result['httpStatus']=response.status
  result.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
  if len(raw)>20_000_000:result['status']='RESPONSE_SIZE_LIMIT';return result
  if job['kind'] in ('PAGE','COLLEGE_TABLE'):
   html=raw.decode('utf-8','replace');result['status']='PAGE_RECEIVED_NOT_ACCEPTED'
   title=re.search(r'<title[^>]*>(.*?)</title>',html,re.S|re.I)
   result['title']=re.sub(r'\s+',' ',title.group(1)).strip() if title else None
   if job['kind']=='COLLEGE_TABLE':
    parser=Tables();parser.feed(html)
    matching=[r for r in parser.rows if any('flagg' in c.lower() for c in r)]
    result.update(tableRows=len(parser.rows),matchingPlayerRows=matching)
    if matching:result['status']='PLAYER_TABLE_ROW_FOUND'
  else:
   data=json.loads(raw);result['keys']=list(data)[:15]
   if job['kind'] in ('SCOREBOARD','SCHEDULE'):
    events=data.get('events',[]);dates=sorted(e.get('date','') for e in events)
    leagues=data.get('leagues',[])
    result.update(status='EVENTS_RECEIVED' if events else 'EMPTY_OR_UNSUPPORTED',events=len(events),uniqueEvents=len({e['id'] for e in events}),dateRange=[dates[0],dates[-1]] if dates else [],leagueSlugs=[x.get('slug') for x in leagues],reportedSeason=data.get('season'),eventIds=[e['id'] for e in events])
    # Never mark a limit-sized response as a full season schedule.
    result['possiblyTruncated']=len(events)>=1000
    if job['kind']=='SCOREBOARD' and events:
     league=job['url'].split('/basketball/')[1].split('/')[0]
     event=events[0]
     result['sampleBoxUrl']=BASE+league+'/summary?event='+event['id']
   elif job['kind']=='ADVANCED':
    sets=data.get('resultSets',[]);result.update(status='TABLE_RECEIVED' if sets else 'EMPTY_OR_UNSUPPORTED',tables=[dict(name=t.get('name'),rows=len(t.get('rowSet',[])),hasUsage='USG_PCT' in t.get('headers',[])) for t in sets])
 except Exception as exc:result.update(status='REQUEST_OR_PARSE_FAILED',httpStatus=getattr(exc,'code',result.get('httpStatus')),error=str(exc))
 return result

def sample_box(result):
 if not result.get('sampleBoxUrl') or 'summer' not in result['id']:return result
 from online_evidence import parse_box
 try:
  url=result['sampleBoxUrl']
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=20) as response:raw=response.read()
  data=json.loads(raw);league=url.split('/basketball/')[1].split('/')[0]
  event=data.get('header',{})
  rows=parse_box(data,dict(id=result['eventIds'][0],date=(event.get('competitions') or [{}])[0].get('date')),league)
  result['sampleBox']=dict(status='PARSED' if rows else 'EMPTY_OR_UNSUPPORTED',playerRows=len(rows),sha256=hashlib.sha256(raw).hexdigest(),competition=league)
 except Exception as exc:result['sampleBox']=dict(status='REQUEST_OR_PARSE_FAILED',error=str(exc))
 return result

def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(inspect,jobs()))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(sample_box,results))
 out=dict(version=1,asOf=datetime.now(timezone.utc).isoformat(),purpose='Bounded access and historical-sample audit; no completeness claim',observations=results)
 Path('data/source-fallback-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
 for row in results:print(row['id'],row['status'],row.get('events'),row.get('sampleBox'),flush=True)
 print('FALLBACK_AUDIT_REPORT_BEGIN'+json.dumps(out,ensure_ascii=False)+'FALLBACK_AUDIT_REPORT_END',flush=True)
if __name__=='__main__':main()
