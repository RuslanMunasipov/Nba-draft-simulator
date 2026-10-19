"""ESPN team context for the current season: BPI projected wins per team and the depth chart rank of every player.
Writes public/data/team-context.json; the forecast build reads it when present. Usage: espn_team_context.py
"""
import json,time,urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path

BPI='https://site.web.api.espn.com/apis/fitt/v3/sports/basketball/nba/powerindex?region=us&lang=en&limit=50'
TEAMS='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=100'
DEPTH='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/depthcharts'
OUT=Path('public/data/team-context.json')

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'FBL-Draft-Intelligence/0.3'}),timeout=30) as r:return json.load(r)
        except Exception:  # noqa: BLE001
            if attempt==3:raise
            time.sleep(2*(attempt+1))

def bpi():
    data=get(BPI);labels={c['name']:c['labels'] for c in data['categories']};out={}
    for t in data['teams']:
        values={c['name']:dict(zip(labels[c['name']],c['values'])) for c in t['categories']}
        w,l=values['projections']['ProjW'],values['projections']['ProjL']
        out[t['team']['abbreviation']]=dict(projectedWins=w,projectedLosses=l,bpi=values['bpi']['BPI'])
    if len(out)!=30:raise ValueError('BPI must cover 30 teams')
    return {'season':data['currentSeason']['displayName'],'updated':data.get('lastUpdated'),'teams':out}

def depth():
    teams=[e['team'] for e in get(TEAMS)['sports'][0]['leagues'][0]['teams']]
    def one(team):
        chart=get(DEPTH.format(id=team['id'])).get('depthchart') or []
        ranks={}
        for c in chart:
            for pos,v in (c.get('positions') or {}).items():
                for i,a in enumerate(v.get('athletes') or []):
                    best=ranks.get(str(a['id']))
                    if not best or i+1<best['rank']:ranks[str(a['id'])]=dict(position=pos.upper(),rank=i+1,team=team['abbreviation'])
        return ranks
    out={}
    with ThreadPoolExecutor(6) as ex:
        for ranks in ex.map(one,teams):out.update(ranks)
    return out

if __name__=='__main__':
    data=dict(fetchedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'),source=dict(bpi=BPI,depth=DEPTH),bpi=bpi(),depth=depth())
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False))
    print(json.dumps(dict(teams=len(data['bpi']['teams']),depthPlayers=len(data['depth']),sample=dict(list(data['bpi']['teams'].items())[:3]))))
