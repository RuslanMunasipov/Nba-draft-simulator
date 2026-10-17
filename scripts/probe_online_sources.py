import json,urllib.request
url='https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3112335/gamelog?season=2025&seasontype=2'
with urllib.request.urlopen(url,timeout=20) as r:d=json.load(r)
print(json.dumps({'keys':list(d),'seasonTypes':[{**g,'categories':[{**c,'events':c.get('events',[])[:1]} for c in g.get('categories',[])[:1]]} for g in d.get('seasonTypes',[])]}))
print(json.dumps({'events':list(d.get('events',{}).items())[:1]}))
