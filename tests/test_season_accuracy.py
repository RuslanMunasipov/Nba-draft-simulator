import unittest
from scripts.season_accuracy import cohort,SeasonModel,evaluate,scenarios
class AccuracyTests(unittest.TestCase):
 def rows(self):
  return [dict(id=i,full=10+i%20,games=40+i%35,minutes=15+i%20,delta=-1,gamesDelta=-5,absent=i%13==0,actual=0 if i%13==0 else (9+i%20)*(35+i%35)) for i in range(1,201)]
 def test_zero_game_seasons_are_included(self):
  rows=cohort({1:dict(full=20,games=70,minutes=30)},{})
  self.assertTrue(rows[0]['absent']);self.assertEqual(rows[0]['actual'],0)
  self.assertEqual(scenarios(dict(full=40,games=82),rows),[0])
 def test_calibration_players_are_separate_and_holdout_cannot_change_model(self):
  model=SeasonModel(self.rows());before=model.report()
  self.assertTrue(all(int(r['id'])%4!=0 for r in model.fit))
  result=evaluate(model,self.rows(),self.rows())
  self.assertEqual(before,model.report());self.assertGreater(result['absentPlayers'],0)
  self.assertEqual(result['players'],200)
 def test_finite_ranges_and_zero_season_risk(self):
  model=SeasonModel(self.rows())
  centre,lo,hi=model.interval(dict(full=20,games=70,minutes=30))
  self.assertLessEqual(lo,centre);self.assertGreaterEqual(hi,centre)
  self.assertGreaterEqual(model.padding,0)

 def test_availability_can_recover_from_short_seasons_without_invented_multiplier(self):
  rows=[dict(id=i,full=20,games=30,minutes=30,delta=0,gamesDelta=40,absent=False,actual=1400) for i in range(1,101)]
  model=SeasonModel(rows)
  rate,games=model.point_parts(dict(full=20,games=30,minutes=30))
  self.assertEqual(games,70)
  self.assertEqual(rate,20)
  self.assertEqual(model.calibrationPlayers,25)
 def test_repeated_calibration_player_is_counted_once(self):
  rows=self.rows()
  model=SeasonModel(rows+rows)
  self.assertEqual(model.calibrationPlayers,50)
