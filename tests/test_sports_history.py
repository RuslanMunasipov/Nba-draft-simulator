import sys,unittest
sys.path.insert(0,'scripts')
from apply_sports_history import attach

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

if __name__=='__main__':unittest.main()
