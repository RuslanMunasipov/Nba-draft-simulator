"""NBA draft classes (overall pick and name) from ESPN's draft API. Static history: run once per new draft.
Usage: fetch_nba_drafts.py [first_year] [last_year]  -> data/nba-drafts.json
"""
import concurrent.futures,json,sys,time,urllib.request
from pathlib import Path

OUT=Path('data/nba-drafts.json')
ROUNDS='https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{year}/draft/rounds?limit=100'

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url.replace('http://','https://'),headers={'User-Agent':'fbl-draft-simulator'}),timeout=20) as r:return json.load(r)
        except Exception:  # noqa: BLE001
            if attempt==3:raise
            time.sleep(1+attempt)

def draft(year):
    picks=[p for r in get(ROUNDS.format(year=year))['items'] for p in r['picks'] if p.get('athlete')]
    def one(p):
        a=get(p['athlete']['$ref'])
        return {'overall':p['overall'],'round':p['round'],'name':a.get('displayName') or a.get('fullName'),'draftAthleteId':a.get('id')}
    with concurrent.futures.ThreadPoolExecutor(8) as ex:return sorted(ex.map(one,picks),key=lambda x:x['overall'])

def main():
    first,last=(int(sys.argv[1]),int(sys.argv[2])) if len(sys.argv)>2 else (2003,2026)
    data=json.loads(OUT.read_text()) if OUT.exists() else {'source':ROUNDS,'drafts':{}}
    for year in range(first,last+1):
        data['drafts'][str(year)]=draft(year);print(year,len(data['drafts'][str(year)]),flush=True)
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=0)+'\n')

if __name__=='__main__':main()
