import json,unittest
from pathlib import Path
from scripts.inseason_calibration import split,availability,simple,game_offsets,participation,BUCKETS
class InseasonTests(unittest.TestCase):
 def case(self,obs):return dict(prior=dict(fp=30,min=30),obs=obs,target=0)
 def test_no_games_keeps_the_forecast(self):
  self.assertEqual(split(self.case([]),20,5,20),30)
 def test_new_role_moves_minutes_before_rate(self):
  obs=[dict(fp=40,min=40)]*5
  value=split(self.case(obs),20,5,20)
  self.assertTrue(simple(self.case(obs))<value<40)
 def test_participation_is_not_scaled_by_minutes(self):
  # Same counting rate (28 per 30 minutes) in a 40-minute role: the +1 stays 1, it does not grow to 1.33.
  c=dict(prior=dict(fp=29,min=30,part=1),obs=[dict(fp=28/30*40+1,min=40)]*5,target=0)
  value=split(c,20,5,None)
  minutes=(5*30+5*40)/10
  self.assertAlmostEqual(value,28/30*minutes+1)
  # A bench role under 10 minutes earns the same +1 per game played (Yahoo GP).
  bench=dict(prior=dict(fp=11,min=12,part=1),obs=[dict(fp=10/12*8+1,min=8)]*40,target=0)
  self.assertAlmostEqual(split(bench,20,1,None)-10/12*(12+40*8)/41,1)
 def test_offsets_lift_early_games_only_by_their_scale(self):
  off=dict(counting=[1.5]+[0]*(len(BUCKETS)-1),minutes=[0]*len(BUCKETS))
  c=self.case([dict(fp=30,min=30)]*3)
  self.assertEqual(split(c,20,5,20,0,off),split(c,20,5,20))
  self.assertGreater(split(c,20,5,20,1,off),split(c,20,5,20))
 def test_early_games_run_below_the_rest_of_the_season(self):
  logs={'a':[dict(fp=20+i/10,min=30+i/20) for i in range(60)]}
  off=game_offsets(logs)
  self.assertGreater(off['counting'][0],off['counting'][3]);self.assertGreater(off['minutes'][0],0)
  self.assertEqual(participation(9.99),1);self.assertEqual(participation(10),1)
 def test_availability_shrinks_toward_prior(self):
  c=dict(prior=.9,obs=[True,False,False,False],target=0)
  self.assertAlmostEqual(availability(c,20),(18+1)/24)
 def test_a_reported_spell_counts_a_few_misses(self):
  c=dict(prior=.9,obs=[True]*10+[False]*30,target=0)
  self.assertAlmostEqual(availability(c,20,4),(18+10)/(20+14))
  self.assertAlmostEqual(availability(c,20),(18+10)/(20+40))
  # Only the trailing run is the reported absence; earlier misses count in full.
  self.assertAlmostEqual(availability(dict(c,obs=[False]*5+[True]*5+[False]*6),20,4),(18+5)/(20+14))
 def test_golden_cases_match_the_fixture_the_js_estimator_is_pinned_to(self):
  fixture=json.loads(Path('tests/fixtures/inseason-golden.json').read_text())
  for x in fixture['cases']:
   c=fixture['points']['newcomer' if x['newcomer'] else 'established']
   value=split(dict(prior=x['prior'],obs=x['obs'],target=0),c['rateGames'],c['minuteGames'],c['minuteHalfLife'],c['offsetScale'],fixture['points']['offsets'])
   self.assertAlmostEqual(value,x['expected'],places=9)
 def test_shipped_calibration_is_unbiased_for_established_players(self):
  data=json.loads(Path('data/inseason-calibration.json').read_text())
  held=data['holdout']['established']
  self.assertLess(abs(held['calibratedBias']),.1);self.assertLess(held['calibratedRMSE'],held['currentRMSE'])
  ret=data['holdout']['availabilityAtReturn']
  self.assertTrue(all(abs(v)<.05 for v in ret['calibratedBiasBySpell'].values()))
