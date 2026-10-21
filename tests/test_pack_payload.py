"""The phone payload keeps what the app reads; provenance moves to the per-player files."""
import json,subprocess,sys,tempfile,unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parent.parent/'scripts/pack_online_evidence.py'

class PackPayload(unittest.TestCase):
    def test_input_stats_and_previous_forecast_move_to_the_player_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp,'public/data');data.mkdir(parents=True)
            forecast=dict(metric='FBL_FULL_FORMULA_ESTIMATE',meanPerGame=12.3456789,games=70.0,inputStats=dict(pts=10.0),previous=dict(origin='X',meanPerGame=11.0,games=60.0))
            data.joinpath('default-draft.json').write_text(json.dumps(dict(season='2026-27',generatedAt='t',players=[dict(id='espn:1',name='A',forecast=forecast)])))
            subprocess.run([sys.executable,str(SCRIPT)],cwd=tmp,check=True,capture_output=True)
            packed=json.loads(data.joinpath('default-draft.json').read_text())['players'][0]['forecast']
            self.assertNotIn('inputStats',packed);self.assertNotIn('previous',packed)
            self.assertEqual(packed['meanPerGame'],12.3456789)
            detail=json.loads(data.joinpath('players/espn-1.json').read_text())['forecastDetail']
            self.assertEqual(detail,dict(inputStats=dict(pts=10.0),previous=dict(origin='X',meanPerGame=11.0,games=60.0)))

if __name__=='__main__':unittest.main()
