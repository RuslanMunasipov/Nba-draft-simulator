import unittest
from scripts.audit_scoring import terms,close,audit,external_check,sports_result_bonus
from scripts.build_forecasts import full
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

STATS=dict(pts=10,reb=5,ast=2,stl=1,blk=0,fgm=4,fga=9,ftm=2,fta=2,tov=1)
def forecast(mean):
 # Counting terms 11, fouls -2, participation +2: the components add up to 11 a game.
 return dict(inputStats=STATS,origin='CAREER_MODEL',components=dict(countingAndMisses=11,fouls=-2,participation=2),meanPerGame=mean,games=10,meanSeason=mean*10)
def row(game,player,team,opp,home,pts,minutes=30,**k):
 return dict(dict(game_id=game,player_id=player,player_name=str(player),team=team,opponent=opp,home=home,minutes=minutes,pts=pts,
                  reb=4,ast=3,stl=1,blk=0,fgm=pts//2,fga=pts//2+3,ftm=0,fta=1,tov=2,pf=3),**k)

class ScoringChecks(unittest.TestCase):
 def test_consistency_check_counts_mismatches_instead_of_a_constant_zero(self):
  good=audit({'generatedAt':'t','players':[{'id':1,'name':'A','forecast':forecast(11)}]},{})
  self.assertEqual((good['status'],good['mismatches'],good['check']),('PASS',0,'CONSISTENCY'))
  # A forecast whose components do not add up to its per-game value is reported, not hidden behind a literal 0.
  bad=audit({'generatedAt':'t','players':[{'id':1,'name':'A','forecast':forecast(12)}]},{})
  self.assertEqual(bad['status'],'FAIL');self.assertGreaterEqual(bad['mismatches'],1);self.assertIn('A full',bad['mismatchExamples'][0])

 def test_external_check_against_sports_ru_season_totals(self):
  self.assertEqual([sports_result_bonus(True,True),sports_result_bonus(False,True),sports_result_bonus(True,False),sports_result_bonus(False,False)],[2,3,-3,-2])
  rows=[row('g1',1,'AAA','BBB',True,20),row('g1',9,'BBB','AAA',False,10),     # home win: +2
        row('g2',1,'AAA','CCC',False,16),row('g2',8,'CCC','AAA',True,12),     # away win: +3
        row('g3',2,'BBB','AAA',True,8,minutes=8),row('g3',7,'AAA','BBB',False,14)]
  player1=[r for r in rows if r['player_id']==1]
  data={'players':[{'sportsId':'S1','nbaId':1},{'sportsId':'S2','nbaId':2},{'sportsId':'S3','nbaId':3}]}
  history={'players':{'S1':{'seasons':{'2025-26':{'games':2,'points':sum(full(r) for r in player1)+5}}},
                      'S2':{'seasons':{'2025-26':{'games':1,'points':full(rows[4])-3+1}}},   # home loss -3, one point off
                      'S3':{'seasons':{'2025-26':{'games':5,'points':100}}}}}                  # no logs: not compared
  report=external_check(data,{'2025-26':rows},history)
  self.assertEqual((report['playerSeasons'],report['exact'],report['within2']),(2,1,2))
  self.assertEqual(report['meanAbsWithoutBonus'],3.5)   # |+5| and |-2| when the bonus is left out
  self.assertEqual(report['bySeason']['2025-26']['playerSeasons'],2)
  self.assertEqual(report['status'],'FAIL')             # too few player-seasons to vouch for the rule
  # The minutes rule enters through full(): an 8-minute game earns +1, so a Sports.ru +2 there would be off by one.
  self.assertEqual(full(rows[4])-full(dict(rows[4],minutes=10)),-1)

if __name__=='__main__':unittest.main()
