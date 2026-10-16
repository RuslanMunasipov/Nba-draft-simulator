"""Inspect provider historical projection availability; never treat a live old-season
endpoint as a frozen preseason forecast. Failures are reported, not replaced by zeros.
"""
import json,urllib.request
from datetime import datetime,timezone
from pathlib import Path
def inspect(year):
 url=f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/{year}/segments/0/leaguedefaults/1?view=kona_player_info'
 filters={'players':{'limit':1500,'filterStatsForSourceIds':{'value':[1]},'filterStatsForExternalIds':{'value':[year]}}}
 try:
  req=urllib.request.Request(url,headers={'X-Fantasy-Filter':json.dumps(filters),'User-Agent':'FBL-Draft-Intelligence/0.3'})
  with urllib.request.urlopen(req,timeout=20) as response:payload=json.load(response)
  records=[s for entry in payload.get('players',[]) for s in entry.get('player',{}).get('stats',[]) if s.get('seasonId')==year and s.get('statSourceId')==1 and s.get('statSplitTypeId')==0 and s.get('scoringPeriodId')==0]
  return dict(year=year,source=url,projectionRecords=len(records),recordFields=sorted(set(k for r in records for k in r)),
              status='LIVE_ENDPOINT_NOT_FROZEN',preseasonVerified=False,
              reason='Historical seasonId and statSourceId do not prove that these values were available before the season. No independently dated preseason snapshot is attached.')
 except Exception as error:
  return dict(year=year,source=url,status='REQUEST_FAILED',preseasonVerified=False,error=str(error)[:250])
if __name__=='__main__':
 report=dict(checkedAt=datetime.now(timezone.utc).isoformat(),seasons=[inspect(2025),inspect(2026)],
             eligibleForForecastBacktest=False,reason='No independently dated preseason snapshot; past-season live projections are not accepted as leakage-free evidence.')
 Path('public/data/projection-archive-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2))
