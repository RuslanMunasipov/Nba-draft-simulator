import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from apply_positions import parse_positions,apply
class PositionTests(unittest.TestCase):
 def test_only_explicit_position_cells_are_accepted(self):
  html='<table><tr><th>Rank</th><th>Player</th><th>Position</th><th>Team</th></tr><tr><td>1</td><td><a>Nikola Jokić</a></td><td>C</td><td>DEN</td></tr><tr><td>2</td><td>Kevin Durant</td><td>PF, SF, SG</td><td>HOU</td></tr><tr><td>3</td><td>Unusable</td><td>G</td><td>ABC</td></tr></table>'
  rows=parse_positions(html);self.assertEqual(len(rows),2)
  self.assertEqual(rows[1]['positions'],['PF','SF','SG'])
 def test_position_update_does_not_copy_editorial_ranks_or_override_team_and_stats(self):
  player=dict(name='Nikola Jokic',positions=['SF'],team='DEN',forecast={'meanSeason':2000})
  data=dict(players=[player],generatedAt='2026-10-17')
  report=apply(data,[dict(name='Nikola Jokić',positions=['C'])])
  self.assertEqual(report['matchedPlayers'],1);self.assertEqual(player['positions'],['C'])
  self.assertEqual(player['team'],'DEN');self.assertEqual(player['forecast']['meanSeason'],2000)
  self.assertFalse(report['platformEligibilityVerified'])

 def test_unmatched_espn_position_never_becomes_yahoo_eligibility(self):
  player=dict(name='Unmatched',positions=['PG'],positionStatus='ESTIMATED_FROM_ESPN_NOT_YAHOO')
  apply(dict(players=[player],generatedAt='date'),[])
  self.assertEqual(player['positions'],[])
  self.assertEqual(player['positionStatus'],'MISSING')
