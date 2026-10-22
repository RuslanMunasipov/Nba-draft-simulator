"""The slimmed site database keeps every field a page or a bot reads (scripts/slim_database.py)."""
import re,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import slim_database as s

ROOT=Path(__file__).resolve().parent.parent
CODE=''.join(p.read_text(encoding='utf-8') for p in [*ROOT.glob('src/**/*.js'),ROOT/'scripts/notify-transfers.mjs',*ROOT.glob('awards-bot/*.js'),*ROOT.glob('awards-bot/*.mjs')])

class SlimDatabase(unittest.TestCase):
    def test_no_dropped_field_is_read_by_the_site_or_the_bots(self):
        for name in s.AUDITS+s.PLAYER_FIELDS+s.FORECAST_FIELDS:
            self.assertIsNone(re.search(r'\b'+name+r'\b',CODE),f'{name} is read by the site or a bot: it must stay in the database')

    def test_audits_move_out_and_numbers_keep_four_decimals(self):
        data={'generatedAt':'x','forecastAudit':{'a':1},'players':[{'id':1,'rosterSource':'u','forecast':{'meanPerGame':31.461775144035716,'asOf':'t','availability':{'hazards':[0.0661234567,0.018]}}}]}
        out,audits=s.slim(data)
        self.assertEqual(audits,{'forecastAudit':{'a':1}})
        self.assertNotIn('forecastAudit',out)
        p=out['players'][0];self.assertNotIn('rosterSource',p);self.assertNotIn('asOf',p['forecast'])
        self.assertEqual(p['forecast']['meanPerGame'],31.4618);self.assertEqual(p['forecast']['availability']['hazards'],[0.0661,0.018])

if __name__=='__main__':unittest.main()
