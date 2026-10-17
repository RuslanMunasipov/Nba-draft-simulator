import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from career_model import features,KEYS
from online_evidence import parse_career
class CareerInputTests(unittest.TestCase):
 def test_future_seasons_cannot_change_an_earlier_feature_vector(self):
  def row(year,value):return dict(year=year,games=60,perGame={k:value for k in KEYS})
  past=[row(2023,10),row(2024,20)]
  self.assertEqual(features(past,2025,25),features(past+[row(2025,9999),row(2026,9999)],2025,25))
 def test_combined_traded_player_row_is_not_counted_with_team_splits(self):
  names=['points','totalRebounds','assists','steals','blocks','turnovers','fouls','fieldGoalsMade-fieldGoalsAttempted','freeThrowsMade-freeThrowsAttempted']
  def record(team,games):
   return dict(teamId=team,season=dict(year=2024,displayName='2023-24'),stats=[str(10*games),str(2*games),str(games),str(games),str(games),str(games),str(games),str(3*games)+'-'+str(5*games),str(2*games)+'-'+str(3*games)])
  avg=[dict(teamId=team,season=dict(year=2024),stats=[str(games),'20']) for team,games in [('1',5),('2',5),('99',10)]]
  payload=dict(categories=[dict(name='averages',names=['gamesPlayed','avgMinutes'],statistics=avg),dict(name='totals',names=names,statistics=[record('1',5),record('2',5),record('99',10)])])
  rows=parse_career(payload);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['games'],10);self.assertEqual(rows[0]['perGame']['pts'],10)
