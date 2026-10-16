import unittest
from scripts.build_forecasts import partial,full,result_bonuses,quantile,season_scenarios
class ForecastTests(unittest.TestCase):
 def test_full_formula_and_result_signs(self):
  r=dict(pts=20,reb=8,ast=5,stl=1,blk=2,fga=15,fgm=8,fta=6,ftm=4,tov=3,pf=2,minutes=30)
  self.assertEqual(partial(r),21)
  self.assertEqual(full(r,3),24)
  self.assertEqual(full(r,-3),18)
 def test_only_complete_two_team_games_receive_inferred_results(self):
  rows=[dict(game_id=1,team=team,home=home,minutes=48,pts=pts) for team,home,pts in [('A',True,20),('B',False,18)] for i in range(5)]
  bonuses,audit=result_bonuses(rows);self.assertEqual(bonuses,{(1,'A'):2,(1,'B'):-2});self.assertEqual(audit['usableGames'],1)
  bonuses,audit=result_bonuses(rows[:-1]);self.assertEqual(bonuses,{});self.assertEqual(audit['rejectedGames'],1)
 def test_empirical_ranges_preserve_paired_availability_and_production(self):
  self.assertEqual(season_scenarios(20,70,[(10,-30),(-5,12)]),[1200,1230])
  self.assertEqual(quantile([0,10],.9),9)
