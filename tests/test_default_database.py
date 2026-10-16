import importlib.util
import unittest
spec=importlib.util.spec_from_file_location('database','scripts/build_default_database.py')
database=importlib.util.module_from_spec(spec);spec.loader.exec_module(database)
class DatabaseTests(unittest.TestCase):
 def test_rookies_use_explicit_empirical_prior_and_keep_scoped_ids(self):
  historical=[];estimates=[];current=[]
  for i in range(8):
   historical.append({'id':i+1,'name':f'SYNTHETIC {i}','seasons':{'2025-26':{'games':30,'historicalCoreFPPerGame':10+i,'lastHistoricalTeam':'AAA','averages':{'fga':10}}}})
   estimates.append({'id':i+1,'estimatedCoreFPPerGame':10+i,'baseSeason':'2025-26','coverageStatus':'RECENT_SEASON','uncertainty':'HIGH','trainingSeasons':['2025-26']})
   current.append({'espnId':str(100+i),'name':f'SYNTHETIC {i}','team':'AAA','positions':['PG'],'experience':2,'injuries':[],'source':'TEST'})
  current.append({'espnId':'999','name':'SYNTHETIC ROOKIE','team':'BBB','positions':['C'],'experience':0,'injuries':[],'source':'TEST'})
  result=database.make_database({'players':historical},{'players':estimates},current,'TEST')
  rookie=next(p for p in result['players'] if p['id']=='espn:999')
  self.assertIsNone(rookie['nbaId']);self.assertTrue(rookie['isRookie'])
  self.assertEqual(rookie['projectedFP'],13.5)
  self.assertEqual(rookie['projectionStatus'],'EMPIRICAL_ROOKIE_PRIOR')
  self.assertNotIn('price',rookie)
 def test_names_normalize_accents_and_suffix_without_conflating_ids(self):
  self.assertEqual(database.normalize('Nikola Jokić Jr.'),'nikola jokic')
if __name__=='__main__':unittest.main()
