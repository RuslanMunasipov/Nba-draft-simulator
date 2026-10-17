import concurrent.futures,json,urllib.request,urllib.parse
params=dict(College='',Conference='',Country='',DateFrom='',DateTo='',Division='',DraftPick='',DraftYear='',GameScope='',GameSegment='',LastNGames='0',LeagueID='00',Location='',MeasureType='Base',Month='0',OpponentTeamID='0',Outcome='',PORound='0',PaceAdjust='N',PerMode='PerGame',Period='0',PlayerExperience='',PlayerPosition='',PlusMinus='N',Rank='N',Season='2000-01',SeasonSegment='',SeasonType='Regular Season',ShotClockRange='',StarterBench='',TeamID='0',VsConference='',VsDivision='',Weight='0')
urls={'nba_2001':'https://stats.nba.com/stats/leaguedashplayerstats?'+urllib.parse.urlencode(params),
'nba_players':'https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=2025-26',
'espn_jordan':'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1035/stats'}
def get(item):
 name,url=item
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/'})
  with urllib.request.urlopen(req,timeout=25) as r:d=json.load(r)
  sets=d.get('resultSets',[])
  return dict(name=name,keys=list(d),sets=[dict(headers=s.get('headers'),count=len(s.get('rowSet',[])),examples=s.get('rowSet',[])[:1]) for s in sets],careerCategories=len(d.get('categories',[])))
 except Exception as e:return dict(name=name,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for r in pool.map(get,urls.items()):print(json.dumps(r))
