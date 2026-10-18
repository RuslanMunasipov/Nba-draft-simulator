import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from complete_forecasts import complete
class IntervalRegressionTests(unittest.TestCase):
 def test_positive_floor_and_source_specific_uncertainty(self):
  stats=dict(pts=20,reb=5,ast=4,stl=1,blk=1,tov=2,pf=2,fgm=8,fga=16,ftm=4,fta=5,minutes=30)
  players=[]
  for i in range(1,3):
   players.append(dict(id=i,nbaId=i,name='Synthetic '+str(i),positions=['PG'],currentRosterStatus='SOURCE_REPORTED',careerPrediction=dict(perGame=stats,games=60,eligibleForPrimary=True,historySeasons=6,firstSeason='2020-21',lastSeason='2025-26',seasonError80=100*i,intervalCohort='LATER_CAREER')))
  data=dict(players=players,generatedAt='2026-10-18',forecastAudit=dict(coverage={}),careerModelAudit=dict(validation=dict(error80=9999)))
  history=dict(players=[dict(id=i,seasons={'2025-26':dict(averages=stats,games=60)}) for i in range(1,3)])
  complete(data,history)
  for p in players:
   f=p['forecast'];self.assertGreater(f['seasonFloor'],0)
   self.assertLessEqual(f['seasonFloor'],f['meanSeason']);self.assertLessEqual(f['meanSeason'],f['seasonCeiling'])
   self.assertEqual(f['meanSeason']-f['seasonFloor'],100*p['id'])
   self.assertNotEqual(f['intervalCalibration'],'P10_P90')
