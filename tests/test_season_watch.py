import unittest
from scripts.season_watch import changed_teams
row=lambda n:{'date':'2026-10-19','buy':{'name':n,'price':1500},'sell':{'name':'X','price':1500}}
class WatchTests(unittest.TestCase):
 def test_new_row_is_detected(self):
  snapshot={'teams':{'0':{'journal':[row('A')]},'6':{'journal':[row('A')]}}}
  self.assertEqual(changed_teams(snapshot,{'0':[row('A')],'6':[row('A'),row('Ленард')]}),['6'])
 def test_unknown_team_counts_as_new(self):
  self.assertEqual(changed_teams({'teams':{}},{'3':[row('A')]}),['3'])
 def test_shorter_journal_is_a_bad_read_not_a_change(self):
  self.assertEqual(changed_teams({'teams':{'1':{'journal':[row('A'),row('B')]}}},{'1':[row('A')]}),[])
