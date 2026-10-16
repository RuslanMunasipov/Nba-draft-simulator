import unittest
from scripts.minute_encoding import normalize_minutes
class MinuteTests(unittest.TestCase):
 def test_clock_encoding_selected_by_conservation_not_documentation(self):
  rows=[dict(game_id=1,team='A',minutes=m) for m in [30.30,40.15,50.15,59.30,59.30]]
  normalized,audit=normalize_minutes(rows,'SYNTHETIC')
  self.assertEqual(audit['encoding'],'MM_SS_NUMERIC')
  self.assertAlmostEqual(sum(r['minutes'] for r in normalized),240)
  self.assertEqual(normalized[0]['minutes'],30.5)
 def test_integer_minutes_preserved_without_imaginary_seconds(self):
  rows=[dict(game_id=1,team='A',minutes=m) for m in [29,35,42,57,72]]
  normalized,audit=normalize_minutes(rows,'SYNTHETIC')
  self.assertTrue(audit['secondsMissing'])
  self.assertEqual(normalized[0]['minutes'],29)

 def test_decimal_patch_rows_are_not_reinterpreted_as_clock_values(self):
  rows=[dict(game_id=1,team='A',minutes=m) for m in [12.816666666666666,40.51,50.59,59.21,50,26]]
  normalized,audit=normalize_minutes(rows,'SYNTHETIC')
  self.assertEqual(normalized[0]['minutes'],12.816666666666666)
  self.assertEqual(audit['preservedDecimalPatchRows'],1)
  self.assertAlmostEqual(sum(r['minutes'] for r in normalized),240)
