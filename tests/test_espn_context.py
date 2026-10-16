import unittest
from scripts.espn_context import parse_context

class ESPNContextTests(unittest.TestCase):
    def fixture(self):
        return {'players':[{'player':{'id':123,'ownership':{'averageDraftPosition':69.26},'stats':[{'seasonId':2027,'statSourceId':1,'statSplitTypeId':0,'scoringPeriodId':0,'stats':{'42':54,'0':1080,'3':270,'6':540},'averageStats':{'0':20,'3':5,'6':10}}]}}]}
    def test_distinct_source_metrics(self):
        result=parse_context(self.fixture(),'2026-10-16')['123']
        self.assertEqual(result['projectedGames'],54);self.assertEqual(result['adp'],69.26);self.assertNotIn('projectedFP',result)
    def test_historical_actuals_never_become_future_projections(self):
        data=self.fixture();data['players'][0]['player']['stats'][0]['statSourceId']=0
        self.assertIsNone(parse_context(data,'date')['123']['projectedGames'])
    def test_inconsistent_game_denominator_rejected(self):
        data=self.fixture();data['players'][0]['player']['stats'][0]['stats']['42']=82
        self.assertIsNone(parse_context(data,'date')['123']['projectedGames'])
    def test_invalid_adp_is_missing_not_free(self):
        data=self.fixture();data['players'][0]['player']['ownership']['averageDraftPosition']=0
        self.assertIsNone(parse_context(data,'date')['123']['adp'])
    def test_personal_component_projection_has_no_invented_pf_or_bonuses(self):
        data=self.fixture();s=data['players'][0]['player']['stats'][0]
        s['stats'].update({'1':54,'2':54,'11':108,'13':432,'14':864,'15':108,'16':162,'17':108,'40':1728})
        # 2*432 + 108 + 108 = 1080 points.
        result=parse_context(data,'date')['123']['individualProjection']
        self.assertEqual(result['componentSeasonTotal'],1080+540+270+54+54-432-54-216)
        self.assertEqual(result['perGame']['minutes'],32);self.assertNotIn('fouls',result['perGame'])
    def test_inconsistent_points_identity_rejects_individual_projection(self):
        data=self.fixture();s=data['players'][0]['player']['stats'][0]
        s['stats'].update({'1':54,'2':54,'11':108,'13':1,'14':864,'15':108,'16':162,'17':108,'40':1728})
        self.assertIsNone(parse_context(data,'date')['123']['individualProjection'])
