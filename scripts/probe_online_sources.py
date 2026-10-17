import concurrent.futures,json,urllib.request
urls={
'all_core':'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes?limit=1000',
'all_directory':'https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=10000&active=false',
'season_2010':'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2010/athletes?limit=1000',
'season_2000':'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2000/athletes?limit=1000'}
def get(item):
 name,url=item
 try:
  with urllib.request.urlopen(url,timeout=20) as r:d=json.load(r)
  return dict(name=name,keys=list(d),count=d.get('count'),pageCount=d.get('pageCount'),items=len(d.get('items',[])),examples=d.get('items',[])[:2])
 except Exception as e:return dict(name=name,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for r in pool.map(get,urls.items()):print(json.dumps(r))
