import json, unittest
from pathlib import Path
from scripts.apply_sports_prices import apply
class Prices(unittest.TestCase):
 def test_prices_and_draft_positions_join_by_ids_and_yahoo_remains_reference(self):
  data={'players':[{'id':1,'name':'Same','espnId':'11','positions':['PG']},{'id':2,'name':'Same','espnId':'22','positions':['C']},{'id':3,'name':'Unknown','positions':['SF']}]}
  catalog={'source':'Sports.ru','capturedAt':'2026-10-17','count':2,'players':[{'sportsId':'a','name':'Same','club':'A','price':3500,'sportsPosition':'5'},{'sportsId':'b','name':'Same','club':'B','price':1000,'sportsPosition':'1'}]}
  apply(data,catalog,{'players':[{'sportsId':'a','espnId':'11','name':'Same','sportsName':'Same','sportsClub':'A'},{'sportsId':'b','espnId':'22','name':'Same','sportsName':'Same','sportsClub':'B'}]})
  self.assertEqual([p['price'] for p in data['players']],[3500,1000,None])
  self.assertEqual(data['players'][0]['positions'],['C'])
  self.assertEqual(data['players'][0]['yahooPositions'],['PG'])
  self.assertEqual(data['players'][2]['positions'],[])
  self.assertEqual(data['players'][2]['priceStatus'],'MISSING')
  self.assertEqual((data['cap'],data['priceMode']),(20000,'ON'))
 def test_snapshot_crosswalk_has_unique_ids_and_known_prices(self):
  prices=json.loads(Path('data/sports-prices-2026-10-17.json').read_text());mapping=json.loads(Path('data/sports-player-map.json').read_text())['players']
  self.assertEqual(len(mapping),len({p['sportsId'] for p in mapping}))
  self.assertEqual(len(mapping),len({p['espnId'] or p['nbaId'] for p in mapping}))
  by={p['sportsId']:p['price'] for p in prices['players']}
  named={p['name']:by[p['sportsId']] for p in mapping}
  self.assertEqual(named['Nikola Jokic'],3500);self.assertEqual(named['Cameron Boozer'],1800)
  self.assertEqual(named['Jalen Williams'],2000);self.assertEqual(named['Jaylin Williams'],1300)
 def test_identity_mismatch_fails_instead_of_attaching_a_price(self):
  data={'players':[{'id':1,'name':'Jalen Williams','espnId':'11','nbaId':1,'positions':['PF']}]}
  catalog={'source':'Sports.ru','capturedAt':'date','count':1,'players':[{'sportsId':'a','name':'Джейлин Уильямс','club':'OKC','price':1300,'sportsPosition':'4'}]}
  wrong={'players':[{'sportsId':'a','espnId':'11','nbaId':1,'name':'Jaylin Williams','sportsName':'Джейлин Уильямс','sportsClub':'OKC'}]}
  with self.assertRaisesRegex(ValueError,'Identity name mismatch'):apply(data,catalog,wrong)
