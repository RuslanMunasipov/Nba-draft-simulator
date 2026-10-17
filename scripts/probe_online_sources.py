"""Inspect public provider schemas in Actions; no dependencies outside stdlib."""
import json,urllib.request,concurrent.futures
URLS={
 'espnCareer':'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/stats',
 'espnAllAthletes':'https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000',
 'espnSummer':'https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=2026&limit=1000',
 'espnSummerStats':'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba-summer-las-vegas/athletes/5041935/stats',
 'espnSummerBox':'https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/summary?event=401881822',
 'espnInactive':'https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&active=false',
 'espnCurrent':'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season=2027&seasontype=1'
}
def shape(value,depth=0):
 if isinstance(value,dict):return {k:shape(v,depth+1) if depth<4 else str(v)[:120] for k,v in list(value.items())[:25]}
 if isinstance(value,list):return {'length':len(value),'sample':[shape(v,depth+1) for v in value[:2]]}
 return value
def get(item):
 name,url=item
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/'})
  with urllib.request.urlopen(req,timeout=18) as r:data=json.load(r)
  return dict(name=name,url=url,status='OK',schema=([dict(name=c.get('name'),names=c.get('names'),first=c.get('statistics',[])[:1],last=c.get('statistics',[])[-1:]) for c in data.get('categories',[])] if name=='espnCareer' else shape(data)))
 except Exception as e:return dict(name=name,url=url,status='ERROR',error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for result in pool.map(get,URLS.items()):print(json.dumps(result,ensure_ascii=False),flush=True)
