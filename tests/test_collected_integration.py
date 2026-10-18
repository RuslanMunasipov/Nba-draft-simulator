import unittest,sys,tempfile,sqlite3,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from attach_collected_history import attach,KEYS
class Integration(unittest.TestCase):
 def test_all_complete_seasons_enter_inputs_and_warning_games_do_not(self):
  db=sqlite3.connect(':memory:')
  db.executescript('CREATE TABLE season_inventory(player_id TEXT,competition TEXT,year INTEGER,games REAL);CREATE TABLE season_stats(player_id TEXT,competition TEXT,year INTEGER,stats_json TEXT,source_url TEXT,sha256 TEXT);CREATE TABLE provider_identities(espn_id TEXT,record_json TEXT);')
  for comp,year in [('nba',2010),('nba',2024),('nba',2026),('mens-college-basketball',2009)]:
   row=dict(year=year,season=str(year-1)+'-'+str(year)[-2:],games=50,perGame=dict.fromkeys(KEYS,1))
   db.execute('INSERT INTO season_stats VALUES(?,?,?,?,?,?)',('1',comp,year,json.dumps(row),'https://source.example','hash'))
   db.execute('INSERT INTO season_inventory VALUES(?,?,?,?)',('1',comp,year,50))
  db.execute('INSERT INTO season_inventory VALUES(?,?,?,?)',('1','nba',2022,1))
  data={'generatedAt':'2026-10-18','players':[dict(id=1,name='Example',nbaId=101,espnId='201',historyGames={})]}
  identity={'mappings':[dict(playerId=1,nbaId=101,espnId='201',status='VERIFIED_NAME_DOB_NBA_ID')]}
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);valid=dict(status='NORMALIZED_RECONCILED_POINTS',players=[dict(espnId='201',competition='summer',stats=dict(minutes=10))]);bad=dict(valid,status='NORMALIZED_WITH_WARNINGS')
   (root/'games.ndjson').write_text(json.dumps(valid)+'\n'+json.dumps(bad)+'\n')
   report=attach(data,db,identity,root)
  p=data['players'][0]
  self.assertEqual([r['year'] for r in p['onlineEvidence']['career']['seasons']],[2010,2024,2026])
  self.assertEqual(len(p['onlineEvidence']['college']['seasons']),1)
  self.assertEqual(p['historyGames']['2021-22'],1)
  self.assertEqual(len(p['onlineEvidence']['recentGames']),1)
  self.assertEqual(report['summer']['excludedWarningEvents'],1)
  self.assertEqual(p['onlineEvidence']['unusableNBASeasons'],['2021-22'])
if __name__=='__main__':unittest.main()

class GapTraining(unittest.TestCase):
 def test_known_missing_source_season_is_not_a_zero_availability_target(self):
  from career_model import transitions
  stat=dict.fromkeys(KEYS,1)
  seasons=[dict(year=2024,games=50,perGame=stat),dict(year=2026,games=50,perGame=stat)]
  players=[dict(id=1,onlineEvidence=dict(career=dict(seasons=seasons,unusableEndYears=[2025])))]
  self.assertFalse(any(r['year']==2025 for r in transitions(players)))
