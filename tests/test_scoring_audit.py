import unittest
from scripts.audit_scoring import terms,close
from scripts.espn_context import individual_projection
class ScoringAuditTests(unittest.TestCase):
 def test_turnovers_cost_two_and_can_make_score_negative(self):
  row=dict(pts=2,reb=1,ast=0,stl=0,blk=0,fgm=1,fga=5,ftm=0,fta=0,tov=5)
  self.assertEqual(sum(terms(row).values()),-11)
  self.assertEqual(sum(terms(dict(row,tov=6)).values()),-13)
  with self.assertRaises(ValueError):close(-11,0,'negative score must not be clipped')
 def test_provider_projection_keeps_negative_full_counting_subtotal(self):
  stats={'0':2,'1':0,'2':0,'3':0,'6':1,'11':5,'13':1,'14':5,'15':0,'16':0,'17':0,'40':12}
  result=individual_projection({'stats':stats},1)
  self.assertEqual(result['componentSeasonTotal'],-11)
