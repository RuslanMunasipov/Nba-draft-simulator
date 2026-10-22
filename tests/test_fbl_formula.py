"""One official formula (league owner, 22.10.2026: the only truth for FBL points): the Python copies of the pipeline give
the golden lines' numbers, the same the JS side (tests/fbl-scoring.test.js) checks for the site and the bots."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import fbl_formula
import build_forecasts

spec = importlib.util.spec_from_file_location('collector', ROOT / 'scripts' / 'collect_sports_current.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
GOLDEN = json.loads((ROOT / 'tests' / 'fixtures' / 'fbl-formula-golden.json').read_text())['lines']


class OfficialFormula(unittest.TestCase):
    def test_every_python_copy_gives_the_golden_numbers(self):
        for line in GOLDEN:
            self.assertEqual(fbl_formula.fbl_points(line), line['expected'], line['name'])
            self.assertEqual(build_forecasts.full(line), line['expected'], line['name'] + ' (build_forecasts)')
            # A Sports.ru game row: its own columns, two- and three-pointers apart (all made shots counted as twos here).
            values = dict(fgm2=line['fgm'], fga2=line['fga'], fgm3=0, fga3=0, ftm=line['ftm'], fta=line['fta'], pts=line['pts'],
                          reb=line['reb'], ast=line['ast'], stl=line['stl'], blk=line['blk'], tov=line['tov'], pf=line['pf'])
            names = {key: names[0] for key, names in collector.BOX.items()}
            col = {names[key]: i for i, key in enumerate(values)}
            cs = [str(values[key]) for key in values]
            self.assertEqual(collector.box_points(cs, col), line['expected'], line['name'] + ' (Sports.ru game row)')

    def test_the_participation_point_is_one_per_game_whatever_the_minutes(self):
        line = dict(GOLDEN[0])
        self.assertEqual(fbl_formula.fbl_points(dict(line, minutes=2)), fbl_formula.fbl_points(line))


if __name__ == '__main__':
    unittest.main()
