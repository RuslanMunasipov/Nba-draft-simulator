import unittest
from scripts.build_forecasts import partial,full,profiles,quantile,season_scenarios
class ForecastTests(unittest.TestCase):
 def test_full_formula_has_no_team_result_bonus(self):
  r=dict(pts=20,reb=8,ast=5,stl=1,blk=2,fga=15,fgm=8,fta=6,ftm=4,tov=3,pf=2,minutes=30)
  self.assertEqual(partial(r),21)
  # FBL (Yahoo league settings, 21.10.2026): no win/loss bonus, 1 point per game played whatever the minutes.
  self.assertEqual(full(r),20)
  self.assertEqual(full(dict(r,minutes=9)),20)
 def test_every_game_a_player_played_is_scored(self):
  # No complete-lineup reconstruction is needed any more: a game counts on its own row.
  rows=[dict(game_id=1,team='A',player_id=7,player_name='X',minutes=30,pts=10,reb=0,ast=0,stl=0,blk=0,fga=5,fgm=5,fta=0,ftm=0,tov=0,pf=0),
        dict(game_id=2,team='A',player_id=7,player_name='X',minutes=0,pts=0,reb=0,ast=0,stl=0,blk=0,fga=0,fgm=0,fta=0,ftm=0,tov=0,pf=0)]
  p=profiles(rows)[7];self.assertEqual(p['games'],1);self.assertEqual(p['full'],11)
 def test_empirical_ranges_preserve_paired_availability_and_production(self):
  self.assertEqual(season_scenarios(20,70,[(10,-30),(-5,12)]),[1200,1230])
  self.assertEqual(quantile([0,10],.9),9)
