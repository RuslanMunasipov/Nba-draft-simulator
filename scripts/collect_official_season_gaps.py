"""Retrieve exact official game rows for independently identified ESPN season gaps.
Collection only: no forecast, tests, build or deployment.
"""
import argparse,json,urllib.parse
from pathlib import Path
from audit_data_sources import params
from resolve_history_identities import fetch
from build_default_database import normalize

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('.cache/nba-season-gaps'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 identities=json.loads(Path('data/verified-identities.json').read_text())['mappings'];results=[]
 for name,year in [('Kobi Simmons',2019),('Trevon Scott',2022),('Malcolm Cazalon',2024)]:
  row=dict(name=name,endYear=year,status='UNRESOLVED')
  try:
   matches=[p for p in identities if p['name']==name]
   if len(matches)!=1:raise ValueError('No unique verified identity')
   identity=matches[0];pid=identity['nbaId'];season=f'{year-1}-{str(year)[-2:]}'
   query=dict(params,LeagueID='00',PlayerID=pid,Season=season,SeasonType='Regular Season',MeasureType='Base',PerMode='Totals')
   url='https://stats.nba.com/stats/playergamelogs?'+urllib.parse.urlencode(query);raw,source=fetch(url,args.output);data=json.loads(raw)
   games=[dict(zip(t['headers'],r)) for t in data.get('resultSets',[]) for r in t.get('rowSet',[])]
   if not games:raise ValueError('Empty official game response, not zero participation')
   for game in games:
    if str(game['PLAYER_ID'])!=str(pid) or normalize(game['PLAYER_NAME'])!=normalize(name):raise ValueError('Returned identity mismatch')
    if str(game['SEASON_YEAR'])!=season:raise ValueError('Returned season mismatch')
   event_ids=[str(g['GAME_ID']) for g in games]
   if len(event_ids)!=len(set(event_ids)):raise ValueError('Duplicate official event')
   required=['PTS','REB','AST','STL','BLK','FGM','FGA','FTM','FTA','TOV','PF','MIN']
   if any(any(g.get(k) is None for k in required) for g in games):raise ValueError('Missing FBL counting components')
   row.update(status='OFFICIAL_GAME_ROWS_RECEIVED_NOT_FULLY_RECONCILED',playerId=identity['playerId'],nbaId=pid,source=source,playerGames=games,gameCount=len(games))
  except Exception as exc:row['error']=str(exc)
  results.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ['playerGames','source']}),flush=True)
 (args.output/'official-season-gap-evidence.json').write_text(json.dumps(dict(status='PARTIAL_SUPPLEMENT_NOT_CONTRACT_COMPLETION',seasons=results),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
