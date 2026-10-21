"""ESPN team context for the current season: BPI projected wins per team, the depth chart rank of every player and each
club's regular-season dates. Writes public/data/team-context.json; the forecast build reads it when present.
Usage: espn_team_context.py
"""
import json,time,urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
from pathlib import Path

BPI='https://site.web.api.espn.com/apis/fitt/v3/sports/basketball/nba/powerindex?region=us&lang=en&limit=50'
TEAMS='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=100'
DEPTH='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/depthcharts'
SCHEDULE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/schedule?season=2027&seasontype=2'
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

def clubs():return [e['team'] for e in get(TEAMS)['sports'][0]['leagues'][0]['teams']]

def depth(teams):
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

def game_dates(payload):
    """US Eastern dates of a club's games (the calendar of ESPN's injury return dates): tip-off in UTC minus five hours,
    as no NBA game tips before noon Eastern."""
    out=[]
    for e in (payload or {}).get('events') or []:
        try:out.append((datetime.fromisoformat(str(e['date']).replace('Z','+00:00'))-timedelta(hours=5)).date().isoformat())
        except (KeyError,ValueError):continue
    return sorted(out)

def schedule(teams):
    """Regular-season dates per club (ESPN code). The forecast counts the club games a known absence takes from them; a
    club with a short or failed listing is left out and the forecast spreads the season evenly instead."""
    def one(team):
        try:return team['abbreviation'],game_dates(get(SCHEDULE.format(id=team['id'])))
        except Exception:return team['abbreviation'],[]  # noqa: BLE001
    with ThreadPoolExecutor(6) as ex:return {code:dates for code,dates in ex.map(one,teams) if len(dates)>=70}

if __name__=='__main__':
    teams=clubs()
    # The schedule is an extra: its failure must never cost the BPI and depth context.
    try:dates=schedule(teams)
    except Exception as exc:print(f'ESPN schedules unavailable: {exc}');dates={}  # noqa: BLE001
    data=dict(fetchedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'),source=dict(bpi=BPI,depth=DEPTH,schedule=SCHEDULE),bpi=bpi(),depth=depth(teams),schedule=dates)
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False))
    print(json.dumps(dict(teams=len(data['bpi']['teams']),depthPlayers=len(data['depth']),scheduleClubs=len(dates),sample=dict(list(data['bpi']['teams'].items())[:3]))))
