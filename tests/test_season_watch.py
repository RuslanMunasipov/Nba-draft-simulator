import unittest
from scripts.season_watch import changed_teams,mark_read
row=lambda n:{'date':'2026-10-19','buy':{'name':n,'price':1500},'sell':{'name':'X','price':1500}}
class WatchTests(unittest.TestCase):
 def test_new_row_is_detected(self):
  snapshot={'teams':{'0':{'journal':[row('A')]},'6':{'journal':[row('A')]}}}
  self.assertEqual(changed_teams(snapshot,{'0':[row('A')],'6':[row('A'),row('Ленард')]}),['6'])
 def test_the_watchers_own_time_stamp_is_not_a_change(self):
  snapshot={'teams':{'0':{'journal':[{**row('A'),'seenAt':'2026-10-20T10:00:00+00:00'}]}}}
  self.assertEqual(changed_teams(snapshot,{'0':[row('A')]}),[])
 def test_unknown_team_counts_as_new(self):
  self.assertEqual(changed_teams({'teams':{}},{'3':[row('A')]}),['3'])
 def test_shorter_journal_is_a_bad_read_not_a_change(self):
  self.assertEqual(changed_teams({'teams':{'1':{'journal':[row('A'),row('B')]}}},{'1':[row('A')]}),[])
 def test_stale_data_alerts_once_and_on_recovery(self):
  import scripts.season_watch as sw
  sent=[];real=sw.telegram;sw.telegram=sent.append
  try:
   w=sw.Watch('a','b')
   for ok in [False,False,False,False,False,True,True]:w.collected(ok)
  finally:sw.telegram=real
  self.assertEqual(len(sent),2);self.assertIn('⚠️',sent[0]);self.assertIn('✅',sent[1])
 def test_an_unchanged_read_is_remembered_and_a_changed_one_is_not(self):
  snapshot={'teams':{'0':{'journal':[{**row('A'),'seenAt':'x','seenAfter':'y'}]},'1':{'journal':[row('A')]}}}
  mark_read(snapshot,{'0':[row('A')],'1':[row('A'),row('B')]})
  self.assertIn('journalReadAt',snapshot['teams']['0']);self.assertNotIn('journalReadAt',snapshot['teams']['1'])
 def test_reordered_rows_of_one_date_are_not_a_change(self):
  a,b={**row('A'),'seenAt':'x'},row('B')
  self.assertEqual(changed_teams({'teams':{'0':{'journal':[a,b]}}},{'0':[row('B'),row('A')]}),[])
