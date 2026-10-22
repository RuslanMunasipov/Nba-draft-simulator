"""The site's player database without what no page reads (the last build step before the bundle).
public/data/default-draft.json is about 3.9 MB built: the build's audits and per-player provenance fields no module of
the site, the personal bot or the awards bot reads go to default-draft-audits.json beside it (nothing is lost), and
floating-point numbers keep 4 decimals (a forecast of 31.461775144035716 FP is 31.4618). It runs on the built site
(dist/data) after the build's checks (scripts/verify-build.js reads the audits and checks identities to 1e-6 on the
full file) and before the browser smoke test; the uploaded build artifact keeps the full file.
Usage: slim_database.py [path]  (default dist/data/default-draft.json)"""
import json,sys
from pathlib import Path

# Read by no module of src/, scripts/notify-transfers.mjs or awards-bot/ (tests/test_slim_database.py checks it).
AUDITS=['rookiePrior','limitations','injuryReport','espnCoverage','positionAudit','sportsPositionAudit','onlineAudit','historyIntegrationAudit',
        'careerModelAudit','forecastAudit','rookieModelAudit','forecastCoverage','replacementLevel','forecastNotes','scoringAudit','sportsHistoryAudit']
PLAYER_FIELDS=['sourceUpdatedAt','positionCheckedAt','nbaExperience','identityEvidenceStatus','rosterSource','projectionMetric','positionProvider','uncertainty','marketContext']
FORECAST_FIELDS=['asOf','seasonRangeBasis','intervalCalibration','rulesSource','gameRangeBasis','intervalCohort','rangeMeaning']
DECIMALS=4

def rounded(x):
    if isinstance(x,float):return round(x,DECIMALS)
    if isinstance(x,list):return [rounded(v) for v in x]
    if isinstance(x,dict):return {k:rounded(v) for k,v in x.items()}
    return x

def slim(data):
    """(the site's database, the audits moved out of it)."""
    audits={k:data[k] for k in AUDITS if k in data}
    out={k:v for k,v in data.items() if k not in AUDITS}
    players=[]
    for p in data.get('players') or []:
        q={k:v for k,v in p.items() if k not in PLAYER_FIELDS}
        if isinstance(q.get('forecast'),dict):q['forecast']={k:v for k,v in q['forecast'].items() if k not in FORECAST_FIELDS}
        players.append(rounded(q))
    out['players']=players
    out['slimmed']=dict(by='scripts/slim_database.py',audits='default-draft-audits.json',decimals=DECIMALS)
    return out,audits

if __name__=='__main__':
    path=Path(sys.argv[1] if len(sys.argv)>1 else 'dist/data/default-draft.json')
    before=path.stat().st_size;data,audits=slim(json.loads(path.read_text(encoding='utf-8')))
    path.with_name('default-draft-audits.json').write_text(json.dumps(audits,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'{path}: {before:,} -> {path.stat().st_size:,} bytes')
