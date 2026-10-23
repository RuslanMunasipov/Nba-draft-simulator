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
  cards=[s for p in mapping for s in [p['sportsId'],*p.get('previousSportsIds',[])]]
  self.assertEqual(len(cards),len(set(cards)))
  self.assertEqual(len(mapping),len({p['espnId'] or p['nbaId'] for p in mapping}))
  additions=json.loads(Path('data/sports-market-additions.json').read_text())['players']
  by={p['sportsId']:p['price'] for p in prices['players']+additions}
  named={p['name']:next(by[s] for s in [p['sportsId'],*p.get('previousSportsIds',[])] if s in by) for p in mapping}
  self.assertEqual(named['Nikola Jokic'],3500);self.assertEqual(named['Cameron Boozer'],1800)
  self.assertEqual(named['Jalen Williams'],2000);self.assertEqual(named['Jaylin Williams'],1300)
  self.assertEqual(named['Kawhi Leonard'],2400)
  # Sports.ru replaced Keaton Wagler's card on 23.10.2026: the catalog's 2208842 was emptied, 2208816 is his card now.
  wagler=next(p for p in mapping if p['name']=='Keaton Wagler')
  self.assertEqual((wagler['sportsId'],wagler['previousSportsIds'],named['Keaton Wagler']),('2208816',['2208842'],1400))
  # The audit of 23.10: Kenrich Williams's card was missing, Lawal's and Hopkins's were renamed into Cyrillic.
  self.assertEqual(named['Kenrich Williams'],1214)
  self.assertEqual({p['name']:(p['sportsName'],p['previousSportsNames']) for p in mapping if p.get('previousSportsNames')},
   {'Tobi Lawal':('Лавал',['Lawal']),'Bryce Hopkins':('Хопкинс',['Hopkins'])})
 def test_a_renamed_card_matches_its_old_name_and_a_row_captured_apart_keeps_its_date(self):
  data={'players':[{'id':1,'name':'Tobi Lawal','espnId':'11','positions':[]},{'id':2,'name':'Kenrich Williams','espnId':'22','positions':[]}]}
  catalog={'source':'snapshot','capturedAt':'d1','count':1,'players':[{'sportsId':'a','name':'Lawal','club':'Даллас','price':1000,'sportsPosition':'4'}]}
  additions={'source':'roster','capturedAt':'d2','players':[{'sportsId':'b','name':'К. Уильямс','club':'Оклахома-Сити','price':1214,'sportsPosition':'3','source':'other roster','capturedAt':'d3'}]}
  crosswalk={'players':[{'sportsId':'a','previousSportsNames':['Lawal'],'espnId':'11','name':'Tobi Lawal','sportsName':'Лавал','sportsClub':'Даллас'},
                        {'sportsId':'b','espnId':'22','name':'Kenrich Williams','sportsName':'К. Уильямс','sportsClub':'Оклахома-Сити'}]}
  apply(data,catalog,crosswalk,additions)
  a,b=data['players'];self.assertEqual((a['sportsName'],a['price'],a['positions'],a['priceCheckedAt']),('Лавал',1000,['PF'],'d1'))
  self.assertEqual((b['price'],b['positions'],b['priceCheckedAt'],b['positionSource']),(1214,['SF'],'d3','other roster'))
 def test_a_replaced_card_is_priced_from_the_catalog_and_keyed_by_its_new_id(self):
  data={'players':[{'id':1,'name':'Keaton Wagler','espnId':'11','positions':['SG']}]}
  catalog={'source':'snapshot','capturedAt':'d1','count':1,'players':[{'sportsId':'old','name':'Уоглер','club':'Клипперс','price':1400,'sportsPosition':'2'}]}
  crosswalk={'players':[{'sportsId':'new','previousSportsIds':['old'],'espnId':'11','name':'Keaton Wagler','sportsName':'Уоглер','sportsClub':'Клипперс'}]}
  report=apply(data,catalog,crosswalk)
  p=data['players'][0];self.assertEqual((p['sportsId'],p['previousSportsIds'],p['price'],p['positions'],p['priceCheckedAt']),('new',['old'],1400,['SG'],'d1'))
  self.assertEqual((report['matchedPlayers'],report['unmatchedSportsPlayers']),(1,[]))
  with self.assertRaisesRegex(ValueError,'Duplicate Sports.ru crosswalk ID'):
   apply(data,catalog,{'players':[*crosswalk['players'],{'sportsId':'old','espnId':'22','name':'Other','sportsName':'Другой','sportsClub':'Клипперс'}]})
 def test_identity_mismatch_fails_instead_of_attaching_a_price(self):
  data={'players':[{'id':1,'name':'Jalen Williams','espnId':'11','nbaId':1,'positions':['PF']}]}
  catalog={'source':'Sports.ru','capturedAt':'date','count':1,'players':[{'sportsId':'a','name':'Джейлин Уильямс','club':'OKC','price':1300,'sportsPosition':'4'}]}
  wrong={'players':[{'sportsId':'a','espnId':'11','nbaId':1,'name':'Jaylin Williams','sportsName':'Джейлин Уильямс','sportsClub':'OKC'}]}
  with self.assertRaisesRegex(ValueError,'Identity name mismatch'):apply(data,catalog,wrong)
 def test_market_additions_are_priced_and_dated_by_their_own_capture(self):
  data={'players':[{'id':1,'name':'Late','espnId':'11','positions':[]}]}
  catalog={'source':'snapshot','capturedAt':'d1','count':0,'players':[]}
  additions={'source':'roster','capturedAt':'d2','players':[{'sportsId':'a','name':'Лейт','club':'A','price':2400,'sportsPosition':'3'}]}
  apply(data,catalog,{'players':[{'sportsId':'a','espnId':'11','name':'Late','sportsName':'Лейт','sportsClub':'A'}]},additions)
  p=data['players'][0];self.assertEqual((p['price'],p['positions'],p['priceCheckedAt'],p['positionSource']),(2400,['SF'],'d2','roster'))
  with self.assertRaisesRegex(ValueError,'already in the catalog'):apply(data,{**catalog,'count':1,'players':additions['players']},{'players':[]},additions)
