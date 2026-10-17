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

 def test_draft_position_distinguishes_second_round_from_lottery(self):
  from rookie_model import draft_pick
  self.assertEqual(draft_pick(dict(draftContext=dict(round=1,selection=3))),3)
  self.assertEqual(draft_pick(dict(draftContext=dict(round=2,selection=3))),33)
  self.assertIsNone(draft_pick(dict(draftContext=None)))

 def test_development_features_use_debut_and_observed_growth_without_future(self):
  def row(year,value):return dict(year=year,games=60,perGame={k:value for k in KEYS})
  past=[row(2023,10),row(2024,20)]
  expected=features(past,2025,25,'DEVELOPMENT')
  self.assertEqual(expected,features(past+[row(2025,9999),row(2026,9999)],2025,25,'DEVELOPMENT'))
  self.assertEqual(expected,features(list(reversed(past)),2025,25,'DEVELOPMENT'))
  other=[row(2023,5),row(2024,20)]
  self.assertNotEqual(expected,features(other,2025,25,'DEVELOPMENT'))
  self.assertGreater(len(expected),len(features(past,2025,25)))

 def test_development_stage_reports_include_absent_next_season(self):
  from career_model import transitions
  def row(year):return dict(year=year,games=60,perGame={k:10 for k in KEYS})
  player=dict(id='test',age=23,onlineEvidence=dict(career=dict(seasons=[row(2024)])))
  rows=transitions([player],'DEVELOPMENT')
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['year'],2025)
  self.assertEqual(rows[0]['experience'],1)
  self.assertFalse(rows[0]['active'])
  self.assertEqual(rows[0]['actual'],0)
