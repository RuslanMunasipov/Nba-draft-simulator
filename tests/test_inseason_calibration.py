import unittest
from scripts.inseason_calibration import split,availability,simple
class InseasonTests(unittest.TestCase):
 def case(self,obs):return dict(prior=dict(fp=30,min=30),obs=obs,target=0)
 def test_no_games_keeps_the_forecast(self):
  self.assertEqual(split(self.case([]),20,5,20),30)
 def test_new_role_moves_minutes_before_rate(self):
  obs=[dict(fp=40,min=40)]*5
  value=split(self.case(obs),20,5,20)
  self.assertTrue(simple(self.case(obs))<value<40)
 def test_availability_shrinks_toward_prior(self):
  c=dict(prior=.9,obs=[True,False,False,False],target=0)
  self.assertAlmostEqual(availability(c,20),(18+1)/24)
