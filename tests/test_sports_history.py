import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,'scripts')
from apply_sports_history import attach,result_bonus,result_bonuses

class SportsHistory(unittest.TestCase):
    def test_attaches_by_sports_id_and_flags_large_forecast_gaps(self):
        db={'players':[{'id':1,'sportsId':'10','forecast':{'meanPerGame':40.0}},{'id':2,'sportsId':'20','forecast':{'meanPerGame':30.5}},{'id':3,'sportsId':None}]}
        history={'players':{'10':{'seasons':{'2025-26':{'games':60,'points':1800,'perGame':30.0},'2024-25':{'games':10,'points':400,'perGame':40.0}}},
                            '20':{'seasons':{'2025-26':{'games':70,'points':2100,'perGame':30.0}}}}}
        report=attach(db,history)
        self.assertEqual(report['attached'],2);self.assertEqual(report['flagged'],1)
        self.assertEqual(list(db['players'][0]['sportsHistory']),['2024-25','2025-26'])
        self.assertTrue(db['players'][0]['sportsCheck']['flag']);self.assertEqual(db['players'][0]['sportsCheck']['season'],'2025-26')
        self.assertFalse(db['players'][1]['sportsCheck']['flag']);self.assertNotIn('sportsHistory',db['players'][2])
        self.assertEqual(db['players'][0]['sportsCheck']['basis'],'SPORTS_WITH_RESULT_BONUS')

    def test_a_replaced_card_keeps_the_seasons_of_its_old_id(self):
        db={'players':[{'id':1,'sportsId':'new','previousSportsIds':['old'],'forecast':{'meanPerGame':30.0}}]}
        history={'players':{'new':{'seasons':{}},'old':{'seasons':{'2025-26':{'games':60,'points':1800,'perGame':30.0}}}}}
        self.assertEqual(attach(db,history)['attached'],1);self.assertEqual(list(db['players'][0]['sportsHistory']),['2025-26'])

    def test_sports_ru_result_bonus_is_removed_before_the_check(self):
        # Sports.ru 10.0 a game on a winning club (+2.0 bonus a game): FBL 8.0. A 9.5 forecast is -5% against Sports.ru's
        # number but +19% against the like-for-like FBL number; a losing club's player gets the opposite correction.
        db={'players':[{'id':1,'nbaId':101,'sportsId':'10','forecast':{'meanPerGame':9.5}},
                       {'id':2,'nbaId':102,'sportsId':'20','forecast':{'meanPerGame':12.6}}]}
        history={'players':{'10':{'seasons':{'2025-26':{'games':60,'points':600,'sportsPerGame':10.0}}},
                            '20':{'seasons':{'2025-26':{'games':60,'points':600,'sportsPerGame':10.0}}}}}
        report=attach(db,history,{('101','2025-26'):(2.0,61),('102','2025-26'):(-1.0,60)})
        first,second=db['players'][0],db['players'][1]
        self.assertEqual(first['sportsHistory']['2025-26']['perGame'],10.0)
        self.assertEqual(first['sportsHistory']['2025-26']['fblPerGame'],8.0);self.assertEqual(first['sportsHistory']['2025-26']['resultBonusPerGame'],2.0)
        self.assertEqual(first['sportsCheck']['basis'],'FBL_NO_RESULT_BONUS');self.assertEqual(first['sportsCheck']['perGame'],8.0)
        self.assertEqual(first['sportsCheck']['sportsPerGame'],10.0);self.assertAlmostEqual(first['sportsCheck']['gap'],0.1875)
        self.assertTrue(first['sportsCheck']['flag'])
        # 12.6 against Sports.ru's 10.0 would be +26% (flagged); against 11.0 without the -1.0 bonus it is +14.5%.
        self.assertFalse(second['sportsCheck']['flag']);self.assertEqual(report['flagged'],1);self.assertEqual(report['checked'],2)

    def test_no_check_without_a_bonus_for_that_season(self):
        db={'players':[{'id':1,'nbaId':101,'sportsId':'10','forecast':{'meanPerGame':20.0}},{'id':2,'nbaId':102,'sportsId':'20','forecast':{'meanPerGame':20.0}}]}
        history={'players':{'10':{'seasons':{'2025-26':{'games':60,'points':600,'sportsPerGame':10.0}}},
                            '20':{'seasons':{'2025-26':{'games':60,'points':600,'sportsPerGame':10.0}}}}}
        # Player 2's logs hold 70 games against Sports.ru's 60: not the same games, so no bonus is taken from them.
        report=attach(db,history,{('102','2025-26'):(1.0,70)})
        self.assertNotIn('sportsCheck',db['players'][0]);self.assertNotIn('sportsCheck',db['players'][1])
        self.assertNotIn('fblPerGame',db['players'][1]['sportsHistory']['2025-26'])
        self.assertEqual(report['uncheckedWithoutBonus'],2);self.assertEqual(report['checked'],0)

    def test_result_bonus_from_career_logs(self):
        self.assertEqual([result_bonus(True,True),result_bonus(False,True),result_bonus(True,False),result_bonus(False,False)],[2,3,-3,-2])
        import pyarrow as pa,pyarrow.parquet as pq
        rows=[dict(player_id='7',competition='nba',season=2026,season_type='REGULAR',home=True,result='W',minutes=30.0),
              dict(player_id='7',competition='nba',season=2026,season_type='REGULAR',home=False,result='L',minutes=12.0),
              dict(player_id='7',competition='nba',season=2026,season_type='REGULAR',home=False,result='W',minutes=0.0),
              dict(player_id='7',competition='nba',season=2026,season_type='POSTSEASON',home=False,result='W',minutes=30.0),
              dict(player_id='7',competition='nba',season=2025,season_type='REGULAR',home=False,result='W',minutes=20.0)]
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'logs.parquet';pq.write_table(pa.Table.from_pylist(rows),path)
            bonuses=result_bonuses(path)
        # (mean result bonus, games, mean extra minutes point): both 2025-26 games had 10+ minutes.
        self.assertEqual(bonuses[('7','2025-26')],(0.0,2,1.0));self.assertEqual(bonuses[('7','2024-25')],(3.0,1,1.0))

if __name__=='__main__':unittest.main()
