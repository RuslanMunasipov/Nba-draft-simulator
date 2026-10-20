import json
import math
import statistics
import unittest
from pathlib import Path
from scripts import projection_model as pm


def game(pid, season, n, minutes=30.0, pts=20, team='AAA', won=True):
    return dict(player_id=pid, season=season, game_id=f'{season}-{team}-{n}', team=team, home=n % 2 == 0, result='W' if won else 'L',
                minutes=minutes, pts=pts, reb=5, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=8, fga=16, ftm=3, fta=4)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        rows = [game('1', 2024, i) for i in range(60)] + [game('1', 2026, i) for i in range(70)] + [game('2', 2026, i, minutes=8, pts=2) for i in range(20)]
        seasons, team_games, bonus = pm.season_table(rows, lambda r: r['player_id'])
        self.h = pm.History(seasons, team_games, {'1': '1998-01-01'})

    def test_a_season_missed_after_the_debut_counts_as_zero_games(self):
        x = self.h.features('1', 2027)
        self.assertEqual([p['games'] if p else None for p in x['past']], [70, 0, 60])
        self.assertEqual(self.h.target('1', 2025)['games'], 0)
        self.assertIsNone(self.h.features('2', 2026))  # no season before the target

    def test_rate_is_the_sports_formula_without_the_result_bonus(self):
        y = self.h.target('1', 2026)
        self.assertAlmostEqual(y['rate'], 20 + 5 + 3 + 1 + 1 - 8 - 1 - 4 - 2 + 2)
        short = self.h.target('2', 2026)
        self.assertEqual(short['short'], 1.0)
        self.assertAlmostEqual(short['rate'], 2 + 5 + 3 + 1 + 1 - 8 - 1 - 4 - 2 + 1)

    def test_age_is_measured_at_the_season_start(self):
        self.assertAlmostEqual(self.h.age('1', 2027), 28.8, places=1)
        self.assertIsNone(self.h.age('2', 2027))


class StatLineTests(unittest.TestCase):
    def test_components_add_up_to_the_forecast(self):
        p = dict(short=.1, stats=dict(pts=20, reb=8, ast=4, stl=1, blk=1, tov=3, pf=2.5, fgm=7, fga=15, ftm=5, fta=6))
        line, comp = pm.stat_line(p, None, {}, rate=22.0, bonus=.4)
        self.assertAlmostEqual(sum(comp.values()), 22.0)
        self.assertAlmostEqual(comp['countingAndMisses'], pm.terms(line))
        self.assertAlmostEqual(comp['personalFouls'], -2.5)


class RookieTests(unittest.TestCase):
    def test_earlier_picks_project_more(self):
        rows = [dict(pick=k, rate=20 - 3 * math.log(k), minutes=30 - 4 * math.log(k), share=.9 - .1 * math.log(k), games=50, perMinuteStats=None) for k in range(1, 61)]
        rows.append(dict(pick=None, rate=4, minutes=10, share=.2, games=10, perMinuteStats=None))
        model = pm.Rookie(rows)
        self.assertGreater(model.predict(1)['rate'], model.predict(30)['rate'])
        self.assertAlmostEqual(model.predict(None)['rate'], 4)
        self.assertLessEqual(model.predict(1)['share'], 1)


class SlotValueTests(unittest.TestCase):
    def test_only_long_absences_after_the_delay_are_replaced(self):
        o = dict(games=60, start=5, gaps=[1, 2, 3, 10, 0], end=4)
        d = pm.av.REPLACE_DELAY
        self.assertEqual(pm.actual_replaced(o, 82), (5 - d) + (10 - d) + (4 - d))
        self.assertEqual(pm.actual_replaced(None, 82), 82 - d)  # a season without games

    def test_replacement_level_is_the_best_left_after_the_roster_spots(self):
        self.assertEqual(pm.replacement_rate(list(range(100)), rostered=80, depth=4), statistics.mean([19, 18, 17, 16]))


class HeldOutModelTests(unittest.TestCase):
    """The committed career logs must keep the model ahead of persistence on the untouched season."""
    @classmethod
    def setUpClass(cls):
        if not Path('public/data/default-draft.json').exists():
            raise unittest.SkipTest('needs the built catalog for the forecast population')
        cls.report = pm.run()

    def test_beats_persistence_on_the_held_out_season(self):
        h = self.report['holdout']
        self.assertGreater(h['pairedGain95'][0], 0)
        self.assertLess(h['perGameMAE'], h['persistencePerGameMAE'])
        self.assertLess(h['gamesMAE'], h['persistenceGamesMAE'])
        self.assertLess(h['shortSeasonBrier'], h['shortSeasonBaseRateBrier'])

    def test_range_has_a_real_floor_and_reasonable_coverage(self):
        h = self.report['holdout']
        self.assertGreater(h['medianFloorShare'], .2)
        self.assertGreater(h['coverage80'], .65)
        self.assertLess(h['coverage80'], .92)

    def test_slot_value_with_replacements_ranks_slots_better(self):
        t = self.report['holdout']['transferValue']
        self.assertGreater(t['slotSpearman']['withReplacements'], t['slotSpearman']['ownForecast'])
        self.assertGreaterEqual(t['top40SlotPoints']['withReplacements'], t['top40SlotPoints']['ownForecast'])

    def test_rookie_draft_model_beats_a_flat_prior(self):
        for key in ('rate', 'minutes', 'share'):
            r = self.report['rookies']['holdout'][key]
            self.assertLess(r['modelMAE'], r['flatPriorMAE'])


if __name__ == '__main__':
    unittest.main()
