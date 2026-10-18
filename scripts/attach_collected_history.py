"""Attach dated, collected NBA/NCAA seasons and reconciled summer games to models.
No name-only joins; no reconstruction of exact totals from rounded averages.
"""
import argparse,json,sqlite3,math
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
KEYS=['pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta','minutes']
def attach(data,db,identities,summer_root):
 mappings=identities['mappings'];by_id={str(r['playerId']):r for r in mappings};by_nba={str(r['nbaId']):r for r in mappings};by_espn={str(r['espnId']):r for r in mappings}
 seasons=defaultdict(list);inventory=defaultdict(dict)
 response_times={}
 if db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='responses'").fetchone()[0]:
  response_times={(url,sha):at for url,sha,at in db.execute('SELECT url,sha256,observed_at FROM responses')}
 for pid,competition,year,games in db.execute('SELECT player_id,competition,year,games FROM season_inventory'):
  inventory[(pid,competition)][f'{year-1}-{str(year)[-2:]}']=games
 for pid,comp,year,raw,url,sha in db.execute('SELECT player_id,competition,year,stats_json,source_url,sha256 FROM season_stats ORDER BY year'):
  row=json.loads(raw);stat=row.get('perGame')
  if not stat or not all(isinstance(stat.get(k),(int,float)) and math.isfinite(stat[k]) for k in KEYS):continue
  row.update(competition='NBA_REGULAR' if comp=='nba' else 'NCAA',source=url,rawSha256=sha,checkedAt=response_times.get((url,sha)))
  seasons[(pid,comp)].append(row)
 provider={str(eid):json.loads(raw) for eid,raw in db.execute('SELECT espn_id,record_json FROM provider_identities')}
 games=defaultdict(list);excluded=0
 path=summer_root/'games.ndjson'
 if not path.exists():raise ValueError('Collected Summer League protocols are required')
 for line in path.read_text().splitlines():
  event=json.loads(line)
  if event.get('status')!='NORMALIZED_RECONCILED_POINTS':excluded+=1;continue
  for row in event.get('players',[]):
   row=dict(row,source=event.get('source'),sourceQuality='POINTS_RECONCILED_NOT_INDEPENDENT_CALENDAR_COMPLETE')
   games[str(row['espnId'])].append(row)
 missing=[];attached=0;college=0;unusable=[]
 for p in data['players']:
  match=by_id.get(str(p['id'])) or by_nba.get(str(p.get('nbaId'))) or by_espn.get(str(p.get('espnId')))
  pid=str(match['playerId']) if match else str(p['id'])
  if match:
   if p.get('espnId') and str(p['espnId'])!=str(match['espnId']):raise ValueError('Conflicting collected ESPN identity: '+p['name'])
   p.update(espnId=str(match['espnId']),nbaId=match['nbaId'],identityEvidenceStatus=match['status'])
  eid=str(p.get('espnId',''));meta=provider.get(eid,{})
  if meta.get('age') is not None:p['age']=meta['age']
  if meta.get('draft'):p['draftContext']=meta['draft']
  nba=seasons.get((pid,'nba'),[]);ncaa=seasons.get((pid,'mens-college-basketball'),[])
  # ID-mapped seasons are used even if no independent NBA profile exists (NCAA-only prospects).
  if not nba:missing.append(dict(id=p['id'],name=p['name'],reason='No complete personal NBA season components in collected snapshot'))
  else:attached+=1
  if ncaa:college+=1
  p['historyGames']=inventory.get((pid,'nba'),p.get('historyGames',{}));p['historyReferenceSeason']='2025-26'
  observed=inventory.get((pid,'nba'),{})
  absent=[year for year in observed if int(year[:4])+1 not in {r['year'] for r in nba}]
  expected=set(match.get('expectedNBARegularEndYears',[])) if match else set()
  unusable_years=sorted((expected|{int(year[:4])+1 for year in observed})-{r['year'] for r in nba})
  p['historyUnusableEndYears']=[year for year in unusable_years if year<=2026]
  if absent:unusable.append(dict(id=p['id'],seasons=absent,reason='Participation exists; complete season components unavailable'))
  def evidence(rows,comp):return dict(seasons=rows,checkedAt=max((r.get('checkedAt') for r in rows if r.get('checkedAt')),default=None),loadedAt=data.get('generatedAt'),source='Collected ESPN '+comp+' snapshots; per-season URLs and raw SHA-256 retained',stale=False,collectionIsComplete=False)
  career=evidence(nba,'NBA');career['unusableEndYears']=p['historyUnusableEndYears']
  p['onlineEvidence']=dict(career=career,college=evidence(ncaa,'NCAA'),recentGames=games.get(eid,[]),unusableNBASeasons=absent,note='All complete collected personal NBA/NCAA seasons enter their respective models. Summer League is separate descriptive evidence, not an unvalidated NBA scoring adjustment. Collection remains incomplete.')
 report=dict(asOf=datetime.now(timezone.utc).isoformat(),status='PARTIAL_COLLECTION_INTEGRATED',careerPlayers=attached,careerSeasons=sum(len(p['onlineEvidence']['career']['seasons']) for p in data['players']),collegePlayers=college,collegeSeasons=sum(len(p['onlineEvidence']['college']['seasons']) for p in data['players']),summer=dict(excludedWarningEvents=excluded,acceptedPlayerGames=sum(len(x) for x in games.values()),use='DESCRIPTIVE_ONLY_NOT_CALIBRATED_NBA_EQUIVALENT'),missingCareerPlayers=missing,unusableSeasons=unusable,limitations=['Missing seasons remain missing, never zero talent.','Current-catalog survivor selection remains a training limitation.','No calibrated coach, lineup, tracking or injury forecast is implied.','Full FBL game arithmetic comes from the three parquet seasons; career target lacks game-result bonus.'])
 data['onlineAudit']=report;data['historyIntegrationAudit']=report
 return report
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--history',type=Path,default=Path('.cache/history/history.sqlite'));parser.add_argument('--summer',type=Path,default=Path('.cache/summer-games'));args=parser.parse_args()
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
 db=sqlite3.connect('file:'+str(args.history.resolve())+'?mode=ro',uri=True)
 report=attach(data,db,json.loads(Path('data/verified-identities.json').read_text()),args.summer)
 path.write_text(json.dumps(data,ensure_ascii=False));Path('public/data/history-integration-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 Path('public/data/online-evidence.json').write_text(json.dumps(dict(audit=report),ensure_ascii=False))
 print(json.dumps({k:v for k,v in report.items() if k not in ['missingCareerPlayers','unusableSeasons']},ensure_ascii=False))
