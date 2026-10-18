"""Read-only source inventory. No model fitting, tests, build or publication.
A successful sample request never establishes complete historical coverage.
"""
import concurrent.futures,hashlib,json,re,urllib.request,urllib.parse
from datetime import datetime,timezone
from pathlib import Path

def source(id,block,url,kind,depth,access='UNCONFIRMED'):
 return dict(id=id,block=block,sampleUrl=url,responseKind=kind,targetDepth=depth,bulkAccess=access)
params=dict(College='',Conference='',Country='',DateFrom='',DateTo='',Division='',DraftPick='',DraftYear='',GameScope='',GameSegment='',Height='',LastNGames=0,LeagueID='00',Location='',MeasureType='Advanced',Month=0,OpponentTeamID=0,Outcome='',PORound=0,PaceAdjust='N',PerMode='PerGame',Period=0,PlayerExperience='',PlayerPosition='',PlusMinus='N',Rank='N',Season='2025-26',SeasonSegment='',SeasonType='Regular Season',ShotClockRange='',StarterBench='',TeamID=0,VsConference='',VsDivision='',Weight='')
SOURCES=[
 source('sports_rules','Правила FBL','https://www.sports.ru/fantasy/basketball/tournament/rules/150.html','PAGE','Текущая версия + изменения'),
 source('sports_prices','Цены и позиции','https://www.sports.ru/fantasy/basketball/team/transfers/5930241.html','PAGE','Текущий каталог + датированные снимки','AUTHENTICATION_AND_SCHEMA_NOT_VERIFIED'),
 source('espn_career','NBA seasons','https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/stats','CAREER','Все сезоны каждого игрока','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('espn_gamelog','NBA games','https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog?season=2026&seasontype=2','JSON','Каждый доступный сезон, типы сезона раздельно','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('nba_advanced','USG and advanced','https://stats.nba.com/stats/leaguedashplayerstats?'+urllib.parse.urlencode(params),'NBA_TABLE','Все доступные сезоны; полнота каждого поля отдельно','REQUIRES_ACCESS_TERMS_DECISION'),
 source('nba_lineups','Lineups','https://www.nba.com/stats/lineups/advanced','PAGE','Все доступные сезоны и игровые отрезки','REQUIRES_ACCESS_TERMS_DECISION'),
 source('nba_tracking','Tracking','https://www.nba.com/stats/players/touches','PAGE','Каждый доступный показатель по годам','REQUIRES_ACCESS_TERMS_DECISION'),
 source('nba_transactions','Transactions','https://www.nba.com/players/transactions','PAGE','Полная история команд по датам'),
 source('nba_injury','Injuries','https://official.nba.com/nba-injury-report-2025-26-season','PAGE','Все доступные выпуски; текущий сезон отдельно'),
 source('nba_schedule','Calendar','https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json','JSON','Текущий сезон + история календарей'),
 source('ncaa_official','NCAA verification','https://www.ncaa.org/championships/statistics-and-records/','PAGE','Все сезоны колледжей каждого игрока'),
 source('espn_ncaa','NCAA seasons','https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/5041939/stats','CAREER','Все сезоны, игровые логи отдельно','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('espn_sl_vegas','Summer League Vegas','https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-las-vegas/scoreboard?dates=2026&limit=1000','SCOREBOARD','Все годы существования турнира','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('espn_sl_utah','Summer League Utah','https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-utah/scoreboard?dates=2026&limit=1000','SCOREBOARD','Все годы существования турнира','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('espn_sl_california','Summer League California','https://site.api.espn.com/apis/site/v2/sports/basketball/nba-summer-sacramento/scoreboard?dates=2026&limit=1000','SCOREBOARD','Все годы, включая изменения названия','PUBLIC_UNDOCUMENTED_ENDPOINT'),
 source('gleague','G League','https://stats.gleague.nba.com/players/advanced/','PAGE','Все сезоны выступлений; этапы отдельно'),
 source('euroleague','EuroLeague and EuroCup','https://www.euroleaguebasketball.net/euroleague/stats/','PAGE','Сезоны выступлений конкретных игроков'),
 source('acb','Spain ACB','https://acb.com/es/liga/estadisticas/estadisticas-de-jugador','PAGE','Сезоны выступлений конкретных игроков'),
 source('nbl','Australia NBL','https://www.nbl.com.au/stats/statistics','PAGE','Сезоны выступлений конкретных игроков'),
 source('fiba','National teams','https://www.fiba.basketball/en','PAGE','Турниры сборных; не замена клубным лигам'),
 source('nba_combine','Draft and physical data','https://www.nba.com/stats/draft/combine-strength-agility','PAGE','Все доступные классы драфта'),
 source('espn_universe','Historical identities','https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&page=1','JSON','Активные и неактивные; пагинация и фильтры подлежат проверке','PUBLIC_UNDOCUMENTED_ENDPOINT'),
]
# Data blocks without an accepted adapter must remain explicit, not disappear.
UNRESOLVED=[dict(block=b,status='NO_ACCEPTED_ADAPTER',required=r) for b,r in [
 ('Historical coaching tenures','Датированные назначения, увольнения и временные тренеры из официальных объявлений'),
 ('International leagues beyond listed sources','Определить лиги по карьерам всех целевых игроков, затем источники'),
 ('Preseason archive','Официальные протоколы; проверить фильтрацию типа сезона по каждому году'),
 ('Play-by-play and lineup stints','Проверить источник, замены, длительности отрезков и ошибки восстановления'),
 ('ESPN projections and ADP archive','Текущий адаптер scripts/espn_context.py; исторические датированные снимки не подтверждены'),
 ('Historical injuries and minute restrictions','Архивы отчётов + официальные объявления; полнота не подтверждена'),
 ('Persistent online data service','Постоянное хранилище, API и мониторинг свежести ещё не развёрнуты')]]
def inspect(s):
 result=dict(s,checkedAt=datetime.now(timezone.utc).isoformat(),coverageStatus='NOT_ESTABLISHED',normalizedAdapter='NOT_ACCEPTED')
 try:
  req=urllib.request.Request(s['sampleUrl'],headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nba.com/','Origin':'https://www.nba.com'})
  with urllib.request.urlopen(req,timeout=12) as response:
   body=response.read(20_000_001);result.update(httpStatus=response.status,contentType=response.headers.get('Content-Type'),finalUrl=response.url)
  result.update(bytes=len(body),sha256=hashlib.sha256(body).hexdigest())
  if len(body)>20_000_000:
   result['sampleStatus']='RESPONSE_SIZE_LIMIT';return result
  if s['responseKind']=='PAGE':
   html=body.decode('utf-8','replace').lower()
   result['sampleStatus']='PAGE_RECEIVED_DATA_NOT_VERIFIED'
   title=re.search(r'<title[^>]*>(.*?)</title>',html,re.S)
   if title:result['pageTitle']=re.sub(r'\s+',' ',title.group(1))[:180]
   if any(x in (result.get('pageTitle','')) for x in ('access denied','just a moment','captcha','verify you are human')):result['sampleStatus']='POSSIBLE_CHALLENGE_PAGE'
  else:
   d=json.loads(body);result['topLevelKeys']=list(d)[:20]
   if s['responseKind']=='CAREER':
    from online_evidence import parse_career
    rows=parse_career(d);result.update(sampleStatus='SEASONS_PARSED' if rows else 'EMPTY_OR_UNSUPPORTED',sampleSeasons=[dict(year=r['year'],season=r['season'],games=r['games']) for r in rows])
   elif s['responseKind']=='NBA_TABLE':
    tables=d.get('resultSets',[]);result.update(sampleStatus='TABLE_RECEIVED' if tables else 'EMPTY_OR_UNSUPPORTED',tables=[dict(name=t.get('name'),rows=len(t.get('rowSet',[])),columns=t.get('headers',[])) for t in tables])
   elif s['responseKind']=='SCOREBOARD':
    events=d.get('events',[]);result.update(sampleStatus='EVENTS_RECEIVED' if events else 'EMPTY_OR_UNSUPPORTED',events=len(events),dateRange=[min((e.get('date','') for e in events),default=None),max((e.get('date','') for e in events),default=None)])
   else:result['sampleStatus']='JSON_RECEIVED_SCHEMA_NOT_ACCEPTED'
 except Exception as exc:
  result.update(sampleStatus='REQUEST_OR_PARSE_FAILED',error=str(exc),httpStatus=getattr(exc,'code',result.get('httpStatus')))
 return result
def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(inspect,SOURCES))
 out=dict(version=1,asOf=datetime.now(timezone.utc).isoformat(),purpose='Read-only source discovery; not model validation or a claim of completeness',sources=results,unresolvedBlocks=UNRESOLVED)
 target=Path('data/source-audit.json');target.write_text(json.dumps(out,ensure_ascii=False,indent=2))
 for r in results:print(r['id'],r['sampleStatus'],r.get('httpStatus'),flush=True)
 print('Saved',target)
 print('SOURCE_AUDIT_REPORT_BEGIN'+json.dumps(out,ensure_ascii=False)+'SOURCE_AUDIT_REPORT_END',flush=True)
if __name__=='__main__':main()
