import json,unittest
from scripts.season_watch import changed_teams,mark_read,merge_full
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
 def test_league_feed_goes_first_and_is_saved_at_once(self):
  import scripts.season_watch as sw
  calls=[];w=sw.Watch('a','b')
  w.feed=lambda:calls.append('feed');w.personal=lambda:calls.append('personal');w.publish=lambda m:calls.append('publish')
  w.notify()
  self.assertEqual(calls,['feed','publish','personal'])
 def test_a_full_collection_keeps_the_journal_the_watcher_read_meanwhile(self):
  a={**row('A'),'seenAt':'t1','seenAfter':'t0'};b={**row('B'),'seenAt':'t3','seenAfter':'t2'}
  cur={'teams':{'0':{'journal':[a,b],'journalReadAt':'t4'}}}
  # The collection read the journal before B arrived: the watcher's rows and times stand.
  full={'teams':{'0':{'journal':[row('A')],'journalReadAt':'t1b','balance':5}}}
  out=merge_full(full,cur)['teams']['0'];self.assertEqual(out['journal'],[a,b]);self.assertEqual(out['journalReadAt'],'t4');self.assertEqual(out['balance'],5)
  # A row only the collection saw is new, stamped between the watcher's last read and the collection's.
  full={'teams':{'0':{'journal':[row('A'),row('C')],'journalReadAt':'t5'}}}
  out=merge_full(full,{'teams':{'0':{'journal':[a],'journalReadAt':'t4'}}})['teams']['0']
  self.assertEqual((out['journal'][0]['seenAt'],out['journal'][1]['seenAt'],out['journal'][1]['seenAfter']),('t1','t5','t4'))
 def test_a_failed_feed_is_retried_soon_and_then_less_often(self):
  import scripts.season_watch as sw,time
  w=sw.Watch('a','b');w.publish=lambda m:None;w.personal=lambda:True
  w.feed=lambda:False;w.notify()
  self.assertFalse(w.retry);self.assertAlmostEqual(w.retry_at-time.time(),60,delta=2)
  w.notify();self.assertAlmostEqual(w.retry_at-time.time(),120,delta=2)
  w.retry_at=time.time()-1;self.assertTrue(w.retry)
  w.feed=lambda:True;w.notify();self.assertIsNone(w.retry_at);self.assertEqual(w.failed,0)
 def test_new_rows_take_the_read_start_as_next_lower_bound_and_new_market_players_come_from_the_roster(self):
  import json as _json,scripts.season_watch as sw
  real=sw.sports.fetch
  sw.sports.fetch=lambda url:_json.dumps({'players':[{'id':77,'name':'Новый','club':'Бостон','amplua':'1','price':'900','lock':'0'}]}) if 'roster' in url.lower() or 'squad' in url.lower() or url==sw.sports.ROSTER_URL.format(id='s0') else None
  try:
   snapshot={'players':{},'teams':{'0':{'journal':[row('A')],'journalReadAt':'t0'}}}
   sw.apply(snapshot,{'0':[row('A'),row('Новый')]},['0'],{'0':'s0'},'t1')
  finally:sw.sports.fetch=real
  t=snapshot['teams']['0']
  self.assertEqual(t['journalReadAt'],'t1');self.assertEqual(t['journal'][1]['seenAfter'],'t0');self.assertGreater(t['journal'][1]['seenAt'],'2026')
  self.assertEqual(snapshot['players']['77']['price'],900);self.assertEqual(snapshot['players']['77']['name'],'Новый')
 def test_a_re_paired_day_is_no_change_and_fewer_events_a_failed_read(self):
  r=lambda s,b:{'date':'2026-10-20','sell':s and {'name':s,'price':1},'buy':b and {'name':b,'price':1}}
  stored=[{**r('J','O'),'seenAt':'t1'},{**r('K','E'),'seenAt':'t2'}]
  snapshot={'teams':{'0':{'journal':stored}}}
  # Sports.ru shows the day's two deals paired the other way: the same events, nothing new.
  self.assertEqual(changed_teams(snapshot,{'0':[r('J','E'),r('K','O')]}),[])
  mark_read(snapshot,{'0':[r('J','E'),r('K','O')]},'t3');self.assertEqual(snapshot['teams']['0']['journalReadAt'],'t3')
  # More rows but fewer events (E missing) is a misread, never a reversal.
  self.assertEqual(changed_teams(snapshot,{'0':[r('J',None),r(None,'O'),r('K',None)]}),[])
  self.assertEqual(changed_teams(snapshot,{'0':[r('J','E'),r('K','O'),r('L','M')]}),['0'])
 def test_a_full_collection_that_saw_the_day_re_paired_keeps_the_watchers_pairing(self):
  r=lambda s,b:{'date':'2026-10-20','sell':{'name':s,'price':1},'buy':{'name':b,'price':1}}
  jo={**r('J','O'),'seenAt':'t1','seenAfter':'t0','sellSid':'j','buySid':'o'};ke={**r('K','E'),'seenAt':'t3','seenAfter':'t2'}
  out=merge_full({'teams':{'0':{'journal':[r('J','E'),r('K','O')],'journalReadAt':'t2b'}}},{'teams':{'0':{'journal':[jo,ke],'journalReadAt':'t4'}}})['teams']['0']
  self.assertEqual(out['journal'],[jo,ke])
  # A deal only the collection saw, on a re-paired day: the watcher's deal stands, the new one is K→E.
  out=merge_full({'collectedAt':'t5','teams':{'0':{'journal':[r('J','E'),r('K','O')],'journalReadAt':'t5'}}},{'teams':{'0':{'journal':[jo],'journalReadAt':'t4'}}})['teams']['0']
  self.assertEqual(out['journal'],[jo,{**r('K','E'),'seenAt':'t5','seenAfter':'t4'}])
 def test_a_team_whose_roster_cannot_be_read_is_held_and_applied_on_the_third_read(self):
  import scripts.season_watch as sw
  real=sw.sports.fetch;roster={'raw':None}
  def fetch(url):
   if url!=sw.sports.ROSTER_URL.format(id='s0'):return None
   if roster['raw'] is None:raise RuntimeError('timeout')
   return roster['raw']
  base={'players':{},'teams':{'0':{'journal':[row('A')],'journalReadAt':'t0','roster':[{'sportsId':'x','name':'X','price':1500}]}}}
  sw.sports.fetch=fetch
  try:
   held={};snap=json.loads(json.dumps(base))
   # Failed, then empty: the journal stays as it was (the next read reports the team again).
   sw.apply(snap,{'0':[row('A'),row('Уайт')]},['0'],{'0':'s0'},'t1',held);self.assertEqual(snap['teams']['0'],base['teams']['0']);self.assertEqual(held,{'0':1})
   self.assertEqual(changed_teams(snap,{'0':[row('A'),row('Уайт')]}),['0'])
   roster['raw']='{"players":[]}'
   sw.apply(snap,{'0':[row('A'),row('Уайт')]},['0'],{'0':'s0'},'t2',held);self.assertEqual(snap['teams']['0'],base['teams']['0']);self.assertEqual(held,{'0':2})
   # The third such read applies the rows without the exact players (the stored roster stays).
   roster['raw']=None
   sw.apply(snap,{'0':[row('A'),row('Уайт')]},['0'],{'0':'s0'},'t3',held);t=snap['teams']['0']
   self.assertEqual(held,{});self.assertEqual(len(t['journal']),2);self.assertEqual(t['journal'][1]['seenAfter'],'t0');self.assertNotIn('buySid',t['journal'][1])
   self.assertEqual(t['roster'],base['teams']['0']['roster'])
   # A roster read at last: the rows go in with the exact players and the count is cleared.
   held={'0':2};snap=json.loads(json.dumps(base))
   roster['raw']=json.dumps({'players':[{'id':'w2','name':'Уайт','club':'Чикаго','amplua':'2','price':'1500','lock':'0'}]})
   sw.apply(snap,{'0':[row('A'),row('Уайт')]},['0'],{'0':'s0'},'t1',held)
   self.assertEqual(held,{});self.assertEqual(snap['teams']['0']['journal'][1]['buySid'],'w2')
  finally:sw.sports.fetch=real
 def test_the_run_hands_over_when_its_branch_moved_on_github(self):
  import scripts.season_watch as sw,subprocess
  calls=[]
  def run(cmd,**kw):
   calls.append((cmd,kw));return subprocess.CompletedProcess(cmd,0,'abc123\trefs/heads/main\n','')
  # Local runs never check.
  self.assertIsNone(sw.main_moved({},run));self.assertIsNone(sw.main_moved({'GITHUB_SHA':'abc123'},run));self.assertEqual(calls,[])
  env={'GITHUB_SHA':'abc123','GITHUB_REPOSITORY':'o/r'}
  self.assertIsNone(sw.main_moved(env,run))
  self.assertEqual(calls[0][0],['git','ls-remote','https://github.com/o/r.git','refs/heads/main']);self.assertEqual(calls[0][1]['timeout'],30)
  self.assertEqual(sw.main_moved({**env,'GITHUB_SHA':'old'},run),'abc123')
  # The run's own branch is the one compared (the next run starts on it).
  sw.main_moved({**env,'GITHUB_REF_NAME':'test'},run);self.assertEqual(calls[-1][0][-1],'refs/heads/test')
  # A failed check is no news.
  def boom(cmd,**kw):raise subprocess.TimeoutExpired(cmd,30)
  self.assertIsNone(sw.main_moved({**env,'GITHUB_SHA':'old'},boom))
  self.assertIsNone(sw.main_moved({**env,'GITHUB_SHA':'old'},lambda cmd,**kw:subprocess.CompletedProcess(cmd,128,'','fatal')))
  self.assertIsNone(sw.main_moved({**env,'GITHUB_SHA':'old'},lambda cmd,**kw:subprocess.CompletedProcess(cmd,0,'','')))
