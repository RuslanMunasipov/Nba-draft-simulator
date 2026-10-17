import concurrent.futures,json,urllib.request
urls={
'core':'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/5041935',
'overview':'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/5041935/overview',
'site':'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/5041935'}
def get(item):
 name,url=item
 try:
  with urllib.request.urlopen(url,timeout=12) as r:d=json.load(r)
  a=d.get('athlete',d)
  return dict(name=name,keys=list(d),athleteKeys=list(a),draft=a.get('draft'),displayName=a.get('displayName'))
 except Exception as e:return dict(name=name,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for result in pool.map(get,urls.items()):print(json.dumps(result))

# Source metadata check.
