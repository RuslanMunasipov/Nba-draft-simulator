import random
import unittest
from datetime import date, timedelta
import numpy as np
from scripts import availability_model as av
from scripts import projection_model as pm

def row(pid, season, i, team='AAA'):
    return dict(player_id=pid, season=season, game_id=f'{season}-{i}', team=team, date=(date(season - 1, 10, 20) + timedelta(days=2 * i)).isoformat(),
                home=i % 2 == 0, result='W', minutes=30.0, pts=20, reb=5, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=8, fga=16, ftm=3, fta=4)


def league(seasons=range(2020, 2026), players=40, seed=3):
    """A full club calendar (the iron man '0') and players who miss games at random spells."""
    rng = random.Random(seed); rows = []
    for s in seasons:
        rows += [row('0', s, i) for i in range(82)]
        for p in range(1, players):
            i = 0
            while i < 82:
                if rng.random() < .02 + .002 * p:
                    i += rng.choice([1, 1, 2, 3, 6, 15]); continue
                rows.append(row(str(p), s, i)); i += 1
    return rows


class SpellTests(unittest.TestCase):
    def test_gaps_are_counted_in_club_games_with_both_season_edges(self):
        played = [i for i in range(82) if not (10 <= i <= 12 or 40 <= i <= 49 or i >= 80 or i < 2)]
        rows = [row('0', 2026, i) for i in range(82)] + [row('7', 2026, i) for i in played]
        o = av.spells(rows)[('7', 2026)]
        self.assertEqual((o['games'], o['start'], o['end']), (len(played), 2, 2))
        self.assertEqual(sorted(g for g in o['gaps'] if g), [3, 10])
        self.assertEqual(av.counts(o), (2, 1, len(played)))  # spells of 3 and 2 games are short, 10 is long

    def test_length_pmf_is_a_distribution_on_its_own_range(self):
        table = av.spells(league())
        for kind, lo in (('short', 1), ('long', av.SHORT + 1)):
            pmf = av.length_pmf(table, set(range(2020, 2026)), kind)
            self.assertAlmostEqual(sum(pmf), 1)
            self.assertEqual(sum(pmf[:lo]), 0)


class ChainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows = league()
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        cls.history = pm.History(seasons, team_games, {})
        cls.table = av.spells(rows)
        cls.chain = av.Availability(cls.table, cls.history, set(range(2020, 2026)))

    def test_pmf_sums_to_one_and_the_mean_is_anchored(self):
        for target in (40.0, 70.0):
            pmf, info = self.chain.distribution('5', 2026, mean=target)
            self.assertAlmostEqual(pmf.sum(), 1, places=9)
            self.assertAlmostEqual(float((pmf * np.arange(len(pmf))).sum()), target, delta=.3)
            self.assertGreater(info['scale'], 0)

    def test_more_absences_in_the_record_mean_more_spells_ahead(self):
        sound = self.chain.hazards('2', 2026); fragile = self.chain.hazards('38', 2026)
        self.assertLess(sound[0] + sound[1], fragile[0] + fragile[1])
        mean = lambda pid: float((lambda pmf: (pmf * np.arange(len(pmf))).sum())(self.chain.distribution(pid, 2026)[0]))
        self.assertGreater(mean('2'), mean('38') + 2)

    def test_a_known_healthy_start_never_lowers_the_forecast(self):
        for pid in ('5', '38'):
            self.assertGreaterEqual(self.chain.healthy_mean(pid, 2026, 60.0), 60.0 - 1e-6)
        pmf, _ = self.chain.distribution('38', 2026, mean=60.0, healthy=True)
        self.assertAlmostEqual(float((pmf * np.arange(len(pmf))).sum()), 60.0, delta=.3)

    def test_exact_chain_matches_simulation(self):
        c = av.Availability(self.table, self.history, set(range(2020, 2026)))
        c.frailty = np.array([1.0]); hs, hl, _ = c.hazards('20', 2026)
        pmf, _ = c.distribution('20', 2026, L=82)
        init = c._init('20', 2026, 82); rng = np.random.default_rng(1); sims = []
        for _ in range(20000):
            r = rng.choice(len(init), p=init); g = 0
            for _ in range(82):
                if r: r -= 1; continue
                u = rng.random()
                if u < hs: r = rng.choice(83, p=c.fs) - 1
                elif u < hs + hl: r = rng.choice(83, p=c.fl) - 1
                else: g += 1
            sims.append(g)
        self.assertAlmostEqual(float((pmf * np.arange(len(pmf))).sum()), float(np.mean(sims)), delta=.3)
        self.assertAlmostEqual(float(pmf[:41].sum()), float(np.mean(np.array(sims) <= 40)), delta=.01)


if __name__ == '__main__':
    unittest.main()
