"""Yahoo analyst position evidence published on NBA.com, distinct from a live Yahoo
league eligibility check. Never replace team/forecast data with an editorial ranking.
"""
import json,re,urllib.request
from collections import Counter
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from build_default_database import normalize
SOURCE='https://www.nba.com/news/nba-fantasy-top-250-category-league-rankings'
VALID={'PG','SG','SF','PF','C'}
class Table(HTMLParser):
 def __init__(self):
  super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th') and self.row is not None:self.cell=[]
 def handle_data(self,value):
  if self.cell is not None:self.cell.append(value)
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
def parse_positions(html):
 parser=Table();parser.feed(html);result=[]
 for row in parser.rows:
  if len(row)!=4 or not re.fullmatch(r'\d{1,3}',row[0]):continue
  positions=[p.strip() for p in row[2].split(',')]
  if not positions or any(p not in VALID for p in positions):continue
  result.append(dict(name=row[1],positions=list(dict.fromkeys(positions))))
 if len({normalize(r['name']) for r in result})!=len(result):raise ValueError('Duplicate position source names')
 return result
def apply(data,positions):
 by_name={normalize(p['name']):p for p in positions};matched=0;changes=[]
 names=Counter(normalize(p['name']) for p in data['players'])
 for player in data['players']:
  key=normalize(player['name'])
  if names[key]!=1:continue
  source=by_name.get(key)
  if not source:
   player.update(positions=[],positionStatus='MISSING',positionSource=None,positionProvider=None)
   continue
  before=player['positions']
  player.update(positions=source['positions'],positionStatus='YAHOO_ANALYST_PUBLISHED_NOT_PLATFORM_VERIFIED',
                positionSource=SOURCE,positionCheckedAt=data['generatedAt'],positionProvider='Dan Titus / Yahoo Sports on NBA.com')
  matched+=1
  if set(before)!=set(source['positions']):changes.append(dict(name=player['name'],previous=before,published=source['positions']))
 return dict(source=SOURCE,status='YAHOO_ANALYST_PUBLISHED',platformEligibilityVerified=False,
             checkedAt=data['generatedAt'],sourcePlayers=len(positions),matchedPlayers=matched,changes=changes,
             limitation='Published Yahoo analyst positions, not an authenticated live Yahoo league response. Only Yahoo-published positions are eligible. Unmatched players have no confirmed eligibility; ESPN positions are not used.')
if __name__=='__main__':
 req=urllib.request.Request(SOURCE,headers={'User-Agent':'FBL-Draft-Intelligence/0.3'})
 with urllib.request.urlopen(req,timeout=30) as response:html=response.read().decode()
 plain=' '.join(unescape(re.sub('<[^>]+>',' ',html)).split())
 if '2026-27 fantasy basketball draft season' not in plain or 'Dan Titus' not in plain or 'Yahoo' not in plain:raise ValueError('Position source season/author not confirmed')
 positions=parse_positions(html)
 if len(positions)<200:raise ValueError('Incomplete published position table')
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
 report=apply(data,positions)
 if report['matchedPlayers']<180:raise ValueError('Position mapping coverage too low')
 w=next(p for p in data['players'] if p['name']=='Victor Wembanyama')
 if w['positions']!=['C']:raise ValueError('Published Wembanyama position regression')
 data['positionAudit']=report
 path.write_text(json.dumps(data,ensure_ascii=False))
 Path('public/data/position-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2))
