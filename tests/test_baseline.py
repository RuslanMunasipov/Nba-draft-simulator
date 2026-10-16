import importlib.util
import unittest
spec=importlib.util.spec_from_file_location('baseline','scripts/build_baseline.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
def season(fp,games=60,minutes=30):
 return {'games':games,'historicalCoreFPPerGame':fp,'averages':{'minutes':minutes}}
class BaselineTests(unittest.TestCase):
 def test_future_is_not_used(self):
  p={'id':1,'name':'SYNTHETIC','seasons':{'2023-24':season(10),'2024-25':season(20),'2025-26':season(999)}}
  self.assertEqual(baseline.estimate(p,['2023-24','2024-25'],True)['estimatedCoreFPPerGame'],17.5)
 def test_low_sample_excluded(self):
  self.assertIsNone(baseline.estimate({'seasons':{'2025-26':season(50,19)}},['2025-26']))
 def test_no_invented_prices_positions_or_full_fp(self):
  p={'id':1,'name':'SYNTHETIC','seasons':{'2025-26':season(20)}}
  value=baseline.estimate(p,['2025-26'])
  for key in ['price','positions','projectedFP']:self.assertNotIn(key,value)
  self.assertEqual(value['estimatedCoreSeasonTotal'],1200)
 def test_holdout_comparison_and_next_season_are_separate(self):
  p={'id':1,'name':'SYNTHETIC','seasons':{'2023-24':season(10),'2024-25':season(20),'2025-26':season(20)}}
  value=baseline.build({'players':[p],'seasons':['2023-24','2024-25','2025-26'],'generatedAt':'TEST'})
  self.assertEqual(value['evaluation']['models']['previousSeason']['maeCoreFPPerGame'],0)
  self.assertEqual(value['evaluation']['selectedModel'],'previousSeason')
  self.assertEqual(value['players'][0]['trainingSeasons'],['2025-26'])
if __name__=='__main__':unittest.main()
